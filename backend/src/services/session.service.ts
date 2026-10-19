import type { Container } from 'dockerode';
import { config, isLabTemplate, type LabTemplate } from '../config.js';
import { forbidden, notFound } from '../lib/errors.js';
import { prisma } from '../prisma.js';
import { detachSession } from '../ws/attach.manager.js';
import { startCommandTail, stopCommandTail } from './commandlog.service.js';
import { docker, execInContainer } from './docker/docker.client.js';

const provisioning = new Set<string>();

function memoryMbFor(template: LabTemplate): number {
  return template === 'docker-dind' ? config.dindMemoryMb : config.basicMemoryMb;
}

function containerName(sessionId: string, studentId: string, labId: string): string {
  // Docker names must be unique; ids are cuids (lowercase alphanumerics).
  return `vlab-${studentId}-${labId}`.slice(0, 60);
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export async function isContainerRunning(containerId: string): Promise<boolean> {
  try {
    const info = await docker.getContainer(containerId).inspect();
    return Boolean(info.State?.Running);
  } catch {
    return false;
  }
}

async function removeSessionContainers(sessionId: string): Promise<void> {
  const containers = await docker.listContainers({
    all: true,
    filters: { label: [`vlab.session=${sessionId}`] },
  });
  for (const info of containers) {
    try {
      await docker.getContainer(info.Id).remove({ force: true });
    } catch {
      /* already gone */
    }
  }
}

async function containerLogTail(container: Container): Promise<string> {
  try {
    const raw = (await container.logs({ stdout: true, stderr: true, tail: 20 })) as unknown as Buffer;
    return raw
      .toString('utf8')
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
      .trim()
      .slice(0, 800);
  } catch {
    return '';
  }
}

async function waitUntilReady(container: Container, template: LabTemplate): Promise<boolean> {
  for (let i = 0; i < 90; i++) {
    const info = await container.inspect().catch(() => undefined);
    if (!info) return false;
    if (!info.State?.Running) return false;

    if (template === 'linux-basic') return true;

    // DinD is only usable once the inner daemon answers. Starting a terminal
    // or running a check before this point would fail confusingly.
    try {
      const result = await execInContainer(container.id, ['docker', 'info', '--format', '{{.ServerVersion}}'], {
        timeoutMs: 5000,
      });
      if (result.exitCode === 0) return true;
    } catch {
      /* not ready yet */
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  return false;
}

async function provisionSession(sessionId: string): Promise<void> {
  if (provisioning.has(sessionId)) return;
  provisioning.add(sessionId);

  try {
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      include: { assignment: { include: { lab: true } } },
    });
    if (!session) return;

    const lab = session.assignment.lab;
    const template: LabTemplate = isLabTemplate(lab.template) ? lab.template : 'linux-basic';
    const name = containerName(sessionId, session.studentId, lab.id);

    // Remove any leftover container from a previous attempt or reset.
    await removeSessionContainers(sessionId);

    const env = ['DOCKER_TLS_CERTDIR='];
    if (template === 'docker-dind' && config.registryMirror) {
      env.push(`VLAB_REGISTRY_MIRROR=${config.registryMirror}`);
    }

    const container = await docker.createContainer({
      Image: config.images[template],
      name,
      Labels: {
        'vlab.session': sessionId,
        'vlab.student': session.studentId,
        'vlab.lab': lab.id,
      },
      Env: env,
      HostConfig: {
        // DinD needs privileged mode for its nested daemon. The backend, not
        // the student, holds docker.sock; this flag is the lab's core feature.
        Privileged: template === 'docker-dind',
        Memory: memoryMbFor(template) * 1024 * 1024,
        NanoCpus: 1_000_000_000,
        PidsLimit: template === 'docker-dind' ? 512 : 256,
        AutoRemove: false,
        // Lets the inner dockerd reach the pull-through cache on the host.
        ExtraHosts: ['host.docker.internal:host-gateway'],
      },
    });

    await container.start();
    await prisma.session.update({
      where: { id: sessionId },
      data: { containerId: container.id, containerName: name },
    });

    const ready = await waitUntilReady(container, template);
    if (!ready) {
      const logs = await containerLogTail(container);
      throw new Error(`Container did not become ready.${logs ? ` ${logs}` : ''}`);
    }

    await prisma.session.update({
      where: { id: sessionId },
      data: {
        status: 'ready',
        readyAt: new Date(),
        lastActivityAt: new Date(),
        errorMessage: null,
      },
    });

    await startCommandTail(sessionId, container.id).catch((err) =>
      console.error(`[session] command tail failed for ${sessionId}:`, message(err)),
    );
  } catch (err) {
    const text = message(err);
    console.error(`[session] provisioning failed for ${sessionId}:`, text);
    await removeSessionContainers(sessionId).catch(() => undefined);
    await prisma.session
      .update({
        where: { id: sessionId },
        data: { status: 'error', errorMessage: text.slice(0, 1000) },
      })
      .catch(() => undefined);
  } finally {
    provisioning.delete(sessionId);
  }
}

export async function startOrReuseSession(studentId: string, assignmentId: string) {
  const assignment = await prisma.assignment.findUnique({
    where: { id: assignmentId },
    include: { class: { include: { members: true } }, lab: true },
  });
  if (!assignment) notFound('Assignment not found');
  if (!assignment.class.members.some((m) => m.studentId === studentId)) {
    forbidden('You are not enrolled in this class');
  }

  let session = await prisma.session.findUnique({
    where: { assignmentId_studentId: { assignmentId, studentId } },
  });

  if (!session) {
    session = await prisma.session.create({
      data: { assignmentId, studentId, status: 'starting' },
    });
  } else if (
    session.status === 'ready' &&
    session.containerId &&
    (await isContainerRunning(session.containerId))
  ) {
    await startCommandTail(session.id, session.containerId).catch(() => undefined);
    return session;
  }

  if (provisioning.has(session.id)) return session;

  const updated = await prisma.session.update({
    where: { id: session.id },
    data: {
      status: 'starting',
      errorMessage: null,
      startedAt: new Date(),
      readyAt: null,
      containerId: null,
      containerName: null,
    },
  });

  void provisionSession(updated.id);
  return updated;
}

export async function stopSession(sessionId: string) {
  const session = await prisma.session.findUnique({ where: { id: sessionId } });
  if (!session) notFound('Session not found');

  detachSession(sessionId);
  stopCommandTail(sessionId);
  await removeSessionContainers(sessionId);

  return prisma.session.update({
    where: { id: sessionId },
    data: { status: 'stopped', containerId: null, containerName: null },
  });
}

export async function resetSession(sessionId: string) {
  const session = await prisma.session.findUnique({ where: { id: sessionId } });
  if (!session) notFound('Session not found');

  detachSession(sessionId);
  stopCommandTail(sessionId);
  await removeSessionContainers(sessionId);
  await prisma.taskResult.deleteMany({ where: { sessionId } });

  const updated = await prisma.session.update({
    where: { id: sessionId },
    data: {
      status: 'starting',
      containerId: null,
      containerName: null,
      readyAt: null,
      errorMessage: null,
      startedAt: new Date(),
      resetCount: { increment: 1 },
    },
  });

  // Keep the log history and mark the reset so the teacher can see it happened.
  await prisma.commandLog.create({
    data: { sessionId, ts: new Date(), command: '[lab reset]' },
  });

  void provisionSession(updated.id);
  return updated;
}

export async function stopAllForClass(classId: string): Promise<{ stopped: number }> {
  const sessions = await prisma.session.findMany({
    where: { assignment: { classId }, status: { in: ['starting', 'ready', 'error'] } },
  });
  for (const session of sessions) {
    await stopSession(session.id).catch(() => undefined);
  }
  return { stopped: sessions.length };
}

export async function cleanupIdleSessions(): Promise<number> {
  const cutoff = new Date(Date.now() - config.sessionIdleMinutes * 60 * 1000);
  const stale = await prisma.session.findMany({
    where: { status: 'ready', lastActivityAt: { lt: cutoff } },
  });
  for (const session of stale) {
    console.log(`[cleanup] stopping idle session ${session.id}`);
    await stopSession(session.id).catch(() => undefined);
  }
  return stale.length;
}

/**
 * Containers outlive a backend restart, so on boot we reconcile the database
 * with the daemon: starting sessions are failed, ready ones with a dead
 * container are marked stopped.
 */
export async function reconcileOnBoot(): Promise<void> {
  await prisma.session.updateMany({
    where: { status: 'starting' },
    data: { status: 'error', errorMessage: 'Backend restarted while the lab was starting' },
  });

  const ready = await prisma.session.findMany({
    where: { status: 'ready', containerId: { not: null } },
  });
  for (const session of ready) {
    if (!session.containerId || !(await isContainerRunning(session.containerId))) {
      await prisma.session.update({
        where: { id: session.id },
        data: { status: 'stopped', containerId: null },
      });
    }
  }
}

export async function loadSessionForUser(
  sessionId: string,
  user: { id: string; role: 'teacher' | 'student' },
) {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: {
      student: true,
      results: true,
      assignment: {
        include: {
          class: true,
          lab: { include: { tasks: { orderBy: { order: 'asc' } } } },
        },
      },
    },
  });
  if (!session) notFound('Session not found');
  if (user.role === 'student' && session.studentId !== user.id) {
    forbidden('This session belongs to another student');
  }
  if (user.role === 'teacher' && session.assignment.class.teacherId !== user.id) {
    forbidden('This session is not in your class');
  }
  return session;
}

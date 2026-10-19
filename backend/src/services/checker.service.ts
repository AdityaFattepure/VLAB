import type { TaskResult } from '@prisma/client';
import { config } from '../config.js';
import { HttpError } from '../lib/errors.js';
import { prisma } from '../prisma.js';
import { evaluateCheck } from './checker.logic.js';
import { execInContainer } from './docker/docker.client.js';

// One check run at a time per session; the 30s background job and the student's
// button must not interleave execs against the same container.
const inFlight = new Map<string, Promise<TaskResult[]>>();

export function runChecks(sessionId: string, options: { onlyMissing?: boolean } = {}): Promise<TaskResult[]> {
  const existing = inFlight.get(sessionId);
  if (existing) return existing;

  const promise = doRunChecks(sessionId, options).finally(() => inFlight.delete(sessionId));
  inFlight.set(sessionId, promise);
  return promise;
}

async function doRunChecks(
  sessionId: string,
  options: { onlyMissing?: boolean },
): Promise<TaskResult[]> {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: {
      assignment: {
        include: { lab: { include: { tasks: { orderBy: { order: 'asc' } } } } },
      },
    },
  });

  if (!session) throw new HttpError(404, 'Session not found');
  if (session.status !== 'ready' || !session.containerId) {
    throw new HttpError(409, 'Lab is not ready yet');
  }

  for (const task of session.assignment.lab.tasks) {
    const previous = await prisma.taskResult.findUnique({
      where: { sessionId_taskId: { sessionId, taskId: task.id } },
    });

    // A task that has passed once stays done even if the student later deletes
    // the container; the background loop therefore has nothing to re-check.
    if (options.onlyMissing && previous?.firstPassedAt) continue;

    let passed = false;
    let output = '';

    try {
      const result = await execInContainer(
        session.containerId,
        [
          'timeout',
          '-s',
          'KILL',
          String(config.checkTimeoutSeconds),
          'bash',
          '-lc',
          task.checkCommand,
        ],
        { workdir: '/root', timeoutMs: (config.checkTimeoutSeconds + 5) * 1000 },
      );

      const verdict = evaluateCheck(
        {
          exitCode: result.exitCode,
          stdout: result.stdout,
          stderr: result.stderr,
          timedOut: result.timedOut,
        },
        {
          expectedExitCode: task.expectedExitCode,
          expectedOutputContains: task.expectedOutputContains,
        },
        config.checkTimeoutSeconds,
      );
      passed = verdict.passed;
      output = verdict.output;
    } catch (err) {
      output = `Check failed to run: ${err instanceof Error ? err.message : String(err)}`;
    }

    const now = new Date();
    await prisma.taskResult.upsert({
      where: { sessionId_taskId: { sessionId, taskId: task.id } },
      update: {
        passed,
        checkedAt: now,
        output,
        // Never clear a previous first pass: completion is durable.
        ...(passed && !previous?.firstPassedAt ? { firstPassedAt: now } : {}),
      },
      create: {
        sessionId,
        taskId: task.id,
        passed,
        checkedAt: now,
        output,
        firstPassedAt: passed ? now : null,
      },
    });
  }

  await prisma.session.update({
    where: { id: sessionId },
    data: { lastActivityAt: new Date() },
  });

  return prisma.taskResult.findMany({
    where: { sessionId },
    orderBy: { task: { order: 'asc' } },
  });
}

export async function checkAllReadySessions(): Promise<void> {
  const sessions = await prisma.session.findMany({
    where: { status: 'ready', containerId: { not: null } },
    select: { id: true },
  });

  for (const session of sessions) {
    await runChecks(session.id, { onlyMissing: true }).catch((err) =>
      console.error(`[checker] ${session.id}:`, err instanceof Error ? err.message : err),
    );
  }
}

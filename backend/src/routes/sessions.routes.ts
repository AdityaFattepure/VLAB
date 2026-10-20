import { Router, type Request } from 'express';
import { badRequest, conflict, forbidden } from '../lib/errors.js';
import { param, reqString } from '../lib/validate.js';
import { currentUser, requireAuth, requireRole } from '../middleware/auth.js';
import { prisma } from '../prisma.js';
import { runChecks } from '../services/checker.service.js';
import {
  loadSessionForUser,
  resetSession,
  startOrReuseSession,
  stopSession,
} from '../services/session.service.js';
import {
  listWorkspaceFiles,
  readDockerInventory,
  readWorkspaceFile,
  writeWorkspaceFile,
} from '../services/workspace.service.js';

export const sessionsRouter = Router();
sessionsRouter.use(requireAuth);

async function loadReadySession(req: Request) {
  const user = currentUser(req);
  const session = await loadSessionForUser(param(req, 'id'), user);
  if (session.status !== 'ready' || !session.containerId) {
    conflict('The lab is not running');
  }
  return { user, session, containerId: session.containerId };
}

function queryString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value : undefined;
}

function serializeResults(
  tasks: { id: string }[],
  results: { taskId: string; passed: boolean; firstPassedAt: Date | null; checkedAt: Date; output: string | null }[],
) {
  const byTask = new Map(results.map((r) => [r.taskId, r]));
  return tasks.map((task) => {
    const r = byTask.get(task.id);
    return {
      taskId: task.id,
      passed: Boolean(r?.firstPassedAt),
      passedNow: Boolean(r?.passed),
      checkedAt: r?.checkedAt ?? null,
      firstPassedAt: r?.firstPassedAt ?? null,
      output: r?.output ?? null,
    };
  });
}

sessionsRouter.post('/', requireRole('student'), async (req, res) => {
  const user = currentUser(req);
  const assignmentId = reqString(req.body?.assignmentId, 'Assignment');
  const session = await startOrReuseSession(user.id, assignmentId);
  res.status(202).json(session);
});

sessionsRouter.get('/:id/files', async (req, res) => {
  const { session, containerId } = await loadReadySession(req);
  const listing = await listWorkspaceFiles(containerId, queryString(req.query.path) ?? '/root');
  res.json(listing);
});

sessionsRouter.get('/:id/files/content', async (req, res) => {
  const { containerId } = await loadReadySession(req);
  const filePath = queryString(req.query.path);
  if (!filePath) {
    badRequest('File path is required');
  }
  const file = await readWorkspaceFile(containerId, filePath);
  res.json(file);
});

sessionsRouter.put('/:id/files/content', async (req, res) => {
  const { user, session, containerId } = await loadReadySession(req);
  if (user.role !== 'student') {
    forbidden('Teachers have read-only access to student files');
  }

  const filePath = req.body?.path;
  const content = req.body?.content;
  if (typeof filePath !== 'string' || filePath.trim() === '') {
    badRequest('File path is required');
  }
  if (typeof content !== 'string') {
    badRequest('Content must be a string');
  }

  const saved = await writeWorkspaceFile(containerId, filePath, content);
  await prisma.session.update({
    where: { id: session.id },
    data: { lastActivityAt: new Date() },
  });
  await prisma.commandLog.create({
    data: {
      sessionId: session.id,
      ts: new Date(),
      command: `[editor] saved ${saved.path}`.slice(0, 500),
    },
  });

  res.json(saved);
});

sessionsRouter.get('/:id/docker', async (req, res) => {
  const { containerId } = await loadReadySession(req);
  const inventory = await readDockerInventory(containerId);
  res.json(inventory);
});

sessionsRouter.get('/:id', async (req, res) => {
  const user = currentUser(req);
  const session = await loadSessionForUser(param(req, 'id'), user);
  const tasks = session.assignment.lab.tasks;

  res.json({
    id: session.id,
    status: session.status,
    containerId: session.containerId,
    containerName: session.containerName,
    startedAt: session.startedAt,
    readyAt: session.readyAt,
    lastActivityAt: session.lastActivityAt,
    errorMessage: session.errorMessage,
    resetCount: session.resetCount,
    student: { id: session.student.id, name: session.student.name },
    assignment: {
      id: session.assignment.id,
      dueAt: session.assignment.dueAt,
      class: {
        id: session.assignment.class.id,
        name: session.assignment.class.name,
        section: session.assignment.class.section,
        batch: session.assignment.class.batch,
        schedule: session.assignment.class.schedule,
      },
      lab: {
        id: session.assignment.lab.id,
        title: session.assignment.lab.title,
        description: session.assignment.lab.description,
        template: session.assignment.lab.template,
        code: session.assignment.lab.code,
        objective: session.assignment.lab.objective,
        co: session.assignment.lab.co,
      },
    },
    tasks: tasks.map((t) => ({
      id: t.id,
      order: t.order,
      title: t.title,
      description: t.description,
      ...(user.role === 'teacher'
        ? {
            checkCommand: t.checkCommand,
            expectedOutputContains: t.expectedOutputContains,
            expectedExitCode: t.expectedExitCode,
          }
        : {}),
    })),
    results: serializeResults(tasks, session.results),
    progress: tasks.length
      ? Math.round(
          (session.results.filter((r) => r.firstPassedAt).length / tasks.length) * 100,
        )
      : 0,
  });
});

sessionsRouter.delete('/:id', async (req, res) => {
  const user = currentUser(req);
  await loadSessionForUser(param(req, 'id'), user);
  const session = await stopSession(param(req, 'id'));
  res.json({ id: session.id, status: session.status });
});

sessionsRouter.post('/:id/check', async (req, res) => {
  const user = currentUser(req);
  const session = await loadSessionForUser(param(req, 'id'), user);
  const results = await runChecks(session.id, { onlyMissing: false });
  const tasks = session.assignment.lab.tasks;
  res.json({ results: serializeResults(tasks, results) });
});

sessionsRouter.post('/:id/reset', async (req, res) => {
  const user = currentUser(req);
  await loadSessionForUser(param(req, 'id'), user);
  const session = await resetSession(param(req, 'id'));
  res.status(202).json({ id: session.id, status: session.status, resetCount: session.resetCount });
});

sessionsRouter.get('/:id/commands', async (req, res) => {
  const user = currentUser(req);
  const session = await loadSessionForUser(param(req, 'id'), user);
  const limit = Math.min(Math.max(Number(req.query.limit) || 200, 1), 500);

  const rows = await prisma.commandLog.findMany({
    where: { sessionId: session.id },
    orderBy: { ts: 'desc' },
    take: limit,
  });

  res.json(rows.reverse().map((r) => ({ id: r.id, command: r.command, ts: r.ts })));
});

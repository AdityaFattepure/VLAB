import { Router } from 'express';
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

export const sessionsRouter = Router();
sessionsRouter.use(requireAuth);

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
      class: { id: session.assignment.class.id, name: session.assignment.class.name },
      lab: {
        id: session.assignment.lab.id,
        title: session.assignment.lab.title,
        description: session.assignment.lab.description,
        template: session.assignment.lab.template,
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

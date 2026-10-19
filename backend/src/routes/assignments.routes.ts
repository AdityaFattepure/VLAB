import { Router } from 'express';
import { HttpError } from '../lib/errors.js';
import { param, reqString } from '../lib/validate.js';
import { currentUser, requireAuth, requireRole } from '../middleware/auth.js';
import { prisma } from '../prisma.js';
import { requireOwnedClass, requireOwnedLab } from '../services/access.service.js';
import { stopSession } from '../services/session.service.js';

export const assignmentsRouter = Router();
assignmentsRouter.use(requireAuth);

assignmentsRouter.post('/', requireRole('teacher'), async (req, res) => {
  const user = currentUser(req);
  const labId = reqString(req.body?.labId, 'Lab');
  const classId = reqString(req.body?.classId, 'Class');

  await requireOwnedLab(labId, user.id);
  await requireOwnedClass(classId, user.id);

  let dueAt: Date | null = null;
  if (req.body?.dueAt) {
    const parsed = new Date(req.body.dueAt);
    if (Number.isNaN(parsed.getTime())) throw new HttpError(400, 'Invalid due date');
    dueAt = parsed;
  }

  const assignment = await prisma.assignment.upsert({
    where: { labId_classId: { labId, classId } },
    update: { dueAt },
    create: { labId, classId, dueAt },
  });
  res.status(201).json(assignment);
});

assignmentsRouter.get('/mine', requireRole('student'), async (req, res) => {
  const user = currentUser(req);

  const memberships = await prisma.classMember.findMany({
    where: { studentId: user.id },
    select: { classId: true },
  });
  const classIds = memberships.map((m) => m.classId);
  if (classIds.length === 0) {
    res.json([]);
    return;
  }

  const assignments = await prisma.assignment.findMany({
    where: { classId: { in: classIds } },
    orderBy: { createdAt: 'asc' },
    include: {
      lab: { include: { tasks: { orderBy: { order: 'asc' } } } },
      class: { include: { teacher: true } },
      sessions: { where: { studentId: user.id }, include: { results: true } },
    },
  });

  res.json(
    assignments.map((a) => {
      const session = a.sessions[0] ?? null;
      const results = session?.results ?? [];
      const byTask = new Map(results.map((r) => [r.taskId, r]));
      return {
        id: a.id,
        dueAt: a.dueAt,
        class: { id: a.class.id, name: a.class.name, teacherName: a.class.teacher.name },
        lab: {
          id: a.lab.id,
          title: a.lab.title,
          description: a.lab.description,
          template: a.lab.template,
          tasks: a.lab.tasks.map((t) => ({
            id: t.id,
            order: t.order,
            title: t.title,
            description: t.description,
          })),
        },
        session: session
          ? {
              id: session.id,
              status: session.status,
              startedAt: session.startedAt,
              readyAt: session.readyAt,
              lastActivityAt: session.lastActivityAt,
              resetCount: session.resetCount,
              errorMessage: session.errorMessage,
            }
          : null,
        results: a.lab.tasks.map((t) => {
          const r = byTask.get(t.id);
          return {
            taskId: t.id,
            passed: Boolean(r?.firstPassedAt),
            passedNow: Boolean(r?.passed),
            checkedAt: r?.checkedAt ?? null,
            output: r?.output ?? null,
          };
        }),
      };
    }),
  );
});

assignmentsRouter.delete('/:id', requireRole('teacher'), async (req, res) => {
  const user = currentUser(req);
  const assignment = await prisma.assignment.findUnique({
    where: { id: param(req, 'id') },
    include: { class: true, sessions: true },
  });
  if (!assignment) throw new HttpError(404, 'Assignment not found');
  if (assignment.class.teacherId !== user.id) throw new HttpError(403, 'Not your class');

  for (const session of assignment.sessions) {
    if (session.status === 'ready' || session.status === 'starting') {
      await stopSession(session.id).catch(() => undefined);
    }
  }

  await prisma.assignment.delete({ where: { id: param(req, 'id') } });
  res.status(204).end();
});

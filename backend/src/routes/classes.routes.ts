import { Router } from 'express';
import { HttpError } from '../lib/errors.js';
import { param, reqString } from '../lib/validate.js';
import { currentUser, requireAuth, requireRole } from '../middleware/auth.js';
import { prisma } from '../prisma.js';
import { requireOwnedClass } from '../services/access.service.js';
import { getClassDashboard } from '../services/dashboard.service.js';
import { stopAllForClass } from '../services/session.service.js';

export const classesRouter = Router();
classesRouter.use(requireAuth);

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function randomCode(): string {
  return Array.from({ length: 6 }, () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]).join('');
}

classesRouter.get('/', async (req, res) => {
  const user = currentUser(req);

  if (user.role === 'teacher') {
    const classes = await prisma.class.findMany({
      where: { teacherId: user.id },
      orderBy: { createdAt: 'asc' },
      include: { _count: { select: { members: true, assignments: true } } },
    });
    res.json(
      classes.map((c) => ({
        id: c.id,
        name: c.name,
        joinCode: c.joinCode,
        members: c._count.members,
        assignments: c._count.assignments,
      })),
    );
    return;
  }

  const memberships = await prisma.classMember.findMany({
    where: { studentId: user.id },
    include: { class: { include: { teacher: true } } },
    orderBy: { joinedAt: 'asc' },
  });
  res.json(
    memberships.map((m) => ({
      id: m.class.id,
      name: m.class.name,
      joinCode: m.class.joinCode,
      teacherName: m.class.teacher.name,
      joinedAt: m.joinedAt,
    })),
  );
});

classesRouter.post('/', requireRole('teacher'), async (req, res) => {
  const user = currentUser(req);
  const name = reqString(req.body?.name, 'Class name', { min: 2, max: 100 });

  let created = null;
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 5 && !created; attempt++) {
    try {
      created = await prisma.class.create({
        data: { name, joinCode: randomCode(), teacherId: user.id },
      });
    } catch (err) {
      lastError = err;
    }
  }
  if (!created) throw lastError ?? new HttpError(500, 'Could not create class');

  res.status(201).json({ id: created.id, name: created.name, joinCode: created.joinCode });
});

classesRouter.post('/join', requireRole('student'), async (req, res) => {
  const user = currentUser(req);
  const code = reqString(req.body?.code, 'Class code').toUpperCase();

  const klass = await prisma.class.findUnique({ where: { joinCode: code } });
  if (!klass) throw new HttpError(404, 'No class found with that code');

  const existing = await prisma.classMember.findUnique({
    where: { classId_studentId: { classId: klass.id, studentId: user.id } },
  });

  if (!existing) {
    await prisma.classMember.create({ data: { classId: klass.id, studentId: user.id } });
  }

  res.json({ id: klass.id, name: klass.name, joinCode: klass.joinCode, alreadyJoined: Boolean(existing) });
});

classesRouter.get('/:id/dashboard', requireRole('teacher'), async (req, res) => {
  const user = currentUser(req);
  const assignmentId =
    typeof req.query.assignmentId === 'string' ? req.query.assignmentId : undefined;
  const dashboard = await getClassDashboard(param(req, 'id'), user.id, assignmentId);
  res.json(dashboard);
});

classesRouter.get('/:id/activity', requireRole('teacher'), async (req, res) => {
  const user = currentUser(req);
  await requireOwnedClass(param(req, 'id'), user.id);

  const entries = await prisma.commandLog.findMany({
    where: { session: { assignment: { classId: param(req, 'id') } } },
    orderBy: { ts: 'desc' },
    take: 30,
    include: { session: { include: { student: true } } },
  });

  res.json(
    entries.map((e) => ({
      studentName: e.session.student.name,
      studentId: e.session.studentId,
      sessionId: e.sessionId,
      command: e.command,
      ts: e.ts,
    })),
  );
});

classesRouter.post('/:id/stop-all', requireRole('teacher'), async (req, res) => {
  const user = currentUser(req);
  await requireOwnedClass(param(req, 'id'), user.id);
  res.json(await stopAllForClass(param(req, 'id')));
});

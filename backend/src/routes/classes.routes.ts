import { Router } from 'express';
import { HttpError } from '../lib/errors.js';
import { optString, param, reqString } from '../lib/validate.js';
import { classDisplayName, normaliseBatch, normaliseSection, normaliseJoinCode } from '../lib/class.logic.js';
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

function classMetadata(body: {
  courseCode?: unknown;
  courseTitle?: unknown;
  courseShort?: unknown;
  section?: unknown;
  batch?: unknown;
  schedule?: unknown;
  room?: unknown;
}) {
  return {
    courseCode: optString(body.courseCode) ?? '23CSE3118',
    courseTitle:
      optString(body.courseTitle) ?? 'Container Based Application Development Lab',
    courseShort: optString(body.courseShort) ?? 'CBAD',
    section: normaliseSection(optString(body.section) ?? ''),
    batch: normaliseBatch(optString(body.batch) ?? ''),
    schedule: optString(body.schedule) ?? '',
    room: optString(body.room) ?? '',
  };
}

interface NewClassData {
  name: string;
  teacherId: string;
  courseCode: string;
  courseTitle: string;
  courseShort: string;
  section: string;
  batch: string;
  schedule: string;
  room: string;
}

async function createWithJoinCode(data: NewClassData) {
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await prisma.class.create({ data: { ...data, joinCode: randomCode() } });
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError ?? new HttpError(500, 'Could not create class');
}

classesRouter.get('/', async (req, res) => {
  const user = currentUser(req);

  if (user.role === 'teacher') {
    const classes = await prisma.class.findMany({
      where: { teacherId: user.id },
      orderBy: { createdAt: 'asc' },
      include: {
        _count: { select: { members: true, assignments: true } },
        assignments: {
          select: {
            dueAt: true,
            sessions: { where: { status: 'ready' }, select: { id: true } },
            submissions: { where: { status: 'submitted' }, select: { id: true } },
          },
        },
      },
    });

    res.json(
      classes.map((c) => {
        const live = c.assignments.reduce((sum, a) => sum + a.sessions.length, 0);
        const pending = c.assignments.reduce((sum, a) => sum + a.submissions.length, 0);
        const dueDates = c.assignments
          .map((a) => a.dueAt)
          .filter((value): value is Date => Boolean(value))
          .sort((a, b) => a.getTime() - b.getTime());
        return {
          id: c.id,
          name: c.name,
          joinCode: c.joinCode,
          courseCode: c.courseCode,
          courseTitle: c.courseTitle,
          courseShort: c.courseShort,
          section: c.section,
          batch: c.batch,
          schedule: c.schedule,
          room: c.room,
          members: c._count.members,
          assignments: c._count.assignments,
          live,
          pendingSubmissions: pending,
          nextDueAt: dueDates[0] ?? null,
        };
      }),
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
      courseCode: m.class.courseCode,
      courseTitle: m.class.courseTitle,
      courseShort: m.class.courseShort,
      section: m.class.section,
      batch: m.class.batch,
      schedule: m.class.schedule,
      room: m.class.room,
      teacherName: m.class.teacher.name,
      joinedAt: m.joinedAt,
    })),
  );
});

classesRouter.post('/', requireRole('teacher'), async (req, res) => {
  const user = currentUser(req);
  const section = reqString(req.body?.section, 'Section', { min: 1, max: 20 });
  const meta = classMetadata(req.body);

  const created = await createWithJoinCode({
    name: classDisplayName({ ...meta, section }),
    teacherId: user.id,
    ...meta,
    section: normaliseSection(section),
  });

  res.status(201).json(created);
});

classesRouter.patch('/:id', requireRole('teacher'), async (req, res) => {
  const user = currentUser(req);
  const existing = await requireOwnedClass(param(req, 'id'), user.id);

  const meta = {
    courseCode: optString(req.body?.courseCode) ?? existing.courseCode,
    courseTitle: optString(req.body?.courseTitle) ?? existing.courseTitle,
    courseShort: optString(req.body?.courseShort) ?? existing.courseShort,
    section:
      req.body?.section === undefined
        ? existing.section
        : normaliseSection(reqString(req.body.section, 'Section', { min: 1, max: 20 })),
    batch:
      req.body?.batch === undefined ? existing.batch : normaliseBatch(optString(req.body.batch) ?? ''),
    schedule: optString(req.body?.schedule) ?? existing.schedule,
    room: optString(req.body?.room) ?? existing.room,
  };

  const updated = await prisma.class.update({
    where: { id: existing.id },
    data: {
      ...meta,
      name: classDisplayName(meta),
    },
  });
  res.json(updated);
});

classesRouter.post('/join', requireRole('student'), async (req, res) => {
  const user = currentUser(req);
  const code = normaliseJoinCode(reqString(req.body?.code, 'Class code'));

  const klass = await prisma.class.findUnique({ where: { joinCode: code } });
  if (!klass) throw new HttpError(404, 'No class found with that code');

  const existing = await prisma.classMember.findUnique({
    where: { classId_studentId: { classId: klass.id, studentId: user.id } },
  });

  if (!existing) {
    await prisma.classMember.create({ data: { classId: klass.id, studentId: user.id } });
  }

  res.json({
    id: klass.id,
    name: klass.name,
    joinCode: klass.joinCode,
    section: klass.section,
    batch: klass.batch,
    alreadyJoined: Boolean(existing),
  });
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

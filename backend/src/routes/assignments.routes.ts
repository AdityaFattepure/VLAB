import { Router } from 'express';
import { HttpError } from '../lib/errors.js';
import { optString, param, reqString } from '../lib/validate.js';
import {
  estimateBase64Bytes,
  safeFileName,
  validateSubmission,
} from '../lib/submission.logic.js';
import { currentUser, requireAuth, requireRole } from '../middleware/auth.js';
import { prisma } from '../prisma.js';
import { requireOwnedClass, requireOwnedLab } from '../services/access.service.js';
import { stopSession } from '../services/session.service.js';
import {
  removeSubmissionFile,
  resolveSubmissionFile,
  storeSubmissionFile,
} from '../services/submission.service.js';

export const assignmentsRouter = Router();
assignmentsRouter.use(requireAuth);

function parseDueAt(value: unknown): Date | null {
  if (!value) return null;
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) throw new HttpError(400, 'Invalid due date');
  return parsed;
}

function serializeSubmission(submission: {
  id: string;
  status: string;
  note: string;
  fileName: string | null;
  fileType: string | null;
  fileSize: number | null;
  submittedAt: Date | null;
  reviewedAt: Date | null;
  feedback: string;
  grade: number | null;
} | null) {
  if (!submission) return null;
  return {
    id: submission.id,
    status: submission.status,
    note: submission.note,
    fileName: submission.fileName,
    fileType: submission.fileType,
    fileSize: submission.fileSize,
    submittedAt: submission.submittedAt,
    reviewedAt: submission.reviewedAt,
    feedback: submission.feedback,
    grade: submission.grade,
    fileUrl: submission.fileName ? `/api/assignments/submissions/${submission.id}/file` : null,
  };
}

assignmentsRouter.post('/', requireRole('teacher'), async (req, res) => {
  const user = currentUser(req);
  const labId = reqString(req.body?.labId, 'Lab');
  const classId = reqString(req.body?.classId, 'Class');

  await requireOwnedLab(labId, user.id);
  await requireOwnedClass(classId, user.id);

  const dueAt = parseDueAt(req.body?.dueAt);
  const instructions = optString(req.body?.instructions) ?? '';
  const requiresSubmission = req.body?.requiresSubmission === false ? false : true;

  const assignment = await prisma.assignment.upsert({
    where: { labId_classId: { labId, classId } },
    update: { dueAt, instructions, requiresSubmission },
    create: { labId, classId, dueAt, instructions, requiresSubmission },
    include: { lab: true },
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
    orderBy: [{ dueAt: 'asc' }, { createdAt: 'asc' }],
    include: {
      lab: { include: { tasks: { orderBy: { order: 'asc' } } } },
      class: { include: { teacher: true } },
      sessions: { where: { studentId: user.id }, include: { results: true } },
      submissions: { where: { studentId: user.id } },
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
        instructions: a.instructions,
        requiresSubmission: a.requiresSubmission,
        class: {
          id: a.class.id,
          name: a.class.name,
          section: a.class.section,
          batch: a.class.batch,
          schedule: a.class.schedule,
          courseTitle: a.class.courseTitle,
          courseCode: a.class.courseCode,
          teacherName: a.class.teacher.name,
        },
        lab: {
          id: a.lab.id,
          title: a.lab.title,
          description: a.lab.description,
          template: a.lab.template,
          code: a.lab.code,
          objective: a.lab.objective,
          co: a.lab.co,
          estimatedMinutes: a.lab.estimatedMinutes,
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
        submission: serializeSubmission(a.submissions[0] ?? null),
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

assignmentsRouter.get('/:id/submissions', requireRole('teacher'), async (req, res) => {
  const user = currentUser(req);
  const assignment = await prisma.assignment.findUnique({
    where: { id: param(req, 'id') },
    include: {
      class: { include: { members: { include: { student: true } } } },
      lab: true,
      submissions: true,
    },
  });
  if (!assignment) throw new HttpError(404, 'Assignment not found');
  if (assignment.class.teacherId !== user.id) throw new HttpError(403, 'Not your class');

  const byStudent = new Map(assignment.submissions.map((s) => [s.studentId, s]));
  res.json({
    assignment: {
      id: assignment.id,
      labTitle: assignment.lab.title,
      labCode: assignment.lab.code,
      dueAt: assignment.dueAt,
      requiresSubmission: assignment.requiresSubmission,
    },
    students: assignment.class.members
      .map((member) => ({
        id: member.student.id,
        name: member.student.name,
        email: member.student.email,
        submission: serializeSubmission(byStudent.get(member.studentId) ?? null),
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  });
});

assignmentsRouter.put('/:id/submission', requireRole('student'), async (req, res) => {
  const user = currentUser(req);
  const assignment = await prisma.assignment.findUnique({
    where: { id: param(req, 'id') },
    include: { class: { include: { members: true } } },
  });
  if (!assignment) throw new HttpError(404, 'Assignment not found');
  if (!assignment.class.members.some((m) => m.studentId === user.id)) {
    throw new HttpError(403, 'You are not enrolled in this class');
  }

  const note = optString(req.body?.note) ?? '';
  const fileName = optString(req.body?.fileName);
  const fileType = optString(req.body?.fileType);
  const dataBase64 = typeof req.body?.dataBase64 === 'string' ? req.body.dataBase64 : '';
  const hasFileData = dataBase64.length > 0;
  const fileSize = hasFileData ? estimateBase64Bytes(dataBase64) : 0;

  const verdict = validateSubmission({
    note,
    fileName,
    fileType,
    fileSize,
    hasFileData,
  });
  if (!verdict.ok) throw new HttpError(400, verdict.error);

  const existing = await prisma.submission.findUnique({
    where: { assignmentId_studentId: { assignmentId: assignment.id, studentId: user.id } },
  });

  const row = await prisma.submission.upsert({
    where: { assignmentId_studentId: { assignmentId: assignment.id, studentId: user.id } },
    create: {
      assignmentId: assignment.id,
      studentId: user.id,
      status: 'submitted',
      note,
      submittedAt: new Date(),
    },
    update: {
      status: 'submitted',
      note,
      submittedAt: new Date(),
      reviewedAt: null,
      feedback: '',
      grade: null,
    },
  });

  let updated = row;
  if (hasFileData && fileName && fileType) {
    const stored = await storeSubmissionFile(row.id, { dataBase64, fileName });
    await removeSubmissionFile(existing?.filePath);
    updated = await prisma.submission.update({
      where: { id: row.id },
      data: {
        fileName: safeFileName(fileName),
        fileType,
        fileSize,
        filePath: stored.relativePath,
      },
    });
  }

  res.status(201).json(serializeSubmission(updated));
});

assignmentsRouter.post('/:id/submission/review', requireRole('teacher'), async (req, res) => {
  const user = currentUser(req);
  const assignment = await prisma.assignment.findUnique({
    where: { id: param(req, 'id') },
    include: { class: true },
  });
  if (!assignment) throw new HttpError(404, 'Assignment not found');
  if (assignment.class.teacherId !== user.id) throw new HttpError(403, 'Not your class');

  const studentId = reqString(req.body?.studentId, 'Student');
  const feedback = optString(req.body?.feedback) ?? '';
  const gradeRaw = req.body?.grade;
  const grade =
    gradeRaw === undefined || gradeRaw === null || gradeRaw === ''
      ? null
      : Number(gradeRaw);
  if (grade !== null && (!Number.isInteger(grade) || grade < 0 || grade > 100)) {
    throw new HttpError(400, 'Grade must be a whole number between 0 and 100');
  }

  const submission = await prisma.submission.findUnique({
    where: { assignmentId_studentId: { assignmentId: assignment.id, studentId } },
  });
  if (!submission || submission.status === 'draft') {
    throw new HttpError(404, 'That student has not submitted evidence yet');
  }

  const updated = await prisma.submission.update({
    where: { id: submission.id },
    data: {
      status: 'reviewed',
      feedback,
      grade: grade ?? submission.grade,
      reviewedAt: new Date(),
    },
  });

  res.json(serializeSubmission(updated));
});

assignmentsRouter.get('/submissions/:id/file', async (req, res) => {
  const user = currentUser(req);
  const submission = await prisma.submission.findUnique({
    where: { id: param(req, 'id') },
    include: { assignment: { include: { class: true } } },
  });
  if (!submission) throw new HttpError(404, 'Submission not found');
  if (!submission.filePath) throw new HttpError(404, 'No file attached');

  const isOwner = user.role === 'student' && submission.studentId === user.id;
  const isTeacher = user.role === 'teacher' && submission.assignment.class.teacherId === user.id;
  if (!isOwner && !isTeacher) throw new HttpError(403, 'Not allowed to view this file');

  res.sendFile(resolveSubmissionFile(submission.filePath));
});

assignmentsRouter.delete('/:id', requireRole('teacher'), async (req, res) => {
  const user = currentUser(req);
  const assignment = await prisma.assignment.findUnique({
    where: { id: param(req, 'id') },
    include: { class: true, sessions: true, submissions: true },
  });
  if (!assignment) throw new HttpError(404, 'Assignment not found');
  if (assignment.class.teacherId !== user.id) throw new HttpError(403, 'Not your class');

  for (const session of assignment.sessions) {
    if (session.status === 'ready' || session.status === 'starting') {
      await stopSession(session.id).catch(() => undefined);
    }
  }
  for (const submission of assignment.submissions) {
    await removeSubmissionFile(submission.filePath);
  }

  await prisma.assignment.delete({ where: { id: param(req, 'id') } });
  res.status(204).end();
});

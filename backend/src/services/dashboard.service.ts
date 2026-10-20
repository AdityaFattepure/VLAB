import { forbidden, notFound } from '../lib/errors.js';
import { prisma } from '../prisma.js';

/**
 * The teacher lands on the assignment their class is actually working on.
 * Falling back to "newest created" would show an empty grid when a second lab
 * was assigned later but nobody has started it, so with no activity at all we
 * keep the first lab assigned to the class.
 */
async function pickDefaultAssignment<T extends { id: string }>(
  classId: string,
  assignments: T[],
): Promise<T | undefined> {
  const latestSession = await prisma.session.findFirst({
    where: { assignment: { classId } },
    orderBy: { lastActivityAt: 'desc' },
    select: { assignmentId: true },
  });
  return (
    (latestSession ? assignments.find((a) => a.id === latestSession.assignmentId) : undefined) ??
    assignments.at(-1)
  );
}

export async function getClassDashboard(
  classId: string,
  teacherId: string,
  assignmentId?: string,
) {
  const klass = await prisma.class.findUnique({
    where: { id: classId },
    include: {
      members: { include: { student: true }, orderBy: { joinedAt: 'asc' } },
      assignments: {
        include: {
          lab: { include: { tasks: { orderBy: { order: 'asc' } } } },
          submissions: true,
        },
        orderBy: { createdAt: 'desc' },
      },
    },
  });

  if (!klass) notFound('Class not found');
  if (klass.teacherId !== teacherId) forbidden('Not your class');

  const assignment = assignmentId
    ? klass.assignments.find((a) => a.id === assignmentId)
    : await pickDefaultAssignment(klass.id, klass.assignments);

  if (assignmentId && !assignment) notFound('Assignment not found');

  const tasks = assignment?.lab.tasks ?? [];
  const sessions = assignment
    ? await prisma.session.findMany({
        where: { assignmentId: assignment.id },
        include: { results: true },
      })
    : [];

  const sessionIds = sessions.map((s) => s.id);
  const recent = sessionIds.length
    ? await prisma.commandLog.findMany({
        where: { sessionId: { in: sessionIds } },
        orderBy: { ts: 'desc' },
        take: 300,
        include: { session: { include: { student: true } } },
      })
    : [];

  const lastCommand = new Map<string, { command: string; ts: Date }>();
  for (const entry of recent) {
    if (!lastCommand.has(entry.sessionId)) {
      lastCommand.set(entry.sessionId, { command: entry.command, ts: entry.ts });
    }
  }

  const submissions = new Map(
    (assignment?.submissions ?? []).map((submission) => [submission.studentId, submission]),
  );

  const students = klass.members
    .map((member) => {
      const session = sessions.find((s) => s.studentId === member.studentId);
      const byTask = new Map((session?.results ?? []).map((r) => [r.taskId, r]));
      const submission = submissions.get(member.studentId);

      const taskRows = tasks.map((task) => {
        const result = byTask.get(task.id);
        return {
          taskId: task.id,
          order: task.order,
          title: task.title,
          description: task.description,
          passed: Boolean(result?.firstPassedAt),
          passedNow: Boolean(result?.passed),
          checkedAt: result?.checkedAt ?? null,
          output: result?.output ?? null,
        };
      });

      const completed = taskRows.filter((t) => t.passed).length;
      const last = session ? lastCommand.get(session.id) : undefined;

      return {
        id: member.student.id,
        name: member.student.name,
        email: member.student.email,
        joinedAt: member.joinedAt,
        session: session
          ? {
              id: session.id,
              status: session.status,
              containerId: session.containerId,
              startedAt: session.startedAt,
              readyAt: session.readyAt,
              lastActivityAt: session.lastActivityAt,
              resetCount: session.resetCount,
              errorMessage: session.errorMessage,
              lastCommand: last?.command ?? null,
              lastCommandAt: last?.ts ?? null,
            }
          : null,
        submission: submission
          ? {
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
            }
          : null,
        tasks: taskRows,
        completed,
        total: taskRows.length,
        progress: taskRows.length ? Math.round((completed / taskRows.length) * 100) : 0,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const assignmentSummaries = klass.assignments.map((a) => {
    const submitted = a.submissions.filter((s) => s.status !== 'draft').length;
    const reviewed = a.submissions.filter((s) => s.status === 'reviewed').length;
    return {
      id: a.id,
      labId: a.labId,
      labTitle: a.lab.title,
      labCode: a.lab.code,
      dueAt: a.dueAt,
      requiresSubmission: a.requiresSubmission,
      taskCount: a.lab.tasks.length,
      submissionCount: a.submissions.length,
      submitted,
      reviewed,
    };
  });

  const selectedSummary = assignmentSummaries.find((a) => a.id === assignment?.id);

  return {
    class: {
      id: klass.id,
      name: klass.name,
      joinCode: klass.joinCode,
      courseCode: klass.courseCode,
      courseTitle: klass.courseTitle,
      courseShort: klass.courseShort,
      section: klass.section,
      batch: klass.batch,
      schedule: klass.schedule,
      room: klass.room,
    },
    assignment: assignment
      ? {
          id: assignment.id,
          labId: assignment.labId,
          labTitle: assignment.lab.title,
          labCode: assignment.lab.code,
          template: assignment.lab.template,
          objective: assignment.lab.objective,
          co: assignment.lab.co,
          dueAt: assignment.dueAt,
          instructions: assignment.instructions,
          requiresSubmission: assignment.requiresSubmission,
          taskCount: tasks.length,
        }
      : null,
    assignments: assignmentSummaries,
    students,
    activity: recent.slice(0, 20).map((entry) => ({
      studentId: entry.session.studentId,
      studentName: entry.session.student.name,
      sessionId: entry.sessionId,
      command: entry.command,
      ts: entry.ts,
    })),
    totals: {
      students: klass.members.length,
      running: sessions.filter((s) => s.status === 'ready').length,
      completed: students.filter((s) => s.total > 0 && s.progress === 100).length,
      submitted: selectedSummary?.submitted ?? 0,
      reviewed: selectedSummary?.reviewed ?? 0,
    },
  };
}

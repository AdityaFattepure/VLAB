import { forbidden, notFound } from '../lib/errors.js';
import { prisma } from '../prisma.js';

/**
 * The teacher lands on the assignment their class is actually working on.
 * Falling back to "newest created" would show an empty grid when a second lab
 * was assigned later but nobody has started it.
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
    assignments[0]
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
        include: { lab: { include: { tasks: { orderBy: { order: 'asc' } } } } },
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

  const students = klass.members
    .map((member) => {
      const session = sessions.find((s) => s.studentId === member.studentId);
      const byTask = new Map((session?.results ?? []).map((r) => [r.taskId, r]));

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
        tasks: taskRows,
        completed,
        total: taskRows.length,
        progress: taskRows.length ? Math.round((completed / taskRows.length) * 100) : 0,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    class: { id: klass.id, name: klass.name, joinCode: klass.joinCode },
    assignment: assignment
      ? {
          id: assignment.id,
          labId: assignment.labId,
          labTitle: assignment.lab.title,
          template: assignment.lab.template,
          dueAt: assignment.dueAt,
          taskCount: tasks.length,
        }
      : null,
    assignments: klass.assignments.map((a) => ({
      id: a.id,
      labTitle: a.lab.title,
      dueAt: a.dueAt,
    })),
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
    },
  };
}

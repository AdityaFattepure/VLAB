import { useEffect, useState } from 'react';
import type { ClassSummary, Dashboard } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { ProgressBar } from '../components/ProgressBar';
import { StatusPill } from '../components/StatusPill';
import { StudentDrawer } from '../components/StudentDrawer';
import { usePolling } from '../hooks/usePolling';
import { cn, initials, timeAgo } from '../lib/format';

export default function TeacherDashboard() {
  const { api } = useAuth();

  const { data: classes } = usePolling<ClassSummary[]>(() => api('/classes'), 15000, []);
  const [classId, setClassId] = useState('');
  const [assignmentId, setAssignmentId] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (!classId && classes && classes.length > 0) setClassId(classes[0].id);
  }, [classes, classId]);

  useEffect(() => {
    setAssignmentId('');
  }, [classId]);

  const { data: dashboard, error, refresh } = usePolling<Dashboard | null>(
    () =>
      classId
        ? api<Dashboard>(
            `/classes/${classId}/dashboard${assignmentId ? `?assignmentId=${assignmentId}` : ''}`,
          )
        : Promise.resolve(null),
    4000,
    [classId, assignmentId],
  );

  const selected = dashboard?.students.find((student) => student.id === selectedId) ?? null;
  const taskColumns = dashboard?.students[0]?.tasks ?? [];

  async function copyJoinCode() {
    if (!dashboard) return;
    try {
      await navigator.clipboard.writeText(dashboard.class.joinCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setNotice(`Join code: ${dashboard.class.joinCode}`);
    }
  }

  async function stopAll() {
    if (!dashboard) return;
    if (!window.confirm(`Stop all running labs in ${dashboard.class.name}?`)) return;
    try {
      const result = await api<{ stopped: number }>(`/classes/${dashboard.class.id}/stop-all`, {
        method: 'POST',
      });
      setNotice(`Stopped ${result.stopped} session${result.stopped === 1 ? '' : 's'}`);
      refresh();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Could not stop labs');
    }
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-slate-500">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 vlab-live-dot" />
            Live class monitor
          </div>
          <h1 className="mt-1 text-2xl font-semibold text-slate-100">
            {dashboard?.class.name ?? 'Loading class…'}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Every row is a real container. Progress updates every few seconds.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {classes && classes.length > 1 && (
            <select
              value={classId}
              onChange={(event) => setClassId(event.target.value)}
              className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-200 outline-none focus:border-indigo-500/60"
            >
              {classes.map((klass) => (
                <option key={klass.id} value={klass.id}>
                  {klass.name}
                </option>
              ))}
            </select>
          )}
          {dashboard && (
            <button
              type="button"
              onClick={() => void copyJoinCode()}
              className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-slate-300 hover:border-indigo-500/40"
              title="Students join with this code"
            >
              <span className="text-slate-500">Join code</span>
              <span className="font-mono font-semibold tracking-[0.2em] text-indigo-300">
                {dashboard.class.joinCode}
              </span>
              <span className="text-[10px] text-slate-500">{copied ? 'copied' : 'copy'}</span>
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="mt-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
          {error}
        </div>
      )}
      {notice && (
        <div className="mt-4 rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-3 py-2 text-xs text-indigo-200">
          {notice}
        </div>
      )}

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        {[
          {
            label: 'Students',
            value: dashboard?.totals.students ?? '—',
            hint: 'enrolled in this class',
            tone: 'text-slate-100',
          },
          {
            label: 'Live containers',
            value: dashboard?.totals.running ?? '—',
            hint: 'ready to accept commands',
            tone: 'text-emerald-300',
          },
          {
            label: 'Completed',
            value: dashboard?.totals.completed ?? '—',
            hint: 'all tasks passed',
            tone: 'text-indigo-300',
          },
        ].map((stat) => (
          <div
            key={stat.label}
            className="rounded-xl border border-slate-800 bg-slate-900/50 px-4 py-3"
          >
            <div className="text-[11px] uppercase tracking-wider text-slate-500">{stat.label}</div>
            <div className={cn('mt-1 text-2xl font-semibold', stat.tone)}>{stat.value}</div>
            <div className="mt-0.5 text-[11px] text-slate-600">{stat.hint}</div>
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <section className="min-w-0">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs uppercase tracking-wider text-slate-500">Assignment</span>
              {(dashboard?.assignments.length ?? 0) > 1 ? (
                <select
                  value={assignmentId}
                  onChange={(event) => setAssignmentId(event.target.value)}
                  className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-1.5 text-sm text-slate-200 outline-none focus:border-indigo-500/60"
                >
                  <option value="">Active (auto)</option>
                  {dashboard?.assignments.map((assignment) => (
                    <option key={assignment.id} value={assignment.id}>
                      {assignment.labTitle}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="text-sm font-medium text-slate-200">
                  {dashboard?.assignment?.labTitle ?? 'No assignment yet'}
                </span>
              )}
            </div>

            <button
              type="button"
              onClick={() => void stopAll()}
              disabled={!dashboard || dashboard.totals.running === 0}
              className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-xs font-medium text-rose-300 transition hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Stop all labs
            </button>
          </div>

          <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/40">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-900/80 text-[10px] uppercase tracking-wider text-slate-500">
                    <th className="px-4 py-3 font-medium">Student</th>
                    <th className="px-3 py-3 font-medium">Status</th>
                    {taskColumns.map((task) => (
                      <th key={task.taskId} className="px-2 py-3 text-center font-medium">
                        T{task.order}
                      </th>
                    ))}
                    <th className="px-3 py-3 font-medium">Progress</th>
                    <th className="px-3 py-3 font-medium">Last active</th>
                    <th className="px-4 py-3 font-medium">Last command</th>
                  </tr>
                </thead>
                <tbody>
                  {dashboard?.students.map((student) => (
                    <tr
                      key={student.id}
                      onClick={() => setSelectedId(student.id)}
                      className="cursor-pointer border-b border-slate-800/60 transition last:border-0 hover:bg-slate-800/40"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-slate-800 text-[10px] font-semibold text-slate-300 ring-1 ring-slate-700">
                            {initials(student.name)}
                          </div>
                          <div className="min-w-0">
                            <div className="truncate font-medium text-slate-200">
                              {student.name}
                            </div>
                            <div className="truncate text-[11px] text-slate-600">
                              {student.email}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <StatusPill status={student.session?.status} />
                      </td>
                      {taskColumns.map((column) => {
                        const task = student.tasks.find((t) => t.taskId === column.taskId);
                        return (
                          <td key={column.taskId} className="px-2 py-3 text-center">
                            <span
                              title={`${column.title}${task?.passed ? ' — passed' : ''}`}
                              className={cn(
                                'inline-grid h-7 w-7 place-items-center rounded-lg text-xs font-semibold ring-1',
                                task?.passed
                                  ? 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/30'
                                  : 'bg-slate-800/60 text-slate-600 ring-slate-700/60',
                              )}
                            >
                              {task?.passed ? '✓' : '·'}
                            </span>
                          </td>
                        );
                      })}
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-2">
                          <ProgressBar
                            value={student.progress}
                            tone={student.progress === 100 ? 'emerald' : 'indigo'}
                            className="w-20"
                          />
                          <span className="w-9 text-right text-[11px] tabular-nums text-slate-400">
                            {student.progress}%
                          </span>
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-[11px] text-slate-400">
                        {timeAgo(student.session?.lastActivityAt)}
                      </td>
                      <td className="max-w-[220px] px-4 py-3">
                        <code className="block truncate font-mono text-[11px] text-slate-500">
                          {student.session?.lastCommand ?? '—'}
                        </code>
                      </td>
                    </tr>
                  ))}
                  {dashboard && dashboard.students.length === 0 && (
                    <tr>
                      <td colSpan={6 + taskColumns.length} className="px-4 py-12 text-center">
                        <div className="text-sm text-slate-400">No students have joined yet.</div>
                        <div className="mt-1 text-xs text-slate-600">
                          Share join code {dashboard.class.joinCode}
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {!dashboard && !error && (
            <div className="mt-3 text-xs text-slate-600">Loading class data…</div>
          )}
        </section>

        <aside className="min-w-0">
          <div className="rounded-xl border border-slate-800 bg-slate-900/40">
            <div className="flex items-center gap-2 border-b border-slate-800 px-4 py-3">
              <span className="h-1.5 w-1.5 rounded-full bg-indigo-400 vlab-live-dot" />
              <h2 className="text-sm font-semibold text-slate-200">Live activity</h2>
              <span className="ml-auto text-[10px] uppercase tracking-wider text-slate-600">
                last 20
              </span>
            </div>
            <div className="max-h-[520px] divide-y divide-slate-800/60 overflow-y-auto">
              {(dashboard?.activity ?? []).map((entry, index) => (
                <div key={`${entry.sessionId}-${entry.ts}-${index}`} className="px-4 py-2.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-xs font-medium text-indigo-300">
                      {entry.studentName}
                    </span>
                    <span className="shrink-0 text-[10px] text-slate-600">
                      {timeAgo(entry.ts)}
                    </span>
                  </div>
                  <code className="mt-1 block truncate font-mono text-[11px] text-slate-400">
                    {entry.command}
                  </code>
                </div>
              ))}
              {dashboard && dashboard.activity.length === 0 && (
                <div className="px-4 py-10 text-center text-xs text-slate-600">
                  No commands yet.
                  <br />
                  Start a lab to see activity here.
                </div>
              )}
            </div>
          </div>

          <div className="mt-3 rounded-xl border border-slate-800/70 bg-slate-900/30 px-4 py-3 text-[11px] leading-relaxed text-slate-500">
            Click a student to open their command history and a read-only live terminal. Command
            logging is advisory — a student can opt out by changing their shell.
          </div>
        </aside>
      </div>

      {selected && (
        <StudentDrawer
          student={selected}
          onClose={() => setSelectedId(null)}
          onChanged={() => refresh()}
        />
      )}
    </div>
  );
}

import { lazy, Suspense, useEffect, useState } from 'react';
import type { CommandEntry, DashboardStudent, SessionDetail } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { usePolling } from '../hooks/usePolling';
import { cn, formatClock, initials, timeAgo } from '../lib/format';
import { ProgressBar } from './ProgressBar';
import { StatusPill, SubmissionBadge } from './StatusPill';
import { TerminalView } from './TerminalView';

const WorkspaceFiles = lazy(() => import('./WorkspaceFiles'));
const DockerInspector = lazy(() => import('./DockerInspector'));

type TeacherWorkspaceTab = 'terminal' | 'files' | 'docker';

const teacherTabs: { id: TeacherWorkspaceTab; label: string }[] = [
  { id: 'terminal', label: 'Terminal' },
  { id: 'files', label: 'Files · read-only' },
  { id: 'docker', label: 'Docker' },
];

export function StudentDrawer({
  student,
  onClose,
  onChanged,
}: {
  student: DashboardStudent;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { api } = useAuth();
  const sessionId = student.session?.id ?? null;
  const [busy, setBusy] = useState<'reset' | 'stop' | null>(null);
  const [notice, setNotice] = useState('');
  const [workspaceTab, setWorkspaceTab] = useState<TeacherWorkspaceTab>('terminal');

  useEffect(() => {
    setWorkspaceTab('terminal');
  }, [sessionId]);

  const { data: detail, refresh: refreshDetail } = usePolling<SessionDetail | null>(
    () => (sessionId ? api<SessionDetail>(`/sessions/${sessionId}`) : Promise.resolve(null)),
    4000,
    [sessionId],
  );

  const { data: commands, refresh: refreshCommands } = usePolling<CommandEntry[]>(
    () =>
      sessionId
        ? api<CommandEntry[]>(`/sessions/${sessionId}/commands?limit=100`)
        : Promise.resolve([]),
    5000,
    [sessionId],
  );

  async function act(kind: 'reset' | 'stop') {
    if (!sessionId) return;
    const question =
      kind === 'reset'
        ? `Reset ${student.name}'s lab? The container is recreated and task progress is cleared.`
        : `Stop ${student.name}'s lab and remove the container?`;
    if (!window.confirm(question)) return;

    setBusy(kind);
    setNotice('');
    try {
      if (kind === 'reset') {
        await api(`/sessions/${sessionId}/reset`, { method: 'POST' });
      } else {
        await api(`/sessions/${sessionId}`, { method: 'DELETE' });
      }
      setNotice(kind === 'reset' ? 'Lab reset started' : 'Lab stopped');
      refreshDetail();
      refreshCommands();
      onChanged();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setBusy(null);
    }
  }

  const ready = detail?.status === 'ready';
  const submission = student.submission;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        aria-label="Close student panel"
        onClick={onClose}
        className="absolute inset-0 bg-slate-900/30"
      />

      <aside className="relative flex h-full w-full max-w-3xl flex-col overflow-y-auto border-l border-slate-200 bg-white shadow-xl">
        <div className="sticky top-0 z-10 border-b border-slate-200 bg-white px-6 py-4">
          <div className="flex items-start gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-full bg-slate-100 text-sm font-semibold text-slate-700">
              {initials(student.name)}
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-lg font-semibold text-slate-900">{student.name}</h2>
              <p className="truncate text-xs text-slate-500">{student.email}</p>
            </div>
            <div className="flex items-center gap-2">
              <StatusPill status={student.session?.status} />
              <button type="button" onClick={onClose} className="vlab-button-secondary px-2.5 py-1.5 text-xs">
                Close
              </button>
            </div>
          </div>

          <div className="mt-4 grid gap-3 text-xs sm:grid-cols-4">
            <div>
              <div className="text-slate-500">Progress</div>
              <div className="mt-1 text-slate-900">
                {student.completed}/{student.total} tasks
              </div>
              <ProgressBar value={student.progress} className="mt-2" tone="emerald" />
            </div>
            <div>
              <div className="text-slate-500">Container</div>
              <div className="mt-1 truncate font-mono text-[11px] text-slate-700">
                {student.session?.containerId?.slice(0, 12) ?? 'none'}
              </div>
              <div className="mt-1 text-[11px] text-slate-500">
                {student.session?.containerId ? 'running on host daemon' : 'not created'}
              </div>
            </div>
            <div>
              <div className="text-slate-500">Evidence</div>
              <div className="mt-1">
                <SubmissionBadge status={submission?.status} />
              </div>
              <div className="mt-1 text-[11px] text-slate-500">
                {submission?.grade !== null && submission?.grade !== undefined
                  ? `Grade ${submission.grade}/100`
                  : 'not graded'}
              </div>
            </div>
            <div>
              <div className="text-slate-500">Last activity</div>
              <div className="mt-1 text-slate-900">{timeAgo(student.session?.lastActivityAt)}</div>
              <div className="mt-1 text-[11px] text-slate-500">
                reset {student.session?.resetCount ?? 0}×
              </div>
            </div>
          </div>
        </div>

        <div className="flex-1 space-y-5 px-6 py-5">
          {!sessionId && (
            <div className="rounded-lg border border-dashed border-slate-300 px-4 py-10 text-center text-sm text-slate-500">
              {student.name} has not started this lab yet.
            </div>
          )}

          {sessionId && (
            <>
              <section>
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-900">Tasks</h3>
                  <span className="text-xs text-slate-500">{student.progress}% complete</span>
                </div>
                <div className="space-y-2">
                  {student.tasks.map((task) => (
                    <div
                      key={task.taskId}
                      className={cn(
                        'flex items-center gap-3 rounded-md border px-3 py-2 text-sm',
                        task.passed
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                          : 'border-slate-200 bg-white text-slate-700',
                      )}
                    >
                      <span
                        className={cn(
                          'grid h-5 w-5 shrink-0 place-items-center rounded-full text-[11px]',
                          task.passed
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-slate-100 text-slate-500',
                        )}
                      >
                        {task.passed ? '✓' : task.order}
                      </span>
                      <span className="flex-1">{task.title}</span>
                      {task.passed && (
                        <span className="text-[10px] uppercase tracking-wide text-emerald-700">
                          {timeAgo(task.checkedAt)}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </section>

              <section>
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-900">Student workspace</h3>
                  <span className="text-[11px] text-slate-500">
                    {ready ? 'read-only · files and Docker objects' : 'available when the lab is live'}
                  </span>
                </div>
                {ready ? (
                  <div className="overflow-hidden rounded-lg border border-slate-200">
                    <div
                      role="tablist"
                      aria-label="Student workspace"
                      className="flex gap-1 border-b border-slate-200 bg-slate-50 px-2 pt-2"
                    >
                      {teacherTabs.map((tab) => (
                        <button
                          key={tab.id}
                          type="button"
                          role="tab"
                          aria-selected={workspaceTab === tab.id}
                          onClick={() => setWorkspaceTab(tab.id)}
                          className={cn(
                            'rounded-t border border-b-0 px-2.5 py-1.5 text-[11px] font-medium',
                            workspaceTab === tab.id
                              ? 'border-slate-200 bg-white text-slate-900'
                              : 'border-transparent text-slate-500 hover:text-slate-800',
                          )}
                        >
                          {tab.label}
                        </button>
                      ))}
                    </div>
                    <div className="h-[420px] min-h-0">
                      {workspaceTab === 'terminal' && (
                        <TerminalView bare readOnly sessionId={sessionId} className="h-full" />
                      )}
                      {workspaceTab === 'files' && (
                        <Suspense
                          fallback={
                            <div className="grid h-full place-items-center text-xs text-slate-500">
                              Loading files…
                            </div>
                          }
                        >
                          <WorkspaceFiles sessionId={sessionId} readOnly />
                        </Suspense>
                      )}
                      {workspaceTab === 'docker' && (
                        <Suspense
                          fallback={
                            <div className="grid h-full place-items-center text-xs text-slate-500">
                              Loading Docker objects…
                            </div>
                          }
                        >
                          <DockerInspector sessionId={sessionId} />
                        </Suspense>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-8 text-center text-xs text-slate-500">
                    {detail?.errorMessage ?? 'The lab is not ready right now.'}
                  </div>
                )}
              </section>

              <section>
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-900">Command history</h3>
                  <span className="text-[11px] text-slate-500">
                    {commands?.length ?? 0} entries · advisory
                  </span>
                </div>
                <div className="max-h-64 overflow-y-auto rounded-lg border border-slate-200">
                  {(commands ?? []).length === 0 && (
                    <div className="px-4 py-6 text-center text-xs text-slate-500">
                      No commands logged yet.
                    </div>
                  )}
                  {(commands ?? []).map((entry) => (
                    <div
                      key={entry.id}
                      className="flex items-baseline gap-3 border-b border-slate-100 px-3 py-1.5 text-xs last:border-0"
                    >
                      <span className="shrink-0 font-mono text-[10px] text-slate-400">
                        {formatClock(entry.ts)}
                      </span>
                      <code className="truncate font-mono text-[11px] text-slate-700">
                        {entry.command}
                      </code>
                    </div>
                  ))}
                </div>
              </section>

              <div className="flex flex-wrap items-center gap-2 border-t border-slate-200 pt-4">
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => void act('reset')}
                  className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800 hover:bg-amber-100 disabled:opacity-50"
                >
                  {busy === 'reset' ? 'Resetting…' : 'Reset lab'}
                </button>
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => void act('stop')}
                  className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700 hover:bg-rose-100 disabled:opacity-50"
                >
                  {busy === 'stop' ? 'Stopping…' : 'Stop lab'}
                </button>
                {notice && <span className="text-xs text-slate-500">{notice}</span>}
              </div>
            </>
          )}
        </div>
      </aside>
    </div>
  );
}

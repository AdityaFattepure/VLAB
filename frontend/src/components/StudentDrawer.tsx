import { useState } from 'react';
import type { CommandEntry, DashboardStudent, SessionDetail } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { usePolling } from '../hooks/usePolling';
import { cn, formatClock, initials, timeAgo } from '../lib/format';
import { ProgressBar } from './ProgressBar';
import { StatusPill } from './StatusPill';
import { TerminalView } from './TerminalView';

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

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        aria-label="Close student panel"
        onClick={onClose}
        className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm"
      />

      <aside className="relative flex h-full w-full max-w-3xl flex-col overflow-y-auto border-l border-slate-800 bg-slate-950 shadow-2xl">
        <div className="sticky top-0 z-10 border-b border-slate-800 bg-slate-950/95 px-6 py-4 backdrop-blur">
          <div className="flex items-start gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-full bg-indigo-500/15 text-sm font-semibold text-indigo-300 ring-1 ring-indigo-500/30">
              {initials(student.name)}
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-lg font-semibold text-slate-100">{student.name}</h2>
              <p className="truncate text-xs text-slate-500">{student.email}</p>
            </div>
            <div className="flex items-center gap-2">
              <StatusPill status={student.session?.status} />
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-slate-800 px-2.5 py-1.5 text-xs text-slate-400 hover:border-slate-700 hover:text-slate-200"
              >
                Close
              </button>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-3 text-xs">
            <div>
              <div className="text-slate-500">Progress</div>
              <div className="mt-1 text-slate-200">
                {student.completed}/{student.total} tasks
              </div>
              <ProgressBar value={student.progress} className="mt-2" tone="emerald" />
            </div>
            <div>
              <div className="text-slate-500">Container</div>
              <div className="mt-1 truncate font-mono text-[11px] text-slate-300">
                {student.session?.containerId?.slice(0, 12) ?? 'none'}
              </div>
              <div className="mt-1 text-[11px] text-slate-500">
                {student.session?.containerId ? 'running on host daemon' : 'not created'}
              </div>
            </div>
            <div>
              <div className="text-slate-500">Last activity</div>
              <div className="mt-1 text-slate-200">{timeAgo(student.session?.lastActivityAt)}</div>
              <div className="mt-1 text-[11px] text-slate-500">
                reset {student.session?.resetCount ?? 0}×
              </div>
            </div>
          </div>
        </div>

        <div className="flex-1 space-y-5 px-6 py-5">
          {!sessionId && (
            <div className="rounded-xl border border-dashed border-slate-800 px-4 py-10 text-center text-sm text-slate-500">
              {student.name} has not started this lab yet.
            </div>
          )}

          {sessionId && (
            <>
              <section>
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-200">Tasks</h3>
                  <span className="text-xs text-slate-500">{student.progress}% complete</span>
                </div>
                <div className="space-y-2">
                  {student.tasks.map((task) => (
                    <div
                      key={task.taskId}
                      className={cn(
                        'flex items-center gap-3 rounded-lg border px-3 py-2 text-sm',
                        task.passed
                          ? 'border-emerald-500/20 bg-emerald-500/5 text-emerald-200'
                          : 'border-slate-800 bg-slate-900/40 text-slate-300',
                      )}
                    >
                      <span
                        className={cn(
                          'grid h-5 w-5 shrink-0 place-items-center rounded-full text-[11px]',
                          task.passed
                            ? 'bg-emerald-500/20 text-emerald-300'
                            : 'bg-slate-800 text-slate-500',
                        )}
                      >
                        {task.passed ? '✓' : task.order}
                      </span>
                      <span className="flex-1">{task.title}</span>
                      {task.passed && (
                        <span className="text-[10px] uppercase tracking-wider text-emerald-400">
                          {timeAgo(task.checkedAt)}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </section>

              <section>
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-200">Live terminal</h3>
                  <span className="text-[11px] text-slate-500">
                    {ready ? 'read-only' : 'available when the lab is live'}
                  </span>
                </div>
                {ready ? (
                  <TerminalView sessionId={sessionId} readOnly className="h-80" />
                ) : (
                  <div className="rounded-xl border border-slate-800 bg-slate-900/40 px-4 py-8 text-center text-xs text-slate-500">
                    {detail?.errorMessage ?? 'The lab is not ready right now.'}
                  </div>
                )}
              </section>

              <section>
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-200">Command history</h3>
                  <span className="text-[11px] text-slate-500">
                    {commands?.length ?? 0} entries · advisory
                  </span>
                </div>
                <div className="max-h-64 overflow-y-auto rounded-xl border border-slate-800 bg-slate-900/30">
                  {(commands ?? []).length === 0 && (
                    <div className="px-4 py-6 text-center text-xs text-slate-500">
                      No commands logged yet.
                    </div>
                  )}
                  {(commands ?? []).map((entry) => (
                    <div
                      key={entry.id}
                      className="flex items-baseline gap-3 border-b border-slate-800/60 px-3 py-1.5 text-xs last:border-0"
                    >
                      <span className="shrink-0 font-mono text-[10px] text-slate-600">
                        {formatClock(entry.ts)}
                      </span>
                      <code className="truncate font-mono text-[11px] text-slate-300">
                        {entry.command}
                      </code>
                    </div>
                  ))}
                </div>
              </section>

              <div className="flex flex-wrap items-center gap-2 border-t border-slate-800 pt-4">
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => void act('reset')}
                  className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs font-medium text-amber-300 hover:bg-amber-500/20 disabled:opacity-50"
                >
                  {busy === 'reset' ? 'Resetting…' : 'Reset lab'}
                </button>
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => void act('stop')}
                  className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs font-medium text-rose-300 hover:bg-rose-500/20 disabled:opacity-50"
                >
                  {busy === 'stop' ? 'Stopping…' : 'Stop lab'}
                </button>
                {notice && <span className="text-xs text-slate-400">{notice}</span>}
              </div>
            </>
          )}
        </div>
      </aside>
    </div>
  );
}

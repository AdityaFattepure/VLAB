import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { SessionDetail } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { ProgressBar } from '../components/ProgressBar';
import { StatusPill } from '../components/StatusPill';
import { TerminalView } from '../components/TerminalView';
import { usePolling } from '../hooks/usePolling';
import { cn, formatDue, timeAgo } from '../lib/format';

export default function SessionView() {
  const { id } = useParams<{ id: string }>();
  const { api } = useAuth();
  const navigate = useNavigate();

  const { data: session, error, refresh } = usePolling<SessionDetail | null>(
    () => (id ? api<SessionDetail>(`/sessions/${id}`) : Promise.resolve(null)),
    3000,
    [id],
  );

  const [checking, setChecking] = useState(false);
  const [busy, setBusy] = useState<'reset' | 'stop' | 'start' | null>(null);
  const [notice, setNotice] = useState('');

  async function check() {
    if (!id) return;
    setChecking(true);
    setNotice('');
    try {
      await api(`/sessions/${id}/check`, { method: 'POST' });
      setNotice('Checks complete');
      refresh();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Check failed');
    } finally {
      setChecking(false);
    }
  }

  async function reset() {
    if (!id) return;
    if (!window.confirm('Reset the container? Your task progress will be cleared.')) return;
    setBusy('reset');
    setNotice('');
    try {
      await api(`/sessions/${id}/reset`, { method: 'POST' });
      setNotice('Lab reset — starting a fresh container');
      refresh();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Reset failed');
    } finally {
      setBusy(null);
    }
  }

  async function stop() {
    if (!id) return;
    if (!window.confirm('Stop the lab and remove your container?')) return;
    setBusy('stop');
    try {
      await api(`/sessions/${id}`, { method: 'DELETE' });
      navigate('/student');
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Could not stop the lab');
      setBusy(null);
    }
  }

  async function restart() {
    if (!session) return;
    setBusy('start');
    setNotice('');
    try {
      const started = await api<{ id: string }>('/sessions', {
        method: 'POST',
        body: { assignmentId: session.assignment.id },
      });
      refresh();
      navigate(`/student/session/${started.id}`, { replace: true });
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Could not start the lab');
    } finally {
      setBusy(null);
    }
  }

  if (error) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16">
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-5 py-4 text-sm text-rose-300">
          {error}
        </div>
        <Link to="/student" className="mt-4 inline-block text-xs text-indigo-300 hover:text-indigo-200">
          ← Back to my labs
        </Link>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-sm text-slate-500">Loading your lab…</div>
    );
  }

  if (session.status === 'starting') {
    const elapsed = Math.max(0, Math.floor((Date.now() - new Date(session.startedAt).getTime()) / 1000));
    return (
      <div className="mx-auto max-w-3xl px-4 py-16">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-8 text-center">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-slate-700 border-t-indigo-400" />
          <h1 className="mt-5 text-lg font-semibold text-slate-100">Provisioning your lab</h1>
          <p className="mt-1 text-sm text-slate-500">
            {session.assignment.lab.title} · {elapsed}s elapsed
          </p>

          <div className="mx-auto mt-6 max-w-sm space-y-2 text-left text-xs">
            <div className="flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 text-emerald-200">
              <span>✓</span> Container created and started
            </div>
            <div className="flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-amber-200">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-400 vlab-live-dot" />
              Starting the Docker daemon inside your container
            </div>
            <div className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2 text-slate-500">
              <span>3</span> Attaching the browser terminal
            </div>
          </div>

          <p className="mt-5 text-[11px] text-slate-600">
            This usually takes 5–15 seconds. The page updates automatically.
          </p>

          <button
            type="button"
            onClick={() => void stop()}
            disabled={busy === 'stop'}
            className="mt-5 rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-400 hover:border-rose-500/40 hover:text-rose-300 disabled:opacity-50"
          >
            {busy === 'stop' ? 'Stopping…' : 'Cancel and stop'}
          </button>
        </div>
      </div>
    );
  }

  if (session.status === 'error') {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16">
        <div className="rounded-2xl border border-rose-500/30 bg-rose-500/5 p-8 text-center">
          <h1 className="text-lg font-semibold text-rose-200">The lab could not start</h1>
          <p className="mx-auto mt-2 max-w-xl text-xs leading-relaxed text-rose-300/80">
            {session.errorMessage ?? 'Unknown provisioning error.'}
          </p>
          <div className="mt-5 flex justify-center gap-2">
            <button
              type="button"
              onClick={() => void reset()}
              disabled={busy === 'reset'}
              className="rounded-lg bg-rose-500 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-rose-400 disabled:opacity-50"
            >
              {busy === 'reset' ? 'Retrying…' : 'Try again'}
            </button>
            <Link
              to="/student"
              className="rounded-lg border border-slate-700 px-4 py-2 text-xs text-slate-300 hover:border-slate-500"
            >
              Back to my labs
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const completed = session.results.filter((result) => result.passed).length;
  const total = session.tasks.length;
  const lastChecked = session.results
    .map((result) => result.checkedAt)
    .filter(Boolean)
    .sort()
    .at(-1);

  return (
    <div className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link to="/student" className="text-xs text-slate-500 hover:text-slate-300">
          ← My labs
        </Link>
        <span className="text-slate-700">/</span>
        <h1 className="text-lg font-semibold text-slate-100">{session.assignment.lab.title}</h1>
        <StatusPill status={session.status} />
        <span className="text-xs text-slate-500">{session.assignment.class.name}</span>
        <div className="ml-auto flex items-center gap-3 text-[11px] text-slate-500">
          <span>Due {formatDue(session.assignment.dueAt)}</span>
          {session.containerName && (
            <span className="rounded border border-slate-800 bg-slate-900 px-2 py-1 font-mono text-[10px]">
              {session.containerName}
            </span>
          )}
        </div>
      </div>

      {notice && (
        <div className="mt-3 rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-3 py-2 text-xs text-indigo-200">
          {notice}
        </div>
      )}

      <div className="mt-5 grid gap-5 lg:grid-cols-[380px_minmax(0,1fr)]">
        <aside className="space-y-4">
          <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-slate-300">Task checklist</span>
              <span className="text-slate-500">
                {completed}/{total} passed
              </span>
            </div>
            <ProgressBar
              value={session.progress}
              tone={session.progress === 100 ? 'emerald' : 'indigo'}
              className="mt-2"
            />

            <div className="mt-4 space-y-2">
              {session.tasks.map((task) => {
                const result = session.results.find((r) => r.taskId === task.id);
                return (
                  <div
                    key={task.id}
                    className={cn(
                      'rounded-lg border px-3 py-2.5',
                      result?.passed
                        ? 'border-emerald-500/20 bg-emerald-500/5'
                        : 'border-slate-800 bg-slate-950/40',
                    )}
                  >
                    <div className="flex items-start gap-2.5">
                      <span
                        className={cn(
                          'mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10px]',
                          result?.passed
                            ? 'bg-emerald-500/20 text-emerald-300'
                            : 'bg-slate-800 text-slate-500',
                        )}
                      >
                        {result?.passed ? '✓' : task.order}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div
                          className={cn(
                            'text-xs font-medium',
                            result?.passed ? 'text-emerald-200' : 'text-slate-200',
                          )}
                        >
                          {task.title}
                        </div>
                        <p className="mt-1 whitespace-pre-line text-[11px] leading-relaxed text-slate-500">
                          {task.description}
                        </p>
                        {!result?.passed && result?.output && session.status === 'ready' && (
                          <pre className="mt-2 max-h-24 overflow-auto rounded border border-slate-800 bg-slate-950 p-2 font-mono text-[10px] leading-relaxed text-rose-300/80">
                            {result.output}
                          </pre>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <button
              type="button"
              onClick={() => void check()}
              disabled={checking || session.status !== 'ready'}
              className="mt-4 w-full rounded-lg bg-indigo-500 px-4 py-2.5 text-xs font-semibold text-white hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {checking ? 'Running checks…' : 'Check my work'}
            </button>
            <p className="mt-2 text-center text-[10px] text-slate-600">
              {lastChecked ? `Last checked ${timeAgo(lastChecked)} · ` : ''}
              automatic checks run every 30s
            </p>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/30 p-4 text-[11px] text-slate-500">
            <div className="flex items-center justify-between">
              <span>Last activity</span>
              <span className="text-slate-400">{timeAgo(session.lastActivityAt)}</span>
            </div>
            <div className="mt-1.5 flex items-center justify-between">
              <span>Resets</span>
              <span className="text-slate-400">{session.resetCount}</span>
            </div>
            <div className="mt-1.5 flex items-center justify-between">
              <span>Container</span>
              <span className="max-w-[180px] truncate font-mono text-[10px] text-slate-400">
                {session.containerId?.slice(0, 12) ?? 'none'}
              </span>
            </div>

            <div className="mt-3 flex gap-2 border-t border-slate-800 pt-3">
              <button
                type="button"
                onClick={() => void reset()}
                disabled={busy !== null}
                className="flex-1 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2 py-1.5 text-[11px] font-medium text-amber-300 hover:bg-amber-500/20 disabled:opacity-50"
              >
                Reset lab
              </button>
              <button
                type="button"
                onClick={() => void stop()}
                disabled={busy !== null}
                className="flex-1 rounded-lg border border-rose-500/30 bg-rose-500/10 px-2 py-1.5 text-[11px] font-medium text-rose-300 hover:bg-rose-500/20 disabled:opacity-50"
              >
                Stop lab
              </button>
            </div>
          </div>
        </aside>

        {session.status === 'ready' ? (
          <TerminalView sessionId={session.id} className="h-[calc(100vh-190px)] min-h-[460px]" />
        ) : (
          <div className="flex min-h-[460px] flex-col items-center justify-center rounded-xl border border-slate-800 bg-slate-900/30 p-8 text-center">
            <div className="text-sm font-medium text-slate-300">This lab is stopped</div>
            <p className="mt-1 max-w-sm text-xs text-slate-500">
              Your container was removed. Task results are kept. Start a fresh container to keep
              working.
            </p>
            <button
              type="button"
              onClick={() => void restart()}
              disabled={busy === 'start'}
              className="mt-4 rounded-lg bg-indigo-500 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-400 disabled:opacity-50"
            >
              {busy === 'start' ? 'Starting…' : 'Start lab again'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

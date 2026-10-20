import { lazy, Suspense, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { SessionDetail } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { ProgressBar } from '../components/ProgressBar';
import { StatusPill } from '../components/StatusPill';
import { TerminalView } from '../components/TerminalView';
import { usePolling } from '../hooks/usePolling';
import { cn, formatDue, timeAgo } from '../lib/format';

const WorkspaceFiles = lazy(() => import('../components/WorkspaceFiles'));
const DockerInspector = lazy(() => import('../components/DockerInspector'));

type WorkspaceTab = 'terminal' | 'code' | 'docker';

const workspaceTabs: { id: WorkspaceTab; label: string }[] = [
  { id: 'terminal', label: 'Terminal' },
  { id: 'code', label: 'Code' },
  { id: 'docker', label: 'Docker' },
];

function WorkspaceLoading({ label }: { label: string }) {
  return (
    <div className="grid h-full place-items-center text-xs text-slate-500">Loading {label}…</div>
  );
}

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
  const [workspaceTab, setWorkspaceTab] = useState<WorkspaceTab>('terminal');

  useEffect(() => {
    setWorkspaceTab('terminal');
  }, [id]);

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
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-800">
          {error}
        </div>
        <Link to="/student" className="mt-4 inline-block text-xs font-medium text-[#123a63] hover:underline">
          ← Back to my assignments
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
        <div className="vlab-card p-8 text-center">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-slate-200 border-t-[#123a63]" />
          <h1 className="mt-5 text-lg font-semibold text-slate-900">Preparing your lab</h1>
          <p className="mt-1 text-sm text-slate-500">
            {session.assignment.lab.title} · {elapsed}s elapsed
          </p>

          <div className="mx-auto mt-6 max-w-sm space-y-2 text-left text-xs">
            <div className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-800">
              <span>✓</span> Container created and started
            </div>
            <div className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-amber-800">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500 vlab-live-dot" />
              Starting the Docker daemon inside your container
            </div>
            <div className="flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-slate-500">
              <span>3</span> Attaching the browser terminal
            </div>
          </div>

          <p className="mt-5 text-[11px] text-slate-500">
            This usually takes 5–15 seconds. The page updates automatically.
          </p>

          <button
            type="button"
            onClick={() => void stop()}
            disabled={busy === 'stop'}
            className="vlab-button-secondary mt-5 px-3 py-2 text-xs"
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
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-8 text-center">
          <h1 className="text-lg font-semibold text-rose-900">The lab could not start</h1>
          <p className="mx-auto mt-2 max-w-xl whitespace-pre-line text-xs leading-relaxed text-rose-800">
            {session.errorMessage ?? 'Unknown provisioning error.'}
          </p>
          <div className="mt-5 flex justify-center gap-2">
            <button
              type="button"
              onClick={() => void reset()}
              disabled={busy === 'reset'}
              className="rounded-md bg-rose-700 px-4 py-2 text-xs font-semibold text-white hover:bg-rose-800 disabled:opacity-50"
            >
              {busy === 'reset' ? 'Retrying…' : 'Try again'}
            </button>
            <Link to="/student" className="vlab-button-secondary px-4 py-2 text-xs">
              Back to my assignments
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
        <Link to="/student" className="text-xs font-medium text-slate-500 hover:text-slate-800">
          ← My assignments
        </Link>
        <span className="text-slate-300">/</span>
        <h1 className="text-lg font-semibold text-slate-900">{session.assignment.lab.title}</h1>
        <StatusPill status={session.status} />
        <span className="text-xs text-slate-500">{session.assignment.class.name}</span>
        <div className="ml-auto flex flex-wrap items-center gap-3 text-[11px] text-slate-500">
          <span>Due {formatDue(session.assignment.dueAt)}</span>
          {session.containerName && (
            <span className="rounded border border-slate-200 bg-white px-2 py-1 font-mono text-[10px] text-slate-600">
              {session.containerName}
            </span>
          )}
        </div>
      </div>

      {notice && (
        <div className="mt-3 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800">
          {notice}
        </div>
      )}

      <div className="mt-5 grid gap-5 lg:grid-cols-[380px_minmax(0,1fr)]">
        <aside className="space-y-4">
          <div className="vlab-card p-4">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-slate-900">Task checklist</span>
              <span className="text-slate-500">
                {completed}/{total} passed
              </span>
            </div>
            <ProgressBar
              value={session.progress}
              tone={session.progress === 100 ? 'emerald' : 'navy'}
              className="mt-2"
            />

            <div className="mt-4 space-y-2">
              {session.tasks.map((task) => {
                const result = session.results.find((r) => r.taskId === task.id);
                return (
                  <div
                    key={task.id}
                    className={cn(
                      'rounded-md border px-3 py-2.5',
                      result?.passed
                        ? 'border-emerald-200 bg-emerald-50'
                        : 'border-slate-200 bg-white',
                    )}
                  >
                    <div className="flex items-start gap-2.5">
                      <span
                        className={cn(
                          'mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10px]',
                          result?.passed
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-slate-100 text-slate-500',
                        )}
                      >
                        {result?.passed ? '✓' : task.order}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div
                          className={cn(
                            'text-xs font-medium',
                            result?.passed ? 'text-emerald-900' : 'text-slate-800',
                          )}
                        >
                          {task.title}
                        </div>
                        <p className="mt-1 whitespace-pre-line text-[11px] leading-relaxed text-slate-500">
                          {task.description}
                        </p>
                        {!result?.passed && result?.output && session.status === 'ready' && (
                          <pre className="mt-2 max-h-24 overflow-auto rounded border border-rose-200 bg-rose-50 p-2 font-mono text-[10px] leading-relaxed text-rose-700">
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
              className="vlab-button-primary mt-4 w-full py-2.5 text-xs"
            >
              {checking ? 'Running checks…' : 'Check my work'}
            </button>
            <p className="mt-2 text-center text-[10px] text-slate-500">
              {lastChecked ? `Last checked ${timeAgo(lastChecked)} · ` : ''}
              automatic checks run every 30s
            </p>
          </div>

          <div className="vlab-card p-4 text-[11px] text-slate-500">
            <div className="flex items-center justify-between">
              <span>Last activity</span>
              <span className="text-slate-700">{timeAgo(session.lastActivityAt)}</span>
            </div>
            <div className="mt-1.5 flex items-center justify-between">
              <span>Resets</span>
              <span className="text-slate-700">{session.resetCount}</span>
            </div>
            <div className="mt-1.5 flex items-center justify-between">
              <span>Container</span>
              <span className="max-w-[180px] truncate font-mono text-[10px] text-slate-700">
                {session.containerId?.slice(0, 12) ?? 'none'}
              </span>
            </div>

            <div className="mt-3 flex gap-2 border-t border-slate-200 pt-3">
              <button
                type="button"
                onClick={() => void reset()}
                disabled={busy !== null}
                className="flex-1 rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11px] font-medium text-amber-800 hover:bg-amber-100 disabled:opacity-50"
              >
                Reset lab
              </button>
              <button
                type="button"
                onClick={() => void stop()}
                disabled={busy !== null}
                className="flex-1 rounded-md border border-rose-200 bg-rose-50 px-2 py-1.5 text-[11px] font-medium text-rose-700 hover:bg-rose-100 disabled:opacity-50"
              >
                Stop lab
              </button>
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-[11px] leading-relaxed text-slate-500">
            Submit your screenshots or document from{' '}
            <Link to="/student" className="font-medium text-[#123a63] hover:underline">
              My assignments
            </Link>
            . Task checks are independent of your evidence file.
          </div>
        </aside>

        {session.status === 'ready' ? (
          <section className="flex h-[calc(100vh-190px)] min-h-[460px] flex-col overflow-hidden rounded-lg border border-slate-200 bg-white">
            <div
              role="tablist"
              aria-label="Lab workspace"
              className="flex shrink-0 items-end gap-1 border-b border-slate-200 bg-slate-50 px-2 pt-2"
            >
              {workspaceTabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={workspaceTab === tab.id}
                  onClick={() => setWorkspaceTab(tab.id)}
                  className={cn(
                    'rounded-t border border-b-0 px-3 py-1.5 text-[11px] font-medium',
                    workspaceTab === tab.id
                      ? 'border-slate-200 bg-white text-slate-900'
                      : 'border-transparent text-slate-500 hover:text-slate-800',
                  )}
                >
                  {tab.label}
                </button>
              ))}
              <span className="ml-auto pb-2 pr-1 text-[10px] text-slate-400">
                {workspaceTab === 'code'
                  ? 'Files under /root'
                  : workspaceTab === 'docker'
                    ? 'Inner Docker daemon'
                    : 'Live shell'}
              </span>
            </div>

            <div className="min-h-0 flex-1">
              {workspaceTab === 'terminal' && (
                <TerminalView bare sessionId={session.id} className="h-full" />
              )}
              {workspaceTab === 'code' && (
                <Suspense fallback={<WorkspaceLoading label="editor" />}>
                  <WorkspaceFiles sessionId={session.id} />
                </Suspense>
              )}
              {workspaceTab === 'docker' && (
                <Suspense fallback={<WorkspaceLoading label="Docker objects" />}>
                  <DockerInspector sessionId={session.id} />
                </Suspense>
              )}
            </div>
          </section>
        ) : (
          <div className="flex min-h-[460px] flex-col items-center justify-center rounded-lg border border-slate-200 bg-white p-8 text-center">
            <div className="text-sm font-medium text-slate-800">This lab is stopped</div>
            <p className="mt-1 max-w-sm text-xs text-slate-500">
              Your container was removed. Task results are kept. Start a fresh container to keep
              working.
            </p>
            <button
              type="button"
              onClick={() => void restart()}
              disabled={busy === 'start'}
              className="vlab-button-primary mt-4 px-4 py-2 text-xs"
            >
              {busy === 'start' ? 'Starting…' : 'Start lab again'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ClassSummary, StudentAssignment } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { ProgressBar } from '../components/ProgressBar';
import { StatusPill } from '../components/StatusPill';
import { usePolling } from '../hooks/usePolling';
import { cn, formatDue } from '../lib/format';

export default function StudentLabs() {
  const { api, user } = useAuth();
  const navigate = useNavigate();

  const { data: classes, refresh: refreshClasses } = usePolling<ClassSummary[]>(
    () => api('/classes'),
    15000,
    [],
  );
  const { data: assignments, refresh } = usePolling<StudentAssignment[]>(
    () => api('/assignments/mine'),
    4000,
    [],
  );

  const [code, setCode] = useState('');
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState('');
  const [starting, setStarting] = useState<string | null>(null);
  const [notice, setNotice] = useState('');

  const hasClass = (classes?.length ?? 0) > 0;

  async function joinClass(event: FormEvent) {
    event.preventDefault();
    setJoining(true);
    setJoinError('');
    try {
      await api('/classes/join', { method: 'POST', body: { code } });
      setCode('');
      setNotice('Joined the class');
      refreshClasses();
      refresh();
    } catch (err) {
      setJoinError(err instanceof Error ? err.message : 'Could not join');
    } finally {
      setJoining(false);
    }
  }

  async function openLab(assignment: StudentAssignment) {
    if (assignment.session?.id) {
      navigate(`/student/session/${assignment.session.id}`);
      return;
    }

    setStarting(assignment.id);
    setNotice('');
    try {
      const session = await api<{ id: string }>('/sessions', {
        method: 'POST',
        body: { assignmentId: assignment.id },
      });
      refresh();
      navigate(`/student/session/${session.id}`);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Could not start the lab');
    } finally {
      setStarting(null);
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Student workspace</div>
          <h1 className="mt-1 text-2xl font-semibold text-slate-100">
            Hello, {user?.name.split(' ')[0] ?? 'student'}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Start a lab to get your own isolated container. Everything runs in the browser.
          </p>
        </div>

        {hasClass && (
          <form onSubmit={(event) => void joinClass(event)} className="flex items-end gap-2">
            <label className="block text-[11px] text-slate-500">
              Join another class
              <input
                value={code}
                onChange={(event) => setCode(event.target.value.toUpperCase())}
                placeholder="CLASS CODE"
                className="mt-1 block w-40 rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 font-mono text-xs tracking-[0.15em] text-slate-100 outline-none focus:border-indigo-500/60"
              />
            </label>
            <button
              type="submit"
              disabled={joining || code.trim().length === 0}
              className="rounded-lg border border-slate-700 px-3 py-2 text-xs font-medium text-slate-300 hover:border-indigo-500/50 disabled:opacity-40"
            >
              {joining ? 'Joining…' : 'Join'}
            </button>
          </form>
        )}
      </div>

      {(notice || joinError) && (
        <div
          className={cn(
            'mt-4 rounded-lg border px-3 py-2 text-xs',
            joinError
              ? 'border-rose-500/30 bg-rose-500/10 text-rose-300'
              : 'border-indigo-500/30 bg-indigo-500/10 text-indigo-200',
          )}
        >
          {joinError || notice}
        </div>
      )}

      {!hasClass && (
        <div className="mt-8 rounded-2xl border border-slate-800 bg-slate-900/40 p-8">
          <div className="mx-auto max-w-md text-center">
            <div className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-indigo-500/15 text-xl text-indigo-300 ring-1 ring-indigo-500/30">
              ⇥
            </div>
            <h2 className="mt-4 text-lg font-semibold text-slate-100">Join your class</h2>
            <p className="mt-1 text-sm text-slate-500">
              Ask your teacher for the six-character class code. Once you join, your assigned labs
              appear here.
            </p>
            <form onSubmit={(event) => void joinClass(event)} className="mt-5 flex gap-2">
              <input
                value={code}
                onChange={(event) => setCode(event.target.value.toUpperCase())}
                placeholder="CBADL1"
                className="flex-1 rounded-lg border border-slate-800 bg-slate-950 px-3 py-2.5 text-center font-mono text-sm tracking-[0.3em] text-slate-100 outline-none focus:border-indigo-500/60"
              />
              <button
                type="submit"
                disabled={joining || code.trim().length === 0}
                className="rounded-lg bg-indigo-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-400 disabled:opacity-50"
              >
                {joining ? 'Joining…' : 'Join class'}
              </button>
            </form>
            {joinError && <div className="mt-3 text-xs text-rose-300">{joinError}</div>}
          </div>
        </div>
      )}

      {hasClass && (
        <div className="mt-8 grid gap-4 lg:grid-cols-2">
          {(assignments ?? []).map((assignment) => {
            const passed = assignment.results.filter((result) => result.passed).length;
            const total = assignment.lab.tasks.length;
            const progress = total ? Math.round((passed / total) * 100) : 0;
            const busy = starting === assignment.id;
            const status = assignment.session?.status;

            return (
              <article
                key={assignment.id}
                className="flex flex-col rounded-2xl border border-slate-800 bg-slate-900/40 p-5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h2 className="truncate text-base font-semibold text-slate-100">
                        {assignment.lab.title}
                      </h2>
                      <span className="shrink-0 rounded-full bg-slate-800 px-2 py-0.5 text-[10px] uppercase tracking-wider text-slate-400">
                        {assignment.lab.template}
                      </span>
                    </div>
                    <p className="mt-1 truncate text-xs text-slate-500">
                      {assignment.class.name} · {assignment.class.teacherName}
                    </p>
                  </div>
                  <StatusPill status={status} />
                </div>

                <p className="mt-3 line-clamp-2 text-xs leading-relaxed text-slate-500">
                  {assignment.lab.description}
                </p>

                <div className="mt-4 space-y-1.5">
                  {assignment.lab.tasks.map((task) => {
                    const result = assignment.results.find((r) => r.taskId === task.id);
                    return (
                      <div
                        key={task.id}
                        className={cn(
                          'flex items-center gap-2.5 rounded-lg border px-3 py-2 text-xs',
                          result?.passed
                            ? 'border-emerald-500/20 bg-emerald-500/5 text-emerald-200'
                            : 'border-slate-800 bg-slate-950/40 text-slate-400',
                        )}
                      >
                        <span
                          className={cn(
                            'grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10px]',
                            result?.passed
                              ? 'bg-emerald-500/20 text-emerald-300'
                              : 'bg-slate-800 text-slate-500',
                          )}
                        >
                          {result?.passed ? '✓' : task.order}
                        </span>
                        <span className="truncate">{task.title}</span>
                      </div>
                    );
                  })}
                </div>

                <div className="mt-4">
                  <div className="flex items-center justify-between text-[11px] text-slate-500">
                    <span>
                      {passed}/{total} tasks passed
                    </span>
                    <span>{progress}%</span>
                  </div>
                  <ProgressBar
                    value={progress}
                    tone={progress === 100 ? 'emerald' : 'indigo'}
                    className="mt-1.5"
                  />
                </div>

                <div className="mt-4 flex items-center justify-between gap-3 border-t border-slate-800 pt-4">
                  <span className="text-[11px] text-slate-500">
                    Due {formatDue(assignment.dueAt)}
                  </span>
                  <button
                    type="button"
                    onClick={() => void openLab(assignment)}
                    disabled={busy}
                    className={cn(
                      'rounded-lg px-4 py-2 text-xs font-semibold transition disabled:opacity-50',
                      status === 'ready'
                        ? 'bg-emerald-500 text-slate-950 hover:bg-emerald-400'
                        : 'bg-indigo-500 text-white hover:bg-indigo-400',
                    )}
                  >
                    {busy
                      ? 'Starting…'
                      : status === 'ready'
                        ? 'Open lab'
                        : status === 'starting'
                          ? 'View progress'
                          : assignment.session
                            ? 'Reopen lab'
                            : 'Start lab'}
                  </button>
                </div>
              </article>
            );
          })}

          {assignments && assignments.length === 0 && (
            <div className="rounded-2xl border border-dashed border-slate-800 px-6 py-16 text-center lg:col-span-2">
              <div className="text-sm text-slate-300">No labs assigned yet.</div>
              <div className="mt-1 text-xs text-slate-500">
                Your teacher has not assigned a lab to this class.
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

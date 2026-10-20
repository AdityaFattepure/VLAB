import { useMemo, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ClassSummary, StudentAssignment } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { ProgressBar } from '../components/ProgressBar';
import { StatusPill, SubmissionBadge } from '../components/StatusPill';
import { SubmissionModal } from '../components/SubmissionModal';
import { usePolling } from '../hooks/usePolling';
import { cn, formatDue } from '../lib/format';

function taskSummary(assignment: StudentAssignment) {
  const passed = assignment.results.filter((result) => result.passed).length;
  const total = assignment.lab.tasks.length;
  return {
    passed,
    total,
    progress: total ? Math.round((passed / total) * 100) : 0,
  };
}

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
  const [submitting, setSubmitting] = useState<StudentAssignment | null>(null);

  const hasClass = (classes?.length ?? 0) > 0;
  const classesLoaded = classes !== null;

  const grouped = useMemo(() => {
    const list = classes ?? [];
    return list.map((klass) => ({
      klass,
      items: (assignments ?? []).filter((assignment) => assignment.class.id === klass.id),
    }));
  }, [classes, assignments]);

  const stats = useMemo(() => {
    const list = assignments ?? [];
    return {
      assigned: list.length,
      passed: list.reduce((sum, item) => sum + item.results.filter((r) => r.passed).length, 0),
      evidence: list.filter((item) => item.submission && item.submission.status !== 'draft').length,
    };
  }, [assignments]);

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
      setJoinError(err instanceof Error ? err.message : 'Could not join the class');
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
          <div className="vlab-eyebrow">Student workspace</div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">
            Hello, {user?.name.split(' ')[0] ?? 'student'}
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">
            Open a lab to get your own isolated container. Finish the checks, then submit your
            screenshots or document as evidence.
          </p>
        </div>

        {hasClass && (
          <form onSubmit={(event) => void joinClass(event)} className="flex items-end gap-2">
            <label className="block">
              <span className="vlab-label">Join another class</span>
              <input
                value={code}
                onChange={(event) => setCode(event.target.value.toUpperCase())}
                placeholder="CLASS CODE"
                className="vlab-input w-40 font-mono text-xs tracking-[0.12em]"
              />
            </label>
            <button
              type="submit"
              disabled={joining || code.trim().length === 0}
              className="vlab-button-secondary px-3 py-2 text-xs"
            >
              {joining ? 'Joining…' : 'Join'}
            </button>
          </form>
        )}
      </div>

      {(notice || joinError) && (
        <div
          role={joinError ? 'alert' : 'status'}
          className={cn(
            'mt-4 rounded-md border px-3 py-2 text-xs',
            joinError
              ? 'border-rose-200 bg-rose-50 text-rose-700'
              : 'border-blue-200 bg-blue-50 text-blue-800',
          )}
        >
          {joinError || notice}
        </div>
      )}

      {classesLoaded && !hasClass && (
        <div className="vlab-card mt-8 p-8">
          <div className="mx-auto max-w-md text-center">
            <div className="mx-auto grid h-12 w-12 place-items-center rounded-md bg-slate-100 text-lg text-slate-600">
              +
            </div>
            <h2 className="mt-4 text-lg font-semibold text-slate-900">Join your class</h2>
            <p className="mt-1 text-sm text-slate-500">
              Ask your teacher for the six-character class code. Once you join, the assigned labs
              and submission instructions appear here.
            </p>
            <form onSubmit={(event) => void joinClass(event)} className="mt-5 flex gap-2">
              <input
                value={code}
                onChange={(event) => setCode(event.target.value.toUpperCase())}
                placeholder="CBADL1"
                className="vlab-input flex-1 text-center font-mono text-sm tracking-[0.22em]"
              />
              <button
                type="submit"
                disabled={joining || code.trim().length === 0}
                className="vlab-button-primary"
              >
                {joining ? 'Joining…' : 'Join class'}
              </button>
            </form>
            {joinError && <div className="mt-3 text-xs text-rose-700">{joinError}</div>}
          </div>
        </div>
      )}

      {hasClass && (
        <>
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            {[
              { label: 'Assigned labs', value: stats.assigned, hint: 'across your classes' },
              { label: 'Checks passed', value: stats.passed, hint: 'task checks completed' },
              { label: 'Evidence submitted', value: stats.evidence, hint: 'files or notes sent' },
            ].map((stat) => (
              <div key={stat.label} className="vlab-card px-4 py-3">
                <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-slate-500">
                  {stat.label}
                </div>
                <div className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">{stat.value}</div>
                <div className="mt-0.5 text-[11px] text-slate-500">{stat.hint}</div>
              </div>
            ))}
          </div>

          <div className="mt-8 space-y-8">
            {grouped.map(({ klass, items }) => (
              <section key={klass.id}>
                <div className="mb-3 flex flex-wrap items-end justify-between gap-2 border-b border-slate-200 pb-3">
                  <div>
                    <h2 className="text-base font-semibold text-slate-900">{klass.name}</h2>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {klass.teacherName ? `${klass.teacherName} · ` : ''}
                      {klass.schedule || 'Schedule not set'}
                      {klass.room ? ` · ${klass.room}` : ''}
                    </p>
                  </div>
                  <span className="rounded border border-slate-200 bg-white px-2 py-1 font-mono text-[11px] tracking-[0.12em] text-slate-600">
                    {klass.joinCode}
                  </span>
                </div>

                {items.length === 0 && (
                  <div className="rounded-lg border border-dashed border-slate-300 px-6 py-10 text-center text-sm text-slate-500">
                    No labs assigned to this class yet.
                  </div>
                )}

                <div className="grid gap-4 lg:grid-cols-2">
                  {items.map((assignment) => {
                    const { passed, total, progress } = taskSummary(assignment);
                    const busy = starting === assignment.id;
                    const status = assignment.session?.status;
                    const submission = assignment.submission;

                    return (
                      <article key={assignment.id} className="vlab-card flex flex-col p-5">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-600">
                                {assignment.lab.code || 'Lab'}
                              </span>
                              {assignment.lab.co && (
                                <span className="text-[10px] font-medium text-slate-500">{assignment.lab.co}</span>
                              )}
                              <StatusPill status={status} />
                            </div>
                            <h3 className="mt-2 text-base font-semibold text-slate-900">
                              {assignment.lab.title}
                            </h3>
                            <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-slate-500">
                              {assignment.lab.objective || assignment.lab.description}
                            </p>
                          </div>
                          <SubmissionBadge status={submission?.status} />
                        </div>

                        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-500">
                          <span>Due {formatDue(assignment.dueAt)}</span>
                          <span>{assignment.lab.estimatedMinutes} min</span>
                          {assignment.requiresSubmission && <span>Evidence required</span>}
                        </div>

                        {assignment.instructions && (
                          <p className="mt-2 line-clamp-2 text-xs text-slate-500">{assignment.instructions}</p>
                        )}

                        <div className="mt-4">
                          <div className="flex items-center justify-between text-[11px] text-slate-500">
                            <span>
                              {passed}/{total} checks passed
                            </span>
                            <span>{progress}%</span>
                          </div>
                          <ProgressBar
                            value={progress}
                            tone={progress === 100 ? 'emerald' : 'navy'}
                            className="mt-1.5"
                          />
                        </div>

                        <div className="mt-3 space-y-1.5">
                          {assignment.lab.tasks.slice(0, 5).map((task) => {
                            const result = assignment.results.find((r) => r.taskId === task.id);
                            return (
                              <div
                                key={task.id}
                                className={cn(
                                  'flex items-center gap-2.5 rounded border px-2.5 py-1.5 text-xs',
                                  result?.passed
                                    ? 'border-emerald-100 bg-emerald-50 text-emerald-900'
                                    : 'border-slate-200 bg-white text-slate-600',
                                )}
                              >
                                <span
                                  className={cn(
                                    'grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10px]',
                                    result?.passed
                                      ? 'bg-emerald-100 text-emerald-700'
                                      : 'bg-slate-100 text-slate-500',
                                  )}
                                >
                                  {result?.passed ? '✓' : task.order}
                                </span>
                                <span className="truncate">{task.title}</span>
                              </div>
                            );
                          })}
                          {assignment.lab.tasks.length > 5 && (
                            <div className="text-[11px] text-slate-500">
                              + {assignment.lab.tasks.length - 5} more checks in the lab
                            </div>
                          )}
                        </div>

                        {submission?.status === 'reviewed' && (
                          <div className="mt-3 rounded-md border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
                            <span className="font-medium">
                              Reviewed{submission.grade !== null ? ` · ${submission.grade}/100` : ''}
                            </span>
                            {submission.feedback && <p className="mt-1">{submission.feedback}</p>}
                          </div>
                        )}

                        <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-4">
                          <span className="text-[11px] text-slate-500">
                            {assignment.session
                              ? 'Your container is kept between visits'
                              : 'No container started yet'}
                          </span>
                          <div className="flex items-center gap-2">
                            {assignment.requiresSubmission && (
                              <button
                                type="button"
                                onClick={() => setSubmitting(assignment)}
                                className="vlab-button-secondary px-3 py-1.5 text-xs"
                              >
                                {submission ? 'View / resubmit' : 'Submit evidence'}
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => void openLab(assignment)}
                              disabled={busy}
                              className={cn(
                                'rounded-md px-3 py-1.5 text-xs font-semibold transition disabled:opacity-50',
                                status === 'ready'
                                  ? 'bg-emerald-700 text-white hover:bg-emerald-800'
                                  : 'bg-[#123a63] text-white hover:bg-[#0b2744]',
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
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            ))}

            {classesLoaded && hasClass && (assignments?.length ?? 0) === 0 && (
              <div className="rounded-lg border border-dashed border-slate-300 px-6 py-16 text-center">
                <div className="text-sm font-medium text-slate-700">No labs assigned yet.</div>
                <div className="mt-1 text-xs text-slate-500">
                  Your teacher has not assigned a lab to your class yet.
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {submitting && (
        <SubmissionModal
          assignment={submitting}
          onClose={() => setSubmitting(null)}
          onSaved={() => {
            refresh();
            setNotice('Evidence submitted');
          }}
        />
      )}
    </div>
  );
}

import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type {
  ClassSummary,
  Dashboard,
  Lab,
  SubmissionRoster,
} from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { ProgressBar } from '../components/ProgressBar';
import { StatusPill, SubmissionBadge } from '../components/StatusPill';
import { StudentDrawer } from '../components/StudentDrawer';
import { SubmissionFileLink } from '../components/SubmissionFileLink';
import { usePolling } from '../hooks/usePolling';
import { cn, formatDue, initials, timeAgo } from '../lib/format';

export default function TeacherDashboard() {
  const { id } = useParams<{ id: string }>();
  const classId = id ?? '';
  const { api } = useAuth();
  const navigate = useNavigate();

  const [assignmentId, setAssignmentId] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [notice, setNotice] = useState('');
  const [showAssign, setShowAssign] = useState(false);
  const [assignForm, setAssignForm] = useState({
    labId: '',
    dueAt: '',
    instructions: '',
    requiresSubmission: true,
  });
  const [assignBusy, setAssignBusy] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [editForm, setEditForm] = useState({
    courseShort: '',
    section: '',
    batch: '',
    schedule: '',
    room: '',
  });
  const [editBusy, setEditBusy] = useState(false);
  const [reviewFor, setReviewFor] = useState<string | null>(null);
  const [reviewForm, setReviewForm] = useState({ feedback: '', grade: '' });
  const [reviewBusy, setReviewBusy] = useState(false);

  const { data: classes } = usePolling<ClassSummary[]>(() => api('/classes'), 20000, []);
  const { data: labs } = usePolling<Lab[]>(() => api('/labs'), 30000, []);
  const {
    data: dashboard,
    error,
    refresh,
  } = usePolling<Dashboard | null>(
    () =>
      classId
        ? api<Dashboard>(
            `/classes/${classId}/dashboard${assignmentId ? `?assignmentId=${assignmentId}` : ''}`,
          )
        : Promise.resolve(null),
    4000,
    [classId, assignmentId],
  );

  const activeAssignmentId = assignmentId || dashboard?.assignment?.id || '';
  const { data: roster, refresh: refreshRoster } = usePolling<SubmissionRoster | null>(
    () =>
      activeAssignmentId
        ? api<SubmissionRoster>(`/assignments/${activeAssignmentId}/submissions`)
        : Promise.resolve(null),
    8000,
    [activeAssignmentId],
  );

  useEffect(() => {
    setAssignmentId('');
    setSelectedId(null);
    setShowAssign(false);
    setShowEdit(false);
  }, [classId]);

  useEffect(() => {
    if (dashboard?.assignment && dashboard.class.id === classId && !assignmentId) {
      setAssignmentId(dashboard.assignment.id);
    }
  }, [dashboard?.assignment?.id, dashboard?.class.id, classId, assignmentId]);

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
      setNotice(`Stopped ${result.stopped} lab session${result.stopped === 1 ? '' : 's'}`);
      refresh();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Could not stop the labs');
    }
  }

  function openEdit() {
    if (!dashboard) return;
    setEditForm({
      courseShort: dashboard.class.courseShort,
      section: dashboard.class.section,
      batch: dashboard.class.batch,
      schedule: dashboard.class.schedule,
      room: dashboard.class.room,
    });
    setShowEdit(true);
  }

  async function saveClass(event: FormEvent) {
    event.preventDefault();
    if (!dashboard) return;
    setEditBusy(true);
    setNotice('');
    try {
      await api(`/classes/${dashboard.class.id}`, {
        method: 'PATCH',
        body: editForm,
      });
      setShowEdit(false);
      setNotice('Class details updated');
      refresh();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Could not update the class');
    } finally {
      setEditBusy(false);
    }
  }

  function openAssignPanel() {
    const defaultDue = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    setAssignForm((current) => ({
      ...current,
      labId: current.labId || labs?.[0]?.id || '',
      dueAt: current.dueAt || defaultDue.toISOString().slice(0, 16),
    }));
    setShowAssign(true);
  }

  async function assignLab(event: FormEvent) {
    event.preventDefault();
    if (!assignForm.labId) return;
    setAssignBusy(true);
    setNotice('');
    try {
      const created = await api<{ id: string }>('/assignments', {
        method: 'POST',
        body: {
          labId: assignForm.labId,
          classId,
          dueAt: assignForm.dueAt ? new Date(assignForm.dueAt).toISOString() : null,
          instructions: assignForm.instructions,
          requiresSubmission: assignForm.requiresSubmission,
        },
      });
      setAssignmentId(created.id);
      setShowAssign(false);
      setNotice('Lab assigned to this class');
      refresh();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Could not assign the lab');
    } finally {
      setAssignBusy(false);
    }
  }

  async function removeAssignment() {
    if (!dashboard?.assignment) return;
    if (!window.confirm(`Remove "${dashboard.assignment.labTitle}" from this class?`)) return;
    try {
      await api(`/assignments/${dashboard.assignment.id}`, { method: 'DELETE' });
      setAssignmentId('');
      setNotice('Assignment removed');
      refresh();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Could not remove the assignment');
    }
  }

  async function saveReview(event: FormEvent, studentId: string) {
    event.preventDefault();
    if (!activeAssignmentId) return;
    setReviewBusy(true);
    try {
      await api(`/assignments/${activeAssignmentId}/submission/review`, {
        method: 'POST',
        body: {
          studentId,
          feedback: reviewForm.feedback,
          grade: reviewForm.grade === '' ? null : Number(reviewForm.grade),
        },
      });
      setReviewFor(null);
      setReviewForm({ feedback: '', grade: '' });
      setNotice('Review saved');
      refreshRoster();
      refresh();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Could not save the review');
    } finally {
      setReviewBusy(false);
    }
  }

  function startReview(studentId: string, feedback: string, grade: number | null) {
    setReviewFor(studentId);
    setReviewForm({ feedback, grade: grade === null ? '' : String(grade) });
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <Link to="/teacher" className="hover:text-slate-800">
              Classes
            </Link>
            <span aria-hidden>/</span>
            <span className="text-slate-700">{dashboard?.class.name ?? 'Class workspace'}</span>
          </div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">
            {dashboard?.class.name ?? 'Loading class…'}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {dashboard?.class.courseTitle ?? 'Container Based Application Development Lab'}
            {dashboard?.class.schedule ? ` · ${dashboard.class.schedule}` : ''}
            {dashboard?.class.room && !dashboard.class.schedule.includes(dashboard.class.room)
              ? ` · ${dashboard.class.room}`
              : ''}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {classes && classes.length > 0 && (
            <label className="flex items-center gap-2 text-xs text-slate-500">
              <span className="sr-only">Switch class</span>
              <select
                value={classId}
                onChange={(event) => navigate(`/teacher/classes/${event.target.value}`)}
                className="vlab-input w-auto py-1.5 text-xs"
              >
                {classes.map((klass) => (
                  <option key={klass.id} value={klass.id}>
                    {klass.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {dashboard && (
            <button
              type="button"
              onClick={() => void copyJoinCode()}
              className="vlab-button-secondary px-3 py-1.5 text-xs"
              title="Students join with this code"
            >
              <span className="text-slate-500">Join code</span>
              <span className="font-mono font-semibold tracking-[0.14em] text-[#123a63]">
                {dashboard.class.joinCode}
              </span>
              <span className="text-[10px] text-slate-400">{copied ? 'copied' : 'copy'}</span>
            </button>
          )}
          {dashboard && (
            <button type="button" onClick={openEdit} className="vlab-button-secondary px-3 py-1.5 text-xs">
              Edit class
            </button>
          )}
        </div>
      </div>

      {showEdit && dashboard && (
        <form onSubmit={(event) => void saveClass(event)} className="vlab-card mt-4 p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Class details</h2>
              <p className="mt-0.5 text-xs text-slate-500">
                Change the subject, section, batch, schedule, or room. The join code and roster stay
                the same.
              </p>
            </div>
            <span className="text-[10px] uppercase tracking-wider text-slate-500">
              {dashboard.class.courseCode}
            </span>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="block">
              <span className="vlab-label">Subject</span>
              <input
                value={editForm.courseShort}
                onChange={(event) => setEditForm({ ...editForm, courseShort: event.target.value })}
                className="vlab-input"
                required
              />
            </label>
            <label className="block">
              <span className="vlab-label">Section</span>
              <input
                value={editForm.section}
                onChange={(event) => setEditForm({ ...editForm, section: event.target.value })}
                className="vlab-input"
                required
              />
            </label>
            <label className="block">
              <span className="vlab-label">Batch</span>
              <input
                value={editForm.batch}
                onChange={(event) => setEditForm({ ...editForm, batch: event.target.value })}
                className="vlab-input"
                placeholder="A, B, …"
              />
            </label>
            <label className="block">
              <span className="vlab-label">Room</span>
              <input
                value={editForm.room}
                onChange={(event) => setEditForm({ ...editForm, room: event.target.value })}
                className="vlab-input"
              />
            </label>
          </div>
          <label className="mt-3 block">
            <span className="vlab-label">Schedule</span>
            <input
              value={editForm.schedule}
              onChange={(event) => setEditForm({ ...editForm, schedule: event.target.value })}
              className="vlab-input"
              placeholder="Monday · 10:00–12:00"
            />
          </label>
          <div className="mt-3 flex justify-end gap-2">
            <button type="button" onClick={() => setShowEdit(false)} className="vlab-button-secondary px-3 py-1.5 text-xs">
              Cancel
            </button>
            <button type="submit" disabled={editBusy} className="vlab-button-primary px-3 py-1.5 text-xs">
              {editBusy ? 'Saving…' : 'Save class'}
            </button>
          </div>
        </form>
      )}

      {error && (
        <div role="alert" className="mt-4 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
          {error}
        </div>
      )}
      {notice && (
        <div role="status" className="mt-4 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800">
          {notice}
        </div>
      )}

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'Students', value: dashboard?.totals.students ?? '—', hint: 'enrolled in this batch' },
          { label: 'Live labs', value: dashboard?.totals.running ?? '—', hint: 'containers ready now' },
          { label: 'Completed', value: dashboard?.totals.completed ?? '—', hint: 'all checks passed' },
          {
            label: 'Evidence',
            value: dashboard
              ? `${dashboard.totals.submitted}/${dashboard.totals.students}`
              : '—',
            hint: `${dashboard?.totals.reviewed ?? 0} reviewed`,
          },
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

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <section className="min-w-0">
          <div className="vlab-card mb-4 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="vlab-eyebrow">Assignment</span>
                {(dashboard?.assignments.length ?? 0) > 0 ? (
                  <select
                    value={activeAssignmentId}
                    onChange={(event) => setAssignmentId(event.target.value)}
                    className="vlab-input w-auto py-1.5 text-sm"
                    aria-label="Select assignment"
                  >
                    {dashboard?.assignments.map((assignment) => (
                      <option key={assignment.id} value={assignment.id}>
                        {assignment.labCode ? `${assignment.labCode} — ` : ''}
                        {assignment.labTitle}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="text-sm font-medium text-slate-800">No assignment yet</span>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button type="button" onClick={openAssignPanel} className="vlab-button-secondary px-3 py-1.5 text-xs">
                  Assign a lab
                </button>
                <button
                  type="button"
                  onClick={() => void stopAll()}
                  disabled={!dashboard || dashboard.totals.running === 0}
                  className="rounded-md border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-medium text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Stop all labs
                </button>
              </div>
            </div>

            {dashboard?.assignment && (
              <div className="mt-3 border-t border-slate-100 pt-3 text-xs text-slate-600">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                  <span className="font-medium text-slate-900">
                    {dashboard.assignment.labCode} · {dashboard.assignment.labTitle}
                  </span>
                  {dashboard.assignment.co && <span>{dashboard.assignment.co}</span>}
                  <span>Due {formatDue(dashboard.assignment.dueAt)}</span>
                  <span>{dashboard.assignment.taskCount} checks</span>
                  {dashboard.assignment.requiresSubmission && <span>Evidence required</span>}
                </div>
                {dashboard.assignment.objective && (
                  <p className="mt-1 text-slate-500">{dashboard.assignment.objective}</p>
                )}
                {dashboard.assignment.instructions && (
                  <p className="mt-1 whitespace-pre-line text-slate-500">
                    {dashboard.assignment.instructions}
                  </p>
                )}
                <button
                  type="button"
                  onClick={() => void removeAssignment()}
                  className="mt-2 text-[11px] font-medium text-rose-700 hover:underline"
                >
                  Remove this assignment
                </button>
              </div>
            )}

            {showAssign && (
              <form onSubmit={(event) => void assignLab(event)} className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-3">
                <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_220px]">
                  <label className="block">
                    <span className="vlab-label">Lab</span>
                    <select
                      value={assignForm.labId}
                      onChange={(event) => setAssignForm({ ...assignForm, labId: event.target.value })}
                      className="vlab-input"
                      required
                    >
                      <option value="">Choose a lab</option>
                      {(labs ?? []).map((lab) => (
                        <option key={lab.id} value={lab.id}>
                          {lab.code ? `${lab.code} — ` : ''}
                          {lab.title}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="vlab-label">Due</span>
                    <input
                      type="datetime-local"
                      value={assignForm.dueAt}
                      onChange={(event) => setAssignForm({ ...assignForm, dueAt: event.target.value })}
                      className="vlab-input"
                    />
                  </label>
                </div>
                <label className="mt-3 block">
                  <span className="vlab-label">Submission instructions</span>
                  <textarea
                    value={assignForm.instructions}
                    onChange={(event) => setAssignForm({ ...assignForm, instructions: event.target.value })}
                    rows={2}
                    className="vlab-input"
                    placeholder="e.g. Upload screenshots of every step as one PDF or Word file."
                  />
                </label>
                <div className="mt-3 flex flex-wrap items-center gap-4">
                  <label className="flex items-center gap-2 text-xs text-slate-600">
                    <input
                      type="checkbox"
                      checked={assignForm.requiresSubmission}
                      onChange={(event) =>
                        setAssignForm({ ...assignForm, requiresSubmission: event.target.checked })
                      }
                      className="h-4 w-4 rounded border-slate-300"
                    />
                    Require evidence submission
                  </label>
                  <div className="ml-auto flex gap-2">
                    <button type="button" onClick={() => setShowAssign(false)} className="vlab-button-secondary px-3 py-1.5 text-xs">
                      Cancel
                    </button>
                    <button type="submit" disabled={assignBusy} className="vlab-button-primary px-3 py-1.5 text-xs">
                      {assignBusy ? 'Assigning…' : 'Assign lab'}
                    </button>
                  </div>
                </div>
              </form>
            )}
          </div>

          <div className="vlab-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-[10px] uppercase tracking-[0.1em] text-slate-500">
                    <th className="px-4 py-3 font-medium">Student</th>
                    <th className="px-3 py-3 font-medium">Lab</th>
                    {taskColumns.map((task) => (
                      <th key={task.taskId} className="px-2 py-3 text-center font-medium" title={task.title}>
                        T{task.order}
                      </th>
                    ))}
                    <th className="px-3 py-3 font-medium">Progress</th>
                    <th className="px-3 py-3 font-medium">Evidence</th>
                    <th className="px-3 py-3 font-medium">Last active</th>
                    <th className="px-4 py-3 font-medium">Last command</th>
                  </tr>
                </thead>
                <tbody>
                  {dashboard?.students.map((student) => (
                    <tr
                      key={student.id}
                      onClick={() => setSelectedId(student.id)}
                      className="cursor-pointer border-b border-slate-100 transition last:border-0 hover:bg-slate-50"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-slate-100 text-[10px] font-semibold text-slate-600">
                            {initials(student.name)}
                          </div>
                          <div className="min-w-0">
                            <div className="truncate font-medium text-slate-900">{student.name}</div>
                            <div className="truncate text-[11px] text-slate-500">{student.email}</div>
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
                                'inline-grid h-6 w-6 place-items-center rounded text-xs font-semibold',
                                task?.passed
                                  ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
                                  : 'bg-slate-50 text-slate-400 ring-1 ring-slate-200',
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
                            tone={student.progress === 100 ? 'emerald' : 'navy'}
                            className="w-20"
                          />
                          <span className="w-9 text-right text-[11px] tabular-nums text-slate-500">
                            {student.progress}%
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <SubmissionBadge status={student.submission?.status} />
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-[11px] text-slate-500">
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
                      <td colSpan={7 + taskColumns.length} className="px-4 py-12 text-center">
                        <div className="text-sm text-slate-700">No students have joined yet.</div>
                        <div className="mt-1 text-xs text-slate-500">
                          Share join code <span className="font-mono">{dashboard.class.joinCode}</span>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <section className="vlab-card mt-4">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <div>
                <h2 className="text-sm font-semibold text-slate-900">Submitted evidence</h2>
                <p className="text-[11px] text-slate-500">
                  Screenshots and documents attached to this assignment.
                </p>
              </div>
              <span className="text-[11px] text-slate-500">
                {dashboard?.totals.submitted ?? 0} submitted · {dashboard?.totals.reviewed ?? 0} reviewed
              </span>
            </div>

            <div className="divide-y divide-slate-100">
              {(roster?.students ?? []).map((student) => {
                const submission = student.submission;
                return (
                  <div key={student.id} className="px-4 py-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium text-slate-900">{student.name}</span>
                          <SubmissionBadge status={submission?.status} />
                          {submission?.grade !== null && submission?.grade !== undefined && (
                            <span className="text-[11px] text-slate-500">Grade {submission.grade}/100</span>
                          )}
                        </div>
                        <div className="mt-0.5 text-[11px] text-slate-500">
                          {submission?.submittedAt
                            ? `Submitted ${timeAgo(submission.submittedAt)}`
                            : 'No file or note yet'}
                          {submission?.fileName ? ` · ${submission.fileName}` : ''}
                        </div>
                        {submission?.note && (
                          <p className="mt-1 whitespace-pre-line text-xs text-slate-600">{submission.note}</p>
                        )}
                        {submission?.feedback && (
                          <p className="mt-1 rounded border border-emerald-100 bg-emerald-50 px-2 py-1 text-xs text-emerald-800">
                            Feedback: {submission.feedback}
                          </p>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {submission?.fileUrl && (
                          <SubmissionFileLink url={submission.fileUrl} />
                        )}
                        {submission && submission.status !== 'draft' && (
                          <button
                            type="button"
                            onClick={() =>
                              startReview(student.id, submission.feedback, submission.grade ?? null)
                            }
                            className="vlab-button-primary px-3 py-1.5 text-xs"
                          >
                            {submission.status === 'reviewed' ? 'Edit review' : 'Review'}
                          </button>
                        )}
                      </div>
                    </div>

                    {reviewFor === student.id && submission && (
                      <form
                        onSubmit={(event) => void saveReview(event, student.id)}
                        className="mt-3 rounded-md border border-slate-200 bg-slate-50 p-3"
                      >
                        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_120px]">
                          <label className="block">
                            <span className="vlab-label">Feedback</span>
                            <textarea
                              value={reviewForm.feedback}
                              onChange={(event) => setReviewForm({ ...reviewForm, feedback: event.target.value })}
                              rows={2}
                              className="vlab-input"
                              placeholder="What was done well, what needs another attempt?"
                            />
                          </label>
                          <label className="block">
                            <span className="vlab-label">Grade / 100</span>
                            <input
                              type="number"
                              min={0}
                              max={100}
                              value={reviewForm.grade}
                              onChange={(event) => setReviewForm({ ...reviewForm, grade: event.target.value })}
                              className="vlab-input"
                              placeholder="—"
                            />
                          </label>
                        </div>
                        <div className="mt-3 flex justify-end gap-2">
                          <button type="button" onClick={() => setReviewFor(null)} className="vlab-button-secondary px-3 py-1.5 text-xs">
                            Cancel
                          </button>
                          <button type="submit" disabled={reviewBusy} className="vlab-button-primary px-3 py-1.5 text-xs">
                            {reviewBusy ? 'Saving…' : 'Save review'}
                          </button>
                        </div>
                      </form>
                    )}
                  </div>
                );
              })}

              {roster && roster.students.every((student) => !student.submission) && (
                <div className="px-4 py-8 text-center text-xs text-slate-500">
                  No evidence submitted for this assignment yet.
                </div>
              )}
            </div>
          </section>
        </section>

        <aside className="min-w-0">
          <div className="vlab-card">
            <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-600 vlab-live-dot" />
              <h2 className="text-sm font-semibold text-slate-900">Live activity</h2>
              <span className="ml-auto text-[10px] uppercase tracking-[0.1em] text-slate-400">last 20</span>
            </div>
            <div className="max-h-[520px] divide-y divide-slate-100 overflow-y-auto">
              {(dashboard?.activity ?? []).map((entry, index) => (
                <div key={`${entry.sessionId}-${entry.ts}-${index}`} className="px-4 py-2.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-xs font-medium text-slate-800">{entry.studentName}</span>
                    <span className="shrink-0 text-[10px] text-slate-400">{timeAgo(entry.ts)}</span>
                  </div>
                  <code className="mt-1 block truncate font-mono text-[11px] text-slate-500">
                    {entry.command}
                  </code>
                </div>
              ))}
              {dashboard && dashboard.activity.length === 0 && (
                <div className="px-4 py-10 text-center text-xs text-slate-500">
                  No commands yet.
                  <br />
                  Live commands appear here once a student starts the lab.
                </div>
              )}
            </div>
          </div>

          <div className="mt-3 rounded-lg border border-slate-200 bg-white px-4 py-3 text-[11px] leading-relaxed text-slate-500">
            Click a student row to open their task list, command history, and a read-only live
            terminal. Command logging is advisory; the task checks inspect container state.
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

import { useMemo, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ClassSummary } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { usePolling } from '../hooks/usePolling';
import { cn, formatDue } from '../lib/format';

const emptyClass = {
  courseShort: 'CBAD',
  section: 'CC1',
  batch: 'A',
  schedule: 'Monday · 10:00–12:00',
  room: 'Lab 204',
};

export default function TeacherOverview() {
  const { api } = useAuth();
  const navigate = useNavigate();
  const { data: classes, error, refresh } = usePolling<ClassSummary[]>(() => api('/classes'), 15000, []);

  const [form, setForm] = useState(emptyClass);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [copied, setCopied] = useState<string | null>(null);

  const totals = useMemo(() => {
    const list = classes ?? [];
    return {
      classes: list.length,
      students: list.reduce((sum, item) => sum + (item.members ?? 0), 0),
      live: list.reduce((sum, item) => sum + (item.live ?? 0), 0),
      pending: list.reduce((sum, item) => sum + (item.pendingSubmissions ?? 0), 0),
    };
  }, [classes]);

  async function createClass(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setNotice('');
    try {
      const created = await api<{ id: string }>('/classes', { method: 'POST', body: form });
      setNotice('Class created. Share its join code with the batch.');
      refresh();
      navigate(`/teacher/classes/${created.id}`);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Could not create the class');
    } finally {
      setBusy(false);
    }
  }

  async function copyCode(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(code);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      setNotice(`Join code: ${code}`);
    }
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="vlab-eyebrow">Teacher workspace</div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">Classes</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">
            Each class is one course, one section, and one batch. Open a class to monitor its
            students, assign labs, and review submitted evidence.
          </p>
        </div>
        <span className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-500">
          {totals.classes} {totals.classes === 1 ? 'class' : 'classes'}
        </span>
      </div>

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
          { label: 'Classes', value: totals.classes, hint: 'course · section · batch' },
          { label: 'Students', value: totals.students, hint: 'across all classes' },
          { label: 'Live labs', value: totals.live, hint: 'containers ready now' },
          { label: 'Evidence to review', value: totals.pending, hint: 'submitted, not reviewed' },
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

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900">Your classes</h2>
            <span className="text-[11px] text-slate-500">Open a class to run the lab session</span>
          </div>

          <div className="grid gap-3 xl:grid-cols-2">
            {(classes ?? []).map((klass) => (
              <article key={klass.id} className="vlab-card flex flex-col p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-600">
                        {klass.courseShort ?? 'CBAD'}
                      </span>
                      <span className="text-[11px] text-slate-500">
                        {klass.section ? `Section ${klass.section}` : 'Section —'}
                        {klass.batch ? ` · Batch ${klass.batch}` : ''}
                      </span>
                    </div>
                    <h3 className="mt-2 truncate text-base font-semibold text-slate-900">{klass.name}</h3>
                    <p className="mt-0.5 truncate text-xs text-slate-500">
                      {klass.courseTitle ?? 'Container Based Application Development Lab'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => navigate(`/teacher/classes/${klass.id}`)}
                    className="vlab-button-primary shrink-0 px-3 py-1.5 text-xs"
                  >
                    Open
                  </button>
                </div>

                <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                  <div>
                    <dt className="text-slate-500">Schedule</dt>
                    <dd className="mt-0.5 text-slate-800">{klass.schedule || 'Not set'}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Room</dt>
                    <dd className="mt-0.5 text-slate-800">{klass.room || 'Not set'}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Next due</dt>
                    <dd className="mt-0.5 text-slate-800">{formatDue(klass.nextDueAt ?? null)}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Join code</dt>
                    <dd className="mt-0.5">
                      <button
                        type="button"
                        onClick={() => void copyCode(klass.joinCode)}
                        className="font-mono text-xs font-semibold tracking-[0.14em] text-[#123a63] hover:underline"
                        title="Copy join code"
                      >
                        {klass.joinCode}
                        <span className="ml-1 font-sans text-[10px] font-normal text-slate-400">
                          {copied === klass.joinCode ? 'copied' : 'copy'}
                        </span>
                      </button>
                    </dd>
                  </div>
                </dl>

                <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 border-t border-slate-100 pt-3 text-[11px] text-slate-500">
                  <span>{klass.members ?? 0} students</span>
                  <span>{klass.assignments ?? 0} assignments</span>
                  <span className={cn((klass.live ?? 0) > 0 && 'font-medium text-emerald-700')}>
                    {klass.live ?? 0} live
                  </span>
                  <span className={cn((klass.pendingSubmissions ?? 0) > 0 && 'font-medium text-blue-700')}>
                    {klass.pendingSubmissions ?? 0} to review
                  </span>
                </div>
              </article>
            ))}

            {classes && classes.length === 0 && (
              <div className="vlab-card px-6 py-12 text-center xl:col-span-2">
                <h3 className="text-sm font-semibold text-slate-900">No classes yet</h3>
                <p className="mx-auto mt-1 max-w-sm text-xs text-slate-500">
                  Create your first section and batch. Students join with the six-character code
                  shown on the class card.
                </p>
              </div>
            )}
          </div>
        </section>

        <aside>
          <form onSubmit={(event) => void createClass(event)} className="vlab-card p-5">
            <h2 className="text-sm font-semibold text-slate-900">New class</h2>
            <p className="mt-1 text-xs text-slate-500">
              Add another section or batch. Each gets its own join code and assignment plan.
            </p>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <label className="block">
                <span className="vlab-label">Course</span>
                <input
                  value={form.courseShort}
                  onChange={(event) => setForm({ ...form, courseShort: event.target.value })}
                  className="vlab-input"
                  placeholder="CBAD"
                  required
                />
              </label>
              <label className="block">
                <span className="vlab-label">Section</span>
                <input
                  value={form.section}
                  onChange={(event) => setForm({ ...form, section: event.target.value })}
                  className="vlab-input"
                  placeholder="CC1"
                  required
                />
              </label>
              <label className="block">
                <span className="vlab-label">Batch</span>
                <input
                  value={form.batch}
                  onChange={(event) => setForm({ ...form, batch: event.target.value })}
                  className="vlab-input"
                  placeholder="A"
                />
              </label>
              <label className="block">
                <span className="vlab-label">Room</span>
                <input
                  value={form.room}
                  onChange={(event) => setForm({ ...form, room: event.target.value })}
                  className="vlab-input"
                  placeholder="Lab 204"
                />
              </label>
            </div>

            <label className="mt-3 block">
              <span className="vlab-label">Schedule</span>
              <input
                value={form.schedule}
                onChange={(event) => setForm({ ...form, schedule: event.target.value })}
                className="vlab-input"
                placeholder="Monday · 10:00–12:00"
              />
            </label>

            <button type="submit" disabled={busy} className="vlab-button-primary mt-4 w-full">
              {busy ? 'Creating…' : 'Create class'}
            </button>
          </form>

          <div className="mt-3 rounded-lg border border-slate-200 bg-white px-4 py-3 text-[11px] leading-relaxed text-slate-500">
            Students can join several classes. The same email and password always returns to the
            same account, with all classes and submissions attached.
          </div>
        </aside>
      </div>
    </div>
  );
}

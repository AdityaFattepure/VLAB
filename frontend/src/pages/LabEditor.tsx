import { useEffect, useState, type FormEvent } from 'react';
import type { ClassSummary, Lab, TaskSummary } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { usePolling } from '../hooks/usePolling';
import { cn } from '../lib/format';

const emptyTask = {
  title: '',
  description: '',
  checkCommand: '',
  expectedOutputContains: '',
  expectedExitCode: '0',
};

export default function LabEditor() {
  const { api } = useAuth();

  const { data: labs, refresh: refreshLabs, error: labsError } = usePolling<Lab[]>(
    () => api('/labs'),
    15000,
    [],
  );
  const { data: classes } = usePolling<ClassSummary[]>(() => api('/classes'), 20000, []);

  const [selectedId, setSelectedId] = useState('');
  const [labForm, setLabForm] = useState({ title: '', description: '', template: 'docker-dind' });
  const [taskForm, setTaskForm] = useState(emptyTask);
  const [editingTask, setEditingTask] = useState<string | null>(null);
  const [newLab, setNewLab] = useState({ title: '', template: 'docker-dind' });
  const [assign, setAssign] = useState({ classId: '', dueAt: '' });
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!selectedId && labs && labs.length > 0) setSelectedId(labs[0].id);
  }, [labs, selectedId]);

  const lab = labs?.find((item) => item.id === selectedId) ?? null;

  useEffect(() => {
    if (lab) {
      setLabForm({ title: lab.title, description: lab.description, template: lab.template });
      setEditingTask(null);
      setTaskForm(emptyTask);
    }
  }, [lab?.id]);

  useEffect(() => {
    if (!assign.classId && classes && classes.length > 0) {
      setAssign((current) => ({ ...current, classId: classes[0].id }));
    }
  }, [classes, assign.classId]);

  async function run(action: () => Promise<void>, success: string) {
    setBusy(true);
    setNotice('');
    try {
      await action();
      setNotice(success);
      refreshLabs();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setBusy(false);
    }
  }

  async function createLab(event: FormEvent) {
    event.preventDefault();
    if (!newLab.title.trim()) return;
    await run(async () => {
      const created = await api<Lab>('/labs', {
        method: 'POST',
        body: { title: newLab.title, template: newLab.template, description: '' },
      });
      setSelectedId(created.id);
      setNewLab({ title: '', template: 'docker-dind' });
    }, 'Lab created');
  }

  async function saveLab(event: FormEvent) {
    event.preventDefault();
    if (!lab) return;
    await run(
      () => api(`/labs/${lab.id}`, { method: 'PUT', body: labForm }).then(() => undefined),
      'Lab details saved',
    );
  }

  async function saveTask(event: FormEvent) {
    event.preventDefault();
    if (!lab) return;
    const body = {
      title: taskForm.title,
      description: taskForm.description,
      checkCommand: taskForm.checkCommand,
      expectedOutputContains: taskForm.expectedOutputContains || null,
      expectedExitCode: Number(taskForm.expectedExitCode) || 0,
    };

    await run(async () => {
      if (editingTask) {
        await api(`/tasks/${editingTask}`, { method: 'PUT', body });
      } else {
        await api(`/labs/${lab.id}/tasks`, { method: 'POST', body });
      }
      setEditingTask(null);
      setTaskForm(emptyTask);
    }, editingTask ? 'Task updated' : 'Task added');
  }

  function editTask(task: TaskSummary) {
    setEditingTask(task.id);
    setTaskForm({
      title: task.title,
      description: task.description,
      checkCommand: task.checkCommand ?? '',
      expectedOutputContains: task.expectedOutputContains ?? '',
      expectedExitCode: String(task.expectedExitCode ?? 0),
    });
  }

  async function deleteTask(task: TaskSummary) {
    if (!window.confirm(`Delete task "${task.title}"?`)) return;
    await run(
      () => api(`/tasks/${task.id}`, { method: 'DELETE' }).then(() => undefined),
      'Task deleted',
    );
  }

  async function assignLab(event: FormEvent) {
    event.preventDefault();
    if (!lab || !assign.classId) return;
    await run(
      () =>
        api('/assignments', {
          method: 'POST',
          body: {
            labId: lab.id,
            classId: assign.classId,
            dueAt: assign.dueAt ? new Date(assign.dueAt).toISOString() : null,
          },
        }).then(() => undefined),
      'Lab assigned to class',
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <div>
        <div className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Teacher tools</div>
        <h1 className="mt-1 text-2xl font-semibold text-slate-100">Lab editor</h1>
        <p className="mt-1 text-sm text-slate-500">
          Create a lab, define what the checker looks for, then assign it to a class.
        </p>
      </div>

      {(notice || labsError) && (
        <div
          className={cn(
            'mt-4 rounded-lg border px-3 py-2 text-xs',
            labsError
              ? 'border-rose-500/30 bg-rose-500/10 text-rose-300'
              : 'border-indigo-500/30 bg-indigo-500/10 text-indigo-200',
          )}
        >
          {labsError ?? notice}
        </div>
      )}

      <div className="mt-6 grid gap-5 lg:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="space-y-3">
          <div className="rounded-xl border border-slate-800 bg-slate-900/40">
            <div className="border-b border-slate-800 px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
              Your labs
            </div>
            <div className="max-h-80 overflow-y-auto p-2">
              {(labs ?? []).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSelectedId(item.id)}
                  className={cn(
                    'mb-1 block w-full rounded-lg px-3 py-2 text-left text-sm transition',
                    item.id === selectedId
                      ? 'bg-indigo-500/15 text-indigo-200 ring-1 ring-indigo-500/30'
                      : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200',
                  )}
                >
                  <span className="block truncate font-medium">{item.title}</span>
                  <span className="mt-0.5 block text-[10px] uppercase tracking-wider text-slate-600">
                    {item.template} · {item.taskCount} tasks
                  </span>
                </button>
              ))}
              {(labs ?? []).length === 0 && (
                <div className="px-2 py-6 text-center text-xs text-slate-600">No labs yet.</div>
              )}
            </div>
          </div>

          <form
            onSubmit={(event) => void createLab(event)}
            className="rounded-xl border border-slate-800 bg-slate-900/40 p-3"
          >
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              New lab
            </div>
            <input
              value={newLab.title}
              onChange={(event) => setNewLab({ ...newLab, title: event.target.value })}
              placeholder="Lab title"
              className="mt-2 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-indigo-500/60"
            />
            <select
              value={newLab.template}
              onChange={(event) => setNewLab({ ...newLab, template: event.target.value })}
              className="mt-2 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-200 outline-none focus:border-indigo-500/60"
            >
              <option value="docker-dind">docker-dind (privileged)</option>
              <option value="linux-basic">linux-basic</option>
            </select>
            <button
              type="submit"
              disabled={busy}
              className="mt-2 w-full rounded-lg bg-indigo-500 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-400 disabled:opacity-50"
            >
              Create lab
            </button>
          </form>
        </aside>

        <div className="min-w-0 space-y-5">
          {!lab && (
            <div className="rounded-xl border border-dashed border-slate-800 px-6 py-16 text-center text-sm text-slate-500">
              Select a lab or create one to start editing.
            </div>
          )}

          {lab && (
            <>
              <form
                onSubmit={(event) => void saveLab(event)}
                className="rounded-xl border border-slate-800 bg-slate-900/40 p-4"
              >
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-slate-200">Lab details</h2>
                  <span className="text-[10px] uppercase tracking-wider text-slate-600">
                    {lab.assignmentCount} class assignment{lab.assignmentCount === 1 ? '' : 's'}
                  </span>
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_200px]">
                  <label className="block text-xs text-slate-400">
                    Title
                    <input
                      value={labForm.title}
                      onChange={(event) => setLabForm({ ...labForm, title: event.target.value })}
                      className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-indigo-500/60"
                    />
                  </label>
                  <label className="block text-xs text-slate-400">
                    Template
                    <select
                      value={labForm.template}
                      onChange={(event) => setLabForm({ ...labForm, template: event.target.value })}
                      className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-200 outline-none focus:border-indigo-500/60"
                    >
                      <option value="docker-dind">docker-dind</option>
                      <option value="linux-basic">linux-basic</option>
                    </select>
                  </label>
                </div>
                <label className="mt-3 block text-xs text-slate-400">
                  Description
                  <textarea
                    value={labForm.description}
                    onChange={(event) =>
                      setLabForm({ ...labForm, description: event.target.value })
                    }
                    rows={2}
                    className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-indigo-500/60"
                  />
                </label>
                <button
                  type="submit"
                  disabled={busy}
                  className="mt-3 rounded-lg bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-100 hover:bg-slate-700 disabled:opacity-50"
                >
                  Save details
                </button>
              </form>

              <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-slate-200">Tasks</h2>
                  <span className="text-[10px] uppercase tracking-wider text-slate-600">
                    checker runs these commands
                  </span>
                </div>

                <div className="mt-3 space-y-2">
                  {lab.tasks.map((task) => (
                    <div
                      key={task.id}
                      className="flex items-start gap-3 rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2"
                    >
                      <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-slate-800 text-[10px] text-slate-400">
                        {task.order}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm text-slate-200">{task.title}</div>
                        <code className="mt-0.5 block truncate font-mono text-[10px] text-slate-500">
                          {task.checkCommand}
                        </code>
                      </div>
                      <button
                        type="button"
                        onClick={() => editTask(task)}
                        className="text-[11px] text-indigo-300 hover:text-indigo-200"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => void deleteTask(task)}
                        className="text-[11px] text-rose-400 hover:text-rose-300"
                      >
                        Delete
                      </button>
                    </div>
                  ))}
                  {lab.tasks.length === 0 && (
                    <div className="rounded-lg border border-dashed border-slate-800 px-3 py-6 text-center text-xs text-slate-600">
                      No tasks yet. Add the first check below.
                    </div>
                  )}
                </div>

                <form
                  onSubmit={(event) => void saveTask(event)}
                  className="mt-4 rounded-lg border border-slate-800 bg-slate-950/40 p-3"
                >
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                      {editingTask ? 'Edit task' : 'New task'}
                    </div>
                    {editingTask && (
                      <button
                        type="button"
                        onClick={() => {
                          setEditingTask(null);
                          setTaskForm(emptyTask);
                        }}
                        className="text-[11px] text-slate-500 hover:text-slate-300"
                      >
                        Cancel edit
                      </button>
                    )}
                  </div>

                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    <input
                      value={taskForm.title}
                      onChange={(event) =>
                        setTaskForm({ ...taskForm, title: event.target.value })
                      }
                      placeholder="Task title"
                      className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-indigo-500/60"
                    />
                    <input
                      value={taskForm.description}
                      onChange={(event) =>
                        setTaskForm({ ...taskForm, description: event.target.value })
                      }
                      placeholder="Student instructions"
                      className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-indigo-500/60"
                    />
                  </div>

                  <textarea
                    value={taskForm.checkCommand}
                    onChange={(event) =>
                      setTaskForm({ ...taskForm, checkCommand: event.target.value })
                    }
                    placeholder="Check command, e.g. docker ps --filter name=^/web$ --format '{{.Names}}'"
                    rows={2}
                    className="mt-2 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 font-mono text-xs text-slate-100 outline-none focus:border-indigo-500/60"
                  />

                  <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_140px]">
                    <input
                      value={taskForm.expectedOutputContains}
                      onChange={(event) =>
                        setTaskForm({ ...taskForm, expectedOutputContains: event.target.value })
                      }
                      placeholder="Expected output contains (optional)"
                      className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-indigo-500/60"
                    />
                    <input
                      type="number"
                      value={taskForm.expectedExitCode}
                      onChange={(event) =>
                        setTaskForm({ ...taskForm, expectedExitCode: event.target.value })
                      }
                      placeholder="Exit code"
                      className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-indigo-500/60"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={busy}
                    className="mt-2 rounded-lg bg-indigo-500 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-400 disabled:opacity-50"
                  >
                    {editingTask ? 'Save task' : 'Add task'}
                  </button>
                </form>
              </section>

              <form
                onSubmit={(event) => void assignLab(event)}
                className="rounded-xl border border-slate-800 bg-slate-900/40 p-4"
              >
                <h2 className="text-sm font-semibold text-slate-200">Assign to a class</h2>
                <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_220px_auto]">
                  <select
                    value={assign.classId}
                    onChange={(event) => setAssign({ ...assign, classId: event.target.value })}
                    className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-200 outline-none focus:border-indigo-500/60"
                  >
                    <option value="">Select class</option>
                    {(classes ?? []).map((klass) => (
                      <option key={klass.id} value={klass.id}>
                        {klass.name}
                      </option>
                    ))}
                  </select>
                  <input
                    type="datetime-local"
                    value={assign.dueAt}
                    onChange={(event) => setAssign({ ...assign, dueAt: event.target.value })}
                    className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-200 outline-none focus:border-indigo-500/60"
                  />
                  <button
                    type="submit"
                    disabled={busy || !assign.classId}
                    className="rounded-lg bg-emerald-500 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-50"
                  >
                    Assign lab
                  </button>
                </div>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

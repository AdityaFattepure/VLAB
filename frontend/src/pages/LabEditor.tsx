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

const emptyLabForm = {
  title: '',
  description: '',
  template: 'docker-dind',
  code: '',
  objective: '',
  co: '',
  estimatedMinutes: '60',
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
  const [labForm, setLabForm] = useState(emptyLabForm);
  const [taskForm, setTaskForm] = useState(emptyTask);
  const [editingTask, setEditingTask] = useState<string | null>(null);
  const [newLab, setNewLab] = useState({ title: '', template: 'docker-dind' });
  const [assign, setAssign] = useState({
    classId: '',
    dueAt: '',
    instructions: '',
    requiresSubmission: true,
  });
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!selectedId && labs && labs.length > 0) setSelectedId(labs[0].id);
  }, [labs, selectedId]);

  const lab = labs?.find((item) => item.id === selectedId) ?? null;

  useEffect(() => {
    if (lab) {
      setLabForm({
        title: lab.title,
        description: lab.description,
        template: lab.template,
        code: lab.code ?? '',
        objective: lab.objective ?? '',
        co: lab.co ?? '',
        estimatedMinutes: String(lab.estimatedMinutes ?? 60),
      });
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
      () =>
        api(`/labs/${lab.id}`, {
          method: 'PUT',
          body: {
            ...labForm,
            estimatedMinutes: Number(labForm.estimatedMinutes) || 60,
          },
        }).then(() => undefined),
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
            instructions: assign.instructions,
            requiresSubmission: assign.requiresSubmission,
          },
        }).then(() => undefined),
      'Lab assigned to class',
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <div>
        <div className="vlab-eyebrow">Teacher tools</div>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">Lab library</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-500">
          The seeded labs follow the seven CBAD experiments. Edit the tasks or create a new lab,
          then assign it to a section and batch.
        </p>
      </div>

      {(notice || labsError) && (
        <div
          className={cn(
            'mt-4 rounded-md border px-3 py-2 text-xs',
            labsError
              ? 'border-rose-200 bg-rose-50 text-rose-700'
              : 'border-blue-200 bg-blue-50 text-blue-800',
          )}
        >
          {labsError ?? notice}
        </div>
      )}

      <div className="mt-6 grid gap-5 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="space-y-3">
          <div className="vlab-card overflow-hidden">
            <div className="border-b border-slate-200 px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
              Your labs
            </div>
            <div className="max-h-[420px] overflow-y-auto p-2">
              {(labs ?? []).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSelectedId(item.id)}
                  className={cn(
                    'mb-1 block w-full rounded-md px-3 py-2 text-left text-sm transition',
                    item.id === selectedId
                      ? 'bg-slate-100 text-slate-900'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900',
                  )}
                >
                  <span className="block truncate font-medium">
                    {item.code ? `${item.code} — ` : ''}
                    {item.title}
                  </span>
                  <span className="mt-0.5 block text-[10px] uppercase tracking-wider text-slate-500">
                    {item.template} · {item.taskCount} tasks
                  </span>
                </button>
              ))}
              {(labs ?? []).length === 0 && (
                <div className="px-2 py-6 text-center text-xs text-slate-500">No labs yet.</div>
              )}
            </div>
          </div>

          <form onSubmit={(event) => void createLab(event)} className="vlab-card p-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
              New lab
            </div>
            <input
              value={newLab.title}
              onChange={(event) => setNewLab({ ...newLab, title: event.target.value })}
              placeholder="Lab title"
              className="vlab-input mt-2"
            />
            <select
              value={newLab.template}
              onChange={(event) => setNewLab({ ...newLab, template: event.target.value })}
              className="vlab-input mt-2"
            >
              <option value="docker-dind">docker-dind (privileged)</option>
              <option value="linux-basic">linux-basic</option>
            </select>
            <button type="submit" disabled={busy} className="vlab-button-primary mt-2 w-full text-xs">
              Create lab
            </button>
          </form>
        </aside>

        <div className="min-w-0 space-y-5">
          {!lab && (
            <div className="rounded-lg border border-dashed border-slate-300 px-6 py-16 text-center text-sm text-slate-500">
              Select a lab or create one to start editing.
            </div>
          )}

          {lab && (
            <>
              <form onSubmit={(event) => void saveLab(event)} className="vlab-card p-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-slate-900">Lab details</h2>
                  <span className="text-[10px] uppercase tracking-wider text-slate-500">
                    {lab.assignmentCount} class assignment{lab.assignmentCount === 1 ? '' : 's'}
                  </span>
                </div>

                <div className="mt-3 grid gap-3 sm:grid-cols-[120px_minmax(0,1fr)_180px]">
                  <label className="block">
                    <span className="vlab-label">Code</span>
                    <input
                      value={labForm.code}
                      onChange={(event) => setLabForm({ ...labForm, code: event.target.value })}
                      className="vlab-input"
                      placeholder="Lab 3"
                    />
                  </label>
                  <label className="block">
                    <span className="vlab-label">Title</span>
                    <input
                      value={labForm.title}
                      onChange={(event) => setLabForm({ ...labForm, title: event.target.value })}
                      className="vlab-input"
                    />
                  </label>
                  <label className="block">
                    <span className="vlab-label">Template</span>
                    <select
                      value={labForm.template}
                      onChange={(event) => setLabForm({ ...labForm, template: event.target.value })}
                      className="vlab-input"
                    >
                      <option value="docker-dind">docker-dind</option>
                      <option value="linux-basic">linux-basic</option>
                    </select>
                  </label>
                </div>

                <label className="mt-3 block">
                  <span className="vlab-label">Description</span>
                  <textarea
                    value={labForm.description}
                    onChange={(event) =>
                      setLabForm({ ...labForm, description: event.target.value })
                    }
                    rows={2}
                    className="vlab-input"
                  />
                </label>

                <label className="mt-3 block">
                  <span className="vlab-label">Objective</span>
                  <textarea
                    value={labForm.objective}
                    onChange={(event) => setLabForm({ ...labForm, objective: event.target.value })}
                    rows={2}
                    className="vlab-input"
                  />
                </label>

                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className="vlab-label">Course outcome</span>
                    <input
                      value={labForm.co}
                      onChange={(event) => setLabForm({ ...labForm, co: event.target.value })}
                      className="vlab-input"
                      placeholder="CO2"
                    />
                  </label>
                  <label className="block">
                    <span className="vlab-label">Estimated minutes</span>
                    <input
                      type="number"
                      min={5}
                      value={labForm.estimatedMinutes}
                      onChange={(event) =>
                        setLabForm({ ...labForm, estimatedMinutes: event.target.value })
                      }
                      className="vlab-input"
                    />
                  </label>
                </div>

                <button type="submit" disabled={busy} className="vlab-button-primary mt-3 px-3 py-2 text-xs">
                  Save details
                </button>
              </form>

              <section className="vlab-card p-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-slate-900">Tasks</h2>
                  <span className="text-[10px] uppercase tracking-wider text-slate-500">
                    checker runs these commands
                  </span>
                </div>

                <div className="mt-3 space-y-2">
                  {lab.tasks.map((task) => (
                    <div
                      key={task.id}
                      className="flex items-start gap-3 rounded-md border border-slate-200 bg-white px-3 py-2"
                    >
                      <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-slate-100 text-[10px] text-slate-600">
                        {task.order}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm text-slate-800">{task.title}</div>
                        <code className="mt-0.5 block truncate font-mono text-[10px] text-slate-500">
                          {task.checkCommand}
                        </code>
                      </div>
                      <button
                        type="button"
                        onClick={() => editTask(task)}
                        className="text-[11px] font-medium text-[#123a63] hover:underline"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => void deleteTask(task)}
                        className="text-[11px] font-medium text-rose-700 hover:underline"
                      >
                        Delete
                      </button>
                    </div>
                  ))}
                  {lab.tasks.length === 0 && (
                    <div className="rounded-md border border-dashed border-slate-300 px-3 py-6 text-center text-xs text-slate-500">
                      No tasks yet. Add the first check below.
                    </div>
                  )}
                </div>

                <form
                  onSubmit={(event) => void saveTask(event)}
                  className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-3"
                >
                  <div className="flex items-center justify-between">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                      {editingTask ? 'Edit task' : 'New task'}
                    </div>
                    {editingTask && (
                      <button
                        type="button"
                        onClick={() => {
                          setEditingTask(null);
                          setTaskForm(emptyTask);
                        }}
                        className="text-[11px] text-slate-500 hover:text-slate-800"
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
                      className="vlab-input"
                    />
                    <input
                      value={taskForm.description}
                      onChange={(event) =>
                        setTaskForm({ ...taskForm, description: event.target.value })
                      }
                      placeholder="Student instructions"
                      className="vlab-input"
                    />
                  </div>

                  <textarea
                    value={taskForm.checkCommand}
                    onChange={(event) =>
                      setTaskForm({ ...taskForm, checkCommand: event.target.value })
                    }
                    placeholder="Check command, e.g. docker ps --filter name=^/web$ --format '{{.Names}}'"
                    rows={2}
                    className="vlab-input mt-2 font-mono text-xs"
                  />

                  <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_140px]">
                    <input
                      value={taskForm.expectedOutputContains}
                      onChange={(event) =>
                        setTaskForm({ ...taskForm, expectedOutputContains: event.target.value })
                      }
                      placeholder="Expected output contains (optional)"
                      className="vlab-input"
                    />
                    <input
                      type="number"
                      value={taskForm.expectedExitCode}
                      onChange={(event) =>
                        setTaskForm({ ...taskForm, expectedExitCode: event.target.value })
                      }
                      placeholder="Exit code"
                      className="vlab-input"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={busy}
                    className="vlab-button-primary mt-2 px-3 py-2 text-xs"
                  >
                    {editingTask ? 'Save task' : 'Add task'}
                  </button>
                </form>
              </section>

              <form onSubmit={(event) => void assignLab(event)} className="vlab-card p-4">
                <h2 className="text-sm font-semibold text-slate-900">Assign to a class</h2>
                <p className="mt-1 text-xs text-slate-500">
                  Choose the section and batch that should receive this lab. A different batch can
                  receive a different lab.
                </p>
                <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_220px]">
                  <label className="block">
                    <span className="vlab-label">Class</span>
                    <select
                      value={assign.classId}
                      onChange={(event) => setAssign({ ...assign, classId: event.target.value })}
                      className="vlab-input"
                    >
                      <option value="">Select class</option>
                      {(classes ?? []).map((klass) => (
                        <option key={klass.id} value={klass.id}>
                          {klass.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="vlab-label">Due</span>
                    <input
                      type="datetime-local"
                      value={assign.dueAt}
                      onChange={(event) => setAssign({ ...assign, dueAt: event.target.value })}
                      className="vlab-input"
                    />
                  </label>
                </div>
                <label className="mt-3 block">
                  <span className="vlab-label">Submission instructions</span>
                  <textarea
                    value={assign.instructions}
                    onChange={(event) =>
                      setAssign({ ...assign, instructions: event.target.value })
                    }
                    rows={2}
                    className="vlab-input"
                    placeholder="e.g. Upload one PDF with a screenshot of every step."
                  />
                </label>
                <div className="mt-3 flex flex-wrap items-center gap-4">
                  <label className="flex items-center gap-2 text-xs text-slate-600">
                    <input
                      type="checkbox"
                      checked={assign.requiresSubmission}
                      onChange={(event) =>
                        setAssign({ ...assign, requiresSubmission: event.target.checked })
                      }
                      className="h-4 w-4 rounded border-slate-300"
                    />
                    Require evidence submission
                  </label>
                  <button
                    type="submit"
                    disabled={busy || !assign.classId}
                    className="vlab-button-primary ml-auto px-4 py-2 text-xs"
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

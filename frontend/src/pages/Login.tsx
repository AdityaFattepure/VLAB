import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

export default function Login() {
  const { user, login, register } = useAuth();
  const navigate = useNavigate();

  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (user) navigate(user.role === 'teacher' ? '/teacher' : '/student', { replace: true });
  }, [user, navigate]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const loggedIn =
        mode === 'login' ? await login(email, password) : await register(name, email, password);
      navigate(loggedIn.role === 'teacher' ? '/teacher' : '/student', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  }

  function useDemo(role: 'teacher' | 'student') {
    setMode('login');
    setError('');
    setEmail(role === 'teacher' ? 'teacher@vlab.dev' : 'student1@vlab.dev');
    setPassword(role === 'teacher' ? 'teacher123' : 'student123');
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      <section className="relative hidden flex-col justify-between overflow-hidden border-r border-slate-800 bg-slate-950 p-12 lg:flex">
        <div
          className="pointer-events-none absolute -left-32 -top-32 h-96 w-96 rounded-full bg-indigo-600/20 blur-3xl"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -bottom-40 right-0 h-96 w-96 rounded-full bg-emerald-600/10 blur-3xl"
          aria-hidden
        />

        <div className="relative flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-indigo-500/15 text-xl text-indigo-300 ring-1 ring-indigo-500/30">
            ◈
          </div>
          <div>
            <div className="text-base font-semibold tracking-wide">VLab</div>
            <div className="text-[10px] uppercase tracking-[0.24em] text-slate-500">Virtual Lab</div>
          </div>
        </div>

        <div className="relative max-w-xl">
          <h1 className="text-4xl font-semibold leading-tight text-slate-100">
            Every student gets a real container.
            <span className="text-indigo-300"> You see all of them at once.</span>
          </h1>
          <p className="mt-5 text-sm leading-relaxed text-slate-400">
            Assign Docker and Linux labs to a class. Each student gets an isolated environment in
            the browser, tasks are checked automatically, and the teacher dashboard shows who is
            working, what they ran, and what passed — without walking to a single machine.
          </p>

          <div className="mt-8 grid grid-cols-2 gap-3 text-xs">
            {[
              ['Isolated containers', 'One Docker-in-Docker sandbox per student'],
              ['Live terminal', 'xterm.js over WebSocket, exec inside the container'],
              ['Automatic checks', 'Task state inspected every 30 seconds'],
              ['Teacher monitor', 'Names, progress, commands, read-only view'],
            ].map(([title, detail]) => (
              <div key={title} className="rounded-xl border border-slate-800 bg-slate-900/50 p-3">
                <div className="font-medium text-slate-200">{title}</div>
                <div className="mt-1 leading-relaxed text-slate-500">{detail}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="relative text-[11px] text-slate-600">
          Container Based Application Development Lab · review 2
        </div>
      </section>

      <section className="flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-md">
          <div className="mb-8 lg:hidden">
            <div className="flex items-center gap-2.5">
              <div className="grid h-10 w-10 place-items-center rounded-lg bg-indigo-500/15 text-lg text-indigo-300 ring-1 ring-indigo-500/30">
                ◈
              </div>
              <div>
                <div className="text-sm font-semibold">VLab</div>
                <div className="text-[10px] uppercase tracking-[0.22em] text-slate-500">
                  Virtual Lab
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 shadow-2xl backdrop-blur">
            <div className="mb-6 flex rounded-lg bg-slate-950/70 p-1 text-xs font-medium">
              {(['login', 'register'] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => {
                    setMode(value);
                    setError('');
                  }}
                  className={`flex-1 rounded-md px-3 py-2 transition ${
                    mode === value
                      ? 'bg-slate-800 text-slate-100 shadow'
                      : 'text-slate-500 hover:text-slate-300'
                  }`}
                >
                  {value === 'login' ? 'Sign in' : 'Create student account'}
                </button>
              ))}
            </div>

            <h2 className="text-lg font-semibold text-slate-100">
              {mode === 'login' ? 'Welcome back' : 'Join your class'}
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              {mode === 'login'
                ? 'Sign in to open your lab or monitor a class.'
                : 'Students can register, then join with the class code from the teacher.'}
            </p>

            <form onSubmit={submit} className="mt-6 space-y-4">
              {mode === 'register' && (
                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium text-slate-400">Full name</span>
                  <input
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    required
                    minLength={2}
                    placeholder="e.g. Aarav Sharma"
                    className="w-full rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2.5 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-indigo-500/60 focus:ring-2 focus:ring-indigo-500/20"
                  />
                </label>
              )}

              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-slate-400">Email</span>
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                  placeholder="you@college.edu"
                  className="w-full rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2.5 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-indigo-500/60 focus:ring-2 focus:ring-indigo-500/20"
                />
              </label>

              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-slate-400">Password</span>
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  minLength={6}
                  placeholder="••••••••"
                  className="w-full rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2.5 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-indigo-500/60 focus:ring-2 focus:ring-indigo-500/20"
                />
              </label>

              {error && (
                <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={busy}
                className="w-full rounded-lg bg-indigo-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}
              </button>
            </form>

            {mode === 'login' && (
              <div className="mt-6 border-t border-slate-800 pt-4">
                <div className="text-[11px] uppercase tracking-wider text-slate-600">
                  Demo accounts
                </div>
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() => useDemo('teacher')}
                    className="flex-1 rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2 text-left text-[11px] text-slate-400 hover:border-indigo-500/40 hover:text-slate-200"
                  >
                    <span className="block font-medium text-slate-300">Teacher</span>
                    teacher@vlab.dev
                  </button>
                  <button
                    type="button"
                    onClick={() => useDemo('student')}
                    className="flex-1 rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2 text-left text-[11px] text-slate-400 hover:border-indigo-500/40 hover:text-slate-200"
                  >
                    <span className="block font-medium text-slate-300">Student</span>
                    student1@vlab.dev
                  </button>
                </div>
              </div>
            )}
          </div>

          <p className="mt-4 text-center text-[11px] text-slate-600">
            One tab per user works because the session is stored per tab.
          </p>
        </div>
      </section>
    </div>
  );
}

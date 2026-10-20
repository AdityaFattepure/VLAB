import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Role } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { Brand } from '../components/Brand';

const FEATURES = [
  'An isolated Docker sandbox for every student.',
  'A real browser terminal, with automatic task checks.',
  'Class progress and evidence review in one place.',
];

export default function Login() {
  const { user, login, register } = useAuth();
  const navigate = useNavigate();

  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [role, setRole] = useState<Role>('student');
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
        mode === 'login'
          ? await login(email, password)
          : await register(name, email, password, role);
      navigate(loggedIn.role === 'teacher' ? '/teacher' : '/student', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  }

  function useDemo(kind: Role) {
    setMode('login');
    setError('');
    setEmail(kind === 'teacher' ? 'teacher@vlab.dev' : 'student1@vlab.dev');
    setPassword(kind === 'teacher' ? 'teacher123' : 'student123');
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.1fr_0.9fr]">
      <section className="hidden flex-col justify-between bg-[#0b2744] p-12 lg:flex">
        <Brand light />

        <div className="max-w-lg">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-200">
            Container Based Application Development Lab
          </p>
          <h1 className="mt-4 text-4xl font-semibold leading-tight tracking-tight text-white">
            A real container for every student.
          </h1>
          <p className="mt-5 text-sm leading-relaxed text-blue-100/80">
            VLab gives each student an isolated Docker environment and gives the teacher a single
            view of the class: who is working, what passed, and which evidence has been submitted.
          </p>

          <ul className="mt-8 space-y-3">
            {FEATURES.map((feature) => (
              <li key={feature} className="flex items-start gap-3 text-sm text-blue-50">
                <span
                  className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border border-blue-300/40 text-[10px] text-blue-100"
                  aria-hidden
                >
                  ✓
                </span>
                {feature}
              </li>
            ))}
          </ul>
        </div>

        <div className="text-[11px] leading-relaxed text-blue-200/60">
          Course 23CSE3118 · Department of Computer Science &amp; Engineering
        </div>
      </section>

      <section className="flex items-center justify-center px-5 py-10 sm:px-8">
        <div className="w-full max-w-md">
          <div className="mb-8 lg:hidden">
            <Brand />
          </div>

          <div className="vlab-card p-6 sm:p-7">
            <div className="flex rounded-md border border-slate-200 bg-slate-50 p-1 text-xs font-medium">
              {(['login', 'register'] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => {
                    setMode(value);
                    setError('');
                  }}
                  aria-pressed={mode === value}
                  className={`flex-1 rounded px-3 py-2 transition ${
                    mode === value
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  {value === 'login' ? 'Sign in' : 'Create account'}
                </button>
              ))}
            </div>

            <h2 className="mt-6 text-xl font-semibold tracking-tight text-slate-900">
              {mode === 'login' ? 'Sign in to VLab' : 'Create your account'}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              {mode === 'login'
                ? 'Open your lab workspace or monitor your classes.'
                : 'Choose the role that matches how you will use VLab.'}
            </p>

            <form onSubmit={submit} className="mt-6 space-y-4">
              {mode === 'register' && (
                <>
                  <fieldset>
                    <legend className="vlab-label">I am a</legend>
                    <div className="grid grid-cols-2 gap-2">
                      {(['student', 'teacher'] as const).map((value) => (
                        <button
                          key={value}
                          type="button"
                          onClick={() => setRole(value)}
                          aria-pressed={role === value}
                          className={`rounded-md border px-3 py-2 text-sm font-medium capitalize transition ${
                            role === value
                              ? 'border-[#123a63] bg-[#123a63] text-white'
                              : 'border-slate-300 bg-white text-slate-600 hover:border-slate-400'
                          }`}
                        >
                          {value}
                        </button>
                      ))}
                    </div>
                  </fieldset>

                  <label className="block">
                    <span className="vlab-label">Full name</span>
                    <input
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      required
                      minLength={2}
                      autoComplete="name"
                      placeholder="e.g. Aarav Sharma"
                      className="vlab-input"
                    />
                  </label>
                </>
              )}

              <label className="block">
                <span className="vlab-label">Email</span>
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                  autoComplete="email"
                  placeholder="you@college.edu"
                  className="vlab-input"
                />
              </label>

              <label className="block">
                <span className="vlab-label">Password</span>
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  minLength={6}
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  placeholder="At least 6 characters"
                  className="vlab-input"
                />
              </label>

              {error && (
                <div role="alert" className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                  {error}
                </div>
              )}

              <button type="submit" disabled={busy} className="vlab-button-primary w-full py-2.5">
                {busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}
              </button>
            </form>

            {mode === 'login' && (
              <div className="mt-6 border-t border-slate-200 pt-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                  Demo accounts
                </div>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => useDemo('teacher')}
                    className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-left text-[11px] text-slate-500 transition hover:border-slate-300 hover:bg-white"
                  >
                    <span className="block font-medium text-slate-800">Teacher</span>
                    teacher@vlab.dev
                  </button>
                  <button
                    type="button"
                    onClick={() => useDemo('student')}
                    className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-left text-[11px] text-slate-500 transition hover:border-slate-300 hover:bg-white"
                  >
                    <span className="block font-medium text-slate-800">Student</span>
                    student1@vlab.dev
                  </button>
                </div>
              </div>
            )}
          </div>

          <p className="mt-4 text-center text-[11px] leading-relaxed text-slate-500">
            Accounts are stored in the lab database. Signing in again with the same email and
            password always opens the same account.
          </p>
        </div>
      </section>
    </div>
  );
}

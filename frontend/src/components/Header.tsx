import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { initials } from '../lib/format';

const linkBase =
  'rounded-lg px-3 py-2 text-sm font-medium transition-colors';
const linkIdle = 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-100';
const linkActive = 'bg-indigo-500/15 text-indigo-300 ring-1 ring-indigo-500/30';

export function Header() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  if (!user) return null;

  return (
    <header className="sticky top-0 z-40 border-b border-slate-800/80 bg-slate-950/85 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6">
        <Link to="/" className="flex items-center gap-2.5">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-indigo-500/15 text-lg text-indigo-300 ring-1 ring-indigo-500/30">
            ◈
          </div>
          <div className="leading-tight">
            <div className="text-sm font-semibold tracking-wide text-slate-100">VLab</div>
            <div className="text-[10px] uppercase tracking-[0.22em] text-slate-500">Virtual Lab</div>
          </div>
        </Link>

        <nav className="ml-4 flex items-center gap-1">
          {user.role === 'teacher' ? (
            <>
              <NavLink
                to="/teacher"
                end
                className={({ isActive }) => `${linkBase} ${isActive ? linkActive : linkIdle}`}
              >
                Monitor
              </NavLink>
              <NavLink
                to="/teacher/labs"
                className={({ isActive }) => `${linkBase} ${isActive ? linkActive : linkIdle}`}
              >
                Lab editor
              </NavLink>
            </>
          ) : (
            <NavLink
              to="/student"
              end
              className={({ isActive }) => `${linkBase} ${isActive ? linkActive : linkIdle}`}
            >
              My labs
            </NavLink>
          )}
        </nav>

        <div className="ml-auto flex items-center gap-3">
          <div className="hidden items-center gap-2.5 sm:flex">
            <div className="grid h-9 w-9 place-items-center rounded-full bg-slate-800 text-xs font-semibold text-slate-200 ring-1 ring-slate-700">
              {initials(user.name)}
            </div>
            <div className="leading-tight">
              <div className="text-sm font-medium text-slate-200">{user.name}</div>
              <div className="text-[11px] uppercase tracking-wider text-slate-500">{user.role}</div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              logout();
              navigate('/login');
            }}
            className="rounded-lg border border-slate-800 px-3 py-1.5 text-xs font-medium text-slate-400 transition hover:border-slate-700 hover:text-slate-200"
          >
            Sign out
          </button>
        </div>
      </div>
    </header>
  );
}

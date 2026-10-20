import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { initials } from '../lib/format';
import { Brand } from './Brand';

const linkBase = 'rounded-md px-3 py-2 text-sm font-medium transition-colors';
const linkIdle = 'text-slate-600 hover:bg-slate-100 hover:text-slate-900';
const linkActive = 'bg-slate-100 text-slate-900';

export function Header() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  if (!user) return null;

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6">
        <Brand to={user.role === 'teacher' ? '/teacher' : '/student'} />

        <nav className="ml-2 flex items-center gap-1" aria-label="Main navigation">
          {user.role === 'teacher' ? (
            <>
              <NavLink
                to="/teacher"
                end
                className={({ isActive }) => `${linkBase} ${isActive ? linkActive : linkIdle}`}
              >
                Classes
              </NavLink>
              <NavLink
                to="/teacher/labs"
                className={({ isActive }) => `${linkBase} ${isActive ? linkActive : linkIdle}`}
              >
                Lab library
              </NavLink>
            </>
          ) : (
            <NavLink
              to="/student"
              end
              className={({ isActive }) => `${linkBase} ${isActive ? linkActive : linkIdle}`}
            >
              My assignments
            </NavLink>
          )}
        </nav>

        <div className="ml-auto flex items-center gap-3">
          <div className="hidden items-center gap-2.5 sm:flex">
            <div className="grid h-9 w-9 place-items-center rounded-full bg-slate-100 text-xs font-semibold text-slate-700">
              {initials(user.name)}
            </div>
            <div className="leading-tight">
              <div className="text-sm font-medium text-slate-900">{user.name}</div>
              <div className="text-[11px] capitalize text-slate-500">{user.role}</div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              logout();
              navigate('/login');
            }}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:border-slate-400 hover:text-slate-900"
          >
            Sign out
          </button>
        </div>
      </div>
    </header>
  );
}

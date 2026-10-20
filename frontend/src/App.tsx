import type { ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth/AuthContext';
import { Header } from './components/Header';
import LabEditor from './pages/LabEditor';
import Login from './pages/Login';
import SessionView from './pages/SessionView';
import StudentLabs from './pages/StudentLabs';
import TeacherDashboard from './pages/TeacherDashboard';
import TeacherOverview from './pages/TeacherOverview';

function Splash() {
  return (
    <div className="grid min-h-screen place-items-center">
      <div className="text-center">
        <div className="mx-auto h-9 w-9 animate-spin rounded-full border-2 border-slate-200 border-t-[#123a63]" />
        <div className="mt-3 text-xs uppercase tracking-[0.2em] text-slate-500">Loading VLab</div>
      </div>
    </div>
  );
}

function Protected({ role, children }: { role: 'teacher' | 'student'; children: ReactNode }) {
  const { user, ready } = useAuth();

  if (!ready) return <Splash />;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== role) {
    return <Navigate to={user.role === 'teacher' ? '/teacher' : '/student'} replace />;
  }

  return (
    <div className="min-h-screen">
      <Header />
      <main>{children}</main>
    </div>
  );
}

export default function App() {
  const { user, ready } = useAuth();

  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route
        path="/teacher"
        element={
          <Protected role="teacher">
            <TeacherOverview />
          </Protected>
        }
      />
      <Route
        path="/teacher/classes/:id"
        element={
          <Protected role="teacher">
            <TeacherDashboard />
          </Protected>
        }
      />
      <Route
        path="/teacher/labs"
        element={
          <Protected role="teacher">
            <LabEditor />
          </Protected>
        }
      />
      <Route
        path="/student"
        element={
          <Protected role="student">
            <StudentLabs />
          </Protected>
        }
      />
      <Route
        path="/student/session/:id"
        element={
          <Protected role="student">
            <SessionView />
          </Protected>
        }
      />

      <Route
        path="*"
        element={
          !ready ? (
            <Splash />
          ) : user ? (
            <Navigate to={user.role === 'teacher' ? '/teacher' : '/student'} replace />
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />
    </Routes>
  );
}

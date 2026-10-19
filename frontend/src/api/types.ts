export type Role = 'teacher' | 'student';

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
}

export interface TaskSummary {
  id: string;
  order: number;
  title: string;
  description: string;
  checkCommand?: string;
  expectedOutputContains?: string | null;
  expectedExitCode?: number;
}

export interface ResultRow {
  taskId: string;
  passed: boolean;
  passedNow: boolean;
  checkedAt: string | null;
  firstPassedAt?: string | null;
  output: string | null;
}

export interface ClassSummary {
  id: string;
  name: string;
  joinCode: string;
  members?: number;
  assignments?: number;
  teacherName?: string;
}

export interface StudentAssignment {
  id: string;
  dueAt: string | null;
  class: { id: string; name: string; teacherName: string };
  lab: {
    id: string;
    title: string;
    description: string;
    template: string;
    tasks: { id: string; order: number; title: string; description: string }[];
  };
  session: {
    id: string;
    status: SessionStatus;
    startedAt: string;
    readyAt: string | null;
    lastActivityAt: string;
    resetCount: number;
    errorMessage: string | null;
  } | null;
  results: ResultRow[];
}

export type SessionStatus = 'starting' | 'ready' | 'stopped' | 'error';

export interface SessionDetail {
  id: string;
  status: SessionStatus;
  containerId: string | null;
  containerName: string | null;
  startedAt: string;
  readyAt: string | null;
  lastActivityAt: string;
  errorMessage: string | null;
  resetCount: number;
  student: { id: string; name: string };
  assignment: {
    id: string;
    dueAt: string | null;
    class: { id: string; name: string };
    lab: { id: string; title: string; description: string; template: string };
  };
  tasks: TaskSummary[];
  results: ResultRow[];
  progress: number;
}

export interface DashboardTask {
  taskId: string;
  order: number;
  title: string;
  description: string;
  passed: boolean;
  passedNow: boolean;
  checkedAt: string | null;
  output: string | null;
}

export interface DashboardStudent {
  id: string;
  name: string;
  email: string;
  joinedAt: string;
  session: {
    id: string;
    status: SessionStatus;
    containerId: string | null;
    startedAt: string;
    readyAt: string | null;
    lastActivityAt: string;
    resetCount: number;
    errorMessage: string | null;
    lastCommand: string | null;
    lastCommandAt: string | null;
  } | null;
  tasks: DashboardTask[];
  completed: number;
  total: number;
  progress: number;
}

export interface Dashboard {
  class: { id: string; name: string; joinCode: string };
  assignment: {
    id: string;
    labId: string;
    labTitle: string;
    template: string;
    dueAt: string | null;
    taskCount: number;
  } | null;
  assignments: { id: string; labTitle: string; dueAt: string | null }[];
  students: DashboardStudent[];
  activity: {
    studentId: string;
    studentName: string;
    sessionId: string;
    command: string;
    ts: string;
  }[];
  totals: { students: number; running: number; completed: number };
}

export interface CommandEntry {
  id: string;
  command: string;
  ts: string;
}

export interface Lab {
  id: string;
  title: string;
  description: string;
  template: string;
  taskCount: number;
  assignmentCount: number;
  tasks: TaskSummary[];
}

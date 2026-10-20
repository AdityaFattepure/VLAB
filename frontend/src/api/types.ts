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
  courseCode?: string;
  courseTitle?: string;
  courseShort?: string;
  section?: string;
  batch?: string;
  schedule?: string;
  room?: string;
  members?: number;
  assignments?: number;
  live?: number;
  pendingSubmissions?: number;
  nextDueAt?: string | null;
  teacherName?: string;
  joinedAt?: string;
}

export type SubmissionStatus = 'draft' | 'submitted' | 'reviewed';

export interface Submission {
  id: string;
  status: SubmissionStatus;
  note: string;
  fileName: string | null;
  fileType: string | null;
  fileSize: number | null;
  submittedAt: string | null;
  reviewedAt: string | null;
  feedback: string;
  grade: number | null;
  fileUrl: string | null;
}

export interface StudentAssignment {
  id: string;
  dueAt: string | null;
  instructions: string;
  requiresSubmission: boolean;
  class: {
    id: string;
    name: string;
    section: string;
    batch: string;
    schedule: string;
    courseTitle: string;
    courseCode: string;
    teacherName: string;
  };
  lab: {
    id: string;
    title: string;
    description: string;
    template: string;
    code: string;
    objective: string;
    co: string;
    estimatedMinutes: number;
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
  submission: Submission | null;
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
    lab: { id: string; title: string; description: string; template: string; code?: string };
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

export interface DashboardSubmission {
  id: string;
  status: SubmissionStatus;
  note: string;
  fileName: string | null;
  fileType: string | null;
  fileSize: number | null;
  submittedAt: string | null;
  reviewedAt: string | null;
  feedback: string;
  grade: number | null;
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
  submission: DashboardSubmission | null;
  tasks: DashboardTask[];
  completed: number;
  total: number;
  progress: number;
}

export interface AssignmentSummary {
  id: string;
  labId: string;
  labTitle: string;
  labCode: string;
  dueAt: string | null;
  requiresSubmission: boolean;
  taskCount: number;
  submissionCount: number;
  submitted: number;
  reviewed: number;
}

export interface Dashboard {
  class: {
    id: string;
    name: string;
    joinCode: string;
    courseCode: string;
    courseTitle: string;
    courseShort: string;
    section: string;
    batch: string;
    schedule: string;
    room: string;
  };
  assignment: {
    id: string;
    labId: string;
    labTitle: string;
    labCode: string;
    template: string;
    objective: string;
    co: string;
    dueAt: string | null;
    instructions: string;
    requiresSubmission: boolean;
    taskCount: number;
  } | null;
  assignments: AssignmentSummary[];
  students: DashboardStudent[];
  activity: {
    studentId: string;
    studentName: string;
    sessionId: string;
    command: string;
    ts: string;
  }[];
  totals: {
    students: number;
    running: number;
    completed: number;
    submitted: number;
    reviewed: number;
  };
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
  code?: string;
  objective?: string;
  co?: string;
  estimatedMinutes?: number;
  taskCount: number;
  assignmentCount: number;
  tasks: TaskSummary[];
}

export interface SubmissionRosterEntry {
  id: string;
  name: string;
  email: string;
  submission: Submission | null;
}

export interface SubmissionRoster {
  assignment: {
    id: string;
    labTitle: string;
    labCode: string;
    dueAt: string | null;
    requiresSubmission: boolean;
  };
  students: SubmissionRosterEntry[];
}

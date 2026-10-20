/**
 * End-to-end smoke test against a running VLab stack.
 *
 *   npm run smoke                       # http://localhost:3000
 *   BASE_URL=http://host:3000 npm run smoke
 *
 * It logs in as a seeded student, starts a real DinD lab, types the three
 * solution commands through the actual terminal WebSocket, runs the checker,
 * and verifies the teacher dashboard reflects the result.
 */
import { WebSocket } from 'ws';

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const TEACHER = { email: 'teacher@vlab.dev', password: 'teacher123' };
const STUDENT = { email: 'student1@vlab.dev', password: 'student123' };

let failures = 0;

function check(ok: boolean, label: string, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

async function api(
  path: string,
  options: { method?: string; token?: string; body?: unknown } = {},
): Promise<any> {
  const res = await fetch(`${BASE}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      'content-type': 'application/json',
      ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    throw new Error(`${options.method ?? 'GET'} ${path} -> ${res.status}: ${data?.error ?? text}`);
  }
  return data;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function poll<T>(fn: () => Promise<T | null>, timeoutMs: number, label: string): Promise<T> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const value = await fn();
      if (value) return value;
    } catch {
      /* retry */
    }
    await sleep(1000);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

async function login(email: string, password: string) {
  return api('/api/auth/login', { method: 'POST', body: { email, password } });
}

function openTerminal(sessionId: string, token: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${BASE.replace(/^http/, 'ws')}/ws/terminal?sessionId=${sessionId}&token=${token}`);
    const timer = setTimeout(() => reject(new Error('terminal WebSocket timed out')), 15000);
    ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.type === 'ready') {
        clearTimeout(timer);
        resolve(ws);
      }
      if (msg.type === 'error') {
        clearTimeout(timer);
        reject(new Error(msg.error));
      }
    });
    ws.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

async function typeCommand(ws: WebSocket, command: string) {
  ws.send(JSON.stringify({ type: 'input', data: Buffer.from(`${command}\n`).toString('base64') }));
}

async function main() {
  console.log(`VLab smoke against ${BASE}\n`);

  const health = await api('/api/health');
  check(Boolean(health.ok), 'health endpoint');
  check(Boolean(health.docker), 'backend can reach the Docker daemon');

  const teacher = await login(TEACHER.email, TEACHER.password);
  const student = await login(STUDENT.email, STUDENT.password);
  check(Boolean(teacher.token), 'teacher login');
  check(Boolean(student.token), 'student login (Aarav Sharma)');
  check(student.user.name === 'Aarav Sharma', 'student name is returned to the UI', student.user.name);

  const assignments = await api('/api/assignments/mine', { token: student.token });
  const lab = assignments.find(
    (a: any) => a.lab.title === 'Docker installation and verification',
  );
  check(Boolean(lab), 'seeded Lab 1 assignment is visible to the student');
  check(lab?.lab.tasks.length === 4, 'Lab 1 has four tasks');

  const session = await api('/api/sessions', {
    method: 'POST',
    token: student.token,
    body: { assignmentId: lab.id },
  });
  check(Boolean(session.id), 'session created', session.id);

  const ready = await poll(
    async () => {
      const s = await api(`/api/sessions/${session.id}`, { token: student.token });
      if (s.status === 'error') throw new Error(s.errorMessage ?? 'session error');
      return s.status === 'ready' ? s : null;
    },
    150000,
    'the lab container to become ready',
  );
  check(ready.status === 'ready', 'DinD container ready with a live inner daemon');

  const ws = await openTerminal(session.id, student.token);
  check(true, 'terminal WebSocket attached');

  const solution = [
    'docker --version',
    "docker info --format '{{.ServerVersion}}'",
    'docker run -d --name hello-web -p 8080:80 nginx:alpine',
    'curl -fsS http://localhost:8080',
  ];

  for (const command of solution) {
    await typeCommand(ws, command);
    await poll(
      async () => {
        const logs = await api(`/api/sessions/${session.id}/commands?limit=50`, { token: student.token });
        return logs.some((l: any) => l.command === command) ? true : null;
      },
      90000,
      `command to be logged: ${command}`,
    );
  }
  check(true, 'all four commands ran and were logged');
  await sleep(2000);

  const checked = await api(`/api/sessions/${session.id}/check`, {
    method: 'POST',
    token: student.token,
  });
  check(
    checked.results.every((r: any) => r.passed),
    'checker marks all four tasks passed',
    checked.results.map((r: any) => (r.passed ? '1' : '0')).join(''),
  );

  const saved = await api(`/api/sessions/${session.id}/files/content`, {
    method: 'PUT',
    token: student.token,
    body: { path: '/root/smoke-note.txt', content: 'vlab smoke\n' },
  });
  check(saved.size === 11, 'editor saves a file in the lab container', String(saved.size));

  const read = await api(
    `/api/sessions/${session.id}/files/content?path=/root/smoke-note.txt`,
    { token: student.token },
  );
  check(read.content === 'vlab smoke\n', 'editor reads the saved file back');

  const teacherRead = await api(
    `/api/sessions/${session.id}/files/content?path=/root/smoke-note.txt`,
    { token: teacher.token },
  );
  check(teacherRead.content === 'vlab smoke\n', 'teacher can read the student file');

  const listing = await api(`/api/sessions/${session.id}/files?path=/root`, {
    token: student.token,
  });
  check(
    listing.entries.some((entry: any) => entry.path === '/root/smoke-note.txt'),
    'workspace listing includes the saved file',
  );

  const inventory = await api(`/api/sessions/${session.id}/docker`, {
    token: teacher.token,
  });
  check(
    inventory.containers.some((row: any) => row.name === 'hello-web'),
    'teacher sees the student container in the Docker inventory',
  );
  check(
    inventory.images.some((row: any) => row.repository === 'nginx'),
    'Docker inventory lists the nginx image',
  );

  const dashboard = await api(`/api/classes/${lab.class.id}/dashboard`, {
    token: teacher.token,
  });
  const row = dashboard.students.find((s: any) => s.name === 'Aarav Sharma');
  check(Boolean(row), 'teacher dashboard lists Aarav Sharma by name');
  check(row?.session?.status === 'ready', 'dashboard shows the running container');
  check(row?.progress === 100, 'dashboard shows 100% progress', `${row?.progress}%`);
  check(dashboard.activity.length > 0, 'critical activity feed has entries', String(dashboard.activity.length));
  check(dashboard.totals.students === 5, 'class roster shows five students');

  ws.close();
  const stopped = await api(`/api/sessions/${session.id}`, {
    method: 'DELETE',
    token: student.token,
  });
  check(stopped.status === 'stopped', 'session stopped and container removed');

  console.log(failures === 0 ? '\nSMOKE OK' : `\nSMOKE FAILED (${failures})`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('\nSMOKE ERROR:', err.message);
  process.exit(1);
});

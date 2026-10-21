/**
 * End-to-end smoke test against a running VLab stack.
 *
 *   npm run smoke                       # http://localhost:3000
 *   BASE_URL=http://host:3000 npm run smoke
 *
 * It logs in as a seeded student, starts real DinD labs, types the numbered
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

async function typeAndWaitForLog(
  ws: WebSocket,
  sessionId: string,
  token: string,
  command: string,
  knownCommands: Set<string>,
) {
  await typeCommand(ws, command);
  await poll(
    async () => {
      const logs = await api(`/api/sessions/${sessionId}/commands?limit=200`, { token });
      const fresh = logs.find((l: any) => l.command === command && !knownCommands.has(l.id));
      if (fresh) {
        knownCommands.add(fresh.id);
        return true;
      }
      return null;
    },
    150000,
    `command to finish: ${command}`,
  );
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

  const advancedCodes = new Set(['Lab 4', 'Lab 5', 'Lab 6', 'Lab 7']);
  check(
    assignments.every((entry: any) => !advancedCodes.has(entry.lab.code)),
    'difficult Labs 4-7 are not assigned to the demo class',
  );

  const lab2 = assignments.find((entry: any) => entry.lab.code === 'Lab 2');
  check(Boolean(lab2), 'seeded Lab 2 assignment is visible to the student');
  check(lab2?.lab.tasks.length === 5, 'Lab 2 has five tasks after seed cleanup');

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

  // These tasks ask the student to save command output. They must not pass just
  // because the daemon can run the same read-only command on the checker's side.
  const preflight = await api(`/api/sessions/${session.id}/check`, {
    method: 'POST',
    token: student.token,
  });
  const evidenceTaskIds = new Set(
    lab.lab.tasks.slice(0, 2).map((task: any) => task.id as string),
  );
  const evidenceTasks = preflight.results.filter((result: any) =>
    evidenceTaskIds.has(result.taskId),
  );
  check(
    evidenceTasks.length === 2 && evidenceTasks.every((result: any) => !result.passedNow),
    'version tasks require student-created files',
    evidenceTasks.map((result: any) => (result.passedNow ? '1' : '0')).join(''),
  );

  const ws = await openTerminal(session.id, student.token);
  check(true, 'terminal WebSocket attached');

  // A session row is reused after a stop, and its command history is kept.
  // Ignore entries that were already there so this run waits for the shell to
  // execute the command we just typed instead of matching an older copy.
  const knownCommands = new Set<string>(
    (
      await api(`/api/sessions/${session.id}/commands?limit=200`, {
        token: student.token,
      })
    ).map((entry: any) => entry.id as string),
  );

  const solution = [
    'docker --version > /root/docker-version.txt',
    "docker info --format '{{.ServerVersion}}' > /root/docker-server.txt",
    'docker run -d --name hello-web -p 8080:80 nginx:alpine',
    'curl -fsS http://localhost:8080',
  ];

  for (const command of solution) {
    await typeAndWaitForLog(ws, session.id, student.token, command, knownCommands);
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
  check(dashboard.totals.students >= 5, 'class roster shows the seeded students');

  ws.close();
  const stopped = await api(`/api/sessions/${session.id}`, {
    method: 'DELETE',
    token: student.token,
  });
  check(stopped.status === 'stopped', 'session stopped and container removed');

  if (lab2) {
    const lab2Session = await api('/api/sessions', {
      method: 'POST',
      token: student.token,
      body: { assignmentId: lab2.id },
    });
    const lab2Ready = await poll(
      async () => {
        const current = await api(`/api/sessions/${lab2Session.id}`, {
          token: student.token,
        });
        if (current.status === 'error') throw new Error(current.errorMessage ?? 'session error');
        return current.status === 'ready' ? current : null;
      },
      150000,
      'the Lab 2 container to become ready',
    );
    check(lab2Ready.status === 'ready', 'Lab 2 DinD container ready');

    const lab2KnownCommands = new Set<string>(
      (
        await api(`/api/sessions/${lab2Session.id}/commands?limit=200`, {
          token: student.token,
        })
      ).map((entry: any) => entry.id as string),
    );
    const lab2Ws = await openTerminal(lab2Session.id, student.token);
    const lab2Commands = [
      'mkdir -p /root/hello-world',
      "printf 'FROM nginx:alpine\\nCOPY index.html /usr/share/nginx/html/index.html\\n' > /root/hello-world/Dockerfile",
      "printf '<h1>Hello World!</h1>\\n' > /root/hello-world/index.html",
      'docker build -t hello-world:v1 /root/hello-world',
      'docker run -d --name hello-web -p 8080:80 hello-world:v1',
      'curl -fsS http://localhost:8080',
    ];

    for (const command of lab2Commands) {
      await typeAndWaitForLog(
        lab2Ws,
        lab2Session.id,
        student.token,
        command,
        lab2KnownCommands,
      );
    }
    check(true, 'Lab 2 numbered commands completed');

    const lab2Checked = await api(`/api/sessions/${lab2Session.id}/check`, {
      method: 'POST',
      token: student.token,
    });
    check(
      lab2Checked.results.every((result: any) => result.passed),
      'Lab 2 hello-world build passes all five checks',
      lab2Checked.results.map((result: any) => (result.passed ? '1' : '0')).join(''),
    );

    const lab2Inventory = await api(`/api/sessions/${lab2Session.id}/docker`, {
      token: teacher.token,
    });
    check(
      lab2Inventory.containers.some((row: any) => row.name === 'hello-web'),
      'Docker inventory shows the Lab 2 web container',
    );
    check(
      lab2Inventory.images.some(
        (row: any) => row.repository === 'hello-world' && row.tag === 'v1',
      ),
      'Docker inventory shows the built hello-world:v1 image',
    );

    const lab2File = await api(
      `/api/sessions/${lab2Session.id}/files/content?path=/root/hello-world/index.html`,
      { token: teacher.token },
    );
    check(
      lab2File.content.includes('Hello World'),
      'teacher can open the Lab 2 page read-only',
    );

    lab2Ws.close();
    const lab2Stopped = await api(`/api/sessions/${lab2Session.id}`, {
      method: 'DELETE',
      token: student.token,
    });
    check(lab2Stopped.status === 'stopped', 'Lab 2 session stopped and container removed');
  }

  const basic = assignments.find((entry: any) => entry.lab.code === 'Basic');
  check(Boolean(basic), 'seeded Basic demo lab is visible to the student');
  check(basic?.lab.tasks.length === 4, 'Basic demo lab has four short tasks');

  if (basic) {
    const basicSession = await api('/api/sessions', {
      method: 'POST',
      token: student.token,
      body: { assignmentId: basic.id },
    });
    const basicReady = await poll(
      async () => {
        const current = await api(`/api/sessions/${basicSession.id}`, {
          token: student.token,
        });
        if (current.status === 'error') throw new Error(current.errorMessage ?? 'session error');
        return current.status === 'ready' ? current : null;
      },
      150000,
      'the Basic demo container to become ready',
    );
    check(basicReady.status === 'ready', 'Basic demo container ready');

    const basicKnownCommands = new Set<string>(
      (
        await api(`/api/sessions/${basicSession.id}/commands?limit=200`, {
          token: student.token,
        })
      ).map((entry: any) => entry.id as string),
    );
    const basicWs = await openTerminal(basicSession.id, student.token);
    const basicCommands = [
      'mkdir -p /root/demo',
      'pwd > /root/demo/pwd.txt',
      'echo "I am learning Docker" > /root/demo/about.txt',
      'docker --version > /root/demo/version.txt',
      'docker run -d --name basic-web -p 8080:80 nginx:alpine',
      'curl -fsS http://localhost:8080 > /root/demo/page.html',
    ];

    for (const command of basicCommands) {
      await typeAndWaitForLog(
        basicWs,
        basicSession.id,
        student.token,
        command,
        basicKnownCommands,
      );
    }
    check(true, 'Basic demo commands completed');

    const basicChecked = await api(`/api/sessions/${basicSession.id}/check`, {
      method: 'POST',
      token: student.token,
    });
    check(
      basicChecked.results.every((result: any) => result.passed),
      'Basic demo lab passes all four checks',
      basicChecked.results.map((result: any) => (result.passed ? '1' : '0')).join(''),
    );

    const basicInventory = await api(`/api/sessions/${basicSession.id}/docker`, {
      token: teacher.token,
    });
    check(
      basicInventory.containers.some((row: any) => row.name === 'basic-web'),
      'Docker inventory shows the demo web container',
    );

    const basicFile = await api(
      `/api/sessions/${basicSession.id}/files/content?path=/root/demo/about.txt`,
      { token: teacher.token },
    );
    check(
      basicFile.content.includes('I am learning Docker'),
      'teacher can open the demo text file read-only',
    );

    basicWs.close();
    const basicStopped = await api(`/api/sessions/${basicSession.id}`, {
      method: 'DELETE',
      token: student.token,
    });
    check(basicStopped.status === 'stopped', 'Basic demo session stopped and container removed');
  }

  console.log(failures === 0 ? '\nSMOKE OK' : `\nSMOKE FAILED (${failures})`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('\nSMOKE ERROR:', err.message);
  process.exit(1);
});

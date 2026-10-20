// Captures product screenshots from the running stack using headless Edge + CDP.
//
//   node scripts/capture-screenshots.mjs
//
// Requires: the compose stack up on http://localhost:5173 and Microsoft Edge.
// Writes PNGs into docs/screenshots/. Starts one real student session so the
// dashboard and terminal screenshots show live data, then stops it again.

import { spawn } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'docs', 'screenshots');
const BASE = process.env.BASE_URL ?? 'http://localhost:5173';
const PORT = 9333;
const PROFILE = join(process.env.TEMP ?? '/tmp', 'vlab-edge-profile');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function edgePath() {
  const candidates = [
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  ];
  return candidates.find((candidate) => existsSync(candidate));
}

async function api(path, { token, method = 'GET', body } = {}) {
  const res = await fetch(`${BASE}/api${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(`${method} ${path} failed: ${data?.error ?? res.status}`);
  return data;
}

class Cdp {
  constructor(socket) {
    this.socket = socket;
    this.nextId = 0;
    this.pending = new Map();
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (message.id && this.pending.has(message.id)) {
        const { resolve, reject } = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) reject(new Error(message.error.message));
        else resolve(message.result);
      }
    });
  }

  send(method, params = {}, sessionId) {
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params, sessionId }));
    });
  }
}

async function screenshot(cdp, sessionId, name) {
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' }, sessionId);
  writeFileSync(join(OUT, name), Buffer.from(data, 'base64'));
  console.log(`  wrote docs/screenshots/${name}`);
}

async function goto(cdp, sessionId, path, settleMs = 2500) {
  await cdp.send('Page.navigate', { url: `${BASE}${path}` }, sessionId);
  await sleep(settleMs);
}

async function setAuth(cdp, sessionId, token, user) {
  const value = JSON.stringify(JSON.stringify({ token, user }));
  await cdp.send(
    'Runtime.evaluate',
    { expression: `sessionStorage.setItem('vlab.auth', ${value})` },
    sessionId,
  );
}

function openTerminal(sessionId, token) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(
      `${BASE.replace(/^http/, 'ws')}/ws/terminal?sessionId=${sessionId}&token=${token}`,
    );
    const timer = setTimeout(() => reject(new Error('terminal WebSocket timed out')), 15000);
    ws.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (message.type === 'ready') {
        clearTimeout(timer);
        resolve(ws);
      }
      if (message.type === 'error') {
        clearTimeout(timer);
        reject(new Error(message.error));
      }
    });
    ws.addEventListener('error', (event) => {
      clearTimeout(timer);
      reject(event.error ?? new Error('terminal WebSocket failed'));
    });
  });
}

async function waitForCommand(sessionId, token, command, knownCommands) {
  for (let attempt = 0; attempt < 300; attempt++) {
    const logs = await api(`/sessions/${sessionId}/commands?limit=200`, { token });
    const fresh = logs.find((entry) => entry.command === command && !knownCommands.has(entry.id));
    if (fresh) {
      knownCommands.add(fresh.id);
      return;
    }
    await sleep(500);
  }
  throw new Error(`command did not finish: ${command}`);
}

async function main() {
  mkdirSync(OUT, { recursive: true });

  console.log(`VLab screenshots against ${BASE}`);

  const teacher = await api('/auth/login', {
    method: 'POST',
    body: { email: 'teacher@vlab.dev', password: 'teacher123' },
  });
  const student = await api('/auth/login', {
    method: 'POST',
    body: { email: 'student1@vlab.dev', password: 'student123' },
  });

  const classes = await api('/classes', { token: teacher.token });
  const classId = classes[0]?.id;
  if (!classId) throw new Error('teacher has no seeded class');

  const assignments = await api('/assignments/mine', { token: student.token });
  const assignment =
    assignments.find((item) => item.lab.code === 'Lab 4') ??
    assignments.find((item) => item.lab.template === 'docker-dind') ??
    assignments[0];
  if (!assignment) throw new Error('no seeded assignment found for student1');

  const session = await api('/sessions', {
    method: 'POST',
    token: student.token,
    body: { assignmentId: assignment.id },
  });
  console.log(`  session ${session.id} provisioning…`);

  let ready = null;
  for (let attempt = 0; attempt < 60; attempt++) {
    const detail = await api(`/sessions/${session.id}`, { token: student.token });
    if (detail.status === 'ready') {
      ready = detail;
      break;
    }
    if (detail.status === 'error') throw new Error(detail.errorMessage ?? 'session failed');
    await sleep(1500);
  }
  if (!ready) throw new Error('session did not become ready in time');
  console.log('  container ready');

  const appScript = `#!/bin/sh
set -eu
sum=$((A+B))
printf '%s\\n' "$sum" > /usr/share/nginx/html/index.html
exec nginx -g 'daemon off;'
`;
  const dockerfile = `FROM nginx:alpine
COPY app.sh /usr/local/bin/app.sh
RUN chmod +x /usr/local/bin/app.sh
CMD ["/usr/local/bin/app.sh"]
`;

  await api(`/sessions/${session.id}/files/content`, {
    method: 'PUT',
    token: student.token,
    body: { path: '/root/sum-service/app.sh', content: appScript },
  });
  await api(`/sessions/${session.id}/files/content`, {
    method: 'PUT',
    token: student.token,
    body: { path: '/root/sum-service/Dockerfile', content: dockerfile },
  });

  const knownCommands = new Set(
    (await api(`/sessions/${session.id}/commands?limit=200`, { token: student.token })).map(
      (entry) => entry.id,
    ),
  );
  const terminal = await openTerminal(session.id, student.token);
  const commands = [
    'docker build -t sum-service:v1 /root/sum-service',
    'docker run -d --name sum-service -p 5000:80 -e A=12 -e B=30 sum-service:v1',
    'curl -fsS http://localhost:5000 | tee /root/sum-result.txt',
    'docker logs sum-service > /root/sum-service.log 2>&1',
    'docker inspect --format "{{.State.Status}} {{.Config.Image}}" sum-service > /root/sum-inspect.txt',
  ];
  for (const command of commands) {
    console.log(`  running: ${command}`);
    terminal.send(
      JSON.stringify({ type: 'input', data: Buffer.from(`${command}\n`).toString('base64') }),
    );
    await waitForCommand(session.id, student.token, command, knownCommands);
  }
  await api(`/sessions/${session.id}/check`, { method: 'POST', token: student.token });
  await sleep(800);

  const edge = edgePath();
  if (!edge) throw new Error('Microsoft Edge not found');

  rmSync(PROFILE, { recursive: true, force: true });
  const browser = spawn(
    edge,
    [
      '--headless=new',
      '--disable-gpu',
      '--hide-scrollbars',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-extensions',
      `--remote-debugging-port=${PORT}`,
      `--user-data-dir=${PROFILE}`,
      'about:blank',
    ],
    { stdio: 'ignore' },
  );

  try {
    let version = null;
    for (let attempt = 0; attempt < 40 && !version; attempt++) {
      try {
        version = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json();
      } catch {
        await sleep(300);
      }
    }
    if (!version) throw new Error('Edge did not expose a debugging port');

    const socket = new WebSocket(version.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      socket.addEventListener('open', resolve);
      socket.addEventListener('error', reject);
    });
    const cdp = new Cdp(socket);

    const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });

    await cdp.send('Page.enable', {}, sessionId);
    await cdp.send('Runtime.enable', {}, sessionId);
    await cdp.send(
      'Emulation.setDeviceMetricsOverride',
      { width: 1440, height: 940, deviceScaleFactor: 1, mobile: false },
      sessionId,
    );

    console.log('capturing:');
    await cdp.send('Runtime.evaluate', { expression: 'sessionStorage.clear()' }, sessionId);
    await goto(cdp, sessionId, '/login', 1500);
    await screenshot(cdp, sessionId, 'login.png');

    await setAuth(cdp, sessionId, teacher.token, teacher.user);
    await goto(cdp, sessionId, '/teacher', 3500);
    await screenshot(cdp, sessionId, 'teacher-overview.png');

    await goto(cdp, sessionId, `/teacher/classes/${classId}`, 4500);
    await screenshot(cdp, sessionId, 'teacher-class.png');

    await cdp.send(
      'Runtime.evaluate',
      { expression: 'window.scrollTo(0, document.body.scrollHeight)' },
      sessionId,
    );
    await sleep(1200);
    await screenshot(cdp, sessionId, 'teacher-evidence.png');

    await cdp.send(
      'Runtime.evaluate',
      { expression: "document.querySelector('tbody tr')?.click()" },
      sessionId,
    );
    await sleep(2500);
    await screenshot(cdp, sessionId, 'teacher-student.png');

    await cdp.send(
      'Runtime.evaluate',
      {
        expression:
          "[...document.querySelectorAll('button')].find((button) => button.textContent?.trim() === 'Files · read-only')?.click()",
      },
      sessionId,
    );
    await sleep(2500);
    await cdp.send(
      'Runtime.evaluate',
      {
        expression:
          "[...document.querySelectorAll('button')].find((button) => button.textContent?.includes('sum-service'))?.click()",
      },
      sessionId,
    );
    await sleep(1200);
    await cdp.send(
      'Runtime.evaluate',
      {
        expression:
          "[...document.querySelectorAll('button')].find((button) => button.textContent?.includes('app.sh'))?.click()",
      },
      sessionId,
    );
    await sleep(1500);
    await screenshot(cdp, sessionId, 'teacher-files.png');

    await cdp.send(
      'Runtime.evaluate',
      {
        expression:
          "[...document.querySelectorAll('button')].find((button) => button.textContent?.trim() === 'Docker')?.click()",
      },
      sessionId,
    );
    await sleep(2500);
    await screenshot(cdp, sessionId, 'teacher-docker.png');

    await setAuth(cdp, sessionId, student.token, student.user);
    await goto(cdp, sessionId, '/student', 3500);
    await screenshot(cdp, sessionId, 'student-labs.png');

    await cdp.send(
      'Runtime.evaluate',
      {
        expression:
          "[...document.querySelectorAll('button')].find((button) => button.textContent?.includes('View / resubmit'))?.click()",
      },
      sessionId,
    );
    await sleep(1200);
    await screenshot(cdp, sessionId, 'student-submission.png');

    await goto(cdp, sessionId, `/student/session/${session.id}`, 5000);
    await screenshot(cdp, sessionId, 'student-terminal.png');

    await cdp.send(
      'Runtime.evaluate',
      {
        expression:
          "[...document.querySelectorAll('button')].find((button) => button.textContent?.trim() === 'Code')?.click()",
      },
      sessionId,
    );
    await sleep(2500);
    await cdp.send(
      'Runtime.evaluate',
      {
        expression:
          "[...document.querySelectorAll('button')].find((button) => button.textContent?.includes('sum-service'))?.click()",
      },
      sessionId,
    );
    await sleep(1200);
    await cdp.send(
      'Runtime.evaluate',
      {
        expression:
          "[...document.querySelectorAll('button')].find((button) => button.textContent?.includes('app.sh'))?.click()",
      },
      sessionId,
    );
    await sleep(1800);
    await screenshot(cdp, sessionId, 'student-editor.png');

    await cdp.send(
      'Runtime.evaluate',
      {
        expression:
          "[...document.querySelectorAll('button')].find((button) => button.textContent?.trim() === 'Docker')?.click()",
      },
      sessionId,
    );
    await sleep(2500);
    await screenshot(cdp, sessionId, 'student-docker.png');
  } finally {
    terminal.close();
    browser.kill();
    await api(`/sessions/${session.id}`, { method: 'DELETE', token: student.token }).catch(() => {});
    // Edge may still hold files in the throwaway profile for a moment.
    try {
      rmSync(PROFILE, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }

  console.log('done');
}

main().catch((error) => {
  console.error(`screenshots failed: ${error.message}`);
  process.exitCode = 1;
});

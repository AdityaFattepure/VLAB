# VLab — manual testing guide

A step-by-step way to exercise every feature, with a short explanation of what
each step is doing underneath. Use two browser tabs: **teacher** and
**student**. The JWT lives in `sessionStorage`, which is per tab, so both users
can be signed in at once.

---

## 0. The moving parts

| Piece | Where | Role |
| --- | --- | --- |
| React app + nginx | `:5173` | Serves the SPA and proxies `/api` and `/ws` to the backend |
| Express + `ws` | `:3000` | Auth, REST API, terminal WebSocket, checker, cleanup |
| SQLite (Prisma) | volume `vlab-data` | Users, classes, labs, tasks, sessions, results, commands |
| Host Docker daemon | `/var/run/docker.sock` | Only the backend can reach it |
| Lab containers | `vlab-*` | One per student; `docker-dind` has its own inner daemon |
| `registry:2` cache | `:5001` | Pull-through cache used by every inner daemon |

Request path: browser → nginx → backend. Terminal path: xterm.js → WebSocket →
backend → `docker exec` → the student's container.

Before testing:

```bash
docker compose ps                     # backend healthy, frontend + registry up
powershell -File scripts\preflight.ps1
powershell -File scripts\reset-demo.ps1   # start from 0%, no containers
```

Do **not** run `docker compose down -v`: it deletes the warm registry cache.

---

## 1. Teacher signs in

1. Open http://localhost:5173.
2. Click **Teacher** under *Demo accounts*, then **Sign in**.
3. You land on **CBADL — Batch A**, join code `CBADL1`.

**What happens:** the form posts to `POST /api/auth/login`. The backend looks up
the user by email, compares the password with `bcryptjs`, and signs a JWT
(`sub`, `role`, 7-day expiry) with `JWT_SECRET`. The frontend stores
`{token, user}` in `sessionStorage` under `vlab.auth` and redirects by role. On
every reload, `AuthProvider` re-validates the token with `GET /api/auth/me`; an
expired or invalid token is discarded.

**Check:** your name and `TEACHER` appear in the header; **Lab editor** is
visible (students never see it).

---

## 2. Read the empty dashboard

The header shows 5 students, 0 live containers, 0 completed. The grid is
**Docker Basics** with `T1 T2 T3` columns.

**What happens:** the page calls `GET /api/classes`, then
`GET /api/classes/:id/dashboard` every **4 seconds**. The backend joins the
class roster, the chosen assignment, the lab tasks, sessions and results, and
returns one payload: per-student task rows, progress, last activity, last
command, a 20-entry activity feed, and totals.

Default assignment selection: the assignment with the most recent session
activity; with no activity at all, the **first lab assigned** to the class
(Docker Basics). Use the **Assignment** dropdown to switch.

---

## 3. Student joins by code (fresh account)

1. Open a **new tab** → http://localhost:5173.
2. **Create student account** → name, email, password → **Create account**.
3. The lab list is empty, so the **Join your class** panel appears.
4. Enter `CBADL1` → **Join class**.

**What happens:** `POST /api/auth/register` hardcodes `role: "student"` (there is
no way to self-register as a teacher). `POST /api/classes/join` resolves the
join code to a class and inserts a `ClassMember` row. The student lab list polls
`GET /api/assignments/mine` every 4 seconds, so the two seeded labs appear
without a reload.

Or sign in as the seeded `student1@vlab.dev` / `student123` (Aarav Sharma) to
skip joining. Seeded students are already in the class.

---

## 4. Start the Docker lab

1. In the student tab, find **Docker Basics** → **Start lab**.
2. Watch the provisioning card: container created → inner daemon starting →
   terminal.

This takes roughly **5–15 seconds**. The page polls
`GET /api/sessions/:id` every **3 seconds**.

**What happens, in order:**

1. `POST /api/sessions` verifies the student is a member of the class, then
   finds or creates the unique `(assignment, student)` Session row and returns
   immediately (`202`).
2. The backend removes any leftover container for that session (by label).
3. `docker create` on the **host** daemon:
   - image `vlab/docker-dind:latest`
   - name `vlab-<studentId>-<labId>` (truncated to 60 chars)
   - labels `vlab.session`, `vlab.student`, `vlab.lab`
   - `Privileged: true`, 1024 MB, 1 CPU, 512 PIDs
   - `DOCKER_TLS_CERTDIR=""` and `VLAB_REGISTRY_MIRROR=http://host.docker.internal:5001`
4. `docker start`, then readiness polling: a non-TTY
   `docker exec … docker info --format '{{.ServerVersion}}'` every second, up to
   90 seconds. The lab is not `ready` until the **inner** dockerd answers.
5. On success: `status = ready`, `readyAt` set, and the command-log tail starts.
   On failure: `status = error` with the container log tail, and the container
   is removed.

**Check:** status pill **Live**, a terminal prompt `student@vlab:~$`, and the
container name in the header.

> The prompt is cosmetic (`PS1` in `/etc/vlab/bashrc`). The shell runs as
> **root inside the disposable lab container**, not on the host.

---

## 5. Use the terminal

The terminal is a real shell inside the lab container, not an emulator.

**What happens:** the browser opens
`ws://localhost:5173/ws/terminal?sessionId=…&token=…`. The backend verifies the
JWT and ownership (student owns the session; teacher owns the class) before
upgrading. For each session there is **one** hijacked
`docker exec … bash --rcfile /etc/vlab/bashrc -i`; every attached client sees
the same stream. Input arrives as `{type:"input", data:<base64>}` and is written
to that exec. Resizes are forwarded. A late joiner gets 64 KB of scrollback.
Teacher input and resize frames are dropped **on the server**, not hidden in the
UI.

---

## 6. Solve the Docker lab

Type these in the student terminal:

```bash
docker ps
docker run -d --name web nginx:alpine
docker build -t myapp:v1 /root/app
docker volume create data
docker ps
docker images
docker volume ls
```

**What each command does:**

- `docker ps` talks to the **inner** daemon in your sandbox. The host's
  containers are invisible here.
- `docker run` asks the inner daemon to pull `nginx:alpine` (through the
  pull-through cache when available) and start a container named `web`.
- `docker build` builds `/root/app`, which contains a tiny Dockerfile:
  `FROM alpine:3.20`, copy `hello.txt`, `CMD cat`. The result is tagged
  `myapp:v1`.
- `docker volume create` makes the named volume `data` in the inner daemon.

**Command logging:** every prompt triggers `PROMPT_COMMAND` in the bashrc,
which appends `epoch_ms|command` to `/var/log/vlab/commands.log`. The backend
runs one long-lived `tail -F` exec per session, parses the lines, and inserts
`CommandLog` rows, deduped on `(sessionId, ts, command)` so a backend restart can
re-attach. This is **advisory**: `unset PROMPT_COMMAND` or `sh` bypasses it.
Checks never read the log.

---

## 7. Check the work

Click **Check my work** in the student view.

**What happens:** `POST /api/sessions/:id/check` runs the tasks in order. Checks
are serialized per session (one in-flight promise), so the button and the
background job cannot interleave. Each task runs, inside the container:

```text
docker exec <container> timeout -s KILL 15 bash -lc "<checkCommand>"
```

The task passes only if:

- the process was **not** killed by the timeout,
- the exit code equals `expectedExitCode` (default `0`), and
- when `expectedOutputContains` is set, **stdout** contains it.

Every run upserts `TaskResult` with the output and `checkedAt`. The first pass
also sets `firstPassedAt`, which is never cleared by later checks. That is why
progress is durable: a student can delete the container and still be "done".

Seeded checks:

| Task | Check |
| --- | --- |
| Run a container named `web` | `docker ps --filter name=^/web$ --format '{{.Names}}'` contains `web` |
| Build `myapp:v1` | `docker images --format '{{.Repository}}:{{.Tag}}' \| grep -qx 'myapp:v1'` |
| Create volume `data` | `docker volume ls -q \| grep -qx 'data'` |

A failed check shows the captured output under the task, which makes debugging
in the viva easy.

**Automatic checks:** a job runs every **30 seconds** and checks only tasks
without `firstPassedAt`, so a student can also pass without clicking. The
button checks everything, so it also refreshes currently failing output.

---

## 8. Watch from the teacher tab

Return to the teacher dashboard without reloading. Within 4 seconds:

- Aarav's row: **Live**, three ticks, **100%**, "just now", last command.
- **Live containers** becomes 1 and **Completed** becomes 1.
- **Live activity** shows the last commands with timestamps.
- Click the row: the drawer shows tasks, a **read-only** live terminal, and the
  full command history (up to 100 entries).

**What happens:** the grid is a projection of the database, not a Docker query.
The drawer polls `GET /api/sessions/:id` (4 s) and
`GET /api/sessions/:id/commands?limit=100` (5 s). The terminal in the drawer
attaches to the same exec stream as the student's terminal, but with
`readOnly`, so its keystrokes are never forwarded.

If a student has not started the lab, the drawer says so and shows no terminal.

---

## 9. Prove the isolation (the key demo moment)

In a host terminal:

```bash
docker ps --filter label=vlab.session --format "table {{.Names}}\t{{.Image}}\t{{.Status}}"
```

You see **only the student sandbox** — never `web`.

In the student terminal:

```bash
docker ps
hostname
docker info --format '{{.ServerVersion}} {{.Driver}} {{.NCPU}}'
```

You see `web` and the inner daemon. Two different daemons: the host daemon
created the sandbox; the sandbox created `web`.

> Inside the lab, `/var/run/docker.sock` is the **inner** daemon's socket. That
> is expected. The host socket is never mounted into lab containers; only the
> backend has it.

Useful host-side inspection:

```bash
docker inspect <sandbox-name> --format '{{.HostConfig.Privileged}} {{.HostConfig.Memory}} {{json .Config.Labels}}'
```

---

## 10. Reset, stop, and stop-all

**Reset lab** (student or teacher drawer):

- removes the sandbox container and provisions a fresh one,
- deletes that session's `TaskResult` rows, so progress returns to 0,
- keeps `CommandLog`, inserts a `[lab reset]` marker, increments `resetCount`.

**Stop lab:**

- removes the container and sets `status = stopped`,
- **keeps task results**, so completion survives the container.

**Stop all labs** (teacher): `POST /api/classes/:id/stop-all` stops every
running session in the class and reports how many were stopped.

Starting again reuses the same Session row and creates a new container.
Verify on the host that `docker ps --filter label=vlab.session` is empty after
stopping.

---

## 11. The Linux lab

1. Student → **Linux Basics** → **Start lab**. This template is unprivileged
   Ubuntu; readiness is immediate once the container runs (no inner daemon).
2. Solve it:
   ```bash
   echo vlab > /root/lab/hello.txt
   useradd -m analyst
   ```
3. Check my work → both tasks pass.

Checks: `test -f /root/lab/hello.txt && grep -q vlab …` and `id analyst`.

This contrast is useful in the viva: the same session/check/terminal machinery
works for a normal Linux container; Docker is a template choice, not a special
case in the app.

---

## 12. Optional: create a lab as the teacher

1. Teacher → **Lab editor** → create a lab (title, description, template).
2. Add a task: title, instructions, check command, optional expected output,
   expected exit code.
3. Assign the lab to **CBADL — Batch A** with an optional due date.
4. The student's lab list shows it within 4 seconds; the teacher dashboard's
   assignment dropdown lists it.

Check example for a new task:

```bash
test -f /root/done && grep -qx ok /root/done
```

with expected output empty and exit code `0`.

---

## 13. Optional: idle cleanup with a short timeout

The cleanup job runs every **5 minutes** and stops sessions whose
`lastActivityAt` is older than `SESSION_IDLE_MINUTES` (default 30).

To observe it quickly:

```powershell
# in .env (create it from .env.example if needed)
# SESSION_IDLE_MINUTES=2
docker compose up -d backend
```

Start a lab, leave the tab idle for ~7–8 minutes, and watch the status become
**stopped**. Set the value back to 30 and recreate the backend afterwards.

---

## 14. Automated verification

```bash
cd backend
npm test                 # 14 checker unit tests
npm run typecheck

$env:BASE_URL="http://localhost:5173"
npm run smoke            # full E2E: login -> DinD -> WS commands -> checks -> dashboard
```

`npm run smoke` prints one `PASS` per assertion and ends with `SMOKE OK`. It
creates a real container, types the three commands through the terminal
WebSocket, runs the checker, verifies the dashboard, then stops and removes the
container.

```powershell
powershell -File scripts\preflight.ps1     # demo readiness
powershell -File scripts\reset-demo.ps1    # clean slate between runs
node scripts\capture-screenshots.mjs       # refresh docs/screenshots
```

---

## 15. Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Spinner forever | inner dockerd failed | `docker logs <sandbox>`; backend log; **Reset lab** |
| `Container did not become ready` | privileged mode / image issue | check Docker Desktop, rebuild `vlab/docker-dind:latest` |
| Terminal says `closed` | shell exited or container stopped | **Reconnect**; check the status pill |
| `409 Lab is not ready yet` | check too early | wait for **Live** |
| Checks fail with `docker: not found` | Docker tasks assigned to the `linux-basic` template | fix the lab template |
| Teacher grid empty | wrong assignment selected / nobody joined | use the Assignment dropdown; check join code |
| `EADDRINUSE :3000` | a native backend is still running | stop it, or use compose only |
| Images pull slowly | registry cache unavailable | check `docker compose ps registry`; the daemon falls back to Docker Hub |
| Everything stopped after sleep | laptop suspended | start the labs again; task results are kept |

---

## 16. Demo hygiene

- Run `scripts\reset-demo.ps1` before each rehearsal, not `down -v`.
- Warm the cache once (start a lab, run the commands), then keep the stack up.
- Keep the teacher tab and 2–3 student tabs open before you present.
- Have the host `docker ps --filter label=vlab.session` command ready in a
  terminal; it is the clearest isolation proof.
- Screenshots live in `docs/screenshots/`; the deck outline is in
  `docs/REVIEW2-OUTLINE.md`.

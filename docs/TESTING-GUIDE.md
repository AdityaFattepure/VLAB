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
| SQLite (Prisma) | volume `vlab-data` | Users, classes, labs, tasks, assignments, sessions, results, commands, submissions |
| Uploads | volume `vlab-data` at `/app/data/uploads` | Evidence files, served only through an authenticated route |
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
3. You land on **Classes**, with four section/batch cards and the class totals.

**What happens:** the form posts to `POST /api/auth/login`. The backend looks up
the user by email, compares the password with `bcryptjs`, and signs a JWT
(`sub`, `role`, 7-day expiry) with `JWT_SECRET`. The frontend stores
`{token, user}` in `sessionStorage` under `vlab.auth` and redirects by role. On
every reload, `AuthProvider` re-validates the token with `GET /api/auth/me`; an
expired or invalid token is discarded.

**Check:** your name and `Teacher` appear in the header; **Classes** and
**Lab library** are visible (students never see them). The same email and
password always reopen this account.

---

## 2. Read the class overview and open a class

The overview shows 4 classes, 9 students, live containers, and evidence waiting
for review. Each card shows the course, section, batch, schedule, room, join
code, student count, assignment count, and live/review counts.

Open **CBAD · CC1 · Batch A**. Its header has a class switcher, the join code
`CBADL1`, and four totals: students, live labs, completed, evidence.

**What happens:** the overview calls `GET /api/classes`, which rolls up each
teacher-owned class. The class page calls
`GET /api/classes/:id/dashboard` every **4 seconds**. The backend joins the
class roster, the chosen assignment, the lab tasks, sessions, results, and
submissions, and returns one payload: per-student task rows, progress, last
activity, last command, a 20-entry activity feed, evidence rows, and totals.

Default assignment selection: the assignment with the most recent session
activity; with no activity at all, the **first lab assigned** to the class
(Lab 1). Use the **Assignment** dropdown to switch. Switching classes uses the
same route with a different id, so the teacher does not sign in again.

**Check:** the grid shows 5 seeded students, and the dropdown contains seven
handout labs. Open **CBAD · CC1 · Batch B** and confirm its plan is different.

---

## 3. Student joins by code (fresh account)

1. Open a **new tab** → http://localhost:5173.
2. **Create account** → name, email, password, **Student** → **Create account**.
3. The lab list is empty, so the **Join another class** panel appears.
4. Enter `CBADL1` → **Join**.

**What happens:** `POST /api/auth/register` validates the email/password and
stores the role from the form (`student` or `teacher`; teacher signup exists for
this classroom demo). `POST /api/classes/join` resolves the join code to a class
and inserts a `ClassMember` row. The student lab list polls
`GET /api/assignments/mine` every 4 seconds, so the seven seeded labs appear
without a reload. The same credentials reopen the same account and its classes.

Or sign in as the seeded `student1@vlab.dev` / `student123` (Aarav Sharma) to
skip joining. Seeded students are already in the class.

---

## 4. Start the Docker lab

1. In the student tab, find **Lab 1 — Docker installation and verification** →
   **Start lab**.
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

## 6. Solve Lab 1

Type these in the student terminal:

```bash
docker --version
docker info --format '{{.ServerVersion}}'
docker run -d --name hello-web -p 8080:80 nginx:alpine
curl -fsS http://localhost:8080
docker ps
```

**What each command does:**

- `docker --version` and `docker info` talk to the **inner** daemon in your
  sandbox. The host's containers are invisible here.
- `docker run` asks the inner daemon to pull `nginx:alpine` (through the
  pull-through cache when available), publishes port 8080, and starts a
  container named `hello-web`.
- `curl` requests the page from inside the sandbox, proving the container is
  serving traffic.
- The final `docker ps` shows the same container with its published port.

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

Seeded Lab 1 checks:

| Task | Check |
| --- | --- |
| Docker client version | `docker version --format '{{.Client.Version}}'` |
| Docker daemon running | `docker info --format '{{.ServerVersion}}'` |
| `hello-web` running on 8080 | `docker ps --filter name=^/hello-web$ --filter status=running … \| grep -qx hello-web` |
| nginx answers | `curl -fsS http://localhost:8080 \| grep -qi 'welcome to nginx'` |

A failed check shows the captured output under the task, which makes debugging
in the viva easy.

**Automatic checks:** a job runs every **30 seconds** and checks only tasks
without `firstPassedAt`, so a student can also pass without clicking. The
button checks everything, so it also refreshes currently failing output.

---

## 8. Watch from the teacher tab

Return to the class workspace without reloading. Within 4 seconds:

- Aarav's row: **Live**, four ticks, **100%**, "just now", last command.
- **Live labs** becomes 1 and **Completed** becomes 1.
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

You see **only the student sandbox** — never `hello-web`.

In the student terminal:

```bash
docker ps
hostname
docker info --format '{{.ServerVersion}} {{.Driver}} {{.NCPU}}'
```

You see `hello-web` and the inner daemon. Two different daemons: the host daemon
created the sandbox; the sandbox created `hello-web`.

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

## 11. Submit and review evidence

1. In the student tab, open **My assignments** and click **Submit evidence** on
   Lab 1.
2. Attach a screenshot, PDF, Word document, or ZIP (max 8 MB) and add a note.
   Submit. The card shows **Submitted** and the evidence file.
3. In the teacher tab, open the class workspace. The **Evidence** count and the
   **Submitted evidence** table update within 4 seconds.
4. Click **Open file** — the browser fetches the file through the authenticated
   API with the teacher's JWT, not a public URL.
5. Enter feedback and a grade, then save. The row becomes **Reviewed**.
6. Back in the student tab, the assignment shows the feedback and grade. The
   student can replace the file and resubmit; the same submission row is
   updated.

**What happens:** `PUT /api/assignments/:id/submission` checks that the student
is enrolled, validates the file type and size, writes the file under
`UPLOADS_DIR/submissions/<submissionId>/`, and upserts a single `Submission` row
per `(assignment, student)`. `POST …/submission/review` is teacher-only and
checks that the teacher owns the class. `GET …/submissions/:id/file` resolves the
path under the uploads root and refuses traversal; a student can only download
their own evidence.

---

## 12. The Linux lab

1. Teacher → **Lab library** → **Linux Basics** → assign it to
   **CBAD · CC1 · Batch A**.
2. Student → refresh **My assignments** → **Linux Basics** → **Start lab**. This
   template is unprivileged Ubuntu; readiness is immediate once the container
   runs (no inner daemon).
3. Solve it:
   ```bash
   echo vlab > /root/lab/hello.txt
   useradd -m analyst
   ```
4. Check my work → both tasks pass.

Checks: `test -f /root/lab/hello.txt && grep -q vlab …` and `id analyst`.

This contrast is useful in a presentation: the same session/check/terminal
machinery works for a normal Linux container; Docker is a template choice, not a
special case in the app.

---

## 13. Optional: create a lab as the teacher

1. Teacher → **Lab library** → create a lab (title, template).
2. Fill in the code, description, objective, course outcome, and estimated time.
3. Add a task: title, instructions, check command, optional expected output,
   expected exit code.
4. Assign the lab to **CBAD · CC1 · Batch A** with submission instructions and an
   optional due date.
5. The student's lab list shows it within 4 seconds; the teacher's assignment
   dropdown lists it.

Check example for a new task:

```bash
test -f /root/done && grep -qx ok /root/done
```

with expected output empty and exit code `0`.

---

## 14. Optional: idle cleanup with a short timeout

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

## 15. Automated verification

```bash
cd backend
npm test                 # unit tests + the API integration test
npm run typecheck

cd ../frontend
npm run build            # tsc --noEmit + vite build

cd ../backend
$env:BASE_URL="http://localhost:5173"
npm run smoke            # full E2E: login -> DinD -> WS commands -> checks -> dashboard
```

`npm test` runs the checker/class/auth/submission unit tests plus an integration
test against a temporary SQLite database. It covers teacher signup, duplicate
signup, class creation, joining by code, batch-specific assignment, evidence
upload, protected download, review, and disallowed file types.

`npm run smoke` prints one `PASS` per assertion and ends with `SMOKE OK`. It
creates a real container, types the four Lab 1 commands through the terminal
WebSocket, runs the checker, verifies the dashboard, then stops and removes the
container.

```powershell
powershell -File scripts\preflight.ps1     # demo readiness
powershell -File scripts\reset-demo.ps1    # clean slate between runs
node scripts\capture-screenshots.mjs       # refresh docs/screenshots
```

---

## 16. Troubleshooting

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

## 17. Demo hygiene

- Run `scripts\reset-demo.ps1` before each rehearsal, not `down -v`.
- Warm the cache once (start a lab, run the commands), then keep the stack up.
- Keep the teacher tab and 2–3 student tabs open before you present.
- Have the host `docker ps --filter label=vlab.session` command ready in a
  terminal; it is the clearest isolation proof.
- Screenshots live in `docs/screenshots/`; the presentation outline is in
  `docs/PRESENTATION-OUTLINE.md`.

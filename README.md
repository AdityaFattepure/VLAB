# VLab — Container-Based Virtual Lab

VLab is a web platform for the **Container Based Application Development Lab**. A teacher assigns a Docker or Linux lab to a class; every student gets an isolated container and a browser terminal; tasks are checked automatically; and the teacher watches the whole class from one dashboard.

Built for a live review demo: one command starts everything.

```bash
docker compose up --build
```

Open **http://localhost:5173**.

---

## Contents

- [Demo accounts](#demo-accounts)
- [What it does](#what-it-does)
- [Architecture](#architecture)
- [Data model](#data-model)
- [Session lifecycle](#session-lifecycle)
- [Quick start](#quick-start)
- [Demo script (review 2)](#demo-script-review-2)
- [How checks work](#how-checks-work)
- [Security model](#security-model)
- [Resource limits and cleanup](#resource-limits-and-cleanup)
- [Project layout](#project-layout)
- [Local development](#local-development)
- [Verification](#verification)
- [Manual testing guide](docs/TESTING-GUIDE.md)
- [API summary](#api-summary)
- [Switching to PostgreSQL](#switching-to-postgresql)
- [AWS (stretch, not deployed)](#aws-stretch-not-deployed)
- [Known limitations](#known-limitations)
- [Screenshots](#screenshots)

---

## Demo accounts

Seeded automatically on startup. The seed is idempotent, so restarting does not wipe work.

| Role | Email | Password |
| --- | --- | --- |
| Teacher — Dr. Meera Krishnan | `teacher@vlab.dev` | `teacher123` |
| Student — Aarav Sharma | `student1@vlab.dev` | `student123` |
| Student — Priya Patel | `student2@vlab.dev` | `student123` |
| Student — Rohan Mehta | `student3@vlab.dev` | `student123` |
| Student — Ananya Iyer | `student4@vlab.dev` | `student123` |
| Student — Kabir Singh | `student5@vlab.dev` | `student123` |

Class: **CBADL — Batch A** · join code **`CBADL1`**

Students can also self-register from the login screen; registration always creates a `student`. They then join with the class code. The teacher dashboard shows their names as soon as they join.

> The JWT is stored in **`sessionStorage`**, which is per tab. That is deliberate: you can run the teacher in one tab and several students in other tabs of the same browser during the demo.

---

## What it does

### Teacher

- Create labs from two templates: `docker-dind` (privileged, nested Docker daemon) and `linux-basic` (Ubuntu).
- Create tasks with a **check command**, expected exit code, and optional expected output.
- Assign a lab to a class, with an optional due date.
- Monitor a student × task grid: names, live/stopped status, per-task pass marks, progress %, last activity, and last command.
- Open a student: full command history and a **read-only live terminal**.
- Reset one lab (fresh container, task results cleared, logs kept and a `[lab reset]` marker added).
- Stop one lab or **stop all labs** in the class.
- Join code is shown at the top of the dashboard.

### Student

- Self-register and join a class by code.
- See assigned labs, due dates, task instructions, and progress.
- Start a lab: the backend creates a container and waits until the inner Docker daemon answers (`starting → ready`), with a spinner in the UI.
- Use a real browser terminal (xterm.js over WebSocket) backed by `docker exec` inside their own container.
- "Check my work" on demand; the backend also checks every 30 seconds.
- Reset or stop their own lab.

---

## Architecture

```mermaid
flowchart LR
    subgraph Browser
        T[Teacher dashboard<br/>polling every 4s]
        S[Student lab<br/>xterm.js]
    end

    T -->|REST /api| N[nginx :5173]
    S -->|REST /api| N
    S -->|WebSocket /ws/terminal| N

    N -->|proxy| A[Express + ws<br/>:3000]
    A --> DB[(SQLite<br/>Prisma)]
    A -->|/var/run/docker.sock| H[Host Docker daemon<br/>Docker Desktop / Linux]

    H --> L1[Student A<br/>privileged DinD container]
    H --> L2[Student B<br/>privileged DinD container]
    H --> L3[Student C<br/>linux-basic container]

    L1 -->|pull-through| R[registry:2 cache<br/>:5001]
    L2 -->|pull-through| R
```

**The important boundary:** only the backend container mounts the Docker socket. Students get a terminal *inside* their lab container, never on the host and never to the socket. The teacher terminal is the same exec stream as the student's, attached read-only server-side.

### Why Docker-in-Docker?

The subject is container-based development, so students must be able to run `docker run`, `docker build`, and `docker volume create` themselves. A DinD sidecar with a **private inner daemon** gives each student their own image/container/volume namespace without exposing the host daemon.

This is why `docker-dind` containers are started `--privileged`: the inner `dockerd` needs it. That is an explicit trade-off, documented under [Security model](#security-model). The `linux-basic` template is unprivileged.

### Terminal path

1. Browser opens `ws://…/ws/terminal?sessionId=…&token=…` (the token is a query parameter because browsers cannot set headers on a WebSocket handshake).
2. The backend verifies the JWT and checks ownership: a student must own the session, a teacher must own the class.
3. One hijacked `docker exec … bash --rcfile /etc/vlab/bashrc -i` is kept per session and shared by every attached client.
4. Student input and resize are forwarded; teacher input and resize are dropped **on the server**, not just hidden in the UI.
5. A late joiner receives a 64 KB scrollback of recent output.

### Command logging

The lab shell exports a `PROMPT_COMMAND` that appends `epoch_ms|command` to `/var/log/vlab/commands.log`. The backend follows that file with one long-lived `docker exec tail -F` per session and stores rows in `CommandLog`, deduped on `(sessionId, ts, command)` so a backend restart can safely re-attach.

This is **advisory telemetry**, not an audit trail: a student can `unset PROMPT_COMMAND` or run `sh`. Checks inspect container state, never command text. This is stated in the UI and should be stated in the viva.

---

## Data model

```mermaid
erDiagram
    USER ||--o{ CLASS : teaches
    USER ||--o{ CLASSMEMBER : joins
    CLASS ||--o{ CLASSMEMBER : has
    USER ||--o{ LAB : creates
    LAB ||--o{ TASK : contains
    CLASS ||--o{ ASSIGNMENT : receives
    LAB ||--o{ ASSIGNMENT : assigned_as
    USER ||--o{ SESSION : runs
    ASSIGNMENT ||--o{ SESSION : spawns
    SESSION ||--o{ TASKRESULT : records
    TASK ||--o{ TASKRESULT : checked_by
    SESSION ||--o{ COMMANDLOG : logs

    USER {
        string id PK
        string name
        string email
        string passwordHash
        string role
    }
    CLASS {
        string id PK
        string name
        string joinCode
        string teacherId FK
    }
    LAB {
        string id PK
        string title
        string template
        string createdBy FK
    }
    TASK {
        string id PK
        string labId FK
        int order
        string checkCommand
        string expectedOutputContains
        int expectedExitCode
    }
    ASSIGNMENT {
        string id PK
        string labId FK
        string classId FK
        datetime dueAt
    }
    SESSION {
        string id PK
        string assignmentId FK
        string studentId FK
        string containerId
        string status
        datetime readyAt
        int resetCount
    }
    TASKRESULT {
        string id PK
        string sessionId FK
        string taskId FK
        boolean passed
        datetime firstPassedAt
        string output
    }
    COMMANDLOG {
        string id PK
        string sessionId FK
        string command
        datetime ts
    }
```

`TaskResult.firstPassedAt` is the durable completion signal: once a task has passed it stays green even if the student later deletes the container. `passed` reflects the latest check.

---

## Session lifecycle

```mermaid
stateDiagram-v2
    [*] --> starting: student clicks Start lab
    starting --> ready: inner dockerd answers
    starting --> error: provisioning failed
    error --> starting: reset / try again
    ready --> stopped: stop, teacher stop-all, idle 30 min
    ready --> starting: reset
    stopped --> starting: start again
```

The terminal and the checker refuse to run unless the session is `ready`, so nothing races the Docker daemon.

---

## Quick start

### Prerequisites

- Docker Desktop (Windows/macOS) or Docker Engine + Compose v2 (Linux)
- ~6 GB free RAM for a small demo (1 GB per DinD student + images)
- Ports `5173`, `3000`, `5001` free

### Start

```bash
docker compose up --build
```

First run builds the backend, frontend, and both lab images. Then:

- App: **http://localhost:5173**
- API health: **http://localhost:3000/api/health**
- Registry cache: `localhost:5001`

Optional configuration: copy `.env.example` to `.env` and adjust. Compose has working defaults, so **no `.env` is required for the demo**.

```bash
cp .env.example .env
```

Stop everything (student containers are removed by the backend, but this also cleans compose services):

```bash
docker compose down
```

Wipe the database and all cached images:

```bash
docker compose down -v
```

### Demo-day preflight

```bash
docker info
docker compose ps
curl http://localhost:3000/api/health
```

`{"ok":true,"docker":true,…}` means the API can reach the daemon.

### Reset between rehearsals

The smoke test and repeated demos leave sessions and passed tasks behind. Clear them so the next demo starts at 0%:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/reset-demo.ps1
```

It removes every container labeled `vlab.session`, then deletes sessions, task results, and command logs. Accounts, the class, labs, tasks, and assignments are kept. The seeded logins still work.

---


## Demo script (review 2)

Aim for 6–8 minutes. Two browser tabs are enough; three students looks better.

1. **Teacher tab** — sign in as `teacher@vlab.dev`. Show the class monitor: 5 seeded students, join code `CBADL1`, empty progress.
2. **Student tab A** — sign in as `student1@vlab.dev` (or register a new student and join `CBADL1`). Open **Docker Basics** → **Start lab**. Point out the provisioning spinner: a real container is being created and the inner daemon is starting.
3. When the terminal appears, run:
   ```bash
   docker ps
   docker run -d --name web nginx:alpine
   docker build -t myapp:v1 /root/app
   docker volume create data
   ```
4. **Prove isolation** on the host, in a separate terminal:
   ```bash
   docker ps --filter label=vlab.session --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}'
   ```
   The host sees one VLab sandbox per student, never the inner `web` container. Inside the student terminal, `docker ps` sees `web`, `myapp`, etc. Two different daemons.
5. Click **Check my work** — all three tasks turn green immediately. (Or wait 30s for the automatic pass.)
6. **Teacher tab** — the grid now shows Aarav Sharma, live status, 3/3, 100%, last command. The activity feed shows the typed commands. Click the row: command history and a **read-only live terminal** appear.
7. Optional: **Reset lab** from the teacher panel, then **Stop all labs**. Show that the dashboard status changes and `docker ps` on the host is clean.
8. **Live activity**: have a second student start a lab and type while the teacher watches. This is the "one dashboard for the whole class" moment.

Fallback if the room network is bad: images are pre-warmed by the lab image and the pull-through cache; the demo commands only use `nginx:alpine` and a local `Dockerfile`. You can also run the API smoke test to show the whole flow headlessly.

---

## How checks work

For each task the backend runs, inside the student's container:

```
docker exec <container> timeout -s KILL 15 bash -lc "<checkCommand>"
```

A task passes when:

- the command exits with `expectedExitCode` (default `0`), **and**
- stdout contains `expectedOutputContains` when that field is set.

There is a 15-second server-side timeout as a backstop. Checks are serialized per session (one at a time), so the 30-second background loop and the student's button cannot interleave. The loop only checks tasks that have not passed yet; the button checks everything so the UI reflects the current state.

Examples from the seed:

| Lab | Task | Check |
| --- | --- | --- |
| Docker Basics | Run a container named `web` | `docker ps --filter name=^/web$ --format '{{.Names}}'` contains `web` |
| Docker Basics | Build an image tagged `myapp:v1` | `docker images … \| grep -qx 'myapp:v1'` |
| Docker Basics | Create a volume named `data` | `docker volume ls -q \| grep -qx 'data'` |
| Linux Basics | Create `/root/lab/hello.txt` containing `vlab` | `test -f … && grep -q vlab …` |
| Linux Basics | Create user `analyst` | `id analyst` |

Checks inspect **state**, never the command history, so renaming a container or doing it a different way still passes.

---

## Security model

What is enforced:

- `docker.sock` is mounted **only** into the backend container. Lab containers never receive it.
- Passwords are bcrypt-hashed; JWTs are signed with `JWT_SECRET` and expire (default 7 days).
- `/api/auth/register` hardcodes `role = "student"`. Teachers are seeded.
- Every session route checks ownership: students can only touch their own session; teachers only sessions in their own class.
- The terminal WebSocket authenticates and authorizes before upgrading; teacher input is dropped server-side.
- Lab containers get memory, CPU, and PID limits. Idle sessions are stopped after 30 minutes.
- The frontend never receives task `checkCommand` values for student accounts.

Deliberate trade-offs, and what to say in the viva:

- **DinD is privileged.** A privileged container is close to root on the host. In a real deployment each lab would be a separate VM/microVM (Firecracker, Kata, gVisor) or a remote Docker host. VLab's isolation is per-student namespace isolation, not a hostile multi-tenant security boundary.
- **The command log is advisory.** `PROMPT_COMMAND` can be unset, and `sh` bypasses it. Checks are the source of truth.
- **The JWT is in `sessionStorage`.** Convenient for multi-user demos; an XSS would expose it. A production build would use httpOnly cookies + CSRF protection.
- **The terminal token is a query parameter.** Browsers cannot set WS headers. Use TLS in production so the URL is not visible on the wire.
- **Class join codes are shared secrets.** Anyone with the code can join as a student; that is the intended classroom model.

Never expose `docker.sock` to students. Do not run this as-is on the public internet.

---

## Resource limits and cleanup

| Template | Memory | CPU | PIDs | Privileged |
| --- | --- | --- | --- | --- |
| `docker-dind` | 1024 MB | 1 | 512 | yes |
| `linux-basic` | 512 MB | 1 | 256 | no |

- Container names/labels: `vlab-<studentId>-<labId>` with labels `vlab.session`, `vlab.student`, `vlab.lab`. Cleanup targets labels, not name guessing.
- Idle cleanup runs every 5 minutes and stops sessions whose `lastActivityAt` is older than `SESSION_IDLE_MINUTES` (default 30). "Activity" includes terminal input and logged commands.
- `POST /api/classes/:id/stop-all` stops every running session in the class.
- Reset removes the container, clears `TaskResult` rows for that session, keeps `CommandLog`, adds a `[lab reset]` marker, and increments `resetCount`.

Capacity note: each DinD student reserves 1 GB. A 4 GB Docker Desktop VM comfortably runs 2–3 students plus the stack. Do not plan a 40-student live demo on one laptop.

---

## Project layout

```
.
├── docker-compose.yml        # backend, frontend, registry cache, lab image builds
├── .env.example
├── backend/
│   ├── prisma/schema.prisma  # SQLite schema
│   ├── prisma/seed.ts        # idempotent demo data
│   ├── scripts/smoke.ts      # end-to-end API + terminal + checker test
│   ├── scripts/spike.ts      # low-level Docker/DinD/exec spike
│   └── src/
│       ├── routes/           # auth, classes, labs, tasks, assignments, sessions
│       ├── services/         # docker, sessions, checker, command log, dashboard
│       ├── ws/               # terminal WebSocket + shared exec attach manager
│       ├── jobs/             # 30s checker, idle cleanup
│       └── app.ts / index.ts
├── frontend/
│   ├── src/pages/            # Login, TeacherDashboard, LabEditor, StudentLabs, SessionView
│   ├── src/components/       # Header, TerminalView, StatusPill, ProgressBar, drawer
│   └── nginx.conf            # SPA + /api + /ws proxy
├── lab-images/
│   ├── docker-dind/          # docker:dind + bash + logging + warm pulls
│   └── linux-basic/          # ubuntu:24.04 + tools
├── scripts/
│   ├── preflight.ps1         # demo-day Windows checks
│   └── capture-screenshots.mjs
└── docs/
    ├── REVIEW2-OUTLINE.md    # slide-by-slide deck outline
    ├── adr/                  # architecture decisions
    └── screenshots/          # captured from a live run
```

---

## Local development

Run the backend natively (Windows, Docker Desktop):

```bash
cd backend
copy .env.example .env   # then set DOCKER_SOCKET to Docker Desktop's pipe
npm install
npx prisma db push
npm run db:seed
npm start                # http://localhost:3000
```

`backend/.env` for Windows:

```dotenv
DOCKER_SOCKET=npipe:////./pipe/dockerDesktopLinuxEngine
DATABASE_URL=file:./dev.db
JWT_SECRET=dev-secret
PORT=3000
```

Frontend:

```bash
cd frontend
npm install
npm run dev              # http://localhost:5173, proxies /api and /ws to :3000
```

The Docker client accepts either a unix socket path or a `npipe://…` URL, so the same code runs in compose and natively on Windows.

---

## Verification

Backend typecheck and frontend production build:

```bash
cd backend && npm run typecheck
cd frontend && npm run build
```

Docker/DinD spike (no app required):

```bash
cd backend && npm run spike
```

End-to-end smoke test against a running stack. It logs in, starts a real DinD lab, types the three solution commands through the actual terminal WebSocket, runs the checker, and verifies the teacher dashboard:

```bash
cd backend && npm run smoke

# or against a different host
$env:BASE_URL="http://localhost:3000"; npm run smoke
```

Expected final line: `SMOKE OK`.

For the full click-by-click walkthrough with an explanation of what happens at
each step, see [`docs/TESTING-GUIDE.md`](docs/TESTING-GUIDE.md).

A Windows demo-day preflight (engine, ports, images, health, credentials):

```powershell
powershell -ExecutionPolicy Bypass -File scripts/preflight.ps1
```


---

## API summary

All routes are under `/api`. `Authorization: Bearer <jwt>` unless noted.

| Method | Path | Who | Purpose |
| --- | --- | --- | --- |
| POST | `/auth/login` | public | Sign in, returns token |
| POST | `/auth/register` | public | Create student account |
| GET | `/auth/me` | auth | Current user |
| GET | `/classes` | auth | Teacher: own classes; student: joined classes |
| POST | `/classes` | teacher | Create class (generates join code) |
| POST | `/classes/join` | student | Join by code |
| GET | `/classes/:id/dashboard` | teacher | Student × task grid + activity |
| POST | `/classes/:id/stop-all` | teacher | Stop every running lab |
| GET | `/labs` | teacher | Own labs with tasks |
| POST | `/labs` | teacher | Create lab |
| PUT/DELETE | `/labs/:id` | teacher | Edit / delete lab |
| POST | `/labs/:id/tasks` | teacher | Add task |
| PUT/DELETE | `/tasks/:id` | teacher | Edit / delete task |
| POST | `/assignments` | teacher | Assign lab to class |
| GET | `/assignments/mine` | student | Labs assigned to my classes |
| POST | `/sessions` | student | Start (or reuse) my lab |
| GET | `/sessions/:id` | owner/teacher | Session, tasks, results |
| DELETE | `/sessions/:id` | owner/teacher | Stop and remove container |
| POST | `/sessions/:id/check` | owner/teacher | Run all checks now |
| POST | `/sessions/:id/reset` | owner/teacher | Fresh container, clear results |
| GET | `/sessions/:id/commands` | owner/teacher | Command history |
| GET | `/health` | public | API + Docker reachability |
| WS | `/ws/terminal?sessionId=&token=` | owner/teacher | Terminal stream |

---

## Switching to PostgreSQL

SQLite is chosen for demo reliability (single file, no extra service). To move to PostgreSQL:

1. In `backend/prisma/schema.prisma`, change the datasource:
   ```prisma
   datasource db {
     provider = "postgresql"
     url      = env("DATABASE_URL")
   }
   ```
2. Add a Postgres service to `docker-compose.yml` and point `DATABASE_URL` at it:
   ```yaml
   postgres:
     image: postgres:16-alpine
     environment:
       POSTGRES_PASSWORD: vlab
       POSTGRES_DB: vlab
     volumes:
       - pg-data:/var/lib/postgresql/data

   backend:
     environment:
       DATABASE_URL: postgresql://postgres:vlab@postgres:5432/vlab
     depends_on:
       postgres:
         condition: service_healthy
   ```
3. Add a healthcheck for Postgres and keep the `db push` + seed entrypoint.
4. Run `npx prisma db push` (or `prisma migrate deploy` with migrations for production).

The Prisma schema uses portable types (`String`, `Int`, `Boolean`, `DateTime`) and no SQLite-only features, so no model changes are needed.

---

## AWS (stretch, not deployed)

The deployed story, if there were more time:

- **EC2**: DinD needs at least a **t3.medium (4 GB)** for one or two students; each lab reserves ~1 GB plus images. A realistic class needs an autoscaling group of lab hosts, not one box.
- **ECR**: push `vlab/backend`, `vlab/frontend`, `vlab/linux-basic`, `vlab/docker-dind`; pull them on the host.
- **S3**: lab assets, exports of results, screenshots.
- **Architecture change for production**: do not run privileged DinD on a shared app server. Give each student a disposable microVM (Firecracker/Kata) or a dedicated Docker host, and route terminal traffic through the API.
- **Networking**: ALB with WebSocket support, TLS termination, sticky sessions not needed because the backend shares one exec stream per session in memory — but a multi-instance backend would need a shared terminal broker. That is the main reason this MVP runs as a single backend instance.

This project was demonstrated locally; no AWS resources are deployed.

---

## Known limitations

- One backend instance only: the terminal exec registry and checker serialization are in memory.
- SQLite: fine for a classroom demo, not for concurrent writes at scale.
- Command logging is advisory (see above).
- DinD containers start in 5–15 seconds; the UI handles it, but it is not instant.
- Images inside a student's inner daemon are lost when the container is stopped. The pull-through cache makes re-pulls fast.
- No file upload, no grading export, no password reset, no email verification.
- Screenshots in the report must be captured from the running app (placeholders below).

---

## Screenshots

Captured from a live run into `docs/screenshots/`. Regenerate them with headless
Edge against a running stack:

```bash
node scripts/capture-screenshots.mjs
```

| File | What it shows |
| --- | --- |
| `docs/screenshots/login.png` | Login screen with the demo-account shortcuts |
| `docs/screenshots/teacher-live.png` | Student × task grid, live container, activity feed |
| `docs/screenshots/teacher-drawer.png` | Read-only terminal + command history for one student |
| `docs/screenshots/student-labs.png` | Student lab list with per-task progress |
| `docs/screenshots/student-terminal.png` | Terminal, task checklist, and progress in one view |

Two are worth capturing by hand because they are timing- or host-specific:

| File | What to capture |
| --- | --- |
| `docs/screenshots/student-provisioning.png` | The spinner while the DinD container starts |
| `docs/screenshots/isolation.png` | Host `docker ps --filter name=vlab-` next to the student's inner `docker ps` |


---

## Stack

- **Backend**: Node 22, Express 5, TypeScript, Prisma 6, SQLite, `dockerode`, `ws`, `jsonwebtoken`, `bcryptjs`
- **Frontend**: React 19, Vite 8, Tailwind CSS 4, React Router 7, xterm.js
- **Runtime**: Docker Compose v2, nginx, `docker:dind`, `registry:2` pull-through cache

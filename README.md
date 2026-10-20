# VLab — Container-Based Virtual Lab

VLab is a teaching workspace for the **Container Based Application Development Lab**. A teacher runs several sections and batches, assigns the real handout experiments, and reviews evidence. Every student gets an isolated container, a browser terminal, a small code editor, and a read-only Docker inventory; tasks are checked automatically; and the teacher sees the whole class from one dashboard.

Built for the classroom: one command starts everything.

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
- [Browser workspace](#browser-workspace)
- [Quick start](#quick-start)
- [Teaching demo](#teaching-demo)
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

Accounts live in the lab SQLite database. Signing in again with the same email and password reopens the same account, its classes, sessions, and submissions.

| Role | Email | Password |
| --- | --- | --- |
| Teacher — Dr. Meera Krishnan | `teacher@vlab.dev` | `teacher123` |
| Student — Aarav Sharma | `student1@vlab.dev` | `student123` |
| Student — Priya Patel | `student2@vlab.dev` | `student123` |
| Student — Rohan Mehta | `student3@vlab.dev` | `student123` |
| Student — Ananya Iyer | `student4@vlab.dev` | `student123` |
| Student — Kabir Singh | `student5@vlab.dev` | `student123` |
| Student — Ishita Rao | `student6@vlab.dev` | `student123` |
| Student — Dev Malhotra | `student7@vlab.dev` | `student123` |
| Student — Sara Khan | `student8@vlab.dev` | `student123` |
| Student — Nikhil Joshi | `student9@vlab.dev` | `student123` |

The teacher teaches CBAD to two sections, each split into two batches:

| Join code | Class | Schedule | Room | Seeded students |
| --- | --- | --- | --- | --- |
| `CBADL1` | CBAD · CC1 · Batch A | Monday · 10:00–12:00 | Lab 204 | 5 |
| `CBADL2` | CBAD · CC1 · Batch B | Wednesday · 10:00–12:00 | Lab 204 | 2 |
| `CBADL3` | CBAD · CC3 · Batch A | Tuesday · 10:00–12:00 | Lab 206 | 2 |
| `CBADL4` | CBAD · CC3 · Batch B | Thursday · 10:00–12:00 | Lab 206 | 0 |

The seed follows the seven experiments in the CBAD handout (`23CSE3118`). CBADL1 receives all seven; the other batches receive a smaller plan so switching classes is visibly different. The teacher can assign **Lab 3 to CC1 Batch A and Lab 2 to CC1 Batch B** from the lab library.

Students can register from the login screen and join with a class code. The login screen also creates teacher accounts for this demo; a production deployment would gate that behind an administrator or invite.

> The JWT is stored in **`sessionStorage`**, which is per tab. That is deliberate: you can run the teacher in one tab and several students in other tabs of the same browser during a demo.

---

## What it does

### Teacher

- See every class (course, section, batch, schedule, room, join code, live labs, evidence to review) on one overview and switch between them.
- Create another section or batch; each gets its own join code, roster, and assignment plan.
- Change a class's subject, section, batch, schedule, or room in place; the join code and roster stay the same.
- Work from the seven handout labs plus two practice labs, with objectives, course outcomes, and estimated time.
- Create or edit labs and checkable tasks; assign different labs to different batches of the same section.
- Add submission instructions and choose whether evidence is required.
- Monitor a student × task grid: names, live/stopped status, per-task pass marks, progress %, last activity, and last command.
- Open a student: full command history, a **read-only live terminal**, a read-only file view, and a Docker inventory.
- Review evidence: open the screenshot/PDF/Word/ZIP, leave feedback, and record a grade.
- Reset one lab (fresh container, task results cleared, logs kept and a `[lab reset]` marker added).
- Stop one lab or **stop all labs** in the class.

### Student

- Self-register and join a class by code; assignments are grouped by class.
- See the lab code, objective, course outcome, due date, task instructions, and progress.
- Start a lab: the backend creates a container and waits until the inner Docker daemon answers (`starting → ready`), with a spinner in the UI.
- Use a real browser terminal (xterm.js over WebSocket) backed by `docker exec` inside their own container.
- Browse and edit text files under `/root` in a CodeMirror editor, without switching to `nano`.
- Inspect the containers, images, networks, and volumes in their inner Docker daemon from a read-only Docker tab.
- "Check my work" on demand; the backend also checks every 30 seconds.
- Submit evidence like a classroom: a screenshot, PDF, Word document, or ZIP plus a note.
- See the teacher's feedback and grade, and resubmit if the work changes.
- Reset or stop their own lab.

---

## Architecture

```mermaid
flowchart LR
    subgraph Browser
        T[Teacher dashboard<br/>polling every 4s]
        S[Student lab<br/>terminal · code · docker]
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

### Browser workspace

The live-lab surface has three tabs:

| Tab | Student | Teacher |
| --- | --- | --- |
| **Terminal** | Full interactive shell | Read-only attach to the same shell |
| **Code** | List, open, create, and save text files under `/root` | **Files · read-only** view of the same tree |
| **Docker** | Read-only containers, images, networks, volumes | Read-only inventory of the student's inner daemon |

The Code tab uses CodeMirror 6 with syntax highlighting for HTML, JavaScript,
TypeScript, JSON, Python, YAML, shell, and Dockerfile. Saves are explicit and
support `Ctrl/Cmd+S`; the editor warns before discarding unsaved changes. The
backend enforces a `/root` allowlist, a 256 KiB limit, and UTF-8 text only, and
teachers cannot write through the API.

The Docker tab is an inventory, not a control panel. It runs four fixed,
read-only `docker … ls/ps` commands inside the student's container and refreshes
every five seconds. No request value is passed to Docker, and the host socket
stays outside the lab container.

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
    USER ||--o{ SUBMISSION : submits
    ASSIGNMENT ||--o{ SUBMISSION : collects

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
        string courseCode
        string courseTitle
        string courseShort
        string section
        string batch
        string schedule
        string room
    }
    LAB {
        string id PK
        string title
        string template
        string code
        string objective
        string co
        int estimatedMinutes
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
        string instructions
        boolean requiresSubmission
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
    SUBMISSION {
        string id PK
        string assignmentId FK
        string studentId FK
        string status
        string note
        string fileName
        string fileType
        int fileSize
        string filePath
        datetime submittedAt
        datetime reviewedAt
        string feedback
        int grade
    }
```

`TaskResult.firstPassedAt` is the durable completion signal: once a task has passed it stays green even if the student later deletes the container. `passed` reflects the latest check.

`Class` is a course + section + batch, so **CC1 Batch A** and **CC1 Batch B** are separate classes with separate rosters, join codes, and assignment plans. `Submission` is unique per `(assignment, student)`; a resubmission updates the same row and keeps the latest file on the uploads volume.

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

It removes every container labeled `vlab.session`, then deletes sessions, task results, command logs, and evidence submissions (including uploaded files). Accounts, classes, labs, tasks, and assignments are kept. The seeded logins still work.

---

## Teaching demo

Aim for 8–10 minutes. Two browser tabs are enough; three students looks better.

1. **Teacher overview** — sign in as `teacher@vlab.dev`. Point out the four classes: CBAD · CC1 · Batch A/B and CBAD · CC3 · Batch A/B, each with its own schedule, room, join code, and count of live labs and evidence to review.
2. **Switch class** — open **CBAD · CC1 · Batch A**. Show that the assignment dropdown contains the seven handout experiments. Switch to **CBAD · CC1 · Batch B** from the header; it has a different assignment plan.
3. **Assign to a batch** — open **Lab library** → **Lab 3** → *Assign to a class* → `CBAD · CC1 · Batch B`. Explain that Batch A and Batch B are separate classes, so they can receive different labs.
4. **Start a lab** — in a student tab, sign in as `student1@vlab.dev` (or register a student and join `CBADL1`). Open **Lab 1 — Docker installation and verification** → **Start lab**. Point out the provisioning spinner: a real container is being created and the inner daemon is starting.
5. When the terminal appears, run:
   ```bash
   docker --version
   docker info --format '{{.ServerVersion}}'
   docker run -d --name hello-web -p 8080:80 nginx:alpine
   curl -fsS http://localhost:8080
   ```
6. **Prove isolation** on the host, in a separate terminal:
   ```bash
   docker ps --filter label=vlab.session --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}'
   ```
   The host sees one VLab sandbox per student, never the inner `hello-web` container. Inside the student terminal, `docker ps` sees `hello-web`. Two different daemons.
7. Click **Check my work** — all four tasks turn green immediately. (Or wait 30s for the automatic pass.) Open the **Code** tab, create `/root/demo-note.txt`, and save it. Then open the **Docker** tab: `hello-web` and the `nginx:alpine` image are visible without typing `docker ps` or `docker images`.
8. **Submit evidence** — from **My assignments**, click **Submit evidence**, attach a screenshot or PDF, and add a note. Show the submitted badge.
9. **Teacher tab** — the grid now shows Aarav Sharma, live status, 4/4, 100%, last command. The activity feed shows the typed commands and the `[editor] saved` marker. Click the row: command history, a **read-only live terminal**, the student's files, and the Docker inventory.
10. **Review evidence** — open **Submitted evidence** in the class workspace, download the file, leave feedback, and set a grade. Switch back to the student: the same submission now shows the feedback and grade.
11. Optional: **Reset lab** from the teacher panel, then **Stop all labs**. Show that the dashboard status changes and `docker ps` on the host is clean.

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

Examples from the seeded handout labs:

| Lab | Task | Check |
| --- | --- | --- |
| Lab 1 | Run a container named `hello-web` | `docker ps --filter name=^/hello-web$ --filter status=running …` |
| Lab 1 | Verify nginx answers on port 8080 | `curl -fsS http://localhost:8080 \| grep -qi 'welcome to nginx'` |
| Lab 2 | Build an image tagged `hello-world:v1` | `docker images … \| grep -qx 'hello-world:v1'` |
| Lab 3 | Save and inspect the container logs | `test -s /root/web.log && grep -q 'GET /' /root/web.log` |
| Lab 4 | Build `sum-service:v1` from `app.sh` + `Dockerfile` | `docker images … \| grep -qx 'sum-service:v1'` |
| Lab 5 | Reach the service by name on `sum-net` | `docker exec sum-client cat /root/result.txt \| grep -qx 42` |
| Practice | Create a volume named `data` | `docker volume ls -q \| grep -qx 'data'` |

Checks inspect **state**, never the command history, so renaming a container or doing it a different way still passes.

---

## Security model

What is enforced:

- `docker.sock` is mounted **only** into the backend container. Lab containers never receive it.
- Passwords are bcrypt-hashed; JWTs are signed with `JWT_SECRET` and expire (default 7 days).
- `/api/auth/register` accepts `role: "student" | "teacher"` so the demo can create both account types; a production deployment would restrict teacher signup to an administrator or invite code.
- Class, lab, task, session, and submission routes check ownership; students cannot read another student's evidence, and teachers only see classes they teach.
- The file API normalises paths and refuses anything outside `/root`; paths are passed to `sh -c` as positional arguments, never interpolated. Students can write; teachers are read-only.
- File reads reject binary content and files over 256 KiB; writes reject NUL bytes and oversized bodies before touching the container.
- The Docker inventory endpoint can only run the four fixed read-only commands listed above.
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
│   ├── prisma/labs.ts        # the seven handout experiments + practice labs
│   ├── prisma/seed.ts        # idempotent demo data
│   ├── prisma/reset-demo.ts  # clears sessions + submissions between rehearsals
│   ├── scripts/smoke.ts      # end-to-end API + terminal + checker test
│   ├── scripts/spike.ts      # low-level Docker/DinD/exec spike
│   ├── uploads/              # local evidence files (ignored by git)
│   └── src/
│       ├── routes/           # auth, classes, labs, tasks, assignments, sessions
│       ├── services/         # docker, sessions, checker, dashboard, submissions, workspace
│       ├── ws/               # terminal WebSocket + shared exec attach manager
│       ├── jobs/             # 30s checker, idle cleanup
│       └── app.ts / index.ts
├── frontend/
│   ├── src/pages/            # Login, TeacherOverview, TeacherDashboard, LabEditor, StudentLabs, SessionView
│   ├── src/components/       # Header, TerminalView, CodeEditor, WorkspaceFiles, DockerInspector, drawer
│   └── nginx.conf            # SPA + /api + /ws proxy
├── lab-images/
│   ├── docker-dind/          # docker:dind + bash + logging + warm pulls
│   └── linux-basic/          # ubuntu:24.04 + tools
├── scripts/
│   ├── preflight.ps1         # demo-day Windows checks
│   └── capture-screenshots.mjs
└── docs/
    ├── PRESENTATION-OUTLINE.md # suggested project presentation sequence
    ├── TESTING-GUIDE.md      # click-by-click verification
    ├── superpowers/          # design specs and implementation plans
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

Backend unit + API integration tests, backend typecheck, and frontend production build:

```bash
cd backend && npm test
cd backend && npm run typecheck
cd frontend && npm run build
```

The API integration test runs against a temporary SQLite file and covers teacher signup, class creation, joining by code, assignment, evidence upload, teacher review, file access control, and the rejection of disallowed file types.

Docker/DinD spike (no app required):

```bash
cd backend && npm run spike
```

End-to-end smoke test against a running stack. It logs in, starts a real DinD lab, types the four Lab 1 commands through the actual terminal WebSocket, runs the checker, verifies the editor file API and Docker inventory, then creates and builds Lab 4 from files saved through the same API. It also verifies the teacher dashboard:

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
| POST | `/auth/register` | public | Create a student or teacher account |
| GET | `/auth/me` | auth | Current user |
| GET | `/classes` | auth | Teacher: own classes with counts; student: joined classes |
| POST | `/classes` | teacher | Create a section/batch class (generates join code) |
| PATCH | `/classes/:id` | teacher | Change course, section, batch, schedule, room |
| POST | `/classes/join` | student | Join by code |
| GET | `/classes/:id` | teacher | Class details and roster |
| GET | `/classes/:id/dashboard` | teacher | Student × task grid, assignments, evidence summary, activity |
| GET | `/classes/:id/activity` | teacher | Recent class activity |
| POST | `/classes/:id/stop-all` | teacher | Stop every running lab |
| GET | `/labs` | teacher | Own labs with tasks |
| POST | `/labs` | teacher | Create lab |
| PUT/DELETE | `/labs/:id` | teacher | Edit / delete lab |
| POST | `/labs/:id/tasks` | teacher | Add task |
| PUT/DELETE | `/tasks/:id` | teacher | Edit / delete task |
| POST | `/assignments` | teacher | Assign lab to a class, with instructions + evidence flag |
| DELETE | `/assignments/:id` | teacher | Remove an assignment and its sessions |
| GET | `/assignments/mine` | student | Labs assigned to my classes |
| GET | `/assignments/:id/submissions` | teacher | Roster + evidence for one assignment |
| PUT | `/assignments/:id/submission` | student | Upload/replace evidence and note |
| POST | `/assignments/:id/submission/review` | teacher | Feedback and grade |
| GET | `/assignments/submissions/:id/file` | owner/teacher | Authenticated evidence download |
| POST | `/sessions` | student | Start (or reuse) my lab |
| GET | `/sessions/:id` | owner/teacher | Session, tasks, results |
| DELETE | `/sessions/:id` | owner/teacher | Stop and remove container |
| POST | `/sessions/:id/check` | owner/teacher | Run all checks now |
| POST | `/sessions/:id/reset` | owner/teacher | Fresh container, clear results |
| GET | `/sessions/:id/commands` | owner/teacher | Command history |
| GET | `/sessions/:id/files?path=/root` | owner/teacher | List a directory under `/root` |
| GET | `/sessions/:id/files/content?path=…` | owner/teacher | Read a UTF-8 file under `/root` |
| PUT | `/sessions/:id/files/content` | student owner | Create/overwrite a text file (256 KiB) |
| GET | `/sessions/:id/docker` | owner/teacher | Read-only containers, images, networks, volumes |
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
- The Code tab edits UTF-8 text files up to 256 KiB; binary files, deletion, and multi-file tabs are terminal jobs. Teachers cannot write files from the review drawer.
- The Docker tab is a read-only inventory. It deliberately does not expose Docker Desktop's GUI or start/stop/delete controls.
- Lab 6 uses Docker CLI replicas and documents the equivalent `docker compose up -d --scale` command; Compose is not a hard lab dependency.
- Evidence files are stored on the `vlab-data` volume, not object storage; there is no virus scan, gradebook export, password reset, or email verification.
- The seeded due dates are relative to seed time, so they move each time the stack starts.
- Screenshots in the report must be captured from the running app.

---

## Screenshots

Captured from a live run into `docs/screenshots/`. The script starts Lab 4,
writes `app.sh` and `Dockerfile` through the editor API, builds the image, and
captures the terminal, Code, and Docker tabs. Regenerate them with headless Edge
against a running stack:

```bash
node scripts/capture-screenshots.mjs
```

| File | What it shows |
| --- | --- |
| `docs/screenshots/login.png` | Login screen with the demo-account shortcuts and account note |
| `docs/screenshots/teacher-overview.png` | Four sections/batches, live counts, and evidence to review |
| `docs/screenshots/teacher-class.png` | Class workspace with assignment switcher and student × task grid |
| `docs/screenshots/teacher-evidence.png` | Submitted evidence with file, feedback, and grade controls |
| `docs/screenshots/teacher-student.png` | Student drawer with tasks, read-only terminal, and command history |
| `docs/screenshots/teacher-files.png` | Teacher reading a student's Lab 4 files in read-only mode |
| `docs/screenshots/teacher-docker.png` | Teacher inspecting the student's containers and images |
| `docs/screenshots/student-labs.png` | Grouped handout labs with progress and evidence actions |
| `docs/screenshots/student-submission.png` | Evidence modal with an existing review and resubmission |
| `docs/screenshots/student-terminal.png` | Terminal, task checklist, and progress in one view |
| `docs/screenshots/student-editor.png` | Code tab with the Lab 4 `app.sh` and file rail |
| `docs/screenshots/student-docker.png` | Docker tab showing the running `sum-service` container |

Two are worth capturing by hand because they are timing- or host-specific:

| File | What to capture |
| --- | --- |
| `docs/screenshots/student-provisioning.png` | The spinner while the DinD container starts |
| `docs/screenshots/isolation.png` | Host `docker ps --filter name=vlab-` next to the student's inner `docker ps` |


---

## Stack

- **Backend**: Node 22, Express 5, TypeScript, Prisma 6, SQLite, `dockerode`, `ws`, `jsonwebtoken`, `bcryptjs`
- **Frontend**: React 19, Vite 8, Tailwind CSS 4, React Router 7, xterm.js, CodeMirror 6
- **Runtime**: Docker Compose v2, nginx, `docker:dind`, `registry:2` pull-through cache

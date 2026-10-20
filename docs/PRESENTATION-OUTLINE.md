# Project presentation outline

A suggested sequence for the CBADL mini-project presentation. Keep it to ~10 slides plus the live demo.

## 1. Problem

- Container labs need Docker, ports, and a clean environment on every student machine.
- Setup differs per laptop; one broken install stalls the whole practical.
- Teachers cannot see who is actually working, what they ran, or where they are stuck.
- Collecting screenshots/outputs at the end is manual and easy to fake.

**One line:** *VLab gives every student a disposable container and gives the teacher one live view of the class.*

## 2. Existing systems and how VLab differs

| System | What it does | Gap VLab fills |
| --- | --- | --- |
| Play with Docker | Temporary Docker playground in the browser | No classes, assignments, per-task checks, or teacher view |
| Killercoda | Guided interactive scenarios | Content-centric; no teacher-created lab + class monitoring workflow |
| Google Cloud Shell | Personal VM with a terminal | Not class-aware; no task verification or roster dashboard |
| Local Docker Desktop | Full Docker on the student laptop | Installation drift; no isolation from the student's own work; no visibility |

VLab's differentiator is the **class workflow**: teacher creates a lab and checks, assigns it to a class, students join by code, and the teacher watches state and progress live.

## 3. Architecture

Use the diagram from `README.md` (mermaid). Explain the three boundaries:

1. Browser: React + xterm.js + CodeMirror; REST polling for dashboards, files, and Docker inventory, WebSocket for the terminal.
2. Backend: Express + `dockerode` + `ws`; owns the Docker socket and all authorization.
3. Runtime: one container per student; DinD gets its own inner daemon; `linux-basic` is unprivileged.

Say explicitly: **students never receive the Docker socket**; the terminal is a `docker exec` into their own container. The file and Docker tabs use the same exec path, with a fixed command/allowlist and read-only rules.

## 4. Data model (ER)

Use the ER diagram from `README.md`. Point out:

- `TaskResult.firstPassedAt` makes completion durable.
- `CommandLog` is advisory telemetry, deduped on `(sessionId, ts, command)`.
- `Session` is unique per `(assignment, student)` and has a lifecycle state.

## 5. Modules

- `auth` — login, teacher/student registration, JWT, role checks.
- `classes` — course · section · batch classes, join codes, rosters, class switching, dashboard aggregation.
- `labs` / `tasks` — the seven handout experiments, lab metadata, and check definitions.
- `assignments` — lab ↔ class plans, due dates, submission instructions.
- `submissions` — evidence uploads, feedback, grades, protected downloads.
- `sessions` — container provisioning, readiness, stop/reset, idle cleanup.
- `checker` — 15s per-check timeout, serialized per session, 30s loop + manual button.
- `terminal` — shared hijacked exec, read-only teacher attach, scrollback.
- `workspace` — `/root` file listing, UTF-8 reads/writes, 256 KiB cap, teacher read-only.
- `docker inventory` — fixed `ps/images/network/volume` commands, capped at 200 rows, no controls.
- `commandlog` — `tail -F` of the shell's log, restart-safe dedupe.
- `jobs` — checker and cleanup schedulers.

## 6. Demo

Follow `README.md` → Teaching demo. The strongest 30 seconds:

- Teacher overview shows CC1/CC3, batches A/B, and evidence to review.
- Host: `docker ps --filter name=vlab-` → only VLab containers.
- Student terminal: `docker ps` → `hello-web`.
- Student **Code** tab: open `/root/sum-service/app.sh`; **Docker** tab shows the containers and images without typing a command.
- Teacher class workspace: the same student's name, task ticks, last command.
- Teacher drawer: read-only terminal, **Files · read-only**, and the same Docker inventory.
- Build Lab 4 from `app.sh` + `Dockerfile`; `curl` returns `42` and all four checks pass.
- Teacher reviews a screenshot and the student sees the grade.

## 7. Security and trade-offs

- DinD is privileged by design; isolation is namespace-level, not a hostile multi-tenant boundary.
- In production: microVM per student or dedicated lab hosts.
- `docker.sock` only in the backend.
- Role and ownership checks on every route and on the WebSocket upgrade.
- Teacher input dropped server-side; teacher file writes return `403`.
- Files are path-normalised to `/root`, passed as positional arguments, UTF-8 only, max 256 KiB.
- Docker inventory commands are fixed; the endpoint is not a proxy for arbitrary Docker API calls.
- Resource limits: 1 GB / 1 CPU / 512 PIDs for DinD.
- Command logging is advisory (`PROMPT_COMMAND` can be unset).

## 8. AWS (stretch, not deployed)

- **EC2**: DinD needs ~1 GB per student; a t3.medium (4 GB) runs one or two students plus overhead. A class needs autoscaling lab hosts.
- **ECR**: backend, frontend, and both lab images.
- **S3**: report assets, result exports, screenshots.
- **Why not deployed publicly**: a single privileged DinD host is not a safe public multi-tenant service; the demo runs locally with resource limits.
- Multi-instance backends would need a shared terminal broker; the MVP is deliberately a single instance.

## 9. Metrics the dashboard exposes

- Per-task pass state and first-pass time.
- Progress % per student.
- Last active and last command.
- Live container count.
- Evidence submitted / reviewed per class.
- Reset count (visible in the student drawer).

## 10. Limitations and next steps

- Single backend instance; SQLite for demo reliability; PostgreSQL switch documented.
- Evidence is stored on a local volume; no gradebook export, password reset, or email verification yet.
- Terminal token in query params (needs TLS in production).
- The editor is text-only (256 KiB, no binaries/deletion/multi-file tabs); the Docker tab is inventory, not Docker Desktop.
- Lab 6 teaches scaling with CLI replicas and documents the equivalent Compose scale command; Compose is not required.
- Next: microVM runtime, per-task hints, CSV export, LTI integration, autoscaling lab hosts.

## Demo checklist (before presenting)

- [ ] `docker compose up --build -d` succeeds
- [ ] `powershell -File scripts/preflight.ps1` is green
- [ ] Teacher overview loads with four section/batch classes
- [ ] Two student tabs start labs and show terminals
- [ ] Four Lab 1 checks pass
- [ ] Code tab opens a file and Docker tab lists `hello-web` / `nginx:alpine`
- [ ] Lab 4 builds from `app.sh` + `Dockerfile` and all four checks pass
- [ ] Teacher drawer shows the read-only terminal, read-only files, and Docker inventory
- [ ] Evidence upload and teacher review work end to end
- [ ] `docker compose exec backend npm run smoke` prints `SMOKE OK`
- [ ] Screenshots captured into `docs/screenshots/`

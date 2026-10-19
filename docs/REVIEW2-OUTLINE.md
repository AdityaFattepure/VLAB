# Review 2 deck outline

A suggested slide sequence for the CBADL mini-project review. Keep it to ~10 slides plus the live demo.

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

1. Browser: React + xterm.js; REST polling for dashboards, WebSocket for the terminal.
2. Backend: Express + `dockerode` + `ws`; owns the Docker socket and all authorization.
3. Runtime: one container per student; DinD gets its own inner daemon; `linux-basic` is unprivileged.

Say explicitly: **students never receive the Docker socket**; the terminal is a `docker exec` into their own container.

## 4. Data model (ER)

Use the ER diagram from `README.md`. Point out:

- `TaskResult.firstPassedAt` makes completion durable.
- `CommandLog` is advisory telemetry, deduped on `(sessionId, ts, command)`.
- `Session` is unique per `(assignment, student)` and has a lifecycle state.

## 5. Modules

- `auth` — login, student self-registration, JWT, role checks.
- `classes` — class creation, join codes, roster, dashboard aggregation.
- `labs` / `tasks` — lab templates and check definitions.
- `assignments` — lab ↔ class, due dates.
- `sessions` — container provisioning, readiness, stop/reset, idle cleanup.
- `checker` — 15s per-check timeout, serialized per session, 30s loop + manual button.
- `terminal` — shared hijacked exec, read-only teacher attach, scrollback.
- `commandlog` — `tail -F` of the shell's log, restart-safe dedupe.
- `jobs` — checker and cleanup schedulers.

## 6. Demo

Follow `README.md` → Demo script. The strongest 30 seconds:

- Host: `docker ps --filter name=vlab-` → only VLab containers.
- Student terminal: `docker ps` → `web`, etc.
- Teacher dashboard: the same student's name, task ticks, last command.
- Teacher drawer: read-only live terminal.

## 7. Security and trade-offs

- DinD is privileged by design; isolation is namespace-level, not a hostile multi-tenant boundary.
- In production: microVM per student or dedicated lab hosts.
- `docker.sock` only in the backend.
- Role and ownership checks on every route and on the WebSocket upgrade.
- Teacher input dropped server-side.
- Resource limits: 1 GB / 1 CPU / 512 PIDs for DinD.
- Command logging is advisory (`PROMPT_COMMAND` can be unset).

## 8. AWS (stretch, not deployed)

- **EC2**: DinD needs ~1 GB per student; a t3.medium (4 GB) runs one or two students plus overhead. A class needs autoscaling lab hosts.
- **ECR**: backend, frontend, and both lab images.
- **S3**: report assets, result exports, screenshots.
- **Why not deployed for review 2**: a single privileged DinD host is not a safe public multi-tenant service; the demo runs locally with resource limits.
- Multi-instance backends would need a shared terminal broker; the MVP is deliberately a single instance.

## 9. Metrics the dashboard exposes

- Per-task pass state and first-pass time.
- Progress % per student.
- Last active and last command.
- Live container count.
- Reset count (visible in the student drawer).

## 10. Limitations and next steps

- Single backend instance; SQLite for demo reliability; PostgreSQL switch documented.
- No file upload, grading export, password reset, or email verification.
- Terminal token in query params (needs TLS in production).
- Next: microVM runtime, per-task hints, export to CSV, LTI integration, autoscaling lab hosts.

## Demo checklist (before the review)

- [ ] `docker compose up --build -d` succeeds
- [ ] `powershell -File scripts/preflight.ps1` is green
- [ ] Teacher dashboard loads with 5 seeded students
- [ ] Two student tabs start labs and show terminals
- [ ] Three task checks pass
- [ ] Teacher drawer shows the read-only terminal
- [ ] `docker compose exec backend npm run smoke` prints `SMOKE OK`
- [ ] Screenshots captured into `docs/screenshots/`

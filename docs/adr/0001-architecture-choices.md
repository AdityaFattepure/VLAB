# ADR 0001 — Per-student privileged DinD, SQLite, and a single backend

Date: 2026-10-19
Status: Accepted

## Context

VLab must let students run real `docker` commands in a browser, while a teacher
monitors a whole class. Demo reliability and a strong live demonstration
outweigh production hardening.

The subject is Container Based Application Development Lab, so the lab runtime
must be Docker itself, not a simulated shell.

## Decisions

### 1. One privileged DinD container per student

Each Docker lab session creates a `docker:dind` container with its own inner
daemon, started with `--registry-mirror` and `DOCKER_TLS_CERTDIR=""`. The
backend, not the student, holds `/var/run/docker.sock`.

**Why:** students need `docker run/build/volume`, and a private daemon gives
them a clean namespace per session.

**Cost:** privileged mode is close to host root. This is acceptable for a
local, supervised classroom demo, not for public multi-tenancy. The production
path is a microVM or dedicated lab host per student.

### 2. The student shell is `docker exec`, not the container's main process

The container's main process is the inner `dockerd` (or `sleep infinity` for
`linux-basic`). The terminal opens an interactive `bash --rcfile` via a
hijacked exec stream, shared by all attached clients.

**Why:** the daemon must outlive any shell, and exec is also the mechanism used
by checks and command logging. One code path, one authorization model.

### 3. SQLite + Prisma instead of PostgreSQL

The database is a single file on a named Docker volume, seeded idempotently.

**Why:** no extra service to boot, fewer demo failure modes, and Prisma makes
the PostgreSQL switch a datasource change (documented in the README).

**Cost:** concurrent writes and scale. A classroom demo is well within SQLite's
comfort zone.

### 4. Polling for dashboards, WebSocket only for the terminal

Teacher and student views poll REST endpoints every 3–5 seconds. The terminal
uses one WebSocket per attached client.

**Why:** the dashboard is small, polling is trivial to reason about, and a
failed poll does not break the terminal. WebSockets are reserved for the
low-latency, long-lived stream.

### 5. `sessionStorage` for the JWT

**Why:** per-tab sessions let the demo run a teacher and several students in
one browser. A production build would use httpOnly cookies + CSRF protection.

### 6. Checks inspect state, not command text

Each task stores a shell command, an expected exit code, and optional expected
stdout. A task that passes once keeps `firstPassedAt` even if the student later
removes the container.

**Why:** multiple correct solutions should pass, and completion must not flicker
when a student cleans up. The command log is explicitly advisory.

### 7. One backend instance

Terminal exec streams and per-session check serialization live in memory.

**Why:** simplest correct implementation for a single-class demo. A multi-
instance deployment would need a shared terminal broker and a queue; that is
out of scope and documented as future work.

## Consequences

- The stack is easy to run (`docker compose up --build`) and demo.
- The security boundary is the backend + per-session container, not a hardened
  multi-tenant sandbox.
- Capacity is bounded by memory: 1 GB per DinD student.
- The code stays small enough to explain in a viva.

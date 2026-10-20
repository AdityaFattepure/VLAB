# ADR 0003 — Browser file workspace and read-only Docker inventory

Date: 2026-10-20
Status: Accepted

## Context

The first version of the live lab was terminal-only. That is enough for Lab 1
and Lab 3, but several handout tasks ask students to create source files, and
students who are used to an editor or Docker Desktop had to translate the
exercise into shell commands before they could learn the container concept.
Teachers could watch a read-only terminal but could not inspect the files or
Docker objects a student had produced.

The new workspace must work for both roles without exposing the host Docker
socket and without making the demo depend on a graphical Docker Desktop.

## Decisions

### 1. Files are container-scoped to `/root`

The file API accepts a path, normalises it with `path.posix.normalize`, and
rejects anything that is not exactly `/root` or below `/root/`. NUL bytes,
backslashes, and paths longer than 512 characters are rejected before a
command runs. The final path is passed to a fixed `sh -c` script as a positional
argument, never interpolated into the script text.

**Why:** the workspace is a convenience over the student's shell, not a new
host boundary. The container is already the sandbox; the important part is that
a filename cannot turn into a shell command and that the editor cannot browse
the rest of the container by accident.

**Cost:** symlinks inside `/root` are followed by `cat`/`printf`, just as they
would be in the shell. That is acceptable because the student already has root
inside their own disposable container. The host socket remains outside the
container.

### 2. Students write; teachers read

`PUT /api/sessions/:id/files/content` is student-only. A teacher can list and
read a student's files but receives `403` on a write. `GET /sessions/:id/docker`
is read-only for both roles.

**Why:** a teacher reviewing work should not be able to change the evidence
while a student is still working, and a read-only inventory is enough to explain
what the student built. The terminal remains the place to make changes.

### 3. Files are bounded UTF-8 text

Reads use `stat`/`wc` before `cat`, reject files over 256 KiB with `413`, and
reject NUL-containing files with `415`. Writes are limited to 256 KiB and reject
NUL bytes before the container command runs.

**Why:** the editor is not a binary file manager, and loading an arbitrarily
large file into a JSON response would make the browser and backend fragile.
The limit is generous for Dockerfiles, shell scripts, HTML, and small service
sources.

### 4. Docker inventory uses four fixed read-only commands

The backend runs:

```text
docker ps -a --no-trunc --format '{{json .}}'
docker images --no-trunc --format '{{json .}}'
docker network ls --no-trunc --format '{{json .}}'
docker volume ls --format '{{json .}}'
```

No request value reaches Docker. Each list is capped at 200 rows. A failed inner
daemon returns `502` and the panel offers a retry.

**Why:** the Docker tab is an observation tool, not a control panel. Keeping the
command list fixed prevents the endpoint from becoming a second, unaudited
Docker API and keeps the code simple enough to test.

### 5. Lab 4 is a real Dockerfile build on the cached nginx image

Students create `app.sh` and `Dockerfile` in the Code tab. The Dockerfile uses
`FROM nginx:alpine`, copies the script, makes it executable, and sets it as
`CMD`. The script computes `A+B` at runtime and starts nginx.

**Why:** this exercises the actual learning outcome — source files, `COPY`,
`RUN`, `CMD`, image build, environment variables, port publishing, and logs —
without adding a new registry dependency. `nginx:alpine` is already warmed by
the lab image and the pull-through cache.

### 6. Docker Compose is documented, not required

Lab 6 keeps its Docker CLI replica commands. Its description explains the
equivalent `docker compose up -d --scale` command, but the checks do not require
the Compose plugin.

**Why:** the `docker:dind` image does include Compose in the current version,
but making it a hard dependency would turn a scaling lesson into a plugin
troubleshooting lesson and would add a new failure mode to the demo. The CLI
replica loop teaches the same scheduler/scale concept.

## Consequences

- The session workspace is now **Terminal / Code / Docker** for students and
  **Terminal / Files / Docker** for teachers.
- Saves update `lastActivityAt` and append `[editor] saved <path>` to the
  command log, so the teacher's activity feed shows that a file changed.
- The Code tab is lazy-loaded, so the CodeMirror bundle is not part of the
  initial login or dashboard load.
- Binary editing, file deletion, multi-file tabs, and teacher writes remain out
  of scope. The terminal is still the escape hatch for those operations.
- If the inner daemon is unavailable, the Docker tab shows an error and a retry
  button; it does not attempt to restart the session.

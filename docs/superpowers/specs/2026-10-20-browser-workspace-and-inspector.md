# Browser Workspace and Docker Inspector

## Problem

The seven CBAD handout labs currently run in a browser terminal only. That is
enough to type commands, but it is a poor fit for the three labs that ask a
student to create or edit source files, and it hides the Docker objects the
student is meant to reason about. Students who are used to an editor and
Docker Desktop have to translate the exercise into terminal commands before
they can learn the actual concept.

The teacher view also stops at a read-only terminal. A teacher reviewing a
student's work cannot inspect the files the student created or the Docker
objects the student built without asking the student to paste output.

## Goal

Give every live VLab session two additional browser tools:

1. A file workspace that lists, opens, creates, and saves text files inside
   `/root` of the student's lab container.
2. A read-only Docker inventory that shows the containers, images, networks,
   and volumes created inside the student's inner Docker daemon.

Students can edit; teachers can inspect the same workspace read-only. The
existing terminal remains the primary tool and the task checker remains the
source of truth.

## Scope

### In scope

- File listing, reading, creating, and overwriting text files under `/root`.
- A CodeMirror editor with syntax highlighting, line numbers, a file list,
  breadcrumb, unsaved-change handling, and `Ctrl/Cmd+S` save.
- A read-only Docker inventory panel for containers, images, networks, and
  volumes, refreshed on demand and every five seconds while open.
- Student and teacher access to both tools from the session workspace.
- Teacher access is read-only for files; Docker inventory is read-only for
  everyone because the terminal is the place to make changes.
- A real Dockerfile-based Lab 4 build that uses the editor to create
  `app.sh` and `Dockerfile`, then builds, runs, and verifies the service.
- Links in Lab 2, Lab 4, Lab 7, and the Lab 6 scaling note that explain when
  to use the Code tab.
- Unit tests for path validation, listing parsing, JSON-line parsing, and
  the editor language mapping.
- Smoke coverage for saving/reading a file and reading Docker inventory
  against a real DinD session.
- Updated README, testing guide, screenshots, and an ADR for the access and
  safety model.

### Out of scope

- Docker Desktop's GUI. The Docker tab is an inventory, not a control panel.
- Writing or deleting files as a teacher.
- Editing binary files, files outside `/root`, or files larger than 256 KiB.
- A full IDE (multi-tab editing, refactoring, terminal integration beyond the
  existing terminal).
- Adding the Docker Compose plugin as a hard lab dependency. Lab 6 keeps its
  CLI replica checks and documents the equivalent Compose command.
- Exposing the host Docker socket to the student container.

## Users and flows

### Student: file-based lab

1. Student opens a live lab and selects the **Code** tab.
2. The panel lists `/root`.
3. Student opens `hello-world`, selects **New file**, enters
   `hello-world/index.html`, and saves the page.
4. Student switches to **Terminal**, builds the image, and runs the container.
5. The existing checker validates the result.
6. Student can return to **Code** to correct the file without leaving the
   browser.

### Teacher: review

1. Teacher opens a student from the class dashboard.
2. Teacher selects **Files** to inspect the student's source files.
3. Teacher selects **Docker** to see the containers and images the student
   created.
4. Teacher can still watch the read-only terminal and command history.
5. Teacher cannot modify the student's files from this view.

## Interface contract

### `GET /api/sessions/:id/files?path=/root`

Lists one directory.

Response `200`:

```json
{
  "path": "/root",
  "entries": [
    { "name": "hello-world", "path": "/root/hello-world", "type": "directory", "size": 4096 },
    { "name": "notes.txt", "path": "/root/notes.txt", "type": "file", "size": 128 }
  ]
}
```

- `path` defaults to `/root` and must resolve inside `/root`.
- Entries are sorted directories first, then files, case-insensitively.
- A missing directory is `404`; a non-directory path is `400`.

### `GET /api/sessions/:id/files/content?path=/root/hello-world/index.html`

Response `200`:

```json
{
  "path": "/root/hello-world/index.html",
  "content": "<h1>Hello World!</h1>\n",
  "size": 24,
  "binary": false
}
```

- Missing file: `404`.
- File over 256 KiB: `413`.
- Binary content: `415`.
- The response never includes the content of a file outside `/root`.

### `PUT /api/sessions/:id/files/content`

Request:

```json
{ "path": "/root/hello-world/index.html", "content": "<h1>Hello World!</h1>\n" }
```

Response `200`:

```json
{ "path": "/root/hello-world/index.html", "size": 24, "savedAt": "2026-10-20T12:00:00.000Z" }
```

- Students only. A teacher receives `403`.
- Parent directories are created.
- Path must resolve inside `/root`; `/root` itself cannot be written.
- Content must be a string, at most 256 KiB, and must not contain NUL bytes.
- A successful save updates `lastActivityAt` and appends a
  `[editor] saved <path>` entry to the command log for teacher visibility.

### `GET /api/sessions/:id/docker`

Response `200`:

```json
{
  "capturedAt": "2026-10-20T12:00:00.000Z",
  "containers": [
    {
      "id": "…",
      "name": "sum-service",
      "image": "sum-service:v1",
      "state": "running",
      "status": "Up 2 minutes",
      "ports": "0.0.0.0:5000->80/tcp",
      "createdAt": "…",
      "runningFor": "2 minutes ago",
      "command": "…"
    }
  ],
  "images": [
    { "id": "…", "repository": "sum-service", "tag": "v1", "size": "48MB", "createdSince": "2 minutes ago" }
  ],
  "networks": [{ "id": "…", "name": "sum-net", "driver": "bridge", "scope": "local" }],
  "volumes": [{ "name": "data", "driver": "local", "mountpoint": "/var/lib/docker/volumes/data/_data" }]
}
```

- Every inventory list is capped at 200 rows.
- Docker object names are displayed as plain text, never HTML.
- If the inner daemon is unavailable, the endpoint returns `502` with a
  generic message; the UI offers a retry.

### Shared error rules

- `401` missing/invalid token.
- `403` session not owned by the student or not in the teacher's class.
- `404` session or file missing.
- `409` lab is not running.
- `413` file too large.
- `415` binary file.
- All errors use the existing `{ "error": "message" }` shape.

## Security model

- The existing `loadSessionForUser` check is mandatory before both file and
  Docker endpoints. It prevents a student from reading another student's
  session and a teacher from reading another teacher's class.
- The file root is an allowlist: the normalised absolute path must be exactly
  `/root` or start with `/root/`. `..`, backslashes, NUL bytes, and relative
  paths that escape the root are rejected before any command runs.
- Paths are passed as separate arguments to `sh -c` positional parameters,
  never interpolated into the script. A student cannot inject commands
  through a filename.
- Writes are limited to 256 KiB, reject NUL bytes, and cannot target `/root`.
- Reads use `stat` before `cat` so a large file is rejected without being
  loaded into the backend.
- The Docker inventory only runs fixed, read-only `docker ... ls/ps` commands.
  No user string is passed to Docker.
- File content and Docker output are treated as untrusted display data. React
  text rendering and CodeMirror keep them out of `dangerouslySetInnerHTML`.
- The host Docker socket remains inaccessible to the student container.

## UX decisions

- The session workspace becomes a three-tab surface: **Terminal**, **Code**,
  **Docker**. Terminal stays the default.
- The Code tab uses a two-pane layout: a directory/file rail and a CodeMirror
  editor. It collapses to a stacked layout on narrow screens.
- A save action is explicit; the panel shows `Saved`, `Unsaved changes`, or an
  error. Switching files or reloading with unsaved changes prompts for
  confirmation.
- New files are created by entering a path relative to the current directory
  (or an absolute path under `/root`), then saving.
- The Docker tab uses labelled tables with counts, status chips, and empty
  states. It never offers start/stop/delete actions.
- Teacher views label the Code tab as read-only.

## Lab changes

### Lab 4: real source-code build

Replace the one-line `nginx:alpine` run with a Dockerfile build:

- `app.sh` computes `A+B`, writes the result to the nginx document root, and
  starts nginx.
- `Dockerfile` uses `FROM nginx:alpine`, copies `app.sh`, makes it executable,
  and sets it as `CMD`.
- Tasks: create the two files, build `sum-service:v1`, run on port 5000 and
  save the response, save logs and inspect output.
- Uses the already-cached `nginx:alpine` image, so the demo does not depend on
  a new registry pull.

### Instructions

- Lab 2 file tasks mention the Code tab as an alternative to heredocs.
- Lab 7's notes task mentions the Code tab.
- Lab 6 explains that its replica loop is the CLI equivalent of
  `docker compose up -d --scale`, without adding a Compose dependency.

## Success criteria

1. A student can create `/root/hello-world/index.html` in the Code tab, save
   it, open it again, and see the exact content.
2. A student can build and run the upgraded Lab 4 from files created entirely
   in the browser editor, and all four checks pass.
3. A teacher can open the same lab, see the files read-only, and see the
   running `sum-service` container and `sum-service:v1` image in the Docker
   tab.
4. Path traversal, absolute paths outside `/root`, NUL bytes, binary files,
   oversized files, and teacher writes are rejected.
5. `npm test`, backend typecheck, frontend build, and the real-container smoke
   test pass.
6. The screenshots show the Code and Docker tabs with real session data.

## Dependencies

- CodeMirror 6 through `@uiw/react-codemirror`.
- Language packs for HTML, JavaScript/TypeScript, Python, YAML, shell, and
  Dockerfile (legacy stream mode).
- No database migration: files live in the lab container and the existing
  command log records saves.

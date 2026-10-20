# Browser Workspace and Docker Inspector Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a browser file editor and a read-only Docker inventory to every live VLab session, and upgrade Lab 4 to a real Dockerfile-based build that uses the editor.

**Architecture:** Extend the existing session routes with three file endpoints and one Docker-inventory endpoint. All commands run inside the student's existing lab container through the existing `execInContainer` helper; no new database tables and no host-socket exposure. On the frontend, add a CodeMirror editor and a Docker table panel, then expose both through a three-tab workspace shared by students and teachers.

**Tech Stack:** Node 22 + Express 5 + TypeScript, Prisma 6 / SQLite, React 19 + Vite + Tailwind 4, CodeMirror 6, Dockerode, Vitest, real DinD smoke test.

**Spec:** `docs/superpowers/specs/2026-10-20-browser-workspace-and-inspector.md`

## Global Constraints

- File access is rooted at `/root`; never accept a path that resolves outside it.
- Maximum editable file size is 256 KiB (`262144` bytes).
- Students can write; teachers can only read files and Docker inventory.
- Docker commands are fixed read-only commands; no user strings are passed to them.
- Keep the existing `{ "error": "message" }` API error shape.
- Keep the terminal as the default workspace tab.
- No new database migration.
- Preserve existing demo accounts, classes, assignments, and seeded labs.
- Every commit must pass `npm test` (backend) and `npm run typecheck` (backend).

---

## File structure

**Backend**

- Create `backend/src/lib/workspace.logic.ts` — pure path and output parsing.
- Create `backend/src/lib/workspace.logic.test.ts` — unit tests.
- Create `backend/src/services/workspace.service.ts` — container file and Docker inventory operations.
- Modify `backend/src/routes/sessions.routes.ts` — four new endpoints and readiness guard.
- Modify `backend/src/lib/errors.ts` — add `conflict` and `payloadTooLarge` helpers if useful.
- Modify `backend/src/app.ts` only if the 12 MB JSON body limit needs documenting; no change expected.
- Modify `backend/scripts/smoke.ts` — real file write/read and Docker inventory checks.
- Modify `backend/prisma/labs.ts` — Lab 4 source build and Lab 2/6/7 notes.

**Frontend**

- Modify `frontend/package.json` and `frontend/package-lock.json` — CodeMirror packages.
- Create `frontend/src/components/CodeEditor.tsx` — CodeMirror wrapper and language mapping.
- Create `frontend/src/components/WorkspaceFiles.tsx` — file rail, breadcrumb, create/save.
- Create `frontend/src/components/DockerInspector.tsx` — read-only Docker inventory.
- Modify `frontend/src/api/types.ts` — workspace and inventory response types.
- Modify `frontend/src/pages/SessionView.tsx` — Terminal / Code / Docker tabs.
- Modify `frontend/src/components/StudentDrawer.tsx` — teacher Terminal / Files / Docker tabs.
- Modify `frontend/src/index.css` — small editor/table overrides.

**Docs and verification**

- Create `docs/adr/0003-browser-workspace-access.md`.
- Modify `README.md`, `docs/TESTING-GUIDE.md`, `docs/PRESENTATION-OUTLINE.md`.
- Modify `scripts/capture-screenshots.mjs` and add two screenshots.
- Modify `docs/superpowers/specs/2026-10-20-browser-workspace-and-inspector.md` only if implementation reveals a spec error.

---

## Task 1: Workspace path and parsing logic

**Files:**
- Create: `backend/src/lib/workspace.logic.ts`
- Test: `backend/src/lib/workspace.logic.test.ts`

**Interfaces:**
- Produces:
  - `WORKSPACE_ROOT: string` = `"/root"`
  - `MAX_EDITOR_FILE_BYTES: number` = `262144`
  - `WorkspaceFileEntry { name: string; path: string; type: "file" | "directory"; size: number }`
  - `normaliseWorkspacePath(raw: string | null | undefined, fallback?: string): string`
  - `workspaceParent(path: string): string`
  - `parseFileStatLines(stdout: string): WorkspaceFileEntry[]`
  - `parseJsonLines<T = Record<string, unknown>>(stdout: string): T[]`
  - `isBinaryText(content: string): boolean`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from 'vitest';
import {
  isBinaryText,
  normaliseWorkspacePath,
  parseFileStatLines,
  parseJsonLines,
  workspaceParent,
} from './workspace.logic.js';

describe('workspace.logic', () => {
  it('normalises relative and absolute paths under /root', () => {
    expect(normaliseWorkspacePath('hello-world/index.html')).toBe('/root/hello-world/index.html');
    expect(normaliseWorkspacePath('/root/./a//b.txt')).toBe('/root/a/b.txt');
    expect(normaliseWorkspacePath('')).toBe('/root');
  });

  it('rejects paths outside /root, traversal, backslashes, and NUL bytes', () => {
    expect(() => normaliseWorkspacePath('/etc/passwd')).toThrow();
    expect(() => normaliseWorkspacePath('/root/../etc/passwd')).toThrow();
    expect(() => normaliseWorkspacePath('..\\secret')).toThrow();
    expect(() => normaliseWorkspacePath('/root/a\0b')).toThrow();
  });

  it('finds parents without escaping the root', () => {
    expect(workspaceParent('/root/a/b.txt')).toBe('/root/a');
    expect(workspaceParent('/root/a')).toBe('/root');
    expect(workspaceParent('/root')).toBe('/root');
  });

  it('parses stat lines into sorted entries', () => {
    const entries = parseFileStatLines(
      'regular file\t24\t/root/z.txt\n' +
        'directory\t4096\t/root/hello-world\n' +
        'regular file\t12\t/root/a.txt\n',
    );
    expect(entries.map((entry) => entry.name)).toEqual(['hello-world', 'a.txt', 'z.txt']);
    expect(entries[0]).toMatchObject({ path: '/root/hello-world', type: 'directory' });
    expect(entries[1]).toMatchObject({ path: '/root/a.txt', size: 12, type: 'file' });
  });

  it('ignores malformed and out-of-root stat lines', () => {
    expect(
      parseFileStatLines('garbage\nregular file\t1\t/etc/passwd\ndirectory\t1\t/root/ok\n'),
    ).toHaveLength(1);
  });

  it('parses newline-delimited JSON and skips blank lines', () => {
    expect(parseJsonLines<{ Names: string }>('{"Names":"a"}\n\n{"Names":"b"}\n')).toEqual([
      { Names: 'a' },
      { Names: 'b' },
    ]);
  });

  it('detects NUL bytes as binary', () => {
    expect(isBinaryText('hello')).toBe(false);
    expect(isBinaryText('hello\u0000world')).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- workspace.logic.test.ts` in `backend/`
Expected: FAIL because `workspace.logic.ts` does not exist.

- [ ] **Step 3: Implement `workspace.logic.ts`**

Use `path.posix.normalize`. A path is valid only when it equals `/root` or starts with `/root/`; reject NUL, backslashes, and paths longer than 512 characters. Parsing functions must never throw for a malformed stat line; they drop it. `parseFileStatLines` treats `directory` as `directory` and every other stat type as `file`. Sort directories first, then files, both by lowercased name.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- workspace.logic.test.ts` in `backend/`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/lib/workspace.logic.ts backend/src/lib/workspace.logic.test.ts
git commit -m "feat: add workspace path and parsing logic"
```

---

## Task 2: Workspace file and Docker inventory service

**Files:**
- Create: `backend/src/services/workspace.service.ts`
- Modify: `backend/src/lib/errors.ts` (add `conflict`, `payloadTooLarge`, `unsupportedMediaType` if needed)

**Interfaces:**
- Consumes: `execInContainer(containerId, cmd, options)` from `docker/docker.client.ts`.
- Produces:
  - `DockerInventory` with `capturedAt`, `containers`, `images`, `networks`, `volumes`
  - `listWorkspaceFiles(containerId: string, dir: string): Promise<{ path: string; entries: WorkspaceFileEntry[] }>`
  - `readWorkspaceFile(containerId: string, filePath: string): Promise<{ path: string; content: string; size: number; binary: boolean }>`
  - `writeWorkspaceFile(containerId: string, filePath: string, content: string): Promise<{ path: string; size: number; savedAt: string }>`
  - `readDockerInventory(containerId: string): Promise<DockerInventory>`

- [ ] **Step 1: Implement the service with fixed shell scripts**

`listWorkspaceFiles` runs:

```sh
set -eu
[ -d "$1" ] || { echo "Not a directory" >&2; exit 1; }
find "$1" -mindepth 1 -maxdepth 1 -exec stat -c '%F\t%s\t%n' {} \;
```

`readWorkspaceFile` runs:

```sh
set -eu
[ -f "$1" ] || { echo "File not found" >&2; exit 1; }
[ "$(wc -c < "$1")" -le 262144 ] || { echo "File is too large" >&2; exit 2; }
cat "$1"
```

`writeWorkspaceFile` runs:

```sh
set -eu
[ "$1" != "/root" ] || { echo "Cannot write the workspace root" >&2; exit 1; }
mkdir -p "$(dirname "$1")"
printf '%s' "$2" > "$1"
```

Every script receives values as positional arguments via
`execInContainer(id, ['sh', '-c', script, 'vlab', ...args], { timeoutMs: 8000 })`.
Map exit code 2 from the read script to `413`; map a missing file/directory
message to `404`; everything else to `400` or `409` with the sanitised stderr.
Call `normaliseWorkspacePath` before every command. Reject content over
`MAX_EDITOR_FILE_BYTES`, content containing `\0`, and binary reads.

- [ ] **Step 2: Implement `readDockerInventory`**

Run these fixed commands in parallel, parse each with `parseJsonLines`, and
cap every result at 200 rows:

```sh
docker ps -a --no-trunc --format '{{json .}}'
docker images --no-trunc --format '{{json .}}'
docker network ls --no-trunc --format '{{json .}}'
docker volume ls --format '{{json .}}'
```

Normalize names by stripping a leading `/` from `Names`. Strip a leading
`sha256:` from image IDs only in the UI, not in the payload. If any command
exits non-zero, throw `HttpError(502, 'Could not read Docker objects')` and
log the stderr server-side without object contents.

- [ ] **Step 3: Run backend typecheck**

Run: `npm run typecheck` in `backend/`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add backend/src/services/workspace.service.ts backend/src/lib/errors.ts
git commit -m "feat: add workspace and docker inventory services"
```

---

## Task 3: Session workspace endpoints

**Files:**
- Modify: `backend/src/routes/sessions.routes.ts`
- Test: extend `backend/src/routes/api.integration.test.ts` with authorization/readiness checks.

**Interfaces:**
- Consumes: service functions from Task 2, `loadSessionForUser`.
- Produces:
  - `GET /api/sessions/:id/files?path=...`
  - `GET /api/sessions/:id/files/content?path=...`
  - `PUT /api/sessions/:id/files/content`
  - `GET /api/sessions/:id/docker`

- [ ] **Step 1: Add a readiness guard and routes**

Add a local helper:

```ts
async function loadReadySession(req: Request) {
  const user = currentUser(req);
  const session = await loadSessionForUser(param(req, 'id'), user);
  if (session.status !== 'ready' || !session.containerId) {
    throw new HttpError(409, 'The lab is not running');
  }
  return { user, session };
}
```

Add the four routes before the generic `GET /:id` route or anywhere after it;
Express matches the longer paths exactly. The `PUT` route rejects any role
other than `student` with `403`. The `PUT` body must accept `content` exactly
as sent (do not trim it). After a successful write, update
`lastActivityAt` and insert `[editor] saved <path>` into `commandLog`.

- [ ] **Step 2: Add integration tests for the boundary**

Append to the existing integration suite:

```ts
it('protects session workspace routes from other users', async () => {
  const missing = await request(app)
    .get('/api/sessions/not-a-session/files')
    .set('authorization', `Bearer ${studentToken}`);
  expect(missing.status).toBe(404);

  const noToken = await request(app).get('/api/sessions/not-a-session/files');
  expect(noToken.status).toBe(401);

  const teacherWrite = await request(app)
    .put('/api/sessions/not-a-session/files/content')
    .set('authorization', `Bearer ${teacherToken}`)
    .send({ path: '/root/a.txt', content: 'x' });
  expect(teacherWrite.status).toBe(403);

  const outsiderRead = await request(app)
    .get('/api/sessions/not-a-session/files')
    .set('authorization', `Bearer ${outsiderToken}`);
  expect(outsiderRead.status).toBe(404);
});
```

This deliberately does not create a container; it proves auth and route
wiring. Real file operations are covered by the smoke test.

- [ ] **Step 3: Run tests**

Run: `npm test` in `backend/`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add backend/src/routes/sessions.routes.ts backend/src/routes/api.integration.test.ts
git commit -m "feat: expose session file and docker endpoints"
```

---

## Task 4: Frontend editor dependency and component

**Files:**
- Modify: `frontend/package.json`, `frontend/package-lock.json`
- Create: `frontend/src/components/CodeEditor.tsx`

**Interfaces:**
- Produces:
  - `CodeEditor({ value, path, readOnly, onChange, className }: { value: string; path: string; readOnly: boolean; onChange: (value: string) => void; className?: string })`

- [ ] **Step 1: Install CodeMirror**

Run in `frontend/`:

```bash
npm install @uiw/react-codemirror @codemirror/lang-html @codemirror/lang-javascript @codemirror/lang-python @codemirror/lang-yaml @codemirror/legacy-modes
```

- [ ] **Step 2: Implement `CodeEditor.tsx`**

Use `@uiw/react-codemirror` with line numbers, history, bracket matching, and
a fixed height. Choose an extension from the lowercased path:

- `.html` / `.htm` → `html()`
- `.js`, `.jsx`, `.ts`, `.tsx`, `.json` → `javascript({ jsx, typescript })`
- `.py` → `python()`
- `.yml`, `.yaml` → `yaml()`
- `Dockerfile`, `*.dockerfile` → `StreamLanguage.define(dockerFile)`
- `.sh`, `.bash` → `StreamLanguage.define(shell)`
- everything else → no extension

Set `editable: !readOnly`, `readOnly` from props, `theme="light"`, and a
minimum height of 260px. Use `fontFamily: var(--font-mono)`.

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck` in `frontend/`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/src/components/CodeEditor.tsx
git commit -m "feat: add CodeMirror editor component"
```

---

## Task 5: File workspace component

**Files:**
- Modify: `frontend/src/api/types.ts`
- Create: `frontend/src/components/WorkspaceFiles.tsx`

**Interfaces:**
- Consumes: `CodeEditor`, `useAuth().api`.
- Produces:
  - `WorkspaceFiles({ sessionId, readOnly, className }: { sessionId: string; readOnly?: boolean; className?: string })`
  - Types `WorkspaceFileEntry`, `WorkspaceListing`, `WorkspaceFileContent`.

- [ ] **Step 1: Add response types**

```ts
export interface WorkspaceFileEntry {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size: number;
}

export interface WorkspaceListing {
  path: string;
  entries: WorkspaceFileEntry[];
}

export interface WorkspaceFileContent {
  path: string;
  content: string;
  size: number;
  binary: boolean;
}
```

- [ ] **Step 2: Implement the component**

Behaviour:

- On mount and on `sessionId` change, fetch `/sessions/${sessionId}/files?path=/root`.
- Clicking a directory fetches that directory; clicking a file fetches
  `/sessions/${sessionId}/files/content?path=...`.
- Breadcrumb shows `root / …`; an Up button returns to `workspaceParent`.
- **New file** reveals a path input. Relative paths resolve from the current
  directory. Creating sets an empty editor buffer; **Save** creates the file.
- **Save** sends `PUT /sessions/${sessionId}/files/content`.
- Show `Saved`, `Unsaved changes`, `Read-only`, and error states.
- Register `Ctrl/Cmd+S` on the panel and call Save when not read-only.
- Confirm before opening another file or changing directories when dirty.
- Hide New file and Save for `readOnly`.
- Use `type="button"` on all buttons. Do not use `dangerouslySetInnerHTML`.

Layout: `grid` with a 210px rail on `md+` and stacked panes below; editor fills
the remaining height. Use existing slate/navy palette and `vlab-card`/button
classes.

- [ ] **Step 3: Typecheck and build**

Run: `npm run typecheck` and `npm run build` in `frontend/`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/api/types.ts frontend/src/components/WorkspaceFiles.tsx
git commit -m "feat: add browser file workspace"
```

---

## Task 6: Docker inventory component

**Files:**
- Modify: `frontend/src/api/types.ts`
- Create: `frontend/src/components/DockerInspector.tsx`

**Interfaces:**
- Produces:
  - `DockerInventory` and row types in `api/types.ts`
  - `DockerInspector({ sessionId, className }: { sessionId: string; className?: string })`

- [ ] **Step 1: Add inventory types**

Add `DockerContainerRow`, `DockerImageRow`, `DockerNetworkRow`,
`DockerVolumeRow`, and `DockerInventory` matching the spec payload.

- [ ] **Step 2: Implement the panel**

- Poll `GET /sessions/${sessionId}/docker` every 5000ms with `usePolling`.
- Tabs: Containers, Images, Networks, Volumes, each with a count badge.
- Containers table columns: name, image, state, ports, status. Render state as
  a small colored pill (`running` emerald, `exited` slate, other amber).
- Images: repository:tag, ID (first 12), size, created.
- Networks: name, driver, scope, ID.
- Volumes: name, driver, mountpoint.
- Add a Refresh button and a `Captured …` timestamp.
- Empty state per tab: “No containers yet. Run one from the terminal.”
- Errors show a retry button.
- All values are React text nodes; no HTML injection.

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck` in `frontend/`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/api/types.ts frontend/src/components/DockerInspector.tsx
git commit -m "feat: add read-only docker inventory panel"
```

---

## Task 7: Workspace tabs for student and teacher

**Files:**
- Modify: `frontend/src/pages/SessionView.tsx`
- Modify: `frontend/src/components/StudentDrawer.tsx`
- Modify: `frontend/src/index.css`

**Interfaces:**
- Consumes: `WorkspaceFiles`, `DockerInspector`, existing `TerminalView`.

- [ ] **Step 1: Student session tabs**

Replace the single `TerminalView` block with a `WorkspaceTabs` local component
or inline markup:

- Tab bar: Terminal, Code, Docker; `role="tablist"`, `aria-selected`.
- Default `terminal`.
- Panel height: `h-[calc(100vh-190px)] min-h-[460px]`; inner terminal uses
  `h-full`; Code and Docker panels use `h-full min-h-0`.
- Keep the stopped-session fallback unchanged.
- Code tab: `<WorkspaceFiles sessionId={session.id} />`.
- Docker tab: `<DockerInspector sessionId={session.id} />`.

- [ ] **Step 2: Teacher drawer tabs**

Replace the “Live terminal” section with a tabbed panel:

- Terminal (read-only `TerminalView`), Files (`WorkspaceFiles readOnly`), and
  Docker (`DockerInspector`).
- Default terminal. Only show when `ready`; otherwise keep the existing
  not-ready message.
- Panel height `h-96`.
- Label the Files tab “Files · read-only”.

- [ ] **Step 3: CSS**

Add only what Tailwind cannot express: CodeMirror scrollbar styling and an
`overflow-hidden` helper if needed. Do not add glow or neon effects.

- [ ] **Step 4: Build and typecheck**

Run: `npm run build` in `frontend/`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/SessionView.tsx frontend/src/components/StudentDrawer.tsx frontend/src/index.css
git commit -m "feat: add workspace tabs for students and teachers"
```

---

## Task 8: Lab content upgrade

**Files:**
- Modify: `backend/prisma/labs.ts`

**Interfaces:**
- No API change. `upsertLab` updates tasks by `labId_order`.

- [ ] **Step 1: Replace Lab 4 with the Dockerfile build**

Use these four tasks:

1. **Create `app.sh` and `Dockerfile`** in `/root/sum-service`. Check both
   files exist, `app.sh` contains `A+B`, the Dockerfile starts with
   `FROM nginx:alpine`, and it copies `app.sh`.
   Example `app.sh`:

   ```sh
   #!/bin/sh
   set -eu
   sum=$((A+B))
   printf '%s\n' "$sum" > /usr/share/nginx/html/index.html
   exec nginx -g 'daemon off;'
   ```

   Example `Dockerfile`:

   ```dockerfile
   FROM nginx:alpine
   COPY app.sh /usr/local/bin/app.sh
   RUN chmod +x /usr/local/bin/app.sh
   CMD ["/usr/local/bin/app.sh"]
   ```

2. **Build `sum-service:v1`** with
   `docker build -t sum-service:v1 /root/sum-service`.
3. **Run and verify**: `docker run -d --name sum-service -p 5000:80 -e A=12 -e B=30 sum-service:v1`,
   save `curl -fsS http://localhost:5000` to `/root/sum-result.txt`, and check
   the response and saved file are `42`.
4. **Save logs and inspect**: write logs to `/root/sum-service.log` and
   `docker inspect --format "{{.State.Status}} {{.Config.Image}}" sum-service`
   to `/root/sum-inspect.txt`; check `GET /` and
   `running sum-service:v1`.

- [ ] **Step 2: Update lab instructions**

- Lab 2 task 1/2: add “You can create these files in the Code tab, or use
  the terminal examples below.”
- Lab 6 description: add the CLI-to-Compose mapping sentence.
- Lab 7 task 5: add “You can write this note in the Code tab.”

- [ ] **Step 3: Reseed**

Run: `npm run db:seed` in `backend/`
Expected: seed completes; Lab 4 has four updated tasks.

- [ ] **Step 4: Commit**

```bash
git add backend/prisma/labs.ts
git commit -m "feat: make Lab 4 a real Dockerfile build"
```

---

## Task 9: Real-container smoke coverage

**Files:**
- Modify: `backend/scripts/smoke.ts`

**Interfaces:**
- Consumes: the four API endpoints from Task 3.

- [ ] **Step 1: Add file and inventory checks**

After the terminal commands have run and before stopping the session:

```ts
const saved = await api(`/api/sessions/${session.id}/files/content`, {
  method: 'PUT',
  token: student.token,
  body: { path: '/root/smoke-note.txt', content: 'vlab smoke\n' },
});
check(saved.size === 11, 'editor saves a file in the lab container', String(saved.size));

const read = await api(
  `/api/sessions/${session.id}/files/content?path=/root/smoke-note.txt`,
  { token: student.token },
);
check(read.content === 'vlab smoke\n', 'editor reads the saved file back');

const listing = await api(`/api/sessions/${session.id}/files?path=/root`, {
  token: student.token,
});
check(
  listing.entries.some((entry: any) => entry.path === '/root/smoke-note.txt'),
  'workspace listing includes the saved file',
);

const inventory = await api(`/api/sessions/${session.id}/docker`, {
  token: teacher.token,
});
check(
  inventory.containers.some((row: any) => row.name === 'hello-web'),
  'teacher sees the student container in the Docker inventory',
);
check(
  inventory.images.some((row: any) => row.repository === 'nginx'),
  'Docker inventory lists the nginx image',
);
```

- [ ] **Step 2: Verify compose stack and run smoke**

Run at repo root:

```bash
docker compose up --build -d
docker compose ps
```

Then in `backend/`:

```bash
npm run smoke
```

Expected: `SMOKE OK` with the new checks passing.

- [ ] **Step 3: Commit**

```bash
git add backend/scripts/smoke.ts
git commit -m "test: cover editor and docker inventory in smoke"
```

---

## Task 10: Documentation, ADR, and screenshots

**Files:**
- Create: `docs/adr/0003-browser-workspace-access.md`
- Modify: `README.md`, `docs/TESTING-GUIDE.md`, `docs/PRESENTATION-OUTLINE.md`
- Modify: `scripts/capture-screenshots.mjs`
- Add: `docs/screenshots/student-editor.png`, `docs/screenshots/teacher-docker.png`

- [ ] **Step 1: Write the ADR**

Record: file access is container-scoped to `/root`; teachers read-only;
Docker inventory read-only; no host socket; 256 KiB/UTF-8 limits; fixed
commands; why Compose is not a hard dependency.

- [ ] **Step 2: Update docs**

- README: feature list, student flow (“Code tab”), teacher review flow,
  limitations (no Docker Desktop GUI, no binary editing, Lab 6 Compose note).
- Testing guide: new API endpoints, manual checks, smoke additions.
- Presentation outline: demonstrate editor + Docker tab.

- [ ] **Step 3: Update screenshot capture**

Add a navigation helper that opens a student session, clicks the Code tab,
saves a sample file through the API if needed, captures
`student-editor.png`, then logs in as the teacher, opens the student drawer,
selects Docker, and captures `teacher-docker.png`.

- [ ] **Step 4: Regenerate screenshots**

Run:

```bash
node scripts/capture-screenshots.mjs
```

Expected: all screenshots regenerate and the two new files are present.

- [ ] **Step 5: Commit**

```bash
git add docs README.md scripts/capture-screenshots.mjs
git commit -m "docs: document the browser workspace and inspector"
```

---

## Task 11: Full verification

**Files:** none.

- [ ] **Step 1: Backend tests and typecheck**

```bash
cd backend
npm test
npm run typecheck
```

Expected: all tests pass, no TypeScript errors.

- [ ] **Step 2: Frontend build**

```bash
cd frontend
npm run build
```

Expected: Vite build succeeds.

- [ ] **Step 3: Compose and smoke**

```bash
docker compose up --build -d
cd backend
npm run smoke
```

Expected: `SMOKE OK`.

- [ ] **Step 4: Manual browser verification**

Open `http://localhost:5173`, log in as `student1@vlab.dev / student123`,
open Lab 2 or Lab 4, and verify:

- Code tab lists `/root`.
- Creating and saving a file reports `Saved`.
- Reopening the file shows the exact content.
- Docker tab shows containers/images/networks/volumes.
- Terminal still works.
- Teacher login shows Files read-only and Docker inventory.

- [ ] **Step 5: Push the branch**

```bash
git push -u origin feature/editor-docker-workspace
```

---

## Self-review

**Spec coverage:** API contract (Tasks 2–3), editor UX (Tasks 4–5), Docker
panel (Task 6), student/teacher integration (Task 7), Lab 4 and notes (Task 8),
security tests (Tasks 1, 3, 9), docs/screenshots (Task 10), verification
(Task 11). Out-of-scope items remain out of scope.

**Review focus:**

1. A path such as `/root/../etc/passwd` or a backslash path could escape the
   allowlist — Task 1 tests rejection.
2. A file with a NUL byte or a 300 KiB file could freeze or bloat the editor —
   Task 1 tests binary detection; Task 2 rejects oversize and NUL writes.
3. A teacher could accidentally write to a student's file — Task 3 tests 403.
4. The inner Docker daemon could be down while the session says ready — Task 2
   returns 502 and the panel offers retry; Task 6 handles error state.
5. The editor could be opened for a stopped session — Task 3 returns 409 and
   Task 7 only renders tabs when `status === 'ready'`.

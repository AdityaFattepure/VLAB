# Project instructions

This project uses the Agent Skills pack installed under `.opencode/skills/`.
Shared checklists live in `.opencode/references/`.

## Core rules

- If a task matches a skill, load it with the `skill` tool before acting.
- Follow the loaded skill's workflow end to end; do not partially apply it.
- Do not skip required steps such as a spec, a plan, or tests when a skill
  requires them.
- Check for an existing pattern in the codebase before introducing a new one.
- Never claim work is complete without running the relevant verification and
  showing the result.

## Intent → skill mapping

- Feature / new functionality → `spec-driven-development`, then
  `planning-and-task-breakdown`, `incremental-implementation`,
  `test-driven-development`
- Requirements gathering → `interview-me`, `idea-refine`
- Planning / task breakdown → `planning-and-task-breakdown`
- Bug / failure / unexpected behavior → `debugging-and-error-recovery`
- Code review → `code-review-and-quality`
- Refactoring / simplification → `code-simplification`
- API or interface design → `api-and-interface-design`
- UI work → `frontend-ui-engineering`
- Browser testing → `browser-testing-with-devtools`
- Security-sensitive work → `security-and-hardening`
- Performance work → `performance-optimization`
- Logging / metrics / tracing → `observability-and-instrumentation`
- CI/CD → `ci-cd-and-automation`
- Git workflow → `git-workflow-and-versioning`
- Docs / architecture decisions → `documentation-and-adrs`
- Migrations / removals → `deprecation-and-migration`
- Release → `shipping-and-launch`
- Quality gates → `constraint-driven-development`
- Unfamiliar API or library → `source-driven-development`
- Current library / framework documentation → `context7-mcp`
- Codebase architecture / knowledge-graph questions → `graphify`
- High-stakes or uncertain work → `doubt-driven-development`
- Skill selection itself → `using-agent-skills`

## Tooling

### Context7

The `context7-mcp` skill is backed by the project `context7` MCP server
configured in `opencode.json`. Prefer it over web search when you need current
documentation, API syntax, or version-specific behavior for a library,
framework, SDK, CLI, or cloud service.

### Graphify

The `graphify` skill lives at `.opencode/skills/graphify/`, and its OpenCode
reminder plugin lives at `.opencode/plugins/graphify.js`. No graph exists yet
in this project; run the skill to build `graphify-out/`.

When `graphify-out/graph.json` exists:

- Run `graphify query "<question>"` before the first grep, search, or source
  read for a codebase question. Put the same rule in every subagent prompt
  that explores code.
- Use `graphify path "<A>" "<B>"` for relationships and
  `graphify explain "<concept>"` for focused concepts.
- If `graphify-out/wiki/index.md` exists, use it for broad navigation.
- Read `graphify-out/GRAPH_REPORT.md` only for broad architecture review or
  when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current.

## Project status

**VLab** — a container-based virtual lab. The stack is chosen and the MVP works
end to end. See `README.md` and `docs/adr/0001-architecture-choices.md`.

Stack: Node 22 + Express 5 + TypeScript (run with `tsx`) + Prisma 6 / SQLite,
React 19 + Vite + Tailwind 4, `dockerode` + `ws`, Docker Compose at runtime.

### Commands

Whole stack (preferred): `docker compose up --build` → app on
http://localhost:5173

Backend (`backend/`):

- `npm install`
- `npm run dev` (watch) / `npm start` (port 3000)
- `npm run typecheck`
- `npm run db:push`, `npm run db:seed`, `npm run db:reset-demo`
- `npm run smoke` — end-to-end test against `BASE_URL` (default
  `http://localhost:3000`)
- `npm run spike` — low-level Docker / DinD / exec check

Frontend (`frontend/`):

- `npm install`
- `npm run dev` (port 5173, proxies `/api` and `/ws` to 3000)
- `npm run build` (`tsc --noEmit` then `vite build`)

Helper scripts (repo root):

- `powershell -File scripts/preflight.ps1` — demo-day checks
- `powershell -File scripts/reset-demo.ps1` — clean demo state
- `node scripts/capture-screenshots.mjs` — regenerate `docs/screenshots/`

Local backend runs on Windows need
`DOCKER_SOCKET=npipe:////./pipe/dockerDesktopLinuxEngine` in `backend/.env`;
inside compose it is `/var/run/docker.sock`.

### Layout

- `backend/src/routes` — auth, classes, labs, tasks, assignments, sessions
- `backend/src/services` — docker, session, checker, command log, dashboard
- `backend/src/ws` — terminal WebSocket and the shared exec attach manager
- `backend/src/jobs` — 30s checker and idle cleanup schedulers
- `backend/prisma` — `schema.prisma`, `seed.ts`, `reset-demo.ts`
- `frontend/src/{pages,components,hooks,lib,auth,api}`
- `lab-images/{docker-dind,linux-basic}` — the lab container images
- `docs/` — ADRs, presentation outline, testing guide, captured screenshots

### Tests

Vitest is installed (`npm test`). Unit tests live next to the module they cover
(`backend/src/**/*.test.ts`); `checker.logic.test.ts` covers the check verdict
rules. Current verification is `npm test` + `npm run typecheck` plus the smoke
test, which covers login, provisioning a real DinD container, the terminal over
WebSocket, command logging, the checker, the dashboard, and cleanup. Add unit
tests alongside new logic.

### Generated files — do not edit

- `frontend/dist/`, `backend/node_modules/`, `backend/prisma/dev.db`
- `graphify-out/` when the graph is built


## Working agreements

- Prefer small, verifiable increments; each increment must pass its own tests.
- Definition of done for every change: tests pass, no regressions, behavior
  verified at runtime, docs updated. See
  `.opencode/references/definition-of-done.md`.
- Keep secrets out of the repo and out of logs.
- Record non-obvious architecture decisions as ADRs (see
  `documentation-and-adrs`).

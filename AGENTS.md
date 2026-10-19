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

This is a greenfield project. The stack, build commands, test commands, and
directory layout are not chosen yet.

When the stack is chosen, update this file with:

- install / dev / build / test / lint / typecheck commands
- the source layout and where new code belongs
- the test framework and where tests live
- any generated files that must not be edited

Until then, do not assume a language, framework, or package manager. Ask before
scaffolding.

## Working agreements

- Prefer small, verifiable increments; each increment must pass its own tests.
- Definition of done for every change: tests pass, no regressions, behavior
  verified at runtime, docs updated. See
  `.opencode/references/definition-of-done.md`.
- Keep secrets out of the repo and out of logs.
- Record non-obvious architecture decisions as ADRs (see
  `documentation-and-adrs`).

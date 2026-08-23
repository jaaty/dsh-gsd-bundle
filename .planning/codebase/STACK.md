# Technology Stack

**Analysis Date:** 2026-08-23

## Languages

**Primary:**
- JavaScript (ESM) — all runtime code in `lib/*.js` (15 modules, 2,701 lines). No TypeScript. No build/transpile step; source is executed directly. Shared pure helpers live in `lib/_shared.js` (frontmatter/roadmap/requirements parse+stringify, `slugify`, `zeroPad`, plan-name/gap-closure/closed-phase predicates).

**Secondary:**
- YAML — `cordis.patch.yml` (host-plane patch manifest describing plugin rows and the `agent-loop` override)
- Markdown — planning artefacts and documentation (`.planning/`, `README.md`)
- JSON — `package.json` manifest; `.planning/config.json` written at runtime by `gsd_init`

## Runtime

**Environment:**
- Node.js v24.15.0 (verified in development environment). The bundle requires a modern Node for ESM + `node:fs/promises` dynamic imports + the built-in `node:test` runner used by the test suite.
- The bundle is **not standalone** — it runs inside the DeepSeek Harness (DSH) host Node process as a Cordis plugin set. It is not an executable/CLI.

**Package Manager:**
- npm (implied by `package.json`; no lockfile committed)
- Lockfile: missing — none of `package-lock.json` / `pnpm-lock.yaml` / `yarn.lock` present

## Frameworks

**Core:**
- DeepSeek Harness (DSH) host — the Cordis-based runtime the bundle plugs into. The bundle is loaded as a DSH bundle via the `dsh` field in `package.json`:
  ```json
  "dsh": { "bundle": { "patch": "./cordis.patch.yml" } }
  ```
- Cordis plugin convention — every module in `lib/` exports `{ name, inject, apply }` and is registered as a plugin row in `cordis.patch.yml`. `name` is the plugin id, `inject` lists host services, `apply(ctx)` registers tools/sections/services via `ctx.tools.register(...)`, `ctx.systemPrompt.section(...)`, `ctx.provide(...)`, `ctx.effect(...)`.

**Testing:**
- Node.js built-in test runner — `node:test` with `node:assert/strict`. Declared in `package.json`:
  ```json
  "scripts": { "test": "node --test test/*.test.mjs" }
  ```
- Three test files: `test/_shared.test.mjs` (pure helper regressions), `test/state.test.mjs` (`GsdState` service against an in-memory fake fs), `test/tools.test.mjs` (tool-level execute regressions with a fake host fs + fake `subagents` service). Two helpers in `test/helpers/`: `fake-fs.mjs` (in-memory `ctx.fs` fake) and `project.mjs` (builds a minimal initialized project/phase/plans). No LLM, no real git/gh — fully deterministic.

**Build/Dev:**
- None — no bundler, no TypeScript compiler, no transpiler. The package is shipped as raw ESM (`files: ["lib/*.js", "cordis.patch.yml", "README.md"]`).

## Key Dependencies

**Critical (peer dependencies — supplied by the DSH host, `package.json`):**
- `@deepseek-ai/dsh-tools` (peer, `*`) — `defineTool()` used by every tool plugin (`lib/core-tools.js`, `lib/discuss.js`, `lib/plan.js`, `lib/execute.js`, `lib/verify.js`, `lib/ship.js`, `lib/ui.js`, `lib/quick.js`, `lib/map-codebase.js`) to declare model-facing tools with `parameters`, `output`, `execute`, and `presentCall`
- `@deepseek-ai/schemastery` (peer, `*`) — schema library for tool parameters (used via `dsh-tools`)
- `@deepseek-ai/cordis` (peer, `*`) — Cordis plugin runtime that the `apply(ctx)` convention is built on
- `@deepseek-ai/dsh-llm` — imported at runtime by `lib/commands.js` for `createUserMessage` (slash-command follow-up injection)
- `@deepseek-ai/dsh-agent-loop` — host's mechanical turn machine (kept; the bundle overrides only its *behaviour* via the `agent-loop` row patch in `cordis.patch.yml`)
- `@deepseek-ai/dsh-subagent` + `@deepseek-ai/dsh-subagent-spawn-in-process` — host services for the fresh-context subagent `spawn` provider, required by `lib/_runner.js` (`spawnSubagent` throws if the `spawn` provider is absent) and `lib/quick.js`

**Infrastructure:**
- Node builtins: `node:child_process` (synchronous `git`/`gh` invocation in `lib/ship.js`), `node:fs/promises` (dynamic import in `lib/ship.js:126`, `lib/state.js:84`, `lib/quick.js:55`), `node:path` (in test helpers and `lib/state.js`), `process.cwd()` (cwd fallback in `lib/_runner.js` and tool executors)

## Configuration

**Environment:**
- No env vars are read anywhere in `lib/` (verified: no `process.env` references). No `.env` file present. No runtime configuration is required beyond the host's plugin loader.
- Workflow configuration is per-project runtime data written by `gsd_init` to `.planning/config.json` via `_defaultConfig()` in `lib/state.js`: `gsd_state_version`, `workflow.*` toggles (`discuss_mode`, `nyquist_validation`, `pattern_mapper`, `tdd_mode`, `mvp_mode`, `use_worktrees`, `agent_hint_routing`, `text_mode`, `commit_docs`), `context_window: 200000`, `project_code`, `response_language`.

**Build:**
- None. The single build-like artifact is `cordis.patch.yml`, which the DSH host applies as a patch over the `dsh-base` config: one override row (`agent-loop` config) plus an `insert` block registering the 12 plugin rows (`gsd-persona`, `gsd-state`, `gsd-core-tools`, `gsd-discuss`, `gsd-plan`, `gsd-execute`, `gsd-verify`, `gsd-ship`, `gsd-ui`, `gsd-quick`, `gsd-map-codebase`, `gsd-commands`).

## Platform Requirements

**Development:**
- Node.js (v24.15.0 observed; modern ESM + built-in `node:test` support required)
- A working DSH installation with `dsh` CLI (`dsh plugin --profile <name> add /path/to/bundle`)
- Run tests: `npm test` (or `node --test test/*.test.mjs`)
- For the Ship phase: `git` CLI on PATH, a configured `origin` remote, and the GitHub CLI (`gh`) installed and authenticated

**Production:**
- Installed as a plugin layer on a DSH profile (after `dsh-base`). No standalone deployment target.

---

*Stack analysis: 2026-08-23*
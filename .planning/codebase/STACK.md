# Technology Stack

**Analysis Date:** 2026-08-22

## Languages

**Primary:**
- JavaScript (ESM) — all runtime code in `lib/*.js` (13 modules, 2,266 lines). No TypeScript. No build/transpile step; source is executed directly.

**Secondary:**
- YAML — `cordis.patch.yml` (host-plane patch manifest describing plugin rows and the `agent-loop` override)
- Markdown — planning artefacts and documentation (`.planning/`, `README.md`)
- JSON — `package.json` manifest; `.planning/config.json` written at runtime by `gsd_init`

## Runtime

**Environment:**
- Node.js v24.15.0 (verified in development environment). The bundle requires a modern Node for ESM + `node:fs/promises` dynamic imports.
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
- None — no test files, no test runner, no `vitest.config.*` / `jest.config.*`. Validation to date is manual: "every plugin module loads and its `apply` registers its tools with valid schemas" (per `README.md`).

**Build/Dev:**
- None — no bundler, no TypeScript compiler, no transpiler. The package is shipped as raw ESM (`files: ["lib/*.js", "cordis.patch.yml", "README.md"]`).

## Key Dependencies

**Critical (peer dependencies — supplied by the DSH host, `package.json`):**
- `@deepseek-ai/dsh-tools` (peer, `*`) — `defineTool()` used by every tool plugin (`lib/core-tools.js`, `lib/discuss.js`, `lib/plan.js`, `lib/execute.js`, `lib/verify.js`, `lib/ship.js`, `lib/ui.js`, `lib/quick.js`) to declare model-facing tools with `parameters`, `output`, `execute`, and `presentCall`
- `@deepseek-ai/schemastery` (peer, `*`) — schema library for tool parameters (used via `dsh-tools`)
- `@deepseek-ai/cordis` (peer, `*`) — Cordis plugin runtime that the `apply(ctx)` convention is built on
- `@deepseek-ai/dsh-llm` — imported at runtime by `lib/commands.js` for `createUserMessage` (slash-command follow-up injection)
- `@deepseek-ai/dsh-agent-loop` — host's mechanical turn machine (kept; the bundle overrides only its *behaviour* via the `agent-loop` row patch in `cordis.patch.yml`)
- `@deepseek-ai/dsh-subagent` + `@deepseek-ai/dsh-subagent-spawn-in-process` — host services for the fresh-context subagent `spawn` provider, required by `lib/_runner.js` (`spawnSubagent` throws if absent)

**Infrastructure:**
- Node builtins: `node:child_process` (synchronous `git`/`gh` invocation in `lib/ship.js`), `node:fs/promises` (dynamic import in `lib/ship.js` and `lib/quick.js`), `process.cwd()` (cwd fallback in `lib/_runner.js` and tool executors)

## Configuration

**Environment:**
- No env vars are read anywhere in `lib/`. No `.env` file present. No runtime configuration is required beyond the host's plugin loader.
- Workflow configuration is per-project runtime data written by `gsd_init` to `.planning/config.json` via `_defaultConfig()` in `lib/state.js`: `gsd_state_version`, `workflow.*` toggles (`discuss_mode`, `nyquist_validation`, `pattern_mapper`, `tdd_mode`, `mvp_mode`, `use_worktrees`, `agent_hint_routing`, `text_mode`, `commit_docs`), `context_window: 200000`, `project_code`, `response_language`.

**Build:**
- None. The single build-like artifact is `cordis.patch.yml`, which the DSH host applies as a patch over the `dsh-base` config: one override row (`agent-loop` config) plus an `insert` block registering the 11 plugin rows.

## Platform Requirements

**Development:**
- Node.js (v24 observed; modern ESM support required)
- A working DSH installation with `dsh` CLI (`dsh plugin --profile <name> add /path/to/bundle`)
- For the Ship phase: `git` CLI on PATH, a configured `origin` remote, and the GitHub CLI (`gh`) installed and authenticated

**Production:**
- Installed as a plugin layer on a DSH profile (after `dsh-base`). No standalone deployment target.

---

*Stack analysis: 2026-08-22*

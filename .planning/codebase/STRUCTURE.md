# Codebase Structure

**Analysis Date:** 2026-08-22

## Directory Layout

```
dsh-gsd-bundle/
├── package.json            # @dsh-gsd/bundle manifest: subpath exports, dsh bundle patch pointer, peers
├── cordis.patch.yml        # host-plane patch: overrides agent-loop row + inserts the 11 plugin rows
├── README.md               # bundle documentation, plugin table, /gsd-* UX table, scope notes
├── lib/                    # all runtime code (13 ESM modules, ~2,266 lines)
│   ├── persona.js          # gsd-persona — systemPrompt section + sync context provider
│   ├── state.js            # gsd-state — GsdState service (gsdState), .planning/ schemas
│   ├── core-tools.js       # gsd-core-tools — gsd_init / gsd_status / gsd_progress / gsd_new_milestone
│   ├── discuss.js          # gsd-discuss — gsd_discuss → CONTEXT.md
│   ├── ui.js               # gsd-ui — gsd_ui_phase → UI-SPEC.md
│   ├── plan.js             # gsd-plan — gsd_plan → RESEARCH.md + PLAN.md files + checker loop
│   ├── execute.js          # gsd-execute — gsd_execute → wave executors + SUMMARY.md
│   ├── verify.js           # gsd-verify — gsd_verify → VERIFICATION.md + routing
│   ├── ship.js             # gsd-ship — gsd_ship → preflight + gh pr create + STATE update
│   ├── quick.js            # gsd-quick — gsd_quick → .planning/quick/<date>-<slug>/
│   ├── commands.js         # gsd-commands — /gsd-* slash-command routers
│   ├── _shared.js          # shared helpers: frontmatter YAML-subset, slugify, roadmap/requirements schemas
│   ├── _runner.js          # subagent spawn + planningContext block builder + cwdOf
│   └── _agents.js          # 7 role prompts (researcher, planner, plan-checker, executor, verifier, ui-researcher, ui-checker)
└── .planning/              # GSD project state (created at runtime by gsd_init)
    ├── codebase/           # this mapping output
    ├── PROJECT.md
    ├── ROADMAP.md
    ├── REQUIREMENTS.md
    ├── STATE.md
    ├── config.json
    ├── phases/<NN>-<slug>/ # per-phase artefacts (written by the phase tools)
    └── quick/<YYYYMMDD>-<slug>/  # gsd_quick records (TASK.md)
```

## Directory Purposes

**`lib/` (the package root):**
- Purpose: All runtime code. Each non-underscore module is a Cordis plugin row; underscore-prefixed modules are internal shared infrastructure.
- Contains: 13 ESM modules; plugins export `{ name, inject, apply }`; shared modules export plain functions/constants.
- Key files: every module listed in the layout above.

**`lib/` underscore modules (`_shared.js`, `_runner.js`, `_agents.js`):**
- Purpose: cross-plugin infrastructure with no host service dependencies of their own (`_shared.js` is dependency-free; `_runner.js` needs the host `subagents` service at call time).
- Contains: artefact schemas and frontmatter parsing; subagent lifecycle; role-prompt text.
- Key files: `lib/_shared.js`, `lib/_runner.js`, `lib/_agents.js`.

**`.planning/` (runtime, git-committed):**
- Purpose: The durable GSD state written and read by the tools. Faithful to opengsd-core's layout.
- Contains: PROJECT.md, ROADMAP.md, REQUIREMENTS.md, STATE.md, config.json, `phases/`, `quick/`.
- Key files: STATE.md (navigation spine), ROADMAP.md (milestone + phase table), REQUIREMENTS.md (REQ-IDs).

## Key File Locations

**Entry Points:**
- `lib/persona.js`: the behavioural entry point — injected into every session's system prompt
- `lib/core-tools.js`: `gsd_init` / `gsd_status` — the first tools a new session calls
- `lib/commands.js`: the `/gsd-*` user-facing entry point (registered on the host `commands` service)
- `package.json`: the package entry (`main: ./lib/persona.js`) and subpath exports for each plugin row

**Configuration:**
- `package.json`: subpath export map (`@dsh-gsd/bundle/<name>` → `lib/<name>.js`), `dsh.bundle.patch`, peer dependencies
- `cordis.patch.yml`: the plugin registration + `agent-loop` override (the load-time configuration)
- `.planning/config.json`: per-project workflow config written by `GsdState._defaultConfig` (`lib/state.js:113-131`)

**Core Logic:**
- `lib/state.js`: the single service owning all `.planning/` schemas and progress bookkeeping
- `lib/plan.js` / `lib/execute.js` / `lib/verify.js`: the heavy orchestration steps
- `lib/ship.js`: the only module touching git/gh (`node:child_process` `execSync`)

**Shared Infrastructure:**
- `lib/_shared.js`: frontmatter/roadmap/requirements parse+stringify, slugify/zeroPad/date helpers, block/text conversion
- `lib/_runner.js`: `spawnSubagent` (fresh-context), `planningContext` builder, `cwdOf`
- `lib/_agents.js`: the 7 role prompts

**Testing:**
- Not applicable — no test files, no test runner, no test config (see STACK.md). The only validation story is the manual "plugins load and register tools" check described in `README.md:110`.

## Naming Conventions

**Files:**
- Plugin modules: lowercase snake, named after the loop step — `discuss.js`, `plan.js`, `execute.js`, `verify.js`, `ship.js`, `ui.js`, `quick.js`
- Orientation/service: `persona.js`, `state.js`, `core-tools.js`
- Internal shared modules: leading underscore — `_shared.js`, `_runner.js`, `_agents.js`
- Command router: `commands.js`

**Directories:**
- `.planning/phases/<NN>-<slug>/` where `<NN>` is zero-padded phase number and `<slug>` is the slugified phase name (optionally prefixed by `project_code-` per `lib/state.js:312-319`)
- `.planning/quick/<YYYYMMDD>-<slug>/` for quick tasks

**Plugin rows (cordis.patch.yml):**
- Row ids and `name`s: `gsd-<step>` / `@dsh-gsd/bundle/<module>` — e.g. `gsd-plan` ↔ `@dsh-gsd/bundle/plan`
- `inject` arrays list the host services each plugin needs, e.g. `["gsdState", "tools"]`, `["fs"]`, `["commands"]`

**Tools (model-facing):**
- `gsd_<step>` snake_case — `gsd_discuss`, `gsd_ui_phase`, `gsd_plan`, `gsd_execute`, `gsd_verify`, `gsd_ship`, `gsd_quick`, plus orientation: `gsd_init`, `gsd_status`, `gsd_progress`, `gsd_new_milestone`

**Artefacts (inside phase dirs):**
- `<base>-CONTEXT.md`, `<base>-RESEARCH.md`, `<base>-DISCUSSION-LOG.md`, `<base>-PLAN-<PP>.md`, `<base>-SUMMARY-<PP>.md`, `<base>-VERIFICATION.md`, `<base>-UAT.md`, `<base>-UI-SPEC.md` — base = `<NN>-<slug>`, PP zero-padded plan number (assembled by `writeArtifact` in `lib/state.js:326-334`)

**Variables/functions:** camelCase; class `GsdState`; exported helpers named by action (`slugify`, `zeroPad`, `parseFrontmatter`, `spawnSubagent`, `planningContext`, `cwdOf`); tool-local helpers prefixed by their owner (`git`, `gitOk`, `gh` in `lib/ship.js`).

## Where to Add New Code

**New GSD phase step or tool:**
- Implementation: a new `lib/<step>.js` plugin module following the `{ name, inject, apply }` convention with `ctx.tools.register(defineTool({…}))`.
- Registration: add a row to the `insert` block of `cordis.patch.yml` (id `gsd-<step>`, name `@dsh-gsd/bundle/<step>`); order the row where it belongs in the loop; update `_nextActionFor` and `STEPS` in `lib/state.js:25,275-277` if it changes STATE stepping.
- Export: add a subpath export in `package.json` (`"./<step>": { "default": "./lib/<step>.js" }`).

**New orchestrator feature (e.g. a new subagent role):**
- Add the role prompt as a constant in `lib/_agents.js`, spawn it via `spawnSubagent` from `lib/_runner.js`, and feed it a `planningContext([...])` block of artefacts read through `gsdState`.

**New `.planning/` artefact or schema change:**
- Centralise it in `lib/state.js` (`writeArtifact`/`readArtifact` with the new suffix) and keep the parse/serialize rules in `lib/_shared.js`; never parse `.planning/` files outside the service.

**New slash-command:**
- Add an entry to `COMMANDS` in `lib/commands.js` with a `build(raw)` that returns `{ text, ack }` (or `{ err }`); it routes to an existing `gsd_*` tool.

**New helper / util:**
- Shared by ≥2 plugins → `lib/_shared.js`; tied to subagent plumbing → `lib/_runner.js`; otherwise colocate in the owning plugin module.

**Tests:**
- No test infrastructure exists yet. To add: co-located `.test.js` files in `lib/` (or a `test/` dir) plus a runner config — none is present today (see STACK.md, TESTING is out of scope here).

## Special Directories

**`/dsh-gsd-bundle` (repo root):**
- Purpose: single-package repo; the whole bundle ships as one npm package
- Generated: No (files committed: `lib/*.js`, `cordis.patch.yml`, `README.md`, `package.json`)
- Committed: Yes

**`.planning/`:**
- Purpose: runtime GSD state (created by `gsd_init`, mutated by the phase tools)
- Generated: Yes (runtime)
- Committed: Yes (per the executor prompt's artefact-committing discipline; STATE.md updates are committed with phase work)

**`.planning/codebase/`:**
- Purpose: output of this GSD mapping pipeline (codebase intel for `/gsd-plan-phase`)
- Generated: Yes (this analysis)
- Committed: Yes

---

*Structure analysis: 2026-08-22*

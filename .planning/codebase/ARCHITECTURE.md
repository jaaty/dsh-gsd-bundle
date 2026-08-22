<!-- refreshed: 2026-08-22 -->
# Architecture

**Analysis Date:** 2026-08-22

## System Overview

```text
┌───────────────────────────────────────────────────────────────────────────┐
│                      DSH HOST (DeepSeek Harness / Cordis)                  │
│  @deepseek-ai/dsh-agent-loop (turn machine) · subagents (spawn provider)   │
│  tools · commands · fs · systemPrompt — kept, not reimplemented            │
└───────────────┬───────────────────────────────────────────────────────────┘
                │ cordis.patch.yml (override agent-loop + insert 11 rows)
                ▼
┌───────────────────────────────────────────────────────────────────────────┐
│                         @dsh-gsd/bundle — GSD phase loop                   │
│                                                                            │
│  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐                  │
│  │  Persona      │  │  State svc    │  │ Core tools    │                  │
│  │ lib/persona.js│  │ lib/state.js  │  │ lib/core-tools│                  │
│  │ gsd:persona   │  │  →gsdState    │  │ init/status/  │                  │
│  │ gsd:state ctx │  │  .planning/*  │  │ progress/mstn │                  │
│  └──────┬────────┘  └──────┬────────┘  └───────┬───────┘                  │
│         └─────────────┬────┴───────────────────┘                          │
│                       ▼                                                   │
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │            Phase loop (one gsd_* tool per step)                     │  │
│  │  discuss ─► (ui) ─► plan ─► execute ─► verify ─► ship              │  │
│  │ lib/discuss.js  lib/ui.js  lib/plan.js  lib/execute.js              │  │
│  │ lib/verify.js  lib/ship.js · + lib/quick.js (sub-threshold)         │  │
│  └───────────────────────┬────────────────────────────────────────────┘  │
│                          │ spawn fresh-context subagents                 │
│                          ▼                                               │
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │ Shared infra:  lib/_shared.js (schemas)  lib/_runner.js (subagent) │  │
│  │                lib/_agents.js (role prompts)                       │  │
│  └────────────────────────────────────────────────────────────────────┘  │
│                          │                                               │
│                          ▼                                               │
│  lib/commands.js — /gsd-* slash-command routers → inject user message   │
└───────────────────────────────┬───────────────────────────────────────────┘
                                │
                                ▼
        ┌───────────────────────────────────────────┐
        │  On-disk state: .planning/                │
        │  PROJECT.md ROADMAP.md REQUIREMENTS.md     │
        │  STATE.md config.json phases/<NN>-<slug>/  │
        │  quick/<YYYYMMDD>-<slug>/                  │
        └───────────────────────────────────────────┘
```

The bundle is not standalone: every module is a Cordis plugin `{ name, inject, apply }` registered in `cordis.patch.yml`, running inside the DSH host Node process. The mechanical agent turn loop stays in `@deepseek-ai/dsh-agent-loop`; the bundle replaces only its *behaviour* — the persona agents are configured as GSD drivers and the `gsd_*` tools implement the loop steps.

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| `gsd-persona` | Install phase-loop mental model (systemPrompt section order -100) + live loop-position context provider (order 10) | `lib/persona.js` |
| `gsd-state` | Publish the `gsdState` host service: `.planning/` artefact manager (STATE/ROADMAP/REQUIREMENTS/config, phase artefacts, plan index, progress, sync cache) | `lib/state.js` |
| `gsd-core-tools` | Orientation/entry tools: `gsd_init`, `gsd_status`, `gsd_progress`, `gsd_new_milestone` | `lib/core-tools.js` |
| `gsd-discuss` | `gsd_discuss` — seal CONTEXT.md (7 blocks, D-NN decisions), advance STATE to `plan` | `lib/discuss.js` |
| `gsd-plan` | `gsd_plan` — researcher → planner → plan-checker fresh-context subagents, ≤3-iteration revision loop, requirements-coverage gate | `lib/plan.js` |
| `gsd-execute` | `gsd_execute` — dependency-wave grouping, parallel fresh-context executors per plan, atomic commits, SUMMARY.md confirmation, STATE → `verify` | `lib/execute.js` |
| `gsd-verify` | `gsd_verify` — verifier subagent → VERIFICATION.md, status decision tree routing (passed/gaps_found/human_needed) | `lib/verify.js` |
| `gsd-ship` | `gsd_ship` — preflight gates (verification passed, clean tree, branch, remote, gh), push, PR body from artefacts, `gh pr create`, STATE + ROADMAP update | `lib/ship.js` |
| `gsd-ui` | `gsd_ui_phase` — optional UI design step: ui-researcher → UI-SPEC.md, ui-checker | `lib/ui.js` |
| `gsd-quick` | `gsd_quick` — sub-threshold path: one fresh-context subagent, atomic commit, record under `.planning/quick/` | `lib/quick.js` |
| `gsd-commands` | `/gsd-*` slash-commands — thin routers injecting a user message that instructs the agent to run the matching `gsd_*` tool | `lib/commands.js` |
| `_shared` | Frontmatter YAML-subset parse/serialize, slugify, zeroPad, dates, ROADMAP/REQUIREMENTS schemas, block/text helpers | `lib/_shared.js` |
| `_runner` | `spawnSubagent` (host `subagents` spawn provider), `planningContext` block builder, `cwdOf` | `lib/_runner.js` |
| `_agents` | The 7 role prompts (researcher, planner, plan-checker, executor, verifier, ui-researcher, ui-checker) | `lib/_agents.js` |

## Pattern Overview

**Overall:** Host-plane Cordis plugin set using the **orchestrator-and-fresh-context-subagent** pattern. Each `gsd_*` tool is a thin orchestrator: it reads artefacts via the `gsdState` service, spawns one-shot clean-context subagents through the host `subagents` `spawn` provider, writes results back into `.planning/`, and advances STATE. Orchestrators never do the heavy work themselves.

**Key Characteristics:**
- Every module is a Cordis plugin (`{ name, inject, apply }`); no side effects at import time.
- The main session stays lean: research, planning, execution, verification all run in fresh ~200k-context subagents (`lib/_runner.js`).
- `.planning/` on disk is the durable memory and the only cross-session state; STATE.md is the navigation spine read first by every entry point.
- A plain JS service object (`GsdState`) is shared via `ctx.provide('gsdState', …)` and consumed via `ctx.get('gsdState')` — not a Cordis Service subclass.
- All orchestration is synchronous in one tool `execute`; subagents are awaited via `Promise.all` per wave (`lib/execute.js`).

## Layers

**Host integration layer:**
- Purpose: Declares the plugin set and overrides the host agent-loop behaviour
- Location: `package.json` (`dsh.bundle.patch`), `cordis.patch.yml`
- Contains: The `agent-loop` config override (agents: `[gsd]`) and the `insert` block registering the 11 plugin rows with `@dsh-gsd/bundle/<name>` subpaths
- Depends on: DSH host conventions (row ids `agent-loop`, ordering `-100`)
- Used by: the DSH plugin loader

**Persona / orientation layer:**
- Purpose: Make every session a GSD driver; orient every step at STATE.md
- Location: `lib/persona.js`, `lib/core-tools.js`
- Contains: systemPrompt section + context provider; the 4 orientation tools
- Depends on: `gsdState` service (optional at registration, resolved at assembly time), `tools` host service
- Used by: all sessions (persona is injected globally)

**State service layer:**
- Purpose: Single owner of the `.planning/` schemas and progress bookkeeping
- Location: `lib/state.js`
- Contains: `GsdState` class — path helpers, `initProject`, STATE read/write/advance, roadmap/requirements/config IO, phase artefact write/read, `listPlans`/`planIndex`/`markPlanSummary`/`completePhase`, sync cache
- Depends on: `_shared.js` helpers; host `fs` service
- Used by: every other plugin (via `ctx.get("gsdState")`) and by `persona.js`'s sync context provider via `cachedState`

**Phase loop layer:**
- Purpose: One tool per loop step
- Location: `lib/discuss.js`, `lib/ui.js`, `lib/plan.js`, `lib/execute.js`, `lib/verify.js`, `lib/ship.js`, `lib/quick.js`
- Contains: `gsd_discuss`, `gsd_ui_phase`, `gsd_plan`, `gsd_execute`, `gsd_verify`, `gsd_ship`, `gsd_quick`
- Depends on: `gsdState`, host `tools`, `subagents` (via `_runner.js`), `_shared.js`, `_agents.js` prompts
- Used by: the agent (model-facing tools)

**Command layer:**
- Purpose: opengsd `/gsd-*` UX alongside natural-language driving
- Location: `lib/commands.js`
- Contains: 11 slash-command entries that translate raw input into an injected user-role message + ack
- Depends on: host `commands` service and `createUserMessage` from `@deepseek-ai/dsh-llm`
- Used by: session users; the injected message is handled by the persona-driven agent

**Shared infra:**
- Location: `lib/_shared.js`, `lib/_runner.js`, `lib/_agents.js`
- Contains: frontmatter/roadmap/requirements schemas; subagent spawn + planning_context assembly; role prompt text
- Depends on: `lib/_shared.js` (only dependency-free module); `_runner`/`_agents` depend on `_shared`
- Used by: all plugins

## Data Flow

### Primary Request Path (a phase end to end)

1. Session begins → `gsd-persona` injects the phase-loop mental model and a `gsd:state` context line computed from `gsdState.cachedState(cwd)` (`lib/persona.js:48-61, 78-89`)
2. `gsd_init` writes `PROJECT.md`, `REQUIREMENTS.md`, `ROADMAP.md`, `STATE.md`, `config.json` and seeds the cache (`lib/core-tools.js:52-78` → `GsdState.initProject` in `lib/state.js:78-111`)
3. `gsd_status` reads STATE.md + ROADMAP.md and prints the loop position (`lib/core-tools.js:83-118`)
4. `gsd_discuss` → the agent holds the decision conversation (via `ask_user_question`), then calls the tool with structured decisions → writes `<NN>-CONTEXT.md` + optional DISCUSSION-LOG.md → `setActivePhase(cwd, N, "plan")` → adds a decision line (`lib/discuss.js:130-137`)
5. (optional) `gsd_ui_phase` → spawns ui-researcher (writes UI-SPEC.md) then ui-checker → advances STATE to `plan` (`lib/ui.js:38-62`)
6. `gsd_plan`:
   - gates: phase not passed-verified; CONTEXT.md exists (`lib/plan.js:47-53`)
   - researcher subagent → RESEARCH.md (`lib/plan.js:68-85`)
   - planner subagent → writes `<NN>-<PP>-PLAN.md` files directly (`lib/plan.js:91-107`)
   - plan-checker subagent → issues string; up to 3 revision loops feeding issues back to the planner (`lib/plan.js:114-131`)
   - requirements-coverage warning gate, then `setActivePhase(cwd, N, "execute")` + decision (`lib/plan.js:140-153`)
7. `gsd_execute`:
   - discovers the plan index via `GsdState.planIndex` (waves, incomplete, runnable with satisfied `depends_on`) (`lib/state.js:392-409`)
   - groups to-run plans by wave, runs wave in order; per wave, dispatches one executor subagent per plan in `Promise.all` (`lib/execute.js:63-100`)
   - executor writes code, commits atomically (scope `{base}-{PP}`), writes SUMMARY.md; orchestrator confirms the file, calls `markPlanSummary`, marks REQ-IDs complete (`lib/execute.js:102-112`)
   - when all plans have summaries → `setActivePhase(cwd, N, "verify")` (`lib/execute.js:124-131`)
8. `gsd_verify`:
   - requires all plans have SUMMARY.md (`lib/verify.js:49-50`)
   - verifier subagent writes VERIFICATION.md (frontmatter `status`/`score`/`gaps`/`human_verification`) (`lib/verify.js:59-75`)
   - tool re-reads the file's frontmatter and routes: `passed` → STATE step `ship`; else stays `verify` (`lib/verify.js:85-91`)
9. `gsd_ship`:
   - preflight gates: VERIFICATION.md `status: passed`, clean working tree, feature branch, `origin` remote, `gh` authenticated (`lib/ship.js:52-72`)
   - `git push -u origin <branch>`, assemble PR body from plans/summaries/STATE, write temp body file, `gh pr create` (`lib/ship.js:75-129`)
   - update STATE (`Phase N shipped — PR #X`), `addDecision`, `completePhase` (ROADMAP status + progress percent) (`lib/ship.js:133-138`, `lib/state.js:421-441`)

### Sub-threshold path (`gsd_quick`)

1. `gsd_quick` computes `cwd` + slug dir `.planning/quick/<YYYYMMDD>-<slug>` (`lib/quick.js:39-40`)
2. spawns one executor subagent with the QUICK_PROMPT (`lib/quick.js:42`)
3. writes TASK.md into the dir and appends a decision line (`lib/quick.js:55-58`)

### Slash-command path

1. User types `/gsd-plan-phase 1` → host `commands` dispatches to the registered handler (`lib/commands.js:161-174`)
2. Handler builds a text instruction and an ack; `send(invocation.agent, built.text)` pushes a user-role message via `agent.followup(createUserMessage(...))` (`lib/commands.js:24-29`)
3. The agent (persona-driven) wakes on the followup and calls the matching `gsd_*` tool

**State Management:**
- Single write owner for all GSD state: the `gsdState` service (`lib/state.js`). Tools mutate only through its methods; the in-memory `_cache` (cwd → {state, roadmap, ts}) is the sync read path for the persona context provider.
- Artefacts are content-addressed by phase dir `<NN>-<slug>` and suffix: `CONTEXT`, `RESEARCH`, `DISCUSSION-LOG`, `PLAN-<PP>`, `SUMMARY-<PP>`, `VERIFICATION`, `UAT`, `UI-SPEC` — assembled by `writeArtifact`/`readArtifact` (`lib/state.js:326-346`).
- ROADMAP.md phase table and STATE frontmatter `progress` block hold phase/plan completion counters; `completePhase` recomputes percent (`lib/state.js:421-438`).

## Key Abstractions

**`GsdState` service:**
- Purpose: the single entry point to all `.planning/` reads/writes; the reference implementation of opengsd-core's artefact schema
- Examples: `lib/state.js:31-456`; consumed via `ctx.get("gsdState")` in every tool plugin
- Pattern: plain service object under `ctx.provide('gsdState', …)` with a synchronous `cachedState(cwd)` snapshot for the persona context provider

**`spawnSubagent` + `planningContext`:**
- Purpose: fresh-context subagent lifecycle + the `<planning_context>` block fed to each role; artefacts truncated at 60k chars to keep the fresh 200k window usable
- Examples: `lib/_runner.js:8-46`
- Pattern: single-threaded spawn-and-await; `run.dispose()` in a `finally`

**`defineTool` from `@deepseek-ai/dsh-tools`:**
- Purpose: every model-facing tool (`gsd_init`, …, `gsd_quick`) is declared with `parameters`, `output`, `execute`, `presentCall`
- Examples: every `lib/*.js` phase module `apply(ctx)` body
- Pattern: registration via `ctx.tools.register(defineTool({…}))`; tools resolve `cwd` either via `cwdOf(exec)` or `exec?.agent?.session?.header?.cwd || process.cwd()`

**Role prompts (`lib/_agents.js`):**
- Purpose: keep the orchestrators minimal — the detailed behaviour lives in the prompt text (opengsd faithful)
- Examples: `RESEARCHER_PROMPT`, `PLANNER_PROMPT`, `PLAN_CHECKER_PROMPT`, `EXECUTOR_PROMPT`, `VERIFIER_PROMPT`, `UI_RESEARCHER_PROMPT`, `UI_CHECKER_PROMPT`
- Pattern: pure string constants; the orchestration code composes them with `planningContext(...)` and per-invocation mode lines

## Entry Points

| Entry point | Location | Triggers | Responsibilities |
|---|---|---|---|
| Persona + context | `lib/persona.js` | every session start (system prompt assembly) | frame the agent, orient at STATE.md |
| `gsd_init` | `lib/core-tools.js:16` | first-run user request / `/gsd-init` | bootstrap `.planning/` |
| `gsd_status` | `lib/core-tools.js:83` | orientation request / `/gsd-status` | print loop position |
| `gsd_discuss` | `lib/discuss.js:17` | discuss step / `/gsd-discuss-phase <N>` | seal CONTEXT.md |
| `gsd_ui_phase` | `lib/ui.js:16` | optional UI step / `/gsd-ui-phase <N>` | produce UI-SPEC.md |
| `gsd_plan` | `lib/plan.js:20` | plan step / `/gsd-plan-phase <N>` | RESEARCH + PLAN files + checker |
| `gsd_execute` | `lib/execute.js:25` | execute step / `/gsd-execute-phase <N>` | wave executors + SUMMARY.md |
| `gsd_verify` | `lib/verify.js:21` | verify step / `/gsd-verify-work <N>` | VERIFICATION.md + routing |
| `gsd_ship` | `lib/ship.js:32` | ship step / `/gsd-ship [N] [--draft]` | preflight, PR creation, STATE update |
| `gsd_quick` | `lib/quick.js:26` | quick task / `/gsd-quick <task>` | single subagent, record under `.planning/quick/` |
| Slash commands | `lib/commands.js:159-175` | `/gsd-` user input | route to the matching tool via followup message |

## Architectural Constraints

- **Threading:** Single Node process; no worker threads. All orchestration is async/await; parallel executor dispatch uses `Promise.all` within a wave (`lib/execute.js:102`). `ship.js` calls `git`/`gh` via blocking `execSync` (`lib/ship.js:20-27`).
- **Sync persona context:** The runtime-context provider is synchronous (`persona.js:81-88`), so it reads only the in-memory `gsdState._cache`; the cache is populated on every artefact write and refreshed by `readState` (`lib/state.js:191-198`).
- **Fresh-context subagents only:** research, planning, execution, verification must run in `spawn`-provider subagents; the orchestrators must never write plans/code themselves.
- **No cross-plugin imports:** phase modules import only `lib/_shared.js`, `lib/_runner.js`, `lib/_agents.js` + host packages; the only dependency between plugins is the `gsdState` service obtained via `ctx.get`.
- **Consumed-but-not-injected host services:** `subagents` is fetched via `ctx.get` inside `execute` bodies (not listed in `inject`) in `plan.js`, `execute.js`, `verify.js`, `ui.js`, `quick.js`; `persona.js` reads `ctx.get('gsdState')` inside the context provider for late activation.
- **Shared working tree:** executors run on the shared working tree, not per-plan git worktrees (deliberate simplification documented in `lib/execute.js:9-12`); same-wave non-overlap is guaranteed by the plan-checker.

## Error Handling

**Strategy:** Guard-clause validation per tool. Every tool starts by verifying: `gsdState` available → project initialised → phase exists in ROADMAP → prerequisite artefact exists (`CONTEXT` for plan, `PLAN`s for execute/verify, `VERIFICATION passed` for ship). Failures throw descriptive `Error`s or return instruction strings that tell the user the next step.

**Patterns:**
- `throw new Error("gsd_plan: …")` for hard prerequisites
- Best-effort fallbacks: `catch(() => "")` on artefact reads (`lib/plan.js:89-90`, `lib/execute.js:47-48`), `gitOk`/`gh` wrappers that return `""` on failure (`lib/ship.js:21-27`)
- Status-routing strings (not exceptions) for workflow outcomes: `passed` / `gaps_found` / `human_needed` (`lib/verify.js:87-98`), `## PLANNING COMPLETE` / `## PHASE SPLIT RECOMMENDED` etc. as marker strings from subagent output (`lib/plan.js:110-112`)
- Subagent failure detection: short-output check (`< 50 chars`) and `stopReason`/`diagnostic` surfaced (`lib/plan.js:80-82`, `lib/ui.js:50`)

## Cross-Cutting Concerns

**Logging:** No logging framework; human-readable progress is accumulated into a `log` array per tool and returned as the tool's text output (`lib/plan.js:63`, `lib/execute.js:60-120`, `lib/ship.js:49-139`). Subagent outputs are truncated to ~120-500 chars when embedded in logs.
**Validation:** input validation lives in tool `parameters` schemas (`defineTool`) + the state service's parse/stringify round-trip; no runtime validation library beyond schemastery's.
**Authentication:** none in the bundle itself — `gsd_ship` relies on the local `gh` CLI being installed/authenticated (`lib/ship.js:71-72`).
**Path discipline:** every FS access goes through `gsdState` `ctx.fs.resolve`/`processPath` wrappers or the host fs service; `cwd` is resolved from the session header with `process.cwd()` fallback.

## Anti-Patterns

### Private-method reach-in from sibling plugin

**What happens:** `lib/quick.js:40` calls `s._planning(cwd)` — a method named `_private` on `GsdState` (`lib/state.js:41`) — and `lib/quick.js:58` tests `if (s.isProject)` (truthiness of the method, not the project's existence).
**Why it's wrong:** the underscore contract is violated; the truthiness test silently skips the decision recording whenever a project exists (the method is always defined). Breakage is a latent no-op rather than an error.
**Do this instead:** expose the quick-dir layout as a public helper on `GsdState` (e.g. `quickDir(cwd, slug)`) and call `await s.isProject(cwd)` for the guard.

### Parallel sync/async FS mixing

**What happens:** some tools resolve `cwd` via `cwdOf(exec)` (`lib/_runner.js:48-50`), others inline `exec?.agent?.session?.header?.cwd || process.cwd()` (`lib/core-tools.js:53`, `lib/discuss.js:69`).
**Why it's wrong:** duplicated logic drifts; `cwdOf` centralised for phase tools but the orientation tools and discuss still inline.
**Do this instead:** use `cwdOf(exec)` everywhere (import from `lib/_runner.js`).

### `_ensureDir` is a no-op

**What happens:** `lib/state.js:61-66` `_ensureDir` stats the target and swallows the error without creating anything.
**Why it's wrong:** dead code that reads as if it creates directories; callers may assume directory existence.
**Do this instead:** implement with `fs.mkdir({recursive: true})` or remove it.

### Inline temporary PR body file

**What happens:** `gsd_ship` writes the PR body to `cwd/.planning/.pr-body-<N>.md` then unlinks it after `gh pr create` (`lib/ship.js:120-130`).
**Why it's wrong:** a crash between write and unlink leaves a stray dot-file in the user's `.planning/`; the file is also created before the push, so it could pollute the commit tree if the tree is dirty (it isn't — preflight asserts clean).
**Do this instead:** use `os.tmpdir()` or pass the body via stdin with `--body-file -`.

### Redundant plan filter

**What happens:** `lib/execute.js:52` computes `idx.incomplete.filter((p) => !p.has_summary)` — `planIndex` already returns only plans without summaries.
**Why it's wrong:** redundant predicate; the intent (re-run filtering) is invisible.
**Do this instead:** filter once, e.g. `plans = idx.incomplete` and keep the `gapsOnly`/`wave` filters.

---

*Architecture analysis: 2026-08-22*

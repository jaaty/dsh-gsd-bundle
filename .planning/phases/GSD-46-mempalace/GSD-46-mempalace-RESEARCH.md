I have all the evidence I need. Here is the complete RESEARCH.md.

---

# Phase 46: mempalace — Research

**Researcher:** gsd-phase-researcher · **Phase:** 46-mempalace · **Goal:** Add a cross-session memory integration that performs deliberate recall before discuss/plan and verbatim capture at phase boundaries (GAP-12).

## Domain analysis

### What this phase is
A new **loop-step plugin** (`lib/mempalace.js`) that mirrors `lib/learnings.js` and `lib/graphify.js` exactly: it publishes a `gsdMempalace` capability, registers two tools (`gsd_mempalace_recall`, `gsd_mempalace_capture`), registers two `/gsd-*` commands, and wires best-effort auto-hooks into the loop tools. It talks to the external **MemPalace** service through an injectable CLI exec seam. It is an **advisory soft gate** — it never advances STATE and never blocks a loop step. [VERIFIED: lib/learnings.js, lib/graphify.js, lib/_capabilities.js, lib/commands.js read this session]

### The step-plugin pattern to mirror (high confidence)
Every loop-step plugin follows the same shape, and mempalace must too: [VERIFIED: lib/learnings.js, lib/graphify.js read this session]

1. `const name = "gsd-mempalace"` and `const inject = ["gsdState", "tools"]` (no `subagents` — mempalace spawns no subagent, mirroring graphify's deliberate absence of the subagents coeffect). [VERIFIED: lib/graphify.js:24-26]
2. **Pure exported helpers** with NO `ctx`/`fs`/`git` params, directly unit-testable: `resolveWing`, `resolveMode`, `buildRecallDoc`, `buildStub`, `mapArtifactToRoom`, `buildStageTree` (D-12 names within convention). All I/O lives in `apply()`. [VERIFIED: lib/learnings.js:31-33, lib/graphify.js:28-30]
3. `apply(ctx)` does: `ctx.provide("gsdMempalace", buildCapability("gsdMempalace"))` then `ctx.tools.register(defineTool({...}))`. [VERIFIED: lib/learnings.js:214-216, lib/graphify.js:214-216]
4. The tool's `execute` starts with **fail-fast environmental guards** (gsdState present, `isProject`, `readRoadmap`, phase in ROADMAP), then the **config gate**, then the work, wrapped so a palace fault never throws. [VERIFIED: lib/graphify.js:236-258]
5. Ends with `addDecision` (audit trail, NO `setActivePhase`) + `commitArtifacts` via the shared git seam. [VERIFIED: lib/learnings.js:296-306, lib/graphify.js:300-310]

### The injectable exec seam (high confidence)
`lib/_git-artifacts.js` exports `defaultGitFn(cwd, args)` = `promisify(execFile)` wrapper, and every helper accepts an optional `gitFn(cwd, argsArray)` for test injection. mempalace mirrors this with `mempalaceFn(cwd, argsArray)` defaulting to `promisify(execFile)("mempalace", ...)`. **SECURITY:** every call uses a FIXED argument array with `-C cwd`-style discipline — never a shell string, never model-supplied interpolation. [VERIFIED: lib/_git-artifacts.js:20-25, 30-33]

### The config gate (high confidence)
`readConfig(cwd)` in `lib/state.js:382-386` returns the full `_defaultConfig({})` on a missing/corrupt file, else the raw parsed JSON. The gate reads `cfg?.mempalace?.enabled === true` (D-03). Because `readConfig` returns the raw config when present (not merged with defaults), a config.json without a `mempalace` block yields `cfg.mempalace === undefined` → gate fails → disabled. This is the correct opt-in default. The `_defaultConfig` mempalace block (D-10) only matters for the missing/corrupt fallback. [VERIFIED: lib/state.js:382-386, 183-207]

### The capability registration (high confidence)
`lib/_capabilities.js` is the single source of truth. Adding `gsdMempalace` to `CAPABILITY_KEYS` + `TABLE` with `order: 55`, `role: "step"`, `tools: ["gsd_mempalace_recall","gsd_mempalace_capture"]`, `commands: ["gsd-mempalace-recall","gsd-mempalace-capture"]`, `produces: ["MEMORY-RECALL.md"]` auto-renders it in `loopSteps()` after graphify (54) and in the persona's available-steps list. `effectiveRoutableStep` finds the first present step with strictly greater order, so order 55 does not disturb ship(50)→milestone-audit(52)→learnings(53)→graphify(54). [VERIFIED: lib/_capabilities.js:31-45, 200-215; lib/_render.js:80-120]

### The command layer (high confidence)
`lib/commands.js` registers each `/gsd-*` command from a sub-fiber `ctx.inject([capKey, "commands"], ...)` where `capKey` is derived from the capability descriptor's `commands` array. Adding `gsd-mempalace-recall` + `gsd-mempalace-capture` to the `COMMANDS` array (with the capability's `commands` listing them) auto-wires the DEGR-03 coeffect: retiring the mempalace plugin withdraws the commands. [VERIFIED: lib/commands.js:296-320]

### The auto-hook wiring (high confidence)
`lib/ship.js` already has the exact pattern to mirror: `runLearningsOnShip` / `runGraphifyOnShip` are **pure exported helpers** taking only `{ cfg, tools, phase, exec }` (no ctx/git/gsdState), gated by a workflow flag, finding the registered tool by name, invoking `tool.execute(...)`, and catching any throw into a non-blocking log line. They are called at ship:post after the completion commit. mempalace's auto-hooks in discuss/plan/verify/ship must follow this same pure-helper + never-block shape. [VERIFIED: lib/ship.js:50-100, 285-310]

### Pitfalls (high confidence)
- **Never let a palace fault fail the step** — every hook is `onError: skip`; a CLI error/timeout is caught, the stub is written, the real cause is surfaced in the tool output. [VERIFIED: upstream mempalace-recall.md, mempalace-capture.md anti-patterns]
- **Never write lossy summaries** — capture stores the artifact VERBATIM; no AAAK compression, no pruning (curator's job, deferred). [VERIFIED: upstream mempalace-capture.md anti-patterns]
- **Never skip the config gate or the dedup/idempotency check.** [VERIFIED: upstream mempalace-capture.md anti-patterns]
- **`mempalace mine` has no `--room` flag** — room assignment is driven by `detect_room()` matching folder-path segments against the `rooms:` list in `mempalace.yaml`. Stage under a room-named folder. [VERIFIED: upstream mempalace-capture.md; CITED: https://mempalaceofficial.com/reference/cli, https://mempalaceofficial.com/guide/mining.html]

## Package legitimacy

**MemPalace** — the external service. Verified against the official docs and the GitHub repo. [CITED: https://mempalaceofficial.com/reference/cli, https://github.com/MemPalace/mempalace]

Confirmed CLI commands (from the official CLI reference, fetched this session): [CITED: https://mempalaceofficial.com/reference/cli]
- `mempalace wake-up --wing <wing>` — L0+L1 wake-up context (~600–900 tokens). **Confirmed.**
- `mempalace search "<query>" --wing <wing> [--room <room>] [--results N]` — semantic search. **Confirmed.**
- `mempalace mine <dir> --wing <wing>` — mine files into the palace; `--wing` defaults to the directory name; `--mode projects` default. **Confirmed.**
- `mempalace init <dir>` — scans for people/projects/rooms, detects rooms from folder structure, writes `entities.json`. **Confirmed.**
- `mempalace status` — drawer count, wing/room breakdown. **Confirmed.**
- `mempalace sync` — logstream peer sync (NOT the curator's wing-scoped pruning; the curator is deferred). **Confirmed.**

**CRITICAL FINDING — no CLI knowledge-graph command.** The MemPalace temporal knowledge graph is exposed ONLY via MCP tools (`mempalace_kg_add`, `mempalace_kg_query`, `mempalace_kg_timeline`, `mempalace_kg_invalidate`, `mempalace_kg_supersede`, `mempalace_kg_stats`) and the Python API (`from mempalace.knowledge_graph import KnowledgeGraph; kg.add_triple(...)`). The CLI reference lists NO `kg_add`/`kg_query` command. [CITED: https://mempalaceofficial.com/reference/mcp-tools, https://mempalaceofficial.com/concepts/knowledge-graph.html]

**Implication for D-06 / D-11g (mirror_kg):** D-06 says "Optionally mirrors KG facts (mempalace_kg_add with valid_from = phase date)". Since this bundle is CLI-only (D-04, no MCP), `mempalace_kg_add` is **not reachable through the `mempalaceFn` CLI seam**. This is resolved in Open Question OQ-1 below.

**`mempalace.yaml` room taxonomy** — verified format: each `rooms:` entry MUST be a dict with a `name` key (a bare-string list crashes `_mine_impl` with `TypeError: string indices must be integers, not 'str'`). `detect_room()` matches path parts against room name/keywords via substring matching (issue #1002; token-boundary fix in PR #1004). The upstream taxonomy `rooms: [{name: decisions}, {name: planning}, {name: milestones}, {name: problems}, {name: general}]` uses distinct non-colliding names, so staging under `<room>/<phase-id>/` routes correctly. [CITED: https://github.com/MemPalace/mempalace/issues/1002, https://github.com/MemPalace/mempalace/pull/1004, https://mempalaceofficial.com/guide/mining.html]

## Risks and Open Questions

### OQ-1 — mirror_kg cannot be implemented via the CLI (RESOLVED)
**Finding:** `mempalace_kg_add` is an MCP tool / Python API only; the CLI has no KG command. [CITED: https://mempalaceofficial.com/reference/mcp-tools, https://mempalaceofficial.com/reference/cli]
**Resolution:** Treat `mirror_kg` as **config-accepted but CLI-unimplemented this phase**, consistent with D-09's additive treatment of `kg_backend`/`replace`. The config gate is still honored and testable (D-11g): when `mirror_kg === false`, skip the KG-mirror step entirely; when `true`, the tool reports "KG mirroring requires MCP (`mempalace_kg_add`) — unavailable in this CLI-only bundle" and never throws. This keeps the gate testable and never blocks. Document this in the tool output and README so a user setting `mirror_kg: true` knows KG facts are not written until a later MCP-capable phase. **The planner must NOT attempt to invoke a non-existent `mempalace kg_add` CLI command.**

### OQ-2 — recall topic at discuss:pre (RESOLVED)
**Finding:** D-05 says the recall topic derives from "the phase CONTEXT.md title/goal/decisions", but at `discuss:pre` the CONTEXT.md does not exist yet (discuss creates it). [VERIFIED: lib/discuss.js:178 — CONTEXT written inside discuss execute]
**Resolution:** `resolveRecallTopic` must fall back to the ROADMAP phase goal when CONTEXT is absent (discuss:pre), and use CONTEXT title/goal/decisions when present (plan:pre). This is a pure helper taking `{ contextText, phaseGoal }` and returning a short search query string.

### OQ-3 — ship:post capture artifact (RESOLVED)
**Finding:** D-07 says "ship.js fires capture at ship:post", but the upstream REQ-MP-03 capture list is only discuss:post/plan:post/verify:post, and the upstream capture doc's loop-point inference (`discuss:post → CONTEXT.md, plan:post → PLAN.md, verify:post → SUMMARY.md`) has no ship:post entry. [VERIFIED: upstream mempalace-capture.md]
**Resolution:** The ship:post hook re-files `SUMMARY.md` (the final state) into the `milestones` room, mirroring how the learnings/graphify ship:post hooks re-run on the final state. The capture tool's `artifact` arg is explicit, so the hook passes `artifact: "SUMMARY"`.

### OQ-4 — auto-hook commit strategy (RESOLVED)
**Finding:** D-12 leaves it to discretion whether auto-hooks commit staged artifacts via `commitArtifacts` or leave them unstaged.
**Resolution:** Use `commitArtifacts(cwd, phaseNum, { scope: "mempalace", phaseName })` for consistency with learnings/graphify. This keeps the full-tree `git status --short` clean for `gsd_ship` preflight (the same reason learnings/graphify commit). The staging tree `.planning/.mempalace-stage/` is under `.planning/` so it is captured by the wholesale `.planning` add. [VERIFIED: lib/_git-artifacts.js:150-180]

### OQ-5 — staging-tree accessor (RESOLVED)
**Finding:** `.planning/.mempalace-stage/` is project-scoped (not phase-scoped), so it must NOT be written via `writeArtifact` (which resolves the phase dir). It needs a project-scoped accessor mirroring `writeRootLearnings`/`writeGraphArtifact`. [VERIFIED: lib/state.js:520-536, 537-557]
**Resolution:** Add a `mempalaceStageDir(cwd)` accessor (or reuse a generic project-scoped write) that routes through `this._write` → `ctx.fs` (never raw `node:fs/promises`), mirroring `writeGraphArtifact`. The `.gitignore` for `mempalace_embedder.json` inside the stage dir must also be written through `ctx.fs`.

### OQ-6 — `_defaultConfig` mempalace block (RESOLVED)
**Finding:** D-10 says add the mempalace keys to `_defaultConfig` (state.js 183-207). The block is `{ enabled: false, memory_mode: "augment", wing: "", recall_on_discuss: true, recall_on_plan: true, capture_artifacts: true, mirror_kg: true }`. [VERIFIED: lib/state.js:183-207]
**Resolution:** Add the block. Note `mirror_kg` default `true` per upstream CONFIGURATION.md, but per OQ-1 the actual KG write is a documented no-op in this CLI-only bundle.

### OQ-7 — plugin registration surface (RESOLVED)
**Finding:** Adding a plugin requires updating `cordis.patch.yml` (new `gsd-mempalace` row), `package.json` `exports` (`./mempalace`), and `test/helpers/mount-harness.mjs` `PATCH_ROWS` (the removal suite's `retirementMatrix` maps `role:"step"` capabilities to `PATCH_ROWS` by `sub === cap.step`, so a new step plugin needs a row). [VERIFIED: cordis.patch.yml, package.json, test/helpers/mount-harness.mjs:20-42, test/removal.test.mjs:30-45]
**Resolution:** Add all three. The `_capabilities.js` "20 known capability keys" comment and the mount-harness "21 plugin rows" comment must be updated to 21/22.

## Architectural Responsibility Map

| Capability | Tier | Notes |
|---|---|---|
| Tool registration (`gsd_mempalace_recall`/`gsd_mempalace_capture`) | **Presentation** | `defineTool` + `ctx.tools.register` in `apply()`. |
| Capability publish (`gsdMempalace`, order 55) | **Presentation** | `ctx.provide("gsdMempalace", buildCapability("gsdMempalace"))`. |
| Command registration (`/gsd-mempalace-recall`/`-capture`) | **Presentation** | `lib/commands.js` `COMMANDS` array + capability `commands` list. |
| MEMORY-RECALL.md rendering | **Presentation** | `buildRecallDoc`/`buildStub` produce the markdown body. |
| Pure domain helpers (`resolveWing`, `resolveMode`, `resolveRecallTopic`, `mapArtifactToRoom`, `buildStageTree`) | **Domain** | NO ctx/fs/git params; directly unit-testable. |
| Config gate logic (`mempalace.enabled`, sub-keys) | **Domain** | Reads via `readConfig`; pure decision, no I/O. |
| `.planning/` artefact reads/writes (MEMORY-RECALL.md, staging tree) | **Data** | Via `gsdState` accessors (`writeArtifact` for phase-scoped, a project-scoped accessor for the stage tree). |
| **CLI exec seam (`mempalaceFn`)** | **Integration** | **SECURITY-SENSITIVE.** Runs external `mempalace` commands. MUST use a FIXED argument array (never a shell string, never model-supplied interpolation), mirroring the `gitFn` discipline in `lib/_git-artifacts.js:20-25`. A security-sensitive capability in the wrong tier is a BLOCKER — this stays in the integration seam, injectable for tests. |

**Tier rule:** the exec seam is the only place that touches the external process; the domain helpers never call `mempalaceFn` directly (they return structured data; `apply()` orchestrates the calls). This mirrors how learnings/graphify keep all I/O in `apply()`.

## Validation Architecture

TDD per D-11, following `test/*.test.mjs` + `test/helpers/mount-harness.mjs` conventions (FakeFs + fake-ctx, no live boot, no LLM/git/gh). [VERIFIED: test/learnings.test.mjs, test/graphify.test.mjs, test/helpers/mount-harness.mjs]

| Behaviour | Automated check |
|---|---|
| (a) `gsdMempalace` capability registered, order 55, step `mempalace`, tools/commands/produces match | `buildCapability("gsdMempalace")` assertions (mirror graphify.test.mjs:274-285). |
| (b) Config gate — disabled prints activation hint + writes nothing; enabled proceeds | Mount + `readConfig` with/without `mempalace.enabled: true`; assert no MEMORY-RECALL.md / no stage tree when disabled. |
| (c) Recall produces MEMORY-RECALL.md from a fake `mempalaceFn` (wake-up + search) with decisions/patterns/surprises + provenance | Inject fake `mempalaceFn`; assert the doc structure and provenance fields. |
| (d) Recall stub when the CLI is unreachable | Fake `mempalaceFn` throws; assert the 'unavailable' stub is written and the tool resolves (never throws). |
| (e) Capture staging + mine with room mapping + verbatim content | Fake `mempalaceFn`; assert stage tree under `<room>/<phase-id>/`, verbatim content, `mine` called with `--wing`. |
| (f) Capture idempotency | Re-run capture; assert no duplicate drawers (content-hash / stable path). |
| (g) mirror_kg gating | `mirror_kg: false` → no KG step; `true` → reports CLI-unavailable (OQ-1), never throws. |
| (h) Auto-hooks in discuss/plan/verify/ship gated by `mempalace.enabled` and never-blocking on fault | Pure hook helpers (mirror `runLearningsOnShip`) with fake tools array; assert gating + catch-into-log-line. |
| Pure helpers (`resolveWing`, `resolveMode`, `resolveRecallTopic`, `buildRecallDoc`, `buildStub`, `mapArtifactToRoom`, `buildStageTree`) | Direct unit tests, no ctx/fs/git params. |
| Plugin registration | `mount.test.mjs`/`removal.test.mjs` extend automatically via `PATCH_ROWS` + `CAPABILITY_KEYS` (OQ-7). |

## Project Constraints

- **Node builtins only** — no new runtime dependencies; `mempalaceFn` uses `node:child_process` `execFile` + `node:util` `promisify` (already in `lib/_git-artifacts.js`). [VERIFIED: lib/_git-artifacts.js:20-25]
- **No subagent** — mempalace spawns nothing; `inject` is `["gsdState", "tools"]` only (no `subagents` coeffect). [VERIFIED: lib/graphify.js:24-26]
- **No MCP** — CLI-only transport (D-04). This is what makes OQ-1 (mirror_kg) a documented no-op.
- **Advisory soft gate** — never advances STATE, never blocks a loop step; every hook `onError: skip`. [VERIFIED: lib/learnings.js:296-306, lib/graphify.js:300-310]
- **TDD** — tests written alongside implementation; `npm test` (`node --test test/*.test.mjs`) must pass. [VERIFIED: package.json scripts]
- **Shared seams** — use `readConfig`, `writeArtifact`, `commitArtifacts`, `buildCapability`, `parseFrontmatter`/`stringifyFrontmatter`/`parseDecisionEntries`, `cwdOf`; never raw `node:fs/promises` for `.planning/` writes (DUR-06). [VERIFIED: lib/state.js, lib/_shared.js, lib/_runner.js]
- **Config gate via `readConfig`** — never `gsd-tools config get-value` (hard-exits on missing keys — upstream anti-pattern). [VERIFIED: upstream mempalace-recall.md Step 1]

## Files to touch (for the planner)

- **New:** `lib/mempalace.js`, `test/mempalace.test.mjs`
- **Modify:** `lib/_capabilities.js` (add `gsdMempalace`, order 55), `lib/state.js` (`_defaultConfig` mempalace block + a project-scoped stage-dir accessor), `lib/discuss.js`/`lib/plan.js`/`lib/verify.js`/`lib/ship.js` (auto-hooks), `lib/commands.js` (two commands), `cordis.patch.yml` (gsd-mempalace row), `package.json` (`./mempalace` export), `test/helpers/mount-harness.mjs` (`PATCH_ROWS` row), `README.md` (config documentation).

---

*All in-repo claims verified by reading the named files this session. External MemPalace claims cited to the official docs fetched this session.*
I have everything I need. Here is the full RESEARCH.md:

---

# RESEARCH.md — Phase 52: phase-management (CLH-01)

Phase goal: *Add, insert, remove, reorder, and edit phases directly in ROADMAP.md with validation and integrity checks.*

This research establishes the domain model, the locked decisions' implementation surfaces, the risks, and the validation architecture so the planner can decompose CLH-01 precisely. All in-repo claims were read this session (verbatim, with path + line range). No new dependencies are proposed — only existing plugins/services are reused.

---

## Domain analysis

### The ROADMAP model is the single source of truth [VERIFIED: lib/_shared.js parseRoadmap:179-210 / stringifyRoadmap:212-236]
- `parseRoadmap(text)` returns `{ milestone, milestoneName, version, phases: [{ n, slug, name, goal, requirements, status }] }`. The phase table is parsed from rows `| # | Phase | Goal | Requirements |`, where phase `#` is `cells[0]`, the **Phase** cell (`cells[1]`) carries the completion checkbox, and status derives from a `[x]` prefix on the Phase cell → `"Complete"`, else `"pending"`. Each `requirements` cell is split on `[\s,…·]+`. [VERIFIED: _shared.js:196-205]
- `stringifyRoadmap(doc)` rebuilds BOTH the phase table and the `## Progress` table from the same `doc.phases` array, using `zeroPad(p.n)` for `#`, `[x] ` prefix when `p.status === "Complete"`, `p.requirements.join(" … ")`, and a Progress row of `| # | Phase | [x] Complete|pending | today() |`. [VERIFIED: _shared.js:212-236]
- **Consequence (locked by D-05):** because stringify regenerates the Progress table from `phases`, a CRUD mutation that mutates `roadmap.phases` and re-serialises via `stringifyRoadmap` automatically keeps ROADMAP's phase table AND `## Progress` table consistent. The Progress table needs no separate editing logic.

### STATE progress is derived from ROADMAP, and the recompute helper already exists [VERIFIED: lib/state.js]
- STATE frontmatter schema (from `_freshState`, state.js:220-247) includes `active_phase`, `status`, `next_action`, `next_phases`, `current_phase/n/plan`, and `progress: { total_phases, completed_phases, total_plans, completed_plans, percent }`.
- `recomputeProgress(cwd)` (state.js:871-880) is the canonical drift-heal: `total_phases = roadmap.phases.length`, `completed_phases = roadmap.phases.filter(p => p.status === "Complete").length`, `percent = round(completed/total*100)`. It reads roadmap, reads state, patches `frontmatter.progress`, writes state. It is **already used** by `core-tools.js:320-321` (gsd_new_milestone) and `execute.js:211`.
- `completePhase` (state.js:838-847) inlines the same recompute after flipping a status to `Complete`, and clears `active_phase`/`status`, recomputes from `roadmap.phases`.
- **Consequence (D-05):** after any phase mutation, call `s.recomputeProgress(cwd)`. This satisfies the "Progress/STATE drift auto-healed" decision verbatim. Note D-05 names `total_phases` and `completed_phases`; `percent` and `total_plans` are also owned by the same helper and must not diverge.

### Phase status vocabulary is exactly `'Complete' | 'pending'` [VERIFIED: lib/_shared.js:204; lib/state.js:155, 844]
- Status is set only from the `[x]` checkbox. There is **no** other status string in current usage (e.g. no "in-progress"/"active" status). "In-flight" is modelled NOT by a status but by `STATE.frontmatter.active_phase` pointing at a phase number.

### REQ-ID existence check [VERIFIED: lib/_shared.js:239-246; lib/state.js:451-452]
- `parseRequirements(text)` maps `- [x] REQ-\d+: text` lines to `{ id, text, complete }`. `readRequirements(cwd)` reads `.planning/REQUIREMENTS.md` and returns the authoritative ID set. D-04's "every referenced REQ-ID must exist" check resolves against this set.

### Atomic-multi-file commit seam already exists [VERIFIED: lib/_git-artifacts.js:174-201]
- `commitArtifacts(cwd, phaseNum, opts, gitFn)` stages `.planning` **wholesale**, commits with a message, returns `{ committed, staged, message, warning? }`, never throws. `opts.message` overrides the default message (with `phaseNum` allowed to be `null`). 
- **Consequence (D-06):** write ROADMAP + STATUS (and ensure phase-branch acquisition via `ensurePhaseBranch`) then one `commitArtifacts` call lands all three (.planning ROADMAP.md + STATE.md + Progress) in a single atomic commit. Because commitArtifacts stages all of `.planning`, ROADMAP.md, its Progress table content (inside ROADMAP.md), and STATE.md are captured together. Per-phase feature branch: `ensurePhaseBranch` (acquired at branch time) is the convention every other plugin follows.
- **Note:** `commitArtifacts` commits the working-tree state of `.planning`. The fail-closed ordering (validate → mutate in-memory → write files → commit) matters: if any hard check fails, nothing is written, so nothing is staged. [ASSUMED: correct fail-closed ordering requires validate-before-write; the seam itself does not guard this]

### Tool + slash-command plugin surface [VERIFIED: lib/health.js, lib/state.js, lib/_capabilities.js, lib/commands.js]
- A loop-step/out-of-band plugin file exports `{ name, inject, apply }`. `apply(ctx)` calls `ctx.provide(key, buildCapability(key))`, `ctx.tools.register(defineTool({ name, description, parameters, output, async execute(args, exec) }))`, and the tool body uses `cwdOf(exec)`, `ctx.get("gsdState")`, `s.isProject(cwd)`, `s.readRoadmap`, `s.readState`, etc. `inject = ["gsdState", "tools"]` (no `subagents` — no agent spawn). [VERIFIED: health.js:36-40, 373-380; _git-artifacts.js usage in core-tools]
- Capability registry: `CAPABILITY_KEYS` (an ordered frozen array, _capabilities.js:52-75) and the `TABLE` (one row per key with `step, role, tools[], commands[], order, prereq, next, produces, consumes`). `buildCapability`, `allCapabilities`, and `capabilityForTool` all derive from `CAPABILITY_KEYS` + `TABLE`. Out-of-band entries (e.g. `gsdHealth` at lines 239-249) use `role: "out-of-band"`, `order: NOT_LOOP_ORDERED` (-1). [VERIFIED: _capabilities.js:52-75, 228-314, 316-352]
- Command layer (`commands.js:35-360` COMMANDS array + `apply` at 374-408): each command is `{ name, description, hint?, build(raw) }`; `build` returns `{ err }` or `{ text, ack }` (injecting a user-role message via `send`/`createUserMessage`). Registration is reactive: `apply` maps every command back to its owning capability via `allCapabilities()` and registers each command in a sub-fiber `ctx.inject([capKey, "commands"], ...)` so the command exists only while the capability is present. **Adding `/gsd-phase-manage` REQUIRES a new `gsdPhaseManagement` capability row with `commands: ["gsd-phase-manage"]`** or the command's sub-fiber `capKey` will be `undefined` and it won't register. [VERIFIED: commands.js:376-408]

### No existing `gsd_phase` tool or `/gsd-phase-manage` command [VERIFIED: grep across lib/*.js, test/*.test.mjs, cordis.patch.yml]
- Confirmed only a log-prefix coincidence (`gsd_phase:` inside an error string, state.js:815) — not a tool. All CRUD is net-new.

### Renumbering policy is the main unresolved Claude's-Discretion item
- `stringifyRoadmap` writes `zeroPad(p.n)` as `#`, and `active_phase`/phase-dir identity (`.planning/phases/NN-slug/`) use `n`. D-02 locks that renumbering ripples through ROADMAP table + Progress + STATE **only**, never phase dirs. The exact numbering scheme (append at `n = max+1` vs contiguous renumber `n = index+1` after insert/reorder) is not specified. This is flagged as Open Question OQ-1 below (must be RESOLVED at planning).

---

## Package legitimacy

No new runtime dependencies are proposed. This phase is implemented entirely with existing in-repo services and packages already imported by sibling plugins. Sources:

* `@deepseek-ai/dsh-tools` — `defineTool`. [VERIFIED: imported and used by lib/health.js:20, lib/undo.js:30]. Registry package is the official dsh tools namespace; its exact API is confirmed by working in-repo usage, not by a new lookup.
* `@deepseek-ai/dsh-llm` — `createUserMessage`, used by the command layer `lib/commands.js:15` for the user-role follow-up message. [VERIFIED].
* Node built-ins only for any pure helpers (regex/scoring/validation), mirroring `lib/_shared.js` and `lib/_capabilities.js` which are "plain ESM, no dependencies, no ctx, no I/O". [VERIFIED: _capabilities.js:1-4]
* Core services injected, never imported as packages: the `gsdState` service (state.js reads/writes) and the `tools`/`commands`/`subagents` host services. [VERIFIED: health.js:36-40]

No [CITED] registry lookup is required because nothing new is added to `dependencies`/`peerDependencies`; this phase is greenfield within the existing plugin/package surface.

---

## Risks and Open Questions

### Risks
- **R1 — Renumber vs phase-dir identity divergence.** If reorder/insert reassigns `n` as a contiguous 1..N, ROADMAP `#` and `active_phase` will no longer match `.planning/phases/NN-slug/` directory names for shifted phases. D-02 explicitly forbids moving phase dirs, so this divergence is an accepted tradeoff of the locked decision — but the plan MUST NOT trigger the health check's phase-dir warnings (health's `checkPhaseDirNaming` only validates the *format* `DIR_NAME_RE`, not ROADMAP cross-reference — verified health.js:55-65 — so no hard conflict, but be aware the dir names become stale for renumbered phases). Mitigation: prefer **append-only numbering** where possible (add at `max+1`), and only renumber when inserting/reordering in the middle is actually requested.
- **R2 — Fail-closed must gate ALL three stores.** A partial write (ROADMAP written, STATE error, or vice-versa) would corrupt drift. Because D-06 requires everything-in-one-commit, the plan must structure the tool as validate-in-memory → mutate a single `roadmapDoc` + derive STATE progress → then write both files → then one `commitArtifacts`. Each hard check short-circuits before ANY `_write`.
- **R3 — `active_phase` block (D-03).** reorder/remove must compare the target phase's `n` against `STATE.frontmatter.active_phase` (a number). Because active_phase may point at a phase that is also reordered by another action in the same call, the block check must run against the *pre-mutation* state consistently.
- **R4 — Removing shifts numbering for later phases.** Removal of a middle phase changes `completed_phases` (if the removed phase was Complete) and, under contiguous numbering, all subsequent `n`. `recomputeProgress` handles the count; the plan must decide-and-document the numbering consequence (OQ-1).
- **R5 — Mount/removal test churn.** Adding a plugin + tool + command increments fixed counters asserted in `test/mount.test.mjs`: `25 plugins` (lines 33, 132, 141), `30 tools` (lines 6, 145, 326), `27 commands` (lines 6, 146), and the PATCH_ROWS list in `test/helpers/mount-harness.mjs:23-48`. `test/tools.test.mjs` and `test/removal.test.mjs` (DEGR-05) iterate registered capabilities/plugins and will need a new case. The plan must update these to 26/31/28.

### Open Questions (must be RESOLVED before planning completes)
- **OQ-1 (RESOLVED by recommendation — planner must confirm): Renumbering scheme.** Recommendation: `add` assigns `n = max(phase.n)+1` (append, matches D-07 "add appends at the end"). `insert at N` and `reorder to index` reassign contiguous `n = index+1` across the array (keeps ROADMAP `#`, Progress table, and STATE progress internally consistent — they all derive from `phases` order). This satisfies D-02/D-07 and D-05's auto-heal; it accepts the R1 dir-name divergence documented explicitly in the plan. **Alternative rejected:** preserve original `n` after insert/reorder produces non-contiguous `#` numbers (breaks `stringifyRoadmap` zero-padded table readability and `max+1` add).
- **OQ-2 (RESOLVED by CONTEXT/verified): What identifies the target phase?** Use the numeric `phase` argument (matching every other `gsd_*` tool, e.g. `gsd_health phase: number`). `insert` also takes `at: number`; `reorder` takes `at`/`to` indices (0-based array index or 1-based phase `#`? — **planner discretion**, recommend 0-based array index since that is what "index" means in the array, mirroring D-07's "target index").
- **OQ-3 (RESOLVED): How toggling a Complete phase back to pending interacts with blocks.** D-07 allows `[x]` toggle; D-03 blocks reorder/remove of Complete phases. Toggling status is an *edit* (allowed), and once toggled to pending the phase becomes reorderable/removable. The plan should process status-toggle first so a later reorder/remove in the same call sees the toggled status — or document that each action validates independently. **Planner discretion, recommend: validate each action against the state as mutated by prior actions in the same call, fail-closed on the first hard failure.**

---

## Architectural Responsibility Map

| Capability | Tier | Placement |
|---|---|---|
| ROADMAP parse/stringify + Progress-table regeneration | **data (pure)** | Extend or reuse `lib/_shared.js` `parseRoadmap`/`stringifyRoadmap` (already round-trip). Add pure validation + renumbering helpers in the new plugin module (mirroring `_shared.js`/`_capabilities.js` "no ctx/no I/O" pattern) for direct unit testing. |
| REQ-ID existence check | **data (pure)** | `parseRequirements` in `_shared.js:239` + `s.readRequirements` in a pure helper wrapping the set build. |
| CRUD actions (add/insert/remove/reorder/edit) + validation invariants (D-04) | **domain** | New plugin's pure action/validate functions, returning an error or a mutated `roadmapDoc` + a `{phaseNum, message}` summary. Fail-closed: each function validates the proposed doc, returns `{ ok:false, error }` on hard failure. |
| STATE progress recompute | **data (integration)** | Call existing `s.recomputeProgress(cwd)` (state.js:871) — do NOT re-implement. |
| Active-phase / Complete-phase block guards (D-03, D-08) | **domain** | In the mutation orchestration, reading `STATE.frontmatter.active_phase` and each phase's status. |
| Atomic multi-file write + commit | **integration** | `ensurePhaseBranch` + `s.writeRoadmap` + `s.writeState` (or `recomputeProgress`) + `commitArtifacts` (with `opts.message` override), mirroring health/undo. |
| Tool execution boundary | **presentation** | `defineTool` registration with `parameters` for `action` enum + flags; argument parsing/`--yes` confirmation. |
| Slash command + capability | **presentation** | New `gsdPhaseManagement` capability row + `/gsd-phase-manage` command in `commands.js` COMMANDS array. |

Security note: **no** capability in this phase is security-sensitive (no auth, no secrets, no git credential handling — all git goes through the existing `gitFn` seam with argument arrays). Correct placement of the fail-closed validation in **domain** (before any write/commit in integration) is the critical guard; putting validation inside the commit path would be a **BLOCKER**.

---

## Validation Architecture

Mirrors the established deterministic-pure-JS + harness-test seams used by health/undo/gap-analysis/graphify. The goal is that each CLH-01 requirement (add/insert/remove/reorder/edit + integrity checks) is proven by tests, not by a live session.

*Unit tests (pure, no ctx/fs/git)* for an `_shared`-style or plugin-local pure module that takes a `roadmapDoc` (+ `reqIds` set + `{activePhase}`) and returns the mutated doc or a hard-fail error:
  - **add**: result has `max+1` phase, correct fields, appears in phase table AND `## Progress` rows after `stringifyRoadmap(out)`; requirements joined `" … "`.
  - **insert at N**: new phase lands at array index N; subsequent phases' `n` renumber (contig); round-trips through `parseRoadmap(stringifyRoadmap(doc))`.
  - **remove**: phase gone from both tables; progress counts change correctly (removing a `Complete` decrements `completed` after `recompute` — verified by the recompute formula).
  - **reorder**: order changed; shipped/in-flight phase target → hard error (D-03).
  - **edit**: name/goal/requirements/status toggle all round-trip; empty goal or zero requirements → hard error (D-04).
  - **invariants (D-04)**: unparseable ROADMAP → hard fail; unknown REQ-ID referenced → hard fail; duplicate slug; duplicate name; missing goal; empty requirements → each returns the specific error and leaves input doc unmutated (fail-closed).
  - **stringify round-trip**: `parseRoadmap(stringifyRoadmap(doc))` deep-equals `doc` (extends existing `_shared.test.mjs` coverage).
- *Integration/service tests* (FakeFs + fake-ctx, mirroring `test/mount.test.mjs` / `test/state.test.mjs` / `test/phase-tools-git.test.mjs`):
  - A full tool `execute` produces the expected ROADMAP text, `## Progress` table, and STATE `progress.{total_phases,completed_phases,percent}` matching the recompute formula after add/remove/insert/toggle.
  - Fail-closed: a call failing a hard check leaves ROADMAP.md and STATE.md byte-identical on disk.
  - `commitArtifacts` fires once with `.planning` staged (assert via fake gitFn capture).
  - `--yes` gate: removing the active phase or last non-shipped phase without `--yes` errors; with `--yes` proceeds (D-08).
- *Mount/registration tests*: `mount.test.mjs` counts updated to 26 plugins / 31 tools / 28 commands; `PATCH_ROWS` gains `gsd-phase-management`; `tools.test.mjs` asserts `gsd_phase` schema; `removal.test.mjs` proves retiring the plugin unregisters `gsd_phase` + `/gsd-phase-manage` (DEGR).

These directly map CLH-01's CRUD + integrity demands to executable checks; the plan must pair each action with at least one pure unit test and one integration test.

---

## Project Constraints (from conventions)

- **Plugin/package layout**: every loop-step/out-of-band surface is a subpath export in `package.json` `exports` (e.g. `"./health": { "default": "./lib/health.js" }`) wired into `cordis.patch.yml` as a plugin row with `{ id, name: '@dsh-gsd/bundle/<sub>' }`. A new plugin needs all three edits + `PATCH_ROWS` in `test/helpers/mount-harness.mjs`. [VERIFIED: package.json:80-96; cordis.patch.yml:95-103; mount-harness.mjs:23-48]
- **Capability discipline (DEGR-01/02/03)**: every tool surface publishes a capability via `ctx.provide(key, buildCapability(key))` whose descriptor lists `tools` and `commands`; the persona/runtime only advertises available steps. Adding `gsdPhaseManagement` keeps this invariant.
- **No-subagent rule**: this phase needs no fresh-context subagent (deterministic pure-JS + direct service calls), so the plugin injects `["gsdState", "tools"]` and declares **no** `subagents` coeffect (mirrors health.js:36-40).
- **Atomicity & fail-closed**: all phase tools route artefact writes through the existing git seam (`commitArtifacts`) on the phase-`N` feature branch; hard checks block the write *before* any `_write`/commit (D-06).
- **Out-of-band**: like undo/health, this tool does NOT advance the STATE loop position — it is a `role: "out-of-band"`, `order: NOT_LOOP_ORDERED` capability. It must not call `setActivePhase`/advance the step machine.
- **Testing gate**: `npm test` (`node --test test/*.test.mjs`) must stay green; fixed counters in mount.test.mjs must be brought in sync.

---

*Phase: 52-phase-management · CLH-01 · Gathered 2026-09-06*
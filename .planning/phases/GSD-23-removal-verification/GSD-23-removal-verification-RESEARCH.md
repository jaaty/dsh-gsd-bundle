I've completed the research. Note: I wrote the RESEARCH.md to disk at the target path, but per my instructions I'll also return the full contents below so the orchestrator can persist it.

---

# Phase 23: removal-verification — Research

**Researcher:** gsd-phase-researcher
**Date:** 2026-08-29
**Phase goal:** Add an automated per-plugin removal test proving every single step plugin can be retired with its effects reverted and the remaining loop still functional end-to-end. (DEGR-05)

---

## 1. Domain analysis

### 1.1 What this phase actually is: a test-only phase

DEGR-05 is a *verification* requirement, not a feature. The production capability model, the render/routing helpers, and the reactive subset-mount behaviour it must prove already exist and are already unit-tested (DEGR-01..04 shipped in phases 21–22). This phase adds **one new test file** (`test/removal.test.mjs`) and **extracts a shared harness** (`test/helpers/mount-harness.mjs`) so the new suite and the existing `test/mount.test.mjs` share a single source of the fake-ctx mount machinery (D-07). The only production change permitted is the harness extraction; no new runtime apply-then-revert/dispose machinery is introduced (D-03).

- [VERIFIED: lib/_capabilities.js:1-197] The capability descriptor model (`ROLES`, `CAPABILITY_KEYS`, `TABLE`, `buildCapability`, `capabilityForTool`) is a plain-ESM, no-ctx, no-I/O module — the single source of truth for the capability surface.
- [VERIFIED: lib/_render.js:1-248] The render/routing helpers (`loopSteps`, `effectiveRoutableStep`, `renderAvailableSteps`, `renderPersonaBody`, `renderNoLoopNotice`, `capabilityKeyForNextAction`) are pure functions over a descriptors array — directly unit-testable against arbitrary subsets.
- [VERIFIED: test/mount.test.mjs:429-625] The phase-22 reactive subset-mount suite already proves the *partial-loop* and *zero-loop* degradation; the per-plugin removal suite is the exhaustive single-step version of the same contract. Line 436 explicitly defers it: *"The full per-plugin removal suite stays phase 23 (DEGR-05)."*

### 1.2 The removal matrix: exactly the 5 `role:"step"` plugins (D-01)

The matrix targets exactly the 5 loop-step capabilities. Confirmed from the descriptor table:

- [VERIFIED: lib/_capabilities.js:73-149] `gsdDiscuss` (order 10), `gsdPlan` (order 20), `gsdExecute` (order 30), `gsdVerify` (order 40), `gsdShip` (order 50) all have `role: "step"`.
- [VERIFIED: lib/_capabilities.js:13] `ROLES = ["step", "optional", "alternate", "onboarding", "orient", "jobs"]` — the `step` role is the loop-chain marker.
- [VERIFIED: test/_capabilities.test.mjs:68-77] The role mapping is already asserted: exactly these 5 are `step`; `gsdUi` is `optional`, `gsdQuick` is `alternate`, `gsdMapCodebase` is `onboarding`, `gsdOrient` is `orient`, `gsdJobs` is `jobs`.

**Data-driven matrix (D-02).** The harness must be generic, not hardcoded to the 5. The matrix is derived from a single table: `CAPABILITY_KEYS` filtered to `role === "step"` (the capability set) crossed with the `PATCH_ROWS` table (the plugin-row set). The capability→patch-row-sub mapping is derivable: each step capability's `step` label matches the patch row `sub` (`gsdDiscuss`→`discuss`, `gsdPlan`→`plan`, `gsdExecute`→`execute`, `gsdVerify`→`verify`, `gsdShip`→`ship`). [VERIFIED: test/mount.test.mjs:24-37] `PATCH_ROWS` maps `{id, sub}` for all 12 rows; [VERIFIED: cordis.patch.yml:47-60] the 5 step rows are `gsd-discuss`, `gsd-plan`, `gsd-execute`, `gsd-verify`, `gsd-ship`.

### 1.3 The six "effects-reverted" surfaces (D-04)

For each retired step plugin, the test must assert all six surfaces are absent. Each is directly assertable with the existing fake-ctx harness:

| # | Surface | Assertion | Proven pattern |
|---|---------|-----------|----------------|
| 1 | Capability service in `ctx.provide` store | `!ctx.provided.has("<CapKey>")` | [VERIFIED: test/mount.test.mjs:507-509] absent-key assertion |
| 2 | Tool(s) in `ctx.tools` | `!ctx.tools.some(t => t.name === "<tool>")` | [VERIFIED: test/mount.test.mjs:523-525] absent-tool assertion |
| 3 | Slash command unregistered | `!ctx.commands.some(c => c.name === "<cmd>")` | [VERIFIED: test/mount.test.mjs:260-286] DEGR-03 absent-command case |
| 4 | Persona body omits step paragraph + never names its tools | `assertNoAbsentToolToken(ctx, body, ...)` | [VERIFIED: test/mount.test.mjs:487-496, 512-527] |
| 5 | Runtime-context snapshot omits step from Available-steps | snapshot text lacks the step name | [VERIFIED: test/mount.test.mjs:530-536] |
| 6 | `gsd_status` rewrites a stored `next_action` targeting it | `Next action: <nearest-present>-phase` or no-loop notice | [VERIFIED: test/mount.test.mjs:539-566] |

**Surface 3 mechanism (command unregistration).** The commands plugin registers each `/gsd-*` command from its own sub-fiber whose `inject` pairs the owning capability with the host `commands` service. When the capability is absent, the sub-fiber stays inactive and the command is never registered. [VERIFIED: lib/commands.js:200-216] `ctx.inject([capKey, "commands"], ...)`; [VERIFIED: test/mount.test.mjs:111-118] the fake `ctx.inject` returns a no-op disposer when any non-`commands` inject key is missing from the provided store. This is the exact DEGR-03 pattern to reuse.

**Surface 6 routing semantics (D-06).** The rewrite is *reused*, never redefined. `effectiveRoutableStep(nextAction, descriptors)` returns the first present loop step with strictly greater order than the would-be step, else `null` (→ no-loop notice). [VERIFIED: lib/_render.js:103-114]. Expected rewrite outcomes for each single-step retirement (all other plugins, including `ui`/`quick`, stay mounted):

| Retired | stored `next_action` | nearest greater present loop step | gsd_status shows |
|---------|----------------------|-----------------------------------|------------------|
| `gsdDiscuss` (10) | `discuss-phase` | `gsdUi` (15) | `Next action: ui-phase` |
| `gsdPlan` (20) | `plan-phase` | `gsdExecute` (30) | `Next action: execute-phase` |
| `gsdExecute` (30) | `execute-phase` | `gsdVerify` (40) | `Next action: verify-phase` |
| `gsdVerify` (40) | `verify-phase` | `gsdShip` (50) | `Next action: ship-phase` |
| `gsdShip` (50) | `ship-phase` | none greater | `Next action: no available loop step` |

[VERIFIED: lib/_render.js:103-114] `effectiveRoutableStep` returns `loop.find((d) => d.order > targetOrder) || null`; [VERIFIED: lib/_render.js:118] `NO_LOOP_NOTICE = "no available loop step"`. Note `gsdUi` (order 15) and `gsdQuick` (order 25) remain mounted in every retirement, so the "nearest greater" for `gsdDiscuss` is `gsdUi`, not `gsdPlan`.

### 1.4 End-to-end functional depth (D-05): the smoke-call surface

D-05 requires, for each retirement, that the *remaining* offline-runnable step tools still execute successfully against a bootstrapped FakeFs project, producing their artefact "where allowed". `gsd_execute` and `gsd_ship` are asserted **present + registered + schema-sound only** (their git/gh/subagent paths are not driven offline). The offline-runnable step tools are `gsd_discuss`, `gsd_plan`, `gsd_verify`.

**`gsd_discuss` smoke is fully offline.** It writes CONTEXT.md directly via `gsdState.writeArtifact`; its git calls (`ensurePhaseBranch`, `commitArtifacts`) degrade gracefully when git is unavailable. [VERIFIED: lib/discuss.js:75-159] calls `ensurePhaseBranch` then `commitArtifacts`; [VERIFIED: lib/_git-artifacts.js:64-73] `ensurePhaseBranch` returns `{action:"noop", warning}` on no-git; [VERIFIED: lib/_git-artifacts.js:172-198] `commitArtifacts` returns `{committed:false, warning}` on no-git. So the smoke call returns `"Discuss complete for phase N..."` and writes CONTEXT.md on the FakeFs without throwing.

**`gsd_plan` / `gsd_verify` smoke need a *rich* fake subagents service.** Both spawn fresh-context subagents via `ctx.get("subagents")` and require the subagent to *write* the artefact to the FakeFs:
- [VERIFIED: lib/plan.js:88-92] the researcher output must be ≥ 50 chars or it returns "researcher returned no usable RESEARCH.md"; [VERIFIED: lib/plan.js:122-130] the planner must write PLAN.md files or `listPlans` returns empty → "planner produced no PLAN.md files".
- [VERIFIED: lib/verify.js:53-56] `gsd_verify` requires plans to exist AND all to have summaries (`has_summary`); [VERIFIED: lib/verify.js:87-96] the verifier subagent must write VERIFICATION.md or the status defaults to `gaps_found` (still returns a route string, never throws).

**The rich fake subagents pattern is already proven in-repo.** [VERIFIED: test/tools.test.mjs:117-207] `makeSubagents()` dispatches on the spawn `label`: `"planner"` writes `FENCED_PLAN` to the FakeFs and returns `"## PLANNING COMPLETE"`; `"plan-checker"` returns `"## VERIFICATION PASSED"`; `"plan research"` returns a long RESEARCH text; `"verify"` writes `VERIFICATION_PASSED`. This is the exact precedent the removal harness must reuse (parametrized to the bootstrapped phase dir). The mount harness's current `makeSubagents` (mount.test.mjs:47-54) is the *simple* stub (returns `"done"`, writes nothing) — insufficient for plan/verify smoke, so the extracted harness must either carry the rich version or allow the removal test to override `ctx.get("subagents")`.

**Bootstrap sequencing.** Each retirement needs the artefacts that the *absent* tools would have produced, pre-seeded via `gsdState.writeArtifact`:
- `gsd_plan` smoke needs CONTEXT.md present (else returns "no CONTEXT.md"). [VERIFIED: lib/plan.js:59-60]
- `gsd_verify` smoke needs PLAN-01 + SUMMARY-01 present. [VERIFIED: lib/verify.js:53-56]
- Artefact naming: `<base>-CONTEXT.md`, `<base>-<PP>-PLAN.md`, `<base>-<PP>-SUMMARY.md`, `<base>-VERIFICATION.md`. [VERIFIED: lib/state.js:499-504]
- Phase dir for the bootstrapped project: `buildProject` creates phase 1 named "auth" → dir `01-auth`. [VERIFIED: test/helpers/project.mjs:90-99]; [VERIFIED: lib/state.js:475-482] `_phaseDirName` = `<project_code>-<NN>-<slug>` (no project_code → `01-auth`).

The "where allowed" qualifier in D-05 gives the planner latitude: for each retirement, smoke the remaining step tools, pre-seeding whatever the absent tools would have produced. Every retirement leaves ≥ 2 offline-runnable step tools (retire `gsdPlan` → `gsd_discuss`+`gsd_verify`; retire `gsdVerify` → `gsd_discuss`+`gsd_plan`; etc.), so there is no degenerate case.

### 1.5 Harness extraction (D-07)

The shared fake-ctx mount harness must be extracted from `test/mount.test.mjs` into `test/helpers/mount-harness.mjs`, imported by both `test/mount.test.mjs` and `test/removal.test.mjs`. The members to extract (with current line ranges):

- [VERIFIED: test/mount.test.mjs:24-37] `PATCH_ROWS` (the 12-row table)
- [VERIFIED: test/mount.test.mjs:47-54] `makeSubagents` (simple stub — see 1.4 for the rich variant)
- [VERIFIED: test/mount.test.mjs:59-120] `makeMountCtx(fs)` (fake-ctx host: fs/tools/commands/sections/contexts/provide/get/effect/inject)
- [VERIFIED: test/mount.test.mjs:140-153] `applySubset(ctx, subs, config)`
- [VERIFIED: test/mount.test.mjs:444-449] `mountSubset(subs)` (fresh FakeFs + ctx + applySubset)
- [VERIFIED: test/mount.test.mjs:452-462] `personaBody(ctx, cwd)` / `snapshot(ctx, cwd)` helpers
- [VERIFIED: test/mount.test.mjs:466-475] `initProject(ctx)` (gsd_init smoke)
- [VERIFIED: test/mount.test.mjs:478-483] `presentTools(ctx)`
- [VERIFIED: test/mount.test.mjs:487-496] `assertNoAbsentToolToken(ctx, text, label)`
- [VERIFIED: test/mount.test.mjs:19, 112-115] `CWD` and the `exec` object shape

**Extraction risk.** The extraction is a refactor of a passing 373-test suite. The exported helper signatures must be byte-identical to the current in-file definitions so `test/mount.test.mjs` keeps passing unchanged. The `gsdStateSvc` module-level handle (mount.test.mjs:42) and the `makeSubagents` closure over the module-level `fs` (tools.test.mjs) are the two stateful subtleties the extraction must preserve.

---

## 2. Package legitimacy

**No new dependencies are required for this phase.** The removal test and the harness extraction use only:
- Node built-ins: `node:test`, `node:assert/strict`, `node:fs/promises`, `node:path`. [VERIFIED: test/mount.test.mjs:9-13]
- Existing in-repo helpers: `test/helpers/fake-fs.mjs` (`FakeFs`), `test/helpers/project.mjs` (`buildProject`, `FENCED_PLAN`, `VERIFICATION_PASSED`). [VERIFIED: test/helpers/fake-fs.mjs:1-109], [VERIFIED: test/helpers/project.mjs:1-99]
- Self-referencing package imports `@dsh-gsd/bundle/<sub>` (works via `package.json` `exports`). [VERIFIED: package.json:10-51], [VERIFIED: test/mount.test.mjs:125, 144]
- Peer deps already used and tested: `@deepseek-ai/dsh-tools` (`defineTool`), `@deepseek-ai/dsh-llm` (`createUserMessage`). [VERIFIED: package.json:63-68], [VERIFIED: lib/discuss.js:8], [VERIFIED: lib/commands.js:14]

The project's zero-dependency invariant is explicit: [VERIFIED: test/mount.test.mjs:155-158] "NO YAML dependency — per D-05/research OQ-1, preserve the zero-dep invariant". The removal test must not introduce any new package. No registry lookups are needed because no new package is proposed.

---

## 3. Risks and Open Questions

### OQ-1 — Smoke-call depth for `gsd_plan` / `gsd_verify` (RESOLVED)
**Question:** D-05 says the remaining offline-runnable step tools must "produce their artefact (PLAN.md / VERIFICATION.md) where allowed". `gsd_plan` and `gsd_verify` spawn subagents that must *write* the artefact to the FakeFs. Can this be done offline?
**Resolution:** Yes. The rich fake subagents pattern is already proven in-repo at [VERIFIED: test/tools.test.mjs:117-207] — a `start()` that dispatches on the spawn `label` and writes `FENCED_PLAN` / `VERIFICATION_PASSED` to the FakeFs. The removal harness reuses this pattern, parametrized to the bootstrapped phase dir. `gsd_discuss` needs no subagents (writes CONTEXT.md directly; git degrades gracefully). **Recommendation:** the extracted `makeMountCtx` should accept an optional subagents service (defaulting to the simple stub) so the removal test injects the rich one; or the harness carries the rich version directly. This is a planning decision, not a blocker.

### OQ-2 — Bootstrap sequencing per retirement (RESOLVED)
**Question:** Each retirement's smoke calls need artefacts the absent tools would have produced (CONTEXT for `gsd_plan`; PLAN+SUMMARY for `gsd_verify`). How are these seeded?
**Resolution:** Pre-seed via `gsdState.writeArtifact(cwd, phase, "CONTEXT" | "PLAN-01" | "SUMMARY-01", ...)` on the bootstrapped project, mirroring [VERIFIED: test/tools.test.mjs:504-525]. The "where allowed" qualifier in D-05 lets the planner scope which smoke calls run per retirement. **Recommendation:** for each retirement, smoke the remaining step tools in dependency order (discuss → plan → verify), pre-seeding only what the absent tool would have produced. Planning concern, not a blocker.

### OQ-3 — Harness extraction must not break the 373 passing tests (RESOLVED)
**Question:** Extracting `makeMountCtx`/`applySubset`/`mountSubset`/`assertNoAbsentToolToken` etc. from `test/mount.test.mjs` into `test/helpers/mount-harness.mjs` is a refactor of a passing suite. How is regression prevented?
**Resolution:** Export the helpers with identical signatures and keep `test/mount.test.mjs` importing them (replacing the in-file definitions with imports). The baseline is 373 pass / 0 fail [VERIFIED: `npm test` run this session, exit 0]. The phase's own validation gate is that `npm test` still passes after the extraction. **Recommendation:** the extraction is a single atomic commit, verified by the full suite before the removal test is added. Not a blocker.

### OQ-4 — Data-driven matrix mapping (RESOLVED)
**Question:** D-02 requires the matrix to be generic so "any plugin row can be added with no structural change". How is the capability→plugin-row mapping derived?
**Resolution:** Derive the matrix from `CAPABILITY_KEYS.filter(d => buildCapability(d).role === "step")` for the capability set, and map each step capability to its patch-row `sub` via the `PATCH_ROWS` table (the `sub` matches the capability `step` label). [VERIFIED: lib/_capabilities.js:22-33, 73-149], [VERIFIED: test/mount.test.mjs:24-37]. The harness exposes a single `retirementMatrix()` that returns `[{capKey, sub, tool, command}]` so adding a row to `PATCH_ROWS`/`CAPABILITY_KEYS` automatically extends the suite. Not a blocker.

### Risk R-1 — `gsd_verify` smoke requires pre-seeded PLAN+SUMMARY
`gsd_verify` returns early (no throw) if no plans or missing summaries exist. [VERIFIED: lib/verify.js:53-56]. The smoke must pre-seed `PLAN-01` + `SUMMARY-01` or the "producing VERIFICATION.md" assertion silently no-ops. Mitigation: assert the artefact file exists after the smoke call, not just that it didn't throw.

### Risk R-2 — `gsd_plan` smoke requires CONTEXT + a ≥50-char researcher output
`gsd_plan` returns early without CONTEXT, and the researcher output must be ≥ 50 chars. [VERIFIED: lib/plan.js:59-60, 88-92]. Mitigation: pre-seed CONTEXT and use the rich fake subagents (which return a long RESEARCH text).

### Risk R-3 — `ctx.effect` must invoke its callback synchronously
The fake `ctx.effect` must run `fn()` synchronously or `gsd-commands` captures zero commands. [VERIFIED: test/mount.test.mjs:100-103]. The extracted harness must preserve this exact behaviour.

---

## 4. Architectural Responsibility Map

This phase is **test-layer only**; it adds no production capability. The capabilities it exercises map to existing tiers:

| Capability | Tier | Where it lives | Phase-23 role |
|------------|------|----------------|---------------|
| Capability descriptor model (`buildCapability`, `CAPABILITY_KEYS`, `TABLE`) | **Domain** | `lib/_capabilities.js` | Matrix source (D-01/D-02); asserted via `ctx.provided` |
| Render/routing helpers (`loopSteps`, `effectiveRoutableStep`, `renderAvailableSteps`, `renderPersonaBody`) | **Domain** | `lib/_render.js` | Asserted directly for each single-step removal (D-05/D-06) |
| Artefact model (`GsdState`, `writeArtifact`, `setActivePhase`, `phaseDirAndBase`) | **Data** | `lib/state.js` | Bootstraps the FakeFs project; pre-seeds artefacts |
| Fake-ctx mount harness (`makeMountCtx`, `applySubset`, `mountSubset`, `assertNoAbsentToolToken`) | **Integration (test)** | `test/helpers/mount-harness.mjs` (new) | Simulates the Cordis subset-mount; the shared source (D-07) |
| Step plugins (`discuss`/`plan`/`execute`/`verify`/`ship`) | **Integration** | `lib/*.js` | The subjects under test; retired one at a time |
| Slash-command layer (`commands`) | **Integration** | `lib/commands.js` | Surface-3 command-unregistration proof (DEGR-03) |

**Security-sensitive note:** none of the six effects-reverted surfaces is security-sensitive in a way that would be a tier violation — they are all read-time presentation/registration assertions over the fake-ctx store. The only "integration" surface that touches real external systems (git/gh/subagents) is explicitly *not* driven offline (D-05: execute/ship are present+registered only). No capability is placed in the wrong tier.

---

## 5. Validation Architecture

The phase's own validation is the automated test suite. The removal test proves DEGR-05; the harness extraction must not regress the existing suite.

| Behaviour | Automated check | Artefact/assertion |
|-----------|-----------------|--------------------|
| Harness extraction is non-breaking | `npm test` (node --test test/*.test.mjs) | All 373 existing tests still pass after `test/helpers/mount-harness.mjs` extraction |
| Per-plugin removal matrix (DEGR-05) | `test/removal.test.mjs` | For each of the 5 step capabilities: 6 effects-reverted surfaces + functional depth |
| Surface 1 — capability absent | `!ctx.provided.has(capKey)` | [VERIFIED: test/mount.test.mjs:507-509] |
| Surface 2 — tool absent | `!ctx.tools.some(t => t.name === tool)` | [VERIFIED: test/mount.test.mjs:523-525] |
| Surface 3 — command unregistered | `!ctx.commands.some(c => c.name === cmd)` | [VERIFIED: test/mount.test.mjs:260-286] |
| Surface 4 — persona omits step + no absent-tool token | `assertNoAbsentToolToken(ctx, body, ...)` | [VERIFIED: test/mount.test.mjs:487-496] |
| Surface 5 — snapshot omits step | snapshot text lacks the step name | [VERIFIED: test/mount.test.mjs:530-536] |
| Surface 6 — gsd_status rewrites next_action | `Next action: <nearest>-phase` or no-loop | [VERIFIED: test/mount.test.mjs:539-566] |
| Functional depth — remaining step tools smoke | `gsd_discuss`/`gsd_plan`/`gsd_verify` execute against bootstrapped FakeFs project | CONTEXT.md / PLAN.md / VERIFICATION.md written (assert file exists) |
| execute/ship present+registered+schema-sound | tool present, `parameters` object, `output.schema` | [VERIFIED: test/mount.test.mjs:415-426] |

**Nyquist/coverage gate:** the removal test must cover all 5 step capabilities (not a sample), all 6 effects-reverted surfaces per capability, and the smoke-call depth for every remaining offline-runnable step tool. The matrix is data-driven (D-02) so coverage is structural, not enumerated by hand.

---

## 6. Project Constraints (from project conventions)

- **Offline-only test philosophy.** FakeFs + fake-ctx, no live DSH boot, no LLM, no git/gh. [VERIFIED: test/mount.test.mjs:7], [VERIFIED: CONTEXT D-08]. The removal test stays offline; execute/ship git/gh/subagent paths are present+registered assertions only.
- **Zero-dependency invariant.** No new packages; no YAML parser. [VERIFIED: test/mount.test.mjs:155-158]. The removal test uses only node built-ins + existing helpers.
- **Test command.** `npm test` = `node --test test/*.test.mjs`. [VERIFIED: package.json:8]. New `test/removal.test.mjs` is auto-discovered by the glob.
- **Plain-ESM, no-ctx, no-I/O for pure helpers.** The render/capability helpers are pure; the removal test asserts them directly. [VERIFIED: lib/_render.js:1-8], [VERIFIED: lib/_capabilities.js:1-3].
- **Self-referencing package imports.** `@dsh-gsd/bundle/<sub>` resolves via `package.json` `exports`. [VERIFIED: package.json:10-51].
- **Single source of truth.** The matrix derives from `CAPABILITY_KEYS` + `PATCH_ROWS` (D-02); the harness is shared between mount and removal tests (D-07) so it never drifts.
- **Routing semantics reused, never redefined (D-06).** The removal test asserts the already-defined `effectiveRoutableStep` graceful degradation; it does not add new routing logic.

---

**Research complete.** All four open questions are marked RESOLVED with concrete, in-repo-verified resolutions. The phase is ready for planning.
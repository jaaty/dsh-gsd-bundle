---
phase: 58-node-repair
verified: 2026-09-07T21:52:27-07:00
status: passed
score: 38/38 must-haves verified
behavior_unverified: 0
overrides_applied: 0
---

# Phase 58: node-repair Verification Report

**Goal:** Automatically recover a plan whose verification failed instead of stopping. (CLH-08)
**Mode:** First verification (no prior VERIFICATION.md existed). All evidence gathered fresh from the working tree this session; SUMMARY.md claims were treated as claims only and re-proven by code inspection, greps, export smokes, and named behavioral test runs.

## Goal Achievement → Observable Truths

Roadmap truth + every PLAN frontmatter truth, each checked against the implementation (lib/repair.js, lib/verify.js, lib/autonomous.js), not against the summaries.

| # | Truth | Status | Evidence |
|---|---|---|---|
| R1 | A plan whose verification failed is automatically recovered instead of stopping (CLH-08) | ✓ VERIFIED | `gsd_repair` implemented end-to-end (lib/repair.js:270-404); offline integration test drives the REAL plan/execute/verify tools from a seeded `gaps_found` to `status: passed` in 2 rounds (test/repair.test.mjs V15, passing); autonomous continues the milestone on recovery ((f-recovery), passing) |
| 01-1 | gaps_found → rounds of plan(gaps)→execute(gapsOnly)→verify(gaps) in strict order, delegated through registered tools, not forked (D-06/D-08) | ✓ VERIFIED | runOneRound (lib/repair.js:109-200) delegates via `findToolIn(ctx.tools, …)` + `tool.execute(…)`; test deepEquals capture order `[gsd_plan, gsd_execute, gsd_verify]` with args exactly `{phase:1,gaps:true}/{phase:1,gapsOnly:true}/{phase:1,gaps:true}`; static assertions prove no forked prompts/inline git |
| 01-2 | already-passed → success no-op, zero delegate calls (D-05) | ✓ VERIFIED | lib/repair.js:282-289 returns before any delegate/write/commit; test "no-op on passed" asserts capture 0 AND no `<NN>-REPAIR.md` written |
| 01-3 | rounds 0/3/non-integer → stop naming the 1..2 domain before any delegate call (D-03) | ✓ VERIFIED | Tool-layer check (lib/repair.js:434-436, `(got N)` suffix) + defensive guard in runRepairRounds (:274-277), both referencing the single `ROUNDS_DOMAIN_MSG` constant (derived from `REPAIR_ROUND_BUDGET` per CR-08); test asserts all three values fail with capture 0 |
| 01-4 | human_needed / missing-file / unparseable each stop with a DISTINCT cause, zero delegates (D-04) | ✓ VERIFIED | Five-way reader `readVerificationStatus` (lib/repair.js:86-100) deliberately does not inherit verify's optimistic missing→gaps_found default; three distinct cause strings (repair.js:296-300) + pairwise-distinctness test, each with capture 0 |
| 01-5 | Every exit that enters a repair attempt writes `<NN>-REPAIR.md` (## Round N per round + ## Stop when stopping) and commits via commitArtifacts scope "repair"; the D-05 no-op and D-03 invalid-rounds stops write and commit nothing (D-10) | ✓ VERIFIED | buildRepairDoc/roundSection/stopSection (repair.js:211-254) + single `commitRepair` site (:260-262, `scope: "repair"` exactly once); CR-04 epilogue lands the log even when a delegate throws mid-round; tests prove creation on round 1, append across rounds and invocations (frontmatter rounds_run/final_status read back via parseFrontmatter), and a `## Stop` section on stops |
| 01-6 | Mount surface 37 tools / 34 commands / 28 capability keys / 27 patch rows; names registered; ./repair resolves through exports; gsdRepair descriptor role out-of-band order -1 (D-01) | ✓ VERIFIED | test/mount.test.mjs 47/47 (counts at :149/:150/:161/:217/:330, DEGR-03 withdraw count 33 at :192); descriptor row lib/_capabilities.js:367-377 (`role: "out-of-band"`, `order: NOT_LOOP_ORDERED`); `import('@dsh-gsd/bundle/repair')` resolves → `gsd-repair` (ran live) |
| 01-7 | Repair never advances STATE itself (D-01) | ✓ VERIFIED | grep `setActivePhase\|completePhase\|setStep(` in lib/repair.js = 0; behavioral STATE-immobility test (no-op / stop-with-cause / fail-loud exits leave STATE frontmatter byte-identical) |
| 02-1 | verify's gaps_found route names gsd_repair (description + route table + header comment), recommend-only (D-02) | ✓ VERIFIED | lib/verify.js:6-7 (header), :53 (description), :141 (route table); no `./repair.js` import; behavioral test "gaps_found route text recommends gsd_repair and does not claim repair ran (D-02)" + static no-import/no-lookup assertion, both passing |
| 02-2 | autonomous on gaps_found runs bounded repair via shared runRepairRounds (default 2, no override) and CONTINUES on recovery (D-09) | ✓ VERIFIED | lib/autonomous.js:281-302 (no rounds override passed; recovery pushes `passed (recovered via N repair round(s))` and the loop continues); test (f-recovery) asserts p2's autopilot spawns after p1 recovers |
| 02-3 | autonomous hard-stops with the REAL cause: budget-exhaustion wording only on genuine exhaustion; early-stop cause folded verbatim incl. any GSD_AWAITING_HUMAN marker (D-09/D-07/D-11/P5) | ✓ VERIFIED | lib/autonomous.js:303-328 classifies via the shared `BUDGET_EXHAUSTED_PHRASE` symbol (CR-05), folds early stops as `repair stopped early — <cause>`; tests (f) exhaustion and (f-early) marker-fidelity both pass |
| 02-4 | human_needed / missing statuses in autonomous stop immediately, zero repair delegate calls (D-04) | ✓ VERIFIED | lib/autonomous.js:329-334 keeps the original immediate-stop path; missing-VERIFICATION test strengthened with zero planner/executor/verifier spawns |
| 02-5 | buildAutopilotPrompt byte-unchanged (D-09/OQ-8) | ✓ VERIFIED | grep "do not call gsd_ship" = 1; prompt unit tests pass unmodified |
| 03-1 | Offline suite proves the trigger gate (D-04/D-05) | ✓ VERIFIED | test/repair.test.mjs suite 1: 20/20 pass, incl. no-op, three distinct gate stops, pairwise-distinctness |
| 03-2 | Offline suite proves the delegation contract and fail-loud missing delegate (D-06/V5) | ✓ VERIFIED | capture deepEqual on order+args; `assert.rejects(/gsd_plan tool not registered/)` test passes |
| 03-3 | Offline suite proves the budget: default 2, rounds:1 honored, invalid values fail loud, exhaustion stops, no blind retry (D-03/D-07/D-11) | ✓ VERIFIED | rounds-validation test + budget-exhaustion test (exactly 2 rounds of each delegate, third never starts) + checkpoint test (execute ×1, verify ×0) all pass |
| 03-4 | Offline suite proves oracles + artefacts: no-fix-plan stop with the plan tool's real cause; verbatim marker surfacing; REPAIR.md accumulation; scope-repair seam; no-STATE/no-fork/no-raw-fs statics (D-10/D-11/D-01/D-08/D-12) | ✓ VERIFIED | suite 2 + suite 3 (source statics) all pass; marker asserted byte-identical against `awaitingMarker()` from lib/_shared.js |
| 03-5 | Full-surface integration through the REAL delegate tools recovers a seeded gaps_found phase end-to-end (V15) | ✓ VERIFIED | test "seeded gaps → two rounds → status passed end-to-end with the real plan/execute/verify tools" passes; asserts final VERIFICATION `/status: passed/`, fix plans + summaries exist, REPAIR.md `final_status: passed`, researchSpawns === 1 (OQ-9) |

## Score

**38/38 must-haves verified** — 18/18 truths (1 roadmap + 7 plan-01 + 5 plan-02 + 5 plan-03), 7/7 artifacts substantive, 13/13 key links wired. `behavior_unverified: 0` — every behavior-dependent truth has a passing named behavioral test. No FAILED truths, no MISSING/STUB artifacts, no NOT_WIRED links, no blocker anti-patterns, no human-verification items → **status: passed**.

## Deferred Items

Filtered against later milestone phases (only phase 59 review-fix-companion/CLH-09 remains; none of these map to it — all are recorded future candidates, none is a gap of this phase):

- **`/gsd-route` "repair" phrase still routes to `gsd_health`** (lib/_route.js:173) — explicitly out of the locked domain (CONTEXT scopes routing-text changes to gsd_verify; RESEARCH OQ-5/R5). Documented deferred follow-up; a `gsd-repair` exact-name phrase can be added later without schema change.
- **Auto-repair of other failure classes** (code-review BLOCKERs, plan-checker 3-iteration failures, ship-gate failures) — CONTEXT out-of-scope/deferred.
- **Config-driven repair budget** (`workflow.max_repair_rounds`) — deferred; hard-coded `REPAIR_ROUND_BUDGET = 2` (D-03).
- **Repair across milestone boundaries / concurrent multi-window phases** — CONTEXT out-of-scope.

## Required Artifacts

| Artifact | Exists | Substantive | Wired | Notes |
|---|---|---|---|---|
| lib/repair.js | ✓ | ✓ 448 lines (≥150); exports name/inject/apply/runRepairRounds/readVerificationStatus/REPAIR_ROUND_BUDGET/ROUNDS_DOMAIN_MSG (+ BUDGET_EXHAUSTED_PHRASE, CR-05); import smoke prints `repair module ok` | ✓ | Five-way status reader, strict-order round, budget loop, REPAIR.md doc builder, single commit site |
| lib/_capabilities.js | ✓ | ✓ 425 lines (≥420); gsdRepair in CAPABILITY_KEYS (:62) + TABLE row (:367-377) | ✓ | `ctx.provide("gsdRepair", buildCapability("gsdRepair"))` in repair.js:413 |
| lib/commands.js | ✓ | ✓ 493 lines (≥490); /gsd-repair entry (:428-441) with hint `<N> [--rounds 1|2]` and `--rounds` flag parsing | ✓ | Paired to gsdRepair via the descriptor (no pairing code needed) |
| lib/verify.js | ✓ | ✓ 159 lines (≥148); exports + runMempalaceCaptureOnVerify; all three gaps_found routing surfaces name gsd_repair | ✓ | Recommend-only: no repair import/lookup (statically asserted in test/tools.test.mjs) |
| lib/autonomous.js | ✓ | ✓ 411 lines (≥355); exports discoverPhases/buildAutoContext/buildAutopilotPrompt intact | ✓ | One-way `./repair.js` import (:31); gaps_found → repair → re-read → continue/classify |
| test/repair.test.mjs | ✓ | ✓ 545 lines (≥280); 20 tests / 4 describes, all passing | ✓ | Covers V1–V10/V14/V15 incl. real-delegate integration |
| test/autonomous.test.mjs | ✓ | ✓ 579 lines (≥400); (f) rewritten, (f-recovery)/(f-early) added, missing test strengthened | ✓ | 17/17 pass |

Supporting bump files all verified: package.json `./repair` export (:113, resolves via self-reference import — ran live), cordis.patch.yml gsd-repair row (:160-161) with house-style comment, test/helpers/mount-harness.mjs PATCH_ROWS row (:45), test/mount.test.mjs + test/_capabilities.test.mjs + test/render.test.mjs (deviation file) counts/names all green.

## Key Link Verification

| From | To | Via | Status |
|---|---|---|---|
| lib/repair.js | plan/execute/verify tools | In-process delegation via dual-shape tool lookup + `tool.execute(args, exec)` | **WIRED** — see note |
| lib/repair.js | lib/_git-artifacts.js | `commitArtifacts(… { scope: "repair", … })` exactly once (repair.js:261), injectable gitFn | **WIRED** |
| lib/repair.js | lib/_shared.js | Reuses `matchesGapClosure` (import, ×4 uses, 0 reimplementations), `parseFrontmatter`, `zeroPad`, `findToolIn` | **WIRED** |
| lib/repair.js | lib/state.js | REPAIR.md read-modify-write via `s.writeArtifact(cwd, phaseNum, "REPAIR", …)` (:303, :326); no `node:fs/promises` | **WIRED** |
| lib/_capabilities.js | lib/repair.js | gsdRepair descriptor row + `ctx.provide("gsdRepair", …)` | **WIRED** |
| package.json | lib/repair.js | `"./repair"` export resolves + dynamic-imports (verified live) | **WIRED** |
| cordis.patch.yml | package.json | Insert row `gsd-repair → '@dsh-gsd/bundle/repair'`, aligned with PATCH_ROWS | **WIRED** |
| lib/autonomous.js | lib/repair.js | `import { runRepairRounds, REPAIR_ROUND_BUDGET, BUDGET_EXHAUSTED_PHRASE } from "./repair.js"` (:31); no reverse import (grep 0) | **WIRED** |
| lib/verify.js | gsd_repair surface | Named in routing text only (3 sites); no repair import/lookup (D-02) | **WIRED** |
| lib/autonomous.js | test/autonomous.test.mjs | (f)/(f-recovery)/(f-early) prove delegates really spawn and the stop classification | **WIRED** (tests pass) |
| test/repair.test.mjs | lib/repair.js | `from "../lib/repair.js"` + drives the real tool execute | **WIRED** |
| test/repair.test.mjs | lib/_shared.js | `awaitingMarker` imported and asserted byte-identical | **WIRED** |
| test/repair.test.mjs | test/helpers/project.mjs | VERIFICATION_GAPS/PASSED, FENCED_PLAN (gap_closure: true), FENCED_SUMMARY reused | **WIRED** |

**Note on plan-01 KL1 (documented deviation, link still wired):** the plan's grep pattern anticipated a *local* `findTool(ctx, "gsd_plan")` helper; the shipped code calls the shared `findToolIn(ctx.tools, "gsd_plan")` (lib/_shared.js:389-392, same dual-shape array/`.get()` contract) — the review-fix CR-03 single-sourcing that also makes the step hooks fire in the service-shaped runtime. The semantic link (in-process delegation mirroring the mvp_phase precedent, never a fork) is fully intact and stronger than planned; lib/repair.js documents the evolution (repair.js:65-69).

## Data-Flow Trace

**Repair tool path:** seeded `<NN>-VERIFICATION.md` (gaps_found) → `gsd_repair.execute` (cwdOf → gsdState guard → ROADMAP lookup → rounds validation) → `runRepairRounds` → trigger gate via `readVerificationStatus` (GsdState.readArtifact; missing-file/unparseable distinguished, D-04) → `runOneRound`: `findToolIn(ctx.tools,"gsd_plan").execute({phase,gaps:true})` → listPlans oracle (`matchesGapClosure && !has_summary`) → `gsd_execute({phase,gapsOnly:true})` → summary-completeness oracle + `CHECKPOINT-<PP>` artefact + `GSD_AWAITING_HUMAN:` marker extraction → `gsd_verify({phase,gaps:true})` → status readback from the artefact → recovered (break) / gaps_found (next round) / budget-exhausted stop (`BUDGET_EXHAUSTED_PHRASE`, remaining gaps pointed at VERIFICATION.md) → `buildRepairDoc` (frontmatter phase/rounds_run/final_status + `## Round N` + `## Stop`) → `s.writeArtifact("REPAIR")` → `commitArtifacts(scope:"repair")`. No `setActivePhase` anywhere in the path.

**Autonomous path:** `runAutonomous` → `readVerifyStatus` → `gaps_found` → `runRepairRounds` (same shared helper, no rounds override) → try/catch folds any fault as `repair failed — <cause>` → authoritative re-read via `readVerifyStatus` (artefact oracle, never the report string) → `passed` → continue to the ROADMAP re-read; still non-passed → early-stop cause folded verbatim (marker reaches the human) or budget-exhausted stop naming remaining gaps + shared budget 2. `human_needed`/`missing` bypass repair entirely.

## Behavioral Spot-Checks

One named suite per behavior-dependent truth group (never the full suite):

- `node --test test/repair.test.mjs` → **20 pass / 0 fail** (trigger gate, rounds domain, delegation contract, oracles, REPAIR.md accumulation, STATE immobility, statics, V15 integration) — covers 01-1…01-5, 01-7, 03-1…03-5.
- `node --test test/autonomous.test.mjs` → **17 pass / 0 fail** ((f) exhaustion, (f-recovery) continue-on-recovery, (f-early) real-cause+marker, missing-VERIFICATION zero-repair) — covers 02-2…02-4.
- `node --test test/tools.test.mjs` → **74 pass / 0 fail**, incl. "gaps_found route text recommends gsd_repair and does not claim repair ran (D-02)" and the CR-07 missing-report route — covers 02-1.
- `node --test test/mount.test.mjs test/_capabilities.test.mjs test/phase-tools-git.test.mjs` → **47 pass / 0 fail** — covers 01-6 (37 tools / 34 commands / 28 keys / 27 patch rows, schema validity, commit-scope statics).
- `node --test test/render.test.mjs` → **21 pass / 0 fail** (the plan-01 deviation file: gsdRepair in informationEntries).
- Export smokes (ran live): `import('./lib/repair.js')` → all 7 locked exports, `REPAIR_ROUND_BUDGET === 2`; `import('@dsh-gsd/bundle/repair')` → name `gsd-repair`; all four other artifact modules export their planned surface.

## Requirements Coverage

| REQ-ID | Requirement | Status | Evidence |
|---|---|---|---|
| CLH-08 | Node repair: automatically recover a plan whose verification failed instead of stopping | **DELIVERED** | gsd_repair orchestrator + /gsd-repair command + gsdRepair descriptor + verify route re-point + autonomous rewire + REPAIR.md artefact + 20-test offline suite; recovery proven end-to-end through the real delegate machinery (V15) and through autonomous ((f-recovery)) |

(REQUIREMENTS.md already shows `[x] CLH-08`; CLH-09 — the only other open item in the milestone — belongs to phase 59, not this phase.)

## Anti-Patterns Found

- **Debt markers (unreferenced TBD/FIXME/XXX/HACK):** 0 across lib/repair.js, lib/verify.js, lib/autonomous.js, lib/commands.js, test/repair.test.mjs, test/autonomous.test.mjs.
- **Stub/skip markers:** 0 (no `.skip`, no todo-only tests; the 20-test repair suite is fully behavioural).
- **Fork risk (D-08):** statically asserted — no PLANNER_PROMPT/EXECUTOR_PROMPT/VERIFIER_PROMPT in lib/repair.js, no inline git argv, no `node:fs/promises`, no `function matchesGapClosure`, no `./autonomous.js` import (module graph acyclic).
- **Optimistic-default risk (P2/R4):** repair's own reader treats missing-file/unparseable as distinct stops; verify's missing-report route was additionally hardened (CR-07) so a phantom gaps_found can never reach repair's gate. Blocker anti-patterns: none.

## Human Verification Required

None. The capability is a headless orchestrator with no visual/real-time/external surface; no `<verify><human-check>` blocks exist in any PLAN; every behavior-dependent truth is covered by a passing named behavioral test on the offline harness (FakeFs, counting delegates, real in-process delegate tools), and mount activation is proven by the mount harness (patch row → exports → dynamic import → schema check). A live DSH-session smoke of `/gsd-repair` would be redundant with the house mount contract already exercised by 47 passing mount/capability assertions.

## Gaps Summary

None. All truths verified, all artifacts substantive, all key links wired, no anti-patterns, no human-verification items.

**Noted deviations (non-blocking, review-driven):**
1. Plan-01's local dual-shape `findTool` was replaced by the shared `findToolIn` from lib/_shared.js (CR-03) — same dual-shape contract, single-sourced, cycle-safe; documented in-code and above.
2. Plan-01 additionally modified test/render.test.mjs (informationEntries expectation) beyond its `files_modified` list — a hardcoded-count bump forced by the new CAPABILITY_KEYS entry; disclosed in SUMMARY-01 Deviations and passing (21/21).
3. `ROUNDS_DOMAIN_MSG` is derived from `REPAIR_ROUND_BUDGET` and the exhaustion contract is a shared `BUDGET_EXHAUSTED_PHRASE` symbol (CR-05/CR-08) — strengthens the planned single-source greps rather than weakening them.
4. The plan-03 fake planner writes the next free `<PP>` per round (01→02→03) instead of always 01 — required for multi-round correctness (a completed round-1 plan must not satisfy the runnable-fix-plan oracle); disclosed in SUMMARY-03 Deviations with the real plan.js:193 contract cited.
---
phase: GSD-58-node-repair
plan: 02
subsystem: repair
tags: [node-repair, verify-routing, autonomous-rewire, gap-closure, recommend-only, bounded-recovery]
dependency graph:
  requires: [plan-01 runRepairRounds shared helper, REPAIR_ROUND_BUDGET constant, plan-01 stop-classification string contract, gsd_plan gaps mode, gsd_execute gapsOnly filter, gsd_verify gaps mode, readVerifyStatus reader]
  provides: [gsd_verify gaps_found route text naming gsd_repair (recommend-only), autonomous gaps_found → bounded repair wiring with recovery/early-stop/exhaustion branches, extended autonomous integration harness with real repair delegates]
  affects: [lib/verify.js, lib/autonomous.js, test/tools.test.mjs, test/autonomous.test.mjs]
tech-stack: [ESM, node builtins, dsh-tools defineTool, GsdState artefact accessors, one-way repair.js import, node:test FakeFs integration harness]
key-files:
  created: []
  modified: [lib/verify.js, lib/autonomous.js, test/autonomous.test.mjs, test/tools.test.mjs]
decisions: [D-02, D-03, D-04, D-05, D-07, D-08, D-09, D-11]
metrics:
  duration: 2026-09-08
  completed: 2026-09-08
  tokens: ~80k
  tasks: 2
  commits: 2
status: complete
---

# Phase 58 Plan 02: wire the repair orchestrator into the loop's routing surfaces Summary

Re-pointed gsd_verify's gaps_found routing (header comment + tool description + route table) to recommend `gsd_repair` first while staying strictly recommend-only (no repair import, no tool lookup, no auto-repair — D-02), and rewired gsd_autonomous so a gaps_found phase runs the shared bounded repair loop (plan 01's `runRepairRounds`, default 2-round budget, no override) before its final stop — continuing the milestone on recovery, folding early-stop causes in verbatim (awaiting marker included), hard-stopping with budget-exhaustion wording only on genuine exhaustion, and leaving human_needed/missing stops untouched with zero repair delegate calls (D-09/D-11/D-04).

## What was done

**Task 1 — Re-point gsd_verify's gaps_found routing at gsd_repair (commit c8a560c):**
- `lib/verify.js`: all three routing surfaces updated, recommend-only (D-02). Header comment (lines 1-7): `gaps_found -> recommend gsd_repair (bounded automatic repair rounds) or manual gsd_plan --gaps closure` plus a D-02 boundary note written as "never imports the repair module" (no forbidden import/lookup strings quoted, so the equals-0 grep holds even with the comment present). Tool description (~line 48): `gaps_found -> recommend gsd_repair (bounded repair rounds) or re-plan manually with gsd_plan --gaps`. Route table (~line 133): `✗ Phase N: gaps found (score n/a). Next: gsd_repair on phase N to run bounded automatic recovery rounds (gsd_plan --gaps → gsd_execute --gaps-only → gsd_verify --gaps), or produce fix plans manually with gsd_plan --gaps.`
- Non-negotiable boundaries held: no import of `./repair.js` (grep = 0), no findTool/`.get`/`.find` lookup of the repair tool, no REPAIR.md write, no second commitArtifacts call, no auto-repair — the only change is routing text.
- `test/tools.test.mjs`: new `describe("gsd_verify")` with (a) a behavioural test driving gsd_verify against a seeded gaps outcome via a new `VERIFY_GAPS_MODE` flag (mirrors the `EXEC_CHECKPOINT_MODE` pattern; the label-keyed fake verifier writes `VERIFICATION_GAPS` when set) asserting the route matches `/gsd_repair/`, does NOT claim repair ran (`/repair (complete|rounds run|round\(s\) run)/`, `/repair succeeded|repair recovered/` negatives), and keeps the STATE discipline (gaps → stays on `verify`); and (b) a static-source assertion (readFile idiom from test/phase-tools-git.test.mjs) proving lib/verify.js neither imports the repair module nor looks the repair tool up.

**Task 2 — Rewire gsd_autonomous through the shared repair loop (commit da5f29b):**
- `lib/autonomous.js`: one-way import `import { runRepairRounds, REPAIR_ROUND_BUDGET } from "./repair.js"` (lib/repair.js never imports autonomous.js — no cycle, OQ-4). Between the `readVerifyStatus` call and the old non-passed stop: on exactly `gaps_found`, the driver calls `runRepairRounds({ cwd, s, ctx, exec, phaseNum, phaseName, gitFn: ctx.gitFn })` with NO rounds override (shared default budget 2, D-03/D-07), wrapped in try/catch so ANY fault (missing delegate tool from findTool's fail-loud guard, repair-module error) becomes `Phase N: repair failed — <cause>` instead of an uncaught throw. The status is then RE-READ from the artefact (never the report string — artefact state is the oracle): `passed` → per-phase STATUS pushed as `passed (recovered via N repair round(s))` and the loop CONTINUES to (4)'s ROADMAP re-read; still non-passed → classified by repair's cause using the plan-01 string contract — an early stop (`stopReason` present, does not contain the locked `repair budget exhausted` phrase) is folded in verbatim as `Phase N: repair stopped early — <cause>` (any GSD_AWAITING_HUMAN marker inside reaches the human untouched, preserving the answer/decision_id checkpoint-resume handoff, D-11/P5), while a genuine exhaustion (or defensive null-cause non-passed) stops with `still "<status>" after N repair round(s) (shared budget 2) — remaining gaps in VERIFICATION.md (repair budget exhausted)` — phase 49's D-09 final-stop semantics preserved. `human_needed`/`missing`/anything else non-passed keeps today's immediate stop with the existing stopReason text and zero repair calls (D-04). `buildAutopilotPrompt` byte-unchanged (repair is driver-side; the autopilot child never invokes the repair tool — OQ-8; the tool name appears nowhere in the driver's source, P6).
- `test/autonomous.test.mjs`: the integration harness now mounts the REAL plan/execute/verify plugins into ctx.tools (findTool's Array.isArray branch) and `makeAutonomousSubagents(controller, fs)` gained label-keyed delegate behaviors mirroring tools.test.mjs: "planner*" writes the gap_closure fix plan at the next controller-supplied PP (round 2 writes a NEW fix plan — the planner's "next free <PP>" contract — so round 2 does not misread round 1's completed plan as "no runnable fix plan"), "plan-checker*" returns a pass marker, "execute <planId>" writes FENCED_SUMMARY (or returns structured checkpoint state under `execCheckpointMode`), "verify*" writes VERIFICATION_PASSED/VERIFICATION_GAPS from `controller.verifyWrites` consumed in call order, and "plan research*" returns ≥50-char RESEARCH text (REQUIRED: the harness seeds no RESEARCH.md, so round 1's plan delegate runs the researcher and rejects short output). Test (f) rewritten to assert repair was ATTEMPTED (exactly one researcher spawn across both rounds — round 2 reuses the written RESEARCH.md, lib/plan.js:116; two planner/executor/verifier spawns) AND still stops after the budget (`/repair/`, `/budget|round/`, no "autonomous phase 2" capture) — the old `captures.length === 1` assertion replaced by these stronger ones (P7). New `(f-recovery)` variant: verifyWrites `["gaps_found","passed"]` → outcome completed, p1 STATUS `passed`, p2's autopilot spawns (D-09 continue-on-recovery). New `(f-early)` variant: pre-seeded unanswered decision CHECKPOINT on the fix plan (2-task plan so the checkpoint is in-range) → exactly 1 attempted round, executor never spawned, verify never consumed, stopReason matches `/stopped early/`, does NOT match `/repair budget exhausted/`, and the verbatim `awaitingMarker(...)` line (built via lib/_shared.js) reaches the stop reason (P5). The missing-VERIFICATION test is strengthened: zero planner/executor/verifier spawns on a missing report (D-04). Existing (a)-(e), (g), (h) remain green unmodified.

## Verification

- Task 1: `node --test test/tools.test.mjs` → **73 pass / 0 fail** (incl. the 2 new gsd_verify tests). Greps: `gsd_repair` in lib/verify.js = 3 (≥2); `'from "./repair.js"'` = 0; the `/--gaps-only would run nothing/` plan-guard assertion untouched (line 640).
- Task 2: `node --test test/autonomous.test.mjs` → **17 pass / 0 fail** (rewritten (f), new (f-recovery) and (f-early), strengthened missing test; (a)-(e)/(g)/(h) unmodified and green). Greps: repair import = 1; `runRepairRounds` = 2; `gsd_repair` = 0; `do not call gsd_ship` = 1 (prompt byte-unchanged); budget/round phrasing = 4 (≥1); `stopped early` = 1 (≥1).
- Full `npm test` → **1071 pass / 0 fail** (this run also includes plan-03's three interleaved test commits, which landed on phase-58 between this plan's two commits and are fully compatible).

## Decisions

- D-02: gsd_verify's gaps_found route (text + description + header comment) names gsd_repair as the recommended next action; verify performs no auto-repair — no repair import, no tool lookup (statically asserted), no REPAIR.md write, no extra commit; verify stays recommend-only.
- D-09: on `gaps_found` the autonomous driver runs the shared bounded repair loop in-process (same helper the repair tool exposes; no rounds override → default budget 2), continues the milestone when the phase recovers to passed, and preserves phase-49's final-stop semantics on still-non-passed.
- D-03/D-07: no per-call override through the autonomous path; budget exhaustion is classified ONLY by the locked `repair budget exhausted` contract phrase, and the exhaustion stopReason names the remaining gaps, the rounds run, and the shared budget constant.
- D-04: `human_needed` / missing / unparseable statuses take the untouched immediate-stop path with the existing stopReason text — proven zero repair delegate spawns.
- D-11/P5: early-stop causes are folded in verbatim (never relabeled as budget exhaustion); a surfaced GSD_AWAITING_HUMAN marker line reaches the human untouched so the existing gsd_execute answer/decision_id checkpoint-resume handoff still works; any thrown delegate fault becomes `repair failed — <cause>` rather than an uncaught throw.
- D-08: the driver delegates to plan 01's shared helper and never forks repair machinery; the one-way `./repair.js` import keeps the module graph acyclic (OQ-4).

## Deviations

_none_ — all changes stayed within the plan's `files_modified` (lib/verify.js, lib/autonomous.js, test/autonomous.test.mjs, test/tools.test.mjs). Note: plan-03's executor committed three test commits (54cd961, 0443b52, 2e769c6) to phase-58 between this plan's Task 1 and Task 2 commits; this plan's commits contain only its own two files per task and the combined tree passes the full suite.

## Known Stubs

_none_ — scanned the four touched files for TODO/FIXME/placeholder/XXX/skipped-test markers: the only hits are pre-existing prose ("neutral placeholder" in an untouched doc comment) and test-fixture requirement ids; no behavioural stubs introduced.

## Threat Flags

_none_ — no new subprocess usage (lib/verify.js and lib/autonomous.js gained no exec/spawn/eval surface; autonomous's git usage continues to ride ctx.gitFn/commitArtifacts fixed-argument-array seams); no secrets; all .planning/ I/O routes through GsdState (DUR-06); no force-push, no gate bypass; the driver interpolates only phase numbers, helper-returned causes, and budget counts into human-facing strings, never into shell commands.

## Self-Check: PASSED

- All four touched files exist with the planned content: lib/verify.js (150 lines, `gsd_repair` ×3, repair import ×0), lib/autonomous.js (410 lines, one-way `./repair.js` import, `gsd_repair` ×0), test/autonomous.test.mjs (579 lines), test/tools.test.mjs (1331 lines).
- Both task commits exist on phase-58: c8a560c (Task 1) and da5f29b (Task 2); working tree clean after the commits.
- Mount/behavioural suites green: tools.test.mjs 73/73, autonomous.test.mjs 17/17, full `npm test` 1071/1071.

## TDD Gate Compliance

- Plan type is `execute` (not `tdd`): no RED→GREEN commit-ordering gate applies to this plan; each task landed as a single feat-scoped atomic commit containing its code + tests together, per the plan's <files>. The plan-01 engine under test is already covered by plan-03's dedicated test suite (interleaved on this branch); this plan's own behavioural/static assertions (2 in tools.test.mjs, 3 new/rewritten in autonomous.test.mjs) prove the D-02/D-09/D-11 wiring post-hoc.
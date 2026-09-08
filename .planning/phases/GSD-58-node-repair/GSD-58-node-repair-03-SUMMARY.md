---
phase: GSD-58-node-repair
plan: 03
subsystem: repair
tags: [node-repair, test-suite, gap-closure, delegation, offline-harness, fakefs]
dependency graph:
  requires: [lib/repair.js (gsd_repair/runRepairRounds/readVerificationStatus/REPAIR_ROUND_BUDGET from plan 01), awaitingMarker/parseFrontmatter from lib/_shared.js, buildProject/FENCED_PLAN/FENCED_SUMMARY/VERIFICATION_PASSED/VERIFICATION_GAPS fixtures, FakeFs harness, real gsd_plan/gsd_execute/gsd_verify tools (V15)]
  provides: [test/repair.test.mjs — 20-test offline proof of V1–V10/V14/V15 across D-01..D-12, suite-level decision-coverage map comment]
  affects: [test/repair.test.mjs]
tech-stack: [ESM, node:test, node:assert/strict, FakeFs, fake-ctx, counting fake delegates, label-keyed fake subagents, real in-process delegate tools]
key-files:
  created: [test/repair.test.mjs]
  modified: []
decisions: [D-01, D-03, D-04, D-05, D-06, D-07, D-08, D-10, D-11, D-12]
metrics:
  duration: 2026-09-08
  completed: 2026-09-08
  tokens: ~55k
  tasks: 3
  commits: 3
status: complete
---

# Phase 58 Plan 03: node-repair offline test suite Summary

Proved the phase-58 repair engine offline (RESEARCH §6 V1–V10 and V15): a new 545-line test/repair.test.mjs (20 tests, 4 describes) covering the trigger gate (gaps_found-only), rounds validation, the strict plan→execute→verify delegation contract with exact delegate args, per-step artefact oracles (runnable fix plan, checkpoint + verbatim GSD_AWAITING_HUMAN marker, verify readback), REPAIR.md accumulation across rounds and invocations, budget exhaustion, STATE immobility, no-fork/no-STATE/no-raw-fs/commit-scope static wiring, and one happy-path end-to-end recovery through the REAL gsd_plan/gsd_execute/gsd_verify tools — all on FakeFs with counting fake delegates, no network, no real git, no LLM.

## What was done

**Task 1 — Trigger gate, rounds domain, delegation contract (V1/V2/V3/V5) (commit 54cd961):**
- Built the local harness mirroring test/tools.test.mjs: FakeFs + buildProject (phase 1 = "auth", artefact base 01-auth), a fake ctx whose get returns svc for gsdState, the REAL gsd_repair registered via apply(c) (mirroring registerTool), then ctx.tools set to `[...delegates, repairTool]` so findTool's Array.isArray branch resolves; exec mirrors tools.test.mjs:112-115.
- Counting fake delegates as plain `{ name, execute(args, exec) }` objects pushing `{ name, args }` into a shared capture array and mutating FakeFs: gsd_plan writes the next free `<PP>` fix plan (FENCED_PLAN, gap_closure: true) — see Deviations for the multi-round rationale; gsd_execute writes the SUMMARY (or, in checkpoint mode, a CHECKPOINT artefact with the CHECKPOINT_DECISION frontmatter shape from tools.test.mjs:89-97 plus the exact `awaitingMarker(...)` line built from lib/_shared.js); gsd_verify writes controller-sequenced VERIFICATION text (VERIFICATION_PASSED/VERIFICATION_GAPS by call order). The planWritesNoFixPlan switch makes gsd_plan return the REAL lib/plan.js:199 guard string so the stop-cause test exercises the real failure text.
- 8 tests: single-round happy path with deepEqual on capture order `[gsd_plan, gsd_execute, gsd_verify]` and args exactly `{ phase: 1, gaps: true } / { phase: 1, gapsOnly: true } / { phase: 1, gaps: true }`; passed no-op with capture 0 and no REPAIR.md; human_needed / missing-file / unparseable (bad value AND absent status field) gate stops each with capture 0 and distinct cause strings (plus a pairwise-distinctness test); missing gsd_plan delegate → `assert.rejects(/gsd_plan tool not registered/)`; rounds 0/3/1.5 → `/rounds must be an integer between 1 and 2/` with capture 0, and `REPAIR_ROUND_BUDGET === 2` asserted; rounds:1 → exactly one of each delegate call.

**Task 2 — Per-step oracles, REPAIR.md accumulation, STATE immobility, no-fork statics (V6–V10/V14/V4) (commit 0443b52):**
- No runnable fix plan (D-11/V6): stop text includes the real guard excerpt (`no fix plan (gap_closure: true)`, `--gaps-only would run nothing`); gsd_plan ×1, gsd_execute ×0, gsd_verify ×0; REPAIR.md contains `## Stop`.
- Checkpoint + marker (P5/V7): the stop report includes the byte-identical `awaitingMarker(...)` string (imported from lib/_shared.js), names plan 01-auth-01 and the answer/decision_id resume channel; gsd_verify ×0, gsd_execute ×1 (no blind re-run).
- Budget exhaustion (D-07/V8): verifyWrites ["gaps_found", "gaps_found"] → exactly 2 rounds of each delegate (a third never starts), report matches /repair budget exhausted/ with final status gaps_found and the VERIFICATION.md pointer.
- Recovery on round 2 + accumulation (V8/V9): verifyWrites ["gaps_found", "passed"] → RECOVERED, final VERIFICATION artefact status: passed; REPAIR.md frontmatter rounds_run === 2 / final_status === "passed" with `## Round 1` (status gaps_found) and `## Round 2` (status passed) each naming the delegated actions; a second invocation (reseeded gaps, one round) APPENDS — the file still carries the first invocation's Round 1 section (exactly 2 × `## Round 1`, 3 × `## Round N`, never truncated).
- STATE immobility (D-01/V14): STATE frontmatter byte-identical before/after a passed no-op, a human_needed gate stop, and a fail-loud delegate throw on a tools-array containing only gsd_repair.
- Static source assertions on lib/repair.js (test/phase-tools-git.test.mjs idiom): imports commitArtifacts from ./_git-artifacts.js; `scope: "repair"` exactly once; no PLANNER_PROMPT/EXECUTOR_PROMPT/VERIFIER_PROMPT (never forks); no promisify(execFile)/execFileSync("git")/inline git argv (D-12); no node:fs/promises and no `function matchesGapClosure` (DUR-06 reuse); no `from "./autonomous.js"` (one-way import, OQ-4); no setActivePhase/completePhase/setStep( (never advances STATE).

**Task 3 — Full-surface integration through the REAL delegate tools (V15) (commit 2e769c6):**
- Registered the real applyPlan/applyExecute/applyVerify plugins alongside applyRepair into the ctx.tools array, backed by a label-keyed fake subagents service cloned from tools.test.mjs makeSubagents: "plan research" spawns return a ≥50-char RESEARCH text (buildProject seeds no RESEARCH.md, so round 1 spawns the researcher — lib/plan.js:116 — and round 2 skips it because plan.js persists RESEARCH.md, lib/plan.js:132); "planner" spawns write the next free `<PP>` fix plan (gap_closure: true) and return "## PLANNING COMPLETE"; "plan-checker" returns "## VERIFICATION PASSED"; "execute <plan-id>" spawns write the matching SUMMARY; "verify phase 1" spawns write the sequenced VERIFICATION text ["gaps_found", "passed"].
- Seeded the real plan delegate's CONTEXT.md prerequisite (`svc.writeArtifact(CWD, 1, "CONTEXT", "# ctx")` — the real gsd_plan stops with its no-CONTEXT guard otherwise, lib/plan.js:94-96) plus VERIFICATION_GAPS, then drove repairTool through two real rounds.
- Assertions: report signals RECOVERED after 2 rounds; both fix plans (01-auth-01/02-PLAN.md with gap_closure: true) and both SUMMARYs exist; final VERIFICATION artefact matches /status: passed/; REPAIR.md frontmatter final_status "passed" / rounds_run 2 with a `## Round 2` section; researchSpawns === 1 (round 2 skipped the researcher — OQ-9); delegated tools own STATE — final frontmatter status "ship", active_phase "1". No git assertions (commitArtifacts fails soft against the fake cwd by design).
- Finished the file with a suite-level coverage-map comment mapping every test to its CONTEXT decision ids (D-01..D-12, noting D-02 is plan-02's surface) and RESEARCH V-numbers for gap-analysis cross-reference.

## Verification

- Task 1: `node --test test/repair.test.mjs` → 8 pass / 0 fail; acceptance greps: "gaps: true" ×2, "gapsOnly: true" ×1, rounds-domain ×1, fail-loud guard ×1.
- Task 2: suite → 19 pass / 0 fail; greps: awaitingMarker ×2, "repair budget exhausted" ×1, "## Round 1" ×2, `scope: "repair"` ×2 (both the static assertion itself).
- Task 3: suite → 20 pass / 0 fail including the V15 integration test; greps: "plan research" ×2, "CONTEXT" ×1; full `npm test` → **1071 pass / 0 fail** (baseline 1047 after plan 01 + plan-02's autonomous rewire tests + this plan's 20).

## Decisions

- D-03/D-07: default budget 2 proven via REPAIR_ROUND_BUDGET === 2 and the default-budget exhaustion run; rounds 1..2 domain proven with 0/3/1.5 failing loud before any delegate call and rounds:1 running exactly one full round.
- D-04/D-05: the trigger gate distinguishes passed (zero delegates, nothing written) / gaps_found (proceeds) / human_needed, missing-file, unparseable (three distinct stop causes, zero delegates each).
- D-06/D-08: one round = plan({phase, gaps}) → execute({phase, gapsOnly}) → verify({phase, gaps}) in strict order with exact args, delegated through the registered tools — proven behaviourally (capture deepEqual) and statically (no forked prompts, no inline git), plus the end-to-end run through the REAL delegate tools.
- D-07/D-11: every failure class stops with its real cause and exact delegate-call counts — no runnable fix plan (execute uncalled), checkpoint (marker surfaced verbatim, verify uncalled, execute ×1), budget exhaustion (2 rounds exactly, third never starts) — and no stopped round is ever blind-retried.
- D-10: REPAIR.md is created on round 1, appended per round, and survives a second invocation (read-modify-write append); the scope-repair commit seam is statically proven (single `scope: "repair"` site riding commitArtifacts).
- D-01/D-12: repair never advances STATE (behavioural: frontmatter byte-identical on every non-delegating exit; static: no setActivePhase/completePhase/setStep) and keeps all git logic in the shared fixed-argument-array seam.

## Deviations

- **Fake delegate writes the next free `<PP>` per call (not always 01):** the plan's Task 1/3 text describes the fake gsd_plan writing `01-auth-01-PLAN.md`; that holds for round 1, but multi-round tests (budget exhaustion, round-2 recovery, integration) require round 2's planner to produce a NEW runnable fix plan, because round 1's plan 01 already has a SUMMARY and the runnable-fix-plan oracle requires gap_closure:true without a SUMMARY. The delegates therefore track call count and write 01→02→03, faithfully mirroring the real gap-closure planner's "write the fix plan at the next free <PP>" instruction (lib/plan.js:193) and documented in a comment in the test file. All plan-stated round-1 assertions (01-auth-01-PLAN.md with gap_closure: true, 01-auth-01-SUMMARY.md existing) still hold.
- **Transient mid-flight observation during Task 3's first full `npm test`:** plan-02's then-uncommitted in-flight edits to lib/autonomous.js + test/autonomous.test.mjs (running concurrently in this wave, same shared tree) caused one transient failure at test/autonomous.test.mjs:400 (`2 !== 1`) in that run. This plan never read-modified or committed those files; after plan-02 settled (commit da5f29b, its own (f)/(f-recovery) rewrite complete), the full suite passes 1071/0 with this plan's changes included. No action required; recorded for auditability.

## Known Stubs

_none_ — scanned test/repair.test.mjs for TODO/FIXME/placeholder/XXX/`.skip` markers: no matches.

## Threat Flags

_none_ — the plan is test-only: no new subprocess usage (the only `readFile` is the static source-assertion idiom), no secrets touched, no network, no real git (commitArtifacts fails soft against the fake cwd); all fixtures are in-memory FakeFs state.

## Self-Check: PASSED

- test/repair.test.mjs exists (545 lines, 20 tests / 4 describes) and `node --test test/repair.test.mjs` → 20 pass / 0 fail.
- All three task commits exist on phase-58: 54cd961 (Task 1), 0443b52 (Task 2), 2e769c6 (Task 3); each touched exactly test/repair.test.mjs.
- Full `npm test` on the settled tree (including plan-02's committed da5f29b) → 1071 pass / 0 fail; working tree clean.

## TDD Gate Compliance

- Plan type is `execute` (not `tdd`): no RED→GREEN commit-ordering gate applies; the three commits are test-scoped per task as the plan's <files> require. The suite itself is the deliverable and passes green.
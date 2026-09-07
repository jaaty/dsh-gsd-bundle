---
phase: 53
reviewed: "2026-09-07T03:51:09.916Z"
depth: standard
files_reviewed: 10
status: issues_found
findings:
  blocker: 0
  warning: 2
  info: 3
  total: 5
---
# Phase 53: smart-entry - Code Review Report

**Reviewed:** 2026-09-07T03:51:09.916Z
**Depth:** standard
**Files reviewed:** 10
**Status:** issues_found

## Summary

- Total findings: 5
- BLOCKER: 0
- WARNING: 2
- INFO: 3

## Warnings

### CR-01: gsd_next auto-advance to spec persists next_action=discuss-phase, so gsd_status misreports the immediate next action and spec would be skipped

- **File:** lib/core-tools.js
- **Lines:** 655-656
- **Severity:** WARNING
- **Evidence:** When gsdSpec is present, branch 5 sets step='spec' and calls `await s.setActivePhase(cwd, phaseNum, step)`. setActivePhase computes next_action via `_nextActionFor(step)` (lib/state.js:436) which maps `spec: "discuss-phase"`. So after auto-advance STATE has status='spec' but next_action='discuss-phase'. gsd_status (lib/core-tools.js:156-158) then reports `Next action: discuss-phase` because gsdDiscuss is present — while gsd_next just recommended `run spec-phase`. The two surfaces disagree about the immediate next action, so an agent orienting via gsd_status would skip the spec step. The integration test (test/next-integration.test.mjs:149) codifies this mismatch.
- **Suggestion:** Make _nextActionFor('spec') return 'spec-phase' (self-referential like plan/execute/verify) so the persisted next_action matches the recommendation, or have gsd_next write the recommendation step directly into next_action instead of relying on _nextActionFor.

### CR-02: Math.min over pending phase n can yield NaN and corrupt STATE via setActivePhase

- **File:** lib/_next.js
- **Lines:** 128
- **Severity:** WARNING
- **Evidence:** `const nextPhaseNum = Math.min(...pending.map((p) => p.n));` — if any pending phase lacks a numeric `n` (undefined/NaN), Math.min returns NaN. The mutation `{ setActivePhase: { phaseNum: NaN, step } }` is then applied in core-tools.js:655 via `s.setActivePhase(cwd, NaN, step)`, which writes `active_phase: "NaN"` into STATE.md (data corruption). There is no guard on the computed phase number.
- **Suggestion:** Filter/validate pending phases before the min, e.g. `const nums = pending.map(p=>p.n).filter(Number.isFinite); if (!nums.length) fall through to branch 6; const nextPhaseNum = Math.min(...nums);`

## Info

### CR-03: Auto-advance commit result is ignored; a failed commit is silently swallowed

- **File:** lib/core-tools.js
- **Lines:** 656
- **Severity:** INFO
- **Evidence:** `await commitArtifacts(cwd, phaseNum, { scope: "next", phaseName: String(phaseNum) }, ctx.gitFn || defaultGitFn);` — the return value `{ committed, warning }` is discarded. If git is unavailable or nothing is staged, commitArtifacts returns `{ committed:false, warning }` (lib/_git-artifacts.js:180/191/197) and the tool still returns `Next action: run ...` with no indication that the re-pointed STATE was not committed.
- **Suggestion:** Capture the result and append a warning line when `!result.committed && result.warning`, e.g. `const c = await commitArtifacts(...); if (c.warning) return `${renderNextRecommendation(result)}\n(warning: ${c.warning})`;`

### CR-04: Branch 4 misroutes to MID_PHASE when active_phase points to a phase absent from the roadmap

- **File:** lib/_next.js
- **Lines:** 106-117
- **Severity:** INFO
- **Evidence:** `const phase = s.roadmap.phases.find((p) => p.n === activeNum); const phaseComplete = phase ? phase.status === "Complete" : false;` — when active_phase references a phase number not present in the roadmap (stale pointer), `phase` is undefined, `phaseComplete` is false, and with a non-'done' status the classifier returns MID_PHASE recommending continuation of a phase that does not exist, instead of falling through to branch 5/6.
- **Suggestion:** Treat a missing phase as a fall-through: `if (phase && !statusDone && !phaseComplete)` so a stale active_phase routes to the next pending phase or milestone-complete rather than recommending a phantom phase.

### CR-05: Test name says 'applies all 25 plugins' but there are 26 patch rows

- **File:** test/mount.test.mjs
- **Lines:** 143
- **Severity:** INFO
- **Evidence:** `test("applies all 25 plugins in patch order without throwing", async () => {` — PATCH_ROWS has 26 entries (mount-harness.mjs:23-50) and the test asserts `ctx.tools.length === 32` / `ctx.commands.length === 29` for the full 26-row set. The name is stale/misleading.
- **Suggestion:** Rename to 'applies all 26 plugins in patch order without throwing' (or derive the count from PATCH_ROWS.length).

---

*Phase: 53-smart-entry*
*Code review: 2026-09-07*
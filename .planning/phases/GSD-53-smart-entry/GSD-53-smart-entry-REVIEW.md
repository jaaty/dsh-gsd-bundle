---
phase: 53
reviewed: "2026-09-07T03:39:17.278Z"
depth: standard
files_reviewed: 10
status: issues_found
findings:
  blocker: 0
  warning: 2
  info: 4
  total: 6
---
# Phase 53: smart-entry - Code Review Report

**Reviewed:** 2026-09-07T03:39:17.278Z
**Depth:** standard
**Files reviewed:** 10
**Status:** issues_found

## Summary

- Total findings: 6
- BLOCKER: 0
- WARNING: 2
- INFO: 4

## Warnings

### CR-01: gsd-spec-phase non-auto branch renders literal '${n}' instead of the phase number

- **File:** lib/commands.js
- **Lines:** 87
- **Severity:** WARNING
- **Evidence:** text: `Run the GSD Spec step on phase ${n}. ${auto ? "Derive recommended defaults..." : "Clarify WHAT phase ${n} delivers by holding a Socratic interview..."} until the requirements are falsifiable...` — the false-branch is a plain double-quoted string, so its `${n}` is NOT interpolated and the user sees the literal text "phase ${n}".
- **Suggestion:** Use a nested template literal or concatenation for the false branch, e.g. `: \`Clarify WHAT phase ${n} delivers...\`` so the phase number is interpolated.

### CR-02: Auto-advance to 'spec' writes next_action 'discuss-phase' while recommending 'spec-phase'

- **File:** lib/core-tools.js
- **Lines:** 647-662
- **Severity:** WARNING
- **Evidence:** gsd_next branch-5 advance calls `s.setActivePhase(cwd, phaseNum, step)` with step='spec' (chosen in lib/_next.js:129 when gsdSpec is present), and state.js `_nextActionFor('spec')` returns 'discuss-phase' (state.js:436). The tool then returns `renderNextRecommendation(result)` naming 'spec-phase'. A subsequent gsd_status/gsd_next therefore routes to 'discuss-phase', contradicting the just-issued 'spec-phase' recommendation and effectively skipping the spec step on the next orientation.
- **Suggestion:** Make the recommendation and the persisted next_action agree: either map spec->'spec-phase' in `_nextActionFor`/`NEXT_ACTION_TO_STEP`, or have gsd_next recommend the step that `_nextActionFor` actually persists (discuss-phase) when advancing to spec.

## Info

### CR-03: gsd-undo dry-run text has an unbalanced opening parenthesis

- **File:** lib/commands.js
- **Lines:** 213
- **Severity:** INFO
- **Evidence:** text: "Run the gsd_undo tool on phase " + n + ... + " (dry-run — no confirm, will show what would be reverted" + "." — the dry-run branch opens a '(' that is never closed, producing "...would be reverted."
- **Suggestion:** Close the parenthesis: " (dry-run — no confirm, will show what would be reverted)".

### CR-04: Math.min over pending phases can yield NaN when a phase lacks n

- **File:** lib/_next.js
- **Lines:** 128
- **Severity:** INFO
- **Evidence:** const nextPhaseNum = Math.min(...pending.map((p) => p.n)); — if any pending phase has `n: undefined`, Math.min(...[undefined]) is NaN, and the returned mutation `{ setActivePhase: { phaseNum: NaN, step } }` would, on advance, call setActivePhase(cwd, NaN, step) and write active_phase 'NaN' into STATE.
- **Suggestion:** Guard the phase numbers, e.g. `const nums = pending.map(p => p.n).filter(Number.isFinite); if (!nums.length) fall through; const nextPhaseNum = Math.min(...nums);`

### CR-05: Number(activePhase) is NaN for a non-numeric active_phase, silently degrading the branch

- **File:** lib/_next.js
- **Lines:** 107
- **Severity:** INFO
- **Evidence:** const activeNum = Number(activePhase); const phase = s.roadmap.phases.find((p) => p.n === activeNum); — a non-numeric active_phase (e.g. 'abc') yields NaN, find() returns undefined, phaseComplete is forced false, and the classifier returns MID_PHASE based only on status rather than the actual phase.
- **Suggestion:** Validate the parsed number: `const activeNum = Number(activePhase); if (Number.isFinite(activeNum)) { ... }` so a malformed active_phase is handled explicitly (e.g. routed to gsd_health) instead of silently misclassifying.

### CR-06: Test name says 'all 25 plugins' but the suite asserts 26

- **File:** test/mount.test.mjs
- **Lines:** 143
- **Severity:** INFO
- **Evidence:** test("applies all 25 plugins in patch order without throwing", ...) — the surrounding comments and assertions (line 215 `insertRows.length === 26`, EXPECTED_INSERT_ROWS) consistently describe 26 plugin rows, so the test name is stale.
- **Suggestion:** Rename the test to 'applies all 26 plugins in patch order without throwing'.

---

*Phase: 53-smart-entry*
*Code review: 2026-09-07*
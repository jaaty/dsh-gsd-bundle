---
phase: 53
fixed: "2026-09-07"
status: fixed
findings_fixed: 6
commits:
  - 1dc9baf
  - b7bddbb
  - 54d874d
  - 4e4de17
---
# Phase 53: smart-entry - Review Fix Report

The `gsd_code_review --fix` companion failed with an internal tooling error
(`cannot get property "gitFn" without inject`), so the findings were applied
manually with per-fix atomic commits. All 1009 tests pass after the fixes.

## Fixes applied

### CR-01 (WARNING) — gsd-spec-phase non-auto branch renders literal '${n}'
- **File:** `lib/commands.js`
- **Fix:** the false-branch of the ternary was a plain double-quoted string, so
  its `${n}` was not interpolated. Switched to a nested template literal so the
  phase number renders correctly.
- **Commit:** `1dc9baf`

### CR-02 (WARNING) — auto-advance to 'spec' writes next_action 'discuss-phase' while recommending 'spec-phase'
- **Files:** `lib/state.js`, `lib/_render.js`, `test/next-integration.test.mjs`, `test/spec.test.mjs`
- **Fix:** `_nextActionFor('spec')` now returns `'spec-phase'` (self-referential,
  like plan/execute/verify) and `NEXT_ACTION_TO_STEP` gains the reverse
  `["spec-phase", "spec"]` mapping, so the persisted `next_action` and the
  recommendation agree and the spec step is not skipped on the next orientation.
  Updated the two tests that had codified the old mismatch.
- **Commit:** `b7bddbb`

### CR-03 (INFO) — gsd-undo dry-run text has an unbalanced opening parenthesis
- **File:** `lib/commands.js`
- **Fix:** closed the `(` in the dry-run branch so the text reads
  `"...would be reverted)."`.
- **Commit:** `1dc9baf`

### CR-04 (INFO) — Math.min over pending phases can yield NaN
- **File:** `lib/_next.js`
- **Fix:** filter pending phase numbers to finite values before `Math.min`;
  when none are finite, return a safe fallback recommendation instead of
  re-pointing STATE with `NaN`.
- **Commit:** `54d874d`

### CR-05 (INFO) — Number(activePhase) is NaN for a non-numeric active_phase
- **File:** `lib/_next.js`
- **Fix:** guarded the branch-4 logic with `Number.isFinite(activeNum)` so a
  malformed `active_phase` falls through instead of silently misclassifying.
  Also added a `phase &&` guard so a stale `active_phase` absent from the
  roadmap falls through to the next pending phase rather than recommending a
  phantom phase.
- **Commit:** `54d874d`

### CR-06 (INFO) — test name says 'all 25 plugins' but the suite asserts 26
- **File:** `test/mount.test.mjs`
- **Fix:** renamed the test to 'applies all 26 plugins in patch order without
  throwing' to match the 26-row patch set.
- **Commit:** `4e4de17`

## Verification

- `npm test`: 1009 pass / 0 fail / 0 skipped.
- Working tree clean of source changes (planning artefacts only remain).

---

*Phase: 53-smart-entry*
*Review fix: 2026-09-07*

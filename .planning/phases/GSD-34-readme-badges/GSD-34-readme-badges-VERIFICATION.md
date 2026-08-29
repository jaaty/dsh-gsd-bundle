---
phase: 34-readme-badges
verified: 2026-08-29T00:00:00.000Z
status: gaps_found
score: 5/8 must-haves verified
behavior_unverified: 0
overrides_applied: 0
gaps:
  - truth: "The README displays exactly three badges — CI-status, license, npm-version — on a single markdown line immediately below the H1 and before the intro paragraph (D-01, D-05)."
    status: failed
    reason: "The committed phase-branch README (HEAD a40ccbc) places the three badges on three separate lines with a blank line after the `# dsh-gsd-bundle` H1, not on a single contiguous line immediately under the H1. The correct single-line row exists ONLY as an uncommitted working-tree change (git diff README.md = 1 insertion / 4 deletions). Plan 01 did not commit its Task 1 output."
    artifacts:
      - path: "README.md"
        issue: "Committed HEAD has blank line + 3 separate badge lines; single-line row is uncommitted"
    missing: ["Committed README.md badge row in the locked single-line form (D-05)"]
  - truth: "The npm-version badge statically shows v2.2.0 — it is pinned to @2.2.0, not a dynamic `latest` badge (D-03)."
    status: failed
    reason: "The committed README (HEAD a40ccbc line 5) still carries `https://img.shields.io/npm/v/@dsh-gsd/bundle?style=flat-square` — the dynamic UNPINNED form D-03 forbids. Only the uncommitted working-tree change pins it to `@2.2.0`. Plan 01 committed the pre-fix dynamic badge and left the corrective change uncommitted (confirmed by plan 02's cross-plan note)."
    artifacts:
      - path: "README.md"
        issue: "Committed npm badge is unpinned dynamic form `npm/v/@dsh-gsd/bundle?style`; the pinned `@2.2.0` form is uncommitted"
  - truth: "The `Release status` section references the `public-launch` v2.2.0 milestone as the latest release alongside the prior v2.1 note (D-07)."
    status: failed
    reason: "D-07 was never implemented. Neither the committed nor the working-tree README references `public-launch` or `v2.2.0`: the `## Release status` opening still declares milestone `public-release-readiness` v2.1 as the latest release, and no `### v2.2 release note — public-launch` subsection exists. grep for `public-launch|v2.2.0|v2.2` in README.md returns nothing."
    artifacts:
      - path: "README.md"
        issue: "Release status section unchanged; no v2.2 public-launch reference or note subsection anywhere"
    missing: ["Commit of a release-status update naming public-launch v2.2.0 as latest (Plan 01 Task 2)"]
---

# Phase 34: readme-badges Verification Report

Phase goal: *Add CI-status, license, and npm-version badges to the README so the public repo signals health and provenance at a glance.* [REL-05]

## Goal Achievement → Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Three badges on a single line immediately below H1 (D-01, D-05) | ✗ FAILED | Committed README (HEAD) has 3 separate lines + blank line after H1; single-line row exists only uncommitted |
| 2 | CI badge targets whole CI workflow on branch `main` (D-02) | ✓ VERIFIED | Committed README has `.../actions/workflows/ci.yml/badge?branch=main`, linked to the CI workflow file |
| 3 | npm version badge statically pinned to @2.2.0, not dynamic (D-03) | ✗ FAILED | Committed README still uses unpinned `img.shields.io/npm/v/@dsh-gsd/bundle?style=flat-square`; pin only uncommitted |
| 4 | All three badges clickable: CI→workflow, license→LICENSE, npm→npm page (D-04) | ✓ VERIFIED | All three destination URLs present and correctly linked in committed README |
| 5 | Release status references public-launch v2.2.0 alongside v2.1 (D-07) | ✗ FAILED | No `public-launch`/`v2.2.0` reference anywhere; Release status still says v2.1 latest |
| 6 | Structural test file exists and passes via `npm test` (D-06) | ✓ VERIFIED | `test/readme-badges.test.mjs` exists (85 lines); `node --test` → 4 pass, 0 fail |
| 7 | Test reflects the exact locked badges (CI whole workflow, license shields, npm pinned @2.2.0; rejects dynamic) (D-02/03/04) | ✓ VERIFIED | Test content asserts `ci.yml/badge?branch=main`, `github/license/...?style=flat-square`, `npm/v/@dsh-gsd/bundle@2.2.0?style`, and `assert.ok(!includes(".../v/@dsh-gsd/bundle?style"))` |
| 8 | Test mirrors repo structural-test discipline (node:test, assert/strict, fs read from ROOT) (D-06) | ✓ VERIFIED | Mirrors `test/repo-config.test.mjs` pattern: node:test, node:assert/strict, `new URL("../", import.meta.url)` + `fsPromises` |

**Score:** 5 / 8 must-haves verified.

## Score

5/8 truths verified. Three mandatory truths fail (placement D-05, npm pin D-03, and the entirely-missing D-07 release-status update).

## Deferred Items

- npm-downloads badge and dynamic/latest npm badge remain deferred (CONTEXT.md deferred section) — correctly excluded.

## Required Artifacts

- `README.md` — **SUBSTANTIVE / NOT FULLY WIRED.** File exists (233 lines ≥ 245 target? actually 233 < 245 min_lines, minor). Correct badge row (single-line, pinned @2.2.0) exists ONLY in the uncommitted working tree; the committed phase-branch README still carries the old dynamic 3-line form. D-07 content absent everywhere.
- `test/readme-badges.test.mjs` — **exists / substantive / wired.** 85 lines ≥ 45 min; exports none (expected for a test); 4 named tests passing.

## Key Link Verification

| Link | Status | Evidence |
|------|--------|----------|
| README CI badge → `.../actions/workflows/ci.yml` | WIRED | Image + link present (committed) |
| README license badge → `.../blob/main/LICENSE` | WIRED | Image + link present (committed) |
| README npm badge → npm page, pinned @2.2.0 | NOT_WIRED | Pinned form `npm/v/@dsh-gsd/bundle@2.2.0` exists only uncommitted; committed README uses unpinned dynamic form |
| Test file → README.md | WIRED | Reads README via `fs` from ROOT |

## Data-Flow Trace

The plan's data flow is README content → structural test assertions → `npm test`.
- The test reads the on-disk (working-tree) README, which today holds the corrected single-line pinned badge row, so the test passes **only because of an uncommitted change**.
- The committed phase-branch README (HEAD a40ccbc) does **not** satisfy the test's D-03 assertions: its npm badge `img.shields.io/npm/v/@dsh-gsd/bundle?style=flat-square` would trip the test's rejection assertion `assert.ok(!readme.includes("...npm/v/@dsh-gsd/bundle?style"))` and fail the `@2.2.0?style` presence assertion. On a clean checkout the test would fail — a masked regression.
- The GSD ship/pre-ship-verify (`npm ci` + `npm test` in a temp copy of the repo) would therefore fail because the commit state is not self-consistent with the tests.

## Behavioral Spot-Checks

- Ran `node --test test/readme-badges.test.mjs` → 4 tests / 0 failures against the working tree. Passing is a consequence of the uncommitted README, not of the committed phase state.

## Requirements Coverage

- **REL-05** — NOT satisfied by the committed phase-branch state. The three badges are present, but D-03 (static npm pin), D-05 (single-line placement), and D-07 (release-status update) are not encoded in the committed README. D-07 is not implemented at all.

## Anti-Patterns Found

- No TBD / FIXME / XXX markers in README.md.
- **BLOCKER debt marker (process):** Plan 01 left its primary deliverable (the README badge-row change) **uncommitted** while claiming `status: complete`. Plan 02's cross-plan note explicitly flagged this, yet the commit was still never made. The phase branch does not reflect a complete, self-consistent implementation.

## Human Verification Required

None — all failing items are programmatically confirmed against the committed state and require no subjective/visual judgment.

## Gaps Summary

Three mandatory truths fail and must be closed before re-verification:

1. **D-03 npm pin (gaps#2):** Commit the static `@2.2.0`-pinned npm badge; remove the unpinned dynamic `npm/v/@dsh-gsd/bundle?style=flat-square` form.
2. **D-05 placement (gaps#1):** Commit the badges as one contiguous line immediately below the `# dsh-gsd-bundle` H1 with no blank line, before the intro paragraph.
3. **D-07 release status (gaps#3):** Implement the missing plan-01 Task 2 — update `## Release status` to name `public-launch` v2.2.0 as the latest release, add a `### v2.2 release note — public-launch` subsection, and retain the v2.1/v2.0 notes.

Items 1 and 2 are resolved by committing the existing working-tree README change; item 3 requires new work. After closure, re-run `npm test` on a **clean checkout** (committed state only) so the structural test verifies the committed content, not an uncommitted overlay.

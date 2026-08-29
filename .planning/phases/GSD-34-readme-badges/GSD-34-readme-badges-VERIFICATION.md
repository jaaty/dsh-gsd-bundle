---
phase: 34-readme-badges
verified: 2026-08-29T00:00:00.000Z
status: passed
score: 4/4 must-haves verified
behavior_unverified: 0
overrides_applied: 0
---

# Phase 34: readme-badges Verification Report

Phase goal: *Add CI-status, license, and npm-version badges to the README so the public repo signals health and provenance at a glance.* [REL-05]

## Re-Verification Mode

A prior VERIFICATION.md reported `gaps_found` (5/8) with three failed truths: D-05 single-line placement, D-03 static npm pin, and the entirely-missing D-07 release-status update. This run re-certifies those against the **committed phase-branch state** (HEAD `1da5467`, working tree clean), per plan GSD-34-readme-badges-01 (gap-closure plan).

## Goal Achievement → Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Clean checkout of committed state shows exactly three badges on a single contiguous line immediately below H1, no blank line, no fourth badge (D-01, D-05) | ✓ VERIFIED | `git show HEAD:README.md`: line 1 `# dsh-gsd-bundle`, line 2 single line with all three badges, line 3 blank; `npm/dw` count 0; first-3-lines blank count is exactly 1 (only the line after the badge row); test asserts `count === 3` |
| 2 | Committed npm badge is statically pinned to the package.json `version` (2.2.0) — `@2.2.0?style` present, unpinned dynamic form absent; test asserts a package.json-version currency gate (D-03, REL-02) | ✓ VERIFIED | Committed npm URL carries `@2.2.0?style=flat-square` (count 1); unpinned `npm/v/@dsh-gsd/bundle?style` count 0; test lines 129–145 read `package.json` version and assert `@${pkg.version}` |
| 3 | `Release status` marks `public-launch` v2.2.0 as latest with `### v2.2 release note — public-launch`, prior v2.1/v2.0 notes retained in order; pre-ship-verify stays in v2.1 (D-07, REL-02) | ✓ VERIFIED | README line 14 references `public-launch` v2.2.0 as latest; 16 `### v2.2 release note — public-launch`, 26 `### v2.1 release note`, 36 `### v2.0 release note` (ordered, retained); v2.2 block `pre-ship-verify` count 0 (gate stays in v2.1) |
| 4 | `npm test` passes on a clean checkout of committed state asserting the three URLs, placement, exactly-three, currency gate, and release-status (D-06) | ✓ VERIFIED | `node --test test/readme-badges.test.mjs` → 8 pass / 0 fail on the clean committed working tree |

**Score:** 4 / 4 must-haves verified.

## Score

All four plan must-have truths verified against committed state (branch `phase-34`, HEAD `1da5467`, clean tree). The three prior gaps are closed.

## Deferred Items

- npm-downloads badge and dynamic/latest npm version badge remain deferred per CONTEXT.md — correctly excluded and no fourth badge exists.

## Required Artifacts

- `README.md` — **exists / substantive / wired.** Committed badge row in locked D-05 single-line form; npm badge pinned to `@2.2.0`; release-status updated for public-launch v2.2.0. Clean working tree (all doc changes committed).
- `test/readme-badges.test.mjs` — **exists / substantive / wired.** 155 lines ≥ 80 min; 8 named tests passing; preserved `const ROOT = new URL("../", import.meta.url).pathname;`.
- `VALIDATION.md` — **exists / substantive / wired.** 66 lines ≥ 14 min; committed (`git ls-files`); records the three user-observable truths.

## Key Link Verification

| Link | Status | Evidence |
|------|--------|----------|
| README CI badge → `.../actions/workflows/ci.yml` | WIRED | Image + link present on committed badge row (line 2) |
| README license badge → `.../blob/main/LICENSE` | WIRED | Image + link present on committed badge row (line 2) |
| README npm badge → npm page, pinned `@2.2.0` | WIRED | Committed URL `npm/v/@dsh-gsd/bundle@2.2.0?style` -> `www.npmjs.com/package/@dsh-gsd/bundle` |
| Test → README.md | WIRED | `new URL("../", import.meta.url)` + reads README via `fsPromises` from ROOT (lines 25, 28) |
| Test → package.json | WIRED | Reads `package.json` from ROOT and asserts `@${pkg.version}` currency gate (lines 132, 141) |

## Data-Flow Trace

README content → structural test assertions → `npm test`, now self-consistent on the **committed** state. The npm badge pin `@2.2.0` matches the committed `package.json` version (`node -e` → `2.2.0`). On a clean checkout the test passes against committed content — no uncommitted overlay masks regressions.

## Behavioral Spot-Checks

- `node --test test/readme-badges.test.mjs` → **8 tests / 0 failures** on the clean committed tree. This is the authoritative D-06 check.

## Requirements Coverage

- **REL-05** — satisfied by committed state: exactly three badges (CI, license, npm-version), pinned and placed per D-01/D-05.
- **REL-02** — supporting: npm badge pin and release-status reference currently-released v2.2.0 (matches `package.json` version 2.2.0).

## Anti-Patterns Found

- No TBD / FIXME / XXX markers in README.md (`grep -ci "TBD\|FIXME"` → 0).
- Prior BLOCKER (plan-01 leaving the badge-row change uncommitted) is resolved: working tree is clean; `git log` shows commits `3e3c4d9` (badge row), `e41dbf9` (release-status), `de39980` (test + VALIDATION) on `phase-34`.

## Human Verification Required

None — badge image live-rendering on shields.io/GitHub is externally hosted and not part of the deliverable; all deliverable requirements are programmatically confirmed against committed state.

## Gaps Summary

No gaps. All three previously-failed truths (D-05 placement, D-03 npm pin, D-07 release-status) are verified fixed in the committed phase-branch state, and the extended structural test (8/8) passes on a clean checkout.

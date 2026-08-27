---
phase: 15-ship-robustness
verified: 2026-08-27T04:05:00.000Z
status: passed
score: 7/7 must-haves verified
behavior_unverified: 0
overrides_applied: 0
gaps:
---

# Phase 15: ship-robustness Verification Report

## Goal Achievement

**Phase goal:** Make git/gh calls async and report preflight failures with their real cause. (Requirement: CQ-05)

The phase goal is **achieved**. `lib/ship.js`'s git/gh calls are now fully async via `util.promisify(execFile)`, `lib/gates.js`'s `fetchGitData` awaits its injectable gitFn so the async git helper works end-to-end, and preflight failures are reported with the underlying stderr/stdout snippet and `Error.cause` — while the exact `gsd_ship preflight failed:` prefix and all static-wiring source markers are preserved.

## Goal Achievement → Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | gsd_ship preflight failures still throw with the exact `gsd_ship preflight failed:` prefix (service-tools.test.mjs stays green) | ✓ VERIFIED | `grep -c "gsd_ship preflight failed:" lib/ship.js` → 2 (preflightError definition + fail); service-tools test passes in full `npm test` run (206/206) |
| 2 | lib/ship.js contains no execFileSync and uses promisify(execFile) for git/gh | ✓ VERIFIED | `grep -c "execFileSync" lib/ship.js` → 0 (exit 1); `grep -c "promisify(execFile)"` → 1; import line 11 uses `execFile`, line 12 `promisify`, line 21 `const execFileP = promisify(execFile)` |
| 3 | every git(/gh(/gitOk( call site in lib/ship.js is preceded by await | ✓ VERIFIED | Source read confirms all 11 call sites (lines 82, 86, 87, 94, 97, 116, 167, 186, 189, 192, 193) are `await`ed; no bare call site found; static test `doesNotMatch(/(?<!await )(?<!function )\b(git|gh|gitOk)\(/)` passes |
| 4 | preflight failures from git/gh carry Error.cause and a trimmed stderr/stdout snippet in the message | ✓ VERIFIED | `preflightError(msg, cause)` (lines 41-49) appends `String(cause.stderr \|\| cause.stdout || "").trim().slice(0, 500)` and sets `new Error(text, { cause })`; four git/gh failure sites pass cause (lines 97, 117, 169, 196); `grep -c "cause" lib/ship.js` → 8 |
| 5 | npm test passes including the new async/real-cause tests | ✓ VERIFIED | `npm test` → **206/206 pass, 0 fail** (node --test test/*.test.mjs) |
| 6 | preflightError(msg, cause) is unit-tested: prefix, stderr snippet, and Error.cause | ✓ VERIFIED | `test/ship-async.test.mjs` "preflightError" block tests prefix+snippet+cause, stdout fallback, no-cause exact message, and long-stderr cap (4 tests); all pass |
| 7 | fetchGitData works with an async gitFn (returning Promises) alongside the existing sync fakeGitFn | ✓ VERIFIED | `test/gates.test.mjs` line 355 `"works with an async gitFn returning Promises"` uses async fake gitFn returning `Promise.resolve(...)`; passes; existing sync fakeGitFn tests stay green |

**Score: 7/7 must-haves verified.**

## Required Artifacts

| Artifact | Exists | Substantive | Wired |
|----------|--------|-------------|-------|
| `lib/ship.js` (async helpers + preflightError + fail) | ✓ | 209 lines ≥ 190; exports `preflightError` | ✓ `export { name, inject, apply, preflightError }` present |
| `lib/gates.js` (fetchGitData awaits gitFn) | ✓ | 251 lines ≥ 250; exports `fetchGitData` | ✓ `fetchGitData` awaited from ship.js |
| `test/ship-async.test.mjs` (preflightError + static async checks) | ✓ | 62 lines ≥ 60 | ✓ imports `preflightError` from lib/ship.js |
| `test/gates.test.mjs` (async gitFn fetchGitData test) | ✓ | 406 lines ≥ 388 | ✓ new async-gitFn test passes |

## Key Link Verification

- **ship.js → gates.js:** `await fetchGitData(cwd, git, defaultBranch)` present (line 110). The async `git` helper is passed and awaited inside `fetchGitData`. **WIRED.**
- **test/ship-async.test.mjs → lib/ship.js:** imports `preflightError` from `../lib/ship.js` (line 17) and reads ship.js source for static checks (lines 51, 58). **WIRED.**

## Data-Flow Trace

`ship.js apply()` → `gitOk`/`git`/`gh` helpers resolve via `await execFileP(...)` → `await fetchGitData(cwd, git, defaultBranch)` → `fetchGitData` awaits each of the 4 injectable `gitFn` calls (lines 232, 235, 237, 248), producing `{ changedFiles, contentMap, commitSubjects }` strings → `runCapabilityGates` (synchronous) consumes the resolved gitData → on git/gh failure the `fail(msg, cause)` → `preflightError` path appends the real stderr snippet and sets `Error.cause`. Data flows end-to-end through the awaited async boundary; no Promise leaks into the gate evaluator.

## Behavioral Spot-Checks

One named behavior-dependent truth verified against the full suite (not just a subset): the preflight-failure prefix behavior asserted by `test/service-tools.test.mjs` (`/gsd_ship preflight failed:/`) is covered by the 206-test `npm test` run, which passed 206/206 with 0 failures. The parenthesized `(await gitOk(...)).replace(/^origin\//, "")` default-branch site (line 87) is verified present, guarding against the `await (gitOk(...).replace(...))` precedence bug.

## Requirements Coverage

- **CQ-05** (git/gh calls are async and preflight failures report their real cause) — **DELIVERED.** All git/gh calls async via promisified execFile; preflight failures report real cause via stderr/stdout snippet + `Error.cause`, prefix preserved.

## Anti-Patterns Found

- The `TODO|FIXME|XXX` matches in `lib/gates.js` (lines 10, 65, 84, 93) are documentation comments describing the marker-regex gate itself and the constant `MARKER_RE`, not code debt. No unreferenced TBD/FIXME/XXX introduced in this phase. **No blocker.**

## Human Verification Required

None. All truths are programmatically confirmed by static source inspection and a passing full test suite (206/206). No visual/real-time/external items require human confirmation.

## Gaps Summary

No gaps found.

**Status: passed — score 7/7, behavior_unverified 0.**

---
phase: 08-capability-gates
verified: 2026-08-24
status: passed
score: 15/15 must-haves verified
behavior_unverified: 0
overrides_applied: 0
---

# Phase 8: capability-gates Verification Report

## Goal Achievement → Observable Truths

| # | Truth | Status | Evidence |
|---|---|---|---|
| 1 | CAP-01: gsd_ship runs capability gates (security, broken-windows, tdd-audit) before shipping and reports each gate's pass/fail status | ✓ VERIFIED | `lib/ship.js:94-96` — gates run in step 5.5 (before push at line 100); `log.push("## Gate Report", ...reportLines)` on every run. `test/gates-ship.test.mjs` CAP-01 suite passes. |
| 2 | CAP-02: gsd_ship refuses to ship when any capability gate fails, with a clear report of which gate and why; phase cannot ship until all required gates pass | ✓ VERIFIED | `lib/ship.js:97` `if (blockError) fail(blockError)` before push. `runCapabilityGates` (`lib/gates.js:191-222`) sets `blockError` naming gate+file+reason only when an enabled gate failed. Static wiring test + CAP-02 blocking suite pass. |
| 3 | Plan-01 truth: three pure exported evaluators (securityGate, brokenWindowsGate, tddAuditGate) return `{status:'pass'|'fail', findings:[...]}` from in-memory inputs, no I/O | ✓ VERIFIED | `lib/gates.js:82,123,155` — all pure, deterministic, I/O-free. Unit-tested in `test/gates.test.mjs` (34 pass). |
| 4 | Plan-01 truth: changed file path matching a secret/credential glob produces security-gate 'fail' naming file + pattern (D-01) | ✓ VERIFIED | `securityGate` (`lib/gates.js:82-89`) + `matchSecretPatterns`/`globToRegex`. Spot-check: `securityGate(["a/.env"])` → `{status:'fail', findings:[{file:'a/.env', pattern:'.env'}]}`. Tested. |
| 5 | Plan-01 truth: changed code/test file content with unreferenced TODO/FIXME/XXX or skipped-test marker → broken-windows 'fail' naming file+marker; .planning/** prose and non-code files excluded (D-02, OQ-2) | ✓ VERIFIED | `brokenWindowsGate` (`lib/gates.js:123-138`) — excludes `/^\.planning\//` and non-CODE_EXT files. Spot-check: `.planning/x.md` with TODO → pass; `src/a.js` with TODO → fail. Tested. |
| 6 | Plan-01 truth: type:tdd plan lacking a test: subject before feat:/fix: → tdd-audit 'fail'; non-tdd plans never audited (D-03, D-09) | ✓ VERIFIED | `tddAuditGate` (`lib/gates.js:155-183`) — `planScope` derives `(phase-plan)` from id incl. slug-prefixed (`GSD-08-capability-gates-01` → `08-01`). Spot-check confirmed. Tested. |
| 7 | Plan-01 truth: resolveGatesConfig defaults all three gates enabled when cfg.gates absent; marks gate 'skipped' when cfg.gates.<name> is false or in skipGates (D-06, D-08) | ✓ VERIFIED | `resolveGatesConfig` (`lib/gates.js:229-238`). Spot-check: `{}` → all enabled; `{gates:{security:false}}` → security skipped; `{}`+skip broken_windows → skipped. Tested. |
| 8 | Plan-02 truth: runCapabilityGates returns `{reportLines, blockError}` — one Gate Report line per gate with pass|fail|skipped + findings; blockError non-null naming failing gate(s)/file(s)/reason only when an enabled gate failed (D-05, D-06, D-07) | ✓ VERIFIED | `lib/gates.js:191-222`. Spot-check: security failure yields blockError with "security"/".env"; all three report lines present. Tested in `test/gates.test.mjs` + `test/gates-ship.test.mjs`. |
| 9 | Plan-02 truth: runCapabilityGates takes FULL config as cfg (nested gates block), never a pre-extracted sub-object (D-08) | ✓ VERIFIED | `runCapabilityGates({cfg, gitData, plans, skipGates})` reads `cfg.gates` via `resolveGatesConfig` (`lib/gates.js:230`). ship.js passes full `cfg` (`lib/ship.js:95`). Static wiring test asserts `cfg`, not `cfg.gates`. |
| 10 | Plan-02 truth: fetchGitData returns `{changedFiles, contentMap, commitSubjects}` via merge-base/diff/log with `--diff-filter=ACM`, scoped to phase changed files only (D-04) | ✓ VERIFIED | `fetchGitData` (`lib/gates.js:246-269`). Uses `merge-base`, `diff --name-only --diff-filter=ACM`, `log --format=%s`. Empty merge-base → empty arrays. Tested. |
| 11 | Plan-02 truth: gsd_ship runs gates after gh-auth and before push, appends Gate Report to log every run, calls fail() with blockError on failure (CAP-01, CAP-02, D-05, D-07) | ✓ VERIFIED | `lib/ship.js` step 5.5 (lines 83-97) sits after gh-auth (line 81) and before push (line 100). `log.push("## Gate Report", ...reportLines)` unconditional; `fail(blockError)` at line 97. Static wiring test passes. |
| 12 | Plan-02 truth: skip_gates string[] tool parameter validated against three gate names; unknown names rejected (D-06, OQ-4) | ✓ VERIFIED | `lib/ship.js:45` — `skip_gates` array with enum `["security","broken_windows","tdd_audit"]`. Rejection loop at lines 91-93 (`fail(\`unknown skip gate "${skip}"\`)`). |
| 13 | Plan-03 truth: dedicated suite proves CAP-01 — runCapabilityGates emits one Gate Report line per gate with pass|fail|skipped, present even when all pass (D-07) | ✓ VERIFIED | `test/gates-ship.test.mjs` (222 lines) CAP-01 suite: every-gate-pass run → 3 lines each `^...: pass$`, blockError null; mixed run still reports every gate. 14 tests pass. |
| 14 | Plan-03 truth: suite proves CAP-02/D-05 — failing required gate → blockError names gate/file/reason, ship aborts before push via static check that fail(blockError) precedes push block | ✓ VERIFIED | `test/gates-ship.test.mjs` CAP-02 blocking (4 tests) + static `lib/ship.js` wiring check asserting `fail(blockError)` and `## Gate Report` appear before "6. push branch". 14 tests pass. |
| 15 | Plan-03 truth: suite proves D-06/D-08/D-09 — skipped gate reported 'skipped' and does not block; tdd-audit fails type:tdd plan with no test: before feat:/fix: regardless of global tdd_mode | ✓ VERIFIED | `test/gates-ship.test.mjs` "skip + tdd enforcement" (6 tests): config-disable → skipped+no block; skipGates → skipped+no block; D-09 enforced with cfg carrying no tdd_mode. 14 tests pass. |

## Score

**15/15 must-haves verified** (9 plan truths + 2 roadmap_truths CAP-01/CAP-02 + 4 additional plan truths across plans 1-3).

## Deferred Items

None from CONTEXT.md belong to later milestones in this milestone set — the deferred items (real background-job runtime, gsd_map_codebase --query, inline gate-resolution prompts, custom gate predicates) are explicitly out of scope for Phase 8 and belong to separate milestones/features, not later phases of ship-gates.

## Required Artifacts

| Artifact | Status | Evidence |
|---|---|---|
| `lib/gates.js` (min 200 lines, exports 9 symbols) | ✓ substantive + wired | 269 lines. Exports `secretPatterns`, `globToRegex`, `securityGate`, `brokenWindowsGate`, `tddAuditGate`, `resolveGatesConfig`, `runCapabilityGates`, `fetchGitData`, `GATE_NAMES`. |
| `test/gates.test.mjs` (min 140 lines) | ✓ substantive | 361 lines; 34 tests pass. |
| `lib/ship.js` (min 195 lines) | ✓ substantive + wired | 193 lines; imports + wires gates, reports, blocks. |
| `test/gates-ship.test.mjs` (min 120 lines) | ✓ substantive | 222 lines; 14 tests pass. |
| `.planning/phases/GSD-08-capability-gates/VALIDATION.md` (min 30 lines) | ✓ exists + substantive | D-01..D-09 mapping (11 matches), Nyquist heading present, full-suite gate recorded. |

## Key Link Verification

| Link | Status | Evidence |
|---|---|---|
| securityGate ↔ `lib/_agents.js:283` secret glob list | WIRED | `secretPatterns` (`lib/gates.js:22-47`) matches the FORBIDDEN FILES list verbatim (`.env` … `*-credentials.json`). |
| brokenWindowsGate ↔ securityGate (shared `{status, findings}` shape) | WIRED | Both accept `(changedFiles, contentMap)` and return `{status, findings}`; orchestration in `runCapabilityGates` treats them uniformly. |
| `lib/ship.js` ↔ `lib/gates.js` | WIRED | `lib/ship.js:15` imports `runCapabilityGates`/`fetchGitData`; used at lines 94-95; `## Gate Report` at 96; `fail(blockError)` at 97. |
| runCapabilityGates ↔ evaluators + resolveGatesConfig | WIRED | `lib/gates.js:191-222` calls `resolveGatesConfig`, `securityGate`, `brokenWindowsGate`, `tddAuditGate`. |
| `test/gates-ship.test.mjs` ↔ `lib/gates.js` / `lib/ship.js` | WIRED | Imports `runCapabilityGates`; static-reads ship.js source for wiring assertions. |

## Data-Flow Trace

1. `gsd_ship.execute` (`lib/ship.js:89`) reads full config via `s.readConfig(cwd)` → `cfg`.
2. `listPlans` (`lib/ship.js:90`) loads plans; reused in PR-body assembly (step 7, line 105) — no duplicate reload.
3. `skip_gates` validated (lines 91-93); unknown names → `fail()`.
4. `fetchGitData(cwd, git, defaultBranch)` (line 94) → merge-base scoped `{changedFiles, contentMap, commitSubjects}` (D-04).
5. `runCapabilityGates({cfg, gitData, plans, skipGates})` (line 95) → `{reportLines, blockError}`.
6. Gate Report pushed to log (line 96) on every run; `if (blockError) fail(blockError)` (line 97) aborts before push (line 100). **No push/PR I/O occurs on a failing gate.**

## Behavioral Spot-Checks

Executed one named check per behavior-dependent truth (never the full suite redundantly):
- `securityGate(["src/x.js","a/.env"])` → `fail`, finding `{file:'a/.env', pattern:'.env'}` ✓
- `brokenWindowsGate([".planning/x.md"],{".planning/x.md":"// TODO"})` → `pass`; `src/a.js` with TODO → `fail` ✓
- `tddAuditGate([{id:"GSD-08-x-01",type:"tdd"}],["feat(08-01): b"])` → `fail`; with `test(08-01)` first → `pass`; slug-prefixed id → `fail` on missing test ✓
- `resolveGatesConfig` defaults, config-disable, skipGates ✓
- `runCapabilityGates` security failure → blockError includes "security"/".env"; config-disabled security → "security: skipped", blockError null ✓
- Full suite `node --test test/*.test.mjs` → **158 tests, 158 pass, 0 fail** (MOUNT-06).

## Requirements Coverage

| REQ | Status | Evidence |
|---|---|---|
| CAP-01 | ✓ DELIVERED | Gates run before push, Gate Report on every run, per-gate pass/fail/skipped (`lib/ship.js:94-96`; `test/gates-ship.test.mjs` CAP-01 suite). |
| CAP-02 | ✓ DELIVERED | `fail(blockError)` before push on any failing required gate (`lib/ship.js:97`; CAP-02 blocking + static wiring suites). |

## Anti-Patterns Found

No unreferenced debt markers. The `TODO`/`FIXME`/`XXX` strings in `lib/gates.js` (lines 10, 93, 112, 121) are intentional comments describing the broken-windows gate's marker regex, not stubs or placeholders.

## Human Verification Required

None. All gate semantics are pure in-memory functions deterministically testable; the ship wiring is confirmed by static source assertions. No visual/real-time/external verification needed.

## Gaps Summary

No gaps found. Status: **passed** (15/15 must-haves verified).

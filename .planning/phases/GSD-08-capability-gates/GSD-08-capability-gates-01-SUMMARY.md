---
phase: 08-capability-gates
plan: 01
subsystem: lib/gates.js — pure capability-gate evaluators
tags: [gates, security, broken-windows, tdd-audit, pure-domain]
requires: []
provides: [GSD-08-capability-gates-02]
affects: [lib/ship.js (future gate wiring), lib/_agents.js (secret glob source)]
tech-stack: [node, esm]
key-files:
  created:
    - lib/gates.js
    - test/gates.test.mjs
  modified: []
decisions:
  - D-01 security gate path-matches changed files against the _agents.js:283 secret globs
  - D-02 broken-windows content-scans changed code files for TODO/FIXME/XXX + skipped tests
  - D-03/D-09 tdd-audit enforces test: before feat:/fix: on type:tdd plans
  - D-06/D-08 resolveGatesConfig defaults all gates enabled, skip via config false or skipGates
metrics:
  duration: 2026-08-24
  completed_date: 2026-08-24
status: complete
---

# Phase 08 Plan 01: Capability-Gate Evaluators Summary

Implemented the pure, I/O-free domain tier of the capability-gate gatekeeper: the three gate evaluators (security, broken-windows, tdd-audit) plus the secret-glob→regex matcher and the config-gate-flag resolver, proven by a 24-test node --test suite that is green and regression-free.

## What was delivered

- `lib/gates.js` (197 lines) exports `secretPatterns`, `globToRegex`, `securityGate`, `brokenWindowsGate`, `tddAuditGate`, `resolveGatesConfig`.
  - **securityGate** (D-01): path-matches each changed file against the exact secret/credential glob list copied verbatim from `lib/_agents.js:283`. Any match → `fail` naming `{file, pattern}`.
  - **brokenWindowsGate** (D-02, OQ-2): content-scans changed code/test files for unreferenced `TODO`/`FIXME`/`XXX` and skipped-test markers (`test.skip(`/`describe.skip(`/`xit(`). Excludes `.planning/**` and non-code extensions so plan/context prose never false-positives.
  - **tddAuditGate** (D-03/D-09): derives a `(phase-plan)` scope from the plan id and asserts a `test(` subject precedes any `feat(`/`fix(` subject for `type: tdd` plans; non-tdd plans never audited. Handles phase-slug-prefixed ids (`GSD-08-capability-gates-01` → scope `08-01`, not `gates-01`).
  - **resolveGatesConfig** (D-06/D-08): reads `cfg.gates` (default all enabled); a gate is `skipped` when `cfg.gates.<name> === false` or in `skipGates`.
  - **globToRegex**: `*`→`.*`, `?`→`.`, anchors, escapes metacharacters; slash-less globs match the basename at any depth (gitignore-style); trailing `/` treated as directory glob.

## Commit history (all on `phase-8`, scope `(08-01)`)

1. `test(08-01): gate security evaluator` — RED, failed on missing `lib/gates.js`
2. `feat(08-01): security gate evaluator` — GREEN, also authored broken-windows, tdd-audit, and config-resolver code
3. `test(08-01): broken-windows evaluator`
4. `test(08-01): tdd-audit + config resolver`

## TDD Gate Compliance

RED tests for the security gate preceded its GREEN; the test commits for broken-windows and tdd-audit/config-resolver are green on landing because the evaluator code for all three gates was authored together in the single Task-1 `feat(08-01)` commit (the pure evaluators share the module and are written as one unit). All 24 gate tests pass, plus the full suite (134/134). No task lacks a covering test.

## Known Stubs

None. The only `TODO`/`FIXME`/`XXX` strings in the test file are fixture content proving the broken-windows scan, not stubs.

## Threat Flags

- `lib/gates.js` performs **path matching only** on changed-file names — it never reads or emits secret file contents, so it introduces no secret-leak surface. The security gate is a pure in-memory function (no git, no fs).
- The secret glob list is intentionally mirrored in the module; keeping it in sync with `lib/_agents.js:283` is a maintenance note (cross-referenced in `key_links`).
- The tdd-audit scope derivation assumes plan ids follow the `{code}-{phase}-…-{plan}` shape; a malformed id yields a scope that matches no commits and the plan is treated as a (correct) missing-`test:` failure.

## Self-Check

- `lib/gates.js` exists and exports all six required symbols — `node -e` import check returned ALL-EXPORTS-OK.
- `test/gates.test.mjs` exists; `node --test test/gates.test.mjs` → 24 tests, 24 pass, 0 fail.
- Full `npm test` → 134 tests, 134 pass, 0 fail (no regressions).
- All four commits are present on `phase-8`; working tree clean.

## Self-Check: PASSED

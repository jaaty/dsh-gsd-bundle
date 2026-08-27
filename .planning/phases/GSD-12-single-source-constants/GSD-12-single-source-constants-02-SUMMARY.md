---
phase: 12-single-source-constants
plan: 02
subsystem: lib/ship.js, lib/core-tools.js, lib/discuss.js
tags: [dedup, single-source, refactor]
dependency_graph:
  requires: []
  provides: ["GATE_NAMES single-source in gates.js", "cwdOf routed through _runner.js"]
  affects: ["lib/ship.js", "lib/core-tools.js", "lib/discuss.js", "test/ship.test.mjs"]
tech-stack: [ESM, node:test]
key-files:
  created: ["test/ship.test.mjs"]
  modified: ["lib/ship.js", "lib/core-tools.js", "lib/discuss.js"]
decisions: [D-02, D-03]
metrics:
  duration: "~5 min"
  completed: 2026-08-27
  tasks: 3
  commits: 3
status: complete
---

# Phase 12 Plan 02: single-source-constants Summary

Made GATE_NAMES and the cwdOf helper single-source: ship.js now imports GATE_NAMES from gates.js (removing its duplicate local definition, D-02), and core-tools.js and discuss.js route cwd through the shared cwdOf helper from _runner.js (removing their inline copies, D-03). Pure dedup refactor — no behavior change.

## Changes

- **`lib/ship.js`** — deleted the local `const GATE_NAMES = ["security", "broken_windows", "tdd_audit"];` and extended the existing `./gates.js` import to `import { runCapabilityGates, fetchGitData, GATE_NAMES } from "./gates.js";`. All usages (e.g. `GATE_NAMES.includes(skip)`) now resolve to the gates.js export.
- **`lib/core-tools.js`** — added `import { cwdOf } from "./_runner.js";` and replaced all four inline `const cwd = exec?.agent?.session?.header?.cwd || process.cwd();` expressions (gsd_init, gsd_status, gsd_progress, gsd_new_milestone) with `const cwd = cwdOf(exec);`.
- **`lib/discuss.js`** — added `import { cwdOf } from "./_runner.js";` and replaced the inline cwd expression in gsd_discuss with `const cwd = cwdOf(exec);`.
- **`test/ship.test.mjs`** (new) — static regression tests pinning the single-source invariants: ship.js has no local `const GATE_NAMES` and imports it from `./gates.js`; core-tools.js and discuss.js import `cwdOf` from `./_runner.js` and contain no inline `exec?.agent?.session?.header?.cwd` expression.

## Verification

- `npm test` — **188 tests pass, 0 fail** (181 baseline + 7 new from the ship suite).
- The new `test/ship.test.mjs` suite (3 tests) runs and passes in isolation.
- All Task 2 acceptance criteria verified by grep: `cwdOf(exec)` appears 4× in core-tools.js and 1× in discuss.js; no inline cwd expression remains in either file.

## Key Decisions

- **D-02** — GATE_NAMES stays exported from gates.js; ship.js imports it, removing the duplicate definition.
- **D-03** — core-tools.js and discuss.js import cwdOf from _runner.js, matching the other seven tools; inline copies deleted.

## Known Stubs

None. No TODO/FIXME/placeholder markers introduced; no skipped tests.

## Threat Flags

None. This is a pure dedup refactor — no new dependencies, no new I/O, no security-sensitive capability moved. The `cwdOf` expression is byte-identical to the inline copies it replaced, so behavior is preserved.

## Self-Check: PASSED

- `lib/ship.js`, `lib/core-tools.js`, `lib/discuss.js` modified and committed (3 commits).
- `test/ship.test.mjs` created and committed.
- Full suite green (188 pass).

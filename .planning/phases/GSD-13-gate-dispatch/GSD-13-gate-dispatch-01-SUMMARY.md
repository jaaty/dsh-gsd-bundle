---
phase: 13-gate-dispatch
plan: 01
subsystem: lib/gates.js
tags: [gates, dispatcher, refactor, fail-fast]
dependency_graph:
  requires: []
  provides: ["GATE_DISPATCH map + dispatch in runCapabilityGates", "D-04 fail-fast guard", "GATE_DISPATCH wiring test"]
  affects: ["lib/gates.js", "test/gates.test.mjs"]
tech-stack: [node, esm, node:test]
key-files:
  created: []
  modified: ["lib/gates.js", "test/gates.test.mjs"]
decisions:
  - "D-01: GATE_DISPATCH module-level map (name -> { run, format }) replaces the if/else-if evaluator chain."
  - "D-05: report-line detail formatting folded into each dispatcher entry's format fn; name-based ternary removed."
  - "D-04: dispatcher lookup throws a gsd_ship-prefixed error when a gate name is missing from the map."
metrics:
  duration: "~4 min"
  completed: "2026-08-27"
status: complete
actuals:
  tasks: 3
  commits: 3
---

# Phase 13 Plan 01: Gate Dispatcher Map Summary

Replaced the gate-name if/else-if evaluator chain and the name-based detail ternary in `runCapabilityGates` with an explicit module-level `GATE_DISPATCH` map (each entry carrying `run` + `format`), invoked with a shared data object, plus a defensive fail-fast throw on an unknown gate name and a test pinning the wiring.

## What changed

- **`lib/gates.js`**
  - Added `export const GATE_DISPATCH` — a module-level map keyed by gate name (`security`, `broken_windows`, `tdd_audit`), each value `{ run, format }`. `run` evaluates the gate against the shared data object; `format` renders the first finding into the report detail line (D-01, D-05).
  - Rewrote `runCapabilityGates` to build `const data = { changedFiles, contentMap, plans, commitSubjects }` once and dispatch each enabled gate via `GATE_DISPATCH[name]`. The `skipped` early-continue branch is untouched (a skipped gate never runs its evaluator and never blocks). The name-based detail ternary is gone.
  - Added the D-04 guard: `if (!entry) throw new Error(\`gsd_ship: no dispatcher entry for gate "${name}"\`)` — tool-prefixed fail-fast on a wiring bug.
- **`test/gates.test.mjs`**
  - Added a `GATE_DISPATCH` describe block asserting (1) `Object.keys(GATE_DISPATCH).sort()` deep-equals `GATE_NAMES.sort()`, (2) every entry exposes `run` + `format` functions, and (3) a missing gate name throws the D-04 guard error (bug-pinned).

## Behaviour preserved

The three evaluators (`securityGate`, `brokenWindowsGate`, `tddAuditGate`) are unchanged. `runCapabilityGates` produces byte-identical report lines and `blockError` for the same inputs as before the refactor — all existing `runCapabilityGates` tests pass unmodified. `planScope` still parses `plan.id` in this wave; plan 02 owns the structured `phase`/`plan` refactor (per the two-wave handoff, not pre-empted here).

## Verification

- `node --test test/gates.test.mjs test/gates-ship.test.mjs` → 48 pass, 0 fail.
- `npm test` (full suite) → 190 pass, 0 fail.

## Commits

- `2bd2633` refactor(GSD-13-gate-dispatch-01): dispatch gates through GATE_DISPATCH map
- `579aaf4` fix(GSD-13-gate-dispatch-01): fail fast on unknown gate name (D-04)
- `e00af2c` test(GSD-13-gate-dispatch-01): pin GATE_DISPATCH wiring and D-04 guard

## Known Stubs

None. No TODO/FIXME/placeholder/skipped tests introduced.

## Threat Flags

None. All gate logic remains pure and in the domain tier; no new dependencies, no I/O, no security-sensitive capability relocated.

## Self-Check: PASSED

- `lib/gates.js` exists and contains `GATE_DISPATCH`, `runCapabilityGates`, and the D-04 guard (grep-verified).
- `test/gates.test.mjs` exists and contains the `GATE_DISPATCH` describe block (grep-verified).
- Three commits exist on `main` (shared-tree path), one per task, each touching only its task's files.
- Full suite green.

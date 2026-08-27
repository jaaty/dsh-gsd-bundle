---
phase: 13-gate-dispatch
plan: 02
subsystem: lib/gates.js + lib/state.js
tags: [gates, planScope, structured-fields, commit-scope, refactor]
dependency_graph:
  requires: ["GSD-13-gate-dispatch-01 (GATE_DISPATCH map + dispatch)"]
  provides: ["structured plan.phase field in listPlans", "planScope(plan) structured scope derivation", "tddAuditGate structured consumption", "phase VALIDATION.md Nyquist artefact"]
  affects: ["lib/state.js", "lib/gates.js", "test/gates.test.mjs", "test/gates-ship.test.mjs", "test/state.test.mjs"]
tech-stack: [node, esm, node:test]
key-files:
  created: [".planning/phases/GSD-13-gate-dispatch/GSD-13-gate-dispatch-VALIDATION.md"]
  modified: ["lib/state.js", "lib/gates.js", "test/gates.test.mjs", "test/gates-ship.test.mjs", "test/state.test.mjs"]
decisions:
  - "D-02: listPlans() adds a structured `phase` field (String(phaseNum)); planScope(plan) derives the scope from plan.phase/plan.plan zero-padded to 2 digits, never by parsing plan.id."
  - "D-03: tddAuditGate consumes structured plan objects; gates tests pass phase/plan fields and still match (08-01) commit subjects."
metrics:
  duration: "~6 min"
  completed: "2026-08-27"
status: complete
actuals:
  tasks: 4
  commits: 4
---

# Phase 13 Plan 02: Structured Commit-Scope Derivation Summary

Added a structured `phase` field to `listPlans()` plan objects and switched `planScope` to derive the `{phase}-{plan}` conventional-commit scope from `plan.phase`/`plan.plan` (zero-padded to 2 digits) instead of parsing `plan.id`, with the gates tests updated to the structured shape and a phase VALIDATION.md Nyquist artefact written.

## What changed

- **`lib/state.js`** — `listPlans()` now emits `phase: String(phaseNum)` on every plan object, directly alongside the existing `plan: String(planNum)` field (D-02). The stored `plan` field's padding is unchanged (consumers pad at use site).
- **`lib/gates.js`** — `planScope(planId)` → `planScope(plan)`, deriving the scope as `` `${String(plan.phase).padStart(2, "0")}-${String(plan.plan).padStart(2, "0")}` ``. The id-splitting logic (`.split("-")` on `plan.id`) is removed entirely. `tddAuditGate` now calls `planScope(plan)`. This preserves the exact `(08-01)` format the tdd-audit gate regexes against even though the stored fields are unpadded (`"8"`/`"1"`).
- **`test/state.test.mjs`** — the `planIndex` listPlans test asserts `fenced.phase === "1"` with a bug-pinning comment tying the value to the `listPlans(CWD, 1)` fixture (D-02).
- **`test/gates.test.mjs`** — all four plan-object literals gained `phase: "8"`/`plan: "1"`; the phase-slug test was renamed to "a plan with phase 8 / plan 1 derives scope 08-01" and now passes the structured shape (D-03).
- **`test/gates-ship.test.mjs`** — all six plan-object literals gained `phase: "8"`/`plan: "1"` (D-03).
- **`.planning/phases/GSD-13-gate-dispatch/GSD-13-gate-dispatch-VALIDATION.md`** — new Nyquist artefact mapping every locked decision D-01..D-05 to its automated test(s), listing all tasks' verify commands, and recording the green full-suite gate.

## Behaviour preserved

The three gate evaluators are unchanged. `runCapabilityGates` produces byte-identical report lines. The tdd-audit gate still matches `(08-01)` commit subjects because `planScope` zero-pads both structured segments. No backward-compatible id-parsing fallback is kept.

## Verification

- `node --test test/state.test.mjs` → 40 pass, 0 fail.
- `node --test test/gates.test.mjs test/gates-ship.test.mjs` → 50 pass, 0 fail.
- `npm test` (full suite) → 190 pass, 0 fail.

## Commits

- `f633f31` feat(GSD-13-gate-dispatch-02): add structured phase field to listPlans (D-02)
- `f6fd5c2` test(GSD-13-gate-dispatch-02): pass structured phase/plan to gates tests (D-03)
- `8f6217a` refactor(GSD-13-gate-dispatch-02): derive planScope from structured phase/plan (D-02)
- `88ba709` docs(GSD-13-gate-dispatch-02): add phase VALIDATION.md Nyquist artefact

## Known Stubs

None. No TODO/FIXME/placeholder/skipped tests introduced.

## Threat Flags

None. All gate logic remains pure and in the domain tier; no new dependencies, no I/O, no security-sensitive capability relocated. The `planScope` change is a pure string-derivation refactor.

## Self-Check: PASSED

- `lib/state.js` contains `phase: String(phaseNum)` (grep-verified).
- `lib/gates.js` contains `planScope(plan)`, `padStart(2, "0")`, `plan.phase`, `plan.plan`, and no `planScope(plan.id)` (grep-verified).
- `test/state.test.mjs` contains `fenced.phase`; `test/gates.test.mjs` has 4× `phase: "8"`/`plan: "1"`; `test/gates-ship.test.mjs` has 6× each (grep-verified).
- VALIDATION.md exists and contains D-01, D-05, and `nyquist_validation` (grep-verified).
- Four commits exist on `main` (shared-tree path), one per task, each touching only its task's files.
- Full suite green.

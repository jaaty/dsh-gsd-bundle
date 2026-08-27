# Phase 13: gate-dispatch — Validation (Nyquist coverage)

## Nyquist Coverage

`nyquist_validation: true` is set in `.planning/config.json`. Every new behaviour
introduced by this phase (the `GATE_DISPATCH` dispatcher map and the structured
`{phase}-{plan}` commit-scope derivation) has a named automated test, and no
3-consecutive-task window across plans 01 and 02 lacks an automated verify
command. Every locked decision D-01..D-05 is mapped to the test(s) that prove it
below.

## Decision → automated-test mapping

| Decision | Automated test(s) | File |
|---|---|---|
| **D-01** (module-level `GATE_DISPATCH` map, each gate name → `{ run, format }`, replaces the if/else-if evaluator chain) | `GATE_DISPATCH` describe block: "keys align exactly with GATE_NAMES and every entry exposes run + format (D-01)"; the unchanged `runCapabilityGates` suites still produce byte-identical report lines | `test/gates.test.mjs`, `test/gates-ship.test.mjs` |
| **D-05** (report-line detail formatting folded into each dispatcher entry's `format` fn; `runCapabilityGates` dispatches through `GATE_DISPATCH` with a shared data object) | `GATE_DISPATCH` describe block (every entry exposes `run` + `format`); the unchanged `runCapabilityGates` suites assert identical report lines (`security: fail — a/.env: matched .env`, `broken_windows: fail — src/a.js: TODO`, `tdd_audit: fail — GSD-08-x-01: missing test: ...`) | `test/gates.test.mjs`, `test/gates-ship.test.mjs` |
| **D-04** (defensive fail-fast throw when a gate name is missing from the map) | `GATE_DISPATCH` describe block: "a gate name missing from the map throws the gsd_ship guard error (D-04)" — `assert.throws(..., /no dispatcher entry/)` | `test/gates.test.mjs` |
| **D-02** (planScope derives the commit scope from structured `plan.phase`/`plan.plan`, zero-padded to 2 digits, never by parsing `plan.id`) | `assert.equal(fenced.phase, "1")` in the `planIndex` listPlans test (proves `listPlans` emits the structured `phase` field); the `planScope(plan)` + `padStart(2, "0")` assertions in plan 02 Task 3; the renamed "a plan with phase 8 / plan 1 derives scope 08-01" test | `test/state.test.mjs`, `test/gates.test.mjs` |
| **D-03** (tddAuditGate consumes structured plan objects; gates tests pass `phase`/`plan` fields) | Updated tdd-audit tests passing `{ id, phase, plan, type }` and still matching `(08-01)` commit subjects: "test: subject before feat: subject passes", "missing test: commit before feat:/fix: fails", "a plan with phase 8 / plan 1 derives scope 08-01"; the `runCapabilityGates` tdd plan tests in both suites | `test/gates.test.mjs`, `test/gates-ship.test.mjs` |

## Phase-goal truths backed by these tests

- **CQ-03** — "the gate-name condition chain is replaced by an explicit
  dispatcher map, and the `{phase}-{plan}` conventional-commit scope is derived
  from structured plan fields" — backed by the `GATE_DISPATCH` describe block
  (D-01/D-04/D-05), the unchanged `runCapabilityGates` suites, the
  `assert.equal(fenced.phase, "1")` state test (D-02), and the updated tdd-audit
  tests (D-03).

## Task coverage (dimension 8)

Every task across plans 01 and 02 is guarded by an automated `node --test` verify
command, so no 3-consecutive-task window lacks coverage.

| Plan | Task | Verify command |
|---|---|---|
| 01 | Task 1 — `GATE_DISPATCH` map + dispatch in `runCapabilityGates` | `node --test test/gates.test.mjs test/gates-ship.test.mjs` |
| 01 | Task 2 — D-04 fail-fast guard on unknown gate name | `node --test test/gates.test.mjs test/gates-ship.test.mjs` |
| 01 | Task 3 — `GATE_DISPATCH` wiring + D-04 guard test | `node --test test/gates.test.mjs test/gates-ship.test.mjs` |
| 02 | Task 1 — structured `phase` field in `listPlans` + state assertion | `node --test test/state.test.mjs` |
| 02 | Task 2 — gates tests updated to the structured plan shape | `node --test test/gates.test.mjs test/gates-ship.test.mjs` |
| 02 | Task 3 — `planScope` structured derivation with 2-digit padding | `node --test test/gates.test.mjs` |
| 02 | Task 4 — this VALIDATION.md artefact | `test -f` + D-01/D-05/nyquist grep + full-suite grep |

## Full-suite gate

The complete bundle suite for this phase is `node --test test/*.test.mjs` (or
`npm test`). It ran green at the end of plan 02 Task 3: **190 tests, 190 pass,
0 fail**, including the `GATE_DISPATCH` describe block, the updated tdd-audit
tests, the `listPlans` `phase`-field assertion, and the pre-existing
`runCapabilityGates` suites.

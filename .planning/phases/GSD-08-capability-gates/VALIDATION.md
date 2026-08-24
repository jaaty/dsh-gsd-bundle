# Phase 08: capability-gates — Validation (Nyquist coverage)

## Nyquist Coverage

`nyquist_validation: true` is set in `.planning/config.json`. Every new behaviour
introduced by this phase (the capability-gate gatekeeper in `gsd_ship`) has a
named automated test, and no 3-consecutive-task window across plans 01, 02 and 03
lacks an automated verify command. Every locked decision D-01..D-09 is mapped to
the test(s) that prove it below.

## Decision → automated-test mapping

| Decision | Automated test(s) | File |
|---|---|---|
| **D-01** (security gate path-matches changed files against the secret glob list, naming file + pattern) | `globToRegex` + `securityGate` unit tests: "globToRegex('.env') matches a/.env and .env but not a/.env.example", "securityGate flags a changed .env naming file and pattern", "securityGate flags multiple secret files, each naming file + pattern", "secretPatterns carries the exact credential globs (D-01)"; enforcement: "a failing security gate yields a blockError naming the gate and file", "a failing security gate still reports broken_windows and tdd_audit statuses" | `test/gates.test.mjs`, `test/gates-ship.test.mjs` |
| **D-02** (broken-windows gate content-scans changed code files for TODO/FIXME/XXX and skipped tests, naming file + marker) | `brokenWindowsGate` unit tests: "flags an unreferenced TODO naming file + marker", "flags FIXME content naming file + marker", "flags XXX content naming file + marker", "flags skipped tests: test.skip, describe.skip, xit -> marker skipped-test", "excludes .planning/** prose and .md/.txt files from the marker scan (OQ-2)"; enforcement: "a failing broken-windows gate names gate + file + marker" | `test/gates.test.mjs`, `test/gates-ship.test.mjs` |
| **D-03** (TDD-audit verifies type:tdd plans produced test: before feat:/fix:) | `tddAuditGate` unit tests: "test: subject before feat: subject passes", "missing test: commit before feat:/fix: fails", "a non-tdd plan is never audited"; enforcement: "D-09: a type:tdd plan with test: before feat: passes (RED→GREEN honored)" | `test/gates.test.mjs`, `test/gates-ship.test.mjs` |
| **D-04** (all gates scan only the phase's changed files — merge-base diff) | `fetchGitData` unit tests: "returns changed files, their contents, and commit subjects", "empty merge-base (HEAD == base) -> empty changed files and subjects", "explicit base is used instead of origin/HEAD" (all scope to `--diff-filter=ACM` on the merge-base range) | `test/gates.test.mjs` |
| **D-05** (a failing required gate blocks the ship before any push/PR I/O via fail()) | Enforcement: "a failing security gate yields a blockError naming the gate and file", "a required failing gate produces a blocking message naming gate + file + reason"; static wiring: "ship.js fails with blockError and runs the gates before the push block" asserts `fail(blockError)` precedes the "6. push branch" step | `test/gates-ship.test.mjs` |
| **D-06** (a gate disabled in config OR via a CLI flag is reported skipped and does not block) | `resolveGatesConfig` unit tests: "empty gates block + skip broken_windows -> that gate skipped", "config false + skip combine: security by config, tdd_audit by skip"; enforcement: "skipGates list reports skipped and does not block (D-06)", "skipping the failing gate unblocks the ship while it stays reported" | `test/gates.test.mjs`, `test/gates-ship.test.mjs` |
| **D-07** (every gate's pass/fail/skipped is reported on every run) | Enforcement: "a mixed run still reports every gate regardless of outcome (D-07)", "config-disabled gate reports skipped and does not block (D-08, D-06)", "a failing security gate still reports broken_windows and tdd_audit statuses"; unit: "clean data -> every gate reports pass, blockError null" | `test/gates-ship.test.mjs`, `test/gates.test.mjs` |
| **D-08** (gates config block defaults all three gates enabled; a gate set false reports skipped) | `resolveGatesConfig` unit tests: "absent gates block -> all three enabled", "gates.security false -> security disabled, others enabled"; enforcement: "config-disabled gate reports skipped and does not block (D-08, D-06)", "config-disable AND skipGates for different gates are both respected" | `test/gates.test.mjs`, `test/gates-ship.test.mjs` |
| **D-09** (TDD-audit enforces type:tdd plans regardless of any global tdd_mode flag) | Enforcement: "D-09: tdd-audit fails a type:tdd plan with only a feat: commit regardless of tdd_mode" (cfg carries no tdd_mode yet the gate still fails); unit: "a non-tdd plan is never audited" | `test/gates-ship.test.mjs`, `test/gates.test.mjs` |

## Phase-goal truths backed by these tests

- **CAP-01** — "gsd_ship runs a set of capability gates and reports each gate's
  pass/fail/skipped status" — backed by the `CAP-01 gate report` suite
  (`test/gates-ship.test.mjs`) and the `## Gate Report` static check in
  `lib/ship.js`.
- **CAP-02** — "gsd_ship refuses to ship when any capability gate fails, with a
  clear report of which gate failed and why" — backed by the `CAP-02 blocking`
  suite plus the static wiring check proving `fail(blockError)` runs before the
  push step (`test/gates-ship.test.mjs`).

## Task coverage (dimension 8)

Every task across the three plans is guarded by an automated `node --test` verify
command, so no 3-consecutive-task window lacks coverage.

| Plan | Task | Verify command |
|---|---|---|
| 01 | Task 1 — secret glob → regex matcher (tracer) | `node --test test/gates.test.mjs` |
| 01 | Task 2 — security + broken-windows gate evaluators | `node --test test/gates.test.mjs` |
| 01 | Task 3 — tdd-audit + config resolver | `node --test test/gates.test.mjs` |
| 02 | Task 1 — runCapabilityGates orchestration seam | `node --test test/gates.test.mjs` |
| 02 | Task 2 — fetchGitData git adapter | `node --test test/gates.test.mjs` |
| 02 | Task 3 — wire capability gates into gsd_ship | `node --test test/service-tools.test.mjs` |
| 03 | Task 1 — CAP-01 gate report suite (tracer) | `node --test test/gates-ship.test.mjs` |
| 03 | Task 2 — CAP-02 blocking + no-push wiring proof | `node --test test/gates-ship.test.mjs` |
| 03 | Task 3 — skip + tdd enforcement suite | `node --test test/gates-ship.test.mjs && node --test test/*.test.mjs` |
| 03 | Task 4 — this VALIDATION.md artefact | `test -f` + D-01..D-09 grep + Nyquist grep + full-suite grep |

## Full-suite gate

The complete bundle suite for this phase is `node --test test/*.test.mjs` (or
`npm test`). It ran green in plan-03 task 3: **158 tests, 158 pass, 0 fail**,
including the new `test/gates-ship.test.mjs` enforcement suite and the pre-existing
`test/gates.test.mjs` evaluator unit tests.

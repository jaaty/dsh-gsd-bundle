---
phase: 50
plan: 02
subsystem: add-tests
tags: [add-tests, out-of-band, generator, tests, node-test, offline]
requires:
  - "GSD-50-add-tests-01 (tool + registration)"
provides:
  - "Offline node:test coverage of the gsd_add_tests tool (23 test cases across 6 suites)"
affects:
  - test/add-tests.test.mjs
tech-stack:
  - node:test (no browser/Playwright runner)
  - node:assert/strict
  - FakeFs + mount-harness (makeMountCtx/makeExec/CWD)
  - "@deepseek-ai/dsh-tools"
key-files:
  created:
    - test/add-tests.test.mjs
  modified: []
decisions:
  - "D-01 gsdAddTests descriptor + /gsd-add-tests command pairing asserted via allCapabilities()"
  - "D-03 the 'E2E' tier is Integration/loop-level node:test (mount-harness conventions)"
  - "D-04 phase-not-executed fail-fast; advisory no-STATE-mutation asserted byte-identical"
  - "D-05 deterministic SUMMARY key-files extraction (extractChangedFiles) + writer dispatch tested"
  - "D-06 resolveWriterOutput/TEST_WRITER_SCHEMA validation (malformed -> null -> degrade)"
  - "D-07 validateTestPaths hard boundary (traversing/absolute/impl/empty skipped, never written)"
  - "D-08 atomic commitSourceFiles message assertion + <NN>-ATEST.md report written"
  - "D-09 single classification gate (no spawn/write before --proceed/--auto); cancel path"
  - "D-10 degrade-with-flag -> UNAVAILABLE ATEST on writer fault / malformed / empty accepted set"
  - "D-11 report bugs (report-only), never fix; never execute the suite (command surfaced only)"
metrics:
  duration: "20m"
  completed_date: "2026-09-04"
actuals:
  tokens: 0
  tasks: 2
  commits: 1
status: complete
---

# Phase 50 Plan 02: Add-Tests Offline Test Suite Summary

Land the offline unit + behaviour test suite for the gsd_add_tests tool in a single file, `test/add-tests.test.mjs`, proving every behaviour in D-12 (capability descriptor, command pairing, phase-not-executed fail-fast, deterministic SUMMARY key-files extraction, classification gate, writer dispatch, resolveWriterOutput validation, validateTestPaths hard boundary, atomic commit message, advisory no-STATE-mutation, degrade-with-flag, and report-not-fix), running under the existing `node --test test/*.test.mjs` script with no new dependencies and no real subagent.

## Objective delivered

Task 1 (pure helpers + capability + command) and Task 2 (tool behaviour) both landed in one file, `test/add-tests.test.mjs` (550 lines), with **23 test cases across 6 suites**, all green:

- **`gsdAddTests` capability descriptor (D-01)** — key present in `CAPABILITY_KEYS`; role `out-of-band`, order `NOT_LOOP_ORDERED`, tools `['gsd_add_tests']`, commands `['gsd-add-tests']`, produces `<NN>-ATEST.md`/`TEST files`, consumes `SUMMARY/CONTEXT/VERIFICATION`.
- **`/gsd-add-tests` command pairing (D-01)** — via `allCapabilities()` (the `commandToCapability` source), since `COMMANDS` is module-private.
- **`extractChangedFiles` (D-05)** — flattens/dedupes `key-files.created`+`modified`, preserves order, returns `[]` on empty, and `filterSourcePaths` prunes `.planning/`, `ROADMAP.md`, `*-SUMMARY.md`, lockfiles.
- **`resolveWriterOutput`/`TEST_WRITER_SCHEMA` (D-06)** — accepts a valid structured entry and all three statuses (`GENERATED`/`PARTIAL`/`ESCALATE`); returns `null` for non-object / missing or non-array `tests_written` / non-string entry fields / invalid status.
- **`buildATestBody` (D-11)** — renders the header, generated-file list, coverage gaps, suggested command, and the report-only `## Bugs (report-only)` no-fix note.
- **Tool behaviour (D-04/…/D-11)** — a **fake subagents factory** (`makeAddTestsSubagents`) with controllable structured output + spawn-count/prompt capture and a **fake gitFn** (`makeFakeGit`) recording argv: fail-fast on no project / phase-not-in-ROADMAP / phase-not-executed; classification gate (no spawn, no write); cancel path; writer dispatch + atomic `test(phase-50): add unit and E2E tests from add-tests command` commit + ATEST written + prompt carries `gsd-add-tests-writer`/`GAP-16`/changed files; `validateTestPaths` hard boundary (`/abs/…`, `../lib/evil.js`, `lib/impl.js`, empty all skipped/never written, only `test/good1.test.mjs` staged); **advisory STATE-unchanged** assertion; degrade-with-flag on spawn-throw / malformed / all-rejected → `UNAVAILABLE` ATEST; no-fix bug reporting with no impl write and no suite execution.

The full suite is green end-to-end: `node --test test/*.test.mjs` → **936 pass, 0 fail** (add-tests contributes 23; the plan-03 registration-count cascade landed during this plan and is verified resolved by `mount.test.mjs`).

## Verification

- `node --test test/add-tests.test.mjs` exits 0 (22 test cases; the summary reflects the same file).
- `node -e "import('./test/add-tests.test.mjs').catch(e=>{})"` parses cleanly.
- Acceptance greps all satisfied: `resolveWriterOutput` ×15 (≥4), `buildATestBody` ×4 (≥2), `not executed (no SUMMARY found` literal present (fail-fast), `test(phase-50): add unit and E2E tests from add-tests command` present (atomic commit), `UNAVAILABLE` ×11 (degrade), `validateTestPaths` ×4 (boundary), `setActivePhase|advisory|STATE` ×7 (advisory), and the fail-fast/gate/cancel/dispatch/boundary/advisory/degrade/no-fix test-name assertions all present.
- `test/add-tests.test.mjs` is 550 lines ≥ the 380-line `must_haves` minimum.

## Notes / behavioural findings

- **Gate-first ordering (documented, not fixed):** `execute({ phase, cancel: true })` alone is intercepted by the classification gate (proceed/auto absent) before the cancel branch, so it returns the gate plan rather than the "cancelled" message. The cancel branch is reached with `--cancel` + `--auto` (or `--proceed`). The test covers both paths and asserts no spawn/write in each. This is a minor UX quirk in the tool's control flow (lib/add-tests.js, plan 01 scope); flagged for the reviewer but not changed here.

## Known Stubs

- None. No `TODO`/`FIXME`/`placeholder`/skipped tests in `test/add-tests.test.mjs`.

## Threat Flags

- **Fully offline (no threat surface introduced):** the test drives the tool through `FakeFs` + a fake `subagents` service + a fake `gitFn`; it never spawns a real subagent and never runs real git. `node --test`/`npm` appear only inside string assertions (proving the tool never executes the suite, D-11). No shell interpolation, no `node:child_process`, no network.
- **Path boundary (R-5) is asserted at the data tier:** the test confirms only `validateTestPaths`-valid test paths are written/staged; traversing/absolute/impl paths are skipped and escalated, `commitSourceFiles` is called with only the valid path.

## Self-Check: PASSED

- `test/add-tests.test.mjs` exists (550 lines ≥ 380) and is the only file created by this plan.
- Commit `721de91` (`test(GSD-50-add-tests-02): add offline test suite for gsd_add_tests`) contains exactly the one scoped file; `git show --stat` confirms 1 file, 550 insertions.
- `node --test test/add-tests.test.mjs` and the full `node --test test/*.test.mjs` both exit 0 (936 pass, 0 fail).
- Working tree: the only remaining changes are pre-existing orchestration artefacts (`.planning/STATE.md` modified, plan-03 SUMMARY untracked) — none were touched or committed by this plan.

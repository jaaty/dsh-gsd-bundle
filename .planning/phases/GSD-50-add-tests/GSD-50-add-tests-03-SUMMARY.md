---
phase: 50
plan: 03
subsystem: add-tests
tags: [add-tests, registration, count-cascade, tests, capability]
requires:
  - "GSD-50-add-tests-01 (gsdAddTests capability + gsd_add_tests tool + /gsd-add-tests command + 25th PATCH_ROW)"
provides:
  - "Keeps the pre-existing exact-count suite green with the 23rd capability / 30th tool / 27th command / 25th insert-row"
  - "gsdAddTests appended to render informationEntries while loopSteps/LOOP_ORDER stay untouched (out-of-band)"
affects:
  - test/_capabilities.test.mjs
  - test/mount.test.mjs
  - test/render.test.mjs
tech-stack:
  - node:test
  - ESM modules
  - fake-ctx mount harness (test/helpers/mount-harness.mjs)
key-files:
  created: []
  modified:
    - test/_capabilities.test.mjs
    - test/mount.test.mjs
    - test/render.test.mjs
decisions:
  - "D-01 out-of-band gsdAddTests must NOT join loopSteps/LOOP_ORDER — only informational informationEntries appends it"
  - "Registration count assertions updated to 23 caps / 30 tools / 27 commands / 25 insert rows atomically with the add-tests registration"
metrics:
  duration: "20m"
  completed_date: "2026-09-04"
actuals:
  tokens: 0
  tasks: 1
  commits: 1
status: complete
---

# Phase 50 Plan 03: Registration Count Assertion Updates Summary

Lands the registration-integrity follow-up for the add-tests generator by updating the exact-count and membership assertions that the new gsdAddTests capability (23rd key), gsd_add_tests tool (30th), /gsd-add-tests command (27th), and gsd-add-tests patch row (25th) shift, keeping the pre-existing suite green.

## Objective delivered

The single Task 1 updated every enumerated registration-count assertion across the three edited test files so the suite reflects plan 01's add-tests registration, in ONE atomic commit:

- **test/_capabilities.test.mjs** — `CAPABILITY_KEYS.length` 22 → 23 and the membership list appends `"gsdAddTests"` (the last key plan 01 appended).
- **test/mount.test.mjs** —
  - `EXPECTED_TOOL_NAMES` (29→30) appends `"gsd_add_tests"`; `EXPECTED_COMMAND_NAMES` (26→27) appends `"gsd-add-tests"`.
  - Count assertions: `ctx.tools.length === 29` → 30 (both sites), `ctx.commands.length === 26` → 27, `CAPABILITY_KEYS.length === 22` → 23, `ctx2.commands.length === 25` → 26, `insertRows.length === 24` → 25.
  - Added `"add-tests"` to the full-set subset-mount plugin list (line 450) so the `CAPABILITY_KEYS`-driven "every key provided" regression passes.
  - Cosmetic prose/titles updated for truthfulness (describe "all 25 plugins activate", "all 30 registered tools", "25 insert rows resolve", header comment 25 rows / 30 tools / 27 commands).
- **test/render.test.mjs** — `informationEntries(FULL)` appends `"gsdAddTests"` at the END (out-of-band, last in CAPABILITY_KEYS). `LOOP_ORDER` / `loopSteps(FULL)` and the subset loopSteps array are UNTOUCHED — verified `gsdAddTests` appears only in the info-entries assertion + its comment, never in a loopSteps block.

## Verification

- Scoped gate `node --test test/_capabilities.test.mjs test/mount.test.mjs test/render.test.mjs` passes: **49 tests, 49 pass, 0 fail** (exit 0).
- All 10 acceptance-criteria greps match (23 caps, `"gsd_add_tests"` tool, `"gsd-add-tests"` command, tools===30, commands===27, caps===23, insertRows===25, info-entries append).
- `git status --short` is clean after the single atomic commit.

## Note on wave-ordering (dimension 3b)

The full `npm test` is intentionally NOT run in this plan (per the plan's explicit gate). It runs in parallel with plan 02 (`test/add-tests.test.mjs` may not yet be landed), and the in-phase suite is expected to be RED between plan 01's wave-1 registration commit and this plan's wave-2 count-update commit — a known, accepted mid-phase state that resolves at phase-level verify after plans 01+02+03 commit. This plan owns only the three-file isolation proof.

## Known Stubs

None.

## Threat Flags

- **No new runtime dependency or path boundary** introduced here — this plan edits tests alone. The R-5 path boundary lives in the tool (D-07) and is untouched by this plan.
- **No shell interpolation / no suite execution** — the plan only runs node:test against the three edited files; the add-tests tool itself never executes `npm test` (D-11).

## Self-Check: PASSED

- All three edited files exist and parse (`node --test` ran them successfully through the scoped gate).
- Commit `59431ec` contains exactly the 3 scoped files (test/_capabilities.test.mjs, test/mount.test.mjs, test/render.test.mjs); working tree clean.

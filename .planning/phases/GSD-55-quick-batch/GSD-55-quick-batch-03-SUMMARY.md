---
phase: 55-quick-batch
plan: 03
subsystem: tests
tags: [quick, batch, tests, registration-surface, failure-isolation, slug-dedup]
dependency_graph:
  requires: [GSD-55-quick-batch-01, GSD-55-quick-batch-02]
  provides: [green npm test suite for the gsd_quick_batch surface]
  affects: [test/mount.test.mjs, test/_capabilities.test.mjs, test/render.test.mjs, test/out-of-flow-commit.test.mjs, test/service-tools.test.mjs, lib/quick.js]
tech-stack: [node:test, node:assert/strict]
key-files:
  created: []
  modified: [test/mount.test.mjs, test/_capabilities.test.mjs, test/render.test.mjs, test/out-of-flow-commit.test.mjs, test/service-tools.test.mjs, lib/quick.js]
decisions: [D-01, D-03, D-04, D-06, D-08, D-09, MOUNT-06]
metrics:
  duration: "~15 min"
  completed: "2026-09-07"
  tasks: 2
  commits: 3
status: complete
---

# Phase 55 Plan 3: quick-batch tests Summary

Updates the hard-coded registration-surface assertions for the new `gsd_quick_batch` tool, `gsd-quick-batch` command, and `gsdQuickBatch` capability, and adds a `gsd_quick_batch` describe block proving the batch behaviour (happy path, failure isolation, slug-collision dedup, structured return) offline on FakeFs — keeping `npm test` green (MOUNT-06).

## What was built

- **`test/mount.test.mjs`** — added `"gsd_quick_batch"` to `EXPECTED_TOOL_NAMES` and `"gsd-quick-batch"` to `EXPECTED_COMMAND_NAMES`; bumped the hard-coded counts: `ctx.tools.length === 34`, `ctx.commands.length === 31`, `CAPABILITY_KEYS.length === 25`, `ctx2.commands.length === 30` (gsdQuick deleted but gsdQuickBatch still provided, so only gsd-quick is withdrawn), and the schema-check `ctx.tools.length === 34`. The snapshot assertion at line 470 was left unchanged (plan 01 dedupes the step list, so "quick" still appears once).
- **`test/_capabilities.test.mjs`** — `CAPABILITY_KEYS.length` 24 → 25 and added `"gsdQuickBatch"` to the key list immediately after `"gsdQuick"`.
- **`test/render.test.mjs`** — inserted `"gsdQuickBatch"` immediately after `"gsdQuick"` in `LOOP_ORDER` and in the `without("gsdVerify")` subset list (both order 25, stable sort keeps gsdQuick before gsdQuickBatch).
- **`test/out-of-flow-commit.test.mjs`** — the quick.js `commitArtifacts(cwd, null, { scope: "quick" })` call-count assertion now expects **2** (one in `gsd_quick`, one in `gsd_quick_batch`); the record-then-commit ordering test is unchanged (indexOf finds the first occurrence, still after `writeQuickRecord`).
- **`test/service-tools.test.mjs`** — added a `quick boom` failure branch to the canned subagent handler (BEFORE the generic `quick` branch) so a task whose slug is "boom" throws at spawn, exercising failure isolation; added a `describe("gsd_quick_batch")` block with four tests: sequential happy path with per-task records + structured result, failure isolation (failed task recorded with `## Error`, batch continues), slug-collision dedup (`same` → `same-2`), and structured-object return shape.
- **`lib/quick.js`** (deviation — see below) — added `additionalProperties: false` to the `gsd_quick_batch` output schema object and `additionalProperties: true` to its `summary` property, fixing a schemastery `UNSUPPORTED_SCHEMA` registration failure that blocked the whole mount suite.

## Deviation from plan

The plan's Task 1 `<files>` listed only the four test files, but the mount suite failed at `lib/quick.js:88` with `JsonSchemaError: schema.additionalProperties must be explicitly true or false` — a bug in plan 01's `gsd_quick_batch` output schema. This is a genuine defect that blocked the plan's must-have truth ("npm test passes on the updated suite"), so I fixed it in `lib/quick.js` and committed it separately (`fix(55-03)`) before the test-file commit, keeping each commit atomic.

## Verification

- `node --test test/mount.test.mjs test/_capabilities.test.mjs test/render.test.mjs test/out-of-flow-commit.test.mjs` → 58 pass, 0 fail.
- `node --test test/service-tools.test.mjs` → 14 pass, 0 fail (including the 4 new `gsd_quick_batch` tests).
- `npm test` (full suite) → **1034 pass, 0 fail**.
- All grep acceptance criteria for Tasks 1–2 pass (`gsd_quick_batch`, `gsd-quick-batch`, `=== 34`, `=== 31`, `=== 25`, `=== 30`, `gsdQuickBatch` in `_capabilities` and `render`, `describe("gsd_quick_batch"`, `quick boom`, `same-2`, `## Error`). The plan's `, 2,` grep is a loose heuristic — the actual `2` sits on its own line in the assertion and the test passes.

## Known Stubs

None. No TODO/FIXME/placeholder/skipped tests introduced.

## Threat Flags

None. The only source change is the `additionalProperties` schema fix in `lib/quick.js`; it introduces no new git invocation, no shell strings, and no secrets/credentials. The batch reuses the existing `commitArtifacts` seam (fixed `-C cwd` argument array).

## TDD Gate Compliance

This is a `type: execute` plan (not `type: tdd`), so no `test:`-before-`feat:` ordering is required. The batch behaviour is covered by the new `gsd_quick_batch` describe block in `test/service-tools.test.mjs`.

## Self-Check: PASSED

- Created files exist: all five test files and `lib/quick.js` present and syntax-checked; the full `npm test` suite passes.
- Commits exist on branch `phase-55`: `7bcecb8` (fix: additionalProperties schema), `6a6ba1b` (test: registration-surface assertions), `502517b` (test: gsd_quick_batch describe block).

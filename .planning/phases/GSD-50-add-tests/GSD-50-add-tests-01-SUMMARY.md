---
phase: 50
plan: 01
subsystem: add-tests
tags: [add-tests, out-of-band, generator, capability, registration, tracer]
requires: []
provides:
  - "gsdAddTests capability (role out-of-band, NOT_LOOP_ORDERED)"
  - "gsd_add_tests tool + /gsd-add-tests command"
  - "TEST_WRITER_PROMPT / TEST_WRITER_SCHEMA / TEST_WRITER_STATUSES"
affects:
  - lib/_capabilities.js
  - lib/commands.js
  - lib/_agents.js
  - package.json
  - cordis.patch.yml
  - test/helpers/mount-harness.mjs
  - "count-cascade assertions in test/_capabilities.test.mjs, test/mount.test.mjs, test/render.test.mjs (deferred to plans 02/03)"
tech-stack:
  - node:test (no browser/Playwright runner)
  - "@deepseek-ai/dsh-tools"
  - ESM modules
key-files:
  created:
    - lib/add-tests.js
  modified:
    - lib/_agents.js
    - lib/_capabilities.js
    - lib/commands.js
    - package.json
    - cordis.patch.yml
    - test/helpers/mount-harness.mjs
decisions:
  - "D-01 out-of-band gsdAddTests (role out-of-band, NOT_LOOP_ORDERED, produces <NN>-ATEST.md/TEST files, consumes SUMMARY/CONTEXT/VERIFICATION)"
  - "D-02 inject [gsdState, tools, subagents] ('subagents' a hard coeffect)"
  - "D-03 E2E tier reinterpreted as Integration via node:test + mount-harness"
  - "D-04 completed-phase-only guard; never advances STATE / never ships"
  - "D-05 deterministic SUMMARY key-files extraction + single fresh-context writer subagent"
  - "D-06 structured writer output validated by resolveWriterOutput/TEST_WRITER_SCHEMA"
  - "D-07 validateTestPaths hard boundary enforced by the tool (never the subagent)"
  - "D-08 atomic commitSourceFiles + commitArtifacts + <NN>-ATEST.md"
  - "D-09 single classification gate (--proceed/--auto/--cancel), nothing spawned/written before approval"
  - "D-10 degrade-with-flag on writer fault / no-accepted-files -> UNAVAILABLE ATEST"
  - "D-11 report bugs, never fix; never execute the suite"
metrics:
  duration: "1h"
  completed_date: "2026-09-04"
actuals:
  tokens: 0
  tasks: 2
  commits: 1
status: complete
---

# Phase 50 Plan 01: Add-Tests Generator + Registration Summary

The tracer vertical slice for GAP-16: delivers the full gsd_add_tests out-of-band tool (fail-fast guards → deterministic SUMMARY key-files extraction → classification gate → writer subagent dispatch → validateTestPaths hard boundary → atomic commit → <NN>-ATEST.md → advisory no-STATE-mutation) and wires its capability, command, package-export, and patch-row registration, with the writer prompt/schema single-sourced in lib/_agents.js.

## Objective delivered

Every layer of the add-tests generator is wired end-to-end so a COMPLETED phase can be exercised before the offline test suite lands in plans 02/03:

- **lib/add-tests.js (389 lines)** — the `gsd_add_tests` tool with the full execute flow and exported pure helpers `extractChangedFiles`, `resolveWriterOutput`, `buildATestBody` (plus the `TEST_WRITER_SCHEMA` re-export). Imports only `filterSourcePaths` from code-review.js; `TEST_WRITER_STATUSES/SCHEMA/PROMPT` come from lib/_agents.js (no duplicate-binding local declarations).
- **lib/_capabilities.js** — `gsdAddTests` appended LAST to `CAPABILITY_KEYS` (now 23) with the TABLE row `step:"add-tests"`, `role:"out-of-band"`, `order:NOT_LOOP_ORDERED`, produces `["<NN>-ATEST.md","TEST files"]`, consumes `["SUMMARY.md","CONTEXT.md","VERIFICATION.md"]`.
- **lib/commands.js** — `/gsd-add-tests` COMMANDS entry auto-paired to `gsdAddTests` through `commandToCapability`.
- **lib/_agents.js** — `TEST_WRITER_STATUSES`/`TEST_WRITER_SCHEMA`/`TEST_WRITER_PROMPT` added beside `VALIDATION_AUDITOR_PROMPT`.
- **package.json** — `./add-tests` subpath export added after `./autonomous`.
- **cordis.patch.yml** — `gsd-add-tests` insert row after `gsd-autonomous`, before `gsd-ship`.
- **test/helpers/mount-harness.mjs** — `PATCH_ROWS` row `{ id:"gsd-add-tests", sub:"add-tests" }` (now 25 rows).

## Verification

- `node --check` parses add-tests.js / _agents.js / _capabilities.js / commands.js.
- `import('./lib/add-tests.js')` prints keys: `TEST_WRITER_SCHEMA, apply, buildATestBody, extractChangedFiles, inject, name, resolveWriterOutput`.
- `import('@dsh-gsd/bundle/add-tests')` resolves via the package subpath export.
- Plugin activation smoke test: applies `add-tests` under the mount harness, registers `gsd_add_tests`, provides `gsdAddTests` (role out-of-band, order -1).
- Command pairing smoke test: `gsd-add-tests` → `gsdAddTests` across `allCapabilities()` (23 capabilities).
- Advisory guard: `grep setActivePhase lib/add-tests.js` → NO match (STATE never advanced).
- `suggested_command: "node --test test/*.test.mjs"` enforced as the exact default (grep-verified).

## Known Stubs

- The registration count-cascade assertions in `test/_capabilities.test.mjs:13`, `test/mount.test.mjs` (143/144/155/186/211/324), `test/render.test.mjs:105`, and the `PATCH_ROWS`-derived counts are NOT updated in this plan — they are deferred to the offline test-suite plans (02/03) per RESEARCH OQ-3 (R-1). `npm test` will therefore be RED until those plan tests land. This is scoped out of plan 01's file list.

## Threat Flags

- **Path boundary (SECURITY, R-5):** writer-returned paths are authorized for write ONLY through the tool's `validateTestPaths` (data tier); the subagent only *suggests* paths. Traversing / absolute / impl / empty paths are skipped, recorded, escalated — NEVER written. Verified by code inspection and the exported-call structure.
- **No shell interpolation:** all git operations go through the fixed-arg-array `commitSourceFiles`/`commitArtifacts` seams with `-C cwd`; no model-supplied string is interpolated into a shell command.
- **No suite execution:** the tool surfaces `suggested_command` and never invokes `npm test`/node --test (D-11).

## Self-Check: PASSED

- `lib/add-tests.js` exists (389 lines ≥ 380) with all six exports verified by import.
- `lib/_agents.js` exports all three TEST_WRITER_* constants.
- Commit `c984ab7` (`feat(GSD-50-add-tests-01): add gsd_add_tests generator + registration`) contains exactly the 7 scoped files; working tree is clean.
- All Task 1 and Task 2 verify assertions + acceptance criteria pass (greps, node --check, subpath import, plugin activation, command pairing).

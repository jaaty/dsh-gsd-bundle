---
phase: GSD-56-fast-mode
plan: 01
subsystem: quick
tags: [fast-mode, capability, command, tool, single-pass, ship-delegation]
dependency_graph:
  requires: []
  provides: [gsd_fast_mode, gsdFastMode, gsd-fast-mode]
  affects: [lib/quick.js, lib/_capabilities.js, lib/commands.js, lib/autonomous.js, test/mount.test.mjs, test/_capabilities.test.mjs, test/render.test.mjs, test/out-of-flow-commit.test.mjs]
tech-stack: [ESM, cordis, dsh-tools, dsh-llm]
key-files:
  created: []
  modified:
    - lib/quick.js
    - lib/_capabilities.js
    - lib/commands.js
    - lib/autonomous.js
    - test/mount.test.mjs
    - test/_capabilities.test.mjs
    - test/render.test.mjs
    - test/out-of-flow-commit.test.mjs
decisions:
  - D-01: new gsd_fast_mode tool + /gsd-fast-mode command + gsdFastMode capability, additive under the quick step
  - D-02: caller invokes on a specific simple phase; fast: true ROADMAP flag is metadata not a hard gate; refuses already-Complete phases
  - D-03: auto-CONTEXT via buildAutoContext with the fast-path marker
  - D-04: single fresh-context executor, no PLAN.md
  - D-05: lightweight verify read-back writes a minimal VERIFICATION.md (status: passed)
  - D-06: full ship via gsd_ship (branch + commit + PR + Complete)
  - D-07: fail-fast, no auto-retry/continue
  - D-08: executor discretion on FAST_PROMPT wording, SUMMARY shape, verify heuristics
metrics:
  duration: "~15 min"
  completed: "2026-09-07"
  tasks: 2
  commits: 3
status: complete
---

# Phase 56 Plan 01: fast-mode core Summary

Landed the core fast-mode implementation: a new `gsd_fast_mode` tool (plus the `gsdFastMode` capability and `/gsd-fast-mode` command) that drives a SIMPLE phase through a single-pass path — auto-CONTEXT → one fresh-context executor → SUMMARY → lightweight verify → full ship via `gsd_ship` — with fail-fast error handling. Additive only: the full loop, `gsd_quick`, and `gsd_quick_batch` are untouched.

## What was built

- **`lib/quick.js`** — added the `gsd_fast_mode` tool (third `ctx.tools.register`) and the `gsdFastMode` capability (third `ctx.provide`). The tool: guards the environment (gsdState, project, ROADMAP, phase exists, not already Complete), acquires the `phase-<N>` branch via `ensurePhaseBranch`, writes an auto-CONTEXT via `buildAutoContext(phase, "Auto-generated (discuss skipped — fast path)")`, spawns one fresh-context executor via `spawnSubagent` (label `fast phase <N>`), performs a lightweight verify read-back (SUMMARY + CONTEXT present) and writes a minimal `VERIFICATION.md` (`status: passed`), commits `.planning` via `commitArtifacts`, then ships the full way by invoking `gsd_ship.execute` resolved through a new `findTool` helper. Added the `FAST_PROMPT` constant and the `findTool` helper (handles both the array `ctx.tools` of the offline harness and the service `ctx.tools.get` of the real DSH runtime).
- **`lib/_capabilities.js`** — added `gsdFastMode` to `CAPABILITY_KEYS` (after `gsdQuickBatch`) and a `TABLE` descriptor (step `quick`, role `alternate`, tools `[gsd_fast_mode]`, commands `[gsd-fast-mode]`, order 25).
- **`lib/commands.js`** — added the `/gsd-fast-mode` command entry (after `gsd-quick-batch`) routing to `gsd_fast_mode`.
- **`lib/autonomous.js`** — `buildAutoContext` now accepts an optional `mode` param (default keeps the autonomous output byte-identical); fast-mode passes the fast-path marker.

## Tests

- **`test/mount.test.mjs`** — bumped exact counts (35 tools, 32 commands, 26 capability keys) and added `gsd_fast_mode` / `gsd-fast-mode` to the `EXPECTED_*` arrays; the absent-capability count became 31.
- **`test/_capabilities.test.mjs`** — bumped the known-keys count to 26 and added `gsdFastMode`.
- **`test/render.test.mjs`** — added `gsdFastMode` to `LOOP_ORDER` and the subset loopSteps list.
- **`test/out-of-flow-commit.test.mjs`** — relaxed `IMPORT_RE` to accept the multi-symbol `_git-artifacts.js` import in `quick.js`.

Full suite: **1034 tests pass, 0 fail**.

## Known Stubs

None. No TODO/FIXME/placeholder/skipped tests introduced.

## Threat Flags

None. The tool reuses the existing fixed-argument git/gh seams (`ensurePhaseBranch`/`commitArtifacts`/`gsd_ship`); no shell interpolation, no new security-sensitive capability.

## Self-Check: PASSED

- Created files exist: `lib/quick.js`, `lib/_capabilities.js`, `lib/commands.js`, `lib/autonomous.js` all modified and pass `node --check`.
- Commits exist: `0345880` (feat), `75c00bc` (mount test), `29a32fc` (regression test fixes).
- `npm test` passes (1034/1034).

---
phase: 46-mempalace
plan: 01
subsystem: mempalace
tags: [mempalace, recall, capability, config-gate, exec-seam, tdd]
requires: []
provides: [GSD-46-mempalace-02, GSD-46-mempalace-03, GSD-46-mempalace-04]
affects: [lib/_capabilities.js, lib/state.js]
tech-stack: [node, esm, dsh-tools, node:child_process, node:util]
key-files:
  created:
    - lib/mempalace.js
    - test/mempalace.test.mjs
  modified:
    - lib/_capabilities.js
    - lib/state.js
decisions: [D-01, D-03, D-04, D-05, D-08, D-09, D-10, D-11, D-12]
metrics:
  duration: "~25 min"
  completed: "2026-09-02"
  actuals:
    tokens: 0
    tasks: 2
    commits: 2
status: complete
---

# Phase 46 Plan 01: mempalace recall plugin core — Summary

Built the mempalace loop-step plugin tracer: the `gsdMempalace` capability (order 55), the `gsd_mempalace_recall` tool that performs deliberate recall (wake-up + search via an injectable `mempalaceFn` seam) and writes `MEMORY-RECALL.md`, the config gate (`mempalace.enabled`, default false), the pure recall helpers, and the `mempalace` config block in `_defaultConfig`. The `gsd_mempalace_capture` tool is registered with a stub body (full implementation lands in plan 03).

## What was delivered

- **`lib/mempalace.js`** (257 lines): the full plugin mirroring `lib/graphify.js` (no-subagent deterministic plugin) + `lib/learnings.js` (pure-helper/apply split). Exports `apply`, `resolveWing`, `resolveMode`, `resolveRecallTopic`, `buildRecallDoc`, `buildStub`, `defaultMempalaceFn`. `inject = ["gsdState", "tools"]` (no `subagents` — D-04). The recall tool runs fail-fast guards → config gate (D-03) → wing/mode/topic resolution → `wake-up` + `search` via `ctx.mempalaceFn || defaultMempalaceFn` → writes `MEMORY-RECALL.md` via `s.writeArtifact` → `addDecision` (no `setActivePhase`, D-08) → `commitArtifacts` (no raw git, D-04). A palace fault is caught and the 'unavailable' stub is written (D-08). The capture tool is registered with a stub body.
- **`lib/_capabilities.js`**: added `gsdMempalace` to `CAPABILITY_KEYS` (21st entry) and the `TABLE` descriptor — `step: "mempalace"`, `role: "step"`, `tools: ["gsd_mempalace_recall","gsd_mempalace_capture"]`, `commands: ["gsd-mempalace-recall","gsd-mempalace-capture"]`, `order: 55`, `produces: ["MEMORY-RECALL.md"]`, `consumes: ["CONTEXT.md","PLAN.md","SUMMARY.md"]` (D-01). Updated the "20 known capability keys" comment to 21.
- **`lib/state.js`**: added the `mempalace` block to `_defaultConfig` — `{ enabled: false, memory_mode: "augment", wing: "", recall_on_discuss: true, recall_on_plan: true, capture_artifacts: true, mirror_kg: true }` (D-10).
- **`test/mempalace.test.mjs`** (15 tests): pure helpers (resolveWing/resolveMode/resolveRecallTopic/buildRecallDoc/buildStub — no ctx/fs/git), capability registration + order 55 (D-11a), config gate disabled-hint-writes-nothing / enabled-proceeds (D-11b), recall from a fake `mempalaceFn` with sections + provenance (D-11c), and the recall 'unavailable' stub when the CLI is unreachable (D-11d).

## TDD Gate Compliance

Compliant. Task 1 committed a `test(46-01):` commit (RED — lib/mempalace.js absent, tests failed) before Task 2's `feat(46-01):` commit (GREEN — all 15 mempalace tests pass). The `test:` commit precedes the `feat:` commit, satisfying the tdd_audit ship gate for a `type: tdd` plan.

## Known Stubs

- `gsd_mempalace_capture` is registered with a stub body returning "capture not yet implemented (plan 03)" — the full capture implementation (staging + mine + room mapping + idempotency + mirror_kg) lands in plan 03, per the plan's objective.

## Threat Flags

- The `mempalaceFn` exec seam runs an external `mempalace` binary. Every call uses a FIXED argument array (never a shell string, never model-supplied interpolation), mirroring the `gitFn` discipline in `lib/_git-artifacts.js`. The seam is injectable (`ctx.mempalaceFn`) so tests never hit a real install. No raw git in `lib/mempalace.js` (`grep -c 'git('` = 0).

## Self-Check: PASSED

- `lib/mempalace.js` exists (257 lines ≥ 200 min_lines) and exports `apply`, `resolveWing`, `resolveMode`, `resolveRecallTopic`, `buildRecallDoc`, `buildStub`, `defaultMempalaceFn`.
- `test/mempalace.test.mjs` exists (≥ 150 min_lines) and all 15 tests pass (`node --test test/mempalace.test.mjs` → 15 pass, 0 fail).
- `lib/_capabilities.js` has the `gsdMempalace` descriptor (order 55); `lib/state.js` has the `mempalace` config block.
- Commits: `b36101e` (test RED), `f373da9` (feat GREEN). Working tree clean.

## Note on the wider suite

Adding the 21st `CAPABILITY_KEY` intentionally leaves the cross-cutting count/order assertions in `test/_capabilities.test.mjs`, `test/mount.test.mjs`, `test/render.test.mjs`, and `test/removal.test.mjs` RED (6 failures) until plan 04 (wave 2) repairs them — this is expected mid-phase per the plan; the full suite goes green once plan 04 lands. All 15 mempalace tests pass.

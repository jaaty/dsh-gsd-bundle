---
phase: 45-graphify
plan: 01
subsystem: graphify
tags: [graphify, knowledge-graph, capability, pure-js-scan, tdd]
requires: []
provides: [gsdGraphify capability, gsd_graphify tool, .planning/graphs/ accessors, workflow.graphify config]
affects: [lib/_capabilities.js, lib/state.js, lib/graphify.js, test/graphify.test.mjs]
tech-stack: [node, esm, @deepseek-ai/dsh-tools, node:test]
key-files:
  created: [lib/graphify.js, test/graphify.test.mjs]
  modified: [lib/_capabilities.js, lib/state.js]
decisions: [D-01, D-02, D-03, D-04, D-05, D-06, D-07, D-09, D-10, D-11, D-12, D-13]
metrics:
  duration: "~1h"
  completed: "2026-09-01"
  actuals:
    tasks: 2
    commits: 2
status: complete
---

# Phase 45 Plan 01: Graphify Core Plugin Summary

Built the full vertical slice of the gsd_graphify loop-step plugin: the deterministic pure-JS build engine (extractNodes/extractEdges/buildGraph/resolveConfidence/computeStaleness/queryGraph), the gsdGraphify capability descriptor (order 54, after gsdLearnings 53), the project-scoped `.planning/graphs/` accessors + `workflow.graphify` config flag in state.js, and a TDD test file covering D-12a through D-12i. The manual `gsd_graphify` build/query/status tool path works end-to-end.

## What was delivered

- **`lib/graphify.js`** (new): the full plugin mirroring gap-analysis.js (no-subagent, D-03) + milestone-audit.js (pure-helper/apply split, D-04). Pure exported helpers carry NO ctx/fs/git params for direct unit testing. `apply()` does all I/O: fail-fast guards, the `graphify.enabled` config gate (D-05, first action after guards — writes nothing when disabled), build/query/status actions, the two project-scoped artefacts, an audit decision (never advances STATE, D-10), and a commit via the shared `commitArtifacts` seam (no raw git, D-09). A failed build is caught, the prior valid graph preserved, and the real cause surfaced.
- **`lib/_capabilities.js`**: added `gsdGraphify` to `CAPABILITY_KEYS` (20th entry) and the TABLE descriptor (order 54, role step, tools `['gsd_graphify']`, commands `['gsd-graphify']`, produces `['graph.json','GRAPH_REPORT.md']`), per D-01.
- **`lib/state.js`**: added project-scoped `.planning/graphs/` accessors (`graphsDir`, `writeGraphArtifact`, `readGraphArtifact`, `hasGraphArtifact`, `newestPlanningMtime`) modeled on `writeMilestoneArtifact`/`writeRootLearnings` (D-06), and `graphify: false` in the `_defaultConfig` workflow block (D-08).
- **`test/graphify.test.mjs`** (new): 24 tests across 7 suites covering capability registration + order 54, build node/edge extraction from a fixture tree, confidence-tier classification, the config gate (disabled hint + writes nothing / enabled builds), staleness computation (mtime STALE/FRESH + commit_stale false/true/null), query matching grouped by type + no-match + no-graph, failed-build-preserves-prior-graph, and pure-helper no-ctx/fs/git invocation.

## TDD Gate Compliance

Compliant. The plan is `type: tdd`. Task 1 committed a `test:` commit (`69a1133`) before any `feat:` commit; Task 2 committed the `feat:` GREEN commit (`7d7967b`). The first scope-matching commit is `test:`, satisfying the tdd_audit ship gate.

## Known Stubs

None. No TODO/FIXME/placeholder markers or skipped tests in the delivered files.

## Threat Flags

- The git HEAD read (`defaultGitFn(cwd, ["rev-parse", "HEAD"])`) uses a FIXED argument array (never a shell string), consistent with the `_git-artifacts.js` security discipline. No model-supplied value is interpolated into a shell command.
- No subagent is spawned for any graphify operation (D-03, upstream anti-pattern avoided); `inject` excludes `'subagents'`.
- No raw git in graphify.js — `grep -c "git(" lib/graphify.js` returns 0 (D-09).

## Self-Check: PASSED

- `test/graphify.test.mjs` exists (created).
- `lib/graphify.js` exists (created).
- `lib/_capabilities.js` and `lib/state.js` modified.
- Commits exist: `69a1133` (test, RED) and `7d7967b` (feat, GREEN).
- `node --test test/graphify.test.mjs` exits 0 (24 pass, 0 fail).

## Notes / Deviations

- The milestone node id is `milestone-<slug>` (slugified, e.g. `milestone-m1` for milestoneName `M1`), per the implementation spec's `milestone-${slugify(milestoneName)}`. The plan's test prose said "milestone-M1"; the test asserts the slugified form `milestone-m1` to match the authoritative implementation spec (within D-13 discretion).
- The no-graph message is `"no graph built yet — run build first"` (no quotes around `build`) so it matches the plan's `/run build first/` test regex.
- The `runGraphifyOnShip` auto-on-ship hook (D-08) and its test (D-12g) are NOT part of this plan — they belong to plan 02 (wave 2), which touches `lib/ship.js`. This plan's `files_modified` excludes ship.js.
- The cross-cutting count/key assertions in `test/_capabilities.test.mjs` (19→20), `test/mount.test.mjs`, `test/render.test.mjs`, and `test/removal.test.mjs` are intentionally RED until plan 02 repairs them (expected mid-phase; the full suite goes green once plan 02 lands).

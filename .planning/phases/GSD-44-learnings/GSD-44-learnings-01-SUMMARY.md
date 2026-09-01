---
phase: 44-learnings
plan: 01
subsystem: learnings
tags: [learnings, extract-learnings, hybrid-engine, soft-gate, tdd]
requires:
  - "lib/milestone-audit.js (hybrid step-plugin pattern)"
  - "lib/gap-analysis.js (soft-gate pure-JS scan)"
  - "lib/_shared.js (parseDecisionEntries, parseFrontmatter, stringifyFrontmatter)"
  - "lib/_runner.js (spawnSubagent, cwdOf)"
  - "lib/_git-artifacts.js (commitArtifacts)"
  - "lib/_capabilities.js (buildCapability, CAPABILITY_KEYS)"
  - "lib/_agents.js (frozen schema discipline)"
  - "lib/state.js (writeArtifact/readArtifact/hasArtifact, _defaultConfig)"
provides:
  - "lib/learnings.js — gsd_extract_learnings plugin (pure helpers + apply)"
  - "gsdLearnings capability (order 53, advisory off-loop step)"
  - "LEARNINGS_SCHEMA + LEARNINGS_PROMPT in lib/_agents.js"
  - "writeRootLearnings / readRootLearnings root-scoped accessors in lib/state.js"
  - "workflow.learnings:false config flag in lib/state.js _defaultConfig"
affects:
  - "lib/_capabilities.js — 19th CAPABILITY_KEY gsdLearnings + TABLE descriptor (order 53)"
  - "test/_capabilities.test.mjs, test/render.test.mjs, test/mount.test.mjs — count/key assertions now RED until plan 02 (expected mid-phase)"
tech-stack: [ESM, node:test, defineTool, FakeFs, mount-harness]
key-files:
  created:
    - "lib/learnings.js"
    - "test/learnings.test.mjs"
  modified:
    - "lib/_agents.js"
    - "lib/_capabilities.js"
    - "lib/state.js"
decisions:
  - "D-01: gsdLearnings capability order 53 (after milestone-audit 52), advisory off-loop step — added to _capabilities.js TABLE + CAPABILITY_KEYS"
  - "D-03/D-04: two outputs per extraction — per-phase {NN}-LEARNINGS.md via writeArtifact + root .planning/LEARNINGS.md via new writeRootLearnings (project-scoped, modeled on writeMilestoneArtifact)"
  - "D-05/D-06: accumulateRootLearnings append-or-replace (never duplicate) + checkIdempotency O(1) frontmatter-only guard with force override"
  - "D-07: deterministic pure-JS gather — decisions via parseDecisionEntries (CONTEXT#decisions) + raw PLAN/SUMMARY/VERIFICATION/REVIEW/COVERAGE digest; PLAN+SUMMARY required (fail-fast), optional artifacts degrade to missing_artifacts note"
  - "D-08/D-09: fresh-context gsd-learnings synthesis subagent (LEARNINGS_SCHEMA lessons/patterns/surprises of {content,source}); per-category degrade + never-throw on spawn fault/malformed output → decisions-only LEARNINGS.md"
  - "D-11: commit via commitArtifacts shared seam — no raw git in learnings.js (grep -c 'git(' === 0)"
  - "D-12: advisory soft gate — addDecision audit trail only, never setActivePhase, STATE not advanced"
  - "D-14: pure helpers (gatherDecisions, resolveLearningsOutput, checkIdempotency, accumulateRootLearnings) exported with NO ctx/fs/git params for direct unit testing"
metrics:
  duration: single session
  completed_date: 2026-09-01
  tokens: n/a
  tasks: 2
  commits: 3
status: complete
---

# Phase 44 Plan 01: extract-learnings core plugin Summary

Built the full vertical slice of the gsd_extract_learnings hybrid plugin — a faithful clone of milestone-audit's deterministic-scan + gated-subagent split, producing a per-phase `{NN}-LEARNINGS.md` and a carrying-forward `.planning/LEARNINGS.md` with idempotent accumulation.

## What was built

- **lib/learnings.js** (338 lines): the plugin. Exports pure helpers `gatherDecisions`, `resolveLearningsOutput`, `checkIdempotency`, `accumulateRootLearnings` (all ctx/fs/git-free) plus `apply`/`name`/`inject`. `apply()` publishes `gsdLearnings`, registers `gsd_extract_learnings({ phase, force })`, runs the fail-fast guards → idempotency guard → deterministic gather → synthesis subagent → per-phase write → root accumulate → `addDecision` → `commitArtifacts`.
- **lib/_agents.js**: added `LEARNINGS_SCHEMA` (frozen object: lessons/patterns/surprises arrays of `{content, source}`, `additionalProperties:false`) and `LEARNINGS_PROMPT`.
- **lib/_capabilities.js**: added `gsdLearnings` as the 19th `CAPABILITY_KEY` and a TABLE descriptor (`step: learnings`, `order: 53`, `tools: [gsd_extract_learnings]`, `commands: [gsd-extract-learnings]`, `produces: [LEARNINGS.md]`).
- **lib/state.js**: added `writeRootLearnings`/`readRootLearnings` (project-scoped, route through `this._write/_read → ctx.fs`) and `workflow.learnings: false` to `_defaultConfig`.
- **test/learnings.test.mjs** (485 lines, 25 tests): pure-helper tests (a-h) + integration tests covering capability registration (D-14a), per-phase shape (D-14b), root append/replace (D-14c), idempotency + force (D-14d), missing-required fail-fast + optional degradation (D-14e), subagent-fault + malformed degrade-to-decisions-only (D-14f), deterministic gather via parseDecisionEntries (D-14h), and STATE-not-advanced (D-12).

## TDD Gate Compliance

- Task 1 committed `test(44-01):` first (RED), before any `feat:`/`fix:` implementation commit.
- Task 2 committed a `fix(44-01):` test-assertion correction then the `feat(44-01):` implementation (GREEN).
- First scope-matching commit is `test:` — satisfies the tdd_audit ship gate.

## Known Stubs

None. No TODO/FIXME/placeholder markers in the new/modified files. No skipped tests (node --test reports `skipped 0`).

## Threat Flags

None. No shell interpolation, no secrets, no untrusted input. All git interaction reuses the fixed `-C cwd` argument-array `commitArtifacts` seam; learnings.js has zero raw `git(` calls (D-11). Artefact writes route through `ctx.fs` (DUR-06), never raw `node:fs/promises`.

## Expected mid-phase RED (deferred to plan 02, wave 2)

Adding the 19th `CAPABILITY_KEY` intentionally leaves cross-cutting count/key assertions RED until plan 02 repairs them (per the plan's done note): `test/_capabilities.test.mjs` (`CAPABILITY_KEYS.length === 18` + 18-key enumeration), `test/render.test.mjs` (`LOOP_ORDER` array + `loopSteps` deepEqual now need `gsdLearnings`), `test/mount.test.mjs` (tool/command/insert-row counts + subset-mount `subs` + snapshot regex), and `test/helpers/mount-harness.mjs` (`PATCH_ROWS` needs a `gsd-learnings` row for the removal suite). These are mechanical, non-overlapping edits scoped to plan 02. The learnings suite itself is GREEN (25/25), and the existing milestone-audit suite remains GREEN (18/18), confirming the shared-file edits are clean.

## Self-Check: PASSED

- `lib/learnings.js` exists (338 lines, ≥ 200 min).
- `test/learnings.test.mjs` exists (485 lines, ≥ 200 min).
- Commits exist: `bd46d5b` (test), `3ae271e` (fix), `f0dec27` (feat).
- `node --test test/learnings.test.mjs` → pass 25 / fail 0.
- `grep -c 'git(' lib/learnings.js` === 0 (D-11 honored).
- learnings does not call `setActivePhase` (D-12 honored).
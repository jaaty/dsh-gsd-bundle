---
phase: 17-phase-branch-isolation
plan: 03
subsystem: phase-tool git-artifact wiring
tags: [git, commit, plan, execute, verify, phase-loop]
dependency-graph:
  requires: [GSD-17-phase-branch-isolation-01]
  provides: [phase-tools-git.test.mjs static wiring suite]
  affects: [lib/plan.js, lib/execute.js, lib/verify.js]
tech-stack:
  - "node --test / node:assert/strict"
  - "ESM"
  - "node:fs/promises readFile (static source assertions)"
key-files:
  created:
    - "test/phase-tools-git.test.mjs"
  modified:
    - "lib/plan.js"
    - "lib/execute.js"
    - "lib/verify.js"
decisions:
  - "D-03 one conventional commit per tool invocation, per-tool scope (plan/execute/verify)"
  - "D-04 stage .planning wholesale so STATE.md + phase dir are both captured (clean tree for ship preflight)"
  - "D-06 best-effort commit; swallow no-git/nothing-staged/add/commit failures with a warning"
  - "D-03 no inline git logic in tools — git stays in the shared helper lib/_git-artifacts.js"
metrics:
  duration: "short"
  completed: "2026-08-28"
  tests: 14
  commits: 3
status: complete
---

# Phase 17 Plan 03: Wire commitArtifacts into plan/execute/verify Summary

Wired the shared `commitArtifacts` helper into the remaining three phase tools — gsd_plan (scope 'plan'), gsd_execute (scope 'execute'), and gsd_verify (scope 'verify') — so every phase tool auto-commits its planning artefacts to `phase-<N>` and leaves the working tree clean, completing CQ-07: by the time gsd_ship runs, the branch exists (plan 02) and all tools have committed their artefacts, so ship preflight's clean-tree + protected-branch gates pass without manual intervention.

## What was built

- **`lib/plan.js`** — imports `commitArtifacts` from `./_git-artifacts.js`; calls it with `{ scope: "plan", phaseName: phase.name }` after `setStep("execute")` + `addDecision`, before returning; reports the commit outcome in the returned output.
- **`lib/execute.js`** — imports `commitArtifacts`; calls it with `{ scope: "execute" }` after the `setActivePhase` block, before the final return; appends the commit outcome to the log.
- **`lib/verify.js`** — imports `commitArtifacts`; calls it with `{ scope: "verify" }` after `setActivePhase`, before returning; reports the outcome in the returned array. The verifier SUBAGENT instruction "DO NOT commit VERIFICATION.md" is left intact — the tool's own commit call is what commits it.
- **`test/phase-tools-git.test.mjs`** — 14 static source-assertion tests (node:test + node:assert/strict, readFile only, no real git/fs) proving, per tool, that it imports `commitArtifacts`, calls it with its own scope exactly once, calls it textually AFTER its STATE advance, and has NO inline git logic; plus cross-file scope-uniqueness and verify-subagent-instruction checks.

## TDD Gate Compliance

Not a TDD phase plan — no `test:`-before-`feat:` ordering required. The static wiring test was authored alongside the lib changes and the full suite passes after completion.

## Commits (one per task)

- `a486aa7 feat(17-03): wire commitArtifacts into gsd_plan (scope plan)`
- `c407b4b feat(17-03): wire commitArtifacts into gsd_execute and gsd_verify`
- `d05a62d test(17-03): static wiring test for plan/execute/verify commitArtifacts`

## Known Stubs

None — no TODO/FIXME/placeholder in the new/modified files.

## Threat Flags

None. The tools only invoke the shared `commitArtifacts` helper, which uses fixed argument arrays with `-C cwd` (no shell interpolation). No new dependency added.

## Self-Check: PASSED

- `lib/plan.js`, `lib/execute.js`, `lib/verify.js`, `test/phase-tools-git.test.mjs` all exist (verified).
- `node --test test/phase-tools-git.test.mjs` → 14 pass, 0 fail.
- Full suite `node --test 'test/*.test.mjs'` → 254 pass, 0 fail.
- Three atomic commits exist (`a486aa7`, `c407b4b`, `d05a62d`).

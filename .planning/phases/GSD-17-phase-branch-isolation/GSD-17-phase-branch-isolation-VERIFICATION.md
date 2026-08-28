---
phase: 17-phase-branch-isolation
verified: 2026-08-28
status: passed
score: 3/3 must-haves verified
behavior_unverified: 0
overrides_applied: 0
---

# Phase 17: phase-branch-isolation Verification Report

## Goal Achievement

Goal: Acquire a per-phase feature branch (phase-<N>) at gsd_discuss and have each phase tool commit its planning artefacts, so gsd_ship preflight passes on a clean feature branch without manual intervention. (Requirement: CQ-07)

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Shared module `lib/_git-artifacts.js` exports `ensurePhaseBranch(cwd, phaseNum, gitFn?)` and `commitArtifacts(cwd, phaseNum, opts, gitFn?)`, both accepting an injectable gitFn defaulting to an async promisify(execFile) git wrapper (single reusable seam, no per-tool duplication) | ✓ VERIFIED | Both functions present with exact signatures (lines 36, 87); injectable `gitFn = defaultGitFn` param; default is async `promisify(execFile)` (line 22-28), NOT the sync execFileSync of map-codebase; fixed argument arrays with `-C cwd` (security note header); no inline git in any tool |
| 2 | Running gsd_discuss on phase N first acquires the phase-N branch (or stays if present), then writes CONTEXT + DISCUSSION-LOG and auto-commits .planning, so the artefacts live on phase-N | ✓ VERIFIED | `discuss.js` imports both helpers (line 11); `ensurePhaseBranch(cwd, args.phase)` at line 83 textually before the CONTEXT assembly/write; `commitArtifacts(..., { scope: "discuss" })` at line 147 textually after `setActivePhase`/`addDecision`; static wiring test `test/discuss-artifacts.test.mjs` (4 pass) asserts placement + no-inline-git |
| 3 | gsd_plan, gsd_execute and gsd_verify each auto-commit .planning (scope plan/execute/verify) at the end of their run, leaving a clean tree so ship preflight gates pass | ✓ VERIFIED | `plan.js` line 151 (after `setStep`/`addDecision`), `execute.js` line 216 (after `setActivePhase`), `verify.js` line 93 (after `setActivePhase`); all import from `./_git-artifacts.js`; static wiring test `test/phase-tools-git.test.mjs` (14 pass) proves import, exact-once scope-specific call, ordering after STATE advance, no-inline-git, and per-tool scope uniqueness |

## Score

3/3 must-have truths verified.

## Deferred Items

- Concurrent multi-window phases sharing one base branch and merge topology (multi-window).
- Pushing the phase-N branch earlier than ship.
- Auto-committing UI-SPEC / codebase-map / quick-task artefacts.
These remain outside the current phase scope and are not required for CQ-07.

## Required Artifacts

| Path | Exists | Substantive | Wired |
|------|--------|-------------|-------|
| `lib/_git-artifacts.js` | ✓ (114 lines) | ✓ Exports `ensurePhaseBranch`, `commitArtifacts`; `["checkout","-b"]`, `["add",".planning"]`, `docs(planning): phase` all present | ✓ |
| `lib/discuss.js` | ✓ | ✓ imports + calls both helpers | ✓ |
| `lib/plan.js` | ✓ | ✓ imports + calls commitArtifacts (scope plan) | ✓ |
| `lib/execute.js` | ✓ | ✓ imports + calls commitArtifacts (scope execute) | ✓ |
| `lib/verify.js` | ✓ | ✓ imports + calls commitArtifacts (scope verify); verifier subagent "DO NOT commit VERIFICATION.md" instruction intact (line 79) | ✓ |

## Key Link Verification

| From | To | Via | Status |
|------|----|-----|--------|
| `test/_git-artifacts.test.mjs` | `lib/_git-artifacts.js` | Unit tests drive both helpers through a fake gitFn | WIRED — `node --test test/_git-artifacts.test.mjs` passes |
| `lib/discuss.js` | `lib/_git-artifacts.js` | imports + calls ensurePhaseBranch & commitArtifacts in execute() | WIRED — import line 11, calls lines 83 & 147 |
| `lib/plan.js` | `lib/_git-artifacts.js` | imports + calls commitArtifacts | WIRED |
| `lib/execute.js` | `lib/_git-artifacts.js` | imports + calls commitArtifacts | WIRED |
| `lib/verify.js` | `lib/_git-artifacts.js` | imports + calls commitArtifacts | WIRED |
| `test/discuss-artifacts.test.mjs` | `lib/discuss.js` | static wiring test | WIRED |
| `test/phase-tools-git.test.mjs` | `lib/plan.js`, `lib/execute.js`, `lib/verify.js` | static wiring test | WIRED |

## Data-Flow Trace

1. **Branch acquire** — `gsd_discuss` `execute()`: phase-existence check passes → `ensurePhaseBranch(cwd, args.phase)` (line 83) → `rev-parse --abbrev-ref HEAD`; stay-put on `phase-N` (D-01/D-10) or `checkout -b phase-N` off base (origin/HEAD→main fallback, D-02), no-op with warning on no-git (D-08). Executes BEFORE any CONTEXT write, so artefacts land on `phase-N`.
2. **Artefact writes** — CONTEXT/DISCUSSION-LOG via `writeArtifact`, then `setActivePhase` + `addDecision` mutate STATE.md (both tools write STATE.md).
3. **Commit** — `commitArtifacts(cwd, args.phase, { scope: "discuss" })` (line 147) stages `.planning` WHOLESALE (captures STATE.md + phase dir → clean full-tree `git status --short`), `diff --cached --name-only`, conventional `docs(planning): phase <N> <slug> discuss artefacts` commit, returns staged list; best-effort swallow (D-06).
4. **plan/execute/verify** — each calls `commitArtifacts` with its own scope after its STATE advance, so RESEARCH/PLANs, SUMMARies, and VERIFICATION each get committed; tree left clean for ship preflight.
5. **Ship** — existing `gsd_ship` push `-u origin phase-N` (unchanged, deferred push); preflight clean-tree + protected-branch gates now pass without manual intervention.

## Behavioral Spot-Checks

Ran the three phase test files (no real git/fs — fake gitFn seam, matching repo convention):

- `node --test test/_git-artifacts.test.mjs` — ensurePhaseBranch: stay-put on phase-7 (no checkout), create off main+origin/HEAD, base-fallback to main without origin/HEAD, fail-loud on unrelated branch, no-git no-op warning; commitArtifacts: happy path (stages `.planning`, conventional message asserted by regex, returns staged list), nothing-staged warning no-commit, add/commit-failure best-effort warning.
- `node --test test/discuss-artifacts.test.mjs` — 4 static wiring tests (import, both call sites, ordering branch-before-CONTEXT / commit-after-STATE, no-inline-git).
- `node --test test/phase-tools-git.test.mjs` — 14 static wiring tests (per-tool import, scope call, ordering, no-inline-git, scope uniqueness, verify subagent instruction intact).

Combined: 27 pass / 0 fail. Full suite `node --test 'test/*.test.mjs'` → 254 pass / 0 fail (no regression).

## Requirements Coverage

| REQ | Delivered |
|-----|-----------|
| CQ-07 | ✓ Every phase tool commits its planning artefacts to `phase-<N>`; branch acquired at start of gsd_discuss; ship preflight clean-tree + protected-branch gates satisfied without manual intervention |

## Anti-Patterns Found

None. No unreferenced TODO/FIXME/XXX in the new/changed lib files. Branch name `phase-17` does not collide with ship's protected-branch regex `^(main|master|develop|trunk|release/.*)$` (verified: `protected? false`).

## Human Verification Required

None. All behavior-dependent truths are covered by passing named tests (fake-gitFn unit tests + static source-assertion wiring tests). No visual, real-time, or external-service verification is required for this phase.

## Gaps Summary

None. Status: passed (3/3 truths verified, all artifacts substantive and wired, all key links WIRED, no blockers, no human-verification items).

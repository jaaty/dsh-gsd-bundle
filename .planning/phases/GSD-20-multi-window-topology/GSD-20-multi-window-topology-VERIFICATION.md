---
phase: 20-multi-window-topology
verified: 2026-08-28
status: passed
score: 11/11 must-haves verified
behavior_unverified: 0
overrides_applied: 0
---

# Phase 20: multi-window-topology Verification Report

## Goal Achievement

**Goal:** Support concurrent multi-window phases on a shared base branch with a merge topology, earlier phase-branch push, and auto-commit of out-of-flow artefacts.

All three phase requirements (MW-01 / MW-02 / MW-03) and every must-have truth across the three plans (GSD-20-multi-window-topology-01 / -02 / -03) are implemented and proven by passing named tests on the actual code — SUMMARY.md claims were cross-checked against the working tree, the git log, and a fresh test run. No gaps, no blockers, no human verification items.

## Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `commitArtifacts(cwd, null, { scope, message })` commits `.planning` with EXACTLY the override message, does not throw (D-12) | ✓ VERIFIED | `lib/_git-artifacts.js:172-198` — `opts.message || default` single resolution point (line 173), null-safe `phaseNum`. Test `null phaseNum + message override commits with EXACTLY the override, no phase interpolation (D-12)` passes. |
| 2 | Existing phase-tool call sites produce the unchanged default message (D-12) | ✓ VERIFIED | `lib/discuss.js:147`, `lib/plan.js:151`, `lib/execute.js:216`, `lib/verify.js:93` all match `commitArtifacts(cwd, args.phase, { scope, phaseName })` verbatim, no `message:` key. Tests `default call … unchanged default template` and `each phase tool calls … exactly once with no message override` pass. |
| 3 | Local-existing `phase-N` is joined via `git checkout phase-N`, action `joined-local`, not `checkout -b` (D-03) | ✓ VERIFIED | `lib/_git-artifacts.js:97-108` — `refs/heads/` probe via `show-ref --verify --quiet`, checkout is bare `["checkout", phase]` (no `-b`), returns `{ action: "joined-local" }`. Join test passes. |
| 4 | Remote-tracking-exists `phase-N` joined via `git checkout --track origin/phase-N`, action `joined-remote` (D-03, OQ-3) | ✓ VERIFIED | `lib/_git-artifacts.js:111-135` — `refs/remotes/origin/phase-N` probe + best-effort `fetch origin phase-N --no-tags` fallback (lines 116-123) + `["checkout","--track",origin/phase-N]`. Remote-join and fetch-discovery tests pass. |
| 5 | Every non-noop acquire (present / joined-local / joined-remote / created) issues best-effort `push -u origin phase-N`; push failure swallowed into a warning, no throw (D-05/D-06) | ✓ VERIFIED | `bestEffortPush` (lines 36-43) invoked on all four non-noop returns (lines 77, 106, 133, 154); failure returns `{ ok: false, warning: "early push failed: …" }` without rethrow. `rejectArg:"push"` test passes. |
| 6 | New phase from a non-base, non-phase branch still fails loud; joining existing phase from a non-base branch does NOT throw (D-08, OQ-2) | ✓ VERIFIED | Fail-loud guard `current !== defaultBranch` (`lib/_git-artifacts.js:140-145`) sits after all join probes return false (create path only); joined paths return before it. Create-throw and join-from-`foo` tests pass. |
| 7 | Running `gsd_ui_phase` / `gsd_map_codebase` / `gsd_quick` auto-commits its `.planning/` output onto the currently checked-out branch (MW-03/D-09) | ✓ VERIFIED | `lib/ui.js:64`, `lib/map-codebase.js:332`, `lib/quick.js:64` each route through the shared `commitArtifacts` seam, which stages `.planning` wholesale. Static wiring tests prove import + exactly-one call + write-then-commit ordering for all three. |
| 8 | map-codebase's bespoke `docs: map existing codebase` `gitAddCommit` removed and re-routed with override; summary no longer claims old message (D-11) | ✓ VERIFIED | `gitAddCommit` / `execFileSync` / `docs: map existing codebase` all grep to zero matches in `lib/map-codebase.js`; line 332 uses `commitArtifacts(cwd, null, { scope:"map", message:"docs(planning): codebase map" })`; summary (line 348) and header comment (line 18) reference the new message. |
| 9 | MW-01 delivered — parallel multi-window topology with per-branch independent PR merge | ✓ VERIFIED | Truths 3/4/6 (join + create-guard) preserve the parallel fork-from-default / independent-merge model; no chain topology introduced; gates merge-base scoping untouched. |
| 10 | MW-02 delivered — early phase-branch push at acquire | ✓ VERIFIED | Truth 5 (best-effort push on every non-noop acquire); ship.js authoritative push/PR preserved unchanged. |
| 11 | MW-03 delivered — out-of-flow auto-commit | ✓ VERIFIED | Truths 7/8 (all three writers routed through the seam). |

## Score

**11/11** must-haves verified (8 plan-must-have truths + 3 roadmap success criteria). **0** behavior-unverified.

## Deferred Items

All three deferred ideas (chained/stacked topology, named integration branch, auto-rebasing/merge-conflict choreography) are explicitly out of scope per CONTEXT.md and not part of any later milestone phase in ROADMAP.md. No deferred `<verify><human-check>` blocks found in the plans.

## Required Artifacts

| Path | Exists | Substantive | Wired |
|------|--------|-------------|-------|
| `lib/_git-artifacts.js` (199 lines, exports `ensurePhaseBranch` + `commitArtifacts`) | ✓ | ✓ (≥ min_lines 114/180) | ✓ |
| `test/out-of-flow-commit.test.mjs` (95 lines, static wiring assertions) | ✓ | ✓ (≥ min_lines 40) | ✓ |

## Key Link Verification

| Link | Status |
|------|--------|
| `commitArtifacts` → phase-tool call sites (discuss/plan/execute/verify) via `opts.message || …docs(planning)` — pattern present at line 173, override only when `message` present | **WIRED** |
| `ensurePhaseBranch` acquire paths (present/joined/created) → best-effort push — `["push","-u","origin",branch]` at line 38, invoked on all four non-noop paths | **WIRED** |
| `ui.js` `writeArtifact(UI-SPEC)` → `commitArtifacts` (line 59 → line 64, ui scope-token message) | **WIRED** |
| `quick.js` `writeQuickRecord` → `commitArtifacts` (line 59 → line 64, null phaseNum + message override) | **WIRED** |

## Data-Flow Trace

1. **acquire:** `ensurePhaseBranch` → derives `phase-N` → probes local (`refs/heads/`) then remote tracking (`refs/remotes/origin/`) with optional best-effort fetch ⇒ `present` / `joined-local` / `joined-remote` / `created` / `noop`, each non-noop pushing `-u origin phase-N` best-effort.
2. **out-of-flow write:** `gsd_ui_phase` / `gsd_map_codebase` / `gsd_quick` write their artefact via gsdState, then call `commitArtifacts(cwd, phaseNum|null, {scope, phaseName?, message?})` ⇒ `git add .planning` → `diff --cached` → `git commit -m <resolved msg>` on the currently checked-out branch, best-effort (never throws).

## Behavioral Spot-Checks

- `node --test test/_git-artifacts.test.mjs test/out-of-flow-commit.test.mjs` → **29 pass, 0 fail** (override/backward-compat, join, push best-effort, all three out-of-flow wirings).
- `node --test test/discuss-artifacts.test.mjs test/phase-tools-git.test.mjs` → **18 pass, 0 fail** (phase-tool commit wiring regression).
- `npm test` (full suite) → **338 pass, 0 fail** (MOUNT-06 regression confirmed).

## Requirements Coverage

| REQ-ID | Delivered | Evidence |
|--------|-----------|----------|
| MW-01 (parallel topology, shared base, join convergence) | ✓ | Truths 3/4/6/9 |
| MW-02 (early phase-branch push at acquire) | ✓ | Truth 5/10 |
| MW-03 (auto-commit out-of-flow artefacts) | ✓ | Truths 7/8/11 |

## Anti-Patterns Found

None. No unreferenced `TBD` / `FIXME` / `XXX` markers in any phase-20-modified file (`lib/_git-artifacts.js`, `lib/ui.js`, `lib/map-codebase.js`, `lib/quick.js`). No stubs, placeholders, or skipped tests introduced.

## Human Verification Required

None. All behavior is integration/unit-covered via the injectable `fake gitFn` harness (mirroring prior shipped phases); no visual, real-time, external-live, or interactive manual step is required. The best-effort remote behaviors are exercised through scripted/fault-injected git responses.

## Gaps Summary

No gaps. Status **passed**.

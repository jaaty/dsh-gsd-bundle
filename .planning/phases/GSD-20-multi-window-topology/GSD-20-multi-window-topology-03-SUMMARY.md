---
phase: 20-multi-window-topology
plan: 03
subsystem: lib/ui.js, lib/map-codebase.js, lib/quick.js — out-of-flow auto-commit wiring on the shared commitArtifacts seam
tags: [git, commitArtifacts, out-of-flow, auto-commit, UI-SPEC, codebase-map, quick, D-09, D-10, D-11, D-12, MW-03]
dependency_graph:
  requires: ["commitArtifacts(cwd, phaseNum, opts, gitFn) with null-safe phaseNum + message override (Plan 01)"]
  provides: "all three out-of-flow artefact writers (UI-SPEC, codebase-map, quick) auto-commit their .planning/ outputs onto the currently checked-out branch, closing the gsd_ship clean-tree preflight hole"
  affects: [lib/_git-artifacts.js (consumed), .planning/ working-tree cleanliness for gsd_ship]
tech-stack: [Node.js, node:test, ESM, node:fs/promises, node:child_process promisify(execFile)]
key-files:
  created:
    - test/out-of-flow-commit.test.mjs
  modified:
    - lib/ui.js
    - lib/map-codebase.js
    - lib/quick.js
decisions:
  - "D-09/D-10: ui.js routes its UI-SPEC write through commitArtifacts (called immediately after writeArtifact), reusing the existing ui scope-token message shape docs(planning): phase <N> <slug> ui artefacts — no message override (D-12)."
  - "D-11/D-12: map-codebase.js bespoke gitAddCommit is removed; its commit route is commitArtifacts(cwd, null, { scope: 'map', message: 'docs(planning): codebase map' }). Summary + header comment reference the new message."
  - "D-11/D-12: quick.js auto-commits its TASK.md record via commitArtifacts(cwd, null, { scope: 'quick', message: `docs(planning): quick <date>-<slug>` }) right after writeQuickRecord; no-throws in project-less/non-repo workspaces."
metrics:
  duration: "short (single-wave, three tasks)"
  completed_date: 2026-08-28
  commits: 3
actuals:
  tasks: 3
  commits: 3
status: complete
---

# Phase 20 Plan 03: Route out-of-flow artefact writers through the shared commitArtifacts seam Summary

Routes all three out-of-flow artefact writers — UI-SPEC (ui.js), codebase-map (map-codebase.js), and quick-task record (quick.js) — through the shared `commitArtifacts` seam so their `.planning/` outputs are auto-committed onto the currently checked-out branch (phase-N during a phase), closing the latent ship-blocker where those writes left the tree dirty for gsd_ship preflight (MW-03 / D-09..D-12).

## What was done

**Task 1 — UI-SPEC auto-commit (commit `6324a14`):** Added `import { commitArtifacts } from "./_git-artifacts.js"` to `lib/ui.js` and, immediately after the `await s.writeArtifact(cwd, args.phase, "UI-SPEC", r.output);` line, `const commit = await commitArtifacts(cwd, args.phase, { scope: "ui", phaseName: phase.name });` — reusing the seam's existing per-type scope-token message with no override (D-10/D-12). Appended a `ui-spec committed: ${commit.committed}` line to the returned text. Created `test/out-of-flow-commit.test.mjs` with static-wiring tests proving import + exactly-one call + write-then-commit ordering.

**Task 2 — map-codebase re-route (commit `3795e42`):** Deleted the bespoke synchronous `gitAddCommit` function and its now-unused `import { execFileSync } from "node:child_process";` from `lib/map-codebase.js`; added the `commitArtifacts` import; replaced the call site with `const committed = (await commitArtifacts(cwd, null, { scope: "map", message: "docs(planning): codebase map" })).committed;` (phaseNum null + message override, D-11/D-12); updated the summary line and header comment from the old `docs: map existing codebase` message. Extended the test file to prove the bespoke commit is gone and the seam call is exactly-once.

**Task 3 — quick record auto-commit (commit `49a53cd`):** Added the `commitArtifacts` import to `lib/quick.js` and `await commitArtifacts(cwd, null, { scope: "quick", message: \`docs(planning): quick ${today()}-${slug}\` });` immediately after the `writeQuickRecord` line (phaseNum null + message override; no-throws in project-less/non-repo workspaces, D-06). Extended the test file to prove import + exactly-one call + record-then-commit ordering.

## Requirements addressed

- **MW-03 / D-09..D-12 (out-of-flow auto-commit):** all three out-of-flow writers now route through the shared seam; running gsd_ui_phase / gsd_map_codebase / gsd_quick during a phase auto-commits the `.planning/` output onto the currently checked-out branch (phase-N during a phase), leaving the tree clean for gsd_ship preflight; map-codebase's bespoke commit is gone.

## Verification

- `node --test test/out-of-flow-commit.test.mjs` → 10 pass, 0 fail.
- `node --test test/out-of-flow-commit.test.mjs test/phase-tools-git.test.mjs test/discuss-artifacts.test.mjs` (focused wiring regression on non-overlapping files) → 27 pass, 0 fail.
- `npm test` (full suite) → **335 pass, 0 fail** (up from 322 after Plan 01; +13 new out-of-flow assertions).
- Acceptance greps: `commitArtifacts(cwd, args.phase, { scope: "ui", phaseName: phase.name })` exactly once in ui.js; `commitArtifacts(cwd, null, { scope: "quick"` exactly once in quick.js; `gitAddCommit` == 0, `execFileSync` == 0, `docs: map existing codebase` == 0, `docs(planning): codebase map` present (call + summary + header) in map-codebase.js.

## Key decisions

- `commitArtifacts` phase-tool call sites stay byte-identical; ui.js reuses the existing ui scope-token message (no override), while the two phase-less writers (map, quick) use `null` phaseNum + a message override per the D-12 seam semantics from Plan 01.
- map-codebase's commit is now async (`await`) through the seam instead of synchronous `execFileSync`; the summary/header text updated so it no longer claims the old message.

## Known Stubs

None. No TODO/FIXME/placeholder/skipped tests introduced in this plan's files.

## Threat Flags

- **Best-effort safety preserved (D-06/D-08):** all three new commitArtifacts call sites inherit the seam's no-throw best-effort semantics — `git add`/commit/not-a-repo failures return `{ committed: false, warning }` and never throw, so project-less / non-repo / offline runs proceed. No fail-loud behavior introduced here (the D-08 fail-loud guard lives in `ensurePhaseBranch`, Plan 02).
- **SECURITY (D-07):** no new raw git invocations were added; map-codebase's synchronous `execFileSync` git call was actually REMOVED, and all three route through the fixed-argument-array `commitArtifacts` seam (`-C cwd`, no shell strings, no model/supplied interpolation).

## Self-Check: PASSED

- `lib/ui.js`, `lib/map-codebase.js`, `lib/quick.js` all modified and import `commitArtifacts`; `test/out-of-flow-commit.test.mjs` created (95 lines, ≥ required 40) and passing.
- Three atomic commits exist on `phase-20`: `6324a14` (ui), `3795e42` (map-codebase), `49a53cd` (quick).
- Working tree clean except the pre-existing `.planning/async-jobs.json` modification (not in this plan's files).

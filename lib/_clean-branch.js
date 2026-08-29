// @dsh-gsd/bundle — clean-PR-branch core (Phase 35).
//
// GAP-01: leave reviewers with only real code changes. gsd_ship derives a clean
// branch that carries only the phase's real code + the durable cross-phase
// planning artefacts, excluding the per-phase planning-artifact subtree
// (`./planning/phases/`) from the review diff.
//
// This module is the STANDALONE core (plan 01): pure domain functions that
// filter a phase's changed-path set (D-01), decide the D-07 fallback, name and
// squash the clean branch (D-05), and resolve the D-09 config switch — plus the
// integration `buildCleanBranch` that forward-applies the filtered diff as ONE
// squash commit onto `origin/<base>` with no history rewrite (D-03/D-06) and
// explicit rename (R) composition.
//
// Split tiers, mirroring gates.js: pure I/O-free functions (Domain) are
// separated from the git orchestration (Integration), the latter taking an
// injectable `gitFn(cwd, argsArray)` seam for unit testing. No new runtime
// dependencies (D-10): everything runs through node:child_process/fs and the
// existing git/gh CLIs.

import { zeroPad } from "./_shared.js";

// ── single source of the exclusion boundary (D-02 / CQ-02) ──────────────────
// The per-phase planning-artifact subtree. EXCLUDE_AFFIX is the bare repo path;
// EXCLUDE_PATHSPEC is the git magic pathspec form (the `:(exclude)` colon is
// REQUIRED — a bare `(exclude)…` matches nothing). Both derive from the one
// affix so the JS predicate and the git pathspec can never drift.
export const EXCLUDE_AFFIX = ".planning/phases";
export const EXCLUDE_PATHSPEC = `:(exclude)${EXCLUDE_AFFIX}`;

// True when a path is inside the per-phase planning subtree — either exactly the
// affix directory itself or under it (D-01 boundary).
export function isExcludedPath(path) {
  return path === EXCLUDE_AFFIX || path.startsWith(EXCLUDE_AFFIX + "/");
}

// Filter a phase's changed-path entries down to "real" changes, dropping every
// path under `.planning/phases/` while keeping all durable cross-phase files and
// real code paths (D-01). Two entry shapes:
//   - non-rename  { status, path }            — kept when !isExcludedPath(path)
//   - rename      { status: "R", oldPath, newPath } — kept when EITHER side is
//     non-excluded (D-01 boundary: a rename that touches real code on either
//     side is a real change; a rename wholly inside `.planning/phases/` is not).
// Entries are returned unchanged, in order.
export function filterRealChanges(nameStatusEntries) {
  return (nameStatusEntries || []).filter((entry) => {
    if (!entry) return false;
    if (entry.status === "R") {
      return !isExcludedPath(entry.oldPath) || !isExcludedPath(entry.newPath);
    }
    return !isExcludedPath(entry.path);
  });
}

// D-07 fallback signal: a phase changes no files outside `.planning/phases/`
// when the rename-aware filter leaves nothing. Reuses filterRealChanges so the
// fallback predicate and the filtering rule share one implementation.
export function phaseChangedCode(entries) {
  return filterRealChanges(entries).length > 0;
}

// D-05: clean branch name `phase-<NN>-clean` (zero-padded N).
export function cleanBranchName(phaseNum) {
  return `phase-${zeroPad(phaseNum)}-clean`;
}

// Squash-commit message template for the ONE clean-branch commit (discretion;
// research recommends `phase <NN>: <name>`).
export function squashMessage(phaseNum, phaseName) {
  return `phase ${phaseNum}: ${phaseName}`;
}

// D-09 clean-PR resolution: ON by default (absent key or missing cfg), disabled
// only by `workflow.clean_pr_branch: false` config or a `no_clean_pr: true`
// param. The param, when passed, overrides config.
export function resolveCleanPr(cfg, noCleanPr) {
  return noCleanPr === true ? false : (cfg?.workflow?.clean_pr_branch !== false);
}

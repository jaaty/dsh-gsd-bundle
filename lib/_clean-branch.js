// @dsh-gsd/bundle — clean-PR-branch core (Phase 35).
//
// GAP-01: leave reviewers with only real code changes. gsd_ship derives a clean
// branch that carries the phase's real code + the durable cross-phase planning
// artefacts. Since Phase 43 (option C) the per-phase planning-artifact subtree
// (`.planning/phases/`) is INCLUDED in the clean branch so that `main` becomes
// the durable record after the clean PR merges and the phase branch is deleted —
// the planning memory must survive the phase-branch cleanup.
//
// This module is the STANDALONE core (plan 01): pure domain functions that
// name and squash the clean branch (D-05), and resolve the D-09 config switch —
// plus the integration `buildCleanBranch` that forward-applies the phase's
// changed-path set as ONE squash commit onto `origin/<base>` with no history
// rewrite (D-03/D-06) and explicit rename (R) composition.
//
// Split tiers, mirroring gates.js: pure I/O-free functions (Domain) are
// separated from the git orchestration (Integration), the latter taking an
// injectable `gitFn(cwd, argsArray)` seam for unit testing. No new runtime
// dependencies (D-10): everything runs through node:child_process/fs and the
// existing git/gh CLIs.

import { zeroPad } from "./_shared.js";

// ── legacy exclusion boundary (D-02 / CQ-02) ────────────────────────────────
// Retained for backward compatibility and the D-07 fallback predicate, but the
// clean branch no longer EXCLUDES `.planning/phases/` (option C): the per-phase
// planning subtree must reach `main` so the record survives phase-branch
// deletion. EXCLUDE_AFFIX is the bare repo path; EXCLUDE_PATHSPEC is the git
// magic pathspec form (the `:(exclude)` colon is REQUIRED — a bare
// `(exclude)…` matches nothing).
export const EXCLUDE_AFFIX = ".planning/phases";
export const EXCLUDE_PATHSPEC = `:(exclude)${EXCLUDE_AFFIX}`;

// True when a path is inside the per-phase planning subtree — either exactly the
// affix directory itself or under it (D-01 boundary).
export function isExcludedPath(path) {
  return path === EXCLUDE_AFFIX || path.startsWith(EXCLUDE_AFFIX + "/");
}

// Filter a phase's changed-path entries down to "real" changes. Under option C
// the clean branch carries EVERYTHING (code + planning), so this is a pass-through
// that keeps all entries — the per-phase planning subtree is no longer dropped.
// Two entry shapes are preserved unchanged:
//   - non-rename  { status, path }
//   - rename      { status: "R", oldPath, newPath }
// Entries are returned unchanged, in order.
export function filterRealChanges(nameStatusEntries) {
  return (nameStatusEntries || []).filter(Boolean);
}

// D-07 fallback signal: a phase changes no files at all when the filter leaves
// nothing. Reuses filterRealChanges so the fallback predicate and the filtering
// rule share one implementation.
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

// Parse git's NUL-separated `--name-status -z` records into entries.
//   git diff --name-status -z emits records separated by NUL with a trailing
//   NUL: `A\0<path>\0` for a one-path status, and a rename as
//   `R100\0<old>\0<new>\0`. CRITICAL (D-02/rename correctness): a rename's
//   similarity score rides in the SAME first token (`R100`), so the rename
//   branch MUST match `token.startsWith("R")` and NEVER `token === "R"` — a
//   scored `R100` token treated as a one-path entry would desynchronize the
//   entire parse and swallow the following old/new path tokens. The status
//   letter (token[0]) decides the entry shape: R consumes TWO path tokens,
//   every other status exactly ONE.
export function parseNameStatusZ(raw) {
  const tokens = String(raw ?? "").split("\0");
  // git emits a trailing NUL → drop the final empty token.
  if (tokens.length && tokens[tokens.length - 1] === "") tokens.pop();
  const entries = [];
  for (let i = 0; i < tokens.length; ) {
    const statusToken = tokens[i];
    if (!statusToken) break; // malformed empty status — stop defensively.
    if (statusToken.startsWith("R")) {
      const oldPath = tokens[i + 1];
      const newPath = tokens[i + 2];
      if (oldPath === undefined || newPath === undefined) break; // truncated input
      entries.push({ status: "R", oldPath, newPath });
      i += 3;
    } else {
      const path = tokens[i + 1];
      if (path === undefined) break; // truncated input
      entries.push({ status: statusToken[0], path });
      i += 2;
    }
  }
  return entries;
}

// Integration tier: forward-apply the phase's full changed-path set (code +
// planning, option C) as ONE squash commit onto `origin/<base>` and restore the
// original branch. No history rewrite / filter-branch / force-push (D-06).
//
// Sequence (per research OQ-1/OQ-2/D-03/D-04):
//   1. capture the original branch (phase-<N>) so we can restore it — the
//      completion-state writes must land back on phase-<N>, never the clean
//      branch (R1/OQ-2);
//   2. best-effort `fetch origin <base>` (guarded, D-06);
//   3. mergeBase = merge-base origin/<base> HEAD  (D-04 origin target);
//   4. headCommit = rev-parse HEAD                 (pre-completion snapshot, OQ-2);
//   5. parse the name-status diff of mergeBase..headCommit;
//   6. keep the full changed-path set (code + planning, option C);
//   7. D-07 fallback: if nothing changed, return { built: false } WITHOUT switching.
//   8. else build: switch -c <clean> origin/<base>, checkout the full head tree,
//      `rm -r` any deletion / rename old-path, make the ONE squash commit, and
//      switch back.
//
// Build-step failures (other than the guarded fetch) propagate their rejection
// so gsd_ship surfaces the real cause (R3).
export async function buildCleanBranch({ cwd, gitFn, phaseNum, phaseName, base }) {
  // (1) original branch for later restore.
  const originalBranch = (await gitFn(cwd, ["rev-parse", "--abbrev-ref", "HEAD"])).trim();

  // (2) best-effort fetch of the base ref so `origin/<base>` is a valid local
  // ref for the merge-base and the switch (D-04/D-06). Failure is swallowed.
  try {
    await gitFn(cwd, ["fetch", "origin", base, "--quiet"]);
  } catch {
    // best-effort — proceed with whatever tracking ref is present.
  }

  // (3)(4) merge-base against origin/<base> (D-04), head snapshot (OQ-2).
  const mergeBase = (await gitFn(cwd, ["merge-base", `origin/${base}`, "HEAD"])).trim();
  const headCommit = (await gitFn(cwd, ["rev-parse", "HEAD"])).trim();

  // (5)(6) parse the full name-status diff (including D/R statuses — we cannot
  // reuse fetchGitData's ACM-only changedFiles; R3) and keep the full set.
  const raw = await gitFn(cwd, ["diff", "--name-status", "-z", mergeBase, headCommit]);
  const entries = parseNameStatusZ(raw);
  const real = filterRealChanges(entries);

  // (7) D-07 fallback: a phase that changes no files at all.
  if (real.length === 0) {
    return { built: false, reason: "no-real-changes" };
  }

  // (8a) create the clean branch from origin/<base>.
  await gitFn(cwd, ["switch", "-c", cleanBranchName(phaseNum), `origin/${base}`]);
  // (8b) stage the full head tree (code + planning, option C) in one
  // copy-from-tree — no exclusion pathspec.
  await gitFn(cwd, ["checkout", headCommit, "--", "."]);

  // (8c) removals: a path the phase deleted, or the base-only old side of a
  // rename, must be removed from the fresh origin/base working tree — a forward
  // copy from the head tree alone would leave them stale (R2).
  for (const entry of real) {
    if (entry.status === "D") {
      await gitFn(cwd, ["rm", "-r", "--", entry.path]);
    } else if (entry.status === "R") {
      await gitFn(cwd, ["rm", "-r", "--", entry.oldPath]);
    }
  }

  // (8d) the SINGLE squash commit (D-03).
  await gitFn(cwd, ["commit", "-m", squashMessage(phaseNum, phaseName)]);

  // (8e) restore the phase-<N> working branch so completion writes stay there.
  await gitFn(cwd, ["switch", originalBranch]);

  return { built: true, cleanBranch: cleanBranchName(phaseNum), mergeBase, headCommit };
}

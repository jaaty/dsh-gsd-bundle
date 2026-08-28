// @dsh-gsd/bundle — shared git-artifact seam for the phase loop.
//
// Every phase tool (discuss/plan/execute/verify) commits its freshly-written
// .planning/ artefacts onto the per-phase feature branch. This module is the
// single reusable seam for that: `ensurePhaseBranch` acquires the `phase-<N>`
// branch at the start of gsd_discuss, and `commitArtifacts` best-effort stages
// and commits `.planning` wholesale after each tool writes its artefacts.
//
// Injectable git seam: both functions accept an optional `gitFn(cwd, argsArray)`
// that defaults to an async `promisify(execFile)` wrapper (mirroring ship.js's
// git() helper). This is the same seam gates.js's fetchGitData exposes, so the
// helpers are unit-testable with a fake gitFn and no real git/fs.
//
// SECURITY: every git call here uses a FIXED argument array with `-C cwd`
// (never a shell string) — mirroring ship.js / map-codebase.js. No caller or
// model-supplied value is interpolated into a shell command.

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { slugify } from "./_shared.js";

const execFileP = promisify(execFile);

// Async default git wrapper (mirrors ship.js `git` — NOT the sync execFileSync
// of map-codebase.js), so awaiting phase tools don't block the event loop.
async function defaultGitFn(cwd, args) {
  return (await execFileP("git", args, { cwd, encoding: "utf8" })).stdout.trim();
}

// Acquire the per-phase feature branch `phase-<N>` (unpadded N). Called at the
// start of gsd_discuss, before CONTEXT/DISCUSSION-LOG are written, so those
// writes + their commit land on phase-<N>.
//
// Returns { branch, action, defaultBranch? } or, on a no-git workspace,
// { branch, action: "noop", warning } without throwing (D-08).
export async function ensurePhaseBranch(cwd, phaseNum, gitFn = defaultGitFn) {
  const branch = `phase-${phaseNum}`;

  // D-08 no-git / not-a-repo no-op — never throws.
  let current;
  try {
    current = (await gitFn(cwd, ["rev-parse", "--abbrev-ref", "HEAD"])).trim();
  } catch {
    return { branch, action: "noop", warning: "git unavailable or not a repository — branch acquisition skipped" };
  }

  // D-01 stay-put / D-10 re-run: already on phase-<N> → no checkout issued.
  if (current === branch) {
    return { branch, action: "present" };
  }

  // D-02 base detection: origin/HEAD → "main" fallback (mirrors ship.js line 87).
  let defaultBranch;
  try {
    defaultBranch = (await gitFn(cwd, ["symbolic-ref", "refs/remotes/origin/HEAD", "--short"]))
      .trim()
      .replace(/^origin\//, "") || "main";
  } catch {
    defaultBranch = "main";
  }

  // D-01/D-05 fail-loud on a different non-base branch (would fork off the wrong base).
  if (current !== defaultBranch) {
    throw new Error(
      `gsd_*: on branch "${current}", not base "${defaultBranch}" nor "phase-${phaseNum}". Checkout a base branch before discussing.`,
      { cause: undefined }
    );
  }

  // D-05 real-cause propagation on checkout failure.
  try {
    await gitFn(cwd, ["checkout", "-b", branch]);
  } catch (e) {
    throw new Error(`gsd_*: git checkout -b ${branch} failed: ${e.message}`, { cause: e });
  }

  return { branch, defaultBranch, action: "created" };
}

// Best-effort commit of planning artefacts (D-03, D-04, D-06, OQ-5). Stages
// `.planning` WHOLESALE so STATE.md (mutated by every phase tool) and the phase
// artefact dir are both captured, keeping the full-tree `git status --short`
// clean for gsd_ship preflight. Never throws — swallows no-git / nothing-staged
// / add / commit failures with a warning (mirrors map-codebase gitAddCommit).
//
// Returns { committed, staged, message, warning? }.
//
// D-12: `phaseNum` may be `null` and an optional `opts.message` overrides the
// generated default message. Out-of-flow writers (UI-SPEC / codebase-map / quick)
// pass `null` + a `message` override so no phase interpolation (`null` in the
// text) leaks into their commit. Phase tools omit `message`, so their generated
// default template stays byte-identical. `opts` is taken whole rather than
// destructured so the override resolves at exactly one point in this function.
export async function commitArtifacts(cwd, phaseNum, opts = {}, gitFn = defaultGitFn) {
  const message = opts.message || `docs(planning): phase ${phaseNum} ${slugify(opts.phaseName)} ${opts.scope} artefacts`;

  try {
    await gitFn(cwd, ["add", ".planning"]);
  } catch (e) {
    return { committed: false, staged: [], message, warning: `git add failed: ${e.message}` };
  }

  let staged;
  try {
    staged = (await gitFn(cwd, ["diff", "--cached", "--name-only"])).split("\n").filter(Boolean);
  } catch {
    staged = [];
  }

  if (!staged.length) {
    return { committed: false, staged: [], message, warning: "nothing staged — no planning changes to commit" };
  }

  try {
    await gitFn(cwd, ["commit", "-m", message]);
  } catch (e) {
    return { committed: false, staged, message, warning: `git commit failed: ${e.message}` };
  }

  return { committed: true, staged, message };
}

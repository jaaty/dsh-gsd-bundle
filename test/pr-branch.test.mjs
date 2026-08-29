// Unit tests for the clean-PR-branch core in lib/_clean-branch.js (Phase 35).
// Style mirrors test/_git-artifacts.test.mjs: pure in-memory inputs through a
// scripted fake gitFn — no real git/fs is touched.

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  EXCLUDE_AFFIX,
  EXCLUDE_PATHSPEC,
  isExcludedPath,
  filterRealChanges,
  phaseChangedCode,
  cleanBranchName,
  squashMessage,
  resolveCleanPr,
  parseNameStatusZ,
  buildCleanBranch,
} from "../lib/_clean-branch.js";

// Build a scripted fake gitFn that records every args array it is called with.
// `responses` maps either the full args joined by space (first-class) or the
// first argv (e.g. "diff") to canned stdout — the first-argv key is checked
// after the full-args key so distinct git calls can be scripted independently;
// when neither key is present the call rejects.
function scriptedGit(responses = {}, { rejectAll = false } = {}) {
  const calls = [];
  const fn = async (_cwd, args) => {
    calls.push([...args]);
    if (rejectAll) throw new Error("git unavailable");
    const joined = args.join(" ");
    if (Object.prototype.hasOwnProperty.call(responses, joined)) {
      const v = responses[joined];
      return typeof v === "function" ? v() : v;
    }
    const out = responses[args[0]];
    if (out === undefined) throw new Error(`unexpected git call: ${joined}`);
    return out;
  };
  fn.calls = calls;
  return fn;
}

function hasCall(calls, arg) {
  return calls.some((c) => c.includes(arg));
}

describe("exclusion boundary (D-01 / D-02)", () => {
  test("isExcludedPath drops the affix dir itself and anything under it", () => {
    assert.equal(isExcludedPath(".planning/phases"), true);
    assert.equal(isExcludedPath(".planning/phases/GSD-35-pr-branch/foo.md"), true);
    assert.equal(isExcludedPath(".planning/phases/a/b/c.md"), true);
  });

  test("isExcludedPath keeps durable files and real code", () => {
    assert.equal(isExcludedPath("lib/ship.js"), false);
    assert.equal(isExcludedPath(".planning/STATE.md"), false);
    assert.equal(isExcludedPath(".planning/ROADMAP.md"), false);
    assert.equal(isExcludedPath(".planning/codebase/STACK.md"), false);
    assert.equal(isExcludedPath(".planning"), false);
    assert.equal(isExcludedPath(".planning/phasesX/y.md"), false, "sibling prefix must not match");
  });

  test("filterRealChanges drops .planning/phases entries, keeps durable + code (D-01 exact boundary)", () => {
    const entries = [
      { status: "M", path: "lib/ship.js" },
      { status: "A", path: ".planning/phases/GSD-35-pr-branch/GSD-35-pr-branch-SUMMARY-01.md" },
      { status: "A", path: ".planning/phases/GSD-35-pr-branch/GSD-35-pr-branch-CONTEXT.md" },
      { status: "M", path: ".planning/STATE.md" },
      { status: "M", path: ".planning/ROADMAP.md" },
      { status: "A", path: ".planning/codebase/STACK.md" },
    ];
    const kept = filterRealChanges(entries);
    const paths = kept.map((e) => e.path);
    assert.deepEqual(paths, ["lib/ship.js", ".planning/STATE.md", ".planning/ROADMAP.md", ".planning/codebase/STACK.md"]);
    assert.ok(!paths.some((p) => p.startsWith(EXCLUDE_AFFIX + "/")), "no .planning/phases path survives");
  });

  test("rename rule: kept unless BOTH sides are inside .planning/phases (R edge of D-01)", () => {
    // newPath non-excluded → kept
    const keepByNew = filterRealChanges([
      { status: "R", oldPath: ".planning/phases/a.md", newPath: "lib/shared.js" },
    ]);
    assert.deepEqual(keepByNew, [{ status: "R", oldPath: ".planning/phases/a.md", newPath: "lib/shared.js" }]);

    // oldPath non-excluded → kept
    const keepByOld = filterRealChanges([
      { status: "R", oldPath: "lib/old.js", newPath: ".planning/phases/b.md" },
    ]);
    assert.deepEqual(keepByOld, [{ status: "R", oldPath: "lib/old.js", newPath: ".planning/phases/b.md" }]);

    // both sides excluded → dropped
    const dropBoth = filterRealChanges([
      { status: "R", oldPath: ".planning/phases/x.md", newPath: ".planning/phases/y.md" },
    ]);
    assert.deepEqual(dropBoth, []);
  });

  test("EXCLUDE_PATHSPEC is the single-source git form of EXCLUDE_AFFIX", () => {
    assert.equal(EXCLUDE_PATHSPEC, `:(exclude)${EXCLUDE_AFFIX}`);
    assert.match(EXCLUDE_PATHSPEC, /^:\(exclude\)/);
  });
});

describe("fallback / name / squash / config (D-07 / D-05 / D-09)", () => {
  test("phaseChangedCode is false for an all-.planning/phases set", () => {
    const entries = [
      { status: "A", path: ".planning/phases/GSD-35-pr-branch/GSD-35-pr-branch-CONTEXT.md" },
      { status: "A", path: ".planning/phases/GSD-35-pr-branch/GSD-35-pr-branch-RESEARCH.md" },
    ];
    assert.equal(phaseChangedCode(entries), false);
  });

  test("phaseChangedCode is true when any durable/code path is present", () => {
    assert.equal(phaseChangedCode([{ status: "M", path: ".planning/STATE.md" }]), true);
    assert.equal(phaseChangedCode([{ status: "M", path: "lib/ship.js" }]), true);
  });

  test("phaseChangedCode is true for a rename whose newPath is outside .planning/phases", () => {
    assert.equal(phaseChangedCode([{ status: "R", oldPath: ".planning/phases/a.md", newPath: "lib/shared.js" }]), true);
    assert.equal(phaseChangedCode([{ status: "R", oldPath: ".planning/phases/x.md", newPath: ".planning/phases/y.md" }]), false);
  });

  test("cleanBranchName zero-pads and appends -clean (D-05)", () => {
    assert.equal(cleanBranchName(35), "phase-35-clean");
    assert.equal(cleanBranchName(7), "phase-07-clean");
  });

  test("squashMessage is 'phase <N>: <name>'", () => {
    const m = squashMessage(35, "pr-branch");
    assert.ok(m.startsWith("phase 35:"));
    assert.ok(m.includes("pr-branch"));
    assert.equal(m, "phase 35: pr-branch");
  });

  test("resolveCleanPr defaults ON, disables on explicit false or no_clean_pr (D-09)", () => {
    assert.equal(resolveCleanPr({ workflow: { clean_pr_branch: false } }, undefined), false);
    assert.equal(resolveCleanPr({}, undefined), true, "absent key → ON");
    assert.equal(resolveCleanPr(undefined, undefined), true, "missing cfg → ON");
    assert.equal(resolveCleanPr(null, undefined), true, "null cfg → ON");
    assert.equal(resolveCleanPr({ workflow: { clean_pr_branch: true } }, true), false, "param overrides config");
    assert.equal(resolveCleanPr({ workflow: { clean_pr_branch: false } }, false), false);
    assert.equal(resolveCleanPr({ workflow: { clean_pr_branch: true } }, undefined), true);
  });
});

describe("parseNameStatusZ", () => {
  test("one-path statuses each consume one path token", () => {
    const entries = parseNameStatusZ("A\0lib/new.js\0D\0lib/gone.js\0");
    assert.deepEqual(entries, [
      { status: "A", path: "lib/new.js" },
      { status: "D", path: "lib/gone.js" },
    ]);
  });

  test("scored rename R100 consumes TWO path tokens and does not swallow the next record", () => {
    const entries = parseNameStatusZ("R100\0lib/old.js\0lib/renamed.js\0M\0lib/keep.js\0");
    assert.deepEqual(entries, [
      { status: "R", oldPath: "lib/old.js", newPath: "lib/renamed.js" },
      { status: "M", path: "lib/keep.js" },
    ]);
  });

  test("handles empty / trailing-only input", () => {
    assert.deepEqual(parseNameStatusZ(""), []);
    assert.deepEqual(parseNameStatusZ("\0"), []);
  });
});

describe("buildCleanBranch", () => {
  const BASE_CMDS = {
    "rev-parse --abbrev-ref HEAD": "phase-35",
    "merge-base origin/main HEAD": "abc123",
    "rev-parse HEAD": "def456",
  };

  test("built: switches to clean, checkouts with EXCLUDE_PATHSPEC, one commit, restores, returns built (D-03/D-05)", async () => {
    const raw = "M\0lib/ship.js\0A\0.planning/codebase/STACK.md\0A\0.planning/phases/GSD-35-pr-branch/GSD-35-pr-branch-SUMMARY-01.md\0";
    const git = scriptedGit({
      ...BASE_CMDS,
      "fetch origin main --quiet": "",
      "switch": "",
      "checkout": "",
      "commit": "",
      "diff": raw,
    });
    const res = await buildCleanBranch({ cwd: "/repo", gitFn: git, phaseNum: 35, phaseName: "pr-branch", base: "main" });

    assert.equal(res.built, true);
    assert.equal(res.cleanBranch, "phase-35-clean");
    assert.equal(res.mergeBase, "abc123");
    assert.equal(res.headCommit, "def456");

    const switchCalls = git.calls.filter((c) => c[0] === "switch");
    const cleanCreate = switchCalls.find((c) => c[1] === "-c");
    assert.ok(cleanCreate, "must switch -c");
    assert.deepEqual(cleanCreate, ["switch", "-c", "phase-35-clean", "origin/main"]);

    const co = git.calls.find((c) => c[0] === "checkout");
    assert.ok(co, "checkout to copy the filtered tree must run");
    assert.deepEqual(co, ["checkout", "def456", "--", ".", EXCLUDE_PATHSPEC], "checkout must carry the exclusion pathspec");

    const commits = git.calls.filter((c) => c[0] === "commit");
    assert.equal(commits.length, 1, "exactly one squash commit");
    assert.equal(commits[0][1], "-m");
    assert.equal(commits[0][2], "phase 35: pr-branch");

    const restore = switchCalls.find((c) => c.length === 2 && c[1] === "phase-35");
    assert.ok(restore, "must switch back to phase-35");
    assert.deepEqual(restore, ["switch", "phase-35"]);
  });

  test("fallback: all-.planning/phases diff returns built false, issues NO switch (D-07)", async () => {
    const raw = "A\0.planning/phases/GSD-35-pr-branch/GSD-35-pr-branch-CONTEXT.md\0M\0.planning/phases/GSD-35-pr-branch/GSD-35-pr-branch-RESEARCH.md\0";
    const git = scriptedGit({
      ...BASE_CMDS,
      "fetch origin main --quiet": "",
      "switch": "",
      "checkout": "",
      "commit": "",
      "diff": raw,
    });
    const res = await buildCleanBranch({ cwd: "/repo", gitFn: git, phaseNum: 35, phaseName: "pr-branch", base: "main" });
    assert.equal(res.built, false);
    assert.equal(res.reason, "no-real-changes");
    assert.equal(hasCall(git.calls, "switch"), false, "no branch switch on fallback");
    assert.equal(hasCall(git.calls, "commit"), false, "no commit on fallback");
  });

  test("deletion-rm: a D path issues one `rm -r -- <path>`", async () => {
    const git = scriptedGit({
      ...BASE_CMDS,
      "fetch origin main --quiet": "",
      "switch": "",
      "checkout": "",
      "commit": "",
      "rm": "",
      "diff": "D\0lib/gone.js\0",
    });
    const res = await buildCleanBranch({ cwd: "/repo", gitFn: git, phaseNum: 35, phaseName: "pr-branch", base: "main" });
    assert.equal(res.built, true);
    const rmCalls = git.calls.filter((c) => c[0] === "rm");
    assert.equal(rmCalls.length, 1, "one rm for the deletion");
    assert.deepEqual(rmCalls[0], ["rm", "-r", "--", "lib/gone.js"]);
  });

  test("rename composition: rm non-excluded oldPath; no rm when oldPath is excluded", async () => {
    // (a) R {oldPath:lib/old.js, newPath:lib/new.js} → rm lib/old.js
    const git1 = scriptedGit({
      ...BASE_CMDS,
      "fetch origin main --quiet": "",
      "switch": "",
      "checkout": "",
      "commit": "",
      "rm": "",
      "diff": "R100\0lib/old.js\0lib/new.js\0",
    });
    await buildCleanBranch({ cwd: "/repo", gitFn: git1, phaseNum: 35, phaseName: "pr-branch", base: "main" });
    const rm1 = git1.calls.filter((c) => c[0] === "rm");
    assert.deepEqual(rm1, [["rm", "-r", "--", "lib/old.js"]], "rm the non-excluded old path");

    // (b) R {oldPath:.planning/phases/old.md, newPath:lib/new.js} → NO rm
    const git2 = scriptedGit({
      ...BASE_CMDS,
      "fetch origin main --quiet": "",
      "switch": "",
      "checkout": "",
      "commit": "",
      "rm": "",
      "diff": "R100\0.planning/phases/old.md\0lib/new.js\0",
    });
    await buildCleanBranch({ cwd: "/repo", gitFn: git2, phaseNum: 35, phaseName: "pr-branch", base: "main" });
    assert.equal(hasCall(git2.calls, "rm"), false, "no rm when the excluded oldPath side falls out of the pathspec");

    // (c) R {oldPath:lib/old.js, newPath:.planning/phases/new.md} → rm lib/old.js (old non-excluded)
    const git3 = scriptedGit({
      ...BASE_CMDS,
      "fetch origin main --quiet": "",
      "switch": "",
      "checkout": "",
      "commit": "",
      "rm": "",
      "diff": "R100\0lib/old.js\0.planning/phases/new.md\0",
    });
    await buildCleanBranch({ cwd: "/repo", gitFn: git3, phaseNum: 35, phaseName: "pr-branch", base: "main" });
    const rm3 = git3.calls.filter((c) => c[0] === "rm");
    assert.deepEqual(rm3, [["rm", "-r", "--", "lib/old.js"]], "rm the non-excluded old path");
  });

  test("best-effort fetch failure is swallowed; build proceeds (D-06)", async () => {
    const git = scriptedGit({
      ...BASE_CMDS,
      "switch": "",
      "checkout": "",
      "commit": "",
      "diff": "M\0lib/ship.js\0",
    });
    // no "fetch origin main --quiet" key → fetch rejects
    const res = await buildCleanBranch({ cwd: "/repo", gitFn: git, phaseNum: 35, phaseName: "pr-branch", base: "main" });
    assert.equal(res.built, true, "fetch failure must not stop the build");
  });
});

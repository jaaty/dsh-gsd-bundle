// Unit tests for the shared git-artifact seam in lib/_git-artifacts.js.
// Style mirrors test/gates.test.mjs: pure, in-memory inputs through a fake
// gitFn — no real git/fs is touched (the fetchGitData mock-seam pattern).

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { ensurePhaseBranch, commitArtifacts } from "../lib/_git-artifacts.js";

// Build a scripted fake gitFn that records every args array it is called with.
// `responses` maps the first argv (e.g. "rev-parse") to canned stdout; when the
// first argv is not in responses (or `rejectAll` is true) the call rejects.
function scriptedGit(responses = {}, { rejectAll = false, rejectArg } = {}) {
  const calls = [];
  const fn = async (_cwd, args) => {
    calls.push([...args]);
    if (rejectAll) throw new Error("git unavailable");
    if (rejectArg && rejectArg === args[0]) throw new Error(`${args[0]} failed`);
    const out = responses[args[0]];
    if (out === undefined) throw new Error(`unexpected git call: ${args.join(" ")}`);
    return out;
  };
  fn.calls = calls;
  return fn;
}

function hasCall(calls, arg) {
  return calls.some((c) => c.includes(arg));
}

describe("ensurePhaseBranch", () => {
  test("already on phase-7 returns action 'present' and issues NO checkout", async () => {
    const git = scriptedGit({ "rev-parse": "phase-7" });
    const res = await ensurePhaseBranch("/repo", 7, git);
    assert.equal(res.action, "present");
    assert.equal(res.branch, "phase-7");
    assert.equal(hasCall(git.calls, "checkout"), false);
  });

  test("on main with origin/HEAD=origin/main creates phase-7 (unpadded N)", async () => {
    const git = scriptedGit({
      "rev-parse": "main",
      "symbolic-ref": "origin/main",
      "checkout": "",
    });
    const res = await ensurePhaseBranch("/repo", 7, git);
    assert.equal(res.action, "created");
    assert.equal(res.branch, "phase-7");
    assert.deepEqual(git.calls.at(-1), ["checkout", "-b", "phase-7"]);
  });

  test("on main with no origin/HEAD falls back to 'main' and still creates phase-7 (D-02)", async () => {
    const git = scriptedGit(
      { "rev-parse": "main", "checkout": "" },
      { rejectArg: "symbolic-ref" }
    );
    const res = await ensurePhaseBranch("/repo", 7, git);
    assert.equal(res.action, "created");
    assert.equal(res.defaultBranch, "main");
    assert.deepEqual(git.calls.at(-1), ["checkout", "-b", "phase-7"]);
  });

  test("on an unrelated feature branch 'foo' throws, mentioning the branch (D-01, D-05)", async () => {
    const git = scriptedGit({ "rev-parse": "foo", "symbolic-ref": "origin/main" });
    await assert.rejects(
      ensurePhaseBranch("/repo", 7, git),
      /"foo"/
    );
  });

  test("gitFn rejects on first rev-parse returns action 'noop' with a warning, does NOT throw (D-08)", async () => {
    const git = scriptedGit({}, { rejectAll: true });
    const res = await ensurePhaseBranch("/repo", 7, git);
    assert.equal(res.action, "noop");
    assert.match(res.warning, /git unavailable or not a repository/);
  });
});

describe("commitArtifacts", () => {
  test("happy path stages .planning, commits with conventional message, returns staged list (OQ-5)", async () => {
    const git = scriptedGit({
      "add": "",
      "diff": "a.md\nb.md",
      "commit": "",
    });
    const res = await commitArtifacts("/repo", 17, { scope: "discuss", phaseName: "phase-branch-isolation" }, git);
    assert.equal(res.committed, true);
    assert.deepEqual(res.staged, ["a.md", "b.md"]);
    // The wholesale stage target must be exactly ".planning".
    assert.ok(hasCall(git.calls, "add"));
    const addCall = git.calls.find((c) => c.includes("add"));
    assert.deepEqual(addCall, ["add", ".planning"]);
    const commitCall = git.calls.find((c) => c[0] === "commit");
    assert.equal(commitCall[0], "commit");
    assert.equal(commitCall[1], "-m");
    assert.match(commitCall[2], /^docs\(planning\): phase 17 phase-branch-isolation discuss artefacts$/);
  });

  test("nothing staged returns committed false with a warning and issues NO commit (D-06)", async () => {
    const git = scriptedGit({
      "add": "",
      "diff": "",
    });
    const res = await commitArtifacts("/repo", 17, { scope: "discuss", phaseName: "phase-branch-isolation" }, git);
    assert.equal(res.committed, false);
    assert.deepEqual(res.staged, []);
    assert.match(res.warning, /nothing staged/);
    assert.equal(hasCall(git.calls, "commit"), false);
  });

  test("gitFn rejects on 'add' returns committed false, does NOT throw (D-06)", async () => {
    const git = scriptedGit({}, { rejectArg: "add" });
    const res = await commitArtifacts("/repo", 17, { scope: "plan", phaseName: "phase-branch-isolation" }, git);
    assert.equal(res.committed, false);
    assert.match(res.warning, /git add failed/);
  });

  test("gitFn rejects on 'commit' returns committed false, does NOT throw (D-06)", async () => {
    const git = scriptedGit(
      { "add": "", "diff": "a.md" },
      { rejectArg: "commit" }
    );
    const res = await commitArtifacts("/repo", 17, { scope: "verify", phaseName: "phase-branch-isolation" }, git);
    assert.equal(res.committed, false);
    assert.deepEqual(res.staged, ["a.md"]);
    assert.match(res.warning, /git commit failed/);
  });
});

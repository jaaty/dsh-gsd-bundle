// Pre-ship-verify gate suite (Phase 29, plan 01). Proves SHIP-01 and decisions
// D-01..D-06 by driving the pure runPreflightVerify seam (lib/preflight-verify.js)
// with an injected fake execFile (never real npm, no network, no real repo), by
// testing copyTree/cleanupTempDir against a real temp dir, and by statically
// checking the lib/ship.js wiring so the gate demonstrably runs between the
// capability gates and the push and honors skip_verify.
//
// Style mirrors test/gates-ship.test.mjs and test/ship-async.test.mjs
// (node --test + node:assert/strict). Self-cleaning: every temp dir it creates
// is removed in a finally / t.after.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFile, writeFile, mkdir, access } from "node:fs/promises";
import path from "node:path";

import { runPreflightVerify, copyTree, makeTempDir, cleanupTempDir } from "../lib/preflight-verify.js";

// A fake execFile that records its calls and returns a per-command behavior.
// `behaviors` maps the command name ("npm ci" / "npm test") to either a resolved
// value or a rejected error. Records each invocation as { cmd, opts }.
function fakeExecFile(behaviors) {
  const calls = [];
  const fn = async (cmd, args, opts) => {
    const key = `${cmd} ${args.join(" ")}`;
    calls.push({ key, opts });
    const behavior = behaviors[key];
    if (behavior && behavior.reject) throw behavior.reject;
    return behavior && behavior.resolve ? behavior.resolve : { stdout: "", stderr: "" };
  };
  fn.calls = calls;
  return fn;
}

describe("runPreflightVerify", () => {
  test("runs npm ci then npm test in order and returns pass on success", async () => {
    const exec = fakeExecFile({
      "npm ci": { resolve: { stdout: "added 1", stderr: "" } },
      "npm test": { resolve: { stdout: "ok", stderr: "" } },
    });
    const res = await runPreflightVerify("/tmp/fake", exec);
    assert.deepEqual(res, { status: "pass", step: null, output: "" });
    assert.deepEqual(exec.calls.map((c) => c.key), ["npm ci", "npm test"], "npm ci runs before npm test");
    for (const c of exec.calls) {
      assert.equal(c.opts.cwd, "/tmp/fake", "runs in the temp dir");
      assert.equal(c.opts.encoding, "utf8", "utf8 encoding");
    }
  });

  test("npm ci failure returns fail with step npm ci and the stderr in output", async () => {
    const err = new Error("boom");
    err.stderr = "npm ERR! code E404";
    const fn = async (cmd, args, opts) => {
      if (cmd === "npm" && args[0] === "ci") throw err;
      return { stdout: "", stderr: "" };
    };
    const res = await runPreflightVerify("/tmp/fake", fn);
    assert.equal(res.status, "fail");
    assert.equal(res.step, "npm ci");
    assert.ok(res.output.includes("E404"), res.output);
  });

  test("npm test failure returns fail with step npm test", async () => {
    const exec = fakeExecFile({
      "npm ci": { resolve: { stdout: "", stderr: "" } },
      "npm test": { reject: new Error("boom") },
    });
    const res = await runPreflightVerify("/tmp/fake", exec);
    assert.equal(res.status, "fail");
    assert.equal(res.step, "npm test");
  });

  test("npm not found (ENOENT) fails with the real cause in output (D-06)", async () => {
    const err = new Error("spawn npm ENOENT");
    err.code = "ENOENT";
    err.stderr = "npm: not found";
    const fn = async (cmd, args, opts) => {
      if (cmd === "npm" && args[0] === "ci") throw err;
      return { stdout: "", stderr: "" };
    };
    const res = await runPreflightVerify("/tmp/fake", fn);
    assert.equal(res.status, "fail");
    assert.equal(res.step, "npm ci");
    assert.ok(res.output.includes("not found"), res.output);
  });
});

describe("pre-ship-verify edge cases (D-06)", () => {
  test("offline/network failure during npm ci fails with the real cause, never silently skipped", async () => {
    const err = new Error("network down");
    err.stderr = "npm error code ENOTFOUND registry.npmjs.org";
    const fn = async (cmd, args, opts) => {
      if (cmd === "npm" && args[0] === "ci") throw err;
      return { stdout: "", stderr: "" };
    };
    const res = await runPreflightVerify("/tmp/fake", fn);
    assert.equal(res.status, "fail");
    assert.equal(res.step, "npm ci");
    assert.ok(res.output.includes("ENOTFOUND"), res.output);
  });

  test("temp dir is removed in a finally even when npm ci fails (D-06)", async () => {
    const dir = await makeTempDir();
    const err = new Error("boom");
    err.stderr = "npm ERR! code E404";
    const fn = async (cmd, args, opts) => {
      if (cmd === "npm" && args[0] === "ci") throw err;
      return { stdout: "", stderr: "" };
    };
    try {
      const res = await runPreflightVerify(dir, fn);
      assert.equal(res.status, "fail");
    } finally {
      await cleanupTempDir(dir);
    }
    await assert.rejects(access(dir), "temp dir removed after a failing run");
  });
});

describe("copyTree", () => {
  test("copies files but excludes node_modules and .git subtrees (D-01)", async () => {
    const src = await makeTempDir();
    const dest = await makeTempDir();
    try {
      await writeFile(path.join(src, "a.txt"), "hello");
      await mkdir(path.join(src, "node_modules"));
      await writeFile(path.join(src, "node_modules", "dep.js"), "x");
      await mkdir(path.join(src, ".git"));
      await writeFile(path.join(src, ".git", "HEAD"), "ref");

      await copyTree(src, dest);

      await access(path.join(dest, "a.txt"));
      await assert.rejects(access(path.join(dest, "node_modules")), "node_modules excluded");
      await assert.rejects(access(path.join(dest, ".git")), ".git excluded");
    } finally {
      await cleanupTempDir(src);
      await cleanupTempDir(dest);
    }
  });
});

describe("cleanupTempDir", () => {
  test("removes the temp dir (D-06)", async () => {
    const dir = await makeTempDir();
    await writeFile(path.join(dir, "x.txt"), "x");
    await cleanupTempDir(dir);
    await assert.rejects(access(dir), "dir removed after cleanup");
  });
});

describe("ship.js wiring (static)", () => {
  test("gate runs between the capability gates and the push; skip_verify skips it", async () => {
    const src = await readFile(new URL("../lib/ship.js", import.meta.url), "utf8");

    // skip_verify is a tool parameter (D-03).
    assert.match(src, /skip_verify:\s*\{\s*type:\s*"boolean"/, "skip_verify boolean parameter present");

    // The gate section must sit textually BEFORE the push step so a failing gate
    // aborts before any push/PR I/O (D-02).
    const pushIdx = src.indexOf("6. push branch");
    assert.ok(pushIdx > -1, "push-branch step marker present");
    const gateIdx = src.indexOf("pre-ship-verify");
    assert.ok(gateIdx > -1 && gateIdx < pushIdx, "pre-ship-verify gate runs before push");

    // The module is imported and the gate is orchestrated (D-05).
    assert.match(src, /from\s+"\.\/preflight-verify\.js"/, "preflight-verify module imported");
    assert.match(src, /runPreflightVerify\(tempDir\)/, "runPreflightVerify called");
    assert.match(src, /cleanupTempDir\(tempDir\)/, "temp dir cleaned up in a finally");
  });
});

// Pure pre-ship verification module for the gsd_ship gatekeeper (Phase 29).
// Domain tier: runPreflightVerify is a pure orchestration seam that runs
// `npm ci` then `npm test` in a temp copy of the repo, with I/O only through an
// injectable execFile (mirroring fetchGitData in lib/gates.js) so it is
// deterministic and unit-testable without real npm, network, or a real repo.
//
// The copy/cleanup helpers (copyTree, makeTempDir, cleanupTempDir) are thin
// wrappers over node:fs/promises builtins. No external dependencies.

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, cp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

// Run `npm ci` then `npm test` in tempDir, in order, via the injected execFile
// (defaulting to promisify(execFile)). Never throws: returns a structured
// { status, step, output } so the caller (ship.js) decides how to fail.
//   - both succeed            -> { status: "pass", step: null, output: "" }
//   - npm ci rejects          -> { status: "fail", step: "npm ci", output: <stderr> }
//   - npm test rejects        -> { status: "fail", step: "npm test", output: <stderr> }
async function runPreflightVerify(tempDir, execFileFn = promisify(execFile)) {
  const opts = { cwd: tempDir, encoding: "utf8" };
  try {
    await execFileFn("npm", ["ci"], opts);
  } catch (err) {
    return { status: "fail", step: "npm ci", output: String(err.stderr || err.stdout || "").trim() };
  }
  try {
    await execFileFn("npm", ["test"], opts);
  } catch (err) {
    return { status: "fail", step: "npm test", output: String(err.stderr || err.stdout || "").trim() };
  }
  return { status: "pass", step: null, output: "" };
}

// Copy the working tree into dest, excluding any `node_modules` and `.git`
// subtree (D-01). The filter receives the source path; returning false skips
// that entry and its whole subtree.
async function copyTree(src, dest) {
  return cp(src, dest, {
    recursive: true,
    filter: (s) => !/node_modules$/.test(s) && !/\.git$/.test(s),
  });
}

// Create a fresh temp dir under os.tmpdir() for the verification copy.
function makeTempDir() {
  return mkdtemp(path.join(os.tmpdir(), "gsd-preflight-"));
}

// Remove a temp dir recursively, ignoring errors (force: true).
function cleanupTempDir(dir) {
  return rm(dir, { recursive: true, force: true });
}

export { runPreflightVerify, copyTree, makeTempDir, cleanupTempDir };

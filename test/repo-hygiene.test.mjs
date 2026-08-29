// Repo-hygiene verification for @dsh-gsd/bundle (Phase 26: repo-hygiene).
//
// Proves PUB-03 (the repo carries a CHANGELOG, a code of conduct, and a
// contribution guide, and the .planning/ keep-vs-gitignore-vs-curate decision
// is made, applied, and documented):
//   - D-01/D-02: CHANGELOG.md exists at the repo root in Keep-a-Changelog
//     format (Unreleased + v2.0.0 + v1.7.0 sections).
//   - D-03: CODE_OF_CONDUCT.md is the Contributor Covenant 2.1.
//   - D-04/D-05: CONTRIBUTING.md is full-depth (setup, tests, PR workflow, GSD
//     loop) and carries the no-credentials-in-.planning hygiene rule.
//   - D-08/D-09: README links the three files and documents the curate
//     decision in its .planning/ artefacts section.
//   - D-06/D-07: the volatile .planning/ files are untracked while the
//     durable artefacts remain tracked.

import { test } from "node:test";
import assert from "node:assert/strict";

import { promises as fsPromises } from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

// Repo root, resolved robustly from this test file (test/repo-hygiene.test.mjs).
// The test lives at <root>/test/repo-hygiene.test.mjs, so the root is one level up.
const ROOT = new URL("../", import.meta.url).pathname;

async function readRepoFile(rel) {
  return fsPromises.readFile(path.join(ROOT, rel), "utf8");
}

// Shell out to "git ls-files" (as the existing git-assertion tests do) to
// inspect the actual tracking state of the .planning/ artefacts.
function gitLsFiles(rel) {
  return execFileSync("git", ["ls-files", rel], { cwd: ROOT, encoding: "utf8" });
}

test("CHANGELOG.md exists and is Keep-a-Changelog with Unreleased + v2.0.0 + v1.7.0 (D-01/D-02)", async () => {
  const changelog = await readRepoFile("CHANGELOG.md");
  assert.ok(changelog.includes("# Changelog"), "CHANGELOG.md lacks the '# Changelog' title");
  assert.ok(
    changelog.includes("## [Unreleased]"),
    "CHANGELOG.md lacks an '## [Unreleased]' section",
  );
  assert.ok(changelog.includes("## [2.0.0]"), "CHANGELOG.md lacks the '## [2.0.0]' section");
  assert.ok(changelog.includes("## [1.7.0]"), "CHANGELOG.md lacks the '## [1.7.0]' section");
});

test("CODE_OF_CONDUCT.md exists and is the Contributor Covenant 2.1 (D-03)", async () => {
  const coc = await readRepoFile("CODE_OF_CONDUCT.md");
  assert.ok(coc.includes("Contributor Covenant"), "CODE_OF_CONDUCT.md does not name the Contributor Covenant");
  assert.ok(coc.includes("2.1"), "CODE_OF_CONDUCT.md does not reference version 2.1");
});

test("CONTRIBUTING.md is full-depth: tests, PR workflow, GSD loop, no-credentials rule (D-04/D-05)", async () => {
  const contributing = await readRepoFile("CONTRIBUTING.md");
  assert.ok(
    contributing.includes("node --test"),
    "CONTRIBUTING.md does not mention the test command (node --test)",
  );
  assert.ok(
    /pull request|PR|contribution/i.test(contributing),
    "CONTRIBUTING.md does not describe a PR/contribution workflow",
  );
  assert.ok(
    /Discuss|Plan|Execute|Verify|Ship/.test(contributing),
    "CONTRIBUTING.md does not explain the GSD phase loop",
  );
  assert.ok(
    /credential|token|secret/i.test(contributing),
    "CONTRIBUTING.md does not carry the no-credentials hygiene rule (D-05)",
  );
});

test("README links CHANGELOG.md, CONTRIBUTING.md, and CODE_OF_CONDUCT.md (D-09)", async () => {
  const readme = await readRepoFile("README.md");
  assert.ok(readme.includes("CHANGELOG.md"), "README does not link CHANGELOG.md");
  assert.ok(readme.includes("CONTRIBUTING.md"), "README does not link CONTRIBUTING.md");
  assert.ok(readme.includes("CODE_OF_CONDUCT.md"), "README does not link CODE_OF_CONDUCT.md");
});

test("README .planning/ artefacts section documents the curate decision (D-08)", async () => {
  const readme = await readRepoFile("README.md");
  assert.ok(
    /gitignore|git-ignore|volatile/i.test(readme),
    "README does not document the curate decision (gitignore/volatile)",
  );
});

test("volatile .planning/ files are untracked, durable ones tracked (D-06/D-07)", (t) => {
  let tracked;
  try {
    tracked = gitLsFiles(".planning/");
  } catch {
    // Not running inside a git repository (e.g. the gsd_ship pre-ship-verify
    // gate copies the working tree into a temp dir excluding .git, then runs
    // `npm test`). The tracking-state assertions are only meaningful in the
    // real repo, so skip gracefully instead of failing the gate.
    t.skip("not a git repository (pre-ship-verify temp copy)");
    return;
  }
  assert.ok(
    !tracked.includes(".planning/WINDOWS.md"),
    ".planning/WINDOWS.md is still tracked (should be gitignored)",
  );
  assert.ok(
    !tracked.includes(".planning/async-jobs.json"),
    ".planning/async-jobs.json is still tracked (should be gitignored)",
  );
  assert.ok(
    !/\.planning\/quick\//.test(tracked),
    ".planning/quick/ records are still tracked (should be gitignored)",
  );
  assert.ok(
    !/-DISCUSSION-LOG\.md/.test(tracked),
    "a *-DISCUSSION-LOG.md file is still tracked (should be gitignored)",
  );
  assert.ok(
    tracked.includes(".planning/STATE.md"),
    ".planning/STATE.md is not tracked (durable artefact should be tracked)",
  );
  assert.ok(
    tracked.includes(".planning/ROADMAP.md"),
    ".planning/ROADMAP.md is not tracked (durable artefact should be tracked)",
  );
  assert.ok(
    /-CONTEXT\.md/.test(tracked),
    "no per-phase -CONTEXT.md is tracked (durable artefact should be tracked)",
  );
});

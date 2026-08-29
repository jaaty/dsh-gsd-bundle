// Repo-configuration verification for @dsh-gsd/bundle (Phase 33: github-repo-config).
//
// Proves REL-04 (the GitHub repository is configured for discoverability and
// canonical linking) and every D-NN decision:
//   - D-01: the repo homepage URL is the npm package page
//     (https://www.npmjs.com/package/@dsh-gsd/bundle).
//   - D-05: the package.json homepage field is unchanged (it stays the GitHub
//     repo URL per npm convention; the GitHub repo homepage and the npm package
//     homepage are independent and each canonical in its own context).
//
// This is a purely structural phase: no runtime code. The test shells out to
// the gh CLI (already a project tool, used by lib/ship.js and
// lib/map-codebase.js) and asserts the resulting repo state, matching the
// test/repo-hygiene.test.mjs shell-out pattern.

import { test } from "node:test";
import assert from "node:assert/strict";

import { promises as fsPromises } from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

// Repo root, resolved robustly from this test file (test/repo-config.test.mjs).
// The test lives at <root>/test/repo-config.test.mjs, so the root is one level up.
const ROOT = new URL("../", import.meta.url).pathname;

// The canonical npm package page (D-01) and the unchanged package.json homepage
// (D-05). The two are independent and each canonical in its own context.
const NPM_PAGE = "https://www.npmjs.com/package/@dsh-gsd/bundle";
const GITHUB_PAGE = "https://github.com/jaaty/dsh-gsd-bundle";

// The seven searchable topics (D-02).
const EXPECTED_TOPICS = [
  "dsh",
  "deepseek-harness",
  "opengsd",
  "gsd",
  "git-ship-done",
  "plugin",
  "coding-agent",
];

// Shell out to "gh repo view <repo> --json <fields>" and return the parsed
// object. The repo is passed EXPLICITLY (jaaty/dsh-gsd-bundle) rather than
// relying on the cwd's git remote, so the test also passes in the gsd_ship
// pre-ship-verify temp copy, which excludes the .git directory (no remote to
// infer the repo from). On a non-zero exit, throw an Error carrying the real
// gh stderr so the failure is loud and actionable (D-04) — never silently pass.
function ghRepoView(fields) {
  let out;
  try {
    out = execFileSync(
      "gh",
      ["repo", "view", "jaaty/dsh-gsd-bundle", "--json", fields],
      { cwd: ROOT, encoding: "utf8" },
    );
  } catch (err) {
    throw new Error(`gh repo view failed: ${err.stderr}`);
  }
  return JSON.parse(out);
}

test("repo homepage URL is the npm package page (REL-04, D-01)", () => {
  const { homepageUrl } = ghRepoView("homepageUrl");
  assert.equal(
    homepageUrl,
    NPM_PAGE,
    "repo homepage URL is not the npm package page (D-01)",
  );
});

test("package.json homepage field is unchanged (D-05)", async () => {
  const pkg = JSON.parse(
    await fsPromises.readFile(path.join(ROOT, "package.json"), "utf8"),
  );
  assert.equal(
    pkg.homepage,
    GITHUB_PAGE,
    "package.json homepage field changed (D-05 forbids it)",
  );
});

test("repo topics include all seven configured topics (REL-04, D-02)", () => {
  const { repositoryTopics } = ghRepoView("repositoryTopics");
  const topics = (Array.isArray(repositoryTopics) ? repositoryTopics : []).map(
    (t) => t.name,
  );
  for (const topic of EXPECTED_TOPICS) {
    assert.ok(
      topics.includes(topic),
      `repo topics do not include '${topic}' (D-02)`,
    );
  }
});

// Shell out to "gh api repos/jaaty/dsh-gsd-bundle/private-vulnerability-reporting
// --jq .enabled" and return the trimmed output. This setting is NOT exposed by
// "gh repo view --json" (there is no private-vulnerability-reporting field
// there), so it MUST be queried via the REST API (D-03). On a non-zero exit,
// throw an Error carrying the real gh stderr (D-04 fail-loudly).
function ghVulnReportingEnabled() {
  let out;
  try {
    out = execFileSync(
      "gh",
      [
        "api",
        "repos/jaaty/dsh-gsd-bundle/private-vulnerability-reporting",
        "--jq",
        ".enabled",
      ],
      { cwd: ROOT, encoding: "utf8" },
    );
  } catch (err) {
    throw new Error(
      `gh api private-vulnerability-reporting failed: ${err.stderr}`,
    );
  }
  return out.trim();
}

test("repo is public (OQ-1 prerequisite for D-03)", () => {
  const { isPrivate } = ghRepoView("isPrivate");
  assert.equal(
    isPrivate,
    false,
    "repo is private, but private vulnerability reporting requires a public repo (OQ-1)",
  );
});

test("private vulnerability reporting is enabled (REL-04, D-03)", () => {
  assert.equal(
    ghVulnReportingEnabled(),
    "true",
    "private vulnerability reporting is not enabled (D-03)",
  );
});

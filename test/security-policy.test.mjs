// Security-policy & contribution-template verification for @dsh-gsd/bundle
// (Phase 32: security-policy-templates).
//
// Proves REL-03 (a SECURITY.md vulnerability-reporting policy and GitHub issue
// + pull-request templates so public contributors know how to report issues and
// open PRs) and every D-NN decision:
//   - D-01: SECURITY.md references GitHub private vulnerability reporting (no
//     email contact).
//   - D-02: SECURITY.md states a single maintained line (only the most recent
//     published release receives security fixes).
//   - D-03: two YAML issue forms under .github/ISSUE_TEMPLATE/ plus a config.yml
//     keeping blank issues enabled.
//   - D-04: a single .github/PULL_REQUEST_TEMPLATE.md with a summary, a
//     checklist (tests / no secrets / changelog), and a CONTRIBUTING.md + GSD
//     phase loop note.
//   - D-05: SECURITY.md is in the package.json files whitelist and linked from
//     README.
//   - D-06: dependency-free structural verification (no YAML parser, no new
//     dependency) that fails loudly with the real cause.
//
// This is a purely structural phase: no runtime code. The test asserts
// invariants via string includes, matching the test/license.test.mjs and
// test/repo-hygiene.test.mjs pattern.

import { test } from "node:test";
import assert from "node:assert/strict";

import { promises as fsPromises } from "node:fs";
import path from "node:path";

// Repo root, resolved robustly from this test file (test/security-policy.test.mjs).
// The test lives at <root>/test/security-policy.test.mjs, so the root is one level up.
const ROOT = new URL("../", import.meta.url).pathname;

async function readRepoFile(rel) {
  return fsPromises.readFile(path.join(ROOT, rel), "utf8");
}

test("SECURITY.md exists with Reporting a Vulnerability and Supported Versions sections (REL-03, D-01/D-02)", async () => {
  const security = await readRepoFile("SECURITY.md");
  assert.ok(
    security.includes("Reporting a Vulnerability"),
    "SECURITY.md does not contain a 'Reporting a Vulnerability' section",
  );
  assert.ok(
    security.includes("Supported Versions"),
    "SECURITY.md does not contain a 'Supported Versions' section",
  );
});

test("SECURITY.md references GitHub private vulnerability reporting and no email contact (D-01)", async () => {
  const security = await readRepoFile("SECURITY.md");
  assert.ok(
    /Security tab|Report a vulnerability/i.test(security),
    "SECURITY.md does not reference GitHub private vulnerability reporting (D-01)",
  );
  assert.ok(
    !/@[a-z0-9.-]+\.[a-z]{2,}/i.test(security),
    "SECURITY.md publishes an email contact (D-01 forbids it)",
  );
});

test("SECURITY.md states a single maintained line (only the most recent release) (D-02)", async () => {
  const security = await readRepoFile("SECURITY.md");
  assert.ok(
    /most\s+recent\s+published\s+release/i.test(security),
    "SECURITY.md does not state the single-maintained-line policy (D-02)",
  );
});

test("package.json files whitelist includes SECURITY.md (D-05)", async () => {
  const pkg = JSON.parse(await readRepoFile("package.json"));
  assert.ok(
    Array.isArray(pkg.files) && pkg.files.includes("SECURITY.md"),
    "package.json files array does not include SECURITY.md (D-05)",
  );
});

test("README links SECURITY.md (D-05)", async () => {
  const readme = await readRepoFile("README.md");
  assert.ok(
    readme.includes("[SECURITY.md](SECURITY.md)"),
    "README does not link SECURITY.md (D-05)",
  );
});

test("bug_report.yml issue form exists with name/description/body and a textarea element (D-03)", async () => {
  const form = await readRepoFile(".github/ISSUE_TEMPLATE/bug_report.yml");
  assert.ok(form.includes("name:"), "bug_report.yml lacks a 'name:' top-level key");
  assert.ok(form.includes("description:"), "bug_report.yml lacks a 'description:' top-level key");
  assert.ok(form.includes("body:"), "bug_report.yml lacks a 'body:' top-level key");
  assert.ok(form.includes("type: textarea"), "bug_report.yml lacks a 'type: textarea' form element");
});

test("feature_request.yml issue form exists with name/description/body and a textarea element (D-03)", async () => {
  const form = await readRepoFile(".github/ISSUE_TEMPLATE/feature_request.yml");
  assert.ok(form.includes("name:"), "feature_request.yml lacks a 'name:' top-level key");
  assert.ok(form.includes("description:"), "feature_request.yml lacks a 'description:' top-level key");
  assert.ok(form.includes("body:"), "feature_request.yml lacks a 'body:' top-level key");
  assert.ok(form.includes("type: textarea"), "feature_request.yml lacks a 'type: textarea' form element");
});

test("config.yml keeps blank issues enabled (D-03)", async () => {
  const config = await readRepoFile(".github/ISSUE_TEMPLATE/config.yml");
  assert.ok(
    config.includes("blank_issues_enabled: true"),
    "config.yml does not set blank_issues_enabled: true (D-03)",
  );
});

test("PULL_REQUEST_TEMPLATE.md exists with a summary section (D-04)", async () => {
  const pr = await readRepoFile(".github/PULL_REQUEST_TEMPLATE.md");
  assert.ok(pr.includes("## Summary"), "PULL_REQUEST_TEMPLATE.md lacks a '## Summary' section");
});

test("PULL_REQUEST_TEMPLATE.md checklist covers tests, no secrets, and changelog (D-04)", async () => {
  const pr = await readRepoFile(".github/PULL_REQUEST_TEMPLATE.md");
  assert.ok(/test/i.test(pr), "PULL_REQUEST_TEMPLATE.md checklist does not mention tests");
  assert.ok(/secret/i.test(pr), "PULL_REQUEST_TEMPLATE.md checklist does not mention secrets");
  assert.ok(/changelog/i.test(pr), "PULL_REQUEST_TEMPLATE.md checklist does not mention the changelog");
});

test("PULL_REQUEST_TEMPLATE.md references CONTRIBUTING.md and the GSD phase loop (D-04)", async () => {
  const pr = await readRepoFile(".github/PULL_REQUEST_TEMPLATE.md");
  assert.ok(pr.includes("CONTRIBUTING.md"), "PULL_REQUEST_TEMPLATE.md does not reference CONTRIBUTING.md");
  assert.ok(/GSD/i.test(pr), "PULL_REQUEST_TEMPLATE.md does not reference the GSD phase loop");
});

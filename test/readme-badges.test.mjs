// README provenance-badge verification for @dsh-gsd/bundle (Phase 34: readme-badges).
//
// Proves REL-05 (the README advertises CI status, license, and npm version)
// and the phase decisions that pin each badge:
//   - D-02: the CI badge targets the WHOLE CI workflow on branch `main`.
//   - D-04: each badge is clickable and links to the correct destination
//     (npm page / LICENSE file / CI workflow).
//   - D-03: the npm-version badge is a STATIC mirror of v2.2.0, not a dynamic
//     `latest` badge.
//   - D-06: a small structural test asserts the badge image URLs are present
//     in README.md and well-formed.
//
// This is a purely structural test: it reads README.md from the repo root and
// asserts on the raw Markdown text. It does not shell out or parse HTML,
// mirroring the repo's structural-test discipline.

import { test } from "node:test";
import assert from "node:assert/strict";

import { promises as fsPromises } from "node:fs";
import path from "node:path";

// Repo root, resolved robustly from this test file (test/readme-badges.test.mjs).
// The test lives at <root>/test/readme-badges.test.mjs, so the root is one level up.
const ROOT = new URL("../", import.meta.url).pathname;

test("README is readable from the repo root (D-06)", async () => {
  const readme = await fsPromises.readFile(path.join(ROOT, "README.md"), "utf8");
  assert.ok(readme.includes("# dsh-gsd-bundle"), "README.md missing its H1");
});

test("CI badge is present and links to the CI workflow (D-02, D-04)", async () => {
  const readme = await fsPromises.readFile(path.join(ROOT, "README.md"), "utf8");
  // The badge image URL targets the whole CI workflow (github/workflows/ci.yml)
  // on branch `main` (D-02).
  assert.ok(
    readme.includes(
      "https://github.com/jaaty/dsh-gsd-bundle/actions/workflows/ci.yml/badge?branch=main",
    ),
    "CI badge image URL missing or not pinned to branch=main (D-02)",
  );
  // The badge is clickable and links to the CI workflow (D-04).
  assert.ok(
    readme.includes("https://github.com/jaaty/dsh-gsd-bundle/actions/workflows/ci.yml"),
    "CI badge link destination missing (D-04)",
  );
});

test("license badge is present and links to the LICENSE file (D-03, D-04)", async () => {
  const readme = await fsPromises.readFile(path.join(ROOT, "README.md"), "utf8");
  // The license badge image is the shields.io github/license URL (D-03).
  assert.ok(
    readme.includes(
      "https://img.shields.io/github/license/jaaty/dsh-gsd-bundle?style=flat-square",
    ),
    "license badge image URL missing (D-03)",
  );
  // The badge is clickable and links to the LICENSE file (D-04).
  assert.ok(
    readme.includes("https://github.com/jaaty/dsh-gsd-bundle/blob/main/LICENSE"),
    "license badge link destination missing (D-04)",
  );
});

test("npm-version badge is statically pinned to v2.2.0 and links to the npm page (D-03, D-04)", async () => {
  const readme = await fsPromises.readFile(path.join(ROOT, "README.md"), "utf8");
  // The npm badge is a STATIC mirror pinned to @2.2.0 (D-03), not a dynamic
  // `latest` badge — the pinned substring @2.2.0?style must appear.
  assert.ok(
    readme.includes(
      "https://img.shields.io/npm/v/@dsh-gsd/bundle@2.2.0?style=flat-square",
    ),
    "npm-version badge image URL missing or not pinned to @2.2.0 (D-03)",
  );
  // Lock out the dynamic unpinned form (shields.io latest badge).
  assert.ok(
    !readme.includes("https://img.shields.io/npm/v/@dsh-gsd/bundle?style"),
    "dynamic unpinned npm badge present; D-03 requires the static @2.2.0 pin",
  );
  // The badge is clickable and links to the npm package page (D-04).
  assert.ok(
    readme.includes("https://www.npmjs.com/package/@dsh-gsd/bundle"),
    "npm badge link destination missing (D-04)",
  );
});

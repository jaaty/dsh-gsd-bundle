// README provenance-badge verification for @dsh-gsd/bundle (Phase 34: readme-badges).
//
// Proves REL-05 (the README advertises CI status, license, and npm version)
// and the phase decisions that pin each badge:
//   - D-02: the CI badge targets the WHOLE CI workflow on branch `main`.
//   - D-04: each badge is clickable and links to the correct destination
//     (npm page / LICENSE file / CI workflow).
//   - D-03: the npm-version badge is a STATIC mirror of the released version,
//     not a dynamic `latest` badge — implemented as a static shields badge
//     (npm-vX.Y.Z-blue) because the shields.io npm/v endpoint cannot pin an
//     arbitrary version (a @x.y.z suffix is treated as a dist-tag and renders
//     "npm: invalid").
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

// The npm-version badge is a static pinned shields badge (npm-vX.Y.Z-blue),
// per D-03 — shared by the npm-badge test and the badge-row test.
const NPM_STATIC_BADGE_RE =
  /https:\/\/img\.shields\.io\/badge\/npm-v\d+\.\d+\.\d+-blue\?style=flat-square/;

test("README is readable from the repo root (D-06)", async () => {
  const readme = await fsPromises.readFile(path.join(ROOT, "README.md"), "utf8");
  assert.ok(readme.includes("# dsh-gsd-bundle"), "README.md missing its H1");
});

test("CI badge is present and links to the CI workflow (D-02, D-04)", async () => {
  const readme = await fsPromises.readFile(path.join(ROOT, "README.md"), "utf8");
  // The badge image URL targets the whole CI workflow (github/workflows/ci.yml)
  // on branch `main` (D-02). The .svg extension is required: the bare /badge
  // path returns 404.
  assert.ok(
    readme.includes(
      "https://github.com/jaaty/dsh-gsd-bundle/actions/workflows/ci.yml/badge.svg?branch=main",
    ),
    "CI badge image URL missing, missing .svg, or not pinned to branch=main (D-02)",
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

test("npm-version badge is a static pinned badge and links to the npm page (D-03, D-04)", async () => {
  const readme = await fsPromises.readFile(path.join(ROOT, "README.md"), "utf8");
  // The npm badge is a STATIC mirror of the released version (D-03), rendered
  // as a static pinned shields badge (npm-vX.Y.Z-blue), not a dynamic badge.
  assert.match(
    readme,
    NPM_STATIC_BADGE_RE,
    "static pinned npm badge image URL missing (D-03)",
  );
  // Lock out the dynamic unpinned form (shields.io latest badge).
  assert.ok(
    !readme.includes("https://img.shields.io/npm/v/@dsh-gsd/bundle?style"),
    "dynamic unpinned npm badge present; D-03 requires the static pinned badge",
  );
  // Lock out the @x.y.z-suffixed npm/v form: shields.io treats the suffix as a
  // dist-tag and renders "npm: invalid".
  assert.ok(
    !readme.includes("https://img.shields.io/npm/v/@dsh-gsd/bundle@"),
    "@x.y.z-suffixed npm/v badge present; shields renders that form as \"npm: invalid\" (D-03)",
  );
  // The badge is clickable and links to the npm package page (D-04).
  assert.ok(
    readme.includes("https://www.npmjs.com/package/@dsh-gsd/bundle"),
    "npm badge link destination missing (D-04)",
  );
});

test("badge row is a single contiguous line immediately below the H1 (D-05)", async () => {
  const readme = await fsPromises.readFile(path.join(ROOT, "README.md"), "utf8");
  // The H1 and the badge row are adjacent on lines 1 and 2 with no blank line.
  assert.ok(
    readme.includes("# dsh-gsd-bundle\n[![CI]"),
    "badge row is not immediately below the H1 (D-05)",
  );
  assert.ok(
    !readme.includes("# dsh-gsd-bundle\n\n"),
    "blank line present between H1 and badge row (D-05)",
  );
  // All three badges share a single contiguous line, which is the first line
  // after the H1.
  const badgeLine = readme.split("# dsh-gsd-bundle\n")[1].split("\n")[0];
  assert.ok(
    badgeLine.includes(
      "https://github.com/jaaty/dsh-gsd-bundle/actions/workflows/ci.yml/badge.svg?branch=main",
    ),
    "CI badge image URL not on the badge row (D-05)",
  );
  assert.match(
    badgeLine,
    NPM_STATIC_BADGE_RE,
    "npm badge image URL not on the badge row (D-05)",
  );
  assert.ok(
    badgeLine.includes("https://github.com/jaaty/dsh-gsd-bundle/blob/main/LICENSE"),
    "LICENSE link not on the badge row (D-05)",
  );
});

test("exactly three badges exist and no fourth badge exists (D-01)", async () => {
  const readme = await fsPromises.readFile(path.join(ROOT, "README.md"), "utf8");
  const badgeLine = readme.split("# dsh-gsd-bundle\n")[1].split("\n")[0];
  const count = (badgeLine.match(/\[!\[/g) ?? []).length;
  assert.equal(
    count,
    3,
    `expected exactly three badges on the badge row, found ${count} (D-01)`,
  );
  // No npm-downloads badge anywhere (D-01 excludes any fourth badge).
  assert.ok(
    !readme.includes("img.shields.io/npm/dw"),
    "npm-downloads badge present but D-01 forbids a fourth badge",
  );
});

test("npm-version badge pin tracks the currently-released package.json version (D-03, REL-02)", async () => {
  const [readme, pkgRaw] = await Promise.all([
    fsPromises.readFile(path.join(ROOT, "README.md"), "utf8"),
    fsPromises.readFile(path.join(ROOT, "package.json"), "utf8"),
  ]);
  const pkg = JSON.parse(pkgRaw);
  assert.ok(
    pkg.version,
    "package.json carries a version field",
  );
  assert.ok(
    readme.includes(
      `https://img.shields.io/badge/npm-v${pkg.version}-blue?style=flat-square`,
    ),
    `npm badge not pinned to the released version v${pkg.version} (D-03 currency gate)`,
  );
});

test("Release status marks public-launch v2.2.0 as the latest release (D-07, REL-02)", async () => {
  const readme = await fsPromises.readFile(path.join(ROOT, "README.md"), "utf8");
  assert.ok(readme.includes("public-launch"), "public-launch reference missing (D-07)");
  assert.ok(readme.includes("v2.2.0"), "v2.2.0 reference missing (D-07)");
  assert.ok(
    readme.includes("### v2.2 release note — public-launch"),
    "v2.2 release-note heading missing (D-07)",
  );
});

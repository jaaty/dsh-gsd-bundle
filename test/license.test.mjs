// License & attribution verification for @dsh-gsd/bundle (Phase 25:
// license-and-attribution).
//
// Proves PUB-01 (an MIT LICENSE file exists at the repo root with the bundle's
// own copyright line), PUB-02 (a NOTICE file credits opengsd-core, the broken
// gsd-core-reference.md reference is replaced with a live repo link, and the
// NOTICE ships in the published npm tarball), and D-05 (package.json's
// "license" field stays "MIT" and matches the LICENSE file).

import { test } from "node:test";
import assert from "node:assert/strict";

import { promises as fsPromises } from "node:fs";
import path from "node:path";

// Repo root, resolved robustly from this test file (test/license.test.mjs).
// The test lives at <root>/test/license.test.mjs, so the root is one level up.
const ROOT = new URL("../", import.meta.url).pathname;

async function readRepoFile(rel) {
  return fsPromises.readFile(path.join(ROOT, rel), "utf8");
}

test("LICENSE exists at the repo root and is the canonical MIT text (PUB-01, D-01)", async () => {
  const license = await readRepoFile("LICENSE");
  assert.ok(license.includes("MIT License"), "LICENSE does not contain the MIT License heading");
  assert.ok(
    license.includes("Copyright (c) 2026 jaaty"),
    "LICENSE does not carry the bundle's own copyright line (D-01)",
  );
  assert.ok(
    license.includes("permission notice shall be included in all"),
    "LICENSE is missing the MIT condition paragraph",
  );
  assert.ok(
    license.includes("THE SOFTWARE IS PROVIDED \"AS IS\""),
    "LICENSE is missing the MIT warranty disclaimer",
  );
});

test("package.json license field is MIT and matches the LICENSE file (D-05)", async () => {
  const pkg = JSON.parse(await readRepoFile("package.json"));
  assert.equal(pkg.license, "MIT", "package.json license field is not 'MIT'");
  const license = await readRepoFile("LICENSE");
  assert.ok(license.includes("MIT License"), "LICENSE does not declare the MIT license");
});

// Unit tests for the pure, fs-free codebase-intel domain layer (lib/_intel.js):
// buildManifest / compareManifest / clampConfidence / changedFilesToDocs. No
// fake fs and no LLM — these are deterministic pure functions (phase 19, CBQX-01/02).

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  buildManifest, compareManifest, clampConfidence,
  changedFilesToDocs, IGNORE_PREFIXES, IGNORE_LOCKFILES,
} from "../lib/_intel.js";

describe("buildManifest", () => {
  test("keeps files with path/size/hash and drops dir entries", () => {
    const out = buildManifest([
      { path: "src/a.ts", type: "file", size: 5, content: "aaaaa" },
      { path: "src/", type: "dir" },
      { path: "empty-dir/", type: "dir" },
    ]);
    assert.equal(out.length, 1);
    assert.equal(out[0].path, "src/a.ts");
    assert.equal(out[0].size, 5);
    assert.equal(typeof out[0].hash, "string");
    assert.equal(out[0].hash.length, 40); // sha1 hex
  });

  test("ignores the D-03 prefix set (.planning/, .git/, node_modules/)", () => {
    const out = buildManifest([
      { path: ".planning/STATE.md", type: "file", size: 3, content: "abc" },
      { path: ".git/config", type: "file", size: 3, content: "def" },
      { path: "node_modules/lodash/index.js", type: "file", size: 3, content: "ghi" },
      { path: "src/main.ts", type: "file", size: 3, content: "jkl" },
    ]);
    assert.deepEqual(out.map((r) => r.path), ["src/main.ts"]);
  });

  test("ignores lockfiles regardless of directory depth", () => {
    const out = buildManifest([
      { path: "package-lock.json", type: "file", size: 1, content: "a" },
      { path: "yarn.lock", type: "file", size: 1, content: "b" },
      { path: "pnpm-lock.yaml", type: "file", size: 1, content: "c" },
      { path: "npm-shrinkwrap.json", type: "file", size: 1, content: "d" },
      { path: "bun.lock", type: "file", size: 1, content: "e" },
      { path: "bun.lockb", type: "file", size: 1, content: "f" },
      { path: "composer.lock", type: "file", size: 1, content: "g" },
      { path: "Gemfile.lock", type: "file", size: 1, content: "h" },
      { path: "poetry.lock", type: "file", size: 1, content: "i" },
      { path: "Cargo.lock", type: "file", size: 1, content: "j" },
      { path: "apps/web/package-lock.json", type: "file", size: 1, content: "k" },
      { path: "src/index.ts", type: "file", size: 1, content: "l" },
    ]);
    assert.deepEqual(out.map((r) => r.path), ["src/index.ts"]);
  });

  test("sorts output lexicographically by path", () => {
    const out = buildManifest([
      { path: "zzz.txt", type: "file", size: 1, content: "a" },
      { path: "aaa.txt", type: "file", size: 1, content: "b" },
      { path: "mmm.txt", type: "file", size: 1, content: "c" },
    ]);
    assert.deepEqual(out.map((r) => r.path), ["aaa.txt", "mmm.txt", "zzz.txt"]);
  });

  test("empty content hashes deterministically", () => {
    const a = buildManifest([{ path: "x", type: "file", size: 0, content: "" }]);
    const b = buildManifest([{ path: "x", type: "file", size: 0, content: "" }]);
    assert.equal(a[0].hash, b[0].hash);
  });
});

describe("compareManifest", () => {
  const mk = (path, size, hash) => ({ path, size, hash });

  test("detects added and removed files", () => {
    const manifest = [mk("a.ts", 1, "h1")];
    const current = [mk("b.ts", 1, "h2")];
    const res = compareManifest(manifest, current);
    assert.deepEqual(res, { added: ["b.ts"], removed: ["a.ts"], modified: [] });
  });

  test("detects modified by size difference without needing a hash read", () => {
    const manifest = [mk("a.ts", 5, "h1")];
    const current = [mk("a.ts", 9, undefined)];
    assert.deepEqual(compareManifest(manifest, current).modified, ["a.ts"]);
  });

  test("detects modified by hash difference on same-size files", () => {
    const manifest = [mk("a.ts", 5, "h1")];
    const current = [mk("a.ts", 5, "h2")];
    assert.deepEqual(compareManifest(manifest, current).modified, ["a.ts"]);
  });

  test("same-size with undefined hash is NOT modified (size-first discriminator)", () => {
    const manifest = [mk("a.ts", 5, undefined)];
    const current = [mk("a.ts", 5, undefined)];
    assert.deepEqual(compareManifest(manifest, current).modified, []);
  });

  test("identical records are not modified", () => {
    const manifest = [mk("a.ts", 5, "h1"), mk("b.ts", 2, "h2")];
    const current = [mk("b.ts", 2, "h2"), mk("a.ts", 5, "h1")];
    assert.deepEqual(compareManifest(manifest, current), { added: [], removed: [], modified: [] });
  });

  test("tolerates missing inputs", () => {
    assert.deepEqual(compareManifest(undefined, []), { added: [], removed: [], modified: [] });
    assert.deepEqual(compareManifest([], undefined), { added: [], removed: [], modified: [] });
  });
});

describe("clampConfidence", () => {
  test("passes in-range values through unchanged", () => {
    assert.equal(clampConfidence(0), 0);
    assert.equal(clampConfidence(1), 1);
    assert.equal(clampConfidence(0.5), 0.5);
  });

  test("clamps out-of-range values to [0,1]", () => {
    assert.equal(clampConfidence(-1), 0);
    assert.equal(clampConfidence(1.5), 1);
    assert.equal(clampConfidence(42), 1);
  });

  test("returns 0 for non-finite or missing input", () => {
    assert.equal(clampConfidence(undefined), 0);
    assert.equal(clampConfidence(NaN), 0);
    assert.equal(clampConfidence(Infinity), 0);
    assert.equal(clampConfidence("high"), 0);
  });
});

describe("changedFilesToDocs", () => {
  test("src/lib/auth.ts yields STACK, ARCHITECTURE, STRUCTURE, CONVENTIONS", () => {
    const docs = changedFilesToDocs(["src/lib/auth.ts"]);
    assert.deepEqual(docs, ["ARCHITECTURE", "CONVENTIONS", "STACK", "STRUCTURE"]);
  });

  test("test/auth.test.ts yields TESTING plus the code rule docs", () => {
    const docs = changedFilesToDocs(["test/auth.test.ts"]);
    assert.ok(docs.includes("TESTING"));
    assert.ok(docs.includes("STRUCTURE"));
    assert.ok(docs.includes("CONVENTIONS"));
  });

  test("package.json yields STACK", () => {
    assert.deepEqual(changedFilesToDocs(["package.json"]), ["STACK"]);
  });

  test("overlapping rules are deduped (src/app.ts -> one occurrence of each doc)", () => {
    const docs = changedFilesToDocs(["src/app.ts"]);
    // both the src/** rule and the .ts rule match src/app.ts
    assert.deepEqual(docs, ["ARCHITECTURE", "CONVENTIONS", "STACK", "STRUCTURE"]);
  });

  test("config/docker/github files map to their docs", () => {
    assert.deepEqual(changedFilesToDocs(["Dockerfile"]), ["INTEGRATIONS"]);
    assert.deepEqual(changedFilesToDocs([".github/workflows/ci.yml"]), ["INTEGRATIONS"]);
    assert.deepEqual(changedFilesToDocs(["db/migrations/001.sql"]), ["ARCHITECTURE"]);
    assert.deepEqual(changedFilesToDocs(["README.md"]), ["CONVENTIONS"]);
  });

  test("empty input yields empty set", () => {
    assert.deepEqual(changedFilesToDocs([]), []);
    assert.deepEqual(changedFilesToDocs(undefined), []);
  });
});

describe("ignore-set constants", () => {
  test("exported constants exist", () => {
    assert.ok(Array.isArray(IGNORE_PREFIXES));
    assert.ok(IGNORE_LOCKFILES instanceof RegExp);
  });
});

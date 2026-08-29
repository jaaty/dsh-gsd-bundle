// Unit tests for the clean-PR-branch core in lib/_clean-branch.js (Phase 35).
// Style mirrors test/_git-artifacts.test.mjs: pure in-memory inputs through a
// scripted fake gitFn — no real git/fs is touched.

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  EXCLUDE_AFFIX,
  EXCLUDE_PATHSPEC,
  isExcludedPath,
  filterRealChanges,
} from "../lib/_clean-branch.js";

describe("exclusion boundary (D-01 / D-02)", () => {
  test("isExcludedPath drops the affix dir itself and anything under it", () => {
    assert.equal(isExcludedPath(".planning/phases"), true);
    assert.equal(isExcludedPath(".planning/phases/GSD-35-pr-branch/foo.md"), true);
    assert.equal(isExcludedPath(".planning/phases/a/b/c.md"), true);
  });

  test("isExcludedPath keeps durable files and real code", () => {
    assert.equal(isExcludedPath("lib/ship.js"), false);
    assert.equal(isExcludedPath(".planning/STATE.md"), false);
    assert.equal(isExcludedPath(".planning/ROADMAP.md"), false);
    assert.equal(isExcludedPath(".planning/codebase/STACK.md"), false);
    assert.equal(isExcludedPath(".planning"), false);
    assert.equal(isExcludedPath(".planning/phasesX/y.md"), false, "sibling prefix must not match");
  });

  test("filterRealChanges drops .planning/phases entries, keeps durable + code (D-01 exact boundary)", () => {
    const entries = [
      { status: "M", path: "lib/ship.js" },
      { status: "A", path: ".planning/phases/GSD-35-pr-branch/GSD-35-pr-branch-SUMMARY-01.md" },
      { status: "A", path: ".planning/phases/GSD-35-pr-branch/GSD-35-pr-branch-CONTEXT.md" },
      { status: "M", path: ".planning/STATE.md" },
      { status: "M", path: ".planning/ROADMAP.md" },
      { status: "A", path: ".planning/codebase/STACK.md" },
    ];
    const kept = filterRealChanges(entries);
    const paths = kept.map((e) => e.path);
    assert.deepEqual(paths, ["lib/ship.js", ".planning/STATE.md", ".planning/ROADMAP.md", ".planning/codebase/STACK.md"]);
    assert.ok(!paths.some((p) => p.startsWith(EXCLUDE_AFFIX + "/")), "no .planning/phases path survives");
  });

  test("rename rule: kept unless BOTH sides are inside .planning/phases (R edge of D-01)", () => {
    // newPath non-excluded → kept
    const keepByNew = filterRealChanges([
      { status: "R", oldPath: ".planning/phases/a.md", newPath: "lib/shared.js" },
    ]);
    assert.deepEqual(keepByNew, [{ status: "R", oldPath: ".planning/phases/a.md", newPath: "lib/shared.js" }]);

    // oldPath non-excluded → kept
    const keepByOld = filterRealChanges([
      { status: "R", oldPath: "lib/old.js", newPath: ".planning/phases/b.md" },
    ]);
    assert.deepEqual(keepByOld, [{ status: "R", oldPath: "lib/old.js", newPath: ".planning/phases/b.md" }]);

    // both sides excluded → dropped
    const dropBoth = filterRealChanges([
      { status: "R", oldPath: ".planning/phases/x.md", newPath: ".planning/phases/y.md" },
    ]);
    assert.deepEqual(dropBoth, []);
  });

  test("EXCLUDE_PATHSPEC is the single-source git form of EXCLUDE_AFFIX", () => {
    assert.equal(EXCLUDE_PATHSPEC, `:(exclude)${EXCLUDE_AFFIX}`);
    assert.match(EXCLUDE_PATHSPEC, /^:\(exclude\)/);
  });
});

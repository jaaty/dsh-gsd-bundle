// Static regression tests for the Phase 12 single-source-constants dedup
// (plan 02, requirement CQ-02). Proves GATE_NAMES and the cwdOf helper are
// single-source by reading the lib sources and asserting the wiring:
//   - ship.js consumes GATE_NAMES from gates.js (no local const definition)
//   - core-tools.js and discuss.js route cwd through the shared cwdOf helper
//     (no inline exec?.agent?.session?.header?.cwd expression)
//
// Style mirrors test/_shared.test.mjs (node --test + node:assert/strict). No
// real git or filesystem is touched beyond reading the lib sources.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const readLib = (file) => readFile(new URL(`../lib/${file}`, import.meta.url), "utf8");

describe("GATE_NAMES single-source (D-02)", () => {
  test("ship.js imports GATE_NAMES from gates.js and has no local const definition", async () => {
    const src = await readLib("ship.js");
    assert.doesNotMatch(src, /const\s+GATE_NAMES\s*=/, "no local GATE_NAMES definition in ship.js");
    assert.match(src, /import\s*\{[^}]*GATE_NAMES[^}]*\}\s*from\s*["']\.\/gates\.js["']/, "GATE_NAMES imported from ./gates.js");
    assert.match(src, /GATE_NAMES\.includes/, "GATE_NAMES still referenced (skip-gate validation)");
  });
});

describe("cwdOf single-source (D-03)", () => {
  test("core-tools.js imports cwdOf from _runner.js and has no inline cwd expression", async () => {
    const src = await readLib("core-tools.js");
    assert.match(src, /import\s*\{\s*cwdOf\s*\}\s*from\s*["']\.\/_runner\.js["']/, "cwdOf imported from ./_runner.js");
    assert.doesNotMatch(src, /exec\?\.agent\?\.session\?\.header\?\.cwd/, "no inline exec?.agent?.session?.header?.cwd expression");
    assert.equal((src.match(/cwdOf\(exec\)/g) || []).length, 7, "all seven cwd sites route through cwdOf(exec)");
  });

  test("discuss.js imports cwdOf from _runner.js and has no inline cwd expression", async () => {
    const src = await readLib("discuss.js");
    assert.match(src, /import\s*\{\s*cwdOf\s*\}\s*from\s*["']\.\/_runner\.js["']/, "cwdOf imported from ./_runner.js");
    assert.doesNotMatch(src, /exec\?\.agent\?\.session\?\.header\?\.cwd/, "no inline exec?.agent?.session?.header?.cwd expression");
    assert.equal((src.match(/cwdOf\(exec\)/g) || []).length, 1, "the single cwd site routes through cwdOf(exec)");
  });
});

// Static regression tests for the Phase 16 planningContext total-budget wiring
// (plan 02, requirement CQ-06). PLAN 01 changed planningContext from a plain
// string to a `{ text, truncated }` object — a BREAKING return-shape change.
// These tests read each of the five tool sources and assert the new wiring, so
// a future regression (a call site passing the raw object into its prompt and
// leaking `[object Object]`, or forgetting the derived maxTotal budget) fails
// the suite:
//   - every tool that builds a <planning_context> derives the total budget from
//     config context_window via the shared contextBudget helper (D-02/D-03);
//   - every planningContext call passes that derived maxTotal as the 3rd arg
//     and reads the returned `.text` (not the object) for its prompt (D-05);
//   - every tool surfaces the `.truncated` list on its log/return channel;
//   - plan.js consumes the (previously dead) `cfg` variable for the budget.
//
// Style mirrors test/ship.test.mjs (node --test + node:assert/strict, reading
// each lib source with fs/promises). No real git or filesystem is touched
// beyond reading the lib sources.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const readLib = (file) => readFile(new URL(`../lib/${file}`, import.meta.url), "utf8");

// Each planningContext call site, with the number of planningContext() calls in
// that tool. The wiring assertions below are computed against these.
const TOOLS = [
  { file: "plan.js", calls: 3 },
  { file: "execute.js", calls: 1 },
  { file: "verify.js", calls: 1 },
  { file: "ui.js", calls: 2 },
  { file: "map-codebase.js", calls: 1 },
];

function assertWired(src, file, calls) {
  // 1. contextBudget is imported from the shared-helpers module (D-02/D-03).
  assert.match(
    src,
    /import\s*\{[^}]*contextBudget[^}]*\}\s*from\s*["']\.\/_shared\.js["']/,
    `${file} imports contextBudget from ./_shared.js`,
  );

  // 2. The budget is derived from a config read (context_window) at the call site.
  assert.match(src, /s\.readConfig\(cwd\)/, `${file} reads the config via s.readConfig(cwd)`);
  assert.match(src, /contextBudget\(/, `${file} derives the budget via contextBudget(...)`);

  // 3. Every planningContext() call passes `60000, <maxBudget>` as the 3rd arg
  //    (per-file cap retained + derived total budget), and the result's `.text`
  //    is read into the prompt — so no call site leaks `[object Object]`.
  const pcCount = (src.match(/planningContext\(/g) || []).length;
  assert.equal(pcCount, calls, `${file} has exactly ${calls} planningContext() call(s)`);
  const maxArgCount = (src.match(/60000,\s*[A-Za-z_$][\w$]*/g) || []).length;
  assert.equal(maxArgCount, calls, `${file} passes a derived maxTotal as the 3rd arg on every planningContext() call`);
  const textReads = (src.match(/\.text\b/g) || []).length;
  assert.ok(textReads >= calls, `${file} reads .text from the result for the prompt (${textReads} >= ${calls})`);

  // 4. The .truncated surface is referenced (surfacing per D-05).
  const truncRefs = (src.match(/\.truncated/g) || []).length;
  assert.ok(truncRefs >= calls, `${file} surfaces .truncated (${truncRefs} >= ${calls})`);
}

describe("planningContext total-budget wiring (CQ-06, plan 02)", () => {
  for (const { file, calls } of TOOLS) {
    test(`${file} wires the new { text, truncated } planningContext shape`, async () => {
      const src = await readLib(file);
      assertWired(src, file, calls);
    });
  }

  test("plan.js consumes cfg for the budget (no dead variable)", async () => {
    const src = await readLib("plan.js");
    // D-02: the read cfg feeds contextBudget -> the previously-dead `cfg` is used.
    assert.match(src, /contextBudget\(cfg\?\.context_window\)/, "plan.js derives maxBudget from cfg?.context_window");
    assert.match(src, /const cfg = await s\.readConfig\(cwd\);[\s\S]*?const maxBudget = contextBudget\(cfg\?\.context_window\)/, "cfg read is immediately consumed by the budget derivation");
  });

  test("plan.js routes the plan-checker prompt through the wired runChecker log", async () => {
    const src = await readLib("plan.js");
    // The plan-checker's planningContext lives inside runChecker, which now takes
    // a `log` param and is passed the shared log at both call sites.
    assert.match(src, /async function runChecker\([\s\S]*?, log\)/, "runChecker accepts a log channel");
    assert.equal((src.match(/runChecker\(ctx, exec, s, cwd, args\.phase, plans, phase, contextMd, researchMd, reqs, log\)/g) || []).length, 2, "both runChecker call sites pass the shared log");
  });

  test("map-codebase query mode surfaces truncation inline in the structured answer text", async () => {
    const src = await readLib("map-codebase.js");
    // Query mode returns a structured answer object (CBQX-03); the truncation
    // note is conditionally appended to that object's `text` field rather than a
    // log array (D-05).
    assert.match(src, /planning-context: truncated \$\{pc\.truncated\.length/, "query mode appends the truncation note to the structured answer text");
    assert.match(src, /pc\.truncated\.length\s*\n\s*\?\s*`\\n\\nplanning-context: truncated/, "query mode conditionally annotates the structured answer text");
  });
});

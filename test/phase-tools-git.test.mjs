// Static wiring tests for the Phase 17 shared-git-artifact seam (plan 03,
// requirement CQ-07). Proves each of gsd_plan / gsd_execute / gsd_verify imports
// and calls the shared `commitArtifacts` helper from lib/_git-artifacts.js at the
// end of its run, with its own per-tool scope, AFTER its STATE advance — so every
// phase tool auto-commits .planning and leaves a clean tree for gsd_ship preflight.
//
// Also asserts the D-03 "no duplication" rule: git stays in the shared helper;
// none of the three tools re-implements inline git (promisify(execFile) /
// execFileSync("git")).
//
// Style mirrors test/ship.test.mjs (node --test + node:assert/strict, static
// source assertions via readFile). No real git or filesystem is touched.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const readLib = (file) => readFile(new URL(`../lib/${file}`, import.meta.url), "utf8");

// Per-tool expected wiring: scope string, and the STATE-advance call the
// commitArtifacts call must appear textually after (so the commit captures it).
const TOOLS = [
  { file: "plan.js", scope: "plan", stateCall: "setStep(\"execute\")" },
  { file: "execute.js", scope: "execute", stateCall: "setActivePhase" },
  { file: "verify.js", scope: "verify", stateCall: "setActivePhase" },
];

describe("phase tools auto-commit via shared commitArtifacts (D-03/D-04/D-06)", () => {
  for (const { file, scope, stateCall } of TOOLS) {
    test(`${file} imports commitArtifacts from ./_git-artifacts.js`, async () => {
      const src = await readLib(file);
      assert.match(
        src,
        /import\s*\{\s*commitArtifacts\s*\}\s*from\s*["']\.\/_git-artifacts\.js["']/,
        `${file} must import commitArtifacts from ./_git-artifacts.js`,
      );
    });

    test(`${file} calls commitArtifacts with scope "${scope}" exactly once`, async () => {
      const src = await readLib(file);
      const callRe = new RegExp(
        `commitArtifacts\\(cwd, args\\.phase, \\{ scope: "${scope}", phaseName: phase\\.name \\}\\)`,
        "g",
      );
      assert.equal(
        (src.match(callRe) || []).length,
        1,
        `${file} must call commitArtifacts with scope "${scope}" exactly once`,
      );
    });

    test(`${file} calls commitArtifacts AFTER its STATE advance (${stateCall})`, async () => {
      const src = await readLib(file);
      const stateIdx = src.indexOf(stateCall);
      const commitIdx = src.indexOf(`{ scope: "${scope}", phaseName: phase.name }`);
      assert.notEqual(stateIdx, -1, `${file} must call ${stateCall}`);
      assert.notEqual(commitIdx, -1, `${file} must contain its commitArtifacts call`);
      assert.ok(
        commitIdx > stateIdx,
        `${file}: commitArtifacts (idx ${commitIdx}) must appear AFTER the STATE advance (${stateCall}, idx ${stateIdx})`,
      );
    });

    test(`${file} has NO inline git logic (stays in the shared helper)`, async () => {
      const src = await readLib(file);
      assert.doesNotMatch(src, /promisify\(\s*execFile\s*\)/, `${file} must not re-import promisify(execFile)`);
      assert.doesNotMatch(src, /execFileSync\s*\(\s*["']git["']/, `${file} must not shell out to git synchronously`);
      assert.doesNotMatch(src, /["']git["']\s*,\s*\[/, `${file} must not invoke the git CLI inline`);
    });
  }

  test("the three scope strings plan/execute/verify each appear exactly once across the three tools", async () => {
    const all = (await Promise.all(TOOLS.map((t) => readLib(t.file)))).join("\n");
    for (const scope of ["plan", "execute", "verify"]) {
      const count = (all.match(new RegExp(`scope: "${scope}"`, "g")) || []).length;
      assert.equal(count, 1, `scope "${scope}" must appear exactly once across the three tools, found ${count}`);
    }
  });

  test("verify.js subagent instruction to not commit VERIFICATION.md is intact", async () => {
    const src = await readLib("verify.js");
    assert.match(src, /DO NOT commit/, "the verifier subagent must still be told not to commit VERIFICATION.md");
  });
});

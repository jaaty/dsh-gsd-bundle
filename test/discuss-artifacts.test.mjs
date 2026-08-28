// Static source-assertion wiring tests for Phase 17 branch isolation (plan 02,
// requirement CQ-07). Proves gsd_discuss uses the shared git-artifact seam to
// acquire the per-phase feature branch and commit planning artefacts, by reading
// lib/discuss.js and asserting the wiring:
//   - imports both ensurePhaseBranch + commitArtifacts from ./_git-artifacts.js
//   - acquires the phase-<N> branch BEFORE any CONTEXT write (D-01 placement)
//   - commits artefacts AFTER the STATE advance (D-03/D-04 ordering)
//   - keeps git in the shared helper (no inline promisify(execFile)/execFileSync)
//
// Style mirrors test/ship.test.mjs (node --test + node:assert/strict). No real
// git or filesystem is touched beyond reading the lib source.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const readLib = (file) => readFile(new URL(`../lib/${file}`, import.meta.url), "utf8");

describe("gsd_discuss phase-branch wiring (D-01/D-03/D-04)", () => {
  test("imports ensurePhaseBranch + commitArtifacts from ./_git-artifacts.js", async () => {
    const src = await readLib("discuss.js");
    assert.match(
      src,
      /import\s*\{\s*ensurePhaseBranch\s*,\s*commitArtifacts\s*\}\s*from\s*["']\.\/_git-artifacts\.js["']/,
      "both helpers imported from ./_git-artifacts.js"
    );
  });

  test("acquires the phase-N branch exactly once, before the CONTEXT write", async () => {
    const src = await readLib("discuss.js");
    assert.equal(
      (src.match(/ensurePhaseBranch\(cwd,\s*args\.phase\)/g) || []).length,
      1,
      "ensurePhaseBranch(cwd, args.phase) called exactly once"
    );

    const acquireIdx = src.indexOf("ensurePhaseBranch(cwd, args.phase)");
    const writeIdx = src.indexOf("writeArtifact(cwd, args.phase, \"CONTEXT\"");
    const assembleIdx = src.indexOf("# Phase ${args.phase}: ${phase.name} - Context");
    assert.ok(acquireIdx !== -1, "ensurePhaseBranch call present");
    assert.ok(writeIdx !== -1, "CONTEXT writeArtifact call present");
    assert.ok(
      acquireIdx < writeIdx,
      "branch acquired before the CONTEXT write (D-01 placement at the start of execute)"
    );
    assert.ok(assembleIdx !== -1 && acquireIdx < assembleIdx, "branch acquired before CONTEXT assembly");
  });

  test("commits artefacts exactly once, after the STATE advance (setActivePhase/addDecision)", async () => {
    const src = await readLib("discuss.js");
    assert.equal(
      (src.match(/commitArtifacts\(cwd,\s*args\.phase,\s*\{\s*scope:\s*"discuss",\s*phaseName:\s*phase\.name\s*\}\)/g) || []).length,
      1,
      "commitArtifacts(cwd, args.phase, { scope: \"discuss\", phaseName: phase.name }) called exactly once"
    );

    const commitIdx = src.indexOf("commitArtifacts(cwd, args.phase, { scope: \"discuss\"");
    const setActiveIdx = src.indexOf("setActivePhase(cwd, args.phase, \"plan\")");
    const addDecisionIdx = src.indexOf("addDecision(cwd,");
    assert.ok(commitIdx !== -1, "commitArtifacts call present");
    assert.ok(setActiveIdx !== -1, "setActivePhase call present");
    assert.ok(addDecisionIdx !== -1, "addDecision call present");
    assert.ok(
      commitIdx > setActiveIdx && commitIdx > addDecisionIdx,
      "commit issued after the STATE advance so the commit captures it"
    );
  });

  test("keeps git in the shared helper — no inline git invocation in discuss.js", async () => {
    const src = await readLib("discuss.js");
    assert.doesNotMatch(src, /promisify\(execFile\)/, "no inline promisify(execFile) git wrapper");
    assert.doesNotMatch(src, /execFileSync\s*\(\s*["']git["']/, "no inline execFileSync(\"git\", ...)");
    assert.doesNotMatch(src, /git\s*-C/, "no inline git -C invocation");
  });
});

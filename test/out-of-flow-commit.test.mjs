// Static wiring tests for the Phase 20 out-of-flow auto-commit seam (plan 03,
// requirement MW-03 / D-09..D-12). The three out-of-flow artefact writers —
// gsd_ui_phase (UI-SPEC, D-10), gsd_map_codebase (codebase-map, D-11), and
// gsd_quick (quick record, D-11) — must route their .planning/ outputs through
// the shared `commitArtifacts` seam so the writes land on the currently
// checked-out branch (phase-N during a phase) and the tree stays clean for
// gsd_ship preflight.
//
// Style mirrors test/phase-tools-git.test.mjs (node --test + node:assert/strict,
// static source assertions via readFile). No real git or filesystem is touched.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const readLib = (file) => readFile(new URL(`../lib/${file}`, import.meta.url), "utf8");

const IMPORT_RE = /import\s*\{\s*commitArtifacts\s*\}\s*from\s*["']\.\/_git-artifacts\.js["']/;

describe("out-of-flow auto-commit: ui.js routes UI-SPEC through commitArtifacts (D-10/D-12)", () => {
  test("ui.js imports commitArtifacts from ./_git-artifacts.js", async () => {
    const src = await readLib("ui.js");
    assert.match(src, IMPORT_RE, "ui.js must import commitArtifacts from ./_git-artifacts.js");
  });

  test("ui.js calls commitArtifacts with the ui scope token exactly once", async () => {
    const src = await readLib("ui.js");
    const callRe = /commitArtifacts\s*\(\s*cwd,\s*args\.phase,\s*\{\s*scope:\s*"ui",\s*phaseName:\s*phase\.name\s*\}\s*\)/g;
    assert.equal((src.match(callRe) || []).length, 1, "ui.js must call commitArtifacts with scope \"ui\" exactly once");
  });

  test("ui.js commitArtifacts call appears AFTER the UI-SPEC writeArtifact (write-then-commit ordering)", async () => {
    const src = await readLib("ui.js");
    const writeIdx = src.indexOf('writeArtifact(cwd, args.phase, "UI-SPEC"');
    const commitIdx = src.indexOf('{ scope: "ui", phaseName: phase.name }');
    assert.notEqual(writeIdx, -1, "ui.js must write the UI-SPEC");
    assert.notEqual(commitIdx, -1, "ui.js must contain its commitArtifacts call");
    assert.ok(
      commitIdx > writeIdx,
      `ui.js: commitArtifacts (idx ${commitIdx}) must appear AFTER the UI-SPEC writeArtifact (idx ${writeIdx})`,
    );
  });
});

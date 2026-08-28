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

describe("out-of-flow auto-commit: map-codebase.js routes through commitArtifacts (D-11/D-12)", () => {
  test("map-codebase.js imports commitArtifacts from ./_git-artifacts.js", async () => {
    const src = await readLib("map-codebase.js");
    assert.match(src, IMPORT_RE, "map-codebase.js must import commitArtifacts from ./_git-artifacts.js");
  });

  test("map-codebase.js bespoke gitAddCommit commit is gone", async () => {
    const src = await readLib("map-codebase.js");
    assert.doesNotMatch(src, /gitAddCommit/, "map-codebase.js must not define/call the bespoke gitAddCommit");
    assert.doesNotMatch(src, /execFileSync\s*\(\s*["']git["']/, "map-codebase.js must not shell out to git synchronously");
  });

  test("map-codebase.js routes its commit through commitArtifacts with a codebase-map message override exactly once", async () => {
    const src = await readLib("map-codebase.js");
    const callRe = /commitArtifacts\s*\(\s*cwd,\s*null,\s*\{\s*scope:\s*"map",\s*message:\s*"docs\(planning\):\s*codebase map"\s*\}\s*\)/g;
    assert.equal(
      (src.match(callRe) || []).length,
      1,
      'map-codebase.js must call commitArtifacts(cwd, null, { scope: "map", message: "docs(planning): codebase map" }) exactly once',
    );
  });
});

describe("out-of-flow auto-commit: quick.js routes the record through commitArtifacts (D-11/D-12)", () => {
  test("quick.js imports commitArtifacts from ./_git-artifacts.js", async () => {
    const src = await readLib("quick.js");
    assert.match(src, IMPORT_RE, "quick.js must import commitArtifacts from ./_git-artifacts.js");
  });

  test("quick.js calls commitArtifacts with the quick scope and null phaseNum exactly once", async () => {
    const src = await readLib("quick.js");
    const callRe = /commitArtifacts\s*\(\s*cwd,\s*null,\s*\{\s*scope:\s*"quick"/g;
    assert.equal(
      (src.match(callRe) || []).length,
      1,
      'quick.js must call commitArtifacts(cwd, null, { scope: "quick" exactly once',
    );
  });

  test("quick.js commitArtifacts call appears AFTER the writeQuickRecord (record-then-commit ordering)", async () => {
    const src = await readLib("quick.js");
    const writeIdx = src.indexOf("writeQuickRecord(cwd,");
    const commitIdx = src.indexOf('{ scope: "quick"');
    assert.notEqual(writeIdx, -1, "quick.js must write the quick record");
    assert.notEqual(commitIdx, -1, "quick.js must contain its commitArtifacts call");
    assert.ok(
      commitIdx > writeIdx,
      `quick.js: commitArtifacts (idx ${commitIdx}) must appear AFTER the writeQuickRecord (idx ${writeIdx})`,
    );
  });
});

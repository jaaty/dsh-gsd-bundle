---
phase: GSD-04-checkpoint-resume
plan: 01
type: execute
wave: 1
depends_on: []
files_modified: ["lib/state.js", "test/state.test.mjs"]
autonomous: true
requirements: ["DUR-01"]
user_setup: []
must_haves:
  truths:
    - "writeArtifact/readArtifact/hasArtifact map the CHECKPOINT-<PP> suffix to <base>-<PP>-CHECKPOINT.md and round-trip content (D-01)."
    - "removeArtifact deletes a persisted CHECKPOINT artefact so hasArtifact returns false afterwards (D-06 cleanup primitive)."
  artifacts:
    - path: "lib/state.js"
      provides: "CHECKPOINT per-plan artefact naming in _artifactFile + symmetric removeArtifact method on GsdState"
      min_lines: 520
      exports: ["GsdState"]
    - path: "test/state.test.mjs"
      provides: "tests proving CHECKPOINT artefact mapping/round-trip and removeArtifact deletion"
      min_lines: 330
      exports: []
  key_links:
    - from: "lib/state.js"
      to: "lib/execute.js"
      via: "_artifactFile extends the per-plan suffix group so writeArtifact/hasArtifact/readArtifact can target CHECKPOINT-<PP>"
      pattern: "^(PLAN|SUMMARY|CHECKPOINT)-\\d+$"
---
<objective>Extend the artefact data layer so a per-plan CHECKPOINT artefact can be named, read, detected, and removed through the existing GsdState artefact API. This is the foundation for DUR-01 (executor-driven checkpoint persistence) and D-06 (stale-checkpoint cleanup): gsd_execute (phase plan 02) will call writeArtifact('CHECKPOINT-<PP>') and removeArtifact without new plumbing.</objective>

<context>
@lib/state.js — _artifactFile (line 364), writeArtifact/readArtifact/hasArtifact (lines 370-389), _ensureDir precedent (line 84)
@test/state.test.mjs — existing "init + artefact naming" describe (lines 25-59), helpers FakeFs/realFsAdapter in test/helpers/fake-fs.mjs
@test/helpers/fake-fs.mjs — FakeFs surface (resolve/stat/readText/writeText/listDir) and realFsAdapter; no unlink method (deletion is a node:fs/promises concern, as in lib/ship.js line 136)
</context>

<tasks>
<task type="auto">
<name>Task 1: Tracer — map CHECKPOINT-&lt;PP&gt; to &lt;base&gt;-&lt;PP&gt;-CHECKPOINT.md and prove round-trip (per D-01)</name>
<files>lib/state.js, test/state.test.mjs</files>
<read_first>lib/state.js, test/state.test.mjs</read_first>
<action>In lib/state.js, extend the per-plan artefact mapper `_artifactFile` (currently at line 364). Its regex `^(PLAN|SUMMARY)-(\d+)$` must also accept CHECKPOINT: change the regex group to `^(PLAN|SUMMARY|CHECKPOINT)-(\d+)$` while keeping the existing mapping to `${dir}/${base}-${zeroPad(Number(m[2]))}-${m[1].toUpperCase()}.md`. Do not alter the PLAN or SUMMARY branches — this must not regress the current `<base>-<PP>-PLAN.md` / `<base>-<PP>-SUMMARY.md` output (existing tests at state.test.mjs lines 26-43 depend on it). The result: `writeArtifact(cwd, 1, 'CHECKPOINT-01', content)` produces `<base>-01-CHECKPOINT.md`. In test/state.test.mjs, add a test inside the "init + artefact naming" describe (after the SUMMARY-01 test at line 43): writeArtifact with 'CHECKPOINT-01', assert path.basename(written) === '01-auth-01-CHECKPOINT.md', assert fs.files.has(`${CWD}/.planning/phases/01-auth/01-auth-01-CHECKPOINT.md`), and assert readArtifact/hasArtifact round-trip the exact content. Use the existing FakeFs + buildProject helpers exactly as the sibling tests do.</action>
<verify>node --test test/state.test.mjs</verify>
<acceptance_criteria>
- grep '^(PLAN|SUMMARY|CHECKPOINT)-' present in lib/state.js _artifactFile
- state.test.mjs contains an assertion comparing path.basename to "01-auth-01-CHECKPOINT.md"
- `node --test test/state.test.mjs` exits 0
</acceptance_criteria>
<done>The CHECKPOINT artefact is named, written, read and detected through the existing GsdState API with the new CHECKPOINT group, and no existing PLAN/SUMMARY test regresses.</done>
</task>

<task type="auto">
<name>Task 2: Add removeArtifact to GsdState and prove deletion (D-06 cleanup primitive)</name>
<files>lib/state.js, test/state.test.mjs</files>
<read_first>lib/state.js (lines 370-389 for writeArtifact/readArtifact/hasArtifact, line 84 for the _ensureDir node:fs/promises precedent), lib/ship.js (line 136 node:fs/promises unlink precedent), test/helpers/fake-fs.mjs (realFsAdapter export), test/helpers/project.mjs (buildProject)</read_first>
<action>In lib/state.js, add a method `async removeArtifact(cwd, phaseNum, suffix)` to class GsdState immediately after `hasArtifact` (ends line 389). It must compute `dir` via `this.phaseDir(cwd, phaseNum)`, `base` via `(await this._phaseDirName(cwd, phaseNum)).split("/").pop()`, then `const file = this._artifactFile(dir, base, suffix)`. Delete the file with `node:fs/promises` `unlink` (dynamically imported as `const { unlink } = await import("node:fs/promises");`) wrapped in try/catch so an absent file is a no-op (same pattern as `_ensureDir` at line 84 and ship.js line 136). In test/state.test.mjs add a test using the real-fs adapter, NOT FakeFs (FakeFs is in-memory and has no unlink): create a temp dir via `node:fs/promises` `mkdtemp` under `os.tmpdir()`, construct a GsdState over `realFsAdapter()`, `await svc.initProject(tmp, ...)` then `writeArtifact(tmp, 1, 'CHECKPOINT-01', content)`, assert `hasArtifact` true, then `removeArtifact(tmp, 1, 'CHECKPOINT-01')` and assert `hasArtifact` false; clean up with `node:fs/promises` `rm(tmp, { recursive: true, force: true })` in a finally. Import os and node:fs/promises at the top of state.test.mjs, and import realFsAdapter from "./helpers/fake-fs.mjs".</action>
<verify>node --test test/state.test.mjs</verify>
<acceptance_criteria>
- grep "removeArtifact" present in lib/state.js class GsdState
- state.test.mjs contains a test asserting hasArtifact flips true→false across removeArtifact
- `node --test test/state.test.mjs` exits 0
</acceptance_criteria>
<done>removeArtifact is implemented symmetrically with the sibling accessors, uses node:fs/promises unlink, and a real-fs temp-dir test proves it deletes the artefact.</done>
</task>
</tasks>

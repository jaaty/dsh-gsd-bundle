---
phase: 11-phase-dir-resolution
plan: 01
type: execute
wave: 1
depends_on: []
files_modified: ["lib/state.js", "test/state.test.mjs"]
autonomous: true
requirements: ["CQ-01"]
gap_closure: false
user_setup: []
must_haves:
  truths:
    - "A single phaseDirAndBase(cwd, phaseNum) call returns { dir, base } and each artefact accessor (writeArtifact/readArtifact/hasArtifact/removeArtifact/listPlans) resolves the phase dir and base exactly once per invocation, so a single accessor call performs one readRoadmap + one readConfig instead of four."
    - "A phase number absent from the roadmap still resolves to base 'phase-N' (the D-03 fallback is preserved, not made fail-loud)."
    - "All existing artefact filenames and round-trips are unchanged: <base>-<PP>-PLAN.md, <base>-<PP>-SUMMARY.md, <base>-<PP>-CHECKPOINT.md, <base>-CONTEXT.md, etc."
  artifacts:
    - path: "lib/state.js"
      provides: "phaseDirAndBase(cwd, phaseNum) accessor returning { dir, base } from a single _phaseDirName call, plus the five public accessors refactored to resolve dir/base once each"
      min_lines: 40
      exports: ["phaseDirAndBase"]
  key_links:
    - from: "lib/state.js (phaseDirAndBase)"
      to: "lib/state.js (writeArtifact/readArtifact/hasArtifact/removeArtifact/listPlans)"
      via: "each accessor destructures { dir, base } = await this.phaseDirAndBase(cwd, phaseNum) once and routes through this._artifactFile(dir, base, suffix)"
      pattern: "const \\{ dir, base \\} = await this\\.phaseDirAndBase\\(cwd, phaseNum\\)"
---
<objective>Add the phaseDirAndBase(cwd, phaseNum) accessor to the GsdState service and refactor the five public artefact accessors (writeArtifact/readArtifact/hasArtifact/removeArtifact/listPlans) to resolve the phase dir and base exactly once per invocation, eliminating the repeated readRoadmap/readConfig and the duplicated base derivation. This is the data-tier half of CQ-01 and the tracer slice of the phase: it proves the resolve-once behaviour with spy-based tests while keeping every existing artefact filename and round-trip identical.</objective>
<context>@lib/state.js (lines 422-520: _phaseDirName, phaseDir, _artifactFile, writeArtifact, readArtifact, hasArtifact, removeArtifact, listPlans), @test/state.test.mjs (lines 30-82, 85-106, 108-227, 303-328: existing accessor round-trip tests), @test/helpers/fake-fs.mjs (FakeFs, stateCtx), @test/helpers/project.mjs (buildProject, FENCED_PLAN, FENCELESS_PLAN, FENCED_SUMMARY)</context>
<tasks>
  <task type="auto">
    <name>Task 1: Add phaseDirAndBase accessor and refactor writeArtifact (tracer)</name>
    <files>lib/state.js</files>
    <read_first>lib/state.js</read_first>
    <action>In lib/state.js, add a new public accessor `async phaseDirAndBase(cwd, phaseNum)` immediately after the existing `phaseDir` method (around line 434). It must call `this._phaseDirName(cwd, phaseNum)` exactly once, capture the returned name, and return `{ dir: \`${this._phases(cwd)}/${name}\`, base: name }`. Do NOT call `_phaseDirName` more than once and do NOT call readRoadmap/readConfig directly. Then refactor `writeArtifact` (lines 450-456): replace its two lines `const dir = await this.phaseDir(cwd, phaseNum);` and `const base = (await this._phaseDirName(cwd, phaseNum)).split("/").pop();` with a single `const { dir, base } = await this.phaseDirAndBase(cwd, phaseNum);`, keeping the subsequent `const file = this._artifactFile(dir, base, suffix);` and `await this._write(file, content); return file;` unchanged. Per D-01 and D-02: the public signature `writeArtifact(cwd, phaseNum, suffix, content)` is unchanged and the private helper stays `_artifactFile(dir, base, suffix)`.</action>
    <verify>node --test test/state.test.mjs</verify>
    <acceptance_criteria>
      - grep 'async phaseDirAndBase(cwd, phaseNum)' lib/state.js returns a match
      - grep 'const { dir, base } = await this.phaseDirAndBase(cwd, phaseNum);' lib/state.js returns a match inside writeArtifact
      - `sed -n '/async writeArtifact/,/^  }/p' lib/state.js | grep 'phaseDir(cwd, phaseNum);'` returns 0 matches (the old phaseDir call is gone from the writeArtifact method body)
      - `node --test test/state.test.mjs` exits 0
    </acceptance_criteria>
    <done>phaseDirAndBase exists and writeArtifact resolves dir/base once via it; the existing writeArtifact round-trip tests still pass.</done>
  </task>
  <task type="auto">
    <name>Task 2: Refactor readArtifact, hasArtifact, removeArtifact to resolve once</name>
    <files>lib/state.js</files>
    <read_first>lib/state.js</read_first>
    <action>In lib/state.js, apply the same single-resolution refactor to the three remaining accessors. For `readArtifact` (lines 458-462), `hasArtifact` (lines 464-469), and `removeArtifact` (lines 474-480): replace each method's `const dir = await this.phaseDir(cwd, phaseNum);` plus `const base = (await this._phaseDirName(cwd, phaseNum)).split("/").pop();` pair with a single `const { dir, base } = await this.phaseDirAndBase(cwd, phaseNum);`. Keep each method's subsequent body (the `_artifactFile` call, the `_read`/`ctx.fs.resolve`+`stat`/`unlink` logic) byte-for-byte identical. Do not change any public signature. Per D-02 the private helper remains `_artifactFile(dir, base, suffix)`.</action>
    <verify>node --test test/state.test.mjs</verify>
    <acceptance_criteria>
      - grep -c 'const { dir, base } = await this.phaseDirAndBase(cwd, phaseNum);' lib/state.js returns 4 (writeArtifact + readArtifact + hasArtifact + removeArtifact)
      - grep -c 'await this.phaseDir(cwd, phaseNum);' lib/state.js returns 0 (no accessor still calls phaseDir)
      - `node --test test/state.test.mjs` exits 0
    </acceptance_criteria>
    <done>All four single-artefact accessors resolve dir/base exactly once via phaseDirAndBase; round-trip and removeArtifact tests pass.</done>
  </task>
  <task type="auto">
    <name>Task 3: Refactor listPlans to resolve once and make phaseDir delegate</name>
    <files>lib/state.js</files>
    <read_first>lib/state.js</read_first>
    <action>In lib/state.js, refactor `listPlans` (lines 485-520) per D-04: replace its three lines `const dir = await this.phaseDir(cwd, phaseNum);`, `const name = await this._phaseDirName(cwd, phaseNum);`, and `const base = name.split("/").pop();` with a single `const { dir, base } = await this.phaseDirAndBase(cwd, phaseNum);`. Keep the rest of the method (the `ctx.fs.resolve`/`stat`/`listDir` glob loop, the per-plan `hasArtifact` call, the `plans.push` object, the sort) unchanged — the per-plan `hasArtifact` calls are separate accessor invocations and must NOT be eliminated (that is a deferred caching concern). Then refactor `phaseDir` (lines 431-434) to delegate: `async phaseDir(cwd, phaseNum) { const { dir } = await this.phaseDirAndBase(cwd, phaseNum); return dir; }` so its public signature and return value stay identical. Per D-03, do not alter `_phaseDirName`'s phase-N fallback.</action>
    <verify>node --test test/state.test.mjs</verify>
    <acceptance_criteria>
      - grep 'const { dir, base } = await this.phaseDirAndBase(cwd, phaseNum);' lib/state.js returns 5 matches (the four accessors + listPlans)
      - grep 'const name = await this._phaseDirName(cwd, phaseNum);' lib/state.js returns 0 matches
      - grep 'async phaseDir(cwd, phaseNum)' lib/state.js returns a match whose body delegates to phaseDirAndBase
      - `node --test test/state.test.mjs` exits 0
    </acceptance_criteria>
    <done>listPlans resolves dir/base once (D-04) and phaseDir delegates to phaseDirAndBase; all existing listPlans tests pass.</done>
  </task>
  <task type="auto">
    <name>Task 4: Add spy-based tests proving resolve-once and the phase-N fallback</name>
    <files>test/state.test.mjs</files>
    <read_first>test/state.test.mjs, test/helpers/fake-fs.mjs, test/helpers/project.mjs</read_first>
    <action>In test/state.test.mjs, add a new describe block "phaseDirAndBase + resolve-once (CQ-01)". Use the existing `makeSvc(fs)` helper and `buildProject` fixture. Add a helper inside the block that wraps the service's `_phaseDirName` with a call counter: `const orig = svc._phaseDirName.bind(svc); let calls = 0; svc._phaseDirName = async (...a) => { calls += 1; return orig(...a); };`. Write these tests: (1) `phaseDirAndBase` returns `{ dir, base }` for a roadmap phase — assert `base === 'GSDB-01-auth'` (or the fixture's actual project_code+phase-1 name) and `dir === \`${CWD}/.planning/phases/${base}\``; (2) the phase-N fallback — call `phaseDirAndBase(CWD, 9)` for a phase absent from the fixture roadmap and assert `base === 'phase-9'` (D-03); (3) each of writeArtifact/readArtifact/hasArtifact/removeArtifact triggers exactly one `_phaseDirName` call (reset the counter before each, assert `calls === 1`); (4) `listPlans` triggers exactly one `_phaseDirName` call for its own resolution (was 2 before D-04) — write two PLAN artefacts first via writeArtifact, then reset the counter to 0 AFTER those two writeArtifact calls and IMMEDIATELY BEFORE calling listPlans, then assert `calls === 3` (1 for listPlans' own resolution + 2 for the per-plan hasArtifact calls, which are legitimate and must NOT be eliminated per RESEARCH.md R2). The reset must come after the writes so the two writeArtifact invocations do not inflate the count. Keep all existing tests untouched. Then write the Nyquist coverage artefact at .planning/phases/GSD-11-phase-dir-resolution/VALIDATION.md (the phase root, alongside CONTEXT.md/RESEARCH.md): a plain Markdown file with a "## Nyquist Coverage" heading stating that nyquist_validation is enabled (.planning/config.json) and every new behaviour in this phase has a named automated test, then a short list mapping each locked decision (D-01 phaseDirAndBase accessor, D-02 _artifactFile helper unchanged, D-03 phase-N fallback preserved, D-04 listPlans resolves once) to the specific spy test in test/state.test.mjs that proves it, plus a line recording that the full `node --test test/state.test.mjs` regression run is green.</action>
    <verify>node --test test/state.test.mjs</verify>
    <acceptance_criteria>
      - grep 'phaseDirAndBase + resolve-once' test/state.test.mjs returns a match
      - grep "calls === 1" test/state.test.mjs returns at least 4 matches (one per single-artefact accessor: writeArtifact/readArtifact/hasArtifact/removeArtifact)
      - grep "calls === 3" test/state.test.mjs returns a match (listPlans: 1 own resolution + 2 per-plan hasArtifact)
      - grep "phase-9" test/state.test.mjs returns a match (fallback assertion)
      - grep '## Nyquist Coverage' .planning/phases/GSD-11-phase-dir-resolution/VALIDATION.md returns a match
      - `node --test test/state.test.mjs` exits 0
    </acceptance_criteria>
    <done>The new spy tests prove CQ-01 (each accessor resolves once; listPlans resolves once plus the legitimate per-plan hasArtifact calls) and D-03 (fallback preserved); the full state test file passes; VALIDATION.md records the D-01..D-04 to automated-test mapping for the Nyquist gate.</done>
  </task>
</tasks>

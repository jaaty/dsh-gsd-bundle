---
phase: 48-pause-resume-work
plan: 01
type: tdd
wave: 1
depends_on: []
files_modified: ["lib/pause-resume.js", "lib/state.js", "test/pause-resume.test.mjs"]
autonomous: true
requirements: ["GAP-14"]
must_haves:
  truths:
    - "A pure helper turns gathered state into a HANDOFF.json object carrying the D-08 schema fields (version, timestamp, context, phase, phase_name, phase_dir, plan, task, total_tasks, status, completed_tasks, remaining_tasks, blockers, async_jobs, decisions, uncommitted_files, next_action, context_notes)."
    - "A pure helper renders a .continue-here.md whose body contains the six D-08 sections: current_state, completed_work, remaining_work, decisions_made, blockers, next_action."
    - "A pure helper filters the async-jobs manifest to non-terminal jobs (status not done/failed) and maps each to { job_id, backend, status, plan, phase, result, resume_command }."
    - "A pure helper detects the active phase from a most-recent-first phase-dir listing, returning the first dir that contains a PLAN.md."
  artifacts:
    - path: "lib/pause-resume.js"
      provides: "Pure domain helpers for pause/resume (detectActivePhase, phaseNumFromDir, mapAsyncJobs, buildHandoff, renderContinueHere, detectIncompleteWork, renderResumeStatus) — no ctx/fs/git params, unit-testable directly."
      min_lines: 60
      exports: ["detectActivePhase", "phaseNumFromDir", "mapAsyncJobs", "buildHandoff", "renderContinueHere", "detectIncompleteWork", "renderResumeStatus"]
    - path: "lib/state.js"
      provides: "New gsdState data-tier accessors: listPhaseDirs, updateContinuity (sets resumeFile), readHandoff/writeHandoff/deleteHandoff, readContinueHere/writeContinueHere — all routed through _read/_write → ctx.fs (DUR-06)."
      min_lines: 40
      exports: ["GsdState"]
    - path: "test/pause-resume.test.mjs"
      provides: "Unit tests for the pure helpers (detection, HANDOFF shape, .continue-here template sections, async-job mapping, incomplete-work fallback) and the new state accessors."
      min_lines: 80
      exports: []
  key_links:
    - from: "lib/pause-resume.js"
      to: "lib/state.js"
      via: "the tool (Plan 02) assembles a gathered-state object from the state accessors and passes it into buildHandoff/renderContinueHere; the pure helpers consume that object shape."
      pattern: "buildHandoff\\(|renderContinueHere\\(|detectActivePhase\\("
---
<objective>
Build the domain + data foundation for pause/resume: a new pure-helper module (lib/pause-resume.js) that turns gathered state into the HANDOFF.json object and the .continue-here.md template, plus the gsdState data-tier accessors (phase-dir listing, Session-Continuity resumeFile update, and HANDOFF/.continue-here read/write/delete) that the tools in Plan 02 will call. This is the tracer slice: the thinnest production-quality core of the phase, fully unit-tested before any tool or command wiring. TDD per D-10.
</objective>
<context>
@lib/_shared.js — parseFrontmatter, stringifyFrontmatter, nowIso, zeroPad, slugify, stripPlanPrefix (reuse for phaseNumFromDir).
@lib/state.js — the GsdState class; _read/_write/_ensureParent (lines 110-136), _phases (line 59), readState/_parseStateBody (lines 278-306), recordSession (lines 340-346), readJobs (lines 454-463), listPlans (lines 685-719), hasArtifact (lines 666-670), planningRoot (line 64).
@lib/jobs.js — the job entry shape (id, kind, status, plan, phase, result) and the non-terminal definition (status not in ['done','failed']).
@test/learnings.test.mjs — the pure-helper unit-test pattern (no ctx/fs/git params, direct import + assert).
@test/helpers/fake-fs.mjs — FakeFs stat returns no mtime (so mtime-based sorting must fall back to name-desc in the tool; the pure helper takes pre-sorted input).
</context>
<tasks>
  <task type="auto">
    <name>Task 1: Pure domain helpers in lib/pause-resume.js (tracer)</name>
    <files>lib/pause-resume.js, test/pause-resume.test.mjs</files>
    <read_first>lib/_shared.js, lib/state.js, lib/jobs.js</read_first>
    <action>
TDD ordering: write the unit tests in test/pause-resume.test.mjs FIRST and commit them as a test: commit before implementing; then implement lib/pause-resume.js and commit as feat: (the first scope-matching commit of this plan must be test:).

Create lib/pause-resume.js as a plain-ESM module with NO imports from node builtins and NO ctx/fs/git parameters (mirror lib/learnings.js pure-helper pattern). Import only from ./_shared.js (nowIso, zeroPad, stripPlanPrefix). Export these pure functions:

1. phaseNumFromDir(name) -> number | null. Given a phase dir name like "GSD-48-pause-resume-work" or "48-pause-resume-work", strip an optional leading project-code token (reuse stripPlanPrefix semantics: a leading token followed by a two-digit segment is the prefix) and return the leading two-digit phase number as a Number; return null when no leading digits match.

2. detectActivePhase(phaseDirs) -> { phaseDir, phaseNum } | null. phaseDirs is an array of { name, hasPlan } in most-recent-first order (the caller sorts by mtime desc, falling back to name desc). Return the first entry whose hasPlan is true, as { phaseDir: name, phaseNum: phaseNumFromDir(name) }; return null when no entry has hasPlan true.

3. mapAsyncJobs(entries) -> array. entries is the job manifest array. Filter to non-terminal jobs (status not in ['done','failed']). Map each to { job_id: id, backend: kind, status, plan, phase, result, resume_command: `gsd_job status ${id}` } (D-07, OQ-3 — the bundle manifest lacks expected_artifacts/resume_command, so derive the resume command).

4. buildHandoff(gathered) -> object. gathered is the state object the tool assembles (shape below). Return a HANDOFF.json object with EXACTLY these D-08 fields, preserving nulls: { version: "1.0", timestamp, context, phase, phase_name, phase_dir, plan, task, total_tasks, status: "paused", completed_tasks, remaining_tasks, blockers, async_jobs, decisions, uncommitted_files, next_action, context_notes }. Copy the gathered values verbatim; default timestamp to nowIso() when absent.

5. renderContinueHere(gathered) -> string. Return a .continue-here.md markdown string whose body contains the six D-08 sections as XML-style tags: <current_state>, <completed_work>, <remaining_work>, <decisions_made>, <blockers>, <next_action>. Each section is populated from the corresponding gathered field (completed_work from completed_tasks, remaining_work from remaining_tasks, decisions_made from decisions, blockers from blockers, next_action from next_action). Include a frontmatter block (--- delimited) with context, phase, status, last_updated.

6. detectIncompleteWork(plans, continueHereFiles) -> { incompletePlans, continueHereFiles }. plans is an array of { id, has_summary }; return the ids whose has_summary is false as incompletePlans. continueHereFiles is an array of paths; return it verbatim.

7. renderResumeStatus(handoff) -> string. handoff is a parsed HANDOFF.json object. Return a human-readable status string that names the phase/plan/task, the next_action, and any blockers/async_jobs (D-04). Never throw on a partial handoff — degrade missing fields to "(n/a)".

The gathered object shape the tool will pass (document it in a comment): { context: "phase"|"default", phase, phase_name, phase_dir, plan, task, total_tasks, status, completed_tasks: [{id,name,status,commit?}], remaining_tasks: [{id,name,status}], blockers: [{description,type,workaround?}], async_jobs: [...], decisions: [{decision,rationale,phase}], uncommitted_files: [path], next_action, context_notes, timestamp }.

In test/pause-resume.test.mjs, add a "pure helpers" describe block (model on test/learnings.test.mjs) importing the seven exports directly and asserting: phaseNumFromDir("GSD-48-pause-resume-work") === 48 and phaseNumFromDir("48-pause-resume-work") === 48 and phaseNumFromDir("no-digits") === null; detectActivePhase picks the first hasPlan entry and returns null when none; mapAsyncJobs keeps only non-terminal jobs and maps resume_command to "gsd_job status <id>"; buildHandoff returns the exact D-08 field set with status "paused"; renderContinueHere output contains all six <section> tags; detectIncompleteWork splits plans by has_summary; renderResumeStatus names next_action and degrades on a partial handoff.
    </action>
    <verify>node --test test/pause-resume.test.mjs</verify>
    <acceptance_criteria>
      - grep "export function detectActivePhase" lib/pause-resume.js
      - grep "export function buildHandoff" lib/pause-resume.js
      - grep "export function renderContinueHere" lib/pause-resume.js
      - grep "export function mapAsyncJobs" lib/pause-resume.js
      - grep "export function detectIncompleteWork" lib/pause-resume.js
      - grep "export function renderResumeStatus" lib/pause-resume.js
      - grep "export function phaseNumFromDir" lib/pause-resume.js
      - node --test test/pause-resume.test.mjs exits 0
    </acceptance_criteria>
    <done>All seven pure helpers exist in lib/pause-resume.js with no ctx/fs/git params, and their unit tests pass.</done>
  </task>
  <task type="auto">
    <name>Task 2: Data-tier accessors in lib/state.js</name>
    <files>lib/state.js, test/pause-resume.test.mjs</files>
    <read_first>lib/state.js, test/helpers/fake-fs.mjs</read_first>
    <action>
Add these methods to the GsdState class in lib/state.js. ALL writes must route through this._write → ctx.fs (DUR-06), never raw node:fs/promises. All reads through this._read. Missing/corrupt inputs degrade, never throw (mirror readJobs/readWindows). TDD ordering: write the accessor tests in test/pause-resume.test.mjs FIRST and commit them as a test: commit before implementing; then implement the accessors in lib/state.js and commit as feat:.

1. async listPhaseDirs(cwd) -> [{ name, mtime }]. Resolve this._phases(cwd), stat it; if absent return []. listDir it and keep only entries whose type is "directory". For each, stat the dir target and include mtime when stat.mtime != null (FakeFs returns no mtime → null). Return [{ name, mtime }].

2. async updateContinuity(cwd, { stoppedAt, resumeFile }) -> doc. Read state (or _freshState), set body.continuity.stoppedAt = stoppedAt ?? null, body.continuity.resumeFile = resumeFile ?? null, and frontmatter.stopped_at = stoppedAt ?? null; writeState and return the doc. (D-04 — recordSession does NOT set resumeFile, so this is the new accessor.)

3. async readHandoff(cwd) -> object | undefined. Read `${this._planning(cwd)}/HANDOFF.json`; if undefined return undefined; try JSON.parse and return the object, on any parse error return undefined (degrade, D-09).

4. async writeHandoff(cwd, handoff) -> path. Write `${this._planning(cwd)}/HANDOFF.json` via this._write with JSON.stringify(handoff, null, 2) + "\n"; return the path.

5. async deleteHandoff(cwd) -> void. Remove `${this._planning(cwd)}/HANDOFF.json` via the same node:fs/promises unlink pattern as removeArtifact (line 675-682); absent file is a no-op. (D-05 one-shot.)

6. async readContinueHere(cwd, phaseDir) -> string | undefined. When phaseDir is a non-empty string, read `${this._phases(cwd)}/${phaseDir}/.continue-here.md`; else read `${this._planning(cwd)}/.continue-here.md`. Return this._read result.

7. async writeContinueHere(cwd, phaseDir, content) -> path. When phaseDir is a non-empty string, write `${this._phases(cwd)}/${phaseDir}/.continue-here.md`; else write `${this._planning(cwd)}/.continue-here.md`. Use this._write (which _ensureParent's the dir). Return the path.

In test/pause-resume.test.mjs, add a "state accessors" describe block that constructs a GsdState over a FakeFs (via stateCtx from test/helpers/fake-fs.mjs or a makeMountCtx mount) and asserts: listPhaseDirs returns [] on an absent phases dir and lists created phase dirs; updateContinuity sets body.continuity.resumeFile and frontmatter.stopped_at and round-trips through readState; writeHandoff then readHandoff round-trips the object; readHandoff returns undefined on a corrupt HANDOFF.json; deleteHandoff removes the file and is a no-op when absent; writeContinueHere/readContinueHere round-trip at both the phase-dir path and the .planning/ root path.
    </action>
    <verify>node --test test/pause-resume.test.mjs</verify>
    <acceptance_criteria>
      - grep "async listPhaseDirs" lib/state.js
      - grep "async updateContinuity" lib/state.js
      - grep "async readHandoff" lib/state.js
      - grep "async writeHandoff" lib/state.js
      - grep "async deleteHandoff" lib/state.js
      - grep "async readContinueHere" lib/state.js
      - grep "async writeContinueHere" lib/state.js
      - node --test test/pause-resume.test.mjs exits 0
    </acceptance_criteria>
    <done>All seven gsdState accessors exist, route through _read/_write → ctx.fs, and their unit tests pass.</done>
  </task>
</tasks>

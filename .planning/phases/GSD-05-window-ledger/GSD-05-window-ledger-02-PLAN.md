---
phase: 05-window-ledger
plan: 02
type: execute
wave: 2
depends_on: ["GSD-05-window-ledger-01"]
files_modified: ["lib/core-tools.js", "lib/execute.js", "test/tools.test.mjs"]
autonomous: true
requirements: ["DUR-03", "DUR-04"]
gap_closure: false
user_setup: []
must_haves:
  truths:
    - "gsd_status renders '## Windows' and '## Async Jobs' sections and still ends with the existing 'Stopped at:' continuity line."
    - "On a fresh project gsd_status renders 'no windows recorded' and 'no jobs' (not an error); on a corrupt ledger it renders a short warning line and never throws."
    - "gsd_execute appends one WIN-<seq> window entry per invocation and a JOB-<seq> record per dispatched executor, reconciled to done/failed with a result; on the resume path the window entry carries the resumed plan id as its checkpoint reference."
  artifacts:
    - path: "lib/core-tools.js"
      provides: "gsd_status rendering of ## Windows and ## Async Jobs from the plan-01 accessors, missing/corrupt-tolerant, preserving the continuity line"
      min_lines: 30
      exports: ["name", "inject", "apply"]
    - path: "lib/execute.js"
      provides: "write-path producers: appendWindow on completion plus appendJob/updateJob per dispatched executor, with the resume checkpoint reference (D-07)"
      min_lines: 30
      exports: ["name", "inject", "apply"]
  key_links:
    - from: "lib/core-tools.js gsd_status"
      to: "lib/state.js readWindows + readJobs"
      via: "gsd_status calls s.readWindows(cwd) and s.readJobs(cwd) and renders their { entries, corrupt } into the two sections"
      pattern: "readWindows\\(cwd\\)|readJobs\\(cwd\\)"
    - from: "lib/execute.js gsd_execute"
      to: "lib/state.js appendWindow + appendJob + updateJob"
      via: "gsd_execute records a window on completion and appends/updates a job per dispatched executor"
      pattern: "appendWindow\\(cwd|appendJob\\(cwd|updateJob\\(cwd"
---
<objective>Surface the two plan-01 artefacts through gsd_status (two new sections, missing/corrupt-tolerant, continuity preserved) and wire the gsd_execute write-path so DUR-03/DUR-04 are demonstrable end-to-end: gsd_execute appends one WIN-<seq> window entry per run and a JOB-<seq> record per dispatched executor (running -> done/failed with result), adding the resumed plan id as a checkpoint reference on the resume path (D-07).</objective>

<context>
lib/core-tools.js — gsd_status execute (lines 83-118): currently reads STATE+ROADMAP, builds a `lines` array, appends "## Recent Decisions", "## Blockers / Concerns", and ends with a bare "Stopped at:" line (line 114). Do NOT remove that continuity line.
lib/execute.js — gsd_execute: reads the plan index, dispatches executor subagents wave by wave via spawnSubagent (lines 91-125), reconciles each result (checkpoint vs SUMMARY) at lines 127-156, and recomputes phase status at lines 169-177.
lib/state.js — plan-01 accessors to consume: readWindows(cwd)->{entries,corrupt}, readJobs(cwd)->{entries,corrupt}, appendWindow(cwd,entry)->full, appendJob(cwd,job)->full, updateJob(cwd,jobId,patch)->entry|null.
test/tools.test.mjs — fake-subagent harness (makeSubagents, makeCtx, registerTool); gsd_status is currently only smoke-tested (lines 279-288); gsd_execute tests (lines 171-247) reuse the checkpoint-aware fake executor.
.planning/phases/GSD-05-window-ledger/GSD-05-window-ledger-CONTEXT.md — D-05 (two new sections, continuity stays, missing renders an explicit line), D-06 (corrupt renders a short warning, never throws), D-07 (window entry may carry a CHECKPOINT reference).</context>
<tasks>
  <task type="auto">
    <name>Task 1: render '## Windows' and '## Async Jobs' sections in gsd_status (tracer, D-05)</name>
    <files>lib/core-tools.js, test/tools.test.mjs</files>
    <read_first>lib/core-tools.js, test/tools.test.mjs</read_first>
    <action>In lib/core-tools.js gsd_status.execute, after the "## Blockers / Concerns" lines and BEFORE the "Stopped at:" line, call `const windows = await s.readWindows(cwd)` and `const jobs = await s.readJobs(cwd)` (await before building the tail). Add a "## Windows" section: if windows.corrupt render a single warning line "WINDOWS.md is corrupt — windows unavailable."; else if windows.entries.length === 0 push "No windows recorded."; else render up to the 3 most recent entries (reverse order) as "- <id>: phase <phase> <step> — closed <closed>" (fall back to "- <id>: <summary || closed>" if phase/step are missing). Add a "## Async Jobs" section: if jobs.corrupt push "async-jobs.json is corrupt — jobs unavailable."; else if entries.length === 0 push "No jobs."; else render entries with status pending/running/failed as "- <id>: <kind> — <status> — <result || started>". The final "Stopped at:" line must remain the last line of the render (do not drop continuity). Handle a null `s.readWindows/readJobs` return defensively (treat as empty) so a missing file is an empty section, not an error.
    Add tests in test/tools.test.mjs under a new "gsd_status" describe (reuse the beforeEach pattern; registerTool("core-tools","gsd_status")): (a) fresh project -> response matches /## Windows/ and /No windows recorded/ and /## Async Jobs/ and /No jobs/ and /Stopped at:/; (b) after seeding entries via svc.appendWindow and svc.appendJob, response matches /WIN-01/ and /JOB-01/ and the two section headers.</action>
    <verify>node --test test/tools.test.mjs</verify>
    <acceptance_criteria>
      - grep - "## Windows" lib/core-tools.js and "## Async Jobs" lib/core-tools.js
      - grep - "No windows recorded" and "No jobs" lib/core-tools.js
      - grep - "readWindows\\(cwd\\)" and "readJobs\\(cwd\\)" lib/core-tools.js
      - node --test test/tools.test.mjs exits 0 and the new gsd_status describe passes (seeded + empty)
      - acceptance asserts gsd_status still ends with /Stopped at:/
    </acceptance_criteria>
    <done>gsd_status renders both sections from the accessors, empty on a fresh project, keeps the continuity line.</done>
  </task>
  <task type="auto">
    <name>Task 2: corrupt-ledger degradation in gsd_status (D-06)</name>
    <files>lib/core-tools.js, test/tools.test.mjs</files>
    <read_first>lib/core-tools.js</read_first>
    <action>Confirm gsd_status renders a short warning line and never throws when either accessor reports corrupt=true. Since the accessors return { entries: [], corrupt: true } instead of throwing, gsd_status already renders the warning branch written in Task 1; verify there is no unguarded JSON.parse or direct file read in gsd_status that could throw. Guard the entire gsd_status body that depends on windows/jobs with the existing project guard (return early when no project). Add tests in the tools.test.mjs gsd_status describe: write a corrupt async-jobs.json (text "not-json{{{") and a corrupt WINDOWS.md (text that makes parseWindows throw — e.g. "# WINDOWS\n## FOO\n- phase: 1\n", an unknown-section header per plan-01 Task 1) via svc._write or fs.writeText, then call gsd_status and assert it still returns a string matching /corrupt/ and does not reject; assert /Stopped at:/ still present. (Use the accessor-level corrupt semantics: seed corrupt by writing the file bytes directly through svc.fs, since appendJob/appendWindow always write well-formed content.)
    gsd_status must never throw (D-06). Wrap any remaining risk so that a read/parse failure inside status rendering degrades to the warning line.</action>
    <verify>node --test test/tools.test.mjs</verify>
    <acceptance_criteria>
      - node --test test/tools.test.mjs gsd_status corrupt cases pass (assert doesNotReject)
      - acceptance matches /corrupt/ in the render output for a bad async-jobs.json and a bad WINDOWS.md
      - acceptance /Stopped at:/ still present after corrupt input
    </acceptance_criteria>
    <done>gsd_status degrades gracefully to a warning line on corrupt ledgers and keeps continuity; never throws.</done>
  </task>
  <task type="auto">
    <name>Task 3: wire gsd_execute write-path producers (window + jobs + resume checkpoint) (D-01, D-03, D-07)</name>
    <files>lib/execute.js, test/tools.test.mjs</files>
    <read_first>lib/execute.js, test/tools.test.mjs</read_first>
    <action>In lib/execute.js gsd_execute:
    1) Capture the run start once, after resolving cwd/s (e.g. `const startedAt = nowIso()`; import nowIso from ./_shared.js) and the current step `const step = fm.status || "execute"` from the read state.
    2) When dispatching a plan (inside the `runnable.map(async (p) => {...})` block, around line 91), before returning `{ p, thunk }`, append a job record for the planned executor: `const job = await s.appendJob(cwd, { kind: "subagent", plan: p.id, phase: args.phase, status: "running", started: startedAt })` and return `{ p, job, thunk: () => spawnSubagent(...) }`.
    3) In the results Promise.all handler (lines 127-156) that currently computes `ok`/`checkpointed`, EXTEND its map destructure from `({ p, thunk })` to `({ p, thunk, job })` (line 127) so `job.id` is available for the reconcile — and thread `job` through BOTH return shapes (the line-143 checkpointed return and the line-155 normal return must include `job`). After the existing checkpoint/SUMMARY logic, reconcile the job: if `checkpointed` set `status:"done", result: "checkpointed at task ${cp.last_completed_task} (resumable)"`; else set `status: ok ? "done" : "failed"` and `result: ok ? "SUMMARY written" : (r.stopReason || r.output.slice(0,120))`. Call `await s.updateJob(cwd, job.id, { status, result })` (and set completed via updateJob's terminal-status behaviour). If updateJob returns null (job id absent), do not throw — log it and continue.
    4) After the wave loop completes (before or at the recompute block, lines 168-177), append a window entry once per gsd_execute run: derive `resumedPlanIds` = the set of plan ids for which a resumeInstr was emitted (a CHECKPOINT artefact existed); call `await s.appendWindow(cwd, { phase: String(args.phase), step, summary: "Executed " + String(done) + "/" + String(idx.plans.length) + " plans", ...(resumedPlanIds.length ? { checkpoint: resumedPlanIds[0] } : {}) })`. Do not duplicate windows when a plan is skipped (append once, unconditionally, per run).
    Add tests in tools.test.mjs gsd_execute describe: after a normal successful run assert fs.files.has(".planning/WINDOWS.md") and readWindows returns an entry with id WIN-01 and the summary; assert fs.files.has(".planning/async-jobs.json") and readJobs returns a job with status "done"; after a checkpoint-stop run (existing PLAN_2_TASKS + no CHECKPOINT) assert the window entry exists and readJobs has a job whose result mentions "checkpoint"; on the resume run (existing CHECKPOINT artefact) assert the window entry carries a checkpoint reference equal to the resumed plan id (D-07).
    Keep spawn counts unchanged — producers must not add subagent calls.</action>
    <verify>node --test test/tools.test.mjs</verify>
    <acceptance_criteria>
      - grep - "appendWindow\\(cwd" and "appendJob\\(cwd" and "updateJob\\(cwd" lib/execute.js
      - grep - "nowIso" lib/execute.js (imported)
      - node --test test/tools.test.mjs exits 0 with new producer tests passing
      - acceptance a normal gsd_execute run writes WINDOWS.md with WIN-01 and async-jobs.json with a done JOB
      - acceptance on the resume path the window entry carries the resumed plan id as checkpoint
    </acceptance_criteria>
    <done>gsd_execute records one window per run and a job per dispatched executor, reconciling status/result; resume carries a checkpoint reference; all existing gsd_execute tests still pass.</done>
  </task>
</tasks>

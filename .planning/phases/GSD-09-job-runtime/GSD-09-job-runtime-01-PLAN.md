---
phase: 09-job-runtime
plan: 01
type: execute
wave: 1
depends_on: []
files_modified: ["lib/job-wrapper.mjs", "lib/jobs.js", "test/jobs.test.mjs"]
autonomous: true
requirements: ["JOB-01", "JOB-02"]
gap_closure: false
user_setup: []
must_haves:
  truths:
    - "A job launched via launchJob appears in .planning/async-jobs.json with status 'running' and a JOB-<seq> id, and the launch call returns immediately without awaiting the child process."
    - "A real child process runs and writes .planning/jobs/<id>.result.json; reconcileJobs flips the job to done (exit 0) or failed (non-zero exit or error) with a completed timestamp."
    - "A running job whose result file is absent stays running after reconcile; a corrupt result file does not throw and leaves the job running."
  artifacts:
    - path: "lib/job-wrapper.mjs"
      provides: "Standalone detached child wrapper: runs a command (argv array, no shell), captures stdout/stderr/exit, writes the per-job result file."
      min_lines: 50
      exports: []
    - path: "lib/jobs.js"
      provides: "Job runtime domain: launchJob spawns the wrapper detached and records the job running; reconcileJobs reads result files and flips running -> done/failed."
      min_lines: 60
      exports: ["launchJob", "reconcileJobs"]
    - path: "test/jobs.test.mjs"
      provides: "Integration tests against a real temp dir + realFsAdapter proving launch/lifecycle/result-collection for JOB-01 and JOB-02."
      min_lines: 80
      exports: []
  key_links:
    - from: "lib/jobs.js"
      to: "lib/job-wrapper.mjs"
      via: "launchJob spawns the wrapper as a detached child passing the absolute result-file path as argv"
      pattern: "job-wrapper.mjs"
    - from: "lib/jobs.js"
      to: "lib/state.js"
      via: "launchJob/reconcileJobs persist through the gsdState accessors s.appendJob and s.updateJob"
      pattern: "appendJob"
---
<objective>Build the real background-job runtime engine: a detached child wrapper that runs a shell command and writes a per-job result file, plus a jobs domain module (launchJob/reconcileJobs) that launches jobs asynchronously and reconciles their lifecycle (running -> done/failed) in the async-jobs manifest. This is the tracer plan — the thinnest end-to-end slice of the execution path, delivering JOB-01 and the result-collection half of JOB-02.</objective>
<context>
@lib/state.js — readJobs/appendJob/updateJob accessors (lines 371-410); _read/_write/_ensureParent helpers (lines 72-98); the GsdState class shape (constructor takes ctx, exposes ctx.fs).
@lib/_shared.js — nowIso, zeroPad, nextSeq helpers.
@test/helpers/fake-fs.mjs — FakeFs (in-memory) and realFsAdapter (real fs) adapters; stateCtx builds a minimal ctx.
@test/state.test.mjs — the established pattern for real-temp-dir tests (mkdtemp + realFsAdapter, lines 5-12, 89-91).
@lib/ship.js and @lib/map-codebase.js — existing node:child_process usage precedent (execFileSync).
</context>
<tasks>
<task type="auto">
<name>Task 1: lib/job-wrapper.mjs — the detached child wrapper (tracer)</name>
<files>lib/job-wrapper.mjs</files>
<read_first>lib/_shared.js, lib/state.js</read_first>
<action>Create lib/job-wrapper.mjs as a standalone ESM script (no imports from the bundle; only node:child_process, node:fs/promises, node:path). It is invoked as `node lib/job-wrapper.mjs <jobId> <resultFile> <cmd...>`. Parse process.argv.slice(2): argv[0] = jobId, argv[1] = resultFile (absolute path), argv[2..] = the command argv array. Spawn the command with node:child_process spawn(command[0], command.slice(1), { cwd: process.cwd(), stdio: ["ignore", "pipe", "pipe"] }) — NO shell option (per D-01/D-02 security: argv array, no shell interpolation). Collect stdout and stderr into buffers. On the child's close event, capture exitCode. On a spawn 'error' event (e.g. command not found), capture the error message and set exitCode to null. After the child closes (or errors), write the result file at the absolute resultFile path: JSON.stringify({ id: jobId, exitCode, stdout: stdoutBuf.toString(), stderr: stderrBuf.toString(), error: errorMessage || null }, null, 2). Ensure the parent directory exists first with node:fs/promises mkdir(..., { recursive: true }) (per D-03 the wrapper writes the result file; it has no ctx so it uses node:fs/promises). Then process.exit(0). Wrap the whole body so any unexpected throw still writes a result file with the error captured (try/catch around the spawn+write; on catch write { id, exitCode: null, stdout: "", stderr: "", error: String(err) }).</action>
<verify>node lib/job-wrapper.mjs testjob /tmp/gsd-wrapper-check.result.json node -e "console.log('hello'); process.exit(0)" && node -e "const r=require('/tmp/gsd-wrapper-check.result.json'); if(r.exitCode!==0||!r.stdout.includes('hello')) process.exit(1); console.log('wrapper ok')"</verify>
<acceptance_criteria>
- lib/job-wrapper.mjs exists and `node --check lib/job-wrapper.mjs` exits 0
- Running the wrapper with a zero-exit command writes a result file whose exitCode is 0 and stdout contains the command output
- Running the wrapper with a non-zero-exit command writes a result file whose exitCode is non-zero
- The spawn call passes the command as an argv array with no `shell` option (grep for `shell` in lib/job-wrapper.mjs returns no match)
</acceptance_criteria>
<done>lib/job-wrapper.mjs runs a command detached, captures stdout/stderr/exit, and writes a well-formed per-job result file.</done>
</task>
<task type="auto">
<name>Task 2: lib/jobs.js — launchJob and reconcileJobs</name>
<files>lib/jobs.js</files>
<read_first>lib/state.js, lib/job-wrapper.mjs</read_first>
<action>Create lib/jobs.js exporting two async functions. Import node:child_process spawn, node:url fileURLToPath, and node:path. Compute the wrapper path once: const WRAPPER = fileURLToPath(new URL("./job-wrapper.mjs", import.meta.url)). Define `export async function launchJob(ctx, s, cwd, { kind, command, cwd: jobCwd })` where s is the gsdState service. First call `const job = await s.appendJob(cwd, { kind, status: "running" })` to get the JOB-<seq> id (per D-04 lifecycle starts running with a started timestamp set by appendJob). Compute the absolute result file path: `${cwd}/.planning/jobs/${job.id}.result.json`. Spawn the wrapper detached: `const child = spawn(process.execPath, [WRAPPER, job.id, resultFile, ...command], { cwd: jobCwd || cwd, detached: true, stdio: "ignore" })` then `child.unref()` so the tool call returns immediately and the child survives (per D-01 genuinely background). Return the job record. Define `export async function reconcileJobs(ctx, s, cwd)` that reads `const { entries } = await s.readJobs(cwd)`, and for each entry with status === "running", stat-guard read its result file via ctx.fs: `const target = await ctx.fs.resolve(resultFile); const stat = await ctx.fs.stat(target); if (!stat) continue;` (missing file = still running, per D-03/D-04). Parse the file text with JSON.parse inside a try/catch — on parse failure or any read error, `continue` (leave the job running, never throw, per D-06). For a valid result, decide the terminal status: done if exitCode === 0 and no error, else failed (per D-04 non-zero exit or thrown error marks failed). Build a result summary string: for done `exit 0 — <first line of stdout>` and for failed `exit <code> — <first line of stderr or error>`, each truncated to 120 chars. Call `await s.updateJob(cwd, entry.id, { status, result: summary })` (updateJob sets the completed timestamp on the first done/failed transition, per D-04). Count reconciled jobs and return `{ updated: count }`. Ensure reconcileJobs never throws: wrap the whole loop body per-entry in try/catch.</action>
<verify>node --check lib/jobs.js && node -e "import('./lib/jobs.js').then(m => { if (typeof m.launchJob !== 'function' || typeof m.reconcileJobs !== 'function') process.exit(1); console.log('jobs exports ok') })"</verify>
<acceptance_criteria>
- lib/jobs.js exists and `node --check lib/jobs.js` exits 0
- lib/jobs.js exports launchJob and reconcileJobs (grep for `export async function launchJob` and `export async function reconcileJobs`)
- launchJob calls s.appendJob with status "running" (grep for `appendJob` and `"running"`)
- reconcileJobs calls s.updateJob with a done/failed status (grep for `updateJob`)
- The wrapper spawn uses `detached: true` and `child.unref()` (grep for `detached` and `unref`)
</acceptance_criteria>
<done>lib/jobs.js launches a job as a detached child recorded running in the manifest, and reconciles running jobs to done/failed by reading their result files.</done>
</task>
<task type="auto">
<name>Task 3: test/jobs.test.mjs — integration tests for the engine</name>
<files>test/jobs.test.mjs</files>
<read_first>test/state.test.mjs, test/helpers/fake-fs.mjs, lib/jobs.js</read_first>
<action>Create test/jobs.test.mjs using node:test describe/test and node:assert/strict. Import { mkdtemp, rm } from node:fs/promises, path, os, { GsdState } from ../lib/state.js, { stateCtx, realFsAdapter } from ./helpers/fake-fs.mjs, and { launchJob, reconcileJobs } from ../lib/jobs.js. Build a helper that creates a real temp dir via mkdtemp(path.join(os.tmpdir(), "gsd-jobs-")), constructs `const s = new GsdState(stateCtx(realFsAdapter()), {})`, and returns { cwd: tmp, s, ctx: stateCtx(realFsAdapter()) }. Use a beforeEach/afterEach that rm's the temp dir (recursive, force). Write these tests: (1) launchJob records a running job with a JOB-01 id and started timestamp — call launchJob with command ["node", "-e", "process.exit(0)"], then s.readJobs(cwd) and assert entries[0].id === "JOB-01", status === "running", and started is set. (2) A real child runs and reconcile flips to done — launch a zero-exit command, poll for the result file to appear (bounded loop up to ~5s checking ctx.fs.stat on `${cwd}/.planning/jobs/JOB-01.result.json`), then reconcileJobs and assert the job status is "done" and completed is set. (3) A non-zero exit flips to failed with captured stderr — launch ["node", "-e", "console.error('boom'); process.exit(3)"], poll for the result file, reconcile, assert status "failed", completed set, and the result summary includes "boom". (4) A running job with no result file stays running — appendJob a running job directly (no launch), reconcileJobs, assert status stays "running". (5) A corrupt result file does not throw and leaves the job running — appendJob a running job, write a corrupt result file at its path via node:fs/promises writeFile, reconcileJobs, assert it does not reject and the job status stays "running".</action>
<verify>node --test test/jobs.test.mjs</verify>
<acceptance_criteria>
- test/jobs.test.mjs exists and `node --test test/jobs.test.mjs` exits 0 with all tests passing
- The file imports launchJob and reconcileJobs from ../lib/jobs.js (grep for `from "../lib/jobs.js"`)
- The file uses realFsAdapter and mkdtemp (grep for `realFsAdapter` and `mkdtemp`)
- A test asserts a launched job is recorded with status "running" and id "JOB-01"
- A test asserts a zero-exit job reconciles to "done" and a non-zero-exit job reconciles to "failed"
</acceptance_criteria>
<done>test/jobs.test.mjs proves launch records running, real children run and write result files, reconcile flips to done/failed, and missing/corrupt result files leave jobs running without throwing.</done>
</task>
</tasks>

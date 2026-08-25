---
phase: 09-job-runtime
plan: 02
type: execute
wave: 2
depends_on: ["GSD-09-job-runtime-01"]
files_modified: ["lib/core-tools.js", "test/tools.test.mjs", ".planning/phases/GSD-09-job-runtime/VALIDATION.md"]
autonomous: true
requirements: ["JOB-02"]
gap_closure: false
user_setup: []
must_haves:
  truths:
    - "gsd_status reflects real asynchronous job state: a running job whose result file exists renders done/failed; a running job with no result file renders running."
    - "gsd_status never throws over a corrupt result file or a corrupt manifest."
    - "VALIDATION.md exists at the phase root and maps every locked decision D-01..D-05 to its named automated test(s) in test/jobs.test.mjs and test/tools.test.mjs, with a task-coverage record proving no 3-consecutive-task window lacks an automated verify (Nyquist dimension 8)."
  artifacts:
    - path: "lib/core-tools.js"
      provides: "gsd_status now calls reconcileJobs before rendering the Async Jobs section, so the section shows real running/done/failed state instead of a registry-only record."
      min_lines: 236
      exports: []
    - path: "test/tools.test.mjs"
      provides: "gsd_status rendering tests proving real async state (done/failed/running) is surfaced and corrupt result files do not throw."
      min_lines: 657
      exports: []
    - path: ".planning/phases/GSD-09-job-runtime/VALIDATION.md"
      provides: "Nyquist coverage artefact for the phase: maps every locked decision D-01..D-05 to the named automated test(s) in test/jobs.test.mjs and test/tools.test.mjs that prove it, plus a task-coverage record proving no 3-consecutive-task window lacks an automated verify. Written at the phase root alongside CONTEXT.md/RESEARCH.md, mirroring the GSD-08 artefact."
      min_lines: 30
      exports: []
  key_links:
    - from: "lib/core-tools.js"
      to: "lib/jobs.js"
      via: "gsd_status imports and calls reconcileJobs(ctx, gsd(), cwd) before reading the manifest for the Async Jobs section"
      pattern: "reconcileJobs"
---
<objective>Surface real asynchronous job state through gsd_status: call reconcileJobs before rendering the Async Jobs section so the manifest reflects actual running/done/failed outcomes, add rendering tests proving gsd_status reflects real state and never throws over a corrupt result file, and record the D-01..D-05 → automated-test mapping in VALIDATION.md (Nyquist gate). Delivers the surfacing half of JOB-02 (D-05).</objective>
<context>
@lib/core-tools.js — the gsd_status tool execute (lines 82-150); the Async Jobs section rendering (lines 137-144); the `gsd()` helper returning ctx.get("gsdState") (line 13); the inject array (line 10).
@lib/jobs.js — reconcileJobs(ctx, s, cwd) signature from plan 01.
@test/tools.test.mjs — the gsd_status describe block (lines 528-590) and the registerTool/buildProject helpers used there.
@.planning/phases/GSD-09-job-runtime/GSD-09-job-runtime-CONTEXT.md — locked decisions D-01..D-05.
@.planning/phases/GSD-08-capability-gates/VALIDATION.md — the prior-phase Nyquist artefact to mirror.
</context>
<tasks>
<task type="auto">
<name>Task 1: Wire reconcileJobs into gsd_status and render real state (tracer)</name>
<files>lib/core-tools.js</files>
<read_first>lib/core-tools.js, lib/jobs.js</read_first>
<action>In lib/core-tools.js, add an import of reconcileJobs from "./jobs.js" at the top (alongside the existing defineTool import). Inside the gsd_status execute, immediately after the `const s = gsd();` guard and the isProject check, and before the `const jobs = await s.readJobs(cwd)` line (around line 122), call `await reconcileJobs(ctx, s, cwd).catch(() => null)` so the manifest is reconciled to real done/failed state before it is read (per D-05: gsd_status reflects real async state, not a registry-only record). The .catch(() => null) keeps gsd_status an orientation surface that never throws (per D-06). Keep the existing Async Jobs rendering (lines 137-144) which already prints `- ${j.id}: ${j.kind} — ${j.status} — ${j.result || j.started || ""}` — after reconcile this line now shows real running/done/failed status and the result summary. Do not change the rendering format; the reconcile call is the behavioural change.</action>
<verify>node --check lib/core-tools.js && node -e "import('./lib/core-tools.js').then(() => console.log('core-tools imports ok'))"</verify>
<acceptance_criteria>
- lib/core-tools.js imports reconcileJobs from "./jobs.js" (grep for `reconcileJobs` in lib/core-tools.js)
- gsd_status calls reconcileJobs before readJobs (grep shows `reconcileJobs` appearing before the `readJobs` line in the gsd_status execute)
- The reconcile call is wrapped so it cannot throw (grep for `reconcileJobs(ctx, s, cwd).catch`)
- `node --check lib/core-tools.js` exits 0
</acceptance_criteria>
<done>gsd_status reconciles the manifest to real async state before rendering the Async Jobs section, without ever throwing.</done>
</task>
<task type="auto">
<name>Task 2: gsd_status rendering tests for real async state</name>
<files>test/tools.test.mjs</files>
<read_first>test/tools.test.mjs, lib/core-tools.js</read_first>
<action>Add tests to the existing `describe("gsd_status", ...)` block in test/tools.test.mjs (after the "seeded windows and jobs render" test around line 564). These use the existing FakeFs + buildProject + registerTool("core-tools", "gsd_status") pattern. Because gsd_status now calls reconcileJobs, which reads result files via ctx.fs, seed the manifest and result files directly on the FakeFs. Write two tests: (1) "a running job whose result file exists renders done/failed" — appendJob a running job (kind "subagent", status "running"), then write a result file at `${CWD}/.planning/jobs/JOB-01.result.json` via fs.writeText containing `{"id":"JOB-01","exitCode":0,"stdout":"hello","stderr":"","error":null}`, execute gsd_status, and assert the output matches /JOB-01/ and /done/ (reconcile flips it to done). (2) "a running job with no result file renders running" — appendJob a running job with no result file, execute gsd_status, and assert the output matches /JOB-01/ and /running/ (reconcile leaves it running). Also add a test that a corrupt result file does not throw: appendJob a running job, write a corrupt result file (e.g. "not-json{{{"), execute gsd_status inside assert.doesNotReject, and assert the output still matches /JOB-01/ and /running/.</action>
<verify>node --test test/tools.test.mjs</verify>
<acceptance_criteria>
- test/tools.test.mjs passes `node --test test/tools.test.mjs` (exit 0)
- A test asserts a running job with a valid result file renders "done" (grep for `/done/` in the new test)
- A test asserts a running job with no result file renders "running" (grep for `/running/` in the new test)
- A test asserts a corrupt result file does not throw and leaves the job "running" (grep for `doesNotReject` in the new test)
</acceptance_criteria>
<done>test/tools.test.mjs proves gsd_status surfaces real done/running state and never throws over a corrupt result file.</done>
</task>
<task type="auto">
<name>Task 3: Record the D-01..D-05 to automated-test mapping in VALIDATION.md (Nyquist gate)</name>
<files>.planning/phases/GSD-09-job-runtime/VALIDATION.md</files>
<read_first>.planning/phases/GSD-09-job-runtime/GSD-09-job-runtime-CONTEXT.md, .planning/phases/GSD-09-job-runtime/GSD-09-job-runtime-RESEARCH.md, test/jobs.test.mjs, test/tools.test.mjs, .planning/phases/GSD-08-capability-gates/VALIDATION.md</read_first>
<action>Write the Nyquist coverage artefact for the phase at .planning/phases/GSD-09-job-runtime/VALIDATION.md (the phase root, alongside CONTEXT.md/RESEARCH.md). It is a plain Markdown file that records, for every locked decision D-01..D-05 in CONTEXT.md, the named automated test(s) in test/jobs.test.mjs (plan 01 integration suite) and test/tools.test.mjs (plan 02 rendering suite) that prove it, plus the phase-goal truths (JOB-01/JOB-02) those tests back. Structure, mirroring the GSD-08 artefact: a "Nyquist Validation Coverage" heading; a mapping table with columns Decision | Automated test(s) | File; and a "Task coverage (dimension 8)" subsection listing each task across the two plans with its verify command, proving no 3-consecutive-task window lacks an automated `node --test` verify. Map D-01 (real child process via node:child_process spawn, no shell) to the plan-01 wrapper test asserting the spawn uses an argv array with no shell option and the launch test asserting a real child runs; D-02 (shell-command job, argv + cwd) to the plan-01 launch/reconcile tests; D-03 (child writes per-job result file the runtime reads back) to the plan-01 result-file tests and the plan-02 done/failed rendering tests; D-04 (running → done/failed with started/finished timestamps; non-zero exit or error marks failed) to the plan-01 done/failed reconcile tests; D-05 (gsd_status shows real running/done/failed state) to the plan-02 rendering tests. Include a final row recording the full-suite gate `node --test test/*.test.mjs`. Commit atomically as feat(09-02): VALIDATION.md Nyquist coverage.</action>
<verify>test -f .planning/phases/GSD-09-job-runtime/VALIDATION.md && grep -cE 'D-0[1-5]' .planning/phases/GSD-09-job-runtime/VALIDATION.md && grep -n "Nyquist" .planning/phases/GSD-09-job-runtime/VALIDATION.md</verify>
<acceptance_criteria>
- test -f .planning/phases/GSD-09-job-runtime/VALIDATION.md exits 0 (artefact created at the phase root)
- grep -nE 'D-0[1-5]' .planning/phases/GSD-09-job-runtime/VALIDATION.md exits 0 and every locked decision D-01..D-05 appears in the mapping table
- grep -n "Nyquist" .planning/phases/GSD-09-job-runtime/VALIDATION.md exits 0 (Nyquist coverage heading present)
- grep -n "node --test test/\*.test.mjs" .planning/phases/GSD-09-job-runtime/VALIDATION.md exits 0 (full-suite gate recorded)
- git log --format=%s -1 shows "feat(09-02):"
</acceptance_criteria>
<done>VALIDATION.md exists at the phase root and maps every locked decision D-01..D-05 to its named automated test(s), plus a task-coverage record proving no 3-consecutive-task window lacks an automated verify (Nyquist dimension 8 satisfied).</done>
</task>
</tasks>

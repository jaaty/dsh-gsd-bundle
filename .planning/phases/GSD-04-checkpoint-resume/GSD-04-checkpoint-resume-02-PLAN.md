---
phase: GSD-04-checkpoint-resume
plan: 02
type: execute
wave: 2
depends_on: ["GSD-04-checkpoint-resume-01"]
files_modified: ["lib/execute.js", "lib/_agents.js", "test/tools.test.mjs"]
autonomous: true
requirements: ["DUR-01", "DUR-02"]
user_setup: []
must_haves:
  truths:
    - "When an executor returns structured checkpoint state, gsd_execute persists <base>-<PP>-CHECKPOINT.md and does NOT write SUMMARY-<PP> or mark the plan complete (DUR-01)."
    - "Re-running gsd_execute on a plan that has CHECKPOINT-<PP> but no SUMMARY-<PP> dispatches the executor with a prompt containing 'RESUME from checkpoint' and the recorded last_completed_task, skips tasks 1..N, and completes the plan (DUR-02, D-03, D-04)."
    - "A persisted CHECKPOINT-<PP> whose frontmatter fails to parse, or whose last_completed_task is out of range for the plan's task_count, makes gsd_execute fail loud with a named error rather than re-running from task 1 (D-05)."
    - "When a plan has both SUMMARY-<PP> and a stale CHECKPOINT-<PP>, the plan runs as complete and the stale CHECKPOINT-<PP> is removed (D-06)."
  artifacts:
    - path: "lib/execute.js"
      provides: "gsd_execute consumes structured checkpoint state, persists CHECKPOINT-<PP>, builds the resume path + resume instruction, D-05 fail-loud validation, D-06 SUMMARY-wins cleanup"
      min_lines: 180
      exports: ["apply", "name"]
    - path: "lib/_agents.js"
      provides: "EXECUTOR_PROMPT names the exact structured checkpoint keys (plan, last_completed_task, checkpoint_reason, committed_hashes)"
      min_lines: 300
      exports: ["EXECUTOR_PROMPT"]
    - path: "test/tools.test.mjs"
      provides: "gsd_execute tests for checkpoint capture, resume-completion, fail-loud validation, and SUMMARY-wins cleanup"
      min_lines: 320
      exports: []
  key_links:
    - from: "lib/_runner.js"
      to: "lib/execute.js"
      via: "spawnSubagent returns result.structured; gsd_execute reads r.structured.checkpoint to distinguish a checkpoint stop from a completion"
      pattern: "r\\.structured\\?\\?checkpoint|structured\\.checkpoint"
    - from: "lib/execute.js"
      to: "lib/state.js"
      via: "gsd_execute persists via s.writeArtifact('CHECKPOINT-'+zeroPad, ...) and cleans stale checkpoints with s.removeArtifact on the SUMMARY-wins path"
      pattern: "removeArtifact"
---
<objective>Implement the controller half of checkpoint-resume: make gsd_execute consume the executor's structured checkpoint return, persist it as the per-plan CHECKPOINT-<PP> artefact, resume an interrupted plan from that checkpoint (skip tasks 1..N, begin at N+1), fail loud on corrupt/out-of-range checkpoints, and let a completed SUMMARY win over a stale CHECKPOINT. This delivers DUR-01 and DUR-02.</objective>

<context>
@lib/execute.js — gsd_execute dispatch: completion probe (lines 74, 105), prompt assembly in the runnables map (lines 80-100), results handler (lines 102-117)
@lib/_runner.js — spawnSubagent returns { output, stopReason, diagnostic, structured } (lines 22-28)
@lib/state.js — writeArtifact/readArtifact/hasArtifact/removeArtifact (lines 370-389, +plan 01's removeArtifact), planIndex exposes has_checkpoints + task_count on each plan (lines 419, 449-450)
@lib/_shared.js — parseFrontmatter/stringifyFrontmatter (lines 51-173)
@lib/_agents.js — EXECUTOR_PROMPT checkpoint semantics (lines 158, 168), autonomous:false rule (line 100)
@test/tools.test.mjs — makeSubagents fake-subagent pattern (lines 21-62), the gsd_execute describe (lines 111-136)
</context>

<tasks>
<task type="auto">
<name>Task 1: Tracer — consume structured checkpoint return and persist CHECKPOINT-&lt;PP&gt; (DUR-01, D-01)</name>
<files>lib/execute.js, test/tools.test.mjs</files>
<read_first>lib/execute.js, lib/_runner.js, lib/_shared.js, lib/state.js, test/tools.test.mjs</read_first>
<action>In lib/execute.js, add `parseFrontmatter` and `stringifyFrontmatter` to the existing `import { zeroPad, matchesGapClosure } from "./_shared.js";` line (line 15). In the results handler (currently lines 102-112), after `const r = await thunk();` capture `const cp = r.structured?.checkpoint;` and branch: when `cp` is a non-null object, (a) validate shape — require `Number.isInteger(cp.last_completed_task)` and `1 <= cp.last_completed_task < p.task_count`, else throw a named error `gsd_execute: executor returned invalid checkpoint for plan ${p.id}: last_completed_task=${...}, task_count=${p.task_count}`; (b) persist via `await s.writeArtifact(cwd, args.phase, \`CHECKPOINT-${zeroPad(Number(p.plan))}\`, stringifyFrontmatter({ plan: p.id, last_completed_task: cp.last_completed_task, checkpoint_reason: cp.checkpoint_reason ?? null, committed_hashes: cp.committed_hashes ?? [] }))`; (c) return `{ p, ok: false, checkpointed: true, out: r.output, stopReason: r.stopReason, diagnostic: r.diagnostic }` and do NOT touch SUMMARY. When `cp` is absent, fall through to the existing SUMMARY probe (line 105) unchanged. Update the results logging loop (lines 114-117) to emit a distinct line for a checkpointed result, e.g. `wave ${w}: ${r.p.id} ⏸ checkpointed at task ${r.checkpointed_at}` — add `checkpointed_at: cp.last_completed_task` to the returned object. In test/tools.test.mjs, extend the fake `start` so an "execute" label probes whether `${CWD}/.planning/phases/01-auth/01-auth-01-CHECKPOINT.md` exists on `fs`: when absent it returns `structured: { checkpoint: { plan: "01-auth-01", last_completed_task: 1, checkpoint_reason: "human-verify", committed_hashes: ["a"] } }` and writes no SUMMARY; when present it writes SUMMARY-01 (existing behaviour). Add tests in the "gsd_execute" describe: one where the first execute returns structured.checkpoint, then assert CHECKPOINT-01 exists, SUMMARY-01 absent, output contains "checkpoint", and STATE step stays "execute".</action>
<verify>node --test test/tools.test.mjs && node --test test/state.test.mjs</verify>
<acceptance_criteria>
- grep "structured?.checkpoint" or "structured.checkpoint" in lib/execute.js
- grep "writeArtifact(cwd, args.phase" with CHECKPOINT in lib/execute.js
- tools.test.mjs has a test asserting CHECKPOINT-01 exists and SUMMARY-01 absent after a checkpointed executor return
- `node --test test/tools.test.mjs && node --test test/state.test.mjs` exits 0
</acceptance_criteria>
<done>gsd_execute persists a valid structured checkpoint return to the CHECKPOINT-<PP> artefact, leaves the plan incomplete, and logs a distinct checkpoint line.</done>
</task>

<task type="auto">
<name>Task 2: Resume from a persisted checkpoint with skip semantics and fail-loud validation (DUR-02, D-03, D-04, D-05)</name>
<files>lib/execute.js, test/tools.test.mjs</files>
<read_first>lib/execute.js, lib/_shared.js, lib/state.js, test/tools.test.mjs</read_first>
<action>In lib/execute.js, in the runnables map (lines 80-100), add checkpoint-resume detection before building each prompt. Compute `const cpSuffix = \`CHECKPOINT-${zeroPad(Number(p.plan))}\`;` and `const hasCp = await s.hasArtifact(cwd, args.phase, cpSuffix);`. When `hasCp` is true, read `const cpText = await s.readArtifact(cwd, args.phase, cpSuffix);`, parse with `parseFrontmatter(cpText)` (from the added import), and validate per D-05: if `cpText` is undefined or `frontmatter.last_completed_task` is not an integer with `1 <= last_completed_task < p.task_count`, throw a named error `gsd_execute: invalid CHECKPOINT-<PP> artefact for plan ${p.id}: last_completed_task=..., task_count=${p.task_count}` — never silently re-run from task 1. When valid, build `resumeInstr = \`RESUME from checkpoint: tasks 1..${cpFront.last_completed_task} are done; begin at task ${cpFront.last_completed_task + 1}. Prior checkpoint context:\n${cpText}\`;` (per D-03 skip-by-index, D-04 prior-context). Append `resumeInstr` to the assembled prompt (after the existing final instruction string at line 97), so the executor receives a full planning_context plus the resume directive. Do not alter the completion path in this task. In test/tools.test.mjs, add a resume test: seed the phase with PLAN-01 and CHECKPOINT-01 whose frontmatter carries `plan: 01-auth-01`, `last_completed_task: 1`, then run gsd_execute and assert the fake subagent captured a prompt containing "RESUME from checkpoint" and "last_completed_task" (have the fake `start` store `req.prompt` on a module-level captured array for the execute label), and that SUMMARY-01 is written and the plan completes (assert log matches /01-auth-01 ✓/). Add a fail-loud test: seed a CHECKPOINT-01 with `last_completed_task` set to a value >= task_count, then `assert.rejects(() => gsd_execute(...), /invalid CHECKPOINT-01/)`.</action>
<verify>node --test test/tools.test.mjs</verify>
<acceptance_criteria>
- grep "RESUME from" in lib/execute.js
- grep "readArtifact(this, args.phase, \`CHECKPOINT-${zeroPad" or equivalent in lib/execute.js
- tools.test.mjs has a resume test asserting the captured prompt contains "RESUME from" and a fail-loud test asserting a named /invalid CHECKPOINT/ rejection
- `node --test test/tools.test.mjs` exits 0
</acceptance_criteria>
<done>A checkpointed plan (CHECKPOINT without SUMMARY) is dispatched with a RESUME instruction carrying last_completed_task, the executor completes it, and a corrupt/out-of-range checkpoint makes gsd_execute fail loud.</done>
</task>

<task type="auto">
<name>Task 3: SUMMARY-wins precedence + stale cleanup + name the checkpoint keys in EXECUTOR_PROMPT (D-06, O-4)</name>
<files>lib/execute.js, lib/_agents.js, test/tools.test.mjs</files>
<read_first>lib/execute.js, lib/_agents.js, test/tools.test.mjs</read_first>
<action>In lib/execute.js, in the results handler completion path (inside the existing `if (ok)` block at line 106), before/around `markPlanSummary` add: if `await s.hasArtifact(cwd, args.phase, cpSuffix)` then `await s.removeArtifact(cwd, args.phase, cpSuffix)` — the summary wins over any stale checkpoint (D-06). Ensure `cpSuffix` is computed in this handler too (reuse the `CHECKPOINT-${zeroPad(Number(p.plan))}` expression). In lib/_agents.js, refine EXECUTOR_PROMPT's checkpoint instructions so the structured return names the exact keys (O-4): change line 158 to instruct the executor to stop and return a structured checkpoint object with keys `plan`, `last_completed_task`, `checkpoint_reason`, `committed_hashes` (do NOT proceed); adjust line 168's "return the checkpoint state" wording to reference those same keys. Keep the existing `autonomous: false` rule (line 100) unchanged. In test/tools.test.mjs add a D-06 test: seed both SUMMARY-01 and a stale CHECKPOINT-01 on `fs`, run gsd_execute once, and assert the plan completes without re-running from scratch (fake executor captured exactly one spawn for plan 01) and that the stale CHECKPOINT is removed (assert fs.files no longer has the CHECKPOINT key; if removeArtifact is a node:fs no-op on the fake fs, assert instead via a call-count that SUMMARY won and the plan is marked complete — the deletion itself is covered by plan 01's real-fs test).</action>
<verify>node --test test/tools.test.mjs && node --test test/state.test.mjs</verify>
<acceptance_criteria>
- grep "removeArtifact" in lib/execute.js (in the SUMMARY-wins path)
- grep "committed_hashes" in lib/_agents.js EXECUTOR_PROMPT
- tools.test.mjs has a test asserting the SUMMARY-wins behaviour (plan completes with SUMMARY+stale CHECKPOINT present)
- `node --test test/tools.test.mjs && node --test test/state.test.mjs` exits 0
</acceptance_criteria>
<done>A completed SUMMARY takes precedence over a stale CHECKPOINT and cleans it up, and EXECUTOR_PROMPT tells the executor the exact structured checkpoint keys the controller expects.</done>
</task>
</tasks>

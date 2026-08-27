---
phase: 14-execute-checkpoint
plan: 01
type: execute
wave: 1
depends_on: []
files_modified: ["lib/_checkpoint.js", "test/_checkpoint.test.mjs"]
autonomous: true
requirements: ["CQ-04"]
user_setup: []
must_haves:
  truths:
    - "The checkpoint prepare/process logic is extracted into lib/_checkpoint.js helpers that take the gsdState service (s) as a parameter and are unit-testable with a fake s."
    - "The two checkpoint validations share one predicate (validateCheckpointTask) with no duplicated validation, while preserving each call site's exact error message."
  artifacts:
    - path: "lib/_checkpoint.js"
      provides: "the extracted checkpoint helpers (validateCheckpointTask, prepareCheckpoint, processCheckpoint) that delegate all I/O to the gsdState service"
      min_lines: 40
      exports: ["validateCheckpointTask", "prepareCheckpoint", "processCheckpoint"]
    - path: "test/_checkpoint.test.mjs"
      provides: "direct unit tests for the extracted helpers using a minimal fake s"
      min_lines: 40
      exports: []
  key_links:
    - from: "lib/_checkpoint.js"
      to: "lib/_shared.js"
      via: "imports parseFrontmatter, stringifyFrontmatter, zeroPad, decisionIdFor, awaitingDecision, awaitingMarker"
      pattern: "from \"./_shared.js\""
---
<objective>Create the new lib/_checkpoint.js module holding the extracted checkpoint prepare/process helpers (per D-01), plus direct unit tests for them (per D-05). This is the foundation plan: the helpers are independently testable with a fake gsdState service before they are wired into gsd_execute in plan 02.</objective>
<context>@lib/execute.js — the file being refactored; the prepare path (lines 110-164) and process path (lines 196-218) are the exact logic to extract. @lib/_shared.js — the pure helpers (parseFrontmatter, stringifyFrontmatter, zeroPad, decisionIdFor, awaitingDecision, awaitingMarker) the new module reuses. @test/_shared.test.mjs — the existing pure-helper unit-test conventions. @test/helpers/fake-fs.mjs — the in-memory fake fs used to build a fake s.</context>
<tasks>
  <task type="auto">
    <name>Task 1: Create lib/_checkpoint.js with the three extracted helpers (tracer)</name>
    <files>lib/_checkpoint.js</files>
    <read_first>lib/execute.js, lib/_shared.js</read_first>
    <action>Create lib/_checkpoint.js. Import from "./_shared.js": parseFrontmatter, stringifyFrontmatter, zeroPad, decisionIdFor, awaitingDecision, awaitingMarker. Export three functions that take the gsdState service (s) as a parameter (D-01) and delegate all I/O to it:
      1. validateCheckpointTask(n, taskCount, message) — the single shared predicate (CQ-04 "no duplicated validation"): throw new Error(message) when !Number.isInteger(n) || n < 1 || n >= taskCount. It does NOT construct the message; callers pass their exact existing message string so D-03's no-error-message-change holds.
      2. prepareCheckpoint(s, { cwd, phase, p, answer, decisionId }) — encapsulate execute.js lines 110-164 exactly. Compute cpSuffix = `CHECKPOINT-${zeroPad(Number(p.plan))}`. If s.hasArtifact(cwd, phase, cpSuffix): readArtifact + parseFrontmatter into checkpointFm; call validateCheckpointTask(frontmatter.last_completed_task, p.task_count, `gsd_execute: invalid ${cpSuffix} artefact for plan ${p.id}: last_completed_task=${frontmatter.last_completed_task}, task_count=${p.task_count}`); build resumeInstr = `RESUME from checkpoint: tasks 1..${n} are done; begin at task ${n + 1}. Prior checkpoint context:\n${cpText}`. Then compute awaiting = checkpointFm ? awaitingDecision(checkpointFm, answer, decisionId) : false. If awaiting, return { resumeInstr: "", checkpointFm, awaiting: true, marker: awaitingMarker({ plan: p.id, decision_id: checkpointFm.decision_id || decisionIdFor(p.id, checkpointFm.last_completed_task), kind: checkpointFm.checkpoint_kind || "decision", question: checkpointFm.checkpoint_reason || "" }) }. If not awaiting and checkpointFm is set, replicate the answer-binding block (execute.js lines 145-164) verbatim: compute storedDecisionId, suppliedAnswer, suppliedMatches; when suppliedMatches, re-read the artefact (readArtifact + parseFrontmatter), set frontmatter.human_answer = answer, and s.writeArtifact(cwd, phase, cpSuffix, stringifyFrontmatter(frontmatter)) — preserve the double-read; compute answer = suppliedMatches ? answer : (checkpointFm.human_answer || ""); append `\nRESUME from checkpoint: human answered ${storedDecisionId} = ${answer}` to resumeInstr. Return { resumeInstr, checkpointFm, awaiting: false, marker: null }. Preserve the exact string literals and the exact ordering of the two RESUME lines (D-03).
      3. processCheckpoint(s, { cwd, phase, p, r, job, log, w }) — encapsulate execute.js lines 196-218. Read cp = r.structured?.checkpoint. Call validateCheckpointTask(cp.last_completed_task, p.task_count, `gsd_execute: executor returned invalid checkpoint for plan ${p.id}: last_completed_task=${cp.last_completed_task}, task_count=${p.task_count}`). s.writeArtifact(cwd, phase, `CHECKPOINT-${zeroPad(Number(p.plan))}`, stringifyFrontmatter({ plan: p.id, last_completed_task: cp.last_completed_task, checkpoint_reason: cp.checkpoint_reason ?? null, committed_hashes: cp.committed_hashes ?? [], checkpoint_kind: cp.checkpoint_kind ?? "decision", decision_id: decisionIdFor(p.id, cp.last_completed_task) })). If job: const updated = await s.updateJob(cwd, job.id, { status: "done", result: "checkpointed (resumable)" }).catch(() => null); if (!updated) log.push(`wave ${w}: ${p.id} job ${job.id} reconcile skipped (record absent)`). Return { p, ok: false, checkpointed: true, checkpointed_at: cp.last_completed_task, out: r.output, stopReason: r.stopReason, diagnostic: r.diagnostic }. Do NOT fold the SUMMARY-wins cleanup or its job reconcile into this helper (D-02).</action>
    <verify>node --check lib/_checkpoint.js</verify>
    <acceptance_criteria>
      - grep "export function validateCheckpointTask" lib/_checkpoint.js
      - grep "export function prepareCheckpoint" lib/_checkpoint.js
      - grep "export function processCheckpoint" lib/_checkpoint.js
      - grep "from \"./_shared.js\"" lib/_checkpoint.js
      - node --check lib/_checkpoint.js exits 0
    </acceptance_criteria>
    <done>lib/_checkpoint.js exists, exports the three helpers, imports only from ./_shared.js, and passes node --check.</done>
  </task>
  <task type="auto">
    <name>Task 2: Add direct unit tests in test/_checkpoint.test.mjs</name>
    <files>test/_checkpoint.test.mjs</files>
    <read_first>lib/_checkpoint.js, test/_shared.test.mjs, test/helpers/fake-fs.mjs</read_first>
    <action>Create test/_checkpoint.test.mjs (a new module warrants a new test file; do not append to _shared.test.mjs). Import { validateCheckpointTask, prepareCheckpoint, processCheckpoint } from "../lib/_checkpoint.js". Build a minimal fake s backed by an in-memory Map: hasArtifact(cwd, phase, suffix) -> map.has(key); readArtifact -> map.get(key); writeArtifact -> map.set(key, content); updateJob -> record the call and return true. Use a plan object p = { id: "GSD-14-execute-checkpoint-01", plan: "01", task_count: 2 }. Cover per D-05:
      - validateCheckpointTask: valid n (1) with taskCount 2 does not throw; invalid n (0, 2, 1.5, "x") throws with the exact message passed.
      - prepareCheckpoint valid checkpoint: seed a CHECKPOINT-01 artefact with last_completed_task: 1; assert resumeInstr matches /RESUME from checkpoint/ and /begin at task 2/.
      - prepareCheckpoint invalid/out-of-range: seed last_completed_task: 9; assert it rejects with /invalid CHECKPOINT-01/.
      - prepareCheckpoint awaiting gate: seed a decision checkpoint (decision_id, no human_answer) and call with no answer; assert result.awaiting === true and result.marker starts with "GSD_AWAITING_HUMAN".
      - prepareCheckpoint answer binding: seed a decision checkpoint, call with answer "use pg" and decisionId "GSD-14-execute-checkpoint-01-ck1"; assert the persisted CHECKPOINT frontmatter has human_answer === "use pg" and resumeInstr matches /human answered .* = use pg/.
      - processCheckpoint persist + job reconcile: call with r = { structured: { checkpoint: { last_completed_task: 1, checkpoint_reason: "r", committed_hashes: ["a"], checkpoint_kind: "decision" } }, output: "o", stopReason: "checkpoint", diagnostic: "d" }, job = { id: "JOB-01" }, log = []; assert the CHECKPOINT-01 artefact is written, updateJob was called with { status: "done", result: "checkpointed (resumable)" }, and the returned object has checkpointed: true and checkpointed_at: 1.
      - processCheckpoint invalid: call with last_completed_task: 9; assert it rejects with /executor returned invalid checkpoint/.</action>
    <verify>node --test test/_checkpoint.test.mjs</verify>
    <acceptance_criteria>
      - node --test test/_checkpoint.test.mjs exits 0
      - grep "describe(" test/_checkpoint.test.mjs
      - grep "prepareCheckpoint" test/_checkpoint.test.mjs
      - grep "processCheckpoint" test/_checkpoint.test.mjs
    </acceptance_criteria>
    <done>test/_checkpoint.test.mjs exists and all its unit tests pass.</done>
  </task>
</tasks>

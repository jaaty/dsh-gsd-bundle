---
phase: 07-uat-conversation
plan: 02
type: execute
wave: 2
depends_on: ["GSD-07-uat-conversation-01"]
files_modified: ["lib/execute.js", "test/tools.test.mjs", ".planning/phases/GSD-07-uat-conversation/VALIDATION.md"]
autonomous: true
requirements: ["UAT-01", "UAT-02"]
user_setup: []
must_haves:
  truths:
    - "gsd_execute accepts two new optional args 'answer' and 'decision_id' without breaking the existing phase/wave/gapsOnly schema or the mount tool-count."
    - "A checkpointed plan (CHECKPOINT-<PP> present) with no available human answer is NOT executed: gsd_execute returns a GSD_AWAITING_HUMAN marker line naming the plan, decision kind, decision_id, and exact question, and spawns no executor (D-05)."
    - "Re-invoking gsd_execute with a matching answer+decision_id resumes the checkpointed plan, binds 'RESUME from checkpoint: human answered <decision_id> = <answer>' into the executor prompt, and the plan completes (D-03, UAT-02)."
    - "The human answer is persisted as human_answer in the CHECKPOINT-<PP> frontmatter, so a later call with no args resumes from the stored answer (D-04)."
    - "A supplied answer whose decision_id matches no pending checkpoint is ignored with no error and the plan stays awaiting (D-06); checkpoint:decision, checkpoint:human-action, and checkpoint:human-verify all share the one marker->answer path (D-07)."
  artifacts:
    - path: "lib/execute.js"
      provides: "The conversational UAT loop: awaiting gate + marker emission (no spawn), answer/decision_id validation + binding into the resume prompt, decision_id/checkpoint_kind persistence, and human_answer persistence into the CHECKPOINT artefact."
      min_lines: 240
      exports: ["apply"]
    - path: ".planning/phases/GSD-07-uat-conversation/VALIDATION.md"
      provides: "The Nyquist coverage artefact for the phase: maps every locked decision D-01..D-07 to the named automated test(s) that prove it, and records that no 3-consecutive-task window lacks coverage."
      min_lines: 30
      exports: []
  key_links:
    - from: "lib/execute.js"
      to: "lib/_shared.js"
      via: "gsd_execute imports decisionIdFor/awaitingDecision/awaitingMarker and uses them for the awaiting gate, decision_id generation, and marker formatting."
      pattern: "awaitingDecision|awaitingMarker|decisionIdFor"
    - from: "lib/execute.js"
      to: "lib/_agents.js"
      via: "gsd_execute persists the executor's r.structured.checkpoint.checkpoint_kind into the CHECKPOINT frontmatter, and reads it back to name the kind in the awaiting marker."
      pattern: "checkpoint_kind"
---
<objective>Wire the conversational UAT loop into gsd_execute: add the answer/decision_id args, gate a checkpointed plan into awaiting (marker, no spawn) until an answer is available, bind the human answer into the resume prompt, and persist both the decision_id/kind and the human_answer into the CHECKPOINT artefact so a context-reset resume still carries it. Delivers UAT-01 and UAT-02 by completing the marker->answer handoff that plan 01's helpers enable, and records the D-01..D-07 to automated-test mapping in VALIDATION.md (Nyquist gate).</objective>
<context>
@lib/execute.js — gsd_execute: parameters schema (lines 39-43), the per-plan resume block (lines 103-127), the executor dispatch + checkpoint persist (lines 95-184), the window/STATE finalization (lines 197-221). Imports at line 26.
@lib/_agents.js — EXECUTOR_PROMPT (already extended in plan 01 to return checkpoint_kind).
@lib/_shared.js — decisionIdFor / awaitingDecision / awaitingMarker (added in plan 01).
@test/tools.test.mjs — the gsd_execute describe block; makeSubagents fake executor (lines 76-128, structured checkpoint at line 95); CHECKPOINT_FM + PLAN_2_TASKS fixtures (lines 27-68). Existing tests that seed a CHECKPOINT and auto-resume without an answer (lines 188, 241, 271, 292) MUST be updated per D-05 (R-1).
@CONTEXT.md — D-01 marker, D-02 no inline prompt, D-03 answer binding, D-04 human_answer persistence, D-05 await-don't-execute, D-06 stale ignored, D-07 single path. D-02 forbids any blocking in-tool prompt — the marker handoff is the only channel.
</context>
<tasks>
<task type="auto">
<name>Task 1: Add answer/decision_id args and the awaiting gate + marker (no-spawn) (tracer)</name>
<files>lib/execute.js</files>
<read_first>lib/execute.js</read_first>
<action>In lib/execute.js: (1) Add two optional parameters to the gsd_execute parameters object (after gapsOnly, line 42): "answer" { type: "string", description: "The human's answer to a pending decision checkpoint; applied to the matching decision_id on resume." } and "decision_id" { type: "string", description: "Identifier of the pending decision this answer answers; must match the checkpoint's stored decision_id to be applied (D-03/D-06)." }. Do not touch phase/wave/gapsOnly. (2) Import awaitingDecision and awaitingMarker (and decisionIdFor, needed in task 2 — you may add all three now) from "./_shared.js" on line 26. (3) Implement the awaiting gate. Inside the runnables.map (lines 95-135), where the CHECKPOINT-<PP> is currently read and resumeInstr built (lines 105-115), read and parse the checkpoint frontmatter as today, keep the existing fail-loud validation of last_completed_task (throw on non-integer / <1 / >= task_count — do not weaken it). Then compute `const awaiting = awaitingDecision(frontmatter, args.answer, args.decision_id)`. If awaiting is true, do NOT build a prompt or a job and do NOT return a thunk: instead return a marker object `{ p, awaiting: true, marker: awaitingMarker({ plan: p.id, decision_id: frontmatter.decision_id || decisionIdFor(p.id, frontmatter.last_completed_task), kind: frontmatter.checkpoint_kind || "decision", question: frontmatter.checkpoint_reason || "" }) }`. Skip the appendJob call for awaiting plans (no executor is spawned, D-05). Filter awaiting entries out of the dispatch Promise.all (lines 137-185) so they are never spawned, and after the wave loop append each awaiting marker line to the log (e.g. `log.push(marker)`). The existing completion-log lines (wave N: id ✓/⏸/✗) must remain intact for plans that DO dispatch (R-2). Per D-01/D-05: an unanswered checkpoint returns the marker and spawns nothing. Per D-02: do NOT add any in-tool blocking prompt.

SEQUENCING NOTE (R-1): the four existing tests that seed a CHECKPOINT and auto-resume without an answer (lines 188, 241, 271, 292) still encode the OLD auto-resume expectation and will fail once this gate lands. Do NOT attempt a full-suite run in this task — the full suite (node --test test/tools.test.mjs) is exercised only in task 3 after those tests are updated and the new matrix is added. This task's verify is limited to syntax + grep so it does not gate on the stale tests.</action>
<verify>node --check lib/execute.js && grep -nE '"answer"|"decision_id"' lib/execute.js && grep -n "awaitingDecision" lib/execute.js && ! grep -n "ask_user_question" lib/execute.js</verify>
<acceptance_criteria>
- grep -nE '"answer"|"decision_id"' lib/execute.js exits 0 and both appear in the parameters object (alongside phase/wave/gapsOnly)
- grep -n "awaitingDecision" lib/execute.js exits 0
- node --check lib/execute.js exits 0
- ! grep -n "ask_user_question" lib/execute.js — no blocking prompt was added (D-02)
- the full suite is NOT run here (deferred to task 3) so it cannot stall on the four stale auto-resume tests
</acceptance_criteria>
<done>gsd_execute accepts answer/decision_id, and an unanswered checkpointed plan returns the GSD_AWAITING_HUMAN marker without spawning an executor; syntax + grep verifies pass without touching the stale tests.</done>
</task>
<task type="auto">
<name>Task 2: Answer validation + binding, and human_answer / decision_id / checkpoint_kind persistence</name>
<files>lib/execute.js</files>
<read_first>lib/execute.js</read_first>
<action>In lib/execute.js, complete the two persistence + binding paths:

(1) At CHECKPOINT persist time (the block that writes the CHECKPOINT-<PP> artefact from the executor's structured return, currently lines 147-152), extend the stringifyFrontmatter object so it persists the kind and a decision_id: add `checkpoint_kind: cp.checkpoint_kind ?? "decision"` and `decision_id: decisionIdFor(p.id, cp.last_completed_task)`. Keep the existing plan / last_completed_task / checkpoint_reason / committed_hashes keys. This makes turn-2's decision_id match possible (RQ-3/D-03).

(2) On the resume path, when the checkpoint is NOT awaiting (awaitingDecision returned false): append a human-answered binding line to resumeInstr in addition to the existing "RESUME from checkpoint: tasks 1..N are done; begin at task N+1... Prior checkpoint context:...". Append the extra line `RESUME from checkpoint: human answered ${decision_id} = ${answer}` where decision_id is the stored frontmatter.decision_id (or decisionIdFor(...) fallback) and answer is the human answer for this turn. The answer text for the binding is: the args.answer when this call supplied a matching one, else the persisted frontmatter.human_answer (context-reset case, D-04). (3) When this call supplied a matching answer (awaitingDecision false because of the args.answer path), persist it into the CHECKPOINT artefact BEFORE dispatch (D-04): re-read the current CHECKPOINT-<PP> text, parse its frontmatter, set frontmatter.human_answer = args.answer, re-serialize with stringifyFrontmatter over the SAME frontmatter keys (preserving plan, last_completed_task, checkpoint_reason, committed_hashes, checkpoint_kind, decision_id), and writeArtifact the CHECKPOINT-<PP> suffix again. Route this write through s.writeArtifact (DUR-06 — never raw node:fs). Per D-06: when args.answer is supplied but awaitingDecision is true (stale/non-matching decision_id), ignore the answer — do not persist it and do not throw.

SEQUENCING NOTE (R-1): as in task 1, the full suite is NOT run here — the four stale auto-resume tests still encode the old behaviour and are only updated in task 3. This task's verify is syntax + grep only; the single full-suite run happens in task 3 after all test updates land.</action>
<verify>node --check lib/execute.js && grep -nE 'checkpoint_kind: cp.checkpoint_kind|decisionIdFor\(p.id, cp.last_completed_task\)|human answered|human_answer' lib/execute.js</verify>
<acceptance_criteria>
- grep -n "checkpoint_kind: cp.checkpoint_kind" lib/execute.js exits 0 (kind persisted from executor return)
- grep -n "decisionIdFor(p.id, cp.last_completed_task)" lib/execute.js exits 0 (decision_id persisted)
- grep -n "human answered" lib/execute.js exits 0 (binding line appended on resume)
- grep -n "human_answer" lib/execute.js exits 0 (persistence field present)
- node --check lib/execute.js exits 0
- the full suite is NOT run here (deferred to task 3) so it cannot stall on the stale auto-resume tests
</acceptance_criteria>
<done>Decision checkpoint persists its kind + decision_id; a supplied answer is validated, bound into the resume prompt, and persisted as human_answer; stale answers are ignored without error.</done>
</task>
<task type="auto">
<name>Task 3: Update existing auto-resume tests, add the conversational UAT test matrix, and run the full suite (single suite gate)</name>
<files>test/tools.test.mjs</files>
<read_first>test/tools.test.mjs</read_first>
<action>In test/tools.test.mjs:

(A) Extend the fake executor in makeSubagents so its structured checkpoint return (line 95) also includes checkpoint_kind (use "decision" by default). Keep the existing write-SUMMARY-when-CHECKPOINT-exists behaviour (which now only triggers on real resume since awaiting plans are never spawned by the orchestrator).

(B) Add two fixtures near CHECKPOINT_FM (line 68): CHECKPOINT_ANSWERED = CHECKPOINT_FM plus two lines "decision_id: 01-auth-01-ck1" and "human_answer: use pg" (a checkpoint that auto-resumes via the persisted answer, D-04); and CHECKPOINT_DECISION = CHECKPOINT_FM plus "checkpoint_kind: decision" and "decision_id: 01-auth-01-ck1" (a pending decision awaiting an answer).

(C) Update these existing tests that previously auto-resumed a seeded CHECKPOINT without an answer (they would now hit the awaiting gate and fail — R-1): (i) "--gaps-only runs only the plans with gap_closure true" (line 188): seed CHECKPOINT_ANSWERED instead of CHECKPOINT_FM so the plan resumes via the persisted human_answer; (ii) "resumes a checkpointed plan from the last completed task (DUR-02/D-04)" (line 271): seed CHECKPOINT_DECISION and call t.execute({phase:1, answer:"use pg", decision_id:"01-auth-01-ck1"}, exec), then additionally assert the captured prompt matches /human answered 01-auth-01-ck1 = use pg/; (iii) "a completed SUMMARY wins over a stale CHECKPOINT" (line 292): seed CHECKPOINT_ANSWERED so the plan resumes and the cleanup path is still exercised (keep the removeArtifact spy); (iv) "resume path carries the resumed plan id as the window checkpoint reference (D-07)" (line 241): make the second run call t.execute({phase:1, answer:"use pg", decision_id:"01-auth-01-ck1"}, exec) so it resumes and writes the second window.

(D) Add new tests in the gsd_execute describe block: (1) awaiting marker returned and executor NOT spawned: seed CHECKPOINT_DECISION, reset executeSpawnCount to 0, call t.execute({phase:1}, exec), assert res matches /GSD_AWAITING_HUMAN: plan .* \(checkpoint:decision\)/ and /decision_id=01-auth-01-ck1/ and /question=/ and executeSpawnCount === 0 (D-05), and no SUMMARY written; (2) answer + matching decision_id resumes with binding and completes: seed CHECKPOINT_DECISION, call with answer+"use pg"+decision_id, assert executeCaptured[0] matches /human answered 01-auth-01-ck1 = use pg/ and /begin at task 2/, SUMMARY written, res matches /01-auth-01 ✓/ (D-03/UAT-02); (3) human_answer persisted into CHECKPOINT frontmatter: after (2), readArtifact CHECKPOINT-01, parseFrontmatter, assert human_answer === "use pg" and decision_id === "01-auth-01-ck1" (D-04); (4) context-reset resume from stored human_answer: seed CHECKPOINT_ANSWERED, call t.execute({phase:1}) with NO args, assert res matches /01-auth-01 ✓/ and executeCaptured[0] matches /human answered 01-auth-01-ck1 = use pg/ (D-04); (5) stale decision_id ignored, no error, stays awaiting: seed CHECKPOINT_DECISION, call t.execute({phase:1, answer:"x", decision_id:"nope"}, exec), assert it resolves (no throw) and res matches /GSD_AWAITING_HUMAN/ and executeSpawnCount === 0 (D-06); (6) D-07 single path for all three kinds: loop checkpoint_kind over ["decision","human-action","human-verify"], for each seed a CHECKPOINT with that kind + decision_id and assert the awaiting marker names the kind and the answer+decision_id resume completes. Keep the existing corrupt-checkpoint fail-loud test (line 284) green unchanged (it must still reject on out-of-range last_completed_task).

This is the SINGLE full-suite gate (R-1): task 1 and task 2 intentionally did not run the suite because the stale auto-resume expectations were still present. Now that every stale test is updated and the matrix is added, run the entire gsd_execute + mount suite to prove the phase holds together end-to-end. If any pre-existing unrelated test fails, it is a pre-existing regression to note in the SUMMARY, not a blocker for this plan.</action>
<verify>node --test test/tools.test.mjs test/mount.test.mjs</verify>
<acceptance_criteria>
- node --test test/tools.test.mjs test/mount.test.mjs exits 0 (all updated + new tests pass; mount tool-count regression R-5 preserved)
- grep -n "GSD_AWAITING_HUMAN" test/tools.test.mjs exits 0 (marker assertions present)
- grep -n "human answered" test/tools.test.mjs exits 0 (binding assertions present)
- grep -n "human_answer" test/tools.test.mjs exits 0 (persistence assertion present)
- grep -n "checkpoint_kind" test/tools.test.mjs exits 0 (kind/D-07 assertions present)
- the corrupt-checkpoint test still passes (regression, R-2 preserved)
</acceptance_criteria>
<done>The gsd_execute suite covers awaiting (no-spawn), answer resume + binding, human_answer persistence, context-reset resume, stale-answer ignore, and the single path across all three checkpoint kinds; existing tests that relied on auto-resume-without-answer are updated to the D-05 semantics; the full suite passes once.</done>
</task>
<task type="auto">
<name>Task 4: Record the D-01..D-07 to automated-test mapping in VALIDATION.md (Nyquist gate)</name>
<files>.planning/phases/GSD-07-uat-conversation/VALIDATION.md</files>
<read_first>.planning/phases/GSD-07-uat-conversation/GSD-07-uat-conversation-02-PLAN.md</read_first>
<action>Write the Nyquist coverage artefact for the phase at .planning/phases/GSD-07-uat-conversation/VALIDATION.md (the phase root, alongside CONTEXT.md/RESEARCH.md). It is a plain Markdown file that records, for every locked decision D-01..D-07 in CONTEXT.md, the named automated test(s) in test/tools.test.mjs and test/_shared.test.mjs that prove it, plus the phase-goal truths they back. Structure:

- A "## Nyquist Coverage" heading followed by a short statement that nyquist_validation is enabled (.planning/config.json) and every new behaviour in this phase has a named automated test, with no 3-consecutive-task window lacking coverage.
- A markdown table with columns | Decision | Automated test(s) | File |, one row per D-NN. Map D-01 -> the awaiting-marker test (task 3 D-1, marker names plan id + kind + decision_id + question) and awaitingMarker unit tests (plan 01 task 3); D-02 -> the grep assertion that lib/execute.js contains no "ask_user_question" (task 1) plus the marker-handoff-only design note; D-03 -> the answer+decision_id resume/binding tests (task 3 D-2 and plan 01 decisionIdFor/awaitingDecision units); D-04 -> the human_answer persistence + context-reset resume tests (task 3 D-3 and D-4); D-05 -> the awaiting-no-spawn + no-SUMMARY tests (task 3 D-1) and awaitingDecision awaiting units; D-06 -> the stale-decision_id-ignored test (task 3 D-5) and awaitingDecision non-matching units; D-07 -> the three-kind single-path loop test (task 3 D-6) and awaitingMarker three-kind units.
- A "## Task coverage" subsection listing each task of plans 01 and 02 with the verify command that guards it (e.g. node --test test/_shared.test.mjs, node --test test/tools.test.mjs), asserting every task's verify is an automated command and no 3-consecutive-task window is uncovered.
- A final line stating the full-suite gate command: node --test test/tools.test.mjs test/mount.test.mjs, and that it passed in task 3.

Do not fabricate test names — use exactly the test descriptions/assertion labels written in task 3 (D) 1-6 and plan 01 task 3. This artefact is a plan deliverable (Nyquist dimension 8) and is NOT produced by harness validation tooling.</action>
<verify>test -f .planning/phases/GSD-07-uat-conversation/VALIDATION.md && grep -nE 'D-0[1-7]' .planning/phases/GSD-07-uat-conversation/VALIDATION.md && grep -n "Nyquist" .planning/phases/GSD-07-uat-conversation/VALIDATION.md</verify>
<acceptance_criteria>
- test -f .planning/phases/GSD-07-uat-conversation/VALIDATION.md exits 0 (artefact created at the phase root)
- grep -nE 'D-0[1-7]' .planning/phases/GSD-07-uat-conversation/VALIDATION.md exits 0 and every locked decision D-01..D-07 appears in the mapping table
- grep -n "Nyquist" .planning/phases/GSD-07-uat-conversation/VALIDATION.md exits 0 (Nyquist coverage heading present)
- grep -n "node --test test/tools.test.mjs test/mount.test.mjs" .planning/phases/GSD-07-uat-conversation/VALIDATION.md exits 0 (full-suite gate recorded)
</acceptance_criteria>
<done>VALIDATION.md exists at the phase root and maps every locked decision D-01..D-07 to its named automated test(s), plus a task-coverage record proving no 3-consecutive-task window lacks an automated verify (Nyquist dimension 8 satisfied).</done>
</task>
</tasks>
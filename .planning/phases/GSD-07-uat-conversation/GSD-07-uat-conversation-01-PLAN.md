---
phase: 07-uat-conversation
plan: 01
type: execute
wave: 1
depends_on: []
files_modified: ["lib/_agents.js", "lib/_shared.js", "test/_shared.test.mjs"]
autonomous: true
requirements: ["UAT-01", "UAT-02"]
user_setup: []
must_haves:
  truths:
    - "The executor's structured checkpoint return names the decision kind (checkpoint_kind ∈ {decision, human-action, human-verify}), so a marker can tell the driving agent what kind of decision awaits."
    - "For a decision/human-action checkpoint the executor phrases checkpoint_reason as the human-facing question, so the awaiting marker surfaces an exact question."
    - "Pure helpers exist (decisionIdFor, awaitingDecision, awaitingMarker) that gate, bind, and format the conversational UAT handoff, with unit tests proving D-05 (await until answered), D-06 (stale answer ignored), D-03/D-04 (answer binding + persistence readiness)."
  artifacts:
    - path: "lib/_shared.js"
      provides: "Pure conversational-UAT helpers: deterministic per-checkpoint decision_id, the awaiting predicate, and the stable GSD_AWAITING_HUMAN marker formatter."
      min_lines: 30
      exports: ["decisionIdFor", "awaitingDecision", "awaitingMarker"]
    - path: "lib/_agents.js"
      provides: "Extended EXECUTOR_PROMPT checkpoint contract that instructs the executor to also return checkpoint_kind and to phrase checkpoint_reason as the question."
      min_lines: 170
      exports: ["EXECUTOR_PROMPT"]
  key_links:
    - from: "lib/_agents.js"
      to: "lib/execute.js"
      via: "EXECUTOR_PROMPT now declares the checkpoint_kind return key that gsd_execute reads from r.structured.checkpoint and persists into the CHECKPOINT frontmatter."
      pattern: "checkpoint_kind"
    - from: "lib/_shared.js"
      to: "lib/execute.js"
      via: "The three exported helpers (decisionIdFor/awaitingDecision/awaitingMarker) are imported by gsd_execute to gate, bind, and format the answer handoff."
      pattern: "decisionIdFor|awaitingDecision|awaitingMarker"
---
<objective>Extend the executor checkpoint contract to surface the decision kind and the human-facing question, and add the three pure helpers (decision_id generator, awaiting predicate, marker formatter) that the gsd_execute wiring in plan 02 will consume. Delivers the decision-surface half of UAT-01 and the reusable predicate/binding machinery behind UAT-02.</objective>
<context>
@lib/_agents.js — EXECUTOR_PROMPT structured-checkpoint contract (line ~158: keys plan, last_completed_task, checkpoint_reason, committed_hashes; the checkpoint: stop instruction). Do not change the checkpoint stop behaviour — only add the kind field and the question-phrasing note.
@lib/_shared.js — decision-helpers section (after isClosedPhase, ~line 367). Add the three helpers here per the RESEARCH.md architectural responsibility map (pure, domain tier, unit-tested in test/_shared.test.mjs).
@test/_shared.test.mjs — existing regression tests + import block; add a new describe block for the three helpers, following the established test style.
@CONTEXT.md — D-01 (marker names the decision kind + exact question), D-03 (decision_id identifier), D-04 (human_answer persistence), D-05 (await until answered), D-06 (stale answer ignored), D-07 (single path for all three kinds). RQ-2 resolves the question = checkpoint_reason.
</context>
<tasks>
<task type="auto">
<name>Task 1: Extend EXECUTOR_PROMPT to return checkpoint_kind and phrase the reason as the question (tracer)</name>
<files>lib/_agents.js</files>
<read_first>lib/_agents.js</read_first>
<action>In lib/_agents.js, inside the EXECUTOR_PROMPT template string, locate the checkpoint-instruction sentence that names the structured return keys (the text listing "plan", "last_completed_task", "checkpoint_reason", "committed_hashes" as the object the executor returns when it hits a checkpoint task). Extend that key list with a fifth key "checkpoint_kind", and add one clause stating it must be exactly one of the strings "decision", "human-action", or "human-verify", derived from the "type" attribute of the checkpoint task the executor stopped at (matching the existing line-100 classification human-verify|decision|human-action). In the same instruction, add one sentence: for checkpoint:decision and checkpoint:human-action tasks, phrase "checkpoint_reason" as the human-facing question the orchestrator surfaces verbatim to the human (per RQ-2). Per D-01 (marker must name the decision kind and the exact question). Do NOT alter the checkpoint stop semantics (still return the structured object and stop; still do not proceed to later tasks). Do not change any other part of the prompt.</action>
<verify>node --check lib/_agents.js && grep -n "checkpoint_kind" lib/_agents.js</verify>
<acceptance_criteria>
- grep -n "checkpoint_kind" lib/_agents.js exits 0 and the line names the three kinds decision, human-action, human-verify
- the prompt text still contains "plan", "last_completed_task", "checkpoint_reason", "committed_hashes" in the same checkpoint-instruction block
- node --check lib/_agents.js exits 0
- the instruction contains a clause that for decision/human-action checkpoints checkpoint_reason should be phrased as the human-facing question
</acceptance_criteria>
<done>EXECUTOR_PROMPT instructs executors to return checkpoint_kind and to phrase checkpoint_reason as the question; syntax check passes; grep confirms the new key.</done>
</task>
<task type="auto">
<name>Task 2: Add decisionIdFor, awaitingDecision, awaitingMarker pure helpers to lib/_shared.js</name>
<files>lib/_shared.js</files>
<read_first>lib/_shared.js</read_first>
<action>In lib/_shared.js, in the "decision helpers (pure — unit-tested)" section directly after the existing isClosedPhase export (currently around line 367), add three exported functions with exactly these signatures and semantics:

- export function decisionIdFor(planId, lastCompletedTask): returns the string `${planId}-ck${lastCompletedTask}`. Deterministic, unique per plan+checkpoint, no RNG (per RQ-3/D-03).

- export function awaitingDecision(checkpointFm, answer, decisionId): pure boolean predicate for the awaiting gate (per RQ-4 / D-05 / D-04 / D-06). Returns false (NOT awaiting — resume) when either (a) checkpointFm.human_answer is a non-empty string after String(...).trim(), OR (b) answer is a non-empty string after trim() AND decisionId is a non-null/non-empty string AND decisionId === checkpointFm.decision_id. Otherwise returns true (awaiting — no answer available). Guard checkpointFm being null/undefined by defaulting to {}. A non-matching decision_id, or an answer with no decision_id, or a missing stored decision_id all yield true (awaiting) — that is D-06's stale-answer-is-ignored behaviour.

- export function awaitingMarker({ plan, decision_id, kind, question }): returns the stable marker line string with EXACTLY this shape — a single line starting with "GSD_AWAITING_HUMAN: plan " then the plan id, then " awaits your decision (checkpoint:", then kind, then "); decision_id=", then decision_id, then "; question=", then question. Example shape: GSD_AWAITING_HUMAN: plan GSD-07-uat-conversation-01 awaits your decision (checkpoint:decision); decision_id=GSD-07-uat-conversation-01-ck1; question=Which db?. The marker MUST contain the literal substring "checkpoint" (the existing DUR-01 test asserts /checkpoint/ on gsd_execute output). Escape nothing; return the raw interpolated line. Per D-01 (stable, regex-recognizable marker naming plan id, decision kind, decision_id, and exact question).

Use the existing stringifyFrontmatter / parseFrontmatter conventions for value coercion only if needed; the helpers must not write any files and must not touch ctx.fs. Per DUR-06, do NOT introduce raw node:fs — these are pure functions.</action>
<verify>node --check lib/_shared.js && grep -nE "export function (decisionIdFor|awaitingDecision|awaitingMarker)" lib/_shared.js</verify>
<acceptance_criteria>
- grep -nE "export function (decisionIdFor|awaitingDecision|awaitingMarker)" lib/_shared.js exits 0 and matches all three names
- node --check lib/_shared.js exits 0
- awaitingDecision({human_answer:"use pg"}, "", "") is false
- awaitingDecision({decision_id:"p-ck1"}, "use pg", "p-ck1") is false
- awaitingDecision({decision_id:"p-ck1"}, "", "") is true
- awaitingDecision({decision_id:"p-ck1"}, "use pg", "WRONG") is true  (D-06)
- awaitingDecision({decision_id:"p-ck1"}, "use pg", "") is true
- awaitingMarker({plan:"GSD-07-uat-conversation-01", decision_id:"GSD-07-uat-conversation-01-ck1", kind:"decision", question:"Which db?"}) includes "GSD_AWAITING_HUMAN: plan GSD-07-uat-conversation-01" and "checkpoint:decision" and "decision_id=GSD-07-uat-conversation-01-ck1" and "question=Which db?"
</acceptance_criteria>
<done>Three exported pure helpers exist in lib/_shared.js with the specified semantics; syntax check passes; grep confirms the exports.</done>
</task>
<task type="auto">
<name>Task 3: Unit-test the three helpers in test/_shared.test.mjs</name>
<files>test/_shared.test.mjs</files>
<read_first>test/_shared.test.mjs</read_first>
<action>In test/_shared.test.mjs, add decisionIdFor, awaitingDecision, and awaitingMarker to the existing import block from "../lib/_shared.js" (the block starting around line 7). Append a new top-level describe block titled "conversational UAT helpers (D-01/D-03/D-04/D-05/D-06)" with these tests, using assert.strict:

- decisionIdFor("GSD-07-uat-conversation-01", 1) === "GSD-07-uat-conversation-01-ck1"; and decisionIdFor("x", 3) === "x-ck3" (deterministic, index-suffixed).
- awaitingDecision: (a) returns false when human_answer is a non-empty string and no args are passed (persisted-answer context-reset resume, D-04); (b) returns false when a matching answer+decision_id are passed (D-03); (c) returns true when no answer and no decision_id are passed (awaiting, D-05); (d) returns true when a decision_id is passed that does not match the stored one (stale answer ignored, D-06); (e) returns true when an answer is passed with no decision_id (D-06); (f) returns true when checkpointFm is null/undefined (defensive default).
- awaitingMarker: assert the returned string starts with "GSD_AWAITING_HUMAN: plan ", contains "checkpoint:decision", contains "decision_id=" + the decision_id, contains "question=" + the question, and contains the literal substring "checkpoint". Assert each of the three kinds (decision, human-action, human-verify) interpolates its kind into "checkpoint:<kind>" (D-07 single marker shape).

Keep the test file green: do not modify existing tests.</action>
<verify>node --test test/_shared.test.mjs</verify>
<acceptance_criteria>
- node --test test/_shared.test.mjs exits 0 (all existing + new tests pass)
- grep -n "decisionIdFor" test/_shared.test.mjs and grep -n "awaitingDecision" and grep -n "awaitingMarker" all exit 0 (imports + uses present)
- the new describe block "conversational UAT helpers" is present
</acceptance_criteria>
<done>The three helpers are unit-tested and the full _shared suite passes; the D-05/D-06/D-03/D-04/D-07 semantics are pinned by assertions.</done>
</task>
</tasks>

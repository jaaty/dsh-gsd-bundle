---
phase: 07-uat-conversation
plan: 02
subsystem: gsd_execute conversational UAT loop wiring
tags: [uat, conversational-loop, awaiting-marker, answer-binding, human_answer-persistence, decision-id]
requires:
  - GSD-07-uat-conversation-01
provides: []
affects: [lib/execute.js, test/tools.test.mjs, .planning/phases/GSD-07-uat-conversation/VALIDATION.md]
tech-stack: [node, esm, node:test, dsh-tools]
key-files:
  created:
    - .planning/phases/GSD-07-uat-conversation/VALIDATION.md
  modified:
    - lib/execute.js
    - test/tools.test.mjs
decisions:
  - D-01 marker names plan + decision kind + decision_id + exact question (checkpoint_reason)
  - D-02 no inline blocking prompt in gsd_execute — marker handoff is the only channel
  - D-03 answer + matching decision_id binds "RESUME from checkpoint: human answered <id> = <answer>" into the resume prompt
  - D-04 human_answer persisted into CHECKPOINT frontmatter so a context-reset resume carries it
  - D-05 an unanswered checkpoint is NOT executed: GSD_AWAITING_HUMAN marker returned, no executor spawned
  - D-06 stale/non-matching decision_id ignored with no error and the plan stays awaiting
  - D-07 decision/human-action/human-verify share one marker->answer path
metrics:
  duration: ~12m
  completed: 2026-08-24
status: complete
actuals:
  tasks: 4
  commits: 4
---

# Phase 07 Plan 02: Conversational UAT Loop in gsd_execute — Summary

Wires the conversational UAT loop into gsd_execute: adds the optional
`answer`/`decision_id` args, gates a checkpointed plan into an awaiting
(marker, no-spawn) state until a human answer is available, binds the human
answer into the resume prompt, persists both the decision_id/kind and the
human_answer into the CHECKPOINT artefact, and records the D-01..D-07 → test
mapping in VALIDATION.md (Nyquist gate).

## What was built

- **`lib/execute.js`** — gsd_execute now:
  - accepts two optional params `"answer"` and `"decision_id"` alongside
    `phase`/`wave`/`gapsOnly` (D-03/D-06);
  - reads the CHECKPOINT-<PP> frontmatter and computes an **awaiting gate** via
    the plan-01 helper `awaitingDecision(checkpointFm, answer, decision_id)`.
    When a checkpoint exists and no human answer is available (neither a matching
    answer+decision_id on this call nor a persisted human_answer), the plan is
    **not dispatched** — gsd_execute returns a `GSD_AWAITING_HUMAN: plan …
    (checkpoint:<kind>); decision_id=…; question=…` marker line and spawns no
    executor (D-05). Markers are appended to the log outside the dispatch
    Promise.all; completed/checkpointed log lines stay intact (R-2);
  - on a resumable (answered) checkpoint, binds
    `RESUME from checkpoint: human answered <decision_id> = <answer>` into the
    executor prompt (D-03) — the answer text comes from this call's matching
    answer or the persisted human_answer (D-04);
  - persists the executor's `checkpoint_kind` and a deterministic `decision_id`
    (`decisionIdFor(p.id, last_completed_task)` → `01-auth-01-ck1`) into the
    CHECKPOINT frontmatter at checkpoint time (RQ-3/D-03/D-07);
  - when this call supplies a matching answer, writes `human_answer` into the
    CHECKPOINT frontmatter via `s.writeArtifact` before dispatch (D-04, DUR-06 —
    never raw node:fs). A stale/non-matching decision_id is ignored with no
    error (D-06, handled by the awaiting gate). No inline blocking prompt was
    added (D-02).
- **`test/tools.test.mjs`** — the fake executor now returns `checkpoint_kind`;
  two fixtures `CHECKPOINT_DECISION` and `CHECKPOINT_ANSWERED` were added; the
  four tests that previously auto-resumed a seeded checkpoint without an answer
  were updated to the D-05 semantics (supply the answer or seed an answered
  checkpoint); and six new tests cover the awaiting-no-spawn marker, answer
  resume + binding, human_answer persistence, context-reset resume, stale-id
  ignore, and the single three-kind path (D-07). The corrupt-checkpoint
  fail-loud test is unchanged and green.
- **`.planning/phases/GSD-07-uat-conversation/VALIDATION.md`** — Nyquist coverage
  artefact mapping every locked decision D-01..D-07 to its named automated
  test(s), plus a per-task verify table proving no 3-consecutive-task window
  lacks an automated check.

## Verification

- `node --check lib/execute.js` exits 0 (after each edit).
- Task-1 greps: `"answer"`/`"decision_id"` in parameters, `awaitingDecision`
  present, and no literal `ask_user_question` in lib/execute.js (D-02).
- Task-2 greps: `checkpoint_kind: cp.checkpoint_kind`, `decisionIdFor(p.id,
  cp.last_completed_task)`, `human answered`, `human_answer` all present.
- `node --test test/tools.test.mjs test/mount.test.mjs` → 39 pass / 0 fail
  (single suite gate, R-1/R-5).
- `npm test` (full bundle) → 110 pass / 0 fail (up from 104; +6 new, no
  regressions).

## Known Stubs

None. No TODO/FIXME/placeholder/skipped tests introduced.

## Threat Flags

None. The only new persistence is the `human_answer` field written into the
existing CHECKPOINT artefact through `s.writeArtifact` (the gsdState artefact
model / `ctx.fs`) — no raw `node:fs` introduced, no secrets, no privileged I/O.
No new dependencies (empty `dependencies` map preserved).

## Self-Check: PASSED

Created `VALIDATION.md` (38 lines) exists; `lib/execute.js` (291 lines) exports
`apply`; all four commits exist on `phase-7`: `199a428` (args + awaiting gate),
`14b3dca` (binding + persistence), `3101393` (test matrix), `f8ceec1`
(VALIDATION.md). Full suite green at 110/110.

## TDD Gate Compliance

N/A — plan `type: execute` (not TDD). Tests were added alongside the wiring.

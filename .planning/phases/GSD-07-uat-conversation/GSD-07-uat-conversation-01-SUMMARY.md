---
phase: 07-uat-conversation
plan: 01
subsystem: executor-contract + pure uat-helpers
tags: [uat, checkpoint, conversational-loop, decision-id, awaiting-marker]
requires: []
provides:
  - GSD-07-uat-conversation-02
affects: [lib/_agents.js, lib/_shared.js, test/_shared.test.mjs]
tech-stack: [node, esm, node:test]
key-files:
  created: []
  modified:
    - lib/_agents.js
    - lib/_shared.js
    - test/_shared.test.mjs
decisions:
  - D-01 marker names decision kind + exact question (checkpoint_reason)
  - D-03 deterministic per-checkpoint decision_id via decisionIdFor
  - D-04 awaiting gate reads persisted human_answer (context-reset resume)
  - D-05 await until answered — awaitingDecision returns true with no answer
  - D-06 stale/non-matching decision_id ignored — awaitingDecision stays true
  - D-07 single marker shape for all three kinds (decision/human-action/human-verify)
metrics:
  duration: ~5m
  completed: 2026-08-24
status: complete
actuals:
  tasks: 3
  commits: 3
---

# Phase 07 Plan 01: Executor Contract + Conversational UAT Helpers Summary

Extends the executor checkpoint contract to surface the decision kind and the
human-facing question, and adds three pure helpers (`decisionIdFor`,
`awaitingDecision`, `awaitingMarker`) that gate, bind, and format the
conversational UAT handoff for plan 02's gsd_execute wiring.

## What was built

- **`lib/_agents.js`** — `EXECUTOR_PROMPT` structured-checkpoint contract now
  includes a fifth return key `checkpoint_kind` (exactly one of `decision`,
  `human-action`, `human-verify`, derived from the checkpoint task `type`), and
  instructs executors that for decision/human-action checkpoints the
  `checkpoint_reason` should be phrased as the human-facing question (D-01, RQ-2).
  The checkpoint stop semantics are unchanged.
- **`lib/_shared.js`** — three new exported pure helpers in the decision-helpers
  section:
  - `decisionIdFor(planId, lastCompletedTask)` → `${planId}-ck${lastCompletedTask}`
    (deterministic, no RNG; D-03/RQ-3).
  - `awaitingDecision(checkpointFm, answer, decisionId)` → awaiting predicate
    (false = resume) honoring persisted `human_answer` (D-04) and a matching
    `answer`+`decision_id` (D-03); stale/missing/mismatched ids stay awaiting
    (D-05, D-06). Defensive default for null/undefined `checkpointFm`.
  - `awaitingMarker({plan, decision_id, kind, question})` → the stable
    `GSD_AWAITING_HUMAN: ...` marker line naming plan id, `checkpoint:<kind>`,
    `decision_id=`, and `question=`; contains the literal substring `checkpoint`
    so the DUR-01 `/checkpoint/` assertion stays green (D-01, D-07).
- **`test/_shared.test.mjs`** — imports the three helpers and adds a
  "conversational UAT helpers (D-01/D-03/D-04/D-05/D-06)" describe block pinning
  every predicate/marker branch.

## Verification

- `node --check lib/_agents.js` and `node --check lib/_shared.js` exit 0.
- `grep -n "checkpoint_kind" lib/_agents.js` exits 0 and names the three kinds.
- `grep -nE "export function (decisionIdFor|awaitingDecision|awaitingMarker)"`
  matches all three.
- `node --test test/_shared.test.mjs` → 31 pass / 0 fail (10 new).
- `npm test` (full suite) → 104 pass / 0 fail (up from 94; +10 new, no regressions).

## Known Stubs

None. No TODO/FIXME/placeholder/skipped tests introduced.

## Threat Flags

None. The helpers are pure (no `ctx.fs`, no `node:fs`); the only change to
`lib/_agents.js` is prompt text. No new dependencies. No secrets or privileged
I/O involved.

## Self-Check: PASSED

Created files exist (modified `lib/_agents.js`, `lib/_shared.js`,
`test/_shared.test.mjs`); three commits exist on `phase-7`:
`13c59ec`, `0676492`, `09be81b`; full suite green.

## TDD Gate Compliance

N/A — plan `type: execute` (not TDD). Tests were added alongside the helpers.

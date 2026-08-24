# Phase 07: uat-conversation — Validation (Nyquist coverage)

## Nyquist Coverage

`nyquist_validation: true` is set in `.planning/config.json`. Every new behaviour
introduced by this phase (the conversational UAT loop) has a named automated
test, and no 3-consecutive-task window across plans 01 and 02 lacks an automated
verify command. Every locked decision D-01..D-07 is mapped to the test(s) that
prove it below.

| Decision | Automated test(s) | File |
|---|---|---|
| **D-01** (marker names plan + decision kind + decision_id + exact question) | `awaitingMarker` unit tests (plan 01 task 3); "(D-05/D-01) an unanswered decision checkpoint returns the awaiting marker and spawns no executor" asserts `GSD_AWAITING_HUMAN: plan .* \(checkpoint:decision\)`, `decision_id=01-auth-01-ck1`, `question=` | `test/_shared.test.mjs`, `test/tools.test.mjs` |
| **D-02** (no inline blocking prompt in gsd_execute — marker handoff only) | task-1 verify grep: `lib/execute.js` contains no literal `ask_user_question`; marker is the only human channel (design note in `lib/execute.js`) | `lib/execute.js` (grep gate) |
| **D-03** (answer + matching decision_id resumes, binds instruction) | `decisionIdFor` / `awaitingDecision` unit tests (plan 01 task 3); "(D-03/UAT-02) answer + matching decision_id resumes the plan with the answer bound and completes" asserts `human answered 01-auth-01-ck1 = use pg`; "resumes a checkpointed plan from the last completed task" asserts the same binding | `test/_shared.test.mjs`, `test/tools.test.mjs` |
| **D-04** (human_answer persisted; context-reset resume) | "(D-04) the human answer is persisted into the CHECKPOINT frontmatter" asserts `human_answer === "use pg"`; "(D-04) context-reset resume: a persisted human_answer resumes a checkpoint with no args" | `test/tools.test.mjs` |
| **D-05** (await, don't execute, until answered) | "(D-05/D-01) an unanswered decision checkpoint returns the awaiting marker and spawns no executor" asserts `executeSpawnCount === 0` and no SUMMARY; `awaitingDecision` awaiting units (plan 01 task 3) | `test/tools.test.mjs`, `test/_shared.test.mjs` |
| **D-06** (stale/non-matching decision_id ignored, no error, stays awaiting) | "(D-06) a stale/non-matching decision_id is ignored with no error and stays awaiting" asserts it resolves, returns `GSD_AWAITING_HUMAN`, spawns 0; `awaitingDecision` non-matching units (plan 01 task 3) | `test/tools.test.mjs`, `test/_shared.test.mjs` |
| **D-07** (single marker->answer path for all three kinds) | "(D-07) checkpoint:decision, human-action, and human-verify all share one marker->answer path" loops the await→answer→resume flow over all three kinds; `awaitingMarker` three-kind units (plan 01 task 3) | `test/tools.test.mjs`, `test/_shared.test.mjs` |

## Task coverage

Every task in plans 01 and 02 is guarded by an automated verify command, so no
3-consecutive-task window lacks coverage.

| Plan | Task | Verify command |
|---|---|---|
| 01 | Task 1 — executor checkpoint_kind contract | `node --check lib/_agents.js` + `grep -n "checkpoint_kind"` |
| 01 | Task 2 — pure helpers | `node --check lib/_shared.js` + export grep |
| 01 | Task 3 — helper unit tests | `node --test test/_shared.test.mjs` |
| 02 | Task 1 — args + awaiting gate + marker (tracer) | `node --check lib/execute.js` + args/awaiting/`ask_user_question` greps |
| 02 | Task 2 — binding + persistence | `node --check lib/execute.js` + kind/decision_id/human-answered greps |
| 02 | Task 3 — UAT test matrix (single suite gate) | `node --test test/tools.test.mjs test/mount.test.mjs` |
| 02 | Task 4 — this VALIDATION.md artefact | `test -f` + D-01..D-07 grep + Nyquist grep |

The full-suite gate for this phase is `node --test test/tools.test.mjs
test/mount.test.mjs`, which passed in plan-02 task 3 (39/39 in that pair, 0
fail), and the complete bundle suite `npm test` passed 110/110 with 0 fail.

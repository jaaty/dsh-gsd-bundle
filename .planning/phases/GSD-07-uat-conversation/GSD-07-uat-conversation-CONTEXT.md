# Phase 7: uat-conversation - Context

**Gathered:** 2026-08-24T05:00:59.504Z
**Status:** Ready for planning

<domain>
## Phase Boundary
**In scope:** Implement the conversational UAT loop: gsd_execute recognizes an executor checkpoint stop at a decision/human-action (and human-verify) task, persists the CHECKPOINT-<PP> artefact, returns an 'awaiting human decision' marker the driving agent uses to ask via ask_user_question, accepts the answer back as input (answer + decision_id), binds it into the resumed executor prompt, persists it in the CHECKPOINT frontmatter, and resumes the plan to completion. Delivers UAT-01 and UAT-02.
**Out of scope:** A real background-job runtime; capability gates; per-plan worktrees; intel mode; any inline blocking prompt inside gsd_execute (the marker handoff is the supported channel); non-checkpoint human interaction.
</domain>

<decisions>
## Decisions
### Question channel
- **D-01:** When an executor stops at a checkpoint:decision or checkpoint:human-action task, gsd_execute persists the CHECKPOINT-<PP> artefact and returns a distinct 'awaiting human decision' marker in its output (a stable marker line naming the exact question, the plan id, and the decision kind). The driving agent reads the marker, calls ask_user_question, then re-invokes gsd_execute with the answer.
- **D-02:** The phase does NOT inline-prompt from inside gsd_execute (no blocking on a host interaction primitive at tool level) — the human conversation is driven at the driving-agent level via the marker handoff.
### Answer binding
- **D-03:** gsd_execute gains two optional input args: 'answer' (the human's answer string) and 'decision_id' (an identifier for the pending decision so an answer can't be misapplied across checkpoints). When re-invoked with an answer matching a pending decision, it appends a 'RESUME from checkpoint: human answered <decision_id> = <answer>' instruction to the executor prompt before dispatching.
- **D-04:** The human's answer is also persisted into the CHECKPOINT-<PP> artefact frontmatter (a new 'human_answer' field), so a context-reset resume still carries it rather than losing it.
### Edge cases
- **D-05:** If a decision checkpoint is re-run with no answer provided (no matching answer/decision_id), gsd_execute returns the awaiting-human marker again and does NOT re-execute the plan.
- **D-06:** If an answer is passed but no decision is pending (no matching decision_id), it is ignored (no error) — stale answers don't break a normal run.
- **D-07:** checkpoint:human-verify behaves the same as checkpoint:decision and checkpoint:human-action — all three stop + await via the single shared marker->answer path (no separate acknowledgement-only branch).
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Existing checkpoint machinery
- `lib/_agents.js — executor checkpoint semantics (line 100: human-verify|decision|human-action -> autonomous:false; line 158: stop + return structured checkpoint object with plan/last_completed_task/checkpoint_reason/committed_hashes)`
- `lib/execute.js — phase-4 checkpoint persistence + resume (lines 103-115: hasArtifact CHECKPOINT-<PP>, readArtifact+parseFrontmatter, resumeInstr; lines 142-178: consume structured checkpoint, persist, reconcile job)`
- `lib/state.js — GsdState artefact API + parseFrontmatter/stringifyFrontmatter (CHECKPOINT-<PP> frontmatter to extend with answer)`
### Interaction channel + gsd_execute args
- `lib/execute.js parameters schema (line 39: phase, wave, gapsOnly) — the new optional 'answer' + 'decision_id' args go here`
- `The driving-agent ask_user_question primitive (host-level, not exposed to plugin tools) — the marker->handoff channel`
### Precedent / deferred intent
- `.planning/phases/GSD-04-checkpoint-resume/GSD-04-checkpoint-resume-CONTEXT.md — D-07 explicitly deferred the conversational UAT loop to a later milestone`
- `.planning/phases/GSD-05-window-ledger/GSD-05-window-ledger-CONTEXT.md — root-level accessor + CHECKPOINT-<PP> naming precedent`
</canonical_refs>

<code_context>
## Code Context
- gsd_execute is a tool invoked by the driving agent; it cannot block on an inline human answer — the human-interaction primitive (ask_user_question) lives at the driving-agent level, so the loop is a two-turn handoff.
- The executor already stops at checkpoint:decision / checkpoint:human-action and returns structured checkpoint state (lib/_agents.js:158).
- Phase-4 gsd_execute already persists CHECKPOINT-<PP> and resumes (append RESUME from checkpoint + prior context); this phase adds the answer arg + binding + marker return.
- The CHECKPOINT-<PP> artefact uses fenced frontmatter (parseFrontmatter/stringifyFrontmatter); the answer can be written into that frontmatter so a context-reset resume still carries it.
- gsd_execute output is a string (output.schema type string); the 'awaiting human decision' marker must be a recognizable substring the driving agent can detect (e.g. a stable marker line) while keeping the normal completion output intact.
</code_context>

<specifics>
## Specifics
- Executors honor checkpoint:decision and checkpoint:human-action tasks: stop, surface a human-facing question, do not proceed without an answer — UAT-01
- gsd_execute pauses at the checkpoint, waits for and captures the human's answer, resumes the plan with the answer applied, and the phase completes — UAT-02
</specifics>

<deferred>
## Deferred Ideas
- A real background-job runtime (registry-only manifest today) — separate milestone.
- Capability gates (security/broken-windows/TDD-audit on ship) — separate milestone.
- Per-plan git worktrees — out of scope.
- gsd_map_codebase --query intel mode — separate feature.
- A native in-tool inline-prompt channel (blocking ask inside gsd_execute) — not available in this DSH harness; the marker handoff is the supported path.
</deferred>


---

*Phase: 07-uat-conversation*
*Context gathered: 2026-08-24*
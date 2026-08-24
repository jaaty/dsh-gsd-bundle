# Phase 4: checkpoint-resume - Context

**Gathered:** 2026-08-23T23:59:19.931Z
**Status:** Ready for planning

<domain>
## Phase Boundary
**In scope:** Implement checkpoint state capture + resume in gsd_execute: persist a per-plan CHECKPOINT-<PP> artefact when an executor stops at a checkpoint: task, and allow gsd_execute to resume an interrupted plan from the last checkpoint (skip tasks 1..N, begin at N+1) rather than re-running from task 1. DUR-01 (executors honor checkpoint:* tasks) and DUR-02 (resume) are delivered via gsd_execute consuming the returned checkpoint state, writing the CHECKPOINT artefact, and adding a resume path.
**Out of scope:** The active conversational UAT loop that prompts a human for checkpoint decisions (deferred to a separate milestone); WINDOWS.md / async-jobs manifest (phase 05); capability gates; per-plan worktrees; intel mode.
</domain>

<decisions>
## Decisions
### Checkpoint persistence
- **D-01:** The executor persists a per-plan artefact <base>-<PP>-CHECKPOINT.md (YAML frontmatter: plan, last_completed_task, checkpoint_reason, committed hashes) alongside SUMMARY, via the existing writeArtifact('CHECKPOINT-<PP>'). It is durable on disk and readable by a later resume.
- **D-02:** A plan is considered 'checkpointed' when CHECKPOINT-<PP> exists but SUMMARY-<PP> does not. gsd_execute treats a checkpointed plan as resumable, not as incomplete-from-scratch.
### Resume skip semantics
- **D-03:** Resume skips by the recorded task index: the CHECKPOINT frontmatter's last_completed_task N means tasks 1..N are done; the resumed executor is told 'tasks 1..N are done, begin at N+1' with the checkpoint's recorded context. Deterministic and matches the executor's own task boundaries.
- **D-04:** The resumed executor prompt includes the prior checkpoint context (the CHECKPOINT.md frontmatter + the plan so far) so it does not re-read the whole phase from scratch; gsd_execute appends a 'RESUME from checkpoint' instruction to the executor prompt.
### Error handling
- **D-05:** If a CHECKPOINT artefact exists but fails to parse, or its last_completed_task is out of range for the plan's task count, gsd_execute fails loud with a named error (no silent re-run from task 1). Consistent with the bundle's fail-loud philosophy.
- **D-06:** A plan that has a SUMMARY (i.e. fully executed) takes precedence over any CHECKPOINT artefact: when both exist, SUMMARY wins and the plan is complete; stale CHECKPOINT files are ignored/cleaned by the orchestrator.
### Human-in-the-loop
- **D-07:** This phase handles checkpoint:human-verify / checkpoint:decision / checkpoint:human-action as 'stop, persist state, resume when a human proceeds'. The resume path exists, but the conversational UAT loop that actively asks the human is a separate later milestone — explicitly out of scope for phase 4.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Existing checkpoint semantics
- `lib/_agents.js — EXECUTOR_PROMPT checkpoint semantics (lines 158, 168: 'stop and return structured checkpoint state'); PLANNER_PROMPT autonomous:false rule (line 100)`
### gsd_execute + gsdState artefact plumbing
- `lib/execute.js — gsd_execute dispatch (only checks SUMMARY-<PP> via hasArtifact, no checkpoint consumption)`
- `lib/state.js — planIndex computes has_checkpoints (line 450); writeArtifact/readArtifact/hasArtifact/_artifactFile; zeroPad`
### Artefact schema + test harness
- `lib/_shared.js — parseFrontmatter/stringifyFrontmatter for the CHECKPOINT artefact frontmatter`
- `test/tools.test.mjs — makeSubagents canned-label pattern; test/helpers/project.mjs fixtures`
### Naming conventions
- `.planning/phases/GSD-03-loop-e2e/GSD-03-loop-e2e-VERIFICATION.md — project_code 'GSD' prefix context (the depends_on bug class we hit)`
- `.planning/phases/GSD-02-service-tools/GSD-02-service-tools-01-SUMMARY.md — round-trip patterns`
</canonical_refs>

<code_context>
## Code Context
- The executor prompt ALREADY tells the executor to stop and return structured checkpoint state on a checkpoint:* task — so the executor side of DUR-01 is largely present; the phase must make gsd_execute consume + persist it and resume.
- planIndex returns has_checkpoints (any non-autonomous plan); gsd_execute currently ignores it.
- Artefact naming: writeArtifact(cwd, phaseNum, 'CHECKPOINT-<PP>', content) maps via _artifactFile to <base>-<PP>-CHECKPOINT.md; readArtifact/hasArtifact symmetric.
- zeroPad helper for plan numbers; the checkpoint's last_completed_task should be validated against the plan's actual <task> count.
- The bundle uses fail-loud, named errors throughout (e.g. gsd_ship preflight); checkpoint-corrupt handling follows the same pattern.
- Tests use node --test + FakeFs + fake subagents (makeSubagents) to exercise real gsd_execute without LLM/git.
</code_context>

<specifics>
## Specifics
- Executors honor checkpoint:* tasks: return structured checkpoint state and stop, without running later tasks — DUR-01
- gsd_execute can resume an interrupted phase from a checkpoint (skip completed tasks, continue from the checkpoint) and the phase completes — DUR-02
</specifics>

<deferred>
## Deferred Ideas
- The conversational UAT loop that actively prompts a human for checkpoint decisions (checkpoint:decision / human-action) — separate later milestone.
- WINDOWS.md multi-window ledger + async-jobs manifest — phase 05 of this milestone.
- Capability gates (security/broken-windows/TDD-audit ship:pre etc.) — later milestone.
- Per-plan git worktrees — out of scope (shared tree + non-overlap).
- gsd_map_codebase --query intel mode — separate feature.
</deferred>


---

*Phase: 04-checkpoint-resume*
*Context gathered: 2026-08-23*
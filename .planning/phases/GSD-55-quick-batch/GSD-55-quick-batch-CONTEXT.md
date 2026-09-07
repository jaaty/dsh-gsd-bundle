# Phase 55: quick-batch - Context

**Gathered:** 2026-09-07T06:33:00.698Z
**Status:** Ready for planning

<domain>
## Phase Boundary
**In scope:** A new gsd_quick_batch tool plus a /gsd-quick-batch slash command that runs multiple quick tasks in a single batch, executing each task sequentially with its own fresh-context subagent, its own .planning/quick/<date>-<slug>/TASK.md record, and its own atomic commit, and returning a per-task result list with failure isolation (a failed task is recorded and the batch continues).
**Out of scope:** Parallel execution via the job runtime; a single batch-level record/commit; any change to the existing single-task gsd_quick behaviour; fast-mode (phase 56), mvp-phase (57), and node-repair (58).
</domain>

<decisions>
## Decisions
### API surface
- **D-01:** Add a new gsd_quick_batch tool and a /gsd-quick-batch slash command; leave gsd_quick single-task unchanged. Register a new gsdQuickBatch capability under the quick step (tools: [gsd_quick_batch], commands: [gsd-quick-batch]).
- **D-02:** The batch takes a required tasks array of { task: string, slug?: string } objects; each task is self-contained and independent.
### Execution model
- **D-03:** Run tasks sequentially: each task spawns one fresh-context subagent via spawnSubagent, runs to completion, and commits atomically before the next task starts. No job-runtime parallelism, avoiding working-tree/git collisions.
- **D-04:** Failure isolation: a failed task is recorded with its error in its own TASK.md and the batch continues to the next task; the tool returns a per-task result list with statuses (done/failed).
### Records & commits
- **D-05:** Reuse the existing record model: each task lands its own .planning/quick/<date>-<slug>/TASK.md via writeQuickRecord and its own atomic commit via commitArtifacts, exactly mirroring single gsd_quick.
- **D-06:** Derive each task's slug from its text (slugify(task) or the provided slug); if a slug collides within the batch, append a numeric suffix (-2, -3, ...) so records stay distinct.
- **D-07:** Add one decision line per task to the decision ledger (best-effort, consistent with single gsd_quick).
### Error handling & return
- **D-08:** Return a structured per-task result list (slug, status, output/error) plus a batch summary; do not throw on individual task failure.
- **D-09:** Throw if the gsdState or subagents service is unavailable (same guard as single gsd_quick); individual task spawn failures are caught and recorded as failed, not thrown.
### Claude's Discretion
- Exact wording of the per-task result summary and the TASK.md failure section
- Whether the batch tool also accepts a single task (treated as a one-item batch) or requires >=2
- Suffix format details for slug collisions
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Single-task quick implementation to mirror
- `lib/quick.js — the existing gsd_quick tool: spawnSubagent, writeQuickRecord, commitArtifacts, decision-line add`
### Subagent spawn helper
- `lib/_runner.js — spawnSubagent and cwdOf used by gsd_quick`
### Atomic commit seam
- `lib/_git-artifacts.js — commitArtifacts(cwd, null, { scope: 'quick', message })`
### Record model
- `lib/state.js — writeQuickRecord accessor writing .planning/quick/<date>-<slug>/TASK.md`
### Slash-command registration
- `lib/commands.js — the gsd-quick command entry to mirror for gsd-quick-batch`
### Capability registration
- `lib/_capabilities.js — gsdQuick capability block to mirror for gsdQuickBatch`
### Existing quick test pattern
- `test/service-tools.test.mjs — the gsd_quick describe block and canned quick subagent handler`
</canonical_refs>

<code_context>
## Code Context
- lib/quick.js provides the exact single-task template: QUICK_PROMPT, spawnSubagent call, writeQuickRecord, commitArtifacts with scope 'quick', and the best-effort addDecision.
- lib/_runner.js spawnSubagent returns { output } which gsd_quick records verbatim into TASK.md.
- lib/state.js writeQuickRecord is missing/parent-tolerant and routes through ctx.fs (DUR-06).
- lib/_git-artifacts.js commitArtifacts no-throws in project-less/non-repo workspaces, so the batch can reuse it per task.
- lib/commands.js and lib/_capabilities.js are the two registration points to extend for the new command and capability.
- test/service-tools.test.mjs shows the canned-subagent pattern (label.startsWith('quick')) used to test gsd_quick offline on FakeFs.
</code_context>

<specifics>
## Specifics
- Batch runs sequentially, one atomic commit per task, reusing the existing per-task TASK.md record convention.
- A failing task must not stop the rest of the batch; results are reported per task with done/failed statuses.
- The new tool/command/capability is additive; single-task gsd_quick behaviour is untouched.
</specifics>

<deferred>
## Deferred Ideas
- Parallel batch execution via the job runtime (gsd_job) — revisit if sequential throughput becomes a bottleneck.
- A single batch-level BATCH.md record — deliberately not chosen; per-task records stay consistent with the existing model.
- Fast-mode (phase 56), mvp-phase (57), node-repair (58) are separate phases.
</deferred>


---

*Phase: 55-quick-batch*
*Context gathered: 2026-09-07*
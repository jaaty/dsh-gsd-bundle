# Phase 14: execute-checkpoint - Context

**Gathered:** 2026-08-27T01:48:50.607Z
**Status:** Ready for planning

<domain>
## Phase Boundary
**In scope:** Extract the checkpoint prepare/process logic in lib/execute.js into helper functions in a new lib/_checkpoint.js module, and reuse the planIndex runnable set in the wave loop instead of re-deriving it. Strictly behavior-preserving refactor.
**Out of scope:** Any change to observable gsd_execute behavior, the SUMMARY-wins cleanup path, state.js planIndex internals, or the checkpoint helpers already in _shared.js.
</domain>

<decisions>
## Decisions
### Helper location & shape
- **D-01:** Extract the checkpoint prepare/process logic into a new lib/_checkpoint.js module. The helpers are exported functions that take the gsdState service (s) as a parameter, so they are unit-testable with a fake s. They are not added to _shared.js (which holds only pure helpers) and not left as local functions in execute.js.
### Prepare/process boundary
- **D-02:** The 'prepare' helper covers the pre-dispatch path: read+validate the CHECKPOINT-<PP> artefact (fail-loud on invalid last_completed_task), build the RESUME instruction, run the awaiting gate, and bind/persist a human answer. The 'process' helper covers only the post-dispatch structured checkpoint return: validate last_completed_task, persist the CHECKPOINT-<PP> artefact, and reconcile the job to done/checkpointed. The non-checkpoint SUMMARY-wins cleanup and its job reconcile stay inline in execute.js.
### Behavior preservation
- **D-03:** Strictly behavior-preserving refactor. No observable change to gsd_execute output, artefact writes, job/window records, or error messages. Existing integration tests in test/tools.test.mjs must stay green. No unrelated cleanups (e.g. the redundant .filter(p => !p.has_summary) on line 64 is left untouched).
### Runnable reuse
- **D-04:** Reuse the planIndex runnable set by intersecting idx.runnable with the wave's plans in execute.js (wavePlans.filter(p => idx.runnable.includes(p))). No change to state.js planIndex; no per-wave runnable is added.
### Testing
- **D-05:** Add direct unit tests for the extracted helpers (in test/_shared.test.mjs or a new test file) covering prepare (valid/invalid checkpoint, awaiting gate, answer binding) and process (persist + job reconcile). Existing gsd_execute integration tests must also stay green.
### Claude's Discretion
- Exact helper function names and signatures within lib/_checkpoint.js.
- How the new unit tests are organized (new file vs. appended to test/_shared.test.mjs).
- Whether the prepare helper returns a single object or separate values, as long as it preserves the current behavior.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### gsd_execute checkpoint prepare/process logic
- `lib/execute.js — the file being refactored; checkpoint prepare (lines 104-164), checkpoint process (lines 195-219), runnable re-derivation (line 91)`
### planIndex runnable set
- `lib/state.js — planIndex (lines 531-552) exposing { plans, waves, incomplete, runnable, has_checkpoints }`
### Existing checkpoint helpers
- `lib/_shared.js — decisionIdFor, awaitingDecision, awaitingMarker, resolvePlanDep`
### Integration tests that must stay green
- `test/tools.test.mjs — gsd_execute describe block (lines 214-333)`
### Unit test conventions
- `test/_shared.test.mjs — existing pure-helper unit tests`
</canonical_refs>

<code_context>
## Code Context
- gsdState service methods used by the helpers: readArtifact, writeArtifact, hasArtifact, removeArtifact, planIndex, updateJob, appendJob.
- planIndex returns { plans, waves, incomplete, runnable, has_checkpoints }; runnable is incomplete plans whose depends_on are all satisfied.
- Existing pure checkpoint helpers in _shared.js: decisionIdFor, awaitingDecision, awaitingMarker — reusable building blocks for the new module.
- resolvePlanDep (in _shared.js) is used for dependency resolution; the wave loop currently re-derives runnable with it.
</code_context>

<specifics>
## Specifics
- Extract the checkpoint prepare/process logic in gsd_execute into helpers and reuse the planIndex runnable set. (phase 14 goal, verbatim)
</specifics>

<deferred>
## Deferred Ideas
- Adding a per-wave runnable to state.js planIndex (rejected in favor of intersecting idx.runnable in execute.js).
- Folding the non-checkpoint SUMMARY-wins cleanup + job reconcile into the process helper (rejected; stays inline).
- Unrelated cleanups in execute.js such as the redundant .filter(p => !p.has_summary) on line 64.
</deferred>


---

*Phase: 14-execute-checkpoint*
*Context gathered: 2026-08-27*
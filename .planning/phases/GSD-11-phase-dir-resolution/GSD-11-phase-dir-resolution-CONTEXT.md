# Phase 11: phase-dir-resolution - Context

**Gathered:** 2026-08-27T00:12:45.105Z
**Status:** Ready for planning

<domain>
## Phase Boundary
**In scope:** Add a phaseDirAndBase(cwd, phaseNum) accessor returning {dir, base}. Refactor the artifact accessors (writeArtifact/readArtifact/hasArtifact/removeArtifact/listPlans) to resolve the phase dir and base once instead of re-deriving them. Update the phase tools (plan/execute/verify/ui/ship) to call phaseDirAndBase once and use dir/base directly instead of phaseDir + split('/').pop(). Fix listPlans to stop resolving the dir/base twice in one method. Pure refactor, no behavior change.
**Out of scope:** The other code-review findings (CQ-02 single-source constants, CQ-03 gate dispatch, CQ-04 execute checkpoint, CQ-05 ship robustness, CQ-06 context budget) belong to phases 12-16. No change to the roadmap/config read caching beyond this phase. No change to the phase-N fallback semantics.
</domain>

<decisions>
## Decisions
### API shape
- **D-01:** Add a phaseDirAndBase(cwd, phaseNum) accessor returning {dir, base}. Phase tools call it once and use dir/base directly instead of the current phaseDir + split('/').pop() pattern.
- **D-02:** Keep the public artifact accessors (writeArtifact/readArtifact/hasArtifact/removeArtifact/listPlans) callable with their current (cwd, phaseNum, ...) signatures. Internally they resolve dir/base once via phaseDirAndBase and route through a private _artifactPath(dir, base, suffix) helper, so no caller or test breaks.
### Error handling
- **D-03:** Keep the existing phase-N fallback: a phase number not present in the roadmap resolves to slug 'phase-N'. Preserve current behavior exactly; do not make it fail loud.
### Scope
- **D-04:** Include listPlans in this phase's cleanup: it currently calls phaseDir AND _phaseDirName a second time in the same method. Resolve dir/base once there too.
### Claude's Discretion
- Exact naming of the private _artifactPath helper and whether phaseDirAndBase is the best accessor name, as long as it returns {dir, base}.
- Whether the tools pass dir/base into the accessors or the accessors resolve internally, as long as the public signatures stay stable and the redundant reads are removed.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### GsdState service internals
- `lib/state.js — _phaseDirName (reads roadmap+config), phaseDir, _artifactFile, and the writeArtifact/readArtifact/hasArtifact/removeArtifact/listPlans accessors to refactor`
### Phase tool call sites
- `lib/plan.js, lib/execute.js, lib/verify.js, lib/ui.js, lib/ship.js — the repeated phaseDir.split('/').pop() base derivation to replace`
- `lib/core-tools.js — gsd_progress calls planIndex, which calls listPlans`
### Tests
- `test/state.test.mjs — exercises the artifact accessors and listPlans`
- `test/tools.test.mjs — exercises the phase tools that use the base derivation`
</canonical_refs>

<code_context>
## Code Context
- _phaseDirName(cwd, phaseNum) reads ROADMAP.md and config.json to compute the phase slug and project_code prefix.
- phaseDir(cwd, phaseNum) calls _phaseDirName and returns the phases/<NN>-<slug> path.
- _artifactFile(dir, base, suffix) maps a suffix like PLAN-01 to the <base>-01-PLAN.md filename.
- The pattern const base = phaseDir.split('/').pop() is copy-pasted in plan.js, execute.js, verify.js, and ui.js.
- listPlans calls phaseDir AND _phaseDirName a second time in the same method, so a single listPlans does 4 redundant reads of ROADMAP.md + config.json.
</code_context>

<specifics>
## Specifics
- Resolve the phase directory and base once per tool invocation and pass them down (phase goal).
- Removing the repeated readRoadmap/readConfig and the duplicated base derivation (phase goal).
</specifics>

<deferred>
## Deferred Ideas
- Memoizing _phaseDirName per (cwd, phaseNum) with invalidation on writeRoadmap/writeConfig is a broader caching concern, deferred beyond this phase.
- The other code-review findings (CQ-02..CQ-06) are separate phases 12-16.
</deferred>


---

*Phase: 11-phase-dir-resolution*
*Context gathered: 2026-08-27*
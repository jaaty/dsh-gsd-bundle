# Phase 6: loop-robustness - Context

**Gathered:** 2026-08-24T03:55:00.374Z
**Status:** Ready for planning

<domain>
## Phase Boundary
**In scope:** Fix the planner depends_on project-code-prefix bug (DUR-05): correct the PLANNER_PROMPT guidance to the prefixed id, add prefix-tolerant dependency resolution, fail loud on unresolvable depends_on. Fix gsd_quick's TASK.md write to route through a new GsdState quick-record accessor using ctx.fs (DUR-06).
**Out of scope:** A real background-job runtime; the conversational UAT loop; capability gates; per-plan worktrees; intel mode; any behavior change beyond the two bug fixes.
</domain>

<decisions>
## Decisions
### Bug 1 — depends_on prefix
- **D-01:** Correct the PLANNER_PROMPT depends_on guidance (lib/_agents.js:51) to the full prefixed plan id (project-code + <NN>-<slug>-<PP>, e.g. 'GSD-01-auth-01'), and update the PLAN_CHECKER_PROMPT Dimension 3 to validate depends_on against the prefixed id format.
- **D-02:** Add a normalization layer at dependency-resolution time (planIndex.runnable / gsd_execute) so a depends_on value that matches a plan id either exactly or modulo the project-code prefix resolves correctly. This is defensive against any residual LLM slip and fixes the wave-2-skip class of bug.
- **D-03:** After the fix, if a depends_on value still matches no plan id even after prefix-normalization, gsd_plan / gsd_execute fails loud with a named error rather than producing a silently-broken wave.
### Bug 2 — gsd_quick routing
- **D-04:** Add a GsdState quick-record accessor (e.g. writeQuickRecord(cwd, dateSlug, entry)) that routes the quick-task TASK.md write through ctx.fs, mirroring the phase-5 WINDOWS.md/async-jobs root-level accessor pattern. gsd_quick calls it instead of raw node:fs/promises.
- **D-05:** The quick-record path stays .planning/quick/<date>-<slug>/TASK.md; the accessor ensures the parent dir (through ctx.fs write semantics) and is missing/tolerant like the phase-5 accessors.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Planner depends_on guidance + checker
- `lib/_agents.js — PLANNER_PROMPT depends_on guidance (line 51: e.g. "01-auth-01") which omits the project-code prefix; PLAN_CHECKER_PROMPT Dimension 3 dependency correctness (line 118)`
### Plan id + dependency resolution
- `lib/state.js — _phaseDirName (lines 342-349) builds prefixed plan id (project_code + NN-slug); listPlans (392-427) reads depends_on at 415; planIndex runnable/dep resolution (444-448)`
### gsd_quick write path + accessor pattern
- `lib/quick.js — gsd_quick TASK.md write via raw node:fs/promises (lines 55-57), bypassing ctx.fs`
- `lib/state.js — phase-5 root-level accessor pattern readWindows/appendWindow/readJobs/appendJob/updateJob for the new quick-record accessor`
### Precedents
- `.planning/phases/GSD-05-window-ledger/GSD-05-window-ledger-VERIFICATION.md — the root-level-accessor precedent`
- `.planning/phases/GSD-02-service-tools/GSD-02-service-tools-VERIFICATION.md — flagged gsd_quick ctx.fs-bypass as a deferred finding`
</canonical_refs>

<code_context>
## Code Context
- The planner is an LLM subagent writing PLAN.md frontmatter; its depends_on instruction at lib/_agents.js:51 uses the non-prefixed example '01-auth-01', but the real plan id from _phaseDirName is project-code-prefixed (GSD-01-auth-01).
- planIndex.runnable resolves deps via plans.find((x) => x.id === d) (state.js:445-447) — exact match, so a non-prefixed depends_on never matches.
- gsd_quick writes TASK.md at .planning/quick/<date>-<slug>/TASK.md via node:fs/promises mkdir+writeFile (lib/quick.js:55-57), bypassing ctx.fs.
- Phase 5 added root-level GsdState accessors (readWindows/appendWindow/readJobs/appendJob/updateJob) — the pattern to imitate for a quick-record accessor.
- The bundle uses fail-loud, named errors; tests are node --test with FakeFs + fake subagents.
</code_context>

<specifics>
## Specifics
- The planner writes depends_on with the fully-prefixed plan id (project-code + phase + plan) so wave dependency resolution never misses a completed dependency — DUR-05
- gsd_quick routes its TASK.md write through the gsdState artefact model (ctx.fs) instead of bypassing it via raw node:fs/promises — DUR-06
</specifics>

<deferred>
## Deferred Ideas
- A real background-job runtime — out of scope (registry-only manifest in phase 5).
- The conversational UAT loop — separate later milestone.
- Capability gates — later milestone.
- Per-plan git worktrees — out of scope.
- gsd_map_codebase --query intel mode — separate feature.
</deferred>


---

*Phase: 06-loop-robustness*
*Context gathered: 2026-08-24*
# Phase 2: service-tools - Context

**Gathered:** 2026-08-23T07:19:18.214Z
**Status:** Ready for planning

<domain>
## Phase Boundary
**In scope:** Prove gsdState round-trips .planning/ artefacts across the full artefact surface with no data loss (MOUNT-03), and prove every gsd_* phase tool's execute() passes a smoke call (MOUNT-04) — gap-focused: the 5 untested tools (gsd_new_milestone, gsd_progress, gsd_quick, gsd_ui_phase, gsd_verify) get smoke calls, and the state round-trip test extends beyond PLAN/SUMMARY. Offline on FakeFs/fake-ctx; fail-loud guards asserted for infra-bound tools (gsd_ship, gsd_plan).
**Out of scope:** Re-proving schema-validity (shipped in phase 1); re-writing behavioral tests for the 6 already-tested tools; any live DSH boot; real git/gh execution; live LLM subagents; end-to-end phase loop run (phase 03); worktrees; capability gates; UAT loop; intel mode.
</domain>

<decisions>
## Decisions
### Scope boundary
- **D-01:** Phase 2 is gap-focused only. It does NOT re-prove schema-validity (shipped in phase 1) and does NOT re-write behavioral tests for the 6 already-tested tools (discuss/plan/execute/ship/status/map). It adds execute() smoke calls for the 5 untested tools (gsd_new_milestone, gsd_progress, gsd_quick, gsd_ui_phase, gsd_verify) and extends the gsdState round-trip to the full artefact surface.
- **D-02:** MOUNT-03 round-trip coverage: PROJECT, REQUIREMENTS, ROADMAP, STATE, config.json, plus every per-phase artefact (CONTEXT, RESEARCH, PLAN, SUMMARY, VERIFICATION) must write→read back with no data loss. This extends the existing PLAN/SUMMARY round-trip test in state.test.mjs.
### Smoke semantics
- **D-03:** Tools whose happy path cannot run on the fake host are smoked by asserting their fail-loud guard throws a clean, named error: gsd_ship preflight (no git/gh → 'gh CLI not available or not authenticated'), gsd_plan (LLM planner not f-able → spawn returns canned result and asserts a plan is produced OR asserts the guard for missing preconditions). Tools f-able on the fake host get a real success-path smoke returning an expected value.
- **D-04:** The existing fake-subagents service (makeSubagents pattern in test/tools.test.mjs) is reused for any smoke that spawns; no live LLM, no git/gh in phase 2 — all offline on FakeFs/fake-ctx.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### gsdState service + artefact round-trip
- `lib/state.js — class GsdState, writeArtifact/readArtifact/readState/writeState/readRoadmap/readProject/readConfig/initProject`
- `lib/_shared.js — parseFrontmatter/stringifyFrontmatter, parseRoadmap, parseRequirements`
### state round-trip test harness
- `test/state.test.mjs — existing round-trip tests to extend (writeArtifact PLAN/SUMMARY)`
- `test/helpers/fake-fs.mjs — FakeFs + stateCtx + realFsAdapter`
### Untested/partial tools
- `lib/core-tools.js — gsd_init/gsd_status/gsd_progress/gsd_new_milestone apply`
- `lib/quick.js — gsd_quick`
- `lib/ui.js — gsd_ui_phase`
- `lib/verify.js — gsd_verify`
- `lib/plan.js — gsd_plan (LLM subagent)`
- `lib/ship.js — gsd_ship (git/gh)`
### Phase 1 overlap boundary
- `test/mount.test.mjs — phase 1 already asserts schema-validity for all 12 tools + gsd_init smoke`
- `test/tools.test.mjs — 6 tools have behavioral execute tests (discuss/plan/execute/ship/status/map)`
### Deferral from phase 1
- `.planning/phases/GSD-01-live-mount/GSD-01-live-mount-VERIFICATION.md — explicitly deferred full MOUNT-04 'every tool execute smoke' to this phase`
</canonical_refs>

<code_context>
## Code Context
- GsdState exposes writeArtifact/readArtifact(key) with a per-artifact-type file mapping (PLAN-01 → <base>-01-PLAN.md etc.); tests pin this naming.
- state.test.mjs already round-trips PLAN and SUMMARY; the full artefact set (PROJECT, REQUIREMENTS, ROADMAP, STATE, config, CONTEXT, RESEARCH, VERIFICATION) is the gap.
- defineTool compiles schemas eagerly at apply(); phase 1 already proved schema-validity for all 12 tools — do NOT re-prove in this phase.
- gsd_ship preflight throws named errors (missing VERIFICATION, clean tree, branch, remote, gh); these are the fail-loud guards to smoke.
- gsd_plan/gsd_execute/gsd_verify spawn fresh-context subagents via ctx.get('subagents'); the fake subagents service returns canned results per label (test/tools.test.mjs makeSubagents pattern).
- The mount.test.mjs makeMountCtx already has ctx.effect invoking fn(), ctx.tools.register, ctx.commands.register, provide/get — reusable for new tool smokes.
</code_context>

<specifics>
## Specifics
- Prove the gsdState service round-trips .planning/ artefacts and every gsd_* phase tool registers with a valid schema and passes a smoke call — MOUNT-03, MOUNT-04
</specifics>

<deferred>
## Deferred Ideas
- Full live DSH boot / real session for loop-e2e — phase 03.
- Re-proving schema-validity for all 12 tools — already shipped in phase 1.
- Expanding behavioral coverage of the 6 already-tested tools beyond their current single-path tests — only if a later phase needs it.
- gsd_map_codebase --query intel mode — a separate milestone feature, not a loop step.
</deferred>


---

*Phase: 02-service-tools*
*Context gathered: 2026-08-23*
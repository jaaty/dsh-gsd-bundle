# Phase 1: live-mount - Context

**Gathered:** 2026-08-23T07:02:57.556Z
**Status:** Ready for planning

<domain>
## Phase Boundary
**In scope:** Prove the @dsh-gsd/bundle plugin set activates inside DSH: all 12 inserted plugin rows resolve their subpath exports and run their apply() to register the expected host contributions (persona section + context provider, gsdState service, all gsd_* tools, slash-commands), plus a minimal tool smoke call. Verification is an automated offline harness (fake host fs + fake ctx), not a live DSH boot. The patch merge over dsh-base is asserted by verifying each row's name resolves and apply() succeeds against the real lib/<plugin>.js modules.
**Out of scope:** No live DSH profile boot, no end-to-end phase loop run (phase 03 loop-e2e), no changes to the bundle's runtime behaviour or plugin modules themselves (this phase only adds harness/tests), no per-plan worktrees, no capability gates, no UAT loop, no intel mode.
</domain>

<decisions>
## Decisions
### Verification approach
- **D-01:** The mount is verified by an automated offline harness extending the existing FakeFs + fake-ctx infrastructure (test/helpers/fake-fs.mjs), NOT by a live DSH boot. Each of the 12 plugin modules is imported from lib/<name>.js and its apply() run against a fake ctx capturing what it registers (tools, systemPrompt sections, commands, provided services), then assertions confirm each row's expected contributions are present.
- **D-02:** The web profile already links @dsh-gsd/bundle and hosts this live GUI session; this phase must NOT touch, boot, or disrupt that profile. Verification is offline only.
- **D-03:** The 12 plugin rows are exactly the insert block in cordis.patch.yml (gsd-persona, gsd-state, gsd-core-tools, gsd-discuss, gsd-plan, gsd-execute, gsd-verify, gsd-ship, gsd-ui, gsd-quick, gsd-map-codebase, gsd-commands). The agent-loop override row is a config change, not a plugin row, and is asserted only for its presence.
### Scope boundary
- **D-04:** Phase 1 verifies activation + a single minimal smoke call only. It does NOT run a full loop step (gsd_status/gsd_discuss end-to-end) or the full test suite on a live mount; full-loop proof is phase 03. Smoke call = invoking one registered tool's execute() (or confirming schema registration) on the fake host.
- **D-05:** The patch-merge over dsh-base check is satisfied by (a) each plugin row's name matching a resolvable subpath export in package.json and (b) importing and apply()-ing each module succeeding on the fake host. A true dsh-base live merge is deferred; phase 1 asserts the offline preconditions.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### cordis.patch.yml rows
- `cordis.patch.yml — the agent-loop override + the 12 inserted plugin rows (gsd-persona … gsd-commands)`
### Plugin module contract
- `lib/persona.js — apply registers systemPrompt.section + context provider`
- `lib/state.js — class GsdState, ctx.provide('gsdState')`
- `lib/core-tools.js … lib/commands.js — each apply registers tools/commands; inject arrays per module`
### Subpath exports
- `package.json exports map — each lib/<name>.js maps to a @dsh-gsd/bundle/<name> subpath that a cordis.patch.yml row references`
### Offline test harness
- `test/helpers/fake-fs.mjs — FakeFs + stateCtx + realFsAdapter`
- `test/tools.test.mjs — existing fake-subagents apply/execute tests to extend`
- `test/helpers/project.mjs — buildProject + PLAN/SUMMARY fixtures`
### Host services consumed
- `.planning/codebase/INTEGRATIONS.md — inject arrays: tools, fs, systemPrompt, commands, subagents (spawn provider), gsdState`
</canonical_refs>

<code_context>
## Code Context
- Each plugin module follows the DSH/Cordis plugin contract: export { name, inject, apply } with apply(ctx, config) registering against host services.
- defineTool({name, description, parameters, output, execute, presentCall}) via ctx.tools.register is the only tool-definition API.
- The persona registers via ctx.systemPrompt.section('gsd:persona', {order:-100}, text) and ctx.systemPrompt.context('gsd:state', {order:10}, provider).
- state.js publishes gsdState via ctx.provide('gsdState', svc) and it is consumed via ctx.get('gsdState').
- The existing test harness drives real gsd_* tool executes with FakeFs + a fake subagents service (getProvider('spawn')) without LLM/git/gh.
- The bundle has no runtime deps; peer deps are @deepseek-ai/dsh-tools, schemastery, cordis, dsh-llm.
</code_context>

<specifics>
## Specifics
- Verify all 12 plugin rows activate and the patch merges cleanly over dsh-base — MOUNT-01
- gsd-persona installs the phase-loop system prompt section and the gsd:state runtime-context provider; every session orients at the current STATE.md position — MOUNT-02
</specifics>

<deferred>
## Deferred Ideas
- Live DSH boot / real session start with the bundle mounted (true end-to-end activation proof) — belongs to phase 03 loop-e2e or a later live-mount follow-up.
- Running the full node --test suite against a mounted profile — MOUNT-06 asserted in phase 01 only via offline harness if feasible, else deferred to phase 03.
- Rendering/UX of the mounted tools — deferred.
</deferred>


---

*Phase: 01-live-mount*
*Context gathered: 2026-08-23*
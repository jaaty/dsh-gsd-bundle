# Phase 23: removal-verification - Context

**Gathered:** 2026-08-29T01:13:20.140Z
**Status:** Ready for planning

<domain>
## Phase Boundary
**In scope:** Add an automated per-plugin removal test suite (DEGR-05): for each of the 5 role="step" loop plugins (discuss, plan, execute, verify, ship), prove the plugin can be retired with all six effects reverted and the remaining loop still functional end-to-end (render/routing coherence + offline-runnable smoke calls against a bootstrapped FakeFs project). The harness is driven generically from the capability table so any plugin row can be added to the matrix.
**Out of scope:** Actually removing/adding patch rows at runtime or live-booting a DSH host; changing production plugin behaviour (except extracting a shared test harness into test/helpers); adding new runtime apply-then-revert/dispose machinery; driven smoke calls of the execute/ship step tools (git/gh/subagent paths stay offline-only, present+registered assertions only); running the removal matrix over the non-step plugins (persona/state/core-tools/commands/map-codebase/optional ui/alternate quick) this milestone.
</domain>

<decisions>
## Decisions
### Removal matrix
- **D-01:** The per-plugin removal matrix targets exactly the 5 role:"step" loop plugins: gsdDiscuss, gsdPlan, gsdExecute, gsdVerify, gsdShip (per ROLES/TABLE in lib/_capabilities.js). These are the loop steps the milestone calls 'step plugins'.
- **D-02:** The harness must be generic and data-driven, not hardcoded to the 5: the matrix iterates a capability-key/plugin-row set derived from a single table (CAPABILITY_KEYS + patch rows) so any plugin row can be added to the suite with no structural change. This supports the user's stated goal that the whole GSD plugin bundle (every row) is swappable / customizable.
### Retirement model
- **D-03:** Retirement is modeled as never-apply / subset mount (the cordis-static profile reality): omit the retired plugin's apply() from the mount and assert none of its effects linger. No runtime apply-then-revert/dispose machinery is introduced.
### Effects-reverted surface
- **D-04:** 'Effects reverted' asserts all six surfaces are absent for the retired plugin: (1) its capability service in ctx provide store; (2) its tool(s) in ctx.tools; (3) its slash command unregistered via inactive coeffect sub-fiber (reuse the apply-subset-then-commands DEGR-03 pattern from mount.test.mjs:260); (4) the persona body omits the step paragraph and never names its tools (D-02 token invariant); (5) the runtime-context snapshot omits the step from Available-steps; (6) gsd_status rewrites a stored next_action targeting it to the nearest present step or the no-loop notice.
### End-to-end functional depth
- **D-05:** 'Remaining loop still functional end-to-end' = render/routing/gsd_status coherence PLUS offline-runnable smoke calls. For each retired step: assert loopSteps excludes it, effectiveRoutableStep advances past the gap (nearest greater order, else no-loop), renderAvailableSteps omits it, no absent-tool token appears, and every remaining offline-runnable step tool (gsd_discuss / gsd_plan / gsd_verify) still executes successfully against a bootstrapped FakeFs project producing its artefact (CONTEXT.md / PLAN.md / VERIFICATION.md) where allowed. gsd_execute and gsd_ship are asserted present + registered + schema-sound only (their git/gh/subagent paths are not driven offline).
- **D-06:** Routing semantics for an absent step (including leaving/entry gaps) are REUSED from lib/_render.js effectiveRoutableStep / loopSteps / renderNoLoopNotice — no new routing logic. The test asserts the already-defined graceful degradation, never redefines it.
### Test harness
- **D-07:** Extract the shared fake-ctx mount harness (makeMountCtx, applySubset, mountSubset, assertNoAbsentToolToken and their constants) into test/helpers/mount-harness.mjs, imported by both the existing test/mount.test.mjs and the new test/removal.test.mjs per-plugin removal suite — a single source so the harness never drifts between the two.
- **D-08:** The new suite lives in test/removal.test.mjs and stays offline only (FakeFs + fake-ctx, no live DSH boot, no LLM, no git/gh), matching the established project test philosophy.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### DEGR-05 requirement
- `REQUIREMENTS.md — DEGR-05 the per-plugin removal test`
### Capability model / matrix source
- `lib/_capabilities.js — ROLES, CAPABILITY_KEYS, TABLE, buildCapability, capabilityForTool`
### Render/routing helpers
- `lib/_render.js — loopSteps, effectiveRoutableStep, renderAvailableSteps, renderPersonaBody, renderNoLoopNotice, capabilityKeyForNextAction`
### Reactive subset-mount precedent + harness to extract
- `test/mount.test.mjs — makeMountCtx (line 37+), applySubset (140), mountSubset (444), assertNoAbsentToolToken (487), DEGR-03 absent-command case (260), line 436 deferral of the phase-23 per-plugin suite`
- `cordis.patch.yml — the 12 patch rows / patch-row set`
### Existing unit coverage to reuse (not duplicate)
- `test/_capabilities.test.mjs — descriptor surface`
- `test/render.test.mjs — render/routing helper coverage`
- `test/mount.test.mjs reactive section (429-625) — subset-mount precedent`
</canonical_refs>

<code_context>
## Code Context
- test/mount.test.mjs provides makeMountCtx (fake-ctx host: fs/tools/commands/sections/contexts/provide/get/effect/inject), applySubset, mountSubset, assertNoAbsentToolToken, presentTools, personaBody/snapshot/initProject helpers — the harness to extract to test/helpers/mount-harness.mjs.
- lib/_render.js exposes pure, testable helpers (loopSteps, effectiveRoutableStep, renderAvailableSteps, renderPersonaBody, renderNoLoopNotice) already proven against arbitrary subsets — the per-plugin suite asserts these directly for each single-step removal.
- The DEGR-03 absent-command test pattern (mount.test.mjs:260) already shows how to prove a slash command stays unregistered when its capability is absent — reuse for the 'command unregistered' effect.
- CAPABILITY_KEYS in lib/_capabilities.js is the single source for the role=='step' subset; patch rows in cordis.patch.yml give the plugin-row set the matrix should be able to drive generically.
</code_context>

<specifics>
## Specifics
- (none)
</specifics>

<deferred>
## Deferred Ideas
- (none)
</deferred>


---

*Phase: 23-removal-verification*
*Context gathered: 2026-08-29*
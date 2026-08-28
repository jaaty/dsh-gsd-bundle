# Phase 21: capability-services - Context

**Gathered:** 2026-08-28T22:56:12.307Z
**Status:** Ready for planning

<domain>
## Phase Boundary
**In scope:** Ten capability providers — each loop-step plugin (discuss, ui, plan, execute, verify, ship, quick, map-codebase) plus a split gsdOrient + gsdJobs from core-tools — publishes a camelCase capability descriptor via ctx.provide. A shared lib/_capabilities.js module defines the descriptor shape, the known keys, and builder helpers. commands.js is refactored so each /gsd-* command is registered by a per-command sub-fiber (via ctx.use) whose inject is its step capability, so retiring a step reactively unregisters its command. The mount test (test/mount.test.mjs) and per-plugin smoke are updated for the new wiring (ctx.use + capability provides) and still assert 12 commands / 13 tools when all capabilities are present. No change to any tool's own behaviour or to the .planning/ artefact model.
**Out of scope:** Persona + gsd_status rendering the loop from capabilities (DEGR-02/04 = phase 22). STATE.md step-machine routing only through available steps (phase 22). Broken-chain detection using produces/consumes, e.g. plan absent => execute has no PLAN.md (phase 22). The automated per-plugin removal test suite (DEGR-05 = phase 23). Job live-registry effect-scoping and the subagents coeffect (DEGR-06/07 = phase 24). Any change to the milestone/phase/requirement tracking model itself, or making that model pluggable end-to-end for a scrum-style swap (future milestone).
</domain>

<decisions>
## Decisions
### Capability model
- **D-01:** Capability granularity: split core-tools into gsdOrient (init/new_milestone/status/progress — model-bound, the surface a future scrum-style swap would replace) and gsdJobs (gsd_job — model-agnostic, kept on a model swap). Each of the 8 loop-step plugins (discuss, ui, plan, execute, verify, ship, quick, map-codebase) publishes its own capability. Total 10 capabilities.
- **D-02:** Capability keys are camelCase (gsdPlan, gsdOrient, gsdJobs, gsdDiscuss, gsdUi, gsdExecute, gsdVerify, gsdShip, gsdQuick, gsdMapCodebase), matching the existing gsdState idiom. Published via ctx.provide(key, descriptor); consumed via ctx.get(key).
- **D-03:** Rich descriptor shape: { key, step, role, tools[], commands[], order, prereq, next, produces[], consumes[] }. role in {step, optional, alternate, onboarding, orient, jobs}. prereq/next/produces/consumes are stored now but NOT enforced in phase 21 — they are advisory metadata that phase 22 rendering/routing consumes.
- **D-04:** Per-plugin mapping (single source of truth in _capabilities.js): gsdOrient.tools=[gsd_init,gsd_status,gsd_progress,gsd_new_milestone], commands=[gsd-init,gsd-status,gsd-progress,gsd-new-milestone], role=orient; gsdJobs.tools=[gsd_job], commands=[], role=jobs; gsdDiscuss commands=[gsd-discuss-phase]; gsdUi commands=[gsd-ui-phase] role=optional; gsdPlan commands=[gsd-plan-phase]; gsdExecute commands=[gsd-execute-phase]; gsdVerify commands=[gsd-verify-work]; gsdShip commands=[gsd-ship]; gsdQuick commands=[gsd-quick] role=alternate; gsdMapCodebase tools=[gsd_map_codebase,gsd_intel_updater], commands=[gsd-map-codebase] role=onboarding. Loop steps role=step.
### Shared vocabulary module
- **D-05:** A new lib/_capabilities.js exports the known capability keys (an ordered list), a descriptor builder, and the role enum. Plugins import the builder to construct their descriptor; the persona (phase 22) and any consumer import the key list to know what to poll. Follows the existing lib/_shared.js pure-helper module pattern.
### Persona coeffect strategy
- **D-06:** Persona is NOT changed in phase 21 (rendering from capabilities is phase 22). The chosen strategy for phase 22 is recorded here for contract continuity: persona keeps inject=["systemPrompt"] and polls each capability key via ctx.get in the runtime-context provider every prompt assembly (assembly-fresh each turn, always-active even with zero steps). Capabilities are deliberately NOT added to persona's inject — a required coeffect would deactivate the persona fiber when any step is missing, which is the opposite of graceful.
### Command reactivity (DEGR-03)
- **D-07:** commands.js is refactored: for each /gsd-* command it calls ctx.use with a tiny per-command component whose inject=[capabilityKey, "commands"] and whose apply registers that one command via ctx.effect(() => ctx.commands.register(...)) returning the disposer. When the step capability withdraws, the sub-fiber deactivates and the command is truly unregistered (no dangling commands). When the capability is absent at load, the sub-fiber stays INACTIVE and the command is never registered. gsdJobs has no slash command so it has no command sub-fiber.
- **D-08:** The COMMANDS array in commands.js stays as the declarative source of {name, description, hint, build} per command; the refactor wraps each in a per-command component that pairs it with its capability key from _capabilities.js. The build()/phaseNum()/send() helpers are reused unchanged.
### Capability publish mechanism
- **D-09:** Each step/orient/jobs plugin adds one ctx.provide(capabilityKey, descriptor) call in its existing apply(ctx), constructed via the _capabilities.js builder. ctx.provide is an auto-tracked revertible effect (Cordis), so retiring the plugin withdraws its capability and reactively deactivates command sub-fibers injecting it — no manual dispose needed for the capability. The tool registrations (ctx.tools.register) stay as-is (already effect-scoped). No plugin's inject array changes in phase 21.
### Error handling / edge cases
- **D-10:** Fail loud at registration, degrade graceful at read: a plugin whose descriptor is malformed (missing required step/tools, non-finite order) throws in apply so the misconfiguration is caught at load, not silently. A consumer that finds a capability absent simply omits it (the persona's future renderer skips it; no throw). A capability present but with an unexpected role is logged-and-skipped by renderers, never crashing the prompt assembly.
- **D-11:** Ordering: capabilities carry an `order` number; consumers render available steps sorted by order. Loop order is discuss(10) -> ui(15) -> plan(20) -> execute(30) -> verify(40) -> ship(50); quick(25, alternate) and map-codebase(0, onboarding) sit off the main chain; gsdOrient/gsdJobs are not loop-ordered (negative/large sentinel). Exact integers are delegated to the executor as long as the sorted order matches.
### Test compatibility
- **D-12:** test/mount.test.mjs fake ctx is extended to support ctx.use (per-command sub-fibers) and to provide the capability services so the command sub-fibers activate. It still asserts 12 commands registered and 13 tools when all capabilities are present. The per-plugin smoke (apply registers, schema valid) continues to pass. The full per-plugin removal/reactivity test suite is phase 23 (DEGR-05), not phase 21.
### Claude's Discretion
- Exact integer `order` values, provided the sorted order reproduces discuss->ui->plan->execute->verify->ship with quick and map-codebase off the main chain.
- Whether lib/_capabilities.js is a new file or folds into lib/_shared.js (new file preferred for a single responsibility, but executor's call).
- Whether core-tools emits its two ctx.provide calls (gsdOrient + gsdJobs) inside its single apply, or whether the two capabilities are described together in _capabilities.js and core-tools references both — core-tools remains one plugin/module, so both provides happen in its apply.
- The sentinel value used to mark gsdOrient/gsdJobs as not loop-ordered.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Cordis revertible effects — ctx.effect is the sole context-mutating primitive, returning an inverse the runtime holds
- `arXiv:2608.25512 §5.1.1 (Effect Tracking) — line ~3047: every context-mutating operation reduces to ctx.effect; the callback yields a dispose closure that reverts the effect`
- `node_modules/@deepseek-ai/cordis/lib/index.js — ctx.effect / fiber.effect; ctx.provide wraps ctx.fiber.effect (auto-tracked revertible)`
### Cordis reactive coeffects — the coeffect spec is fiber.inject; the loader reactively activates/deactivates a fiber when its declared keys' providers appear/withdraw
- `arXiv:2608.25512 §5.1.2 + Algorithm 3 (Reactive notification): notify refreshes a fiber only for keys in its inject; §5.2.1 Theorem 70: a fiber whose declared keys are not yet provided waits at L-Begin`
- `node_modules/@deepseek-ai/cordis/lib/index.js — ReflectService handler.get: direct ctx.k access requires k in inject (else throws 'cannot get property without inject'); the bare ctx.get(k) method reads the store WITHOUT inject (non-reactive)`
### Component lifecycle — ctx.use instantiates a sub-fiber whose inject is the component's coeffect spec, tied to the parent via ctx.effect; activates when inject is satisfied
- `arXiv:2608.25512 §5.1.3 Algorithm 4 (Component instantiation): fiber ← Fiber(parent:ctx, inject:component.inject); ctx.effect(callback) ties lifecycle to parent; refresh activates when declared keys resolve`
- `node_modules/@deepseek-ai/cordis/lib/index.js — Fiber/use/refresh; ctx.provide returns the exact effect disposer`
### Effect-scoped registrations the bundle already relies on — tools and system-prompt sections are auto-tracked revertible effects
- `node_modules/@deepseek-ai/dsh-tool-cordis/lib/index.js — ctx.tools.register is effect-scoped, returns the exact Cordis effect disposer`
- `node_modules/@deepseek-ai/dsh-system-prompt/lib/index.js — section()/context() call ScopedLayers.effect -> ctx.effect (auto-tracked); dsh-persona wraps in ctx.effect (redundant but harmless)`
### Bundle code touched by this phase
- `lib/commands.js — current single-apply registers 12 commands inside one ctx.effect; to be refactored to per-command sub-fibers`
- `lib/core-tools.js — registers 5 tools (init/status/progress/new_milestone/job); apply gains ctx.provide(gsdOrient,...) and ctx.provide(gsdJobs,...)`
- `lib/{discuss,ui,plan,execute,verify,ship,quick,map-codebase}.js — each apply gains one ctx.provide of its capability`
- `lib/_shared.js — the pure-helper module pattern that lib/_capabilities.js follows`
- `test/mount.test.mjs — the fake-ctx mount harness to extend for ctx.use + capability provides`
</canonical_refs>

<code_context>
## Code Context
- ctx.provide(name, value) in @deepseek-ai/cordis wraps ctx.fiber.effect — it is an auto-tracked revertible effect; retiring the providing fiber withdraws the service and reactively notifies dependents. Use it for capability publish; no manual dispose.
- ctx.use(component, config) (Algorithm 4) instantiates a sub-fiber with inject=component.inject, lifecycle tied to the parent via ctx.effect; the sub-fiber activates only when its injected keys resolve (L-Begin wait) and deactivates when a provider withdraws. Use it for per-command sub-fibers injecting [capabilityKey, 'commands'].
- ctx.tools.register(...) is already effect-scoped (returns the exact disposer) — the bundle's tool registrations are already revertible; phase 21 adds capability provides alongside them, not instead of them.
- ctx.get(key) (bare method) reads the service store WITHOUT requiring inject and is non-reactive — the existing pattern the persona uses to poll gsdState each prompt assembly; phase 22 will reuse it to poll capability keys. Direct ctx.k proxy access would require inject and is reactive; not used for the optional poll.
- ctx.effect(() => ctx.commands.register(...)) — the existing manual effect-wrap pattern in lib/commands.js:183; the per-command sub-fiber apply reuses it to register one command and return its disposer.
- lib/_shared.js / lib/_intel.js / lib/_runner.js — pure-helper module pattern (no ctx, no I/O) imported by plugins; lib/_capabilities.js follows the same pattern as the single source of truth for capability keys + descriptors.
- test/mount.test.mjs — builds a fake ctx satisfying every plugin's inject and applies all 12 plugins, asserting 12 commands + 13 tools; must be extended to support ctx.use and to provide the 10 capability services so the command sub-fibers activate.
</code_context>

<specifics>
## Specifics
- 10 capability keys, camelCase: gsdOrient, gsdJobs, gsdDiscuss, gsdUi, gsdPlan, gsdExecute, gsdVerify, gsdShip, gsdQuick, gsdMapCodebase.
- gsdOrient.tools=[gsd_init,gsd_status,gsd_progress,gsd_new_milestone], .commands=[gsd-init,gsd-status,gsd-progress,gsd-new-milestone], .role='orient'.
- gsdJobs.tools=[gsd_job], .commands=[] (gsd_job has no slash command, so no command sub-fiber), .role='jobs'.
- gsdMapCodebase.tools=[gsd_map_codebase,gsd_intel_updater], .commands=[gsd-map-codebase], .role='onboarding'.
- Loop-step roles: discuss/plan/execute/verify/ship = 'step'; gsdUi = 'optional'; gsdQuick = 'alternate'.
- order values (advisory; exact ints delegated): discuss 10, ui 15, plan 20, execute 30, verify 40, ship 50; quick 25 (alternate, off-chain); map-codebase 0 (onboarding); gsdOrient/gsdJobs not loop-ordered (use a sentinel).
- prereq/next chain (advisory, stored now, enforced phase 22): discuss->plan, plan(prereq:discuss)->execute, execute(prereq:plan)->verify, verify(prereq:execute)->ship, ui(prereq:discuss)->plan; quick/map-codebase/orient/jobs have no prereq/next.
- produces/consumes (advisory, stored now, used phase 22): discuss produces CONTEXT.md; plan consumes CONTEXT.md produces PLAN.md; execute consumes PLAN.md produces SUMMARY.md; verify consumes SUMMARY.md produces VERIFICATION.md; ship consumes VERIFICATION.md; ui produces UI-SPEC.md.
- Phase 21 does NOT touch lib/persona.js or lib/state.js rendering — capabilities are published and commands are wired to them, but nothing reads them yet except the command sub-fibers' inject.
</specifics>

<deferred>
## Deferred Ideas
- Persona + gsd_status rendering the loop from capability descriptors (DEGR-02, DEGR-04) — phase 22.
- STATE.md step-machine routing only through available steps, and skipping/short-circuiting when a step is absent — phase 22.
- Broken-chain detection using produces/consumes (e.g. plan absent => execute has no PLAN.md, so execute cannot run even if present) — phase 22.
- The automated per-plugin removal/reactivity test suite proving each single step plugin retires cleanly with the loop still functional (DEGR-05) — phase 23.
- Effect-scoping the background-job live registry (lib/jobs.js `live` Map) so unload/HMR cancels running jobs, and declaring `subagents` in the inject of every consuming plugin (DEGR-06, DEGR-07) — phase 24.
- Making the milestone/phase/requirement tracking model pluggable end-to-end so a scrum-style (initiatives/epics/stories/subtasks) model can replace it — this phase only makes the tool-registration surface swappable via the gsdOrient/gsdJobs split; the model itself lives in gsd-state + the phase tools and is a separate future milestone.
</deferred>


---

*Phase: 21-capability-services*
*Context gathered: 2026-08-28*
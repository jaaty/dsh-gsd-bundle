I have all the evidence I need. Here is the complete RESEARCH.md output for the orchestrator to write to disk.

---

```markdown
# Phase 21: capability-services — RESEARCH.md

**Researcher:** gsd-phase-researcher (fresh context)
**Date:** 2026-08-28
**Branch:** phase-21
**Files inspected this session:** lib/commands.js, lib/core-tools.js, lib/discuss.js, lib/{plan,execute,verify,ship,ui,quick,map-codebase}.js (name/inject/apply only), lib/state.js, lib/_shared.js, lib/_runner.js, lib/persona.js, test/mount.test.mjs, test/tools.test.mjs, test/service-tools.test.mjs, test/_git-artifacts.test.mjs, package.json, cordis.patch.yml, .planning/STATE.md; the real host sources `@deepseek-ai/cordis/lib/index.js` (4.0.1) and `@deepseek-ai/dsh-tool-cordis/lib/index.js` from the installed DSH host checkout.

---

## 1. Domain analysis

Phase 21 makes the loop-step **plug-in surface swappable**: every step plugin publishes a capability service (via `ctx.provide`), and the `/gsd-*` command layer is rewired so each command is registered by a sub-fiber whose inject is its step capability — so retiring a step plugin reactively unregisters that step's command (DEGR-03). No tool behaviour and no `.planning/` artefact model changes (CONTEXT in-scope).

### 1.1 Cordis reactive service/coeffect model (the mechanism this phase rides on)
Cordis (this bundle is a set of Cordis plugins hosted by DSH) is a reactive dependency-injection framework. Three primitives are load-bearing here, all **verified against the installed `@deepseek-ai/cordis/lib/index.js` (v4.0.1)**:

- **`ctx.provide(name, value, check?)` → disposer.** Registers a service under `name`, keyed by an isolation symbol. It wraps `this.ctx.fiber.effect(...)`; if the providing fiber is active it calls `notify([name])` to wake dependents. Its disposer deletes the store entry and re-`notify`s — so the very act of unregistering is *itself* the revert. [VERIFIED: `node_modules/@deepseek-ai/cordis/lib/index.js:799-823`]
- **`ctx.get(name, strict=true)` → value|undefined.** Reads the service store **without** the inject requirement and is **non-reactive**. Used by `lib/state.js` clients and the persona's context provider to poll `gsdState`. [VERIFIED: `cordis/lib/index.js:754-771`]
- **Reactive coeffect = fiber `inject`.** A fiber's `inject` map is the coeffect spec. On any `notify([name])`, **every** fiber in the registry whose `inject` includes `name` is refreshed: `notify` walks `runtime.fibers`, and for each fiber with `name` in `inject` it calls `fiber._checkImpl(name)` then `fiber._refresh()` (only for the matching isolation scope). `_checkImpl` drops the stored impl if the service is absent/inactive; `_refresh` recomputes an epoch; if any injected key is missing the epoch becomes `INACTIVE`, which `_setEpoch` turns into an unload, and when the last missing key appears the epoch becomes active, which runs the reload (→ `apply`). [VERIFIED: `cordis/lib/index.js:831-851` (`notify`), `1305-1327` (`_checkImpl`/`_refresh`), `1329-1343` (`_setEpoch`)]. This is the L-Begin wait → reactive activate/deactivate the CONTEXT's D-07 relies on, and it is genuinely reactive in both directions.

### 1.2 The sub-fiber instantiation API: `ctx.use` does NOT exist
This is the **single most important research finding**. The CONTEXT canonically refs "Algorithm 4 (Component instantiation): `ctx.use` …" as though `ctx.use` were a real Cordis API, and D-07 is written around `ctx.use(capabilityKey, …)`. **`ctx.use` is not defined anywhere in `@deepseek-ai/cordis` 4.0.1 or any host package** — I grepped `cordis/lib/index.js`, `cordis/src/*.ts`, `cordis-plugin-loader`, `cordis-plugin-group`, `cordis-plugin-include`, and `dsh-base`; there is no `use` method and no `use` alias ([VERIFIED: grep across all those trees returned nothing; only `ctx.plugin` and `ctx.inject` exist]).

The real public API for starting a sub-fiber whose `inject` reactively gates it is:

- **`ctx.plugin({ name, inject, apply }, config?)` → fiber** — normalizes the plugin shape and starts a new `Fiber`; the fiber's `dispose` is registered on the parent via `parent.fiber.effect(...)`, so the sub-fiber's whole lifecycle is tied to the caller's fiber. [VERIFIED: `cordis/lib/index.js:1618-1640` (plugin), `1074-1090` (dispose tied to parent)]
- **`ctx.inject(injectArray, callback)` → fiber** — shorthand for `ctx.plugin({ inject, apply: callback, name: callback.name })`. [VERIFIED: `cordis/lib/index.js:1599-1605`]

Both `ctx.plugin` and `ctx.inject` are exposed on every context: `ReflectService` mixes in `get/set/provide/accessor/mixin` and `RegistryService` mixes in `inject/plugin` onto the context. [VERIFIED: `cordis/lib/index.js:735-743`]. **Conclusion:** the CONTEXT's "per-command sub-fiber injecting `[capabilityKey, 'commands']`" contract is exactly realizable, but the method to call is `ctx.inject([capabilityKey, 'commands'], applyFn)` (or `ctx.plugin(...)`), **not** `ctx.use(...)`. The planner and executor MUST use the real names and the mount fake-`ctx` MUST expose `ctx.inject`/`ctx.plugin` (or a thin `use` alias that maps onto them) so the refactored `lib/commands.js` activates under the offline harness.

**Confidence: high** — the reactive model (1.1) and the API names (1.2) are read directly from installed source line ranges.

### 1.3 Effect-scoped registrations the bundle already relies on
- **`ctx.tools.register(definition)`** returns "the exact disposer that unregisters the tool" (effect-scoped). [VERIFIED: `dsh-tool-cordis/lib/index.js`, `tools.register` doc ~line 3339; the bundle already depends on this]
- **`ctx.commands.register(definition)`** returns "the exact effect disposer that unregisters this definition"; it is the host's **Human-command registry** (plain-context definitions are global; definitions registered through a command-injected child of an agent context shadow globals for that agent). [VERIFIED: `dsh-tool-cordis/lib/index.js:744-760`]. The bundle's command handler reads `invocation.rawInput` and `invocation.agent` — unchanged by this phase.
- **`ctx.systemPrompt.section()/context()`** are backed by `ScopedLayers.effect`→`ctx.effect` (revertible) [VERIFIED: `dsh-system-prompt/lib/index.js`, `section(section)` returns the exact Cordis effect disposer]. Not touched in phase 21 (persona rendering is phase 22).

### 1.4 Current bundle wiring (must read to plan the diff)
- `lib/commands.js` today: `inject=["commands"]`; a single `apply(ctx)` wraps **one** `ctx.effect(() => { …all 12 `ctx.commands.register(...)`…; return () => dispose-all })`. [VERIFIED: `lib/commands.js:16-17, 182-198`]. The refactor keeps the `COMMANDS` declarative array (name/description/hint/build) and the `build()/phaseNum()/send()` helpers verbatim, but each entry is registered by its own sub-fiber.
- `lib/state.js` already publishes a service under a **camelCase** name via `ctx.provide("gsdState", svc)` — the exact idiom the 10 capabilities must mirror (D-0202). [VERIFIED: `lib/state.js:669`]
- All 8 step plugins and core-tools have `inject=["gsdState","tools"]` and register their tool(s) in `apply`; none currently calls `ctx.provide` for a capability. [VERIFIED: per-file `const inject`/`ctx.tools.register` greps]. Additions in phase 21 are purely additive `ctx.provide(key, descriptor)` calls.
- Per-plugin tool counts (unchanged): core-tools=5 (init/status/progress/new_milestone/job), map-codebase=2 (gsd_map_codebase, gsd_intel_updater), all other step plugins=1. Total **14 tools**, **12 commands**. [VERIFIED: `lib/core-tools.js`, `lib/map-codebase.js`, and `test/mount.test.mjs:171-183,196-197`]

### 1.5 Counting correction (CONTEXT drift)
CONTEXT D-12 and prose repeatedly say the mount test asserts **"13 tools"**. The installed test asserts **14 tools** (two places: `test/mount.test.mjs:196` and `:317`), and `EXPECTED_TOOL_NAMES` has **14** entries (`gsd_init, gsd_status, gsd_progress, gsd_new_milestone, gsd_discuss, gsd_plan, gsd_execute, gsd_verify, gsd_ship, gsd_ui_phase, gsd_quick, gsd_map_codebase, gsd_job, gsd_intel_updater`) with **12** command names. [VERIFIED: counted via `node` against `EXPECTED_TOOL_NAMES` → 14; `EXPECTED_COMMAND_NAMES` → 12]. **Phase 21's invariant is 14 tools / 12 commands / 1 section / 1 context,** plus (new) 10 capability services. The planner should use 14, not 13.

### 1.6 Pitfalls
- **Never add the capabilities to any plugin's `inject`.** D-06/D-09: because of 1.1's active-wait, a required capability coeffect would keep the consuming fiber INACTIVE (never active, since the step could be absent) — the opposite of graceful. Capabilities are only *read* via non-reactive `ctx.get` (phase 22) and used as *inject keys by optional command sub-fibers* (which are *allowed* to be inactive).
- **Load order matters.** The patch inserts gsd-commands last (`cordis.patch.yml:34-84`), after all step/core plugins — so by the time `lib/commands.js` runs, every capability it needs is already in the reflect store and every sub-fiber activates. [VERIFIED: `cordis.patch.yml` insert order; `test/mount.test.mjs:23-36` `PATCH_ROWS`]. Do not reorder the patch.
- **Sub-fiber activation is async in the real runtime** (`_reload` awaits a microtask — `cordis/lib/index.js:1352`), but the offline mount harness is synchronous. The fake `ctx.inject`/`ctx.plugin` must activate **synchronously** (matching current fake `effect`'s sync behavior) or the 12-command assertion fails. Since gsd-commands loads last, all capabilities are present at that point — a synchronous "if every inject key resolves, run apply now" fake is correct for the present-path.
- **Duplicate provide detection.** `ctx.provide` throws if the name is already registered (`cordis/lib/index.js:812`). core-tools provides two names (gsdOrient, gsdJobs) in one apply — distinct keys, no conflict. Every capability key must be unique across the bundle.
- **`ctx.commands.register` disposer is single-use.** Unload of the command sub-fiber runs it → true unregister (no dangling command). Re-registration happens only on reactivation, so there is no double-registration.
- **Advisory-fields discipline (D-03/D-11).** `prereq/next/produces/consumes/order` are stored now, **not enforced**. Do not let the planner add enforcement logic (that is phase 22 routing / broken-chain detection). `order` must keep the chain sorted discuss→ui→plan→execute→verify→ship with quick and map-codebase off-chain.

---

## 2. Package legitimacy

**No new third-party dependency is required for phase 21.** `_capabilities.js` is a pure local ESM module following the existing `lib/_shared.js` pattern (no deps). All APIs come from already-declared peer deps.

- `@deepseek-ai/cordis@4.0.1` — first-party DeepSeek Harness fork; present in the DSH host and referenced by the bundle's `peerDependencies`. Provides `ctx.provide/get/inject/plugin/effect`. [VERIFIED: bundle `package.json` `peerDependencies`; installed at `node_modules/@deepseek-ai/cordis/package.json` version 4.0.1; host copy at `…/dsh/node_modules/@deepseek-ai/cordis`]
- `@deepseek-ai/dsh-tools` — sources `defineTool` (compiles tool schemas). Installed locally; bundle imports from it. [VERIFIED: bundle `package.json`; `node_modules/@deepseek-ai/dsh-tools/package.json`; `defineTool` at `lib/index.js:836`]
- `@deepseek-ai/dsh-llm` — sources `createUserMessage` (used by `commands.js:14`). [VERIFIED: installed locally; used in `lib/commands.js:14`]
- `@deepseek-ai/dsh-tool-cordis` (host-only) — provides the `ctx.tools` and `ctx.commands` host services the bundle consumes. Not a bundle dependency; declared as host capability. [VERIFIED: installed under the DSH host checkout, `dsh-tool-cordis/lib/index.js`]
- `@deepseek-ai/dsh-system-prompt` (host-only) — provides `ctx.systemPrompt.section/context`; not modified in phase 21. [VERIFIED: host checkout, `dsh-system-prompt/lib/index.js:186`]

Every tag above is [VERIFIED]. No `[CITED]` web lookups were needed; all packages are inspected from the real installed sources. The only `@deepseek-ai/*` peers referenced but **not** installed locally (dsh-tool-cordis, dsh-system-prompt) were inspected in the actual DSH host checkout rather than assumed.

---

## 3. Risks and Open Questions

### Open Questions

**Q-1 — What is the concrete sub-fiber instantiation API for the per-command components? (RESOLVED)**
`ctx.use` does not exist. Use `ctx.inject([capabilityKey, 'commands'], apply)` or `ctx.plugin({ name, inject: [capabilityKey, 'commands'], apply })`. The mount fake-`ctx` must expose `inject`/`plugin` (or a `use` alias) that activates synchronously. **What was blocking:** the CONTEXT/canonical refs named a non-existent API. **Resolved by:** reading the installed Cordis source (see §1.2). The D-07 contract (sub-fiber inject `[capabilityKey, 'commands']`, activate on present / stay inactive on absent / unregister on withdraw) is preserved verbatim — only the method name changes to the real one.

**Q-2 — Are the tool/command counts 13/12 or 14/12? (RESOLVED)**
14 tools, 12 commands. The CONTEXT's "13 tools" is stale drift; the code asserts 14. **What was blocking:** CONTEXT text vs code disagreement. **Resolved by:** running a count over `EXPECTED_TOOL_NAMES` (14) and `EXPECTED_COMMAND_NAMES` (12) and rereading the two `ctx.tools.length === 14` assertions. Phase 21 must keep 14 tools / 12 commands when all capabilities are present.

**Q-3 — Should the mount test also assert the 10 capability services? (RESOLVED)**
Yes — assert `provided` contains the 10 capability keys with the expected descriptor shape. This is the direct proof of DEGR-01 and costs one assertion block. It is additive and does not disturb the existing 14/12/1/1 assertions. The per-plugin smoke tests (`tools.test`, `service-tools.test`) build fake-`ctx`s with a no-op `provide() {}` ([VERIFIED: `test/tools.test.mjs:214,723`; `test/service-tools.test.mjs:84`]) so adding `ctx.provide` calls in `apply` leaves them green unchanged.

**Q-4 — Does DEGR-03's negative direction ("absent step ⇒ no dangling command") need proving in phase 21? (RESOLVED)**
Yes, with a minimal targeted addition, not the full phase-23 removal suite. A cheap variant: build a mount-`ctx`, apply all plugins, then assert that when one capability (e.g. gsdQuick) is deliberately **not** provided, the corresponding command (`gsd-quick`) is **not** registered while the other 11 are. Because the fake `commands.register` merely pushes and `ctx.inject` is presence-gated, the negative case needs no asynchronous teardown — it is a pure "never registered" check. This directly proves DEGR-03's "reactive unregister / no dangling commands" *contract* without the phase-23 removal/reactivity harness (DEGR-05). **What was blocking:** none — the fake already separates `provided` from the command array. **Resolved.**

### Risks
- **[MED] CONTEXT uses `ctx.use`; executor might cargo-cult a missing API.** Mitigated by Q-1 + §1.2: real methods are `ctx.inject`/`ctx.plugin`. The executor should wrap the per-command sub-fiber creation in a small helper in `lib/commands.js` and call `ctx.inject`.
- **[MED] Synchronous fake vs async real activation in the mount harness.** The fake `ctx.inject` must run `apply` synchronously when all inject keys resolve, and must be no-op when any is absent. See Q-4. Keep `applyAll` order = patch order so capabilities exist before gsd-commands.
- **[LOW] Descriptor validation (D-10).** Because all descriptors come from the single `_capabilities.js` builder over a static table, malformed descriptors are prevented at build time. Implement fail-loud in the builder (throw on missing step/tools/commands or non-finite order) so `apply`'s `ctx.provide(...)` naturally throws-in-apply if a bad descriptor is ever constructed. Consumers stay graceful (skip on absent).
- **[LOW] Order-sort correctness (D-11/discretion).** `order` values are advisory but must reproduce the chain sorted correctly. Recommend integers exactly as specificed: discuss=10, ui=15, plan=20, execute=30, verify=40, ship=50, quick=25 (alternate/off-chain), map-codebase=0 (onboarding). gsdOrient/gsdJobs carry a sentinel (`-1` recommended) and are excluded from loop ordering by phase 22's filter, not phase 21.
- **[LOW] Two provides in one `core-tools` apply.** Two `ctx.provide` calls with distinct keys is fine (duplicate-provide detection is per-name). Keep core-tools as one module; both `gsdOrient` and `gsdJobs` provides live in `apply`.

---

## 4. Architectural Responsibility Map

| Capability | Tier | Assignment rationale |
|---|---|---|
| Capability descriptor **schema / known-keys list / role enum / builder** → `lib/_capabilities.js` | **Domain / presentation-boundary (pure, model metadata)** | Pure helper module, no `ctx`, no I/O — exactly the `lib/_shared.js` pattern. Defines the single source of truth for all 10 descriptors. Consumers (commands now, persona/state phase 22) import it. |
| **Publish** each capability (8 step plugins + gsdOrient + gsdJobs) via `ctx.provide` | **Integration** | `ctx.provide` is the revertible service-registration primitive; it rides the plugin's own fiber lifecycle. Publishing is a host-plane wire-up, not domain logic. |
| **Command registration** per-command sub-fibers (`lib/commands.js`) | **Integration** | `ctx.inject([capKey,'commands'], …)` + `ctx.commands.register(...)` — wiring into the host command service, reactively tied to the step capability. |
| Descriptor `order/role/prereq/next/produces/consumes` **values** | **Presentation/domain metadata (advisory)** | Declared now, consumed by phase 22 rendering/routing. No enforcement here. |
| **Persona / STATE.md / gsd_status rendering** from capabilities | *(out of scope — phase 22)* | Explicitly deferred; do not implement. |
| **STATE.md step-machine routing** through available steps | *(out of scope — phase 22)* | Explicitly deferred. |
| **.planning/ artefact model** | Data tier — **unchanged** | No `.planning/` schema changes in this phase; capability model is orthogonal to the milestone/phase/requirement tracking model (which stays in gsd-state + phase tools). |

**Security-tier note:** command registration is an *authorizing surface* — a /gsd command should not survive the disappearance of the tool it drives (that is exactly DEGR-03). This lives in the integration tier (per-command sub-fibers) and is the only security-relevant wiring in the phase; the chosen placement (presence-gated sub-fiber) is correct. No data-tier or domain-tier security capability is introduced.

---

## 5. Validation Architecture

No tool behaviour changes, so validation is wiring-shaped. Coverage to prove each in-scope requirement:

- **DEGR-01 (each step plugin publishes a capability):** extend `test/mount.test.mjs` to assert `provided` contains exactly the 10 keys (`gsdOrient`, `gsdJobs`, `gsdDiscuss`, `gsdUi`, `gsdPlan`, `gsdExecute`, `gsdVerify`, `gsdShip`, `gsdQuick`, `gsdMapCodebase`) and that each resolves to a descriptor with the required `key/step/role/tools/commands/order` fields. Keep the existing 14-tools / 12-commands / 1-section / 1-context assertions (Q-2).
- **DEGR-03 (command coeffect on capability → no dangling commands):** (a) present-path — with all capabilities provided, gsd-commands' sub-fibers register exactly the 12 commands (existing assertion); (b) absent-path — a mount variant that skips providing one capability (e.g. `gsdQuick`) proves its command (`gsd-quick`) is never registered and the other 11 are (Q-4).
- **D-05/D-O4/`_capabilities.js` correctness (new unit test, e.g. `test/_capabilities.test.mjs`):** known-keys list is non-empty and ordered; `builder(key)` returns a descriptor whose `tools`/`commands` match the D-04 mapping verbatim; `role` is one of `{step, optional, alternate, onboarding, orient, jobs}`; the main chain sorts `discuss→ui→plan→execute→verify→ship` by `order`; `order` values are finite; malformed builder input throws (D-10). This satisfies the Nyquist "what proves it" gate for the descriptor model.
- **D-09 (no inject changes, tools stay effect-scoped):** existing per-plugin smoke (`test/tools.test.mjs`, `test/service-tools.test.mjs`, `test/mount.test.mjs`) continues to pass with `ctx.provide` added — their fake-`ctx` `provide() {}` no-ops absorb the new calls; no fake `inject`/`plugin` is needed there because those tests never load gsd-commands.
- **Existing suite regression:** `npm test` (`node --test test/*.test.mjs`) must stay green; no other test references the command-registration surface (`test/_git-artifacts.test.mjs:141` is only a comment).
- **Not in phase 21 (do not build):** any async removal/reactivity harness (DEGR-05 = phase 23), persona/state rendering (DEGR-02/04 = phase 22), broken-chain produces/consumes detection (phase 22), job-registry effect-scoping and `subagents` coeffect (DEGR-06/07 = phase 24).

---

## 6. Project Constraints

- **ZERO-dep invariant:** the bundle has no `dependencies` (only first-party peers: dsh-tools, schemastery, cordis, dsh-llm). `_capabilities.js` and every new piece of code must be plain ESM with no added dependency. [VERIFIED: `package.json`]
- **Pure-helper module pattern** (from `lib/_shared.js` / `lib/_intel.js` / `lib/_runner.js`): shared logic without `ctx` or I/O, imported by plugins. `lib/_capabilities.js` must follow it (new file preferred over folding into `_shared.js`; that is the executor's discretion and the new-file choice is recommended).
- **Faithfulness:** this bundle "reimplements opengsd-core"; the capability model mirrors the existing camelCase single-word idiom (`gsdState`). Descriptor `produces`/`consumes` should name the real artefacts: `CONTEXT.md`, `PLAN.md`, `SUMMARY.md`, `VERIFICATION.md`, `UI-SPEC.md` exactly as in CONTEXT specifics.
- **Feature-branch discipline:** this session is on `phase-21`; every phase tool (including the test refactor and `_capabilities.js`) commits planning artefacts + code to the phase branch via the established `_git-artifacts.js` helpers. No changes to STATE/R OADMAP milestone/phase/requirement tracking model.
- **Scope gate:** do not implement anything in `<deferred>` (persona/state rendering, step-machine routing, removal suite, job-registry scoping, pluggable milestone model, produces/consumes enforcement). If a plan drifts there, the plan-checker should reject it.
```

---

## Researcher note for the orchestrator

The headline finding is §1.2 / Q-1: **`ctx.use` is not a real Cordis API** in this stack — the real sub-fiber API is `ctx.inject(inject, apply)` / `ctx.plugin({inject, apply})`, and the offline mount fake-`ctx` must expose `inject`/`plugin` (or a thin `use` alias) that activates synchronously. Everything else in the CONTEXT decisions (capability granularity, key names, descriptor shape, per-command sub-fiber contract, fail-loud registration, order sentinels, no `inject` changes) is directly realizable and verified against installed sources. Also capture the tool-count correction (14, not 13).

I did not write any file (per my role); this content is the full RESEARCH.md for the orchestrator to save to `.planning/phases/GSD-21-capability-services/GSD-21-capability-services-RESEARCH.md`. All open questions are (RESOLVED), so planning may proceed.
I have all the evidence needed. The key host-implementation fact is verified: both `section.text` and `context.text` support function bodies evaluated per assembly. Here is the full RESEARCH.md.

---

# RESEARCH.md — Phase 22: reactive-loop-rendering

**Research date:** 2026-08-28
**Phase goal:** Re-render the persona, runtime-context snapshot, and gsd_status from the available step capabilities so absent steps are skipped and no missing tool is ever instructed.

**What "what do I need to know to PLAN this well" asks:** How to make three surfaces (persona body, runtime-context snapshot, gsd_status) capability-reactive at read time without (a) deactivating the persona fiber on a missing step, (b) touching the pure `lib/state.js` artifact model, or (c) breaking the existing mount-test harness. All research below was verified this session against the real sources.

---

## 1. Domain analysis

### 1.1 Cordis service reactivity — the poll-vs-inject decision is already settled
- **`ctx.get(name, strict=true)` reads the service store WITHOUT requiring `inject` and is non-reactive** — it returns whatever the store holds *at call time*. It is the correct read primitive for an always-optional capability poll. **[VERIFIED: node_modules/@deepseek-ai/cordis/lib/index.js:755-764]** In the bundle, `lib/persona.js` already polls `gsdState` this way every prompt assembly.
- **`ctx.get` with its default `strict=true` returns `undefined` when the providing fiber is `state !== 2` (inactive)** — i.e. a capability that was withdrawn mid-session reads as absent naturally, with no special handling. **[VERIFIED: cordis/lib/index.js:768-770]** This is exactly the "absent ⇒ not rendered" semantic phase 22 needs, at zero extra cost.
- **`ctx.provide()` registers the service as an auto-tracked revertible effect** — `return this.ctx.fiber.effect(...)` returning an async disposer that deletes the store entry and notifies dependents. Retiring a step plugin therefore withdraws its capability with no manual dispose. **[VERIFIED: cordis/lib/index.js:799-823]**
- **Direct `ctx.k` proxy access throws `cannot get property "${prop}" without inject`** unless `prop in fiber.inject`. This is why capabilities must stay OUT of `persona.inject` (D-02/D-06) — a required coeffect would deactivate the persona fiber when a step is missing. **[VERIFIED: cordis/lib/index.js:675, 686-688]**

### 1.2 Persona bodies and context snapshots are already assembly-fresh — and section bodies may be functions
- `SystemPrompt.assemble()` renders **`section.text` and `context.text` per assembly**: `text: typeof section.text === "function" ? section.text(context) : section.text`. **A section body can be a function, evaluated every prompt-assembly with the assembly `context`.** This is the single most important enabler for D-01: the persona body does not need to stay a static string — it can be a per-assembly function that drops absent-step paragraphs and never names their tools. **[VERIFIED: @deepseek-ai/dsh-system-prompt/lib/index.js:262-282, specifically lines 271 and 278]**
- Sections and contexts are sorted by `order` at assembly and empty renders are dropped (`renderPrompt` filters `text.length > 0`). **[VERIFIED: dsh-system-prompt/lib/index.js:65-66, 263, 276]**
- The persona currently registers `ctx.systemPrompt.section({name:'gsd:persona', order:-100, text: PERSONA_TEXT})` (static) and `ctx.systemPrompt.context({name:'gsd:state', order:10, text:(context)=>renderStateContext(context, gsdState)})` (function). **[VERIFIED: lib/persona.js:64-91]** Phase 22 makes the *section* a function in exactly the pattern the *context* already uses.

### 1.3 The capability vocabulary is the single source of truth (phase 21)
- `lib/_capabilities.js` exports `ROLES = ["step","optional","alternate","onboarding","orient","jobs"]`, `NOT_LOOP_ORDERED = -1`, the ordered `CAPABILITY_KEYS`, the descriptor `TABLE`, and `buildCapability(key)`. The header states it is "Plain ESM, no dependencies, no ctx, no I/O." **[VERIFIED: lib/_capabilities.js:1-3, 13-33, 39-184]**
- Descriptor shape: `{ key, step, role, tools[], commands[], order, prereq, next, produces[], consumes[] }`, everything frozen. **[VERIFIED: lib/_capabilities.js:167-178]**
- The 10 keys, roles, orders (map 0 onboarding; orient/jobs `NOT_LOOP_ORDERED`; discuss 10 step → ui 15 optional → plan 20 step → quick 25 alternate → execute 30 step → verify 40 step → ship 50 step): **[VERIFIED: lib/_capabilities.js:22-33, 39-150]**

### 1.4 Pure state model must stay ctx-free (D-05)
- `lib/state.js` `STEPS = ["discuss","ui","plan","execute","verify","ship","done"]` (line 27); `_nextActionFor(step)` maps step → `next_action` string (`"discuss-phase" | "ui-phase" | "plan-phase" | "execute-phase" | "verify-phase" | "ship-phase" | null`, default `"discuss-phase"`); `cachedState` exposes `{initialised, activeMilestone, activePhase, activeStep, milestone}`. **[VERIFIED: lib/state.js:27, 332-348, 650-661]**
- `renderStateContext` reads `gsdState.cachedState(cwd)`; `activeStep` = `fm.status`. **[VERIFIED: lib/persona.js:49-62; lib/state.js:650-661]**

### 1.5 gsd_status present behavior (three verbatim lines to make reactive)
- `Next action: ${fm.next_action || "(none)"}`, `Active phase: ${fm.active_phase || "(none)"}  Step: ${fm.status}`. **[VERIFIED: lib/core-tools.js:120-129]** The execute closure has `ctx` in scope (from `apply(ctx)`), so it can call `ctx.get(capKey)` at read time. Note **`gsd_progress` also prints `Next action: ${state.frontmatter.next_action || "(none)"}` verbatim at lib/core-tools.js:208** — see Risk 1.4.

### 1.6 Test harness — what subset-mount requires
- `makeMountCtx` fake `ctx.get` currently returns only `gsdState`/`subagents`. The capability descriptors ARE stored in `ctx.provided`; `ctx.get` must be extended to return a stored capability (so the persona/gsd_status read the *subset* of provided capabilities). `ctx.inject` already gates on `provided.has(k)` (used by commands reactivity). **[VERIFIED: test/mount.test.mjs:72-113]**
- **The existing persona test asserts `section.text` is a string and `assert.match(section.text, /Discuss/)`** (test/mount.test.mjs:322-328). If the section becomes a function, this assertion must be updated to call `section.text(someCtx)` first — exactly how the context provider is already invoked at line 355. The context provider is invoked as a function (`ctx.contexts[0].text({...})`), giving the pattern to copy. **[VERIFIED: test/mount.test.mjs:322-367]**

### 1.7 Patterns and pitfalls
- **Pitfall — ctx-aware code in a no-ctx module:** `_capabilities.js` is explicitly "no ctx, no I/O." A ctx-aware render/routing helper that calls `ctx.get` must NOT live there. The pure-helper-module pattern is `lib/_shared.js` (pure), and `lib/_intel.js`/`lib/_runner.js` follow it. A new `lib/_render.js` that imports `_capabilities.js` and `_shared.js`, and keeps its own logic pure-by-construction (functions take an *availableCapabilities* array or a *getCapability* thunk and return text/route), is the right seam. **It must never hold a module-level ctx.**
- **Pitfall — two orderings:** `CAPABILITY_KEYS` order is NOT numeric order (map 0, orient/jobs `NOT_LOOP_ORDERED`, then discuss..ship). A correct "available steps" render needs two sub-lists: (1) loop steps (`role ∈ {step, optional, alternate}`) sorted by `descriptor.order`; (2) informational entries (`role ∈ {orient, jobs, onboarding}`) in `CAPABILITY_KEYS` position. D-08 says "reuse the CAPABILITY_KEYS ordering and the descriptor.order field" — the planner must encode both, single-sourced.
- **Pitfall — next_action→capability mapping:** `next_action` strings ("discuss-phase" etc.) do NOT name a capability key. The helper needs a single mapping (`strip "-phase"` → camelCase → `"gsd"+…`), derived so `_nextActionFor` and the routing helper cannot drift.
- **Pitfall — graceful over unexpected role (D-07):** a capability present with an unexpected role must be log-and-skip. In the persona there is no console; in gsd_status there is a text surface. The helper should skip the entry for the *rendered list* but still not throw; the planner decides whether gsd_status surfaces a one-line warning. Never throw over absent/malformed.
- **Recommendation — no new dependency:** this phase consumes only already-installed peer deps (`@deepseek-ai/cordis`, `@deepseek-ai/dsh-tools`) plus internal libs. **No new package** (package.json `dependencies: {}`, peerDeps stable — verified below).

---

## 2. Package legitimacy

**No new dependency is proposed.** This phase changes rendering/routing only and consumes the existing `@deepseek-ai/cordis` (peerDep, present in node_modules) and the internal `lib/*` modules. **[VERIFIED: /var/home/jatyeo/dev/dsh-gsd-bundle/package.json:62-70 — dependencies:{}, peerDependencies:{dsh-tools, schemastery, cordis, dsh-llm}}]**

The only "host contract" the implementation leans on is `@deepseek-ai/dsh-system-prompt`, which is **not** a declared dependency of the bundle — it is injected by the DSH host and appears only in the runtime checkout. Its function-`text` support is the load-bearing fact for D-01 and was verified this session:
- **[VERIFIED: /var/home/jatyeo/.nvm/versions/node/v24.15.0/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-system-prompt/lib/index.js:271, 278]** `section.text` and `context.text` are both called with `context` when they are functions. The current `gsd:state` context provider already relies on the `context.text` half; phase 22 extends the same contract to `section.text`.

**No package legitimacy concerns arise — nothing new is being introduced.**

---

## 3. Risks and Open Questions

### Risks
1. **Placing ctx-aware code in `lib/_capabilities.js` would break its "no ctx, no I/O" contract** ([VERIFIED: lib/_capabilities.js:1-3]). Mitigation: put the helper in a new `lib/_render.js` (executor's D-09 choice, resolved below).
2. **The existing mount test treats the persona `section.text` as a static string** ([VERIFIED: test/mount.test.mjs:322-328]). Making the section a function will fail `assert.match(section.text, /Discuss/)`. Mitigation: update the test to call `section.text(context)` (the pattern already used for the context provider at line 355); extend `ctx.get` to return provided capabilities.
3. **`gsd_progress` (lib/core-tools.js:208) also prints `next_action` verbatim.** The CONTEXT scopes D-04 to `gsd_status` only, but the phase goal says "no missing tool is ever instructed." Mitigation (recommended, low cost): route `gsd_progress`'s next-action line through the same `_render.js` helper so the promise holds on both surfaces. Planner discretion — flagging as a decision point, not scope creep.
4. **Ordering ambiguity between `CAPABILITY_KEYS` and `descriptor.order`** (Risk in 1.7). Mitigation: the helper exposes ONE function returning both ordered sub-lists; persona and gsd_status both consume it.
5. **next_action string→capability mapping drift** (Risk in 1.7). Mitigation: derive in `_render.js` once.
6. **Graceful-not-silent on unexpected/malformed roles (D-07).** Mitigation: helper skips without throwing; gsd_status may append a one-line note; persona omits. Both funnel through the same wrapper.

### Open Questions
- **OQ-1 (RESOLVED): Can the persona *section.body* be a function evaluated per assembly, or must it stay a static string?**
  RESOLVED — **both `section.text` and `context.text` are called with `context` when they are functions** at assembly time ([VERIFIED: dsh-system-prompt/lib/index.js:271, 278]). The persona body CAN and SHOULD be a `text: (context) => ...` function rendering the static core + present-step paragraphs, exactly as D-01/D-03 require, giving per-turn freshness. The snapshot and section both become assembly-fresh; capabilities read via `ctx.get` inside each function — never via `inject`.
- **OQ-2 (RESOLVED): What exactly is filtered into the "available steps" list, and in what order?**
  RESOLVED — per D-08/D-04: two sub-lists. (1) Loop steps: `role ∈ {step, optional, alternate}` (discuss/ui/plan/execute/verify/ship, plus the alternate quick) **sorted by `descriptor.order`** (10→15→20→25→30→40→50). (2) Informational: `role ∈ {orient, jobs, onboarding}` (gsdOrient, gsdJobs, gsdMapCodebase) in `CAPABILITY_KEYS` position ([VERIFIED: lib/_capabilities.js:22-33, 39-150]). gsdOrient/gsdJobs (`NOT_LOOP_ORDERED`) and map-codebase (`order 0`, `onboarding`) never sort into the loop chain.
- **OQ-3 (RESOLVED): Where does the ctx-aware helper live?**
  RESOLVED — a new **`lib/_render.js`**, NOT a function in `lib/_capabilities.js`. The latter's documented "no ctx" invariant ([VERIFIED: lib/_capabilities.js:1-3]) forbids a `ctx.get`-calling function there. `_render.js` follows the `lib/_shared.js` pure-helper pattern: functions accept an *availableCapabilities* array (or a `getCapability(key)` thunk) and return text/route; the *caller* (persona.js, core-tools.js) supplies `ctx.get` and injects the resulting capabilities list. This keeps the helper unit-testable without a ctx while single-sourcing the available-step logic (D-09, D-05).
- **OQ-4 (RESOLVED): What is the next_action→capability mapping, and how is "nearest available step" computed?**
  RESOLVED — map strings by transformation: `"discuss-phase" → gsdDiscuss`, `"ui-phase" → gsdUi`, `"plan-phase" → gsdPlan`, `"execute-phase" → gsdExecute`, `"verify-phase" → gsdVerify`, `"ship-phase" → gsdShip` ([VERIFIED source of the strings: lib/state.js:346-348]). "Nearest" = if the mapped capability is present keep it; else the next present loop step with a strictly greater `order`, else `no available loop step` (D-04/D-06). Produces/consumes and prereq (D-10) remain advisory — routability depends ONLY on capability presence, not artifact existence.
- **OQ-5 (RESOLVED): Does the zero-loop fallback crash?**
  RESOLVED — no. When every loop-step/optional/alternate capability is absent: persona shows static core + a `no loop steps available` notice (D-06); the snapshot shows a clear no-available-step line; gsd_status replaces `next_action` with `no available loop step`. `ctx.get(strict=true)` returning `undefined` for absent/inactive fibers ([VERIFIED: cordis/lib/index.js:768-770]) makes this the trivial/empty case, and every render path `try/catch` + never-throw already (persona provider line 84-88; gsd_status "NEVER throw" discipline [VERIFIED: lib/core-tools.js lines 141-151, 175]).
- **OQ-6 (RESOLVED): How is subset-mount tested without a real DSH boot?**
  RESOLVED — extend `test/mount.test.mjs` `makeMountCtx`: give `ctx.get` the ability to return a stored capability descriptor from `ctx.provided` ([VERIFIED: test/mount.test.mjs:87-89 currently only handles gsdState/subagents]); apply a *chosen subset* of plugins before asserting rendering. Update the persona-section string assertion to evaluate `section.text(context)` (line 322-328). Assert (a) persona+snapshot omit absent steps and never name their tools, (b) gsd_status rewrites/hides `next_action` and shows the correct Available-steps section, (c) zero-loop and partial-loop degrade gracefully — all per D-11 (full per-plugin suite stays phase 23).

---

## 4. Architectural Responsibility Map

The phase is entirely read-time **presentation + one pure routing helper over the phase-21 capability store**. No data model, no tool behaviour, no `.planning/` artifact changes.

| Capability / concern | Tier | Why | Blocker? |
|---|---|---|---|
| Available-step filtering + ordered sub-lists + effective-routable-step computation | **Domain** (pure-by-construction) | Logic only; takes `capabilities[]` in, returns text/route. Lives in `lib/_render.js`. | No — but it must be pure (no module ctx) |
| Capability read (calling `ctx.get` per key at assembly/execute) | **Integration** (reads host capability store) | The persona provider and gsd_status pass a `getCapability` thunk bound to their `ctx`. The read is non-reactive `ctx.get`, never `inject`. | No |
| Persona body rendering (static core + present-step paragraphs) | **Presentation** | `text: (context)=>…` in `lib/persona.js`; drops absent steps/tools. | No — but it MUST be the same helper's output (D-09 single-source) |
| Runtime-context snapshot "GSD loop position" + available steps | **Presentation** | `renderStateContext` extended to append the ordered available-step list and route via the helper. | No |
| gsd_status "Available steps" + rewritten `next_action` | **Presentation** | `lib/core-tools.js` gsd_status execute calls the helper with its own `ctx`. | No — security-relevant only in that it must never advertise an absent step (D-04) |
| `gsd_progress` `next_action` line (Risk 1.4) | **Presentation** | Same helper; planner decision. | No |
| `lib/state.js` (STEPS, `_nextActionFor`, `cachedState`) | **Data** (unchanged) | Stays pure/ctx-free per D-05; the step route is computed by the wrapper over stored values, never mutated. | No — MUST remain untouched |
| `lib/_capabilities.js` | **Data** (unchanged) | Single source of vocabulary; must stay no-ctx. | Yes if the helper is placed here |

**Security-sensitive note:** no new security surface. The one "hard" rule is DEGR-04/D-04 — gsd_status must never present an absent step as actionable. Because that is a presentation-layer guarantee enforced through the single helper, keeping it in one pure module (not duplicated in persona + core-tools) is the correctness guard. A duplicate implementation drifting is the only real hazard; hence D-09 single-sourcing is treated as structural, not stylistic.

---

## 5. Validation architecture

Extends the existing offline `test/mount.test.mjs` harness (no live DSH, no git/gh — same offline contract as phase 1/21). Proof that each DEGR requirement is behaviorally met:

| Requirement | Automated proof |
|---|---|
| **DEGR-02** persona + snapshot skip absent steps, never name absent tools | Subset-mount assertions: apply only a chosen plugin subset; call the persona `section.text(context)` and the snapshot `contexts[0].text({...})`; assert (a) absent step's paragraph/tools do not appear, (b) present tools still appear, (c) static core present, (d) the ordered Available-step list matches the subset minus the retired step. Cross-check: assert no `gsd_*` token appears in the persona output unless its capability was provided. |
| **DEGR-04** gsd_status + step route only through available steps | Subset-mount: run `gsd_status.execute({}, exec)` against a `.planning/` project whose `next_action` names an absent step (e.g. `verify-phase` with gsdVerify retired); assert the output rewrites/replaces it (no `Next action: verify-phase` verbatim) and lists the correct Available-steps section. Also assert the full-set mount still renders `verify-phase` unchanged (no regression). |
| **Zero-loop fallback (D-06)** | Subset-mount applying only core-tools + state: assert persona shows the `no loop steps available` notice, snapshot shows the no-available-step line, gsd_status returns `no available loop step` — all without throwing. |
| **D-08 stable ordering** | Assert the rendered Available-steps / loop list matches `descriptor.order` ascending for loop roles and `CAPABILITY_KEYS` position for orient/jobs/onboarding, in both full- and subset-mounts. |
| **D-05 state untouched** | Assert `gsd_state` still provides a `GsdState` with identical `cachedState`/`_nextActionFor` outputs; the step machine changes are read-time only (no new write calls). |
| **No missing-tool instruction** | A helper-level or output-level invariant check: the persona/snapshot/gsd_status output contains NO `gsd_` token whose capability is absent in that mount. This is the "never instruct a missing tool" contract, asserted across several subsets. |

These reuse the existing fake-ctx + FakeFs harness; no new test framework or dependency. The full per-plugin removal suite is explicitly **out of scope** (DEGR-05 / phase 23) — this phase only proves rendering/routing reactivity, not plugin retirement hygiene.

---

## 6. Project constraints (from project conventions)

- **Zero runtime dependencies** — `package.json` `dependencies: {}`; all GSD internals are plain ESM helpers (`lib/_shared.js`, `lib/_intel.js`, `lib/_runner.js` pattern), no third-party libs, "preserve the zero-dep invariant." **[VERIFIED: package.json:62-70; test/mount.test.mjs:129-132]**
- **`lib/state.js` stays a pure artifact model** — "a PURE artifact model that must stay ctx-free" (D-05). Route changes happen in the ctx-aware wrapper, never in `state.js` writes. **[VERIFIED: lib/state.js:1-5, 650-672]**
- **Single source of truth** — available-step logic must be single-sourced (D-09) and never duplicated between persona and gsd_status; capability vocabulary already single-sourced in `_capabilities.js`.
- **Fail loud at registration, degrade graceful at read** (D-07 / phase-21 D-10) — renderers never throw during prompt assembly or gsd_status rendering; gsd_status is already a never-throw orientation surface **[VERIFIED: lib/core-tools.js:141-151, 175]**.
- **Offline-tested** — the mount test proves activation + rendering against a fake ctx/FakeFs with no live DSH, LLM, git, or gh. **[VERIFIED: test/mount.test.mjs:1-8]**

---

*Phase: 22-reactive-loop-rendering · Research complete — all Open Questions RESOLVED.*
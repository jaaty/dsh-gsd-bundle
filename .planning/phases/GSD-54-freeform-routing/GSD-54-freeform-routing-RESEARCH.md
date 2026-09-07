I have everything I need. Here is the full RESEARCH.md file contents.

---

# Phase 54: freeform-routing — RESEARCH.md

**Phase:** 54-freeform-routing · **Requirement:** CLH-04 · **Milestone:** core-loop-helpers
**Researched:** 2026-09-07 · **Status:** Ready for planning

---

## 1. Domain analysis

### 1.1 What this phase builds
A `gsd_route` tool plus a `/gsd-route` slash command that parses a plain-English intent string and dispatches it to the most appropriate available GSD command. The core is a **pure, side-effect-free, deterministic intent classifier** (no LLM, no new runtime deps) that maps natural-language utterances to one target GSD command plus extracted parameters (phase number, options), evaluated **capability-aware** so absent steps/withdrawn tools are never recommended. The tool's execute path classifies then **returns the recommended command text — never auto-runs it** — falling back to `gsd_status` with an explanatory note for unmatched/ambiguous intents. [VERIFIED: CONTEXT.md D-01..D-10, in-scope/out-of-scope]

### 1.2 The established pattern this phase MUST mirror: `lib/_next.js` (phase 53)
The direct sibling is the phase-53 smart-entry classifier. It is the canonical "pure classifier + render function, capability-aware, tested in isolation across a matrix" pattern. [VERIFIED: lib/_next.js:1-13 header comment]

- `classifyNextState(snapshot, descriptors)` — pure, side-effect-free, no I/O, no async. Returns `{ branch, recommendation, mutation }`. [VERIFIED: lib/_next.js:77-161]
- `renderNextRecommendation(result)` — pure renderer returning `Next action: run <cmd>.` [VERIFIED: lib/_next.js:170-174]
- `hasCap(descriptors, key)` — pure capability-presence helper. [VERIFIED: lib/_next.js:46-48]
- `FALLBACK_RECOMMENDATION = "gsd_status"` — the capability-gated generic fallback. [VERIFIED: lib/_next.js:34]
- The tool's execute path (in `lib/core-tools.js`) gathers a snapshot via gsdState accessors, passes it plus capability descriptors to the pure classifier, applies the optional mutation, then renders. [VERIFIED: lib/core-tools.js:575-669]

**Phase 54 mirrors this structure for free-text intents:** a new pure module (recommended `lib/_route.js`) exports `classifyIntent(intent, descriptors)` + a render helper; the `gsd_route` tool's execute path (in `lib/core-tools.js`) passes the intent + present capability descriptors to the pure classifier and returns the rendered recommendation. The classifier performs **no I/O** — it consumes only the intent string and the descriptors. [VERIFIED: CONTEXT.md code_context; lib/_next.js pattern]

### 1.3 The capability-aware routing primitives to REUSE (not duplicate)
`lib/_render.js` is the single source of truth for capability-aware routing. [VERIFIED: lib/_render.js:1-13]

- `availableCapabilities(getCap, descriptors)` — collects present capability descriptors in `CAPABILITY_KEYS` order; drops absent ones, never throws. [VERIFIED: lib/_render.js:58-68]
- `capabilityKeyForNextAction(nextAction)` — maps a stored `next_action` string to a capability key. [VERIFIED: lib/_render.js:74-79]
- `effectiveRoutableStep(nextAction, descriptors)` — returns the effective routable loop descriptor based ONLY on capability presence; returns the nearest present step with strictly greater order when the targeted step is absent, else null. [VERIFIED: lib/_render.js:105-116]
- `loopSteps(descriptors)` / `informationEntries(descriptors)` — filter loop-chain vs informational descriptors. [VERIFIED: lib/_render.js:82-92]
- `renderAvailableSteps(descriptors)` — renders the `## Available steps` body. [VERIFIED: lib/_render.js:135-143]

`lib/_capabilities.js` is the capability descriptor table. [VERIFIED: lib/_capabilities.js:1-9]
- `CAPABILITY_KEYS` — the 24 known keys in stable order. [VERIFIED: lib/_capabilities.js:32-57]
- `buildCapability(key)` — fail-loud descriptor constructor. [VERIFIED: lib/_capabilities.js:337-357]
- `capabilityForTool(tool)` — tool→capability lookup. [VERIFIED: lib/_capabilities.js:369-375]
- `allCapabilities()` — descriptors for every known key. [VERIFIED: lib/_capabilities.js:360-362]
- `gsdOrient` descriptor: `tools: ["gsd_init","gsd_status","gsd_progress","gsd_new_milestone","gsd_pause_work","gsd_resume_work","gsd_next"]`, `commands: ["gsd-init","gsd-status","gsd-progress","gsd-new-milestone","gsd-pause-work","gsd-resume-work","gsd-next"]`, `role: "orient"`, `order: NOT_LOOP_ORDERED`. [VERIFIED: lib/_capabilities.js:75-85]

**Design implication:** the router's dispatch target set is derived from the present descriptors (via `availableCapabilities`), so a withdrawn/absent command is never recommended — the never-instruct-a-missing-tool invariant holds by construction. [VERIFIED: CONTEXT.md D-06/D-07]

### 1.4 The command/tool registration + arg-parsing pattern to reuse
`lib/commands.js` is the `/gsd-*` slash-command layer. [VERIFIED: lib/commands.js:1-13]

- `phaseNum(raw)` — `String(raw).trim().match(/^(\d+)/)` → leading-number phase extraction. [VERIFIED: lib/commands.js:21-24]
- `COMMANDS` array — each entry `{ name, description, hint?, build(raw) }` where `build` returns `{ err }` or `{ text, ack }`. [VERIFIED: lib/commands.js:35-393]
- `apply(ctx)` — pairs each command to its owning capability via `commandToCapability` (DEGR-03), then registers each command from a sub-fiber whose inject pairs the owning step capability with the host `commands` service, so an absent capability leaves the command unregistered. [VERIFIED: lib/commands.js:395-429]
- Flag regexes used across commands: `--auto`, `--wave\s+(\d+)`, `--gaps-only`, `--fix`, `--all`, `--depth\s+(\S+)`, `--files\s+(\S+)`, `--mode\s+(\S+)`, `--draft`, `--repair`, `--confirm`, `--force`, `--fast\b`, `--focus\s+(\S+)`, `--paths\s+(\S+)`, `--query\s+([\s\S]+)$`. [VERIFIED: lib/commands.js grep, lines 80-282]

**Design implication (D-04):** the router extracts a phase number and option flags from the intent and passes them to the mapped command's text, mirroring how `/gsd-*` commands parse args. The recommendation text should match the shape of the `/gsd-*` command `build` output (e.g. `Run the gsd_discuss tool on phase 3...`). [VERIFIED: CONTEXT.md D-04]

### 1.5 The tool-execute pattern to reuse
`lib/core-tools.js` registers the orientation tools. The `gsd_next` tool (lines 575-669) is the exact execute-path pattern: `defineTool({ name, description, parameters, output, async execute(args, exec) {...}, presentCall })`. [VERIFIED: lib/core-tools.js:575-669]

- `cwdOf(exec)` resolves the working directory. [VERIFIED: lib/_runner.js:98]
- The execute path reads capability descriptors via `availableCapabilities((k) => ctx.get(k))`. [VERIFIED: lib/core-tools.js:635]
- `gsd_status` (line 128) is the orienting fallback surface. [VERIFIED: lib/core-tools.js:128-227]

**Design implication:** the `gsd_route` execute path needs `ctx` (for `availableCapabilities`) but does **not** need `gsdState` or `cwd` — it is recommend-only and never reads/mutates STATE. It can be registered in `core-tools.js` alongside `gsd_next`. [VERIFIED: CONTEXT.md out-of-scope "does not mutate STATE/ROADMAP"]

### 1.6 Standard stack / conventions
- **No runtime dependencies.** `package.json` has `"dependencies": {}` and only peerDependencies (`@deepseek-ai/dsh-tools`, `@deepseek-ai/schemastery`, `@deepseek-ai/cordis`, `@deepseek-ai/dsh-llm`). [VERIFIED: package.json:134-140] The classifier uses node builtins (String/RegExp/Array) + existing pure helpers (`lib/_shared.js`). [VERIFIED: CONTEXT.md code_context "no new runtime dependencies; node builtins only"]
- **Pure ESM helper discipline.** Pure, side-effect-free, no-ctx, no-I/O modules live in `lib/` and are unit-tested in isolation (e.g. `_next.js`, `_render.js`, `_capabilities.js`, `_shared.js`, `pause-resume.js`, `autonomous.js`). [VERIFIED: lib/_next.js:1-13; lib/_render.js:1-8]
- **Tool+command pairing.** Every loop step ships a `gsd_*` tool AND a `/gsd-*` command, paired via the capability descriptor. [VERIFIED: CONTEXT.md D-01; lib/_capabilities.js TABLE]
- **Recommend-only, never auto-run.** The router returns the recommended command text and does NOT run the routed step tool or inject a followup that runs it in the same turn — honouring the "wait for the user's explicit command before advancing a step" operating rule. [VERIFIED: CONTEXT.md D-02; lib/_next.js:170-174 renderNextRecommendation never claims auto-run]

### 1.7 Pitfalls
- **Pitfall 1 — the router auto-runs the routed tool.** D-02 forbids this. The execute path must return text only; the integration test must assert no subagent spawn and byte-identical STATE. [VERIFIED: CONTEXT.md D-02]
- **Pitfall 2 — recommending an absent command.** D-07 forbids this. The dispatch target set must be derived from present descriptors only. [VERIFIED: CONTEXT.md D-07]
- **Pitfall 3 — `phaseNum` only matches leading digits.** `phaseNum` (`/^(\d+)/`) fails on free-text like "discuss phase 3". The router needs a phase-aware extraction (e.g. `/\bphase\s*(\d+)\b/i` or a bare-number fallback). [VERIFIED: lib/commands.js:21-24]
- **Pitfall 4 — count drift.** Adding `gsd_route`/`/gsd-route` bumps the tool count 32→33 and command count 29→30, and changes the `gsdOrient` descriptor. `mount.test.mjs`, `_capabilities.test.mjs`, and `removal.test.mjs` assert exact counts/lists and MUST be reconciled (as phase 53 did for `gsd_next`). [VERIFIED: test/mount.test.mjs:105-132,147-148; test/_capabilities.test.mjs:67-71; test/removal.test.mjs:228-238]
- **Pitfall 5 — the classifier imports a host-coupled module.** The pure classifier must NOT import `lib/commands.js` (it imports `@deepseek-ai/dsh-llm` and has `apply(ctx)` side effects). The intent→command mapping table must live in the pure module or be derived from `_capabilities.js` (which is pure). [VERIFIED: lib/commands.js:15-16]

---

## 2. Package legitimacy

**No new runtime dependencies are proposed.** The classifier uses node builtins + existing in-repo pure helpers. [VERIFIED: package.json:134-140 `"dependencies": {}`]

| Dependency | Status | Source |
|---|---|---|
| `@deepseek-ai/dsh-tools` (peer) | Existing; `defineTool` used by every tool. | [VERIFIED: package.json:136; lib/core-tools.js:7] |
| `@deepseek-ai/dsh-llm` (peer) | Existing; `createUserMessage` used by commands.js. | [VERIFIED: package.json:139; lib/commands.js:15] |
| `@deepseek-ai/schemastery`, `@deepseek-ai/cordis` (peers) | Existing host-plane deps. | [VERIFIED: package.json:137-138] |
| node builtins (`String`, `RegExp`, `Array`) | No install; used by `_next.js`, `_render.js`, `_shared.js`. | [VERIFIED: lib/_next.js:1-13] |

**Conclusion:** no new package to vet. The "no new runtime deps" constraint (CONTEXT.md code_context) is satisfied by construction. [VERIFIED: CONTEXT.md code_context]

---

## 3. Risks and Open Questions

### Risks
- **R1 — Recommendation/auto-run boundary regression.** If the execute path ever injects a followup or spawns a subagent, it violates D-02 and the human-in-the-loop discipline. **Mitigation:** integration test asserts no subagent spawn + byte-identical STATE; the render helper never emits an auto-run instruction (mirrors `renderNextRecommendation`'s `doesNotMatch(/auto-run/)` assertion). [VERIFIED: test/_next.test.mjs:119-123,233-237]
- **R2 — Never-instruct-a-missing-tool invariant violation.** If the classifier recommends a command whose capability is absent, it violates D-07. **Mitigation:** dispatch target set derived from present descriptors; test matrix retires capabilities and asserts the invariant in every reachable routing state. [VERIFIED: CONTEXT.md D-07]
- **R3 — Count/surface drift.** Adding the tool+command without reconciling `mount.test.mjs` (32→33 tools, 29→30 commands), `_capabilities.test.mjs` (gsdOrient exact list), and `removal.test.mjs` (core-tools retirement) breaks the suite. **Mitigation:** reconcile all three, as phase 53 did for `gsd_next`. [VERIFIED: test/mount.test.mjs:105-132; test/_capabilities.test.mjs:67-71; test/removal.test.mjs:228-238]
- **R4 — Classifier imports a host-coupled module.** Importing `lib/commands.js` into the pure classifier breaks purity. **Mitigation:** keep the mapping table in the pure module (or derive from `_capabilities.js`); the execute path renders the recommendation. [VERIFIED: lib/commands.js:15-16]

### Open Questions (all RESOLVED)
- **OQ-1 (RESOLVED): Where is `gsd_route` registered — `gsdOrient` or a dedicated capability key?**
  **Resolution:** register under **`gsdOrient`** (published by `gsd-core-tools`), alongside `gsd_next`. Rationale: (a) `gsd_route` is an orientation/routing surface, not a loop step — `gsdOrient` is its natural home; (b) it mirrors `gsd_next` exactly (pure classifier + recommend-only tool riding `gsdOrient`); (c) it avoids a new plugin row (26→27), a new capability key (24→25), and a new subpath export — the heavier path. Retiring `gsd-core-tools` withdraws `gsd_route`/`/gsd-route` with `gsdOrient`, consistent with `gsd_next`. [VERIFIED: CONTEXT.md D-01 "under an existing capability key (gsdOrient) or a dedicated one decided at plan-time"; lib/_capabilities.js:75-85; test/removal.test.mjs:228-238]
- **OQ-2 (RESOLVED): Where does the pure classifier live?**
  **Resolution:** a new pure module **`lib/_route.js`** exporting `classifyIntent(intent, descriptors)` + a render helper, mirroring `lib/_next.js`. It imports only `_capabilities.js`/`_render.js` (both pure) and node builtins. [VERIFIED: lib/_next.js:1-13; lib/_capabilities.js:1-9; lib/_render.js:1-8]
- **OQ-3 (RESOLVED): How does the classifier know the full command surface for D-10 (explain an absent command)?**
  **Resolution:** the classifier matches the intent against the **full known-command surface** (derived from `allCapabilities()` / a static keyword table), then **gates the recommendation on presence** (the present `descriptors`). When the best-match command's capability is absent, it degrades to the nearest present loop step via `effectiveRoutableStep` (or `gsd_status`) and explains why the requested command is unavailable — never silently picking a different phase. This reconciles D-06 (recommendation target set = present) with D-10 (recognize absent commands to explain unavailability). [VERIFIED: CONTEXT.md D-06/D-10; lib/_render.js:105-116]
- **OQ-4 (RESOLVED): How is the phase number extracted from free text?**
  **Resolution:** a phase-aware regex (e.g. `/\bphase\s*(\d+)\b/i`, with a bare-number fallback when unambiguous) rather than the leading-only `phaseNum` (`/^(\d+)/`). The flag parsing reuses the same flag regexes as `lib/commands.js`. [VERIFIED: lib/commands.js:21-24; CONTEXT.md D-04]
- **OQ-5 (RESOLVED): What is the recommendation text format?**
  **Resolution:** mirror the `/gsd-*` command `build` output shape — e.g. `Run the gsd_discuss tool on phase 3...` — naming the tool to invoke, with extracted phase/options. This is Claude's Discretion (rendering format) and is unit-testable. [VERIFIED: CONTEXT.md D-04; lib/commands.js:66-76]
- **OQ-6 (RESOLVED): Does the router read STATE?**
  **Resolution:** No. The router is capability-aware but not state-aware (that is `gsd_next`'s job). It reads only the intent + present capability descriptors, and never reads/mutates STATE/ROADMAP. [VERIFIED: CONTEXT.md out-of-scope "does not mutate STATE/ROADMAP"; D-06]

---

## 4. Architectural Responsibility Map

| Capability | Tier | Placement | Notes |
|---|---|---|---|
| Intent classification (pure matcher) | **Domain** | `lib/_route.js` | Pure, side-effect-free, no I/O, no async. Consumes intent + descriptors. |
| Capability-aware dispatch gating | **Domain** | `lib/_route.js` (reuses `lib/_render.js` `availableCapabilities`/`effectiveRoutableStep` + `lib/_capabilities.js`) | Single source of truth; never recommends an absent command. |
| Recommendation rendering | **Presentation** | `lib/_route.js` render helper + `gsd_route` execute path in `lib/core-tools.js` | Returns text naming the tool; never auto-runs. |
| Tool registration | **Integration** | `lib/core-tools.js` `apply(ctx)` | Registers `gsd_route` under `gsdOrient`. |
| Command registration | **Integration** | `lib/commands.js` `apply(ctx)` + `COMMANDS` | Registers `/gsd-route` paired to `gsdOrient` (DEGR-03). |
| Data (STATE/artefact read/write) | **— (none)** | — | The router never touches the data tier. |

**Security-sensitive capability check:** the router never mutates STATE/ROADMAP and never auto-runs a tool, so no security-sensitive capability is placed in the wrong tier. The never-instruct-a-missing-tool invariant is a correctness/robustness concern handled entirely in the domain tier. **No BLOCKER.** [VERIFIED: CONTEXT.md out-of-scope; D-02/D-07]

---

## 5. Validation Architecture

| Behaviour | Automated proof | Test file (new) |
|---|---|---|
| Pure classifier maps intents→commands across a matrix (D-03) | Unit tests over `classifyIntent` across an intent→command matrix (synonyms, tool names, loop-step names, action verbs) | `test/_route.test.mjs` (mirrors `test/_next.test.mjs`) |
| Ambiguity handling (D-05) | Unit tests: near-equal matches → ambiguity fallback; dominant match wins | `test/_route.test.mjs` |
| Missing required phase (D-09) | Unit tests: a step command needing a phase with none present → note the missing argument, never fabricate | `test/_route.test.mjs` |
| Empty/garbage intent (D-08) | Unit tests: blank/whitespace/gibberish → `gsd_status` fallback with a note, never throws | `test/_route.test.mjs` |
| Capability-aware dispatch + never-instruct-a-missing-tool (D-06/D-07) | Unit tests retire capabilities and assert the invariant in every reachable routing state | `test/_route.test.mjs` |
| Absent-command degradation (D-10) | Unit tests: intent maps to an absent command → nearest present fallback + explanation, never a different phase | `test/_route.test.mjs` |
| Recommend-only, never auto-run (D-02) | Integration test: `gsd_route` execute returns text, spawns no subagent, STATE byte-identical | `test/route-integration.test.mjs` (mirrors `test/next-integration.test.mjs`) |
| Fallback to `gsd_status` (D-06/D-08) | Integration test: unmatched/ambiguous intent → `gsd_status` recommendation | `test/route-integration.test.mjs` |
| Tool+command registration + count reconciliation | `mount.test.mjs` (32→33 tools, 29→30 commands), `_capabilities.test.mjs` (gsdOrient exact list), `removal.test.mjs` (core-tools retirement unregisters `gsd_route`/`/gsd-route`) | existing tests, reconciled |

**Coverage gate note:** the pure classifier is the highest-value unit surface (mirrors `_next.js`'s matrix testing); the execute path is thin and covered by the integration test. [VERIFIED: test/_next.test.mjs:1-243; test/next-integration.test.mjs:1-308]

---

## 6. Project Constraints (from project conventions)

- **No new runtime dependencies; node builtins only.** [VERIFIED: package.json:134-140; CONTEXT.md code_context]
- **Pure ESM helper discipline** — pure, side-effect-free, no-ctx, no-I/O modules unit-tested in isolation. [VERIFIED: lib/_next.js:1-13]
- **Tool+command pairing** for every surface, paired via the capability descriptor (DEGR-03). [VERIFIED: CONTEXT.md D-01; lib/_capabilities.js TABLE]
- **Recommend-only, never auto-run** — honour the "wait for the user's explicit command before advancing a step" rule. [VERIFIED: CONTEXT.md D-02]
- **Never-instruct-a-missing-tool invariant** — absent capabilities are never recommended. [VERIFIED: CONTEXT.md D-07]
- **Reuse existing patterns over new machinery** — reuse `availableCapabilities`/`effectiveRoutableStep`/`capabilityForTool`/`buildCapability` rather than duplicating routing. [VERIFIED: CONTEXT.md D-06; lib/_render.js:1-13]
- **Count reconciliation** — `mount.test.mjs`, `_capabilities.test.mjs`, `removal.test.mjs` assert exact tool/command/capability counts and MUST be updated when adding `gsd_route`/`/gsd-route`. [VERIFIED: test/mount.test.mjs:105-132; test/_capabilities.test.mjs:67-71; test/removal.test.mjs:228-238]

---

*End of RESEARCH.md — all Open Questions marked (RESOLVED). Ready for planning.*
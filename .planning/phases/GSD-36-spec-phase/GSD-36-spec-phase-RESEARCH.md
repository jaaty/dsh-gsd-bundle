I now have complete information. Here is the RESEARCH.md:

# GSD-36-spec-phase RESEARCH.md

**Researcher's brief:** answer "What do I need to know to PLAN the spec-phase plugin well?" — a full loop-step plugin that produces `SPEC.md` with falsifiable requirements gated by an ambiguity-scoring score, mirroring discuss/plan. All in-repo discrete values below were read this session and quoted verbatim.

---

## 1. Domain analysis

### 1.1 What spec-phase is (upstream contract)
[VERIFIED: `.analysis/gsd-core/commands/gsd/spec-phase.md:15-28` — position `spec-phase → discuss-phase → plan-phase → execute-phase → verify`; the interview, the ≤0.20 gate, and `{phase_dir}/{padded}-SPEC.md` output]
The step clarifies *WHAT* a phase delivers before discuss handles *HOW*. Flow: load phase context → scout codebase → Socratic interview (up to 6 rounds, rotating perspectives) → score ambiguity across 4 weighted dimensions → gate ≤ 0.20 AND all minimums met → write SPEC.md → commit; discuss-phase picks it up on its next run.

### 1.2 The upstream scoring model (weights — fully resolved)
[VERIFIED: `.analysis/gsd-core/gsd-core/workflows/spec-phase.md:9-20`]
- Dimensions + weights + minimums: **Goal Clarity 35% (min 0.75)**, **Boundary Clarity 25% (min 0.70)**, **Constraint Clarity 20% (min 0.65)**, **Acceptance Criteria 20% (min 0.70)**.
- **Ambiguity = 1.0 − (0.35·goal + 0.25·boundary + 0.20·constraint + 0.20·acceptance)**.
- **Gate: `ambiguity ≤ 0.20` AND all dimensions ≥ their minimums.** These are two independent gates; the CONTEXT's D-04 formula (`1 − weighted-mean(clearness)`) matches this exactly, and the weights ARE the ones needed (this was a Claude's-Discretion item — now resolved). `--auto` early-exits the interview when the phase is already clear.

**Pitfall (flag for planner, not a blocker):** the two gates are genuinely independent of each other. At all-at-minimum clarity `(0.75, 0.70, 0.65, 0.70)` the weighted clarity is `0.7075` → ambiguity `0.2925 > 0.20`. So a phase can pass every dimension minimum yet still fail the ≤0.20 overall gate. The spec tool MUST implement both conditions jointly (reject/flag if either fails), not just the ambiguity value — otherwise it would silently accept a dim-minimally-met but overall-ambiguous spec. Mirror upstream's write-anyway-with-flags soft gate (D-06).

### 1.3 The bundle's loop-step plugin pattern (the primary integration surface)
The spec plugin must be a faithful mirror of the discuss plugin ([VERIFIED: `lib/discuss.js:14-22, 75-163`] — `name`/`inject`/`apply` shape, `ctx.provide(key, buildCapability(key))`, `ctx.tools.register(defineTool({...}))`, `cwdOf(exec)`, `ensurePhaseBranch` → `writeArtifact` → `setActivePhase` → `addDecision` → `commitArtifacts`). Every capability key, order slot, tool name and command name is a discrete, read-this-session value (see the contract table in §6).

### 1.4 Capability surface change — discrete values (critical)
`lib/_capabilities.js` is the single source of truth and is currently a closed 10-key surface ([VERIFIED: `lib/_capabilities.js:22-33`, 39-150]):
- **`CAPABILITY_KEYS`** currently `["gsdMapCodebase", "gsdOrient", "gsdJobs", "gsdDiscuss", "gsdUi", "gsdPlan", "gsdQuick", "gsdExecute", "gsdVerify", "gsdShip"]`. Insert `"gsdSpec"` between `gsdMapCodebase` and `gsdOrient`? **No** — the CONTEXT's D-01/D-02 is explicit: order slot is **5**, which places `gsdSpec` after the orient/jobs informational pair and immediately before `gsdDiscuss` (order 10). So insert `"gsdSpec"` between `"gsdJobs"` and `"gsdDiscuss"` in the array. This is the one place where "between map-codebase and discuss" is satisfied by ordering via `order`, not by array position.
- **Descriptor** to add (mirroring the discuss row at `lib/_capabilities.js:73-83`): `step: "spec"`, `role: "step"`, `tools: ["gsd_spec_phase"]`, `commands: ["gsd-spec-phase"]`, `order: 5`, `prereq: []`, `next: ["gsdDiscuss"]`, `produces: ["SPEC.md"]`, `consumes: []`. `role: "step"` per D-01 (loop step, rendered in the chain; not optional/alternate).

### 1.5 Loop rendering & routing (mostly automatic, one explicit edit required)
[VERIFIED: `lib/_render.js`]
- `loopSteps()` (`:80-85`) sorts by `d.order` ascending → spec (5) lands between map-codebase (0) and discuss (10). Automatic.
- `effectiveRoutableStep()` (`:103-114`) finds the first present step with order strictly greater than the would-be step. **Behavioural consequence:** spec at order 5 becomes the new first routable loop step. `effectiveRoutableStep("done", FULL)` currently returns `gsdDiscuss`; with spec present it will return `gsdSpec`. This matches the intended `spec → discuss` flow and is correct, but the render tests asserting the old fallback WILL need updating (see §6).
- **Explicit edit required per D-02:** the persona step paragraph map `STEP_PARAGRAPHS` (`lib/_render.js:147-164`) has no `gsdSpec` entry; add one alongside `gsdDiscuss` (D-02: "no hardcoded command-list edit is required **beyond adding the step paragraph**"). It renders only when the capability is present.
- The opener chain string `"Discuss -> (UI design, optional) -> Plan -> Execute -> Verify -> Ship"` (`:191`) and the persona core `:189` do NOT name spec. Whether to prepend "Spec ->" to that literal is a Claude's-Discretion choice; changing the literal is optional and low-risk (it is static prose, capability-gated only per-step paragraphs). Recommend a one-word edit to `"Spec -> Discuss -> (UI design, optional) -> Plan -> Execute -> Verify -> Ship"` for faithfulness, but it is not required by any decision and touching it is cosmetic.

### 1.6 STATE transitions & artefacts
[VERIFIED: `lib/state.js`]
- `writeArtifact(cwd, phaseNum, 'SPEC', body)` → `_artifactFile` (`:507-511`) maps a non-PLAN/SUMMARY/CHECKPOINT suffix to `<base>-<suffix>.md`, so `'SPEC'` yields `<NN>-SPEC.md` in the phase dir (`:513-518`). No state.js artefact-shape change needed.
- **`_nextActionFor(step)` (`:347-349`) has NO "spec" key.** Its default fallback is `"discuss-phase"`. So `setActivePhase(cwd, phase, 'spec')` (`:333-345`) already yields `next_action: "discuss-phase"` — correct for D-08 (spec does not gate/block discuss; discuss is the next step). **Recommendation:** add an explicit `spec: "discuss-phase"` entry so the routing is self-documenting rather than relying on the opaque default fallback. One-line, additive, matches every other loop step.
- `_render.js` `NEXT_ACTION_TO_STEP` / `capabilityKeyForNextAction` (`:29-37, 72-77`) already map `"discuss-phase" → gsdDiscuss`; no change needed there because spec never stores `spec-phase` as a next_action.
- `activeStep` is `fm.status` (`state.js:659`); `setActivePhase(cwd, phase, 'spec')` sets `status: "spec"` → the runtime snapshot renders "step spec" ([VERIFIED: `lib/persona.js:49-52`]). `availableCapabilities`/`snapshot` will list spec first among loop steps automatically.

### 1.7 Subagent scoring — the established structured-output pattern
[VERIFIED: `lib/_runner.js:8-32` — `spawnSubagent(ctx, exec, { label, promptText, outputSchema })` returns `{ output, stopReason, diagnostic, structured }`; `lib/map-codebase.js:187` is the exact structured-output precedent (`outputSchema: QUERY_ANSWER_SCHEMA` → `r.structured`)]
D-04/D-05: the ambiguity scorer is a fresh-context subagent producing a schema-validated structured object. Mirror the map-codebase `QUERY_ANSWER_SCHEMA` approach and add a `SPEC_SCORER_PROMPT` to `lib/_agents.js` (the role-prompts module). The subagent receives the assembled SPEC draft + phase REQUIREMENTS/ROADMAP context and returns `{ dimensions: [{ dimension: "goal"|"boundary"|"constraint"|"acceptance", score: 0..1, note, min: number }], ambiguity: 0..1, below_minimum: [dimension, ...] }`. The tool computes ambiguity = `1 − (0.35·goal+0.25·boundary+0.20·constraint+0.20·acceptance)` per §1.2 (defensively, cross-checked against the subagent's own number).

### 1.8 Scoring-subagent degradation (D-07)
`spawnSubagent` results include `diagnostic` and a `stopReason`; an error/timeout rejects the awaited `run.result`. The tool must catch this and degrade to writing SPEC.md with the Ambiguity Report marked `UNAVAILABLE`, reporting the real cause — consistent with the persona's never-throw discipline and the `lib/persona.js` try/catch pattern (`:78-85, 96-101`).

### 1.9 discuss consumption of SPEC.md (D-09)
The bundle's interactive questions are agent-driven: `gsd_discuss`'s description instructs the model to "First hold the discussion with the user … then call this tool" ([VERIFIED: `lib/discuss.js:26`]), and the tool itself never calls `ask_user_question`. The enforcement mechanism for "spec locks what/why" is therefore **documentary**: when `<NN>-SPEC.md` exists, `gsd_discuss` reads it via `s.readArtifact(cwd, phase, 'SPEC')` and (a) echoes its Requirements/Boundaries/Acceptance into `code_context`/`specifics` prefixed with a `LOCKED from SPEC` marker, and (b) its return text tells the driving agent that what/why is already locked and it should only address "how". Absence of SPEC.md preserves current behavior (D-09). The plan tool does NOT consume SPEC this phase (deferred per `## Deferred`).

### 1.10 Interactive vs --auto (the key design fork — see Open Question OQ-1)
D-03 says `gsd_spec_phase(phase, {auto})` where `auto=true` "selects recommended defaults without interaction" and `auto=false` "runs the Socratic interview via ask_user_question." Tools cannot invoke `ask_user_question` mid-execution (`execute.js` surfaces human questions via text markers the driving agent regex-detects — `lib/execute.js:188-190`; there is no direct tool→question plumbing). The faithful resolution aligned to the existing bundle is: the **driving agent** holds the interview with the user (exactly like discuss), then calls `gsd_spec_phase` passing the drafted requirement content and the interview log; `auto=true` means the agent supplied defaults without asking (the tool records that in the Interview Log). With this split, the tool's `execute` becomes: validate → assemble SPEC body → spawn scorer subagent → apply gate → write SPEC.md → advanced STATE → commit → return score + flags.

### 1.11 Plugin-surface plumbing (what must be added beyond lib/spec.js)
Adding a new plugin touches 7 places (all discrete, verified):
1. **`package.json` `exports`** — add `"./spec": { "default": "./lib/spec.js" }` at `package.json:34-75`. `files: ["lib/*.js", ...]` (`package.json:76-86`) already ships the new file; no files-field change.
2. **`cordis.patch.yml`** — add an `- id: gsd-spec` / `name: '@dsh-gsd/bundle/spec'` insert row next to the `gsd-discuss` row.
3. **`test/helpers/mount-harness.mjs` `PATCH_ROWS`** (`:23-35`) — add `{ id: "gsd-spec", sub: "spec" }`.
4. **`test/mount.test.mjs`** — `EXPECTED_TOOL_NAMES` (`:104-115`) add `"gsd_spec_phase"`; `EXPECTED_COMMAND_NAMES` (`:117-129`) add `"gsd-spec-phase"`; update the header counts comment (`:12`: "13 gsd_* tools, 12 /gsd-* commands").
5. **`test/_capabilities.test.mjs`** — `length === 10` (`:13`) → 11; the "10 known keys" list + any explicit key listing gains `gsdSpec`.
6. **`test/render.test.mjs`** — `FULL` descriptor array, `LOOP_ORDER` (`:42`), `loopSteps` deepEqual (`:92`), and `effectiveRoutableStep` fallback assertions (e.g. `without("gsdDiscuss")` now resolves to `gsdSpec`, not `gsdUi`) all need spec-aware updates.
7. **`test/coeffect.test.mjs`** — `SUBAGENT_DRIVEN_SUBS` (`:19`) add `"spec"`; the header comment "six"→"seven"; and spec.js **must** declare `inject: ["gsdState", "tools", "subagents"]` (DEGR-07/D-04) or its coeffect test fails.

The removal suite (`test/removal.test.mjs`) is data-driven from `STEP_CAPS = CAPABILITY_KEYS.filter(role==="step")` + `PATCH_ROWS` (`:30-50`), so adding spec as role `"step"` extends it automatically with no structural change — and its `smokeRemainingSteps` only drives discuss/plan/verify, so spec being present-but-not-smoked is safe, and spec-retired leaves the rest functional.

### 1.12 Falsifiability principle
[VERIFIED: `.analysis/gsd-core/gsd-core/templates/spec.md:7` — "Every requirement must be falsifiable — you can write a test or check that proves it was met or not. Vague requirements like 'improve performance' are not allowed."] Each emitted requirement must carry `Current` / `Target` / `Acceptance` (the concrete pass/fail verifier check). This is the core content rule the tool must enforce in the SPEC body it assembles.

### Confidence levels
- Weights/gate/formula, plugin pattern, capability surface, structured-subagent pattern: **high** ([VERIFIED] against real repo files + upstream reference).
- Interaction-locus decision (agent-driven interview): **medium-high** — resolved by alignment with the existing discuss pattern, but it is a design claim (OQ-1, RESOLVED by recommendation).
- Exact SPEC.md emitted section layout: **medium** — I recommend following the upstream template structure with Edge/Prohibition as out-of-scope placeholders (D-10), but exact wording is executor discretion.

---

## 2. Package legitimacy
No new runtime dependencies are proposed for this phase.
- The scoring subagent needs no new package; it reuses the existing host `subagents` service via `spawnSubagent(...outputSchema)` ([VERIFIED: `lib/_runner.js:8-32`, `lib/_agents.js` role prompts; dependency is the existing `@deepseek-ai/dsh-subagent-spawn-in-process` peer, already declared in the bundle's inject contract]).
- `ask_user_question` is a host agent tool, not a bundle dependency ([VERIFIED: it is referenced in the research-mirror prompt `lib/_agents.js:23` and in discuss's description `lib/discuss.js:26`]; the bundle registers no import for it).
- All `@deepseek-ai/*` peers are already in `package.json` `peerDependencies` (`:93-98`) with no change.
- **Conclusion:** zero new dependencies. Nothing to verify against a registry.

---

## 3. Risks and Open Questions

### Risks
- **R-1 (Moderate):** Adding a `role:"step"` capability changes the default routable path (`effectiveRoutableStep("done")` → `gsdSpec`) and the `CAPABILITY_KEYS.length`. Several hardcoded test lists (§1.11 items 4-6) will fail until updated. **Mitigation:** plan a dedicated test-maintenance task in Wave 1 that updates mount/_capabilities/render/coeffect expectations in the same plan touching `_capabilities.js`/`_render.js`, so tests and product change land together.
- **R-2 (Moderate):** The two independent ambiguity gates (§1.2) are easy to implement as a single check. **Mitigation:** compute ambiguity with the exact 35/25/20/20 weights AND check each `< min`; flag on either.
- **R-3 (Low):** Scoring-subagent unavailability must not hard-block (D-07). **Mitigation:** wrap the `spawnSubagent` await in try/catch, write SPEC.md with `UNAVAILABLE` report + real cause; never throw.
- **R-4 (Low):** Spec's `next_action` relies on `_nextActionFor`'s default fallback unless `spec` is added explicitly (§1.6). **Mitigation:** add the explicit `spec: "discuss-phase"` map entry.
- **R-5 (Low):** If spec.js forgets `"subagents"` in `inject`, the coeffect suite fails (DEGR-07). **Mitigation:** spec.js declares `inject: ["gsdState", "tools", "subagents"]` exactly.

### Open Questions
- **OQ-1 (RESOLVED by recommendation):** Where does the interactive Socratic interview run? The tool cannot call `ask_user_question` mid-execution; the existing `gsd_discuss` pattern externalises the interview to the driving agent and the tool receives sealed structured content. **Resolution:** mirror discuss — the driving agent holds the interview (auto=false) or supplies defaults (auto=true), then calls `gsd_spec_phase` with the drafted requirement content + interview log; the tool's `execute` scores it, applies the gate, writes SPEC.md, advances STATE, and commits. This lets the tool be deterministic and offline-testable. If the planner instead wants the tool to own auto defaulting, that also works for `auto=true` (derive defaults from ROADMAP/REQUIREMENTS per upstream `--auto`), but `auto=false` interaction must remain agent-side. Recommended param shape: `phase` (number, required), `auto` (bool, optional), plus optional structured fields (`goal`, `background`, `requirements[]` each with current/target/acceptance, `boundaries{in,out}[]`, `constraints[]`, `acceptance_criteria[]`, `interview_log[]`) that auto-mode fills from ROADMAP/REQUIREMENTS when omitted.
- **OQ-2 (RESOLVED):** Exact scoring weights. Resolved from upstream workflow §1.2 (35/25/20/20, ambiguity = 1 − weighted-mean), replacing the Claude's-Discretion default. No open blocker.
- **OQ-3 (RESOLVED):** Does the persona opener chain literal need a "Spec ->" prefix? Not required by any decision (D-02 only mandates the step paragraph). Recommendation: add it for faithfulness; treat as cosmetic, low-risk. Not a planning blocker.
- **No unresolved Open Questions** block planning.

---

## 4. Architectural Responsibility Map
Capability → tier, so the planner places each piece correctly. No security-sensitive capability is present in this phase, so no tier is a BLOCKER.

| Capability | Tier | Where | Notes |
|---|---|---|---|
| SPEC artefact write/read (`writeArtifact('SPEC')`, `readArtifact('SPEC')`, `hasArtifact`) | **Data** | `lib/state.js` (existing) | Reuse existing accessors; no new data layer. |
| STATE step transition (`setActivePhase(...,'spec')`, `_nextActionFor`) | **Data** | `lib/state.js` | Add explicit `spec: "discuss-phase"` to the map. |
| Capability descriptor + order slot | **Domain** | `lib/_capabilities.js` | Single source of truth; `gsdSpec` key + TABLE row. |
| Loop rendering / persona paragraph / routing | **Presentation** | `lib/_render.js` | Add `STEP_PARAGRAPHS.gsdSpec`; routing auto-derives order. |
| Tool orchestration `gsd_spec_phase` (assemble body → spawn scorer → gate → write → commit → return) | **Domain** | new `lib/spec.js` | The plugin's `apply`/`execute`. |
| Ambiguity scoring (structured subagent output) | **Integration** | `lib/_agents.js` (new `SPEC_SCORER_PROMPT`) + `lib/spec.js` via `spawnSubagent(...outputSchema)` | Reuse map-codebase structured-output precedent. |
| slash-command `/gsd-spec-phase` | **Presentation** | `lib/commands.js` | Add command row; auto-pairs to `gsdSpec` via `commandToCapability`. |
| Plugin mount/export | **Integration** | `package.json` exports, `cordis.patch.yml`, `mount-harness PATCH_ROWS` | Add `./spec` + `gsd-spec` row. |
| SPEC consumption (locked what/why into CONTEXT) | **Domain** | `lib/discuss.js` | `readArtifact('SPEC')` → echo into specifics/code_context; D-09. |

None of these cross tiers improperly; the scoring subagent (integration) is invoked only by the domain orchestration and never by data/presentation layers.

---

## 5. Validation Architecture
Automated checks that prove each locked behaviour (TDD per D-12), aligned to the existing `node --test test/*.test.mjs` + mount-harness patterns ([VERIFIED: `test/*.test.mjs`, `test/helpers/mount-harness.mjs`]).

| Behaviour | Proof |
|---|---|
| Capability registration + order slot | `test/_capabilities.test.mjs`: `CAPABILITY_KEYS` contains `gsdSpec`, `order === 5`, role `"step"`, `tools`/`commands` names. |
| SPEC.md artefact shape (falsifiable Current/Target/Acceptance + Ambiguity Report) | New `test/spec.test.mjs` (or spec-artifacts): wire `gsd_spec_phase` against FakeFs + a fake scoring subagent, assert `<NN>-SPEC.md` exists, each requirement has Current/Target/Acceptance, and the Ambiguity Report table is present; parse via the artefact read accessors. |
| Soft-gate overage flag | Fake scorer returns ambiguity 0.40 → tool still writes SPEC.md, output/SPEC records the overage + flags below-min dimensions as planner assumptions (D-06). |
| Falsifiability gate | Fake scorer returns a dimension under min → dimension flagged, never silently accepted. |
| discuss consumes an existing SPEC.md | Pre-write `<NN>-SPEC.md` containing Requirements/Boundaries/Acceptance → run `gsd_discuss` → assert CONTEXT.md `specifics`/`code_context` echo the `LOCKED from SPEC` content (D-09), and `readArtifact` was used. |
| Absence-preservation | No SPEC.md → `gsd_discuss` behaves exactly as today (existing `discuss-artifacts.test.mjs` semantics unchanged). |
| --auto vs interactive dispatch | Call the tool with/without `auto`; assert the Interview Log / defaults path differ and the tool's structured params route accordingly (D-03). |
| Subagent coeffect | `test/coeffect.test.mjs`: spec.js `inject` includes `"subagents"` (DEGR-07). |
| Loop routing/render | `test/render.test.mjs`: `loopSteps` places spec between map-codebase and discuss; `effectiveRoutableStep("done")` → `gsdSpec`; persona renders the spec step paragraph; absent-spec subsets unchanged. |
| Mount surface | `test/mount.test.mjs`: `gsd_spec_phase` + `/gsd-spec-phase` registered across full mount; command pairs to `gsdSpec`. |
| STATE step | `test/state.test.mjs`-style: `setActivePhase(cwd, 1, 'spec')` → `status:"spec"`, `next_action:"discuss-phase"`; `_nextActionFor('spec')` returns `"discuss-phase"`. |

Nyquist/coverage gate implication: every SPEC tool behaviour above has a named automated test; no behaviour depends solely on a real LLM call (scoring is injected via the fake-subagents/makeRichSubagents harness).

---

## 6. Project Constraints
From project conventions (read this session):
- [VERIFIED: `lib/_capabilities.js:1-9`] **Zero-dependency, plain-ESM helpers** in the pure modules (`_capabilities.js`, `_render.js`, `_shared.js`) — no `ctx`, no I/O; the new descriptor must stay in `_capabilities.js`'s TABLE and not add dependencies.
- [VERIFIED: `lib/discuss.js:8-12`] Phase tools use `@deepseek-ai/dsh-tools` `defineTool`, import shared helpers from `_shared.js`/`_runner.js`/`_git-artifacts.js`/`_capabilities.js`; reuse these, do not add new machinery (D-11 / the "prefer existing functions and patterns" operating rule).
- [VERIFIED: `lib/_git-artifacts.js:26-29`] **SECURITY:** all git calls use a FIXED argument array with `-C cwd` (never a shell string). Spec commits must go through `commitArtifacts`, never an inline git invocation (the discuss-artifacts test `lib/discuss.js:69-74` enforces "no inline git"; mirror this).
- [VERIFIED: `lib/_capabilities.js:13, 22-33`] Capability `role` must be one of `ROLES`; `gsdSpec` is `role:"step"`.
- [VERIFIED: `lib/state.js:476-496`] Phase dir/base are resolved once per invocation via `phaseDirAndBase` (CQ-01); spec must call it/`writeArtifact`/`readArtifact` through the same accessors, routing writes through `ctx.fs` (DUR-06) — never raw `node:fs/promises` for artefact writes.
- [VERIFIED: `lib/discuss.js:88, 152-158`] Acquire the phase branch via `ensurePhaseBranch` before writing, and commit via `commitArtifacts(cwd, phase, { scope: "spec", phaseName: phase.name })` after the STATE advance — the exact CQ-07/MW-03 out-of-flow auto-commit pattern.
- [VERIFIED: `test/helpers/fake-fs.mjs`, `test/helpers/mount-harness.mjs`] Tests are offline (FakeFs + fake-ctx, no live DSH boot, no LLM/git/gh); the scoring subagent must be injectable (mirror `makeRichSubagents` in `test/removal.test.mjs:56-86` / `makeSubagents`).
- [VERIFIED: `package.json:92`] `"dependencies": {}` — preserve the zero-dependency invariant; no new npm package.

---

*Phase: GSD-36-spec-phase*
*Research complete: no unresolved Open Questions.*
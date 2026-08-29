# Phase 36: spec-phase - Context

**Gathered:** 2026-08-29T22:36:13.591Z
**Status:** Ready for planning

<domain>
## Phase Boundary
**In scope:** Add a spec-phase loop step that produces a SPEC.md with falsifiable requirements (each with Current/Target/Acceptance) gated by an ambiguity-scoring score (≤0.20 across four weighted dimensions: Goal, Boundary, Constraint, Acceptance-Criteria clarity). Full loop-step plugin mirroring discuss.js/plan.js: a gsdSpec capability, a gsd_spec_phase tool, a /gsd-spec-phase command, slotted into _capabilities.js/_render.js between map-codebase and discuss. Produces <NN>-SPEC.md that discuss consumes as locked input. Includes a non-interactive --auto mode. Write-anyway soft gate on ambiguity overage.
**Out of scope:** Edge-completeness and prohibition probes (upstream Step 5.5/5.6) are explicitly out of scope — that is a later phase. No change to gsd_plan/gsd_verify internals this phase beyond discuss.js consuming SPEC.md. No UI component. No spec-phase for the quick path.
</domain>

<decisions>
## Decisions
### Integration structure
- **D-01:** spec-phase is a full loop-step plugin: new gsdSpec capability in _capabilities.js (order between gsdMapCodebase=0 and gsdDiscuss=10, i.e. order 5), gsd_spec_phase tool in a new lib/spec.js, and a /gsd-spec-phase command in command-map — mirroring the discuss.js plugin pattern (defineTool + inject gsdState/tools + ctx.provide(buildCapability("gsdSpec"))).
- **D-02:** Order slot is 5, before discuss (10), after map-codebase (0). loopSteps in _render.js picks it up automatically via the capability table; nextAction routing and the persona body already render present capabilities, so no hardcoded command-list edit is required beyond adding the step paragraph.
- **D-03:** The tool signature is gsd_spec_phase(phase, {auto}) where auto=false runs the Socratic interview via ask_user_question and auto=true selects recommended defaults without interaction. Mirrors upstream --auto / --text; no TUI dependency.
### Ambiguity scoring
- **D-04:** Ambiguity is scored by a fresh-context subagent that reads the SPEC draft (and the phase's REQUIREMENTS/ROADMAP context) and returns a structured score object: four weighted clarity dimensions (Goal, Boundary, Constraint, Acceptance-Criteria), each a 0..1 score plus a note, and a computed overall Ambiguity = 1 - weighted-mean(clearness), gated at ≤0.20.
- **D-05:** Scoring uses structured subagent output (schema-validated, mirroring the gsd_plan subagent pattern in _agents.js) rather than inline model judgment, so the score is reviewable and reproducible; the subagent writes its scored dimension table into the SPEC.md Ambiguity Report.
### Gate behaviour
- **D-06:** The ambiguity gate is a soft gate (write-anyway-with-flags), matching upstream. When score > 0.20 the tool still writes SPEC.md but records the overage, flags the under-minimum dimensions as assumptions for the planner, and reports the score prominently in its output and in SPEC.md. It does not hard-block; the planner treats flagged dimensions as assumptions.
- **D-07:** A failed or unresponsive scoring subagent (subagent error/timeout) does not block the phase: the tool degrades to writing SPEC.md with the Ambiguity Report marked UNAVAILABLE and reports the failure cause with the real error, consistent with the persona's never-throw discipline.
### Interaction with discuss
- **D-08:** spec-phase writes a standalone <NN>-SPEC.md artefact (via writeArtifact('SPEC')) and advances STATE to a 'spec' step. It does not gate or block discuss.
- **D-09:** discuss.js is taught to consume SPEC.md: when <NN>-SPEC.md exists, gsd_discuss reads it and uses its Requirements, Boundaries, and Acceptance Criteria as locked 'what/why' input (echoed as specifics/code_context), skipping re-asking those questions and focusing the interview on 'how'. Absence of SPEC.md preserves current behaviour.
### Scope and error handling
- **D-10:** Edge/prohibition probes are OUT of scope for this phase (falsifiable requirements + ambiguity gate only); upstream template sections for Edge Coverage and Prohibitions are omitted or left as empty/out-of-scope placeholders in the emitted SPEC.md.
- **D-11:** Error-handling strategy: fail fast on environmental faults (no .planning/ project, phase not in ROADMAP, no cwd) with clear errors like discuss.js; degrade-with-flag on subagent/LLM scoring faults (D-07). No new hard state gate introduced this phase.
### Testing and TDD
- **D-12:** The phase is TDD: unit tests cover (a) capability registration + order slot, (b) SPEC.md artefact shape (falsifiable Current/Target/Acceptance + Ambiguity Report), (c) soft-gate overage flag, (d) discuss.js consumption of an existing SPEC.md, (e) absence-preservation when no SPEC.md exists, and (f) --auto vs interactive dispatch. Follow the existing test patterns in test/*.test.mjs.
### Claude's Discretion
- Exact names of helper functions / files inside lib/spec.js (keep within existing conventions).
- Precise wording of the SPEC.md header block and per-dimension min thresholds (default to the upstream mins: 0.75/0.70/0.65/0.70) unless a test demonstrates a problem.
- How many Socratic interview rounds to run interactively (default to a bounded loop like upstream's cap, e.g. up to 3 rounds), with the exact perspectives (Researcher / Simplifier / Boundary Keeper as guidance).
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Step-plugin pattern to mirror
- `lib/discuss.js — the defineTool + inject gsdState/tools + ctx.provide(buildCapability) plugin pattern for a loop-step tool; read its execute body and state transitions`
- `lib/_capabilities.js — capability descriptor table, CAPABILITY_KEYS, ROLES, buildCapability; where gsdSpec + order 5 are added`
### Loop rendering / routing
- `lib/_render.js — loopSteps ordering, nextAction, available-steps + persona step paragraphs; spec must render and route automatically from the capability table`
### State transitions & artefacts
- `lib/state.js — GsdState setActivePhase / writeArtifact / addDecision; how discuss advances STATE to 'plan'`
- `lib/_git-artifacts.js — ensurePhaseBranch + commitArtifacts used by discuss to land CONTEXT on the phase feature branch`
### Subagent pattern for scoring
- `lib/_agents.js — the gsd_plan/plan-checker fresh-context subagent pattern using structured output; reuse for the ambiguity-scoring subagent`
### Upstream reference (WHAT/pattern) — read-only reference, NOT to be vendored
- `.analysis/gsd-core/commands/gsd/spec-phase.md — upstream spec-phase command contract (objective, Socratic interview, ambiguity gate, SPEC.md output)`
- `.analysis/gsd-core/gsd-core/templates/spec.md — upstream SPEC.md template: Requirements with Current/Target/Acceptance, Boundaries, Ambiguity Report with 4 weighted dimensions (Goal Clarity 0.75 / Boundary 0.70 / Constraint 0.65 / Acceptance 0.70 mins), ≤0.20 gate, Interview Log`
### Existing tests
- `test/discuss-artifacts.test.mjs — existing discuss test pattern to model spec tests on`
- `test/*.test.mjs — the node:test + mount-harness conventions used across the suite`
</canonical_refs>

<code_context>
## Code Context
- buildCapability in lib/_capabilities.js is the single source of truth; a new gsdSpec key with order 5, role 'step', tools ['gsd_spec_phase'], command 'gsd-spec-phase', next ['gsdDiscuss'], produces ['SPEC.md'] auto-renders in loopSteps.
- loopSteps() in _render.js sorts descriptors by descriptor.order, so spec (order 5) falls between map-codebase (0) and discuss (10); nextAction routing finds the first step with a strictly greater order.
- discuss.js already calls ensurePhaseBranch + commitArtifacts and advances STATE via setActivePhase(cwd, phase, 'plan'); new state status 'spec' mirrors these patterns.
- writeArtifact(cwd, phase, 'SPEC', body) in state.js produces <NN>-SPEC.md in the phase dir, mirroring CONTEXT/DISCUSSION-LOG writes.
- The persona body in _render.js renders one paragraph per present step capability; a spec-step paragraph must be added alongside the discuss/plan paragraphs.
</code_context>

<specifics>
## Specifics
- Specs are falsifiable: 'Every requirement must be falsifiable — you can write a test or check that proves it was met or not. Vague requirements like improve performance are not allowed.'
- Ambiguity gate: score ≤0.20 across the 4 weighted clarity dimensions.
- Each requirement carries Current / Target / Acceptance (a concrete pass/fail verifier check).
- Upstream SPEC.md includes an Ambiguity Report table with per-dimension score + min + status and an Interview Log; both are expected in the emitted SPEC.md.
</specifics>

<deferred>
## Deferred Ideas
- Edge-completeness probe (upstream Step 5.5) — separate later phase.
- Prohibition (must-NOT) probe (upstream Step 5.6) with test/judgment verification tiers — separate later phase, depends on SPEC + verify wiring.
- SPEC->plan lift of locked requirements into gsd_plan must_haves / plan scope — consume SPEC.md in plan-phase later; only discuss consumes it this phase.
- spec-phase docs in README / COMMANDS that are already handled elsewhere.
</deferred>


---

*Phase: 36-spec-phase*
*Context gathered: 2026-08-29*
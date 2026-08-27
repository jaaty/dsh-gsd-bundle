# Phase 13: gate-dispatch - Context

**Gathered:** 2026-08-27T00:38:43.199Z
**Status:** Ready for planning

<domain>
## Phase Boundary
**In scope:** Replace the gate-name condition chain in runCapabilityGates (lib/gates.js) with an explicit dispatcher map, and derive the {phase}-{plan} conventional-commit scope from structured plan fields (a new structured `phase` field on plan objects) instead of parsing the plan.id string. Update the affected gates tests to the structured shape.
**Out of scope:** No change to the behaviour of the three gate evaluators (security / broken_windows / tdd_audit), no change to the ship.js preflight flow or PR assembly, no change to other phases (14-16).
</domain>

<decisions>
## Decisions
### Gate dispatcher map
- **D-01:** Replace the if/else-if evaluator chain in runCapabilityGates with a module-level GATE_DISPATCH constant mapping each gate name to its evaluator, invoked with a shared data object (changedFiles, contentMap, plans, commitSubjects).
- **D-05:** Fold the report-line detail formatting (currently a name-based ternary) into the dispatcher: each GATE_DISPATCH entry carries both its evaluator and a formatter, removing all name-based branching in one pass.
- **D-04:** The dispatcher throws a clear error if a gate name is missing from the map (defensive fail-fast; GATE_NAMES drives iteration so this should never happen, but a wiring bug must surface immediately).
### Commit scope derivation
- **D-02:** listPlans() adds a structured `phase` field (String(phaseNum)) to each plan object; planScope(plan) derives the scope as `${plan.phase}-${plan.plan}` from structured fields, never by parsing plan.id.
- **D-03:** tddAuditGate's signature is updated to consume the structured plan objects; the existing gates tests (test/gates.test.mjs, test/gates-ship.test.mjs) are updated to pass phase/plan fields and assert the new behaviour. No backward-compatible id-parsing fallback is kept.
### Claude's Discretion
- Exact shape of the GATE_DISPATCH entry (evaluator + formatter signature) and how the shared data object is threaded through runCapabilityGates.
- Naming and placement of the planScope helper after the refactor.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Gate dispatch condition chain
- `lib/gates.js — runCapabilityGates evaluator if/else-if chain (lines 175-177) and detail-formatting ternary (lines 179-183)`
### Commit scope string parsing
- `lib/gates.js — planScope(planId) id-splitting (lines 115-123)`
- `lib/_agents.js:157 — {phase}-{plan} conventional-commit scope convention`
### Structured plan object shape
- `lib/state.js — listPlans() plan object construction (lines 490-523)`
### Call site and tests
- `lib/ship.js — runCapabilityGates call (line 93)`
- `test/gates.test.mjs — tddAuditGate tests (lines 126-164)`
- `test/gates-ship.test.mjs — runCapabilityGates tests`
</canonical_refs>

<code_context>
## Code Context
- GATE_NAMES constant (lib/gates.js:196) drives the iteration in runCapabilityGates, so the dispatcher map keys align with it.
- listPlans() (lib/state.js:490-523) already returns structured plan objects with a `plan` field; adding `phase` is a one-line change.
- planScope currently lives in lib/gates.js and is only used by tddAuditGate.
</code_context>

<specifics>
## Specifics
- Module-level GATE_DISPATCH constant (not inline).
- Add a structured `phase` field to plan objects in listPlans().
- Yes, update tests to the structured shape.
- Defensive throw on unknown gate name.
- Fold the detail formatter into the dispatcher.
</specifics>

<deferred>
## Deferred Ideas
- Phase 15 ship-robustness (async git/gh + real preflight failure causes) — separate phase.
- Phase 16 context-budget (planningContext truncation budget) — separate phase.
</deferred>


---

*Phase: 13-gate-dispatch*
*Context gathered: 2026-08-27*
# Phase 57: mvp-phase - Context

**Gathered:** 2026-09-08T00:28:17.238Z
**Status:** Ready for planning

<domain>
## Phase Boundary
**In scope:** A new gsd_mvp_phase tool plus a /gsd-mvp-phase slash command and gsdMvpPhase capability that guides a minimal-viable-phase planning and execution flow: it interactively proposes a minimal-viable slice of the phase goal (propose-then-confirm), produces a real PLAN.md for that slice, and delegates execution to the normal loop (gsd_execute/verify/ship).
**Out of scope:** Any change to the full loop steps (spec/discuss/plan/execute/verify/ship); any change to gsd_fast_mode (56), gsd_quick, gsd_quick_batch, or gsd_autonomous; automatic complexity detection; retry/continue behaviour on failure — a failed run stops and leaves the phase uncompleted; node-repair (58).
</domain>

<decisions>
## Decisions
### API surface
- **D-01:** Add a new gsd_mvp_phase tool and a /gsd-mvp-phase slash command. Register a new gsdMvpPhase capability under the quick step (role: alternate, mirroring gsdFastMode D-01 of phase 56 and gsdQuickBatch D-01 of phase 55).
### Relationship to fast-mode
- **D-02:** mvp-phase is a distinct sibling to fast-mode (56), not a replacement. fast-mode stays the single-pass path for simple phases; mvp-phase is the richer interactive scoping + real-planning flow. Neither changes the other's behaviour.
### Scoping interaction
- **D-03:** Interactive propose-then-confirm scoping: the tool derives a proposed minimal-viable slice from the phase goal (in ROADMAP) and asks the user to confirm or adjust it before any planning. The confirmed slice becomes the scope the PLAN.md is built against.
### Planning output
- **D-04:** The flow produces a real PLAN.md for the confirmed MVP slice (unlike fast-mode which skips planning). The planning step reuses the normal gsd_plan path so the produced plan is schema-faithful and downstream readers (gap-analysis, execute, verify) consume it cleanly.
### Execution path
- **D-05:** After scoping + planning, execution is delegated to the normal loop steps (gsd_execute, then verify, then ship). mvp-phase does not run its own executor subagent for the MVP slice; it hands off to the standard loop so the phase ships exactly like a loop-shipped phase.
### Error handling
- **D-06:** Fail fast and never auto-retry/continue: if scoping, planning, or the delegated loop throws, the tool stops, leaves the phase uncompleted in STATE (so the operator can re-run or use the full loop), and reports the underlying error with its real cause. No partial 'Complete'.
### Claude's Discretion
- **D-07:** The exact wording of the proposed-MVP prompt, the propose-then-confirm interaction shape (how the user confirms/adjusts), and the lightweight-verify heuristics before delegating to ship are left to the executor.
### Claude's Discretion
- Exact wording of the proposed-MVP prompt and the propose-then-confirm interaction shape
- How the confirmed MVP slice is recorded (e.g. a scoping note in CONTEXT.md vs a dedicated artefact) before planning
- Whether gsd_mvp_phase requires a confirm before delegating to ship
- Lightweight-verify heuristics before handing off to the normal loop
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Sibling additive tool/capability/command template
- `.planning/phases/GSD-56-fast-mode/GSD-56-fast-mode-CONTEXT.md — identical additive tool/capability/command shape to mirror`
- `.planning/phases/GSD-55-quick-batch/GSD-55-quick-batch-CONTEXT.md — earlier sibling template`
### Capability registration
- `lib/_capabilities.js — CAPABILITY_KEYS + TABLE (gsdFastMode entry to mirror for gsdMvpPhase)`
### Command registration
- `lib/commands.js — gsd-fast-mode command entry to mirror for gsd-mvp-phase`
### Normal plan path to reuse
- `lib/plan.js — the gsd_plan path that produces schema-faithful PLAN.md files`
### Normal execute/verify/ship path to delegate to
- `lib/execute.js — gsd_execute`
- `lib/verify.js — gsd_verify`
- `lib/ship.js — gsd_ship PR-creation path`
### Existing quick/fast test pattern
- `test/service-tools.test.mjs — canned-subagent describe block used to test gsd_quick/gsd_quick_batch/gsd_fast_mode offline`
</canonical_refs>

<code_context>
## Code Context
- lib/_capabilities.js and lib/commands.js are the two registration points to extend for the new gsdMvpPhase capability and /gsd-mvp-phase command, mirroring the gsdFastMode additions from phase 56.
- lib/plan.js owns the normal PLAN.md production path; mvp-phase reuses it so the produced plan is schema-faithful and downstream readers (gap-analysis, execute, verify) consume it cleanly.
- lib/execute.js, lib/verify.js, and lib/ship.js own the normal loop steps; mvp-phase delegates execution to them so the phase ships exactly like a loop-shipped phase.
- test/service-tools.test.mjs shows the canned-subagent pattern used to test gsd_quick/gsd_quick_batch/gsd_fast_mode offline; mvp-phase tests can mirror it.
</code_context>

<specifics>
## Specifics
- mvp-phase is a distinct sibling to fast-mode: interactive propose-then-confirm scoping -> real PLAN.md -> delegate to the normal loop (execute/verify/ship).
- The tool proposes a minimal-viable slice derived from the phase goal and asks the user to confirm or adjust before planning.
- A failed run stops and never auto-retries or continues; it leaves the phase uncompleted and reports the real error.
- Additive only: full-loop steps, gsd_fast_mode, gsd_quick, gsd_quick_batch, and gsd_autonomous behaviour are untouched.
</specifics>

<deferred>
## Deferred Ideas
- Automatic complexity detection to decide between fast-mode and mvp-phase (revisit if the two paths blur).
- Retry/continue semantics for mvp-phase on failure (revisit if throughput is flaky).
- A fast path that also reuses gsd_plan when a phase is judged non-simple (keep as full-loop fallback).
</deferred>


---

*Phase: 57-mvp-phase*
*Context gathered: 2026-09-08*
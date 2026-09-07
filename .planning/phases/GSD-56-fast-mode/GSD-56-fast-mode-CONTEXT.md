# Phase 56: fast-mode - Context

**Gathered:** 2026-09-07T17:44:02.909Z
**Status:** Ready for planning

<domain>
## Phase Boundary
**In scope:** A new gsd_fast_mode tool plus a /gsd-fast-mode slash command that provides a lightweight single-pass fast path for a SIMPLE phase: it auto-derives a minimal CONTEXT (reusing the autonomous buildAutoContext pattern), skips spec/discuss/plan/plan-checker/gap-analysis, runs the phase's work through a single fresh-context executor subagent, records a SUMMARY.md, performs a lightweight verify read-back, and ships the phase the full way (phase-NN branch, commit, PR, mark Complete in STATE/ROADMAP).
**Out of scope:** Any change to the full loop steps (spec/discuss/plan/execute/verify/ship); any change to gsd_quick (below-loop) or gsd_quick_batch; automatic complexity detection — the caller asserts the phase is simple (optional ROADMAP fast flag); retry/continue behaviour on executor failure — a failed run stops and leaves the phase uncompleted; mvp-phase (57) and node-repair (58).
</domain>

<decisions>
## Decisions
### API surface
- **D-01:** Add a new gsd_fast_mode tool and a /gsd-fast-mode slash command. Register a new gsdFastMode capability under the quick step (role: alternate, mirroring gsdQuickBatch D-01 of phase 55).
### Eligibility / entry
- **D-02:** The caller invokes gsd_fast_mode on a specific phase number, asserting the phase is simple. A per-phase fast: true flag in ROADMAP.md may mark a phase as fast-eligible, but the tool always runs on explicit caller invocation and refuses a phase that is already Complete.
### Single-pass shape
- **D-03:** Reuse buildAutoContext (lib/autonomous.js) to write a minimal 7-block CONTEXT.md marked 'Auto-generated (discuss skipped — fast path)' with full executor discretion.
- **D-04:** Skip spec, discuss, plan, plan-checker, gap-analysis, code-review, ui-review, and validate: a single fresh-context executor subagent performs the phase goal in one pass and writes a SUMMARY.md. No PLAN.md is produced.
- **D-05:** Perform a lightweight verify read-back after the executor completes: confirm the SUMMARY exists, the phase goal in ROADMAP was addressed, and the working tree reflects the change before ship. Full gsd_verify is not required.
### Ship & state
- **D-06:** Ship the full way: ensurePhaseBranch(phase.n), commit the phase's code + artefacts atomically via commitArtifacts, push the branch, open a PR via gsd_ship's path, and mark the phase Complete in STATE and ROADMAP exactly like a loop-shipped phase.
### Error handling
- **D-07:** Fail fast and never auto-retry/continue: if the executor run, verify read-back, or ship throws, the tool stops, leaves the phase uncompleted in STATE (so the operator can re-run or use the full loop), and reports the underlying error with its real cause. No partial 'Complete'.
### Claude's Discretion
- **D-08:** The fast-phase subagent's exact task prompt wording, the SUMMARY.md shape (must remain parseable by downstream SUMMARY readers), and the lightweight-verify heuristics are left to the executor.
### Claude's Discretion
- Exact wording of the fast-phase executor prompt and the STATUS/result summary
- Lightweight-verify heuristics (which artifacts/fields to check before ship)
- Whether gsd_fast_mode also exposes a dry-run or requires confirm before pushing the PR
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Auto-derived CONTEXT builder to reuse
- `lib/autonomous.js — buildAutoContext + writeArtifact(CONTEXT) + ensurePhaseBranch + commitArtifacts pattern`
### Branch/commit seam
- `lib/_git-artifacts.js — ensurePhaseBranch(cwd, phase.n), commitArtifacts(cwd, phase.n, { scope, phaseName })`
### Subagent spawn helper
- `lib/_runner.js — spawnSubagent + cwdOf`
### Capability registration
- `lib/_capabilities.js — CAPABILITY_KEYS + TABLE (gsdQuickBatch entry to mirror for gsdFastMode)`
### Command registration
- `lib/commands.js — gsd-quick-batch command entry to mirror for gsd-fast-mode`
### Ship path to reuse
- `lib/ship.js — the PR-creation path (branch push + gh PR) that fast-mode's full ship delegates to`
### Phase-55 sibling template
- `.planning/phases/GSD-55-quick-batch/GSD-55-quick-batch-CONTEXT.md — identical additive tool/capability/command shape`
### Existing quick test pattern
- `test/service-tools.test.mjs — canned-subagent describe block used to test gsd_quick/gsd_quick_batch offline`
</canonical_refs>

<code_context>
## Code Context
- lib/autonomous.js provides buildAutoContext(phase) which returns a schema-faithful 7-block CONTEXT.md and already does writeArtifact(cwd, phase.n, 'CONTEXT', ...) + ensurePhaseBranch + commitArtifacts — the exact single-pass artefact-creation flow fast-mode needs.
- lib/_git-artifacts.js ensurePhaseBranch/commitArtifacts are idempotent and no-throw in project-less/non-repo workspaces, so fast-mode can reuse them for the phase branch + atomic commit.
- lib/commands.js and lib/_capabilities.js are the two registration points to extend for the new /gsd-fast-mode command and gsdFastMode capability.
- lib/ship.js owns the PR-creation path; fast-mode delegates its full-ship step there so branch-push/PR behaviour stays single-source.
- test/service-tools.test.mjs shows the canned-subagent pattern (label.startsWith('quick')) used to test gsd_quick offline on FakeFs; fast-mode tests can mirror it with a 'fast' label.
</code_context>

<specifics>
## Specifics
- Single-pass means: auto-CONTEXT -> one executor -> SUMMARY -> lightweight verify -> full ship (branch + PR + Complete). No PLAN.md, no plan-checker, no gap-analysis.
- The caller asserts the phase is simple; a fast: true ROADMAP flag is optional metadata, never a hard gate.
- A failed run stops and never auto-retries or continues; it leaves the phase uncompleted and reports the real error.
- Additive only: full-loop steps, gsd_quick, and gsd_quick_batch behaviour are untouched.
</specifics>

<deferred>
## Deferred Ideas
- Automatic simplicity detection for phases (phase 57 mvp-phase may formalize eligibility guidance).
- Retry/continue semantics for fast-mode on executor failure (revisit if single-pass throughput is flaky).
- A fast path that also reuses gsd_plan when a phase is judged non-simple (keep as full-loop fallback, not fast-mode).
</deferred>


---

*Phase: 56-fast-mode*
*Context gathered: 2026-09-07*
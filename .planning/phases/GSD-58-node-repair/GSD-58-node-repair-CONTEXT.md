# Phase 58: node-repair - Context

**Gathered:** 2026-09-08T03:17:54.689Z
**Status:** Ready for planning

<domain>
## Phase Boundary
**In scope:** A new gsd_repair orchestrator tool (+ /gsd-repair slash command) that, when invoked on a phase whose VERIFICATION.md status is `gaps_found`, automatically drives bounded recovery rounds of gsd_plan(gaps=true) → gsd_execute(gapsOnly) → gsd_verify(gaps) and reports the outcome; a per-round REPAIR.md log committed with the phase artefacts; updated gaps_found routing text in gsd_verify pointing to gsd_repair; bounded repair wiring into gsd_autonomous in place of its immediate hard stop on gaps_found; unit/integration tests and updated mount/capability counts for the new tool+command.
**Out of scope:** A new loop step plugin / capability service for repair (repair is an action, not a step); auto-repair of `human_needed` statuses; re-running or modifying gsd_plan/gsd_execute/gsd_verify internals beyond the routing text; repairing other failure classes (code-review BLOCKERs, plan-checker failures outside gap-closure mode, ship-gate failures); config.json round-budget knob; concurrent multi-window repair orchestration.
</domain>

<decisions>
## Decisions
### Tool surface & trigger model
- **D-01:** Node-repair ships as a NEW standalone orchestrator tool `gsd_repair` (with a paired /gsd-repair slash command), NOT as a new loop step plugin and NOT as a flag on gsd_verify. No capabilities/render/removal-matrix churn beyond registering the one new tool + command.
- **D-02:** gsd_verify itself never auto-repairs. Its `gaps_found` route text is updated to recommend gsd_repair (recommend-only, matching the loop's no-auto-advance discipline); the human or a wrapper still invokes it explicitly.
- **D-03:** gsd_repair accepts { phase, rounds? } where rounds (1..2) overrides the default budget of 2 for that single invocation; there is no config.json knob in this phase (hard-coded default 2).
### Failure scope
- **D-04:** Only verification status `gaps_found` triggers repair rounds. `human_needed`, a missing VERIFICATION.md, or an unparseable status each stop immediately with their clear cause — agent faults and human-owned items are not machine-fixable plan gaps.
- **D-05:** No-op guard: if gsd_repair is invoked and the phase's VERIFICATION.md already says `passed`, it returns success without spawning any work.
### Repair round loop
- **D-06:** One repair round = gsd_plan(phase, gaps:true) → gsd_execute(phase, gapsOnly:true) → gsd_verify(phase, gaps:true), run in that strict order; a round is only attempted when the previous step succeeded.
- **D-07:** Hard budget of 2 automatic rounds per invocation (default; per-call override via rounds, capped at 2). After the final round, if status is still non-passed, repair stops and reports the remaining gaps instead of looping.
- **D-08:** Repair delegates to the EXISTING gsd_plan / gsd_execute / gsd_verify code paths (their own subagent prompts, plan-checker, STATE transitions, and artefact commits are reused as-is); repair orchestrates and must not duplicate or fork that machinery.
### Autonomous integration
- **D-09:** gsd_autonomous is rewired: on `gaps_found` it runs the bounded repair loop (same shared implementation, same 2-round cap) before continuing to the next phase; phase 49's D-09 final-stop semantics are preserved — a still-non-passed phase after the budget is exhausted remains a hard stop with a clear stopReason.
### Artefacts
- **D-10:** Repair writes/accumulates `<NN>-REPAIR.md` in the phase directory: one section per round (attempt #, actions taken, resulting verify status, and the stop reason when stopping), created on the first round and appended per round; committed with the phase artefacts via commitArtifacts (scope: repair).
### Error & edge-case strategy
- **D-11:** Stop-with-cause is the universal failure mode: if gsd_plan --gaps produces no gap_closure fix plan, or gsd_execute --gaps-only fails mid-task, repair stops immediately with the real cause and does NOT blind-retry the same round; a mid-task execute failure hands off to the existing checkpoint/resume path (phase 4) rather than re-running the plan from scratch.
- **D-12:** No new runtime dependencies — node builtins only; all subprocess usage keeps the explicit-argument-array discipline; repair never force-pushes, force-commits, or bypasses gates (gsd_ship preflight and capability gates stay untouched).
### Claude's Discretion
- Exact wording of the gsd_repair tool-result report sections and the REPAIR.md markdown layout.
- Internal helper naming/file placement (e.g. lib/repair.js vs extending an existing module) — follow existing codebase conventions.
- How the shared repair-round helper is factored so gsd_repair and gsd_autonomous call the same implementation without circular imports.
- Test file naming and split across unit/integration, as long as coverage matches the decisions.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### requirement
- `.planning/REQUIREMENTS.md — CLH-08: Node repair: automatically recover a plan whose verification failed instead of stopping.`
### phase goal
- `.planning/ROADMAP.md — phase 58 node-repair row (phase table + progress table)`
### current verify routing
- `lib/verify.js — status parsing (frontmatter status), setActivePhase, and the gaps_found route text to be re-pointed at gsd_repair`
### gap-closure machinery
- `lib/plan.js — gaps=true gap-closure mode with fix-plan guard; lib/execute.js — gapsOnly filter; lib/_shared.js — matchesGapClosure`
### autonomous hard stop
- `lib/autonomous.js — non-passed hard stop (D-09) at drivePhase/readVerifyStatus; drivePhase is the seam repair plugs into`
### artefact commit conventions
- `lib/_git-artifacts.js — commitArtifacts(cwd, phase, {scope}) seam used by all phase tools`
### command surface
- `lib/commands.js — slash-command registry; existing gsd_* plugin registration + test/_removal test matrix`
### checkpoint resume
- `lib/_checkpoint.js — checkpoint state capture + resume in gsd_execute (phase 4)`
</canonical_refs>

<code_context>
## Code Context
- Recovery-loop building blocks already exist and are production-tested: gsd_plan --gaps (gap-closure mode + fix-plan guard), gsd_execute --gapsOnly, gsd_verify --gaps (re-verification focusing previously-failed items).
- readArtifact/parseFrontmatter status conventions for VERIFICATION.md (passed | gaps_found | human_needed) already implemented in lib/verify.js.
- commitArtifacts in lib/_git-artifacts.js handles planning-artefact commits with a scope; REPAIR.md should reuse it (scope: repair).
- Slash commands live in lib/commands.js keyed by gsdOrient step; new /gsd-repair command pairs to the new tool.
- Subagent spawning seams (spawnSubagent ctx) exist for plan/execute/verify; repair should delegate through the existing tool code paths rather than duplicating prompts.
- Checkpoint prepare/process helpers in lib/_checkpoint.js give mid-execution resume for a failed fix-plan task.
- Every prior phase in this repo registers tools + commands, updates mount/capabilities/render counts, and extends the removal/capabilities tests — phase 58 follows the same house pattern.
</code_context>

<specifics>
## Specifics
- CLH-08 (verbatim): "Node repair: automatically recover a plan whose verification failed instead of stopping."
- Human, on which outcomes trigger repair: "gaps_found only — human_needed and unparseable/missing reports stop with a clear cause (agent faults are not plan gaps)."
- Human, on round budget: "2 rounds — two attempts before stopping, covers fix plans that only partially close gaps, still hard-bounded."
- Human, on autonomous: "On gaps_found, autonomous runs up to the repair-round budget, then hard-stops only if still non-passed. D-09's final stop semantics preserved."
- Human, on artefact: "<NN>-REPAIR.md accumulating one section per round (attempt, actions, status, stop reason), committed with the verify artefacts."
</specifics>

<deferred>
## Deferred Ideas
- Auto-repairing code-review BLOCKER findings or plan-checker 3-iteration failures — different failure classes, candidate for a future phase.
- Config-driven repair budget (workflow.max_repair_rounds) — hard-coded default 2 for now.
- Repair across milestone boundaries or concurrently-active multi-window phases.
- Auto-invoking repair from gsd_verify itself or from gsd_next auto-advance.
</deferred>


---

*Phase: 58-node-repair*
*Context gathered: 2026-09-08*
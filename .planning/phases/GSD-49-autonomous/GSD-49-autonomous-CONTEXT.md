# Phase 49: autonomous - Context

**Gathered:** 2026-09-03T03:00:40.939Z
**Status:** Ready for planning

<domain>
## Phase Boundary
**In scope:** Add an autonomous path (gsd_autonomous tool + /gsd-autonomous command + gsdAutonomous capability) that drives all remaining incomplete phases of the active milestone end-to-end without per-phase manual prompting. For each remaining phase in numeric order it: ensures a CONTEXT.md exists (auto-deriving a minimal one from the ROADMAP goal + requirements when absent); then spawns one fresh-context autopilot subagent per phase that invokes gsd_discuss (skipped if context already exists) → gsd_plan → gsd_execute → gsd_verify inline in that order; then reads each phase's VERIFICATION.md status. It re-reads ROADMAP after each phase to catch inserted phases, and produces a per-phase STATUS summary at stop/finish. It pauses/stops only on a hard failure (subagent error, no plans produced, verification gaps_found/stale). It never ships and never runs milestone lifecycle.
**Out of scope:** No ship step (autonomous stops at verify; shipping stays a manual gated action). No milestone lifecycle (audit/complete/cleanup — deferred). No range flags (--from/--to/--only — default all-remaining only). No interactive/smart-discuss batch interview mode, no --converge/--cross-ai cross-AI planning, no reviewer selector flags. No per-phase blocker menu (Fix-and-retry / Skip / Stop) and no verification human_needed / gaps closure retries — those are deferred. No code-review/ui-review auto-chaining. No deferred-verification table writes to STATE. No new runtime dependencies.
</domain>

<decisions>
## Decisions
### Integration structure
- **D-01:** autonomous is a new step capability gsdAutonomous declared in lib/_capabilities.js with step:'autonomous', role:'out-of-band', tools:['gsd_autonomous'], commands:['gsd-autonomous'], order:NOT_LOOP_ORDERED (it orchestrates the loop, not a linear phase step), produces:['VERIFICATION.md','STATUS'], consumes:['ROADMAP.md','STATE.md','CONTEXT.md']. The tool is registered in a new lib/autonomous.js via ctx.tools.register(defineTool({...})) and the /gsd-autonomous command in lib/commands.js routing to it.
- **D-02:** Injectable dependencies: ['gsdState','tools','subagents'] (mirrors plan/execute/verify). The tool needs the subagents service to spawn the per-phase autopilot via lib/_runner.js spawnSubagent; fail-fast with a clear error if the service is unavailable.
### Orchestration mechanism
- **D-03:** Per-phase orchestration is a single fresh-context autopilot subagent spawned via spawnSubagent, whose prompt resolves the phase dir and instructs the agent to call gsd_discuss (skip if CONTEXT.md already exists) → gsd_plan → gsd_execute → gsd_verify inline in order for that phase, then report the verify status. This isolates per-phase context, matches how plan/execute/verify already delegate, and keeps the driving agent lean. One subagent per phase, run sequentially.
### Scope per phase
- **D-04:** Each phase runs discuss → plan → execute → verify. gsd_autonomous does NOT ship and does NOT run code-review/ui-review/gap-analysis/validate/milestone-audit. After verify, it reads the phase VERIFICATION.md status and records it in the per-phase status summary.
### Context production (discuss)
- **D-05:** When a phase has no CONTEXT.md, gsd_autonomous auto-derives a minimal CONTEXT.md from the ROADMAP phase goal + requirements, marked 'Mode: Auto-generated (discuss skipped — autonomous path)' with full executor discretion under decisions, then proceeds. When CONTEXT.md already exists it skips discuss entirely. No interview is held (GAP-15 'without per-phase manual prompting').
- **D-06:** The auto-derived minimal CONTEXT.md is written as a planning artefact (phase dir / <NN>-CONTEXT.md) and committed atomically, mirroring the bundle's phase-artefact commit pattern (D-17 commitArtifacts seam) so plan-phase has valid input.
### Phase discovery & sequence
- **D-07:** Phase discovery reads the active milestone from STATE/ROADMAP and filters to incomplete phases (phase_complete !== true). Runs them in numeric ascending order. Re-reads ROADMAP after each phase to catch dynamically inserted phases before the next iteration.
- **D-08:** No --from/--to/--only flags. gsd_autonomous always runs every remaining incomplete phase of the active milestone. If there are no incomplete phases it reports a clean 'nothing to do' status and exits, mirroring graphify's graceful no-op guard.
### Stopping & error handling
- **D-09:** gsd_autonomous stops on hard failure only: a subagent spawn/run error, plan producing no PLAN.md, execute error, or verify returning gaps_found/stale. It halts the run at that point, records the failing phase + step, and reports a full per-phase STATUS summary (phase, name, status: passed/steps-done/failed, stop reason). No per-phase blocker menu, no verification routing questions, no human_needed prompt.
- **D-10:** On a hard failure gsd_autonomous records the stopping context in the phase dir/status and does NOT mutate STATE loop position itself beyond what the invoked step tools already do. It is advisory about the run-level stop: it leaves the failing phase in the state its step tools left it and surfaces the resume command (/gsd-autonomous).
### Status reporting
- **D-11:** gsd_autonomous returns a structured summary: milestone, phases scanned, per-phase {number,name,status}, overall outcome (completed | stopped | nothing_to_do), and optional stop reason + resume command. It renders a concise banner-style text report in the tool text output, consistent with the other gsd_* step tools.
### Testing / TDD
- **D-12:** Follow test/*.test.mjs + mount-harness conventions. Cover: capability descriptor registration (tools/commands/order/produces/consumes), command pairing /gsd-autonomous, no-op when all phases complete, phase discovery ordering, auto-derived CONTEXT.md shape (mode header, goal from ROADMAP, executor discretion), skip-discuss-when-context-exists, per-phase subagent dispatch (via fake/spy subagents factory) producing the STATUS summary, hard-failure stop + resume command, inject deps declared. Model on test/learnings.test.mjs (pure helpers + apply mount + config-gated hook + never-blocks).
### Claude's Discretion
- **D-13:** Exact autopilot subagent prompt wording and how it resolves the phase dir; precise STATUS fields/ordering; how the auto-CONTEXT write routes through commitArtifacts vs a direct write; whether a failed phase blocks subsequent phases immediately or records-and-continues (must settle to a documented default — recommended: stop on first hard failure).
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Upstream autonomous command (WHAT/pattern — read-only reference, NOT to be vendored)
- `.analysis/gsd-core/commands/gsd/autonomous.md — the autonomous command: description, flags, allowed-tools, creates/updates, after-state.`
- `.analysis/gsd-core/gsd-core/workflows/autonomous.md — the full autonomous workflow: init, discover_phases, execute_phase (smart discuss → ui → plan → execute → code-review → verify routing), iterate, lifecycle, handle_blocker.`
- `.analysis/gsd-core/gsd-core/references/autonomous-smart-discuss.md — the smart-discuss batch-table variant (NOT implemented here — D-05 auto-derives instead).`
### Capability + tool + command registration to mirror
- `lib/_capabilities.js — TABLE entry pattern (step/role/tools/commands/order/produces/consumes) and allCapabilities() (D-01).`
- `lib/core-tools.js — ctx.tools.register(defineTool(...)) pattern (D-01).`
- `lib/milestone-audit.js lib/health.js — recent step-plugin tools to model registration + structured output + graceful no-op guards on.`
- `lib/commands.js — COMMANDS array + commandToCapability pairing + sub-fiber command registration (D-01).`
### Subagent orchestration runtime
- `lib/_runner.js — spawnSubagent(ctx, exec, {...}) used by plan/execute/verify/spec; the pattern autonomous uses to spawn the per-phase autopilot (D-03).`
- `lib/plan.js lib/execute.js lib/verify.js — how step tools gather subagents ctx.get('subagents'), call spawnSubagent, and read structured/written artefacts (D-04).`
### State, artefacts, and config
- `lib/state.js — readConfig/readRoadmap/readArtifact accessors; Session Continuity; phase_complete detection.`
- `lib/_shared.js — parseRoadmap (phase.goal + phase.requirements), zeroPad for the <NN>-CONTEXT.md name (D-05).`
- `lib/_git-artifacts.js — commitArtifacts seam for the auto-CONTEXT commit (D-06).`
### Existing tests
- `test/*.test.mjs + test/helpers/mount-harness.mjs — node:test + mount-harness conventions.`
- `test/learnings.test.mjs — the step-plugin test pattern (pure helpers + apply mount + config-gated hook + never-blocks) to model the autonomous tests on (D-12).`
</canonical_refs>

<code_context>
## Code Context
- lib/_capabilities.js holds the descriptor TABLE that single-sources step → tools → commands; a new gsdAutonomous entry slots in here (D-01).
- lib/commands.js pairs /gsd-* commands to capabilities and registers each via a sub-fiber keyed on the owning capability; /gsd-autonomous goes here (D-01).
- lib/_runner.js spawnSubagent is the established seam for fresh-context delegation — the per-phase autopilot uses it (D-03).
- lib/plan.js/execute.js/verify.js each read .planning/phases/NN-name/, write PLAN/SUMMARY/VERIFICATION artefacts, and set STATE step transitions — autonomous composes these existing tools rather than re-implementing their logic (D-04).
- lib/state.js readRoadmap/parseRoadmap gives phase goal + requirements for the auto-derived minimal CONTEXT.md (D-05).
- The bundle is at 49/51 phases; phase 50 (add-tests) is the next real target phase autonomous will drive.
</code_context>

<specifics>
## Specifics
- GAP-15 verbatim: 'An autonomous path can drive all remaining phases of a milestone end-to-end (discuss  plan  execute per phase) without per-phase manual prompting.'
- User Q1 answer: autopilot subagent per phase, spawned via the established spawnSubagent seam, running discuss→plan→execute→verify inline (D-03).
- User Q2 answer: auto-derive a minimal CONTEXT.md from the ROADMAP goal + requirements when absent; skip discuss when CONTEXT.md exists; no interview (D-05).
- User Q3 answer: scope is discuss  plan  execute  verify; no ship; no lifecycle (D-04).
- User Q4 answer: stop on hard failure only; no blocker menu, no verification routing (D-09).
- User Q5 answer: default all-remaining incomplete phases; no --from/--to/--only flags (D-08).
</specifics>

<deferred>
## Deferred Ideas
- Interactive smart-discuss batch-table mode (--interactive) that pauses per grey area for user accept/override — out of scope.
- --converge/--cross-ai planning through plan-review-convergence, reviewer-selector flags, --max-cycles — out of scope.
- --from N / --to N / --only N range flags — out of scope (D-08).
- Per-phase blocker menu (Fix-and-retry / Skip / Stop) and verification routing (human_needed prompt, gaps closure retry, deferred-verification STATE table) — out of scope (D-09).
- Code-review + fix auto-chaining and UI-review after execution (steps 3c.5/3d.5) — out of scope (D-04).
- Milestone lifecycle step: audit → complete → cleanup after all phases — out of scope; belongs in a later phase.
- Auto-generated CONTEXT detection of spike/sketch/deliberation/research context types — the bundle has none.
</deferred>


---

*Phase: 49-autonomous*
*Context gathered: 2026-09-03*
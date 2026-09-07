# Phase 53: smart-entry - Context

**Gathered:** 2026-09-07T02:13:59.031Z
**Status:** Ready for planning

<domain>
## Phase Boundary
**In scope:** A gsd_next tool plus /gsd-next slash command that classifies the current project state and routes the user to the best next action, and an auto-advance path that re-points STATE.md (active_phase/step) to the next logical workflow step and returns the command the user should invoke. State classifier recognizes: no .planning project, paused handoff present, corrupt/missing STATE or ROADMAP, mid-phase (active phase + step), phase-shipped-needs-next, and milestone-complete. Routing is capability-aware (skips absent optional steps) and reuses the existing _render.js router.
**Out of scope:** Freeform natural-language intent routing (CLH-04); quick-batch (CLH-05); fast-mode (CLH-06); mvp-phase (CLH-07); node-repair (CLH-08); auto-running the next step tool without an explicit user command; editing ROADMAP/REQUIREMENTS; renaming phase directories; npm release.
</domain>

<decisions>
## Decisions
### Interface surface
- **D-01:** Phase 53 ships a new gsd_next tool plus a /gsd-next slash command, following the tool+command pairing convention of every other loop step. gsd_status and gsd_progress stay read-only orientation surfaces; gsd_next is the single routing+auto-advance surface.
### Auto-advance semantics
- **D-02:** Auto-advance re-points STATE.md (active_phase + step + recomputed next_action) to the next logical workflow step and returns the command the user should invoke next, but does NOT auto-run that tool in the same turn. This honours the 'wait for the user's explicit command before advancing a step' operating rule.
- **D-03:** A pure, side-effect-free classifier function maps the current .planning/ state to one routing branch and is unit-tested in isolation across the full state matrix before any STATE mutation is applied. The tool's execute path calls the classifier, then applies the branch's (optional) STATE mutation, then returns the recommendation text.
### State classification & precedence
- **D-04:** The classifier recognizes six states, evaluated in this precedence order: (1) no .planning project → gsd_init/gsd_new_milestone; (2) corrupt/missing STATE.md or ROADMAP.md → gsd_health (do NOT mutate STATE, do NOT guess); (3) paused handoff present (HANDOFF.json or .continue-here.md) → gsd_resume_work (do NOT mutate STATE); (4) mid-phase (active_phase set, step not 'done'/shipped) → that step's next action; (5) active phase shipped but pending phases remain → next pending phase; (6) milestone complete (all roadmap phases status 'Complete') → gsd_milestone_audit, then gsd_new_milestone once the audit is ready-to-close.
- **D-05:** Paused-handoff detection reads .planning/HANDOFF.json and the .continue-here.md pointer through the existing gsdState accessors; a present handoff short-circuits to gsd_resume_work and never re-points STATE, so a paused mid-phase session is resumed rather than silently advanced.
### Capability-aware routing
- **D-06:** Routing reuses effectiveRoutableStep / capabilityKeyForNextAction / availableCapabilities / renderAvailableSteps from lib/_render.js as the single source of truth, so smart-entry never recommends a step whose tool/capability is absent (e.g. spec, ui, gap-analysis when those plugins are retired). No parallel step-order table is introduced.
- **D-07:** For the mid-phase branch, the active phase's current STATE step is routed via effectiveRoutableStep; if STATE.status is 'done' or the active phase is already 'Complete' in ROADMAP, the classifier falls through to the phase-shipped-needs-next branch instead of recommending a no-op.
### Next-phase selection
- **D-08:** When a phase has shipped and pending phases remain, the next phase is the lowest-numbered pending phase (deterministic, survives phase-52 reordering). It is set active at step 'discuss' (or 'spec' when the gsdSpec/spec capability is present, mirroring the spec-first ordering added in phase 36), via the existing setActivePhase(cwd, phaseNum, step) mutator which recomputes next_action.
### Milestone-complete branch
- **D-09:** When every roadmap phase is status 'Complete', gsd_next routes to gsd_milestone_audit; if a milestone audit already reports status 'ready-to-close', it routes to gsd_new_milestone instead. This branch re-points neither STATE active_phase nor step — it returns the recommended command for the user to invoke.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Capability-aware routing (single source of truth to reuse)
- `lib/_render.js — effectiveRoutableStep (line 104), capabilityKeyForNextAction (line 73), availableCapabilities (line 57), renderAvailableSteps (line 134), NO_LOOP_NOTICE: the routing primitives gsd_next MUST reuse, not duplicate`
### Orientation tool surface + gsdOrient capability
- `lib/core-tools.js — gsd_status (line 127), gsd_progress, gsd_init (line 84), gsdOrient capability publish (line 56): the existing orientation surfaces and the model-bound orient capability gsd_next sits alongside`
### STATE mutator + next-action mapping
- `lib/state.js — setActivePhase(cwd, phaseNum, step) (line 421) recomputes next_action via _nextActionFor (line 435); readState/readRoadmap/isProject are the project-state accessors; frontmatter fields active_phase, status, next_action, progress.{total_phases,completed_phases}`
### Paused-handoff detection
- `lib/pause-resume.js — readHandoff + .continue-here.md detection (lines ~61-150): the existing handoff surface the paused-state branch routes to`
### Corrupt-state diagnostic
- `lib/health.js — gsd_health: the diagnostic the corrupt/missing STATE or ROADMAP branch routes to`
### Milestone-close path
- `lib/milestone-audit.js — gsd_milestone_audit and the 'ready-to-close' status; the milestone-complete branch routes here, then to gsd_new_milestone`
### Atomic-commit seam
- `lib/_git-artifacts.js — commitArtifacts(cwd, phaseNum, opts, gitFn) (line 174): the established atomic-commit seam for the STATE.md re-point gsd_next performs on auto-advance`
### Slash-command registration
- `lib/commands.js — gsd-commands plugin: name/description/hint/build entries; a new gsd-next command slots in alongside gsd-status/gsd-progress/gsd-resume-work`
</canonical_refs>

<code_context>
## Code Context
- effectiveRoutableStep(nextAction, descriptors) in lib/_render.js already turns a STATE next_action string into a capability-aware routable step — the natural seam for the mid-phase branch; no new step-order table is needed.
- STATE.md frontmatter holds active_phase, status (the step), next_action, and progress.{total_phases,completed_phases}; setActivePhase(cwd, phaseNum, step) is the existing mutator that also recomputes next_action via _nextActionFor — the single write path gsd_next should use for the auto-advance re-point.
- ROADMAP phases carry status 'Complete' | 'pending' (parseRoadmap in lib/_shared.js); milestone-complete = roadmap.phases.every(p => p.status === 'Complete'); next-pending-phase = min(p.n for p in phases if p.status === 'pending').
- gsd_resume_work already reads HANDOFF.json and .continue-here.md and restores context — the paused-state branch just routes there rather than re-implementing resume.
- gsd_health is the corrupt-state diagnostic — the corrupt/missing STATE|ROADMAP branch routes there and does not attempt to re-point STATE.
- gsd_milestone_audit writes a milestone-scoped audit with a 'ready-to-close' status; gsd_new_milestone starts a new milestone — the two-step milestone-close routing.
- commitArtifacts(cwd, phaseNum, opts, gitFn) in lib/_git-artifacts.js is the established atomic-commit seam for .planning/ artefacts, used by every tool that mutates STATE/ROADMAP.
- The /gsd-* command layer in commands.js centralizes usage (hint, phaseNum) — a new gsd-next command slots in alongside gsd-status/gsd-progress/gsd-resume-work.
</code_context>

<specifics>
## Specifics
- User confirmed: new gsd_next tool + /gsd-next command (tool+command pairing); gsd_status and gsd_progress stay read-only.
- User confirmed: auto-advance re-points STATE (active_phase/step) and returns the command to invoke, but does NOT auto-run the next step tool in the same turn — honours the explicit-user-command operating rule.
- User confirmed: the classifier recognizes all six states — no project, corrupt/missing STATE|ROADMAP, paused handoff, mid-phase, phase-shipped-needs-next, milestone-complete.
- User confirmed: next-phase selection is the lowest-numbered pending phase (survives phase-52 reordering), set active at step 'discuss' (or 'spec' when the spec capability is present).
- User confirmed: routing is capability-aware and reuses the existing effectiveRoutableStep router from lib/_render.js so absent optional steps (spec/ui/gap-analysis) are never recommended.
</specifics>

<deferred>
## Deferred Ideas
- Freeform natural-language intent routing (CLH-04) — out of scope; gsd_next takes no intent string and does not parse plain English.
- Quick batch (CLH-05), fast-mode (CLH-06), mvp-phase (CLH-07), and node-repair (CLH-08) — separate later CLH phases.
- Auto-running the routed step tool without an explicit user command — deliberately out of scope to preserve the loop's human-in-the-loop discipline.
- A 'next' boolean flag on gsd_progress that delegates to gsd_next — considered and deferred; gsd_next is the single routing surface to keep responsibilities clear.
</deferred>


---

*Phase: 53-smart-entry*
*Context gathered: 2026-09-07*
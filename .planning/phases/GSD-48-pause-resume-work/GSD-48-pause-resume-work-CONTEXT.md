# Phase 48: pause-resume-work - Context

**Gathered:** 2026-09-03T01:54:31.132Z
**Status:** Ready for planning

<domain>
## Phase Boundary
**In scope:** Add pause-work and resume-work as gsd_* tools (gsd_pause_work, gsd_resume_work) plus /gsd-pause-work and /gsd-resume-work slash commands that route to them. pause-work detects the active phase (or falls back to the .planning/ root), gathers complete state (position, completed/remaining work, decisions, blockers, non-terminal async jobs, uncommitted files, next action), writes .planning/HANDOFF.json (structured) plus a .continue-here.md pointer, and commits both as a WIP commit on the current branch. resume-work reads HANDOFF.json (or falls back to detecting incomplete work: PLAN-without-SUMMARY, .continue-here files), presents a full status + next-action recommendation, updates STATE's Session Continuity, and deletes HANDOFF.json after successful consumption. Both are advisory — they never advance the loop position.
**Out of scope:** No new capability and no loop-step registration — pause/resume are utility commands, not phase steps. No spike/sketch/deliberation/research context detection (the bundle has none). No active STATE loop-position mutation on resume. No CLI/stdin transport or upstream exit-code contract. No blocking-constraints / anti-patterns enforcement gate in discuss/execute (upstream parses the table and enforces an understanding check — out of scope for the bundle's minimal surface).
</domain>

<decisions>
## Decisions
### Integration structure
- **D-01:** pause-work and resume-work are gsd_* tools (gsd_pause_work, gsd_resume_work) registered via ctx.tools.register(defineTool(...)) in core-tools.js, plus /gsd-pause-work and /gsd-resume-work slash commands in commands.js that route to them. No new capability, no loop-step — they are utility commands, not phase steps.
### Handoff file set
- **D-02:** pause-work writes BOTH .planning/HANDOFF.json (structured, machine-readable) and a .continue-here.md pointer (human-readable) at the context-specific path — the phase dir when a phase is active, else .planning/ root. This matches GAP-14's 'HANDOFF.json + a continue-here pointer'.
### Context detection
- **D-03:** pause-work detects an active phase (a PLAN.md exists in a phase dir) and writes to .planning/phases/XX-name/.continue-here.md; otherwise it falls back to .planning/.continue-here.md. No spike/sketch/deliberation/research detection — the bundle has none.
### Resume behavior
- **D-04:** resume-work is advisory. It reads HANDOFF.json (or falls back to detecting incomplete work: PLAN-without-SUMMARY, .continue-here files), presents a full status + next-action recommendation, and updates STATE's Session Continuity (stoppedAt/resumeFile). It never advances the loop position.
### HANDOFF lifecycle
- **D-05:** HANDOFF.json is one-shot — deleted after a successful resume consumes it, so a stale handoff never shadows newer state. The .continue-here.md pointer may remain as a durable record.
### Git commit
- **D-06:** pause-work commits HANDOFF.json + .continue-here.md as a WIP commit on the current branch (consistent with phase-branch isolation). resume-work does not commit.
### Async jobs
- **D-07:** The handoff records non-terminal jobs from the bundle's single .planning/async-jobs.json manifest (job id, backend, status, expected artifacts, resume command). It does not cancel them; they keep running across the pause. On resume, non-terminal async jobs are surfaced as the primary resume context before treating a PLAN-without-SUMMARY as incomplete work.
### Continue-here template scope
- **D-08:** The .continue-here.md template includes the core sections: current_state, completed_work, remaining_work, decisions_made, blockers, next_action. The upstream blocking-constraints / anti-patterns / infrastructure-state sections and their enforcement gate are out of scope (deferred).
### Error handling
- **D-09:** Both tools fail-fast on environmental faults (no .planning/ project, phase not in ROADMAP) with clear errors mirroring graphify's guards. Otherwise they degrade gracefully: resume-work with no HANDOFF.json and no incomplete work returns a clean 'nothing to resume' status rather than throwing.
### Testing / TDD
- **D-10:** TDD: unit tests cover pause detection (phase vs default), HANDOFF.json shape, .continue-here.md template sections, WIP commit, resume consumption + deletion, fallback detection, advisory no-mutation, async-jobs inclusion, and error handling. Follow test/*.test.mjs + mount-harness conventions.
### Claude's Discretion
- Exact helper/function names inside the pause/resume implementation within existing conventions.
- Precise wording of the HANDOFF.json fields and the .continue-here.md template prose.
- Exact composition/order of the state-gathering reads (STATE, ROADMAP, PLAN, SUMMARY, async-jobs).
- How the WIP commit is routed through the existing commitArtifacts seam vs a direct git call.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Upstream pause-work contract (WHAT/pattern — read-only reference, NOT to be vendored)
- `.analysis/gsd-core/commands/gsd/pause-work.md — the pause-work command: context detection, state gathering, handoff file creation, WIP commit, resume instructions.`
- `.analysis/gsd-core/gsd-core/workflows/pause-work.md — the full pause-work workflow: detect step (phase/spike/sketch/deliberation/research/default), gather step (position, completed/remaining, decisions, blockers, async jobs, uncommitted files), HANDOFF.json schema, .continue-here.md template, WIP commit, confirm.`
- `.analysis/gsd-core/skills/gsd-pause-work/SKILL.md — the pause-work skill surface.`
### Upstream resume contract (WHAT/pattern — read-only reference, NOT to be vendored)
- `.analysis/gsd-core/commands/gsd/resume-work.md — the resume-work command: STATE loading, checkpoint detection, incomplete-work detection, status presentation, next-action routing.`
- `.analysis/gsd-core/gsd-core/workflows/resume-project.md — the resume-project workflow: initialize, load_state, check_incomplete_work (HANDOFF.json / .continue-here / PLAN-without-SUMMARY / async jobs), present_status, determine_next_action, offer_options, route_to_workflow, update_session.`
- `.analysis/gsd-core/skills/gsd-resume-work/SKILL.md — the resume-work skill surface.`
### Bundle tool + command pattern to mirror
- `lib/core-tools.js — ctx.tools.register(defineTool(...)) pattern for gsd_pause_work / gsd_resume_work (gsd_init, gsd_status, gsd_progress, gsd_new_milestone, gsd_job).`
- `lib/commands.js — the COMMANDS array + commandToCapability pairing where /gsd-pause-work and /gsd-resume-work are added.`
### State, artefacts, and config
- `lib/state.js — Session Continuity (stoppedAt/resumeFile, lines 268-302) that resume updates; readConfig/readRoadmap/readArtifact accessors.`
- `lib/_shared.js — parseRoadmap (phase.goal + phase.requirements), zeroPad, readArtifact for phase detection and handoff.`
- `lib/jobs.js + .planning/async-jobs.json — the single non-terminal job manifest the handoff records (D-07).`
- `lib/_git-artifacts.js — the commitArtifacts seam for the WIP commit (D-06).`
### Existing tests
- `test/*.test.mjs + test/helpers/mount-harness.mjs — the node:test + mount-harness conventions used across the suite.`
- `test/learnings.test.mjs — the step-plugin test pattern (pure helpers + apply mount + config-gated hook + never-blocks) to model the pause/resume tests on.`
</canonical_refs>

<code_context>
## Code Context
- lib/core-tools.js registers gsd_* tools via ctx.tools.register(defineTool(...)) — the pattern for gsd_pause_work / gsd_resume_work (D-01).
- lib/commands.js holds the COMMANDS array + commandToCapability pairing — where /gsd-pause-work and /gsd-resume-work are added (D-01).
- lib/state.js Session Continuity (stoppedAt/resumeFile, lines 268-302) is what resume updates (D-04).
- lib/_shared.js parseRoadmap + readArtifact + zeroPad feed phase detection and the handoff (D-03).
- lib/jobs.js + .planning/async-jobs.json hold the non-terminal job manifest the handoff records (D-07).
- lib/_git-artifacts.js commitArtifacts is the seam for the WIP commit (D-06).
</code_context>

<specifics>
## Specifics
- GAP-14 verbatim: 'A pause-work command writes a structured context handoff (HANDOFF.json + a continue-here pointer) and a resume-work command restores full context from earlier artifacts to continue mid-phase.'
- Upstream: HANDOFF.json is the primary resume source; .continue-here.md is the human-readable pointer (D-02).
- Upstream: HANDOFF.json is one-shot — deleted after successful resumption (D-05).
- Upstream: async_jobs entries are the primary resume context — check them first before treating a PLAN-without-SUMMARY as incomplete work (D-07).
- Upstream: resume never emits /clear; it is a session-entry flow (D-04).
</specifics>

<deferred>
## Deferred Ideas
- Blocking-constraints / anti-patterns enforcement gate in discuss/execute (upstream parses the table and enforces a mandatory understanding check for blocking rows) — out of scope for the bundle's minimal surface (D-08).
- Spike/sketch/deliberation/research context detection — the bundle has none (D-03).
- Active STATE loop-position mutation on resume — resume is advisory (D-04).
- CLI/stdin transport and the full upstream exit-code contract — the tools are in-process.
</deferred>


---

*Phase: 48-pause-resume-work*
*Context gathered: 2026-09-03*
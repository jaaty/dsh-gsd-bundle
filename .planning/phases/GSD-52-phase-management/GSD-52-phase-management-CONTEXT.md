# Phase 52: phase-management - Context

**Gathered:** 2026-09-06T20:50:13.539Z
**Status:** Ready for planning

<domain>
## Phase Boundary
**In scope:** A gsd_phase tool + /gsd-phase-manage slash command providing phase CRUD (add, insert at position, remove, reorder, edit) directly against ROADMAP.md, with validation and integrity checks that keep ROADMAP, its ## Progress table, and STATE.md phase/progress data consistent, committed atomically.
**Out of scope:** Renumbering or moving .planning/phases/NN-slug/ directories; editing REQUIREMENTS.md; mutating phase-dir planning artefacts; releasing to npm; the smart-entry/freeform-routing/auto-advance routing behaviours of later CLH phases.
</domain>

<decisions>
## Decisions
### Interface surface
- **D-01:** Phase 52 ships a new gsd_phase tool taking an action enum {add, insert, remove, reorder, edit} plus a /gsd-phase-manage slash command, following the tool+command pairing convention used by every other loop step.
### Renumbering & phase-dir integrity
- **D-02:** Renumbering ripples through ROADMAP phase table, its ## Progress table, and STATE.md phase/progress fields only. .planning/phases/NN-slug/ directories are NEVER renamed or moved by this tool.
- **D-03:** Reorder and remove are blocked for any phase whose status is 'Complete' (shipped) or that equals STATE.md frontmatter.active_phase (in-flight). Only pending, non-active phases may be reordered or removed.
### Validation & integrity checks
- **D-04:** Hard failures (block the write, fail-closed): ROADMAP must parse; every requirements REQ-ID referenced by any phase must exist as a requirement in REQUIREMENTS.md; no duplicate phase slugs and no duplicate phase names; every phase must have a non-empty goal and at least one requirement.
- **D-05:** Progress/STATE drift is auto-healed as part of the write: the ## Progress table is regenerated from the mutated phase list, and STATE.md progress (total_phases, completed_phases = count of status 'Complete') is recomputed to match.
### Atomicity & error-handling
- **D-06:** Fail-closed validation: run every check on the proposed mutated roadmap first; if any hard check fails, nothing is written. ROADMAP.md, its Progress table, and STATE.md are written together atomically in one commit through the existing commitArtifacts git-artifacts seam.
### Edit semantics & edge cases
- **D-07:** Editable per-phase fields are name, goal, requirements (list of REQ-IDs), and the [x] status toggle (pending <-> Complete). add appends at the end; insert places a new phase at an explicit position N; reorder moves a pending phase to a target index.
- **D-08:** Destructive-guard edge cases: removing the currently active phase (active_phase) or the last remaining non-shipped phase requires an explicit confirmation flag (--yes); removing or reordering a shipped/in-flight phase is blocked outright (D-03).
### Claude's Discretion
- Exact CLI arg names and parse rules for each action (e.g. --name, --goal, --reqs, --at, --yes flags), as long as they satisfy D-01..D-08.
- How the tool names/orders the action dispatch in code, and error-message wording for hard-fail vs confirmation cases.
- Whether gsd_status's rendered phase list needs no change beyond reading the recomputed STATE/ROADMAP (assume yes; verify in plan).
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Roadmap model
- `lib/_shared.js — parseRoadmap (line 179) and stringifyRoadmap (line 212): faithful shape = milestone header + phase table (#, Phase, Goal, Requirements, [x] status in Phase column) + ## Progress table`
### Command registration
- `lib/commands.js — gsd-commands plugin: name/description/hint/build entries with phaseNum(raw) parsing; register via ctx.commands.register`
### STATE phase/progress persistence
- `lib/state.js — frontmatter.active_phase, frontmatter.progress.{total_phases,completed_phases}; phase status vocabulary is 'Complete' or 'pending' (line 155/836); completed_phases recomputed from roadmap.phases.filter(status==='Complete')`
### Commit seam
- `lib/_git-artifacts.js — commitArtifacts(cwd, phaseNum, opts, gitFn) (line 174) for atomic artifact commits`
### REQUIREMENTS model
- `lib/_shared.js — parseRequirements (line 239): ids like [A-Z]+-\d+; .planning/REQUIREMENTS.md is the source of the REQ-ID existence check`
</canonical_refs>

<code_context>
## Code Context
- lib/_shared.js parseRoadmap returns { milestoneName, version, phases: [{n, slug, name, goal, requirements, status}] } and stringifyRoadmap rebuilds both the phase table and the ## Progress table — the natural round-trip seam for CRUD mutations.
- parseRequirements gives the authoritative REQ-ID set from REQUIREMENTS.md for the existence check (D-04).
- The /gsd-* command layer already centralizes usage (hint, phaseNum) in commands.js; a new phase-management command slots in alongside gsd-discuss/gsd-progress.
- commitArtifacts(cwd, phaseNum, ...) from _git-artifacts.js is the established atomic-commit seam for .planning/ artefacts.
- STATE.md stores active_phase and progress.{total_phases,completed_phases} in frontmatter; the completed count already derives from roadmap.phases status filtering.
</code_context>

<specifics>
## Specifics
- User confirmed one gsd_phase tool with an action enum (add/insert/remove/reorder/edit) plus /gsd-phase-manage command.
- User confirmed renumbering touches ROADMAP+Progress+STATE only, never phase dirs, and blocks reorder/remove of shipped or in-flight phases.
- User confirmed hard REQ-existence + no-duplicate-slug/name + goal-and-requirements invariants, with Progress/STATE drift auto-healed.
- User confirmed full field edit (name, goal, requirements, status toggle), append default add, explicit position insert, and a confirmation flag for destructive removes.
</specifics>

<deferred>
## Deferred Ideas
- Routing a natural-language intent to phase CRUD (freeform routing, CLH-04) — out of scope for phase 52; gsd_phase takes structured arguments.
- Auto-advance / next-best-action routing (CLH-02/CLH-03).
- Renumbering or renaming .planning/phases/NN-slug/ directories — deliberately out of scope.
</deferred>


---

*Phase: 52-phase-management*
*Context gathered: 2026-09-06*
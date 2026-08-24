# Phase 5: window-ledger - Context

**Gathered:** 2026-08-24T01:19:27.282Z
**Status:** Ready for planning

<domain>
## Phase Boundary
**In scope:** Add the .planning/WINDOWS.md append-only multi-window ledger and the .planning/async-jobs.json registry, and surface both through gsd_status (two new sections: '## Windows' and '## Async Job History'), keeping the existing Session Continuity block. Windows entries reference phase-4 CHECKPOINT artefacts optionally. All offline, zero-dep.
**Out of scope:** A real background-job runtime/executor (the manifest is a registry only); the conversational UAT loop; capability gates; per-plan worktrees; intel mode.
</domain>

<decisions>
## Decisions
### Window ledger shape
- **D-01:** WINDOWS.md is an append-only markdown ledger. One entry per closed window: id (WIN-<seq>), phase+step at open and at close, started/completed timestamps, a one-line summary, and an optional CHECKPOINT-<PP> link. Phase tools append an entry when a window closes or a resume happens.
- **D-02:** The ledger lives at .planning/WINDOWS.md and is written/read through the GsdState artefact API (a dedicated accessor, not a per-phase artefact). It is durable across sessions.
### Async-jobs manifest
- **D-03:** The async-jobs manifest is a registry the phase tools write to: each entry has an id (JOB-<seq>), kind, status (pending|running|done|failed), started/completed timestamps, and a result string. It does NOT execute background work — the bundle has no job runtime. It represents planned/scheduled jobs surfaced read-only by gsd_status.
- **D-04:** The manifest lives at .planning/async-jobs (JSON or markdown — the planner picks the simpler zero-dep shape; a JSON array is preferred for machine-readability with no parser dep).
### Status rendering
- **D-05:** gsd_status gains two new sections: '## Windows' (rendered from WINDOWS.md: recent windows, current window) and '## Async Jobs' (rendered from the manifest: pending/active/failed jobs). The existing 'Session Continuity' block stays. Missing files render an explicit 'no windows recorded' / 'no jobs' line, not an error.
- **D-06:** If WINDOWS.md or the async-jobs manifest is corrupt/unparseable, gsd_status renders a short warning line in the section (not a thrown error) — gsd_status is an orientation surface and must not crash the session over a bad ledger. Absence = empty section.
### Checkpoint link
- **D-07:** WINDOWS.md entries may reference a phase-4 CHECKPOINT-<PP> artefact by name, so a resumed session can jump from the window log to the exact checkpoint. They are complementary: checkpoint = task-level resume, WINDOWS.md = window-level history.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### gsd_status + gsdState surface
- `lib/core-tools.js — gsd_status execute (lines 83-118): reads STATE.md + ROADMAP.md, renders # GSD STATUS + Session Continuity block`
- `lib/state.js — GsdState artefact accessors; readState/writeState/readRoadmap`
- `lib/_shared.js — parseFrontmatter/stringifyFrontmatter`
### Phase-4 checkpoint artefacts to link
- `.planning/phases/GSD-04-checkpoint-resume/GSD-04-checkpoint-resume-CONTEXT.md — CHECKPOINT-<PP> artefact (last_completed_task, checkpoint_reason, committed_hashes)`
### New artefact file naming
- `lib/state.js _artifactFile — how new files should be named (WINDOWS.md at .planning/WINDOWS.md, async-jobs manifest at .planning/async-jobs.json or .md)`
- `lib/_shared.js — parse helpers for the manifest`
### Intent (opengsd fidelity)
- `README.md line 113 — WINDOWS.md ledger + async-jobs manifest listed among the deferred harness features`
</canonical_refs>

<code_context>
## Code Context
- gsd_status is the surface to modify; it currently builds a lines array from STATE/ROADMAP and appends a Session Continuity block from state.body.continuity.
- The bundle has no background-job runtime (no scheduler, no jobs service); async-jobs is a registry the phase tools write to, surfaced read-mostly by gsd_status.
- The bundle is zero-runtime-dependency (no YAML lib); any new artefact parsing uses parseFrontmatter/stringifyFrontmatter (fenced-frontmatter subset), so WINDOWS.md / manifest must be a simple markdown/frontmatter shape, not arbitrary YAML.
- Tests use node --test + FakeFs + fake subagents; a new describe can drive gsd_status and the ledger writers without LLM.
- Phase 4 added CHECKPOINT-<PP> artefacts with removeArtifact; the ledger should reference these by name without coupling.
</code_context>

<specifics>
## Specifics
- A WINDOWS.md ledger records multi-window execution so a resumed session can reconstruct where the loop is — DUR-03
- An async-jobs manifest tracks background/scheduled jobs (id, status, result) surfaced through gsd_status — DUR-04
</specifics>

<deferred>
## Deferred Ideas
- A real background-job runtime / scheduler — the manifest is registry-only; execution is a later milestone.
- The conversational UAT loop (checkpoint:decision / human-action prompting) — separate later milestone.
- Capability gates (security/broken-windows/TDD-audit ship:pre etc.) — later milestone.
- Per-plan git worktrees — out of scope.
- gsd_map_codebase --query intel mode — separate feature.
</deferred>


---

*Phase: 05-window-ledger*
*Context gathered: 2026-08-24*
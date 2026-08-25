# Phase 10: codebase-query - Context

**Gathered:** 2026-08-25T05:34:39.506Z
**Status:** Ready for planning

<domain>
## Phase Boundary
**In scope:** Implement a query/intel mode for the codebase mapper: a gsd_map_codebase `query` string arg that switches the tool into query mode, spawning a fresh-context query subagent that reads the existing .planning/codebase/ map, does targeted codebase exploration only where the map is silent, and returns a targeted plain-text answer with a Sources section. Clear notices (never throw) when no map exists or the query fails. Delivers CBQ-01 and CBQ-02.
**Out of scope:** Drift detection; targeted re-map / gsd-intel-updater; a structured answer object; query scoping to subtrees; any full re-scan behavior.
</domain>

<decisions>
## Decisions
### Answer mechanism
- **D-01:** A query is answered by a fresh-context query subagent (reusing spawnSubagent) that reads the existing .planning/codebase/ docs, then does targeted codebase exploration only where the map is silent, and returns a targeted answer.
### Re-scan boundary
- **D-02:** The query subagent reads the map first, then does targeted/limited codebase exploration (e.g. glob/grep for the specific symbols/files the question needs) — not a full re-scan, but enough to answer questions the map doesn't cover.
### Argument shape
- **D-03:** Add a single `query` string argument to gsd_map_codebase. When present, the tool runs query mode (answer the question) instead of mapping; it coexists with the existing fast/focus/paths/force flags (query mode ignores them).
### Error handling
- **D-04:** If no .planning/codebase/ map exists yet, return a clear notice telling the user to run gsd_map_codebase first (or pass force to map). If the query subagent fails or returns nothing, return a clear failure message. Never throw.
### Return shape
- **D-05:** Return the targeted answer as plain text, with a short 'Sources' section citing which map doc(s) and/or codebase file(s) informed it.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Existing mapper + codebase accessors
- `lib/map-codebase.js — the existing gsd_map_codebase tool (spawnSubagent at 151, CODEBASE_MAPPER_PROMPT at 149, existing fast/focus/paths/force flags, the deliberate --query omission comment at lines 20-23)`
- `lib/_runner.js — spawnSubagent (fresh-context subagent primitive reused by every phase tool)`
- `lib/state.js — codebaseDir (53), listCodebaseDocs (57), readCodebaseDoc (68) accessors for .planning/codebase/`
- `.planning/codebase/ — the 7 existing map documents (STACK, INTEGRATIONS, ARCHITECTURE, STRUCTURE, CONVENTIONS, TESTING, CONCERNS)`
### Deferred intent
- `.planning/phases/GSD-02-service-tools/GSD-02-service-tools-CONTEXT.md — gsd_map_codebase --query intel mode deferred as a separate milestone feature`
- `.planning/phases/GSD-03-loop-e2e/GSD-03-loop-e2e-CONTEXT.md — same deferral`
- `.planning/phases/GSD-08-capability-gates/GSD-08-capability-gates-CONTEXT.md — same deferral`
</canonical_refs>

<code_context>
## Code Context
- gsd_map_codebase already has the fast/focus/paths/force flags and the spawnSubagent machinery — query mode adds a `query` string arg that switches the tool into query mode instead of mapping.
- gsdState already exposes codebaseDir/listCodebaseDocs/readCodebaseDoc for reading the existing .planning/codebase/ map.
- spawnSubagent (lib/_runner.js) is the established fresh-context subagent primitive — the query subagent reuses it.
- The existing mapper's deliberate --query omission is documented at lib/map-codebase.js:20-23.
- The bundle runs in the host plane with workspace-write file access — the query subagent can read the map and do targeted codebase exploration.
</code_context>

<specifics>
## Specifics
- A query can be asked against the mapped codebase and answered from the existing .planning/codebase/ map plus the codebase itself, without triggering a full re-scan — CBQ-01
- The query path is surfaced through gsd_map_codebase (a --query argument) and returns a targeted answer to the question — CBQ-02
</specifics>

<deferred>
## Deferred Ideas
- Drift detection (noticing when the codebase has changed since the last map) — future extension; this phase is the query path only.
- Targeted re-map / gsd-intel-updater (updating only affected map docs) — future extension.
- A structured answer object (answer + sources + confidence) — this phase returns plain text + sources.
- Query scoping to specific subtrees via a queryScope/paths arg — future extension; this phase is a single query string.
</deferred>


---

*Phase: 10-codebase-query*
*Context gathered: 2026-08-25*
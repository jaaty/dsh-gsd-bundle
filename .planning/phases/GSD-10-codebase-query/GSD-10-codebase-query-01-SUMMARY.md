---
phase: 10-codebase-query
plan: 01
subsystem: map-codebase
tags: [query-mode, intel, subagent, codebase-map]
requires: []
provides: [CODEBASE_QUERY_PROMPT, gsd_map_codebase query arg]
affects: [lib/_agents.js, lib/map-codebase.js]
tech-stack: [node, @deepseek-ai/dsh-tools, dsh-subagent]
key-files:
  created: []
  modified: [lib/_agents.js, lib/map-codebase.js]
decisions: [D-01, D-02, D-03, D-04, D-05]
metrics:
  duration: ~5m
  completed: 2026-08-25
status: complete
actuals:
  tasks: 2
  commits: 1
---

# Phase 10 Plan 01: gsd_map_codebase query/intel mode Summary

Implemented the core query/intel mode for `gsd_map_codebase`: a `query` string argument switches the tool into query mode, where a fresh-context `codebase-query` subagent reads the existing `.planning/codebase/` map (passed via `planningContext`), does targeted codebase exploration only where the map is silent, and returns a targeted plain-text answer with a Sources section. Delivers CBQ-01 and CBQ-02 plus the D-04 never-throw error handling.

## What was built

- **`CODEBASE_QUERY_PROMPT`** (`lib/_agents.js`) — a new exported role prompt for the `gsd-codebase-query` subagent. It requires map-first reading, targeted-only exploration ("do NOT re-scan the whole repo"), a mandatory `Sources` section, the verbatim `FORBIDDEN FILES` rule (so the query subagent never quotes secrets), and "return only the answer — no document writing, no commit".
- **`query` parameter** (`lib/map-codebase.js`) — a `{ type: "string" }` arg added to the `defineTool` parameters, coexisting with `fast`/`focus`/`paths`/`force`.
- **Query-mode branch** in `execute()` — a non-empty trimmed `query` (`if (q)`) runs before any mapping logic, so `fast`/`focus`/`paths`/`force` are ignored in query mode (D-03). It reads the map via `s.listCodebaseDocs`/`s.readCodebaseDoc`, builds a `<planning_context>` block via `planningContext(entries)`, spawns a `codebase-query` subagent via `spawnSubagent`, and returns its output.
- **Never-throw error handling** (D-04) — returns a clear notice when no `.planning/codebase/` map exists (no subagent spawned), and a clear failure message including `stopReason`/`diagnostic` when the subagent returns empty output. An empty/whitespace `query` falls through to normal mapping (OQ-2).

## Verification

- `node --check` passes on both modified files.
- All acceptance-criteria greps pass: `CODEBASE_QUERY_PROMPT` exported + imported, `query:` parameter present, `codebase-query` spawn label, `planningContext` import + use, no-map notice, `query failed` message, `if (q)` guard.
- `FORBIDDEN FILES` rule present in the query prompt (line 318).
- Full test suite passes: **166/166 tests, 0 failures** (no regressions; the `codebase-query` label does not collide with the fake's `map-codebase` mapper branch).

## Known Stubs

None. No TODO/FIXME/placeholder introduced.

## Threat Flags

- **Secret non-disclosure (mitigated):** the query subagent explores the codebase and its answer is returned to the user. The `CODEBASE_QUERY_PROMPT` carries the verbatim `FORBIDDEN FILES` rule from the mapper, so it never quotes `.env`/credentials. This is the security-sensitive behaviour flagged in RESEARCH.md and is correctly placed in the domain-tier prompt.

## Self-Check: PASSED

- `lib/_agents.js` and `lib/map-codebase.js` exist and were modified.
- Commit `7403e96` exists on `main` with the `feat(GSD-10-codebase-query-01)` scope.
- `node --check` on both files exits 0; `npm test` passes 166/166.

---
phase: 10-codebase-query
plan: 02
subsystem: map-codebase
tags: [query-mode, intel, subagent, codebase-map, slash-command, validation]
requires: [GSD-10-codebase-query-01]
provides: [query-mode test coverage, --query slash-command surfacing, VALIDATION.md Nyquist artefact]
affects: [test/tools.test.mjs, lib/commands.js, .planning/phases/GSD-10-codebase-query/VALIDATION.md]
tech-stack: [node, @deepseek-ai/dsh-tools, dsh-subagent]
key-files:
  created: [.planning/phases/GSD-10-codebase-query/VALIDATION.md]
  modified: [test/tools.test.mjs, lib/commands.js]
decisions: [D-01, D-02, D-03, D-04, D-05]
metrics:
  duration: ~10m
  completed: 2026-08-25
status: complete
actuals:
  tasks: 4
  commits: 4
---

# Phase 10 Plan 02: query-mode test coverage, --query surfacing, and VALIDATION.md Summary

Added the deterministic test coverage for `gsd_map_codebase` query mode (fake `codebase-query` subagent branch plus tests for every D-04/D-05/CBQ behaviour), surfaced the `--query` flag on the `/gsd-map-codebase` slash command, and wrote the VALIDATION.md Nyquist artefact. Delivers the verification that CBQ-01 and CBQ-02 hold, the CLI surfacing of the new mode, and the phase's Nyquist gate artefact.

## What was built

- **Fake `codebase-query` subagent branch** (`test/tools.test.mjs`) — a new label branch in `makeSubagents()` that returns a canned sourced answer ("The auth flow uses JWT via lib/auth.js." + a `Sources` section), with a `QUERY_FAIL_MODE` flag that makes it return empty output with a `failed` stopReason for the failure-path test.
- **Query-mode tests** (`test/tools.test.mjs`) — seven new tests in the `gsd_map_codebase` describe block: happy path with an existing map returns the answer with a Sources section and writes no extra docs; no map returns a notice and never throws; subagent failure returns a clear failure message and never throws; fast/focus/paths/force are ignored in query mode; empty/whitespace query falls through to full mapping; the `query` arg is in the compiled schema; `CODEBASE_QUERY_PROMPT` carries the FORBIDDEN FILES rule.
- **`--query` surfacing** (`lib/commands.js`) — the `gsd-map-codebase` `build()` now parses a `--query <question>` flag (the remainder of the raw input, spaces allowed) and, when present, builds a tool-call text that routes the question to `gsd_map_codebase`; the `hint` string now advertises `[--query <question>]`. Verified by a slash-command test using the mount.test.mjs command-capture pattern (handler → `agent.followup`).
- **VALIDATION.md** (`.planning/phases/GSD-10-codebase-query/VALIDATION.md`) — the Nyquist coverage artefact mapping every locked decision D-01..D-05 to its named automated test, with a "Nyquist Coverage" heading, the no-3-consecutive-task-window statement, and a task-coverage table across plans 01 and 02.

## Verification

- `node --check lib/commands.js` exits 0.
- `node --test test/tools.test.mjs` passes: **43/43** in that file.
- Full bundle suite `npm test` passes: **174/174 tests, 0 failures** (no regressions; the `codebase-query` label does not collide with the fake's `map-codebase` mapper branch).
- All acceptance-criteria greps pass: `codebase-query` fake branch + happy-path test, `FORBIDDEN FILES` prompt assertion, `query failed` failure test, `Codebase mapping complete` fall-through assertion, `--query` parse + hint in commands.js, `applyCommands` import + use.

## Known Stubs

None. No TODO/FIXME/placeholder introduced.

## Threat Flags

- **Secret non-disclosure (mitigated):** the query subagent explores the codebase and its answer is returned to the user. The `CODEBASE_QUERY_PROMPT` carries the verbatim `FORBIDDEN FILES` rule from the mapper, and this plan adds a test asserting that rule is present in the prompt. This is the security-sensitive behaviour flagged in RESEARCH.md and is correctly placed in the domain-tier prompt.

## Self-Check: PASSED

- `test/tools.test.mjs`, `lib/commands.js`, and `.planning/phases/GSD-10-codebase-query/VALIDATION.md` exist and were modified/created.
- Four commits exist on `main` with the `(GSD-10-codebase-query-02)` scope: `1524474`, `ce319bc`, `7ba85f4`, `af79687`.
- `node --check lib/commands.js` exits 0; `npm test` passes 174/174.

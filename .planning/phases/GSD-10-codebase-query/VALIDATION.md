# Phase 10: codebase-query — Validation (Nyquist coverage)

## Nyquist Coverage

`nyquist_validation: true` is set in `.planning/config.json`. Every new behaviour
introduced by this phase (the `gsd_map_codebase` query/intel mode) has a named
automated test, and no 3-consecutive-task window across plans 01 and 02 lacks an
automated verify command. Every locked decision D-01..D-05 is mapped to the
test(s) that prove it below.

| Decision | Automated test(s) | File |
|---|---|---|
| **D-01** (fresh-context query subagent reads the map) | "query mode with an existing map returns the subagent's answer with a Sources section" — the fake `codebase-query` subagent (label branch in `makeSubagents`) answers and the tool returns its output | `test/tools.test.mjs` |
| **D-02** (map-first, targeted exploration, not a full re-scan) | `CODEBASE_QUERY_PROMPT` contract (map-first + "Do NOT re-scan the whole repo" + Sources) asserted via the FORBIDDEN-FILES test; "query mode with an existing map returns the subagent's answer with a Sources section" asserts the Sources section cites a map doc (`ARCHITECTURE.md`) and a codebase file (`lib/auth.js`) | `test/tools.test.mjs`, `lib/_agents.js` |
| **D-03** (single `query` arg; query mode ignores fast/focus/paths/force; empty query falls through) | "query arg is present in the compiled schema" (`t.parameters.properties.query.type === "string"`); "query mode ignores fast/focus/paths/force and writes no map docs"; "empty or whitespace query falls through to full mapping" | `test/tools.test.mjs` |
| **D-04** (no-map notice; subagent-failure message; never throw) | "query mode with no map returns a notice and never throws" (`/No .planning\/codebase\/ map exists yet/` + `doesNotReject`); "query subagent failure returns a clear failure message and never throws" (`/query failed/` + `doesNotReject`) | `test/tools.test.mjs` |
| **D-05** (plain-text answer with a Sources section) | "query mode with an existing map returns the subagent's answer with a Sources section" asserts `/Sources/` and `/ARCHITECTURE\.md/` | `test/tools.test.mjs` |

## Task coverage

Every task in plans 01 and 02 is guarded by an automated verify command, so no
3-consecutive-task window lacks coverage.

| Plan | Task | Verify command |
|---|---|---|
| 01 | Task 1 — `CODEBASE_QUERY_PROMPT` + `query` arg + query-mode branch (tracer) | `node --check lib/_agents.js lib/map-codebase.js` + export/`query:`/`codebase-query`/`planningContext`/no-map/`query failed`/`if (q)` greps |
| 01 | Task 2 — error handling + fall-through | `node --test test/tools.test.mjs` (full suite) + FORBIDDEN-FILES grep |
| 02 | Task 1 — fake `codebase-query` branch + happy-path test | `node --test test/tools.test.mjs` |
| 02 | Task 2 — remaining query-mode tests | `node --test test/tools.test.mjs` + FORBIDDEN-FILES / `query failed` / `Codebase mapping complete` greps |
| 02 | Task 3 — `--query` surfacing on `/gsd-map-codebase` | `node --check lib/commands.js` + `node --test test/tools.test.mjs` + `--query` / `applyCommands` greps |
| 02 | Task 4 — this VALIDATION.md artefact | `test -s` + D-01..D-05 grep + Nyquist grep |

The full-suite gate for this phase is `node --test test/tools.test.mjs
test/mount.test.mjs`, which passed in plan-02 task 3 (43/43 in `tools.test.mjs`,
0 fail), and the complete bundle suite `npm test` passed with 0 fail.

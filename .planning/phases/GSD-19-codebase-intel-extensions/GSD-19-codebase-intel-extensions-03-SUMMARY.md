---
phase: 19-codebase-intel-extensions
plan: 03
subsystem: codebase-intel
tags: [structured-output, answer-object, queryScope, query-prompt]
requires: ["GSD-19-codebase-intel-extensions-02"]
provides: ["structured gsd_map_codebase output object", "structured query answer object", "queryScope subtree scoping"]
affects: ["lib/map-codebase.js", "lib/_agents.js", "test/tools.test.mjs", "test/context-wiring.test.mjs"]
tech-stack: [node:test, dsh-tools, node:crypto]
key-files:
  - created: []
  - modified: ["lib/map-codebase.js", "lib/_agents.js", "test/tools.test.mjs", "test/context-wiring.test.mjs"]
decisions: [D-06, D-07, D-08]
metrics:
  duration: 14m
  completed: 2026-08-28
status: complete
---

# Phase 19 Plan 03: structured gsd_map_codebase output + queryScope (CBQX-03/04)

Converts gsd_map_codebase to return a structured object on every path with a
human-readable text render (OQ-1 resolution of D-06), reworks query mode to
return a validated `{answer, sources, confidence}` structured answer object
(CBQX-03; D-06/D-07) with a robust R-4 fallback, updates CODEBASE_QUERY_PROMPT
to demand the structured JSON contract, and adds a queryScope argument that
restricts only the query subagent's targeted exploration to a subtree while the
map docs load in full (CBQX-04; D-08). Includes the R-1 migration of every
existing gsd_map_codebase string assertion (plus the context-wiring source
pattern) to assert on the object's rendered text.

## Task log

1. **Task 1** — object output schema (`kind`/`text`/`answer`/`sources`/
   `confidence`/`drift`/`docs`) + render that falls back to JSON.stringify; every
   execute path now returns an object (`mapping`/`notice`/`answer`/`error`);
   migrated the whole gsd_map_codebase describe block to assert via a
   `renderResult(res)` helper. → commit `e5e6711`.
2. **Task 2** — added `QUERY_ANSWER_SCHEMA`, passed `outputSchema` to
   `spawnSubagent`, assemble `{answer, sources, confidence}` with `clampConfidence`
   and an empty-output→error guard plus a non-empty-plain-text→fallback path;
   updated CODEBASE_QUERY_PROMPT to return a single structured JSON object;
   extended the fake codebase-query to return `structured` and added a
   `QUERY_PLAIN_MODE` flag + structured-answer and R-4 fallback tests. →
   commit `3966897`.
3. **Task 3** — added the `queryScope` parameter, `validatePaths(args.queryScope)`
   in the query branch, and a scope line injected into the query subagent prompt
   (map docs still load fully); added a `queryCaptured` prompt array and a
   captured-prompt scoping test. Also updated `test/context-wiring.test.mjs`
   (source-pattern assertion broken by the query-answer restructure). →
   commit `d098975`.

## Verification

- `node --check lib/map-codebase.js lib/_agents.js` → 0.
- `node --test test/tools.test.mjs` → 62 pass (59 baseline + 3 new: structured
  answer, R-4 fallback, queryScope).
- Full suite `node --test test/*.test.mjs` → **313 pass, 0 fail** (plan-02
  baseline 310, +3 from this plan).
- Acceptance greps: `QUERY_ANSWER_SCHEMA|outputSchema|clampConfidence` all match
  in map-codebase.js; `queryScope` matches (parameter + validation + prompt
  injection); structured-answer test asserts `res.kind === "answer"`,
  `res.sources[0].kind === "map"`, `res.confidence === 0.9`; fallback test
  asserts `res.sources deepEqual []` and `res.confidence === 0`.

## Deviation note (grep count)

The plan's acceptance criterion `grep -c "kind: \"mapping\"\|kind: \"notice\"\|
kind: \"error\"" lib/map-codebase.js returns 3` is not met exactly: the actual
count is 6. This is because the plan's own Task-1 action mandates TWO
`kind: "error"` return sites (query no-map + query subagent failure), plus I
converted the defensive unknown-fast-focus return to `kind: "error"` for strict
"every path returns an object", and a doc comment lists the four kinds. The
functional contract (`kind ∈ {mapping, notice, answer, error}` on every path) is
fully satisfied and the render produces readable text; the "3" target was
internally inconsistent with the mandated error-site count. Behavior-text bytes
are preserved.

## Deviation note (value-schema DSL)

The plan specified `required: ["kind"]` in the tool `output.schema`. The
`defineTool` value-schema DSL (dsh-tools) rejects `required` and requires
`additionalProperties` to be explicitly boolean. `required` is only allowed on
the subagent structured-output path (`assertObjectJsonSchema`), so it was
retained in `QUERY_ANSWER_SCHEMA` and removed from the tool `output.schema`.
`drift: { type: "object" }` also required an explicit `additionalProperties: true`.
The returned objects are unaffected and still carry `kind` on every path.

## TDD Gate Compliance

Not a TDD plan (type: execute, autonomous, no RED→GREEN mandate). Tests were
co-committed with the features in each task's atomic commit; full suite green.

## Known Stubs

None. No TODO/FIXME/placeholder/skipped tests introduced. (Grep hits in
`lib/_agents.js` and `test/tools.test.mjs` are pre-existing prompt template text
and `TODO-01` test-fixture ids, not new stubs.)

## Threat Flags

- Path-scope safety: `queryScope` is validated by the shared `validatePaths`/
  `PATH_FORBIDDEN`, so it cannot escape the repo or smuggle shell metacharacters.
- The query subagent prompt retains the FORBIDDEN FILES / `forbiddenFilesProse()`
  rule, so leaked secret contents are never returned to the user.
- Structured confidence is clamped to `[0,1]` and falls back to 0 on structured
  failure, so the tool never yields NaN/undefined and never throws on degraded
  subagent output.
- All `.planning/` writes continue to route through `ctx.fs`/gsdState (DUR-06);
  no new raw `node:fs` artefact writes.

## Self-Check: PASSED

- `lib/map-codebase.js` exports `apply`, carries the object output schema +
  render, `QUERY_ANSWER_SCHEMA`, `clampConfidence` import, queryScope parameter/
  validation/prompt injection; every execute path returns an object.
- `lib/_agents.js` exports `CODEBASE_QUERY_PROMPT` updated to the structured
  JSON contract (FORBIDDEN FILES preserved).
- Three commits exist on `phase-19`: `e5e6711`, `3966897`, `d098975`.
- Full test suite green (313 pass).

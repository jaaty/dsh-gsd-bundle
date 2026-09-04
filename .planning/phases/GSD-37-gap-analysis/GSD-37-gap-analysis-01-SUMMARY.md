---
phase: 37
plan: 01
subsystem: gap-analysis
tags: [gap-analysis, coverage, loop-step, capability, deterministic-scan, soft-gate]
requires: []
provides:
  - "gsdGapAnalysis capability (step gap-analysis, role loop-step, order 22)"
  - "gsd_gap_analysis tool + /gsd-gap-analysis command"
  - "<NN>-COVERAGE.md coverage table (REQ-ID + D-ID vs runnable plan bodies)"
  - "deterministic literal-ID scan (parseDecisionIds / scanCoverage / findOrphans)"
affects:
  - lib/gap-analysis.js
  - lib/_capabilities.js
  - lib/commands.js
  - test/gap-analysis.test.mjs
tech-stack:
  - node:test
  - ESM
metrics:
  duration: 0
  completed: 2026-08-29
status: complete
actuals:
  tasks: 2
  commits: 1
---

# Phase 37 Plan 01: gap-analysis Summary

Implemented the post-planning gap-analysis step tool (opengsd /gsd-gap-analysis) as a full loop-step plugin. The tool emits a `<NN>-COVERAGE.md` coverage table cross-referencing every phase REQ-ID (ROADMAP `phase.requirements`, text from REQUIREMENTS.md) and every D-ID (parsed from the phase CONTEXT.md decisions block) against the runnable plans' bodies. The scan is a DETERMINISTIC literal-ID scan in pure JS — no subagent, no tokens, fully falsifiable; the semantic 'did they really address it' judgement stays gsd_verify's remit. It is a SOFT gate: it warns + flags uncovered IDs but never blocks gsd_execute.

## Tasks

- **Task 1** — Implemented `lib/gap-analysis.js`: published the `gsdGapAnalysis` capability via `ctx.provide('gsdGapAnalysis', buildCapability('gsdGapAnalysis'))` and registered the `gsd_gap_analysis` tool via `ctx.tools.register(defineTool({...}))` with inject `['gsdState','tools']` (NO subagents coeffect — DEGR-07). Exported the pure, unit-testable helpers `parseDecisionIds` (delegates to shared `parseDecisionEntries`, dedup + ascending sort by numeric part, whole-ID safety), `scanCoverage` (frontmatter hit + body/prose hit with frontmatter stripped; frontmatter-only = 'declared, not elaborated' but still Covered), and `findOrphans` (REQ-shaped `/[A-Z]+-\d+/` and D-shaped `/\bD-\d+\b/` tokens in runnable plans not in the known candidate set). In `apply()`: fail-fast only on baseline guards (no .planning/ project, phase not in ROADMAP, gsdState unavailable); acquired the per-phase feature branch (`ensurePhaseBranch`); gathered phase-scoped REQ-IDs and CONTEXT D-IDs (missing CONTEXT → `context:'unavailable'` degrade); gathered runnable plans (exclude superseded, include gap_closure); scanned + assembled the coverage table; wrote `<NN>-COVERAGE.md` via `writeArtifact` with status frontmatter (`status: covered|gaps`, `gap_ids`, `coverage_pct`, `phase`, `generated`); advanced STATE toward execute (`setActivePhase 'execute'` pass-through); committed via `commitArtifacts`. Soft gate: never blocks gsd_execute.
- **Task 2** — Registered the `gsdGapAnalysis` descriptor row in `lib/_capabilities.js` (step `gap-analysis`, role `loop-step`, tools `['gsd_gap_analysis']`, commands `['gsd-gap-analysis']`, order 22, produces `['<NN>-COVERAGE.md']`, consumes `['ROADMAP.md','REQUIREMENTS.md','CONTEXT.md','PLAN.md']`) and appended it to CAPABILITY_KEYS. Added the `/gsd-gap-analysis` command to `lib/commands.js`. Created `test/gap-analysis.test.mjs` covering capability descriptor registration, command pairing, pure helpers (parseDecisionIds dedup/sort/whole-ID, scanCoverage frontmatter+body+declared-not-elaborated, findOrphans), phase-scoped REQ extraction, missing-CONTEXT degrade, soft-gate no-block, superseded-exclusion + gap-closure-inclusion, COVERAGE.md frontmatter shape, and STATE pass-through.

## Known Stubs

None. No TODO/FIXME/placeholder introduced.

## Threat Flags

None. Pure removal-free additive step plugin; no new runtime dependency, no security-sensitive surface touched.

## Self-Check: PASSED

- `lib/gap-analysis.js` exists (274 lines), exports `name, inject, apply, parseDecisionIds, scanCoverage, findOrphans`.
- `test/gap-analysis.test.mjs` exists (442 lines) and passes.
- `gsdGapAnalysis` is registered in `lib/_capabilities.js` and `/gsd-gap-analysis` in `lib/commands.js`.
- The tool is a soft gate: it never blocks gsd_execute.

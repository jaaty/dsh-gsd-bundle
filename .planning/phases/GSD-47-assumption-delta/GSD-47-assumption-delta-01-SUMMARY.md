---
phase: 47
plan: 01
subsystem: assumption-delta
tags: [assumption-delta, plan-pre, pure-helper, detector, tdd]
requires: []
provides: [lib/assumption-delta.js, test/assumption-delta.test.mjs, test/assumption-delta-hooks.test.mjs]
affects: [lib/plan.js (wired in plan 02), lib/state.js _defaultConfig (plan 02)]
tech-stack: [node, esm, node:test]
key-files:
  created:
    - lib/assumption-delta.js
    - test/assumption-delta.test.mjs
    - test/assumption-delta-hooks.test.mjs
  modified: []
decisions:
  - D-01: pure helper module, no capability/tool/loop-step, no ctx/fs/git params
  - D-02: fenced code blocks stripped before scanning
  - D-03: deterministic typed IR { detected, signals[], terms }; non-string/empty degrades to detected:false
  - D-04: config gate workflow.assumption_delta === true (default true, plan 02)
  - D-05: detected → promptBlock (promote-vs-add-alongside) + logLine
  - D-06: skipped-before-detected fabrication guard at the hook layer
  - D-07: invariant/contract test companion noted in the prompt block
  - D-08: never-throws soft gate; hook is synchronous pure over { cfg, scopeText }
  - D-09: TDD unit matrices for detector + hook
metrics:
  duration: ~1 session
  completed: 2026-09-02
  actuals:
    tokens: ~0
    tasks: 2
    commits: 2
status: complete
---

# Phase 47 Plan 01: assumption-delta Summary

Delivered the pure assumption-delta module (lib/assumption-delta.js) and its full unit-test suite: a deterministic detector (escapeRegex, stripFencedCode, DEFAULT_ASSUMPTION_DELTA_TERMS, normalizeTerms, resolveTerms, detectAssumptionDelta) plus the orchestrating hook-layer helper (buildAssumptionDeltaPrompt, runAssumptionDeltaOnPlan) encoding the config gate (D-04), the skipped-before-detected fabrication guard (D-06), the detected→promptBlock+logLine surface (D-05), and the never-throws soft gate (D-08). Per D-01 the module is PURE — no capability, no tool, no loop-step, no ctx/fs/git params — so every helper is directly unit-testable. The plan.js wiring and the _defaultConfig flag are deferred to plan 02 (wave 2).

## TDD Gate Compliance

Compliant. This is a `type: tdd` plan. Task 1 committed the RED test matrices first (`test(47-01): add assumption-delta detector + hook unit matrices (RED)`), then Task 2 committed the GREEN implementation (`feat(47-01): add pure assumption-delta detector + plan:pre hook helper (GREEN)`). The first scope-matching commit is `test:`, satisfying the tdd_audit ship gate.

## What was built

- **lib/assumption-delta.js** (294 lines) — pure ESM module exporting `DEFAULT_ASSUMPTION_DELTA_TERMS`, `escapeRegex`, `stripFencedCode`, `normalizeTerms`, `resolveTerms`, `detectAssumptionDelta`, `buildAssumptionDeltaPrompt`, `runAssumptionDeltaOnPlan`. Vocabulary replicated VERBATIM from upstream assumption-delta.cts (bare `or` deliberately excluded from pluralization). Word-boundary anchored, case-insensitive matching; fenced code blocks stripped before scanning; CRLF-safe; hardening caps (200/kind, 32/term) via normalizeTerms/resolveTerms.
- **test/assumption-delta.test.mjs** (416 lines) — detector matrix per D-09: result shape, pluralization/optional/chosen firing, no-signal, bare-`or` guard, fenced-block guard (``` and ~~~), CRLF, empty/whitespace/non-string degrade, term override/merge, hardening.
- **test/assumption-delta-hooks.test.mjs** — hook matrix per D-04/D-05/D-06/D-08: config-gate skip, no-scope skip (never a bare detected:false), detected→promptBlock+logLine, never-throws, pure-signature, buildAssumptionDeltaPrompt content (question, decision instruction, D-07 companion).

## Known Stubs

None. No TODO/FIXME/placeholder markers, no skipped tests.

## Threat Flags

None. The module is pure (no fs/child_process/ctx imports — verified by grep). No capability/tool/loop-step added (D-01), so lib/_capabilities.js and lib/_render.js are untouched. The detector cannot exfiltrate or mutate; hostile term lists are hardened by normalizeTerms caps.

## Self-Check: PASSED

- `lib/assumption-delta.js` exists (294 lines, ≥200 min) with all 8 frontmatter exports.
- `test/assumption-delta.test.mjs` exists (416 lines, ≥60 min); `test/assumption-delta-hooks.test.mjs` exists (≥60 min).
- Both unit matrices pass: `node --test test/assumption-delta.test.mjs test/assumption-delta-hooks.test.mjs` → 55 pass, 0 fail.
- Full suite green: `npm test` → 870 pass, 0 fail.
- Acceptance criteria verified: grep count ≥4 (got 6); no `node:fs`/`node:child_process`/`ctx` code imports; no bare `'or'` element in the pluralization array.
- Commits: `7ca6470` (test: RED), `ee370d2` (feat: GREEN) — both on branch `phase-47`.

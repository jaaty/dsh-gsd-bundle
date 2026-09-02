---
phase: 47
plan: 02
subsystem: assumption-delta
tags: [assumption-delta, plan-pre, wiring, plan.js, state.js, tdd]
requires: [GSD-47-assumption-delta-01]
provides: [lib/plan.js plan:pre wiring, lib/state.js _defaultConfig flag, test/assumption-delta-wiring.test.mjs]
affects: [lib/plan.js, lib/state.js, test/assumption-delta-wiring.test.mjs, test/state.test.mjs]
tech-stack: [node, esm, node:test]
key-files:
  created:
    - test/assumption-delta-wiring.test.mjs
  modified:
    - lib/plan.js
    - lib/state.js
    - test/state.test.mjs
decisions:
  - D-01: no capability/tool/loop-step added — the hook is pure JS inside plan.js; lib/_capabilities.js / lib/_render.js / cordis.patch.yml untouched
  - D-02: scopeText assembled as [phase.goal, (phase.requirements||[]).join(" "), contextMd].join("\n"); the detector strips fenced code blocks itself
  - D-04: workflow.assumption_delta === true gate read via readConfig; _defaultConfig emits assumption_delta: true for fresh projects; no migration for existing configs
  - D-05: detected → promptBlock spliced into plannerPrompt (promote-vs-add-alongside + <assumption_delta_decision>) + logLine pushed into the gsd_plan log
  - D-06: skipped-before-detected fabrication guard lives in the hook (unit-tested at hook layer); wiring asserts clean-negative no-false-detection
  - D-08: hook is synchronous pure over { cfg, scopeText }, never advances STATE, never throws; wiring pushes logLine only when present
metrics:
  duration: ~1 session
  completed: 2026-09-02
  actuals:
    tokens: ~0
    tasks: 2
    commits: 2
status: complete
---

# Phase 47 Plan 02: assumption-delta Summary

Wired the pure assumption-delta module into the Plan phase as a plan:pre checkpoint: lib/plan.js now runs `runAssumptionDeltaOnPlan` on the already-fetched phase scope (ROADMAP goal + requirements + sealed CONTEXT) at planner-prompt construction, splices the promote-vs-add-alongside question block into the planner prompt when a signal is detected, and pushes the assumption-delta log line into the gsd_plan output. lib/state.js `_defaultConfig` now emits `workflow.assumption_delta: true` for freshly initialized projects. Per D-01/D-08 this changes NO capability, NO tool, NO loop-step behaviour, never advances STATE itself, and is a non-blocking soft gate.

## TDD Gate Compliance

Compliant. This is a `type: tdd` plan. Task 1 committed the RED wiring test + `_defaultConfig` regression first (`test(47-02): add plan.js assumption-delta wiring test + _defaultConfig regression (RED)`), then Task 2 committed the GREEN implementation (`feat(47-02): wire assumption-delta plan:pre hook into plan.js + config default (GREEN)`). The first scope-matching commit is `test:`, satisfying the tdd_audit ship gate.

## What was built

- **lib/plan.js** — added `import { runAssumptionDeltaOnPlan } from "./assumption-delta.js"`; inside `gsd_plan` execute(), before plannerPrompt construction, computes `const assumptionDelta = runAssumptionDeltaOnPlan({ cfg, scopeText: [phase.goal, (phase.requirements || []).join(" "), contextMd].join("\n") })`. The `promptBlock` is spliced into the plannerPrompt array (`.filter(Boolean)`-compatible) so the `<assumption_delta_decision>` instruction reaches the planner text verbatim; `if (assumptionDelta.logLine) log.push(assumptionDelta.logLine)` surfaces the detection line in the gsd_plan output. The existing mempalace recall hook at line 110 is untouched; `setStep("execute")` and all STATE advancement are unchanged (D-08).
- **lib/state.js** — `_defaultConfig` workflow block now emits `assumption_delta: true` (D-04). No migration logic for existing configs (readConfig is file-verbatim, so existing projects skip the hook — D-04-correct).
- **test/assumption-delta-wiring.test.mjs** (new, 4 tests) — mounts the real gsd_plan tool with a custom subagents service that captures the planner spawn's promptText. Asserts: (a) gate ON + CONTEXT with a signal → question + `<assumption_delta_decision>` reach the planner prompt and the log carries the detection line (D-05); (b) gate OFF → no question, no crash, no false detection (D-04); (c) gate ON + no trigger → clean negative (D-05); (c2) gate ON + empty CONTEXT → clean negative, no false detection (D-06).
- **test/state.test.mjs** — the initProject→readConfig round-trip now asserts `cfg.workflow.assumption_delta === true` (D-04).

## Known Stubs

None. No TODO/FIXME/placeholder markers in the changed files; no skipped tests.

## Threat Flags

None. The hook is a pure synchronous function over already-fetched data — no new fs/child_process/ctx I/O in the wiring. No capability/tool/loop-step added (D-01): `lib/_capabilities.js`, `lib/_render.js`, and `cordis.patch.yml` are byte-identical (verified via `git diff --stat`). The detector cannot exfiltrate or mutate; the wiring only splices a prompt block and pushes a log line.

## Self-Check: PASSED

- `test/assumption-delta-wiring.test.mjs` exists (≥60 lines) and passes: `node --test test/assumption-delta-wiring.test.mjs` → 4 pass, 0 fail.
- `lib/plan.js` import matches: `grep -c 'from "./assumption-delta.js"'` → 1.
- Hook refs in plan.js: `grep -c 'assumptionDelta.logLine\|assumptionDelta.promptBlock\|runAssumptionDeltaOnPlan'` → 4 (≥2).
- `grep -n 'assumption_delta: true' lib/state.js` → line 202 (in `_defaultConfig`).
- Full suite green: `npm test` → 874 pass, 0 fail.
- No capability/tool registration introduced: `git diff --stat lib/_capabilities.js lib/_render.js cordis.patch.yml` → empty.
- Commits: `fc86100` (test: RED), `1f315ca` (feat: GREEN) — both on branch `phase-47`.

## Deviation note

The plan's Task 1 case (c2) described asserting the "no scanable scope → skipped" path at the wiring level. A truly empty scope is not constructible through the real gsd_plan flow because `parseRoadmap` drops phase rows whose goal/req cells are empty (filter(Boolean)), so the plan tool always has a non-empty goal. The D-06 skipped-before-detected fabrication guard is therefore unit-tested at the hook layer (test/assumption-delta-hooks.test.mjs), and the wiring-level (c2) test asserts the observable clean-negative: an empty CONTEXT (scope = the phase goal, no trigger term) must not fabricate a detection in the planner prompt or the gsd_plan log.

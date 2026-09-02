---
phase: 47-assumption-delta
verified: 2026-09-02
status: passed
score: 4/4 must-haves verified
behavior_unverified: 0
overrides_applied: 0
---

# Phase 47: assumption-delta Verification Report

## Goal Achievement

**Goal:** Add an advisory assumption-delta checkpoint that surfaces one identity-model question when a phase makes something plural/optional/chosen that used to be singular/required/derived. (GAP-13)

**Verdict:** ACHIEVED. The pure detector (`lib/assumption-delta.js`) deterministically fires on pluralization/optional/chosen transitions, and the `plan:pre` hook wired into `lib/plan.js` surfaces the single promote-vs-add-alongside identity-model question into the planner prompt plus a log line, gated by `workflow.assumption_delta` (default true), advisory and non-blocking. Verified by direct inspection of the code, the full test suite (874 pass), and live behavioral probes.

## Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| T1 | `detectAssumptionDelta(text)` returns `{ detected, signals[], terms }` and fires true for singular→plural / required→optional / derived→chosen transitions across the curated vocabulary, while a bare `or` never fires a pluralization signal. | ✓ VERIFIED | `lib/assumption-delta.js:179-219`; vocabulary at 33-64 (bare `or` excluded from pluralization); probe: "second auth method alongside" → detected with `pluralization:second,pluralization:alongside`; "A or B" → `detected:false`. |
| T2 | Fenced code blocks are stripped before scanning so a trigger term inside a fence never fires, and CRLF input is treated identically to LF input. | ✓ VERIFIED | `stripFencedCode` at 86-109 (CommonMark-subset, CRLF-safe, ``` and ~~~, info strings); `detectAssumptionDelta` strips at 188; probe: trigger inside ``` fence → `detected:false`; CRLF test passes in suite. |
| T3 | `runAssumptionDeltaOnPlan({ cfg, scopeText })` returns skipped (never a bare `detected:false`) both when `workflow.assumption_delta !== true` and when there is no scanable scope text (D-04/D-06); when a signal is detected it returns a promptBlock containing the promote-vs-add-alongside question plus a logLine (D-05); a degenerate input never throws and the hook never advances STATE (D-08). | ✓ VERIFIED | `runAssumptionDeltaOnPlan` at 267-294: gate (269), no-scope skipped (274-277), detect→promptBlock+logLine (279-289), try/catch fault→skipped (290-293). Probe: gate-off → `skipped:"config"` no `detected` key; no-scope → `skipped:"no-scope"` no `detected` key; detected → promptBlock has `promote` + logLine. |
| T4 | All exported helpers take NO ctx/fs/git params — the module is pure and directly unit-testable (D-01). | ✓ VERIFIED | `lib/assumption-delta.js` has no `node:fs`/`node:child_process`/`ctx` imports (grep clean); all 8 exports are pure functions over plain params. |

## Score

**4/4 must-haves verified.** 0 behavior-unverified.

## Deferred Items

None from this phase. The deferred ideas in CONTEXT.md (standalone tool/capability/loop-step, CLI/stdin transport, exit-code contract, separate ASSUMPTION-DELTA.md artefact) are explicitly out of scope per D-01/D-08 and correctly NOT implemented.

## Required Artifacts

| Artifact | Exists | Substantive | Wired | Notes |
|----------|--------|-------------|-------|-------|
| `lib/assumption-delta.js` | ✓ | ✓ (294 lines ≥ 200; all 8 exports present) | ✓ | Pure module, no capability/tool/loop-step |
| `test/assumption-delta.test.mjs` | ✓ | ✓ (416 lines ≥ 60) | ✓ | Detector matrix per D-09 |
| `test/assumption-delta-hooks.test.mjs` | ✓ | ✓ (≥ 60) | ✓ | Hook matrix per D-04/D-05/D-06/D-08 |
| `test/assumption-delta-wiring.test.mjs` | ✓ | ✓ (184 lines ≥ 60) | ✓ | Real mount of gsd_plan, captures planner prompt |
| `lib/plan.js` wiring | ✓ | ✓ | ✓ | Hook at planner-prompt construction (line 161-176) |
| `lib/state.js` `_defaultConfig` | ✓ | ✓ | ✓ | `assumption_delta: true` at line 202 |

## Key Link Verification

| From | To | Via | Status |
|------|----|-----|--------|
| `test/assumption-delta.test.mjs` | `lib/assumption-delta.js` | ESM import `from "../lib/assumption-delta.js"` (line 27) | WIRED |
| `test/assumption-delta-hooks.test.mjs` | `lib/assumption-delta.js` | ESM import `from "../lib/assumption-delta.js"` (line 30) | WIRED |
| `lib/plan.js` | `lib/assumption-delta.js` | ESM import `from "./assumption-delta.js"` (line 15) + call at 161 | WIRED |
| `test/assumption-delta-wiring.test.mjs` | `lib/plan.js` | mounts gsd_plan, captures `req.prompt[0].text` (line 44) | WIRED |

## Data-Flow Trace

1. `gsd_plan` execute() fetches `phase.goal`, `phase.requirements`, and sealed `contextMd` (plan.js:99-102).
2. `runAssumptionDeltaOnPlan({ cfg, scopeText: [goal, reqs, contextMd].join("\n") })` runs synchronously (plan.js:161-164).
3. Gate check → no-scope skipped → detector (strips fences, word-boundary match) → `{ detected, signals, promptBlock, logLine }`.
4. `promptBlock` spliced into `plannerPrompt` array (plan.js:173), joined via `.filter(Boolean).join("\n\n")` (175), passed to the planner subagent (177).
5. `logLine` pushed to `log[]` (176), surfaced in the gsd_plan return.
6. `setStep("execute")` (line 210) is orthogonal and untouched — the hook never advances STATE.

## Behavioral Spot-Checks

Ran the three assumption-delta test files (59 tests, 0 fail) and the full suite (`npm test` → 874 pass, 0 fail). Direct probes confirmed: pluralization fires; bare `or` does not fire; fenced-block guard holds; hook detected → promptBlock+logLine; gate-off → skipped (no `detected` key); no-scope → skipped (no `detected` key, never a fabricated negative).

## Requirements Coverage

| REQ-ID | Delivered |
|--------|-----------|
| GAP-13 | ✓ Advisory assumption-delta checkpoint detects plural/optional/chosen transitions and surfaces one identity-model question (promote vs add-alongside), config-gated, non-blocking. |

## Anti-Patterns Found

None. No unreferenced TBD/FIXME/XXX/HACK markers in any changed file. No skipped tests. No capability/tool/loop-step added (D-01) — `lib/_capabilities.js`, `lib/_render.js`, `cordis.patch.yml` byte-identical (git diff empty).

## Human Verification Required

None. All behaviors are programmatically confirmable via the pure detector, the mount-based wiring test, and the full suite.

## Gaps Summary

No gaps found. Status: **passed**.

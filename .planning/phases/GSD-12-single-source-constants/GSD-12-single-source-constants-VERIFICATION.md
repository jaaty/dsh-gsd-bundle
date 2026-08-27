---
phase: 12-single-source-constants
verified: 2026-08-27
status: passed
score: 4/4 must-haves verified
behavior_unverified: 0
overrides_applied: 0
---

# Phase 12: single-source-constants Verification Report

## Goal Achievement

**Goal:** Make GATE_NAMES and the secret-file list single-source and route cwdOf through the shared helper. (Requirement CQ-02)

**Verdict:** PASSED. All four must-have truths verified against the actual codebase (not SUMMARY claims). The secret-file list lives only in `_shared.js`, both mapper/query prompts derive their forbidden-files prose from that canonical array, `ship.js` consumes `GATE_NAMES` from `gates.js`, and `core-tools.js`/`discuss.js` route cwd through the shared `cwdOf` helper. Full suite green (188 pass, 0 fail).

## Observable Truths

| # | Truth | Status | Evidence |
|---|---|---|---|
| T1 | `secretPatterns` is exported from `lib/_shared.js` and no longer defined in `lib/gates.js` | ✓ VERIFIED | `lib/_shared.js:373` `export const secretPatterns = [...]` (24 items, complete); `lib/gates.js:19` `import { secretPatterns } from "./_shared.js"`; `grep "export const secretPatterns" lib/gates.js` → 0 matches |
| T2 | `CODEBASE_MAPPER_PROMPT` and `CODEBASE_QUERY_PROMPT` each contain the secretPatterns array joined by ', ' | ✓ VERIFIED | `lib/_agents.js:285,321` `${forbiddenFilesProse()}. Your output gets committed/returned...`; `forbiddenFilesProse()` returns `secretPatterns.join(", ")` (`_shared.js:402-403`); no verbatim list remains in `_agents.js` |
| T3 | `ship.js` imports GATE_NAMES from gates.js and contains no local const GATE_NAMES definition | ✓ VERIFIED | `lib/ship.js:15` `import { runCapabilityGates, fetchGitData, GATE_NAMES } from "./gates.js"`; `grep "const GATE_NAMES" lib/ship.js` → 0 matches; still referenced at `:90` |
| T4 | `core-tools.js` and `discuss.js` import cwdOf from _runner.js and contain no inline `exec?.agent?.session?.header?.cwd` expression | ✓ VERIFIED | `core-tools.js:9` import + `cwdOf(exec)` at 55/91/166/216; `discuss.js:10` import + `cwdOf(exec)` at 70; inline expression count = 0 in both |

## Score

**4/4 must-haves verified.** No truth failed, no artifact missing/stub, no key link unwired, no blocker anti-pattern, no human-verification item.

## Deferred Items

- CQ-03 (gate dispatch map), CQ-04 (execute checkpoint helpers), CQ-05 (async git/gh), CQ-06 (context budget) are phases 13–16 — correctly out of scope for this phase. No deferred items from this phase belong to later milestones.

## Required Artifacts

| Artifact | Exists | Substantive | Wired | Verdict |
|---|---|---|---|---|
| `lib/_shared.js` (secretPatterns + forbiddenFilesProse) | ✓ | 477 lines (min 40); exports `secretPatterns`, `forbiddenFilesProse` | ✓ imported by gates.js + _agents.js | PASS |
| `lib/_agents.js` (prompts with derived prose) | ✓ | 327 lines (min 40); exports `CODEBASE_MAPPER_PROMPT`, `CODEBASE_QUERY_PROMPT` | ✓ both prompts interpolate `forbiddenFilesProse()` | PASS |
| `test/dedup.test.mjs` (regression) | ✓ | 35 lines (min 30) | ✓ runs in suite | PASS |
| `lib/ship.js` (GATE_NAMES from gates.js) | ✓ | 190 lines (min 40) | ✓ imports GATE_NAMES | PASS |
| `lib/core-tools.js` (cwdOf from _runner.js) | ✓ | 242 lines (min 40) | ✓ 4× `cwdOf(exec)` | PASS |
| `lib/discuss.js` (cwdOf from _runner.js) | ✓ | 143 lines (min 40) | ✓ 1× `cwdOf(exec)` | PASS |
| `test/ship.test.mjs` (regression) | ✓ | 40 lines (min 30) | ✓ runs in suite | PASS |

## Key Link Verification

| From | To | Via | Status |
|---|---|---|---|
| `lib/gates.js` | `lib/_shared.js` | `import { secretPatterns } from "./_shared.js"` | WIRED |
| `lib/_agents.js` | `lib/_shared.js` | `import { forbiddenFilesProse } from "./_shared.js"` + template interpolation in both prompts | WIRED |
| `lib/ship.js` | `lib/gates.js` | `import { runCapabilityGates, fetchGitData, GATE_NAMES } from "./gates.js"` | WIRED |
| `lib/core-tools.js` | `lib/_runner.js` | `import { cwdOf } from "./_runner.js"` | WIRED |
| `lib/discuss.js` | `lib/_runner.js` | `import { cwdOf } from "./_runner.js"` | WIRED |

## Data-Flow Trace

- **secretPatterns:** `_shared.js:373` (canonical) → `gates.js:19` import → consumed by `securityGate`/`matchSecretPatterns` (`gates.js:46`) → `_agents.js:8` import `forbiddenFilesProse` → `_shared.js:402` renders `secretPatterns.join(", ")` → interpolated into both prompts (`_agents.js:285,321`). Single source, no drift.
- **GATE_NAMES:** `gates.js:196` (canonical export) → `ship.js:15` import → used at `ship.js:90` (`GATE_NAMES.includes(skip)`). No duplicate definition.
- **cwdOf:** `_runner.js:48-50` (canonical) → `core-tools.js:9` + `discuss.js:10` imports → `cwdOf(exec)` at all 5 call sites. Inline copies removed.

## Behavioral Spot-Checks

Ran the full suite (`npm test`): **188 pass, 0 fail** (baseline 181 + 4 dedup + 3 ship). Behavior-dependent truths are pinned by named tests that passed:
- `test/dedup.test.mjs` — `forbiddenFilesProse() equals secretPatterns.join(', ')`; both prompts include the canonical join; static negative check that gates.js has no `export const secretPatterns`.
- `test/ship.test.mjs` — ship.js imports GATE_NAMES from `./gates.js` with no local const; core-tools.js/discuss.js import `cwdOf` from `./_runner.js` with no inline cwd expression.
- `test/gates.test.mjs:64` — `secretPatterns carries the exact credential globs (D-01)` passes against the moved array (import updated to `../lib/_shared.js`).
- `test/tools.test.mjs` — `CODEBASE_QUERY_PROMPT carries the FORBIDDEN FILES rule` passes (literal prefix unchanged).

## Requirements Coverage

| REQ-ID | Delivered | Evidence |
|---|---|---|
| CQ-02 | ✓ | secretPatterns single-source in `_shared.js`; GATE_NAMES single-source in `gates.js`; cwdOf routed through `_runner.js` |

## Anti-Patterns Found

None. The only `TODO/FIXME/XXX` matches in touched files are legitimate references to the broken-windows gate's marker-detection feature (`gates.js` MARKER_RE, `_agents.js` prompt text, `gates.test.mjs` fixtures) — not unreferenced debt markers. No skipped tests, no stubs.

## Human Verification Required

None. All truths are programmatically confirmable via source inspection and the passing named test suite.

## Gaps Summary

No gaps found. Phase 12 is complete and ready to ship.

---
phase: 44-learnings
verified: 2026-09-01T22:40:00.000Z
status: passed
score: 14/14 truths verified, 4/4 artifacts pass, 5/5 key links wired
behavior_unverified: 0
overrides_applied: 0
---

# Phase 44: learnings Verification Report

## Goal Achievement

**Goal:** Add an extract-learnings path that accumulates decisions, lessons, patterns, and surprises into a carrying-forward LEARNINGS.md.

**GAP-10 (roadmap truth):** "An extract-learnings path accumulates decisions, lessons, patterns, and surprises from completed phase artifacts into a LEARNINGS.md that carries forward across phases."

**Assessment:** ACHIEVED. `lib/learnings.js` implements a full hybrid loop-step plugin (`gsd_extract_learnings` tool) that deterministically gathers decisions from CONTEXT.md (via `parseDecisionEntries`) and spawns a fresh-context synthesis subagent for lessons/patterns/surprises, writing both a per-phase `{NN}-LEARNINGS.md` and a carrying-forward `.planning/LEARNINGS.md` with idempotent accumulation. A best-effort auto-on-ship hook (`runLearningsOnShip` in `lib/ship.js`) fires for the just-shipped phase, gated by `workflow.learnings`. The full test suite passes (751/751).

## Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| T1 | gsd_extract_learnings extracts decisions (from CONTEXT.md via parseDecisionEntries) and lessons/patterns/surprises (from synthesis subagent) into per-phase {NN}-LEARNINGS.md and carrying-forward .planning/LEARNINGS.md | ✓ VERIFIED | `lib/learnings.js:50-56` (gatherDecisions via parseDecisionEntries), `:240-303` (per-phase writeArtifact), `:307-308` (root writeRootLearnings); integration tests (b)(g) pass — `node --test test/learnings.test.mjs` 30/30 |
| T2 | Re-running with force replaces the phase's block in root without duplicating; without force short-circuits with 'already extracted' message (D-06) | ✓ VERIFIED | `checkIdempotency` (lib/learnings.js:92-101) + `accumulateRootLearnings` (:110-152, in-place replace via `^## Phase N —` regex); tests (c)(d) pass |
| T3 | Missing PLAN.md or SUMMARY.md fails fast with clear error; missing VERIFICATION/REVIEW/COVERAGE degrade to missing_artifacts note (D-07) | ✓ VERIFIED | `lib/learnings.js:210-219` (listPlans/hasArtifact fail-fast), `:242-257` (optional artifact tracking); tests (e) — PLAN/SUMMARY reject, optional resolves |
| T4 | Subagent fault or malformed output degrades to decisions-only LEARNINGS.md, never throwing (D-09) | ✓ VERIFIED | `lib/learnings.js:277-286` (try/catch → decisions-only), `resolveLearningsOutput` (:64-85, per-category degrade); tests (f) — spawn-throws + malformed both resolve with UNAVAILABLE note |
| T5 | learnings does not advance STATE — advisory soft gate (D-12) | ✓ VERIFIED | `grep -c "setActivePhase" lib/learnings.js` === 0; `addDecision` audit trail only (:313-316); test (h) passes |
| T6 | Full mount registers 23 tools, 20 commands, 19 capability keys, 21 cordis.patch.yml insert rows | ✓ VERIFIED | `test/mount.test.mjs` assertions pass; `CAPABILITY_KEYS.length === 19` in `test/_capabilities.test.mjs`; full mount suite GREEN |
| T7 | gsdLearnings renders in persona step paragraphs + Available-steps list after milestone-audit (order 53 after 52) | ✓ VERIFIED | `lib/_render.js:171-172` (gsdLearnings STEP_PARAGRAPHS); `lib/_capabilities.js:258` (order: 53); `test/render.test.mjs` LOOP_ORDER + loopSteps deepEqual pass |
| T8 | /gsd-extract-learnings registered as slash command paired to gsdLearnings capability | ✓ VERIFIED | `lib/commands.js:276-282` (command entry); descriptor `commands: ["gsd-extract-learnings"]` at `_capabilities.js:257`; `test/mount.test.mjs` EXPECTED_COMMAND_NAMES includes it |
| T9 | DEGR-05 per-plugin removal suite auto-extends to include gsdLearnings (PATCH_ROWS has learnings entry) | ✓ VERIFIED | `test/helpers/mount-harness.mjs:39` (`{ id: "gsd-learnings", sub: "learnings" }`); `test/removal.test.mjs` passes (auto-extending matrix) |
| T10 | With workflow.learnings false, runLearningsOnShip short-circuits, never calls the learnings tool (D-10) | ✓ VERIFIED | `lib/ship.js:68` (optional-chaining gate); test "workflow.learnings false → skipped, tool never called" passes |
| T11 | With workflow.learnings true + tool registered, runLearningsOnShip calls tool.execute({ phase, force: true }) and returns learnings log line (D-10) | ✓ VERIFIED | `lib/ship.js:71-73`; test asserts `deepEqual(calls[0], { phase: 1, force: true })` passes |
| T12 | If gsd_extract_learnings tool absent (retired), runLearningsOnShip returns not-registered/skipped, never throws (D-10, DEGR-05) | ✓ VERIFIED | `lib/ship.js:69-70`; test "tool absent → not-registered/skipped" passes |
| T13 | If tool.execute throws, runLearningsOnShip catches it, returns non-blocking log line naming the cause, never rejects (D-10) | ✓ VERIFIED | `lib/ship.js:74-76` (try/catch); test "tool throws → non-blocking, cause surfaced" passes |
| T14 | ship.js execute invokes runLearningsOnShip after the completion commit so auto-run fires for just-shipped phase with force: true (D-06, D-10) | ✓ VERIFIED | `lib/ship.js:332-339` (wired after completion commit/push, before final return); `log.push(learningsLine)` |

## Score

- **Truths:** 14/14 VERIFIED
- **Artifacts:** 4/4 pass (exists → substantive → wired)
- **Key Links:** 5/5 WIRED
- **Behavioral spot-checks:** `node --test test/learnings.test.mjs` → 30 pass / 0 fail; full suite → 751 pass / 0 fail
- **behavior_unverified:** 0

## Deferred Items

Deferred (from CONTEXT.md `<deferred>`) and confirmed OUT of scope this phase:
- Deliberate recall: discuss.js / planningContext reading `.planning/LEARNINGS.md` — mempalace (GAP-12, phase 46). Confirmed NOT implemented this phase (D-13): no edits to discuss.js or planningContext.
- External knowledge-base capture (upstream capture_thought MCP hook, ~/.gsd/knowledge copy) — mempalace's domain (GAP-12). Not present.
- Semantic search / embedding index over LEARNINGS.md — later phase. Root file is plain markdown (confirmed).
- Cross-project / global learnings store — mempalace. Not present.

These are all later-milestone (phase 46 / GAP-12) items; no action this phase.

## Required Artifacts

| Path | Exists | Substantive | Wired | Notes |
|------|--------|-------------|-------|-------|
| `lib/learnings.js` | ✓ | ✓ 338 lines (≥200 min); exports `apply`, `gatherDecisions`, `resolveLearningsOutput`, `accumulateRootLearnings`, `checkIdempotency`, `name`, `inject` | ✓ apply() publishes gsdLearnings + registers tool | The full hybrid plugin; pure helpers carry NO ctx/fs/git params (D-14) |
| `test/learnings.test.mjs` | ✓ | ✓ 550 lines (≥200 min) | ✓ imported & passing | 30 tests: pure helpers (a-h) + integration + runLearningsOnShip helper |
| `lib/ship.js` | ✓ | ✓ exports `runLearningsOnShip` (pure, no ctx/git/gsdState) | ✓ wired into execute at :332-339 after completion commit | Mirrors preflightError pure-helper precedent |
| `lib/_render.js` (gsdLearnings entry) | ✓ | ✓ STEP_PARAGRAPHS entry present | ✓ renders via loopSteps(CAPABILITY_KEYS order) | "- Learnings:" paragraph after milestone-audit |

Supporting edits verified substantive:
- `lib/_capabilities.js` — gsdLearnings descriptor (order 53) + 19th CAPABILITY_KEY
- `lib/_agents.js` — LEARNINGS_SCHEMA (frozen, additionalProperties:false) + LEARNINGS_PROMPT
- `lib/state.js` — writeRootLearnings/readRootLearnings (root-scoped, via ctx.fs) + `workflow.learnings: false` in _defaultConfig
- `lib/commands.js` — /gsd-extract-learnings command entry
- `cordis.patch.yml` — gsd-learnings patch row
- `package.json` — "./learnings" subpath export
- `test/helpers/mount-harness.mjs` — PATCH_ROWS learnings entry (21 rows)

## Key Link Verification

| From | To | Via | Status |
|------|----|----|--------|
| `lib/learnings.js` | `lib/state.js` | `s.writeArtifact(cwd, phase, 'LEARNINGS', body)` (:303) + `s.writeRootLearnings(cwd, newRoot)` (:308) | WIRED |
| `lib/learnings.js` | `lib/_agents.js` | imports `LEARNINGS_SCHEMA` + `LEARNINGS_PROMPT` (:36); uses at :278 | WIRED |
| `lib/learnings.js` | `lib/_capabilities.js` | `ctx.provide('gsdLearnings', buildCapability('gsdLearnings'))` (:187) | WIRED |
| `lib/ship.js` | `lib/learnings.js` | `runLearningsOnShip` finds `tools.find(t => t.name === 'gsd_extract_learnings')` (:69) and calls `tool.execute({ phase, force: true })` (:72); execute wired at :338 | WIRED |
| `cordis.patch.yml` | `package.json` | `gsd-learnings` row → `name: '@dsh-gsd/bundle/learnings'` → `package.json` `"./learnings": { "default": "./lib/learnings.js" }` | WIRED |

## Data-Flow Trace

1. `gsd_extract_learnings({ phase, force })` invoked (manual tool or auto-on-ship hook).
2. Fail-fast guards: `isProject` → `readRoadmap` → phase lookup → `listPlans` (PLAN required) → `hasArtifact(SUMMARY-NN)` (SUMMARY required).
3. Idempotency: `readRootLearnings` → `checkIdempotency(rootFm, phase, force)` → short-circuit or proceed.
4. Deterministic gather: `readArtifact(CONTEXT)` → `gatherDecisions` (via `parseDecisionEntries`) → `decisions[]` with source `CONTEXT#decisions`; read PLAN/SUMMARY/VERIFICATION/REVIEW/COVERAGE → track `missingArtifacts`.
5. Synthesis: `spawnSubagent(LEARNINGS_SCHEMA)` → `resolveLearningsOutput` (per-category validate/degrade); on throw → decisions-only with cause.
6. Per-phase write: `buildSections` (## Decisions/Lessons/Patterns/Surprises + source attribution + UNAVAILABLE notes) → `stringifyFrontmatter` (phase/project/counts/missing_artifacts) → `s.writeArtifact(cwd, phase, 'LEARNINGS', full)`.
7. Root accumulate: `accumulateRootLearnings` (append-or-replace via `## Phase N —` regex; phases_extracted sorted ascending) → `s.writeRootLearnings`.
8. Audit trail: `s.addDecision(...)` (no `setActivePhase` — STATE not advanced).
9. Commit: `commitArtifacts` (shared seam, no raw git).
10. Auto-on-ship: `runLearningsOnShip` (gated by `workflow.learnings`, force:true) wired after completion commit in ship.execute → returns learnings log line (skipped/result/non-blocking-failure).

End-to-end data flow confirmed by passing integration tests (b)(c)(d)(e)(f)(g)(h).

## Behavioral Spot-Checks

| Test | Result |
|------|--------|
| `node --test test/learnings.test.mjs` | 30 pass / 0 fail (covers all D-14 behaviors + runLearningsOnShip) |
| `node --test test/_capabilities.test.mjs test/mount.test.mjs test/render.test.mjs test/removal.test.mjs test/ship-async.test.mjs test/ship.test.mjs` | 71 pass / 0 fail |
| `node --test test/*.test.mjs` (full suite) | 751 pass / 0 fail |

Specific named behavioral tests confirming truth-dependent behaviors:
- (b) per-phase LEARNINGS.md four categories + frontmatter — T1
- (c) root accumulation append + in-place replace — T2
- (d) idempotency short-circuit + force — T2
- (e) missing PLAN/SUMMARY fail-fast + optional degradation — T3
- (f) subagent spawn-throws + malformed → decisions-only — T4
- (h) STATE not advanced — T5
- runLearningsOnShip: flag-off/tool-present/tool-throws/tool-absent — T10-T13

## Requirements Coverage

| REQ-ID | Description | Status | Evidence |
|--------|-------------|--------|----------|
| GAP-10 | An extract-learnings path accumulates decisions, lessons, patterns, and surprises from completed phase artifacts into a LEARNINGS.md that carries forward across phases | ✓ DELIVERED | `lib/learnings.js` (gsd_extract_learnings tool, hybrid engine, per-phase + root outputs); `lib/ship.js` (auto-on-ship hook); full test suite green |

REQUIREMENTS.md marks GAP-10 as `[x]`.

## Anti-Patterns Found

None. No unreferenced TBD/FIXME/XXX/HACK debt markers in the new/modified source files (`lib/learnings.js`, `lib/ship.js`, `lib/state.js`, `lib/_capabilities.js`, `lib/_render.js`, `lib/commands.js`, `lib/_agents.js`). The only TODO/FIXME/XXX matches in `lib/_agents.js` are inside prompt-text strings (instructions telling subagents to scan for such markers), not actual debt markers. No skipped tests (`node --test` reports `skipped 0`).

Additional anti-pattern checks:
- `grep -c "git(" lib/learnings.js` === 0 (D-11 honored — no raw git; commits via `commitArtifacts` shared seam).
- `grep -c "setActivePhase" lib/learnings.js` === 0 (D-12 honored — STATE not advanced).
- `runLearningsOnShip` takes only `{ cfg, tools, phase, exec }` (pure helper, no ctx/git/gsdState — D-14).

## Human Verification Required

None. All behaviors are covered by passing automated tests. No visual, real-time, or external-dependency verification items. No `<verify><human-check>` blocks harvested from the PLAN files.

## Gaps Summary

No gaps. All 14 truths VERIFIED, all 4 artifacts pass (exists → substantive → wired), all 5 key links WIRED, no blocker anti-patterns, no human-verification items. Full test suite green (751/751).
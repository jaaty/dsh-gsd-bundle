---
phase: 53-smart-entry
verified: 2026-09-07
status: passed
score: 13/13 must-haves verified
behavior_unverified: 0
overrides_applied: 0
---

# Phase 53: smart-entry Verification Report

## Goal Achievement

**Goal:** Detect the current project state and route the user to the best next action, with an auto-advance option. (Requirements CLH-02, CLH-03)

The phase goal is **achieved**. A new `gsd_next` tool + `/gsd-next` slash command classify the current `.planning/` state into one of six routing branches (no-project, corrupt, paused, mid-phase, phase-shipped-next, milestone-complete) and, for the advance branch, re-point `STATE.md` to the next logical workflow step via the existing `setActivePhase` mutator — without auto-running the next step's tool. Routing is capability-aware, reusing `effectiveRoutableStep` from `lib/_render.js` as the single source of truth.

## Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `classifyNextState` is pure (snapshot + descriptors → `{branch, recommendation, mutation}`, no ctx/fs/I/O) | ✓ VERIFIED | `lib/_next.js` — no `ctx` token, no `node:fs`, no `await` (grep clean); returns the 3-field object |
| 2 | Classifier recognises all six states in D-04 precedence order, returns on first match | ✓ VERIFIED | `lib/_next.js:77-152`; unit tests (1)-(13) cover all six branches + precedence |
| 3 | Branch 5 returns `{setActivePhase:{phaseNum,step}}` (step `discuss`/`spec` per gsdSpec); all others `mutation:null` | ✓ VERIFIED | `lib/_next.js:129,135`; tests (5)(6)(7) |
| 4 | Branch 4 falls through to branch 5 on `Complete` phase or `done` status (D-07) | ✓ VERIFIED | `lib/_next.js:110-113`; tests (10)(11) |
| 5 | Routing is capability-aware (D-06); absent capability degrades to `gsd_status` fallback, never names missing tool | ✓ VERIFIED | `lib/_next.js:34,46-48,82,90,98,145,149`; tests (14)(15) |
| 6 | `renderNextRecommendation` names the command, never claims to auto-run (D-02) | ✓ VERIFIED | `lib/_next.js:161-165`; test (16) |
| 7 | `gsd_next` tool registered in core-tools; execute gathers snapshot → classify → optional setActivePhase → commitArtifacts → render | ✓ VERIFIED | `lib/core-tools.js:575-669`; integration tests |
| 8 | Auto-advance (branch 5) re-points STATE (active_phase/status/next_action) + commits, does NOT auto-run next tool | ✓ VERIFIED | `lib/core-tools.js:649-657`; integration test (3) asserts active_phase=2, status=discuss, next_action=discuss-phase, commit made |
| 9 | Branches 1,2,3,4,6 leave STATE byte-identical (never-advances-STATE invariant) | ✓ VERIFIED | `lib/core-tools.js:647-666`; integration test (9) deepEqual before/after × advance true/false |
| 10 | Paused-handoff detection reads root `.continue-here.md` then scans every phase dir (D-05) | ✓ VERIFIED | `lib/core-tools.js:602-611`; integration test (8b) lone phase-dir pointer → gsd_resume_work |
| 11 | `/gsd-next` command registered in commands.js, paired to gsdOrient; retiring gsd-core-tools withdraws it (DEGR-03) | ✓ VERIFIED | `lib/commands.js:351`; `lib/_capabilities.js:79`; removal test asserts unregistration |
| 12 | gsdOrient advertises `gsd_next` in tools and `gsd-next` in commands | ✓ VERIFIED | `lib/_capabilities.js:78-79`; `test/_capabilities.test.mjs:69-70` |
| 13 | `npm test` passes with updated counts (32 tools / 29 commands) and exact arrays | ✓ VERIFIED | Full suite: 1009 tests, 1009 pass, 0 fail |

## Score

**13/13 must-haves verified.** All plan-01 (6) and plan-02 (7) truths are VERIFIED. No truth is FAILED or PRESENT_BEHAVIOR_UNVERIFIED.

## Deferred Items

- Freeform natural-language intent routing (CLH-04), quick-batch (CLH-05), fast-mode (CLH-06), mvp-phase (CLH-07), node-repair (CLH-08) — separate later CLH phases, correctly out of scope.
- A `next` boolean flag on `gsd_progress` delegating to `gsd_next` — explicitly deferred in CONTEXT; `gsd_next` is the single routing surface. CLH-03's auto-advance intent is delivered via `gsd_next`'s `advance:true` parameter (documented design decision D-01).

## Required Artifacts

| Artifact | Exists | Substantive | Wired |
|----------|--------|-------------|-------|
| `lib/_next.js` (164 lines ≥ 90) | ✓ | ✓ exports `classifyNextState`, `renderNextRecommendation`, `hasCap`, `BRANCH` | ✓ imported by core-tools |
| `test/_next.test.mjs` (242 lines ≥ 120) | ✓ | ✓ 20 tests, full six-branch matrix | ✓ runs green |
| `lib/core-tools.js` (671 lines ≥ 600) | ✓ | ✓ registers `gsd_next` | ✓ |
| `lib/commands.js` (430 lines ≥ 430) | ✓ | ✓ `gsd-next` entry | ✓ paired to gsdOrient |
| `lib/_capabilities.js` (375 lines; min 376) | ✓ | ✓ gsdOrient arrays extended | ✓ (1-line soft-guideline shortfall, immaterial) |
| `test/next-integration.test.mjs` (307 lines ≥ 120) | ✓ | ✓ 10 integration tests | ✓ runs green |

## Key Link Verification

| From | To | Via | Status |
|------|----|-----|--------|
| `lib/_next.js` | `lib/_render.js` | `import { effectiveRoutableStep } from "./_render.js"` (line 15) | WIRED |
| `lib/core-tools.js` | `lib/_next.js` | `import { classifyNextState, renderNextRecommendation } from "./_next.js"` (line 18) | WIRED |
| `lib/commands.js` | `lib/_capabilities.js` | `gsd-next` in commands.js (351) + gsdOrient.commands (79) | WIRED |
| `lib/core-tools.js` | `lib/_git-artifacts.js` | `commitArtifacts(` (line 656) | WIRED |

## Data-Flow Trace

`gsd_next.execute` → `cwdOf(exec)` → `gsdState` accessors (`readProject/readState/readRoadmap/readHandoff`, each `.catch(()=>undefined)`) → D-05 continueHere scan (`readContinueHere` root + `listPhaseDirs` per-dir) → D-09 milestone-audit read-back (`readMilestoneArtifact` + `parseFrontmatter`) → `hasProject = !!(project||state||roadmap)` → `availableCapabilities((k)=>ctx.get(k))` → `classifyNextState(snapshot, descriptors)` → branch 5: `setActivePhase` + `commitArtifacts` (advance-gated) → `renderNextRecommendation`. Branches 1/2/3/4/6 return text with no mutation/commit.

## Behavioral Spot-Checks

- **Auto-advance re-points STATE** — integration test (3): `execute({advance:true})` → `active_phase=2`, `status=discuss`, `next_action=discuss-phase`, commit issued. PASS.
- **Never-advances-STATE invariant** — integration test (9): branches 1,2,3,4,6 leave STATE frontmatter deepEqual before/after under advance true AND false. PASS.
- **D-05 phase-dir pointer** — integration test (8b): lone phase-dir `.continue-here.md` (no HANDOFF) → `gsd_resume_work`. PASS.
- **Milestone-complete routing** — integration test (6): all Complete → `gsd_milestone_audit`; ready-to-close audit → `gsd_new_milestone`. PASS.
- **Capability-aware degradation** — unit tests (14)(15): retire gsdHealth/gsdMilestoneAudit → `gsd_status` fallback, never the missing tool. PASS.

## Requirements Coverage

| REQ-ID | Requirement | Delivered |
|--------|-------------|-----------|
| CLH-02 | Smart entry: detect the current project state and route the user to the best next action | ✓ `gsd_next` + `/gsd-next`, six-branch classifier |
| CLH-03 | Auto-advance: automatically advance to the next logical workflow step | ✓ `gsd_next` `advance:true` re-points STATE (design re-scoped from `progress --next` to `gsd_next` per CONTEXT D-01/deferred) |

## Anti-Patterns Found

None. No unreferenced TBD/FIXME/XXX/TODO in any produced or modified file (grep clean).

## Human Verification Required

None. `gsd_next` is a CLI/orientation tool with no visual, real-time, or external component. Every behavior is programmatically confirmed by passing named unit and integration tests.

## Gaps Summary

No gaps. All 13 must-have truths verified, all artifacts present and substantive, all key links WIRED, no blockers, no human-verification items. Status: **passed**.

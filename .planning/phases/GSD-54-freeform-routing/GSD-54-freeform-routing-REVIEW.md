---
phase: 54
reviewed: "2026-09-07T06:23:31.471Z"
depth: standard
files_reviewed: 9
status: issues_found
findings:
  blocker: 0
  warning: 3
  info: 4
  total: 7
---
# Phase 54: freeform-routing - Code Review Report

**Reviewed:** 2026-09-07T06:23:31.471Z
**Depth:** standard
**Files reviewed:** 9
**Status:** issues_found

## Summary

- Total findings: 7
- BLOCKER: 0
- WARNING: 3
- INFO: 4

## Warnings

### CR-01: wave option defaults to 0 instead of null, appending spurious 'wave 0' to every recommendation

- **File:** lib/_route.js
- **Lines:** 321
- **Severity:** WARNING
- **Evidence:** `wave: Number((s.match(/\bwave\s*(\d+)\b/) || [])[1] || null)` — when no 'wave N' is present, `[][1]` is undefined, `undefined || null` is null, and `Number(null)` is 0. Confirmed: classifyIntent('discuss phase 3', []) returns options.wave === 0 and renderRouteRecommendation emits 'Run the gsd_status tool on phase 3, wave 0.'
- **Suggestion:** Return null when absent: `const wm = s.match(/\bwave\s*(\d+)\b/); wave: wm ? Number(wm[1]) : null` (mirror the depth handling).

### CR-02: degrade() routes to the FIRST present loop step, not the nearest, for steps absent from NEXT_ACTION_TO_STEP

- **File:** lib/_route.js
- **Lines:** 385
- **Severity:** WARNING
- **Evidence:** `const stepDesc = effectiveRoutableStep("${stepToken}-phase", descriptors)` — for step tokens not in _render.js NEXT_ACTION_TO_STEP (code-review, ui-review, validate, learnings, graphify, mempalace, milestone-audit), capabilityKeyForNextAction returns null and effectiveRoutableStep returns `loop[0]`. Confirmed: retiring gsdCodeReview routes 'code review phase 3' to gsd_spec_phase (order 5) while the note claims 'routing to the nearest available step gsd_spec_phase'.
- **Suggestion:** In degrade(), when the step token is not a known next_action, compute the nearest present loop step by order directly (e.g. find the first present loop step with order > the absent capability's order) instead of relying on effectiveRoutableStep's loop[0] fallback.

### CR-03: Bare-number phase fallback misreads 'wave N'/'depth N' numbers as a phase number

- **File:** lib/_route.js
- **Lines:** 479
- **Severity:** WARNING
- **Evidence:** `const m = normalized.match(/(?:^|\s)(\d+)(?:\s|$)/); if (m) phase = Number(m[1]);` — for 'execute wave 2', extractPhase finds no 'phase N', then the bare-number fallback matches ' 2' and sets phase 2, so the intent is misrouted as phase 2 instead of wave 2 of the current phase.
- **Suggestion:** Exclude numbers already consumed by option tokens: skip a bare-number match that is immediately preceded by 'wave' or 'depth' (e.g. require the preceding token not to be 'wave'/'depth'), or parse options first and strip 'wave N'/'depth N' before the phase fallback.

## Info

### CR-04: Stale comment: '22 known capability keys' but CAPABILITY_KEYS has 24 entries

- **File:** lib/_capabilities.js
- **Lines:** 19
- **Severity:** INFO
- **Evidence:** `// The 22 known capability keys, in a stable order: ...` while `CAPABILITY_KEYS` (lines 32-57) contains 24 keys (gsdAddTests, gsdPhaseManagement added later).
- **Suggestion:** Update the comment to '24 known capability keys'.

### CR-05: firstPresentTool/degrade call buildCapability(d.key) which throws on an unknown descriptor key

- **File:** lib/_route.js
- **Lines:** 358-365
- **Severity:** INFO
- **Evidence:** `const tools = buildCapability(d.key).tools;` — buildCapability throws for an unknown key (D-10 fail-loud). In the live path descriptors come from availableCapabilities (known keys only), so this is latent, but a malformed descriptor array reaching degrade() would throw instead of degrading.
- **Suggestion:** Guard the lookup, e.g. `let tools; try { tools = buildCapability(d.key).tools; } catch { continue; }` so an unknown descriptor key is skipped rather than throwing.

### CR-06: gsd_route execute dereferences args.intent without guarding a missing args object

- **File:** lib/core-tools.js
- **Lines:** 691
- **Severity:** INFO
- **Evidence:** `const result = classifyIntent(args.intent, descriptors);` — if execute is ever invoked with no args object, `args.intent` throws a TypeError. defineTool normally supplies an object, but the tool is recommend-only and should never throw.
- **Suggestion:** Use `classifyIntent(args && args.intent, descriptors)` (classifyIntent already treats undefined intent as the empty-intent gsd_status fallback).

### CR-07: Stale counts in header comments (32 tools / 29 commands) vs 33/30 asserted

- **File:** test/mount.test.mjs
- **Lines:** 5-6
- **Severity:** INFO
- **Evidence:** Header says '32 gsd_* tools, 29 /gsd-* commands' and line 104 'Expected registered tool names (32)' / line 119 '(29)', but the arrays contain 33 and 30 entries and the assertions check 33/30.
- **Suggestion:** Update the comments and array-name labels to 33 tools and 30 commands.

---

*Phase: 54-freeform-routing*
*Code review: 2026-09-07*
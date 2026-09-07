---
phase: 54
reviewed: "2026-09-07T05:27:21.995Z"
depth: standard
files_reviewed: 9
status: issues_found
findings:
  blocker: 0
  warning: 1
  info: 2
  total: 3
---
# Phase 54: freeform-routing - Code Review Report

**Reviewed:** 2026-09-07T05:27:21.995Z
**Depth:** standard
**Files reviewed:** 9
**Status:** issues_found

## Summary

- Total findings: 3
- BLOCKER: 0
- WARNING: 1
- INFO: 2

## Warnings

### CR-01: wave option defaults to 0 (Number(null)) when no wave is present, corrupting every recommendation

- **File:** lib/_route.js
- **Lines:** 321
- **Severity:** WARNING
- **Evidence:** `wave: Number((s.match(/\bwave\s*(\d+)\b/) || [])[1] || null)` — when the intent has no `wave N`, `(s.match(...) || [])[1]` is `undefined`, `undefined || null` is `null`, and `Number(null)` is `0`. Reproduced: `classifyIntent('discuss phase 3', allCapabilities()).options.wave === 0`, and `renderRouteRecommendation` then emits `'Run the gsd_discuss tool on phase 3, wave 0.'` because `if (opts.wave != null)` (line 543) is true for `0`. Waves are 1-based, so `wave 0` is an invalid argument the agent is told to pass.
- **Suggestion:** Guard the null before coercion, e.g. `const w = (s.match(/\bwave\s*(\d+)\b/) || [])[1]; wave: w ? Number(w) : null`. Add a unit test asserting `classifyIntent('discuss phase 3', caps).options.wave === null` and that the rendered text does not contain `wave 0`.

## Info

### CR-02: Unused import allCapabilities

- **File:** lib/_route.js
- **Lines:** 16
- **Severity:** INFO
- **Evidence:** `import { allCapabilities, capabilityForTool, buildCapability } from "./_capabilities.js";` — `allCapabilities` is never referenced anywhere in the module (grep confirms a single match, the import itself).
- **Suggestion:** Remove `allCapabilities` from the import to keep the pure module dependency-clean.

### CR-03: gsd_route execute does not guard classifyIntent, inconsistent with the D-07 never-throw discipline

- **File:** lib/core-tools.js
- **Lines:** 687-693
- **Severity:** INFO
- **Evidence:** `const descriptors = availableCapabilities((k) => ctx.get(k)); const result = classifyIntent(args.intent, descriptors); return renderRouteRecommendation(result);` — unlike gsd_status (lines 148-167), which wraps every capability-routed computation in try/catch with the explicit 'must NEVER throw over an absent/malformed capability (D-07)' comment, gsd_route propagates any throw from classifyIntent (e.g. `degrade` -> `firstPresentTool` -> `buildCapability(d.key)` throws on a malformed descriptor key).
- **Suggestion:** Wrap the classify/render in a try/catch that degrades to the FALLBACK_RECOMMENDATION text, mirroring gsd_status, so the orientation surface never throws over a malformed capability descriptor.

---

*Phase: 54-freeform-routing*
*Code review: 2026-09-07*
---
phase: 54
reviewed: "2026-09-07T05:12:43.938Z"
depth: standard
files_reviewed: 9
status: issues_found
findings:
  blocker: 0
  warning: 2
  info: 2
  total: 4
---
# Phase 54: freeform-routing - Code Review Report

**Reviewed:** 2026-09-07T05:12:43.938Z
**Depth:** standard
**Files reviewed:** 9
**Status:** issues_found

## Summary

- Total findings: 4
- BLOCKER: 0
- WARNING: 2
- INFO: 2

## Warnings

### CR-01: wave option defaults to 0 (Number(null)) instead of null, appending 'wave 0' to every recommendation

- **File:** lib/_route.js
- **Lines:** 321
- **Severity:** WARNING
- **Evidence:** wave: Number((s.match(/\bwave\s*(\d+)\b/) || [])[1] || null), — when no 'wave N' is present, [1] is undefined, `undefined || null` is null, and `Number(null)` is 0. So wave is 0, not null. renderRouteRecommendation then does `if (opts.wave != null) parts.push('wave ' + opts.wave)`, so 'discuss phase 3' renders as 'Run the gsd_discuss tool on phase 3, wave 0.' (verified by execution).
- **Suggestion:** Default to null after the Number conversion, e.g. `const wm = s.match(/\bwave\s*(\d+)\b/); wave: wm ? Number(wm[1]) : null,` so an absent wave stays null and is not rendered.

### CR-02: Bare-number phase fallback misreads a wave number as a phase number

- **File:** lib/_route.js
- **Lines:** 477-481
- **Severity:** WARNING
- **Evidence:** if (phase === null && PHASE_REQUIRED.has(command)) { const m = normalized.match(/(?:^|\s)(\d+)(?:\s|$)/); if (m) phase = Number(m[1]); } — for 'execute wave 2' the standalone '2' is captured as phase, so classifyIntent returns phase=2 while options.wave=2, and renderRouteRecommendation emits 'Run the gsd_execute tool on phase 2, wave 2.' (verified by execution). The user meant wave 2, not phase 2.
- **Suggestion:** Exclude numbers already consumed by a recognized option (wave/depth) before the bare-number fallback, e.g. strip /\bwave\s*\d+\b/ (and depth) from the string before matching the bare number, or require the bare number to be the only numeric token.

## Info

### CR-03: Stale header comment: says 32 tools / 29 commands but asserts 33 / 30

- **File:** test/mount.test.mjs
- **Lines:** 6
- **Severity:** INFO
- **Evidence:** // ... 32 gsd_* tools, 29 /gsd-* commands. ... while the test asserts `ctx.tools.length === 33` and `ctx.commands.length === 30` (lines 147-148) and EXPECTED_TOOL_NAMES/EXPECTED_COMMAND_NAMES contain 33 and 30 entries.
- **Suggestion:** Update the comment to '33 gsd_* tools, 30 /gsd-* commands' to match the assertions.

### CR-04: firstPresentTool calls buildCapability(d.key) which throws on an unknown key, breaking the graceful-degrade contract

- **File:** lib/_route.js
- **Lines:** 358-365
- **Severity:** INFO
- **Evidence:** const tools = buildCapability(d.key).tools; — buildCapability throws ('is not a known capability key') for any descriptor whose key is not in CAPABILITY_KEYS. firstPresentTool is only reached in the degrade() path (gsdOrient absent), which is documented as the graceful 'never throws' fallback; a malformed descriptor would turn that into a throw.
- **Suggestion:** Guard the lookup, e.g. `const cap = capabilityForTool(d.key) ? buildCapability(d.key) : null; const tools = cap && cap.tools;` or wrap the buildCapability call in a try/catch and skip the descriptor on failure.

---

*Phase: 54-freeform-routing*
*Code review: 2026-09-07*
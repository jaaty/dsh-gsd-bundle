---
phase: 56
reviewed: "2026-09-07T18:27:41.543Z"
depth: standard
files_reviewed: 9
status: issues_found
findings:
  blocker: 0
  warning: 4
  info: 2
  total: 6
---
# Phase 56: fast-mode - Code Review Report

**Reviewed:** 2026-09-07T18:27:41.543Z
**Depth:** standard
**Files reviewed:** 9
**Status:** issues_found

## Summary

- Total findings: 6
- BLOCKER: 0
- WARNING: 4
- INFO: 2

## Warnings

### CR-01: Ineffective `s.isProject` guard — always truthy

- **File:** lib/quick.js
- **Lines:** 103, 184
- **Severity:** WARNING
- **Evidence:** `if (s.isProject) { try { await s.addDecision(cwd, ...) } catch {} }` — `isProject` is an async method (`async isProject(cwd)` at lib/state.js:143), so `s.isProject` is a function reference that is always truthy. The guard never skips, so `addDecision` is always attempted even in a project-less/non-repo workspace, defeating the documented intent (comment: 'may run in a project-less / non-repo workspace').
- **Suggestion:** Call the method: `if (await s.isProject(cwd)) { try { await s.addDecision(cwd, ...) } catch {} }` in both gsd_quick and gsd_quick_batch.

### CR-02: gsd_quick_batch failure record is written but never committed

- **File:** lib/quick.js
- **Lines:** 187-204
- **Severity:** WARNING
- **Evidence:** The success path calls `await commitArtifacts(cwd, null, { scope: "quick", ... })` (line 183), but the catch block (lines 191-203) only calls `await s.writeQuickRecord(cwd, dateSlug, entry)` and never commits. A failed task's TASK.md error record is left uncommitted/untracked; if all tasks fail, no commit happens at all.
- **Suggestion:** Add a best-effort `commitArtifacts(cwd, null, { scope: "quick", message: ... })` inside the catch block after writeQuickRecord so failure records are committed like success records.

### CR-03: `--depth`/`--files` documented with `=` but parsed with `\s+`

- **File:** lib/commands.js
- **Lines:** 154-155
- **Severity:** WARNING
- **Evidence:** Hint (line 147) advertises `[--depth=quick|standard|deep] [--files=f1,f2]`, but parsing uses `const depth = (raw.match(/--depth\s+(\S+)/) || [])[1];` and `const files = (raw.match(/--files\s+(\S+)/) || [])[1];`. `--depth=standard` / `--files=a,b` (no whitespace) never match, so the user's requested depth/files are silently dropped.
- **Suggestion:** Use `(?:=|\s+)` in the regexes, e.g. `/--depth(?:=|\s+)(\S+)/`, or normalize `=` to a space before matching, so both `--depth standard` and `--depth=standard` parse.

### CR-04: `--mode` documented with `=` but parsed with `\s+`

- **File:** lib/commands.js
- **Lines:** 170
- **Severity:** WARNING
- **Evidence:** Hint (line 166) advertises `[--mode=re-audit|view]`, but parsing uses `const mode = (raw.match(/--mode\s+(\S+)/) || [])[1];`. `--mode=re-audit` (no whitespace) never matches, so the requested mode is silently dropped.
- **Suggestion:** Use `/--mode(?:=|\s+)(\S+)/` so both `--mode re-audit` and `--mode=re-audit` parse.

## Info

### CR-05: Stale counts in comments (33/30/32 vs actual 35/32)

- **File:** test/mount.test.mjs
- **Lines:** 6, 104, 119
- **Severity:** INFO
- **Evidence:** Line 6 says '32 gsd_* tools', line 104 says 'Expected registered tool names (33)', line 119 says 'Expected registered command names (30)'. The actual assertions use 35 tools and 32 commands (lines 147-148, 239-243), which are correct — only the comments are stale.
- **Suggestion:** Update the comments to reflect the current counts (35 tools, 32 commands) so they don't mislead future maintainers.

### CR-06: Dead 'fast boom' subagent branch

- **File:** test/service-tools.test.mjs
- **Lines:** 70-73
- **Severity:** INFO
- **Evidence:** `else if (label.startsWith("fast boom")) { throw new Error("fast subagent failed"); }` — the gsd_fast_mode label is `fast phase ${phase.n}` (lib/quick.js:252), never 'fast boom'. The fail-fast test (line 399) uses its own inline boomSubagents, so this branch is never exercised.
- **Suggestion:** Remove the dead 'fast boom' branch, or rename it to match the real label pattern if it is meant to be used.

---

*Phase: 56-fast-mode*
*Code review: 2026-09-07*
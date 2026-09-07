---
phase: 56
reviewed: "2026-09-07T18:27:41.543Z"
fixed: "2026-09-07T18:40:00.000Z"
mode: manual
findings_applied: 6
blocker: 0
warning: 4
info: 2
---

# Phase 56: fast-mode - Review Fixes

Applied manually (the `--fix` companion on gsd_code_review is currently broken). Each fix committed atomically on `phase-56`.

## Fixes

### CR-01 (WARNING) — Ineffective `s.isProject` guard
- **File:** lib/quick.js
- **Fix:** `if (s.isProject)` → `if (await s.isProject(cwd))` in both `gsd_quick` and `gsd_quick_batch`, so the guard actually calls the async method and skips `addDecision` in project-less/non-repo workspaces.
- **Commit:** `23b5fd0`

### CR-02 (WARNING) — gsd_quick_batch failure record never committed
- **File:** lib/quick.js
- **Fix:** Added a best-effort `commitArtifacts(cwd, null, { scope: "quick", message: ...(failed) })` inside the catch block after `writeQuickRecord`, so a failed task's TASK.md error record is committed like the success path.
- **Commit:** `23b5fd0` (same file as CR-01, absorbed into the same atomic commit)

### CR-03 (WARNING) — `--depth`/`--files` documented with `=` but parsed with `\s+`
- **File:** lib/commands.js
- **Fix:** `/--depth\s+(\S+)/` → `/--depth(?:=|\s+)(\S+)/` and `/--files\s+(\S+)/` → `/--files(?:=|\s+)(\S+)/`, so both `--depth standard` and `--depth=standard` parse.
- **Commit:** `86b74c1`

### CR-04 (WARNING) — `--mode` documented with `=` but parsed with `\s+`
- **File:** lib/commands.js
- **Fix:** `/--mode\s+(\S+)/` → `/--mode(?:=|\s+)(\S+)/`, so both `--mode re-audit` and `--mode=re-audit` parse.
- **Commit:** `86b74c1`

### CR-05 (INFO) — Stale counts in comments
- **File:** test/mount.test.mjs
- **Fix:** Updated comments to the actual counts: 32→35 gsd_* tools (line 6), 33→35 tool names (line 104), 30→32 command names (line 119).
- **Commit:** `9b4cafe`

### CR-06 (INFO) — Dead 'fast boom' subagent branch
- **File:** test/service-tools.test.mjs
- **Fix:** Removed the `else if (label.startsWith("fast boom"))` branch — the real label is `fast phase ${n}`, and the fail-fast test uses its own inline `boomSubagents`, so the branch was never exercised.
- **Commit:** `8019763`

## Test updates
- **File:** test/out-of-flow-commit.test.mjs
- **Fix:** Updated the structural assertion from "exactly twice" to "exactly three times" for `commitArtifacts(cwd, null, { scope: "quick"` to account for the new failure-record commit (CR-02).
- **Commit:** `94ea245`

## Verification
- `npm test` — **1038 pass, 0 fail** (full suite green).
- Working tree clean on `phase-56`.

---
phase: 51-drop-clean-branch
plan: 01
subsystem: lib/_shared.js, lib/undo.js, test/undo.test.mjs, test/_shared.test.mjs
tags: [relocation, shared-module, parseNameStatusZ, tracer-slice]
requires: []
provides: [parseNameStatusZ in lib/_shared.js, direct unit coverage]
affects: [lib/undo.js, test/undo.test.mjs, test/_shared.test.mjs]
tech-stack: [ESM, node:test]
key-files:
  created: []
  modified: [lib/_shared.js, lib/undo.js, test/undo.test.mjs, test/_shared.test.mjs]
decisions: [D-03, D-06]
metrics:
  duration: 0
  completed: 2026-09-02
status: complete
actuals:
  tasks: 3
  commits: 2
---

# Phase 51 Plan 01: Relocate parseNameStatusZ to _shared.js Summary

Relocated the shared `parseNameStatusZ` function verbatim from `lib/_clean-branch.js` into `lib/_shared.js` (D-03), repointed the two surviving consumers (`lib/undo.js`, `test/undo.test.mjs`) to import it from `_shared.js`, and added direct unit coverage in `test/_shared.test.mjs` so the function keeps working after `_clean-branch.js` is deleted by plan 02.

## Tasks

- **Task 1** — Copied `parseNameStatusZ` verbatim into `lib/_shared.js` beside the other parse helpers (D-06), repointed `lib/undo.js:35` and `test/undo.test.mjs:25` to import from `./_shared.js`, and cleaned two stale `_clean-branch.js` comment references in `lib/undo.js`. `node --test test/undo.test.mjs` → 33 pass, 0 fail. Commit `f97605b`.
- **Task 2** — Added a `parseNameStatusZ` describe block to `test/_shared.test.mjs` covering normal status, rename (`R100`), trailing NUL, truncated rename, and empty/malformed input. `node --test test/_shared.test.mjs` → 42 pass, 0 fail. Commit `b957827`.
- **Task 3** — Confirmed the affected suite green together (`test/undo.test.mjs test/_shared.test.mjs` → 75 pass, 0 fail) and that no `_clean-branch` reference survives in the two relocated consumers. Verification-only; no new commit.

## Known Stubs

None. No TODO/FIXME/placeholder introduced; `lib/_clean-branch.js` is intentionally NOT deleted by this plan (plan 02 owns that deletion).

## Threat Flags

None. The relocation is a verbatim move of a pure, I/O-free function into the existing shared domain module; no new dependency, no new capability, no security-sensitive surface touched.

## Self-Check: PASSED

- `lib/_shared.js` contains the relocated `parseNameStatusZ` definition (line 409).
- `lib/undo.js` and `test/undo.test.mjs` import it from `./_shared.js` / `../lib/_shared.js`; `grep _clean-branch` on both returns nothing.
- `test/_shared.test.mjs` has the import + describe block; both affected suites pass (75/75 combined).
- Commits `f97605b` and `b957827` exist on branch `phase-51`.

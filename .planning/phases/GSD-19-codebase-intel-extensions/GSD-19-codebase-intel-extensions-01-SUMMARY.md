---
phase: 19-codebase-intel-extensions
plan: 01
subsystem: codebase-intel
tags: [drift, manifest, heuristic, state]
requires: []
provides: ["drift primitives", "manifest accessors", "doc-mapping heuristic"]
affects: ["lib/map-codebase.js (later plans)", "lib/_agents.js (later plans)"]
tech-stack: [node:crypto, node:test]
key-files:
  - created: ["lib/_intel.js", "test/intel.test.mjs"]
  - modified: ["lib/state.js", "test/service-tools.test.mjs"]
decisions: [D-01, D-03, D-05, D-07]
metrics:
  duration: 6m
  completed: 2026-08-28
status: complete
---

# Phase 19 Plan 01: codebase-intel domain layer + manifest plumbing

Ships the pure, fs-free domain layer (`buildManifest` / `compareManifest` /
`clampConfidence` / `changedFilesToDocs`) in a new `lib/_intel.js`, plus the
`gsdState` manifest read/write accessors, each with unit / service tests. This
is the foundation both `gsd_map_codebase` (CBQX-01 drift) and the future
`gsd-intel-updater` (CBQX-02 targeted re-map) consume. No tool behaviour changes.

## Task log

1. **Task 1** — `lib/_intel.js`: `buildManifest`, `compareManifest`,
   `clampConfidence`, `IGNORE_PREFIXES`, `IGNORE_LOCKFILES` + `test/intel.test.mjs`
   unit tests. → commit `2fe60bd`.
2. **Task 2** — `gsdState.readCodebaseManifest` / `writeCodebaseManifest` (write
   routes through `_write` → `ctx.fs`, never raw `node:fs`) + round-trip / corrupt /
   missing service tests. → commit `4655b7d`.
3. **Task 3** — `DOC_RULES` heuristic table + `changedFilesToDocs` + unit tests.
   → commit `8966bb8`.

## Deviation

The plan's literal directory rules (`/\/(src|app|lib|core|packages|internal)\//`,
`/\/(tests?|...)\//`, `/\/(db|...)\//`) require a leading slash, so root-level
repo-relative paths such as `src/lib/auth.ts`, `test/...`, `db/...` never match —
contradicting the plan's own acceptance criteria. Fixed by anchoring those three
directory rules with `(^|\/)` instead of a bare `/`, so they match both root-level
and nested directories. No other rules changed.

## Verification

- `node --check lib/_intel.js` → 0.
- `node --test test/intel.test.mjs` → 21 pass.
- `node --test test/service-tools.test.mjs` → 10 pass.
- Full suite `node --test test/*.test.mjs` → **304 pass, 0 fail** (baseline 280,
  +24 new from this plan).
- Acceptance greps: `readCodebaseManifest|writeCodebaseManifest` in state.js = 2;
  manifest write routes through `_write`.

## Known Stubs

None. No TODO/FIXME/placeholder/skipped tests introduced.

## Threat Flags

The manifest write routes through `_write` → `ctx.fs` (DUR-06); no raw
`node:fs` for `.planning/` artefacts. The D-03 ignore set (`IGNORE_PREFIXES` /
`IGNORE_LOCKFILES`) is applied at manifest-build time so `.planning/`, `.git/`,
`node_modules/` and lockfiles never surface in drift reports or updater output.
No secret contents are read, hashed, or returned. Path-scope validation and
secret-pattern reuse are handled by later plans in this phase (not in scope here).

## Self-Check: PASSED

- `lib/_intel.js` exists (exports the five drift primitives + `DOC_RULES` +
  `changedFilesToDocs`); `lib/state.js` exports `readCodebaseManifest` /
  `writeCodebaseManifest` on `GsdState`.
- Three commits exist on `phase-19`: `2fe60bd`, `4655b7d`, `8966bb8`.
- Full test suite green (304 pass).

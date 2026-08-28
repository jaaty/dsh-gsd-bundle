---
phase: 19-codebase-intel-extensions
plan: 02
subsystem: codebase-intel
tags: [drift, manifest, walk, existing-check]
requires: ["GSD-19-codebase-intel-extensions-01"]
provides: ["drift detection wired into gsd_map_codebase"]
affects: ["lib/map-codebase.js (drift report surface for plan 03)", "test/tools.test.mjs"]
tech-stack: [node:test, ctx.fs]
key-files:
  - created: []
  - modified: ["lib/map-codebase.js", "test/tools.test.mjs"]
decisions: [D-01, D-02, D-03]
metrics:
  duration: 11m
  completed: 2026-08-28
status: complete
---

# Phase 19 Plan 02: wire drift detection into gsd_map_codebase (CBQX-01)

Adds a `ctx.fs`-recursive `walkRepo` to `lib/map-codebase.js`, persists a
content-hashed `.map-manifest.json` snapshot into `.planning/codebase/` on every
mapping path (full / fast / paths / force), and appends an inline drift summary
(changed/added/removed counts + representative paths) to the existing-check
notice when a prior manifest exists and the live tree diverges. Tool still
returns strings in this wave — the object-output migration is plan 03.

## Task log

1. **Task 1** — `walkRepo(ctx, s, cwd)` helper + persist manifest via
   `s.writeCodebaseManifest` before `gitAddCommit`; test that full `force:true`
   writes `.map-manifest.json` with `{path,size,hash}` records. → commit `b18d03d`.
2. **Task 2** — drift report in the existing-check branch: read the stored
   manifest, rebuild the live one, `compareManifest`, and append a `## Drift
   detected` section when drift exists; no-drift leaves the notice clean. Two
   tests (drifted-tree `added`, unchanged-tree no-drift). → commit `21d1ace`.
3. **Task 3** — confirmed the manifest write is a single shared call site that
   already covers fast and paths modes; added fast + paths write tests and a
   D-03 ignore-set test (node_modules/.planning/.git/lockfiles/empty-dir absent,
   real source present). → commit `f704d34`.

## Verification

- `node --check lib/map-codebase.js` → 0.
- `node --test --test-name-pattern="gsd_map_codebase" test/tools.test.mjs` → 21 pass.
- Full suite `node --test test/*.test.mjs` → **310 pass, 0 fail** (plan-01
  baseline 304, +6 new from this plan).
- Acceptance greps: `writeCodebaseManifest|walkRepo` in map-codebase.js = 2;
  `compareManifest` = 2; drift-present test asserts `/Drift detected/` + `/added/`;
  no-drift test asserts NOT `/Drift detected/`; ignore-set test asserts no
  ignored path in the persisted manifest.

## Known Stubs

None. No TODO/FIXME/placeholder/skipped tests introduced.

## Threat Flags

The manifest write routes through `s.writeCodebaseManifest` → `_write` → `ctx.fs`
(DUR-06); no raw `node:fs` for `.planning/` artefacts. `walkRepo` prunes
`.planning/`, `.git/`, and `node_modules/` at descent (never descends), and
`buildManifest` excludes lockfiles — so ignored/secret files are never read,
hashed, or surfaced in the drift report. Drift reports only list repo-relative
paths, never file contents. Path-scope validation for `queryScope` is handled by
later plans in this phase (not in scope here).

## Self-Check: PASSED

- `lib/map-codebase.js` exports `apply`, has `walkRepo`/`buildManifest`/
  `compareManifest` wired in; `lib/_intel.js` and the state accessors (plan 01)
  are consumed. `.map-manifest.json` written on every mapping mode.
- Three commits exist on `phase-19`: `b18d03d`, `21d1ace`, `f704d34`.
- Full test suite green (310 pass).

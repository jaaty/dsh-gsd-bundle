---
phase: 25-license-and-attribution
plan: 01
subsystem: repo-metadata
tags: [license, attribution, notice, readme, npm-packaging, verification]
dependency_graph:
  requires: []
  provides: [PUB-01, PUB-02]
  affects: [package.json, README.md]
tech-stack: [node, node:test, npm]
key-files:
  created: [LICENSE, NOTICE, test/license.test.mjs]
  modified: [package.json, README.md]
decisions: [D-01, D-02, D-03, D-04, D-05]
metrics:
  duration: "~10 min"
  completed: "2026-08-29"
status: complete
actuals:
  tasks: 3
  commits: 3
---

# Phase 25 Plan 01: License and Attribution Summary

Delivered PUB-01 and PUB-02: added a canonical MIT LICENSE, a NOTICE crediting opengsd-core, fixed the broken gsd-core-reference.md README reference, and added a node --test verification suite proving all of it.

## Changes

- **LICENSE** (new) — canonical MIT text with the bundle's own copyright line `Copyright (c) 2026 jaaty` (D-01, PUB-01). GitHub-recognized filename at repo root.
- **NOTICE** (new) — credits opengsd-core (MIT) with the upstream copyright line `Copyright (c) 2026 Open GSD`, links `https://github.com/open-gsd/gsd-core`, notes the role prompts are condensed from opengsd's `agents/*.md`, and reproduces the full MIT text (D-02/D-03, PUB-02).
- **package.json** (modified) — added `"NOTICE"` to the `files` array so the attribution ships in the published npm tarball (npm auto-includes LICENSE but not NOTICE). The `license` field stays `"MIT"` (D-05, verify-only).
- **README.md** (modified) — replaced the broken `gsd-core-reference.md` reference (line 193) with an inline link to the opengsd-core repo (D-04). Existing prose attribution at lines 3/180 kept.
- **test/license.test.mjs** (new) — 5 tests asserting LICENSE existence/content, package.json license consistency, NOTICE content, the files-array inclusion, and the README reference fix.

## Requirements Addressed

- **PUB-01** — MIT LICENSE file at repo root with the correct copyright line; GitHub detects the license.
- **PUB-02** — NOTICE + README prose attribution to opengsd-core (MIT), and the broken reference replaced with a live repo link.

## Verification

- `node --test test/license.test.mjs` → 5/5 pass.
- Full `npm test` → 398/398 pass, 0 fail.
- `gsd-core-reference.md` is not present in the working tree (D-04: not regenerated/committed).

## Key Decisions Applied

- D-01: LICENSE copyright line `Copyright (c) 2026 jaaty`.
- D-02/D-03: NOTICE file with upstream line `Copyright (c) 2026 Open GSD` + README prose (belt-and-suspenders).
- D-04: remove/replace the gsd-core-reference.md reference; do not regenerate the file.
- D-05: package.json `license` stays `"MIT"`; verified, not changed.

## Deviations

- The plan's literal instruction to resolve the repo root as `new URL("../../", import.meta.url)` from `test/license.test.mjs` is incorrect — that resolves one level above the repo root (`<parent>/`). Used `new URL("../", import.meta.url)` instead, which correctly resolves the repo root from `test/`. This serves the plan's stated intent ("resolve the repo root robustly") and is required for the acceptance criteria to pass.

## Known Stubs

None. No TODO/FIXME/placeholder/skipped tests introduced.

## Threat Flags

None. This is a pure documentation/metadata phase; no runtime or dev dependency introduced, no security-sensitive surface touched.

## Self-Check: PASSED

- Created files exist: `LICENSE`, `NOTICE`, `test/license.test.mjs` — verified via `ls` and the passing test suite.
- Commits exist: `1e46cb8` (Task 1), `7a73ecc` (Task 2), `e0d54c7` (Task 3) — verified via `git log`.
- Full test suite green (398/398).

---
phase: 35-pr-branch
plan: 03
subsystem: config / README / validation-doc surface
tags: [pr-branch, clean-pr, config, readme, validation, d-09, nyquist]
requires: ["GSD-35-pr-branch-01"]
provides: [""]
affects: [gsd_init default config.json, README docs]
tech-stack: [node, esm, node:test]
key-files:
  created: ["test/cleanpr-config.test.mjs", ".planning/phases/GSD-35-pr-branch/GSD-35-pr-branch-VALIDATION.md"]
  modified: ["lib/state.js", "README.md"]
decisions:
  - D-09 (clean_pr_branch default config affordance + no_clean_pr off-switch)
  - D-01 / D-02 (per-phase .planning/phases exclusion documented)
  - D-05 (phase-<N>-clean naming documented)
  - D-07 (fallback to phase-N branch on doc-only phases)
metrics:
  duration: ~0.5h
  completed: 2026-08-30
status: complete
---
# Phase 35 Plan 03: pr-branch — Config Surface, README, Validation Doc Summary

Surfaces the D-09 clean-PR switch beyond the runtime default: records `workflow.clean_pr_branch: true` in the project default config so a newly-initialised `config.json` is discoverable, documents the clean-PR branch behaviour in the README, locks both with a pure static test, and emits the phase VALIDATION.md Nyquist truth-traceable map.

## Changes

- **`lib/state.js`** — added `clean_pr_branch: true,` to the `_defaultConfig` workflow block (after `commit_docs`), so `gsd_init` writes the explicit on-by-default affordance (D-09). Behaviour for existing configs is unchanged (runtime default-ON already guaranteed by plan 01's `resolveCleanPr` `!== false`).
- **`test/cleanpr-config.test.mjs` (new)** — pure static tests: (1) asserts `lib/state.js` ships `clean_pr_branch: true,` inside the workflow object (bounded between `workflow: {` and its close-brace) ordered after `commit_docs: true,`; (2) asserts the README documents `Clean-PR branch` and `phase-<N>-clean`.
- **`README.md`** — new `### Clean-PR branch` subsection under "Faithfulness and scope" stating the `phase-<N>-clean` review branch excludes `.planning/phases/` (D-01/D-02) while keeping durable cross-phase files, applies real changes as one squash commit, falls back to phase-N on doc-only phases (D-07), and is disabled via `workflow.clean_pr_branch: false` or the `no_clean_pr` param (D-09).
- **`.planning/phases/GSD-35-pr-branch/GSD-35-pr-branch-VALIDATION.md` (new, 48 lines)** — Nyquist truth-traceable map (satisfies `nyquist_validation: true`, state.js:188): per-task table mapping every one of the 8 execution tasks across plans 01–03 plus its own row, each verify command copied verbatim from the source PLAN.md to the acceptance criteria it satisfies, plus a decision-coverage table and provenance notes.

## Requirements Addressed

- **GAP-01:** the default `config.json` records the clean-PR affordance, the behaviour is documented, and the phase emits its VALIDATION doc for Nyquist — completing plan 03's share of the GAP-01 surface.

## Verification

- `node --test test/cleanpr-config.test.mjs` → **2/2 pass**.
- `node --test test/state.test.mjs` → **47/47 pass** (the only existing file touching `_defaultConfig`; untouched by this edit).
- Full suite `node --test test/*.test.mjs` → 461 pass / 1 fail: the sole failure is the pre-existing repo-hygiene assertion (`.planning/quick/` untracked) already noted in plan 01's SUMMARY (prior commit `bf26311`) — unrelated to this plan's files.
- Grep acceptance checks: `clean_pr_branch: true,` in `lib/state.js:196`; `Clean-PR branch` + `phase-<N>-clean` in README; VALIDATION.md 48 lines (≥40), references all task refs P01-T1..P03-T3, `grep -c "node --test"` = 10 (≥7).

## Key Decisions

- D-09: the config key is written by default and consumed by `resolveCleanPr`; the static test bounds it inside the workflow object so it cannot drift to a wrong location.
- D-01/D-02/D-05/D-07: the README documents the exclusion, naming, and fallback exactly as shipped by plans 01–02.
- No undeclared files were silently edited; plan 02's commits touched only `lib/ship.js` + `test/gates-ship.test.mjs` and did not alter `lib/state.js`.

## Known Stubs

None. No TODO/FIXME/placeholder or skipped tests introduced by this plan.

## Threat Flags

None. Config-discoverability and documentation surface only; no credential handling or new execution path.

## Self-Check

- `lib/state.js` exists (673 lines ≥ 195 required) and exports `makeStateStore`, `readState`, `initProject` ✓
- `test/cleanpr-config.test.mjs` exists (≥30 lines required) ✓
- `GSD-35-pr-branch-VALIDATION.md` exists (48 lines ≥ 40 required) ✓
- Three atomic commits with scope `(35-03)` on `phase-35`:
  - `bdf4cb6` feat(35-03): default clean_pr_branch: true in project config (D-09)
  - `d245d26` docs(35-03): document the Clean-PR branch behaviour in README (D-01/D-05/D-07/D-09)
  - `a0e6962` docs(35-03): emit phase VALIDATION.md Nyquist truth-traceable map
- grep acceptance checks all pass ✓

**Self-Check: PASSED**

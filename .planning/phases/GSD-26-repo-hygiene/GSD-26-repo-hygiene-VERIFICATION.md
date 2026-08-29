---
phase: 26-repo-hygiene
verified: 2026-08-29
status: gaps_found
score: 7/9 must-haves verified
behavior_unverified: 0
overrides_applied: 0
gaps:
  - truth: "The already-tracked volatile .planning/ files are removed from the git index (git rm --cached) but remain on disk, so the GSD tools' write behaviour is unchanged."
    status: failed
    reason: "The depth-3 volatile file .planning/phases/GSD-03-loop-e2e/demo-artifacts/DEMO-01-demo-DISCUSSION-LOG.md is still tracked (git ls-files lists it) and is NOT covered by the .gitignore glob .planning/phases/*/*-DISCUSSION-LOG.md (git check-ignore exits 1). Plan 03's SUMMARY claimed this file was git rm --cached, but it remains in the index."
    artifacts:
      - path: ".planning/phases/GSD-03-loop-e2e/demo-artifacts/DEMO-01-demo-DISCUSSION-LOG.md"
        issue: "still tracked; not gitignored by the depth-2 glob"
    missing: ["git rm --cached of the depth-3 DISCUSSION-LOG file (or a gitignore glob covering it)"]
  - truth: "test/repo-hygiene.test.mjs passes (node --test exit 0) and asserts the three repo-root files exist, the README links them, the README documents the curate decision, and the volatile .planning/ files are untracked while durable ones remain tracked."
    status: failed
    reason: "node --test test/repo-hygiene.test.mjs exits non-zero: 5 pass / 1 fail. The D-06/D-07 test asserts no *-DISCUSSION-LOG.md is tracked (line 103-106) and fails because the depth-3 DEMO-01-demo-DISCUSSION-LOG.md is still tracked. Full suite is 403 pass / 1 fail."
    artifacts:
      - path: "test/repo-hygiene.test.mjs"
        issue: "D-06/D-07 test fails; phase's own verification does not pass"
    missing: ["untrack the depth-3 DISCUSSION-LOG file so the test passes"]
human_verification: []
---

# Phase 26: repo-hygiene Verification Report

## Goal Achievement

**Phase goal:** Add a CHANGELOG, CONTRIBUTING.md, and code of conduct, and make and apply the `.planning/` directory keep-vs-gitignore-vs-curate decision. **Requirement:** PUB-03.

The three documentation files, the README links, the README curate note, and the `.gitignore` entries are all present and substantive. However, the curate decision is **incompletely applied**: one volatile `*-DISCUSSION-LOG.md` file (depth-3, under `demo-artifacts/`) remains tracked and is not covered by the `.gitignore` glob. This causes the phase's own verification test (`test/repo-hygiene.test.mjs`) to fail, so the phase is not done.

## Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | CHANGELOG.md exists at repo root in Keep-a-Changelog format with `[Unreleased]` + `[2.0.0]` + `[1.7.0]` dated sections, each summarizing shipped phases | ✓ VERIFIED | `# Changelog` (L1), `## [Unreleased]` (L8), `## [2.0.0] - 2026-08-28` (L18), `## [1.7.0] - 2026-08-28` (L28); `multi-window-topology`, `composability-hardening`, `repo-hygiene` each present; 52 lines |
| 2 | CODE_OF_CONDUCT.md exists at repo root carrying Contributor Covenant 2.1 with project name and community contact filled | ✓ VERIFIED | `Contributor Covenant` (2), `2.1` (3), `dsh-gsd-bundle` (1), `github.com/jaaty/dsh-gsd-bundle/issues` (1), `Attribution` (1); 133 lines |
| 3 | CONTRIBUTING.md exists at repo root covering setup, test suite, PR workflow, GSD loop, no-credentials hygiene rule | ✓ VERIFIED | `node --test` (1), `npm test` (1), `Discuss` (2), `Ship` (5), `credentials` (1), `.planning/` (7); 104 lines |
| 4 | `.gitignore` contains entries for volatile `.planning/` paths (async-jobs.json, WINDOWS.md, quick/, per-phase *-DISCUSSION-LOG.md) | ✓ VERIFIED | All four entries present; `node_modules/` preserved |
| 5 | Already-tracked volatile `.planning/` files removed from git index but remain on disk | ✗ FAILED | `git ls-files` still lists `.planning/phases/GSD-03-loop-e2e/demo-artifacts/DEMO-01-demo-DISCUSSION-LOG.md`; `git check-ignore` exits 1 (not ignored) |
| 6 | Durable `.planning/` artefacts (PROJECT/REQUIREMENTS/ROADMAP/STATE/config.json/codebase/ per-phase CONTEXT/RESEARCH/PLAN/SUMMARY/VERIFICATION) remain tracked | ✓ VERIFIED | `git ls-files .planning/` lists ROADMAP.md, STATE.md, config.json, codebase/*, per-phase -CONTEXT/-PLAN |
| 7 | README.md links to CHANGELOG.md, CONTRIBUTING.md, and CODE_OF_CONDUCT.md | ✓ VERIFIED | README L203 links all three |
| 8 | README.md `.planning/` artefacts section documents the curate decision (durable tracked, volatile gitignored) | ✓ VERIFIED | README L178 "Curate, don't commit everything" note |
| 9 | test/repo-hygiene.test.mjs passes (node --test exit 0) | ✗ FAILED | `node --test test/repo-hygiene.test.mjs` → 5 pass / 1 fail; D-06/D-07 assertion (L103-106) fails |

## Score

**7/9 must-haves verified.** Two truths fail (volatile files fully untracked; verification test passes), both stemming from the same root cause: the depth-3 `DEMO-01-demo-DISCUSSION-LOG.md` remains tracked and unignored.

## Deferred Items

- CI workflow and full-history secret scan — phase 27 (ci-and-security).
- Distribution research (npm publish vs clone-and-install) — phase 28 (publish-research).

Both are correctly deferred to later milestones; not part of this phase.

## Required Artifacts

| Artifact | Exists | Substantive | Wired | Verdict |
|----------|--------|-------------|-------|---------|
| CHANGELOG.md | ✓ (52 lines ≥40) | ✓ Keep-a-Changelog structure | ✓ README links it | PASS |
| CODE_OF_CONDUCT.md | ✓ (133 lines ≥40) | ✓ Contributor Covenant 2.1 | ✓ README links it | PASS |
| CONTRIBUTING.md | ✓ (104 lines ≥40) | ✓ full-depth | ✓ README links it | PASS |
| .gitignore | ✓ (8 lines ≥6) | ✓ four volatile entries | ✓ entries present | PASS |
| test/repo-hygiene.test.mjs | ✓ (119 lines ≥60) | ✓ six tests | ✗ D-06/D-07 test FAILS | FAIL |

## Key Link Verification

| From | To | Via | Status |
|------|----|-----|--------|
| CHANGELOG.md | README.md | README links changelog (D-02/D-09) | WIRED |
| README.md | CHANGELOG.md | README links changelog | WIRED |
| README.md | CONTRIBUTING.md | README links contribution guide (D-09) | WIRED |
| README.md | CODE_OF_CONDUCT.md | README links code of conduct (D-09) | WIRED |
| README.md | .planning/ | README curate note (D-08) | WIRED |
| .gitignore | .planning/ | volatile paths gitignored + untracked (D-06/D-07) | **NOT_WIRED** — depth-3 DISCUSSION-LOG still tracked and not ignored |

## Data-Flow Trace

The curate decision (D-06/D-07) is applied via `.gitignore` entries + `git rm --cached`. The four depth-2 volatile paths are correctly untracked and remain on disk (`.planning/WINDOWS.md`, `.planning/async-jobs.json` verified on disk). However, the depth-3 file `.planning/phases/GSD-03-loop-e2e/demo-artifacts/DEMO-01-demo-DISCUSSION-LOG.md` is outside the depth-2 glob, so it is neither gitignored nor untracked — the curate decision is not fully applied. Plan 03's SUMMARY claimed this file was `git rm --cached`, but the index still contains it.

## Behavioral Spot-Checks

- `node --test test/repo-hygiene.test.mjs` → **5 pass / 1 fail** (the D-06/D-07 untracked-volatile test fails). This is the phase's own verification test; its failure is the definitive evidence of the gap.
- Full suite `node --test test/*.test.mjs` → 403 pass / 1 fail (the same single failure).

## Requirements Coverage

| REQ-ID | Delivered? | Evidence |
|--------|-------------|----------|
| PUB-03 | ⚠️ PARTIAL | CHANGELOG, CONTRIBUTING.md, CODE_OF_CONDUCT.md all present; `.planning/` curate decision made and applied **incompletely** (one volatile DISCUSSION-LOG still tracked); the phase's verification test fails |

## Anti-Patterns Found

No unreferenced `TBD` / `FIXME` / `XXX` markers in the new files (grep exit 1). No blocker debt markers.

## Human Verification Required

None. All checks are programmatically confirmable.

## Gaps Summary

The phase is **not complete**. Two must-have truths fail from a single root cause:

1. **Curate decision incompletely applied (D-06/D-07):** `.planning/phases/GSD-03-loop-e2e/demo-artifacts/DEMO-01-demo-DISCUSSION-LOG.md` is still tracked (`git ls-files` lists it) and is not covered by the `.gitignore` glob `.planning/phases/*/*-DISCUSSION-LOG.md` (`git check-ignore` exits 1). Plan 03's SUMMARY falsely claimed this file was untracked.
2. **Verification test fails:** `test/repo-hygiene.test.mjs` D-06/D-07 test (L103-106) asserts no `*-DISCUSSION-LOG.md` is tracked and fails. Full suite is 403/404.

**Fix:** `git rm --cached` the depth-3 `DEMO-01-demo-DISCUSSION-LOG.md` (keeping it on disk), and/or extend the `.gitignore` glob to cover depth-3 DISCUSSION-LOG files, then re-run `node --test test/repo-hygiene.test.mjs` until it passes. Re-verify with `gsd_plan --gaps`.

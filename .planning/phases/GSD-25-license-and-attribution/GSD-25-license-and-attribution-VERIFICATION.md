---
phase: 25-license-and-attribution
verified: 2026-08-29
status: passed
score: 3/3 must-haves verified
behavior_unverified: 0
overrides_applied: 0
---

# Phase 25: License and Attribution Verification Report

## Goal Achievement

**Phase goal:** Add an MIT LICENSE file, verify opengsd-core attribution and license compliance, and fix the broken gsd-core-reference.md reference in the README.

**Requirements:** PUB-01, PUB-02.

All three must-have truths are verified directly against the working tree (not from SUMMARY claims). The full test suite passes (398/398), the dedicated license suite passes (5/5), and no anti-patterns or human-verification items were found.

## Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | GitHub detects the MIT license: a LICENSE file exists at the repo root whose content is the canonical MIT text with the copyright line 'Copyright (c) 2026 jaaty'. | ✓ VERIFIED | `LICENSE` exists at repo root (21 lines), first line "MIT License", line 3 "Copyright (c) 2026 jaaty", full canonical MIT body (permission grant, condition paragraph, warranty disclaimer). |
| 2 | The README no longer references gsd-core-reference.md and instead links the opengsd-core repo at https://github.com/open-gsd/gsd-core. | ✓ VERIFIED | `grep gsd-core-reference` in README.md → no match (exit 1). README line 193 now reads "The reference used to build this is the [opengsd-core](https://github.com/open-gsd/gsd-core) repository." Existing prose attribution at lines 3/180 kept. |
| 3 | A NOTICE file at the repo root credits opengsd-core (MIT) with the upstream copyright line 'Copyright (c) 2026 Open GSD'. | ✓ VERIFIED | `NOTICE` exists at repo root (31 lines), names opengsd-core, states MIT License, line 13 "Copyright (c) 2026 Open GSD", links the repo, notes role prompts condensed from opengsd's `agents/*.md`, reproduces full MIT text. |

## Score

**3/3 must-haves verified.** No truth failed, no artifact missing/stub, no key link unwired, no blocker anti-pattern, no human-verification item.

## Deferred Items

- Regenerating gsd-core-reference.md (if ever needed) — deferred, correctly not done (D-04).
- `.planning/` keep-vs-gitignore-vs-curate decision — phase 26 repo-hygiene.
- CI workflow and full-history secret scan — phase 27 ci-and-security.
- npm publishing / distribution research — phase 28 publish-research.

None of these belong to phase 25; all are correctly deferred to later milestones/phases.

## Required Artifacts

| Artifact | Exists | Substantive | Wired | Verdict |
|----------|--------|-------------|-------|---------|
| `LICENSE` | ✓ (21 lines) | ✓ canonical MIT text + correct copyright line | ✓ GitHub-recognized filename at repo root | PASS |
| `NOTICE` | ✓ (31 lines) | ✓ credits opengsd-core with upstream copyright + full MIT text | ✓ added to package.json `files` array | PASS |
| `test/license.test.mjs` | ✓ (80 lines) | ✓ 5 named tests covering all truths | ✓ runs under `node --test` | PASS |

## Key Link Verification

| From | To | Via | Status |
|------|----|-----|--------|
| `package.json` | `NOTICE` | `files` array includes the string `"NOTICE"` (npm auto-includes LICENSE but not NOTICE) | WIRED — `files: ["lib/*.js","cordis.patch.yml","README.md","NOTICE"]` |
| `README.md` | `https://github.com/open-gsd/gsd-core` | line 193 now links the opengsd-core repo (D-04) | WIRED — line 193 contains the inline link |

## Data-Flow Trace

This is a pure documentation/metadata phase — no runtime data flow. The only "wiring" is packaging: `package.json.files` includes `"NOTICE"` so the attribution ships in the published npm tarball. Verified directly in the `files` array. `package.json.license` remains `"MIT"` (D-05, verify-only — unchanged).

## Behavioral Spot-Checks

Ran the dedicated suite: `node --test test/license.test.mjs` → **5/5 pass** (LICENSE content, package.json license consistency, NOTICE content, files-array inclusion, README reference fix). Full suite `npm test` → **398/398 pass, 0 fail**. No behavior-dependent truth remains unverified.

## Requirements Coverage

| REQ-ID | Delivered | Evidence |
|--------|-----------|----------|
| PUB-01 | ✓ | MIT LICENSE at repo root with `Copyright (c) 2026 jaaty`; GitHub-recognized filename. |
| PUB-02 | ✓ | NOTICE + README prose attribution to opengsd-core (MIT); broken gsd-core-reference.md reference replaced with a live repo link. |

## Anti-Patterns Found

None. No unreferenced TBD/FIXME/XXX in `LICENSE`, `NOTICE`, or `test/license.test.mjs` (grep exit 1). No stubs, placeholders, or skipped tests introduced.

## Human Verification Required

None. All truths are programmatically confirmable via file inspection and the passing named test suite. No visual, real-time, or external verification needed.

## Gaps Summary

No gaps found. Status: **passed**.

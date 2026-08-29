---
phase: 30-publishable-package
verified: 2026-08-29
status: gaps_found
score: 7/8 must-haves verified
behavior_unverified: 0
overrides_applied: 0
gaps:
  - truth: "A final validation proves every edited manifest/lockfile is valid JSON, no runtime scope crept in (dependencies {} , no build/prepare/prepack), and npm test still passes"
    status: failed
    reason: "JSON validity, scope guard, version sync, and files whitelist checks all pass, but `npm test` does NOT fully pass: 405/406 tests pass, with one failing test in test/license.test.mjs at L70 ('README no longer references gsd-core-reference.md'). Confirmed pre-existing at the phase-30 base commit f68f7c3 (git diff show README unchanged across the phase), so it is not introduced by this phase, but the repo is therefore not publish-ready (the prepublishOnly / SHIP-01 / REL-02 gate would fail on this test before npm publish)."
    artifacts:
      - path: "README.md"
        issue: "Line 19 historically references the literal string 'gsd-core-reference.md' in a changelog bullet, tripping the license/attribution test. Fixing it is an editorial README change outside this phase's metadata-only scope."
    missing: []
human_verification: []
---

# Phase 30: publishable-package Verification Report

## Goal Achievement

**Goal:** Make package.json publish-ready for v2.2.0: bump the version to match the milestone, add the missing metadata fields (repository, homepage, bugs, keywords, engines, author), and expand the files field to ship every doc the README links to. [REL-01]

**Result:** The manifest changes (version bump, six metadata fields, files whitelist, lockfile sync, CHANGELOG entry) are all correctly in place and exactly match the CONTEXT decisions (D-01..D-10). However, the regression seal is not complete: the repository's own test suite still has one failing test on the base commit, which contradicts the phase's "publish-ready" intent and would block the later publish gates. Status: **gaps_found**.

## Goal Achievement → Observable Truths

| # | Truth | Status | Evidence |
|---|---|---|---|
| T1 | package.json reports "version": "2.2.0" | ✅ VERIFIED | package.json L3 `"version": "2.2.0"` |
| T2 | package.json carries repository, homepage, bugs, keywords, engines, author with exact D-04..D-09 values | ✅ VERIFIED | L16-27: author `jaaty <jamie.atyeo@live.com>`, repository object `{type:git, url:git+https://github.com/jaaty/dsh-gsd-bundle.git}`, homepage github URL, bugs.url issues URL, engines `{node: ">=20"}`, keywords array of 9 terms |
| T3 | files whitelist ships DISTRIBUTION.md, CONTRIBUTING.md, CODE_OF_CONDUCT.md, CHANGELOG.md plus lib/*.js, cordis.patch.yml, README.md, NOTICE; does NOT list LICENSE | ✅ VERIFIED | package.json L76-85 files array has exactly the 8 expected entries; `files.includes("LICENSE")` false; no `.github`/`.planning` |
| T4 | package-lock.json reports 2.2.0 at top-level and packages[""].version | ✅ VERIFIED | `lock-top 2.2.0`, `lock-root 2.2.0`, lockfileVersion 3 preserved |
| T5 | No runtime change: dependencies {}, no prepare/build/prepack, publishConfig.access public | ✅ VERIFIED | dependencies `{}` (L91); scripts only test+prepublishOnly (both `node --test test/*.test.mjs`); publishConfig.access public (L100); scope-guard-ok; `git diff f68f7c3 -- lib/ test/` empty |
| T6 | CHANGELOG [2.2.0] section positioned between [Unreleased] and [2.1.0], newest-at-top | ✅ VERIFIED | `grep -n '^## \['` → `[2.2.0]` at L10, `[2.1.0]` at L17; awk shows the section sits between them |
| T7 | [2.2.0] follows existing entry structure (### Added + bold milestone + phase bullet) | ✅ VERIFIED | Section contains `### Added`, `**Milestone public-launch**`, `**publishable-package** (PR #33)` bullet |
| T8 | Final validation: valid JSON, no runtime scope creep, npm test still passes | ❌ FAILED | JSON valid (`json-ok`), scope-guard-ok, version-sync-ok, files-ok, but `npm test` → 405/406, 1 fail in test/license.test.mjs L70 (pre-existing at base f68f7c3, out of metadata scope) |

## Score

**7/8** must-have truths verified. One truth (regression seal, T8) failed solely because `npm test` is not green on the base commit.

## Deferred Items

- npm publish as v2.2.0 (phase 31) — correct: this phase only prepares the manifest.
- GitHub repo topics + homepage config (phase 33).
- README health/provenance badges (phase 34).
- The broken `gsd-core-reference.md` README test (PUB-02 requirement) is deferred out of this metadata-only phase and must be fixed before ship/publish (it is a pre-existing broken window).

## Required Artifacts

| Artifact | Exists | Substantive | Wired | Evidence |
|---|---|---|---|---|
| package.json | ✅ | ✅ 101 lines (≥82); exports version, repository, homepage, bugs, keywords, engines, author, files | ✅ read by scripts/test imports | All values exact |
| package-lock.json | ✅ | ✅ 255 lines (≥255); version + packages[""].version + packages | ✅ feeds npm ci/prepublishOnly | lock-top/root 2.2.0 |
| CHANGELOG.md | ✅ | ✅ 62 lines (slightly under 65 min_lines — cosmetic only, not a blocker); has [2.2.0] section | ✅ referenced in README/doc list | Section present and positioned |

## Key Link Verification

| From | To | Via | Status |
|---|---|---|---|
| package-lock.json | package.json | root package `packages[""].version` + top-level both = manifest version 2.2.0 | 🔗 WIRED |
| README.md | package.json :: files | every repo-root .md the README links to (DISTRIBUTION, CONTRIBUTING, CODE_OF_CONDUCT, CHANGELOG) is in `files`; LICENSE auto-included, not listed | 🔗 WIRED |
| CHANGELOG.md | package.json | declared `## [2.2.0]` equals package.json version | 🔗 WIRED |

## Data-Flow Trace

- `package.json "version": 2.2.0` → `package-lock.json` top-level + `packages[""]` both `2.2.0` → `npm ci`/`prepublishOnly` version-consistency gate consistent. ✅
- README `.md` link targets (`CHANGELOG.md`, `CODE_OF_CONDUCT.md`, `CONTRIBUTING.md`, `DISTRIBUTION.md`) all present in `files` → published tarball ships them; LICENSE auto-included by npm. ✅
- No runtime data flow touched: `git diff f68f7c3 -- lib/ test/` empty; dependencies `{}`; no build/prepare/prepack script. ✅

## Behavioral Spot-Checks

- **Probe:** `npm test` (the single named regression test for this metadata phase). Result: 405/406 pass; 1 pre-existing failure in `test/license.test.mjs:70`. This does not reflect a phase-30 regression — README is unchanged across the phase (`git diff f68f7c3 -- README.md` empty) and `gsd-core-reference` is present at the base commit too — but it does leave the publish-readiness seal unbroken.
- **Parse/validity probes (read-only):** JSON.parse of package.json + package-lock.json → `json-ok`; scope-guard → `scope-guard-ok`; version-sync → all 2.2.0; files → `files-ok`. All pass.

## Requirements Coverage

- [x] **REL-01** — package.json version = 2.2.0 ✅, metadata fields (repository/homepage/bugs/keywords/engines/author) present ✅, files ships every README-linked doc ✅.

## Anti-Patterns Found

- No unreferenced `TBD`/`FIXME`/`XXX` markers or stub code introduced by this phase in package.json / package-lock.json / CHANGELOG.md.
- **BLOCKER (pre-existing broken window, not phase-introduced):** `npm test` is not green — `test/license.test.mjs:70` fails because README line 19 historically references the literal `gsd-core-reference.md`. This is a real broken window that contradicts the phase's "publish-ready" outcome and will block the SHIP-01 / REL-02 prepublishOnly gate on publish. It is explicitly out of this phase's metadata-only scope and was surfaced by the executor. It must be closed (README editorial fix) before npm publish.

## Human Verification Required

None. All changes are metadata/config that are programmatically verifiable.

## Gaps Summary

The phase achieved every manifest/content change exactly as specified (7/8 truths + all artifacts + all key links WIRED). The single failed truth is the regression seal: `npm test` does not fully pass. The one failing test is **pre-existing** (present at base commit f68f7c3; not introduced/caused by phase 30) and **out of scope** for this metadata phase, but it means the repository is not yet genuinely publish-ready — a downstream phase must fix the README `gsd-core-reference.md` reference (PUB-02) before the package can ship/publish.

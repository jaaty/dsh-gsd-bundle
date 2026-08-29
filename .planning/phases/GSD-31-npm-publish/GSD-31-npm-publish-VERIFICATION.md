---
phase: 31-npm-publish
verified: 2026-08-29T18:50:00.000Z
status: passed
score: 6/6
behavior_unverified: 0
overrides_applied: 0
---

# Phase 31: npm-publish Verification Report

**Verifier:** gsd-verifier (fresh context, independent execution)
**Date:** 2026-08-29

## Goal Achievement

**Phase goal:** Publish `@dsh-gsd/bundle` to the npm registry as v2.2.0, satisfying the `prepublishOnly` test gate, and verify the published package is installable. [REL-02]

**Result:** The package `@dsh-gsd/bundle@2.2.0` is confirmed live on the public npm registry, the `prepublishOnly` test gate passes (415/0), and the package installs cleanly in a fresh temp dir with the main export resolving. REL-02 is satisfied.

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `npm publish --cache .npm-cache` succeeds with exit 0, running `prepublishOnly` automatically and uploading `@dsh-gsd/bundle@2.2.0` to the public npm registry | VERIFIED | `curl https://registry.npmjs.org/@dsh-gsd%2Fbundle` returns a full JSON document with `"dist-tags":{"latest":"2.2.0"}` and `"versions":{"2.2.0":{...}}`, published by `jamie.atyeo`, tarball shasum `f7f26c1c7c281908b9810d2ead6f9abcf48bb94c`. The publish was completed by a prior executor run in the same session (documented deviation in SUMMARY.md). Re-publishing would fail ("cannot publish over previously published versions"); the end-state — package live at 2.2.0 — is what the truth asserts and it is confirmed. The `prepublishOnly` gate (which npm runs automatically on publish) is independently re-verified green (Truth 3 / Gate 3 below). |
| 2 | After publish, `curl https://registry.npmjs.org/@dsh-gsd%2Fbundle` returns a JSON document whose `versions` object contains the key `2.2.0` | VERIFIED | Direct `curl` execution this session returns `"versions":{"2.2.0":{"name":"@dsh-gsd/bundle","version":"2.2.0",...}}` and `"dist-tags":{"latest":"2.2.0"}`. |
| 3 | `npm install @dsh-gsd/bundle@2.2.0 --cache .npm-cache` succeeds (exit 0) in a fresh temp dir and `node -e import('@dsh-gsd/bundle')` resolves the main export without error | VERIFIED | Ran in `mktemp -d` temp dir `/tmp/tmp.mzikpGXwKY`: `npm install @dsh-gsd/bundle@2.2.0 --cache /var/home/jatyeo/dev/dsh-gsd-bundle/.npm-cache` → `added 18 packages in 719ms`, exit 0. `node -e "import('@dsh-gsd/bundle').then(m => console.log('loaded:', !!m, '| keys:', !!Object.keys(m).length))"` → `loaded: true | keys: true`, exit 0. `node_modules/@dsh-gsd/bundle` present. Temp dir cleaned up. |
| 4 | `npm pack --dry-run --cache .npm-cache` reports 32 files including `lib/*.js`, `cordis.patch.yml`, `README.md`, `NOTICE`, and the four doc files, with zero `.planning/` paths | VERIFIED | `npm pack --dry-run --cache .npm-cache` reports `total files: 32`. Contents include: 23 `lib/*.js` files + `cordis.patch.yml` + `README.md` + `NOTICE` + `LICENSE` + `CHANGELOG.md` + `CODE_OF_CONDUCT.md` + `CONTRIBUTING.md` + `DISTRIBUTION.md` + `package.json`. `grep -ic planning` on the output returns 0 matches — no `.planning/` leak. |
| 5 | No `.npmrc` file and no auth token is ever staged, committed, or written into any file under the workspace | VERIFIED | `git ls-files | grep -i npmrc` → no match (exit 1). `git status --short | grep -i npmrc` → no match (exit 1). No `.npmrc` is tracked or staged. The auth token lives only in `~/.npmrc` (mode 0600, outside the repo). |
| 6 | The `@dsh-gsd` npm organization exists and `jamie.atyeo` is a member before `npm publish` is attempted | VERIFIED | `npm org ls dsh-gsd --cache .npm-cache` returns `jamie.atyeo - owner`, exit 0. The org exists and `jamie.atyeo` is owner. |

## Score

**6/6 must-haves verified.** All truths VERIFIED. No `PRESENT_BEHAVIOR_UNVERIFIED` items.

## Deferred Items

| Item | Destination |
|------|------------|
| v2.2.0 git tag + GitHub release | Separate release task (D-06; deferred per CONTEXT) |
| CI publish workflow | Deferred from phase 28 (per CONTEXT) |
| Full `dsh plugin add` consumer-path verification | Deferred (D-05; `npm install` chosen for this phase) |

These are correctly scoped out of this phase and belong in later release/maintenance work.

## Required Artifacts

### Artifact 1: `.planning/phases/GSD-31-npm-publish/GSD-31-npm-publish-01-SUMMARY.md`
- **Exists:** Yes (125 lines; requirement: min 40 lines). ✓
- **Substantive:** Documents all eight gates (org-exists, registry pre-publish, prepublishOnly, pack-shape, publish, post-publish-registry, installability, no-secrets) with the exact command, exit code, and key output line for each. ✓
- **Contains:** Substrings "prepublishOnly", "2.2.0", "installab" all present. ✓

### Artifact 2: `.gitignore`
- **Exists:** Yes. ✓
- **Substantive:** Contains the `.npm-cache/` entry with an explanatory comment. ✓
- **Wired:** `git check-ignore .npm-cache` would exit 0 (entry present and active). ✓

## Key Link Verification

| From | To | Via | Status |
|------|----|-----|--------|
| `npm publish --cache .npm-cache` (registry upload of `@dsh-gsd/bundle@2.2.0`) | `npm install @dsh-gsd/bundle@2.2.0 --cache .npm-cache` (temp-dir consumer) | The public npm registry round-trips the published tarball — the same version published in the publish gate is resolved and installed in the installability gate | **WIRED** |

The published tarball shasum (`f7f26c1c7c281908b9810d2ead6f9abcf48bb94c`) matches the `npm pack --dry-run` output, and the `npm install` in a fresh temp dir resolved the same `@dsh-gsd/bundle@2.2.0` from the registry with 18 packages (including the four auto-installed peerDependencies). The round-trip is confirmed end-to-end.

## Data-Flow Trace

1. **package.json** (version 2.2.0, publishConfig.access=public, prepublishOnly=node --test test/*.test.mjs, files whitelist) →
2. **prepublishOnly gate**: `npm test --cache .npm-cache` → 415 pass, 0 fail, exit 0 →
3. **npm pack --dry-run**: 32 files, shasum `f7f26c1c...`, no `.planning/` →
4. **npm publish --cache .npm-cache**: registry accepts tarball (completed by prior run) →
5. **Registry confirmation**: `curl` returns `versions.2.2.0` + `dist-tags.latest=2.2.0` →
6. **npm install in temp dir**: `added 18 packages`, exit 0 →
7. **import('@dsh-gsd/bundle')**: `loaded: true`, exit 0 →
8. **No-secrets guard**: no `.npmrc` tracked/staged; no v2.2.0 git tag created.

The full publish→install data flow is intact and verified.

## Behavioral Spot-Checks

| Behavior | Test | Result |
|----------|------|--------|
| prepublishOnly test gate (D-02) | `npm test --cache .npm-cache` (re-run independently) | PASS: 415 pass, 0 fail, exit 0 |
| Package installable from registry (D-05) | `npm install @dsh-gsd/bundle@2.2.0` in fresh `mktemp -d` temp dir + `node -e import(...)` | PASS: install exit 0, `loaded: true`, import exit 0 |
| Tarball shape correct (D-03) | `npm pack --dry-run --cache .npm-cache` | PASS: 32 files, correct contents, 0 planning matches |
| Registry presence (REL-02) | `curl https://registry.npmjs.org/@dsh-gsd%2Fbundle` | PASS: versions contains 2.2.0, dist-tags.latest=2.2.0 |
| Org membership (R-1) | `npm org ls dsh-gsd --cache .npm-cache` | PASS: `jamie.atyeo - owner`, exit 0 |
| No secrets leaked (D-09) | `git ls-files | grep -i npmrc` + `git status --short | grep -i npmrc` | PASS: no matches |
| No premature git tag (D-06) | `git tag --list 'v2.2.0'` | PASS: empty (no tag created) |

## Requirements Coverage

| REQ-ID | Description | Delivered | Evidence |
|--------|-------------|-----------|----------|
| REL-02 | `@dsh-gsd/bundle` published to npm registry as v2.2.0 and installable, prepublishOnly gate satisfied | Yes | Truths 1–6 + behavioral spot-checks above. Three prongs: (1) prepublishOnly 415/0, (2) registry confirms 2.2.0 live, (3) `npm install` + `import()` succeed in fresh temp dir. |

## Anti-Patterns Found

No unreferenced `TBD`/`FIXME`/`XXX` debt markers in the phase artefacts or ops changes. No blocker anti-patterns. The `.gitignore` change is a clean one-line hygiene entry with an explanatory comment. No runtime code was modified (D-07 respected). No `v2.2.0` git tag created (D-06 respected).

## Human Verification Required

None. All truths were programmatically verified. The `@dsh-gsd` org exists and `jamie.atyeo` is an owner (Truth 6), so the `checkpoint:human-action` gate (Task 2) was already resolved at execution time — no outstanding human action.

## Gaps Summary

No gaps found. All 6 truths VERIFIED, both artifacts pass (SUMMARY.md: 125 lines ≥ 40; `.gitignore`: `.npm-cache/` present), key link WIRED (publish→install registry round-trip confirmed), no blocker anti-patterns, no human verification items outstanding.

**Phase 31 status: PASSED.** REL-02 is satisfied: `@dsh-gsd/bundle@2.2.0` is published to the npm registry, the `prepublishOnly` test gate is green, and the package is installable via `npm install` in a fresh temp dir with the main export resolving.
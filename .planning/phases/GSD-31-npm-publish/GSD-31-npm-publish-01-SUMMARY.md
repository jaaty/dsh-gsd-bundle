---
phase: 31-npm-publish
plan: 01
subsystem: ops/integration (npm publish)
tags: [npm, publish, release, ops]
requires:
  - "package.json (publish-ready v2.2.0, publishConfig.access public, prepublishOnly gate)"
  - "~/.npmrc (auth token for jamie.atyeo, never committed — D-09)"
provides:
  - "@dsh-gsd/bundle@2.2.0 published to the public npm registry"
  - "Verified installability via npm install in a fresh temp dir"
affects:
  - "npm registry: @dsh-gsd/bundle now has version 2.2.0 live"
tech-stack: [npm CLI 11.14.0, node v24.15.0, curl, node --test]
key-files:
  created:
    - ".planning/phases/GSD-31-npm-publish/GSD-31-npm-publish-01-SUMMARY.md"
  modified:
    - ".gitignore"
decisions:
  - "D-01: alternate --cache .npm-cache on every npm command (default ~/.npm is read-only/EROFS)"
  - "D-02: prepublishOnly test gate must pass before publish (hard stop on failure)"
  - "D-04: curl used for registry checks (npm view/install EROFS on default cache)"
  - "D-05: installability verified via npm install in temp dir + import() — no dsh plugin add"
  - "D-06: v2.2.0 git tag + GitHub release out of scope (separate release task)"
  - "D-08: fail-fast with the real cause; never fake success or work around failure"
  - "D-09: auth token never committed; lives only in ~/.npmrc"
metrics:
  duration: "~15 min"
  completed: "2026-08-29"
  status: complete
actuals:
  tasks: 3
  commits: 2
  notes: "Publish already completed by a prior executor run; this run verified all gates and wrote the SUMMARY"
---

# Phase 31 Plan 01: npm-publish Summary

Published `@dsh-gsd/bundle@2.2.0` to the public npm registry and verified installability via `npm install` in a fresh temp dir — satisfying REL-02 (prepublishOnly gate passed, published as 2.2.0, installable).

## Deviation Note

The registry pre-publish gate (D-04) found that **2.2.0 was already published** when this executor run began. The RESEARCH.md (written earlier in the phase) documented the registry as `{"error":"Not found"}`, but by execution time the package was live. Investigation confirmed a **prior executor run** had already committed the `.gitignore` hygiene change (commit `aa683a9`) and run `npm publish` successfully — the published tarball's shasum (`f7f26c1c7c281908b9810d2ead6f9abcf48bb94c`) matches the `npm pack --dry-run` output exactly, it was published by `jamie.atyeo`, and it was created `2026-08-29T18:36:04.328Z` (same session).

Per D-08 (fail-fast, never fake success), this run did **not** attempt to republish (npm would reject it with "cannot publish over previously published versions" and `--force` is forbidden). Instead, the already-published state was confirmed via the post-publish registry gate, and the remaining gates (installability, no-secrets, SUMMARY) were completed. The phase goal — package published as 2.2.0 and installable — is met.

## Eight-Gate Verification Record

### Gate 1 — Org-exists (R-1 / Q-1)
- **Command:** `npm org ls dsh-gsd --cache .npm-cache`
- **Exit code:** 0
- **Key output:** `jamie.atyeo - owner`
- **Result:** PASS — the `@dsh-gsd` npm org exists and `jamie.atyeo` is owner. No human action was needed (the org existed at execution time).

### Gate 2 — Registry pre-publish (D-04)
- **Command:** `curl -s https://registry.npmjs.org/@dsh-gsd%2Fbundle`
- **Exit code:** 0
- **Key output:** Full JSON document with `"dist-tags":{"latest":"2.2.0"}` and `"versions":{"2.2.0":{...}}`
- **Result:** DEVIATION — 2.2.0 was already published (see Deviation Note above). The "not already published" pre-check could not pass because the publish had already succeeded in a prior run. This is not a failure of the phase goal; it is evidence the publish gate (Gate 5) was already satisfied.

### Gate 3 — prepublishOnly test gate (D-02)
- **Command:** `npm test --cache .npm-cache` (== `node --test test/*.test.mjs`)
- **Exit code:** 0
- **Key output:** `pass 415`, `fail 0`, `duration_ms 2775`
- **Result:** PASS — 415 tests pass, 0 fail. The prepublishOnly gate is green.

### Gate 4 — Tarball shape (D-03)
- **Command:** `npm pack --dry-run --cache .npm-cache`
- **Exit code:** 0
- **Key output:** `total files: 32`, `package size: 108.1 kB`, `shasum: f7f26c1c7c281908b9810d2ead6f9abcf48bb94c`
- **Contents:** 24 `lib/*.js` files + `cordis.patch.yml` + `README.md` + `NOTICE` + `LICENSE` + `DISTRIBUTION.md` + `CONTRIBUTING.md` + `CODE_OF_CONDUCT.md` + `CHANGELOG.md` + `package.json`
- **Exclusion check:** Zero lines matching `/planning/i` in the output — `.planning/` is excluded.
- **Result:** PASS — 32 files, correct shape, no `.planning/` leak.

### Gate 5 — Publish (REL-02)
- **Command:** `npm publish --cache .npm-cache`
- **Status:** Already completed by a prior executor run (see Deviation Note).
- **Registry confirmation:** `curl` shows `@dsh-gsd/bundle@2.2.0` published by `jamie.atyeo`, tarball at `https://registry.npmjs.org/@dsh-gsd/bundle/-/bundle-2.2.0.tgz`, `fileCount: 32`, shasum `f7f26c1c7c281908b9810d2ead6f9abcf48bb94c`.
- **Result:** SATISFIED — the package is live at 2.2.0. Republish was correctly skipped per D-08.

### Gate 6 — Post-publish registry confirm
- **Command:** `curl -s https://registry.npmjs.org/@dsh-gsd%2Fbundle`
- **Exit code:** 0
- **Key output:** `"dist-tags":{"latest":"2.2.0"}`, `"versions":{"2.2.0":{"name":"@dsh-gsd/bundle","version":"2.2.0",...}}`
- **Result:** PASS — version 2.2.0 is present on the registry with `dist-tags.latest === 2.2.0`.

### Gate 7 — Installability (D-05)
- **Commands:**
  - `mktemp -d` → `/tmp/tmp.Ne49yg0d6z`
  - `npm install @dsh-gsd/bundle@2.2.0 --cache /var/home/jatyeo/dev/dsh-gsd-bundle/.npm-cache` (in temp dir)
  - `node -e "import('@dsh-gsd/bundle').then(m => console.log('loaded:', !!m))"` (in temp dir)
- **Exit codes:** install 0, import 0
- **Key output:** `added 18 packages in 718ms`; `loaded: true | keys: true`
- **Result:** PASS — the package installs cleanly in a fresh temp dir (18 packages including the four auto-installed peerDependencies), and the main export (`./lib/persona.js`) resolves and loads without error. `dsh plugin add` was NOT run (out of scope, D-05). Temp dir cleaned up with `rm -rf`.

### Gate 8 — No-secrets guard (D-09)
- **Commands:**
  - `git status --short` → no output (clean working tree, no `.npmrc` staged)
  - `git ls-files | grep -i npmrc` → no match (no `.npmrc` tracked in the repo)
- **Result:** PASS — no `.npmrc` file is staged, committed, or tracked. The auth token lives only in `~/.npmrc` (mode 0600) and was never written into any workspace file.

## REL-02 Coverage

REL-02 requires three prongs, all satisfied:
1. **prepublishOnly test gate satisfied** — Gate 3: 415 pass, 0 fail, exit 0.
2. **published as 2.2.0** — Gates 5 + 6: `@dsh-gsd/bundle@2.2.0` live on the npm registry, `dist-tags.latest === 2.2.0`.
3. **installable** — Gate 7: `npm install @dsh-gsd/bundle@2.2.0` succeeds in a fresh temp dir and `import('@dsh-gsd/bundle')` resolves the main export.

## Out-of-scope confirmations
- **D-06:** No `v2.2.0` git tag was created (`git tag --list 'v2.2.0'` returns empty). Tag + GitHub release is a separate release task.
- **D-07:** No runtime code changes, no new dependencies, no CI publish workflow. The only repo-config change was the `.npm-cache/` gitignore entry (committed in `aa683a9` by the prior run).
- **D-05:** `dsh plugin add` consumer-path verification was NOT run (out of scope).

## Known Stubs
None. This is an ops/integration phase with no runtime code.

## Threat Flags
None. No secrets were written to any workspace file (D-09). The auth token was used implicitly by `npm publish` from `~/.npmrc` and never echoed or committed.

## Self-Check: PASSED
- `GSD-31-npm-publish-01-SUMMARY.md` exists (this file).
- `.gitignore` contains `.npm-cache/` (committed in `aa683a9`).
- Commits exist: `aa683a9` (gitignore hygiene) + this SUMMARY commit.
- `@dsh-gsd/bundle@2.2.0` confirmed live on the npm registry via curl.
- No `v2.2.0` git tag created (D-06 respected).
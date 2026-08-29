---
phase: 30-publishable-package
plan: 01
subsystem: package-metadata
tags: [npm, package.json, package-lock.json, metadata, files-whitelist, release]
requires:
  - package.json (current version 2.0.0, no metadata fields, files = [lib/*.js, cordis.patch.yml, README.md, NOTICE])
  - package-lock.json (version 2.0.0 at top level and packages[""].version)
  - README.md (links DISTRIBUTION.md, CONTRIBUTING.md, CODE_OF_CONDUCT.md, CHANGELOG.md)
provides:
  - package.json (version 2.2.0, six metadata fields, expanded files whitelist)
  - package-lock.json (version 2.2.0 in sync at both spots)
affects:
  - npm ci / prepublishOnly version-consistency gate (SHIP-01)
  - Published tarball contents (files whitelist now ships README-linked docs)
tech-stack:
  - npm (package.json manifest, package-lock.json lockfileVersion 3)
  - Node 24 toolchain (type: module, node --test runner)
key-files:
  created: []
  modified:
    - package.json
    - package-lock.json
decisions:
  - D-01 (bump package.json version to 2.2.0)
  - D-02 (sync package-lock.json top-level + root package version to 2.2.0)
  - D-04 (repository object {type: git, url: git+https://github.com/jaaty/dsh-gsd-bundle.git})
  - D-05 (homepage https://github.com/jaaty/dsh-gsd-bundle)
  - D-06 (bugs.url only, no legacy bugs.email)
  - D-07 (author "jaaty <jamie.atyeo@live.com>")
  - D-08 (engines {node: >=20})
  - D-09 (keywords list of 9 discoverability terms)
  - D-10 (files whitelist expanded to ship README-linked docs; LICENSE not listed)
metrics:
  duration: single session
  completed: 2026-08-29
  tasks: 3
  commits: 3
status: complete
---

# Phase 30 Plan 01: Publishable Package Metadata Summary

Made the npm manifest publish-ready for the public-launch milestone v2.2.0: bumped the version to 2.2.0 (manifest + lockfile), added the six missing metadata fields (repository/homepage/bugs/author/engines/keywords), and expanded the `files` whitelist to ship every README-linked doc — all without any runtime code change.

## What was built

### Task 1 — Version bump to 2.2.0 (D-01, D-02, TRACER)
- Edited `package.json` `"version"` from `2.0.0` → `2.2.0`.
- Edited `package-lock.json` in exactly two spots — top-level `"version"` (L3) and root package `packages[""].version` (L9) — both `2.0.0` → `2.2.0`.
- No other lockfile line touched: `git diff --stat` confirmed only 2 insertions/2 deletions; `lockfileVersion: 3` and all integrity/resolved fields preserved verbatim.
- Committed: `0057f01 feat(GSD-30-publishable-package-01): bump version to 2.2.0 in manifest and lockfile`.

### Task 2 — Six npm metadata fields (D-04..D-09)
- Inserted into `package.json` (after `description`, keeping the identity-group style):
  - `repository`: `{"type":"git","url":"git+https://github.com/jaaty/dsh-gsd-bundle.git"}` (object form, D-04).
  - `homepage`: `"https://github.com/jaaty/dsh-gsd-bundle"` (D-05).
  - `bugs`: `{"url":"https://github.com/jaaty/dsh-gsd-bundle/issues"}` — no legacy `bugs.email` key (D-06).
  - `author`: `"jaaty <jamie.atyeo@live.com>"` (D-07).
  - `engines`: `{"node":">=20"}` (D-08).
  - `keywords`: `["dsh","deepseek-harness","plugin","bundle","opengsd","git","ship","automation","agile"]` (D-09).
- Guard-scope invariants preserved: `dependencies` stays `{}`, no `prepare`/`build`/`prepack` script added, `scripts.test`/`prepublishOnly` unchanged, `publishConfig.access` still `public`.
- Committed: `3cc3296 feat(GSD-30-publishable-package-01): add repository, homepage, bugs, author, engines, keywords metadata`.

### Task 3 — Expanded files whitelist (D-10)
- `files` now = `["lib/*.js","cordis.patch.yml","README.md","NOTICE","DISTRIBUTION.md","CONTRIBUTING.md","CODE_OF_CONDUCT.md","CHANGELOG.md"]`.
- Added the four README-linked docs (DISTRIBUTION.md @L59; CONTRIBUTING.md / CODE_OF_CONDUCT.md / CHANGELOG.md @L226). Kept all existing entries.
- `LICENSE`, `.github`, and `.planning` are deliberately NOT listed.
- Committed: `b40ed55 feat(GSD-30-publishable-package-01): expand files whitelist to ship README-linked docs`.

## Acceptance criteria

All `<acceptance_criteria>` and `<verify>` checks pass against the actual files. Final verification run confirmed:
- Version sync: `pkg 2.2.0 / lock-top 2.2.0 / lock-root 2.2.0`.
- Metadata: all 9 assertions (repository.type/url, homepage, bugs.url, author, engines.node, empty dependencies, no build scripts, publishConfig.access public) pass.
- Files: `files-ok` — all 8 expected entries present, no LICENSE, no `.github`/`.planning`.
- JSON valid (`json-ok`) for `package.json`.
- `git diff --stat lib/ test/` is empty (no runtime change).
- Key links verified against repo root: DISTRIBUTION.md / CONTRIBUTING.md / CODE_OF_CONDUCT.md / CHANGELOG.md / README.md / NOTICE / LICENSE / cordis.patch.yml all present; `lib/*.js` glob resolves.
- Line counts: `package.json` 101 lines (≥82 min), `package-lock.json` 255 lines (≥255 min).

## Deviations

- **Pre-existing test failure surfaced, not caused by this plan.** `node --test` reports one failing test in `test/license.test.mjs` ("README no longer references gsd-core-reference.md"): the README still contains the literal `gsd-core-reference.md` (in a historical changelog bullet at README L19). This is a pre-existing broken-window present on the base commit (verified by reading `git show HEAD~4:README.md` → that README also fails the assertion), and it is **out of scope** for this plan (which is metadata-only and must not touch `lib/`/`test/` or the README). It does not indicate the metadata edits broke import resolution — the failing test reads README content, not package.json exports. Flagged for the verify/ship step; a README fix is a separate follow-up, not this plan's scope.

## TDD Gate Compliance

Not applicable — this plan is package metadata/configuration (no `test:` task, no RED→GREEN). No TDD gates required.

## Known Stubs

None. No TODO/FIXME/placeholder text introduced in `package.json` or `package-lock.json`.

## Threat Flags

- **Pre-existing broken-window (external to this plan):** `test/license.test.mjs` "gsd-core-reference" test fails on the base commit because README contains that literal string in a changelog bullet. Not introduced or fixable here; must be surfaced at ship so a README fix lands before `npm publish`.
- `files` whitelist relies on npm's auto-inclusion of `LICENSE` (MIT) and `README.md`/`package.json` in every tarball; `LICENSE` is intentionally not listed per D-10. This is documented npm behaviour.
- No new runtime dependencies introduced; `dependencies` remains `{}`; no `prepare`/`build`/`prepack` script added.

## Self-Check: PASSED

- `package.json` exists and is valid JSON (101 lines); `package-lock.json` valid and in sync (255 lines).
- All three plan commits present on branch `phase-30`:
  - `0057f01 feat(GSD-30-publishable-package-01): bump version to 2.2.0 in manifest and lockfile`
  - `3cc3296 feat(GSD-30-publishable-package-01): add repository, homepage, bugs, author, engines, keywords metadata`
  - `b40ed55 feat(GSD-30-publishable-package-01): expand files whitelist to ship README-linked docs`

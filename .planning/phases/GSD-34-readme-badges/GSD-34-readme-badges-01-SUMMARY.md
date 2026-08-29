---
phase: GSD-34-readme-badges
plan: GSD-34-readme-badges-01
subsystem: README + structural tests
tags: [readme-badges, badges, readme, structural-test, release-status, phase-34]
requires: []
provides: [REL-05, REL-02]
affects: [README.md, test/readme-badges.test.mjs, VALIDATION.md]
tech-stack: [node:test, node:assert/strict, node:fs/promises, Markdown, shields.io, GitHub Actions badges]
key-files:
  created:
    - "VALIDATION.md"
  modified:
    - "README.md"
    - "test/readme-badges.test.mjs"
decisions: [D-01, D-02, D-03, D-04, D-05, D-06, D-07]
metrics:
  duration: ~15m
  completed: 2026-08-29
status: complete
---

# Phase 34 Plan 01: Commit the corrected badge row, D-07 release-status, and extended structural test

Closed the three verification gaps for phase 34: committed the single-line three-badge
row pinned to the package.json version, added the public-launch v2.2.0 release-status
narrative, and extended the structural test to guard placement, exactly-three badges,
the version-currency gate, and the release-status reference, recording the truths in
VALIDATION.md.

## Task results

1. **Commit the corrected single-line badge row** — README lines 1–2 now carry
   `# dsh-gsd-bundle` immediately followed by a single contiguous line of the three
   clickable badges (CI whole-workflow on `main`, MIT license, npm-version statically
   pinned to `@2.2.0`). No blank line under the H1, no fourth badge. Committed as
   `3e3c4d9 docs: add single-line provenance badge row to README`.
2. **Release status → public-launch v2.2.0** — added a `### v2.2 release note — public-launch`
   subsection above the retained v2.1/v2.0 notes, naming `public-launch` v2.2.0 as the
   latest release with CHANGELOG-verifiable points (badge row, repo discoverability,
   README-linked docs shipped, SECURITY.md + templates, released as v2.2.0). The
   pre-ship-verify gate stays in v2.1 (not attributed to v2.2). Committed as
   `e41dbf9 docs(readme): add public-launch v2.2.0 release note`.
3. **Extended structural test + VALIDATION.md** — added four tests (D-05 placement,
   D-01 exactly-three/no-npm-downloads, D-03/REL-02 version-currency gate reading
   package.json, D-07 release-status), preserving `const ROOT = new URL("../",
   import.meta.url).pathname;`. Wrote VALIDATION.md listing the three truths with their
   verification commands. Committed as
   `de39980 test(readme): assert badge placement, exactly-three, version currency, release status; add VALIDATION.md`.

## Requirements addressed

- **REL-05** — exactly three badges (CI, license, npm-version) in the README.
- **REL-02** — v2.2.0 is the currently-released version; badge pin and release-status
  reference it.

## Verification outcome

- `node --test test/readme-badges.test.mjs` — 8/8 pass.
- Badge row placed on the committed state directly under the H1 with no blank line.
- npm badge pinned to `@2.2.0` matching package.json; unpinned dynamic form absent.
- Release-status notes ordered v2.2 → v2.1 → v2.0.

## TDD Gate Compliance

N/A — pure documentation + structural-test phase; the added tests were verified to
pass against the committed state (no red/refactor cycle applicable).

## Known Stubs

None.

## Threat Flags

None. No secrets, credentials, or new dependencies introduced.

## Self-Check: PASSED

- `READ_ME` badge artifacts present and committed.
- `test/readme-badges.test.mjs`, `VALIDATION.md` exist on disk and are committed.
- All three commits exist on phase-34.
- No uncommitted changes to README.md, test/readme-badges.test.mjs, or VALIDATION.md.

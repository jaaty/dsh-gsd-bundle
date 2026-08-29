# VALIDATION — Phase 34 (readme-badges)

This record captures the three user-observable truths this phase ships and the exact
verification commands used to confirm each. Commands were run against the committed
phase-branch state.

## Truth 1 — Exactly-three badge row, single contiguous line, directly under the H1

- **Badges:** CI-status, license, npm-version. No fourth (npm-downloads) badge anywhere.
- **Placement:** `# dsh-gsd-bundle` on line 1, badge row immediately on line 2 with no
  blank line between them, before the intro paragraph.

Commands observed:

```
git show HEAD:README.md | sed -n '1p'                      # -> '# dsh-gsd-bundle'
git show HEAD:README.md | sed -n '2p'                      # single badge row
git show HEAD:README.md | sed -n '1,3p'                    # no blank line line 1->2
git show HEAD:README.md | grep -c "@2.2.0?style"           # -> 1
git show HEAD:README.md | grep -c "npm/dw"                 # -> 0 (no fourth badge)
node --test test/readme-badges.test.mjs                    # all pass
```

Outcome: **confirmed** — line 2 is one contiguous line holding the three clickable
badges and no blank line separates it from the H1.

## Truth 2 — npm-version badge pinned to the currently-released package.json version

- The badge is a static mirror `img.shields.io/npm/v/@dsh-gsd/bundle@2.2.0?style=flat-square`,
  matching `package.json` `version` (`2.2.0`).
- The unpinned dynamic `img.shields.io/npm/v/@dsh-gsd/bundle?style` form is absent.
- The structural test's version-currency gate fails if the pin ever drifts from the
  package.json version.

Commands observed:

```
git show HEAD:README.md | grep -c "@2.2.0?style"                    # -> 1
git show HEAD:README.md | grep -c "img.shields.io/npm/v/@dsh-gsd/bundle?style"  # -> 0
test/readme-badges.test.mjs                         # version-currency gate passes
```

Outcome: **confirmed** — the pin equals the released package.json version and the
dynamic form is absent.

## Truth 3 — Release status marks public-launch v2.2.0 as the latest release

- `## Release status` names `public-launch` v2.2.0 as the latest release.
- A `### v2.2 release note — public-launch` subsection precedes the retained
  `### v2.1 release note` and `### v2.0 release note` subsections.

Commands observed:

```
grep -c "### v2.2 release note — public-launch" README.md   # -> 1
grep -c "public-launch" README.md                           # -> 2
grep -c "v2.2.0" README.md                                  # -> 2
grep -n "### v2.2 release note" README.md                   # -> 16
grep -n "### v2.1 release note" README.md                   # -> 26 (v2.2 precedes v2.1)
```

Outcome: **confirmed** — v2.2.0 is the latest release, with the v2.1 and v2.0 notes
retained below it.

All structural assertions are exercised by the committed test suite
(`node --test test/readme-badges.test.mjs`, and `npm test`), which passes.

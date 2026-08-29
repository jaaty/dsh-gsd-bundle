# Phase 26: repo-hygiene — Validation (Nyquist Coverage)

## Nyquist Coverage

`nyquist_validation` is enabled in `.planning/config.json` (`"nyquist_validation": true`). Every new behaviour introduced in this phase has a named automated test in `test/repo-hygiene.test.mjs` that proves it, and there is no 3-consecutive-task window lacking coverage: the phase's three plans (01 repo docs, 02 curate decision, 03 wiring) each produce outputs that are asserted by the same test file, so coverage is continuous across the whole phase.

## Decision-to-Test Map

Each locked decision D-01..D-09 in `CONTEXT.md` is proven by the named automated test in `test/repo-hygiene.test.mjs` cited below.

- **D-01 / D-02** — CHANGELOG.md exists at the repo root in Keep-a-Changelog format (Unreleased + v2.0.0 + v1.7.0 sections) — test `"CHANGELOG.md exists and is Keep-a-Changelog with Unreleased + v2.0.0 + v1.7.0 (D-01/D-02)"`.
- **D-03** — CODE_OF_CONDUCT.md is the Contributor Covenant 2.1 — test `"CODE_OF_CONDUCT.md exists and is the Contributor Covenant 2.1 (D-03)"`.
- **D-04 / D-05** — CONTRIBUTING.md is full-depth (setup, tests, PR workflow, GSD loop) and carries the no-credentials-in-`.planning/` hygiene rule — test `"CONTRIBUTING.md is full-depth: tests, PR workflow, GSD loop, no-credentials rule (D-04/D-05)"`.
- **D-06 / D-07** — the volatile `.planning/` files are untracked while the durable artefacts remain tracked (curate decision applied via `.gitignore` + `git rm --cached`) — test `"volatile .planning/ files are untracked, durable ones tracked (D-06/D-07)"`.
- **D-08** — README's `.planning/` artefacts section documents the curate decision (durable tracked, volatile gitignored) — test `"README .planning/ artefacts section documents the curate decision (D-08)"`.
- **D-09** — README links CHANGELOG.md, CONTRIBUTING.md, and CODE_OF_CONDUCT.md — test `"README links CHANGELOG.md, CONTRIBUTING.md, and CODE_OF_CONDUCT.md (D-09)"`.

## Phase-Goal Truths Backed

The phase goal (PUB-03: the repo carries a CHANGELOG, a code of conduct, and a contribution guide, and the `.planning/` keep-vs-gitignore-vs-curate decision is made, applied, and documented) is backed by the union of the six tests above: the three repo-root files exist (D-01/D-02, D-03, D-04/D-05), the README links them and documents the curate decision (D-09, D-08), and the curate decision is actually applied to git tracking state (D-06/D-07).

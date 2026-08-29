---
phase: 28-publish-research
plan: 01
subsystem: docs-repo-metadata
tags: [distribution, npm-publish, publish-readiness, docs, PUB-05]
requires: []
provides:
  - "DISTRIBUTION.md — research-backed distribution decision + triangulated evidence (web, local, npm registry)"
  - "package.json publish-readiness metadata (publishConfig.access: public + prepublishOnly)"
  - "README Install/Quickstart aligned to the npm-primary path with a link to DISTRIBUTION.md"
affects:
  - DISTRIBUTION.md
  - package.json
  - README.md
tech-stack: [markdown, node-package-json]
key-files:
  created:
    - DISTRIBUTION.md
  modified:
    - package.json
    - README.md
decisions:
  - "Primary distribution: npm publish of @dsh-gsd/bundle; secondary: clone-and-install-from-source (both supported by the same dsh plugin add → pnpm forwarding)."
  - "publishConfig.access: public added (scoped packages default to restricted; mirrors dsh-plugin-appshot)."
  - "prepublishOnly: node --test test/*.test.mjs added (= existing test command; mirrors dsh-plugin's prepublishOnly pattern). No prepare/build/prepack — plain ESM source, nothing to build."
  - "No name collision for @dsh-gsd/bundle on the npm registry (D-06 clear); D-05 fallback did not apply (clear npm-publish precedent)."
metrics:
  duration: one executor turn
  completed_date: 2026-08-29
  tasks: 3
  commits: 3
status: complete
---

# Phase 28 Plan 01: publish-research Summary

Wrote the research-backed distribution decision (npm publish primary, clone-and-install-from-source secondary) to a new root `DISTRIBUTION.md`, and aligned the repo metadata (`package.json` publish-readiness fields + README Install/Quickstart) to that path — satisfying PUB-05 with no functional tool changes (D-08).

## What was done

1. **DISTRIBUTION.md (new, 120 lines)** — the single durable home for the decision and its triangulated evidence (per D-02). Records: the decision (npm publish primary / clone secondary); Source 1 web evidence (official packaging tutorial + CLI reference + third-party marketplace guides, with URLs); Source 2 local inspection (the installed `@deepseek-ai/dsh` checkout is itself npm-published with `publishConfig.access: public`, ~60 registry-resolved deps, no third-party bundles locally); Source 3 live registry queries via `curl https://registry.npmjs.org/...` (third-party `dsh-plugin` / `dsh-plugin-appshot` / `dsh-find-plugin` / `dsh-plugin-om` / `dsh-plugin-ima-sync` all published with `dsh.bundle.patch`; peer deps `@deepseek-ai/dsh`, `dsh-tools`, `cordis` confirmed published); the D-06 no-collision finding (`@dsh-gsd/bundle` → `{"error":"Not found"}`); the D-07 EROFS-vs-curl workaround note; the build/prepare note (no prepare/build/prepack, plain ESM source, pnpm ≥10 allowBuilds does not apply); and the explicit out-of-scope / deferred list (no actual `npm publish`, no release CI workflow, no lib/test changes, no .planning/ decision revisit).
2. **package.json** — added `"publishConfig": { "access": "public" }` and a `"prepublishOnly": "node --test test/*.test.mjs"` script (the existing test command). Left `name`, `version`, `files`, `exports`, `dependencies` (still `{}`), `peerDependencies`, and `license` unchanged. No `prepare`/`build`/`prepack` added (nothing to build).
3. **README.md Install section** — rewrote to make `dsh plugin --profile <name> add @dsh-gsd/bundle` (npm registry) the primary command, moved the clone path into an "Alternative — install from source" subsection, and added the one-line `[DISTRIBUTION.md](DISTRIBUTION.md)` link near the top (D-03 key_link). Quickstart, the `gsd_*` tools table, slash-commands, How it works, `.planning/` artefacts, Contributing, and License sections are preserved.

## Acceptance criteria — all met

- `test -f DISTRIBUTION.md` ✓; `grep -qi "npm publish"` ✓; `grep -qiE "clone-and-install(-from-source)?"` ✓; `grep -qi "registry.npmjs.org"` ✓; `grep -qiE "collision|Not found|no collision"` ✓ (D-06); `grep -qiE "EROFS|curl https://registry"` ✓ (D-07); `wc -l` = 120 (≥ 60) ✓.
- `node -e` publish-readiness assertion exits 0 (publishConfig.access public, prepublishOnly = test command, cordis.patch.yml in files, .planning/ not in files, dependencies still `{}`) ✓; package.json valid JSON ✓.
- `git diff --stat lib/ test/` empty (D-08 regression guard) ✓.
- `npm test` passes: 406 tests, 0 fail (MOUNT-06 regression guard) ✓.
- `grep -qE "dsh plugin --profile <name> add @dsh-gsd/bundle" README.md` ✓; `grep -qE "\[DISTRIBUTION\.md\]\(DISTRIBUTION\.md\)" README.md` ✓ (key_link); `grep -qiE "install from source|from source|clone" README.md` ✓.

## Commits

1. `fc57344` — docs(28-01): add research-backed DISTRIBUTION.md decision doc
2. `c93439c` — chore(28-01): add publishConfig.access public + prepublishOnly to package.json
3. `c60bee5` — docs(28-01): rewrite README Install/Quickstart to npm-primary path

## Known Stubs

None. No TODO/FIXME/placeholder/skipped tests were introduced.

## Threat Flags

None. This phase is docs + repo metadata only — no network/registry calls are executed at runtime, no secrets, no code execution. The `prepublishOnly` script only runs the existing local test suite and only fires during a future `npm publish` (not run in this phase, per D-04).

## Self-Check: PASSED

- Created file `DISTRIBUTION.md` exists at repo root (verified `test -f`).
- Modified `package.json` carries `publishConfig.access: public` + `prepublishOnly` (verified by `node -e` assertion).
- Modified `README.md` links `DISTRIBUTION.md` and documents the npm-primary path (verified by `grep`).
- All three commits exist on branch `phase-28` (`fc57344`, `c93439c`, `c60bee5`).
- `git diff --stat lib/ test/` empty; `npm test` 406 pass / 0 fail.
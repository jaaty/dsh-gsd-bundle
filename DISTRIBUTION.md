# Distribution Decision

**Status:** Decided — phase 28 (`publish-research`).
**Requirement:** PUB-05 — *A research-backed distribution decision (npm publish vs clone-and-install-from-source) is documented, matching the behavior of other dsh plugins.*
**Scope:** This document is the single durable home for the decision **and** its evidence (per decision D-02 — no separate `RESEARCH.md` lives in the repo). It is placed at the repo root alongside the other root docs added in phases 25–26 (`LICENSE`, `NOTICE`, `CHANGELOG.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`) and linked from the README `## Install` section (per D-03).

## Decision

**Primary distribution path: `npm publish`** of the scoped package `@dsh-gsd/bundle`.
**Secondary, still-documented path: clone-and-install-from-source** via `dsh plugin --profile <name> add <path-to-this-bundle>`.

The same `dsh plugin add` command already supports both paths because it forwards its args verbatim to `pnpm`, and pnpm accepts an npm registry name, a local path, a `file:`/`link:` form, a git URL, or a tarball with no behavioural difference from the bundle's perspective. The two paths are therefore **not mutually exclusive** — npm publish is what makes the bare package name resolve from the registry; the clone path is the source-checkout alternative for users who prefer a local/git install.

The research was **not inconclusive**: a clear npm-publish precedent exists across both the official first-party ecosystem (`@deepseek-ai/*`) and the third-party community ecosystem (`dsh-*` plugins). The D-05 fallback (default to clone-only with no precedent found) therefore **does not apply**.

This phase makes the decision and applies it *lightly* to the repo metadata (per D-04): the new `DISTRIBUTION.md` (this document), the `package.json` publish-readiness fields (`publishConfig.access: public` + `prepublishOnly`), and the README Install/Quickstart rewrite. **No actual `npm publish` is run in this phase.**

## Evidence — Source 1: Web (dsh plugin ecosystem / distribution docs)

The official DeepSeek Harness packaging tutorial treats a bundle as *"an npm package that ships a configuration layer"* declared under the `dsh` key; a package without `dsh.bundle` still installs but activates no layer. The same tutorial installs a local checkout via `dsh plugin --profile demo add ./hello-plugin`, and the CLI reference doc shows the same command accepting a registry package name (`dsh plugin --profile <name> add @deepseek-ai/dsh-subagent-codex`) or a git spec (`add github:deepseek-harness/turtle-ui`) as equally valid — because `dsh plugin add` forwards its args verbatim to `pnpm`, which resolves any of those spec forms.

- [docs/user/develop/basic/publish.md](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/basic/publish.md) — official packaging tutorial.
- [apps/cli/reference/README.md](https://github.com/deepseek-ai/deepseek-harness/blob/master/apps/cli/reference/README.md) — CLI reference; documents that `dsh plugin add` forwards to pnpm and lists the in-box vs out-of-tree bundle resolution.
- [dshplugins.co — dsh plugins guide](https://dshplugins.co/en/dsh-plugins-guide/) — third-party guide describing a plugin marketplace built around installable npm/GitHub packages.
- [dshplugin.app — how to install a dsh plugin](https://dshplugin.app/guides/how-to-install-deepseek-harness-plugin) — third-party install guide for npm/GitHub plugins.

## Evidence — Source 2: Local inspection (installed dsh checkout)

The installed `@deepseek-ai/dsh` package at `/var/home/jatyeo/.nvm/versions/node/v24.15.0/lib/node_modules/@deepseek-ai/dsh` is itself an **npm-published** bundle. Its `package.json` declares:

- `"name": "@deepseek-ai/dsh"`, `"version": "0.1.1-rc.2"`, MIT license.
- `"publishConfig": { "access": "public" }` — the scoped-package publish-access convention this bundle now mirrors.
- `"files": ["lib/*.js", "config"]` and `"bin": { "dsh": "lib/bin.js" }`.
- ~60 dependencies, all scoped `@deepseek-ai/dsh-*` / `@deepseek-ai/cordis-*` resolved from the npm registry (e.g. `@deepseek-ai/dsh-base ^0.1.1-rc.2`, `@deepseek-ai/cordis-plugin-hmr ^1.0.16`).

The checkout's `node_modules/@deepseek-ai/` holds the full installed first-party plugin set (`dsh-agent`, `dsh-agent-loop`, `dsh-base`, `dsh-cordis-client-runner`, `dsh-tool-bash`, …). **No third-party `dsh-*` bundles are present locally** — only official `@deepseek-ai/*`. Local inspection alone therefore cannot establish third-party precedent; the live registry queries (Source 3) do.

## Evidence — Source 3: Live npm registry queries

Registry facts were gathered via `curl https://registry.npmjs.org/<url-encoded-name>` because `npm view` / `npm install` error with `EROFS` writing to the read-only `~/.npm/_cacache` under this execution sandbox (see the D-07 / EROFS note below). Third-party community dsh plugins that **are published to npm** with a `dsh.bundle.patch` configuration layer:

| Package | Published? | Version (date) | `dsh.bundle` | `publishConfig` | `prepublishOnly` / `prepack` | License |
|---|---|---|---|---|---|---|
| `dsh-plugin` | YES | 1.3.11 (2026-08-28) | `{patch: ./cordis.patch.yml}` | (none; unscoped) | `prepublishOnly: npm run verify:release`, `prepack: npm run build` | MIT |
| `dsh-plugin-appshot` | YES | 0.4.1 (2026-08-28) | `{patch: ./cordis.patch.yml}` | `{access: public, registry: https://registry.npmjs.org/}` | `prepack: node scripts/prepack.mjs` | MIT |
| `dsh-find-plugin` | YES | 0.3.7 (2026-08-19) | `{patch: ./cordis.patch.yml}` | (none; unscoped) | (none) | (not shown) |
| `dsh-plugin-om` | YES | 0.0.18 (2026-08-25) | — | — | — | — |
| `dsh-plugin-ima-sync` | YES | (listed in `npm search dsh-plugin`) | — | — | — | — |

**Peer dependencies confirmed published to the npm registry** (the closure this bundle's `peerDependencies` resolve from):

| Package | On npm? | Latest dist-tag | License |
|---|---|---|---|
| `@deepseek-ai/dsh` | YES | `0.1.1-rc.2` | MIT (installed pkg.json says MIT; an earlier registry `0.0.1-rc.1` said BSD-3-Clause — license may differ by version) |
| `@deepseek-ai/dsh-tools` | YES | latest `0.0.1-rc.1`, next `0.1.1-rc.2` | BSD-3-Clause |
| `@deepseek-ai/cordis` | YES | latest `4.0.1`, next `4.0.1-rc.4` | MIT |
| `@deepseek-ai/dsh-llm` / `@deepseek-ai/schemastery` | YES (same publisher family) | — | — |

All four peer deps are scoped `@deepseek-ai/*` packages maintained by `imccyu` / `tianyicui-deepseek` (DeepSeek) and published from the `deepseek-harness` monorepo CI. Because this phase does **not** run `npm publish`, the peer-dep availability is recorded here as evidence that an npm-publish path is viable (the closure resolves from the public registry), not as a gate.

**Conclusion of triangulation:** both the official first-party ecosystem (`@deepseek-ai/*`) and the third-party community ecosystem (`dsh-plugin`, `dsh-plugin-appshot`, `dsh-find-plugin`, …) publish dsh bundles to the npm registry with `dsh.bundle.patch` and (for scoped packages) `publishConfig.access: public`. The clone/git-install path is a fully-supported *secondary* mechanism, not the primary one.

## Name-collision check (D-06)

The chosen package name `@dsh-gsd/bundle` was checked against the live registry:

- `curl https://registry.npmjs.org/@dsh-gsd%2fbundle` → `{"error":"Not found"}` — the scoped name is **not taken**.
- `curl https://registry.npmjs.org/-/v1/search?text=%40dsh-gsd` returned only unrelated packages (`@opengsd/gsd-core`), none claiming the `@dsh-gsd` scope or the `bundle` name.

There is **no collision**, so D-06 does not trigger and the chosen name stands.

## Build / prepare note

This bundle has **no `prepare`, `build`, or `prepack` script** — it ships plain ESM `lib/*.js` as source with no transpilation step (the committed `lib/*.js` *is* the source). Consequences:

- A published npm tarball installs with **zero build step**.
- A clone-and-install-from-source checkout also needs **zero build**.
- pnpm ≥10's `allowBuilds` gate (which blocks a git-hosted package's `prepare` script until the consumer allows it) does **not apply** — there is no `prepare` script to block. A published tarball or local checkout needs no allowance either way.

The `files` field ships `lib/*.js`, `cordis.patch.yml`, `README.md`, and `NOTICE`; every `cordis.patch.yml` row references a module under `files`. `.planning/` is not in `files` and is not in `exports`, so it never enters the published tarball.

## EROFS workaround note (D-07)

Under the read-only-npm-cache sandbox used for this research, `npm view` and `npm install` fail with `EROFS` writing to `~/.npm/_cacache`. The recommended evidence-collection command is the read-only registry HTTP API:

```sh
curl https://registry.npmjs.org/<url-encoded-name>      # e.g. @dsh-gsd%2fbundle
curl 'https://registry.npmjs.org/-/v1/search?text=%40dsh-gsd'
```

`npm search` (keyword browsing) also works because it does not write to the cache. If the registry query had been unreachable (rate limit, offline, npm down), the attempt would have been recorded here and the decision would have fallen back to web + local evidence only per D-07 — the registry was reachable, so no fallback was needed.

## Decision + apply scope (D-04)

**Chosen path:** npm publish as primary; clone-and-install-from-source as a documented secondary path.

**Apply scope (this phase):**

1. `DISTRIBUTION.md` — this document (the decision + all triangulated evidence).
2. `package.json` — add `"publishConfig": { "access": "public" }` (scoped packages default to restricted without it; mirrors `dsh-plugin-appshot`) and a `"prepublishOnly": "node --test test/*.test.mjs"` script (exactly the existing `test` command; mirrors `dsh-plugin`'s `prepublishOnly: npm run verify:release` pattern). No `prepare`/`build`/`prepack` script — there is nothing to build. `name`, `version`, `files`, `exports`, `peerDependencies`, `dependencies` (must stay `{}`), and `license` are left unchanged.
3. `README.md` — rewrite the Install/Quickstart section so the **primary** command is `dsh plugin --profile <name> add @dsh-gsd/bundle` (npm registry install), with clone-and-install-from-source moved to a documented "Alternative — install from source" subsection, and a one-line link to this document.

**Explicitly OUT OF SCOPE / deferred:**

- Actually running `npm publish` of `@dsh-gsd/bundle` to the registry — a future step after this decision is made and validated.
- A GitHub Actions release/publish workflow (e.g. on tag push) — could follow phase 27's CI work.
- Publishing versioned releases to npm in lockstep with milestone release tags — downstream of an actual publish.
- Any functional changes to `lib/*` or `test/*` (D-08 — this phase is docs + repo metadata only; `git diff --stat lib/ test/` stays empty).
- The GitHub Actions test CI workflow (phase 27).
- The `.planning/` keep-vs-gitignore-vs-curate decision (phase 26 — already decided; do not revisit).

## Validation

The phase's apply is validated by lightweight checks (no new test file — this is metadata, not behaviour):

- `node -e` one-liner asserting `publishConfig.access === 'public'`, `scripts.prepublishOnly === 'node --test test/*.test.mjs'`, `files` still includes `cordis.patch.yml`, `files` does not include `.planning/`, and `dependencies` is still `{}`.
- `test -f DISTRIBUTION.md && grep -q DISTRIBUTION.md README.md` — the decision doc exists and is linked from the README.
- `git diff --stat lib/ test/` is empty — D-08 regression guard (no functional changes).
- `npm test` (= `node --test test/*.test.mjs`) passes — MOUNT-06 regression guard; the metadata edits did not break import resolution.

`npm pack --dry-run` is the strongest proof that the publish tarball is well-formed without actually publishing; it was not run in this phase to avoid any cache write, and the static `files`-field / `cordis.patch.yml` cross-check already confirms the tarball ships every patch-row-referenced module and excludes `.planning/`.
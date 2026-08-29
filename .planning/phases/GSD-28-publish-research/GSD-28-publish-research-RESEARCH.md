I have comprehensive triangulated evidence. Here is the full RESEARCH.md.

---

# RESEARCH.md — Phase 28: publish-research

**Researcher:** gsd-phase-researcher (fresh context)
**Date:** 2026-08-29
**Phase goal:** Research how other dsh plugins are distributed (npm publish vs clone-and-install-from-source) and document a research-backed distribution decision.
**Requirement:** PUB-05

This phase is research + docs + repo-metadata alignment (no functional tool changes, no actual `npm publish`). The research triangulates three evidence sources per D-01: (a) web, (b) local inspection of the installed dsh checkout, (c) live npm registry queries.

---

## Domain analysis

### The dsh plugin distribution model (how a bundle reaches a user)

A dsh **bundle** is an npm package that ships a configuration layer via `dsh.bundle.patch` pointing at a `cordis.patch.yml`. A user acquires a bundle into a **profile** through one command:

```
dsh plugin --profile <name> add <package-or-git-spec>
```

This command **forwards its args verbatim to `pnpm`** in the profile directory, then reconciles `dsh.profile.bundles` against the installed state. Because pnpm accepts any spec, the same command handles all of: an npm registry package name, a local path (`./bundle`), a `file:`/`link:` form, a git URL (`github:owner/repo`), or a tarball. [VERIFIED: apps/cli/reference/README.md lines 46, 51-54, 61, 96 — read this session]

> "`dsh plugin --profile <name> <args...>` initializes the profile when missing … then forwards `<args...>` to `pnpm` … `add`, `remove`, `why`, `update`, and every other pnpm verb work unchanged … Relative path specs (`.`, `../plugin`, and their `file:`/`link:` forms) are anchored to the invoking directory first, so `add .` from a plugin checkout installs that checkout, not the profile." [VERIFIED: apps/cli/reference/README.md:46]

> "Install external plugin bundles through `dsh plugin --profile <name> add <package-or-git-spec>`. The installed package owns its dependencies and contributes its declared `cordis.patch.yml` layer." [VERIFIED: apps/cli/reference/README.md:96]

Out-of-tree bundles resolve from the profile's pnpm-managed `node_modules`; in-box bundles (`@deepseek-ai/dsh-base`, `@deepseek-ai/dsh-web-app`, `@deepseek-ai/dsh-headless`, `@deepseek-ai/dsh-sdk-app`, `@deepseek-ai/dsh-sdk-minimal`, `@deepseek-ai/dsh-acp-app`) resolve from the dsh installation. [VERIFIED: apps/cli/reference/README.md:11]

**Implication:** "npm publish" and "clone-and-install-from-source" are **not mutually exclusive** distribution strategies for a dsh bundle — they are two pnpm specs the *same* `dsh plugin add` command already accepts. The real decision is "do we publish to the npm registry at all (so a bare package name resolves), or only keep the clone-from-source path." Confidence: HIGH.

### The bundle manifest contract (what makes a package a bundle)

The official packaging tutorial states a bundle is "an npm package that ships a configuration layer" declared under the `dsh` key, and that a package **without** `dsh.bundle` "still installs, but only as a plain dependency: `dsh plugin` prints a warning and activates no layer." [CITED: https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/basic/publish.md]

This bundle's `package.json` already declares `dsh.bundle.patch` (`package.json:58-62`) and a `cordis.patch.yml`, so it is a valid bundle under both distribution paths. Confidence: HIGH.

### Build/prepare behavior under pnpm (the one sharp edge)

pnpm ≥10 blocks a git-hosted package's `prepare` script until the consumer allows it via `pnpm-workspace.yaml` `allowBuilds`; an npm **tarball** or local checkout needs no allowance. [VERIFIED: apps/cli/reference/README.md:66]

> "Git-hosted plugins that ship sources build during install through their `prepare` script, which pnpm ≥10 blocks until the consumer allows it … Installing a built tarball or a local checkout needs no allowance." [VERIFIED: apps/cli/reference/README.md:66]

This bundle has **no `prepare`/`build`/`prepack` script** (confirmed: `grep -E "prepare|build|prepack|prepublishOnly" package.json` → empty this session) and ships plain ESM `lib/*.js` as source with no transpilation [VERIFIED: .planning/codebase/CONVENTIONS.md:7]. So a published tarball installs with no build step, and clone-and-install-from-source also needs no build (the committed `lib/*.js` *is* the source). Confidence: HIGH.

### Pitfalls
- **Scoped packages need `publishConfig.access: "public"`** to publish publicly without `--access public` on each publish; otherwise `npm publish` defaults scoped packages to restricted/paid. [ASSUMED — npm convention; to be confirmed against the real registry metadata below, which shows `dsh-plugin-appshot` carrying `publishConfig: {access: public, registry: https://registry.npmjs.org/}`]
- **A `files` field that omits a needed runtime file breaks the bundle silently** — `dsh.plugin add` resolves `dsh.bundle.patch` relative to the package root, so `cordis.patch.yml` and every `lib/*.js` referenced by patch rows must be in `files`. This bundle's `files` (`package.json:52-57`) = `lib/*.js`, `cordis.patch.yml`, `README.md`, `NOTICE`. That covers all patch-row-referenced modules. Confidence: HIGH.
- **`.planning/` must stay out of the published tarball** — already handled: `.planning/` is not in `files` and is not in `exports`. [VERIFIED: package.json:52-57; .planning/codebase/STRUCTURE.md:233,236-237]

---

## Package legitimacy

This phase proposes **no new runtime dependencies** — distribution alignment only touches repo metadata (package.json publish fields, README, a new DISTRIBUTION.md). There is nothing to vet for supply-chain legitimacy. The peerDependencies the bundle already declares are confirmed published to npm:

| Package | On npm registry? | Latest / next dist-tags | License | Source |
|---|---|---|---|---|
| `@deepseek-ai/dsh` | YES | latest `0.1.1-rc.2` | MIT (installed pkg.json says MIT; registry 0.0.1-rc.1 said BSD-3-Clause — license may differ by version) | [VERIFIED: `curl https://registry.npmjs.org/@deepseek-ai%2fdsh` this session; installed package.json read this session] |
| `@deepseek-ai/dsh-tools` | YES | latest `0.0.1-rc.1`, next `0.1.1-rc.2` | BSD-3-Clause | [VERIFIED: `curl https://registry.npmjs.org/@deepseek-ai%2fdsh-tools` this session] |
| `@deepseek-ai/cordis` | YES | latest `4.0.1`, next `4.0.1-rc.4` | MIT | [VERIFIED: `curl https://registry.npmjs.org/@deepseek-ai%2fcordis` this session] |
| `@deepseek-ai/dsh-llm` | (peer dep, not separately queried) | — | — | [ASSUMED — same publisher family; planner need not block on it since no publish is run this phase] |
| `@deepseek-ai/schemastery` | (peer dep, not separately queried) | — | — | [ASSUMED] |

All four peer deps are scoped `@deepseek-ai/*` packages maintained by `imccyu` / `tianyicui-deepseek` (DeepSeek) and published from the `deepseek-harness` monorepo CI. [VERIFIED: registry maintainer fields read this session] Because this phase does **not** run `npm publish`, the peer-dep availability only matters for *future* publish/run; it is recorded here as evidence that an npm-publish path is viable (the closure resolves from the public registry), not as a gate.

---

## Risks and Open Questions

### Risks
- **R-01 (LOW): npm registry query could fail at execution time.** `npm view` failed this session with `EROFS` on the read-only npm cache dir (`/home/jatyeo/.npm/_cacache`), but the **registry HTTP API via `curl` worked** and returned authoritative JSON. Per D-07, the executor should prefer `curl https://registry.npmjs.org/<scoped-url-encoded>` over `npm view` to avoid the cache write, and record any failure in DISTRIBUTION.md. The research here already collected registry evidence via curl, so the decision is not blocked by a registry outage. [VERIFIED: this session — `npm view @deepseek-ai/dsh` errored EROFS; `curl https://registry.npmjs.org/@deepseek-ai%2fdsh` succeeded]
- **R-02 (LOW): scoped-name collision.** `@dsh-gsd/bundle` returned `{"error":"Not found"}` from the registry, and the `@dsh-gsd` scope search returned only unrelated packages (`@opengsd/gsd-core`). No collision → D-06 does not trigger. [VERIFIED: `curl https://registry.npmjs.org/@dsh-gsd%2fbundle` → `{"error":"Not found"}`; `curl https://registry.npmjs.org/-/v1/search?text=%40dsh-gsd` this session]
- **R-03 (NONE): build step mismatch.** No `prepare`/`build` script, plain ESM source committed as `lib/*.js`. Both tarball and source install with zero build. [VERIFIED this session]
- **R-04 (LOW): over-applying the decision.** D-04 limits the apply to README Install/Quickstart + package.json publish-readiness fields (name scope, files, prepublishOnly if npm chosen). The executor must NOT add a publish/release CI workflow (deferred), NOT run `npm publish`, and NOT touch `lib/*` or tests (D-08).

### Open Questions
- **OQ-01 (RESOLVED): Do other dsh plugins publish to npm, or only clone-from-source?** RESOLVED — third-party community plugins **are** npm-published. See "Local + registry evidence" below. The ecosystem precedent is npm publish, with clone/git as supported alternatives. Not inconclusive → D-05 fallback does not trigger.
- **OQ-02 (RESOLVED): Is `@dsh-gsd/bundle` taken on the registry?** RESOLVED — Not found, no collision. D-06 does not trigger.
- **OQ-03 (RESOLVED): Which evidence-collection command survives the read-only npm cache?** RESOLVED — use `curl https://registry.npmjs.org/<url-encoded-name>` (and `npm search` for keyword browsing); avoid `npm view`/`npm install` which write to `~/.npm/_cacache`. Per D-07, record the attempt if registry is unreachable.
- **OQ-04 (RESOLVED): Does the chosen path require a build/prepare step that pnpm ≥10 would block?** RESOLVED — no. The bundle has no `prepare` script and ships plain ESM source. [VERIFIED: package.json grep this session; .planning/codebase/CONVENTIONS.md:7]

No open questions remain blocking planning.

---

## Triangulated evidence (the basis for the decision)

### Source 1 — Web (dsh plugin ecosystem / distribution docs)
- Official packaging tutorial treats a bundle as "an npm package that ships a configuration layer" and installs it via `dsh plugin --profile demo add ./hello-plugin` (local checkout) — but the same tutorial's reference doc shows `dsh plugin --profile <name> add @deepseek-ai/dsh-subagent-codex` (registry package) and `add github:deepseek-harness/turtle-ui` (git spec) as equally valid. [CITED: https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/basic/publish.md] [CITED: https://github.com/deepseek-ai/deepseek-harness/blob/master/apps/cli/reference/README.md]
- Third-party guides describe a plugin marketplace (dshplugins.co, dshplugin.app) built around installable npm/GitHub packages. [CITED: https://dshplugins.co/en/dsh-plugins-guide/] [CITED: https://dshplugin.app/guides/how-to-install-deepseek-harness-plugin]

### Source 2 — Local inspection (installed dsh checkout)
Checkout root: `/var/home/jatyeo/.nvm/versions/node/v24.15.0/lib/node_modules/@deepseek-ai/dsh`. [VERIFIED: `ls` this session]
- The installed `@deepseek-ai/dsh` package.json (`package.json:1-3, 16-18, 22-25`) declares: `"name": "@deepseek-ai/dsh"`, `"version": "0.1.1-rc.2"`, `"publishConfig": { "access": "public" }`, `"files": ["lib/*.js", "config"]`, `"bin": { "dsh": "lib/bin.js" }`, MIT license — i.e. it is itself an **npm-published** bundle with `publishConfig.access: public`. [VERIFIED: read this session]
- Its dependencies are ~60 scoped `@deepseek-ai/dsh-*` and `@deepseek-ai/cordis-*` packages (e.g. `@deepseek-ai/dsh-base ^0.1.1-rc.2`, `@deepseek-ai/cordis-plugin-hmr ^1.0.16`), all resolved from the npm registry. [VERIFIED: installed package.json `dependencies` read this session] The checkout's `node_modules/@deepseek-ai/` holds the full installed plugin set (dsh-agent, dsh-agent-loop, dsh-base, dsh-cordis-client-runner, dsh-tool-bash, …). [VERIFIED: `ls` this session] These are official first-party bundles, all npm-published.
- **No `dsh-*` *third-party* bundles are present in the checkout's node_modules** — only official `@deepseek-ai/*`. So local inspection alone cannot establish third-party precedent; the registry query (source 3) does. [VERIFIED: `ls .../node_modules/@deepseek-ai/` this session]

### Source 3 — Live npm registry queries (third-party precedent)
Registry queries via `curl https://registry.npmjs.org/<name>` (the `npm view` CLI failed with EROFS on the read-only cache — see R-01/D-07). Third-party community dsh plugins that **are published to npm** with `dsh.bundle.patch`:

| Package | Published? | Version | `dsh.bundle` | `publishConfig` | `prepublishOnly`/`prepack` | License | Source |
|---|---|---|---|---|---|---|---|
| `dsh-plugin` | YES | 1.3.11 (2026-08-28) | `{patch: ./cordis.patch.yml}` | (none; unscoped) | `prepublishOnly: npm run verify:release`, `prepack: npm run build` | MIT | [VERIFIED: registry JSON read this session] |
| `dsh-plugin-appshot` | YES | 0.4.1 (2026-08-28) | `{patch: ./cordis.patch.yml}` | `{access: public, registry: https://registry.npmjs.org/}` | `prepack: node scripts/prepack.mjs` | MIT | [VERIFIED: registry JSON read this session] |
| `dsh-find-plugin` | YES | 0.3.7 (2026-08-19) | `{patch: ./cordis.patch.yml}` | (none; unscoped) | (none) | (not shown) | [VERIFIED: registry JSON read this session] |
| `dsh-plugin-om` | YES | 0.0.18 (2026-08-25) | — | — | — | — | [VERIFIED: `npm search dsh-plugin` this session] |
| `dsh-plugin-ima-sync` | YES | (listed in search) | — | — | — | — | [VERIFIED: `npm search dsh-plugin` this session] |

**Conclusion of triangulation:** Both the official first-party ecosystem (`@deepseek-ai/*`) and the third-party community ecosystem (`dsh-plugin`, `dsh-plugin-appshot`, `dsh-find-plugin`, …) publish dsh bundles to the npm registry, with `dsh.bundle.patch` and (for scoped packages) `publishConfig.access: public`. The clone/git-install path is a fully-supported *secondary* mechanism, not the primary one. The research is **not inconclusive** — there is clear npm-publish precedent — so the D-05 fallback does not apply.

### Recommended decision (to be written into DISTRIBUTION.md by the executor)
**Primary distribution: npm publish** (`@dsh-gsd/bundle`), matching the observed ecosystem behavior (official `@deepseek-ai/*` and third-party `dsh-*` plugins both publish). **Secondary, still-documented path: clone-and-install-from-source** via `dsh plugin --profile <name> add <path>`, which the same `dsh plugin add` command already supports because it forwards to pnpm. No name collision (D-06 clear). No build/prepare gate (R-03 clear).

Light-apply scope (D-04), all within repo metadata:
1. `package.json` — add `"publishConfig": { "access": "public" }` (scoped package; matches `dsh-plugin-appshot`'s `publishConfig`). Add `"prepublishOnly": "node --test test/*.test.mjs"` (= the existing `test` script, matching `dsh-plugin`'s `prepublishOnly: npm run verify:release` pattern) per Claude's Discretion. Keep `files`, `name`, `version`, `peerDependencies`, `license` as-is (already publish-shaped).
2. `README.md` Install/Quickstart — rewrite to show the npm path as primary (`dsh plugin --profile <name> add @dsh-gsd/bundle`) and the clone path as an alternative, plus a one-line link to `DISTRIBUTION.md`.
3. New `DISTRIBUTION.md` at repo root — record the decision, the three-source evidence (web + local + registry, with the verbatim registry query results and the EROFS workaround note per D-07), the no-collision finding, and the deferred "actually run npm publish" item.

---

## Architectural Responsibility Map

This phase touches no runtime code (D-08), so the capability map is trivial — but the planner must keep each change in the right tier to avoid scope creep:

| Capability | Tier | Owner file | Notes |
|---|---|---|---|
| Research evidence + decision document | docs (repo root) | `DISTRIBUTION.md` (new) | Follows the phase 25/26 root-doc pattern (LICENSE, NOTICE, CHANGELOG.md, CONTRIBUTING.md, CODE_OF_CONDUCT.md). Linked from README. |
| Package publish-readiness metadata | data (package manifest) | `package.json` | `publishConfig`, `prepublishOnly` only. Do NOT touch `exports`, `main`, `files` content, `peerDependencies`, `dependencies`. |
| Install/Quickstart user instructions | presentation (README) | `README.md` Install + Quickstart sections (lines 46-65) | Align to chosen path; keep the existing `gsd_*` tools table and "How it works" sections untouched. |
| Actual `npm publish` | integration (registry) | OUT OF SCOPE (deferred) | Do not run it. |
| CI/release workflow | integration (CI) | OUT OF SCOPE (phase 27 + deferred) | Do not add a publish workflow. |
| `.planning/` keep/gitignore decision | data | OUT OF SCOPE (phase 26) | Already decided; do not revisit. |

No security-sensitive capability lands in the wrong tier: this phase writes docs and manifest fields only; it does not introduce network/registry calls, secrets, or code execution. The `prepublishOnly` script only runs the local test suite — it executes during a future publish, not in this phase, and the executor must NOT run it as part of phase 28 (running it would be fine but is unnecessary and outside D-04's apply scope).

---

## Validation Architecture

This phase is docs + manifest metadata, so "automated checks" are lightweight, but they still prove each behaviour and feed a coverage/Nyquist-style gate:

| Behaviour to prove | Automated check | How to run |
|---|---|---|
| `package.json` is valid JSON and the publish fields are correct | `node -e "const p=require('./package.json'); assert(p.publishConfig?.access==='public'); assert(p.scripts.prepublishOnly); assert(p.files.includes('cordis.patch.yml')); assert(!p.files.includes('.planning/'))"` | shell one-liner (no new test file needed — this is metadata, not behaviour) |
| The `files` field still ships everything `cordis.patch.yml` references | `npm pack --dry-run` lists `lib/*.js`, `cordis.patch.yml`, `README.md`, `NOTICE` and excludes `.planning/` | `npm pack --dry-run 2>&1` (does NOT write to the read-only npm cache for `--dry-run`; if it does, fall back to parsing `files` + the patch rows). **Do not run a real `npm pack`/`npm publish`.** |
| `DISTRIBUTION.md` exists at repo root and links from README | grep: `test -f DISTRIBUTION.md && grep -q DISTRIBUTION.md README.md` | shell |
| README Install section mentions the chosen primary path | grep the Install section for the chosen command | shell |
| No functional tool changes (D-08 regression guard) | `git diff --stat lib/ test/` is empty after the phase | `git diff --stat` |
| Existing test suite still passes (no metadata change broke import resolution) | `npm test` (= `node --test test/*.test.mjs`) | `npm test` — already the project's test command [VERIFIED: package.json:8] |

Because phase 28 must not break the green test suite (MOUNT-06 still must hold), the executor should run `npm test` after the metadata edits as the regression guard, even though no `lib/*` files change. The `npm pack --dry-run` check is the strongest proof that the publish tarball is well-formed without actually publishing; if `--dry-run` still writes to the cache (it should not), the executor records that in DISTRIBUTION.md per D-07 and falls back to a static `files`/patch-row cross-check.

---

## Project Constraints (from project conventions)

From `.planning/codebase/CONVENTIONS.md` and `STRUCTURE.md` (read this session):
- **Plain ESM, no build step** — `"type": "module"` (`package.json:5`), all `lib/*.js` is source, no transpilation [VERIFIED: CONVENTIONS.md:7]. → A `prepublishOnly` that runs `npm test` is appropriate; a `prepack`/`build` script is **not** (there is nothing to build). Do not add one.
- **Zero runtime dependencies** — `"dependencies": {}` (`package.json:54`) [VERIFIED: CONVENTIONS.md:8]. → The publish tarball carries no dependency closure to worry about; only peerDependencies, which are external. Keep `dependencies` empty.
- **`files` is the authoritative ship list** — `package.json:52-57` ships `lib/*.js`, `cordis.patch.yml`, `README.md`, `NOTICE`; `.planning/` is not shipped [VERIFIED: STRUCTURE.md:233,236-237]. → Do not change `files` content unless the decision requires it (it does not).
- **Subpath exports are the consumer contract** — every `@dsh-gsd/bundle/<name>` is an `exports` entry + a `cordis.patch.yml` row [VERIFIED: STRUCTURE.md:70,170; CONVENTIONS.md:120]. → Publishing must not drop these; `files: lib/*.js` already covers all of them.
- **Test command is `node --test test/*.test.mjs`** (`package.json:8`) [VERIFIED: STRUCTURE.md:114]. → `prepublishOnly` should call exactly this (or `"npm test"`), not a different command.
- **Root-doc pattern** — LICENSE, NOTICE (phase 25), CHANGELOG.md, CONTRIBUTING.md, CODE_OF_CONDUCT.md (phase 26) all live at repo root and are linked from README. → `DISTRIBUTION.md` follows the same placement and README-link pattern.
- **Git remote** — `origin → https://github.com/jaaty/dsh-gsd-bundle.git` [VERIFIED: `git remote -v` this session]. → A future publish/release workflow (deferred) would tag against this remote; not in scope here.

### Constraint on this researcher's environment (not a project constraint)
This subagent runs under a workspace-write file policy with approval prompts disabled; it could not widen scope. All registry queries were therefore done via `curl` to `https://registry.npmjs.org/...` (read-only HTTP, no cache writes) rather than `npm view`/`npm install`, which EROFS-failed on the read-only `~/.npm/_cacache`. The executor has the same constraint unless escalated; per D-07, `curl` to the registry API is the recommended evidence-collection method and the research above already used it successfully. [VERIFIED: this session — `npm view` errored EROFS, `curl` to registry succeeded]

---

## Summary for the planner

- **Decision is research-backed, not inconclusive:** official `@deepseek-ai/*` and third-party `dsh-*` plugins both publish to npm. Recommend **npm publish as primary**, **clone-and-install-from-source as documented secondary**. D-05 fallback does not trigger. D-06 name-collision check is clear.
- **Apply scope (D-04):** (1) new `DISTRIBUTION.md` at repo root with full evidence, (2) `package.json` gets `publishConfig.access:"public"` + `prepublishOnly:"node --test test/*.test.mjs"`, (3) README Install/Quickstart rewritten to the chosen path with a link to `DISTRIBUTION.md`. No `npm publish` run. No `lib/*`/test changes. No CI workflow.
- **Evidence commands that work under this sandbox:** `curl https://registry.npmjs.org/<url-encoded-name>` for registry facts; `grep`/`read` for local package.json + README; `npm pack --dry-run` for tarball shape (fall back to static `files`/patch cross-check if it touches the cache). Avoid `npm view`/`npm install` (EROFS).
- **Validation gate:** `npm test` (regression) + `npm pack --dry-run`/static `files` check (tarball shape) + `test -f DISTRIBUTION.md && grep DISTRIBUTION.md README.md` + `git diff --stat lib/ test/` empty.
- **All Open Questions RESOLVED.** Planning may proceed.
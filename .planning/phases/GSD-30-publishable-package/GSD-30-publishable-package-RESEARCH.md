I have all the verified facts I need. Here is the RESEARCH.md.

# Phase 30 `publishable-package` — Research

Research for making `@dsh-gsd/bundle` publish-ready for the `public-launch` milestone v2.2.0: bump the version, add npm metadata fields, and expand `files` to ship README-linked docs. This phase touches manifest metadata and docs **only** — no `lib/` or `test/` changes, no actual publish.

---

## Domain analysis

Confidence levels: **high** (verified this session against the real files + npm docs), **medium** (ecosystem convention, cross-checked), **low** (training recall).

### 1. `package.json` version bump — [VERIFIED: package.json L3, "version": "2.0.0"]
- Current version is `2.0.0`; `package-lock.json` also declares `"version": "2.0.0"` at **two** locations — the top-level `"version"` (L3) and the root `packages[""].version` (L9). Both must move to `2.2.0` for `npm ci` + `prepublishOnly` to work cleanly. **Confidence: high** (read verbatim this session).
- npm does **not** auto-sync a manually-edited `version` into the lockfile — the mismatch between `package.json` and `package-lock.json` versions is a classic cause of `npm ci` failing with "EBADENGINE"/lockfile-vs-manifest drift or `npm ci` reporting the package needs "reinstall" when the lockfile root version no longer matches the manifest. Fix both by hand or run `npm install --package-lock-only`. [ASSUMED], [CITED: https://docs.npmjs.com/cli/v11/commands/npm-ci]. **Recommendation:** edit both lockfile spots directly (deterministic, no cache write, avoids the EROFS npm-cache issue documented in `DISTRIBUTION.md`).

**Confidence: high.**

### 2. `package.json` metadata fields — [VERIFIED: package.json L1-75; no repository/homepage/bugs/keywords/engines/author present today]
- None of the six target fields (`repository`, `homepage`, `bugs`, `keywords`, `engines`, `author`) currently exist — confirmed by reading the whole manifest this session. No `engines` field anywhere. [VERIFIED: package.json L1-75]
- `repository` object form `{"type":"git","url":"git+https://github.com/jaaty/dsh-gsd-bundle.git"}` is the npm-documented canonical shape (accepts string shorthand too, but object form is the documented full form and matches D-04). [CITED: https://docs.npmjs.com/cli/v11/configuring-npm/package-json#repository]
- `bugs.url` is the documented form; the separate `bugs.email` is deprecated/legacy and correctly omitted per D-06. [CITED: https://docs.npmjs.com/cli/v11/configuring-npm/package-json#bugs]
- `homepage` is the documented field for the project homepage. [CITED: https://docs.npmjs.com/cli/v11/configuring-npm/package-json#homepage]
- `keywords` (array of strings) and `author` (either string `"name <email>"` or object) are documented; the string form `"jaaty <jamie.atyeo@live.com>"` is valid and matches D-07. [CITED: https://docs.npmjs.com/cli/v11/configuring-npm/package-json]
- `engines` object with `{"node": ">=20"}` matches D-08; the local toolchain is Node v24.15.0 [VERIFIED: `node --version` this session], `package.json` `"type": "module"`, and the suite runs on the built-in node test runner (`node --test test/*.test.mjs`), which requires Node 18+. Floor of `>=20` is safely above that. [VERIFIED: package.json L8-9, L5]

**Confidence: high.**

### 3. `files` whitelist — [VERIFIED: package.json L53-58, README L59/L226]
- Current `files` = `["lib/*.js", "cordis.patch.yml", "README.md", "NOTICE"]` (L53-58).
- README links exactly four repo root docs: `DISTRIBUTION.md` (L59), `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `CHANGELOG.md` (L226). All four are absent from `files` today and must be added per D-10. [VERIFIED: grep + read README this session]
- `LICENSE` is **auto-included** by npm whenever a `LICENSE`/`LICENCE` file exists in the package dir, so it must **not** be listed in `files` (D-10 matches npm's documented behaviour). The LICENSE file is present and MIT. [VERIFIED: LICENSE present, head shows "MIT License"; CITED: https://docs.npmjs.com/cli/v11/configuring-npm/package-json#files]
- `files` supports glob patterns like `lib/*.js` and exact filenames; filenames without globs match basenames. Adding the doc names as bare filenames is correct. [CITED: https://docs.npmjs.com/cli/v11/configuring-npm/package-json#files]
- `README.md`, `LICENSE`, and `package.json` are always included in a tarball regardless of `files`; listing them is harmless but `README.md` is already listed and `LICENSE` is intentionally omitted. [CITED: npm `files` docs]

**Confidence: high.**

### 4. CHANGELOG `[2.2.0]` entry — [VERIFIED: CHANGELOG.md L1-55]
- File already declares the Keep-a-Changelog format and Semantic Versioning (L5-6). The most recent release entry is `[2.1.0]` (L10), and there is an empty `[Unreleased]` block (L8). A `[2.2.0]` entry must go between `[Unreleased]` and `[2.1.0]` (newest at top). D-03 confirms the bump goes to the CHANGELOG. Existing entries use `### Added` subsections with bullet markers (`- **phase-name** (PR #N): ...`). The `[2.1.0]`/`[2.0.0]` structure is the model for the new entry's wording (Claude's Discretion). [VERIFIED: CHANGELOG.md read verbatim this session]
- **Pitfall:** this phase is phase 30 but CHANGELOG entries reference PR numbers. The entry body is executor-discretion, so it can either be written ahead with the expected PR number or without one; nothing in the phase requires a PR number. Keep the entry consistent with existing style (bold milestone + phase bullets). [ASSUMED]

**Confidence: high.**

### 5. Key ordering / JSON validity
- Object key ordering is cosmetic; D-04 (Claude's Discretion) leaves ordering/grouping to the executor. Recommend keeping the existing grouping style (name/version/description/type/main/scripts first, then exports, files, dsh, deps, peerDeps, license, publishConfig) and inserting the new metadata fields near the other identity fields. JSON must stay valid (a trailing-comma or unescaped issue would break `npm test`'s import resolution and CI). Validate with a parse check. [VERIFIED: package.json L1-75; CITED: JSON spec]

**Confidence: high.**

### Known pitfalls (aggregate)
- **Lockfile version desync** (section 1) — the #1 failure mode; fix both lockfile locations.
- **Forgetting LICENSE is auto-included** → could over-ship (harmless) or someone "helpfully" adds it and deviates from D-10. Do not list LICENSE.
- **No `prepare`/`build`/`prepack` script** — `DISTRIBUTION.md` L74-78 confirms the bundle ships plain ESM source with zero build step and that pnpm ≥10 `allowBuilds` does not apply. Add **no** build/prepare script in this phase.
- **`dependencies` must stay `{}`** — `DISTRIBUTION.md` L100 notes this as unchanged; phase 30 must not introduce runtime deps. The `repositories`/`author` fields are metadata only.
- **Not setting `bugs.email`** (deprecated) — only `bugs.url` per D-06.

---

## Package legitimacy

This phase **introduces no new runtime dependencies** — it edits existing metadata (`version`, `files`) and adds informational string/array fields (`repository`, `homepage`, `bugs`, `keywords`, `engines`, `author`). No `dependencies`, `peerDependencies`, `devDependencies`, or scripts are added or removed.

Therefore there are **no new packages to legitimise**. For completeness, the existing peer-dependency closure (`@deepseek-ai/dsh-tools 0.1.1-rc.2`, `@deepseek-ai/schemastery 3.18.1`, `@deepseek-ai/cordis 4.0.1`, `@deepseek-ai/dsh-llm 0.1.1-rc.2`) is already recorded as published-to-npm in `DISTRIBUTION.md` L50-61 with registry-query evidence from the `publish-research` phase; this phase does not touch them. [VERIFIED: package.json L64-70; CITED-in-repo: DISTRIBUTION.md]

The only "package-like" claim this phase relies on is **npm's tarball-inclusion behaviour** (LICENSE always shipped), which is documented behaviour — see Domain section 3. [CITED: npm `files` docs]

No external dependency proposal → no registry lookups needed for this phase.

---

## Risks and Open Questions

### Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| `package.json` ↔ `package-lock.json` version drift breaks `npm ci` / `prepublishOnly` (SHIP-01 gate) | Medium | High | Edit BOTH lockfile `version` spots (top-level L3 + root package L9) to `2.2.0`; validate with a parse+compare node one-liner |
| `files` whitelist misses a README-linked doc → published tarball has a broken doc link | Low | Medium | Enumerate README `.md` link targets (4 docs found), cross-check against `files` additions; a validation check asserts each target is present-in-tarball-or-auto-included |
| CHANGELOG entry placed in wrong position / malformed Keep-a-Changelog | Low | Low | Insert `[2.2.0]` between `[Unreleased]` and `[2.1.0]`; mirror existing `### Added` bullet structure |
| JSON syntax bug from hand-editing | Low | High | Validate with `JSON.parse` one-liner over all edited JSON files |
| Someone adds `prepare`/build script or touches `dependencies` | Low (scope creep) | Medium | Explicitly guard: no build/prepare/prepack; `dependencies` stays `{}`; `git diff --stat lib/ test/` empty |
| EROFS npm-cache sandbox blocks `npm install`/`npm pack` | Medium (environmental) | Low (validation only) | Prefer read-only validation: `node -e` parse checks; `npm pack --dry-run` (reads, may write cache — use only if cache writable) falling back to static `files` cross-check as documented in DISTRIBUTION.md L82-91 |

### Open Questions

All CONTEXT decisions (D-01..D-10) are locked and unambiguous; this phase has **no unresolved planning questions**. The two executor-discretion items (key ordering; CHANGELOG entry wording) are delegated, not blocking.

- **OQ-01 (RESOLVED):** Should the `[2.2.0]` CHANGELOG entry include a PR number in its bullets? → Not required by any requirement; entry wording is executor discretion (D-04/D-03). Executor may include the expected PR number or omit it. Resolved by CONTEXT "Claude's Discretion" + CHANGELOG structure.
- **OQ-02 (RESOLVED):** Is a `npm pack --dry-run` verification feasible under the EROFS sandbox? → `npm pack --dry-run` only writes to the cache during install, but `pack` itself writes a temporary tarball; if the cache/write is blocked, fall back to a static cross-check (every README-linked doc present in `files` OR auto-included; every `cordis.patch.yml` row module under `lib/*.js`). Both are sufficient to prove REL-01. Resolved by DISTRIBUTION.md D-07 pattern.

No Open Questions remain open.

---

## Architectural Responsibility Map

This phase is **pure repository/package metadata** — it has no application runtime, no plugin code, no capability services, and no behavioural tiering. The responsibilities map onto the GSD artefact layers as configuration/metadata, not the domain/presentation/data/integration tiers used for runtime code:

| Capability | Tier assignment | Rationale |
|---|---|---|
| Version bump (package.json + lockfile) | **Data** (manifest/serialisation) | Plain JSON metadata; correctness = schema/consistency, no runtime behaviour |
| `repository`/`homepage`/`bugs` — canonical URLs | **Integration** (public-facing identity) | Describes where the package lives upstream (git remote, issue tracker, website) |
| `keywords` | **Presentation** (discoverability) | Search/registry surfacing metadata |
| `engines` | **Data + Integration** | Declares a runtime compatibility contract (Node floor) without shipping behaviour |
| `author` | **Data** | Identity metadata |
| `files` whitelist | **Data** | Determines the published tarball contents — the one shipping-critical gate |
| CHANGELOG `[2.2.0]` | **Presentation** (human docs) | Release documentation |

No security-sensitive capability exists in this phase. **No tiering blocker.** The nearest-to-sensitive item is `files` correctness (a misconfigured whitelist could omit a doc or accidentally ship something — but `.planning/` is already excluded and nothing sensitive is under a shipped glob). `files` lives in the manifest layer, which is the correct home; there is no lower-tier placement to worry about.

---

## Validation Architecture

Automated checks to prove REL-01 ("package.json publish-ready for v2.2.0 ... files ships every README-linked doc"). The phase's own CONTEXT (D-01..D-10) is the acceptance spec. Recommended checks (node one-liners run against the actual files; no build, no `npm install`):

1. **Version sync (covers D-01, D-02)** — a single `node -e 'parse package.json + package-lock.json; assert pkg.version==="2.2.0"; assert lock.version==="2.2.0"; assert lock.packages[""].version==="2.2.0"'`. Proves the manifest and both lockfile spots agree, so `npm ci`/`prepublishOnly` (SHIP-01) stay green.
2. **Metadata present (covers D-04..D-09)** — a `node -e` check asserting `repository.type==="git"`, `repository.url` contains `git+https://github.com/jaaty/dsh-gsd-bundle.git`, `homepage` equals `https://github.com/jaaty/dsh-gsd-bundle`, `bugs.url` equals `https://github.com/jaaty/dsh-gsd-bundle/issues`, `author==="jaaty <jamie.atyeo@live.com>"`, `engines.node===">=20"`, and `keywords` is an array containing at least the nine listed keywords (or the exact D-09 set).
3. **JSON validity + no-scope-creep guard** — `JSON.parse` of `package.json` and `package-lock.json`; assert `dependencies` is still `{}` and there is **no** `prepare`/`build`/`prepack` script; `git diff --stat lib/ test/` is empty (no functional changes — mirrors DISTRIBUTION.md D-08 regression guard).
4. **files covers README-linked docs (covers D-10, REL-01)** — assert `files` contains `DISTRIBUTION.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `CHANGELOG.md`, and retains `lib/*.js`, `cordis.patch.yml`, `README.md`, `NOTICE`; assert `files` does **not** list `LICENSE` (auto-included), `README.md`, `cordis.patch.yml` still present is already covered.
5. **README-link closure check (REL-01 "every doc the README links to")** — grep README for `](X.md)` targets (DISTRIBUTION, CONTRIBUTING, CODE_OF_CONDUCT, CHANGELOG verified present this session) and assert each either is in `files` or is `LICENSE` (or `package.json`/`README.md`, auto-included).
6. **Tarball cross-check (if cache writable)** — `npm pack --dry-run` lists final tarball contents; confirm each README-linked doc + NOTICE + cordis.patch.yml + lib modules appear and `.planning/` does not. If EROFS blocks it, fall back to the static `files` cross-check (OQ-02).
7. **Regression (MOUNT-06, SHIP-01 prep)** — `npm test` (`node --test test/*.test.mjs`) still passes, and `prepublishOnly` is unchanged (still `node --test test/*.test.mjs`) — the metadata edits must not break import resolution.

These checks map every locked D-NN decision to an executable assertion, giving the later Nyquist/coverage gate a concrete oracle.

---

## Project Constraints (from PROJECT.md, CONTEXT.md, DISTRIBUTION.md)

Gathered from the planning context and verified in-repo this session:

- **Publish path is decided:** npm publish is the primary distribution path; clone-and-install-from-source is the documented secondary. This phase prepares the manifest; actual `npm publish` is **deferred to phase 31**. [CITED-in-repo: DISTRIBUTION.md L7-16, L95-101]
- **No `prepare`/`build`/`prepack` script** — ships plain ESM source with zero build step; pnpm `allowBuilds` does not apply. Do not add one. [VERIFIED: package.json L7-10; CITED-in-repo: DISTRIBUTION.md L74-80]
- **`dependencies` must stay `{}`** — the bundle has no runtime deps; leaving them empty is a stated invariant. [VERIFIED: package.json L64; CITED-in-repo: DISTRIBUTION.md L100]
- **`publishConfig.access: public`** must remain (scoped packages default to restricted without it). Already present; do not regress. [VERIFIED: package.json L72-74]
- **`prepublishOnly` is `node --test test/*.test.mjs`** and must remain unchanged — it is the prepublish test gate required by REL-02 and shared with `scripts.test`. [VERIFIED: package.json L7-10]
- **`.planning/` must never ship** — it is not in `files`, not in `exports`, and must stay out (it holds credentials-prone content; also gitignored per `.planning/` curate decision). [VERIFIED: package.json L45-58; CITED-in-repo: DISTRIBUTION.md L80; README L201]
- **Author identity:** `jaaty <jamie.atyeo@live.com>`. Verified this session: `git user.email = jamie.atyeo@live.com`; **`git user.name` is unset** (rc=1), so the GitHub handle `jaaty` is used as the author name — consistent with D-07. [VERIFIED: git config this session]
- **Origin remote** is `https://github.com/jaaty/dsh-gsd-bundle.git` — matches D-04's `repository.url`. [VERIFIED: `git remote -v` this session]
- **Node toolchain** is v24.15.0, `type: module`, built-in node test runner — `engines.node >= 20` (D-08) is comfortably compatible. [VERIFIED: `node --version`, package.json L5-9]
- **Scope discipline:** no `lib/` or `test/` code changes in this phase (out-of-scope guard: `git diff --stat lib/ test/` empty). [CITED-in-repo: DISTRIBUTION.md D-08]
- **Validation must respect the EROFS npm-cache sandbox** — prefer read-only checks (node `JSON.parse` one-liners, `git diff --stat`), and treat `npm pack --dry-run` as best-effort with a static-fallback, as established in `publish-research`. [CITED-in-repo: DISTRIBUTION.md L82-91]
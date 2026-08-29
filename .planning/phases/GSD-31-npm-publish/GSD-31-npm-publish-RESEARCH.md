I have gathered all the facts I need. Below is the complete RESEARCH.md.

---

# RESEARCH.md — Phase 31: npm-publish

**Researcher:** gsd-phase-researcher (fresh context)
**Date:** 2026-08-29
**Phase goal:** Publish `@dsh-gsd/bundle` to the npm registry as v2.2.0, satisfying the `prepublishOnly` test gate, and verify the published package is installable. [REL-02]

---

## Domain analysis

This is an **ops/integration phase, not a code phase** (D-07: no runtime code changes, no new deps, no CI publish workflow). The "implementation" is a deterministic sequence of npm CLI / curl / `node --test` commands, each gated on the previous, with the read-only-cache workaround (D-01) applied uniformly. The standard stack here is the npm registry publish model, not the bundle's own plugin stack.

**Standard publish model for a scoped public package** (confidence: HIGH):
- `npm publish` runs the `prepublishOnly` lifecycle script automatically before uploading [CITED: https://docs.npmjs.com/cli/v9/commands/npm-publish]. For this package `prepublishOnly === test === node --test test/*.test.mjs` [VERIFIED: `package.json` scripts, read this session].
- A scoped package (`@scope/name`) publishes publicly only when `publishConfig.access` is `"public"` OR `--access public` is passed. `package.json` already carries `"publishConfig": { "access": "public" }` [VERIFIED: `package.json` this session], so no `--access` flag is required at publish time [CITED: https://docs.npmjs.com/cli/v9/commands/npm-publish].
- npm packs only the `files` whitelist (plus a few always-included files like `package.json`/`LICENSE`/`README`). `npm pack --dry-run` is the canonical pre-publish shape check [CITED: https://docs.npmjs.com/cli/v9/commands/npm-pack].
- There is **no `prepare`/`prepack`/build script** [VERIFIED: `package.json` scripts this session] — plain ESM source is shipped as-is, consistent with the project's "no build step" convention [VERIFIED: `.planning/codebase/CONVENTIONS.md:7` this session].

**Read-only-cache environment pitfall** (confidence: HIGH, verified):
- The default npm cache `~/.npm` is read-only (EROFS) in this environment; every npm command that touches the cache (`publish`, `install`, `pack`, `whoami`, `view`) must pass `--cache <workspace>/.npm-cache` [VERIFIED: `npm whoami` succeeded this session *only* with the `--cache` override; `npm config get cache` reports `/home/jatyeo/.npm`]. This matches D-01.
- `curl https://registry.npmjs.org/<url-encoded-name>` is the EROFS-safe registry probe (no cache) per D-04 [VERIFIED: `curl` returned `{"error":"Not found"}` for `@dsh-gsd%2Fbundle` this session].

**Peer-dependency pitfall for the installability check** (confidence: HIGH, verified):
- `package.json` declares four `peerDependencies` with **exact** (non-ranged) versions: `@deepseek-ai/dsh-tools@0.1.1-rc.2`, `@deepseek-ai/schemastery@3.18.1`, `@deepseek-ai/cordis@4.0.1`, `@deepseek-ai/dsh-llm@0.1.1-rc.2` [VERIFIED: `package.json` this session].
- npm 7+ auto-installs `peerDependencies` during `npm install` [CITED: https://docs.npmjs.com/cli/v9/commands/npm-install]. All four peers **exist on the public registry at the exact required versions** [VERIFIED: per-package `curl` to `registry.npmjs.org` this session]:
  - `@deepseek-ai/dsh-tools` → `0.1.1-rc.2` present (11 versions).
  - `@deepseek-ai/schemastery` → `3.18.1` present, `latest` (3 versions).
  - `@deepseek-ai/cordis` → `4.0.1` present, `latest` (3 versions).
  - `@deepseek-ai/dsh-llm` → `0.1.1-rc.2` present (11 versions).
- Therefore `npm install @dsh-gsd/bundle@2.2.0` into a fresh temp dir will resolve every peer; the installability check (D-05) will not ERESOLVE-fail on missing peers.
- The bundle's `lib/*.js` directly imports only `@deepseek-ai/dsh-llm` and `@deepseek-ai/dsh-tools` (`grep` over `lib/*.js` for `from "@deepseek-ai/..."`) [VERIFIED: grep this session]. `schemastery`/`cordis` are peers because the bundle *runs* inside the DSH host that provides them, but a bare `import('./lib/persona.js')` from an installed copy only needs `dsh-llm` + `dsh-tools` resolvable — both auto-installed as peers. So the "exports load" portion of the installability check is feasible without a live DSH host.

---

## Package legitimacy

No new dependencies are proposed (D-07). The only tools used are already present and verified:

- **npm CLI** `11.14.0` [VERIFIED: `npm --version` this session] — used for `publish`, `pack`, `install`, `whoami`. Authoritative docs: [CITED: https://docs.npmjs.com/cli/v9/commands/npm-publish], [CITED: https://docs.npmjs.com/cli/v9/commands/npm-pack].
- **node** `v24.15.0` [VERIFIED: `node --version` this session] — runs `node --test test/*.test.mjs` (the `prepublishOnly` gate).
- **curl** — registry probe; no package, EROFS-safe [VERIFIED: used this session].
- The **published tarball** is `dsh-gsd-bundle-2.2.0.tgz`, 32 files, 108.1 kB packed / 353.3 kB unpacked, shasum `f7f26c1c7c281908b9810d2ead6f9abcf48bb94c` [VERIFIED: `npm pack --dry-run --cache .npm-cache` this session]. Contents: `lib/*.js` (24 files) + `cordis.patch.yml` + `README.md` + `NOTICE` + `LICENSE` + `DISTRIBUTION.md` + `CONTRIBUTING.md` + `CODE_OF_CONDUCT.md` + `CHANGELOG.md` + `package.json`. `.planning/` is **excluded** (not in `files`, and `npm pack --dry-run` output contains zero `planning` lines) [VERIFIED: this session].

No third-party npm packages are added; no legitimacy review beyond the above is required.

---

## Risks and Open Questions

### R-1 (BLOCKER-risk): `@dsh-gsd` npm org does not exist — publish will fail
`npm org ls dsh-gsd --cache .npm-cache` returns **`404 Not Found — Scope not found`** [VERIFIED: ran this session]. The package name is `@dsh-gsd/bundle`, and the scope `dsh-gsd` is neither the publisher's username (`jamie.atyeo` [VERIFIED: `npm whoami` this session]) nor an existing org. npm requires the scope to be an org the publisher owns/is a member of; publishing to a non-existent org scope fails with a 404/403 and npm tells the user to **create the organization first** [CITED: https://github.com/npm/cli/issues/4773] (npm CLI gets a 404 and reports the org/scope is missing — confirmed by an npm/cli maintainer comment in that issue), [CITED: https://docs.npmjs.com/creating-and-publishing-scoped-public-packages].

**Impact:** `npm publish` (the central step of this phase) will fail until the `dsh-gsd` org exists on npmjs.com and `jamie.atyeo` is a member/owner. This is a **human prerequisite outside the code** — orgs are created via the web UI at `https://www.npmjs.com/org/create` (a free org permits unlimited public scoped packages); there is **no CLI command to create an npm org** [CITED: https://docs.npmjs.com/organizations/managing-organization-members/adding-members-to-your-organization], [ASSUMED: no `npm org create` subcommand exists — `npm org` only supports `set`/`rm`/`ls`]. Per D-08 (fail-fast), the publish step must surface this real cause and not fake success; per D-09 no token is committed.

**Q-1 (OPEN — blocks execution of the publish step):** Has the `dsh-gsd` org been created on npmjs.com and is `jamie.atyeo` an owner/member?
- **Blocking:** `npm org ls dsh-gsd` → "Scope not found" [VERIFIED this session]. The org must be created before `npm publish` can succeed.
- **Resolution path (recommended, needs human action):** Create the `dsh-gsd` org at `https://www.npmjs.com/org/create` (free, public packages), then re-run `npm org ls dsh-gsd --cache .npm-cache` until it returns the member list instead of "Scope not found". The planner should make "verify org exists" the **first** gate of the publish sequence and fail loudly (D-08) if it is still missing, so no publish attempt is wasted against a non-existent scope.
- This question cannot be resolved by research alone; it is a user-owned action. It stays **OPEN** until the human confirms the org exists.

### R-2: Version 2.2.0 already published → republish fails (currently NOT a risk)
`curl https://registry.npmjs.org/@dsh-gsd%2Fbundle` → `{"error":"Not found"}`; `versions: []`, `dist-tags: undefined` [VERIFIED: this session]. So the package has never been published and 2.2.0 is free. Re-check immediately before publish (D-04) because the state could change; if 2.2.0 appears, fail loudly (D-08) — do not force/republish.

### R-3: `.npm-cache/` working-tree churn
The override cache `<workspace>/.npm-cache` is created on disk and is **not gitignored** [VERIFIED: `.gitignore` this session lists only `node_modules/` and selected `.planning/*` volatile files; `git check-ignore .npm-cache` returned non-zero]. It currently shows as untracked (`?? .npm-cache/`) [VERIFIED: `git status` this session]. It must not be committed (it is a local byproduct) and should not pollute a clean working tree. **Recommendation (Claude's discretion):** add `.npm-cache/` to `.gitignore` as part of this phase's ops hygiene (this is a repo-config change, not a runtime code change, so it does not violate D-07), and/or `rm -rf .npm-cache` after the installability check. Marking as a recommendation, not a blocker.

### R-4: Auth token leakage
`~/.npmrc` (mode 0600) holds the auth token; there is **no `.npmrc` in the repo** [VERIFIED: `ls` this session], so the token is not tracked. D-09 forbids committing it. The only risk is an accidental `git add .npmrc` or embedding the token in a planning artefact — the plan must explicitly never write the token anywhere under the workspace. Low risk if the sequence uses `npm publish` (which reads `~/.npmrc` implicitly) and never echoes `~/.npmrc` contents.

### R-5: `prepublishOnly` runs from the working tree, not the tarball
`prepublishOnly` executes `node --test test/*.test.mjs` against the on-disk `test/` directory, which is **excluded from the published tarball** (`test/` is not in `files`) [VERIFIED: `package.json` files + `npm pack --dry-run` this session]. This is fine — the gate validates the code that *is* shipped, and `test/` is present at publish time on the working tree. The gate is currently green: **415 pass, 0 fail, exit 0** [VERIFIED: `npm test` this session]. No risk, but the plan must re-run the gate immediately before publish (D-02) since the tree is currently dirty (`.planning/STATE.md` modified + `.npm-cache/` untracked [VERIFIED: `git status` this session]).

### R-6: Scoped-package `access` configuration
`publishConfig.access` is already `"public"` [VERIFIED: `package.json` this session], so `npm publish` (no `--access` flag) will publish publicly. If `publishConfig.access` were absent, scoped packages default to private and publish would fail/surprise. Already satisfied — no action.

### Open Questions summary
- **Q-1 (OPEN):** `@dsh-gsd` npm org existence — blocks the publish step. Needs human action (create org on npmjs.com). Not resolvable by research. *(All other questions are RESOLVED below.)*
- Q-2 (RESOLVED): Is 2.2.0 already published? → No [VERIFIED: registry 404 this session].
- Q-3 (RESOLVED): Will the installability check resolve peers? → Yes, all four peers exist at exact versions [VERIFIED this session].
- Q-4 (RESOLVED): Does `prepublishOnly` pass? → Yes, 415/0 [VERIFIED this session].
- Q-5 (RESOLVED): Is the tarball shape correct (32 files, no `.planning/`)? → Yes [VERIFIED this session].

> **Planning cannot fully proceed with the publish step until Q-1 is resolved by the human.** The planner CAN and SHOULD still produce the full plan (gates + sequence + verification record), with the org-existence check as the first gate that hard-fails until the human creates the org. This keeps the plan ready to execute the moment the org exists.

---

## Architectural Responsibility Map

This phase has no presentation/domain/data code tiers — it is ops/integration. Capabilities are assigned to the tier that must own them so the planner puts each in the right place:

| Capability | Tier | Owner / mechanism |
|---|---|---|
| Verify `@dsh-gsd` org exists on npm | **integration** (security-sensitive prerequisite) | `npm org ls dsh-gsd --cache .npm-cache` gate, first in sequence; hard-fail (D-08) if "Scope not found" |
| Verify 2.2.0 not already published | **integration** | `curl https://registry.npmjs.org/@dsh-gsd%2Fbundle` → expect 404/empty versions (D-04) |
| Run `prepublishOnly` test gate | **validation** | `npm test` (== `node --test test/*.test.mjs`); hard stop on any failure (D-02) |
| Confirm tarball shape | **validation** | `npm pack --dry-run --cache .npm-cache` → assert 32 files, includes `lib/*.js`+`cordis.patch.yml`+docs, excludes `.planning/` (D-03) |
| Publish to registry | **integration** | `npm publish --cache .npm-cache` (uses `~/.npmrc` token, never committed — D-09); `publishConfig.access=public` already set |
| Verify installability | **validation** (ops) | `npm install @dsh-gsd/bundle@2.2.0 --cache .npm-cache` in a temp dir, then `import()` the main export resolves & loads (D-05); do NOT run `dsh plugin add` |
| Post-publish registry confirmation | **integration** | `curl https://registry.npmjs.org/@dsh-gsd%2Fbundle` → expect 2.2.0 present |
| Record verification artefact | **presentation** (planning) | SUMMARY/VERIFICATION note with commands + outputs (Claude's discretion per CONTEXT) |
| Keep auth token out of repo | **data** (security guard) | never `git add .npmrc`; never write token into any workspace file (D-09) |

**Security-sensitive capability tier check:** the auth-token guard (D-09) and the org-existence gate (R-1) are both assigned to integration/data tiers with explicit hard-fail behaviour — neither is mis-placed in a presentation/validation tier. No tier mis-assignment BLOCKER.

---

## Validation Architecture

Automated checks that prove each behaviour (these become the phase's acceptance gates; the verifier will re-run/inspect them):

1. **`prepublishOnly` test gate (D-02, REL-02 "prepublishOnly test gate satisfied").**
   - Command: `npm test` (== `node --test test/*.test.mjs`).
   - Pass criterion: exit 0, 0 failures. Currently: 415 pass / 0 fail [VERIFIED this session].
   - npm runs this automatically on `npm publish`; re-run manually first to fail fast (D-02).

2. **Tarball shape gate (D-03).**
   - Command: `npm pack --dry-run --cache .npm-cache`.
   - Pass criteria: 32 files; contains every `lib/*.js` + `cordis.patch.yml` + `README.md` + `NOTICE` + `LICENSE` + the four doc files + `package.json`; contains **no** `.planning/` path. [VERIFIED this session — exact expected file list recorded above].

3. **Registry pre-publish gate (D-04).**
   - Command: `curl -s https://registry.npmjs.org/@dsh-gsd%2Fbundle`.
   - Pass criterion: response is `{"error":"Not found"}` (or `versions` does not contain `2.2.0`). [VERIFIED this session: currently Not found].

4. **Org-existence gate (R-1 / Q-1, new — recommended).**
   - Command: `npm org ls dsh-gsd --cache .npm-cache`.
   - Pass criterion: returns a member list (not `404 Scope not found`). **Currently FAILS** [VERIFIED this session] — must be resolved by human before publish.

5. **Publish gate (REL-02).**
   - Command: `npm publish --cache .npm-cache` (dry-run optional first: `npm publish --dry-run --cache .npm-cache`).
   - Pass criterion: exit 0, registry accepts the tarball. (Cannot be pre-verified without performing it; gated on checks 1–4.)

6. **Post-publish registry gate (REL-02 "npm view @dsh-gsd/bundle@2.2.0 succeeds").**
   - Command: `curl -s https://registry.npmjs.org/@dsh-gsd%2Fbundle` (EROFS-safe equivalent of `npm view`, per D-04).
   - Pass criterion: response includes version `2.2.0` in `versions` and `dist-tags.latest` (or a `2.2.0` sub-doc at `…/@dsh-gsd%2Fbundle/2.2.0`).

7. **Installability gate (D-05, REL-02 "npm install succeeds").**
   - Commands (in a temp dir, e.g. `mktemp -d`):
     - `npm install @dsh-gsd/bundle@2.2.0 --cache <workspace>/.npm-cache`
     - `node -e "import('@dsh-gsd/bundle').then(m => console.log('loaded:', !!m)).catch(e => { console.error(e); process.exit(1); })"` (or import the `.`/`./persona` export) — proves the main export resolves and loads against the auto-installed peers.
   - Pass criteria: install exit 0; `node_modules/@dsh-gsd/bundle` present; main export import resolves without error. Do NOT run `dsh plugin add` (out of scope, D-05).
   - Cleanup: `rm -rf <temp dir>` (Claude's discretion).

8. **No-secrets guard (D-09, PUB-04 lineage).**
   - Command: `git status --short` must show no `.npmrc`; confirm `~/.npmrc` is never staged. (The token lives only in `~/.npmrc`.) [VERIFIED: no repo `.npmrc` this session].

These eight checks collectively prove: gate satisfied (1), correct artefact shipped (2), no clobber (3), permission to publish (4), published (5,6), installable (7), and no secret leak (8) — i.e. the full REL-02 definition of done.

---

## Project Constraints (from project conventions)

From `.planning/codebase/CONVENTIONS.md` [VERIFIED: read this session]:
- **Real-cause fail-fast (D-08 alignment):** errors are thrown as `new Error("<tool>: <reason>")` / `gsd_ship preflight failed: <reason>` with the real cause surfaced (`CONVENTIONS.md:69-82, 126-128`). The publish sequence must follow the same discipline: on any failure (org missing, 2.2.0 exists, network/403), report the real npm/curl error verbatim and stop — never fake success.
- **Plain ESM, no build step (`CONVENTIONS.md:7`):** there is no `prepare`/`prepack`/build script to run before publish; the shipped source is the working-tree source. Confirmed by `package.json` scripts [VERIFIED this session].
- **Zero runtime dependencies (`package.json` `"dependencies": {}`):** only the four `peerDependencies`, all verified present on the registry this session. No transitive resolution risk for the install check.
- **Feature-branch discipline (CQ-07):** the phase runs on branch `phase-31` [VERIFIED: `git branch --show-current` this session]; planning artefacts commit there. This phase writes no code, but its SUMMARY/VERIFICATION artefact should be committed to `phase-31` per the same convention. No `v2.2.0` git tag exists yet [VERIFIED: `git tag --list 'v2*'` → `v2.0.0`, `v2.1.0` this session] — and must NOT be created here (D-06: tag + GitHub release is out of scope, a separate release task matching the v1.7.0/v2.0.0/v2.1.0 pattern).
- **`.planning/` keep-vs-gitignore decision (PUB-03):** the volatile `.planning/*` entries in `.gitignore` are honoured; `.planning/` durable artefacts stay tracked [VERIFIED: `.gitignore` this session]. The published tarball excludes all of `.planning/` via the `files` whitelist [VERIFIED this session], so the keep/ignore decision does not affect the published artefact.

---

## Recommendations to the planner

1. **Plan as a single linear plan / wave** (one executor): gates run strictly in order — org-exists → registry-empty → test-gate → pack-shape → publish → post-publish-registry → installability → no-secrets-confirm. Each gate hard-fails (D-08) and stops the sequence. This is below the multi-plan decomposition threshold but above `gsd_quick` (it has 8 ordered gates and a destructive external action), so a single bounded PLAN.md is appropriate.
2. **Put the org-existence check first** and make it a documented hard gate, so the plan is executable the instant the human resolves Q-1, and so a run before Q-1 is resolved fails cheaply with the real cause rather than burning a publish attempt.
3. **Uniform `--cache <workspace>/.npm-cache`** on every npm command (D-01); record the exact override path as a constant.
4. **Add `.npm-cache/` to `.gitignore`** (R-3) as a one-line ops-hygiene edit (not a runtime code change) so the working tree stays clean for the no-secrets guard.
5. **Verification record (Claude's discretion):** write the command + exit code + key output line for each of the 8 gates into the phase SUMMARY/VERIFICATION, so the verifier can confirm REL-02's three prongs (prepublishOnly satisfied, published as 2.2.0, installable) from artefacts alone.

---

*End of RESEARCH.md — Phase 31: npm-publish*
# Phase 31: npm-publish - Context

**Gathered:** 2026-08-29T17:55:34.840Z
**Status:** Ready for planning

<domain>
## Phase Boundary
**In scope:** Publish @dsh-gsd/bundle to the npm registry as v2.2.0, satisfying the prepublishOnly test gate, and verify the published package is installable via npm install into a temp dir.
**Out of scope:** Creating the v2.2.0 git tag / GitHub release (a separate release task). No runtime code changes to the bundle plugins. No CI publish workflow. No new dependencies. No full dsh plugin add consumer-path verification.
</domain>

<decisions>
## Decisions
### Publish mechanics
- **D-01:** Publish via `npm publish` using an alternate writable `--cache` (e.g. `<workspace>/.npm-cache`), because the default `~/.npm` cache is read-only (EROFS) in this environment. Every npm command in this phase (publish, install, pack) must pass the same `--cache` override.
- **D-02:** The `prepublishOnly` gate (`node --test test/*.test.mjs`) must pass before publish; npm runs it automatically on publish. Confirm the suite is green first, and treat any test failure as a hard stop.
- **D-03:** Pre-publish sanity: run `npm pack --dry-run` (with the `--cache` override) to confirm the tarball shape — 32 files, includes lib/*.js + cordis.patch.yml + README.md + NOTICE, excludes .planning/ — before publishing.
- **D-04:** Use `curl https://registry.npmjs.org/<url-encoded-name>` for pre-publish registry checks (confirm 2.2.0 is not already published, scope availability) since `npm view`/`npm install` EROFS on the default cache.
### Installability verification
- **D-05:** Verify installability by `npm install @dsh-gsd/bundle@2.2.0` into a temp dir (with the `--cache` override), then confirm the package resolves, installs, and its exports load. Do NOT run the full `dsh plugin add` consumer path.
### Scope boundaries
- **D-06:** The v2.2.0 git tag + GitHub release is OUT OF SCOPE for this phase — it is a separate release task, matching how prior milestones (v1.7.0, v2.0.0, v2.1.0) were tagged.
- **D-07:** No runtime code changes, no CI publish workflow, no new dependencies. This is an ops/integration phase using npm CLI, curl, and node --test only.
### Error handling
- **D-08:** On publish failure (e.g. @dsh-gsd scope not owned by jamie.atyeo, 2.2.0 already published, network error), fail loudly with the real cause per the project's fail-fast convention. Never fake success or work around the failure.
- **D-09:** Do not commit the npm auth token; it lives in ~/.npmrc and is used at publish time only. No secrets are added to the repo.
### Claude's Discretion
- Exact temp-dir location and cleanup for the installability check.
- Exact pre-publish registry check commands (curl) and their ordering.
- Wording and location of the verification record (SUMMARY/VERIFICATION).
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Manifest to publish
- `package.json — name @dsh-gsd/bundle, version 2.2.0, publishConfig.access public, prepublishOnly = node --test test/*.test.mjs, files whitelist`
### Distribution decision
- `DISTRIBUTION.md — research-backed decision: npm publish primary, clone-from-source secondary`
### Publish auth
- `~/.npmrc — auth token for jamie.atyeo, used at publish time, never committed`
### Test gate
- `test/*.test.mjs — the prepublishOnly gate suite (node --test)`
### Project conventions
- `.planning/codebase/CONVENTIONS.md — real-cause fail-fast, plain ESM no build step, zero runtime dependencies`
</canonical_refs>

<code_context>
## Code Context
- npm auth token is valid for jamie.atyeo (verified via curl to registry /-/whoami).
- Default ~/.npm cache is read-only (EROFS); alternate --cache in the writable workspace works (verified npm whoami + npm pack --dry-run).
- npm pack --dry-run produces a valid tarball: 32 files, 108.1 kB, name @dsh-gsd/bundle version 2.2.0.
- package.json is already publish-ready from phase 30: version 2.2.0, publishConfig.access public, prepublishOnly = node --test test/*.test.mjs, files whitelist ships lib/*.js + cordis.patch.yml + README.md + NOTICE.
- No prepare/prepack/build script — plain ESM source, no build step.
</code_context>

<specifics>
## Specifics
- Publish as @dsh-gsd/bundle@2.2.0.
- Installability = npm install @dsh-gsd/bundle@2.2.0 in a temp dir with the --cache override.
- v2.2.0 git tag + GitHub release is out of scope (separate release task).
</specifics>

<deferred>
## Deferred Ideas
- v2.2.0 git tag + GitHub release (separate release task).
- CI publish workflow (deferred from phase 28).
- Full dsh plugin add consumer-path verification (deferred; npm install check chosen for this phase).
</deferred>


---

*Phase: 31-npm-publish*
*Context gathered: 2026-08-29*
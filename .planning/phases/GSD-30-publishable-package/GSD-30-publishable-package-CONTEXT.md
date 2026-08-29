# Phase 30: publishable-package - Context

**Gathered:** 2026-08-29T06:36:52.265Z
**Status:** Ready for planning

<domain>
## Phase Boundary
**In scope:** Make package.json publish-ready for milestone public-launch v2.2.0: bump the version to 2.2.0, add the missing npm metadata fields (repository, homepage, bugs, keywords, engines, author), and expand the files whitelist to ship every doc the README links to.
**Out of scope:** Actually publishing to npm (phase 31 npm-publish), GitHub repo topic/homepage config (phase 33), and README badges (phase 34). No runtime code changes to the bundle plugins.
</domain>

<decisions>
## Decisions
### Version bump
- **D-01:** Bump the package.json "version" to "2.2.0" to match the active milestone (public-launch v2.2.0).
- **D-02:** Sync the "version" field in package-lock.json to 2.2.0 so the manifest and lockfile stay consistent for npm ci and prepublishOnly.
- **D-03:** Add a [2.2.0] entry to CHANGELOG.md (Keep a Changelog format) documenting the publishable-package milestone, since 2.2.0 is the upcoming release version.
### npm metadata fields
- **D-04:** repository: use the canonical object form {"type": "git", "url": "git+https://github.com/jaaty/dsh-gsd-bundle.git"} to match the origin remote.
- **D-05:** homepage: set to "https://github.com/jaaty/dsh-gsd-bundle" (the project GitHub repo).
- **D-06:** bugs: set to "https://github.com/jaaty/dsh-gsd-bundle/issues". Do not set the legacy bugs email.
- **D-07:** author: set to "jaaty <jamie.atyeo@live.com>" (the configured git author email, name from the GitHub handle).
- **D-08:** engines: declare {"node": ">=20"}. Node floor of 20 is comfortably above the node --test (18+) and built-in test-runner requirements the package relies on, matching the local v24 toolchain as a modern stable.
- **D-09:** keywords: add a focused list for discoverability: ["dsh", "deepseek-harness", "plugin", "bundle", "opengsd", "git", "ship", "automation", "agile"].
### files whitelist
- **D-10:** Expand the files array to ship every doc the README links to, keeping existing entries. New additions: DISTRIBUTION.md, CONTRIBUTING.md, CODE_OF_CONDUCT.md, CHANGELOG.md. Keep existing: lib/*.js, cordis.patch.yml, README.md, NOTICE. Do NOT explicitly list LICENSE (npm auto-includes it with files).
### Claude's Discretion
- Exact ORDER and grouping of keys within package.json is left to the executor (keep it readable/consistent with existing style).
- Wording of the CHANGELOG [2.2.0] entry body is left to the executor, following the existing entry structure.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Manifest to edit
- `package.json — the publish-ready manifest: version, metadata fields, files whitelist`
### Lockfile to keep in sync
- `package-lock.json — its "version" must match 2.2.0`
### README-linked docs to ship
- `README.md — links DISTRIBUTION.md, CONTRIBUTING.md, CODE_OF_CONDUCT.md, CHANGELOG.md`
- `DISTRIBUTION.md — research-backed distribution decision doc`
- `LICENSE — MIT, auto-included by npm, do not list in files`
### Changelog to extend
- `CHANGELOG.md — add [2.2.0] entry, Keep a Changelog format`
</canonical_refs>

<code_context>
## Code Context
- package.json currently: version 2.0.0, license MIT, publishConfig.access public, exports map for persona/state/core-tools/discuss/plan/execute/verify/ship/ui/quick/map-codebase/commands and ./package.json, files = [lib/*.js, cordis.patch.yml, README.md, NOTICE], prepublishOnly runs node --test test/*.test.mjs.
- Origin remote is https://github.com/jaaty/dsh-gsd-bundle.git; git author email jamie.atyeo@live.com; no git user.name configured (handle 'jaaty' used as author name).
- No 'engines' field exists anywhere today; package uses type:module and the built-in node --test runner.
</code_context>

<specifics>
## Specifics
- Author is 'jaaty <jamie.atyeo@live.com>'.
- engines.node floor is '>=20'.
- files whitelist ships exactly the 4 README-linked docs (no explicit LICENSE, no .github workflow).
- Version bump covers package.json + package-lock.json + a CHANGELOG [2.2.0] entry.
</specifics>

<deferred>
## Deferred Ideas
- npm publish as v2.2.0 (phase 31) — this phase prepares the manifest but does not publish.
- GitHub topics + homepage repo config (phase 33).
- README health/provenance badges (phase 34).
</deferred>


---

*Phase: 30-publishable-package*
*Context gathered: 2026-08-29*
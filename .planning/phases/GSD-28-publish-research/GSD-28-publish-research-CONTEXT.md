# Phase 28: publish-research - Context

**Gathered:** 2026-08-29T05:30:34.180Z
**Status:** Ready for planning

<domain>
## Phase Boundary
**In scope:** Research how other dsh plugins are distributed (npm publish vs clone-and-install-from-source vs both), triangulating three sources: web search of the dsh plugin ecosystem/distribution docs, local inspection of installed dsh plugins under the dsh checkout's node_modules (@deepseek-ai/* and any dsh-* bundles), and live npm registry queries for @deepseek-ai/* and dsh-* scoped packages. Write a research-backed distribution decision to a new top-level DISTRIBUTION.md at the repo root, linked from the README Install section. Align the repo to the chosen path: update the README Install/Quickstart section and the package.json publish-readiness fields (name scope, files, and a prepublishOnly script if npm publish is chosen) to match the decision. Do NOT actually run npm publish in this phase.
**Out of scope:** Actually publishing the package to npm; the GitHub Actions test workflow and full-history secret scan (phase 27); any functional changes to the GSD tools themselves; changing the .planning/ keep-vs-gitignore-vs-curate decision (phase 26); retroactively rewriting existing .planning/ artefacts.
</domain>

<decisions>
## Decisions
### Research methodology
- **D-01:** Triangulate three evidence sources: (a) web_search the dsh plugin ecosystem and how dsh plugins are distributed, (b) local inspection of the installed dsh plugins under the dsh checkout's node_modules (the @deepseek-ai/* packages and any dsh-* bundles) — read their package.json (name, version, files, bin, publishConfig, scripts) and README install sections, and (c) live npm registry queries for @deepseek-ai/* and dsh-* scoped names to see which are actually published vs source-only.
- **D-02:** Record the research evidence (sources, registry query results, local package.json findings, citations/URLs) inside DISTRIBUTION.md itself so the decision and its basis live in one durable doc, rather than a separate RESEARCH.md.
### Decision location
- **D-03:** Write the decision to a new top-level DISTRIBUTION.md at the repo root, alongside the phase 25/26 root docs (LICENSE, NOTICE, CHANGELOG.md, CONTRIBUTING.md, CODE_OF_CONDUCT.md), and link it from the README Install section.
### Outcome scope (decision vs apply)
- **D-04:** Decision + light apply: write the research-backed decision in DISTRIBUTION.md AND align the repo to the chosen path — update the README Install/Quickstart section to match and adjust the package.json publish-readiness fields (name scope, files field, and add a prepublishOnly script if npm publish is chosen). Do NOT actually run npm publish in this phase; conformance of the repo metadata is the success bar.
### Inconclusive-research fallback
- **D-05:** If the research is inconclusive (no clear precedent among other dsh plugins, or they're all over the map), default to the current clone-and-install-from-source path (matching the existing README Install section) and explicitly document in DISTRIBUTION.md that no clear ecosystem precedent was found, with the evidence reviewed. Do not block on the human.
- **D-06:** If a chosen npm publish path would collide with an existing registry name (@dsh-gsd/bundle already taken), document the collision in DISTRIBUTION.md and either rename the package or default back to clone-and-install-from-source; do not silently squat a name.
### Error handling / edge cases
- **D-07:** If the npm registry query errors or returns nothing (rate limit, offline, npm down), record the attempt in DISTRIBUTION.md and fall back to web + local evidence only; do not fail the phase on a registry query failure.
- **D-08:** This phase is research + docs + repo-metadata only: no functional changes to the GSD tools (lib/*) or their tests, consistent with the phase 25/26 'docs-only, no tool changes' out-of-scope boundary.
### Claude's Discretion
- Exact wording and section structure of DISTRIBUTION.md.
- Which specific dsh plugins to inspect locally (whatever is present in the checkout's node_modules under @deepseek-ai/* and any dsh-* bundles).
- Whether to add a prepublishOnly script and what it runs (e.g. npm test), if npm publish is the chosen path.
- How to phrase the README Install/Quickstart section rewrite to match the chosen path.
- The exact npm registry query commands (npm view, npm search) used for evidence.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Package metadata to align to the chosen distribution path
- `package.json — name @dsh-gsd/bundle, version 2.0.0, files field excludes .planning/, peerDeps @deepseek-ai/*, MIT license, dsh.bundle.patch ref — already publish-shaped`
### README sections to update to match the decision
- `README.md — Install and Quickstart sections (current docs document clone-and-install via `dsh plugin --profile add <path>`)`
- `README.md — existing `.planning/ artefacts` and `## License` sections that link to the other root docs (phase 25/26 pattern to extend)`
### Root-doc pattern DISTRIBUTION.md sits alongside
- `LICENSE — added phase 25`
- `NOTICE — added phase 25`
- `CHANGELOG.md — added phase 26`
- `CONTRIBUTING.md — added phase 26`
- `CODE_OF_CONDUCT.md — added phase 26`
### Requirement text defining the phase goal
- `.planning/REQUIREMENTS.md — PUB-05: 'A research-backed distribution decision (npm publish vs clone-and-install-from-source) is documented, matching the behavior of other dsh plugins.'`
### Bundle patch referenced from package.json
- `cordis.patch.yml — the bundle patch applied by `dsh plugin add``
### Locally-installed dsh plugins to inspect for distribution precedent
- `The dsh checkout at /var/home/jatyeo/.nvm/versions/node/v24.15.0/lib/node_modules/@deepseek-ai/dsh — inspect its node_modules for @deepseek-ai/* packages and any dsh-* bundles, reading their package.json publish fields and README install sections`
### Existing map notes on packaging/distribution, if any
- `.planning/codebase/ — STRUCTURE.md / CONVENTIONS.md for any existing notes on packaging and distribution`
### Deferred-from / feeds-into phases
- `.planning/ROADMAP.md — phase 27 ci-and-security (CI workflow, deferred from phase 26); phase 28 publish-research is the final phase`
</canonical_refs>

<code_context>
## Code Context
- package.json is already publish-shaped: scoped name @dsh-gsd/bundle, version 2.0.0, a `files` field that ships lib/*.js + cordis.patch.yml + README.md + NOTICE (and excludes .planning/), MIT license, and peerDependencies on @deepseek-ai/dsh-tools/schemastery/cordis/dsh-llm. So npm publish is a realistic option that needs little metadata work; clone-and-install is the status quo.
- README.md currently documents clone-and-install-from-source via `dsh plugin --profile <name> add <path-to-this-bundle>` in its Install section — the exact section the decision must align.
- Phases 25-26 established the root-doc + README-link pattern (LICENSE, NOTICE, CHANGELOG.md, CONTRIBUTING.md, CODE_OF_CONDUCT.md all at repo root, linked from README); DISTRIBUTION.md follows that pattern.
- No CI or release/publish workflow exists yet (phase 27 adds the test CI workflow; an npm publish workflow is not in scope for phase 28).
- The bundle is driven by dsh profiles via cordis.patch.yml, so 'distribution' here is about how a user acquires the bundle source/package, not a runtime dependency the GSD tools import.
</code_context>

<specifics>
## Specifics
- Research sources: 'All three: web + local + npm' — triangulate web_search of the dsh ecosystem, local inspection of installed dsh plugins in the checkout's node_modules, and live npm registry queries for @deepseek-ai/* and dsh-*.
- Decision location: 'New top-level DISTRIBUTION.md + README link' — alongside the phase 25/26 root docs.
- Outcome: 'Decision + light apply' — update README Install/Quickstart + package.json publish-readiness fields to match; no actual npm publish in this phase.
- Fallback: 'Default to clone-and-install, document the gap' if no clear precedent among other dsh plugins.
</specifics>

<deferred>
## Deferred Ideas
- Actually running `npm publish` of @dsh-gsd/bundle to the registry — a future step after the distribution decision is made and validated.
- A GitHub Actions release/publish workflow (e.g. on tag push) — could follow phase 27's CI work; not in this phase.
- Publishing versioned releases to npm in lockstep with the milestone release tags — downstream of an actual publish decision.
</deferred>


---

*Phase: 28-publish-research*
*Context gathered: 2026-08-29*
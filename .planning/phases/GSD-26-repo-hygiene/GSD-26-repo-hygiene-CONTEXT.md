# Phase 26: repo-hygiene - Context

**Gathered:** 2026-08-29T02:53:23.015Z
**Status:** Ready for planning

<domain>
## Phase Boundary
**In scope:** Add CHANGELOG.md, CONTRIBUTING.md, and CODE_OF_CONDUCT.md to the repo root; make and apply the .planning/ keep-vs-gitignore-vs-curate decision (keep durable artefacts tracked, gitignore volatile churn); add README links to the three new files; document the .planning/ decision in-repo so it is discoverable.
**Out of scope:** CI workflow and full-history secret scan (phase 27); distribution research (phase 28); any functional changes to the GSD tools themselves; retroactively rewriting existing .planning/ artefacts.
</domain>

<decisions>
## Decisions
### CHANGELOG
- **D-01:** CHANGELOG.md uses the Keep-a-Changelog format with an Unreleased section plus entries for the v2.0.0 and v1.7.0 milestones, each summarizing the shipped phases. It is hand-maintained going forward (no generation tooling).
- **D-02:** CHANGELOG.md lives at the repo root and is linked from README.
### Code of conduct
- **D-03:** Add the Contributor Covenant 2.1 code of conduct at CODE_OF_CONDUCT.md in the repo root.
### CONTRIBUTING.md
- **D-04:** CONTRIBUTING.md is full-depth: development setup, how to run the test suite, the PR/contribution workflow, and a short explanation of the GSD phase loop so contributors understand how the repo is driven.
- **D-05:** CONTRIBUTING.md includes a hygiene rule that no real credentials/tokens may be pasted into .planning/ artefacts, since the durable subset is committed.
### .planning/ decision
- **D-06:** Apply the curate decision: keep tracked the durable artefacts the GSD loop needs to orient (PROJECT.md, REQUIREMENTS.md, ROADMAP.md, STATE.md, config.json, codebase/ map, and per-phase CONTEXT/PLAN/SUMMARY/VERIFICATION/RESEARCH), and gitignore the volatile churn (async-jobs.json, WINDOWS.md, quick/ records, DISCUSSION-LOG.md).
- **D-07:** The curate decision is applied via .gitignore entries only; no changes to the GSD tools' write behaviour are required (gitignore affects tracking, not writing).
- **D-08:** The .planning/ curate decision is documented in-repo (in README's .planning/ artefacts section) so it is discoverable.
### README
- **D-09:** README gains links to CHANGELOG.md, CONTRIBUTING.md, and CODE_OF_CONDUCT.md.
### Claude's Discretion
- Exact wording and section ordering of CHANGELOG.md, CONTRIBUTING.md, and CODE_OF_CONDUCT.md content.
- Precise .gitignore entry formatting and which DISCUSSION-LOG.md files (per-phase) are covered by the volatile gitignore rule.
- How the v1.7.0 and v2.0.0 CHANGELOG entries summarize the shipped phases.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### README structure to extend and link from
- `.planning/../README.md — existing headings incl. `.planning/ artefacts` (line ~146) and `## License` (line ~199)`
### Where the curate decision is applied
- `.planning/../.gitignore — currently only `node_modules/``
### Durable artefacts to keep tracked
- `.planning/PROJECT.md`
- `.planning/REQUIREMENTS.md`
- `.planning/ROADMAP.md`
- `.planning/STATE.md`
- `.planning/config.json`
- `.planning/codebase/ — map docs`
### Volatile artefacts to gitignore
- `.planning/async-jobs.json`
- `.planning/WINDOWS.md`
- `.planning/quick/ — records`
- `.planning/phases/*/*-DISCUSSION-LOG.md`
### Version and packaging context for CHANGELOG
- `.planning/../package.json — version 2.0.0, files field excludes .planning/`
### Phase 25 outputs the new files sit alongside
- `.planning/../LICENSE`
- `.planning/../NOTICE`
</canonical_refs>

<code_context>
## Code Context
- README.md already has a `.planning/ artefacts` section (line ~146) and a `## License` section (line ~199) — the new links and the curate-decision note extend these.
- package.json version is 2.0.0 and its `files` field does not include .planning/, so the curate decision does not affect npm publishing (relevant to phase 28).
- .gitignore currently contains only `node_modules/`; the curate decision adds entries for the volatile .planning/ paths.
- LICENSE and NOTICE were added in phase 25; CODE_OF_CONDUCT.md sits alongside them at the repo root.
</code_context>

<specifics>
## Specifics
- CHANGELOG: 'Keep-a-Changelog, full history' — Unreleased section plus v2.0.0 and v1.7.0 milestone entries, hand-maintained.
- Code of conduct: 'Contributor Covenant 2.1' at CODE_OF_CONDUCT.md.
- CONTRIBUTING.md: 'Full: setup + tests + PR workflow + GSD loop'.
- .planning/ decision: 'Curate: keep durable, gitignore volatile' — no secrets found in the folder; committing is normal for GSD.
- README: 'Yes: link all three + document the decision'.
</specifics>

<deferred>
## Deferred Ideas
- GitHub Actions test workflow and full-history secret scan — phase 27 (ci-and-security).
- Distribution research (npm publish vs clone-and-install) — phase 28 (publish-research).
</deferred>


---

*Phase: 26-repo-hygiene*
*Context gathered: 2026-08-29*
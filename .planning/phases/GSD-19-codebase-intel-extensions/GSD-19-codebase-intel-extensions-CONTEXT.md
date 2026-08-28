# Phase 19: codebase-intel-extensions - Context

**Gathered:** 2026-08-28T05:41:19.047Z
**Status:** Ready for planning

<domain>
## Phase Boundary
**In scope:** Extend gsd_map_codebase with (a) drift detection that notices when the codebase changed since the last map, (b) a targeted re-map via a new gsd-intel-updater tool that updates only the affected map docs, (c) a structured answer object (answer + sources + confidence) instead of plain text in query mode, and (d) subtree query scoping via a queryScope/paths argument. Covers the tool schema, the codebase-map manifest, the updater subagents, the query-mode output contract, and the associated unit tests.
**Out of scope:** Full-map refresh behaviour beyond what exists today (force=true full remap stays as-is). No changes to the four focus areas, the FOCUS_DOCS table, or the mapper prompt templates' document structures. No multi-window topology (phase 20). No UI work.
</domain>

<decisions>
## Decisions
### Drift detection baseline & manifest (CBQX-01)
- **D-01:** At map time, gsd_map_codebase writes a stored snapshot manifest at .planning/codebase/.map-manifest.json recording repo-relative file paths + mtime (and a small hash if feasible) for all in-scope files. Drift is detected on a later run by comparing the current tree against this manifest. This works without git and catches uncommitted changes.
- **D-02:** Drift detection runs automatically on every gsd_map_codebase call (not behind a flag): when an existing map is present and a re-map is not being performed (no force, no paths), the tool reports drift inline in its return text (changed/added/removed counts + representative paths) in addition to the existing 'already exists' notice.
### Drift ignore set (CBQX-01)
- **D-03:** The drift ignore set is the default set: .planning/, .git/, node_modules/, and lockfiles (package-lock.json, yarn.lock, pnpm-lock.yaml, etc.) never count as drift. Empty directories are ignored. All other tracked files count.
### Updater surface (CBQX-02)
- **D-04:** Targeted re-map is surfaced as a new dedicated tool gsd-intel-updater (registered alongside gsd_map_codebase), not a mode flag. It takes a list of drifted repo-relative paths (or detects them itself from the manifest), maps them to the affected docs, and re-runs only the mappers whose docs are affected.
- **D-05:** Changed-files -> affected-docs mapping uses a heuristic rule table that seeds candidate docs (e.g. src/** + package.json + config -> STACK/ARCHITECTURE; test/** -> TESTING; general lib/** -> CONVENTIONS/STRUCTURE), then an updater subagent confirms/adjusts and re-writes only the affected docs, preserving unrelated docs untouched.
### Structured answer object (CBQX-03)
- **D-06:** Query mode's output changes to a structured JSON object schema {answer: string, sources: [{kind: 'map'|'codebase', path: string}], confidence: number 0-1} instead of plain text. The tool output is defined with an object schema; a human-readable text render is still produced for display (card).
- **D-07:** confidence is returned by the gsd-codebase-query subagent as a 0-1 score based on how directly the map/codebase answered the question; the orchestrator passes it through into the structured object. sources is a structured list of backticked paths with kind ('map' or 'codebase').
### Subtree query scoping (CBQX-04)
- **D-08:** A queryScope argument (accepting repo-relative path prefixes, same validation as existing paths) is added to gsd_map_codebase and honored in query mode. It restricts only the subagent's targeted Glob/Grep exploration to that subtree; the existing map docs are still loaded fully as the primary source.
### Claude's Discretion
- Exact heuristic rule-table entries and how to reconcile overlapping doc candidates when one file maps to several docs.
- Precise manifest schema fields beyond path/mtime/hash and how mtime granularity edge cases (same-second writes) are handled.
- Whether confidence needs calibration beyond the subagent's self-reported 0-1 score.
- Render/card presentation details for the structured answer object.
- Exact gsd-intel-updater argument names and validation beyond 'list of drifted paths'.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Existing gsd_map_codebase implementation
- `lib/map-codebase.js — the tool: modes, FOCUS_DOCS, query mode, existing-check, commit`
### Mapper and query subagent prompts
- `lib/_agents.js (CODEBASE_MAPPER_PROMPT, CODEBASE_QUERY_PROMPT) — mapper and query subagent prompts`
### gsdState codebase-doc service
- `lib/state.js (codebaseDir, listCodebaseDocs, readCodebaseDoc, _read/_write, planningRoot) — the fs-backed store the map lives in`
### Tool output / schema & structured results
- `lib/map-codebase.js (output.schema + render) — current string output contract`
- `lib/_runner.js (spawnSubagent, cwdOf, planningContext) — subagent invocation + context budgeting`
- `lib/_shared.js (contextBudget, today)`
### Tests & fake subagent harness
- `test/tools.test.mjs (gsd_map_codebase describe, fake codebase-query/codebase-mapper) — existing test patterns to extend`
- `test/service-tools.test.mjs — service-level codebase doc fixture`
### Prior codebase-intel phase
- `Phase 10 (codebase-query, CBQ-01/02) — shipped query mode that this phase extends`
</canonical_refs>

<code_context>
## Code Context
- lib/map-codebase.js exposes the tool, the query mode, existing-check, validatePaths, gitAddCommit, and the FOCUS_DOCS/VALID_FAST_FOCUS constants — the integration point for all four features.
- lib/_agents.js holds CODEBASE_MAPPER_PROMPT and CODEBASE_QUERY_PROMPT; the query prompt already instructs a Sources section, which the structured answer extends into a structured sources list + confidence.
- lib/state.js already has listCodebaseDocs/readCodebaseDoc/codebaseDir through ctx.fs; a writeCodebaseDoc/ manifest write can reuse _write/_ensureParent. A .map-manifest.json is a natural sibling in codebaseDir.
- test/tools.test.mjs has a registerTool harness and fake subagents keyed by label ('map-codebase', 'codebase-query') — the pattern to mirror for gsd-intel-updater and structured-answer tests.
</code_context>

<specifics>
## Specifics
- Structured answer object is exactly {answer, sources:[{kind,path}], confidence} — the three fields named in CBQX-03.
- queryScope argument accepts the same repo-relative path prefixes and validation as the existing paths argument.
- Drift manifest is a JSON file in the codebase map directory so it travels with the map and is committed with it.
</specifics>

<deferred>
## Deferred Ideas
- Multi-window topology and shared-base-branch merge handling (phase 20, MW-01..03).
- UI/visual presentation of map or intel output (no UI work in this phase).
- Any change to the mapper prompt document structures/templates or the four focus areas.
- Confidence calibration beyond the subagent self-report.
</deferred>


---

*Phase: 19-codebase-intel-extensions*
*Context gathered: 2026-08-28*
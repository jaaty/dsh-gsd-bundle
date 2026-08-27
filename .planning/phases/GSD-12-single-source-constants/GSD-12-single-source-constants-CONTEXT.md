# Phase 12: single-source-constants - Context

**Gathered:** 2026-08-27T00:24:28.743Z
**Status:** Ready for planning

<domain>
## Phase Boundary
**In scope:** Make GATE_NAMES and the secret-file list single-source and route cwdOf through the shared helper. Move the secretPatterns array to _shared.js and have gates.js and _agents.js import it. Have ship.js import GATE_NAMES from gates.js. Have core-tools.js and discuss.js import cwdOf from _runner.js. Generate the forbidden-files prose in the mapper prompts from the canonical array. Pure dedup refactor, no behavior change.
**Out of scope:** The other code-review findings (CQ-03 gate dispatch, CQ-04 execute checkpoint, CQ-05 ship robustness, CQ-06 context budget) belong to phases 13-16. No change to the gate evaluator logic, the glob-to-regex translation, or the cwdOf implementation itself.
</domain>

<decisions>
## Decisions
### Canonical source
- **D-01:** Move the secretPatterns array to _shared.js as the single source. gates.js imports it for the security gate and _agents.js imports it to build the forbidden-files prose.
- **D-02:** Keep GATE_NAMES exported from gates.js and have ship.js import it from there, removing the duplicate definition in ship.js.
### Helper routing
- **D-03:** Have core-tools.js and discuss.js import cwdOf from _runner.js, matching the other seven tools, and delete their inline copies.
### Prose generation
- **D-04:** Generate the forbidden-files prose sentence in the mapper prompts from the canonical secretPatterns array (join with ', '), so the prompt text and the gate globs can never drift.
### Claude's Discretion
- Exact export name for the secret list in _shared.js (e.g. secretPatterns) and whether to add a small helper that renders the prose sentence, as long as the array is the single source.
- Whether _agents.js builds the prose inline or via a tiny helper, as long as it derives from the array.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Canonical helper module
- `lib/_shared.js — the pure, import-nothing helper module that becomes the canonical home for secretPatterns`
### Secret list consumers
- `lib/gates.js — secretPatterns array (lines 22-47) to move, GATE_NAMES (line 224) to keep and export, securityGate that consumes secretPatterns`
- `lib/_agents.js — CODEBASE_MAPPER_PROMPT and CODEBASE_QUERY_PROMPT with the forbidden-files prose (lines 283, 319)`
### Dedup targets
- `lib/ship.js — duplicate GATE_NAMES (line 17) to remove, already imports from gates.js`
- `lib/_runner.js — cwdOf helper (lines 48-50)`
- `lib/core-tools.js — inline cwdOf (lines 54, 90, 165, 215), lib/discuss.js — inline cwdOf (line 69)`
### Tests
- `test/_shared.test.mjs, test/gates.test.mjs — tests that exercise secretPatterns and GATE_NAMES`
</canonical_refs>

<code_context>
## Code Context
- secretPatterns is an exported array in gates.js (lines 22-47) used by securityGate via matchSecretPatterns.
- GATE_NAMES is defined twice: ship.js line 17 and gates.js line 224.
- cwdOf(exec) in _runner.js returns exec?.agent?.session?.header?.cwd || process.cwd().
- core-tools.js pastes the cwdOf expression inline 4 times (lines 54, 90, 165, 215); discuss.js once (line 69).
- The forbidden-files prose appears verbatim in _agents.js lines 283 and 319, matching the secretPatterns array items joined by ', '.
</code_context>

<specifics>
## Specifics
- Make GATE_NAMES and the secret-file list single-source and route cwdOf through the shared helper (phase goal).
</specifics>

<deferred>
## Deferred Ideas
- The other code-review findings (CQ-03..CQ-06) are separate phases 13-16.
- Any change to the gate evaluator logic or glob-to-regex translation is out of scope for this dedup phase.
</deferred>


---

*Phase: 12-single-source-constants*
*Context gathered: 2026-08-27*
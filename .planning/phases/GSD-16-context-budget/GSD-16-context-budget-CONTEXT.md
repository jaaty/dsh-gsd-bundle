# Phase 16: context-budget - Context

**Gathered:** 2026-08-27T04:41:43.469Z
**Status:** Ready for planning

<domain>
## Phase Boundary
**In scope:** Give planningContext (lib/_runner.js) a total truncation budget over the summed length of entry contents, derive that budget from config.json context_window (with a fallback default), trim from the end after the per-file cap, return/append a surfaced truncation audit, and dedupe duplicate/overlapping entries. Wire the new signature across the 5 call sites (plan, verify, execute, ui, map-codebase).
**Out of scope:** Broader subagent context management (maxPerFile behaviour elsewhere, token estimation, prompt shrinking), other budget tuning, and phase-17 branch-isolation work. No changes to the per-file default semantics beyond what the total budget requires.
</domain>

<decisions>
## Decisions
### Total budget semantics
- **D-01:** The total truncation budget caps the summed character length of all entry contents only; markdown labels/fences/newlines of the assembled <planning_context> block are excluded from the accounting.
### Budget value source
- **D-02:** The default total budget is ~45% of config.json context_window (read via the state service at each call site), falling back to a hardcoded constant (e.g. 90000) when context_window is absent/unparsable.
- **D-03:** planningContext stays a pure function. Call sites derive maxTotal from the read context_window (via a shared helper) and pass it in; the helper is the single source for the fraction and the fallback constant.
### Truncation strategy
- **D-04:** When the sum of entry contents exceeds the total budget: apply the per-file maxPerFile cap first, then trim entries from the END (dropping whole entries, then finally trimming the last kept entry if needed) until the total fits — preserving the head/earliest entries, which matter most to the fresh subagent.
### Surfacing truncation
- **D-05:** planningContext returns { text, truncated: [{ label, originalChars, keptChars }] } instead of a plain string; each call site reports the truncated list through its existing log channel so the orchestrator/user can see that context was cut.
- **D-06:** When any truncation occurs, append an inline audit notice inside the block (e.g. '…(N entries truncated: label, …)…') so the fresh-context subagent itself sees that context was elided.
### Dedup fixes
- **D-07:** planningContext skips an entry whose content string is identical to an already-included entry (first occurrence wins), and call sites drop labels that would repeat content already present (e.g. REQUIREMENTS/CONTEXT overlap), so a file can never be injected twice into one prompt.
### Edge cases / error handling
- **D-08:** Existing behaviour preserved: empty/null/whitespace entries are skipped; a total budget <= 0 means 'no total cap' (per-file cap still applies); a non-string content is coerced with String() as today. No throw on malformed entries.
### Claude's Discretion
- The exact wording of the inline audit notice and the log line format.
- The precise fallback constant value (approx 90000) and the 0.45 fraction if a slightly different round number reads better.
- Which shared helper file hosts the budget-derivation helper (lib/_shared.js vs lib/_runner.js).
- Exactly which call sites pass a derived maxTotal vs rely on defaults.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### planningContext implementation
- `lib/_runner.js — planningContext(entries, maxPerFile=60000), lines 34-46; the current per-file truncation and inline …(truncated)… marker`
### Call sites
- `lib/plan.js — planningContext in researcher/planner/checker prompts`
- `lib/execute.js — executor prompt planningContext`
- `lib/verify.js — verifier prompt planningContext`
- `lib/ui.js — UI researcher/checker planningContext`
- `lib/map-codebase.js — codebase-query planningContext`
### config / budget anchor
- `.planning/config.json — context_window: 200000`
- `lib/state.js — readConfig (readWindow) used by call sites`
### Requirement
- `.planning/REQUIREMENTS.md — CQ-06 (line ~48)`
### Shared helpers
- `lib/_shared.js — blocksToText and other shared pure helpers`
### Tests
- `test/ — no existing planningContext/truncation tests; new unit tests expected here`
- `test/dedup.test.mjs — existing dedup test is for CQ-02 single-source constants, unrelated to content dedup (D-07)`
</canonical_refs>

<code_context>
## Code Context
- planningContext is a pure, exported helper in lib/_runner.js with signature (entries, maxPerFile=60000) returning a joined string — all 5 tools import it from there.
- Call sites already hold the state service `s` and several already call readConfig, so reading context_window to derive maxTotal requires no new plumbing.
- config.json exposes context_window: 200000; per-file maxPerFile=60000 is the existing guard.
- No existing tests exercise planningContext/truncation, so new unit tests are the verification surface.
</code_context>

<specifics>
## Specifics
- Give planningContext a total truncation budget (not just per-file) so a large RESEARCH.md can't blow out the whole prompt even when each file is under 60k.
- Surface truncation to the caller and append an audit note inside the block so the fresh subagent knows context was elided.
- Small dedup fixes so identical/repeated artifacts aren't injected twice into one prompt.
</specifics>

<deferred>
## Deferred Ideas
- Per-file maxPerFile configurability and the default 60k tuning are out of scope.
- Token-based (not char-based) budgeting and budget-aware splitting across multiple planner/checker calls belong in a future phase.
- Phase 17's per-phase branch acquisition is tracked separately.
</deferred>


---

*Phase: 16-context-budget*
*Context gathered: 2026-08-27*
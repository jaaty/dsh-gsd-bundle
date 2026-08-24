# Phase 8: capability-gates - Context

**Gathered:** 2026-08-24T05:35:40.706Z
**Status:** Ready for planning

<domain>
## Phase Boundary
**In scope:** Implement the capability-gate gatekeeper in gsd_ship: a gates config block in config.json (security, broken_windows, tdd_audit, all default true); each gate is a pure headless scan of the phase's changed files; gsd_ship runs them before push/PR creation, reports every gate's pass/fail/skipped status, and blocks (via fail()) when a required enabled gate fails, with a structured report naming the gate, file(s), and reason. Delivers CAP-01 and CAP-02.
**Out of scope:** A real background-job runtime; gsd_map_codebase --query intel mode; user-defined custom gate predicates; any LLM-based gate evaluation; inline blocking prompts for gate resolution.
</domain>

<decisions>
## Decisions
### Gate semantics
- **D-01:** Security gate: scan the phase's changed files (git diff vs merge-base) for the secret/credential pattern list from lib/_agents.js:283 (.env, credentials.*, *.pem, id_rsa*, .npmrc, etc.). Any match on a changed file is a security-gate failure with the file + pattern named.
- **D-02:** Broken-windows gate: scan the changed files for unreferenced TODO/FIXME/XXX markers and skipped tests (test.skip / describe.skip / xit) or stubs. Any found is a broken-windows failure naming the file + marker.
- **D-03:** TDD-audit gate: for each plan explicitly typed type:tdd, verify its commits follow RED (test:) then GREEN (feat:/fix:). A type:tdd plan lacking a test: commit before its feat:/fix: commit is a TDD-audit failure.
### Scan scope
- **D-04:** All gates scan only the phase's changed files (git diff vs the base/merge-base), not the whole repo, so pre-existing debt or unrelated files never block a ship.
### Blocking + report + skip
- **D-05:** A failing required gate blocks the ship: gsd_ship aborts before push/PR with a structured report naming which gate failed, the file(s), and why. Uses the existing fail() helper.
- **D-06:** A per-gate skip exists: a gate disabled in config.json (gates.<name>: false) or via a CLI flag is reported as 'skipped' and does not block. Teams can deliberately opt out of a gate.
- **D-07:** Every gate's pass/fail/skipped status is reported in the gsd_ship output (a Gate Report section), so CAP-01's 'reports each gate's pass/fail' is satisfied regardless of whether any gate blocks.
### Configurability
- **D-08:** Gates are listed in config.json under a new gates block: gates: { security: true, broken_windows: true, tdd_audit: true }. All default true; a gate set false is reported 'skipped' and does not block.
### TDD gate behavior
- **D-09:** The TDD-audit gate enforces RED→GREEN→REFACTOR on plans explicitly typed type:tdd regardless of the global tdd_mode flag. When tdd_mode is true it additionally checks tdd plans exist for behaviours. Since this repo has tdd_mode: false but ships type:tdd plans, the gate stays meaningful.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Existing gsd_ship gate + ship flow
- `lib/ship.js — gsd_ship preflight gates (lines 55-77: verification passed, clean tree, branch, remote, gh-auth) and the ship flow (push line 80, PR create line 130, completePhase line 142)`
- `lib/execute.js + lib/state.js — the completion-push fix (PR #9): gsd_ship now commits+pushes completion state after completePhase`
### Gate check semantics (secrets, broken-windows, TDD)
- `lib/_agents.js:283 — the secret/credential pattern list (.env, credentials.*, *.pem, id_rsa*, .npmrc, etc.)`
- `lib/_agents.js:166,192,197 — broken-windows / unreferenced TODO/FIXME/XXX = BLOCKER debt marker + skipped-test scanning`
- `lib/_agents.js:162 — TDD RED→GREEN→REFACTOR contract for type:tdd plans`
- `lib/_agents.js:49 — type: execute | tdd`
### Config + test harness
- `.planning/config.json — workflow config block (tdd_mode, nyquist_validation, etc.), the natural home for a gates:{...} block`
- `test/tools.test.mjs — the gsd_ship preflight test (missing-VERIFICATION) + the fake git/gh harness for testing gate enforcement`
- `test/_shared.test.mjs — pure-helper unit test style for the gate evaluators`
### Deferred intent
- `.planning/phases/GSD-05-window-ledger/GSD-05-window-ledger-CONTEXT.md — where capability gates were deferred to a later milestone`
</canonical_refs>

<code_context>
## Code Context
- gsd_ship already has hard preflight gates (verification passed, clean tree, feature branch, remote, gh-auth) that fail() before push — the capability gates slot in as an additional preflight layer before push/PR creation.
- The gate checks are pure repo scans (no LLM): security scans changed files for the _agents.js:283 secret patterns; broken-windows scans changed files for unreferenced TODO/FIXME/XXX + skipped/stubbed tests; TDD-audit verifies type:tdd plans produced test: before feat:/fix: commits.
- config.json already has a workflow block (tdd_mode, nyquist_validation, ...) — a new gates:{security,bool broken_windows:bool tdd_audit:bool} block enables/disables each gate (all default true).
- gsd_ship output is a log array returned as a string; the gate report should be appended as structured lines and blocking failures should use the existing fail() helper.
- The test harness fakes git/gh (no real git); gate enforcement tests need the fake git diff + fake test-run to produce deterministic gate outcomes.
- This repo has tdd_mode: false but still ships type:tdd plans — the TDD-audit gate must enforce on type:tdd plans regardless of global mode.
</code_context>

<specifics>
## Specifics
- gsd_ship runs a set of capability gates (security, broken-windows, TDD-audit) before shipping and reports each gate's pass/fail status — CAP-01
- gsd_ship refuses to ship when any capability gate fails, producing a clear report of which gate failed and why; the phase cannot ship until all required gates pass — CAP-02
</specifics>

<deferred>
## Deferred Ideas
- A real background-job runtime (registry-only manifest today) — separate milestone.
- gsd_map_codebase --query intel mode — separate feature.
- An inline blocking prompt inside gsd_ship for gate resolution — out of scope; gates are headless scans.
- Per-gate custom predicates defined by users in config — future extension; gates here are the fixed three (security, broken-windows, tdd-audit).
</deferred>


---

*Phase: 08-capability-gates*
*Context gathered: 2026-08-24*
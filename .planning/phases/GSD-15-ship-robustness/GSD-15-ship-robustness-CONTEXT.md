# Phase 15: ship-robustness - Context

**Gathered:** 2026-08-27T03:43:00.983Z
**Status:** Ready for planning

<domain>
## Phase Boundary
**In scope:** Convert lib/ship.js's git/gh calls from execFileSync to async (execFile promisified), extend the async conversion into gates.js's fetchGitData (its injectable gitFn becomes awaited/async), and report preflight failures with their real cause (underlying stderr in the message + Error.cause) while preserving the 'gsd_ship preflight failed:' prefix.
**Out of scope:** Any change to gsd_ship's success-path output or PR body, the capability-gate evaluator logic in gates.js (only fetchGitData's gitFn becomes async), map-codebase.js's sync git calls, and the async-jobs runtime's spawn-based calls.
</domain>

<decisions>
## Decisions
### Async mechanism
- **D-01:** git/gh calls use util.promisify(execFile) from node:child_process. The run/git/gitOk/gh helpers in ship.js become async (return Promises); every call site awaits them.
### Async scope
- **D-02:** The async conversion extends into gates.js's fetchGitData: its injectable gitFn(cwd, args) is now awaited (may return a Promise), and ship.js passes the async git helper. fetchGitData awaits each gitFn call.
### Real-cause reporting
- **D-03:** On preflight failure, the thrown message appends the underlying stderr/stdout snippet AND sets Error.cause to the original error. The 'gsd_ship preflight failed:' prefix is preserved (service-tools test depends on it).
### Error-handling split
- **D-04:** gitOk still swallows failures and returns ''; git/gh throw, and the thrown error carries stderr so the real cause can be reported.
### Fail helper scope
- **D-05:** One fail(msg, cause?) helper is used at every preflight site; git/gh failure paths pass the cause, other preflight gates pass none.
### Behavior preservation
- **D-06:** Existing tests stay green: service-tools /gsd_ship preflight failed:/, gates.test.mjs fetchGitData (a sync fake gitFn still works under await), and the static wiring tests (fail(blockError), if (blockError) fail(blockError), runCapabilityGates({ full cfg, step markers '6. push branch' / '## Gate Report').
### Claude's Discretion
- Exact helper signatures and how the stderr snippet is trimmed/rendered in the message.
- Whether fetchGitData's gitFn is typed as async or merely awaited (await works for both sync and async fns).
- How new unit tests are organized (new file vs. appended to an existing test file).
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### gsd_ship git/gh helpers + fail helper
- `lib/ship.js — the file being refactored; sync run/git/gitOk/gh helpers (lines 20-31), fail helper (line 55), git/gh call sites (steps 2-10)`
### fetchGitData injectable gitFn
- `lib/gates.js — fetchGitData (lines 228-251) whose injectable gitFn becomes awaited/async`
### gsd_ship preflight test
- `test/service-tools.test.mjs — gsd_ship preflight test (lines 214-226) asserting /gsd_ship preflight failed:/`
### fetchGitData + static wiring tests
- `test/gates.test.mjs — fetchGitData tests (lines 297-354) with a sync fake gitFn; static wiring test (lines 356-384)`
### static wiring tests
- `test/gates-ship.test.mjs — static wiring tests (lines 123-145) checking fail(blockError), step markers`
</canonical_refs>

<code_context>
## Code Context
- execFileSync import in ship.js (line 11); util.promisify is available from node:util.
- fetchGitData already takes an injectable gitFn — the async conversion is a signature change (await each call).
- Existing static tests assert ship.js source markers (fail(blockError), step comments); keep them intact.
</code_context>

<specifics>
## Specifics
- Make git/gh calls async and report preflight failures with their real cause. (phase 15 goal, verbatim)
</specifics>

<deferred>
## Deferred Ideas
- Converting map-codebase.js's sync git calls to async (out of scope).
- Making the async-jobs runtime's spawn-based git/gh calls async (out of scope).
</deferred>


---

*Phase: 15-ship-robustness*
*Context gathered: 2026-08-27*
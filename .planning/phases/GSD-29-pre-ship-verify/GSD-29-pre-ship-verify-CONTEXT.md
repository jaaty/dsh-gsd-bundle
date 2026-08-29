# Phase 29: pre-ship-verify - Context

**Gathered:** 2026-08-29T05:52:12.940Z
**Status:** Ready for planning

<domain>
## Phase Boundary
**In scope:** Add a deterministic pre-ship local verification gate to gsd_ship: before pushing, run a clean `npm ci` + `npm test` in a temp copy of the repo, fail the ship if it fails, and make it skippable via a flag. Implemented as a new lib/preflight-verify.js module (pure helpers + orchestration) wired into the ship execute body between the capability gates and the push, with a dedicated unit test file.
**Out of scope:** Changing the existing capability gates (security/broken_windows/tdd_audit) or their skip_gates array; any other ship behavior (push, PR body, STATE update); running npm publish; changes to the CI workflow (phase 27 already runs npm ci + npm test); making the gate configurable via config.json.
</domain>

<decisions>
## Decisions
### Copy mechanism
- **D-01:** Produce the temp copy by `cp -R` of the working tree, excluding `node_modules` and `.git`, into a fresh `fs.mkdtemp` dir under `os.tmpdir()`. The clean-tree gate has already passed at this point, so the copy equals the committed state. npm ci wipes node_modules anyway; excluding .git keeps the copy light and the tests are pure/static (no git shell-outs).
### Sequence
- **D-02:** Run the pre-ship-verify gate AFTER the capability gates (step 5.5) and BEFORE the push (step 6). The cheap capability gates fail fast first; the expensive npm ci + npm test runs only if the cheap gates pass. Both are before any push/PR I/O.
### Skip flag
- **D-03:** Expose a dedicated boolean tool parameter `skip_verify` on gsd_ship that skips the pre-ship-verify gate only, independent of the capability-gate `skip_gates` array. When true, the gate is reported as skipped and does not block.
### Failure behavior
- **D-04:** On a failing npm ci or npm test, fail the ship via the existing `preflightError(msg, cause)` builder so the message carries the 'gsd_ship preflight failed:' prefix and appends a capped snippet of the npm ci/test stderr (falling back to stdout), with Error.cause set. No silent skip.
### Module structure
- **D-05:** Put the logic in a new `lib/preflight-verify.js` module: a pure `runPreflightVerify(tempDir)` that runs `npm ci` then `npm test` via async execFile and returns `{ status, output }`, plus orchestration helpers (mkdtemp, copy tree, cleanup). ship.js imports and calls it. Add a `test/preflight-verify.test.mjs` unit test file.
### Edge cases
- **D-06:** npm not found, offline/network failure during npm ci, or a failing test all fail the ship with the real cause (no silent skip). The temp dir is removed in a `finally` block even on failure. Skip is flag-only (no config.json gate block).
### Claude's Discretion
- Exact flag name (skip_verify vs skip_preflight) — pick skip_verify.
- Exact helper function names and signatures in lib/preflight-verify.js.
- Exact copy-exclusion implementation (node fs copy with a filter vs cp -R with excludes).
- Exact test assertions in test/preflight-verify.test.mjs.
- Whether/how to surface the gate result in the returned log report.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### The ship tool where the gate slots in
- `lib/ship.js — execute body: numbered preflight steps, capability gates at step 5.5, push at step 6; preflightError(msg, cause) exported here`
### The existing capability-gate module pattern to mirror
- `lib/gates.js — pure evaluators + runCapabilityGates orchestration seam + GATE_NAMES`
- `test/gates-ship.test.mjs — the gate test pattern (pure in-memory data, no real git/fs)`
### The preflightError convention to reuse
- `lib/ship.js — preflightError(msg, cause) builder (prefix + capped stderr snippet + Error.cause)`
- `test/ship-async.test.mjs — the preflightError test pattern`
### npm ci + npm test contract
- `package.json — scripts.test = node --test test/*.test.mjs`
- `package-lock.json — required by npm ci (present)`
- `.github/workflows/ci.yml — the existing npm ci + npm test pattern (phase 27) the gate mirrors locally`
### Requirement text defining the phase goal
- `.planning/REQUIREMENTS.md — SHIP-01: 'gsd_ship runs a deterministic local verification before pushing — a clean npm ci + npm test in a temp copy of the repo — and fails the ship if it fails, skippable via a flag.'`
</canonical_refs>

<code_context>
## Code Context
- ship.js execute body has numbered preflight steps; the new gate slots between step 5.5 (capability gates) and step 6 (push).
- preflightError(msg, cause) is exported from ship.js and used by every preflight gate — the new gate reuses it for failure reporting.
- gates.js is the established pure-module pattern (pure evaluators + an orchestration seam) with a dedicated test file; preflight-verify.js follows it.
- package.json test script is `node --test test/*.test.mjs`; npm ci requires package-lock.json (present at repo root).
- The CI workflow (phase 27) already runs npm ci + npm test — the gate mirrors that locally for a deterministic pre-push check.
- ship.js uses promisify(execFile) for git/gh; the new gate uses the same async execFile pattern for npm ci / npm test.
</code_context>

<specifics>
## Specifics
- Copy mechanism: 'cp -R working tree, exclude node_modules + .git' into a fresh mkdtemp dir.
- Sequence: 'After capability gates, before push'.
- Skip flag: 'Dedicated boolean flag, e.g. skip_verify'.
- Failure behavior: 'preflightError + real cause'.
- Module structure: 'New lib/preflight-verify.js + test file'.
- Edge cases: 'Fail ship on any failure; always clean up temp dir'.
</specifics>

<deferred>
## Deferred Ideas
- Running the same verification in CI — already covered by the phase 27 GitHub Actions workflow.
- Making the gate configurable via a config.json block (flag-only per D-06).
- Running npm publish of @dsh-gsd/bundle — deferred from phase 28.
</deferred>


---

*Phase: 29-pre-ship-verify*
*Context gathered: 2026-08-29*
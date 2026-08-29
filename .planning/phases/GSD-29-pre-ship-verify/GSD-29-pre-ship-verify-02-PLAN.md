---
phase: 29-pre-ship-verify
plan: 02
type: execute
wave: 2
depends_on: ["GSD-29-pre-ship-verify-01"]
files_modified: ["test/preflight-verify.test.mjs"]
autonomous: true
requirements: ["SHIP-01"]
gap_closure: false
user_setup: []
must_haves:
  truths:
    - "npm not found (ENOENT) and offline/network failure during npm ci both fail the ship with the real cause, never silently skipped."
    - "The temp copy directory is removed in a finally block even when npm ci or npm test fails."
    - "npm test passes on a clean checkout with the new test file included."
  artifacts:
    - path: "test/preflight-verify.test.mjs"
      provides: "Expanded edge-case tests: offline/network failure during npm ci, temp-dir cleanup in a finally block on failure, and a full-suite run confirmation."
      min_lines: 100
  key_links:
    - from: "test/preflight-verify.test.mjs"
      to: "lib/preflight-verify.js"
      via: "edge-case tests drive runPreflightVerify with a rejecting fake execFile"
      pattern: "ENOENT"
---
<objective>Harden the pre-ship-verify gate against its edge cases and confirm the whole suite still passes on a clean checkout. Plan 01 delivered the vertical slice; this plan proves the failure paths (npm not found, offline/network failure, temp-dir leak on failure) are deterministic and that the new test file is picked up by the `test/*.test.mjs` glob.</objective>
<context>@test/preflight-verify.test.mjs — the test file created in plan 01; extend it, do not rewrite it.
@lib/preflight-verify.js — runPreflightVerify(tempDir, execFile?) returns { status, step, output }; copyTree/makeTempDir/cleanupTempDir.
@package.json — test script `node --test test/*.test.mjs` (line 8) globs the new test file.</context>
<tasks>
  <task type="auto">
    <name>Task 1: Add edge-case tests to test/preflight-verify.test.mjs</name>
    <files>test/preflight-verify.test.mjs</files>
    <read_first>test/preflight-verify.test.mjs, lib/preflight-verify.js</read_first>
    <action>Extend test/preflight-verify.test.mjs (do not rewrite the existing tests) with a new describe block covering the D-06 edge cases, all using an injected fake execFile so no real npm or network is touched:
- Offline/network failure during npm ci: a fake execFile that rejects on the `npm ci` call with `{ stderr: "npm error code ENOTFOUND registry.npmjs.org" }` → assert `runPreflightVerify` returns `{ status: "fail", step: "npm ci" }` and `output` includes "ENOTFOUND" (the real cause is surfaced, never silently skipped).
- npm not found (ENOENT): a fake that rejects with `{ code: "ENOENT", stderr: "spawn npm ENOENT" }` on the first call → assert `{ status: "fail" }` and `output` includes "ENOENT".
- Temp-dir cleanup on failure: create a real temp dir via `makeTempDir()`, call `runPreflightVerify(tempDir, fakeRejectingExecFile)` inside a `try/finally` where the `finally` calls `cleanupTempDir(tempDir)`; after the run, assert the temp dir no longer exists. This proves the ship.js finally-block contract (D-06) is honored by the cleanup helper even on a failing run.
- A fake that resolves on `npm ci` but rejects on `npm test` with a stderr → assert `{ status: "fail", step: "npm test" }` and the stderr is in `output` (guards the ordering: npm test only runs after npm ci succeeds).
Use `t.after`/`finally` to remove any temp dirs created so the suite stays self-cleaning.</action>
    <verify>node --test test/preflight-verify.test.mjs</verify>
    <acceptance_criteria>
      - `node --test test/preflight-verify.test.mjs` passes (exit 0)
      - `grep -c "ENOTFOUND" test/preflight-verify.test.mjs` exits 0 (offline/network edge covered)
      - `grep -c "ENOENT" test/preflight-verify.test.mjs` exits 0 (npm-not-found edge covered)
      - `grep -c "cleanupTempDir" test/preflight-verify.test.mjs` exits 0 (finally-cleanup edge covered)
    </acceptance_criteria>
    <done>test/preflight-verify.test.mjs covers the offline/network, npm-not-found, npm-test-failure-ordering, and temp-dir-cleanup-on-failure edge cases, and still passes.</done>
  </task>
  <task type="auto">
    <name>Task 2: Confirm the full suite passes on a clean checkout</name>
    <files>test/preflight-verify.test.mjs</files>
    <read_first>package.json</read_first>
    <action>Run the full test suite exactly as CI does: `npm test` (which runs `node --test test/*.test.mjs`). Confirm the new test/preflight-verify.test.mjs file is picked up by the glob and that the entire suite passes. If any existing test fails because of the new skip_verify parameter or the new gate wiring, fix the test or the wiring so the whole suite is green — do not weaken an existing assertion. Do not modify the CI workflow (out of scope).</action>
    <verify>npm test</verify>
    <acceptance_criteria>
      - `npm test` exits 0
      - the output of `npm test` includes a passing run of `test/preflight-verify.test.mjs`
    </acceptance_criteria>
    <done>The full `npm test` suite passes on the current checkout, including the new preflight-verify test file, with no regressions.</done>
  </task>
</tasks>

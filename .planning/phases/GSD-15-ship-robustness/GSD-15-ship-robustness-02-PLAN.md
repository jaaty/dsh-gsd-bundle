---
phase: 15-ship-robustness
plan: 02
type: execute
wave: 2
depends_on: ["GSD-15-ship-robustness-01"]
files_modified: ["test/ship-async.test.mjs", "test/gates.test.mjs"]
autonomous: true
requirements: ["CQ-05"]
gap_closure: false
user_setup: []
must_haves:
  truths:
    - "npm test passes including the new async/real-cause tests"
    - "preflightError(msg, cause) is unit-tested: prefix, stderr snippet, and Error.cause"
    - "fetchGitData works with an async gitFn (returning Promises) alongside the existing sync fakeGitFn"
  artifacts:
    - path: "test/ship-async.test.mjs"
      provides: "unit tests for preflightError (prefix + snippet + cause) and static checks that ship.js is async (no execFileSync, promisify present, every git/gh/gitOk call awaited)"
      min_lines: 60
      exports: []
    - path: "test/gates.test.mjs"
      provides: "an appended fetchGitData test proving an async gitFn (returning Promises) works under await"
      min_lines: 388
      exports: []
  key_links:
    - from: "test/ship-async.test.mjs"
      to: "lib/ship.js"
      via: "imports preflightError and reads ship.js source for the static async checks"
      pattern: "preflightError"
---
<objective>
Add automated coverage for the async conversion and real-cause reporting introduced in plan 01: a new test file unit-testing the exported preflightError builder and statically asserting ship.js is fully async, plus an appended fetchGitData test proving an async gitFn works under await. All existing tests (service-tools preflight, gates fetchGitData sync fake, static wiring) must stay green (D-06).
</objective>
<context>
@lib/ship.js — exports preflightError(msg, cause); async run/git/gitOk/gh helpers.
@lib/gates.js — fetchGitData awaits its injectable gitFn.
@test/gates.test.mjs — fetchGitData describe block (lines 297-354) with the sync fakeGitFn; append the async-gitFn test inside this block.
@test/ship.test.mjs — existing static regression style (node --test + node:assert/strict, readFile of lib sources) to mirror.
</context>
<tasks>
  <task type="auto">
    <name>Task 1: Create test/ship-async.test.mjs covering preflightError and the async conversion</name>
    <files>test/ship-async.test.mjs</files>
    <read_first>lib/ship.js, test/ship.test.mjs</read_first>
    <action>
      Create a new file test/ship-async.test.mjs using node:test + node:assert/strict (mirror the style of test/ship.test.mjs). Import `preflightError` from `../lib/ship.js` and `readFile` from `node:fs/promises`.

      Add a describe block "preflightError" with these tests:
      - `preflightError("boom", { stderr: "  error: src refspec does not match\n" })` throws an Error whose message starts with `gsd_ship preflight failed: boom`, contains the trimmed snippet `error: src refspec does not match` (no leading whitespace), and whose `.cause` deep-equals the passed cause object.
      - `preflightError("boom", { stdout: "some stdout" })` (no stderr) appends the stdout snippet.
      - `preflightError("boom")` (no cause) throws an Error whose message is exactly `gsd_ship preflight failed: boom` with no snippet and no `.cause` property.
      - a long stderr string (> 500 chars) is capped so the message length stays bounded (assert the message length is less than the raw stderr length).

      Add a describe block "ship.js async conversion (static)" that reads lib/ship.js source and asserts:
      - `execFileSync` is absent (`assert.doesNotMatch(src, /execFileSync/)`).
      - `promisify(execFile)` is present.
      - every `git(`/`gh(`/`gitOk(` call site is preceded by `await` — assert that no bare call site matches `/(?<!await )\b(git|gh|gitOk)\(/`.
      - `await fetchGitData(cwd, git, defaultBranch)` is present.
      - `export { name, inject, apply, preflightError }` is present.
    </action>
    <verify>node --test test/ship-async.test.mjs must pass.</verify>
    <acceptance_criteria>
      - `node --test test/ship-async.test.mjs` exits 0
      - `grep -c "preflightError" test/ship-async.test.mjs` >= 4
      - `grep -c "execFileSync" test/ship-async.test.mjs` >= 1 (the literal appears inside the test's `assert.doesNotMatch(src, /execFileSync/)` regex; the real absence check is the doesNotMatch assertion against the ship.js source, which the passing test run proves)
    </acceptance_criteria>
    <done>test/ship-async.test.mjs exists and passes, unit-testing preflightError and statically proving ship.js is fully async.</done>
  </task>

  <task type="auto">
    <name>Task 2: Append an async-gitFn test to the fetchGitData block in gates.test.mjs</name>
    <files>test/gates.test.mjs</files>
    <read_first>test/gates.test.mjs</read_first>
    <action>
      Inside the existing `describe("fetchGitData", ...)` block in test/gates.test.mjs (after the "explicit base is used" test, around line 353), append a new test `"works with an async gitFn returning Promises"`. It defines an async fake gitFn that returns `Promise.resolve(...)` for the symbolic-ref / merge-base / diff / log calls (reuse the same canned values as the existing sync fakeGitFn: "origin/main", "abc123", "src/a.js\nb/.env", "test(08-01): a\nfeat(08-01): b"), calls `await fetchGitData(dir, asyncGitFn, undefined)` with `dir = process.cwd()`, and asserts `res.changedFiles` deep-equals `["src/a.js", "b/.env"]` and `res.commitSubjects` deep-equals `["test(08-01): a", "feat(08-01): b"]`. This proves the awaited gitFn path works for async fns while the existing sync fakeGitFn tests stay green (D-06).
    </action>
    <verify>node --test test/gates.test.mjs must pass.</verify>
    <acceptance_criteria>
      - `node --test test/gates.test.mjs` exits 0
      - `grep -c "works with an async gitFn returning Promises" test/gates.test.mjs` exits 0 (asserts the new test exists — grep exits 0 on a match)
      - `grep -c "Promise.resolve" test/gates.test.mjs` >= 1
    </acceptance_criteria>
    <done>gates.test.mjs includes an async-gitFn fetchGitData test and the full file passes.</done>
  </task>
</tasks>

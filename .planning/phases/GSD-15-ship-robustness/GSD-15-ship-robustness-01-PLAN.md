---
phase: 15-ship-robustness
plan: 01
type: execute
wave: 1
depends_on: []
files_modified: ["lib/ship.js", "lib/gates.js"]
autonomous: true
requirements: ["CQ-05"]
gap_closure: false
user_setup: []
must_haves:
  truths:
    - "gsd_ship preflight failures still throw with the exact 'gsd_ship preflight failed:' prefix (service-tools.test.mjs stays green)"
    - "lib/ship.js contains no execFileSync and uses promisify(execFile) for git/gh"
    - "every git(/gh(/gitOk( call site in lib/ship.js is preceded by await"
    - "preflight failures from git/gh carry Error.cause and a trimmed stderr/stdout snippet in the message"
  artifacts:
    - path: "lib/ship.js"
      provides: "async run/git/gitOk/gh helpers, fail(msg, cause?) helper, exported preflightError(msg, cause?) real-cause builder"
      min_lines: 190
      exports: ["preflightError"]
    - path: "lib/gates.js"
      provides: "fetchGitData awaits its injectable gitFn so the async git helper passed from ship.js works"
      min_lines: 250
      exports: ["fetchGitData"]
  key_links:
    - from: "lib/ship.js"
      to: "lib/gates.js"
      via: "ship.js passes the async git helper and awaits fetchGitData; fetchGitData awaits each gitFn call"
      pattern: "await fetchGitData\\(cwd, git, defaultBranch\\)"
---
<objective>
Convert lib/ship.js's git/gh calls from execFileSync to async (util.promisify(execFile)) and report preflight failures with their real cause (underlying stderr/stdout snippet in the message + Error.cause), while preserving the 'gsd_ship preflight failed:' prefix and all static-wiring source markers. This is the tracer plan: it spans the coupled ship.js/gates.js boundary in one end-to-end slice so the async git helper passed into fetchGitData never runs against a non-awaiting consumer.
</objective>
<context>
@lib/ship.js — the file being refactored; sync run/git/gitOk/gh helpers (lines 20-31), fail helper (line 55), git/gh call sites (steps 2-10), export line 191.
@lib/gates.js — fetchGitData (lines 228-251) whose injectable gitFn becomes awaited/async.
@test/service-tools.test.mjs — gsd_ship preflight test (lines 214-226) asserting /gsd_ship preflight failed:/.
@test/gates.test.mjs — fetchGitData tests (lines 297-354) with a sync fake gitFn; static wiring test (lines 356-384).
@test/gates-ship.test.mjs — static wiring tests (lines 123-145) checking fail(blockError), step markers.
</context>
<tasks>
  <task type="auto">
    <name>Task 1: Convert run/git/gitOk/gh to async via promisify(execFile) and await every call site in ship.js</name>
    <files>lib/ship.js</files>
    <read_first>lib/ship.js</read_first>
    <action>
      In lib/ship.js, change the import on line 11 from `import { execFileSync } from "node:child_process";` to `import { execFile } from "node:child_process";` and add `import { promisify } from "node:util";` on a new line. Add a module-level `const execFileP = promisify(execFile);` just above the helper block.

      Convert the four module-local closures (lines 20-31) to async:
      - `async function run(cwd, cmd, args)` returns `(await execFileP(cmd, args, { cwd, encoding: "utf8" })).stdout.trim()`.
      - `async function git(cwd, args)` returns `await run(cwd, "git", args)`.
      - `async function gitOk(cwd, args)` wraps `await run(cwd, "git", args)` in try/catch and returns `""` on failure (D-04: still swallows failures).
      - `async function gh(cwd, args)` returns `await run(cwd, "gh", args)`.

      Await every git/gh/gitOk call site inside apply() (per D-01). The exact sites and their new forms:
      - line 64 `const status = gitOk(...)` -> `const status = await gitOk(...)`
      - line 68 `const branch = gitOk(...)` -> `const branch = await gitOk(...)`
      - line 69 `gitOk(...)` (defaultBranch) -> `(await gitOk(cwd, ["symbolic-ref", "refs/remotes/origin/HEAD", "--short"])).replace(/^origin\//, "")` — the parenthesized form is REQUIRED here because this is the only call site with method chaining: `args.base || await gitOk(...).replace(...) || "main"` would parse as `await (gitOk(...).replace(...))`, invoking `.replace` on the Promise and throwing `TypeError: gitOk(...).replace is not a function`. Wrapping the awaited call in parens before `.replace` is mandatory.
      - line 76 `if (!gitOk(...))` -> `if (!(await gitOk(...)))`
      - line 79 `try { gh(...) } catch` -> `try { await gh(...) } catch`
      - line 92 `fetchGitData(cwd, git, defaultBranch)` -> `await fetchGitData(cwd, git, defaultBranch)`
      - line 98 `try { git(...) } catch (e)` -> `await git(...)` inside the try
      - line 149 `prUrl = gh(cwd, prArgs)` -> `prUrl = await gh(cwd, prArgs)`
      - line 168 `git(cwd, ["add", ...])` -> `await git(...)`
      - line 171 `const staged = git(...)` -> `const staged = await git(...)`
      - line 174 `git(cwd, ["commit", ...])` -> `await git(...)`
      - line 175 `git(cwd, ["push", ...])` -> `await git(...)`

      Do NOT change the static-wiring markers: keep the `6. push branch` comment, the `## Gate Report` string, the full-cfg `runCapabilityGates({` call, and the `if (blockError) fail(blockError)` line textually intact (D-06). Do not touch the fail helper yet (Task 3).
    </action>
    <verify>grep -n "execFileSync" lib/ship.js must return nothing; grep -n "promisify(execFile)" lib/ship.js must match; rg -n "(?<!await )\b(git|gh|gitOk)\(" lib/ship.js | grep -v "function " must return no bare call sites (every git/gh/gitOk call is preceded by await; the `function git(`/`function gitOk(`/`function gh(` definition lines are excluded by the `grep -v "function "` filter).</verify>
    <acceptance_criteria>
      - `grep -c "execFileSync" lib/ship.js` exits 1 (no match)
      - `grep -c "promisify(execFile)" lib/ship.js` exits 0 (match)
      - `rg -n "(?<!await )\b(git|gh|gitOk)\(" lib/ship.js | grep -v "function "` returns no lines (ripgrep supports the lookbehind; GNU grep -E does not; the `grep -v "function "` filter drops the three `async function git/gitOk/gh(...)` definition lines so only bare call sites are checked)
      - `grep -c "await fetchGitData(cwd, git, defaultBranch)" lib/ship.js` exits 0
      - `grep -c "(await gitOk(cwd, \[\"symbolic-ref\", \"refs/remotes/origin/HEAD\", \"--short\"\]))" lib/ship.js` exits 0 (the defaultBranch call site is parenthesized before `.replace`, so the precedence bug cannot silently pass the static greps)
    </acceptance_criteria>
    <done>All four helpers are async, every git/gh/gitOk call site is awaited, and no execFileSync remains in ship.js.</done>
  </task>

  <task type="auto">
    <name>Task 2: Make fetchGitData await its injectable gitFn</name>
    <files>lib/gates.js</files>
    <read_first>lib/gates.js</read_first>
    <action>
      In lib/gates.js, fetchGitData (lines 228-251) is already async. Convert its four injectable gitFn call sites to awaited form (per D-02). The `.trim()` / `.split()` / `.replace()` chaining on the returned string is unchanged:
      - line 232 `const ref = gitFn(cwd, [...])` -> `const ref = await gitFn(cwd, [...])`
      - line 235 `const mergeBase = gitFn(cwd, [...])` -> `const mergeBase = await gitFn(cwd, [...])`
      - line 237 `gitFn(cwd, ["diff", ...])` -> `await gitFn(cwd, ["diff", ...])`
      - line 248 `gitFn(cwd, ["log", ...])` -> `await gitFn(cwd, ["log", ...])`

      `await` on a non-Promise value returns the value unchanged, so the existing sync fakeGitFn in gates.test.mjs keeps working (D-06). Do not change runCapabilityGates or any gate evaluator — only fetchGitData's gitFn calls become awaited.
    </action>
    <verify>rg -n "(?<!await )gitFn\(" lib/gates.js | grep -v "function fetchGitData" must return no bare gitFn call sites (the `fetchGitData(cwd, gitFn, base)` signature line is excluded by the `grep -v "function fetchGitData"` filter).</verify>
    <acceptance_criteria>
      - `rg -n "(?<!await )gitFn\(" lib/gates.js | grep -v "function fetchGitData"` returns no lines (ripgrep supports the lookbehind; GNU grep -E does not; the `grep -v "function fetchGitData"` filter drops the `fetchGitData(cwd, gitFn, base)` signature line so only bare call sites are checked)
      - `grep -c "await gitFn(" lib/gates.js` equals 4
    </acceptance_criteria>
    <done>fetchGitData awaits all four gitFn calls, so the async git helper passed from ship.js resolves to strings.</done>
  </task>

  <task type="auto">
    <name>Task 3: Add preflightError(msg, cause?) builder + fail(msg, cause?) helper and wire real-cause reporting</name>
    <files>lib/ship.js</files>
    <read_first>lib/ship.js</read_first>
    <action>
      Add a module-level exported function `preflightError(msg, cause)` in lib/ship.js (per D-03, D-05). It returns an Error whose message starts with the exact prefix `gsd_ship preflight failed: ` followed by msg; when cause is truthy it appends a trimmed/capped snippet of `cause.stderr || cause.stdout` (trim whitespace, cap at ~500 chars) on a new line, and sets the `{ cause }` option on the Error constructor. When cause is falsy, no snippet is appended and no cause is set.

      Change the fail closure (line 55) from `const fail = (m) => { throw new Error(\`gsd_ship preflight failed: ${m}\`); };` to `const fail = (m, cause) => { throw preflightError(m, cause); };`.

      Wire real-cause reporting at the git/gh failure sites (per D-05 — git/gh failure paths pass the cause, other preflight gates pass none):
      - line 79 gh auth catch: `catch (e) { fail("gh CLI not available or not authenticated (run `gh auth login`)", e); }`
      - line 98-99 git push catch: `catch (e) { fail(\`git push failed: ${e.message}\`, e); }`
      - line 150-151 gh pr create catch: `catch (e) { fail(\`gh pr create failed: ${e.message}\`, e); }`
      - line 177-178 completion commit/push catch: `catch (e) { fail(\`git commit/push of completion state failed: ${e.message}\`, e); }`

      Leave all other fail() calls (verification, clean tree, branch, remote, skip-gate, and `fail(blockError)` on line 95) with no second argument — they pass no cause (D-05). The `fail(blockError)` and `if (blockError) fail(blockError)` markers must remain textually intact (D-06).

      Add `preflightError` to the export list on line 191: `export { name, inject, apply, preflightError };`.
    </action>
    <verify>grep -n "preflightError" lib/ship.js must match the definition, the fail closure, and the export line; grep -n "fail(blockError)" lib/ship.js must still match; grep -n "gsd_ship preflight failed:" lib/ship.js must match.</verify>
    <acceptance_criteria>
      - `grep -c "export { name, inject, apply, preflightError }" lib/ship.js` exits 0
      - `grep -c "fail(blockError)" lib/ship.js` exits 0 (marker preserved)
      - `grep -c "if (blockError) fail(blockError)" lib/ship.js` exits 0
      - `grep -c "gsd_ship preflight failed:" lib/ship.js` exits 0
      - `grep -c "cause" lib/ship.js` >= 4 (the four git/gh failure sites pass cause)
    </acceptance_criteria>
    <done>preflightError is exported and used by fail; git/gh failure paths pass the real cause; all static markers preserved.</done>
  </task>
</tasks>

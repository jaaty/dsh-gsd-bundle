---
phase: 29-pre-ship-verify
plan: 01
type: execute
wave: 1
depends_on: []
files_modified: ["lib/preflight-verify.js", "lib/ship.js", "test/preflight-verify.test.mjs"]
autonomous: true
requirements: ["SHIP-01"]
gap_closure: false
user_setup: []
must_haves:
  truths:
    - "gsd_ship runs npm ci then npm test in a temp copy of the repo before pushing, between the capability-gate block and the push step."
    - "A failing npm ci or npm test fails the ship with a 'gsd_ship preflight failed:' message carrying the real cause."
    - "skip_verify=true skips the pre-ship-verify gate and does not block the ship."
    - "The temp copy directory is removed even when the gate fails."
  artifacts:
    - path: "lib/preflight-verify.js"
      provides: "Pure pre-ship verification module: runPreflightVerify (npm ci then npm test orchestration with an injectable execFile), copyTree (fs.cp excluding node_modules/.git), makeTempDir, cleanupTempDir."
      min_lines: 60
      exports: ["runPreflightVerify", "copyTree", "makeTempDir", "cleanupTempDir"]
    - path: "test/preflight-verify.test.mjs"
      provides: "Unit tests for the module (injected fake execFile) plus static wiring assertions on lib/ship.js."
      min_lines: 80
  key_links:
    - from: "lib/ship.js"
      to: "lib/preflight-verify.js"
      via: "imports runPreflightVerify/copyTree/makeTempDir/cleanupTempDir and calls the gate between the capability-gate block and the push step"
      pattern: "pre-ship-verify"
    - from: "test/preflight-verify.test.mjs"
      to: "lib/preflight-verify.js"
      via: "imports and tests the module"
      pattern: "from \"../lib/preflight-verify.js\""
---
<objective>Deliver the full vertical slice of the pre-ship-verify gate: a new pure lib/preflight-verify.js module (runPreflightVerify + copyTree + makeTempDir + cleanupTempDir), its wiring into the gsd_ship execute body between the capability gates and the push, and a test file proving the module and the wiring. This is the tracer — the thinnest end-to-end slice that makes SHIP-01 real and verified.</objective>
<context>@lib/ship.js — execute body: capability gates end at `if (blockError) fail(blockError);` (line 118), push starts at `// ── 6. push branch` (line 120); preflightError(msg, cause) exported; `const fail = (m, cause) => { throw preflightError(m, cause); };` at line 78; parameters block at lines 62-67; imports at lines 11-17.
@lib/gates.js — the pure-module pattern to mirror: pure evaluators + an orchestration seam with injectable I/O (fetchGitData(cwd, gitFn, base) at line 241).
@test/gates-ship.test.mjs — the static-wiring test pattern (lines 123-145) that asserts the gate section sits before the push marker.
@test/ship-async.test.mjs — the preflightError test pattern (lines 19-47) and the static ship.js assertions (lines 49-61).
@package.json — test script `node --test test/*.test.mjs` (line 8); package-lock.json present at repo root (required by npm ci).</context>
<tasks>
  <task type="auto">
    <name>Task 1: Create lib/preflight-verify.js</name>
    <files>lib/preflight-verify.js</files>
    <read_first>lib/gates.js, lib/ship.js</read_first>
    <action>Create a new ESM module lib/preflight-verify.js (mirroring the pure-module style of lib/gates.js). Import from node builtins only: `import { execFile } from "node:child_process"; import { promisify } from "node:util"; import { mkdtemp, cp, rm } from "node:fs/promises"; import os from "node:os"; import path from "node:path";`. Define and export four functions:
- `runPreflightVerify(tempDir, execFile = promisify(execFile))` — the pure orchestration seam. It runs `npm ci` then `npm test` in order via the injected execFile with `{ cwd: tempDir, encoding: "utf8" }`. On success of both it returns `{ status: "pass", step: null, output: "" }`. If `npm ci` rejects, return `{ status: "fail", step: "npm ci", output: String(err.stderr || err.stdout || "").trim() }`. If `npm ci` succeeds but `npm test` rejects, return `{ status: "fail", step: "npm test", output: String(err.stderr || err.stdout || "").trim() }`. Never throw — always return the structured object so the caller (ship.js) decides how to fail. This mirrors runCapabilityGates in lib/gates.js: pure, deterministic, I/O only through the injected execFile.
- `copyTree(src, dest)` — copy the working tree into the temp dir using `cp(src, dest, { recursive: true, filter })` where the filter returns false for any source path whose basename is `node_modules` or `.git` (per D-01). The filter receives the source path; use a regex like `!/node_modules$/.test(s) && !/\.git$/.test(s)`.
- `makeTempDir()` — `return mkdtemp(path.join(os.tmpdir(), "gsd-preflight-"))`.
- `cleanupTempDir(dir)` — `return rm(dir, { recursive: true, force: true })`.
Export all four: `export { runPreflightVerify, copyTree, makeTempDir, cleanupTempDir };`. Do not add any external dependency.</action>
    <verify>node --input-type=module -e "import('./lib/preflight-verify.js').then(m => { if (!m.runPreflightVerify || !m.copyTree || !m.makeTempDir || !m.cleanupTempDir) process.exit(1); console.log('exports ok'); })"</verify>
    <acceptance_criteria>
      - `grep -c "export { runPreflightVerify, copyTree, makeTempDir, cleanupTempDir }" lib/preflight-verify.js` exits 0
      - `grep -c "npm ci" lib/preflight-verify.js` and `grep -c "npm test" lib/preflight-verify.js` both exit 0
      - `grep -c "node_modules" lib/preflight-verify.js` and `grep -c "\.git" lib/preflight-verify.js` both exit 0 (copy filter excludes both)
      - `grep -c "mkdtemp" lib/preflight-verify.js` and `grep -c "os.tmpdir" lib/preflight-verify.js` both exit 0
      - the verify command prints "exports ok" and exits 0
    </acceptance_criteria>
    <done>lib/preflight-verify.js exists, exports all four functions, uses only node builtins, and the module imports cleanly.</done>
  </task>
  <task type="auto">
    <name>Task 2: Wire the gate into lib/ship.js</name>
    <files>lib/ship.js</files>
    <read_first>lib/ship.js</read_first>
    <action>Edit lib/ship.js to add the pre-ship-verify gate between the capability-gate block and the push step (per D-02), and the skip_verify parameter (per D-03).
1. Add to the imports (after line 16, the gates import): `import { runPreflightVerify, copyTree, makeTempDir, cleanupTempDir } from "./preflight-verify.js";`.
2. Add to the tool parameters object (after the `skip_gates` entry at line 66): `skip_verify: { type: "boolean", description: "Skip the pre-ship-verify gate (npm ci + npm test in a temp copy) for this run (D-03)." },`.
3. Insert the gate block immediately after the line `if (blockError) fail(blockError);` (line 118) and before the `// ── 6. push branch` comment (line 120). The block must:
   - If `args.skip_verify` is truthy, push the report line `pre-ship-verify: skipped` to the `log` array and do nothing else (D-03: skip is flag-only, independent of skip_gates).
   - Otherwise: declare `let tempDir;` then in a `try` block: `tempDir = await makeTempDir(); await copyTree(cwd, tempDir); const res = await runPreflightVerify(tempDir);` — if `res.status === "fail"`, call `fail(\`pre-ship-verify failed: ${res.step}\`, { stderr: res.output })` (reusing the existing `fail` helper which throws preflightError, per D-04); otherwise push the report line `pre-ship-verify: pass` to `log`. In a `finally` block, `if (tempDir) await cleanupTempDir(tempDir);` so the temp dir is always removed even on failure (D-06).
   - Use the async execFile pattern (await every call) — no execFileSync, no bare git/gh calls (mirrors test/ship-async.test.mjs:50-55).
Do not modify the capability gates, the skip_gates array, the push step, or any other ship behavior.</action>
    <verify>node --test test/ship-async.test.mjs</verify>
    <acceptance_criteria>
      - `grep -c "skip_verify" lib/ship.js` exits 0
      - `grep -c "pre-ship-verify" lib/ship.js` exits 0
      - `grep -c "runPreflightVerify" lib/ship.js` exits 0
      - `grep -c "cleanupTempDir" lib/ship.js` exits 0
      - the index of `pre-ship-verify` in lib/ship.js is less than the index of `6. push branch` (gate runs before push)
      - `node --test test/ship-async.test.mjs` passes (exit 0)
    </acceptance_criteria>
    <done>lib/ship.js imports the module, exposes skip_verify, and runs the gate between the capability gates and the push, failing via preflightError and cleaning up the temp dir in a finally block.</done>
  </task>
  <task type="auto">
    <name>Task 3: Create test/preflight-verify.test.mjs</name>
    <files>test/preflight-verify.test.mjs</files>
    <read_first>test/gates-ship.test.mjs, test/ship-async.test.mjs, lib/preflight-verify.js</read_first>
    <action>Create test/preflight-verify.test.mjs using `node:test` + `node:assert/strict` (style mirrors test/gates-ship.test.mjs and test/ship-async.test.mjs). Import `{ runPreflightVerify, copyTree, makeTempDir, cleanupTempDir }` from `../lib/preflight-verify.js`, and `{ readFile }` from `node:fs/promises` for the static ship.js assertions. Cover:
- runPreflightVerify with an injected fake execFile (never run real npm):
  - a fake that resolves for both `npm ci` and `npm test` → result `{ status: "pass" }`; assert the fake was called with `npm ci` first then `npm test`, each with `{ cwd: tempDir, encoding: "utf8" }`.
  - a fake that rejects on the `npm ci` call → result `{ status: "fail", step: "npm ci" }` with the stderr in `output`.
  - a fake that resolves on `npm ci` but rejects on `npm test` → result `{ status: "fail", step: "npm test" }`.
  - a fake that rejects with `{ code: "ENOENT", stderr: "npm: not found" }` on the first call → result `{ status: "fail" }` and `output` includes "not found" (npm-not-found edge, D-06).
- copyTree excludes node_modules and .git: create a real fixture under `await makeTempDir()` with a file `a.txt`, a `node_modules/` dir, and a `.git/` dir; `await copyTree(fixture, dest)` into a second mkdtemp dir; assert `a.txt` exists in dest, `node_modules` and `.git` do not; clean both dirs in a `t.after`/`finally`.
- cleanupTempDir removes the dir: create a mkdtemp dir, `await cleanupTempDir(dir)`, assert it no longer exists.
- Static wiring assertions on lib/ship.js (mirror test/gates-ship.test.mjs:123-145): read the source with `readFile(new URL("../lib/ship.js", import.meta.url), "utf8")` and assert `skip_verify` appears in the parameters, `pre-ship-verify` appears textually before the `6. push branch` marker, and `runPreflightVerify` is imported and called.
Use `t.after` or `finally` to remove any temp dirs the tests create so the suite is self-cleaning.</action>
    <verify>node --test test/preflight-verify.test.mjs</verify>
    <acceptance_criteria>
      - `node --test test/preflight-verify.test.mjs` passes (exit 0)
      - `grep -c "runPreflightVerify" test/preflight-verify.test.mjs` exits 0
      - `grep -c "copyTree" test/preflight-verify.test.mjs` exits 0
      - `grep -c "ENOENT" test/preflight-verify.test.mjs` exits 0
      - `grep -c "6. push branch" test/preflight-verify.test.mjs` exits 0 (static wiring assertion present)
    </acceptance_criteria>
    <done>test/preflight-verify.test.mjs exists, covers the module's branches with an injected fake execFile, proves copy/cleanup against a real temp dir, and statically asserts the ship.js wiring.</done>
  </task>
</tasks>

---
phase: 50-add-tests
plan: 02
type: execute
wave: 2
depends_on: ["GSD-50-add-tests-01"]
files_modified:
  - test/add-tests.test.mjs
autonomous: true
requirements: ["GAP-16"]
gap_closure: false
user_setup: []
must_haves:
  truths:
    - "resolveWriterOutput returns null for malformed/missing tests_written or an invalid status, and the tool then degrades instead of writing."
    - "The tool's tool behaviour is verified with a fake subagents factory (controllable structured output) and a fake gitFn (assertable commit message), so no real subagent or repository is needed."
    - "The suite proves gsd_add_tests is advisory: after a full run the STATE loop position (setActivePhase/completePhase) is never called and STATE stays at the pre-call position."
  artifacts:
    - path: "test/add-tests.test.mjs"
      provides: "Offline node:test coverage of the gsd_add_tests tool: capability descriptor, /gsd-add-tests command pairing, phase-not-executed fail-fast, deterministic SUMMARY key-files extraction, classification gate (no --proceed/--auto), writer dispatch via fake subagents, resolveWriterOutput validation, validateTestPaths hard boundary, atomic commit message, advisory no-STATE-mutation, degrade-with-flag on writer failure, and no-fix bug reporting."
      min_lines: 380
      exports: []
  key_links:
    - from: "test/add-tests.test.mjs"
      to: "lib/add-tests.js"
      via: "imports name, and the pure helpers extractChangedFiles/TEST_WRITER_SCHEMA/resolveWriterOutput/buildATestBody; drives the tool execute via ctx.tools list + fake gitFn"
      pattern: "resolveWriterOutput"
    - from: "test/add-tests.test.mjs"
      to: "test/helpers/mount-harness.mjs"
      via: "makeMountCtx/mountSubset/applySubset/CWD for a real plugin mount of the gsd-add-tests PATCH_ROWS row and ctx.tools registration"
      pattern: "makeMountCtx"
    - from: "test/add-tests.test.mjs"
      to: "lib/_git-artifacts.js"
      via: "makeFakeGit records commitSourceFiles argv so the test asserts the message equals 'test(phase-{N}): add unit and E2E tests from add-tests command'"
      pattern: "commitSourceFiles"
    - from: "test/add-tests.test.mjs"
      to: "lib/validate-phase.js"
      via: "path-boundary test asserts validateTestPaths skips absolute / '..' / impl / empty paths that the fake writer returns"
      pattern: "validateTestPaths"
---
<objective>
Land the offline unit + behaviour test suite for the gsd_add_tests tool in a single file, test/add-tests.test.mjs, proving every behaviour in D-12: capability descriptor registration, /gsd-add-tests command pairing, phase-not-executed fail-fast, deterministic SUMMARY key-files extraction, the classification gate (no spawn/write before --proceed/--auto), writer dispatch + resolveWriterOutput validation, the validateTestPaths hard boundary, the atomic commit message, advisory no-STATE-mutation, degrade-with-flag on writer failure, and no-fix bug reporting. It runs under the existing `node --test test/*.test.mjs` script with no new dependencies and no real subagent.
</objective>
<context>
@.planning/phases/GSD-50-add-tests/GSD-50-add-tests-01-PLAN.md
@test/validate-phase.test.mjs
@test/autonomous.test.mjs
@test/_capabilities.test.mjs
@test/helpers/mount-harness.mjs
@lib/add-tests.js
@lib/validate-phase.js
@lib/_capabilities.js
@lib/commands.js
</context>
<tasks>
  <task type="auto">
    <name>Task 1: Pure-helper + capability + command tests</name>
    <files>test/add-tests.test.mjs</files>
    <read_first>test/_capabilities.test.mjs, lib/add-tests.js, lib/validate-phase.js, lib/_capabilities.js, lib/commands.js</read_first>
    <action>
Create test/add-tests.test.mjs. Use the ESM node:test + node:assert conventions of the repo, mirroring test/validate-phase.test.mjs and test/_capabilities.test.mjs. Add the import header: import { test, describe } from "node:test"; import assert from "node:assert"; import { validateTestPaths, detectTestInfra } from "../lib/validate-phase.js"; import { CAPABILITY_KEYS, allCapabilities } from "../lib/_capabilities.js"; import { extractChangedFiles, TEST_WRITER_SCHEMA, resolveWriterOutput, buildATestBody } from "../lib/add-tests.js"; (and, if the tool exposes a way to enumerate the registered command, the COMMANDS from lib/commands.js).

Write describe block "gsdAddTests capability descriptor (D-01)":
- assert CAPABILITY_KEYS includes "gsdAddTests".
- const cap = allCapabilities().find(c=>c.key==="gsdAddTests"); assert cap exists; assert.equal(cap.role, "out-of-band") (assert.deepEqual includes out-of-band); assert.equal(cap.order, NOT_LOOP_ORDERED) — import NOT_LOOP_ORDERED from lib/_capabilities.js; assert.deepEqual(cap.tools, ["gsd_add_tests"]); assert.deepEqual(cap.commands, ["gsd-add-tests"]); assert.deepEqual(cap.produces, ["<NN>-ATEST.md","TEST files"]); assert.deepEqual(cap.consumes, ["SUMMARY.md","CONTEXT.md","VERIFICATION.md"]).

Write describe block "/gsd-add-tests command pairing (D-01)":
- import { COMMANDS } from "../lib/commands.js" IF it is exported (check; if COMMANDS is module-private, instead assert via allCapabilities() that gsdAddTests.commands contains "gsd-add-tests", which is the source the commandToCapability pairing iterates). Prefer the allCapabilities route to avoid needing COMMANDS exported.

Write describe block "extractChangedFiles — deterministic SUMMARY key-files (D-05)":
- fixture SUMMARY bodies: one with frontmatter `---\nkey-files:\n  created: [lib/a.js, test/a.test.mjs]\n  modified: [lib/a.js, lib/b.js]\n---\nbody` and one with `key_files: created: [test/c.test.mjs]`. assert extractChangedFiles([one, two], {filter:true}) deep-equals the deduped, filtered set ["lib/a.js","test/a.test.mjs","lib/b.js","test/c.test.mjs"] (order preserved, lib/a.js deduped).
- assert extractChangedFiles([], {filter:true}) deep-equals [].
- assert a path like ".planning/STATE.md" or "ROADMAP.md" is filtered out by filterSourcePaths within extractChangedFiles (pass a body whose key-files include "ROADMAP.md" and assert it is absent from the result).

Write describe block "resolveWriterOutput validation (D-06)":
- assert resolveWriterOutput({ tests_written:[{path:"test/a.test.mjs", req_id:"GAP-16", content:"x", type:"Unit"}], status:"GENERATED" }) is truthy and carries the entry.
- assert resolveWriterOutput(null) deep-equals null; resolveWriterOutput({}) deep-equals null; resolveWriterOutput({ tests_written:"nope", status:"GENERATED" }) deep-equals null; resolveWriterOutput({ tests_written:[{path:123, req_id:1, content:{}}], status:"GENERATED" }) deep-equals null; resolveWriterOutput({ tests_written:[], status:"NOT_A_STATUS" }) deep-equals null.
- assert the three accepted statuses GENERATED/PARTIAL/ESCALATE each validate; any other status yields null.

Write describe block "buildATestBody renders the report (D-11)":
- const body = buildATestBody({ phaseN:50, phaseName:"add-tests", phaseGoal:"goal", status:"GENERATED", files:[{path:"test/a.test.mjs", req_id:"GAP-16", type:"Integration"}], skipped:[{path:"lib/x.js", reason:"rejected"}], escalated:[{req_id:"GAP-16", reason:"bug — expected/actual"}], gaps:["GAP-16"], suggestedCommand:"node --test test/*.test.mjs", notes:"", date:"2026-09-04" }). assert body.includes("# Phase 50: add-tests - Add-Tests Report"); assert body.includes("test/a.test.mjs"); assert body.includes("GAP-16"); assert body.includes("node --test test/*.test.mjs"); assert body.includes("Status"); assert /Report-only|not fixed|report-only/i.test(body) (the no-fix note).

Run the file with `node --test test/add-tests.test.mjs` and ensure all tests in the three pure describe blocks pass.
</action>
<verify>
`node --test test/add-tests.test.mjs` passes (exit 0). `node -e "import('./test/add-tests.test.mjs').catch(e=>{})"` parses.
</verify>
<acceptance_criteria>
- `node --test test/add-tests.test.mjs` exits 0 with all pure-helper + capability + command describe blocks passing.
- The test file imports resolveWriterOutput, extractChangedFiles, buildATestBody, validateTestPaths, detectTestInfra, CAPABILITY_KEYS, allCapabilities, NOT_LOOP_ORDERED.
- `grep -cn "resolveWriterOutput" test/add-tests.test.mjs` >= 4 (validator call + null/malformed cases).
- `grep -cn "buildATestBody" test/add-tests.test.mjs` >= 2.
</acceptance_criteria>
<done>
The pure helpers, the gsdAddTests capability descriptor, and the command pairing are all covered by offline tests; `node --test test/add-tests.test.mjs` runs green on this task's blocks.
</done>
  </task>
  <task type="auto">
    <name>Task 2: Tool behaviour tests — gate, writer dispatch, path boundary, atomic commit, advisory, degrade, no-fix</name>
    <files>test/add-tests.test.mjs</files>
    <read_first>test/validate-phase.test.mjs, test/autonomous.test.mjs, test/helpers/mount-harness.mjs, lib/add-tests.js</read_first>
    <action>
Extend test/add-tests.test.mjs with tool-behaviour describe blocks, modelled EXACTLY on test/validate-phase.test.mjs:424 (the makeAuditorSubagents-style fake subagents factory), :438 (makeFakeGit), and test/autonomous.test.mjs:188. Reuse/adapt the local `mountToolUnderTest(fs, {subagents, gitFn})`-style helper: build a FakeFs and the ctx via `const ctx = makeMountCtx(fs, { subagents: fakeSubagents })` (makeMountCtx destructures ONLY { subagents } — it silently ignores any gitFn). Then, because `lib/add-tests.js` resolves its git via `ctx.gitFn || defaultGitFn`, set the fake git on the ctx IMMEDIATELY AFTER mounting: `ctx.gitFn = fakeGit` (this is exactly the seam autonomous.test.mjs:188 and validate-phase.test.mjs use; do NOT try to pass gitFn through the makeMountCtx options or the tool falls through to the real default git and the commit-message assertion in step 4 flakes/fails). Then call the tool's apply(ctx, exec) so ctx.tools receives the gsd_add_tests tool, then locate it via ctx.tools (the tool object exposes `.execute(args, exec)` — mirror how validate-phase.test drives it in-process). For the summary/context/verification artefact reads, seed the FakeFs with a phase directory `.planning/phases/GSD-50-add-tests/GSD-50-add-tests-{PP}-SUMMARY.md` (with key-files frontmatter) + a CONTEXT + a VERIFICATION, using the same path layout the state accessors write (read lib/state.js _artifactFile to reproduce <base>-<PP>-SUMMARY.md names). Use phase n=50.

Fake subagents factory (D-06): makeAddTestsSubagents(structuredResult) → an object exposing the `subagents` service shape with a getProvider("spawn") → { start: async()=> ({ result: Promise.resolve({ output:"", structured: structuredResult }), dispose(){}, }) }. Return a record of the last spawns so tests can assert `promptText` includes "gsd-add-tests-writer", the phase_context, and changed-file list.

Fake git (D-08): makeFakeGit() → a function gitFn(cwd, argv) that records argv and returns canned strings per argv[0] ("rev-parse" → "phase-50\n"; "add" → ""; "diff --cached --name-only" → a configured staged list; "commit" → ""), mirroring validate-phase's makeFakeGit so commitSourceFiles works and its commit -m argv is assertable.

Write these describe blocks:

1. "phase-not-executed fail-fast (D-04)": a FakeFs with a ROADMAP containing phase 50 but NO SUMMARY artefact → calling tool execute({phase:50}, exec) rejects with `not executed (no SUMMARY found — run gsd_execute first)` (use assert.rejects). Also assert a phase not in ROADMAP rejects with `phase 50 not in ROADMAP.md`.

2. "classification gate request — no spawn, no write (D-09)": FakeFs WITH a SUMMARY key-files listing changed files, call execute({phase:50}, exec) (NO proceed/auto) → the returned text includes the changed-file list and the `--proceed`/`--auto`/`--cancel` instructions; assert the fake subagents factory recorded NO spawn (spawnCalls.length === 0) and the FakeFs has NO new ATEST file and NO test file under test/.

3. "--cancel aborts with no spawn/write": execute({phase:50, cancel:true}) → returned text indicates cancelled; spawnCalls.length === 0; no ATEST written.

4. "writer dispatch + write of accepted tests (D-05/D-06/D-08)": fake subagents returns structured { tests_written:[{path:"test/add-tests-50.test.mjs", req_id:"GAP-16", content:"// generated\nimport { test } from 'node:test';\ntest('ok',()=>{});", type:"Integration"}], skip:[], status:"GENERATED", escalated:[], notes:"" }; execute({phase:50, proceed:true}) → assert the tool resolves+writeText `${cwd}/test/add-tests-50.test.mjs` with that content; assert fake git recorded a `commit -m` argv whose message equals `test(phase-50): add unit and E2E tests from add-tests command`; assert the ATEST `<base>-ATEST.md` was written and committed; assert the promptText captured by the factory includes "gsd-add-tests-writer" and "GAP-16".

5. "path hard boundary — traversing/impl/absolute skipped, never written (D-07)": fake subagents returns tests_written with entries: {path:"/abs/etc/passwd", ...}, {path:"../lib/evil.js", ...}, {path:"lib/impl.js", ...}, {path:"test/good1.test.mjs", ...}, {path:"", ...}. execute({phase:50, proceed:true}) → assert only `test/good1.test.mjs` was written (FakeFs has it, others absent), assert the report's status reflects the skip, and assert commitSourceFiles is called with ONLY the valid path.
   - Directly assert validateTestPaths(["../lib/evil.js","/abs/x","lib/impl.js","","test/good.test.mjs"]) returns { valid:["test/good.test.mjs"], skipped:["../lib/evil.js","/abs/x","lib/impl.js",""] } (verify exact skip array). Adjust to the actual helper contract if order differs but assert the valid set contains ONLY the test path.

6. "advisory — no STATE mutation (D-04)": after a successful proceed run, assert the STATE step / next_action is UNCHANGED from the pre-call value (the tool never calls setActivePhase/completePhase). Concretely: read STATE via the gsdState accessor before and after the tool call (or read the FakeFs STATE.md content) and assert it is byte-identical. Also assert `setActivePhase` was not among the ctx calls (e.g. fake git / a spy on the state service).

7. "degrade-with-flag on writer failure (D-10)": (a) subagents factory whose spawn THROWS → execute({phase:50, proceed:true}) does NOT reject; returned text includes UNAVAILABLE and the real cause; a pending ATEST with status frontmatter "UNAVAILABLE" was written+committed; no test file written. (b) subagents returns malformed output (resolveWriterOutput → null) → same UNAVAILABLE degrade. (c) subagents returns tests_written all rejected by the path boundary (empty accepted set) → same UNAVAILABLE degrade.

8. "no-fix bug reporting, no suite execution (D-11)": fake subagents returns escalated:[{req_id:"GAP-16", reason:"assertion failed — expected 2, actual 3 in lib/x.js"}]; execute({phase:50, proceed:true}) → returned text flags the potential bug (report-only) and asserts NO implementation file (lib/) was written and NO `npm test`/`node --test` command was invoked by the tool.

Ensure every test that drives execute supplies a valid exec ({ agent:{ session:{ header:{ cwd } }, signal: undefined }}) and a ctx whose gsdState has the FakeFs; mirror exactly how validate-phase.test.mjs constructs the exec/ctx so the state accessors resolve cwd. Run the whole file green.
</action>
<verify>
`node --test test/add-tests.test.mjs` passes all blocks (exit 0). `grep -cn "makeFakeGit\|makeAddTestsSubagents\|not executed\|UNAVAILABLE\|commit -m\|validateTestPaths" test/add-tests.test.mjs` all present.
</verify>
<acceptance_criteria>
- `node --test test/add-tests.test.mjs` exits 0.
- `grep -n "not executed (no SUMMARY found" test/add-tests.test.mjs` matches.
- `grep -n "test(phase-50): add unit and E2E tests from add-tests command" test/add-tests.test.mjs` matches the commit-message assertion.
- `grep -n "UNAVAILABLE" test/add-tests.test.mjs` matches the degrade tests.
- `grep -n "validateTestPaths" test/add-tests.test.mjs` matches the boundary test.
- `grep -n "setActivePhase\|advisory\|STATE" test/add-tests.test.mjs` matches the advisory no-mutation test.
- The file has at least the test names: fail-fast, gate, cancel, dispatch, boundary, advisory, degrade, no-fix (assertion strings present).
</acceptance_criteria>
<done>
The full tool-behaviour surface (gate, dispatch, boundary, commit, advisory, degrade, no-fix) is covered with fake subagents + fake git; `node --test test/add-tests.test.mjs` runs green end-to-end.
</done>
  </task>
</tasks>

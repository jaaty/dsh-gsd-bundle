---
phase: 55-quick-batch
plan: 03
type: execute
wave: 3
depends_on: ["GSD-55-quick-batch-01", "GSD-55-quick-batch-02"]
files_modified: [test/mount.test.mjs, test/_capabilities.test.mjs, test/render.test.mjs, test/service-tools.test.mjs, test/out-of-flow-commit.test.mjs]
autonomous: true
requirements: ["CLH-05"]
gap_closure: false
user_setup: []
must_haves:
  truths:
    - npm test (node --test test/*.test.mjs) passes on the updated suite (MOUNT-06).
    - The registration-surface tests reflect the new gsd_quick_batch tool, gsd-quick-batch command, and gsdQuickBatch capability.
    - The batch behaviour (happy path, failure isolation, slug-collision dedup, structured return) is covered by automated tests.
  artifacts:
    - path: "test/service-tools.test.mjs"
      provides: "a gsd_quick_batch describe block covering the happy path, failure isolation, slug dedup, and the structured return shape"
      min_lines: 40
      exports: []
    - path: "test/mount.test.mjs"
      provides: "updated tool/command/capability counts and name lists for the new surface"
      min_lines: 1
      exports: []
    - path: "test/_capabilities.test.mjs"
      provides: "updated capability-key count and key list including gsdQuickBatch"
      min_lines: 1
      exports: []
    - path: "test/render.test.mjs"
      provides: "updated LOOP_ORDER and subset lists including gsdQuickBatch"
      min_lines: 1
      exports: []
    - path: "test/out-of-flow-commit.test.mjs"
      provides: "updated commitArtifacts call count for quick.js (now two scope-quick calls)"
      min_lines: 1
      exports: []
  key_links:
    - from: "test/service-tools.test.mjs gsd_quick_batch"
      to: "lib/quick.js gsd_quick_batch"
      via: "registerTool('quick', 'gsd_quick_batch') executes the batch on FakeFs and asserts per-task TASK.md records"
      pattern: "gsd_quick_batch"
---

<objective>Update the hard-coded registration-surface assertions for the new gsd_quick_batch tool, gsd-quick-batch command, and gsdQuickBatch capability, and add a gsd_quick_batch describe block that proves the batch behaviour (happy path, failure isolation, slug-collision dedup, structured return) offline on FakeFs. This keeps npm test green (MOUNT-06).</objective>

<context>
@test/mount.test.mjs — EXPECTED_TOOL_NAMES (line 105), EXPECTED_COMMAND_NAMES (line 120), and the hard-coded counts at lines 147, 148, 159, 190, 328.
@test/_capabilities.test.mjs — CAPABILITY_KEYS.length === 24 (line 13) and the key list (lines 14-39).
@test/render.test.mjs — LOOP_ORDER (line 44) and the without("gsdVerify") subset list (line 113).
@test/service-tools.test.mjs — the makeSubagents canned handler (lines 29-77) and the gsd_quick describe block (lines 204-224) to mirror.
@test/out-of-flow-commit.test.mjs — the quick.js commitArtifacts call-count assertion (lines 74-82).
</context>

<tasks>
  <task type="auto">
    <name>Task 1: Update the hard-coded registration-surface assertions for the new tool, command, and capability (tracer)</name>
    <files>test/mount.test.mjs, test/_capabilities.test.mjs, test/render.test.mjs, test/out-of-flow-commit.test.mjs</files>
    <read_first>test/mount.test.mjs, test/_capabilities.test.mjs, test/render.test.mjs, test/out-of-flow-commit.test.mjs</read_first>
    <action>
      In test/mount.test.mjs:
      - Add "gsd_quick_batch" to EXPECTED_TOOL_NAMES (after "gsd_quick").
      - Add "gsd-quick-batch" to EXPECTED_COMMAND_NAMES (after "gsd-quick").
      - Line 147: change `ctx.tools.length === 33` to `=== 34` (and the message).
      - Line 148: change `ctx.commands.length === 30` to `=== 31` (and the message).
      - Line 159: change `CAPABILITY_KEYS.length === 24` to `=== 25` (and the message).
      - Line 190: change `ctx2.commands.length === 29` to `=== 30` (and the message). Rationale: in that test only gsdQuick is deleted; gsdQuickBatch remains provided, so gsd-quick-batch still registers and only gsd-quick is withdrawn.
      - Line 328: change `ctx.tools.length === 33` to `=== 34` (and the message).
      - Do NOT change the snapshot assertion at line 470 — plan 01 dedupes the step list, so "quick" still appears once.

      In test/_capabilities.test.mjs:
      - Line 13: change `CAPABILITY_KEYS.length, 24` to `25`.
      - Add "gsdQuickBatch" to the key list (lines 14-39), immediately after "gsdQuick".

      In test/render.test.mjs:
      - Line 44 LOOP_ORDER: insert "gsdQuickBatch" immediately after "gsdQuick" (both order 25; stable sort keeps CAPABILITY_KEYS order, gsdQuick before gsdQuickBatch).
      - Line 113 (the without("gsdVerify") subset list): insert "gsdQuickBatch" immediately after "gsdQuick".

      In test/out-of-flow-commit.test.mjs:
      - Lines 74-82: the quick.js commitArtifacts call-count assertion must now expect TWO calls with `{ scope: "quick"` (one in gsd_quick, one in gsd_quick_batch). Change `(src.match(callRe) || []).length, 1` to `, 2` and update the message text. The ordering test (lines 84-94) needs no change: indexOf finds the first (gsd_quick) occurrence, which is still after writeQuickRecord.
    </action>
    <verify>node --test test/mount.test.mjs test/_capabilities.test.mjs test/render.test.mjs test/out-of-flow-commit.test.mjs 2>&1 | tail -20</verify>
    <acceptance_criteria>
      - grep "gsd_quick_batch" appears in test/mount.test.mjs EXPECTED_TOOL_NAMES
      - grep "gsd-quick-batch" appears in test/mount.test.mjs EXPECTED_COMMAND_NAMES
      - grep "=== 34" appears in test/mount.test.mjs
      - grep "=== 31" appears in test/mount.test.mjs
      - grep "=== 25" appears in test/mount.test.mjs
      - grep "=== 30" appears in test/mount.test.mjs
      - grep "gsdQuickBatch" appears in test/_capabilities.test.mjs
      - grep "gsdQuickBatch" appears in test/render.test.mjs
      - grep ", 2," appears in test/out-of-flow-commit.test.mjs
      - node --test test/mount.test.mjs test/_capabilities.test.mjs test/render.test.mjs test/out-of-flow-commit.test.mjs exits 0
    </acceptance_criteria>
    <done>The registration-surface tests reflect the new tool, command, and capability, and the four updated test files pass.</done>
  </task>

  <task type="auto">
    <name>Task 2: Add a gsd_quick_batch describe block in service-tools.test.mjs covering happy path, failure isolation, slug dedup, and structured return</name>
    <files>test/service-tools.test.mjs</files>
    <read_first>test/service-tools.test.mjs</read_first>
    <action>
      In test/service-tools.test.mjs:
      - Extend the makeSubagents canned handler (lines 29-77) with a failure branch BEFORE the generic `label.startsWith("quick")` branch: `else if (label.startsWith("quick boom")) { throw new Error("boom subagent failed"); }`. This makes a task whose slug is "boom" fail at spawn, exercising failure isolation. No other test uses slug "boom", so this branch is inert elsewhere.
      - Add a new `describe("gsd_quick_batch", ...)` block after the existing gsd_quick describe (mirroring its beforeEach: `fs = new FakeFs(); svc = await buildProject(fs, CWD); ctx = makeCtx();`). Register the tool with `registerTool("quick", "gsd_quick_batch")`. Tests:
        1. "runs multiple tasks sequentially with per-task records and a structured result": execute with `{ tasks: [{ task: "fix typo A", slug: "fix-a" }, { task: "fix typo B", slug: "fix-b" }] }`; assert `res.summary.total === 2`, `res.summary.done === 2`, `res.summary.failed === 0`, `res.results.length === 2`, `res.results[0].status === "done"`, `res.results[0].slug === "fix-a"`; assert exactly two `.planning/quick/<date>-<slug>/TASK.md` files exist on the FakeFs (filter fs.files keys for `/.planning/quick/` and `/TASK.md$`), one ending `-fix-a/TASK.md` and one `-fix-b/TASK.md`, each containing `# Quick task`.
        2. "failure isolation: a failing task is recorded and the batch continues": execute with `{ tasks: [{ task: "good one", slug: "good" }, { task: "bad one", slug: "boom" }, { task: "good two", slug: "good2" }] }`; assert `res.summary.total === 3`, `res.summary.done === 2`, `res.summary.failed === 1`; assert `res.results[1].status === "failed"` and `res.results[1].error` contains "boom subagent failed"; assert the `-boom/TASK.md` record exists and contains `## Error`; assert the batch did not throw.
        3. "slug collision dedup appends a numeric suffix": execute with `{ tasks: [{ task: "first", slug: "same" }, { task: "second", slug: "same" }] }`; assert `res.results[0].slug === "same"` and `res.results[1].slug === "same-2"`; assert two distinct TASK.md records exist (one `-same/TASK.md`, one `-same-2/TASK.md`).
        4. "returns a structured object, not a string": assert `typeof res === "object"`, `Array.isArray(res.results)`, and `typeof res.summary === "object"`.
    </action>
    <verify>node --test test/service-tools.test.mjs 2>&1 | tail -20</verify>
    <acceptance_criteria>
      - grep "describe(\"gsd_quick_batch\"" appears in test/service-tools.test.mjs
      - grep "quick boom" appears in test/service-tools.test.mjs
      - grep "same-2" appears in test/service-tools.test.mjs
      - grep "## Error" appears in test/service-tools.test.mjs
      - node --test test/service-tools.test.mjs exits 0
    </acceptance_criteria>
    <done>The gsd_quick_batch behaviour is covered by automated tests and the service-tools suite passes.</done>
  </task>
</tasks>

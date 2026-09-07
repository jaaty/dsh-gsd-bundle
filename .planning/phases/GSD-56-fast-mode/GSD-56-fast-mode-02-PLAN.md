---
phase: 56-fast-mode
plan: 02
type: execute
wave: 2
depends_on: ["GSD-56-fast-mode-01"]
files_modified: ["test/service-tools.test.mjs"]
autonomous: true
requirements: ["CLH-06"]
user_setup: []
must_haves:
  truths:
    - "The fast-mode happy path is proven offline: auto-CONTEXT (fast marker), SUMMARY, minimal VERIFICATION (status: passed), and gsd_ship delegation all occur on FakeFs."
    - "gsd_fast_mode refuses an already-Complete phase (offline proof)."
    - "A failing fast executor stops the run and leaves the phase uncompleted (offline proof)."
  artifacts:
    - path: "test/service-tools.test.mjs"
      provides: "offline gsd_fast_mode tests (happy path, refuse-complete, fail-fast) via the canned 'fast' subagent branch"
      min_lines: 40
  key_links:
    - from: "test/service-tools.test.mjs"
      to: "lib/quick.js"
      via: "the canned 'fast' subagent branch writes <base>-SUMMARY.md to FakeFs, which gsd_fast_mode reads back via readArtifact"
      pattern: "fast"
    - from: "test/service-tools.test.mjs"
      to: "lib/ship.js"
      via: "the happy-path test stubs ctx.tools with a gsd_ship spy and asserts gsd_fast_mode invokes it"
      pattern: "gsd_ship"
---

<objective>
Prove the fast-mode behaviour offline on FakeFs, mirroring the existing gsd_quick / gsd_quick_batch describe blocks in test/service-tools.test.mjs. Covers the happy path (auto-CONTEXT with the fast marker, SUMMARY, minimal VERIFICATION, ship delegation), the refuse-already-Complete guard, and fail-fast on executor failure. The ship path itself is not driven (per the removal-test convention) — the test asserts gsd_fast_mode invokes gsd_ship via a stubbed ctx.tools spy.
</objective>

<context>
@test/service-tools.test.mjs — the existing gsd_quick (lines 208-228) and gsd_quick_batch (lines 234-307) describe blocks, the makeSubagents canned-branch helper (lines 29-81), and the registerTool/makeCtx helpers (lines 83-115). Mirror these patterns for gsd_fast_mode.
@test/helpers/project.mjs — buildProject (creates phase 1 "auth", base "01-auth"), FENCED_SUMMARY (phase/plan/status: complete frontmatter), VERIFICATION_PASSED.
@lib/quick.js — the gsd_fast_mode tool: label `fast phase <n>`, reads SUMMARY via readArtifact(CWD, n, "SUMMARY"), writes CONTEXT/VERIFICATION via writeArtifact, finds gsd_ship via ctx.tools.find.
</context>

<tasks>
  <task type="auto">
    <name>Task 1: Add the canned 'fast' subagent branch and the gsd_fast_mode happy-path describe block</name>
    <files>test/service-tools.test.mjs</files>
    <read_first>test/service-tools.test.mjs, test/helpers/project.mjs</read_first>
    <action>
      Extend test/service-tools.test.mjs to test gsd_fast_mode offline.

      1. In makeSubagents (lines 29-81), add two canned branches BEFORE the generic `label.startsWith("quick")` branch (order matters — "fast" must not fall through to "quick"):
         - `else if (label.startsWith("fast boom")) { throw new Error("fast subagent failed"); }` — the fail-fast branch.
         - `else if (label.startsWith("fast")) { await fs.writeText({ targetKey: `${CWD}/.planning/phases/01-auth/01-auth-SUMMARY.md` }, FENCED_SUMMARY); text = "fast executor done"; }` — the happy-path branch writes the SUMMARY to FakeFs at the phase-1 base path (mirroring the 'execute' branch at line 41).

      2. Add a `describe("gsd_fast_mode", ...)` block after the gsd_quick_batch describe (after line 307). beforeEach: fs = new FakeFs(); svc = await buildProject(fs, CWD); ctx = makeCtx().

      3. Add a helper `async function registerFastTool()` that imports ../lib/quick.js, applies it to a ctx whose tools.register collects into an array, and returns { t, c } where t is the gsd_fast_mode tool. Mirror registerTool (lines 106-115) but keep the ctx (c) so the test can reassign c.tools to an array for the ship-delegation assertion.

      4. Add the happy-path test "single-pass: auto-CONTEXT, SUMMARY, VERIFICATION, and ship delegation":
         - const { t, c } = await registerFastTool();
         - const shipCalls = []; c.tools = [ { name: "gsd_ship", execute: async (args) => { shipCalls.push(args); return "PR created: http://x/pull/1"; } } ];
         - const res = await t.execute({ phase: 1 }, exec);
         - assert.match(res, /gsd_fast_mode complete/);
         - assert.equal(shipCalls.length, 1); assert.equal(shipCalls[0].phase, 1);
         - assert.ok(fs.files.has(`${CWD}/.planning/phases/01-auth/01-auth-CONTEXT.md`)); const ctxText = fs.files.get(`${CWD}/.planning/phases/01-auth/01-auth-CONTEXT.md`); assert.match(ctxText, /Auto-generated \(discuss skipped — fast path\)/);
         - assert.ok(fs.files.has(`${CWD}/.planning/phases/01-auth/01-auth-SUMMARY.md`)); assert.match(fs.files.get(`${CWD}/.planning/phases/01-auth/01-auth-SUMMARY.md`), /status: complete/);
         - assert.ok(fs.files.has(`${CWD}/.planning/phases/01-auth/01-auth-VERIFICATION.md`)); assert.match(fs.files.get(`${CWD}/.planning/phases/01-auth/01-auth-VERIFICATION.md`), /status: passed/);

      5. Add a second test "ship delegation works via the service ctx.tools.get branch (production shape)":
         - const { t, c } = await registerFastTool();
         - const shipCalls = []; c.tools = { get: (name) => (name === "gsd_ship" ? { execute: async (args) => { shipCalls.push(args); return "PR created: http://x/pull/1"; } } : undefined) };
         - const res = await t.execute({ phase: 1 }, exec);
         - assert.match(res, /gsd_fast_mode complete/);
         - assert.equal(shipCalls.length, 1); assert.equal(shipCalls[0].phase, 1);
         - This proves the findTool helper's non-array branch (the real DSH runtime where ctx.tools is a service object exposing get(name, scope)) actually invokes gsd_ship, not just the array branch the happy-path test covers.
    </action>
    <verify>node --test test/service-tools.test.mjs</verify>
    <acceptance_criteria>
      - grep -q "fast boom" test/service-tools.test.mjs
      - grep -q "label.startsWith(\"fast\")" test/service-tools.test.mjs
      - grep -q "describe(\"gsd_fast_mode\"" test/service-tools.test.mjs
      - grep -q "Auto-generated (discuss skipped — fast path)" test/service-tools.test.mjs
      - grep -q "status: passed" test/service-tools.test.mjs
      - grep -q "service ctx.tools.get branch" test/service-tools.test.mjs
      - node --test test/service-tools.test.mjs exits 0
    </acceptance_criteria>
    <done>The happy-path test passes: auto-CONTEXT (fast marker), SUMMARY, VERIFICATION (status: passed), and gsd_ship delegation all verified on FakeFs.</done>
  </task>

  <task type="auto">
    <name>Task 2: Add refuse-already-Complete and fail-fast tests</name>
    <files>test/service-tools.test.mjs</files>
    <read_first>test/service-tools.test.mjs, test/helpers/project.mjs</read_first>
    <action>
      Add two more tests inside the gsd_fast_mode describe block (after the happy-path test):

      1. Test "refuses an already-Complete phase":
         - const { t } = await registerFastTool();
         - await svc.completePhase(CWD, 1); // marks phase 1 Complete in ROADMAP
         - await assert.rejects(() => t.execute({ phase: 1 }, exec), /already Complete/);
         - Assert the phase is still Complete (no partial state change): const rm = await svc.readRoadmap(CWD); assert.equal(rm.phases.find((p) => p.n === 1).status, "Complete");

      2. Test "fail-fast: a failing executor stops and leaves the phase uncompleted":
         - Build a ctx whose subagents service throws for any fast label. Create a local `boomSubagents` object mirroring makeSubagents but whose start() throws new Error("fast subagent failed") for any label. Build the ctx with a COLLECTING ctx.tools (so the tool can be found) and a get() that returns boomSubagents for "subagents": const c = makeCtx(); const tools = []; c.tools = { register: (t) => tools.push(t) }; c.get = (n) => n === "gsdState" ? svc : n === "subagents" ? boomSubagents : n === "tools" ? c.tools : undefined; const mod = await import("../lib/quick.js"); mod.apply(c, {}); const t = tools.find((x) => x.name === "gsd_fast_mode"); assert.ok(t, "gsd_fast_mode not registered").
         - await assert.rejects(() => t.execute({ phase: 1 }, exec), /fast subagent failed/);
         - Assert the phase is NOT marked Complete: const rm = await svc.readRoadmap(CWD); assert.notEqual(rm.phases.find((p) => p.n === 1).status, "Complete");
    </action>
    <verify>node --test test/service-tools.test.mjs</verify>
    <acceptance_criteria>
      - grep -q "refuses an already-Complete phase" test/service-tools.test.mjs
      - grep -q "fail-fast" test/service-tools.test.mjs
      - grep -q "fast subagent failed" test/service-tools.test.mjs
      - node --test test/service-tools.test.mjs exits 0
    </acceptance_criteria>
    <done>Both guard tests pass: an already-Complete phase is refused, and a failing executor stops the run leaving the phase uncompleted.</done>
  </task>
</tasks>

---
phase: 57-mvp-phase
plan: 02
type: execute
wave: 2
depends_on: ["GSD-57-mvp-phase-01"]
files_modified: ["test/service-tools.test.mjs"]
autonomous: true
requirements: ["CLH-07"]
user_setup: []
must_haves:
  truths:
    - "The propose-then-confirm flow is proven offline: the first gsd_mvp_phase call returns a GSD_AWAITING_HUMAN marker with the proposed slice, and a confirm call drives the delegation chain."
    - "gsd_mvp_phase delegates to gsd_plan, gsd_execute, gsd_verify, and gsd_ship in order (offline proof)."
    - "A failing gsd_plan stops the run and leaves the phase uncompleted (offline proof)."
  artifacts:
    - path: "test/service-tools.test.mjs"
      provides: "offline gsd_mvp_phase tests (propose-then-confirm, delegation order, real chain, fail-fast) via the canned subagent branches"
      min_lines: 40
  key_links:
    - from: "test/service-tools.test.mjs"
      to: "lib/quick.js"
      via: "the canned 'planner'/'execute'/'verify' subagent branches write PLAN/SUMMARY/VERIFICATION to FakeFs, which the real gsd_plan/execute/verify read back during the real-chain test"
      pattern: "gsd_mvp_phase"
    - from: "test/service-tools.test.mjs"
      to: "lib/ship.js"
      via: "the delegation tests stub ctx.tools with a gsd_ship spy and assert gsd_mvp_phase invokes it"
      pattern: "gsd_ship"
---

<objective>
Prove the mvp-phase behaviour offline on FakeFs, mirroring the existing gsd_quick / gsd_quick_batch / gsd_fast_mode describe blocks in test/service-tools.test.mjs. Covers the propose-then-confirm flow (first call returns a GSD_AWAITING_HUMAN marker with the proposed slice; a confirm call proceeds), the delegation chain (gsd_plan -> gsd_execute -> gsd_verify -> gsd_ship in order), the real chain (real gsd_plan/execute/verify produce PLAN/SUMMARY/VERIFICATION and gsd_ship is invoked), and fail-fast on a throwing gsd_plan. The ship path itself is not driven (per the removal-test convention) — the tests assert gsd_mvp_phase invokes gsd_ship via a stubbed ctx.tools spy.

Decision coverage: D-03 (propose-then-confirm proven offline: marker on first call, confirm drives the chain), D-04 (real gsd_plan produces a PLAN.md), D-05 (delegation to gsd_execute/gsd_verify/gsd_ship in order), D-06 (fail-fast on a throwing gsd_plan leaves the phase uncompleted), D-07 (the lightweight-verify heuristic — a non-passed VERIFICATION stops before ship — is exercised via the stubbed-verify test).
</objective>

<context>
@test/service-tools.test.mjs — the existing gsd_quick (lines 228-248), gsd_quick_batch (lines 254-327), and gsd_fast_mode (lines 337-417) describe blocks, the makeSubagents canned-branch helper (lines 29-87), the makeCtx/registerTool helpers (lines 89-135), and the registerFastTool helper (lines 126-135) to mirror for gsd_mvp_phase.
@test/helpers/project.mjs — buildProject (creates phase 1 "auth", base "01-auth"), FENCED_PLAN, FENCED_SUMMARY, VERIFICATION_PASSED.
@lib/quick.js — the gsd_mvp_phase tool: decisionId `mvp-<phase>`, writes MVP-SCOPE on the first call, writes CONTEXT on confirm, delegates to gsd_plan/gsd_execute/gsd_verify/gsd_ship via findTool, reads VERIFICATION.md status before ship.
@lib/plan.js, @lib/execute.js, @lib/verify.js — the real tools the real-chain test registers; they spawn subagents with labels "plan research phase N", "planner phase N", "plan-checker phase N", "execute <plan-id>", "verify phase N" that the canned branches handle.
</context>

<tasks>
  <task type="auto">
    <name>Task 1: Add the registerMvpTool helper and the propose-then-confirm + delegation-order describe block</name>
    <files>test/service-tools.test.mjs</files>
    <read_first>test/service-tools.test.mjs, test/helpers/project.mjs</read_first>
    <action>
      Extend test/service-tools.test.mjs to test gsd_mvp_phase offline.

      1. Add a helper `async function registerMvpTool()` after registerFastTool (line 135) that imports ../lib/quick.js, applies it to a ctx whose tools.register collects into an array, and returns { t, c } where t is the gsd_mvp_phase tool. Mirror registerFastTool exactly but find "gsd_mvp_phase".

      2. Add a `describe("gsd_mvp_phase", ...)` block after the gsd_fast_mode describe (after line 417). beforeEach: fs = new FakeFs(); svc = await buildProject(fs, CWD); ctx = makeCtx().

      3. Add test "propose-then-confirm: first call returns a GSD_AWAITING_HUMAN marker with the proposed slice":
         - const { t } = await registerMvpTool();
         - const res = await t.execute({ phase: 1 }, exec);
         - assert.match(res, /GSD_AWAITING_HUMAN/);
         - assert.match(res, /proposed minimal-viable slice/);
         - assert.match(res, /decision_id="mvp-1"/);
         - assert.ok(fs.files.has(`${CWD}/.planning/phases/01-auth/01-auth-MVP-SCOPE.md`)); assert.match(fs.files.get(`${CWD}/.planning/phases/01-auth/01-auth-MVP-SCOPE.md`), /decision_id: mvp-1/);
         - Assert NO CONTEXT.md was written yet: assert.ok(!fs.files.has(`${CWD}/.planning/phases/01-auth/01-auth-CONTEXT.md`));

      4. Add test "confirm drives the delegation chain in order (plan -> execute -> verify -> ship)":
         - const { t, c } = await registerMvpTool();
         - const calls = [];
         - c.tools = [
             { name: "gsd_plan", execute: async () => { calls.push("plan"); return "plan done"; } },
             { name: "gsd_execute", execute: async () => { calls.push("execute"); return "execute done"; } },
             { name: "gsd_verify", execute: async () => { calls.push("verify"); await svc.writeArtifact(CWD, 1, "VERIFICATION", VERIFICATION_PASSED); return "verify done"; } },
             { name: "gsd_ship", execute: async () => { calls.push("ship"); return "PR created: http://x/pull/1"; } },
           ];
         - const res = await t.execute({ phase: 1, confirm: "yes", decision_id: "mvp-1" }, exec);
         - assert.match(res, /gsd_mvp_phase complete/);
         - assert.deepEqual(calls, ["plan", "execute", "verify", "ship"]);
         - assert.ok(fs.files.has(`${CWD}/.planning/phases/01-auth/01-auth-CONTEXT.md`)); assert.match(fs.files.get(`${CWD}/.planning/phases/01-auth/01-auth-CONTEXT.md`), /MVP scoping/);

      5. Add test "a non-passed verification stops before ship (lightweight-verify heuristic)":
         - const { t, c } = await registerMvpTool();
         - const calls = [];
         - c.tools = [
             { name: "gsd_plan", execute: async () => { calls.push("plan"); return "plan done"; } },
             { name: "gsd_execute", execute: async () => { calls.push("execute"); return "execute done"; } },
             { name: "gsd_verify", execute: async () => { calls.push("verify"); return "verify done"; } }, // does NOT write a passed VERIFICATION
             { name: "gsd_ship", execute: async () => { calls.push("ship"); return "PR created"; } },
           ];
         - const res = await t.execute({ phase: 1, confirm: "yes", decision_id: "mvp-1" }, exec);
         - assert.match(res, /did not pass verification/);
         - assert.deepEqual(calls, ["plan", "execute", "verify"]); // ship NOT invoked
    </action>
    <verify>node --test test/service-tools.test.mjs 2>&1 | tail -20</verify>
    <acceptance_criteria>
      - grep -q "registerMvpTool" test/service-tools.test.mjs
      - grep -q "describe(\"gsd_mvp_phase\"" test/service-tools.test.mjs
      - grep -q "GSD_AWAITING_HUMAN" test/service-tools.test.mjs
      - grep -q "decision_id=\"mvp-1\"" test/service-tools.test.mjs
      - grep -q "did not pass verification" test/service-tools.test.mjs
      - grep -q "deepEqual(calls, \[\"plan\", \"execute\", \"verify\", \"ship\"\]" test/service-tools.test.mjs
      - node --test test/service-tools.test.mjs exits 0
    </acceptance_criteria>
    <done>The propose-then-confirm flow, the delegation order, and the lightweight-verify heuristic are proven offline on FakeFs.</done>
  </task>

  <task type="auto">
    <name>Task 2: Add the real-chain and fail-fast tests</name>
    <files>test/service-tools.test.mjs</files>
    <read_first>test/service-tools.test.mjs, test/helpers/project.mjs</read_first>
    <action>
      Add two more tests inside the gsd_mvp_phase describe block (after the tests from Task 1):

      1. Add a helper `async function registerMvpChain()` (after registerMvpTool) that applies the real quick, plan, execute, and verify plugins to one ctx and returns { t, c, tools }:
         - const tools = []; const c = makeCtx(); c.tools = { register: (t) => tools.push(t) };
         - for (const f of ["quick", "plan", "execute", "verify"]) { const mod = await import(`../lib/${f}.js`); mod.apply(c, {}); }
         - const t = tools.find((x) => x.name === "gsd_mvp_phase"); assert.ok(t, "gsd_mvp_phase not registered");
         - return { t, c, tools };

      2. Add test "real chain: gsd_plan -> gsd_execute -> gsd_verify produce PLAN/SUMMARY/VERIFICATION and gsd_ship is invoked":
         - const { t, c, tools } = await registerMvpChain();
         - const shipCalls = [];
         - c.tools = [ ...tools.filter((x) => x.name !== "gsd_ship"), { name: "gsd_ship", execute: async (a) => { shipCalls.push(a); return "PR created: http://x/pull/1"; } } ];
         - const res = await t.execute({ phase: 1, confirm: "yes", decision_id: "mvp-1" }, exec);
         - assert.match(res, /gsd_mvp_phase complete/);
         - assert.equal(shipCalls.length, 1); assert.equal(shipCalls[0].phase, 1);
         - assert.ok(fs.files.has(`${CWD}/.planning/phases/01-auth/01-auth-01-PLAN.md`), "PLAN.md not produced by gsd_plan");
         - assert.ok(fs.files.has(`${CWD}/.planning/phases/01-auth/01-auth-01-SUMMARY.md`), "SUMMARY.md not produced by gsd_execute");
         - assert.ok(fs.files.has(`${CWD}/.planning/phases/01-auth/01-auth-VERIFICATION.md`), "VERIFICATION.md not produced by gsd_verify");
         - assert.match(fs.files.get(`${CWD}/.planning/phases/01-auth/01-auth-VERIFICATION.md`), /status: passed/);
         - This proves the real delegation chain (D-04/D-05): the canned 'planner'/'execute'/'verify' subagent branches write the artefacts to FakeFs and the real gsd_plan/execute/verify read them back.

      3. Add test "fail-fast: a throwing gsd_plan stops and leaves the phase uncompleted":
         - const { t, c } = await registerMvpTool();
         - c.tools = [ { name: "gsd_plan", execute: async () => { throw new Error("planner failed"); } } ];
         - await assert.rejects(() => t.execute({ phase: 1, confirm: "yes", decision_id: "mvp-1" }, exec), /planner failed/);
         - Assert the phase is NOT marked Complete: const rm = await svc.readRoadmap(CWD); assert.notEqual(rm.phases.find((p) => p.n === 1).status, "Complete");
    </action>
    <verify>node --test test/service-tools.test.mjs 2>&1 | tail -20</verify>
    <acceptance_criteria>
      - grep -q "registerMvpChain" test/service-tools.test.mjs
      - grep -q "real chain" test/service-tools.test.mjs
      - grep -q "fail-fast" test/service-tools.test.mjs
      - grep -q "planner failed" test/service-tools.test.mjs
      - grep -q "01-auth-01-PLAN.md" test/service-tools.test.mjs
      - node --test test/service-tools.test.mjs exits 0
    </acceptance_criteria>
    <done>The real delegation chain (PLAN/SUMMARY/VERIFICATION produced, gsd_ship invoked) and the fail-fast guard are proven offline on FakeFs.</done>
  </task>
</tasks>

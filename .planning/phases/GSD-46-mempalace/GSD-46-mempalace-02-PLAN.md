---
phase: 46-mempalace
plan: 02
type: tdd
wave: 2
depends_on: ["GSD-46-mempalace-01"]
files_modified:
  - lib/discuss.js
  - lib/plan.js
  - lib/verify.js
  - lib/ship.js
  - test/mempalace-hooks.test.mjs
autonomous: true
requirements: ["GAP-12"]
user_setup: []
must_haves:
  truths:
    - "discuss.js fires recall at discuss:pre and capture at discuss:post, gated by mempalace.enabled + recall_on_discuss/capture_artifacts, never blocking the loop step (D-07)"
    - "plan.js fires recall at plan:pre and capture at plan:post (D-07)"
    - "verify.js fires capture at verify:post (D-07)"
    - "ship.js fires capture at ship:post re-filing SUMMARY.md into the milestones room (D-07, OQ-3)"
    - "Every auto-hook is onError: skip — a fault never blocks the loop step (D-07, REQ-MP-06)"
  artifacts:
    - path: "test/mempalace-hooks.test.mjs"
      provides: "TDD tests for the pure auto-hook helpers (runMempalaceRecallOnDiscuss, runMempalaceCaptureOnDiscuss, runMempalaceRecallOnPlan, runMempalaceCaptureOnPlan, runMempalaceCaptureOnVerify, runMempalaceCaptureOnShip) — gating by mempalace.enabled + sub-keys, never-block on fault, tool-absent skip"
      min_lines: 120
      exports: []
  key_links:
    - from: "lib/discuss.js"
      to: "lib/mempalace.js"
      via: "the recall/capture hook helpers invoke the registered gsd_mempalace_recall / gsd_mempalace_capture tools by name"
      pattern: "gsd_mempalace_recall"
---
<objective>
Wire the best-effort auto-hooks into the loop tools (D-07): discuss.js fires recall at discuss:pre and capture at discuss:post; plan.js fires recall at plan:pre and capture at plan:post; verify.js fires capture at verify:post; ship.js fires capture at ship:post (re-filing SUMMARY.md, OQ-3). Each hook is a PURE, exported, directly-testable helper (mirroring runLearningsOnShip / runGraphifyOnShip in lib/ship.js) gated by mempalace.enabled + the relevant sub-key, wrapped so a fault NEVER blocks the loop step (onError: skip, REQ-MP-06).
</objective>
<context>@lib/ship.js, @lib/discuss.js, @lib/plan.js, @lib/verify.js, @test/graphify.test.mjs, @test/learnings.test.mjs</context>
<tasks>
  <task type="auto">
    <name>Task 1 (test): Write test/mempalace-hooks.test.mjs — hook helper tests (RED)</name>
    <files>test/mempalace-hooks.test.mjs</files>
    <read_first>test/graphify.test.mjs, test/learnings.test.mjs, lib/ship.js</read_first>
    <action>
Create test/mempalace-hooks.test.mjs modeled on the runGraphifyOnShip helper tests in test/graphify.test.mjs (lines 418-475). The hook helpers are PURE ({ cfg, tools, phase, exec } → Promise<string>), so they are tested directly with a fake tools array — no mount, no FakeFs, no git/gh, no gsdState (mirrors the runLearningsOnShip precedent).

Import the hook helpers from their tool files: runMempalaceRecallOnDiscuss, runMempalaceCaptureOnDiscuss from ../lib/discuss.js; runMempalaceRecallOnPlan, runMempalaceCaptureOnPlan from ../lib/plan.js; runMempalaceCaptureOnVerify from ../lib/verify.js; runMempalaceCaptureOnShip from ../lib/ship.js.

Write these test groups (per D-07/D-11h):

(a) Recall hook gating (D-07): for runMempalaceRecallOnDiscuss and runMempalaceRecallOnPlan — when cfg.mempalace.enabled is false OR the sub-key (recall_on_discuss / recall_on_plan) is false, the helper returns a skipped/disabled line and the tool is never called. When enabled + sub-key true + tool present, the helper calls tool.execute({ phase }) and returns a result line. When the tool throws, the helper returns a non-blocking line with the cause, never rejects. When the tool is absent, the helper returns a not-registered/skipped line, never throws. When cfg is absent (no mempalace object), the helper returns skipped (defends against missing config).

(b) Capture hook gating (D-07): for runMempalaceCaptureOnDiscuss, runMempalaceCaptureOnPlan, runMempalaceCaptureOnVerify, runMempalaceCaptureOnShip — when cfg.mempalace.enabled is false OR capture_artifacts is false, the helper returns a skipped/disabled line and the tool is never called. When enabled + capture_artifacts true + tool present, the helper calls tool.execute({ phase, artifact: <the correct artifact> }) and returns a result line. Assert the artifact arg: discuss→'CONTEXT', plan→'PLAN', verify→'SUMMARY', ship→'SUMMARY' (OQ-3). When the tool throws, the helper returns a non-blocking line with the cause, never rejects. When the tool is absent, the helper returns a not-registered/skipped line, never throws.

Use a makeFakeMempalaceTool helper that records calls and returns a result string, and a makeFailingMempalaceTool that throws. For each helper, test: disabled → skipped + no call; enabled + present → calls execute with the right args + returns result; enabled + throws → non-blocking + cause; enabled + absent → not-registered/skipped; cfg absent → skipped.
    </action>
    <verify>test -f test/mempalace-hooks.test.mjs && grep -q "runMempalaceRecallOnDiscuss" test/mempalace-hooks.test.mjs && grep -q "runMempalaceCaptureOnShip" test/mempalace-hooks.test.mjs</verify>
    <acceptance_criteria>
      - test/mempalace-hooks.test.mjs exists and imports the hook helpers from ../lib/discuss.js, ../lib/plan.js, ../lib/verify.js, ../lib/ship.js
      - grep -q "recall_on_discuss" test/mempalace-hooks.test.mjs (recall gating sub-key)
      - grep -q "capture_artifacts" test/mempalace-hooks.test.mjs (capture gating sub-key)
      - grep -q "artifact" test/mempalace-hooks.test.mjs (artifact arg assertion)
      - grep -q "non-blocking" test/mempalace-hooks.test.mjs (never-block on fault)
    </acceptance_criteria>
    <done>test/mempalace-hooks.test.mjs is written with the recall + capture hook helper test groups covering D-07/D-11h. Tests are expected to FAIL at this point (RED) because the hook helpers are not yet exported from the tool files.</done>
  </task>

  <task type="auto">
    <name>Task 2 (feat): Implement hook helpers + wire into discuss/plan/verify/ship (GREEN)</name>
    <files>lib/discuss.js, lib/plan.js, lib/verify.js, lib/ship.js</files>
    <read_first>lib/ship.js, lib/discuss.js, lib/plan.js, lib/verify.js, test/mempalace-hooks.test.mjs</read_first>
    <action>
Implement the pure hook helpers in each loop tool and wire them into the execute() bodies. Mirror the runLearningsOnShip / runGraphifyOnShip precedent in lib/ship.js (lines 66-101): a PURE, exported, directly-testable helper taking only { cfg, tools, phase, exec } — NO ctx, NO git, NO gsdState. Gated by cfg?.mempalace?.enabled === true AND the relevant sub-key, it finds the registered tool by name and invokes tool.execute(args, exec) inside try/catch, returning a non-blocking log line. Wrapped so a fault never blocks the loop step (D-07, REQ-MP-06).

1. lib/discuss.js — add two pure exported helpers:
   - runMempalaceRecallOnDiscuss({ cfg, tools, phase, exec }): if (cfg?.mempalace?.enabled !== true || cfg?.mempalace?.recall_on_discuss !== true) return "mempalace recall: disabled (mempalace.enabled/recall_on_discuss) — skipped"; find tool gsd_mempalace_recall in tools; if absent return "mempalace recall: gsd_mempalace_recall not registered — skipped"; try { const r = await tool.execute({ phase }, exec); return "mempalace recall: " + String(r); } catch (e) { return "mempalace recall: recall failed (non-blocking): " + (e && e.message ? e.message : String(e)); }.
   - runMempalaceCaptureOnDiscuss({ cfg, tools, phase, exec }): same shape, gated by cfg?.mempalace?.enabled === true && cfg?.mempalace?.capture_artifacts === true, invoking gsd_mempalace_capture with { phase, artifact: "CONTEXT" }.
   Wire into execute: read cfg = await s.readConfig(cwd) (add if not present). At discuss:pre (before writing CONTEXT, after the guards), call const recallLine = await runMempalaceRecallOnDiscuss({ cfg, tools: ctx.tools, phase: args.phase, exec }); push to a log array. At discuss:post (after the commitArtifacts call), call const captureLine = await runMempalaceCaptureOnDiscuss({ cfg, tools: ctx.tools, phase: args.phase, exec }); push to the log. Include the log lines in the return string. Export the two helpers.

2. lib/plan.js — add two pure exported helpers runMempalaceRecallOnPlan (gated by recall_on_plan, invokes gsd_mempalace_recall with { phase }) and runMempalaceCaptureOnPlan (gated by capture_artifacts, invokes gsd_mempalace_capture with { phase, artifact: "PLAN" }). Wire into execute: cfg is already read (line 62). At plan:pre (before the research step), call runMempalaceRecallOnPlan and push to log. At plan:post (after the planning + commit), call runMempalaceCaptureOnPlan and push to log. Export the two helpers.

3. lib/verify.js — add one pure exported helper runMempalaceCaptureOnVerify (gated by capture_artifacts, invokes gsd_mempalace_capture with { phase, artifact: "SUMMARY" }). Wire into execute: cfg is already read (line 45). At verify:post (after writing VERIFICATION + commit), call runMempalaceCaptureOnVerify and push to the return. Export the helper.

4. lib/ship.js — add one pure exported helper runMempalaceCaptureOnShip (gated by capture_artifacts, invokes gsd_mempalace_capture with { phase, artifact: "SUMMARY" }, OQ-3). Wire into execute: cfg is already read (line 162). At ship:post (after the completion commit + push, alongside the learnings/graphify hooks at lines 296-306), call runMempalaceCaptureOnShip and push to log. Export the helper.

Each helper must be exported from its tool file so test/mempalace-hooks.test.mjs can import it directly.
    </action>
    <verify>node --test test/mempalace-hooks.test.mjs 2>&1 | tail -20</verify>
    <acceptance_criteria>
      - grep -q "runMempalaceRecallOnDiscuss" lib/discuss.js (helper exported)
      - grep -q "runMempalaceCaptureOnDiscuss" lib/discuss.js (helper exported)
      - grep -q "runMempalaceRecallOnPlan" lib/plan.js (helper exported)
      - grep -q "runMempalaceCaptureOnPlan" lib/plan.js (helper exported)
      - grep -q "runMempalaceCaptureOnVerify" lib/verify.js (helper exported)
      - grep -q "runMempalaceCaptureOnShip" lib/ship.js (helper exported)
      - grep -q "gsd_mempalace_recall" lib/discuss.js (recall hook wired)
      - grep -q "gsd_mempalace_capture" lib/ship.js (capture hook wired)
      - node --test test/mempalace-hooks.test.mjs exits 0 (all hook tests pass — GREEN)
    </acceptance_criteria>
    <done>The six pure hook helpers are implemented and exported from their tool files, and wired into the execute() bodies of discuss/plan/verify/ship at the correct pre/post points, gated by mempalace.enabled + sub-keys, never blocking the loop step (D-07). test/mempalace-hooks.test.mjs passes (GREEN).</done>
  </task>
</tasks>

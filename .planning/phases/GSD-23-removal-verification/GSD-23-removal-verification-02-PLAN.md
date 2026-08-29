---
phase: 23-removal-verification
plan: 02
type: execute
wave: 2
depends_on: ["GSD-23-removal-verification-01"]
files_modified: ["test/removal.test.mjs"]
autonomous: true
requirements: ["DEGR-05"]
user_setup: []
must_haves:
  truths:
    - The per-plugin removal matrix is data-driven from CAPABILITY_KEYS (role === "step") crossed with PATCH_ROWS, so any plugin row can be added to the suite with no structural change (D-02).
    - For each of the 5 role:"step" loop plugins (gsdDiscuss, gsdPlan, gsdExecute, gsdVerify, gsdShip), retiring it reverts all six effects-reverted surfaces and the remaining loop stays functional end-to-end (DEGR-05, D-04, D-05).
  artifacts:
    - path: "test/removal.test.mjs"
      provides: "per-plugin removal suite: data-driven matrix, six effects-reverted surfaces, functional-depth smoke calls for remaining offline-runnable step tools, and execute/ship present+registered+schema-sound assertions"
      min_lines: 120
      exports: []
  key_links:
    - from: "test/removal.test.mjs"
      to: "test/helpers/mount-harness.mjs"
      via: "imports mountSubset, personaBody, snapshot, initProject, presentTools, assertNoAbsentToolToken, PATCH_ROWS, makeExec, CWD and injects a rich subagents factory"
      pattern: "from \"\\./helpers/mount-harness\\.mjs\""
    - from: "test/removal.test.mjs"
      to: "lib/_capabilities.js"
      via: "derives the step-capability matrix from CAPABILITY_KEYS + buildCapability"
      pattern: "CAPABILITY_KEYS\\.filter"
    - from: "test/removal.test.mjs"
      to: "lib/_render.js"
      via: "asserts the gsd_status next_action rewrite through effectiveRoutableStep (D-06, never redefines routing)"
      pattern: "effectiveRoutableStep"
---
<objective>
Add the automated per-plugin removal suite test/removal.test.mjs (DEGR-05). For each of the 5 role:"step" loop plugins, mount the full plugin set minus that one row (D-03: never-apply / subset mount) and assert (a) all six effects-reverted surfaces are absent (D-04), (b) the remaining loop is still functional end-to-end — render/routing/gsd_status coherence plus offline-runnable smoke calls of the remaining step tools producing their artefacts (D-05), and (c) gsd_execute/gsd_ship are present + registered + schema-sound only (their git/gh/subagent paths are not driven offline). The matrix is data-driven from CAPABILITY_KEYS + PATCH_ROWS (D-02) and routing semantics are reused from lib/_render.js effectiveRoutableStep (D-06). The suite stays offline only (FakeFs + fake-ctx, no live DSH boot, no LLM, no git/gh) per D-08.
</objective>
<context>@.planning/phases/GSD-23-removal-verification/GSD-23-removal-verification-CONTEXT.md
@.planning/phases/GSD-23-removal-verification/GSD-23-removal-verification-RESEARCH.md
@test/helpers/mount-harness.mjs
@test/helpers/project.mjs
@lib/_capabilities.js
@lib/_render.js
@lib/state.js
@test/tools.test.mjs</context>
<tasks>
  <task type="auto">
    <name>Task 1: data-driven retirement matrix + six effects-reverted surfaces for all 5 step plugins (tracer)</name>
    <files>test/removal.test.mjs</files>
    <read_first>test/helpers/mount-harness.mjs, lib/_capabilities.js, lib/_render.js, test/mount.test.mjs</read_first>
    <action>
      Create test/removal.test.mjs. Imports: `import { test, describe } from "node:test";`, `import assert from "node:assert/strict";`, `import { CAPABILITY_KEYS, buildCapability } from "../lib/_capabilities.js";`, `import { effectiveRoutableStep } from "../lib/_render.js";`, and `import { CWD, PATCH_ROWS, makeExec, mountSubset, personaBody, snapshot, initProject, presentTools, assertNoAbsentToolToken } from "./helpers/mount-harness.mjs";`.

      Define the data-driven matrix (D-01/D-02):
      - `const STEP_CAPS = CAPABILITY_KEYS.filter((k) => buildCapability(k).role === "step");` (exactly the 5 loop-step capabilities).
      - `function retirementMatrix() { return STEP_CAPS.map((capKey) => { const cap = buildCapability(capKey); const row = PATCH_ROWS.find((r) => r.sub === cap.step); assert.ok(row, \`no patch row for step "\${cap.step}"\`); return { capKey, sub: cap.step, tool: cap.tools[0], command: cap.commands[0], step: cap.step, order: cap.order }; }); }` — the capability→patch-row-sub mapping is derived from the descriptor `step` label matching the patch row `sub`, so adding a row to PATCH_ROWS/CAPABILITY_KEYS extends the suite with no structural change.

      Add a describe block `describe("removal: per-plugin retirement reverts effects and keeps the loop functional (DEGR-05)", () => { ... })` that iterates `retirementMatrix()` and, for each entry, registers a test `\`retiring \${capKey} reverts all six effects and keeps the loop functional\``. Inside the test:
      - Build the subset: `const allSubs = PATCH_ROWS.map((r) => r.sub); const subs = allSubs.filter((s) => s !== sub);` then `const { ctx } = await mountSubset(subs);` and `await initProject(ctx);` (initProject bootstraps phase 1 "p1" through the mounted gsdState, so the smoke calls in Task 2 see a real project).
      - Surface 1 (capability service absent): `assert.ok(!ctx.provided.has(capKey), \`\${capKey} capability still provided\`);`.
      - Surface 2 (tool absent): `assert.ok(!ctx.tools.some((t) => t.name === tool), \`\${tool} still registered\`);`.
      - Surface 3 (command unregistered): `assert.ok(!ctx.commands.some((c) => c.name === command), \`\${command} still registered\`);`.
      - Surface 4 (persona omits the step paragraph + never names its tools): `const body = personaBody(ctx); assertNoAbsentToolToken(ctx, body, \`persona (retired \${capKey})\`); const capLabel = step[0].toUpperCase() + step.slice(1); assert.ok(!body.includes(\`- \${capLabel}:\`), \`persona still renders the \${capKey} step paragraph\`);`.
      - Surface 5 (snapshot omits the step from Available-steps): `const snap = snapshot(ctx); assert.ok(!snap.match(new RegExp(\`Available steps:[^\\n]*\${step}\`)), \`snapshot advertises absent step \${step}\`); assertNoAbsentToolToken(ctx, snap, \`snapshot (retired \${capKey})\`);`.
      - Surface 6 (gsd_status rewrites a stored next_action targeting it): `const gsdState = ctx.get("gsdState"); await gsdState.setActivePhase(CWD, 1, step);` then `const gsdStatus = ctx.tools.find((t) => t.name === "gsd_status"); const out = await gsdStatus.execute({}, makeExec());`. Compute the expected rewrite via the REUSED routing helper (D-06), filtering `provided` to capability descriptors ONLY so non-capability services (e.g. the `gsdState` service object stored in the same `provided` map) never enter the routing input: `const presentDescs = [...ctx.provided.values()].filter((d) => d && typeof d === "object" && typeof d.key === "string" && Array.isArray(d.tools)); const expected = effectiveRoutableStep(\`\${step}-phase\`, presentDescs); const expectedLine = expected ? \`Next action: \${expected.step}-phase\` : \`Next action: no available loop step\`;` then `assert.match(out, new RegExp(expectedLine.replace(/[.*+?^${}()|[\]\\]/g, "\\\\$&")));` and `assertNoAbsentToolToken(ctx, out, \`gsd_status (retired \${capKey})\`);`.
      Run the removal test alone to confirm the six-surface matrix passes before adding the smoke depth.
    </verify>node --test test/removal.test.mjs</verify>
    <acceptance_criteria>
      - grep test/removal.test.mjs for "CAPABILITY_KEYS.filter" (data-driven matrix source).
      - grep test/removal.test.mjs for "effectiveRoutableStep" (D-06 routing reused, not redefined).
      - grep test/removal.test.mjs for "assertNoAbsentToolToken" (D-02 token invariant on persona/snapshot/gsd_status).
      - node --test test/removal.test.mjs exits 0 (5 tests, one per step plugin).
    </acceptance_criteria>
    <done>test/removal.test.mjs proves, for all 5 step plugins, that retiring each reverts all six effects-reverted surfaces; the removal test passes standalone.</done>
  </task>

  <task type="auto">
    <name>Task 2: functional depth — smoke the remaining offline-runnable step tools producing their artefacts (D-05)</name>
    <files>test/removal.test.mjs</files>
    <read_first>test/removal.test.mjs, test/helpers/project.mjs, lib/plan.js, lib/verify.js, lib/discuss.js, test/tools.test.mjs</read_first>
    <action>
      Extend test/removal.test.mjs with the functional-depth smoke calls (D-05). Add imports: `import { FENCED_PLAN, FENCED_SUMMARY, VERIFICATION_PASSED } from "./helpers/project.mjs";`.

      Add a rich fake subagents factory (mirrors test/tools.test.mjs:117-207, parametrized to the bootstrapped phase dir):
      - `function makeRichSubagents(fs) { const state = { dir: null, base: null }; const svc = { setPhaseDir(dir, base) { state.dir = dir; state.base = base; }, getProvider: (n) => (n === "spawn" ? { spawn: true } : undefined), async start(_n, req) { const label = req.label; let text = "done"; if (label.startsWith("planner") && !label.includes("revise")) { await fs.writeText({ targetKey: \`\${state.dir}/\${state.base}-01-PLAN.md\` }, FENCED_PLAN); text = "## PLANNING COMPLETE"; } else if (label.startsWith("plan-checker")) { text = "## VERIFICATION PASSED"; } else if (label.startsWith("verify")) { await fs.writeText({ targetKey: \`\${state.dir}/\${state.base}-VERIFICATION.md\` }, VERIFICATION_PASSED); text = "status: passed, score: 2/2"; } else if (label.startsWith("plan research")) { text = "# RESEARCH\\n\\n## Open Questions\\n\\n- none (RESOLVED)\\n\\nStandard."; } return { result: { output: [{ type: "text", text }], stopReason: "completed" }, dispose: () => {} }; } }; return svc; }`.

      Add a smoke helper `async function smokeRemainingSteps(ctx, retiredSub, rich)` that:
      - `const gsdState = ctx.get("gsdState"); const { dir, base } = await gsdState.phaseDirAndBase(CWD, 1); rich.setPhaseDir(dir, base); const exec = makeExec(); const has = (name) => ctx.tools.some((t) => t.name === name);`.
      - CONTEXT: if `retiredSub === "discuss"`, pre-seed via `await gsdState.writeArtifact(CWD, 1, "CONTEXT", "# Phase 1: p1 - Context\\n\\n<decisions>\\n## Decisions\\n- **D-01:** x\\n</decisions>");` (the absent discuss tool would have produced it). Else if `has("gsd_discuss")`, run it: `const discuss = ctx.tools.find((t) => t.name === "gsd_discuss"); const res = await discuss.execute({ phase: 1, decisions: [{ area: "a", items: [{ id: "D-01", text: "x" }] }] }, exec); assert.match(res, /Discuss complete/); assert.ok(await gsdState.hasArtifact(CWD, 1, "CONTEXT"), "gsd_discuss did not write CONTEXT.md");`.
      - PLAN: if `retiredSub === "plan"`, pre-seed the artefact the absent plan tool would have produced — `await gsdState.writeArtifact(CWD, 1, "PLAN-01", FENCED_PLAN);` — mirroring the CONTEXT pre-seed (when `discuss` is retired) and the SUMMARY pre-seed (when `execute` is retired), so the subsequent VERIFY step sees a plan and does not early-return (lib/verify.js:53-56). Else if `has("gsd_plan")`, run it: `const plan = ctx.tools.find((t) => t.name === "gsd_plan"); const res = await plan.execute({ phase: 1 }, exec); assert.match(res, /gsd_plan complete/); assert.ok(await gsdState.hasArtifact(CWD, 1, "PLAN-01"), "gsd_plan did not write PLAN.md");` (the rich planner subagent writes FENCED_PLAN; the plan-checker returns "## VERIFICATION PASSED" so no revision loop).
      - VERIFY: if `retiredSub !== "verify" && has("gsd_verify")`, pre-seed the summary (execute is never driven offline) via `await gsdState.writeArtifact(CWD, 1, "SUMMARY-01", FENCED_SUMMARY);` then run it: `const verify = ctx.tools.find((t) => t.name === "gsd_verify"); const res = await verify.execute({ phase: 1 }, exec); assert.match(res, /verified|gaps found|human verification/); assert.ok(await gsdState.hasArtifact(CWD, 1, "VERIFICATION"), "gsd_verify did not write VERIFICATION.md");` (the rich verify subagent writes VERIFICATION_PASSED).

      Wire the smoke into the Task-1 test: change the mount call to inject the rich subagents via a factory so it captures the mount's fs — `const holder = { rich: null }; const { ctx } = await mountSubset(subs, { subagents: (fs) => (holder.rich = makeRichSubagents(fs)) });` — and after the six-surface assertions call `await smokeRemainingSteps(ctx, sub, holder.rich);`. This proves the remaining offline-runnable step tools still execute successfully against the bootstrapped FakeFs project and produce their artefacts (D-05).
    </verify>node --test test/removal.test.mjs</verify>
    <acceptance_criteria>
      - grep test/removal.test.mjs for "makeRichSubagents" and "smokeRemainingSteps".
      - grep test/removal.test.mjs for "FENCED_PLAN" and "VERIFICATION_PASSED" (rich subagents write the artefacts).
      - grep test/removal.test.mjs for "retiredSub === \"plan\"" (PLAN-01 pre-seeded when the plan tool is retired, so gsd_verify does not early-return).
      - grep test/removal.test.mjs for "subagents: (fs) =>" (factory injects the mount's fs).
      - node --test test/removal.test.mjs exits 0 (each retirement smokes its remaining offline-runnable step tools and asserts the artefact files exist, including the gsdPlan row).
    </acceptance_criteria>
    <done>For each retirement, the remaining offline-runnable step tools (gsd_discuss/gsd_plan/gsd_verify) execute against the bootstrapped FakeFs project and write CONTEXT.md / PLAN.md / VERIFICATION.md where allowed — including the gsdPlan row, where PLAN-01 is pre-seeded so gsd_verify still writes VERIFICATION.md; the removal test passes standalone.</done>
  </task>

  <task type="auto">
    <name>Task 3: execute/ship present + registered + schema-sound assertions and full-suite regression (D-05)</name>
    <files>test/removal.test.mjs</files>
    <read_first>test/removal.test.mjs, test/mount.test.mjs</read_first>
    <action>
      Extend the Task-1 test with the execute/ship present + registered + schema-sound assertions (D-05: their git/gh/subagent paths are NOT driven offline). After the smoke call, add:
      `for (const [name, cap] of [["gsd_execute", "gsdExecute"], ["gsd_ship", "gsdShip"]]) { if (cap === capKey) continue; const t = ctx.tools.find((x) => x.name === name); assert.ok(t, \`\${name} not registered after retiring \${capKey}\`); assert.equal(typeof t.description, "string"); assert.ok(t.parameters && typeof t.parameters === "object"); assert.ok(t.output && t.output.schema, \`\${name} missing output.schema\`); }` — mirroring the schema-sound shape asserted at test/mount.test.mjs:415-426.

      Then run the FULL suite to confirm the harness extraction (plan 01) plus the new removal suite introduce no regression.
    </verify>npm test</verify>
    <acceptance_criteria>
      - grep test/removal.test.mjs for "gsd_execute" and "gsd_ship" (present+registered+schema-sound loop).
      - grep test/removal.test.mjs for "output.schema" (schema-sound assertion).
      - npm test exits 0 with 373 + 5 = 378 pass / 0 fail (baseline preserved + 5 removal tests).
    </acceptance_criteria>
    <done>gsd_execute/gsd_ship are asserted present + registered + schema-sound for every retirement, and the full suite passes 378/0.</done>
  </task>
</tasks>

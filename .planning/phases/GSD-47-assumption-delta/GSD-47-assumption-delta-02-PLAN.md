---
phase: 47-assumption-delta
plan: 02
type: tdd
wave: 2
depends_on: ["GSD-47-assumption-delta-01"]
files_modified: [lib/plan.js, lib/state.js, test/assumption-delta-wiring.test.mjs, test/state.test.mjs]
autonomous: true
requirements: ["GAP-13"]
gap_closure: false
user_setup: []
must_haves:
  truths:
    - "lib/plan.js imports and calls runAssumptionDeltaOnPlan during planner-prompt construction; when detected, the returned promptBlock (promote-vs-add-alongside question + <assumption_delta_decision> instruction) is spliced into the plannerPrompt text passed to the planner subagent, and the logLine is pushed into the gsd_plan output log (D-05)."
    - "When workflow.assumption_delta is not true, plan.js splices nothing and the hook contributes only a non-blocking skipped log line; the loop step behaviour is otherwise unchanged (D-04, D-08)."
    - "The _defaultConfig workflow block in lib/state.js emits workflow.assumption_delta === true for freshly initialized projects (D-04)."
  artifacts:
    - path: "test/assumption-delta-wiring.test.mjs"
      provides: "plan.js plan:pre wiring test — mounts gsd_plan, captures the plannerPrompt passed to the planner subagent, asserts the promote-vs-add-alongside question is present when a signal is detected and absent when config-off / no-signal, and asserts the gsd_plan log carries the assumption-delta line (D-05/D-08)"
      min_lines: 60
      exports: []
  key_links:
    - from: "lib/plan.js"
      to: "lib/assumption-delta.js"
      via: "ESM import of runAssumptionDeltaOnPlan and its call before plannerPrompt construction"
      pattern: "from \"\\./assumption-delta\\.js\""
    - from: "test/assumption-delta-wiring.test.mjs"
      to: "lib/plan.js"
      via: "mount gsd_plan (lib/plan.js apply) with a fake subagents service that captures the planner promptText"
      pattern: "plannerPrompt|promptText"
---
<objective>
Wire the pure assumption-delta module into the Plan phase as a plan:pre checkpoint (D-05): in lib/plan.js the hook runs on the already-fetched phase scope (ROADMAP phase.goal + phase.requirements + sealed CONTEXT.md, D-02) and its promptBlock is spliced into the plannerPrompt so the planner can record an &lt;assumption_delta_decision&gt; block, while its logLine is pushed into the gsd_plan output log. Add the workflow.assumption_delta default (true) to _defaultConfig in lib/state.js (D-04), read via the existing readConfig accessor. Per D-01/D-08 this wiring changes NO capability, NO tool, NO loop-step behaviour, NEVER advances STATE itself, and is a non-blocking soft gate (a fault inside the hook cannot block the plan step). All tests are test-first (RED→GREEN), modelled on test/mempalace-hooks.test.mjs / test/tools.test.mjs and the mount harness.
</objective>
<context>
- lib/plan.js — read fully. The mempalace recall hook runs at line 110 (log-only position); the assumption-delta hook MUST instead wire at PLANNER-PROMPT CONSTRUCTION (lines 152-161): it must reach the plannerPrompt text, not just the log. phase.goal / phase.requirements / contextMd are already in scope (lines 81-101). log[] is assembled at line 105 and pushed into the return at line 222.
- lib/state.js — _defaultConfig workflow block is at lines 186-202; add workflow.assumption_delta: true there. readConfig (lines 391-395) returns file-verbatim when present, so existing projects (whose config.json lacks the key) skip the hook — that is D-04-correct, NOT a bug; do not add migration logic.
- lib/assumption-delta.js (from plan 01) — exports runAssumptionDeltaOnPlan({ cfg, scopeText }) → { skipped?, detected?, signals?, promptBlock?, logLine? } and buildAssumptionDeltaPrompt({ signals }).
- test/tools.test.mjs (lines ~590-650) — the gsd_plan subagent-stub pattern: a custom subagents service whose start(_n, req) inspects req.label and returns crafted text, plus makeSubagents()/buildProject from test/helpers/mount-harness.mjs. Model the wiring test on this.
- test/helpers/mount-harness.mjs — makeMountCtx, registerTool helpers, CWD, makeExec, FakeFs.
</context>
<tasks>
  <task type="auto">
    <name>Task 1 (RED): write the plan.js wiring test + _defaultConfig regression</name>
    <files>test/assumption-delta-wiring.test.mjs, test/state.test.mjs</files>
    <read_first>lib/plan.js, lib/state.js, test/tools.test.mjs, test/helpers/mount-harness.mjs</read_first>
    <action>Create test/assumption-delta-wiring.test.mjs using the node:test conventions, the mount harness (FakeFs, makeMountCtx/registerTool or the equivalent helper used by test/tools.test.mjs) and buildProject to seed a project. Model the subagent stub on test/tools.test.mjs lines ~590-650 / makeSubagents(): build a custom subagents service whose start(_n, req) CAPTURES req.promptText from the "planner phase …" spawn into a test-visible variable, returns output "## PLANNING COMPLETE", and writes a minimal PLAN artifact via the gsdState service so gsd_plan can proceed through listPlans/runChecker/setStep. Seed a CONTEXT.md whose text triggers a pluralization signal (e.g. "support a second auth method alongside the existing one"), and a ROADMAP phase goal/requirements that contribute to the scope. Cases to assert:
- (a) gate ON + CONTEXT with a signal: after t.execute({ phase, skipResearch: true }), the captured plannerPrompt contains the promote-vs-add-alongside question and the <assumption_delta_decision> instruction block; the returned gsd_plan output log contains an assumption-delta line (D-05). Verify the STATE step does not advance beyond the normal "execute" the plan step always sets (i.e. the hook adds no extra advancement — assert the log/return contains no extra step transition) (D-08).
- (b) workflow.assumption_delta not true (set config with it false/absent): the captured plannerPrompt does NOT contain the question; the returned log contains a skipped/disabled line; no crash (D-04).
- (c) gate ON + CONTEXT without any trigger term: plannerPrompt does NOT contain the question (clean negative), and the phase with no scanable scope (no goal, no reqs, no CONTEXT) maps to a skipped (never a fabricated detected:false) line (D-06) — assert the log does not claim a false detection.
Then extend test/state.test.mjs (the existing _defaultConfig / initProject→readConfig round-trip test, around lines 412-426) to also assert cfg.workflow.assumption_delta === true is emitted by the default config.

Run `node --test test/assumption-delta-wiring.test.mjs` and CONFIRM it FAILS (RED): plan.js is not yet wired (captured promptText lacks the question) and _defaultConfig does not yet emit the flag.</action>
    <verify>cd /var/home/jatyeo/dev/dsh-gsd-bundle && node --test test/assumption-delta-wiring.test.mjs — expect assertion failures (promptText lacks the question; default flag missing) proving RED before wiring.</verify>
    <acceptance_criteria>
      - test/assumption-delta-wiring.test.mjs imports/mounts plan.js and captures the planner spawn's promptText
      - The wiring test asserts the question is present when detected (D-05), absent when config-off (D-04), and skipped-not-false when no scope (D-06)
      - test/state.test.mjs asserts workflow.assumption_delta === true in the default config
      - `node --test test/assumption-delta-wiring.test.mjs` fails (RED) before the wiring exists
    </acceptance_criteria>
    <done>Wiring test + _defaultConfig regression written and confirmed RED. Commit scope "test:".</done>
  </task>
  <task type="auto">
    <name>Task 2 (GREEN): wire the plan:pre hook into plan.js + add the config default</name>
    <files>lib/plan.js, lib/state.js</files>
    <read_first>lib/plan.js, lib/state.js, lib/assumption-delta.js</read_first>
    <action>In lib/plan.js (module "type": "module"):
- Add `import { runAssumptionDeltaOnPlan } from "./assumption-delta.js";` to the imports (alongside the existing imports at lines 9-14).
- Inside the gsd_plan execute(), BEFORE the plannerPrompt array is constructed at line ~152 (after line ~150, where pc/phase/goal/contextMd/cfg are all in scope), compute `const assumptionDelta = runAssumptionDeltaOnPlan({ cfg, scopeText: [phase.goal, (phase.requirements || []).join(" "), contextMd].join("\n") });`. scopeText assembly must order goal + reqs + CONTEXT (D-02) and strip nothing here (the detector strips fences). The hook is SYNCHRONOUS and cannot throw (D-08); keep the call un-awaited (it is not async).
- Splice the result into the plannerPrompt: in the plannerPrompt array (lines 152-161), add a `.filter(Boolean)`-compatible entry `assumptionDelta.promptBlock ? assumptionDelta.promptBlock : ""` (reuse the existing `.filter(Boolean).join("\n\n")` at line 161). Place it alongside the MODE/TDD/tracer entries so the planner sees it as an instruction block, and ensure the <assumption_delta_decision> instruction text reaches the planner text verbatim.
- Push the hook's log line only when present: `if (assumptionDelta.logLine) log.push(assumptionDelta.logLine);` so the gsd_plan output surfaces "assumption-delta: …" for the human (D-05). Do NOT touch the existing mempalace recall hook at line 110 (leave it as-is, D-08: "no change … beyond adding the new hook alongside them").
- Do NOT alter setStep("execute") at line 210 or any STATE advancement — the hook is advisory and never advances STATE (D-08).

In lib/state.js _defaultConfig (workflow block, lines 186-202): add `assumption_delta: true` so freshly initialized projects get the default ON (D-04), alongside learnings/graphify. Do NOT add migration logic for existing configs and do NOT read the flag via anything other than the shared readConfig accessor (plan.js already uses `cfg` from s.readConfig(cwd) at line 97).

Do NOT add any capability/tool/loop-step (D-01) and do NOT touch lib/_capabilities.js / lib/_render.js / cordis.patch.yml.</action>
    <verify>cd /var/home/jatyeo/dev/dsh-gsd-bundle && node --test test/assumption-delta-wiring.test.mjs — passes. Then npm test — whole suite green.</verify>
    <acceptance_criteria>
      - grep "from \"\\./assumption-delta\\.js\"" lib/plan.js matches
      - grep "assumptionDelta.logLine\|assumptionDelta.promptBlock\|runAssumptionDeltaOnPlan" lib/plan.js ≥ 2 matches
      - grep "assumption_delta: true" lib/state.js matches (in _defaultConfig)
      - `node --test test/assumption-delta-wiring.test.mjs` exits 0 (GREEN)
      - `npm test` exits 0 for the full suite
      - No new capability/tool registration introduced (grep lib/_capabilities.js unchanged this plan)
    </acceptance_criteria>
    <done>plan.js wires the hook into planner-prompt construction + log push; state.js default added; wiring test and full suite green. Commit scope "feat:".</done>
  </task>
</tasks>

---
phase: 36-spec-phase
plan: 01
type: execute
wave: 1
depends_on: []
files_modified: ["lib/_capabilities.js", "lib/_render.js", "lib/state.js", "test/_capabilities.test.mjs", "test/render.test.mjs"]
autonomous: true
requirements: ["GAP-02"]
user_setup: []
must_haves:
  truths:
    - "A gsdSpec capability descriptor (role step, order 5, tools ['gsd_spec_phase'], commands ['gsd-spec-phase'], next ['gsdDiscuss'], produces ['SPEC.md']) exists in lib/_capabilities.js, so the loop renders spec before discuss and gsd_status lists it as the first loop step."
    - "The persona body renders a spec step paragraph when gsdSpec is present, and the opener chain names Spec (Spec -> Discuss -> ...)."
    - "setActivePhase(...,'spec') resolves next_action 'discuss-phase' via an explicit _nextActionFor('spec') entry."
    - "test/_capabilities.test.mjs and test/render.test.mjs pass with spec-aware expectations (11 keys, spec as first loop step and first routable step)."
  artifacts: []
  key_links:
    - from: "lib/_capabilities.js"
      to: "lib/_render.js"
      via: "gsdSpec order 5 (role step) sorts into loopSteps before gsdDiscuss order 10, making gsdSpec the first routable loop step and the effectiveRoutableStep('done') fallback"
      pattern: "gsdSpec.*order: 5"
---
<objective>
Prove spec-phase is a first-class loop step by wiring its capability descriptor, loop rendering/routing, and STATE routing into the existing pure modules (lib/_capabilities.js, lib/_render.js, lib/state.js) and updating the two pure-module test suites to match. lib/spec.js does not exist yet — this plan only establishes the surface that plugin will provide (D-01/D-02). This is the Wave-1 foundation: later plans build lib/spec.js on top of buildCapability("gsdSpec") and the mount/coeffect wiring.
</objective>

<context>
@lib/_capabilities.js, @lib/_render.js, @lib/state.js, @test/_capabilities.test.mjs, @test/render.test.mjs
</context>

<tasks>
  <task type="auto">
    <name>Task 1: Add the gsdSpec capability descriptor (order 5)</name>
    <files>lib/_capabilities.js</files>
    <read_first>lib/_capabilities.js</read_first>
    <action>
      In lib/_capabilities.js make two changes (per D-01/D-02):
      (a) Insert "gsdSpec" into the CAPABILITY_KEYS frozen array between "gsdJobs" and "gsdDiscuss" (index 3). Update the doc comment above the array that currently reads "The 10 known capability keys" to say 11.
      (b) Insert a gsdSpec row into the TABLE object, placed between the gsdJobs row and the gsdDiscuss row, with exactly: step: "spec", role: "step", tools: ["gsd_spec_phase"], commands: ["gsd-spec-phase"], order: 5, prereq: [], next: ["gsdDiscuss"], produces: ["SPEC.md"], consumes: [].
      Keep the row plain ESM with no ctx and no I/O — the module invariant stays. Do NOT register any tool or service in this task; only the descriptor table + key array.
    </action>
    <verify>node --input-type=module -e "import('./lib/_capabilities.js').then(m=>{const b=m.buildCapability('gsdSpec'); if(!b||b.order!==5||b.role!=='step'||!b.tools.includes('gsd_spec_phase')||!b.commands.includes('gsd-spec-phase')||!b.next.includes('gsdDiscuss')||!b.produces.includes('SPEC.md')) process.exit(1);})"</verify>
    <acceptance_criteria>
      - grep-verifiable: "gsdSpec" appears in CAPABILITY_KEYS in lib/_capabilities.js after "gsdJobs" and before "gsdDiscuss".
      - grep-verifiable: the TABLE contains "order: 5" inside the "gsdSpec:" row.
      - the node verify command exits 0 (buildCapability("gsdSpec") returns order 5, role step, the specified tools/commands/next/produces).
    </acceptance_criteria>
    <done>lib/_capabilities.js exposes a gsdSpec descriptor at order 5 with the documented shape, verified by the node command.</done>
  </task>

  <task type="auto">
    <name>Task 2: Render and route spec (persona paragraph, opener, STATE routing)</name>
    <files>lib/_render.js, lib/state.js</files>
    <read_first>lib/_render.js, lib/state.js</read_first>
    <action>
      Make three presentational/routing edits (per D-02, D-08):
      (a) In lib/_render.js add a "gsdSpec" key to the STEP_PARAGRAPHS object (mirroring the gsdDiscuss entry style) whose text names only its own step and only its own tool gsd_spec_phase: "- Spec: before discussing HOW, clarify WHAT the phase delivers by producing a SPEC.md with falsifiable requirements (Current/Target/Acceptance) gated by an ambiguity-scoring score (<=0.20). Spec precedes discuss and is only rendered when the capability is present."
      (b) In lib/_render.js prepend "Spec -> " to the opener chain string literal at line ~191 so it begins "Spec -> Discuss -> (UI design, optional) -> Plan -> Execute -> Verify -> Ship" (cosmetic faithfulness, D-02). Do not change any capability-gated logic.
      (c) In lib/state.js _nextActionFor (line 347-349) add an explicit "spec": "discuss-phase" entry to the map so the routing is self-documenting and does not rely on the default fallback (per RESEARCH 1.6; D-08). Leave every other key untouched.
    </action>
    <verify>node --input-type=module -e "Promise.all([import('./lib/_render.js'),import('./lib/_capabilities.js')]).then(([ren,cap])=>{const d=[cap.buildCapability('gsdSpec'),cap.buildCapability('gsdDiscuss'),cap.buildCapability('gsdShip')]; const ks=ren.loopSteps(d).map(x=>x.key); if(ks[0]!=='gsdSpec') process.exit(1); if(ren.effectiveRoutableStep('done',d).key!=='gsdSpec') process.exit(2); const body=ren.renderPersonaBody([cap.buildCapability('gsdSpec')]); if(!body.includes('Spec: before discussing HOW')) process.exit(3); if(!body.includes('Spec -> Discuss')) process.exit(4);});"</verify>
    <acceptance_criteria>
      - grep-verifiable: STEP_PARAGRAPHS in lib/_render.js contains a gsdSpec key.
      - grep-verifiable: lib/_render.js line ~191 opener starts with "Spec -> Discuss".
      - grep-verifiable: lib/state.js _nextActionFor contains "spec": "discuss-phase".
      - the node verify command exits 0 (loopSteps first key is gsdSpec; effectiveRoutableStep('done') returns gsdSpec; persona body includes the spec paragraph and the Spec opener).
      - existing state.test.mjs still passes (node --test test/state.test.mjs exits 0).
    </acceptance_criteria>
    <done>lib/_render.js renders a spec paragraph + Spec opener and lib/state.js routes spec to discuss-phase, verified by the node command and grep.</done>
  </task>

  <task type="auto">
    <name>Task 3: Update capability + render test suites to spec-aware expectations</name>
    <files>test/_capabilities.test.mjs, test/render.test.mjs</files>
    <read_first>test/_capabilities.test.mjs, test/render.test.mjs</read_first>
    <action>
      Update both suites for the new gsdSpec capability (R-1 test maintenance, land together with the product change):
      (a) test/_capabilities.test.mjs: change the "exposes exactly the 10 known keys" test to assert CAPABILITY_KEYS.length === 11 and add "gsdSpec" to the listed keys array. Update any comment mentioning 10. Add an assertion that buildCapability("gsdSpec") has order === 5 and role === "step".
      (b) test/render.test.mjs: 
        - Add "gsdSpec" as the first element of LOOP_ORDER so it reads ["gsdSpec","gsdDiscuss","gsdUi","gsdPlan","gsdQuick","gsdExecute","gsdVerify","gsdShip"].
        - Update the "loopSteps excludes a removed step" expectation (currently without("gsdVerify")) to prefix "gsdSpec": ["gsdSpec","gsdDiscuss","gsdUi","gsdPlan","gsdQuick","gsdExecute","gsdShip"].
        - Update effectiveRoutableStep fallback assertions: effectiveRoutableStep("done", FULL).key becomes "gsdSpec" (was "gsdDiscuss"); effectiveRoutableStep("done", without("gsdDiscuss")).key becomes "gsdSpec" (was "gsdUi").
        - Update any renderAvailableSteps expectation that lists specific loop-step order to include spec first.
        - Update renderPersonaBody tests only if a hardcoded step list is asserted; the FULL-body test should still pass with the extra spec paragraph.
      Run both suites to confirm green before committing.
    </action>
    <verify>node --test test/_capabilities.test.mjs test/render.test.mjs</verify>
    <acceptance_criteria>
      - test/_capabilities.test.mjs asserts CAPABILITY_KEYS.length === 11 and includes "gsdSpec".
      - test/render.test.mjs asserts effectiveRoutableStep("done", FULL).key === "gsdSpec" and loopSteps(FULL)[0].key === "gsdSpec".
      - the node --test command for both suites exits 0 (all tests pass).
    </acceptance_criteria>
    <done>Both pure-module suites pass with spec-aware expectations; no other test suite regresses in a full `npm test`.</done>
  </task>
</tasks>

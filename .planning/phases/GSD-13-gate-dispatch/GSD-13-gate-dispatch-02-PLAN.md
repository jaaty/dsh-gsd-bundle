---
phase: 13-gate-dispatch
plan: 02
type: execute
wave: 2
depends_on: ["GSD-13-gate-dispatch-01"]
files_modified: ["lib/state.js", "lib/gates.js", "test/gates.test.mjs", "test/gates-ship.test.mjs", "test/state.test.mjs", ".planning/phases/GSD-13-gate-dispatch/GSD-13-gate-dispatch-VALIDATION.md"]
autonomous: true
requirements: ["CQ-03"]
user_setup: []
must_haves:
  truths:
    - "listPlans() returns each plan object with a structured `phase` field (String(phaseNum)) alongside the existing `plan` field."
    - "planScope derives the commit scope from plan.phase and plan.plan (zero-padded to 2 digits), never by parsing plan.id, and still yields (08-01) for phase 8 / plan 1."
    - "tddAuditGate consumes structured plan objects and the tdd-audit gate still matches (08-01) commit subjects."
  artifacts:
    - path: "lib/state.js"
      provides: "listPlans() adds a structured `phase` field to each plan object."
      min_lines: 40
      exports: ["listPlans"]
  key_links:
    - from: "lib/state.js listPlans"
      to: "lib/gates.js tddAuditGate"
      via: "listPlans emits plan.phase/plan.plan; tddAuditGate calls planScope(plan) which reads those structured fields"
      pattern: "planScope\\(plan\\)"
---
<objective>Derive the {phase}-{plan} conventional-commit scope from structured plan fields instead of parsing the plan.id string. listPlans() gains a structured `phase` field; the gates tests are first updated to pass structured plan objects (phase/plan fields) while planScope still parses plan.id, then planScope(plan) is switched to read plan.phase and plan.plan (zero-padded to 2 digits) and tddAuditGate consumes the structured plan objects. No backward-compatible id-parsing fallback is kept.</objective>
<context>@lib/state.js (listPlans plan-object construction lines 490-523), @lib/gates.js (planScope lines 112-123, tddAuditGate lines 127-155), @test/gates.test.mjs (tdd-audit describe lines 126-164, runCapabilityGates describe lines 199-268), @test/gates-ship.test.mjs (all runCapabilityGates plans arrays), @test/state.test.mjs (planIndex describe lines 108-200)</context>
<tasks>
  <task type="auto">
    <name>Task 1: Add a structured `phase` field to listPlans() plan objects and assert it (D-02)</name>
    <files>lib/state.js, test/state.test.mjs</files>
    <read_first>lib/state.js, test/state.test.mjs</read_first>
    <action>In lib/state.js listPlans() (lines 490-523), add `phase: String(phaseNum)` to the plan object pushed at lines 504-519, directly alongside the existing `plan: String(planNum)` field. `phaseNum` is already a parameter in scope (line 490). Do NOT change the padding of the stored `plan` field (consumers pad at use site). Do not add a `phase` field anywhere else. Then in test/state.test.mjs, in the planIndex describe block, extend the existing listPlans test (lines 109-129): after `assert.equal(fenced.type, "tdd")`, add `assert.equal(fenced.phase, "1")`. Add a bug-pinning comment noting (a) the `phase` field is the structured source for planScope (D-02), and (b) the assertion value "1" is tied to the `listPlans(CWD, 1)` call in this test — if the fixture phase number ever changes, update the assertion to match the actual phaseNum argument.</action>
    <verify>node --test test/state.test.mjs</verify>
    <acceptance_criteria>
      - grep -q "phase: String(phaseNum)" lib/state.js
      - grep -q "fenced.phase" test/state.test.mjs
      - node --test test/state.test.mjs exits 0
    </acceptance_criteria>
    <done>listPlans() emits a structured `phase` field on every plan object, the listPlans state test asserts it (with a comment tying the value to the phaseNum 1 fixture), and the state suite passes.</done>
  </task>
  <task type="auto">
    <name>Task 2: Update gates tests to the structured plan shape (D-03)</name>
    <files>test/gates.test.mjs, test/gates-ship.test.mjs</files>
    <read_first>test/gates.test.mjs, test/gates-ship.test.mjs</read_first>
    <action>Update every plan object passed to tddAuditGate and runCapabilityGates in test/gates.test.mjs and test/gates-ship.test.mjs to the structured shape: add `phase` and `plan` fields alongside `id` and `type`. For example `{ id: "GSD-08-x-01", type: "tdd" }` becomes `{ id: "GSD-08-x-01", phase: "8", plan: "1", type: "tdd" }`. Keep the `id` field (it is still used for the finding's planId). The scope assertions must still expect `(08-01)` — do not change the commit-subject strings. Specifically update these plan-object literals (the line numbers are the `plans:`/`const plans` lines that hold the object): test/gates.test.mjs line 127 (the shared `const plans` used by the tdd-audit tests at 130/136/148/153), line 143 (execute plan), line 159 (the phase-slug test plan), and line 239 (runCapabilityGates tdd plan); test/gates-ship.test.mjs lines 28, 48, 61, 100, 194, 205. For the phase-slug test at test/gates.test.mjs lines 157-163, RENAME the test from "plan id with a phase-slug prefix derives scope 08-01, not gates-01" to "a plan with phase 8 / plan 1 derives scope 08-01" and update its plan object to `{ id: "GSD-08-capability-gates-01", phase: "8", plan: "1", type: "tdd" }` — the id-string parsing premise is retired once planScope reads structured fields (Task 3), so the test now verifies structured scope derivation. Add a bug-pinning comment noting the structured phase/plan fields feed planScope (D-02/D-03). This task runs BEFORE the planScope change (Task 3): at this point planScope still parses plan.id, so the updated tests passing `{ id, phase, plan, type }` still derive `08-01` from plan.id and must pass unchanged.</action>
    <verify>node --test test/gates.test.mjs test/gates-ship.test.mjs</verify>
    <acceptance_criteria>
      - test "$(grep -c 'phase: \"8\"' test/gates.test.mjs)" -eq 4
      - test "$(grep -c 'plan: \"1\"' test/gates.test.mjs)" -eq 4
      - test "$(grep -c 'phase: \"8\"' test/gates-ship.test.mjs)" -eq 6
      - test "$(grep -c 'plan: \"1\"' test/gates-ship.test.mjs)" -eq 6
      - grep -q "a plan with phase 8 / plan 1 derives scope 08-01" test/gates.test.mjs
      - grep -q "(08-01)" test/gates.test.mjs
      - node --test test/gates.test.mjs test/gates-ship.test.mjs exits 0
    </acceptance_criteria>
    <done>All gates tests pass structured plan objects with phase/plan fields (4 in gates.test.mjs, 6 in gates-ship.test.mjs), the phase-slug test is renamed to reflect structured scope derivation, and the full gates suite is green against the still-id-parsing planScope.</done>
  </task>
  <task type="auto">
    <name>Task 3: Derive planScope from structured fields with 2-digit padding (D-02)</name>
    <files>lib/gates.js</files>
    <read_first>lib/gates.js</read_first>
    <action>In lib/gates.js, change planScope (lines 112-123) from `function planScope(planId)` to `function planScope(plan)` and derive the scope from the structured fields, padding both segments to 2 digits: `return \`${String(plan.phase).padStart(2, "0")}-${String(plan.plan).padStart(2, "0")}\`;`. Remove the id-splitting logic entirely (no `.split("-")` on plan.id). Update the single call site in tddAuditGate (line 131) from `planScope(plan.id)` to `planScope(plan)`. This preserves the exact (08-01) format the tdd-audit gate regexes against (lib/gates.js:132) even though the stored phase/plan fields are unpadded ("8"/"1"). Do NOT change the stored field padding in listPlans. The gates tests were already updated to the structured shape in Task 2 (including the renamed phase-slug test), so this change keeps the suite green.</action>
    <verify>node --test test/gates.test.mjs</verify>
    <acceptance_criteria>
      - grep -q "planScope(plan)" lib/gates.js
      - grep -q "padStart(2, \"0\")" lib/gates.js
      - grep -q "plan.phase" lib/gates.js
      - grep -q "plan.plan" lib/gates.js
      - grep -q "planScope(plan.id)" lib/gates.js returns nothing (no id-parsing call remains)
      - node --test test/gates.test.mjs exits 0
    </acceptance_criteria>
    <done>planScope derives the scope from plan.phase/plan.plan with 2-digit padding, tddAuditGate calls planScope(plan), and no id-string parsing remains.</done>
  </task>
  <task type="auto">
    <name>Task 4: Write the phase VALIDATION.md Nyquist artefact (D-01..D-05)</name>
    <files>.planning/phases/GSD-13-gate-dispatch/GSD-13-gate-dispatch-VALIDATION.md</files>
    <read_first>.planning/phases/GSD-08-capability-gates/VALIDATION.md, .planning/phases/GSD-13-gate-dispatch/GSD-13-gate-dispatch-CONTEXT.md</read_first>
    <action>Create `.planning/phases/GSD-13-gate-dispatch/GSD-13-gate-dispatch-VALIDATION.md` mirroring the structure of `.planning/phases/GSD-08-capability-gates/VALIDATION.md` (title, "Nyquist Coverage" section noting `nyquist_validation: true` in `.planning/config.json`, a "Decision → automated-test mapping" table, a "Task coverage (dimension 8)" table, and a "Full-suite gate" section). Map each locked decision to the automated test(s) that prove it: D-01 (GATE_DISPATCH map with run+format per gate) and D-05 (runCapabilityGates dispatches through GATE_DISPATCH with a shared data object) → the new "GATE_DISPATCH" describe block in test/gates.test.mjs (plan 01 Task 3) plus the unchanged runCapabilityGates suites in test/gates.test.mjs and test/gates-ship.test.mjs; D-04 (defensive throw on a gate name missing from the map) → the `assert.throws(..., /no dispatcher entry/)` test in plan 01 Task 3; D-02 (planScope derives the scope from structured plan.phase/plan.plan, zero-padded to 2 digits) → the `assert.equal(fenced.phase, "1")` state test in test/state.test.mjs (plan 02 Task 1) and the `planScope(plan)` + `padStart(2, "0")` assertions in plan 02 Task 3; D-03 (tddAuditGate consumes structured plan objects) → the updated tdd-audit tests in test/gates.test.mjs and test/gates-ship.test.mjs (plan 02 Task 2). In the "Task coverage" table list all six tasks across plans 01 and 02 with their `node --test` verify commands. In the "Full-suite gate" section state the bundle suite is `node --test test/*.test.mjs` and that it ran green at the end of plan 02 Task 3.</action>
    <verify>test -f .planning/phases/GSD-13-gate-dispatch/GSD-13-gate-dispatch-VALIDATION.md && grep -q "D-01" .planning/phases/GSD-13-gate-dispatch/GSD-13-gate-dispatch-VALIDATION.md && grep -q "D-05" .planning/phases/GSD-13-gate-dispatch/GSD-13-gate-dispatch-VALIDATION.md && grep -q "nyquist_validation" .planning/phases/GSD-13-gate-dispatch/GSD-13-gate-dispatch-VALIDATION.md</verify>
    <acceptance_criteria>
      - test -f .planning/phases/GSD-13-gate-dispatch/GSD-13-gate-dispatch-VALIDATION.md
      - grep -q "D-01" .planning/phases/GSD-13-gate-dispatch/GSD-13-gate-dispatch-VALIDATION.md
      - grep -q "D-05" .planning/phases/GSD-13-gate-dispatch/GSD-13-gate-dispatch-VALIDATION.md
      - grep -q "nyquist_validation" .planning/phases/GSD-13-gate-dispatch/GSD-13-gate-dispatch-VALIDATION.md
    </acceptance_criteria>
    <done>VALIDATION.md exists in the phase directory, maps every locked decision D-01..D-05 to its automated test(s), lists all six tasks' verify commands, and records the green full-suite gate.</done>
  </task>
</tasks>

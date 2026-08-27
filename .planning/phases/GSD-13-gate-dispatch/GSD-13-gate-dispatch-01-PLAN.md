---
phase: 13-gate-dispatch
plan: 01
type: execute
wave: 1
depends_on: []
files_modified: ["lib/gates.js", "test/gates.test.mjs"]
autonomous: true
requirements: ["CQ-03"]
user_setup: []
must_haves:
  truths:
    - "runCapabilityGates produces byte-identical report lines and blockError for the same inputs as before the refactor (behaviour preserved)."
    - "A gate name missing from the dispatcher map throws a clear tool-prefixed error instead of silently misbehaving."
  artifacts:
    - path: "lib/gates.js"
      provides: "GATE_DISPATCH module-level map (name -> { run, format }) and a runCapabilityGates that dispatches through it with a shared data object; defensive throw on unknown gate."
      min_lines: 40
      exports: ["GATE_DISPATCH", "runCapabilityGates"]
  key_links:
    - from: "lib/gates.js GATE_DISPATCH"
      to: "lib/gates.js runCapabilityGates"
      via: "for each enabled gate name, entry = GATE_DISPATCH[name]; entry.run(data) evaluates and entry.format(findings[0]) formats the report detail"
      pattern: "GATE_DISPATCH\\[name\\]"
---
<objective>Replace the if/else-if evaluator chain and the name-based detail ternary in runCapabilityGates (lib/gates.js) with an explicit module-level GATE_DISPATCH map, each entry carrying its evaluator (run) and report-line formatter (format), invoked with a shared data object. Add a defensive fail-fast throw when a gate name is missing from the map. Behaviour of the three evaluators is unchanged; existing runCapabilityGates tests must pass unmodified.</objective>
<context>@lib/gates.js (read first: runCapabilityGates lines 163-194, GATE_NAMES line 196, the three evaluators securityGate/brokenWindowsGate/tddAuditGate lines 54/95/127), @test/gates.test.mjs (runCapabilityGates describe block lines 199-268), @test/gates-ship.test.mjs (CAP-01/CAP-02 runCapabilityGates suites)</context>
<tasks>
  <task type="auto">
    <name>Task 1: Add GATE_DISPATCH map and dispatch runCapabilityGates through it (D-01, D-05)</name>
    <files>lib/gates.js</files>
    <read_first>lib/gates.js</read_first>
    <action>In lib/gates.js, add a module-level constant `const GATE_DISPATCH = { ... }` (UPPER_SNAKE_CASE per CONVENTIONS.md) placed after the three evaluator functions and before runCapabilityGates. Each key is a gate name from GATE_NAMES ("security", "broken_windows", "tdd_audit") and each value is an object `{ run, format }`:
- security: run = (d) => securityGate(d.changedFiles); format = (f) => `${f.file}: matched ${f.pattern}`
- broken_windows: run = (d) => brokenWindowsGate(d.changedFiles, d.contentMap); format = (f) => `${f.file}: ${f.marker}`
- tdd_audit: run = (d) => tddAuditGate(d.plans || [], d.commitSubjects); format = (f) => `${f.planId}: ${f.reason}`
Rewrite runCapabilityGates (lines 163-194): after computing `gates`, build `const data = { changedFiles, contentMap, plans, commitSubjects }` once. In the `for (const name of GATE_NAMES)` loop, KEEP the `if (gate.status === "skipped")` early-continue branch exactly as-is (a skipped gate never runs its evaluator and never blocks — do not route it through the dispatcher). For enabled gates, replace the if/else-if chain (lines 175-177) with `const entry = GATE_DISPATCH[name]; if (!entry) throw new Error(...)` then `const result = entry.run(data)`. Replace the detail ternary (lines 179-183) with `const detail = entry.format(result.findings[0])`. Keep the rest of the loop (reportLines.push, failures.push) unchanged. Export GATE_DISPATCH alongside GATE_NAMES so tests can assert its keys. Do NOT change the three evaluator functions or planScope in this task. IMPORTANT two-wave handoff: planScope still parses plan.id in this wave (plan 02 swaps it to structured plan.phase/plan.plan). Do NOT "helpfully" pre-empt that change here — leave planScope and the tdd-audit plan objects exactly as they are; plan 02 owns that refactor.</action>
    <verify>node --test test/gates.test.mjs test/gates-ship.test.mjs</verify>
    <acceptance_criteria>
      - grep -q "const GATE_DISPATCH" lib/gates.js
      - grep -q "export const GATE_DISPATCH" lib/gates.js
      - grep -q "entry.run(data)" lib/gates.js
      - grep -q "entry.format(result.findings\\[0\\])" lib/gates.js
      - the if/else-if chain on `name === "security"` is gone from runCapabilityGates
      - node --test test/gates.test.mjs test/gates-ship.test.mjs exits 0
    </acceptance_criteria>
    <done>GATE_DISPATCH exists with run+format per gate, runCapabilityGates dispatches through it with a shared data object, the skipped branch is untouched, and the full gates test suite passes unchanged.</done>
  </task>
  <task type="auto">
    <name>Task 2: Defensive throw on a gate name missing from the map (D-04)</name>
    <files>lib/gates.js</files>
    <read_first>lib/gates.js</read_first>
    <action>In the runCapabilityGates loop, ensure the dispatcher lookup is guarded: `const entry = GATE_DISPATCH[name]; if (!entry) throw new Error(\`gsd_ship: no dispatcher entry for gate "${name}"\`)`. The error message must be tool-prefixed with `gsd_ship:` to match the guard-clause error style (CONVENTIONS.md). This is a defensive fail-fast: GATE_NAMES drives iteration so every name should resolve, but a wiring bug must surface immediately rather than silently producing an undefined-call error.</action>
    <verify>node --test test/gates.test.mjs</verify>
    <acceptance_criteria>
      - grep -q "no dispatcher entry for gate" lib/gates.js
      - grep -q "gsd_ship:" lib/gates.js
      - node --test test/gates.test.mjs exits 0
    </acceptance_criteria>
    <done>The dispatcher lookup throws a clear gsd_ship-prefixed error when a gate name is absent from GATE_DISPATCH, and the suite still passes.</done>
  </task>
  <task type="auto">
    <name>Task 3: Pin the dispatcher wiring with a test (D-01, D-04)</name>
    <files>test/gates.test.mjs</files>
    <read_first>test/gates.test.mjs</read_first>
    <action>In test/gates.test.mjs, add a new describe block "GATE_DISPATCH" (or extend the runCapabilityGates describe) that imports GATE_DISPATCH from ../lib/gates.js and asserts: (1) `Object.keys(GATE_DISPATCH).sort()` deep-equals `GATE_NAMES.sort()` so the map keys always align with the iteration source; (2) each entry has both a `run` and a `format` function (typeof === "function"); (3) a lookup for a name not in the map is undefined, and asserting the guard throws — e.g. `assert.throws(() => { const name = "bogus_gate"; const entry = GATE_DISPATCH[name]; if (!entry) throw new Error(\`gsd_ship: no dispatcher entry for gate "${name}"\`); }, /no dispatcher entry/)`. Add a bug-pinning comment noting this guards the D-04 fail-fast contract. Do not modify the existing runCapabilityGates tests in this task.</action>
    <verify>node --test test/gates.test.mjs</verify>
    <acceptance_criteria>
      - grep -q "GATE_DISPATCH" test/gates.test.mjs
      - grep -q "no dispatcher entry" test/gates.test.mjs
      - node --test test/gates.test.mjs exits 0
    </acceptance_criteria>
    <done>A new test pins that GATE_DISPATCH keys equal GATE_NAMES, every entry exposes run+format, and a missing gate name throws the D-04 guard error.</done>
  </task>
</tasks>

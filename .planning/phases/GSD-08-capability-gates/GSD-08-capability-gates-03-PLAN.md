---
phase: 08-capability-gates
plan: 03
type: execute
wave: 3
depends_on: ["GSD-08-capability-gates-02"]
files_modified:
  - test/gates-ship.test.mjs
  - .planning/phases/GSD-08-capability-gates/VALIDATION.md
autonomous: true
requirements: ["CAP-01", "CAP-02"]
user_setup: []
must_haves:
  truths:
    - "A dedicated node --test suite proves CAP-01: runCapabilityGates always emits one Gate Report line per gate carrying pass|fail|skipped, present even when every gate passes (D-07)."
    - "The suite proves CAP-02/D-05: when a required enabled gate fails, blockError names the gate, file and reason, and ship.js would abort before push — verified by a static wiring check that the fail(blockError) call sits before the push block in lib/ship.js."
    - "The suite proves D-06/D-08: a gate disabled in cfg.gates or passed in skip_gates is reported 'skipped' and does not block, while other gates still report their real status."
    - "The suite proves D-09: the tdd-audit gate fails a type:tdd plan with no test: commit before feat:/fix: regardless of any global tdd_mode flag."
    - "VALIDATION.md exists at the phase root and maps every locked decision D-01..D-09 to its named automated test(s), with a task-coverage record proving no 3-consecutive-task window lacks an automated verify (Nyquist dimension 8)."
  artifacts:
    - path: "test/gates-ship.test.mjs"
      provides: "Capability-gate enforcement suite (CAP-01/CAP-02/D-05/D-06/D-07/D-08/D-09) driving runCapabilityGates with deterministic fake cfg/gitData/plans plus a static lib/ship.js wiring check. Runs under node --test."
      min_lines: 120
      exports: []
    - path: ".planning/phases/GSD-08-capability-gates/VALIDATION.md"
      provides: "Nyquist coverage artefact for the phase: maps every locked decision D-01..D-09 to the named automated test(s) in test/gates.test.mjs and test/gates-ship.test.mjs that prove it, plus a task-coverage record proving no 3-consecutive-task window lacks an automated verify. Written at the phase root alongside CONTEXT.md/RESEARCH.md, mirroring GSD-07's artefact."
      min_lines: 30
      exports: []
  key_links:
    - from: "test/gates-ship.test.mjs"
      to: "lib/gates.js runCapabilityGates"
      via: "imports runCapabilityGates and drives it with in-memory fake config, gitData, and plans to assert report lines and blockError deterministically."
      pattern: "runCapabilityGates"
    - from: "test/gates-ship.test.mjs"
      to: "lib/ship.js"
      via: "reads lib/ship.js source text and asserts the capability-gate call + fail(blockError) precede the push block, proving gsd_ship refuses to ship on a failing gate before any push/PR I/O."
      pattern: "gsd_ship preflight failed|push branch"
---
<objective>
Prove the capability-gate gatekeeper's requirements. Add a focused node --test enforcement suite (test/gates-ship.test.mjs) that drives the runCapabilityGates seam with deterministic in-memory data to lock in CAP-01 (every gate's pass/fail/skipped is reported) and CAP-02 (a failing required gate produces a blocking message naming the gate, file and reason, and gsd_ship aborts before push), plus D-05/D-06/D-07/D-08/D-09, and record the D-01..D-09 → automated-test mapping in VALIDATION.md (Nyquist gate). This is the acceptance evidence the verifier uses to mark CAP-01 and CAP-02 met.
</objective>
<context>@.planning/phases/GSD-08-capability-gates/GSD-08-capability-gates-CONTEXT.md (decisions D-05, D-06, D-07, D-08, D-09)
@.planning/phases/GSD-08-capability-gates/GSD-08-capability-gates-RESEARCH.md (Validation Architecture item 5, OQ-4/OQ-6 resolutions)
@lib/gates.js (runCapabilityGates seam built in plan 02)
@lib/ship.js (wiring built in plan 02 — static-check target)
@test/_shared.test.mjs (pure-helper style) and @test/gates.test.mjs (plan 01/02 tests)</context>
<tasks>
<task type="auto">
  <name>Task 1 (TRACER): CAP-01 Gate-Report-always-present suite</name>
  <files>test/gates-ship.test.mjs</files>
  <read_first>lib/gates.js, test/_shared.test.mjs, .planning/phases/GSD-08-capability-gates/GSD-08-capability-gates-CONTEXT.md</read_first>
  <action>Create test/gates-ship.test.mjs importing { runCapabilityGates } from "../lib/gates.js" and assert. Add describe "CAP-01 gate report" with: (a) every-gate-pass: runCapabilityGates({cfg:{}, gitData:{changedFiles:["src/a.js"], contentMap:{"src/a.js":"const x=1;"}, commitSubjects:[]}, plans:[{id:"GSD-08-x-01", type:"execute"}], skipGates:[]}) → reportLines has length 3, each matches /^(security|broken_windows|tdd_audit): pass$/, blockError is null; (b) a mixed run where all three appear (one pass, one skipped, one fail) proving every gate is reported regardless of outcome (D-07). Assert the exact report substrings. Commit atomically as feat(08-03): CAP-01 gate report suite.</action>
  <verify>cd /var/home/jatyeo/dev/dsh-gsd-bundle && node --test test/gates-ship.test.mjs 2>&1 | tail -20</verify>
  <acceptance_criteria>
    - test/gates-ship.test.mjs exists and imports runCapabilityGates
    - grep -q "security: pass\|blockError" test/gates-ship.test.mjs
    - node --test test/gates-ship.test.mjs exits 0
    - git log --format=%s -1 shows "feat(08-03):"
  </acceptance_criteria>
  <done>The suite proves a Gate Report line exists for every gate on every run, satisfying CAP-01's 'reports each gate's pass/fail'.</done>
</task>
<task type="auto">
  <name>Task 2: CAP-02 / D-05 blocking + no-push wiring proof</name>
  <files>test/gates-ship.test.mjs</files>
  <read_first>test/gates-ship.test.mjs, lib/ship.js, .planning/phases/GSD-08-capability-gates/GSD-08-capability-gates-CONTEXT.md</read_first>
  <action>Extend test/gates-ship.test.mjs with describe "CAP-02 blocking": (a) a failing security gate — runCapabilityGates({cfg:{}, gitData:{changedFiles:["a/.env"], contentMap:{}, commitSubjects:[]}, plans:[], skipGates:[]}) → blockError is a non-null string containing "security", ".env"; (b) a failing broken-windows gate — contentMap {"src/a.js":"// TODO"}: blockError contains "broken_windows" and "src/a.js" and "TODO"; (c) a failing tdd-audit gate — plans [{id:"GSD-08-x-01",type:"tdd"}], commitSubjects ["feat(08-01): b"]: blockError contains "tdd_audit" and "GSD-08-x-01"; (d) when blockError is non-null the ship would throw: read lib/ship.js source via fs and assert it contains a call to fail with blockError (pattern /fail\s*\(\s*blockError/) AND that the gate section (containing "## Gate Report" and runCapabilityGates) appears textually before the line whose comment is the "6. push branch" block — proving a failing gate aborts before any push/PR I/O (CAP-02, D-05). Commit atomically as feat(08-03): CAP-02 blocking suite.</action>
  <verify>cd /var/home/jatyeo/dev/dsh-gsd-bundle && node --test test/gates-ship.test.mjs 2>&1 | tail -20</verify>
  <acceptance_criteria>
    - grep -q "broken_windows\|tdd_audit\|fail(blockError)" test/gates-ship.test.mjs
    - the static check asserts the "## Gate Report" position precedes the push-branch marker in lib/ship.js (test passes)
    - node --test test/gates-ship.test.mjs exits 0
    - git log --format=%s -1 shows "feat(08-03):"
  </acceptance_criteria>
  <done>The suite proves a failing required gate yields a blocking message naming gate+file+reason and that gsd_ship aborts before push.</done>
</task>
<task type="auto">
  <name>Task 3: D-06 / D-08 / D-09 skip + tdd enforcement suite</name>
  <files>test/gates-ship.test.mjs</files>
  <read_first>test/gates-ship.test.mjs, lib/gates.js (resolveGatesConfig, tddAuditGate), .planning/phases/GSD-08-capability-gates/GSD-08-capability-gates-CONTEXT.md</read_first>
  <action>Extend test/gates-ship.test.mjs with describe "skip + tdd enforcement": (a) config-disable — runCapabilityGates({cfg:{gates:{security:false}}, gitData:{changedFiles:["a/.env"], contentMap:{}, commitSubjects:[]}, plans:[], skipGates:[]}) → a "security: skipped" report line, blockError null, and broken_windows+tdd_audit still reported (D-08, D-06); (b) skipGates — runCapabilityGates({cfg:{}, gitData:{changedFiles:["a/.env"],...}, plans:[], skipGates:["security"]}) → "security: skipped", blockError null (D-06); (c) config-disable AND skipGates for different gates both respected; (d) D-09 — tdd-audit fails a type:tdd plan with only a feat: commit even though the caller's cfg carries no tdd_mode (cfg:{}) proving enforcement is independent of any global tdd_mode flag. Commit atomically as feat(08-03): skip + tdd enforcement suite.</action>
  <verify>cd /var/home/jatyeo/dev/dsh-gsd-bundle && node --test test/gates-ship.test.mjs 2>&1 | tail -20 && node --test test/*.test.mjs 2>&1 | tail -15</verify>
  <acceptance_criteria>
    - grep -q "security: skipped\|skipGates" test/gates-ship.test.mjs
    - node --test test/gates-ship.test.mjs exits 0
    - node --test test/*.test.mjs exits 0 (full suite green — MOUNT-06)
    - git log --format=%s -1 shows "feat(08-03):"
  </acceptance_criteria>
  <done>The suite proves a skipped gate never blocks, and the tdd-audit gate enforces type:tdd plans regardless of global tdd_mode.</done>
</task>
<task type="auto">
  <name>Task 4: Record the D-01..D-09 to automated-test mapping in VALIDATION.md (Nyquist gate)</name>
  <files>.planning/phases/GSD-08-capability-gates/VALIDATION.md</files>
  <read_first>.planning/phases/GSD-08-capability-gates/GSD-08-capability-gates-CONTEXT.md, .planning/phases/GSD-08-capability-gates/GSD-08-capability-gates-RESEARCH.md, test/gates.test.mjs, test/gates-ship.test.mjs, .planning/phases/GSD-07-uat-conversation/VALIDATION.md</read_first>
  <action>Write the Nyquist coverage artefact for the phase at .planning/phases/GSD-08-capability-gates/VALIDATION.md (the phase root, alongside CONTEXT.md/RESEARCH.md). It is a plain Markdown file that records, for every locked decision D-01..D-09 in CONTEXT.md, the named automated test(s) in test/gates.test.mjs (plan 01/02 unit + integration tests) and test/gates-ship.test.mjs (plan 03 enforcement suite) that prove it, plus the phase-goal truths (CAP-01/CAP-02) those tests back. Structure, mirroring the GSD-07 artefact: a "Nyquist Validation Coverage" heading; a mapping table with columns Decision | Automated test(s) | Phase truth it backs; and a "Task coverage (dimension 8)" subsection listing each task across the three plans with its verify command, proving no 3-consecutive-task window lacks an automated `node --test` verify. Include a final row recording the full-suite gate `node --test test/*.test.mjs`. Commit atomically as feat(08-03): VALIDATION.md Nyquist coverage.</action>
  <verify>test -f .planning/phases/GSD-08-capability-gates/VALIDATION.md && grep -cE 'D-0[1-9]' .planning/phases/GSD-08-capability-gates/VALIDATION.md && grep -n "Nyquist" .planning/phases/GSD-08-capability-gates/VALIDATION.md</verify>
  <acceptance_criteria>
    - test -f .planning/phases/GSD-08-capability-gates/VALIDATION.md exits 0 (artefact created at the phase root)
    - grep -nE 'D-0[1-9]' .planning/phases/GSD-08-capability-gates/VALIDATION.md exits 0 and every locked decision D-01..D-09 appears in the mapping table
    - grep -n "Nyquist" .planning/phases/GSD-08-capability-gates/VALIDATION.md exits 0 (Nyquist coverage heading present)
    - grep -n "node --test test/\*.test.mjs" .planning/phases/GSD-08-capability-gates/VALIDATION.md exits 0 (full-suite gate recorded)
    - git log --format=%s -1 shows "feat(08-03):"
  </acceptance_criteria>
  <done>VALIDATION.md exists at the phase root and maps every locked decision D-01..D-09 to its named automated test(s), plus a task-coverage record proving no 3-consecutive-task window lacks an automated verify (Nyquist dimension 8 satisfied).</done>
</task>
</tasks>

---
phase: 24-composability-hardening
plan: 02
type: execute
wave: 1
depends_on: []
files_modified: ["lib/plan.js", "lib/execute.js", "lib/verify.js", "lib/quick.js", "lib/ui.js", "lib/map-codebase.js", "test/coeffect.test.mjs"]
autonomous: true
requirements: ["DEGR-07"]
gap_closure: false
user_setup: []
must_haves:
  truths:
    - "Each of the six subagent-driven plugins (plan, execute, verify, quick, ui, map-codebase) declares 'subagents' as a hard required coeffect in its inject array, so its fiber stays inactive when the subagents host service is absent."
  artifacts:
    - path: "test/coeffect.test.mjs"
      provides: "Static assertions that each of the six subagent-driven plugins' inject array includes 'subagents' (reads mod.inject from each @dsh-gsd/bundle/<sub> module)."
      min_lines: 20
      exports: []
  key_links:
    - from: "lib/plan.js"
      to: "test/coeffect.test.mjs"
      via: "the static assertion imports each of the six modules and asserts Array.isArray(mod.inject) && mod.inject.includes('subagents')."
      pattern: "subagents"
---
<objective>Declare the subagents coeffect on the six subagent-driven plugins (DEGR-07, D-04): add 'subagents' to the inject array of plan, execute, verify, quick, ui, and map-codebase so their fibers stay inactive when the subagents host service is absent (reactive coeffect activation/deactivation). Prove it with static inject assertions.</objective>
<context>@lib/plan.js (inject line 17), @lib/execute.js (inject line 34), @lib/verify.js (inject line 17), @lib/quick.js (inject line 15), @lib/ui.js (inject line 14), @lib/map-codebase.js (inject line 34), @test/mount.test.mjs (existing inject assertion `Array.isArray(mod.inject)` ~line 208), @test/helpers/mount-harness.mjs (PATCH_ROWS sub list lines 23-36)</context>
<tasks>
  <task type="auto">
    <name>Task 1: add 'subagents' to the six subagent-driven plugins' inject arrays (tracer)</name>
    <files>lib/plan.js, lib/execute.js, lib/verify.js, lib/quick.js, lib/ui.js, lib/map-codebase.js</files>
    <read_first>lib/plan.js, lib/execute.js, lib/verify.js, lib/quick.js, lib/ui.js, lib/map-codebase.js</read_first>
    <action>In each of the six files, change the `const inject = ["gsdState", "tools"];` declaration to `const inject = ["gsdState", "tools", "subagents"];`. The exact lines are: lib/plan.js:17, lib/execute.js:34, lib/verify.js:17, lib/quick.js:15, lib/ui.js:14, lib/map-codebase.js:34. Do not change anything else in these files — the tools already read ctx.get('subagents') and throw if absent, so the hard coeffect is safe (D-04).</action>
    <verify>grep -n 'inject = \["gsdState", "tools", "subagents"\]' lib/plan.js lib/execute.js lib/verify.js lib/quick.js lib/ui.js lib/map-codebase.js</verify>
    <acceptance_criteria>
      - the grep returns exactly six lines, one per plugin file
      - each line reads `const inject = ["gsdState", "tools", "subagents"];`
    </acceptance_criteria>
    <done>All six subagent-driven plugins declare 'subagents' in their inject array.</done>
  </task>
  <task type="auto">
    <name>Task 2: add static inject assertions in test/coeffect.test.mjs</name>
    <files>test/coeffect.test.mjs</files>
    <read_first>test/mount.test.mjs, test/helpers/mount-harness.mjs</read_first>
    <action>Create test/coeffect.test.mjs. Import assert from "node:assert/strict" and test/describe from "node:test". Define the six subagent-driven subs: `["plan", "execute", "verify", "quick", "ui", "map-codebase"]`. In a describe block, for each sub, `const mod = await import(\`@dsh-gsd/bundle/${sub}\`)` and assert `Array.isArray(mod.inject)` and `mod.inject.includes("subagents")` (with a message naming the sub). Also assert `mod.inject.includes("gsdState")` and `mod.inject.includes("tools")` to guard against accidental removal of the existing coeffects.</action>
    <verify>node --test test/coeffect.test.mjs</verify>
    <acceptance_criteria>
      - grep "subagents" test/coeffect.test.mjs returns at least one assertion hit
      - `node --test test/coeffect.test.mjs` exits 0
    </acceptance_criteria>
    <done>test/coeffect.test.mjs statically proves all six subagent-driven plugins declare 'subagents' (and keep gsdState + tools) in their inject arrays.</done>
  </task>
</tasks>

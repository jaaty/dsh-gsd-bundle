---
phase: 21-capability-services
plan: 02
type: execute
wave: 2
depends_on:
  - "GSD-21-capability-services-01"
files_modified:
  - lib/core-tools.js
  - lib/discuss.js
  - lib/ui.js
  - lib/plan.js
  - lib/execute.js
  - lib/verify.js
  - lib/ship.js
  - lib/quick.js
  - lib/map-codebase.js
autonomous: true
requirements: ["DEGR-01"]
user_setup: []
must_haves:
  truths:
    - Applying each step plugin (discuss, ui, plan, execute, verify, ship, quick, map-codebase) and core-tools publishes its camelCase capability service via ctx.provide, observable in the mount harness `provided` map.
    - core-tools publishes BOTH gsdOrient (model-bound orientation surface) and gsdJobs (model-agnostic job surface) from its single apply (D-01).
    - No plugin's `inject` array or tool registration behaviour is changed; publishing capabilities is purely additive and effect-scoped (D-09).
  artifacts:
    - path: "lib/core-tools.js"
      provides: "Adds ctx.provide('gsdOrient', buildCapability('gsdOrient')) and ctx.provide('gsdJobs', buildCapability('gsdJobs')) in apply — the split model-bound/model-agnostic surface (D-01)."
      min_lines: 5
      exports: ["apply"]
  key_links:
    - from: "lib/core-tools.js"
      to: "lib/_capabilities.js"
      via: "import { buildCapability } from './_capabilities.js' and call ctx.provide('gsdOrient', ...) / ctx.provide('gsdJobs', ...)"
      pattern: "ctx\\.provide\\(\\\"gsdOrient\\\", buildCapability\\(\\\"gsdOrient\\\"\\)\\)"
    - from: "lib/plan.js"
      to: "lib/_capabilities.js"
      via: "import { buildCapability } and ctx.provide('gsdPlan', ...) in apply; same pattern in discuss/ui/execute/verify/ship/quick/map-codebase"
      pattern: "ctx\\.provide\\(\\\"gsdPlan\\\""
---
<objective>
Make every step plugin publish the capability it provides (DEGR-01) by adding one `ctx.provide(capabilityKey, buildCapability(capabilityKey))` call to each of the 8 step plugins' `apply`, plus two provides (gsdOrient + gsdJobs) in core-tools (D-01/D-09). Capabilities ride the plugin's own fiber lifecycle as auto-tracked revertible effects, so retiring the plugin withdraws the capability with no manual dispose (D-09). No tool behaviour, no `inject` change, no persona/state rendering (D-06) — publishing only.
</objective>
<context>
- @lib/_capabilities.js — the builder + keys created by Plan 01 (import buildCapability)
- @lib/discuss.js, @lib/ui.js, @lib/plan.js, @lib/execute.js, @lib/verify.js, @lib/ship.js, @lib/quick.js, @lib/map-codebase.js — each has `inject=["gsdState","tools"]` and registers its tool(s) in apply
- @lib/core-tools.js — registers 5 tools; apply is where the two provides must go
- @lib/state.js — the existing `ctx.provide("gsdState", svc)` idiom to mirror
- @.planning/phases/GSD-21-capability-services/GSD-21-capability-services-CONTEXT.md — D-01 split, D-02 camelCase keys/provide/get, D-04 mapping, D-09 publish mechanism (do NOT change any inject), D-06 persona untouched
</context>
<tasks>
  <task type="auto">
    <name>Task 1 (tracer): publish gsdOrient + gsdJobs in lib/core-tools.js</name>
    <files>lib/core-tools.js</files>
    <read_first>lib/core-tools.js, lib/_capabilities.js</read_first>
    <action>
      At the top of lib/core-tools.js add the import: `import { buildCapability } from "./_capabilities.js";` (alongside the existing imports of defineTool, jobs.js, _runner.js).

      Inside `apply(ctx)`, after the `const gsd = () => ctx.get("gsdState");` line and BEFORE the first ctx.tools.register block, add exactly two ctx.provide calls (per D-01 the split: gsdOrient = model-bound orientation surface; gsdJobs = model-agnostic):
      - ctx.provide("gsdOrient", buildCapability("gsdOrient"));
      - ctx.provide("gsdJobs", buildCapability("gsdJobs"));

      Do not modify the `inject` array (stays ["gsdState","tools"], D-09) and do not touch any tool registration. core-tools remains one module; both provides live in its single apply (per CONTEXT discretion).
    </action>
    <verify>node -e "import('./lib/core-tools.js').then(m => { if (typeof m.apply !== 'function') process.exit(1); console.log('core-tools ok'); })"    
    </verify>
    <acceptance_criteria>
      - grep-verifiable in lib/core-tools.js: import of buildCapability.
      - grep-verifiable: two ctx.provide calls for gsdOrient and gsdJobs.
      - grep-verifiable: inject array ["gsdState","tools"] unchanged (D-09).
    </acceptance_criteria>
    <done>core-tools.js imports buildCapability and publishes exactly gsdOrient + gsdJobs from its single apply, with inject and tool registrations untouched.</done>
  </task>
  <task type="auto">
    <name>Task 2: publish the per-step capability in each of the 8 step plugins</name>
    <files>lib/discuss.js, lib/ui.js, lib/plan.js, lib/execute.js, lib/verify.js, lib/ship.js, lib/quick.js, lib/map-codebase.js</files>
    <read_first>lib/plan.js, lib/_capabilities.js</read_first>
    <action>
      For each step plugin file below, add one camelCase capability publish inside its apply(ctx) (DEGR-01, D-02, D-09). Follow the same template: add `import { buildCapability } from "./_capabilities.js";` at the top alongside the file's existing imports; then inside apply, near the top before its first ctx.tools.register, add exactly one ctx.provide call.

      Key per file:
      - lib/discuss.js -> gsdDiscuss (tool gsd_discuss)
      - lib/ui.js -> gsdUi (tool gsd_ui_phase)
      - lib/plan.js -> gsdPlan (tool gsd_plan)
      - lib/execute.js -> gsdExecute (tool gsd_execute)
      - lib/verify.js -> gsdVerify (tool gsd_verify)
      - lib/ship.js -> gsdShip (tool gsd_ship)
      - lib/quick.js -> gsdQuick (tool gsd_quick)
      - lib/map-codebase.js -> gsdMapCodebase (tools gsd_map_codebase, gsd_intel_updater)

      Per file add: `ctx.provide("<KEY>", buildCapability("<KEY>"));`

      Do NOT change any inject array (all stay ["gsdState","tools"], D-09). Do NOT touch tool registry logic, tool names, or behaviour. Do NOT add provides to lib/persona.js or lib/state.js (D-06, persona/state rendering is out of scope). Do NOT touch lib/commands.js (that is Plan 03).
    </action>
    <verify>for f in discuss ui plan execute verify ship quick map-codebase; do node -e "import('./lib/$f.js').then(m => { if (typeof m.apply !== 'function') throw new Error('no apply'); })" || exit 1; done; echo 'all 8 step plugins import ok'
    
    </verify>
    <acceptance_criteria>
      - grep-verifiable: each of the 8 files contains `ctx.provide("gsd` for its own key.
      - Existing per-plugin smoke suites (test/tools.test.mjs, test/service-tools.test.mjs, test/mount.test.mjs) still pass with the added ctx.provide calls (their fake-ctx provide() is a no-op).
      - grep-verifiable: no step plugin file changed its `const inject` line.
    </acceptance_criteria>
    <done>Each of the 8 step plugins publishes its own capability from apply, with inject and tool behaviour unchanged.</done>
  </task>
  <task type="auto">
    <name>Task 3: verify all 10 capabilities are published with distinct keys and the suite stays green</name>
    <files>lib/_capabilities.js</files>
    <read_first>lib/_capabilities.js</read_first>
    <action>
      Run the full test suite to confirm the publishes are purely additive (DEGR-01 complete, D-09 no regressions): `npm test` (node --test test/*.test.mjs). The existing per-plugin smoke tests build fake-ctxs with a no-op `provide() {}`, so the added ctx.provide calls must leave them green.

      Also confirm the 10 capability keys are distinct (no duplicate-provide collision): import lib/_capabilities.js and assert CAPABILITY_KEYS has exactly 10 unique camelCase entries, and that core-tools' two keys (gsdOrient, gsdJobs) are distinct from the 8 step keys.
    </action>
    <verify>npm test; and node -e "import('./lib/_capabilities.js').then(m => { const u = new Set(m.CAPABILITY_KEYS); if (u.size !== 10) process.exit(1); console.log('10 distinct keys ok'); })"
    
    </verify>
    <acceptance_criteria>
      - npm test exits 0.
      - grep-verifiable: the 10 CAPABILITY_KEYS are all camelCase (start with 'gsd' + uppercase letter).
      - Duplicate-provide check passes (Set size === 10).
    </acceptance_criteria>
    <done>The full suite is green with all 10 capabilities published and distinct.</done>
  </task>
</tasks>

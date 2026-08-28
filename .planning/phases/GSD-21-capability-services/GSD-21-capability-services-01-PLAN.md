---
phase: 21-capability-services
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - lib/_capabilities.js
  - test/_capabilities.test.mjs
autonomous: true
requirements: ["DEGR-01"]
user_setup: []
must_haves:
  truths:
    - Importing lib/_capabilities.js yields a descriptor for each of the 10 known capability keys with the documented shape { key, step, role, tools[], commands[], order, prereq, next, produces[], consumes[] }.
    - Sorting the step capabilities by their order value reproduces the loop chain discuss -> ui -> plan -> execute -> verify -> ship, with quick and map-codebase sorted off the main chain.
    - Constructing a descriptor for malformed input (missing step/tools/commands, unknown key, non-finite order) throws synchronously, while every valid key builds cleanly.
  artifacts:
    - path: "lib/_capabilities.js"
      provides: "The single source of truth for the 10 capability descriptors, the known-key list, the role enum, and the buildCapability builder plus fail-loud validation."
      min_lines: 60
      exports: ["ROLES", "CAPABILITY_KEYS", "buildCapability"]
  key_links:
    - from: "test/_capabilities.test.mjs"
      to: "lib/_capabilities.js"
      via: "import { ROLES, CAPABILITY_KEYS, buildCapability } from \"../lib/_capabilities.js\" and assert every key/dimension"
      pattern: "buildCapability\\(\\\"gsdPlan\\\"\\)"
---
<objective>
Create the pure helper module lib/_capabilities.js (following the existing lib/_shared.js no-ctx/no-I-O pattern, per D-05) that is the single source of truth for all 10 capability descriptors: the known-key list, the role enum, and a buildCapability(key) builder that returns a rich descriptor and fails loud on malformed input (D-10). Add a focused unit test test/_capabilities.test.mjs proving the descriptor model, the D-04 mapping, the role enum, the order-sorted chain, and the fail-loud validation. This is the foundation every other plan in the phase imports from.
</objective>
<context>
- @lib/_shared.js — the pure-helper module pattern this new module mirrors (no ctx, no I/O, plain ESM, no new deps)
- @lib/state.js (the existing ctx.provide("gsdState", svc) camelCase idiom, ~line 669 — for consistent key naming)
- @.planning/phases/GSD-21-capability-services/GSD-21-capability-services-CONTEXT.md — decisions D-01..D-11 (esp. D-02 camelCase keys, D-03 descriptor shape + role enum, D-04 per-plugin mapping table, D-05 module pattern, D-10 fail-loud, D-11 order values)
- @.planning/phases/GSD-21-capability-services/GSD-21-capability-services-RESEARCH.md — counts correction (14 tools/12 commands), zero-dep invariant, §5 _capabilities.js test design
</context>
<tasks>
  <task type="auto">
    <name>Task 1 (tracer): create lib/_capabilities.js with the descriptor table and buildCapability builder</name>
    <files>lib/_capabilities.js</files>
    <read_first>lib/_shared.js, .planning/phases/GSD-21-capability-services/GSD-21-capability-services-CONTEXT.md</read_first>
    <action>
      Create lib/_capabilities.js as a plain ESM module with NO non-first-party imports (zero-dep invariant — only import from existing bundle modules if any, else nothing). Export:
      - ROLES: a frozen array (or Set) of the 6 roles per D-03: ["step","optional","alternate","onboarding","orient","jobs"].
      - CAPABILITY_KEYS: a frozen, ordered array of the 10 camelCase keys exactly as in D-02/specs: gsdMapCodebase, gsdOrient, gsdJobs, gsdDiscuss, gsdUi, gsdPlan, gsdQuick, gsdExecute, gsdVerify, gsdShip (the ordering that places gsdMapCodebase(0) and gsdOrient/gsdJobs(-1 sentinel) first, then the loop chain in order).
      - buildCapability(key): a function returning a frozen descriptor { key, step, role, tools, commands, order, prereq, next, produces, consumes }.

      Define a private static table (the single source of truth, D-04) keyed by capability key. Populate it EXACTLY per the D-04/specs mapping:
      - gsdOrient: tools=[gsd_init, gsd_status, gsd_progress, gsd_new_milestone], commands=[gsd-init, gsd-status, gsd-progress, gsd-new-milestone], role=orient, order=-1 (sentinel, not loop-ordered).
      - gsdJobs: tools=[gsd_job], commands=[], role=jobs, order=-1 (sentinel).
      - gsdDiscuss: tools=[gsd_discuss], commands=[gsd-discuss-phase], role=step, order=10.
      - gsdUi: tools=[gsd_ui_phase], commands=[gsd-ui-phase], role=optional, order=15.
      - gsdPlan: tools=[gsd_plan], commands=[gsd-plan-phase], role=step, order=20.
      - gsdQuick: tools=[gsd_quick], commands=[gsd-quick], role=alternate, order=25.
      - gsdExecute: tools=[gsd_execute], commands=[gsd-execute-phase], role=step, order=30.
      - gsdVerify: tools=[gsd_verify], commands=[gsd-verify-work], role=step, order=40.
      - gsdShip: tools=[gsd_ship], commands=[gsd-ship], role=step, order=50.
      - gsdMapCodebase: tools=[gsd_map_codebase, gsd_intel_updater], commands=[gsd-map-codebase], role=onboarding, order=0.
      For every capability set `step` to a short human label of the loop step (e.g. gsdDiscuss.step = "discuss"). Set prereq/next/produces/consumes per the CONTEXT specifics (advisory metadata stored now, NOT enforced): discuss produces CONTEXT.md; plan prereq=discuss consumes CONTEXT.md produces PLAN.md; execute prereq=plan consumes PLAN.md produces SUMMARY.md; verify prereq=execute consumes SUMMARY.md produces VERIFICATION.md; ship prereq=verify consumes VERIFICATION.md; ui prereq=discuss produces UI-SPEC.md; gsdQuick/gsdMapCodebase/gsdOrient/gsdJobs carry empty prereq/next/produces/consumes.

      buildCapability must be fail-loud (D-10): throw an Error with the offending capability key when:
      - key is not one of CAPABILITY_KEYS (unknown key),
      - required fields are missing/empty: step, role, tools (array, non-empty), commands (array — may be empty for gsdJobs),
      - role is not a member of ROLES,
      - order is not a finite number (Number.isFinite(order) false).
      Do not mutate the shared table entry; return a fresh frozen copy so callers cannot corrupt the source of truth.
    </action>
    <verify>node -e "import('./lib/_capabilities.js').then(m => { const d = m.buildCapability('gsdPlan'); if (d.tools[0] !== 'gsd_plan' || d.commands[0] !== 'gsd-plan-phase') process.exit(1); let threw=false; try { m.buildCapability('gsdNope'); } catch { threw=true; } if (!threw) process.exit(1); console.log('ok', m.CAPABILITY_KEYS.length); })"</verify>
    <acceptance_criteria>
      - File lib/_capabilities.js exists, exports ROLES, CAPABILITY_KEYS, buildCapability.
      - grep-verifiable: buildCapability throws for an unknown key (task 1's node -e exit code 0 proves it).
      - CAPABILITY_KEYS.length === 10.
    </acceptance_criteria>
    <done>lib/_capabilities.js is authored, parses cleanly, exports the three names, and buildCapability returns a correct rich descriptor for a valid key and throws for an unknown key — verified by the node -e command.</done>
  </task>
  <task type="auto">
    <name>Task 2: add test/_capabilities.test.mjs proving the descriptor model, role enum, order chain, and fail-loud validation</name>
    <files>test/_capabilities.test.mjs</files>
    <read_first>lib/_capabilities.js, lib/_shared.js</read_first>
    <action>
      Create test/_capabilities.test.mjs using node:test + assert/strict (matching the existing test suite style, e.g. test/mount.test.mjs). Import { ROLES, CAPABILITY_KEYS, buildCapability } from "../lib/_capabilities.js". Assert:
      1. CAPABILITY_KEYS is an array of length 10 and includes every one of: gsdOrient, gsdJobs, gsdDiscuss, gsdUi, gsdPlan, gsdExecute, gsdVerify, gsdShip, gsdQuick, gsdMapCodebase (DEGR-01 key surface).
      2. ROLES.deepEqual(["step","optional","alternate","onboarding","orient","jobs"]) (D-03 role enum).
      3. For each key in CAPABILITY_KEYS, buildCapability(key) returns an object whose own shape includes key, step, role, tools (array), commands (array), order (finite number), prereq, next, produces, consumes (D-03 shape).
      4. The D-04 mapping is exact: buildCapability("gsdOrient").tools deepEquals ["gsd_init","gsd_status","gsd_progress","gsd_new_milestone"]; its commands deepEquals ["gsd-init","gsd-status","gsd-progress","gsd-new-milestone"]; buildCapability("gsdJobs").commands is an empty array; buildCapability("gsdMapCodebase").tools deepEquals ["gsd_map_codebase","gsd_intel_updater"].
      5. role values match specs: gsdDiscuss/gsdPlan/gsdExecute/gsdVerify/gsdShip .role === "step"; gsdUi === "optional"; gsdQuick === "alternate"; gsdMapCodebase === "onboarding"; gsdOrient === "orient"; gsdJobs === "jobs".
      6. Chain-sort (D-11): filter the loop-step descriptors (discuss, ui, plan, execute, verify, ship), sort by order, and assert the sorted keys are exactly ["gsdDiscuss","gsdUi","gsdPlan","gsdExecute","gsdVerify","gsdShip"]. Also assert gsdQuick(25) sorts between gsdUi(15) and gsdExecute(30) and gsdMapCodebase(0) sorts before gsdDiscuss(10).
      7. Fail-loud (D-10): assert.throws(() => buildCapability("gsdUnknownKey")); assert.throws(() => buildCapability that is forced malformed — e.g. buildCapability with a non-finite order via a test-only path OR assert the order values are all Number.isFinite across CAPABILITY_KEYS (cover the non-finite-order guard with a direct finite-check over all 10 descriptors rather than faking malformed table state).
    </action>
    <verify>node --test test/_capabilities.test.mjs</verify>
    <acceptance_criteria>
      - node --test test/_capabilities.test.mjs exits 0 (all assertions pass).
      - grep-verifiable: "CAPABILITY_KEYS" and "ROLES" are imported in test/_capabilities.test.mjs.
      - The chain-sort assertion proves discuss->ui->plan->execute->verify->ship ordering.
    </acceptance_criteria>
    <done>test/_capabilities.test.mjs passes and provably covers the key surface (10), role enum, D-04 mapping, order chain, and fail-loud validation.</done>
  </task>
</tasks>

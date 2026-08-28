---
phase: 22-reactive-loop-rendering
plan: 03
type: execute
wave: 2
depends_on: ["GSD-22-reactive-loop-rendering-01"]
files_modified: ["lib/core-tools.js"]
autonomous: true
requirements: ["DEGR-04"]
user_setup: []
must_haves:
  truths:
    - gsd_status rewrites/replaces a stored next_action whose step capability is absent, never advertising an absent step as actionable (D-04, DEGR-04).
    - gsd_status prints an ordered `Available steps` section derived from the present capabilities, degrading to an explicit no-loop message in the zero-loop case (D-04/D-06/D-08).
  artifacts:
    - path: "lib/core-tools.js"
      provides: "capability-aware gsd_status + gsd_progress consuming lib/_render.js for next_action routing and the Available steps section"
      min_lines: 120
      exports: []
  key_links:
    - from: "lib/core-tools.js"
      to: "lib/_render.js"
      via: "gsd_status/gsd_progress import and call effectiveRoutableStep + renderAvailableSteps with a (k)=>ctx.get(k) thunk"
      pattern: "import \\{[^}]*\\} from \"\\./_render\\.js\""
---
<objective>
Make gsd_status and gsd_progress capability-aware (DEGR-04) so the loop never routes into / advertises an absent step. gsd_status reads the present capability descriptors via ctx.get at execute time, rewrites `Next action` through lib/_render's effectiveRoutableStep (per D-04), and adds an ordered `Available steps` section (per D-08). gsd_progress routes its final `Next action` line through the same helper so the "no missing tool instructed" promise holds on both surfaces (RESEARCH Risk 1.4, planner decision). lib/state.js stays untouched (D-05) — routing is done purely by the read-time wrapper. Only lib/core-tools.js is modified in this plan.
</objective>
<context>@.planning/phases/GSD-22-reactive-loop-rendering/GSD-22-reactive-loop-rendering-CONTEXT.md
@.planning/phases/GSD-22-reactive-loop-rendering/GSD-22-reactive-loop-rendering-RESEARCH.md
@lib/core-tools.js
@lib/_render.js
@lib/_capabilities.js
@lib/state.js</context>
<tasks>
  <task type="auto">
    <name>Task 1: gsd_status routes next_action through capabilities and prints an Available steps section (D-04/D-06/D-08)</name>
    <files>lib/core-tools.js</files>
    <read_first>lib/core-tools.js, lib/_render.js, lib/_capabilities.js</read_first>
    <action>
      In lib/core-tools.js add an import next to the existing imports (lines 9-10): `import { availableCapabilities, effectiveRoutableStep, renderAvailableSteps, NO_LOOP_NOTICE } from "./_render.js";`. Keep the existing `buildCapability` import (still used to publish gsdOrient/gsdJobs at lines 36-37).

      Inside the gsd_status execute closure (lines 112-175), after `const fm = state.frontmatter;` (line 119) compute the present capabilities once: `const caps = availableCapabilities((k) => ctx.get(k));`. gsd_status must NEVER throw over an absent/malformed capability (D-07), so compute `routable` in a `.catch()` that degrades to handling: `const routable = (() => { try { return effectiveRoutableStep(fm.next_action, caps); } catch { return null; } })();`.

      Rewrite the `Next action` line (currently line 126): replace `Next action: ${fm.next_action || "(none)"}` with a capability-routed value computed as: if fm.next_action is present AND that step's capability is itself present, print the original `fm.next_action`; else if `routable` is a descriptor, print `` `${routable.step}-phase` `` (the nearest available step's step name); else print `NO_LOOP_NOTICE` (the literal string "no available loop step"). To know whether the original next_action's capability is present, use the phase-01 helper `capabilityKeyForNextAction(fm.next_action)`; if it returns a key and caps includes a descriptor with that key, keep `fm.next_action`. Never print the verbatim stored next_action when its capability is absent.

      Add an `## Available steps` section: after the Progress line (line 127) and before the `## Phases` section (line 129), push `"", "## Available steps", ...renderAvailableSteps(caps).split("\n")`. In the zero-loop case this section contains the `no available loop step` line via the helper (D-06), so absent steps are never advertised as actionable.
    </action>
    <verify>node --test test/render.test.mjs</verify>
    <acceptance_criteria>
      - grep lib/core-tools.js for "effectiveRoutableStep", "renderAvailableSteps", "availableCapabilities", "NO_LOOP_NOTICE" (imported + used in gsd_status).
      - grep lib/core-tools.js for "## Available steps".
      - node --test test/render.test.mjs still exits 0 (phase-01 helper unaffected).
    </acceptance_criteria>
    <done>gsd_status routes next_action and prints an available-steps section through the single helper; no absent step is advertised.</done>
  </task>

  <task type="auto">
    <name>Task 2: gsd_progress next-action line routes through the same helper (Research Risk 1.4)</name>
    <files>lib/core-tools.js</files>
    <read_first>lib/core-tools.js, lib/_render.js</read_first>
    <action>
      In lib/core-tools.js, gsd_progress execute closure (lines 185-210), replace line 208 `lines.push("", `Next action: ${state.frontmatter.next_action || "(none)"}`)` with the same capability-routed treatment as Task 1 (consume the already-imported availableCapabilities / effectiveRoutableStep / NO_LOOP_NOTICE). Compute `const caps = availableCapabilities((k) => ctx.get(k));` early in the closure, route the next action exactly as in Task 1's rule (present capability keeps the original; else nearest present step's `-phase`; else NO_LOOP_NOTICE), wrapped in the same try/catch never-throw guard. This keeps gsd_progress from ever instructing a missing tool (D-04's no-missing-tool promise extended to the second surface).
    </action>
    <verify>node --test test/render.test.mjs && (node -e "import('./lib/core-tools.js').then(()=>console.log('core-tools loads')).catch(e=>{console.error(e.message);process.exit(1)})")
    <acceptance_criteria>
      - grep lib/core-tools.js for "availableCapabilities" appearing in both the gsd_status and gsd_progress closures (Task 1 + Task 2).
      - node --test test/render.test.mjs exits 0.
      - node -e import of lib/core-tools.js succeeds (no syntax/import error).
    </acceptance_criteria>
    <done>gsd_progress routes its next-action line through the helper so no absent-step tool is ever instructed on either surface; both closures share the single source (D-09).</done>
  </task>
</tasks>
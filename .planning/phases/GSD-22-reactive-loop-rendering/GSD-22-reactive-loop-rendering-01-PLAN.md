---
phase: 22-reactive-loop-rendering
plan: 01
type: execute
wave: 1
depends_on: []
files_modified: ["lib/_render.js", "test/render.test.mjs"]
autonomous: true
requirements: ["DEGR-02", "DEGR-04"]
user_setup: []
must_haves:
  truths:
    - A pure module lib/_render.js lets a caller read the currently-available loop-step capabilities (via a getCapability thunk) and derive the ordered loop-step list + informational list, an effective routable next step, and the full persona body — so absent steps are omitted and never instructed.
    - lib/_render.js holds NO module-level ctx and performs NO I/O — it follows the lib/_shared.js pure-helper pattern and takes capabilities in, returns text/route out.
  artifacts:
    - path: "lib/_render.js"
      provides: "pure capability-aware render/routing helper single-sourcing available-step ordering, next-action routing, and the persona body"
      min_lines: 100
      exports: ["availableCapabilities", "capabilityKeyForNextAction", "loopSteps", "informationEntries", "effectiveRoutableStep", "renderAvailableSteps", "renderPersonaBody"]
    - path: "test/render.test.mjs"
      provides: "offline unit tests for the pure helper (ordering, routing, persona omit-absent, tool-never-instructed)"
      min_lines: 80
      exports: []
  key_links:
    - from: "lib/_render.js"
      to: "lib/_capabilities.js"
      via: "imports CAPABILITY_KEYS, NOT_LOOP_ORDERED, buildCapability (and capabilityForTool on TABLE.tools) as the single-source vocabulary"
      pattern: "import \\{ CAPABILITY_KEYS[^}]*\\} from \"\\./_capabilities\\.js\""
    - from: "test/render.test.mjs"
      to: "lib/_render.js"
      via: "imports the helper exports and drives them with fabricated descriptor arrays / a getCapability stub"
      pattern: "import \\{[^}]*\\} from \"\\.\\./lib/_render\\.js\""
---
<objective>
Build the single-source, pure-by-construction capability render/routing helper `lib/_render.js` (D-09) that both the persona and gsd_status will consume in plans 02/03, plus its own offline unit tests. This is the tracer slice: it takes a `getCapability(key)` thunk (bound by the caller to `ctx.get`) and produces (1) the ordered available loop-step + information lists, (2) the effective routable next step for a stored next_action string, (3) the `Available steps` rendering, and (4) the full persona body with absent steps/tools omitted. It never holds a module-level ctx and never does I/O, so it is unit-testable without a Cordis boot.
</objective>
<context>@.planning/phases/GSD-22-reactive-loop-rendering/GSD-22-reactive-loop-rendering-CONTEXT.md
@.planning/phases/GSD-22-reactive-loop-rendering/GSD-22-reactive-loop-rendering-RESEARCH.md
@lib/_capabilities.js
@lib/_shared.js
@lib/persona.js
@lib/state.js</context>
<tasks>
  <task type="auto">
    <name>Task 1: capability collection + loop-step ordering + next-action routing primitives (tracer)</name>
    <files>lib/_render.js, test/render.test.mjs</files>
    <read_first>lib/_capabilities.js, lib/persona.js</read_first>
    <action>
      Create lib/_render.js as a plain-ESM, no-ctx, no-I/O pure-helper module (mirror lib/_shared.js header convention: a top comment stating it is the phase-22 capability-aware render/routing helper). Start the file with: `import { CAPABILITY_KEYS, NOT_LOOP_ORDERED, buildCapability, capabilityForTool } from "./_capabilities.js";` — note you must FIRST add the pure export `capabilityForTool(tool)` to lib/_capabilities.js that returns the capability key whose descriptor `tools` includes the given tool name (derived from the existing TABLE rows via buildCapability; returns undefined for an unknown tool). This keeps the tool→capability mapping single-sourced with the descriptors (D-02).

      Implement these exports:
      - `availableCapabilities(getCap)`: `getCap` is a callable `(key) => descriptor` thunk (the caller passes `(k) => ctx.get(k)`). Iterate CAPABILITY_KEYS, call getCap(key), and collect each truthy result that is an object (use `!!d && typeof d === "object"`). Filter out null/undefined. Do NOT throw when a key returns undefined (absent capability). Return the array in CAPABILITY_KEYS order. To stay testable and to tolerate a getCap that is not a function, the signature is `availableCapabilities(getCap, descriptors)` optional second arg = pre-supplied array used when getCap is omitted; the function returns the descriptors array directly in that case.
      - `capabilityKeyForNextAction(nextAction)`: pure string→key mapping. Map exactly `"discuss-phase"->"gsdDiscuss"`, `"ui-phase"->"gsdUi"`, `"plan-phase"->"gsdPlan"`, `"execute-phase"->"gsdExecute"`, `"verify-phase"->"gsdVerify"`, `"ship-phase"->"gsdShip"`, `"done"->null`, and any null/undefined/empty/unknown -> null. Implement via the transformation `("gsd" + strip("-phase") + Capitalize)` against a known set so state.js `_nextActionFor` and this helper cannot drift (see state.js line 347 for the source strings).
      - `loopSteps(descriptors)`: filter descriptors whose `role` is in `["step","optional","alternate"]` and sort ascending by `descriptor.order` (10→15→20→25→30→40→50). Return the sorted array. Pure over the input.
      - `informationEntries(descriptors)`: filter descriptors whose `role` is in `["orient","jobs","onboarding"]`, preserving the CAPABILITY_KEYS input order (they are NOT loop-ordered — see NOT_LOOP_ORDERED).
      - `effectiveRoutableStep(nextAction, descriptors)`: derive `key = capabilityKeyForNextAction(nextAction)`. Build `loop = loopSteps(descriptors)`. If `key` is non-null and a loop step with that key is present, return that descriptor. Else, if `key` is non-null, return the first loop step whose `order` is strictly greater than the (would-be) step's order (look up order from the TABLE via buildCapability(key)); if none is strictly greater, return null. If `key` is null, return the first present loop step by ascending order (the default "discuss-phase" fallback), else null. This is D-04/D-06/D-10: routability depends ONLY on capability presence, never on prereq/artifact existence.
      Write the tracer unit tests in a new test/render.test.mjs using node:test + node:assert/strict (mirror the harness style at test/mount.test.mjs:9-10): build a full descriptor array via CAPABILITY_KEYS.map(buildCapability), then a subset missing e.g. gsdVerify; assert loopSteps ordering equals [discuss,ui,plan,quick,execute,verify,ship]-by-order; assert capabilityKeyForNextAction round-trips all six strings; assert effectiveRoutableStep keeps a present step, advances to the nearest greater present step when the target is absent, and returns null when no loop step remains.
    </action>
    <verify>node --test test/render.test.mjs</verify>
    <acceptance_criteria>
      - `node --test test/render.test.mjs` exits 0.
      - grep lib/_capabilities.js for "export function capabilityForTool" (present).
      - grep lib/_render.js for "loopSteps|informationEntries|effectiveRoutableStep|availableCapabilities|capabilityKeyForNextAction" (all present).
    </acceptance_criteria>
    <done>Routing + ordering primitives implemented and unit-tested; the tracer proves absent steps are excluded from the ordered list and an absent next-action step routes to the nearest present step or null.</done>
  </task>

  <task type="auto">
    <name>Task 2: Available-steps rendering (D-08 stable ordering) + no-looplevel notice</name>
    <files>lib/_render.js, test/render.test.mjs</files>
    <read_first>lib/_capabilities.js</read_first>
    <action>
      Add `renderAvailableSteps(descriptors)` to lib/_render.js: returns a string suitable as an `## Available steps` body for gsd_status. Produce two ordered sub-lists:
      1. Loop steps: `loopSteps(descriptors)` — render each as `- <step>: <key> (order <order>)` using descriptor.step and descriptor.key.
      2. Informational: `informationEntries(descriptors)` in CAPABILITY_KEYS position — render each as `- <step>: <key>`.
      When there are no loop steps at all (empty loopSteps result), return a single line `- no available loop step` (this is the D-06 zero-loop case so gsd_status still shows a section). Never throw over an empty or malformed descriptors array.
      Add a constant `NO_LOOP_NOTICE` exporting the exact string `"no available loop step"` and a helper `renderNoLoopNotice()` returning that string, so the snapshot and gsd_status reuse one spelling.
      Extend test/render.test.mjs: assert renderAvailableSteps on the full set lists `discuss` before `verify` and includes an informational entry; assert that on a set with zero loop roles it returns the `no available loop step` line and does NOT throw; assert the loop sub-list uses ascending descriptor.order.
    </action>
    <verify>node --test test/render.test.mjs</verify>
    <acceptance_criteria>
      - grep lib/_render.js for "renderAvailableSteps" and "NO_LOOP_NOTICE".
      - test asserts the informational vs loop split and the zero-loop fallback line.
    </acceptance_criteria>
    <done>Available-steps text and the zero-loop notice are single-sourced and tested; ordering matches D-08 (loop by descriptor.order, informational by CAPABILITY_KEYS position).</done>
  </task>

  <task type="auto">
    <name>Task 3: renderPersonaBody (static core + per-step paragraphs, omit absent, never instruct a missing tool)</name>
    <files>lib/_render.js, test/render.test.mjs</files>
    <read_first>lib/persona.js, lib/capabilities.js</read_first>
    <action>
      Add `renderPersonaBody(descriptors)` to lib/_render.js — returns the full persona text string for the persona `gsd:persona` section (D-01). It must:
      - Emit the static core unconditionally, but with every specific gsd_* tool mention capability-gated: (a) the operating-rule "Always orient with gsd_status (reads STATE.md) before acting." renders only when a descriptor with key `gsdOrient` is present (otherwise omit that sentence); (b) the scoping-discipline phrase "...below the loop's threshold — use gsd_quick for that. When in doubt, split." renders only when `gsdQuick` is present (otherwise render the sentence without "use gsd_quick for that"); (c) the fresh-context rule "Use fresh-context subagents (the gsd_plan / gsd_execute / gsd_verify tools spawn them)" lists gsd_plan / gsd_execute / gsd_verify only for the capabilities present among gsdPlan/gsdExecute/gsdVerify (render only the present ones; if none, render the rule generically as "(the loop phase tools spawn them)").
      - Render the static core opening (the "You are a Git Ship Done (GSD) engineering agent." paragraph WITHOUT any step tool name), the framing line "Discuss -> (UI design, optional) -> Plan -> Execute -> Verify -> Ship", the ".planning/ directory is durable memory..." paragraph, scoping discipline, and operating rules (with the gating above). The static core must NOT name any step-specific tool other than the gated gsd_status/gsd_quick/gsd_plan/gsd_execute/gsd_verify mentions.
      - Render the per-step "why this step exists" paragraph for each present loop/optional/alternate/onboarding capability in CAPABILITY_KEYS order, each paragraph naming only its own step (e.g. gsdDiscuss paragraph names Discuss, gsdUi names UI/GUI, gsdPlan names Plan, gsdExecute names Execute, gsdVerify names Verify, gsdShip names Ship, gsdQuick names Quick, gsdMapCodebase names mapping). Reuse the paragraph texts from PERSONA_TEXT (lib/persona.js:18-41) verbatim where possible, restructured so each step's paragraph keys on its capability.
      - If NO loop-step capability is present (loopSteps(descriptors) is empty), append the D-06 notice line: "No loop steps are currently available; use the orient/jobs/onboarding tools for setup and orientation." (uses only generic words, no missing tool).
      - Never throw over an absent/empty descriptors array.
      Extend test/render.test.mjs: (a) with a full descriptor set, output contains "Discuss" and "gsd_status" and "gsd_quick"; (b) with a set missing gsdVerify and gsdQuick, output does NOT contain the token "gsd_verify" nor "gsd_quick"; (c) with a zero-loop set (only gsdOrient/gsdJobs/gsdMapCodebase), output contains the no-loop notice and does not name "gsd_discuss"; (d) a helper-level invariant assertion: scan renderPersonaBody output for every token matching /gsd_[a-z_]+/ and assert each token's capability (via capabilityForTool) is present in the given descriptor set — proving "never instruct a missing tool" (D-02).
    </action>
    <verify>node --test test/render.test.mjs</verify>
    <acceptance_criteria>
      - test/render.test.mjs includes the no-absent-token-invariant assertion and passes with `node --test test/render.test.mjs`.
      - grep lib/_render.js for "renderPersonaBody".
      - grep test/render.test.mjs for "gsd_verify" (used as a NOT-present assertion) and "capabilityForTool".
    </acceptance_criteria>
    <done>The persona body renderer is implemented, single-sourced, and proves absent steps/tools are omitted and never instructed.</done>
  </task>
</tasks>

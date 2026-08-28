---
phase: 22-reactive-loop-rendering
plan: 02
type: execute
wave: 2
depends_on: ["GSD-22-reactive-loop-rendering-01"]
files_modified: ["lib/persona.js", "test/mount.test.mjs"]
autonomous: true
requirements: ["DEGR-02"]
user_setup: []
must_haves:
  truths:
    - The persona `gsd:persona` section body is a function evaluated per assembly that names only the tools of currently-present step capabilities and omits absent steps entirely (D-01/D-02).
    - The runtime-context `gsd:state` snapshot (renderStateContext) is capability-aware: it shows the current loop position plus the ordered available loop steps, never instructing an absent step (D-03/D-06).
  artifacts:
    - path: "lib/persona.js"
      provides: "reactive persona section + capability-aware runtime-context snapshot consuming lib/_render.js"
      min_lines: 60
      exports: ["renderStateContext"]
  key_links:
    - from: "lib/persona.js"
      to: "lib/_render.js"
      via: "persona passes a getCapability thunk (k)=>ctx.get(k) into renderPersonaBody / availableCapabilities per assembly"
      pattern: "import \\{[^}]*\\} from \"./_render\\.js\""
    - from: "test/mount.test.mjs"
      to: "test/mount.test.mjs"
      via: "persona section.text is invoked as a function with a context object before assertions (mirrors the existing contexts[0].text pattern)"
      pattern: "section\\.text\\(\\{"
---
<objective>
Make the two persona surfaces reactive (DEGR-02): (1) convert the `gsd:persona` section from a static `PERSONA_TEXT` string into a function `text: (context) => renderPersonaBody(...)` evaluated at every prompt assembly, which reads the present step capabilities via `ctx.get` and omits absent steps/tools; (2) upgrade `renderStateContext` (the `gsd:state` runtime-context snapshot) to append the ordered available loop-step list and route the loop-position step through the phase-01 helper, so it never advertises an absent step. Update the offline mount test to evaluate the persona section as a function (the RESEARCH-flagged assertion at test/mount.test.mjs:322-328).
</objective>
<context>@.planning/phases/GSD-22-reactive-loop-rendering/GSD-22-reactive-loop-rendering-CONTEXT.md
@.planning/phases/GSD-22-reactive-loop-rendering/GSD-22-reactive-loop-rendering-RESEARCH.md
@lib/persona.js
@lib/_render.js
@lib/_capabilities.js
@lib/state.js
@test/mount.test.mjs</context>
<tasks>
  <task type="auto">
    <name>Task 1: persona section body becomes a per-assembly function reading capabilities via ctx.get (D-01/D-02)</name>
    <files>lib/persona.js, test/mount.test.mjs</files>
    <read_first>lib/persona.js, lib/_render.js, lib/_capabilities.js</read_first>
    <action>
      In lib/persona.js: import `{ renderPersonaBody, availableCapabilities } from "./_render.js"`. Keep the existing `renderStateContext` until Task 2. Replace the static section registration at lines 70-74 so it becomes:
      `ctx.systemPrompt.section({ name: "gsd:persona", order: SECTION_ORDER_PERSONA, text: (context) => { try { const caps = availableCapabilities((k) => ctx.get(k)); return renderPersonaBody(caps); } catch { return ""; } }, });`
      The `text` is now a function (per RESEARCH OQ-1: section.text supports function bodies). It reads capabilities NON-reactively via ctx.get (which returns undefined for absent/inactive fibers — RESEARCH 1.1), never via inject (D-03). The try/catch mirrors the existing gsd:state provider's never-throw discipline (D-07). The returned body is the static core + only the per-step paragraphs whose capabilities are present (implemented in plan 01 Task 3).
      In test/mount.test.mjs, fix the section assertion (lines 322-328): before asserting, evaluate `section.text` as a function with a context object. Change `assert.match(section.text, /Discuss/)` to `const body = section.text({ agent: { session: { header: { cwd: CWD } } } });` then `assert.equal(typeof body, "string")`, `assert.match(body, /Discuss/)` and `assert.match(body, /Ship/)` (matching the existing pattern used for the context provider at line 355).
    </action>
    <verify>node --test test/mount.test.mjs</verify>
    <acceptance_criteria>
      - grep lib/persona.js for "renderPersonaBody" and "availableCapabilities" (imported + used in the section text function).
      - grep test/mount.test.mjs for "section.text(" (invoked as a function).
      - node --test test/mount.test.mjs exits 0.
    </acceptance_criteria>
    <done>The persona section body is capability-reactive and evaluated per assembly; the offline persona test evaluates it as a function and passes.</done>
  </task>

  <task type="auto">
    <name>Task 2: capability-aware runtime-context snapshot (D-03/D-06/D-08)</name>
    <files>lib/persona.js, test/mount.test.mjs</files>
    <read_first>lib/persona.js, lib/_render.js, lib/_capabilities.js, lib/state.js</read_first>
    <action>
      In lib/persona.js, extend `renderStateContext(context, gsdState)` to take a third argument `getCap` (a `(key)=>descriptor` thunk). Inside the initialised-project branch, after building the `line` string, compute `const caps = availableCapabilities(getCap)` and `const loop = loopSteps(caps)`. Add an "Available steps" annotation to the returned snapshot:
      - If `loop.length > 0`: append to `line` (or as a following line) the ordered available loop steps rendered by `renderAvailableSteps(caps)` — reuse the helper's output so ordering matches D-08.
      - If `loop.length === 0`: append a clear no-available-step line using the single-sourced `NO_LOOP_NOTICE` / renderNoLoopNotice from lib/_render.js (D-06) — e.g. "No loop steps are currently available." never naming a tool.
      Keep the existing opener (`GSD loop position: ...`) and the WAIT-FOR-EXPLICIT-COMMAND contract sentence verbatim (SPEC: must keep the wait-for-command wording). Do NOT reference gsd_status as the only orienting surface when gsdOrient is absent — if the gsdOrient capability is absent, render "Use the available step tools for orientation." generically instead of naming gsd_status; if present, keep the existing "Use gsd_status for the full STATE.md." phrasing.
      Update the gsd:state context provider (lines 79-90) to pass `(k) => ctx.get(k)` as the third argument inside the try block.
      In test/mount.test.mjs, in the "gsd_init smoke orients the context provider" test (lines 336-367), assert the snapshot now contains an available-steps/loop reference (e.g. `/Available steps/` or the ordered list) after gsd_init on the full-set mount, while still asserting the wait-for-command contract sentence at line 362-366. Keep the existing regex assertions passing.
    </action>
    <verify>node --test test/mount.test.mjs test/render.test.mjs</verify>
    <acceptance_criteria>
      - grep lib/persona.js for "loopSteps" and "getCap" (renderStateContext third param).
      - grep test/mount.test.mjs for "Available steps" (snapshot assertion).
      - node --test test/mount.test.mjs test/render.test.mjs exits 0.
    </acceptance_criteria>
    <done>The runtime snapshot is capability-aware and shows the ordered available loop steps (or a no-step notice), never instructing an absent step; offline tests pass.</done>
  </task>
</tasks>

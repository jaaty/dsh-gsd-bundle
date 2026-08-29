---
phase: 01-live-mount
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - test/mount.test.mjs
autonomous: true
requirements: ["MOUNT-01", "MOUNT-02"]
user_setup: []
must_haves:
  truths:
    - "All 12 plugin subpath exports resolve via import('@dsh-gsd/bundle/<sub>') and each module exposes {name, inject, apply}."
    - "Applying all 12 plugins in cordis.patch.yml insert order against one shared fake ctx throws on none and registers 1 systemPrompt section, 1 systemPrompt context, 12 tools, 12 commands, and provides the gsdState host service."
    - "Every registered tool has a valid compiled schema (name, description, parameters object, output.schema) — apply() not throwing proves defineTool compiled it."
    - "The persona section is gsd:persona (order -100) with phase-loop text, and the gsd:state context provider (order 10) renders the loop position after a project is initialised through the provided gsdState."
    - "The agent-loop override row is present in cordis.patch.yml with config.agents containing { id: gsd }."
  artifacts:
    - path: "test/mount.test.mjs"
      provides: "Offline activation harness: reads cordis.patch.yml, resolves all 12 subpath exports, applies all 12 plugins against one shared fake ctx, asserts the full registration surface, runs a gsd_init smoke call, and asserts the persona context provider orients at STATE.md."
      min_lines: 120
      exports: []
  key_links:
    - from: "cordis.patch.yml insert rows"
      to: "package.json exports map"
      via: "each row's name '@dsh-gsd/bundle/<sub>' maps to exports key './<sub>' and import() resolves to lib/<sub>.js"
      pattern: "@dsh-gsd/bundle/(\\w[\\w-]*)"
    - from: "gsd-state apply()"
      to: "persona context provider text()"
      via: "ctx.provide('gsdState', svc) is later read by ctx.get('gsdState') inside the context provider; orientation only renders after the SAME instance initialises the project"
      pattern: "GSD loop position: milestone .+ / (phase .+ / step .+|no active phase)
    - from: "gsd-commands apply()"
      to: "ctx.commands.register"
      via: "registration is wrapped in ctx.effect(fn) — the fake ctx's effect MUST invoke fn() or zero commands capture"
      pattern: "gsd-(init|status|progress|discuss-phase|ui-phase|plan-phase|execute-phase|verify-work|ship|quick|map-codebase|new-milestone)
---

<objective>
Deliver the offline activation harness (test/mount.test.mjs) that proves the @dsh-gsd/bundle plugin set activates inside a fake DSH host: all 12 cordis.patch.yml insert rows resolve their subpath exports and apply() to register the expected host contributions (1 persona section + 1 runtime-context provider, gsdState service, 12 gsd_* tools, 12 /gsd-* commands), the agent-loop override row is present, and a single gsd_init smoke call orients the persona context provider at STATE.md. This is the MOUNT-01 + MOUNT-02 proof via the existing FakeFs + fake-ctx infrastructure (per D-01), offline only (per D-02), asserting the offline patch-merge preconditions (per D-05) without a live DSH boot.
</objective>

<context>
@lib/persona.js
@lib/state.js
@lib/core-tools.js
@lib/commands.js
@cordis.patch.yml
@package.json
@test/helpers/fake-fs.mjs
@test/tools.test.mjs
</context>

<tasks>
  <task type="auto">
    <name>Task 1 (tracer): shared fake ctx applies all 12 plugins and captures the full registration surface</name>
    <files>test/mount.test.mjs</files>
    <read_first>test/helpers/fake-fs.mjs, test/tools.test.mjs, lib/state.js, lib/persona.js, lib/commands.js, cordis.patch.yml</read_first>
    <action>
Create test/mount.test.mjs. Import { test, describe, beforeEach } from "node:test", assert from "node:assert/strict", { FakeFs } from "./helpers/fake-fs.mjs", and { GsdState } from "../lib/state.js" (only for the instanceof assertion). Define CWD = "/project".

Build a single shared fake ctx factory `makeMountCtx(fs)` returning an object with:
- fs
- a `tools` array and `tools.register = (t) => tools.push(t)` (also expose `ctx.tools = { register }`)
- a `commands` array and `commands.register = (c) => commands.push(c)` (also `ctx.commands = { register }`)
- `sections` array, `systemPrompt = { section: (s) => sections.push(s), context: (c) => contexts.push(c) }` with a `contexts` array
- `provided` map; `provide = (n, svc) => { provided.set(n, svc); if (n === "gsdState") gsdStateSvc = svc; }` and a module-level `let gsdStateSvc`
- `get = (n) => n === "gsdState" ? gsdStateSvc : n === "subagents" ? makeSubagents() : undefined` — reuse the makeSubagents() pattern from test/tools.test.mjs:21-62 verbatim (getProvider/start with canned labels) so future smoke calls that spawn do not throw
- `effect = (fn, _label) => { const d = fn(); return typeof d === "function" ? d : () => {}; }` — CRITICAL per D-01/R-3: effect MUST invoke fn() synchronously or gsd-commands captures zero commands. state.js:516 registers `ctx.effect(() => () => svc._cache.clear(), ...)` so fn() returns the disposer; invoking fn() is correct.

Define the 12 plugin subpaths in patch order as an array of {id, sub}: gsd-persona/persona, gsd-state/state, gsd-core-tools/core-tools, gsd-discuss/discuss, gsd-plan/plan, gsd-execute/execute, gsd-verify/verify, gsd-ship/ship, gsd-ui/ui, gsd-quick/quick, gsd-map-codebase/map-codebase, gsd-commands/commands (verbatim from cordis.patch.yml:34-84, per D-03).

In a describe("mount: all 12 plugins activate") with beforeEach constructing `fs = new FakeFs()` and `ctx = makeMountCtx(fs)`, write a test "applies all 12 plugins in patch order without throwing" that loops the 12 entries, does `const mod = await import(\`@dsh-gsd/bundle/${sub}\`)` (self-referencing subpath import — Node resolves via package.json exports), asserts `typeof mod.apply === "function"`, and calls `mod.apply(ctx, {})`. Wrap the loop so any throw fails the test with the offending id. After the loop assert: `ctx.provided.has("gsdState")`, `ctx.provided.get("gsdState") instanceof GsdState`, `ctx.tools.length === 12`, `ctx.commands.length === 12`, `ctx.sections.length === 1`, `ctx.contexts.length === 1`. This is the thinnest end-to-end activation slice (import → apply → capture) touching every registration surface; expand in later tasks.
    </action>
    <verify>node --test test/mount.test.mjs</verify>
    <acceptance_criteria>
      - test/mount.test.mjs exists and imports from "@dsh-gsd/bundle/" subpaths (grep: "import(`@dsh-gsd/bundle/" or "@dsh-gsd/bundle/${")
      - grep "ctx.effect = (fn" present and the body calls fn() (grep: "const d = fn()")
      - grep "instanceof GsdState" present
      - grep "ctx.tools.length === 12", "ctx.commands.length === 12", "ctx.sections.length === 1", "ctx.contexts.length === 1" all present
      - `node --test test/mount.test.mjs` exits 0
    </acceptance_criteria>
    <done>One shared fake ctx applies all 12 plugins in patch order with zero throws and captures gsdState + 12 tools + 12 commands + 1 section + 1 context; the test passes.</done>
  </task>

  <task type="auto">
    <name>Task 2: cordis.patch.yml reader + subpath export resolution + agent-loop override presence (D-03/D-05)</name>
    <files>test/mount.test.mjs</files>
    <read_first>cordis.patch.yml, package.json, test/mount.test.mjs</read_first>
    <action>
Extend test/mount.test.mjs (do not rewrite Task 1's content). Add a helper `async function readPatchRows()` that reads cordis.patch.yml via `import { promises as fsPromises } from "node:fs"` + `path.resolve(import.meta.dirname, "../cordis.patch.yml")` and parses it with a targeted line-based reader (NO YAML dependency — per D-05/research OQ-1, preserve the zero-dep invariant): split into lines, find the line matching /^- id: agent-loop/, then find the line matching /^- insert:/, and from the insert block scan lines matching /^    - id: (\S+)/ capturing the id and the immediately following line matching /^      name: '([^']+)'/ capturing the quoted spec. Return { overridePresent: boolean, agentLoopConfigRaw: string[], insertRows: [{id, spec}] }. Assert overridePresent is true and the override block's text contains "- id: gsd" (per D-03: agent-loop is asserted only for presence + that it configures a gsd agent).

Add a describe("mount: cordis.patch.yml rows resolve") with a test that:
1. Calls readPatchRows() and asserts insertRows.length === 12.
2. Hardcodes the expected 12 {id, spec} pairs verbatim from cordis.patch.yml:34-84 (per D-03 "exactly the insert block") and asserts the parsed insertRows deep-equal it — so a row added/removed in the patch fails the test.
3. Reads package.json exports via `import.meta.dirname` + "../package.json" (JSON.parse of the file text) and for each insert row: derives sub = spec.replace(/^@dsh-gsd\/bundle\//, ""), asserts exports has key `./${sub}`, and `await import(\`@dsh-gsd/bundle/${sub}\`)` resolves with {name, inject, apply}.
4. Cross-checks the captured tool names against the expected 12: gsd_init, gsd_status, gsd_progress, gsd_new_milestone, gsd_discuss, gsd_plan, gsd_execute, gsd_verify, gsd_ship, gsd_ui_phase, gsd_quick, gsd_map_codebase (from research, verified this session). Capture tool names by applying all 12 against a fresh makeMountCtx (reuse Task 1's apply loop) and reading ctx.tools.map(t => t.name).
5. Cross-checks the captured command names against the expected 12: gsd-init, gsd-status, gsd-progress, gsd-discuss-phase, gsd-ui-phase, gsd-plan-phase, gsd-execute-phase, gsd-verify-work, gsd-ship, gsd-quick, gsd-map-codebase, gsd-new-milestone (from lib/commands.js:35-161, per D-03).
    </action>
    <verify>node --test test/mount.test.mjs</verify>
    <acceptance_criteria>
      - grep "readPatchRows" present in test/mount.test.mjs
      - grep "import { promises as fsPromises } from \"node:fs\"" present (no yaml/js-yaml import anywhere in the file)
      - grep "insertRows.length === 12" present
      - grep "agent-loop" present and grep "- id: gsd" assertion present
      - grep "exports has key" or "exports[`./" present (subpath→exports mapping assertion)
      - the 12 expected tool names and 12 expected command names appear as assertion literals
      - `node --test test/mount.test.mjs` exits 0
    </acceptance_criteria>
    <done>The patch.yml reader extracts exactly the 12 insert rows + the agent-loop override, every row's name resolves through package.json exports and import(), and captured tool/command names match the expected lists; the test passes.</done>
  </task>

  <task type="auto">
    <name>Task 3: persona section/context content + gsd_init smoke + orientation at STATE.md (MOUNT-02) + schema-validity for all 12 tools</name>
    <files>test/mount.test.mjs</files>
    <read_first>lib/persona.js, lib/core-tools.js, lib/state.js, test/mount.test.mjs</read_first>
    <action>
Extend test/mount.test.mjs with a describe("mount: persona orients at STATE.md (MOUNT-02)") that applies all 12 plugins against a fresh makeMountCtx(fs) (reuse the apply loop). Then:

1. Persona section assertion: from ctx.sections[0] assert name === "gsd:persona", order === -100, and text includes both "Discuss" and "Ship" (the phase-loop marker, per MOUNT-02).

2. Context provider assertion: from ctx.contexts[0] assert name === "gsd:state" and order === 10.

3. Orientation via the SAME provided gsdState (per D-01/R-1 — do NOT use buildProject; it constructs a separate GsdState and would render "no project"). Find the gsd_init tool in ctx.tools (name === "gsd_init"). Build the exec object { agent: { session: { header: { cwd: CWD } } }, signal: { aborted: false, addEventListener(){}, removeEventListener(){} } } (mirror test/tools.test.mjs:16-19). Call `await gsdInit.execute({ name: "demo", milestoneName: "M1", version: "v1.0", requirements: [{ id: "MOUNT-01", text: "x" }], phases: [{ name: "p1", goal: "do it", requirements: ["MOUNT-01"] }] }, exec)` and assert the result matches /Initialised GSD project/. This is the single minimal smoke call (per D-04).

4. Render the context provider: `const out = ctx.contexts[0].text({ agent: { session: { header: { cwd: CWD } } } })` and assert it matches /GSD loop position: milestone .+ \/ (phase .+ \/ step .+|no active phase)/. This proves MOUNT-02 orientation at the current STATE.md position.

5. Uninitialised-cwd branch: call the same provider with a different cwd (e.g. "/elsewhere") and assert the output matches /no \.planning\/ project found/ (the orientation hint, not empty/crash — per research MOUNT-02 branches).

6. Schema-validity for all 12 tools (per D-04 — apply() not throwing already proves defineTool compiled the schema; assert the shape explicitly): for each tool in ctx.tools assert it has a string name, a string description, a parameters object (typeof === "object"), and output.schema. Use a loop with assert.ok on each field and the tool name in the failure message.

No live DSH boot, no touching the web profile (per D-02). All writes go to the in-memory FakeFs.
    </action>
    <verify>node --test test/mount.test.mjs && npm test</verify>
    <acceptance_criteria>
      - grep "gsd:persona" and "order === -100" (or "order: -100" assertion) present
      - grep "gsd:state" and "order === 10" (or "order: 10" assertion) present
      - grep "Initialised GSD project" present (the smoke-call assertion)
      - grep "GSD loop position: milestone" present (orientation assertion)
      - grep "no .planning/ project found" present (uninitialised branch assertion)
      - grep "output.schema" present (schema-validity loop)
      - `node --test test/mount.test.mjs` exits 0
      - `npm test` exits 0 (full suite still green — no regression to the existing 34 tests)
    </acceptance_criteria>
    <done>The persona section + gsd:state context provider are asserted by content/order, gsd_init smoke executes through the provided gsdState and the context provider renders the loop position (and the no-project branch), and all 12 tools pass schema-validity; the full npm test suite is green.</done>
  </task>
</tasks>
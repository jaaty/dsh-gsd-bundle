---
phase: 54-freeform-routing
plan: 02
type: execute
wave: 2
depends_on: ["GSD-54-freeform-routing-01"]
files_modified: ["lib/core-tools.js", "lib/commands.js", "lib/_capabilities.js", "test/route-integration.test.mjs", "test/mount.test.mjs", "test/_capabilities.test.mjs", "test/removal.test.mjs"]
autonomous: true
requirements: ["CLH-04"]
gap_closure: false
user_setup: []
must_haves:
  truths:
    - "gsd_route tool is registered (mount tool count 33)"
    - "gsd_route execute returns recommendation text and does not spawn a subagent or mutate STATE"
    - "/gsd-route command is registered (mount command count 30)"
    - "retiring gsd-core-tools unregisters gsd_route and /gsd-route"
  artifacts:
    - path: "lib/core-tools.js"
      provides: "gsd_route tool registration under gsdOrient; execute path classifies the intent via classifyIntent and returns renderRouteRecommendation text (recommend-only, never auto-runs)"
      min_lines: 20
      exports: ["apply"]
    - path: "lib/commands.js"
      provides: "/gsd-route slash command in the COMMANDS array, paired to gsdOrient (DEGR-03)"
      min_lines: 10
      exports: ["apply"]
    - path: "lib/_capabilities.js"
      provides: "gsdOrient descriptor updated to advertise the gsd_route tool and gsd-route command"
      min_lines: 1
      exports: ["buildCapability", "capabilityForTool", "allCapabilities"]
    - path: "test/route-integration.test.mjs"
      provides: "offline integration tests for the gsd_route execute path: recommend-only (no auto-run, STATE byte-identical), fallback to gsd_status, capability-aware degradation"
      min_lines: 80
    - path: "test/mount.test.mjs"
      provides: "reconciled tool count 33 and command count 30 with gsd_route/gsd-route in the EXPECTED lists"
      min_lines: 1
    - path: "test/_capabilities.test.mjs"
      provides: "reconciled gsdOrient exact tools/commands list including gsd_route/gsd-route"
      min_lines: 1
    - path: "test/removal.test.mjs"
      provides: "core-tools retirement also unregisters gsd_route and /gsd-route"
      min_lines: 1
  key_links:
    - from: "lib/core-tools.js"
      to: "lib/_route.js"
      via: "imports classifyIntent/renderRouteRecommendation and calls them in the gsd_route execute path"
      pattern: "from \"./_route.js\""
    - from: "lib/_capabilities.js"
      to: "gsdOrient tools"
      via: "gsdOrient descriptor tools array includes gsd_route"
      pattern: "gsd_route"
    - from: "lib/commands.js"
      to: "gsdOrient commands"
      via: "COMMANDS array includes a gsd-route entry paired to gsdOrient"
      pattern: "name: \"gsd-route\""
---
<objective>
Wire the pure classifier from Plan 01 into the host as a real tool + slash command: register the `gsd_route` tool under the `gsdOrient` capability in `lib/core-tools.js`, add the `/gsd-route` command to `lib/commands.js`, update the `gsdOrient` descriptor in `lib/_capabilities.js` to advertise both, and reconcile the exact-count tests (`mount.test.mjs`, `_capabilities.test.mjs`, `removal.test.mjs`) plus add the offline integration suite `test/route-integration.test.mjs`. The execute path is recommend-only (D-02): it classifies the intent and returns the recommended command text, never auto-running the routed tool and never reading/mutating STATE/ROADMAP (out-of-scope). The tool+command ride `gsdOrient`, so retiring `gsd-core-tools` withdraws both (DEGR-03).
</objective>
<context>
@lib/core-tools.js — the gsd_next tool registration (lines 575-669) is the exact execute-path pattern to mirror; gsd_status (line 128) is the orienting fallback surface; `availableCapabilities((k) => ctx.get(k))` (line 635) is how the execute path reads present descriptors.
@lib/commands.js — the COMMANDS array (line 35) and apply() pairing loop (line 395) that pairs each command to its owning capability via allCapabilities() (DEGR-03).
@lib/_capabilities.js — the gsdOrient descriptor (lines 75-85) whose tools/commands arrays must gain gsd_route/gsd-route.
@test/next-integration.test.mjs — the offline integration-test pattern to mirror (FakeFs + makeMountCtx + makeExec + CWD + fake gitFn, no live boot/LLM/git).
@test/mount.test.mjs — EXPECTED_TOOL_NAMES (line 105), EXPECTED_COMMAND_NAMES (line 120), tool count 32 (line 147), command count 29 (line 148).
@test/_capabilities.test.mjs — the gsdOrient exact-list test (lines 67-71).
@test/removal.test.mjs — the gsd-core-tools retirement test (lines 228-238).
@test/helpers/mount-harness.mjs — makeMountCtx, makeExec, CWD, applySubset, mountSubset.
</context>
<tasks>
  <task type="auto">
    <name>Task 1: Tracer — register the gsd_route tool in core-tools.js + recommend-only integration test</name>
    <files>lib/core-tools.js, test/route-integration.test.mjs</files>
    <read_first>lib/core-tools.js, lib/_route.js, test/next-integration.test.mjs, test/mount.test.mjs</read_first>
    <action>
In `lib/core-tools.js`, add `import { classifyIntent, renderRouteRecommendation } from "./_route.js";` to the existing import block (line 18 area). Then, immediately after the `gsd_next` tool registration (after line 669, before the closing `}` of `apply`), register a new tool via `ctx.tools.register(defineTool({ ... }))`:

- `name: "gsd_route"`
- `description: "Parse a plain-English intent and dispatch it to the most appropriate available GSD command (recommend-only; never auto-runs)."`
- `parameters: { intent: { type: "string", description: "Plain-English intent to route, e.g. 'discuss phase 3'." } }`
- `output: { schema: { type: "string" }, render: (_a, v) => [{ type: "text", text: v }] }`
- `async execute(args, exec)`: `const descriptors = availableCapabilities((k) => ctx.get(k)); const result = classifyIntent(args.intent, descriptors); return renderRouteRecommendation(result);` — the execute path does NOT need gsdState or cwd (recommend-only, never reads/mutates STATE per out-of-scope). It must NOT spawn a subagent and must NOT inject a followup.
- `presentCall: (a) => ({ card: "generic", title: "gsd_route", kind: "other", rawInput: { intent: a.intent } })`

Create `test/route-integration.test.mjs` mirroring test/next-integration.test.mjs. Import `FakeFs` from `./helpers/fake-fs.mjs`, `makeMountCtx, makeExec, CWD` from `./helpers/mount-harness.mjs`, and `apply` from `../lib/state.js`, `../lib/core-tools.js`, `../lib/commands.js`, `../lib/discuss.js`, `../lib/plan.js`. Add a `mountRoute(loopPlugins = [])` helper that builds a FakeFs + ctx, applies state + core-tools + the loop plugins + commands, and returns `{ fs, ctx }`. Add a `findRoute(ctx)` helper that finds the `gsd_route` tool and asserts it is registered. Add a `readFm(ctx)` helper that reads the STATE frontmatter via `ctx.get("gsdState").readState(CWD)`.

Write the TRACER integration test: mount with `[applyDiscuss, applyPlan]`, bootstrap a project via the mounted `gsd_init` tool (mirror next-integration.test.mjs bootstrap), set active phase to 1/plan via `gsdState.setActivePhase(CWD, 1, "plan")`, then:
- (a) `await findRoute(ctx).execute({ intent: "discuss phase 3" }, exec())` returns a string matching `/run the gsd_discuss tool on phase 3/i` (Plan 01's render emits `Run the ${cmd} tool on ${suffix}.` — capital "Run" plus "the ").
- (b) STATE byte-identical: capture `readFm(ctx)` before and after the execute and `assert.deepEqual(after, before)` — the router never mutates STATE (out-of-scope).
- (c) no subagent spawn: assert the returned value is a plain string (the execute path returns text only) and that no subagent service was invoked — since the execute path only calls classifyIntent/renderRouteRecommendation, assert the result is a string and does not match `/auto-run/`.

Do NOT touch `test/mount.test.mjs` or the gsdOrient descriptor in this task — the tool-count and command-count reconciliation, plus the descriptor update, all land together in Task 2 so the mount suite stays green at each task boundary. This task's verify runs only the route-integration suite.
    </action>
    <verify>node --test test/route-integration.test.mjs</verify>
    <acceptance_criteria>
      - `node --test test/route-integration.test.mjs` exits 0
      - grep -q "from \"./_route.js\"" lib/core-tools.js
      - grep -q "name: \"gsd_route\"" lib/core-tools.js
      - grep -q "classifyIntent(args.intent" lib/core-tools.js
    </acceptance_criteria>
    <done>gsd_route tool is registered under gsdOrient; its execute path classifies the intent and returns recommendation text without spawning a subagent or mutating STATE; the recommend-only integration test passes. NOTE: at this task boundary the tool is intentionally unadvertised — the gsdOrient descriptor in lib/_capabilities.js is only updated in Task 2, so capabilityForTool("gsd_route") returns undefined until then. This is a deliberate, recoverable intermediate state: registering the tool bumps the live tool count to 33, so the FULL suite is RED between Task 1 and Task 2 because test/mount.test.mjs still asserts `ctx.tools.length === 32`. Do NOT run test/mount.test.mjs (or the full suite) at this boundary — this task's verify runs only test/route-integration.test.mjs, and Task 2 reconciles the count to 33 immediately after. The suite is green again only once Task 2 lands.</done>
  </task>

  <task type="auto">
    <name>Task 2: Add the /gsd-route command + update the gsdOrient descriptor + reconcile command count and gsdOrient exact list</name>
    <files>lib/commands.js, lib/_capabilities.js, test/mount.test.mjs, test/_capabilities.test.mjs</files>
    <read_first>lib/commands.js, lib/_capabilities.js, test/mount.test.mjs, test/_capabilities.test.mjs</read_first>
    <action>
In `lib/_capabilities.js`, update the `gsdOrient` descriptor (lines 75-85): append `"gsd_route"` to the `tools` array (after `"gsd_next"`) and `"gsd-route"` to the `commands` array (after `"gsd-next"`). This makes `capabilityForTool("gsd_route")` return `"gsdOrient"` and pairs `/gsd-route` to gsdOrient in the commands apply() loop (DEGR-03).

In `lib/commands.js`, add a new entry to the `COMMANDS` array (after the `gsd-next` entry, line 357):
- `name: "gsd-route"`
- `description: "Parse a plain-English intent and dispatch it to the most appropriate available GSD command (recommend-only)."`
- `hint: "<intent>"`
- `build: (raw) => { if (!raw.trim()) return { err: "Usage: /gsd-route <intent>" }; return { text: "Run the gsd_route tool with this intent: " + raw.trim(), ack: "Routing intent → gsd_route." }; }`

The command is paired to gsdOrient automatically by the existing apply() loop (it iterates allCapabilities() and maps every advertised command to its capability), so no apply() change is needed.

In `test/mount.test.mjs`, reconcile both counts: add `"gsd_route"` to `EXPECTED_TOOL_NAMES` (after `"gsd_next"`, line 107) and change `assert.ok(ctx.tools.length === 32, ...)` to `=== 33` (line 147); add `"gsd-route"` to `EXPECTED_COMMAND_NAMES` (after `"gsd-next"`, line 128) and change `assert.ok(ctx.commands.length === 29, ...)` to `=== 30` (line 148).

In `test/_capabilities.test.mjs`, update the gsdOrient exact-list test (lines 67-71): the `tools` deepEqual array gains `"gsd_route"` (after `"gsd_next"`) and the `commands` deepEqual array gains `"gsd-route"` (after `"gsd-next"`).
    </action>
    <verify>node --test test/mount.test.mjs test/_capabilities.test.mjs</verify>
    <acceptance_criteria>
      - `node --test test/mount.test.mjs` exits 0 (tool 33, command 30)
      - `node --test test/_capabilities.test.mjs` exits 0
      - grep -q "gsd_route" lib/_capabilities.js
      - grep -q "gsd-route" lib/_capabilities.js
      - grep -q "name: \"gsd-route\"" lib/commands.js
      - grep -q "gsd_route" test/mount.test.mjs
      - grep -q "gsd-route" test/mount.test.mjs
      - grep -q "=== 33" test/mount.test.mjs
      - grep -q "=== 30" test/mount.test.mjs
    </acceptance_criteria>
    <done>/gsd-route is registered and paired to gsdOrient; the gsdOrient descriptor advertises gsd_route/gsd-route; mount.test.mjs tool count is 33 and command count is 30; _capabilities.test.mjs gsdOrient exact list includes both.</done>
  </task>

  <task type="auto">
    <name>Task 3: Reconcile removal.test.mjs + expand integration tests (fallback, ambiguity, capability-aware degradation)</name>
    <files>test/removal.test.mjs, test/route-integration.test.mjs</files>
    <read_first>test/removal.test.mjs, test/route-integration.test.mjs, test/next-integration.test.mjs</read_first>
    <action>
In `test/removal.test.mjs`, extend the gsd-core-tools retirement test (lines 231-238): after the existing assertions, add `assert.ok(!ctx.tools.some((t) => t.name === "gsd_route"), "gsd_route still registered");` and `assert.ok(!ctx.commands.some((c) => c.name === "gsd-route"), "gsd-route still registered");` — retiring gsd-core-tools withdraws gsdOrient, so both the gsd_route tool and the /gsd-route command must be unregistered (DEGR-03, never-instruct-a-missing-tool).

In `test/route-integration.test.mjs`, add integration tests:
(a) Fallback to gsd_status (D-06/D-08): mount with `[applyDiscuss, applyPlan]`, bootstrap, then `await findRoute(ctx).execute({ intent: "gibberish qwerty" }, exec())` returns a string matching `/run the gsd_status tool/i` (Plan 01's render emits `Run the ${cmd} tool.` — capital "Run" plus "the ") and does not throw.
(b) Ambiguity fallback (D-05): execute with an intent that ties two commands (use the same genuinely-tied intent the Plan 01 unit test established, e.g. one where two commands match equally) and assert the result matches `/run the gsd_status tool/i` and contains a note.
(c) Capability-aware degradation (D-10/D-07): mount with `[applyPlan]` only (gsdDiscuss absent), bootstrap, then `await findRoute(ctx).execute({ intent: "discuss phase 3" }, exec())` returns a string that does NOT match `/run the gsd_discuss tool/i` and names a present tool (e.g. `/run the gsd_plan tool/i` when gsdPlan is the nearest present step) or the gsd_status fallback; assert the result never names gsd_discuss.
(d) Recommend-only invariant: for each of the above executes, capture `readFm(ctx)` before and after and `assert.deepEqual(after, before)` — the router never mutates STATE.
    </action>
    <verify>node --test test/route-integration.test.mjs test/removal.test.mjs</verify>
    <acceptance_criteria>
      - `node --test test/route-integration.test.mjs` exits 0
      - `node --test test/removal.test.mjs` exits 0
      - grep -q "gsd_route" test/removal.test.mjs
      - grep -q "gsd-route" test/removal.test.mjs
      - grep -q "run the gsd_status tool" test/route-integration.test.mjs
      - grep -q "deepEqual(after, before" test/route-integration.test.mjs
    </acceptance_criteria>
    <done>removal.test.mjs asserts gsd_route and /gsd-route are unregistered when gsd-core-tools is retired; the integration suite covers fallback, ambiguity, and capability-aware degradation, all proving the recommend-only/never-mutates-STATE invariant.</done>
  </task>
</tasks>

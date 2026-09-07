---
phase: 54-freeform-routing
plan: 01
type: execute
wave: 1
depends_on: []
files_modified: ["lib/_route.js", "test/_route.test.mjs"]
autonomous: true
requirements: ["CLH-04"]
gap_closure: false
user_setup: []
must_haves:
  truths:
    - "classifyIntent('discuss phase 3', descriptors) returns a result whose command is 'gsd_discuss' and phase is 3"
    - "classifyIntent('', descriptors) returns the gsd_status fallback with a note and never throws"
    - "classifyIntent('gibberish qwerty', descriptors) returns the gsd_status fallback"
    - "classifyIntent('plan', descriptors) with gsdPlan absent degrades to a present step or gsd_status, never gsd_plan"
    - "renderRouteRecommendation output never contains the substring 'auto-run'"
  artifacts:
    - path: "lib/_route.js"
      provides: "pure, side-effect-free intent classifier (classifyIntent) + recommendation renderer (renderRouteRecommendation) + capability-aware gating, mirroring lib/_next.js"
      min_lines: 120
      exports: ["classifyIntent", "renderRouteRecommendation", "FALLBACK_RECOMMENDATION", "hasCap"]
    - path: "test/_route.test.mjs"
      provides: "offline unit tests across the intent→command matrix (synonyms, tool names, loop-step names, action verbs), ambiguity, missing-phase, empty/garbage, capability-aware degradation"
      min_lines: 100
  key_links:
    - from: "lib/_route.js"
      to: "lib/_render.js"
      via: "imports effectiveRoutableStep for D-10 nearest-present-step degradation"
      pattern: "from \"./_render.js\""
    - from: "lib/_route.js"
      to: "lib/_capabilities.js"
      via: "imports allCapabilities/capabilityForTool/buildCapability for the full known-command surface + capability gating"
      pattern: "from \"./_capabilities.js\""
---
<objective>
Build the pure, side-effect-free intent classifier for the gsd_route router (CLH-04). This plan delivers `lib/_route.js` — a deterministic, no-LLM, no-new-dependency classifier that maps a plain-English intent string to one target GSD command plus extracted parameters (phase number, option flags), evaluated capability-aware so absent steps/withdrawn tools are never recommended (D-07) — plus its offline unit-test matrix `test/_route.test.mjs`. The classifier performs no I/O and never mutates STATE/ROADMAP (out-of-scope); it consumes only the intent string and the present capability descriptors. This is the domain core that Plan 02's `gsd_route` tool and `/gsd-route` command wire into the host.
</objective>
<context>
@lib/_next.js — the direct sibling pure classifier (classifyNextState/renderNextRecommendation/hasCap/FALLBACK_RECOMMENDATION) whose structure and test style this module MUST mirror.
@lib/_render.js — effectiveRoutableStep (line 105) reused for D-10 nearest-present-step degradation; availableCapabilities (line 58).
@lib/_capabilities.js — allCapabilities (line 360), capabilityForTool (line 369), buildCapability (line 337), CAPABILITY_KEYS, ROLES, NOT_LOOP_ORDERED.
@test/_next.test.mjs — the unit-test matrix style to mirror (fullDescriptors()/without() helpers, describe/test blocks, no host context).
@lib/commands.js — phaseNum (line 21) and the flag regexes (--auto/--wave/--fix/--depth) whose parsing the option extraction mirrors (D-04).
</context>
<tasks>
  <task type="auto">
    <name>Task 1: Tracer — classifyIntent core + renderRouteRecommendation + minimal synonym table, unit-tested</name>
    <files>lib/_route.js, test/_route.test.mjs</files>
    <read_first>lib/_next.js, lib/_render.js, lib/_capabilities.js, test/_next.test.mjs</read_first>
    <action>
Create `lib/_route.js` as a pure ESM module (no host context, no fs, no I/O, no async — mirror lib/_next.js). Import `effectiveRoutableStep` from `./_render.js` and `allCapabilities`, `capabilityForTool`, `buildCapability` from `./_capabilities.js`. Define and export:

- `export const FALLBACK_RECOMMENDATION = "gsd_status";`
- `export function hasCap(descriptors, key)` — returns true when `descriptors` contains an entry whose `key` equals `key` (mirror lib/_next.js:46-48).
- `export function classifyIntent(intent, descriptors)` — the pure classifier (signature below).
- `export function renderRouteRecommendation(result)` — the pure renderer (signature below).

`classifyIntent(intent, descriptors)` returns an object of shape:
`{ matched:boolean, command:string|null, phase:number|null, options:{advance:boolean,fix:boolean,auto:boolean,wave:number|null,depth:string|null}, ambiguity:boolean, missingArg:string|null, absentCapability:string|null, degraded:boolean, note:string|null }`.

Internal pure helpers (module-private, exported only if a test needs them):
- `normalizeIntent(intent)` — `String(intent ?? "").toLowerCase().trim()`.
- `extractPhase(intent)` — first try `/\bphase\s*(\d+)\b/i`; if no match return null (the bare-number fallback is applied later, only for phase-taking commands).
- `extractOptions(intent)` — returns `{ advance:/\badvance\b/.test(intent), fix:/\bfix\b/.test(intent), auto:/\bauto\b/.test(intent), wave:Number((intent.match(/\bwave\s*(\d+)\b/)||[])[1]||null), depth:(intent.match(/\bdepth\s+(\S+)\b/)||[])[1]||null }`.
- `matchCommand(normalized)` — scores the normalized intent against the SYNONYMS table (below) and returns `{ command:string|null, score:number, ambiguity:boolean }`. For each command, sum the weights of every phrase that matches as a word-bounded substring (`new RegExp("\\b"+escapeRegex(phrase)+"\\b","i")`). The command with the highest score wins. `ambiguity` is true when the top score is > 0 and the top two scores are equal. `command` is null when the top score is 0.

For the TRACER, seed the SYNONYMS table with at least these commands (each entry `{ phrase, weight }`; include the tool name and the slash-command name as weight-3 entries): `gsd_discuss` (["discuss",1],["discussion",1],["seal context",2],["gsd_discuss",3],["gsd-discuss",3]), `gsd_plan` (["plan",1],["planning",1],["plan phase",2],["gsd_plan",3],["gsd-plan-phase",3]), `gsd_execute` (["execute",1],["run the plan",2],["gsd_execute",3],["gsd-execute-phase",3]), `gsd_status` (["status",1],["orient",1],["where are we",2],["gsd_status",3],["gsd-status",3]), `gsd_ship` (["ship",1],["create pr",2],["pull request",2],["gsd_ship",3],["gsd-ship",3]). Define a module-private `escapeRegex(s)` that escapes regex metacharacters.

`classifyIntent` control flow (in order):
1. `const normalized = normalizeIntent(intent);` If `normalized === ""` return `{ matched:false, command:FALLBACK_RECOMMENDATION, phase:null, options:extractOptions(intent), ambiguity:false, missingArg:null, absentCapability:null, degraded:false, note:"No intent provided; run gsd_status to orient and provide a clearer intent." }` (D-08, never throws).
2. `const { command, score, ambiguity } = matchCommand(normalized);` If `score === 0` return the gsd_status fallback with `note:"Could not match your intent to a GSD command; run gsd_status to orient."` (D-08). If `ambiguity` return the gsd_status fallback with `note:"Multiple commands matched equally; run gsd_status to orient and clarify your intent."` (D-05).
3. `let phase = extractPhase(normalized);` If `phase === null` and the command is in the `PHASE_REQUIRED` set (define `const PHASE_REQUIRED = new Set(["gsd_discuss","gsd_plan","gsd_execute","gsd_ship"])` for the tracer), apply a bare-number fallback `const m = normalized.match(/(?:^|\s)(\d+)(?:\s|$)/); if (m) phase = Number(m[1]);` (D-04/OQ-4).
4. Capability gating (D-06/D-07): `const capKey = capabilityForTool(command); const present = capKey ? hasCap(descriptors, capKey) : false;` If `!present`, degrade via a module-private `degrade(command, descriptors)` (see Task 3 for the full logic; for the tracer implement the orient/out-of-band branch: return `{ command:FALLBACK_RECOMMENDATION, note:"The <command> command is unavailable (its <capKey> capability is absent); routing to gsd_status." }`), set `degraded:true` and `absentCapability:capKey`, and return.
5. Missing-arg (D-09): if `PHASE_REQUIRED.has(command) && phase === null` return `{ matched:true, command, phase:null, options, ambiguity:false, missingArg:"phase", absentCapability:null, degraded:false, note:"The <command> command requires a phase number; none was found in the intent." }`.
6. Otherwise return `{ matched:true, command, phase, options, ambiguity:false, missingArg:null, absentCapability:null, degraded:false, note:null }`.

`renderRouteRecommendation(result)` returns a string: build `const cmd = r.command || FALLBACK_RECOMMENDATION;` collect option parts `["phase "+r.phase]` when `r.phase != null`, `["wave "+r.options.wave]` when `r.options?.wave != null`, `["depth "+r.options.depth]` when `r.options?.depth`, `["advance"]`/`["fix"]`/`["auto"]` when the corresponding option is true; join with ", " into a suffix; when the suffix is non-empty, return `Run the ${cmd} tool on ${suffix}.` (e.g. `Run the gsd_discuss tool on phase 3.`); when the suffix is empty, return `Run the ${cmd} tool.`; append ` ${r.note}` when `r.note` is set. The output MUST never contain the substring "auto-run" (D-02).

Create `test/_route.test.mjs` mirroring test/_next.test.mjs: import `classifyIntent`, `renderRouteRecommendation`, `FALLBACK_RECOMMENDATION` from `../lib/_route.js` and `buildCapability` from `../lib/_capabilities.js`. Add a `fullDescriptors()` helper returning `[buildCapability("gsdOrient"), buildCapability("gsdSpec"), buildCapability("gsdDiscuss"), buildCapability("gsdPlan"), buildCapability("gsdExecute"), buildCapability("gsdVerify"), buildCapability("gsdShip")]` and a `without(descriptors, key)` helper that filters out a key. Write TRACER tests only in this task: (a) `classifyIntent("discuss phase 3", fullDescriptors())` → `command === "gsd_discuss"`, `phase === 3`, `matched === true`; (b) `classifyIntent("", fullDescriptors())` → `command === "gsd_status"`, `matched === false`, and it does not throw; (c) `classifyIntent("gibberish qwerty", fullDescriptors())` → `command === "gsd_status"`; (d) `renderRouteRecommendation({command:"gsd_discuss",phase:3})` matches `/Run the gsd_discuss tool on phase 3/` and `doesNotMatch(/auto-run/)`.
    </action>
    <verify>node --test test/_route.test.mjs</verify>
    <acceptance_criteria>
      - `node --test test/_route.test.mjs` exits 0 with the tracer tests passing
      - grep -q "export function classifyIntent" lib/_route.js
      - grep -q "export function renderRouteRecommendation" lib/_route.js
      - grep -q "FALLBACK_RECOMMENDATION = \"gsd_status\"" lib/_route.js
      - grep -q "from \"./_render.js\"" lib/_route.js
      - grep -q "from \"./_capabilities.js\"" lib/_route.js
    </acceptance_criteria>
    <done>lib/_route.js exports classifyIntent/renderRouteRecommendation/FALLBACK_RECOMMENDATION/hasCap; the tracer unit tests pass; the module imports only ./_render.js and ./_capabilities.js (both pure) plus node builtins.</done>
  </task>

  <task type="auto">
    <name>Task 2: Full synonym table across all routable commands + weighted scoring + ambiguity/missing-phase/empty handling, unit-tested</name>
    <files>lib/_route.js, test/_route.test.mjs</files>
    <read_first>lib/_route.js, lib/_capabilities.js, lib/commands.js</read_first>
    <action>
Expand the SYNONYMS table in `lib/_route.js` to cover every routable GSD command EXCEPT `gsd_route` itself (the router is not a routing target — exclude it to avoid recursion). For each command include the tool name and slash-command name as weight-3 entries plus the natural-language phrases below (weight 1 for generic single words, weight 2 for specific multi-word phrasings). Use these exact entries:

- `gsd_discuss`: ["discuss",1],["discussion",1],["seal context",2],["context",1],["gsd_discuss",3],["gsd-discuss-phase",3]
- `gsd_spec_phase`: ["spec",1],["specify",1],["spec phase",2],["gsd_spec_phase",3],["gsd-spec-phase",3]
- `gsd_ui_phase`: ["ui design",2],["ui spec",2],["ui phase",2],["gsd_ui_phase",3],["gsd-ui-phase",3]
- `gsd_plan`: ["plan",1],["planning",1],["plan phase",2],["make a plan",2],["gsd_plan",3],["gsd-plan-phase",3]
- `gsd_gap_analysis`: ["gap analysis",2],["coverage",1],["gsd_gap_analysis",3],["gsd-gap-analysis",3]
- `gsd_execute`: ["execute",1],["run the plan",2],["execute phase",2],["do the work",2],["gsd_execute",3],["gsd-execute-phase",3]
- `gsd_code_review`: ["code review",2],["review",1],["review code",2],["gsd_code_review",3],["gsd-code-review",3]
- `gsd_ui_review`: ["ui review",2],["ui audit",2],["review",1],["gsd_ui_review",3],["gsd-ui-review",3]
- `gsd_verify`: ["verify",1],["verification",1],["check the work",2],["gsd_verify",3],["gsd-verify-work",3]
- `gsd_validate_phase`: ["validate",1],["validation",1],["gsd_validate_phase",3],["gsd-validate-phase",3]
- `gsd_ship`: ["ship",1],["create pr",2],["pull request",2],["ship phase",2],["gsd_ship",3],["gsd-ship",3]
- `gsd_status`: ["status",1],["orient",1],["where are we",2],["what's the state",2],["gsd_status",3],["gsd-status",3]
- `gsd_progress`: ["progress",1],["how far along",2],["gsd_progress",3],["gsd-progress",3]
- `gsd_next`: ["next",1],["next action",2],["smart entry",2],["what next",2],["gsd_next",3],["gsd-next",3]
- `gsd_init`: ["init",1],["initialise",1],["initialize",1],["bootstrap",1],["start a project",2],["gsd_init",3],["gsd-init",3]
- `gsd_quick`: ["quick",1],["quick task",2],["small task",2],["gsd_quick",3],["gsd-quick",3]
- `gsd_health`: ["health",1],["check integrity",2],["repair",1],["gsd_health",3],["gsd-health",3]
- `gsd_undo`: ["undo",1],["roll back",2],["revert",1],["gsd_undo",3],["gsd-undo",3]
- `gsd_milestone_audit`: ["milestone audit",2],["audit milestone",2],["gsd_milestone_audit",3]
- `gsd_extract_learnings`: ["learnings",1],["extract learnings",2],["gsd_extract_learnings",3],["gsd-extract-learnings",3]
- `gsd_graphify`: ["graphify",1],["knowledge graph",2],["graph",1],["gsd_graphify",3],["gsd-graphify",3]
- `gsd_mempalace_recall`: ["mempalace recall",2],["recall",1],["gsd_mempalace_recall",3],["gsd-mempalace-recall",3]
- `gsd_mempalace_capture`: ["mempalace capture",2],["capture",1],["gsd_mempalace_capture",3],["gsd-mempalace-capture",3]
- `gsd_autonomous`: ["autonomous",1],["drive all phases",2],["gsd_autonomous",3],["gsd-autonomous",3]
- `gsd_add_tests`: ["add tests",2],["tests",1],["gsd_add_tests",3],["gsd-add-tests",3]
- `gsd_phase`: ["phase manage",2],["add phase",2],["reorder phase",2],["edit phase",2],["gsd_phase",3],["gsd-phase-manage",3]
- `gsd_map_codebase`: ["map codebase",2],["map the code",2],["codebase map",2],["gsd_map_codebase",3],["gsd-map-codebase",3]
- `gsd_intel_updater`: ["intel updater",2],["remap",1],["update map",2],["gsd_intel_updater",3]
- `gsd_pause_work`: ["pause",1],["pause work",2],["gsd_pause_work",3],["gsd-pause-work",3]
- `gsd_resume_work`: ["resume",1],["resume work",2],["gsd_resume_work",3],["gsd-resume-work",3]
- `gsd_new_milestone`: ["new milestone",2],["start milestone",2],["gsd_new_milestone",3],["gsd-new-milestone",3]
- `gsd_job`: ["job",1],["launch job",2],["background job",2],["gsd_job",3]

Expand `PHASE_REQUIRED` to the full set of phase-taking commands: `new Set(["gsd_discuss","gsd_spec_phase","gsd_ui_phase","gsd_plan","gsd_gap_analysis","gsd_execute","gsd_code_review","gsd_ui_review","gsd_verify","gsd_validate_phase","gsd_undo","gsd_health","gsd_ship","gsd_extract_learnings","gsd_mempalace_recall","gsd_mempalace_capture"])`.

Add unit tests to `test/_route.test.mjs` covering: (a) synonym routing — `classifyIntent("execute phase 2", fullDescriptors())` → command `gsd_execute`, phase 2; `classifyIntent("run gsd_verify on phase 4", fullDescriptors())` → command `gsd_verify`, phase 4 (tool-name weight-3 match); (b) weighted disambiguation — `classifyIntent("ui review", fullDescriptors())` → command `gsd_ui_review` (weight 2 beats gsd_code_review's weight-1 "review"); `classifyIntent("review code", fullDescriptors())` → command `gsd_code_review` (the contiguous phrase "review code" matches gsd_code_review's weight-2 entry for score 3, beating gsd_ui_review's weight-1 "review" for score 1 — do NOT use "review the code", which only matches the bare weight-1 "review" in both commands and would tie); (c) ambiguity (D-05) — `classifyIntent("review", fullDescriptors())` → `ambiguity === true` and `command === "gsd_status"` (the bare "review" matches both gsd_code_review and gsd_ui_review at weight 1 — a genuine, deterministic tie); (d) missing-phase (D-09) — `classifyIntent("discuss", fullDescriptors())` → `missingArg === "phase"`, `command === "gsd_discuss"`, `phase === null`; (e) empty/garbage (D-08) — `classifyIntent("   ", fullDescriptors())` and `classifyIntent("asdf qwerty", fullDescriptors())` both return `command === "gsd_status"` and never throw; (f) bare-number fallback — `classifyIntent("discuss 3", fullDescriptors())` → phase 3.
    </action>
    <verify>node --test test/_route.test.mjs</verify>
    <acceptance_criteria>
      - `node --test test/_route.test.mjs` exits 0
      - grep -q "gsd_ui_review" lib/_route.js
      - grep -q "gsd_mempalace_capture" lib/_route.js
      - grep -q "PHASE_REQUIRED" lib/_route.js
      - grep -q "missingArg" lib/_route.js
      - grep -q "ambiguity" lib/_route.js
    </acceptance_criteria>
    <done>The SYNONYMS table covers every routable command except gsd_route; weighted scoring resolves ui-review vs code-review; ambiguity, missing-phase, empty/garbage, and bare-number fallback are implemented and unit-tested.</done>
  </task>

  <task type="auto">
    <name>Task 3: Capability-aware degradation (D-10) + never-instruct-a-missing-tool invariant (D-07) + full matrix tests</name>
    <files>lib/_route.js, test/_route.test.mjs</files>
    <read_first>lib/_route.js, lib/_render.js, lib/_capabilities.js, test/_next.test.mjs</read_first>
    <action>
Complete the `degrade(command, descriptors)` helper in `lib/_route.js` for the D-10 absent-command path. Logic:
1. `const cap = capabilityForTool(command); const desc = cap ? buildCapability(cap) : null;`
2. If `desc` and `desc.role` is one of `["step","optional","alternate"]` (a loop-step command): FIRST verify the descriptor shape in `lib/_capabilities.js` — read the `buildCapability` output for a loop-step capability (e.g. `gsdDiscuss`) and confirm whether the descriptor exposes a `step` field or whether the step token must be derived from the tool-name prefix. Derive the step token from the actual field present: `const stepToken = desc.step ?? command.replace(/^gsd_/, "");` (e.g. `gsd_discuss` → `discuss`). Then call `const stepDesc = effectiveRoutableStep(`${stepToken}-phase`, descriptors);` (imported from `./_render.js`). If `stepDesc` is non-null, return `{ command: buildCapability(stepDesc.key).tools[0], note: "The <command> command is unavailable (its <cap> capability is absent); routing to the nearest available step <tool>." }`. If `stepDesc` is null, fall through to the orient branch.
3. Orient/out-of-band branch (orient command, or no loop step available): make it capability-aware so it never instructs a missing tool (D-07). If `hasCap(descriptors, "gsdOrient")` is true, return `{ command: FALLBACK_RECOMMENDATION, note: "The <command> command is unavailable (its <cap> capability is absent); routing to gsd_status." }`. Otherwise gsd_status is itself unavailable (its owning capability gsdOrient is absent), so do NOT return it: call a module-private `firstPresentTool(descriptors)` helper that returns the first present tool name (`buildCapability(d.key).tools[0]` for each present descriptor, first non-null) or null. If a present tool exists, return `{ command: <that tool>, note: "The <command> command is unavailable (its <cap> capability is absent) and gsd_status is also unavailable; routing to <tool>." }`. If no present tool exists (empty descriptors), return `{ command: FALLBACK_RECOMMENDATION, note: "No GSD commands are available; orient manually." }` — the fallback is only used when nothing is present, so it cannot instruct a missing tool.

In `classifyIntent`, the `!present` branch (step 4 of Task 1) must call `degrade(command, descriptors)`, set `degraded:true` and `absentCapability:capKey`, and return `{ matched:true, command:degraded.command, phase, options, ambiguity:false, missingArg:null, absentCapability:capKey, degraded:true, note:degraded.note }`. The degraded recommendation MUST never be the absent command (D-07) and MUST never silently pick a different phase (D-10).

Add unit tests to `test/_route.test.mjs`:
(a) D-10 loop-step degradation — `classifyIntent("discuss phase 3", without(fullDescriptors(), "gsdDiscuss"))` → `degraded === true`, `absentCapability === "gsdDiscuss"`, `command !== "gsd_discuss"`, and `command` is a present loop-step tool (e.g. `gsd_plan` when gsdPlan is present and is the nearest present step after discuss); assert `note` mentions "unavailable".
(b) D-10 orient degradation — `classifyIntent("status", without(fullDescriptors(), "gsdOrient"))` → `command === "gsd_status"` is NOT required (gsd_status is itself absent); instead assert `degraded === true` and `command` is a present tool or the fallback, and `command !== "gsd_status"` when gsdOrient is absent (never-instruct-a-missing-tool). Use a present-capability assertion via a `presentTools(descriptors)` helper in the test that collects `buildCapability(d.key).tools` for each present descriptor.
(c) D-07 invariant sweep — for a representative set of intents (`["discuss phase 3","plan","execute phase 2","ship","status","quick"]`), retire each capability one at a time and assert that `classifyIntent` never returns a `command` whose owning capability is absent from the descriptors. Implement a `presentTools(descriptors)` helper and assert `presentTools(descriptors).has(result.command)` for every non-fallback result.
(d) `renderRouteRecommendation` for a degraded result includes the note and never contains "auto-run".
(e) `classifyIntent` never throws on a fully-empty descriptors array (`classifyIntent("discuss phase 3", [])` → returns a result, `command` is the fallback or a present tool, no throw).
    </action>
    <verify>node --test test/_route.test.mjs</verify>
    <acceptance_criteria>
      - `node --test test/_route.test.mjs` exits 0
      - grep -q "effectiveRoutableStep" lib/_route.js
      - grep -q "degraded" lib/_route.js
      - grep -q "absentCapability" lib/_route.js
      - grep -q "presentTools" test/_route.test.mjs
      - grep -q "never-instruct" test/_route.test.mjs
    </acceptance_criteria>
    <done>degrade() routes absent loop-step commands to the nearest present step (step token derived from the actual descriptor field, verified against lib/_capabilities.js) and absent orient/out-of-band commands to gsd_status only when gsdOrient is present, otherwise to a present tool or a generic orientation sentence; the never-instruct-a-missing-tool invariant holds across the retired-capability matrix; the full unit suite passes.</done>
  </task>
</tasks>

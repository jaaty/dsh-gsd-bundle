---
phase: 50-add-tests
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - lib/add-tests.js
  - lib/_capabilities.js
  - lib/commands.js
  - lib/_agents.js
  - package.json
  - cordis.patch.yml
  - test/helpers/mount-harness.mjs
autonomous: true
requirements: ["GAP-16"]
gap_closure: false
user_setup: []
must_haves:
  truths:
    - "A completed phase with at least one SUMMARY-<PP>.md, when gsd_add_tests is called without --proceed/--auto, returns the classification plan and spawns NO subagent and writes NO file."
    - "When gsd_add_tests is called with --proceed on a completed phase, it writes the accepted test files, atomically commits them with message `test(phase-{N}): add unit and E2E tests from add-tests command`, writes <NN>-ATEST.md, and does NOT advance the STATE loop position."
    - "A writer-returned path that is absolute, empty, contains a `..` segment, or is not test-shaped is skipped and never written."
    - "When the writer subagent is unavailable or returns malformed output, gsd_add_tests degrades with a pending UNAVAILABLE <NN>-ATEST.md and reports the real cause; it never fakes success."
  artifacts:
    - path: "lib/add-tests.js"
      provides: "The gsd_add_tests out-of-band tool: gsdAddTests capability, fail-fast guards, deterministic SUMMARY key-files extraction, UNIT/INTEGRATION/SKIP writer dispatch, validateTestPaths hard boundary, atomic commit, <NN>-ATEST.md report, and pure helpers extractChangedFiles/TEST_WRITER_SCHEMA/resolveWriterOutput/buildATestBody."
      min_lines: 380
      exports: ["name", "inject", "apply", "extractChangedFiles", "TEST_WRITER_SCHEMA", "resolveWriterOutput", "buildATestBody"]
  key_links:
    - from: "lib/add-tests.js"
      to: "lib/_capabilities.js"
      via: "ctx.provide('gsdAddTests', buildCapability('gsdAddTests')) with the descriptor row added to the TABLE and gsdAddTests appended to CAPABILITY_KEYS"
      pattern: "gsdAddTests"
    - from: "lib/commands.js"
      to: "lib/add-tests.js"
      via: "COMMANDS entry name 'gsd-add-tests' auto-paired to gsdAddTests through commandToCapability/allCapabilities"
      pattern: "gsd-add-tests"
    - from: "lib/add-tests.js"
      to: "lib/code-review.js"
      via: "extractChangedFiles SELF-HOSTS the SUMMARY key-files parse via parseFrontmatter (from _shared.js) and prunes through filterSourcePaths (already exported from code-review.js) — no dependency on a code-review export added by this plan"
      pattern: "filterSourcePaths"
    - from: "lib/add-tests.js"
      to: "lib/validate-phase.js"
      via: "tool writes only via validateTestPaths([entry.path]).valid (reused export); traversing/impl/absolute are skipped"
      pattern: "validateTestPaths"
    - from: "lib/add-tests.js"
      to: "lib/_agents.js"
      via: "TEST_WRITER_PROMPT + TEST_WRITER_SCHEMA constants defined beside VALIDATION_AUDITOR_PROMPT and imported"
      pattern: "TEST_WRITER_PROMPT"
    - from: "lib/add-tests.js"
      to: "lib/_git-artifacts.js"
      via: "commitSourceFiles(cwd, acceptedPaths, 'test(phase-{N}): add unit and E2E tests from add-tests command', gitFn) and commitArtifacts(cwd, phase.n, {scope:'add-tests', phaseName})"
      pattern: "commitSourceFiles"
    - from: "lib/add-tests.js"
      to: "lib/_runner.js"
      via: "spawnSubagent(ctx, exec, { label:'gsd-add-tests-writer', promptText, outputSchema: TEST_WRITER_SCHEMA })"
      pattern: "spawnSubagent"
---
<objective>
Deliver the gsd_add_tests tool (opengsd /gsd-add-tests / GAP-16) as the thinnest production-grade vertical slice touching every layer end-to-end: capability + descriptor row, command pairing, plugin-row + package-export registration, the full tool flow (fail-fast guards → deterministic changed-file extraction → classification gate → writer subagent dispatch → validateTestPaths hard boundary → atomic commit → <NN>-ATEST.md report → advisory no-STATE-mutation), and the test-writer prompt contract. This is the traaser slice: all layers are wired, so a completed phase can be exercised end-to-end, before the offline test suite lands in plans 02/03.
</objective>
<context>
@.planning/phases/GSD-50-add-tests/GSD-50-add-tests-CONTEXT.md
@.planning/phases/GSD-50-add-tests/GSD-50-add-tests-RESEARCH.md
@lib/validate-phase.js
@lib/autonomous.js
@lib/_capabilities.js
@lib/commands.js
@lib/code-review.js
@lib/_runner.js
@lib/_git-artifacts.js
@lib/_agents.js
@lib/state.js
@test/helpers/mount-harness.mjs
@cordis.patch.yml
@package.json
</context>
<tasks>
  <task type="auto">
    <name>Task 1 (tracer): Implement the full gsd_add_tests tool in lib/add-tests.js + single-source the writer prompt/schema in lib/_agents.js</name>
    <files>lib/add-tests.js, lib/_agents.js</files>
    <read_first>lib/validate-phase.js, lib/autonomous.js, lib/code-review.js, lib/_runner.js, lib/_git-artifacts.js, lib/_agents.js, lib/_shared.js, lib/state.js</read_first>
    <action>
Create a new ESM module lib/add-tests.js implementing the out-of-band add-tests generator tool (D-01/D-02/D-03/D-04/D-05/D-06/D-07/D-08/D-09/D-10/D-11). Mirror lib/validate-phase.js (the deterministic scan + structured-output subagent + write/commit division of labour) and lib/autonomous.js (the out-of-band NOT_LOOP_ORDERED plugin shape).

Imports (exact): import { defineTool } from "@deepseek-ai/dsh-tools"; import { validateTestPaths, detectTestInfra } from "./validate-phase.js"; import { filterSourcePaths } from "./code-review.js"; import { cwdOf, spawnSubagent } from "./_runner.js"; import { ensurePhaseBranch, commitArtifacts, commitSourceFiles, defaultGitFn } from "./_git-artifacts.js"; import { buildCapability } from "./_capabilities.js"; import { TEST_WRITER_PROMPT, TEST_WRITER_SCHEMA, TEST_WRITER_STATUSES } from "./_agents.js"; import { nowIso, zeroPad, today, parseFrontmatter, stringifyFrontmatter } from "./_shared.js".

Module constants (exported): const name = "gsd-add-tests"; const inject = ["gsdState", "tools", "subagents"]; (D-02: 'subagents' is a hard coeffect — spawnSubagent throws when absent, exactly DEGR-07).

Pure helper No.1 — export function extractChangedFiles(summaryTexts, { filter = true } = {}): takes the array of raw *-SUMMARY.md text bodies read from readArtifact, SELF-HOSTS the key-files frontmatter parse (D-13): parse each body with parseFrontmatter (already imported from _shared.js), read key-files.created + key-files.modified (fallback key key_files), flat-map the string arrays, dedupe non-empty trimmed strings, and when filter is true prune through filterSourcePaths. Return the deduped array. This keeps the SUMMARY key-files extraction deterministic (D-05, RESEARCH OQ-1) by parsing the raw text directly with parseFrontmatter — NOT relying on the fs-bound extractSummaryFiles from code-review.js, so the module has no dependency on any code-review.js export that this plan adds later. filterSourcePaths (already exported at code-review.js:163) is the only code-review.js import.

Pure helper No.2 — single-source the writer contracts in lib/_agents.js: the schema and prompt are DEFINED ONCE in lib/_agents.js beside the existing VALIDATION_AUDITOR_PROMPT/VALIDATION_AUDITOR_SCHEMA, and IMPORTED into add-tests.js — do NOT declare `export const TEST_WRITER_SCHEMA` locally in add-tests.js (importing and locally declaring the same binding is a duplicate-binding SyntaxError). In lib/_agents.js add, beside the VALIDATION_* constants (~line 506): `export const TEST_WRITER_STATUSES = Object.freeze(["GENERATED","PARTIAL","ESCALATE"]);` (a shared array both the schema enum and resolveWriterOutput use), `export const TEST_WRITER_SCHEMA = Object.freeze({ type:"object", properties:{ tests_written:{ type:"array", items:{ type:"object", properties:{ path:{type:"string"}, req_id:{type:"string"}, content:{type:"string"}, type:{type:"string", enum:["Unit","Integration","Skip"]} }, required:["path","req_id","content"], additionalProperties:false } }, skip:{ type:"array", items:{ type:"object", properties:{ path:{type:"string"}, reason:{type:"string"} }, required:["path"], additionalProperties:false } }, status:{ type:"string", enum:[...TEST_WRITER_STATUSES] }, escalated:{ type:"array", items:{ type:"object", properties:{ req_id:{type:"string"}, reason:{type:"string"} }, required:["req_id"], additionalProperties:false } }, notes:{ type:"string" } }, required:["tests_written","status"], additionalProperties:false })` and `export const TEST_WRITER_PROMPT = \`...\`` (a fresh-context gsd-add-tests-writer prompt modeled on VALIDATION_AUDITOR_PROMPT — see Task 2 for the full prompt text/behaviour contract). In add-tests.js the export line (below) re-exports TEST_WRITER_SCHEMA; the import line must include ALL THREE of TEST_WRITER_STATUSES, TEST_WRITER_SCHEMA, TEST_WRITER_PROMPT. This is the structured contract the gsd-add-tests-writer subagent returns (D-06), restricted to the object-rooted subset (type/properties/required/items/enum), mirroring VALIDATION_AUDITOR_SCHEMA.

Pure helper No.3 — export function resolveWriterOutput(structured): returns the structured object when it is an object with an array tests_written whose every entry carries string path/req_id/content AND a status in TEST_WRITER_STATUSES; otherwise returns null. Mirror resolveAuditorOutput (validate-phase.js:191). The skip/escalated/notes/type fields are tolerated but not required for validity.

Pure helper No.4 — export function buildATestBody({ phaseN, phaseName, phaseGoal, status, files, skipped, escalated, gaps, suggestedCommand, notes, date }): returns a Markdown string for the <NN>-ATEST.md report with sections: heading `# Phase {N}: {name} - Add-Tests Report`; `**Generated:** {status}` (one of GENERATED/PARTIAL/ESCALATE/UNAVAILABLE); `## Generated Test Files` listing each accepted `{path}` with `{req_id}` and `{type}` (Unit/Integration); `## Skipped` listing skip entries `{path} — {reason}`; `## Coverage Gaps` listing req_ids escalated (never fixed — report only, D-11); `## Bugs (report-only)`: surfaced from escalated reasons / notes that indicate an assertion failure, never fixed; `## Suggested Run Commands` containing `{suggestedCommand}` (D-11: the tool never executes it); and a trailing `*Phase: {zeroPad(phaseN)}-{phaseName}* /*Add-Tests: {today()}*`. It is a pure function over plain data.

Tool apply() — export function apply(ctx): const gsd = () => ctx.get("gsdState"); ctx.provide("gsdAddTests", buildCapability("gsdAddTests")) (D-01). ctx.tools.register(defineTool({ name:"gsd_add_tests", description:"Add-tests generator (opengsd /gsd-add-tests / GAP-16): creates unit and Integration tests for a COMPLETED phase from its SUMMARY/CONTEXT/VERIFICATION and implementation. Deterministically extracts the phase's changed files from SUMMARY key-files, spawns one gsd-add-tests-writer subagent that classifies each into Unit|Integration|Skip and returns structured test payloads, validates paths, atomically commits with message `test(phase-{N}): add unit and E2E tests from add-tests command`, writes <NN>-ATEST.md, and returns a structured summary. Advisory: never advances the STATE loop position and never ships. Run after a phase passed gsd_execute.", parameters: { phase:{type:"number"}, proceed:{type:"boolean"}, auto:{type:"boolean"}, cancel:{type:"boolean"} }, output:{ schema:{type:"string"}, render:(_a,v)=>[{type:"text",text:v}] }, async execute(args, exec){ ... }, presentCall:(a)=>({ card:"generic", title:`Add-tests for phase ${a.phase}`, kind:"other", rawInput:{ phase:a.phase } }) })).

Implementation of execute(args, exec), in EXACT order:
1. cwd = cwdOf(exec); s = gsd(). if(!s) throw new Error("gsd_add_tests: gsdState service unavailable") (D-02).
2. if(!(await s.isProject(cwd))) throw new Error("gsd_add_tests: no .planning/ project — run gsd_init first") (D-10, mirror validate-phase.js:373).
3. roadmap = await s.readRoadmap(cwd); phase = (roadmap?.phases||[]).find(p=>p.n===args.phase); if(!phase) throw new Error(`gsd_add_tests: phase ${args.phase} not in ROADMAP.md`) (D-10).
4. plans = await s.listPlans(cwd, phase.n); const executed = plans.filter(p=>p.has_summary); if(executed.length===0) throw new Error(`gsd_add_tests: phase ${phase.n} not executed (no SUMMARY found — run gsd_execute first)`) (D-04, mirror validate-phase.js:381).
5. CQ-07/MW-02: await ensurePhaseBranch(cwd, phase.n).
6. Read artefact bodies: for each executed plan read await s.readArtifact(cwd, phase.n, `SUMMARY-${zeroPad(Number(p.plan))}`) into an array; const contextBody = await s.readArtifact(cwd, phase.n, "CONTEXT"); const verifyBody = await s.readArtifact(cwd, phase.n, "VERIFICATION").
7. const changedFiles = extractChangedFiles(summaryBodies, { filter:true }); if(changedFiles.length===0) return a clear blocked message "no changed implementation files recorded in SUMMARY key-files — nothing to generate" and STOP (no gate, no spawn) (RISK R-2).
8. Test infra: const infra = detectTestInfra({ configFiles:["package.json"], testFiles:[] }) (the bundle always runs node:test — D-03); you MAY enhance with a bounded listDir walk for jest.config*/vitest.config* config basenames. BUT detectTestInfra returns suggested_command "node --test" (validate-phase.js:99) — REQUIREMENT: the EXECUTOR MUST override/append it so infra.suggested_command resolves to the EXACT string "node --test test/*.test.mjs" (e.g. `infra = { ...infra, suggested_command: "node --test test/*.test.mjs" }`). This literal is what the gate text, the buildATestBody report, and Plan-02's buildATestBody assertion all rely on — the default must remain "node --test test/*.test.mjs" unconditionally.
9. classification gate (D-09): if(changedFiles.length && !args.proceed && !args.auto) return a gate string listing the changed files, the detected test framework + suggested command, the statement that the writer will classify each file into Unit|Integration|Skip and generate tests, and instructions to re-call with --proceed (or --auto to bypass) or --cancel to abort. Return IMMEDIATELY — no subagent spawned, no file written.
10. if(args.cancel) return a cancelled acknowledgement (no spawn, no write).
11. Writer dispatch (D-05/D-06): build promptText = TEST_WRITER_PROMPT + "\n" + a `<phase_context>` block containing the phase number/name/goal, the raw summary/context/verification bodies (truncate each to a reasonable cap, e.g. 12000 chars, with an inline …(truncated)… marker), the joined changedFiles, the test framework {infra.kind} + suggested command, and the explicit Unit|Integration|Skip criteria (Unit = the changed implementation file's pure/unit behaviour in test/*.test.mjs; Integration = the phase's gsd_* tools end-to-end via test/helpers/mount-harness.mjs in node:test — NO browser, per D-03; Skip = a file already covered or impractical to automate). Then: let structured; let cause=null; try { const r = await spawnSubagent(ctx, exec, { label:"gsd-add-tests-writer", promptText, outputSchema: TEST_WRITER_SCHEMA }); structured = resolveWriterOutput(r.structured); if(!structured) cause = "writer returned malformed structured output (tests_written missing or invalid)"; } catch(e){ cause = (e && e.message) || String(e); }.
12. Degrade-with-flag on writer fault (D-10): if(cause) write a pending UNAVAILABLE <NN>-ATEST.md via s.writeArtifact(cwd, phase.n, "ATEST", stringifyFrontmatter({ phase:String(phase.n), generated: nowIso(), status:"UNAVAILABLE", test_infra: infra.kind, suggested_command: infra.suggested_command }) + "\n" + a body marking Status UNAVAILABLE with the real cause), then commitArtifacts(cwd, phase.n, { scope:"add-tests", phaseName:phase.name }), and return the degraded summary. Never rethrow; never fake success.
13. R-5 hard boundary (D-07): for each entry of structured.tests_written, const { valid, skipped } = validateTestPaths([entry.path]); if(valid.length){ const target = await ctx.fs.resolve(`${cwd}/${entry.path}`); await ctx.fs.writeText(target, entry.content); acceptedPaths.push(entry.path); acceptedMeta.push({path:entry.path, req_id:entry.req_id, type:entry.type||"Unit"}); } else { skippedRecords.push({ path:entry.path, reason:"rejected by validateTestPaths hard boundary" }); escalatedIds.push(entry.req_id || entry.path); }. NEVER resolve or write a skipped path.
14. If(acceptedPaths.length===0) → degrade-with-flag UNAVAILABLE ATEST (same as step 12, cause "writer produced no accepted test files") and return.
15. Atomic commit (D-08): const gitFn = ctx.gitFn || defaultGitFn; await commitSourceFiles(cwd, acceptedPaths, `test(phase-${phase.n}): add unit and E2E tests from add-tests command`, gitFn) — message VERBATIM with the UNPADDED phase number.
16. Build the report body via buildATestBody({ phaseN:phase.n, phaseName:phase.name, phaseGoal:phase.goal||"(none)", status:structured.status, files:acceptedMeta, skipped:skippedRecords, escalated:(structured.escalated||[]) plus escalatedIds, gaps:structured.escalated?.map(e=>e.req_id)||escalatedIds, suggestedCommand:infra.suggested_command, notes:structured.notes||"" }). Wrap `stringifyFrontmatter({ phase:String(phase.n), generated: nowIso(), status: structured.status, test_infra: infra.kind, generated_count: acceptedPaths.length, suggested_command: infra.suggested_command }) + "\n" + body`. Write via await s.writeArtifact(cwd, phase.n, "ATEST", full).
17. Commit the report: await commitArtifacts(cwd, phase.n, { scope:"add-tests", phaseName:phase.name }).
18. Advisory (D-04): DO NOT call s.setActivePhase / completePhase anywhere in execute. Return a structured text summary: `Add-tests generated for phase {N} ({name}). Status {status}, {acceptedPaths.length} test file(s) written/committed. Skipped: {n}. Coverage gaps (report-only, never fixed): {ids}. Suggested run: {suggestedCommand} (tool does not execute the suite — D-11). Wrote {ATEST path}. Branch: {branchInfo.action} ({branchInfo.branch}). STATE not advanced.` Also surface any bug-indication from escalated/notes as "potential bugs reported (expected/actual/file) by the generated tests — NOT fixed (D-11)".

Export: export { name, inject, apply, extractChangedFiles, TEST_WRITER_SCHEMA, resolveWriterOutput, buildATestBody }.
</action>
<verify>
node --check lib/add-tests.js (parse success) and node --check lib/_agents.js (parse success) and node -e "import('./lib/add-tests.js').then(m=>{console.log(Object.keys(m))})" prints the exported names including extractChangedFiles, TEST_WRITER_SCHEMA, resolveWriterOutput, buildATestBody, name, apply, inject (this import only succeeds once _agents.js exports TEST_WRITER_SCHEMA/TEST_WRITER_PROMPT/TEST_WRITER_STATUSES — verify all three are present in one pass so the ordering hazard is closed within this task). `grep -n "buildCapability(\"gsdAddTests\")" lib/add-tests.js` matches. `grep -n "setActivePhase" lib/add-tests.js` returns NOTHING (advisory no-STATE-mutation). `grep -n "test(phase-" lib/add-tests.js` matches the verbatim commit message with backtick template. `grep -n "suggested_command: \"node --test test/\*.test.mjs\"" lib/add-tests.js` matches (the exact literal that step 8's REQUIREMENT and Plan-02's buildATestBody assertion depend on).
</verify>
<acceptance_criteria>
- `node --check lib/add-tests.js` exits 0.
- `node -e "import('./lib/add-tests.js')"` prints keys: name, inject, apply, extractChangedFiles, TEST_WRITER_SCHEMA, resolveWriterOutput, buildATestBody.
- `grep -n "gsd_add_tests" lib/add-tests.js` matches the defineTool name.
- `grep -n "validateTestPaths" lib/add-tests.js` matches an import and a call.
- `grep -n "spawnSubagent" lib/add-tests.js` matches a call with label gsd-add-tests-writer.
- `grep -n "commitSourceFiles" lib/add-tests.js` matches with the verbatim message `test(phase-${phase.n}): add unit and E2E tests from add-tests command`.
- `grep -n "setActivePhase" lib/add-tests.js` has NO match (exit 1 / empty).
- `grep -n "UNAVAILABLE" lib/add-tests.js` matches the degrade report writer.
- `grep -n "node --test test/\*.test.mjs" lib/add-tests.js` matches >= 1 (enforces the exact suggested_command literal that step 8 and Plan-02's buildATestBody assertion rely on).
- `grep -n "TEST_WRITER_STATUSES" lib/_agents.js` matches the Object.freeze status array, and `grep -n "TEST_WRITER_SCHEMA" lib/_agents.js` matches the Object.freeze schema (single source — no local declaration in add-tests.js).
</acceptance_criteria>
<done>
The gsd_add_tests tool exists with all exported pure helpers, the full execute flow (guards → gate → writer dispatch → validateTestPaths → atomic commit → ATEST.md → advisory), and never calls setActivePhase. Parse and import succeed.
</done>
  </task>
  <task type="auto">
    <name>Task 2: Register the gsdAddTests capability, the /gsd-add-tests command, the package export, the plugin row, and the writer prompt contracts</name>
    <files>lib/_capabilities.js, lib/commands.js, lib/_agents.js, package.json, cordis.patch.yml, test/helpers/mount-harness.mjs</files>
    <read_first>lib/_capabilities.js, lib/commands.js, lib/_agents.js, cordis.patch.yml, test/helpers/mount-harness.mjs, package.json</read_first>
    <action>
Wire the add-tests registration surface so the tool is reachable, paired, shippable, and patch-mounted. Make each change ATOMIC in one commit with the Task-1 tool so the count-cascade suite (plans 02/03) reflects the final numbers.

A. lib/_capabilities.js (D-01): append "gsdAddTests" LAST to the CAPABILITY_KEYS array (after "gsdAutonomous"), so the render informationEntries order appends gsdAddTests at the end. Add TO the TABLE object a row: gsdAddTests:{ step:"add-tests", role:"out-of-band", tools:["gsd_add_tests"], commands:["gsd-add-tests"], order:NOT_LOOP_ORDERED, prereq:[], next:[], produces:["<NN>-ATEST.md","TEST files"], consumes:["SUMMARY.md","CONTEXT.md","VERIFICATION.md"] }. It uses the existing NOT_LOOP_ORDERED (-1) sentinel; it does NOT join the role:"step" retirement matrix.

B. lib/commands.js (D-01): append to COMMANDS an entry { name:"gsd-add-tests", description:"Add unit and Integration tests for a completed phase from its UAT criteria and implementation (gsd_add_tests).", hint:"[phase]", build:(raw)=>{ const n=phaseNum(raw); return { text:`Run the gsd_add_tests tool${n?` with phase ${n}`:""} to create unit and Integration tests for a completed phase from its SUMMARY/CONTEXT/VERIFICATION and implementation. It is advisory and never advances STATE.`, ack:"Adding tests via gsd_add_tests." }; } }. The existing commandToCapability loop auto-pairs it to gsdAddTests via the descriptor (no manual wiring).

C. lib/_agents.js (D-06): TEST_WRITER_STATUSES, TEST_WRITER_SCHEMA, TEST_WRITER_PROMPT are ALREADY defined and exported by Task 1 in lib/_agents.js — DO NOT re-declare or rename them here (importing + locally declaring the same binding is a duplicate-binding SyntaxError). Verify they exist with `grep -n "export const TEST_WRITER_SCHEMA\|export const TEST_WRITER_PROMPT\|export const TEST_WRITER_STATUSES" lib/_agents.js`. If Task 1 only stubbed TEST_WRITER_PROMPT, extend the EXISTING constant (do not add a second) so its full behaviour contract reads: a fresh-context gsd-add-tests-writer prompt, modeled on VALIDATION_AUDITOR_PROMPT (lib/_agents.js ~line 506): "You are gsd-add-tests-writer. Your job: for a COMPLETED GSD phase, generate unit and Integration tests for the changed implementation files and return them as a structured output object. You have filesystem, shell, grep/glob, and read tools. You DO NOT write files and DO NOT commit — return only the JSON object; the orchestrator tool validates paths, writes, and commits. The <phase_context> block gives you the phase SUMMARY/CONTEXT/VERIFICATION bodies, the changed implementation files, the detected test framework + suggested command. Classify EACH changed file as: Unit — add a node:test unit test in test/*.test.mjs exercising the file's exported pure behaviour; Integration — add a node:test test (NO browser/Playwright) that drives the phase's gsd_* tools end-to-end via the test/helpers/mount-harness.mjs makeMountCtx/makeExec conventions; Skip — the file is already covered, is a fixture/schema, or is impractical to automate (record in skip with a reason). HARD BOUNDARY: only NEW test-file paths are allowed — a basename ending .test.<ext> or .spec.<ext>, a test_ prefixed basename, or a path under test/tests/__tests__; NEVER modify or produce an implementation file (lib/, src/, app/). If you detect an implementation BUG (an assertion that would fail), do NOT fix the implementation and do NOT weaken the test — record it as an escalated {req_id, reason} noting expected/actual/file, and if the test would fail, mark it in escalated rather than claiming success. Return EXACTLY a JSON object matching the schema: { "tests_written": [ { "path": "...", "req_id": "...", "content": "...", "type": "Unit"|"Integration" } ], "skip": [ { "path": "...", "reason": "..." } ], "status": "GENERATED"|"PARTIAL"|"ESCALATE", "escalated": [ { "req_id": "...", "reason": "..." } ], "notes": "..." }.

D. package.json (OQ-3): add to the `exports` map a subpath entry `"./add-tests": { "default": "./lib/add-tests.js" }` (place it near the "./autonomous" block). No `files` change needed (lib/*.js is already whitelisted).

E. cordis.patch.yml (OQ-3): add a new insert row in the same insert block, directly after the gsd-autonomous row (line 139-140) and before gsd-ship: a comment line "# The add-tests generator (/gsd-add-tests): creates unit and Integration tests for a completed phase from its UAT criteria and implementation. Out-of-band; never advances STATE, never ships." followed by `- id: gsd-add-tests` / `  name: '@dsh-gsd/bundle/add-tests'`.

F. test/helpers/mount-harness.mjs (OQ-3): append to PATCH_ROWS a row { id:"gsd-add-tests", sub:"add-tests" } (place after { id:"gsd-autonomous", sub:"autonomous" } line 42), so it joins the mount surface and EXPECTED_INSERT_ROWS (derived from PATCH_ROWS) auto-grows to 25.

Commit all of A-F WITH the lib/add-tests.js tool from Task 1 in ONE atomic commit (message e.g. `feat(phase-50): add gsd_add_tests generator + registration`). Verify package.json exports remains valid JSON.
</action>
<verify>
`node -e "const p=require('./package.json'); console.log(Boolean(p.exports['./add-tests']))"` prints true. `node -e "import('./lib/_capabilities.js').then(m=>console.log(m.CAPABILITY_KEYS[m.CAPABILITY_KEYS.length-1]))"` prints gsdAddTests. `grep -n "\"gsd-add-tests\"" lib/commands.js` matches. `grep -n "gsd-add-tests" cordis.patch.yml` matches. `grep -n "sub: \"add-tests\"" test/helpers/mount-harness.mjs` matches. `node -e "import('./lib/_agents.js').then(m=>console.log(Boolean(m.TEST_WRITER_PROMPT), Boolean(m.TEST_WRITER_SCHEMA)))"` prints true true. `grep -n "filterSourcePaths" lib/add-tests.js` matches (the sole code-review.js import for extractChangedFiles).
</verify>
<acceptance_criteria>
- `node -e "const p=require('./package.json'); console.log(Boolean(p.exports['./add-tests']))"` prints `true`.
- `node -e "import('./lib/_capabilities.js').then(m=>console.log(m.CAPABILITY_KEYS[m.CAPABILITY_KEYS.length-1]))"` prints `gsdAddTests`.
- `grep -cn "gsd-add-tests" lib/commands.js` is >= 1.
- `grep -c "gsd-add-tests" cordis.patch.yml` is >= 1.
- `grep -c "sub: \"add-tests\"" test/helpers/mount-harness.mjs` is >= 1.
- `node -e "import('./lib/_agents.js').then(m=>console.log(Boolean(m.TEST_WRITER_PROMPT), Boolean(m.TEST_WRITER_SCHEMA)))"` prints `true true`.
- `grep -n "filterSourcePaths" lib/add-tests.js` matches the sole code-review.js import used by extractChangedFiles.
- `node --check lib/add-tests.js` (if not done in Task 1) exits 0.
</acceptance_criteria>
<done>
The capability descriptor, command, package subpath export, cordis.patch.yml insert row, mount-harness PATCH_ROWS row, and writer prompt/schema all exist and are wired, matching the counts the follow-up plans assert (23 capability keys, 30 tools, 27 commands, 25 insert rows). extractChangedFiles self-hosts its parse (D-13) and imports only filterSourcePaths from code-review.js, so nothing in this plan depends on a code-review export added later.
</done>
  </task>
</tasks>

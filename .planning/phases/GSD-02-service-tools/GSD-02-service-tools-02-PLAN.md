---
phase: 02-service-tools
plan: 02
type: execute
wave: 1
depends_on: []
files_modified: ["test/service-tools.test.mjs"]
autonomous: true
requirements: ["MOUNT-04"]
user_setup: []
must_haves:
  truths:
    - "gsd_new_milestone.execute against an initialised FakeFs project returns a string matching /New milestone/ and readRoadmap().phases grows by the appended phases, with STATE milestone updated"
    - "gsd_progress.execute against an initialised FakeFs project returns a string containing # GSD PROGRESS and a Phase 01 auth line, without throwing"
    - "gsd_quick.execute against a real temp cwd with the fake subagents service returns /gsd_quick done/ and writes <dir>/TASK.md on the real filesystem"
    - "gsd_ui_phase.execute with fake ui-researcher (>=50 chars) + ui-checker (VERIFICATION PASSED) returns /gsd_ui_phase complete/ and /VERIFICATION PASSED/, writes 01-auth-UI-SPEC.md, and sets STATE status to plan"
    - "gsd_verify.execute with seeded PLAN-01 + SUMMARY-01 and a fake verifier writing VERIFICATION status:passed returns /✓ Phase 1 verified/, writes 01-auth-VERIFICATION.md, and sets STATE status to ship"
    - "gsd_ship.execute with a passed VERIFICATION on a non-repo FakeFs cwd throws /gsd_ship preflight failed:/ (the reachable branch-gate guard, per D-03)"
  artifacts:
    - path: "test/service-tools.test.mjs"
      provides: "The MOUNT-04 proof: execute() smoke calls for the 5 untested gsd_* tools (gsd_new_milestone, gsd_progress, gsd_quick, gsd_ui_phase, gsd_verify) plus the gsd_ship fail-loud preflight guard. Reuses the registerTool/makeCtx/makeSubagents pattern from tools.test.mjs (D-04) with added canned handlers for ui-researcher, ui-checker, and quick labels."
      min_lines: 120
      exports: []
  key_links:
    - from: "lib/core-tools.js (gsd_new_milestone/gsd_progress apply), lib/quick.js (gsd_quick apply), lib/ui.js (gsd_ui_phase apply), lib/verify.js (gsd_verify apply), lib/ship.js (gsd_ship apply)"
      to: "test/service-tools.test.mjs (registerTool -> execute(args, exec) smoke calls)"
      via: "defineTool compiles at apply(); tests call t.execute(args, exec) directly with hand-built args against FakeFs/fake-ctx/fake-subagents — no schema layer (per D-01, schema-validity already shipped in phase 1)"
      pattern: "describe\\(.gsd_(new_milestone|progress|quick|ui_phase|verify|ship)"
---

<objective>Prove MOUNT-04 for the 5 gap tools: every gsd_* phase tool with no existing execute test gets an execute() smoke call (gsd_new_milestone, gsd_progress, gsd_quick, gsd_ui_phase, gsd_verify), and gsd_ship's fail-loud preflight guard is smoked (per D-01, D-03, D-04). Tools f-able on the fake host get a real success-path smoke returning an expected value; the infra-bound gsd_ship gets a reachable fail-loud guard assertion. No re-proving schema-validity (phase 1), no re-testing the 6 already-covered tools (D-01). All offline on FakeFs/fake-ctx, except gsd_quick which needs a real temp cwd because it writes TASK.md via node:fs/promises (OQ-1).</objective>

<context>@test/tools.test.mjs, @test/helpers/fake-fs.mjs, @test/helpers/project.mjs, @lib/core-tools.js, @lib/quick.js, @lib/ui.js, @lib/verify.js, @lib/ship.js, @lib/_runner.js, @lib/_shared.js</context>

<tasks>
  <task type="auto">
    <name>Task 1: Tracer — harness + pure-state smokes (gsd_new_milestone, gsd_progress)</name>
    <files>test/service-tools.test.mjs</files>
    <read_first>test/tools.test.mjs, test/helpers/fake-fs.mjs, test/helpers/project.mjs, lib/core-tools.js</read_first>
    <action>Create test/service-tools.test.mjs. Port the canonical harness from test/tools.test.mjs (lines 1-84) verbatim in shape (per D-04 — reuse the makeSubagents pattern): module-level `let fs; let svc; let ctx; const CWD = "/project"; const exec = { agent:{session:{header:{cwd:CWD}}}, signal:{aborted:false, addEventListener(){}, removeEventListener(){}} };`. Define a local `makeSubagents()` that returns an object with `getProvider: (n) => n === "spawn" ? { spawn:true } : undefined` and an `async start(_n, req)` switching on `req.label`. For THIS task only the two pure-state tools are exercised (no spawn), but build the factory with the spawn handlers now so Task 2/3 just add label branches: include the existing branches from tools.test.mjs (planner / plan-checker / execute / verify / "plan research" / map-codebase) AND add three new canned branches required by the gap tools (per RESEARCH fake-subagent coverage gap):
  - if `label.startsWith("ui-researcher")`: return text of >= 50 chars (e.g. a canned "# UI-SPEC\n\nLayout: a two-pane editor with a sidebar...<pad to >50 chars>") so gsd_ui_phase does not short-circuit at lib/ui.js:50.
  - if `label.startsWith("ui-checker")`: return text containing "VERIFICATION PASSED" so the passed branch at lib/ui.js:61-62 is taken.
  - if `label.startsWith("quick")`: return text "quick subagent finished the task" (the recorded entry uses r.output, lib/quick.js:53).
Each branch returns `{ result:{ output:[{type:"text", text}], stopReason:"completed" }, dispose:()=>{} }`. The `verify` branch must ALSO write 01-auth-VERIFICATION.md (port from tools.test.mjs:35-37 using VERIFICATION_PASSED from ./helpers/project.mjs) so gsd_verify finds status:passed.

Define `makeCtx()` mirroring tools.test.mjs:64-73 (fs, get for gsdState/subagents/tools, provide, effect, tools.register no-op). Define `registerTool(pluginFile, toolName)` identical to tools.test.mjs:75-84. Import `GsdState`, `FakeFs`/`stateCtx`, `buildProject`, and the canned artefact constants `FENCED_PLAN`, `FENCED_SUMMARY`, `VERIFICATION_PASSED` from ./helpers/project.mjs.

Then add two describe blocks with the pure-state smokes:
  - describe("gsd_new_milestone"): `beforeEach` builds a fresh FakeFs project (`fs = new FakeFs(); svc = await buildProject(fs, CWD); ctx = makeCtx();`). test("appends phases and updates STATE milestone"): `const { t } = await registerTool("core-tools","gsd_new_milestone"); const res = await t.execute({ milestoneName:"M2", version:"v2.0", phases:[{name:"ship", goal:"Ship it", requirements:["AUTH-02"]}], requirements:[{id:"AUTH-02", text:"logout"}] }, exec);` Assert `assert.match(res, /New milestone/);`, `const rm = await svc.readRoadmap(CWD); assert.equal(rm.phases.length, 2); assert.equal(rm.phases[1].n, 2); assert.equal(rm.milestoneName, "M2");` and the STATE milestone updated: `const st = await svc.readState(CWD); assert.equal(st.frontmatter.milestone, "v2.0");` (gsd_new_milestone calls updateStateFrontmatter at lib/core-tools.js:192-195). Both tools require isProject (lib/core-tools.js:129,179) which buildProject satisfies (R6).
  - describe("gsd_progress"): same beforeEach. test("renders progress without throwing"): `const { t } = await registerTool("core-tools","gsd_progress"); const res = await t.execute({}, exec); assert.match(res, /# GSD PROGRESS/); assert.match(res, /Phase 01 auth/);` and a second test `test("phase-scoped progress lists plan waves")`: seed one plan `await svc.writeArtifact(CWD, 1, "PLAN-01", FENCED_PLAN)`, call `await t.execute({ phase: 1 }, exec)`, assert `assert.match(res, /Phase 1 plans/)`.</action>
    <verify>node --test --test-name-pattern="gsd_(new_milestone|progress)" test/service-tools.test.mjs</verify>
    <acceptance_criteria>
      - "test/service-tools.test.mjs contains: describe(\"gsd_new_milestone\""
      - "test/service-tools.test.mjs contains: describe(\"gsd_progress\""
      - "test/service-tools.test.mjs contains: registerTool(\"core-tools\", \"gsd_new_milestone\")"
      - "test/service-tools.test.mjs contains: label.startsWith(\"ui-researcher\")"
      - "test/service-tools.test.mjs contains: label.startsWith(\"ui-checker\")"
      - "test/service-tools.test.mjs contains: label.startsWith(\"quick\")"
      - "node --test --test-name-pattern=\"gsd_(new_milestone|progress)\" test/service-tools.test.mjs exits 0"
    </acceptance_criteria>
    <done>The harness is in place (registerTool/makeCtx/makeSubagents with all canned label branches) and the two pure-state tool smokes are green: gsd_new_milestone appends a phase + updates STATE, gsd_progress renders without throwing.</done>
  </task>

  <task type="auto">
    <name>Task 2: Spawn-based success-path smokes (gsd_ui_phase, gsd_verify)</name>
    <files>test/service-tools.test.mjs</files>
    <read_first>test/service-tools.test.mjs, lib/ui.js, lib/verify.js, test/tools.test.mjs</read_first>
    <action>Add two describe blocks to test/service-tools.test.mjs (harness added in Task 1). NOTE on intra-file task ordering: Tasks 2 and 3 extend the shared harness (makeSubagents factory with its ui-researcher/ui-checker/quick/verify branches, makeCtx, registerTool) established in Task 1; they reference those module-level symbols and would fail if parallelized before Task 1 completes. Execute Task 1 -> Task 2 -> Task 3 in order within this plan. Both use the shared beforeEach (fresh FakeFs project) and the fake-subagents factory whose ui-researcher/ui-checker/verify branches were added in Task 1.

  - describe("gsd_ui_phase"): beforeEach builds project. test("writes UI-SPEC and advances STATE to plan"): `const { t } = await registerTool("ui", "gsd_ui_phase"); const res = await t.execute({ phase: 1, notes: "two-pane editor" }, exec);` Assert `assert.match(res, /gsd_ui_phase complete/);`, `assert.match(res, /VERIFICATION PASSED/);`, the artefact is written `assert.ok(fs.files.has(\`${CWD}/.planning/phases/01-auth/01-auth-UI-SPEC.md\`));` (writeArtifact suffix "UI-SPEC" -> <base>-UI-SPEC.md, lib/state.js:367), and STATE advanced `const st = await svc.readState(CWD); assert.equal(st.frontmatter.status, "plan");` (gsd_ui_phase calls setActivePhase(...,"plan") at lib/ui.js:62). The fake ui-researcher must return >=50 chars (R5) — verify the canned text length in the branch is >=50.

  - describe("gsd_verify"): beforeEach builds project. test("writes VERIFICATION status:passed and advances STATE to ship"): seed the prerequisites (R4) — `await svc.writeArtifact(CWD, 1, "PLAN-01", FENCED_PLAN); await svc.markPlanSummary(CWD, 1, 1, FENCED_SUMMARY);` (markPlanSummary writes SUMMARY-01). `const { t } = await registerTool("verify", "gsd_verify"); const res = await t.execute({ phase: 1 }, exec);` Assert `assert.match(res, /Phase 1 verified/);`, `assert.ok(fs.files.has(\`${CWD}/.planning/phases/01-auth/01-auth-VERIFICATION.md\`));`, and `const st = await svc.readState(CWD); assert.equal(st.frontmatter.status, "ship");` (gsd_verify routes passed->ship at lib/verify.js:85). The fake verify branch (Task 1) must write VERIFICATION_PASSED which has frontmatter `status: passed` (test/helpers/project.mjs:75-81), so parseFrontmatter yields status "passed" (lib/verify.js:80-82).</action>
    <verify>node --test --test-name-pattern="gsd_(ui_phase|verify)" test/service-tools.test.mjs</verify>
    <acceptance_criteria>
      - "test/service-tools.test.mjs contains: describe(\"gsd_ui_phase\""
      - "test/service-tools.test.mjs contains: describe(\"gsd_verify\""
      - "test/service-tools.test.mjs contains: 01-auth-UI-SPEC.md"
      - "test/service-tools.test.mjs contains: st.frontmatter.status, \"ship\""
      - "test/service-tools.test.mjs contains: markPlanSummary(CWD, 1, 1, FENCED_SUMMARY)"
      - "node --test --test-name-pattern=\"gsd_(ui_phase|verify)\" test/service-tools.test.mjs exits 0"
    </acceptance_criteria>
    <done>gsd_ui_phase and gsd_verify success-path smokes are green: UI-SPEC + VERIFICATION written, STATE advanced to plan/ship respectively, and the canned ui-researcher/ui-checker/verify labels feed the expected branches.</done>
  </task>

  <task type="auto">
    <name>Task 3: gsd_quick real-temp-cwd smoke + gsd_ship fail-loud guard</name>
    <files>test/service-tools.test.mjs</files>
    <read_first>lib/quick.js, lib/ship.js, test/service-tools.test.mjs, test/helpers/fake-fs.mjs, test/tools.test.mjs</read_first>
    <action>Add two describe blocks to test/service-tools.test.mjs. (Extends the harness established in Task 1; same intra-file ordering dependency as Task 2 — execute after Task 1.)

  - describe("gsd_quick") (per D-03 success-path, OQ-1 real temp cwd): gsd_quick writes TASK.md via real node:fs/promises (lib/quick.js:55-57), bypassing ctx.fs, so the happy path CANNOT run on pure FakeFs at cwd=/project. Smoke it against a REAL temp directory. Use `import os from "node:os"; import path from "node:path";` at the top of the file. In the test: `const tmp = await fsPromises.mkdtemp(path.join(os.tmpdir(), "gsd-quick-"));` (import `fsPromises from "node:fs/promises"`). Build a real-fs-backed project there: `import { realFsAdapter } from "./helpers/fake-fs.mjs"; const realFs = realFsAdapter(); const svc = new GsdState({ fs: realFs, get:()=>undefined, provide:()=>{}, effect:()=>()=>{} }, {}); await svc.initProject(tmp, { name:"T", purpose:"p", milestoneName:"M1", version:"v1.0", requirements:[{id:"AUTH-01",text:"x",complete:false}], phases:[{name:"auth",goal:"g",requirements:["AUTH-01"]}] });`. Build a ctx whose `get("gsdState")` returns this svc, `get("subagents")` returns a makeSubagents()-style fake with the `quick` branch (canned output), `fs` is realFs. Register: `const { t } = await registerTool("quick", "gsd_quick")` — but registerTool builds its own makeCtx with module-level `fs`; instead register directly: `import("../lib/quick.js")`, capture the tool via a local tools array as registerTool does, using a ctx wired to the real temp svc + fake subagents. Call `const res = await t.execute({ task: "fix the typo in README", slug: "fix-typo" }, execWithTmp)` where `execWithTmp = { agent:{session:{header:{cwd: tmp}}}, signal:{aborted:false, addEventListener(){}, removeEventListener(){}} }` (gsd_quick uses cwdOf(exec), lib/quick.js:34). Assert `assert.match(res, /gsd_quick done/);`, and the TASK.md exists on the REAL filesystem: `const dir = await fsPromises.readdir(path.join(tmp, ".planning", "quick"));` then find the entry dir `const quickDir = dir.find(d => d.endsWith("-fix-typo")); assert.ok(quickDir); const entry = await fsPromises.readFile(path.join(tmp, ".planning", "quick", quickDir, "TASK.md"), "utf8"); assert.match(entry, /# Quick task/); assert.match(entry, /fix the typo in README/);`. Wrap the whole test body in try/finally that `await fsPromises.rm(tmp, { recursive:true, force:true })` in finally to clean up. Assert the recorded dir name contains today's date via a regex (deterministic except for the date, lib/_shared.js:22): `assert.match(quickDir, /^\d{4}-\d{2}-\d{2}-fix-typo$/);`. This is fully offline (no LLM, no git/gh, no network) per D-04.

  - describe("gsd_ship") (per D-03 fail-loud guard, OQ-2 reachable branch gate): test("preflight fails loud on a non-repo cwd"): `fs = new FakeFs(); svc = await buildProject(fs, CWD); ctx = makeCtx();` Seed a PASSED verification so gate 1 passes (lib/ship.js:56-59): `await svc.writeArtifact(CWD, 1, "VERIFICATION", VERIFICATION_PASSED);`. `const { t } = await registerTool("ship", "gsd_ship"); await assert.rejects(() => t.execute({ phase: 1 }, exec), /gsd_ship preflight failed:/);`. Because cwd "/project" does not exist on the real filesystem, `gitOk(cwd, ["rev-parse","--abbrev-ref","HEAD"])` returns "" (run throws, gitOk swallows, lib/ship.js:25-27), so gate 3 fires `fail("could not determine current branch")` (lib/ship.js:68), producing the throw `/gsd_ship preflight failed:/` (lib/ship.js:53). This proves the fail-loud guard pattern D-03 requires without stubbing gh or using a real repo (D-04). Do NOT assert the literal "gh CLI not available or not authenticated" string — it is unreachable in this env (R2: gh is installed + authed here; on a non-repo cwd the earlier branch gate fires first). D-03's literal gh string is therefore asserted only in an environment where `gh` is genuinely absent/unauthed, which is out of this env's scope; the branch-gate guard ("could not determine current branch") stands in here as the equivalent fail-loud preflight proof of the same D-03 pattern (a clean named preflight error). Record this research-justified adaptation in the phase VERIFICATION so a future reader does not read the substitution as D-03 being fully satisfied — the guard *pattern* is proven, not the exact gh-string branch.</action>
    <verify>node --test --test-name-pattern="gsd_(quick|ship)" test/service-tools.test.mjs</verify>
    <acceptance_criteria>
      - "test/service-tools.test.mjs contains: describe(\"gsd_quick\""
      - "test/service-tools.test.mjs contains: describe(\"gsd_ship\""
      - "test/service-tools.test.mjs contains: fsPromises.mkdtemp"
      - "test/service-tools.test.mjs contains: realFsAdapter"
      - "test/service-tools.test.mjs contains: /gsd_ship preflight failed:/"
      - "test/service-tools.test.mjs contains: rm(tmp, { recursive: true, force: true })"
      - "node --test --test-name-pattern=\"gsd_(quick|ship)\" test/service-tools.test.mjs exits 0"
    </acceptance_criteria>
    <done>gsd_quick success-path smoke runs against a real temp cwd (TASK.md written and read back) and cleans up; gsd_ship preflight throws /gsd_ship preflight failed:/ on the non-repo FakeFs cwd. Both green.</done>
  </task>
</tasks>
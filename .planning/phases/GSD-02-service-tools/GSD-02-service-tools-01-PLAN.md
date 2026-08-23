---
phase: 02-service-tools
plan: 01
type: execute
wave: 1
depends_on: []
files_modified: ["test/state.test.mjs"]
autonomous: true
requirements: ["MOUNT-03"]
user_setup: []
must_haves:
  truths:
    - "Every raw-text per-phase artefact (CONTEXT, RESEARCH, VERIFICATION) round-trips verbatim through gsdState.writeArtifact -> readArtifact with no data loss"
    - "PROJECT.md read fidelity holds: a known string written to .planning/PROJECT.md is returned verbatim by gsdState.readProject"
    - "Every structured gsdState artefact (REQUIREMENTS, ROADMAP, STATE, config.json) round-trips write->read with no data loss modulo the documented parser asymmetries (ROADMAP slug injection; STATE last_updated/last_activity mutation; STATE numeric-string scalar coercion of active_phase)"
  artifacts:
    - path: "test/state.test.mjs"
      provides: "Extends the existing PLAN/SUMMARY round-trip tests with full-artefact-surface round-trip coverage (PROJECT, REQUIREMENTS, ROADMAP, STATE, config, CONTEXT, RESEARCH, VERIFICATION) — the MOUNT-03 proof."
      min_lines: 40
      exports: []
  key_links:
    - from: "lib/state.js (writeArtifact/readArtifact/writeRequirements/readRequirements/writeRoadmap/readRoadmap/writeState/readState/initProject/readConfig/readProject)"
      to: "test/state.test.mjs (new describe block asserting write->read equality)"
      via: "gsdState accessors invoked against an in-memory FakeFs (test/helpers/fake-fs.mjs)"
      pattern: "describe\\(.planning artefact round-trip"
---

<objective>Prove MOUNT-03: the gsdState service round-trips the full .planning/ artefact surface — PROJECT, REQUIREMENTS, ROADMAP, STATE, config.json, plus the per-phase CONTEXT/RESEARCH/VERIFICATION artefacts — write->read with no data loss. This extends the existing PLAN/SUMMARY round-trip tests in test/state.test.mjs to the remaining artefact types (per D-02), handling the known parse asymmetries (R3) so the assertions reflect what each accessor actually preserves.</objective>

<context>@test/state.test.mjs, @test/helpers/fake-fs.mjs, @test/helpers/project.mjs, @lib/state.js, @lib/_shared.js</context>

<tasks>
  <task type="auto">
    <name>Task 1: Tracer — raw-text artefact round-trip (PROJECT, CONTEXT, RESEARCH, VERIFICATION)</name>
    <files>test/state.test.mjs</files>
    <read_first>test/state.test.mjs, lib/state.js, test/helpers/fake-fs.mjs, test/helpers/project.mjs</read_first>
    <action>Add a new top-level describe block "planning artefact round-trip" to test/state.test.mjs (per D-02, extending the existing PLAN/SUMMARY coverage). Reuse the existing helpers at the top of the file: `GsdState` import, `FakeFs`/`stateCtx` from ./helpers/fake-fs.mjs, `buildProject`/`awaitBuild`, and the `CWD = "/project"` constant. Add these tests inside the new describe:

(1) "readProject returns PROJECT.md verbatim": create `new FakeFs()`, `const svc = await awaitBuild(fs)`. `buildProject` writes PROJECT.md via initProject. Build a distinct known string `const PROJ = "# @my-proj\n\nA purpose paragraph with detail.\n"` and write it directly to the FakeFs at `${CWD}/.planning/PROJECT.md` via `await fs.writeText({ targetKey: \`${CWD}/.planning/PROJECT.md\` }, PROJ)`. Assert `assert.equal(await svc.readProject(CWD), PROJ)`. There is no public writeProject (lib/state.js:99-101), so write fidelity is read-only — assert verbatim equality.

(2) "writeArtifact/readArtifact round-trip CONTEXT, RESEARCH, VERIFICATION verbatim": `const svc = await awaitBuild(new FakeFs())`. For each of the suffixes "CONTEXT", "RESEARCH", "VERIFICATION", use a distinct multiline body string (>= 3 lines, include a frontmatter `---` fence + a `# Heading` + body so it mirrors real artefact shape), call `await svc.writeArtifact(CWD, 1, suffix, body)`, then `assert.equal(await svc.readArtifact(CWD, 1, suffix), body)`. Also assert `await svc.hasArtifact(CWD, 1, suffix)` is true. Use three separate `test()` calls (one per suffix) or one iterating loop with distinct bodies — each body must be different so a suffix-mapping bug would surface. This proves the raw-text write->read path (per D-02) touches every raw per-phase artefact layer end-to-end.</action>
    <verify>node --test --test-name-pattern="planning artefact round-trip" test/state.test.mjs</verify>
    <acceptance_criteria>
      - "test/state.test.mjs contains the string: describe(\"planning artefact round-trip\""
      - "test/state.test.mjs contains: svc.readProject(CWD)"
      - "test/state.test.mjs contains three references to writeArtifact(CWD, 1, \"CONTEXT\" and \"RESEARCH\" and \"VERIFICATION\" (grep: writeArtifact(CWD, 1, \"VERIFICATION\")"
      - "node --test --test-name-pattern=\"planning artefact round-trip\" test/state.test.mjs exits 0"
    </acceptance_criteria>
    <done>The new describe block has green tests proving PROJECT read fidelity and verbatim write->read for CONTEXT, RESEARCH, VERIFICATION.</done>
  </task>

  <task type="auto">
    <name>Task 2: Structured artefact round-trip (REQUIREMENTS, ROADMAP, STATE, config.json)</name>
    <files>test/state.test.mjs</files>
    <read_first>test/state.test.mjs, lib/state.js, lib/_shared.js</read_first>
    <action>Extend the "planning artefact round-trip" describe block (added in Task 1) with four structured round-trip tests. Each must account for the documented parser asymmetries (R3) — use projected-subset deepEqual, not a naive full deepEqual, per D-02.

(1) "writeRequirements/readRequirements round-trips with no loss": `const svc = await awaitBuild(new FakeFs())`. Build `const reqs = [{id:"AUTH-01", text:"User can log in", complete:true}, {id:"AUTH-02", text:"User can log out", complete:false}, {id:"TODO-01", text:"Add a task", complete:false}]` (note: buildProject already writes REQUIREMENTS, but this test overwrites with a distinct set to prove the write->read path). `await svc.writeRequirements(CWD, reqs)`, then `assert.deepEqual(await svc.readRequirements(CWD), reqs)` — this accessor pair is clean (parseRequirements/stringifyRequirements preserve id/text/complete, lib/_shared.js:239-262).

(2) "writeRoadmap/readRoadmap round-trips modulo slug injection": `const svc = await awaitBuild(new FakeFs())`. `const roadmap = await svc.readRoadmap(CWD)` (from buildProject). Mutate it to a distinct, deterministic shape: set `roadmap.milestoneName = "M2"`, `roadmap.version = "v2.0"`, and `roadmap.phases = [{n:1, name:"auth", goal:"Add login", requirements:["AUTH-01"], status:"pending"}, {n:2, name:"ship", goal:"Ship it", requirements:[], status:"Complete"}]`. `await svc.writeRoadmap(CWD, roadmap)`, then `const back = await svc.readRoadmap(CWD)`. Assert the projected subset that parseRoadmap actually preserves: `assert.equal(back.milestoneName, "M2")`, `assert.equal(back.version, "v2.0")`, and `assert.deepEqual(back.phases.map(p => ({n:p.n, name:p.name, goal:p.goal, requirements:p.requirements, status:p.status})), [{n:1,name:"auth",goal:"Add login",requirements:["AUTH-01"],status:"pending"},{n:2,name:"ship",goal:"Ship it",requirements:[],status:"Complete"}])`. Do NOT assert on `back.slug`, `back.milestone`, or per-phase `slug` (parseRoadmap injects slug at lib/_shared.js:200 and sets milestone=null at lib/_shared.js:180 — R3). The projected subset IS the no-data-loss contract.

(3) "writeState/readState round-trips modulo last_updated/last_activity and numeric-scalar coercion": `const svc = await awaitBuild(new FakeFs())`. `const doc = await svc.readState(CWD)`. Set a distinct state: `doc.frontmatter.status = "plan"`, `doc.frontmatter.active_phase = "1"`, `doc.frontmatter.milestone = "v1.0"`, `doc.body.position = "Phase 1: discuss"`, `doc.body.decisions = ["D-01: use cookies", "D-02: use jwt"]`, `doc.body.blockers = ["need design"]`, `doc.body.continuity = { lastSession: "2026-08-22", stoppedAt: "discuss", resumeFile: "src/a.js" }`. `await svc.writeState(CWD, doc)`, then `const back = await svc.readState(CWD)`. There are THREE documented STATE asymmetries (R3) the projection must exclude: (a) writeState mutates `last_updated`/`last_activity` (lib/state.js:252-253); (b) numeric-string scalar coercion — `active_phase` is set to the string `"1"`, stringifyFrontmatter writes it as a bare unquoted token `active_phase: 1` (lib/_shared.js:165-166, the string branch: `"1"` has no whitespace/colon/hash so it is emitted unquoted), and coerceScalar parses `/^-?\d+$/` back to the Number `1` (lib/_shared.js:35). So `doc.frontmatter.active_phase === "1"` (string) but `back.frontmatter.active_phase === 1` (number); a type-strict deepEqual fails. Project it out of the deepEqual and assert it separately. Build `const inFm = { ...doc.frontmatter }; delete inFm.last_updated; delete inFm.last_activity; delete inFm.active_phase;` and `const outFm = { ...back.frontmatter }; delete outFm.last_updated; delete outFm.last_activity; delete outFm.active_phase;`, then `assert.deepEqual(outFm, inFm)`. Then assert the coerced scalar's value is preserved modulo type: `assert.equal(String(back.frontmatter.active_phase), doc.frontmatter.active_phase)` (both sides stringify to "1"). Then `assert.deepEqual(back.body, { position: "Phase 1: discuss", decisions: ["D-01: use cookies","D-02: use jwt"], blockers: ["need design"], continuity: { lastSession: "2026-08-22", stoppedAt: "discuss", resumeFile: "src/a.js" } })`. _stringifyState only emits position/decisions/blockers/continuity (lib/state.js:196-217) so this is the faithful body contract.

(4) "initProject->readConfig round-trips the config": `const fs = new FakeFs(); const svc = new GsdState(stateCtx(fs), {})`. Call `await svc.initProject(CWD, { name:"T", purpose:"p", milestoneName:"M1", version:"v1.0", requirements:[], phases:[{name:"auth",goal:"g",requirements:[]}], tdd:true, mvp:true, projectCode:"GSDB", discussMode:"text" })`. `const cfg = await svc.readConfig(CWD)`. Assert the specific observable fields proving the opts flowed through write->read unchanged: `assert.equal(cfg.gsd_state_version, "1.0")`, `assert.equal(cfg.workflow.tdd_mode, true)`, `assert.equal(cfg.workflow.mvp_mode, true)`, `assert.equal(cfg.project_code, "GSDB")`, `assert.equal(cfg.workflow.discuss_mode, "text")`, `assert.equal(cfg.context_window, 200000)`, `assert.equal(cfg.workflow.use_worktrees, false)`, `assert.equal(cfg.workflow.commit_docs, true)`. There is no public writeConfig (lib/state.js:335-339); initProject is the only writer and readConfig is the reader, so these field equalities prove the config round-trip. Use the literal "1.0" (STATE_VERSION, lib/state.js:24, not exported).</action>
    <verify>node --test --test-name-pattern="planning artefact round-trip" test/state.test.mjs</verify>
    <acceptance_criteria>
      - "test/state.test.mjs contains: writeRequirements(CWD, reqs)"
      - "test/state.test.mjs contains: back.phases.map(p => ({n:p.n, name:p.name, goal:p.goal, requirements:p.requirements, status:p.status}))"
      - "test/state.test.mjs contains: delete inFm.last_updated"
      - "test/state.test.mjs contains: delete inFm.active_phase"
      - "test/state.test.mjs contains: String(back.frontmatter.active_phase), doc.frontmatter.active_phase"
      - "test/state.test.mjs contains: cfg.gsd_state_version, \"1.0\""
      - "node --test --test-name-pattern=\"planning artefact round-trip\" test/state.test.mjs exits 0 with all new tests in the describe passing (exact count depends on whether Task 1 uses separate test() calls per suffix or one iterating loop)"
    </acceptance_criteria>
    <done>The structured round-trip tests are green, proving REQUIREMENTS (full deepEqual), ROADMAP (projected subset modulo slug/milestone), STATE (projected subset modulo last_updated/last_activity plus active_phase numeric-coercion handled separately via String() equality), and config.json (field equality) all round-trip with no data loss.</done>
  </task>
</tasks>
---
phase: 46-mempalace
plan: 01
type: tdd
wave: 1
depends_on: []
files_modified:
  - lib/mempalace.js
  - lib/_capabilities.js
  - lib/state.js
  - test/mempalace.test.mjs
autonomous: true
requirements: ["GAP-12"]
user_setup: []
must_haves:
  truths:
    - "gsd_mempalace_recall({ phase }) produces MEMORY-RECALL.md in the phase directory from a fake mempalaceFn (wake-up + search), with Prior decisions / Patterns / Surprises sections each carrying provenance (drawer id / source) (D-05)"
    - "When mempalace.enabled is not explicitly true in config.json, both gsd_mempalace_recall and gsd_mempalace_capture print an activation hint and write NOTHING (D-03)"
    - "When the MemPalace CLI is unreachable, recall writes an 'unavailable' stub naming the native fallback and resolves (never throws) (D-08)"
    - "gsdMempalace capability is registered with order 55, role step, tools [gsd_mempalace_recall, gsd_mempalace_capture], commands [gsd-mempalace-recall, gsd-mempalace-capture], produces [MEMORY-RECALL.md] (D-01)"
    - "mempalace does not advance STATE — advisory soft gate (D-08)"
  artifacts:
    - path: "lib/mempalace.js"
      provides: "the gsd_mempalace plugin: pure exported helpers (resolveWing, resolveMode, resolveRecallTopic, buildRecallDoc, buildStub) with NO ctx/fs/git params + an apply() that does all I/O, reads the config gate, runs recall via the injectable mempalaceFn seam, writes MEMORY-RECALL.md, and commits via the shared seam"
      min_lines: 200
      exports: ["apply", "resolveWing", "resolveMode", "resolveRecallTopic", "buildRecallDoc", "buildStub", "defaultMempalaceFn"]
    - path: "test/mempalace.test.mjs"
      provides: "TDD tests for pure helpers (no ctx/fs/git), capability registration + order 55, config gate (disabled hint + writes nothing / enabled proceeds), recall from a fake mempalaceFn (wake-up + search) with decisions/patterns/surprises + provenance, and the recall 'unavailable' stub when the CLI is unreachable"
      min_lines: 150
      exports: []
  key_links:
    - from: "lib/mempalace.js"
      to: "lib/state.js"
      via: "apply() writes MEMORY-RECALL.md via s.writeArtifact(cwd, phase.n, 'MEMORY-RECALL', content) and reads the config gate via s.readConfig(cwd)"
      pattern: "writeArtifact"
    - from: "lib/mempalace.js"
      to: "lib/_capabilities.js"
      via: "apply() publishes the gsdMempalace capability via ctx.provide('gsdMempalace', buildCapability('gsdMempalace'))"
      pattern: "gsdMempalace"
---
<objective>
Build the mempalace loop-step plugin core: the gsdMempalace capability (order 55), the gsd_mempalace_recall tool that performs deliberate recall (wake-up + search via an injectable mempalaceFn seam) and writes MEMORY-RECALL.md, the config gate (mempalace.enabled, default false), the pure recall helpers, and the mempalace config block in _defaultConfig. This is the tracer — the thinnest end-to-end slice touching every layer (capability registration, config gate, exec seam, artefact write). The gsd_mempalace_capture tool is registered with a stub body here; its full implementation lands in plan 03.
</objective>
<context>@lib/graphify.js, @lib/learnings.js, @lib/_capabilities.js, @lib/state.js, @lib/_shared.js, @lib/_git-artifacts.js, @lib/_runner.js, @test/graphify.test.mjs, @test/helpers/mount-harness.mjs</context>
<tasks>
  <task type="auto">
    <name>Task 1 (test): Write test/mempalace.test.mjs — pure helpers + integration (RED)</name>
    <files>test/mempalace.test.mjs</files>
    <read_first>test/graphify.test.mjs, test/learnings.test.mjs, lib/graphify.js, lib/learnings.js, lib/_shared.js, lib/_capabilities.js, lib/state.js, test/helpers/mount-harness.mjs</read_first>
    <action>
Create test/mempalace.test.mjs modeled on test/graphify.test.mjs (node:test + node:assert/strict, FakeFs + mount-harness, offline only). Import the pure helpers from ../lib/mempalace.js (resolveWing, resolveMode, resolveRecallTopic, buildRecallDoc, buildStub) and the apply function. Also import buildCapability from ../lib/_capabilities.js, parseFrontmatter from ../lib/_shared.js, and makeMountCtx/makeExec/CWD/FakeFs from ./helpers/mount-harness.mjs.

Write these test groups (per D-11):

(a) gsdMempalace capability registration + order 55 (D-11a, D-01): mount state + core-tools + mempalace; assert ctx.provided.has('gsdMempalace'); buildCapability('gsdMempalace').order === 55; buildCapability('gsdMempalace').step === 'mempalace'; buildCapability('gsdMempalace').tools deepEqual ['gsd_mempalace_recall','gsd_mempalace_capture']; buildCapability('gsdMempalace').commands deepEqual ['gsd-mempalace-recall','gsd-mempalace-capture']; buildCapability('gsdMempalace').produces deepEqual ['MEMORY-RECALL.md'].

(b) Config gate (D-11b, D-03): mount + bootstrap a project via gsd_init (which writes config.json with no mempalace key). Run gsd_mempalace_recall({ phase: 1 }) → assert the return matches /enable|mempalace\.enabled/i (activation hint) and assert NO MEMORY-RECALL.md exists (s.hasArtifact(CWD, 1, 'MEMORY-RECALL') is false). Then write config.json with mempalace.enabled true via fs.writeText({ targetKey: `${CWD}/.planning/config.json` }, JSON.stringify({ mempalace: { enabled: true } })) and re-run recall → assert it proceeds (return matches /MEMORY-RECALL|recall/i and s.hasArtifact(CWD, 1, 'MEMORY-RECALL') is true).

(c) Recall from a fake mempalaceFn (D-11c, D-05): mount + bootstrap + enable mempalace. Inject a fake mempalaceFn via ctx.mempalaceFn = async (cwd, args) => { record args; if (args[0] === 'wake-up') return 'wake-up context'; if (args[0] === 'search') return 'drawer: d1\nprior decision: use X'; return ''; }. Run gsd_mempalace_recall({ phase: 1 }) → assert the return matches /MEMORY-RECALL/ and the on-disk MEMORY-RECALL.md (s.readArtifact(CWD, 1, 'MEMORY-RECALL')) contains the Prior decisions / Patterns / Surprises sections and provenance (drawer id / source). Assert the fake mempalaceFn was called with wake-up and search args including --wing.

(d) Recall stub when the CLI is unreachable (D-11d, D-08): mount + bootstrap + enable mempalace. Inject a fake mempalaceFn that throws (async (cwd, args) => { throw new Error('mempalace: command not found'); }). Run gsd_mempalace_recall({ phase: 1 }) → assert it RESOLVES (not rejects) and the return matches /unavailable|stub|native/i. Assert the on-disk MEMORY-RECALL.md matches /unavailable|native/i (the stub names the native fallback).

(e) Pure helpers (D-11): import resolveWing, resolveMode, resolveRecallTopic, buildRecallDoc, buildStub directly; call each with plain object/string args (no ctx, no fs, no git) and assert they return correctly. resolveWing({ mempalace: { wing: 'w1' } }, 'GSD', 'repo') === 'w1'; resolveWing({}, 'GSD', 'repo') === 'GSD'; resolveWing({}, null, 'repo') === 'repo'; resolveMode({ mempalace: { memory_mode: 'replace' } }) === 'replace'; resolveMode({}) === 'augment'; resolveRecallTopic({ contextText: '## Decisions\n- **D-01:** use X', phaseGoal: 'goal' }) returns a non-empty string containing 'X' or 'use X'; resolveRecallTopic({ contextText: '', phaseGoal: 'goal' }) === 'goal' (fallback when CONTEXT absent, OQ-2); buildRecallDoc({ wing, mode, topic, results, nativeFallback }) returns a string containing 'Prior decisions', 'Patterns', 'Surprises', and provenance; buildStub({ wing, mode, cause }) returns a string containing 'unavailable' and 'native'.

Use a mountMempalace helper modeled on graphify.test.mjs's mountGraphify: FakeFs + makeMountCtx({}) + applyState + applyCoreTools + applyMempalace. Use a fake gitFn (makeFakeGit) so commitArtifacts never hits real git. Seed artifacts via s.writeArtifact. For the config-gate enabled case, write config.json directly via fs.writeText.
    </action>
    <verify>test -f test/mempalace.test.mjs && grep -q "resolveWing" test/mempalace.test.mjs && grep -q "buildRecallDoc" test/mempalace.test.mjs && grep -q "gsdMempalace" test/mempalace.test.mjs && grep -q "mempalace.enabled" test/mempalace.test.mjs</verify>
    <acceptance_criteria>
      - test/mempalace.test.mjs exists and imports from ../lib/mempalace.js
      - grep -q "gsdMempalace" test/mempalace.test.mjs (capability registration test)
      - grep -q "mempalace.enabled" test/mempalace.test.mjs (config gate test)
      - grep -q "wake-up" test/mempalace.test.mjs (recall fake mempalaceFn test)
      - grep -q "unavailable" test/mempalace.test.mjs (recall stub test)
      - grep -q "resolveRecallTopic" test/mempalace.test.mjs (pure helper test)
    </acceptance_criteria>
    <done>test/mempalace.test.mjs is written with all five test groups (a-e) covering D-11a through D-11e, importing the pure helpers and apply from ../lib/mempalace.js. Tests are expected to FAIL at this point (RED) because lib/mempalace.js does not exist yet.</done>
  </task>

  <task type="auto">
    <name>Task 2 (feat): Implement lib/mempalace.js + _capabilities.js descriptor + state.js config block (GREEN)</name>
    <files>lib/mempalace.js, lib/_capabilities.js, lib/state.js</files>
    <read_first>lib/graphify.js, lib/learnings.js, lib/_shared.js, lib/_git-artifacts.js, lib/_capabilities.js, lib/state.js, test/mempalace.test.mjs</read_first>
    <action>
Implement three files to make test/mempalace.test.mjs pass. Mirror lib/graphify.js's structure (no-subagent deterministic plugin, D-03) and lib/learnings.js's pure-helper/apply split (D-04).

1. lib/_capabilities.js — add "gsdMempalace" to CAPABILITY_KEYS (as the 21st entry, after "gsdGraphify"). Add a TABLE descriptor after gsdGraphify: { step: "mempalace", role: "step", tools: ["gsd_mempalace_recall","gsd_mempalace_capture"], commands: ["gsd-mempalace-recall","gsd-mempalace-capture"], order: 55, prereq: [], next: [], produces: ["MEMORY-RECALL.md"], consumes: ["CONTEXT.md", "PLAN.md", "SUMMARY.md"] }. Per D-01. Also update the stale "The 20 known capability keys" comment above CAPABILITY_KEYS to read "The 21 known capability keys" and append a line noting mempalace (order 55) slots after graphify (54) per phase 46 D-01.

2. lib/state.js — add the mempalace block to _defaultConfig (after the workflow block, lines 183-207): { enabled: false, memory_mode: "augment", wing: "", recall_on_discuss: true, recall_on_plan: true, capture_artifacts: true, mirror_kg: true }. Per D-10 and OQ-6.

3. lib/mempalace.js — the full plugin, mirroring graphify.js (no subagent) + learnings.js (pure-helper/apply split):

IMPORTS: defineTool from @deepseek-ai/dsh-tools; execFile from node:child_process; promisify from node:util; nowIso, today, parseFrontmatter, stringifyFrontmatter, parseDecisionEntries from ./_shared.js; cwdOf from ./_runner.js; commitArtifacts from ./_git-artifacts.js; buildCapability from ./_capabilities.js.

CONST: name = "gsd-mempalace", inject = ["gsdState", "tools"] (NO 'subagents' — D-04, mirroring graphify.js:29).

MEMORY-RECALL.md frontmatter: { phase, wing, mode, generated, topic }.

PURE HELPERS (exported, NO ctx/fs/git params — per D-04/D-12):

- resolveWing(cfg, projectCode, repoDirName): return cfg?.mempalace?.wing || projectCode || repoDirName || "default". (D-05: wing resolution order config.mempalace.wing → project_code → repo directory name.)

- resolveMode(cfg): return cfg?.mempalace?.memory_mode || "augment". (D-05/D-09: default augment.)

- resolveRecallTopic({ contextText, phaseGoal }): derive a short search query from the CONTEXT title/goal/decisions. If contextText is non-empty, extract the phase title (first `# Phase N: <name>` line) and the decision texts (via parseDecisionEntries) and join the first few into a short query string (e.g. the phase name + first decision text, truncated to ~120 chars). If contextText is empty/absent, return phaseGoal (OQ-2 fallback for discuss:pre). Pure.

- buildRecallDoc({ wing, mode, topic, results, nativeFallback }): distil the mempalace search results into a MEMORY-RECALL.md body with three sections — "## Prior decisions", "## Patterns", "## Surprises" — each item carrying provenance (drawer id / source). results is the raw mempalace search output (a string); parse it into items (e.g. split on newlines, treat lines containing 'decision'/'pattern'/'surprise' as the respective category, attach the drawer id from the wake-up/search output). nativeFallback is a string naming the native memory (e.g. ".planning/graphs/, LEARNINGS.md, STATE") to note that native memory stays authoritative under augment. Returns the full markdown body (frontmatter + sections). Pure.

- buildStub({ wing, mode, cause }): return the 'unavailable' stub markdown body naming the native fallback and the real cause, so the planner knows memory is not gone. Contains the literal 'unavailable' and 'native'. Pure.

APPLY(ctx): mirrors graphify.js apply():
- gsd = () => ctx.get("gsdState"); ctx.provide("gsdMempalace", buildCapability("gsdMempalace")).
- Register the gsd_mempalace_recall tool via defineTool: name "gsd_mempalace_recall", description (per D-02: deliberate recall before discuss/plan, produces MEMORY-RECALL.md), parameters { phase: { type: "number", required: true } }, output { schema: { type: "string" }, render: (_a, v) => [{ type: "text", text: v }] }.
- execute(args, exec):
  - cwd = cwdOf(exec); s = gsd(); fail-fast guards (D-08): !s → throw "gsd_mempalace_recall: gsdState service unavailable"; !(await s.isProject(cwd)) → throw "gsd_mempalace_recall: no .planning/ project — run gsd_init first"; roadmap = await s.readRoadmap(cwd); if (!roadmap) throw "gsd_mempalace_recall: unreadable ROADMAP.md"; phase = roadmap.phases.find(p => p.n === args.phase); if (!phase) throw `gsd_mempalace_recall: phase ${args.phase} not in ROADMAP`.
  - Config gate (D-03): cfg = await s.readConfig(cwd); if (cfg?.mempalace?.enabled !== true) return the activation hint string (how to enable: set mempalace.enabled: true in .planning/config.json) and STOP — write nothing. This is the FIRST action after the guards.
  - Recall (D-05): wing = resolveWing(cfg, cfg?.project_code, <repo dir name from cwd basename>); mode = resolveMode(cfg); contextText = await s.readArtifact(cwd, phase.n, "CONTEXT").catch(() => ""); topic = resolveRecallTopic({ contextText, phaseGoal: phase.goal }); mempalaceFn = ctx.mempalaceFn || defaultMempalaceFn. Wrap the CLI calls in try/catch (D-08): try { await mempalaceFn(cwd, ["wake-up", "--wing", wing]); results = await mempalaceFn(cwd, ["search", topic, "--wing", wing]); } catch (e) { write the stub via s.writeArtifact(cwd, phase.n, "MEMORY-RECALL", buildStub({ wing, mode, cause: e.message })); return the stub + real cause (never throw). } nativeFallback = ".planning/graphs/, LEARNINGS.md, STATE"; doc = buildRecallDoc({ wing, mode, topic, results, nativeFallback }); path = await s.writeArtifact(cwd, phase.n, "MEMORY-RECALL", doc).
  - Audit trail (D-08): await s.addDecision(cwd, `Mempalace: recall for phase ${phase.n} (wing ${wing}, mode ${mode})`). Do NOT call setActivePhase.
  - Commit (D-04): const commit = await commitArtifacts(cwd, phase.n, { scope: "mempalace", phaseName: phase.name }). No raw git.
  - Return a summary string naming the MEMORY-RECALL.md path, wing, mode, and the commit note.
- presentCall: (a) => ({ card: "generic", title: "Mempalace recall phase " + a.phase, kind: "other", rawInput: { phase: a.phase } }).

Also register the gsd_mempalace_capture tool (D-02) with a STUB body in this plan (the full capture implementation lands in plan 03): name "gsd_mempalace_capture", parameters { phase: { type: "number", required: true }, artifact: { type: "string", enum: ["CONTEXT","PLAN","SUMMARY"], required: true } }, output { schema: { type: "string" }, render: (_a, v) => [{ type: "text", text: v }] }. execute: same fail-fast guards + config gate (D-03); when enabled, return a placeholder "capture not yet implemented" (plan 03 fills it in). presentCall similar.

Export { name, inject, apply, resolveWing, resolveMode, resolveRecallTopic, buildRecallDoc, buildStub, defaultMempalaceFn }.
    </action>
    <verify>node --test test/mempalace.test.mjs 2>&1 | tail -20</verify>
    <acceptance_criteria>
      - grep -q "gsdMempalace" lib/_capabilities.js (capability descriptor added)
      - grep -q "mempalace" lib/state.js (config block added)
      - grep -q "gsd_mempalace_recall" lib/mempalace.js (recall tool registered)
      - grep -q "resolveRecallTopic" lib/mempalace.js (pure helper exported)
      - grep -q "buildStub" lib/mempalace.js (stub helper exported)
      - grep -q "defaultMempalaceFn" lib/mempalace.js (exec seam exported)
      - grep -q "commitArtifacts" lib/mempalace.js (shared commit seam used, no raw git)
      - node --test test/mempalace.test.mjs exits 0 (all mempalace tests pass — GREEN)
      - grep -c "git(" lib/mempalace.js returns 0 (no raw git calls, per D-04)
    </acceptance_criteria>
    <done>lib/mempalace.js implements the plugin skeleton + config gate + recall + mempalaceFn seam + pure helpers, lib/_capabilities.js has the gsdMempalace descriptor (order 55), lib/state.js has the mempalace config block. test/mempalace.test.mjs passes (GREEN). No raw git in mempalace.js (D-04). mempalace does not advance STATE (D-08). NOTE: adding the 21st CAPABILITY_KEY in this plan intentionally leaves the cross-cutting count/key assertions in test/_capabilities.test.mjs, test/mount.test.mjs, test/render.test.mjs, and test/removal.test.mjs RED until plan 04 (wave 2) repairs them — this is expected mid-phase, do NOT chase the red suite after wave 1; the full suite goes green once plan 04 lands.</done>
  </task>
</tasks>

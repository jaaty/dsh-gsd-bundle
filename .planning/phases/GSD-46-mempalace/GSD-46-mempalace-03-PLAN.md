---
phase: 46-mempalace
plan: 03
type: tdd
wave: 2
depends_on: ["GSD-46-mempalace-01"]
files_modified:
  - lib/mempalace.js
  - lib/state.js
  - test/mempalace.test.mjs
autonomous: true
requirements: ["GAP-12"]
user_setup: []
must_haves:
  truths:
    - "gsd_mempalace_capture({ phase, artifact }) stages the artifact VERBATIM under .planning/.mempalace-stage/<room>/<phase-id>/ with a mempalace.yaml room taxonomy and runs `mempalace mine` via the mempalaceFn seam (D-06)"
    - "capture maps artifact → room: CONTEXT.md→decisions, PLAN.md→planning, SUMMARY.md→milestones (D-06)"
    - "capture is idempotent via mine's content-hash (D-06)"
    - "mirror_kg === false skips the KG-mirror step; mirror_kg === true reports CLI-unavailable and never throws (D-06, OQ-1)"
    - "capture never writes lossy summaries — verbatim artifact text only (D-06)"
  artifacts:
    - path: "lib/mempalace.js"
      provides: "the capture path: pure helpers mapArtifactToRoom + buildStageTree + the gsd_mempalace_capture tool execute that stages verbatim, writes mempalace.yaml, runs mine, and gates mirror_kg"
      min_lines: 60
      exports: ["mapArtifactToRoom", "buildStageTree"]
    - path: "lib/state.js"
      provides: "the project-scoped .planning/.mempalace-stage/ accessors (mempalaceStageDir + write/read/has) routing through this._write/_read → ctx.fs"
      min_lines: 20
      exports: []
  key_links:
    - from: "lib/mempalace.js"
      to: "lib/state.js"
      via: "capture stages under .planning/.mempalace-stage/ via the new project-scoped accessor s.mempalaceStageDir(cwd)"
      pattern: "mempalaceStageDir"
---
<objective>
Implement the verbatim capture path (D-06): gsd_mempalace_capture stages the named artifact VERBATIM under .planning/.mempalace-stage/<room>/<phase-id>/ with a mempalace.yaml room taxonomy, runs `mempalace mine` via the mempalaceFn seam, and gates mirror_kg (CLI-unavailable no-op per OQ-1). Adds the pure helpers mapArtifactToRoom + buildStageTree and the project-scoped stage-dir accessors in state.js. Never writes lossy summaries and never throws on palace faults (D-08).
</objective>
<context>@lib/mempalace.js, @lib/state.js, @lib/_git-artifacts.js, @test/mempalace.test.mjs, @test/graphify.test.mjs</context>
<tasks>
  <task type="auto">
    <name>Task 1 (test): Add capture tests to test/mempalace.test.mjs (RED)</name>
    <files>test/mempalace.test.mjs</files>
    <read_first>test/mempalace.test.mjs, lib/mempalace.js, lib/state.js</read_first>
    <action>
Append capture test groups to test/mempalace.test.mjs (per D-11e/f/g). Import mapArtifactToRoom and buildStageTree from ../lib/mempalace.js.

(f) Capture staging + mine with room mapping + verbatim content (D-11e, D-06): mount + bootstrap + enable mempalace. Seed a CONTEXT artifact via s.writeArtifact(CWD, 1, "CONTEXT", "---\nphase: 1\n---\n## Decisions\n- **D-01:** first decision\n"). Inject a fake mempalaceFn via ctx.mempalaceFn = async (cwd, args) => { record args; if (args[0] === 'mine') return 'mined'; return ''; }. Run gsd_mempalace_capture({ phase: 1, artifact: "CONTEXT" }) → assert the return matches /capture|mined|stage/i. Assert the staged file exists under .planning/.mempalace-stage/decisions/ (the room for CONTEXT) with VERBATIM content (fs.readText on the staged path matches the exact CONTEXT text). Assert the fake mempalaceFn was called with mine + the stage dir + --wing. Assert a mempalace.yaml exists in the stage dir with a rooms list containing decisions/planning/milestones.

(g) Capture idempotency (D-11f, D-06): re-run gsd_mempalace_capture({ phase: 1, artifact: "CONTEXT" }) → assert the fake mempalaceFn mine call count does not grow (or the staged file is not duplicated) — idempotent via mine's content-hash / stable path.

(h) mirror_kg gating (D-11g, D-06/OQ-1): with config mempalace.mirror_kg false, run capture → assert no KG step is attempted (the fake mempalaceFn is never called with a kg arg). With mirror_kg true (default), run capture → assert the return reports KG mirroring requires MCP / CLI-unavailable and never throws (the tool resolves).

(i) Pure helpers (D-11): mapArtifactToRoom('CONTEXT') === 'decisions'; mapArtifactToRoom('PLAN') === 'planning'; mapArtifactToRoom('SUMMARY') === 'milestones'; buildStageTree({ room: 'decisions', phaseId: 'GSD-46-mempalace', artifactName: 'CONTEXT.md', content }) returns { path, content } where path includes '.mempalace-stage/decisions/GSD-46-mempalace/' and content is verbatim.
    </action>
    <verify>grep -q "mapArtifactToRoom" test/mempalace.test.mjs && grep -q "buildStageTree" test/mempalace.test.mjs && grep -q "mirror_kg" test/mempalace.test.mjs</verify>
    <acceptance_criteria>
      - grep -q "mapArtifactToRoom" test/mempalace.test.mjs (room mapping test)
      - grep -q "buildStageTree" test/mempalace.test.mjs (stage tree test)
      - grep -q "mirror_kg" test/mempalace.test.mjs (mirror_kg gating test)
      - grep -q "mempalace-stage" test/mempalace.test.mjs (staging path test)
      - grep -q "verbatim" test/mempalace.test.mjs (verbatim content test)
    </acceptance_criteria>
    <done>test/mempalace.test.mjs has the capture test groups (f-i) covering D-11e/f/g. Tests are expected to FAIL at this point (RED) because the capture path is not yet implemented.</done>
  </task>

  <task type="auto">
    <name>Task 2 (feat): Implement capture in lib/mempalace.js + state.js stage accessors (GREEN)</name>
    <files>lib/mempalace.js, lib/state.js</files>
    <read_first>lib/mempalace.js, lib/state.js, lib/_git-artifacts.js, test/mempalace.test.mjs</read_first>
    <action>
Implement the capture path to make the capture tests pass.

1. lib/state.js — add project-scoped .planning/.mempalace-stage/ accessors modeled on writeGraphArtifact (lines 539-547), all routing through this._write/_read → ctx.fs (never raw node:fs/promises):
   - mempalaceStageDir(cwd) { return `${this._planning(cwd)}/.mempalace-stage`; }
   - writeMempalaceStage(cwd, relPath, content) { const file = `${this.mempalaceStageDir(cwd)}/${relPath}`; await this._write(file, content); return file; }
   - readMempalaceStage(cwd, relPath) { return this._read(`${this.mempalaceStageDir(cwd)}/${relPath}`); }
   - hasMempalaceStage(cwd, relPath) { const t = await this.ctx.fs.resolve(`${this.mempalaceStageDir(cwd)}/${relPath}`); return !!(await this.ctx.fs.stat(t)); }

2. lib/mempalace.js — add the capture path:
   - PURE HELPERS (exported, NO ctx/fs/git):
     - mapArtifactToRoom(artifact): return { CONTEXT: "decisions", PLAN: "planning", SUMMARY: "milestones" }[artifact] || "general". (D-06 room mapping.)
     - buildStageTree({ room, phaseId, artifactName, content }): return { path: `.mempalace-stage/${room}/${phaseId}/${artifactName}`, content }. (D-06 staging under <room>/<phase-id>/.)
   - The mempalace.yaml room taxonomy: a constant string with a `rooms:` list of dicts each with a `name` key: [{ name: decisions }, { name: planning }, { name: milestones }, { name: problems }, { name: general }] (per RESEARCH: each entry MUST be a dict with a name key, else detect_room crashes). Written to the stage dir root.
   - In the gsd_mempalace_capture tool execute (replacing the plan-01 placeholder): after the fail-fast guards + config gate (D-03), read the artifact text via s.readArtifact(cwd, phase.n, args.artifact) (the artifact arg is CONTEXT/PLAN/SUMMARY — map to the read suffix; for SUMMARY, read the first plan's SUMMARY-01). If the artifact is absent, return a clear message (never throw). room = mapArtifactToRoom(args.artifact); phaseId = <the phase dir base name, e.g. GSD-46-mempalace>; artifactName = `${args.artifact}.md`; stagePath = buildStageTree({ room, phaseId, artifactName, content }).path; write the VERBATIM content via s.writeMempalaceStage(cwd, stagePath, content) (D-06: verbatim only, never lossy). Write mempalace.yaml to the stage dir root via s.writeMempalaceStage(cwd, "mempalace.yaml", <the room taxonomy>). mempalaceFn = ctx.mempalaceFn || defaultMempalaceFn. Wrap the CLI call in try/catch (D-08): try { await mempalaceFn(cwd, ["mine", `${s.mempalaceStageDir(cwd)}`, "--wing", wing]); } catch (e) { return the real cause (never throw). } mirror_kg gating (D-06/OQ-1): if (cfg?.mempalace?.mirror_kg === false) skip the KG step; else (true/default) append a note that "KG mirroring requires MCP (mempalace_kg_add) — unavailable in this CLI-only bundle" and never throw. Audit trail (D-08): await s.addDecision(cwd, `Mempalace: captured ${args.artifact} for phase ${phase.n} into room ${room}`). Do NOT call setActivePhase. Commit (D-04): const commit = await commitArtifacts(cwd, phase.n, { scope: "mempalace", phaseName: phase.name }). Return a summary string naming the staged path, room, wing, and the commit note.

Export { mapArtifactToRoom, buildStageTree } (add to the existing exports).
    </action>
    <verify>node --test test/mempalace.test.mjs 2>&1 | tail -20</verify>
    <acceptance_criteria>
      - grep -q "mapArtifactToRoom" lib/mempalace.js (room mapping helper)
      - grep -q "buildStageTree" lib/mempalace.js (stage tree helper)
      - grep -q "mempalaceStageDir" lib/state.js (stage accessor)
      - grep -q "writeMempalaceStage" lib/state.js (stage write accessor)
      - grep -q "mempalace.yaml" lib/mempalace.js (room taxonomy)
      - grep -q "mirror_kg" lib/mempalace.js (mirror_kg gating)
      - grep -q "mine" lib/mempalace.js (mine CLI call)
      - node --test test/mempalace.test.mjs exits 0 (all mempalace tests pass — GREEN)
    </acceptance_criteria>
    <done>lib/mempalace.js implements the capture path (mapArtifactToRoom, buildStageTree, verbatim staging, mempalace.yaml, mine via mempalaceFn, mirror_kg gating), lib/state.js has the project-scoped .mempalace-stage/ accessors. test/mempalace.test.mjs passes (GREEN). Capture never writes lossy summaries (D-06) and never throws on palace faults (D-08).</done>
  </task>
</tasks>

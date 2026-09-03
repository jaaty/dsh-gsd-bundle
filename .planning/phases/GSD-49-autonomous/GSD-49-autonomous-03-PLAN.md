---
phase: GSD-49-autonomous
plan: 03
type: execute
wave: 3
depends_on: ["GSD-49-autonomous-02"]
files_modified:
  - test/autonomous.test.mjs
autonomous: true
requirements: ["GAP-15"]
gap_closure: false
user_setup: []
must_haves:
  truths:
    - "The gsd_autonomous test suite runs offline (FakeFs + fake-ctx + fake subagents factory + fake gitFn) and passes under node --test, proving capability/command/inject registration, no-op discovery, auto-CONTEXT shape, skip-discuss-when-context-exists, numeric dispatch order, verify-status readback → STATUS summary, hard-failure stop with resume command, and that gsd_autonomous never mutates STATE (D-12)."
  artifacts:
    - path: "test/autonomous.test.mjs"
      provides: "the offline behavioural test suite for gsd_autonomous, modeled on test/learnings.test.mjs (pure helpers + mount + fake subagents factory + never-advances-STATE)"
      min_lines: 180
      exports: []
  key_links:
    - from: "test/autonomous.test.mjs"
      to: "lib/autonomous.js"
      via: "imports buildAutoContext / buildAutopilotPrompt / discoverPhases and applies lib/autonomous.js to a fake ctx to exercise the gsd_autonomous tool"
      pattern: "autonomous"
---
<objective>
Prove the gsd_autonomous feature satisfies GAP-15 with an offline, deterministic node:test suite modeled on test/learnings.test.mjs: pure-helper assertions plus a fake-ctx mount, a fake subagents factory that captures dispatch, a fake gitFn, and the never-advances-STATE invariant (D-12). Must run on a clean checkout under npm test.
</objective>

<context>
@test/learnings.test.mjs
@test/helpers/mount-harness.mjs
@test/helpers/fake-fs.mjs
@lib/autonomous.js
@lib/_capabilities.js
@lib/_shared.js
</context>

<tasks>
  <!-- TRACER: pure-helper + registration/mount scaffolding tests -->
  <task type="auto">
    <name>Task 1: Create test/autonomous.test.mjs with the mount harness + capability/command/inject descriptors + pure-helper tests</name>
    <files>test/autonomous.test.mjs</files>
    <read_first>test/learnings.test.mjs, test/helpers/mount-harness.mjs, lib/autonomous.js, lib/_capabilities.js</read_first>
    <action>Create test/autonomous.test.mjs. Copy the offline conventions from test/learnings.test.mjs (import { test, describe } from "node:test", assert from "node:assert/strict", FakeFs from "./helpers/fake-fs.mjs", makeMountCtx/makeExec/CWD from "./helpers/mount-harness.mjs"). Import applyState from "../lib/state.js", applyCoreTools from "../lib/core-tools.js", applyAutonomous (plus buildAutoContext/buildAutopilotPrompt/discoverPhases) from "../lib/autonomous.js", buildCapability from "../lib/_capabilities.js", parseFrontmatter from "../lib/_shared.js". Define a pure-helper describe block: (1) discoverPhases filters status "Complete" and sorts ascending by n (seed { phases: [{n:50,status:"Complete"},{n:52,status:"pending"},{n:51,status:"pending"}] } → [51,52]); (2) buildAutoContext({ n:50, name:"add-tests", goal:"add tests", requirements:["GAP-16"] }) contains the literal "Mode: Auto-generated (discuss skipped — autonomous path)", contains "add tests" as in_scope, contains "Ready for planning", and contains the footer /Phase 50/; (3) buildAutopilotPrompt({ base:"GSD-50-add-tests", phaseNum:50, phaseName:"add-tests" }) contains each of "gsd_discuss","gsd_plan","gsd_execute","gsd_verify" and the base "GSD-50-add-tests". Define a mountAutonomous(fs, { subagents } = {}) helper mirroring mountLearnings: makeMountCtx(fs, { subagents }), applyState(ctx, {}), applyCoreTools(ctx, {}), applyAutonomous(ctx, {}), return { fs, ctx }. Add an integration test asserting ctx.provided.has("gsdAutonomous"), buildCapability("gsdAutonomous").role === "out-of-band", order === -1, tools deep-equal ["gsd_autonomous"], commands deep-equal ["gsd-autonomous"], produces includes "STATUS". Then mount the full surface with applySubset-style or an autonomous+commands mount and assert ctx.commands includes name "gsd-autonomous" (proving command pairing).</action>
    <verify>node --test test/autonomous.test.mjs</verify>
    <acceptance_criteria>
      - `node --test test/autonomous.test.mjs` exits 0 with these tests passing
      - `grep "buildCapability" test/autonomous.test.mjs` matches
      - `grep "gsd-autonomous" test/autonomous.test.mjs` matches
      - `grep "discoverPhases" test/autonomous.test.mjs` matches
    </acceptance_criteria>
    <done>The suite file mounts with pure-helper, capability-descriptor, and command-pairing assertions all green.</done>
  </task>

  <task type="auto">
    <name>Task 2: Add the discovery/no-op, auto-CONTEXT shape, skip-discuss, and per-phase dispatch tests with a fake subagents factory</name>
    <files>test/autonomous.test.mjs</files>
    <read_first>test/autonomous.test.mjs, test/learnings.test.mjs</read_first>
    <action>Add a makeAutonomousSubagents(controller) factory mirroring makeLearningsSubagents (test/learnings.test.mjs:192-203): returns { getProvider: (n) => (n === "spawn" ? { spawn: true } : undefined), async start(_n, req) { if (controller.capture) controller.capture(req); if (controller.fail) throw new Error("autonomous subagent exploded"); return { result: { output: [{ type: "text", text: "autopilot done" }], stopReason: "completed" }, dispose: () => {} }; } }. Add a bootstrap helper that calls ctx.tools.find(t => t.name === "gsd_init").execute({ name:"demo", milestoneName:"M1", version:"v1.0", requirements, phases }, makeExec()) exactly like learnings bootstrap. Add a makeFakeGit() mirror (test/learnings.test.mjs:205-218) so ensurePhaseBranch/commitArtifacts use the fake gitFn. Then add integration tests. BEHAVIOURAL CONTRACT (holds for every test that drives more than one phase): per Plan 02 (D-03/D-04/D-09), the driver calls readVerifyStatus(cwd, n) after each phase and STOPS the run — refusing to spawn any later phase — unless that status resolves to "passed". Because the autopilot here is a fake (it does not write VERIFICATION), an unseeded phase makes the driver's gate read "missing" → break, so the next phase's spawn is never reachable. Therefore every test that must reach a second phase MUST pre-seed the first phase's VERIFICATION artefact with status: passed BEFORE running the tool, via gsdState.writeArtifact(CWD, p1.n, "VERIFICATION", "---\nstatus: passed\n---\n") — this reproduces the real child-writes-VERIFICATION → driver-reads-it coupling and is what makes the p2 spawn reachable. Concretely in test (b) below, pre-seed p1's VERIFICATION before running; in test (d) below, pre-seed the first processed phase's VERIFICATION before running. (a) no-op — seed ROADMAP with all phases status "Complete"; run gsd_autonomous (find tool by name, execute with makeExec()); assert the return matches /nothing to do/ and the capture factory recorded zero start calls; (b) auto-CONTEXT shape + dispatch order — seed phases [{name:"p2",goal:"g2",requirements:["GAP-16"]},{name:"p1",goal:"g1",requirements:["GAP-16"]}] with both pending and no CONTEXT for either, and PRE-SEED p1's VERIFICATION to status: passed via gsdState.writeArtifact(CWD, p1.n, "VERIFICATION", "---\nstatus: passed\n---\n") before running; run gsd_autonomous; assert the capture factory recorded start calls in order p1 then p2; read gsdState.readArtifact(CWD, p1.n, "CONTEXT") and assert it contains "Mode: Auto-generated (discuss skipped — autonomous path)" and the goal "g1"; (c) skip-discuss-when-context-exists — seed a phase with an existing CONTEXT (write via gsdState.writeArtifact) and run; assert the captured first-spawn prompt's text contains "gsd_discuss" skip guidance (or that the run still reaches plan without a second auto-write) and that readArtifact CONTEXT still equals the seeded text (unchanged); (d) ROADMAP re-read between phases — seed phases with p1 first AND pre-seed p1's VERIFICATION to status: passed via gsdState.writeArtifact(CWD, p1.n, "VERIFICATION", "---\nstatus: passed\n---\n") so p1 passes its verify gate; have the controller.capture(req) on the FIRST start re-seed ROADMAP with one inserted incomplete phase via gsdState.writeRoadmap/readRoadmap, then assert a later phase was picked up. Assert req.parent is present on captured requests.</action>
    <verify>node --test test/autonomous.test.mjs</verify>
    <acceptance_criteria>
      - `node --test test/autonomous.test.mjs` exits 0 with the no-op, auto-CONTEXT, skip-discuss, and dispatch-order tests passing
      - `grep "makeAutonomousSubagents" test/autonomous.test.mjs` matches
      - `grep "nothing to do" test/autonomous.test.mjs` matches
      - `grep "Mode: Auto-generated" test/autonomous.test.mjs` matches
      - `grep -c 'VERIFICATION' test/autonomous.test.mjs` ≥ 2 — each multi-phase test pre-seeds a phase's VERIFICATION (status: passed) so the second-phase spawn is reachable
      - `grep "no recursion" test/autonomous.test.mjs` matches — the captured autopilot prompt is asserted to contain the self-invocation guard "do not call gsd_autonomous (no recursion)" per Plan 02 Task 2
    </acceptance_criteria>
    <done>Discovery no-op, auto-derived CONTEXT shape, skip-discuss-when-context-exists, numeric dispatch order, ROADMAP re-read, and req.parent presence are all asserted with a controllable fake subagents factory.</done>
  </task>

  <task type="auto">
    <name>Task 3: Add verify-status readback → STATUS summary, hard-failure stop + resume command, and never-mutates-STATE tests</name>
    <files>test/autonomous.test.mjs</files>
    <read_first>test/autonomous.test.mjs, test/learnings.test.mjs, lib/autonomous.js</read_first>
    <action>Extend the fake subagents factory so its controller can write a VERIFICATION artefact to simulate the autopilot's work: in start(), if controller.writeVerification is set, call the mounted gsdState (via a reference captured through a closure or controller.fs) to writeArtifact(req-phase? — instead pass the phase to the controller through capture, or have the controller factory receive gsdState) with status: passed or gaps_found. Simpler deterministic approach: after running the tool with a controller that has capture(req) setting controller.lastPrompt = req.prompt.text, manually write the phase's VERIFICATION artefact BEFORE invoking gsd_autonomous (seed VERIFICATION with status per phase) so readVerifyStatus consumes it — assert the per-phase STATUS line reflects "passed" for the fully-seeded phase. Add tests: (a) verify passed → overall "completed" and the returned report contains "- Phase N (" + name + "): passed" and matches /completed|outcome: completed/i; (b) verify gaps_found OR missing → overall "stopped", the report matches /stopped/ and contains "resume: /gsd-autonomous" and a stop reason naming the phase; and the capture factory recorded NO start for any later phase (assert capture count === number of phases driven before the stop — i.e. exactly 1 when phase 1 fails); (c) subagent spawn throw (controller.fail=true) → returns a stopped report naming the "autopilot" step and the resume command, and no later phase spawns; (d) never-advances-STATE — seed all-complete so nothing runs, read gsdState.readState(CWD) before, run gsd_autonomous, read after, and assert frontmatter.status, frontmatter.next_action, frontmatter.active_phase are all unchanged (mirror learnings test h at test/learnings.test.mjs:471-486).</action>
    <verify>node --test test/autonomous.test.mjs</verify>
    <acceptance_criteria>
      - `node --test test/autonomous.test.mjs` exits 0 with the passed/stopped/resume/never-mutates tests passing
      - `grep "resume: /gsd-autonomous" test/autonomous.test.mjs` matches (or /resume/i)
      - `grep -c "setActivePhase" test/autonomous.test.mjs` returns 0 (test never calls it)
      - `grep "status" test/autonomous.test.mjs` matches in the STATUS assertions
    </acceptance_criteria>
    <done>The test suite proves verify-status readback into the per-phase STATUS, hard-failure stop with the failing phase + step and the /gsd-autonomous resume command, subagent-throw stop, and the gsd_autonomous-never-mutates-STATE invariant. Full suite passes.</done>
  </task>
</tasks>

---
phase: 53-smart-entry
plan: 02
type: execute
wave: 2
depends_on: ["GSD-53-smart-entry-01"]
files_modified: ["lib/core-tools.js", "lib/commands.js", "lib/_capabilities.js", "test/next-integration.test.mjs", "test/mount.test.mjs", "test/_capabilities.test.mjs", "test/removal.test.mjs"]
autonomous: true
requirements: ["CLH-02", "CLH-03"]
user_setup: []
must_haves:
  truths:
    - "The gsd_next tool is registered inside lib/core-tools.js apply(ctx) and its execute path gathers a snapshot via gsdState accessors, calls classifyNextState from lib/_next.js, applies the branch's optional setActivePhase mutation, commits via commitArtifacts, and returns renderNextRecommendation text."
    - "Auto-advance (branch 5) re-points STATE.md (active_phase + status + recomputed next_action) via setActivePhase and commits the change, but does NOT auto-run the next step's tool — the returned text names the command to invoke (D-02)."
    - "Branches 1, 2, 3, 4, and 6 leave STATE.md byte-identical (no setActivePhase, no commit) — the never-advances-STATE invariant."
    - "Paused-handoff detection (branch 3) reads .continue-here.md at the .planning/ root AND, when the root pointer is absent, scans every phase dir via s.listPhaseDirs + s.readContinueHere (mirroring gsd_resume_work's continueHereFiles scan), so a lone phase-dir .continue-here.md with HANDOFF.json deleted still routes to gsd_resume_work rather than misrouting to mid-phase (D-05 fully honored)."
    - "The /gsd-next slash command is registered in lib/commands.js and paired to the gsdOrient capability via gsdOrient.commands, so retiring gsd-core-tools withdraws it (DEGR-03)."
    - "gsdOrient in lib/_capabilities.js advertises gsd_next in its tools array and gsd-next in its commands array."
    - "npm test passes with the updated tool/command counts (32 tools / 29 commands) and the updated exact arrays."
  artifacts:
    - path: "lib/core-tools.js"
      provides: "Registered gsd_next tool: snapshot gather → classifyNextState → optional setActivePhase + commitArtifacts → renderNextRecommendation. Reuses gsdState accessors and commitArtifacts; no new dependency."
      min_lines: 600
      exports: ["name", "inject", "apply"]
    - path: "lib/commands.js"
      provides: "A new gsd-next command entry in the COMMANDS array paired to gsdOrient."
      min_lines: 430
      exports: ["apply"]
    - path: "lib/_capabilities.js"
      provides: "gsdOrient.tools extended with gsd_next and gsdOrient.commands extended with gsd-next."
      min_lines: 376
      exports: ["buildCapability", "CAPABILITY_KEYS", "allCapabilities"]
    - path: "test/next-integration.test.mjs"
      provides: "Integration tests mounting core-tools + state + commands, exercising gsd_next execute across no-project, mid-phase, auto-advance, milestone-complete, corrupt, and paused paths, plus the never-advances-STATE invariant."
      min_lines: 120
      exports: []
  key_links:
    - from: "lib/core-tools.js"
      to: "lib/_next.js"
      via: "gsd_next execute imports classifyNextState and renderNextRecommendation from ./_next.js and calls them with the gathered snapshot + availableCapabilities"
      pattern: "import\\s*\\{[^}]*classifyNextState[^}]*\\}\\s*from\\s*\"\\./_next\\.js\""
    - from: "lib/commands.js"
      to: "lib/_capabilities.js"
      via: "the gsd-next command is paired to gsdOrient because gsdOrient.commands now lists gsd-next, so the commandToCapability map and the DEGR-03 sub-fiber inject key resolve to gsdOrient"
      pattern: "gsd-next"
    - from: "lib/core-tools.js"
      to: "lib/_git-artifacts.js"
      via: "branch 5 auto-advance commits the re-pointed STATE.md through commitArtifacts(cwd, phaseNum, { scope, phaseName })"
      pattern: "commitArtifacts\\("
---

<objective>Wire the gsd_next tool + /gsd-next command into the existing orientation tier, reusing the pure classifier from plan 01. The tool's execute path gathers a snapshot via gsdState accessors, calls classifyNextState, applies the optional branch-5 setActivePhase mutation, commits via commitArtifacts, and returns renderNextRecommendation text. Extend the gsdOrient capability descriptor so the tool+command pairing and the persona's never-instruct-a-missing-tool gate hold. Reconcile the eight hardcoded count/array assertions and tighten the gsd-core-tools removal assertion. Integration-tested across all six branches plus the never-advances-STATE invariant. This plan depends on GSD-53-smart-entry-01 (the pure classifier it imports).</objective>

<context>@lib/core-tools.js @lib/commands.js @lib/_capabilities.js @lib/state.js @lib/_git-artifacts.js @lib/_render.js @lib/_next.js @test/mount.test.mjs @test/_capabilities.test.mjs @test/removal.test.mjs @test/helpers/mount-harness.mjs @test/autonomous.test.mjs</context>

<tasks>
  <task type="auto">
    <name>Task 1 (tracer): register a minimal gsd_next tool (no-project + read-only mid-phase branches only) + add /gsd-next command + extend gsdOrient + reconcile mount/_capabilities count assertions, end-to-end green</name>
    <files>lib/_capabilities.js, lib/commands.js, lib/core-tools.js, test/mount.test.mjs, test/_capabilities.test.mjs</files>
    <read_first>lib/core-tools.js, lib/commands.js, lib/_capabilities.js, lib/_next.js, test/mount.test.mjs, test/_capabilities.test.mjs</read_first>
    <action>In lib/_capabilities.js, extend the gsdOrient entry (around lines 75-85): append "gsd_next" to its tools array (after "gsd_resume_work") and "gsd-next" to its commands array (after "gsd-resume-work"). In lib/commands.js (per D-01: the tool+command pairing convention every loop step follows), add a new COMMANDS entry placed alongside gsd-resume-work (before gsd-autonomous around line 350): { name: "gsd-next", description: "Detect the current project state and route to the best next action; with auto-advance, re-point STATE to the next logical step and return the command to invoke.", build: () => ({ text: "Run the gsd_next tool to classify the current .planning/ state and route to the best next action. When it re-points STATE (auto-advance), report the command to invoke next but do not run it.", ack: "Smart entry → gsd_next." }) }. In lib/core-tools.js, import classifyNextState and renderNextRecommendation from "./_next.js" at the top of the import block. Register the gsd_next tool inside apply(ctx) (after gsd_resume_work registration, before the closing brace at line 565) via ctx.tools.register(defineTool({...})) with name "gsd_next", description "Detect the current project state and route the user to the best next action, with an auto-advance option (opengsd /gsd-next).", parameters: { advance: { type: "boolean", description: "When true, re-point STATE to the next logical step for the advance branches and return the command to invoke (does not auto-run it)." } }, output: { schema: { type: "string" }, render: (_a, v) => [{ type: "text", text: v }] }, and an async execute(args, exec). For THIS TRACER TASK, implement only the snapshot gather + classify + render with NO mutation/commit: const cwd = cwdOf(exec); const s = gsd(); if (!s) throw new Error("gsd_next: gsdState service unavailable"); gather snapshot by calling s.readProject(cwd), s.readState(cwd), s.readRoadmap(cwd), s.readHandoff(cwd), and continueHere as follows (per D-05: read the .continue-here.md pointer fully, mirroring gsd_resume_work's continueHereFiles scan in lib/core-tools.js around lines 539-550): first `let continueHere = await s.readContinueHere(cwd, "")` (the .planning/ root pointer); if that is undefined, iterate `const dirs = await s.listPhaseDirs(cwd)` and for each `d` call `const ch = await s.readContinueHere(cwd, d.name)`, setting `continueHere = ch` and breaking on the first non-undefined result — this catches the common mid-phase-pause case where gsd_pause_work wrote .continue-here.md at the active phase dir (lib/core-tools.js:491, `active ? active.phaseDir : null`) and HANDOFF.json was later manually deleted, which the root-only read would miss and misroute to mid-phase. Then (when roadmap exists) read the milestone audit text via s.readMilestoneArtifact(cwd, milestoneName) where milestoneName = roadmap.milestoneName || state?.frontmatter?.milestone_name || "milestone", parsing its frontmatter to { status } when present (tolerate undefined). Compute hasProject = !!(project || state || roadmap). Gather descriptors via availableCapabilities((k) => ctx.get(k)). Call classifyNextState(snapshot, descriptors). Return renderNextRecommendation(result). Add presentCall: (a) => ({ card: "generic", title: "gsd_next", kind: "other", rawInput: { advance: a.advance } }). Reconcile the hardcoded assertions: in test/mount.test.mjs line 6 comment update "31 gsd_* tools, 28 /gsd-* commands" to "32 gsd_* tools, 29 /gsd-* commands"; add "gsd_next" to EXPECTED_TOOL_NAMES (after "gsd_resume_work"); add "gsd-next" to EXPECTED_COMMAND_NAMES (after "gsd-resume-work"); line 147 change `ctx.tools.length === 31` to `=== 32`; line 148 change `=== 28` to `=== 29`; line 190 change `ctx2.commands.length === 27` to `=== 28`; line 328 change `ctx.tools.length, 31` to `, 32`; update the line 325 comment "all 31 registered tools" to "all 32". In test/_capabilities.test.mjs lines 69-70, append "gsd_next" to the gsdOrient.tools deepEqual array and "gsd-next" to the gsdOrient.commands deepEqual array. Do NOT yet add integration tests (Task 3) — only the count/array reconciliation needed to keep npm test green.</action>
    <verify>cd /var/home/jatyeo/dev/dsh-gsd-bundle && npm test 2>&1 | tail -15</verify>
    <acceptance_criteria>
      - grep -q '"gsd_next"' lib/_capabilities.js
      - grep -q '"gsd-next"' lib/_capabilities.js
      - grep -q 'name: "gsd-next"' lib/commands.js
      - grep -q 'name: "gsd_next"' lib/core-tools.js
      - grep -q 'classifyNextState' lib/core-tools.js
      - grep -q 'renderNextRecommendation' lib/core-tools.js
      - grep -c '=== 32' test/mount.test.mjs returns >= 2
      - grep -c '=== 29' test/mount.test.mjs returns >= 1
      - grep -q 'gsd-next' test/mount.test.mjs
      - npm test exits 0
    </acceptance_criteria>
    <done>gsd_next tool + /gsd-next command + gsdOrient extension are registered, mount/capability count assertions are reconciled to 32/29, and `npm test` is green end-to-end.</done>
  </task>

  <task type="auto">
    <name>Task 2: complete the gsd_next execute path — branch-5 auto-advance mutation + commit, milestone-complete / corrupt / paused branch wiring, and the advance flag semantics</name>
    <files>lib/core-tools.js</files>
    <read_first>lib/core-tools.js, lib/_next.js, lib/state.js, lib/_git-artifacts.js, lib/_render.js, lib/_shared.js</read_first>
    <action>Complete the gsd_next execute closure. After classifyNextState returns `result`: if `result.mutation` is non-null AND `args.advance` is truthy, apply the mutation: when result.mutation.setActivePhase is present, call `await s.setActivePhase(cwd, result.mutation.setActivePhase.phaseNum, result.mutation.setActivePhase.step)` (this recomputes next_action via _nextActionFor), then commit via `await commitArtifacts(cwd, result.mutation.setActivePhase.phaseNum, { scope: "next", phaseName: String(result.mutation.setActivePhase.phaseNum) })` — mirror the gsd_new_milestone pattern (NO ensurePhaseBranch, per OQ-4) and never throw on a commit warning (commitArtifacts already returns { warning? } instead of throwing). When `result.mutation` is non-null but `args.advance` is falsy, return renderNextRecommendation(result) augmented with a line noting that re-running with advance:true will re-point STATE — but do NOT mutate. When `result.mutation` is null (branches 1,2,3,4,6), do NOT call setActivePhase and do NOT commit — return renderNextRecommendation(result) unchanged. Ensure the never-advances-STATE invariant: branches 1,2,3,4,6 must not call setActivePhase or commitArtifacts under any args.advance value. Keep the snapshot-gathering code from Task 1; refine the milestone-audit parse: when s.readMilestoneArtifact returns undefined, set snapshot.milestoneAudit = undefined; when it returns text, parse the frontmatter by importing parseFrontmatter from "./_shared.js" (the canonical shared helper that lib/state.js, lib/milestone-audit.js, lib/verify.js, and ~10 other modules already import — do NOT inline a parallel YAML scanner) and set snapshot.milestoneAudit = { status: parsed.status }. Wrap each gsdState accessor call so a thrown error does not crash gsd_next — degrade the corresponding snapshot field to undefined (the classifier already treats undefined state/roadmap as the corrupt branch). Add a brief JSDoc on execute describing D-02 (re-points STATE, does not auto-run the next tool) and D-03 (classify-then-mutate-then-render ordering).</action>
    <verify>cd /var/home/jatyeo/dev/dsh-gsd-bundle && node --check lib/core-tools.js && npm test 2>&1 | tail -15</verify>
    <acceptance_criteria>
      - grep -q 'setActivePhase(' lib/core-tools.js (inside the gsd_next execute closure)
      - grep -q 'commitArtifacts(' lib/core-tools.js (inside the gsd_next execute closure)
      - grep -q 'args.advance' lib/core-tools.js
      - grep -q 'parseFrontmatter' lib/core-tools.js
      - grep -q 'from "./_shared.js"' lib/core-tools.js (parseFrontmatter imported from the canonical shared helper, not inlined)
      - grep -q 'does not auto-run' lib/core-tools.js OR grep -q 'D-02' lib/core-tools.js
      - node --check lib/core-tools.js exits 0
      - npm test exits 0
    </acceptance_criteria>
    <done>gsd_next execute applies the branch-5 auto-advance (setActivePhase + commitArtifacts) only when args.advance is true, never mutates STATE for branches 1/2/3/4/6, and `npm test` stays green.</done>
  </task>

  <task type="auto">
    <name>Task 3: integration tests for gsd_next across all six branches + the never-advances-STATE invariant + the tightened gsd-core-tools removal assertion</name>
    <files>test/next-integration.test.mjs, test/removal.test.mjs</files>
    <read_first>test/autonomous.test.mjs, test/helpers/mount-harness.mjs, test/removal.test.mjs, lib/core-tools.js, lib/state.js, lib/_next.js</read_first>
    <action>Create test/next-integration.test.mjs modeled on test/autonomous.test.mjs (mount state + core-tools + commands via mountSubset or makeMountCtx+applySubset, using FakeFs and a fake gitFn so commitArtifacts is offline). Import apply as applyState from ../lib/state.js, apply as applyCoreTools from ../lib/core-tools.js, apply as applyCommands from ../lib/commands.js, and the loop-step plugins needed to populate descriptors (at minimum discuss, plan, execute, verify, ship; spec when testing the spec branch). Use makeMountCtx/makeExec/CWD/initProject from test/helpers/mount-harness.mjs. Find the gsd_next tool via ctx.tools.find(t => t.name === "gsd_next"). Add tests: (1) no-project path — uninitialised cwd → execute({}) returns text naming "gsd_init"; STATE.md absent. (2) mid-phase path — initProject then setActivePhase to phase 1 step "plan" via the mounted gsdState → execute({}) returns text naming "plan-phase"; re-read STATE and assert active_phase/status byte-identical (never-advances invariant). (3) auto-advance path — seed ROADMAP with phase 1 Complete and phase 2 pending (write roadmap via s.writeRoadmap after initProject), set STATE.active_phase null → execute({ advance: true }) → re-read STATE and assert frontmatter.active_phase === "2", status === "discuss", next_action === "discuss-phase"; returned text names "discuss-phase". (4) auto-advance spec variant — same but mount gsd-spec plugin → status "spec", next_action "discuss-phase" (note: _nextActionFor maps spec→"discuss-phase"); assert step chosen is "spec" by checking the recommendation text contains "spec-phase". (5) auto-advance with advance false — same seed as (3) but execute({}) (no advance) → STATE unchanged (active_phase still null), text does not claim a re-point. (6) milestone-complete path — all phases Complete → execute({}) names "gsd_milestone_audit"; then write a milestone audit artefact via s.writeMilestoneArtifact(cwd, milestoneName, "---\nstatus: ready-to-close\n---\nbody") → execute({}) names "gsd_new_milestone"; STATE untouched. (7) corrupt path — delete STATE.md from the FakeFs after initProject (or write a project with ROADMAP but no STATE) → execute({}) names "gsd_health"; STATE untouched. (8) paused path — write a HANDOFF.json via s.writeHandoff(cwd, {phase_dir:null,...}) after initProject + mid-phase → execute({}) names "gsd_resume_work"; STATE untouched. (8b) paused path via phase-dir .continue-here.md only — after initProject + mid-phase, write a phase-dir pointer via s.writeContinueHere(cwd, activePhaseDir, "resume here") for the active phase dir (activePhaseDir = the phase slug under .planning/phases/), do NOT write HANDOFF.json (or delete it via s.deleteHandoff if initProject wrote one) so only the phase-dir .continue-here.md remains → execute({}) names "gsd_resume_work" (branch 3 must fire from the phase-dir pointer, per D-05, not misroute to mid-phase branch 4); STATE untouched. (9) never-advances-STATE invariant aggregated — for branches 1,2,3,4,6 with advance:true AND advance:false, snapshot STATE frontmatter before/after and assert deepEqual. Use assert.equal/deepEqual from node:assert/strict. In test/removal.test.mjs, add a describe/test (or extend the existing gsd-phase-management out-of-band case pattern) that mounts all subs EXCEPT core-tools via mountSubset and asserts: !ctx.tools.some(t => t.name === "gsd_next") AND !ctx.commands.some(c => c.name === "gsd-next") AND !ctx.provided.has("gsdOrient"), mirroring the existing command-absence checks at lines 202-206 — one assertion line for gsd-next command absence alongside the gsd_phase tool-absence pattern. Do not duplicate the whole removal matrix; add the single gsd-next command-absence assertion to a new small test under the out-of-band describe block.</action>
    <verify>cd /var/home/jatyeo/dev/dsh-gsd-bundle && node --test test/next-integration.test.mjs 2>&1 | tail -5 && npm test 2>&1 | tail -5</verify>
    <acceptance_criteria>
      - node --test test/next-integration.test.mjs exits 0 and reports >= 10 tests
      - grep -c 'test(' test/next-integration.test.mjs returns >= 10
      - grep -q 'never-advances' test/next-integration.test.mjs OR grep -q 'deepEqual' test/next-integration.test.mjs
      - grep -q 'ready-to-close' test/next-integration.test.mjs
      - grep -q 'advance: true' test/next-integration.test.mjs
      - grep -q 'writeContinueHere' test/next-integration.test.mjs (phase-dir .continue-here.md paused test, D-05)
      - grep -q 'gsd-next' test/removal.test.mjs
      - npm test exits 0
    </acceptance_criteria>
    <done>test/next-integration.test.mjs covers no-project, mid-phase, auto-advance (discuss + spec), advance-false, milestone-complete (audit + ready-to-close), corrupt, paused, and the never-advances-STATE invariant; test/removal.test.mjs asserts /gsd-next is unregistered when gsd-core-tools is retired; `npm test` is green.</done>
  </task>
</tasks>
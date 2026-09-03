---
phase: 48-pause-resume-work
plan: 02
type: tdd
wave: 2
depends_on: ["GSD-48-pause-resume-work-01"]
files_modified: ["lib/core-tools.js", "test/pause-resume.test.mjs"]
autonomous: true
requirements: ["GAP-14"]
must_haves:
  truths:
    - "gsd_pause_work writes .planning/HANDOFF.json and a .continue-here.md at the phase-dir path when a phase is active, else at .planning/ root (D-02, D-03)."
    - "gsd_pause_work commits a WIP commit via the shared commitArtifacts seam (D-06)."
    - "gsd_resume_work reads HANDOFF.json, presents a status + next-action recommendation, updates STATE Session Continuity (stoppedAt/resumeFile), and deletes HANDOFF.json after successful consumption (D-04, D-05)."
    - "gsd_resume_work falls back to detecting incomplete work (PLAN-without-SUMMARY, .continue-here files) when no HANDOFF.json exists, and returns a clean 'nothing to resume' status when there is none (D-04, D-09)."
    - "Neither tool advances the STATE loop position (D-04)."
  artifacts:
    - path: "lib/core-tools.js"
      provides: "The gsd_pause_work and gsd_resume_work tools registered via ctx.tools.register(defineTool(...)), wiring the Plan-01 pure helpers + state accessors, with fail-fast guards and the ctx.gitFn || defaultGitFn seam."
      min_lines: 120
      exports: ["apply"]
    - path: "test/pause-resume.test.mjs"
      provides: "Integration tests for both tools over FakeFs + fake gitFn: phase-vs-default detection, HANDOFF.json + .continue-here.md writes, WIP commit, resume consumption + deletion, fallback detection, advisory no-mutation, and error handling."
      min_lines: 120
      exports: []
  key_links:
    - from: "lib/core-tools.js"
      to: "lib/pause-resume.js"
      via: "gsd_pause_work/gsd_resume_work call the pure helpers (detectActivePhase, buildHandoff, renderContinueHere, mapAsyncJobs, detectIncompleteWork, renderResumeStatus) on the gathered state."
      pattern: "detectActivePhase\\(|buildHandoff\\(|renderContinueHere\\(|mapAsyncJobs\\(|detectIncompleteWork\\(|renderResumeStatus\\("
    - from: "lib/core-tools.js"
      to: "lib/state.js"
      via: "the tools call the new accessors (listPhaseDirs, updateContinuity, readHandoff/writeHandoff/deleteHandoff, readContinueHere/writeContinueHere) plus existing ones (readState, readRoadmap, listPlans, hasArtifact, readJobs)."
      pattern: "s\\.listPhaseDirs\\(|s\\.updateContinuity\\(|s\\.writeHandoff\\(|s\\.deleteHandoff\\(|s\\.readHandoff\\("
---
<objective>
Register the two utility tools — gsd_pause_work and gsd_resume_work — in lib/core-tools.js, wiring the Plan-01 pure helpers and state accessors into the full pause/resume behaviour: phase detection, state gathering, HANDOFF.json + .continue-here.md writes, WIP commit, resume consumption + deletion, fallback detection, and advisory no-mutation. TDD per D-10: integration tests written first, then the tool implementations.
</objective>
<context>
@lib/core-tools.js — the ctx.tools.register(defineTool(...)) pattern (gsd_init/gsd_status/gsd_job), the gsd() = () => ctx.get("gsdState") helper, cwdOf(exec), and the ctx.gitFn || defaultGitFn seam used by gsd_job's sub-fiber.
@lib/pause-resume.js — the seven pure helpers from Plan 01 (detectActivePhase, phaseNumFromDir, mapAsyncJobs, buildHandoff, renderContinueHere, detectIncompleteWork, renderResumeStatus).
@lib/state.js — the new accessors (listPhaseDirs, updateContinuity, readHandoff/writeHandoff/deleteHandoff, readContinueHere/writeContinueHere) plus readState, readRoadmap, listPlans, hasArtifact, readJobs, planningRoot.
@lib/_git-artifacts.js — commitArtifacts(cwd, phaseNum, opts, gitFn) with the opts.message override (D-12) and defaultGitFn; the fixed-arg git seam.
@lib/graphify.js — the fail-fast environmental guard pattern (lines 279-285).
@test/learnings.test.mjs — the integration-test pattern (mountState+coreTools, bootstrap via gsd_init, fake gitFn via ctx.gitFn).
@test/helpers/mount-harness.mjs — makeMountCtx, makeExec, CWD, applyState/applyCoreTools.
</context>
<tasks>
  <task type="auto">
    <name>Task 1: gsd_pause_work tool + integration tests</name>
    <files>lib/core-tools.js, test/pause-resume.test.mjs</files>
    <read_first>lib/core-tools.js, lib/pause-resume.js, lib/state.js, lib/_git-artifacts.js</read_first>
    <action>
In test/pause-resume.test.mjs, add an integration describe block (model on test/learnings.test.mjs) that mounts state + core-tools (applyState + applyCoreTools over a FakeFs via makeMountCtx), bootstraps a project via the mounted gsd_init tool, seeds a phase with a PLAN.md (via gsdState.writeArtifact(CWD, 1, "PLAN-01", ...)), and sets ctx.gitFn to a fake gitFn that records calls and simulates add/diff/commit (model on test/learnings.test.mjs makeFakeGit). TDD ordering: write these tests FIRST and commit them as a test: commit before implementing the tool; then implement gsd_pause_work and commit as feat:. Write these tests (they will fail until the tool exists — RED):
- gsd_pause_work with an active phase writes .planning/HANDOFF.json AND .planning/phases/<dir>/.continue-here.md (assert both exist via gsdState.readHandoff / readContinueHere).
- gsd_pause_work with no active phase (no PLAN.md seeded) writes .planning/HANDOFF.json AND .planning/.continue-here.md (root path).
- gsd_pause_work issues a WIP commit: assert the fake gitFn received a commit call whose message starts with "wip:".
- gsd_pause_work records non-terminal async jobs in the handoff (seed .planning/async-jobs.json with a running job via gsdState.appendJob, assert the handoff's async_jobs includes it with resume_command "gsd_job status <id>").
- gsd_pause_work with no project rejects with a "no .planning/ project" error.

Then implement gsd_pause_work in lib/core-tools.js. Register it via ctx.tools.register(defineTool({ name: "gsd_pause_work", parameters: {}, ... })). In execute(args, exec):
1. const cwd = cwdOf(exec); const s = gsd(); fail-fast guards mirroring graphify.js: if (!s) throw "gsd_pause_work: gsdState service unavailable"; if (!(await s.isProject(cwd))) throw "gsd_pause_work: no .planning/ project — run gsd_init first"; const roadmap = await s.readRoadmap(cwd); if (!roadmap) throw "gsd_pause_work: unreadable ROADMAP.md".
2. Detect the active phase: const dirs = await s.listPhaseDirs(cwd); for each dir, determine hasPlan by listing the dir (ctx.fs.listDir on `${s._phases(cwd)}/${dir.name}`) and checking for any name matching /-PLAN\.md$/; sort the dirs most-recent-first by mtime desc, falling back to name desc when mtime is null; const active = detectActivePhase(sortedDirs).
3. Gather state: read STATE (position, decisions, blockers, continuity), ROADMAP (phase name for active.phase), the active phase's plans via s.listPlans(cwd, active.phaseNum) (completed_tasks from plans with has_summary, remaining_tasks from plans without, plan/task/total_tasks from the first incomplete plan), async jobs via s.readJobs(cwd) → mapAsyncJobs(entries), and uncommitted files via the gitFn porcelain call (const gitFn = ctx.gitFn || defaultGitFn; try { await gitFn(cwd, ["status", "--porcelain"]) } catch { [] }).
4. Assemble the gathered object (shape from Plan 01) with context "phase" when active else "default", phase/phase_name/phase_dir from active (or null), next_action from STATE frontmatter.next_action, context_notes a short summary line, timestamp nowIso().
5. Write the handoff: const handoff = buildHandoff(gathered); await s.writeHandoff(cwd, handoff); const continuePath = await s.writeContinueHere(cwd, active ? active.phaseDir : null, renderContinueHere(gathered)).
6. WIP commit (D-06): const commit = await commitArtifacts(cwd, active ? active.phaseNum : null, { message: "wip: pause-work handoff" }, gitFn). Note in the returned text that source files are NOT committed — only recorded in uncommitted_files (R-5).
7. Return a confirm string naming the HANDOFF.json path, the .continue-here.md path, the context, and the commit status (model on graphify's commitNote).
    </action>
    <verify>node --test test/pause-resume.test.mjs</verify>
    <acceptance_criteria>
      - grep "name: \"gsd_pause_work\"" lib/core-tools.js
      - grep "detectActivePhase(" lib/core-tools.js
      - grep "buildHandoff(" lib/core-tools.js
      - grep "renderContinueHere(" lib/core-tools.js
      - grep "mapAsyncJobs(" lib/core-tools.js
      - grep "commitArtifacts(cwd" lib/core-tools.js
      - grep "wip: pause-work handoff" lib/core-tools.js
      - node --test test/pause-resume.test.mjs exits 0
    </acceptance_criteria>
    <done>gsd_pause_work is registered, writes both handoff files at the correct path, records non-terminal async jobs, issues a WIP commit, and its integration tests pass.</done>
  </task>
  <task type="auto">
    <name>Task 2: gsd_resume_work tool + integration tests</name>
    <files>lib/core-tools.js, test/pause-resume.test.mjs</files>
    <read_first>lib/core-tools.js, lib/pause-resume.js, lib/state.js</read_first>
    <action>
In test/pause-resume.test.mjs, add these integration tests for gsd_resume_work (RED until implemented). TDD ordering: write these tests FIRST and commit them as a test: commit before implementing the tool; then implement gsd_resume_work and commit as feat:
- With a HANDOFF.json present (write one via gsdState.writeHandoff), gsd_resume_work returns a status naming the next_action, updates STATE Session Continuity (assert body.continuity.resumeFile is set and frontmatter.stopped_at is set), and deletes HANDOFF.json (assert readHandoff returns undefined).
- With no HANDOFF.json but a PLAN-without-SUMMARY, gsd_resume_work detects the incomplete work and reports it.
- With no HANDOFF.json and no incomplete work, gsd_resume_work returns a clean "nothing to resume" status (does not throw).
- Advisory no-mutation: after gsd_resume_work, STATE frontmatter.status and next_action are unchanged (D-04).
- With no project, gsd_resume_work rejects with a "no .planning/ project" error.

Then implement gsd_resume_work in lib/core-tools.js. Register it via ctx.tools.register(defineTool({ name: "gsd_resume_work", parameters: {}, ... })). In execute(args, exec):
1. Same fail-fast guards as gsd_pause_work (service, isProject, readRoadmap).
2. const handoff = await s.readHandoff(cwd). If present: build the status via renderResumeStatus(handoff); update Session Continuity via s.updateContinuity(cwd, { stoppedAt: nowIso(), resumeFile: handoff.phase_dir ? `${s._phases(cwd)}/${handoff.phase_dir}/.continue-here.md` : `${s.planningRoot(cwd)}/.continue-here.md` }); then delete the one-shot handoff via s.deleteHandoff(cwd) (D-05 — delete only after a handoff was actually read and presented, never on the nothing-to-resume path, R-4). Return the status + a "resumed from handoff" note.
3. If no handoff: detect incomplete work. For each phase dir (s.listPhaseDirs), list plans via s.listPlans(cwd, phaseNumFromDir(dir.name)) and collect plans without has_summary; collect .continue-here files via s.readContinueHere(cwd, dir.name) presence (or a root read). Build the incomplete-work report via detectIncompleteWork. If any incomplete work exists, present it as the status + next-action recommendation (do NOT delete anything, do NOT update continuity). If none, return a clean "nothing to resume" status (D-09 — degrade gracefully, never throw).
4. Never call setActivePhase or mutate frontmatter.status/next_action (D-04 advisory).
    </action>
    <verify>node --test test/pause-resume.test.mjs</verify>
    <acceptance_criteria>
      - grep "name: \"gsd_resume_work\"" lib/core-tools.js
      - grep "renderResumeStatus(" lib/core-tools.js
      - grep "updateContinuity(" lib/core-tools.js
      - grep "deleteHandoff(" lib/core-tools.js
      - grep "detectIncompleteWork(" lib/core-tools.js
      - grep "nothing to resume" lib/core-tools.js
      - node --test test/pause-resume.test.mjs exits 0
    </acceptance_criteria>
    <done>gsd_resume_work is registered, consumes + deletes the handoff, updates Session Continuity, falls back to incomplete-work detection, returns a clean nothing-to-resume status, and never advances the loop; its integration tests pass.</done>
  </task>
</tasks>

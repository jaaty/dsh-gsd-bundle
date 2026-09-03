---
phase: GSD-49-autonomous
plan: 02
type: execute
wave: 2
depends_on: ["GSD-49-autonomous-01"]
files_modified:
  - lib/autonomous.js
autonomous: true
requirements: ["GAP-15"]
gap_closure: false
user_setup: []
must_haves:
  truths:
    - "For a milestone with an incomplete phase lacking a CONTEXT.md, gsd_autonomous auto-derives and writes a minimal CONTEXT.md flagged 'Mode: Auto-generated (discuss skipped — autonomous path)' before any planning (D-05/D-06)."
    - "gsd_autonomous spawns exactly one fresh-context autopilot subagent per incomplete phase, in numeric ascending order, whose prompt names the phase and instructs the inline sequence gsd_discuss (skip if CONTEXT already exists) → gsd_plan → gsd_execute → gsd_verify for that one phase (D-03/D-04)."
    - "gsd_autonomous re-reads ROADMAP after each phase to catch inserted phases before the next iteration (D-07)."
    - "gsd_autonomous stops on the first hard failure (subagent spawn/run error, no PLAN produced, or VERIFICATION status not 'passed'), records the failing phase + step, and reports the resume command /gsd-autonomous (D-09/D-11)."
    - "gsd_autonomous never calls gsd_ship, never runs milestone lifecycle, and never mutates STATE loop position itself beyond what the invoked step tools already do (D-04/D-10)."
  artifacts:
    - path: "lib/autonomous.js"
      provides: "the full autonomous orchestration: auto-CONTEXT writer, per-phase autopilot prompt, verify-status readback, per-phase STATUS accumulation, hard-failure stop, ROADMAP re-read, and the banner report"
      min_lines: 170
      exports: ["buildAutoContext", "buildAutopilotPrompt", "discoverPhases"]
  key_links:
    - from: "lib/autonomous.js"
      to: "lib/_runner.js"
      via: "spawnSubagent(ctx, exec, { label, promptText }) spawns the per-phase autopilot (D-03); the fresh child shares the cordis ctx so all gsd_* tools are callable"
      pattern: "spawnSubagent"
    - from: "lib/autonomous.js"
      to: "lib/_git-artifacts.js"
      via: "ensurePhaseBranch(cwd, n) before the auto-CONTEXT write and commitArtifacts(cwd, n, { scope: 'autonomous', phaseName }) afterwards (D-06 / Risk R2)"
      pattern: "ensurePhaseBranch"
    - from: "lib/autonomous.js"
      to: "lib/state.js"
      via: "s.readArtifact(cwd, n, 'VERIFICATION') + parseFrontmatter to read the verify status; s.hasArtifact for the skip-discuss guard"
      pattern: "readArtifact"
---
<objective>
Implement the full autonomous orchestration in lib/autonomous.js: for every remaining incomplete phase of the active milestone (in numeric order, re-reading ROADMAP after each), ensure a minimal CONTEXT.md exists (auto-deriving and committing it on phase-<N> when absent), spawn one fresh-context autopilot subagent that runs discuss/plan/execute/verify inline, read the VERIFICATION status back into a per-phase STATUS, and stop on the first hard failure with a banner report plus the /gsd-autonomous resume command. This delivers GAP-15 (D-03/D-04/D-05/D-06/D-07/D-08/D-09/D-10/D-11). No ship, no lifecycle, no STATE mutation by the tool itself.
</objective>

<context>
@lib/autonomous.js
@lib/_runner.js
@lib/_git-artifacts.js
@lib/discuss.js
@lib/verify.js
@lib/milestone-audit.js
@lib/state.js
@lib/_shared.js
@lib/plan.js
</context>

<tasks>
  <!-- TRACER within this plan: the auto-derived minimal CONTEXT builder + write path (D-05/D-06) -->
  <task type="auto">
    <name>Task 1: Add buildAutoContext pure helper + the auto-CONTEXT ensure/write path (branch acquire + artefact commit)</name>
    <files>lib/autonomous.js</files>
    <read_first>lib/autonomous.js, lib/discuss.js, lib/_git-artifacts.js, lib/state.js, lib/_shared.js</read_first>
    <action>In lib/autonomous.js, add an exported pure helper buildAutoContext(phase) accepting { n, name, goal, requirements } and returning a schema-faithful CONTEXT.md string (mirror the block skeleton at lib/discuss.js:166-221, but auto-derived per D-05). The text MUST contain, in order: a header line `# Phase ${zeroPad(n)}: ${name} - Context`; a `**Gathered:** <iso>` (nowIso()); the exact line `**Mode: Auto-generated (discuss skipped — autonomous path)**`; `**Status:** Ready for planning`; a `<domain>` block with `## Phase Boundary`, `**In scope:** ${goal}`, `**Out of scope:** (not specified)`; a `<decisions>` block with `## Decisions` and a single `### Claude's Discretion` containing one line "The executor has full discretion over implementation choices for this auto-generated phase."; a `<canonical_refs>` block with `## Canonical References` and the placeholder line "Auto-generated phase — no external specs; requirements captured in ROADMAP."; a `<code_context>` block with `## Code Context` and a single line "(none identified)"; a `<specifics>` block with `## Specifics` and "(none)"; a `<deferred>` block with `## Deferred Ideas` and "(none)"; and the footer `*Phase: ${zeroPad(n)}-${slugify(name)}*`. Import nowIso, zeroPad, slugify from "./_shared.js" if not already imported. Add a non-exported async helper ensureAutoContext(cwd, s, ctx, phase, exec) that: (a) if await s.hasArtifact(cwd, phase.n, "CONTEXT") is true, returns { wrote: false }; (b) otherwise calls ensurePhaseBranch(cwd, phase.n) to acquire phase-<N> (settling Risk R2 — treat any thrown error as a hard failure by rethrowing), writes the CONTEXT via s.writeArtifact(cwd, phase.n, "CONTEXT", buildAutoContext(phase)), calls commitArtifacts(cwd, phase.n, { scope: "autonomous", phaseName: phase.name }), and returns { wrote: true, path }.</action>
    <verify>node --input-type=module -e "import('./lib/autonomous.js').then(m=>{const t=m.buildAutoContext({n:50,name:'add-tests',goal:'add tests',requirements:['GAP-16']}); if(!t.includes('Mode: Auto-generated')) throw new Error('no mode header'); if(!t.includes('add tests')) throw new Error('no goal'); console.log('ok', t.length);})"</verify>
    <acceptance_criteria>
      - `grep -c "buildAutoContext" lib/autonomous.js` matches and it is `export function buildAutoContext`
      - the node -e probe prints "ok" and a positive length
      - `grep "Mode: Auto-generated" lib/autonomous.js` matches
      - `grep "ensurePhaseBranch" lib/autonomous.js` matches
      - `grep "commitArtifacts" lib/autonomous.js` matches
    </acceptance_criteria>
    <done>buildAutoContext returns a schema-faithful minimal CONTEXT with the auto-generated mode header and the goal as in_scope; ensureAutoContext acquires phase-<N>, writes the artefact, and commits it, returning wrote:false when a CONTEXT already exists.</done>
  </task>

  <task type="auto">
    <name>Task 2: Add buildAutopilotPrompt helper + the single-phase dispatch (spawn the autopilot + verify-status readback)</name>
    <files>lib/autonomous.js</files>
    <read_first>lib/autonomous.js, lib/_runner.js, lib/verify.js, lib/plan.js</read_first>
    <action>In lib/autonomous.js, add an exported pure helper buildAutopilotPrompt({ base, phaseNum, phaseName }) returning a self-contained instruction string for the per-phase autopilot. It MUST: name the one phase by number (phaseNum) and by its artefact base (base, e.g. "GSD-50-add-tests" — the <base> from s.phaseDirAndBase); instruct the agent to call gsd_discuss on the phase ONLY IF no CONTEXT.md exists yet, telling it to re-check with gsd_status / hasArtifact rather than trust a note, then gsd_plan, then gsd_execute, then gsd_verify, in that order, for this one phase; include an explicit guard list, exactly the three items "do not call gsd_autonomous (no recursion)", "do not call gsd_ship", and "do not run any milestone-lifecycle tool" (D-04/D-10 — a child spawns without a toolFilter per RESEARCH, so the prompt is the only recursion/ship/lifecycle defence); and end by reporting the resulting VERIFICATION.md status. Add a non-exported async helper drivePhase(cwd, s, ctx, exec, phase, roadmap): (a) await ensureAutoContext(...); (b) const { base, dir } = await s.phaseDirAndBase(cwd, phase.n); (c) build promptText = buildAutopilotPrompt({ base, phaseNum: phase.n, phaseName: phase.name }) and call spawnSubagent(ctx, exec, { label: `autonomous phase ${phase.n}`, promptText: promptText }) from "./_runner.js"; return { ok: true, subagentOutput: r.output } on success; on a thrown error from spawnSubagent return { ok: false, step: "autopilot", reason: e.message }. Then add a non-exported helper readVerifyStatus(cwd, s, phaseNum) that reads s.readArtifact(cwd, phaseNum, "VERIFICATION") (catch ""), returns { status: "missing" } when it is falsy, else parseFrontmatter(text).frontmatter.status || "missing" (mirror lib/verify.js:110-117 / lib/milestone-audit.js:128-137). Do NOT issue the verify tool's routing (deferred per D-09).</action>
    <verify>node --input-type=module -e "import('./lib/autonomous.js').then(m=>{const t=m.buildAutopilotPrompt({base:'GSD-50-add-tests',phaseNum:50,phaseName:'add-tests'}); for(const x of ['gsd_discuss','gsd_plan','gsd_execute','gsd_verify','GSD-50-add-tests']) if(!t.includes(x)) throw new Error('missing '+x); console.log('ok');})"</verify>
    <acceptance_criteria>
      - `grep -c "buildAutopilotPrompt" lib/autonomous.js` matches and it is `export function buildAutopilotPrompt`
      - the node -e probe prints "ok"
      - `grep "no recursion" lib/autonomous.js` matches (the buildAutopilotPrompt recursion guard)
      - `grep "gsd_ship" lib/autonomous.js` matches (the explicit ship forbiddance in the prompt text)
      - `grep "milestone-lifecycle" lib/autonomous.js` matches (the lifecycle forbiddance)
      - `grep "spawnSubagent" lib/autonomous.js` matches
      - `grep "readVerifyStatus" lib/autonomous.js` matches
      - `grep "phaseDirAndBase" lib/autonomous.js` matches
    </acceptance_criteria>
    <done>buildAutopilotPrompt names the phase, names its base, instructs the exact inline gsd_discuss→gsd_plan→gsd_execute→gsd_verify sequence for that one phase (skip-discuss via hasArtifact), and carries the explicit recursion/ship/lifecycle guard list ("do not call gsd_autonomous (no recursion)", "do not call gsd_ship", "do not run any milestone-lifecycle tool"); drivePhase spawns the fresh-context autopilot via spawnSubagent and readVerifyStatus returns the VERIFICATION status with a "missing" fallback.</done>
  </task>

  <task type="auto">
    <name>Task 3: Implement the multi-phase orchestration driver — discovery loop, ROADMAP re-read, per-phase STATUS, hard-failure stop, banner report</name>
    <files>lib/autonomous.js</files>
    <read_first>lib/autonomous.js, lib/_shared.js, lib/graphify.js</read_first>
    <action>In lib/autonomous.js, replace the plan-01 stub non-empty branch of the gsd_autonomous execute so it runs the full driver. Extract the orchestration into a non-exported async helper runAutonomous(cwd, s, ctx, exec) returning a plain object. Within it: (1) const roadmap = await s.readRoadmap(cwd); if (!roadmap) throw as in plan 01; (2) const milestoneName = roadmap.milestoneName || (await s.readState(cwd)).frontmatter?.milestone_name || "milestone"; (3) let remaining = discoverPhases(roadmap); if (remaining.length === 0) return { milestone: milestoneName, phases: [], outcome: "nothing_to_do" }. IMPORTANT — incomplete-marker semantics (reconciles D-07 with the plan-01 discoverPhases filter `status !== "Complete"`): D-07 phrases the filter as `phase_complete !== true`; the driver deliberately implements it as ROADMAP phase `status !== "Complete"` (the ROADMAP shipped marker per RESEARCH). This is the intended definition for this phase goal ("all remaining incomplete phases"), so do NOT change discoverPhases to read STATE's `phase_complete` — a phase that passed verify but is not yet shipped still has ROADMAP status !== "Complete" and is intentionally re-driven through discuss→plan→execute→verify. Add this reconciliation as a short code comment directly above the discoverPhases call so future agents do not "correct" the filter into a divergence. (4) maintain an array statuses = []; iterate remaining in ascending n; for each phase: call ensureAutoContext (if it throws, record stopReason naming phase + step "branch/context" and break), then drivePhase (if !res.ok, record stopReason "autopilot" naming phase + break), then readVerifyStatus; push { number: phase.n, name: phase.name, status: "passed" | "failed" } where failed is the non-passed value or "missing"; if an execution-error or a verify status !== "passed" occurs, set stopReason (naming the phase + step), set outcome "stopped", and break WITHOUT driving any later phase (D-09); otherwise after each successful phase, call roadmap = await s.readRoadmap(cwd) and remaining = discoverPhases(roadmap) to pick up inserted phases before the next iteration (D-07); (5) return { milestone: milestoneName, phases: statuses, outcome, stopReason }. In execute, call runAutonomous and render a banner-style string report (D-11): a header line "Autonomous run — milestone <name>", then per-phase lines "- Phase <n> (<name>): <status>", then an overall outcome line (completed | stopped | nothing_to_do), and when outcome === "stopped" an "outcome: stopped" line plus a "stop reason: <reason>" line and a final "resume: /gsd-autonomous" line. Return that string. Do NOT call setActivePhase and do NOT mutate STATE loop position (D-10). Do NOT call gsd_ship or milestone-audit/validate/code-review/ui-review (D-04/deferred).</action>
    <verify>node --input-type=module -e "import('./lib/autonomous.js').then(m=>{if(typeof m.discoverPhases!=='function') throw new Error('missing discoverPhases'); const d=m.discoverPhases({phases:[{n:2,status:'Complete'},{n:3,status:'pending'},{n:1,status:'pending'}]}); if(JSON.stringify(d.map(p=>p.n))!=='[1,3]') throw new Error('bad order '+JSON.stringify(d)); console.log('ok');})"</verify>
    <acceptance_criteria>
      - `grep "runAutonomous" lib/autonomous.js` matches
      - `grep "readRoadmap" lib/autonomous.js` matches (≥2 — initial read + re-read inside the loop)
      - `grep "to-do\|nothing to do" lib/autonomous.js` matches the nothing_to_do path
      - `grep "resume: /gsd-autonomous" lib/autonomous.js` matches
      - the node -e probe prints "ok" (discoverPhases orders [1,3] and filters Complete)
      - `grep -c "setActivePhase" lib/autonomous.js` returns 0
      - `grep -cE "gsd_ship\((?!\.)|\bgsd_ship\b.*execute|call\(\s*'gsd_ship'" lib/autonomous.js` returns 0 — gsd_ship appears ONLY inside the buildAutopilotPrompt forbiddance string, never as an executable tool call
    </acceptance_criteria>
    <done>The execute drives every incomplete phase end-to-end (single autopilot subagent per phase), re-reads ROADMAP between phases, accumulates a per-phase STATUS, stops on the first hard failure with a banner + resume command, and never ships, runs lifecycle, or mutates STATE.</done>
  </task>
</tasks>

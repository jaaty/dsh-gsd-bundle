---
phase: 53-smart-entry
plan: 01
type: execute
wave: 1
depends_on: []
files_modified: ["lib/_next.js", "test/_next.test.mjs"]
autonomous: true
requirements: ["CLH-02", "CLH-03"]
user_setup: []
must_haves:
  truths:
    - "classifyNextState is pure: it takes a gathered snapshot + capability descriptors and returns { branch, recommendation, mutation } with no ctx/fs/I/O."
    - "The classifier recognises all six states in the D-04 precedence order and returns on the first match."
    - "Branch 5 returns a mutation descriptor { setActivePhase: { phaseNum, step } } where step is 'discuss' (or 'spec' when the gsdSpec capability is present); every other branch returns mutation: null."
    - "Branch 4 falls through to branch 5 when the active phase ROADMAP status is 'Complete' or STATE.status is 'done' (D-07), never recommending a no-op."
    - "Routing is capability-aware (D-06): each routed command is gated on its capability descriptor's presence; an absent capability degrades to a generic 'run gsd_status to orient' fallback that never names the missing tool."
    - "renderNextRecommendation turns a classified branch into human-facing text that names the command to invoke next but never claims to auto-run it (D-02)."
  artifacts:
    - path: "lib/_next.js"
      provides: "Pure, side-effect-free six-branch state classifier classifyNextState(snapshot, descriptors) plus renderNextRecommendation(result). No ctx, no fs, no I/O."
      min_lines: 90
      exports: ["classifyNextState", "renderNextRecommendation"]
    - path: "test/_next.test.mjs"
      provides: "Unit tests across the full six-branch state matrix, precedence, D-07 fall-through, and capability-aware degradation, modeled on test/autonomous.test.mjs pure-helper assertions."
      min_lines: 120
      exports: []
  key_links:
    - from: "lib/_next.js"
      to: "lib/_render.js"
      via: "classifyNextState imports effectiveRoutableStep (and loopSteps/capabilityKeyForNextAction transitively) to route the mid-phase branch through the single source of truth"
      pattern: "import\\s*\\{[^}]*effectiveRoutableStep[^}]*\\}\\s*from\\s*\"\\./_render\\.js\""
---

<objective>Deliver the pure, side-effect-free state classifier and recommendation renderer that gsd_next's execute path will call (D-03). This plan produces lib/_next.js with classifyNextState(snapshot, descriptors) → { branch, recommendation, mutation } and renderNextRecommendation(result), plus a complete unit-test matrix across the six D-04 branches, precedence, the D-07 fall-through, and capability-aware degradation. No ctx, no fs, no I/O, no STATE mutation — that lives in plan 02 (wave 2), which depends on this plan.</objective>

<context>@lib/_render.js @lib/_capabilities.js @lib/state.js @lib/milestone-audit.js @lib/pause-resume.js @test/autonomous.test.mjs</context>

<tasks>
  <task type="auto">
    <name>Task 1 (tracer): classifyNextState skeleton for branch 1 (no project) + branch 4 (mid-phase) plus renderNextRecommendation, with the first passing tests</name>
    <files>lib/_next.js, test/_next.test.mjs</files>
    <read_first>lib/_render.js, lib/_capabilities.js, lib/state.js, test/autonomous.test.mjs, lib/pause-resume.js</read_first>
    <action>Create lib/_next.js. Export `classifyNextState(snapshot, descriptors)` and `renderNextRecommendation(result)`. Define a `BRANCH` constant object with ids for the six branches (e.g. NO_PROJECT, CORRUPT, PAUSED, MID_PHASE, PHASE_SHIPPED_NEXT, MILESTONE_COMPLETE). Purity convention for this module: never use the literal token `ctx` anywhere in lib/_next.js — not as a parameter, identifier, or in any JSDoc/comment (refer to the gathered input as `snapshot`; if you must reference "context" in prose, spell it out in full). Define the snapshot contract in a JSDoc block: snapshot = { hasProject: boolean, state: { frontmatter } | undefined, roadmap: { phases: [{n,name,status}], milestoneName } | undefined, handoff: object|undefined, continueHere: string|undefined, milestoneAudit: { status } | undefined }. Define a capability-presence helper `hasCap(descriptors, key)` that returns true when descriptors contains an entry whose `key` equals `key` (mirroring the descriptor shape from lib/_render.js availableCapabilities). Implement ONLY branch 1 and branch 4 in this tracer task: branch 1 fires when `!snapshot.hasProject` (no .planning markers at all) and returns { branch: NO_PROJECT, recommendation: "gsd_init", mutation: null } — but gate `gsd_init` on the gsdOrient capability via hasCap, degrading to the fallback recommendation "gsd_status" (per D-06/OQ-2) when gsdOrient is absent. NOTE: this gsd_status fallback is only reached when gsdOrient is present — gsd_next is itself registered under gsdOrient, so gsd_status (also a gsdOrient tool) is guaranteed available whenever the classifier runs in the live execute path; the Task 3 test matrix retires only gsdHealth/gsdMilestoneAudit, never gsdOrient, so the never-instruct-a-missing-tool invariant holds in every reachable state. Branch 4 fires when snapshot.state and snapshot.roadmap both exist, snapshot.state.frontmatter.active_phase is set, snapshot.state.frontmatter.status is not "done", and the active phase's ROADMAP status is "pending" — return { branch: MID_PHASE, recommendation: <step>-phase string, mutation: null } where the recommendation is derived by calling `effectiveRoutableStep(snapshot.state.frontmatter.next_action, descriptors)` (imported from lib/_render.js) and mapping the returned descriptor's `step` to `<step>-phase` (e.g. "plan-phase"); when effectiveRoutableStep returns null, use the fallback "gsd_status". renderNextRecommendation(result) returns a single human-facing string that names the recommendation command to invoke next and states it will re-point/inspect state without auto-running (D-02 wording: "Next action: run <recommendation>."). Create test/_next.test.mjs with a describe block importing classifyNextState + renderNextRecommendation, plus two passing tests: (a) no-project snapshot with gsdOrient present → branch NO_PROJECT, recommendation "gsd_init", mutation null; (b) mid-phase snapshot (active_phase "2", status "plan", next_action "plan-phase", active phase pending) with full descriptors → branch MID_PHASE, recommendation "plan-phase", mutation null. Use fabricated descriptor arrays matching buildCapability output (import buildCapability from lib/_capabilities.js and build a representative loop set: gsdDiscuss, gsdPlan, gsdExecute, gsdVerify, gsdShip, plus gsdOrient). Per D-03.</action>
    <verify>cd /var/home/jatyeo/dev/dsh-gsd-bundle && node --test test/_next.test.mjs 2>&1 | tail -5</verify>
    <acceptance_criteria>
      - grep -q 'export function classifyNextState' lib/_next.js
      - grep -q 'export function renderNextRecommendation' lib/_next.js
      - grep -q 'effectiveRoutableStep' lib/_next.js
      - grep -q 'hasCap' lib/_next.js
      - node --test test/_next.test.mjs exits 0
      - lib/_next.js contains no `ctx` identifier or token anywhere — including JSDoc and comments (refer to the snapshot parameter as `snapshot` and never abbreviate `context` as `ctx`; verify with `grep -nE '\bctx\b' lib/_next.js` returning no match), no `require("fs")`, no `import` of `node:fs`, and no `await` (pure, no I/O)
    </acceptance_criteria>
    <done>lib/_next.js exports classifyNextState + renderNextRecommendation, handles branches 1 and 4, and test/_next.test.mjs passes with the two tracer tests.</done>
  </task>

  <task type="auto">
    <name>Task 2: complete the six-branch classifier with precedence, D-07 fall-through, branch-5 mutation descriptor, and milestone-complete routing</name>
    <files>lib/_next.js</files>
    <read_first>lib/_next.js, lib/_render.js, lib/state.js, lib/milestone-audit.js, .planning/phases/GSD-53-smart-entry/GSD-53-smart-entry-01-PLAN.md</read_first>
    <action>Extend classifyNextState to evaluate all six branches in the exact D-04 precedence order, returning on the first match. Branch 2 (CORRUPT): fires when `snapshot.hasProject` is true but `snapshot.state` is undefined OR `snapshot.roadmap` is undefined (i.e. .planning exists but STATE.md or ROADMAP.md is missing/unparseable) — return { branch: CORRUPT, recommendation: "gsd_health", mutation: null }, gated on the gsdHealth capability (degrade to "gsd_status" fallback when absent); per D-04 the classifier must NOT mutate STATE and must NOT guess. Branch 3 (PAUSED): fires when `snapshot.handoff` is truthy OR `snapshot.continueHere` is not undefined — return { branch: PAUSED, recommendation: "gsd_resume_work", mutation: null }, gated on gsdOrient (degrade to fallback); per D-05 this short-circuits before mid-phase and never re-points STATE. Branch 4 (MID_PHASE): already implemented in Task 1, BUT add the D-07 fall-through: if the active phase's ROADMAP status is "Complete" OR snapshot.state.frontmatter.status === "done", do NOT match branch 4 — fall through to branch 5. Branch 5 (PHASE_SHIPPED_NEXT): fires when pending phases remain (i.e. `snapshot.roadmap.phases.some(p => p.status === "pending")`) and we did not match branch 4 — compute `nextPhaseNum = Math.min(...pendingPhases.map(p => p.n))`, choose `step = hasCap(descriptors, "gsdSpec") ? "spec" : "discuss"` (per D-08, mirroring the spec-first ordering), and return { branch: PHASE_SHIPPED_NEXT, recommendation: `<step>-phase`, mutation: { setActivePhase: { phaseNum: nextPhaseNum, step } }, nextPhase: nextPhaseNum }; gate the recommendation's loop-step capability presence via effectiveRoutableStep (if the chosen step's capability is absent, still return the mutation descriptor but set recommendation to the effectiveRoutableStep result or the fallback). Branch 6 (MILESTONE_COMPLETE) (per D-09): fires when `snapshot.roadmap.phases.every(p => p.status === "Complete")` — if `snapshot.milestoneAudit` exists and its `status` === "ready-to-close", return { branch: MILESTONE_COMPLETE, recommendation: "gsd_new_milestone", mutation: null }; otherwise return { branch: MILESTONE_COMPLETE, recommendation: "gsd_milestone_audit", mutation: null }. Gate gsd_new_milestone on gsdOrient and gsd_milestone_audit on gsdMilestoneAudit (degrade each to the fallback when absent). Ensure precedence is structural: evaluate 1 → 2 → 3 → 4 → 5 → 6 top-down and return on first match. Add a `classifyNextState` JSDoc documenting the precedence and the snapshot fields. Keep the module pure (no ctx/fs/I/O). NOTE on the gsd_status fallback used across branches 2/3/5/6: it is only reached when the gating capability is absent but gsdOrient is present (gsd_next is registered under gsdOrient, so gsd_status is guaranteed available in the live execute path); the test matrix retires only gsdHealth/gsdMilestoneAudit, never gsdOrient, so the never-instruct-a-missing-tool invariant holds in every reachable state.</action>
    <verify>cd /var/home/jatyeo/dev/dsh-gsd-bundle && node --test test/_next.test.mjs 2>&1 | tail -5</verify>
    <acceptance_criteria>
      - grep -q 'MILESTONE_COMPLETE' lib/_next.js
      - grep -q 'PHASE_SHIPPED_NEXT' lib/_next.js
      - grep -q 'ready-to-close' lib/_next.js
      - grep -q 'gsdSpec' lib/_next.js
      - grep -q 'setActivePhase' lib/_next.js
      - lib/_next.js still contains no `ctx` token anywhere (grep -nE '\bctx\b' returns no match), no `node:fs`, and no `await`
    </acceptance_criteria>
    <done>classifyNextState handles all six branches with D-04 precedence, D-07 fall-through, branch-5 mutation descriptor (spec/discuss per capability), and milestone-complete audit-aware routing.</done>
  </task>

  <task type="auto">
    <name>Task 3: complete the unit-test matrix — all six branches, precedence ordering, D-07 fall-through, and capability-aware degradation</name>
    <files>test/_next.test.mjs</files>
    <read_first>test/_next.test.mjs, lib/_next.js, test/autonomous.test.mjs, lib/_capabilities.js</read_first>
    <action>Extend test/_next.test.mjs to cover the full state matrix from RESEARCH §4.1. Build a `fullDescriptors()` helper using buildCapability for the loop + orient + health + milestoneAudit + spec capabilities, and a `without(descriptors, key)` helper that filters out one capability to simulate retirement. Add tests: (1) branch 2 corrupt — hasProject true, state undefined, roadmap present → recommendation "gsd_health", mutation null. (2) branch 2 corrupt — state present, roadmap undefined → same. (3) branch 3 paused — handoff object present → recommendation "gsd_resume_work", mutation null, even when a mid-phase active_phase is also set (precedence 3 before 4). (4) branch 3 paused — continueHere string present (handoff undefined) → same. (5) branch 5 phase-shipped — all phases Complete except phase 3 pending, active_phase null/idle → mutation { setActivePhase: { phaseNum: 3, step: "discuss" } }, recommendation "discuss-phase". (6) branch 5 with gsdSpec present → step "spec", recommendation "spec-phase". (7) branch 5 with gsdSpec retired (without(full, "gsdSpec")) → step "discuss". (8) branch 6 milestone-complete, no audit → recommendation "gsd_milestone_audit", mutation null. (9) branch 6 milestone-complete, audit status "ready-to-close" → recommendation "gsd_new_milestone", mutation null. (10) D-07 fall-through — active_phase set, status "done", pending phases remain → branch PHASE_SHIPPED_NEXT (not MID_PHASE). (11) D-07 fall-through — active_phase set, status "plan", but active phase ROADMAP status "Complete" → branch PHASE_SHIPPED_NEXT. (12) precedence: no-project snapshot with everything else set → branch NO_PROJECT (1 wins). (13) precedence: hasProject true + state undefined + handoff present → branch CORRUPT (2 wins over 3). (14) capability degradation: retire gsdHealth (without(full,"gsdHealth")) on a corrupt snapshot → recommendation is the fallback "gsd_status", never "gsd_health". (15) capability degradation: retire gsdMilestoneAudit on milestone-complete-no-audit → recommendation fallback "gsd_status", never "gsd_milestone_audit". (16) renderNextRecommendation returns a string containing the recommendation command and the literal "Next action:" prefix and never the word "auto-run". Also assert classifyNextState never throws on a fully-empty snapshot (all fields undefined) and returns branch NO_PROJECT. All assertions use assert.equal/deepEqual from node:assert/strict.</action>
    <verify>cd /var/home/jatyeo/dev/dsh-gsd-bundle && node --test test/_next.test.mjs 2>&1 | tail -5</verify>
    <acceptance_criteria>
      - node --test test/_next.test.mjs exits 0 and the suite reports >= 18 tests
      - grep -c 'test(' test/_next.test.mjs returns >= 18
      - grep -q 'ready-to-close' test/_next.test.mjs
      - grep -q 'gsdSpec' test/_next.test.mjs
      - grep -q 'without(' test/_next.test.mjs
      - cd /var/home/jatyeo/dev/dsh-gsd-bundle && node --test test/_next.test.mjs 2>&1 | grep -q 'tests [0-9]* pass'
    </acceptance_criteria>
    <done>test/_next.test.mjs covers all six branches, precedence (1>2>3>4>5>6), D-07 fall-through, capability retirement degradation, and renderNextRecommendation wording, and the full suite passes.</done>
  </task>
</tasks>
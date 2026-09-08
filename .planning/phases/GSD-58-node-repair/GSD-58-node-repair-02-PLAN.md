---
phase: 58-node-repair
plan: 02
type: execute
wave: 2
depends_on: ["GSD-58-node-repair-01"]
files_modified:
  - lib/verify.js
  - lib/autonomous.js
  - test/autonomous.test.mjs
  - test/tools.test.mjs
autonomous: true
requirements: ["CLH-08"]
user_setup: []
must_haves:
  truths:
    - "gsd_verify's gaps_found route text names gsd_repair as the recommended next action (tool description + route table + header comment all updated) and gsd_verify never invokes repair itself — it stays recommend-only (D-02)."
    - "gsd_autonomous, on a gaps_found verify status, runs bounded repair rounds through the shared runRepairRounds helper (same 2-round default budget, no override) and CONTINUES the milestone when the phase recovers to passed (D-09)."
    - "gsd_autonomous hard-stops with a stopReason carrying the REAL cause when the phase is still non-passed: the remaining gaps and the exhausted repair budget when the shared budget is genuinely exhausted, or the repair stop's real cause folded in verbatim (including any surfaced GSD_AWAITING_HUMAN marker, so the checkpoint/resume handoff reaches the human) when repair stopped early — phase 49's D-09 final-stop semantics preserved (D-09/D-07/D-11/P5)."
    - "human_needed and missing VERIFICATION statuses in autonomous still stop immediately with the existing stopReason text and zero repair delegate calls (D-04)."
    - "buildAutopilotPrompt is byte-unchanged: repair is driver-side and in-process, so the autopilot child never calls gsd_repair and the prompt needs no new guard text (D-09/OQ-8)."
  artifacts:
    - path: lib/verify.js
      provides: "The re-pointed gaps_found routing (route table entry + description fragment + header comment) recommending gsd_repair"
      min_lines: 148
      exports: ["name", "inject", "apply", "runMempalaceCaptureOnVerify"]
    - path: lib/autonomous.js
      provides: "The gaps_found → runRepairRounds wiring between readVerifyStatus and the non-passed stop, with budget-exhaustion, real-cause early-stop folding, and recovery branches"
      min_lines: 355
      exports: ["name", "inject", "apply", "discoverPhases", "buildAutoContext", "buildAutopilotPrompt"]
    - path: test/autonomous.test.mjs
      provides: "The rewritten (f) budget-exhaustion test, a new recovery variant, a new early-stop real-cause variant, and the preserved missing-VERIFICATION stop test with a zero-repair assertion"
      min_lines: 400
      exports: []
  key_links:
    - from: lib/autonomous.js
      to: lib/repair.js
      via: "import { runRepairRounds, REPAIR_ROUND_BUDGET } from './repair.js' — one-way only; lib/repair.js never imports autonomous.js (OQ-4, no cycle)"
      pattern: 'import\s*\{[^}]*runRepairRounds[^}]*\}\s*from\s*"\./repair\.js"'
    - from: lib/verify.js
      to: "the gsd_repair tool surface (named in routing text only)"
      via: "Recommend-only route text naming gsd_repair; no import of ./repair.js and no findTool lookup for gsd_repair (D-02)"
      pattern: 'gsd_repair'
    - from: lib/autonomous.js
      to: test/autonomous.test.mjs
      via: "The (f) test asserts the repair delegates actually spawn (planner/execute/verify labels plus round 1's plan-research researcher spawn — the harness seeds no RESEARCH.md) before the budgeted stop; the recovery test asserts the loop continues after a passed re-verify; the early-stop variant asserts the driver folds repair's real cause (marker verbatim) instead of mislabeling it as budget exhaustion"
      pattern: 'repair'
---

<objective>
Wire the repair orchestrator into the loop's routing surfaces without touching its machinery: re-point gsd_verify's gaps_found routing text to recommend gsd_repair (recommend-only, D-02), and rewire gsd_autonomous so a gaps_found phase runs the shared bounded repair loop (plan 01's runRepairRounds) before its final stop — continuing on recovery, hard-stopping with the real cause (budget exhaustion OR a folded early-stop cause) and leaving human_needed/missing stops untouched (D-09, D-11).
</objective>

<context>
@.planning/phases/GSD-58-node-repair/GSD-58-node-repair-CONTEXT.md
@.planning/phases/GSD-58-node-repair/GSD-58-node-repair-RESEARCH.md
@lib/verify.js
@lib/autonomous.js
@lib/repair.js
@lib/_shared.js
@test/autonomous.test.mjs
@test/tools.test.mjs
@test/helpers/project.mjs
@test/helpers/mount-harness.mjs
</context>

<tasks>
  <task type="auto">
    <name>Task 1: Re-point gsd_verify's gaps_found routing text at gsd_repair (D-02, recommend-only)</name>
    <files>lib/verify.js, test/tools.test.mjs</files>
    <read_first>.planning/phases/GSD-58-node-repair/GSD-58-node-repair-CONTEXT.md (D-02 verbatim), lib/verify.js (header comment at 1-7, tool description at 46-48, route table at 126-130), test/tools.test.mjs (makeSubagents label-keyed fakes at 117-207, flag patterns like EXEC_CHECKPOINT_MODE at 32-41, and the gsd_verify describe block), test/helpers/project.mjs (VERIFICATION_GAPS fixture at 83-88)</read_first>
    <action>
Update the three gaps_found routing surfaces in lib/verify.js — recommend-only, never auto-repair (D-02):
- Header comment (lines 1-7): change the route sentence so gaps_found reads: gaps_found -> recommend gsd_repair (bounded automatic repair rounds) or manual gsd_plan --gaps closure. Leave the passed and human_needed wording intact.
- Tool description (~line 48): replace the fragment "gaps_found -> re-plan with gsd_plan --gaps" with "gaps_found -> recommend gsd_repair (bounded repair rounds) or re-plan manually with gsd_plan --gaps".
- Route table (~line 128): rewrite the gaps_found entry so it names gsd_repair first, e.g.: `✗ Phase ${args.phase}: gaps found (score ${score || "n/a"}). Next: gsd_repair on phase ${args.phase} to run bounded automatic recovery rounds (gsd_plan --gaps → gsd_execute --gaps-only → gsd_verify --gaps), or produce fix plans manually with gsd_plan --gaps.` Exact wording is discretion; the string MUST contain the literal tool name gsd_repair and MUST remain advisory (verify still just routes — the human or a wrapper invokes repair).
- Non-negotiable boundaries (D-02): lib/verify.js must NOT import the repair module, must NOT look the repair tool up, must NOT run repair rounds, and must not write REPAIR.md or call commitArtifacts a second time. The only change is routing text.
- test/tools.test.mjs: in the gsd_verify describe, add a test that drives gsd_verify against a seeded gaps outcome and asserts the recommendation: add a VERIFY_GAPS_MODE flag next to the existing EXEC_CHECKPOINT_MODE flag pattern so the label-keyed fake verify writes VERIFICATION_GAPS (from test/helpers/project.mjs) instead of VERIFICATION_PASSED when set; seed it, run gsd_verify on the phase, and assert the returned route text matches /gsd_repair/. Add a companion negative behavioural assertion that the output does NOT claim repair was performed (assert.doesNotMatch on a /repair (complete|rounds run|round\(s\) run)/-style success phrasing — the route must recommend, not report execution). Add a static-source assertion in the same file (readFile of lib/verify.js, the test/phase-tools-git.test.mjs idiom): lib/verify.js must NOT import the repair module and must NOT look the repair tool up — proving verify stays recommend-only.
- Comment discipline for the greps below: keep the D-02 boundary phrasing out of lib/verify.js comments — write "recommend-only, no repair imports" rather than quoting the forbidden import/lookup strings, so the equals-0 grep on the repair import holds even if a boundary comment paraphrases the rule.
- Do NOT touch lib/_route.js (the "repair" phrase → gsd_health mis-route is a documented deferred follow-up, OQ-5/R5) and do NOT modify any lib/repair.js behaviour.
    </action>
    <verify>node --test test/tools.test.mjs — exit 0.</verify>
    <acceptance_criteria>
      - grep -c "gsd_repair" lib/verify.js is at least 2 (description + route text).
      - grep -c 'from "./repair.js"' lib/verify.js equals 0 (recommend-only — D-02; boundary phrasing stays out of comments).
      - node --test test/tools.test.mjs exits 0, including the new gaps-route test asserting /gsd_repair/ and the static no-import assertion.
      - The existing no-fix-plan guard assertion in the plan tests (/--gaps-only would run nothing/, test/tools.test.mjs ~line 634) is untouched and still passes.
    </acceptance_criteria>
    <done>gsd_verify's gaps_found route (text + description + header comment) recommends gsd_repair; verify performs no auto-repair and no repair imports.</done>
  </task>

  <task type="auto">
    <name>Task 2: Rewire gsd_autonomous through the shared repair loop (D-09/D-11)</name>
    <files>lib/autonomous.js, test/autonomous.test.mjs</files>
    <read_first>lib/autonomous.js (runAutonomous post-phase block at 266-282, readVerifyStatus at 184-194, buildAutopilotPrompt at 139-156), lib/repair.js (runRepairRounds + REPAIR_ROUND_BUDGET exports, the structured result shape { recovered, roundsRun, finalStatus, stopReason, report }, and the plan-01 stop-classification contract: the budget-exhaustion cause contains "repair budget exhausted", early-stop causes never do), test/autonomous.test.mjs (mountAutonomous at 83-150, test (f) at 311-331, missing-VERIFICATION test at 333-346), test/tools.test.mjs (makeSubagents label-keyed pattern at 117-207), test/helpers/project.mjs (FENCED_PLAN carries gap_closure: true — reusable fix-plan fixture)</read_first>
    <action>
Rewire the autonomous driver onto the shared repair loop — driver-side, in-process, same shared implementation (D-08/D-09):
- lib/autonomous.js: add import { runRepairRounds, REPAIR_ROUND_BUDGET } from "./repair.js" (one-way — lib/repair.js must never import autonomous.js; OQ-4). In runAutonomous, between the readVerifyStatus call (~line 269) and the non-passed stop: when status is exactly "gaps_found", attempt bounded repair — wrap in try/catch so ANY failure (a thrown delegate error, including a missing gsd_plan/gsd_execute/gsd_verify tool from findTool's fail-loud guard, or a repair-module fault) becomes a hard stop with stopReason "Phase N: repair failed — <cause>" rather than an uncaught throw: const repair = await runRepairRounds({ cwd, s, ctx, exec, phaseNum: phase.n, phaseName: phase.name, gitFn: ctx.gitFn }) — pass NO rounds override so the shared default budget of 2 applies (D-03/D-07). Then re-read the status authoritatively via readVerifyStatus (never trust the report string — artefact state is the oracle, same discipline as §1.5 of RESEARCH): if it now reads "passed", push the phase status as passed (optionally annotated with the repair rounds used) and CONTINUE the phase loop — the ROADMAP re-read at step (4) proceeds unchanged (D-09). If the re-read is still non-passed, classify the stop by repair's cause using the plan-01 designed string contract (the budget-exhaustion cause contains the locked phrase "repair budget exhausted"; every D-11 early-stop cause names its real cause and never contains that phrase): when repair.stopReason exists and does NOT contain that phrase, repair stopped EARLY (no runnable fix plan, a checkpointed execute surfacing the awaiting marker, a no-summary execute, or a mid-round verify human_needed/missing-file/unparseable) — stop with the real cause folded in verbatim: `Phase ${phase.n}: repair stopped early — ${repair.stopReason}`; any awaiting marker line inside repair.stopReason/report reaches the human untouched so the existing gsd_execute answer/decision_id checkpoint/resume handoff still works (D-11/P5) — never relabel an early stop as budget exhaustion and never discard repair.stopReason/report in favour of the stale re-read status alone (the re-read still says gaps_found after an early stop, because the failed round never re-verified). Only when the cause DOES contain the locked phrase (or repair.stopReason is null while finalStatus is still non-passed — defensive), stop with a stopReason that names the remaining gaps and the exhausted budget, e.g. `Phase ${phase.n}: still "${status}" after ${repair.roundsRun} repair round(s) — remaining gaps in VERIFICATION.md (repair budget exhausted)` — phase 49's D-09 final-stop semantics preserved (D-09). When status is "human_needed" or "missing" (or anything else non-passed), keep today's immediate stop with the existing stopReason text — no repair attempt (D-04). Do NOT modify buildAutopilotPrompt (repair is driver-side; the autopilot child never invokes the repair tool — OQ-8). Do NOT touch lib/repair.js itself in this task.
- test/autonomous.test.mjs: extend the integration harness so the repair delegates are real registered tools with label-keyed fakes:
  - Extend mountAutonomous to also apply the plan/execute/verify plugins (import their apply functions) so gsd_plan/gsd_execute/gsd_verify register into ctx.tools — the shared helper resolves them via findTool's Array.isArray branch.
  - Extend makeAutonomousSubagents with label-keyed behaviors mirroring test/tools.test.mjs makeSubagents: a "planner"-labeled spawn writes the gap_closure fix plan (reuse FENCED_PLAN from test/helpers/project.mjs), "plan-checker" returns a pass marker, an "execute"-labeled spawn writes FENCED_SUMMARY (or stops at a checkpoint when a controller flag is set, mirroring the tools.test.mjs EXEC_CHECKPOINT_MODE pattern), and a "verify"-labeled spawn writes VERIFICATION_PASSED or VERIFICATION_GAPS per a controller-sequenced list (e.g. controller.verifyWrites = ["gaps_found", "gaps_found"], consumed in call order). A "plan research"-labeled spawn returns a ≥50-character RESEARCH text (mirroring test/tools.test.mjs:146-147) — REQUIRED, not optional: the autonomous harness seeds no RESEARCH.md (ensureAutoContext, lib/autonomous.js:119-127, writes only CONTEXT.md), so the real gsd_plan delegate spawned by repair round 1 runs the researcher (lib/plan.js:116, label "plan research phase N") and treats any <50-character researcher output as failure ("gsd_plan: researcher returned no usable RESEARCH.md", lib/plan.js:130) — without this branch round 1 stops with the wrong cause and both the rewritten (f) test and the recovery test fail. Note the seeded gaps VERIFICATION for phase p1 comes from the test's own writeArtifact call (as today); the verify-labeled captures come only from the repair rounds' gsd_verify delegate.
  - Rewrite test (f) (~line 311, "verify gaps_found → stopped, resume command, no later phase spawns"): with verifyWrites = ["gaps_found", "gaps_found"] the run must (a) ATTEMPT repair — assert the captured spawn labels include exactly one "plan research"-labeled request (round 1's researcher; round 2 skips it because plan.js writes RESEARCH.md after the researcher returns, lib/plan.js:132), planner-labeled, execute-labeled, and two verify-labeled requests (the shared loop ran both rounds), and (b) still stop after the budget: outcome stopped, stopReason matches /repair/ and /budget|round/, and the "autonomous phase 2" autopilot label never appears (no later phase spawns — the captures.length === 1 assertion is replaced by these stronger ones; P7).
  - Add a recovery variant test: verifyWrites = ["gaps_found", "passed"] → outcome completed, the per-phase STATUS for p1 shows passed, and the driver continued (p2's autopilot spawns — assert an "autonomous phase 2" capture exists), proving D-09 continue-on-recovery.
  - Add an early-stop real-cause variant test (D-11/P5 fidelity): with the execute-checkpoint controller flag set and verifyWrites = ["gaps_found"] (unconsumed — the round stops at execute before verify runs), the run stops after exactly 1 attempted repair round with outcome stopped and a stopReason that matches /stopped early/, includes the verbatim awaitingMarker(...) line (built via lib/_shared.js), and does NOT match /repair budget exhausted/ — proving the driver folds repair's real stop cause (and the marker the human needs for the gsd_execute answer/decision_id checkpoint-resume handoff) instead of mislabeling an early stop as budget exhaustion; the "autonomous phase 2" autopilot label still never appears.
  - Keep the "(f) missing VERIFICATION → stopped" test (line 333) valid and strengthen it: assert NO planner-labeled capture occurs (zero repair delegate calls on human/missing statuses — D-04).
  - Also assert the existing (e) passed-status test and (g)/(h) tests remain green without modification (the rewire must not disturb non-gaps paths).
- Comment discipline for the greps below: never write the repair tool's name in lib/autonomous.js code or comments — refer to "the shared repair helper" / "the repair orchestrator" (the driver calls the helper, not the tool — P6); also keep the budget phrase out of comments (it exists only in the budget-exhaustion stopReason string), so the equals-count greps hold by construction.
    </action>
    <verify>node --test test/autonomous.test.mjs — exit 0.</verify>
    <acceptance_criteria>
      - grep -c 'from "./repair.js"' lib/autonomous.js equals 1 AND grep -c "runRepairRounds" lib/autonomous.js is at least 2.
      - grep -c "gsd_repair" lib/autonomous.js equals 0 (the driver calls the shared helper, not the tool — no recursion surface, P6; the tool name stays out of comments).
      - grep -c "do not call gsd_ship" lib/autonomous.js still equals 1 (buildAutopilotPrompt guard lines byte-unchanged).
      - node --test test/autonomous.test.mjs exits 0 with the rewritten (f) budget-exhaustion test, the new recovery test, the new early-stop real-cause test, and the strengthened missing-VERIFICATION zero-repair assertion.
      - grep -c "repair budget exhausted\|repair round" lib/autonomous.js is at least 1 (the budgeted stop reason names the exhausted rounds).
      - grep -c "stopped early" lib/autonomous.js is at least 1 (the real-cause fold for early stops — D-11/P5).
    </acceptance_criteria>
    <done>Autonomous recovers gaps_found phases through the shared 2-round loop and continues on recovery; it hard-stops with the REAL cause when gaps persist (budget-exhausted wording only on genuine exhaustion, early-stop causes folded in verbatim including any awaiting marker), and human_needed/missing statuses stop immediately without any repair attempt — all proven by the rewritten offline suite.</done>
  </task>
</tasks>
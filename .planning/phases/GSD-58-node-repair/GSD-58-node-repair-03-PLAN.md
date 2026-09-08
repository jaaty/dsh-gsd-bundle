---
phase: 58-node-repair
plan: 03
type: execute
wave: 2
depends_on: ["GSD-58-node-repair-01"]
files_modified:
  - test/repair.test.mjs
autonomous: true
requirements: ["CLH-08"]
user_setup: []
must_haves:
  truths:
    - "The offline suite proves the trigger gate: gaps_found proceeds; passed is a zero-delegate no-op (D-05); human_needed, missing-file, and unparseable each stop with their distinct cause and zero delegate calls (D-04)."
    - "The offline suite proves the delegation contract: one round invokes gsd_plan({ phase, gaps: true }), then gsd_execute({ phase, gapsOnly: true }), then gsd_verify({ phase, gaps: true }) in exactly that order (D-06), and a missing delegate fails loud with the named error (V5)."
    - "The offline suite proves the budget: default 2 rounds; rounds:1 honored; rounds 0/3/non-integer stop before any delegate call (D-03); still-gaps after 2 rounds stops with the exhausted-budget cause (D-07); no stopped round is ever blind-retried (D-11)."
    - "The offline suite proves the oracles and artefacts: a round with no runnable fix plan stops with the plan tool's cause and execute uncalled; a checkpointed execute surfaces the verbatim GSD_AWAITING_HUMAN marker; REPAIR.md is created on round 1, appended per round, and survives a second invocation; the scope-repair commit seam and the no-STATE/no-fork/no-raw-fs static wiring hold (D-10/D-11/D-01/D-08/D-12)."
    - "A full-surface integration test drives gsd_repair through the REAL gsd_plan/gsd_execute/gsd_verify tools on the offline harness and recovers a seeded gaps_found phase to status passed end-to-end (V15)."
  artifacts:
    - path: test/repair.test.mjs
      provides: "Unit/integration coverage for the gsd_repair decisions D-01..D-12 (V1-V10, V13-V15 of RESEARCH §6) on FakeFs with counting fake delegates"
      min_lines: 280
      exports: []
  key_links:
    - from: test/repair.test.mjs
      to: lib/repair.js
      via: "Imports runRepairRounds/readVerificationStatus/REPAIR_ROUND_BUDGET and drives the real gsd_repair tool execute against counting fake + real delegates"
      pattern: 'from "\.\./lib/repair\.js"'
    - from: test/repair.test.mjs
      to: lib/_shared.js
      via: "Uses awaitingMarker() to assert the GSD_AWAITING_HUMAN marker is surfaced verbatim through a checkpointed execute stop (P5)"
      pattern: 'awaitingMarker'
    - from: test/repair.test.mjs
      to: test/helpers/project.mjs
      via: "Reuses buildProject + VERIFICATION_PASSED/VERIFICATION_GAPS + FENCED_PLAN (gap_closure: true) + FENCED_SUMMARY fixtures"
      pattern: 'VERIFICATION_GAPS'
---

<objective>
Prove the phase-58 repair engine offline (RESEARCH §6 validation architecture V1–V10 and V15): a new test/repair.test.mjs covering the trigger gate, rounds validation, strict round order and delegate args, no-fork delegation, per-step artefact oracles (fix-plan runnable check, checkpoint/marker surfacing, verify readback), REPAIR.md accumulation, the scope-repair commit wiring, STATE immobility, and one happy-path end-to-end recovery through the real delegate tools — all on FakeFs with no network, no real git, no LLM.
</objective>

<context>
@.planning/phases/GSD-58-node-repair/GSD-58-node-repair-CONTEXT.md
@.planning/phases/GSD-58-node-repair/GSD-58-node-repair-RESEARCH.md
@lib/repair.js
@lib/_shared.js
@test/tools.test.mjs
@test/helpers/project.mjs
@test/helpers/fake-fs.mjs
@test/autonomous.test.mjs
</context>

<tasks>
  <task type="auto">
    <name>Task 1: Tracer — trigger gate, rounds validation, and delegation contract (V1/V2/V3/V5)</name>
    <files>test/repair.test.mjs</files>
    <read_first>lib/repair.js (runRepairRounds/readVerificationStatus/REPAIR_ROUND_BUDGET contract and parameter shape from plan 01), test/tools.test.mjs (makeCtx at 209-230, registerTool at 232-241, the counting-fake idiom and label-keyed subagents at 117-241), test/helpers/project.mjs (buildProject, VERIFICATION_PASSED/VERIFICATION_GAPS, FENCED_PLAN/FENCED_SUMMARY), test/helpers/fake-fs.mjs (FakeFs files map + writeText), lib/_shared.js (awaitingMarker at 515-517, matchesGapClosure at 364-366)</read_first>
    <action>
Create test/repair.test.mjs with a local harness mirroring test/tools.test.mjs (node --test + node:assert/strict, FakeFs + fake-ctx, offline only):
- Harness: const fs = new FakeFs(); const svc = await buildProject(fs, "/project") (phase 1 = "auth", artefact base 01-auth); a ctx whose get returns svc for gsdState, a fresh label-keyed-or-undefined subagents service, and whose tools is an array; register the REAL gsd_repair by importing ../lib/repair.js, calling apply(c) with c.tools = { register: (t) => tools.push(t) } (mirroring registerTool), then setting c.tools = [...delegates, repairTool] so findTool's Array.isArray branch resolves. exec mirrors test/tools.test.mjs line 112-115 ({ agent: { session: { header: { cwd: CWD } } }, signal }).
- Counting fake delegates as plain objects { name, execute(args, exec) } that push { name, args } into a shared capture array and mutate FakeFs:
  - gsd_plan writes ${CWD}/.planning/phases/01-auth/01-auth-01-PLAN.md with FENCED_PLAN (frontmatter carries gap_closure: true) and returns "## PLANNING COMPLETE"; a controller switch (planWritesNoFixPlan) makes it instead write nothing and return the real plan.js guard string "gsd_plan: gap-closure mode but no fix plan (gap_closure: true) was produced in ..." so the stop-cause test exercises the real failure text.
  - gsd_execute writes 01-auth-01-SUMMARY.md with FENCED_SUMMARY and returns "✓ 01-auth-01 complete"; a checkpoint mode instead writes a CHECKPOINT artefact (01-auth-01-CHECKPOINT.md with the CHECKPOINT_FM frontmatter shape from test/tools.test.mjs:79-97: plan: 01-auth-01, last_completed_task: 1, checkpoint_kind: decision, decision_id: 01-auth-01-ck1), writes no SUMMARY, and returns text containing the exact awaitingMarker({ plan: "01-auth-01", decision_id: "01-auth-01-ck1", kind: "decision", question: "pick a db" }) line built from lib/_shared.js.
  - gsd_verify writes 01-auth-VERIFICATION.md from a controller-sequenced list (verifyWrites: an array of "passed" | "gaps_found" consumed in call order, mapping to VERIFICATION_PASSED / VERIFICATION_GAPS) and returns "status: <x>".
- Seed the trigger before each gaps test: await svc.writeArtifact(CWD, 1, "VERIFICATION", VERIFICATION_GAPS).
- Tests (each asserts delegate call counts/args from the capture array):
  1. Single-round happy path: verifyWrites = ["passed"] → the report signals recovery; capture order is exactly [gsd_plan, gsd_execute, gsd_verify] with args exactly { phase: 1, gaps: true }, then { phase: 1, gapsOnly: true }, then { phase: 1, gaps: true } (D-06/V3).
  2. No-op on passed (D-05/V1): seed VERIFICATION_PASSED instead → success report, capture length 0, and (assert via fs.files) no 01-auth-REPAIR.md written.
  3. human_needed stop (D-04): seed a VERIFICATION text with status: human_needed → stop report naming human verification, capture length 0; its message is distinct from the missing-file and unparseable messages (assert the three messages differ — e.g. three separate seeded runs each matched against their own cause string).
  4. Missing-file stop (D-04): write NO VERIFICATION → stop report naming the missing VERIFICATION.md, capture length 0.
  5. Unparseable stop (D-04): seed a VERIFICATION with frontmatter status: banana (and a second run with no status field) → stop report naming the unparseable/unrecognized status, capture length 0.
  6. Missing delegate (V5): build a tools array WITHOUT gsd_plan → await assert.rejects(() => repairTool.execute({ phase: 1 }, exec), /gsd_plan tool not registered/).
  7. Rounds validation (D-03/V2): rounds: 0, rounds: 3, and rounds: 1.5 each return a string matching /rounds must be an integer between 1 and 2/ with capture length 0; rounds: 1 with verifyWrites = ["passed"] produces exactly one plan + one execute + one verify call.
    </action>
    <verify>node --test test/repair.test.mjs — exit 0.</verify>
    <acceptance_criteria>
      - node --test test/repair.test.mjs exits 0.
      - grep -c "gaps: true" test/repair.test.mjs is at least 2 AND grep -c "gapsOnly: true" test/repair.test.mjs is at least 1 (delegate args asserted literally).
      - grep -c "rounds must be an integer between 1 and 2" test/repair.test.mjs is at least 1.
      - grep -c "gsd_plan tool not registered" test/repair.test.mjs is at least 1.
      - The human_needed / missing-file / unparseable tests each assert capture length 0 (zero delegate calls — D-04).
    </acceptance_criteria>
    <done>The trigger gate, rounds domain, and strict plan→execute→verify delegation contract are proven with counting fakes; all stop paths show zero delegate calls.</done>
  </task>

  <task type="auto">
    <name>Task 2: Per-step oracles, REPAIR.md accumulation, STATE immobility, and no-fork statics (V6–V10/V14/V4)</name>
    <files>test/repair.test.mjs</files>
    <read_first>lib/repair.js (the stop causes and REPAIR.md layout from plan 01 — the "repair budget exhausted" phrase, "## Round N" / "## Stop" sections, frontmatter keys phase/rounds_run/final_status), test/repair.test.mjs (the Task-1 harness), lib/_git-artifacts.js (commitArtifacts seam), test/phase-tools-git.test.mjs (static source assertion idiom)</read_first>
    <action>
Extend test/repair.test.mjs with the round-outcome and wiring proofs (same harness and fixtures):
- No runnable fix plan (D-11/V6): with planWritesNoFixPlan set, run gsd_repair → the result is a stop whose text INCLUDES the plan tool's returned guard text (assert.match on the real no-fix-plan message excerpt); the gsd_execute capture count is 0 and the gsd_plan count is exactly 1; the 01-auth-REPAIR.md body contains a "## Stop" section.
- Execute checkpoint + marker (P5/V7): with execute checkpoint mode on (and a valid fix plan present), run gsd_repair → stop report contains the verbatim awaitingMarker(...) line (import awaitingMarker from ../lib/_shared.js and assert the report includes that exact string), names the checkpointed plan (01-auth-01) and the gsd_execute answer/decision_id resume channel; the gsd_verify capture count is 0 for that round; no blind re-run (gsd_execute count is 1, not 2).
- Budget exhaustion (D-07/V8): verifyWrites = ["gaps_found", "gaps_found"] → the run stops after exactly 2 rounds (gsd_plan, gsd_execute, gsd_verify each captured exactly twice) and the report matches /repair budget exhausted/ with the final status gaps_found; a third round never starts.
- Recovery on round 2 (V8): verifyWrites = ["gaps_found", "passed"] → recovered report, roundsRun 2, and the final VERIFICATION artefact on FakeFs has status: passed.
- REPAIR.md accumulation (D-10/V9): after the recovery run, read ${CWD}/.planning/phases/01-auth/01-auth-REPAIR.md: parseFrontmatter (from ../lib/_shared.js) reads frontmatter.rounds_run === 2 and frontmatter.final_status === "passed", and the body contains "## Round 1" and "## Round 2" sections each naming the actions and resulting status. Then seed VERIFICATION_GAPS again and re-invoke gsd_repair with verifyWrites = ["passed"] → the same file STILL contains the first invocation's "## Round 1" section (append, never truncate) plus a new round section.
- STATE immobility (D-01/V14): capture svc.readState(CWD) before and after (a) a passed no-op call and (b) a stop-with-cause call — the STATE frontmatter (step / active_phase fields) is identical in both cases; also assert ctx2 with tools containing ONLY gsd_repair still produces the fail-loud delegate error rather than a STATE write.
- Static source assertions via readFile of ../lib/repair.js (the test/phase-tools-git.test.mjs idiom) — one describe block:
  - matches /import\s*\{\s*commitArtifacts/ from "./_git-artifacts.js" (V10).
  - (src.match(/scope: "repair"/g) || []).length === 1 (V10/D-10).
  - doesNotMatch /PLANNER_PROMPT|EXECUTOR_PROMPT|VERIFIER_PROMPT/ (V4 — repair delegates, never forks the agent prompts).
  - doesNotMatch /promisify\(\s*execFile\s*\)/ and /execFileSync\s*\(\s*["']git["']/ and /["']git["']\s*,\s*\[/ (D-12 — no inline git).
  - doesNotMatch /node:fs\/promises/ and doesNotMatch /function matchesGapClosure/ (DUR-06 reuse discipline).
  - doesNotMatch /from ["']\.\/autonomous\.js["']/ (one-way import direction — OQ-4).
  - doesNotMatch /setActivePhase|completePhase|setStep\(/ (repair never advances STATE — D-01/V14).
    </action>
    <verify>node --test test/repair.test.mjs — exit 0.</verify>
    <acceptance_criteria>
      - node --test test/repair.test.mjs exits 0.
      - grep -c "awaitingMarker" test/repair.test.mjs is at least 1 (marker surfaced verbatim — P5).
      - grep -c "repair budget exhausted" test/repair.test.mjs is at least 1.
      - grep -c "## Round 1" test/repair.test.mjs is at least 1 (accumulation assertions present).
      - grep -c 'scope: "repair"' test/repair.test.mjs is at least 1 (the static commit-scope assertion).
      - The checkpoint test asserts gsd_verify capture count 0 and gsd_execute count 1 (no blind retry — D-11).
    </acceptance_criteria>
    <done>Every repair failure class stops with its real cause and exact delegate-call counts; REPAIR.md accumulates across rounds and invocations; the no-fork / no-STATE / no-raw-fs / arg-array-discipline wiring is statically proven.</done>
  </task>

  <task type="auto">
    <name>Task 3: Full-surface integration smoke through the REAL delegate tools (V15)</name>
    <files>test/repair.test.mjs</files>
    <read_first>test/repair.test.mjs (the Task-1/2 harness), test/tools.test.mjs (makeSubagents label-keyed fake at 117-207 — plan research/planner/plan-checker/execute/verify labels and their artefact writes), lib/plan.js (the CONTEXT.md prerequisite gate at 94-96, the researcher spawn/skip at 114-135, gap-closure mode and the fix-plan guard), test/helpers/project.mjs (fixtures)</read_first>
    <action>
Add one end-to-end integration test that drives gsd_repair through the REAL gsd_plan/gsd_execute/gsd_verify tools:
- Register the real plugins into the ctx.tools array alongside gsd_repair: import { apply as applyPlan } from "../lib/plan.js", { apply as applyExecute } from "../lib/execute.js", { apply as applyVerify } from "../lib/verify.js" and call each apply(c) after registering the fake trio is REPLACED — for this test use only real plan/execute/verify tools plus gsd_repair, backed by a label-keyed fake subagents service cloned from test/tools.test.mjs makeSubagents: "plan research"-labeled spawns return a ≥50-character RESEARCH text (REQUIRED, mirroring test/tools.test.mjs:146-147 — buildProject seeds no RESEARCH.md, so the real gsd_plan delegate spawns the researcher on round 1, lib/plan.js:116, and treats any <50-character researcher output as failure, "gsd_plan: researcher returned no usable RESEARCH.md", lib/plan.js:130; round 2 skips the researcher because plan.js writes RESEARCH.md after the researcher returns, lib/plan.js:132); "planner"-labeled spawns write 01-auth-01-PLAN.md with FENCED_PLAN (gap_closure: true) and return "## PLANNING COMPLETE"; "plan-checker"-labeled spawns return "## VERIFICATION PASSED"; "execute"-labeled spawns write 01-auth-01-SUMMARY.md with FENCED_SUMMARY; "verify"-labeled spawns write the controller-sequenced VERIFICATION text (["gaps_found", "passed"] to exercise a two-round recovery).
- Before the repair rounds run, seed the real plan delegate's prerequisite on FakeFs: await svc.writeArtifact(CWD, 1, "CONTEXT", "# ctx") — the real gsd_plan stops with its no-CONTEXT guard string otherwise ("gsd_plan: no CONTEXT.md for phase N ...", lib/plan.js:94-96; same idiom as test/tools.test.mjs:582).
- Seed VERIFICATION_GAPS, run repairTool.execute({ phase: 1 }, exec), and assert: the returned report signals recovery after 2 rounds; the final 01-auth-VERIFICATION.md on FakeFs has status: passed; the fix plan (01-auth-01-PLAN.md with gap_closure: true) and 01-auth-01-SUMMARY.md exist (all three delegate tools really ran and produced their artefacts); 01-auth-REPAIR.md exists with frontmatter final_status: passed and a "## Round 2" section.
- Do NOT assert git calls in this test: the delegated tools' and repair's commitArtifacts calls run with the default git seam against the fake cwd and fail soft by design (commitArtifacts never throws); the scope-repair commit wiring is already statically proven in Task 2.
- Finish the file with a suite-level note comment mapping each test to its CONTEXT decision ids (D-01..D-12) and RESEARCH V-numbers so gap-analysis can cross-reference.
    </action>
    <verify>node --test test/repair.test.mjs — exit 0.</verify>
    <acceptance_criteria>
      - node --test test/repair.test.mjs exits 0 including the new integration test.
      - The integration test asserts /status: passed/ on the final VERIFICATION artefact and /passed/ on the REPAIR.md final_status frontmatter.
      - The test asserts the fix plan and SUMMARY artefacts exist after the run (real delegates produced their outputs).
      - grep -c "plan research" test/repair.test.mjs is at least 1 (the researcher branch the real gsd_plan delegate exercises — buildProject seeds no RESEARCH.md).
      - grep -c '"CONTEXT"' test/repair.test.mjs is at least 1 (the integration harness seeds CONTEXT.md before the repair rounds).
      - npm test (full suite) exits 0 at the end of this task.
    </acceptance_criteria>
    <done>The repair orchestrator is proven end-to-end against the real plan/execute/verify machinery on the offline harness: seeded gaps → two rounds → status passed, with REPAIR.md and all artefacts in place (V15).</done>
  </task>
</tasks>
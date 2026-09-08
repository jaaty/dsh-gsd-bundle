---
phase: 58-node-repair
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - lib/repair.js
  - lib/_capabilities.js
  - lib/commands.js
  - cordis.patch.yml
  - package.json
  - test/mount.test.mjs
  - test/_capabilities.test.mjs
  - test/helpers/mount-harness.mjs
  - test/phase-tools-git.test.mjs
autonomous: true
requirements: ["CLH-08"]
user_setup: []
must_haves:
  truths:
    - "Invoking gsd_repair on a phase whose VERIFICATION.md status is gaps_found runs repair rounds of gsd_plan(gaps:true) then gsd_execute(gapsOnly:true) then gsd_verify(gaps:true), in that strict order, delegating through the registered tools rather than forking them (D-06/D-08)."
    - "Invoking gsd_repair on a phase whose status is already passed returns a success report with zero delegate calls (D-05)."
    - "Invoking gsd_repair with rounds 0, 3, or a non-integer stops with a cause naming the 1..2 domain before any delegate call (D-03)."
    - "A human_needed, missing-file, or unparseable VERIFICATION.md stops gsd_repair with its distinct cause and zero delegate calls (D-04)."
    - "After any gsd_repair exit that enters a repair attempt — any trigger status other than already-passed, and any valid rounds value — the phase directory contains <NN>-REPAIR.md with one ## Round N section per attempted round plus a ## Stop section when stopping, committed via commitArtifacts with scope repair; the D-05 no-op and the D-03 invalid-rounds validation stop deliberately write and commit nothing (D-10)."
    - "The mount surface is 37 tools / 34 commands / 28 capability keys / 27 patch rows; gsd_repair is in EXPECTED_TOOL_NAMES, gsd-repair in EXPECTED_COMMAND_NAMES, ./repair resolves through package.json exports, and the gsdRepair descriptor is role out-of-band with order -1 (D-01)."
    - "Repair never advances STATE itself: lib/repair.js contains no setActivePhase, completePhase, or setStep call — the delegated tools own every STATE transition (D-01)."
  artifacts:
    - path: lib/repair.js
      provides: "The gsd_repair orchestrator tool plus the shared round-loop helpers (runRepairRounds, readVerificationStatus, REPAIR_ROUND_BUDGET, ROUNDS_DOMAIN_MSG) that plan 02 rewires gsd_autonomous onto"
      min_lines: 150
      exports: ["name", "inject", "apply", "runRepairRounds", "readVerificationStatus", "REPAIR_ROUND_BUDGET", "ROUNDS_DOMAIN_MSG"]
    - path: lib/_capabilities.js
      provides: "The gsdRepair out-of-band descriptor row (tools [gsd_repair], commands [gsd-repair], order NOT_LOOP_ORDERED) appended to CAPABILITY_KEYS"
      min_lines: 420
      exports: ["CAPABILITY_KEYS", "buildCapability", "allCapabilities"]
    - path: lib/commands.js
      provides: "The /gsd-repair slash-command entry with hint '<N> [--rounds 1|2]' and --rounds flag parsing"
      min_lines: 490
      exports: ["name", "inject", "apply"]
  key_links:
    - from: lib/repair.js
      to: "lib/plan.js, lib/execute.js, lib/verify.js"
      via: "In-process delegation through a dual-shape findTool(ctx, name) + tool.execute(args, exec), mirroring the gsd_mvp_phase precedent (lib/quick.js:43-47, 363-390)"
      pattern: 'findTool\(ctx, "gsd_plan"\)'
    - from: lib/repair.js
      to: lib/_git-artifacts.js
      via: "commitArtifacts(cwd, phaseNum, { scope: \"repair\", phaseName }) called exactly once, on every exit path that enters a repair attempt (the D-05 no-op and the D-03 invalid-rounds stop write and commit nothing)"
      pattern: 'scope: "repair"'
    - from: lib/repair.js
      to: lib/_shared.js
      via: "Reuses matchesGapClosure (and awaitingMarker/parseFrontmatter) — the gap-closure predicate is never reimplemented"
      pattern: 'import\s*\{[^}]*matchesGapClosure[^}]*\}\s*from\s*"\./\_shared\.js"'
    - from: lib/repair.js
      to: lib/state.js
      via: "REPAIR.md read-modify-write through s.readArtifact/s.writeArtifact (ctx.fs), never raw node:fs/promises (DUR-06)"
      pattern: 'writeArtifact\(cwd, phaseNum, "REPAIR"'
    - from: lib/_capabilities.js
      to: lib/repair.js
      via: "gsdRepair descriptor row advertising the new tool + command; apply(ctx) publishes it via ctx.provide(\"gsdRepair\", buildCapability(\"gsdRepair\"))"
      pattern: 'gsdRepair'
    - from: package.json
      to: lib/repair.js
      via: "exports subpath ./repair resolving to ./lib/repair.js so the cordis patch row and mount harness import it"
      pattern: '"\./repair"'
    - from: cordis.patch.yml
      to: package.json
      via: "Insert row gsd-repair -> @dsh-gsd/bundle/repair, in the same relative position as the PATCH_ROWS harness entry"
      pattern: '@dsh-gsd/bundle/repair'
---

<objective>
Deliver the phase-58 node-repair engine (CLH-08): a NEW standalone orchestrator tool `gsd_repair` in `lib/repair.js` that, for a phase whose VERIFICATION.md status is exactly `gaps_found`, runs bounded automatic recovery rounds of gsd_plan(gaps:true) → gsd_execute(gapsOnly:true) → gsd_verify(gaps:true) by delegating to the existing registered tools (never forking them), accumulates `<NN>-REPAIR.md`, and commits with scope `repair` — plus the full mount surface (capability descriptor, /gsd-repair command, patch row, package export, count bumps) so the tool activates in a live session.
</objective>

<context>
@.planning/phases/GSD-58-node-repair/GSD-58-node-repair-CONTEXT.md
@.planning/phases/GSD-58-node-repair/GSD-58-node-repair-RESEARCH.md
@lib/quick.js
@lib/_capabilities.js
@lib/commands.js
@lib/verify.js
@lib/autonomous.js
@lib/_shared.js
@lib/state.js
@lib/_git-artifacts.js
@lib/plan.js
@cordis.patch.yml
@package.json
@test/mount.test.mjs
@test/_capabilities.test.mjs
@test/helpers/mount-harness.mjs
@test/phase-tools-git.test.mjs
</context>

<tasks>
  <task type="auto">
    <name>Task 1: Tracer — gsd_repair end-to-end on a single round (every layer, production-quality)</name>
    <files>lib/repair.js</files>
    <read_first>.planning/phases/GSD-58-node-repair/GSD-58-node-repair-CONTEXT.md, lib/quick.js (findTool at lines 43-47 and the gsd_mvp_phase delegation at 363-390), lib/_capabilities.js (buildCapability + out-of-band TABLE rows), lib/_shared.js (matchesGapClosure at 364-366, parseFrontmatter at 51, awaitingMarker at 515-517, zeroPad at 14), lib/state.js (readArtifact/writeArtifact/hasArtifact/listPlans at 708-792), lib/_git-artifacts.js (commitArtifacts at 174-201), lib/verify.js (status readback + optimistic default to avoid, at 108-130), lib/autonomous.js (readVerifyStatus shape at 184-194), lib/plan.js (gap-closure guard and failure strings at 116, 186-201)</read_first>
    <action>
Create lib/repair.js as a pure-ESM plugin module with zero new runtime dependencies (D-12: node builtins + existing in-repo imports only).

Module surface: export const name = "gsd-repair"; export const inject = ["gsdState", "tools", "subagents"] (house pattern per lib/quick.js:15-16 and lib/autonomous.js:29-33 — subagents is declared even though delegation is indirect); export { name, inject, apply } at the end.

Header comment: node-repair orchestrator (CLH-08 / opengsd node-repair) — an out-of-band ACTION, not a loop step; it delegates to the existing gsd_plan/gsd_execute/gsd_verify tools in-process, which is also why it has no recursion surface (P6).

Implement these exports exactly (names are locked across plans 02/03):
- export const REPAIR_ROUND_BUDGET = 2 (D-03/D-07 hard-coded default; deliberately no config.json knob — deferred idea, do not add one).
- export const ROUNDS_DOMAIN_MSG = "rounds must be an integer between 1 and 2" (D-03: the single source of the rounds-domain text — BOTH validation sites, the runRepairRounds defensive guard in step 1 below and the tool-layer execute check in apply below, reference this constant and never restate the literal, so the domain text appears on exactly one source line).
- export async function readVerificationStatus(s, cwd, phaseNum): read VERIFICATION via s.readArtifact(cwd, phaseNum, "VERIFICATION") inside try/catch; a rejection or empty text returns { status: "missing-file" }; parseFrontmatter(text) with an absent/empty frontmatter.status returns { status: "unparseable" }; a status that (after trim) is not exactly one of passed | gaps_found | human_needed returns { status: "unparseable" }; otherwise return { status } verbatim. Deliberately do NOT copy lib/verify.js's optimistic `status = "gaps_found"` default for a missing file (P2/R4) — mirror lib/autonomous.js readVerifyStatus but split missing-file from unparseable so D-04's three causes are distinct.
- A local dual-shape findTool(ctx, toolName) helper identical to lib/quick.js:43-47 (Array.isArray branch + ctx.tools.get branch, undefined otherwise). Do NOT import it from quick.js: quick.js imports autonomous.js, and plan 02 makes autonomous.js import repair.js, so a quick.js import would create a cycle — document that reason in a comment.
- export async function runRepairRounds({ cwd, s, ctx, exec, phaseNum, phaseName, rounds, gitFn }): one invocation's bounded rounds. In this tracer task implement exactly ONE round end-to-end (the budget loop generalizes in Task 2; write the code so the round body is a clearly separated step so Task 2 wraps it in a loop):
  1. Defensive rounds guard: if rounds is provided and not (Number.isInteger(rounds) && rounds >= 1 && rounds <= REPAIR_ROUND_BUDGET), return a stopped result with cause `gsd_repair: ${ROUNDS_DOMAIN_MSG}` before any delegate call and before the step-4/5 write-and-commit epilogue — the D-03 invalid-rounds stop deliberately writes and commits nothing (OQ-6).
  2. Trigger gate (D-04/D-05): read via readVerificationStatus. status "passed" → return a success no-op straight from the gate, BEFORE the step-4/5 write-and-commit epilogue (recovered true semantics not required — report says the phase already passed, roundsRun 0, zero delegate calls, and DO NOT write REPAIR.md or commit for the no-op per D-05's "without spawning any work" — the no-op exit never enters a repair attempt, and plan 03's no-op test asserts no <NN>-REPAIR.md exists); "human_needed" | "missing-file" | "unparseable" → return a stopped result whose cause names that exact condition (three distinct messages; e.g. human verification needed / VERIFICATION.md missing / unrecognized verification status), zero delegate calls — these statuses are NOT already-passed, so unlike the no-op they DO flow through the step-4 REPAIR.md write (frontmatter rounds_run 0, a "## Stop" section carrying the cause, zero "## Round N" sections) and the step-5 scope-repair commit (OQ-7: commit once per invocation on every stop-with-cause exit path).
  3. The round, in strict order (D-06), delegating through findTool and failing loud when a delegate is missing with the exact mvp-phase error shape "gsd_repair: gsd_plan tool not registered — cannot repair" (mirror lib/quick.js:364-366; same pattern for gsd_execute and gsd_verify):
     a. planTool.execute({ phase: phaseNum, gaps: true }, exec) — NEVER pass force, forceResearch, or skipResearch (P3/OQ-9). Outcome oracle via artefact state, never output sniffing (P1/CQ-03 discipline): const plans = await s.listPlans(cwd, phaseNum); runnable = plans.filter((p) => matchesGapClosure(p.gap_closure) && !p.has_summary); if runnable is empty → stop the invocation with cause = an excerpt of the plan tool's returned text (the real cause — plan.js already fails loud with its own no-fix-plan guard) and do NOT re-run the same round (D-11).
     b. executeTool.execute({ phase: phaseNum, gapsOnly: true }, exec). Oracle: re-list plans; gapPlans = plans.filter((p) => matchesGapClosure(p.gap_closure)); if any gap plan still lacks has_summary → stop: if await s.hasArtifact(cwd, phaseNum, "CHECKPOINT-" + zeroPad(planNum)) is true for a summary-less gap plan, the cause names the checkpointed plan id and that resume flows through gsd_execute's answer/decision_id channel (phase-4 checkpoint path, D-11); else if the execute output contains "GSD_AWAITING_HUMAN:", include that marker line verbatim in the cause/report (house-sanctioned regex per lib/_shared.js:511-517 — never swallow it, P5); otherwise the cause is "no SUMMARY written" plus an excerpt of the execute output. Never blind-retry (D-11).
     c. verifyTool.execute({ phase: phaseNum, gaps: true }, exec). Oracle: re-read via readVerificationStatus; "passed" → the round recovered the phase; "gaps_found" → report still-gaps (Task 2 loops); "human_needed" | "missing-file" | "unparseable" → stop with that cause (D-04). Fold an excerpt of the verify tool's returned text into the round record so a stale/failed VERIFICATION rewrite is visible to the human (R4/P2). Do not inherit verify's optimistic default — your own reader already treats missing as a stop.
  4. REPAIR.md (D-10): before the round, const prior = await s.readArtifact(cwd, phaseNum, "REPAIR").catch(() => ""); after the round (and on every stop path that enters a repair attempt — the step-2 gate stops included, which write only a "## Stop" section with rounds_run 0) write via s.writeArtifact(cwd, phaseNum, "REPAIR", ...) — read-modify-write append, never truncate, never raw node:fs/promises (DUR-06). Documented layout: a small frontmatter block with keys phase, rounds_run, final_status (maintained on every write so parseFrontmatter can read them back), one "## Round N" section per attempted round recording the attempt number, the actions taken (which delegate steps ran and with what args), and the resulting verify status, and a "## Stop" section carrying the stop reason whenever the invocation stops.
  5. Commit (D-10/D-12): on every exit path that enters a repair attempt — recovered, budget-exhausted, and every stop-with-cause including the step-2 human_needed/missing-file/unparseable gate stops — call commitArtifacts(cwd, phaseNum, { scope: "repair", phaseName }, gitFn); the D-05 no-op and the D-03 invalid-rounds validation return before this step and deliberately write and commit nothing. gitFn defaults to undefined so commitArtifacts uses its own defaultGitFn, and may be overridden from ctx.gitFn for testability (lib/core-tools.js:465 pattern). commitArtifacts never throws (R7: it stages only what changed). Repair never pushes, never force-commits, never bypasses gsd_ship preflight or capability gates (D-12).
  6. Never advance the phase STATE yourself — no STATE mutation of any kind; the delegated tools own every STATE transition (D-01; mirrors lib/autonomous.js:12-17).
  7. Return a structured result { recovered: boolean, roundsRun: number, finalStatus: string, stopReason: string | null, report: string } where report is the human-facing text (one section per round + stop reason + any surfaced awaiting marker).

apply(ctx): const gsd = () => ctx.get("gsdState"); publish the capability with ctx.provide("gsdRepair", buildCapability("gsdRepair")) (import buildCapability from "./_capabilities.js") — this IS the one-descriptor registration D-01/OQ-1 permits; then ctx.tools.register(defineTool({...})) (import defineTool from "@deepseek-ai/dsh-tools") with:
  - name: "gsd_repair".
  - description: bounded automatic recovery for a phase whose verification returned gaps_found — runs up to 2 rounds of gsd_plan(gaps) → gsd_execute(gapsOnly) → gsd_verify(gaps), delegating in-process to the registered tools (no recursion surface), stopping with clear causes on human_needed/missing/unparseable, writing <NN>-REPAIR.md, and never advancing STATE itself; long-running (each round spawns planner/checker/executors/verifier subagents).
  - parameters: phase { type: "number", required: true } and rounds { type: "number", description: "Repair-round override for this invocation (1..2); default budget 2." } (D-03).
  - output: { schema: { type: "string" }, render: (_a, v) => [{ type: "text", text: v }] }.
  - async execute(args, exec): const cwd = cwdOf(exec) (import cwdOf from "./_runner.js"); const s = gsd(); if (!s) throw new Error("gsd_repair: gsdState service unavailable"); if (!(await s.isProject(cwd))) throw new Error("gsd_repair: no .planning/ project — run gsd_init first"); roadmap phase lookup mirroring lib/verify.js:61-63 with throw new Error(`gsd_repair: phase ${args.phase} not in ROADMAP.md`) when absent; validate args.rounds per D-03 and on invalid input RETURN (not throw) the stop string `gsd_repair: ${ROUNDS_DOMAIN_MSG} (got ${args.rounds})` with zero delegate calls (the `(got ...)` suffix is added ONLY here at the tool layer — the shared constant carries the domain text for both sites); then await runRepairRounds({ cwd, s, ctx, exec, phaseNum: args.phase, phaseName: phase.name, rounds: args.rounds, gitFn: ctx.gitFn }) and return its report text.
  - presentCall: (a) => ({ card: "generic", title: `Repair phase ${a.phase}`, kind: "other", rawInput: { phase: a.phase } }).

Comment discipline for the acceptance greps below: keep the guarded literals OUT of comments — write "never advance the phase STATE" instead of naming the STATE accessor names, "the awaiting marker" instead of repeating the marker literal, and "never override the plan tool's mode flags" instead of listing the flag names; each guarded literal may appear only at its single functional site (the marker literal only at the step-3b surfacing site, so its equals-1 grep holds).

Write the module header comment in the house style of lib/quick.js / lib/autonomous.js (design constraints + decision references D-01..D-12).
    </action>
    <verify>node -e "import('./lib/repair.js').then(m => { for (const k of ['name','inject','apply','runRepairRounds','readVerificationStatus','REPAIR_ROUND_BUDGET','ROUNDS_DOMAIN_MSG']) if (!(k in m)) throw new Error('missing export: ' + k); if (m.name !== 'gsd-repair') throw new Error('bad name'); if (m.REPAIR_ROUND_BUDGET !== 2) throw new Error('bad budget'); if (m.ROUNDS_DOMAIN_MSG !== 'rounds must be an integer between 1 and 2') throw new Error('bad rounds msg'); console.log('repair module ok'); })" — exit code 0.</verify>
    <acceptance_criteria>
      - The node -e import smoke prints "repair module ok" and exits 0.
      - grep -c "matchesGapClosure" lib/repair.js returns at least 1 AND grep -c "function matchesGapClosure" lib/repair.js returns 0 (reused from ./_shared.js, not reimplemented).
      - grep -c 'scope: "repair"' lib/repair.js equals 1.
      - grep -c "gsd_plan tool not registered" lib/repair.js equals 1 (fail-loud delegate guard).
      - grep -c "rounds must be an integer between 1 and 2" lib/repair.js equals 1 (only the ROUNDS_DOMAIN_MSG definition carries the domain text — both validation sites reference the constant, per D-03).
      - grep -c "GSD_AWAITING_HUMAN" lib/repair.js equals 1 (the marker literal exists only at the step-3b surfacing site, P5).
      - grep -cE "setActivePhase|completePhase|setStep\(" lib/repair.js returns 0 (repair never advances STATE — D-01; the accessor names stay out of comments).
      - grep -c "node:fs/promises" lib/repair.js returns 0 AND grep -c "writeArtifact" lib/repair.js is at least 1 (artefact I/O via gsdState only — DUR-06).
      - grep -c "force:" lib/repair.js returns 0 (never overrides the plan tool's mode flags — P3; flag names stay out of comments).
      - grep -c 'from "./autonomous.js"' lib/repair.js returns 0 (one-way import direction — OQ-4).
    </acceptance_criteria>
    <done>gsd_repair exists in lib/repair.js: trigger gate + no-op guard + one strict-order delegation round with artefact-state oracles + REPAIR.md write/append + scope-repair commit on every exit path that enters a repair attempt (the D-05 no-op and D-03 invalid-rounds stop write and commit nothing), with all service/delegate guards fail-loud and the rounds-domain message carried by the single ROUNDS_DOMAIN_MSG constant.</done>
  </task>

  <task type="auto">
    <name>Task 2: Bounded round budget machine + tool-result report (D-03/D-07/D-11)</name>
    <files>lib/repair.js</files>
    <read_first>lib/repair.js (the Task-1 single-round body), CONTEXT.md decisions D-03/D-07/D-11, CONTEXT.md specifics (round budget = "2 rounds — two attempts before stopping")</read_first>
    <action>
Generalize the Task-1 single-round body of runRepairRounds into the bounded loop, keeping every Task-1 behaviour intact:
- When rounds is omitted, default to REPAIR_ROUND_BUDGET (2). Iterate up to `rounds` attempts of the same strict-order round body (plan → execute → verify). A round is only attempted when the previous step of that round succeeded (D-06).
- After each round's verify read: status "passed" → return the recovered result immediately (roundsRun = attempts made); status "gaps_found" with rounds remaining → start the next round; status "gaps_found" with the budget exhausted → stop with a cause and report that use the grep-stable phrase "repair budget exhausted" and name the remaining gaps' location (the phase's VERIFICATION.md) — report the remaining gaps instead of looping (D-07). That phrase is the designed stop-classification contract plan 02's autonomous rewire consumes to distinguish a genuinely exhausted budget from a D-11 early stop — keep it ONLY in the budget-exhaustion cause; every early-stop cause (next bullet) never contains it.
- Any in-round stop (no runnable fix plan, execute checkpoint/marker/no-summary, verify human_needed/missing-file/unparseable) consumes the invocation immediately and is NOT retried — no blind re-run of the same round (D-11). Its cause names the real cause only — never the budget phrase. A mid-task execute failure hands off to the existing gsd_execute checkpoint/resume path via the surfaced cause; repair never re-runs the plan from scratch.
- Keep the per-call rounds override strictly 1..2: the tool execute validates per D-03 (Task 1) and runRepairRounds defensively re-checks (Task 1 guard); both sites reference ROUNDS_DOMAIN_MSG — never restate the domain text.
- Shape the returned report (presentation — wording is Claude's Discretion per CONTEXT): a summary line naming roundsRun and finalStatus; one section per round (attempt number, actions taken, resulting verify status); a stop section with the real cause including the "repair budget exhausted" phrase on budget stops and any surfaced awaiting marker verbatim.
- Keep REPAIR.md in lockstep: rounds_run and final_status frontmatter fields reflect the final state of THIS invocation; sections append (never truncate prior invocations' sections).
- Same comment discipline as Task 1: the guarded literals (the STATE accessor names, the marker literal, the rounds-domain text) stay out of comments — the rounds-domain text lives only in ROUNDS_DOMAIN_MSG.
    </action>
    <verify>node -e "import('./lib/repair.js').then(m => { if (m.REPAIR_ROUND_BUDGET !== 2) throw new Error('bad budget'); if (m.ROUNDS_DOMAIN_MSG !== 'rounds must be an integer between 1 and 2') throw new Error('bad rounds msg'); console.log('ok'); })" — exit code 0; and node --check-free smoke: node --input-type=module -e "await import('./lib/repair.js')" — exit 0.</verify>
    <acceptance_criteria>
      - grep -c "REPAIR_ROUND_BUDGET = 2" lib/repair.js equals 1.
      - grep -c "repair budget exhausted" lib/repair.js is at least 1.
      - grep -c "rounds must be an integer between 1 and 2" lib/repair.js equals 1 (only the ROUNDS_DOMAIN_MSG definition — both validation sites reference the constant).
      - The module import smoke exits 0.
      - grep -cE "setActivePhase|completePhase|setStep\(" lib/repair.js still returns 0.
    </acceptance_criteria>
    <done>runRepairRounds implements the hard 2-round default budget with per-call 1..2 override, stops-with-cause on every failure class without blind retry (budget-exhaustion cause locked to the "repair budget exhausted" classification phrase, early-stop causes free of it), and returns a structured result + human report carrying per-round sections and the stop reason.</done>
  </task>

  <task type="auto">
    <name>Task 3: Mount surface — capability, command, patch row, export, count bumps (D-01)</name>
    <files>lib/_capabilities.js, lib/commands.js, cordis.patch.yml, package.json, test/mount.test.mjs, test/_capabilities.test.mjs, test/helpers/mount-harness.mjs, test/phase-tools-git.test.mjs</files>
    <read_first>lib/_capabilities.js (CAPABILITY_KEYS 32-60, NOT_LOOP_ORDERED at 17, out-of-band rows gsdAutonomous/gsdAddTests/gsdPhaseManagement at 331-363), lib/commands.js (COMMANDS entries + phaseNum usage + flag idioms at 180-265 and the pairing apply at 444-478), cordis.patch.yml (gsd-autonomous / gsd-add-tests comment blocks at 142-154), package.json (exports at 60-117), test/mount.test.mjs (count sites at 147/148/159/190/215/328, EXPECTED arrays at 99-132), test/_capabilities.test.mjs (count at 11-45), test/helpers/mount-harness.mjs (PATCH_ROWS at 23-50), test/phase-tools-git.test.mjs (static assertion idiom at 20-83)</read_first>
    <action>
Register the new tool + command across the whole house mount surface (this IS the "registration of the one new tool + command" D-01 permits; because the role is out-of-band, the loop chain, persona Available-steps rendering, STATE step machine, and the removal matrix are untouched — no other churn):
- lib/_capabilities.js: append "gsdRepair" to the CAPABILITY_KEYS freeze AFTER "gsdPhaseManagement" (surface grows 27 → 28), and add the TABLE row AFTER the gsdPhaseManagement row mirroring the out-of-band precedents: step: "repair", role: "out-of-band", tools: ["gsd_repair"], commands: ["gsd-repair"], order: NOT_LOOP_ORDERED, prereq: [], next: [], produces: ["REPAIR.md"], consumes: ["VERIFICATION.md"]. Extend the CAPABILITY_KEYS order-comment with the phase-58 note (out-of-band repair, not loop-ordered, slots after gsdPhaseManagement). buildCapability's existing validation already covers the new row — no validator change.
- lib/commands.js: append one COMMANDS entry { name: "gsd-repair", description, hint: "<N> [--rounds 1|2]", build } near the other out-of-band commands (after gsd-add-tests). Its build(raw) parses the phase with the existing phaseNum(raw) helper and the rounds with raw.match(/--rounds\s+(\d+)/) (the --draft/--repair flag idiom); when no phase number is present return { err: "Usage: /gsd-repair <N> [--rounds 1|2]" }; otherwise return text instructing the agent to run the gsd_repair tool on phase N (mentioning the rounds override when given, and that it runs bounded automatic recovery rounds of gsd_plan --gaps → gsd_execute --gaps-only → gsd_verify --gaps for a gaps_found verification) with ack `Repair phase ${n} → gsd_repair.`. Command pairing to the gsdRepair capability happens automatically via the descriptor (lib/commands.js:449-463) — no pairing code.
- cordis.patch.yml: insert into the insert block, immediately AFTER the gsd-add-tests row (keeping parse order aligned with PATCH_ROWS), a comment block in the house style — "The node-repair out-of-band orchestrator (/gsd-repair): bounded automatic recovery rounds (gsd_plan --gaps → gsd_execute --gaps-only → gsd_verify --gaps) for a phase whose verification found gaps. Not a loop step; it orchestrates the loop." — followed by the row: - id: gsd-repair / name: '@dsh-gsd/bundle/repair'.
- package.json: add "./repair": { "default": "./lib/repair.js" } to exports (position near the other out-of-band subpaths; the key existing is what the mount test resolves).
- test/helpers/mount-harness.mjs: append { id: "gsd-repair", sub: "repair" } to PATCH_ROWS immediately after the gsd-add-tests row so EXPECTED_INSERT_ROWS deep-equal keeps matching the parsed patch order (surface 26 → 27 rows).
- test/mount.test.mjs: bump the six numeric sites — ctx.tools.length 36 → 37 (lines ~147 and ~328), ctx.commands.length 33 → 34 (~148), ctx2.commands.length 32 → 33 in the DEGR-03 absent-capability test (~190, arithmetic: 34 total minus the withdrawn gsd-quick), insertRows.length 26 → 27 (~215), CAPABILITY_KEYS.length 27 → 28 (~159); append "gsd_repair" to EXPECTED_TOOL_NAMES and "gsd-repair" to EXPECTED_COMMAND_NAMES; update the stale count comments/titles where they state the old numbers (e.g. "all 26 plugins activate", "26 insert rows", "Expected registered tool names (35)").
- test/_capabilities.test.mjs: assert CAPABILITY_KEYS.length equals 28 (line ~13) and add "gsdRepair" to the expected-key enumeration.
- test/phase-tools-git.test.mjs: add lib/repair.js static assertions in this file's readFile idiom, as NEW tests (do not touch the existing TOOLS loop): (1) lib/repair.js imports commitArtifacts from "./_git-artifacts.js" (assert.match on the import); (2) the string scope: "repair" appears exactly once in lib/repair.js (count via a /scope: "repair"/g match equals 1); (3) lib/repair.js has NO inline git logic — assert.doesNotMatch for promisify(execFile), execFileSync("git"), and the "git", [ inline-call shape; (4) additionally assert lib/repair.js does NOT call setActivePhase, completePhase, or setStep (repair never advances STATE — D-01; naming the accessors here is fine — the equals-0 grep applies to lib/repair.js source, not to this test file).
- Do NOT touch test/removal.test.mjs (data-driven over role "step" only — an out-of-band row changes nothing there), lib/_render.js, lib/persona.js, lib/_route.js (the _route.js "repair" phrase re-point is a deferred follow-up, OQ-5/R5 — out of scope), or lib/verify.js (plan 02 owns D-02).
    </action>
    <verify>node --test test/mount.test.mjs test/_capabilities.test.mjs test/phase-tools-git.test.mjs — exit 0; and node -e "import('@dsh-gsd/bundle/repair').then(m => console.log(m.name))" prints gsd-repair (self-reference through the new exports subpath).</verify>
    <acceptance_criteria>
      - node --test test/mount.test.mjs test/_capabilities.test.mjs test/phase-tools-git.test.mjs exits 0.
      - grep -c "gsdRepair" lib/_capabilities.js is at least 2 (CAPABILITY_KEYS + TABLE row).
      - grep -c "gsd-repair" cordis.patch.yml equals 1 AND grep -c "@dsh-gsd/bundle/repair" cordis.patch.yml equals 1.
      - grep -c '"\./repair"' package.json equals 1.
      - grep -c "gsd_repair" test/mount.test.mjs is at least 1 AND grep -c "gsd-repair" test/mount.test.mjs is at least 1.
      - grep -c "gsdRepair" test/_capabilities.test.mjs is at least 1 AND grep -c 'id: "gsd-repair"' test/helpers/mount-harness.mjs equals 1.
      - grep -c 'scope: "repair"' test/phase-tools-git.test.mjs is at least 1 (new static assertion present).
      - npm test (full suite, node --test test/*.test.mjs) exits 0 at the end of this task.
    </acceptance_criteria>
    <done>The bundle mounts 37 tools / 34 commands / 28 capability keys / 27 patch rows; /gsd-repair is paired to the gsdRepair capability through the descriptor; ./repair resolves via exports + dynamic import; every mount-surface test passes and the full suite is green.</done>
  </task>
</tasks>
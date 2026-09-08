---
phase: 57-mvp-phase
plan: 01
type: execute
wave: 1
depends_on: []
files_modified: ["lib/quick.js", "lib/_capabilities.js", "lib/commands.js", "test/mount.test.mjs", "test/_capabilities.test.mjs", "test/render.test.mjs"]
autonomous: true
requirements: ["CLH-07"]
user_setup: []
must_haves:
  truths:
    - "A user can invoke gsd_mvp_phase on an incomplete phase and it first proposes a minimal-viable slice of the phase goal and asks the user to confirm or adjust it before any planning (propose-then-confirm)."
    - "After the user confirms/adjusts, gsd_mvp_phase produces a real PLAN.md (via the normal gsd_plan path) and delegates execution to the normal loop (gsd_execute -> gsd_verify -> gsd_ship)."
    - "A failed mvp-phase run stops and leaves the phase uncompleted in STATE (no partial 'Complete'), reporting the real error."
    - "The /gsd-mvp-phase slash command routes to the gsd_mvp_phase tool."
  artifacts:
    - path: "lib/quick.js"
      provides: "the gsd_mvp_phase tool (propose-then-confirm scoping + delegation to plan/execute/verify/ship + fail-fast) and the gsdMvpPhase capability"
      min_lines: 40
      exports: ["name", "inject", "apply"]
    - path: "lib/_capabilities.js"
      provides: "the gsdMvpPhase capability descriptor (CAPABILITY_KEYS + TABLE)"
      min_lines: 1
      exports: ["CAPABILITY_KEYS", "TABLE", "buildCapability"]
    - path: "lib/commands.js"
      provides: "the /gsd-mvp-phase slash command entry"
      min_lines: 1
      exports: ["name", "inject", "apply"]
    - path: "test/mount.test.mjs"
      provides: "updated tool/command/capability exact counts + EXPECTED arrays"
      min_lines: 1
    - path: "test/_capabilities.test.mjs"
      provides: "updated capability-key count and key list including gsdMvpPhase"
      min_lines: 1
    - path: "test/render.test.mjs"
      provides: "updated LOOP_ORDER and subset lists including gsdMvpPhase"
      min_lines: 1
  key_links:
    - from: "lib/quick.js"
      to: "lib/plan.js"
      via: "gsd_mvp_phase finds gsd_plan via the findTool helper and invokes its execute for a schema-faithful PLAN.md (D-04)"
      pattern: "gsd_plan"
    - from: "lib/quick.js"
      to: "lib/execute.js"
      via: "gsd_mvp_phase delegates execution to gsd_execute (D-05)"
      pattern: "gsd_execute"
    - from: "lib/quick.js"
      to: "lib/verify.js"
      via: "gsd_mvp_phase delegates verification to gsd_verify, then reads VERIFICATION.md status before shipping (D-05/D-07)"
      pattern: "gsd_verify"
    - from: "lib/quick.js"
      to: "lib/ship.js"
      via: "gsd_mvp_phase delegates the full ship to gsd_ship (D-05)"
      pattern: "gsd_ship"
    - from: "lib/quick.js"
      to: "lib/state.js"
      via: "gsd_mvp_phase writes the pending MVP-SCOPE proposal and the confirmed CONTEXT via writeArtifact (D-03)"
      pattern: "writeArtifact"
---

<objective>
Land the core mvp-phase implementation: a new gsd_mvp_phase tool (plus the gsdMvpPhase capability and /gsd-mvp-phase command) that guides a minimal-viable-phase planning and execution flow — interactive propose-then-confirm scoping (D-03) -> a real PLAN.md via the normal gsd_plan path (D-04) -> delegation to the normal loop gsd_execute/gsd_verify/gsd_ship (D-05) — with fail-fast error handling (D-06). This is the tracer: the thinnest end-to-end slice touching every layer (capability, command, tool, artefact model, plan/execute/verify/ship delegation). It is additive only: the full loop, gsd_fast_mode, gsd_quick, gsd_quick_batch, and gsd_autonomous are untouched (D-02).

Decision coverage: D-01 (new gsd_mvp_phase tool + /gsd-mvp-phase command + gsdMvpPhase capability, additive under the quick step, role alternate), D-02 (distinct sibling to fast-mode — neither changes the other), D-03 (propose-then-confirm scoping: derive a proposed slice, ask the user to confirm/adjust, the confirmed slice becomes the scope), D-04 (reuse the normal gsd_plan path for a schema-faithful PLAN.md), D-05 (delegate execution to the normal loop gsd_execute -> gsd_verify -> gsd_ship), D-06 (fail fast, never auto-retry/continue, leave the phase uncompleted, report the real cause), D-07 (executor discretion on the proposed-slice wording, the confirm interaction shape, and the lightweight-verify heuristic before delegating to ship).
</objective>

<context>
@lib/quick.js — the existing gsd_quick / gsd_quick_batch / gsd_fast_mode tools; add gsd_mvp_phase here (fourth ctx.provide + fourth ctx.tools.register). Read the FAST_PROMPT, the findTool helper (lines 43-47), the gsd_fast_mode execute (lines 233-281), and the buildAutoContext import.
@lib/_capabilities.js — CAPABILITY_KEYS + TABLE; add the gsdMvpPhase descriptor mirroring gsdFastMode (step quick, role alternate, order 25).
@lib/commands.js — COMMANDS array; add the gsd-mvp-phase entry mirroring gsd-fast-mode.
@lib/plan.js — the gsd_plan tool (execute at line 77) that mvp-phase delegates to; it requires a CONTEXT.md (returns early at line 96 if absent) and sets STATE to 'execute' on success.
@lib/execute.js — the gsd_execute tool (execute at line 54) that mvp-phase delegates to; requires PLAN.md files, sets STATE to 'verify' when all plans complete.
@lib/verify.js — the gsd_verify tool (execute at line 54) that mvp-phase delegates to; requires SUMMARY.md files, writes VERIFICATION.md, sets STATE to 'ship' on passed.
@lib/ship.js — the gsd_ship tool (execute at line 142) that mvp-phase delegates to for the full ship.
@lib/state.js — writeArtifact/readArtifact/hasArtifact/phaseDirAndBase accessors (lines 708-755); writeArtifact accepts arbitrary suffix names (e.g. "MVP-SCOPE" -> <base>-MVP-SCOPE.md).
@lib/_shared.js — parseFrontmatter (line 51) for reading the VERIFICATION.md status back.
@test/mount.test.mjs — exact-count assertions (35 tools, 32 commands, 26 caps) + EXPECTED_TOOL_NAMES / EXPECTED_COMMAND_NAMES arrays; update in the SAME commit as the tool (R3).
@test/_capabilities.test.mjs — CAPABILITY_KEYS.length === 26 (line 13) + key list (lines 14-40).
@test/render.test.mjs — LOOP_ORDER (line 44) + the without("gsdVerify") subset list (line 113).
</context>

<tasks>
  <task type="auto">
    <name>Task 1: Add gsdMvpPhase capability, /gsd-mvp-phase command, and the gsd_mvp_phase tool (propose-then-confirm + delegation + fail-fast)</name>
    <files>lib/_capabilities.js, lib/commands.js, lib/quick.js</files>
    <read_first>lib/_capabilities.js, lib/commands.js, lib/quick.js, lib/plan.js, lib/execute.js, lib/verify.js, lib/ship.js, lib/state.js, lib/_shared.js</read_first>
    <action>
      Implement the full mvp-phase surface. Three files change:

      1. lib/_capabilities.js — add "gsdMvpPhase" to CAPABILITY_KEYS immediately after "gsdFastMode" and before "gsdExecute". Add a gsdMvpPhase entry to the TABLE object: step "quick", role "alternate", tools ["gsd_mvp_phase"], commands ["gsd-mvp-phase"], order 25, prereq [], next [], produces [], consumes []. Mirror the gsdFastMode block exactly (lib/_capabilities.js:176-186).

      2. lib/commands.js — add a gsd-mvp-phase entry to the COMMANDS array immediately after the gsd-fast-mode entry (lib/commands.js:267-278). name "gsd-mvp-phase", description "MVP phase N: interactive propose-then-confirm scoping -> real PLAN.md (via gsd_plan) -> delegate to the normal loop (execute/verify/ship).", hint "<N>". build(raw): parse n via phaseNum(raw); if !n return { err: "Usage: /gsd-mvp-phase <N>" }; else return { text: `Run the gsd_mvp_phase tool on phase ${n}: it proposes a minimal-viable slice of the phase goal, asks you to confirm or adjust it, then produces a real PLAN.md (via gsd_plan) and delegates execution to the normal loop (gsd_execute -> gsd_verify -> gsd_ship).`, ack: `MVP phase ${n} → gsd_mvp_phase.` }.

      3. lib/quick.js — add the gsd_mvp_phase tool and gsdMvpPhase capability:
         - Extend the import from "./_shared.js" (line 9) to also bring in parseFrontmatter: `import { slugify, today, nowIso, parseFrontmatter } from "./_shared.js";`.
         - After the gsdFastMode provide (line 62), add `ctx.provide("gsdMvpPhase", buildCapability("gsdMvpPhase"));`.
         - Add three module-scope helpers near findTool (after line 47):
           - `function proposeMvpSlice(phase)` returning a proposed minimal-viable slice string: `Minimal-viable slice of phase ${phase.n} (${phase.name}): ${phase.goal} — deliver the smallest end-to-end slice that satisfies ${(phase.requirements || []).join(", ") || "the phase requirements"}.`
           - `function isGenericConfirm(confirm)` returning true when String(confirm).trim() matches /^(yes|y|confirm|ok|accept|accept the proposal|proceed)$/i.
           - `function buildMvpContext(phase, slice)` returning a CONTEXT.md body that carries the confirmed slice plus the phase goal/requirements so the delegated planner has enough to produce a real plan: `# Phase ${phase.n}: ${phase.name} - Context (MVP scoping)\n\n**Mode:** MVP-phase scoping (propose-then-confirm)\n**Status:** Ready for planning\n\n<domain>\n## Phase Boundary\n**In scope:** ${slice}\n**Out of scope:** The remainder of the phase goal not covered by the confirmed MVP slice.\n</domain>\n\n<decisions>\n## MVP Scope (confirmed)\n- D-01: The confirmed minimal-viable slice for this phase is: ${slice}\n- D-02: The full phase goal is: ${phase.goal}\n- D-03: The phase requirements addressed by this slice are: ${(phase.requirements || []).join(", ") || "none listed"}\n</decisions>`.
         - Register the gsd_mvp_phase tool via ctx.tools.register(defineTool({ ... })) with:
           - name "gsd_mvp_phase", description naming the interactive propose-then-confirm scoping flow, that it produces a real PLAN.md via gsd_plan and delegates to the normal loop (execute/verify/ship), and that it refuses already-Complete phases and never auto-retries on failure.
           - parameters: { phase: { type: "number", required: true }, confirm: { type: "string", description: "The user's confirmation or adjusted MVP slice. Omit on the first call to receive the proposed slice." }, decision_id: { type: "string", description: "The decision id returned by the first call; required to apply a confirm." } }.
           - output: { schema: { type: "string" }, render: (_a, v) => [{ type: "text", text: v }] }.
           - async execute(args, exec) implementing, in order:
             a. const cwd = cwdOf(exec); const s = gsd(); if (!s) throw new Error("gsd_mvp_phase: gsdState service unavailable"); if (!(await s.isProject(cwd))) throw new Error("gsd_mvp_phase: no .planning/ project — run gsd_init first"); const roadmap = await s.readRoadmap(cwd); if (!roadmap) throw new Error("gsd_mvp_phase: unreadable ROADMAP.md"); const phase = (roadmap.phases || []).find((p) => p.n === args.phase); if (!phase) throw new Error(`gsd_mvp_phase: phase ${args.phase} not in ROADMAP.md`); if (phase.status === "Complete") throw new Error(`gsd_mvp_phase: phase ${args.phase} is already Complete — mvp-phase refuses completed phases`).
             b. const decisionId = `mvp-${phase.n}`; const proposed = proposeMvpSlice(phase).
             c. D-03 propose-then-confirm: if (!args.confirm) { await s.writeArtifact(cwd, phase.n, "MVP-SCOPE", `---\ndecision_id: ${decisionId}\n---\n# Proposed MVP slice\n\n${proposed}`); return `GSD_AWAITING_HUMAN: mvp-phase phase ${phase.n} (${phase.name}) — proposed minimal-viable slice:\n\n${proposed}\n\nConfirm or adjust by re-invoking gsd_mvp_phase with confirm="<your slice or 'yes'>" and decision_id="${decisionId}".`; } if (args.decision_id !== decisionId) throw new Error(`gsd_mvp_phase: decision_id mismatch — expected ${decisionId}, got ${args.decision_id}`).
             d. D-03 apply the confirmed slice: const confirmed = isGenericConfirm(args.confirm) ? proposed : args.confirm; await s.writeArtifact(cwd, phase.n, "CONTEXT", buildMvpContext(phase, confirmed)).
             e. D-04 reuse the normal plan path: const planTool = findTool(ctx, "gsd_plan"); if (!planTool || typeof planTool.execute !== "function") throw new Error("gsd_mvp_phase: gsd_plan tool not registered — cannot plan"); const planOut = await planTool.execute({ phase: phase.n }, exec). A throw here propagates (fail-fast, D-06).
             f. D-05 delegate execution: const executeTool = findTool(ctx, "gsd_execute"); if (!executeTool || typeof executeTool.execute !== "function") throw new Error("gsd_mvp_phase: gsd_execute tool not registered — cannot execute"); const executeOut = await executeTool.execute({ phase: phase.n }, exec).
             g. D-05 delegate verification: const verifyTool = findTool(ctx, "gsd_verify"); if (!verifyTool || typeof verifyTool.execute !== "function") throw new Error("gsd_mvp_phase: gsd_verify tool not registered — cannot verify"); const verifyOut = await verifyTool.execute({ phase: phase.n }, exec).
             h. D-07/D-06 lightweight-verify heuristic before delegating to ship: const verText = await s.readArtifact(cwd, phase.n, "VERIFICATION").catch(() => ""); const { frontmatter } = parseFrontmatter(verText); if (frontmatter.status !== "passed") return `gsd_mvp_phase: phase ${phase.n} did not pass verification (status: ${frontmatter.status || "unknown"}). Stopping — the phase is left uncompleted. Re-run gsd_verify or use the full loop.\n\n${verifyOut}`.
             i. D-05 delegate the full ship: const shipTool = findTool(ctx, "gsd_ship"); if (!shipTool || typeof shipTool.execute !== "function") throw new Error("gsd_mvp_phase: gsd_ship tool not registered — cannot ship"); const shipOut = await shipTool.execute({ phase: phase.n }, exec).
             j. return `gsd_mvp_phase complete for phase ${phase.n} (${phase.name}).\n\n## Plan\n${planOut}\n\n## Execute\n${executeOut}\n\n## Verify\n${verifyOut}\n\n## Ship\n${shipOut}`.
           - presentCall: (a) => ({ card: "generic", title: `MVP phase ${a.phase}`, kind: "other", rawInput: { phase: a.phase } }).
    </action>
    <verify>node --check lib/quick.js && node --check lib/_capabilities.js && node --check lib/commands.js</verify>
    <acceptance_criteria>
      - grep -q "gsdMvpPhase" lib/_capabilities.js
      - grep -q "gsd_mvp_phase" lib/_capabilities.js
      - grep -q "gsd-mvp-phase" lib/_capabilities.js
      - grep -q "gsd-mvp-phase" lib/commands.js
      - grep -q "gsd_mvp_phase" lib/quick.js
      - grep -q "provide(\"gsdMvpPhase\"" lib/quick.js
      - grep -q "GSD_AWAITING_HUMAN" lib/quick.js
      - grep -q "proposeMvpSlice" lib/quick.js
      - grep -q "isGenericConfirm" lib/quick.js
      - grep -q "buildMvpContext" lib/quick.js
      - grep -q "parseFrontmatter" lib/quick.js
      - grep -q "findTool(ctx, \"gsd_plan\")" lib/quick.js
      - grep -q "findTool(ctx, \"gsd_execute\")" lib/quick.js
      - grep -q "findTool(ctx, \"gsd_verify\")" lib/quick.js
      - grep -q "findTool(ctx, \"gsd_ship\")" lib/quick.js
      - node --check passes (exit 0) for all three files
    </acceptance_criteria>
    <done>gsd_mvp_phase is registered with the full propose-then-confirm scoping + delegation + fail-fast flow, gsdMvpPhase capability and /gsd-mvp-phase command exist, and all three files pass node --check.</done>
  </task>

  <task type="auto">
    <name>Task 2: Update mount/_capabilities/render test counts and EXPECTED arrays for the new tool/command/capability</name>
    <files>test/mount.test.mjs, test/_capabilities.test.mjs, test/render.test.mjs</files>
    <read_first>test/mount.test.mjs, test/_capabilities.test.mjs, test/render.test.mjs</read_first>
    <action>
      Update the three registration-surface test files so the offline harness reflects the new registrations (R3 — same commit as the tool):
      1. test/mount.test.mjs:
         - Add "gsd_mvp_phase" to EXPECTED_TOOL_NAMES (line 110), e.g. after "gsd_fast_mode".
         - Add "gsd-mvp-phase" to EXPECTED_COMMAND_NAMES (line 124), e.g. after "gsd-fast-mode".
         - Bump the exact-count assertions: tools 35 -> 36 (lines 147 and 328), commands 32 -> 33 (line 148), capability keys 26 -> 27 (line 159). The "absent capability" test at line 190 currently asserts 31 commands when gsdQuick is withdrawn — recompute: with gsdMvpPhase added, the full command set is 33; withdrawing gsdQuick removes only gsd-quick (gsdMvpPhase is a separate capability), so the expected count there becomes 32. Update line 190 from 31 to 32.
      2. test/_capabilities.test.mjs:
         - Line 13: change `CAPABILITY_KEYS.length, 26` to `27`.
         - Add "gsdMvpPhase" to the key list (lines 14-40), immediately after "gsdFastMode".
      3. test/render.test.mjs:
         - Line 44 LOOP_ORDER: insert "gsdMvpPhase" immediately after "gsdFastMode" (both order 25; stable sort keeps CAPABILITY_KEYS order, gsdFastMode before gsdMvpPhase).
         - Line 113 (the without("gsdVerify") subset list): insert "gsdMvpPhase" immediately after "gsdFastMode".
    </action>
    <verify>node --test test/mount.test.mjs test/_capabilities.test.mjs test/render.test.mjs 2>&1 | tail -20</verify>
    <acceptance_criteria>
      - grep -q "gsd_mvp_phase" test/mount.test.mjs
      - grep -q "gsd-mvp-phase" test/mount.test.mjs
      - grep -q "expected 36 tools" test/mount.test.mjs
      - grep -q "expected 36 registered tools" test/mount.test.mjs
      - grep -q "expected 33 commands" test/mount.test.mjs
      - grep -q "expected 27 capability keys" test/mount.test.mjs
      - grep -q "gsdMvpPhase" test/_capabilities.test.mjs
      - grep -q "gsdMvpPhase" test/render.test.mjs
      - node --test test/mount.test.mjs test/_capabilities.test.mjs test/render.test.mjs exits 0
    </acceptance_criteria>
    <done>test/mount.test.mjs, test/_capabilities.test.mjs, and test/render.test.mjs pass with the new tool/command/capability reflected in counts and EXPECTED arrays.</done>
  </task>
</tasks>

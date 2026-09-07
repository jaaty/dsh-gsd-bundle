---
phase: 56-fast-mode
plan: 01
type: execute
wave: 1
depends_on: []
files_modified: ["lib/quick.js", "lib/_capabilities.js", "lib/commands.js", "lib/autonomous.js", "test/mount.test.mjs"]
autonomous: true
requirements: ["CLH-06"]
user_setup: []
must_haves:
  truths:
    - "A user can invoke gsd_fast_mode on a simple phase and it completes the phase end-to-end in one pass (auto-CONTEXT -> one executor -> SUMMARY -> lightweight verify -> full ship via gsd_ship)."
    - "gsd_fast_mode refuses a phase already marked Complete in ROADMAP."
    - "A failed fast-mode run stops and leaves the phase uncompleted in STATE (no partial 'Complete')."
    - "The /gsd-fast-mode slash command routes to the gsd_fast_mode tool."
  artifacts:
    - path: "lib/quick.js"
      provides: "the gsd_fast_mode single-pass tool and the gsdFastMode capability"
      min_lines: 40
      exports: ["name", "inject", "apply"]
    - path: "lib/_capabilities.js"
      provides: "the gsdFastMode capability descriptor (CAPABILITY_KEYS + TABLE)"
      min_lines: 1
      exports: ["CAPABILITY_KEYS", "TABLE", "buildCapability"]
    - path: "lib/commands.js"
      provides: "the /gsd-fast-mode slash command entry"
      min_lines: 1
      exports: ["name", "inject", "apply"]
    - path: "lib/autonomous.js"
      provides: "buildAutoContext optional mode param for the fast-path CONTEXT marker"
      min_lines: 1
      exports: ["buildAutoContext"]
    - path: "test/mount.test.mjs"
      provides: "updated tool/command/capability exact counts + EXPECTED arrays"
      min_lines: 1
  key_links:
    - from: "lib/quick.js"
      to: "lib/autonomous.js"
      via: "gsd_fast_mode imports buildAutoContext and passes the fast-path mode marker"
      pattern: "buildAutoContext"
    - from: "lib/quick.js"
      to: "lib/ship.js"
      via: "gsd_fast_mode finds gsd_ship via ctx.tools.find and invokes its execute for the full ship"
      pattern: "gsd_ship"
    - from: "lib/quick.js"
      to: "lib/_git-artifacts.js"
      via: "gsd_fast_mode calls ensurePhaseBranch + commitArtifacts"
      pattern: "ensurePhaseBranch"
    - from: "lib/quick.js"
      to: "lib/_runner.js"
      via: "gsd_fast_mode spawns the fast executor via spawnSubagent"
      pattern: "spawnSubagent"
---

<objective>
Land the core fast-mode implementation: a new gsd_fast_mode tool (plus the gsdFastMode capability and /gsd-fast-mode command) that drives a SIMPLE phase through a single-pass path — auto-CONTEXT -> one fresh-context executor -> SUMMARY -> lightweight verify -> full ship via gsd_ship — with fail-fast error handling. This is the tracer: the thinnest end-to-end slice touching every layer (capability, command, tool, artefact model, ship delegation). It is additive only: the full loop, gsd_quick, and gsd_quick_batch are untouched.
</objective>

<context>
@lib/quick.js — the existing gsd_quick / gsd_quick_batch tools; add gsd_fast_mode here (third ctx.provide + third ctx.tools.register). Read the QUICK_PROMPT, spawnSubagent call, and commitArtifacts usage.
@lib/_capabilities.js — CAPABILITY_KEYS + TABLE; add the gsdFastMode descriptor mirroring gsdQuickBatch (step quick, role alternate, order 25).
@lib/commands.js — COMMANDS array; add the gsd-fast-mode entry mirroring gsd-quick-batch.
@lib/autonomous.js — buildAutoContext (lines 56-107); add an optional mode param so fast-mode can mark its CONTEXT 'Auto-generated (discuss skipped — fast path)'.
@lib/_git-artifacts.js — ensurePhaseBranch(cwd, phaseNum) and commitArtifacts(cwd, phaseNum, opts); both no-throw in project-less/non-repo workspaces.
@lib/_runner.js — spawnSubagent(ctx, exec, { label, promptText }) and cwdOf(exec).
@lib/ship.js — the gsd_ship execute (gate 1 requires a VERIFICATION.md with status: passed; gate 2 clean tree; gate 3 feature branch). Fast-mode writes a minimal VERIFICATION.md then invokes gsd_ship.execute via ctx.tools.find.
@lib/state.js — writeArtifact/readArtifact/hasArtifact/phaseDirAndBase accessors (lines 708-755).
@test/mount.test.mjs — exact-count assertions (34 tools, 31 commands, 25 caps) + EXPECTED_TOOL_NAMES / EXPECTED_COMMAND_NAMES arrays; update in the SAME commit as the tool (R3).
</context>

<tasks>
  <task type="auto">
    <name>Task 1: Add gsdFastMode capability, /gsd-fast-mode command, and the gsd_fast_mode single-pass tool</name>
    <files>lib/_capabilities.js, lib/commands.js, lib/autonomous.js, lib/quick.js</files>
    <read_first>lib/_capabilities.js, lib/commands.js, lib/autonomous.js, lib/quick.js, lib/ship.js, lib/_git-artifacts.js, lib/_runner.js</read_first>
    <action>
      Implement the full fast-mode surface. Four files change:

      1. lib/_capabilities.js — add "gsdFastMode" to CAPABILITY_KEYS immediately after "gsdQuickBatch" and before "gsdExecute". Add a gsdFastMode entry to the TABLE object: step "quick", role "alternate", tools ["gsd_fast_mode"], commands ["gsd-fast-mode"], order 25, prereq [], next [], produces [], consumes []. Mirror the gsdQuickBatch block exactly (lib/_capabilities.js:164-174).

      2. lib/commands.js — add a gsd-fast-mode entry to the COMMANDS array immediately after the gsd-quick-batch entry (lib/commands.js:252-265). name "gsd-fast-mode", description "Fast mode phase N: lightweight single-pass fast path for a simple phase (auto-CONTEXT -> one executor -> SUMMARY -> lightweight verify -> full ship).", hint "<N>". build(raw): parse n via phaseNum(raw); if !n return { err: "Usage: /gsd-fast-mode <N>" }; else return { text: `Run the gsd_fast_mode tool on phase ${n}: a lightweight single-pass fast path that auto-derives a minimal CONTEXT, runs the phase through one fresh-context executor, records a SUMMARY, performs a lightweight verify, and ships the phase the full way.`, ack: `Fast mode phase ${n} -> gsd_fast_mode.` }.

      3. lib/autonomous.js — change buildAutoContext (line 56) to accept an optional second parameter: `export function buildAutoContext(phase, mode = "Auto-generated (discuss skipped — autonomous path)")`. Replace the hardcoded marker line 64 `"**Mode: Auto-generated (discuss skipped — autonomous path)**"` with `"**Mode: " + mode + "**"`. The default keeps the existing autonomous output byte-identical; fast-mode passes "Auto-generated (discuss skipped — fast path)".

      4. lib/quick.js — add the gsd_fast_mode tool and gsdFastMode capability:
         - Extend the import from "./_shared.js" to also bring in today (currently imports slugify, today, nowIso — today is already imported, so no change needed; verify). Add imports: `import { buildAutoContext } from "./autonomous.js";` and `import { ensurePhaseBranch } from "./_git-artifacts.js";` (commitArtifacts is already imported).
         - After the gsdQuickBatch provide (line 33), add `ctx.provide("gsdFastMode", buildCapability("gsdFastMode"));`.
         - Add a FAST_PROMPT constant (mirroring QUICK_PROMPT at line 17) that instructs the fast executor to: orient by reading .planning/STATE.md if it exists; do the phase goal in one pass using existing functions/patterns; commit source changes atomically with a conventional-commit message (never blanket "git add -A"); write the phase SUMMARY to the artefact base path `<base>-SUMMARY.md` (under .planning/phases/<base>/) with frontmatter `phase: <base>` and `status: complete` followed by a `# Summary` body; and return a short summary of what was done plus the commit hash.
         - Register the gsd_fast_mode tool via ctx.tools.register(defineTool({ ... })) with:
           - name "gsd_fast_mode", description naming the single-pass fast path and that it refuses already-Complete phases.
           - parameters: { phase: { type: "number", required: true } }.
           - output: { schema: { type: "string" }, render: (_a, v) => [{ type: "text", text: v }] }.
           - async execute(args, exec) implementing, in order:
             a. const cwd = cwdOf(exec); const s = gsd(); if (!s) throw new Error("gsd_fast_mode: gsdState service unavailable"); if (!(await s.isProject(cwd))) throw new Error("gsd_fast_mode: no .planning/ project — run gsd_init first"); const roadmap = await s.readRoadmap(cwd); if (!roadmap) throw new Error("gsd_fast_mode: unreadable ROADMAP.md"); const phase = (roadmap.phases || []).find((p) => p.n === args.phase); if (!phase) throw new Error(`gsd_fast_mode: phase ${args.phase} not in ROADMAP.md`); if (phase.status === "Complete") throw new Error(`gsd_fast_mode: phase ${args.phase} is already Complete — fast mode refuses completed phases`).
             b. await ensurePhaseBranch(cwd, phase.n) (D-06 branch gate; throws on hard failure -> fail-fast).
             c. const { base } = await s.phaseDirAndBase(cwd, phase.n); await s.writeArtifact(cwd, phase.n, "CONTEXT", buildAutoContext(phase, "Auto-generated (discuss skipped — fast path)")) (D-03).
             d. const subagents = ctx.get("subagents"); if (!subagents) throw new Error("gsd_fast_mode: `subagents` service unavailable"); const r = await spawnSubagent(ctx, exec, { label: `fast phase ${phase.n}`, promptText: `${FAST_PROMPT}\n\nPHASE: ${phase.n} (${phase.name})\nARTEFACT BASE: ${base}\nGOAL: ${phase.goal}\nREQUIREMENTS: ${(phase.requirements || []).join(", ")}` }) (D-04). A spawn/run throw propagates (fail-fast, D-07).
             e. Lightweight verify read-back (D-05): const summary = await s.readArtifact(cwd, phase.n, "SUMMARY").catch(() => ""); if (!summary) throw new Error(`gsd_fast_mode: executor did not write a SUMMARY for phase ${phase.n}`); const context = await s.readArtifact(cwd, phase.n, "CONTEXT").catch(() => ""); if (!context) throw new Error(`gsd_fast_mode: CONTEXT missing for phase ${phase.n}`). Then write a minimal VERIFICATION.md via await s.writeArtifact(cwd, phase.n, "VERIFICATION", `---\nphase: ${base}\nverified: ${today()}\nstatus: passed\nmode: fast\n---\n# Verification\n\nFast-path lightweight verify (D-05): SUMMARY present, CONTEXT present, executor completed.`) so gsd_ship gate 1 passes.
             f. await commitArtifacts(cwd, phase.n, { scope: "fast-mode", phaseName: phase.name }) to commit .planning (D-06).
             g. Ship the full way (D-06): const tools = Array.isArray(ctx.tools) ? ctx.tools : []; const shipTool = tools.find((t) => t && t.name === "gsd_ship"); if (!shipTool) throw new Error("gsd_fast_mode: gsd_ship tool not registered — cannot ship"); const shipOut = await shipTool.execute({ phase: phase.n }, exec). A throw here propagates (fail-fast, D-07).
             h. return `gsd_fast_mode complete for phase ${phase.n} (${phase.name}).\n\n${shipOut}`.
           - presentCall: (a) => ({ card: "generic", title: `Fast mode phase ${a.phase}`, kind: "other", rawInput: { phase: a.phase } }).
    </action>
    <verify>node --check lib/quick.js && node --check lib/_capabilities.js && node --check lib/commands.js && node --check lib/autonomous.js</verify>
    <acceptance_criteria>
      - grep -q "gsdFastMode" lib/_capabilities.js
      - grep -q "gsd_fast_mode" lib/_capabilities.js
      - grep -q "gsd-fast-mode" lib/_capabilities.js
      - grep -q "gsd-fast-mode" lib/commands.js
      - grep -q "gsd_fast_mode" lib/quick.js
      - grep -q "buildAutoContext" lib/quick.js
      - grep -q "ensurePhaseBranch" lib/quick.js
      - grep -q "Auto-generated (discuss skipped — fast path)" lib/quick.js
      - grep -q "mode = \"Auto-generated (discuss skipped — autonomous path)\"" lib/autonomous.js
      - node --check passes (exit 0) for all four files
    </acceptance_criteria>
    <done>gsd_fast_mode is registered with the full single-pass flow, gsdFastMode capability and /gsd-fast-mode command exist, and buildAutoContext accepts a mode param; all four files pass node --check.</done>
  </task>

  <task type="auto">
    <name>Task 2: Update mount-test exact counts and EXPECTED arrays for the new tool/command/capability</name>
    <files>test/mount.test.mjs</files>
    <read_first>test/mount.test.mjs</read_first>
    <action>
      Update test/mount.test.mjs so the offline mount harness reflects the three new registrations (R3 — same commit as the tool):
      1. Add "gsd_fast_mode" to EXPECTED_TOOL_NAMES (test/mount.test.mjs:105-117), e.g. after "gsd_quick_batch".
      2. Add "gsd-fast-mode" to EXPECTED_COMMAND_NAMES (test/mount.test.mjs:120-132), e.g. after "gsd-quick-batch".
      3. Bump the exact-count assertions: tools 34 -> 35 (lines 147 and 328), commands 31 -> 32 (line 148), capability keys 25 -> 26 (line 159). The "absent capability" test at line 190 asserts 30 commands when gsdQuick is withdrawn — recompute: with gsdFastMode added, the full command set is 32; withdrawing gsdQuick removes only gsd-quick (gsdFastMode is a separate capability), so the expected count there becomes 31. Update line 190 to 31.
      4. Verify the full-set mount test (line 454) still lists every capability key via CAPABILITY_KEYS (it iterates CAPABILITY_KEYS, so it auto-covers gsdFastMode — no change needed beyond the count).
    </action>
    <verify>node --test test/mount.test.mjs</verify>
    <acceptance_criteria>
      - grep -q "gsd_fast_mode" test/mount.test.mjs
      - grep -q "gsd-fast-mode" test/mount.test.mjs
      - grep -q "expected 35 tools" test/mount.test.mjs
      - grep -q "expected 32 commands" test/mount.test.mjs
      - grep -q "expected 26 capability keys" test/mount.test.mjs
      - node --test test/mount.test.mjs exits 0
    </acceptance_criteria>
    <done>test/mount.test.mjs passes with the new tool/command/capability reflected in counts and EXPECTED arrays.</done>
  </task>
</tasks>

---
phase: 36-spec-phase
plan: 02
type: tdd
wave: 2
depends_on: ["GSD-36-spec-phase-01"]
files_modified: ["lib/spec.js", "lib/_agents.js", "package.json", "cordis.patch.yml", "test/helpers/mount-harness.mjs", "test/mount.test.mjs", "test/coeffect.test.mjs", "test/spec.test.mjs"]
autonomous: true
requirements: ["GAP-02"]
user_setup: []
must_haves:
  truths:
    - "Running gsd_spec_phase on a phase writes <NN>-SPEC.md in the phase dir containing falsifiable Requirements (each with Current/Target/Acceptance), Boundaries, Constraints, and an Ambiguity Report table with per-dimension score + min + status."
    - "A phase whose spec scores ambiguity <= 0.20 AND all four dimensions at/above their minimums (goal 0.75, boundary 0.70, constraint 0.65, acceptance 0.70) is written with the ambiguity gate PASSING and no overage flags."
    - "When the ambiguity score is above 0.20 OR any dimension is below its minimum, SPEC.md is still written but records the overage and flags the below-minimum dimension(s) as planner assumptions."
    - "When the scoring subagent errors or times out, SPEC.md is still written with the Ambiguity Report marked UNAVAILABLE and the real cause reported - the phase never hard-blocks (D-07)."
    - "Running gsd_spec_phase advances STATE to the spec step (status 'spec', next_action 'discuss-phase') and commits the artifacts on the phase-N branch via the shared git seam."
    - "gsd_spec_phase is registered as a tool and /gsd-spec-phase as a command across a full mount, and the spec plugin declares 'subagents' in its inject array (DEGR-07)."
    - "A non-auto gsd_spec_phase call with no requirements errors with Socratic-interview guidance; an auto=true call with omitted requirements derives defaults from the ROADMAP phase/REQUIREMENTS (D-03)."
  artifacts:
    - path: "lib/spec.js"
      provides: "The spec-phase loop-step plugin: gsd_spec_phase tool orchestration (validate->assemble SPEC->score->gate->write->STATE->commit), SPEC weights/minimums constants, and the ambiguity-scoring structured subagent call"
      min_lines: 140
      exports: ["name", "inject", "apply"]
    - path: "lib/_agents.js"
      provides: "The SPEC_SCORER_PROMPT fresh-context role prompt consumed by spec.js's ambiguity scorer"
      min_lines: 5
      exports: ["SPEC_SCORER_PROMPT"]
  key_links:
    - from: "lib/spec.js"
      to: "lib/state.js"
      via: "execute calls s.writeArtifact(cwd, phaseNum, 'SPEC', body) then s.setActivePhase(cwd, phaseNum, 'spec') then s.addDecision, and the git seam commitArtifacts(cwd, phaseNum, { scope: 'spec', phaseName })"
      pattern: "writeArtifact\\(.*'SPEC'"
    - from: "lib/spec.js"
      to: "lib/_agents.js"
      via: "execute builds promptText from SPEC_SCORER_PROMPT and calls spawnSubagent(ctx, exec, { label: 'spec-ambiguity-scorer', outputSchema: SPEC_SCORER_SCHEMA })"
      pattern: "spawnSubagent.*SPEC_SCORER_PROMPT"
---
<objective>
Deliver the spec-phase plugin: a full loop-step plugin lib/spec.js (gsd_spec_phase tool, gsdSpec capability, /gsd-spec-phase command) that produces a falsifiable SPEC.md gated by an ambiguity-scoring score (<=0.20 across four weighted dimensions with per-dimension minimums), and wire its mount surface (package.json export, cordis.patch.yml row, mount-harness PATCH_ROWS, mount/coeffect test expectations). This plan carries the phase's core requirement GAP-02 and is TDD (D-12): the test file drives every behaviour RED then GREEN.
</objective>

<context>
@lib/discuss.js, @lib/_runner.js, @lib/_agents.js, @lib/_git-artifacts.js, @lib/_capabilities.js, @test/helpers/mount-harness.mjs, @test/mount.test.mjs, @test/coeffect.test.mjs, @test/removal.test.mjs, @test/discuss-artifacts.test.mjs
</context>

<tasks>
  <task type="auto">
    <name>Task 1 (RED->GREEN): create lib/spec.js tracer - gsd_spec_phase writes a scored SPEC.md and advances STATE</name>
    <files>lib/spec.js, lib/_agents.js, test/spec.test.mjs</files>
    <read_first>lib/discuss.js, lib/_runner.js, lib/_git-artifacts.js, lib/_capabilities.js, test/helpers/mount-harness.mjs</read_first>
    <action>
      RED: Write test/spec.test.mjs first (mirror the offline mountSubset + FakeFs pattern from test/discuss-artifacts.test.mjs and test/removal.test.mjs makeRichSubagents). Add a controllable fake subagents service (factory) that returns a PASSING scored structured object. Add tests asserting that after running gsd_spec_phase via ctx.tools.find((t) => t.name === "gsd_spec_phase").execute({ phase: 1, auto: true }, makeExec()), the artifact read via ctx.get("gsdState").readArtifact(CWD, 1, "SPEC") contains the Requirements section with Current/Target/Acceptance and an Ambiguity Report, and that STATE (read via gsdState methods/STATE.md) shows status "spec" and next_action "discuss-phase". Run RED (test fails - module/export missing).

      GREEN: Create lib/spec.js as a full loop-step plugin:
      (a) Module header/imports mirroring lib/discuss.js: import { defineTool } from "@deepseek-ai/dsh-tools"; import { nowIso, today, slugify } from "./_shared.js"; import { cwdOf } from "./_runner.js"; import { ensurePhaseBranch, commitArtifacts } from "./_git-artifacts.js"; import { buildCapability } from "./_capabilities.js"; import { spawnSubagent } from "./_runner.js"; import { SPEC_SCORER_PROMPT } from "./_agents.js". Note the research canonicalized the helper name spawnSubagent (also referenced as spawnSubagent elsewhere) - use the export actually present in lib/_runner.js.
      (b) const name = "gsd-spec"; const inject = ["gsdState", "tools", "subagents"] (REQUIRED for DEGR-07/coeffect - do NOT omit "subagents").
      (c) Define frozen constants SPEC_WEIGHTS = Object.freeze({ goal: 0.35, boundary: 0.25, constraint: 0.20, acceptance: 0.20 }) and SPEC_MINIMUMS = Object.freeze({ goal: 0.75, boundary: 0.70, constraint: 0.65, acceptance: 0.70 }), and SPEC_SCORER_SCHEMA (mirror the restricted object-rooted subset used by map-codebase's QUERY_ANSWER_SCHEMA) matching { dimensions: [{ dimension: "goal"|"boundary"|"constraint"|"acceptance", score: number, note: string }], below_minimum: [string] }.
      (d) apply(ctx): ctx.provide("gsdSpec", buildCapability("gsdSpec")); ctx.tools.register(defineTool({ name: "gsd_spec_phase", description: "Spec phase (opengsd /gsd-spec-phase): produce a SPEC.md with falsifiable requirements (Current/Target/Acceptance) gated by an ambiguity-scoring score (<=0.20). Run before discuss.", parameters: { phase: { type: "number", required: true }, auto: { type: "boolean" }, goal: { type: "string" }, background: { type: "string" }, requirements: { type: "array", items: { type: "object" } }, boundaries: { type: "object" }, constraints: { type: "array", items: { type: "string" } }, acceptance_criteria: { type: "array", items: { type: "string" } }, interview_log: { type: "array", items: { type: "string" } } }, output: { schema: { type: "string" }, render: (_a, v) => [{ type: "text", text: v }] }, execute: async (args, exec) => { ... }, presentCall: (a) => ({ card: "generic", title: `Spec phase ${a.phase}`, kind: "other", rawInput: { auto: !!a.auto } }) })));
      (e) execute body (order matters, mirror discuss):
        1) const cwd = cwdOf(exec); const s = gsd(); throw if s unavailable; if (!(await s.isProject(cwd))) throw "gsd_spec_phase: no .planning/ project - run gsd_init first"; const roadmap = await s.readRoadmap(cwd); const phase = (roadmap?.phases || []).find((p) => p.n === args.phase); if (!phase) throw "gsd_spec_phase: phase N not in ROADMAP.md".
        2) const branchInfo = await ensurePhaseBranch(cwd, args.phase).
        3) Resolve requirements: let reqs = args.requirements; if (!reqs || reqs.length === 0) { if (args.auto) { derive defaults (D-03). WARNING DATA SHAPE: ROADMAP phase.requirements is a flat array of REQ-ID STRINGS (e.g. ["GAP-02"]), NOT objects - so phase.requirements itself has no .text. Build a map from REQUIREMENTS.md instead: const reqsMeta = await s.readRequirements(cwd) (array of { id, text, complete } per _shared.js parseRequirements), then const textById = Object.fromEntries(reqsMeta.map((r) => [r.id, r.text])). For each reqId in (phase.requirements || []), derive { current: "(not started)", id: reqId, target: textById[reqId] || reqId (fall back to the REQ-ID itself when the id is not in REQUIREMENTS.md - never "undefined"), acceptance: "REQ-<reqId> delivered and its acceptance criteria verified by gsd_verify" }. Set goal fallback to phase.goal } else throw "gsd_spec_phase: no requirements supplied - hold the Socratic interview (or pass auto=true to derive defaults from ROADMAP)" }.
        4) Falsifiability guard (D specifics): for each req, if (!req.acceptance || String(req.acceptance).trim() === "") throw "gsd_spec_phase: every requirement must be falsifiable - provide a non-empty Acceptance check (Current/Target/Acceptance)". (fail-fast, D-11).
        5) Assemble the SPEC body (SPEC.md) as a string: a "# Phase N: <${phase.name}> - Spec" header with gathered date; "## Requirements" with one entry per req showing **Current:** / **Target:** / **Acceptance:**; "## Boundaries" with in_scope/out_of_scope lists; "## Constraints" list; "## Acceptance Criteria" list; an "## Edge Coverage / Prohibitions" section marked "OUT OF SCOPE (later phase)" per D-10; "## Interview Log" with interview_log entries or an "auto mode: defaults selected from ROADMAP" line when auto and no log.
        6) Score via structure subagent with degrade-on-failure (D-07): build promptText = SPEC_SCORER_PROMPT + the assembled SPEC draft + the phase REQUIREMENTS/ROADMAP context; try { const r = await spawnSubagent(ctx, exec, { label: "spec-ambiguity-scorer", promptText, outputSchema: SPEC_SCORER_SCHEMA }); const dims = r.structured?.dimensions; } catch (e) { mark score = null, scoreError = String(e?.message || e). mark scoring = "UNAVAILABLE". } When structured missing any of the four dimensions with a finite 0..1 score, treat as scoring UNAVAILABLE (cannot compute reliably).
        7) When scoring succeeded: compute weighted clarity = SPEC_WEIGHTS.goal*goal + SPEC_WEIGHTS.boundary*boundary + SPEC_WEIGHTS.constraint*constraint + SPEC_WEIGHTS.acceptance*acceptance; ambiguity = 1 - weightedClarity. gatePass = (ambiguity <= 0.20) AND every dimension score >= its SPEC_MINIMUMS entry. belowMin = dimensions where score < min. Build the Ambiguity Report table string listing per-dimension score, min, and PASS/UNDER-MIN status plus overall ambiguity and gate PASSED/OVERRUN.
        8) Compose SPEC.md = the assembled body + the "## Ambiguity Report" (or the UNAVAILABLE-marked report + real cause) + a prominent overage flag block when scoring succeeded and gatePass is false (D-06 soft gate: still write). Write it via const ctxPath = await s.writeArtifact(cwd, args.phase, "SPEC", specBody). This is the ONLY artefact write - route it through ctx.fs (DUR-06/CQ-01), never raw node:fs.
        9) Advance STATE: await s.setActivePhase(cwd, args.phase, "spec"); await s.addDecision(cwd, `Phase ${args.phase}: SPEC.md sealed (ambiguity ${ambiguityStr})`).
        10) Commit via const commit = await commitArtifacts(cwd, args.phase, { scope: "spec", phaseName: phase.name }) (never an inline git call).
        11) Return a string reporting the SPEC path, the ambiguity score, the gate status (PASSING/OVERRUN/UNAVAILABLE), any below-minimum dimension(s) flagged as planner assumptions, the STATE advance, and the commit summary (mirror discuss's return wording style). When scoring was UNAVAILABLE, report the real cause prominently. Never throw after the env-validation step (D-07 never-throw).
      Add SPEC_SCORER_PROMPT (a string export) to lib/_agents.js near the other role prompts, instructing the fresh scorer to read the SPEC draft + phase REQUIREMENTS/ROADMAP, evaluate the four clarity dimensions (Goal Clarity / Boundary Clarity / Constraint Clarity / Acceptance Criteria clarity) each as a 0..1 score with a note and an overall below_minimum list, and return exactly the SPEC_SCORER_SCHEMA-shaped object. Make sure the test's PASSING_SCORED structured object matches SPEC_SCORER_SCHEMA exactly.
      GREEN: assert the test(s) pass (writeArtifact used, SPEC content present, STATE 'spec').
    </action>
    <verify>node --test test/spec.test.mjs</verify>
    <acceptance_criteria>
      - lib/spec.js exists with export { name = "gsd-spec", inject, apply } and `ctx.provide("gsdSpec", buildCapability("gsdSpec"))`.
      - grep-verifiable: lib/spec.js inject contains "subagents".
      - lib/_agents.js exports SPEC_SCORER_PROMPT.
      - test/spec.test.mjs (happy path + STATE assertion) passes with exit 0: SPEC artifact contains "## Requirements", "## Ambiguity Report", "Current:", "Acceptance:"; gsdState reports status "spec".
      - lib/spec.js computeWeighted uses SPEC_WEIGHTS 0.35/0.25/0.20/0.20 and SPEC_MINIMUMS 0.75/0.70/0.65/0.70 (grep the constant arrays).
    </acceptance_criteria>
    <done>lib/spec.js writes a scored SPEC.md and advances STATE to spec via the shared seams; the RED -> GREEN spec.test happy path passes.</done>
  </task>

  <task type="auto">
    <name>Task 2 (RED->GREEN): gate edge cases, falsifiability, auto/interactive dispatch</name>
    <files>test/spec.test.mjs, lib/spec.js</files>
    <read_first>test/spec.test.mjs, lib/spec.js</read_first>
    <action>
      RED: Extend test/spec.test.mjs with additional behaviours, all offline via the controllable fake scorer (controller object):
      (a) OVERRUN soft-gate: fake scorer returns dimensions scoring ambiguity above 0.20 (e.g. all scores 0.6 -> ambiguity 0.4) -> the tool still writes SPEC.md, the Ambiguity Report shows gate OVERRUN/flagged, and the returned/output text flags the overage and the below-minimum dimension(s) as planner assumptions (D-06).
      (b) DIMENSION-UNDER-MIN soft-gate: fake scorer returns a goal=1.0/boundary=1.0/constraint=0.4/acceptance=1.0 set (constraint under its 0.65 minimum even if ambiguity <= 0.20) -> the tool still writes, marks the constraint dimension UNDER-MIN, and never silent-accepts (joint two-gate check per RESEARCH 1.2).
      (c) UNAVAILABLE degradation: fake controller.fail = true (start() throws) -> SPEC.md is still written with the Ambiguity Report marked UNAVAILABLE and the real cause present; the tool does not throw (D-07).
      (d) Falsifiability reject (fail-fast, D-11/D specifics): calling execute with (auto omitted) and a requirement lacking `acceptance` throws a clear error, and SPEC.md is NOT written.
      (e) Auto/interactive dispatch (D-03): auto=true with no requirements writes a SPEC using ROADMAP/REQUIREMENTS-derived defaults (goal/REQ target/acceptance) and records an auto-mode Interview Log line; auto=false (or omitted) with no requirements throws the Socratic-interview guidance error. IMPORTANT default-derivation source: ROADMAP phase.requirements is an array of REQ-ID strings, so the auto path must map each REQ-ID to its acceptance text via s.readRequirements(cwd) (REQUIREMENTS.md) for the Target - the test's fake gsdState readRequirements must resolve at least one { id, text }. Assert that every emitted **Target:** and **Acceptance:** line in the derived SPEC is non-empty (never "undefined") and that a REQ-ID absent from REQUIREMENTS.md still produces a non-empty Target that is its own REQ-ID label.
      Run each RED (fails) then implement in lib/spec.js to turn it green.
      GREEN: implement the gate/flags/degrade/falsifiability/dispatch logic. Ensure the two independent gates (ambiguity <= 0.20 AND every dimension >= SPEC_MINIMUMS) are BOTH checked jointly - flag on either failing (R-2). Ensure the overrun path still writes SPEC.md (D-06) and reports the score + below-min dimensions; the UNAVAILABLE path never throws (D-07) and reports the real cause.
    </action>
    <verify>node --test test/spec.test.mjs</verify>
    <acceptance_criteria>
      - test asserts an overrun fake score -> SPEC.md written AND report contains gate OVERRUN/ambient overage AND output flags below-min dimensions (grep "below" or "assumption" in report path).
      - test asserts a dimension under-min with ambiguity <= 0.20 -> the dimension is flagged UNDER-MIN (joint gate, never silently accepted).
      - test asserts controller.fail true -> SPEC.md written with "UNAVAILABLE" in the Ambiguity Report and no throw.
      - test asserts a requirement without acceptance throws and no SPEC.md is written.
      - test asserts auto=true-without-requirements writes default-derived SPEC + auto Interview Log line; auto=false/omitted-without-requirements throws Socratic-interview guidance.
      - test asserts every **Target:** and **Acceptance:** line in a derived SPEC is non-empty (grep the SPEC body for any "Target: undefined" / "Acceptance: undefined" and assert absent), with readRequirements-derived text for REQ-IDs present in REQUIREMENTS.md.
      - node --test test/spec.test.mjs exits 0.
    </acceptance_criteria>
    <done>All gate/degrade/falsifiability/dispatch edge behaviours are covered by passing offline tests and implemented jointly in lib/spec.js.</done>
  </task>

  <task type="auto">
    <name>Task 3: mount/plumbing + coeffect + mount/coeffect test maintenance</name>
    <files>package.json, cordis.patch.yml, test/helpers/mount-harness.mjs, test/mount.test.mjs, test/coeffect.test.mjs</files>
    <read_first>package.json, cordis.patch.yml, test/helpers/mount-harness.mjs, test/mount.test.mjs, test/coeffect.test.mjs</read_first>
    <action>
      Wire the plugin surface (per RESEARCH 1.11) now that lib/spec.js exists:
      (a) package.json exports: add "./spec": { "default": "./lib/spec.js" } (alphabetically with the other ./ subpath exports). Do NOT change the files list (lib/*.js already ships it). Do NOT add dependencies.
      (b) cordis.patch.yml: add a plugin row `- id: gsd-spec` / `name: '@dsh-gsd/bundle/spec'` immediately after the gsd-discuss row in the insert block (per D-01 order).
      (c) test/helpers/mount-harness.mjs PATCH_ROWS: add { id: "gsd-spec", sub: "spec" } after the gsd-discuss row.
      (d) test/mount.test.mjs: add "gsd_spec_phase" to EXPECTED_TOOL_NAMES and "gsd-spec-phase" to EXPECTED_COMMAND_NAMES; update the numeric assertions: ctx.tools.length from 14 to 15 and ctx.commands.length from 12 to 13; update the header comment counts ("12 plugin rows", "13 gsd_* tools, 12 /gsd-* commands", and the describe label "all 12 plugins") to the 13-plugin/15-tool/13-command reality.
      (e) test/coeffect.test.mjs: add "spec" to SUBAGENT_DRIVEN_SUBS (now seven); update the header comment "six" to "seven". This passes only because lib/spec.js declares inject including "subagents" (done in Task 1).
      Run both affected suites plus spec.test to confirm the full surface registers and the coeffect holds.
    </action>
    <verify>node --test test/spec.test.mjs test/mount.test.mjs test/coeffect.test.mjs
</verify>
    <acceptance_criteria>
      - grep-verifiable: cordis.patch.yml contains an `- id: gsd-spec` / `name: '@dsh-gsd/bundle/spec'` row.
      - grep-verifiable: package.json exports contains "./spec".
      - grep-verifiable: test/helpers/mount-harness.mjs PATCH_ROWS contains { id: "gsd-spec", sub: "spec" }.
      - grep-verifiable: test/mount.test.mjs EXPECTED_TOOL_NAMES contains "gsd_spec_phase" and EXPECTED_COMMAND_NAMES contains "gsd-spec-phase", with tools.length asserted as 15 and commands.length as 13.
      - grep-verifiable: test/coeffect.test.mjs SUBAGENT_DRIVEN_SUBS includes "spec".
      - node --test test/spec.test.mjs test/mount.test.mjs test/coeffect.test.mjs exits 0.
    </acceptance_criteria>
    <done>Spec mounts as a full plugin (export, patch row, harness row, mount/coeffect expectations) and the three suites pass; the full `npm test` has no spec-related regression.</done>
  </task>
</tasks>

---
phase: 36-spec-phase
plan: 03
type: tdd
wave: 3
depends_on: ["GSD-36-spec-phase-02"]
files_modified: ["lib/discuss.js", "test/spec-discuss.test.mjs"]
autonomous: true
requirements: ["GAP-02"]
user_setup: []
must_haves:
  truths:
    - "When <NN>-SPEC.md exists, gsd_discuss reads it and echoes its Requirements/Boundaries/Acceptance into CONTEXT.md marked as LOCKED from SPEC, so what/why is locked and the interview focuses on 'how' (D-09)."
    - "When no SPEC.md exists, gsd_discuss behaves exactly as before - no SPEC read, no LOCKED markers, unchanged content (D-09 absence-preservation)."
    - "The discuss change adds no extra ensurePhaseBranch/commitArtifacts call, so the existing discuss-artifacts source-assertion tests still pass."
  artifacts: []
  key_links:
    - from: "lib/discuss.js"
      to: "lib/state.js"
      via: "execute gate on s.hasArtifact(cwd, args.phase, 'SPEC') and read via s.readArtifact(cwd, args.phase, 'SPEC'), echoing a LOCKED-from-SPEC block into the CONTEXT specifics/code_context"
      pattern: "readArtifact\\(cwd, args.phase, \"SPEC\"\\)"
---
<objective>
Teach gsd_discuss to consume an existing SPEC.md as locked 'what/why' input (D-09): when the SPEC artefact exists, its Requirements/Boundaries/Acceptance are echoed into CONTEXT.md under a LOCKED-from-SPEC marker and the tool returns guidance to focus the interview on 'how'; absence of SPEC.md preserves the current behaviour exactly. Small, isolated plan - no change to gsd_plan/gsd_verify internals this phase.
</objective>

<context>
@lib/discuss.js, @lib/state.js, @test/discuss-artifacts.test.mjs, @test/helpers/mount-harness.mjs
</context>

<tasks>
  <task type="auto">
    <name>Task 1 (RED->GREEN): gsd_discuss consumes an existing SPEC.md as locked what/why</name>
    <files>lib/discuss.js, test/spec-discuss.test.mjs</files>
    <read_first>lib/discuss.js, lib/state.js, test/helpers/mount-harness.mjs</read_first>
    <action>
      RED: Write test/spec-discuss.test.mjs (mirror test/discuss-artifacts.test.mjs + mountSubset). Mount ["state","discuss"] via mountSubset(...), initProject(ctx) to create a phase (phase 1). Pre-write a <NN>-SPEC.md via ctx.get("gsdState").writeArtifact(CWD, 1, "SPEC", '<# Phase 1: p1 - Spec>\n## Requirements\n### REQLOCKED-cache\n**Target:** phase adds a cache\n**Acceptance:** cache TTL honored'). Then run ctx.tools.find((t) => t.name === "gsd_discuss").execute({ phase: 1, domain: {...}, decisions: [{ area: "A", items: [{ id: "D-01", text: "d" }] }], canonical_refs: [{ topic: "t" }] }, makeExec()). Assert CONTEXT.md (via readArtifact(CWD, 1, "CONTEXT")) contains "LOCKED from SPEC" and "REQLOCKED-cache". Run RED (fails - no SPEC read yet).
      GREEN: In lib/discuss.js execute, after the phase lookup / branch acquisition (keep exactly one ensurePhaseBranch(cwd, args.phase) call and exactly one commitArtifacts call with scope "discuss" so the existing source assertions hold), add: const hasSpec = await s.hasArtifact(cwd, args.phase, "SPEC"); const specText = hasSpec ? await s.readArtifact(cwd, args.phase, "SPEC") : null;. When specText is truthy: build a locked specifics block that prepends to the specifics written into CONTEXT - a "**LOCKED from SPEC (what/why)**" heading plus the SPEC's Requirements / Boundaries / Acceptance Criteria content (echo the relevant lines extracted from specText; simplest robust approach: split specText into lines and re-emit the lines under the "## Requirements", "## Boundaries", and "## Acceptance Criteria" headers verbatim). Emit it into the <specifics> section before any user-supplied args.specifics, and add one code_context line "- SPEC.md locked what/why; focus this discussion on 'how'." Then, in the returned string, when specText is truthy, add a sentence telling the driving agent that what/why is already locked by SPEC and to hold the interview on 'how' only (D-09). When specText is falsy, leave every CONTEXT block and the return text byte-identical to today's behaviour. Do NOT add any ensurePhaseBranch/commitArtifacts call and do NOT touch setActivePhase(cwd, args.phase, "plan") or the commit ordering.
      GREEN: assert the test passes.
    </action>
    <verify>node --test test/spec-discuss.test.mjs</verify>
    <acceptance_criteria>
      - lib/discuss.js contains "readArtifact(cwd, args.phase, \"SPEC\")" guarded by hasArtifact.
      - The CONTEXT written when the pre-written SPEC exists contains "LOCKED from SPEC" and the sentinel "REQLOCKED-cache".
      - lib/discuss.js still has exactly one ensurePhaseBranch(cwd, args.phase) and exactly one commitArtifacts(cwd, args.phase, { scope: "discuss", phaseName: phase.name }) call.
      - node --test test/spec-discuss.test.mjs exits 0.
    </acceptance_criteria>
    <done>gsd_discuss reads and echoes an existing SPEC.md as LOCKED what/why, with CONTEXT and return-text guidance to focus on 'how'; test green.</done>
  </task>

  <task type="auto">
    <name>Task 2 (RED->GREEN): absence-preservation and regression</name>
    <files>test/spec-discuss.test.mjs, lib/discuss.js</files>
    <read_first>test/spec-discuss.test.mjs, lib/discuss.js</read_first>
    <action>
      RED: Extend test/spec-discuss.test.mjs with an absence test: mount ["state","discuss"], initProject, and DO NOT pre-write any SPEC. Run gsd_discuss with the same args. Assert CONTEXT.md does NOT contain "LOCKED from SPEC" and does NOT contain "SPEC.md locked what/why", and the specifics block reflects only the user-provided args.specifics. Run RED (fails only if the GREEN of Task 1 wrongly emits the block unconditionally - otherwise the code path already preserves absence; turn this into a passing guard).
      GREEN: Confirm/adjust lib/discuss.js so the locked block and return-text guidance are emitted only when specText is truthy (absence path emits nothing new). Run the full relevant suites.
    </action>
    <verify>node --test test/spec-discuss.test.mjs test/discuss-artifacts.test.mjs
</verify>
    <acceptance_criteria>
      - The no-SPEC CONTEXT (absence test) does not contain "LOCKED from SPEC" and does not contain "SPEC.md locked what/why".
      - test/spec-discuss.test.mjs (happy path + absence) and test/discuss-artifacts.test.mjs both pass.
      - lib/discuss.js emits the LOCKED block and the how-only guidance string only when specText is truthy (grep: the guidance string appears inside the `if (specText)` scope, not unconditionally).
      - node --test test/spec-discuss.test.mjs test/discuss-artifacts.test.mjs exits 0.
    </acceptance_criteria>
    <done>SPEC-absence preserves the exact current discuss behaviour (verified by the absence test + existing discuss-artifacts suite), and the existing CONTEXT commit/branch-order source assertions still hold.</done>
  </task>
</tasks>

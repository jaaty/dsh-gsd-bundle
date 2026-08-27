---
phase: 11-phase-dir-resolution
plan: 02
type: execute
wave: 2
depends_on: ["GSD-11-phase-dir-resolution-01"]
files_modified: ["lib/plan.js", "lib/execute.js", "lib/verify.js", "lib/ui.js"]
autonomous: true
requirements: ["CQ-01"]
gap_closure: false
user_setup: []
must_haves:
  truths:
    - "The phase tools gsd_plan, gsd_execute, gsd_verify, and gsd_ui_phase each call phaseDirAndBase(cwd, args.phase) once and use the returned dir/base directly, so the copy-pasted `phaseDir.split('/').pop()` base derivation is gone from every tool."
    - "The tools still write/read artefacts at the same .planning/phases/<NN>-<slug>/ paths as before (no behaviour change)."
  artifacts:
    - path: "lib/plan.js"
      provides: "gsd_plan tool resolving dir/base once via phaseDirAndBase and using them in its RESEARCH/PLAN prompt strings"
      min_lines: 40
      exports: ["name", "inject", "apply"]
  key_links:
    - from: "lib/plan.js, lib/execute.js, lib/verify.js, lib/ui.js"
      to: "lib/state.js (phaseDirAndBase)"
      via: "each tool destructures { dir: phaseDir, base } = await s.phaseDirAndBase(cwd, args.phase) once and interpolates phaseDir/base into its prompt strings"
      pattern: "const \\{ dir: phaseDir, base \\} = await s\\.phaseDirAndBase\\(cwd, args\\.phase\\)"
---
<objective>Replace the copy-pasted `const phaseDir = await s.phaseDir(cwd, args.phase); const base = phaseDir.split("/").pop();` pattern in the four phase tools (plan/execute/verify/ui) with a single `phaseDirAndBase` call that yields both dir and base, per D-01. This is the presentation-tier half of CQ-01: it removes the duplicated base derivation from every tool while keeping the local `phaseDir` variable name so all existing prompt-string interpolations stay byte-for-byte identical. lib/ship.js is intentionally NOT touched (verified: it has no phaseDir/base derivation).</objective>
<context>@lib/plan.js (lines 43-44, 78, 107, 117, 125), @lib/execute.js (lines 57-58, 175), @lib/verify.js (lines 38-39, 72, 90, 91), @lib/ui.js (lines 35-36, 47), @test/tools.test.mjs (fake-subagent tests that assert hardcoded artefact paths like ${CWD}/.planning/phases/01-auth/01-auth-01-PLAN.md)</context>
<tasks>
  <task type="auto">
    <name>Task 1: Refactor gsd_plan to call phaseDirAndBase once (tracer)</name>
    <files>lib/plan.js</files>
    <read_first>lib/plan.js</read_first>
    <action>In lib/plan.js, replace the two lines at 43-44 (`const phaseDir = await s.phaseDir(cwd, args.phase);` and `const base = phaseDir.split("/").pop();`) with a single line: `const { dir: phaseDir, base } = await s.phaseDirAndBase(cwd, args.phase);`. Keep the local variable name `phaseDir` (the dir) and `base` exactly as-is so every later interpolation in the method (lines 78, 107, 117, 125) stays unchanged. Do not alter any other line in the file.</action>
    <verify>node --test test/tools.test.mjs</verify>
    <acceptance_criteria>
      - grep 'const { dir: phaseDir, base } = await s.phaseDirAndBase(cwd, args.phase);' lib/plan.js returns a match
      - grep 'phaseDir.split("/").pop()' lib/plan.js returns 0 matches
      - `node --test test/tools.test.mjs` exits 0
    </acceptance_criteria>
    <done>gsd_plan resolves dir/base once via phaseDirAndBase and its tool-level tests still pass.</done>
  </task>
  <task type="auto">
    <name>Task 2: Refactor gsd_execute, gsd_verify, gsd_ui_phase to call phaseDirAndBase once</name>
    <files>lib/execute.js, lib/verify.js, lib/ui.js</files>
    <read_first>lib/execute.js, lib/verify.js, lib/ui.js</read_first>
    <action>Apply the identical single-line replacement in the three remaining tools. In lib/execute.js replace lines 57-58; in lib/verify.js replace lines 38-39; in lib/ui.js replace lines 35-36 — each with `const { dir: phaseDir, base } = await s.phaseDirAndBase(cwd, args.phase);`. Keep the local `phaseDir` and `base` names so all later interpolations (execute.js:175, verify.js:72/90/91, ui.js:47) stay unchanged. Do not alter any other line in these files.</action>
    <verify>node --test test/tools.test.mjs</verify>
    <acceptance_criteria>
      - grep -c 'const { dir: phaseDir, base } = await s.phaseDirAndBase(cwd, args.phase);' lib/execute.js lib/verify.js lib/ui.js returns 1 match in each of the three files
      - grep -c 'phaseDir.split("/").pop()' lib/execute.js lib/verify.js lib/ui.js returns 0 matches in each
      - `node --test test/tools.test.mjs` exits 0
    </acceptance_criteria>
    <done>All four phase tools resolve dir/base once via phaseDirAndBase; tool-level tests pass.</done>
  </task>
  <task type="auto">
    <name>Task 3: Full regression — no base-derivation pattern remains in lib/</name>
    <files>lib/plan.js, lib/execute.js, lib/verify.js, lib/ui.js</files>
    <read_first>lib/plan.js, lib/execute.js, lib/verify.js, lib/ui.js</read_first>
    <action>Run the full test suite and confirm the copy-pasted base-derivation pattern is fully eliminated from the tool layer. Grep the whole lib/ directory for the old pattern and for any remaining direct `s.phaseDir(cwd, args.phase)` call in the tools. Confirm lib/ship.js is untouched (it never had the pattern). If any tool still calls `s.phaseDir(cwd, args.phase)` or `phaseDir.split("/").pop()`, apply the same single-line replacement to it. Then run `npm test` and confirm 0 failures.</action>
    <verify>npm test</verify>
    <acceptance_criteria>
      - grep -rn 'phaseDir.split("/").pop()' lib/ returns 0 matches
      - grep -rn 's.phaseDir(cwd, args.phase)' lib/ returns 0 matches
      - `npm test` exits 0 (all tests pass, including the new resolve-once tests from plan 01)
    </acceptance_criteria>
    <done>The full suite passes and no tool in lib/ still derives base via phaseDir + split('/').pop().</done>
  </task>
</tasks>

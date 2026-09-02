---
phase: 51-drop-clean-branch
plan: 03
type: execute
wave: 1
depends_on: []
files_modified: ["lib/state.js", "test/health.test.mjs", "test/cleanpr-config.test.mjs"]
autonomous: true
requirements: ["SHIP-CLEAN-04"]
gap_closure: false
user_setup: []
must_haves:
  truths:
    - "workflow.clean_pr_branch is removed from _defaultConfig in lib/state.js, so existing configs that still carry it are simply ignored (no migration, D-04)."
    - "lib/health.js needs no direct edit: its W-05 required-key scan and R-02 repair set derive from Object.keys(defaultConfig.workflow), so removing the key from state.js removes it from health automatically."
    - "test/health.test.mjs contains no clean_pr_branch string and its clean_pr_branch-specific assertions are reworked to the still-required ai_integration_phase key."
  artifacts:
    - path: "lib/state.js"
      provides: "_defaultConfig with clean_pr_branch removed from the workflow block"
      min_lines: 40
      exports: []
    - path: "test/health.test.mjs"
      provides: "health tests with the local defaultConfig() helper in sync with state.js and clean_pr_branch assertions reworked to ai_integration_phase"
      min_lines: 40
      exports: []
  key_links:
    - from: "lib/state.js"
      to: "lib/health.js"
      via: "health W-05 requiredWorkflow and R-02 repairSet derive from Object.keys(defaultConfig.workflow), so the state.js removal is the single source of truth"
      pattern: "Object\\.keys\\(schema\\.workflow \\|\\| \\{\\}\\)"
---
<objective>Remove the workflow.clean_pr_branch config default from lib/state.js and rework the health tests that asserted it as a required/repairable key, then remove the cleanpr-config test (D-04, D-05). This plan is independent of the parseNameStatusZ relocation and runs in wave 1.</objective>
<context>@lib/state.js (line 196 clean_pr_branch: true in the workflow block of _defaultConfig), @lib/health.js (lines 212 and 345 derive requiredWorkflow/repairSet from Object.keys(defaultConfig.workflow) — no direct edit needed), @test/health.test.mjs (local defaultConfig() helper line 55; clean_pr_branch assertions at lines 184, 376-398, 460-463, 487-510, 549), @test/cleanpr-config.test.mjs (delete)</context>
<tasks>
  <task type="auto">
    <name>Task 1: Remove clean_pr_branch from state.js _defaultConfig and rework the health tests</name>
    <files>lib/state.js, test/health.test.mjs</files>
    <read_first>lib/state.js, lib/health.js, test/health.test.mjs</read_first>
    <action>In lib/state.js line 196 remove `clean_pr_branch: true,` from the workflow block of _defaultConfig. In test/health.test.mjs: (a) line 55 remove `clean_pr_branch: true,` from the local defaultConfig() helper so it stays in sync with state.js (R-2); (b) rework the clean_pr_branch-specific assertions to the still-required ai_integration_phase key — line 184 test "valid JSON missing a required workflow key → repairable W-05" change `clean_pr_branch: undefined` to `ai_integration_phase: undefined` (if this makes the test identical to the existing ai_integration_phase test at line 198, remove the redundant one); lines 376-398 e2e test the cfg object already omits clean_pr_branch so only update the stale comment to drop the clean_pr_branch mention; lines 460-463 test "config missing a workflow key → adds it with value true + R-02 repair" change `clean_pr_branch: undefined` to `ai_integration_phase: undefined` and the assertions to ai_integration_phase (if this duplicates the existing ai_integration_phase test at line 466, remove the redundant one); line 487 helper comment update to drop the clean_pr_branch mention; line 549 remove the `assert.equal(parsed.workflow.clean_pr_branch, true, ...)` assertion (keep the ai_integration_phase assertion at line 550). After the rework test/health.test.mjs must contain no "clean_pr_branch" string.</action>
    <verify>node --test test/health.test.mjs; grep -n "clean_pr_branch" test/health.test.mjs</verify>
    <acceptance_criteria>
      - grep -n "clean_pr_branch" lib/state.js returns nothing
      - grep -n "clean_pr_branch" test/health.test.mjs returns nothing
      - node --test test/health.test.mjs exits 0
    </acceptance_criteria>
    <done>clean_pr_branch is gone from _defaultConfig and from test/health.test.mjs, and the health suite passes with the assertions reworked to ai_integration_phase.</done>
  </task>
  <task type="auto">
    <name>Task 2: Delete test/cleanpr-config.test.mjs</name>
    <files>test/cleanpr-config.test.mjs</files>
    <read_first>test/cleanpr-config.test.mjs</read_first>
    <action>Delete test/cleanpr-config.test.mjs. It asserts lib/state.js defaults clean_pr_branch: true inside the workflow block and that README mentions phase-<N>-clean — both now removed (state.js in task 1, README in plan 02).</action>
    <verify>test -f test/cleanpr-config.test.mjs</verify>
    <acceptance_criteria>
      - test -f test/cleanpr-config.test.mjs returns non-zero (file absent)
    </acceptance_criteria>
    <done>test/cleanpr-config.test.mjs is deleted.</done>
  </task>
  <task type="auto">
    <name>Task 3: Confirm the full suite passes</name>
    <files>lib/state.js, test/health.test.mjs</files>
    <read_first>lib/state.js</read_first>
    <action>Run the full suite `npm test` and confirm it passes. Note: at this wave the clean-branch code still exists in lib/ship.js (plan 02 removes it in wave 2), so pr-branch.test.mjs and gates-ship.test.mjs still pass — the config-key removal does not break them because they test resolveCleanPr with explicit config objects, not via state.js defaults.</action>
    <verify>npm test</verify>
    <acceptance_criteria>
      - npm test exits 0
    </acceptance_criteria>
    <done>The full suite passes after the config-key removal and health-test rework.</done>
  </task>
</tasks>

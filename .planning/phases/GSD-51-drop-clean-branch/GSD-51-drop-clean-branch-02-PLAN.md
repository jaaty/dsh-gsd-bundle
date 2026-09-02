---
phase: 51-drop-clean-branch
plan: 02
type: execute
wave: 2
depends_on: ["GSD-51-drop-clean-branch-01"]
files_modified: ["lib/ship.js", "lib/_clean-branch.js", "README.md", "test/pr-branch.test.mjs", "test/gates-ship.test.mjs", "test/ship-async.test.mjs"]
autonomous: true
requirements: ["SHIP-CLEAN-01", "SHIP-CLEAN-04"]
gap_closure: false
user_setup: []
must_haves:
  truths:
    - "gsd_ship pushes and PRs the phase-NN branch directly; no phase-NN-clean branch is built, pushed, or cherry-picked (SHIP-CLEAN-01)."
    - "lib/_clean-branch.js no longer exists and no lib/ or test/ file references it."
    - "The completion-state commit lands on phase-NN and is pushed there only; the PR is created with --base and no --head (gh pr create defaults the head to the current branch, D-02)."
  artifacts:
    - path: "lib/ship.js"
      provides: "gsd_ship with the clean-branch import, no_clean_pr param, resolveCleanPr, step 5.7 build, clean-branch push, --head arg, and completion-state cherry-pick all removed"
      min_lines: 40
      exports: ["name", "inject", "apply", "preflightError", "runLearningsOnShip"]
    - path: "README.md"
      provides: "the Clean-PR branch section replaced with a statement that gsd_ship PRs the phase-NN branch directly"
      min_lines: 40
      exports: []
  key_links:
    - from: "lib/ship.js"
      to: "gh pr create"
      via: "PR created with --base defaultBranch and no --head (head defaults to the current phase-NN branch)"
      pattern: "\"pr\", \"create\", \"--title\""
---
<objective>Remove the clean-PR branch feature from gsd_ship so it pushes and PRs the phase-NN branch directly, delete lib/_clean-branch.js (after plan 01 relocated parseNameStatusZ), update the README, and remove/update the clean-branch tests (D-02, D-05). This is the core removal plan.</objective>
<context>@lib/ship.js (clean-branch touchpoints: import line 19, no_clean_pr param line 95, resolveCleanPr+log lines 140-141, step 5.7 build lines 186-206, clean-branch push lines 213-220, --head line 275, completion-state cherry-pick lines 311-324), @lib/_clean-branch.js (delete after plan 01 relocated parseNameStatusZ), @README.md (line 226 Clean-PR branch section), @test/pr-branch.test.mjs (delete), @test/gates-ship.test.mjs (GSD-35 blocks lines 224-272), @test/ship-async.test.mjs (clean-branch propagation test lines 63-72)</context>
<tasks>
  <task type="auto">
    <name>Task 1: Remove every clean-branch touchpoint from lib/ship.js</name>
    <files>lib/ship.js</files>
    <read_first>lib/ship.js</read_first>
    <action>In lib/ship.js remove all of the following, leaving the surrounding phase-NN logic intact: (a) line 19 `import { buildCleanBranch, resolveCleanPr, cleanBranchName } from "./_clean-branch.js";`; (b) line 95 the `no_clean_pr: { type: "boolean", ... }` parameter in the defineTool parameters object; (c) lines 140-141 `const cleanPr = resolveCleanPr(cfg, args.no_clean_pr);` and `log.push(\`clean-PR branch: ${cleanPr ? "on" : "off"}\`);`; (d) lines 186-206 the `let prBranch = branch;` declaration and the entire `if (cleanPr) { ... buildCleanBranch ... }` step-5.7 block; (e) lines 213-220 the `if (cleanPr && prBranch !== branch) { ... push prBranch ... }` block (KEEP the phase-NN push at line 209); (f) line 275 `if (prBranch) prArgs.push("--head", prBranch);`; (g) lines 311-324 the `if (cleanPr && prBranch !== branch) { ... switch/cherry-pick/push/switch ... }` block (KEEP the completion-state commit on phase-NN and its push at line 303). After removal the PR is created with `["pr", "create", "--title", title, "--body-file", tmp, "--base", defaultBranch]` plus optional `--draft` and NO `--head` (D-02). Ensure no dangling reference to prBranch or cleanPr remains anywhere in the file.</action>
    <verify>grep -n "cleanBranch\|cleanPr\|prBranch\|no_clean_pr\|_clean-branch\|--head\|buildCleanBranch\|resolveCleanPr" lib/ship.js</verify>
    <acceptance_criteria>
      - grep -n "cleanBranch\|cleanPr\|prBranch\|no_clean_pr\|_clean-branch\|--head\|buildCleanBranch\|resolveCleanPr" lib/ship.js returns nothing
      - grep -n "pr\", \"create\"" lib/ship.js returns the PR-creation line with --base and no --head
    </acceptance_criteria>
    <done>lib/ship.js contains no clean-branch code, variable, import, or --head argument; the PR head is the current phase-NN branch.</done>
  </task>
  <task type="auto">
    <name>Task 2: Delete lib/_clean-branch.js and update the README Clean-PR branch section</name>
    <files>lib/_clean-branch.js, README.md</files>
    <read_first>README.md</read_first>
    <action>Delete lib/_clean-branch.js entirely (parseNameStatusZ was already relocated to lib/_shared.js in plan 01, so nothing surviving needs this module). In README.md, replace the "### Clean-PR branch" section (line 226) with a short statement that gsd_ship pushes and PRs the phase-NN branch directly (one branch per phase), removing every reference to phase-<N>-clean, workflow.clean_pr_branch, and the no_clean_pr parameter. Keep the surrounding README structure intact.</action>
    <verify>test -f lib/_clean-branch.js; grep -n "phase-<N>-clean\|no_clean_pr\|clean_pr_branch\|clean-PR" README.md</verify>
    <acceptance_criteria>
      - test -f lib/_clean-branch.js returns non-zero (file absent)
      - grep -n "phase-<N>-clean\|no_clean_pr\|clean_pr_branch\|clean-PR" README.md returns nothing
    </acceptance_criteria>
    <done>lib/_clean-branch.js is deleted and the README no longer documents the removed feature.</done>
  </task>
  <task type="auto">
    <name>Task 3: Remove/update the clean-branch tests and run the full suite</name>
    <files>test/pr-branch.test.mjs, test/gates-ship.test.mjs, test/ship-async.test.mjs</files>
    <read_first>test/gates-ship.test.mjs, test/ship-async.test.mjs</read_first>
    <action>Delete test/pr-branch.test.mjs (the whole clean-branch core test file). In test/gates-ship.test.mjs remove the two GSD-35 describe blocks (lines 224-272): the "GSD-35 clean-PR branch wiring (D-09: no_clean_pr param + config resolution)" block and the "GSD-35 clean-PR branch sequencing + fallback (D-08/D-07, static)" block. In test/ship-async.test.mjs remove the "completion state is propagated to the clean branch (option C, stale-progress fix)" test (lines 63-72). Then run the full suite `npm test` and confirm it passes.</action>
    <verify>npm test</verify>
    <acceptance_criteria>
      - test -f test/pr-branch.test.mjs returns non-zero (file absent)
      - grep -n "prBranch\|no_clean_pr\|buildCleanBranch\|--head\|_clean-branch\|cleanPr\|clean-PR" test/gates-ship.test.mjs test/ship-async.test.mjs returns nothing
      - npm test exits 0
    </acceptance_criteria>
    <done>The clean-branch tests are removed/updated and the full suite passes (SHIP-CLEAN-04).</done>
  </task>
</tasks>

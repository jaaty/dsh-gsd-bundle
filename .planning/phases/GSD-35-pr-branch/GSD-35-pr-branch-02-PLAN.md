---
phase: 35-pr-branch
plan: 02
type: execute
wave: 2
depends_on: ["GSD-35-pr-branch-01"]
files_modified: ["lib/ship.js", "test/gates-ship.test.mjs"]
autonomous: true
requirements: ["GAP-01"]
gap_closure: false
user_setup: []
must_haves:
  truths:
    - gsd_ship exposes a `no_clean_pr` boolean parameter; clean-PR is ON by default and the parameter overrides config (D-09).
    - After gates pass (5.5) and pre-ship-verify pass (5.6), gsd_ship builds the clean branch BEFORE the push step whenever the phase changes real code; a doc-only phase falls back to shipping the phase-N branch as-is (D-07).
    - The phase PR is created from the clean branch when it is built, otherwise from the phase-N branch; the completion-state commit (step 10) always lands on phase-N, never the clean branch (D-03, R1/OQ-2).
  artifacts:
    - path: "lib/ship.js"
      provides: "Wire the clean-PR branch into gsd_ship: no_clean_pr param, resolveCleanPr, buildCleanBranch sequencing before push, dual push, PR --head, phase-N branch restore."
      min_lines: 260
      exports: ["name", "inject", "apply", "preflightError"]
    - path: "test/gates-ship.test.mjs"
      provides: "Static wiring assertions that ship.js sequences the clean-branch build between the gates and the push, and that the fallback/phase-N path is retained."
      min_lines: 20
      exports: []
  key_links:
    - from: "lib/ship.js"
      to: "lib/_clean-branch.js"
      via: "imports buildCleanBranch + resolveCleanPr and calls buildCleanBranch after the capability + pre-ship-verify gates, before step 6 push."
      pattern: "buildCleanBranch\\(\\s*\\{[\\s\\S]*cwd"
    - from: "lib/ship.js step 8 PR create"
      to: "prBranch"
      via: "gh pr create passes `--head prBranch` so the PR head is the clean branch (or phase-N on fallback) while the working branch stays phase-N."
      pattern: "--head"
---
<objective>

Fold the clean-PR branch into `gsd_ship` (GAP-01): add the `no_clean_pr` parameter and config override (D-09), build the clean branch after the capability and pre-ship-verify gates pass and before the push (D-08), push both the phase-N source-of-truth branch and the clean branch (D-05), create the PR from the clean branch via an explicit `--head` (or phase-N on the D-07 fallback), and keep the completion-state commit on phase-N. Consumes plan 01's `lib/_clean-branch.js`.
</objective>
<context>
@.planning/phases/GSD-35-pr-branch/GSD-35-pr-branch-01-PLAN.md
@/var/home/jatyeo/dev/dsh-gsd-bundle/lib/ship.js
@/var/home/jatyeo/dev/dsh-gsd-bundle/lib/_clean-branch.js
@/var/home/jatyeo/dev/dsh-gsd-bundle/test/gates-ship.test.mjs
</context>
<tasks>
    <task type="auto">
        <name>Task 1 (tracer): add the no_clean_pr parameter and resolve clean-PR on/off</name>
        <files>lib/ship.js, test/gates-ship.test.mjs</files>
        <read_first>lib/ship.js</read_first>
        <action>In lib/ship.js, at the top, add an import line: `import { buildCleanBranch, resolveCleanPr, cleanBranchName } from "./_clean-branch.js";`. In the `defineTool` parameters object (currently with phase/draft/base/skip_gates/skip_verify) add `no_clean_pr: { type: "boolean", description: "Disable the clean-PR branch path; push and PR the phase-N branch as-is (overrides workflow.clean_pr_branch config)." }` (snake_case per sibling params, D-09). In `execute`, immediately after `const cfg = await s.readConfig(cwd);` (the existing step 5.5 line) add `const cleanPr = resolveCleanPr(cfg, args.no_clean_pr);` and `log.push(\`clean-PR branch: ${cleanPr ? "on" : "off"}\`);`. Do not change gate logic (D-08). In test/gates-ship.test.mjs add a new describe block with static source assertions (read lib/ship.js source via node:fs/promises like the existing CAP-02 block): the source contains the string `no_clean_pr`, the call `resolveCleanPr(cfg, args.no_clean_pr)`, and the import `from "./_clean-branch.js"`.</action>
        <verify>node --test test/gates-ship.test.mjs</verify>
        <acceptance_criteria>
        - node --test test/gates-ship.test.mjs exits 0
        - grep confirms `no_clean_pr` parameter and `resolveCleanPr(cfg, args.no_clean_pr)` in lib/ship.js
        - grep confirms `import ... from "./_clean-branch.js"` in lib/ship.js
        </acceptance_criteria>
        <done>The config/param surface for clean-PR exists and is statically verified.</done>
    </task>
    <task type="auto">
        <name>Task 2: sequence the clean-branch build after gates, adjust push + PR head, keep completion on phase-N</name>
        <files>lib/ship.js</files>
        <read_first>lib/ship.js</read_first>
        <action>In lib/ship.js, after the pre-ship-verify gate block (ends at the `log.push("pre-ship-verify: pass")` / finally block, before the `// ── 6. push branch ──` comment), insert a new step `// ── 5.7 clean-PR branch (GAP-01, D-01…D-09) ──────────`. Initialise `let prBranch = branch;` (phase-N default). If `cleanPr` is true, wrap `const info = await buildCleanBranch({ cwd, gitFn: git, phaseNum: args.phase, phaseName: phase.name, base: defaultBranch });` in try/catch — on rejection call `fail(\`clean-PR branch construction failed: ${e.message}\`, e)`. `phaseName: phase.name` is RESOLVED-CONFIRMED in scope: ship.js line ~77 defines `const phase = (roadmap?.phases || []).find((p) => p.n === args.phase)` and `phase.name` is already consumed at steps 7/8 for the PR body title (`` `## Phase ${args.phase}: ${phase.name}` `` and `The title = ...`), so the squ/PR-head derivation uses the SAME phase-name source as the PR body (resolution of the phase.name WARNING). Do not derive a separate name. If `info.built` set `prBranch = info.cleanBranch` and `log.push(\`clean branch ${prBranch} ready (squash of non-.planning/phases changes)\`)`; else `log.push(\`clean branch skipped: ${info.reason}; shipping phase branch as-is\`)` (D-07). Because buildCleanBranch switches back to the original branch (plan 01 task 3), the working tree is on phase-N throughout. Then in `// ── 6. push branch ──`, keep the existing push of `branch` (phase-N, D-05 source of truth) and, only when `prBranch !== branch` and `cleanPr`, add a second push `await git(cwd, ["push","-u","origin", prBranch])` with the same catch->fail preflightError pattern. In `// ── 8. create PR ──`, change the gh args from `["pr","create","--title",title,"--body-file",tmp,"--base",defaultBranch]` to also include `"--head", prBranch` (append after `--base`; keep `--draft` handling). Do NOT change steps 9–10: `updateStateFrontmatter`/`addDecision`/`completePhase` and the `git add .planning` commit+push keep targeting `branch` (phase-N), which is already the checked-out branch, so the completion STATE marker never lands on the clean branch (D-03, R1/OQ-2).</action>
        <verify>node --test test/gates-ship.test.mjs && node -e "import('./lib/ship.js').then(()=>console.log('ship.js imports OK'))"</verify>
        <acceptance_criteria>
        - ship.js imports cleanly (no syntax/import errors)
        - grep confirms the `5.7` comment, `buildCleanBranch({`, `prBranch`, and `"--head", prBranch` in lib/ship.js
        - grep confirms the dual push of prBranch when clean, and that step 10's commit still uses `branch`
        </acceptance_criteria>
        <done>gsd_ship builds/pushes the clean branch, PRs from it, and leaves the completion commit on phase-N with the D-07 fallback intact.</done>
    </task>
    <task type="auto">
        <name>Task 3: static wiring + ordering gate for the new ship flow</name>
        <files>test/gates-ship.test.mjs</files>
        <read_first>test/gates-ship.test.mjs</read_first>
        <action>In test/gates-ship.test.mjs add a statically-scoped describe block (read lib/ship.js source via node:fs/promises). Assert (a) the string `5.7 clean-PR branch` appears; (b) the index of `5.7 clean-PR branch` is greater than the index of `pre-ship-verify: pass` (or "5.6") and less than the index of `6. push branch`, proving the clean branch is built only AFTER the gates pass and BEFORE the push (D-08); (c) `buildCleanBranch({` call sits before the `6. push branch` marker; (d) `"--head"` appears in the prArgs construction; (e) the fallback/phase-N path is retained — assert the source still contains `prBranch = branch;` (the default assignment) and the `info.reason`/`shipping phase branch as-is` branch is present. Reuse the readLib helper pattern if present, else inline a node:fs/promises read as the CAP-02 block does.</action>
        <verify>node --test test/gates-ship.test.mjs</verify>
        <acceptance_criteria>
        - node --test test/gates-ship.test.mjs exits 0
        - ordering assertion holds: 5.7 clean-PR sits between the verify gate and the push step
        - fallback/assertions (`prBranch = branch` default + `as-is` log) are present in the test
        </acceptance_criteria>
        <done>The ship wiring is locked to the D-08 ordering and the D-07 fallback by a static gate.</done>
    </task>
</tasks>

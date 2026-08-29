---
phase: 35-pr-branch
plan: 03
type: execute
wave: 2
depends_on: ["GSD-35-pr-branch-01"]
files_modified: ["lib/state.js", "test/cleanpr-config.test.mjs", "README.md", ".planning/phases/GSD-35-pr-branch/GSD-35-pr-branch-VALIDATION.md"]
autonomous: true
requirements: ["GAP-01"]
gap_closure: false
user_setup: []
must_haves:
  truths:
    - Newly-initialised projects record `workflow.clean_pr_branch: true` in their default config.json, making the D-09 config affordance discoverable.
    - The README documents the clean-PR branch behaviour (per-phase `.planning/phases/` excluded; durable files kept; `phase-N-clean` naming; the `workflow.clean_pr_branch`/`no_clean_pr` off-switch).
    - The phase emits GSD-35-pr-branch-VALIDATION.md: a truth-traceable map of every task's verify command to its acceptance criteria across all three plans, satisfying the repo's default `nyquist_validation: true`.
  artifacts:
    - path: "lib/state.js"
      provides: "Add clean_pr_branch: true to the _defaultConfig workflow block so gsd_init writes the explicit default."
      min_lines: 195
      exports: ["makeStateStore", "readState", "initProject"]
    - path: "test/cleanpr-config.test.mjs"
      provides: "Static assertion that lib/state.js ships clean_pr_branch: true in _defaultConfig and README documents the clean-branch behaviour."
      min_lines: 30
      exports: []
    - path: ".planning/phases/GSD-35-pr-branch/GSD-35-pr-branch-VALIDATION.md"
      provides: "Nyquist VALIDATION doc: per-task table mapping each verify command to the acceptance criteria it satisfies across plans 01–03."
      min_lines: 40
      exports: []
  key_links:
    - from: "lib/state.js _defaultConfig workflow"
      to: "lib/ship.js (resolveCleanPr)"
      via: "the config key `workflow.clean_pr_branch` written by default and consumed by resolveCleanPr in ship.js."
      pattern: "clean_pr_branch"
---
<objective>

Surface the D-09 clean-PR switch beyond the runtime default: add `workflow.clean_pr_branch: true` to the project default config in `lib/state.js` so a newly-initialized `config.json` records the on-by-default affordance, lock that with a small static test, document the clean-PR branch behaviour in the README, and emit the phase VALIDATION.md for Nyquist. Wave 2, parallel-safe with plan 02 (no overlapping files: plan 02 edits lib/ship.js + test/gates-ship.test.mjs, plan 03 edits lib/state.js + test/cleanpr-config.test.mjs + README.md + the VALIDATION doc).
</objective>
<context>
@.planning/phases/GSD-35-pr-branch/GSD-35-pr-branch-01-PLAN.md
@/var/home/jatyeo/dev/dsh-gsd-bundle/lib/state.js
@/var/home/jatyeo/dev/dsh-gsd-bundle/README.md
</context>
<tasks>
    <task type="auto">
        <name>Task 1: add clean_pr_branch to the default workflow config</name>
        <files>lib/state.js, test/cleanpr-config.test.mjs</files>
        <read_first>lib/state.js</read_first>
        <action>In lib/state.js, in the `_defaultConfig(opts)` method's `workflow` object (currently `discuss_mode` … `commit_docs: true`), add `clean_pr_branch: true,` (D-09). Place it after `commit_docs` in the workflow block. The runtime default-ON behaviour is already guaranteed by plan 01's `resolveCleanPr` (`!== false`), so this is a discoverability/curation change only, NOT a behaviour change for existing configs. AUTHORITATIVE EXISTING-TEST STATE: the tree was checked — `test/state.test.mjs:419-425` asserts individual workflow keys (`tdd_mode`, `mvp_mode`, `discuss_mode`, `use_worktrees`, `commit_docs`) one assertion each; NO existing test asserts the exact/superset set of `_defaultConfig` workflow keys, so NOTHING there needs changing from this edit. Do NOT rewrite `test/state.test.mjs`. If, at execution time, some test you did not anticipate does pin the exact key set, it MUST be added to this plan's `files_modified` and reported in the SUMMARY before editing it — do not silently edit undeclared files. Create test/cleanpr-config.test.mjs (ESM, node:test, node:assert/strict): read lib/state.js source via node:fs/promises and assert it contains `clean_pr_branch: true,` (with trailing comma) at a position after the `workflow: {` line and strictly before the `},` that closes the workflow object (parse the region between `workflow: {` and the closing brace count), and that `commit_docs: true`, precedes it.</action>
        <verify>node --test test/cleanpr-config.test.mjs && node --test test/state.test.mjs</verify>
        <acceptance_criteria>
        - node --test test/cleanpr-config.test.mjs exits 0
        - node --test test/state.test.mjs exits 0 (the only existing file touching _defaultConfig; full-suite regression is deferred to the verify phase per plan-warning resolution)
        - grep confirms `clean_pr_branch: true,` in lib/state.js
        - lib/state.js is unchanged by any commit in plan 02 (plan 02 touches only lib/ship.js + test/gates-ship.test.mjs)
        </acceptance_criteria>
        <done>_defaultConfig carries explicit clean_pr_branch: true, its own static test passes, and no undeclared existing test was silently altered.</done>
    </task>
    <task type="auto">
        <name>Task 2: document the clean-PR branch behaviour in the README</name>
        <files>README.md, test/cleanpr-config.test.mjs</files>
        <read_first>README.md</read_first>
        <action>Read README.md and locate the 'Faithfulness and scope' section (or the nearest equivalent scope/behaviour section). Add a short subsection (1–3 sentences) there titled e.g. `Clean-PR branch` stating: at ship time gsd_ship derives a `phase-<N>-clean` review branch that excludes the per-phase planning subtree `.planning/phases/` (D-01/D-02) while keeping the durable cross-phase files, applies the phase's real-code changes as one squash commit, and creates the phase PR from it; doc-only phases fall back to the phase-N branch (D-07); disable via `workflow.clean_pr_branch: false` in `.planning/config.json` or the gsd_ship `no_clean_pr` parameter (D-09). If no Faithfulness/scope section exists, insert the subsection under the most appropriate top-level heading (append a new `### Clean-PR branch` section near the ship/PR description). In test/cleanpr-config.test.mjs add an assertion that the README source contains the literal `Clean-PR branch` and `phase-<N>-clean`.</action>
        <verify>node --test test/cleanpr-config.test.mjs</verify>
        <acceptance_criteria>
        - node --test test/cleanpr-config.test.mjs exits 0 (README assertions pass)
        - grep confirms `Clean-PR branch` and `phase-<N>-clean` in README.md
        </acceptance_criteria>
        <done>The clean-PR behaviour and its off-switch are documented and locked by a static test.</done>
    </task>
    <task type="auto">
        <name>Task 3: emit the phase VALIDATION.md (Nyquist truth-traceable map)</name>
        <files>.planning/phases/GSD-35-pr-branch/GSD-35-pr-branch-VALIDATION.md</files>
        <read_first>.planning/phases/GSD-35-pr-branch/GSD-35-pr-branch-01-PLAN.md, .planning/phases/GSD-35-pr-branch/GSD-35-pr-branch-02-PLAN.md, .planning/phases/GSD-35-pr-branch/GSD-35-pr-branch-03-PLAN.md</read_first>
        <action>Create `.planning/phases/GSD-35-pr-branch/GSD-35-pr-branch-VALIDATION.md` satisfying the repo default `nyquist_validation: true`. The doc is a Markdown table (and short intro) that, for EVERY task across all three plans of this phase (plan 01 tasks 1–3, plan 02 tasks 1–3, plan 03 tasks 1–2), maps the task's `<verify>` command verbatim to the `<acceptance_criteria>` items it satisfies. Use columns: Task ref (e.g. `P01-T1`), verify command, acceptance criteria satisfied, status. List one row per task; fill each row's verify from the plan file's `<verify>` line and the criteria from that task's `<acceptance_criteria>` block. SOURCE-OF-TRUTH NOTE (same-wave read coupling removed): this doc is derived PURELY from the three PLAN.md documents listed in read_first — do NOT read or depend on plan 02's mutable outputs (`lib/ship.js` final state, `test/gates-ship.test.mjs`) or on plan 01's `_clean-branch.js`; the verify commands and acceptance criteria are copied verbatim from each PLAN.md, which already encode them, so plan 03 never reads a same-wave sibling's edited files. Include the header, a one-line note that this doc is produced to satisfy `nyquist_validation: true` (state.js:188), and a status column set to `pending` for execution-time rows and `documented` for the static doc itself — the phase verifier will turn them to `passed` after gsd_verify. Do not invent verify commands: copy them verbatim from each PLAN.md <verify> block.</action>
        <verify>node --test test/cleanpr-config.test.mjs && grep -c "node --test" .planning/phases/GSD-35-pr-branch/GSD-35-pr-branch-VALIDATION.md</verify>
        <acceptance_criteria>
        - node --test test/cleanpr-config.test.mjs exits 0
        - GSD-35-pr-branch-VALIDATION.md exists and is non-empty (min_lines >= 40)
        - grep confirms the file references each task (P01-T1..P01-T3, P02-T1..P02-T3, P03-T1..P03-T2)
        - grep confirms every verify command matches the source plans (>=7 `node --test` verify commands listed, one per task)
        </acceptance_criteria>
        <done>The phase VALIDATION.md truth-traceable map exists, listing every task's verify against its acceptance criteria, satisfying nyquist_validation.</done>
    </task>
</tasks>

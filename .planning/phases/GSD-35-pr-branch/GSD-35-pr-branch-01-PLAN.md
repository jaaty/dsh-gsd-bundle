---
phase: 35-pr-branch
plan: 01
type: execute
wave: 1
depends_on: []
files_modified: ["lib/_clean-branch.js", "test/pr-branch.test.mjs"]
autonomous: true
requirements: ["GAP-01"]
gap_closure: false
user_setup: []
must_haves:
  truths:
    - The per-phase planning subtree `.planning/phases/` is dropped from the review diff set, while durable files (`lib/ship.js`, `.planning/STATE.md`, `.planning/ROADMAP.md`, `.planning/REQUIREMENTS.md`, `.planning/codebase/**`) are retained (D-01).
    - When a phase changes no files outside `.planning/phases/`, the builder reports `built: false` so gsd_ship can fall back to the phase-N branch (D-07).
    - Clean-PR resolution defaults ON, and is disabled only by an explicit `workflow.clean_pr_branch: false` config or a `no_clean_pr: true` param (D-09).
    - A rename entry where either side (oldPath or newPath) is non-excluded counts as a real change and drives branch construction; `git rm` targets only the non-excluded oldPath (no R-deep ambiguity, D-01 boundary).
  artifacts:
    - path: "lib/_clean-branch.js"
      provides: "Pure filter/predicate/config core plus the buildCleanBranch git orchestration for the clean PR branch (GAP-01)."
      min_lines: 110
      exports: ["EXCLUDE_PATHSPEC", "filterRealChanges", "isExcludedPath", "phaseChangedCode", "cleanBranchName", "squashMessage", "resolveCleanPr", "parseNameStatusZ", "buildCleanBranch"]
    - path: "test/pr-branch.test.mjs"
      provides: "Pure unit tests for the filter (incl. rename handling), fallback predicate, name template, squash message, and config resolution; scripted-gitFn tests for buildCleanBranch."
      min_lines: 120
      exports: []
  key_links:
    - from: "lib/_clean-branch.js"
      to: "lib/_shared.js"
      via: "imports zeroPad from _shared for cleanBranchName."
      pattern: "from \"\\./_shared\\.js\""
    - from: "lib/_clean-branch.js EXCLUDE_AFFIX"
      to: "EXCLUDE_PATHSPEC"
      via: "the pathspec template literal `:(exclude)${EXCLUDE_AFFIX}` drives both the git exclusion and JS isExcludedPath from one source."
      pattern: "\\:\\(exclude\\).*EXCLUDE_AFFIX"
---
<objective>

Deliver the standalone clean-branch core for GAP-01: a new `lib/_clean-branch.js` module containing (a) the pure domain functions that filter a phase's changed-path set down to real code while keeping the durable cross-phase files (D-01), decide D-07 fallback, name/squash the clean branch, and resolve D-09 config, and (b) the integration `buildCleanBranch` that forward-applies the filtered diff as ONE squash commit onto `origin/<base>` with no history rewrite, with rename (R) entries handled by an explicit rule. This is the first plan (wave 1, no deps); ship.js wiring consumes it in plan 02.
</objective>
<context>
@.planning/phases/GSD-35-pr-branch/GSD-35-pr-branch-CONTEXT.md
@.planning/phases/GSD-35-pr-branch/GSD-35-pr-branch-RESEARCH.md
@/var/home/jatyeo/dev/dsh-gsd-bundle/lib/_git-artifacts.js
@/var/home/jatyeo/dev/dsh-gsd-bundle/lib/_shared.js
@/var/home/jatyeo/dev/dsh-gsd-bundle/lib/gates.js
</context>
<tasks>
    <task type="auto">
        <name>Task 1 (tracer): create lib/_clean-branch.js with the exclusion filter (incl. rename handling) and prove the vertical slice</name>
        <files>lib/_clean-branch.js, test/pr-branch.test.mjs</files>
        <read_first>lib/_shared.js, lib/_git-artifacts.js</read_first>
        <action>Create lib/_clean-branch.js as a new ESM module. Import `{ zeroPad }` from "./_shared.js". Define two constants: `export const EXCLUDE_AFFIX = ".planning/phases";` and `export const EXCLUDE_PATHSPEC = \`:(exclude)${EXCLUDE_AFFIX}\`;` (single-source of both the git pathspec and the JS predicate in D-02). Define `export function isExcludedPath(path)` returning true when `path === EXCLUDE_AFFIX` or `path.startsWith(EXCLUDE_AFFIX + "/")`. Define `export function filterRealChanges(nameStatusEntries)` keeping an entry when it is a non-excluded change; for a non-rename entry `{ status, path }` keep it when `!isExcludedPath(entry.path)`; for a rename entry `{ status: "R", oldPath, newPath }` keep it when `!isExcludedPath(entry.oldPath) || !isExcludedPath(entry.newPath)` (D-01 boundary: either side non-excluded counts as real). Return the kept entries unchanged in order. Create test/pr-branch.test.mjs (ESM, node:test, node:assert/strict, imports from ../lib/_clean-branch.js) matching the pure style of test/_git-artifacts.test.mjs. Add a describe block asserting: given a name-status set containing {status:"M",path:"lib/ship.js"}, {status:"A",path:".planning/phases/GSD-35-pr-branch/GSD-35-pr-branch-SUMMARY-01.md"}, {status:"A",path:".planning/phases/GSD-35-pr-branch/GSD-35-pr-branch-CONTEXT.md"}, {status:"M",path:".planning/STATE.md"}, {status:"M",path:".planning/ROADMAP.md"}, {status:"A",path:".planning/codebase/STACK.md"}, filterRealChanges keeps all but the two `.planning/phases/` entries, and that the returned paths include lib/ship.js, .planning/STATE.md, .planning/ROADMAP.md, .planning/codebase/STACK.md (D-01's exact boundary). Assert isExcludedPath(".planning/phases") itself is true. Add a rename sub-block: filterRealChanges keeps {status:"R",oldPath:".planning/phases/a.md",newPath:"lib/shared.js"} (newPath non-excluded), keeps {status:"R",oldPath:"lib/old.js",newPath:".planning/phases/b.md"} (oldPath non-excluded), and drops {status:"R",oldPath:".planning/phases/x.md",newPath:".planning/phases/y.md"} (both excluded). This is the checker-required rename assertion pinning the D-01 rule.</action>
        <verify>node --test test/pr-branch.test.mjs</verify>
        <acceptance_criteria>
        - `node --test test/pr-branch.test.mjs` exits 0
        - grep returns EXCLUDE_AFFIX and EXCLUDE_PATHSPEC defined in lib/_clean-branch.js
        - test asserts filterRealChanges drops both `.planning/phases/` plain entries AND an R entry whose both sides are excluded
        - test asserts an R entry with an oldPath/newPath side under lib/ is kept (either-side non-excluded rule)
        </acceptance_criteria>
        <done>The exclusion-filter vertical slice exists (incl. rename rule) and the pure predicates are proven by passing unit tests.</done>
    </task>
    <task type="auto">
        <name>Task 2: add the pure D-07/D-05/D-09 decision functions + squash template</name>
        <files>lib/_clean-branch.js, test/pr-branch.test.mjs</files>
        <read_first>lib/_clean-branch.js</read_first>
        <action>In lib/_clean-branch.js add four pure functions. `export function phaseChangedCode(entries)` (D-07): returns true when `filterRealChanges(entries).length > 0`, i.e. at least one real code/durable change exists (reuse the rename-aware filter; do NOT re-implement the predicate here). `export function cleanBranchName(phaseNum)` (D-05): returns `phase-${zeroPad(phaseNum)}-clean` using the imported zeroPad. `export function squashMessage(phaseNum, phaseName)` (discretion, research recommends `phase <NN>: <name>`): returns `phase ${phaseNum}: ${phaseName}`. `export function resolveCleanPr(cfg, noCleanPr)` (D-09): returns `noCleanPr === true ? false : (cfg?.workflow?.clean_pr_branch !== false)` — so absent key and a `null`/missing cfg both default ON, an explicit false disables, and a `no_clean_pr: true` param overrides config. In test/pr-branch.test.mjs add a describe block testing: phaseChangedCode is false for an all-`.planning/phases/` set and true when any durable/code path is present, and true for a rename whose newPath is outside `.planning/phases/`; cleanBranchName(35) === "phase-35-clean" and cleanBranchName(7) === "phase-07-clean" (zero-padded, D-05); squashMessage(35,"pr-branch") starts with `phase 35:` and contains the name; resolveCleanPr({workflow:{clean_pr_branch:false}}, undefined) === false, resolveCleanPr({}, undefined) === true (absent key ON), resolveCleanPr(undefined, undefined) === true, resolveCleanPr({workflow:{clean_pr_branch:true}}, true) === false (param overrides), resolveCleanPr({workflow:{clean_pr_branch:false}}, false) === false.</action>
        <verify>node --test test/pr-branch.test.mjs</verify>
        <acceptance_criteria>
        - node --test test/pr-branch.test.mjs exits 0 with the new D-07/D-05/D-09 assertions passing
        - grep returns `phaseChangedCode`, `cleanBranchName`, `squashMessage`, `resolveCleanPr` as exported functions
        - resolveCleanPr returns true for an absent clean_pr_branch key (default ON per D-09)
        </acceptance_criteria>
        <done>All pure decision functions exist and are unit-tested against D-07/D-05/D-09.</done>
    </task>
    <task type="auto">
        <name>Task 3: buildCleanBranch — forward-apply the filtered diff as one squash onto origin/base with explicit rename handling</name>
        <files>lib/_clean-branch.js, test/pr-branch.test.mjs</files>
        <read_first>lib/_clean-branch.js, lib/gates.js</read_first>
        <action>Add `export async function buildCleanBranch({ cwd, gitFn, phaseNum, phaseName, base })`. It must (1) capture `originalBranch = (await gitFn(cwd, ["rev-parse","--abbrev-ref","HEAD"])).trim()`; (2) best-effort `await gitFn(cwd, ["fetch","origin",base,"--quiet"])` wrapped in try/catch (swallow, D-06); (3) `mergeBase = (await gitFn(cwd, ["merge-base", \`origin/${base}\`, "HEAD"])).trim()` (D-04, origin target); (4) `headCommit = (await gitFn(cwd, ["rev-parse","HEAD"])).trim()` (pre-completion snapshot, OQ-2); (5) define and export a dedicated parser `export function parseNameStatusZ(raw)` that turns git's NUL-separated `--name-status -z` records into entries. Implementation: split `raw` on `"\0"` and drop the trailing empty token (git emits a trailing NUL); walk tokens by index; a status token at index i yields `status = token[0]`; when `status === "R"` then consume the NEXT TWO path tokens as `oldPath` then `newPath` and emit `{ status: "R", oldPath, newPath }`, otherwise consume the NEXT ONE path token and emit `{ status, path }`. CRITICAL (D-02/rename correctness): real git emits a rename's similarity score in the same first token — e.g. rename detection (the plan keeps `diff.renames` on) produces `R100\0<old>\0<new>\0` — so the rename branch MUST be detected with `token.startsWith("R")` and NEVER `token === "R"`, or a scored `R100` token is misparsed as a one-path entry and the following old/new path tokens desynchronize the whole diff parse. Reading the path count off `status` (the `[0]` letter) keeps the two entry shapes strictly separated. Then `buildCleanBranch` sets `const entries = parseNameStatusZ(await gitFn(cwd, ["diff","--name-status","-z",mergeBase,headCommit]))`; in test/pr-branch.test.mjs add a parser sub-block: `parseNameStatusZ("A\0lib/new.js\0D\0lib/gone.js\0")` yields two single-path entries, and the scored rename `parseNameStatusZ("R100\0lib/old.js\0lib/renamed.js\0M\0lib/keep.js\0")` yields exactly `[{ status:"R", oldPath:"lib/old.js", newPath:"lib/renamed.js" }, { status:"M", path:"lib/keep.js" }]` — proving the two-path scored-R parse AND that the following non-rename record is not swallowed; (6) `const real = filterRealChanges(entries)` using the rename-aware filter from task 1; (7) if `real.length === 0` return `{ built: false, reason: "no-real-changes" }` immediately (D-07 fallback) WITHOUT switching branches; (8) else build: `gitFn(cwd, ["switch","-c", cleanBranchName(phaseNum), \`origin/${base}\`])`, then `gitFn(cwd, ["checkout", headCommit, "--", ".", EXCLUDE_PATHSPEC])` to stage all non-excluded A/M content (D-02 pathspec) — the excluded side (oldPath or newPath under `.planning/phases/`) falls out of this checkout naturally and is NOT staged; then, for every real entry of status "D" call `gitFn(cwd, ["rm","-r","--", entry.path])`, and for every real entry of status "R" call `gitFn(cwd, ["rm","-r","--", entry.oldPath])` ONLY when `!isExcludedPath(entry.oldPath)` (the non-excluded old side is the base-only path that must be removed; if oldPath is excluded, skip the rm and let the `:(exclude)` checkout leave it out). This is R2's deletion/rename-composition rule. Then `gitFn(cwd, ["commit","-m", squashMessage(phaseNum, phaseName)])` as the SINGLE squash commit (D-03), then `gitFn(cwd, ["switch", originalBranch])` to restore the phase-N working branch (so ship.js's completion writes stay on phase-N — R1/OQ-2 and D-03), and return `{ built: true, cleanBranch: cleanBranchName(phaseNum), mergeBase, headCommit }`. Build-step failures (other than the guarded fetch) MUST propagate the rejection (real cause) so ship.js can surface it. In test/pr-branch.test.mjs add a describe block using the `scriptedGit` fake-gitFn pattern (copy the helper from test/_git-artifacts.test.mjs or test/_shared.test.mjs). Cover behaviours: (a) built — feeds a diff with M lib/ship.js + A .planning/codebase/STACK.md + A .planning/phases/.../foo.md, asserts switch -c, checkout with EXCLUDE_PATHSPEC, exactly one commit, switch back to originalBranch, and return built:true with cleanBranch "phase-35-clean"; (b) fallback — feeds an all-`.planning/phases/` diff, asserts return built:false reason "no-real-changes" and NO switch -c issued; (c) deletion-rm — feeds a D path, asserts one `rm -r -- <path>`; (d) rename composition — feeds R {oldPath:"lib/old.js", newPath:"lib/new.js"} asserting `rm -r -- lib/old.js`; feeds R {oldPath:".planning/phases/old.md", newPath:"lib/new.js"} asserting NO `rm` for the excluded oldPath (both-side rule), and R {oldPath:"lib/old.js", newPath:".planning/phases/new.md"} asserting `rm -r -- lib/old.js` (oldPath non-excluded). This rename sub-block is the checker-required integration assertion for the R edge of D-01.</action>
        <verify>node --test test/pr-branch.test.mjs</verify>
        <acceptance_criteria>
        - node --test test/pr-branch.test.mjs exits 0 covering the buildCleanBranch behaviors (built, fallback, deletion-rm, rename-composition)
        - grep confirms `parseNameStatusZ` is an exported function detected via `token.startsWith("R")`, and that buildCleanBranch calls `parseNameStatusZ`
        - parser test feeds the scored rename `R100\0lib/old.js\0lib/renamed.js\0M\0lib/keep.js\0` and asserts exactly the rename pair AND the following `M` record (no desync) — the fix that previously-uncaught real-git `R<score>` divergence
        - grep confirms buildCleanBranch issues `switch -c`, uses EXCLUDE_PATHSPEC in checkout, issues exactly one `commit`, and switches back to originalBranch
        - rename test asserts `rm -r -- <oldPath>` for non-excluded R oldPath and NO rm when oldPath is under `.planning/phases/`
        - buildCleanBranch returns built:false + reason "no-real-changes" without branch switches for an all-.planning/phases diff (D-07)
        </acceptance_criteria>
        <done>parseNameStatusZ (score-aware for real-git R<nn> renames) and buildCleanBranch prove the forward squash application, the D-07 fallback signal, the branch-restore, and the explicit rename (R) composition rule.</done>
    </task>
</tasks>

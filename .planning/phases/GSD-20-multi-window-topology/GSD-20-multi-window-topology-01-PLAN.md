---
phase: 20-multi-window-topology
plan: 01
type: execute
wave: 1
depends_on: []
files_modified: [lib/_git-artifacts.js, test/_git-artifacts.test.mjs]
autonomous: true
requirements: ["MW-03"]
must_haves:
  truths:
    - "A call to commitArtifacts(cwd, null, { scope: '<tool>', message: '<override>' }) commits .planning with EXACTLY the override message and does not throw (D-12)."
    - "Existing phase-tool call sites commitArtifacts(cwd, args.phase, { scope: '<tool>', phaseName: phase.name }) produce the unchanged default message docs(planning): phase <N> <slug> <scope> artefacts."
  artifacts:
    - path: "lib/_git-artifacts.js"
      provides: "commitArtifacts signature extended with an optional `message` override and null-safe `phaseNum`; default message path byte-identical"
      min_lines: 114
      exports: ["commitArtifacts"]
  key_links:
    - from: "lib/_git-artifacts.js commitArtifacts"
      to: "phase-tool call sites (discuss/plan/execute/verify)"
      via: "message override only used when opts.message present; absent message preserves the existing default template"
      pattern: "opts.message \\|\\| .*docs\\(planning\\)"
---

<objective>
Extend the shared `commitArtifacts(cwd, phaseNum, { scope, phaseName, message }, gitFn)` seam (lib/_git-artifacts.js) so it can also be used by the out-of-flow artefact writers that have NO phase: allow `phaseNum` to be `null` and add an optional `message` override (D-12). The default message template and every existing phase-tool call site must remain byte-identical so the whole phase-loop commit wiring (discuss-artifacts.test.mjs, phase-tools-git.test.mjs) stays green. This is the foundation MW-03's out-of-flow auto-commit (Plan 03) builds on — UI-SPEC / codebase-map / quick all call this seam.
</objective>

<context>
@lib/_git-artifacts.js (function commitArtifacts, lines 87-114 — the seam to extend)
@test/_git-artifacts.test.mjs (existing commitArtifacts describe block, lines 79-128 — the pattern to mirror)
@lib/discuss.js:11,147 (exemplar phase-tool call site that MUST stay byte-identical)
@lib/plan.js:13,151 / @lib/execute.js:30,216 / @lib/verify.js:13,93 (the other phase-tool call sites that MUST stay byte-identical)
</context>
<tasks>
  <task type="auto">
    <name>Task 1: Extend commitArtifacts with message override + null-safe phaseNum (tracer, D-12)</name>
    <files>lib/_git-artifacts.js, test/_git-artifacts.test.mjs</files>
    <read_first>lib/_git-artifacts.js, test/_git-artifacts.test.mjs</read_first>
    <action>
Read lib/_git-artifacts.js commitArtifacts (lines 87-114). Change the signature from `commitArtifacts(cwd, phaseNum, { scope, phaseName }, gitFn = defaultGitFn)` to `commitArtifacts(cwd, phaseNum, { scope, phaseName, message } = {}, gitFn = defaultGitFn)`. Resolve the commit message as: `const message = opts.message || \`docs(planning): phase ${phaseNum} ${slugify(phaseName)} ${scope} artefacts\`;`. This keeps the generated default template byte-identical for every existing call (which never passes `message`), while allowing a caller to pass `message` (and a null `phaseNum`) to emit an override message and skip phase interpolation. Leave the rest of the body (git add .planning / diff --cached / commit -m / return shape) unchanged.

Then add unit tests to test/_git-artifacts.test.mjs under the existing `describe("commitArtifacts", ...)` block, mirroring the `scriptedGit` fake and `hasCall` helper already at the top of that file:
  1. A test that `commitArtifacts("/repo", null, { scope: "map", message: "docs(planning): codebase map" }, git)` with scripted responses for add/diff/commit returns `committed: true`, and the recorded commit call's message arg (index 2 of the array whose first element is "commit") deep-equals exactly `"docs(planning): codebase map"` — no phase interpolation, no "null" in the message.
  2. A test that the existing default call `commitArtifacts("/repo", 17, { scope: "discuss", phaseName: "phase-branch-isolation" }, git)` still produces a commit message matching `/^docs\(planning\): phase 17 phase-branch-isolation discuss artefacts$/` (guards against a regression in the default path).
  3. A best-effort guard: `commitArtifacts("/repo", null, { scope: "quick", message: "docs(planning): quick x" }, git)` with `rejectArg: "add"` returns `committed: false` and does NOT throw (D-06 semantics unchanged for the null-phaseNum path).
</action>
    <verify>Run: cd /var/home/jatyeo/dev/dsh-gsd-bundle && node --test test/_git-artifacts.test.mjs — all commitArtifacts tests (new + pre-existing) pass.</verify>
    <acceptance_criteria>
      - node --test test/_git-artifacts.test.mjs exits 0; the new override test and null-phaseNum best-effort test are present and pass.
      - grep -c "opts.message ||" lib/_git-artifacts.js == 1 (the override is a single resolution point).
      - The three phase-tool call sites in lib/discuss.js:147, lib/plan.js:151, lib/execute.js:216, lib/verify.js:93 match their existing literal `commitArtifacts(cwd, args.phase, { scope: ..., phaseName: phase.name })` verbatim — verified by grep returning their exact existing text with no added `message:` key.
    </acceptance_criteria>
    <done>The seam accepts an optional `message` override and a null `phaseNum`, the default message template is unchanged, and test/_git-artifacts.test.mjs proves all three cases (override / default / best-effort).</done>
  </task>

  <task type="auto">
    <name>Task 2: Prove backward-compat for the existing phase-tool and discuss commit wiring</name>
    <files>test/_git-artifacts.test.mjs</files>
    <read_first>test/discuss-artifacts.test.mjs, test/phase-tools-git.test.mjs</read_first>
    <action>
Read test/discuss-artifacts.test.mjs and test/phase-tools-git.test.mjs. These assert the phase-tool/discuss commitArtifacts call sites match exactly-one with the literal string `commitArtifacts(cwd, args.phase, { scope: "...", phaseName: phase.name })`. Add a single static regression test to test/_git-artifacts.test.mjs (new top-level test()) that reads lib/discuss.js, lib/plan.js, lib/execute.js, lib/verify.js via `readFile` (import readFile from "node:fs/promises" at the top of the test file) and, for each file, asserts `(src.match(/commitArtifacts\(cwd, args\.phase, \{ scope: "(discuss|plan|execute|verify)", phaseName: phase\.name \}\)/g) || []).length === 1` — proving the signature change introduced no `message:` key and no second call. Do NOT modify the existing phase-tool call sites or the existing tests in discuss-artifacts.test.mjs / phase-tools-git.test.mjs.
</action>
    <verify>Run: cd /var/home/jatyeo/dev/dsh-gsd-bundle && node --test test/_git-artifacts.test.mjs test/discuss-artifacts.test.mjs test/phase-tools-git.test.mjs — all pass.</verify>
    <acceptance_criteria>
      - The grep string `commitArtifacts(cwd, args.phase, { scope: "(discuss|plan|execute|verify)", phaseName: phase.name })` appears exactly once in each of lib/discuss.js, lib/plan.js, lib/execute.js, lib/verify.js.
      - node --test test/_git-artifacts.test.mjs test/discuss-artifacts.test.mjs test/phase-tools-git.test.mjs exits 0.
    </acceptance_criteria>
    <done>The new optional-message signature is proven not to disturb the four existing phase-tool commit call sites or their static wiring tests.</done>
  </task>
</tasks>

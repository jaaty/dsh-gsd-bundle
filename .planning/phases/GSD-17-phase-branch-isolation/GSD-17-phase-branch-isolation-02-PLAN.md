---
phase: 17-phase-branch-isolation
plan: 02
type: execute
wave: 2
depends_on: ["GSD-17-phase-branch-isolation-01"]
files_modified: [lib/discuss.js, test/discuss-artifacts.test.mjs]
autonomous: true
requirements: ["CQ-07"]
user_setup: []
must_haves:
  truths:
    - "Running gsd_discuss on phase N first acquires the phase-N branch (or stays on it if already present), then writes CONTEXT + DISCUSSION-LOG and auto-commits .planning, so the phase's planning artefacts live on phase-N."
  artifacts:
    - path: "lib/discuss.js"
      provides: "Branch acquisition at the start of execute (ensurePhaseBranch) + best-effort artefact commit after STATE advance (commitArtifacts, scope 'discuss'), via the shared helper"
      min_lines: 0
      exports: ["apply"]
  key_links:
    - from: "lib/discuss.js"
      to: "lib/_git-artifacts.js"
      via: "imports ensurePhaseBranch + commitArtifacts and calls both inside execute() (per D-01/D-03)"
      pattern: "ensurePhaseBranch\\(|commitArtifacts\\("
    - from: "test/discuss-artifacts.test.mjs"
      to: "lib/discuss.js"
      via: "static source-assertion wiring test proves the import + both call sites"
      pattern: "ensurePhaseBranch|commitArtifacts"
---

<objective>
Wire the shared git seam into `gsd_discuss`: acquire `phase-<N>` at the very start of execute (before CONTEXT is written) and auto-commit the just-written planning artefacts at the end. This is the tracer end-to-end slice of the phase: branch-acquire + artefact-commit both wired in one tool, proven by a static wiring test, so the phase branch and clean tree that ship preflight needs begin to exist here.
</objective>

<context>
Read first:
- lib/_git-artifacts.js — the `ensurePhaseBranch(cwd, phaseNum, gitFn?)` and `commitArtifacts(cwd, phaseNum, { scope, phaseName }, gitFn?)` signatures (from plan 01).
- lib/discuss.js — current execute(): line 70 cwd, 73 isProject, 75-76 roadmap phase lookup, 77-78 iso/date, 131-132 writeArtifact CONTEXT/DISCUSSION-LOG, 135-136 setActivePhase + addDecision, 138 return. There is NO git interaction today.
- lib/_runner.js — `cwdOf(exec)` (line 99) already resolves cwd once (CQ-01); reuse the existing `cwd` variable, never re-derive it.
</context>

<tasks>

<task type="auto">
<name>Task 1: Acquire phase-N branch at discuss start and commit artefacts after the writes (tracer)</name>
<files>lib/discuss.js</files>
<read_first>lib/discuss.js, lib/_git-artifacts.js</read_first>
<action>
Edit `lib/discuss.js`:
1. Add an import for the shared helper alongside the existing imports (after line 10): `import { ensurePhaseBranch, commitArtifacts } from "./_git-artifacts.js";`
2. Inside `execute()`, immediately after the phase-existence check (line 76 `if (!phase) throw ...`) and BEFORE line 77 `const iso = nowIso();` (so the branch exists before any artefact write, per D-01 "at the start of gsd_discuss" and RESEARCH OQ-3): insert `const branchInfo = await ensurePhaseBranch(cwd, args.phase);`. Do not stash/reset the tree — `git checkout -b` already carries uncommitted files (D-09); the helper stays put when already on `phase-N` (D-10).
3. After the STATE advance (lines 135-136 `setActivePhase` + `addDecision`) and BEFORE the `return` at line 138: insert `const commit = await commitArtifacts(cwd, args.phase, { scope: "discuss", phaseName: phase.name });` (per D-03 discuss commits CONTEXT + DISCUSSION-LOG; D-04 keeps the tree clean; D-06 best-effort).
4. Update the returned string (line 138) to include the branch action and commit status, e.g. append ` Branch: ${branchInfo.action} (${branchInfo.branch}). Artefacts committed: ${commit.committed} (${commit.staged.length} file(s)).` and, when `commit.warning` is truthy, append ` WARNING: ${commit.warning}.`. Preserve the existing "Next: gsd_plan" guidance.
</action>
<verify>
node --test test/discuss-artifacts.test.mjs</verify>
<acceptance_criteria>
- grep "ensurePhaseBranch" lib/discuss.js
- grep "commitArtifacts" lib/discuss.js
- grep 'from "./_git-artifacts.js"' lib/discuss.js
- grep -c "ensurePhaseBranch(cwd, args.phase)" lib/discuss.js is 1
- grep -c "commitArtifacts(cwd, args.phase, { scope: \"discuss\"" lib/discuss.js is 1
- `node --test test/discuss-artifacts.test.mjs` exits 0 (after Task 2)
</acceptance_criteria>
<done>gsd_discuss acquires phase-N before writing CONTEXT and best-effort commits .planning after the STATE advance; return message reflects both outcomes.</done>
</task>

<task type="auto">
<name>Task 2: Static source-assertion wiring test for discuss.js</name>
<files>test/discuss-artifacts.test.mjs</files>
<read_first>test/ship.test.mjs, lib/discuss.js</read_first>
<action>
Create `test/discuss-artifacts.test.mjs` mirroring the static source-assertion style of `test/ship.test.mjs` (read the lib source via `readFile(new URL("../lib/discuss.js", import.meta.url), "utf8")`, node:test + node:assert/strict, no real git/fs). Assert:
- `discuss.js` imports both `ensurePhaseBranch` and `commitArtifacts` from `./_git-artifacts.js` (regex on the import statement).
- `ensurePhaseBranch(cwd, args.phase)` is called exactly once.
- `commitArtifacts(cwd, args.phase, { scope: "discuss", phaseName: phase.name })` is called exactly once, and it appears textually AFTER the `setActivePhase`/`addDecision` calls (index comparison) so the commit captures the STATE advance.
- `discuss.js` contains NO inline `promisify(execFile)` or `execFileSync("git"` — git stays in the shared helper (D-03 no duplication).
- The `ensurePhaseBranch` call appears textually BEFORE the `writeArtifact`/CONTEXT assembly calls (index comparison) so the branch exists before the CONTEXT write (D-01 placement).
</action>
<verify>
node --test test/discuss-artifacts.test.mjs</verify>
<acceptance_criteria>
- `node --test test/discuss-artifacts.test.mjs` exits 0
- `node --test test/*.test.mjs` still exits 0 (full suite; existing discuss static test in ship.test.mjs unaffected)
</acceptance_criteria>
<done>The static wiring test proves the import, both call sites, their ordering (branch before CONTEXT, commit after STATE), and the no-inline-git rule all hold.</done>
</task>

</tasks>

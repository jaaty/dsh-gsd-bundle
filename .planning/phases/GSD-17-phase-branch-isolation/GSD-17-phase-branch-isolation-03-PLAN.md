---
phase: 17-phase-branch-isolation
plan: 03
type: execute
wave: 2
depends_on: ["GSD-17-phase-branch-isolation-01"]
files_modified: [lib/plan.js, lib/execute.js, lib/verify.js, test/phase-tools-git.test.mjs]
autonomous: true
requirements: ["CQ-07"]
user_setup: []
must_haves:
  truths:
    - "gsd_plan, gsd_execute and gsd_verify each auto-commit .planning (scope plan/execute/verify) at the end of their run, so every phase tool leaves a clean working tree and ship preflight's clean-tree + protected-branch gates pass without manual intervention."
  artifacts:
    - path: "lib/plan.js"
      provides: "Best-effort commitArtifacts(cwd, args.phase, { scope: 'plan', phaseName: phase.name }) after planning completes (RESEARCH + PLANs + STATE)"
      min_lines: 0
      exports: ["apply"]
    - path: "lib/execute.js"
      provides: "Best-effort commitArtifacts(cwd, args.phase, { scope: 'execute', phaseName: phase.name }) after the wave loop / STATE advance (SUMMARies + STATE)"
      min_lines: 0
      exports: ["apply"]
    - path: "lib/verify.js"
      provides: "Best-effort commitArtifacts(cwd, args.phase, { scope: 'verify', phaseName: phase.name }) after setActivePhase (VERIFICATION + STATE)"
      min_lines: 0
      exports: ["apply"]
  key_links:
    - from: "lib/plan.js, lib/execute.js, lib/verify.js"
      to: "lib/_git-artifacts.js"
      via: "each imports commitArtifacts from ./_git-artifacts.js and calls it with its own scope at the end of execute()"
      pattern: "commitArtifacts\\(cwd, args\\.phase, \\{ scope: \"(plan|execute|verify)\""
    - from: "test/phase-tools-git.test.mjs"
      to: "lib/plan.js, lib/execute.js, lib/verify.js"
      via: "static source-assertion wiring test proves the imports and call sites and the no-inline-git rule"
      pattern: "commitArtifacts"
---

<objective>
Wire the shared `commitArtifacts` helper into the remaining three phase tools — `gsd_plan` (scope 'plan'), `gsd_execute` (scope 'execute'), and `gsd_verify` (scope 'verify') — so every phase tool auto-commits its planning artefacts to `phase-<N>` and leaves the working tree clean. This completes CQ-07: by the time gsd_ship runs, the branch exists (plan 02) and all tools have committed their artefacts (this plan), so ship preflight's clean-tree + protected-branch gates pass without manual intervention.
</objective>

<context>
Read first:
- lib/_git-artifacts.js — `commitArtifacts(cwd, phaseNum, { scope, phaseName }, gitFn?)` signature (from plan 01).
- lib/plan.js — execute() ends at line 148-150: `setActiveStep("execute")`/`addDecision` then the return.
- lib/execute.js — execute() ends at line 208-214: `setActivePhase` then the return.
- lib/verify.js — execute() ends at line 91: `setActivePhase` then the return at line 99.
- lib/_runner.js — each tool already resolves cwd once via `cwdOf(exec)` (CQ-01); reuse the existing `cwd`, never re-derive it.
</context>

<tasks>

<task type="auto">
<name>Task 1: Wire commitArtifacts into gsd_plan (tracer slice)</name>
<files>lib/plan.js</files>
<read_first>lib/plan.js, lib/_git-artifacts.js</read_first>
<action>
Edit `lib/plan.js`:
1. Add `import { commitArtifacts } from "./_git-artifacts.js";` alongside the existing imports (after line 12).
2. In `execute()`, after the `setActiveStep("execute")` call and `addDecision` call (line 149) and BEFORE the `return` at line 151, insert: `const commit = await commitArtifacts(cwd, args.phase, { scope: "plan", phaseName: phase.name });` (D-03 plan commits RESEARCH + PLANs; D-04 clean tree; D-06 best-effort).
3. Incorporate the commit result into the returned array: append a line `Planning artefacts committed: ${commit.committed} (${commit.staged.length} file(s)).${commit.warning ? " WARNING: " + commit.warning : ""}` before the "Next: gsd_execute" line.
</action>
<verify>
node --test test/phase-tools-git.test.mjs</verify>
<acceptance_criteria>
- grep "commitArtifacts" lib/plan.js
- grep 'from "./_git-artifacts.js"' lib/plan.js
- grep -c "commitArtifacts(cwd, args.phase, { scope: \"plan\"" lib/plan.js is 1
- `node --test test/phase-tools-git.test.mjs` exits 0 (after Task 3)
</acceptance_criteria>
<done>gsd_plan imports and calls commitArtifacts with scope 'plan' after its STATE advance, and reports the commit outcome.</done>
</task>

<task type="auto">
<name>Task 2: Wire commitArtifacts into gsd_execute and gsd_verify</name>
<files>lib/execute.js, lib/verify.js</files>
<read_first>lib/execute.js, lib/verify.js, lib/_git-artifacts.js</read_first>
<action>
Edit `lib/execute.js`:
1. Add `import { commitArtifacts } from "./_git-artifacts.js";` alongside the existing imports (after line 29).
2. In `execute()`, after the `if (allDone) { await s.setActivePhase(...) } else { await s.setActivePhase(...) }` block (lines 208-214) and BEFORE the final `return log.join("\n")` at line 215, insert: `const commit = await commitArtifacts(cwd, args.phase, { scope: "execute", phaseName: phase.name });` (D-03 execute commits SUMMARies + STATE; best-effort handles checkpointed/partial runs where nothing or only STATE changed — D-06). Append to the log: `Planning artefacts committed: ${commit.committed} (${commit.staged.length} file(s)).${commit.warning ? " WARNING: " + commit.warning : ""}` before returning.

Edit `lib/verify.js`:
1. Add `import { commitArtifacts } from "./_git-artifacts.js";` alongside the existing imports (after line 12).
2. In `execute()`, after `await s.setActivePhase(cwd, args.phase, ...)` (line 91) and BEFORE the `return [route, ...]` at line 99, insert: `const commit = await commitArtifacts(cwd, args.phase, { scope: "verify", phaseName: phase.name });` (D-03 verify commits VERIFICATION + STATE). Append a line to the returned array: `Verification artefacts committed: ${commit.committed} (${commit.staged.length} file(s)).${commit.warning ? " WARNING: " + commit.warning : ""}`.
Note: the verifier SUBAGENT is still told "DO NOT commit VERIFICATION.md" — the tool's own commitArtifacts call is what commits it; do not change the subagent instruction.
</action>
<verify>
node --test test/phase-tools-git.test.mjs</verify>
<acceptance_criteria>
- grep "commitArtifacts" lib/execute.js
- grep 'from "./_git-artifacts.js"' lib/execute.js
- grep -c "commitArtifacts(cwd, args.phase, { scope: \"execute\"" lib/execute.js is 1
- grep "commitArtifacts" lib/verify.js
- grep 'from "./_git-artifacts.js"' lib/verify.js
- grep -c "commitArtifacts(cwd, args.phase, { scope: \"verify\"" lib/verify.js is 1
- grep "DO NOT commit" lib/verify.js (subagent instruction intact)
- `node --test test/phase-tools-git.test.mjs` exits 0
</acceptance_criteria>
<done>gsd_execute and gsd_verify each import and call commitArtifacts with their own scope after their STATE advance; the verify subagent instruction is untouched.</done>
</task>

<task type="auto">
<name>Task 3: Static source-assertion wiring test for plan/execute/verify</name>
<files>test/phase-tools-git.test.mjs</files>
<read_first>test/ship.test.mjs, lib/plan.js, lib/execute.js, lib/verify.js</read_first>
<action>
Create `test/phase-tools-git.test.mjs` mirroring the static source-assertion style of `test/ship.test.mjs` (read each lib source via readFile, node:test + node:assert/strict, no real git/fs). For EACH of `plan.js`, `execute.js`, `verify.js`:
- Assert it imports `commitArtifacts` from `./_git-artifacts.js`.
- Assert its scope-specific call `commitArtifacts(cwd, args.phase, { scope: "plan"|"execute"|"verify", phaseName: phase.name })` appears exactly once.
- Assert the commitArtifacts call appears textually AFTER the tool's `setActivePhase`/`addDecision`/`setActiveStep` call (index comparison) so the commit captures the STATE advance and all artefact writes.
- Assert the file contains NO inline `promisify(execFile)` or `execFileSync("git"` — git stays in the shared helper (D-03 no duplication).
Additionally assert `lib/plan.js` is the ONLY one of the three whose scope is "plan", etc. — i.e. the three scope strings "plan", "execute", "verify" each appear exactly once across the three files (proves the per-tool scope mapping is correct, no copy-paste scope bug).
</action>
<verify>
node --test test/phase-tools-git.test.mjs</verify>
<acceptance_criteria>
- `node --test test/phase-tools-git.test.mjs` exits 0
- `node --test test/*.test.mjs` still exits 0 (full suite)
</acceptance_criteria>
<done>The static wiring test proves all three tools import and call commitArtifacts at the right point with the right per-tool scope and no inline git duplication.</done>
</task>

</tasks>

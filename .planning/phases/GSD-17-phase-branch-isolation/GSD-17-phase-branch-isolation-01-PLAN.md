---
phase: 17-phase-branch-isolation
plan: 01
type: execute
wave: 1
depends_on: []
files_modified: [lib/_git-artifacts.js, test/_git-artifacts.test.mjs]
autonomous: true
requirements: ["CQ-07"]
user_setup: []
must_haves:
  truths:
    - "A shared module lib/_git-artifacts.js exports ensurePhaseBranch(cwd, phaseNum, gitFn?) and commitArtifacts(cwd, phaseNum, opts, gitFn?) that both accept an injectable gitFn(cwd, argsArray), defaulting to an async promisify(execFile) git wrapper, so branch acquisition and artefact commits are a single reusable seam, not per-tool duplication."
  artifacts:
    - path: "lib/_git-artifacts.js"
      provides: "Shared ensurePhaseBranch + commitArtifacts git helpers (injectable gitFn): acquire phase-<N>, detect base via origin/HEAD->main, best-effort commit .planning wholesale, return staged-file list"
      min_lines: 80
      exports: ["ensurePhaseBranch", "commitArtifacts"]
  key_links:
    - from: "test/_git-artifacts.test.mjs"
      to: "lib/_git-artifacts.js"
      via: "unit tests drive both helpers through a fake gitFn (the fetchGitData seam pattern), no real git/fs"
      pattern: "ensurePhaseBranch\\(|commitArtifacts\\("
---

<objective>
Create the single shared git-artifact seam that every phase tool will reuse. This plan delivers `lib/_git-artifacts.js` exporting `ensurePhaseBranch` (D-01, D-02, D-05, D-08, D-09, D-10) and `commitArtifacts` (D-03, D-04, D-06) plus a full fake-gitFn unit-test suite, so plans 02 and 03 can wire the tools by importing and calling these exact signatures. No phase tool is modified here — this is pure, tested foundation.
</objective>

<context>
Read first:
- lib/gates.js — `fetchGitData(cwd, gitFn, base)` (lines 223-248): the injectable-gitFn test seam this module mirrors; the default branch fallback `origin/HEAD`->`main` expression.
- lib/ship.js — `git()`/`gitOk()` (lines 26-34) promisify(execFile) async style; preflightError cause propagation (41-49); `git add .planning` (186), `git diff --cached --name-only` (189).
- lib/map-codebase.js — `gitAddCommit` (59-67) best-effort tolerance precedent.
- lib/_shared.js — `slugify(input)` (line 5) for building the commit message subject.
</context>

<tasks>

<task type="auto">
<name>Task 1: Build the shared git-artifact module (tracer slice)</name>
<files>lib/_git-artifacts.js</files>
<read_first>lib/gates.js, lib/ship.js, lib/map-codebase.js, lib/_shared.js</read_first>
<action>
Create `lib/_git-artifacts.js`. It is a library module — no tool registration, no ctx. Exports exactly two named functions plus one internal default git wrapper:

1. Import `execFile` from `node:child_process`, `promisify` from `node:util`, and `slugify` from `./_shared.js`.

2. Define `const execFileP = promisify(execFile);` and `async function defaultGitFn(cwd, args) { return (await execFileP("git", args, { cwd, encoding: "utf8" })).stdout.trim(); }` — the async default (mirrors ship.js `git`). It must NOT be the sync `execFileSync` of map-codebase.

3. `export async function ensurePhaseBranch(cwd, phaseNum, gitFn = defaultGitFn)` — acquire the per-phase branch, unpadded N:
   - `const branch = \`phase-${phaseNum}\`;`
   - `let current; try { current = (await gitFn(cwd, ["rev-parse", "--abbrev-ref", "HEAD"])).trim(); } catch { return { branch, action: "noop", warning: "git unavailable or not a repository — branch acquisition skipped" }; }` (D-08 no-git no-op, does NOT throw).
   - If `current === branch`, return `{ branch, action: "present" }` (D-01 stay-put / D-10 re-run — no checkout issued).
   - Determine base: `let defaultBranch; try { defaultBranch = (await gitFn(cwd, ["symbolic-ref", "refs/remotes/origin/HEAD", "--short"])).trim().replace(/^origin\//, "") || "main"; } catch { defaultBranch = "main"; }` (D-02 fallback, mirrors ship line 87).
   - If `current !== defaultBranch` throw `new Error(\`gsd_*: on branch "${current}", not base "${defaultBranch}" nor "phase-${phaseNum}". Checkout a base branch before discussing.\`, { cause: undefined })` (D-01, D-05 fail-loud on a non-base branch).
   - Otherwise `try { await gitFn(cwd, ["checkout", "-b", branch]); } catch (e) { throw new Error(\`gsd_*: git checkout -b ${branch} failed: ${e.message}\`, { cause: e }); }` (D-05 real-cause propagation).
   - Return `{ branch, defaultBranch, action: "created" }`.
   - Do NOT stash, reset, or `checkout -b` when already on the target branch (D-09 dirty-tree carry is git's own `checkout -b` behaviour — never interfere).

4. `export async function commitArtifacts(cwd, phaseNum, { scope, phaseName }, gitFn = defaultGitFn)`:
   - `const message = \`docs(planning): phase ${phaseNum} ${slugify(phaseName)} ${scope} artefacts\`;`
   - `try { await gitFn(cwd, ["add", ".planning"]); } catch (e) { return { committed: false, staged: [], message, warning: \`git add failed: ${e.message}\` }; }` — stage `.planning` WHOLESALE so STATE.md + the phase dir are both captured (D-04 clean-tree; RESEARCH R1/OQ-1 — never stage only the phase subdir).
   - `let staged; try { staged = (await gitFn(cwd, ["diff", "--cached", "--name-only"])).split("\n").filter(Boolean); } catch { staged = []; }`
   - If `!staged.length` return `{ committed: false, staged: [], message, warning: "nothing staged — no planning changes to commit" }` (D-06).
   - `try { await gitFn(cwd, ["commit", "-m", message]); } catch (e) { return { committed: false, staged, message, warning: \`git commit failed: ${e.message}\` }; }` (D-06 best-effort, surfaces the cause in the warning).
   - Return `{ committed: true, staged, message }` (OQ-5 staged list for logging).

5. Add a short header comment documenting the module purpose, the injectable-gitFn seam (mirroring gates.js fetchGitData), and a one-line security note that every git call uses a fixed argument array with `-C cwd` (never a shell string).
</action>
<verify>
node --test test/_git-artifacts.test.mjs</verify>
<acceptance_criteria>
- grep "export async function ensurePhaseBranch" lib/_git-artifacts.js
- grep "export async function commitArtifacts" lib/_git-artifacts.js
- grep '\["checkout", "-b"' lib/_git-artifacts.js
- grep '\["add", ".planning"\]' lib/_git-artifacts.js
- grep 'docs(planning): phase' lib/_git-artifacts.js
- `node --test test/_git-artifacts.test.mjs` exits 0 after Task 3 completes
</acceptance_criteria>
<done>Both functions exist with the exact signatures and a fake-gitFn test drives at least one behaviour of each; module has a security comment.</done>
</task>

<task type="auto">
<name>Task 2: Unit-test ensurePhaseBranch via a fake gitFn</name>
<files>test/_git-artifacts.test.mjs</files>
<read_first>test/gates.test.mjs, lib/_git-artifacts.js</read_first>
<action>
Create `test/_git-artifacts.test.mjs` (node --test + node:assert/strict, mirroring test/gates.test.mjs style — no real git/fs). Import `{ ensurePhaseBranch, commitArtifacts }` from `../lib/_git-artifacts.js`. Write a `describe("ensurePhaseBranch")` block with a helper `scriptedGit(...)` returning a fake gitFn that records every `args` array it was called with into an array, and returns canned stdout per the first arg, and can be told to reject (for no-git). Cover exactly these cases (D-01/D-02/D-05/D-08):
- already on `phase-7`: fake rev-parse returns "phase-7"; assert result.action === "present" and NO call contains "checkout".
- on `main` with `origin/HEAD`=origin/main: assert result.action === "created" and the issued call array equals ["checkout","-b","phase-7"].
- on `main` with symbolic-ref rejecting (no origin/HEAD): assert the base fell back to "main" and "checkout -b phase-7" was still issued (D-02).
- on an unrelated feature branch `foo` with base `main`: assert it throws, message mentions branch "foo" (D-01, D-05).
- gitFn rejects on the very first rev-parse call: assert it returns action "noop" with a warning and does NOT throw (D-08).
Assert the branch name uses the unpadded phase number (phase-7, not phase-07).
</action>
<verify>
node --test test/_git-artifacts.test.mjs</verify>
<acceptance_criteria>
- grep -c "test(" test/_git-artifacts.test.mjs is >= 5
- `node --test test/_git-artifacts.test.mjs` exits 0
</acceptance_criteria>
<done>All five ensurePhaseBranch behaviours (stay-put, create, base-fallback, fail-loud, no-git no-op) pass with the fake gitFn.</done>
</task>

<task type="auto">
<name>Task 3: Unit-test commitArtifacts via a fake gitFn</name>
<files>test/_git-artifacts.test.mjs</files>
<read_first>lib/_git-artifacts.js, test/gates.test.mjs</read_first>
<action>
Extend `test/_git-artifacts.test.mjs` with a `describe("commitArtifacts")` block using the same recorded-calls fake gitFn. Cover exactly these cases (D-06, OQ-5):
- happy path: `add .planning` then `diff --cached --name-only` returns "a.md\nb.md"; assert result.committed === true, result.staged deep-equals ["a.md","b.md"], a "commit" call with `-m` and the conventional message was issued, and the message matches /^docs\(planning\): phase 17 phase-branch-isolation discuss artefacts$/ (pass scope "discuss", phaseName "phase-branch-isolation").
- nothing staged: `diff --cached --name-only` returns ""; assert committed === false, warning contains "nothing staged", and NO "commit" call was issued (D-06).
- gitFn rejects on `add`: assert committed === false, no throw, warning mentions "git add failed" (D-06).
- gitFn rejects on `commit`: assert committed === false, no throw, warning mentions "git commit failed" (D-06).
Assert the add target is exactly ".planning" (the wholesale stage), proving STATE.md + phase dir are both captured.
</action>
<verify>
node --test test/_git-artifacts.test.mjs</verify>
<acceptance_criteria>
- `node --test test/_git-artifacts.test.mjs` exits 0 with the full suite (ensurePhaseBranch + commitArtifacts blocks)
- grep '\.planning' lib/_git-artifacts.js (wholesale stage target)
</acceptance_criteria>
<done>commitArtifacts happy path, nothing-staged, add-failure and commit-failure cases all pass; the conventional message format is asserted by regex.</done>
</task>

</tasks>

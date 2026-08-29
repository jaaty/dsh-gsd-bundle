---
phase: 20-multi-window-topology
plan: 02
type: execute
wave: 2
depends_on: ["GSD-20-multi-window-topology-01"]
files_modified: [lib/_git-artifacts.js, test/_git-artifacts.test.mjs]
autonomous: true
requirements: ["MW-01", "MW-02"]
must_haves:
  truths:
    - "When phase-N already exists locally (show-ref refs/heads/phase-N), ensurePhaseBranch checks it out (git checkout phase-N) and returns action 'joined-local' instead of failing checkout -b (D-03)."
    - "When phase-N exists only as a remote tracking ref, ensurePhaseBranch checks it out with git checkout --track origin/phase-N and returns action 'joined-remote' (D-03, OQ-3)."
    - "Every non-noop acquire (present / joined-local / joined-remote / created) issues a best-effort git push -u origin phase-N; a push failure is swallowed into a result warning and does NOT throw (D-05, D-06)."
    - "A NEW phase from a non-base, non-phase branch still fails loud (throws) — the fail-loud guard applies only to the create path, so joining an existing phase from a non-base branch must NOT throw (D-08, OQ-2)."
  artifacts:
    - path: "lib/_git-artifacts.js"
      provides: "ensurePhaseBranch extended with local/remote join + best-effort early push, plus a private refExists / bestEffortPush refactor using fixed '-C cwd' arg arrays (D-07)"
      min_lines: 180
      exports: ["ensurePhaseBranch", "commitArtifacts"]
  key_links:
    - from: "ensurePhaseBranch acquire paths (present/joined/created)"
      to: "best-effort early push"
      via: "a private bestEffortPush helper invoked on every non-noop acquire path, swallowing failures into a push.{ok,warning} on the result"
      pattern: "push.*-u.*origin"
---

<objective>
Extend `ensurePhaseBranch(cwd, phaseNum, gitFn)` (lib/_git-artifacts.js) to support the parallel multi-window topology (MW-01) and the early phase-branch push (MW-02). Per D-01 the topology is PARALLEL GitHub-flow: each `phase-<N>` forks from the repository default and merges back via its own PR — never off another phase's unmerged branch — so no change makes a phase fork off another phase. When `phase-<N>` already exists — locally or as an already-fetched remote tracking ref — branch acquisition JOINS it (git checkout) instead of failing `checkout -b` (D-03), generalizing the existing `present` behavior to `joined-local` and `joined-remote`. Every non-noop acquire path additionally issues a BEST-EFFORT `git push -u origin phase-N` at acquire (D-05) that swallows no-remote / network / non-fast-forward failures into a warning on the result (D-06), so offline or no-remote setups still proceed; the authoritative push/PR remains at ship.js (D-02, unchanged — Plan 02 does not touch ship.js or gates.js). All new git calls use FIXED argument arrays with `-C cwd` (D-07) and the same injectable `gitFn` seam, keeping the existing fake-gitFn unit tests the source of truth.
</objective>

<context>
@lib/_git-artifacts.js (ensurePhaseBranch lines 36-78 is the function to extend; the existing `present`/`created`/`noop` actions and defaultBranch derivation at lines 52-60 stay intact)
@test/_git-artifacts.test.mjs (fake gitFn `scriptedGit` lines 13-25 and existing ensurePhaseBranch tests lines 31-77 — two of these assert `git.calls.at(-1)` deep-equals `["checkout","-b","phase-7"]` and must be updated once the early push follows acquire)
@lib/_shared.js isValidRef / SAFE_REF_RE (lines 370-374 — validate any model-derived ref before use)
@lib/discuss.js (line 149 surfaces `branchInfo.action` / `branchInfo.branch` — keep those fields on the result; do not change the call site)
</context>
<tasks>
  <task type="auto">
    <name>Task 1: Add best-effort early push and update existing acquire tests (tracer, MW-02 / D-05 / D-06)</name>
    <files>lib/_git-artifacts.js, test/_git-artifacts.test.mjs</files>
    <read_first>lib/_git-artifacts.js, test/_git-artifacts.test.mjs</read_first>
    <action>
In lib/_git-artifacts.js, refactor the acquire flow around a private async helper `bestEffortPush(cwd, gitFn)` that issues `gitFn(cwd, ["push", "-u", "origin", "phase-<N>"])` inside try/catch and returns `{ ok: true }` on success or `{ ok: false, warning: "early push failed: <msg>" }` on any rejection (no rethrow; mirrors commitArtifacts/ship.js gitOk best-effort semantics per D-06). Wire it into `ensurePhaseBranch` so EVERY non-noop return path — the early `present` return, the to-be-added `joined-local`/`joined-remote` returns (Task 2/3), and the `created` return — runs `bestEffortPush` first and attaches the helper's result onto the returned object as `push` (e.g. `{ branch, defaultBranch, action, push }`). The `noop` (git-unavailable) path must NOT push. The push argument array is fixed and uses `-C cwd` only via the injectable gitFn seam (D-07) — never a shell string. Keep returning `branch` and `action` exactly as before so discuss.js line 149 is unaffected. Then, in test/_git-artifacts.test.mjs, update the two existing tests at lines 49 and 60 whose last assertion `assert.deepEqual(git.calls.at(-1), ["checkout","-b","phase-7"])` would now see the trailing push as the last call: replace `calls.at(-1)` with a `hasCall(git.calls, "-b")` / `hasCall(git.calls, "push")` pair (assert the checkout-`-b` call is present and a `push` call is present), and extend the scripted `responses` for those two tests to include `"push": ""` so push succeeds. Add two new tests: (a) create path with a scripted successful `push` asserts the final return `push.ok === true` and `hasCall(git.calls, "push")`; (b) with `rejectArg: "push"`, the acquire still returns `action: "created"` with `push.ok === false` and a `push.warning` matching /early push failed/ and does NOT throw (D-06 best-effort).
</action>
    <verify>Run: node --test test/_git-artifacts.test.mjs — every ensurePhaseBranch + commitArtifacts test passes.</verify>
    <acceptance_criteria>
      - grep -n "push" lib/_git-artifacts.js shows a `push -u origin` fixed-arg array and a best-effort try/catch (no rethrow).
      - grep -n "calls.at(-1)" test/_git-artifacts.test.mjs returns zero matches (no remaining last-call assertion that the push breaks).
      - node --test test/_git-artifacts.test.mjs exits 0, including the two new push-success and push-failure(best-effort) tests.
    </acceptance_criteria>
    <done>ensurePhaseBranch issues a best-effort `push -u origin phase-N` on every non-noop acquire path, the push failure is swallowed into a warning, and the two stale `calls.at(-1)` assertions are replaced with presence checks.</done>
  </task>

  <task type="auto">
    <name>Task 2: Local join + fail-loud-only-for-new-phase guard (MW-01 / D-03 / D-08 / OQ-2)</name>
    <files>lib/_git-artifacts.js, test/_git-artifacts.test.mjs</files>
    <read_first>lib/_git-artifacts.js</read_first>
    <action>
In lib/_git-artifacts.js, add a private async helper `refExists(cwd, gitFn, ref)` that issues `gitFn(cwd, ["show-ref", "--verify", "--quiet", ref])` inside try/catch and returns `true` on success (exit 0) or `false` on any rejection — this is the explicit local-probe for join (OQ-1, fixed-args, `-C cwd` via the seam, D-07). In `ensurePhaseBranch`, after deriving `defaultBranch` (lines 52-60, unchanged) and BEFORE the current `if (current !== defaultBranch) throw` guard, probe `localExists = await refExists(cwd, gitFn, \`refs/heads/${branch}\`)`. When `localExists` is true, run `gitFn(cwd, ["checkout", branch])` inside a try/catch that, on rejection, throws `new Error(\`gsd_*: git checkout ${branch} (join existing local phase branch) failed: ${e.message}\`)`; on success run `bestEffortPush` (from Task 1) and return `{ branch, defaultBranch, action: "joined-local", push }`. The fail-loud `current !== defaultBranch` throw must now apply ONLY when the phase does NOT already exist — place it only in the create path (the else-branch after all join probes return false), so joining an existing phase from a non-base branch checks out and does NOT throw (OQ-2), while creating a NEW phase from a non-base branch still throws (D-08). In test/_git-artifacts.test.mjs, extend the `scriptedGit` fake so probe responses can be keyed by the FULL args (`args.join(" ")`) as well as by `argv[0]`, resolving full-args key first then falling back to `responses[args[0]]` — this lets the two distinct `show-ref` probes (`refs/heads/phase-7` vs `refs/remotes/origin/phase-7`) be scripted independently (RESEARCH risk 1; `scriptedGit` currently keys only by `argv[0]` at line 19). Add tests: (a) from main with local `show-ref refs/heads/phase-7` scripted to return `"refs/heads/phase-7"` and both checkout + push scripted to succeed, asserts `action === "joined-local"`, `hasCall(git.calls, "checkout")` with the checkout arg being a bare `["checkout","phase-7"]` (no `-b`), and no throw; (b) from a non-base branch `foo` with local `show-ref refs/heads/phase-7` existing, asserts `action === "joined-local"` and does NOT throw (OQ-2); (c) from a non-base branch `foo` with NO existing phase (both show-ref probes reject), asserts the original `/"foo"/` throw still fires (D-08 create-path guard preserved); (d) from main with no existing phase, the original `created` test at lines 40-50 still passes (with the Task-1 push update).
</action>
    <verify>Run: node --test test/_git-artifacts.test.mjs — local-join, OQ-2, and the preserved create-path throw all pass.</verify>
    <acceptance_criteria>
      - grep -n "joined-local\|refs/heads/" lib/_git-artifacts.js shows the local probe `show-ref --verify --quiet refs/heads/phase-` and the `joined-local` action.
      - grep -n "show-ref" test/_git-artifacts.test.mjs shows a `scriptedGit` full-args-keying fallback and the local-exists probe.
      - node --test test/_git-artifacts.test.mjs exits 0, including test (c) asserting the D-08 create-path throw still fires from a non-base branch.
    </acceptance_criteria>
    <done>ensurePhaseBranch joins an existing local phase-N via `git checkout phase-N` (action joined-local) and restricts the fail-loud non-base guard to the new-phase create path, proven by tests for join-on-non-base (OQ-2) and preserved create-throw (D-08).</done>
  </task>

  <task type="auto">
    <name>Task 3: Remote join incl. best-effort fetch fallback (MW-01 / D-06 / OQ-3)</name>
    <files>lib/_git-artifacts.js, test/_git-artifacts.test.mjs</files>
    <read_first>lib/_git-artifacts.js</read_first>
    <action>
In lib/_git-artifacts.js, extend the join detection in `ensurePhaseBranch` (from Task 2) to also probe the remote tracking ref: `remoteExists = await refExists(cwd, gitFn, \`refs/remotes/origin/${branch}\`)`. When `remoteExists` is false AND `localExists` is false, perform a best-effort fetch to discover a remote phase-N before creating: call `gitFn(cwd, ["fetch", "origin", branch, "--no-tags"])` inside try/catch (no rethrow, per D-06) and, only if it succeeds, re-probe `remoteExists = await refExists(cwd, gitFn, \`refs/remotes/origin/${branch}\`)`. When `remoteExists` is true (and `localExists` false), run `gitFn(cwd, ["checkout", "--track", \`origin/${branch}\`])` inside a try/catch that on rejection throws a descriptive error carrying `e.message`; on success run `bestEffortPush` and return `{ branch, defaultBranch, action: "joined-remote", push }`. Resolution precedence is: local-first, then remote, then create — the create path (with its non-base fail-loud guard) is reached only when both probes fail (after the best-effort fetch). Keep `validity-checking` in mind: the branch/base are derived from `phaseNum` (a safe number) so no model-derived interpolation is possible here, but the fetch/checkout arg arrays remain fixed `-C cwd` via the seam (D-07). In test/_git-artifacts.test.mjs add tests against the full-args-keyed `scriptedGit`: (a) from main with no local ref but `show-ref refs/remotes/origin/phase-7` scripted to return the ref, asserts `action === "joined-remote"` and `hasCall(git.calls, "--track")` with the checkout call deep-equal `["checkout","--track","origin/phase-7"]`; (b) tracking ref ABSENT but a best-effort `fetch origin phase-7 --no-tags` scripted to succeed, then re-probed remote ref present, asserts the flow performs the fetch, then the `--track` checkout, `action === "joined-remote"`, and does NOT fall to create; (c) both probes reject AND `fetch` rejects (rejectArg "fetch"), asserts the create path runs (`action === "created"`) without throwing (D-06 remote-join best-effort fallback to create). Ensure no test relies on `calls.at(-1)` here.
</action>
    <verify>Run: node --test test/_git-artifacts.test.mjs — remote-join, fetch-fallback, and create-fallback tests all pass.</verify>
    <acceptance_criteria>
      - grep -n "joined-remote\|checkout\", \"--track\"\|fetch" lib/_git-artifacts.js shows `refs/remotes/origin/phase-`, the `["checkout","--track", origin/phase-]` fixed array, and the best-effort fetch.
      - grep -n "joined-remote\|--track\|--no-tags" test/_git-artifacts.test.mjs shows the three remote-join tests.
      - node --test test/_git-artifacts.test.mjs exits 0.
    </acceptance_criteria>
    <done>ensurePhaseBranch joins an existing remote phase-N via `git checkout --track origin/phase-N` (action joined-remote), with a best-effort `fetch origin phase-N --no-tags` discovery fallback (OQ-3) whose failures degrade to the create path without throwing (D-06).</done>
  </task>
</tasks>

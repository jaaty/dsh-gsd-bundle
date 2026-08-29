I have a complete picture. Here is the full RESEARCH.md output.

---

# Phase 35: pr-branch — Research

**Researcher:** gsd-phase-researcher · **Phase goal:** *Add a clean-PR-branch path so gsd_ship creates a review branch that filters out .planning/ commits, leaving reviewers with only real code changes (GAP-01).*

## Domain analysis

### The current ship topology (GAP-01's host)
- `gsd_ship` is `lib/ship.js`, whose `execute` runs 10 numbered steps against the **phase-`<N>`** branch the agent sits on. Steps that matter to this phase [VERIFIED: `lib/ship.js:107-232`]:
  - **5.5** capability gates → `fetchGitData(cwd, git, defaultBranch)` + `runCapabilityGates` (aborts on fail before any I/O).
  - **5.6** pre-ship-verify → clean `npm ci` + `npm test` in a temp copy (`preflight-verify.js`).
  - **6** `git push -u origin <branch>` (pushes phase-`<N>`).
  - **7** builds the PR body (Summary / Changes / Requirements Addressed / Verification / Key Decisions) from planning artefacts — *unchanged by D-* (specifics: body assembly stays).
  - **8** `gh pr create --base <defaultBranch>` against the **pushed phase-`<N>`** branch.
  - **9** `updateStateFrontmatter` + `addDecision` + `completePhase` write the **"Phase N shipped — PR #X"** markers into `.planning/`.
  - **10** `git add .planning; git commit; git push phase-N` **after** the PR number is known.

- Every phase runs on its own `phase-<N>` feature branch, acquired at `gsd_discuss` via `lib/_git-artifacts.js:ensurePhaseBranch` (CQ-07/phase 17), and pushed to origin at acquire (MW-02/phase 20). In-repo evidence: current branch `phase-35`, remote branches `origin/main`, `origin/phase-34`, `origin/phase-35` [VERIFIED: `git branch -a` this session].

### The change set gsd_ship currently exposes
- `fetchGitData` (the gates' seam) computes, at `lib/gates.js:248`, `mergeBase = git merge-base HEAD <base>` using the **LOCAL** cleaned base ref (`lib/ship.js:94` strips `origin/` from `symbolic-ref refs/remotes/origin/HEAD`). It lists changed files with `git diff --name-only --diff-filter=ACM <mergeBase> HEAD` (`lib/gates.js:250`) — **no `.planning` filtering** anywhere today. That is the gap finding E1: every phase PR carries PLAN/SUMMARY/STATE noise [VERIFIED, planning_context #specifics].

### Per-phase vs cross-phase `.planning/` — the D-01/D-02 distinction
The curate decision (phase 26, D-06/D-07) tracks **durable** cross-phase artefacts and gitignores the **volatile** churn. In-repo `.gitignore` [VERIFIED, `.gitignore:5-14`]:
```
.planning/async-jobs.json
.planning/WINDOWS.md
.planning/quick/
.planning/phases/**/*-DISCUSSION-LOG.md
```
So the tracked tree under a phase directory is the per-phase PLAN/SUMMARY/CONTEXT/RESEARCH/VERIFICATION/UI-SPEC files. Confirmed tracked examples under `git ls-files .planning/phases/*` — `GSD-35-pr-branch/` currently has `GSD-35-pr-branch-CONTEXT.md` staged [VERIFIED]. Durable cross-phase files live at `.planning/` root: `STATE.md`, `ROADMAP.md`, `REQUIREMENTS.md`, `PROJECT.md`, `config.json`, `DEFERRED.md`, `.planning/codebase/` [VERIFIED in `.planning/` tree]. **This is exactly the boundary D-01 draws**: drop only `.planning/phases/`, keep everything else.

### The upstream reference — and the narrowing D-01 makes
The canonical reference is upstream `/gsd-pr-branch`, which **excludes all of `.planning/`** and re-presents the phase on a clean branch. D-01 deliberately narrows that: this repo curates the durable artefacts into git, so only the **per-phase subtree** is dropped and the durable files stay in the PR diff so `main`'s orientation stays current. [CITED: planning_context canonical_refs → https://github.com/open-gsd/gsd-core/blob/master/commands/gsd/pr-branch.md; the same workflow also lives at https://github.com/open-gsd/gsd-core/blob/next/gsd-core/workflows/pr-branch.md and as a skill at https://github.com/open-gsd/gsd-core/blob/main/skills/gsd-pr-branch/SKILL.md]. The exact exclusion primitive and branch topology are new to this bundle (no existing code does a filtered branch) [VERIFIED: grep for `switch`/`checkout`/`merge-base`/`rev-parse` across `lib/*.js` finds only branch-acquire and gates, no clean-branch builder].

### Git mechanics for a filtered forward-application branch (D-02/D-03/D-04/D-06)
The clean branch must be a **forward squash application** of the phase's real-code diff, with `.planning/phases/` excluded, onto `origin/<base>` HEAD, with **no history rewrite**. The building blocks, all confirmed against this repo's local git [VERIFIED this session]:
- Exclusion pathspec: `git diff --name-status <mergeBase> HEAD -- . ':(exclude).planning/phases'` is the correct magic form (the `:` prefix is required). Verified: filtering the current `phase-35` diff drops `GSD-35-pr-branch/GSD-35-pr-branch-CONTEXT.md` and keeps `REQUIREMENTS.md`, `ROADMAP.md`, `STATE.md` (the durable three). Bare `(exclude).planning/phases` without the colon matches nothing and returns 0 files — a classic foot-gun to encode carefully. [VERIFIED via `git diff --name-status` this session; syntax per https://git-scm.com/docs/git-pathspecs — CITED].
- Squash application without filter-branch: `git switch -c <clean> origin/<base>` then `git checkout <headCommit> -- . ':(exclude).planning/phases'` (stages A/M + R-new from the phase tip), plus `git rm` for paths deleted by the phase, then a single `git commit`. This is clean forward application; nothing is rewritten. [ASSUMED: standard git plumbing; the copy-from-tree behaviour of `git checkout <tree> -- <paths>` and `git switch -c` are well-established — CITED https://git-scm.com/docs/git-checkout].
- Merge-base under a possibly-advanced base: `git merge-base origin/<base> HEAD` (D-04). Note the today's `fetchGitData` uses the **local** `main` ref (`lib/gates.js:248`), which can be stale vs `origin/main` under the multi-window topology — for the **clean branch** the merge-base should target `origin/<base>` per D-04 (see Open Question OQ-1, resolved below).

### Config/UX surface for the switch (D-09)
- Config is read via `gsdState.readConfig(cwd)` → `.planning/config.json` (`lib/state.js:376-380`); the default workflow block (`lib/state.js:183-202`) already carries `discuss_mode`, `nyquist_validation`, `pattern_mapper`, `tdd_mode`, `mvp_mode`, `use_worktrees`, `agent_hint_routing`, `text_mode`, `commit_docs` — **but no `clean_pr_branch` key** [VERIFIED `_defaultConfig`]. `readConfig` returns a default on a missing/corrupt file and never throws [VERIFIED `lib/state.js:376-380`], so an **absent key must default clean-PR to ON** via `cfg?.workflow?.clean_pr_branch !== false`, not via a hardcoded default-`true` that a future schema validation would trip on a false value.
- The tool already exposes boolean/array params `draft`, `base`, `skip_gates`, `skip_verify` in snake_case (`lib/ship.js:63-69`). The new param must be **`no_clean_pr`** (snake_case, matching sibling params), boolean, overriding config when passed (D-09).

### No new dependencies
D-10 fixes the implementation to `node:child_process` (already used by `execFile`) + `node:fs/promises` + the existing `git`/`gh` CLIs. Every primitive needed (merge-base, diff with pathspec, switch, checkout, commit, push, `gh pr create`) is already invoked elsewhere in this bundle. **No package to vet** — Package legitimacy section below is therefore N/A for runtime deps.

## Package legitimacy
**None proposed.** No new runtime dependencies. The implementation reuses:
- `node:child_process.execFile` (promisified) — the same mechanism `ship.js` already uses for `git`/`gh` [VERIFIED `lib/ship.js:23`].
- `node:fs/promises` — already imported ad hoc inside `execute` for the PR-body temp file [VERIFIED `lib/ship.js:193`].
- `git` and `gh` **CLI binaries** — already project prerequisites (`ship.js` fails preflight when `origin` or `gh` are absent; `gh auth status` checked at step 5) [VERIFIED `lib/ship.js:101-104`].
All references to `@deepseek-ai/dsh-tools` (for `defineTool`) are existing imports [VERIFIED `lib/ship.js:13`], not new.

## Risks

- **R1 — Ordering vs the completion write (HIGH).** Today step 10 (`git add .planning` + commit + push phase-`<N>`) writes the "Phase N shipped — PR #X" STATE marker **after** PR creation. If the clean branch is derived from the phase-`<N>` tree, it must be built from a snapshot **before** that write, or the clean diff would either (a) miss the completion STATE (acceptable) or (b) be derived from a dirty tree. The clean branch should be built from `HEAD` (pre-completion) and the completion commit must go only to phase-`<N>`. D-01 only requires the durable files to be *present* in the PR diff — not the final shipped marker. Mitigation: build the clean branch immediately after gates pass (step 5.x), capturing `headCommit = git rev-parse HEAD` before any STATE write.
- **R2 — Deleted/renamed files outside `.planning/phases/`.** `git checkout <head> -- . ':(exclude)…'` copies added/modified paths but does **not** remove a path the phase deleted, and leaves a renamed path's old name behind (it still exists on `origin/<base>`). Must read `git diff --name-status` and additionally `git rm` any D-status path and any R old-path that is outside the exclusion. Realistic but rare; correctness cost is silent stale files in the PR.
- **R3 — Pathspec magic foot-gun.** The exclusion requires the `:(exclude)` colon prefix. Encoding it as a shared constant and reusing the exact string everywhere (mirroring the CQ-02 single-source-constants discipline) prevents one-off copy drift. The current `fetchGitData` uses `--diff-filter=ACM`; the clean-branch builder needs **name-status including D/R**, so it must issue its own diff rather than reuse `fetchGitData`'s `changedFiles` (which are ACM-only).
- **R4 — Clean branch is a presentation layer, not a source of truth.** Per-plan atomic history and the full `.planning` stay on phase-`<N>` (D-03/D-06). Risk of reviewers treating the squash as canonical; mitigated by the commit message and D-05's `phase-<N>-clean` naming.
- **R5 — Stale local base ref under multi-window.** `merge-base HEAD main` can differ from `merge-base HEAD origin/main` when `main` advances. D-04 resolves to `origin/<base>`; see OQ-1.
- **R6 — Testing style tension.** The suite is deliberately pure/static (scripted fake `gitFn`, source-string assertions — see `test/_git-artifacts.test.mjs`, `test/gates-ship.test.mjs`). A real-git e2e for branch creation is the most convincing GAP-01 proof but must follow the established seams. Claude's Discretion covers the exact test spread.

## Open Questions

- **OQ-1 — Which base ref feeds the clean-branch merge-base, and must we fetch? (RESOLVED — use `origin/<base>`, quiet-fetch first.)** D-04 says `merge-base(origin/<base>, HEAD)` and "reusing fetchGitData's base resolution"; today's `fetchGitData` uses the local cleaned `main` (`lib/gates.js:248`). To honour D-04 under an advancing/multi-window base: the builder issues `git fetch origin <base> --quiet` (guarded, best-effort), then `mergeBase = git merge-base origin/<base> HEAD`, then `headCommit = git rev-parse HEAD`. Fetching is safest because `origin/<base>` must be a valid local ref for `git switch -c <clean> origin/<base>` anyway. Do **not** reuse `fetchGitData`'s `changedFiles` (ACM-only, local-base) for the builder; reuse only the *concept* of merge-base resolution. **BLOCKING BEFORE PLAN** — nothing blocks implementation of this; it is a decision the planner must encode, now resolved with the recommendation above.

- **OQ-2 — Which single tree snapshot is the clean branch squashed from? (RESOLVED — phase-`<N>` HEAD as it stands when gates pass, i.e. pre-completion.)** Because the completion markers (step 9/10) are written after PR creation, the clean branch must be derived from `HEAD` before those writes. The clean branch then carries the phase's code + durable-pre-completion state, which satisfies D-01 ("durable files stay in the PR diff") without leaking the "shipped" marker. The fallback (D-07) and the gates are unaffected. The builder should capture `headCommit` immediately after the gate section. **BLOCKING** — resolved; the planner must sequence builder-before-STEP9.

- **OQ-3 — What exactly triggers the D-07 fallback to the phase-`<N>` PR? (RESOLVED — zero non-`.planning/phases/` changed paths.)** After computing the filtered name-status set, if **every** changed path is under `.planning/phases/`, skip clean-branch construction entirely and push/PR phase-`<N>` as today. Encoded as a pure predicate `phaseChangedCode(nameStatusEntries, EXCLUDE_PREFIX) -> boolean`, unit-testable without git. Note this repo's own phase 35 currently changes only `.planning` (+ will change `lib/ship.js`/`test/*` after execute), so phase 35's **own** ship will exercise the clean path once implemented. **BLOCKING** — resolved.

## Architectural Responsibility Map

| Capability | Tier | Where / evidence |
|---|---|---|
| Filter the diff pathset by the `.planning/phases/` exclusion (paths are inside/outside the subtree) | **Domain** | Pure function over `{status,path}` tuples + the shared `EXCLUDE` constant; mirrors the pure `planScope`/`globToRegex` style in `lib/gates.js:24-126`. |
| Decide fallback vs clean (any real-code change outside `.planning/phases/`) | **Domain** | Pure predicate over the filtered pathset (D-07). |
| Compute the squash-commit message for the clean branch | **Domain** | Pure template `phase <NN>: <name>` (Discretion; recommended). |
| Read `workflow.clean_pr_branch` from config and apply the `no_clean_pr` param override | **Domain** | Pure resolution `clean = param ? false : cfg?.workflow?.clean_pr_branch !== false` over the already-read `cfg` (read via `gsdState.readConfig`, data tier). |
| Git orchestration: fetch base, merge-base, switch to clean branch, checkout filtered tree, `git rm` deletions, single squash commit, push | **Integration** | Reuses ship.js's `git()`/`gh()` helpers (`lib/ship.js:28-36`); best placed in a new `lib/_clean-branch.js` (or extended `_git-artifacts.js`) with injectable `gitFn` like `ensurePhaseBranch` (`lib/_git-artifacts.js:64`). |
| PR creation from the clean branch (or phase-`<N>` on fallback) | **Integration** | ship.js step 8; retarget `--base`/branch args only. |
| Body assembly (Summary/Changes/Requirements/Verification/Decisions) | **Integration** | Unchanged (specifics). |
| `phase-<N>` remains full source of truth; completion state commit/push | **Integration** | ship.js step 10 unchanged, targets phase-`<N>` and (per OQ-2) never the clean branch. |

**Security note (BLOCKER rule):** the exclusion predicate and the squash construction are **integrity/merge-layer**, not security-sensitive — no credential handling, no path traversal risk beyond what the existing gates scan. Nothing security-sensitive lands in a lower tier. The one correctness-sensitive capability (filtering the diff so reviewers see only real code) is correctly a **Domain** pure function, keeping it unit-testable and free of I/O.

## Validation Architecture
Follow the suite's established seams (`node --test`, pure/static, scripted fake `gitFn`). Proposed (Claude's Discretion covers the exact spread):

1. **Pure unit — filter predicate** (in `test/pr-branch.test.mjs`, style of `test/_git-artifacts.test.mjs`): given a name-status set, `:(exclude)`-style membership drops every path under `.planning/phases/`, keeps durable `.planning/STATE.md`/`.planning/REQUIREMENTS.md`/`.planning/ROADMAP.md`/`.planning/codebase/**` and real code paths; honours D/R statuses; the D-07 predicate returns `false` for an all-`.planning/phases/` set and `true` when any durable/code path is present.
2. **Pure unit — config resolution**: `no_clean_pr=true` overrides config; `config.clean_pr_branch === false` disables; absent key **defaults ON**; `true` enables.
3. **Pure unit — squash message** template.
4. **Real-git integration** (strongest GAP-01 proof, optional): script a temp repo with `origin`-like refs, a phase-`<N>` tip whose tree mixes a code file (M), a durable `.planning/STATE.md` change, and `.planning/phases/<N>/…-SUMMARY.md` (A); run the builder; assert the clean branch `phase-<N>-clean` exists off `origin/<base>`, contains the code + durable change in **one commit**, and has no `.planning/phases/` entry; assert D-07 fallback for an all-`.planning/phases/` phase. (Confirm temp-repo fixtures are permitted — the suite currently fakes git to stay hermetically pure, so prefer a scripted-`gitFn` unit over a real temp repo unless the team accepts a real-git fixture as in other repos.)
5. **Static wiring gate** (style of `test/gates-ship.test.mjs:123-145`): assert in `lib/ship.js` source that `(exclude).planning/phases` appears, that the clean-branch construction is sequenced **after** the gate section and **before** the PR create, and that the fallback/phase-`<N>` path is retained.

These map directly to GAP-01's falsifiable outcome — "the PR diff contains no `.planning/phases/` path" is asserted by 1 and 4; "durable files still present" by 1 and 4; "one phase = one squash commit on a `phase-<N>-clean` branch" by 4; "D-07 still ships doc-only phases" by 4.

## Project Constraints
- `npm test` = `node --test test/*.test.mjs` must pass on a clean checkout (MOUNT-06) — all new tests must follow the pure/static/scripted-`gitFn` seams so they run hermetically without network/git.
- No new runtime dependencies (D-10) — reuse `node:child_process`/`node:fs/promises` + existing `git`/`gh`.
- `gsd_ship` requires a **clean working tree** at entry (step 2 fails otherwise, `lib/ship.js:89`) — the clean-branch builder must operate on this clean tree and leave the phase-`<N>` working state intact.
- Verification/gate logic is unchanged and stays on the phase-`<N>` tree (D-08); the clean branch is created only after the capability gates and the pre-ship-verify gate pass.
- Config resolution must degrade safely (missing/corrupt `config.json` → defaults, never throw), per the `readConfig` contract (`lib/state.js:376-380`).
- Single-source-constants discipline (CQ-02): the `:(exclude).planning/phases/` pathspec and the `phase-<N>-clean` name must live in one shared place, not be inlined per call.
- PR body assembly is unchanged (specifics); only the **branch** the PR is created from changes.
- The milestone is `upstream-parity` (v3.0.0); this phase is one of the GAP-* parity phases and ships inside the existing phase loop with one phase = one PR.
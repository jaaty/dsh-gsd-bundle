I have a complete picture of the codebase and the decisions. I've read every canonical-reference file, the shared git seam, the three out-of-flow writers, the gate-scoping path, and the existing test patterns. Here is the RESEARCH.md.

---

# Phase 20: multi-window-topology — Research

**Researcher:** gsd-phase-researcher
**Serves:** planning phase `GSD-20-multi-window-topology`
**Requirements:** MW-01, MW-02, MW-03

---

## Domain analysis

### Merge topology (MW-01 / D-01, D-02, D-03)
The requested topology is **parallel GitHub-flow**: every `phase-<N>` branch forks from the repository **default branch** and merges back independently via its **own PR** to that default. No phase branches off another phase's unmerged branch (chain topology is out of scope). This is the standard branch/merge model and requires **no rebasing, no integration branch, and no merge-conflict choreography** — each phase's PR is independent and merges straight into `main`.

Confidence: **high** — this is the current model already (CQ-07 established independent `phase-<N>` branches acquired at `gsd_discuss`).

- Default-branch derivation already exists in two places, both `origin/HEAD → origin/main → "main"` fallback:
  - `lib/_git-artifacts.js:53-60` (`ensurePhaseBranch`, via `git symbolic-ref refs/remotes/origin/HEAD --short`, `.replace(/^origin\//, "")` then `|| "main"`). [VERIFIED: read lib/_git-artifacts.js:53-60]
  - `lib/ship.js:87` (`gsd_ship` uses `args.base || symbolic-ref … || "main"`). [VERIFIED: read lib/ship.js:87]
  - D-02 is satisfied by reusing this existing derivation for acquire; no new base logic.
- The gates' per-phase file scoping stays valid under the parallel topology **with no changes**: `fetchGitData` derives the phase's changed files as `git diff --name-only --diff-filter=ACM <merge-base(HEAD, defaultBranch)> HEAD` ([VERIFIED: read lib/gates.js:228-251 line 235-238]). Because each `phase-<N>` forks only from default (D-01) and is merged back independently, `merge-base(HEAD, default)` is exactly the fork point, so the diff is exactly that phase's files. Chain topology (which would break this merge-base assumption) is explicitly out of scope, so the scoping is safe to leave as-is. **No change required in gates.js or ship.js for topology.**

### Same-phase concurrency through join (D-03)
When `phase-<N>` already exists — locally (`refs/heads/phase-N`) or on the remote (tracking ref `refs/remotes/origin/phase-N`) — branch acquisition must **join** it (`git checkout phase-N` / `git checkout --track origin/phase-N`) instead of `git checkout -b phase-N` (which errors). This generalizes the existing D-01 "present" action (already-on-the-branch) to "exists elsewhere."

Two implementation strategies:
1. **Explicit existence probes (recommended):** `git show-ref --verify --quiet refs/heads/phase-N` and `git show-ref --verify --quiet refs/remotes/origin/phase-N`. Exit 0 = exists; the throws in the injectable `gitFn` naturally surface non-existence as a rejection you can distinguish by the probe you issued. Each is a fixed-args call via `-C cwd` (D-07). [CITED: `git-show-ref --verify --quiet` is git plumbing for testing ref existence; git docs `git-show-ref(1)`]
2. **Command-driven fallback:** `git checkout -b phase-N` first; on the "already exists" error fall back to `git checkout phase-N`, then `git checkout --track origin/phase-N`. Avoids explicit probes but relies on parsing checkout error text to distinguish "exists" from fatal errors.

Recommend strategy 1 for clarity and testability (the fake `gitFn` can script a `show-ref` response / rejection cleanly). See Open Questions OQ-1, OQ-2, OQ-3.

### Early phase-branch push (MW-02 / D-05, D-06, D-07, D-08)
Push `phase-<N>` **at branch-acquire** (start of `gsd_discuss`), earlier than ship, with `-u origin phase-N`. It is **best-effort**: swallow no-remote / network / non-fast-forward failures with a warning (mirroring `commitArtifacts` and `ship.js` `gitOk`), so offline or no-remote setups proceed. The authoritative push+PR still happens at `ship.js` (step 6, line 116). All new git calls use **fixed argument arrays with `-C cwd`** (D-07), mirroring `ship.js` (`gitOk`, lines 29-31) and `_git-artifacts.js`.

- At acquire the just-created `phase-<N>` still points at HEAD's last commit (before the phase's CONTEXT write), so the remote branch is momentarily "empty" of the phase's artefacts until the first `commitArtifacts` in `gsd_discuss` (`discuss.js:147`). This is acceptable — the goal (MW-02) is remote **visibility** during the phase, not artifact completeness. [VERIFIED: read lib/discuss.js:147 and lib/_git-artifacts.js:87-113]

### Out-of-flow auto-commit (MW-03 / D-09..D-12)
Route the three out-of-flow artefact writers through the shared `commitArtifacts` seam so their files land on the **currently checked-out branch** (phase-N during a phase). `commitArtifacts` already: stages `.planning` **wholesale**, best-effort (no-throw), and commits to whatever branch is checked out (`git add .planning` + `git commit`). [VERIFIED: read lib/_git-artifacts.js:87-113] Because it is branch-agnostic it satisfies D-09 verbatim; each out-of-flow artefact lives under `.planning/`, so wholesale staging captures it.

Current gaps (the writers that don't yet commit): [VERIFIED]
- `lib/ui.js` writes UI-SPEC via `writeArtifact` but **never commits** (D-10) — the one writer needing a new `commitArtifacts` call. `ui.js` has a real phase (`args.phase`, `phase.name`), so it can call `commitArtifacts(cwd, args.phase, { scope: "ui", phaseName: phase.name })` — the existing "per-type scope token" message shape `docs(planning): phase <N> <slug> ui artefacts` already fits (D-12). [VERIFIED: read lib/ui.js:58]
- `lib/map-codebase.js` has a bespoke `gitAddCommit` with the fixed message `docs: map existing codebase` (`map-codebase.js:81-89`, return text `map-codebase.js:359`). Re-route it onto `commitArtifacts` (D-11); needs a message override because map has **no phase**.
- `lib/quick.js` writes the `.planning/quick/<date>-<slug>/TASK.md` record via `writeQuickRecord` but does **not** commit it (D-11); the QUICK_PROMPT commits only the quick task's own code change. Re-route the record commit onto `commitArtifacts`; needs a message override because quick has **no phase** and may run in a non-repo/project-less workspace (`commitArtifacts` already no-throws there).

**Signature impact (D-12):** `commitArtifacts(cwd, phaseNum, { scope, phaseName }, gitFn)` uses `phaseNum` only to build the message (`_git-artifacts.js:88`). For out-of-flow writers pass `null` for `phaseNum` plus an optional `message` override. Keep the phase-tools call sites byte-identical so the existing structural tests (`phase-tools-git.test.mjs`, `discuss-artifacts.test.mjs`) stay green. [VERIFIED: read lib/_git-artifacts.js:87-88; read test/phase-tools-git.test.mjs:39-70]

**Why this matters (the latent failure it fixes):** `gsd_ship` step 2 fails preflight on a dirty tree (`git status --short` non-empty → `fail`, `ship.js:82-83`). Today running `gsd_quick` / `gsd_map_codebase` / `gsd_ui_phase` during a phase leaves `.planning/…` uncommitted, which would block ship. MW-03/D-09..D-12 closes exactly this hole. [VERIFIED: read lib/ship.js:82-83]

---

## Package legitimacy

**No new runtime or peer dependencies are required for this phase.** All work is done with the `git` CLI via fixed argument arrays through the existing injectable `gitFn(cwd, argsArray)` seam and the `node:child_process` builtins already in use (`promisify(execFile)`/`execFileSync`), plus the gsdState service. Nothing new is added to `package.json` `dependencies`/`peerDependencies` (currently empty of third-party deps besides the DSH peers; [VERIFIED: read package.json]). There is therefore no external package to legitimise. The only "new" invocation surface is additional `git` subcommands (`show-ref`, `checkout --track`, `push -u`), all provided by the standard git binary that is already a hard requirement of ship.js/map-codebase.js.

---

## Risks

1. **Shared-working-tree contention on different phases (operational, not code-fixable).** If two *different-phase* windows share one physical checkout, one window's `git checkout phase-A` switches the branch under the other. The topology (D-01/D-02) is about a **shared base/remote**, not a shared working tree. Recommend the planner/README note that each concurrent phase runs in its **own clone or worktree**; same-phase windows converge on one branch (D-03) and may share a tree. Not solvable in this package's code — flag in docs.
2. **Existing unit tests must change for the new push/probe behaviour.** Two concrete breakages with the current fake-git harness in `test/_git-artifacts.test.mjs`:
   - `scriptedGit` keys canned responses **only by `argv[0]`** ([VERIFIED: read test/_git-artifacts.test.mjs:13-25]). Two different `rev-parse`/`show-ref` probes with different refs would collide; the harness needs either per-args keying or separate first-argv keys (e.g. use `show-ref` for probes, which doesn't collide with the existing `rev-parse` current-branch check).
   - Two tests assert `git.calls.at(-1)` deep-equals `["checkout","-b","phase-7"]` ([VERIFIED: test/_git-artifacts.test.mjs:49 and :60]). Once a best-effort `push` follows acquire, `calls.at(-1)` becomes the push; change these to assert the checkout call is **present** (via `hasCall`) rather than last.
3. **Early push pushes a pre-artefact HEAD.** As above, acceptable for MW-02 visibility but the remote `phase-<N>` briefly carries only the parent commit. Document so it isn't mistaken for a lost-write.
4. **Non-fast-forward early push on join/acquire** when the remote `phase-<N>` diverged — must be swallowed with a warning per D-06 (do not treat as a structural failure). Only genuine structural violations (D-08: creating a **new** phase from a non-base, non-phase branch) fail loud.
5. **map-codebase return text.** Re-routing the commit changes the commit message from `docs: map existing codebase` to the seam's shape; update the user-facing note at `map-codebase.js:359` and the summary so it doesn't claim the old message.

---

## Open Questions

- **OQ-1 (RESOLVED): Which probe/command determines "phase-N exists (local/remote)" for join?**
  → Use explicit `git show-ref --verify --quiet` probes: `refs/heads/phase-N` (local) then `refs/remotes/origin/phase-N` (tracking). Non-existence surfaces as a rejection of that specific probe in the injectable `gitFn` (strategy 1 above). Fixed-args, `-C cwd` (D-07). Not blocked.

- **OQ-2 (RESOLVED): When phase-N exists, what if the working tree is on an unrelated non-base branch (`foo`)?**
  → Joining an existing phase does **not** fork off a base, so join takes precedence over the current base-branch guard: if phase-N exists (local/remote), `git checkout` it regardless of current branch. The existing "fail-loud on non-base, non-phase branch" throw applies only to the **new-phase creation** path (D-08: "for a NEW phase"). This keeps the fork-off-the-wrong-base protection while enabling convergence. Not blocked.

- **OQ-3 (RESOLVED): A phase-N exists on the remote but has no local tracking ref (never fetched here). How to join?**
  → Restrict remote-join to an already-fetched `refs/remotes/origin/phase-N` probe (no network at acquire). If the tracking ref is absent, do a **best-effort** `git fetch origin phase-N --no-tags` then re-probe/`git checkout --track origin/phase-N`; if any of that fails, fall back to the create path. Keep the whole remote-join branch best-effort (D-06). Planner must fix the exact fallback order. Not blocked.

- **OQ-4 (RESOLVED): How does the shared seam support out-of-flow writers that have no phase?**
  → Extend `commitArtifacts(cwd, phaseNum, { scope, phaseName, message }, gitFn)` so `phaseNum` may be `null` and an optional `message` overrides the generated `docs(planning): phase <N> …` message. `phaseNum` is only used to build the default message ([VERIFIED: _git-artifacts.js:88]), so null+override is non-breaking. Phase tools keep their existing literal call sites and messages (D-12). Not blocked.

- **OQ-5 (RESOLVED): When does the early push fire?**
  → Best-effort `git push -u origin phase-N` on every non-noop acquire path (`present` / `joined` / `created`); it is idempotent on `present` and harmless on `joined`. Swallow all failures with a warning on the returned result (D-05/D-06). Existing tests must stop expecting checkout to be the last recorded call. Not blocked.

- **OQ-6 (RESOLVED): Does `ship.js` change?**
  → No functional change. Under the parallel topology its default-branch derivation, branch preflight, authoritative push, and PR create (D-02, D-05) already work; gates' merge-base scoping is preserved (verified above). Ship step 2's clean-tree gate is what MW-03's auto-commit fixes. Not blocked.

---

## Architectural Responsibility Map (capability → tier)

All new capabilities in this phase are **integration-tier** (git I/O) or **domain-tier** (pure formatting/validation). Nothing lands in the wrong tier; no security-sensitive capability is misplaced.

| Capability | Tier | Owner |
|---|---|---|
| Branch acquisition: create / join-local / join-remote `phase-<N>` | integration (git I/O) | `lib/_git-artifacts.js` `ensurePhaseBranch` |
| Early best-effort push `-u origin phase-N` at acquire | integration (git I/O) | same function |
| Branch-existence probing (`show-ref`) & base derivation | integration + domain validation | same function + `lib/_shared.js` `isValidRef`/`SAFE_REF_RE` ([VERIFIED: _shared.js:370-374]) |
| Out-of-flow auto-commit (UI-SPEC / codebase-map / quick) | integration (git I/O) | `commitArtifacts` shared seam (`_git-artifacts.js`), call sites in ui.js / map-codebase.js / quick.js |
| Commit message building (incl. `message` override) | domain (pure) | `commitArtifacts` message branch |
| Gate per-phase merge-base scoping | integration (`fetchGitData`) + domain (pure runCapabilityGates) | `lib/gates.js` — unchanged |
| Artefact writes + STATE bookkeeping | data | gsdState service (`writeArtifact`, `writeQuickRecord`, `addDecision`, `setActivePhase`) — unchanged |

**Security note (D-07):** every new git call uses a fixed argument array with `-C cwd`; the branch/base/ref values are validated via `isValidRef` and never interpolated into a shell string — mirroring `ship.js` and `_git-artifacts.js`. [VERIFIED: read lib/_git-artifacts.js:14-16, lib/ship.js:29-31]

---

## Validation Architecture

Automated checks that prove MW-01/MW-02/MW-03, mirroring the existing fake-`gitFn` and static-wiring test styles:

1. **Join semantics** (unit, `test/_git-artifacts.test.mjs`, fake gitFn): local-exists → `git checkout phase-N`, action `joined`; remote-tracking-exists → `git checkout --track origin/phase-N`, action `joined`; already-on → `present`, no checkout; from main with no phase-N → `checkout -b`, action `created`, defaultBranch `main`; no-git repo → `noop` + warning, no throw; **new phase from an unrelated non-base branch → throws** (D-08); **existing phase from an unrelated branch → joins, does not throw** (OQ-2).
2. **Early push (MW-02):** with a scripted `push` success, assert `push -u origin phase-N` is issued and the result reports push status; with `rejectArg:"push"` (or no scripted push → unexpected-call throw), assert the acquire **still succeeds** with a push warning and no throw (D-06 best-effort).
3. **commitArtifacts message override + null phaseNum (D-12):** `commitArtifacts(cwd, null, { message: "docs(planning): codebase map" })` commits with the override message and no phase interpolation; default phase-tool message unchanged.
4. **Static wiring (extend `phase-tools-git.test.mjs`-style):** assert `ui.js`, `map-codebase.js`, `quick.js` route their out-of-flow write through `commitArtifacts` (import + exactly-one call, and for `ui.js` the call appears after `writeArtifact`). For `map-codebase.js`, assert the bespoke `gitAddCommit` commit is gone.
5. **Backward-compat guard:** the existing `commitArtifacts` discussion/plan/execute/verify call-site regexes in `phase-tools-git.test.mjs:42` and `discuss-artifacts.test.mjs` still match exactly one each (unchanged phase-tool calls).
6. **Regression:** `npm test` (`node --test test/*.test.mjs`) passes on a clean checkout (MOUNT-06). Gates tests untouched (merge-base scoping preserved).

---

## Project Constraints (from project conventions)

- All git invocations are **async** through the injectable `gitFn(cwd, argsArray)` seam (`_git-artifacts.js`, `ship.js git/gitOk`) — never `execFileSync` for phase-loop commits; fixed arg arrays, `-C cwd`, no shell strings (D-07, CQ-05). [VERIFIED]
- Best-effort-with-warning for commit/push; **only genuine structural violations fail loud** (D-08). [VERIFIED: _git-artifacts.js:36-77 throws only on non-base non-phase for new phase]
- Every artefact write routes through the **gsdState artefact model** (`ctx.fs`) — never raw fs (`writeArtifact`, `writeQuickRecord`, `writeCodebaseManifest`; DUR-06). [VERIFIED: lib/state.js:470-517]
- Shared constants/helpers live in one place (`isValidRef`/`SAFE_REF_RE` in `_shared.js`); no string-parsing of structured fields (CQ-02/CQ-03). Reuse existing seams over new machinery (D-12). [VERIFIED: read lib/_shared.js:370-374]
- One commit per completed task; conventional commits (`docs(planning): …`). [VERIFIED: _git-artifacts.js:88, map-codebase.js:86]

---

**Read-before-planning gates (from canonical_refs, all read this session):**
`lib/_git-artifacts.js` (ensurePhaseBranch + commitArtifacts — the seam to extend), `lib/ship.js` (defaultBranch deriv + authoritative push/PR + clean-tree gate), `lib/gates.js` `fetchGitData` (merge-base scoping, preserved), `lib/ui.js` / `lib/map-codebase.js` / `lib/quick.js` (the three out-of-flow writers), `lib/_shared.js` `isValidRef`, and `test/_git-artifacts.test.mjs` / `test/phase-tools-git.test.mjs` (test patterns that must be mirrored and updated).
# Phase 20: multi-window-topology - Context

**Gathered:** 2026-08-28T21:19:45.644Z
**Status:** Ready for planning

<domain>
## Phase Boundary
**In scope:** Support concurrent multi-window phases sharing the repository default base branch, each on its own phase-N feature branch forked from that base and merged back independently via its own PR; push phase-N at branch-acquire (earlier than ship, best-effort); and auto-commit out-of-flow artefacts (UI-SPEC / codebase-map / quick) onto the currently checked-out branch via the shared commitArtifacts seam.
**Out of scope:** Chained/stacked phase topology (a phase branching off another phase's unmerged branch); a distinct named integration branch separate from the repository default; merge-conflict resolution choreography or auto-rebasing between concurrent phase branches; changing the existing capability-gate file-scoping semantics beyond what the parallel topology already preserves.
</domain>

<decisions>
## Decisions
### Merge topology (MW-01)
- **D-01:** Concurrent multi-window phases use a PARALLEL topology: each phase-N branch forks from the shared base and merges back independently via its own PR to that base. No phase forks off another phase's unmerged branch.
- **D-02:** The shared base branch IS the repository default — reuse the existing defaultBranch derivation (origin/HEAD -> main, with 'main' fallback) used by ensurePhaseBranch and ship.js. No new integration branch.
- **D-03:** Same-phase concurrency: when phase-N already exists (locally or on the remote), branch acquisition JOINS it (checks out the existing branch) rather than 'checkout -b' which would fail. This generalizes the existing D-01 'present' behavior in ensurePhaseBranch to cover 'exists elsewhere'. Windows on the same phase converge on one branch.
### Early phase-branch push (MW-02)
- **D-05:** Push phase-N at branch-acquire (start of gsd_discuss), earlier than ship, with '-u origin phase-N' for upstream tracking.
- **D-06:** The MW-02 push is BEST-EFFORT: swallow no-remote / network / non-fast-forward failures with a warning (mirroring commitArtifacts), so offline or no-remote setups can still proceed. The authoritative push/PR still happens at ship.js.
- **D-07:** SECURITY: all new git calls (early push, join-checkout, out-of-flow auto-commit) use FIXED argument arrays with '-C cwd' and are never built from shell strings or model-supplied interpolation — mirroring ship.js and _git-artifacts.js.
- **D-08:** Error-handling consistency: commit and push stay best-effort-with-warning (mirroring commitArtifacts and ship.js gitOk). Only genuine structural violations fail loud (e.g. on a non-base, non-phase branch for a NEW phase).
### Out-of-flow auto-commit (MW-03)
- **D-09:** Route all three out-of-flow artefact writers (UI-SPEC, codebase-map, quick) through the shared commitArtifacts seam, committing to the CURRENTLY CHECKED-OUT branch — which is phase-N during a phase, or whatever branch is active otherwise.
- **D-10:** Unify UI-SPEC (written by ui.js but currently never committed) into commitArtifacts so it lands on the branch with a consistent message.
- **D-11:** Re-route codebase-map from its bespoke fixed-message 'docs: map existing codebase' gitAddCommit to the shared seam, and quick-task from its bespoke subagent commit to the shared seam, so all out-of-flow writes share one message convention and one commit path.
- **D-12:** Reuse commitArtifacts as-is for the auto-commit (it already stages '.planning' wholesale and best-effort commits), extending only the call sites in ui.js / quick.js / map-codebase.js; keep the existing per-type message scope token if commitArtifacts' message shape already fits, otherwise allow a small message override.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Branch acquisition + artefact commit seam
- `lib/_git-artifacts.js — ensurePhaseBranch (acquire/join phase-N) and commitArtifacts (best-effort .planning wholesale commit) are the seam to extend`
### Ship branch + gate file-scoping
- `lib/ship.js — defaultBranch derivation, branch preflight, push at ship, PR create; gates merge-base scoping must stay valid under the parallel topology`
- `lib/gates.js fetchGitData — merge-base HEAD..base diff that scopes gate checks per phase`
### Out-of-flow artefact writers
- `lib/ui.js — writes UI-SPEC via writeArtifact, currently never committed`
- `lib/map-codebase.js gitAddCommit — bespoke fixed-message commit of .planning/codebase`
- `lib/quick.js — writeQuickRecord path, bespoke subagent commit`
### Ref/safety helpers + tests
- `lib/_shared.js isValidRef — for validating any new branch/base ref`
- `test/*.test.mjs — existing unit-test patterns for git seam (fake gitFn) must be mirrored for new behavior`
</canonical_refs>

<code_context>
## Code Context
- lib/_git-artifacts.js exports ensurePhaseBranch and commitArtifacts — the single reusable git seam for the phase loop; both take an injectable gitFn(cwd, argsArray) for unit testing. ensurePhaseBranch currently forks only from the default branch and fails loud on any other non-base branch; extend it to (a) join an existing phase-N and (b) push best-effort at acquire.
- commitArtifacts already stages '.planning' wholesale and best-effort commits with the shared message shape; reuse it verbatim for out-of-flow auto-commit (D-09..D-12).
- ship.js already derives defaultBranch (origin/HEAD -> main) and pushes + creates the PR at ship time; the parallel topology keeps that intact and the gates' merge-base file scoping per-phase valid.
- ui.js writes UI-SPEC via writeArtifact but never commits — the one out-of-flow writer that needs a new commitArtifacts call.
- map-codebase.js and quick.js each have a bespoke commit path that D-11 re-routes onto the shared seam; their current gitAddCommit/subagent-commit message shapes should be reconciled with commitArtifacts.
- Existing tests exercise ensurePhaseBranch/commitArtifacts with a fake gitFn — new join/push/auto-commit behavior needs the same style of unit tests.
- lib/_shared.js isValidRef can validate any new base/ref args.
</code_context>

<specifics>
## Specifics
- Merge topology: each phase-N forks from the repository default and merges back independently via its own PR (D-01); the ship gate's per-phase merge-base file scoping must remain valid — chain topology is out of scope.
- Shared base = repository default (origin/HEAD -> main), reusing existing defaultBranch logic (D-02).
- Same-phase concurrency: join an existing phase-N (checkout) rather than failing checkout -b (D-03).
- Early push at branch-acquire is best-effort with '-u origin phase-N' and swallows no-remote/network failures (D-05/D-06).
- UI-SPEC / codebase-map / quick auto-commit via commitArtifacts to the currently checked-out branch (D-09..D-12).
</specifics>

<deferred>
## Deferred Ideas
- Chained/stacked phase topology (a phase branching off another phase's unmerged branch) — deferred; parallel is the v1 topology.
- A dedicated named integration branch (non-default, e.g. develop) as the shared base — deferred; repository default is used.
- Automatic rebasing or merge-conflict resolution between concurrent phase branches — out of phase 20 scope.
</deferred>


---

*Phase: 20-multi-window-topology*
*Context gathered: 2026-08-28*
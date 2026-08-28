# Phase 20: multi-window-topology — Discussion Log

# Phase 20: multi-window-topology — Discussion

Interviewed the human on the five grey areas in the phase scope. All five received the recommended answer.

G1 — Merge topology (MW-01): chosen PARALLEL — each phase-N forks from a shared base and merges back independently via its own PR, preserving the ship gate's per-phase merge-base file scoping (no chaining that would pull earlier phases into a later phase's diff).

G2 — Shared base identity: the repository default (origin/HEAD -> main), reusing the existing defaultBranch derivation in _git-artifacts.js and ship.js. No new integration branch.

G3 — Same-phase branch collision: when phase-N already exists (locally or remote), branch acquisition JOINS it (checks out) instead of checkout -b (which would fail). Generalizes the existing 'present' behavior for convergence on one branch.

G4 — MW-02 early-push failure semantics: BEST-EFFORT, '-u origin phase-N' at acquire, swallow no-remote/network/non-fast-forward with a warning (mirror commitArtifacts). Authoritative push/PR still at ship.

G5 — MW-03 out-of-flow target + unification: route UI-SPEC / codebase-map / quick through the shared commitArtifacts seam to the currently checked-out branch (phase-N during a phase). Unify UI-SPEC (currently uncommitted) and re-route the two bespoke commit paths.

Security: all new git calls use fixed argument arrays with -C cwd; no model-supplied shell interpolation. Consistency: commit/push stay best-effort-with-warning; only structural violations fail loud.

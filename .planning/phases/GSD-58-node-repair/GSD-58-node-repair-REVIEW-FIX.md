---
phase: 58
fixed: "2026-09-08"
source: GSD-58-node-repair-REVIEW.md
mode: manual (gsd_code_review --fix unavailable; fixes applied by the orchestrator per the human's instruction)
findings_total: 12
fixed: 12
deferred: 0
commits: 10
---

# Phase 58: node-repair — REVIEW-FIX

Every finding from REVIEW.md applied with atomic per-fix commits on `phase-58`.
Full suite after all fixes: **1073 pass / 0 fail** (baseline 1071 + 2 new
regression tests added with CR-06/CR-07).

## Fixes

| Finding | Sev | Status | Commit | What changed |
|---|---|---|---|---|
| CR-01 | BLOCKER | ✅ fixed | `ba8dc70` | `package.json` files glob gains `"lib/*.mjs"`; verified `npm pack` now lists `lib/job-wrapper.mjs` (4.3kB) so `gsd_job` shell launches work in npm-installed copies. |
| CR-02 | WARNING | ✅ fixed | `c397d46` | `lib/repair.js`: marker extraction moved BEFORE the CHECKPOINT loop; the checkpoint stop cause now appends the verbatim `GSD_AWAITING_HUMAN` line, so the real awaiting flow (which always has a persisted CHECKPOINT artefact) carries the full `decision_id` the resumer must echo back. |
| CR-03 | WARNING | ✅ fixed | `c397d46` | New `findToolIn(tools, name)` dual-shape helper in `lib/_shared.js` (leaf module — cycle-safe); used by `runMempalaceCaptureOnVerify` (lib/verify.js) and the sibling array-only hooks in lib/plan.js (×2), lib/discuss.js (×2), lib/ship.js (×3, incl. learnings/graphify); `lib/repair.js`'s local `findTool` retired in favour of the shared helper. Capture hooks now fire in the service-shaped production runtime. |
| CR-04 | WARNING | ✅ fixed | `fb89551` | `lib/repair.js` budget loop wrapped in try/catch: on a delegate throw the round's `## Stop` section is recorded and REPAIR.md + the scope-repair commit land through the same epilogue, then the original error rethrows (fail-loud preserved; autonomous's repair-fault branch unaffected). |
| CR-05 | WARNING | ✅ fixed | `7fd31f9` | `BUDGET_EXHAUSTED_PHRASE` exported from `lib/repair.js`, used by the exhaustion cause template AND imported into `lib/autonomous.js`'s classifier — the string contract is now a shared symbol; wording drift can no longer reclassify an early stop as budget exhaustion. Phrase text unchanged (regex tests still hold). |
| CR-06 | WARNING | ✅ fixed | `03110d0` | `test/helpers/mount-harness.mjs`: token regex `/gsd_[a-z]+/` → `/gsd_[a-z_]+/` so underscore tool names match whole; new regression test in test/mount.test.mjs proves an absent `gsd_quick_batch` is flagged even when `gsd_quick`'s capability is present. |
| CR-07 | WARNING | ✅ fixed | `ab204d1` | `lib/verify.js`: a verifier run that wrote no readable VERIFICATION.md now routes as the distinct `missing-report` outcome (`⚠ … nothing was verified, so there is nothing to repair. Re-run gsd_verify`) instead of phantom `gaps_found` + repair recommendation; STATE stays on verify. Test-driven via a new `VERIFY_SILENT_MODE` harness flag. |
| CR-08 | INFO | ✅ fixed | `86927b4` | `ROUNDS_DOMAIN_MSG` now derives from `REPAIR_ROUND_BUDGET` (template literal) — raising the budget can't leave a stale upper bound in the domain message. |
| CR-09 | INFO | ✅ fixed | `86927b4` | `roundSection` builds the "delegated as" clause from the round's ran flags — a round that stopped at plan no longer logs execute/verify signatures it never reached. Full-round output byte-identical (regex-asserted tests unaffected). |
| CR-10 | INFO | ✅ fixed | `bab55f8` | README Install section documents `@deepseek-ai/schemastery` and `@deepseek-ai/cordis` as intentional host-contract peers (never imported; supplied via injected ctx). Declared entries left in place (safer than dropping, given the deliberate 2026-09-05 peer-range widening). |
| CR-11 | INFO | ✅ fixed | `cc71106` | `test/_capabilities.test.mjs` header now references `CAPABILITY_KEYS` (currently 28) instead of the stale "11-key" prose. |
| CR-12 | INFO | ✅ fixed | `fae7681` | `lib/autonomous.js`: `drivePhase` no longer re-runs `ensureAutoContext`; `runAutonomous`'s pre-step call is the single caller-owned acquisition point (comment updated to record the ownership). |

## Notes

- CR-02 and CR-03 share commit `c397d46`: both hunks live in `runOneRound`'s
  stop-cause/delegation region of `lib/repair.js` and were applied together to
  keep that hunk atomic; CR-08+CR-09 similarly share `86927b4` (both are
  `lib/repair.js` report-string cleanups). All other fixes are one-commit-per-finding.
- Verification evidence: CR-01 proven with `npm pack --dry-run --cache .npm-cache`
  (the repo's ignored alternate cache; the default `~/.npm` log dir is
  sandbox-denied). Full `npm test` green after every commit.
- Follow-up: the `gsd_code_review` `fix:true` companion itself is currently
  broken in live sessions — tracked as the next phase
  (`.planning/REQUIREMENTS.md` CLH-09 / ROADMAP phase 59, added in this turn).
# Phase 51: drop-clean-branch - Context

**Gathered:** 2026-09-01T05:36:16.417Z
**Status:** Ready for planning

<domain>
## Phase Boundary
**In scope:** Remove the clean-PR branch feature (GAP-01, phase 35) so gsd_ship pushes and PRs the phase-NN branch directly, leaving one branch per phase. The change is a removal confined to lib/ship.js (drop the clean-branch build/push/cherry-pick and the no_clean_pr param), lib/_clean-branch.js (removed after relocating its shared parseNameStatusZ), lib/state.js (drop workflow.clean_pr_branch from _defaultConfig), lib/health.js (stop treating clean_pr_branch as a required config key), and the affected test suites. No new capability, no new runtime dependencies, no UI component.
**Out of scope:** No change to the phase-branch acquisition at gsd_discuss (phase 17) — the phase-NN working branch is still created and used. No change to the squash-merge behaviour on GitHub (the user squash-merges PRs, which already produces one clean commit on main). No change to undo.js behaviour beyond relocating its shared parseNameStatusZ import. No new feature; this is a pure removal.
</domain>

<decisions>
## Decisions
### Integration structure
- **D-01:** This is a removal, not a new plugin: no new capability, no new tool, no new command. The change is confined to lib/ship.js, lib/_clean-branch.js (removed), lib/state.js, lib/health.js, and the affected test suites. gsdShip capability and the gsd_ship tool remain unchanged in name/signature except for the removed no_clean_pr param (D-04).
- **D-02:** gsd_ship always PRs the phase-NN branch directly. Remove step 5.7 (buildCleanBranch construction), the clean-branch push (step 6), and the completion-state cherry-pick onto the clean branch (step 10). The PR head is the current phase-NN branch; the --head arg is dropped (gh pr create defaults to the current branch as head). The completion-state commit lands on phase-NN and is pushed there only — no cherry-pick.
### Shared-module relocation
- **D-03:** parseNameStatusZ is shared by lib/undo.js (and test/undo.test.mjs), so it cannot be deleted with _clean-branch.js. Relocate parseNameStatusZ to lib/_shared.js (the existing shared module), update lib/undo.js and test/undo.test.mjs to import it from there, then delete lib/_clean-branch.js entirely. No behaviour change to parseNameStatusZ — pure relocation.
### Config and schema removal
- **D-04:** Remove the no_clean_pr boolean param from gsd_ship's defineTool schema and remove workflow.clean_pr_branch from _defaultConfig in lib/state.js. Update lib/health.js so its config repair (R-02) no longer treats clean_pr_branch as a required workflow key. Existing configs that still carry clean_pr_branch: true are harmless — readConfig returns defaults and the key is simply ignored; no migration needed.
### Test cleanup
- **D-05:** Remove test/pr-branch.test.mjs (the clean-branch core tests) and test/cleanpr-config.test.mjs (the config-key assertion). Update test/gates-ship.test.mjs to drop the no_clean_pr/resolveCleanPr/buildCleanBranch/--head prBranch assertions. Update test/health.test.mjs to drop the clean_pr_branch required-key + repair assertions. Update test/ship-async.test.mjs to drop the clean-branch propagation test. The full suite (npm test) must pass after the removal.
### Claude's Discretion
- **D-06:** Exact placement of parseNameStatusZ within lib/_shared.js (keep near the other parse helpers). Precise wording of any updated ship.js log lines (e.g. removing the 'clean-PR branch: on/off' line). Whether to keep a defensive guard in ship.js for a leftover remote phase-NN-clean branch (recommended: no — the user deletes stale branches manually; out of scope).
### Claude's Discretion
- Exact placement of parseNameStatusZ within lib/_shared.js.
- Precise wording of updated ship.js log lines after removing the clean-branch path.
- Whether to add any defensive cleanup of stale remote phase-NN-clean branches (recommended: no).
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Removal surface in ship.js and _clean-branch.js
- `lib/ship.js — the clean-branch touchpoints to remove: import (line 19), no_clean_pr param (line 120), resolveCleanPr call (line 165), step 5.7 build (lines 201-231), clean-branch push (lines 236-245), --head prBranch (line 300), completion-state cherry-pick (lines 330-349).`
- `lib/_clean-branch.js — the module to delete after relocating parseNameStatusZ (D-03).`
### Shared-module relocation of parseNameStatusZ
- `lib/_shared.js — the shared module where parseNameStatusZ is relocated (D-03); it already holds parseFrontmatter/stringifyFrontmatter/parseDecisionEntries.`
- `lib/undo.js — imports parseNameStatusZ from ./_clean-branch.js (line 35); update to import from ./_shared.js.`
- `test/undo.test.mjs — imports parseNameStatusZ from ../lib/_clean-branch.js (line 25); update to ../lib/_shared.js.`
### Config and health-repair removal
- `lib/state.js _defaultConfig (line 196) — remove clean_pr_branch: true.`
- `lib/health.js — the R-02 config repair that treats clean_pr_branch as a required workflow key; stop requiring it (D-04).`
- `test/health.test.mjs — assertions that clean_pr_branch is required + repaired (lines 55, 184, 376, 460-463, 487, 549); update.`
- `test/cleanpr-config.test.mjs — the config-key assertion; remove.`
### Test cleanup
- `test/gates-ship.test.mjs — the GSD-35 clean-PR wiring assertions (lines 224-269): no_clean_pr param, resolveCleanPr, buildCleanBranch, --head prBranch; update.`
- `test/ship-async.test.mjs — the clean-branch propagation test (lines 63-71); remove/update.`
- `test/pr-branch.test.mjs — the whole clean-branch core test file; remove.`
</canonical_refs>

<code_context>
## Code Context
- lib/ship.js imports { buildCleanBranch, resolveCleanPr, cleanBranchName } from ./_clean-branch.js (line 19); after removal only the shared parseNameStatusZ (via _shared.js) is needed by undo.js, not ship.js.
- lib/undo.js imports parseNameStatusZ from ./_clean-branch.js (line 35) and uses it for the undo name-status parse; relocating to _shared.js keeps undo working (D-03).
- lib/state.js _defaultConfig (line 196) has clean_pr_branch: true inside the workflow block; removing it is safe because readConfig returns defaults on a missing key.
- lib/health.js R-02 repair adds clean_pr_branch: true when the workflow block lacks it; after removal it must stop requiring this key.
- gh pr create defaults the head to the current branch, so dropping the --head prBranch arg (line 300) still PRs phase-NN correctly (D-02).
- The completion-state commit (step 10) currently lands on phase-NN then cherry-picks to the clean branch; after removal it lands on phase-NN and is pushed there only.
</code_context>

<specifics>
## Specifics
- User decision (Option C): drop the clean branch entirely; gsd_ship pushes and PRs the phase-NN branch directly.
- The user squash-merges PRs, which already produces one clean commit on main — the clean branch is redundant for the final history.
- SHIP-CLEAN-01: gsd_ship no longer builds or pushes a phase-NN-clean branch; the PR head is the phase-NN branch directly.
- SHIP-CLEAN-02: no_clean_pr param and workflow.clean_pr_branch config removed; health repair stops requiring the key.
- SHIP-CLEAN-03: parseNameStatusZ relocated to a shared module so lib/undo.js keeps working after _clean-branch.js is removed.
- SHIP-CLEAN-04: all clean-branch tests removed/updated and the full suite passes.
</specifics>

<deferred>
## Deferred Ideas
- Defensive cleanup of stale remote phase-NN-clean branches left by prior ships — out of scope; the user deletes them manually.
- Any change to the phase-branch acquisition at gsd_discuss (phase 17) — the phase-NN working branch is still created and used.
- Changing GitHub squash-merge behaviour — the user already squash-merges.
</deferred>


---

*Phase: 51-drop-clean-branch*
*Context gathered: 2026-09-01*
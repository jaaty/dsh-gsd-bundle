I have a complete picture. Here is the RESEARCH.md.

---

# Phase 51: drop-clean-branch — Research

**Phase goal:** Remove the clean-PR branch feature so `gsd_ship` pushes and PRs the phase-NN branch directly, leaving one branch per phase.
**Requirements:** SHIP-CLEAN-01, SHIP-CLEAN-04 (SHIP-CLEAN-02/03 are internal sub-goals from CONTEXT specifics).

This is a **pure removal** (D-01): no new capability, no new tool, no new runtime dependency, no UI. The research therefore focuses on (a) the exact removal surface, (b) the one shared-module relocation, and (c) the test-suite cleanup — plus one important finding about `lib/health.js` that changes the CONTEXT's stated scope.

---

## Domain analysis

### 1. The removal surface in `lib/ship.js` — [VERIFIED: read lib/ship.js this session]

The clean-branch feature threads through `gsd_ship` in six touchpoints. All must go together; leaving any one leaves a dangling reference or a dead branch.

| Touchpoint | Location | What to remove |
|---|---|---|
| Import | `lib/ship.js:19` | `import { buildCleanBranch, resolveCleanPr, cleanBranchName } from "./_clean-branch.js";` — note `cleanBranchName` is **already an unused import** in ship.js (only `buildCleanBranch`/`resolveCleanPr` are called); the whole line goes. |
| Param | `lib/ship.js:95` | `no_clean_pr: { type: "boolean", ... }` in the `defineTool` parameters (D-04). |
| Resolution + log | `lib/ship.js:140-141` | `const cleanPr = resolveCleanPr(cfg, args.no_clean_pr);` and `log.push(\`clean-PR branch: ${cleanPr ? "on" : "off"}\`);` |
| Step 5.7 build | `lib/ship.js:176-206` | The whole `// ── 5.7 clean-PR branch` block: `let prBranch = branch;` (186), `if (cleanPr) { ... buildCleanBranch ... }` (187-206). |
| Clean-branch push | `lib/ship.js:213-220` | `if (cleanPr && prBranch !== branch) { push prBranch }` — the phase-NN push at 209 stays. |
| `--head` arg | `lib/ship.js:275` | `if (prBranch) prArgs.push("--head", prBranch);` — **drop entirely**; `gh pr create` defaults the head to the current branch (D-02). |
| Completion-state cherry-pick | `lib/ship.js:311-324` | The `if (cleanPr && prBranch !== branch) { switch prBranch; cherry-pick; push; switch back }` block. The completion-state commit at 296-310 stays and is pushed to phase-NN only (line 303). |

**Key structural consequence:** the `prBranch` variable (declared 186, used 197/213/215/216/275/311/313/316/317) and the `cleanPr` variable (140, 187, 213, 311) are both fully removed. After removal, the PR is created with `["pr", "create", "--title", title, "--body-file", tmp, "--base", defaultBranch]` plus optional `--draft` — no `--head`. [VERIFIED: read lib/ship.js:176-330]

### 2. `lib/_clean-branch.js` — the module to delete, and its one survivor [VERIFIED: read lib/_clean-branch.js this session]

The module exports 10 symbols: `EXCLUDE_AFFIX`, `EXCLUDE_PATHSPEC`, `isExcludedPath`, `filterRealChanges`, `phaseChangedCode`, `cleanBranchName`, `squashMessage`, `resolveCleanPr`, `parseNameStatusZ`, `buildCleanBranch`. Consumers:

- `lib/ship.js:19` — `buildCleanBranch`, `resolveCleanPr`, `cleanBranchName` (all removed with the feature).
- `lib/undo.js:35` — `parseNameStatusZ` (**must survive**; D-03).
- `test/pr-branch.test.mjs:8-19` — all 10 (file removed).
- `test/undo.test.mjs:25` — `parseNameStatusZ` (import path updated).

Only `parseNameStatusZ` is needed after removal. It is a **pure, self-contained function** (no imports, no I/O — `lib/_clean-branch.js:86-108`), so relocating it to `lib/_shared.js` is a verbatim move with zero behavioural change. [VERIFIED: read lib/_clean-branch.js:86-108]

### 3. `lib/_shared.js` — the relocation target [VERIFIED: read lib/_shared.js this session]

`_shared.js` is the existing shared domain module (holds `parseFrontmatter`, `stringifyFrontmatter`, `parseDecisionEntries`, `zeroPad`, `slugify`, etc.). It imports nothing from `_clean-branch.js`, so there is no circular-import risk. `parseNameStatusZ` fits naturally beside the other parse helpers (D-06 discretion). It uses `String(raw ?? "")` and `\0` splitting — no dependency on `zeroPad` or any other `_shared` export, so placement is purely cosmetic. [VERIFIED: read lib/_shared.js:1-515]

### 4. `lib/state.js` — config default removal [VERIFIED: read lib/state.js:183-208]

`_defaultConfig` at `lib/state.js:196` has `clean_pr_branch: true,` inside the `workflow` block. Removing it is safe: `readConfig` returns defaults on a missing key, and an existing config that still carries `clean_pr_branch: true` is simply ignored (D-04 — no migration). [VERIFIED: read lib/state.js:196]

### 5. `lib/health.js` — **the CONTEXT's scope is overstated; no code change is needed** [VERIFIED: read lib/health.js:205-219, 340-356]

This is the most important research finding. The CONTEXT (D-04) says "Update lib/health.js so its config repair (R-02) no longer treats clean_pr_branch as a required workflow key." **But `lib/health.js` contains no hardcoded reference to `clean_pr_branch` at all** (grep across `lib/health.js` returns zero matches). Both the W-05 required-key scan and the R-02 repair set are **derived from the passed default config's `workflow` keys**:

- `lib/health.js:212` — `const requiredWorkflow = [...Object.keys(schema.workflow || {}), "ai_integration_phase"];`
- `lib/health.js:345` — `const repairSet = [...Object.keys((defaultConfig || {}).workflow || {}), "ai_integration_phase"];`

Therefore removing `clean_pr_branch` from `_defaultConfig` in `lib/state.js` **automatically** removes it from both the required-key scan and the R-02 repair set. **No separate `lib/health.js` edit is required.** The planner should NOT add a redundant health.js change; the health.js "change" is purely a consequence of the state.js change. (The only health.js-adjacent work is in `test/health.test.mjs`, which uses its own local `defaultConfig()` helper — see §7.)

### 6. `lib/undo.js` — the only surviving consumer [VERIFIED: read lib/undo.js:35, 327-328]

`lib/undo.js:35` imports `parseNameStatusZ` from `./_clean-branch.js` and uses it at line 328 to parse the dry-run diff. After relocation, change the import to `./_shared.js`. No other undo.js change. [VERIFIED: read lib/undo.js:35, 327-328]

### 7. Test-suite cleanup — [VERIFIED: read the affected test files this session]

| File | Action | Detail |
|---|---|---|
| `test/pr-branch.test.mjs` | **Remove** | Whole clean-branch core test (322 lines, imports all 10 exports). |
| `test/cleanpr-config.test.mjs` | **Remove** | Config-key assertion (state.js `clean_pr_branch: true`) + README assertion (`phase-<N>-clean`). |
| `test/gates-ship.test.mjs` | **Update** | Remove the two GSD-35 describe blocks (lines 224-272): `no_clean_pr` param, `resolveCleanPr(cfg, args.no_clean_pr)`, `from "./_clean-branch.js"`, `5.7 clean-PR branch` banner, `buildCleanBranch({`, `prArgs.push("--head", prBranch)`, `let prBranch = branch;`. |
| `test/ship-async.test.mjs` | **Update** | Remove the "completion state is propagated to the clean branch" test (lines 63-72). |
| `test/undo.test.mjs` | **Update** | Line 25: `from "../lib/_clean-branch.js"` → `from "../lib/_shared.js"`. |
| `test/health.test.mjs` | **Update** | The local `defaultConfig()` helper (lines 42-66) mirrors `_defaultConfig` and must drop `clean_pr_branch: true` (line 55) **in sync with state.js**, or the W-05/R-02 tests break. Then rework the clean_pr_branch-specific assertions: line 184 (W-05 missing-key test), lines 376-398 (e2e missing-key config), lines 460-463 (R-02 repair test), lines 487-510 (`writeConfigMissingWorkflowKeys` helper), line 549 (repair assertion). These should switch to a still-required key — `ai_integration_phase` is the natural choice (it is already asserted as required at lines 198-202, 466-471, 550). |

**Baseline confirmed:** the six affected test files pass today (116 tests, 0 fail) — `node --test test/pr-branch.test.mjs test/cleanpr-config.test.mjs test/undo.test.mjs test/gates-ship.test.mjs test/ship-async.test.mjs test/health.test.mjs`. [VERIFIED: ran the affected suite this session]

### 8. README documentation — stale-doc risk [VERIFIED: read README.md:226]

`README.md:226` documents the clean-PR branch feature in detail ("At ship time `gsd_ship` derives a `phase-<N>-clean` review branch … Disable via `workflow.clean_pr_branch: false` … or the `gsd_ship` `no_clean_pr` parameter"). This is **not** in the CONTEXT's explicit in-scope list (which names only `lib/ship.js`, `lib/_clean-branch.js`, `lib/state.js`, `lib/health.js`, and the affected test suites). Leaving it is stale documentation that contradicts the removal. The `cleanpr-config.test.mjs` README assertion (line 44) is being removed, so no test forces the README either way. **Recommendation:** update `README.md:226` to state that `gsd_ship` PRs the phase-NN branch directly (one branch per phase). This is a doc-consistency concern; flag it to the executor as in-scope-by-consistency even though it is outside the literal CONTEXT file list.

### 9. No new dependencies — [VERIFIED: package.json this session]

This is a pure removal. No new runtime or dev dependency is introduced. The `files` field (`["lib/*.js", ...]`) ships `lib/*.js` wholesale, so deleting `lib/_clean-branch.js` automatically removes it from the published package — no `files` change needed. [VERIFIED: package.json `files` this session]

---

## Package legitimacy

No new dependency is proposed. The only "dependency" is the existing `@deepseek-ai/dsh-tools` import in `lib/ship.js`/`lib/undo.js`, which is unchanged. Nothing to verify. [VERIFIED: package.json + lib imports this session]

---

## Risks and Open Questions

### Risks

- **R-1 (health.js implicit change):** The CONTEXT says to edit `lib/health.js`, but the change is fully implicit via `state.js` `_defaultConfig`. If a planner/executor adds a redundant health.js edit, it is harmless but noise; if they *skip* the state.js edit, the W-05/R-02 clean_pr_branch behaviour silently persists. **The state.js `_defaultConfig` removal is the single source of truth for the health.js behaviour.** [VERIFIED: lib/health.js:212, 345]
- **R-2 (health.test.mjs local helper drift):** `test/health.test.mjs` has its own `defaultConfig()` helper (lines 42-66) that must be updated in lockstep with `state.js`. If only one is updated, the W-05/R-02 tests fail or the removal is incomplete. [VERIFIED: test/health.test.mjs:42-66]
- **R-3 (dangling `prBranch`/`cleanPr`):** The removal must delete the variables and every reference together (ship.js 140, 186, 197, 213, 215, 216, 275, 311, 313, 316, 317). A single missed reference breaks the module. [VERIFIED: grep lib/ship.js]
- **R-4 (parseNameStatusZ coverage loss):** `test/pr-branch.test.mjs` (removed) is the primary unit-test home for `parseNameStatusZ`. After removal, the only coverage is via `test/undo.test.mjs` (which exercises it through the dry-run report). `test/_shared.test.mjs` does **not** currently test it. **Recommendation:** add a `parseNameStatusZ` unit test to `test/_shared.test.mjs` to preserve direct coverage of the relocated function (rename `R`/`R100` handling, trailing-NUL, truncated-input guards). [VERIFIED: grep test/_shared.test.mjs — no matches]
- **R-5 (stale README):** `README.md:226` documents the removed feature. Leaving it is a doc-consistency defect. [VERIFIED: README.md:226]
- **R-6 (removal.test.mjs / DEGR-05):** `test/removal.test.mjs` only asserts `gsd_ship` is present + registered + schema-sound (lines 173-175) — it does **not** reference the clean branch, so it stays green and needs no change. [VERIFIED: grep test/removal.test.mjs]

### Open Questions

- **OQ-1 (RESOLVED):** Does `lib/health.js` need any code change beyond the `state.js` `_defaultConfig` removal? **No.** Both `requiredWorkflow` (line 212) and `repairSet` (line 345) are derived from `Object.keys(defaultConfig.workflow)`. Removing the key from `_defaultConfig` removes it from both the W-05 scan and the R-02 repair automatically. [VERIFIED: lib/health.js:212, 345]
- **OQ-2 (RESOLVED):** Should `README.md:226` be updated? **Yes** — update it to state that `gsd_ship` PRs the phase-NN branch directly. This is outside the CONTEXT's literal file list but is required for doc consistency. [VERIFIED: README.md:226]
- **OQ-3 (RESOLVED):** Must `test/health.test.mjs`'s local `defaultConfig()` helper be updated? **Yes**, in sync with `state.js`, and the clean_pr_branch-specific assertions (184, 376-398, 460-463, 487-510, 549) must switch to a still-required key (`ai_integration_phase`). [VERIFIED: test/health.test.mjs:42-66, 184, 460-463, 549]
- **OQ-4 (RESOLVED):** Is `cleanBranchName` used anywhere in `ship.js`? **No** — it is already an unused import (only `buildCleanBranch`/`resolveCleanPr` are called). The whole import line is removed. [VERIFIED: grep lib/ship.js — cleanBranchName only at line 19]

All open questions are RESOLVED; planning may proceed.

---

## Architectural Responsibility Map

This is a removal, so the map is about where the surviving capability (`parseNameStatusZ`) lives and where the removed code was, to confirm no capability lands in the wrong tier.

| Capability | Tier | Assignment | Correct? |
|---|---|---|---|
| `parseNameStatusZ` (survives) | **Domain** (pure, I/O-free) | Relocate to `lib/_shared.js` (existing shared domain module) | ✅ Correct — it is a pure parse function; `_shared.js` is the domain tier. |
| Clean-branch build/push/cherry-pick (removed) | **Integration** (git orchestration) | Removed from `lib/ship.js`; `lib/_clean-branch.js` deleted | ✅ Correct — integration code removed entirely. |
| `workflow.clean_pr_branch` config (removed) | **Data** (config schema) | Removed from `lib/state.js` `_defaultConfig` | ✅ Correct — config default removed. |
| Health W-05/R-02 clean_pr_branch handling (removed) | **Data** (config validation/repair) | Removed implicitly via `_defaultConfig` (no health.js edit) | ✅ Correct — derived from the config schema. |

**No security-sensitive capability is moved to a wrong tier.** The only relocation is a pure domain function into the domain tier. No BLOCKER. [VERIFIED: lib/_shared.js, lib/_clean-branch.js, lib/state.js, lib/health.js this session]

---

## Validation Architecture

The full suite is `npm test` → `node --test test/*.test.mjs` (SHIP-CLEAN-04). The removal is proven by a combination of static source assertions and the surviving runtime tests.

| Behaviour | Automated check | Where |
|---|---|---|
| `gsd_ship` no longer builds/pushes a clean branch; PR head is phase-NN (SHIP-CLEAN-01) | Static: `lib/ship.js` contains no `_clean-branch` import, no `no_clean_pr`, no `buildCleanBranch`, no `--head`, no `prBranch`/`cleanPr` | New/updated static test (replaces `gates-ship.test.mjs` GSD-35 blocks) |
| `no_clean_pr` param + `workflow.clean_pr_branch` config removed (SHIP-CLEAN-02) | Static: `lib/state.js` `_defaultConfig` has no `clean_pr_branch`; `lib/ship.js` defineTool has no `no_clean_pr` | New/updated static test (replaces `cleanpr-config.test.mjs`) |
| Health repair stops requiring the key (SHIP-CLEAN-02) | Static: `lib/health.js` has no `clean_pr_branch`; `lib/state.js` `_defaultConfig` has none | Covered by the state.js static assertion (health.js is derived) |
| `parseNameStatusZ` relocated so `lib/undo.js` keeps working (SHIP-CLEAN-03) | Runtime: `test/undo.test.mjs` passes with the import pointing at `_shared.js`; **recommend** a direct `parseNameStatusZ` unit test in `test/_shared.test.mjs` | `test/undo.test.mjs`, `test/_shared.test.mjs` |
| `lib/_clean-branch.js` deleted | Static: file absent; no `_clean-branch` reference anywhere in `lib/` or `test/` | New static assertion (grep-based) |
| All clean-branch tests removed/updated; suite passes (SHIP-CLEAN-04) | Runtime: `npm test` green | Full suite |
| DEGR-05 per-plugin removal still holds | Runtime: `test/removal.test.mjs` (unchanged) | `test/removal.test.mjs` |

**Nyquist/coverage note:** the removal is a deletion, so the strongest proof is a static "no references remain" assertion plus the surviving runtime suite. The planner should add one grep-based test asserting `_clean-branch.js` is gone and no `clean_pr_branch`/`no_clean_pr`/`--head`/`prBranch` reference survives in `lib/` or `test/` (excluding the intentionally-updated health tests that switch to `ai_integration_phase`).

---

## Project Constraints

From the planning context and repo conventions:

- **Pure-removal discipline (D-01):** no new capability, tool, or command; `gsdShip` capability and `gsd_ship` tool keep their name/signature except the removed `no_clean_pr` param.
- **Shared-module relocation (D-03):** `parseNameStatusZ` must survive in `lib/_shared.js`; `lib/undo.js` and `test/undo.test.mjs` import it from there; `lib/_clean-branch.js` is then deleted entirely.
- **Config/schema removal (D-04):** drop `no_clean_pr` from the `gsd_ship` schema and `workflow.clean_pr_branch` from `_defaultConfig`; existing configs carrying the key are harmless (ignored, no migration).
- **Test cleanup (D-05):** remove `test/pr-branch.test.mjs` and `test/cleanpr-config.test.mjs`; update `test/gates-ship.test.mjs`, `test/health.test.mjs`, `test/ship-async.test.mjs`; the full suite must pass.
- **No new runtime dependencies** (repo-wide convention; `_clean-branch.js` itself documented "No new runtime dependencies (D-10)").
- **`gh pr create` defaults head to current branch** (D-02) — dropping `--head` still PRs phase-NN correctly.
- **The user squash-merges PRs** — the clean branch is redundant for final history (specifics).
- **Deferred (ignore):** defensive cleanup of stale remote `phase-NN-clean` branches; any change to phase-branch acquisition at gsd_discuss; changing GitHub squash-merge behaviour.

---

*Phase: 51-drop-clean-branch · Research complete · All open questions RESOLVED.*
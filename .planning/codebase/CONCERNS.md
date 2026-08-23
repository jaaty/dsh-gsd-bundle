# Codebase Concerns

**Analysis Date:** 2026-08-23

This audit reflects the codebase at commit `cc89363` (after the `fix bugs` / `fix more bugs` / `add tests` / `feat: add gsd-map-codebase plugin` commits). An earlier `CONCERNS.md` (2026-08-22) flagged several then-live bugs; the ones resolved since are summarised in *Tech Debt → Resolved since the prior audit* and are NOT repeated as open concerns. Everything below is a current, open issue.

## Tech Debt

**Requirements are marked complete on execution, not on verification:**
- Issue: `lib/execute.js` line 108 flips every plan's `requirements` to `[x]` in `REQUIREMENTS.md` the moment a `SUMMARY.md` exists (`markRequirementComplete`), i.e. before `gsd_verify` runs. If `gsd_verify` later returns `gaps_found` and the phase is re-planned/re-executed, the requirement checkboxes stay `[x]` — the traceability ledger lies about what was actually verified. `completePhase` (`lib/state.js` line 480) marks them again at ship, but by then the damage (stale `[x]` during a failed verify cycle) is already done.
- Files: `lib/execute.js` (line 108), `lib/state.js` (`markRequirementComplete` line 329, `completePhase` line 480).
- Impact: `REQUIREMENTS.md` cannot be trusted as a record of verified delivery; a reviewer reading it mid-loop sees false "done" signals.
- Fix approach: move `markRequirementComplete` out of `gsd_execute` entirely and call it only from `completePhase` (already does so) — or call it from `gsd_verify` only when `status === "passed"`. Execution should not mutate the requirements ledger.

**Repeated `readRoadmap` + `readConfig` on every artefact access:**
- Issue: `_phaseDirName` (`lib/state.js` lines 342-349) calls `readRoadmap(cwd)` and `readConfig(cwd)` — two file reads — to derive the phase slug and `project_code` prefix. `phaseDir` calls `_phaseDirName`; `writeArtifact`, `readArtifact`, `hasArtifact`, and `listPlans` all call `phaseDir`. `listPlans` (line 392-399) then calls `phaseDir` AND `_phaseDirName` a second time in the same method, so a single `listPlans` does 4 redundant reads of `ROADMAP.md` + `config.json` plus one full read per `PLAN.md`.
- Files: `lib/state.js` (`_phaseDirName` 342, `phaseDir` 351, `listPlans` 392).
- Impact: amplifies the O(phases × plans) orientation cost (see Performance); at opengsd scale (≤10s of phases, ≤10 plans) it is harmless, but it is pure waste with no correctness benefit.
- Fix approach: resolve the phase dir name once per tool invocation and pass the resolved `dir`/`base` down to `writeArtifact`/`readArtifact`/`hasArtifact`/`listPlans`, or memoise `_phaseDirName` per `(cwd, phaseNum)` with invalidation on `writeRoadmap`/`writeConfig`.

**`cachedState` has no freshness check (stale across external edits):**
- Issue: the persona runtime-context provider (`lib/persona.js` `renderStateContext`, line 52) reads `gsdState.cachedState(cwd)` synchronously from the in-memory `_cache` (`lib/state.js` line 37). The cache is populated by `readState`/`writeState`/`initProject` but is never invalidated against on-disk mtime. If `STATE.md` is edited by hand, by `git checkout`, or by another session/process, the persona context renders the pre-edit position until the next `readState` call within this process.
- Files: `lib/state.js` (`_cache` 37, `cachedState` 496-507), `lib/persona.js` (line 52).
- Impact: a stale "GSD loop position" line in the runtime-context snapshot after a branch switch; low severity for single-user dev tooling, confusing for multi-session.
- Fix approach: stat `STATE.md` on each `cachedState` call and re-read when mtime advances, or clear the cache entry on a filesystem-watching hook. At minimum, document that the persona snapshot is a hint, not authoritative (the docstring already says "sync snapshot" but not "may be stale").

**`execFileSync` still blocks the host event loop:**
- Issue: `lib/ship.js` (`run`/`git`/`gitOk`/`gh`, lines 19-30) and `lib/map-codebase.js` (`gitAddCommit`, lines 59-67) use synchronous `execFileSync`. A `git push` to a slow remote blocks the entire DSH host process — every other session's tool loop stalls until the child exits.
- Files: `lib/ship.js` (lines 19-30, 62-80), `lib/map-codebase.js` (lines 59-67).
- Impact: in a multi-session host, one `gsd_ship` can freeze all sessions for the duration of a push.
- Fix approach: promisify with `node:child_process.execFile` (or `spawn` + a collected-output promise) and `await` it; the tool `execute` is already async. The injection-safety already gained from array-args is preserved when moving to `execFile`.

**`gitOk` swallows every error as `""`:**
- Issue: `lib/ship.js` `gitOk` (lines 25-27) `catch { return ""; }` for any failure — missing binary, corrupt repo, permission error, or a genuine non-zero exit all become an empty string. Preflight then reasons about that empty string (e.g. `branch = gitOk(...)` → `""` → `fail("could not determine current branch")`). The user gets a misleading message ("could not determine current branch") when the real cause is "git not installed" or "not a git repo".
- Files: `lib/ship.js` (lines 25-27, used at 62-74).
- Impact: poor diagnosability of preflight failures; the actual root cause is hidden behind a generic message.
- Fix approach: distinguish "absent/empty result" (expected, e.g. `git status --short` on a clean tree) from "command failed" (unexpected). Return `{ ok, value, err }` or throw on unexpected failures and catch at the call site with a specific message.

**Stale temp PR-body file on `gh pr create` failure:**
- Issue: `lib/ship.js` writes the PR body to `${cwd}/.planning/.pr-body-<phase>.md` (line 125) *after* the clean-working-tree preflight (line 62). If `gh pr create` then fails, `fail(...)` throws (line 134) and the `await fs.unlink(tmp)` on line 136 is never reached — the temp file is left on disk. Because `.planning/` is not gitignored (`.gitignore` only lists `node_modules/`), the next `gsd_ship` preflight's clean-tree check (`git status --short`) sees the leftover file and fails with "working tree not clean".
- Files: `lib/ship.js` (lines 125-136).
- Impact: a single failed `gh pr create` permanently blocks all subsequent `gsd_ship` attempts until the temp file is manually removed.
- Fix approach: wrap the `gh pr create` + `unlink` in `try/finally` so the temp file is always removed, or write the body to `node:os.tmpdir()` (outside the repo) so it never affects the clean-tree gate.

**`listPlans` interpolates `base` into a `RegExp`:**
- Issue: `lib/state.js` line 402 builds `new RegExp(\`^${base}-(\\d+)-PLAN\\.md$\`)` with the phase dir `base` (derived from `slugify(phase.name)`) interpolated unescaped. `slugify` (`lib/_shared.js` lines 5-12) restricts output to `[a-z0-9-]`, so no regex metacharacter can currently appear — this is safe *today* but is a latent footgun: any future change to `slugify` (or to `projectCode` prefixing, line 346) that allowed `.`, `+`, `(`, etc. would silently break plan discovery.
- Files: `lib/state.js` (line 402).
- Impact: none currently; latent.
- Fix approach: escape the literal portion with a `escapeRegExp(base)` helper before interpolating, or use a non-regex `startsWith` + numeric-suffix check.

**`VERIFICATION_GAPS` is imported but unused in the test helper:**
- Issue: `test/helpers/project.mjs` exports `VERIFICATION_GAPS` (lines 83-88) and `test/state.test.mjs` imports it (line 16) but never references it. Dead import.
- Files: `test/state.test.mjs` (line 16), `test/helpers/project.mjs` (lines 83-88).
- Impact: none functionally; signals the gap-closure verify path is under-tested (see Test Coverage Gaps).
- Fix approach: add a `gsd_verify` test that drives the `gaps_found` route using `VERIFICATION_GAPS`, or remove the unused import/export.

### Resolved since the prior audit (2026-08-22)

These were open concerns in the previous `CONCERNS.md` and are now fixed in the code; recorded here so the history is not re-litigated:

- `--force` replan gate — `gsd_plan` now defines `force` (`lib/plan.js` line 25) and honours it at the closed-phase gate (lines 49-52). `isClosedPhase` (`lib/_shared.js` lines 292-294) parses frontmatter correctly, including fenceless and quoted `"passed"`.
- `total_plans` progress counter — `markPlanSummary` (`lib/state.js` line 457) now syncs `progress.total_plans` to the live plan count.
- Dead `_ensureDir` — now actually `mkdir(..., { recursive: true })` (`lib/state.js` lines 83-88) and `_write` calls `_ensureParent` (lines 93-96).
- `_planning()` reached across boundary from `quick.js` — `gsd_quick` now uses the public `s.planningRoot(cwd)` (`lib/quick.js` line 40).
- Stray `progress.total_phases: undefined` patch in `gsd_new_milestone` — `gsd_new_milestone` now calls `recomputeProgress(cwd)` (`lib/core-tools.js` line 197) instead of assigning a dotted undefined key.
- `--gaps-only` filter never matched — `lib/execute.js` line 53 now uses `matchesGapClosure(p.gap_closure)` (`lib/_shared.js` lines 278-280), which accepts boolean `true`, `"true"`, and `"True"`. The planner prompt instructs writing `gap_closure: true` (`lib/_agents.js` line 55).
- `gsd_new_milestone` progress desync — `recomputeProgress` recomputes `completed_phases` and `percent` (`lib/state.js` lines 484-493).
- Shell injection in `gsd_ship` — `run` now uses `execFileSync` with array args (`lib/ship.js` line 20) and `isValidRef`/`SAFE_REF_RE` (`lib/_shared.js` lines 284-288) validates `base`/`defaultBranch` (ship.js lines 70-71). Title goes via `--body-file`, not string interpolation.
- Undeclared `@deepseek-ai/dsh-llm` peer dependency — now listed in `package.json` peerDependencies (line 67).
- No tests — `test/*.test.mjs` + `test/helpers/*.mjs` now exist (34 passing tests; `package.json` `test` script).
- Subagent/orchestrator RESEARCH.md write race — the researcher prompt now says "DO NOT write the file yourself" (`lib/_agents.js` line 31) and the orchestrator writes the returned contents (`lib/plan.js` lines 80-83). Consistent single-owner contract. Same fix applied to UI-SPEC (`lib/ui.js` lines 49-51).
- EXECUTOR_PROMPT protected-ref contradiction — the prompt now makes worktree discipline conditional ("when run in an isolated git worktree — the shared-tree path skips these") and explicitly tells shared-tree executors to commit on the current branch (`lib/_agents.js` lines 144-150).

## Known Bugs

**No open correctness bugs with a reproducer are currently known.** The bugs the prior audit catalogued (`--gaps-only`, closed-phase gate, progress desync, `_ensureDir` no-op, injection) are all fixed and pinned by regression tests (`test/_shared.test.mjs`, `test/state.test.mjs`, `test/tools.test.mjs`). The items under Tech Debt above are design/operational debts, not reproducible wrong-output bugs.

The closest thing to a latent bug is the stale-temp-file → blocked-next-ship chain (see Tech Debt): a failed `gh pr create` leaves `.planning/.pr-body-<N>.md`, which then fails the next run's clean-tree preflight. Reproducer: run `gsd_ship` with `gh` unauthenticated (preflight catches `gh auth status` first, so this specific chain needs `gh` authenticated but `gh pr create` failing for another reason, e.g. no network); the temp file is left behind.

## Security Considerations

**Workspace `cwd` is followed, never contained:**
- Risk: every path is built by string concatenation of `cwd` + `.planning/...` (`lib/state.js` `_planning` line 41, `_write` line 77). `cwd` comes from `exec.agent.session.header.cwd` or falls back to `process.cwd()` (`lib/_runner.js` line 49, used by every phase tool). There is no path-containment check — a session pinned to any directory writes `.planning/` there, and `gsd_ship`'s `execFileSync` runs `git`/`gh` with that `cwd`.
- Files: `lib/_runner.js` (line 49), `lib/state.js` (lines 41-47), `lib/ship.js` (all `run(cwd, ...)`).
- Current mitigation: acceptable for single-user local dev tooling — the session cwd is user-controlled, not attacker-controlled. `isValidRef` guards the only value that reaches a shell argument from outside (`base`).
- Recommendations: document explicitly that the bundle trusts the session cwd and never asserts it is inside a git repo root. If the bundle is ever exposed to less-trusted callers, add a containment check that `cwd` is within a git worktree and refuse otherwise.

**`gitAddCommit` commits whatever the mapper subagents wrote:**
- Risk: `lib/map-codebase.js` `gitAddCommit` (lines 59-67) runs `git add -- .planning/codebase/` and `git commit` after the mapper subagents write. The mapper prompt forbids reading secret files (`lib/_agents.js` lines 280-281), but the orchestrator does not independently verify the document contents before committing — if a mapper subagent disobeyed and wrote a secret-bearing path into a document, it would be committed.
- Files: `lib/map-codebase.js` (lines 59-67, 177-178).
- Current mitigation: the mapper prompt's forbidden-files rule; best-effort commit (failures swallowed).
- Recommendations: optionally scan the written `.planning/codebase/*.md` for high-entropy strings / forbidden patterns before committing; or make the commit opt-in rather than automatic.

**No secret scanning on artefact writes:**
- Risk: `gsd_discuss` writes `canonical_refs`, `code_context`, `specifics` from model-supplied args verbatim into `CONTEXT.md` (`lib/discuss.js` lines 105-126); `gsd_quick` writes the subagent's raw output into `TASK.md` (`lib/quick.js` lines 45-54). Neither scans for accidental secret leakage.
- Files: `lib/discuss.js`, `lib/quick.js`.
- Current mitigation: none.
- Recommendations: out of scope for v0.1; document that `.planning/` artefacts may contain model-generated content and should be reviewed before a public PR (the ship PR body is assembled from these).

## Performance Bottlenecks

**`execFileSync` blocks the host event loop** — see Tech Debt (ship.js, map-codebase.js).

**O(phases × plans × artefacts) reads per orientation call:**
- Problem: `gsd_progress` (`lib/core-tools.js` line 134) calls `planIndex` per phase; `planIndex` (`lib/state.js` line 434) calls `listPlans`, which reads every `PLAN.md` fully and stats every `SUMMARY.md`. Combined with the repeated `readRoadmap`/`readConfig` in `_phaseDirName` (see Tech Debt), a single `gsd_progress` with a phase argument reads `ROADMAP.md` + `config.json` once for the roadmap loop, then for each phase: `ROADMAP.md` + `config.json` ×4 (via `_phaseDirName`) + one full read per `PLAN.md` + one stat per `SUMMARY.md`.
- Files: `lib/core-tools.js` (`gsd_progress` 126-153), `lib/state.js` (`planIndex` 434, `listPlans` 392-427).
- Cause: no caching of the roadmap/config/phase-dir resolution across the loop; `_phaseDirName` re-reads both files per call.
- Improvement path: resolve roadmap + config once per tool invocation, pass the resolved phase dir down, and memoise `planIndex` per `(cwd, phaseNum)` with invalidation on artefact write.

**Parallel executors contend on the shared git index:**
- Problem: same-wave executors run concurrently via `Promise.all` (`lib/execute.js` line 102) on the single working tree; each runs `git add`/`git commit` (per the EXECUTOR_PROMPT atomic-commit discipline, `lib/_agents.js` lines 152-158), racing on `.git/index.lock`. The plan-checker's same-wave non-overlap guarantee (Dimension 3) covers *files*, not git's lock.
- Files: `lib/execute.js` (lines 79-112), `lib/_agents.js` (EXECUTOR_PROMPT).
- Impact: intermittent "index.lock exists" executor failures in wave > 1; the orchestrator only detects the failure afterwards as "no SUMMARY.md written" (`lib/execute.js` line 116).
- Improvement path: serialise commits with an in-module mutex around executor dispatch, or move to per-plan git worktrees (acknowledged as a deliberate deviation in `lib/execute.js` header comment, lines 9-12).

**`planningContext` truncates each artefact at 60k chars:**
- Problem: `planningContext` (`lib/_runner.js` lines 36-46) caps *each* entry at `maxPerFile = 60000` chars with no total budget. A plan-checker or verifier run on large `RESEARCH.md`/`PLAN.md` files operates on truncated inputs, and the truncation is silent (only an in-content `…(truncated)…` marker; no log in the tool output).
- Files: `lib/_runner.js` (lines 36-46).
- Improvement path: truncate against a *total* budget (sum across entries) and surface the truncation in the tool's return text so the orchestrator knows the subagent saw partial input.

## Fragile Areas

**The full phase loop has never run against a live host:**
- Files: `README.md` (line 121: "A full live mount ... is the next step"), all of `lib/`.
- Why fragile: every artefact read/write flows through `ctx.fs` (`lib/state.js` `_read`/`_write`); every subagent spawn through `ctx.subagents.start('spawn', ...)` (`lib/_runner.js` line 20). Neither the host `fs` service contract nor the in-process `spawn` provider has been exercised end-to-end — the tests use an in-memory `FakeFs` and a fake `subagents` service (`test/tools.test.mjs` lines 21-62, `test/helpers/fake-fs.mjs`). Whether the real host `fs` auto-creates parents is now handled by `_ensureParent` (node:fs `mkdir`), but whether `subagents.start('spawn', ...)` resolves `req.parent = exec.agent` correctly, whether the spawn provider's cwd matches the orchestrator's, and whether a subagent's Write tool writes to the same store the orchestrator reads are all unverified.
- Safe modification: before relying on the loop, run `gsd_init → gsd_discuss → gsd_plan → gsd_execute → gsd_verify` in a real session and confirm artefacts round-trip.
- Test coverage: the tool `execute` functions are tested with fakes; the live host path is not.

**Planner/executor subagent writes are read back but never validated for location:**
- Files: `lib/plan.js` (lines 106-117), `lib/execute.js` (lines 81-104, 105-107).
- Why fragile: the planner writes `PLAN.md` files with its own Write tool (`lib/plan.js` line 107); the executor writes code + `SUMMARY.md` with its own Write tool. The orchestrator then reads them back via `listPlans`/`hasArtifact`. If the in-process `spawn` provider's subagent writes to a different cwd/sandbox than the orchestrator, `listPlans` returns empty and `gsd_plan` reports "planner produced no PLAN.md files" with no retry (`lib/plan.js` line 117); `gsd_execute` reports "no SUMMARY.md written" (`lib/execute.js` line 116). Both are silent-failure modes with no recovery in the orchestrator.
- Safe modification: after each subagent settles, verify the expected artefact exists via the orchestrator's `ctx.fs` (already done for SUMMARY at `lib/execute.js` line 105); add the same existence check + a retry for planner PLAN.md writes.
- Test coverage: `test/tools.test.mjs` fakes write into the same `FakeFs` the orchestrator reads, so it cannot detect a real sandbox mismatch.

**`gsd_verify` trusts the verifier subagent's frontmatter verbatim:**
- Files: `lib/verify.js` (lines 77-85), `lib/_agents.js` (VERIFIER_PROMPT lines 201-219).
- Why fragile: the tool reads `status` and `score` back from the `VERIFICATION.md` the subagent wrote (`lib/verify.js` lines 77-84) and routes purely on the `status` string. There is no score floor (a `score: 1/9` with `status: passed` ships), no independent re-check that the artefacts the verifier claims are "VERIFIED" actually exist, and no guard against a verifier that wrote `status: passed` without doing the work. The verifier prompt is adversarial ("DO NOT trust SUMMARY.md"), but nothing in code is adversarial about the verifier itself.
- Safe modification: add a score-floor check (e.g. refuse `passed` if score < threshold) and a spot re-stat of a sample of "VERIFIED" artefacts before routing to `ship`.
- Test coverage: `gsd_verify` is not directly tested (see Test Coverage Gaps).

**Frontmatter parser is a hand-rolled YAML subset:**
- Files: `lib/_shared.js` (`parseFrontmatter` 51-81, `parseFmLines` 89-149, `stringifyFrontmatter` 151-173).
- Why fragile: the parser handles only flat scalars, flow arrays, block lists, and one level of nesting (the `progress:` block). It is the sole gate for plan/summary/verification frontmatter. A subagent that writes valid YAML the subset doesn't handle (multi-line strings, deeply nested `must_haves`, anchors, `|` block scalars) silently parses to `{}` or a partial object, and downstream `listPlans`/`gsd_plan`/`gsd_verify` misbehave with no error. The fenceless-tolerance path (`lib/_shared.js` lines 60-77) is especially heuristic.
- Safe modification: before extending the artefact schema, fuzz `parseFrontmatter`/`stringifyFrontmatter` against a real YAML parser and document the exact supported subset in `CONVENTIONS.md`. Keep `must_haves` flat (truths as a block list, artifacts/key_links as separate files) rather than pushing the nesting limit.
- Test coverage: `test/_shared.test.mjs` covers the common shapes (fenced, fenceless, nested progress, quoting) but not block scalars, multi-line strings, or 2-level nesting.

## Scaling Limits

**Two-digit phase/plan padding:**
- Current capacity: phase and plan numbers are zero-padded to 2 digits (`zeroPad`, `lib/_shared.js` lines 14-16). `listPlans` regex `^${base}-(\d+)-PLAN\.md$` (`lib/state.js` line 402) accepts any `\d+`, so phase/plan 100+ still parses and sorts. The limit is cosmetic: the `.planning/phases/<NN>-<slug>/` naming convention ("<NN> = zero-padded phase number", `README.md` line 67) becomes visually inconsistent at 100 (`100` vs `01`), and the README's stated convention silently breaks.
- Limit: <100 phases and <100 plans/phase before naming-convention drift; no architectural blocker.
- Scaling path: document the limit, or switch `zeroPad` to a configurable width if a project ever exceeds it.

**Single-project-per-cwd orientation:**
- Current capacity: all state is keyed by `cwd` (`_cache` Map, `lib/state.js` line 37; `planningRoot(cwd)`, etc.). Multi-repo work requires per-cwd state, which the service supports, but the persona's sync `cachedState(cwd)` (`lib/persona.js` line 52) renders only the session's cwd — there is no cross-repo view.
- Limit: one active project per session cwd.
- Scaling path: not a blocker at v0.1; a future "workspace" abstraction over multiple cwds would be the scaling path.

## Dependencies at Risk

**All peer dependencies pinned to `*`:**
- Risk: `package.json` peerDependencies (lines 63-68) are all `"*"` (`@deepseek-ai/dsh-tools`, `@deepseek-ai/schemastery`, `@deepseek-ai/cordis`, `@deepseek-ai/dsh-llm`). `dependencies: {}` (line 62) means the bundle fully relies on host hoisting. The previously-undeclared `@deepseek-ai/dsh-llm` import is now listed, but no peer has a minimum version.
- Impact: any breaking host API change (`ctx.tools.register`, `ctx.commands.register`, `agent.followup`, `ctx.fs.resolve/stat/readText/writeText/listDir`, `ctx.subagents.start('spawn', ...)`, `ctx.systemPrompt.section/context`, `ctx.provide`, `ctx.effect`) breaks the bundle with no version constraint to flag it. There is no lockfile and no CI to catch a host upgrade regression.
- Migration plan: set minimum-version peers (e.g. `"@deepseek-ai/dsh-tools": ">=0.x"`) once the host versions stabilise, and add a CI job that installs the bundle against the current host and runs `node --test`.

**No lockfile, no CI:**
- Risk: there is no `package-lock.json`/`pnpm-lock.yaml` and no `.github/` CI config. `package.json` `dependencies: {}` means nothing to lock, but the absence of CI means the 34 tests run only when someone remembers `npm test`.
- Impact: regressions in the phase loop can land unnoticed (the `fix bugs`/`fix more bugs` commits show this already happened once).
- Migration plan: add a minimal CI workflow that runs `node --test test/*.test.mjs` on push, and a `gsd_verify`/`gsd_quick`/`gsd_ui_phase` test to close the largest coverage gap (see Test Coverage Gaps).

## Missing Critical Features

**No capability gates (acknowledged in `README.md` lines 109-116):**
- Problem: `gsd_ship` does only the core preflight (verification passed, clean tree, branch, remote, `gh`). Security/audit gates (`ship:pre`, TDD-audit, broken-windows ledger), the async-jobs manifest, `WINDOWS.md`, the UAT conversational loop, and the `gsd_map_codebase --query` intel mode (drift detection, `gsd-intel-updater`) are not implemented.
- Blocks: a phase can ship with no tests if `gsd_verify` returned `passed` via a verifier that skipped behaviour checks (see Fragile Areas). The verify→ship handoff has no score floor.

**No score/behaviour gate in `gsd_verify`:**
- Problem: `lib/verify.js` lines 77-91 route purely on the frontmatter `status` string the verifier subagent wrote. `score` is read only for display (`lib/verify.js` line 83, ship.js line 99). A low `score` (e.g. `1/9`) with `status: passed` routes to `ship`.
- Blocks: any enforcement that "verified" means more than "the subagent wrote the word 'passed'".

**No UAT / human-verification closure loop in code:**
- Problem: the verifier can return `human_needed` with a `human_verification` block (`lib/_agents.js` lines 213-217), and `gsd_verify` surfaces it (`lib/verify.js` line 90), but there is no tool to record the human's answer and re-trigger verify. The `<NN>-UAT.md` persistent session state mentioned in `README.md` line 63 has no writer.
- Blocks: closing a `human_needed` phase requires manual editing of `VERIFICATION.md` and re-running `gsd_verify`.

## Test Coverage Gaps

**What's covered (34 tests, all passing):**
- `lib/_shared.js` — `parseFrontmatter`/`stringifyFrontmatter` (fenced, fenceless, nested, quoting), `parseRoadmap`/`stringifyRoadmap` (incl. zero-requirement phases), `parseRequirements`/`stringifyRequirements`, `slugify`, `zeroPad`, `matchesGapClosure`, `isValidRef`, `isClosedPhase` (`test/_shared.test.mjs`).
- `lib/state.js` — `GsdState` init/artefact naming, `writeArtifact` parent-dir creation, `listPlans` fenced+fenceless, `planIndex` waves, `markPlanSummary` progress sync, `completePhase`/`recomputeProgress` counters, `markRequirementComplete` (`test/state.test.mjs`).
- Tool execute paths — `gsd_discuss` (writes CONTEXT, advances STATE), `gsd_execute` `--gaps-only` (runs gap plan, skips non-gap), `gsd_plan` closed-phase gate (rejects without `force`, plans with `force`), `gsd_ship` (missing-VERIFICATION preflight only), `gsd_status` (renders progress), `gsd_map_codebase` (full/fast/existing/force/paths/invalid-focus) (`test/tools.test.mjs`).

**What's NOT covered by any test:**
- `lib/verify.js` (`gsd_verify`) — no test drives the `passed`/`gaps_found`/`human_needed` routing, the read-back of `status` from `VERIFICATION.md`, or the re-verification `gaps` mode. The exported `VERIFICATION_GAPS` fixture (`test/helpers/project.mjs` line 83) is imported but unused — a ready-made seed for this gap. **Priority: High** — the verify→ship gate is the loop's safety boundary and is entirely untested.
- `lib/quick.js` (`gsd_quick`) — no test. The sub-threshold path commits and writes `TASK.md` untested. **Priority: Medium**.
- `lib/ui.js` (`gsd_ui_phase`) — no test for the researcher→checker flow, the "no usable spec" guard (line 50), or the STATE advance to `plan`. **Priority: Low** (optional phase).
- `lib/commands.js` — no test for argument parsing (`--wave N`, `--gaps-only`, `--draft`), the `{err}` paths, or `agent.followup` dispatch. **Priority: Medium** (a misparsed `--wave` silently runs all waves).
- `lib/persona.js` — `renderStateContext` (the uninitialised-project hint, the loop-position line) is untested. **Priority: Low** (display only, but it orients every step).
- `lib/_runner.js` — `spawnSubagent`, `planningContext` (incl. the 60k truncation), `cwdOf` fallback are untested directly. **Priority: Medium** (the truncation is a silent correctness risk for subagent inputs).
- `lib/ship.js` beyond the missing-VERIFICATION case — the branch/clean-tree/remote/`gh auth` preflight ordering, the PR body assembly, the `isValidRef` enforcement at the call site, and the temp-file lifecycle (see Tech Debt) are untested because they need git/gh. **Priority: Medium** (preflight is the only thing standing between a half-baked phase and a PR).
- Live host `fs` / `subagents` contract — the `FakeFs`/fake-`subagents` cannot detect a real sandbox/cwd mismatch (see Fragile Areas). **Priority: High** (the whole loop is unverified against the real host).
- Frontmatter subset breadth — block scalars, multi-line strings, 2-level nesting (`must_haves.artifacts` as a block list of objects) are untested. **Priority: Medium** (a subagent writing valid-but-unsupported YAML silently breaks `listPlans`).

---

*Concerns audit: 2026-08-23*
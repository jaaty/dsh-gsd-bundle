I have all the evidence I need. Baseline confirmed: 56 tests pass, 0 fail. Let me write the RESEARCH.md content.

---

# Phase 4: checkpoint-resume — Research

## Domain analysis

**Goal.** Make `gsd_execute` capture checkpoint state when an executor stops at a `checkpoint:*` task (persist a per-plan `<base>-<PP>-CHECKPOINT.md` artefact) and resume an interrupted plan from that checkpoint on a later `gsd_execute` run (skip tasks `1..N`, continue at `N+1`), instead of re-running from task 1. Delivers DUR-01 and DUR-02.

**Confidence: HIGH** (all findings verified this session by reading the real source; no external dependency).

### How the pieces already fit

- The executor contract for checkpointing is **already present** in the role prompt: `lib/_agents.js` `EXECUTOR_PROMPT` line 158 `6. If a checkpoint:* task: stop and return the structured checkpoint state (do NOT proceed).` and line 168 `Return to the orchestrator: a completion summary and any <worktree_metadata>. If you hit a checkpoint, return the checkpoint state and stop.` [VERIFIED: read `lib/_agents.js:158,168`]
- The planner side is also present: `EXECUTOR_PROMPT` line 100 requires `autonomous: false` when any task is `checkpoint:human-verify | checkpoint:decision | checkpoint:human-action`, and `planIndex` computes a phase-level `has_checkpoints` from that flag. [VERIFIED — read `lib/_agents.js:100` and `lib/state.js:449-450`]
- What is **missing** is the controller half: `gsd_execute` currently ignores checkpoint output, persists nothing, and has no resume path. [VERIFIED — see §"Current gap"]

### The current gap (verbatim evidence)

1. **`gsd_execute` never reads a checkpoint.** The only completion probe is SUMMARY-based:
   - `lib/execute.js:74` — `let plans = idx.incomplete.filter((p) => !p.has_summary);`
   - `lib/execute.js:105` — `const ok = await s.hasArtifact(cwd, args.phase, \`SUMMARY-${zeroPad(Number(p.plan))}\`);`
   There is no `hasArtifact(... 'CHECKPOINT-…')` probe anywhere in `execute.js`. [VERIFIED — read `lib/execute.js:74,105`]
2. **The executor's structured result is collected but dropped.** `spawnSubagent` returns it (`lib/_runner.js:22-28` → `structured: result.structured`), but `gsd_execute` maps only `out`, `stopReason`, `diagnostic` into its results (line 111) — `r.structured` is never read. [VERIFIED — read `lib/_runner.js:22-28` and `lib/execute.js:111`]
3. **The per-plan artefact mapper does not know `CHECKPOINT`.** `_artifactFile` (used by `writeArtifact`/`readArtifact`/`hasArtifact`) only special-cases PLAN and SUMMARY:
   - `lib/state.js:365` — `const m = String(suffix).match(/^(PLAN|SUMMARY)-(\d+)$/i);`
   - `lib/state.js:367` — fallback `return \`${dir}/${base}-${suffix}.md\`;`
   - Consequence: `writeArtifact(cwd, phase, 'CHECKPOINT-01')` would produce `<base>-CHECKPOINT-01.md`, **not** the D-01-required `<base>-01-CHECKPOINT.md`. This must be extended. [VERIFIED — read `lib/state.js:364-368`]
4. **A checkpointed plan is already correctly classified as incomplete.** `planIndex` builds `incomplete = plans.filter((p) => !p.has_summary)` (`lib/state.js:444`), so a plan with a CHECKPOINT but no SUMMARY is already selected for (re)execution by `gsd_execute`'s `idx.incomplete.filter(... !has_summary)` — the resume *selection* needs no new plumbing. `task_count` is also already on each plan (`lib/state.js:419` `task_count: (body.match(/<task\b/g) || []).length`), needed for D-05 range validation. [VERIFIED — read `lib/state.js:419,444`]

### Standard patterns / pitfalls

- **Controller persists state, executor returns structured data.** The executor is a fresh-context subagent that cannot call the `gsdState` service (only phase *tools* can). So D-01's "executor persists … via `writeArtifact('CHECKPOINT-<PP>')`" must be read as: the **executor returns** structured checkpoint data and the **orchestrator (`gsd_execute`)** persists it via `s.writeArtifact(cwd, phase, 'CHECKPOINT-<PP>', …)`. This mirrors how the executor writes `SUMMARY-<PP>.md` (by a `Write` tool) and the orchestrator verifies it with `hasArtifact` (line 105). [VERIFIED — the only `writeArtifact` caller available to a phase is the tool layer; see `lib/state.js:370-376`]
- **Structured-output contract.** `gsd_execute` should read `r.structured` from `spawnSubagent` and treat a *recognisable* `checkpoint` sub-object as a checkpoint stop; a completing executor emits no `checkpoint` sub-object, so a shared schema is safe. **Do not** pass an `outputSchema` to `spawnSubagent` for the general case — it would force a schema on normal completions that only return free-text `output`. Read `result.structured` opportunistically and validate manually (fail-loud on a malformed checkpoint). [ASSUMED: the DSH subagent `result.structured` channel is the natural carrier for the already-instructed "structured checkpoint state"; no schema currently bound on this path — `lib/_runner.js:19` `if (outputSchema) req.outputSchema = outputSchema;`]
- **Resume keyed off the artefact, not the flag.** Whether a plan is resumable is best decided by *existence* of `CHECKPOINT-<PP>` + absence of `SUMMARY-<PP>` (D-02), not by the `autonomous:false` flag (a plan could be non-autonomous for reasons besides checkpointing). `planIndex.has_checkpoints` (line 450) is informational, not the resume trigger. [VERIFIED — read `lib/state.js:434-451`]
- **Skip by task index, not by commit hash.** D-03 locks deterministic task-index skip (`last_completed_task N` → tasks `1..N` done → begin `N+1`). The executor already reads the full PLAN.md, so its task boundaries match `task_count`. [VERIFIED — D-03 locked; executor always receives the PLAN via `planningContext` in `execute.js:88-98`]
- **Pitfall — naming asymmetry.** Extending `_artifactFile` is required but must not regress `PLAN`/`SUMMARY` mapping; add a dedicated `CHECKPOINT` branch (or generalise the per-plan group) plus explicit round-trip tests. [VERIFIED — read `lib/state.js:364-368`]

## Package legitimacy

**No new runtime dependencies are proposed.** This phase is pure in-repo ESM using existing helpers and built-in modules:

- Existing `parseFrontmatter`/`stringifyFrontmatter` (`lib/_shared.js:51-173`) already handle the flat YAML-subset frontmatter the CHECKPOINT artefact needs (`plan`, `last_completed_task`, `checkpoint_reason`, `committed_hashes`); no YAML parser dependency is required. [VERIFIED — read `lib/_shared.js:51-173`]
- Test scaffolding uses `node:test`, `node:assert/strict`, and the in-repo `FakeFs`/`realFsAdapter` (`test/helpers/fake-fs.mjs`), consistent with the zero-dependency invariant (`package.json` `"dependencies": {}`). [VERIFIED — read `package.json` and `test/helpers/fake-fs.mjs`]
- No external registry lookup is warranted; nothing new is introduced.

## Risks

- **Risk 1 — Live structured-output availability (MEDIUM).** Whether the in-process `spawn` subagent reliably populates `result.structured` for a real LLM executor is unverified in a live harness this session. Mitigation: (a) refine `EXECUTOR_PROMPT` to name the exact checkpoint shape so the executor emits it; (b) `gsd_execute` validates the returned `structured.checkpoint` and fails loud (D-05) if it is missing/out of range when a checkpoint stop is expected. Unit tests use a fake subagent that returns `structured` deterministically, decoupling the feature from live-LLM behaviour.
- **R2 — Hard-killed executor leaves no checkpoint (MEDIUM, scope-bound).** If a subagent is interrupted/killed *mid-task* (not at a `checkpoint:*` task), no structured return is captured, so no CHECKPOINT is persisted. This phase deliberately covers only executor-driven `checkpoint:*` stops (D-01/DUR-01). Documented as a limitation; genuine crash-recovery of an arbitrary mid-task interrupt is out of scope.
- **R3 — Resume correctness depends on task-index stability.** Resume assumes the plan's task boundaries are unchanged between runs. If a plan is edited between checkpoint and resume, `last_completed_task` could drift; D-05's range check (against current `task_count`) fails loud rather than silently re-running. [VERIFIED — `task_count` at `lib/state.js:419`]

## Open Questions

- **OQ-1 — Who writes the CHECKPOINT artefact? (RESOLVED)** The executor is a subagent with no `gsdState` access; the orchestrator (`gsd_execute`) must persist it. Flow: executor returns `structured.checkpoint` → `gsd_execute` calls `s.writeArtifact(cwd, phase, 'CHECKPOINT-<PP>', content)`. Blocking gone: `writeArtifact` already exists (`lib/state.js:370-376`) once `_artifactFile` knows `CHECKPOINT`.
- **OQ-2 — What is the structured checkpoint shape? (RESOLVED)** Derived from the D-01 frontmatter keys: `structured.checkpoint = { plan, last_completed_task, checkpoint_reason, committed_hashes }`. `plan` = the plan's full id (`<base>-<PP>`, matches `listPlans` ids); `last_completed_task` = integer N; `committed_hashes` = array of commit SHAs committed through task N. The persisted `CHECKPOINT-<PP>` frontmatter carries these keys verbatim. Blocking gone.
- **O-3 — How does `gsd_execute` distinguish a checkpoint stop from a completion? (RESOLVED)** Presence of `r.structured?.checkpoint` with the shape above → checkpoint stop (persist, do not mark complete). Absence → fall through to the existing SUMMARY probe (line 105). A completing executor emits no `checkpoint` sub-object, so no ambiguity.
- **O-4 — Must `EXECUTOR_PROMPT` change? (RESOLVED — YES, small).** To guarantee the executor returns a parseable shape, `EXECUTOR_PROMPT` (lines 158/168) should name the exact structured checkpoint keys (`plan`, `last_completed_task`, `checkpoint_reason`, `committed_hashes`). Without this, the agent only knows "return structured checkpoint state" and the orchestrator cannot rely on keys. Small edit, low risk.
- **O-5 — Stale-Checkpoint cleanup (D-06) (RESOLVED)** When a plan has both SUMMARY and CHECKPOINT, SUMMARY wins. The "checkpointed" predicate (`hasCheckpoint && !hasSummary`) already ignores it. For cleanliness per D-06 ("ignored/cleaned"), add a small `removeArtifact(cwd, phase, suffix)` method to `GsdState` (symmetric with `writeArtifact`/`readArtifact`/`hasArtifact`), invoked by `gsd_execute` on the SUMMARY-wins path. Blocking gone (method addition is additive; no existing caller regresses).
- **O-6 — Range check source (RESOLVED)** `task_count` is on each plan object returned by `listPlans` (`lib/state.js:419`), and `gsd_execute` already iterates those objects, so D-05 can compare `last_completed_task` against the plan's own `task_count` with no new plumbing. Blocking gone.
- **O-7 — Test strategy for resume (RESOLVED)** Use the existing `FakeFs` + fake-subagents harness (`test/tools.test.mjs`). The fake executor decides behaviour by probing whether a `CHECKPOINT-<PP>` already exists on the fake fs: first call returns `structured.checkpoint` (no SUMMARY → capture); second call (after checkpoint persisted) writes `SUMMARY-<PP>` (→ resume completes). This exercises real `gsd_execute` twice, fully offline. Blocking gone.

All Open Questions resolved → planning may proceed.

## Architectural Responsibility Map

| Capability | Tier | Where | Notes |
|---|---|---|---|
| CHECKPOINT artefact naming/mapping (`_artifactFile`) | **data** | `lib/state.js` (`_artifactFile`) | extend the per-plan suffix group to include `CHECKPOINT`; add `hasCheckpoint`/`readCheckpoint`/`removeArtifact` accessors. |
| Plan classification (`has_summary`, checkpointed vs complete) | **data** | `lib/state.js` (`planIndex`/`listPlans`) | already present; no change needed beyond exposing `task_count` (already exposed). |
| Consume `structured.checkpoint`, persist CHECKPOINT | **domain** | `lib/execute.js` (`gsd_execute`) | the phase's core domain work; read `r.structured`, validate shape, write artefact. |
| Resume skip semantics (`tasks 1..N done, begin N+1`) | **domain** | `lib/execute.js` | build + append `RESUME from checkpoint` instruction to the executor prompt (D-04). |
| Range + parse validation, fail-loud errors | **domain** | `lib/execute.js` | D-05; named errors following the bundle's existing fail-loud pattern. |
| Stale-checkpoint cleanup (D-06) | **domain** | `lib/execute.js` | invoke `removeArtifact` on the SUMMARY-wins path. |
| Executor checkpoint-return contract (prompt) | **presentation (agent-interface)** | `lib/_agents.js` `EXECUTOR_PROMPT` | refine to name the structured shape (O-4). |

No security-sensitive capability lands in the wrong tier — the checkpoint payload (plan id, task index, commit SHAs) is not security-bearing, and validation stays in the domain layer. **No tier BLOCKER.**

## Validation Architecture

Each behaviour is proved by `node --test` (npm `test`, `package.json`) against `FakeFs` + fake subagents — deterministic, no LLM/git/network:

| Behaviour (REQ) | Automated check | Location |
|---|---|---|
| `_artifactFile` maps `CHECKPOINT-01` → `<base>-01-CHECKPOINT.md` and round-trips read/has/remove (D-01) | `state.test.mjs`: `writeArtifact(CWD,1,'CHECKPOINT-01')` basename === `01-auth-01-CHECKPOINT.md`; `readArtifact`/`hasArtifact` round-trip; `removeArtifact` deletes. | `test/state.test.mjs` |
| Executor returns `structured.checkpoint` → `gsd_execute` persists CHECKPOINT and does NOT write SUMMARY; plan stays incomplete; STATE stays `execute` (DUR-01) | `tools.test.mjs` gsd_execute: fake executor returns `structured.checkpoint` (no SUMMARY); assert CHECKPOINT-01 exists, SUMMARY-01 absent, output contains "checkpoint". | `test/tools.test.mjs` |
| Resume skips completed tasks and completes (DUR-02) | `tools.test.mjs`: after CHECKPOINT-01 exists, fake executor writes SUMMARY; assert `01-auth-01 ✓`, plan `has_summary`, phase advances to `verify`. | `test/tools.test.mjs` |
| Resume instruction present in executor prompt (D-04) | Fake subagents capture the request; assert label prompt contains `RESUME from checkpoint` + `last_completed_task`. | `test/tools.test.mjs` |
| Corrupt/out-of-range checkpoint fails loud (D-05) | Seed malformed CHECKPOINT / `last_completed_task` ≥ `task_count`; assert `gsd_execute` rejects with a named `/checkpoint/` error. | `test/tools.test.mjs` |
| SUMMARY wins over stale CHECKPOINT + cleanup (D-06) | Seed SUMMARY + stale CHECKPOINT; assert plan runs as complete and stale CHECKPOINT removed. | `test/tools.test.mjs` |
| Existing suite stays green (MOUNT-06) | `npm test` — baseline 56 pass/0 fail; added tests keep it green. | npm test |

## Project Constraints (from project conventions)

- **Zero runtime dependencies** — `package.json` `"dependencies": {}`; only `node:` builtins + existing `@deepseek-ai/*` peer deps. No YAML/parser addition; reuse `parseFrontmatter`/`stringifyFrontmatter` (`lib/_shared.js`). [VERIFIED — read `package.json`, `lib/_shared.js:51-173`]
- **Faithful `.planning/` artefact schema + naming** — CHECKPOINT must be `<base>-<PP>-CHECKPOINT.md`; naming helpers are centralized in `GsdState._artifactFile`. [VERIFIED — read `lib/state.js:341-389`]
- **Fail-loud, named errors** — matches the bundle's existing guard pattern (e.g. `gsd_ship preflight failed:`). Corrupt-checkpoint handling follows it. [VERIFIED — read `lib/ship.js` guard usage via service-tools tests; see `test/service-tools.test.mjs`]
- **Executors run on the shared working tree** (no per-plan worktrees); the same-wave non-overlap guarantee keeps it safe. No change here. [VERIFIED — README "Faithfulness and scope"]
- **Test style** — `node --test` + `FakeFs` + `makeSubagents` canned-label pattern from `test/tools.test.mjs`/`test/service-tools.test.mjs`; no real LLM/git/gh in unit tests. [VERIFIED — read both test files]
- **Commit discipline** — one atomic commit per completed task, conventional-commit `{phase}-{plan}` scope; a checkpoint stop is an interrupt, so no summary commit for a checkpointed plan. [VERIFIED — `EXECUTOR_PROMPT` line 157; `_agents.js`]
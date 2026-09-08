---
phase: GSD-58-node-repair
plan: 01
subsystem: repair
tags: [node-repair, orchestrator, gap-closure, delegation, out-of-band, mount-surface]
dependency graph:
  requires: [gsd_plan gaps mode, gsd_execute gapsOnly filter, gsd_verify gaps mode, commitArtifacts seam, matchesGapClosure]
  provides: [gsd_repair tool, gsdRepair capability, /gsd-repair command, runRepairRounds shared helper, readVerificationStatus reader, ./repair export]
  affects: [lib/_capabilities.js, lib/commands.js, cordis.patch.yml, package.json, test/mount.test.mjs, test/_capabilities.test.mjs, test/helpers/mount-harness.mjs, test/phase-tools-git.test.mjs, test/render.test.mjs]
tech-stack: [ESM, node builtins, dsh-tools defineTool, GsdState artefact accessors, commitArtifacts git seam]
key-files:
  created: [lib/repair.js]
  modified: [lib/_capabilities.js, lib/commands.js, cordis.patch.yml, package.json, test/mount.test.mjs, test/_capabilities.test.mjs, test/helpers/mount-harness.mjs, test/phase-tools-git.test.mjs, test/render.test.mjs]
decisions: [D-01, D-02 (plan 02), D-03, D-04, D-05, D-06, D-07, D-08, D-10, D-11, D-12]
metrics:
  duration: 2026-09-08
  completed: 2026-09-08
  tokens: ~90k
  tasks: 3
  commits: 3
status: complete
---

# Phase 58 Plan 01: node-repair engine Summary

Delivered the phase-58 node-repair engine (CLH-08): a new standalone out-of-band orchestrator tool `gsd_repair` in `lib/repair.js` that, for a phase whose VERIFICATION.md status is exactly `gaps_found`, runs bounded automatic recovery rounds of gsd_plan(gaps) → gsd_execute(gapsOnly) → gsd_verify(gaps) by delegating IN-PROCESS to the registered tools (never forking them), accumulates `<NN>-REPAIR.md`, commits with scope `repair`, and never advances STATE itself — plus the full mount surface (gsdRepair capability descriptor, /gsd-repair command, patch row, package export, all count/name bumps) so the tool activates in a live session.

## What was done

**Task 1 — Tracer: gsd_repair end-to-end on a single round (commit e9eeed1):**
- Created `lib/repair.js` (397 lines, pure ESM, zero new runtime dependencies): exports `name`/`inject`/`apply` plus the locked shared helpers `runRepairRounds`, `readVerificationStatus`, `REPAIR_ROUND_BUDGET = 2`, and `ROUNDS_DOMAIN_MSG`.
- `readVerificationStatus(s, cwd, phaseNum)` returns the five-way status `{ passed | gaps_found | human_needed | missing-file | unparseable }` — deliberately NOT copying lib/verify.js's optimistic missing→gaps_found default (P2/R4), so D-04's three stop causes stay distinct.
- Local dual-shape `findTool(ctx, toolName)` mirroring lib/quick.js:43-47 (array + `.get()` service shapes), re-declared rather than imported to avoid a quick.js→autonomous.js→repair.js import cycle (OQ-4).
- Strict-order round (D-06) with artefact-state oracles, never output sniffing (P1): post-plan `listPlans()` runnable-fix-plan check via `matchesGapClosure(p.gap_closure) && !p.has_summary`; post-execute completeness check with the three-cause discriminator (CHECKPOINT-<PP> artefact → checkpoint/resume handoff; `GSD_AWAITING_HUMAN:` marker line surfaced verbatim (P5); else no-SUMMARY excerpt); post-verify readback through our own reader. Delegate-missing fails loud with the exact mvp-phase error shape.
- Trigger gate (D-04/D-05): `passed` → success no-op with zero delegate calls, no REPAIR.md, no commit; `human_needed`/`missing-file`/`unparseable` → stop with the distinct cause, zero delegates, but a rounds_run-0 stop-only REPAIR.md + scope-repair commit (OQ-7).
- REPAIR.md (D-10): read-modify-write append through `s.readArtifact`/`s.writeArtifact` only (DUR-06) — fenced frontmatter (phase / rounds_run / final_status) + one `## Round N` per round + `## Stop` on stop; a single `commitRepair()` site funnels every exit path that enters a repair attempt through `commitArtifacts(cwd, phase, { scope: "repair", phaseName })` with an injectable `gitFn` (D-12: no push, no gate bypass, fixed-argument git only).

**Task 2 — Bounded round budget machine + tool-result report (commit 8b07a65):**
- Generalized the single round into the bounded loop: `rounds` omitted → `REPAIR_ROUND_BUDGET` (2); explicit value pinned to 1..2 by the defensive guard (D-03) before any delegate call and before the write/commit epilogue.
- After each round's verify read: `passed` → recovered result with `roundsRun = attempts made`; `gaps_found` with budget remaining → next round; `gaps_found` exhausted → stop with the grep-stable classification phrase `repair budget exhausted` naming the phase's VERIFICATION.md as the remaining-gaps location (D-07). The phrase lives ONLY at the exhaustion site — every early-stop cause (D-11: no runnable fix plan, execute checkpoint/awaiting/no-SUMMARY, verify non-parseable) names its real cause and is never retried.
- Report shape (presentation discretion): summary line (roundsRun + finalStatus), per-round sections mirroring REPAIR.md, stop section with the real cause + any surfaced awaiting marker verbatim, and the repair-log path.

**Task 3 — Mount surface (commit 6f7dfb0):**
- `lib/_capabilities.js`: `gsdRepair` appended to `CAPABILITY_KEYS` (27→28) + TABLE row (`step: "repair"`, role `out-of-band`, tools `["gsd_repair"]`, commands `["gsd-repair"]`, order `NOT_LOOP_ORDERED`, produces `["REPAIR.md"]`, consumes `["VERIFICATION.md"]`) + order-comment note (phase-58 out-of-band action, not loop-ordered).
- `lib/commands.js`: `/gsd-repair` entry (hint `<N> [--rounds 1|2]`, `--rounds` flag idiom, usage error, agent-routing text) after gsd-add-tests; paired to `gsdRepair` automatically via the descriptor (no pairing code).
- `cordis.patch.yml`: `gsd-repair → @dsh-gsd/bundle/repair` insert row with a house-style comment, immediately after gsd-add-tests (parse order aligned with PATCH_ROWS).
- `package.json`: `"./repair"` exports subpath (resolves + dynamic-imports, asserted by the mount test).
- `test/helpers/mount-harness.mjs`: `{ id: "gsd-repair", sub: "repair" }` appended to `PATCH_ROWS` (26→27).
- `test/mount.test.mjs`: six count sites (37 tools / 34 commands / 28 keys / 33-with-gsdQuick-withdrawn / 27 insert rows / 37-schema), both EXPECTED name arrays, the full-set regression subset now includes `repair`, and all stale count comments/titles updated.
- `test/_capabilities.test.mjs`: 28-key assertion + `gsdRepair` in the enumeration.
- `test/phase-tools-git.test.mjs`: new `repair.js` static describe — imports commitArtifacts, `scope: "repair"` exactly once, NO inline git logic, and never advances STATE (D-01).
- `test/render.test.mjs` (deviation, see below): `informationEntries` expected list extended with `gsdRepair`.

## Verification

- Task 1: import smoke prints `repair module ok`, exit 0; all 10 acceptance greps pass (matchesGapClosure reused ×4/0 reimplementations, scope-repair ×1, fail-loud guard ×1, rounds-domain ×1, marker ×1, STATE-accessors ×0, no node:fs/promises + writeArtifact ×3, no `force:` ×0, no autonomous import ×0).
- Task 2: budget/domain import smoke exit 0; `REPAIR_ROUND_BUDGET = 2` ×1, budget phrase ×1 (exhaustion site only), domain text ×1 (ROUNDS_DOMAIN_MSG only), STATE-accessors ×0. Additionally a throwaway 14-scenario FakeFs behavioral smoke passed end-to-end (no-op, invalid-rounds, three gate stops, happy-path order+args, budget exhaustion with default 2 and rounds:1 override, no-fix-plan early stop, checkpoint stop, awaiting-marker surfacing, reader statuses, cross-invocation accumulation) — the temp file was removed and never committed.
- Task 3: `node --test test/mount.test.mjs test/_capabilities.test.mjs test/phase-tools-git.test.mjs` → 46 pass / 0 fail; `import('@dsh-gsd/bundle/repair')` → `gsd-repair`; **full `npm test` → 1047 pass / 0 fail** (baseline 1043 + 4 new phase-tools-git repair assertions).

## Decisions

- D-01: gsd_repair is a standalone out-of-band orchestrator tool + /gsd-repair command with one gsdRepair descriptor — no loop-step plugin, no STATE step, no removal-matrix churn; repair never advances STATE (static-asserted in test/phase-tools-git.test.mjs).
- D-03/D-07: hard-coded default budget 2; per-call `rounds` override validated to 1..2 at the tool layer (with `(got N)` suffix) and defensively in runRepairRounds — both referencing the single ROUNDS_DOMAIN_MSG constant.
- D-04/D-05: trigger gate distinguishes passed (no-op, nothing written) / gaps_found (proceeds) / human_needed / missing-file / unparseable (distinct stop causes, zero delegates, stop-only REPAIR.md + commit for the three non-passed stops).
- D-06/D-08: one round = plan({phase, gaps}) → execute({phase, gapsOnly}) → verify({phase, gaps}) in strict order, delegated through findTool + tool.execute — never force/mode flags, never a forked prompt or STATE write (static assertions prove no delegation-internals duplication surface and no inline git).
- D-07/D-11: budget exhaustion stops with the `repair budget exhausted` classification phrase; every in-round failure stops immediately with its real cause and never blind-retries; a mid-task execute failure hands off to the checkpoint/answer-decision_id resume path via the surfaced cause.
- D-10: REPAIR.md accumulates (read-modify-write, never truncates prior invocations), frontmatter maintained per write, committed once per invocation through the single scope-repair commit site on every exit path that enters a repair attempt.

## Deviations

- **test/render.test.mjs modified (not in plan `files_modified`):** the `informationEntries returns orient|jobs|onboarding|out-of-band in CAPABILITY_KEYS position` test hardcodes the out-of-band key list and asserts deep-equality; adding `gsdRepair` to CAPABILITY_KEYS made its expectation stale (the full suite failed 1046/1 until extended). This is the same class of hardcoded-count bump the plan's Task 3 performs in test/mount.test.mjs/test/_capabilities.test.mjs; the edit is limited to that one expected-list line plus its comment. All other scope stayed within the plan's file list.

## Known Stubs

_none_ — scanned lib/repair.js and the touched test files for TODO/FIXME/placeholder/XXX/skipped-test markers: no matches (the only "skipped" text in the diff surface is plan.js's pre-existing "researcher: skipped" log line, untouched by this plan).

## Threat Flags

_none_ — no new subprocess usage in lib/repair.js (no exec/execSync/spawn/shell/eval surface; all git rides the shared commitArtifacts fixed-argument-array seam); no secrets touched; all .planning/ I/O routes through GsdState/ctx.fs (DUR-06); no force-push, no gate bypass (D-12); the tool interpolates only phase numbers and tool-returned text into human-facing strings, never into shell commands.

## Self-Check: PASSED

- lib/repair.js exists (397 lines) with all seven required exports (import smoke exit 0); `./repair` resolves through package.json exports (`import('@dsh-gsd/bundle/repair')` → name `gsd-repair`).
- All three task commits exist on phase-58: e9eeed1 (Task 1), 8b07a65 (Task 2), 6f7dfb0 (Task 3); working tree clean.
- Mount surface verified by tests: 37 tools / 34 commands / 28 capability keys / 27 patch rows; `node --test test/mount.test.mjs test/_capabilities.test.mjs test/phase-tools-git.test.mjs` → 46 pass; full `npm test` → 1047 pass / 0 fail.

## TDD Gate Compliance

- Plan type is `execute` (not `tdd`): no RED→GREEN commit-ordering gate applies to this plan; all three commits are feat-scoped per task as the plan's <files> require. Behaviour was proven post-hoc by the 4 new static assertions in test/phase-tools-git.test.mjs plus the plan-03 test suite that follows.
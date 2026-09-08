---
phase: 59-review-fix-companion
plan: "02"
subsystem: code-review-fix-companion
tags: [code-review, fix-companion, fault-isolation, parse-gate, skip-and-continue, real-causes]
requires:
  - "GSD-59-review-fix-companion-01-SUMMARY.md — the anchor-edit runFixLoop, hash capture, and commits frontmatter this plan reworks"
  - "D-06/D-07/D-11/D-12 in GSD-59-review-fix-companion-CONTEXT.md — skip-and-continue, one attempt per finding, report shape"
  - "D-03/D-13 — the node --check parse gate with argument-array execFile and temp .mjs lifecycle"
  - "lib/_runner.js:8-32 — spawnSubagent's {output, stopReason, diagnostic, structured} result and the two verbatim infra error strings"
  - "lib/_git-artifacts.js:211-236 — commitSourceFiles never-throw warning contract"
  - "lib/preflight-verify.js — the injectable execFileFn + mkdtemp/rm temp-dir precedent"
provides:
  - "exported pure helper resolveFixStatus(appliedFixes, skippedFixes, fixUnavailable) → applied|skipped|unavailable (the D-06 decision table)"
  - "exported async helper parseGate(content, targetFile, execFileFn) → {ok, checked, cause?} — node --check on a temp .mjs under os.tmpdir(), rm in finally, non-JS targets skipped"
  - "exported excerpt(text, max = 400) diagnostic-truncation helper (repair.js:74 precedent) + setParseGateExecFileFn test seam"
  - "per-finding skip-and-continue fault isolation: spawn throws, non-completed stopReasons, and missing/invalid structured output each record ONE skipped finding with its real cause and never abort the run"
  - "fixer-infrastructure probe mirroring spawnSubagent's two checks verbatim — 'unavailable' reserved for exactly that fault class"
  - "OQ-5 restore-on-commit-warning and OQ-11 unresolved-hash note; auto re-review-fault stop (OQ-4)"
affects:
  - "lib/code-review.js — REVIEW-FIX.md status semantics and the fix loop's fault surface (reviewer path untouched)"
  - "test/code-review.test.mjs — the --fix/--auto harness (makeReviewFixSubagents gained failAt + result overrides) for future plans"
  - "gsd_verify / gsd_ship — REVIEW-FIX.md status semantics they may read (applied/skipped/unavailable)"
tech-stack: [node-esm, node-test, fake-fs-fake-ctx-offline-tests, execFile-argument-array, mkdtemp-tmpdir]
key-files:
  created: []
  modified:
    - lib/code-review.js
    - test/code-review.test.mjs
decisions:
  - "D-06: a per-finding fault (spawn throw, non-completed stopReason, missing/invalid structured output) records only that finding as skipped with its REAL cause — raw stopReason plus an excerpt(diagnostic || output) — and the loop continues; the whole-run fixUnavailable catch was removed from the per-finding path"
  - "OQ-1: only the literal stopReason 'completed' is success (lib/jobs.js:174 convention); host stopReason values are never enumerated — the raw value is surfaced verbatim in the cause"
  - "OQ-3: one upfront fixer-infrastructure probe at the top of runFixLoop mirrors spawnSubagent's two checks verbatim (service undefined from ctx.get('subagents') / getProvider('spawn') falsy), records every fixable finding 'unavailable' with the verbatim infra cause, and spawns nothing"
  - "D-07: exactly one fixer attempt per finding — test-proven via a spawn counter (2 fixable findings ⇒ exactly 2 fixer spawns, no retry)"
  - "D-03/OQ-10: parseGate writes the post-edit content to a REAL temp .mjs under mkdtemp(os.tmpdir(), 'gsd-parse-'), runs node --check via argument-array execFile(process.execPath, ['--check', tmp]), rm recursive+force in a finally; .md/.json targets get anchor validation only; the execFile seam is injectable (setParseGateExecFileFn) for fault tests"
  - "OQ-5: when commitSourceFiles returns a warning after a successful write, the pre-edit content is re-written (or the created file unlinked) so a 'fixed' row always implies a landed commit; the warning becomes the skip cause with no hash"
  - "OQ-11: a rev-parse HEAD failure after a landed commit keeps status 'fixed' with a 'commit hash unresolved: <message>' note rendered on the row — fixes_applied stays truthful and the commit is never downgraded to skipped"
  - "OQ-4: a faulted --auto re-review stops the iteration loop with autoNote 'stopped after iteration <n> — re-review faulted (<cause>)' and does NOT set fixUnavailable; accumulated fix results stand and resolveFixStatus computes the overall status; the max-iterations note is now guarded by !autoNote so it cannot overwrite the re-review note"
  - "Test-harness deviation (documented): the infra-fault test simulates the spawn provider unregistering itself after the reviewer's spawn instead of mounting subagents: null — a fully-missing service faults the REVIEWER too, which hits the locked D-08 --fix fail-fast before the fix loop can run; the probe is proven through its provider-missing branch (the other half of spawnSubagent's checks) while a separate test keeps the subagents:null ⇒ fail-fast contract"
metrics:
  duration: "~30 min (wall clock, session-local)"
  completed: "2026-09-08"
actuals:
  tokens: "~130000"
  tasks: 3
  commits: 3
status: complete
---

# Phase 59 Plan 02: Fix-Loop Fault Isolation + Parse Gate Summary

Made the --fix loop survive faults the way D-06 locks — per-finding skip-and-continue with real causes (raw stopReason + diagnostic excerpt), status semantics applied/skipped/unavailable with 'unavailable' reserved for fixer-infrastructure absence, the D-03 node --check parse gate with abort-before-write atomicity, OQ-5 commit-warning restore, OQ-11 unresolved-hash notes, and the OQ-4 auto re-review-fault stop.

## What Was Done

**Task 1 — skip-and-continue + real causes + resolveFixStatus + infra probe (commit efde494, feat):**
- `lib/code-review.js` — new exported helpers: `excerpt(text, max = 400)` (repair.js:74 precedent) for diagnostic truncation, `resolveFixStatus(appliedFixes, skippedFixes, fixUnavailable)` as the D-06 decision table as a pure function, and module constants `INFRA_SERVICE_CAUSE`/`INFRA_PROVIDER_CAUSE` carrying the two spawnSubagent error strings verbatim (lib/_runner.js:10,12).
- `runFixLoop` fault-path rework: the per-finding catch no longer sets the whole-run `fixUnavailable` — it records ONE skipped row with `(e && e.message) || String(e)` and continues (D-06 skip-and-continue). After a successful spawn, `fr.stopReason !== "completed"` records the finding skipped with `fixer did not complete (stopReason: <raw>) — <excerpt>`; missing/non-object `structured` records `fixer returned no structured output (stopReason: …) — <excerpt>`; a present-but-invalid status names the actual value. Exactly one fixer attempt per finding (D-07).
- Fixer-infrastructure probe at the top of runFixLoop, before the findings loop: `ctx.get("subagents")` undefined or `getProvider("spawn")` missing ⇒ every fixable finding pushed as an 'unavailable' row with the verbatim infra cause and nothing spawns (OQ-3).
- `writeReviewFixMd` now computes status via `resolveFixStatus` (replacing the never-'skipped' ternary) and adds a body note when status is 'skipped' that no fix landed and every skip's real cause is listed below.
- Tests: degrade test rewritten (plain fixer fault ⇒ frontmatter status "skipped" with real causes, never claims UNAVAILABLE); `makeReviewFixSubagents` extended with `failAt` (number|array of 0-based call indices) and `result` overrides (stopReason/diagnostic/structured); new suites: skip-and-continue (finding 1 faults, finding 2 lands ⇒ 'applied'), non-completed max-tokens stopReason with diagnostic excerpt asserted verbatim, malformed structured ({} and null) with real causes, one-attempt spawn-count proof (D-07), infrastructure fault ⇒ 'unavailable' with verbatim infra cause and zero fixer spawns, resolveFixStatus unit table, excerpt truncation units.

**Task 2 — parse gate + commit-outcome handling (commit 08e91df, feat):**
- `lib/code-review.js` — new exported async `parseGate(content, targetFile, execFileFn = execFileP)`: non-.js/.mjs targets return `{ok: true, checked: false}` (anchor validation only, no child process); .js/.mjs targets get a REAL temp copy via `mkdtemp(path.join(os.tmpdir(), "gsd-parse-"))` + `writeFile` (the sanctioned preflight-verify exception to artefacts-via-ctx.fs), `node --check` through `execFileFn(process.execPath, ["--check", tmp], {encoding: "utf8"})` — argument array, never shell interpolation — and `rm(dir, {recursive: true, force: true})` in a finally. Exec rejection ⇒ `{ok: false, cause: excerpt(stderr)}`. Injectable seam `setParseGateExecFileFn` (test-only, no surface change per D-10).
- Gate wired into runFixLoop after `applyAnchorEdits` succeeds and BEFORE `ctx.fs.writeText`: `!gate.ok` ⇒ finding skipped with `parse check failed: <cause>`, file byte-identical (D-03 abort-before-write).
- OQ-5: the content read now captures `existedBefore`; when `commitSourceFiles` warns after a successful write, the pre-edit content is re-written (or the created file unlinked, best-effort try/catch) so disk matches the report, and the warning becomes the skip cause with no hash — a 'fixed' row now always implies a landed commit.
- OQ-11: rev-parse HEAD failure after a landed commit keeps status 'fixed' and attaches `commit hash unresolved: <message>` to the row, rendered by writeReviewFixMd; fixes_applied stays truthful.
- Tests: real node --check pass/fail units (SyntaxError cause), temp-cleanup unit + tool-level cleanup assertion (recorded --check path gone after the run), extension routing (.md finding lands while a recording execFileFn proves zero node --check invocations), injected failing execFileFn ⇒ skipped with the parse cause, commit-warning restore (file byte-identical, 'nothing staged' as cause, commits empty), rev-parse failure ⇒ 'fixed' + unresolved-hash note with fixes_applied 1.

**Task 3 — auto re-review-fault stop + wording + phase-close gates (commit dee9fe4, fix):**
- `lib/code-review.js` — the --auto re-review branch: a faulted re-review no longer sets `fixUnavailable` (a reviewer fault is not a fixer-infrastructure fault); it sets `autoNote = " --auto: stopped after iteration <n> — re-review faulted (<cause>)."` and breaks with accumulated fix results standing; overall status comes from resolveFixStatus. The max-iterations autoNote gained a `!autoNote` guard so it cannot overwrite the re-review note. All other --auto mechanics byte-for-byte unchanged (D-05): MAX_ITERATIONS=3, re-review between rounds, REVIEW.md overwrite, early convergence, fixer-infra break.
- fixSummary: a skipped run now appends "Every skipped fix's real cause is recorded in REVIEW-FIX.md."; the addDecision line carries both counts + status, truthful for all three statuses.
- Tests: new re-review-fault suite — reviewer call 0 works, call 1 faults; run completes without throwing, reviewerCallCount 2, fixerCallCount 1, round-1 fix on disk with a hash, REVIEW-FIX.md status "applied" alongside REVIEW.md status "UNAVAILABLE" in the same run, result carries the stopped-on-rereview note; existing --auto call-count suites pass unchanged.
- Phase-close gates: full `npm test` green (1109 tests / 243 suites / 0 fail — baseline 1089 after plan 01 + 20 new); `node --test test/mount.test.mjs test/removal.test.mjs` green (37 tools / 34 commands / 28 capability keys / 27 patch rows unchanged — D-10).

## Verification
- `node --test test/code-review.test.mjs` — 82 tests / 12 suites, 0 fail (62 after plan 01 → 82: +7 skip-and-continue/real-cause units, +12 parse-gate/commit-outcome tests, +1 re-review-fault test, net of the rewritten degrade test).
- `node --test test/mount.test.mjs test/removal.test.mjs` — 30 tests, 0 fail (surface counts unchanged).
- `npm test` — **1109 tests / 243 suites / 0 fail**, ~3.6 s, offline.
- Acceptance greps verified: resolveFixStatus (export :233 → consumed :681→ now :871 after later edits), excerpt definition + skip-cause uses, `fixer did not complete`, infra probe subagents access with verbatim `_runner.js` cause strings, parseGate export + call site before writeText, `parse check failed`, `commit hash unresolved`, `mkdtemp`/`os.tmpdir()`/`"--check"` argument array, `re-review faulted`.

## Key Files
- `lib/code-review.js` (895 lines) — resolveFixStatus + parseGate + excerpt + infra probe + skip-and-continue loop + restore/unresolved-hash handling + auto re-review-fault stop.
- `test/code-review.test.mjs` (1638 lines) — extended harness (failAt/result overrides), 20 new tests across four describe blocks.

## Deviations
- **Infra-fault test mechanism:** the plan's action said "infrastructure fault via mountReview({ subagents: null })". A fully-missing subagents service faults the REVIEWER first (spawnSubagent's check 1), producing an UNAVAILABLE review that hits the locked D-08 --fix fail-fast throw — so the fix loop (and its probe) would never run. The implemented test simulates mid-run infrastructure loss instead: a subagents service whose `getProvider("spawn")` returns undefined after the reviewer's spawn completes. This exercises the probe's provider-missing branch (check 2, verbatim string) through the real tool flow with "run never throws", "status 'unavailable'", "every row unavailable with the infra cause", and "zero fixer spawns" all asserted. The service-missing branch remains covered by the probe's shared code path and the D-08 fail-fast test. No production behaviour deviation.
- **Commit-message scope:** used the orchestrator-instructed scope `GSD-59-review-fix-companion-02` (matching sibling plan 03's long form), not plan 01's short `59-01` form. Both identify the plan; no reword/rebase performed.

## Known Stubs
None. Grep for TODO/FIXME/placeholder/.skip/.todo over lib/code-review.js and test/code-review.test.mjs matches only prose (a comment describing what the excerpt helper avoids; "skipped" hits are the D-06 skip semantics themselves). No skipped or todo tests were introduced.

## Threat Flags
None raised. Threat posture of this change (informational): the parse gate spawns `node --check` exclusively through a FIXED argument array (`process.execPath, ["--check", tmp]`) — never shell interpolation, so content cannot inject shell syntax; the temp copy lives under `mkdtemp(os.tmpdir(), "gsd-parse-")` (never inside the workspace/.planning/, so it cannot be staged by commitArtifacts) and is always removed in a finally; non-JS targets skip the child process entirely; path targeting remains guarded by the plan-01 `validateFiles` defense-in-depth; `excerpt` bounds untrusted diagnostic text embedded into reports at 400 chars; the parse-gate execFile seam is a module-level test hook that defaults back to the promisified execFile when called with null.

## TDD Gate Compliance
This plan is `type: execute` (not `type: tdd`) — no test-first RED/GREEN commit gate applies. Each task's commit is atomic to its declared `<files>` set (lib/code-review.js + test/code-review.test.mjs only); no commit touches files outside the plan's `files_modified` list.

## Self-Check: PASSED
- Created/modified files exist: lib/code-review.js (895 ≥ 680 min), test/code-review.test.mjs (1638 ≥ 1000 min).
- Commits exist: efde494, 08e91df, dee9fe4 — one per task, conventional prefixes, scope GSD-59-review-fix-companion-02; `git status` clean after the final commit.
- must_haves exports verified: `resolveFixStatus`, `parseGate`, `excerpt` (and `setParseGateExecFileFn`) all exported from lib/code-review.js.
- key_links verified in lib/code-review.js: `--check` argument-array child-process call (parseGate → node --check); `stopReason` surfaced from the spawnSubagent result into skip causes; `resolveFixStatus` consumed by writeReviewFixMd for the REVIEW-FIX.md frontmatter status.
- Both <verify> commands exited 0 (per-task suites + full npm test + mount/removal gates).

*Phase: 59-review-fix-companion*
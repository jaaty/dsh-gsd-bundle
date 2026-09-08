---
phase: GSD-59-review-fix-companion
plan: 03
subsystem: gitfn-guards
tags: [live-host-guards, ctx-gitfn, defaultGitFn-fallback, throwing-getter-test, scope-lock, crash-class]
dependency graph:
  requires: [lib/_git-artifacts.js commitSourceFiles/commitArtifacts/defaultGitFn seam, lib/code-review.js:448-449 canonical guard template, test/helpers/mount-harness.mjs makeMountCtx/makeExec/CWD, test/helpers/fake-fs.mjs FakeFs, add-tests/pause-resume/next-integration fixture patterns]
  provides: [guarded ctx.gitFn fallbacks at all three D-09 sites (add-tests commit feed, pause_work gather, next advance branch), test/gitfn-guards.test.mjs throwing-getter harness simulating the live cordis uninjected-property-access throw class]
  affects: [lib/add-tests.js, lib/core-tools.js, test/gitfn-guards.test.mjs]
tech-stack: [ESM, node builtins, try/catch guarded property access, Object.defineProperty throwing getter, node:test FakeFs integration harness, commitSourceFiles/commitArtifacts never-throws warning paths]
key-files:
  created: [test/gitfn-guards.test.mjs]
  modified: [lib/add-tests.js, lib/core-tools.js]
decisions: [D-09, D-10]
metrics:
  duration: 2026-09-08
  completed: 2026-09-08
  tokens: ~55k
  tasks: 2
  commits: 2
status: complete
---

# Phase 59 Plan 03: guard the three live-host ctx.gitFn crash sites Summary

Wrapped the three D-09-locked unguarded `ctx.gitFn` accesses — lib/add-tests.js:336 (gsd_add_tests commit feed), lib/core-tools.js:465 (gsd_pause_work gather), lib/core-tools.js:657 (gsd_next advance branch) — with the exact canonical fallback template from lib/code-review.js:448-449 (`let gitFn = defaultGitFn; try { gitFn = ctx.gitFn || defaultGitFn; } catch { /* not injected — use default */ }`), and proved each site completes via defaultGitFn under a new throwing-getter test harness that reproduces the live cordis uninjected-property-access throw the plain fake ctx never does, with the out-of-scope census sites (repair.js:441, undo.js:227, validate-phase.js:557, phase-management-plugin.js:110, autonomous.js:291) verified untouched per D-10.

## What was done

**Task 1 — guard gsd_add_tests + the throwing-getter harness (commit 5316874):**
- `lib/add-tests.js` (site 1, now line 341): replaced the bare `const gitFn = ctx.gitFn || defaultGitFn;` with the canonical template — `let gitFn = defaultGitFn;` plus the try/catch assignment carrying the not-injected catch comment, headed by a comment mirroring the code-review.js wording (gitFn is not a host-provided service; the guarded access still honours a host-provided gitFn when present). The `commitSourceFiles` call and everything else in the file are untouched; no inject-array change (gitFn is not a host service, D-09/D-10).
- `test/gitfn-guards.test.mjs` (created, 254 lines): offline suite (FakeFs + fake ctx + fake writer subagents; no live boot/LLM/real repo) whose header documents the crash class. The harness replicates test/add-tests.test.mjs's mount fixture (makeMountCtx + applyState + applyAddTests + a bootstrapped completed phase 50) and replaces the usual `ctx.gitFn = fakeGit` assignment with `Object.defineProperty(ctx, "gitFn", { get() { throw … }, configurable: true })` — the live throw class makeMountCtx's plain-object ctx never produces. Two tests: (a) throwing-getter ctx → gsd_add_tests completes with `generated 1 test file(s)`, the guard routes to defaultGitFn whose git calls fail against the fake cwd `/project`, degrading through commitSourceFiles's never-throw warning path (`Artefacts committed: false` + `WARNING: git add failed:` in the result), and the writer's test file + ATEST report are still written; (b) plain fake ctx (`ctx.gitFn` undefined) → the `|| defaultGitFn` half of the guard routes to the same degradation, proving both guard halves.

**Task 2 — guard gsd_pause_work + gsd_next advance + census scope lock (commit 95fce23):**
- `lib/core-tools.js` site 2 (gsd_pause_work gather, now line 470): same canonical template immediately before the existing `try { git status --porcelain } catch { uncommitted = [] }` porcelain block, so the status feed and the `commitArtifacts` WIP call at line 500 both consume the guarded local.
- `lib/core-tools.js` site 3 (gsd_next advance branch, now line 667): introduced the guarded local between `s.setActivePhase(...)` and the `commitArtifacts(...)` call, replacing the inline fourth argument `ctx.gitFn || defaultGitFn` with the guarded local.
- `test/gitfn-guards.test.mjs` extended: a gsd_pause_work test (mount pattern from test/pause-resume.test.mjs) asserting completion under the throwing-getter ctx, `uncommitted_files: []` in the written HANDOFF.json (the porcelain catch path degraded via defaultGitFn's failure), and `Committed as WIP: no`; a gsd_next `advance:true` test (mount pattern from test/next-integration.test.mjs: applyDiscuss + applyCommands, phase 1 Complete + phase 2 pending roadmap) asserting completion, the `run discuss-phase` recommendation rendering, and STATE re-pointed (active_phase 2, status discuss) — proving the advance branch ran fully past the guarded commit call.
- **Scope lock (D-10)**: grep census confirms the three in-scope sites guarded (1 in add-tests.js, 2 in core-tools.js) and the five out-of-scope sites byte-unchanged (lib/repair.js:441, lib/undo.js:227, lib/validate-phase.js:557, lib/phase-management-plugin.js:110, lib/autonomous.js:291 — the latter explicitly deferred in CONTEXT). Every remaining `ctx.gitFn` occurrence in the scoped files is either the guarded try-assignment itself or a comment line; no bare access remains. No inject array touched; no tool/command/capability/config key added or removed.

## Verification

- `node --test test/gitfn-guards.test.mjs` — 4 tests, all pass (throwing-getter proofs for all three D-09 sites + the undefined-ctx contrast).
- `node --test test/add-tests.test.mjs` — 22 tests pass (existing suites unaffected by the site-1 guard).
- `node --test test/gitfn-guards.test.mjs test/pause-resume.test.mjs test/next-integration.test.mjs` — 38 tests, 0 fail (site-2/site-3 suites green alongside the new guard tests).
- `node --test test/mount.test.mjs test/removal.test.mjs` — 30 tests, 0 fail (37 tools / 34 commands / 28 capability keys / 27 patch rows invariant holds — D-10).
- Acceptance greps: guard template count = 1 in lib/add-tests.js, exactly 2 in lib/core-tools.js; census sites unchanged; `defineProperty` throwing-getter present in the test harness.
- Working-tree note: `lib/code-review.js` is modified in the shared tree by a sibling wave-1 plan (01/02) — deliberately untouched and excluded from both commits of this plan (no shared files, per the plan objective).

## TDD Gate Compliance

Not applicable — this plan is `type: execute` (not `type: tdd`); both commits pair the fix with its proving tests in the same task commit.

## Known Stubs

None. No TODO/FIXME/placeholder/skipped-test markers in the changed files (grep-verified).

## Threat Flags

None raised. The change adds no input parsing, no shell interpolation, no new fs/network surface: guards only wrap a property access in try/catch and route to the existing argument-array-only `defaultGitFn` seam. The throwing-getter harness uses `Object.defineProperty` on the fake test ctx only (configurable, test-local).

## Self-Check: PASSED

- Created files exist: test/gitfn-guards.test.mjs (254 lines ≥ min 60).
- Modified files exist: lib/add-tests.js (394 lines ≥ min 389), lib/core-tools.js (708 lines ≥ min 690).
- Commits exist: 5316874 (Task 1), 95fce23 (Task 2) on branch phase-59; each contains exactly its task's <files>.
- Key links verified: the `try { gitFn = ctx.gitFn || defaultGitFn; } catch` pattern at all three sites; the guarded locals feed commitSourceFiles (add-tests) and the porcelain status + both commitArtifacts feeds (core-tools); the test harness reproduces the live throw class via defineProperty.
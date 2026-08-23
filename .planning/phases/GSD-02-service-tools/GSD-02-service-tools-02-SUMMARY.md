---
phase: 02-service-tools
plan: 02
subsystem: test/service-tools
tags: ["test", "mount-04", "smoke", "execute-smoke"]
requires: ["lib/core-tools.js", "lib/quick.js", "lib/ui.js", "lib/verify.js", "lib/ship.js", "lib/_runner.js", "test/helpers/fake-fs.mjs", "test/helpers/project.mjs"]
provides: ["test/service-tools.test.mjs — MOUNT-04 execute() smoke calls for 5 gap tools + gsd_ship guard"]
affects: []
tech-stack: ["node:test", "node:assert/strict", "node:os", "node:path", "node:fs/promises", "@dsh-gsd/bundle/lib/*"]
key-files:
  created: ["test/service-tools.test.mjs"]
  modified: []
decisions:
  - "D-01: gap-focused — only the 5 untested tools get execute() smokes; the 6 already-tested tools are not re-tested"
  - "D-03: tools f-able on the fake host get a real success-path smoke; infra-bound gsd_ship gets a reachable fail-loud guard"
  - "D-04: offline on FakeFs/fake-ctx; gsd_quick is the one exception — it needs a real temp cwd (OQ-1) because it writes TASK.md via node:fs/promises, bypassing ctx.fs"
  - "OQ-2: the literal D-03 gh-auth string is unreachable in this env (gh installed + authed); the branch-gate guard ('could not determine current branch') stands in as the equivalent fail-loud preflight proof"
metrics:
  duration: "~25min"
  completed: "2026-08-23"
  tasks: 3
  commits: 3
status: complete
---

# Phase 02 Plan 02: service-tools Execute Smokes Summary

Proved MOUNT-04: every gsd_* phase tool with no existing execute test now has an execute() smoke call (gsd_new_milestone, gsd_progress, gsd_quick, gsd_ui_phase, gsd_verify), and gsd_ship's fail-loud preflight guard is smoked.

## What was built

A new `test/service-tools.test.mjs` (267 lines) porting the canonical `registerTool`/`makeCtx`/`makeSubagents` harness from `tools.test.mjs` (D-04), extended with three new canned subagent branches (`ui-researcher`, `ui-checker`, `quick`) required by the gap tools. Seven tests across six describe blocks:

1. **gsd_new_milestone** — appends a phase to ROADMAP (`phases.length === 2`, `phases[1].n === 2`, `milestoneName === "M2"`) and updates STATE milestone (`frontmatter.milestone === "v2.0"`).
2. **gsd_progress** — renders `# GSD PROGRESS` + a `Phase 01 auth` line without throwing; phase-scoped call seeds a PLAN and lists `Phase 1 plans`.
3. **gsd_ui_phase** — fake `ui-researcher` (≥50 chars) + `ui-checker` ("VERIFICATION PASSED") → returns `/gsd_ui_phase complete/`, writes `01-auth-UI-SPEC.md`, advances STATE to `plan`.
4. **gsd_verify** — seeded PLAN-01 + SUMMARY-01 + fake verifier writing `status: passed` → returns `/Phase 1 verified/`, writes `01-auth-VERIFICATION.md`, advances STATE to `ship`.
5. **gsd_quick** — real temp cwd (`os.tmpdir()` + `realFsAdapter`) because gsd_quick writes TASK.md via `node:fs/promises` (OQ-1) → returns `/gsd_quick done/`, TASK.md read back from the real filesystem; cleaned up in `try/finally`.
6. **gsd_ship** — seeds a passed VERIFICATION then asserts `/gsd_ship preflight failed:/` on the non-repo FakeFs cwd (the reachable branch-gate guard, D-03/OQ-2).

## Verification

- `node --test --test-name-pattern="gsd_(new_milestone|progress)" test/service-tools.test.mjs` → 3 pass, 0 fail
- `node --test --test-name-pattern="gsd_(ui_phase|verify)" test/service-tools.test.mjs` → 2 pass, 0 fail
- `node --test --test-name-pattern="gsd_(quick|ship)" test/service-tools.test.mjs` → 2 pass, 0 fail
- Full suite `node --test test/*.test.mjs` → 56 pass, 0 fail (41 baseline + 8 from plan 02-01 + 7 from this plan)

## TDD Gate Compliance

This plan is type `execute` (not `tdd`); no RED/GREEN gate required. All three tasks were auto-type with verify commands run before each atomic commit.

## Known Stubs

None. No TODO/FIXME/placeholder/skipped tests.

## Threat Flags

None. The test file introduces no new runtime dependencies (zero-dep invariant preserved — D-04). The gsd_quick smoke uses a real temp directory under `os.tmpdir()` with `recursive: true, force: true` cleanup; no persistent filesystem effects. The gsd_ship guard test runs entirely on FakeFs and never invokes real git/gh.

## Research-justified adaptation (OQ-2)

The literal D-03 `gh CLI not available or not authenticated` string is **unreachable** in this environment (`gh` is installed AND authenticated). On a non-repo FakeFs cwd (`/project`), the earlier branch gate fires first ("could not determine current branch"). The branch-gate guard is the equivalent fail-loud preflight proof of the same D-03 pattern (a clean named preflight error) and is recorded here so a future reader does not read the substitution as D-03's gh-string branch being fully satisfied — the guard *pattern* is proven, not the exact gh-string branch. See RESEARCH.md R2/OQ-2.

## Self-Check: PASSED

- `test/service-tools.test.mjs` exists (267 lines, ≥120 min_lines).
- Three commits exist on branch `phase-1`:
  - `0b3cbe7` test(02-02): harness + pure-state smokes
  - `ef2e036` test(02-02): spawn-based success-path smokes
  - `73db651` test(02-02): gsd_quick real-temp-cwd smoke + gsd_ship guard
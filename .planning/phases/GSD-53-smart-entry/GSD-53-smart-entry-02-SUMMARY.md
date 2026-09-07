---
phase: 53-smart-entry
plan: 02
subsystem: smart-entry orientation tool + command + capability wiring
tags: ["smart-entry", "gsd_next", "routing", "auto-advance", "CLH-02", "CLH-03"]
requires: ["lib/_next.js (classifyNextState, renderNextRecommendation) — plan 01", "lib/state.js (gsdState accessors, setActivePhase)", "lib/_git-artifacts.js (commitArtifacts)", "lib/_render.js (availableCapabilities)", "lib/_shared.js (parseFrontmatter)"]
provides: ["gsd_next tool (lib/core-tools.js)", "/gsd-next command (lib/commands.js)", "gsdOrient.tools/commands extension (lib/_capabilities.js)"]
affects: ["test/mount.test.mjs (count reconciliation)", "test/_capabilities.test.mjs (gsdOrient arrays)", "test/ship.test.mjs (cwdOf-site count)", "test/removal.test.mjs (gsd-core-tools retirement)"]
tech-stack: ["node:test", "node:assert/strict", "ESM", "FakeFs"]
key-files:
  created:
    - "test/next-integration.test.mjs"
  modified:
    - "lib/core-tools.js"
    - "lib/commands.js"
    - "lib/_capabilities.js"
    - "test/mount.test.mjs"
    - "test/_capabilities.test.mjs"
    - "test/ship.test.mjs"
    - "test/removal.test.mjs"
decisions:
  - "D-01: gsd_next tool + /gsd-next command pairing (tool+command convention); gsd_status/gsd_progress stay read-only."
  - "D-02: auto-advance re-points STATE (active_phase/status/next_action) via setActivePhase and commits, but does NOT auto-run the next tool — the returned text names the command to invoke."
  - "D-03: execute ordering is classify-then-mutate-then-render; the pure classifier (plan 01) decides the branch + mutation, the execute path applies it."
  - "D-05: paused-handoff detection reads the .planning/ root .continue-here.md first, then scans every phase dir via listPhaseDirs + readContinueHere, so a lone phase-dir pointer (HANDOFF.json deleted) still routes to gsd_resume_work."
  - "D-06: routing reuses availableCapabilities + classifyNextState (which calls effectiveRoutableStep) as the single capability-aware source of truth; absent capabilities degrade to the gsd_status fallback."
  - "D-08: branch 5 sets the lowest-numbered pending phase active at step 'discuss' (or 'spec' when gsdSpec is present)."
  - "OQ-4: branch 5 mirrors gsd_new_milestone — NO ensurePhaseBranch; commits via commitArtifacts(cwd, phaseNum, { scope, phaseName }) and never throws on a commit warning."
  - "Never-advances-STATE invariant: branches 1,2,3,4,6 never call setActivePhase or commitArtifacts under any advance value."
metrics:
  duration: "single session"
  completed: "2026-09-07"
  tests: 11
  commits: 3
status: complete
---

# Phase 53 Plan 02: gsd_next Tool + /gsd-next Command Summary

Wired the gsd_next smart-entry tool and /gsd-next slash command into the existing orientation tier, reusing the pure classifier from plan 01. The tool's execute path gathers a state snapshot via gsdState accessors, calls classifyNextState, applies the optional branch-5 setActivePhase mutation (guarded by the advance flag), commits via commitArtifacts, and returns renderNextRecommendation text. gsdOrient now advertises gsd_next/gsd-next so the tool+command pairing and the never-instruct-a-missing-tool gate hold.

## What was built

### lib/core-tools.js (gsd_next tool, +~85 lines)
- Imported `classifyNextState` and `renderNextRecommendation` from `./_next.js`, and `parseFrontmatter` from `./_shared.js`.
- Registered `gsd_next` inside `apply(ctx)` after `gsd_resume_work`. Parameters: `advance: boolean`. The async execute closure:
  - Gathers the snapshot via `s.readProject/readState/readRoadmap/readHandoff`, each wrapped in `.catch(() => undefined)` so a corrupt project degrades to the corrupt branch rather than crashing (D-03).
  - Paused-handoff detection (D-05): reads the `.planning/` root `.continue-here.md` first; when undefined, iterates `s.listPhaseDirs(cwd)` and scans each phase dir via `s.readContinueHere(cwd, d.name)`, breaking on the first defined result — so a lone phase-dir `.continue-here.md` (HANDOFF.json deleted) still routes to `gsd_resume_work`.
  - Milestone-audit read-back (D-09): when a roadmap exists, reads `s.readMilestoneArtifact(cwd, milestoneName)` and parses the frontmatter status via the canonical `parseFrontmatter` (no inlined YAML scanner); tolerates a missing/corrupt audit.
  - Computes `hasProject = !!(project || state || roadmap)` (OQ-1: distinguishes branch 1 from branch 2).
  - Calls `classifyNextState(snapshot, availableCapabilities((k) => ctx.get(k)))`.
  - D-02 / D-03 mutation: when `result.mutation.setActivePhase` is present and `args.advance` is truthy, calls `s.setActivePhase(cwd, phaseNum, step)` then `commitArtifacts(cwd, phaseNum, { scope: "next", phaseName: String(phaseNum) }, ctx.gitFn || defaultGitFn)` (mirrors gsd_new_milestone — no ensurePhaseBranch, never throws on a commit warning). When mutation present but advance falsy, returns the recommendation augmented with a note to re-run with `advance:true` (no mutation). When mutation is null (branches 1,2,3,4,6), returns `renderNextRecommendation(result)` unchanged — STATE untouched.

### lib/commands.js (gsd-next command)
- Added a `gsd-next` COMMANDS entry (before gsd-autonomous) paired to gsdOrient via the capability `commands` array, following the tool+command pairing convention (D-01).

### lib/_capabilities.js (gsdOrient extension)
- Appended `"gsd_next"` to `gsdOrient.tools` and `"gsd-next"` to `gsdOrient.commands`, so the DEGR-03 command pairing and the persona's never-instruct-a-missing-tool gate hold; retiring gsd-core-tools withdraws both.

### test/next-integration.test.mjs (new, 307 lines, 10 tests)
Mounts state + core-tools + commands + the loop plugins each branch needs (FakeFs + fake gitFn). Covers: (1) no-project → gsd_init; (2) mid-phase → plan-phase, STATE byte-identical; (3) auto-advance discuss → re-points to phase 2 (active_phase/status/next_action) + commits; (4) auto-advance spec variant → step spec, text names spec-phase; (5) advance:false → STATE unchanged + re-run note; (6) milestone-complete → gsd_milestone_audit, then ready-to-close → gsd_new_milestone, STATE untouched; (7) corrupt (ROADMAP but no STATE) → gsd_health; (8) paused via HANDOFF.json → gsd_resume_work; (8b) paused via lone phase-dir `.continue-here.md` (no HANDOFF) → gsd_resume_work (D-05); (9) never-advances-STATE invariant aggregated across branches 1,2,3,4,6 × advance true/false with deepEqual frontmatter before/after.

### Count/array reconciliation
- test/mount.test.mjs: 31→32 tools, 28→29 commands, 27→28 subset commands, EXPECTED_TOOL_NAMES (+gsd_next), EXPECTED_COMMAND_NAMES (+gsd-next), and the schema-test tool count.
- test/_capabilities.test.mjs: gsdOrient.tools/commands exact arrays extended.
- test/ship.test.mjs: cwdOf-site count 7→8 (gsd_next adds one `cwdOf(exec)` call).
- test/removal.test.mjs: new `gsd-core-tools` retirement describe asserting gsd_next + /gsd-next + gsdOrient are unregistered (DEGR-05).

## Acceptance criteria status
All task acceptance criteria satisfied:
- Task 1: gsd_next/gsd-next in _capabilities, name entries in commands/core-tools, classifyNextState+renderNextRecommendation imported, mount counts 32/29, npm test green ✓
- Task 2: setActivePhase + commitArtifacts in gsd_next closure, args.advance, parseFrontmatter from ./_shared.js, D-02 doc, node --check + npm test green ✓
- Task 3: 10 integration tests, never-advances/deepEqual, ready-to-close, advance:true, writeContinueHere, removal gsd-next assertion, npm test green ✓

## Known Stubs
None. No TODO/FIXME/placeholder/skipped tests in the produced/modified files.

## Threat Flags
None. gsd_next performs no shell interpolation, no git operations of its own (commitArtifacts uses fixed `-C cwd` arg arrays), and no subagent spawning. Its only authority is one `setActivePhase` call (branch 5, advance-gated) routed through the existing mutator. It never edits ROADMAP/REQUIREMENTS and never auto-runs a step tool (D-02). All gsdState accessor calls are wrapped in `.catch` so a corrupt/missing file degrades to undefined rather than crashing; the classifier already treats undefined state/roadmap as the corrupt branch.

## TDD Gate Compliance
This plan is `type: execute` (not `type: tdd`), so the tdd_audit ship gate does not apply. Commits follow the conventional-commit prefix with `(53-02)` scope: feat (Task 1 + Task 2) and test (Task 3), one commit per completed task.

## Self-Check: PASSED
- lib/core-tools.js exists (671 lines ≥ 600 min_lines) ✓
- lib/commands.js exists (430 lines ≥ 430 min_lines) ✓
- lib/_capabilities.js exists (375 lines; gsdOrient arrays extended with gsd_next/gsd-next) ✓
- test/next-integration.test.mjs exists (307 lines ≥ 120 min_lines) ✓
- 3 commits exist on phase-53 branch (5025094, 5608c86, d5868fd) ✓
- Full project suite: 1009 tests, 1009 pass, 0 fail ✓
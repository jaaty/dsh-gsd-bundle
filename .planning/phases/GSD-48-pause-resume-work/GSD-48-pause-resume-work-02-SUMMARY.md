---
phase: 48-pause-resume-work
plan: 02
subsystem: pause-resume
tags: [pause, resume, handoff, tools, tdd]
requires: [GSD-48-pause-resume-work-01]
provides: [lib/core-tools.js gsd_pause_work + gsd_resume_work]
affects: [lib/core-tools.js, lib/state.js, test/pause-resume.test.mjs, test/helpers/fake-fs.mjs, test/ship.test.mjs]
tech-stack: [node, esm, node:test, FakeFs, mount-harness]
key-files:
  created:
    - test/pause-resume.test.mjs (integration block appended)
  modified:
    - lib/core-tools.js
    - lib/state.js
    - test/helpers/fake-fs.mjs
    - test/ship.test.mjs
decisions:
  - D-01: tools + slash commands, no new capability
  - D-02: HANDOFF.json + .continue-here.md handoff set
  - D-03: phase-or-default context detection
  - D-04: resume is advisory, updates Session Continuity
  - D-05: HANDOFF.json one-shot deletion
  - D-06: WIP commit via commitArtifacts seam
  - D-07: async-jobs recorded in handoff
  - D-09: fail-fast on env faults, graceful degrade otherwise
  - D-10: TDD
metrics:
  duration: ~25m
  completed: 2026-09-03
  actuals:
    tokens: ~0
    tasks: 2
    commits: 2
status: complete
---

# Phase 48 Plan 02: pause-resume-work — the two tools

Registers the two utility tools — `gsd_pause_work` and `gsd_resume_work` — in
lib/core-tools.js, wiring the Plan-01 pure helpers and state accessors into the
full pause/resume behaviour: phase detection, state gathering, HANDOFF.json +
.continue-here.md writes, WIP commit, resume consumption + deletion, fallback
detection, and advisory no-mutation.

## Execution Deviation

The fresh-context executor for this plan hit `stopReason=max-tokens` twice
without writing any commit or SUMMARY (the plan is large: two tasks, each
~120 lines of tests + ~120 lines of tool implementation). Rather than re-run the
identical failing call, the driver completed the plan's work directly, following
the plan's TDD ordering and acceptance criteria exactly. This is recorded here
for the verifier.

## TDD Gate Compliance

Compliant. The plan is `type: tdd`. The first scope-matching commit is
`test(48-02)` (the integration tests), followed by one `feat(48-02)` commit. The
tdd_audit ship gate's first-scope-matching-commit-is-test: requirement is met.

## What was built

- **lib/core-tools.js** — `gsd_pause_work` and `gsd_resume_work` registered via
  `ctx.tools.register(defineTool(...))`. `gsd_pause_work` detects the active
  phase (lists phase dirs, marks hasPlan by listing each dir for a `*-PLAN.md`,
  sorts most-recent-first), gathers state (position, completed/remaining plans,
  decisions, blockers, non-terminal async jobs, uncommitted files via the
  `ctx.gitFn || defaultGitFn` porcelain call, next_action), writes HANDOFF.json +
  .continue-here.md, and issues a WIP commit via `commitArtifacts`. `gsd_resume_work`
  reads HANDOFF.json, renders a status, updates Session Continuity, and deletes
  the one-shot handoff; falls back to detecting PLAN-without-SUMMARY and
  .continue-here files; returns a clean "nothing to resume" when there is none.
  Both fail-fast on environmental faults (mirroring graphify.js) and never
  advance the loop position (D-04).
- **lib/state.js** — `deleteHandoff` re-routed through `ctx.fs.unlink` (DUR-06)
  so it works over both the real fs and the FakeFs test adapter (previously used
  raw `node:fs/promises` unlink, which silently failed over FakeFs).
- **test/helpers/fake-fs.mjs** — added an `unlink` method to both `FakeFs` and
  `realFsAdapter` to support the routed deletion.
- **test/pause-resume.test.mjs** — integration describe block (mount-harness +
  FakeFs + fake gitFn) covering both tools: phase-vs-default detection, both
  handoff files, WIP commit, async-job recording, resume consumption + deletion,
  fallback detection, advisory no-mutation, and no-project rejection.
- **test/ship.test.mjs** — the `cwdOf(exec)` site count in core-tools.js updated
  5→7 (two new tools each add a `cwdOf(exec)` site).

## Key decisions applied

- **D-01:** tools only — no new capability key, no loop-step.
- **D-02/D-03:** handoff set written at the phase-dir path when a phase is
  active, else `.planning/` root.
- **D-04:** resume is advisory — updates Session Continuity, never mutates
  `frontmatter.status`/`next_action`.
- **D-05:** HANDOFF.json is one-shot — deleted after a successful resume consumes
  it; the nothing-to-resume path never deletes.
- **D-06:** WIP commit via the shared `commitArtifacts` seam with the
  `wip: pause-work handoff` message override.
- **D-07:** non-terminal async jobs recorded in the handoff with the derived
  `gsd_job status <id>` resume command.

## Known Stubs

None. No TODO/FIXME/placeholder markers or skipped tests were introduced.

## Threat Flags

None. No shell-string execution (all git calls use fixed argument arrays via the
gitFn seam). No secrets. No capability surface change (D-01). The `.continue-here.md`
path is derived from ROADMAP phase dirs, never from raw user input. HANDOFF.json
is parsed with try/catch and degrades on corrupt input.

## Self-Check: PASSED

- `lib/core-tools.js` contains both tools; all plan-02 acceptance-criteria greps
  match (gsd_pause_work, gsd_resume_work, detectActivePhase, buildHandoff,
  renderContinueHere, mapAsyncJobs, commitArtifacts(cwd, wip: pause-work handoff,
  renderResumeStatus, updateContinuity, deleteHandoff, detectIncompleteWork,
  nothing to resume).
- `node --test test/pause-resume.test.mjs` → 24 pass, 0 fail.
- `node --test test/ship.test.mjs` → 3 pass, 0 fail.
- Two commits on `phase-48`: `192db90` (test:), `e524b06` (feat:).

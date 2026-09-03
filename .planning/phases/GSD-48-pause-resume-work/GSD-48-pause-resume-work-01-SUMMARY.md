---
phase: 48-pause-resume-work
plan: 01
subsystem: pause-resume
tags: [pause, resume, handoff, state, tdd]
requires: []
provides: [lib/pause-resume.js, lib/state.js accessors]
affects: [lib/state.js, test/pause-resume.test.mjs]
tech-stack: [node, esm, node:test, FakeFs]
key-files:
  created:
    - lib/pause-resume.js
    - test/pause-resume.test.mjs
  modified:
    - lib/state.js
decisions:
  - D-02: HANDOFF.json + .continue-here.md handoff set
  - D-03: phase-or-default context detection
  - D-04: resume is advisory, updates Session Continuity
  - D-05: HANDOFF.json one-shot deletion
  - D-07: async-jobs recorded in handoff
  - D-08: six-section .continue-here template
  - D-09: fail-fast on env faults, graceful degrade otherwise
  - D-10: TDD
metrics:
  duration: ~15m
  completed: 2026-09-03
  actuals:
    tokens: ~0
    tasks: 2
    commits: 3
status: complete
---

# Phase 48 Plan 01: pause-resume-work — domain + data foundation

Builds the pure domain core (lib/pause-resume.js) and the gsdState data-tier
accessors (lib/state.js) that the pause-work / resume-work tools (Plan 02) will
call: phase detection, HANDOFF.json building, the .continue-here.md template,
non-terminal async-job mapping, incomplete-work fallback, resume-status
rendering, and the handoff/continuity read-write-delete accessors.

## TDD Gate Compliance

Compliant. The plan is `type: tdd`. The first scope-matching commit is
`test(48-01)` (the unit tests), followed by two `feat(48-01)` commits. The
tdd_audit ship gate's first-scope-matching-commit-is-test: requirement is met.

## What was built

- **lib/pause-resume.js** — seven pure helpers (no ctx/fs/git params, no node
  builtins): `phaseNumFromDir`, `detectActivePhase`, `mapAsyncJobs`,
  `buildHandoff`, `renderContinueHere`, `detectIncompleteWork`,
  `renderResumeStatus`. Imports only from `./_shared.js`.
- **lib/state.js** — seven new GsdState accessors: `listPhaseDirs`,
  `updateContinuity`, `readHandoff`, `writeHandoff`, `deleteHandoff`,
  `readContinueHere`, `writeContinueHere`. All writes route through
  `_write` → ctx.fs (DUR-06); reads through `_read`; missing/corrupt inputs
  degrade, never throw (D-09).
- **test/pause-resume.test.mjs** — unit tests for the pure helpers and the new
  state accessors (FakeFs + real-fs adapter for the deleteHandoff deletion proof).

## Key decisions applied

- **D-02/D-03:** handoff set written at the phase-dir path when a phase is
  active, else `.planning/` root; detection is phase-or-default only.
- **D-07/OQ-3:** async jobs mapped to `{ job_id, backend, status, plan, phase,
  result, resume_command }` with the resume command derived as
  `gsd_job status <id>` (the bundle manifest lacks upstream's
  expected_artifacts/resume_command).
- **D-08/OQ-2:** HANDOFF.json carries exactly the 18 D-08 fields; the
  `.continue-here.md` template renders the six D-08 sections as XML-style tags
  with a `---` frontmatter block.
- **D-05:** `deleteHandoff` is one-shot (absent file is a no-op), mirroring the
  `removeArtifact` node:fs/promises unlink pattern.
- **D-04:** `updateContinuity` stamps `stoppedAt` + `resumeFile` (recordSession
  does not set resumeFile).

## Known Stubs

None. No TODO/FIXME/placeholder markers or skipped tests were introduced.

## Threat Flags

None. No new git calls, no shell-string execution, no secrets, no capability
surface change (no new capability key — consistent with D-01). The `.continue-here.md`
path is derived from ROADMAP via `_phaseDirName` (slugify), never from raw user
input. `HANDOFF.json` is parsed with try/catch and degrades on corrupt input.

## Self-Check: PASSED

- `lib/pause-resume.js` exists (157 lines) with all seven exported helpers.
- `lib/state.js` modified with all seven accessors.
- `test/pause-resume.test.mjs` exists (207 lines).
- `node --test test/pause-resume.test.mjs` → both describe blocks pass.
- Full suite `node --test test/*.test.mjs` → 888 pass, 0 fail.
- Three commits on `phase-48`: `cb4bab1` (test:), `eb010ed` (feat:), `3b3ac37` (feat:).

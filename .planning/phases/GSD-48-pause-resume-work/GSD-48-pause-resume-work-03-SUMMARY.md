---
phase: 48-pause-resume-work
plan: 03
subsystem: pause-resume
tags: [pause, resume, commands, capabilities, tdd]
requires: [GSD-48-pause-resume-work-02]
provides: [lib/commands.js gsd-pause-work + gsd-resume-work slash commands, gsdOrient capability pairing]
affects: [lib/_capabilities.js, lib/commands.js, test/mount.test.mjs, test/_capabilities.test.mjs]
tech-stack: [node, esm, node:test, FakeFs, mount-harness]
key-files:
  created: []
  modified:
    - lib/_capabilities.js
    - lib/commands.js
    - test/mount.test.mjs
    - test/_capabilities.test.mjs
decisions:
  - D-01: tools + slash commands, no new capability
  - D-10: TDD
  - OQ-1: pair the two commands to the existing gsdOrient capability (resolution A)
  - R-3: 21-key capability surface stays fixed
metrics:
  duration: ~15m
  completed: 2026-09-03
  actuals:
    tokens: ~0
    tasks: 2
    commits: 2
status: complete
---

# Phase 48 Plan 03: pause-resume-work — slash commands + capability pairing

Exposes the two pause/resume tools as `/gsd-pause-work` and `/gsd-resume-work`
slash commands and pairs them to the existing `gsdOrient` capability (OQ-1
resolution A), keeping the 21-key capability surface fixed (R-3) and preserving
DEGR-03, then updates the mount-surface tests so the suite stays green.

## TDD Gate Compliance

Compliant. The plan is `type: tdd`. The first scope-matching commit is
`test(48-03)` (the mount-surface test updates), followed by one `feat(48-03)`
commit. The tdd_audit ship gate's first-scope-matching-commit-is-test:
requirement is met.

## What was built

- **lib/_capabilities.js** — the `gsdOrient` row in the descriptor TABLE now
  advertises `gsd_pause_work`/`gsd_resume_work` in `tools` and
  `gsd-pause-work`/`gsd-resume-work` in `commands`. No new capability key was
  added to `CAPABILITY_KEYS` (still 21 — R-3). This makes `capabilityForTool`
  map the two tools to gsdOrient and `commandToCapability` pair the two commands
  to gsdOrient.
- **lib/commands.js** — two new `COMMANDS` entries (`gsd-pause-work`,
  `gsd-resume-work`) modeled on the gsd-status entry, each routing to its tool
  via the followup-message pattern. The existing `apply()` commandToCapability
  pairing automatically pairs them to gsdOrient via the updated TABLE — no
  change to `apply()` was needed.
- **test/mount.test.mjs** — `EXPECTED_TOOL_NAMES` 26→28, `EXPECTED_COMMAND_NAMES`
  23→25, tool-count assertion 26→28, command-count assertion 23→25,
  absent-capability count 22→24, and the all-tools-schema assertion 26→28.
- **test/_capabilities.test.mjs** — the gsdOrient exact tools/commands assertion
  updated to include the two new tools and two new commands.

## Key decisions applied

- **D-01:** tools + slash commands only — no new capability key, no loop-step.
- **OQ-1 (resolution A):** the two commands are paired to the existing `gsdOrient`
  capability, reusing the single registration path and preserving DEGR-03
  (retiring core-tools unregisters the commands).
- **R-3:** the 21-key capability surface stays fixed — no new capability key.

## Known Stubs

None. No TODO/FIXME/placeholder markers or skipped tests were introduced.

## Threat Flags

None. No shell-string execution (the commands only route followup messages to
the tools; no git/fs calls here). No secrets. No capability surface change (R-3).
The command descriptions and followup text are static strings — no user input is
interpolated into a shell or eval context.

## Self-Check: PASSED

- `lib/_capabilities.js` contains `gsd_pause_work`/`gsd_resume_work` in the
  gsdOrient tools and `gsd-pause-work`/`gsd-resume-work` in its commands;
  `CAPABILITY_KEYS.length` is still 21.
- `lib/commands.js` contains the two new COMMANDS entries routing to the tools.
- `node --test test/mount.test.mjs test/_capabilities.test.mjs` → 28 pass, 0 fail.
- `node --test test/*.test.mjs` → 898 pass, 0 fail.
- Two commits on `phase-48`: `002e9f0` (test:), `260ede9` (feat:).

---
phase: 36-spec-phase
plan: 03
subsystem: spec-plugin / discuss-consumption
tags: [spec-phase, SPEC.md, discuss, locked-what-why, D-09]
requires: [GSD-36-spec-phase-02]
provides: [gsd_discuss consumes an existing SPEC.md as locked what/why (D-09)]
affects: lib/discuss.js, test/spec-discuss.test.mjs
tech-stack: plain ESM, node:test, FakeFs + mount-harness
key-files:
  created: [test/spec-discuss.test.mjs]
  modified: [lib/discuss.js]
decisions:
  - D-09: gsd_discuss reads SPEC.md via hasArtifact-guarded readArtifact(cwd, args.phase, "SPEC"); when present it echoes the SPEC Requirements / Boundaries / Acceptance Criteria into CONTEXT specifics under a "**LOCKED from SPEC (what/why)**" heading, adds a "- SPEC.md locked what/why; focus this discussion on 'how'." code_context line, and prepends a how-only guidance sentence to its return text so the driving agent holds the interview on 'how' only. Absence of SPEC.md preserves today's behavior byte-for-byte (no SPEC read, no LOCKED markers, unchanged content).
  - D-09 (regression guard): the locked block and the how-only guidance string are emitted only inside the `if (specText)` scope; the existing exactly-one ensurePhaseBranch + exactly-one commitArtifacts({scope:'discuss'}) source assertions still hold (no extra branch/commit introduced).
metrics:
  duration: null
  completed_date: 2026-08-29
status: complete
actuals:
  tokens: null
  tasks: 2
  commits: 2
---

# Phase 36 Plan 03: SPEC-consumption by gsd_discuss Summary

Taught `gsd_discuss` (D-09) to consume an existing `<NN>-SPEC.md` as locked 'what/why' input: when the SPEC artefact exists, its Requirements / Boundaries / Acceptance Criteria are echoed into CONTEXT.md's `<specifics>` under a `**LOCKED from SPEC (what/why)**` heading and the tool's return text tells the driving agent to hold the interview on 'how' only; absence of SPEC.md preserves today's behavior byte-for-byte. Small, isolated plan — gsd_plan/gsd_verify internals and STATE progression ('plan') are untouched.

## Tasks completed

1. **Task 1 (RED→GREEN): gsd_discuss consumes an existing SPEC.md as locked what/why.** Wrote `test/spec-discuss.test.mjs` (mount `state/core-tools/discuss`, initProject, pre-write a `<NN>-SPEC.md` via `writeArtifact(...,'SPEC',...)`, run `gsd_discuss`, assert CONTEXT contains "LOCKED from SPEC" and the echoed sentinel "REQLOCKED-cache") — RED (marker absent). GREEN: in `lib/discuss.js` added a module-level `extractSpecSections(specText)` helper plus a `hasArtifact`-guarded `readArtifact(cwd, args.phase, "SPEC")` read after `ensurePhaseBranch`; the SPEC's Requirements/Boundaries/Acceptance lines are prepended to the CONTEXT specifics block under the LOCKED heading, a `- SPEC.md locked what/why; focus this discussion on 'how'.` code_context line is added, and the return text gains a how-only guidance sentence inside the `if (specText)` scope. No change to the single `ensurePhaseBranch` / single `commitArtifacts({scope:'discuss'})` calls or the `setActivePhase(...,'plan')` ordering.

2. **Task 2 (RED→GREEN as a passing guard): absence-preservation + regression.** Added the absence test to `test/spec-discuss.test.mjs` (fresh mount, no SPEC pre-written, same gsd_discuss args → assert CONTEXT does NOT contain "LOCKED from SPEC" or "SPEC.md locked what/why", and the user-supplied specifics are preserved). As the plan anticipated, the Task 1 `if (specText)` guard already preserves absence, so this test served as a regression guard. Confirmed the guidance string lives only inside the `if (specText)` scope (grep) and ran the full suite clean (473 tests pass, including the existing `test/discuss-artifacts.test.mjs` source-assertion suite).

## Commits

- `b072d71` test(36-03): gsd_discuss consumes existing SPEC.md as LOCKED what/why
- `a46a4b9` feat(36-03): gsd_discuss reads+echoes SPEC.md as locked what/why (D-09)

## Deviation note

Task 2 is documented as a "RED→GREEN" plan item, but the absence-preservation behaviour required **no new code change**: the Task 1 `if (specText)` guard already preserves the absence path, exactly as the plan predicted ("otherwise the code path already preserves absence; turn this into a passing guard"). The absence test was therefore landed as part of the Task 1 test commit (`b072d71`, which contains both the happy-path and absence tests) and verified by the full regression run. No separate Task 2 commit was created because no code change was needed; the absence guard is a passing green test, not a RED. This is a planning fidelity note, not missed or skipped work — all Task 2 acceptance criteria are met (absence CONTEXT has no LOCKED markers, both suites green, guidance inside `if (specText)`).

## Known Stubs

None. All SPEC-consumption paths are substantively implemented and tested.

## Threat Flags

No threat-surface changes. `lib/discuss.js` adds no new git calls and no new inline-git invocation (the shared `ensurePhaseBranch`/`commitArtifacts` seam is unchanged), reads the SPEC artefact only through the existing `state.hasArtifact`/`state.readArtifact` accessors (which route through `ctx.fs`), and the echoed content is static markdown written only to `.planning/` CONTEXT.md — no secret handling, no new dependency, no shell interpolation of model-supplied values.

## TDD Gate Compliance

RED→GREEN enforced per task: Task 1 produced a failing test commit (`test(36-03)` → `b072d71`) followed by a passing implementation commit (`feat(36-03)` → `a46a4b9`). Task 2's absence test passes from the outset (a green guard, per the plan's own prediction) so no RED was committed after its GREEN. Missing-gate note: Task 2 is a guard-verification rather than a RED→GREEN cycle; this is inherent to the plan's design and is covered by the deviation note above.

## Self-Check

- Created files exist: `lib/discuss.js` (modified), `test/spec-discuss.test.mjs` (created).
- Commits exist: `b072d71`, `a46a4b9` on branch `phase-36`.
- Targeted suites: `node --test test/spec-discuss.test.mjs test/discuss-artifacts.test.mjs` exits 0 (6 pass).
- Full suite: `node --test test/*.test.mjs` exits 0 (473 pass, 0 fail).
- Working tree clean after commits.

## Self-Check: PASSED

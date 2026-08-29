---
phase: 36-spec-phase
plan: 02
subsystem: spec-plugin / ambiguity-gate / mount-surface
tags: [spec-phase, SPEC.md, ambiguity-gate, structured-subagent, mount, coeffect]
requires: [GSD-36-spec-phase-01]
provides: [lib/spec.js gsd_spec_phase tool, SPEC_SCORER_PROMPT, SPEC_SCORER_SCHEMA, gsd-spec patch row + export + command, mount/coeffect test updates]
affects: lib/spec.js, lib/_agents.js, lib/commands.js, package.json, cordis.patch.yml, test/helpers/mount-harness.mjs, test/mount.test.mjs, test/coeffect.test.mjs, test/spec.test.mjs
tech-stack: plain ESM, node:test, FakeFs + mount-harness, @deepseek-ai/dsh-tools defineTool
key-files:
  created: [lib/spec.js, test/spec.test.mjs]
  modified: [lib/_agents.js, lib/commands.js, package.json, cordis.patch.yml, test/helpers/mount-harness.mjs, test/mount.test.mjs, test/coeffect.test.mjs]
decisions:
  - D-01: spec-phase is a full loop-step plugin (name 'gsd-spec', inject ['gsdState','tools','subagents'], apply provides gsdSpec + registers gsd_spec_phase).
  - D-03: non-auto call with no requirements throws Socratic-interview guidance; auto=true derives defaults from ROADMAP phase + REQUIREMENTS.md (REQ-ID -> text, falling back to the REQ-ID itself, never 'undefined').
  - D-04/D-05: ambiguity scored by a fresh-context structured subagent (SPEC_SCORER_PROMPT + SPEC_SCORER_SCHEMA) via spawnSubagent with outputSchema.
  - D-06: soft gate — over-minimal/overrun still writes SPEC.md, records the overage, flags below-min dimensions as planner assumptions.
  - D-07: scoring-subagent fault degrades to writing SPEC.md with an UNAVAILABLE report + real cause; never hard-blocks.
  - D-10: Edge Coverage / Prohibitions section emitted as OUT OF SCOPE placeholders.
  - D-11/D specifics: falsifiability fail-fast guard — a requirement without a non-empty Acceptance throws before any artefact write.
  - DEGR-07: 'subagents' declared in inject (coeffect), exercised by the coeffect suite.
metrics:
  duration: null
  completed_date: 2026-08-29
status: complete
actuals:
  tokens: null
  tasks: 3
  commits: 4
---

# Phase 36 Plan 02: Spec-phase plugin Summary

Delivered the spec-phase loop-step plugin: `lib/spec.js`'s `gsd_spec_phase` tool seals a falsifiable SPEC.md (Requirements with Current/Target/Acceptance, Boundaries, Constraints, Edge/Prohibition out-of-scope placeholders, Interview Log) gated by a structured-subagent ambiguity score (joint `<=0.20` + per-dimension-minimum gate), writes the artefact + advances STATE to `spec`, and wires the full mount surface (export, patch row, `/gsd-spec-phase` command, PATCH_ROWS, mount/coeffect expectations). Full suite green (471 tests).

## Tasks completed

1. **Task 1 (RED→GREEN): lib/spec.js tracer — gsd_spec_phase writes a scored SPEC.md and advances STATE.** Added `SPEC_SCORER_PROMPT` to `lib/_agents.js`; created `lib/spec.js` as a full loop-step plugin mirroring `lib/discuss.js` (name `gsd-spec`, inject `["gsdState","tools","subagents"]`, `ctx.provide("gsdSpec", buildCapability("gsdSpec"))`, registers `gsd_spec_phase` via `defineTool`). Constants `SPEC_WEIGHTS` (0.35/0.25/0.20/0.20), `SPEC_MINIMUMS` (0.75/0.70/0.65/0.70), `SPEC_GATE_AMBIGUITY` (0.20), and `SPEC_SCORER_SCHEMA`; `computeWeighted`/`resolveScore` helpers. Execute: env validation → `ensurePhaseBranch` → requirement resolution (explicit or auto-derived) → falsifiability guard → assemble SPEC body → `spawnSubagent(...SPEC_SCORER_PROMPT...)` → joint gate → `writeArtifact(...,'SPEC',...)` → `setActivePhase(...,'spec')` → `addDecision` → `commitArtifacts({scope:'spec'})` → return. Wrote `test/spec.test.mjs` happy-path test (mounts state/core-tools/spec directly with a fake scorer; asserts SPEC.md has Requirements + Ambiguity Report + Current/Target/Acceptance and STATE `spec`/`discuss-phase`). Commit split test→feat. RED→GREEN, then GREEN verified.

2. **Task 2 (RED→GREEN): gate edge cases, falsifiability, auto/interactive dispatch.** Extended `test/spec.test.mjs` with five offline tests: (a) OVERRUN soft-gate still writes SPEC.md and flags below-min dimensions; (b) under-min joint gate (constraint 0.4 with overall ambiguity 0.12 <= 0.20) flags `Constraint Clarity UNDER-MIN`, never silently accepts; (c) UNAVAILABLE degradation writes SPEC.md with `UNAVAILABLE` + real cause and never throws; (d) falsifiability reject throws and writes no SPEC.md; (e) auto=true with no requirements derives non-undefined default Targets/Acceptances (+ auto-mode Interview Log line) while non-auto with nothing throws Socratic-interview guidance.

3. **Task 3: mount/plumbing + coeffect + mount/coeffect test maintenance.** Added `./spec` export to `package.json`, a `gsd-spec`/`@dsh-gsd/bundle/spec` row to `cordis.patch.yml`, `{ id: "gsd-spec", sub: "spec" }` to `mount-harness.mjs` `PATCH_ROWS`, `gsd_spec_phase` to `EXPECTED_TOOL_NAMES` and `gsd-spec-phase` to `EXPECTED_COMMAND_NAMES`, bumped the mount counts (10→11 capabilities, 14→15 tools, 12→13 commands, 12→13 patch rows), added `spec` to `SUBAGENT_DRIVEN_SUBS` (six→seven) in `coeffect.test.mjs`, and updated the full-set mount to include spec (snapshot now `spec, discuss, ui, plan, quick, execute, verify, ship`; gsd_status routes the stored null next_action to `spec-phase`). Added the `/gsd-spec-phase` command to `lib/commands.js` (see deviation note).

## Commits

- `2713ac0` test(36-02): spec-test happy path for gsd_spec_phase SPEC.md + STATE
- `487dabe` feat(36-02): gsd_spec_phase writes scored SPEC.md and advances STATE to spec
- `ba4ca6e` test(36-02): spec gate edges, degradation, falsifiability, auto dispatch
- `37073a5` feat(36-02): mount spec plugin surface (export, patch row, command, tests)

## Deviation note

`lib/commands.js` is the one file modified beyond the plan's declared `files_modified` set (which listed `lib/spec.js, lib/_agents.js, package.json, cordis.patch.yml, test/helpers/mount-harness.mjs, test/mount.test.mjs, test/coeffect.test.mjs, test/spec.test.mjs`). It was strictly required by Task 3's own acceptance criterion — adding `gsd-spec-phase` to `mount.test.mjs` `EXPECTED_COMMAND_NAMES` only passes if a `gsd-spec-phase` command is actually registered, and `lib/commands.js`'s `COMMANDS` array is the sole registration point. The plan did not assign this row to any plan (and it is not `spec.js`'s duty). Without it, `D-01`'s `/gsd-spec-phase` command surface would be broken and the mount command-name deepEqual fails. No plan file was missed and no work was skipped.

## Known Stubs

None. All SPEC sections are substantively implemented. The `Edge Coverage / Prohibitions` section is an intentional `OUT OF SCOPE (later phase)` placeholder per D-10 (deferred to a later phase), not a TODO stub.

## Threat Flags

No threat-surface changes. `lib/spec.js` keeps every git call behind the shared `ensurePhaseBranch`/`commitArtifacts` seam (no inline git), routes the artefact write through `s.writeArtifact` → `ctx.fs` (no raw node:fs), and the SPEC content it writes is composed from user/model-supplied strings only written to `.planning/` — no secret handling, no new dependency (unchanged `"dependencies": {}`). The structured-output schema is the restricted object-rooted subset enforced by the host. `SPEC_SCORER_PROMPT` carries no file-IO and never touches forbidden files.

## TDD Gate Compliance

RED→GREEN enforced per task: each behaviour got a failing test commit (`test(36-02)`) followed by a passing implementation commit (`feat(36-02)`); the gate/degrade/falsifiability/dispatch behaviours are all covered by named offline tests (`test/spec.test.mjs`, 6 tests). No RED commit was committed after its GREEN (commits ordered test-then-feat).

## Self-Check

- Created files exist: `lib/spec.js` (330 lines, >140 min), `test/spec.test.mjs` (exists).
- Commits exist: `2713ac0`, `487dabe`, `ba4ca6e`, `37073a5` on branch `phase-36`.
- Targeted suites: `node --test test/spec.test.mjs test/mount.test.mjs test/coeffect.test.mjs` exits 0 (27 pass).
- Full suite: `node --test test/*.test.mjs` exits 0 (471 pass, 0 fail) — includes the data-driven `test/removal.test.mjs`, which now also exercises a `gsdSpec` retirement case via `STEP_CAPS`/`PATCH_ROWS`, and the pre-existing mount failures noted in plan 01 are resolved.

## Self-Check: PASSED

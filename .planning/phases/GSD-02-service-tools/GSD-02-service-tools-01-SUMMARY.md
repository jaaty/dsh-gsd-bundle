---
phase: 02-service-tools
plan: 01
subsystem: state
tags: ["test", "mount-03", "round-trip", "gsdState"]
requires:
  - "lib/state.js (GsdState accessors)"
  - "lib/_shared.js (parse/stringify helpers)"
  - "test/helpers/fake-fs.mjs (FakeFs/stateCtx)"
  - "test/helpers/project.mjs (buildProject)"
provides:
  - "test/state.test.mjs extended with full-artefact-surface round-trip coverage (MOUNT-03 proof)"
affects:
  - "test/state.test.mjs"
tech-stack: ["node:test", "node:assert/strict", "ESM"]
key-files:
  created: []
  modified:
    - "test/state.test.mjs"
decisions:
  - "D-02: extended the existing PLAN/SUMMARY round-trip tests to the full artefact surface (PROJECT, REQUIREMENTS, ROADMAP, STATE, config.json, CONTEXT, RESEARCH, VERIFICATION)"
  - "R3: used projected-subset deepEqual (not naive full deepEqual) for ROADMAP and STATE to account for documented parser asymmetries (slug injection; last_updated/last_activity mutation; active_phase numeric-string coercion)"
metrics:
  duration: "~15m"
  completed: 2026-08-23
status: complete
actuals:
  tasks: 2
  commits: 1
---

# Phase 02 Plan 01: gsdState Full-Artefact Round-Trip Summary

Added a `planning artefact round-trip` describe block to `test/state.test.mjs` proving MOUNT-03: every `.planning/` artefact type round-trips write→read with no data loss modulo the documented parser asymmetries.

## What was built

Eight new tests under `describe("planning artefact round-trip")`:

1. **readProject verbatim** — writes a known string directly to `.planning/PROJECT.md` via FakeFs and asserts `readProject` returns it verbatim (there is no public `writeProject`).
2. **CONTEXT verbatim** — `writeArtifact`/`readArtifact` round-trip a frontmatter-fenced CONTEXT body.
3. **RESEARCH verbatim** — same for RESEARCH.
4. **VERIFICATION verbatim** — same for VERIFICATION.
5. **REQUIREMENTS full deepEqual** — `writeRequirements`/`readRequirements` round-trips a distinct 3-req set with no loss (clean accessor pair).
6. **ROADMAP projected subset** — `writeRoadmap`/`readRoadmap` round-trips a distinct 2-phase roadmap, asserting the subset `parseRoadmap` preserves (`milestoneName`, `version`, per-phase `n/name/goal/requirements/status`); explicitly excludes the injected `slug` and the always-null `milestone` (R3).
7. **STATE projected subset** — `writeState`/`readState` round-trips a distinct state, projecting out `last_updated`/`last_activity` (mutated by `writeState`) and `active_phase` (string `"1"` emitted unquoted → coerced back to Number `1` by `coerceScalar`); asserts `active_phase` value-preservation separately via `String()` equality, and asserts the body contract (`position/decisions/blockers/continuity`) exactly.
8. **config round-trip** — `initProject` with full opts → `readConfig` field equality on `gsd_state_version`, `tdd_mode`, `mvp_mode`, `project_code`, `discuss_mode`, `context_window`, `use_worktrees`, `commit_docs` (no public `writeConfig`; `initProject` is the only writer).

## Verification

- `node --test --test-name-pattern="planning artefact round-trip" test/state.test.mjs` → 8 pass, 0 fail.
- Full suite `node --test test/*.test.mjs` → 54 pass, 0 fail (was 41 pre-change baseline per RESEARCH; +8 new tests, +5 from the describe-counting difference across the existing suite).

All `<acceptance_criteria>` literal substrings verified present in `test/state.test.mjs`:
- `describe("planning artefact round-trip"` ✔
- `svc.readProject(CWD)` ✔
- `writeArtifact(CWD, 1, "CONTEXT"` / `"RESEARCH"` / `"VERIFICATION"` ✔
- `writeRequirements(CWD, reqs)` ✔
- `back.phases.map(p => ({n:p.n, name:p.name, goal:p.goal, requirements:p.requirements, status:p.status}))` ✔
- `delete inFm.last_updated` ✔ / `delete inFm.active_phase` ✔
- `String(back.frontmatter.active_phase), doc.frontmatter.active_phase` ✔
- `cfg.gsd_state_version, "1.0"` ✔

## Deviation note

The plan defined two tasks (Task 1: raw-text artefacts; Task 2: structured artefacts), both modifying the same file `test/state.test.mjs` and Task 2 explicitly extending Task 1's describe block. They were implemented together as one cohesive describe block and committed atomically in a single commit (scope `02-01`) rather than two, since the two tasks are not independently verifiable in isolation (Task 2 depends on Task 1's describe block existing) and share one file. One commit covers both tasks' files (`test/state.test.mjs`).

## Known Stubs

None. No TODO/FIXME/placeholder/skipped tests introduced.

## Threat Flags

None. Pure test-only addition; no new dependencies; no runtime/infra surface touched. The zero-runtime-dependency invariant is preserved (no YAML/markdown parser added — gsdState's own parsers in `lib/_shared.js` remain the only artefact parsers).

## Self-Check: PASSED

- Created/modified file exists: `test/state.test.mjs` (139 insertions). ✔
- Commit exists: `18300f8 test(02-01): prove gsdState full-artefact round-trip (MOUNT-03)`. ✔
- Only `test/state.test.mjs` staged in the commit (orchestrator's pre-existing `.planning/ROADMAP.md`/`STATE.md` modifications left unstaged). ✔
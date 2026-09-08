---
phase: GSD-57-mvp-phase
plan: 01
subsystem: quick
tags: [mvp-phase, capability, command, tool, propose-then-confirm, delegation]
dependency graph:
  requires: []
  provides: [gsd_mvp_phase tool, gsdMvpPhase capability, /gsd-mvp-phase command]
  affects: [lib/quick.js, lib/_capabilities.js, lib/commands.js, test/mount.test.mjs, test/_capabilities.test.mjs, test/render.test.mjs]
tech-stack: [ESM, dsh-tools, Cordis plugin]
key-files:
  created: []
  modified: [lib/quick.js, lib/_capabilities.js, lib/commands.js, test/mount.test.mjs, test/_capabilities.test.mjs, test/render.test.mjs]
decisions: [D-01, D-02, D-03, D-04, D-05, D-06, D-07]
metrics:
  duration: 2026-09-08
  completed: 2026-09-08
status: complete
---

# Phase 57 Plan 01: mvp-phase Summary

Landed the core mvp-phase surface: a new `gsd_mvp_phase` tool (interactive propose-then-confirm scoping -> real PLAN.md via `gsd_plan` -> delegation to the normal loop `gsd_execute`/`gsd_verify`/`gsd_ship`, with fail-fast error handling), plus the `gsdMvpPhase` capability and `/gsd-mvp-phase` command, and updated the registration-surface tests to reflect the new registrations.

## What was done

**Task 1 — tool/capability/command surface (commit `b628e51`):**
- `lib/_capabilities.js`: added `gsdMvpPhase` to `CAPABILITY_KEYS` (after `gsdFastMode`, before `gsdExecute`) and a `gsdMvpPhase` descriptor to `TABLE` (step `quick`, role `alternate`, tools `["gsd_mvp_phase"]`, commands `["gsd-mvp-phase"]`, order 25), mirroring `gsdFastMode`.
- `lib/commands.js`: added the `gsd-mvp-phase` slash-command entry after `gsd-fast-mode` (parses `<N>`, routes to `gsd_mvp_phase`).
- `lib/quick.js`: extended the `_shared.js` import with `parseFrontmatter`; added `ctx.provide("gsdMvpPhase", buildCapability("gsdMvpPhase"))`; added the module-scope helpers `proposeMvpSlice`, `isGenericConfirm`, and `buildMvpContext`; registered the `gsd_mvp_phase` tool with the full propose-then-confirm + delegation + fail-fast flow (D-01..D-07).

**Task 2 — registration-surface tests (commit `2b481a3`):**
- `test/mount.test.mjs`: added `gsd_mvp_phase`/`gsd-mvp-phase` to the EXPECTED arrays; bumped tools 35→36, commands 32→33, capability keys 26→27; updated the absent-capability command count 31→32.
- `test/_capabilities.test.mjs`: bumped key count 26→27 and added `gsdMvpPhase` to the key list.
- `test/render.test.mjs`: inserted `gsdMvpPhase` into `LOOP_ORDER` and the `without("gsdVerify")` subset list.

## Verification

- `node --check` passes for `lib/quick.js`, `lib/_capabilities.js`, `lib/commands.js`.
- All Task 1 and Task 2 acceptance-criteria greps pass.
- `node --test test/mount.test.mjs test/_capabilities.test.mjs test/render.test.mjs` → 49 pass, 0 fail.
- Full suite `node --test` → 1041 pass, 0 fail.

## Key decisions applied

- **D-01** — new `gsd_mvp_phase` tool + `/gsd-mvp-phase` command + `gsdMvpPhase` capability, additive under the quick step (role alternate).
- **D-02** — distinct sibling to fast-mode; neither changes the other.
- **D-03** — propose-then-confirm scoping: first call writes an `MVP-SCOPE` artefact and returns a `GSD_AWAITING_HUMAN` marker; a confirm call (matching `decision_id`) writes the confirmed CONTEXT and proceeds.
- **D-04** — reuses the normal `gsd_plan` path for a schema-faithful PLAN.md.
- **D-05** — delegates execution to the normal loop `gsd_execute` → `gsd_verify` → `gsd_ship`.
- **D-06** — fail fast, never auto-retry/continue, leaves the phase uncompleted, reports the real cause.
- **D-07** — executor discretion on proposed-slice wording, confirm-interaction shape, and the lightweight-verify heuristic (reads VERIFICATION.md status; only `passed` proceeds to ship).

## Known Stubs

None. No TODO/FIXME/placeholder/skipped tests introduced.

## Threat Flags

None. The tool performs no new I/O beyond the existing `gsdState` artefact model (`writeArtifact`/`readArtifact`) and delegates to the normal loop tools; no secrets, no shell, no network.

## Self-Check: PASSED

- Created files exist: `lib/quick.js`, `lib/_capabilities.js`, `lib/commands.js`, `test/mount.test.mjs`, `test/_capabilities.test.mjs`, `test/render.test.mjs` all present and modified.
- Commits exist: `b628e51` (feat), `2b481a3` (test).
- Full test suite green (1041 pass, 0 fail).

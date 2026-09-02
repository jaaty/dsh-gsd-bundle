---
phase: 46-mempalace
plan: 04
subsystem: mempalace
tags: [mempalace, registration, commands, mount-harness, cross-cutting, docs]
requires: [GSD-46-mempalace-01]
provides: []
affects: [cordis.patch.yml, package.json, lib/commands.js, test/helpers/mount-harness.mjs, test/mount.test.mjs, test/_capabilities.test.mjs, test/render.test.mjs, README.md]
tech-stack: [node, esm, dsh-tools]
key-files:
  created: []
  modified:
    - cordis.patch.yml
    - package.json
    - lib/commands.js
    - test/helpers/mount-harness.mjs
    - test/mount.test.mjs
    - test/_capabilities.test.mjs
    - test/render.test.mjs
    - README.md
decisions: [D-01, D-08, D-09, D-10, OQ-1, OQ-7]
metrics:
  duration: "~20 min"
  completed: "2026-09-02"
  actuals:
    tokens: 0
    tasks: 2
    commits: 2
status: complete
---

# Phase 46 Plan 04: mempalace registration surface + cross-cutting repair — Summary

Wired the full registration surface for the `gsdMempalace` capability (cordis.patch.yml row, package.json `./mempalace` export, the two `/gsd-mempalace-*` slash commands, and the mount-harness PATCH_ROWS row) so the plugin mounts in a live session and the DEGR-05 removal suite auto-extends, and repaired every cross-cutting count/key assertion the 21st capability key (added in plan 01) left RED. Documented the mempalace config surface + mirror_kg note in README.md. The full test suite is green (815 pass, 0 fail).

## What was delivered

- **`cordis.patch.yml`** — added the `gsd-mempalace` plugin row (`@dsh-gsd/bundle/mempalace`) after `gsd-graphify`, before `gsd-ship`, with a comment noting it is the mempalace advisory step (D-01).
- **`package.json`** — added the `./mempalace` subpath export (`./lib/mempalace.js`) after `./graphify` (OQ-7).
- **`lib/commands.js`** — added the `gsd-mempalace-recall` (hint `<N>`, routes to `gsd_mempalace_recall`) and `gsd-mempalace-capture` (hint `<N> <CONTEXT|PLAN|SUMMARY>`, routes to `gsd_mempalace_capture`) slash commands after `gsd-graphify`, before `gsd-new-milestone` (OQ-7).
- **`test/helpers/mount-harness.mjs`** — added the `{ id: "gsd-mempalace", sub: "mempalace" }` PATCH_ROWS row (after `gsd-graphify`) and updated the "21 plugin rows" comment to 22, so the DEGR-05 removal suite auto-extends (OQ-7).
- **`test/mount.test.mjs`** — updated every count/key assertion for the 22nd plugin row: plugin rows 21→22, registered tools 24→26 (added `gsd_mempalace_recall`/`gsd_mempalace_capture` to EXPECTED_TOOL_NAMES), slash commands 21→23 (added the two commands to EXPECTED_COMMAND_NAMES), capability keys 20→21, subset-mount commands 20→22, insert rows 22→23, and the full-set mount regression now includes the `mempalace` sub + the snapshot Available-steps line.
- **`test/_capabilities.test.mjs`** — "exposes exactly the 20 known keys" → 21, added `gsdMempalace` to the key-list array.
- **`test/render.test.mjs`** — appended `gsdMempalace` to LOOP_ORDER, the removed-step assertion array, and the `without(...)` list in the effectiveRoutableStep null case.
- **`test/removal.test.mjs`** — no manual change needed; it derives STEP_CAPS from CAPABILITY_KEYS and maps to PATCH_ROWS by `sub`, so the new PATCH_ROWS row makes the gsdMempalace retirement test auto-extend.
- **`README.md`** — added `gsd_mempalace_recall`/`gsd_mempalace_capture` to the `gsd_*` tools table and a "Mempalace (cross-session memory)" section documenting the two tools, the config surface (enabled, memory_mode, wing, recall_on_discuss, recall_on_plan, capture_artifacts, mirror_kg), the mirror_kg CLI-unavailable note (OQ-1), the memory_mode additive note (D-09), and the advisory soft-gate note (D-08).

## TDD Gate Compliance

Not a `type: tdd` plan — this is a `type: execute` wave-2 repair plan (registration surface + cross-cutting test repair + docs). No test-first commits were required; the plan's verify step is the four cross-cutting suites going green, which they do.

## Known Stubs

None. The `gsd_mempalace_capture` stub body from plan 01 was replaced by the full capture implementation in plan 03 (landed in parallel); this plan only wires the registration surface and repairs the cross-cutting assertions.

## Threat Flags

- The two new slash commands route to the `gsd_mempalace_recall`/`gsd_mempalace_capture` tools via the existing `send()` followup mechanism — no new exec surface, no shell interpolation. The `mempalaceFn` exec seam (plan 01) remains the only external-process touchpoint and uses a FIXED argument array.
- No raw git in this plan's changes; the registration surface is declarative (patch row, export, command descriptors, test assertions).

## Self-Check: PASSED

- `cordis.patch.yml` contains the `gsd-mempalace` row (`grep -q "gsd-mempalace"`).
- `package.json` contains the `./mempalace` export (`grep -q '"./mempalace"'`).
- `lib/commands.js` contains both `gsd-mempalace-recall` and `gsd-mempalace-capture`.
- `test/helpers/mount-harness.mjs` contains `sub: "mempalace"` in PATCH_ROWS.
- `test/_capabilities.test.mjs` and `test/render.test.mjs` contain `gsdMempalace`.
- `README.md` documents `gsd_mempalace_recall`, `gsd_mempalace_capture`, `mempalace.enabled`, `mirror_kg`, and `memory_mode`.
- Full suite: `npm test` → 815 pass, 0 fail (GREEN).
- Commits: `d12d934` (feat registration surface + cross-cutting repair), `7a86d74` (docs README). Working tree clean of this plan's files.

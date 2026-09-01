---
phase: 44-learnings
plan: 02
subsystem: learnings
tags: [learnings, registration-surface, capability-wiring, oq-1]
requires:
  - "GSD-44-learnings-01 (gsdLearnings capability + learnings.js plugin + state accessors)"
  - "lib/_capabilities.js (gsdLearnings order 53, CAPABILITY_KEYS entry from plan 01)"
  - "lib/_render.js (STEP_PARAGRAPHS, renderAvailableSteps, loopSteps)"
  - "lib/commands.js (COMMANDS array + commandToCapability pairing)"
  - "cordis.patch.yml (insert block plugin rows)"
  - "package.json (subpath exports)"
  - "test/helpers/mount-harness.mjs (PATCH_ROWS, makeMountCtx, mountSubset)"
provides:
  - "Full registration surface for gsdLearnings: persona paragraph, slash command, patch row, subpath export, harness PATCH_ROWS"
  - "All existing test assertions updated for the 19th capability (23 tools, 20 commands, 19 keys, 21 insert rows)"
affects:
  - "lib/_render.js — gsdLearnings STEP_PARAGRAPHS entry (renders after milestone-audit)"
  - "lib/commands.js — /gsd-extract-learnings command entry"
  - "cordis.patch.yml — gsd-learnings plugin row (after gsd-milestone-audit, before gsd-ship)"
  - "package.json — ./learnings subpath export"
  - "test/helpers/mount-harness.mjs — gsd-learnings PATCH_ROWS entry (21 rows)"
  - "test/mount.test.mjs — count/key/list/regex assertions bumped for 19th capability"
  - "test/render.test.mjs — LOOP_ORDER + loopSteps deepEqual + without(...) list updated"
  - "test/_capabilities.test.mjs — CAPABILITY_KEYS length 18→19 + known-keys list includes gsdLearnings"
tech-stack: [ESM, node:test, defineTool, FakeFs, mount-harness]
key-files:
  created: []
  modified:
    - "lib/_render.js"
    - "lib/commands.js"
    - "cordis.patch.yml"
    - "package.json"
    - "test/helpers/mount-harness.mjs"
    - "test/mount.test.mjs"
    - "test/render.test.mjs"
    - "test/_capabilities.test.mjs"
decisions:
  - "D-01: gsdLearnings STEP_PARAGRAPHS entry renders '- Learnings:' paragraph after milestone-audit (order 53 after 52)"
  - "D-01/OQ-5: /gsd-extract-learnings command registered in COMMANDS array, paired to gsdLearnings via descriptor commands field"
  - "D-01/OQ-1: gsd-learnings patch row added to cordis.patch.yml insert block + ./learnings subpath export in package.json"
  - "D-12: no NEXT_ACTION_TO_STEP entry for learnings (mirrors milestone-audit omission — advisory off-loop step)"
  - "OQ-1: all 10 broken test assertions updated — tool count 22→23, command count 19→20, capability count 18→19, insert rows 20→21, subset-mount subs + snapshot regex + LOOP_ORDER + without(...) list + _capabilities known-keys list"
metrics:
  duration: single session
  completed_date: 2026-09-01
  tokens: n/a
  tasks: 2
  commits: 2
status: complete
---

# Phase 44 Plan 02: Registration Surface Wiring Summary

Wired the full registration surface for the gsdLearnings capability (order 53) and fixed every existing test assertion that the new 19th capability breaks, completing the integration of the extract-learnings step into the GSD loop.

## What was built

### Task 1: Registration wiring (5 files)
- **lib/_render.js** — added `gsdLearnings` to `STEP_PARAGRAPHS` with a one-sentence "- Learnings:" paragraph mirroring milestone-audit's advisory style. No `NEXT_ACTION_TO_STEP` entry (mirrors milestone-audit — advisory off-loop step that never advances STATE, per D-12).
- **lib/commands.js** — added `gsd-extract-learnings` command entry (name, description, hint `<N> [--force]`, build function) to the COMMANDS array, paired to gsdLearnings via the descriptor's `commands` field through the `commandToCapability` map.
- **cordis.patch.yml** — added `gsd-learnings` plugin row in the insert block, after `gsd-milestone-audit` and before `gsd-ship`, with a 4-line comment explaining the advisory learnings step.
- **package.json** — added `"./learnings": { "default": "./lib/learnings.js" }` subpath export after the `./milestone-audit` entry.
- **test/helpers/mount-harness.mjs** — added `{ id: "gsd-learnings", sub: "learnings" }` to PATCH_ROWS (21 rows total) so the DEGR-05 removal suite's `retirementMatrix()` finds a patch row for step "learnings".

### Task 2: Test assertion updates (3 files)
- **test/mount.test.mjs** — 12 updates: EXPECTED_TOOL_NAMES (+gsd_extract_learnings), EXPECTED_COMMAND_NAMES (+gsd-extract-learnings), tool count 22→23, command count 19→20, capability count 18→19, retired-command count 18→19, insert rows 20→21, schema-test count 22→23, subset-mount subs array (+learnings), snapshot regex (+learnings), plus 6 stale human-readable labels/comments (describe/test names and header comment).
- **test/render.test.mjs** — 3 updates: LOOP_ORDER array (+gsdLearnings), loopSteps(subset) deepEqual expected array (+gsdLearnings), and the `without(...)` call at the "no greater slot → null" assertion (+gsdLearnings so the intent still holds).
- **test/_capabilities.test.mjs** — 3 updates: test name "18 known keys"→"19 known keys", CAPABILITY_KEYS.length 18→19, and the known-keys enumeration array (+gsdLearnings).

## TDD Gate Compliance

This plan is `type: execute` (not `type: tdd`), so the tdd_audit ship gate does not apply. The first scope-matching commit is `feat(44-02):` which is correct for an execute plan. No test-first ordering violation.

## Known Stubs

None. No TODO/FIXME/placeholder markers in the modified files. No skipped tests.

## Threat Flags

None. No shell interpolation, no secrets, no untrusted input. All changes are static registration surface wiring (data declarations, string literals, test assertions).

## Self-Check: PASSED

- All 5 registration-surface files updated (grep-verified in Task 1 verify).
- All 3 test files updated (grep-verified in Task 2 acceptance criteria).
- Commits exist: `88eb476` (feat Task 1), `369de25` (test Task 2).
- `node --test test/_capabilities.test.mjs test/mount.test.mjs test/render.test.mjs test/removal.test.mjs` → pass 61 / fail 0.
- `node --test test/*.test.mjs` → pass 751 / fail 0 (full suite GREEN).
- PATCH_ROWS has 21 entries (was 20).
- gsdLearnings renders in loopSteps after gsdMilestoneAudit (order 53 after 52).
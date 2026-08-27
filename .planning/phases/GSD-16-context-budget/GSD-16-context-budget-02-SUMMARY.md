---
phase: 16-context-budget
plan: 02
subsystem: planning-context
tags: [context-budget, truncation, call-site-wiring, CQ-06]
dependency graph:
  requires: [GSD-16-context-budget-01]
  provides: all five tools derive the total budget, read .text, and surface .truncated
  affects: lib/plan.js, lib/execute.js, lib/verify.js, lib/ui.js, lib/map-codebase.js
tech-stack: ESM, node:test, zero runtime deps
key-files:
  created: [test/context-wiring.test.mjs]
  modified: [lib/plan.js, lib/execute.js, lib/verify.js, lib/ui.js, lib/map-codebase.js]
decisions:
  D-02: budget derived from config context_window via shared contextBudget helper
  D-03: call sites derive maxTotal and pass it into planningContext
  D-05: each call site reads .text for the prompt and surfaces .truncated on its log/return channel
  D-06: inline audit notice emitted inside the block (already in plan 01 core)
  D-07: call-site labels distinct; exact-content dedup net (from plan 01) prevents double-injection
metrics:
  duration: "~8 min"
  completed: "2026-08-27"
  actuals: { tasks: 3, commits: 3, tests: 227 passing (8 new) }
status: complete
---

# Phase 16 Plan 02: context-budget call-site wiring Summary

Wired the new `planningContext(entries, maxPerFile, maxTotal) -> { text, truncated }` signature across all five tools that build a `<planning_context>` block, so each derives the total budget from config `context_window` via the shared `contextBudget` helper, reads the returned `.text` for its prompt (never the raw object), and surfaces the `.truncated` list on its log/return channel — guarded by a new source-assertion suite that fails if any call site regresses to leaking `[object Object]`.

## What changed

### `lib/plan.js` (richest call site: researcher, planner, plan-checker)
- Added `contextBudget` to the `./_shared.js` import.
- The previously-**dead** `cfg` variable (line 56) is now consumed: `const maxBudget = contextBudget(cfg?.context_window);` feeds the budget.
- All three `planningContext` calls (researcher, planner, and the one inside `runChecker`) now pass `60000, maxBudget`, read `pc.text` into their prompt, and push a `planning-context: truncated N entry/entries (labels…) — capping total context to <maxBudget> chars` line into the shared `log` array when `pc.truncated.length > 0`.
- `runChecker` gained a `log` parameter, passed at both call sites, and derives its own budget from `s.readConfig(cwd)`.

### `lib/execute.js`
- Imports `contextBudget`; derives `maxBudget` once from `s.readConfig(cwd)`.
- The wave executor prompt's `planningContext` passes `60000, maxBudget`, reads `pc.text`, and reports truncation on the in-scope `log` array.

### `lib/verify.js`
- Imports `contextBudget`; derives `maxBudget` from `s.readConfig(cwd)`.
- The verifier `planningContext` passes `60000, maxBudget`, reads `pc.text`, collects truncation lines into a new `notes` array, and includes `...notes` in the final returned array so the orchestrator sees the elision.

### `lib/ui.js`
- Imports `contextBudget`; derives `maxBudget` from `s.readConfig(cwd)`.
- Both `planningContext` calls (ui-researcher + ui-checker) pass `60000, maxBudget`, read `pc.text`/`pc2.text`, collect into a `notes` array, and include `...notes` in the returned array.

### `lib/map-codebase.js`
- Imports `contextBudget`; derives `maxBudget` from `s.readConfig(cwd)` in query mode.
- The query-mode `planningContext` passes `60000, maxBudget`, reads `pc.text`, and — because the query path returns `r.output` directly with no log channel — appends the `planning-context: truncated …` line inline to the returned query answer string.

### `test/context-wiring.test.mjs` (new)
- 8 source-assertion tests (mirroring `test/ship.test.mjs`) reading each `lib/*.js`:
  - one per tool asserting: `contextBudget` imported from `./_shared.js`; `s.readConfig(cwd)` present; the exact number of `planningContext()` calls each pass `60000, <maxBudget>` as the 3rd arg; `.text` is read into the prompt; `.truncated` is referenced.
  - plan.js specifically asserts `cfg` feeds `contextBudget(cfg?.context_window)` (no dead variable) and that `runChecker` takes + is passed the `log` at both call sites.
  - map-codebase specifically asserts the truncation note is appended inline to the returned query output.

## Verification
- `npm test` → **227 passing, 0 failing** (was 219 before this plan's 8 new wiring tests; no regressions).
- Per-tool import probes (`node -e import`) all load; grep checks confirm `contextBudget`, `60000, maxBudget`, `.text`, and `.truncated` wiring across all five tools.

## TDD Gate Compliance
Not a TDD plan (`type: execute`). Task 3 is a verification-only test suite written after the implementation tasks; there is no test→code red/green ordering to enforce. The task sequence intentionally places the source-assertion tests after the implementation.

## Known Stubs
None. No TODO/FIXME/placeholder markers were introduced in any changed file; no tests were skipped. (The only TODO/FIXME strings in `lib/` are pre-existing prompt prose in `_agents.js` and the marker detector in `gates.js`, untouched here.)

## Threat Flags
None. This plan adds no security-sensitive capability: it only re-wires existing call sites to the pure `planningContext`/`contextBudget` functions introduced in PLAN 01. No new dependencies (`package.json` `dependencies` remains `{}`), no I/O, no host-service escalation, no user-supplied input reaching a shell or path.

## Self-Check
- Created files exist: `test/context-wiring.test.mjs` — PASSED; all five `lib/*.js` modified — PASSED.
- Commits exist for all 3 tasks — PASSED (`3dfafd4`, `73d4ffd`, `c0416f7`).
- `npm test` green on the working tree — PASSED (227 pass, 0 fail).
- Frontmatter delimited by opening/closing `---` fences with `status: complete` — PASSED.

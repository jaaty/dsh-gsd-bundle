---
phase: 16-context-budget
plan: 01
subsystem: planning-context
tags: [context-budget, truncation, dedup, pure-core, CQ-06]
dependency graph:
  requires: []
  provides: planningContext(entries, maxPerFile, maxTotal) -> { text, truncated }; contextBudget(window)
  affects: lib/_runner.js, lib/_shared.js
tech-stack: ESM, node:test, zero runtime deps
key-files:
  created: [test/context-budget.test.mjs]
  modified: [lib/_runner.js, lib/_shared.js]
decisions:
  D-01: total budget caps summed entry content only (labels/fences excluded)
  D-02: budget derived from config context_window via shared helper; fallback 90000
  D-03: planningContext stays pure; call sites pass derived maxTotal in
  D-04: per-file cap first, then drop whole trailing entries, then trim last kept entry
  D-05: planningContext returns { text, truncated }
  D-06: inline audit notice appended inside the block when truncated
  D-07: exact-content dedup (first occurrence wins)
  D-08: empty/null/undefined/whitespace entries skipped; maxTotal<=0 = no total cap; String() coercion
metrics:
  duration: "~9 min"
  completed: "2026-08-27"
  actuals: { tasks: 3, commits: 3, tests: 219 passing (18 new) }
status: complete
---

# Phase 16 Plan 01: context-budget total-budget truncation Summary

Rewired the pure domain core of `planningContext`: a total truncation budget over summed entry content (D-04), a `{ text, truncated }` return shape (D-05), an inline audit notice (D-06), exact-content dedup (D-07), whitespace/empty entry skipping (D-08), and the single-source `contextBudget` helper (D-02/D-03), all proven by a new `node --test` unit suite.

## What changed

### `lib/_runner.js` — `planningContext(entries, maxPerFile = 60000, maxTotal = 0)`
- Now returns `{ text, truncated }` instead of a plain string.
- Per-file cap retained unchanged (default 60000, `…(truncated)…` marker) — D-08.
- **Total budget (D-04):** when `maxTotal > 0` and the summed entry-content length exceeds it, whole entries are dropped from the END (head/earliest preserved), and only if the remaining head still exceeds the budget is that last kept entry trimmed to exactly fit. `maxTotal <= 0` means "no total cap".
- **Dedup (D-07):** an entry whose coerced content string is byte-identical to an already-kept entry is skipped (first occurrence wins).
- **Skip (D-08):** empty / `null` / `undefined` / whitespace-only entries are skipped; non-string content is coerced with `String()`.
- **`truncated` (D-05):** one `{ label, originalChars, keptChars }` per kept entry with `keptChars < originalChars`, covering per-file caps, total-budget drops (keptChars 0) and head trims — in entry-processing order.
- **Inline audit (D-06):** when any truncation occurs, `…(N entries truncated: label1, …)…` is appended inside the block (before `</planning_context>`), so the fresh subagent sees the elision.

### `lib/_shared.js` — `contextBudget(contextWindow)`
- Single source for the 0.45 fraction and the 90000 fallback (D-02/D-03). Returns `Math.max(1, Math.round(window * 0.45))` for a finite positive window, else `90000`. Never returns ≤ 0 (a degenerate window still yields a floor of 1 so a tiny window can't silently disable capping).

### `test/context-budget.test.mjs` (new)
- 18 unit tests across 10 behaviour groups: return shape, per-file cap retention, head-preserving total-budget trim, last-kept-entry trim, no-total-cap (maxTotal ≤ 0), exact-content dedup, empty/null/undefined/whitespace skipping, `String()` coercion, inline audit presence, and `contextBudget`.

## Verification
- `npm test` → 219 passing, 0 failing across the whole suite (was 201 before this plan's 18 new tests; no regressions).
- Verify commands per task (`node -e` probes of the return shape, truncation ordering, dedup, whitespace skip, and contextBudget) all passed.

## TDD Gate Compliance
Not a TDD plan (`type: execute`). Task 3 is a verification-only test suite written after the implementation commits; there is no test→code red/green ordering to enforce. The task sequence in this plan intentionally has the tests come after the pure implementation.

## Known Stubs
None. No TODO/FIXME/placeholder markers were left; no tests were skipped.

## Threat Flags
None. This plan introduces no security-sensitive capability: all changes are pure, deterministic functions with no I/O, no host-service access, and no new dependencies (`package.json` `dependencies` remains `{}`). `planningContext` never throws on malformed entries and coercion is inert.

## Self-Check
- Created files exist: `test/context-budget.test.mjs` — PASSED; `lib/_runner.js`, `lib/_shared.js` modified — PASSED.
- Commits exist for all 3 tasks — PASSED (`b170aea`, `3766a05`, `0e22b76`).
- `npm test` green on the working tree — PASSED (219 pass, 0 fail).
- Frontmatter delimited by opening/closing `---` fences with `status: complete` — PASSED.

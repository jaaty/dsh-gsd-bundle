---
phase: 05-window-ledger
plan: 01
subsystem: state-ledgers
tags: [DUR-03, DUR-04, WINDOWS.md, async-jobs.json, GsdState, data-tier]
requires: []
provides: [readWindows, appendWindow, readJobs, appendJob, updateJob, nextSeq, parseWindows, stringifyWindows]
affects: [lib/state.js, lib/_shared.js, test/state.test.mjs, test/_shared.test.mjs]
tech-stack: [node, esm, node:test]
key-files:
  modified: [lib/_shared.js, lib/state.js, test/_shared.test.mjs, test/state.test.mjs]
decisions:
  - D-01: WINDOWS.md is an append-only markdown ledger, one entry per closed window (WIN-<seq>), written/read only through GsdState accessors.
  - D-02: The ledger is a root-level .planning/ artefact behind dedicated accessors, not a per-phase artefact.
  - D-04: async-jobs manifest is a JSON array at .planning/async-jobs.json (zero-dep built-in JSON).
  - D-06: Missing/corrupt artefacts degrade to { entries: [], corrupt: true }, never throw.
metrics:
  duration: ~12 min
  completed_date: 2026-08-24
  tasks: 3
  commits: 3
status: complete
---

# Phase 5 Plan 1: Window Ledger & Async-Jobs Data Tier Summary

Established the durable storage core for DUR-03 (multi-window ledger) and DUR-04 (async-jobs registry): pure parse/sequence helpers plus GsdState root-level accessors that are missing/corrupt tolerant (never throw), so the presentation layer in plan 02 can surface them safely.

## What was built

- **`lib/_shared.js`** — three exported pure helpers owned by the WINDOWS.md format:
  - `nextSeq(entries, prefix)` — derives the next `WIN-`/`JOB-` numeric sequence (`max(matched id) + 1`, `1` when empty/absent).
  - `parseWindows(text)` — parses WINDOWS.md into window entries; coerces `phase`/`step` to Number; throws `SyntaxError` on structurally malformed input (unknown `##` section, unknown field key, or stray body line) so the accessor can flag corruption; returns `[]` on absence (not corruption).
  - `stringifyWindows(entries)` — serializes entries back to WINDOWS.md, round-tripping through `parseWindows`.
- **`lib/state.js` (`GsdState`)** — five root-level accessors (D-02 dedicated-accessor constraint; all missing/corrupt tolerant per D-06, mirroring `readConfig`'s try/catch JSON pattern):
  - `readWindows(cwd)` / `appendWindow(cwd, entry)` — append-only `.planning/WINDOWS.md` ledger with `WIN-<seq>` ids, timestamps, and an optional `checkpoint` reference (D-07).
  - `readJobs(cwd)` / `appendJob(cwd, job)` / `updateJob(cwd, jobId, patch)` — `.planning/async-jobs.json` JSON-array registry (D-04); `updateJob` records `completed` when a terminal status (`done`|`failed`) is set. Registry-only — never spawns or schedules work (D-03).

## Tests

- `test/_shared.test.mjs`: `nextSeq` derivation, stringify/parse round-trip, WIN block parsing, and corruption throws (unknown section/field/stray line).
- `test/state.test.mjs`: fresh-project empty reads, `WIN-01`→`WIN-02` and `JOB-01`→`JOB-02` sequencing, `updateJob` status+completed round-trip, unknown-id → `null`, and corrupt `WINDOWS.md`/`async-jobs.json` degrade to `{ entries: [], corrupt: true }` without throwing.

**Test result:** `npm test` → 73 pass, 0 fail (full suite).

## TDD Gate Compliance

No TDD gate required — this plan is a non-TDD data-tier plan (no `test:`-then-`feat:` RED/GREEN split specified in PLAN.md). All tasks were `type="auto"` implementation plans with co-located unit tests.

## Known Stubs

None. No TODO/FIXME/placeholder/skipped tests introduced.

## Threat Flags

- **Corrupt-artefact degradation** (the highest-blast-radius risk): fully contained — reads funnel through the single accessor choke point (`readWindows`/`readJobs`), which catches parse failures and returns `{ entries: [], corrupt: true }`; `gsd_status` (plan 02) will only render accessor results, so it cannot crash over a bad ledger.
- No shell, network, or subprocess surface touched; all helpers are pure/built-in (`JSON.parse`/`stringify`, markdown line scan).
- WINDOWS.md parse throws are intentionally converted to a `corrupt: true` flag inside the accessor — the throw is never propagated to callers.

## Self-Check: PASSED

- `lib/_shared.js` exports `nextSeq`/`parseWindows`/`stringifyWindows` (3 `grep` matches; 73-line block ≥ 30 min).
- `lib/state.js` defines `async readWindows`/`appendWindow`/`readJobs`/`appendJob`/`updateJob` (71-line block ≥ 40 min) and uses `JSON.parse` in `readJobs`.
- Three atomic commits, one per task (`feat(GSD-05-window-ledger-01): …`), all on `phase-5`.
- All four plan `must_haves` truths and both `key_links` verified by grep + tests.
- Full `npm test` passes (73/73).

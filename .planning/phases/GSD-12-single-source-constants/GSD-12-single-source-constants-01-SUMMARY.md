---
phase: 12-single-source-constants
plan: 01
subsystem: lib/_shared.js, lib/gates.js, lib/_agents.js
tags: [dedup, single-source, security, refactor]
dependency_graph:
  requires: []
  provides: ["canonical secretPatterns + forbiddenFilesProse in _shared.js"]
  affects: ["lib/gates.js", "lib/_agents.js", "test/gates.test.mjs", "test/dedup.test.mjs"]
tech-stack: [ESM, node:test]
key-files:
  created: ["test/dedup.test.mjs"]
  modified: ["lib/_shared.js", "lib/gates.js", "lib/_agents.js", "test/gates.test.mjs"]
decisions: [D-01, D-04]
metrics:
  duration: "~5 min"
  completed: 2026-08-27
  tasks: 3
  commits: 3
status: complete
---

# Phase 12 Plan 01: single-source-constants Summary

Made the secret-file list single-source: moved `secretPatterns` into the pure helper module `lib/_shared.js`, had `gates.js` import it for the security gate, and derived the mapper/query FORBIDDEN FILES prose from the same array via a new `forbiddenFilesProse()` helper so the prompt text and the gate globs can never drift (D-01, D-04). Pure dedup refactor — no behavior change.

## Changes

- **`lib/_shared.js`** — added the canonical `secretPatterns` array (26 items, moved verbatim from `gates.js`) and a `forbiddenFilesProse()` helper returning `secretPatterns.join(", ")`.
- **`lib/gates.js`** — removed the local `secretPatterns` array; now `import { secretPatterns } from "./_shared.js"`. No re-export — `_shared.js` is the sole source.
- **`lib/_agents.js`** — added `import { forbiddenFilesProse } from "./_shared.js"`; replaced the verbatim forbidden-files list in `CODEBASE_MAPPER_PROMPT` and `CODEBASE_QUERY_PROMPT` with `${forbiddenFilesProse()}` interpolation.
- **`test/gates.test.mjs`** — `secretPatterns` now imported from `../lib/_shared.js`.
- **`test/dedup.test.mjs`** (new) — pins the single-source invariant and prose-derivation behaviour.

## Requirements Addressed

- **CQ-02** — GATE_NAMES and the secret-file list single-source; cwdOf routed through the shared helper (this plan covers the secret-file list; GATE_NAMES/cwdOf are plan 02).

## Verification

- `npm test` — **185 pass, 0 fail** (181 baseline + 4 new dedup tests).
- All grep acceptance criteria for Tasks 1–3 satisfied.

## Key Decisions

- **D-01** — `secretPatterns` lives only in `_shared.js`; `gates.js` imports it, no re-export.
- **D-04** — both prompts render their forbidden-files prose from the canonical array via `forbiddenFilesProse()`; no verbatim list remains in `_agents.js`.

## TDD Gate Compliance

Not a TDD plan (`type: execute`); no RED/GREEN sequence required.

## Known Stubs

None.

## Threat Flags

None. The security *data* moved to the data tier (`_shared.js`); the security *enforcement* (`securityGate`/`matchSecretPatterns`) remains in the domain tier (`gates.js`) — no security-tier violation.

## Self-Check: PASSED

- `lib/_shared.js` exports `secretPatterns` and `forbiddenFilesProse` (grep verified).
- `lib/gates.js` no longer defines `secretPatterns`; imports it from `./_shared.js`.
- `lib/_agents.js` imports `forbiddenFilesProse` and uses it in both prompts.
- `test/dedup.test.mjs` exists and passes.
- 3 atomic commits created: `b1033fb`, `83baad4`, `318f436`.

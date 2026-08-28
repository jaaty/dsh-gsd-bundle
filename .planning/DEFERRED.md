# Deferred Items Register

Milestone-level backlog of items intentionally deferred from earlier phases.
Each entry names the phase it belongs to and the reason it was held back, so
the item is not lost when that phase's Discuss runs.

---

## D-24-001 — Fix the `broken_windows` skipped-test regex false positive

- **Target phase:** 24 `composability-hardening`
- **Type:** bug (correctness of the gate's detection regex)
- **Logged from:** Phase 21 Ship (2026-08-28) — this item surfaced as a real
  blocker during `gsd_ship` preflight.
- **Reason deferred:** The defect lives in the shipped `lib/gates.js` module
  (phase 08 territory), not in phase 21's scope; it was worked around by
  skipping the `broken_windows` gate on the phase-21 ship via D-06.

### Problem

`lib/gates.js` line 85:

```js
const SKIPPED_TEST_RE = /(test\.skip\(|describe\.skip\(|xit\()/;
```

The `/xit\(/` alternative has no word boundary, so it matches the `xit(` **substring
inside `exit(`**. Any test source containing `process.exit(...)` is therefore
mis-detected as a Jasmine `xit(` skipped-test marker.

Concrete failure: `test/tools.test.mjs:765` contains

```js
argv: ["node", "-e", "process.exit(0)"]
```

`"exit(0)"` contains `xit(`, so the gate reports a `skipped-test` finding and
blocks ship.

- Introduced by: `7507c2c` `feat(GSD-18-job-runtime-extensions-03)` (phase 18) — a
  real, passing child-process test, not a skipped test.
- Impact: any future ship whose `changedFiles` includes a code/test file using
  `.exit(` inside a string is blocked by a false positive.
- First observed: phase 21 ship → the `broken_windows` gate was skipped (`gsd_ship`
  `skip_gates: ["broken_windows"]`, D-06) as a sanctioned workaround; gate should
  NOT be silently skipped once the regex is fixed.

### Proposed fix

Anchor `xit` so it only matches as a standalone token (word boundary before `x`),
not inside `exit(`:

```js
const SKIPPED_TEST_RE = /(test\.skip\(|describe\.skip\(|\bxit\()/;
```

`\bxit\(` requires a word boundary before `x`; in `exit(` the char before `x` is
`e` (a word char), so the boundary fails and it no longer matches — while a real
standalone `xit(` (start of string or preceded by a non-word char) still matches.

### Verification

- Run `npm test`; the suite (350 tests, phase-21 state) must stay green.
- Add/adjust a `gates.test.mjs` case asserting `process.exit(0)` is NOT flagged as
  `skipped-test` and a standalone `xit(` IS flagged.
- Confirm a phase ship preflight passes the `broken_windows` gate without the
  `skip_gates` workaround when a test file uses `process.exit(`.

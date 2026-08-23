---
phase: 01-live-mount
plan: 01
subsystem: test/activation-harness
tags: [test, mount, activation, offline-harness, mOUNT-01, mOUNT-02]
requires:
  - "lib/*.js (the 12 plugin modules)"
  - "cordis.patch.yml (the 12 insert rows + agent-loop override)"
  - "package.json (exports map)"
  - "test/helpers/fake-fs.mjs (FakeFs)"
provides:
  - "test/mount.test.mjs — offline activation harness proving all 12 plugins activate + persona orients at STATE.md"
affects:
  - "test suite (npm test): +7 tests, 41 total, 0 fail"
tech-stack:
  - "node:test (ESM)"
  - "node:assert/strict"
  - "node:fs (promises) + node:path (line-based patch.yml reader, no YAML dep)"
  - "FakeFs in-memory host fs"
key-files:
  created:
    - test/mount.test.mjs
  modified: []
decisions:
  - "Used a single shared fake ctx (makeMountCtx) satisfying all 12 plugins' inject arrays at once, with ctx.effect invoking its callback synchronously (R-3) so gsd-commands captures all 12 commands."
  - "Read cordis.patch.yml with a targeted line-based parser (no YAML/js-yaml dependency) to preserve the zero-runtime-dep invariant (D-05/OQ-1)."
  - "Orientation uses the SAME gsdState instance provided by gsd-state's apply() (via gsd_init.execute), not a separately-built GsdState (R-1) — a separate instance renders 'no project'."
  - "Smoke call = gsd_init.execute() through the provided gsdState (D-04), which both proves MOUNT-04's smoke and MOUNT-02's orientation in one shot."
metrics:
  duration: one executor session
  completed: 2026-08-23
  tasks: 3
  commits: 3
  tests_added: 7
  tests_total: 41
status: complete
---

# Phase 01 Plan 01: live-mount activation harness Summary

Delivered the offline activation harness (`test/mount.test.mjs`) that proves all 12 `cordis.patch.yml` plugin rows resolve their subpath exports and `apply()` against one shared fake ctx to register the full host contribution surface, plus a `gsd_init` smoke call that orients the persona context provider at STATE.md.

## What was built

`test/mount.test.mjs` (318 lines, 3 describe blocks, 7 tests):

1. **`mount: all 12 plugins activate`** — a `makeMountCtx(fs)` factory builds one shared fake ctx whose `tools`/`commands`/`sections`/`contexts` arrays double as their own `register` methods, `provide`/`get` route the `gsdState` service through a single module-level handle, and `ctx.effect` invokes its callback synchronously (critical for `gsd-commands`). `applyAll(ctx)` imports each `@dsh-gsd/bundle/<sub>` subpath in patch order and runs `apply()`. Asserts zero throws, `gsdState` provided (and `instanceof GsdState`), 12 tools, 12 commands, 1 section, 1 context.

2. **`mount: cordis.patch.yml rows resolve`** — `readPatchRows()` is a zero-dep line-based reader extracting the `agent-loop` override row (presence + raw config) and the 12 insert rows (`{id, spec}`). Asserts the override configures a `gsd` agent, the parsed insert rows deep-equal the hardcoded expected 12, each row's `name` resolves through `package.json` exports and `import()`, and the captured tool/command names match the expected 12-name lists.

3. **`mount: persona orients at STATE.md (MOUNT-02)`** — asserts the persona section is `gsd:persona` (order -100) with phase-loop text, the context provider is `gsd:state` (order 10), runs `gsd_init.execute()` (the smoke call) through the *provided* `gsdState` and renders the context provider to match `/GSD loop position: milestone .+ \/ (phase .+ \/ step .+|no active phase)/`, the uninitialised-cwd branch renders the "no .planning/ project found" hint, and all 12 tools pass schema-validity (string name/description, object parameters, `output.schema`).

## Verification

- `node --test test/mount.test.mjs` → 7 pass, 0 fail.
- `npm test` (full suite) → 41 pass, 0 fail (no regression to the existing 34 tests).

## Requirement coverage

- **MOUNT-01** — all 12 plugin subpath exports resolve via `import('@dsh-gsd/bundle/<sub>')`, each exposes `{name, inject, apply}`, all 12 `apply()` succeed, the full registration surface is captured (1 section, 1 context, 12 tools, 12 commands, `gsdState` provided), and the `agent-loop` override row is present with a `gsd` agent. ✔
- **MOUNT-02** — the persona installs the `gsd:persona` section (order -100, phase-loop text) and the `gsd:state` context provider (order 10); after a project is initialised through the provided `gsdState`, the provider renders the loop position at the current STATE.md. ✔
- **MOUNT-04 (smoke, per D-04)** — `gsd_init.execute()` is the single minimal smoke call, plus schema-registration validity for all 12 tools (apply not throwing proves `defineTool` compiled each schema). ✔
- **D-05** — offline patch-merge preconditions asserted (rows present + resolvable); no live dsh-base merge. ✔

## TDD Gate Compliance

This plan is not a TDD plan (no `test:`/`feat:` RED→GREEN gates); it is a single test-only artefact. The three tasks were committed atomically per task with `test(01-01):` scope. No TDD gate warning.

## Known Stubs

None. No TODO/FIXME/placeholder/skipped tests in `test/mount.test.mjs`.

## Threat Flags

None. The harness is offline-only (FakeFs + fake ctx, no LLM/git/gh/live DSH per D-01/D-02). The `spawn` references are the fake `subagents` service's `getProvider("spawn")` stub, not a real process spawn. No `child_process`/`exec`/`eval`/secret handling is exercised by this test.

## Self-Check: PASSED

- `test/mount.test.mjs` exists (318 lines, ≥120 min).
- 3 atomic commits exist on `test/mount.test.mjs`:
  - `04a4f1a test(01-01): add mount activation harness — shared fake ctx applies all 12 plugins`
  - `4eb626c test(01-01): assert cordis.patch.yml rows resolve via exports + import()`
  - `3dd10e5 test(01-01): assert persona orientation at STATE.md + schema-validity for all 12 tools`
- `npm test` green (41 pass, 0 fail).
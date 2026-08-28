---
phase: 19-codebase-intel-extensions
plan: 04
subsystem: codebase-intel
tags: [targeted-remap, gsd-intel-updater, changedFilesToDocs, mount-regression]
requires: ["GSD-19-codebase-intel-extensions-03"]
provides: ["gsd_intel_updater tool for targeted re-map", "changedFilesToDocs → updater subagent that rewrites only affected docs", "auto-detect drifted paths from manifest", "mount test reflects 14th tool"]
affects: ["lib/map-codebase.js", "lib/_agents.js", "test/tools.test.mjs", "test/mount.test.mjs"]
tech-stack: [node:test, dsh-tools, node:crypto]
key-files:
  - created: []
  - modified: ["lib/map-codebase.js", "lib/_agents.js", "test/tools.test.mjs", "test/mount.test.mjs"]
decisions: [D-04, D-05]
metrics:
  duration: 22m
  completed: 2026-08-28
status: complete
---

# Phase 19 Plan 04: gsd-intel-updater targeted re-map (CBQX-02)

Adds the `gsd_intel_updater` tool for targeted codebase re-map (CBQX-02): it is
registered alongside `gsd_map_codebase` in the SAME plugin (D-04 — no
cordis.patch.yml row, package.json export, or insert-count change), accepts a
list of drifted repo-relative paths (or auto-detects them by diffing the live
tree against the stored `.map-manifest.json`), maps them to the affected
`.planning/codebase/` docs via the `changedFilesToDocs` heuristic table (D-05),
and spawns a fresh-context per-doc updater subagent that rewrites ONLY the
affected docs, leaving unrelated docs byte-identical. Includes the mount-test
regression (R-2: 13 → 14 tools) and tool-level coverage for explicit-path,
no-affected-docs, and auto-detect flows.

## Task log

1. **Task 1** — registered `gsd_intel_updater` alongside `gsd_map_codebase` in
   `apply()` with a `paths` parameter and the same object output schema + render
   as the map tool (CBQX-03/D-06). execute reads the manifest via
   `s.readCodebaseManifest`, computes drifted paths (explicit `validatePaths`
   wins, else auto-detect from `buildManifest(walkRepo(...))` +
   `compareManifest`), and returns the helpful no-manifest notice and the
   no-drift notice. Added the no-manifest smoke test + a no-drift test.
   → commit `905b208`.
2. **Task 2** — imported `changedFilesToDocs` + `GSD_INTEL_UPDATER_PROMPT`;
   replaced the placeholder with the real flow: filter candidates to the
   `VALID_DOC_NAMES` that currently exist, return "No affected map documents to
   update" when none, else build the updater prompt and spawn a `gsd-intel-updater`
   subagent that rewrites only those docs, returning a `{kind:"updater", text,
   docs}` object. Added `GSD_INTEL_UPDATER_PROMPT` to `lib/_agents.js` (per-doc,
   template-faithful, FORBIDDEN FILES + "return confirmation only" contract), a
   fake `gsd-intel-updater` branch in `makeSubagents` that rewrites only the
   named docs, and tests asserting the unaffected TESTING.md stays byte-identical.
   → commit `33c52cf`.
3. **Task 3** — updated `test/mount.test.mjs` for the 14th tool: added
   `gsd_intel_updater` to `EXPECTED_TOOL_NAMES`, bumped both tool-count
   assertions to 14, retitled the schema test to "all 14 registered tools", and
   refreshed the stale tool-name comments. Added an auto-detect coverage test
   (seed STACK.md + a manifest recording an older `src/lib/auth.ts`, run with no
   paths, assert STACK.md rewritten and the auto-detected path reached the
   updater prompt). → commit `5c2d6fa`.

## Verification

- `node --check lib/map-codebase.js lib/_agents.js` → 0.
- `node --test test/tools.test.mjs` → 67 pass (64 after task 1/2 + auto-detect).
- `node --test test/mount.test.mjs` → 7 pass.
- `node --test test/intel.test.mjs test/service-tools.test.mjs` → green.
- Full suite `node --test test/*.test.mjs` → **318 pass, 0 fail** (plan-03
  baseline 313, +5 from this plan).
- Acceptance greps: `"gsd_intel_updater"` matches in map-codebase.js; the smoke
  test asserts `/No .planning\/codebase\/.map-manifest.json/`; `changedFilesToDocs`
  matches in map-codebase.js; `GSD_INTEL_UPDATER_PROMPT` matches in _agents.js;
  the updater test asserts `/Targeted codebase update complete/`, `/STACK\.md/`,
  `/ARCHITECTURE\.md/`, and TESTING.md byte-identical before/after; the mount test
  includes `gsd_intel_updater` and both tool-count assertions check 14.

## Deviation note (FORBIDDEN FILES grep count)

The plan's criterion `grep -c "FORBIDDEN FILES" lib/_agents.js returns 3` is not
met exactly: the actual count is 5. This is because the pre-existing
`CODEBASE_MAPPER_PROMPT` already carried TWO occurrences (its "FORBIDDEN FILES —
never read..." rule at line 284 AND the "Respect FORBIDDEN FILES" line at 291),
the new updater prompt adds two (a header comment line + its own rule), and the
query prompt keeps one. The functional contract — the updater prompt carries the
FORBIDDEN FILES rule exactly like the mapper and query prompts — is fully
satisfied (updater rule present at line 332). The "3" target assumed one
occurrence per prompt and ignored the mapper's pre-existing second hit.

## Deviation note (mount `=== 14` count)

The plan's criterion `grep -c "=== 14" test/mount.test.mjs returns 2` is not met
exactly: the count is 1. Line 196 uses `assert.ok(ctx.tools.length === 14, ...)`
while line 317 uses `assert.equal(ctx.tools.length, 14)`. Both assertions DO
check the 14-tool count (verified); the "2" target assumed both were written in
the `=== 14` form. Functionally satisfied.

## TDD Gate Compliance

Not a TDD plan (type: execute, autonomous, no RED→GREEN mandate). Tests were
co-committed with the features in each task's atomic commit; full suite green.

## Known Stubs

None introduced. Grep hits in `lib/_agents.js` (lines 168/194/274/275: "Scan for
stubs", "TBD/FIXME", mapper "TODO/FIXME" exploration, "Replace placeholders") are
pre-existing prompt-template text, not new stubs; `test/tools.test.mjs` TODO-01
hits are pre-existing test-fixture ids. The Task-1 placeholder return in the
updater execute was fully replaced by the real subagent flow in Task 2.

## Threat Flags

- Path-scope safety: explicit `paths` to gsd_intel_updater are validated by the
  shared `validatePaths`/`PATH_FORBIDDEN`, so they cannot escape the repo or
  smuggle shell metacharacters.
- Auto-detect uses the same D-03 ignore set + secret-safe walk as the map tool
  (`.planning/`, `.git/`, `node_modules/`, lockfiles never count as drift), so no
  secret-file contents are surfaced.
- The updater subagent prompt retains the FORBIDDEN FILES /
  `forbiddenFilesProse()` rule, so leaked secret contents are never returned to
  the user.
- `GSD_INTEL_UPDATER_PROMPT` instructs the updater to touch ONLY the listed docs,
  leaving unrelated docs byte-identical (D-05) — enforced by the fake in tests.
- All `.planning/` writes continue to route through `ctx.fs`/gsdState (DUR-06);
  no new raw `node:fs` artefact writes.

## Self-Check: PASSED

- `lib/map-codebase.js` registers `gsd_intel_updater` alongside `gsd_map_codebase`
  (D-04), imports `changedFilesToDocs`, uses `VALID_DOC_NAMES` + `readCodebaseDoc`
  filtering, spawns a `gsd-intel-updater` subagent, and returns the structured
  `{kind, text, docs}` object on every path.
- `lib/_agents.js` exports `GSD_INTEL_UPDATER_PROMPT` (≥30 lines, carries the
  FORBIDDEN FILES rule + "return confirmation only" contract).
- Three commits exist on `phase-19`: `905b208`, `33c52cf`, `5c2d6fa`.
- Full test suite green (318 pass).

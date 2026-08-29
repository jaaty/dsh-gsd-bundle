---
phase: 28-publish-research
verified: 2026-08-29T06:10:00.000Z
status: passed
score: 6/6 must-haves verified
behavior_unverified: 0
overrides_applied: 0
---

# Phase 28: publish-research Verification Report

## Goal Achievement

**Goal:** Research how other dsh plugins are distributed (npm publish vs clone-and-install-from-source) and document a research-backed distribution decision. (Requirement: PUB-05)

The goal is achieved: a research-backed distribution decision (npm publish as primary, clone-and-install-from-source as documented secondary) is documented in a new root `DISTRIBUTION.md` with triangulated evidence from all three sources, and the repo metadata (`package.json` publish-readiness fields + README Install/Quickstart) is aligned to the chosen path. No actual `npm publish` was run, no CI/release workflow was added, and no functional `lib/*` or `test/*` files were touched — all verified independently of SUMMARY.md claims.

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | DISTRIBUTION.md exists at the repo root and records a research-backed distribution decision (npm publish as primary, clone-and-install-from-source as documented secondary) with triangulated evidence from all three sources (web, local node_modules inspection, live npm registry queries). | ✓ VERIFIED | `test -f DISTRIBUTION.md` succeeds; file is 120 lines. Decision stated at lines 9–10. Source 1 (web) section at lines 18–25 with 4 cited URLs. Source 2 (local) section at lines 27–36. Source 3 (npm registry) section at lines 38–61 with the third-party plugin table. |
| 2 | DISTRIBUTION.md records the no-collision finding for @dsh-gsd/bundle (D-06) and the EROFS-vs-curl registry-query workaround (D-07). | ✓ VERIFIED | "Name-collision check (D-06)" section lines 63–70: `{"error":"Not found"}` + "no collision". "EROFS workaround note (D-07)" section lines 82–91: EROFS on `~/.npm/_cacache`, recommends `curl https://registry.npmjs.org/<url-encoded-name>`. |
| 3 | package.json carries publishConfig.access: public and a prepublishOnly script, so the bundle is npm-publish-ready with no further metadata work. | ✓ VERIFIED | `package.json` lines 72–74: `"publishConfig": { "access": "public" }`. Line 9: `"prepublishOnly": "node --test test/*.test.mjs"`. `node -e` assertion one-liner exits 0 confirming publishConfig.access, prepublishOnly value, cordis.patch.yml in files, .planning/ not in files, dependencies still `{}`. |
| 4 | README Install/Quickstart documents the chosen primary distribution path (npm: `dsh plugin --profile <name> add @dsh-gsd/bundle`), keeps the clone-and-install path as a documented alternative, and links to DISTRIBUTION.md. | ✓ VERIFIED | README line 53: `dsh plugin --profile <name> add @dsh-gsd/bundle`. Lines 57–65: "Alternative — install from source" with clone path. Line 48: `See [DISTRIBUTION.md](DISTRIBUTION.md) for the research-backed distribution decision.` |
| 5 | No functional changes are made to lib/* or test/* (D-08 regression guard); `git diff --stat lib/ test/` is empty after the phase. | ✓ VERIFIED | `git diff --stat lib/ test/` against the phase-28 base returns empty output, exit 0. The phase diff (1ec853a..HEAD) touches only DISTRIBUTION.md, README.md, package.json + planning artefacts. |
| 6 | npm test still passes after the metadata edits (MOUNT-06 regression guard). | ✓ VERIFIED | `npm test` (= `node --test test/*.test.mjs`) exits 0: 406 tests, 0 fail, 0 cancelled. |

**Score:** 6/6 truths VERIFIED.

## Deferred Items

- Actually running `npm publish` of `@dsh-gsd/bundle` to the registry — a future step after the decision is validated (explicitly out of scope per D-04; recorded in DISTRIBUTION.md line 105). Belongs to a future post-release phase, not a later milestone phase in the current ROADMAP (phase 28 is the final phase).
- A GitHub Actions release/publish workflow (e.g. on tag push) — could follow phase 27's CI work (DISTRIBUTION.md line 106). Phase 27 (ci-and-security) is the preceding phase; this is a genuinely deferred future item.
- Publishing versioned releases to npm in lockstep with milestone release tags — downstream of an actual publish (DISTRIBUTION.md line 107). Deferred future item.

None of these deferred items block PUB-05; they are explicitly recorded as out-of-scope future work in DISTRIBUTION.md.

## Required Artifacts

| Artifact | Exists | Substantive | Wired | Notes |
|----------|--------|-------------|-------|-------|
| `DISTRIBUTION.md` | ✓ | ✓ 120 lines (min 60) | ✓ linked from README | Contains decision + 3-source evidence + D-06 + D-07 + out-of-scope list. |
| `package.json` | ✓ | ✓ 75 lines (min 40) | ✓ valid JSON, publishConfig + prepublishOnly | publishConfig.access:public (L72-74), prepublishOnly (L9); name/version/files/exports/peerDependencies/dependencies/license unchanged. |
| `README.md` | ✓ | ✓ 219 lines (min 200) | ✓ Install section links DISTRIBUTION.md | npm-primary path (L53), clone alternative (L57-65), DISTRIBUTION.md link (L48); Quickstart/tools/how-it-works/license sections preserved. |

## Key Link Verification

| From | To | Via | Pattern | Status |
|------|----|----|---------|--------|
| `README.md` | `DISTRIBUTION.md` | Markdown link in Install section | `\[DISTRIBUTION\.md\]\(DISTRIBUTION\.md\)` | WIRED (README line 48) |

## Data-Flow Trace

This phase is docs + repo metadata; there is no runtime data flow. The relevant "flow" is the decision → metadata alignment:

1. RESEARCH.md (triangulated evidence) → DISTRIBUTION.md (decision doc, the single durable home per D-02) — VERIFIED: DISTRIBUTION.md reproduces the three-source evidence, the no-collision finding, and the EROFS workaround from RESEARCH.md.
2. DISTRIBUTION.md decision → package.json publish-readiness fields — VERIFIED: `publishConfig.access: public` + `prepublishOnly: node --test test/*.test.mjs` match the decision's "npm publish as primary" path and mirror the observed ecosystem pattern (dsh-plugin-appshot's publishConfig, dsh-plugin's prepublishOnly).
3. DISTRIBUTION.md decision → README Install/Quickstart — VERIFIED: the primary command `dsh plugin --profile <name> add @dsh-gsd/bundle` (npm registry) and the clone alternative both appear, with the DISTRIBUTION.md link.
4. D-08 boundary respected: no `lib/*` or `test/*` files were modified — the `git diff --stat lib/ test/` is empty, so the decision did not leak into functional code.

## Behavioral Spot-Checks

This phase has no behavior-dependent truths requiring a named behavioural test (it is docs + metadata). The one runnable regression guard is `npm test` (MOUNT-06), run as a spot-check:

- **`npm test`** — ran `node --test test/*.test.mjs`: **406 pass / 0 fail**, exit 0. The metadata edits (package.json publishConfig/prepublishOnly, README rewrite, new DISTRIBUTION.md) did not break import resolution or any existing test.

No other named tests apply; there is no new test file because the phase is metadata, not behaviour (consistent with the plan's validation architecture).

## Requirements Coverage

| REQ-ID | Text | Delivered | Evidence |
|--------|------|-----------|---------|
| PUB-05 | A research-backed distribution decision (npm publish vs clone-and-install-from-source) is documented, matching the behavior of other dsh plugins. | ✓ | DISTRIBUTION.md documents the decision with triangulated evidence from web + local + npm registry sources, showing both official `@deepseek-ai/*` and third-party `dsh-*` plugins publish to npm; README and package.json are aligned to the chosen npm-primary path. REQUIREMENTS.md marks PUB-05 as `[x]`. |

## Anti-Patterns Found

| Check | Result |
|-------|--------|
| Unreferenced TBD/FIXME/XXX/placeholder markers in changed files (DISTRIBUTION.md, README.md, package.json) | None found (`grep -niE "TBD\|FIXME\|XXX\|placeholder"` → no matches) |
| Stubs / skipped tests introduced | None (SUMMARY.md declares none; confirmed — no `lib/*`/`test/*` changes) |
| Scope creep into functional code (D-08) | None — `git diff --stat lib/ test/` empty |
| Actual `npm publish` run (out of scope per D-04) | Not run — no release CI workflow added, no registry write |

No blocker debt markers found.

## Human Verification Required

None. This phase is docs + repo metadata; nothing requires visual, real-time, or external human verification. The registry evidence was collected programmatically (via curl to the read-only registry HTTP API); the no-collision finding and EROFS workaround are recorded with their exact command outputs. No `<verify><human-check>` blocks were harvested from PLAN.md (the plan contains 0 human-check blocks). The decision is research-backed and the repo-metadata conformance is statically verifiable.

## Gaps Summary

None. All 6 must-have truths are VERIFIED, all 3 artifacts pass (exists / substantive / wired), the single key link is WIRED, PUB-05 is delivered, no anti-patterns were found, and no human-verification items exist. The phase is ready to ship.

**Final status: passed.**
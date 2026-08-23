---
phase: 02-service-tools
verified: 2026-08-23T00:00:00.000Z
status: passed
score: 9/9 must-haves verified
behavior_unverified: 0
overrides_applied: 0
---

# Phase 2: service-tools Verification Report

## Goal Achievement

**Goal:** Prove the gsdState service round-trips `.planning/` artefacts and every `gsd_*` phase tool registers with a valid schema and passes a smoke call. (MOUNT-03, MOUNT-04)

The goal is **ACHIEVED**. Both requirements are covered by green, named, behavioural tests executed this session against the real codebase:

- MOUNT-03 — `node --test --test-name-pattern="planning artefact round-trip" test/state.test.mjs` → **8 pass, 0 fail**. PROJECT, REQUIREMENTS, ROADMAP, STATE, config.json, CONTEXT, RESEARCH, VERIFICATION all proven write→read with no data loss (modulo the documented parser asymmetries).
- MOUNT-04 — `node --test test/service-tools.test.mjs` → **7 pass, 0 fail**. The 5 gap tools (gsd_new_milestone, gsd_progress, gsd_quick, gsd_ui_phase, gsd_verify) get execute() smokes; gsd_ship's fail-loud preflight guard is smoked.
- Full suite `node --test test/*.test.mjs` → **56 pass, 0 fail** (was 41 at phase-1 baseline; +8 from plan 02-01, +7 from plan 02-02).

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Every raw-text per-phase artefact (CONTEXT, RESEARCH, VERIFICATION) round-trips verbatim through writeArtifact→readArtifact | ✓ VERIFIED | `test/state.test.mjs:183-204` three `writeArtifact(CWD,1,suffix,body)`→`readArtifact` equality tests pass; suite line "writeArtifact/readArtifact round-trips {CONTEXT,RESEARCH,VERIFICATION} verbatim" ✔ |
| 2 | PROJECT.md read fidelity: known string → readProject verbatim | ✓ VERIFIED | `test/state.test.mjs:176` `assert.equal(await svc.readProject(CWD), PROJ)`; test "readProject returns PROJECT.md verbatim" ✔ |
| 3 | Structured artefacts (REQUIREMENTS, ROADMAP, STATE, config.json) round-trip write→read no-loss modulo documented asymmetries | ✓ VERIFIED | REQUIREMENTS full deepEqual (`:214`); ROADMAP projected subset excluding slug/milestone (`:232`); STATE projected subset excluding last_updated/last_activity + active_phase handled via String() equality (`:256-267`); config field equalities (`:289-294`); all 4 tests green ✔ |
| 4 | gsd_new_milestone.execute returns /New milestone/, ROADMAP grows, STATE milestone updated | ✓ VERIFIED | `test/service-tools.test.mjs:105-131`; test asserts `res` matches `/New milestone/`, `rm.phases.length===2`, `rm.phases[1].n===2`, `rm.milestoneName==="M2"`, `st.frontmatter.milestone==="v2.0"` ✔ |
| 5 | gsd_progress.execute returns # GSD PROGRESS + Phase 01 auth line, no throw | ✓ VERIFIED | `test/service-tools.test.mjs:133-153`; two green tests (default + phase-scoped with seeded PLAN) ✔ |
| 6 | gsd_quick.execute against real temp cwd returns /gsd_quick done/ and writes <dir>/TASK.md on real fs | ✓ VERIFIED | `test/service-tools.test.mjs:197-252`; uses `fsPromises.mkdtemp` + `realFsAdapter`, asserts TASK.md read back from real fs matching `/# Quick task/` + `/fix the typo in README/`, cleaned up in `try/finally` ✔ |
| 7 | gsd_ui_phase.execute with fake ui-researcher(≥50)+ui-checker(PASSED) returns complete, writes UI-SPEC, STATE→plan | ✓ VERIFIED | `test/service-tools.test.mjs:155-171`; asserts `/gsd_ui_phase complete/`, `/VERIFICATION PASSED/`, `01-auth-UI-SPEC.md` exists, `st.frontmatter.status==="plan"` ✔ |
| 8 | gsd_verify.execute with PLAN-01+SUMMARY-01 + fake verifier(status:passed) returns verified, writes VERIFICATION, STATE→ship | ✓ VERIFIED | `test/service-tools.test.mjs:173-195`; seeds via `markPlanSummary(CWD,1,1,FENCED_SUMMARY)`, asserts `/Phase 1 verified/`, `01-auth-VERIFICATION.md` exists, `st.frontmatter.status==="ship"` ✔ |
| 9 | gsd_ship.execute with passed VERIFICATION on non-repo FakeFs cwd throws /gsd_ship preflight failed:/ | ✓ VERIFIED | `test/service-tools.test.mjs:255-267`; seeds VERIFICATION_PASSED, `assert.rejects(..., /gsd_ship preflight failed:/)` green (reachable branch-gate guard per D-03/OQ-2) ✔ |

**Score: 9/9 must-haves VERIFIED.**

## Deferred Items

- Full live DSH boot / real session for loop-e2e — phase 03 (MOUNT-05). Not in scope here.
- Re-proving schema-validity for all 12 tools — shipped phase 1 (D-01). Correctly NOT re-proven (no schema-layer test added in phase 2; smokes call `t.execute(args, exec)` directly).
- Routing gsd_quick's TASK.md write through ctx.fs/gsdState — flagged in RESEARCH R1/OQ-1 as a consistency finding, deliberately deferred (D-01 gap-focused scope). gsd_quick is smoked via a real temp cwd instead, which proves the success path without a source change. The ctx.fs-bypass is recorded as a finding below, not a blocker.
- gsd_map_codebase --query intel mode — separate milestone feature. Out of scope.

## Required Artifacts

| Artifact | Exists | Substantive | Wired | Notes |
|---------|--------|-------------|-------|-------|
| `test/state.test.mjs` | ✓ (301 lines) | ✓ (≥40 min_lines; +8 tests in `planning artefact round-trip` describe; exports N/A — test file) | ✓ (imports GsdState/FakeFs/buildProject; invokes accessors against FakeFs) | All PLAN-01 acceptance substrings present (verified via grep): `describe("planning artefact round-trip"`, `svc.readProject(CWD)`, `writeArtifact(CWD, 1, "CONTEXT"/"RESEARCH"/"VERIFICATION"`, `writeRequirements(CWD, reqs)`, `back.phases.map(...)`, `delete inFm.last_updated`, `delete inFm.active_phase`, `String(back.frontmatter.active_phase), doc.frontmatter.active_phase`, `cfg.gsd_state_version, "1.0"` |
| `test/service-tools.test.mjs` | ✓ (267 lines) | ✓ (≥120 min_lines; 7 tests across 6 describes) | ✓ (registerTool/makeCtx/makeSubagents harness ported from tools.test.mjs; imports lib/* + helpers) | All PLAN-02 acceptance substrings present: 6 `describe("gsd_..."` blocks, `label.startsWith("ui-researcher"/"ui-checker"/"quick")`, `fsPromises.mkdtemp`, `realFsAdapter`, `/gsd_ship preflight failed:/`, `rm(tmp, { recursive: true, force: true })`, `markPlanSummary(CWD, 1, 1, FENCED_SUMMARY)`, `01-auth-UI-SPEC.md`, `st.frontmatter.status, "ship"` |

## Key Link Verification

| Link | Status | Evidence |
|------|--------|----------|
| lib/state.js accessors → test/state.test.mjs round-trip describe (via gsdState over FakeFs) | WIRED | `test/state.test.mjs:167` `describe("planning artefact round-trip"...)` invokes `svc.writeArtifact/readArtifact/writeRequirements/readRequirements/writeRoadmap/readRoadmap/writeState/readState/initProject/readConfig/readProject` against FakeFs; pattern match confirmed; tests green |
| lib/{core-tools,quick,ui,verify,ship}.js apply → test/service-tools.test.mjs execute smokes (via defineTool→t.execute) | WIRED | `test/service-tools.test.mjs` `registerTool` imports each lib module, runs `mod.apply(ctx,{})`, captures tool, calls `t.execute(args, exec)`; 6 describe blocks match pattern `gsd_(new_milestone\|progress\|quick\|ui_phase\|verify\|ship)`; all green |

## Data-Flow Trace

**MOUNT-03 (artefact round-trip):** test builds FakeFs → `buildProject`/`initProject` writes PROJECT/ROADMAP/STATE/REQUIREMENTS/config → test mutates/overwrites artefacts via gsdState writers (`writeArtifact`/`writeRequirements`/`writeRoadmap`/`writeState`/direct FakeFs write for PROJECT) → gsdState serializes through lib/_shared.js stringify + writes via ctx.fs → test re-reads via gsdState readers → projected-subset deepEqual / verbatim equality asserts no data loss. Data flows test→gsdState→FakeFs→gsdState→test, end-to-end confirmed green.

**MOUNT-04 (tool smokes):** test builds FakeFs project (or real temp cwd for gsd_quick) → registers tool via `mod.apply(ctx)` → calls `t.execute(args, exec)` → tool reads/writes state via `ctx.get("gsdState")`, spawns via `ctx.get("subagents")` (fake, label-switched canned results) → tool returns string + mutates STATE/ROADMAP/artefacts → test asserts return string, side-effect artefact existence (`fs.files.has`), and STATE frontmatter transitions. Data flows test→tool→gsdState/subagents→state→test, end-to-end confirmed green for all 6 smokes.

## Behavioral Spot-Checks

One named test per behavior-dependent truth was executed this session (not the full suite per truth — the per-pattern and full-suite runs confirm green):

- Truth 1-3 (round-trip): `node --test --test-name-pattern="planning artefact round-trip" test/state.test.mjs` → 8 pass.
- Truth 4-5 (new_milestone, progress): `node --test --test-name-pattern="gsd_(new_milestone|progress)" test/service-tools.test.mjs` → 3 pass.
- Truth 7-8 (ui_phase, verify): `node --test --test-name-pattern="gsd_(ui_phase|verify)" test/service-tools.test.mjs` → 2 pass.
- Truth 6, 9 (quick, ship): `node --test --test-name-pattern="gsd_(quick|ship)" test/service-tools.test.mjs` → 2 pass.

All spot-checks green. No PRESENT_BEHAVIOR_UNVERIFIED truths.

## Requirements Coverage

| REQ-ID | Delivered | Evidence |
|--------|-----------|----------|
| MOUNT-03 | ✓ | `test/state.test.mjs` `planning artefact round-trip` describe (8 tests) proves gsdState round-trips the full artefact surface (PROJECT, REQUIREMENTS, ROADMAP, STATE, config.json, CONTEXT, RESEARCH, VERIFICATION) write→read with no data loss. |
| MOUNT-04 | ✓ | `test/service-tools.test.mjs` (7 tests) proves every previously-untested gsd_* tool execute() passes a smoke call (5 success-path + 1 gsd_ship fail-loud guard). The 6 already-tested tools (phase 1) are correctly not re-tested (D-01). |

Both phase requirements covered.

## Anti-Patterns Found

None. A grep for `TBD|FIXME|XXX|@ts-ignore|TODO` across both new/modified test files found only legitimate requirement-ID strings (`TODO-01` as a requirement id in `test/state.test.mjs:77,212`), not debt markers. No skipped/todo tests (`node --test` reports `skipped 0, todo 0`). No new runtime dependencies introduced (zero-dep invariant preserved). No stubs/placeholders.

## Human Verification Required

None. All truths are behaviour-dependent and were confirmed programmatically by named tests executed this session. No visual, real-time, or external-system verification is needed — the phase is test-only and fully offline (the only real-fs touch is gsd_quick's isolated, cleaned-up temp dir, which the test itself reads back and asserts).

## Findings (non-blocking)

1. **gsd_quick ctx.fs-bypass (RESEARCH R1/OQ-1):** `gsd_quick.execute` writes TASK.md via real `node:fs/promises` (lib/quick.js:55-57), bypassing gsdState/ctx.fs — the only artefact not mediated by gsdState. This is a consistency finding, not a blocker; the success-path smoke works around it with a real temp cwd + `realFsAdapter`. Aligning TASK.md onto the gsdState artefact model is deferred to a later phase (per D-01 gap-focused scope). Recorded for future readers.
2. **D-03 gh-string adaptation (RESEARCH R2/OQ-2):** The literal D-03 string `gh CLI not available or not authenticated` is unreachable in this environment (`gh` is installed + authenticated). The gsd_ship smoke instead asserts the reachable branch-gate guard `/gsd_ship preflight failed:/` ("could not determine current branch"), which is the equivalent fail-loud preflight proof of the same D-03 pattern. The guard *pattern* is proven; the exact gh-string branch is environment-dependent and would only fire where `gh` is genuinely absent/unauthed. This adaptation is research-justified and recorded so it is not misread as the gh-string branch being satisfied.

## Gaps Summary

No gaps. All 9 must-have truths VERIFIED, both artifacts substantive and wired, both key links WIRED, no blocker anti-patterns, no human-verification items. Both phase requirements (MOUNT-03, MOUNT-04) delivered and confirmed by green named tests.

**Status: passed.**
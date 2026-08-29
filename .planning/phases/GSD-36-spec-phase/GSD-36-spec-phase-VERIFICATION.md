---
phase: 36-spec-phase
verified: 2026-09-01
status: passed
score: 16/16 must-haves verified
behavior_unverified: 0
overrides_applied: 0
---

# Phase 36: spec-phase Verification Report

## Goal Achievement

Phase goal: "Add a spec-phase step that produces a SPEC.md with falsifiable requirements gated by an ambiguity-scoring score before discuss." — **ACHIEVED.**

Verified against the actual code (SUMMARY claims were not relied upon): a full loop-step plugin `lib/spec.js` registers the `gsd_spec_phase` tool + `/gsd-spec-phase` command + `gsdSpec` capability at order 5 (before discuss); it writes a falsifiable `<NN>-SPEC.md` (Requirements with Current/Target/Acceptance, Boundaries, Constraints, Ambiguity Report) gated by a joint ambiguity score (<=0.20 AND all four per-dimension minimums), with write-anyway soft-gate and UNAVAILABLE-scorer degradation; STATE advances to `spec` and routes to `discuss-phase`; and `gsd_discuss` consumes an existing SPEC.md as locked what/why (D-09). Requirement GAP-02 is delivered.

## Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 01-1 | gsdSpec capability descriptor (role step, order 5, tools ['gsd_spec_phase'], commands ['gsd-spec-phase'], next ['gsdDiscuss'], produces ['SPEC.md']) exists | ✓ VERIFIED | `lib/_capabilities.js:27` (`gsdSpec` in CAPABILITY_KEYS between gsdJobs/gsdDiscuss), `:75-88` (TABLE row: step 'spec', role 'step', order 5, tools/commands/next/produces exactly) |
| 01-2 | Persona renders a spec step paragraph when gsdSpec present; opener chain names Spec | ✓ VERIFIED | `lib/_render.js:147-148` `STEP_PARAGRAPHS.gsdSpec`; `:193` opener "Spec -> Discuss -> ..."; `:200` capability-gated rendering |
| 01-3 | setActivePhase(...,'spec') resolves next_action 'discuss-phase' via explicit `_nextActionFor('spec')` | ✓ VERIFIED | `lib/state.js:348` returns `{ spec: "discuss-phase", ... }` |
| 01-4 | _capabilities + render test suites pass spec-aware (11 keys, spec first) | ✓ VERIFIED | `test/_capabilities.test.mjs` + `test/render.test.mjs` green in full suite; CAPABILITY_KEYS length 11 |
| 02-1 | gsd_spec_phase writes SPEC.md with falsifiable Requirements (Current/Target/Acceptance), Boundaries, Constraints, Ambiguity Report table | ✓ VERIFIED | `lib/spec.js:127-195` (assembleSpecBody + buildReport emit all sections); `test/spec.test.mjs` happy path asserts "## Requirements", "## Ambiguity Report", "Current:", "Acceptance:" |
| 02-2 | Ambiguity <=0.20 AND all four dims >= minimum written with gate PASSING, no flags | ✓ VERIFIED | `lib/spec.js:89-99` computeWeighted, `:177-194` buildReport PASSING; SPEC_WEIGHTS 0.35/0.25/0.20/0.20, SPEC_MINIMUMS 0.75/0.70/0.65/0.70; happy-path test green |
| 02-3 | Score >0.20 OR any dim below min → SPEC.md still written, overage + below-min dims flagged as planner assumptions | ✓ VERIFIED | OVERRUN + UNDER-MIN tests in `test/spec.test.mjs` pass; `:183-185` flagLine, `:312-318` return flagNote; `:97` joint gate (both conditions) |
| 02-4 | Scorer error/timeout → SPEC.md still written, report UNAVAILABLE + real cause, never hard-block | ✓ VERIFIED | `lib/spec.js:284-295` try/catch sets scoring 'UNAVAILABLE' + cause; buildReport `:170-175` UNAVAILABLE path; UNAVAILABLE test green, no throw |
| 02-5 | Advances STATE to 'spec' (status spec, next_action discuss-phase) + commits on phase-N branch via shared seam | ✓ VERIFIED | `lib/spec.js:304` `setActivePhase(...,'spec')`, `:310` `commitArtifacts(scope:'spec')`, `:230` `ensurePhaseBranch`; test asserts status 'spec' |
| 02-6 | gsd_spec_phase tool + /gsd-spec-phase command registered across full mount; inject includes 'subagents' | ✓ VERIFIED | `lib/spec.js:28` inject `["gsdState","tools","subagents"]`; mount test ctx.tools.length 15, ctx.commands.length 13, tool/command names present; coeffect suite green |
| 02-7 | Non-auto call with no reqs errors with Socratic guidance; auto=true derives defaults from ROADMAP | ✓ VERIFIED | `lib/spec.js:237-254` (non-auto throw, auto derive via readRequirements + REQ-ID->text fallback to REQ-ID); dispatch tests green |
| 03-1 | Existing SPEC.md → gsd_discuss reads + echoes Requirements/Boundaries/Acceptance into CONTEXT marked LOCKED from SPEC | ✓ VERIFIED | `lib/discuss.js:114-115` (hasArtifact-guarded `readArtifact(cwd, args.phase, "SPEC")`), `:164` "**LOCKED from SPEC (what/why)**", `:197` how-only guidance; `test/spec-discuss.test.mjs` assert LOCKED marker + sentinel |
| 03-2 | No SPEC.md → gsd_discuss behaves exactly as before (no SPEC read, no LOCKED markers) | ✓ VERIFIED | `lib/discuss.js:114` specText null when absent; absence test asserts no "LOCKED from SPEC" / "SPEC.md locked what/why" |
| 03-3 | No extra ensurePhaseBranch/commitArtifacts introduced | ✓ VERIFIED | grep: single `ensurePhaseBranch(cwd, args.phase)` and single `commitArtifacts(...'discuss'...)`; `test/discuss-artifacts.test.mjs` green |

## Score

**16/16 must-haves verified** (14 truths + 2 artifacts). All verified directly against source; none relied on SUMMARY claims.

## Deferred Items

None required this phase; documented deferrals (edge/prohibition probes, SPEC->plan lift, README docs) correctly map to later phases and are not part of GAP-02. Confirmed deferred in CONTEXT `## Deferred` and RESEARCH §0.

## Required Artifacts

| Artifact | Exists | Substantive | Wired |
|----------|--------|-------------|-------|
| `lib/spec.js` | ✓ | ✓ 330 lines (>=140); exports `name`/`inject`/`apply` | ✓ Provides gsdSpec, registers gsd_spec_phase, spawns scorer, writes artefact |
| `lib/_agents.js` (SPEC_SCORER_PROMPT) | ✓ | ✓ `:252` full scorer role prompt (>=5) | ✓ Imported + used by spec.js `:22,272` |

## Key Link Verification

| from → to | via | Result |
|-----------|-----|--------|
| `lib/_capabilities.js` → `lib/_render.js` | gsdSpec order 5 (role step) sorts into loopSteps before gsdDiscuss, making gsdSpec the first routable step / effectiveRoutableStep('done') fallback | WIRED — CAPABILITY_KEYS `gsdSpec`, TABLE order 5; `test/render.test.mjs` asserts `effectiveRoutableStep("done").key === "gsdSpec"` and loopSteps[0]==gsdSpec; green |
| `lib/spec.js` → `lib/state.js` | execute calls `s.writeArtifact(cwd, args.phase, "SPEC", specFull)` then setActivePhase('spec') then addDecision + commitArtifacts | WIRED — `lib/spec.js:300` `writeArtifact(...'"SPEC"'...)`, `:304`, `:306`, `:310` |
| `lib/spec.js` → `lib/_agents.js` | execute builds promptText from SPEC_SCORER_PROMPT and calls `spawnSubagent(... outputSchema: SPEC_SCORER_SCHEMA)` | WIRED — `lib/spec.js:271-282` prompt, `:288` `spawnSubagent(ctx, exec, { label: "spec-ambiguity-scorer", outputSchema: SPEC_SCORER_SCHEMA })` |
| `lib/discuss.js` → `lib/state.js` | gate on `s.hasArtifact` + read via `s.readArtifact(cwd, args.phase, "SPEC")`, echo LOCKED-from-SPEC into specifics/code_context | WIRED — `lib/discuss.js:114-115`, `:158`, `:164`; test asserts LOCKED marker |

## Data-Flow Trace

`gsd_spec_phase(phase, {auto})` → validate (isProject, phase-in-ROADMAP) → `ensurePhaseBranch` → resolve requirements (explicit args | auto-derived from ROADMAP+REQUIREMENTS.md | non-auto throw) → falsifiability guard → assemble SPEC body → `spawnSubagent(SPEC_SCORER_PROMPT, SPEC_SCORER_SCHEMA)` → `resolveScore`/`computeWeighted` → joint gate (amb <=0.20 AND all dims >= min) → `writeArtifact(SPEC)` → `setActivePhase('spec')` + `addDecision` → `commitArtifacts(scope:'spec')` → return score+gate+flags. Downstream: `gsd_discuss` `hasArtifact`→`readArtifact('SPEC')` → echo LOCKED sections into CONTEXT specifics/code_context → how-only guidance. Data flows end-to-end, artifact write routed via `ctx.fs` (no raw node:fs).

## Behavioral Spot-Checks

Full spec/mount/coeffect/render/state/discuss suites ran green (see suite run below), including the named tests for each behavior-dependent truth: OVERRUN soft-gate, dimension-under-min joint gate, UNAVAILABLE degradation, falsifiability reject, auto/interactive dispatch, LOCKED-from-SPEC consumption, and absence-preservation.

## Requirements Coverage

| REQ-ID | Delivered |
|--------|-----------|
| GAP-02 | ✓ spec-phase step precedes discuss; produces falsifiable SPEC.md (Current/Target/Acceptance) gated by ambiguity score <=0.20 across weighted dimensions with per-dimension minimums |

## Anti-Patterns Found

No unreferenced TBD/FIXME/XXX markers in this phase's code. The only matches are subagent *instruction prompts* in `lib/_agents.js` telling other agents to scan for such markers — not debt markers in the delivered code. No BLOCKER debt markers.

## Human Verification Required

None. All behaviour is deterministically testable offline (FakeFs + fake scoring subagent); there are no visual/real-time/external components, and no `<verify><human-check>` blocks were harvested from the plans.

## Gaps Summary

No gaps found.

**Spot-check suite result:** `node --test test/spec.test.mjs test/spec-discuss.test.mjs test/_capabilities.test.mjs test/render.test.mjs test/mount.test.mjs test/coeffect.test.mjs test/state.test.mjs test/discuss-artifacts.test.mjs test/removal.test.mjs` → 117 pass, 0 fail. Full suite `node --test test/*.test.mjs` → **473 pass, 0 fail.**

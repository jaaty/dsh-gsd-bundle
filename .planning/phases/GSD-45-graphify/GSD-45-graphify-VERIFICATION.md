---
phase: 45-graphify
verified: 2026-09-01T05:30:00Z
status: passed
score: 6/6 must-haves verified
behavior_unverified: 0
overrides_applied: 0
---

# Phase 45: Graphify Verification Report

## Goal Achievement

**Goal:** Add a project knowledge graph built in `.planning/graphs/` with a tool to build, query, and inspect it (GAP-11).

**Verdict:** PASSED. The phase goal is achieved in the codebase. The `gsd_graphify` loop-step plugin builds a project-global knowledge graph in `.planning/graphs/` (graph.json + GRAPH_REPORT.md) via a deterministic pure-JS scan, exposes build/query/status actions, is opt-in via `graphify.enabled`, reports mtime + commit-based staleness, never advances STATE, and preserves the prior graph on a failed build. A behavioral spot-check against a live mount confirmed the tool works end-to-end, and the full test suite (781 tests) passes.

## Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| T1 | `gsd_graphify({ action: 'build' })` builds a project-global knowledge graph in `.planning/graphs/` (graph.json + GRAPH_REPORT.md) from a deterministic pure-JS scan of ROADMAP/REQUIREMENTS/STATE + each phase's CONTEXT/PLAN, with nodes (phases, plans, requirements, decisions, milestones), edges (phase→requirement, phase→plan, plan→decision, phase→milestone, plan depends_on), and confidence tiers EXTRACTED/INFERRED/AMBIGUOUS (D-03, D-06) | ✓ VERIFIED | `lib/graphify.js` `extractNodes`/`extractEdges`/`buildGraph`/`buildHyperedges`; `apply()` reads via `readRoadmap`/`readRequirements`/`readState`/`readArtifact`/`listPlans` and writes via `writeGraphArtifact`. Behavioral spot-check built a graph with node types milestone/phase/requirement, edge types phase_requirement/phase_milestone, confidence EXTRACTED; graph.json + GRAPH_REPORT.md both written. |
| T2 | When `graphify.enabled` is not explicitly true in config.json, `gsd_graphify` prints an activation hint and writes NOTHING to `.planning/graphs/` (D-05) | ✓ VERIFIED | `lib/graphify.js:290-293` reads via `s.readConfig` (not config get-value) and returns the hint before any scan/write. Behavioral spot-check: disabled → hint returned, `hasGraphArtifact` false. |
| T3 | `gsd_graphify({ action: 'query', term })` returns matched nodes grouped by type with edge relationships + confidence; no match → 'No graph matches for <term>'; no graph → 'run build first' (D-11) | ✓ VERIFIED | `queryGraph` pure helper + `apply()` query branch (lines 309-313). Behavioral spot-check: query GAP-11 → grouped `## requirement` with edges; no-match → "No graph matches for zzz-nomatch"; no-graph path returns "run build first". |
| T4 | `gsd_graphify({ action: 'status' })` reports mtime STALE/FRESH and commit-based built_at_commit/commit_stale (false/true/null); when built_at_commit is null the source-commit line is omitted (D-07) | ✓ VERIFIED | `computeStaleness` pure helper (lines 176-182) + status branch (lines 314-336) omits the source-commit line when `built_at_commit` is null. Behavioral spot-check: status returned counts + "mtime: FRESH". Unit tests cover STALE/FRESH + commit_stale false/true/null. |
| T5 | graphify does not advance STATE — advisory soft gate (D-10) | ✓ VERIFIED | `apply()` calls `s.addDecision` only; the only `setActivePhase` occurrence is a comment (line 370). No STATE advance. |
| T6 | A failed build preserves the prior valid graph and returns the real cause (D-09) | ✓ VERIFIED | Build wrapped in try/catch (lines 341-386); artefacts written only on success, so a fault leaves the prior graph intact and returns "build failed: <cause>". Unit test "disk full" confirms the prior graph.json is unchanged and the cause is surfaced. |

## Score

**6/6 must-haves verified.** No truth FAILED, no artifact MISSING/STUB, no key link NOT_WIRED, no blocker anti-pattern, no human-verification item.

## Deferred Items

All deferred items are explicitly out of scope for GAP-11 and belong to later phases (none block this phase):
- HTML visualization (graph.html) — deferred, no UI component this phase.
- diff/snapshot subcommands — deferred; GAP-11 only requires build/query/inspect.
- External graphify CLI / AST-extraction engine — not used; build is a pure-JS scan.
- Semantic search / embedding index — later phase.
- MVP-mode node rendering — deferred.
- Configurable graph_path (REQ-GRAPH-06) — deferred; fixed `.planning/graphs/` default used.
- Deliberate recall/consumption of the graph by other loop steps — mempalace (GAP-12, phase 46).

## Required Artifacts

| Artifact | Exists | Substantive | Wired |
|----------|--------|-------------|-------|
| `lib/graphify.js` | ✓ | 392 lines (≥200); exports `apply`, `extractNodes`, `extractEdges`, `buildGraph`, `resolveConfidence`, `computeStaleness`, `queryGraph` — all present | ✓ registered as `gsd_graphify` tool + `gsdGraphify` capability |
| `test/graphify.test.mjs` | ✓ | 29 tests across 8 suites | ✓ passes (29/29) |
| `lib/_capabilities.js` descriptor | ✓ | `gsdGraphify` order 54, role step, tools `['gsd_graphify']`, commands `['gsd-graphify']`, produces `['graph.json','GRAPH_REPORT.md']` | ✓ 20th CAPABILITY_KEY |
| `lib/state.js` accessors | ✓ | `graphsDir`, `writeGraphArtifact`, `readGraphArtifact`, `hasGraphArtifact`, `newestPlanningMtime`; `graphify: false` in `_defaultConfig` workflow | ✓ routed through `ctx.fs` |
| `lib/ship.js` hook | ✓ | `runGraphifyOnShip` pure helper, gated by `workflow.graphify`, never blocks | ✓ wired at step 10.6, exported |
| `lib/commands.js` | ✓ | `/gsd-graphify` command entry | ✓ auto-paired via `commandToCapability` |
| `lib/_render.js` | ✓ | `gsdGraphify` STEP_PARAGRAPHS entry | ✓ renders when capability present |
| `package.json` / `cordis.patch.yml` | ✓ | `./graphify` export; `gsd-graphify` patch row | ✓ |

## Key Link Verification

| From | To | Via | Status |
|------|----|-----|--------|
| `lib/graphify.js` | `lib/state.js` | `apply()` writes graph.json + GRAPH_REPORT.md via `s.writeGraphArtifact`; reads config gate via `s.readConfig` | WIRED |
| `lib/graphify.js` | `lib/_capabilities.js` | `ctx.provide("gsdGraphify", buildCapability("gsdGraphify"))` | WIRED |
| `lib/graphify.js` | `lib/_git-artifacts.js` | `commitArtifacts(cwd, null, { message: "docs(planning): graphify build" })` — no raw git | WIRED |

## Data-Flow Trace

1. `gsd_graphify({ action: 'build' })` → `apply()` execute → fail-fast guards (`isProject`, `readRoadmap`) → config gate (`readConfig` → `graphify.enabled`) → reads `readRequirements`/`readState`/`readArtifact`(CONTEXT)/`listPlans`/`readArtifact`(PLAN) → pure `extractNodes`/`extractEdges`/`buildHyperedges`/`buildGraph` → `writeGraphArtifact`(graph.json) + `writeGraphArtifact`(GRAPH_REPORT.md) → `addDecision` (no STATE advance) → `commitArtifacts` (shared seam).
2. `query`/`status` → `readGraphArtifact`(graph.json) → pure `queryGraph` / `computeStaleness` → report. Never auto-rebuilds, never spawns.
3. Ship auto-on-ship → `runGraphifyOnShip` (gated by `workflow.graphify`) → invokes registered `gsd_graphify` tool with `{ action: 'build' }`; faults caught, never blocks ship.

## Behavioral Spot-Checks

Ran one named behavioral check per behavior-dependent truth against a live mount (FakeFs + state + core-tools + graphify, bootstrapped project):
- **Config gate (T2):** disabled → returned activation hint, `hasGraphArtifact` false (nothing written).
- **Build (T1):** enabled → built graph.json + GRAPH_REPORT.md; node types milestone/phase/requirement; edge types phase_requirement/phase_milestone; confidence EXTRACTED.
- **Query (T3):** term GAP-11 → grouped `## requirement` match with edges; term zzz-nomatch → "No graph matches for zzz-nomatch".
- **Status (T4):** returned counts + "mtime: FRESH".
- **Full suite:** `npm test` → 781 pass, 0 fail. Cross-cutting suites (`_capabilities`, `mount`, `render`, `removal`, `ship`, `ship-async`) → 72 pass, 0 fail.

## Requirements Coverage

| REQ-ID | Delivered | Evidence |
|--------|-----------|----------|
| GAP-11 | ✓ | `gsd_graphify` tool builds/queries/inspects a project knowledge graph in `.planning/graphs/`; verified via code, tests, and behavioral spot-check |

## Anti-Patterns Found

None. No unreferenced TBD/FIXME/XXX/HACK markers in the delivered files (`lib/graphify.js`, `lib/state.js`, `lib/_capabilities.js`, `lib/ship.js`, `lib/commands.js`, `lib/_render.js`). No raw git in `lib/graphify.js` (`grep -c "git("` → 0). No subagent spawned (`inject = ["gsdState", "tools"]`). Config gate uses `readConfig`, not `config get-value`.

## Human Verification Required

None. The phase is a deterministic pure-JS scan with no visual, real-time, or external component. No `<verify><human-check>` blocks exist in the PLAN files. All behavior-dependent truths were confirmed programmatically.

## Gaps Summary

No gaps found. Status: **passed**.

# Phase 37: gap-analysis - Context

**Gathered:** 2026-09-04T06:00:42.488Z
**Status:** Ready for planning

<domain>
## Phase Boundary
**In scope:** Add a post-planning gap-analysis step tool gsd_gap_analysis + /gsd-gap-analysis slash command publishing the gsdGapAnalysis capability (lib/gap-analysis.js). After PLAN.md files are generated, it emits a <NN>-COVERAGE.md coverage table cross-referencing every phase REQ-ID (from ROADMAP phase.requirements, text from REQUIREMENTS.md) and every D-ID (parsed from the phase CONTEXT.md decisions block) against the runnable plans' bodies. The scan is a DETERMINISTIC literal-ID scan in pure JS (no subagent, no tokens, fully falsifiable); the semantic 'did they really address it' judgement stays gsd_verify's remit. It is a SOFT gate: it warns + flags uncovered IDs but never blocks gsd_execute. It writes <NN>-COVERAGE.md via writeArtifact with a status frontmatter (covered | gaps), advances STATE toward execute (pass-through overlay), and lands the artefact on the phase branch via the shared git seam.
**Out of scope:** No subagent / no semantic coverage judgement (that is gsd_verify's remit). No hard gate — gap-analysis never blocks gsd_execute. No modification of gsd_plan's existing frontmatter-only requirements coverage gate (left untouched, D-14). No global/whole-milestone REQ-ID scan — REQ-IDs are phase-scoped. No new runtime dependencies. No interactive/CLI transport.
</domain>

<decisions>
## Decisions
### Integration structure
- **D-01:** gap-analysis is a standalone loop-step capability gsdGapAnalysis declared in lib/_capabilities.js with step:'gap-analysis', role:'loop-step', tools:['gsd_gap_analysis'], commands:['gsd-gap-analysis'], order:22 (post-planning, between plan 20 and execute 30), produces:['<NN>-COVERAGE.md'], consumes:['ROADMAP.md','REQUIREMENTS.md','CONTEXT.md','PLAN.md']. The tool is registered in a new lib/gap-analysis.js via ctx.tools.register(defineTool({...})) and the /gsd-gap-analysis command in lib/commands.js routing to it, mirroring lib/spec.js (D-01).
- **D-02:** Injectable dependencies: ['gsdState','tools'] (mirrors spec.js). The subagents coeffect is deliberately ABSENT (DEGR-07): gap-analysis is a deterministic pure-JS scan (D-03), so the fiber must not depend on the host subagent service.
### Scan mechanism
- **D-03:** The coverage scan is a DETERMINISTIC literal-ID scan executed in pure JS — no fresh-context subagent, no tokens, fully falsifiable. The semantic 'did they really address it' judgement stays gsd_verify's remit. Pure helpers (parseDecisionIds, scanCoverage, findOrphans) are exported for direct unit testing with no ctx / no I/O.
- **D-04:** Coverage counts BOTH a frontmatter hit (plan.requirements includes the ID) and a body/prose hit (whole-word regex over the plan body with frontmatter stripped). A frontmatter-only ID is 'declared, not elaborated' but still counts as Covered. The body scan strips frontmatter first so an ID in requirements does not also match the body regex and get misclassified as 'both'.
### Scope & candidates
- **D-05:** REQ-IDs are PHASE-SCOPED: taken from ROADMAP phase.requirements, with the requirement text pulled from REQUIREMENTS.md (falling back to the ID itself). D-IDs are parsed from the phase CONTEXT.md decisions block via the shared parseDecisionEntries (single source of truth), deduped + ascending-sorted by numeric part, with whole-ID safety (D-01 vs D-010).
- **D-08:** When the phase CONTEXT.md is missing, D-ID coverage is noted UNAVAILABLE (frontmatter context:'unavailable' + a body note); REQ rows are still emitted. This degrades softly — it never throws.
- **D-09:** The report includes an Orphan IDs section: ID-like tokens (REQ-shaped /[A-Z]+-\d+/ and D-shaped /\bD-\d+\b/) mentioned in any runnable plan's frontmatter or prose that are NOT in the known candidate set (phase REQ-IDs + CONTEXT D-IDs), so cross-phase REQ-IDs, stale IDs, and typos are visible.
### Gate philosophy
- **D-06:** gap-analysis is a SOFT gate: it warns + flags uncovered IDs (status 'gaps', gap_ids list, coverage_pct) but NEVER blocks gsd_execute. It is advisory about coverage, not a hard quality gate.
- **D-14:** gsd_plan's existing frontmatter-only requirements coverage gate (lib/plan.js lines 163-168) is left UNTOUCHED to keep the phase bounded — gap-analysis is an additive post-planning report, not a replacement for plan's own gate.
### Artefact & STATE
- **D-07:** The tool writes a dedicated <NN>-COVERAGE.md via writeArtifact with a status frontmatter (status: covered | gaps, gap_ids, coverage_pct, phase, generated; plus context:'unavailable' when CONTEXT is missing). writeArtifact overwrites on re-run. It advances STATE toward execute (setActivePhase 'execute' — a pass-through overlay since plan already set step='execute') and commits the artefact via the shared git seam.
- **D-10:** Runnable plans exclude superseded plans (status !== 'superseded') and INCLUDE gap-closure plans, so the coverage table reflects the plans that will actually execute.
### Error handling
- **D-11:** Fail-fast only on the baseline environmental guards: no .planning/ project, phase not in ROADMAP, gsdState unavailable (mirroring spec.js). The no-plans case degrades softly — every ID is UNCOVERED with a WARNING, never a throw.
- **D-12:** The tool acquires the per-phase feature branch (ensurePhaseBranch) before any artefact write, the same seam every step tool uses (CQ-07/MW-02).
### Testing / TDD
- **D-13:** TDD: follow test/*.test.mjs + mount-harness conventions and model on test/spec.test.mjs. Cover: capability descriptor registration (tools/commands/order/produces/consumes), command pairing /gsd-gap-analysis, pure helpers (parseDecisionIds dedup/sort/whole-ID, scanCoverage frontmatter+body+declared-not-elaborated, findOrphans), phase-scoped REQ extraction, missing-CONTEXT degrade, soft-gate no-block, superseded-exclusion + gap-closure-inclusion, COVERAGE.md frontmatter shape, and STATE pass-through.
### Claude's Discretion
- **D-14b:** Exact COVERAGE.md section layout and truncation length (default 60 chars); precise wording of the WARNING notes and the Orphan IDs section; how the coverage_pct is rounded.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Upstream gap-analysis contract (WHAT/pattern — read-only reference, NOT to be vendored)
- `.analysis/gsd-core/commands/gsd/gap-analysis.md — the gap-analysis command: post-planning coverage table, REQ-ID/D-ID cross-reference, soft gate.`
- `.analysis/gsd-core/gsd-core/workflows/gap-analysis.md — the gap-analysis workflow: gather candidates, scan plans, emit coverage table, orphan detection.`
### Bundle tool + capability + command pattern to mirror
- `lib/spec.js — the loop-step plugin to model registration, injectable deps, ensurePhaseBranch, writeArtifact, commitArtifacts, and STATE pass-through on (D-01/D-02/D-07/D-12).`
- `lib/_capabilities.js — TABLE entry pattern (step/role/tools/commands/order/produces/consumes) and allCapabilities() (D-01).`
- `lib/commands.js + lib/core-tools.js — COMMANDS array + command pairing + tool registration patterns.`
### State, artefacts, and config
- `lib/_shared.js — parseFrontmatter, stringifyFrontmatter, parseDecisionEntries (single source of truth for CONTEXT decision parsing, D-05), zeroPad, nowIso, today.`
- `lib/state.js — readConfig/readRoadmap/readRequirements/readArtifact/hasArtifact/listPlans/setActivePhase/addDecision accessors.`
- `lib/_runner.js — cwdOf; lib/_git-artifacts.js — ensurePhaseBranch + commitArtifacts seams.`
### Existing tests
- `test/spec.test.mjs — the loop-step test model (capability descriptor, command pairing, pure helpers, mount) to model the gap-analysis tests on (D-13).`
- `test/helpers/mount-harness.mjs — mount harness + makeExec conventions.`
</canonical_refs>

<code_context>
## Code Context
- lib/gap-analysis.js already exists (274 lines, shipped in PR #40) — the CONTEXT.md being sealed documents the decisions that produced it; the pure helpers parseDecisionIds/scanCoverage/findOrphans and the apply() tool are the reference implementation.
- lib/_capabilities.js holds the descriptor TABLE; gsdGapAnalysis is already registered (order 22).
- lib/_shared.js parseDecisionEntries is the single source of truth for CONTEXT decision parsing (D-05).
- lib/spec.js is the loop-step template (registration, ensurePhaseBranch, writeArtifact, commitArtifacts, STATE pass-through) (D-01/D-07/D-12).
- test/gap-analysis.test.mjs already exists (442 lines) — the TDD coverage is in place (D-13).
- lib/plan.js lines 163-168 hold the existing frontmatter-only requirements gate that is deliberately left untouched (D-14).
</code_context>

<specifics>
## Specifics
- GAP-03 verbatim: 'After PLAN.md files are generated, a post-planning gap-analysis emits a coverage table cross-referencing every REQ-ID and D-ID from REQUIREMENTS.md and CONTEXT.md against plan bodies.'
- User Q1 (step vs non-step) answer: standalone loop-step tool (D-01).
- User Q2 (scan mechanism) answer: deterministic literal-ID scan, no subagent (D-03).
- User Q3 (REQ scope) answer: phase-scoped REQ-IDs (D-05).
- User Q4 (gate) answer: soft gate, never blocks execute (D-06).
- User Q5 (artefact) answer: dedicated COVERAGE.md (D-07).
- User Q6 (edge cases) answer: missing CONTEXT → REQ-only + warning; report phantom/orphan; count both frontmatter and prose; exclude superseded + include gap-closure (D-04/D-08/D-09/D-10).
- User did NOT select 'fail fast on no plans / no project' — the no-plans case degrades softly (all-UNCOVERED + warning); only baseline isProject/phase-in-roadmap guards remain fail-fast (D-11).
- gsd_plan's existing gate is left untouched (D-14).
</specifics>

<deferred>
## Deferred Ideas
- Semantic coverage judgement ('did they really address it') — stays gsd_verify's remit (D-03).
- Hard-gate enforcement of coverage — gap-analysis is advisory and never blocks execute (D-06).
- Global/whole-milestone REQ-ID scan — REQ-IDs are phase-scoped (D-05).
- Replacing gsd_plan's existing frontmatter-only requirements gate — left untouched (D-14).
- Interactive/CLI transport — the tool is in-process.
</deferred>


---

*Phase: 37-gap-analysis*
*Context gathered: 2026-09-04*
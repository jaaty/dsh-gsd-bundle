---
phase: 37-gap-analysis
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - lib/gap-analysis.js
  - lib/_capabilities.js
  - lib/commands.js
  - test/gap-analysis.test.mjs
autonomous: true
requirements: ["GAP-03"]
gap_closure: false
user_setup: []
must_haves:
  truths:
    - "gsd_gap_analysis, called on a phase after gsd_plan, writes a <NN>-COVERAGE.md coverage table cross-referencing every phase REQ-ID (ROADMAP phase.requirements) and every D-ID (CONTEXT.md decisions) against the runnable plans' bodies, and does NOT block gsd_execute."
    - "The coverage scan is a deterministic literal-ID scan in pure JS (no subagent): a REQ-ID or D-ID is Covered when it appears in a runnable plan's frontmatter requirements OR prose body (frontmatter-only counts as 'declared, not elaborated')."
    - "When the phase CONTEXT.md is missing, gsd_gap_analysis still emits REQ rows and notes D-ID coverage as UNAVAILABLE (frontmatter context:'unavailable' + body note) — it degrades, never throws."
    - "The report includes an Orphan IDs section listing ID-like tokens (REQ-shaped /[A-Z]+-\\d+/ and D-shaped /\\bD-\\d+\\b/) mentioned in runnable plans that are not in the known candidate set."
  artifacts:
    - path: "lib/gap-analysis.js"
      provides: "The gsd_gap_analysis loop-step tool: gsdGapAnalysis capability, deterministic literal-ID scan (parseDecisionIds/scanCoverage/findOrphans), <NN>-COVERAGE.md write, soft-gate no-block, orphan detection, missing-CONTEXT degrade."
      min_lines: 200
      exports: ["name", "inject", "apply", "parseDecisionIds", "scanCoverage", "findOrphans"]
  key_links:
    - from: "lib/gap-analysis.js"
      to: "lib/_capabilities.js"
      via: "ctx.provide('gsdGapAnalysis', buildCapability('gsdGapAnalysis')) with the descriptor row in the TABLE"
      pattern: "gsdGapAnalysis"
    - from: "lib/commands.js"
      to: "lib/gap-analysis.js"
      via: "COMMANDS entry name 'gsd-gap-analysis' auto-paired to gsdGapAnalysis through commandToCapability/allCapabilities"
      pattern: "gsd-gap-analysis"
    - from: "lib/gap-analysis.js"
      to: "lib/_shared.js"
      via: "parseDecisionEntries (single source of truth for CONTEXT decision parsing) used by parseDecisionIds"
      pattern: "parseDecisionEntries"
    - from: "lib/gap-analysis.js"
      to: "lib/state.js"
      via: "readRequirements/readRoadmap/readArtifact/hasArtifact/listPlans/setActivePhase/addDecision accessors"
      pattern: "readRequirements"
---
<objective>
Add a post-planning gap-analysis step tool (gsd_gap_analysis + /gsd-gap-analysis command + gsdGapAnalysis capability) that, after PLAN.md files are generated, emits a <NN>-COVERAGE.md coverage table cross-referencing every phase REQ-ID (ROADMAP phase.requirements, text from REQUIREMENTS.md) and every D-ID (CONTEXT.md decisions) against the runnable plans' bodies. The scan is a DETERMINISTIC literal-ID scan in pure JS (no subagent, no tokens, fully falsifiable); the semantic 'did they really address it' judgement stays gsd_verify's remit. It is a SOFT gate: it warns + flags uncovered IDs but never blocks gsd_execute. It writes <NN>-COVERAGE.md via writeArtifact with a status frontmatter (covered | gaps), advances STATE toward execute (pass-through overlay), and lands the artefact on the phase branch via the shared git seam.
</objective>

<task id="1">
  <title>Implement the gsd_gap_analysis loop-step tool</title>
  <action>Create lib/gap-analysis.js. Publish the gsdGapAnalysis capability via ctx.provide('gsdGapAnalysis', buildCapability('gsdGapAnalysis')) and register the gsd_gap_analysis tool via ctx.tools.register(defineTool({...})) with inject ['gsdState','tools'] (NO subagents coeffect — DEGR-07). Implement the pure, exported, unit-testable helpers: parseDecisionIds (delegates to shared parseDecisionEntries, dedup + ascending sort by numeric part, whole-ID safety), scanCoverage (frontmatter hit + body/prose hit with frontmatter stripped; frontmatter-only = 'declared, not elaborated' but still Covered), findOrphans (REQ-shaped /[A-Z]+-\d+/ and D-shaped /\bD-\d+\b/ tokens in runnable plans not in the known candidate set). In apply(): fail-fast only on baseline guards (no .planning/ project, phase not in ROADMAP, gsdState unavailable); acquire the per-phase feature branch (ensurePhaseBranch); gather phase-scoped REQ-IDs (ROADMAP phase.requirements, text from REQUIREMENTS.md) and CONTEXT D-IDs (parseDecisionIds, missing CONTEXT → context:'unavailable' degrade); gather runnable plans (exclude superseded, include gap_closure); scan + assemble the coverage table; write <NN>-COVERAGE.md via writeArtifact with status frontmatter (status: covered|gaps, gap_ids, coverage_pct, phase, generated); advance STATE toward execute (setActivePhase 'execute' pass-through); commit via commitArtifacts. Soft gate: never block gsd_execute.</action>
  <verify>node --input-type=module -e "import('./lib/gap-analysis.js').then(m=>{if(typeof m.apply!=='function')throw new Error('no apply'); if(typeof m.parseDecisionIds!=='function')throw new Error('no parseDecisionIds'); if(typeof m.scanCoverage!=='function')throw new Error('no scanCoverage'); if(typeof m.findOrphans!=='function')throw new Error('no findOrphans'); console.log('ok', m.name);})"</verify>
</task>

<task id="2">
  <title>Register the capability + command and add TDD coverage</title>
  <action>Add the gsdGapAnalysis descriptor row to the TABLE in lib/_capabilities.js (step:'gap-analysis', role:'loop-step', tools:['gsd_gap_analysis'], commands:['gsd-gap-analysis'], order:22, produces:['<NN>-COVERAGE.md'], consumes:['ROADMAP.md','REQUIREMENTS.md','CONTEXT.md','PLAN.md']) and append gsdGapAnalysis to CAPABILITY_KEYS. Add the /gsd-gap-analysis command to lib/commands.js routing to the tool. Create test/gap-analysis.test.mjs following test/spec.test.mjs + mount-harness conventions: capability descriptor registration, command pairing, pure helpers (parseDecisionIds dedup/sort/whole-ID, scanCoverage frontmatter+body+declared-not-elaborated, findOrphans), phase-scoped REQ extraction, missing-CONTEXT degrade, soft-gate no-block, superseded-exclusion + gap-closure-inclusion, COVERAGE.md frontmatter shape, and STATE pass-through.</action>
  <verify>node --test test/gap-analysis.test.mjs</verify>
</task>

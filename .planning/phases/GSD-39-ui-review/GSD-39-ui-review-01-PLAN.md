---
phase: 39-ui-review
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - lib/ui-review.js
  - lib/_capabilities.js
  - lib/commands.js
  - test/ui-review.test.mjs
autonomous: true
requirements: ["GAP-05"]
gap_closure: false
user_setup: []
must_haves:
  truths:
    - "gsd_ui_review, called on a phase after gsd_execute, reviews the phase's implemented frontend code against the UI-SPEC (or abstract 6-pillar standards) and writes a UI-REVIEW.md."
    - "The audit scores 6 pillars (Copywriting, Visuals, Color, Typography, Spacing, Experience Design) 1-4 each and classifies findings BLOCKER/WARNING."
    - "The review is a soft gate: it never blocks verify or ship."
  artifacts:
    - path: "lib/ui-review.js"
      provides: "The gsd_ui_review loop-step tool: gsdUiReview capability, fresh-context ui-auditor subagent, 6-pillar scoring, UI-REVIEW.md write."
      min_lines: 200
      exports: ["name", "inject", "apply", "PILLAR_NAMES", "UI_AUDITOR_SCHEMA", "resolvePillars", "computeOverall", "countFindings", "FRONTEND_GLOBS", "globToRegExp", "matchesAnyGlob"]
  key_links:
    - from: "lib/ui-review.js"
      to: "lib/_capabilities.js"
      via: "ctx.provide('gsdUiReview', buildCapability('gsdUiReview')) with the descriptor row in the TABLE"
      pattern: "gsdUiReview"
    - from: "lib/commands.js"
      to: "lib/ui-review.js"
      via: "COMMANDS entry name 'gsd-ui-review' auto-paired to gsdUiReview"
      pattern: "gsd-ui-review"
---
<objective>
Add a retroactive 6-pillar UI audit (gsd_ui_review + /gsd-ui-review command + gsdUiReview capability) that reviews a phase's implemented frontend code against the UI-SPEC (or abstract 6-pillar standards), scores 6 pillars (Copywriting, Visuals, Color, Typography, Spacing, Experience Design) 1-4 each, classifies findings BLOCKER/WARNING, and writes UI-REVIEW.md. It is a soft gate — advisory, never blocks verify or ship.
</objective>

<task id="1">
  <title>Implement the gsd_ui_review loop-step tool</title>
  <action>Create lib/ui-review.js. Publish the gsdUiReview capability via ctx.provide('gsdUiReview', buildCapability('gsdUiReview')) and register the gsd_ui_review tool via ctx.tools.register(defineTool({...})) with inject ['gsdState','tools','subagents'] (the ui-auditor subagent spawns). Implement the pure, exported, unit-testable helpers: PILLAR_NAMES, UI_AUDITOR_SCHEMA, resolvePillars, computeOverall, countFindings, FRONTEND_GLOBS, globToRegExp, matchesAnyGlob. In apply(): fail-fast on baseline guards; acquire the per-phase feature branch; discover frontend files; spawn a fresh-context ui-auditor subagent (spawnSubagent) that scores 6 pillars 1-4 each and classifies findings BLOCKER/WARNING; write UI-REVIEW.md via writeArtifact. Soft gate: never blocks verify or ship.</action>
  <verify>node --input-type=module -e "import('./lib/ui-review.js').then(m=>{if(typeof m.apply!=='function')throw new Error('no apply'); if(typeof m.computeOverall!=='function')throw new Error('no computeOverall'); console.log('ok', m.name);})"</verify>
</task>

<task id="2">
  <title>Register the capability + command and add TDD coverage</title>
  <action>Add the gsdUiReview descriptor row to the TABLE in lib/_capabilities.js (step:'ui-review', role:'step', tools:['gsd_ui_review'], commands:['gsd-ui-review'], order:36, produces:['UI-REVIEW.md'], consumes:['SUMMARY.md']) and append gsdUiReview to CAPABILITY_KEYS. Add the /gsd-ui-review command to lib/commands.js. Create test/ui-review.test.mjs covering capability descriptor registration, command pairing, pure helpers (resolvePillars/computeOverall/countFindings/glob matching), UI-REVIEW.md write, and soft-gate no-block.</action>
  <verify>node --test test/ui-review.test.mjs</verify>
</task>

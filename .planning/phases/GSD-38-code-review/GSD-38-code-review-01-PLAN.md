---
phase: 38-code-review
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - lib/code-review.js
  - lib/_capabilities.js
  - lib/commands.js
  - test/code-review.test.mjs
autonomous: true
requirements: ["GAP-04"]
gap_closure: false
user_setup: []
must_haves:
  truths:
    - "gsd_code_review, called on a phase after gsd_execute, reviews the phase's changed source files and writes a REVIEW.md with severity-classified findings (BLOCKER/WARNING/INFO)."
    - "The --fix companion applies findings with per-fix atomic commits and writes REVIEW-FIX.md."
    - "The review is a soft gate: it never blocks verify or ship."
  artifacts:
    - path: "lib/code-review.js"
      provides: "The gsd_code_review loop-step tool: gsdCodeReview capability, fresh-context reviewer subagent, severity-classified REVIEW.md, --fix companion with per-fix atomic commits into REVIEW-FIX.md."
      min_lines: 200
      exports: ["name", "inject", "apply", "CODE_REVIEWER_SCHEMA", "resolveFindings", "severityCounts", "resolveFixFlags", "filterBySeverity", "hasBlockingFindings", "CODE_FIXER_SCHEMA", "validateFiles"]
  key_links:
    - from: "lib/code-review.js"
      to: "lib/_capabilities.js"
      via: "ctx.provide('gsdCodeReview', buildCapability('gsdCodeReview')) with the descriptor row in the TABLE"
      pattern: "gsdCodeReview"
    - from: "lib/commands.js"
      to: "lib/code-review.js"
      via: "COMMANDS entry name 'gsd-code-review' auto-paired to gsdCodeReview"
      pattern: "gsd-code-review"
---
<objective>
Add a code-review pass (gsd_code_review + /gsd-code-review command + gsdCodeReview capability) that reviews a phase's changed source files into REVIEW.md with severity-classified findings (BLOCKER/WARNING/INFO), and a --fix companion that applies findings with per-fix atomic commits into REVIEW-FIX.md. It is a soft gate — advisory, never blocks verify or ship.
</objective>

<task id="1">
  <title>Implement the gsd_code_review loop-step tool</title>
  <action>Create lib/code-review.js. Publish the gsdCodeReview capability via ctx.provide('gsdCodeReview', buildCapability('gsdCodeReview')) and register the gsd_code_review tool via ctx.tools.register(defineTool({...})) with inject ['gsdState','tools','subagents'] (the reviewer subagent spawns). Implement the pure, exported, unit-testable helpers: CODE_REVIEWER_SCHEMA, resolveFindings, severityCounts, resolveFixFlags, filterBySeverity, hasBlockingFindings, CODE_FIXER_SCHEMA, validateFiles. In apply(): fail-fast on baseline guards; acquire the per-phase feature branch; spawn a fresh-context reviewer subagent (spawnSubagent) that reviews the phase's changed source files and returns structured findings; write REVIEW.md via writeArtifact; the --fix companion applies findings with per-fix atomic commits into REVIEW-FIX.md. Soft gate: never blocks verify or ship.</action>
  <verify>node --input-type=module -e "import('./lib/code-review.js').then(m=>{if(typeof m.apply!=='function')throw new Error('no apply'); if(typeof m.resolveFindings!=='function')throw new Error('no resolveFindings'); console.log('ok', m.name);})"</verify>
</task>

<task id="2">
  <title>Register the capability + command and add TDD coverage</title>
  <action>Add the gsdCodeReview descriptor row to the TABLE in lib/_capabilities.js (step:'code-review', role:'step', tools:['gsd_code_review'], commands:['gsd-code-review'], order:35, produces:['REVIEW.md','REVIEW-FIX.md'], consumes:['SUMMARY.md']) and append gsdCodeReview to CAPABILITY_KEYS. Add the /gsd-code-review command to lib/commands.js. Create test/code-review.test.mjs covering capability descriptor registration, command pairing, pure helpers, REVIEW.md write, --fix atomic commits, and soft-gate no-block.</action>
  <verify>node --test test/code-review.test.mjs</verify>
</task>

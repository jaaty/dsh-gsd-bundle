---
phase: 42-health
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - lib/health.js
  - lib/_capabilities.js
  - lib/commands.js
  - test/health.test.mjs
autonomous: true
requirements: ["GAP-08"]
gap_closure: false
user_setup: []
must_haves:
  truths:
    - "gsd_health inspects .planning/ integrity (phase/plan numbering, orphan SUMMARYs, config validation) and writes a <NN>-HEALTH.md."
    - "It offers non-destructive repair (repair:true applies config-only fixes)."
    - "It is out-of-band: it does not mutate the STATE loop position."
  artifacts:
    - path: "lib/health.js"
      provides: "The gsd_health out-of-band tool: gsdHealth capability, deterministic .planning/ integrity scan, non-destructive repair, HEALTH.md write."
      min_lines: 200
      exports: ["name", "inject", "apply", "checkPhaseDirNaming", "checkNumbering", "checkOrphanSummaries", "checkPlansWithoutSummary", "checkDiscussionLogWithoutContext", "checkConfig", "checkStateRoadmap", "classifyIssue"]
  key_links:
    - from: "lib/health.js"
      to: "lib/_capabilities.js"
      via: "ctx.provide('gsdHealth', buildCapability('gsdHealth')) with the descriptor row in the TABLE"
      pattern: "gsdHealth"
    - from: "lib/commands.js"
      to: "lib/health.js"
      via: "COMMANDS entry name 'gsd-health' auto-paired to gsdHealth"
      pattern: "gsd-health"
---
<objective>
Add a health diagnostic (gsd_health + /gsd-health command + gsdHealth capability) that inspects .planning/ integrity (phase/plan numbering, orphan SUMMARYs, config validation) and offers non-destructive repair. It is out-of-band — it does not mutate the STATE loop position.
</objective>

<task id="1">
  <title>Implement the gsd_health out-of-band tool</title>
  <action>Create lib/health.js. Publish the gsdHealth capability via ctx.provide('gsdHealth', buildCapability('gsdHealth')) and register the gsd_health tool via ctx.tools.register(defineTool({...})) with inject ['gsdState','tools']. Implement the pure, exported, unit-testable helpers: checkPhaseDirNaming, checkNumbering, checkOrphanSummaries, checkPlansWithoutSummary, checkDiscussionLogWithoutContext, checkConfig, checkStateRoadmap, classifyIssue. In apply(): fail-fast on baseline guards; run a deterministic .planning/ integrity scan; write <NN>-HEALTH.md; offer non-destructive repair (repair:true applies config-only fixes). Out-of-band: does not mutate the STATE loop position.</action>
  <verify>node --input-type=module -e "import('./lib/health.js').then(m=>{if(typeof m.apply!=='function')throw new Error('no apply'); if(typeof m.checkNumbering!=='function')throw new Error('no checkNumbering'); console.log('ok', m.name);})"</verify>
</task>

<task id="2">
  <title>Register the capability + command and add TDD coverage</title>
  <action>Add the gsdHealth descriptor row to the TABLE in lib/_capabilities.js (step:'health', role:'out-of-band', tools:['gsd_health'], commands:['gsd-health'], order:NOT_LOOP_ORDERED, produces:['HEALTH.md'], consumes:[]) and append gsdHealth to CAPABILITY_KEYS. Add the /gsd-health command to lib/commands.js. Create test/health.test.mjs covering capability descriptor registration, command pairing, pure helpers (all check* functions + classifyIssue), HEALTH.md write, non-destructive repair, and out-of-band no-mutation.</action>
  <verify>node --test test/health.test.mjs</verify>
</task>

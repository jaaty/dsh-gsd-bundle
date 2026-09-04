---
phase: 41-undo
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - lib/undo.js
  - lib/_capabilities.js
  - lib/commands.js
  - test/undo.test.mjs
autonomous: true
requirements: ["GAP-07"]
gap_closure: false
user_setup: []
must_haves:
  truths:
    - "gsd_undo rolls back a phase's or plan's commits via the phase manifest with dependency checks and a confirmation gate."
    - "It refuses to roll back when a later phase/plan depends on the target."
    - "It dry-runs by default and executes only with confirm:true."
  artifacts:
    - path: "lib/undo.js"
      provides: "The gsd_undo out-of-band tool: gsdUndo capability, phase/plan commit rollback via git revert, dependency checks, confirmation gate, UNDO.md write."
      min_lines: 200
      exports: ["name", "inject", "apply", "filterPlanCommits", "revertArgsFor", "checkPhaseDependencies", "checkPlanDependencies", "renderDryRunReport", "renderUndoBody"]
  key_links:
    - from: "lib/undo.js"
      to: "lib/_capabilities.js"
      via: "ctx.provide('gsdUndo', buildCapability('gsdUndo')) with the descriptor row in the TABLE"
      pattern: "gsdUndo"
    - from: "lib/commands.js"
      to: "lib/undo.js"
      via: "COMMANDS entry name 'gsd-undo' auto-paired to gsdUndo"
      pattern: "gsd-undo"
---
<objective>
Add a safe undo path (gsd_undo + /gsd-undo command + gsdUndo capability) that rolls back a phase's or plan's commits via the phase manifest with dependency checks and a confirmation gate. It refuses to roll back when a later phase/plan depends on the target, dry-runs by default, and executes only with confirm:true. It is out-of-band — it does not advance the loop position.
</objective>

<task id="1">
  <title>Implement the gsd_undo out-of-band tool</title>
  <action>Create lib/undo.js. Publish the gsdUndo capability via ctx.provide('gsdUndo', buildCapability('gsdUndo')) and register the gsd_undo tool via ctx.tools.register(defineTool({...})) with inject ['gsdState','tools']. Implement the pure, exported, unit-testable helpers: filterPlanCommits, revertArgsFor, checkPhaseDependencies, checkPlanDependencies, renderDryRunReport, renderUndoBody. In apply(): fail-fast on baseline guards; derive the commit set from git history at undo-time; check dependencies (refuse if a later phase/plan depends on the target); dry-run by default (confirm:true executes); write UNDO.md. Out-of-band: does not mutate the STATE loop position.</action>
  <verify>node --input-type=module -e "import('./lib/undo.js').then(m=>{if(typeof m.apply!=='function')throw new Error('no apply'); if(typeof m.checkPhaseDependencies!=='function')throw new Error('no checkPhaseDependencies'); console.log('ok', m.name);})"</verify>
</task>

<task id="2">
  <title>Register the capability + command and add TDD coverage</title>
  <action>Add the gsdUndo descriptor row to the TABLE in lib/_capabilities.js (step:'undo', role:'out-of-band', tools:['gsd_undo'], commands:['gsd-undo'], order:NOT_LOOP_ORDERED, produces:['UNDO.md'], consumes:[]) and append gsdUndo to CAPABILITY_KEYS. Add the /gsd-undo command to lib/commands.js. Create test/undo.test.mjs covering capability descriptor registration, command pairing, pure helpers (filterPlanCommits/revertArgsFor/checkPhaseDependencies/checkPlanDependencies/renderDryRunReport/renderUndoBody), dependency-refusal, dry-run default, and confirm-gate execution.</action>
  <verify>node --test test/undo.test.mjs</verify>
</task>

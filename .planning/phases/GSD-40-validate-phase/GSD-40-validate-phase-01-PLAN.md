---
phase: 40-validate-phase
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - lib/validate-phase.js
  - lib/_capabilities.js
  - lib/commands.js
  - test/validate-phase.test.mjs
autonomous: true
requirements: ["GAP-06"]
gap_closure: false
user_setup: []
must_haves:
  truths:
    - "gsd_validate_phase, called on a completed phase after gsd_verify, maps each phase requirement to the active project's test infra + discovered test files and classifies COVERED/PARTIAL/MISSING/Manual-Only."
    - "It writes a <NN>-VALIDATION.md with a status frontmatter and advances STATE to 'validate'."
    - "The test-writer subagent (gsd-nyquist-auditor) writes missing tests and commits them atomically."
  artifacts:
    - path: "lib/validate-phase.js"
      provides: "The gsd_validate_phase loop-step tool: gsdValidatePhase capability, deterministic requirement→test coverage scan, VALIDATION.md write, gsd-nyquist-auditor test-writer subagent, atomic test commits."
      min_lines: 200
      exports: ["name", "inject", "apply", "isTestPath", "validateTestPaths", "detectTestInfra", "classifyGaps", "markManualOnly", "classifyStatus", "assembleValidationTable", "VALIDATION_AUDITOR_SCHEMA"]
  key_links:
    - from: "lib/validate-phase.js"
      to: "lib/_capabilities.js"
      via: "ctx.provide('gsdValidatePhase', buildCapability('gsdValidatePhase')) with the descriptor row in the TABLE"
      pattern: "gsdValidatePhase"
    - from: "lib/commands.js"
      to: "lib/validate-phase.js"
      via: "COMMANDS entry name 'gsd-validate-phase' auto-paired to gsdValidatePhase"
      pattern: "gsd-validate-phase"
---
<objective>
Add a retro validate-phase audit (gsd_validate_phase + /gsd-validate-phase command + gsdValidatePhase capability) that maps a completed phase's executed work to tests and manual evidence, classifies each requirement COVERED/PARTIAL/MISSING/Manual-Only, writes <NN>-VALIDATION.md with a status frontmatter, and produces tests to close validation gaps for a completed phase (via the gsd-nyquist-auditor test-writer subagent with atomic commits). It is a soft gate — never blocks verify or ship.
</objective>

<task id="1">
  <title>Implement the gsd_validate_phase loop-step tool</title>
  <action>Create lib/validate-phase.js. Publish the gsdValidatePhase capability via ctx.provide('gsdValidatePhase', buildCapability('gsdValidatePhase')) and register the gsd_validate_phase tool via ctx.tools.register(defineTool({...})) with inject ['gsdState','tools','subagents'] (the auditor subagent spawns). Implement the pure, exported, unit-testable helpers: isTestPath, validateTestPaths, detectTestInfra, classifyGaps, markManualOnly, classifyStatus, assembleValidationTable, VALIDATION_AUDITOR_SCHEMA. In apply(): fail-fast on baseline guards + phase-not-executed guard; acquire the per-phase feature branch; run a deterministic requirement→test coverage scan; write <NN>-VALIDATION.md via writeArtifact with status frontmatter; advance STATE to 'validate'; spawn the gsd-nyquist-auditor test-writer subagent to write missing tests and commit them atomically. Soft gate: never blocks verify or ship.</action>
  <verify>node --input-type=module -e "import('./lib/validate-phase.js').then(m=>{if(typeof m.apply!=='function')throw new Error('no apply'); if(typeof m.classifyGaps!=='function')throw new Error('no classifyGaps'); console.log('ok', m.name);})"</verify>
</task>

<task id="2">
  <title>Register the capability + command and add TDD coverage</title>
  <action>Add the gsdValidatePhase descriptor row to the TABLE in lib/_capabilities.js (step:'validate', role:'step', tools:['gsd_validate_phase'], commands:['gsd-validate-phase'], order:45, produces:['VALIDATION.md'], consumes:['SUMMARY.md','VERIFICATION.md']) and append gsdValidatePhase to CAPABILITY_KEYS. Add the /gsd-validate-phase command to lib/commands.js. Create test/validate-phase.test.mjs covering capability descriptor registration, command pairing, pure helpers (isTestPath/validateTestPaths/detectTestInfra/classifyGaps/markManualOnly/classifyStatus/assembleValidationTable), VALIDATION.md write, auditor dispatch, and soft-gate no-block.</action>
  <verify>node --test test/validate-phase.test.mjs</verify>
</task>

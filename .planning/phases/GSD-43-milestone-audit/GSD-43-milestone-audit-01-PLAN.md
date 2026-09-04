---
phase: 43-milestone-audit
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - lib/milestone-audit.js
  - lib/_capabilities.js
  - test/milestone-audit.test.mjs
autonomous: true
requirements: ["GAP-09"]
gap_closure: false
user_setup: []
must_haves:
  truths:
    - "gsd_milestone_audit aggregates per-phase VERIFICATION.md statuses, milestone REQ-ID completeness, and shipped status to confirm the milestone met its derived definition of done."
    - "It emits a cross-phase UAT outstanding-items list before close."
    - "It is a soft gate: it never blocks the release and does not advance STATE."
  artifacts:
    - path: "lib/milestone-audit.js"
      provides: "The gsd_milestone_audit step tool: gsdMilestoneAudit capability, deterministic close-gate aggregation, cross-phase UAT audit, milestone-scoped AUDIT.md write."
      min_lines: 200
      exports: ["name", "inject", "apply", "aggregateCloseGate", "classifyMilestoneStatus", "resolveAuditorOutput"]
  key_links:
    - from: "lib/milestone-audit.js"
      to: "lib/_capabilities.js"
      via: "ctx.provide('gsdMilestoneAudit', buildCapability('gsdMilestoneAudit')) with the descriptor row in the TABLE"
      pattern: "gsdMilestoneAudit"
---
<objective>
Add milestone close-gate and cross-phase UAT audits (gsd_milestone_audit + gsdMilestoneAudit capability) that aggregate per-phase VERIFICATION.md statuses, milestone REQ-ID completeness, and shipped status to confirm the milestone met its derived definition of done, plus a cross-phase UAT outstanding-items list before close. It is a soft gate — it never blocks the release and does not advance STATE.
</objective>

<task id="1">
  <title>Implement the gsd_milestone_audit step tool</title>
  <action>Create lib/milestone-audit.js. Publish the gsdMilestoneAudit capability via ctx.provide('gsdMilestoneAudit', buildCapability('gsdMilestoneAudit')) and register the gsd_milestone_audit tool via ctx.tools.register(defineTool({...})) with inject ['gsdState','tools']. Implement the pure, exported, unit-testable helpers: aggregateCloseGate, classifyMilestoneStatus, resolveAuditorOutput. In apply(): fail-fast on baseline guards; run a deterministic close-gate aggregation (per-phase VERIFICATION.md statuses, milestone REQ-ID completeness, shipped status); emit a cross-phase UAT outstanding-items list; write a milestone-scoped AUDIT.md. Soft gate: never blocks the release, does not advance STATE.</action>
  <verify>node --input-type=module -e "import('./lib/milestone-audit.js').then(m=>{if(typeof m.apply!=='function')throw new Error('no apply'); if(typeof m.aggregateCloseGate!=='function')throw new Error('no aggregateCloseGate'); console.log('ok', m.name);})"</verify>
</task>

<task id="2">
  <title>Register the capability and add TDD coverage</title>
  <action>Add the gsdMilestoneAudit descriptor row to the TABLE in lib/_capabilities.js (step:'milestone-audit', role:'step', tools:['gsd_milestone_audit'], commands:[], order:52, produces:['AUDIT.md'], consumes:['VERIFICATION.md','ROADMAP.md','REQUIREMENTS.md']) and append gsdMilestoneAudit to CAPABILITY_KEYS. Create test/milestone-audit.test.mjs covering capability descriptor registration, pure helpers (aggregateCloseGate/classifyMilestoneStatus/resolveAuditorOutput), close-gate aggregation, UAT outstanding-items, and soft-gate no-block.</action>
  <verify>node --test test/milestone-audit.test.mjs</verify>
</task>

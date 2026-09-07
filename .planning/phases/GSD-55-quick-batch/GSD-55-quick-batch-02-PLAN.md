---
phase: 55-quick-batch
plan: 02
type: execute
wave: 2
depends_on: ["GSD-55-quick-batch-01"]
files_modified: [lib/commands.js]
autonomous: true
requirements: ["CLH-05"]
gap_closure: false
user_setup: []
must_haves:
  truths:
    - The /gsd-quick-batch slash command is registered and routes to the gsd_quick_batch tool.
    - The command is paired to the gsdQuickBatch capability so retiring the quick step unregisters it (DEGR-03).
  artifacts:
    - path: "lib/commands.js"
      provides: "the gsd-quick-batch slash-command entry in the COMMANDS array"
      min_lines: 1
      exports: ["apply"]
  key_links:
    - from: "lib/commands.js gsd-quick-batch"
      to: "lib/_capabilities.js gsdQuickBatch"
      via: "commandToCapability pairs the command name to the gsdQuickBatch capability key (DEGR-03)"
      pattern: "gsd-quick-batch"
---

<objective>Add the /gsd-quick-batch slash command so a user can trigger a quick batch from the command layer. The command is a thin router that injects a user-role message instructing the agent to run gsd_quick_batch, paired to the gsdQuickBatch capability via the existing commandToCapability mechanism (DEGR-03).</objective>

<context>
@lib/commands.js — the COMMANDS array and the apply() that pairs each command to its owning capability via commandToCapability and registers it in a capability-gated sub-fiber. The existing gsd-quick command entry is the template to mirror.
@lib/_capabilities.js — the gsdQuickBatch descriptor (added in plan 01) advertises commands: ["gsd-quick-batch"], which commandToCapability reads.
</context>

<tasks>
  <task type="auto">
    <name>Task 1: Add the gsd-quick-batch slash command entry to the COMMANDS array (tracer)</name>
    <files>lib/commands.js</files>
    <read_first>lib/commands.js</read_first>
    <action>
      In lib/commands.js, add a new entry to the COMMANDS array immediately after the existing gsd-quick entry (per D-01). The entry must be:
      - name "gsd-quick-batch"
      - description "Run multiple quick tasks in a single batch, each with its own subagent, record, and atomic commit; returns per-task results."
      - hint "<task1> | <task2> | ..." (a pipe-separated list of tasks)
      - build(raw): split raw.trim() on the pipe separator `|`, trim each part, filter out empty parts, and if the resulting array is empty return `{ err: "Usage: /gsd-quick-batch <task1> | <task2> | ..." }`; otherwise return `{ text: \`Run the gsd_quick_batch tool with these tasks: ${JSON.stringify(parts)}\`, ack: "Quick batch → gsd_quick_batch." }`.
      Do NOT add a separate capability or tool registration here — the gsdQuickBatch capability (plan 01) already advertises this command name, so commandToCapability pairs it automatically and the sub-fiber registers it only while gsdQuickBatch is present (DEGR-03).
    </action>
    <verify>grep -n "gsd-quick-batch" lib/commands.js</verify>
    <note>Do NOT run `node --test test/mount.test.mjs` to verify this task. Its hard-coded counts (EXPECTED_COMMAND_NAMES, ctx.commands.length === 30) are only updated in plan 03 Task 1, so the suite is EXPECTED to print failures (red) in wave 2. Judge this task by its grep acceptance criteria only; the suite turns green in plan 03.</note>
    <acceptance_criteria>
      - grep "name: \"gsd-quick-batch\"" appears in lib/commands.js
      - grep "gsd_quick_batch tool" appears in lib/commands.js
      - grep "Usage: /gsd-quick-batch" appears in lib/commands.js
    </acceptance_criteria>
    <done>The /gsd-quick-batch command is registered and routes to gsd_quick_batch, paired to the gsdQuickBatch capability.</done>
  </task>
</tasks>

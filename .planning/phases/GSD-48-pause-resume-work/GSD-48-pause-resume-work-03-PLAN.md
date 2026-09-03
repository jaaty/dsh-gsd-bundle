---
phase: 48-pause-resume-work
plan: 03
type: tdd
wave: 3
depends_on: ["GSD-48-pause-resume-work-02"]
files_modified: ["lib/_capabilities.js", "lib/commands.js", "test/mount.test.mjs", "test/_capabilities.test.mjs"]
autonomous: true
requirements: ["GAP-14"]
must_haves:
  truths:
    - "/gsd-pause-work and /gsd-resume-work slash commands are registered and route to gsd_pause_work / gsd_resume_work (D-01)."
    - "gsdOrient advertises the two new tools (gsd_pause_work, gsd_resume_work) and the two new commands (gsd-pause-work, gsd-resume-work), with NO new capability key (D-01, R-3)."
    - "The mount suite passes with 28 registered tools and 25 registered commands, and the absent-capability test passes with 24 commands."
  artifacts:
    - path: "lib/_capabilities.js"
      provides: "gsdOrient descriptor updated to include gsd_pause_work/gsd_resume_work in tools and gsd-pause-work/gsd-resume-work in commands (OQ-1 resolution A)."
      min_lines: 10
      exports: ["buildCapability", "allCapabilities", "capabilityForTool", "CAPABILITY_KEYS"]
    - path: "lib/commands.js"
      provides: "Two new COMMANDS entries (gsd-pause-work, gsd-resume-work) that route to the tools via the followup-message pattern."
      min_lines: 20
      exports: ["apply"]
    - path: "test/mount.test.mjs"
      provides: "EXPECTED_TOOL_NAMES 26→28, EXPECTED_COMMAND_NAMES 23→25, tool/command length assertions, and the absent-capability count 22→24."
      min_lines: 5
      exports: []
    - path: "test/_capabilities.test.mjs"
      provides: "gsdOrient exact tools/commands assertion updated to include the two new tools and two new commands."
      min_lines: 3
      exports: []
  key_links:
    - from: "lib/commands.js"
      to: "lib/_capabilities.js"
      via: "commandToCapability pairs gsd-pause-work/gsd-resume-work to gsdOrient (the capability that owns them), so the sub-fiber registers them only when gsdOrient is present (DEGR-03)."
      pattern: "commandToCapability\\.get\\(c\\.name\\)"
---
<objective>
Expose the two tools as slash commands and pair them to the existing gsdOrient capability (OQ-1 resolution A — no new capability key, preserving the 21-key surface and DEGR-03), then update the mount-surface tests so the suite stays green. TDD per D-10: the test updates (RED) land before the implementation (GREEN).
</objective>
<context>
@lib/_capabilities.js — the TABLE (gsdOrient row at lines 71-81), CAPABILITY_KEYS (21 keys, must NOT grow), buildCapability, capabilityForTool.
@lib/commands.js — the COMMANDS array (lines 35-334) and the apply() commandToCapability pairing (lines 336-370).
@test/mount.test.mjs — EXPECTED_TOOL_NAMES (lines 105-113, 26 entries), EXPECTED_COMMAND_NAMES (lines 116-124, 23 entries), the tool/command length assertions (lines 139-140), the absent-capability count (line 182), and the all-tools-schema assertion (line 320).
@test/_capabilities.test.mjs — the gsdOrient exact assertion (lines 64-68).
</context>
<tasks>
  <task type="auto">
    <name>Task 1: Update mount-surface tests (RED)</name>
    <files>test/mount.test.mjs, test/_capabilities.test.mjs</files>
    <read_first>test/mount.test.mjs, test/_capabilities.test.mjs</read_first>
    <action>
Update the mount-surface tests to expect the two new tools and two new commands. These will FAIL until Task 2 implements the capability pairing + commands (RED).

In test/mount.test.mjs:
- Add "gsd_pause_work" and "gsd_resume_work" to EXPECTED_TOOL_NAMES (26 → 28 entries).
- Add "gsd-pause-work" and "gsd-resume-work" to EXPECTED_COMMAND_NAMES (23 → 25 entries).
- Change the tool-count assertion at line 139 from 26 to 28.
- Change the command-count assertion at line 140 from 23 to 25.
- Change the absent-capability command count at line 182 from 22 to 24 (25 total minus the withdrawn gsd-quick).
- Change the all-tools-schema assertion at line 320 from 26 to 28.

In test/_capabilities.test.mjs:
- Update the gsdOrient exact assertion (lines 66-67) so tools is ["gsd_init", "gsd_status", "gsd_progress", "gsd_new_milestone", "gsd_pause_work", "gsd_resume_work"] and commands is ["gsd-init", "gsd-status", "gsd-progress", "gsd-new-milestone", "gsd-pause-work", "gsd-resume-work"].
    </action>
    <verify>node --test test/mount.test.mjs test/_capabilities.test.mjs</verify>
    <acceptance_criteria>
      - grep -c "gsd_pause_work" test/mount.test.mjs (>= 1)
      - grep -c "gsd_resume_work" test/mount.test.mjs (>= 1)
      - grep "gsd-pause-work" test/mount.test.mjs
      - grep "gsd-resume-work" test/mount.test.mjs
      - grep "gsd_pause_work" test/_capabilities.test.mjs
      - grep "gsd-pause-work" test/_capabilities.test.mjs
      - node --test test/mount.test.mjs test/_capabilities.test.mjs FAILS (RED — tools/commands not yet registered)
    </acceptance_criteria>
    <done>The mount-surface tests expect 28 tools and 25 commands and the gsdOrient exact assertion includes the new tools/commands; the suite is RED until Task 2.</done>
  </task>
  <task type="auto">
    <name>Task 2: Capability pairing + command registration (GREEN)</name>
    <files>lib/_capabilities.js, lib/commands.js</files>
    <read_first>lib/_capabilities.js, lib/commands.js</read_first>
    <action>
Implement the capability pairing and the two slash commands so the Task-1 tests go GREEN.

In lib/_capabilities.js, update the gsdOrient row in the TABLE (lines 71-81): add "gsd_pause_work" and "gsd_resume_work" to tools, and "gsd-pause-work" and "gsd-resume-work" to commands. Do NOT add a new capability key to CAPABILITY_KEYS (R-3 — the 21-key surface must stay fixed). This makes capabilityForTool map the two tools to gsdOrient and commandToCapability pair the two commands to gsdOrient.

In lib/commands.js, add two entries to the COMMANDS array (model on the gsd-status entry, lines 45-52):
- { name: "gsd-pause-work", description: "Pause work mid-phase: write a structured context handoff (HANDOFF.json + .continue-here.md) and commit it as a WIP commit.", build: () => ({ text: "Run the gsd_pause_work tool to write a structured context handoff (HANDOFF.json + .continue-here.md) and commit it as a WIP commit.", ack: "Pausing work → gsd_pause_work." }) }
- { name: "gsd-resume-work", description: "Resume work from a handoff or incomplete-work detection: present status + next-action and update Session Continuity.", build: () => ({ text: "Run the gsd_resume_work tool to restore full context from the handoff (or detect incomplete work) and present the status + next-action.", ack: "Resuming work → gsd_resume_work." }) }

The existing apply() commandToCapability pairing (lines 341-344) will automatically pair these to gsdOrient via the updated TABLE — no change to apply() is needed. Verify the full suite passes.
    </action>
    <verify>node --test test/mount.test.mjs test/_capabilities.test.mjs && node --test test/*.test.mjs</verify>
    <acceptance_criteria>
      - grep "gsd_pause_work" lib/_capabilities.js
      - grep "gsd-pause-work" lib/_capabilities.js
      - grep "gsd_pause_work" lib/commands.js
      - grep "gsd-pause-work" lib/commands.js
      - grep -c "gsd_pause_work" lib/_capabilities.js (>= 1)
      - node --test test/mount.test.mjs test/_capabilities.test.mjs exits 0 (GREEN)
      - node --test test/*.test.mjs exits 0 (full suite green)
    </acceptance_criteria>
    <done>gsdOrient advertises the two new tools and commands, the two slash commands are registered, and the full test suite passes.</done>
  </task>
</tasks>

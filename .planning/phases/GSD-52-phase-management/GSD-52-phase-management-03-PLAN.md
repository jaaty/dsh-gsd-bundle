---
phase: 52-phase-management
plan: 03
type: execute
wave: 3
depends_on: ["GSD-52-phase-management-02"]
files_modified: ["test/helpers/mount-harness.mjs", "test/mount.test.mjs", "test/tools.test.mjs", "test/removal.test.mjs"]
autonomous: true
requirements: ["CLH-01"]
gap_closure: false
user_setup: []
must_haves:
  truths:
    - "npm test passes with the phase-management plugin mounted: 26 plugin rows, 31 gsd_* tools, 28 /gsd-* commands, and 24 capability keys."
    - "Retiring the gsd-phase-management plugin unregisters both the gsd_phase tool and the /gsd-phase-manage command while the rest of the loop stays functional (DEGR-05)."
  artifacts:
    - path: "test/helpers/mount-harness.mjs"
      provides: "PATCH_ROWS gains the gsd-phase-management row so mount/removal suites cover the new plugin"
      min_lines: 1
      exports: []
    - path: "test/mount.test.mjs"
      provides: "Updated plugin/tool/command/capability counters and EXPECTED_TOOL_NAMES / EXPECTED_COMMAND_NAMES / EXPECTED_INSERT_ROWS to include gsd_phase + gsd-phase-manage"
      min_lines: 1
      exports: []
    - path: "test/tools.test.mjs"
      provides: "A gsd_phase schema/registration smoke proving the tool registers with its action enum"
      min_lines: 1
      exports: []
    - path: "test/removal.test.mjs"
      provides: "A per-plugin retirement case proving removing gsd-phase-management unregisters its tool + command"
      min_lines: 1
      exports: []
  key_links:
    - from: "test/helpers/mount-harness.mjs"
      to: "package.json"
      via: "PATCH_ROWS id gsd-phase-management maps to the '@dsh-gsd/bundle/phase-management' subpath export"
      pattern: "phase-management"
---
<objective>
Bring the registration/removal test surface in sync with the new gsd_phase tool, gsdPhaseManagement capability, and /gsd-phase-manage command: add the gsd-phase-management plugin row to mount-harness PATCH_ROWS, bump every fixed counter in mount.test.mjs (plugins 25→26, tools 30→31, commands 27→28, capability keys 23→24, insert rows 25→26), extend EXPECTED_TOOL_NAMES / EXPECTED_COMMAND_NAMES / EXPECTED_INSERT_ROWS, add a gsd_phase schema smoke in tools.test.mjs, and add a per-plugin retirement case to removal.test.mjs proving DEGR-05. Keep `npm test` green.
</objective>
<context>@.planning/phases/GSD-52-phase-management/52-CONTEXT.md, @test/helpers/mount-harness.mjs (lines 20-49 PATCH_ROWS), @test/mount.test.mjs (lines 6, 33, 99-130 EXPECTED lists + 145-147/157/213-241 counters), @test/tools.test.mjs (schema-test pattern around line 913), @test/removal.test.mjs (line 121-145 retirement loop), @RESEARCH.md Risks R5</context>
<tasks>
  <task type="auto">
    <name>Task 1: Add the gsd-phase-management row to PATCH_ROWS in mount-harness</name>
    <files>test/helpers/mount-harness.mjs</files>
    <read_first>test/helpers/mount-harness.mjs</read_first>
    <action>
      In test/helpers/mount-harness.mjs (read lines 1-60 first), append a row to the exported PATCH_ROWS array: { id: "gsd-phase-management", sub: "phase-management" }. Insert it after the existing gsd-add-tests or gsd-health row to keep a stable order (the order only has to stay consistent with EXPECTED_INSERT_ROWS which derives from PATCH_ROWS, so appending is safe). Do NOT reorder existing rows. Also update any header comment in the file that hard-codes the plugin count (e.g. "the 25 plugin rows") to the new count of 26.
    </action>
    <verify>grep "gsd-phase-management" test/helpers/mount-harness.mjs
    </verify>
    <acceptance_criteria>
      - grep "'gsd-phase-management'" in test/helpers/mount-harness.mjs PATCH_ROWS (exit 0)
      - PATCH_ROWS has exactly 26 entries
    </acceptance_criteria>
    <done>PATCH_ROWS now carries the gsd-phase-management row so every downstream mount/removal test iterates the new plugin.</done>
  </task>
  <task type="auto">
    <name>Task 2: Update mount.test.mjs counters + EXPECTED lists and add a gsd_phase schema smoke in tools.test.mjs</name>
    <files>test/mount.test.mjs, test/tools.test.mjs</files>
    <read_first>test/mount.test.mjs, test/tools.test.mjs</read_first>
    <action>
      In test/mount.test.mjs (read lines 6, 33, 99-130, 145-157, 213, 236-241 first): bring every fixed counter in line with the new plugin surfaced by Plan 02. Update the header comment on lines 5-6 ("25 cordis.patch.yml plugin rows ... 30 gsd_* tools, 27 /gsd-* commands") to 26 plugins / 31 tools / 28 commands. Update the applies-all count commentary on line 33 (25 -> 26 plugins). Change the assertions at lines 145-146 to expect 31 tools and 28 commands, line 157 to CAPABILITY_KEYS.length === 24, line 213 and its EXPECTED_INSERT_ROWS message to 26 insert rows, and the minus-command subset assertion on line 188 (26 -> 27 commands) if the arithmetic requires it. Extend EXPECTED_TOOL_NAMES (line 105) with "gsd_phase" and EXPECTED_COMMAND_NAMES (line 119) with "gsd-phase-manage" so the sorted deepEqual at lines 237/241 matches. EXPECTED_INSERT_ROWS derives from PATCH_ROWS so it updates automatically once Task 1 lands. Do not weaken any existing assertion.
      In test/tools.test.mjs (read the schema-check pattern around line 913 "compiled schema exposes ..." and the registration smoke pattern used for other tools): add a describe("gsd_phase") block with a test that mounts the phase-management plugin (reuse the mount-harness helpers, e.g. mountSubset(["phase-management"]) or applySubset) and asserts the registered gsd_phase tool's compiled schema exposes the action enum ["add","insert","remove","reorder","edit"] plus the flag fields (name/goal/requirements/at/n/to/status/yes).
    </action>
    <verify>node --test test/mount.test.mjs && node --test test/tools.test.mjs
    </verify>
    <acceptance_criteria>
      - node --test test/mount.test.mjs exits 0 (26 plugins / 31 tools / 28 commands / 24 capability keys)
      - grep '"gsd_phase"' in test/mount.test.mjs EXPECTED_TOOL_NAMES (exit 0)
      - grep '"gsd-phase-manage"' in test/mount.test.mjs EXPECTED_COMMAND_NAMES (exit 0)
      - node --test test/tools.test.mjs exits 0 and includes a describe "gsd_phase" schema assertion
    </acceptance_criteria>
    <done>mount.test.mjs's fixed counters and EXPECTED lists match the new plugin surface, and tools.test.mjs proves gsd_phase registers with its action enum and flags.</done>
  </task>
  <task type="auto">
    <name>Task 3: Add a per-plugin retirement case for gsd-phase-management in removal.test.mjs</name>
    <files>test/removal.test.mjs</files>
    <read_first>test/removal.test.mjs</read_first>
    <action>
      In test/removal.test.mjs (read the full file first, especially the describe at line 121-145 that iterates PATCH_ROWS for role:"step" loop plugins): note that gsdPhaseManagement is role:"out-of-band" so it is NOT covered by the automatic per-step retirement loop. Add a dedicated describe("removal: gsd-phase-management (out-of-band)") block with two assertions mirroring the existing per-plugin surface checks: (1) mount the FULL PATCH_ROWS set except the gsd-phase-management row (build the subs list by filtering row.sub === 'phase-management' out of PATCH_ROWS, then mountSubset(subs, { subagents: ... })), and assert ctx.tools has no tool named "gsd_phase" and ctx.commands has no command named "gsd-phase-manage" and ctx.provided does not contain "gsdPhaseManagement"; (2) mount the full set WITH gsd-phase-management and assert all three ARE present. Reuse the existing helper imports (mountSubset, PATCH_ROWS, CAPABILITY_KEYS). This proves DEGR-05: retiring gsd-phase-management reverts its effects and the remaining loop stays functional.
    </action>
    <verify>node --test test/removal.test.mjs
    </verify>
    <acceptance_criteria>
      - node --test test/removal.test.mjs exits 0
      - grep "gsd-phase-management" and "gsd_phase" and "gsd-phase-manage" appear in a new removal describe block (exit 0)
      - the retired case asserts ctx.tools has no gsd_phase and ctx.commands has no gsd-phase-manage
    </acceptance_criteria>
    <done>A removal.test.mjs case proves retiring gsd-phase-management unregisters gsd_phase + /gsd-phase-manage with the loop otherwise intact, and the full mount/tools/removal suites pass.</done>
  </task>
</tasks>

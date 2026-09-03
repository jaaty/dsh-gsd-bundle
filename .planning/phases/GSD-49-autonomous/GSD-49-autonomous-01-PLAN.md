---
phase: GSD-49-autonomous
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - lib/_capabilities.js
  - lib/autonomous.js
  - lib/commands.js
  - cordis.patch.yml
  - package.json
  - test/helpers/mount-harness.mjs
  - test/_capabilities.test.mjs
  - test/mount.test.mjs
  - test/coeffect.test.mjs
autonomous: true
requirements: ["GAP-15"]
gap_closure: false
user_setup: []
must_haves:
  truths:
    - "Running /gsd-autonomous (gsd_autonomous) when every phase of the active milestone is Complete reports a clean 'nothing to do' STATUS and spawns zero subagents."
    - "The gsdAutonomous capability, the gsd_autonomous tool, and the /gsd-autonomous command are registered together so /gsd-autonomous routes to the tool."
  artifacts:
    - path: "lib/autonomous.js"
      provides: "the gsd_autonomous out-of-band tool with gsdAutonomous capability, fail-fast guards, inject deps (gsdState/tools/subagents), and a phase-discovery + nothing-to-do no-op path"
      min_lines: 60
      exports: ["discoverPhases"]
    - path: "lib/_capabilities.js"
      provides: "the gsdAutonomous descriptor row (step autonomous, role out-of-band, order -1, tools/commands/produces/consumes)"
      min_lines: 0
      exports: []
  key_links:
    - from: "lib/_capabilities.js"
      to: "lib/commands.js"
      via: "commandToCapability pairs /gsd-autonomous to gsdAutonomous so the command registers on the capability sub-fiber"
      pattern: "gsd-autonomous"
    - from: "lib/autonomous.js"
      to: "lib/_git-artifacts.js"
      via: "commitArtifacts for the no-op path (no planned commit in the nothing-to-do case)"
      pattern: "commitArtifacts"
---
<objective>
Register the gsdAutonomous out-of-band step capability and its gsd_autonomous tool and /gsd-autonomous command, and land the thinnest end-to-end slice: a tool that reads ROADMAP, discovers the remaining incomplete phases, and returns a clean 'nothing to do' STATUS when there are none (GAP-15, D-01/D-08). This is the scaffolding all later orchestration (plan 02) and tests (plan 03) build on. It also updates every hard registration-count assertion so `npm test` stays green the moment the new surface lands.
</objective>

<context>
@lib/_capabilities.js
@lib/autonomous.js
@lib/commands.js
@lib/_git-artifacts.js
@lib/_runner.js
@lib/milestone-audit.js
@lib/state.js
@test/helpers/mount-harness.mjs
@test/_capabilities.test.mjs
@test/mount.test.mjs
@test/coeffect.test.mjs
@cordis.patch.yml
@package.json
</context>

<tasks>
  <!-- TRACER: the thinnest end-to-end slice — capability + tool + gsdState read + no-op STATUS -->
  <task type="auto">
    <name>Task 1: Add gsdAutonomous capability + create lib/autonomous.js with the discovery + nothing-to-do no-op path</name>
    <files>lib/_capabilities.js, lib/autonomous.js</files>
    <read_first>lib/_capabilities.js, lib/milestone-audit.js, lib/state.js</read_first>
    <action>In lib/_capabilities.js: add the string "gsdAutonomous" to the CAPABILITY_KEYS frozen array (append after "gsdMempalace"); add a new TABLE row keyed "gsdAutonomous" with step: "autonomous", role: "out-of-band", tools: ["gsd_autonomous"], commands: ["gsd-autonomous"], order: NOT_LOOP_ORDERED, prereq: [], next: [], produces: ["VERIFICATION.md", "STATUS"], consumes: ["ROADMAP.md", "STATE.md", "CONTEXT.md"] (D-01). Do not change the role enum (out-of-band already valid per D-01). Create lib/autonomous.js exporting { name, inject, apply } plus a pure exported helper discoverPhases(roadmap). Set name = "gsd-autonomous"; inject = ["gsdState", "tools", "subagents"] (D-02). In apply(ctx): ctx.provide("gsdAutonomous", buildCapability("gsdAutonomous")); ctx.tools.register(defineTool({ name: "gsd_autonomous", description ..., parameters: {}, output: { schema: { type: "string" }, render: (_a, v) => [{ type: "text", text: v }] }, async execute(_args, exec) {...}, presentCall: () => ({ card: "generic", title: "Autonomous: drive remaining phases", kind: "other", rawInput: {} }) })) (model the register shape on lib/milestone-audit.js). The pure helper discoverPhases(roadmap) returns the roadmap.phases filtered to status !== "Complete", sorted ascending by numeric n (D-07/D-08); return []. In execute: const cwd = cwdOf(exec); const s = ctx.get("gsdState"); if (!s) throw new Error("gsd_autonomous: gsdState service unavailable"); if (!(await s.isProject(cwd))) throw new Error("gsd_autonomous: no .planning/ project — run gsd_init first"); const roadmap = await s.readRoadmap(cwd); if (!roadmap) throw new Error("gsd_autonomous: unreadable ROADMAP.md"); const remaining = discoverPhases(roadmap); if (remaining.length === 0) return a nothing-to-do STATUS banner text that contains the literal string "nothing to do" and the milestone name (roadmap.milestoneName fallback from s.readState frontmatter.milestone_name, mirroring lib/milestone-audit.js:122-124) and "0 remaining"; for the non-empty case in THIS plan, return a concise STATUS banner naming each discovered phase number + name with status "pending" and the line "driven by gsd_autonomous" (this stub loop body is replaced wholesale by plan 02 — do not build the orchestration here). Do not call setActivePhase and do not mutate STATE (D-10). Do not spawn any subagent in this plan.</action>
    <verify>node --input-type=module -e "import('./lib/_capabilities.js').then(m=>{const d=m.buildCapability('gsdAutonomous'); console.log(d.role,d.order,d.step,JSON.stringify(d.tools),JSON.stringify(d.commands),JSON.stringify(d.produces),JSON.stringify(d.consumes));})"</verify>
    <acceptance_criteria>
      - `grep -c "gsdAutonomous" lib/_capabilities.js` returns ≥ 2 (key + TABLE row)
      - `grep "gsd_autonomous" lib/autonomous.js` matches
      - `grep "inject = .gsdState., .tools., .subagents." lib/autonomous.js` matches (order-independent — assert the array contains all three)
      - `grep "discoverPhases" lib/autonomous.js` matches and the export is `export function discoverPhases`
      - the node -e probe prints role "out-of-band", order -1, tools ["gsd_autonomous"], commands ["gsd-autonomous"]
    </acceptance_criteria>
    <done>gsdAutonomous builds a valid descriptor; lib/autonomous.js registers the tool with inject deps and a discoverPhases helper; the nothing-to-do path returns a "nothing to do" banner; no subagents spawn and STATE is not mutated.</done>
  </task>

  <task type="auto">
    <name>Task 2: Wire the /gsd-autonomous command + cordis.patch.yml row + package.json exports + mount-harness PATCH_ROW</name>
    <files>lib/commands.js, cordis.patch.yml, package.json, test/helpers/mount-harness.mjs</files>
    <read_first>lib/commands.js, cordis.patch.yml, package.json, test/helpers/mount-harness.mjs</read_first>
    <action>In lib/commands.js, append to the COMMANDS array an entry { name: "gsd-autonomous", description: "Drive all remaining incomplete phases of the active milestone autonomously (discuss/plan/execute/verify per phase, no ship, no lifecycle).", build: () => ({ text: "Run the gsd_autonomous tool to drive every remaining incomplete phase of the active milestone through discuss/plan/execute/verify without per-phase prompting.", ack: "Autonomous → gsd_autonomous." }) }. The existing commandToCapability loop plus the sub-fiber registration (lib/commands.js:357-385) pairs gsd-autonomous to the gsdAutonomous capability automatically; do not add a separate manual pairing. In cordis.patch.yml, add a row under the insert block: "- id: gsd-autonomous\n  name: '@dsh-gsd/bundle/autonomous'" (place it after the gsd-mempalace row, before gsd-ship, matching plugin ordering). In package.json under "exports", add "./autonomous": { "default": "./lib/autonomous.js" } (after the "./mempalace" or ".//commands" entry). In test/helpers/mount-harness.mjs, append { id: "gsd-autonomous", sub: "autonomous" } to the PATCH_ROWS array (after the gsd-mempalace entry, before gsd-commands).</action>
    <verify>node --input-type=module -e "import('./test/helpers/mount-harness.mjs').then(m=>console.log(m.PATCH_ROWS.map(r=>r.sub).join(',')))" | grep -o autonomous</verify>
    <acceptance_criteria>
      - `grep -c "gsd-autonomous" lib/commands.js` matches (command name present)
      - `grep "gsd-autonomous" cordis.patch.yml` matches under the insert block
      - `grep '"\./autonomous"' package.json` matches
      - `grep -c '"autonomous"' test/helpers/mount-harness.mjs` matches
      - the node -e probe prints the joined subs and includes "autonomous"
    </acceptance_criteria>
    <done>The /gsd-autonomous command, the cordis.patch.yml insert row, the package.json exports subpath, and the mount-harness PATCH_ROW all land together so the command and capability are paired and mountable.</done>
  </task>

  <task type="auto">
    <name>Task 3: Update hard registration-count assertions so npm test is green</name>
    <files>test/_capabilities.test.mjs, test/mount.test.mjs, test/coeffect.test.mjs</files>
    <read_first>test/_capabilities.test.mjs, test/mount.test.mjs, test/coeffect.test.mjs</read_first>
    <action>In test/_capabilities.test.mjs: change CAPABILITY_KEYS.length assertion from 21 to 22 (line 13) and add "gsdAutonomous" to the explicit key list inside the same test. In test/mount.test.mjs: change the all-plugins tool count from 28 to 29 (line 141), the commands count from 25 to 26 (line 142), the CAPABILITY_KEYS.length from 21 to 22 (line 153), the subset-without-commands commands count from 24 to 25 (line 184), and EXPECTED_COMMAND_NAMES (around line 117-124) to include "gsd-autonomous". EXPECTED_INSERT_ROWS derives from PATCH_ROWS (line 99) so it and the insertRows count (line 209, 23→24) auto-update — do not edit those hard-coded literals beyond confirming they now read 24 after the PATCH_ROWS addition. In test/coeffect.test.mjs: add "autonomous" to the SUBAGENT_DRIVEN_SUBS array (line 19) so the suite asserts lib/autonomous.js declares gsdState, tools, and subagents in its inject array.</action>
    <verify>node --test test/_capabilities.test.mjs test/mount.test.mjs test/coeffect.test.mjs</verify>
    <acceptance_criteria>
      - `node --test test/_capabilities.test.mjs test/mount.test.mjs test/coeffect.test.mjs` exits 0 and reports all tests passing
      - `grep "gsdAutonomous" test/_capabilities.test.mjs` matches
      - `grep '"autonomous"' test/coeffect.test.mjs` matches
    </acceptance_criteria>
    <done>The registration-count suites pass with the new capability/tool/command/plugin row present; no test regressions from adding the autonomous surface.</done>
  </task>
</tasks>

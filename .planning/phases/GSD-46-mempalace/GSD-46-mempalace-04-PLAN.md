---
phase: 46-mempalace
plan: 04
type: execute
wave: 2
depends_on: ["GSD-46-mempalace-01"]
files_modified:
  - cordis.patch.yml
  - package.json
  - lib/commands.js
  - test/helpers/mount-harness.mjs
  - test/mount.test.mjs
  - test/_capabilities.test.mjs
  - test/render.test.mjs
  - README.md
autonomous: true
requirements: ["GAP-12"]
user_setup: []
must_haves:
  truths:
    - "The gsd-mempalace plugin row activates in cordis.patch.yml and the ./mempalace subpath export resolves in package.json (MOUNT-01)"
    - "The two /gsd-mempalace-recall and /gsd-mempalace-capture slash commands register in lib/commands.js, each invoking its gsd_mempalace_* tool (OQ-7)"
    - "The mount-harness PATCH_ROWS includes the gsd-mempalace row so the DEGR-05 removal suite auto-extends (OQ-7)"
    - "The cross-cutting count/key assertions in test/_capabilities.test.mjs, test/render.test.mjs, and test/mount.test.mjs are updated so the FULL suite is green with the 21st capability — repairing the RED state plan 01's done-note declared (plan-01 coupling)"
    - "README documents the mempalace config surface (enabled, memory_mode, wing, recall_on_discuss, recall_on_plan, capture_artifacts, mirror_kg) and the mirror_kg CLI-unavailable note (D-10, OQ-1)"
  artifacts:
    - path: "README.md"
      provides: "documentation of the mempalace config surface and the two tools, including the mirror_kg CLI-unavailable note and the memory_mode additive note"
      min_lines: 30
      exports: []
  key_links:
    - from: "cordis.patch.yml"
      to: "lib/mempalace.js"
      via: "the gsd-mempalace row's name '@dsh-gsd/bundle/mempalace' resolves the plugin subpath export"
      pattern: "mempalace"
    - from: "lib/commands.js"
      to: "lib/mempalace.js"
      via: "the gsd-mempalace-recall / gsd-mempalace-capture command build() functions instruct running the gsd_mempalace_recall / gsd_mempalace_capture tools"
      pattern: "gsd_mempalace_recall"
---
<objective>
Wire the full registration surface for the gsdMempalace capability (cordis.patch.yml row, package.json ./mempalace export, lib/commands.js slash commands, mount-harness PATCH_ROWS row) so the plugin mounts in a live session and the DEGR-05 removal suite auto-extends, and repair every cross-cutting count/key assertion that the 21st capability key (added in plan 01) left RED in test/_capabilities.test.mjs, test/render.test.mjs, and test/mount.test.mjs. Document the mempalace config surface + mirror_kg note in README.md. This plan is the wave-2 repair that takes the full suite green after plan 01's declared mid-phase RED state.
</objective>
<context>@cordis.patch.yml, @package.json, @lib/commands.js, @test/helpers/mount-harness.mjs, @test/mount.test.mjs, @test/_capabilities.test.mjs, @test/render.test.mjs, @test/removal.test.mjs, @README.md, @lib/_capabilities.js</context>
<tasks>
  <task type="auto">
    <name>Task 1 (feat): Wire the registration surface (cordis, package.json, commands.js, mount-harness) + repair cross-cutting count/key assertions</name>
    <files>cordis.patch.yml, package.json, lib/commands.js, test/helpers/mount-harness.mjs, test/mount.test.mjs, test/_capabilities.test.mjs, test/render.test.mjs</files>
    <read_first>cordis.patch.yml, package.json, lib/commands.js, test/helpers/mount-harness.mjs, test/mount.test.mjs, test/_capabilities.test.mjs, test/render.test.mjs, test/removal.test.mjs, lib/_capabilities.js</read_first>
    <action>
Wire the full registration surface for the gsdMempalace capability and repair every existing test assertion that the new 21st capability breaks. Per OQ-7. The new capability adds 1 plugin row, 2 tools, and 2 slash commands, so every count/key assertion across the cross-cutting suites must move by exactly that delta.

1. cordis.patch.yml — add a gsd-mempalace plugin row in the insert block, after the gsd-graphify row: `- id: gsd-mempalace\n      name: '@dsh-gsd/bundle/mempalace'` with a comment noting it is the mempalace advisory step (after graphify). Per D-01.

2. package.json — add the `./mempalace` subpath export: `"./mempalace": { "default": "./lib/mempalace.js" }` (after the `./graphify` export). Per OQ-7.

3. lib/commands.js — add two slash-command entries after the gsd-graphify command (lines 289-300), before gsd-new-milestone (line 301), mirroring the gsd-graphify command shape (name/description/hint/build returning { text, ack } or { err }):
   - `gsd-mempalace-recall`: description "Deliberate recall before discuss/plan — produces MEMORY-RECALL.md from the MemPalace CLI.", hint "<N>", build: parse a phase number via phaseNum(raw); if none return { err: "Usage: /gsd-mempalace-recall <N>" }; return { text: "Run the gsd_mempalace_recall tool on phase " + n + ".", ack: "Mempalace recall phase " + n + " → gsd_mempalace_recall." }.
   - `gsd-mempalace-capture`: description "File CONTEXT/PLAN/SUMMARY verbatim into the palace at phase boundaries.", hint "<N> <CONTEXT|PLAN|SUMMARY>", build: parse a phase number and an artifact token (CONTEXT|PLAN|SUMMARY); if either missing return { err: "Usage: /gsd-mempalace-capture <N> <CONTEXT|PLAN|SUMMARY>" }; return { text: "Run the gsd_mempalace_capture tool on phase " + n + " artifact " + artifact + ".", ack: "Mempalace capture phase " + n + " → gsd_mempalace_capture." }.
   Per OQ-7 (the two /gsd-mempalace-* commands).

4. test/helpers/mount-harness.mjs — add the gsd-mempalace row to PATCH_ROWS (after the gsd-graphify row): `{ id: "gsd-mempalace", sub: "mempalace" }`. Update the "The 21 plugin rows" comment to "The 22 plugin rows". Per OQ-7 (the DEGR-05 removal suite's retirementMatrix maps role:"step" capabilities to PATCH_ROWS by sub === cap.step, so gsdMempalace (step "mempalace") needs this row; test/removal.test.mjs auto-extends with no manual count change once this row exists).

5. test/mount.test.mjs — update every count/key comment and assertion for the new 22nd plugin row. The deltas: plugin rows 21→22, registered tools 24→26 (2 new mempalace tools), slash commands 21→23 (2 new commands). Concretely:
   - Add "gsd_mempalace_recall" and "gsd_mempalace_capture" to the EXPECTED_TOOL_NAMES array (after "gsd_graphify", line 113) — the deepEqual at line 229 requires them.
   - Add "gsd-mempalace-recall" and "gsd-mempalace-capture" to the EXPECTED_COMMAND_NAMES array (after "gsd-graphify", line 121) — the deepEqual at line 233 requires them.
   - Update count comments/assertions: line 3 comment "Proves the 21 cordis.patch.yml plugin rows" → 22; line 6 comment "23 gsd_* tools, 20 /gsd-* commands" → "26 gsd_* tools, 23 /gsd-* commands"; line 33 comment "Apply all 21 plugins" → 22; line 96 comment "The 21 expected insert rows" → 22; line 104 comment "Expected registered tool names (23)" → 26; line 115 comment "Expected registered command names (20)" → 23; line 124 describe "mount: all 22 plugins activate" → 23; line 129 comment "the full 21-row surface" → 22; line 133 test "applies all 22 plugins" → 23; line 138 `ctx.commands.length === 21` → 23; line 180 `ctx2.commands.length === 20` → 22 (subset mount minus gsd-quick now has 22); line 193 test "override row present, 22 insert rows resolve" → 23; line 205 `insertRows.length === 22` → 23; line 206 "expected 22" → 23; line 224 comment "expected 22" → 24; line 315 comment "all 23 registered tools" → 26 and line 316 `ctx.tools.length === 24` → 26. After editing, run `node --test test/mount.test.mjs` and fix ANY remaining count/key assertion that still fails until the file passes — the test run is the source of truth for the exact final numbers.

6. test/_capabilities.test.mjs — update the count/key assertions for the 21st capability: line 12-13 test "exposes exactly the 20 known keys" → 21 and `assert.equal(CAPABILITY_KEYS.length, 20)` → 21; add "gsdMempalace" to the key-list array (after "gsdGraphify", around line 35) so the includes() loop asserts it. Per plan-01 coupling.

7. test/render.test.mjs — update the loop-step key lists for the new step capability (gsdMempalace, order 55, role step): line 43 LOOP_ORDER array — append "gsdMempalace" after "gsdGraphify"; line 111 loopSteps assertion array — append "gsdMempalace" after "gsdGraphify". Run `node --test test/render.test.mjs` and fix any remaining assertion that fails (e.g. a count or ordering assertion) until it passes.

8. test/removal.test.mjs — NO manual count change needed: it derives STEP_CAPS from CAPABILITY_KEYS and maps to PATCH_ROWS by sub, so the new PATCH_ROWS row (step 4) makes the gsdMempalace retirement test auto-extend. Do not edit this file unless the run in the verify step fails; if it does, fix the specific failing assertion.
    </action>
    <verify>node --test test/mount.test.mjs test/_capabilities.test.mjs test/render.test.mjs test/removal.test.mjs 2>&1 | tail -20</verify>
    <acceptance_criteria>
      - grep -q "gsd-mempalace" cordis.patch.yml (plugin row added)
      - grep -q '"./mempalace"' package.json (subpath export added)
      - grep -q "gsd-mempalace-recall" lib/commands.js (recall command registered)
      - grep -q "gsd-mempalace-capture" lib/commands.js (capture command registered)
      - grep -q 'sub: "mempalace"' test/helpers/mount-harness.mjs (PATCH_ROWS row added)
      - grep -q "gsdMempalace" test/_capabilities.test.mjs (key-list assertion updated)
      - grep -q "gsdMempalace" test/render.test.mjs (loop-step key list updated)
      - node --test test/mount.test.mjs test/_capabilities.test.mjs test/render.test.mjs test/removal.test.mjs exits 0 (all four cross-cutting suites pass — GREEN)
    </acceptance_criteria>
    <done>The gsd-mempalace plugin row activates in cordis.patch.yml, the ./mempalace export resolves in package.json, the two /gsd-mempalace-* commands register in lib/commands.js, the PATCH_ROWS row is added to mount-harness, and the count/key assertions in test/mount.test.mjs, test/_capabilities.test.mjs, and test/render.test.mjs are updated. test/mount.test.mjs, test/_capabilities.test.mjs, test/render.test.mjs, and test/removal.test.mjs all pass (GREEN). The full test suite is green with the new capability integrated — plan 01's declared mid-phase RED state is repaired.</done>
  </task>

  <task type="auto">
    <name>Task 2 (feat): Document the mempalace config surface in README.md</name>
    <files>README.md</files>
    <read_first>README.md</read_first>
    <action>
Document the mempalace config surface and the two tools in README.md. Per D-10 and OQ-1.

1. Add the two tools to the "The `gsd_*` tools" table (after the gsd_map_codebase row): `gsd_mempalace_recall` (plugin `gsd-mempalace`, "Deliberate recall before discuss/plan — produces MEMORY-RECALL.md from the MemPalace CLI") and `gsd_mempalace_capture` (plugin `gsd-mempalace`, "Files CONTEXT/PLAN/SUMMARY verbatim into the palace at phase boundaries").

2. Add a "Mempalace (cross-session memory)" section documenting:
   - The two tools: gsd_mempalace_recall (produces MEMORY-RECALL.md before discuss/plan) and gsd_mempalace_capture (files CONTEXT/PLAN/SUMMARY verbatim into the palace at phase boundaries).
   - The config surface (D-10): mempalace.enabled (default false — opt-in), memory_mode (default "augment"), wing, recall_on_discuss (default true), recall_on_plan (default true), capture_artifacts (default true), mirror_kg (default true).
   - The mirror_kg note (OQ-1): "KG mirroring requires MCP (mempalace_kg_add) — unavailable in this CLI-only bundle; mirror_kg is config-accepted but the actual KG write is a documented no-op until a later MCP-capable phase."
   - The memory_mode note (D-09): augment is fully implemented (palace is an additive recall layer alongside native memory, which stays authoritative); kg_backend and replace are accepted in config but treated as additive this phase.
   - The advisory soft-gate note (D-08): mempalace never advances STATE and never blocks a loop step; every auto-hook is onError: skip.
    </action>
    <verify>grep -q "mempalace" README.md && grep -q "mirror_kg" README.md && grep -q "memory_mode" README.md</verify>
    <acceptance_criteria>
      - grep -q "gsd_mempalace_recall" README.md (recall tool documented)
      - grep -q "gsd_mempalace_capture" README.md (capture tool documented)
      - grep -q "mempalace.enabled" README.md (config gate documented)
      - grep -q "mirror_kg" README.md (mirror_kg note documented)
      - grep -q "memory_mode" README.md (memory_mode documented)
    </acceptance_criteria>
    <done>README.md documents the mempalace config surface (enabled, memory_mode, wing, recall_on_discuss, recall_on_plan, capture_artifacts, mirror_kg), the two tools, the mirror_kg CLI-unavailable note (OQ-1), and the memory_mode additive note (D-09).</done>
  </task>
</tasks>

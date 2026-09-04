---
phase: 50-add-tests
plan: 03
type: execute
wave: 2
depends_on: ["GSD-50-add-tests-01"]
files_modified:
  - test/_capabilities.test.mjs
  - test/mount.test.mjs
  - test/render.test.mjs
autonomous: true
requirements: ["GAP-16"]
gap_closure: false
user_setup: []
must_haves:
  truths:
    - "The pre-existing exact-count suite stays green after the 23rd capability/30th tool/27th command/25th patch-row is added: the capability, tool, command, insert-row, and informationEntries count assertions all update to the new values atomically."
    - "gsdAddTests is out-of-band (NOT_LOOP_ORDERED, role out-of-band) so it does NOT enter loopSteps/LOOP_ORDER — only the informational informationEntries array appends it."
  artifacts:
    - path: "test/mount.test.mjs"
      provides: "Updated EXPECTED_TOOL_NAMES/EXPECTED_COMMAND_NAMES lists and the tool/command/capability/insert-row count assertions so the full-mount suite reflects the gsd-add-tests plugin."
      min_lines: 1
      exports: []
  key_links:
    - from: "test/_capabilities.test.mjs"
      to: "lib/_capabilities.js"
      via: "CAPABILITY_KEYS.length === 23 with gsdAddTests present in the key list"
      pattern: "gsdAddTests"
    - from: "test/mount.test.mjs"
      to: "test/helpers/mount-harness.mjs"
      via: "PATCH_ROWS now 25 rows; EXPECTED_INSERT_ROWS auto-derives to 25; count assertions updated to tool 30 / command 27 / capability 23 / insert 25"
      pattern: "gsd-add-tests"
    - from: "test/render.test.mjs"
      to: "lib/_render.js"
      via: "informationEntries(FULL) appends gsdAddTests; loopSteps(FULL)/LOOP_ORDER unchanged because gsdAddTests is out-of-band"
      pattern: "gsdAddTests"
---
<objective>
Keep the pre-existing suite green after the add-tests registration by updating the exact-count + membership assertions that the new gsdAddTests capability (23rd key), gsd_add_tests tool (30th), /gsd-add-tests command (27th), and gsd-add-tests patch row (25th) shift. This plan is the registration-integrity follow-up that must land before verify; gsdAddTests stays out-of-band so the loopSteps/LOOP_ORDER assertions are untouched.

IMPORTANT — expected transient breakage between waves (dimension 3b): plan 01 (wave 1) lands the gsdAddTests registration (capability key 23, tool 30, command 27, insert row 25) while the assertion updates for those counts live in THIS plan (wave 2). Therefore the in-phase suite is expected to be RED between plan 01's commit (wave 1) and this plan's commit (wave 2). This is NOT a deviation — it is a known, accepted mid-phase state and resolves before verify, which runs only after all plans (01+02+03) land. Do NOT abort plan 01's wave or treat the transient red as a failure. Because of this, EVERY per-commit gate in this plan is scoped to the three files it edits (`node --test test/_capabilities.test.mjs test/mount.test.mjs test/render.test.mjs`) — never the full suite. The full-`npm test` pass is proven at the phase-level verify, not inside this plan (which runs in parallel with plan 02 and must not depend on plan 02's not-yet-landed test/add-tests.test.mjs).
</objective>
<context>
@.planning/phases/GSD-50-add-tests/GSD-50-add-tests-01-PLAN.md
@test/_capabilities.test.mjs
@test/mount.test.mjs
@test/render.test.mjs
@test/helpers/mount-harness.mjs
@lib/_capabilities.js
@lib/commands.js
</context>
<tasks>
  <task type="auto">
    <name>Task 1: Update exact-count + membership assertions so the suite stays green</name>
    <files>test/_capabilities.test.mjs, test/mount.test.mjs, test/render.test.mjs</files>
    <read_first>test/_capabilities.test.mjs, test/mount.test.mjs, test/render.test.mjs, test/helpers/mount-harness.mjs</read_first>
    <action>
Update the known registration-count assertions to match the add-tests registration from plan 01 (23 capability keys / 30 tools / 27 commands / 25 insert-patch-rows). Make the three files' edits in ONE atomic commit (`test(phase-50): update registration count assertions for gsd_add_tests`). The final suite must be green with these new values — these are the ENUMERATED assertions (verified research OQ-3):

A. test/_capabilities.test.mjs:
- Line 13: `assert.equal(CAPABILITY_KEYS.length, 22)` → `assert.equal(CAPABILITY_KEYS.length, 23)`.
- The membership `for (const key of [...])` list: append `"gsdAddTests"` to the array so the new key is asserted present. Check whether the list also asserts the LAST element equals the final CAPABILITY_KEYS entry; if so, ensure "gsdAddTests" is that appended last entry (plan 01 appended it last) — otherwise just include it in the membership list.

B. test/mount.test.mjs:
- EXPECTED_TOOL_NAMES (line 104-115, the "Expected registered tool names (29)" comment): append `"gsd_add_tests"` to the array and update the `(29)` comment → `(30)`.
- EXPECTED_COMMAND_NAMES (line 117-128, "Expected registered command names (26)"): append `"gsd-add-tests"` and update `(26)` comment → `(27)`. NOTE the array is used in two asserts (line 188 membership scan and line 239 `[...EXPECTED_COMMAND_NAMES].sort()`), so one source covers both.
- Line 143: `ctx.tools.length === 29` → `=== 30`.
- Line 144: `ctx.commands.length === 26` → `=== 27`.
- Line 155: `CAPABILITY_KEYS.length === 22` → `=== 23`.
- Line 186: `ctx2.commands.length === 25` → `=== 26` (the subset mount that drops gsdQuick).
- Line 211: `insertRows.length === 24` → `=== 25`, and the `EXPECTED_INSERT_ROWS` deep-equal (line 212) auto-updates because it is derived from PATCH_ROWS (already 25 rows after plan 01). Update the surrounding stale prose (e.g. "Exactly the 24 insert rows" → 25).
- Line 324: `ctx.tools.length === 29` → `=== 30`, and the describe title "all 29 registered tools have a valid compiled schema" → "all 30 ...". Also update the `all 23 plugins activate` describe title (line 130) → `all 24 plugins activate` and `applies all 23 plugins in patch order` (line 139) → `applies all 24 plugins`, and `override row ... 23 insert rows resolve` (line 199) prose if it names a count (it says "23 insert rows resolve" in the title — update to reflect 25 insert rows / 24 plugins as accurate). These prose edits are cosmetic but keep the suite self-consistent.
- Verify EXPECTED_INSERT_ROWS equals 25 (it derives from the now-25-row PATCH_ROWS added in plan 01 Task 2G).

C. test/render.test.mjs:
- Line 105: the informationEntries(FULL) expected array `["gsdMapCodebase","gsdOrient","gsdJobs","gsdUndo","gsdHealth","gsdAutonomous"]` → append `"gsdAddTests"` at the END: `["gsdMapCodebase","gsdOrient","gsdJobs","gsdUndo","gsdHealth","gsdAutonomous","gsdAddTests"]`. Update the trailing comment (line 103-104) to mention gsdAddTests as the last out-of-band.
- DO NOT touch LOOP_ORDER (line ~97 `loopSteps(FULL)` equals LOOP_ORDER): gsdAddTests is out-of-band NOT_LOOP_ORDERED so it must NOT appear there.

After editing, run ONLY the three-file gate `node --test test/_capabilities.test.mjs test/mount.test.mjs test/render.test.mjs` and confirm it passes. Do NOT run the full `npm test` in this plan: plan 02's test/add-tests.test.mjs may not have landed yet (wave 2 runs in parallel), and the count-cascade is not the full-suite proof anyway — the full suite is verified at phase-level after all three plans commit. The full-`npm test` pass on the three files you edited here is the only suite assertion this plan owns. If any OTHER latent exact-count assertion inside THESE three files trips (e.g. elsewhere names 22/24/26/29), locate it with `grep -rn "length, 2[23469]\|length === 2[23469]\|=== 29\|=== 24" test/_capabilities.test.mjs test/mount.test.mjs test/render.test.mjs` and correct it to the new truthful value in the same atomic commit — but do not change unrelated tests.
</action>
<verify>
`node --test test/_capabilities.test.mjs test/mount.test.mjs test/render.test.mjs` passes (exit 0). `grep -n "CAPABILITY_KEYS.length" test/_capabilities.test.mjs` shows 23; `grep -n "gsdAddTests" test/render.test.mjs` shows it in the informationEntries array and NOT in LOOP_ORDER.
</verify>
<acceptance_criteria>
- `node --test test/_capabilities.test.mjs test/mount.test.mjs test/render.test.mjs` exits 0.
- `grep -n "CAPABILITY_KEYS.length, 23" test/_capabilities.test.mjs` matches.
- `grep -n "\"gsd_add_tests\"" test/mount.test.mjs` matches EXPECTED_TOOL_NAMES.
- `grep -n "\"gsd-add-tests\"" test/mount.test.mjs` matches EXPECTED_COMMAND_NAMES.
- `grep -n "ctx.tools.length === 30" test/mount.test.mjs` matches (both line 143 and 324).
- `grep -n "ctx.commands.length === 27" test/mount.test.mjs` matches.
- `grep -n "CAPABILITY_KEYS.length === 23" test/mount.test.mjs` matches.
- `grep -n "insertRows.length === 25" test/mount.test.mjs` matches.
- `grep -n "gsdUndo\", \"gsdHealth\", \"gsdAutonomous\", \"gsdAddTests\"" test/render.test.mjs` matches.
- `grep -n "gsdAddTests" test/render.test.mjs` does NOT match any LOOP_ORDER array line (check the loopSteps block).
- `node --test test/_capabilities.test.mjs test/mount.test.mjs test/render.test.mjs` exits 0 (the ONLY suite gate this plan owns; do NOT run full `npm test` here — plan 02's test/add-tests.test.mjs may not be landed and the full-suite green is proven at phase-level verify after plans 01+02+03 commit).
</acceptance_criteria>
<done>
All enumerated count/membership assertions are updated to the new truthful values, the render informationEntries appends gsdAddTests while loopSteps/LOOP_ORDER is untouched, and the three edited test files pass in isolation via the scoped three-file gate `node --test test/_capabilities.test.mjs test/mount.test.mjs test/render.test.mjs`. The transient mid-phase red full-suite (between plan 01's wave-1 registration and this plan's wave-2 count updates) is known and resolves before phase-level verify — the full-suite green proof happens after plans 01+02+03 commit.
</done>
  </task>
</tasks>

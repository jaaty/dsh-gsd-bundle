---
phase: 45-graphify
plan: 02
type: execute
wave: 2
depends_on: ["GSD-45-graphify-01"]
files_modified:
  - lib/_render.js
  - lib/commands.js
  - cordis.patch.yml
  - package.json
  - test/helpers/mount-harness.mjs
  - test/mount.test.mjs
  - test/render.test.mjs
  - test/_capabilities.test.mjs
autonomous: true
requirements: ["GAP-11"]
user_setup: []
must_haves:
  truths:
    - "The full mount registers 24 tools, 21 commands, 20 capability keys, and 22 cordis.patch.yml insert rows (D-01 registration surface)"
    - "gsdGraphify renders in the persona's step paragraphs and the Available-steps list after learnings (order 54 after 53)"
    - "/gsd-graphify is registered as a slash command paired to the gsdGraphify capability (D-01)"
    - "The DEGR-05 per-plugin removal suite auto-extends to include gsdGraphify (PATCH_ROWS has a graphify entry)"
  artifacts:
    - path: "lib/_render.js"
      provides: "gsdGraphify STEP_PARAGRAPHS entry so the persona renders the Graphify step paragraph when present"
      min_lines: 1
      exports: []
  key_links:
    - from: "cordis.patch.yml"
      to: "package.json"
      via: "the gsd-graphify patch row name @dsh-gsd/bundle/graphify resolves to the ./graphify export → lib/graphify.js"
      pattern: "gsd-graphify"
---

<objective>
Wire the full registration surface for the gsdGraphify capability and fix every existing test assertion that the new 20th capability breaks. This plan adds: the persona step paragraph in lib/_render.js, the /gsd-graphify command in lib/commands.js, the gsd-graphify plugin row in cordis.patch.yml, the ./graphify subpath export in package.json, the PATCH_ROWS entry in test/helpers/mount-harness.mjs (so the DEGR-05 removal suite auto-extends), and updates the count/regex/subset-list assertions in test/mount.test.mjs, test/render.test.mjs, and test/_capabilities.test.mjs (the CAPABILITY_KEYS length assertion and known-keys list). After this plan the full test suite passes with the new capability integrated.
</objective>

<context>
@lib/_render.js
@lib/commands.js
@cordis.patch.yml
@package.json
@test/helpers/mount-harness.mjs
@test/mount.test.mjs
@test/render.test.mjs
@test/removal.test.mjs
@lib/_capabilities.js
</context>

<tasks>
  <task type="auto">
    <name>Task 1: Registration wiring — render paragraph + command + patch row + export + harness PATCH_ROWS</name>
    <files>lib/_render.js, lib/commands.js, cordis.patch.yml, package.json, test/helpers/mount-harness.mjs</files>
    <read_first>lib/_render.js, lib/commands.js, cordis.patch.yml, package.json, test/helpers/mount-harness.mjs, lib/_capabilities.js</read_first>
    <action>
1. lib/_render.js — add a gsdGraphify entry to the STEP_PARAGRAPHS object (after gsdLearnings, before gsdQuick is fine — the object is keyed by capability key, iteration order follows CAPABILITY_KEYS). The paragraph MUST start with "- Graphify:" (the removal test at test/removal.test.mjs:146 derives capLabel from the step name "graphify" → "Graphify" and asserts `!body.includes("- Graphify:")` after retirement, so the paragraph line must begin with exactly "- Graphify:"). Content: a one-sentence "why this step exists" paragraph mirroring the learnings paragraph's style — e.g. "- Graphify: build a project knowledge graph in .planning/graphs/ from a deterministic pure-JS scan of the planning artefacts, with a tool to build, query, and inspect it. Soft gate — advisory, never blocks ship or the next phase." Do NOT add a "graphify" entry to NEXT_ACTION_TO_STEP (mirrors learnings' omission — graphify is an advisory off-loop step that never advances STATE, per D-10).

2. lib/commands.js — add a command entry to the COMMANDS array (after the gsd-extract-learnings entry near line 288). Entry shape: { name: "gsd-graphify", description: "Build, query, or inspect the project knowledge graph in .planning/graphs/.", hint: "build|query <term>|status", build: (raw) => { const m = raw.trim().match(/^(build|status)$/); if (m) return { text: "Run the gsd_graphify tool with action " + m[1] + ".", ack: "Graphify " + m[1] + " → gsd_graphify." }; const q = raw.trim().match(/^query\s+(.+)$/); if (q) return { text: "Run the gsd_graphify tool to query the graph for: " + q[1].trim(), ack: "Graphify query → gsd_graphify." }; return { err: "Usage: /gsd-graphify build|status|query <term>" }; } }. Per D-01.

3. cordis.patch.yml — add a gsd-graphify plugin row in the insert block, after the gsd-learnings row (line 118) and before gsd-ship (line 120), with a comment explaining it is the advisory graphify step. Format: two lines indented matching the existing rows:
    # The graphify advisory step (after learnings): builds a project knowledge
    # graph in .planning/graphs/ from a deterministic pure-JS scan. Soft gate;
    # never blocks ship. Does not advance STATE.
    - id: gsd-graphify
      name: '@dsh-gsd/bundle/graphify'

4. package.json — add a "./graphify" subpath export in the exports object (after the "./learnings" entry at line 95-96): "./graphify": { "default": "./lib/graphify.js" }.

5. test/helpers/mount-harness.mjs — add { id: "gsd-graphify", sub: "graphify" } to the PATCH_ROWS array, after the { id: "gsd-learnings", sub: "learnings" } entry (line 39). This is required so the DEGR-05 removal suite's retirementMatrix() finds a patch row for step "graphify" (test/removal.test.mjs:42-43 asserts `PATCH_ROWS.find(r => r.sub === cap.step)` is truthy for every role:"step" capability).
    </action>
    <verify>grep -q "gsdGraphify" lib/_render.js && grep -q "gsd-graphify" lib/commands.js && grep -q "gsd-graphify" cordis.patch.yml && grep -q '"./graphify"' package.json && grep -q 'sub: "graphify"' test/helpers/mount-harness.mjs</verify>
    <acceptance_criteria>
      - grep -q "^  gsdGraphify:" lib/_render.js (STEP_PARAGRAPHS entry with key gsdGraphify)
      - grep -q -- "- Graphify:" lib/_render.js (paragraph starts with "- Graphify:")
      - grep -q "gsd-graphify" lib/commands.js (command entry)
      - grep -q "gsd-graphify" cordis.patch.yml (patch row)
      - grep -q './graphify' package.json (subpath export)
      - grep -q 'sub: "graphify"' test/helpers/mount-harness.mjs (PATCH_ROWS entry)
      - grep -c "id:" test/helpers/mount-harness.mjs PATCH_ROWS section shows 22 entries (was 21)
    </acceptance_criteria>
    <done>All five registration-surface files are updated: the persona renders a Graphify paragraph, the /gsd-graphify command is registered, cordis.patch.yml has the gsd-graphify row, package.json exports ./graphify, and mount-harness PATCH_ROWS has the graphify entry.</done>
  </task>

  <task type="auto">
    <name>Task 2: Update existing test assertions for the new 20th capability</name>
    <files>test/mount.test.mjs, test/render.test.mjs, test/_capabilities.test.mjs</files>
    <read_first>test/mount.test.mjs, test/render.test.mjs, test/_capabilities.test.mjs, test/removal.test.mjs, lib/_capabilities.js</read_first>
    <action>
Update every assertion that the new gsdGraphify capability (order 54, +1 tool, +1 command, +1 patch row, +1 capability key) breaks. These are mechanical count/regex/list updates.

test/mount.test.mjs:
- Line 105: EXPECTED_TOOL_NAMES — add "gsd_graphify" to the array (after "gsd_extract_learnings").
- Line 114: EXPECTED_COMMAND_NAMES — add "gsd-graphify" to the array (after "gsd-extract-learnings").
- Line 122: describe name "mount: all 21 plugins activate" → "mount: all 22 plugins activate".
- Line 131: test name "applies all 21 plugins in patch order without throwing" → "applies all 22 plugins in patch order without throwing".
- Line 135: change `ctx.tools.length === 23` to `ctx.tools.length === 24`.
- Line 136: change `ctx.commands.length === 20` to `ctx.commands.length === 21`.
- Line 147: change `CAPABILITY_KEYS.length === 19` to `CAPABILITY_KEYS.length === 20`.
- Line 178: change `ctx2.commands.length === 19` to `ctx2.commands.length === 20` (after retiring one capability, 21-1=20).
- Line 191: test name "override row present, 21 insert rows resolve via exports + import()" → "override row present, 22 insert rows resolve via exports + import()".
- Line 203: change `insertRows.length === 21` to `insertRows.length === 22`.
- Line 316: change `assert.equal(ctx.tools.length, 23)` to `assert.equal(ctx.tools.length, 24)`.
- Line 442: in the mountSubset subs array, add "graphify" (after "learnings"). The subs array becomes: ["persona", "state", "core-tools", "discuss", "spec", "plan", "gap-analysis", "execute", "code-review", "ui-review", "verify", "validate", "undo", "ship", "milestone-audit", "learnings", "graphify", "ui", "quick", "map-codebase", "health"].
- Line 458: extend the snapshot regex from `/Available steps: spec, discuss, ui, plan, gap-analysis, quick, execute, code-review, ui-review, verify, validate, ship, milestone-audit, learnings\./` to include "graphify" after "learnings": `/Available steps: spec, discuss, ui, plan, gap-analysis, quick, execute, code-review, ui-review, verify, validate, ship, milestone-audit, learnings, graphify\./`.

test/render.test.mjs:
- Line 43: LOOP_ORDER array — append "gsdGraphify" after "gsdLearnings" (gsdGraphify has order 54, after learnings 53, so it is last in the ascending-order loop).
- Line 111: the loopSteps(subset) deepEqual expected array — append "gsdGraphify" after "gsdLearnings" (the subset is without("gsdVerify"), so all other loop steps including gsdGraphify are present).
- Line 138: the without(...) call — add "gsdGraphify" to the list so the "no greater slot → null" intent holds: change `without("gsdVerify", "gsdValidatePhase", "gsdShip", "gsdMilestoneAudit", "gsdLearnings")` to `without("gsdVerify", "gsdValidatePhase", "gsdShip", "gsdMilestoneAudit", "gsdLearnings", "gsdGraphify")`.

test/_capabilities.test.mjs:
- Line 12: change the test name string "exposes exactly the 19 known keys" to "exposes exactly the 20 known keys".
- Line 13: change `assert.equal(CAPABILITY_KEYS.length, 19)` to `assert.equal(CAPABILITY_KEYS.length, 20)`.
- Lines 14-34: in the `for (const key of [...])` array literal, append `"gsdGraphify"` as the last element after `"gsdLearnings"` (the list must enumerate every CAPABILITY_KEYS entry so the `CAPABILITY_KEYS.includes(key)` loop covers the new key too).

Do NOT modify test/removal.test.mjs — it auto-extends via STEP_CAPS/retirementMatrix and requires no assertion changes (the gsdGraphify retirement row routes to discuss-phase fallback, identical to learnings' already-passing behavior).
    </action>
    <verify>node --test test/_capabilities.test.mjs test/mount.test.mjs test/render.test.mjs test/removal.test.mjs 2>&1 | tail -20</verify>
    <acceptance_criteria>
      - grep -q "gsd_graphify" test/mount.test.mjs (tool name in EXPECTED_TOOL_NAMES)
      - grep -q "gsd-graphify" test/mount.test.mjs (command name in EXPECTED_COMMAND_NAMES)
      - grep -q "=== 24" test/mount.test.mjs (tool count bumped to 24)
      - grep -q "=== 21" test/mount.test.mjs (command count bumped to 21)
      - grep -q "=== 20" test/mount.test.mjs (capability count bumped to 20)
      - grep -q "gsdGraphify" test/render.test.mjs (LOOP_ORDER + without list)
      - grep -q "gsdGraphify" test/_capabilities.test.mjs (known-keys list now includes gsdGraphify)
      - grep -q "CAPABILITY_KEYS.length, 20" test/_capabilities.test.mjs (length assertion bumped to 20)
      - grep -q "exposes exactly the 20 known keys" test/_capabilities.test.mjs (test name bumped to 20)
      - grep -q "graphify" test/mount.test.mjs (snapshot regex + subs list)
      - node --test test/_capabilities.test.mjs test/mount.test.mjs test/render.test.mjs test/removal.test.mjs exits 0 (all registration tests pass)
    </acceptance_criteria>
    <done>test/mount.test.mjs, test/render.test.mjs, and test/_capabilities.test.mjs assertions are updated for the new gsdGraphify capability. mount.test.mjs, render.test.mjs, _capabilities.test.mjs, and removal.test.mjs all pass. The full test suite (npm test) passes.</done>
  </task>
</tasks>

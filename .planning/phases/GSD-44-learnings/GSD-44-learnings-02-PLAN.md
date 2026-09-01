---
phase: 44-learnings
plan: 02
type: execute
wave: 2
depends_on: ["GSD-44-learnings-01"]
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
requirements: ["GAP-10"]
user_setup: []
must_haves:
  truths:
    - "The full mount registers 23 tools, 20 commands, 19 capability keys, and 21 cordis.patch.yml insert rows (D-01 registration surface)"
    - "gsdLearnings renders in the persona's step paragraphs and the Available-steps list after milestone-audit (order 53 after 52)"
    - "/gsd-extract-learnings is registered as a slash command paired to the gsdLearnings capability (D-01, D-05/OQ-5)"
    - "The DEGR-05 per-plugin removal suite auto-extends to include gsdLearnings (PATCH_ROWS has a learnings entry)"
  artifacts:
    - path: "lib/_render.js"
      provides: "gsdLearnings STEP_PARAGRAPHS entry so the persona renders the Learnings step paragraph when present"
      min_lines: 1
      exports: []
  key_links:
    - from: "cordis.patch.yml"
      to: "package.json"
      via: "the gsd-learnings patch row name @dsh-gsd/bundle/learnings resolves to the ./learnings export → lib/learnings.js"
      pattern: "gsd-learnings"
---

<objective>
Wire the full registration surface for the gsdLearnings capability and fix every existing test assertion that the new 19th capability breaks. This plan adds: the persona step paragraph in lib/_render.js, the /gsd-extract-learnings command in lib/commands.js, the gsd-learnings plugin row in cordis.patch.yml, the ./learnings subpath export in package.json, the PATCH_ROWS entry in test/helpers/mount-harness.mjs (so the DEGR-05 removal suite auto-extends), and updates the count/regex/subset-list assertions in test/mount.test.mjs, test/render.test.mjs, and test/_capabilities.test.mjs (the CAPABILITY_KEYS length assertion and known-keys list — omitted from the RESEARCH.md OQ-1 table but verified to break at 18≠19). After this plan the full test suite passes with the new capability integrated.
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
1. lib/_render.js — add a gsdLearnings entry to the STEP_PARAGRAPHS object (after gsdMilestoneAudit, before gsdQuick is fine — the object is keyed by capability key, iteration order follows CAPABILITY_KEYS). The paragraph MUST start with "- Learnings:" (the removal test at test/removal.test.mjs:146 derives capLabel from the step name "learnings" → "Learnings" and asserts `!body.includes("- Learnings:")` after retirement, so the paragraph line must begin with exactly "- Learnings:"). Content: a one-sentence "why this step exists" paragraph mirroring the milestone-audit paragraph's style — e.g. "- Learnings: after a phase completes, extract decisions, lessons, patterns, and surprises from its planning artefacts into a carrying-forward LEARNINGS.md that accumulates across phases. Soft gate — advisory, never blocks ship or the next phase." Do NOT add a "learnings" entry to NEXT_ACTION_TO_STEP (mirrors milestone-audit's omission — learnings is an advisory off-loop step that never advances STATE, per D-12).

2. lib/commands.js — add a command entry to the COMMANDS array (after the gsd-health entry near line 231, or grouped with the advisory steps). Entry shape: { name: "gsd-extract-learnings", description: "Extract learnings from phase N: accumulate decisions, lessons, patterns, and surprises into a carrying-forward LEARNINGS.md.", hint: "<N> [--force]", build: (raw) => { const n = phaseNum(raw); if (!n) return { err: "Usage: /gsd-extract-learnings <N> [--force]" }; const force = /--force/.test(raw); return { text: "Run the gsd_extract_learnings tool on phase " + n + (force ? " with force:true to re-extract" : "") + ".", ack: "Extract learnings phase " + n + " → gsd_extract_learnings." }; } }. Use the existing phaseNum helper already imported in commands.js. Per D-01, D-05/OQ-5.

3. cordis.patch.yml — add a gsd-learnings plugin row in the insert block, after the gsd-milestone-audit row (line 111) and before gsd-ship (line 113), with a comment explaining it is the advisory learnings step. Format: two lines indented matching the existing rows:
    # The extract-learnings advisory step (after milestone-audit): accumulates
    # decisions, lessons, patterns, and surprises from a completed phase's
    # artefacts into a carrying-forward .planning/LEARNINGS.md. Soft gate;
    # never blocks ship. Does not advance STATE.
    - id: gsd-learnings
      name: '@dsh-gsd/bundle/learnings'

4. package.json — add a "./learnings" subpath export in the exports object (after the "./milestone-audit" entry at line 92-94): "./learnings": { "default": "./lib/learnings.js" }.

5. test/helpers/mount-harness.mjs — add { id: "gsd-learnings", sub: "learnings" } to the PATCH_ROWS array, after the { id: "gsd-milestone-audit", sub: "milestone-audit" } entry (line 38). This is required so the DEGR-05 removal suite's retirementMatrix() finds a patch row for step "learnings" (test/removal.test.mjs:42-43 asserts `PATCH_ROWS.find(r => r.sub === cap.step)` is truthy for every role:"step" capability). Per OQ-1 resolution.
    </action>
    <verify>grep -q "gsdLearnings" lib/_render.js && grep -q "gsd-extract-learnings" lib/commands.js && grep -q "gsd-learnings" cordis.patch.yml && grep -q '"./learnings"' package.json && grep -q 'sub: "learnings"' test/helpers/mount-harness.mjs</verify>
    <acceptance_criteria>
      - grep -q "^  gsdLearnings:" lib/_render.js (STEP_PARAGRAPHS entry with key gsdLearnings)
      - grep -q -- "- Learnings:" lib/_render.js (paragraph starts with "- Learnings:")
      - grep -q "gsd-extract-learnings" lib/commands.js (command entry)
      - grep -q "gsd-learnings" cordis.patch.yml (patch row)
      - grep -q './learnings' package.json (subpath export)
      - grep -q 'sub: "learnings"' test/helpers/mount-harness.mjs (PATCH_ROWS entry)
      - grep -c "id:" test/helpers/mount-harness.mjs PATCH_ROWS section shows 21 entries (was 20)
    </acceptance_criteria>
    <done>All five registration-surface files are updated: the persona renders a Learnings paragraph, the /gsd-extract-learnings command is registered, cordis.patch.yml has the gsd-learnings row, package.json exports ./learnings, and mount-harness PATCH_ROWS has the learnings entry.</done>
  </task>

  <task type="auto">
    <name>Task 2: Update existing test assertions for the new 19th capability (OQ-1 table + _capabilities.test.mjs)</name>
    <files>test/mount.test.mjs, test/render.test.mjs, test/_capabilities.test.mjs</files>
    <read_first>test/mount.test.mjs, test/render.test.mjs, test/_capabilities.test.mjs, test/removal.test.mjs, lib/_capabilities.js</read_first>
    <action>
Update every assertion that the new gsdLearnings capability (order 53, +1 tool, +1 command, +1 patch row, +1 capability key) breaks. These are mechanical count/regex/list updates per the OQ-1 resolution table in RESEARCH.md.

test/mount.test.mjs:
- Line 106: EXPECTED_TOOL_NAMES — add "gsd_extract_learnings" to the array (after "gsd_milestone_audit").
- Line 114: EXPECTED_COMMAND_NAMES — add "gsd-extract-learnings" to the array (after "gsd-health").
- Line 135: change `ctx.tools.length === 22` to `ctx.tools.length === 23`.
- Line 136: change `ctx.commands.length === 19` to `ctx.commands.length === 20`.
- Line 147: change `CAPABILITY_KEYS.length === 18` to `CAPABILITY_KEYS.length === 19`.
- Line 178: change `ctx2.commands.length === 18` to `ctx2.commands.length === 19` (after retiring one capability, 20-1=19).
- Line 203: change `insertRows.length === 20` to `insertRows.length === 21`.
- Line 316: change `assert.equal(ctx.tools.length, 22)` to `assert.equal(ctx.tools.length, 23)`.
- Line 442: in the mountSubset subs array, add "learnings" (after "milestone-audit"). The subs array becomes: ["persona", "state", "core-tools", "discuss", "spec", "plan", "gap-analysis", "execute", "code-review", "ui-review", "verify", "validate", "undo", "ship", "milestone-audit", "learnings", "ui", "quick", "map-codebase", "health"].
- Line 458: extend the snapshot regex from `/Available steps: spec, discuss, ui, plan, gap-analysis, quick, execute, code-review, ui-review, verify, validate, ship, milestone-audit\./` to include "learnings" after "milestone-audit": `/Available steps: spec, discuss, ui, plan, gap-analysis, quick, execute, code-review, ui-review, verify, validate, ship, milestone-audit, learnings\./`.
- Stale human-readable count labels/comments (advisory but required for the "clean full-suite pass" claim): line 122 describe name "mount: all 20 plugins activate" → "mount: all 21 plugins activate"; line 126 comment "the full 20-tool surface" → "the full 21-row surface" (this is the patch-row surface, not tools); line 131 test name "applies all 20 plugins in patch order without throwing" → "applies all 21 plugins in patch order without throwing"; line 191 test name "override row present, 20 insert rows resolve via exports + import()" → "override row present, 21 insert rows resolve via exports + import()". These are name/comment strings only (non-asserting) but must read accurately post-bump.

test/render.test.mjs:
- Line 43: LOOP_ORDER array — append "gsdLearnings" after "gsdMilestoneAudit" (gsdLearnings has order 53, after milestone-audit 52, so it is last in the ascending-order loop).
- Line 111: the loopSteps(subset) deepEqual expected array — append "gsdMilestoneAudit" is already last; now append "gsdLearnings" after it (the subset is without("gsdVerify"), so all other loop steps including gsdLearnings are present).
- Line 138: the without(...) call — add "gsdLearnings" to the list so the "no greater slot → null" intent holds: change `without("gsdVerify", "gsdValidatePhase", "gsdShip", "gsdMilestoneAudit")` to `without("gsdVerify", "gsdValidatePhase", "gsdShip", "gsdMilestoneAudit", "gsdLearnings")`.

test/_capabilities.test.mjs (NOT in the RESEARCH.md OQ-1 table but verified to break — the file asserts CAPABILITY_KEYS.length === 18 and enumerates exactly 18 keys; adding gsdLearnings as the 19th CAPABILITY_KEYS entry in Plan 01 Task 2 makes this fail at 19≠18):
- Line 12: change the test name string "exposes exactly the 18 known keys" to "exposes exactly the 19 known keys".
- Line 13: change `assert.equal(CAPABILITY_KEYS.length, 18)` to `assert.equal(CAPABILITY_KEYS.length, 19)`.
- Lines 14-33: in the `for (const key of [...])` array literal, append `"gsdLearnings"` as the last element after `"gsdMilestoneAudit"` (the list must enumerate every CAPABILITY_KEYS entry so the `CAPABILITY_KEYS.includes(key)` loop covers the new key too).

Do NOT modify test/removal.test.mjs — it auto-extends via STEP_CAPS/retirementMatrix and requires no assertion changes (the gsdLearnings retirement row routes to discuss-phase fallback, identical to milestone-audit's already-passing behavior).
    </action>
    <verify>node --test test/_capabilities.test.mjs test/mount.test.mjs test/render.test.mjs test/removal.test.mjs 2>&1 | tail -20</verify>
    <acceptance_criteria>
      - grep -q "gsd_extract_learnings" test/mount.test.mjs (tool name in EXPECTED_TOOL_NAMES)
      - grep -q "gsd-extract-learnings" test/mount.test.mjs (command name in EXPECTED_COMMAND_NAMES)
      - grep -q "=== 23" test/mount.test.mjs (tool count bumped to 23)
      - grep -q "=== 20" test/mount.test.mjs (command count bumped to 20)
      - grep -q "=== 19" test/mount.test.mjs (capability count bumped to 19)
      - grep -q "gsdLearnings" test/render.test.mjs (LOOP_ORDER + without list)
      - grep -q "gsdLearnings" test/_capabilities.test.mjs (known-keys list now includes gsdLearnings)
      - grep -q "CAPABILITY_KEYS.length, 19" test/_capabilities.test.mjs (length assertion bumped to 19)
      - grep -q "exposes exactly the 19 known keys" test/_capabilities.test.mjs (test name bumped to 19)
      - grep -q "learnings" test/mount.test.mjs (snapshot regex + subs list)
      - node --test test/_capabilities.test.mjs test/mount.test.mjs test/render.test.mjs test/removal.test.mjs exits 0 (all registration tests pass)
    </acceptance_criteria>
    <done>test/mount.test.mjs, test/render.test.mjs, and test/_capabilities.test.mjs assertions are updated for the new gsdLearnings capability (including the _capabilities.test.mjs CAPABILITY_KEYS length 18→19 and known-keys list, which the OQ-1 table missed). mount.test.mjs, render.test.mjs, _capabilities.test.mjs, and removal.test.mjs all pass. The full test suite (npm test) passes.</done>
  </task>
</tasks>
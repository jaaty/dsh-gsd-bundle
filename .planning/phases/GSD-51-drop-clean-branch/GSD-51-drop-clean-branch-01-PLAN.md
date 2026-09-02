---
phase: 51-drop-clean-branch
plan: 01
type: execute
wave: 1
depends_on: []
files_modified: ["lib/_shared.js", "lib/undo.js", "test/undo.test.mjs", "test/_shared.test.mjs"]
autonomous: true
requirements: ["SHIP-CLEAN-04"]
gap_closure: false
user_setup: []
must_haves:
  truths:
    - "lib/undo.js still parses name-status diffs correctly after parseNameStatusZ moves to lib/_shared.js (the undo dry-run report keeps working)."
    - "lib/_clean-branch.js is NOT deleted by this plan; it is deleted by plan 02 after this relocation is complete."
  artifacts:
    - path: "lib/_shared.js"
      provides: "parseNameStatusZ relocated verbatim from _clean-branch.js, placed beside the other parse helpers"
      min_lines: 40
      exports: ["parseNameStatusZ"]
    - path: "test/_shared.test.mjs"
      provides: "direct unit tests for the relocated parseNameStatusZ (rename, normal status, trailing NUL, truncated input)"
      min_lines: 20
      exports: []
  key_links:
    - from: "lib/undo.js"
      to: "lib/_shared.js"
      via: "import { parseNameStatusZ } from './_shared.js'"
      pattern: "from \"\\./_shared\\.js\""
    - from: "test/undo.test.mjs"
      to: "lib/_shared.js"
      via: "import { parseNameStatusZ } from '../lib/_shared.js'"
      pattern: "from \"\\.\\./lib/_shared\\.js\""
---
<objective>Relocate the shared parseNameStatusZ function from lib/_clean-branch.js into lib/_shared.js so lib/undo.js keeps working after _clean-branch.js is deleted (D-03). This is the tracer slice: it touches the domain module (_shared.js), the surviving consumer (undo.js), and the tests, and it is verified green before any removal proceeds.</objective>
<context>@lib/_clean-branch.js (lines 86-108 hold parseNameStatusZ), @lib/_shared.js (relocation target, already holds parseFrontmatter/stringifyFrontmatter/parseDecisionEntries), @lib/undo.js (line 35 imports parseNameStatusZ from ./_clean-branch.js), @test/undo.test.mjs (line 25 imports it from ../lib/_clean-branch.js), @test/_shared.test.mjs (currently has no parseNameStatusZ coverage)</context>
<tasks>
  <task type="auto">
    <name>Task 1: Relocate parseNameStatusZ verbatim into lib/_shared.js and repoint the two imports</name>
    <files>lib/_shared.js, lib/undo.js, test/undo.test.mjs</files>
    <read_first>lib/_clean-branch.js, lib/_shared.js, lib/undo.js, test/undo.test.mjs</read_first>
    <action>Read lib/_clean-branch.js lines 86-108 (the export function parseNameStatusZ(raw) block) and copy it VERBATIM into lib/_shared.js, placing it immediately after the parseDecisionEntries function so it sits with the other parse helpers (per D-06). Do not alter the function body — it is a pure, self-contained function with no imports or I/O, so a verbatim move is a zero-behaviour-change relocation. Then change lib/undo.js line 35 from `import { parseNameStatusZ } from "./_clean-branch.js";` to `import { parseNameStatusZ } from "./_shared.js";`. Then change test/undo.test.mjs line 25 from `import { parseNameStatusZ } from "../lib/_clean-branch.js";` to `import { parseNameStatusZ } from "../lib/_shared.js";`. Do NOT delete lib/_clean-branch.js in this plan — plan 02 owns that deletion.</action>
    <verify>node --test test/undo.test.mjs</verify>
    <acceptance_criteria>
      - grep -n "parseNameStatusZ" lib/_shared.js returns the relocated function definition
      - grep -n "_clean-branch" lib/undo.js returns nothing
      - grep -n "_clean-branch" test/undo.test.mjs returns nothing
      - node --test test/undo.test.mjs exits 0
    </acceptance_criteria>
    <done>parseNameStatusZ lives in lib/_shared.js, both consumers import it from there, and the undo test suite passes.</done>
  </task>
  <task type="auto">
    <name>Task 2: Add direct parseNameStatusZ unit tests to test/_shared.test.mjs</name>
    <files>test/_shared.test.mjs</files>
    <read_first>test/_shared.test.mjs, lib/_shared.js</read_first>
    <action>Add a describe block named "parseNameStatusZ" to test/_shared.test.mjs. Import parseNameStatusZ from "../lib/_shared.js" (add it to the existing import from _shared.js if one exists, otherwise add a new import line). Cover at minimum: (a) a normal status entry `M\0path` yields [{ status: "M", path }]; (b) a rename `R100\0old\0new` yields [{ status: "R", oldPath, newPath }]; (c) a trailing NUL (input ending in \0) drops the final empty token and still parses the preceding entries; (d) a truncated rename (R with a missing newPath token) stops defensively and returns the entries parsed so far; (e) empty/malformed input ("" returns [], a leading empty status token stops). This preserves direct coverage of the relocated function that was previously only exercised through test/undo.test.mjs (R-4).</action>
    <verify>node --test test/_shared.test.mjs</verify>
    <acceptance_criteria>
      - grep -n "parseNameStatusZ" test/_shared.test.mjs returns the import and the describe block
      - node --test test/_shared.test.mjs exits 0
    </acceptance_criteria>
    <done>parseNameStatusZ has direct unit coverage in test/_shared.test.mjs and that file passes.</done>
  </task>
  <task type="auto">
    <name>Task 3: Confirm the affected suite is green and no _clean-branch import survives in the relocated consumers</name>
    <files>lib/_shared.js, lib/undo.js, test/undo.test.mjs, test/_shared.test.mjs</files>
    <read_first>lib/undo.js, test/undo.test.mjs</read_first>
    <action>Run the affected test files together and confirm the relocation left no dangling _clean-branch import in the two consumers. Run `node --test test/undo.test.mjs test/_shared.test.mjs` and confirm exit code 0. Run `grep -rn "_clean-branch" lib/undo.js test/undo.test.mjs` and confirm it returns nothing. Do not delete lib/_clean-branch.js (plan 02 owns that).</action>
    <verify>node --test test/undo.test.mjs test/_shared.test.mjs</verify>
    <acceptance_criteria>
      - node --test test/undo.test.mjs test/_shared.test.mjs exits 0
      - grep -rn "_clean-branch" lib/undo.js test/undo.test.mjs returns nothing
    </acceptance_criteria>
    <done>The relocation is complete and verified: undo still works, parseNameStatusZ has direct coverage, and no consumer of the two relocated files imports from _clean-branch.js.</done>
  </task>
</tasks>

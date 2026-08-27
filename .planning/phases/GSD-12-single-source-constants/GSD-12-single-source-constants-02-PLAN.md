---
phase: 12-single-source-constants
plan: 02
type: execute
wave: 1
depends_on: []
files_modified: ["lib/ship.js", "lib/core-tools.js", "lib/discuss.js", "test/ship.test.mjs"]
autonomous: true
requirements: ["CQ-02"]
gap_closure: false
user_setup: []
must_haves:
  truths:
    - "ship.js imports GATE_NAMES from gates.js and contains no local const GATE_NAMES definition"
    - "core-tools.js and discuss.js import cwdOf from _runner.js and contain no inline exec?.agent?.session?.header?.cwd expression"
  artifacts:
    - path: "lib/ship.js"
      provides: "GATE_NAMES consumed from gates.js (single source), duplicate local definition removed"
      min_lines: 40
      exports: []
    - path: "lib/core-tools.js"
      provides: "cwdOf imported from _runner.js, four inline cwd expressions replaced with the shared helper"
      min_lines: 40
      exports: []
    - path: "lib/discuss.js"
      provides: "cwdOf imported from _runner.js, inline cwd expression replaced with the shared helper"
      min_lines: 40
      exports: []
    - path: "test/ship.test.mjs"
      provides: "static regression tests proving GATE_NAMES and cwdOf are single-source"
      min_lines: 30
      exports: []
  key_links:
    - from: "lib/ship.js"
      to: "lib/gates.js"
      via: "import { GATE_NAMES } from './gates.js' (added to the existing gates.js import)"
      pattern: "import \\{[^}]*GATE_NAMES[^}]*\\} from \"\\./gates\\.js\""
    - from: "lib/core-tools.js"
      to: "lib/_runner.js"
      via: "import { cwdOf } from './_runner.js'"
      pattern: "import \\{ cwdOf \\} from \"\\./_runner\\.js\""
    - from: "lib/discuss.js"
      to: "lib/_runner.js"
      via: "import { cwdOf } from './_runner.js'"
      pattern: "import \\{ cwdOf \\} from \"\\./_runner\\.js\""
---
<objective>Make GATE_NAMES and the cwdOf helper single-source: have ship.js import GATE_NAMES from gates.js (removing its duplicate local definition, D-02), and have core-tools.js and discuss.js import cwdOf from _runner.js (removing their inline copies, D-03). Pure dedup refactor — no behavior change.</objective>

<context>@lib/ship.js (line 17 local `const GATE_NAMES = [...]` to remove; line 15 already imports from ./gates.js), @lib/gates.js (line 224 exports GATE_NAMES — the canonical source), @lib/core-tools.js (inline cwd expressions at lines 54, 90, 165, 215), @lib/discuss.js (inline cwd expression at line 69), @lib/_runner.js (lines 48-50 export cwdOf(exec) returning exec?.agent?.session?.header?.cwd || process.cwd()).</context>

<tasks>
  <task type="auto">
    <name>Task 1: ship.js imports GATE_NAMES from gates.js and drops its local copy (tracer, D-02)</name>
    <files>lib/ship.js</files>
    <read_first>lib/ship.js, lib/gates.js</read_first>
    <action>In lib/ship.js, delete the local `const GATE_NAMES = ["security", "broken_windows", "tdd_audit"];` on line 17. Extend the existing import on line 15 (`import { runCapabilityGates, fetchGitData } from "./gates.js";`) to also import GATE_NAMES, e.g. `import { runCapabilityGates, fetchGitData, GATE_NAMES } from "./gates.js";`. Leave all usages of GATE_NAMES (e.g. line 92 `GATE_NAMES.includes(skip)`) unchanged — they now resolve to the gates.js export.</action>
    <verify>Run `npm test` and confirm the ship-related tests still pass.</verify>
    <acceptance_criteria>
      - grep "const GATE_NAMES" lib/ship.js exits 1
      - grep "GATE_NAMES" lib/ship.js exits 0 (still referenced)
      - grep "GATE_NAMES" lib/ship.js shows it appears in the ./gates.js import line
      - `npm test` exits 0
    </acceptance_criteria>
    <done>ship.js consumes GATE_NAMES from gates.js; no duplicate definition remains.</done>
  </task>

  <task type="auto">
    <name>Task 2: core-tools.js and discuss.js import cwdOf from _runner.js and drop inline copies (D-03)</name>
    <files>lib/core-tools.js, lib/discuss.js</files>
    <read_first>lib/core-tools.js, lib/discuss.js, lib/_runner.js</read_first>
    <action>In lib/core-tools.js, add `import { cwdOf } from "./_runner.js";` at the top (after the existing imports). Replace each of the four inline `const cwd = exec?.agent?.session?.header?.cwd || process.cwd();` expressions (lines 54, 90, 165, 215) with `const cwd = cwdOf(exec);`. In lib/discuss.js, add `import { cwdOf } from "./_runner.js";` at the top (after the existing `import { defineTool } from "@deepseek-ai/dsh-tools";` and the `./_shared.js` import). Replace the inline `const cwd = exec?.agent?.session?.header?.cwd || process.cwd();` on line 69 with `const cwd = cwdOf(exec);`. Do not change the cwdOf implementation in _runner.js.</action>
    <verify>Run `npm test` and confirm the tool-registration and discuss tests still pass.</verify>
    <acceptance_criteria>
      - grep "import { cwdOf } from \"./_runner.js\"" lib/core-tools.js exits 0
      - grep "import { cwdOf } from \"./_runner.js\"" lib/discuss.js exits 0
      - grep -c "exec?.agent?.session?.header?.cwd" lib/core-tools.js equals 0
      - grep -c "exec?.agent?.session?.header?.cwd" lib/discuss.js equals 0
      - grep -c "cwdOf(exec)" lib/core-tools.js equals 4
      - grep -c "cwdOf(exec)" lib/discuss.js equals 1
      - `npm test` exits 0
    </acceptance_criteria>
    <done>core-tools.js and discuss.js route cwd through the shared cwdOf helper; no inline cwd expression remains in either file.</done>
  </task>

  <task type="auto">
    <name>Task 3: Add static regression tests proving GATE_NAMES and cwdOf are single-source</name>
    <files>test/ship.test.mjs</files>
    <read_first>test/_shared.test.mjs, test/tools.test.mjs</read_first>
    <action>Create test/ship.test.mjs using node:test + node:assert/strict, mirroring the style of test/_shared.test.mjs. Use node:fs to read the source of lib/ship.js, lib/core-tools.js, and lib/discuss.js. Add tests: (1) ship.js source does NOT contain "const GATE_NAMES" and DOES contain "GATE_NAMES" in its "./gates.js" import line; (2) core-tools.js source contains `import { cwdOf } from "./_runner.js"` and does NOT contain "exec?.agent?.session?.header?.cwd"; (3) discuss.js source contains `import { cwdOf } from "./_runner.js"` and does NOT contain "exec?.agent?.session?.header?.cwd".</action>
    <verify>Run `npm test` and confirm the new test/ship.test.mjs suite runs and passes.</verify>
    <acceptance_criteria>
      - grep "GATE_NAMES" test/ship.test.mjs exits 0
      - grep "cwdOf" test/ship.test.mjs exits 0
      - grep "exec?.agent?.session?.header?.cwd" test/ship.test.mjs exits 0 (the negative assertion string)
      - `npm test` exits 0 and reports the ship suite passing
    </acceptance_criteria>
    <done>test/ship.test.mjs pins the GATE_NAMES and cwdOf single-source invariants; the full suite is green.</done>
  </task>
</tasks>

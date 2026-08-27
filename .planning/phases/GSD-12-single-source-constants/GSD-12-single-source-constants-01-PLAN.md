---
phase: 12-single-source-constants
plan: 01
type: execute
wave: 1
depends_on: []
files_modified: ["lib/_shared.js", "lib/gates.js", "lib/_agents.js", "test/gates.test.mjs", "test/dedup.test.mjs"]
autonomous: true
requirements: ["CQ-02"]
gap_closure: false
user_setup: []
must_haves:
  truths:
    - "secretPatterns is exported from lib/_shared.js and no longer defined in lib/gates.js"
    - "CODEBASE_MAPPER_PROMPT and CODEBASE_QUERY_PROMPT each contain the secretPatterns array joined by ', '"
  artifacts:
    - path: "lib/_shared.js"
      provides: "canonical secretPatterns array + forbiddenFilesProse() helper (single source of the secret-file list)"
      min_lines: 40
      exports: ["secretPatterns", "forbiddenFilesProse"]
    - path: "lib/_agents.js"
      provides: "CODEBASE_MAPPER_PROMPT and CODEBASE_QUERY_PROMPT with forbidden-files prose derived from the canonical array"
      min_lines: 40
      exports: ["CODEBASE_MAPPER_PROMPT", "CODEBASE_QUERY_PROMPT"]
    - path: "test/dedup.test.mjs"
      provides: "regression tests proving the prose derives from the array and gates.js no longer owns secretPatterns"
      min_lines: 30
      exports: []
  key_links:
    - from: "lib/gates.js"
      to: "lib/_shared.js"
      via: "import { secretPatterns } from './_shared.js'"
      pattern: "import \\{ secretPatterns \\} from \"\\./_shared\\.js\""
    - from: "lib/_agents.js"
      to: "lib/_shared.js"
      via: "import { forbiddenFilesProse } from './_shared.js' and template-literal interpolation in both prompts"
      pattern: "import \\{ forbiddenFilesProse \\} from \"\\./_shared\\.js\""
---
<objective>Make the secret-file list single-source: move the secretPatterns array out of gates.js into the pure helper module _shared.js, have gates.js import it for the security gate, and have _agents.js derive the forbidden-files prose from the same array so the prompt text and the gate globs can never drift (D-01, D-04). Pure dedup refactor — no behavior change.</objective>

<context>@lib/_shared.js (pure import-nothing helper module; add secretPatterns + forbiddenFilesProse here), @lib/gates.js (secretPatterns array lines 22-47 to move out; securityGate consumes it), @lib/_agents.js (CODEBASE_MAPPER_PROMPT line 283 and CODEBASE_QUERY_PROMPT line 319 carry the verbatim prose), @test/gates.test.mjs (line 8 imports secretPatterns from ../lib/gates.js — must be updated), @test/_shared.test.mjs (style reference for pure helper tests).</context>

<tasks>
  <task type="auto">
    <name>Task 1: Move secretPatterns to _shared.js and rewire gates.js + test import (tracer, D-01)</name>
    <files>lib/_shared.js, lib/gates.js, test/gates.test.mjs</files>
    <read_first>lib/_shared.js, lib/gates.js, test/gates.test.mjs</read_first>
    <action>In lib/_shared.js, add an exported const `secretPatterns` holding the exact 26-item array currently in lib/gates.js lines 22-47 (".env", ".env.*", "credentials.*", "secrets.*", "*secret*", "*credential*", "*.pem", "*.key", "*.p12", "*.pfx", "*.jks", "id_rsa*", "id_ed25519*", "id_dsa*", ".npmrc", ".pypirc", ".netrc", "config/secrets/*", ".secrets/*", "secrets/", "*.keystore", "*.truststore", "serviceAccountKey.json", "*-credentials.json"). Place it in a clearly-marked section (e.g. after the decision helpers, before the misc section) with a comment noting it is the single source for the security gate and the mapper/query forbidden-files prose. In lib/gates.js, delete the secretPatterns array (lines 22-47) and add `import { secretPatterns } from "./_shared.js";` at the top after the existing `import path from "node:path";`. Do NOT re-export secretPatterns from gates.js — _shared.js is the sole source. In test/gates.test.mjs, change the import on line 8 so secretPatterns comes from "../lib/_shared.js" instead of "../lib/gates.js" (keep the other imports from gates.js).</action>
    <verify>Run `npm test` and confirm the security-gate suite (including "secretPatterns carries the exact credential globs (D-01)") passes.</verify>
    <acceptance_criteria>
      - grep "export const secretPatterns" lib/_shared.js exits 0
      - grep "export const secretPatterns" lib/gates.js exits 1
      - grep "import { secretPatterns } from \"./_shared.js\"" lib/gates.js exits 0
      - grep "secretPatterns" test/gates.test.mjs shows it imported from "../lib/_shared.js"
      - `npm test` exits 0
    </acceptance_criteria>
    <done>secretPatterns lives only in _shared.js; gates.js imports it; the security-gate tests pass against the moved array.</done>
  </task>

  <task type="auto">
    <name>Task 2: Add forbiddenFilesProse() helper and derive the mapper/query prose from the array (D-04)</name>
    <files>lib/_shared.js, lib/_agents.js</files>
    <read_first>lib/_shared.js, lib/_agents.js</read_first>
    <action>In lib/_shared.js, add an exported function `forbiddenFilesProse()` that returns `secretPatterns.join(", ")`. In lib/_agents.js, add `import { forbiddenFilesProse } from "./_shared.js";` at the top (it currently imports nothing). Replace the verbatim forbidden-files list in CODEBASE_MAPPER_PROMPT (line 283) and CODEBASE_QUERY_PROMPT (line 319) with a template-literal interpolation: the line becomes `${forbiddenFilesProse()}. Your output gets committed — leaked secrets = security incident.` for the MAPPER prompt and `${forbiddenFilesProse()}. Your output gets returned to the user — leaked secrets = security incident.` for the QUERY prompt. Keep the "FORBIDDEN FILES — never read or quote contents from (note EXISTENCE only if you find them):" prefix line unchanged. Ensure the prompts remain template literals (backticks) so the interpolation evaluates.</action>
    <verify>Run `npm test` and confirm test/tools.test.mjs "CODEBASE_QUERY_PROMPT carries the FORBIDDEN FILES rule" still passes.</verify>
    <acceptance_criteria>
      - grep "export function forbiddenFilesProse" lib/_shared.js exits 0
      - grep "import { forbiddenFilesProse } from \"./_shared.js\"" lib/_agents.js exits 0
      - grep "forbiddenFilesProse()" lib/_agents.js matches at least 2 lines (both prompts)
      - grep -c "\.env, \.env\., credentials\." lib/_agents.js equals 0 (no verbatim list remains)
      - `npm test` exits 0
    </acceptance_criteria>
    <done>Both prompts render their forbidden-files prose from the canonical array via forbiddenFilesProse(); no verbatim list remains in _agents.js.</done>
  </task>

  <task type="auto">
    <name>Task 3: Add regression tests proving prose derives from the array and gates.js no longer owns secretPatterns</name>
    <files>test/dedup.test.mjs</files>
    <read_first>test/_shared.test.mjs, test/tools.test.mjs</read_first>
    <action>Create test/dedup.test.mjs using node:test + node:assert/strict, mirroring the style of test/_shared.test.mjs. Import `secretPatterns` and `forbiddenFilesProse` from "../lib/_shared.js" and `CODEBASE_MAPPER_PROMPT`, `CODEBASE_QUERY_PROMPT` from "../lib/_agents.js". Add tests: (1) `forbiddenFilesProse()` equals `secretPatterns.join(", ")`; (2) CODEBASE_MAPPER_PROMPT includes `secretPatterns.join(", ")`; (3) CODEBASE_QUERY_PROMPT includes `secretPatterns.join(", ")`; (4) a static source check that reads lib/gates.js via node:fs and asserts it does NOT contain the string "export const secretPatterns" (proving single-source).</action>
    <verify>Run `npm test` and confirm the new test/dedup.test.mjs suite runs and passes.</verify>
    <acceptance_criteria>
      - grep "forbiddenFilesProse" test/dedup.test.mjs exits 0
      - grep "CODEBASE_MAPPER_PROMPT" test/dedup.test.mjs exits 0
      - grep "export const secretPatterns" test/dedup.test.mjs exits 0 (the static negative assertion)
      - `npm test` exits 0 and reports the dedup suite passing
    </acceptance_criteria>
    <done>test/dedup.test.mjs pins the single-source invariant and the prose-derivation behaviour; the full suite is green.</done>
  </task>
</tasks>

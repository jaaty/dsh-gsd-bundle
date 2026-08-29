---
phase: 25-license-and-attribution
plan: 01
type: execute
wave: 1
depends_on: []
files_modified: ["LICENSE", "NOTICE", "README.md", "package.json", "test/license.test.mjs"]
autonomous: true
requirements: ["PUB-01", "PUB-02"]
gap_closure: false
user_setup: []
must_haves:
  truths:
    - "GitHub detects the MIT license: a LICENSE file exists at the repo root whose content is the canonical MIT text with the copyright line 'Copyright (c) 2026 jaaty'."
    - "The README no longer references gsd-core-reference.md and instead links the opengsd-core repo at https://github.com/open-gsd/gsd-core."
    - "A NOTICE file at the repo root credits opengsd-core (MIT) with the upstream copyright line 'Copyright (c) 2026 Open GSD'."
  artifacts:
    - path: "LICENSE"
      provides: "Canonical MIT license text with the bundle's own copyright line (D-01), satisfying PUB-01."
      min_lines: 20
      exports: []
    - path: "NOTICE"
      provides: "Attribution to opengsd-core (MIT) with its copyright/license notice (D-02/D-03), satisfying PUB-02."
      min_lines: 5
      exports: []
    - path: "test/license.test.mjs"
      provides: "node --test verification asserting LICENSE/NOTICE existence and content, package.json license/files consistency, and the README reference fix."
      min_lines: 40
      exports: []
  key_links:
    - from: "package.json"
      to: "NOTICE"
      via: "the files array includes the string NOTICE so the attribution ships in the published npm tarball (npm auto-includes LICENSE but not NOTICE)"
      pattern: '"NOTICE"'
    - from: "README.md"
      to: "https://github.com/open-gsd/gsd-core"
      via: "the line that previously referenced gsd-core-reference.md now links the opengsd-core repo (D-04)"
      pattern: "github.com/open-gsd/gsd-core"
---
<objective>Deliver PUB-01 and PUB-02: add an MIT LICENSE file, add a NOTICE file crediting opengsd-core, fix the broken gsd-core-reference.md reference in the README, and add a node --test verification suite that proves all of it. This is a pure documentation/metadata phase — no runtime or dev dependency is introduced.</objective>
<context>@.planning/phases/GSD-25-license-and-attribution/GSD-25-license-and-attribution-CONTEXT.md
@.planning/phases/GSD-25-license-and-attribution/GSD-25-license-and-attribution-RESEARCH.md
@package.json
@README.md
@test/mount.test.mjs</context>
<tasks>
  <task type="auto">
    <name>Task 1: Add the MIT LICENSE file (tracer — PUB-01, D-01, D-05)</name>
    <files>LICENSE, test/license.test.mjs</files>
    <read_first>package.json, test/mount.test.mjs</read_first>
    <action>Create a LICENSE file at the repo root containing the canonical MIT license text. The first two lines must be exactly "MIT License" then "Copyright (c) 2026 jaaty" (per D-01). Reproduce the full standard MIT body verbatim: the permission grant paragraph, the condition paragraph ("The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software."), and the warranty disclaimer paragraph. Do not alter the license text beyond the copyright line. Then create test/license.test.mjs using node:test and node:assert/strict (matching the existing suite style in test/mount.test.mjs). Resolve the repo root robustly as new URL("../../", import.meta.url) from the test file. Add a test that reads LICENSE and asserts it exists, its content includes the string "MIT License" and the string "Copyright (c) 2026 jaaty". Add a second test that reads package.json and asserts packageJson.license === "MIT" (per D-05, verify-only — do not change the license field).</action>
    <verify>node --test test/license.test.mjs</verify>
    <acceptance_criteria>
      - LICENSE exists at repo root and its first line is "MIT License"
      - LICENSE contains "Copyright (c) 2026 jaaty"
      - test/license.test.mjs passes: node --test test/license.test.mjs exits 0
      - package.json "license" field is unchanged and still "MIT"
    </acceptance_criteria>
    <done>LICENSE exists with the correct copyright line and the first two verification tests pass.</done>
  </task>
  <task type="auto">
    <name>Task 2: Add the NOTICE file and ship it in the npm package (PUB-02, D-02, D-03)</name>
    <files>NOTICE, package.json, test/license.test.mjs</files>
    <read_first>LICENSE, package.json</read_first>
    <action>Create a NOTICE file at the repo root crediting opengsd-core. It must state that this bundle is a faithful reimplementation of opengsd-core (Git Ship Done), that opengsd-core is distributed under the MIT License, and reproduce the upstream copyright line exactly as "Copyright (c) 2026 Open GSD" (per D-02/D-03 — do NOT use "jaaty" for the upstream line). Include the upstream project URL https://github.com/open-gsd/gsd-core and note that the role prompts are condensed faithfully from opengsd's agents/*.md. Reproduce the full MIT license text under the upstream copyright line. Then edit package.json: add the string "NOTICE" to the files array (currently ["lib/*.js", "cordis.patch.yml", "README.md"]) so the NOTICE ships in the published npm tarball (npm auto-includes LICENSE but not NOTICE). Do not change the "license" field. Extend test/license.test.mjs with a test asserting NOTICE exists and its content includes "opengsd-core" and "Copyright (c) 2026 Open GSD", and a test asserting packageJson.files includes the string "NOTICE".</action>
    <verify>node --test test/license.test.mjs</verify>
    <acceptance_criteria>
      - NOTICE exists at repo root and contains "opengsd-core" and "Copyright (c) 2026 Open GSD"
      - package.json files array includes "NOTICE"
      - package.json "license" field is still "MIT"
      - node --test test/license.test.mjs exits 0
    </acceptance_criteria>
    <done>NOTICE exists with correct upstream attribution and is added to the package files array; the extended test suite passes.</done>
  </task>
  <task type="auto">
    <name>Task 3: Fix the broken gsd-core-reference.md reference in the README (PUB-02, D-04)</name>
    <files>README.md, test/license.test.mjs</files>
    <read_first>README.md</read_first>
    <action>Edit README.md line 193. The current line reads: "The reference used to build this is in `gsd-core-reference.md` (compiled from the opengsd-core `next` branch)." Remove the reference to gsd-core-reference.md entirely and replace it with a link to the opengsd-core repo. Per D-04, do NOT regenerate or commit gsd-core-reference.md. Use an inline markdown link to https://github.com/open-gsd/gsd-core (matching the existing inline links at README lines 3 and 180). Keep the existing prose attribution at lines 3 and 180 unchanged. Extend test/license.test.mjs with a test that reads README.md and asserts it does NOT contain the string "gsd-core-reference.md" and that it DOES contain the string "https://github.com/open-gsd/gsd-core".</action>
    <verify>node --test test/license.test.mjs</verify>
    <acceptance_criteria>
      - README.md does not contain "gsd-core-reference.md"
      - README.md contains "https://github.com/open-gsd/gsd-core"
      - gsd-core-reference.md is not created or committed (git status shows no such file)
      - node --test test/license.test.mjs exits 0
    </acceptance_criteria>
    <done>The broken reference is replaced with a live repo link, the README attribution is intact, and the full test suite passes.</done>
  </task>
</tasks>

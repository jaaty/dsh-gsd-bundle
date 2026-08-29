---
phase: GSD-30-publishable-package
plan: 03
type: execute
wave: 1
depends_on: []
files_modified: ["README.md"]
autonomous: true
requirements: ["REL-01"]
gap_closure: true
user_setup: []
must_haves:
  truths:
    - "README.md does not contain the literal string 'gsd-core-reference.md' anywhere, so test/license.test.mjs (assert !readme.includes('gsd-core-reference.md')) passes"
    - "README.md still links https://github.com/open-gsd/gsd-core (unchanged by the fix), so the opengsd-core attribution assertion still passes"
    - "npm test (node --test test/*.test.mjs) passes 406/406 with no failures"
  artifacts:
    - path: "README.md"
      provides: "Publish-ready attribution text whose v2.1 release-note bullet no longer references the removed gsd-core-reference.md filename while still describing the license/attribution work"
      min_lines: 200
      exports: []
  key_links:
    - from: "README.md"
      to: "test/license.test.mjs"
      via: "the license/attribution test asserts README does not include the literal broken-filename string"
      pattern: "gsd-core-reference"
---
<objective>
Close the sole gap left by phase-30 verification: the repository is publish-ready in every manifest respect, but `npm test` is not green because `test/license.test.mjs` (L70) asserts README does not include the literal string `gsd-core-reference.md`, and README line 19's v2.1 release-note bullet still echoes that filename. This plan is a minimal editorial README fix — reword the offending bullet so the literal filename string no longer appears while the attribution content and the opengsd-core link are preserved — so that `npm test` runs 406/406 and the prepublishOnly / SHIP-01 / REL-02 gate is unblocked. It is the ONLY change required to reach the phase's "publish-ready" seal. No manifest, lockfile, CHANGELOG, lib, or test changes are required (those already satisfy D-01..D-10); this plan is metadata-scope-neutral and touches README.md only.
</objective>
<context>
@.planning/phases/GSD-30-publishable-package/GSD-30-publishable-package-VERIFICATION.md — the gap analysis: 7/8 truths passed; the single failed truth (regression seal) is that npm test does not pass because test/license.test.mjs L70 fails at base commit f68f7c3.
@test/license.test.mjs — read the test at lines 66-76 ("README no longer references gsd-core-reference.md and links the opengsd-core repo (D-04)") to see the exact assertions to satisfy.
@README.md — read the v2.1 release-note section (around line 15-25) containing the bullet that must be reworded; line 218 already links opengsd-core and must be left intact.
</context>
<tasks>
  <task type="auto">
    <name>Task 1: Reword the README v2.1 release-note bullet so the literal broken-filename string no longer appears</name>
    <files>README.md</files>
    <read_first>test/license.test.mjs, README.md</read_first>
    <action>In README.md, locate the v2.1 release-note bullet under the section "### v2.1 release note — public-release-readiness" that currently contains the literal word/phrase "gsd-core-reference.md" (line ~19: "and fixed the broken `gsd-core-reference.md` reference in the README."). Reword this bullet so the exact string "gsd-core-reference.md" no longer appears anywhere in the file, while keeping the bullet factually accurate about the v2.1 license-and-attribution work. A reword such as removing the removed-filename from the sentence and describing it as "the broken opengsd-core reference in the README" (or equivalent wording that omits the literal filename) satisfies the goal. Do NOT remove the opengsd-core attribution content or the project link https://github.com/open-gsd/gsd-core — the link at README line 218 and line 3 must remain untouched. Ensure the reword keeps the same bullet list style and markdown structure of the surrounding v2.1 release note. This editorial change is the gap fix that unlocks npm test green.</action>
    <verify>grep -n "gsd-core-reference" README.md must return NO matches (exit code 1); node --test test/license.test.mjs must pass with no failures.</verify>
    <acceptance_criteria>
      - `grep -c "gsd-core-reference" README.md` exits non-zero / returns 0 matches (literal string removed)
      - Node invocation `node --test test/license.test.mjs` reports pass for the "README no longer references gsd-core-reference.md" test
      - README still contains "https://github.com/open-gsd/gsd-core" (grep exit 0)
    </acceptance_criteria>
    <done>'README.md' no longer contains the literal string "gsd-core-reference.md", the v2.1 bullet still accurately describes the license/attribution work, the opengsd-core repo link is intact, and test/license.test.mjs passes.</done>
  </task>
  <task type="auto">
    <name>Task 2: Full regression — npm test passes 406/406 with no scope creep</name>
    <files>README.md</files>
    <read_first>README.md</read_first>
    <action>After the Task 1 edit, run the full test suite via the package's test script and confirm every test passes. Invoke `npm test` (which runs `node --test test/*.test.mjs`) and confirm the summary reports all tests passing (406/406, zero failures). Also run `git status --short` and `git diff --stat` to confirm ONLY README.md changed in this plan — lib/, test/, test/**, package.json, package-lock.json, and CHANGELOG.md must be untouched (the manifest/lockfile/changelog edits from plans 01/02 are already committed, so the working tree should show README.md as the only additional change under this plan). If the working tree shows changes to any manifest/lockfile/lib/test file, verify they were introduced by plans 01/02 (already committed) and not by this plan; do not modify them here.</action>
    <verify>npm test must print a passing summary with no failed tests; `git diff --stat -- lib test package.json package-lock.json CHANGELOG.md` for the README-fix working change must be empty or show no uncommitted edits to those paths.</verify>
    <acceptance_criteria>
      - `npm test` exit code 0 with summary reporting 0 failures (406 passing)
      - Uncommitted changes are limited to README.md (git diff --name-only shows only README.md among this plan's changes)
    </acceptance_criteria>
    <done>The full suite passes 406/406 via npm test, and the only working-tree change attributable to this plan is README.md, closing the regression-seal gap.</done>
  </task>
</tasks>

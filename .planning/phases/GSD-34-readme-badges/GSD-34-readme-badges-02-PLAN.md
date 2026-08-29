---
phase: GSD-34-readme-badges
plan: GSD-34-readme-badges-02
type: execute
wave: 2
depends_on: ["GSD-34-readme-badges-01"]
files_modified: ["test/readme-badges.test.mjs"]
autonomous: true
requirements: ["REL-05"]
gap_closure: false
user_setup: []
must_haves:
  truths:
    - "A structural test file test/readme-badges.test.mjs exists and passes via `npm test`, asserting the CI-status, license, and npm-version badge image URLs are present in README.md and well-formed (D-06)."
    - "The test reflects the exact locked badges: it asserts the CI badge points at the whole workflow on branch main (D-02), the license badge image is the shields.io github/license URL (D-04), and the npm badge image is pinned to @2.2.0 (D-03) — not the dynamic unpinned form."
    - "The test mirrors the repo's existing structural-test discipline (node:test with node:assert/strict, README read via fs, one test per badge) like test/repo-config.test.mjs."
  artifacts:
    - path: "test/readme-badges.test.mjs"
      provides: "Structural test asserting the three badge image URLs are present in README.md and well-formed (D-06)"
      min_lines: 45
      exports: []
  key_links:
    - from: "test/readme-badges.test.mjs"
      to: "README.md"
      via: "reads README.md from ROOT and asserts the badge image URL strings and their link destinations"
      pattern: "readFile.*README\\.md"
---
<objective>
Add the structural test required by D-06: a small node:test file that asserts the three badge image URLs are present in README.md and well-formed, so REL-05's badge requirements stay covered by the test suite. This plan depends on plan 01 (which fixes the README badge row) and touches only test/readme-badges.test.mjs.
</objective>

<context>
@README.md
@test/repo-config.test.mjs
@.planning/phases/GSD-34-readme-badges/GSD-34-readme-badges-CONTEXT.md
</context>

<tasks>
  <task type="auto">
    <name>Task 1 (tracer): Create test/readme-badges.test.mjs with a CI-badge structural test</name>
    <files>test/readme-badges.test.mjs</files>
    <read_first>test/repo-config.test.mjs,README.md</read_first>
    <action>
      Create the new structural test file test/readme-badges.test.mjs. Mirror the discipline of test/repo-config.test.mjs: use `import { test } from "node:test"`, `import assert from "node:assert/strict"`, and read README content with `const ROOT = new URL("../", import.meta.url).pathname;` + `fsPromises.readFile(path.join(ROOT, "README.md"), "utf8")`.

      This tracer task adds ONE passing test:
      - `test("CI badge is present and links to the CI workflow (D-02)")`: assert the README content includes the substring `https://github.com/jaaty/dsh-gsd-bundle/actions/workflows/ci.yml/badge?branch=main` (the CI badge image URL targeting the whole CI workflow on main), AND includes the linked destination `https://github.com/jaaty/dsh-gsd-bundle/actions/workflows/ci.yml`. Use string `.includes()` assertions on the README text.

      Keep the assertions on the raw README markdown text (structural), not on parsed HTML. Do not shell out. Run the single test with `node --test test/readme-badges.test.mjs` and confirm it passes.
    </action>
    <verify>node --test test/readme-badges.test.mjs</verify>
    <acceptance_criteria>
      - test/readme-badges.test.mjs exists and contains `github.com/jaaty/dsh-gsd-bundle/actions/workflows/ci.yml/badge?branch=main` (D-02)
      - `node --test test/readme-badges.test.mjs` exits 0 with the CI-badge test passing
      - The test reads README.md from ROOT (no shell-out, matches repo structural-test discipline) (D-06)
    </acceptance_criteria>
    <done>
      The tracer test file exists and the CI-badge assertion passes under node:test.
    </done>
  </task>

  <task type="auto">
    <name>Task 2: Extend the structural test to all three badges with link-destination checks (D-06)</name>
    <files>test/readme-badges.test.mjs</files>
    <read_first>test/readme-badges.test.mjs</read_first>
    <action>
      Extend the existing test file to cover all three badges with presence AND well-formed link-destination assertions (D-06). Add two more named tests and strengthen the CI one so the three badges' image URLs and their click targets are all asserted:

      - `test("license badge is present and links to the LICENSE file (D-04)")`: assert README includes the license image URL `https://img.shields.io/github/license/jaaty/dsh-gsd-bundle?style=flat-square` AND the destination `https://github.com/jaaty/dsh-gsd-bundle/blob/main/LICENSE`.
      - `test("npm-version badge is present, statically pinned to v2.2.0, and links to the npm page (D-03)")`: assert README includes the STATIC pinned image URL `https://img.shields.io/npm/v/@dsh-gsd/bundle@2.2.0?style=flat-square` AND the destination `https://www.npmjs.com/package/@dsh-gsd/bundle`. Additionally assert the README does NOT contain the dynamic unpinned form `https://img.shields.io/npm/v/@dsh-gsd/bundle?` with a trailing `?` after the package name (i.e. assert the exact pinned substring `@2.2.0?style` appears, guarding D-03). Use `assert.ok(!readme.includes("https://img.shields.io/npm/v/@dsh-gsd/bundle?style"))` to lock out the dynamic badge.
      - Strengthen the tracer CI test to also assert the exact badge image substring `actions/workflows/ci.yml/badge?branch=main` with the branch query (already covered).

      Verify the full suite passes: `node --test test/readme-badges.test.mjs` and then `npm test` (which globs test/*.test.mjs). No other file may be touched.
    </action>
    <verify>npm test</verify>
    <acceptance_criteria>
      - test/readme-badges.test.mjs contains the license image URL `img.shields.io/github/license/jaaty/dsh-gsd-bundle` and the LICENSE link (D-04)
      - test/readme-badges.test.mjs contains the pinned npm image URL `img.shields.io/npm/v/@dsh-gsd/bundle@2.2.0` and the npm-page link, and rejects the dynamic `npm/v/@dsh-gsd/bundle?` form (D-03)
      - `node --test test/readme-badges.test.mjs` exits 0 with all three badge tests passing (D-06)
      - `npm test` exits 0 (no regression in the existing structural test suite)
    </acceptance_criteria>
    <done>
      The structural test asserts all three badge image URLs and their destinations and the static npm pin; `npm test` passes.
    </done>
  </task>
</tasks>

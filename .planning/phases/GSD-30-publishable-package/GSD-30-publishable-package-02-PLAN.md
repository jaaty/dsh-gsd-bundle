---
phase: 30-publishable-package
plan: 02
type: execute
wave: 1
depends_on: []
files_modified:
  - CHANGELOG.md
autonomous: true
requirements: ["REL-01"]
user_setup: []
must_haves:
  truths:
    - "CHANGELOG.md has a [2.2.0] release section positioned between [Unreleased] and [2.1.0], newest-at-top, matching the Keep a Changelog ordering (D-03)"
    - "The [2.2.0] section follows the existing entry structure (### Added with bold milestone plus phase bullets)"
    - "A final validation proves every edited manifest/lockfile is valid JSON, no runtime scope crept in (dependencies {} , no build/prepare/prepack), and npm test still passes"
  artifacts:
    - path: "CHANGELOG.md"
      provides: "Keep-a-Changelog [2.2.0] entry documenting the publishable-package milestone."
      min_lines: 65
      exports: ["[2.2.0] section"]
  key_links:
    - from: "CHANGELOG.md"
      to: "package.json"
      via: "declared release version [2.2.0] equals the package.json version bumped in plan 01 (D-01/D-03)"
      pattern: '## \[2\.2\.0\]'
---
<objective>
Document the upcoming 2.2.0 release in the changelog (D-03) and run the final regression validation that seals REL-01: all edited JSON parses, no runtime scope crept in, the files whitelist is coherent, and the test suite stays green. This plan edits only CHANGELOG.md (disjoint from plan 01's package.json/package-lock.json), so it runs in parallel on wave 1.
</objective>
<context>
@CHANGELOG.md — Keep a Changelog + SemVer header; currently has empty [Unreleased] (L8) then [2.1.0] (L10) then [2.0.0]. New [2.2.0] goes between [Unreleased] and [2.1.0]. Existing entries use "### Added" with "- **phase-name** (PR #N): ..." bullets.
@CONTEXT.md — D-03 (add [2.2.0] entry, Keep a Changelog), "Claude's Discretion" delegates the exact body wording following the existing entry structure.
</context>
<tasks>
  <task type="auto">
    <name>Task 1: Add the [2.2.0] changelog entry documenting publishable-package</name>
    <files>CHANGELOG.md</files>
    <read_first>CHANGELOG.md</read_first>
    <action>Insert a new "## [2.2.0] - 2026-08-29" section between the existing "## [Unreleased]" block (ends L8) and "## [2.1.0] - 2026-08-29" (currently L10), so newest is at top per Keep a Changelog (D-03). Model the body on the [2.1.0] structure: a "### Added" heading, then a bold milestone bullet ("- **Milestone `public-launch`** — ...") followed by a "-- **publishable-package** (PR #NN): ..." bullet. Body wording and the PR number are executor discretion ("Claude's Discretion") but must describe the publishable-package phase: version bump to 2.2.0, added npm metadata fields (repository, homepage, bugs, keywords, engines, author), and expanded files whitelist to ship README-linked docs. Do NOT touch any existing section. Leave [Unreleased] block empty.</action>
    <verify>grep -n '^## \[' CHANGELOG.md | head -5</verify>
    <acceptance_criteria>
      - grep -c '^## \[2\.2\.0\]' CHANGELOG.md equals 1.
      - The [2.2.0] line appears above (before) the [2.1.0] line in the file (newest-at-top): grep -n output shows [2.2.0] line number < [2.1.0] line number.
      - The [2.2.0] section contains a "### Added" heading (grep -c '### Added' within the section) and at least one "- **publishable-package**" bullet.
      - The pre-existing [2.1.0] and [2.0.0] sections remain unchanged (git diff shows only the insertion region).
    </acceptance_criteria>
    <done>A [2.2.0] section with a ### Added heading and a publishable-package bullet sits between [Unreleased] and [2.1.0], and no existing entry was modified.</done>
  </task>

  <task type="auto">
    <name>Task 2: Run the REL-01 final regression validation</name>
    <files>CHANGELOG.md</files>
    <read_first>package.json, package-lock.json, CHANGELOG.md</read_first>
    <action>Perform the sealed regression checks that close out REL-01 (read-only; no file edits). Do NOT run npm install or npm publish — npm ci / pack are deferred and the EROFS npm-cache sandbox may block writes; prefer the read-only node -e parse guards below. Execute, in order: (1) JSON.parse package.json and package-lock.json to confirm syntax validity; (2) assert package.json "dependencies" is still {} and there is no prepare/build/prepack script; (3) assert version field in package.json and both lockfile spots are "2.2.0"; (4) assert files whitelist contains the four README-linked docs and does not contain LICENSE/.github/.planning; (5) confirm scripts.test and scripts.prepublishOnly both remain "node --test test/*.test.mjs"; (6) run npm test and confirm it exits 0. Report each check's pass/fail in the SUMMARY.</action>
    <verify>npm test</verify>
    <acceptance_criteria>
      - npm test exits 0 (exit code 0) with all test files passing.
      - node -e 'JSON.parse(require("fs").readFileSync("package.json","utf8"));JSON.parse(require("fs").readFileSync("package-lock.json","utf8"));console.log("json-ok")' prints "json-ok".
      - node -e 'const p=require("./package.json");if(p.dependencies&&Object.keys(p.dependencies).length!==0)process.exit(1);if(p.scripts.prepare||p.scripts.build||p.scripts.prepack)process.exit(2);if(p.scripts.test!=="node --test test/*.test.mjs"||p.scripts.prepublishOnly!=="node --test test/*.test.mjs")process.exit(3);console.log("scope-guard-ok")' prints "scope-guard-ok".
      - git diff --stat lib/ test/ shows no changes (no functional code touched by the phase).
    </acceptance_criteria>
    <done>All six regression checks pass: JSON valid, dependencies unchanged at {}, no build scripts, versions synced, files whitelist coherent, test suite green, and no lib/ or test/ drift. REL-01 is sealed.</done>
  </task>
</tasks>

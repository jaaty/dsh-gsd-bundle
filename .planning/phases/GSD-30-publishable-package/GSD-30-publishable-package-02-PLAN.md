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
    - "A final manifest validation proves every edited JSON (package.json, package-lock.json, CHANGELOG structure) is valid, no runtime scope crept in (dependencies {}, no build/prepare/prepack), and the version/file-whitelist state is synced across the manifests"
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
Document the upcoming 2.2.0 release in the changelog (D-03) and run the final manifest/lockfile/CHANGELOG regression validation that seals the REL-01 state: all edited JSON parses, no runtime scope crept in, the version and files whitelist are synced across manifests, and the changelog ordering is correct. This plan edits only CHANGELOG.md (disjoint from plan 01's package.json/package-lock.json), so it runs in parallel on wave 1. It performs NO full-suite test run: the `npm test` green assertion is deliberately deferred to plan 03 (the gap-closure plan that fixes the README so the suite goes green) and to the phase verifier, because at the base commit the suite is not green (test/license.test.mjs fails until plan 03's README reword lands). Checking `npm test` here would create an impossible forward dependency on an un-landed README fix.
</objective>
<context>
@CHANGELOG.md — Keep a Changelog + SemVer header; currently has empty [Unreleased] (L8) then [2.1.0] (L10) then [2.0.0]. New [2.2.0] goes between [Unreleased] and [2.1.0]. Existing entries use "### Added" with "- **phase-name** (PR #N): ..." bullets.
@package.json — the manifest edited by plan 01 (version bumped to 2.2.0, npm metadata fields, files whitelist); plan 02 only READS it for sync validation.
@package-lock.json — the lockfile edited by plan 01 (version at both spots bumped to 2.2.0); plan 02 only READS it for sync validation.
@CONTEXT.md — D-03 (add [2.2.0] entry, Keep a Changelog), "Claude's Discretion" delegates the exact body wording following the existing entry structure.
</context>
<tasks>
  <task type="auto">
    <name>Task 1: Add the [2.2.0] changelog entry documenting publishable-package</name>
    <files>CHANGELOG.md</files>
    <read_first>CHANGELOG.md</read_first>
    <action>Insert a new "## [2.2.0] - 2026-08-29" section between the existing "## [Unreleased]" block (ends L8) and "## [2.1.0] - 2026-08-29" (currently L10), so newest is at top per Keep a Changelog (D-03). Model the body on the [2.1.0] structure: a "### Added" heading, then a bold milestone bullet ("- **Milestone `public-launch`** — ...") followed by a "-- **publishable-package** (PR #NN): ..." bullet. Body wording and the PR number are executor discretion ("Claude's Discretion") but must describe the publishable-package phase: version bump to 2.2.0, added npm metadata fields (repository, homepage, bugs, keywords, engines, author), and expanded files whitelist to ship README-linked docs. Do NOT touch any existing section. Leave [Unreleased] block empty.</action>
    <verify>node -e 'const t=require("fs").readFileSync("CHANGELOG.md","utf8");const i=t.indexOf("## [2.2.0]");const j=t.indexOf("## [2.1.0]");process.exit((i===-1||j===-1||i>j)?1:0);' && grep -c '^## \[2\.2\.0\]' CHANGELOG.md</verify>
    <acceptance_criteria>
      - grep -c '^## \[2\.2\.0\]' CHANGELOG.md equals 1.
      - The node -e check exits 0, proving the [2.2.0] line appears before (above) the [2.1.0] line (newest-at-top, D-03).
      - The [2.2.0] section contains a "### Added" heading (grep -c '### Added' within the section) and at least one "- **publishable-package**" bullet.
      - The pre-existing [2.1.0] and [2.0.0] sections remain unchanged (git diff shows only the insertion region).
    </acceptance_criteria>
    <done>A [2.2.0] section with a ### Added heading and a publishable-package bullet sits between [Unreleased] and [2.1.0] at the top of the file, verified order-correct by the self-evaluating node probe, and no existing entry was modified.</done>
  </task>

  <task type="auto">
    <name>Task 2: Run the REL-01 manifest/lockfile/CHANGELOG regression validation (read-only)</name>
    <files></files>
    <read_first>package.json, package-lock.json, CHANGELOG.md</read_first>
    <action>Perform the read-only sealed regression checks that validate the manifest/lockfile/changelog state closing out REL-01. No files are modified by this task. Do NOT run npm install, npm publish, npm ci, or pack — those are deferred and the EROFS npm-cache sandbox may block writes; prefer the read-only node -e parse guards below. Do NOT run the full `npm test` suite here: the suite is not green at this point because test/license.test.mjs fails until plan 03 rewrites the README, so a full-suite assert here would reference an un-landed fix. Execute, in order: (1) JSON.parse package.json and package-lock.json to confirm syntax validity; (2) assert package.json "dependencies" is still {} and there is no prepare/build/prepack script; (3) assert the version field in package.json and both lockfile spots are "2.2.0"; (4) assert the files whitelist contains the four README-linked docs and does not contain LICENSE/.github/.planning; (5) confirm scripts.test and scripts.prepublishOnly both remain "node --test test/*.test.mjs"; (6) assert changelog ordering: [2.2.0] appears before [2.1.0] in CHANGELOG.md. Report each check's pass/fail in the SUMMARY. Leave the full-test-suite green assertion to plan 03 and the phase verifier.</action>
    <verify>node -e 'const p=require("./package.json"),l=require("./package-lock.json");JSON.parse(JSON.stringify(p));JSON.parse(JSON.stringify(l));if(p.version!=="2.2.0")process.exit(1);console.log("manifest-ok")'</verify>
    <acceptance_criteria>
      - node -e 'JSON.parse(require("fs").readFileSync("package.json","utf8"));JSON.parse(require("fs").readFileSync("package-lock.json","utf8"));console.log("json-ok")' prints "json-ok".
      - node -e 'const p=require("./package.json");if(p.dependencies&&Object.keys(p.dependencies).length!==0)process.exit(1);if(p.scripts.prepare||p.scripts.build||p.scripts.prepack)process.exit(2);if(p.scripts.test!=="node --test test/*.test.mjs"||p.scripts.prepublishOnly!=="node --test test/*.test.mjs")process.exit(3);console.log("scope-guard-ok")' prints "scope-guard-ok".
      - node -e 'const p=require("./package.json"),l=require("./package-lock.json");if(p.version!=="2.2.0")process.exit(1);console.log("version-ok")' prints "version-ok" and both lockfile version spots equal "2.2.0" (verify with a grep or node probe).
      - node -e 'const t=require("fs").readFileSync("CHANGELOG.md","utf8");const i=t.indexOf("## [2.2.0]");const j=t.indexOf("## [2.1.0]");process.exit((i===-1||j===-1||i>j)?1:0);' exits 0 (changelog newest-at-top ordering).
      - git diff --stat lib/ test/ shows no changes attributable to this plan (no functional code touched by the phase).
    </acceptance_criteria>
    <done>All manifest/lockfile/changelog checks pass: JSON valid, dependencies unchanged at {}, no build scripts, versions synced to 2.2.0, files whitelist coherent, and changelog ordering correct. The full-suite `npm test` green assertion is intentionally not checked here and is owned by plan 03 and the phase verifier.</done>
  </task>
</tasks>

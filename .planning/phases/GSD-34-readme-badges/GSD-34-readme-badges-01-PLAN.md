---
phase: GSD-34-readme-badges
plan: GSD-34-readme-badges-01
type: execute
wave: 1
depends_on: []
files_modified: ["README.md", "test/readme-badges.test.mjs", "VALIDATION.md"]
autonomous: true
requirements: ["REL-05", "REL-02"]
gap_closure: true
user_setup: []
must_haves:
  truths:
    - "On a clean checkout of the committed phase-branch state, the README shows exactly three badges — CI-status, license, npm-version — on a single contiguous markdown line immediately below the `# dsh-gsd-bundle` H1 with no blank line, before the intro paragraph, and no fourth badge exists anywhere (D-01, D-05)."
    - "The committed npm-version badge is statically pinned to the currently-released version carried by package.json `version` (2.2.0), i.e. the URL carries `@2.2.0?style=flat-square` and the structural test asserts that this pin equals the package.json version, so the pin tracks the release at commit time rather than silently going stale (D-03, REL-02). The unpinned dynamic `npm/v/@dsh-gsd/bundle?style` latest form is absent."
    - "The committed `Release status` section marks the `public-launch` v2.2.0 milestone as the latest release with a `### v2.2 release note — public-launch` subsection, while retaining the prior v2.1 and v2.0 notes (D-07, REL-02)."
    - "`npm test` (including `node --test test/readme-badges.test.mjs`) passes on a clean checkout of the committed state, asserting the three badge URLs (CI whole workflow on main, shields license, npm pinned to the package.json version), single-line placement, exactly-three badges, and the v2.2.0 release-status reference (D-06)."
  artifacts:
    - path: "test/readme-badges.test.mjs"
      provides: "Structural test asserting the three badge image URLs are present and well-formed, single-line placement under the H1 (D-05), exactly-three badges / no fourth badge (D-01), the npm-version badge pinned to the package.json version (D-03 currency gate), and the v2.2.0 release-status reference (D-07)"
      min_lines: 80
      exports: []
    - path: "VALIDATION.md"
      provides: "Nyquist validation record capturing the three user-observable truths of this phase (badge row exactly-three and placed under the H1; npm pin matches the currently-released package.json version; Release status marks public-launch v2.2.0 as latest) with the exact verification commands used to confirm each"
      min_lines: 14
      exports: []
  key_links:
    - from: "test/readme-badges.test.mjs"
      to: "README.md"
      via: "reads README.md from ROOT via node:fs/promises resolving ROOT with new URL(\"../\", import.meta.url), and asserts badge URLs, exactly-three count, placement, and release-status text"
      pattern: "new URL\\(\"\\.\\./\", import\\.meta\\.url\\)"
    - from: "test/readme-badges.test.mjs"
      to: "package.json"
      via: "reads package.json `version` from ROOT via node:fs/promises and asserts the README npm-version badge URL carries `@{version}` so the pin tracks the currently-released version (currency gate)"
      pattern: "new URL\\(\"\\.\\./package\\.json\", import\\.meta\\.url\\)"
---
<objective>
Close the three verification gaps for phase 34 (readme-badges) so the committed phase-branch state is self-consistent and passes the structural test on a clean checkout: (1) commit the already-corrected single-line badge row that currently sits uncommitted in the working tree, with its npm-version badge pinned to the currently-released package.json version (the D-03 static mirror of v2.2.0), (2) implement the missing D-07 release-status update naming the public-launch v2.2.0 milestone as the latest release, and (3) extend the structural test to guard single-line placement, exactly-three badges, the package.json-version currency gate, and the v2.2.0 release-status reference, and record the three user-observable truths in VALIDATION.md. Delivers REL-05 (three badges) and the D-07 release-status narrative, whose covering requirement is REL-02 (v2.2.0 is the currently-released/published version the blurb must reference).
</objective>

<context>
@.planning/phases/GSD-34-readme-badges/GSD-34-readme-badges-CONTEXT.md
@.planning/phases/GSD-34-readme-badges/GSD-34-readme-badges-RESEARCH.md
@README.md
@test/readme-badges.test.mjs
@package.json
@CHANGELOG.md
@.github/workflows/ci.yml
</context>

<tasks>
  <task type="auto">
    <name>Task 1 (tracer): Commit the corrected single-line badge row pinned to the currently-released v2.2.0</name>
    <files>README.md</files>
    <read_first>README.md, package.json</read_first>
    <action>
The README.md working tree currently holds the CORRECT badge row that must become the committed state. The verification report found the badge-row change was left UNCOMMITTED while the committed HEAD still carries the old blank-line + separate-line + unpinned form. Close this by ensuring the working tree matches the locked spec and committing it.

First run `git diff README.md` and confirm the working tree carries exactly this form (if not, edit README.md to make it so):
- `# dsh-gsd-bundle` on line 1.
- Line 2 immediately (NO blank line between H1 and this line) is the single contiguous line containing all three clickable badges separated by single spaces, in order:
  1. CI — image `https://github.com/jaaty/dsh-gsd-bundle/actions/workflows/ci.yml/badge?branch=main` linking to `https://github.com/jaaty/dsh-gsd-bundle/actions/workflows/ci.yml` (D-02).
  2. license — image `https://img.shields.io/github/license/jaaty/dsh-gsd-bundle?style=flat-square` linking to `https://github.com/jaaty/dsh-gsd-bundle/blob/main/LICENSE` (D-04).
  3. npm-version — image `https://img.shields.io/npm/v/@dsh-gsd/bundle@2.2.0?style=flat-square` linking to `https://www.npmjs.com/package/@dsh-gsd/bundle` (D-03 static pin of the currently-released version 2.2.0 from package.json, D-04). Confirm the `@2.2.0` in the URL matches `package.json` `version` (currently `2.2.0`); if it does not, correct it to match.
- Exactly one blank line follows the badge row before the intro paragraph.

CRITICAL per D-03: the image URL must carry the `@{version}` pin from package.json (`@2.2.0`). The unpinned dynamic form `img.shields.io/npm/v/@dsh-gsd/bundle?style` must be absent. Do not add any badge beyond the three (D-01); do not add an npm-downloads badge.

Then stage and commit ONLY README.md — do NOT stage .planning/STATE.md in this commit — on branch phase-34 with a conventional-commit message scoped to the badge row, e.g. "docs: add single-line provenance badge row to README".
    </action>
    <verify>
node --test test/readme-badges.test.mjs
    </verify>
    <acceptance_criteria>
      - `git status` shows README.md no longer modified in the working tree (committed). Planning-artefact changes are expected GSD loop workflow and may remain uncommitted — do NOT stage or commit any of `M .planning/STATE.md`, `M .planning/phases/GSD-34-readme-badges/GSD-34-readme-badges-01-PLAN.md`, or `D .planning/phases/GSD-34-readme-badges/GSD-34-readme-badges-02-PLAN.md` in the docs commits.
      - `git show HEAD:README.md | sed -n '1p'` equals `# dsh-gsd-bundle`.
      - `git show HEAD:README.md | sed -n '2p'` is a single line containing BOTH `actions/workflows/ci.yml/badge?branch=main` AND `img.shields.io/npm/v/@dsh-gsd/bundle@2.2.0?style=flat-square`.
      - `git show HEAD:README.md | sed -n '1,3p'` shows no blank line between line 1 (H1) and line 2 (badge row).
      - `git show HEAD:README.md | grep -c "@2.2.0?style"` returns 1.
      - `git show HEAD:README.md | grep -c "img.shields.io/npm/v/@dsh-gsd/bundle?style"` returns 0 (unpinned dynamic form absent).
      - `git show HEAD:README.md | grep -c "npm/dw"` returns 0 (no npm-downloads / fourth badge) (D-01).
      - `git show HEAD --stat | grep -c "README.md"` returns at least 1.
      - `node --test test/readme-badges.test.mjs` passes against the committed tree.
    </acceptance_criteria>
    <done>README.md (badge row) is committed on phase-34: single-line, pinned to the currently-released package.json version @2.2.0, no blank line after H1, no fourth badge, and the existing structural test passes against the committed tree.</done>
  </task>

  <task type="auto">
    <name>Task 2: Update the Release status section for the public-launch v2.2.0 milestone and commit (D-07, REL-02)</name>
    <files>README.md</files>
    <read_first>README.md, CHANGELOG.md</read_first>
    <action>
Implement the missing D-07 release-status narrative, which the verification report confirms is absent (grep for `public-launch|v2.2.0|v2.2` returns nothing). Edit the `## Release status` section (currently opens with a bold line declaring `public-release-readiness` v2.1 as the latest release) so that:

- The section marks the `public-launch` v2.2.0 milestone as the latest released milestone, referencing it as `v2.2.0` (this 34-phase milestone, of which readme-badges is phase 34). Word it at your discretion per D-07, but it must name `public-launch` and `v2.2.0` as the latest release.
- Add a new `### v2.2 release note — public-launch` subsection (using the exact heading text with the em-dash `—`) ABOVE the existing `### v2.1 release note — public-release-readiness` heading, describing ONLY what the public-launch milestone actually shipped (cross-checked against CHANGELOG.md, whose `## [2.2.0]` block documents exactly what public-launch delivered). The v2.2 note must make these explicit, factual points, each of which is CHANGELOG-verifiable:
  1. The bundle's README now carries a single-line **provenance/health badge row** (CI status, MIT license, and an npm-version badge pinned statically to `@2.2.0`) directly under the H1.
  2. **Repo discoverability** — repository topics and homepage are configured so the package is findable on GitHub/npm (cf. CHANGELOG 2.2.0, REL-04).
  3. **README-linked documentation shipped** — the `files` whitelist was expanded to ship `DISTRIBUTION.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, and `CHANGELOG.md` in the npm package (cf. CHANGELOG 2.2.0, REL-01).
  4. **Security + contribution surface** — a `SECURITY.md` and GitHub issue/PR templates were added so the repo is ready for external contributors (cf. REL-03).
  5. The **`@dsh-gsd/bundle` package is released as `v2.2.0`** with full npm metadata (repository, homepage, bugs, keywords, engines, author) (cf. CHANGELOG 2.2.0, REL-01/REL-02).
  Do not invent any other features; cross-check every claim against CHANGELOG.md and omit anything not shipped in public-launch. In particular, do NOT attribute the pre-ship-verify gate to v2.2.0 — that shipped in the v2.1 public-release-readiness milestone (see the v2.1 note).
- RETAIN the existing v2.1 and v2.0 release-note subsections with their content unchanged, keeping them immediately below the new v2.2 note.

Do not change any badge URLs, LICENSE, package.json, or CI workflow in this task. Do not add any TBD / FIXME / placeholder text.

Then stage and commit ONLY README.md (the release-status change) — do NOT stage .planning/STATE.md — on branch phase-34 with a conventional-commit message, e.g. "docs(readme): add public-launch v2.2.0 release note".
    </action>
    <verify>
grep -n "public-launch" README.md && grep -n "v2.2.0" README.md && grep -n "### v2.2 release note" README.md && grep -n "### v2.1 release note" README.md && grep -n "### v2.0 release note" README.md
    </verify>
    <acceptance_criteria>
      - `grep -c "### v2.2 release note — public-launch" README.md` returns 1.
      - `grep -c "public-launch" README.md` returns at least 2.
      - `grep -c "v2.2.0" README.md` returns at least 1.
      - `grep -c "### v2.1 release note" README.md` returns 1 and `grep -c "### v2.0 release note" README.md` returns 1 (prior notes retained).
      - The line number of `### v2.2 release note` is less than the line number of `### v2.1 release note` (v2.2 precedes v2.1).
      - `sed -n '/### v2.2 release note/,/### v2.1 release note/p' README.md | grep -c -i "pre-ship-verify"` returns 0 (gate correctly stays in v2.1).
      - `sed -n '/### v2.2 release note/,/### v2.1 release note/p' README.md | grep -c "SECURITY.md"` returns at least 1 (v2.2 release-note content is CHANGELOG-verifiable and explicit).
      - `git status` shows README.md no longer modified (this task's commit done); the Task 1 badge-row line is unchanged.
      - No TBD / FIXME / placeholder text is added: `grep -ci "TBD\|FIXME" README.md` still returns 0 relative to the pre-task baseline.
    </acceptance_criteria>
    <done>The `Release status` section references public-launch v2.2.0 as the latest release with a `### v2.2 release note — public-launch` subsection, the v2.1/v2.0 notes are retained, and the README release-status change is committed on phase-34.</done>
  </task>

  <task type="auto">
    <name>Task 3: Extend the structural test (placement, exactly-three, version currency gate, release-status) and record the truths in VALIDATION.md, then commit the test + VALIDATION work</name>
    <files>test/readme-badges.test.mjs, VALIDATION.md</files>
    <read_first>test/readme-badges.test.mjs, package.json</read_first>
    <action>
Extend test/readme-badges.test.mjs, mirroring the existing node:test + node:assert/strict + node:fs/promises discipline, and KEEPING the existing `ROOT` resolution exactly as it is — `const ROOT = new URL("../", import.meta.url).pathname;` — so the key_links `new URL("../", import.meta.url)` pattern is preserved. The test file already reads README.md in each test; the new assertions must reuse that read-from-ROOT approach. Add these new tests/assertions WITHOUT removing, weakening, or renaming any existing badge test or the D-03 unpinned-form rejection:

- Placement (D-05): assert the badge row is immediately below `# dsh-gsd-bundle` with no blank line between them, and that all three badges share a single contiguous line. Robust assertions: `readme.includes("# dsh-gsd-bundle\n[![CI]")`, `!readme.includes("# dsh-gsd-bundle\n\n")`, and that the first line after `# dsh-gsd-bundle\n` (via `readme.split("# dsh-gsd-bundle\n")[1].split("\n")[0]`) contains both the CI image URL and the LICENSE link.
- Exactly three badges / no fourth (D-01): assert the badge-row line contains exactly three badge images — `const badgeLine = readme.split("# dsh-gsd-bundle\n")[1].split("\n")[0]; (badgeLine.match(/\[!\[/g) ?? []).length === 3` — and assert NO npm-downloads badge exists anywhere, e.g. `!readme.includes("img.shields.io/npm/dw")`.
- Version currency gate (D-03 currency + REL-02): read `package.json` from ROOT (`new URL("../package.json", import.meta.url)`, parse JSON), take its `version` field, and assert the README npm badge URL carries that exact version — e.g. `readme.includes("img.shields.io/npm/v/@dsh-gsd/bundle@" + pkg.version + "?style=flat-square")`. This makes the static pin track the currently-released package.json version at commit time: if a future release bumps package.json, this test fails until the README pin is updated, so the pin never silently goes stale.
- Release status (D-07): assert `readme.includes("public-launch")`, `readme.includes("v2.2.0")`, and `readme.includes("### v2.2 release note — public-launch")` (the exact em-dash heading).

Then write a new file `VALIDATION.md` at the repo root capturing, for each of the three user-observable truths of this phase, the exact verification command(s) used and the observed outcome:
1. The README badge row is exactly-three badges, single contiguous line immediately below the H1 with no blank line.
2. The npm-version badge pin equals the currently-released package.json `version` (2.2.0), and the unpinned dynamic form is absent.
3. The `Release status` section marks `public-launch` v2.2.0 as the latest release with the `### v2.2 release note — public-launch` subsection alongside the retained v2.1/v2.0 notes.
For each truth, list the command(s) that prove it (e.g. `node --test test/readme-badges.test.mjs`, the grep checks from the acceptance criteria); confirm each reported outcome was actually observed when run. Do not fabricate outcomes.

Then, in a SINGLE commit on phase-34, commit BOTH files holding completed work: test/readme-badges.test.mjs and VALIDATION.md. Do NOT stage README.md (it was already committed in Tasks 1 and 2) and do NOT stage .planning/STATE.md. Conventional-commit message e.g. "test(readme): assert badge placement, exactly-three, version currency, release status; add VALIDATION.md".
    </action>
    <verify>
node --test test/readme-badges.test.mjs && test -s VALIDATION.md
    </verify>
    <acceptance_criteria>
      - `node --test test/readme-badges.test.mjs` passes with the extended suite (7 or more tests passing: the existing 4 plus placement, exactly-three, version-currency, and release-status).
      - `grep -c "public-launch" test/readme-badges.test.mjs` returns at least 1 (D-07 guarded).
      - `grep -c "v2.2.0" test/readme-badges.test.mjs` returns at least 1 (D-07 guarded).
      - The test asserts single-line placement: `grep -c 'readme.includes("# dsh-gsd-bundle\\n\[!\[CI\])' test/readme-badges.test.mjs` returns at least 1, and the file contains a negative blank-line assertion (`!readme.includes("# dsh-gsd-bundle\\n\\n")`).
      - The test asserts exactly three badges via a count on the badge row: `grep -c "match(/\[!\[/g)" test/readme-badges.test.mjs` returns at least 1, and the file contains `"img.shields.io/npm/dw"` in a negative assertion.
      - The test reads package.json version for the currency gate: grep `package.json` in test/readme-badges.test.mjs returns at least 1 match, and the file contains a `pkg.version` used in an `includes(...@` + version check.
      - The file must preserve `const ROOT = new URL("../", import.meta.url).pathname;` (key_links pattern).
      - `test -s VALIDATION.md` true and `wc -l VALIDATION.md` reports at least 14 lines.
      - `grep -c "node --test test/readme-badges.test.mjs" VALIDATION.md` returns at least 1, and VALIDATION.md contains the three truth labels (`badge`, `npm`, `Release status`/`public-launch`).
      - `git status` shows test/readme-badges.test.mjs and VALIDATION.md no longer modified (committed); `git log --oneline -4` shows the Task 1 badge-row commit, the Task 2 release-status commit, and this Task 3 commit.
      - `git diff HEAD --stat` shows no uncommitted changes to README.md, test/readme-badges.test.mjs, or VALIDATION.md.
    </acceptance_criteria>
    <done>The structural test guards D-05 placement, exactly-three badges (D-01), the package.json-version currency gate (D-03/REL-02), and D-07 release-status; VALIDATION.md records the three user-observable truths; and the test + VALIDATION.md are committed on phase-34 with no uncommitted docs changes.</done>
  </task>
</tasks>

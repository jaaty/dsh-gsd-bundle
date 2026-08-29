---
phase: 26-repo-hygiene
plan: 03
type: execute
wave: 2
depends_on: ["GSD-26-repo-hygiene-01", "GSD-26-repo-hygiene-02"]
files_modified: ["README.md", "test/repo-hygiene.test.mjs", ".planning/phases/GSD-26-repo-hygiene/VALIDATION.md"]
autonomous: true
requirements: ["PUB-03"]
gap_closure: false
user_setup: []
must_haves:
  truths:
    - "README.md links to CHANGELOG.md, CONTRIBUTING.md, and CODE_OF_CONDUCT.md."
    - "README.md's .planning/ artefacts section documents the curate decision: durable artefacts are tracked, volatile churn is gitignored."
    - "test/repo-hygiene.test.mjs passes (node --test exit 0) and asserts the three repo-root files exist, the README links them, the README documents the curate decision, and the volatile .planning/ files are untracked while durable ones remain tracked."
    - "VALIDATION.md exists at the phase root and maps every locked decision D-01..D-09 to the named automated test(s) in test/repo-hygiene.test.mjs that prove it (Nyquist gate, nyquist_validation: true)."
  artifacts:
    - path: "test/repo-hygiene.test.mjs"
      provides: "node --test verification covering all phase outputs (files, README links, curate decision, git tracking state)"
      min_lines: 60
      exports: []
    - path: ".planning/phases/GSD-26-repo-hygiene/VALIDATION.md"
      provides: "The Nyquist coverage artefact for the phase: maps every locked decision D-01..D-09 to the named automated test(s) that prove it"
      min_lines: 20
      exports: []
  key_links:
    - from: "README.md"
      to: "CHANGELOG.md"
      via: "README links the changelog (D-02/D-09)"
      pattern: "CHANGELOG\\.md"
    - from: "README.md"
      to: "CONTRIBUTING.md"
      via: "README links the contribution guide (D-09)"
      pattern: "CONTRIBUTING\\.md"
    - from: "README.md"
      to: "CODE_OF_CONDUCT.md"
      via: "README links the code of conduct (D-09)"
      pattern: "CODE_OF_CONDUCT\\.md"
    - from: "README.md"
      to: ".planning/"
      via: "README .planning/ artefacts section documents the curate decision (D-08)"
      pattern: "gitignore|git-ignore|volatile"
---
<objective>Wire the phase outputs together: add README links to the three new files (D-09), document the .planning/ curate decision in README's .planning/ artefacts section (D-08), add the full node --test verification (test/repo-hygiene.test.mjs) that proves every phase output — the three files, the README links, the curate note, and the git tracking state — is in place, and record the D-01..D-09 to automated-test mapping in VALIDATION.md (Nyquist gate, nyquist_validation: true). This plan runs last (wave 2) because it depends on the files from plan 01 and the curate decision from plan 02.</objective>
<context>
@README.md (has a "### `.planning/` artefacts" section at line ~146 and a "## License" section at line ~199)
@CHANGELOG.md (created in plan 01)
@CODE_OF_CONDUCT.md (created in plan 01)
@CONTRIBUTING.md (created in plan 01)
@test/license.test.mjs (existing test pattern to mirror: reads repo files from ROOT = new URL("../", import.meta.url).pathname)
@test/repo-hygiene.test.mjs (PRE-EXISTING file NOT created by any plan in this phase — Task 2 depends on it as external state; treat create-if-absent as the primary path so the task is deterministic regardless of its prior content)
</context>
<tasks>
  <task type="auto">
    <name>Task 1: Add README links to the three new files and document the curate decision (D-08, D-09)</name>
    <files>README.md</files>
    <read_first>README.md</read_first>
    <action>Edit README.md to (1) add links to CHANGELOG.md, CONTRIBUTING.md, and CODE_OF_CONDUCT.md — place them in or near the "## License" section (line ~199) or a small "Contributing" area; each link must be a Markdown link whose visible text or target contains the exact filename (e.g. [CHANGELOG.md](CHANGELOG.md)); and (2) in the "### `.planning/` artefacts" section (line ~146), add a short note documenting the curate decision: the durable artefacts the GSD loop needs to orient (PROJECT.md, REQUIREMENTS.md, ROADMAP.md, STATE.md, config.json, codebase/, and per-phase CONTEXT/RESEARCH/PLAN/SUMMARY/VERIFICATION) are tracked, while the volatile churn (async-jobs.json, WINDOWS.md, quick/ records, and per-phase DISCUSSION-LOG.md) is gitignored. The note must be discoverable in that section. Do NOT remove or rewrite the existing .planning/ tree diagram; you may annotate the volatile entries in it as gitignored if you wish.</action>
    <verify>grep -q 'CHANGELOG\.md' README.md; grep -q 'CONTRIBUTING\.md' README.md; grep -q 'CODE_OF_CONDUCT\.md' README.md; grep -qi 'gitignore\|git-ignore\|volatile' README.md</verify>
    <acceptance_criteria>
      - grep -q 'CHANGELOG\.md' README.md
      - grep -q 'CONTRIBUTING\.md' README.md
      - grep -q 'CODE_OF_CONDUCT\.md' README.md
      - grep -qi 'gitignore\|git-ignore\|volatile' README.md
    </acceptance_criteria>
    <done>README.md links all three new files and its .planning/ artefacts section documents the curate decision.</done>
  </task>
  <task type="auto">
    <name>Task 2: Ensure test/repo-hygiene.test.mjs covers all phase outputs (D-01..D-09)</name>
    <files>test/repo-hygiene.test.mjs</files>
    <read_first>test/repo-hygiene.test.mjs, test/license.test.mjs</read_first>
    <action>This task depends on a pre-existing test/repo-hygiene.test.mjs that is NOT created by any plan in this phase — it is assumed to already exist in the repo (it currently fails only because the depth-3 DISCUSSION-LOG file is still tracked — a gap closed by plan 02). Because its prior content is external state, treat create-if-absent as the PRIMARY path so the task is deterministic regardless of prior state: first read test/repo-hygiene.test.mjs if it exists; if it is absent, or if any of the six required assertions below is missing or weakened, create/repair the file so it contains ALL six tests. Do NOT blindly overwrite a present file that already satisfies all six. The six required tests are: (1) CHANGELOG.md exists and contains "# Changelog", "## [Unreleased]", "## [2.0.0]", and "## [1.7.0]" (D-01/D-02); (2) CODE_OF_CONDUCT.md exists and contains "Contributor Covenant" and "2.1" (D-03); (3) CONTRIBUTING.md exists and mentions "node --test", a PR/contribution workflow, the GSD phase loop, and the no-credentials hygiene rule (D-04/D-05); (4) README.md links CHANGELOG.md, CONTRIBUTING.md, and CODE_OF_CONDUCT.md (D-09); (5) README.md's .planning/ artefacts section documents the curate decision (D-08) — assert README mentions gitignore/volatile; (6) the volatile .planning/ files are untracked while durable ones remain tracked (D-06/D-07) — shell out to "git ls-files" (as test/phase-tools-git.test.mjs does) and assert the output does NOT list .planning/WINDOWS.md, .planning/async-jobs.json, .planning/quick/, or any *-DISCUSSION-LOG.md, while it DOES list .planning/STATE.md, .planning/ROADMAP.md, and a -CONTEXT.md. Mirror the style of test/license.test.mjs (node:test with assert/strict, ROOT = new URL("../", import.meta.url).pathname, fsPromises.readFile). Name each test with a descriptive string citing the decision id, e.g. "volatile .planning/ files are untracked, durable ones tracked (D-06/D-07)". Do NOT delete or weaken any existing assertion.</action>
    <verify>node --test test/repo-hygiene.test.mjs should exit 0</verify>
    <acceptance_criteria>
      - node --test test/repo-hygiene.test.mjs exits 0
      - grep -q 'CHANGELOG.md' test/repo-hygiene.test.mjs
      - grep -q 'CODE_OF_CONDUCT.md' test/repo-hygiene.test.mjs
      - grep -q 'CONTRIBUTING.md' test/repo-hygiene.test.mjs
      - grep -q 'git ls-files' test/repo-hygiene.test.mjs
      - grep -q 'DISCUSSION-LOG' test/repo-hygiene.test.mjs (the D-06/D-07 untracked assertion is present)
      - grep -q 'volatile .planning/ files are untracked' test/repo-hygiene.test.mjs (the D-06/D-07 test name string is present)
    </acceptance_criteria>
    <done>test/repo-hygiene.test.mjs passes (exit 0) and asserts the three files, the README links, the curate note, and the git tracking state, with no assertion weakened or deleted.</done>
  </task>
  <task type="auto">
    <name>Task 3: Record the D-01..D-09 to automated-test mapping in VALIDATION.md (Nyquist gate)</name>
    <files>.planning/phases/GSD-26-repo-hygiene/VALIDATION.md</files>
    <read_first>test/repo-hygiene.test.mjs</read_first>
    <action>Write the Nyquist coverage artefact for the phase at .planning/phases/GSD-26-repo-hygiene/VALIDATION.md (the phase root, alongside CONTEXT.md/RESEARCH.md). It is a plain Markdown file that records, for every locked decision D-01..D-09 in CONTEXT.md, the named automated test(s) in test/repo-hygiene.test.mjs that prove it, plus the phase-goal truths they back. Structure: a "## Nyquist Coverage" heading followed by a short statement that nyquist_validation is enabled (.planning/config.json) and every new behaviour in this phase has a named automated test, with no 3-consecutive-task window lacking coverage; then a "## Decision-to-Test Map" section with one line per decision D-01..D-09, each citing the exact test name string used in test/repo-hygiene.test.mjs (e.g. "D-01/D-02 — CHANGELOG.md exists and is Keep-a-Changelog — test 'CHANGELOG.md exists and is Keep-a-Changelog (D-01/D-02)'"). Map D-01/D-02 to the changelog test, D-03 to the code-of-conduct test, D-04/D-05 to the contributing test, D-06/D-07 to the git-tracking test, D-08 to the README curate-note test, and D-09 to the README-links test. Do NOT invent tests that do not exist in test/repo-hygiene.test.mjs — every cited test name must match a test actually written in Task 2.</action>
    <verify>test -f .planning/phases/GSD-26-repo-hygiene/VALIDATION.md; grep -q '## Nyquist Coverage' .planning/phases/GSD-26-repo-hygiene/VALIDATION.md; grep -q 'D-09' .planning/phases/GSD-26-repo-hygiene/VALIDATION.md</verify>
    <acceptance_criteria>
      - test -f .planning/phases/GSD-26-repo-hygiene/VALIDATION.md
      - grep -q '## Nyquist Coverage' .planning/phases/GSD-26-repo-hygiene/VALIDATION.md
      - grep -q 'D-01' .planning/phases/GSD-26-repo-hygiene/VALIDATION.md
      - grep -q 'D-09' .planning/phases/GSD-26-repo-hygiene/VALIDATION.md
      - grep -q 'repo-hygiene.test.mjs' .planning/phases/GSD-26-repo-hygiene/VALIDATION.md
    </acceptance_criteria>
    <done>VALIDATION.md exists at the phase root and maps every locked decision D-01..D-09 to the named automated test(s) in test/repo-hygiene.test.mjs that prove it.</done>
  </task>
</tasks>

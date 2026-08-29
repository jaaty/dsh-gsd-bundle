---
phase: 27-ci-and-security
plan: 03
type: execute
wave: 2
depends_on: ["GSD-27-ci-and-security-01", "GSD-27-ci-and-security-02"]
files_modified: ["README.md", "CONTRIBUTING.md", "CHANGELOG.md"]
autonomous: true
requirements: ["PUB-04"]
gap_closure: false
user_setup: []
must_haves:
  truths:
    - "README documents that the test suite runs in CI and that secrets are scanned."
    - "CONTRIBUTING documents the CI workflow and the secret-scan guard."
    - "CHANGELOG records the ci-and-security phase."
  artifacts:
    - path: "README.md"
      provides: "CI + secret-scan documentation in the Contributing area"
      min_lines: 40
      exports: []
    - path: "CONTRIBUTING.md"
      provides: "CI + secret-scan documentation in the test-suite and contribution-workflow sections"
      min_lines: 40
      exports: []
    - path: "CHANGELOG.md"
      provides: "ci-and-security entry under [Unreleased]"
      min_lines: 40
      exports: []
  key_links: []
---
<objective>Document the CI workflow and the secret-scan guard so contributors know tests run in CI and secrets are scanned, as D-08 requires. This plan extends README.md and CONTRIBUTING.md with CI/security notes and updates the CHANGELOG entry for the ci-and-security phase. It runs in wave 2 because it documents the workflow (plan 01) and the scan result (plan 02) that must exist first.</objective>
<context>
@README.md (has ## Contributing at line 201 and ## License at line 205)
@CONTRIBUTING.md (has ## Running the test suite at line 32, ## Contribution workflow at line 71, ## Hygiene: no secrets in .planning/ at line 92)
@CHANGELOG.md (Keep-a-Changelog; has a "ci-and-security (planned)" stub under [Unreleased])
@.github/workflows/ci.yml (created in plan 01 — the workflow being documented)
@.planning/phases/GSD-27-ci-and-security/SECRET-SCAN.md (created in plan 02 — the scan result being referenced)
</context>
<tasks>
  <task type="auto">
    <name>Task 1: Document CI and secret scanning in README.md (D-08)</name>
    <files>README.md</files>
    <read_first>README.md</read_first>
    <action>Extend README.md's ## Contributing section (around line 201) to state that the test suite runs in CI via a GitHub Actions workflow (.github/workflows/ci.yml) on pull requests and on push to main, and that a gitleaks secret-scan guard runs on pull requests to prevent new credentials or tokens from being introduced. Keep the wording concise and consistent with the existing README tone. Do not restructure the README; only add the CI/security sentences to the Contributing area.</action>
    <verify>grep -q 'CI' README.md && grep -q 'gitleaks' README.md && grep -q 'Contributing' README.md</verify>
    <acceptance_criteria>
      - grep -q 'CI' README.md
      - grep -q 'gitleaks' README.md
      - grep -q 'Contributing' README.md
    </acceptance_criteria>
    <done>README.md's Contributing section mentions the CI test workflow and the gitleaks secret-scan guard.</done>
  </task>
  <task type="auto">
    <name>Task 2: Document CI and secret scanning in CONTRIBUTING.md (D-08)</name>
    <files>CONTRIBUTING.md</files>
    <read_first>CONTRIBUTING.md</read_first>
    <action>Extend CONTRIBUTING.md to document the CI workflow and the secret-scan guard. In the ## Running the test suite section (around line 32), add a note that the suite also runs in CI via .github/workflows/ci.yml on pull requests and on push to main. In the ## Contribution workflow section (around line 71), add a note that a gitleaks secret-scan guard runs on pull requests and fails the PR if a new credential or token is introduced. Keep the existing sections intact; only add the CI/security notes.</action>
    <verify>grep -q 'CI' CONTRIBUTING.md && grep -q 'gitleaks' CONTRIBUTING.md && grep -q 'Running the test suite' CONTRIBUTING.md</verify>
    <acceptance_criteria>
      - grep -q 'CI' CONTRIBUTING.md
      - grep -q 'gitleaks' CONTRIBUTING.md
      - grep -q 'Running the test suite' CONTRIBUTING.md
    </acceptance_criteria>
    <done>CONTRIBUTING.md documents the CI test run and the gitleaks secret-scan guard in the test-suite and contribution-workflow sections.</done>
  </task>
  <task type="auto">
    <name>Task 3: Update the CHANGELOG ci-and-security entry (discretionary)</name>
    <files>CHANGELOG.md</files>
    <read_first>CHANGELOG.md</read_first>
    <action>Update CHANGELOG.md's existing "ci-and-security (planned)" stub under [Unreleased] (around line 15) to reflect the shipped phase: change "(planned)" to "(shipped)" and expand the one-line description to mention the GitHub Actions test workflow, the committed package-lock.json for npm ci, and the full-history gitleaks secret scan. Keep the Keep-a-Changelog format and the existing structure intact.</action>
    <verify>grep -q 'ci-and-security' CHANGELOG.md && grep -q 'shipped' CHANGELOG.md && grep -q '^## \[Unreleased\]' CHANGELOG.md</verify>
    <acceptance_criteria>
      - grep -q 'ci-and-security' CHANGELOG.md
      - grep -q 'shipped' CHANGELOG.md
      - grep -q '^## \[Unreleased\]' CHANGELOG.md
    </acceptance_criteria>
    <done>CHANGELOG.md's ci-and-security entry is updated to shipped with a description of the CI workflow and secret scan.</done>
  </task>
</tasks>

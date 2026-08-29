---
phase: 32-security-policy-templates
plan: 02
type: execute
wave: 2
depends_on: ["GSD-32-security-policy-templates-01"]
files_modified: [".github/ISSUE_TEMPLATE/bug_report.yml", ".github/ISSUE_TEMPLATE/feature_request.yml", ".github/ISSUE_TEMPLATE/config.yml", ".github/PULL_REQUEST_TEMPLATE.md", "test/security-policy.test.mjs"]
autonomous: true
requirements: ["REL-03"]
gap_closure: false
user_setup: []
must_haves:
  truths:
    - "A bug_report.yml issue form exists under .github/ISSUE_TEMPLATE/ with top-level keys name, description, and body, and a textarea form element."
    - "A feature_request.yml issue form exists under .github/ISSUE_TEMPLATE/ with top-level keys name, description, and body, and a textarea form element."
    - "A config.yml exists under .github/ISSUE_TEMPLATE/ with blank_issues_enabled: true."
    - "A PULL_REQUEST_TEMPLATE.md exists under .github/ with a summary section, a checklist (tests pass, no secrets, changelog updated), and a note pointing to CONTRIBUTING.md and the GSD phase loop."
    - "npm test passes, including a new test/security-policy.test.mjs that asserts the structural invariants of SECURITY.md, the issue forms, the PR template, the package.json files whitelist, and the README link."
  artifacts:
    - path: "test/security-policy.test.mjs"
      provides: "Dependency-free structural verification (D-06) that every REL-03 deliverable and every D-NN decision is present: SECURITY.md sections, issue-form keys, config.yml blank-issues flag, PR template checklist, package.json files whitelist, README link."
      min_lines: 80
      exports: []
  key_links:
    - from: "test/security-policy.test.mjs"
      to: "SECURITY.md"
      via: "readRepoFile('SECURITY.md') asserting the Reporting/Supported-Versions sections and private-vuln-reporting reference"
      pattern: "readRepoFile\\(\"SECURITY\\.md\"\\)"
    - from: "test/security-policy.test.mjs"
      to: ".github/ISSUE_TEMPLATE/bug_report.yml"
      via: "readRepoFile('.github/ISSUE_TEMPLATE/bug_report.yml') asserting name/description/body keys and a textarea element"
      pattern: "ISSUE_TEMPLATE/bug_report\\.yml"
    - from: "test/security-policy.test.mjs"
      to: "package.json"
      via: "JSON.parse(readRepoFile('package.json')) asserting files includes SECURITY.md"
      pattern: "pkg\\.files\\.includes\\(\"SECURITY\\.md\"\\)"
---
<objective>Create the GitHub issue forms and pull-request template so public contributors have structured paths to report bugs, request features, and open PRs, then add a dependency-free structural test that proves every REL-03 deliverable and every D-NN decision is present. This plan depends on plan 01 (SECURITY.md, package.json, README) which its test also asserts.</objective>
<context>
@.github/ISSUE_TEMPLATE/bug_report.yml (does not exist yet — create it)
@.github/ISSUE_TEMPLATE/feature_request.yml (does not exist yet — create it)
@.github/ISSUE_TEMPLATE/config.yml (does not exist yet — create it)
@.github/PULL_REQUEST_TEMPLATE.md (does not exist yet — create it)
@test/security-policy.test.mjs (does not exist yet — create it)
@test/license.test.mjs (existing structural-test pattern: node:test + node:assert/strict, ROOT via new URL("../", import.meta.url).pathname, readRepoFile helper)
@test/repo-hygiene.test.mjs (existing structural-test pattern)
@CONTRIBUTING.md (PR/contribution workflow and GSD phase loop description to reference from the PR template)
@CHANGELOG.md (Keep-a-Changelog with an "## [Unreleased]" section at line 12 — grounds the PR template's changelog checklist item)
@package.json (files whitelist now includes SECURITY.md after plan 01)
@README.md (now links SECURITY.md after plan 01)
</context>
<tasks>
  <task type="auto">
    <name>Task 1: Create the GitHub issue forms (tracer)</name>
    <files>.github/ISSUE_TEMPLATE/bug_report.yml, .github/ISSUE_TEMPLATE/feature_request.yml, .github/ISSUE_TEMPLATE/config.yml</files>
    <read_first>CONTRIBUTING.md</read_first>
    <action>Per D-03, create three files under .github/ISSUE_TEMPLATE/. bug_report.yml: a YAML issue form with top-level keys "name" (e.g. "Bug report"), "description", "title", and a "body" array containing at least one "type: textarea" element (e.g. steps to reproduce, expected/actual behaviour) and a "type: checkboxes" element for confirmation; use only generic labels such as "bug" or omit labels. feature_request.yml: same structure with "name" (e.g. "Feature request"), "description", "title", and a "body" array with at least one "type: textarea" element (e.g. problem statement, proposed solution); use only generic labels such as "enhancement" or omit labels. config.yml: a YAML document with "blank_issues_enabled: true" so blank issues remain allowed. Ensure every .yml file is valid YAML (consistent indentation, no tabs, no unquoted colons in values). Do not include any real credentials, tokens, or email addresses (gitleaks guard).</action>
    <verify>node -e "const fs=require('fs'); for (const f of ['.github/ISSUE_TEMPLATE/bug_report.yml','.github/ISSUE_TEMPLATE/feature_request.yml']) { const s=fs.readFileSync(f,'utf8'); if(!s.includes('name:')||!s.includes('description:')||!s.includes('body:')||!s.includes('type: textarea')) process.exit(1); } const c=fs.readFileSync('.github/ISSUE_TEMPLATE/config.yml','utf8'); if(!c.includes('blank_issues_enabled: true')) process.exit(1); console.log('ok')"</verify>
    <acceptance_criteria>
      - bug_report.yml exists and contains "name:", "description:", "body:", and "type: textarea"
      - feature_request.yml exists and contains "name:", "description:", "body:", and "type: textarea"
      - config.yml exists and contains "blank_issues_enabled: true"
      - no file contains a real email address or token
    </acceptance_criteria>
    <done>All three issue-template files exist under .github/ISSUE_TEMPLATE/ with the required structural keys and blank issues enabled.</done>
  </task>
  <task type="auto">
    <name>Task 2: Create the pull-request template</name>
    <files>.github/PULL_REQUEST_TEMPLATE.md</files>
    <read_first>CONTRIBUTING.md, CHANGELOG.md</read_first>
    <action>Per D-04, create .github/PULL_REQUEST_TEMPLATE.md. It must contain a summary section (e.g. "## Summary" with a description of the change), a checklist section (e.g. "## Checklist") with items for tests passing, no secrets/credentials introduced, and the changelog updated (grounded in the Keep-a-Changelog "## [Unreleased]" section in CHANGELOG.md), and a note pointing to CONTRIBUTING.md and the GSD phase loop (e.g. "Please read CONTRIBUTING.md and follow the GSD phase loop"). Use markdown checkboxes like "- [ ]". Do not include any real credentials, tokens, or email addresses (gitleaks guard).</action>
    <verify>grep -c "## Summary" .github/PULL_REQUEST_TEMPLATE.md && grep -c "CONTRIBUTING.md" .github/PULL_REQUEST_TEMPLATE.md && grep -c "GSD" .github/PULL_REQUEST_TEMPLATE.md</verify>
    <acceptance_criteria>
      - .github/PULL_REQUEST_TEMPLATE.md exists
      - contains "## Summary"
      - contains a checklist with "tests" and "changelog" and "secret" (grep -i)
      - references CONTRIBUTING.md and the GSD phase loop
    </acceptance_criteria>
    <done>.github/PULL_REQUEST_TEMPLATE.md exists with a summary section, a checklist (tests / no secrets / changelog), and a CONTRIBUTING.md + GSD phase loop note.</done>
  </task>
  <task type="auto">
    <name>Task 3: Write the structural verification test</name>
    <files>test/security-policy.test.mjs</files>
    <read_first>test/license.test.mjs, test/repo-hygiene.test.mjs</read_first>
    <action>Per D-06, create test/security-policy.test.mjs following the existing structural-test pattern (plain node:test + node:assert/strict, ROOT = new URL("../", import.meta.url).pathname, a readRepoFile(rel) helper using node:fs/promises and node:path). Do NOT add any YAML parser or new dependency — assert structural invariants via string includes. Write one test per invariant, each failing loudly with a descriptive message naming the missing invariant. Assert: (1) SECURITY.md exists and contains "Reporting a Vulnerability", "Supported Versions", a reference to GitHub private vulnerability reporting (e.g. "Security tab" or "Report a vulnerability"), and no email contact; (2) package.json files includes "SECURITY.md"; (3) README.md contains "[SECURITY.md](SECURITY.md)"; (4) .github/ISSUE_TEMPLATE/bug_report.yml exists and contains "name:", "description:", "body:", and "type: textarea"; (5) .github/ISSUE_TEMPLATE/feature_request.yml exists with the same invariants; (6) .github/ISSUE_TEMPLATE/config.yml exists and contains "blank_issues_enabled: true"; (7) .github/PULL_REQUEST_TEMPLATE.md exists and contains "## Summary", a checklist referencing tests/changelog/secrets, and references to CONTRIBUTING.md and the GSD phase loop. The file must be auto-discovered by "node --test test/*.test.mjs".</action>
    <verify>node --test test/security-policy.test.mjs</verify>
    <acceptance_criteria>
      - test/security-policy.test.mjs exists
      - "node --test test/security-policy.test.mjs" exits 0
      - "npm test" (node --test test/*.test.mjs) passes with the new file included
      - no new dependency added (package.json dependencies stays {})
    </acceptance_criteria>
    <done>test/security-policy.test.mjs passes standalone and as part of npm test, proving every REL-03 deliverable and D-NN decision.</done>
  </task>
</tasks>

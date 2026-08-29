---
phase: 32-security-policy-templates
plan: 01
type: execute
wave: 1
depends_on: []
files_modified: ["SECURITY.md", "package.json", "README.md"]
autonomous: true
requirements: ["REL-03"]
gap_closure: false
user_setup: []
must_haves:
  truths:
    - "A SECURITY.md file exists at the repo root with a 'Reporting a Vulnerability' section and a 'Supported Versions' section."
    - "SECURITY.md references GitHub's private vulnerability reporting (the Security tab) as the disclosure channel and publishes no email contact."
    - "SECURITY.md states that only the most recent published release receives security fixes (single maintained line)."
    - "package.json's files whitelist includes 'SECURITY.md'."
    - "README.md links SECURITY.md in its Contributing section."
  artifacts:
    - path: "SECURITY.md"
      provides: "GitHub-recognized security policy at the repo root: disclosure channel (private vulnerability reporting) and supported-versions policy."
      min_lines: 30
      exports: []
  key_links:
    - from: "package.json"
      to: "SECURITY.md"
      via: "the files whitelist array entry 'SECURITY.md' so the policy ships in the npm tarball"
      pattern: "SECURITY\\.md"
    - from: "README.md"
      to: "SECURITY.md"
      via: "a markdown link in the Contributing section alongside CONTRIBUTING.md / CODE_OF_CONDUCT.md"
      pattern: "\\[SECURITY\\.md\\]\\(SECURITY\\.md\\)"
---
<objective>Create the SECURITY.md vulnerability-reporting policy at the repo root and wire it into the package manifest and README so it ships with the npm package and is discoverable by contributors. This is the core deliverable of REL-03.</objective>
<context>
@SECURITY.md (does not exist yet — create it)
@package.json (files whitelist at lines 76-85; add "SECURITY.md")
@README.md (Contributing section around lines 224-228; add a SECURITY.md link alongside CONTRIBUTING.md / CODE_OF_CONDUCT.md)
@CONTRIBUTING.md (existing contributor guidance; "Reporting issues" section at lines 111-114 points to the GitHub issues tracker)
@CODE_OF_CONDUCT.md (existing community doc shipped and linked from README — SECURITY.md follows the same pattern)
</context>
<tasks>
  <task type="auto">
    <name>Task 1: Create SECURITY.md at the repo root (tracer)</name>
    <files>SECURITY.md</files>
    <read_first>CONTRIBUTING.md, CODE_OF_CONDUCT.md</read_first>
    <action>Create SECURITY.md at the repo root. It must contain a top-level "# Security Policy" heading, a "## Reporting a Vulnerability" section, and a "## Supported Versions" section. Per D-01, the Reporting section must direct reporters to GitHub's built-in private vulnerability reporting feature — reference the repo's Security tab / "Report a vulnerability" private advisory flow — and must NOT publish any email contact. Per D-02, the Supported Versions section must state that only the most recent published release receives security fixes (a single maintained line for this small plugin bundle). Use only the public repo URL (https://github.com/jaaty/dsh-gsd-bundle) and generic placeholders; do not include any real credentials, tokens, or email addresses (gitleaks guard). Match the tone and formatting of the existing CONTRIBUTING.md and CODE_OF_CONDUCT.md.</action>
    <verify>grep -c "Reporting a Vulnerability" SECURITY.md && grep -c "Supported Versions" SECURITY.md && grep -c "Security tab" SECURITY.md</verify>
    <acceptance_criteria>
      - SECURITY.md exists at the repo root
      - contains "## Reporting a Vulnerability"
      - contains "## Supported Versions"
      - references GitHub private vulnerability reporting (grep "Security tab" or "Report a vulnerability")
      - contains no "@" email address (grep -c "@" returns 0 or only the repo URL)
      - states only the most recent published release is supported
    </acceptance_criteria>
    <done>SECURITY.md exists with both required sections, references private vulnerability reporting, publishes no email contact, and states the single-maintained-line policy.</done>
  </task>
  <task type="auto">
    <name>Task 2: Add SECURITY.md to the package.json files whitelist</name>
    <files>package.json</files>
    <read_first>package.json</read_first>
    <action>Per D-05, add the string "SECURITY.md" to the "files" array in package.json (currently at lines 76-85, alongside "README.md", "NOTICE", "DISTRIBUTION.md", "CONTRIBUTING.md", "CODE_OF_CONDUCT.md", "CHANGELOG.md"). Keep the array valid JSON and do not change any other field. Do not add any dependency.</action>
    <verify>node -e "const p=require('./package.json'); if(!p.files.includes('SECURITY.md')) process.exit(1); console.log('ok')"</verify>
    <acceptance_criteria>
      - package.json parses as valid JSON
      - p.files includes "SECURITY.md"
      - "dependencies" remains {} (no new dependency)
    </acceptance_criteria>
    <done>package.json files whitelist includes "SECURITY.md" and the manifest is still valid JSON with no new dependencies.</done>
  </task>
  <task type="auto">
    <name>Task 3: Link SECURITY.md from the README Contributing section</name>
    <files>README.md</files>
    <read_first>README.md</read_first>
    <action>Per D-05, add a markdown link to SECURITY.md in the README "## Contributing" section (around lines 224-228), alongside the existing links to CONTRIBUTING.md, CODE_OF_CONDUCT.md, and CHANGELOG.md. Add a sentence such as "Please report security vulnerabilities via [SECURITY.md](SECURITY.md)." Keep the link target exactly "SECURITY.md" (relative path). Do not alter the License section or any other content.</action>
    <verify>grep -n "SECURITY.md" README.md</verify>
    <acceptance_criteria>
      - README.md contains "[SECURITY.md](SECURITY.md)"
      - the link appears in the Contributing section
    </acceptance_criteria>
    <done>README.md links SECURITY.md in its Contributing section.</done>
  </task>
</tasks>

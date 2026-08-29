---
phase: 27-ci-and-security
plan: 02
type: execute
wave: 1
depends_on: []
files_modified: [".planning/phases/GSD-27-ci-and-security/SECRET-SCAN.md"]
autonomous: true
requirements: ["PUB-04"]
gap_closure: false
user_setup: []
must_haves:
  truths:
    - "A full-history gitleaks secret scan of the entire git history confirms no credentials or tokens are exposed."
    - "The scan result (no leaks) is documented in the phase artefacts."
  artifacts:
    - path: ".planning/phases/GSD-27-ci-and-security/SECRET-SCAN.md"
      provides: "documented full-history gitleaks scan result confirming no credentials or tokens are exposed"
      min_lines: 10
      exports: []
  key_links: []
---
<objective>Run the one-time full-history secret scan that PUB-04 requires and document its result. This plan downloads the gitleaks v8.30.1 linux binary (verified working in this sandbox; there is no docker binary locally), runs a full-history detect over all commits, confirms the report is empty (no credentials or tokens exposed), and writes a SECRET-SCAN.md report into the phase artefacts. The CI guard job that prevents future leaks is in plan 01; the documentation of these behaviours is plan 03.</objective>
<context>
@.planning/phases/GSD-27-ci-and-security/GSD-27-ci-and-security-RESEARCH.md (verified gitleaks v8.30.1 binary URL, full-history scan command, and the empty-report result)
@cordis.patch.yml (tracked, mode 600 — a candidate the scan must cover)
@.planning/phases/GSD-27-ci-and-security/ (the phase artefacts directory where SECRET-SCAN.md is written)
</context>
<tasks>
  <task type="auto">
    <name>Task 1: Download gitleaks and run the full-history scan (D-05, D-06)</name>
    <files>SECRET-SCAN.md</files>
    <read_first>.planning/phases/GSD-27-ci-and-security/GSD-27-ci-and-security-RESEARCH.md</read_first>
    <action>Download the gitleaks v8.30.1 linux binary and run a full-history secret scan. There is no docker binary in this sandbox, so use the standalone binary (verified working). Steps: (1) curl -L -o /tmp/gitleaks.tar.gz https://github.com/gitleaks/gitleaks/releases/download/v8.30.1/gitleaks_8.30.1_linux_x64.tar.gz, (2) tar -xzf /tmp/gitleaks.tar.gz -C /tmp, (3) run from the repo root: /tmp/gitleaks detect --source . --log-opts="--all" --report-path /tmp/gitleaks-report.json --report-format json. This scans every commit across all branches (verified: 237 commits). Confirm the report is empty (the JSON report is "[]" — no leaks found). If the scan DOES report findings, do not silently proceed: triage each finding (real secret vs test fixture/placeholder) and record the triage in the report; do not commit any real secret. The expected and verified outcome is an empty report.</action>
    <verify>test -f /tmp/gitleaks && /tmp/gitleaks version 2>&1 | grep -q '8.30.1' && test -f /tmp/gitleaks-report.json && grep -q '\[\]' /tmp/gitleaks-report.json</verify>
    <acceptance_criteria>
      - /tmp/gitleaks version prints 8.30.1
      - test -f /tmp/gitleaks-report.json
      - grep -q '\[\]' /tmp/gitleaks-report.json (empty report = no leaks)
    </acceptance_criteria>
    <done>gitleaks v8.30.1 ran a full-history scan over all commits and produced an empty report confirming no credentials or tokens are exposed.</done>
  </task>
  <task type="auto">
    <name>Task 2: Write SECRET-SCAN.md documenting the result (D-06)</name>
    <files>.planning/phases/GSD-27-ci-and-security/SECRET-SCAN.md</files>
    <read_first>.planning/phases/GSD-27-ci-and-security/GSD-27-ci-and-security-RESEARCH.md</read_first>
    <action>Write .planning/phases/GSD-27-ci-and-security/SECRET-SCAN.md documenting the one-time full-history audit. Include: (1) the tool and version (gitleaks v8.30.1), (2) the exact command used (gitleaks detect --source . --log-opts="--all" --report-format json), (3) the scope (entire git history, all branches, N commits scanned — use the actual count from the scan output), (4) the result: no credentials or tokens exposed (empty report), (5) a note that cordis.patch.yml (tracked, mode 600) was covered by the scan, and (6) a note that a per-PR gitleaks guard job in .github/workflows/ci.yml prevents future leaks. Do NOT paste any real secret into this file. Commit the report atomically with a message like "docs: record full-history secret scan result".</action>
    <verify>test -f .planning/phases/GSD-27-ci-and-security/SECRET-SCAN.md && grep -q 'gitleaks' .planning/phases/GSD-27-ci-and-security/SECRET-SCAN.md && grep -q 'no credentials or tokens' .planning/phases/GSD-27-ci-and-security/SECRET-SCAN.md && git ls-files --error-unmatch .planning/phases/GSD-27-ci-and-security/SECRET-SCAN.md >/dev/null 2>&1</verify>
    <acceptance_criteria>
      - test -f .planning/phases/GSD-27-ci-and-security/SECRET-SCAN.md
      - grep -q 'gitleaks' .planning/phases/GSD-27-ci-and-security/SECRET-SCAN.md
      - grep -q 'no credentials or tokens' .planning/phases/GSD-27-ci-and-security/SECRET-SCAN.md
      - git ls-files --error-unmatch .planning/phases/GSD-27-ci-and-security/SECRET-SCAN.md (tracked)
    </acceptance_criteria>
    <done>SECRET-SCAN.md exists in the phase artefacts, documents the full-history gitleaks scan and its empty result, and is committed.</done>
  </task>
</tasks>

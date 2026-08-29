---
phase: 32-security-policy-templates
plan: 01
subsystem: repository-docs
tags: [security, policy, docs, package-manifest, readme]
dependency_graph:
  requires: []
  provides: [SECURITY.md, package.json files whitelist entry, README link]
  affects: [plan 02 structural test]
tech-stack: [markdown, json]
key-files:
  created: [SECURITY.md]
  modified: [package.json, README.md]
decisions: [D-01, D-02, D-05]
metrics:
  duration: 2026-08-29
  completed: 2026-08-29
status: complete
actuals:
  tasks: 3
  commits: 3
---

# Phase 32 Plan 01: SECURITY.md Policy + Manifest/README Wiring Summary

Created the SECURITY.md vulnerability-reporting policy at the repo root and wired it into the package manifest and README so it ships with the npm package and is discoverable by contributors.

## Tasks Completed

1. **Task 1 — Create SECURITY.md (tracer):** Added `SECURITY.md` at the repo root with a `# Security Policy` heading, a `## Reporting a Vulnerability` section (directs reporters to GitHub's private vulnerability reporting via the repo's Security tab / "Report a vulnerability" flow, per D-01, with no email contact), and a `## Supported Versions` section stating only the most recent published release receives security fixes (single maintained line, per D-02). Uses only the public repo URL and no real credentials/tokens/emails (gitleaks-safe). 37 lines.
2. **Task 2 — package.json files whitelist:** Added `"SECURITY.md"` to the `files` array (D-05). Manifest remains valid JSON; `dependencies` stays `{}` (no new dependency).
3. **Task 3 — README link:** Added `[SECURITY.md](SECURITY.md)` to the README `## Contributing` section alongside the CONTRIBUTING.md / CODE_OF_CONDUCT.md / CHANGELOG.md links (D-05).

## Verification

- `npm test` passes: 415 tests, 0 failures (no regression).
- Task 1 verify: `grep -c "Reporting a Vulnerability"` = 1, `grep -c "Supported Versions"` = 1, `grep -c "Security tab"` = 1, `grep -c "@"` = 0 (no email).
- Task 2 verify: `node -e` confirms `p.files.includes('SECURITY.md')` and `dependencies === {}`.
- Task 3 verify: `grep -n "SECURITY.md" README.md` shows the link in the Contributing section.

## Known Stubs

None. No TODO/FIXME/placeholder/skipped tests introduced.

## Threat Flags

No runtime code added. SECURITY.md and the templates contain no real credentials, tokens, or email addresses, so the gitleaks secret-scan guard on PRs is not triggered. The only security-adjacent note: private vulnerability reporting is referenced (D-01) but the enabling repo setting is deferred to phase 33 (github-repo-config), as agreed.

## Self-Check: PASSED

- `SECURITY.md` exists at repo root (37 lines, both required sections, private-vuln-reporting reference, no email, single-maintained-line policy).
- `package.json` `files` includes `SECURITY.md`; manifest valid JSON; no new dependency.
- `README.md` links `[SECURITY.md](SECURITY.md)` in the Contributing section.
- Three atomic commits created: `1bb2aa6`, `1e31b60`, `60f7c1b`.

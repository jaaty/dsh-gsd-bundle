I have everything I need. Here is the full RESEARCH.md.

---

# Phase 32: security-policy-templates — Research

**Phase:** 32-security-policy-templates
**Goal:** Add a SECURITY.md vulnerability-reporting policy and GitHub issue + pull-request templates so public contributors know how to report issues and open PRs. [REL-03]
**Researched:** 2026-08-29

## Domain analysis

### SECURITY.md (GitHub security policy) — confidence: HIGH
- GitHub recognizes a `SECURITY.md` at the **repo root** (or in `.github/`, `docs/`, or the root of the default branch) and surfaces it via the repo's **Security tab** and a banner on new issues. [CITED: https://docs.github.com/en/code-security/how-tos/report-and-fix-vulnerabilities/configure-vulnerability-reporting/add-security-policy]
- The conventional structure is two sections: **Reporting a Vulnerability** and **Supported Versions**. [CITED: https://docs.github.com/en/code-security/how-tos/report-and-fix-vulnerabilities/configure-vulnerability-reporting/add-security-policy]
- **Private vulnerability reporting** is GitHub's built-in disclosure channel: reporters open a private advisory via the repo's **Security tab → Report a vulnerability**, and it is only possible when the repo setting is enabled. [CITED: https://docs.github.com/en/code-security/how-tos/report-and-fix-vulnerabilities/report-a-vulnerability/privately-reporting-a-security-vulnerability]
- **Critical nuance (D-01):** the *repo setting* that enables private vulnerability reporting is **deferred to phase 33 (github-repo-config)**. SECURITY.md can still *reference* the private-reporting channel as the disclosure path, but the channel is not actually live until the setting is flipped. The wording must not over-promise ("report via the Security tab") in a way that misleads if the setting is off — but since phase 33 immediately follows and enables it, referencing it is the agreed decision. The planner should keep the wording aligned with D-01 and not add an email contact (D-01 explicitly forbids it).
- **Supported versions (D-02):** single maintained line — only the most recent published release receives security fixes. This is a small plugin bundle; a single-line policy is the honest, low-maintenance choice. [ASSUMED — standard practice for small single-maintained-line projects]

### GitHub issue forms (YAML) — confidence: HIGH
- Modern GitHub issue templates are **YAML issue forms** under `.github/ISSUE_TEMPLATE/`. Each file is a YAML document with top-level keys `name`, `description`, `title`, `labels`, `assignees`, and a `body` array of form elements. [CITED: https://docs.github.com/en/enterprise-cloud@latest/communities/using-templates-to-encourage-useful-issues-and-pull-requests/syntax-for-issue-forms]
- Form element types: `markdown`, `textarea`, `input`, `dropdown`, `checkboxes`. Each element has `id`, `attributes` (label, description, placeholder, value, options), and optional `validations` (`required: true`). [CITED: https://docs.github.com/en/enterprise-cloud@latest/communities/using-templates-to-encourage-useful-issues-and-pull-requests/syntax-for-issue-forms]
- A `config.yml` in `.github/ISSUE_TEMPLATE/` controls whether blank issues are allowed via `blank_issues_enabled: true` (D-03 keeps blank issues enabled). [CITED: https://docs.github.com/en/enterprise-server@3.21/communities/using-templates-to-encourage-useful-issues-and-pull-requests/configuring-issue-templates-for-your-repository]
- **Pitfall:** YAML front-matter must be valid YAML — a malformed form silently fails to render and GitHub falls back to the blank-issue form. The structural test must parse the YAML to catch this (D-06). [ASSUMED — GitHub silently ignores malformed issue-form YAML]
- **Pitfall:** `labels` referenced in a form must exist in the repo or GitHub creates them on first use; referencing non-existent labels is tolerated but noisy. For a small repo, either omit `labels` or use generic ones (`bug`, `enhancement`). [ASSUMED]

### Pull-request template — confidence: HIGH
- A single `.github/PULL_REQUEST_TEMPLATE.md` is the simplest PR template; GitHub applies it to every new PR. [CITED: https://docs.github.com/en/communities/using-templates-to-encourage-useful-issues-and-pull-requests/creating-a-pull-request-template-for-your-repository]
- Effective templates carry a summary section, a checklist, and pointers to contribution guidance. [CITED: https://tenthirtyam.org/dispatches/2026/04/04/how-to-write-an-effective-github-pull-request-template/]
- D-04 requires: a summary section, a checklist (tests pass, no secrets, changelog updated), and a note pointing to CONTRIBUTING.md and the GSD phase loop. The "changelog updated" item is grounded in this repo's Keep-a-Changelog convention (CHANGELOG.md has an `## [Unreleased]` section at `CHANGELOG.md:12`). [VERIFIED: CHANGELOG.md:12]

### No runtime code — confidence: HIGH
- This phase is **purely structural** (markdown + YAML + a package.json whitelist entry + a README link). No plugin module, no `lib/` change, no new dependency. The bundle's zero-runtime-dependency invariant (`package.json:91` `"dependencies": {}`) is untouched. [VERIFIED: package.json:91]

## Package legitimacy

**No new dependencies are proposed for this phase.** The phase adds only repository documentation files (SECURITY.md, issue forms, PR template) and edits `package.json`'s `files` whitelist and `README.md`. There is nothing to verify on a registry. The only "package" concern is the `files` whitelist entry, which is a plain string in the existing manifest — no external package. [VERIFIED: package.json:76-85]

## Risks

1. **Malformed issue-form YAML silently breaks the templates.** GitHub does not error loudly on invalid issue-form YAML; the form simply does not render. **Mitigation (D-06):** the structural test parses each `.yml` with a YAML parser and asserts the required top-level keys and `body` array exist. This is the single most important automated check in the phase.
2. **SECURITY.md over-promises a channel that is not yet live.** Private vulnerability reporting is referenced (D-01) but the enabling repo setting is deferred to phase 33. **Mitigation:** keep the wording aligned with D-01; the planner should not add an email contact (forbidden by D-01) and should phrase the disclosure path as the Security tab / private advisory.
3. **gitleaks secret-scan guard on PRs.** The CI guard (`.github/workflows/ci.yml:29-53`) fails a PR if a new secret is introduced. SECURITY.md and templates must not contain real tokens/emails. **Mitigation:** use only the public repo URL and generic placeholders; no real credentials. [VERIFIED: .github/workflows/ci.yml:29-53]
4. **`files` whitelist drift.** If SECURITY.md is added to the whitelist but the README link or the test is forgotten, the phase is incomplete. **Mitigation:** the structural test asserts all three (file exists, whitelist includes it, README links it) together (D-06).
5. **New test file must be picked up by CI.** CI runs `npm test` = `node --test test/*.test.mjs` (`.github/workflows/ci.yml:27`), which globs all `test/*.test.mjs`. A new `test/security-policy.test.mjs` is auto-discovered — no CI change needed. [VERIFIED: .github/workflows/ci.yml:27, package.json:31]

## Open Questions

- **OQ-1 (RESOLVED):** Does the structural test live in a new file or an existing one? — **New file `test/security-policy.test.mjs`.** The existing structural tests are one-file-per-phase-area (`test/license.test.mjs` for phase 25, `test/repo-hygiene.test.mjs` for phase 26), and `node --test test/*.test.mjs` auto-discovers new files. This matches the established convention. [VERIFIED: test/license.test.mjs, test/repo-hygiene.test.mjs, package.json:31]
- **OQ-2 (RESOLVED):** Which YAML parser does the structural test use? — **No new dependency.** The bundle has zero runtime dependencies and the test suite imports only Node builtins (`node:test`, `node:assert/strict`, `node:fs`, `node:path`, `node:child_process`). A YAML parser would be a new dev dependency, which the phase's "no new dependencies" scope edge forbids. **Mitigation:** the test asserts structural invariants without a YAML parser — the file exists, contains the required top-level keys (`name:`, `description:`, `body:`), and the `body:` array contains the expected element types (`type: textarea`, `type: checkboxes`, etc.). This is a pragmatic, dependency-free structural check that still catches the common failure modes (missing file, missing required keys, empty body). [VERIFIED: package.json:91, test/license.test.mjs:10-22]
- **OQ-3 (RESOLVED):** Where does the SECURITY.md link go in README? — **In the "Contributing" section (README.md:224-228),** alongside the existing CONTRIBUTING.md / CODE_OF_CONDUCT.md / CHANGELOG.md links. This is the natural home and matches how the other community docs are linked. [VERIFIED: README.md:224-228]
- **OQ-4 (RESOLVED):** Should the issue forms carry `labels`? — **Yes, generic labels only** (`bug`, `enhancement`), or omit `labels` entirely. GitHub creates referenced labels on first use; generic labels are safe and standard. This is within Claude's Discretion. [ASSUMED]

## Architectural Responsibility Map

This phase has **no runtime code** — there is no presentation/domain/data/integration tier to assign. The deliverables are repository-level documentation and manifest metadata:

| Capability | Tier | Notes |
|---|---|---|
| SECURITY.md policy | **Repository doc (root)** | Not shipped in the npm tarball unless added to `files`; D-05 adds it. |
| Issue forms + config.yml | **Repository doc (`.github/ISSUE_TEMPLATE/`)** | GitHub-only; not shipped in the npm tarball (not in `files`). |
| PR template | **Repository doc (`.github/PULL_REQUEST_TEMPLATE.md`)** | GitHub-only; not shipped. |
| `files` whitelist entry | **Manifest metadata (`package.json`)** | D-05: add `SECURITY.md` so it ships with the package. |
| README link | **Repository doc (`README.md`)** | D-05: link SECURITY.md alongside CONTRIBUTING/CODE_OF_CONDUCT. |
| Structural test | **Test tier (`test/security-policy.test.mjs`)** | D-06: proves the structural invariants. |

No security-sensitive capability is placed in a wrong tier — there is no runtime security code in this phase. The only security-adjacent concern (the gitleaks guard) is already handled by CI and requires only that the new docs contain no real secrets.

## Validation Architecture

The phase's definition of done is **structural**, verified by a new `node:test` file `test/security-policy.test.mjs` (auto-discovered by `npm test` / CI). Following the `test/license.test.mjs` and `test/repo-hygiene.test.mjs` pattern (plain `node:test` + `node:assert/strict`, `ROOT` resolved via `new URL("../", import.meta.url).pathname`, a `readRepoFile(rel)` helper), the test asserts:

1. **SECURITY.md exists at repo root** and contains the "Reporting a Vulnerability" and "Supported Versions" sections, references GitHub private vulnerability reporting (D-01), and states the single-maintained-line policy (D-02).
2. **`.github/ISSUE_TEMPLATE/bug_report.yml` exists** and contains the required top-level keys (`name:`, `description:`, `body:`) and a `type: textarea` element (D-03).
3. **`.github/ISSUE_TEMPLATE/feature_request.yml` exists** with the same structural invariants (D-03).
4. **`.github/ISSUE_TEMPLATE/config.yml` exists** and contains `blank_issues_enabled: true` (D-03).
5. **`.github/PULL_REQUEST_TEMPLATE.md` exists** and contains a summary section, a checklist (tests / no secrets / changelog), and a reference to CONTRIBUTING.md and the GSD phase loop (D-04).
6. **`package.json` `files` whitelist includes `SECURITY.md`** (D-05).
7. **README.md links SECURITY.md** (D-05).

Each assertion fails loudly with a descriptive message naming the missing invariant, per the project's fail-fast convention. This test is the Nyquist/coverage gate for the phase: it proves every D-NN decision and every REL-03 deliverable.

## Project Constraints (from project conventions)

- **Plain ESM, no build step, zero runtime dependencies** — `"dependencies": {}` (`package.json:91`). The structural test must not add a YAML parser or any new dependency. [VERIFIED: package.json:91, .planning/codebase/CONVENTIONS.md]
- **Test files are `.test.mjs` under `test/`**, plain `node:test` with `node:assert/strict`, run via `node --test test/*.test.mjs` (`package.json:31`). New test file is auto-discovered by CI. [VERIFIED: package.json:31, .github/workflows/ci.yml:27]
- **Real-cause fail-fast** — errors name the actual missing invariant, not a generic failure. [VERIFIED: .planning/codebase/CONVENTIONS.md]
- **gitleaks secret-scan guard on PRs** — new docs must contain no real credentials/tokens. [VERIFIED: .github/workflows/ci.yml:29-53]
- **Keep-a-Changelog** — CHANGELOG.md has an `## [Unreleased]` section (`CHANGELOG.md:12`); the PR template's "changelog updated" checklist item is grounded in this. [VERIFIED: CHANGELOG.md:12]
- **Community docs pattern** — CONTRIBUTING.md, CODE_OF_CONDUCT.md, CHANGELOG.md, DISTRIBUTION.md are shipped via the `files` whitelist and linked from README; SECURITY.md follows the same pattern (D-05). [VERIFIED: package.json:76-85, README.md:224-228]
- **`.github/` currently contains only `workflows/ci.yml`** — no `ISSUE_TEMPLATE/` or `PULL_REQUEST_TEMPLATE` exists yet; the phase creates them. [VERIFIED: repo listing]
- **CONTRIBUTING.md has a "Reporting issues" section** (`CONTRIBUTING.md:111-114`) pointing to the GitHub issues tracker — the SECURITY.md and issue forms should be consistent with this existing channel. [VERIFIED: CONTRIBUTING.md:111-114]
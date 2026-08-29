# GSD-33-github-repo-config — RESEARCH.md

## Domain analysis

**What this phase does.** Phase 33 is a pure repo-configuration phase: it sets three GitHub repository-level settings on `jaaty/dsh-gsd-bundle` and adds a structural `node:test` that proves them. No bundle plugin or runtime code changes, no new dependencies, no README/CHANGELOG edits. The three settings are:

1. **Homepage URL** → `https://www.npmjs.com/package/@dsh-gsd/bundle` (D-01).
2. **Searchable topics** → `dsh, deepseek-harness, opengsd, gsd, git-ship-done, plugin, coding-agent` (D-02).
3. **Private vulnerability reporting** → enabled (D-03, deferred from phase 32).

All three are applied via the `gh` CLI (the project's existing git/gh tooling — `lib/ship.js` and `lib/map-codebase.js` already shell out to `gh`/`git`). The verification is a structural `node:test` that shells out to `gh` and asserts the configured values, mirroring the phase-32 `test/security-policy.test.mjs` pattern.

**The gh commands (all [VERIFIED] against the live `gh` CLI help and the GitHub OpenAPI).**

| Setting | Command | Source |
|---|---|---|
| Homepage | `gh repo edit --homepage https://www.npmjs.com/package/@dsh-gsd/bundle` | [VERIFIED: `gh repo edit --help` — `-h, --homepage URL`] |
| Topics (add) | `gh repo edit --add-topic dsh --add-topic deepseek-harness ...` (repeatable flag) | [VERIFIED: `gh repo edit --help` — `--add-topic strings`] |
| Private vuln reporting (enable) | `gh api -X PUT repos/jaaty/dsh-gsd-bundle/private-vulnerability-reporting -f enabled=true` | [VERIFIED: GitHub OpenAPI `api.github.com.json` — path `/repos/{owner}/{repo}/private-vulnerability-reporting` with methods `get`, `put`, `delete`] |
| Private vuln reporting (check) | `gh api repos/jaaty/dsh-gsd-bundle/private-vulnerability-reporting --jq .enabled` | [VERIFIED: same OpenAPI path, `get` returns `{"enabled": bool}`] |

**Critical caveat — `gh repo view` does NOT expose the private-vuln-reporting setting.** The `gh repo view --json` field list contains `isSecurityPolicyEnabled` and `securityPolicyUrl` but **no** private-vulnerability-reporting field [VERIFIED: `gh repo view --json` field enumeration]. The test must query that setting via `gh api .../private-vulnerability-reporting --jq .enabled`, not via `gh repo view`. This is a concrete correction to D-04's phrasing ("via `gh repo view`"), which the planner must encode.

**Current live repo state (verified this session):**
- `nameWithOwner: jaaty/dsh-gsd-bundle`, `url: https://github.com/jaaty/dsh-gsd-bundle` [VERIFIED: `gh repo view --json nameWithOwner,url`].
- `homepageUrl: ""` (empty — needs setting) [VERIFIED].
- `repositoryTopics: null` (empty — needs setting) [VERIFIED].
- `isPrivate: true`, `visibility: PRIVATE` — **the repo is currently PRIVATE** [VERIFIED: `gh repo view --json isPrivate,visibility`].
- `gh` authenticated as `jaaty` with `repo` scope (can edit repo settings and change visibility) [VERIFIED: `gh auth status`].

**The repo-visibility blocker (the central risk of this phase).** The CONTEXT.md states the repo is "public", but the live `gh` state is `PRIVATE`. This matters because **GitHub private vulnerability reporting is only available on public repositories** — the GitHub docs intro reads: *"Owners and administrators of public repositories can allow security researchers to report vulnerabilities securely in the repository by enabling private vulnerability reporting"* [CITED: https://docs.github.com/en/code-security/how-tos/report-and-fix-vulnerabilities/configure-vulnerability-reporting/configure-for-a-repository]. Consistent with this, the live `GET /repos/jaaty/dsh-gsd-bundle/private-vulnerability-reporting` returns **HTTP 404** [VERIFIED: `gh api` on the private repo]. So D-03 **cannot be satisfied while the repo is private**. The phase's entire purpose (public discoverability via topics + homepage + private vuln reporting) presupposes a public repo. See Open Question OQ-1.

**Confidence levels.**
- gh command flags for homepage/topics: **high** — verified against live `gh` help.
- Private-vuln-reporting endpoint (PUT/GET/DELETE): **high** — verified against the authoritative GitHub OpenAPI.
- Private-vuln-reporting is public-only: **high** — verified against GitHub docs + live 404 on the private repo.
- Repo is currently private: **high** — verified live twice this session.
- npm page URL `https://www.npmjs.com/package/@dsh-gsd/bundle`: **high** — matches the package name; npmjs.com returns 403 to curl (bot protection) but the URL is the canonical package page.

## Package legitimacy

**No new dependencies are required or proposed.** This phase adds zero runtime dependencies, consistent with the project's zero-runtime-dependency convention (`package.json:54`, `"dependencies": {}`). The only external tool used is the `gh` CLI, which is already a project dependency (used in `lib/ship.js` and `lib/map-codebase.js`) and is preinstalled + authenticated in GitHub Actions CI. The structural test uses only Node builtins (`node:test`, `node:assert/strict`, `node:child_process` `execFileSync`, `node:fs/promises`, `node:path`) — exactly the imports already used by `test/repo-hygiene.test.mjs` and `test/security-policy.test.mjs`. No package claims to verify.

## Risks and Open Questions

### OQ-1 — The repo is currently PRIVATE, but D-03 (private vuln reporting) requires a public repo. **(RESOLVED — with a required executor decision)**

**Finding [VERIFIED]:** `gh repo view --json isPrivate,visibility` returns `{"isPrivate":true,"visibility":"PRIVATE"}` for `jaaty/dsh-gsd-bundle` this session. The CONTEXT.md's "public" claim is stale. Private vulnerability reporting is only available on public repositories [CITED: GitHub docs], and the live `GET .../private-vulnerability-reporting` returns 404 on the private repo [VERIFIED].

**Resolution:** The plan MUST include a repo-visibility prerequisite step. Because the phase's stated purpose is public discoverability and D-03 is a public-repo-only setting, the executor should make the repo public as part of this phase:
```
gh repo edit --visibility public --accept-visibility-change-consequences
```
This is a visibility change (a significant, user-visible action) and is not explicitly listed in the CONTEXT scope edges, so the executor should confirm it is acceptable before running it — but it is the only way D-03 can pass. The structural test must also assert/verify visibility (e.g. `gh repo view --json isPrivate` must be `false`) so the private state fails loudly rather than silently. If the visibility change is not acceptable, D-03 must be re-deferred and the phase re-scoped — that is a user-owned decision the planner/executor must surface, not silently assume.

### OQ-2 — The test shells out to `gh`; how does it behave when `gh` is unavailable/unauthenticated or the repo is unreachable? **(RESOLVED)**

**Resolution:** Per D-04, the test must **fail loudly with the real cause**, never silently pass. The test should use `execFileSync("gh", [...])` (matching `test/repo-hygiene.test.mjs:34`) and, on a non-zero exit, throw an `Error` that includes the real `stderr` (e.g. `gh not authenticated: <stderr>` / `repo unreachable: <stderr>`). This matches the project's real-cause fail-fast convention (CONVENTIONS.md §Error Handling). In GitHub Actions CI, `gh` is preinstalled and authenticated via `GITHUB_TOKEN`, so the test runs there; the fail-loudly behavior is the safety net for any environment where `gh` is missing.

### OQ-3 — Where does the structural test live? **(RESOLVED — Claude's discretion)**

**Resolution:** A **new file `test/repo-config.test.mjs`**, mirroring `test/security-policy.test.mjs` (phase 32). Rationale: this phase asserts *repo-level settings* (via `gh`), a distinct concern from phase 32's *file-presence/content* assertions; a separate file keeps each structural test focused and matches the one-file-per-concern convention. It is picked up automatically by the `node --test test/*.test.mjs` glob (`package.json:31`).

### OQ-4 — Idempotency of the settings. **(RESOLVED)**

**Resolution:** `gh repo edit --add-topic` appends topics; `--homepage` sets the field; `PUT .../private-vulnerability-reporting` with `{"enabled": true}` is idempotent. Current state is empty (`repositoryTopics: null`, `homepageUrl: ""`), so no removal is needed. The executor should not use `--remove-topic` unless a stale topic is present. The test asserts the *resulting* state, so re-runs are safe.

## Architectural Responsibility Map

This phase has **no runtime code** — it is a repo-configuration + structural-test phase. The capability map is therefore about *where the work lives*, not plugin tiers:

| Capability | Tier | Notes |
|---|---|---|
| Set repo homepage URL | **Integration** (external GitHub via `gh`) | One-shot `gh repo edit --homepage`; no code. |
| Set repo topics | **Integration** (external GitHub via `gh`) | One-shot `gh repo edit --add-topic ...`; no code. |
| Enable private vuln reporting | **Integration** (external GitHub via `gh api`) | One-shot `gh api -X PUT .../private-vulnerability-reporting -f enabled=true`. |
| Make repo public (prerequisite) | **Integration** (external GitHub via `gh`) | `gh repo edit --visibility public --accept-visibility-change-consequences`; required for D-03. |
| Structural verification | **Data/Test** (test tier) | `test/repo-config.test.mjs` shells out to `gh` and asserts settings. |

No security-sensitive capability is placed in the wrong tier: the only security-adjacent action (enabling private vuln reporting) is a repo-level setting applied via the authenticated `gh` CLI, not embedded in runtime code. No tier misplacement.

## Validation Architecture

The automated proof is a single structural `node:test` file, `test/repo-config.test.mjs`, run by `npm test` (`node --test test/*.test.mjs`) and by the `prepublishOnly` gate (`package.json:32`). It proves REL-04 and every D-NN decision:

| Behaviour (requirement/decision) | Automated check |
|---|---|
| REL-04 / D-01 — homepage URL set | `gh repo view --json homepageUrl` → assert equals `https://www.npmjs.com/package/@dsh-gsd/bundle`. |
| REL-04 / D-02 — topics set | `gh repo view --json repositoryTopics` → assert the array contains all of `dsh, deepseek-harness, opengsd, gsd, git-ship-done, plugin, coding-agent`. |
| REL-04 / D-03 — private vuln reporting enabled | `gh api repos/jaaty/dsh-gsd-bundle/private-vulnerability-reporting --jq .enabled` → assert `true`. (NOT via `gh repo view` — that field does not exist.) |
| OQ-1 — repo is public (prerequisite) | `gh repo view --json isPrivate` → assert `false`. |
| D-04 — fail loudly with real cause | `execFileSync("gh", ...)` wrapped so a non-zero exit throws an `Error` carrying the real `stderr` (e.g. unauthenticated / unreachable). |

**Coverage gate note:** every decision D-01..D-05 and the REL-04 requirement maps to at least one assertion. D-05 (package.json homepage unchanged) is a *negative* invariant — the test should also assert `package.json.homepage` still equals `https://github.com/jaaty/dsh-gsd-bundle` (unchanged), so the "independent canonical URLs" decision is pinned. The test uses only Node builtins (no new dependency), matching the phase-32 pattern.

## Project Constraints (from project conventions)

- **Plain ESM, no build step, zero runtime dependencies** — the test must import only Node builtins (`node:test`, `node:assert/strict`, `node:child_process`, `node:fs/promises`, `node:path`), exactly as `test/security-policy.test.mjs` and `test/repo-hygiene.test.mjs` do. No new dependency. [VERIFIED: CONVENTIONS.md §Language & Module System; `package.json:54`]
- **Real-cause fail-fast** — the test must throw with the actual `gh` error (stderr) on failure, never silently pass. [VERIFIED: CONVENTIONS.md §Error Handling; D-04]
- **Test file conventions** — `.test.mjs` extension in `test/`, header comment `// <one-line role>`, `import { test } from "node:test"` + `import assert from "node:assert/strict"`, `ROOT` resolved via `new URL("../", import.meta.url).pathname`. [VERIFIED: CONVENTIONS.md §Naming Patterns; `test/security-policy.test.mjs:1-37`]
- **Shell-out pattern** — use `execFileSync` (not `execSync`) for gh/git calls, as `test/repo-hygiene.test.mjs:21,34` does. [VERIFIED]
- **No runtime code changes** — this phase touches only the repo settings and the new test file; no `lib/` plugin modules, no `cordis.patch.yml`, no `package.json` `homepage` field change (D-05). [VERIFIED: CONTEXT.md scope edges]
- **gh is the tool** — the project already shells out to `gh`/`git` (`lib/ship.js`, `lib/map-codebase.js`); this phase follows that established pattern. [VERIFIED: CONVENTIONS.md §Error Handling]
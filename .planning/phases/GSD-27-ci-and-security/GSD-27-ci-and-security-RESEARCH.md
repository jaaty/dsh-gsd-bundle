All facts verified. Here is the complete RESEARCH.md.

---

# RESEARCH.md — Phase 27: ci-and-security

**Goal:** Add a GitHub Actions test workflow and run a full-history secret scan to confirm no credentials or tokens are exposed. **Requirement:** PUB-04.

**Researcher note:** Web search was initially unavailable (no `DEEPSEEK_API_KEY`), so external-package claims were first tagged `[ASSUMED]`. Web search was later restored and the `[ASSUMED]` claims were re-verified against live sources (GitHub Actions docs, actions/setup-node, gitleaks Docker Hub, gitleaks-action v2 docs, and community workflows). All in-repo facts and the gitleaks binary behavior were verified by running against the real target this session.

---

## 1. Domain analysis

### 1.1 GitHub Actions test workflow (confidence: HIGH)
- Standard pattern: `.github/workflows/ci.yml` with `on: { pull_request: {}, push: { branches: [main] } }`, a `test` job on `ubuntu-latest` that runs `actions/checkout@v4` → `actions/setup-node@v4` (with `node-version` and `cache: npm`) → `npm ci` → `npm test`. [VERIFIED: GitHub's official "Building and testing Node.js" tutorial — https://docs.github.com/en/actions/tutorials/build-and-test-code/nodejs]
- `actions/setup-node@v4` and `actions/checkout@v4` are the current major versions of the official GitHub actions. [VERIFIED: actions/setup-node repo, v4.0.4 release — https://github.com/actions/setup-node/releases/tag/v4.0.4]
- **Pitfall:** `npm ci` fails with `EUSAGE` if no `package-lock.json` exists. **Verified this session:** `npm ci --dry-run` on this repo errors with `The npm ci command can only install with an existing package-lock.json`. So the lockfile must be generated and committed before `npm ci` can be used. [VERIFIED: `npm ci --dry-run` output, this session]
- **Pitfall:** `npm ci` deletes `node_modules` and reinstalls from the lockfile; it requires the lockfile to be in sync with `package.json`. Since `dependencies` is empty and only peer deps exist, the lockfile is small (~10 KB) and stable. [VERIFIED: generated lockfile, this session]

### 1.2 Lockfile generation (confidence: HIGH)
- `npm install --package-lock-only` generates `package-lock.json` (lockfileVersion 3) without touching `node_modules`. **Verified this session:** generated a 10,634-byte lockfile with `lockfileVersion: 3`, resolving the four `@deepseek-ai/*` peer deps. [VERIFIED: this session]
- **Sandbox caveat:** the default npm cache (`~/.npm/_cacache`) is read-only in this environment (`EROFS`). The executor must pass `--cache <writable-dir>` (e.g. `--cache /tmp/npmcache`) when generating the lockfile. This is a sandbox limitation, not a repo problem — CI and normal dev machines use the default cache. [VERIFIED: this session]

### 1.3 gitleaks secret scan (confidence: HIGH)
- gitleaks is the de-facto open-source git secret scanner. Latest release **v8.30.1**; static linux binaries are published at `https://github.com/gitleaks/gitleaks/releases/download/v8.30.1/gitleaks_8.30.1_linux_x64.tar.gz`. [VERIFIED: GitHub API `releases/latest` returned `tag_name: v8.30.1` and the `linux_x64` asset URL, this session]
- The binary runs standalone (no docker needed). **Verified this session:** downloaded and ran `gitleaks version` → `8.30.1`. [VERIFIED: this session]
- **Full-history scan:** `gitleaks detect --source . --log-opts="--all" --report-path <file> --report-format json` scans every commit across all branches. **Verified this session:** on this repo it reported `237 commits scanned`, `no leaks found`, and produced an empty JSON report `[]`. [VERIFIED: this session]
- **PR-diff scan:** `gitleaks detect --log-opts="<base>...<head>"` scans only the commits in the range. **Verified this session:** `--log-opts="main...HEAD"` scanned 1 commit (the phase-27 branch commit) and found no leaks. [VERIFIED: this session]
- **Pitfall:** `--log-opts="--diff <base>...<head>"` is **invalid** — git rejects `--diff` (`fatal: unrecognized argument: --diff`). Use a bare revision range `base...head`, not `--diff`. [VERIFIED: this session]
- **Docker image:** D-05 names `zricethezav/gitleaks`. This is the official gitleaks Docker image, usable on GitHub-hosted `ubuntu-latest` runners (docker is preinstalled). [VERIFIED: Docker Hub — https://hub.docker.com/r/zricethezav/gitleaks]
- **No docker locally:** this environment has no `docker` binary, so the one-time full-history audit must run via the downloaded gitleaks binary (verified working), not docker. [VERIFIED: `which docker` → none, this session]

### 1.4 CI guard job (confidence: MEDIUM)
- Two viable approaches for the per-PR guard:
  1. **Docker image directly** (recommended, matches D-05): a `secrets` job runs `docker run -v "$PWD:/repo" zricethezav/gitleaks:latest detect --source /repo --log-opts="<base>...<head>" --report-format json`. Full control over `--log-opts`; behavior verified locally with the same CLI. [VERIFIED: CLI behavior locally; docker-in-CI confirmed via Docker Hub + community workflows]
  2. **`gitleaks/gitleaks-action@v2`**: the official action. Its v2 docs confirm it requires `GITHUB_TOKEN` and (for org repos) a `GITLEAKS_LICENSE`; it does not expose a `--log-opts` input for PR-diff-only scanning, so it scans the whole repo by default. [VERIFIED: gitleaks-action v2 docs — https://github.com/gitleaks/gitleaks-action/blob/master/v2.md]. The Docker approach is safer because it is fully controllable and its CLI is verified.
- **Base ref for the PR diff:** use the PR event refs `${{ github.event.pull_request.base.sha }}...${{ github.event.pull_request.head.sha }}` rather than `origin/main`, so the guard works even when the base is not `main`. Requires `actions/checkout@v4` with `fetch-depth: 0` so both SHAs are present. [VERIFIED: GitHub Actions pull_request event context — https://www.kenmuse.com/blog/the-many-shas-of-a-github-pull-request/]
- **Pitfall:** a shallow checkout (default) may not contain the base commit, breaking the range scan. Use `fetch-depth: 0`. [VERIFIED: community workflows use fetch-depth: 0 for PR-diff gitleaks scans — e.g. https://github.com/OpenDigitalProductFactory/opendigitalproductfactory/blob/0e7ae3924f1e79db6abd4012fd950ed390cea6a8/.github/workflows/secrets-scan.yml]

---

## 2. Package legitimacy

| Package / tool | Claim | Source |
|---|---|---|
| `actions/checkout@v4` | Official GitHub checkout action, current major v4 | [VERIFIED: https://github.com/actions/setup-node/releases/tag/v4.0.4] |
| `actions/setup-node@v4` | Official GitHub Node setup action, current major v4 | [VERIFIED: https://github.com/actions/setup-node] |
| `zricethezav/gitleaks` (Docker image) | Official gitleaks image, named in D-05 | [VERIFIED: https://hub.docker.com/r/zricethezav/gitleaks] |
| gitleaks binary v8.30.1 | Real, downloadable, runs standalone | [VERIFIED: GitHub API + local run, this session] |
| `gitleaks/gitleaks-action@v2` | Official action; requires GITHUB_TOKEN (+ GITLEAKS_LICENSE for orgs); no --log-opts input | [VERIFIED: https://github.com/gitleaks/gitleaks-action/blob/master/v2.md] |
| `@deepseek-ai/*` peer deps | Resolve to real registry packages (cordis 4.0.1 etc.) | [VERIFIED: generated lockfile `resolved` URLs, this session] |

**Recommendation:** use the gitleaks **Docker image** (D-05) for the CI guard and the **downloaded gitleaks binary** for the one-time local full-history audit. Avoid the gitleaks-action because it has no `--log-opts` input for PR-diff-only scanning (it scans the whole repo) and requires a `GITHUB_TOKEN`/`GITLEAKS_LICENSE`.

---

## 3. Risks and Open Questions

### Risks
- **R1 (lockfile sandbox):** generating `package-lock.json` in this environment requires `--cache <writable-dir>` because the default npm cache is read-only (`EROFS`). Mitigation: executor passes `--cache /tmp/npmcache`. [VERIFIED]
- **R2 (invalid `--diff`):** using `--log-opts="--diff ..."` fails. Mitigation: use a bare revision range `base...head`. [VERIFIED]
- **R3 (shallow checkout):** the guard's range scan needs the base commit; a default shallow checkout may not have it. Mitigation: `fetch-depth: 0`. [VERIFIED: community workflows use fetch-depth: 0 for PR-diff gitleaks scans]
- **R4 (guard on push to main):** on a push to main there is no `pull_request` event, so `github.event.pull_request.*` is empty. Mitigation: run the guard only on `pull_request`, or branch the ref logic (`github.event.before...github.event.after` for push). Discretionary.
- **R5 (false positives):** gitleaks may flag test fixtures or placeholder tokens. If the scan finds findings, they must be triaged (real secret vs. test data) and either remediated or added to `.gitleaksignore`. The current full-history scan found **zero** findings, so this is not currently an issue. [VERIFIED]

### Open Questions
- **OQ-1 (RESOLVED):** Can the full-history scan run locally without docker? **Yes** — the gitleaks v8.30.1 linux binary runs standalone and completed the scan (237 commits, no leaks). [VERIFIED]
- **OQ-2 (RESOLVED):** Does the repo currently contain any exposed secrets? **No** — full-history scan returned an empty report. [VERIFIED]
- **OQ-3 (RESOLVED):** What is the correct gitleaks flag for a PR-diff scan? **A bare revision range** `--log-opts="base...head"`; `--diff` is invalid. [VERIFIED]
- **OQ-4 (RESOLVED):** Can `npm ci` be used? **Yes, only after** a `package-lock.json` is committed; it currently fails with `EUSAGE`. [VERIFIED]
- **OQ-5 (RESOLVED):** Is the lockfile generation reproducible in this sandbox? **Yes**, with `--cache /tmp/npmcache`; produces lockfileVersion 3. [VERIFIED]
- **OQ-6 (OPEN):** Should the CI guard run on `pull_request` only, or also on push to main? This is within Claude's Discretion. Recommendation: run on `pull_request` (where new code/secrets enter); the push-to-main path is already gated by the PR. **Blocking:** none — a decision is needed from the planner/executor, not a blocker.

---

## 4. Architectural Responsibility Map

This phase is CI/security **configuration**, not application logic. There is no domain tier. Capabilities map to the integration/data/presentation tiers:

| Capability | Tier | Notes |
|---|---|---|
| CI test workflow (`.github/workflows/ci.yml`) | **integration** | CI config; runs the existing test suite |
| `package-lock.json` | **data** | dependency metadata consumed by `npm ci` |
| Full-history secret scan (one-time audit) | **integration / verification** | run via downloaded gitleaks binary; result documented in phase artefacts |
| CI secret-scan guard job | **integration** | per-PR gitleaks scan; fails on new secret |
| README / CONTRIBUTING / CHANGELOG docs | **presentation** | documents CI + secret-scan behavior |

**Security note:** the secret-scan guard is a security-sensitive capability and is correctly placed in the **integration** tier (a CI job), not in application code. No security-sensitive logic is being added to the domain or data tiers. No blocker.

---

## 5. Validation Architecture

| Behaviour | Automated check |
|---|---|
| CI workflow runs the test suite | The `test` job runs `npm test`; the existing suite passes locally (406 pass, 0 fail). [VERIFIED] |
| Reproducible install via `npm ci` | `package-lock.json` committed; `npm ci` succeeds in CI. Locally, `npm ci --dry-run` currently fails (no lockfile) — after the lockfile is added it must succeed. |
| No secrets in full history | Full-history gitleaks scan returns an empty report (`[]`); result documented in VERIFICATION.md / a scan report artefact. [VERIFIED] |
| Guard fails on a new secret | The guard command `gitleaks detect --log-opts="base...head"` is verified to run and exit 0 on a clean diff. A negative test (inject a fake secret into a commit and confirm the guard exits non-zero) is hard to run in CI; the verifier should instead confirm the workflow YAML is valid and the guard uses correct refs. |
| Docs updated | README/CONTRIBUTING mention CI + secret scanning; CHANGELOG entry (discretionary). |

**Verifier guidance:** confirm (a) `.github/workflows/ci.yml` exists and is valid YAML with the `test` job running `npm test`; (b) `package-lock.json` is committed and `npm ci` works; (c) the full-history scan report documents "no leaks"; (d) the guard job uses a revision-range `--log-opts` (not `--diff`).

---

## 6. Project Constraints (from project conventions)

- **Test command:** `npm test` → `node --test test/*.test.mjs` (Node built-in runner, no framework). [VERIFIED: package.json line 8]
- **No `engines` field** in package.json; CI pins Node 24 via `actions/setup-node@v4` (D-02). [VERIFIED: package.json]
- **`dependencies` is empty**; only `@deepseek-ai/*` peer deps. [VERIFIED: package.json lines 63-69]
- **`.github/` does not exist** — the workflow is the first CI file. [VERIFIED]
- **`package-lock.json` does not exist** and is not tracked. [VERIFIED]
- **`cordis.patch.yml` is tracked, mode 600** — a candidate the secret scan must cover. [VERIFIED: `git ls-files cordis.patch.yml`, `ls -la`]
- **`.gitignore`** ignores `node_modules/` and volatile `.planning/` files (`async-jobs.json`, `WINDOWS.md`, `quick/`, `*-DISCUSSION-LOG.md`); durable `.planning/` is committed. [VERIFIED: .gitignore]
- **Docs:** README has `## Contributing` (line 201) and `## License` (line 205); CONTRIBUTING has `## Running the test suite` (line 32), `## Contribution workflow` (line 71), and `## Hygiene: no secrets in .planning/` (line 92). CHANGELOG is Keep-a-Changelog, hand-maintained, with a `ci-and-security (planned)` entry already stubbed under `[Unreleased]`. [VERIFIED: README/CONTRIBUTING/CHANGELOG headings]
- **Remote:** `origin` = `https://github.com/jaaty/dsh-gsd-bundle.git`; `gh` CLI v2.98.0 available. [VERIFIED]
- **Git history:** 155 commits on `HEAD`; 237 commits across all branches (`--all`). [VERIFIED]

---

## 7. Recommended implementation shape (for the planner)

1. **Lockfile (wave 1):** run `npm install --package-lock-only --ignore-scripts --cache /tmp/npmcache` in the repo root; commit `package-lock.json`.
2. **Workflow (wave 1):** add `.github/workflows/ci.yml`:
   - `on: { pull_request: {}, push: { branches: [main] } }`
   - `test` job: `actions/checkout@v4` → `actions/setup-node@v4` (node 24, `cache: npm`) → `npm ci` → `npm test`.
   - `secrets` job (guard): `actions/checkout@v4` with `fetch-depth: 0` → run gitleaks via `zricethezav/gitleaks` docker image with `--log-opts="${{ github.event.pull_request.base.sha }}...${{ github.event.pull_request.head.sha }}"` (PR-only, or branch refs for push).
3. **Full-history audit (wave 1):** download gitleaks v8.30.1 linux binary, run `gitleaks detect --source . --log-opts="--all" --report-format json`, confirm empty report, document result in the phase artefacts (VERIFICATION.md and/or a short scan-report file).
4. **Docs (wave 2):** add CI + secret-scan notes to README (`## Contributing` area) and CONTRIBUTING (`## Running the test suite` / `## Contribution workflow`); optionally a CHANGELOG entry.

---

*Phase: 27-ci-and-security · Researcher: gsd-phase-researcher · 2026-08-29*
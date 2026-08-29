I have all the facts I need. Here is the full RESEARCH.md.

---

# GSD-26-repo-hygiene — Research

**Phase goal:** Add a CHANGELOG, CONTRIBUTING.md, and code of conduct, and make and apply the `.planning/` directory keep-vs-gitignore-vs-curate decision.
**Requirements:** PUB-03.

---

## Domain analysis

### 1. CHANGELOG.md (D-01, D-02)
- **Keep-a-Changelog format** is the de-facto standard for hand-maintained changelogs. Its canonical structure is: a `# Changelog` title, a `## [Unreleased]` section at the top, then dated `## [<version>] - <YYYY-MM-DD>` sections, each with the change-type subsections `Added` / `Changed` / `Deprecated` / `Removed` / `Fixed` / `Security`. [CITED: https://keepachangelog.com/en/1.1.0/]
- **Pitfall:** Keep-a-Changelog's "Unreleased" section is the convention for work not yet tagged; the decision (D-01) mandates it plus entries for the two released milestones. [VERIFIED: CONTEXT.md D-01]
- **Pitfall:** the changelog must be hand-maintained going forward (D-01) — no generation tooling, so the file is plain Markdown with no tool-coupled syntax. [VERIFIED: CONTEXT.md D-01]
- **Milestone boundaries for the two entries** (verified from git tags and phase PRs this session):
  - **v1.7.0 = milestone `job-intel-multiwindow`** — phases 1–20 (PRs #1, #2, #4–#8, #10–#23): live-mount, service-tools, loop-e2e, checkpoint-resume, window-ledger, loop-robustness, uat-conversation, capability-gates, job-runtime, codebase-query, phase-dir-resolution, single-source-constants, gate-dispatch, execute-checkpoint, ship-robustness, context-budget, phase-branch-isolation, job-runtime-extensions, codebase-intel-extensions, multi-window-topology. [VERIFIED: `git tag -l` → `v1.7.0`; `git log v1.7.0` phase/merge PRs; release commit `4ff3957` "release milestone job-intel-multiwindow as v1.7.0"]
  - **v2.0.0 = milestone `graceful-removal`** — phases 21–24 (PRs #24–#27): capability-services, reactive-loop-rendering, removal-verification, composability-hardening. [VERIFIED: `git log v1.7.0..v2.0.0` phase/merge PRs; release commit `3179502` "release milestone graceful-removal as v2.0.0"]
  - **Current milestone `public-release-readiness` (v2.1.0)** — phases 25–28; phase 25 (license-and-attribution, PR #28) is shipped, phases 26–28 pending. The `[Unreleased]` section covers this in-progress work. [VERIFIED: ROADMAP.md lines 1, 31–34; `git log` PR #28]
- **Pitfall:** the v1.7.0 entry must not claim phases 21–24 (those belong to v2.0.0). The phase lists above are the authoritative boundary. [VERIFIED: git tag boundaries]
- **Pitfall:** CHANGELOG.md lives at the repo root and is linked from README (D-02). [VERIFIED: CONTEXT.md D-02]

### 2. CODE_OF_CONDUCT.md (D-03)
- **Contributor Covenant 2.1** is the most widely adopted code-of-conduct template (used by thousands of OSS projects). The canonical 2.1 text is a single Markdown file with sections: Pledge, Standards, Enforcement Responsibilities, Scope, Enforcement, Attribution. The attribution section names "Contributor Covenant 2.1" and links the canonical source. [CITED: https://www.contributor-covenant.org/version/2/1/code_of_conduct/code_of_conduct.md]
- **Pitfall:** the template's "Attribution" section must be preserved verbatim (it is part of the license terms of the template itself). [ASSUMED — standard practice; the template's own attribution clause]
- **Pitfall:** the placeholder fields in the template (e.g. `<project_name>`, `<community_contact>`) must be filled with the project's real values. [ASSUMED — standard practice]
- **Pitfall:** CODE_OF_CONDUCT.md sits at the repo root alongside LICENSE and NOTICE (phase 25 outputs). [VERIFIED: CONTEXT.md code_context; repo root listing this session]

### 3. CONTRIBUTING.md (D-04, D-05)
- **Full-depth CONTRIBUTING.md** (D-04) covers: development setup, how to run the test suite, the PR/contribution workflow, and a short explanation of the GSD phase loop. [VERIFIED: CONTEXT.md D-04]
- **Test command** is `npm test` → `node --test test/*.test.mjs`. [VERIFIED: package.json line 8]
- **PR workflow** is the GSD ship flow: each phase runs on a `phase-<N>` feature branch, `gsd_ship` runs capability gates (security, broken-windows, TDD-audit) and creates the PR via `gh`. [VERIFIED: README.md lines 26–31, 80–82; ROADMAP.md]
- **Hygiene rule (D-05):** CONTRIBUTING.md must state that no real credentials/tokens may be pasted into `.planning/` artefacts, because the durable subset is committed. [VERIFIED: CONTEXT.md D-05]
- **Pitfall:** the GSD-loop explanation must be accurate to this repo's actual loop (Discuss → Plan → Execute → Verify → Ship, with optional UI design), not a generic description. [VERIFIED: README.md lines 5–9]

### 4. `.planning/` curate decision (D-06, D-07, D-08)
- **The curate decision** keeps durable artefacts tracked and gitignores volatile churn. Durable: `PROJECT.md`, `REQUIREMENTS.md`, `ROADMAP.md`, `STATE.md`, `config.json`, `codebase/` map, and per-phase `CONTEXT`/`PLAN`/`SUMMARY`/`VERIFICATION`/`RESEARCH`. Volatile: `async-jobs.json`, `WINDOWS.md`, `quick/` records, `DISCUSSION-LOG.md`. [VERIFIED: CONTEXT.md D-06]
- **CRITICAL PITFALL — gitignore does NOT untrack already-tracked files.** The volatile files are currently **tracked** in git (verified this session via `git ls-files .planning/`): `.planning/WINDOWS.md`, `.planning/async-jobs.json`, `.planning/quick/*/TASK.md`, and every `.planning/phases/*/*-DISCUSSION-LOG.md`. Adding `.gitignore` entries alone will NOT stop them being committed — the executor must also `git rm --cached` each already-tracked volatile path (keeping the working-tree file, so the GSD tools' write behaviour is unchanged, per D-07). [VERIFIED: `git ls-files .planning/` this session; gitignore semantics]
- **D-07 nuance:** the decision says "no changes to the GSD tools' write behaviour are required (gitignore affects tracking, not writing)". This is correct about the *tools* — but applying the decision to already-tracked files still requires a one-time `git rm --cached` (a git operation, not a tool change). The planner must include this. [VERIFIED: CONTEXT.md D-07; git ls-files]
- **Pitfall:** `git rm --cached` must be used (not `git rm`), so the files remain on disk for the tools to keep writing. [ASSUMED — standard git semantics]
- **Pitfall:** the `.gitignore` entries must be precise. The volatile paths are: `.planning/async-jobs.json`, `.planning/WINDOWS.md`, `.planning/quick/`, and `.planning/phases/*/*-DISCUSSION-LOG.md`. The per-phase DISCUSSION-LOG glob must not accidentally match the durable `-CONTEXT.md` / `-RESEARCH.md` / `-PLAN.md` / `-SUMMARY.md` / `-VERIFICATION.md` files. [VERIFIED: CONTEXT.md D-06; git ls-files naming pattern]
- **Pitfall:** the curate decision does NOT affect npm publishing — package.json `files` already excludes `.planning/` entirely (lines 52–57). [VERIFIED: package.json lines 52–57; CONTEXT.md code_context]
- **D-08:** the curate decision is documented in README's `.planning/ artefacts` section (line ~146) so it is discoverable. [VERIFIED: CONTEXT.md D-08; README.md line 146]

### 5. README links (D-09)
- README gains links to CHANGELOG.md, CONTRIBUTING.md, and CODE_OF_CONDUCT.md. [VERIFIED: CONTEXT.md D-09]
- The README already has a `## License` section (line 199) and a `.planning/ artefacts` section (line 146) — the new links and the curate-decision note extend these. [VERIFIED: README.md lines 146, 199]

### 6. No new dependencies
- This phase is pure file additions/edits (CHANGELOG.md, CONTRIBUTING.md, CODE_OF_CONDUCT.md, README edit, .gitignore edit, `git rm --cached`). No runtime or dev dependency is introduced. [ASSUMED — scope of the phase]

---

## Package legitimacy

No new packages are proposed. The only external references are documentation templates, not installed dependencies:

- **Keep-a-Changelog** — a documentation convention, not a package. Canonical spec at keepachangelog.com. [CITED: https://keepachangelog.com/en/1.1.0/]
- **Contributor Covenant 2.1** — a code-of-conduct template, not a package. Canonical 2.1 text at contributor-covenant.org. [CITED: https://www.contributor-covenant.org/version/2/1/code_of_conduct/code_of_conduct.md]
- **opengsd-core** — the upstream project this bundle reimplements; already attributed in NOTICE (phase 25). Not installed as a dependency. [VERIFIED: NOTICE read this session]

No package legitimacy concerns apply.

---

## Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| `.gitignore` entries added but volatile files stay tracked (gitignore does not untrack) | **High** | Executor must `git rm --cached` each already-tracked volatile path (`.planning/WINDOWS.md`, `.planning/async-jobs.json`, `.planning/quick/`, `.planning/phases/*/*-DISCUSSION-LOG.md`) in addition to adding `.gitignore` entries. |
| `git rm` (not `--cached`) deletes the volatile files from disk, breaking the GSD tools that keep writing them | High | Use `git rm --cached` only; verify the files remain on disk after the operation. |
| DISCUSSION-LOG glob accidentally matches durable per-phase files | Medium | Use the exact glob `.planning/phases/*/*-DISCUSSION-LOG.md`; verify durable `-CONTEXT/-RESEARCH/-PLAN/-SUMMARY/-VERIFICATION` files remain tracked. |
| CHANGELOG v1.7.0 entry claims phases 21–24 (wrong milestone boundary) | Medium | Use the verified boundaries: v1.7.0 = phases 1–20, v2.0.0 = phases 21–24. |
| Contributor Covenant template's attribution clause stripped | Low | Preserve the template's "Attribution" section verbatim. |
| CONTRIBUTING.md GSD-loop explanation diverges from the real loop | Low | Mirror README's actual loop (Discuss → Plan → Execute → Verify → Ship, optional UI design). |
| README links added but the curate-decision note omitted | Low | D-08 mandates the note in the `.planning/ artefacts` section; D-09 mandates the three links. |

---

## Open Questions

- **Q1 (RESOLVED):** Do the volatile `.planning/` files need `git rm --cached`, or do `.gitignore` entries suffice? → `.gitignore` entries alone are insufficient because the volatile files are already tracked (`git ls-files .planning/` confirms `WINDOWS.md`, `async-jobs.json`, `quick/`, and per-phase `DISCUSSION-LOG.md` are tracked). The executor must `git rm --cached` them (keeping files on disk) plus add `.gitignore` entries. [VERIFIED: git ls-files this session; gitignore semantics]
- **Q2 (RESOLVED):** What are the exact milestone boundaries for the CHANGELOG v1.7.0 and v2.0.0 entries? → v1.7.0 (`job-intel-multiwindow`) = phases 1–20; v2.0.0 (`graceful-removal`) = phases 21–24. [VERIFIED: git tags + phase/merge PR logs this session]
- **Q3 (RESOLVED):** Does the curate decision affect npm publishing? → No — package.json `files` already excludes `.planning/` entirely. [VERIFIED: package.json lines 52–57]
- **Q4 (RESOLVED):** Where do the three new files live? → Repo root (CHANGELOG.md, CONTRIBUTING.md, CODE_OF_CONDUCT.md), alongside LICENSE and NOTICE. [VERIFIED: CONTEXT.md D-02/D-03; repo root listing]
- **Q5 (RESOLVED):** Which README sections get the new links and the curate note? → Links in/near the `## License` section (line 199) or a new "Contributing" area; the curate note in the `.planning/ artefacts` section (line 146). Exact placement is Claude's Discretion. [VERIFIED: CONTEXT.md D-08/D-09; README.md lines 146, 199]

No open questions remain.

---

## Architectural Responsibility Map

This phase is entirely **presentation/documentation** tier — no domain, data, or integration code changes.

| Capability | Tier | Notes |
|------------|------|-------|
| CHANGELOG.md (D-01, D-02) | presentation (repo metadata) | Repo-root file; hand-maintained Keep-a-Changelog. |
| CODE_OF_CONDUCT.md (D-03) | presentation (repo metadata) | Repo-root file; Contributor Covenant 2.1. |
| CONTRIBUTING.md (D-04, D-05) | presentation (docs) | Repo-root file; setup + tests + PR workflow + GSD loop + hygiene rule. |
| `.gitignore` curate entries (D-06, D-07) | presentation (repo config) | Add volatile-path entries; `git rm --cached` already-tracked volatile files. |
| README links + curate note (D-08, D-09) | presentation (docs) | Extend `.planning/ artefacts` and License sections. |
| Verification test | domain (test) | A `node --test` test asserting file existence + consistency. |

No security-sensitive capability is placed in the wrong tier. No tier assignment is a blocker.

---

## Validation Architecture

Automated checks (run via `npm test`, i.e. `node --test test/*.test.mjs`), following the existing `test/license.test.mjs` pattern (reads repo files from `ROOT = new URL("../", import.meta.url).pathname`):

1. **CHANGELOG.md exists and is Keep-a-Changelog** — assert `CHANGELOG.md` exists at repo root, contains `# Changelog`, an `## [Unreleased]` section, and `## [2.0.0]` and `## [1.7.0]` sections. Proves D-01/D-02.
2. **CODE_OF_CONDUCT.md exists and is Contributor Covenant 2.1** — assert the file exists and contains `Contributor Covenant` and `2.1`. Proves D-03.
3. **CONTRIBUTING.md exists and is full-depth** — assert the file exists and mentions the test command (`node --test`), a PR/contribution workflow, and the GSD phase loop; assert it contains the no-credentials hygiene rule (D-05). Proves D-04/D-05.
4. **README links all three files** — assert README contains `CHANGELOG.md`, `CONTRIBUTING.md`, and `CODE_OF_CONDUCT.md` links. Proves D-09.
5. **README documents the curate decision** — assert README's `.planning/ artefacts` section mentions the keep-durable/gitignore-volatile rule. Proves D-08.
6. **Volatile files are untracked** — assert `git ls-files` does NOT list `.planning/WINDOWS.md`, `.planning/async-jobs.json`, `.planning/quick/`, or any `*-DISCUSSION-LOG.md`, while durable files (`.planning/STATE.md`, `.planning/ROADMAP.md`, a `-CONTEXT.md`) remain tracked. Proves D-06/D-07. (This test may shell out to `git ls-files`; the existing suite already shells out for git assertions in `test/phase-tools-git.test.mjs`.)

Test style follows the existing suite: `node:test` + `node:assert/strict`, files named `test/*.test.mjs`. [VERIFIED: test/ dir contents and license.test.mjs read this session]

---

## Project Constraints

- Test command is `npm test` → `node --test test/*.test.mjs`. [VERIFIED: package.json line 8]
- Tests use `node:test` with `assert/strict`; helpers live in `test/helpers/`. [VERIFIED: test/helpers/ and license.test.mjs]
- The phase runs on feature branch `phase-26` (current branch). [VERIFIED: `git branch --show-current` → `phase-26`]
- `.gitignore` currently contains only `node_modules/` (line 1) — the curate entries are added to it. [VERIFIED: .gitignore read this session]
- The volatile `.planning/` files are currently tracked and must be `git rm --cached` (not deleted) as part of applying the curate decision. [VERIFIED: git ls-files .planning/ this session]
- package.json `files` excludes `.planning/` entirely — the curate decision does not affect npm publishing. [VERIFIED: package.json lines 52–57]
- CHANGELOG.md, CONTRIBUTING.md, and CODE_OF_CONDUCT.md sit at the repo root alongside LICENSE and NOTICE (phase 25 outputs). [VERIFIED: repo root listing this session]
- Do NOT change the GSD tools' write behaviour (D-07) — the curate decision is applied via `.gitignore` + `git rm --cached` only. [VERIFIED: CONTEXT.md D-07]
- Do NOT retroactively rewrite existing `.planning/` artefacts (out of scope). [VERIFIED: CONTEXT.md domain]
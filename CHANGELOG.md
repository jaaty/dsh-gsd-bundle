# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [3.0.0] - 2026-09-04

### Added

- **Milestone `upstream-parity`** — brings the bundle to full parity with upstream opengsd-core's phase loop and step surface. Version bumped to 3.0.0.
  - **spec-phase** (PR #36): a spec step that produces a SPEC.md with falsifiable requirements gated by an ambiguity-scoring score.
  - **gap-analysis** (PR #40): a post-planning coverage tool emitting a REQ-ID/D-ID vs plan-body coverage table.
  - **code-review** (PR #41): a review pass producing REVIEW.md with severity-classified findings and a --fix companion.
  - **ui-review** (PR #42): a retroactive 6-pillar UI audit producing UI-REVIEW.md.
  - **validate-phase** (PR #43): a retro audit mapping executed work to tests and producing tests to close validation gaps.
  - **undo** (PR #44): a safe rollback path with dependency checks and a confirmation gate.
  - **health** (PR #45): a .planning/ integrity diagnostic with non-destructive repair.
  - **milestone-audit** (PR #46): milestone close-gate and cross-phase UAT audits.
  - **learnings** (PR #51): cross-phase learnings extraction.
  - **graphify** (PR #52): a project knowledge graph.
  - **mempalace** (PR #55): cross-session memory capture/recall.
  - **assumption-delta** (PR #53): assumption-delta detection.
  - **pause-resume-work** (PR #56): structured context handoff + resume.
  - **autonomous** (PR #57): an autonomous path driving remaining phases end-to-end.
  - **add-tests** (PR #59): a test generator creating unit and E2E tests for a completed phase.
  - **drop-clean-branch** (PR #54): gsd_ship now pushes and PRs the phase-NN branch directly (one branch per phase).

## [2.2.0] - 2026-08-29

### Added

- **Milestone `public-launch`** — makes the bundle publish-ready for npm: version bumped to 2.2.0, full npm metadata (repository, homepage, bugs, keywords, engines, author) added to the manifest, and the files whitelist expanded to ship every README-linked documentation file.
  - **publishable-package** (PR #33): bumped the package to `2.2.0` (package.json + package-lock.json), added the missing npm metadata fields (`repository`, `homepage`, `bugs`, `keywords`, `engines`, `author`), and expanded the `files` whitelist to ship `DISTRIBUTION.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, and `CHANGELOG.md` alongside the existing lib/ and docs entries.

## [2.1.0] - 2026-08-29

### Added

- **Milestone `public-release-readiness`** — hardens the GSD bundle for public release: licensing and attribution, repository hygiene, CI and security, distribution research, and a deterministic pre-ship verification gate.
  - **license-and-attribution** (PR #28): added an MIT `LICENSE`, verified opengsd-core attribution and license compliance in `NOTICE`, and fixed the broken `gsd-core-reference.md` reference in the README.
  - **repo-hygiene** (PR #29): added `CHANGELOG.md`, `CONTRIBUTING.md`, and `CODE_OF_CONDUCT.md`, and applied the `.planning/` keep-vs-gitignore-vs-curate decision.
  - **ci-and-security** (PR #30): added a GitHub Actions test workflow (`.github/workflows/ci.yml`) running the suite on pull requests and push to `main`, committed a `package-lock.json` for reproducible `npm ci` installs, ran a full-history gitleaks secret scan confirming no credentials or tokens are exposed, and added a lightweight gitleaks CI guard that fails a PR if a new secret is introduced.
  - **publish-research** (PR #31): research-backed distribution decision for the bundle.
  - **pre-ship-verify** (PR #32): added a new deterministic pre-ship verification gate in `gsd_ship` that runs `npm ci` + `npm test` before shipping, skippable via a flag.

## [2.0.0] - 2026-08-28

### Added

- **Milestone `graceful-removal`** — proves the whole GSD plugin bundle is swappable and customizable; every step plugin can be retired and the loop keeps working.
  - **capability-services**: each step plugin publishes a capability service declaring the loop step it provides; the persona and slash-command layer declare coeffects on the capabilities they need.
  - **reactive-loop-rendering**: the persona, runtime-context snapshot, and `gsd_status` re-render from the available step capabilities, so absent steps are skipped and no missing tool is ever instructed.
  - **removal-verification**: an automated per-plugin removal test proving every single step plugin can be retired with its effects reverted and the remaining loop still functional end-to-end.
  - **composability-hardening**: the background-job live registry is effect-scoped to its owning fiber so unload/HMR cancels running jobs, and the subagents coeffect is declared in every consuming plugin so temporal and spatial composability hold for the job runtime and subagent paths.

## [1.7.0] - 2026-08-28

### Added

- **Milestone `job-intel-multiwindow`** — the full GSD phase loop plus checkpoint-resume, the multi-window ledger and async-jobs manifest, the conversational UAT loop, capability gates, the real background-job runtime, codebase-query intel mode, and multi-window topology.
  - **live-mount**: mount the bundle into a DSH profile and verify all 12 plugin rows activate and the patch merges cleanly over `dsh-base`.
  - **service-tools**: prove the `gsdState` service round-trips `.planning/` artefacts and every `gsd_*` phase tool registers with a valid schema.
  - **loop-e2e**: run one full phase through the loop (Discuss → Plan → Execute → Verify → Ship) in a live session and capture the produced PR.
  - **checkpoint-resume**: implement checkpoint state capture + resume in `gsd_execute` so an interrupted phase can be resumed from the last checkpoint.
  - **window-ledger**: add the `WINDOWS.md` multi-window ledger and an `async-jobs.json` manifest, surfaced through `gsd_status`.
  - **loop-robustness**: fix the planner `depends_on` project-code-prefix bug and route `gsd_quick`'s `TASK.md` write through the gsd artefact model.
  - **uat-conversation**: implement the conversational UAT loop — an executor stopping at a `checkpoint:decision` / `checkpoint:human-action` task surfaces a human-facing question, and `gsd_execute` pauses, waits, and resumes the checkpointed plan with that answer applied.
  - **capability-gates**: implement the capability-gate gatekeeper in `gsd_ship` — security, broken-windows, TDD-audit — with per-gate pass/fail reporting and refusal to ship on a required-gate failure.
  - **job-runtime**: implement a real background-job runtime that executes jobs asynchronously, tracks lifecycle in the async-jobs manifest, and reflects real async state through `gsd_status`.
  - **codebase-query**: implement a query/intel mode for the codebase mapper — a `gsd_map_codebase --query` path that answers a question against the existing `.planning/codebase/` map without a full re-scan.
  - **phase-dir-resolution**: resolve the phase directory and base once per tool invocation and pass them down, removing repeated `readRoadmap`/`readConfig` and duplicated base derivation.
  - **single-source-constants**: make `GATE_NAMES` and the secret-file list single-source and route `cwdOf` through the shared helper.
  - **gate-dispatch**: replace the gate name condition chain with an explicit dispatcher map and derive the commit scope from structured plan fields.
  - **execute-checkpoint**: extract the checkpoint prepare/process logic in `gsd_execute` into helpers and reuse the planIndex runnable set.
  - **ship-robustness**: make git/gh calls async and report preflight failures with their real cause.
  - **context-budget**: give `planningContext` a total truncation budget and surface truncation, plus small dedup fixes.
  - **phase-branch-isolation**: acquire a per-phase feature branch at `gsd_discuss` and have each phase tool commit its planning artefacts, so `gsd_ship` preflight passes on a clean feature branch.
  - **job-runtime-extensions**: extend the background-job runtime to launch subagent jobs, enforce timeouts/cancellation, expose a `gsd_job` launch tool, and support retry/queueing.
  - **codebase-intel-extensions**: extend `gsd_map_codebase` with drift detection, targeted re-map/updater, a structured answer object, and subtree query scoping.
  - **multi-window-topology**: support concurrent multi-window phases on a shared base branch with a merge topology, earlier phase-branch push, and auto-commit of out-of-flow artefacts.

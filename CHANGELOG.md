# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Milestone `public-release-readiness` (v2.1.0)** — the current in-progress milestone.
  - **license-and-attribution** (shipped): added an MIT `LICENSE`, verified opengsd-core attribution and license compliance in `NOTICE`, and fixed the broken `gsd-core-reference.md` reference in the README.
  - **repo-hygiene** (in progress): added `CHANGELOG.md`, `CONTRIBUTING.md`, and `CODE_OF_CONDUCT.md`, and applied the `.planning/` keep-vs-gitignore-vs-curate decision.
  - **ci-and-security** (planned): a GitHub Actions test workflow and a full-history secret scan.
  - **publish-research** (planned): research-backed distribution decision for the bundle.

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

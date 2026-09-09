# dsh-gsd-bundle
[![CI](https://github.com/jaaty/dsh-gsd-bundle/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/jaaty/dsh-gsd-bundle/actions/workflows/ci.yml) [![License](https://img.shields.io/github/license/jaaty/dsh-gsd-bundle?style=flat-square)](https://github.com/jaaty/dsh-gsd-bundle/blob/main/LICENSE) [![npm version](https://img.shields.io/badge/npm-v3.1.0-blue?style=flat-square)](https://www.npmjs.com/package/@dsh-gsd/bundle)

A **plugin bundle for [DeepSeek Harness](https://github.com/deepseek-ai/dsh)** (dsh) that reimplements [opengsd-core](https://github.com/open-gsd/gsd-core) — **Git Ship Done (GSD)** — as a set of host-plane Cordis plugins. It replaces the default agent-loop behaviour with the GSD phase loop, so every session becomes a disciplined, artefact-driven engineering loop.

```
Spec → Discuss → (UI design, optional) → Plan → Execute → Verify → Ship
```

Every unit of work is a **phase** that moves through these steps in order, wrapped by advisory soft gates (gap-analysis after Plan, code-review and UI-review after Execute, validate before Ship). State survives across sessions and context resets on disk under `.planning/`, with `STATE.md` as the navigation spine. Heavy work (research, planning, execution, verification, review) runs in **fresh-context subagents** spawned by the orchestrator, so the main session stays lean.

## Release status

**Milestone `core-loop-helpers` v3.1 is complete and released as `v3.1.0`** — this final 8-phase delta (phases 52–59) completes the bundle's parity with upstream opengsd-core's command surface: phase management, smart entry, freeform routing, quick batching, fast mode, MVP scoping, bounded node repair, and the rebuilt code-review fix companion. It follows the v3.0 `upstream-parity` milestone, which brought the full upstream step surface (spec, gap-analysis, code-review, UI-review, validate, undo, health, milestone-audit, learnings, graphify, mempalace, assumption-delta, pause/resume-work, autonomous, add-tests, and the direct phase-branch clean-PR model). The earlier v2.2 `public-launch`, v2.1 `public-release-readiness`, v2.0 `graceful-removal`, and v1.7 `job-intel-multiwindow` milestones remain prior releases. The surface today: **28 Cordis plugin rows** (1 override + 27 inserts), **37 `gsd_*` tools**, and **34 `/gsd-*` commands** — all proven by the mount and per-plugin removal suites.

### v3.1 release note — core-loop-helpers

The v3.1 milestone adds eight core-loop helper commands, completing the phase-loop tooling surface. It delivered:

- **Phase-management** — `gsd_phase` (`/gsd-phase-manage`): add, insert, remove, reorder, and edit phases directly in `ROADMAP.md` with validation and integrity checks; `ROADMAP.md`, its `## Progress` table, and `STATE.md` progress stay consistent and commit atomically.
- **Smart-entry** — `gsd_next` (`/gsd-next`): detect the current project state and route to the best next action, with an auto-advance option.
- **Freeform-routing** — `gsd_route` (`/gsd-route`): parse a plain-English intent and dispatch it to the most appropriate GSD command — recommend-only; never auto-runs.
- **Quick-batch** — `gsd_quick_batch` (`/gsd-quick-batch`): run multiple quick tasks in a single batch with per-task results and failure isolation.
- **Fast-mode** — `gsd_fast_mode` (`/gsd-fast-mode`): a lightweight single-pass fast path (auto-derive CONTEXT → execute → summary → verify → ship) for simple phases.
- **MVP-phase** — `gsd_mvp_phase` (`/gsd-mvp-phase`): an interactive propose-then-confirm scoping flow that produces a real `PLAN.md` and delegates to the normal loop; refuses completed phases and never auto-retries on failure.
- **Node-repair** — `gsd_repair` (`/gsd-repair`): bounded automatic recovery for a phase whose verification returned gaps — up to 2 rounds of `gsd_plan --gaps` → `gsd_execute --gaps-only` → `gsd_verify --gaps`, stopping with clear causes; writes `<NN>-REPAIR.md`.
- **Review-fix-companion** — the `gsd_code_review --fix` companion rebuilt on a bounded anchor-edit contract: per-fix atomic commits with real commit hashes, skip-and-continue fault isolation, a `node --check` parse gate before write, and `REVIEW-FIX.md` reporting that works in live sessions.

### v3.0 release note — upstream-parity

The v3.0 milestone brings the bundle to full parity with upstream opengsd-core's phase loop and step surface. It delivered:

- **Spec-phase** — `gsd_spec_phase`: a spec step that produces a `SPEC.md` with falsifiable Current/Target/Acceptance requirements, gated by an ambiguity-scoring score (≤ 0.20 across four weighted clarity dimensions).
- **Gap-analysis** — `gsd_gap_analysis`: a post-planning coverage tool emitting a deterministic REQ-ID/D-ID vs plan-body coverage table (`<NN>-COVERAGE.md`).
- **Code-review** — `gsd_code_review`: a post-execute review pass producing `REVIEW.md` with severity-classified findings (BLOCKER/WARNING/INFO).
- **UI-review** — `gsd_ui_review`: a retroactive 6-pillar UI audit producing `UI-REVIEW.md` (overall /24).
- **Validate-phase** — `gsd_validate_phase`: a retro audit mapping each phase requirement to the test infra, classifying COVERED/PARTIAL/MISSING/Manual-Only (`<NN>-VALIDATION.md`).
- **Undo** — `gsd_undo`: a safe rollback path via `git revert` with dependency checks and a dry-run-by-default confirmation gate.
- **Health** — `gsd_health`: a `.planning/` integrity diagnostic (phase/plan numbering, orphan SUMMARYs, STATE/ROADMAP disagreement) with non-destructive config-only repair.
- **Milestone-audit** — `gsd_milestone_audit`: the milestone close-gate aggregating per-phase verifications, plus a cross-phase UAT outstanding-items list.
- **Learnings** — `gsd_extract_learnings`: cross-phase learnings extraction into a carrying-forward `.planning/LEARNINGS.md`.
- **Graphify** — `gsd_graphify`: a project knowledge graph in `.planning/graphs/` with build/query/status modes.
- **Mempalace** — cross-session memory capture/recall (see [Mempalace](#mempalace-cross-session-memory)).
- **Assumption-delta** — an advisory architecture checkpoint wired into `gsd_plan` (`plan:pre`): when a phase makes something plural/optional/chosen that used to be singular/required/derived, it surfaces one identity-model question (promote vs add-alongside). Gated by `workflow.assumption_delta`; a pure deterministic scan, never an LLM judgment.
- **Pause-resume-work** — `gsd_pause_work` / `gsd_resume_work`: a structured mid-phase context handoff (`HANDOFF.json` + a `.continue-here.md` pointer, committed as a WIP commit) and its resume counterpart.
- **Autonomous** — `gsd_autonomous`: drives every remaining incomplete phase of the active milestone end-to-end (discuss → plan → execute → verify per phase) without per-phase manual prompting; stops on a hard failure, never ships.
- **Add-tests** — `gsd_add_tests`: a test generator creating Unit/Integration tests for a completed phase from its SUMMARY/CONTEXT/VERIFICATION and implementation, committed atomically (`<NN>-ATEST.md`).
- **Drop-clean-branch** — `gsd_ship` now pushes and PRs the phase-`<NN>` branch directly (one branch per phase); no separate clean review branch is built.

### v2.2 release note — public-launch

The v2.2 milestone makes the GSD bundle **publish-ready for npm** and surfaces its health at a glance. It delivered:

- **Provenance/health badge row** — the README now carries a single-line row of three clickable badges directly under the H1: the whole CI workflow status, the MIT license, and an npm-version badge statically pinned to the released version.
- **Repo discoverability** — repository topics and the `homepage` are configured so the package is findable on GitHub and the npm registry.
- **README-linked documentation shipped** — the npm `files` whitelist was expanded to ship `DISTRIBUTION.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, and `CHANGELOG.md` in the package.
- **Security + contribution surface** — a `SECURITY.md` and GitHub issue/PR templates were added so the repo is ready for external contributors.
- **Released as `v2.2.0`** — the `@dsh-gsd/bundle` package is published with full npm metadata (repository, homepage, bugs, keywords, engines, author).

### v2.1 release note — public-release-readiness

The v2.1 milestone hardens the GSD bundle for public release — licensing and attribution, repository hygiene, CI and security, distribution research, and a deterministic pre-ship verification gate. It delivered:

- **License-and-attribution** — added an MIT `LICENSE`, verified opengsd-core attribution and license compliance in `NOTICE`, and fixed the broken opengsd-core reference in the README.
- **Repo-hygiene** — added `CHANGELOG.md`, `CONTRIBUTING.md`, and `CODE_OF_CONDUCT.md`, and applied the `.planning/` keep-vs-gitignore-vs-curate decision.
- **Ci-and-security** — added a GitHub Actions test workflow (`.github/workflows/ci.yml`) running the suite on pull requests and push to `main`, committed a `package-lock.json` for reproducible `npm ci` installs, and added a gitleaks secret-scan guard that fails a PR if a new secret is introduced.
- **Publish-research** — a research-backed distribution decision for the bundle, recorded in `DISTRIBUTION.md`.
- **Pre-ship-verify** — a new deterministic pre-ship verification gate in `gsd_ship` that runs `npm ci` + `npm test` in a temp copy of the repo before pushing, skippable via a flag.

### v2.0 release note — graceful-removal

The v2.0 milestone proves the whole GSD plugin bundle is **swappable and customizable** — every step plugin can be retired and the loop keeps working. It delivered:

- **Capability-services** — each step plugin publishes a capability service declaring the loop step it provides; the persona and slash-command layer declare coeffects on the capabilities they need.
- **Reactive-loop-rendering** — the persona, runtime-context snapshot, and `gsd_status` re-render from the available step capabilities, so absent steps are skipped and no missing tool is ever instructed.
- **Removal-verification** — an automated per-plugin removal test proving every single step plugin can be retired with its effects reverted and the remaining loop still functional end-to-end.
- **Composability-hardening** — the background-job live registry is effect-scoped to its owning fiber so unload/HMR cancels running jobs, and the subagents coeffect is declared in every consuming plugin so temporal and spatial composability hold for the job runtime and subagent paths.

## Features

**The phase loop, as model-facing tools:**

- **Spec → Discuss → (UI) → Plan → Execute → Verify → Ship** — every step is a tool: `gsd_spec_phase` (optional falsifiable SPEC.md), `gsd_discuss` (CONTEXT.md), `gsd_ui_phase` (UI-SPEC.md), `gsd_plan` (researcher → planner → plan-checker, dependency waves), `gsd_execute` (fresh-context executors, atomic commits, checkpoint-resume), `gsd_verify` (VERIFICATION.md + status routing), `gsd_ship` (preflight, capability gates, pre-ship-verify, PR).
- **Advisory soft gates around the loop** — `gsd_gap_analysis` (post-plan coverage table), `gsd_code_review` (REVIEW.md, with an optional `--fix` companion that applies findings as per-fix atomic commits into REVIEW-FIX.md), `gsd_ui_review` (6-pillar UI audit), `gsd_validate_phase` (requirement→test coverage audit). Each is gated by its own `workflow.*` config flag and never blocks the next loop step.
- **Bounded auto-recovery** — `gsd_repair` runs up to 2 rounds of plan(gaps) → execute(gaps-only) → verify(gaps) for a phase whose verification found gaps, stopping with clear causes on anything it cannot recover from.
- **Autonomous path** — `gsd_autonomous` drives all remaining incomplete phases of the active milestone end-to-end (auto-deriving CONTEXT when absent) and reports a per-phase STATUS; it stops on a hard failure, never ships, and never runs milestone lifecycle.
- **Orientation helpers** — `gsd_init`, `gsd_status`, `gsd_progress`, `gsd_next` (state detection + next-action routing, with auto-advance), `gsd_route` (recommend-only plain-English intent dispatch), `gsd_progress`, and `gsd_new_milestone`.
- **Sub-threshold quick path** — `gsd_quick` for single-turn tasks, plus `gsd_quick_batch` for many with failure isolation, `gsd_fast_mode` for simple phases, and `gsd_mvp_phase` for propose-then-confirm minimal-viable scoping.
- **Phase management + out-of-band tools** — `gsd_phase` (add/insert/remove/reorder/edit phases with ROADMAP/STATE integrity checks), `gsd_undo` (git-revert rollback with dependency checks), `gsd_health` (`.planning/` integrity diagnostic), `gsd_pause_work` / `gsd_resume_work` (mid-phase handoff + resume), and `gsd_intel_updater` (targeted codebase-map re-map of drifted paths).

**Milestone close-out and memory:**

- **Milestone-audit, learnings, graphify** — `gsd_milestone_audit` (close-gate audit report), `gsd_extract_learnings` (carrying-forward `LEARNINGS.md`), and `gsd_graphify` (a project knowledge graph in `.planning/graphs/` with build/query/status).
- **Mempalace** — opt-in cross-session memory: deliberate recall before discuss/plan (`MEMORY-RECALL.md`) and verbatim artifact capture at phase boundaries, through an injectable CLI seam.
- **Add-tests** — `gsd_add_tests` generates unit/integration tests for a completed phase from its artifacts and commits them atomically.
- **Assumption-delta checkpoint** — a rarely-firing advisory identity-model question surfaced by `gsd_plan` when a phase generalizes a previously singular/required/derived concept.

**Platform properties (carried from earlier milestones):**

- **A durable `.planning/` artefact model** — `PROJECT.md`, `ROADMAP.md`, `REQUIREMENTS.md`, `STATE.md`, `config.json`, per-phase artefacts, milestone audit reports, the codebase map, and the knowledge graph (see the full tree below).
- **Checkpoint-resume & conversational UAT** — an interrupted `gsd_execute` resumes from its last checkpoint; a `checkpoint:decision` / `checkpoint:human-action` task surfaces a human-facing question and the plan resumes with the answer applied.
- **Capability gates & pre-ship-verify** — `gsd_ship` runs the security / broken-windows / TDD-audit gates (with a `skip_gates` escape hatch) and a deterministic `npm ci` + `npm test` verification in a temp copy of the repo before pushing.
- **Real background-job runtime** — `gsd_job` launches shell/subagent jobs with timeouts, cancellation, and retry; lifecycle is tracked in the `async-jobs.json` manifest and reflected through `gsd_status`.
- **Window ledger** — a root-level `WINDOWS.md` multi-window ledger, surfaced through `gsd_status`.
- **Brownfield codebase mapping** — `gsd_map_codebase` analyses an existing codebase with parallel fresh-context mappers (7 documents), answers `--query` questions against the map, detects drift, and re-maps targeted paths via `gsd_intel_updater`.
- **Capability-services & reactive rendering** — every step plugin publishes a capability service; the persona, runtime-context snapshot, and `gsd_status` re-render from the available capabilities, so a retired or replaced step is simply skipped.
- **Swappable & customizable** — an automated per-plugin removal suite proves every step plugin can be retired with its effects reverted and the loop still functional end-to-end.
- **Two driving UXes** — natural language (the persona makes the agent a GSD driver) and the `/gsd-*` slash-command layer.

## Prerequisites

- **DeepSeek Harness (dsh)** with the `dsh` CLI available on `PATH`.
- **Node.js ≥ 20** (declared via the package's `engines` field).
- A **git** repository for the project you want to drive with GSD (the loop commits atomically and ships PRs via the `gh` CLI).
- The **GitHub CLI (`gh`)** installed and authenticated if you want `gsd_ship` to create pull requests.

## Install

See [DISTRIBUTION.md](DISTRIBUTION.md) for the research-backed distribution decision.

Add the bundle to a dsh profile (it layers after `dsh-base`). The **primary** install path is the npm registry:

```sh
dsh plugin --profile <name> add @dsh-gsd/bundle
dsh --profile <name> web   # or tui / headless
```

### Alternative — install from source

If you prefer a local/git checkout over the registry package, clone this repo and point `dsh plugin add` at the checkout path (pnpm resolves the local spec the same way it resolves the registry name):

```sh
git clone https://github.com/jaaty/dsh-gsd-bundle.git
dsh plugin --profile <name> add <path-to-this-bundle>
dsh --profile <name> web   # or tui / headless
```

The bundle's `cordis.patch.yml` overrides the host `agent-loop` row to configure a `gsd` agent and inserts the 27 GSD plugin rows. CLI profiles get the `gsd` startup agent; web sessions are created on demand and inherit the GSD persona + tools.

**About the peer dependencies:** `@deepseek-ai/dsh-tools` and `@deepseek-ai/dsh-llm` are imported directly by the bundle's modules. `@deepseek-ai/schemastery` and `@deepseek-ai/cordis` are **host-contract peers** — no module imports them; they are declared so npm installs a compatible host runtime, and the host supplies them via the injected `ctx` (tools/provide/get) at runtime. Both declarations are intentional.

## Quickstart

In a session on a profile with the bundle mounted:

1. **Bootstrap** — `gsd_init` to create the `.planning/` project (name, milestone, requirements, ordered phases).
2. **Orient** — `gsd_status` (or `gsd_next` / `/gsd-next`) to see where the loop stands and what to do next.
3. **Run the loop** — `gsd_spec_phase` (optional) → `gsd_discuss` → (optional `gsd_ui_phase`) → `gsd_plan` → `gsd_execute` → `gsd_verify` → `gsd_ship`, with the advisory soft gates (`gsd_gap_analysis`, `gsd_code_review`, `gsd_ui_review`, `gsd_validate_phase`) between steps when you want them.

Or just say *"let's build X with GSD"* — the persona already makes the agent a GSD phase-loop driver, pausing at decision points. You can also drive individual steps directly: *"plan phase 1"*, *"execute phase 1"*, *"verify phase 1"* — or let `gsd_route` recommend the right command for a plain-English intent.

## The `gsd_*` tools

All tools are registered by the bundle's plugins and available to the model in any session on a mounted profile (37 tools across 27 plugins, proven by the mount test).

**Orientation & entry (`gsd-core-tools`)**

| Tool | Purpose |
|---|---|
| `gsd_init` | Bootstrap a `.planning/` project (name, milestone, requirements, phases). |
| `gsd_status` | Read `STATE.md` + `ROADMAP.md`; surface the loop position, windows, and async jobs. |
| `gsd_progress` | Per-phase plan completion counts and next recommended action. |
| `gsd_new_milestone` | Start a new milestone and append its phases to `ROADMAP.md`. |
| `gsd_next` | Detect the current project state and route to the best next action, with auto-advance. |
| `gsd_route` | Parse a plain-English intent and dispatch it to the most appropriate GSD command (recommend-only). |
| `gsd_pause_work` | Pause mid-phase: write `HANDOFF.json` + a `.continue-here.md` pointer as a WIP commit. |
| `gsd_resume_work` | Resume from `HANDOFF.json` (or detect incomplete work) with a full status + next action. |
| `gsd_job` | Launch and manage background shell/subagent jobs (status, cancel, retry). |

**Loop steps**

| Tool | Plugin | Purpose |
|---|---|---|
| `gsd_spec_phase` | `gsd-spec` | Produce a falsifiable `SPEC.md` (Current/Target/Acceptance) gated by an ambiguity score ≤ 0.20. |
| `gsd_discuss` | `gsd-discuss` | Seal the phase's HOW decisions into `CONTEXT.md` (7 blocks, D-NN decisions, canonical refs). |
| `gsd_ui_phase` | `gsd-ui` | Produce a `UI-SPEC.md` design contract for a phase with a visual component. |
| `gsd_plan` | `gsd-plan` | Research + decompose into bounded `PLAN.md` files in dependency waves (researcher → planner → plan-checker). |
| `gsd_execute` | `gsd-execute` | Run the plans wave by wave with fresh-context executors, atomic commits, checkpoint-resume, conversational UAT. |
| `gsd_verify` | `gsd-verify` | Verify the goal was actually achieved; write `VERIFICATION.md` and route on its status. |
| `gsd_ship` | `gsd-ship` | Preflight + capability gates + pre-ship-verify, push the branch, create the PR, mark the phase shipped. |

**Advisory soft gates**

| Tool | Plugin | Purpose |
|---|---|---|
| `gsd_gap_analysis` | `gsd-gap-analysis` | Deterministic REQ-ID/D-ID vs plan-body coverage table (`<NN>-COVERAGE.md`), run after `gsd_plan`. |
| `gsd_code_review` | `gsd-code-review` | Fresh-context review producing `REVIEW.md` (BLOCKER/WARNING/INFO); `fix: true` applies findings as per-fix atomic commits into `REVIEW-FIX.md`. |
| `gsd_ui_review` | `gsd-ui-review` | Retroactive 6-pillar UI audit producing `UI-REVIEW.md` (overall /24). |
| `gsd_validate_phase` | `gsd-validate-phase` | Requirement→test coverage audit (COVERED/PARTIAL/MISSING/Manual-Only) writing `<NN>-VALIDATION.md`. |

**Repair & orchestration**

| Tool | Plugin | Purpose |
|---|---|---|
| `gsd_repair` | `gsd-repair` | Bounded (≤ 2 round) automatic recovery: `gsd_plan --gaps` → `gsd_execute --gaps-only` → `gsd_verify --gaps`. |
| `gsd_autonomous` | `gsd-autonomous` | Drive all remaining incomplete phases end-to-end; stops on a hard failure, never ships. |

**Out-of-band & close-out**

| Tool | Plugin | Purpose |
|---|---|---|
| `gsd_phase` | `gsd-phase-management` | Add/insert/remove/reorder/edit phases in `ROADMAP.md` with validation; ROADMAP + STATE stay consistent. |
| `gsd_undo` | `gsd-undo` | Roll back a phase's or plan's commits via `git revert`; dry-run by default, dependency-checked. |
| `gsd_health` | `gsd-health` | `.planning/` integrity diagnostic (dry-run by default) with non-destructive config-only repair. |
| `gsd_milestone_audit` | `gsd-milestone-audit` | Milestone close-gate aggregating per-phase verifications + cross-phase UAT outstanding items. |
| `gsd_extract_learnings` | `gsd-learnings` | Extract decisions/lessons/patterns into a per-phase `<NN>-LEARNINGS.md` + carrying-forward `LEARNINGS.md`. |
| `gsd_graphify` | `gsd-graphify` | Build/query/inspect a project knowledge graph in `.planning/graphs/`. |
| `gsd_add_tests` | `gsd-add-tests` | Generate unit/integration tests for a completed phase and commit them atomically. |

**Onboarding, quick work & memory**

| Tool | Plugin | Purpose |
|---|---|---|
| `gsd_map_codebase` | `gsd-map-codebase` | Map an existing codebase with parallel fresh-context mappers → `.planning/codebase/` (7 docs); also answers `--query` questions. |
| `gsd_intel_updater` | `gsd-map-codebase` | Targeted re-map of drifted map paths (auto-detected or explicit). |
| `gsd_quick` | `gsd-quick` | Sub-threshold lightweight path for work too small to warrant the full loop. |
| `gsd_quick_batch` | `gsd-quick` | Run multiple quick tasks in one batch with per-task results and failure isolation. |
| `gsd_fast_mode` | `gsd-quick` | Lightweight single-pass fast path for a simple phase. |
| `gsd_mvp_phase` | `gsd-quick` | Propose-then-confirm minimal-viable-phase scoping, then delegate to the normal loop. |
| `gsd_mempalace_recall` | `gsd-mempalace` | Deliberate recall before discuss/plan — produces `MEMORY-RECALL.md` from the MemPalace CLI. |
| `gsd_mempalace_capture` | `gsd-mempalace` | Files CONTEXT/PLAN/SUMMARY verbatim into the palace at phase boundaries. |

## Slash-commands

The `gsd-commands` plugin registers the `/gsd-*` commands as thin routers — each injects a user message telling the agent to run the matching tool, then returns a short ack:

| Command | Tool |
|---|---|
| `/gsd-init [brief]` | `gsd_init` |
| `/gsd-status` | `gsd_status` |
| `/gsd-progress [phase]` | `gsd_progress` |
| `/gsd-next` | `gsd_next` |
| `/gsd-route <intent>` | `gsd_route` |
| `/gsd-pause-work` | `gsd_pause_work` |
| `/gsd-resume-work` | `gsd_resume_work` |
| `/gsd-spec-phase <N> [--auto]` | `gsd_spec_phase` |
| `/gsd-discuss-phase <N>` | `gsd_discuss` |
| `/gsd-ui-phase <N>` | `gsd_ui_phase` |
| `/gsd-plan-phase <N>` | `gsd_plan` |
| `/gsd-gap-analysis <N>` | `gsd_gap_analysis` |
| `/gsd-execute-phase <N> [--wave N] [--gaps-only]` | `gsd_execute` |
| `/gsd-code-review <N>` | `gsd_code_review` |
| `/gsd-ui-review <N> [--mode=re-audit\|view]` | `gsd_ui_review` |
| `/gsd-verify-work <N>` | `gsd_verify` |
| `/gsd-validate-phase <N> [--auto]` | `gsd_validate_phase` |
| `/gsd-undo <N> [plan <PP>] [--confirm]` | `gsd_undo` |
| `/gsd-health <N> [--repair]` | `gsd_health` |
| `/gsd-ship <N>` | `gsd_ship` |
| `/gsd-quick <task>` | `gsd_quick` |
| `/gsd-quick-batch <task1> \| <task2> \| ...` | `gsd_quick_batch` |
| `/gsd-fast-mode <N>` | `gsd_fast_mode` |
| `/gsd-mvp-phase <N>` | `gsd_mvp_phase` |
| `/gsd-repair <N> [--rounds 1\|2]` | `gsd_repair` |
| `/gsd-autonomous` | `gsd_autonomous` |
| `/gsd-add-tests <N>` | `gsd_add_tests` |
| `/gsd-phase-manage add\|insert\|remove\|reorder\|edit ...` | `gsd_phase` |
| `/gsd-map-codebase [--fast [--focus tech\|arch\|quality\|concerns\|tech+arch]] [--paths p1,p2]` | `gsd_map_codebase` |
| `/gsd-extract-learnings <N> [--force]` | `gsd_extract_learnings` |
| `/gsd-graphify build\|status\|query <term>` | `gsd_graphify` |
| `/gsd-mempalace-recall <N>` | `gsd_mempalace_recall` |
| `/gsd-mempalace-capture <N> <CONTEXT\|PLAN\|SUMMARY>` | `gsd_mempalace_capture` |
| `/gsd-new-milestone <name> <version>` | `gsd_new_milestone` |

e.g. `/gsd-plan-phase 1` routes to `gsd_plan`; `/gsd-ship 2 --draft` routes to `gsd_ship`; `/gsd-next` tells you the best next action at any point.

## Mempalace (cross-session memory)

The `gsd-mempalace` plugin adds a cross-session memory integration that performs **deliberate recall** before discuss/plan and **verbatim capture** at phase boundaries, talking to the external [MemPalace](https://mempalaceofficial.com) service through an injectable CLI exec seam. It is an **advisory soft gate**: it never advances STATE and never blocks a loop step — every auto-hook is `onError: skip`, so an unreachable palace writes a stub and the loop continues.

Two tools:

- **`gsd_mempalace_recall({ phase })`** — performs deliberate recall (wake-up + search via the MemPalace CLI) and writes `MEMORY-RECALL.md` in the phase directory with Prior decisions / Patterns / Surprises sections, each item carrying provenance. When the CLI is unreachable, it writes an 'unavailable' stub naming the native fallback and continues.
- **`gsd_mempalace_capture({ phase, artifact })`** — files the named artifact (CONTEXT/PLAN/SUMMARY) **verbatim** into the appropriate palace room (decisions/planning/milestones) via staging + `mempalace mine`. Capture is idempotent (content-hash dedup) and never writes lossy summaries.

Auto-hooks are wired into the loop tools, gated by `mempalace.enabled` and the relevant sub-key: recall at `discuss:pre` / `plan:pre`, capture at `discuss:post` / `plan:post` / `verify:post` / `ship:post`. The standalone tools remain for manual invocation.

### Config surface

Opt-in via `mempalace.enabled` in `config.json` (default `false` — the loop is unchanged when unset):

| Key | Default | Meaning |
|---|---|---|
| `mempalace.enabled` | `false` | Master opt-in gate for the whole plugin. |
| `mempalace.memory_mode` | `"augment"` | Recall mode. `augment` is fully implemented: the palace is an **additive** recall layer alongside native memory (`.planning/graphs/`, `LEARNINGS.md`, STATE), which stays authoritative. `kg_backend` and `replace` are accepted in config but treated as additive this phase. |
| `mempalace.wing` | `""` | The MemPalace wing to recall from / mine into. Falls back to `project_code`, then the repo directory name. |
| `mempalace.recall_on_discuss` | `true` | Fire recall at `discuss:pre`. |
| `mempalace.recall_on_plan` | `true` | Fire recall at `plan:pre`. |
| `mempalace.capture_artifacts` | `true` | Fire capture at phase boundaries. |
| `mempalace.mirror_kg` | `true` | Whether to mirror knowledge-graph facts. **Note:** KG mirroring requires MCP (`mempalace_kg_add`) — unavailable in this CLI-only bundle; `mirror_kg` is config-accepted but the actual KG write is a documented no-op until a later MCP-capable phase. |

## How it works

### What "replace the default agent loop plugin" means

The mechanical turn machine in `@deepseek-ai/dsh-agent-loop` (tool scheduling, context assembly, session preparation) **stays** — that is DeepSeek Harness's core runtime, and a session cannot run without it. The bundle replaces the agent loop's *behaviour*:

- `cordis.patch.yml` overrides the host `agent-loop` row's `config` (last-write-wins per row), replacing `agents: []` with a configured **`gsd`** agent.
- `gsd-persona` installs opengsd's phase-loop mental model as the system-prompt section every session reads (order -100, before the deployment persona) and a runtime-context contribution that orients every model step at the current `STATE.md` position.
- The `gsd_*` phase tools are the loop steps.

### Plugins

All plugins are subpath exports of this one package (`@dsh-gsd/bundle/<name>`), the same pattern the shipped presets use (e.g. `@deepseek-ai/dsh-tool-subagent-control/list-agents`). The table lists the 27 inserted rows in patch order (the 28th row is the `agent-loop` override).

| Row | Subpath | Provides / registers |
|---|---|---|
| `gsd-persona` | `./persona` | `systemPrompt` section `gsd:persona` + context `gsd:state` |
| `gsd-state` | `./state` | the `gsdState` host service — `.planning/` artefact + STATE.md/ROADMAP.md/REQUIREMENTS.md manager, WINDOWS.md ledger, async-jobs manifest |
| `gsd-core-tools` | `./core-tools` | `gsd_init`, `gsd_status`, `gsd_progress`, `gsd_new_milestone`, `gsd_next`, `gsd_route`, `gsd_pause_work`, `gsd_resume_work`, `gsd_job` |
| `gsd-discuss` | `./discuss` | `gsd_discuss` — seals `CONTEXT.md` (7 blocks, D-NN decisions, canonical_refs) |
| `gsd-spec` | `./spec` | `gsd_spec_phase` — falsifiable `SPEC.md`, ambiguity-score gate |
| `gsd-plan` | `./plan` | `gsd_plan` — researcher → planner → plan-checker fresh-context subagents, 3-iteration revision loop; wires the assumption-delta `plan:pre` checkpoint |
| `gsd-gap-analysis` | `./gap-analysis` | `gsd_gap_analysis` — deterministic REQ-ID/D-ID vs plan coverage table |
| `gsd-execute` | `./execute` | `gsd_execute` — wave-based fresh-context executors, atomic commits, checkpoint-resume, conversational UAT |
| `gsd-code-review` | `./code-review` | `gsd_code_review` — `REVIEW.md` findings + the `--fix` anchor-edit companion |
| `gsd-ui-review` | `./ui-review` | `gsd_ui_review` — 6-pillar UI audit → `UI-REVIEW.md` |
| `gsd-verify` | `./verify` | `gsd_verify` — verifier subagent → `VERIFICATION.md`, status decision tree routing |
| `gsd-validate-phase` | `./validate` | `gsd_validate_phase` — requirement→test coverage audit → `VALIDATION.md` |
| `gsd-undo` | `./undo` | `gsd_undo` — git-revert rollback, dry-run by default |
| `gsd-health` | `./health` | `gsd_health` — `.planning/` integrity diagnostic + non-destructive repair |
| `gsd-phase-management` | `./phase-management` | `gsd_phase` — ROADMAP phase CRUD with integrity checks |
| `gsd-milestone-audit` | `./milestone-audit` | `gsd_milestone_audit` — milestone close-gate audit |
| `gsd-learnings` | `./learnings` | `gsd_extract_learnings` — carrying-forward `LEARNINGS.md` |
| `gsd-graphify` | `./graphify` | `gsd_graphify` — project knowledge graph |
| `gsd-mempalace` | `./mempalace` | `gsd_mempalace_recall` / `gsd_mempalace_capture` — cross-session memory |
| `gsd-autonomous` | `./autonomous` | `gsd_autonomous` — drives remaining phases end-to-end |
| `gsd-add-tests` | `./add-tests` | `gsd_add_tests` — test generator for a completed phase |
| `gsd-repair` | `./repair` | `gsd_repair` — bounded auto-recovery rounds |
| `gsd-ship` | `./ship` | `gsd_ship` — preflight + capability gates + pre-ship-verify, PR body assembly, `gh pr create`, STATE update |
| `gsd-ui` | `./ui` | `gsd_ui_phase` — `UI-SPEC.md` (ui-researcher + ui-checker) |
| `gsd-quick` | `./quick` | `gsd_quick`, `gsd_quick_batch`, `gsd_fast_mode`, `gsd_mvp_phase` — sub-threshold + lightweight paths → `.planning/quick/` |
| `gsd-map-codebase` | `./map-codebase` | `gsd_map_codebase` (map + `--query` intel) and `gsd_intel_updater` — parallel mappers → `.planning/codebase/` (7 docs) |
| `gsd-commands` | `./commands` | the `/gsd-*` slash-commands — thin routers that inject a user message telling the agent to run the matching tool |

### Extending the bundle

You're encouraged to **author your own plugins** for your bundle and swap them in/out as you see fit. Each plugin is a subpath export of the package (`@dsh-gsd/bundle/<name>`) that publishes a capability service and registers its tools/commands via `apply(ctx)`. To add or replace a step:

1. Write a plugin module following the same pattern — a `name`, an `inject` coeffect list, and an `apply(ctx)` that registers tools and publishes a capability.
2. Add it as a row in your `cordis.patch.yml`, or override an existing row's `name` to point at your module.
3. Because the persona, runtime-context snapshot, and `gsd_status` render reactively from the available capabilities, a retired or replaced step is simply skipped — the remaining loop keeps working.

The automated per-plugin removal suite proves this: every step plugin can be retired with its effects reverted and the loop still functional end-to-end.

### `.planning/` artefacts (faithful to opengsd-core)

```
.planning/
├── PROJECT.md
├── ROADMAP.md            milestone + phase table (#, Phase, Goal, Requirements)
├── REQUIREMENTS.md      numbered acceptance criteria (REQ-IDs)
├── STATE.md             YAML frontmatter (machine) + Markdown body (human), <100 lines
├── config.json          workflow + model configuration
├── LEARNINGS.md         carrying-forward decisions/lessons/patterns (gsd_extract_learnings)
├── WINDOWS.md           root-level multi-window ledger (append-only; gitignored)
├── async-jobs.json      background-job manifest (running → done/failed; gitignored)
├── HANDOFF.json         pause/resume handoff (gsd_pause_work / gsd_resume_work)
├── codebase/            brownfield codebase map (written by gsd_map_codebase, pre-init)
│   ├── STACK.md                  technology stack
│   ├── INTEGRATIONS.md           external services & data storage
│   ├── ARCHITECTURE.md           system overview, layers, data flow
│   ├── STRUCTURE.md              directory layout, "where to add new code"
│   ├── CONVENTIONS.md            coding & naming patterns
│   ├── TESTING.md                test framework & patterns
│   └── CONCERNS.md               tech debt, bugs, fragility, coverage gaps
├── graphs/              project knowledge graph (gsd_graphify): graph.json + GRAPH_REPORT.md
├── milestones/<name>-AUDIT.md   milestone close-gate audit reports (gsd_milestone_audit)
└── phases/<NN>-<slug>/
    ├── <NN>-CONTEXT.md          7 blocks: domain, decisions (D-NN), canonical_refs, code_context, specifics, deferred
    ├── <NN>-SPEC.md             falsifiable requirements + ambiguity score (optional, gsd_spec_phase)
    ├── <NN>-RESEARCH.md         domain analysis, package legitimacy, risks, open questions, responsibility map, validation architecture; provenance tags
    ├── <NN>-<PP>-PLAN.md        YAML frontmatter (phase, plan, type, wave, depends_on, files_modified, autonomous, requirements, must_haves) + <objective>/<context>/<tasks> body
    ├── <NN>-<PP>-CHECKPOINT.md  persisted checkpoint state for resume (last_completed_task, decision_id, human_answer)
    ├── <NN>-<PP>-SUMMARY.md     execution record (status: complete)
    ├── <NN>-COVERAGE.md         post-planning REQ-ID/D-ID vs plan coverage table (gsd_gap_analysis)
    ├── <NN>-REVIEW.md           code-review findings (BLOCKER/WARNING/INFO) — with <NN>-REVIEW-FIX.md from the --fix companion
    ├── <NN>-UI-REVIEW.md        6-pillar UI audit scores + findings (gsd_ui_review)
    ├── <NN>-VERIFICATION.md     frontmatter (status: passed|gaps_found|human_needed, score, gaps, human_verification)
    ├── <NN>-VALIDATION.md       requirement→test coverage classification (gsd_validate_phase)
    ├── <NN>-ATEST.md            add-tests generator record (gsd_add_tests)
    ├── <NN>-REPAIR.md           bounded auto-recovery record (gsd_repair)
    ├── <NN>-UNDO.md             rollback record (gsd_undo)
    ├── <NN>-HEALTH.md           .planning/ integrity diagnostic (gsd_health)
    ├── <NN>-MEMORY-RECALL.md    MemPalace recall session (opt-in)
    ├── <NN>-UAT.md              persistent UAT session state
    └── <NN>-UI-SPEC.md          UI design contract (optional)
```

`<NN>` = zero-padded phase number; `<PP>` = zero-padded plan number within the phase. `STATE.md` frontmatter carries `gsd_state_version`, `milestone`, `status`, `active_phase`, `next_action`, `progress`, and session-continuity fields, matching the opengsd schema.

**Curate, don't commit everything.** The durable artefacts the GSD loop needs to orient — `PROJECT.md`, `REQUIREMENTS.md`, `ROADMAP.md`, `STATE.md`, `config.json`, the `codebase/` map, and the per-phase `CONTEXT` / `RESEARCH` / `PLAN` / `SUMMARY` / `VERIFICATION` documents — are tracked in git. The volatile churn — `async-jobs.json`, `WINDOWS.md`, `quick/` records, and the per-phase `DISCUSSION-LOG.md` files — is gitignored (see `.gitignore`). These volatile files stay on disk (the GSD tools keep writing them) but are not committed. Because the durable subset is committed, never paste real credentials or tokens into `.planning/` artefacts.

### Fresh-context subagents

Research, planning, execution, verification, review, and test-generation run as one-shot fresh-context subagents spawned through the host `subagents` service's in-process `spawn` provider (`ctx.subagents.start('spawn', { prompt, parent, signal })`) — exactly opengsd's fresh-context model. The role prompts (researcher, planner, plan-checker, executor, verifier, ui-researcher, ui-checker, codebase-mapper, code-reviewer, ui-auditor, add-tests-writer) are condensed faithfully from opengsd's `agents/*.md`: role, tools, inputs, outputs, the planner's goal-backward `must_haves`, the plan-checker's 12 dimensions and adversarial FORCE stance, the executor's atomic-commit + worktree discipline, the verifier's "do not trust SUMMARY.md" escalation gate with the 3-value status decision tree, and the codebase-mapper's focus→document templates with the forbidden-secrets rule.

## Faithfulness and scope

This is a faithful reimplementation of opengsd-core's **phase loop and artefact schemas**, not a port of its CLI (`gsd_run`) or its full capability/gate ecosystem. Deliberate simplifications:

- **No per-plan git worktrees.** Executors run on the shared working tree. The plan-checker's same-wave non-overlap guarantee (Dimension 3) makes the shared tree safe; the post-merge regression gate becomes a per-wave test run rather than a worktree merge.

### Clean-PR branch

`gsd_ship` pushes and PRs the phase-`<N>` branch directly — one branch per phase. The PR head is the current phase-`<N>` branch (no separate clean review branch is built or pushed), and the completion-state commit lands on phase-`<N>` and is pushed there only. The user squash-merges PRs, which already produces one clean commit on `main`.

- **`gsd_run` is not wrapped.** The opengsd CLI query/check/state commands are reimplemented as in-process `gsdState` service methods (no separate `gsd_run` process).
- **Capability gates** are implemented as a focused set — `security`, `broken_windows`, `tdd_audit` — run by `gsd_ship` before PR creation, with per-gate pass/fail reporting and a `skip_gates` escape hatch. The broader opengsd gate ecosystem (e.g. `ui.safety-gate`) is not ported.
- **`gsd_map_codebase` `--query` intel mode** is implemented (the `intel.enabled` capability ecosystem — drift detection via the `.map-manifest.json`, the `gsd_intel_updater` targeted re-map, a structured answer object, and subtree `queryScope` scoping). The full parallel map, `--fast` single-focus scan, and `--paths` incremental-remap scoping are all implemented; the existing-check's interactive refresh/update/skip choice is surfaced as `force` / `paths` parameters (a tool cannot hold a multi-turn interview).
- Slash-command-style flags (`--gaps`, `--tdd`, `--mvp`, `--no-tracer`, `--granularity`, `--wave`, `--gaps-only`, `--auto`, `--confirm`, `--repair`, `--rounds`, `--force`) are exposed as tool parameters and command-line flags on the `/gsd-*` routers.
- **The bundle is deliberately swappable and customizable.** Every step plugin publishes a capability service and the persona / runtime-context / `gsd_status` render reactively from the available capabilities, so any step plugin can be retired (or replaced) and the remaining loop stays functional — proven by the automated per-plugin removal suite. This is a design property, not a limitation.

The reference used to build this is the [opengsd-core](https://github.com/open-gsd/gsd-core) repository.

## Status

**Milestone `core-loop-helpers` v3.1.0 is complete and released** — all 59 phases across five milestones are shipped (v1.7 `job-intel-multiwindow`, v2.0 `graceful-removal`, v2.1 `public-release-readiness`, v2.2 `public-launch`, v3.0 `upstream-parity`, plus the eight v3.1 helper-command phases). The mount suite proves all 28 Cordis rows (1 override + 27 inserts) activate in patch order with **37 tools / 34 commands / 28 capability services** registered with valid schemas; the removal suite proves every step plugin can be retired with the loop still functional; the full test suite (1,100+ tests) runs in CI on every pull request and push to `main`, alongside the gitleaks secret-scan guard.

## Contributing

Contributions are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md) for the development setup, how to run the test suite, the PR/contribution workflow, and a short explanation of the GSD phase loop that drives this repo. All participants are expected to follow the [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md). See [CHANGELOG.md](CHANGELOG.md) for the release history. Please report security vulnerabilities via [SECURITY.md](SECURITY.md).

The test suite runs in **CI** via a GitHub Actions workflow (`.github/workflows/ci.yml`) on every pull request and on push to `main`, so PRs are gated and `main` is always verified. A **gitleaks** secret-scan guard also runs on pull requests and fails the PR if a new credential or token is introduced.

## License

MIT
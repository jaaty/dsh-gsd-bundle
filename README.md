# dsh-gsd-bundle
[![CI](https://github.com/jaaty/dsh-gsd-bundle/actions/workflows/ci.yml/badge?branch=main)](https://github.com/jaaty/dsh-gsd-bundle/actions/workflows/ci.yml) [![License](https://img.shields.io/github/license/jaaty/dsh-gsd-bundle?style=flat-square)](https://github.com/jaaty/dsh-gsd-bundle/blob/main/LICENSE) [![npm version](https://img.shields.io/npm/v/@dsh-gsd/bundle@2.2.0?style=flat-square)](https://www.npmjs.com/package/@dsh-gsd/bundle)

A **plugin bundle for [DeepSeek Harness](https://github.com/deepseek-ai/dsh)** (dsh) that reimplements [opengsd-core](https://github.com/open-gsd/gsd-core) — **Git Ship Done (GSD)** — as a set of host-plane Cordis plugins. It replaces the default agent-loop behaviour with the GSD phase loop, so every session becomes a disciplined, artefact-driven engineering loop.

```
Discuss → (UI design, optional) → Plan → Execute → Verify → Ship
```

Every unit of work is a **phase** that moves through these steps in order. State survives across sessions and context resets on disk under `.planning/`, with `STATE.md` as the navigation spine. Heavy work (research, planning, execution, verification) runs in **fresh-context subagents** spawned by the orchestrator, so the main session stays lean.

## Release status

**Milestone `public-release-readiness` v2.1 is complete and released as `v2.1.0`** — all 29 phases shipped (PRs #1–#32, merged to `main`). The bundle covers the full GSD phase loop plus checkpoint-resume, the multi-window ledger and async-jobs manifest, the conversational UAT loop, capability gates, the real background-job runtime, codebase-query intel mode with drift detection / targeted updater, multi-window topology, and the v2.1 public-release-readiness milestone: license-and-attribution, repo-hygiene, ci-and-security, publish-research, and pre-ship-verify. The prior v2.0 graceful-removal milestone (capability-services, reactive-loop-rendering, removal-verification, composability-hardening) remains a prior milestone.

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

- **The full GSD phase loop** as model-facing tools — `gsd_discuss` → `gsd_plan` → `gsd_execute` → `gsd_verify` → `gsd_ship`, plus `gsd_init` / `gsd_status` / `gsd_progress` / `gsd_new_milestone` for orientation and `gsd_quick` for sub-threshold tasks.
- **A durable `.planning/` artefact model** — `PROJECT.md`, `ROADMAP.md`, `REQUIREMENTS.md`, `STATE.md`, `config.json`, per-phase `CONTEXT` / `RESEARCH` / `PLAN` / `SUMMARY` / `VERIFICATION` / `UAT` / `UI-SPEC` documents, and a brownfield `codebase/` map.
- **Checkpoint-resume** — an interrupted `gsd_execute` can be resumed from the last checkpoint, skipping completed tasks and continuing.
- **Window ledger** — a root-level `WINDOWS.md` multi-window ledger and an `async-jobs.json` manifest, both surfaced through `gsd_status`.
- **Conversational UAT loop** — an executor stopping at a `checkpoint:decision` / `checkpoint:human-action` task surfaces a human-facing question; `gsd_execute` pauses, waits for the answer, and resumes the checkpointed plan with that answer applied.
- **Capability gates** — `gsd_ship` runs a set of gates (security, broken-windows, TDD-audit) before creating a PR, reports each gate's pass/fail status, and refuses to ship when a required gate fails.
- **Pre-ship-verify gate** — `gsd_ship` runs a deterministic local verification (`npm ci` + `npm test` in a temp copy of the repo) before pushing, fails the ship on failure, and is skippable via a flag.
- **Real background-job runtime** — a job runner that actually executes a job asynchronously, tracks its lifecycle (`running → done/failed`) in the async-jobs manifest, collects the result, and reflects real async state through `gsd_status`.
- **Brownfield codebase mapping** — `gsd_map_codebase` analyses an existing codebase with parallel fresh-context mappers and writes 7 structured documents to `.planning/codebase/`.
- **Capability-services** — each step plugin publishes a capability service declaring the loop step it provides; the persona and slash-command layer declare coeffects on the capabilities they need.
- **Reactive-loop-rendering** — the persona, runtime-context snapshot, and `gsd_status` re-render from the available step capabilities, so absent steps are skipped and no missing tool is ever instructed.
- **Removal-verification** — an automated per-plugin removal test proving every step plugin can be retired with its effects reverted and the remaining loop still functional end-to-end.
- **Composability-hardening** — the background-job live registry is effect-scoped to its owning fiber so unload/HMR cancels running jobs; the subagents coeffect is declared in every consuming plugin so temporal and spatial composability hold for the job runtime and subagent paths.
- **Two driving UXes** — natural language (the persona makes the agent a GSD driver) and the `/gsd-*` slash-command layer.

## Prerequisites

- **DeepSeek Harness (dsh)** with the `dsh` CLI available on `PATH`.
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

The bundle's `cordis.patch.yml` overrides the host `agent-loop` row to configure a `gsd` agent and inserts the 12 GSD plugin rows. CLI profiles get the `gsd` startup agent; web sessions are created on demand and inherit the GSD persona + tools.

## Quickstart

In a session on a profile with the bundle mounted:

1. **Bootstrap** — `gsd_init` to create the `.planning/` project (name, milestone, requirements, ordered phases).
2. **Orient** — `gsd_status` to see where the loop stands.
3. **Run the loop** — `gsd_discuss` → (optional `gsd_ui_phase`) → `gsd_plan` → `gsd_execute` → `gsd_verify` → `gsd_ship`.

Or just say *"let's build X with GSD"* — the persona already makes the agent a GSD phase-loop driver, pausing at decision points. You can also drive individual steps directly: *"plan phase 1"*, *"execute phase 1"*, *"verify phase 1"*.

## The `gsd_*` tools

All tools are registered by the bundle's plugins and available to the model in any session on a mounted profile.

| Tool | Plugin | Purpose |
|---|---|---|
| `gsd_init` | `gsd-core-tools` | Bootstrap a `.planning/` project (name, milestone, requirements, phases). |
| `gsd_status` | `gsd-core-tools` | Read `STATE.md` + `ROADMAP.md`; surface the loop position, windows, and async jobs. |
| `gsd_progress` | `gsd-core-tools` | Per-phase plan completion counts and next recommended action. |
| `gsd_new_milestone` | `gsd-core-tools` | Start a new milestone and append its phases to `ROADMAP.md`. |
| `gsd_discuss` | `gsd-discuss` | Seal the phase's implementation decisions into `CONTEXT.md` (7 blocks, D-NN decisions, canonical refs). |
| `gsd_ui_phase` | `gsd-ui` | Produce a `UI-SPEC.md` design contract for a phase with a visual component. |
| `gsd_plan` | `gsd-plan` | Research + decompose the phase into bounded `PLAN.md` files ordered into dependency waves (researcher → planner → plan-checker). |
| `gsd_execute` | `gsd-execute` | Run the phase's plans with fresh-context executors, wave by wave, with atomic commits and checkpoint-resume. |
| `gsd_verify` | `gsd-verify` | Verify the phase goal was actually achieved; write `VERIFICATION.md` and route on its status. |
| `gsd_ship` | `gsd-ship` | Preflight + capability gates + pre-ship-verify (npm ci + npm test in a temp copy), push the branch, create the PR, mark the phase shipped. |
| `gsd_quick` | `gsd-quick` | Sub-threshold lightweight path for work too small to warrant the full loop. |
| `gsd_map_codebase` | `gsd-map-codebase` | Map an existing codebase with parallel fresh-context mappers → `.planning/codebase/`. |

## Slash-commands

The `gsd-commands` plugin registers the `/gsd-*` commands as thin routers — each injects a user message telling the agent to run the matching tool, then returns a short ack:

| Command | Tool | Args |
|---|---|---|
| `/gsd-init [brief]` | `gsd_init` | optional project brief |
| `/gsd-status` | `gsd_status` | — |
| `/gsd-progress [phase]` | `gsd_progress` | optional phase number |
| `/gsd-discuss-phase <N>` | `gsd_discuss` | phase number |
| `/gsd-ui-phase <N>` | `gsd_ui_phase` | phase number |
| `/gsd-plan-phase <N>` | `gsd_plan` | phase number |
| `/gsd-execute-phase <N> [--wave N] [--gaps-only]` | `gsd_execute` | phase number + flags |
| `/gsd-verify-work <N>` | `gsd_verify` | phase number |
| `/gsd-ship <N> [--draft]` | `gsd_ship` | phase number + draft flag |
| `/gsd-quick <task>` | `gsd_quick` | the task |
| `/gsd-map-codebase [--fast [--focus tech\|arch\|quality\|concerns\|tech+arch]] [--paths p1,p2]` | `gsd_map_codebase` | fast flag, focus, path prefixes |
| `/gsd-new-milestone <name> <version>` | `gsd_new_milestone` | name + version |

e.g. `/gsd-plan-phase 1` routes to `gsd_plan`; `/gsd-ship 2 --draft` routes to `gsd_ship` as a draft PR.

## How it works

### What "replace the default agent loop plugin" means

The mechanical turn machine in `@deepseek-ai/dsh-agent-loop` (tool scheduling, context assembly, session preparation) **stays** — that is DeepSeek Harness's core runtime, and a session cannot run without it. The bundle replaces the agent loop's *behaviour*:

- `cordis.patch.yml` overrides the host `agent-loop` row's `config` (last-write-wins per row), replacing `agents: []` with a configured **`gsd`** agent.
- `gsd-persona` installs opengsd's phase-loop mental model as the system-prompt section every session reads (order -100, before the deployment persona) and a runtime-context contribution that orients every model step at the current `STATE.md` position.
- The `gsd_*` phase tools are the loop steps.

### Plugins

All plugins are subpath exports of this one package (`@dsh-gsd/bundle/<name>`), the same pattern the shipped presets use (e.g. `@deepseek-ai/dsh-tool-subagent-control/list-agents`).

| Row | Subpath | Provides / registers |
|---|---|---|
| `gsd-persona` | `./persona` | `systemPrompt` section `gsd:persona` + context `gsd:state` |
| `gsd-state` | `./state` | the `gsdState` host service — `.planning/` artefact + STATE.md/ROADMAP.md/REQUIREMENTS.md manager, WINDOWS.md ledger, async-jobs manifest |
| `gsd-core-tools` | `./core-tools` | `gsd_init`, `gsd_status`, `gsd_progress`, `gsd_new_milestone` |
| `gsd-discuss` | `./discuss` | `gsd_discuss` — seals `CONTEXT.md` (7 blocks, D-NN decisions, canonical_refs) |
| `gsd-plan` | `./plan` | `gsd_plan` — researcher → planner → plan-checker fresh-context subagents, 3-iteration revision loop |
| `gsd-execute` | `./execute` | `gsd_execute` — wave-based fresh-context executors, atomic commits, checkpoint-resume, conversational UAT |
| `gsd-verify` | `./verify` | `gsd_verify` — verifier subagent → `VERIFICATION.md`, status decision tree routing |
| `gsd-ship` | `./ship` | `gsd_ship` — preflight + capability gates + pre-ship-verify, PR body assembly, `gh pr create`, STATE update |
| `gsd-ui` | `./ui` | `gsd_ui_phase` — `UI-SPEC.md` (ui-researcher + ui-checker) |
| `gsd-quick` | `./quick` | `gsd_quick` — sub-threshold lightweight path → `.planning/quick/` |
| `gsd-map-codebase` | `./map-codebase` | `gsd_map_codebase` — parallel fresh-context mapper subagents → `.planning/codebase/` (7 docs); brownfield pre-init onboarding tool |
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
├── WINDOWS.md           root-level multi-window ledger (append-only)
├── async-jobs.json      background-job manifest (running → done/failed)
├── codebase/            brownfield codebase map (written by gsd_map_codebase, pre-init)
│   ├── STACK.md                  technology stack
│   ├── INTEGRATIONS.md           external services & data storage
│   ├── ARCHITECTURE.md           system overview, layers, data flow
│   ├── STRUCTURE.md              directory layout, "where to add new code"
│   ├── CONVENTIONS.md            coding & naming patterns
│   ├── TESTING.md                test framework & patterns
│   └── CONCERNS.md               tech debt, bugs, fragility, coverage gaps
└── phases/<NN>-<slug>/
    ├── <NN>-CONTEXT.md          7 blocks: domain, decisions (D-NN), canonical_refs, code_context, specifics, deferred
    ├── <NN>-RESEARCH.md         domain analysis, package legitimacy, risks, open questions, responsibility map, validation architecture; provenance tags
    ├── <NN>-<PP>-PLAN.md        YAML frontmatter (phase, plan, type, wave, depends_on, files_modified, autonomous, requirements, must_haves) + <objective>/<context>/<tasks> body
    ├── <NN>-<PP>-CHECKPOINT.md  persisted checkpoint state for resume (last_completed_task, decision_id, human_answer)
    ├── <NN>-<PP>-SUMMARY.md     execution record (status: complete)
    ├── <NN>-VERIFICATION.md     frontmatter (status: passed|gaps_found|human_needed, score, gaps, human_verification)
    ├── <NN>-UAT.md              persistent UAT session state
    └── <NN>-UI-SPEC.md          UI design contract (optional)
```

`<NN>` = zero-padded phase number; `<PP>` = zero-padded plan number within the phase. `STATE.md` frontmatter carries `gsd_state_version`, `milestone`, `status`, `active_phase`, `next_action`, `progress`, and session-continuity fields, matching the opengsd schema.

**Curate, don't commit everything.** The durable artefacts the GSD loop needs to orient — `PROJECT.md`, `REQUIREMENTS.md`, `ROADMAP.md`, `STATE.md`, `config.json`, the `codebase/` map, and the per-phase `CONTEXT` / `RESEARCH` / `PLAN` / `SUMMARY` / `VERIFICATION` documents — are tracked in git. The volatile churn — `async-jobs.json`, `WINDOWS.md`, `quick/` records, and the per-phase `DISCUSSION-LOG.md` files — is gitignored (see `.gitignore`). These volatile files stay on disk (the GSD tools keep writing them) but are not committed. Because the durable subset is committed, never paste real credentials or tokens into `.planning/` artefacts.

### Fresh-context subagents

Research, planning, execution, and verification run as one-shot fresh-context subagents spawned through the host `subagents` service's in-process `spawn` provider (`ctx.subagents.start('spawn', { prompt, parent, signal })`) — exactly opengsd's fresh-context model. The role prompts (researcher, planner, plan-checker, executor, verifier, ui-researcher, ui-checker, codebase-mapper) are condensed faithfully from opengsd's `agents/*.md`: role, tools, inputs, outputs, the planner's goal-backward `must_haves`, the plan-checker's 12 dimensions and adversarial FORCE stance, the executor's atomic-commit + worktree discipline, the verifier's "do not trust SUMMARY.md" escalation gate with the 3-value status decision tree, and the codebase-mapper's focus→document templates with the forbidden-secrets rule.

## Faithfulness and scope

This is a faithful reimplementation of opengsd-core's **phase loop and artefact schemas**, not a port of its CLI (`gsd_run`) or its full capability/gate ecosystem. Deliberate simplifications:

- **No per-plan git worktrees.** Executors run on the shared working tree. The plan-checker's same-wave non-overlap guarantee (Dimension 3) makes the shared tree safe; the post-merge regression gate becomes a per-wave test run rather than a worktree merge.
- **`gsd_run` is not wrapped.** The opengsd CLI query/check/state commands are reimplemented as in-process `gsdState` service methods (no separate `gsd_run` process).
- **Capability gates** are implemented as a focused set — `security`, `broken_windows`, `tdd_audit` — run by `gsd_ship` before PR creation, with per-gate pass/fail reporting and a `skip_gates` escape hatch. The broader opengsd gate ecosystem (e.g. `ui.safety-gate`) is not ported.
- **`gsd_map_codebase` `--query` intel mode** is implemented (the `intel.enabled` capability ecosystem — drift detection via the `.map-manifest.json`, the `gsd-intel-updater` targeted re-map, a structured answer object, and subtree `queryScope` scoping). The full parallel map, `--fast` single-focus scan, and `--paths` incremental-remap scoping are all implemented; the existing-check's interactive refresh/update/skip choice is surfaced as `force` / `paths` parameters (a tool cannot hold a multi-turn interview).
- Slash-command-style flags (`--gaps`, `--tdd`, `--mvp`, `--no-tracer`, `--granularity`, `--wave`, `--gaps-only`) are exposed as tool parameters rather than a slash-command layer.
- **The bundle is deliberately swappable and customizable.** Every step plugin publishes a capability service and the persona / runtime-context / `gsd_status` render reactively from the available capabilities, so any step plugin can be retired (or replaced) and the remaining loop stays functional — proven by the automated per-plugin removal suite. This is a design property, not a limitation.

The reference used to build this is the [opengsd-core](https://github.com/open-gsd/gsd-core) repository.

## Status

**Milestone v2.1 is complete and released** (`v2.1.0`): all 29 phases shipped — the 24 v2.0 phases (live-mount, service-tools, loop-e2e, checkpoint-resume, window-ledger, loop-robustness, uat-conversation, capability-gates, job-runtime, codebase-query, phase-dir-resolution, single-source-constants, gate-dispatch, execute-checkpoint, ship-robustness, context-budget, phase-branch-isolation, job-runtime-extensions, codebase-intel-extensions, multi-window-topology, capability-services, reactive-loop-rendering, removal-verification, composability-hardening) plus the five v2.1 public-release-readiness phases (license-and-attribution, repo-hygiene, ci-and-security, publish-research, pre-ship-verify). Every plugin module loads and its `apply` registers its tools with valid schemas; the `cordis.patch.yml` merges cleanly over `dsh-base` and overrides the `agent-loop` row's config. A full live mount (resolving the subpath exports and activating the plugins) is verified, the loop has been exercised end-to-end across the shipped phases, and the v2.0 removal suite proves every step plugin can be retired with the loop still functional. `gsd_ship` now runs a deterministic pre-ship-verify gate (`npm ci` + `npm test` in a temp copy) before pushing, and CI runs the test suite plus a gitleaks secret-scan guard on every pull request and push to `main`.

## Contributing

Contributions are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md) for the development setup, how to run the test suite, the PR/contribution workflow, and a short explanation of the GSD phase loop that drives this repo. All participants are expected to follow the [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md). See [CHANGELOG.md](CHANGELOG.md) for the release history. Please report security vulnerabilities via [SECURITY.md](SECURITY.md).

The test suite runs in **CI** via a GitHub Actions workflow (`.github/workflows/ci.yml`) on every pull request and on push to `main`, so PRs are gated and `main` is always verified. A **gitleaks** secret-scan guard also runs on pull requests and fails the PR if a new credential or token is introduced.

## License

MIT

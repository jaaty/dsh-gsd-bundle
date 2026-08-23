# dsh-gsd-bundle

A DeepSeek Harness **bundle** that reimplements [opengsd-core](https://github.com/open-gsd/gsd-core) (Git Ship Done) as a set of host-plane Cordis plugins, and **replaces the default agent-loop behaviour** with the GSD phase loop:

```
Discuss → (UI design, optional) → Plan → Execute → Verify → Ship
```

Every unit of work is a **phase** that moves through these steps in order. State survives across sessions and context resets on disk under `.planning/`, with `STATE.md` as the navigation spine. Heavy work (research, planning, execution, verification) runs in **fresh-context subagents** spawned by the orchestrator, so the main session stays lean.

## What "replace the default agent loop plugin" means

The mechanical turn machine in `@deepseek-ai/dsh-agent-loop` (tool scheduling, context assembly, session preparation) **stays** — that is DeepSeek Harness's core runtime, not opengsd-core, and a session cannot run without it. The bundle replaces the agent loop's *behaviour*:

- `cordis.patch.yml` overrides the host `agent-loop` row's `config` (last-write-wins per row), replacing `agents: []` with a configured **`gsd`** agent.
- `gsd-persona` installs opengsd's phase-loop mental model as the system-prompt section every session reads (order -100, before the deployment persona) and a runtime-context contribution that orients every model step at the current `STATE.md` position.
- The `gsd_*` phase tools are the loop steps.

So every session becomes a GSD phase-loop driver. CLI profiles get the `gsd` startup agent; web sessions are created on demand and inherit the GSD persona + tools.

## Plugins

All plugins are subpath exports of this one package (`@dsh-gsd/bundle/<name>`), the same pattern the shipped presets use (e.g. `@deepseek-ai/dsh-tool-subagent-control/list-agents`).

| Row | Subpath | Provides / registers |
|---|---|---|
| `gsd-persona` | `./persona` | `systemPrompt` section `gsd:persona` + context `gsd:state` |
| `gsd-state` | `./state` | the `gsdState` host service — `.planning/` artefact + STATE.md/ROADMAP.md/REQUIREMENTS.md manager |
| `gsd-core-tools` | `./core-tools` | `gsd_init`, `gsd_status`, `gsd_progress`, `gsd_new_milestone` |
| `gsd-discuss` | `./discuss` | `gsd_discuss` — seals `CONTEXT.md` (7 blocks, D-NN decisions, canonical_refs) |
| `gsd-plan` | `./plan` | `gsd_plan` — researcher → planner → plan-checker fresh-context subagents, 3-iteration revision loop |
| `gsd-execute` | `./execute` | `gsd_execute` — wave-based fresh-context executors, atomic commits, `SUMMARY.md` |
| `gsd-verify` | `./verify` | `gsd_verify` — verifier subagent → `VERIFICATION.md`, status decision tree routing |
| `gsd-ship` | `./ship` | `gsd_ship` — preflight gates, PR body assembly, `gh pr create`, STATE update |
| `gsd-ui` | `./ui` | `gsd_ui_phase` — `UI-SPEC.md` (ui-researcher + ui-checker) |
| `gsd-quick` | `./quick` | `gsd_quick` — sub-threshold lightweight path → `.planning/quick/` |
| `gsd-map-codebase` | `./map-codebase` | `gsd_map_codebase` — parallel fresh-context mapper subagents → `.planning/codebase/` (7 docs); brownfield pre-init onboarding tool |
| `gsd-commands` | `./commands` | the `/gsd-*` slash-commands — thin routers that inject a user message telling the agent to run the matching tool |

## `.planning/` artefacts (faithful to opengsd-core)

```
.planning/
├── PROJECT.md
├── ROADMAP.md            milestone + phase table (#, Phase, Goal, Requirements)
├── REQUIREMENTS.md      numbered acceptance criteria (REQ-IDs)
├── STATE.md             YAML frontmatter (machine) + Markdown body (human), <100 lines
├── config.json          workflow + model configuration
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
    ├── <NN>-<PP>-SUMMARY.md     execution record (status: complete)
    ├── <NN>-VERIFICATION.md     frontmatter (status: passed|gaps_found|human_needed, score, gaps, human_verification)
    ├── <NN>-UAT.md              persistent UAT session state
    └── <NN>-UI-SPEC.md          UI design contract (optional)
```

`<NN>` = zero-padded phase number; `<PP>` = zero-padded plan number within the phase. `STATE.md` frontmatter carries `gsd_state_version`, `milestone`, `status`, `active_phase`, `next_action`, `progress`, and session-continuity fields, matching the opengsd schema.

## Fresh-context subagents

Research, planning, execution, and verification run as one-shot fresh-context subagents spawned through the host `subagents` service's in-process `spawn` provider (`ctx.subagents.start('spawn', { prompt, parent, signal })`) — exactly opengsd's fresh-~200k-context model. The role prompts (researcher, planner, plan-checker, executor, verifier, ui-researcher, ui-checker, codebase-mapper) are condensed faithfully from opengsd's `agents/*.md`: role, tools, inputs, outputs, the planner's goal-backward `must_haves`, the plan-checker's 12 dimensions and adversarial FORCE stance, the executor's atomic-commit + worktree discipline, the verifier's "do not trust SUMMARY.md" escalation gate with the 3-value status decision tree, and the codebase-mapper's focus→document templates with the forbidden-secrets rule.

## Install

Add the bundle to a profile (it layers after `dsh-base`):

```sh
dsh plugin --profile <name> add /home/jatyeo/dev/dsh-gsd-bundle
dsh --profile <name> web   # or tui / headless
```

Then in a session: `gsd_init` to bootstrap a project, `gsd_status` to orient, and follow the phase loop with `gsd_discuss` → (optional `gsd_ui_phase`) → `gsd_plan` → `gsd_execute` → `gsd_verify` → `gsd_ship`.

## Two ways to drive it

**Natural language.** The `gsd-persona` section already makes the agent a GSD phase-loop driver. Say *"let's build X with GSD"* and it runs the loop (`gsd_init` → `gsd_discuss` → … → `gsd_ship`), pausing at decision points. Or direct a step: *"plan phase 1"*, *"execute phase 1"*, *"verify phase 1"*.

**Slash-commands** (opengsd UX). The `gsd-commands` plugin registers the `/gsd-*` commands as thin routers — each injects a user message instructing the agent to run the matching tool, then returns a short ack:

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

## Faithfulness and scope

This is a faithful reimplementation of opengsd-core's **phase loop and artefact schemas**, not a port of its CLI (`gsd_run`) or its full capability/gate ecosystem. Deliberate simplifications:

- **No per-plan git worktrees.** Executors run on the shared working tree. The plan-checker's same-wave non-overlap guarantee (Dimension 3) makes the shared tree safe; the post-merge regression gate becomes a per-wave test run rather than a worktree merge.
- **`gsd_run` is not wrapped.** The opengsd CLI query/check/state commands are reimplemented as in-process `gsdState` service methods (no separate `gsd_run` process).
- **Capability gates** (security/broken-windows/TDD-audit `ship:pre`, `execute:wave:post`, `ui.safety-gate`, etc.) and the async-jobs manifest / `WINDOWS.md` ledger / UAT conversational loop are not implemented in this first version; `gsd_ship` performs the core preflight (verification passed, clean tree, branch, remote, `gh`) and PR creation.
- Slash-command-style flags (`--gaps`, `--tdd`, `--mvp`, `--no-tracer`, `--granularity`, `--wave`, `--gaps-only`) are exposed as tool parameters rather than a slash-command layer.
- **`gsd_map_codebase` `--query` intel mode** (the `intel.enabled` capability ecosystem — drift detection, `gsd-intel-updater`, the `query`/`status`/`diff`/`refresh` sub-commands) is not implemented in this first version, parallel to the omitted capability gates. The full parallel map, `--fast` single-focus scan (scan.md), and `--paths` incremental-remap scoping are all implemented; the existing-check's interactive refresh/update/skip choice is surfaced as `force` / `paths` parameters (a tool cannot hold a multi-turn interview).

The reference used to build this is in `gsd-core-reference.md` (compiled from the opengsd-core `next` branch).

## Status

Validated: every plugin module loads and its `apply` registers its tools with valid schemas; the `cordis.patch.yml` merges cleanly over `dsh-base` and overrides the `agent-loop` row's config. A full live mount (resolving the subpath exports and activating the plugins) is the next step once the bundle is `dsh plugin add`-ed into a profile and a session is started on it.

## License

MIT
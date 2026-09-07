# Upstream Parity Gap Register

Comparison of this bundle (`dsh-gsd-bundle`) against the reference repo
[`open-gsd/gsd-core`](https://github.com/open-gsd/gsd-core), identifying
reference functionality that is **not yet implemented here** and **not already
considered and discounted**.

- **Milestone:** `upstream-parity` (v3.0.0)
- **Reference snapshot:** latest `main` of `open-gsd/gsd-core` (cloned 2026-09-06)
- **Method:** exhaustive feature inventory of both repos (docs/FEATURES.md,
  COMMANDS.md, CONFIGURATION.md, CLI-TOOLS.md, capabilities/, skills/, hooks/,
  src/), cross-referenced against this bundle's `lib/*.js` tool surface and its
  documented discount decisions (README "Faithfulness and scope", `DEFERRED.md`,
  per-phase CONTEXT/RESEARCH/VERIFICATION files).

---

## How to read this register

- **Section 1 — Genuinely missing:** reference features this bundle does not
  implement and has not discounted. These are candidates for future phases.
- **Section 2 — Already discounted:** reference features this bundle has
  explicitly considered and rejected/deferred. Excluded from the gap list by
  design.
- **Section 3 — Not applicable by architecture:** reference features that do not
  apply because this bundle is a DeepSeek Harness plugin, not a multi-runtime
  installer/CLI framework.

Each genuinely-missing item is tagged with a suggested priority:
`P1` (core-loop adjacent, high value), `P2` (self-contained, useful),
`P3` (larger / peripheral).

---

## Section 1 — Genuinely missing features

### 1.1 Core-loop helpers

| Feature | Reference command | What it does | Priority |
|---|---|---|---|
| Phase management | `/gsd-phase` | Add / insert / remove / edit phases in `ROADMAP.md` dynamically, instead of only via `gsd_new_milestone`. | P1 |
| Smart entry / auto-advance | `/gsd-next`, `/gsd-progress --next` | Detect current state and automatically route to the next logical workflow step. | P1 |
| Freeform routing | `/gsd-progress --do` | Parse a plain-English intent and dispatch it to the best GSD command. | P2 |
| Quick batch mode | `/gsd-quick-batch` | Run several quick tasks in one batch. | P2 |
| Fast mode | `/gsd-fast` | Lighter single-pass path for trivial work (closest existing: `gsd_quick`). | P2 |
| MVP phase mode | `/gsd-mvp-phase` | Guided minimal-viable-phase planning/execution (bundle only has an `--mvp` flag on planning). | P2 |
| Node repair | (workflow) | Automatically recover when a task's verification fails, instead of stopping. | P2 |

### 1.2 Quality / verification

| Feature | Reference command | What it does | Priority |
|---|---|---|---|
| Cross-AI peer review | `/gsd-review` | Run reviewer lanes against external AIs (Gemini, Codex, CodeRabbit, OpenCode, local models, etc.). | P1 |
| Security enforcement | `/gsd-secure-phase` | Threat-model-anchored security verification with OWASP ASVS levels. Bundle only has a ship-time gate, not the full audit. | P2 |
| Audit-to-fix pipeline | `/gsd-audit-fix` | Run an audit, classify findings, auto-fix with test verification. | P3 |
| TDD applicability predicate + RED evidence | (workflow) | Mark eligible tasks `type:tdd` and enforce RED/GREEN/REFACTOR. | P2 |
| Verify-command path grounding | `gsd-tools check verify-command-paths` | Deterministically check that `<automated>` verify command paths resolve. | P2 |
| Failing-direction enforcement | (workflow) | Require `<fails_when>` for every runnable `<automated>` verify command. | P2 |
| Refactor trigger | `gsd-tools refactor` | Complexity-triggered refactor detection with a ledger. | P3 |
| Context-window utilization guard | `/gsd-health --context` | Warn / critical at 60% / 70% context saturation. | P2 |
| Fallow structural pre-pass | (config `code_quality.fallow.*`) | Optional static-analysis pass embedding structural findings in `REVIEW.md`. | P3 |

### 1.3 Debugging & forensics

| Feature | Reference command | What it does | Priority |
|---|---|---|---|
| Debug system | `/gsd-debug` | Scientific-method debugging with persistent state, hypotheses, evidence, and a knowledge base. | P1 |
| Forensics | `/gsd-forensics` | Post-mortem integrity audit. | P3 |

### 1.4 Capture & utility

| Feature | Reference command | What it does | Priority |
|---|---|---|---|
| Todo / note / backlog / seed capture | `/gsd-capture` | Capture ideas and tasks into `.planning/todos/`. | P2 |
| Statistics dashboard | `/gsd-stats` | Phase / plan / requirement / git metrics (json/table/bar). | P2 |
| Settings / config management | `/gsd-settings`, `/gsd-config` | Interactive config editing. | P2 |
| Sketch | `/gsd-sketch` | Design mockups. | P3 |
| Spike | `/gsd-spike` | Feasibility experiments. | P3 |
| Profile user | `/gsd-profile-user` | Developer behavioral profiling (8 dimensions). | P3 |

### 1.5 Brownfield / codebase intelligence

| Feature | Reference command | What it does | Priority |
|---|---|---|---|
| Existing codebase onboarding | `/gsd-onboard` | Guided first-time GSD setup for an existing repo. | P2 |
| Docs ingest | `/gsd-ingest-docs` | Classify and synthesize ADR/PRD/SPEC/RFC docs into `.planning/`. | P3 |
| Docs update | `/gsd-docs-update` | Generate and fact-check project documentation. | P3 |
| Import | `/gsd-import` | Import external planning state. | P3 |
| Explore | `/gsd-explore` | Socratic codebase exploration. | P3 |
| Schema drift gate | (workflow) | Block when ORM schema files change without a migration/push. | P2 |
| **Pattern mapping** | (workflow) | **Config/implementation mismatch:** `config.json` sets `workflow.pattern_mapper: true` but `lib/plan.js` does not implement it. | P1 |

### 1.6 Context engineering

| Feature | Reference command | What it does | Priority |
|---|---|---|---|
| Context window monitoring | (hook `gsd-context-monitor.js`) | Track runtime context usage across tool calls. Bundle only budgets the planning context, not the live session. | P2 |
| Persistent context threads | `/gsd-thread` | Long-lived cross-session knowledge stores. | P3 |
| Model profiles | (config) | Per-agent model tiers (balanced/opus/haiku). Bundle uses the host model only. | P3 |
| Session reporting | `/gsd-pause-work --report` | Post-session summary in `.planning/reports/`. | P3 |

### 1.7 AI integration

| Feature | Reference command | What it does | Priority |
|---|---|---|---|
| AI integration phase wizard | `/gsd-ai-integration-phase` | Produces an `AI-SPEC.md` for phases that build AI systems. | P3 |
| Eval review | `/gsd-eval-review` | Retroactive audit of an AI phase's evaluation coverage. | P3 |
| Cross-AI execution | (workflow) | Delegate phase execution to an external AI CLI. | P3 |

### 1.8 Infrastructure

| Feature | Reference command | What it does | Priority |
|---|---|---|---|
| Workstream namespacing | `/gsd-workstreams` | Parallel workstreams under `.planning/workstreams/`. | P3 |
| Multi-repo workspace | `/gsd-workspace` | Isolated workspaces for multiple repos. | P3 |
| Complete milestone | `/gsd-complete-milestone` | Archive + tag at milestone close (bundle has the audit but not the completion step). | P2 |
| Milestone summary | `/gsd-milestone-summary` | Team-facing onboarding doc. | P3 |
| Capability management | (CLI) | Install / update / remove capabilities at runtime (bundle's are static descriptors). | P3 |
| Secrets handling | (CLI) | API-key masking in config output. | P3 |
| Exit-code registry | (CLI) | Versioned process-exit contract. | P3 |
| Retired-artifact cleanup | (CLI) | Clean up retired artifacts. | P3 |
| Prohibition enforcement | (CLI) | Enforce prohibitions. | P3 |

---

## Section 2 — Already considered and discounted (excluded)

These were explicitly considered and rejected/deferred in this bundle, so they
are **not** part of the gap list.

- **Per-plan git worktrees** — executors run on the shared working tree; the
  plan-checker's same-wave non-overlap guarantee makes it safe. (README)
- **Wrapping the `gsd_run` CLI** — opengsd CLI query/check/state commands are
  re-implemented as in-process `gsdState` service methods. (README)
- **Broader gate ecosystem** (e.g. `ui.safety-gate`) — only `security`,
  `broken_windows`, `tdd_audit` are ported. (README)
- **Interactive refresh/update/skip in codebase mapping** — surfaced as
  `force` / `paths` tool parameters instead. (README)
- **Slash-command-style flags as tool parameters** — `--gaps`, `--tdd`, `--mvp`,
  `--no-tracer`, `--granularity`, `--wave`, `--gaps-only`. (README)
- **Clean-PR branch** — built in phase 35, deliberately removed in phase 51.
- **Spec-phase edge-completeness and prohibition probes** — out of scope (phase 36).
- **SPEC→plan lift** — deferred (phase 36).
- **Autonomous interactive batch-table / `--converge` / `--cross-ai` / range
  flags, per-phase blocker menu, verification routing, code-review/ui-review
  auto-chaining** — out of scope (phase 49).
- **Graphify HTML visualization, diff/snapshot subcommands, MVP-mode node
  rendering, configurable `graph_path`** — deferred (phase 45).
- **Learnings deliberate recall, external knowledge-base capture, semantic-search
  index** — deferred / out of scope (phase 44).
- **Mempalace curator agent, MCP transport, `kg_backend`/`replace` modes,
  `auto_capture_hooks`, `cross_project_tunnels`/`diary_journal`, KG mirror** —
  out of scope (phase 46).
- **Add-tests real browser/Playwright E2E execution and in-tool suite execution** —
  out of scope (phase 50).
- **Multi-window chained/stacked topology, named integration branch, auto-rebasing** —
  out of scope (phase 20).
- **Context-budget per-file `maxPerFile` configurability and token-based budgeting** —
  deferred (phase 16).
- **Broken-chain detection** (produces/consumes) — deferred by user decision (phase 22).
- **`broken_windows` skipped-test regex false positive** — deferred bug, see
  `DEFERRED.md` D-24-001.
- **Various per-phase deferrals** — memoizing `_phaseDirName`, live DSH boot,
  hard-killed-executor crash recovery, custom gate predicates, async git/gh in
  map-codebase, defensive clean-branch cleanup, confidence calibration, UI
  presentation of map output, npm-downloads badge, custom docs domain, v2.2.0
  git tag, email security contact.

---

## Section 3 — Not applicable by architecture (excluded)

These do not apply because this bundle is a DeepSeek Harness plugin, not a
multi-runtime installer / CLI framework.

- **Multi-runtime installer** and per-runtime support (Claude Code, Codex,
  Cursor, Copilot, Windsurf, Kimi, Kilo, OpenCode, Cline, CodeBuddy, Qwen, Trae,
  VS Code, Antigravity, Gemini, Augment, Hermes, pi, ZCode, local model servers).
- **Runtime hook system** (prompt guard, read/write guard, secret-read guard,
  context monitor, statusline, update banner, etc.) — dsh has its own hook plane.
- **Skills** and **namespace meta-skills** — dsh uses slash commands, not skills.
- **`gsd-tools` CLI** and `gsd_run` launcher — re-implemented in-process.
- **Update system** (`/gsd-update`) — the bundle is updated via npm.
- **Install engine / installer migrations / shadow report**.
- **Agent-skills bootstrap / skill manifest**.
- **Runtime artifact conversion / CLI skew check / runtime identity**.

---

## Suggested priority order

1. **Phase management** (`/gsd-phase`) — core-loop adjacent, unlocks workflow flexibility.
2. **Smart entry / auto-advance** (`/gsd-next`, `/gsd-progress --next`) — makes the loop feel alive.
3. **Debug system** (`/gsd-debug`) — self-contained, genuinely useful, entirely missing.
4. **Cross-AI peer review** (`/gsd-review`) — high value if multiple models are used.
5. **Fix the `pattern_mapper` config/implementation mismatch** — small correctness bug in the bundle's own config.
6. Everything else (AI-integration, workstreams, multi-repo, docs-ingest) — larger and more peripheral; good later-milestone candidates.

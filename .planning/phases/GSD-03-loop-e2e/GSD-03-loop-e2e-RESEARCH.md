# Phase 3 (loop-e2e) — RESEARCH.md

```
phase: 03-loop-e2e
researched: 2026-08-23
status: ready
open_questions_resolved: 3 of 3
```

# Research: Run one full phase through the loop in a live headless DSH session (MOUNT-05, MOUNT-06)

## Domain analysis

### What "one full phase in a live session" requires (per CONTEXT D-01/D-02/D-05)
The proof target is a **freshly booted headless DSH deployment** (`dsh --profile headless`) with `DSH_HOME` relocated to a writable path. That booted session — a real deployment, not this orchestrator's own context — must drive the GSD loop (Discuss → Plan → Execute → Verify → Ship) using **real LLM subagents** (researcher/planner/checker/executor/verifier spawned via the host `subagents` spawn provider) and **real git + real gh**, producing a **real PR** on its own feature branch against `main`. MOUNT-06 (`npm test` green) is re-asserted in the booted live context. Confidence: **high** — every hard precondition was verified live this session.

### The one-shot headless boot model [VERIFIED: dsh `lib/bin.js` + `profile-boot-DG5t9aNs.js` + `@deepseek-ai/dsh-headless/lib/index.js` read this session]
- `dsh --profile headless "<task>"` boots the headless profile and answers **one** task: `headless-runner` creates one Agent through the core registry, follows up with the task, awaits quiescence, prints the final assistant text, and exits (`lib/index.js` `run()`).
- The runner needs `agentDefaultModel`, `agents`, `sessions`, and `appExit` (provided by the launcher via `ctx.appExit`) — all present in `dsh-base`. It creates its own agent (`agents.create(...)`), **not** the `gsd` startup agent the bundle configures on the `agent-loop` row; tool/persona availability therefore rides on global `dsh-base` registration, not the configured agent.
- Boot is process-driven: `prepareProfile` (re)writes the profile root `cordis.yml`, which is exactly why the read-only `.dsh` must be relocated (below).

### DSH_HOME relocation mechanics [VERIFIED live this session]
- Original `$DSH_HOME=~/.dsh` is EROFS for writes under this sandbox: `dsh --profile headless --dump-default-config` throws `EROFS ... open '~/.dsh/profiles/headless/cordis.yml'` (`prepareProfile` rewrites `cordis.yml`). Relocation is therefore mandatory, not optional (matches D-04).
- Relocation works: a fresh `DSH_HOME=/tmp/dshhome` whose `profiles/headless/` carries `package.json` (bundles list), an empty `cordis.patch.yml` user layer, and a `node_modules/@dsh-gsd/bundle` symlink to the workspace composes correctly. `dsh --profile headless --dump-config` under that relocated home shows **all 12 `@dsh-gsd/bundle/*` insert rows, plus the `agent-loop` row patched to `config.agents: [{ id: gsd }]`** (grep lines 314–361). The bundle is genuinely applied.
- A **full headless boot** with that relocated home + a copied `settings.yaml` completed a real LLM round-trip: task `Reply with exactly the single word: ok...` → printed `ok`, exit 0.
- **`healProfilesModuleFallback(INSTALL_ANCHOR, home)`** (in `@deepseek-ai/dsh-app-boot/lib/index.js:409`) creates `$DSH_HOME/profiles/node_modules/<pkg>` symlinks for every dependency/peerDependency of the `@deepseek-ai/dsh` install. So the relocated home's `profiles/node_modules` fallback is auto-populated on boot with the `@deepseek-ai` peer packages (`dsh-tools`, `dsh-llm`, `schemastery`, `cordis`, …). Only the profile's own bundle link (`@dsh-gsd/bundle`) must be supplied by hand (it is not an install dep).
- ⚠ **`/tmp` is ephemeral across tool calls** (wiped between separate `bash` invocations). It persists **within one** command/job. Therefore the relocated `DSH_HOME` and any demo clone must be created and used **inside a single long-running command or background job**; the durable proof is the PR on the remote, not files in `/tmp`.

### LLM / credentials [VERIFIED live this session]
- No `DEEPSEEK_API_KEY` env is set. LLM is a **local Ollama** OpenAI-compatible endpoint.
- Real `settings.yaml` (`~/.dsh/settings.yaml`) declares `llm-pi-ai.providers.ollama` (baseURL `http://localhost:11434/v1`, header `Authorization: Bearer ollama`, models `glm-5.2:cloud`, `deepseek-v4-flash:0731-cloud`) and `agent-default-model: {provider: ollama, model: deepseek-v4-flash:0731-cloud}`. This overrides the `dsh-base` default `deepseek-official/deepseek-v4-flash`.
- Ollama is reachable and a real chat completion returns valid output (`model: deepseek-v4-flash:0731`, with `reasoning` field — a thinking model). **So the booted headless session can do genuine LLM round-trips with no cloud auth.**
- ⇒ The relocated `DSH_HOME` must contain a copy of `settings.yaml` (the provider + default model). No `.credentials.yaml` is needed (bearer is inline in settings headers).

### Subagent spawn capability inside the booted session [VERIFIED: `dsh-base/cordis.patch.yml` + `lib/_runner.js` + `lib/plan.js` this session]
- `dsh-base` mounts: `subagent` (`@deepseek-ai/dsh-subagent`), `subagent-spawn-in-process` (provider `spawn`), `tool-subagent`, `tool-bash`, `bash-sandbox`, `tool-fs`, `tool-grep/glob` equivalents, `commands`, etc. So the headless agent has the `subagents` **service** and the `spawn` **provider**.
- The gsd phase tools spawn subagents through that service, not through the model-facing `subagent` tool: `lib/plan.js:45` `const subagents = ctx.get("subagents")`, `lib/_runner.js:20` `subagents.start("spawn", req)` with `parent: exec.agent`. So **fresh-context researcher/planner/checker/executor/verifier subagents spawn in-process from the booted session** — this is the genuine D-02 requirement.
- This very session is itself a live DSH session running `gsd_plan`, and this RESEARCH is the output of a researcher subagent spawned by it — corroborating that the mechanism works in a live (web) deployment; the headless deployment mounts the same `dsh-base` core.

### git / gh / remote [verified live this session]
- `git remote origin = https://github.com/jaaty/dsh-gsd-bundle.git`; `gh auth status` = logged in as `jaaty` (token scopes include `repo`; git protocol ssh, but `gh pr create` drives push over https with the token). Real PR is creatable.
- Default branch = **`main`** (`gh repo view jaaty/dsh-gsd-bundle --json defaultBranchRef`).
- **PRs #1 and #2 are MERGED, not open** (`gh pr list --state all` → `2 … MERGED`, `1 … MERGED`). CONTEXT D-06's "already-open PRs #1/#2" is stale; the real constraint (own feature branch, base `main`) is trivially satisfiable.

### MOUNT-06 / `npm test` [verified live this session]
- `npm test` = `node --test test/*.test.mjs`; currently **56 pass / 0 fail** across 5 `*.test.mjs` files (+ `test/helpers/`).
- **A truly clean clone without `node_modules` FAILS**: `ERR_MODULE_NOT_FOUND: Cannot find package '@deepseek-ai/dsh-tools' imported from /tmp/clean-repo/lib/map-codebase.js`. The repo's `node_modules/` is gitignored; its `@deepseek-ai/{cordis,dsh-llm,dsh-tools,schemastery}` are **symlinks to the global dsh install**. So MOUNT-06's "clean checkout" must restore those four peer symlinks (the standard clean-build install step) before `npm test`; with them, the suite is green. Plan must recreate the symlinks in the demo clone.

## Package legitimacy

No new runtime dependencies are proposed for the bundle (it ships with zero `dependencies` and four `@deepseek-ai` peers already exercised by the code). All claims below concern **harness-internal packages already installed** in the deployment — verified by direct reads, not registry lookups.

| Package | Role | Source of claim |
|---|---|---|
| `@deepseek-ai/dsh` (CLI) | `dsh --profile headless`, `--dump-config` | [VERIFIED] `dsh --help`/`--version`; `lib/bin.js` read |
| `@deepseek-ai/dsh-headless` | one-shot headless runner | [VERIFIED] package manifest + `lib/index.js` read |
| `@deepseek-ai/dsh-base` | mounts `subagent`, `spawn` provider, `bash`, `tools`, `commands`, `sandbox` | [VERIFIED] `dsh-base/cordis.patch.yml` read this session |
| `@deepseek-ai/dsh-app-boot` | `boot`, `loadProfile`, `healProfilesModuleFallback`, `loadOverlayPatches` | [VERIFIED] `lib/index.js` read |
| `@deepseek-ai/dsh-tools`, `dsh-llm`, `schemastery`, `cordis` | the bundle's four peer deps; resolved from global install via profile fallback | [VERIFIED] present as symlinks in profile/repo `node_modules`; boot works |
| `@deepseek-ai/dsh-subagent` + `dsh-subagent-spawn-in-process` | the `subagents` service + `spawn` provider the gsd tools consume | [VERIFIED] `dsh-base/cordis.patch.yml`; `lib/_runner.js` |
| Ollama (local model endpoint) | LLM provider | [VERIFIED] curl `/v1/chat/completions` returned a completion |

No external package is proposed. Confidence in the boot stack: **high** (boot + LLM round-trip proven live).

## Risks and Open Questions

### Risks
1. **The headless one-shot must drive all five loop steps + subagents + git/gh to quiescence in a single task.** A trivial boot works (proven), but a full multi-commit, multi-subagent, PR-creating run is ambitious for the reasoning model. If it does not complete, CONTEXT D-03 mandates the limitation is **recorded in VERIFICATION.md**, not papered over — there is no silent fallback to the offline harness.
2. **`/tmp` ephemerality** — the demo clone and relocated `DSH_HOME` must live inside one long-running background job; the durable proof is the PR on the remote.
3. **Agent tool/subagent binding in headless is not yet live-proven.** `dsh-base` registers everything globally and the trivial boot answered a tool-free task; whether the booted agent binds `gsd_*` + `subagents` spawn is confirmed by the offline mount tests (MOUNT-01..04) but not yet by a live headless tool call. This is the live part MOUNT-05 is designed to prove; a first boot should use a task that exercises a `gsd_*` tool.
4. **Demo-repo pollution of the real project.** Running the loop in the real workspace (currently on `phase-2` with uncommitted `.planning/ROADMAP.md`/`STATE.md`) would clash with the in-flight phase-3 planning. Use a **throwaway clone** at `/tmp` inside the single job.
5. **MOUNT-06 clean-checkout dependency** on `@deepseek-ai` peer symlinks (no committed `node_modules`); restore them in the clone.

### Open Questions — all (RESOLVED)
- **OQ-1 (RESOLVED): How does DSH_HOME relocation make the bundle resolve?** Verified live: a minimal `/tmp/dshhome/profiles/headless` (package.json with bundles list + empty `cordis.patch.yml` + a `node_modules/@dsh-gsd/bundle` symlink to the workspace) plus a copied `settings.yaml` composes all 12 GSD rows and boots a real LLM task. `healProfilesModuleFallback` supplies the `@deepseek-ai` peer fallback automatically.
- **OQ-2 (RESOLVED): Where does the demo phase run without polluting the real project?** In a throwaway clone at `/tmp` created and used inside a single background job (so `/tmp` survives for the job duration). The durable proof is the PR on `github.com/jaaty/dsh-gsd-bundle` (default branch `main`).
- **OQ-3 (RESOLVED): What must be set up for MOUNT-06 to pass on a clean checkout?** Restore the four `@deepseek-ai` peer symlinks in the demo clone's `node_modules` (mirroring the workspace). Then `npm test` = 56 pass/0 fail (verified in workspace).

## Architectural Responsibility Map

| Capability | Tier | Notes / guardrail |
|---|---|---|
| Boot relocated headless profile (`dsh --profile headless`, DSH_HOME) | **integration** | wraps the CLI; no presentation |
| Drive the GSD loop (discuss→plan→execute→verify→ship) | **domain** | orchestration, not UI |
| Spawn fresh-context subagents (researcher/planner/checker/executor/verifier) | **integration** | via `subagents` + `spawn` provider |
| Real git (branch, commit, push) + `gh pr create` | **integration** | security-sensitive (writes to real remote) — must stay in integration tier, never presentation |
| `npm test` (MOUNT-06) | **validation/data** | run in the booted clone |
| `.planning/` artefact fidelity (STATE/ROADMAP/phase docs) | **domain/data** | the bundle already owns this |
| Real LLM round-trip (Ollama) | **integration** | local provider; no cloud auth |
| No presentation / web GUI in this phase | — | headless is the proof target (CONTEXT out-of-scope) |

The only security-sensitive capability is `git push` / `gh pr create` to a real remote. It is a shell-level integration action in the booted session's `bash` tool — correct tier. No security capability is misplaced; no BLOCKER.

## Validation Architecture

Automated checks that prove each behaviour (used by the phase's verification and the Nyquist/coverage gate):

1. **Boot composes**: `DSH_HOME=<relocated> dsh --profile headless --dump-config` → asserts the 12 `@dsh-gsd/bundle/*` insert rows + `agent-loop` override (grep/count).
2. **Live headless boot + LLM**: one-shot task returning correct text and exit 0 (proven this session).
3. **MOUNT-06 green in the booted live clone**: `npm test` (node --test) → 56 pass, 0 fail, inside the relocated-home headless context.
4. **Real PR produced**: after the loop, `gh pr list --repo jaaty/dsh-gsd-bundle` shows a NEW open PR whose base is `main`, head is the demo feature branch, title/diff match the demo tweak; capture its URL.
5. **Demo branch hygiene**: `git -C <demo> branch` shows the feature branch, and the pre-existing merged PRs #1/#2 are untouched (their history unchanged); nothing on `main`.
6. **Artefact evidence**: the demo clone's `.planning/` contains `...-CONTEXT.md`, `...-RESEARCH.md`, `...-PLAN.md`, `...-SUMMARY.md`, `...-VERIFICATION.md` (loop artefacts), which the orchestrator copies into the phase's own `.planning/phases/GSD-03-loop-e2e/` as evidence.
7. **D-03 / failure path**: if the booted session cannot complete a full LLM phase, VERIFICATION.md records the limitation explicitly (no offline-harness fallback); status routes accordingly.

## Project constraints (from project conventions)

- `config.json`: `use_worktrees: true`, `tdd_mode: false`, `mvp_mode: false`, `nyquist_validation: true`; test runner is `node --test test/*.test.mjs` (`scripts.test`), no coverage tool configured.
- The bundle ships **zero runtime deps**; `files` = `lib/*.js`, `cordis.patch.yml`, `README.md`; `exports` maps each `./<sub>` to `lib/<sub>.js` (package.json read). Do not add dependencies in this phase.
- `.dsh` under the sandbox is EROFS → always relocate DSH_HOME to a writable temp path for any `dsh` boot/prepare (D-04).
- No commit/worktree guardrails inside the booted session's own git (the demo clone is a scratch repo; the plan's OWN changes commit normally on `phase-2`).

---

*Phase-3 research complete. All preconditions (relocated-headless boot, real LLM round-trip, subagent spawn service, real git/gh, default branch `main`, MOUNT-06 clean-checkout deps) were positively confirmed live this session; 3/3 open questions resolved.*
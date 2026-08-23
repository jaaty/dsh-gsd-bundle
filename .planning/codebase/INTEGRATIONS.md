# External Integrations

**Analysis Date:** 2026-08-23

## APIs & External Services

**GitHub (via `gh` CLI):**
- Used by the Ship phase (`lib/ship.js`) to create pull requests for shipped phases.
  - CLI: `gh` invoked synchronously via `execSync` from `node:child_process` (`gh(cwd, args)` helper at `lib/ship.js:28`)
  - Auth: GitHub CLI authentication (`gh auth login`); the tool hard-fails preflight with "gh CLI not available or not authenticated" when `gh auth status` throws (`lib/ship.js:77`)
  - Calls made: `gh auth status` (preflight, `lib/ship.js:77`), `gh pr create --title <title> --body-file <tmp> --base <branch> [--draft]` (`lib/ship.js:131-134`)
  - PR body assembled from planning artefacts: Summary, Changes, Requirements Addressed, Verification, Key Decisions (`lib/ship.js:92-118`)

**Git remotes (via `git` CLI):**
- Push + PR base-branch detection for shipping (`lib/ship.js`).
  - CLI: `git` — synchronous via `execSync` (`git()`/`gitOk()` helpers at `lib/ship.js:22-27`)
  - Preflight gates: clean working tree (`git status --short`, `lib/ship.js:61-63`), current branch via `git rev-parse --abbrev-ref HEAD` (`lib/ship.js:66`), protected-branch refusal (`main|master|develop|trunk|release/*`, `lib/ship.js:69`), `origin` remote via `git remote get-url origin` (`lib/ship.js:74`), push via `git push -u origin <branch>` (`lib/ship.js:80`)
  - Base branch default: `git symbolic-ref refs/remotes/origin/HEAD --short` (`lib/ship.js:67`) falling back to `main`; overridable via the `base` tool parameter

## Data Storage

**Databases:**
- None. No database, ORM, or storage engine is used.

**File Storage:**
- Local filesystem only — the `.planning/` artefact tree in the working directory, managed through the host `fs` service (not `node:fs` for planning files):
  - `lib/state.js` reads/writes via `ctx.fs.resolve()`, `ctx.fs.stat()`, `ctx.fs.readText()`, `ctx.fs.writeText()`, `ctx.fs.listDir()` (host-injected `fs` service; `inject: ["gsdState", "tools"]` per module, `fs` reached via `this.ctx.fs` inside `GsdState`)
  - Artefact layout: `.planning/PROJECT.md`, `ROADMAP.md`, `REQUIREMENTS.md`, `STATE.md`, `config.json`, `phases/<NN>-<slug>/*.md`, `.planning/quick/<YYYYMMDD>-<slug>/TASK.md`, `.planning/codebase/*.md`
  - Exceptions using `node:fs/promises`: temporary PR-body file written to `.planning/.pr-body-<phase>.md` then deleted (`lib/ship.js:125-126`), quick-task record mkdir/writeFile (`lib/quick.js:55`), and `ensureDir` for phase dirs (`lib/state.js:84`)

**Caching:**
- In-memory only — `GsdState._cache` (Map of `cwd -> { state, roadmap, ts }`) at `lib/state.js:37` for synchronous persona context reads (`cachedState()`, `lib/state.js:497`). Cleared on plugin teardown via `ctx.effect` (`lib/state.js:516`). No external cache.

## Authentication & Identity

**Auth Provider:**
- Custom / delegated to host: the bundle performs no auth itself. User identity and session auth are owned by the DSH host (`exec.agent.session`). The only external credential dependency is the `gh` CLI's own authentication (see above).

## Monitoring & Observability

**Error Tracking:**
- None — no Sentry/DataDog/etc.

**Logs:**
- No logging framework. Progress is recorded as structured text returned from each tool (which the host surfaces), plus durable state written to `.planning/STATE.md` decisions/blockers lists (`addDecision` at `lib/state.js:265`, `addBlocker` at `lib/state.js:271`) and per-phase artefacts. `rd.diagnostic` from subagent results is surfaced in tool outputs.

## CI/CD & Deployment

**Hosting:**
- Not applicable — this is a plugin bundle for the DeepSeek Harness, not a deployed service. Distribution is via `dsh plugin add` of the local bundle path (`README.md` "Install").

**CI Pipeline:**
- None. The Ship phase performs the equivalent release gate manually: verification-passed check, clean tree, branch, remote, gh auth, push, PR creation (`lib/ship.js` preflight steps 1–6, `lib/ship.js:53-81`).

## Environment Configuration

**Required env vars:**
- None read by the bundle itself (verified: no `process.env` references in `lib/`). Tool executions inherit the host/shell environment; `gh` uses its own stored credential config.

**Secrets location:**
- No secrets stored by this bundle. `gh` credentials live in the standard GitHub CLI config (`~/.config/gh/`). `.env` file: absent.

## Webhooks & Callbacks

**Incoming:**
- None — no HTTP server, no routes, no listeners. The bundle is entirely host-invoked (Cordis plugin `apply(ctx)`).

**Outgoing:**
- None — no webhook calls. The only external process invocations are `git` and `gh` CLI commands via `node:child_process` in `lib/ship.js`.

## Host Services Consumed (internal integration surface)

The bundle depends on these DSH host services (via `inject` arrays and `ctx.get`):
- `tools` — register model tools (`lib/core-tools.js:10`, all phase plugins)
- `fs` — sandboxed filesystem service for `.planning/` (reached via `this.ctx.fs` inside `GsdState`, constructed in `lib/state.js`)
- `systemPrompt` — persona section + runtime context (`lib/persona.js`, `ctx.systemPrompt.section(...)` and context provider)
- `commands` — slash-command registration (`lib/commands.js`)
- `subagents` — fresh-context subagent spawning via the `spawn` provider (`lib/_runner.js:9`; fetched via `ctx.get("subagents")`, also used in `lib/quick.js:37` and `lib/map-codebase.js`)
- `gsdState` — the bundle's own provided service (`ctx.provide("gsdState", svc)` at `lib/state.js:515`), consumed by all phase tools and the persona context provider (`ctx.get("gsdState")`)

---

*Integration audit: 2026-08-23*
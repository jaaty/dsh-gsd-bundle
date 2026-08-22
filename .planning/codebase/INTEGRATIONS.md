# External Integrations

**Analysis Date:** 2026-08-22

## APIs & External Services

**GitHub (via `gh` CLI):**
- Used by the Ship phase (`lib/ship.js`) to create pull requests for shipped phases.
  - CLI: `gh` invoked synchronously via `execSync` from `node:child_process` (`gh(cwd, args)` helper at `lib/ship.js:25`)
  - Auth: GitHub CLI authentication (`gh auth login`); the tool hard-fails preflight with "gh CLI not available or not authenticated" when `gh auth status` throws (`lib/ship.js:72`)
  - Calls made: `gh auth status` (preflight), `gh pr create --title <title> --body-file <tmp> --base <branch> [--draft]` (`lib/ship.js:126`)
  - PR body assembled from planning artefacts: Summary, Changes, Requirements Addressed, Verification, Key Decisions (`lib/ship.js:87-116`)

**Git remotes (via `git` CLI):**
- Push + PR base-branch detection for shipping (`lib/ship.js`).
  - CLI: `git` — synchronous via `execSync` (`git()`/`gitOk()` helpers at `lib/ship.js:19-27`)
  - Preflight gates: clean working tree (`git status --short`), current branch via `git rev-parse --abbrev-ref HEAD`, protected-branch refusal (`main|master|develop|trunk|release/*`), `origin` remote via `git remote get-url origin`, push via `git push -u origin <branch>`
  - Base branch default: `git symbolic-ref refs/remotes/origin/HEAD --short` falling back to `main`; overridable via the `base` tool parameter

## Data Storage

**Databases:**
- None. No database, ORM, or storage engine is used.

**File Storage:**
- Local filesystem only — the `.planning/` artefact tree in the working directory, managed through the host `fs` service (not `node:fs` for planning files):
  - `lib/state.js` reads/writes via `ctx.fs.resolve()`, `ctx.fs.stat()`, `ctx.fs.readText()`, `ctx.fs.writeText()`, `ctx.fs.listDir()` (host-injected `fs` service; `inject: ["fs"]` at `lib/state.js:459`)
  - Artefact layout: `.planning/PROJECT.md`, `ROADMAP.md`, `REQUIREMENTS.md`, `STATE.md`, `config.json`, `phases/<NN>-<slug>/*.md`, `.planning/quick/<YYYYMMDD>-<slug>/TASK.md`
  - Exception: temporary PR-body file written with `node:fs/promises` to `.planning/.pr-body-<phase>.md` then deleted in `lib/ship.js:120-130`
  - `lib/quick.js:55-57` also uses `node:fs/promises` to `mkdir`/`writeFile` the quick-task record

**Caching:**
- In-memory only — `GsdState._cache` (Map of `cwd -> { state, roadmap, ts }`) in `lib/state.js:37` for synchronous persona context reads (`cachedState()`, `lib/state.js:444`). Cleared on plugin teardown via `ctx.effect` (`lib/state.js:464`). No external cache.

## Authentication & Identity

**Auth Provider:**
- Custom / delegated to host: the bundle performs no auth itself. User identity and session auth are owned by the DSH host (`exec.agent.session`). The only external credential dependency is the `gh` CLI's own authentication (see above).

## Monitoring & Observability

**Error Tracking:**
- None — no Sentry/DataDog/etc.

**Logs:**
- No logging framework. Progress is recorded as structured text returned from each tool (which the host surfaces), plus durable state written to `.planning/STATE.md` decisions/blockers lists (`addDecision`, `addBlocker` in `lib/state.js`) and per-phase artefacts. `rd.diagnostic` from subagent results is surfaced in tool outputs.

## CI/CD & Deployment

**Hosting:**
- Not applicable — this is a plugin bundle for the DeepSeek Harness, not a deployed service. Distribution is via `dsh plugin add` of the local bundle path (`README.md` "Install").

**CI Pipeline:**
- None. The Ship phase performs the equivalent release gate manually: verification-passed check, clean tree, branch, remote, gh auth, push, PR creation (`lib/ship.js` preflight steps 1–6).

## Environment Configuration

**Required env vars:**
- None read by the bundle itself. (Tool executions inherit the host/shell environment; `gh` uses its own stored credential config.)

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
- `fs` — sandboxed filesystem service for `.planning/` (`lib/state.js:459`)
- `systemPrompt` — persona section + runtime context (`lib/persona.js:64`)
- `commands` — slash-command registration (`lib/commands.js:17`)
- `subagents` — fresh-context subagent spawning via the `spawn` provider (`lib/_runner.js:9`; injected indirectly, fetched via `ctx.get("subagents")`)
- `gsdState` — the bundle's own provided service, consumed by all phase tools and the persona context provider (`lib/state.js:463`)

---

*Integration audit: 2026-08-22*

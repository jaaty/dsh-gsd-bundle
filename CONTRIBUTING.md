# Contributing to dsh-gsd-bundle

Thanks for your interest in contributing! This project is a plugin bundle for
[DeepSeek Harness](https://github.com/deepseek-ai/dsh) that reimplements
[opengsd-core](https://github.com/open-gsd/gsd-core) — **Git Ship Done (GSD)** —
as a set of host-plane Cordis plugins. It is driven by the GSD phase loop, so
most contributions land as **phases** that move through the loop in order.

Please read the [Code of Conduct](CODE_OF_CONDUCT.md) before participating.

## Development setup

### Prerequisites

- **Node.js** (the project is `"type": "module"` and uses `node:test`).
- **DeepSeek Harness (dsh)** with the `dsh` CLI available on `PATH`, if you want
  to mount the bundle into a profile and exercise it live.
- **git** and the **GitHub CLI (`gh`)** installed and authenticated if you want
  to create pull requests via `gsd_ship`.

### Clone and install

```sh
git clone <your-fork-url> dsh-gsd-bundle
cd dsh-gsd-bundle
npm install
```

The bundle has no runtime dependencies of its own; it declares `@deepseek-ai/*`
packages as peer dependencies that the host harness provides.

## Running the test suite

The test suite is plain `node:test` files under `test/`. Run it with:

```sh
npm test
```

which runs `node --test test/*.test.mjs`. Tests use `node:test` with
`node:assert/strict`; shared helpers live in `test/helpers/`. Some tests shell
out to `git` to assert repository state (e.g. that volatile `.planning/` files
are untracked), so run them from a clean checkout.

The suite also runs in **CI** via `.github/workflows/ci.yml` on every pull
request and on push to `main`, so PRs are gated and `main` is always verified.
Use `npm test` locally before pushing to catch the same failures CI will
report.

## The GSD phase loop

This repo is driven by the **Git Ship Done** phase loop. Every unit of work is a
**phase** that moves through these steps in order:

```
Discuss → (UI design, optional) → Plan → Execute → Verify → Ship
```

- **Discuss** — capture *how* to build the thing (libraries, error strategy,
  edge cases) and seal the decisions into `.planning/phases/<NN>-<slug>/<NN>-CONTEXT.md`.
- **UI design** (optional) — produce a `UI-SPEC.md` design contract for phases
  with a non-trivial visual component.
- **Plan** — research the ecosystem and decompose the phase into bounded
  `PLAN.md` files ordered into dependency waves.
- **Execute** — run the plans with fresh-context executors, one atomic commit
  per task.
- **Verify** — check the phase goal was *actually* achieved, not just that
  execution finished without errors.
- **Ship** — push the branch, create the pull request, and mark the phase
  shipped.

State survives across sessions and context resets on disk under `.planning/`,
with `STATE.md` as the navigation spine. Heavy work (research, planning,
execution, verification) runs in fresh-context subagents.

## Contribution workflow

Contributions follow the GSD ship flow:

1. **Create a feature branch** for your work. Phases run on a `phase-<N>`
   feature branch (e.g. `phase-26`).
2. **Drive the phase through the loop** — `gsd_discuss` → (optional
   `gsd_ui_phase`) → `gsd_plan` → `gsd_execute` → `gsd_verify` → `gsd_ship`.
   Each step commits its planning artefacts atomically.
3. **Ship the phase** — `gsd_ship` runs a set of capability gates
   (`security`, `broken-windows`, `tdd-audit`) before creating the pull
   request. It reports each gate's pass/fail status and refuses to ship when a
   required gate fails. On success it pushes the branch and creates the PR via
   the `gh` CLI.
4. **Open a pull request** — the PR body is assembled from the phase's planning
   artefacts (summary, changes, requirements addressed, verification, key
   decisions).

For small, sub-threshold changes that don't warrant the full loop, use
`gsd_quick` instead.

A **gitleaks** secret-scan guard runs on every pull request (in
`.github/workflows/ci.yml`) and fails the PR if a new credential or token is
introduced. Keep secrets out of commits and `.planning/` artefacts (see
[Hygiene](#hygiene-no-secrets-in-planning) below).

## Hygiene: no secrets in `.planning/`

The durable subset of `.planning/` is **committed to the repository** — the GSD
loop needs it to orient across sessions. Because it is committed, **never paste
real credentials, tokens, API keys, or other secrets into `.planning/`
artefacts** (CONTEXT, PLAN, SUMMARY, VERIFICATION, RESEARCH, or any other file
under `.planning/`). If you need to reference a secret, use a placeholder and
document where the real value lives outside the repo.

## Reporting issues

Please report bugs and feature requests via the
[GitHub issues tracker](https://github.com/jaaty/dsh-gsd-bundle/issues).

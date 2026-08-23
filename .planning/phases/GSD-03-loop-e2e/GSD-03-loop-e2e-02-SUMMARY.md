---
phase: 03-loop-e2e
plan: 02
subsystem: loop-e2e
tags: [MOUNT-05, MOUNT-06, e2e, live-boot, PR, gh, npm-test]
dependency_graph:
  requires:
    - "GSD-03-loop-e2e-01 (proven relocated-headless live boot + gsd tool binding)"
  provides:
    - "loop-e2e.sh — runnable single-job driver that bootstraps /tmp/dshhome, clones the repo, restores the four @deepseek-ai peer symlinks, boots the headless session to drive a tiny demo phase through the full gsd loop, creates a real PR, runs npm test, and captures evidence"
    - "e2e-proof.md — captured genuine e2e evidence: PR URL + base/head, demo branch list, MOUNT-06 npm test result, demo .planning/ artifacts copied back"
    - "demo-artifacts/ — the DEMO-01-demo loop artefacts (CONTEXT/DISCUSSION-LOG/RESEARCH/PLAN/SUMMARY/VERIFICATION) copied as durable evidence"
  affects:
    - "GSD-03-loop-e2e verification (consumes e2e-proof.md + demo-artifacts/)"
tech-stack: [bash, dsh CLI, @deepseek-ai/dsh-app-boot, @deepseek-ai/dsh-headless, Ollama, git, gh]
key-files:
  created:
    - ".planning/phases/GSD-03-loop-e2e/loop-e2e.sh"
    - ".planning/phases/GSD-03-loop-e2e/e2e-proof.md"
    - ".planning/phases/GSD-03-loop-e2e/demo-artifacts/DEMO-01-demo-CONTEXT.md"
    - ".planning/phases/GSD-03-loop-e2e/demo-artifacts/DEMO-01-demo-DISCUSSION-LOG.md"
    - ".planning/phases/GSD-03-loop-e2e/demo-artifacts/DEMO-01-demo-RESEARCH.md"
    - ".planning/phases/GSD-03-loop-e2e/demo-artifacts/DEMO-01-demo-01-PLAN.md"
    - ".planning/phases/GSD-03-loop-e2e/demo-artifacts/DEMO-01-demo-01-SUMMARY.md"
    - ".planning/phases/GSD-03-loop-e2e/demo-artifacts/DEMO-01-demo-VERIFICATION.md"
  modified: []
decisions:
  - "loop-e2e.sh reuses plan-01's live-boot.sh (bootstrap_home) by sourcing it, with an inline fallback, so the relocated-home step is not silently skipped (D-01/D-04)."
  - "The demo phase runs in a throwaway clone at /tmp/demo on its own branch demo-loop-e2e; the durable proof is the real PR on the remote (D-06)."
  - "The headless boot task instructs the booted agent to run the full loop and reply with the created PR URL; PR_URL is extracted from the boot log (D-02)."
  - "MOUNT-06 clean-checkout prerequisite: the four @deepseek-ai peer symlinks (cordis/dsh-llm/dsh-tools/schemastery) are restored in the demo checkout before npm test (D-07, RESEARCH)."
  - "The driver always runs capture and finishes non-destructively; a failed loop is recorded, not silently passed (D-03)."
  - "Because job-local /tmp is wiped across tool calls, the durable evidence was reconstructed from the remote (PR, pushed branch, commit trail, PR tree) and MOUNT-06 re-asserted on that exact branch via a worktree."
metrics:
  duration: "2026-08-23"
  completed_date: "2026-08-23"
  actuals:
    tasks: 2
    commits: 3
status: complete
---

# Phase 03 Plan 02: loop-e2e — Summary

Proved MOUNT-05 end-to-end: a freshly booted headless DSH session drove one
tiny real demo phase through the full GSD loop (Discuss → Plan → Execute →
Verify → Ship) using real LLM subagents, real git and real gh, and shipped it
as a genuine PR — https://github.com/jaaty/dsh-gsd-bundle/pull/3 — while
MOUNT-06 (npm test) was re-asserted green (56/0) on the booted session's
shipped content.

## What was built

- `loop-e2e.sh` — a runnable, executable single-job driver (functions
  `bootstrap_home`, `clone_demo`, `boot_loop`, `capture`, sourced from the
  plan-01 `live-boot.sh` recipe with an inline fallback) that bootstraps
  `/tmp/dshhome`, clones the repo to `/tmp/demo` on branch `demo-loop-e2e`,
  restores the four `@deepseek-ai` peer symlinks, boots the headless session to
  run the full demo phase and create a real PR, and captures npm test + branch +
  gh pr list + artefacts.
- `e2e-proof.md` — the genuine evidence (PR URL/base/head, branch list, commit
  trail, MOUNT-06 result, copied artefact list).
- `demo-artifacts/` — the six DEMO-01-demo loop artefacts copied from the
  shipped PR as durable evidence.

## Task results

- Task 1 (loop-e2e.sh): written, `bash -n` clean, all four grep acceptance
  checks pass. Committed `c65857a`.
- Task 2 (genuine e2e run + e2e-proof.md): the full-loop run completed and a
  real PR was created (#3). Evidence captured and committed `43407e9`.
- Fix (deviation): `boot_loop` cd'd into the demo clone + e2e-proof deviation
  note. Committed `cfc42db`. (Final commit set: `c65857a`, `43407e9`,
  `cfc42db`.)

## The genuine end-to-end outcome (MOUNT-05)

- **PR #3** `demo-e2e: add README line`, base `main`, head `demo-loop-e2e`,
  OPEN — https://github.com/jaaty/dsh-gsd-bundle/pull/3
- Demo branch on remote: `refs/heads/demo-loop-e2e`; `main` unchanged; merged
  PRs #1/#2 untouched (D-06).
- Demo commit trail proving the loop ran inside the booted session:
  - `7d5211a docs(DEMO-01-demo-01): add demo-e2e loop line to README` (Execute)
  - `7a6bb4f chore(DEMO-01-demo): add demo-e2e project scaffolding and phase artefacts` (Discuss + Plan)
  - `09bd48c chore(DEMO-01-demo): mark phase shipped — PR #3` (Ship)
- The PR's tree carries the full `DEMO-01-demo/` artefact set
  (CONTEXT/DISCUSSION-LOG/RESEARCH/PLAN/SUMMARY/VERIFICATION) — evidence all
  five loop steps produced artefacts inside the booted session.
- No D-03 limitation: the loop SUCCEEDED; no offline-harness evidence is used
  as the full-loop proof.

## MOUNT-06 (D-07)

`npm test` re-asserted on the demo branch content
(`09bd48c`, the exact commit the booted session pushed) with the four peer
symlinks restored: **56 pass / 0 fail / exit 0**.

## Deviation (fixed during execution — boot ran in the workspace, not /tmp/demo)

The first `boot_loop()` did not `cd "$DEMO_DIR"`, so the booted session's git
working directory was the **workspace** (the real repo) rather than the
throwaway `/tmp/demo` clone. The booted session created a local
`demo-loop-e2e` branch here (built on `main`), committed the demo phase onto it,
pushed it to `origin/demo-loop-e2e`, and created PR #3. The PR is genuine and
its base/head/diff are clean (main + demo branch); `/tmp/demo` was created but
unused by the loop.

The accidental local `demo-loop-e2e` branch (which had picked up this plan's
Task-2 commit on top of the pushed branch) was deleted after the Task-2 evidence
files were re-applied onto the orchestrator's `phase-3` branch;
`origin/demo-loop-e2e` (PR #3) is unchanged. `boot_loop` was fixed to
`(cd "$DEMO_DIR" && dsh …)` so a rerun would use the throwaway clone.

## Requirements addressed

- MOUNT-05 — a full phase ran through the loop in a live headless session and
  shipped a genuine PR (#3).
- MOUNT-06 — npm test green (56/0) re-asserted on the booted phase's content.

## TDD Gate Compliance

No TDD gate applies: config.json sets `tdd_mode: false`; this plan ships a bash
driver + captured evidence, not code under test.

## Known Stubs

None. No TODO/FIXME/placeholder in loop-e2e.sh; no skipped tests.

## Threat Flags

The driver triggers real `git push` and `gh pr create` to the real remote — by
design for this e2e proof, scoped to its own feature branch
(`demo-loop-e2e`) against `main`; it does not modify the already-merged PRs
#1/#2 and never force-pushes. `settings.yaml` copied from `~/.dsh` contains no
secrets (the ollama bearer is inline and non-sensitive); no credential material
is written. The demo clone is a scratch repo; no shell-injection surface (task
string is fixed, no user-controlled input interpolated beyond env overrides).

## Self-Check

- loop-e2e.sh exists, is executable, `bash -n` clean, encodes the full
  relocate→clone→loop→PR→npm-test→evidence recipe. (PASS)
- e2e-proof.md exists, non-empty, contains a real PR url and npm-test result.
  (PASS)
- demo-artifacts/ contains the six DEMO-01-demo loop artefacts, tracked by git.
  (PASS)
- Commits present on `phase-3`: `c65857a` (Task 1), `43407e9` (Task 2),
  `cfc42db` (deviation fix). (PASS)

## Self-Check: PASSED

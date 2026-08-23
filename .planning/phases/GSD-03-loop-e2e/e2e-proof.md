# Phase 03 (loop-e2e) — End-to-End Proof (MOUNT-05 / MOUNT-06)

Captured 2026-08-23 by plan GSD-03-loop-e2e-02. This is genuine end-to-end
evidence: a freshly booted headless DSH session (`dsh --profile headless` with
`DSH_HOME=/tmp/dshhome`) drove ONE real demo phase through the FULL GSD loop
(Discuss → Plan → Execute → Verify → Ship) using real LLM subagents
(researcher/planner/checker/executor/verifier via the `subagents`/`spawn`
service), real git, and real `gh`, producing a real PR on its own feature
branch against `main`. No offline-harness evidence is used (D-03 honored).

## The demo phase (D-05)

A tiny, self-contained, non-destructive phase `DEMO-01-demo` whose goal was to
add one line to `README.md`. The booted session ran the whole loop for it and
shipped it as PR #3.

## Result: a genuine PR was created (D-01/D-02/D-06)

```
gh pr view 3 --repo jaaty/dsh-gsd-bundle --json number,title,baseRefName,headRefName,url,state
{"baseRefName":"main","headRefName":"demo-loop-e2e","number":3,
 "state":"OPEN","title":"demo-e2e: add README line",
 "url":"https://github.com/jaaty/dsh-gsd-bundle/pull/3"}
```

- **PR URL:** https://github.com/jaaty/dsh-gsd-bundle/pull/3
- **Base:** `main` (the repo default branch) — satisfies D-06.
- **Head:** `demo-loop-e2e` (own feature branch) — satisfies D-06 (does not
  disturb the merged PRs #1/#2).
- **Title:** `demo-e2e: add README line`
- **State:** OPEN.

The PR's changed files include the demo tweak plus the full demo-phase
`.planning/` loop artefacts under `.planning/phases/DEMO-01-demo/`
(CONTEXT.md, DISCUSSION-LOG.md, RESEARCH.md, PLAN.md, SUMMARY.md,
VERIFICATION.md) — evidence the whole loop ran inside the booted session.

## Demo branch list (remote refs)

```
git ls-remote --heads origin
09bd48c518acdf63233b581d6f7bd8e072f2e92c  refs/heads/demo-loop-e2e
fca01eee7e40f2f687af6e324b29ff7bea61b5f1  refs/heads/main
```

Pre-existing merged PRs #1 (phase-1) and #2 (phase-2) are unchanged; nothing was
pushed to `main`.

## Demo branch commit trail (the loop steps)

```
09bd48c chore(DEMO-01-demo): mark phase shipped — PR #3      # Ship
7a6bb4f chore(DEMO-01-demo): add demo-e2e project scaffolding and phase artefacts   # Discuss + Plan
7d5211a docs(DEMO-01-demo-01): add demo-e2e loop line to README   # Execute
```

The demo tweak (from `git diff origin/main origin/demo-loop-e2e -- README.md`):

```
 # dsh-gsd-bundle
+This repository also runs a tiny demo-e2e phase through the full GSD loop (Discuss → Plan → Execute → Verify → Ship).
```

## MOUNT-06 (npm test) re-asserted live (D-07)

`npm test` (`node --test test/*.test.mjs`) was re-asserted on the demo phase's
final state — the exact commit the booted session pushed
(`09bd48c`, `origin/demo-loop-e2e`) — with the four `@deepseek-ai` peer
symlinks (`cordis`, `dsh-llm`, `dsh-tools`, `schemastery`) restored
(the clean-checkout prerequisite). Result:

```
tests 56 | suites 27 | pass 56 | fail 0 | cancelled 0 | skipped 0 | todo 0
NPM_TEST_EXIT=0
```

**56 pass / 0 fail / exit 0** — the green baseline, re-asserted on the booted
session's shipped content.

## Demo .planning/ loop artefacts (copied as evidence)

Copied into `.planning/phases/GSD-03-loop-e2e/demo-artifacts/`:

- `DEMO-01-demo-CONTEXT.md`
- `DEMO-01-demo-DISCUSSION-LOG.md`
- `DEMO-01-demo-RESEARCH.md`
- `DEMO-01-demo-01-PLAN.md`
- `DEMO-01-demo-01-SUMMARY.md`
- `DEMO-01-demo-VERIFICATION.md`

## D-03 limitation note

**Not applicable — the full-loop run SUCCEEDED.** The booted session completed
the entire loop and produced a genuine PR (#3). There is no limitation to
record and no offline-harness evidence is presented as the full-loop proof.

## Deviation note (honesty — the loop ran in the workspace, not /tmp/demo)

The `boot_loop()` step of `loop-e2e.sh` did **not** `cd "$DEMO_DIR"` before
invoking `dsh`, so the booted session's git working directory was the workspace
(the real repo), not the throwaway `/tmp/demo` clone. The booted session created
a local `demo-loop-e2e` branch here (built on `main`), committed the demo phase
onto it, pushed it to `origin/demo-loop-e2e`, and created PR #3. The PR is
therefore genuine and its base/head/diff are clean (main + demo branch). The
`/tmp/demo` clone was created but unused by the loop.

The durable evidence was reconstructed from the remote: the PR (#3), the pushed
`demo-loop-e2e` branch, its commit trail, and the PR's full tree of `.planning/`
artefacts. MOUNT-06 was re-asserted by checking out that exact branch in a
worktree and running `npm test`. The accidental local `demo-loop-e2e` branch
(which had picked up this plan's Task-2 commit on top of the pushed branch) was
deleted after the Task-2 evidence files were re-applied onto the orchestrator's
`phase-3` branch; `origin/demo-loop-e2e` (PR #3) is unchanged. All evidence
above comes from these durable sources.

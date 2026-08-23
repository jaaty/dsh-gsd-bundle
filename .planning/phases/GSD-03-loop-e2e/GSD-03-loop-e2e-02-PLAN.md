---
phase: 03-loop-e2e
plan: 02
type: execute
wave: 2
depends_on: ["GSD-03-loop-e2e-01"]
files_modified: [".planning/phases/GSD-03-loop-e2e/loop-e2e.sh", ".planning/phases/GSD-03-loop-e2e/e2e-proof.md"]
autonomous: true
requirements: ["MOUNT-05", "MOUNT-06"]
user_setup: []
must_haves:
  truths:
    - "A NEW open PR exists on github.com/jaaty/dsh-gsd-bundle whose base is main and head is a fresh demo feature branch, with a title/diff matching the demo tweak; its URL is captured (per D-05/D-06, own branch, base = default branch main)."
    - "The demo clone's .planning/ contains the per-phase loop artefacts (…-CONTEXT.md, …-RESEARCH.md, …-PLAN.md, …-SUMMARY.md, …-VERIFICATION.md) for the demo phase, and copies are captured into .planning/phases/GSD-03-loop-e2e/ as evidence."
    - "npm test (node --test test/*.test.mjs) exits 0 in the booted live clone (MOUNT-06 re-asserted live, per D-07), with the four @deepseek-ai peer symlinks restored before the run."
    - "If the booted session could not drive a full real-LLM loop, the limitation is recorded explicitly in e2e-proof.md / the phase verification (per D-03); no offline-harness evidence is presented as the full-loop proof."
  artifacts:
    - path: ".planning/phases/GSD-03-loop-e2e/loop-e2e.sh"
      provides: "Runnable single-job orchestrator that bootstraps /tmp/dshhome (reusing the plan-01 recipe) plus a throwaway clone of the repo, restores the four @deepseek-ai peer symlinks, boots the headless session to drive a tiny demo phase through the full gsd loop (discuss→plan→execute→verify→ship), creates a real PR via gh pr create, runs npm test, and copies the demo .planning/ evidence back into the phase dir."
      min_lines: 80
      exports: []
    - path: ".planning/phases/GSD-03-loop-e2e/e2e-proof.md"
      provides: "Captured end-to-end evidence: the new PR URL + base/head, the demo branch list, npm test result, the list of demo .planning/ artifacts copied back, and (if applicable) the explicit D-03 limitation note."
      min_lines: 20
      exports: []
  key_links:
    - from: "loop-e2e.sh (boot + clone + loop orchestration)"
    - to: "gh CLI (gh pr create / gh pr list)"
      via: "gh pr create --base main --head <demo-feature-branch> from inside the throwaway clone"
      pattern: "gh pr create --base main"
---

<objective>Run one real demo phase through the FULL GSD loop inside a freshly booted headless DSH session (real LLM subagents, real git, real gh) and ship it as a genuine PR on its own feature branch against main, while re-asserting MOUNT-06 (npm test green) in the booted clone. Depends on plan 01 having proven the relocated-headless boot + live tool binding recipe.</objective>

<context>@.planning/phases/GSD-03-loop-e2e/GSD-03-loop-e2e-RESEARCH.md, @.planning/phases/GSD-03-loop-e2e/GSD-03-loop-e2e-01-PLAN.md, @.planning/phases/GSD-03-loop-e2e/live-boot.sh, @cordis.patch.yml, @package.json</context>

<tasks>
  <task type="auto">
    <name>Task 1: Tracer — write loop-e2e.sh that runs a full demo phase to a real PR in one job</name>
    <files>.planning/phases/GSD-03-loop-e2e/loop-e2e.sh</files>
    <read_first>.planning/phases/GSD-03-loop-e2e/GSD-03-loop-e2e-RESEARCH.md, .planning/phases/GSD-03-loop-e2e/GSD-03-loop-e2e-01-PLAN.md</read_first>
    <action>Create the runnable bash script loop-e2e.sh under .planning/phases/GSD-03-loop-e2e/ that performs the entire end-to-end run in ONE invocation (because /tmp is ephemeral across bash calls, per RESEARCH). Implement these functions in order:

(1) `bootstrap_home()`: recreate `/tmp/dshhome` exactly as plan 01's live-boot.sh does (bundles package.json, empty cordis.patch.yml, `node_modules/@dsh-gsd/bundle` symlink to the workspace bundle root, copied settings.yaml). Reuse the code from live-boot.sh by sourcing it or copying the function — do not silently skip this step.

(2) `clone_demo()`: create a throwaway clone of the real repo at `/tmp/demo` via `git clone <origin> /tmp/demo` (origin = github.com/jaaty/dsh-gsd-bundle.git, remote https). Then restore the clean-checkout prerequisite for MOUNT-06 (per RESEARCH): create `/tmp/demo/node_modules` and symlink the four @deepseek-ai peers (`cordis`, `dsh-llm`, `dsh-tools`, `schemastery`) to the workspace's resolved copies so `node --test` resolves them. Create a fresh feature branch `git -C /tmp/demo checkout -b demo-loop-e2e`.

(3) `boot_loop()`: from `/tmp/demo`, run `DSH_HOME=/tmp/dshhome dsh --profile headless '<task>'` where `<task>` instructs the booted agent to: initialize a tiny GSD demo phase (a trivial non-destructive tweak such as adding one line to README.md, per D-05), run it through discuss→plan→execute→verify→ship using the gsd_* tools (real LLM subagents via the subagents/spawn service, real git commit, real `gh pr create --base main`), and reply with the created PR URL. This is the ambitious single-task loop drive; the script must capture stdout+stderr to a log and print `PR_URL=<url>` when the reply contains a github.com/…/pull/ URL, else print `PR_URL=NONE`.

(4) `capture()`: after boot_loop, collect and print: `git -C /tmp/demo branch` (expect the demo feature branch), `gh pr list --repo jaaty/dsh-gsd-bundle --state open` (expect a NEW PR whose base is main), and `ls /tmp/demo/.planning/phases/<demo-phase>/` (the per-phase artefacts). Print `LOOP_EXIT=<N>`.

The script must run to completion even if a middle step fails, so a later evidence step can still record the limitation (per D-03).</action>
    <verify>test -f .planning/phases/GSD-03-loop-e2e/loop-e2e.sh && bash -n .planning/phases/GSD-03-loop-e2e/loop-e2e.sh</verify>
    <acceptance_criteria>
      - "grep -q 'gh pr create' .planning/phases/GSD-03-loop-e2e/loop-e2e.sh"
      - "grep -q 'dsh --profile headless' .planning/phases/GSD-03-loop-e2e/loop-e2e.sh"
      - "grep -q 'npm test' .planning/phases/GSD-03-loop-e2e/loop-e2e.sh"
      - "bash -n .planning/phases/GSD-03-loop-e2e/loop-e2e.sh exits 0"
    </acceptance_criteria>
    <done>loop-e2e.sh exists, passes bash -n, and encodes bootstrap→clone→loop→PR→npm-test→evidence in one job per D-02.</done>
  </task>

  <task type="auto">
    <name>Task 2: Run loop-e2e.sh in one job, then write e2e-proof.md evidence (MOUNT-05/MOUNT-06 + D-03)</name>
    <files>.planning/phases/GSD-03-loop-e2e/e2e-proof.md</files>
    <read_first>.planning/phases/GSD-03-loop-e2e/loop-e2e.sh</read_first>
    <action>Run the driver script from Task 1 via a SINGLE bash invocation (foreground, or a background job if it may exceed the command timeout — /tmp persists for the duration of that one job). This is the genuine e2e run. Capture the full output, then write `.planning/phases/GSD-03-loop-e2e/e2e-proof.md` containing, in order: the demo feature branch name, the new PR URL with its base and head (from `gh pr view <pr> --repo … --json baseRefName,headRefName,title,url`), the `git branch` output of the demo clone, the `npm test` result (pass/fail + test count) from the booted clone, the list of demo `.planning/phases/<demo>/` artefacts that were copied into this phase dir as evidence, and — if `PR_<url>=NONE` or `LOOP_EXIT != 0` — an explicit "D-03 limitation" section stating the booted session could not complete a full real-LLM loop (no offline-harness evidence is used as the full-loop proof). Copy the demo clone's per-phase artefact files (CONTEXT/RESEARCH/PLAN/SUMMARY/VERIFICATION) into `.planning/phases/GSD-03-loop-e2e/demo-artifacts/` as durable evidence.</action>
    <verify>test -s .planning/phases/GSD-03-loop-e2e/e2e-proof.md && ls .planning/phases/GSD-03-loop-e2e/demo-artifacts/ >/dev/null 2>&1 || true</verify>
    <acceptance_criteria>
      - "test -f .planning/phases/GSD-03-loop-e2e/e2e-proof.md"
      - "grep -qiE 'PR_?URL|pull/[0-9]+' .planning/phases/GSD-03-loop-e2e/e2e-proof.md || grep -qi 'D-03 limitation' .planning/phases/GSD-03-loop-e2e/e2e-proof.md"
      - "grep -qi 'npm test' .planning/phases/GSD-03-loop-e2e/e2e-proof.md"
    </acceptance_criteria>
    <done>e2e-proof.md captures the real PR (or the explicit D-03 limitation) plus the MOUNT-06 npm test result and the copied demo artefacts, giving the verifier the genuine end-to-end evidence.</done>
  </task>
</tasks>

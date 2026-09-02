# Roadmap — upstream-parity (v3.0.0)

51 phase(s) | requirements mapped per phase

| # | Phase | Goal | Requirements |
|---|-------|------|--------------|
| 01 | [x] live-mount | Mount the bundle into a DSH profile and verify all 12 plugin rows activate and the patch merges cleanly over dsh-base. | MOUNT-01 … MOUNT-02 |
| 02 | [x] service-tools | Prove the gsdState service round-trips .planning/ artefacts and every gsd_* phase tool registers with a valid schema and passes a smoke call. | MOUNT-03 … MOUNT-04 |
| 03 | [x] loop-e2e | Run one full phase through the loop (Discuss → Plan → Execute → Verify → Ship) in a live session and capture the produced PR. | MOUNT-05 … MOUNT-06 |
| 04 | [x] checkpoint-resume | Implement checkpoint state capture + resume in gsd_execute so an interrupted phase can be resumed from the last checkpoint (skip completed tasks, continue). | DUR-01 … DUR-02 |
| 05 | [x] window-ledger | Add the WINDOWS.md multi-window ledger and an async-jobs manifest, and surface both through gsd_status. | DUR-03 … DUR-04 |
| 06 | [x] loop-robustness | Fix the planner depends_on project-code-prefix bug and route gsd_quick's TASK.md write through the gsd artefact model. | DUR-05 … DUR-06 |
| 07 | [x] uat-conversation | Implement the conversational UAT loop: an executor stopping at a checkpoint:decision or checkpoint:human-action task surfaces a human-facing question, and gsd_execute pauses the phase, waits for the human's answer, and resumes the checkpointed plan with that answer applied so the phase completes. | UAT-01 … UAT-02 |
| 08 | [x] capability-gates | Implement the capability-gate gatekeeper in gsd_ship: before creating the PR, gsd_ship runs a set of capability gates (security, broken-windows, TDD-audit), reports each gate's pass/fail status, and refuses to ship when any required gate fails with a clear report of what failed and why. | CAP-01 … CAP-02 |
| 09 | [x] job-runtime | Implement a real background-job runtime: a job runner that actually executes a job asynchronously, tracks its lifecycle (running → done/failed) in the async-jobs manifest, collects and surfaces the result when it finishes, and reflects real async state through gsd_status. | JOB-01 … JOB-02 |
| 10 | [x] codebase-query | Implement a query/intel mode for the codebase mapper: a gsd_map_codebase --query path that answers a question against the existing .planning/codebase/ map and the codebase itself without a full re-scan, surfaced through gsd_map_codebase and returning a targeted answer. | CBQ-01 … CBQ-02 |
| 11 | [x] phase-dir-resolution | Resolve the phase directory and base once per tool invocation and pass them down, removing the repeated readRoadmap/readConfig and the duplicated base derivation. | CQ-01 |
| 12 | [x] single-source-constants | Make GATE_NAMES and the secret-file list single-source and route cwdOf through the shared helper. | CQ-02 |
| 13 | [x] gate-dispatch | Replace the gate name condition chain with an explicit dispatcher map and derive the commit scope from structured plan fields. | CQ-03 |
| 14 | [x] execute-checkpoint | Extract the checkpoint prepare/process logic in gsd_execute into helpers and reuse the planIndex runnable set. | CQ-04 |
| 15 | [x] ship-robustness | Make git/gh calls async and report preflight failures with their real cause. | CQ-05 |
| 16 | [x] context-budget | Give planningContext a total truncation budget and surface truncation, plus small dedup fixes. | CQ-06 |
| 17 | [x] phase-branch-isolation | Acquire a per-phase feature branch at gsd_discuss and have each phase tool commit its planning artefacts, so gsd_ship preflight passes on a clean feature branch. | CQ-07 |
| 18 | [x] job-runtime-extensions | Extend the background-job runtime to launch subagent jobs, enforce timeouts/cancellation, expose a gsd_job launch tool, and support retry/queueing. | JOBX-01 … JOBX-02 … JOBX-03 … JOBX-04 |
| 19 | [x] codebase-intel-extensions | Extend gsd_map_codebase with drift detection, targeted re-map/updater, a structured answer object, and subtree query scoping. | CBQX-01 … CBQX-02 … CBQX-03 … CBQX-04 |
| 20 | [x] multi-window-topology | Support concurrent multi-window phases on a shared base branch with a merge topology, earlier phase-branch push, and auto-commit of out-of-flow artefacts. | MW-01 … MW-02 … MW-03 |
| 21 | [x] capability-services | Each step plugin publishes a capability service declaring the loop step it provides, and the persona and slash-command layer declare coeffects on the capabilities they need. | DEGR-01 … DEGR-03 |
| 22 | [x] reactive-loop-rendering | Re-render the persona, runtime-context snapshot, and gsd_status from the available step capabilities so absent steps are skipped and no missing tool is ever instructed. | DEGR-02 … DEGR-04 |
| 23 | [x] removal-verification | Add an automated per-plugin removal test proving every single step plugin can be retired with its effects reverted and the remaining loop still functional end-to-end. | DEGR-05 |
| 24 | [x] composability-hardening | Effect-scope the background-job live registry to its owning fiber and declare the subagents coeffect in every consuming plugin so temporal and spatial composability hold for the job runtime and subagent paths. | DEGR-06 … DEGR-07 |
| 25 | [x] license-and-attribution | Add an MIT LICENSE file, verify opengsd-core attribution and license compliance, and fix the broken gsd-core-reference.md reference in the README. | PUB-01 … PUB-02 |
| 26 | [x] repo-hygiene | Add a CHANGELOG, CONTRIBUTING.md, and code of conduct, and make and apply the .planning/ directory keep-vs-gitignore-vs-curate decision. | PUB-03 |
| 27 | [x] ci-and-security | Add a GitHub Actions test workflow and run a full-history secret scan to confirm no credentials or tokens are exposed. | PUB-04 |
| 28 | [x] publish-research | Research how other dsh plugins are distributed (npm publish vs clone-and-install-from-source) and document a research-backed distribution decision. | PUB-05 |
| 29 | [x] pre-ship-verify | Add a deterministic pre-ship local verification gate to gsd_ship that runs a clean npm ci + npm test in a temp copy of the repo before pushing, fails the ship on failure, and is skippable via a flag. | SHIP-01 |
| 30 | [x] publishable-package | Make package.json publish-ready for v2.2.0: bump the version to match the milestone, add the missing metadata fields (repository, homepage, bugs, keywords, engines, author), and expand the files field to ship every doc the README links to. [REL-01] | REL-01 |
| 31 | [x] npm-publish | Publish @dsh-gsd/bundle to the npm registry as v2.2.0, satisfying the prepublishOnly test gate, and verify the published package is installable. [REL-02] | REL-02 |
| 32 | [x] security-policy-templates | Add a SECURITY.md vulnerability-reporting policy and GitHub issue + pull-request templates so public contributors know how to report issues and open PRs. [REL-03] | REL-03 |
| 33 | [x] github-repo-config | Configure the GitHub repository with searchable topics and a homepage URL for discoverability and canonical linking. [REL-04] | REL-04 |
| 34 | [x] readme-badges | Add CI-status, license, and npm-version badges to the README so the public repo signals health and provenance at a glance. [REL-05] | REL-05 |
| 35 | [x] pr-branch | Add a clean-PR-branch path so gsd_ship creates a review branch that filters out .planning/ commits, leaving reviewers with only real code changes. | GAP-01 |
| 36 | [x] spec-phase | Add a spec-phase step that produces a SPEC.md with falsifiable requirements gated by an ambiguity-scoring score before discuss. | GAP-02 |
| 37 | [x] gap-analysis | Add a post-planning gap-analysis that emits a REQ-ID/D-ID versus plan-body coverage table after PLAN.md generation. | GAP-03 |
| 38 | [x] code-review | Add a code-review pass that reviews a phase's changed source into REVIEW.md and a --fix companion that applies findings with per-fix atomic commits into REVIEW-FIX.md. | GAP-04 |
| 39 | [x] ui-review | Add a retroactive 6-pillar UI audit that reviews implemented frontend code against the UI-SPEC. | GAP-05 |
| 40 | [x] validate-phase | Add a retro validate-phase audit that maps executed work to tests and manual evidence and produces tests to close validation gaps for a completed phase. | GAP-06 |
| 41 | [x] undo | Add a safe undo path that rolls back a phase's or plan's commits via the phase manifest with dependency checks and a confirmation gate. | GAP-07 |
| 42 | [x] health | Add a health diagnostic that inspects .planning/ integrity and offers non-destructive repair. | GAP-08 |
| 43 | [x] milestone-audit | Add milestone close-gate and cross-phase UAT audits that confirm a milestone met its definition of done before close. | GAP-09 |
| 44 | [x] learnings | Add an extract-learnings path that accumulates decisions, lessons, patterns, and surprises into a carrying-forward LEARNINGS.md. | GAP-10 |
| 45 | graphify | Add a project knowledge graph built in .planning/graphs/ with a tool to build, query, and inspect it. | GAP-11 |
| 46 | mempalace | Add a cross-session memory integration that performs deliberate recall before discuss/plan and verbatim capture at phase boundaries. | GAP-12 |
| 47 | assumption-delta | Add an advisory assumption-delta checkpoint that surfaces one identity-model question when a phase makes something plural/optional/chosen that used to be singular/required/derived. | GAP-13 |
| 48 | pause-resume-work | Add pause-work and resume-work commands that write a structured context handoff (HANDOFF.json) and restore full context to continue work mid-phase. | GAP-14 |
| 49 | autonomous | Add an autonomous path that drives all remaining phases of a milestone end-to-end without per-phase manual prompting. | GAP-15 |
| 50 | add-tests | Add an add-tests generator that creates unit and E2E tests for a completed phase from its UAT criteria and implementation. | GAP-16 |
| 51 | drop-clean-branch | Remove the clean-PR branch feature so gsd_ship pushes and PRs the phase-NN branch directly, leaving one branch per phase. | SHIP-CLEAN-01 … SHIP-CLEAN-04 |

## Progress

| # | Phase | Status | Date |
|---|-------|--------|------|
| 01 | live-mount | [x] Complete | 2026-09-01 |
| 02 | service-tools | [x] Complete | 2026-09-01 |
| 03 | loop-e2e | [x] Complete | 2026-09-01 |
| 04 | checkpoint-resume | [x] Complete | 2026-09-01 |
| 05 | window-ledger | [x] Complete | 2026-09-01 |
| 06 | loop-robustness | [x] Complete | 2026-09-01 |
| 07 | uat-conversation | [x] Complete | 2026-09-01 |
| 08 | capability-gates | [x] Complete | 2026-09-01 |
| 09 | job-runtime | [x] Complete | 2026-09-01 |
| 10 | codebase-query | [x] Complete | 2026-09-01 |
| 11 | phase-dir-resolution | [x] Complete | 2026-09-01 |
| 12 | single-source-constants | [x] Complete | 2026-09-01 |
| 13 | gate-dispatch | [x] Complete | 2026-09-01 |
| 14 | execute-checkpoint | [x] Complete | 2026-09-01 |
| 15 | ship-robustness | [x] Complete | 2026-09-01 |
| 16 | context-budget | [x] Complete | 2026-09-01 |
| 17 | phase-branch-isolation | [x] Complete | 2026-09-01 |
| 18 | job-runtime-extensions | [x] Complete | 2026-09-01 |
| 19 | codebase-intel-extensions | [x] Complete | 2026-09-01 |
| 20 | multi-window-topology | [x] Complete | 2026-09-01 |
| 21 | capability-services | [x] Complete | 2026-09-01 |
| 22 | reactive-loop-rendering | [x] Complete | 2026-09-01 |
| 23 | removal-verification | [x] Complete | 2026-09-01 |
| 24 | composability-hardening | [x] Complete | 2026-09-01 |
| 25 | license-and-attribution | [x] Complete | 2026-09-01 |
| 26 | repo-hygiene | [x] Complete | 2026-09-01 |
| 27 | ci-and-security | [x] Complete | 2026-09-01 |
| 28 | publish-research | [x] Complete | 2026-09-01 |
| 29 | pre-ship-verify | [x] Complete | 2026-09-01 |
| 30 | publishable-package | [x] Complete | 2026-09-01 |
| 31 | npm-publish | [x] Complete | 2026-09-01 |
| 32 | security-policy-templates | [x] Complete | 2026-09-01 |
| 33 | github-repo-config | [x] Complete | 2026-09-01 |
| 34 | readme-badges | [x] Complete | 2026-09-01 |
| 35 | pr-branch | [x] Complete | 2026-09-01 |
| 36 | spec-phase | [x] Complete | 2026-09-01 |
| 37 | gap-analysis | [x] Complete | 2026-09-01 |
| 38 | code-review | [x] Complete | 2026-09-01 |
| 39 | ui-review | [x] Complete | 2026-09-01 |
| 40 | validate-phase | [x] Complete | 2026-09-01 |
| 41 | undo | [x] Complete | 2026-09-01 |
| 42 | health | [x] Complete | 2026-09-01 |
| 43 | milestone-audit | [x] Complete | 2026-09-01 |
| 44 | learnings | [x] Complete | 2026-09-01 |
| 45 | graphify | pending |  |
| 46 | mempalace | pending |  |
| 47 | assumption-delta | pending |  |
| 48 | pause-resume-work | pending |  |
| 49 | autonomous | pending |  |
| 50 | add-tests | pending |  |

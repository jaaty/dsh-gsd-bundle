# Roadmap — public-launch (v2.2.0)

34 phase(s) | requirements mapped per phase

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
| 31 | npm-publish | Publish @dsh-gsd/bundle to the npm registry as v2.2.0, satisfying the prepublishOnly test gate, and verify the published package is installable. [REL-02] | REL-02 |
| 32 | security-policy-templates | Add a SECURITY.md vulnerability-reporting policy and GitHub issue + pull-request templates so public contributors know how to report issues and open PRs. [REL-03] | REL-03 |
| 33 | github-repo-config | Configure the GitHub repository with searchable topics and a homepage URL for discoverability and canonical linking. [REL-04] | REL-04 |
| 34 | readme-badges | Add CI-status, license, and npm-version badges to the README so the public repo signals health and provenance at a glance. [REL-05] | REL-05 |

## Progress

| # | Phase | Status | Date |
|---|-------|--------|------|
| 01 | live-mount | [x] Complete | 2026-08-29 |
| 02 | service-tools | [x] Complete | 2026-08-29 |
| 03 | loop-e2e | [x] Complete | 2026-08-29 |
| 04 | checkpoint-resume | [x] Complete | 2026-08-29 |
| 05 | window-ledger | [x] Complete | 2026-08-29 |
| 06 | loop-robustness | [x] Complete | 2026-08-29 |
| 07 | uat-conversation | [x] Complete | 2026-08-29 |
| 08 | capability-gates | [x] Complete | 2026-08-29 |
| 09 | job-runtime | [x] Complete | 2026-08-29 |
| 10 | codebase-query | [x] Complete | 2026-08-29 |
| 11 | phase-dir-resolution | [x] Complete | 2026-08-29 |
| 12 | single-source-constants | [x] Complete | 2026-08-29 |
| 13 | gate-dispatch | [x] Complete | 2026-08-29 |
| 14 | execute-checkpoint | [x] Complete | 2026-08-29 |
| 15 | ship-robustness | [x] Complete | 2026-08-29 |
| 16 | context-budget | [x] Complete | 2026-08-29 |
| 17 | phase-branch-isolation | [x] Complete | 2026-08-29 |
| 18 | job-runtime-extensions | [x] Complete | 2026-08-29 |
| 19 | codebase-intel-extensions | [x] Complete | 2026-08-29 |
| 20 | multi-window-topology | [x] Complete | 2026-08-29 |
| 21 | capability-services | [x] Complete | 2026-08-29 |
| 22 | reactive-loop-rendering | [x] Complete | 2026-08-29 |
| 23 | removal-verification | [x] Complete | 2026-08-29 |
| 24 | composability-hardening | [x] Complete | 2026-08-29 |
| 25 | license-and-attribution | [x] Complete | 2026-08-29 |
| 26 | repo-hygiene | [x] Complete | 2026-08-29 |
| 27 | ci-and-security | [x] Complete | 2026-08-29 |
| 28 | publish-research | [x] Complete | 2026-08-29 |
| 29 | pre-ship-verify | [x] Complete | 2026-08-29 |
| 30 | publishable-package | [x] Complete | 2026-08-29 |
| 31 | npm-publish | pending |  |
| 32 | security-policy-templates | pending |  |
| 33 | github-repo-config | pending |  |
| 34 | readme-badges | pending |  |

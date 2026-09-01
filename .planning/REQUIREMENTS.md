# Requirements

## MOUNT

- [x] MOUNT-01: All 12 plugin subpath exports resolve and every plugin row in cordis.patch.yml activates in a live DSH session.
- [x] MOUNT-02: gsd-persona installs the phase-loop system prompt section and the gsd:state runtime-context provider, and every session orients at the current STATE.md position.
- [x] MOUNT-03: gsd-state registers the gsdState host service; .planning/ artefacts round-trip (write→read) with no data loss.
- [x] MOUNT-04: Every gsd_* phase tool registers with a valid schema and its execute passes a smoke call.
- [x] MOUNT-05: A full phase (Discuss → Plan → Execute → Verify → Ship) completes end-to-end in a live session, producing a PR.
- [x] MOUNT-06: npm test (node --test test/*.test.mjs) passes on a clean checkout.

## DUR

- [x] DUR-01: Executors honor checkpoint:* tasks: return structured checkpoint state and stop, without running later tasks.
- [x] DUR-02: gsd_execute can resume an interrupted phase from a checkpoint (skip completed tasks, continue from the checkpoint) and the phase completes.
- [x] DUR-03: A WINDOWS.md ledger records multi-window execution so a resumed session can reconstruct where the loop is.
- [x] DUR-04: An async-jobs manifest tracks background/scheduled jobs (id, status, result) surfaced through gsd_status.
- [x] DUR-05: The planner writes depends_on with the fully-prefixed plan id (project-code + phase + plan) so wave dependency resolution never misses a completed dependency.
- [x] DUR-06: gsd_quick routes its TASK.md write through the gsdState artefact model (ctx.fs) instead of bypassing it via raw node:fs/promises.

## UAT

- [x] UAT-01: Executors honor checkpoint:decision and checkpoint:human-action tasks: they stop, surface a human-facing question, and do not proceed without a human answer.
- [x] UAT-02: gsd_execute pauses the phase at a decision/human-action checkpoint, waits for and captures the human's answer, and resumes the plan from the checkpoint with that answer applied, then completes.

## CAP

- [x] CAP-01: gsd_ship runs a set of capability gates (security, broken-windows, TDD-audit) before shipping and reports each gate's pass/fail status.
- [x] CAP-02: gsd_ship refuses to ship when any capability gate fails, producing a clear report of which gate failed and why; the phase cannot ship until all required gates pass.

## JOB

- [x] JOB-01: A job can be launched to run asynchronously and its lifecycle tracked through running → done/failed states in the async-jobs manifest.
- [x] JOB-02: The runtime collects and surfaces a job's result when it finishes, and gsd_status reflects real asynchronous job state rather than a registry-only record.

## CBQ

- [x] CBQ-01: A query can be asked against the mapped codebase and answered from the existing .planning/codebase/ map plus the codebase itself, without triggering a full re-scan.
- [x] CBQ-02: The query path is surfaced through gsd_map_codebase (a --query argument) and returns a targeted answer to the question.

## CQ

- [x] CQ-01: The phase directory and base are resolved once per tool invocation and passed down, not re-derived on every artefact access.
- [x] CQ-02: Shared constants (gate names, secret-file list) live in one place and are reused, and cwdOf is routed through the shared helper.
- [x] CQ-03: The gate dispatch uses an explicit dispatcher map, and the commit scope is derived from structured plan fields, not string parsing.
- [x] CQ-04: The checkpoint prepare/process logic in gsd_execute is extracted into helpers with no duplicated validation, and the planIndex runnable set is reused.
- [x] CQ-05: git/gh calls are async and preflight failures report their real cause.
- [x] CQ-06: planningContext truncates against a total budget and surfaces truncation, plus small dedup fixes.
- [x] CQ-07: Each phase runs on its own feature branch (phase-<N>) acquired at the start of gsd_discuss, and every phase tool commits its planning artefacts to that branch, so gsd_ship preflight passes on a clean feature branch without manual intervention.

## JOBX

- [x] JOBX-01: Launch background jobs that run a subagent (without awaiting the result), not just shell commands.
- [x] JOBX-02: Support job timeouts and cancellation (currently jobs run until they exit).
- [x] JOBX-03: Add a gsd_job tool to launch jobs interactively from the driving agent.
- [x] JOBX-04: Add job retry and queueing.

## CBQX

- [x] CBQX-01: Implement drift detection that notices when the codebase has changed since the last map.
- [x] CBQX-02: Implement targeted re-map / gsd-intel-updater that updates only the affected map docs.
- [x] CBQX-03: Return a structured answer object (answer + sources + confidence) instead of plain text.
- [x] CBQX-04: Add subtree query scoping via a queryScope/paths argument.

## MW

- [x] MW-01: Support concurrent multi-window phases sharing one base branch, with a defined merge topology.
- [x] MW-02: Push the phase-N branch earlier than ship (at branch-acquire) for remote visibility during the phase.
- [x] MW-03: Auto-commit the out-of-flow artefacts (UI-SPEC / codebase-map / quick-task) onto the phase branch.

## DEGR

- [x] DEGR-01: Every phase-loop step plugin (discuss, plan, execute, verify, ship, ui, quick, map-codebase, core-tools) publishes a capability service (e.g. gsdPlan) declaring the loop step it provides, in addition to registering its tool.
- [x] DEGR-02: The persona renders the phase loop and the runtime-context snapshot from the set of currently-available step capabilities, skipping absent steps and never instructing the agent to call a missing tool.
- [x] DEGR-03: The slash-command layer declares coeffects on the corresponding step capabilities so retiring a step plugin reactively unregisters its /gsd-* command (no dangling commands).
- [x] DEGR-04: gsd_status and the STATE.md step machine route only through available steps, so the loop never advances into an absent step.
- [x] DEGR-05: An automated per-plugin removal test proves each single step plugin can be retired (effects reverted, no crash) with the remaining loop still functional end-to-end.
- [x] DEGR-06: The background-job live registry is effect-scoped to its owning fiber so unloading/HMR cancels running jobs.
- [x] DEGR-07: Plugins consuming the subagents host service declare it in inject so reactive coeffect activation/deactivation holds.

## PUB

- [x] PUB-01: The repository includes an MIT LICENSE file so GitHub detects the license and users can legally use, modify, and redistribute the bundle.
- [x] PUB-02: The README's attribution to opengsd-core is accurate and license-compliant, and the broken gsd-core-reference.md reference is fixed (the file is added with proper attribution, or the reference is removed).
- [x] PUB-03: The repository includes a CHANGELOG, a CONTRIBUTING.md, and a code of conduct, and the .planning/ directory keep-vs-gitignore-vs-curate decision is made and applied.
- [x] PUB-04: A CI workflow runs the test suite on pull requests, and a full-history secret scan confirms no credentials or tokens are exposed.
- [x] PUB-05: A research-backed distribution decision (npm publish vs clone-and-install-from-source) is documented, matching the behavior of other dsh plugins.

## SHIP

- [x] SHIP-01: gsd_ship runs a deterministic local verification before pushing — a clean npm ci + npm test in a temp copy of the repo — and fails the ship if it fails, skippable via a flag.

## REL

- [x] REL-01: package.json version matches the milestone version (2.2.0), carries the metadata fields repository, homepage, bugs, keywords, engines, and author, and its files field ships every document the README links to (DISTRIBUTION.md, CHANGELOG.md, LICENSE, CONTRIBUTING.md, CODE_OF_CONDUCT.md, NOTICE).
- [x] REL-02: The @dsh-gsd/bundle package is published to the npm registry as v2.2.0 and is installable (e.g. npm view @dsh-gsd/bundle@2.2.0, npm install / dsh plugin add succeeds), with the prepublishOnly test gate satisfied.
- [x] REL-03: A SECURITY.md vulnerability-reporting policy and GitHub issue templates + a pull-request template exist in the repository .github/ directory.
- [x] REL-04: The GitHub repository is configured with searchable topics and a homepage URL, so the repo is discoverable and links to its canonical location.
- [x] REL-05: The README displays CI-status, license, and npm-version badges so the public repo signals at-a-glance health and provenance.

## GAP

- [x] GAP-01: A clean-PR-branch path exists so gsd_ship creates a review branch that filters out .planning/ commits, leaving reviewers with only real code changes in the PR diff.
- [x] GAP-02: A spec-phase step precedes discuss and produces a SPEC.md with falsifiable requirements gated by an ambiguity-scoring score (≤0.20 across weighted dimensions).
- [x] GAP-03: After PLAN.md files are generated, a post-planning gap-analysis emits a coverage table cross-referencing every REQ-ID and D-ID from REQUIREMENTS.md and CONTEXT.md against plan bodies.
- [x] GAP-04: A code-review pass reviews a phase's changed source files and produces REVIEW.md; a --fix companion applies findings with per-fix atomic commits and produces REVIEW-FIX.md.
- [x] GAP-05: A retroactive 6-pillar UI audit reviews implemented frontend code against the UI-SPEC and produces a UI-audit report.
- [x] GAP-06: A retro validate-phase audit maps executed work back to tests and manual evidence, identifies validation gaps, and produces tests to close those gaps for a completed phase.
- [x] GAP-07: A safe undo path can roll back a phase's or plan's commits using the phase manifest, with dependency checks and a confirmation gate before execution.
- [x] GAP-08: A health diagnostic inspects .planning/ integrity (phase/plan numbering, orphan SUMMARYs, config validation) and offers non-destructive repair.
- [x] GAP-09: Milestone close-gate audits aggregate phase verifications to confirm the milestone met its definition of done, and a cross-phase UAT audit lists outstanding items before close.
- [x] GAP-10: An extract-learnings path accumulates decisions, lessons, patterns, and surprises from completed phase artifacts into a LEARNINGS.md that carries forward across phases.
- [x] GAP-11: A project knowledge graph is built in .planning/graphs/ and can be queried and inspected through a graphify tool.
- [ ] GAP-12: A cross-session memory integration performs deliberate recall before discuss/plan and verbatim capture at phase boundaries (mempalace).
- [ ] GAP-13: An advisory assumption-delta checkpoint detects when a phase makes something plural, optional, or chosen that used to be singular, required, or derived, and surfaces one identity-model question.
- [ ] GAP-14: A pause-work command writes a structured context handoff (HANDOFF.json + a continue-here pointer) and a resume-work command restores full context from earlier artifacts to continue mid-phase.
- [ ] GAP-15: An autonomous path can drive all remaining phases of a milestone end-to-end (discuss → plan → execute per phase) without per-phase manual prompting.
- [ ] GAP-16: An add-tests generator creates unit and E2E tests for a completed phase based on its UAT criteria and implementation.

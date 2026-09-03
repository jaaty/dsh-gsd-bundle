Research complete. Here is the full RESEARCH.md.

---

```markdown
# Phase 49: autonomous — Research

**Researched:** 2026-09-03
**Phase goal:** Add an autonomous path that drives all remaining phases of a milestone end-to-end without per-phase manual prompting (GAP-15).
**Requirement:** GAP-15 — "An autonomous path can drive all remaining phases of a milestone end-to-end (discuss → plan → execute per phase) without per-phase manual prompting."

Scope reminder (CONTEXT.md domain, locked): autonomous = `gsd_autonomous` tool + `/gsd-autonomous` command + `gsdAutonomous` capability; per phase it auto-derives a minimal CONTEXT.md when absent (D-05, skip discuss otherwise) and spawns ONE fresh-context autopilot subagent per phase that runs discuss→plan→execute→verify inline (D-03/D-04); re-reads ROADMAP after each phase (D-07); stops on hard failure only (D-09); never ships, never runs lifecycle (deferred). All remaining incomplete phases, no --from/--to/--only (D-08). No new runtime dependencies (D-12).

---

## Domain analysis

### What "autonomous" is here
This phase builds an **out-of-band orchestrator plugin**, not a loop step. It composes the existing step tools by instructing a single fresh-context autopilot subagent per phase to call `gsd_discuss` / `gsd_plan` / `gsd_execute` / `gsd_verify` **inline** for that phase (D-03), then the driving tool reads the phase's `VERIFICATION.md` status into a per-phase STATUS summary (D-11). This mirrors how `lib/plan.js`, `lib/execute.js`, `lib/verify.js` already delegate to fresh-context subagents via `spawnSubagent`. Confidence: **HIGH** — every referenced seam was inspected this session.

| Confidence | Area | Basis |
|---|---|---|
| HIGH | Capability/tool/command registration | `lib/_capabilities.js`, `lib/core-tools.js`, `lib/commands.js`, `lib/milestone-audit.js` read verbatim |
| HIGH | Subagent spawn seam + tool availability to child | `lib/_runner.js`, `@deepseek-ai/dsh-subagent-spawn-in-process`, `dsh-subagent-in-process-driver`, `dsh-subagent/lib/types/child-agent.js` read verbatim |
| HIGH | CONTEXT auto-derive must precede gsd_plan | `lib/plan.js:95-96` fail-fast on missing CONTEXT |
| HIGH | Verify status readback | `lib/verify.js:109-117` + `lib/milestone-audit.js:128-137` read verbatim |
| HIGH | Phase discovery / completeness | `lib/_shared.js parseRoadmap` (`status: Complete|pending`) + `lib/state.js readRoadmap` |
| MEDIUM | Branch acquisition in the auto-CONTEXT path | see **Risk R2** — genuine gap not settled by CONTEXT |
| HIGH | No new deps needed | none of the locked decisions require a new package |

### Standard pattern (mirrored by every sibling step plugin)
A fresh loop/out-of-band plugin follows this invariant shape (verified against `lib/milestone-audit.js`, `lib/learnings.js`, `lib/verify.js`, `lib/gap-analysis.js`):

1. `lib/<name>.js` exports `{ name, inject, apply }` with `inject = ["gsdState", "tools", ...]`.
2. `apply(ctx)` does:
   - `ctx.provide("<CapKey>", buildCapability("<CapKey>"))` — publishes the capability (DEGR-01/D-01). Revertible: retiring the plugin withdraws it.
   - `ctx.tools.register(defineTool({ name, description, parameters, output, async execute(args, exec) {...}, presentCall }))`.
   - Inside `execute`: `const cwd = cwdOf(exec); const s = ctx.get("gsdState");` → fail-fast guards (`s` null, no project, unreadable ROADMAP) → read artefacts → subagent(s) → write + commit → return a string report. ([VERIFIED: lib/milestone-audit.js:98-245], [VERIFIED: lib/verify.js:39-144])
3. `lib/_capabilities.js`: add the key to `CAPABILITY_KEYS`, add a `TABLE` row, and the descriptor is auto-built by `buildCapability`/`allCapabilities`. No role-enum change needed — `"out-of-band"` is already in `ROLES` ([VERIFIED: lib/_capabilities.js:13]).
4. `lib/commands.js`: add a `COMMANDS` entry; the `apply` loop pairs it to the capability via `commandToCapability` and registers it on a sub-fiber keyed `[capKey, "commands"]` ([VERIFIED: lib/commands.js:357-385]). A command with no owning capability would inject `[undefined, "commands"]` → **the capability + command must both land, else the command silently never registers.**
5. `cordis.patch.yml`: add an `- id: gsd-autonomous\n  name: '@dsh-gsd/bundle/autonomous'` row under the insert block; `package.json` `exports` gets `"./autonomous": { "default": "./lib/autonomous.js" }`.
6. `test/<name>.test.mjs`: pure helpers + `FakeFs`/`makeMountCtx` mount + fake subagents factory + fake gitFn (see Validation section).

### Capability descriptor for gsdAutonomous (D-01)
- `role: "out-of-band"` → falls into `INFO_ROLES` in `lib/_render.js` ([VERIFIED: lib/_render.js:22-23]), rendered as informational, **never a loop step, no render/renderer test change needed**. It is excluded from `STEP_CAPS` in `test/removal.test.mjs` (filtered on `role === "step"`, [VERIFIED: test/removal.test.mjs:37]), so no removal smoke tries to run `gsd_autonomous`.
- `order: NOT_LOOP_ORDERED` (-1) — same as gsdUndo/gsdHealth/gsdJobs ([VERIFIED: lib/_capabilities.js:17]).
- `tools: ["gsd_autonomous"]`, `commands: ["gsd-autonomous"]`.
- `produces: ["VERIFICATION.md","STATUS"]`, `consumes: ["ROADMAP.md","STATE.md","CONTEXT.md"]`.
- Caveat: `_capabilities.test.mjs` asserts `CAPABILITY_KEYS.length === 21` and an explicit key list ([VERIFIED: test/_capabilities.test.mjs:12-39]); both must be updated to 22 + `gsdAutonomous`.

### The subagent can call the gsd_* tools inline (D-03 feasibility — HIGH)
`spawnSubagent` calls `subagents.start("spawn", req)` with no `toolFilter` ([VERIFIED: lib/_runner.js:8-32]). The spawn provider's `startInProcessRun` → `applyChildComposition(childCtx, parent, { persona: request.persona, toolFilter: request.toolFilter })` only calls `childCtx.tools.restrict(...)` **when `toolFilter !== undefined`** ([VERIFIED: @deepseek-ai/dsh-subagent/lib/types/child-agent.js:126-135]). With no filter, the child runs against the **same cordis context**, so every tool registered via `ctx.tools.register` (all `gsd_*` step tools) is available to the autopilot subagent. `inheritsParentContext = false` ([VERIFIED: dsh-subagent-spawn-in-process/lib — SpawnInProcessProvider]) means zero parent context, perfect for a fresh per-phase autopilot. **No per-child toolFilter or new provider wiring is required.** Note spawnSubagent doesn't reserve a `maxDepth`; nested spawns (plan→researcher/planner/checker, execute→executors, verify→verifier) are the same nesting the driving agent already does, so recursion depth is not a new risk.

### gsd_plan requires CONTEXT before it will run (mandates D-05/D-06)
`lib/plan.js:95-96`: `if (!hasContext) return "gsd_plan: no CONTEXT.md for phase N. Run gsd_discuss ..."`. So the auto-derived minimal CONTEXT **must be written by gsd_autonomous before it hands the phase to the autopilot**, otherwise the autopilot's `gsd_plan` fails fast with a soft return (not an exception) and the phase never plans. This is exactly the D-05/D-06 design. The minimal CONTEXT need only pass `hasArtifact` for gsd_plan to proceed; a schema-faithful 7-block doc (mirroring the `gsd_discuss` template at `lib/discuss.js:166-221`) is recommended so plan/learnings/graphify reads stay structured.

### Auto-derive shape (D-05)
Recommended minimal CONTEXT (mirror `lib/discuss.js:166-221`), with:
- header `# Phase <N>: <name> - Context`, `**Gathered:** <iso>`, `**Mode: Auto-generated (discuss skipped — autonomous path)**`.
- `<domain>` with `in_scope: <phase.goal>` (from `parseRoadmap` phase.goal).
- `<decisions>` = one area `## Decisions` / `### Claude's Discretion` containing a single line granting full executor discretion (per D-05 wording).
- `<canonical_refs>`, `<code_context>` ("(none identified)"), `<specifics>` ("(none)"), `<deferred>` ("(none)") — keep the faithful block skeleton so downstream parsers (learnings `parseDecisionEntries`, graphify) degrade cleanly.
- `Status: Ready for planning`.
- footer `*Phase: <NN>-<slug>*`.

### Verify status readback (D-04/D-09/D-11)
`lib/verify.js:109-117` reads the freshly-written `<base>-VERIFICATION.md` frontmatter `status` and defaults to `gaps_found` when absent. `gsd_autonomous` should read the SAME artefact via `s.readArtifact(cwd, n, "VERIFICATION")` + `parseFrontmatter` ([VERIFIED: lib/milestone-audit.js:128-137] does exactly this, using `"missing"` as the absent-file fallback). Success = `status === "passed"`; **anything else (missing / gaps_found / human_needed / unparseable) is a hard-failure stop by D-09**, and the tool must NOT issue the verify tool's own routing (that's deferred).

### Phase discovery + ordering (D-07/D-08)
- `s.readRoadmap(cwd)` returns `{ milestoneName, version, phases: [{ n, slug, name, goal, requirements, status }] }` ([VERIFIED: lib/_shared.js:179-210]). `status === "Complete"` marks a shipped phase; incomplete = `status !== "Complete"`.
- Filter to incomplete, sort by numeric `n` ascending, run each. After each phase, re-call `s.readRoadmap` so inserted phases are picked up before the next iteration.
- Milestone identity for the report: `roadmap.milestoneName` (fallback `state.frontmatter.milestone_name`, mirroring `lib/milestone-audit.js:122-124`).
- No incomplete phases → return a clean "nothing to do" no-op status (mirror graphify's graceful guards at `lib/graphify.js:278-293`).

---

## Package legitimacy

**This phase introduces NO new runtime or dev dependencies.** Every dependency referenced is either already in `package.json` peerDependencies (`@deepseek-ai/dsh-tools`, `@deepseek-ai/cordis`, `@deepseek-ai/dsh-llm`, `@deepseek-ai/schemastery` — [VERIFIED: package.json:126-131]) or provided by the DSH host at runtime (`subagents` / `dsh-subagent-spawn-in-process` — consumed via `ctx.get("subagents")`, never `import`ed). [VERIFIED: no `node_modules/@deepseek-ai/dsh-subagent*` is a published dependency of this bundle; they live under the host checkout]. No npm registry verification needed because nothing is being added. Any proposal to import a new package for this phase is out of scope (D-12) and would be flagged as a BLOCKER.

---

## Risks and ## Open Questions

### Risks
- **R1 (HIGH): Capability-count assertions break.** Adding `gsdAutonomous` invalidates hard-coded counts that MUST be updated in the same change: `test/_capabilities.test.mjs:13` (`CAPABILITY_KEYS.length === 21` → 22) and its explicit list at lines 14-36; `test/mount.test.mjs:141-142,153,209,322` (`ctx.tools.length === 28` → 29, `ctx.commands.length === 25` → 26, `CAPABILITY_KEYS.length === 21` → 22, `insertRows.length === 23` → 24). [VERIFIED: test/_capabilities.test.mjs; test/mount.test.mjs]. `test/coeffect.test.mjs` `SUBAGENT_DRIVEN_SUBS` (`lib/autonomous.js` declares `subagents`) should add `"autonomous"` ([VERIFIED: test/coeffect.test.mjs:19]). `removal.test.mjs` and `mount-harness` are parameterized and auto-adapt.
- **R2 (HIGH): The auto-CONTEXT path skips branch acquisition.** `ensurePhaseBranch` (acquires `phase-<N>`) is called at the top of `gsd_discuss` ([VERIFIED: lib/discuss.js:149-153]); the autonomous auto-CONTEXT path (D-05) skips discuss. `commitArtifacts` stages `.planning` **wholesale onto the current branch** ([VERIFIED: lib/_git-artifacts.js:174-201]). Net effect: a phase run under autonomous with no pre-existing CONTEXT commits its planning artefacts onto whatever branch the process is on (likely the base), and later manual `gsd_ship` for that phase (which requires a clean feature branch, [VERIFIED: lib/ship.js:163-168]) would fail or the base branch gets polluted. **Recommendation: have the auto-CONTEXT path also call `ensurePhaseBranch(cwd, phaseNum)` (mirroring discuss exactly, minus the interview) so the phase lands on `phase-<N>` and later ship preflight passes.** This is within D-13 "Claude's Discretion" ("how the auto-CONTEXT write routes") — the executor must settle the recommendation, not the researcher. A second implication: `ensurePhaseBranch` is FAIL-LOUD when already on a non-base, non-phase-N branch ([VERIFIED: lib/_git-artifacts.js:142-147]) — treating that as a hard failure → stop is correct by D-09.
- **R3 (MEDIUM): Autopilot must not double-discuss.** The autopilot prompt says "call gsd_discuss (skip if CONTEXT.md already exists)" AND gsd_autonomous pre-writes the auto-CONTEXT. The subagent's guard must be authoritative (`hasArtifact("CONTEXT")`); instruct it to re-check rather than trust a "write happened" note, so a race or a stale flag doesn't trigger a spurious empty discuss.
- **R4 (LOW): Verify soft-stop is a hard-failure for autonomous.** `gsd_verify` returns a string (no exception) when it has no plans to verify — the autonomous driver must treat "no plans / no SUMMARY / non-passed status" as a stop condition by examining the written VERIFICATION.status and the verify tool's absence of plans, not by the tool returning (the tool almost always "returns").
- **R5 (LOW): Live end-to-end cost.** The real target is phase 50 (add-tests, GAP-16) — an unshipped, heavy phase. Autonomous on a live project drives real plan→execute→verify (nested subagents), which is expensive and token-heavy. Tests MUST NOT actually run it; they use fake subagents factories (D-12) to assert dispatch shape, not to execute a real phase.

### Open Questions
1. **(RESOLVED by codebase evidence) — Can the autopilot subagent invoke `gsd_discuss`/`gsd_plan`/`gsd_execute`/`gsd_verify` inline?** Yes. The spawn provider shares the cordis context and only calls `tools.restrict` when a `toolFilter` is supplied; `spawnSubagent` supplies none, so all `ctx.tools` gsd_* tools are present in the child. Blocked-by: none. [VERIFIED: dsh-subagent/lib/types/child-agent.js:126-135; lib/_runner.js:8-32]
2. **(RESOLVED by codebase evidence) — What must the auto-CONTEXT satisfy for gsd_plan to proceed?** Only existence (`hasContext`), but a schema-faithful 7-block doc is recommended. gsd_plan reads the CONTEXT text into the planner/plan-checker planning-context, so including the goal-derived domain + discretion decision improves plan quality. Blocked-by: none. [VERIFIED: lib/plan.js:95-96,102]
3. **(RESOLVED by D-13 recommendation — executor confirms) — Should the auto-CONTEXT path acquire the `phase-<N>` branch?** Recommend YES (call `ensurePhaseBranch(cwd, phaseNum)` before writing the auto-CONTEXT, mirroring `lib/discuss.js:149-153`), otherwise plan/execute/verify artefacts commit to the current (likely base) branch and later ship preflight can't pass (Risk R2). Blocked-by: none for the recommendation; executor settles per D-13.
4. **(RESOLVED — D-09/D-13) — On a hard failure, stop immediately or record-and-continue to the next phase?** D-09 says "halts the run at that point"; D-13's explicit default is "stop on first hard failure". Record the failing phase+step in the STATUS summary + stop reason, emit the resume command (`/gsd-autonomous`), and stop. Do NOT continue to later phases. Blocked-by: none.
5. **(RESOLVED — D-12) — New test file to model on?** `test/learnings.test.mjs` (pure helpers + `mountLearnings`-style mount + `makeLearningsSubagents` fake factory + `makeFakeGit` + "never blocks STATE" pattern). Blocked-by: none. [VERIFIED: test/learnings.test.mjs]
6. **(RESOLVED — D-02/DEGR-07) — What inject coeffects does `lib/autonomous.js` declare?** `["gsdState","tools","subagents"]` — mirroring plan/execute/verify/milestone-audit ([VERIFIED: lib/verify.js:17; lib/milestone-audit.js:41]). `subagents` is a hard coeffect (tool throws if absent, D-02). Add `"autonomous"` to `coeffect.test.mjs` SUBAGENT_DRIVEN_SUBS. Blocked-by: none.
7. **(RESOLVED by D-04) — Does autonomous advance STATE?** No. It does not call `setActivePhase`; the step tools it causes to run (discuss/plan/execute/verify) set STATE themselves. gsd_autonomous is advisory about the run-level stop (D-10). Blocked-by: none.

---

## Architectural Responsibility Map

| Capability | Tier | Notes |
|---|---|---|
| Phase discovery + ordering + ROADMAP/STATE reads | **domain** | `ctx.get("gsdState")` accessors: `readRoadmap`, `readRequirements`, `isProject`, `readState`, `phaseDirAndBase`. No raw fs directly — route reads through `gsdState` (DUR-06). |
| Auto-derived minimal CONTEXT.md (D-05/D-06) | **domain** | Write via `s.writeArtifact(cwd, n, "CONTEXT", text)`; commit via `commitArtifacts(cwd, n, { scope: "autonomous", phaseName })`. Optionally acquire branch via `ensurePhaseBranch` (Risk R2). |
| Per-phase autopilot subagent dispatch (D-03) | **integration** | `spawnSubagent(ctx, exec, { label, promptText })` (from `_runner.js`). Prompt instructs inline `gsd_discuss`→`gsd_plan`→`gsd_execute`→`gsd_verify` for the ONE phase, names the phase dir/base. |
| Verify status readback (D-04/D-11) | **domain** | `s.readArtifact(cwd, n, "VERIFICATION")` + `parseFrontmatter` → `status`. Success only on `"passed"`. |
| STATUS summary + banner report (D-11) | **presentation** | The tool's return string (banner-style, mirroring other step tools' text output). No UI files. |
| Fail-fast guards / env checks | **domain** | `s` null throw, `isProject`, unreadable ROADMAP → mirror `lib/milestone-audit.js:113-119` and `lib/verify.js:56-63`. |

Security-tier note: none of the autonomous behaviours are security-sensitive; the only security posture is (a) no shell string interpolation (fixed-arg `commitArtifacts`/git seam), and (b) no STATE authority escalation — it never forces a phase to "complete". Keep it **domain/integration**, never presentation-tier logic, and never a new data tier.

---

## Validation Architecture

Automated checks (node:test, `test/autonomous.test.mjs` following `test/learnings.test.mjs` conventions) that each MUST be automatable offline against FakeFs + fake-ctx + fake subagents + fake git:

| Behaviour | Automated proof (D-12) |
|---|---|
| Capability descriptor registered (D-01) | `ctx.provided.has("gsdAutonomous")`; `buildCapability("gsdAutonomous")` → `role:"out-of-band"`, `order: NOT_LOOP_ORDERED`, `tools:["gsd_autonomous"]`, `commands:["gsd-autonomous"]`, `produces/consumes` exact. |
| Command pairing (`/gsd-autonomous`) | mount full; `ctx.commands` includes `gsd-autonomous` (via `commandToCapability`); command `build("")` produces an `{err}` "Usage" or routes to the tool text. |
| No-op when all phases complete (D-08) | ROADMAP with all `status:"Complete"` → tool returns "nothing to do", spawns zero subagents, no artefacts written. |
| Phase discovery ordering (D-07) | ROADMAP with incomplete phases [50],[52],[51] (out of order) → autopilot spawned for 50,51,52 in numeric order; ROADMAP re-read between phases (spy factory can swap an injected phase). |
| Auto-derived minimal CONTEXT shape (D-05) | phase without CONTEXT → `s.writeArtifact("CONTEXT")` produces a doc with the "Mode: Auto-generated (discuss skipped — autonomous path)" header, `in_scope: <goal>`, discretionary decisions; committed via fake git; gsd_plan's `hasContext` then true. |
| Skip-discuss-when-context-exists (D-05/D-03) | seed CONTEXT manually → autopilot prompt instructs skip (or no discuss step), auto-derive not triggered. |
| Per-phase subagent dispatch (D-03) | fake subagents factory captures `req.prompt`; assert it names the phase, the `phase-<N>`/dir, and the 4-tool sequence; `req.parent` present. |
| Verify-status readback → STATUS summary (D-04/D-11) | fake verifier writes `<base>-VERIFICATION.md` with `status: passed` → per-phase status "passed", overall `completed`; with `status: gaps_found` → overall `stopped` + stop-reason naming phase+step + resume command `/gsd-autonomous`. |
| Hard-failure stop (D-09) | subagent `start` throws, or no PLAN produced, or verify returns non-passed → recorded failing phase+step, no further phases processed (fake factory asserts spawn count). |
| Inject coeffects (D-02) | `coeffect.test.mjs` asserts `inject` includes `subagents`,`gsdState`,`tools` (add `"autonomous"` to `SUBAGENT_DRIVEN_SUBS`). |
| Registration-count updates | `_capabilities.test.mjs` (22), `mount.test.mjs` (tools 29 / commands 26 / insert rows 24). |
| Never mutates STATE (D-10) | `readState` before/after unchanged `status`/`next_action`/`active_phase` beyond what invoked step tools write (mirror learnings test h at lines 471-486). |

---

## Project Constraints

From PROJECT.md + existing conventions ([VERIFIED: package.json; cordis.patch.yml; test/mount-harness.mjs; config.json]):

- **No new runtime dependencies** (D-12; also package.json `dependencies: {}`). All subagent + tool machinery uses existing seams.
- **Phase-49 bundle at 49/51 phases**; next real target phase autonomous will drive is **50 (add-tests, GAP-16)**; phase 51 is already `[x] Complete` ([VERIFIED: .planning/ROADMAP.md:55-57]).
- **Faithful `.planning/` artefact schema** — CONTEXT/RESEARCH/PLAN/SUMMARY/VERIFICATION naming `<base>-<SUFFIX>.md`, `<base> = <projectCode>-<NN>-<slug>` (config project_code `GSD` → dirs `GSD-50-add-tests`). ([VERIFIED: lib/state.js:721-741], [VERIFIED: config.json]).
- **`npm test` = `node --test test/*.test.mjs`, prepublishOnly same** — any new/changed test file must pass on a clean checkout (MOUNT-06/REL gate).
- **Registration is dual-surface**: `cordis.patch.yml` insert row + `package.json` `exports` subpath, in addition to `lib/_capabilities.js` + `lib/commands.js`.
- **CQ-07 feature-branch discipline + MW-02 early push + MW-01 join topology** via `ensurePhaseBranch`/`commitArtifacts` — autonomous must not bypass the shared git seam or introduce shell strings.
- **Every step plugin declares coeffects on capabilities it needs (DEGR-03)** — `gsdAutonomous`'s `commands:["gsd-autonomous"]` is auto-paired by `commands.js`; no dangling command when the plugin is retired, which `removal.test.mjs` (parameterized over PATCH_ROWS) will verify automatically.
- **Persona / runtime snapshot render the *available* capability subset (DEGR-02/DEGR-04)** — because autonomous is `role:"out-of-band"` it renders as informational only and is never instructed as a missing loop step; no persona/renderer change is needed.
```

---

**Key findings the planner should carry forward:** (1) `lib/plan.js:95-96` fail-fast makes the auto-derived CONTEXT a *hard prerequisite* the autonomous tool (not the autopilot) must write; (2) the autopilot subagent has full `gsd_*` tool access because `spawnSubagent` passes no `toolFilter`; (3) four existing test files with hard registration counts + two registration surfaces (`cordis.patch.yml`, `package.json` exports) must be updated in the same change; (4) Risk R2 (branch acquisition in the auto-CONTEXT path) is the one genuine open design gap — recommend reusing `ensurePhaseBranch`, which sits inside D-13's executor discretion.
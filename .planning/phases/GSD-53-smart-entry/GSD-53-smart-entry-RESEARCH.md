I now have a complete picture. Here is the full RESEARCH.md.

---

# Phase 53: smart-entry — RESEARCH.md

**Researched:** 2026-09-07
**Phase goal:** Detect the current project state and route the user to the best next action, with an auto-advance option. (Requirements CLH-02, CLH-03)

This research answers: *What does the planner need to know to decompose Phase 53 into bounded, ordered, non-overlapping plans?* All claims are tagged with provenance. In-repo discrete values (enums, paths, status strings, line ranges) were read this session and quoted verbatim.

---

## 1. Domain analysis

### 1.1 What Phase 53 actually is

Phase 53 adds a **single routing + auto-advance surface** (`gsd_next` tool + `/gsd-next` command) that classifies the current `.planning/` state into one of six branches and, for the advance branches, re-points `STATE.md` to the next logical workflow step — but **never auto-runs** the next step's tool in the same turn (D-02). It is a **read-mostly orientation tool** that performs at most one deterministic `STATE.md` re-point; it is not a loop step and does not spawn subagents. [VERIFIED: CONTEXT.md D-01..D-09]

This sits in the **orientation tier** alongside `gsd_status` / `gsd_progress` (both read-only) and `gsd_init` / `gsd_new_milestone` (which mutate). `gsd_next` is the single surface that both *classifies* and *re-points*; `gsd_status` and `gsd_progress` stay read-only. [VERIFIED: CONTEXT.md D-01, specifics]

### 1.2 The standard pattern this phase follows (HIGH confidence)

Every loop-step / orientation tool in this codebase follows one shape, which `gsd_next` must mirror:

1. **A pure, side-effect-free helper module** (no `ctx`, no `fs`, no I/O) that holds the testable logic. Canonical examples: `lib/pause-resume.js` (pure handoff/phase-detection helpers), `lib/autonomous.js` (`discoverPhases`, `buildAutoContext`, `buildAutopilotPrompt`), `lib/milestone-audit.js` (`aggregateCloseGate`, `classifyMilestoneStatus`). [VERIFIED: lib/pause-resume.js:1-10, lib/autonomous.js:35-46, lib/milestone-audit.js:43-81]
2. **An I/O-bound `apply(ctx)` plugin** that registers the tool via `ctx.tools.register(defineTool({...}))`, gathers state via the `gsdState` service accessors, calls the pure helper, then performs any `STATE.md` mutation and returns text. [VERIFIED: lib/discuss.js:73-256, lib/health.js:366-528, lib/autonomous.js:320-348]
3. **Atomic commit** of any `.planning/` artefact mutation via `commitArtifacts(cwd, phaseNum, opts, gitFn)` in `lib/_git-artifacts.js`. [VERIFIED: lib/_git-artifacts.js:174-201]
4. **Tool + slash-command pairing** so the `/gsd-next` UX works alongside the tool call. [VERIFIED: lib/commands.js:35-385, CONTEXT.md D-01]

D-03 mandates the classifier be "pure, side-effect-free … unit-tested in isolation across the full state matrix before any STATE mutation is applied. The tool's execute path calls the classifier, then applies the branch's (optional) STATE mutation, then returns the recommendation text." [VERIFIED: CONTEXT.md D-03] This maps exactly onto the pure-helper + I/O-plugin split above.

### 1.3 Where `gsd_next` lives in the capability model (HIGH confidence)

`gsd_next` is **not a new capability and not a new plugin row**. The CONTEXT canonical reference names `lib/core-tools.js — gsdOrient capability publish (line 56): the model-bound orient capability gsd_next sits alongside`. [VERIFIED: CONTEXT.md canonical_refs] `gsdOrient` is `role: "orient"`, `order: NOT_LOOP_ORDERED` (-1) — i.e. an informational/orientation surface, not in the loop chain. [VERIFIED: lib/_capabilities.js:75-85]

Therefore:
- The `gsd_next` tool is registered inside `lib/core-tools.js`'s `apply(ctx)` (which already registers `gsd_init`, `gsd_status`, `gsd_progress`, `gsd_new_milestone`, `gsd_pause_work`, `gsd_resume_work`). [VERIFIED: lib/core-tools.js:60-565]
- The `/gsd-next` command is added to the `COMMANDS` array in `lib/commands.js`, paired to `gsdOrient` via the `commandToCapability` map. [VERIFIED: lib/commands.js:35-385, 387-421]
- `gsdOrient`'s `tools` and `commands` arrays in `lib/_capabilities.js` TABLE **must be extended** to include `"gsd_next"` and `"gsd-next"` respectively, so the DEGR-03 command pairing and the persona's never-instruct-a-missing-tool gate (D-02) hold. [VERIFIED: lib/_capabilities.js:75-85; lib/commands.js:392-395; CONTEXT.md D-06]

No new `cordis.patch.yml` row and no new `package.json` export are needed — `gsd_next` ships inside the existing `gsd-core-tools` plugin row. [VERIFIED: cordis.patch.yml:43-44, package.json:44-45]

### 1.4 The six classification branches and their precedence (HIGH confidence)

D-04 fixes the precedence order. The classifier evaluates top-down and returns on the first match:

| # | State | Detection | Routing | STATE mutation? |
|---|-------|-----------|---------|-----------------|
| 1 | No `.planning` project | `.planning/` absent / no project markers | `gsd_init` / `gsd_new_milestone` | No |
| 2 | Corrupt/missing `STATE.md` or `ROADMAP.md` | read returns undefined/unparseable | `gsd_health` | **No — do NOT mutate, do NOT guess** |
| 3 | Paused handoff present | `HANDOFF.json` or `.continue-here.md` exists | `gsd_resume_work` | **No** |
| 4 | Mid-phase (active phase + step not done/shipped) | `active_phase` set, step != done, phase not Complete | that step's next action (capability-aware) | No (read-only recommendation) |
| 5 | Phase shipped, pending phases remain | active phase Complete OR status done, pending phases exist | set next pending phase active at discuss/spec | **Yes — `setActivePhase`** |
| 6 | Milestone complete | every roadmap phase status "Complete" | `gsd_milestone_audit` → `gsd_new_milestone` if audit ready-to-close | **No** |

[VERIFIED: CONTEXT.md D-04, D-05, D-07, D-08, D-09]

### 1.5 Pitfalls identified

- **P-1 (precedence trap):** `isProject(cwd)` checks *only* `.planning/STATE.md` existence (`lib/state.js:143-146`). A workspace with `.planning/ROADMAP.md` but no `STATE.md` returns `isProject === false`, which would naively fire branch 1 (gsd_init) — but D-04 wants branch 2 (gsd_health) for a missing STATE when `.planning` clearly exists. The classifier must distinguish "no `.planning` project at all" (branch 1) from "`.planning` exists but STATE/ROADMAP missing/corrupt" (branch 2). [VERIFIED: lib/state.js:143-146; CONTEXT.md D-04] → see Open Question OQ-1.
- **P-2 (mid-phase no-op):** D-07 requires that if `STATE.status === "done"` or the active phase is already `"Complete"` in ROADMAP, the classifier **falls through** to the phase-shipped-needs-next branch (5) rather than recommending a no-op for branch 4. The classifier must check the active phase's ROADMAP status, not just `active_phase` presence. [VERIFIED: CONTEXT.md D-07]
- **P-3 (capability absence):** Routing must never recommend a step whose capability is absent. `effectiveRoutableStep` already handles this (returns the nearest present loop step with greater order, or null). But `gsd_next` also routes to `gsd_resume_work`, `gsd_health`, `gsd_milestone_audit`, `gsd_new_milestone` — all of which are orient/out-of-band capabilities that may be retired. The classifier must gate *each* routed command on capability presence and degrade gracefully (D-06). [VERIFIED: lib/_render.js:104-115; CONTEXT.md D-06] → see Open Question OQ-2.
- **P-4 (milestone-name slug mismatch):** `readMilestoneArtifact(cwd, milestoneName)` slugifies the milestone name for the filename (`lib/state.js:586-594`). The classifier must pass the *same* milestone name the audit was written under (from `roadmap.milestoneName || state.frontmatter.milestone_name`), and tolerate a missing audit (undefined → not-yet-audited → route to `gsd_milestone_audit`). [VERIFIED: lib/state.js:586-594, lib/milestone-audit.js:124]
- **P-5 (commit scope):** The auto-advance re-point mutates `STATE.md`. The commit must use `commitArtifacts(cwd, phaseNum, opts, gitFn)` — but for the milestone-complete branch (no phase mutation) and the no-project/corrupt/paused branches, **no commit is issued** (there is nothing staged). Only branch 5 (setActivePhase) and potentially branch 4 re-point produce a staged `STATE.md`. D-02/D-03 say auto-advance re-points STATE; the commit seam is the established pattern. [VERIFIED: lib/_git-artifacts.js:174-201; CONTEXT.md D-02, D-03, canonical_refs]

---

## 2. Package legitimacy

**No new dependencies are proposed.** Phase 53 reuses only existing in-repo modules and the already-declared peer dependencies. There is nothing to verify against a registry.

Reused in-repo modules (all read this session):
- `lib/_render.js` — `effectiveRoutableStep`, `capabilityKeyForNextAction`, `availableCapabilities`, `loopSteps`, `NO_LOOP_NOTICE`. [VERIFIED: lib/_render.js:57-115, 119]
- `lib/state.js` — `isProject`, `readState`, `readRoadmap`, `readHandoff`, `readContinueHere`, `readMilestoneArtifact`, `setActivePhase`, `recomputeProgress`, `planningRoot`, `cachedState`. [VERIFIED: lib/state.js:143-146, 278-285, 383-411, 421-433, 586-594, 872-881]
- `lib/_capabilities.js` — `buildCapability`, `CAPABILITY_KEYS`. [VERIFIED: lib/_capabilities.js:32-57, 337-357]
- `lib/_git-artifacts.js` — `commitArtifacts`. [VERIFIED: lib/_git-artifacts.js:174-201]
- `lib/_runner.js` — `cwdOf`. [VERIFIED: lib/_runner.js:98-100]
- `@deepseek-ai/dsh-tools` — `defineTool` (already a peerDependency `^0.1.1-rc.2`). [VERIFIED: package.json:136]

---

## 3. Architectural Responsibility Map

The planner must place each capability in the correct tier. A security/routing-sensitive capability in the wrong tier is a BLOCKER.

| Capability | Tier | Module | Rationale |
|------------|------|--------|-----------|
| **State classification** (the six-branch router) | **domain (pure)** | new `lib/_next.js` | D-03: pure, side-effect-free, unit-testable in isolation. No `ctx`, no `fs`, no I/O. Takes a gathered snapshot + capability descriptors, returns a branch + recommendation + optional mutation descriptor. Mirrors `lib/pause-resume.js`, `lib/autonomous.js` pure helpers. |
| **Recommendation text rendering** | **domain (pure)** | `lib/_next.js` | Pure formatter turning a classified branch into the human-facing text. Mirrors `renderBanner` in autonomous.js, `renderResumeStatus` in pause-resume.js. |
| **State snapshot gathering** | **data (I/O)** | `lib/core-tools.js` (gsd_next execute) | Reads via `gsdState` accessors (`isProject`, `readState`, `readRoadmap`, `readHandoff`, `readContinueHere`, `readMilestoneArtifact`) + `availableCapabilities((k) => ctx.get(k))`. |
| **STATE.md re-point (auto-advance)** | **data (I/O, mutation)** | `lib/core-tools.js` → `gsdState.setActivePhase` | Branch 5 only. Uses the existing mutator `setActivePhase(cwd, phaseNum, step)` which recomputes `next_action` via `_nextActionFor`. [VERIFIED: lib/state.js:421-437] |
| **Atomic commit of the re-point** | **integration** | `lib/core-tools.js` → `commitArtifacts` | Branch 5 only. Stages `.planning` wholesale and commits. Never throws. [VERIFIED: lib/_git-artifacts.js:174-201] |
| **Tool registration** | **presentation (integration)** | `lib/core-tools.js` `apply(ctx)` | `ctx.tools.register(defineTool({...}))` inside the existing core-tools apply. |
| **Slash-command registration** | **presentation (integration)** | `lib/commands.js` | New `gsd-next` entry in `COMMANDS`, paired to `gsdOrient` via the capability `commands` array. |
| **Capability descriptor extension** | **presentation (config)** | `lib/_capabilities.js` TABLE | Add `gsd_next` to `gsdOrient.tools`, `gsd-next` to `gsdOrient.commands`. |

**Security note:** `gsd_next` performs no shell interpolation, no git operations of its own (the commit seam uses fixed `-C cwd` arg arrays), and no subagent spawning. Its only authority is one `setActivePhase` call (branch 5). It never edits `ROADMAP.md`/`REQUIREMENTS.md` and never auto-runs a step tool (D-02). [VERIFIED: CONTEXT.md D-02, out_of_scope]

---

## 4. Validation Architecture

What automated checks prove each behaviour (for the Nyquist/coverage gate). The codebase test convention is `node --test test/*.test.mjs` with `FakeFs` + fake-ctx + pure-helper assertions (no live boot, no LLM, no git). [VERIFIED: package.json:31, test/helpers/mount-harness.mjs:1-31, test/autonomous.test.mjs:1-78]

### 4.1 Pure-classifier unit tests (new `test/next.test.mjs` or `test/_next.test.mjs`)

Modeled on `test/render.test.mjs` (pure helpers with fabricated descriptors) and `test/autonomous.test.mjs` (pure helpers + fake-ctx). The full state matrix from D-04:

- **Branch 1 (no project):** no `.planning` markers → returns `gsd_init` recommendation, no mutation.
- **Branch 2 (corrupt/missing STATE or ROADMAP):** `.planning` exists but STATE/ROADMAP undefined/unparseable → returns `gsd_health`, no mutation.
- **Branch 3 (paused handoff):** handoff present → returns `gsd_resume_work`, no mutation (short-circuits before mid-phase).
- **Branch 4 (mid-phase):** active phase set, step != done, phase pending → returns capability-aware next action via `effectiveRoutableStep`; no mutation.
- **Branch 4 fall-through (D-07):** active phase status "Complete" OR STATE.status "done" → falls through to branch 5, not a no-op.
- **Branch 5 (phase-shipped-needs-next):** pending phases remain → returns next-phase recommendation with mutation descriptor `{ setActivePhase: { phaseNum, step } }`; step is "discuss" (or "spec" when gsdSpec capability present).
- **Branch 6 (milestone-complete):** every phase "Complete" → returns `gsd_milestone_audit`; when audit status "ready-to-close" → returns `gsd_new_milestone`; no mutation.
- **Precedence:** handoff present + mid-phase → branch 3 wins (3 before 4). Corrupt STATE + handoff present → branch 2 wins (2 before 3). No project + anything → branch 1 wins.
- **Capability-awareness (D-06):** retire `gsdSpec` → branch 5 step is "discuss" not "spec"; retire `gsdVerify` → branch 4 effectiveRoutableStep skips to next present step; retire `gsd_resume_work` (gsdOrient) → branch 3 degrades. [VERIFIED: lib/_render.js:104-115]

### 4.2 Integration tests (gsd_next tool via fake-ctx)

Modeled on `test/autonomous.test.mjs` integration block and `test/pause-resume.test.mjs`:
- Mount core-tools + state + commands; bootstrap via `gsd_init`.
- **No-project path:** uninitialised cwd → text names `gsd_init`.
- **Mid-phase path:** seed STATE with `active_phase` + step "plan" → text names the plan step's next action; STATE unchanged (read-only).
- **Auto-advance path:** seed ROADMAP with phase 1 Complete, phase 2 pending, STATE active_phase null/idle → execute → STATE.active_phase becomes "2", status "discuss" (or "spec"), `next_action` recomputed; commit attempted.
- **Milestone-complete path:** all phases Complete → text names `gsd_milestone_audit`; seed audit "ready-to-close" → text names `gsd_new_milestone`; STATE untouched.
- **Never-advances-STATE invariant** (mirrors autonomous D-10): branches 1,2,3,4,6 leave `STATE.active_phase`/`status` byte-identical.

### 4.3 Capability/mount invariants (must-update existing tests)

Adding `gsd_next` to `gsdOrient` bumps the registered tool/command counts and changes exact-array assertions. These existing tests MUST be updated in the same plan that extends the capability (else `npm test` breaks):
- `test/mount.test.mjs:147` — `ctx.tools.length === 31` → **32**.
- `test/mount.test.mjs:148` — `ctx.commands.length === 28` → **29**.
- `test/mount.test.mjs:190` — subset test `ctx2.commands.length === 27` → **28** (gsdOrient is never withdrawn in that subset, so gsd-next stays registered).
- `test/mount.test.mjs:328` — `ctx.tools.length === 31` → **32**.
- `test/mount.test.mjs:104-117` — `EXPECTED_TOOL_NAMES` array: add `"gsd_next"`.
- `test/mount.test.mjs:119-132` — `EXPECTED_COMMAND_NAMES` array: add `"gsd-next"`.
- `test/_capabilities.test.mjs:69` — `gsdOrient.tools` exact array: add `"gsd_next"`.
- `test/_capabilities.test.mjs:70` — `gsdOrient.commands` exact array: add `"gsd-next"`.
- `test/mount.test.mjs:6` (comment) and `:33` — "31 gsd_* tools, 28 /gsd-* commands" comment → 32 / 29.

[VERIFIED: test/mount.test.mjs:104-132, 147-148, 190, 325-328; test/_capabilities.test.mjs:67-71]

### 4.4 Removal-test coverage (DEGR-05)

`gsd_next` rides the `gsdOrient` capability in `gsd-core-tools`. The per-plugin removal test (`test/removal.test.mjs`) must confirm that retiring `gsd-core-tools` withdraws `gsd_next` (tool unregister) and `/gsd-next` (command unregister via the `gsdOrient.commands` pairing). [VERIFIED: CONTEXT.md DEGR-05; lib/commands.js:392-419] → see Open Question OQ-3.

---

## 5. Risks and Open Questions

### R-1: Branch-1 vs Branch-2 disambiguation (medium)

`isProject` only checks `STATE.md` existence. A corrupt/missing `STATE.md` in an existing `.planning/` dir would be misclassified as "no project" (branch 1) instead of "corrupt state" (branch 2). [VERIFIED: lib/state.js:143-146]

### R-2: Routing to retired orient/out-of-band capabilities (medium)

Branches 2, 3, 6 route to `gsd_health`, `gsd_resume_work`, `gsd_milestone_audit`, `gsd_new_milestone`. These are `gsdHealth` (out-of-band), `gsdOrient` (orient), `gsdMilestoneAudit` (step, order 52) capabilities. If any is retired, the classifier must not recommend a missing tool. [VERIFIED: lib/_capabilities.js:240-261, 75-85]

### R-3: `setActivePhase` + commit on a non-feature-branch (low)

Branch 5's `setActivePhase` mutates `STATE.md`. `commitArtifacts` stages `.planning` wholesale. If the workspace is on `main` (not a `phase-<N>` branch), the commit lands on `main`. Other orientation tools (gsd_new_milestone, gsd_status) do NOT acquire a feature branch. The CONTEXT does not call for `ensurePhaseBranch` in gsd_next. [VERIFIED: lib/_git-artifacts.js:66-158; CONTEXT.md canonical_refs names commitArtifacts but NOT ensurePhaseBranch] → see Open Question OQ-4.

### R-4: Test-count drift breaks CI silently (medium)

Eight existing assertions hardcode tool/command counts and exact arrays (§4.3). A plan that adds `gsd_next` to the capability but misses one assertion fails `npm test` with a clear count mismatch — recoverable but the planner must enumerate every site. [VERIFIED: test/mount.test.mjs, test/_capabilities.test.mjs]

### Open Questions

**OQ-1 (RESOLVED):** How does the classifier distinguish branch 1 (no project) from branch 2 (corrupt/missing STATE/ROADMAP in an existing `.planning/`)?
**Resolution:** The classifier takes a *gathered snapshot* (the execute path gathers it), not raw `isProject`. Branch 1 fires when `.planning/` is absent entirely (no `PROJECT.md`, no `STATE.md`, no `ROADMAP.md` — i.e. `readProject === undefined && readState === undefined && readRoadmap === undefined`). Branch 2 fires when at least one `.planning` marker exists (`PROJECT.md` OR `ROADMAP.md` OR a prior `STATE.md`) but `STATE.md` or `ROADMAP.md` is missing/unparseable. This honours D-04 precedence (1 before 2) without relying on the STATE-only `isProject` check. The pure classifier receives the gathered `{ hasProject, state, roadmap, ... }` flags; the execute path computes them via `gsdState.readProject/readState/readRoadmap`. [VERIFIED: lib/state.js:139-146, 278-285, 440-444; CONTEXT.md D-04] **Status: RESOLVED — planner proceeds with the gathered-snapshot approach.**

**OQ-2 (RESOLVED):** Should the classifier gate *every* routed command (branches 2,3,6) on capability presence, like `effectiveRoutableStep` gates loop steps?
**Resolution:** Yes, per D-06 ("routing is capability-aware … so smart-entry never recommends a step whose tool/capability is absent"). The classifier receives the `descriptors` array (via `availableCapabilities`) and gates each routed orient/out-of-band command on its capability key presence (`gsdHealth`, `gsdOrient` for resume-work, `gsdMilestoneAudit`, `gsdOrient` for new-milestone). When a routed capability is absent, the recommendation degrades to a generic "run gsd_status to orient" fallback (never names the missing tool). [VERIFIED: lib/_render.js:57-67; CONTEXT.md D-06] **Status: RESOLVED.**

**OQ-3 (RESOLVED):** Does the DEGR-05 per-plugin removal test need a new case for `gsd_next`, or does the existing `gsd-core-tools` removal case cover it?
**Resolution:** `gsd_next` is registered inside `gsd-core-tools` and paired to `gsdOrient`, so retiring `gsd-core-tools` already withdraws `gsdOrient` and thus the `/gsd-next` command pairing. The existing `gsd-core-tools` removal case in `test/removal.test.mjs` covers the tool unregister. The planner should add an assertion that `/gsd-next` is not in `ctx.commands` after `gsd-core-tools` retirement (one line, mirroring the existing command-absence checks). No new removal-test *case* is needed, only a tightened assertion. [VERIFIED: lib/commands.js:392-419; CONTEXT.md DEGR-05] **Status: RESOLVED.**

**OQ-4 (RESOLVED):** Should branch 5's `setActivePhase` acquire a `phase-<N>` feature branch via `ensurePhaseBranch` before committing, like the loop-step tools do?
**Resolution:** No. `gsd_next` is an orientation/auto-advance surface, not a loop step. `gsd_new_milestone` (the closest analog — it also mutates STATE and commits) does NOT call `ensurePhaseBranch`; it calls `commitArtifacts(cwd, null, { message })`. [VERIFIED: lib/core-tools.js:300-324] Branch 5 should follow the `gsd_new_milestone` pattern: `setActivePhase` then `commitArtifacts(cwd, phaseNum, { scope: "next", phaseName })` (or `commitArtifacts(cwd, null, { message })`). The CONTEXT canonical_refs names `commitArtifacts` but deliberately omits `ensurePhaseBranch`. **Status: RESOLVED — no feature-branch acquire; mirror gsd_new_milestone.**

---

## 6. Key in-repo discrete values (read this session, quoted verbatim)

These are the exact values the planner and executor must match. All paths are repo-relative.

**STATE.md step machine — `lib/state.js`:**
- Line 27: `const STEPS = ["discuss", "ui", "plan", "execute", "verify", "ship", "done"];`
- Lines 435-437 (`_nextActionFor`):
  ```
  return { spec: "discuss-phase", discuss: "discuss-phase", ui: "ui-phase", plan: "plan-phase", "gap-analysis": "gap-analysis-phase", execute: "execute-phase", review: "verify-phase", "ui-review": "verify-phase", verify: "verify-phase", validate: "ship-phase", ship: "ship-phase", done: null }[step] || "discuss-phase";
  ```
- Lines 421-433 (`setActivePhase`): sets `status`, `active_phase`, `current_phase`, `current_phase_name`, `next_action: this._nextActionFor(step)`, `next_phases: [String(phaseNum)]` via `updateStateFrontmatter`.
- Lines 833-850 (`completePhase`): sets `active_phase: null`, `status: "idle"`, `next_action: null`, recomputes `progress`.
- Lines 858-869 (`reconcileToIdle`): resets to idle baseline (used by milestone-audit on ready-to-close).

**next-action → step map — `lib/_render.js`:**
- Lines 29-38 (`NEXT_ACTION_TO_STEP`): `discuss-phase→discuss`, `ui-phase→ui`, `plan-phase→plan`, `gap-analysis-phase→gap-analysis`, `execute-phase→execute`, `verify-phase→verify`, `ship-phase→ship`, `done→null`.
- Lines 104-115 (`effectiveRoutableStep`): returns the present loop descriptor for the mapped step, or the nearest present step with greater order, or `loop[0]` for null/unknown, or null when no loop step exists.

**gsdOrient capability — `lib/_capabilities.js`:**
- Lines 75-85:
  ```
  step: "orient", role: "orient", order: NOT_LOOP_ORDERED (-1),
  tools: ["gsd_init", "gsd_status", "gsd_progress", "gsd_new_milestone", "gsd_pause_work", "gsd_resume_work"],
  commands: ["gsd-init", "gsd-status", "gsd-progress", "gsd-new-milestone", "gsd-pause-work", "gsd-resume-work"]
  ```
  → **must add** `"gsd_next"` to `tools` and `"gsd-next"` to `commands`.

**Paused-handoff detection — `lib/state.js`:**
- Lines 383-387 (`readHandoff`): reads `.planning/HANDOFF.json`, `JSON.parse`, returns `undefined` on absent/corrupt.
- Lines 406-411 (`readContinueHere`): reads `.continue-here.md` at phase-dir or `.planning/` root, returns `undefined` when absent.

**Milestone audit read-back — `lib/state.js` + `lib/milestone-audit.js`:**
- `lib/state.js:586-594`: `writeMilestoneArtifact`/`readMilestoneArtifact` use `slugify(milestoneName)-AUDIT.md` under `.planning/milestones/`. `readMilestoneArtifact` returns raw text (caller must `parseFrontmatter`).
- `lib/milestone-audit.js:79-81`: `classifyMilestoneStatus(gate)` returns `"ready-to-close"` when `gate.ready`, else `"not-ready"`. The audit frontmatter `status` field carries this (line 180).
- Milestone name source: `roadmap.milestoneName || state?.frontmatter?.milestone_name || "milestone"` (`lib/milestone-audit.js:124`).

**Commit seam — `lib/_git-artifacts.js`:**
- Lines 174-201 (`commitArtifacts`): `message = opts.message || "docs(planning): phase <N> <slug> <scope> artefacts"`; stages `.planning` wholesale; returns `{ committed, staged, message, warning? }`; never throws.

**Test count assertions — `test/mount.test.mjs`:**
- Line 147: `ctx.tools.length === 31`; line 148: `ctx.commands.length === 28`; line 190: `ctx2.commands.length === 27`; line 328: `ctx.tools.length === 31`.
- Lines 104-117: `EXPECTED_TOOL_NAMES` (31 entries). Lines 119-132: `EXPECTED_COMMAND_NAMES` (28 entries).

**Exact capability assertion — `test/_capabilities.test.mjs`:**
- Lines 67-71: `gsdOrient.tools` and `gsdOrient.commands` exact `deepEqual` arrays.

---

## 7. Project Constraints (from project conventions)

- **Zero new dependencies.** `package.json:134` has `"dependencies": {}`. All reused modules are in-repo or already-declared peerDependencies. [VERIFIED: package.json:134-140]
- **Test convention:** `node --test test/*.test.mjs` (`package.json:31`). Offline only — `FakeFs` + fake-ctx, no live boot/LLM/git. New tests follow `test/helpers/mount-harness.mjs` (`makeMountCtx`, `makeExec`, `CWD`, `initProject`, `mountSubset`). [VERIFIED: package.json:31, test/helpers/mount-harness.mjs:1-31, 83-196]
- **Plugin registration:** `cordis.patch.yml` is the single source of plugin rows. `gsd_next` adds NO new row (it ships inside `gsd-core-tools`). [VERIFIED: cordis.patch.yml:43-44]
- **Exports map:** `package.json:34-117` lists every subpath export. `gsd_next` adds NO new export (the pure helper `lib/_next.js` is internal, imported by `lib/core-tools.js`; not a public subpath). [VERIFIED: package.json:34-117]
- **Pure-helper discipline:** domain logic lives in a `lib/_*.js` or dedicated pure module with no `ctx`/`fs`/I/O, directly unit-testable, mirroring `lib/pause-resume.js`, `lib/_render.js`, `lib/autonomous.js` pure helpers. [VERIFIED: lib/pause-resume.js:1-10, lib/_render.js:1-12, lib/autonomous.js:35-46]
- **Never-instruct-a-missing-tool (persona D-02 / DEGR-02):** every `gsd_*` token in any rendered text must be backed by a present capability. `gsd_next`'s recommendation text must gate each named tool on capability presence. [VERIFIED: test/helpers/mount-harness.mjs:224-243; CONTEXT.md D-06]
- **Human-in-the-loop discipline (D-02):** auto-advance re-points STATE and returns the command to invoke, but does NOT auto-run that tool. The recommendation text must name the command, not invoke it. [VERIFIED: CONTEXT.md D-02, specifics]

---

## 8. Recommended plan decomposition (advisory, for the planner)

Based on the tier map and validation architecture, the natural non-overlapping plan wave is:

- **Plan 01 (domain, pure):** `lib/_next.js` — the pure classifier `classifyNextState(snapshot, descriptors)` returning `{ branch, recommendation, mutation? }`, plus the recommendation renderer. Unit-tested by `test/_next.test.mjs` across the full six-branch state matrix + precedence + capability-awareness. No `ctx`, no I/O.
- **Plan 02 (presentation/integration):** Register `gsd_next` in `lib/core-tools.js` (gather snapshot → classify → apply mutation via `setActivePhase` → `commitArtifacts` → return text); add `/gsd-next` to `lib/commands.js`; extend `gsdOrient` in `lib/_capabilities.js`. Integration-tested by extending `test/autonomous.test.mjs`-style mount in a new `test/next-integration.test.mjs` (or `test/core-tools.test.mjs` if one exists).
- **Plan 03 (test-count reconciliation):** Update the eight hardcoded assertions in `test/mount.test.mjs` and `test/_capabilities.test.mjs` (§4.3) and tighten the `gsd-core-tools` removal assertion (OQ-3). This may fold into Plan 02 since the capability extension and count update are atomic.

Plans 01 and 02 touch non-overlapping files (`lib/_next.js`+`test/_next.test.mjs` vs `lib/core-tools.js`+`lib/commands.js`+`lib/_capabilities.js`+integration tests), so they can run in the same wave; Plan 03's count updates depend on Plan 02's capability extension and should follow it (or be folded in).

---

*Provenance summary:* Every structural claim is [VERIFIED] against a file read this session with a cited path/line range. No [ASSUMED] tags appear for in-repo facts. No external packages were proposed, so no registry lookups were needed. All four Open Questions are marked (RESOLVED).
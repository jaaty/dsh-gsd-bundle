I have completed the research and written the RESEARCH.md to the target path. As required by my role contract, here is the **full RESEARCH.md file contents** for the orchestrator (it is also already saved at `.planning/phases/GSD-06-loop-robustness/GSD-06-loop-robustness-RESEARCH.md`):

---

```markdown
---
phase: 06-loop-robustness
researcher: gsd-phase-researcher
gathered: 2026-08-24
---

# Phase 6: loop-robustness — Research

Two independent robustness fixes, no new dependencies, no external services. Both
are internal-to-bundle changes touching the same small set of files: `lib/_agents.js`,
`lib/state.js`, `lib/execute.js`, `lib/quick.js`, `lib/_shared.js`, and tests. The
research below is grounded entirely in this session's reads of those files.

---

## Domain analysis

### Bug 1 — planner `depends_on` project-code-prefix bug (DUR-05, D-01..D-03)

**Mechanism of the bug (wave-2-skip).** Plan ids are built with an optional
project-code prefix:
- `_phaseDirName` builds `\`${prefix}${zeroPad(phaseNum)}-${slug}\`` where
  `prefix = \`${project_code}-\`` when a project_code is set, else `""`
  [VERIFIED: `lib/state.js:412-419`].
- `listPlans` sets each plan's `id` to `\`${base}-${zeroPad(planNum)}\`` where
  `base` is that prefixed `_phaseDirName` value, e.g. `GSD-01-auth-01`
  (with project_code `GSD`) [VERIFIED: `lib/state.js:462-497`, id at `:480`].

Dependency resolution compares `depends_on` entries **exactly** against `plans[].id`:
- `planIndex.runnable` (state.js): `const dep = plans.find((x) => x.id === d);
  return !dep || dep.has_summary;` [VERIFIED: `lib/state.js:515-518`].
- `gsd_execute` per-wave filter: `idx.plans.find((x) => x.id === d)?.has_summary`
  [VERIFIED: `lib/execute.js:79`].

The `PLANNER_PROMPT` tells the planner to write depends_on with a **non-prefixed**
example: `"01-auth-01"` [VERIFIED: `lib/_agents.js:51`]. So when a project_code is
set, the planner emits `depends_on: ["01-auth-01"]` but the real plan id is
`GSD-01-auth-01`; the exact match misses.

**Consequence:** the two resolution sites disagree, but both break wave 2:
- In `planIndex.runnable`, a missing dep yields `!dep === true`, so the wave-2
  plan is silently treated as *runnable* (dependency treated as satisfied) — the
  silently-broken wave class [VERIFIED: `lib/state.js:517`].
- In `gsd_execute:79`, a missing dep yields `undefined?.has_summary === undefined`
  (falsy), so the wave-2 plan is *blocked* and logged as "deps incomplete" —
  and it stays blocked forever because the exact match never resolves even after
  wave 1 completes. This is the wave-2-never-runs class [VERIFIED: `lib/execute.js:79-81`].

**Confidence: high.** The exact-match failure is confirmed directly in both
`planIndex.runnable` (`state.js:515-518`) and `execute.js:79`, and the prompt that
causes it is confirmed at `_agents.js:51`.

**Fix shape (D-01..D-03).**
- D-01: change the `PLANNER_PROMPT` depends_on guidance at `_agents.js:51` to the
  full prefixed id, and update `PLAN_CHECKER_PROMPT` Dimension 3 at `_agents.js:118`
  to validate depends_on against the prefixed id format. Confidence high — both
  lines are verbatim-read this session.
- D-02: add a prefix-normalization layer used by **both** resolution sites
  (`planIndex.runnable` and `gsd_execute:79`). Because both sites must change to
  be consistent, the normalization belongs in a shared helper both modules import
  (see Architectural Responsibility Map → `_shared.js`). Confidence high.
- D-03: once normalization runs, a depends_on entry that still matches no plan id
  must fail loud with a named error. Confidence high; the exact throw location and
  message style are discussed under Risks/Open Questions (RESOLVED).

### Bug 2 — gsd_quick TASK.md bypasses ctx.fs (DUR-06, D-04..D-05)

**Mechanism.** `gsd_quick` writes the quick-task record via raw `node:fs/promises`:
`await fs.mkdir(dir, {recursive:true})` then `fs.writeFile(\`${dir}/TASK.md\`, entry)`
[VERIFIED: `lib/quick.js:55-57`]. This bypasses the host `fs` service (`ctx.fs`)
entirely — inconsistent with every other artefact write in the bundle, which goes
through `GsdState._write` → `ctx.fs.writeText` [VERIFIED: `lib/state.js:78-82`].

**Why it matters:** the bundle's artefact model is the single choke point for
`.planning/` I/O. Phase 5 added root-level `GsdState` accessors
(`readWindows`/`appendWindow`/`readJobs`/`appendJob`/`updateJob`) all routed through
`this._write` [VERIFIED: `lib/state.js:347-409`], establishing the pattern the new
quick-record accessor must imitate (CONTEXT D-04 cites this). The current bypass
also forced the gsd_quick test off FakeFs onto a real temp dir, with an explicit
comment: "because it writes TASK.md via node:fs/promises (OQ-1)" and "bypassing
ctx.fs, so its happy path CANNOT run on pure FakeFs" [VERIFIED:
`test/service-tools.test.mjs:6-7, 193-196, 199`]. Fixing the bypass lets that test
move onto FakeFs, which is the strongest proof the fix worked.

**Fix shape (D-04..D-05).**
- D-04: add a `GsdState` accessor `writeQuickRecord(cwd, dateSlug, entry)` that
  writes `.planning/quick/<dateSlug>/TASK.md` via `this._write` (i.e. through
  `ctx.fs.writeText`), mirroring the phase-5 root-level accessors. `gsd_quick`
  calls it instead of `node:fs/promises`. Confidence high.
- D-05: path stays `.planning/quick/<date>-<slug>/TASK.md`; the accessor ensures
  the parent dir and is missing/tolerant like the phase-5 accessors. `_write`
  already does both: `_ensureParent` mkdir (catches errors → no throw) then
  `ctx.fs.writeText` [VERIFIED: `lib/state.js:78-97`]. The `node:fs/promises`
  import in `lib/quick.js` should be removed entirely once routing is done.
  Confidence high.

**Standard stack/pitfalls for these fixes.** No new stack. The only pitfalls are
consistency (both resolution sites must use the same normalization — a mismatch
reintroduces a different wave bug) and testability (the gsd_quick test must run on
FakeFs after the fix). Confidence high.

---

## Package legitimacy

**No new dependencies are proposed.** `package.json` declares `dependencies: {}`
and only host peer deps (`@deepseek-ai/dsh-tools`, `schemastery`, `cordis`,
`dsh-llm`) [VERIFIED: `package.json:62-68`]. Both fixes are implemented with the
bundle's existing internal modules (`lib/_shared.js`, `lib/state.js`,
`lib/execute.js`, `lib/quick.js`, `lib/_agents.js`) and the existing test runner
(`node --test`) [VERIFIED: `package.json:8`]. No registry lookup or web research
is required.

---

## Risks

1. **R1 — Resolver consistency (HIGH).** If `planIndex.runnable` normalizes but
   `gsd_execute:79` is left on exact-match (or vice-versa), the two sites diverge
   again and wave 2 either never runs (execute) or runs too early (runnable).
   Mitigation: put the resolver in ONE shared helper (`_shared.js`) imported by
   both `state.js` and `execute.js`; add a regression test that exercises the
   full `gsd_execute` path for a wave-2 plan (not just the unit-level `planIndex`).
2. **R2 — Fail-loud over-reach (MEDIUM).** Making `planIndex` throw on an
   unresolvable dep also affects `gsd_progress`/`gsd_status`, which call
   `planIndex(...).catch(() => null)` [VERIFIED: `lib/core-tools.js:166,172`].
   Those degrade to "no data" rather than failing — acceptable, but the throw
   must be a clear, named message so a future debugger understands the phase
   cannot be indexed because of a bad `depends_on`. Verify no `planIndex` caller
   that needs graceful behavior lacks a `.catch`.
3. **R3 — Prefix-normalization false matches (LOW).** Within a single phase all
   plan ids share the same prefix, so modulo-prefix matching cannot collide across
   prefixes. The resolver operates on a single phase's plan list only, so there is
   no cross-phase ambiguity. A dep like `01-auth-01` matches exactly one plan id
   (`GSD-01-auth-01`). Confidence high.
4. **R4 — Stale test rationale (LOW).** The existing gsd_quick real-temp-dir test
   comment becomes misleading after the fix. The plan should convert it to FakeFs
   and drop the obsolete rationale rather than leave a lying comment.

---

## Open Questions

- **OQ-1 (RESOLVED): Where does the shared prefix-normalization resolver live?**
  Both `state.js` (planIndex) and `execute.js` need it. `_shared.js` is the shared,
  dependency-light, pure-ESM module already imported by `state.js`, `execute.js`,
  and `quick.js` (execute.js already imports `zeroPad, matchesGapClosure, nowIso`
  from it [VERIFIED: `lib/execute.js:15`]). Recommendation: export a pure helper
  `stripPlanPrefix(id)` and `resolvePlanDep(plans, dep)` from `lib/_shared.js`;
  `planIndex.runnable` and `execute.js:79` both call `resolvePlanDep`. This is the
  D-02 "normalization layer at dependency-resolution time (planIndex.runnable /
  gsd_execute)".

- **OQ-2 (RESOLVED): Should `planIndex` itself throw on an unresolvable dep, or a
  separate check?** Putting the throw inside `planIndex.runnable` (after
  normalization) is the single choke point and satisfies D-03 "gsd_execute fails
  loud". `gsd_plan` does NOT call `planIndex` [VERIFIED: `lib/plan.js` — uses
  `listPlans` only, `:116,130`]; it is covered by the D-01 prompt/checker fixes so
  bad `depends_on` is caught at authoring time. `core-tools` callers already
  `.catch(() => null)` [VERIFIED: `lib/core-tools.js:166,172`]. Recommendation:
  throw in `planIndex.runnable` with a named message.

- **OQ-3 (RESOLVED): What does "named error" mean given the codebase convention?**
  The entire bundle uses plain `throw new Error("gsd_xxx: ...")` with a
  tool-prefixed message — no custom Error subclasses exist anywhere
  [VERIFIED: grep of `lib/*.js`]. Recommendation: a plain `Error` with a clear,
  self-identifying message, e.g.
  `gsd_execute: unresolved plan dependency "01-auth-01" — no plan in phase 1 matches after prefix normalization (check depends_on frontmatter)`. This satisfies D-03
  ("fails loud with a named error") within the existing convention. A custom
  subclass is optional and NOT required.

- **OQ-4 (RESOLVED): How does the D-01 prompt fix make the planner aware of the
  actual project_code?** The prompt template is static and cannot know the
  runtime project_code, but the planner does not need to: `gsd_plan` passes the
  real prefixed base into the "Write each plan to `${phaseDir}/${base}-<PP>-PLAN.md`"
  instruction [VERIFIED: `lib/plan.js:107`], and the plan file paths it writes
  carry the prefix. So D-01 only needs the example/comment in `_agents.js:51` to
  read as a prefixed id (e.g. `GSD-01-auth-01`) plus an explicit instruction to
  match the prefixed base in the write-path. No runtime plumbing needed.

- **OQ-5 (RESOLVED): Must the existing real-temp gsd_quick test stay?** No. Its
  rationale is the node:fs bypass, which D-04 removes. Convert it to run on FakeFs
  (assert `fs.files.has(\`${CWD}/.planning/quick/<date>-<slug>/TASK.md\`)`) and add a
  state-level `writeQuickRecord` round-trip test. This directly proves DUR-06.

- **OQ-6 (RESOLVED): Does the resolver need project_code from config?** No. Plan
  ids already embed the prefix; a pure string-normalization on the plan id (split
  off the leading `<prefix>-` before the phase-number part) avoids touching config
  and keeps `_shared.js` dependency-free.

---

## Architectural Responsibility Map

| Capability | Tier | Where | Notes |
|-----------|------|-------|-------|
| depends_on prefix-normalization (D-02) | **Domain** | `_shared.js` (pure helper `stripPlanPrefix`/`resolvePlanDep`) | Pure domain rule: how the loop resolves a plan dependency. Used by `state.js` and `execute.js`. Not security-sensitive. |
| Runnable-wave computation + fail-loud (D-03) | **Domain** | `state.js` `planIndex.runnable` | Domain decision about which plans may run and failing loud on an unresolvable dep. |
| Per-wave runnable dispatch in gsd_execute (D-02 consistency) | **Presentation** (tool/orchestration) | `execute.js:79` | Orchestrator layer; must consume the same domain resolver. |
| Prompt/checker depends_on guidance (D-01) | **Presentation** (agent meta-prompts) | `_agents.js:51,118` | Instructions to the planner/checker subagents. |
| Quick-record artefact write (D-04/D-05) | **Data** | `state.js` `writeQuickRecord` (routes via `ctx.fs`); consumed by `quick.js` | Artefact persistence through the host fs service. |
| Host fs I/O | **Integration** | `ctx.fs` (`@deepseek-ai/dsh-fs-local` contract, per FakeFs comment [VERIFIED: `test/helpers/fake-fs.mjs:5`]) | Underlying integration; the accessor must not bypass it. |

No security-sensitive capability is misplaced; there is no security-sensitive
capability in this phase at all. **No BLOCKER tier issue.**

---

## Validation Architecture

Every behaviour below is proven by `node --test` (the project's single test
command, `package.json:8`), using the existing FakeFs + fake-subagents harness
[VERIFIED: `test/helpers/fake-fs.mjs`, `test/helpers/project.mjs`,
`test/tools.test.mjs:25-71`].

**D-01 (prompt/checker guidance):** grep-verifiable strings.
- `grep -n "GSD-01-auth-01" lib/_agents.js` (or an equivalent explicit prefixed
  example / `PROJECT_CODE` token) appears in `PLANNER_PROMPT` at line 51.
- `grep -n "prefixed" lib/_agents.js` matches `PLAN_CHECKER_PROMPT` Dimension 3
  text (line ~118) so the checker validates depends_on against the prefixed id.

**D-02 (prefix-tolerant resolution):** unit + integration.
- New `_shared.test.mjs` test: `stripPlanPrefix("GSD-01-auth-01") === "01-auth-01"`;
  `resolvePlanDep([{id:"GSD-01-auth-01"}], "01-auth-01")` returns the plan;
  `resolvePlanDep(plans, "GSD-01-auth-01")` exact-match still works.
- New `state.test.mjs` test building a project **with** `projectCode` (so ids are
  prefixed, cf. `initProject`/`readConfig` round-trip test at `state.test.mjs:279-297`)
  and asserting `planIndex.runnable` includes/excludes a wave-2 plan correctly when
  its `depends_on` is the non-prefixed form.
- Regression in `tools.test.mjs`: `gsd_execute` runs a wave-2 plan only after its
  wave-1 dependency's SUMMARY exists (wave-1 present → wave-2 runs; wave-1 absent →
  wave-2 blocked). Fake subagents already write SUMMARYs for `execute` labels
  [VERIFIED: `test/tools.test.mjs:36-43`].

**D-03 (fail loud):** `state.test.mjs` — build a plan whose `depends_on` is
`"99-nonexistent-01"`; assert `planIndex` rejects/throws with a message matching
`/unresolved plan dependency/` (or the chosen named message). Also assert the
`gsd_execute` tool surfaces it (or that the throw propagates), and that
`gsd_progress`/`gsd_status` still degrade gracefully via their existing
`.catch(() => null)` (no new breakage).

**D-04/D-05 (gsd_quick ctx.fs routing):**
- New `state.test.mjs` test: `writeQuickRecord(CWD, "2026-08-24-fix-typo", entry)`
  on FakeFs writes `\`${CWD}/.planning/quick/2026-08-24-fix-typo/TASK.md\`` with the
  exact `entry` content and does not throw when parents are absent.
- Convert the existing gsd_quick test in `service-tools.test.mjs` (currently
  real-temp-dir) to FakeFs: assert `fs.files.has(\`${CWD}/.planning/quick/<date>-<slug>/TASK.md\`)`
  and that the content matches. Drop the now-false node:fs rationale.
- Grep guard: `lib/quick.js` no longer imports `node:fs/promises`.

**Coverage gate (MOUNT-06):** `npm test` passes on a clean checkout.

---

## Project Constraints

From `package.json` and test conventions [VERIFIED]:
- Test command is exactly `node --test test/*.test.mjs` (`package.json:8`);
  MOUNT-06 requires it passes on a clean checkout.
- The bundle is a host-plane plugin set; it must NOT add runtime dependencies —
  `dependencies: {}` is a standing constraint (`package.json:62`).
- `GsdState` uses `ctx.fs` for all artefact persistence; the phase-5 root-level
  accessor pattern (`_write` → `ctx.fs.writeText`, missing/corrupt tolerant,
  `never throw` on read) is the established convention to imitate
  [VERIFIED: `lib/state.js:78-97, 342-409`].
- Errors follow `throw new Error("gsd_xxx: <message>")` throughout
  [VERIFIED: grep of `lib/*.js`]; `gsd_quick` already uses this for its service
  guards (`lib/quick.js:36-38`).
- The bundle runs executors on the shared working tree (not git worktrees) —
  stated in `lib/execute.js:9-12`. No worktree handling is part of this phase.
- Current branch is `phase-5` (per `git branch --show-current`); phase 6 work
  continues on a feature branch.
```

---

**Research summary.** Both fixes are internal and dependency-free. Bug 1 (DUR-05) is a confirmed exact-match failure in two resolution sites (`lib/state.js:515-518` and `lib/execute.js:79`) driven by a non-prefixed depends_on example in `lib/_agents.js:51`; the fix is a shared prefix-normalization resolver (`_shared.js`) used by both sites, prompt/checker guidance updates, and a fail-loud named error in `planIndex.runnable` (D-01/D-02/D-03). Bug 2 (DUR-06) is a confirmed `node:fs/promises` bypass in `lib/quick.js:55-57`; the fix is a `GsdState.writeQuickRecord(cwd, dateSlug, entry)` accessor routed through `ctx.fs` via the established `_write` pattern, plus moving the gsd_quick test onto FakeFs (D-04/D-05). All six open questions are marked (RESOLVED).
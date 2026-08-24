---
phase: 06-loop-robustness
plan: 01
type: tdd
wave: 1
depends_on: []
files_modified: ["lib/_shared.js", "lib/state.js", "lib/execute.js", "lib/_agents.js", "test/_shared.test.mjs", "test/state.test.mjs", "test/tools.test.mjs"]
autonomous: true
requirements: ["DUR-05"]
user_setup: []
must_haves:
  truths:
    - "A wave-2 plan whose depends_on uses the non-prefixed form (e.g. '01-auth-01') resolves to the prefixed plan id and runs only after that dependency's SUMMARY exists — the wave-2-never-runs / silently-runs-too-early bug is gone."
    - "A depends_on value that matches no plan id even after prefix normalization fails loud with a named gsd_* error instead of silently producing a broken wave."
    - "The PLANNER_PROMPT and PLAN_CHECKER_PROMPT instruct depends_on to use the fully-prefixed plan id (e.g. GSD-01-auth-01), not the bare '01-auth-01'."
  artifacts:
    - path: "lib/_shared.js"
      provides: "Pure, dependency-free plan-dependency resolution: stripPlanPrefix and resolvePlanDep used by both state.js planIndex and execute.js"
      min_lines: 8
      exports: ["stripPlanPrefix", "resolvePlanDep"]
  key_links:
    - from: "lib/state.js planIndex.runnable"
      to: "lib/_shared.js resolvePlanDep"
      via: "import and call resolvePlanDep for each depends_on entry; it throws a named error on an unresolvable dep"
      pattern: "resolvePlanDep"
    - from: "lib/execute.js wave-runnable filter"
      to: "lib/_shared.js resolvePlanDep"
      via: "import and call resolvePlanDep so execute.js resolves deps with the same prefix-tolerant rule as planIndex"
      pattern: "resolvePlanDep"
---
<objective>Fix DUR-05: make plan dependency resolution tolerate the project-code-prefixed plan id, correct the planner/checker prompts so the planner emits prefixed depends_on values, and fail loud with a named error when a depends_on value still resolves to no plan. Deliver it as a TDD plan.</objective>

<context>
@lib/_shared.js — pure-ESM shared helpers (zeroPad, parseFrontmatter); the home for the new stripPlanPrefix/resolvePlanDep.
@lib/state.js — _phaseDirName (412-419) builds the prefixed base; listPlans (462-497) sets each plan id to `\`${base}-${zeroPad(planNum)}\`` (480); planIndex.runnable (515-518) resolves deps via `plans.find((x) => x.id === d)` exact-match.
@lib/execute.js — per-wave runnable filter (79) uses `idx.plans.find((x) => x.id === d)?.has_summary`; imports zeroPad, matchesGapClosure, nowIso from ./_shared.js (line 15).
@lib/_agents.js — PLANNER_PROMPT depends_on guidance at line 51 (example "01-auth-01"); PLAN_CHECKER_PROMPT Dimension 3 at line 118.
@test/_shared.test.mjs, @test/state.test.mjs, @test/tools.test.mjs — the test files this plan extends.
</context>

<tasks>
  <task type="auto">
    <name>Task 1: Add stripPlanPrefix and resolvePlanDep pure helpers + unit tests (tracer)</name>
    <files>lib/_shared.js, test/_shared.test.mjs</files>
    <read_first>lib/_shared.js, test/_shared.test.mjs</read_first>
    <action>In lib/_shared.js, append two exported functions near the existing decision helpers (after isClosedPhase). stripPlanPrefix(id): take a plan id string like "GSD-01-auth-01" and return it with the leading project-code token removed, i.e. strip everything before the phase-number segment so "GSD-01-auth-01" becomes "01-auth-01" and a bare "01-auth-01" returns unchanged. Implement by splitting the id on "-" and dropping the first segment only when what remains starts with the zero-padded phase number pattern (two digits followed by "-"). Do NOT reference config or project_code — the prefix is derivable from the string shape alone. resolvePlanDep(plans, dep): return the first plan in the plans array whose id === dep (exact match) OR whose id, after stripPlanPrefix, === stripPlanPrefix(dep); return undefined when no plan matches. Keep it pure, synchronous, dependency-free. Then, in test/_shared.test.mjs, add tests: stripPlanPrefix("GSD-01-auth-01") === "01-auth-01"; stripPlanPrefix("01-auth-01") === "01-auth-01"; resolvePlanDep([{id:"GSD-01-auth-01"}], "01-auth-01") returns the plan object; resolvePlanDep([{id:"GSD-01-auth-01"}], "GSD-01-auth-01") exact-match still returns it; resolvePlanDep([{id:"GSD-01-auth-01"}], "99-nonexistent-01") === undefined.</action>
    <verify>node --test test/_shared.test.mjs</verify>
    <acceptance_criteria>
      - node --test test/_shared.test.mjs exits 0 (all new assertions pass)
      - grep -n "export function stripPlanPrefix" lib/_shared.js matches
      - grep -n "export function resolvePlanDep" lib/_shared.js matches
      - grep -n "stripPlanPrefix" test/_shared.test.mjs matches
      - grep -n "resolvePlanDep" test/_shared.test.mjs matches
    </acceptance_criteria>
    <done>Both pure helpers exist and are unit-tested green; the tracer slice touches the shared resolution layer and is production-quality.</done>
  </task>

  <task type="auto">
    <name>Task 2: Route planIndex.runnable and execute.js through resolvePlanDep + fail loud (D-02, D-03)</name>
    <files>lib/state.js, lib/execute.js, test/state.test.mjs, test/tools.test.mjs</files>
    <read_first>lib/state.js, lib/execute.js, test/state.test.mjs, test/tools.test.mjs</read_first>
    <action>Per D-02, add resolvePlanDep to the existing `import { ... } from "./_shared.js"` in lib/state.js (find the current _shared import line and extend it). Replace the exact-match logic in planIndex.runnable (state.js:515-518) so each depends_on entry resolves through resolvePlanDep(plans, d) instead of plans.find((x) => x.id === d). Per D-03, when resolvePlanDep returns undefined for a depends_on entry, throw a named Error with a self-identifying message beginning "gsd_phase: unresolved plan dependency " plus the raw dep value plus guidance to check depends_on frontmatter; use the bundle's plain `throw new Error("gsd_...: ...")` convention (no custom Error subclass). In lib/execute.js, add resolvePlanDep to the existing ./_shared.js import (line 15) and replace the two `idx.plans.find((x) => x.id === d)` occurrences (lines 79 and 88) with resolvePlanDep(idx.plans, d) so execute.js uses the same prefix-tolerant rule and the same fail-loud behavior for the runnable filter. In test/state.test.mjs, build a project WITH projectCode (reuse the initProject/readConfig round-trip pattern at state.test.mjs:279-297) whose phase has two plans — plan 1 wave 1, plan 2 wave 2 with depends_on: ["01-auth-01"] (non-prefixed); assert planIndex.runnable excludes plan 2 when plan 1 has no SUMMARY and includes it once plan 1 has a SUMMARY; and a second case with depends_on: ["99-nonexistent-01"] asserting planIndex rejects with a message matching /unresolved plan dependency/. In test/tools.test.mjs add a gsd_execute regression: a prefixed project where a wave-2 plan depends_on a wave-1 plan id in non-prefixed form — assert the wave-2 executor is NOT dispatched until the wave-1 SUMMARY exists and IS dispatched after; the fake subagents already write SUMMARYs for execute labels.</action>
    <verify>node --test test/state.test.mjs test/tools.test.mjs</verify>
    <acceptance_criteria>
      - node --test test/state.test.mjs test/tools.test.mjs exits 0
      - grep -n "resolvePlanDep" lib/state.js matches
      - grep -n "resolvePlanDep" lib/execute.js matches
      - grep -n "unresolved plan dependency" lib/state.js matches (fail-loud message)
      - grep -n "resolvePlanDep" test/state.test.mjs matches
      - grep -n "resolvePlanDep" test/tools.test.mjs matches
    </acceptance_criteria>
    <done>Both resolution sites share the prefix-tolerant resolver; an unresolvable depends_on throws a named error; unit and integration regressions prove the wave-2 behavior fix.</done>
  </task>

  <task type="auto">
    <name>Task 3: Correct PLANNER_PROMPT depends_on guidance and PLAN_CHECKER_PROMPT Dimension 3 (D-01)</name>
    <files>lib/_agents.js</files>
    <read_first>lib/_agents.js</read_first>
    <action>Per D-01, in the PLANNER_PROMPT template (the depends_on line currently showing the bare example "01-auth-01" at lib/_agents.js:51), change the guidance so the depends_on example is the fully-prefixed plan id (project-code + <NN>-<slug>-<PP>), e.g. "GSD-01-auth-01", and add an explicit instruction that the planner must match the prefixed base it is given in the "Write each plan to ${phaseDir}/${base}-<PP>-PLAN.md" instruction (i.e. write depends_on with the same prefix that appears in the plan file paths). In the PLAN_CHECKER_PROMPT, extend Dimension 3 (dependency correctness, currently at line ~118) so the checker validates that every depends_on value uses the fully-prefixed plan id format (project-code + zero-padded phase + slug + zero-padded plan) and flags any bare non-prefixed depends_on as an error. Do not change any other prompt text.</action>
    <verify>node --test test/mount.test.mjs</verify>
    <acceptance_criteria>
      - grep -n "GSD-01-auth-01" lib/_agents.js matches (or an equivalent explicit prefixed example in PLANNER_PROMPT)
      - grep -n "prefixed" lib/_agents.js matches PLAN_CHECKER_PROMPT Dimension 3 text
      - node --test test/mount.test.mjs exits 0 (prompt templates still valid)
    </acceptance_criteria>
    <done>The planner and checker prompts now teach prefixed depends_on ids, closing the authoring-time cause of the bug.</done>
  </task>
</tasks>

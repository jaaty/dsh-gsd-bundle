---
phase: 24-composability-hardening
plan: 03
type: execute
wave: 2
depends_on: ["GSD-24-composability-hardening-01", "GSD-24-composability-hardening-02"]
files_modified: ["lib/core-tools.js", "test/helpers/mount-harness.mjs", "test/coeffect.test.mjs", "VALIDATION.md"]
autonomous: true
requirements: ["DEGR-07"]
gap_closure: false
user_setup: []
must_haves:
  truths:
    - "core-tools scopes the subagents coeffect to the gsd_job tool's sub-fiber: gsd_job is registered only when the subagents service is present, while gsd_init/gsd_status/gsd_progress/gsd_new_milestone/gsdOrient/gsdJobs stay active when it is absent (graceful degradation per phase-22 D-03)."
  artifacts:
    - path: "test/helpers/mount-harness.mjs"
      provides: "ctx.inject represents subagents presence: when a subagents service is supplied it is added to the provided store so ctx.inject(['subagents'], ...) activates; when subagents is null it is absent so the sub-fiber stays inactive."
      min_lines: 40
      exports: ["makeMountCtx", "mountSubset", "makeSubagents", "CWD", "PATCH_ROWS"]
    - path: "test/coeffect.test.mjs"
      provides: "A reactive test asserting the gsd_job sub-fiber activates when subagents is present and stays inactive when it is absent, while the non-subagent core-tools surfaces stay active."
      min_lines: 20
      exports: []
    - path: "VALIDATION.md"
      provides: "The behaviour-to-test mapping for Tests A–G (unload-cancel, static inject, reactive sub-fiber, jobs suite update, full-suite regression), documenting which test proves each behaviour."
      min_lines: 20
      exports: []
  key_links:
    - from: "lib/core-tools.js"
      to: "test/coeffect.test.mjs"
      via: "the reactive test mounts core-tools with subagents present/absent and asserts gsd_job registration flips while gsd_init/gsd_status/gsdOrient/gsdJobs remain registered."
      pattern: "ctx.inject\\(\\[.subagents|gsd_job"
---
<objective>Scope the subagents coeffect to core-tools' gsd_job tool's sub-fiber (DEGR-07, D-05): wrap the gsd_job registration in ctx.inject(['subagents'], ...) so only gsd_job deactivates when subagents is absent, while gsd_init/gsd_status/gsd_progress/gsd_new_milestone/gsdOrient/gsdJobs stay active. Extend the fake harness so ctx.inject can represent subagents presence, and prove the reactive activation/deactivation with an offline test.</objective>
<context>@lib/core-tools.js (apply line 29, gsd_job registration lines 318-385, gsd_init/gsd_status/gsd_progress/gsd_new_milestone registrations lines 41-306, gsdOrient/gsdJobs provides lines 37-38), @lib/commands.js (ctx.inject sub-fiber pattern lines 200-216), @test/helpers/mount-harness.mjs (ctx.inject lines 124-131, ctx.get subagents special-case lines 101-108, makeMountCtx signature line 69), @test/coeffect.test.mjs (created in plan 02)</context>
<tasks>
  <task type="auto">
    <name>Task 1: extend the fake harness so ctx.inject can represent subagents presence</name>
    <files>test/helpers/mount-harness.mjs</files>
    <read_first>test/helpers/mount-harness.mjs</read_first>
    <action>In makeMountCtx (line 69): compute a single subagents service value `const subagentsSvc = subagents === null ? undefined : (typeof subagents === "function" ? subagents(fs) : (subagents || makeSubagents()));`. Add it to the provided store ONLY when the caller explicitly supplied a subagents value — gate on `subagents !== undefined && subagents !== null`: `if (subagents !== undefined && subagents !== null) provided.set("subagents", subagentsSvc);`. This preserves the current default behaviour exactly: when `subagents` is omitted (undefined), `makeSubagents()` is still returned by ctx.get but is NOT added to `provided`, so `provided.has("subagents")` stays `false` by default and no existing test that relies on `subagents` being absent from `provided` changes behaviour. Change the ctx.get special-case (lines 103-106) to `if (n === "subagents") return subagentsSvc;`. This makes ctx.inject's `provided.has("subagents")` check (line 126) reflect real presence: an explicitly supplied service activates a `['subagents']` sub-fiber, and `subagents: null` leaves it absent so the sub-fiber stays inactive.</action>
    <verify>node --test test/mount.test.mjs test/removal.test.mjs test/coeffect.test.mjs</verify>
    <acceptance_criteria>
      - grep "subagentsSvc" test/helpers/mount-harness.mjs returns at least one hit
      - grep "provided.set(\"subagents\"" test/helpers/mount-harness.mjs returns a hit
      - grep "subagents !== undefined" test/helpers/mount-harness.mjs returns a hit (explicit-supply gate)
      - `node --test test/mount.test.mjs test/removal.test.mjs test/coeffect.test.mjs` exits 0
    </acceptance_criteria>
    <done>The harness ctx.inject treats 'subagents' as a controllable key: present only when a service is explicitly supplied, absent when subagents is null, and the default (omitted) case keeps subagents out of provided so existing tests are unaffected.</done>
  </task>
  <task type="auto">
    <name>Task 2: wrap the gsd_job registration in a subagents sub-fiber (tracer)</name>
    <files>lib/core-tools.js</files>
    <read_first>lib/core-tools.js, lib/commands.js</read_first>
    <action>In lib/core-tools.js apply(), wrap ONLY the gsd_job tool registration (the `ctx.tools.register(defineTool({ name: "gsd_job", ... }))` block at lines 318-385) in a sub-fiber coeffect: `ctx.inject(["subagents"], (subCtx) => { subCtx.tools.register(defineTool({ ...gsd_job unchanged... })); });`. The gsd_job tool's execute closure must keep referencing the OUTER `ctx` (for gsdState, cwdOf) and the `runtime` created in apply (for the jobs.js calls) — do not switch it to subCtx. Leave gsd_init, gsd_status, gsd_progress, gsd_new_milestone, and the gsdOrient/gsdJobs provides (lines 37-38) registered unconditionally outside the sub-fiber, so they stay active when subagents is absent (D-05, phase-22 D-03).</action>
    <verify>grep -n "ctx.inject(\[\"subagents\"\]" lib/core-tools.js</verify>
    <acceptance_criteria>
      - grep "ctx.inject(\[\"subagents\"\]" lib/core-tools.js returns exactly one hit
      - grep "name: \"gsd_job\"" lib/core-tools.js returns a hit inside the ctx.inject block
      - grep "name: \"gsd_init\"" lib/core-tools.js and "name: \"gsd_status\"" lib/core-tools.js return hits OUTSIDE the ctx.inject block
    </acceptance_criteria>
    <done>gsd_job is registered only through a ctx.inject(['subagents']) sub-fiber; all other core-tools surfaces remain unconditional.</done>
  </task>
  <task type="auto">
    <name>Task 3: add the reactive sub-fiber activation/deactivation test (DEGR-07 Test E)</name>
    <files>test/coeffect.test.mjs</files>
    <read_first>test/coeffect.test.mjs, test/helpers/mount-harness.mjs</read_first>
    <action>In test/coeffect.test.mjs add a describe block for the core-tools gsd_job sub-fiber. Use mountSubset from the harness. Test (a) subagents present: `const { ctx } = await mountSubset(["core-tools"], { subagents: makeSubagents() })` (import makeSubagents from the harness), assert `ctx.tools.some((t) => t.name === "gsd_job")` is true, and assert gsd_init, gsd_status, gsd_progress, gsd_new_milestone are all registered, and `ctx.provided.has("gsdOrient")` and `ctx.provided.has("gsdJobs")` are true. Test (b) subagents absent: `const { ctx } = await mountSubset(["core-tools"], { subagents: null })`, assert `ctx.tools.some((t) => t.name === "gsd_job")` is false, while gsd_init, gsd_status, gsd_progress, gsd_new_milestone are still registered and gsdOrient/gsdJobs are still provided.</action>
    <verify>node --test test/coeffect.test.mjs test/removal.test.mjs</verify>
    <acceptance_criteria>
      - grep "gsd_job" test/coeffect.test.mjs returns at least two assertion hits
      - grep "subagents: null" test/coeffect.test.mjs returns a hit
      - `node --test test/coeffect.test.mjs test/removal.test.mjs` exits 0
    </acceptance_criteria>
    <done>The reactive test proves gsd_job activates when subagents is present and deactivates when absent, while the non-subagent core-tools surfaces stay active; the removal suite (DEGR-05 regression) still passes after the gsd_job sub-fiber wrap.</done>
  </task>
  <task type="auto">
    <name>Task 4: run the full test suite (Test G) and write VALIDATION.md</name>
    <files>VALIDATION.md</files>
    <read_first>test/helpers/mount-harness.mjs, test/coeffect.test.mjs, test/jobs.test.mjs, test/mount.test.mjs, test/removal.test.mjs</read_first>
    <action>Run the full offline suite `node --test test/*.test.mjs` and confirm it exits 0 — this is the cross-plan regression gate (RESEARCH Test G, MOUNT-06) that catches any interaction between the jobs-runtime refactor (plan 01), the inject declarations (plan 02), and the gsd_job sub-fiber wrap + harness change (this plan), including test/removal.test.mjs. Then create VALIDATION.md at the phase root (next to the PLAN files) mapping each behaviour to its test: list Test A (subagent controller aborted on unload → test/jobs.test.mjs unload-cancel), Test B (shell child killed on unload → test/jobs.test.mjs unload-cancel), Test C (best-effort no-throw → test/jobs.test.mjs unload-cancel + test/mount.test.mjs disposer-invocation), Test D (static inject assertions → test/coeffect.test.mjs), Test E (reactive sub-fiber activation/deactivation → test/coeffect.test.mjs), Test F (jobs.test.mjs updated for new signatures → test/jobs.test.mjs), Test G (full suite → `node --test test/*.test.mjs`). For each, state the behaviour it proves and the exact test name/file. Do not modify any lib/ or test/ file in this task — it is verification + documentation only.</action>
    <verify>node --test test/*.test.mjs</verify>
    <acceptance_criteria>
      - `node --test test/*.test.mjs` exits 0
      - VALIDATION.md exists and contains the strings "Test A", "Test B", "Test C", "Test D", "Test E", "Test F", "Test G"
      - VALIDATION.md references each of test/jobs.test.mjs, test/coeffect.test.mjs, test/mount.test.mjs, test/removal.test.mjs at least once
    </acceptance_criteria>
    <done>The full offline suite passes on the completed phase (no cross-plan regression), and VALIDATION.md documents the behaviour-to-test mapping for Tests A–G.</done>
  </task>
</tasks>

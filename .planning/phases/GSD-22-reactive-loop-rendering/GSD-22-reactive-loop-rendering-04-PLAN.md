---
phase: 22-reactive-loop-rendering
plan: 04
type: execute
wave: 3
depends_on: ["GSD-22-reactive-loop-rendering-01", "GSD-22-reactive-loop-rendering-02", "GSD-22-reactive-loop-rendering-03"]
files_modified: ["test/mount.test.mjs"]
autonomous: true
requirements: ["DEGR-02", "DEGR-04"]
user_setup: []
must_haves:
  truths:
    - The offline mount harness can apply a chosen plugin SUBSET and route ctx.get to return the provided capability descriptors, so reactivity can be asserted without a real DSH boot (D-11, RESEARCH OQ-6).
    - Subset-mount tests prove (a) the persona body + snapshot omit absent steps and never name their tools, (b) gsd_status hides/replaces next_action for absent capabilities and shows a correct Available-steps section, and (c) zero-loop and partial-loop degrade gracefully (D-11).
  artifacts:
    - path: "test/mount.test.mjs"
      provides: "extended ctx.get capability lookup + subset-mount reactive test scenarios for DEGR-02/DEGR-04"
      min_lines: 120
      exports: []
  key_links:
    - from: "test/mount.test.mjs"
      to: "test/mount.test.mjs"
      via: "makeMountCtx.get returns a provided capability descriptor for capability keys, enabling subset-mount reactivity assertions"
      pattern: "provided\\.get"
---
<objective>
Extend the existing offline mount harness (test/mount.test.mjs) so it can prove the phase-22 reactivity contract end-to-end (D-11): make `makeMountCtx.get` return a stored capability descriptor from `ctx.provided` for any capability key, add an `applySubset(ctx, subs)` helper that applies only a chosen subset of the 12 plugin rows, and add describe-blocks asserting (a) persona + snapshot omit absent steps/tools, (b) gsd_status rewrites/hides next_action and prints a correct Available-steps section for absent capabilities, and (c) zero-loop and partial-loop degrade gracefully — all offline (no live DSH/git/gh). This is the behavioral proof for DEGR-02 and DEGR-04.
</objective>
<context>@.planning/phases/GSD-22-reactive-loop-rendering/GSD-22-reactive-loop-rendering-CONTEXT.md
@.planning/phases/GSD-22-reactive-loop-rendering/GSD-22-reactive-loop-rendering-RESEARCH.md
@test/mount.test.mjs
@lib/_capabilities.js
@test/mount.test.mjs
@lib/_render.js</context>
<tasks>
  <task type="auto">
    <name>Task 1: makeMountCtx.get returns provided capability descriptors + add applySubset helper</name>
    <files>test/mount.test.mjs</files>
    <read_first>test/mount.test.mjs, lib/_capabilities.js</read_first>
    <action>
      In test/mount.test.mjs, extend `makeMountCtx` (lines 59-113): change the `get` implementation (lines 87-89) so that for a capability key it returns the stored descriptor. Replace the current `get` with one that first handles `gsdState` and `subagents`, then checks `provided.has(n)` and returns `provided.get(n)` when present, else `undefined`. Concrete: `get: (n) => { if (n === "gsdState") return gsdStateSvc; if (n === "subagents") return makeSubagents(); return provided.has(n) ? provided.get(n) : undefined; }`. This makes `ctx.get("gsdDiscuss")` return the `buildCapability("gsdDiscuss")` descriptor that gsd-discuss's apply() provided via ctx.provide, so the persona / gsd_status / _render helper read the mounted subset.
      Add a module-level `applySubset(ctx, subs, config)` helper after `applyAll` (lines 116-127) that imports only the given subpath modules from the PATCH_ROWS list and calls their apply(ctx, config||{}) in the listed order, throwing with the offending id on error (mirror applyAll's error wrapping at line 119-125). Signature: `async function applySubset(ctx, subs, config = {})`. For each `sub`, locate the PATCH_ROWS row with that `sub`, import `@dsh-gsd/bundle/${sub}`, assert `typeof mod.apply === "function"`, and call `mod.apply(ctx, config)`, wrapping any throw with the `${id} apply() threw:` prefix (same format as applyAll).
    </action>
    <verify>node --test test/mount.test.mjs test/render.test.mjs    <verify>node --test test/mount.test.mjs test/render.test.mjs</verify>
    <acceptance_criteria>
      - grep test/mount.test.mjs for "provided.has(n)" (ctx.get capability lookup).
      - grep test/mount.test.mjs for "applySubset" (helper defined).
      - node --test test/mount.test.mjs test/render.test.mjs exits 0 with the existing tests still green.
    </acceptance_criteria>
    <done>makeMountCtx returns provided capability descriptors via ctx.get, and a subset-apply helper exists, enabling the reactive assertions without a live DSH boot.</done>
  </task>

  <task type="auto">
    <name>Task 2: reactive subset-mount + zero-loop test scenarios (DEGR-02/DEGR-04/D-06)</name>
    <files>test/mount.test.mjs</files>
    <read_first>test/mount.test.mjs, lib/_capabilities.js, lib/persona.js, lib/core-tools.js</read_first>
    <action>
      In test/mount.test.mjs, add a new top-level `describe("mount: reactive loop rendering (DEGR-02/DEGR-04)")` block. Within it define a helper `mountSubset(subs)` that builds `const fs = new FakeFs(); const ctx = makeMountCtx(fs); await applySubset(ctx, subs); return { fs, ctx };`. Use this for the following scenarios:
      1. Partial-loop (e.g. keep `state`,`core-tools`,`discuss`,`plan`; drop `execute`,`verify`,`ship`,`ui`,`quick`,`map-codebase`): assert the persona `gsd:persona` section body (invoked as `sections[0].text(ctx-free context object)`) does NOT contain "gsd_execute", "gsd_verify", "gsd_ship", "gsd_ui_phase", nor "gsd_quick"; DOES contain "gsd_discuss" and "gsd_plan" and an unconditional core word (e.g. "Discuss" and "You are a Git Ship Done"). Assert the runtime-context `contexts[0].text(...)` output does not reference an absent tool.
      2. Partial-loop gsd_status routing: initialise a project (call gsd_init via ctx.tools), then set the frontmatter next_action to `verify-phase` through the gsdState service (s.setActivePhase(cwd, 1, "verify") writes next_action "verify-phase"), then call the mounted `gsd_status.execute({}, exec)` (with exec.agent.session.header.cwd = CWD) and assert the output does NOT contain the verbatim `Next action: verify-phase`; it either shows a rewritten nearest available step or `no available loop step`; and it contains an `## Available steps` section listing only present loop steps.
      3. Zero-loop (keep only `state` + `core-tools`, so only gsdOrient/gsdJobs present): assert the persona body contains a no-loop-step notice and does not name any `gsd_discuss`/`gsd_plan`/etc.; the snapshot `contexts[0].text(...)` yields a no-available-step line; and `gsd_status.execute` returns `Next action: no available loop step` without throwing.
      4. Full-set regression: keep the existing assertions (persona contains Discuss/Ship; gsd_status prints `Next action:` normally) still green.
      Assert an output-level invariant across the scenarios: the persona body / snapshot / gsd_status text contains NO `gsd_` token whose capability is absent in that mount (reuse the approach: scan for /gsd_[a-z_]+/ tokens and check each maps to a provided capability).
      Keep all assertions offline (no git/gh/LLM); FakeFs is already available.
    </action>
    <verify>node --test test/mount.test.mjs test/render.test.mjs</verify>
    <acceptance_criteria>
      - grep test/mount.test.mjs for "reactive loop rendering" (describe block) and "no available loop step".
      - node --test test/mount.test.mjs test/render.test.mjs exits 0, including the new subset + zero-loop describe blocks.
    </acceptance_criteria>
    <done>The offline suite proves persona + snapshot omit absent steps/tools, gsd_status hides/replaces absent next_action and prints a correct Available-steps section, and zero-loop/partial-loop degrade gracefully without throwing.</done>
  </task>
</tasks>

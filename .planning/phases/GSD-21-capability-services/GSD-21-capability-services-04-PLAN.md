---
phase: 21-capability-services
plan: 04
type: execute
wave: 3
depends_on:
  - "GSD-21-capability-services-02"
  - "GSD-21-capability-services-03"
files_modified:
  - test/mount.test.mjs
autonomous: true
requirements: ["DEGR-01", "DEGR-03"]
user_setup: []
must_haves:
  truths:
    - The mount fake-ctx exposes ctx.inject (per-command sub-fiber support) that activates sub-fiber apply synchronously when all its inject keys resolve, and is a no-op when any is missing.
    - The mount test still asserts 14 tools / 12 commands / 1 section / 1 context when all capabilities are present (D-12), and additionally asserts all 10 capability services are provided with the documented descriptor shape (DEGR-01).
    - A mount variant that omits one capability proves its slash command is not registered while the other 11 are (DEGR-03 negative contract).
  artifacts:
    - path: "test/mount.test.mjs"
      provides: "Extends the fake-ctx (makeMountCtx) with ctx.inject (synchronous, presence-gated) and adds capability-service assertions plus a negative command test."
      min_lines: 40
      exports: []
  key_links:
    - from: "test/mount.test.mjs"
      to: "lib/_capabilities.js"
      via: "import { CAPABILITY_KEYS } and assert each is present in ctx.provided with the expected descriptor shape"
      pattern: "ctx\\.provided|CAPABILITY_KEYS"
    - from: "test/mount.test.mjs"
      to: "ctx.inject"
      via: "makeMountCtx defines ctx.inject so gsd-commands' per-command sub-fibers activate under the harness"
      pattern: "inject:"
---
<objective>
Extend the offline mount harness (test/mount.test.mjs) for the new wiring (D-12): make the fake-ctx support the per-command sub-fiber API ctx.inject (synchronous, presence-gated, matching the current fake ctx.effect behaviour), assert the 10 capability services are provided with the documented descriptor shape (DEGR-01), keep the 14-tools / 12-commands / 1-section / 1-context assertions, and add a negative test proving an absent capability leaves its slash command unregistered (DEGR-03). This is wave 3 because it depends on the publishes (Plan 02) and the commands refactor (Plan 03).
</objective>
<context>
- @test/mount.test.mjs -- the fake-ctx harness to extend (makeMountCtx at lines 58-97; applyAll at 99-111; assertions at 185-245, 314-325)
- @lib/_capabilities.js -- CAPABILITY_KEYS + buildCapability from Plan 01; the descriptor shape to assert
- @lib/commands.js -- refactored in Plan 03 to use ctx.inject; the fake ctx MUST provide it or gsd-commands registers zero commands
- @.planning/phases/GSD-21-capability-services/GSD-21-capability-services-CONTEXT.md -- D-12 (fake-ctx extended for sub-fibers, still asserts 12 commands / 14 tools), D-02 (camelCase keys)
- @.planning/phases/GSD-21-capability-services/GSD-21-capability-services-RESEARCH.md -- 1.6 (fake inject must activate synchronously), Q-3 (assert the 10 capability services), Q-4 (negative test)
</context>
<tasks>
  <task type="auto">
    <name>Task 1 (tracer): extend makeMountCtx with ctx.inject and add the capability-service assertion</name>
    <files>test/mount.test.mjs</files>
    <read_first>test/mount.test.mjs, lib/_capabilities.js</read_first>
    <action>
      In test/mount.test.mjs's makeMountCtx (lines 58-97), add a ctx.inject method mirroring the synchronous behaviour of ctx.effect (D-12, RESEARCH 1.6). ctx.inject(injectKeys, callback) must:
      - treat the key "commands" (the host service) as always satisfied (the fake ctx already provides ctx.commands); any key in injectKeys that is NOT "commands" is satisfied only if it exists in the provided Map.
      - if every non-"commands" key resolves, invoke callback(ctx) synchronously and return its disposer if a function, else ()=>{};
      - if any non-"commands" key is missing, return ()=>{} WITHOUT invoking callback (sub-fiber stays inactive -- command never registered).
      The commands sub-fibers pass [capKey, "commands"], so this resolves when the capability is in provided and "commands" is present.

      Then in the "applies all 12 plugins in patch order without throwing" test (line 192-200), after the existing 14-tools/12-commands/1-section/1-context assertions, add DEGR-01 assertions: assert ctx.provided.has(k) for each of the 10 capability keys (gsdOrient, gsdJobs, gsdDiscuss, gsdUi, gsdPlan, gsdExecute, gsdVerify, gsdShip, gsdQuick, gsdMapCodebase), building the list by importing CAPABILITY_KEYS from ../lib/_capabilities.js (add to the imports near line 15) or a static array -- prefer importing CAPABILITY_KEYS so test and source never drift. For each key, assert the provided descriptor is an object with the documented shape: key, step, role, tools (array), commands (array), order (number), per D-03.
    </action>
    <verify>node --test test/mount.test.mjs</verify>
    <acceptance_criteria>
      - grep-verifiable in test/mount.test.mjs: ctx.inject defined on the fake ctx object.
      - grep-verifiable: CAPABILITY_KEYS imported from ../lib/_capabilities.js.
      - node --test test/mount.test.mjs asserts 14 tools / 12 commands / 1 section / 1 context AND the 10 provided capabilities.
    </acceptance_criteria>
    <done>The fake-ctx supports ctx.inject synchronously and the mount test asserts all 10 capability services with the documented shape alongside the unchanged 14/12/1/1 counts.</done>
  </task>
  <task type="auto">
    <name>Task 2: add the negative test -- absent capability leaves its slash command unregistered</name>
    <files>test/mount.test.mjs</files>
    <read_first>test/mount.test.mjs</read_first>
    <action>
      Add a test that proves the DEGR-03 negative contract (RESEARCH Q-4). Because applyAll applies ALL plugins including the one that provides the capability, the reliable approach:
      - Build a fresh fake ctx (makeMountCtx(fs)).
      - Apply all PATCH_ROWS EXCEPT the gsd-commands row first (persona, state, core-tools, discuss, ui, plan, execute, verify, ship, quick, map-codebase) so every capability is provided.
      - Then DELETE one capability from the provided store: provided.delete("gsdQuick").
      - Then apply the gsd-commands module's apply(ctx2, {}) (import @dsh-gsd/bundle/commands).
      - Assert ctx2.commands.length === 11 and ctx2.commands has NO entry named "gsd-quick", while the other 11 command names are present.
      This is a pure "never registered" check: with gsdQuick absent, the fake ctx.inject returns an inert disposer without calling the sub-fiber callback, so gsd-quick is never pushed.
    </action>
    <verify>node --test test/mount.test.mjs
    
    </verify>
    <acceptance_criteria>
      - grep-verifiable: a test deletes one capability from provided before applying gsd-commands.
      - node --test test/mount.test.mjs green: the absent-capability variant registers 11 commands and not gsd-quick.
    </acceptance_criteria>
    <done>The negative mount test proves an absent step capability unregisters its slash command while the other 11 stay registered (DEGR-03).</done>
  </task>
  <task type="auto">
    <name>Task 3: run the full suite and fix any wiring regressions</name>
    <files>test/mount.test.mjs</files>
    <read_first>test/mount.test.mjs</read_first>
    <action>
      Run the complete test suite: npm test (node --test test/*.test.mjs). Fix any failures introduced by the commands.js refactor (Plan 03) or test changes. Specifically ensure:
      - The mount test's ctx.effect still runs synchronously (the existing fake effect at line 92-95 must remain; ctx.inject is ADDED, not replacing ctx.effect).
      - gsd-commands now calls ctx.inject, so the 12-command assertion depends on ctx.inject being present in the fake ctx.
      - The per-plugin smoke suites (test/tools.test.mjs, test/service-tools.test.mjs, test/_capabilities.test.mjs) stay green.
      Confirm the final counts are 14 tools / 12 commands / 1 section / 1 context / 10 capabilities (D-12, RESEARCH Q-2).
    </action>
    <verify>npm test
    
    </verify>
    <acceptance_criteria>
      - npm test exits 0 on a clean checkout.
      - grep-verifiable: the mount test asserts 10 capabilities provided.
      - All 12 commands and all 14 tools still registered when all capabilities are present.
    </acceptance_criteria>
    <done>The full suite is green with the capability-services wiring: 10 capabilities provided, 12 commands / 14 tools / 1 section / 1 context, and the negative command test passes.</done>
  </task>
</tasks>

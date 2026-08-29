---
phase: 23-removal-verification
plan: 01
type: execute
wave: 1
depends_on: []
files_modified: ["test/helpers/mount-harness.mjs", "test/mount.test.mjs"]
autonomous: true
requirements: ["DEGR-05"]
user_setup: []
must_haves:
  truths:
    - The shared fake-ctx mount harness lives in test/helpers/mount-harness.mjs and is imported by BOTH test/mount.test.mjs and the new test/removal.test.mjs, so the harness never drifts between the two suites (D-07).
    - makeMountCtx accepts an optional subagents service/factory (defaulting to the simple stub) so the removal test can inject a rich subagents stub that writes artefacts to the FakeFs (OQ-1).
  artifacts:
    - path: "test/helpers/mount-harness.mjs"
      provides: "shared fake-ctx mount harness (makeMountCtx, applySubset, mountSubset, personaBody, snapshot, initProject, presentTools, assertNoAbsentToolToken, PATCH_ROWS, makeSubagents, makeExec, CWD) extracted from test/mount.test.mjs"
      min_lines: 120
      exports: ["CWD", "PATCH_ROWS", "makeSubagents", "makeMountCtx", "applySubset", "mountSubset", "personaBody", "snapshot", "initProject", "presentTools", "assertNoAbsentToolToken", "makeExec"]
    - path: "test/mount.test.mjs"
      provides: "refactored mount suite importing the shared harness (keeps applyAll, readPatchRows, EXPECTED_* constants and all describe blocks)"
      min_lines: 300
      exports: []
  key_links:
    - from: "test/mount.test.mjs"
      to: "test/helpers/mount-harness.mjs"
      via: "imports the shared harness members, replacing the in-file definitions"
      pattern: "from \"\\./helpers/mount-harness\\.mjs\""
    - from: "test/helpers/mount-harness.mjs"
      to: "test/helpers/fake-fs.mjs"
      via: "mountSubset constructs a fresh FakeFs and makeMountCtx receives it"
      pattern: "FakeFs"
---
<objective>
Extract the shared fake-ctx mount harness from test/mount.test.mjs into test/helpers/mount-harness.mjs (D-07) so the existing mount suite and the new per-plugin removal suite (plan 02) share a single source of the fake-ctx machinery. This is a pure refactor: the exported helper signatures must be byte-identical to the current in-file definitions so the 373 passing tests keep passing unchanged. The only behavioural addition is that makeMountCtx/mountSubset accept an optional subagents service/factory (defaulting to the existing simple stub) so plan 02 can inject a rich subagents stub that writes artefacts to the FakeFs (OQ-1).
</objective>
<context>@.planning/phases/GSD-23-removal-verification/GSD-23-removal-verification-CONTEXT.md
@.planning/phases/GSD-23-removal-verification/GSD-23-removal-verification-RESEARCH.md
@test/mount.test.mjs
@test/helpers/fake-fs.mjs
@test/helpers/project.mjs</context>
<tasks>
  <task type="auto">
    <name>Task 1: create test/helpers/mount-harness.mjs with the shared fake-ctx mount harness (D-07)</name>
    <files>test/helpers/mount-harness.mjs</files>
    <read_first>test/mount.test.mjs, test/helpers/fake-fs.mjs</read_first>
    <action>
      Create test/helpers/mount-harness.mjs as a plain-ESM module. Import `FakeFs` from "./fake-fs.mjs". Move the following members VERBATIM from test/mount.test.mjs (byte-identical bodies and signatures) and export them:
      - `CWD` = "/project" (mount.test.mjs:19).
      - `PATCH_ROWS` = the 12-row array verbatim (mount.test.mjs:24-37).
      - `makeSubagents()` = the simple stub (mount.test.mjs:47-54) returning `{ getProvider: (n) => (n === "spawn" ? { spawn: true } : undefined), async start(_n, _req) { return { result: { output: [{ type: "text", text: "done" }], stopReason: "completed" }, dispose: () => {} }; } }`.
      - `makeExec(cwd = CWD)` = returns `{ agent: { session: { header: { cwd } } }, signal: { aborted: false, addEventListener() {}, removeEventListener() {} } }` (the exec object shape at mount.test.mjs:337-340 / 438-441).
      - `makeMountCtx(fs, { subagents } = {})` = the fake-ctx host (mount.test.mjs:59-120). Move the module-level `let gsdStateSvc;` handle into this module (it is internal to makeMountCtx). Keep `ctx.effect` invoking its callback synchronously (R-3) and `ctx.inject` returning a no-op disposer when any non-"commands" inject key is missing from the provided store (DEGR-03). CHANGE the `get` method so `ctx.get("subagents")` returns `typeof subagents === "function" ? subagents(fs) : (subagents || makeSubagents())` — i.e. accept an optional subagents service object OR a factory `(fs) => service` (OQ-1). Keep `ctx.get("gsdState")` returning the module-level gsdStateSvc and `ctx.get(n)` returning `provided.has(n) ? provided.get(n) : undefined` for all other keys.
      - `applySubset(ctx, subs, config = {})` = mount.test.mjs:140-153 (locates each row by sub, imports `@dsh-gsd/bundle/${sub}`, asserts apply() exists, calls it with config, wraps errors with the row id).
      - `mountSubset(subs, { subagents } = {})` = `const fs = new FakeFs(); const ctx = makeMountCtx(fs, { subagents }); await applySubset(ctx, subs); return { fs, ctx };` (mount.test.mjs:444-449, extended with the subagents option).
      - `personaBody(ctx, cwd = CWD)` = mount.test.mjs:452-456 (finds the gsd:persona section and invokes `section.text({ agent: { session: { header: { cwd } } } })`).
      - `snapshot(ctx, cwd = CWD)` = mount.test.mjs:458-462 (finds the gsd:state context and invokes `context.text({ agent: { session: { header: { cwd } } } })`).
      - `initProject(ctx, exec = makeExec())` = mount.test.mjs:466-475 (finds the gsd_init tool and executes it with the demo project args, using the provided exec).
      - `presentTools(ctx)` = mount.test.mjs:478-483 (the Set of tool names owned by provided capabilities).
      - `assertNoAbsentToolToken(ctx, text, label)` = mount.test.mjs:487-496 (the D-02 token invariant).
      Do NOT move applyAll, readPatchRows, EXPECTED_INSERT_ROWS, EXPECTED_TOOL_NAMES, or EXPECTED_COMMAND_NAMES — those stay in test/mount.test.mjs.
    </verify>node --check test/helpers/mount-harness.mjs</verify>
    <acceptance_criteria>
      - grep test/helpers/mount-harness.mjs for "export function makeMountCtx" and "export function mountSubset" and "export function assertNoAbsentToolToken".
      - grep test/helpers/mount-harness.mjs for "typeof subagents === \"function\"" (the factory branch in makeMountCtx.get).
      - grep test/helpers/mount-harness.mjs for "from \"./fake-fs.mjs\"" (FakeFs import).
      - node --check test/helpers/mount-harness.mjs exits 0.
    </acceptance_criteria>
    <done>test/helpers/mount-harness.mjs exists and exports all 12 members with byte-identical signatures, including the optional subagents factory in makeMountCtx/mountSubset.</done>
  </task>

  <task type="auto">
    <name>Task 2: refactor test/mount.test.mjs to import the shared harness and confirm the full suite still passes (D-07)</name>
    <files>test/mount.test.mjs</files>
    <read_first>test/mount.test.mjs, test/helpers/mount-harness.mjs</read_first>
    <action>
      Refactor test/mount.test.mjs to consume the extracted harness instead of defining it inline. Specifically:
      - Add an import block: `import { CWD, PATCH_ROWS, makeMountCtx, applySubset, mountSubset, personaBody, snapshot, initProject, presentTools, assertNoAbsentToolToken, makeExec } from "./helpers/mount-harness.mjs";`.
      - DELETE the in-file definitions of: `CWD` (line 19), `PATCH_ROWS` (24-37), the module-level `let gsdStateSvc;` (42), `makeSubagents` (47-54), `makeMountCtx` (59-120), `applySubset` (140-153), and inside the reactive describe block: `mountSubset` (444-449), `personaBody` (452-456), `snapshot` (458-462), `initProject` (466-475), `presentTools` (478-483), `assertNoAbsentToolToken` (487-496).
      - KEEP `applyAll` (123-134), `readPatchRows` (159-202), `EXPECTED_INSERT_ROWS` (207-210), `EXPECTED_TOOL_NAMES` (213-218), `EXPECTED_COMMAND_NAMES` (221-225), and all describe/test blocks unchanged.
      - Replace the two `const exec = { agent: { session: { header: { cwd: CWD } } }, signal: { aborted: false, addEventListener() {}, removeEventListener() {} } };` definitions (lines 337-340 and 438-441) with `const exec = makeExec();`.
      - Ensure every remaining reference to the deleted identifiers resolves to the imported harness members (e.g. `applyAll` still uses the imported `PATCH_ROWS`; `initProject(ctx)` calls still work because initProject defaults exec to makeExec()).
      Run the full suite and confirm the baseline is preserved.
    </verify>npm test</verify>
    <acceptance_criteria>
      - grep test/mount.test.mjs for "from \"./helpers/mount-harness.mjs\"" (import present).
      - grep test/mount.test.mjs for "function makeMountCtx" returns nothing (in-file definition removed).
      - grep test/mount.test.mjs for "makeExec()" (exec now built from the harness).
      - npm test exits 0 with 373 pass / 0 fail (baseline preserved).
    </acceptance_criteria>
    <done>test/mount.test.mjs imports the shared harness, keeps all its describe blocks, and the full suite still passes 373/0.</done>
  </task>
</tasks>

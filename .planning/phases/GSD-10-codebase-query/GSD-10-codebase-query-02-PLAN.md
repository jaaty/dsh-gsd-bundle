---
phase: 10-codebase-query
plan: 02
type: execute
wave: 2
depends_on: ["GSD-10-codebase-query-01"]
files_modified: ["test/tools.test.mjs", "lib/commands.js", ".planning/phases/GSD-10-codebase-query/VALIDATION.md"]
autonomous: true
requirements: ["CBQ-01", "CBQ-02"]
gap_closure: false
user_setup: []
must_haves:
  truths:
    - "The deterministic test suite covers query mode: happy path with an existing map returns the subagent's answer with a Sources section; no map returns a notice; subagent failure/empty returns a failure message; fast/focus/paths/force are ignored; empty/whitespace query falls through to full mapping; the query arg is in the compiled schema; CODEBASE_QUERY_PROMPT carries the FORBIDDEN FILES rule."
    - "The /gsd-map-codebase slash command accepts a --query flag and builds a tool call that includes the query string."
    - "VALIDATION.md maps every locked D-01..D-05 decision to its named automated test, with a 'Nyquist Coverage' heading and a no-3-consecutive-task-window statement."
  artifacts:
    - path: "lib/commands.js"
      provides: "--query surfacing for /gsd-map-codebase so the CLI path reaches the new query mode."
      min_lines: 0
      exports: []
    - path: ".planning/phases/GSD-10-codebase-query/VALIDATION.md"
      provides: "The Nyquist coverage artefact mapping D-01..D-05 to their named tests in test/tools.test.mjs, with a 'Nyquist Coverage' heading and a task-coverage record."
      min_lines: 30
      exports: []
  key_links:
    - from: "test/tools.test.mjs"
      to: "lib/map-codebase.js"
      via: "registerTool(\"map-codebase\", \"gsd_map_codebase\") then t.execute({ query: \"...\" }, exec) asserting the answer, Sources, and no map-doc writes"
      pattern: "codebase-query"
    - from: "lib/commands.js"
      to: "lib/map-codebase.js"
      via: "the gsd-map-codebase build() parsing --query and emitting a tool-call text that includes the query string"
      pattern: "--query"
---
<objective>Add the deterministic test coverage for query mode (fake `codebase-query` subagent branch plus tests for every D-04/D-05/CBQ behaviour), surface the `--query` flag on the /gsd-map-codebase slash command, and write the VALIDATION.md Nyquist artefact. Delivers the verification that CBQ-01 and CBQ-02 hold, the CLI surfacing of the new mode, and the phase's Nyquist gate artefact.</objective>
<context>
@test/tools.test.mjs — the fake subagents service branches on label at lines 100-151; the `map-codebase` branch is at 130-147. The gsd_map_codebase describe block is at line 626. registerTool helper at line 165. exec and CWD are module-scoped fixtures. The fake `map-codebase` branch returns `## Mapping Complete` (line 147); the real tool wraps mapper output and returns "Codebase mapping complete." (lib/map-codebase.js:187).
@lib/commands.js — the gsd-map-codebase slash command build() is at lines 149-158; it currently parses --fast/--focus/--paths. apply() (line 174) registers each command via ctx.commands.register({ name, description, input, handler }); the handler calls c.build(invocation.rawInput) and sends built.text to the agent via agent.followup (send at line 24). build is NOT exposed on the registered command — the test must go through handler + agent.followup capture.
@test/mount.test.mjs — the command-capture pattern to reuse: a fake ctx whose commands.register pushes into an array (lines 64-65), apply(c, {}) invoked against it (line 105), then the registered command found by name.
@lib/_agents.js — CODEBASE_QUERY_PROMPT (added in plan 01) must carry the FORBIDDEN FILES rule; the test greps it.
</context>
<tasks>
  <task type="auto">
    <name>Task 1: Add the codebase-query fake branch and the happy-path test (tracer)</name>
    <files>test/tools.test.mjs</files>
    <read_first>test/tools.test.mjs</read_first>
    <action>
      In makeSubagents() (test/tools.test.mjs), add a new branch in the label dispatch, after the `map-codebase` branch (line 147) and before the final `return { result: ... }` (line 149): `else if (label.startsWith("codebase-query")) { text = "The auth flow uses JWT via lib/auth.js.\\n\\nSources:\\n- ARCHITECTURE.md (map)\\n- lib/auth.js (codebase)"; }`. This returns a canned answer with a Sources section so the happy-path test can assert it.

      In the gsd_map_codebase describe block (line 626), add a test "query mode with an existing map returns the subagent's answer with a Sources section":
      - Seed a map doc: `await fs.writeText({ targetKey: \`${CWD}/.planning/codebase/ARCHITECTURE.md\` }, "# Architecture\\n\\n**Analysis Date:** 2026-08-22\\n");`.
      - `const { t } = await registerTool("map-codebase", "gsd_map_codebase");`.
      - `const res = await t.execute({ query: "How is auth handled?" }, exec);`.
      - Assert `assert.match(res, /JWT/)`, `assert.match(res, /Sources/)`, and `assert.match(res, /ARCHITECTURE\.md/)`.
      - Assert no new map docs were written beyond the seeded one: `assert.equal([...fs.files].filter((k) => k.startsWith(\`${CWD}/.planning/codebase/\`)).length, 1)`.
    </action>
    <verify>node --test test/tools.test.mjs</verify>
    <acceptance_criteria>
      - `grep -n "codebase-query" test/tools.test.mjs` matches the fake branch and the new test.
      - `node --test test/tools.test.mjs` passes (the new happy-path test is green).
    </acceptance_criteria>
    <done>The fake subagents service answers `codebase-query` labels with a canned sourced answer, and the happy-path query test passes.</done>
  </task>
  <task type="auto">
    <name>Task 2: Add the remaining query-mode tests</name>
    <files>test/tools.test.mjs</files>
    <read_first>test/tools.test.mjs</read_first>
    <action>
      In the gsd_map_codebase describe block, add these tests (all deterministic, no LLM):
      - "query mode with no map returns a notice and never throws": no seeded docs; `const res = await t.execute({ query: "q" }, exec);` assert `assert.match(res, /No .planning\/codebase\/ map exists yet/)` and `assert.doesNotReject(() => t.execute({ query: "q" }, exec))`.
      - "query subagent failure returns a clear failure message and never throws": make the fake `codebase-query` branch return empty output for this test. Add a module-scoped flag (e.g. `let QUERY_FAIL_MODE = false;`) that the fake branch checks: when true, set `text = ""` and `stopReason = "failed"`. In the test set `QUERY_FAIL_MODE = true`, call `t.execute({ query: "q" }, exec)`, assert `assert.match(res, /query failed/)` and `assert.doesNotReject(...)`, then reset `QUERY_FAIL_MODE = false`.
      - "query mode ignores fast/focus/paths/force and writes no map docs": seed one map doc; `const res = await t.execute({ query: "q", fast: true, focus: "arch", paths: ["lib/"], force: true }, exec);` assert `assert.match(res, /JWT/)` (the answer, not a mapping summary) and that no additional codebase docs were written.
      - "empty or whitespace query falls through to full mapping": seed NO map docs. `const res = await t.execute({ query: "   " }, exec);` assert it does NOT match the canned answer (`assert.doesNotMatch(res, /JWT/)`) and does NOT match /No .planning\/codebase\/ map exists yet/. Because no map is seeded, `existing.length === 0` so the existing-check at lib/map-codebase.js:118 does NOT trigger; the tool spawns the 4 mappers and returns the full-mapping fall-through. Assert `assert.match(res, /Codebase mapping complete/)` (the real tool's final return at lib/map-codebase.js:187).
      - "query arg is present in the compiled schema": `const { t } = await registerTool("map-codebase", "gsd_map_codebase"); assert.equal(t.parameters.query.type, "string");`.
      - "CODEBASE_QUERY_PROMPT carries the FORBIDDEN FILES rule": `import { CODEBASE_QUERY_PROMPT } from "../lib/_agents.js";` (add to the existing imports at the top of the file) and `assert.match(CODEBASE_QUERY_PROMPT, /FORBIDDEN FILES/)`.
    </action>
    <verify>node --test test/tools.test.mjs</verify>
    <acceptance_criteria>
      - `node --test test/tools.test.mjs` passes with the new tests green.
      - `grep -n "FORBIDDEN FILES" test/tools.test.mjs` matches the prompt assertion.
      - `grep -n "query failed" test/tools.test.mjs` matches the failure test.
      - `grep -n "Codebase mapping complete" test/tools.test.mjs` matches the empty-query fall-through assertion.
    </acceptance_criteria>
    <done>All query-mode behaviours (no map, failure, ignores flags, empty query, schema arg, FORBIDDEN FILES) are covered by passing deterministic tests.</done>
  </task>
  <task type="auto">
    <name>Task 3: Surface --query on the /gsd-map-codebase slash command</name>
    <files>lib/commands.js, test/tools.test.mjs</files>
    <read_first>lib/commands.js, test/mount.test.mjs</read_first>
    <action>
      In lib/commands.js, the gsd-map-codebase build() (lines 149-158): parse a `--query` flag. The query is the remainder of the raw input after `--query` (it may contain spaces), e.g. `const qm = raw.match(/--query\s+([\s\S]+)$/); const query = qm ? qm[1].trim() : "";`. When query is present, build a tool-call text that includes the query string, e.g. `Run the gsd_map_codebase tool to answer this question against the existing codebase map: ${query}` and ack `Querying codebase → gsd_map_codebase.`. When query is absent, keep the existing mapping text. Update the `hint` string to include `[--query <question>]`.

      In test/tools.test.mjs, add a test "slash command --query builds a tool call with the query string" using the mount.test.mjs command-capture pattern (there are NO existing slash-command build() tests in tools.test.mjs to copy):
      - Import the commands module: `import { apply as applyCommands } from "../lib/commands.js";` (add to the top-of-file imports).
      - Build a fake ctx that captures registrations: `const registered = []; const ctx = { effect: (fn) => fn(), commands: { register: (c) => { registered.push(c); return () => {}; } } };`.
      - `applyCommands(ctx, {});` then `const cmd = registered.find((c) => c.name === "gsd-map-codebase"); assert.ok(cmd);`.
      - Capture what the handler sends to the agent: `let sentText = ""; const agent = { followup: (msg) => { sentText = msg.content[0].text; } };`.
      - Invoke the handler: `const res = cmd.handler({ rawInput: "--query how is auth handled", agent });`.
      - Assert `assert.match(sentText, /how is auth handled/)` and `assert.match(sentText, /gsd_map_codebase/)` and `assert.equal(res.kind, "success")`. (build is not exposed on the registered command, so assert on the text the handler routes to the agent via followup.)
    </action>
    <verify>node --check lib/commands.js && node --test test/tools.test.mjs</verify>
    <acceptance_criteria>
      - `grep -n -- "--query" lib/commands.js` matches the parse and the hint.
      - `node --check lib/commands.js` exits 0.
      - `node --test test/tools.test.mjs` passes including the new slash-command test.
      - `grep -n "applyCommands" test/tools.test.mjs` matches the import and its use.
    </acceptance_criteria>
    <done>The /gsd-map-codebase slash command accepts --query and builds a tool call carrying the query string, verified by a passing test using the mount.test.mjs command-capture pattern.</done>
  </task>
  <task type="auto">
    <name>Task 4: Write the VALIDATION.md Nyquist artefact</name>
    <files>.planning/phases/GSD-10-codebase-query/VALIDATION.md</files>
    <read_first>.planning/phases/GSD-10-codebase-query/GSD-10-codebase-query-CONTEXT.md, .planning/phases/GSD-07-uat-conversation/VALIDATION.md</read_first>
    <action>
      Create `.planning/phases/GSD-10-codebase-query/VALIDATION.md` following the established project convention (GSD-07 produced `.planning/phases/GSD-07-uat-conversation/VALIDATION.md`). The file must:
      - Map every locked decision D-01..D-05 (from GSD-10-codebase-query-CONTEXT.md) to its named automated test in test/tools.test.mjs:
        - D-01 (fresh-context query subagent reads the map) → "query mode with an existing map returns the subagent's answer with a Sources section".
        - D-02 (map-first, targeted exploration, not a full re-scan) → the CODEBASE_QUERY_PROMPT contract + "query mode with an existing map returns the subagent's answer with a Sources section" (Sources cites map doc + codebase file).
        - D-03 (single query arg; query mode ignores fast/focus/paths/force; empty query falls through) → "query arg is present in the compiled schema", "query mode ignores fast/focus/paths/force and writes no map docs", "empty or whitespace query falls through to full mapping".
        - D-04 (no-map notice; subagent-failure message; never throw) → "query mode with no map returns a notice and never throws", "query subagent failure returns a clear failure message and never throws".
        - D-05 (plain-text answer with a Sources section) → "query mode with an existing map returns the subagent's answer with a Sources section" (asserts /Sources/ and /ARCHITECTURE\.md/).
      - Include a "Nyquist Coverage" heading and a statement that no three consecutive tasks in the phase lack automated test coverage (plan 01 tasks 1-2 and plan 02 tasks 1-4 each carry a runnable verify/acceptance check).
      - Record the task-coverage mapping: plan 01 Task 1 (prompt + query branch) → happy-path + schema-arg tests; plan 01 Task 2 (error handling + fall-through) → no-map + failure + empty-query tests; plan 02 Task 1 (fake branch + happy path) → happy-path test; plan 02 Task 2 (remaining tests) → no-map/failure/ignores-flags/empty-query/schema/FORBIDDEN-FILES tests; plan 02 Task 3 (--query surfacing) → slash-command test.
    </action>
    <verify>test -s .planning/phases/GSD-10-codebase-query/VALIDATION.md && grep -n "Nyquist Coverage" .planning/phases/GSD-10-codebase-query/VALIDATION.md && grep -n "D-01" .planning/phases/GSD-10-codebase-query/VALIDATION.md && grep -n "D-05" .planning/phases/GSD-10-codebase-query/VALIDATION.md</verify>
    <acceptance_criteria>
      - `grep -n "Nyquist Coverage" .planning/phases/GSD-10-codebase-query/VALIDATION.md` matches.
      - `grep -n "D-01" .planning/phases/GSD-10-codebase-query/VALIDATION.md` and `grep -n "D-05" .planning/phases/GSD-10-codebase-query/VALIDATION.md` both match.
      - The file is non-empty (`test -s` exits 0).
    </acceptance_criteria>
    <done>VALIDATION.md maps D-01..D-05 to their named tests, carries the "Nyquist Coverage" heading and the no-3-consecutive-task-window statement, and records the task-coverage mapping.</done>
  </task>
</tasks>

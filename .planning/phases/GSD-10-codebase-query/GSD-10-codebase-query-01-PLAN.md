---
phase: 10-codebase-query
plan: 01
type: execute
wave: 1
depends_on: []
files_modified: ["lib/_agents.js", "lib/map-codebase.js"]
autonomous: true
requirements: ["CBQ-01", "CBQ-02"]
gap_closure: false
user_setup: []
must_haves:
  truths:
    - "gsd_map_codebase called with a non-empty trimmed query string returns a targeted plain-text answer that includes a Sources section, and writes no .planning/codebase/ documents."
    - "gsd_map_codebase with a query and no existing .planning/codebase/ map returns a clear notice telling the user to run gsd_map_codebase first (or pass force to map), and never throws."
    - "gsd_map_codebase with a query whose subagent fails or returns empty output returns a clear failure message, and never throws."
    - "gsd_map_codebase with a query ignores fast/focus/paths/force and does not spawn any codebase mapper subagent."
    - "gsd_map_codebase with an empty or whitespace-only query falls through to normal mapping behaviour (does not enter query mode)."
  artifacts:
    - path: "lib/_agents.js"
      provides: "CODEBASE_QUERY_PROMPT — the fresh-context query subagent role prompt requiring map-first reading, targeted-only exploration, a Sources section, and the FORBIDDEN FILES rule."
      min_lines: 40
      exports: ["CODEBASE_QUERY_PROMPT"]
  key_links:
    - from: "lib/map-codebase.js"
      to: "lib/_agents.js"
      via: "import { CODEBASE_QUERY_PROMPT } from \"./_agents.js\" and interpolating it into the query subagent prompt"
      pattern: "CODEBASE_QUERY_PROMPT"
    - from: "lib/map-codebase.js"
      to: "lib/state.js"
      via: "s.listCodebaseDocs(cwd) and s.readCodebaseDoc(cwd, name) to read the existing map"
      pattern: "listCodebaseDocs"
    - from: "lib/map-codebase.js"
      to: "lib/_runner.js"
      via: "planningContext(entries) to pass map docs and spawnSubagent(ctx, exec, { label: \"codebase-query\", ... }) to answer"
      pattern: "codebase-query"
---
<objective>Implement the core query/intel mode for gsd_map_codebase: a `query` string argument that switches the tool into query mode, where a fresh-context `codebase-query` subagent reads the existing .planning/codebase/ map (passed via planningContext), does targeted codebase exploration only where the map is silent, and returns a targeted plain-text answer with a Sources section. Delivers the CBQ-01 and CBQ-02 happy path plus the D-04 never-throw error handling.</objective>
<context>
@lib/map-codebase.js — the existing gsd_map_codebase tool; the query branch goes inside execute() right after the subagents service check (line 88), before the focus/paths handling. The deliberate --query omission comment is at lines 20-23.
@lib/_agents.js — CODEBASE_MAPPER_PROMPT at line 249; the new CODEBASE_QUERY_PROMPT export goes after it (before the file's closing template literal at line 301). The FORBIDDEN FILES rule to replicate is at lines 282-283.
@lib/_runner.js — planningContext(entries, maxPerFile=60000) at line 36 and spawnSubagent(ctx, exec, { label, promptText, outputSchema }) at line 8.
@lib/state.js — codebaseDir (53), listCodebaseDocs (57), readCodebaseDoc (68).
</context>
<tasks>
  <task type="auto">
    <name>Task 1: Add CODEBASE_QUERY_PROMPT and wire the query branch (tracer)</name>
    <files>lib/_agents.js, lib/map-codebase.js</files>
    <read_first>lib/_agents.js, lib/map-codebase.js, lib/_runner.js</read_first>
    <action>
      In lib/_agents.js, after the CODEBASE_MAPPER_PROMPT export (line 249, before the file's final closing backtick at line 301), add a new exported template-literal constant `export const CODEBASE_QUERY_PROMPT = \`...\`;`. The prompt must:
      - Identify the role as "gsd-codebase-query" and state it answers ONE question against the existing codebase map plus targeted codebase exploration.
      - Instruct: read the <planning_context> map documents first (they are the primary source); then, only where the map is silent on the question, do targeted Glob/Grep/read exploration for the specific symbols/files the question needs — explicitly "do NOT re-scan the whole repo".
      - Require the answer to end with a short "Sources" section citing which map document(s) and/or codebase file(s) (in backticks) informed the answer.
      - Carry the exact FORBIDDEN FILES rule verbatim from CODEBASE_MAPPER_PROMPT lines 282-283 (the ".env, .env.*, credentials.*, ... leaked secrets = security incident." block) so the query subagent never quotes secrets.
      - Instruct: return ONLY the targeted plain-text answer (no document writing, no commit).

      In lib/map-codebase.js:
      - Add `import { CODEBASE_QUERY_PROMPT } from "./_agents.js";` to the existing import from _agents.js (line 29).
      - Add `import { spawnSubagent, cwdOf, planningContext } from "./_runner.js";` (extend the existing line 28 import).
      - Add a `query` parameter to the defineTool parameters object (after `force`, line 79): `query: { type: "string", description: "Answer a question against the existing .planning/codebase/ map plus targeted codebase exploration, without a full re-scan. When present, runs query mode instead of mapping; fast/focus/paths/force are ignored." }`.
      - In execute(), immediately after the `subagents` service check (line 88) and before the focus-set block (line 90), insert a query-mode branch: `const q = typeof args.query === "string" ? args.query.trim() : "";` then `if (q) { ... }`. Inside the branch:
        - Read the map: `const docs = await s.listCodebaseDocs(cwd);` then build `const entries = [];` and for each doc name call `const txt = await s.readCodebaseDoc(cwd, name);` and if txt is non-empty push `{ label: name.replace(/\.md$/i, ""), content: txt }`.
        - Build the prompt: `const prompt = ["Question: " + q, planningContext(entries), CODEBASE_QUERY_PROMPT].join("\n\n");`.
        - Spawn: `const r = await spawnSubagent(ctx, exec, { label: "codebase-query", promptText: prompt });`.
        - Return the answer: `return r.output;` (the subagent's plain-text answer already includes the Sources section per the prompt contract).
      - The branch must return before any mapping logic runs, so fast/focus/paths/force are ignored in query mode (per D-03).
    </action>
    <verify>node --check lib/map-codebase.js && node --check lib/_agents.js; grep -n "CODEBASE_QUERY_PROMPT" lib/_agents.js lib/map-codebase.js; grep -n "query:" lib/map-codebase.js; grep -n "codebase-query" lib/map-codebase.js</verify>
    <acceptance_criteria>
      - `grep -c "CODEBASE_QUERY_PROMPT" lib/_agents.js` returns 1 (the export) and lib/map-codebase.js imports it.
      - `grep -n "query:" lib/map-codebase.js` shows the new string parameter in the defineTool parameters.
      - `grep -n "codebase-query" lib/map-codebase.js` shows the spawnSubagent label.
      - `grep -n "planningContext" lib/map-codebase.js` shows the import and its use.
      - `node --check` on both files exits 0.
    </acceptance_criteria>
    <done>CODEBASE_QUERY_PROMPT exists and is imported; the query branch reads the map, passes it via planningContext, spawns a `codebase-query` subagent, and returns its output before any mapping logic.</done>
  </task>
  <task type="auto">
    <name>Task 2: Error handling (no map, subagent failure) and empty-query fall-through</name>
    <files>lib/map-codebase.js</files>
    <read_first>lib/map-codebase.js</read_first>
    <action>
      Inside the query-mode branch added in Task 1, add the D-04 never-throw handling:
      - No map: after `const docs = await s.listCodebaseDocs(cwd);`, if `docs.length === 0`, `return` a clear notice string: "No .planning/codebase/ map exists yet. Run gsd_map_codebase first to map the codebase (or pass force=true to map), then re-run this query." — do not spawn a subagent, do not throw.
      - Subagent failure / empty output: after `const r = await spawnSubagent(...)`, if `!r.output || !String(r.output).trim()`, `return` a clear failure message string that includes the stopReason and diagnostic, e.g. "gsd_map_codebase query failed: the query subagent returned no answer (stopReason=...)." — never throw.
      - Empty/whitespace query fall-through: the `const q = ...trim()` guard from Task 1 already means an empty/whitespace `query` skips the branch entirely and falls through to the existing mapping logic (per OQ-2 / D-03). Verify the branch is guarded by `if (q)` and that no query-mode code runs when q is empty.
    </action>
    <verify>grep -n "No .planning/codebase/ map exists yet" lib/map-codebase.js; grep -n "query failed" lib/map-codebase.js; grep -n "if (q)" lib/map-codebase.js; node --check lib/map-codebase.js</verify>
    <acceptance_criteria>
      - `grep -n "No .planning/codebase/ map exists yet" lib/map-codebase.js` matches (the no-map notice).
      - `grep -n "query failed" lib/map-codebase.js` matches (the subagent-failure message).
      - `grep -n "if (q)" lib/map-codebase.js` matches (empty-query guard).
      - `node --check lib/map-codebase.js` exits 0.
    </acceptance_criteria>
    <done>Query mode returns clear notices (never throws) for a missing map and for a failed/empty subagent, and an empty/whitespace query falls through to normal mapping.</done>
  </task>
</tasks>

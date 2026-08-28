---
phase: 19-codebase-intel-extensions
plan: 03
type: execute
wave: 3
depends_on: ["GSD-19-codebase-intel-extensions-02"]
files_modified: ["lib/map-codebase.js", "lib/_agents.js", "test/tools.test.mjs"]
autonomous: true
requirements: ["CBQX-03", "CBQX-04"]
user_setup: []
must_haves:
  truths:
    - "gsd_map_codebase returns a structured object (not plain text) on every path, with kind ∈ {mapping, notice, answer, error}, and a human-readable text render."
    - "Query mode returns an object with exactly {answer, sources, confidence}, where every sources entry has kind ∈ {map, codebase}."
    - "When the query subagent returns no structured output, the tool still returns a valid {answer, sources: [], confidence: 0} object rather than throwing or producing NaN."
    - "Query mode with queryScope=[...] restricts only the query subagent's targeted exploration to the given repo-relative prefixes; the map docs are still loaded fully."
  artifacts:
    - path: "lib/map-codebase.js"
      provides: "object output.schema + render, structured query-answer assembly, queryScope argument"
      min_lines: 0
      exports: ["apply"]
    - path: "lib/_agents.js"
      provides: "CODEBASE_QUERY_PROMPT updated to return a structured JSON answer object"
      min_lines: 0
      exports: ["CODEBASE_QUERY_PROMPT"]
  key_links:
    - from: "lib/map-codebase.js"
      to: "lib/_runner.js"
      via: "the query branch passes outputSchema: QUERY_ANSWER_SCHEMA to spawnSubagent and reads r.structured to build {answer, sources, confidence}"
      pattern: "outputSchema"
    - from: "lib/map-codebase.js"
      to: "lib/_intel.js"
      via: "clampConfidence(r.structured.confidence) normalizes the subagent's 0-1 confidence into [0,1]"
      pattern: "clampConfidence"
---

<objective>Convert gsd_map_codebase output to a structured object schema (OQ-1 resolution of D-06) and rework query mode to return a structured answer object {answer, sources, confidence} (CBQX-03; D-06, D-07) plus a queryScope argument that scopes only the query subagent's targeted exploration to a subtree (CBQX-04; D-08). Includes the R-1 migration of every existing gsd_map_codebase string assertion to assert on the object's rendered text.</objective>

<context>@lib/map-codebase.js (output.schema + render at line 82, query branch at 96-119, existing-check at 150-157, mapping summary at 218-233, validatePaths at 46-55)
@lib/_agents.js (CODEBASE_QUERY_PROMPT at 311-328)
@lib/_runner.js (spawnSubagent with outputSchema → result.structured, lines 8-32)
@lib/_intel.js (clampConfidence)
@test/tools.test.mjs (gsd_map_codebase describe assertions 814-951, makeSubagents codebase-query fake at 157-165, executeCaptured capture pattern at 24-25)</context>

<tasks>
  <task type="auto">
    <name>Task 1: object output schema + render, return an object on every path, migrate all existing assertions (tracer, R-1)</name>
    <files>lib/map-codebase.js, test/tools.test.mjs</files>
    <read_first>lib/map-codebase.js</read_first>
    <action>In lib/map-codebase.js, replace the output block at line 82 with an object schema: schema { type: "object", properties: { kind: { type: "string" }, text: { type: "string" }, answer: { type: "string" }, sources: { type: "array", items: { type: "object", properties: { kind: { type: "string" }, path: { type: "string" } }, required: ["kind","path"] } }, confidence: { type: "number" }, drift: { type: "object" }, docs: { type: "array", items: { type: "string" } } }, required: ["kind"], additionalProperties: false }, and render: (_a, v) => [{ type: "text", text: (v && typeof v === "object" && typeof v.text === "string") ? v.text : JSON.stringify(v) }]. Change execute to return an object on EVERY current path: query no-map → { kind: "error", text: "<existing notice text>" }; query subagent failure → { kind: "error", text: "<existing failure message>" }; existing-check → { kind: "notice", text: "<existing notice string>" }; mapping → { kind: "mapping", text: "<existing summary string>" }. Keep the inner strings byte-identical so behaviour text is preserved. In test/tools.test.mjs, migrate the gsd_map_codebase describe block: add a local helper `const renderResult = (res) => (res && typeof res === "object" && typeof res.text === "string") ? res.text : String(res);` and change every assert.match(res, /.../) in this describe block (lines ~826, 835, 851-854, 861, 869, 875, 884-886, 893, 903, 914, 921-923) to assert.match(renderResult(res), /.../). Run the full suite to confirm nothing else regressed.</action>
    <verify>node --test test/tools.test.mjs && node --test test/service-tools.test.mjs && node --test test/mount.test.mjs</verify>
    <acceptance_criteria>
      - node --test test/tools.test.mjs exits 0
      - grep -n "additionalProperties: false" lib/map-codebase.js matches inside the output schema
      - grep -c "kind: \"mapping\"\|kind: \"notice\"\|kind: \"error\"" lib/map-codebase.js returns 3
      - every existing gsd_map_codebase describe assertion now uses renderResult(res)
    </acceptance_criteria>
    <done>The tool returns a structured object on every path, the render produces readable text, and the full gsd_map_codebase describe block passes after migration.</done>
  </task>

  <task type="auto">
    <name>Task 2: structured answer object in query mode (D-06, D-07)</name>
    <files>lib/map-codebase.js, lib/_agents.js, test/tools.test.mjs</files>
    <read_first>lib/map-codebase.js, lib/_agents.js, lib/_runner.js</read_first>
    <action>In lib/map-codebase.js, add a module-level constant `const QUERY_ANSWER_SCHEMA = { type: "object", properties: { answer: { type: "string" }, sources: { type: "array", items: { type: "object", properties: { kind: { type: "string", enum: ["map","codebase"] }, path: { type: "string" } }, required: ["kind","path"], additionalProperties: false } }, confidence: { type: "number" } }, required: ["answer","sources","confidence"], additionalProperties: false };`. Import clampConfidence from "./_intel.js". In the query branch, pass `outputSchema: QUERY_ANSWER_SCHEMA` to the spawnSubagent call (line 112). After the subagent returns: when r.structured is a truthy object with a string `answer`, build `const answer = String(r.structured.answer);` `const sources = Array.isArray(r.structured.sources) ? r.structured.sources.filter((s) => s && typeof s.path === "string" && (s.kind === "map" || s.kind === "codebase")).map((s) => ({ kind: s.kind, path: String(s.path) })) : [];` `const confidence = clampConfidence(r.structured.confidence);`. Keep the existing empty-output failure guard (line 113-115: `if (!r.output || !String(r.output).trim()) return { kind: "error", text: "<existing failure message>" };`) FIRST, before the structured-building logic, so an empty/failed subagent output still yields kind:"error". Otherwise (structured missing but output non-empty, R-4) fall back to `const answer = r.output; const sources = []; const confidence = 0;`. Build `const text = [answer, "", "Sources:", ...sources.map((s) => `- ${s.kind}: \`${s.path}\``)].join("\n")` plus the existing truncation note when pc.truncated.length > 0. Return { kind: "answer", text, answer, sources, confidence }. In lib/_agents.js, update CODEBASE_QUERY_PROMPT's step 3 to instruct returning a SINGLE JSON object of the shape {answer, sources:[{kind:"map"|"codebase", path}], confidence} with no trailing prose, replacing the plain-text + Sources-section instruction (keep FORBIDDEN FILES). In test/tools.test.mjs, extend the fake codebase-query branch (line 157-164) to return `structured = { answer: "The auth flow uses JWT via lib/auth.js.", sources: [{kind:"map", path:"ARCHITECTURE.md"},{kind:"codebase", path:"lib/auth.js"}], confidence: 0.9 }` in the normal (non-fail) case, and add tests: query returns res.kind === "answer" with res.answer matching /JWT/, res.sources length 2 and every entry kind ∈ {map,codebase}, res.confidence === 0.9; and a fallback test asserting res.kind === "answer" with res.sources deepEqual [] and res.confidence === 0. The fallback test must use a scenario where the subagent returns non-empty plain text but NO structured output (NOT QUERY_FAIL_MODE, which produces empty output and must still hit the kind:"error" failure guard at the empty-output check that precedes the structured-building logic): add a module flag (e.g. QUERY_PLAIN_MODE) to the codebase-query fake that returns text like "plain answer" with structured undefined.</action>
    <verify>node --test test/tools.test.mjs</verify>
    <acceptance_criteria>
      - node --test test/tools.test.mjs exits 0
      - grep -n "QUERY_ANSWER_SCHEMA\|outputSchema\|clampConfidence" lib/map-codebase.js all match
      - the structured-answer test asserts res.kind === "answer", res.sources[0].kind === "map", res.confidence === 0.9
      - the fallback test asserts res.sources deepEqual [] and res.confidence === 0
    </acceptance_criteria>
    <done>Query mode returns a validated structured {answer, sources, confidence} object with a robust fallback, and the query prompt demands the structured JSON contract.</done>
  </task>

  <task type="auto">
    <name>Task 3: queryScope subtree scoping (D-08)</name>
    <files>lib/map-codebase.js, test/tools.test.mjs</files>
    <read_first>lib/map-codebase.js</read_first>
    <action>In lib/map-codebase.js, add to the gsd_map_codebase parameters an entry `queryScope: { type: "array", items: { type: "string" }, description: "Repo-relative path prefixes to restrict the query subagent's targeted exploration to, in query mode. Same validation as paths. When omitted, the query subagent may explore anywhere." }`. In the query branch, after `const q = ...` and before building the prompt, compute `const qScope = validatePaths(args.queryScope);` (reuse the existing validatePaths from line 47). When qScope.length > 0, append a scope line to the prompt string: `"Scope: restrict ONLY your targeted Glob/Grep exploration to these repo-relative prefixes: " + qScope.join(", ") + " — the map documents above remain your primary source."` (the map docs are already loaded fully into the prompt before this line, per D-08). In test/tools.test.mjs, add a module-level capture array (mirroring executeCaptured at line 25) for query prompts, push req.prompt[0].text in the codebase-query fake branch, and add a test: query with queryScope:["src/"] and an existing map doc; assert the captured prompt contains "restrict ONLY your targeted Glob/Grep exploration" and "src/"; assert the map doc content is still present in the captured prompt (full loading preserved).</action>
    <verify>node --test test/tools.test.mjs</verify>
    <acceptance_criteria
    >- node --test test/tools.test.mjs exits 0
      - grep -n "queryScope" lib/map-codebase.js matches (parameter + validation + prompt injection)
      - the queryScope test asserts the captured prompt contains the scope instruction and "src/", and still contains the map doc
    </acceptance_criteria>
    <done>queryScope restricts the query subagent's targeted exploration to the subtree while the map docs load fully, proven by a captured-prompt test.</done>
  </task>
</tasks>

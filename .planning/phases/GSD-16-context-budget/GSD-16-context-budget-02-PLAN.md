---
phase: 16-context-budget
plan: 02
type: execute
wave: 2
depends_on: ["GSD-16-context-budget-01"]
files_modified: ["lib/plan.js", "lib/execute.js", "lib/verify.js", "lib/ui.js", "lib/map-codebase.js", "test/context-wiring.test.mjs"]
autonomous: true
requirements: ["CQ-06"]
user_setup: []
must_haves:
  truths:
    - "Every tool that builds a <planning_context> derives the total budget from config.json context_window via the shared contextBudget helper and caps its subagent prompt against it, so a single oversized artifact cannot blow out a fresh context."
    - "Every tool that builds a <planning_context> reads the returned text (not the object) for its prompt and surfaces the truncated list on its log/return channel, so truncation is visible to the orchestrator."
    - "The `cfg` variable that plan.js currently reads but never uses is now consumed for the budget."
  artifacts:
    - path: "test/context-wiring.test.mjs"
      provides: "Source-assertion tests (node:test, reading each lib/*.js) that guard the return-shape wiring: every call site imports contextBudget, passes a derived maxTotal as the 3rd arg, reads .text for the prompt, and references .truncated."
      min_lines: 60
      exports: []
  key_links:
    - from: "lib/plan.js"
      to: "lib/_shared.js"
      via: "plan.js imports contextBudget and calls contextBudget(cfg?.context_window) to derive maxTotal, then passes (entries, 60000, maxTotal) to planningContext and reads pc.text into the prompt and pc.truncated into the log."
      pattern: "contextBudget"
    - from: "lib/execute.js"
      to: "lib/_shared.js"
      via: "execute.js imports contextBudget, derives maxTotal from s.readConfig(cwd), passes it as the 3rd arg to planningContext, uses .text in the executor prompt and reports .truncated via its log array."
      pattern: "contextBudget"
---
<objective>
Wire the new planningContext signature across all five tools (plan, execute, verify, ui, map-codebase) so each derives the total budget from config context_window via the shared contextBudget helper, uses the returned `.text` for its prompt, and surfaces the `.truncated` list on its log/return channel. Guard the wiring with source-assertion tests so the breaking return-shape change can never silently regress to `[object Object]`.
</objective>
<context>lib/plan.js (dead `cfg` at line 56; planningContext at researcher L71, planner L93, runChecker L167; `log` array L63; runChecker called at L117/L130), lib/execute.js (planningContext L116 inside the wave-1 executor map; `log` array in scope; no readConfig today; already imports from ./_shared.js), lib/verify.js (planningContext L60; no log array — return array built at L92; already imports parseFrontmatter from _shared), lib/ui.js (planningContext L41 and L56; no log array — return array at L62), lib/map-codebase.js (planningContext L109 in query mode; query returns r.output directly at L114; imports today from _shared), lib/_shared.js (contextBudget from PLAN 01), lib/_runner.js (new planningContext from PLAN 01)</context>
<tasks>
<task type="auto">
<name>Task 1 (tracer): wire plan.js — the richest call site (researcher, planner, checker)</name>
<files>lib/plan.js</files>
<read_first>lib/plan.js</read_first>
<action>In lib/plan.js, consume the currently-dead `cfg` and wire all three planningContext calls to the new signature and return shape:
1. Add `contextBudget` to the `./_shared.js` import (add `import { contextBudget } from "./_shared.js";` if no _shared import exists yet).
2. Replace the dead variable at line 56: `const cfg = await s.readConfig(cwd);` → keep the read and derive `const maxTotal = contextBudget(cfg?.context_window);` so `cfg` becomes used (no dead variable).
3. Researcher call (L71): wrap the `planningContext([...])` at lines 71-76 into `const pc = planningContext([...], 60000, maxBudget);`, use `pc.text` inside the `.join("\n\n")` prompt array, and after building the prompt push a truncation line into the `log` array when `pc.truncated.length`.
4. Planner call (L93): the same transformation on lines 93-100 — `const pc = planningContext([...], 60000, maxBudget);`, use `pc.text` in the prompt, and push a truncation line into `log` when truncated.
5. runChecker (L lines 159-178, called at L117 and L130): add a `log` parameter to the runChecker signature and pass `log` at both call sites; inside runChecker derive `const maxBudget = contextBudget((await s.readConfig(cwd))?.context_window);`, wrap the planningContext at L167 into a `pc`, use `pc.text` in the prompt, and push a truncation line into `log` when `pc.truncated.length`.
6. Use a single consistent line format for all pushes: `planning-context: truncated ${pc.truncated.length} ${pc.truncated.length === 1 ? "entry" : "entries"} (${pc.truncated.map(t => t.label).join(", ")}) — capping total context to ${maxBudget} chars`.</action>
<verify>node -e 'import("./lib/plan.js").then(() => console.log("ok"))' && node --input-type=module -e 'import fs from "node:fs"; const s=fs.readFileSync("lib/plan.js","utf8"); console.log(s.includes("contextBudget"), /planningContext\([^)]*60000,\s*maxBudget\)/.test(s), s.includes("pc.text"), s.includes("pc.truncated"));'</verify>
<acceptance_criteria>
- grep "contextBudget" in lib/plan.js; `cfg` at line 56 is consumed (its value feeds contextBudget)
- All three planningContext calls pass `60000, maxBudget` as args and read `.text` for the prompt
- The returned string is built from `pc.text`, so no prompt can contain `[object Object]`
- A truncation line is pushed to `log` for the researcher, planner, and run-checker cases</acceptance_criteria>
<done>plan.js derives the budget from cfg, routes all three planningContext calls through the new `{ text, truncated }` return, and reports truncation on its log channel.</done>
</task>
<task type="auto">
<name>Task 2: wire the remaining four tools (execute, verify, ui, map-codebase)</name>
<files>lib/execute.js, lib/verify.js, lib/ui.js, lib/map-codebase.js</files>
<read_first>lib/execute.js, lib/verify.js, lib/ui.js, lib/map-codebase.js</read_first>
<action>Apply the same pattern to the other four tools.
execute.js: (a) add `contextBudget` to the existing `./_shared.js` import; (b) read the config once near line 59 and derive `const maxBudget = contextBudget((await s.readConfig(cwd))?.context_window);`; (c) at the executor planningContext (L116) wrap into a constant, use `.text` in the prompt, and when `pc.truncated.length` push a truncation line into the in-scope `log` array (use the same line format as plan.js).
verify.js: (a) add `contextBudget` to the existing `./_shared.js` import; (b) derive `const maxBudget = contextBudget((await s.readConfig(cwd))?.context_window);`; (c) at the planningContext (L60) wrap into a constant, use `.text`, and collect truncation notes into a new `const notes = []` array; (d) include the `notes` lines in the final returned array (built at lines 92-97) so truncation is surfaced to the orchestrator.
ui.js: (a) add `import { contextBudget } from "./_shared.js";`; (b) derive `const maxBudget = contextBudget((await s.readConfig(cwd))?.context_window);`; (c) wrap BOTH planningContext calls (researcher L41, checker L56) into constants using `.text`, collect truncation notes into a new `const notes = []`, and include them in the returned array (lines 62-66).
map-codebase.js: (a) add `contextBudget` to the existing `./_shared.js` import; (b) in query mode derive `const maxBudget = contextBudget((await s.readConfig(cwd))?.context_window);`, wrap the planningContext (L109) into a constant using `.text`, and when `pc.truncated.length` append a `planning-context: truncated …` line to the returned query output string (the query path returns `r.output` directly at L114, so surface the note inline in the returned string).</action>
<verify>npm test</verify>
<acceptance_criteria>
- grep "contextBudget" appears in lib/execute.js, lib/verify.js, lib/ui.js, lib/map-codebase.js
- each of the four tools references `pc.text` (or the wrapped `.text`) and `pc.truncated` (or `.truncated`) 
- no prompt string is built from the raw planningContext object in any tool (grep confirms `.text` is read where planningContext is called)
- `npm test` passes</acceptance_criteria>
<done>All five tools derive the budget, use the `.text` for their prompts, and surface `.truncated` on their log/return channels — no call site leaks `[object Object]`.</done>
</task>
<task type="auto">
<name>Task 3: source-assertion tests guarding the return-shape wiring across all five tools</name>
<files>test/context-wiring.test.mjs</files>
<read_first>lib/plan.js, lib/execute.js, lib/verify.js, lib/ui.js, lib/map-codebase.js, test/ship.test.mjs</read_first>
<action>Create `test/context-wiring.test.mjs` using `node:test` + `node:assert/strict`, mirroring the static source-assertion style of test/ship.test.mjs (read each lib file with `fs.readFileSync` and assert wiring). For each of the five files — lib/plan.js, lib/execute.js, lib/verify.js, lib/ui.js, lib/map-codebase.js — add a named test that asserts:
1. the file imports `contextBudget` (from `./_shared.js`);
2. it calls `s.readConfig(cwd)` (or derives `maxBudget` from a config read);
3. every `planningContext(` call passes a derived maxTotal as the 3rd argument (regex like /planningContext\(\s*\[[\s\S]*?\],\s*60000,\s*\w+/ for the shared cases — adjust to your actual call shape) and reads `.text` from the result for the prompt (grep `.text`);
4. the file references `pc.truncated` or `.truncated` for surfacing.
Then run `npm test` and confirm both the new wiring tests and the existing suite pass.</action>
<verify>npm test</verify>
<acceptance_criteria>
- test/context-wiring.test.mjs exists with a named test per five tools
- `npm test` passes — this guards the breaking return-shape change so a future regression (a call site passing the object directly) fails the suite
- grep "contextBudget" appears in all five lib/*.js</acceptance_criteria>
<done>green `npm test` including test/context-wiring.test.mjs that statically asserts all five call sites use the new shape and surfacing; a regression in any call site fails the suite.</done>
</task>
</tasks>

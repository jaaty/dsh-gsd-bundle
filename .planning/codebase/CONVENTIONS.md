# Coding Conventions

**Analysis Date:** 2026-08-23

## Language & Module System

- **Plain ESM JavaScript** — `"type": "module"` in `package.json` (`package.json:5`). All files use `import`/`export` statements. No TypeScript, no build step, no transpilation.
- **Zero runtime dependencies** — `"dependencies": {}` (`package.json:54`). The only imports from the outside world are the three peer deps: `@deepseek-ai/dsh-tools` (`defineTool`), `@deepseek-ai/dsh-llm` (`createUserMessage`, used only in `lib/commands.js:14`), and the host Cordis/`ctx` runtime. The Node builtins used are `node:child_process` (`lib/ship.js:11`, `lib/map-codebase.js:25`) and dynamic `node:fs/promises` imports (`lib/state.js:84`, `lib/ship.js:126`, `lib/quick.js:55`).
- **No lint or format tooling** is configured (no `.eslintrc*`, `eslint.config.*`, `.prettierrc*`, `biome.json`, or `tsconfig.json`). The conventions below are inferred from the actual source and must be matched by hand.

## Naming Patterns

**Files:**
- `kebab-case.js` for plugin entry modules: `lib/persona.js`, `lib/discuss.js`, `lib/core-tools.js`, `lib/map-codebase.js`.
- `_` prefix marks internal non-plugin helper modules: `lib/_shared.js`, `lib/_runner.js`, `lib/_agents.js`. This is the convention to follow for any new internal module (e.g. `lib/_docs.js`).
- Test files use the `.test.mjs` extension and live in `test/`: `test/_shared.test.mjs`, `test/state.test.mjs`, `test/tools.test.mjs`. Test helpers are plain `.mjs` under `test/helpers/`: `test/helpers/fake-fs.mjs`, `test/helpers/project.mjs`. Use `.mjs` (not `.js`) for test files so the `.js` → ESM mapping is unambiguous without relying on `package.json` `"type"`, and keep the `_shared.test.mjs`/`state.test.mjs`/`tools.test.mjs` grouping: one file per unit-under-test (pure helpers / `GsdState` service / tool-level integration).
- Artefact document files are `UPPERCASE.md` with a phase base prefix: `.planning/codebase/STACK.md`, `.planning/phases/01-auth/01-auth-CONTEXT.md`, `01-auth-01-PLAN.md`, `01-auth-VERIFICATION.md` (the `<NN>-<slug>` base + artefact suffix; see `lib/state.js:357-368`).

**Plugin contract (mandatory for every Cordis plugin module):**
```javascript
const name = "gsd-xxx";
const inject = ["gsdState", "tools"];

function apply(ctx) { ... }

export { name, inject, apply };
```
- `name` is the plugin row id, `inject` lists host services, `apply(ctx)` registers tools/sections/services. Every plugin module in `lib/` ends with this exact export statement. See `lib/discuss.js:11-13,143`, `lib/execute.js:19-21,137`, `lib/commands.js:16-17,190`.
- Exceptions: `lib/_shared.js` exports only named helper functions; `lib/_runner.js` exports named helpers (`spawnSubagent`, `planningContext`, `cwdOf`); `lib/_agents.js` exports only `const` prompt strings; `lib/state.js` additionally exports the `GsdState` class alongside the plugin contract (`lib/state.js:519`).

**Functions:**
- `camelCase` for functions: `renderStateContext`, `spawnSubagent`, `cwdOf`, `planningContext` (`lib/persona.js:48`, `lib/_runner.js:8,36,48`).
- A closure-in-`apply` naming convention is universal: `const gsd = () => ctx.get("gsdState");` — every plugin tool resolves the service this way (`lib/discuss.js:15`, `lib/plan.js:18`, `lib/execute.js:23`, `lib/verify.js:17`, `lib/ship.js:33`, `lib/core-tools.js:13`, `lib/map-codebase.js:70`).
- Module-private helpers in `lib/state.js` are methods on `GsdState` (see below); module-private helpers in `lib/ship.js` (`run`, `git`, `gitOk`, `gh`, `lib/ship.js:19-30`) and `lib/map-codebase.js` (`validatePaths`, `gitAddCommit`, `lib/map-codebase.js:47,59`) are plain function declarations above `apply`.

**Variables/constants:**
- `camelCase` locals; `UPPER_SNAKE_CASE` for module-level constants (`SECTION_ORDER_PERSONA`, `CONTEXT_ORDER_GSD` in `lib/persona.js:15-16`; `STEPS`, `STATE_VERSION` in `lib/state.js:24-25`; `QUICK_PROMPT` in `lib/quick.js:15`; `FOCUS_DOCS`, `VALID_FAST_FOCUS`, `PATH_FORBIDDEN` in `lib/map-codebase.js:35-46`; `COMMANDS` in `lib/commands.js:33`).
- `_`-prefixed (underscore) names mark private/internal members of the `GsdState` class: `_planning`, `_phases`, `_read`, `_write`, `_ensureDir`, `_ensureParent`, `_freshState`, `_stringifyState`, `_parseStateBody`, `_phaseDirName`, `_artifactFile`, `_extractBlock`, `_cache`, `_defaultConfig`, `_nextActionFor` (`lib/state.js:37,41-42,70-96,143,163,193,230,305,342,364,429`). Use this prefix for any new internal method.
- Public accessors on `GsdState` have no underscore: `planningRoot`, `codebaseDir`, `listCodebaseDocs`, `readCodebaseDoc`, `readProject`, `isProject`, `initProject`, `readState`, `writeState`, `updateStateFrontmatter`, `addDecision`, `addBlocker`, `resolveBlocker`, `recordSession`, `setActivePhase`, `readRoadmap`, `writeRoadmap`, `readRequirements`, `writeRequirements`, `markRequirementComplete`, `readConfig`, `phaseDir`, `writeArtifact`, `readArtifact`, `hasArtifact`, `listPlans`, `planIndex`, `markPlanSummary`, `completePhase`, `recomputeProgress`, `cachedState` (`lib/state.js:47-493`). The public surface is the contract the phase tools depend on; add new public methods unprefixed.

**Types / frontmatter keys:**
- Snake_case for artefact frontmatter keys (`gsd_state_version`, `active_phase`, `next_action`, `total_plans`, `milestone_name`, `completed_phases`, `last_activity`, `stopped_at` in `lib/state.js:135-152`) — this is the opengsd schema, not JS naming.
- `kebab-case` for slash-command names (`gsd-init`, `gsd-plan-phase`, `gsd-verify-work`, `gsd-new-milestone`, `lib/commands.js:33-172`) and for plugin row ids (`gsd-persona`, `gsd-core-tools`, `gsd-map-codebase`, `cordis.patch.yml:24-84`).

## Code Style

**Formatting (match by hand — no tool enforces it):**
- 2-space indentation; single quotes for strings; semicolons at end of statements.
- `const` exclusively for declarations, except one intentional `var GsdState = class` at `lib/state.js:31` — the only `var` in the codebase. Do not replicate; use `const`/`class`. `let` is used sparingly, only where reassignment is genuinely needed (loop counters in `lib/state.js:120,233`, the revision loop `iter` in `lib/plan.js:119`, status accumulators in `lib/verify.js:78-83`).
- Template literals with `${}` for interpolation are the norm for messages and prompts: `` `gsd_plan: phase ${args.phase} not in ROADMAP.md` `` (`lib/plan.js:42`).
- Optional chaining `?.` and nullish `||` fallbacks are used consistently, e.g. `exec?.agent?.session?.header?.cwd || process.cwd()` (`lib/core-tools.js:53`, abstracted as `cwdOf` in `lib/_runner.js:48`).
- The dominant string-building pattern is **an array of strings pushed/then `.join("\n")`** — used for STATUS output (`lib/core-tools.js:96-115`), CONTEXT.md (`lib/discuss.js:80-128`), prompts (`lib/plan.js:69-78`), STATE.md (`lib/state.js:163-189`), and PR bodies (`lib/ship.js:92-121`). Follow this pattern for any multi-line output.
- `.filter(Boolean).join(...)` to drop empty entries from output arrays (`lib/plan.js:108,155`, `lib/verify.js:73,98`, `lib/execute.js:97`, `lib/map-codebase.js:200`).
- `(args.x || [])` defensive default for optional array parameters everywhere (`lib/discuss.js:95,99,106`, `lib/core-tools.js:57`, `lib/state.js:110-116`).
- `String(x ?? "")` coercion at the boundary when a value may be `null`/`undefined` and must become a string (`lib/_shared.js:6`, `lib/state.js:347`, `lib/verify.js:83`).

**Linting:**
- None configured. Style rules above are self-imposed. The only tool-visible constraint is that each module must be valid ESM that imports only from the peers listed in `package.json` plus Node builtins.

## Import Organization

**Order observed:**
1. Node builtins first (`import { execFileSync } from "node:child_process"` — `lib/ship.js:11`, `lib/map-codebase.js:25`; dynamic `await import("node:fs/promises")` — `lib/state.js:84`, `lib/ship.js:126`, `lib/quick.js:55`).
2. External peer packages (`@deepseek-ai/dsh-tools` → `defineTool`; `@deepseek-ai/dsh-llm` → `createUserMessage` in `lib/commands.js:14`).
3. Internal relative imports (`./_shared.js`, `./_runner.js`, `./_agents.js`). See `lib/plan.js:9-12`, `lib/execute.js:14-17`, `lib/verify.js:9-12`.

**Path aliases:** None — only relative imports (`./_shared.js`, `./_runner.js`, `./_agents.js`). Never use absolute/bare internal specifiers. Tests import the library via relative paths too (`../lib/state.js`, `../../lib/state.js`, `test/state.test.mjs:8`, `test/helpers/project.mjs:4`).

## Error Handling

**Patterns:**
- **Guard-clause errors** at the top of every `execute`: throw `new Error("<tool>: <reason>")` for hard failures (service missing, not a project, phase not found). The prefix is always the tool name:
  ```javascript
  if (!s) throw new Error("gsd_discuss: gsdState service unavailable");
  if (!(await s.isProject(cwd))) throw new Error("gsd_discuss: no .planning/ project — run gsd_init first");
  ```
  (`lib/discuss.js:71-72`, same shape in every phase tool: `lib/plan.js:37-46`, `lib/execute.js:37-40`, `lib/verify.js:31-34`, `lib/ui.js:27-30`, `lib/ship.js:44-48`, `lib/quick.js:36-38`, `lib/map-codebase.js:85-87`).
- **Non-fatal conditions return a string** instead of throwing (the caller renders it as tool output): `"No .planning/ project in this workspace. Run gsd_init…"` (`lib/core-tools.js:92,129`), `"gsd_plan: no CONTEXT.md…"` (`lib/plan.js:54`), `"gsd_execute: no plans…"` (`lib/execute.js:51`), `"gsd_verify: missing SUMMARY.md…"` (`lib/verify.js:48-50`).
- **`fail()` closure** for multi-step preflight in `lib/ship.js:53`: `const fail = (m) => { throw new Error(\`gsd_ship preflight failed: ${m}\`); }` — a named gate that prepends context. Used at every numbered preflight step (`lib/ship.js:57,59,63,68-71,74,77,81,134`).
- **Best-effort reads** use `.catch(() => "")` (or `.catch(() => "")`/`.catch(() => null)`) so missing optional artefacts degrade to empty strings rather than throwing (`lib/plan.js:89-90`, `lib/verify.js:44-46`, `lib/ship.js:53`, `lib/execute.js:47-48`, `lib/core-tools.js:134,140`).
- **Best-effort writes/ops** wrap in `try {} catch {}` with an explanatory comment or silent swallow: `lib/quick.js:56-58` (mkdir + addDecision), `lib/state.js:85-87` (`/* may already exist */`), `lib/ship.js:136` (`.catch(() => {})`), `lib/map-codebase.js:60-67` (git add/commit returns boolean).
- **git/gh errors** routed through `gitOk()` returning `""` on failure, with strict `try/catch` around the hard gates (`lib/ship.js:22-27`); `map-codebase.js` swallows git failures entirely (`gitAddCommit` returns `false`, `lib/map-codebase.js:59-67`).
- **Schema-level validation** for tool args is declared in `defineTool({ parameters })` and enforced by the host before `execute` runs — e.g. the `enum` on `gsd_map_codebase`'s `focus` (`lib/map-codebase.js:77`) and `gsd_plan`'s `granularity` (`lib/plan.js:32`). Do not re-validate inside `execute`; the schema is the gate. Where a value bypasses the schema (e.g. `base` from `git symbolic-ref`), validate it with `isValidRef` before interpolating it into a shell call (`lib/ship.js:70-71`, `SAFE_REF_RE` in `lib/_shared.js:284-287`).

## Logging

**Framework:** None — plain text output returned from `execute` (the string return value becomes the tool result the agent sees). No `console.log` in production paths.

**Patterns:**
- Progress is collected into a `log` array (`lib/plan.js:64`, `lib/execute.js:60`, `lib/ship.js:52`, `lib/map-codebase.js:132`) then returned as a joined string at the end. Never log ad-hoc; add to the array and return it.
- Human-oriented status blocks are prefixed with `## HEADER` lines (e.g. `"## Execution Plan"`, `"## Phases"`, `"## Recent Decisions"`, `"## Next Up"` — `lib/execute.js:60`, `lib/core-tools.js:97-114`, `lib/map-codebase.js:186-199`).
- Wave/plan progress lines use a table-ish `| Wave N | id1, id2 |` shape (`lib/execute.js:61`) and per-plan `wave N: id ✓ / ✗` markers (`lib/execute.js:115-116`).

## Comments

**Header comments (mandatory convention):** every module starts with a `// @dsh-gsd/bundle/<name> — <one-line role>` header comment plus a short paragraph explaining the plugin's job and its faithfulness to opengsd-core (`lib/persona.js:1-13`, `lib/execute.js:1-12`, `lib/state.js:1-15`, `lib/map-codebase.js:1-24`). Test files start with a `// <one-line role>` comment too (`test/_shared.test.mjs:1-2`, `test/state.test.mjs:1-2`, `test/tools.test.mjs:1-3`, `test/helpers/fake-fs.mjs:1-5`). Keep this style for new modules and test files.

**Section banners:** `// ── section name ──────` used to group related blocks (`lib/state.js:40,98,192,309,341,356,391,495`, `lib/_shared.js:26,175,238,264,274`, `lib/core-tools.js:15,82,120,155`).

**JSDoc:** rare — only on `renderStateContext` (`lib/persona.js:42-47`) and the class comment above `GsdState` (`lib/state.js:27-30`). Default is `//` line comments. Don't introduce full JSDoc if it wasn't there; use the existing comment style.

**Inline step banners:** `// ── 1. Research ──`-style numbered comments inside the long `execute` bodies of `lib/plan.js` and `lib/ship.js` (e.g. `lib/plan.js:66,89,115,134`, `lib/ship.js:55,61,65,73,76,79,83,123,139`) to divide the phase logic.

**Bug-pinning comments in tests:** every regression test carries a `// BUG (…):` comment above it explaining the defect it pins (`test/_shared.test.mjs:42-44,86-87,128-130,143-145,159-160`, `test/state.test.mjs:27-28,46-47,63-64,107-108,133-134`, `test/tools.test.mjs:120-122`). When you fix a defect, add the test AND the bug-pinning comment; do not delete an existing one without confirming the bug is genuinely gone.

## Function Design

**Size:** `execute` functions are large but linear (single flat sequence; phases run in numbered comment steps). No refactoring into tiny helpers at the tool layer — helper extraction happens only into `_runner.js` (`spawnSubagent`, `planningContext`, `cwdOf`) and `_shared.js` (pure text/schema functions). Follow that split: keep orchestrator logic in the tool file, put reusable infra in an underscore module.

**Parameters:** tool parameters are declared as plain objects in `defineTool({ parameters: {...} })` schema (JSON Schema style with `{ type, required, description, items, properties, additionalProperties: false }`). See `lib/core-tools.js:19-50` and `lib/discuss.js:20-66` for the reference shapes. Flatten nested required structures; arrays of objects use `items.properties` with `additionalProperties: false` on every object (`lib/discuss.js:33-49`, `lib/core-tools.js:24-46`). Optional parameters omit `required` and may carry a `description` documenting the flag's effect.

**Return values:** always `string` (a markdown-style report) — `output: { schema: { type: "string" }, render: (_a, v) => [{ type: "text", text: v }] }` appears verbatim in every tool (`lib/core-tools.js:51`, `lib/discuss.js:67`, `lib/plan.js:34`, `lib/execute.js:33`, `lib/verify.js:27`, `lib/ship.js:43`, `lib/ui.js:23`, `lib/quick.js:32`, `lib/map-codebase.js:81`). Return either a report string or throw — no object returns from tool executes.

**`presentCall`:** every tool supplies a `presentCall(a)` returning `{ card: "generic", title, kind: "other", rawInput }` (`lib/discuss.js:139`, `lib/core-tools.js:79,117,152,200`, `lib/map-codebase.js:203`). Include it on any new tool so the GUI renders the call card.

## Module Design

**Exports:** one named export statement at the bottom exporting `name`, `inject`, `apply` (and for `state.js`, also `GsdState`). No default exports. Internal modules export named helpers/prompts only (`lib/_shared.js`, `lib/_runner.js`, `lib/_agents.js`).

**Barrel files:** none — consumers import the subpath directly via `package.json` `exports` map (`package.json:7-42`). New plugins get a new `exports` entry and a new `cordis.patch.yml` insert row.

**`apply` responsibilities:** register tools with `ctx.tools.register(defineTool({...}))` (`lib/discuss.js:17`), register sections via `ctx.systemPrompt.section({...})` / `ctx.systemPrompt.context({...})` (`lib/persona.js:69-89`), provide a service via `ctx.provide(...)` (`lib/state.js:515`), or register slash commands via `ctx.commands.register({...})` inside a `ctx.effect(...)` lifecycle (`lib/commands.js:174-190`). Lifetime cleanup is `ctx.effect(() => () => cleanup, "label")` (`lib/state.js:516`, `lib/commands.js:175,188`).

**The orchestrator/stub split (key convention):** phase tools that spawn subagents never do the heavy work themselves — they assemble a `<planning_context>` block (via `planningContext`, `lib/_runner.js:36-46`) and delegate to a fresh-context subagent whose role prompt lives in `lib/_agents.js`. Add a new subagent role by adding a `const X_PROMPT` export to `lib/_agents.js` and referencing it from the tool, exactly as `RESEARCHER_PROMPT`/`PLANNER_PROMPT`/`PLAN_CHECKER_PROMPT` are used (`lib/plan.js:12,71,93,124,167`). Never inline a multi-paragraph role prompt in a tool file.

## Error-message style

- Prefix every thrown error with the tool name + colon: `gsd_plan:`, `gsd_execute:`, `gsd_ship preflight failed:`.
- Guide the next step in the message: `" — run gsd_init first"`, `"Run gsd_plan first"`, `"re-run with force=true to replan (clears the closed-phase gate)"` (`lib/plan.js:51`, `lib/ship.js:57`).
- Some messages are returned rather than thrown when the condition is user-recoverable and shouldn't abort the tool call (`lib/plan.js:54`, `lib/execute.js:51,57`, `lib/verify.js:48-50`, `lib/core-tools.js:92,129,179`). Rule of thumb: missing *prerequisite artefact* → return string hint; missing *service/state invariant* → throw.
- Keep the wording of guard strings stable — tests pin them with regex (`test/tools.test.mjs:149,164` pins `/force=true/` and `/no VERIFICATION\.md/`; `test/state.test.mjs` and `test/_shared.test.mjs` pin the parsed artefact shapes). If you change a thrown guard message, search the test files for the old wording and update both.

---

*Convention analysis: 2026-08-23*
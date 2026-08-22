# Coding Conventions

**Analysis Date:** 2026-08-22

## Language & Module System

- **Plain ESM JavaScript** — `"type": "module"` in `package.json` (`package.json:5`). All files use `import`/`export` statements. No TypeScript, no build step, no transpilation.
- **Zero runtime dependencies** — `"dependencies": {}` (`package.json:53`). The only imports from the outside world are the three peer deps: `@deepseek-ai/dsh-tools` (`defineTool`), `@deepseek-ai/dsh-llm` (`createUserMessage`, used only in `lib/commands.js`), and the host Cordis/`ctx` runtime. The one Node builtin used is `node:child_process` (`lib/ship.js:11`) and dynamic `node:fs/promises` imports (`lib/ship.js:121`, `lib/quick.js:55`).
- **No lint or format tooling** is configured (no `.eslintrc*`, `eslint.config.*`, `.prettierrc*`, `biome.json`, or `tsconfig.json`). The conventions below are inferred from the actual source and should be matched by hand.

## Naming Patterns

**Files:**
- `kebab-case.js` for plugin entry modules: `lib/persona.js`, `lib/discuss.js`, `lib/core-tools.js`.
- `_` prefix marks internal non-plugin helper modules: `lib/_shared.js`, `lib/_runner.js`, `lib/_agents.js`. This is the convention to follow for any new internal module (e.g. `lib/_docs.js`).

**Plugin contract (mandatory for every Cordis plugin module):**
```javascript
const name = "gsd-xxx";
const inject = ["gsdState", "tools"];

function apply(ctx) { ... }

export { name, inject, apply };
```
- `name` is the plugin row id, `inject` lists host services, `apply(ctx)` registers tools/sections/services. Every plugin module in `lib/` ends with this exact export statement. See `lib/discuss.js:11-13`, `lib/execute.js:19-21`, `lib/commands.js:16-17`.
- Exceptions: `lib/_shared.js` exports only named helper functions; `lib/_runner.js` exports helpers; `lib/_agents.js` exports only `const` prompt strings; `lib/state.js` additionally exports the `GsdState` class alongside the plugin contract (`lib/state.js:467`).

**Functions:**
- `camelCase` for functions: `renderStateContext`, `spawnSubagent`, `cwdOf`, `planningContext` (`lib/_runner.js:8,36,48`).
- A closure-in-`apply` naming convention is universal: `const gsd = () => ctx.get("gsdState");` — every plugin tool resolves the service this way (`lib/discuss.js:15`, `lib/plan.js:18`, `lib/execute.js:23`).

**Variables/constants:**
- `camelCase` locals; `UPPER_SNAKE_CASE` for module-level constants (`SECTION_ORDER_PERSONA`, `CONTEXT_ORDER_GSD` in `lib/persona.js:15-16`; `STEPS` in `lib/state.js:25`; `QUICK_PROMPT` in `lib/quick.js:15`).
- `_`-prefixed (underscore) names mark private/internal members of the `GsdState` class: `_planning`, `_phases`, `_read`, `_write`, `_ensureDir`, `_freshState`, `_stringifyState`, `_cache` (`lib/state.js:37,41-42,49-66`).

**Types / frontmatter keys:**
- Snake_case for artefact frontmatter keys (`gsd_state_version`, `active_phase`, `next_action`, `total_plans`, `milestone_name` in `lib/state.js:135-152`) — this is the opengsd schema, not JS naming.

## Code Style

**Formatting (match by hand — no tool enforces it):**
- 2-space indentation; single quotes for strings; semicolons at end of statements.
- `const` exclusively (except one intentional `var GsdState = class` at `lib/state.js:31`, the only `var` in the codebase — do not replicate).
- Template literals with `${}` for interpolation are the norm for messages and prompts: `` `gsd_plan: phase ${args.phase} not in ROADMAP.md` `` (`lib/plan.js:41`).
- Optional chaining `?.` and nullish `||` fallbacks are used consistently, e.g. `exec?.agent?.session?.header?.cwd || process.cwd()` (`lib/core-tools.js:53`).
- The dominant string-building pattern is **an array of strings pushed/then `.join("\n")`** — used for STATUS output (`lib/core-tools.js:96-115`), CONTEXT.md (`lib/discuss.js:80-128`), prompts (`lib/plan.js:69-78`), STATE.md (`lib/state.js:163-189`), and PR bodies (`lib/ship.js:87-116`). Follow this pattern for any multi-line output.
- `.filter(Boolean).join(...)` to drop empty entries from output arrays (`lib/plan.js:107,154`, `lib/verify.js:73,98`, `lib/execute.js:97`).
- `(args.x || [])` defensive default for optional array parameters everywhere (`lib/discuss.js:95,99,106`, `lib/core-tools.js:57`).

**Linting:**
- None configured. Style rules above are self-imposed. The only tool-visible constraint is that each module must be valid ESM that imports only from the peers listed in `package.json`.

## Import Organization

**Order observed:**
1. Node builtins first (`import { execSync } from "node:child_process"` — `lib/ship.js:11`).
2. External peer packages (`@deepseek-ai/dsh-tools`, `@deepseek-ai/dsh-llm`).
3. Internal relative imports (`./_shared.js`, `./_runner.js`, `./_agents.js`).

**Path aliases:** None — only relative imports (`./_shared.js`, `./_runner.js`, `./_agents.js`). Never use absolute/bare internal specifiers.

## Error Handling

**Patterns:**
- **Guard-clause errors** at the top of every `execute`: throw `new Error("<tool>: <reason>")` for hard failures (service missing, not a project, phase not found). The prefix is always the tool name:
  ```javascript
  if (!s) throw new Error("gsd_discuss: gsdState service unavailable");
  if (!(await s.isProject(cwd))) throw new Error("gsd_discuss: no .planning/ project — run gsd_init first");
  ```
  (`lib/discuss.js:71-72`, same shape in every phase tool: `lib/plan.js:37-45`, `lib/execute.js:37-40`, `lib/verify.js:31-34`, `lib/ui.js:27-30`, `lib/ship.js:44-48`).
- **Non-fatal conditions return a string** instead of throwing (the caller renders it as tool output): `"No .planning/ project in this workspace. Run gsd_init…"` (`lib/core-tools.js:92`), `"gsd_plan: no CONTEXT.md…"` (`lib/plan.js:54`).
- **`fail()` closure** for multi-step preflight in `lib/ship.js:50`: `const fail = (m) => { throw new Error(`gsd_ship preflight failed: ${m}`); }` — a named gate that prepends context.
- **Best-effort reads** use `.catch(() => "")` so missing optional artefacts degrade to empty strings rather than throwing (`lib/plan.js:89-90`, `lib/verify.js:44-46`, `lib/ship.js:53`).
- **Best-effort writes** wrap in `try {} catch {}` with an explanatory comment (`lib/quick.js:56`, `lib/state.js:61-66`, `lib/ship.js:130`).
- **git/gh errors** routed through `gitOk()` returning `""` on failure, with strict `try/catch` around the hard gates (`lib/ship.js:22-24,72-76`).

## Logging

**Framework:** None — plain text output returned from `execute` (string return value becomes the tool result the agent sees). No `console.log` in production paths.
**Patterns:**
- Progress is collected into a `log` array (`lib/plan.js:63`, `lib/execute.js:60`, `lib/ship.js:49`) then returned as a joined string at the end. Never log ad-hoc; add to the array and return it.
- Human-oriented status blocks are prefixed with `## HEADER` lines (e.g. `"## Execution Plan"`, `"## Phases"`, `"## Recent Decisions"` — `lib/execute.js:60`, `lib/core-tools.js:97-110`).

## Comments

**Header comments (mandatory convention):** every module starts with a `// @dsh-gsd/bundle/<name> — <one-line role>` header comment plus a short paragraph explaining the plugin's job and its faithfulness to opengsd-core (`lib/persona.js:1-13`, `lib/execute.js:1-12`, `lib/state.js:1-15`). Keep this style for new modules.

**Section banners:** `// ── section name ──────` used to group related blocks (`lib/state.js:40,68,162,279,311,349,443`, `lib/_shared.js:26,113,176,202`).

**JSDoc:** rare — only on `renderStateContext` (`lib/persona.js:42-47`) and the class comment above `GsdState` (`lib/state.js:27-30`). Default is `//` line comments. Don't introduce full JSDoc if it wasn't there; use the existing comment style.

**Inline annotations:** `// ── 1. Research ──`-style step numbers inside the long `execute` bodies of `lib/plan.js` and `lib/ship.js` (e.g. `lib/ship.js:52,58,62,68,71,74,78,118,133`) to divide the phase logic.

## Function Design

**Size:** `execute` functions are large but linear (single flat sequence; phases run in numbered comment steps). No refactoring into tiny helpers at the tool layer — helper extraction happens only into `_runner.js` (`spawnSubagent`, `planningContext`, `cwdOf`) and `_shared.js` (pure text/schema functions). Follow that split: keep orchestrator logic in the tool file, put reusable infra in an underscore module.

**Parameters:** tool parameters are declared as plain objects in `defineTool({ parameters: {...} })` schema (JSON Schema style with `{ type, required, description, items, properties, additionalProperties: false }`). See `lib/core-tools.js:19-49` for the reference shape. Flatten nested required structures; arrays of objects use `items.properties`.

**Return values:** always `string` (a markdown-style report) — `output: { schema: { type: "string" }, render: (_a, v) => [{ type: "text", text: v }] }` appears verbatim in every tool (`lib/core-tools.js:51`, `lib/discuss.js:67`, …). Return either a report string or throw — no object returns from tool executes.

## Module Design

**Exports:** one named export statement at the bottom exporting `name`, `inject`, `apply` (and for `state.js`, also `GsdState`). No default exports. Internal modules export named helpers/prompts only.

**Barrel files:** none — consumers import the subpath directly via `package.json` `exports` map (`package.json:7-42`).

**`apply` responsibilities:** register tools with `ctx.tools.register(defineTool({...}))`, register sections via `ctx.systemPrompt.section({...})` / `ctx.systemPrompt.context({...})` (`lib/persona.js:69-89`), provide a service via `ctx.provide(...)` (`lib/state.js:463-464`), or register slash commands via `ctx.commands.register({...})` (`lib/commands.js:20-24`). Lifetimes hooks are `ctx.effect(() => () => cleanup, "label")` (`lib/state.js:464`, `lib/commands.js:22-24`).

## Error-message style

- Prefix every thrown error with the tool name + colon: `gsd_plan:`, `gsd_execute:`, `gsd_ship preflight failed:`.
- Guides next step in the message: `" — run gsd_init first"`, `"Run gsd_plan first"`, `"replanning is blocked without --force"`.
- Some messages are returned rather than thrown when the condition is user-recoverable and shouldn't abort the tool call (`lib/plan.js:54`, `lib/execute.js:51`, `lib/verify.js:48-50`). Rule of thumb: missing *prerequisite artefact* → return string hint; missing *service/state invariant* → throw.

---

*Convention analysis: 2026-08-22*

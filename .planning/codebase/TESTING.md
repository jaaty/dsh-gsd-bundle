# Testing Patterns

**Analysis Date:** 2026-08-23

## Test Framework

**Runner + config path:** Node's built-in test runner (`node:test`), invoked via the `test` script in `package.json`:

```json
"scripts": { "test": "node --test test/*.test.mjs" }
```
(`package.json:9`). There is no separate runner config file — the glob `test/*.test.mjs` *is* the discovery config. Run with `npm test` (or `node --test test/*.test.mjs`). The runner supports TAP-style output; `ℹ tests 34 / pass 34 / fail 0` is the tail summary.

**Assertion Library:** `node:assert/strict` (built-in). Every test file imports it the same way:
```javascript
import assert from "node:assert/strict";
```
(`test/_shared.test.mjs:5`, `test/state.test.mjs:5`, `test/tools.test.mjs:5`). Use `assert.equal`/`deepEqual`/`match`/`ok`/`rejects`/`throws`/`doesNotMatch` — no third-party assertion library.

**Run Commands:**
- `npm test` — full suite.
- `node --test test/state.test.mjs` — a single file.
- `node --test test/*.test.mjs` — all test files (the script form).
- Tests are deterministic and hermetic: no real filesystem, no LLM, no real git/gh, no network. A clean run takes ~210ms for 34 tests.

## Test File Organization

**Location:** A root `test/` directory (not co-located with `lib/`), so tests do not ship in the published bundle (`package.json:48-50` `files` lists only `lib/*.js`, `cordis.patch.yml`, `README.md`). Shared helpers live in `test/helpers/`:

```
test/
├── _shared.test.mjs        # pure helpers in lib/_shared.js
├── state.test.mjs          # GsdState service (lib/state.js) against a fake fs
├── tools.test.mjs          # tool-level integration (real gsd_* executes, fakes around the edges)
└── helpers/
    ├── fake-fs.mjs         # FakeFs — in-memory host `fs` service
    └── project.mjs         # buildProject() + artefact fixtures (FENCED_PLAN, FENCELESS_PLAN, …)
```

**Naming:** `*.test.mjs` — one file per unit-under-test. Mirror the `lib/` module under test in the filename (`_shared.test.mjs` ↔ `lib/_shared.js`, `state.test.mjs` ↔ `lib/state.js`); tool-level tests live together in `tools.test.mjs` because each `describe` block names its tool. Use the `.mjs` extension (not `.js`) so the ESM mapping is explicit and the file is never accidentally packaged by the `files: ["lib/*.js"]` glob.

## Test Structure

**Suite Organization:** `describe` blocks group by behaviour or by the module/tool under test; `test` blocks are individual cases. Each test starts with a short imperative name, and regression tests carry a `// BUG (…):` comment above them explaining the defect they pin:

```javascript
import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";

describe("gsd_execute", () => {
  beforeEach(async () => {
    fs = new FakeFs();
    svc = await buildProject(fs, CWD);
    await svc.writeArtifact(CWD, 1, "PLAN-01", FENCED_PLAN);
    ctx = makeCtx();
  });

  test("--gaps-only runs only gap_closure plans (boolean true in frontmatter)", async () => {
    // BUG: the old filter `p.gap_closure === "true"` never matched the boolean
    // parsed from YAML, so --gaps-only silently ran nothing.
    const { t } = await registerTool("execute", "gsd_execute");
    const res = await t.execute({ phase: 1, gapsOnly: true }, exec);
    assert.ok(fs.files.has(`${CWD}/.planning/phases/01-auth/01-auth-01-SUMMARY.md`), "gaps-only must execute the gap_closure plan");
    assert.match(res, /01-auth-01 ✓/);
  });
});
```
(`test/tools.test.mjs:111-126`).

**Patterns:**
- **Arrange-act-assert** is the universal shape. Arrange via `buildProject(fs, CWD)` + `svc.writeArtifact(...)`; act via `await t.execute(args, exec)`; assert on the returned string and on written artefact files (`fs.files.has(...)`).
- **Per-`describe` `beforeEach`** rebuilds the in-memory project so tests are isolated (`test/tools.test.mjs:87-91,112-117,180-184`). The `fs`, `svc`, `ctx` module-level `let`s are reset each case (`test/tools.test.mjs:12-14`).
- **One logical assertion per bug** is the convention, but multiple `assert.*` calls per test are fine when they pin different facets of the same fix (e.g. `test/_shared.test.mjs:128-138` checks eight inputs to `matchesGapClosure`).
- **`describe` names mirror the contract**, not the file: `"frontmatter parse/stringify"`, `"planIndex"`, `"progress counters"`, `"requirements traceability"` (`test/state.test.mjs`); `"gsd_discuss"`, `"gsd_execute"`, `"gsd_plan closed-phase gate"`, `"gsd_ship preflight"`, `"gsd_status"`, `"gsd_map_codebase"` (`test/tools.test.mjs`).
- **Async tests:** all `test` callbacks are `async`; `await` the execute and the assertions on written files. The fake `fs` methods are `async` even when backed by a synchronous `Map` (`test/helpers/fake-fs.mjs:23-61`), mirroring the real host `fs` contract.

## Mocking

**Framework:** None — hand-written fakes/stubs only, preserving the zero-dependency principle. No `sinon`, no `vi.fn`, no mocking library.

**Patterns:**

1. **`FakeFs` — in-memory host `fs` service** (`test/helpers/fake-fs.mjs`). The single seam that makes `GsdState` and the phase tools fully testable offline. It implements the exact contract `GsdState` calls: `resolve` (returns `{ targetKey, displayPath }`), `processPath`, `stat`, `readText`, `writeText`, `listDir`. State is two `Map`s: `files` (targetKey → content) and `dirs` (Set). `writeText` auto-registers parent dirs to match `@deepseek-ai/dsh-fs-local`'s `writeFileAtomic` behaviour (`test/helpers/fake-fs.mjs:42-45`). Use it for every state/tool test:
   ```javascript
   const fs = new FakeFs();
   const svc = new GsdState(stateCtx(fs), {});
   ```
   `stateCtx(fs)` (`test/helpers/fake-fs.mjs:65-72`) is the minimal `ctx` for constructing `GsdState` standalone: `{ fs, get: () => undefined, provide, effect }`.

2. **`buildProject()` — deterministic initialized project** (`test/helpers/project.mjs:90-98`). Drives the real `GsdState.initProject` against a `FakeFs` to produce `PROJECT.md`, `REQUIREMENTS.md`, `ROADMAP.md`, `STATE.md`, `config.json` with one phase (`01-auth`) and two requirements (`AUTH-01`, `TODO-01`). Always start a state/tool test from `await buildProject(fs, CWD)`; do not hand-craft `.planning/` trees.

3. **Fake `subagents` service** (`test/tools.test.mjs:21-62`). Tool tests stub `ctx.get("subagents")` with a fake whose `start(label, req)` inspects `req.label` to decide what artefact to write and what output to return:
   ```javascript
   function makeSubagents() {
     return {
       getProvider: (n) => (n === "spawn" ? { spawn: true } : undefined),
       async start(_n, req) {
         const label = req.label;
         let text = "done";
         if (label.startsWith("planner") && !label.includes("revise")) {
           await fs.writeText({ targetKey: `${CWD}/.planning/phases/01-auth/01-auth-01-PLAN.md` }, FENCED_PLAN);
           text = "## PLANNING COMPLETE";
         } else if (label.startsWith("execute")) { /* write SUMMARY */ }
         else if (label.startsWith("verify")) { /* write VERIFICATION */ }
         // …
         return { result: { output: [{ type: "text", text }], stopReason: "completed" }, dispose: () => {} };
       },
     };
   }
   ```
   The shape matches what `spawnSubagent` expects (`lib/_runner.js:9-31`): `run.result` resolves to `{ output: [{ type, text }], stopReason }`, and `run.dispose()` is callable. Label-prefix dispatch is the convention — add a new `else if (label.startsWith("<role>"))` branch for each new subagent role a tool spawns. The `map-codebase` branch (`test/tools.test.mjs:40-58`) writes the focus's documents directly, mirroring how the real mapper subagent writes.

4. **Fake `ctx` for tool registration** (`test/tools.test.mjs:64-84`). `makeCtx()` returns `{ fs, get, provide, effect, tools: { register } }`. `registerTool(pluginFile, toolName)` dynamically imports `../lib/<pluginFile>.js`, runs `mod.apply(c, {})`, and returns the registered tool by name — a clean way to grab one tool's `execute` for a test:
   ```javascript
   async function registerTool(pluginFile, toolName) {
     const mod = await import(`../lib/${pluginFile}.js`);
     const tools = [];
     const c = makeCtx();
     c.tools = { register: (t) => tools.push(t) };
     mod.apply(c, {});
     const t = tools.find((x) => x.name === toolName);
     assert.ok(t, `${toolName} not registered by ${pluginFile}`);
     return { t, c };
   }
   ```

5. **The `exec` argument** (`test/tools.test.mjs:16-19`). Tools read `exec.agent.session.header.cwd` (via `cwdOf`); tests pass a minimal `exec` with a fixed cwd (`/project`) plus a `signal` stub:
   ```javascript
   const exec = {
     agent: { session: { header: { cwd: CWD } } },
     signal: { aborted: false, addEventListener() {}, removeEventListener() {} },
   };
   ```

**What to Mock:**
- `ctx.get("subagents")` — always, for any tool that spawns. The fake writes the artefact the real subagent would, so the orchestrator's read-back and routing logic is exercised.
- `ctx.get("gsdState")` — return the real `GsdState` instance built on `FakeFs`; do not mock the service, exercise it (that is `test/state.test.mjs`'s whole point).
- `ctx.get("tools")` — `{ register() {} }` is enough.
- `exec.agent.session.header.cwd` — a fixed fake path (`/project`); never the repo's real cwd (tests must not write `.planning/` into the real workspace).
- `node:child_process` `execFileSync` in `lib/ship.js:19-21` and `lib/map-codebase.js:60-65` — tool tests avoid these by failing before the git path (e.g. `gsd_ship` preflight fails on missing VERIFICATION.md, `test/tools.test.mjs:159-166`); when git behaviour itself must be tested, add a fake `child_process` via module mocking rather than running real git.

**What NOT to Mock:**
- `lib/_shared.js` functions — test the real implementations (`test/_shared.test.mjs` imports them directly).
- `GsdState` methods — exercise the real class against `FakeFs`; the service is the unit under test in `test/state.test.mjs`.
- `defineTool` from `@deepseek-ai/dsh-tools` — the peer dep is available in dev; `registerTool`'s `assert.ok(t, …)` confirms every plugin's `apply` actually registers the named tool with a valid schema (this is the automated version of the README's manual "every plugin module loads and its `apply` registers its tools" smoke check).

## Fixtures and Factories

**Test Data:** all fixtures live in `test/helpers/project.mjs` and are named exports:

- `REQS` — two requirements `{ id, text, complete }` (`test/helpers/project.mjs:6-9`), used by `buildProject`.
- `FENCED_PLAN` — a PLAN.md with `---` fences, full frontmatter (`phase`, `plan`, `type`, `wave`, `depends_on`, `files_modified`, `autonomous`, `requirements`, `gap_closure: true`), and `<objective>`/`<context>`/`<tasks>` body (`test/helpers/project.mjs:11-34`). The canonical plan shape.
- `FENCELESS_PLAN` — a PLAN.md *without* `---` fences, exercising `parseFrontmatter`'s fenceless-tolerance path (`lib/_shared.js:58-77`), with a nested `must_haves.truths` block list (`test/helpers/project.mjs:36-61`).
- `FENCED_SUMMARY` / `FENCELESS_SUMMARY` — SUMMARY.md with `status: complete` frontmatter (`test/helpers/project.mjs:63-73`).
- `VERIFICATION_PASSED` — `status: passed`, `score: 2/2` (`test/helpers/project.mjs:75-81`); drives the closed-phase gate and ship preflight tests.
- `VERIFICATION_GAPS` — `status: gaps_found`, `score: 1/2` (`test/helpers/project.mjs:83-88`); available for re-verification scenarios.

**Factories:**
- `buildProject(fs, cwd = "/project")` (`test/helpers/project.mjs:90-98`) — the project factory. Returns a ready `GsdState` instance. Always use this; never construct `.planning/` files by hand.
- `makeSvc(fs)` (`test/state.test.mjs:21-23`) — thin wrapper `new GsdState(stateCtx(fs), {})` for the service tests.
- `awaitBuild(fs)` (`test/state.test.mjs:161-163`) — `buildProject` alias for readability.

When adding a new fixture, add it as a named export in `test/helpers/project.mjs` next to the existing ones and keep it a string literal matching the real artefact schema (frontmatter keys are snake_case; body uses the `<tag>` block convention the orchestrators parse).

## Coverage

**Requirements:** None enforced — no coverage tool is configured, no coverage threshold in CI. The suite is a regression net for the specific bugs the bundle has hit (fenceless frontmatter, gap-closure boolean mismatch, plan/summary filename mismatch, stale progress counters, command-injection base-branch, closed-phase gate regex). New tests should pin any bug you fix, not chase line coverage.

**View Coverage:** Not configured. If adopted later, prefer the built-in, zero-dependency option: `node --test --experimental-test-coverage test/*.test.mjs` (matches the stack — do not add a coverage dependency).

## Test Types

**Unit Tests:**
- Scope: `lib/_shared.js` pure functions — frontmatter parse/stringify round-trips, ROADMAP/REQUIREMENTS parse/stringify, `slugify`, `zeroPad`, `matchesGapClosure`, `isValidRef`, `isClosedPhase` (`test/_shared.test.mjs`). These are dependency-free and the highest-value layer; round-trip property-style tests (`parseFrontmatter(stringifyFrontmatter(fm))` recovers `fm`) are the natural fit.
- Scope: `lib/state.js` `GsdState` against `FakeFs` — artefact naming (`writeArtifact`/`readArtifact`/`hasArtifact`), `listPlans`/`planIndex`, progress counters (`markPlanSummary`/`completePhase`/`recomputeProgress`), requirement traceability (`markRequirementComplete`), `planningRoot` accessor (`test/state.test.mjs`).

**Integration Tests:**
- Scope: tool-level `execute` flows with a fake `subagents` service — `gsd_discuss` writes CONTEXT.md and advances STATE to `plan`; `gsd_execute --gaps-only` filters and runs plans; `gsd_plan` closed-phase gate (reject without `force`, plan with `force`); `gsd_ship` preflight failure on missing VERIFICATION.md; `gsd_status` rendering; `gsd_map_codebase` full/fast/force/paths modes (`test/tools.test.mjs`). These exercise the real tool `execute` through the real `GsdState` and the real `defineTool` schema validation, with only the subagent spawn faked.
- The hard dependency ordering (Discuss → Plan → Execute → Verify → Ship) is the behavioural contract these tests lock in. Add an integration test whenever a tool gains a new flag or a new routing branch.

**E2E Tests:**
- Not used. A full live mount requires the DSH host (`dsh plugin add` into a profile + a live session with a real model and real git/gh) — out of scope for the in-repo suite. The README calls the live mount the next manual validation step; treat that as manual/CLI validation, not automated E2E. Do not add a dependency on a harness runtime to run tests.

## Common Patterns

**Async Testing:** every `execute` is async; tests `await` it and assert on the returned string plus the artefact files the orchestrator wrote (`fs.files.has(...)`, then `await svc.readState(...)` to assert STATE advanced). The fake `fs` is async (`await ctx.fs.stat(t)`), so a synchronous `Map` lookup wrapped in `async` is the implementation (`test/helpers/fake-fs.mjs`). Use `await` for every `fs`/`svc`/tool call — the suite is fully `async`.

**Error Testing:** assert thrown errors via `assert.rejects` for the async guard clauses:
```javascript
await assert.rejects(() => t.execute({ phase: 1 }, exec), /force=true/);
await assert.rejects(() => t.execute({ phase: 1 }, exec), /no VERIFICATION\.md/);
await assert.rejects(() => t.execute({ fast: true, focus: "bogus" }, exec), /focus|VALID_ARGS|must be one of/i);
```
(`test/tools.test.mjs:149,164,210`). The guard strings are stable and worth pinning; when you change one, grep the test files for the old wording and update both. For pure-function error paths, `assert.equal(fn(bad), false)` is the idiom (`test/_shared.test.mjs:134-137,148-153`).

**Frontmatter Round-Trip:** the central property test for `lib/_shared.js` — assert `parseFrontmatter(stringifyFrontmatter(fm)).frontmatter` preserves values through `coerceScalar`, including nested `progress:` objects, flow arrays, booleans, numbers, and quoted strings with colons/spaces (`test/_shared.test.mjs:22-39,75-80`). When you extend the frontmatter subset, add a round-trip case here first.

**Fenceless Tolerance:** a dedicated case pins that a PLAN.md written *without* `---` fences still yields its frontmatter (`requirements`, `wave`, `type`, `gap_closure`, `files_modified`, nested `must_haves.truths`) and that the body after the leading key/value block is correct (`test/_shared.test.mjs:41-73`). This guards the real failure mode where a subagent omits the fences.

**Counter Consistency:** the progress-counter tests pin that `total_plans`/`completed_plans` and `total_phases`/`completed_phases`/`percent` stay consistent after `markPlanSummary`, `completePhase`, and `recomputeProgress` (`test/state.test.mjs:105-148`). Each was a real bug (counters left stale); keep these green when touching `progress` handling in `lib/state.js`.

**Filename Agreement:** `writeArtifact("PLAN-01")` must land at `<base>-01-PLAN.md` and `listPlans`'s glob must find the same file (`test/state.test.mjs:25-36`). This is the read/write agreement test — keep it whenever you touch `_artifactFile` (`lib/state.js:364-368`).

---

*Testing analysis: 2026-08-23*
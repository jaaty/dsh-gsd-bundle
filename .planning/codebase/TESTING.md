# Testing Patterns

**Analysis Date:** 2026-08-22

## Test Framework

**Runner:** None detected. No test files exist anywhere in the repository (no `*.test.*`, `*.spec.*`), no test runner config (`jest.config.*`, `vitest.config.*`, `mocha`, etc.), no test scripts in `package.json` (see `package.json:1-60` — there is no `scripts` section at all), and no test tooling in `dependencies` or `peerDependencies` (`package.json:53-58`).

**Status:** The codebase is a pre-verification plugin bundle. The README's Status section states the validation performed to date is "every plugin module loads and its `apply` registers its tools with valid schemas; the `cordis.patch.yml` merges cleanly" (`README.md:110`) — i.e. smoke-checking by hand, not automated tests.

**Assertion Library:** Not applicable — no test tooling present.

**Run Commands:** None exist. When tests are introduced, the convention to follow is a `scripts` block added to `package.json`; the natural runner for this ESM/no-deps codebase is Node's built-in test runner (`node --test`) since there are zero runtime dependencies and no build step.

## Test File Organization

**Location:** Not yet established (no tests). The repository has no `test/` or `__tests__/` directories — `lib/` is the only source directory. When tests are added, the least-invasive options given the flat layout are:

- Co-located: `lib/_shared.test.js` next to `lib/_shared.js` (matches the plugin-bundle packaging — `files: ["lib/*.js"]` in `package.json:43-47` would need extending to include test files if they ship, or tests can live at repo root).
- Or a root `test/` directory mirroring `lib/` (avoids shipping tests in the published bundle).

**Naming:** `*.test.js` (Node test runner convention). No precedent exists in the repo.

## Test Structure

**Suite Organization:** No suites exist. When writing tests, the idiomatic Node test runner shape is:

```javascript
import { test, describe } from "node:test";
import assert from "node:assert/strict";
```

**Patterns:**
- **What to unit test first (pure functions, zero deps):** `lib/_shared.js` is the most valuable target — `slugify`, `zeroPad`, `nowIso`, `today`, `parseFrontmatter`/`stringifyFrontmatter` (round-trip), `parseRoadmap`/`stringifyRoadmap`, `parseRequirements`/`stringifyRequirements`, `textToBlocks`/`blocksToText`. These are pure, dependency-free, and encode the opengsd artefact schemas — round-trip property tests (`parseFrontmatter(stringifyFrontmatter(fm)) === fm`) are the natural fit.
- **`lib/_runner.js` helpers** are also pure and testable: `planningContext` (block wrapping, truncation at `maxPerFile = 60000`) and `cwdOf` (fallback to `process.cwd()`).
- **`lib/state.js` `GsdState`** requires an `fs` host service (`inject: ["fs"]`, `lib/state.js:459`) plus a Cordis `ctx`. To test it without a harness, inject a fake `ctx.fs` implementing `resolve/processPath/stat/readText/writeText/listDir` and a no-op `ctx.provide` — the class reads all fs through `this.ctx.fs` (`lib/state.js:44-66`), so a mock with in-memory maps makes the whole service testable. `_phaseDirName`, `planIndex`, `listPlans`, `writeArtifact`/`readArtifact` round-trips are the highest-value cases.
- **Tool-level tests** (each plugin's `execute`) need a `ctx` with `tools.register`, `get("gsdState")`, `get("subagents")`, and `get("tools")`, plus an `exec` object shaped like `{ agent: { session: { header: { cwd } } }, signal }`. The `spawnSubagent` call (`lib/_runner.js:8-32`) is the natural seam to stub: `ctx.get("subagents")` returning a fake with `getProvider("spawn")` and a `start()` that resolves a `{ result, dispose }`. **Do not spawn real agents in tests.**

## Mocking

**Framework:** None (no test framework installed). When added, the convention should be hand-written fakes/stubs — no mocking library — to preserve the zero-dependency principle.

**Patterns:**
- `subagents` service seam — a test double for `lib/_runner.js:9-20`:
  ```js
  const fakeSubagents = {
    getProvider: (name) => (name === "spawn" ? { spawn: true } : undefined),
    start: async (provider, req) => ({
      result: { output: [{ type: "text", text: "## VERIFICATION PASSED" }], stopReason: "stop" },
      dispose: () => {},
    }),
  };
  ```
- `ctx.fs` fake for `GsdState` (see above) — implement `resolve` (identity), `processPath` (identity), `stat` (path→exists boolean), `readText`, `writeText`, `listDir` against a `Map<string,string>`.

**What to Mock:**
- `ctx.get("subagents")` + `ctx.get("tools")` + `ctx.get("gsdState")` host services — always.
- `exec.agent.session.header.cwd` — use a temp dir per test; never the repo itself (tests must not write `.planning/` into the real workspace).
- `node:child_process` `execSync` in `lib/ship.js:19-27` — stub to assert the git/gh invocation strings without running them (e.g. return `""` from `gitOk` for the clean-tree gate).

**What NOT to Mock:**
- `lib/_shared.js` functions — test the real implementations.
- `defineTool` from `@deepseek-ai/dsh-tools` — the peer dep is available in a dev environment; schema validation of every tool's `parameters` against the harness expectations is a high-value test (this is exactly what README.md:110 claims was manually verified).

## Fixtures and Factories

**Test Data:** no fixtures exist. Recommended minimal fixture set, matching the artefact shapes defined in the README and `lib/state.js`:

- A `.planning/` fixture tree: `PROJECT.md`, `ROADMAP.md` (phase table), `REQUIREMENTS.md`, `STATE.md` with the full frontmatter from `_freshState()` (`lib/state.js:133-160`), `config.json`.
- A parsed `parseFrontmatter` fixture: the exact `---\nkey: value\n---` shape handled by `lib/_shared.js:51-87`.

**Factories:** the schema builders in `package.json` give the canonical shapes (`requirements: { id, text }`, `phases: { name, goal, requirements }` at `package.json:24-45` for `gsd_init`).

## Coverage

**Requirements:** None enforced — no coverage tool configured, no `scripts` block in `package.json`.

**View Coverage:** Not applicable until tooling is added. If adopted: `node --test --experimental-test-coverage` (built-in, zero deps, matches the stack) rather than a new dependency.

## Test Types

**Unit Tests:**
- Scope: `lib/_shared.js` (parsing/stringify round-trips), `lib/_runner.js` (prompt assembly + truncation), `lib/state.js` `GsdState` (with fake `ctx.fs`).
- This is the achievable and highest-value layer today.

**Integration Tests:**
- Scope: tool-level tests for the phase sequencing — e.g. `gsd_discuss` writes CONTEXT.md then `gsd_state` STATE advances to `plan`; `gsd_plan` with a fake researcher/planner output writes PLAN.md files and advances STATE to `execute`. These need the fake `subagents` + a temp `.planning/` tree. The tools' hard dependency ordering (Discuss → Plan → Execute → Verify → Ship) is the behavioural contract to lock in.

**E2E Tests:**
- Not used. A full live mount requires the DSH host (`dsh plugin add` into a profile + session), which README.md:110 calls out as the next validation step — treat that as manual/CLI validation, not automated E2E.

## Common Patterns

**Async Testing:** every tool `execute` is async; tests should `await` the execute and assert on the returned string plus the written artefact files. The `fs` fakes are async (`await ctx.fs.stat(t)`, `lib/state.js:51-54`) — a synchronous `Map` lookup wrapped in `async` works.

**Error Testing:** assert thrown errors via `assert.throws`/`rejects` for the guard clauses — e.g. calling `gsd_execute` outside a project must reject with `/gsd_execute: no \.planning/ project/` (`lib/execute.js:38`); calling `gsd_discuss` for a phase not in ROADMAP must reject with `/phase 99 not in ROADMAP/` (`lib/discuss.js:75`). These guard strings are stable and worth pinning.

**Frontmatter Round-Trip:** for `lib/_shared.js`, property-style tests asserting `stringifyFrontmatter(parseFrontmatter(text).frontmatter)` preserves values through `coerceScalar` (`lib/_shared.js:32-43`), including quoted strings, arrays, booleans, and the nested `progress:` block.

---

*Testing analysis: 2026-08-22*

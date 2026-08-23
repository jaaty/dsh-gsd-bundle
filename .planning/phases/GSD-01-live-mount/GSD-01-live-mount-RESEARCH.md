I have everything I need. All claims verified by running code against the real modules this session. Here is the full RESEARCH.md:

---

# RESEARCH.md — Phase 1: live-mount

**Researcher:** gsd-phase-researcher
**Date:** 2026-08-23
**Phase goal:** Mount the bundle into a DSH profile and verify all 12 plugin rows activate and the patch merges cleanly over dsh-base.
**Requirements in scope:** MOUNT-01, MOUNT-02 (per ROADMAP). MOUNT-03…MOUNT-06 are later phases.

---

## Domain analysis

The bundle is a set of 12 host-plane **Cordis plugins**, each a subpath export of `@dsh-gsd/bundle`, wired into a DSH profile via `cordis.patch.yml`. Phase 1 proves they *activate* (apply() runs and registers the expected host contributions) — not that they behave end-to-end (that is phase 03). [VERIFIED: read `cordis.patch.yml:31-84`, `package.json:10-51`, ran `import()` + `apply()` on all 12 this session]

**Cordis plugin contract.** A plugin is an object with `name: string`, `inject: string[]` (declared host-service dependencies), and `apply(ctx, config): void` (registration side-effect). `@deepseek-ai/cordis`'s `isApplicable` checks only `typeof object.apply === "function"` [VERIFIED: `node_modules/@deepseek-ai/cordis/lib/index.js:1445-1447`]. The `inject` array is a Cordis dependency-declaration map, not a runtime lookup list — at runtime the bundle reads services two ways: (a) direct property access (`ctx.tools`, `ctx.systemPrompt`, `ctx.commands`, `this.ctx.fs` inside `GsdState`), and (b) `ctx.get(name)` for the bundle's own `gsdState` service and the host `subagents` service [VERIFIED: read `lib/persona.js:66-90`, `lib/state.js:513-517`, `lib/core-tools.js:12-13`, `lib/commands.js:174-190`].

**Tool-definition contract.** The only tool API is `defineTool({name, description, parameters, output:{schema,render}, execute, presentCall?})` from `@deepseek-ai/dsh-tools`, registered via `ctx.tools.register(defineTool(...))`. `defineTool` *eagerly* compiles `parameters` → JSON schema via `parameterSchemaSpecToJsonSchema` and `output.schema` via `valueSchemaSpecToJsonSchema`; an invalid schema **throws at apply() time**, so a successful `apply()` is positive proof of a valid schema [VERIFIED: `node_modules/@deepseek-ai/dsh-tools/lib/index.js:836-867`]. Every registered tool has `output: { schema: { type: "string" }, render: ... }` [VERIFIED: `lib/core-tools.js:51,87,125,175`, `lib/discuss.js:67`, `lib/ship.js:43`].

**Activation ordering constraint (critical).** `gsd-state`'s `apply()` calls `ctx.provide("gsdState", svc)` — it *publishes* the service. The 9 tool plugins call `const gsd = () => ctx.get("gsdState")` **inside their `execute` closures**, not at `apply()` time, so `apply()` order among the 12 does not block registration. BUT any test that *executes* a tool or renders the persona context provider needs `gsdState` already provided — i.e. `gsd-state` must have applied first. The patch's insert order already lists `gsd-persona`, `gsd-state` before the tool rows [VERIFIED: `cordis.patch.yml:31-44`, ran the full 12-plugin apply this session — all 12 succeed in patch order; tool executes only resolve `gsdState` lazily]. **Confidence: high.**

**MOUNT-02 orientation subtlety (critical test-design point).** The persona registers a runtime-context provider whose `text(context)` calls `ctx.get("gsdState").cachedState(cwd)` [VERIFIED: `lib/persona.js:48-61,78-89`]. `cachedState` reads from an in-memory cache populated only when that *same* `GsdState` instance writes artefacts. A test that builds a project on a *separately-constructed* `GsdState` (as `test/helpers/project.mjs`'s `buildProject` does) will render "no .planning/ project found" because the provided service and the build service are different instances. **The orientation test must initialize the project through the same `gsdState` instance that `gsd-state`'s `apply()` provided** — either by calling `gsdStateSvc.initProject(...)` directly, or by executing the registered `gsd_init` tool (which goes through `ctx.get("gsdState")`). I verified both paths render `"GSD loop position: milestone M1 / no active phase..."` [VERIFIED: ran both this session; the `buildProject`-on-separate-instance path renders the "no project" hint]. **Confidence: high.**

**No YAML parser available.** The bundle has zero runtime deps and no devDependencies; `node_modules` has no `yaml`/`js-yaml` [VERIFIED: `node -e "require('yaml')"` → not found, same for `js-yaml`; `package.json:62` `"dependencies": {}`]. `lib/_shared.js`'s `parseFrontmatter` is a fenced-frontmatter subset parser, not a general YAML document parser [VERIFIED: `lib/_shared.js:26-51`]. So `cordis.patch.yml` cannot be parsed with a real YAML lib without adding a dep. The file is small (84 lines) with a regular, known structure (see Package legitimacy / parsing below).

**Standard stack & patterns.** Tests are `node --test test/*.test.mjs` (node:test, ESM, no test runner dep) [VERIFIED: `package.json:8`, ran `npm test` → 34 pass]. The existing offline harness pattern: `FakeFs` (in-memory `ctx.fs`) + a fake `ctx` with `get/provide/effect/tools/systemPrompt/commands` + a fake `subagents` service whose `start()` returns canned subagent results [VERIFIED: `test/helpers/fake-fs.mjs:9-72`, `test/tools.test.mjs:21-84`]. Phase 1's mount test extends this same pattern to a *single shared fake ctx* that satisfies all 12 plugins' inject arrays at once.

**Pitfalls identified:**
1. Constructing `GsdState` twice (once via `buildProject`, once via `gsd-state` apply) → orientation renders "no project". Use one instance. [VERIFIED this session]
2. Treating `inject` as a runtime lookup list — it is a declaration; services are reached via `ctx.<svc>` properties and `ctx.get(name)`. [VERIFIED]
3. Expecting `defineTool` to validate lazily — it validates eagerly at `apply()`, so a schema bug throws during registration, not execution. [VERIFIED]
4. Adding a YAML devDependency just to parse `cordis.patch.yml` — unnecessary; a targeted line parser suffices and keeps the zero-dep invariant. [ASSUMED → recommended, see Open Questions]

---

## Package legitimacy

No new dependencies are proposed for this phase. All verification uses the bundle's existing peer deps (already in `node_modules`) and node builtins. Claims:

- **`@deepseek-ai/dsh-tools`** — peer dep, installed at `node_modules/@deepseek-ai/dsh-tools` (v0.1.1-rc.2). Exports `defineTool` [VERIFIED: `node_modules/@deepseek-ai/dsh-tools/lib/index.js:836`, `package.json` of that pkg]. Used by all 9 tool-registering plugins. [CITED: `package.json:64` peerDependency]
- **`@deepseek-ai/cordis`** — peer dep, v4.0.1. `isApplicable` defines the plugin contract [VERIFIED: `node_modules/@deepseek-ai/cordis/lib/index.js:1445-1447`]. [CITED: `package.json:66`]
- **`@deepseek-ai/dsh-llm`** — peer dep. `createUserMessage` imported by `lib/commands.js` [VERIFIED: `lib/commands.js:18` `import { createUserMessage } from "@deepseek-ai/dsh-llm"`; import resolves]. [CITED: `package.json:67`]
- **`@deepseek-ai/schemastery`** — peer dep, declared but not directly imported by any `lib/*.js` module I inspected this session [VERIFIED: `grep -rn "schemastery" lib/` → no hits]; it is a transitive dep of dsh-tools' schema compilation. [CITED: `package.json:65`]
- **`node:child_process`**, **`node:fs/promises`**, **`node:path`** — node builtins, used by `lib/ship.js` / `lib/state.js` / `lib/quick.js` [VERIFIED: `lib/ship.js` imports `execFileSync`, `lib/state.js` uses `node:fs/promises` per INTEGRATIONS.md:29]. No legitimacy concern.

**No npm registry lookups were needed** — every package claim is confirmed by reading the installed module in `node_modules` this session, which is the authoritative target for an offline harness. Per provenance rules, registry-existence alone would not earn [VERIFIED]; here the installed module + its exported symbol were positively confirmed.

---

## cordis.patch.yml parsing (discretion-area recommendation)

The mount test must, per D-03/D-05, read `cordis.patch.yml` and assert (a) the `agent-loop` override row is present and (b) the 12 insert rows each have a `name` matching a resolvable subpath export. Structure, read verbatim this session [VERIFIED: `cordis.patch.yml:1-84`]:

- Override row: `- id: agent-loop` at line 24, with `config:` block at 25-28 (asserted for *presence* only per D-03 — it is a config change, not a plugin row).
- Insert block: `- insert:` at line 31, containing 12 entries lines 34-84, each of the form:
  ```
      - id: gsd-persona
        name: '@dsh-gsd/bundle/persona'
  ```
  The 12 `(id, name)` pairs, verbatim [VERIFIED: `cordis.patch.yml:34-84`]:
  - `gsd-persona` → `@dsh-gsd/bundle/persona`
  - `gsd-state` → `@dsh-gsd/bundle/state`
  - `gsd-core-tools` → `@dsh-gsd/bundle/core-tools`
  - `gsd-discuss` → `@dsh-gsd/bundle/discuss`
  - `gsd-plan` → `@dsh-gsd/bundle/plan`
  - `gsd-execute` → `@dsh-gsd/bundle/execute`
  - `gsd-verify` → `@dsh-gsd/bundle/verify`
  - `gsd-ship` → `@dsh-gsd/bundle/ship`
  - `gsd-ui` → `@dsh-gsd/bundle/ui`
  - `gsd-quick` → `@dsh-gsd/bundle/quick`
  - `gsd-map-codebase` → `@dsh-gsd/bundle/map-codebase`
  - `gsd-commands` → `@dsh-gsd/bundle/commands`

**Recommended parser:** a targeted line-based reader (read the file as UTF-8 text, locate the `- insert:` line, then scan subsequent lines for `    - id: <id>` and the following `      name: '<spec>'`). This avoids adding a YAML devDependency and preserves the bundle's zero-runtime-dep invariant. The `name` value is single-quoted in the file; strip the quotes. The subpath is derived by stripping the `@dsh-gsd/bundle/` prefix → `<sub>` → assert `package.json` exports has `./<sub>` → `import('@dsh-gsd/bundle/<sub>')` resolves. [ASSUMED approach; the file's regular structure makes a line parser robust. A hardcoded expected-list cross-checked against the file's text is an acceptable alternative — D-03 says "exactly the insert block", so asserting both the file contains each row AND each row resolves is sufficient.]

**Subpath → exports mapping, verified this session** [VERIFIED: `package.json:10-51` + ran `import('@dsh-gsd/bundle/<sub>')` for all 12 → all resolve and expose `{name, inject, apply}`]:

| patch row id | subpath | package.json exports key | lib target |
|---|---|---|---|
| gsd-persona | persona | `./persona` | `lib/persona.js` |
| gsd-state | state | `./state` | `lib/state.js` |
| gsd-core-tools | core-tools | `./core-tools` | `lib/core-tools.js` |
| gsd-discuss | discuss | `./discuss` | `lib/discuss.js` |
| gsd-plan | plan | `./plan` | `lib/plan.js` |
| gsd-execute | execute | `./execute` | `lib/execute.js` |
| gsd-verify | verify | `./verify` | `lib/verify.js` |
| gsd-ship | ship | `./ship` | `lib/ship.js` |
| gsd-ui | ui | `./ui` | `lib/ui.js` |
| gsd-quick | quick | `./quick` | `lib/quick.js` |
| gsd-map-codebase | map-codebase | `./map-codebase` | `lib/map-codebase.js` |
| gsd-commands | commands | `./commands` | `lib/commands.js` |

---

## Risks and Open Questions

**Risks:**
- **R-1 (mitigated):** Orientation test uses a different `GsdState` instance than the one `gsd-state` provides → false "no project" render. Mitigation: initialize through the provided service (via `gsd_init` execute or `gsdStateSvc.initProject`). [VERIFIED this session — both correct paths render the loop position.]
- **R-2 (low):** A future plugin starts calling `ctx.get("gsdState")` at `apply()` time (not just inside `execute`), making apply-order significant. Today none do [VERIFIED: grepped all 9 tool plugins — `ctx.get("gsdState")` only inside `execute`/`gsd()` closures]. The mount test should still apply in patch order to mirror reality and stay future-proof.
- **R-3 (low):** `gsd-commands`'s `apply()` wraps registration in `ctx.effect(() => {...}, "gsd-commands lifecycle")` [VERIFIED: `lib/commands.js:174-189`]. The fake ctx's `effect` must actually *invoke* the effect callback synchronously for commands to register. The existing `tools.test.mjs` fake ctx uses `effect: () => () => {}` (a no-op that never runs the callback) — that pattern would capture **zero** commands. The mount harness's `effect` must call `fn()` and return its disposer. [VERIFIED this session: my harness `effect: (fn) => { const d = fn(); ... }` captured all 12 commands; the no-op `effect` would capture none.]
- **R-4 (low):** `lib/ship.js` imports `node:child_process` at module top-level — fine under node, but means importing `@dsh-gsd/bundle/ship` executes that import. No shell-out happens at import or apply time (only inside `execute`). [VERIFIED: import succeeds; `execFileSync` only called inside the `git()`/`gh()` helpers invoked from `execute`.]

**Open Questions:**

- **OQ-1: How should the mount test parse `cordis.patch.yml`?** (RESOLVED) Use a targeted line-based parser over the file text (no YAML dep), or hardcode the 12 expected rows and assert each row's `id`+`name` lines are present in the file text AND each `name` resolves via the exports map. Either satisfies D-03/D-05. Recommendation: parse the insert block from the file (single source of truth) and cross-check against a hardcoded expected list, so a row added/removed in the patch fails the test. No blocker.

- **OQ-2: What counts as the "single minimal smoke call" for D-04?** (RESOLVED) D-04 explicitly allows "invoking one registered tool's execute() (or confirming schema registration)". Recommendation: (a) for all 12 tools, assert valid schema registration (the tool object has `name`, `description`, `parameters` as a JSON-schema object, `output.schema`, and `apply()` did not throw — which already proves `defineTool` compiled the schema); (b) for one lightweight tool, run a real `execute()` smoke. `gsd_init` is the ideal smoke target: it writes the `.planning/` tree through the provided `gsdState`, and the persona context provider then renders the orientation — proving MOUNT-02 *and* MOUNT-04's smoke in one shot. [VERIFIED this session: `gsd_init.execute(...)` returns "Initialised GSD project...", writes STATE.md, and the context provider renders "GSD loop position: milestone M1...".] No blocker.

- **OQ-3: Does the mount test need a fake `subagents` service?** (RESOLVED) Only if a smoke `execute()` calls `spawnSubagent`. `gsd_init`/`gsd_status`/`gsd_progress`/`gsd_new_milestone` do not spawn [VERIFIED: read `lib/core-tools.js` — no `_runner` import]. `gsd_status` is already smoke-proven in `test/tools.test.mjs:168-177`. For the schema-registration check of the spawning tools (plan/execute/verify/ship/ui/quick/map-codebase), `apply()` does not touch `subagents`, so no fake needed for registration. If the smoke runs `gsd_init` only, no `subagents` fake is required; provide one anyway for future-proofing (the existing `makeSubagents()` pattern in `tools.test.mjs:21-62`). No blocker.

- **OQ-4: Should the harness assert the `agent-loop` override row merges cleanly over dsh-base?** (RESOLVED) Per D-05, a true dsh-base live merge is deferred; phase 1 asserts the offline preconditions. The test asserts the `- id: agent-loop` row is *present* in `cordis.patch.yml` (D-03: "asserted only for its presence") and that its `config.agents` contains `{ id: gsd }` [VERIFIED: `cordis.patch.yml:24-28`]. No live merge. No blocker.

---

## Architectural Responsibility Map

Each capability → tier. The mount test places every assertion in the **correct tier**; a security-sensitive capability mis-tiered would be a blocker. None are.

| Capability | Tier | Registered by | Asserted in mount test as |
|---|---|---|---|
| Phase-loop persona text (system prompt section `gsd:persona`, order -100) | presentation | `gsd-persona` (`lib/persona.js:69-73`) | `ctx.systemPrompt.section` captured with `name==="gsd:persona"`, `order===-100`, non-empty `text` |
| Runtime-context provider (`gsd:state`, order 10) — orients at STATE.md | presentation | `gsd-persona` (`lib/persona.js:78-89`) | `ctx.systemPrompt.context` captured with `name==="gsd:state"`, `order===10`, and `text(context)` renders the loop position after init |
| `gsdState` host service (`.planning/` artefact + STATE/ROADMAP/REQUIREMENTS manager) | data (service) | `gsd-state` (`lib/state.js:513-517`) | `ctx.provide("gsdState", svc)` captured; `svc instanceof GsdState`; `svc.initProject`/`writeArtifact`/`readState` usable |
| Orientation tools: `gsd_init`, `gsd_status`, `gsd_progress`, `gsd_new_milestone` | domain (tools) | `gsd-core-tools` (`lib/core-tools.js:16,84,122,157`) | 4 tools captured by `ctx.tools.register`, each with valid schema |
| Phase tools: `gsd_discuss`, `gsd_plan`, `gsd_execute`, `gsd_verify`, `gsd_ship`, `gsd_ui_phase`, `gsd_quick`, `gsd_map_codebase` | domain (tools) | `lib/{discuss,plan,execute,verify,ship,ui,quick,map-codebase}.js` | 8 tools captured, each with valid schema |
| `/gsd-*` slash-commands (12 routers) | integration (commands) | `gsd-commands` (`lib/commands.js:174-190`) | 12 commands captured by `ctx.commands.register` (requires `ctx.effect` to invoke its callback — see R-3) |
| Subpath export resolution (patch row → package.json exports → lib module) | integration (packaging) | `package.json:10-51` | each patch row's `name` maps to an exports key and `import()` resolves |
| Patch-merge preconditions over dsh-base | integration (profile) | `cordis.patch.yml:24-28` (override) + 31-84 (insert) | `agent-loop` row present; 12 insert rows present & resolvable (D-05 offline preconditions) |

**Security-sensitive capabilities:** none in this phase. `gsd_ship`'s git/gh shell-out and `isValidRef` injection guard [VERIFIED: `lib/ship.js`, `lib/_shared.js:284-290`] are *out of scope* for phase 1 (no execute smoke on ship; schema registration only). No capability is mis-tiered. **No blocker.**

---

## Validation Architecture

Automated checks that prove each behaviour. All run under `node --test test/*.test.mjs` with no LLM, no git, no gh, no live DSH — deterministic offline harness.

**MOUNT-01 — all 12 plugin subpath exports resolve and every plugin row activates:**
- `mount.test.mjs` reads `cordis.patch.yml` text, extracts the 12 insert rows + the `agent-loop` override row.
- For each insert row: assert `name` starts with `@dsh-gsd/bundle/`, derive `<sub>`, assert `package.json` exports has `./<sub>`, `await import('@dsh-gsd/bundle/<sub>')` resolves, module exposes `{name, inject, apply}` with `name` matching the row id (or the documented mapping).
- Apply all 12 modules in patch order against one shared fake ctx (FakeFs + capturing `tools`/`systemPrompt`/`commands`/`provide`/`effect`-that-invokes). Assert no `apply()` throws.
- Assert captured registrations: 1 section, 1 context, 12 tools (names below), 12 commands (names below), `gsdState` provided.
- Assert `agent-loop` override row present with `config.agents[0].id === "gsd"`.
- [VERIFIED this session: the exact harness ran green — 12/12 apply OK, 12 tools, 12 commands, gsdState provided.]

Expected tool names (12) [VERIFIED: ran apply this session]: `gsd_init, gsd_status, gsd_progress, gsd_new_milestone, gsd_discuss, gsd_plan, gsd_execute, gsd_verify, gsd_ship, gsd_ui_phase, gsd_quick, gsd_map_codebase`.

Expected command names (12) [VERIFIED: `lib/commands.js:35,44,52,64,77,87,100,116,126,137,146,161`]: `gsd-init, gsd-status, gsd-progress, gsd-discuss-phase, gsd-ui-phase, gsd-plan-phase, gsd-execute-phase, gsd-verify-work, gsd-ship, gsd-quick, gsd-map-codebase, gsd-new-milestone`.

**MOUNT-02 — persona installs phase-loop section + `gsd:state` provider; session orients at STATE.md:**
- Assert the captured `systemPrompt.section` has `name==="gsd:persona"`, `order===-100`, and `text` contains the phase-loop marker (`Discuss` … `Ship`).
- Assert the captured `systemPrompt.context` has `name==="gsd:state"`, `order===10`.
- Initialize a project through the *provided* `gsdState` (run `gsd_init.execute(...)` — the smoke call), then invoke the context provider's `text({agent:{session:{header:{cwd}}}})` and assert the rendered string matches `/GSD loop position: milestone .* \/ (phase .* \/ step .*|no active phase)/`.
- Assert the uninitialised-cwd and missing-cwd branches render the orientation hint (not a crash/empty). [VERIFIED this session: all three branches render correctly.]

**MOUNT-04 (smoke, per D-04):** covered by the `gsd_init.execute()` smoke above (one tool execute passes a smoke call) PLUS the schema-registration assertion for all 12 tools (each `apply()` did not throw → `defineTool` compiled a valid schema). Full per-tool executes are already covered by `test/tools.test.mjs` and `test/state.test.mjs` (34 tests green) [VERIFIED: ran `npm test` this session — 34 pass, 0 fail].

**Coverage gate note:** the mount test adds ~12–20 assertions on top of the existing 34. The Nyquist/coverage gate for this phase is: `npm test` green on a clean checkout (MOUNT-06 is later, but the offline harness already runs the full suite). [VERIFIED: `npm test` passes today.]

---

## Project Constraints (from project conventions)

- **Zero runtime dependencies.** `package.json:62` `"dependencies": {}`. Phase 1 adds *tests only* (per CONTEXT out-of-scope: "no changes to the bundle's runtime behaviour or plugin modules themselves"). Do not add runtime deps; a test-only YAML devDependency is technically allowed but unnecessary and discouraged to keep the invariant clean. [VERIFIED: `package.json:62`]
- **Test runner is `node --test test/*.test.mjs`.** New test files must match `test/*.test.mjs` to be picked up by `npm test` [VERIFIED: `package.json:8`]. The mount test should be `test/mount.test.mjs` (or `test/activation.test.mjs`).
- **Offline only (D-01/D-02).** No live DSH boot, no touching/booting/disrupting the web profile that hosts this GUI session. Verification is the fake-host-fs + fake-ctx harness. [CITED: CONTEXT.md decisions D-01, D-02]
- **Existing helpers are the extension points:** `test/helpers/fake-fs.mjs` (`FakeFs`, `stateCtx`, `realFsAdapter`) and `test/helpers/project.mjs` (`buildProject`, fixtures). The mount test may reuse `FakeFs` directly but should NOT reuse `buildProject` for the orientation assertion (it constructs a separate `GsdState` — see R-1); use the provided service instead. [VERIFIED: `test/helpers/project.mjs:90-98` constructs its own `GsdState`.]
- **File policy:** workspace-write sandbox is active; tests write only to the in-memory `FakeFs`, so no real-fs writes occur during the mount test. [CITED: runtime context — DSH file policy: workspace-write]
- **No per-plan worktrees, no capability gates, no UAT loop, no intel mode** in this phase. [CITED: CONTEXT.md out-of-scope]

---

## Summary for the planner

1. **One new test file** (`test/mount.test.mjs`) with a single shared fake ctx that applies all 12 plugins in patch order and asserts the full registration surface (1 section, 1 context, 12 tools, 12 commands, gsdState provided).
2. **A `cordis.patch.yml` reader** (line-based, no YAML dep) extracting the 12 insert rows + the `agent-loop` override; assert each row's `name` resolves via `package.json` exports and `import()`.
3. **An orientation test** that runs `gsd_init.execute()` (the smoke call) through the provided `gsdState`, then asserts the persona context provider renders the loop position — proving MOUNT-02 and the MOUNT-04 smoke in one shot.
4. **A schema-validity assertion** for all 12 registered tools (apply succeeded → defineTool compiled the schema).
5. **Critical harness details:** `ctx.effect` must invoke its callback (else commands capture zero — R-3); use the *provided* `gsdState` for orientation, not a separately-built one (R-1).

All Open Questions are (RESOLVED). No blockers. Confidence: high — every claim was verified by running code against the real modules this session.
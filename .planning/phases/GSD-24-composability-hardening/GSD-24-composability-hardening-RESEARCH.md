I have everything needed. Here is the complete RESEARCH.md.

---

# Phase 24: composability-hardening — Research

**Researched:** 2026-08-29
**Phase goal:** Effect-scope the background-job live registry to its owning fiber and declare the subagents coeffect in every consuming plugin so temporal and spatial composability hold for the job runtime and subagent paths.
**Requirements:** DEGR-06, DEGR-07

---

## Domain analysis

### 1. The thing to effect-scope: `lib/jobs.js` module-level `live` Map

The background-job live registry is currently a **module-level singleton** in `lib/jobs.js`:

- `const live = new Map();` — `lib/jobs.js:33` [VERIFIED: read this session]
- Shell entries: `live.set(entry.id, { kind: "shell", handle: child })` — `lib/jobs.js:79` [VERIFIED]
- Subagent entries: `const rec = { controller: ac, timedOut: false, cancelled: false, dispose: run.dispose }; live.set(entry.id, { kind: "subagent", handle: rec });` — `lib/jobs.js:121-122` [VERIFIED]
- The subagent `.then` is the ONLY removal point: `live.delete(entry.id)` at `lib/jobs.js:167` (settle) and `lib/jobs.js:170` (catch) [VERIFIED]

Because `live` is module-level, it is **not tied to any fiber lifecycle**. Unloading/HMR of the `core-tools` plugin (which owns the `gsd_job` surface) does not cancel running jobs — the detached children and in-process subagents keep running, and the registry leaks. This is the temporal-composability gap DEGR-06 closes. [ASSUMED → confirmed by reading the module: no `ctx.effect`/disposer anywhere in `lib/jobs.js`]

**Confidence: HIGH** — the singleton and its shape are read directly.

### 2. The pattern to mirror: `lib/state.js` service + effect-cleanup

`lib/state.js` already demonstrates the exact service + effect-cleanup pattern:

```js
function apply(ctx, config) {
  const svc = new GsdState(ctx, config);
  ctx.provide("gsdState", svc);
  ctx.effect(() => () => svc._cache.clear(), "gsdState.cache.clear");
}
```
— `lib/state.js:667-671` [VERIFIED]

The jobs runtime should mirror this: a service object provided under a stable key, whose `apply` registers a `ctx.effect` disposer that cancels all running jobs on unload/HMR. [CITED: the in-repo pattern at `lib/state.js:667-671`]

**Confidence: HIGH** — the pattern is in-repo and read directly.

### 3. Cordis reactivity model (the coeffect semantics)

Verified against the actual `@deepseek-ai/cordis` source in `node_modules`:

- **`ctx.get(name, strict=true)`** reads a service from the store **without** the inject requirement (non-reactive). `_getImpl` returns `undefined` when the providing fiber is not active (`impl.fiber.state !== 2`). — `node_modules/@deepseek-ai/cordis/lib/index.js:762-771` [VERIFIED]
- **`ctx.inject(inject, callback)`** is sugar for `ctx.plugin({ inject, apply: callback })` — it starts a **sub-fiber**. — `index.js:1599-1605` [VERIFIED]
- A fiber whose declared inject key has no impl stays **inactive**: `_refresh()` sets `epoch = INACTIVE` when any inject key's `_store[name]` is missing, and `_setEpoch(INACTIVE)` triggers `_unload()` (the apply callback never runs). — `index.js:1316-1342` [VERIFIED]
- **`ctx.provide(name, value)`** registers a service owned by the current fiber as an auto-tracked revertible effect; its disposer unregisters on unload. — `index.js:799-822` [VERIFIED]
- **`ctx.effect(fn)`** registers an effect on the current fiber; the returned disposer runs on unload. — `index.js:337` (fiber.effect), `index.js:614` (ctx.effect) [VERIFIED]

**Implication for DEGR-07:** declaring `'subagents'` in a plugin's top-level `inject` array makes that plugin's fiber stay inactive when the host `subagents` service is absent (reactive coeffect activation/deactivation). Declaring it in a sub-fiber via `ctx.inject(['subagents'], cb)` scopes the coeffect to just that sub-fiber. [VERIFIED: cordis fiber state machine]

**Confidence: HIGH** — read directly from the installed cordis source.

### 4. The sub-fiber coeffect pattern already in-repo

`lib/commands.js` already uses `ctx.inject([capKey, "commands"], (subCtx) => ...)` to scope each `/gsd-*` command to its owning step capability (DEGR-03). — `lib/commands.js:200-216` [VERIFIED]

This is the exact pattern D-05 wants for `core-tools`' `gsd_job` tool: wrap the `gsd_job` registration in `ctx.inject(['subagents'], (subCtx) => subCtx.tools.register(...))` so only `gsd_job` deactivates when `subagents` is absent, while `gsd_init`/`gsd_status`/`gsdOrient`/`gsdJobs` stay active. [CITED: in-repo pattern at `lib/commands.js:200-216`]

**Confidence: HIGH** — read directly.

### 5. The six subagent-driven plugins

All six currently declare `inject = ["gsdState", "tools"]` and read `ctx.get("subagents")` at execute time, throwing if absent:

| Plugin | inject (current) | subagents read | throw on absent |
|---|---|---|---|
| `lib/plan.js` | `["gsdState","tools"]` (line 17) | line 50 | line 51 |
| `lib/execute.js` | `["gsdState","tools"]` (line 34) | line 59 | line 60 |
| `lib/verify.js` | `["gsdState","tools"]` (line 17) | line 39 | line 40 |
| `lib/quick.js` | `["gsdState","tools"]` (line 15) | line 43 | line 44 |
| `lib/ui.js` | `["gsdState","tools"]` (line 14) | line 36 | line 37 |
| `lib/map-codebase.js` | `["gsdState","tools"]` (line 34) | line 154 | line 155 |

[VERIFIED: read this session]

D-04 adds `'subagents'` to each of these inject arrays. Because these plugins are entirely subagent-driven (their tools throw if `subagents` is absent), a hard required coeffect is safe — the fiber simply stays inactive when the host service is absent. [CITED: CONTEXT D-04]

**Confidence: HIGH** — read directly.

### 6. `core-tools` is the only production consumer of `jobs.js`

`lib/core-tools.js:8` imports `{ reconcileJobs, launchJob, cancelJob, retryJob }` from `./jobs.js`. The call sites:
- `gsd_status` calls `reconcileJobs(ctx, s, cwd)` — `lib/core-tools.js:180` [VERIFIED]
- `gsd_job` calls `launchJob`/`cancelJob`/`retryJob`/`reconcileJobs` — `lib/core-tools.js:345, 357, 365, 375` [VERIFIED]

`test/jobs.test.mjs` also imports the jobs.js functions directly (line 15). [VERIFIED]

**Implication:** the jobs runtime service is naturally owned by `core-tools` (which owns the `gsd_job` surface and the `gsd_status` reconcile call). Both tools live in `core-tools`' `apply` closure, so they can capture the runtime service directly (or via `ctx.get('gsdJobsRuntime')`). [ASSUMED → confirmed by the import graph]

**Confidence: HIGH** — read directly.

### 7. The fake mount harness and the `subagents` coeffect test

The offline harness `test/helpers/mount-harness.mjs`:
- `makeMountCtx` builds a fake ctx with `provided` Map, `get`, `provide`, `effect`, and `inject`. [VERIFIED]
- `ctx.get('subagents')` is **special-cased**: it returns the supplied `subagents` service/factory, or `makeSubagents()` by default — it is NEVER stored in `provided`. — `mount-harness.mjs:101-108` [VERIFIED]
- `ctx.inject(injectKeys, callback)` checks `(k) => k !== "commands" && !provided.has(k)`; if any non-commands key is missing, the sub-fiber stays inactive. — `mount-harness.mjs:124-131` [VERIFIED]

**CRITICAL FINDING:** because `subagents` is never in `provided`, a `gsd_job` sub-fiber with `ctx.inject(['subagents'], ...)` would be **permanently inactive** in the current harness — `provided.has('subagents')` is always `false`. To test the DEGR-07 reactive behaviour (sub-fiber active when subagents present, inactive when absent), the harness's `ctx.inject` must be extended to treat `'subagents'` as a controllable key — e.g. add it to `provided` when a subagents service is supplied, or special-case it like `'commands'`. This is a required harness change, not optional. [VERIFIED: read `mount-harness.mjs:101-131`]

**Confidence: HIGH** — read directly.

### 8. Top-level inject is NOT enforced by the fake harness

`applySubset` calls `mod.apply(ctx, config)` directly, ignoring the module's `inject` array. — `mount-harness.mjs:139-152` [VERIFIED]

So the DEGR-07 top-level inject change (adding `'subagents'` to the six plugins) is proven by **static assertions** (read `mod.inject`, assert it includes `'subagents'`), not by the fake harness's fiber machinery. This matches the CONTEXT deferred note: "Enforcing top-level plugin inject in the fake mount harness (static assertions + the existing ctx.inject sub-fiber enforcement suffice for this phase)." [CITED: CONTEXT deferred]

**Confidence: HIGH** — read directly.

### 9. The unload-cancel semantics (DEGR-06 D-03)

On unload/HMR, the cleanup effect must cancel every running job:
- **Subagent:** abort the job-owned `AbortController` (`rec.handle.controller.abort()`), set `cancelled = true`, clear the timeout timer.
- **Shell:** kill the detached child (`rec.handle.kill()`).
- **Manifest:** best-effort write `'cancelled'` to the persisted async-jobs manifest for each, swallowing failures (unload may be tearing down gsdState).

Two gaps in the current live-record shape must be resolved for this to work:
1. **The timeout timer is a local variable** in `startSubagentRun` (`lib/jobs.js:125-135`), NOT stored in the live record. To clear it on unload, the subagent record must carry the timer handle (e.g. `rec.timer`).
2. **The live record has no `cwd`** — the manifest write needs `cwd` (and the gsdState `s`) to target the right `.planning/async-jobs.json`. The record must carry `cwd` (and ideally `s`).

[VERIFIED: read `lib/jobs.js:121-135`]

**Confidence: HIGH** — read directly.

### 10. The subagent `.then` invariant must be preserved

D-02: "The subagent `.then` remains the ONLY place a subagent entry is removed." On unload, `cancelAll` must NOT delete subagent entries — it sets `cancelled = true` and aborts, letting the `.then` settle (which writes the terminal status and removes the entry). For shell jobs there is no `.then`; `cancelAll` kills the child and writes `'cancelled'` directly (mirroring `cancelJob` at `lib/jobs.js:198-202`). [CITED: CONTEXT D-02; VERIFIED: `lib/jobs.js:167-170, 198-202`]

**Confidence: HIGH** — read directly.

---

## Package legitimacy

This phase introduces **no new runtime dependencies**. All work is in-repo (jobs runtime refactor, inject declarations, harness/test changes). The only external references are:

- **`@deepseek-ai/cordis`** — already a peerDependency (`package.json:66`). The `ctx.effect`/`ctx.inject`/`ctx.provide`/`ctx.get` semantics are verified against the installed source at `node_modules/@deepseek-ai/cordis/lib/index.js`. [VERIFIED: read this session]
- **`@deepseek-ai/dsh-tools`** — already a peerDependency (`package.json:64`), used for `defineTool`. Not changed this phase. [VERIFIED: `package.json:64`]
- **`@deepseek-ai/dsh-subagent` / `dsh-subagent-spawn-in-process`** — the host `subagents` service providers, referenced only in error messages (`lib/_runner.js:10-12`). Not a dependency of this bundle; the coeffect merely declares the host service. [VERIFIED: `lib/_runner.js:10-12`]

No new package is proposed, so no registry verification is required. [ASSUMED → no new dependency introduced]

---

## Risks

1. **Harness `ctx.inject` cannot represent `subagents` presence (BLOCKER if unaddressed).** The DEGR-07 reactive test (sub-fiber active when subagents present, inactive when absent) requires the fake harness's `ctx.inject` to treat `'subagents'` as a controllable key. Currently `provided.has('subagents')` is always `false`, so a `gsd_job` sub-fiber would be permanently inactive. **Mitigation:** extend `makeMountCtx`'s `ctx.inject` to special-case `'subagents'` (like `'commands'`) or to add it to `provided` when a subagents service is supplied. [VERIFIED: `mount-harness.mjs:101-131`]

2. **Timeout timer not in the live record.** `cancelAll` cannot clear timeout timers unless the subagent record carries the timer handle. **Mitigation:** store `rec.timer = timeoutTimer` in `startSubagentRun`, clear it in the `.then` and in `cancelAll`. [VERIFIED: `lib/jobs.js:125-135`]

3. **Live record lacks `cwd` for the manifest write.** `cancelAll` needs `cwd` (and `s`) to write `'cancelled'` to the right manifest. **Mitigation:** extend the live record to carry `cwd` (and `s`), set at `startRun`/`startSubagentRun`. [VERIFIED: `lib/jobs.js:79, 121-122`]

4. **Double-write race on subagent unload.** If `cancelAll` writes `'cancelled'` directly AND the `.then` later settles, both write `'cancelled'` — consistent, but the planner must decide the order (abort/kill first, then best-effort manifest write) and accept the `.then`'s authoritative write may supersede. [ASSUMED → derived from D-03 + D-02]

5. **`gsd_status` reconcile call must keep working.** `gsd_status` calls `reconcileJobs(ctx, s, cwd)` at `lib/core-tools.js:180`. After the refactor, this call must pass the runtime (or its live map). Since `gsd_status` is in `core-tools`' `apply` closure, it can capture the runtime directly. [VERIFIED: `lib/core-tools.js:180`]

6. **`test/jobs.test.mjs` imports jobs.js functions directly.** The signature refactor (adding a runtime param) will break these imports unless the tests are updated to construct a runtime. The planner must include a jobs.test.mjs update. [VERIFIED: `test/jobs.test.mjs:15`]

---

## Open Questions

- **OQ-1 (RESOLVED):** How does `cancelAll` clear timeout timers when they are local variables in `startSubagentRun`? → **RESOLVED:** extend the subagent live record to carry the timer handle (`rec.timer`), set in `startSubagentRun` (`lib/jobs.js:125-135`), cleared in the `.then` and in `cancelAll`. [VERIFIED: `lib/jobs.js:125-135`]

- **OQ-2 (RESOLVED):** How does `cancelAll` write `'cancelled'` to the right manifest without `cwd` in the live record? → **RESOLVED:** extend the live record to carry `cwd` (and the gsdState `s` reference), set at `startRun`/`startSubagentRun`. `cancelAll` iterates the live map and, per entry, aborts/kills + clears timer + best-effort `s.updateJob(cwd, id, { status:'failed', reason:{ reason:'cancelled', detail:'cancelled on unload' } })`, swallowing failures. [VERIFIED: `lib/jobs.js:79, 121-122`; CITED: CONTEXT D-03]

- **OQ-3 (RESOLVED):** How does the fake harness represent `subagents` presence for the DEGR-07 reactive test? → **RESOLVED:** extend `makeMountCtx`'s `ctx.inject` to treat `'subagents'` as a controllable key — either add it to `provided` when a subagents service is supplied, or special-case it like `'commands'`. The reactive test passes `subagents: null` to assert the `gsd_job` sub-fiber stays inactive, and a subagents service to assert it activates. [VERIFIED: `mount-harness.mjs:101-131`]

- **OQ-4 (RESOLVED):** Where do the static inject assertions live? → **RESOLVED:** extend `test/mount.test.mjs` (which already asserts `Array.isArray(mod.inject)` at line 208) with assertions that the six subagent-driven plugins' inject includes `'subagents'`, and add a reactive test (in `mount.test.mjs` or a new file) for the `gsd_job` sub-fiber. [VERIFIED: `test/mount.test.mjs:208`]

- **OQ-5 (RESOLVED):** Does the jobs runtime service live in `jobs.js` or a new module? → **RESOLVED:** keep it in `jobs.js` as a `createJobsRuntime(ctx)` factory (or export the live-map creation), mirroring the domain-module pattern. `core-tools`' `apply` creates it, provides it via `ctx.provide('gsdJobsRuntime', runtime)`, and registers `ctx.effect(() => () => runtime.cancelAll(), ...)`. [CITED: CONTEXT D-01; VERIFIED: `lib/state.js:667-671`]

- **OQ-6 (RESOLVED):** What is the exact service key name? → **RESOLVED:** executor's call (Claude's Discretion), e.g. `'gsdJobsRuntime'`, distinct from the `gsdJobs` capability key. [CITED: CONTEXT D-01]

All Open Questions are **RESOLVED**; planning may proceed.

---

## Architectural Responsibility Map

| Capability | Tier | Notes |
|---|---|---|
| Jobs live registry (`live` Map) | **Domain** | Pure in-memory run registry; must be owned by a per-fiber runtime service, not a module singleton. |
| Job lifecycle (launch/cancel/retry/reconcile/schedule) | **Domain** | `lib/jobs.js` functions; receive the runtime (or its live map) as a parameter. |
| Unload-cancel cleanup (`cancelAll`) | **Domain** | Best-effort teardown; aborts/kills + clears timers + best-effort manifest write. Never throws. |
| Jobs runtime service provision | **Integration** | `core-tools` `apply` provides `gsdJobsRuntime` via `ctx.provide` + registers `ctx.effect` disposer. |
| `gsd_job` tool | **Presentation** | Interactive launch surface; delegates to jobs.js domain API. |
| `gsd_status` reconcile | **Presentation** | Calls `reconcileJobs` before rendering; must pass the runtime. |
| Subagents coeffect (top-level) | **Integration** | Six subagent-driven plugins declare `'subagents'` in inject. |
| Subagents coeffect (sub-fiber) | **Integration** | `core-tools` scopes `'subagents'` to the `gsd_job` sub-fiber via `ctx.inject`. |

**Security-sensitive check:** No capability is misplaced. The unload-cancel cleanup (a security-relevant teardown that kills child processes and aborts subagents) is correctly placed in the **domain** tier (jobs.js `cancelAll`), invoked from the **integration** tier (core-tools' `ctx.effect` disposer). No security-sensitive capability sits in the presentation tier. **No BLOCKER.** [ASSUMED → derived from the responsibility map]

---

## Validation Architecture

Automated checks that prove each behaviour (offline, FakeFs + fake-ctx, no live DSH boot):

**DEGR-06 (unload-cancel):**
- **Test A — subagent controller aborted on unload:** mount `core-tools` (with a fake subagents service whose `start` returns a run whose `result` never settles and whose `signal` records `abort`), launch a subagent job, capture the runtime's `ctx.effect` disposer, invoke it, assert the controller was aborted and the manifest reflects `'cancelled'`. [CITED: CONTEXT D-06]
- **Test B — shell child killed on unload:** launch a shell job (real child via `realFsAdapter`), capture the disposer, invoke it, assert the child was killed and the manifest reflects `'cancelled'`. [CITED: CONTEXT D-06]
- **Test C — best-effort, never throws:** invoke the disposer when gsdState is absent/tearing down; assert no throw. [CITED: CONTEXT D-03]

**DEGR-07 (subagents coeffect):**
- **Test D — static inject assertions:** assert each of the six subagent-driven plugins' `inject` includes `'subagents'`, and `core-tools`' `gsd_job` sub-fiber declares it. [CITED: CONTEXT D-06]
- **Test E — reactive sub-fiber activation/deactivation:** with the harness's `ctx.inject` extended to represent `subagents`, assert the `gsd_job` sub-fiber stays inactive when `subagents` is absent and activates when present. [CITED: CONTEXT D-06]

**Regression:**
- **Test F — jobs.test.mjs updated:** the existing jobs integration suite (real child processes) must be updated for the new jobs.js signatures and still pass. [VERIFIED: `test/jobs.test.mjs:15`]
- **Test G — full `npm test`:** `node --test test/*.test.mjs` passes on a clean checkout (MOUNT-06). [CITED: `package.json:8`]

---

## Project Constraints

- **Offline only:** tests use FakeFs + fake-ctx; no live DSH boot, no LLM/git/gh. [CITED: CONTEXT domain]
- **No new dependencies:** all work is in-repo. [ASSUMED → no new package proposed]
- **Preserve the subagent `.then` removal invariant** (D-02): `cancelAll` must not delete subagent entries. [CITED: CONTEXT D-02]
- **Best-effort teardown, never a throw** (D-03): the unload cleanup swallows all failures. [CITED: CONTEXT D-03]
- **`gsd_status` must never throw** over an absent/malformed capability or ledger (phase-22 D-07/D-06). [CITED: `GSD-22-CONTEXT.md` D-07]
- **Graceful degradation** (phase-22 D-03): `gsd_init`/`gsd_status`/`gsdOrient`/`gsdJobs` stay active when `subagents` is absent; only `gsd_job` deactivates. [CITED: CONTEXT D-05; `GSD-22-CONTEXT.md` D-03]
- **`state.js` stays a pure artifact model** (no ctx, no capability knowledge) — the jobs runtime service is NOT added to state.js; it lives in jobs.js/core-tools. [CITED: `GSD-22-CONTEXT.md` D-05]

---

*Phase: 24-composability-hardening*
*Researched: 2026-08-29*
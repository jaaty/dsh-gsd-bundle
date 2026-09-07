I've completed the research and written the file to `.planning/phases/GSD-55-quick-batch/GSD-55-quick-batch-RESEARCH.md`. Here is the full RESEARCH.md contents:

---

# Phase 55: quick-batch — Research

**Goal:** Run multiple quick tasks in a single batch with per-task results.
**Requirement:** CLH-05.
**Researched:** 2026-09-07.

---

## 1. Domain analysis

### 1.1 What this phase is (and is not)

This phase adds a **new** `gsd_quick_batch` tool plus a `/gsd-quick-batch` slash command that runs **multiple** quick tasks in one batch. It is a **sequential** loop over the existing single-task `gsd_quick` machinery — each task spawns one fresh-context subagent, writes its own `.planning/quick/<date>-<slug>/TASK.md`, commits atomically, and reports a per-task result. It is **additive**: the existing single-task `gsd_quick` behaviour is untouched (D-01). It is **not** parallel (D-03), has **no** batch-level record/commit (deferred), and does **not** touch fast-mode / mvp-phase / node-repair (deferred, phases 56–58).

### 1.2 The single-task template to mirror (lib/quick.js)

`lib/quick.js` is the exact template. Its `apply(ctx)` does, in order [VERIFIED: lib/quick.js:24-75]:

1. `ctx.provide("gsdQuick", buildCapability("gsdQuick"))` — publishes the capability (DEGR-01).
2. `ctx.tools.register(defineTool({ name: "gsd_quick", ... }))` — registers the tool.
3. In `execute(args, exec)`:
   - `const cwd = cwdOf(exec)` [VERIFIED: lib/quick.js:40, lib/_runner.js:98-100].
   - Guards: `const s = gsd(); if (!s) throw ...` and `const subagents = ctx.get("subagents"); if (!subagents) throw ...` [VERIFIED: lib/quick.js:41-44].
   - `const slug = slugify(args.slug || args.task)`; `const dir = ${s.planningRoot(cwd)}/quick/${today()}-${slug}` [VERIFIED: lib/quick.js:45-46].
   - `const r = await spawnSubagent(ctx, exec, { label: \`quick ${slug}\`, promptText: \`${QUICK_PROMPT}\n\nTASK: ${args.task}\` })` [VERIFIED: lib/quick.js:48].
   - Builds the `entry` markdown (`# Quick task <date>-<slug>`, `**Task:**`, `**Run:**`, `## Result`, `r.output || "(no output)"`) [VERIFIED: lib/quick.js:51-60].
   - `await s.writeQuickRecord(cwd, \`${today()}-${slug}\`, entry)` — routes through the GsdState artefact model (ctx.fs), never raw fs (DUR-06) [VERIFIED: lib/quick.js:64, lib/state.js:574-576].
   - `await commitArtifacts(cwd, null, { scope: "quick", message: \`docs(planning): quick ${today()}-${slug}\` })` — best-effort, never throws [VERIFIED: lib/quick.js:69].
   - `if (s.isProject) { try { await s.addDecision(cwd, \`quick ${today()}-${slug}: ${args.task}\`); } catch {} }` — best-effort decision-line [VERIFIED: lib/quick.js:70].
   - Returns a string `gsd_quick done (...). Recorded at <dir>/TASK.md.\n\n<output>` [VERIFIED: lib/quick.js:72].

The batch is a **`for` loop** over this body, one iteration per task, with three additions: (a) slug-collision dedup across the batch (D-06), (b) per-task try/catch for failure isolation (D-04/D-09), and (c) a structured per-task result list + batch summary return (D-08).

### 1.3 The spawn seam (lib/_runner.js)

`spawnSubagent(ctx, exec, { label, promptText, outputSchema })` returns `{ output, stopReason, diagnostic, structured }` [VERIFIED: lib/_runner.js:8-32]. It throws if the `subagents` service or the `spawn` provider is unavailable [VERIFIED: lib/_runner.js:10-12]. It passes `signal: exec.signal` so cancellation propagates [VERIFIED: lib/_runner.js:17]. The batch reuses this verbatim per task; a spawn failure is caught and recorded as `failed` (D-09), not thrown.

### 1.4 The commit seam (lib/_git-artifacts.js)

`commitArtifacts(cwd, phaseNum, opts, gitFn)` stages `.planning` **wholesale** and commits; it **never throws** — no-git / nothing-staged / add / commit failures are swallowed into a `warning` [VERIFIED: lib/_git-artifacts.js:174-201]. `phaseNum` may be `null` with an `opts.message` override (the quick path passes `null` + a message) [VERIFIED: lib/_git-artifacts.js:167-175]. Because the batch runs **sequentially**, each task's `commitArtifacts` stages only the new `.planning` changes since the previous commit — so per-task atomic commits are safe with no working-tree collision (this is exactly why D-03 forbids parallelism).

### 1.5 The record model (lib/state.js)

`writeQuickRecord(cwd, dateSlug, entry)` writes `.planning/quick/<dateSlug>/TASK.md` via `this._write` → `ctx.fs` (never raw `node:fs/promises`), missing/parent-tolerant [VERIFIED: lib/state.js:574-576]. `addDecision(cwd, line)` appends to STATE.md decisions [VERIFIED: lib/state.js:322-326]. `planningRoot(cwd)` returns the `.planning` root [VERIFIED: lib/state.js:64]. `isProject(cwd)` gates the decision-line write [VERIFIED: lib/quick.js:70].

### 1.6 Capability + command registration

- **Capability:** `lib/_capabilities.js` holds `CAPABILITY_KEYS` (a frozen array) and a `TABLE` of descriptors; `buildCapability(key)` validates and freezes a descriptor; `allCapabilities()` maps every key; `capabilityForTool(tool)` maps a tool name back to its capability key [VERIFIED: lib/_capabilities.js:32-57, 337-375]. The existing `gsdQuick` descriptor is `{ step: "quick", role: "alternate", tools: ["gsd_quick"], commands: ["gsd-quick"], order: 25 }` [VERIFIED: lib/_capabilities.js:152-162].
- **Command:** `lib/commands.js` holds a `COMMANDS` array; each entry has `{ name, description, hint?, build(raw) }`. `apply(ctx)` pairs each command to its owning capability via `commandToCapability` (built from `allCapabilities()`), then registers each command in a sub-fiber that injects the owning capability + `commands` — so a command is only registered when its capability is present (DEGR-03) [VERIFIED: lib/commands.js:404-437]. The existing `gsd-quick` command is at [VERIFIED: lib/commands.js:243-251].

### 1.7 The persona / render layer (lib/_render.js, lib/persona.js)

`renderPersonaBody(descriptors)` renders one "why this step exists" paragraph per **present** capability, keyed by capability key in `STEP_PARAGRAPHS` [VERIFIED: lib/_render.js:197-220]. `renderAvailableSteps(descriptors)` lists loop steps ascending by `order` as `- <step>: <key> (order <order>)` [VERIFIED: lib/_render.js:135-143]. `stepToKey(step)` returns the **first** capability key whose `step` matches [VERIFIED: lib/_render.js:42-48]. `gsd_quick` is mentioned in the persona's scoping-discipline tail, gated on `present("gsdQuick")` [VERIFIED: lib/_render.js:228-235].

**Implication for a new `gsdQuickBatch` capability:** if it shares `step: "quick"` (per D-01 "under the quick step"), `renderAvailableSteps` will emit a second `- quick: gsdQuickBatch (order 25)` line (cosmetic duplicate), and `stepToKey("quick")` still resolves to `gsdQuick` (first match) — no routing break, since `"quick"` is not in `NEXT_ACTION_TO_STEP` [VERIFIED: lib/_render.js:29-39]. The persona loop only renders a paragraph if `STEP_PARAGRAPHS[key]` exists, so **not** adding a `gsdQuickBatch` paragraph cleanly reuses `gsdQuick`'s paragraph and avoids a duplicate. This is the recommended approach (see OQ-3).

### 1.8 Standard patterns & pitfalls

- **Sequential subagent loop:** the batch is a plain `for...of` with `await` per task. No `Promise.all` (D-03 forbids it to avoid git/working-tree collisions).
- **Failure isolation:** wrap each task's spawn+record+commit in try/catch; on error, still write a TASK.md with the error and mark `status: "failed"`, then `continue`. The batch-level return must not throw on individual failure (D-08).
- **Slug collision:** `slugify` truncates to 48 chars and collapses non-alphanumerics to `-` [VERIFIED: lib/_shared.js:5-12], so distinct tasks can collide (e.g. "fix typo" vs "fix  typo"). Maintain a `Set` of used slugs; on collision append `-2`, `-3`, … (D-06).
- **Output schema deviation:** `gsd_quick` returns a **string** (`output: { schema: { type: "string" }, render: (_a, v) => [{ type: "text", text: v }] }`) [VERIFIED: lib/quick.js:38]. The batch must return a **structured object** (D-08), so its `output.schema` is an object schema and its `render` formats the object to text. This is a deliberate deviation from the single-task template.
- **Validation of input:** D-02 requires a `tasks` array of `{ task, slug? }`. The tool should validate `Array.isArray(tasks) && tasks.length >= 1` and throw on malformed input (mirroring the fail-loud guard style of `gsd_quick`'s service guards).
- **presentCall:** `gsd_quick` uses `presentCall: (a) => ({ card: "generic", title: "gsd quick", kind: "other", rawInput: { slug: slugify(a.slug || a.task) } })` [VERIFIED: lib/quick.js:74]. The batch should present the list of task slugs.

### 1.9 Confidence levels

- Sequential loop over `spawnSubagent`/`writeQuickRecord`/`commitArtifacts`: **HIGH** — every seam is read this session and quoted above.
- Capability/command registration surface: **HIGH** — `_capabilities.js` and `commands.js` read in full.
- Test-count breakage from a new capability key: **HIGH** — exact assertions quoted in §3.
- Exact `defineTool` object-schema syntax for the structured output: **MEDIUM** — `gsd_quick` only shows a string schema; the object-schema shape follows schemastery conventions but is not exercised in-repo. [ASSUMED]

---

## 2. Package legitimacy

**No new external dependencies are required.** The batch reuses only in-repo modules already imported by `lib/quick.js`:

- `@deepseek-ai/dsh-tools` — `defineTool` [VERIFIED: lib/quick.js:8; package.json peerDependencies:136].
- `@deepseek-ai/schemastery` — the tool schema runtime (peer dep) [VERIFIED: package.json:137].
- `@deepseek-ai/cordis` — the plugin host (peer dep) [VERIFIED: package.json:138].
- `@deepseek-ai/dsh-llm` — `createUserMessage` used by the command layer [VERIFIED: lib/commands.js:15; package.json:139].

All are already declared peerDependencies [VERIFIED: package.json:135-140] and already used by the shipped bundle. **No registry lookup is needed** — nothing new is proposed. If the planner chooses a **new plugin file** (`lib/quick-batch.js`), it adds a `package.json` `exports` entry and a `cordis.patch.yml` row, but still imports only the same in-repo modules. [ASSUMED: no new package]

---

## 3. Risks and Open Questions

### 3.1 Risks

**R-1 (HIGH — will break tests): adding a new capability key `gsdQuickBatch` breaks hard-coded count/list assertions.** The capability surface is asserted in several tests that must be updated in the same phase:

- `test/mount.test.mjs:159` — `assert.ok(CAPABILITY_KEYS.length === 24, ...)` → **25**.
- `test/mount.test.mjs:147` — `ctx.tools.length === 33` → **34** (adds `gsd_quick_batch`).
- `test/mount.test.mjs:148` — `ctx.commands.length === 30` → **31** (adds `gsd-quick-batch`).
- `test/mount.test.mjs:110-117` — `EXPECTED_TOOL_NAMES` array needs `"gsd_quick_batch"`.
- `test/mount.test.mjs:120-132` — `EXPECTED_COMMAND_NAMES` array needs `"gsd-quick-batch"`.
- `test/_capabilities.test.mjs:13` — `assert.equal(CAPABILITY_KEYS.length, 24)` → **25**; and the key list at `test/_capabilities.test.mjs:14-39` needs `"gsdQuickBatch"`.
- `test/render.test.mjs:44` — the `LOOP_ORDER` array needs `"gsdQuickBatch"` (it is a loop-role capability).

All quoted verbatim this session. The planner MUST include these test updates in the plan or `npm test` fails.

**R-2 (LOW): duplicate `quick` step in `renderAvailableSteps`.** If `gsdQuickBatch` shares `step: "quick"`, `gsd_status` lists two `- quick:` lines. Cosmetic only; no routing break (see §1.7). Mitigation: do **not** add a `STEP_PARAGRAPHS` entry for `gsdQuickBatch` (reuse `gsdQuick`'s paragraph), and accept the duplicate line, or give the batch a distinct step label. D-01 says "under the quick step", so the duplicate is the faithful reading.

**R-3 (LOW): `commitArtifacts` stages `.planning` wholesale.** A task's subagent could theoretically touch other `.planning` files (e.g. STATE.md via `addDecision`), which would ride into that task's commit. This is **identical** to single `gsd_quick` behaviour and is acceptable; it is not a new risk introduced by the batch.

**R-4 (LOW): structured output schema.** The batch's `output.schema` is an object (not a string like `gsd_quick`). The `render` function must format the object to text. If the schema is malformed, `defineTool`/schemastery may reject registration — the planner should keep the schema minimal (a `results` array + a `summary` object) and test the happy path.

**R-5 (LOW): failure-isolation test needs a canned failure.** The existing canned subagent handler in `test/service-tools.test.mjs:70-73` returns success for any `label.startsWith("quick")`. To test failure isolation, the test must make one task's spawn throw (e.g. a task whose slug triggers a throw in the canned handler, or a dedicated handler branch). The planner should extend the canned handler.

### 3.2 Open Questions (all RESOLVED)

**OQ-1 — Where does `gsd_quick_batch` live: same `lib/quick.js` plugin or a new plugin file?**
**RESOLVED:** Add it to **`lib/quick.js`** (same plugin, same `inject: ["gsdState", "tools", "subagents"]`, same `apply`). Rationale: the batch is additive to the quick step, reuses the exact same seams, and this avoids a new `cordis.patch.yml` row and a new `package.json` export. The plugin then provides **two** capabilities (`gsdQuick` and `gsdQuickBatch`) via two `ctx.provide` calls — `ctx.provide` is callable multiple times. [ASSUMED: no constraint forbids a plugin providing two capabilities; the mount harness mounts by patch-row `sub`, and `lib/quick.js` is already the `gsd-quick` row's `sub` [VERIFIED: test/helpers/mount-harness.mjs:47].]

**OQ-2 — Does the batch accept a single task (one-item batch) or require ≥2?**
**RESOLVED:** Accept **≥1** (a single task is a valid one-item batch). D-02 requires a `tasks` array; the simplest, most flexible contract is `tasks.length >= 1`. Throw only on a non-array or empty array. [ASSUMED: no requirement forces ≥2; a one-item batch is a degenerate but valid case.]

**OQ-3 — How to handle the duplicate `quick` step in the persona/status render?**
**RESOLVED:** Give `gsdQuickBatch` `step: "quick"`, `role: "alternate"`, `order: 25` (mirroring `gsdQuick`), and **do not** add a `STEP_PARAGRAPHS` entry for it — the persona reuses `gsdQuick`'s paragraph. Accept the cosmetic duplicate `- quick: gsdQuickBatch (order 25)` line in `renderAvailableSteps`. This is the faithful reading of D-01 ("under the quick step") and keeps the persona clean. [ASSUMED: the duplicate line is acceptable; it is informational only.]

**OQ-4 — What is the structured return shape (D-08)?**
**RESOLVED:** Return an object:
```
{
  results: [ { slug, status: "done"|"failed", output?: string, error?: string } ],
  summary: { total, done, failed }
}
```
`output.schema` is an object schema; `render` formats it to a readable text block (one line per task + a summary line). [ASSUMED: this shape satisfies D-08's "per-task result list (slug, status, output/error) plus a batch summary".]

**OQ-5 — Exact wording of the TASK.md failure section and the per-task result summary (Claude's Discretion).**
**RESOLVED:** On failure, write a TASK.md with `## Result` replaced by `## Error` containing the caught error message, and set the result entry's `status: "failed"` + `error`. The per-task summary line is `- <slug>: done` / `- <slug>: failed: <short error>`. [ASSUMED: consistent with the existing `## Result` convention in `lib/quick.js:57-59`.]

---

## 4. Architectural Responsibility Map

| Capability | Tier | Where it lives | Notes |
|---|---|---|---|
| Batch orchestration (sequential loop, per-task spawn/record/commit) | **Integration** | `lib/quick.js` `apply()` → `gsd_quick_batch.execute()` | Reuses `spawnSubagent` (integration seam), `writeQuickRecord` (data), `commitArtifacts` (integration/git). |
| Subagent spawning | **Integration** | `lib/_runner.js` `spawnSubagent` | Already the single seam; batch calls it per task. |
| Record persistence | **Data** | `lib/state.js` `writeQuickRecord` / `addDecision` | Routes through `ctx.fs` (DUR-06). Batch must NOT bypass it. |
| Atomic commit | **Integration** | `lib/_git-artifacts.js` `commitArtifacts` | Best-effort, never throws; per-task sequential commits. |
| Slug derivation + collision dedup | **Domain** | `lib/_shared.js` `slugify` + a batch-local `Set` | Pure logic; unit-testable. |
| Capability descriptor | **Domain** | `lib/_capabilities.js` `gsdQuickBatch` | Pure descriptor; no I/O. |
| Slash-command routing | **Presentation** | `lib/commands.js` `gsd-quick-batch` | Thin router → injects a user message to run `gsd_quick_batch`. |
| Persona/status render | **Presentation** | `lib/_render.js` | Reuses `gsdQuick` paragraph; no new paragraph. |

**Security-sensitive capability in the wrong tier?** None. The batch is a sequential orchestrator over existing, already-audited seams. The only security-relevant surface is the git commit seam, which uses a **fixed `-C cwd` argument array** (never a shell string) [VERIFIED: lib/_git-artifacts.js:14-16, 28-30] — the batch must reuse `commitArtifacts` and must **not** introduce any shell-string git call. No BLOCKER.

---

## 5. Validation Architecture

Automated checks that prove each behaviour (used for the Nyquist/coverage gate):

| Behaviour | Proof | Test location |
|---|---|---|
| `gsd_quick_batch` registers with a valid schema | `registerTool("quick", "gsd_quick_batch")` returns a tool; execute happy path | `test/service-tools.test.mjs` (new describe block) |
| Each task lands its own TASK.md on FakeFs | After execute, assert N `.planning/quick/<date>-<slug>/TASK.md` files exist with the right content | `test/service-tools.test.mjs` |
| Sequential per-task commits | (covered indirectly by the record assertions; commit seam is already unit-tested in `test/_git-artifacts.test.mjs`) | — |
| Failure isolation | Canned handler throws for one task's slug; assert the batch continues, the failed task's TASK.md records the error, and the result list has `done` + `failed` statuses | `test/service-tools.test.mjs` |
| Slug collision dedup | Two tasks with colliding slugs → assert `-2` suffix on the second record | `test/service-tools.test.mjs` |
| Structured return shape | Assert `results` array + `summary` object with correct counts | `test/service-tools.test.mjs` |
| Capability descriptor | `gsdQuickBatch` in `CAPABILITY_KEYS`, `allCapabilities()`, correct `step/role/tools/commands/order` | `test/_capabilities.test.mjs` (update count + key list) |
| Command pairing | `/gsd-quick-batch` paired to `gsdQuickBatch` via `commandToCapability` | `test/_capabilities.test.mjs` (existing pairing test pattern) |
| Mount surface | `gsd_quick_batch` tool + `gsd-quick-batch` command registered; capability provided | `test/mount.test.mjs` (update counts + lists) |
| Render/loop order | `gsdQuickBatch` in `LOOP_ORDER`; persona never names an absent tool | `test/render.test.mjs` (update `LOOP_ORDER`) |

**Note:** the canned subagent handler in `test/service-tools.test.mjs:70-73` already returns success for `label.startsWith("quick")`, so the batch's per-task spawns (label `quick <slug>`) reuse it. The failure-isolation test needs a new canned branch (R-5).

---

## 6. Project Constraints (from project conventions)

- **DUR-06 / D-04:** all artefact writes route through the GsdState artefact model (`ctx.fs`), never raw `node:fs/promises`. The batch must use `writeQuickRecord` / `addDecision`, not direct fs writes. [VERIFIED: lib/quick.js:61-64, lib/state.js:574-576]
- **DEGR-01 / D-02:** every loop-step plugin publishes a capability; the persona renders only present capabilities and never instructs a missing tool. The batch's capability must be registered and the command paired to it. [VERIFIED: lib/_capabilities.js, lib/commands.js:404-437]
- **DEGR-03:** slash commands declare coeffects on their owning capability so retiring the step unregisters the command. The `gsd-quick-batch` command must be paired to `gsdQuickBatch` via the existing `commandToCapability` mechanism. [VERIFIED: lib/commands.js:409-412]
- **D-03 (phase decision):** sequential execution only — no job-runtime parallelism, to avoid working-tree/git collisions. [VERIFIED: CONTEXT.md D-03]
- **D-05 / D-06 (phase decisions):** reuse the per-task record + commit model; derive slug from text, dedup collisions with `-2`, `-3`. [VERIFIED: CONTEXT.md D-05/D-06]
- **D-08 / D-09 (phase decisions):** structured per-task result list + batch summary; throw only on service unavailability, never on individual task failure. [VERIFIED: CONTEXT.md D-08/D-09]
- **Security:** git calls use fixed `-C cwd` argument arrays, never shell strings. The batch reuses `commitArtifacts` and introduces no new git invocation. [VERIFIED: lib/_git-artifacts.js:14-16]
- **Test gate:** `npm test` (`node --test test/*.test.mjs`) must pass on a clean checkout (MOUNT-06). Adding a capability key requires updating the count/list assertions in §3.1 R-1.

---

## Key findings for the planner

1. **Add `gsd_quick_batch` to `lib/quick.js`** (same plugin, two `ctx.provide` calls) — no new patch row or export needed.
2. **Add a `gsdQuickBatch` capability key** to `lib/_capabilities.js` (`step: "quick"`, `role: "alternate"`, `order: 25`, `tools: ["gsd_quick_batch"]`, `commands: ["gsd-quick-batch"]`), and add the `/gsd-quick-batch` command to `lib/commands.js`.
3. **Update the hard-coded test assertions** in `test/mount.test.mjs`, `test/_capabilities.test.mjs`, and `test/render.test.mjs` (R-1) — this is mandatory or `npm test` fails.
4. **Sequential loop** with per-task try/catch, slug-collision `Set` dedup, and a structured `{ results, summary }` return.
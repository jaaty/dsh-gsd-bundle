---
phase: 55-quick-batch
plan: 01
type: execute
wave: 1
depends_on: []
files_modified: [lib/quick.js, lib/_capabilities.js, lib/persona.js]
autonomous: true
requirements: ["CLH-05"]
gap_closure: false
user_setup: []
must_haves:
  truths:
    - A user can call gsd_quick_batch with a tasks array and receive a structured { results, summary } object with per-task done/failed statuses.
    - Each task lands its own .planning/quick/<date>-<slug>/TASK.md record.
    - A failing task is recorded with its error and the batch continues to the next task (failure isolation).
    - The gsdQuickBatch capability is registered under the quick step alongside gsdQuick.
    - The runtime-context snapshot lists the quick step once even though two capabilities share it.
  artifacts:
    - path: "lib/quick.js"
      provides: "the gsd_quick_batch tool (sequential per-task spawn/record/commit, structured return) plus the gsdQuickBatch capability registration"
      min_lines: 40
      exports: ["apply"]
    - path: "lib/_capabilities.js"
      provides: "the gsdQuickBatch capability key in CAPABILITY_KEYS and its descriptor TABLE entry"
      min_lines: 1
      exports: ["CAPABILITY_KEYS"]
    - path: "lib/persona.js"
      provides: "dedup of the snapshot Available-steps step list so two capabilities sharing step 'quick' render once"
      min_lines: 1
      exports: ["apply"]
  key_links:
    - from: "lib/quick.js gsd_quick_batch"
      to: "lib/state.js writeQuickRecord"
      via: "per-task TASK.md write routed through the GsdState artefact model (ctx.fs), never raw fs (DUR-06/D-05)"
      pattern: "writeQuickRecord\\(cwd,"
    - from: "lib/quick.js gsd_quick_batch"
      to: "lib/_git-artifacts.js commitArtifacts"
      via: "per-task atomic commit with scope 'quick' and a message override (D-05)"
      pattern: "commitArtifacts\\(cwd, null, \\{ scope: \"quick\""
    - from: "lib/quick.js gsd_quick_batch"
      to: "lib/_runner.js spawnSubagent"
      via: "one fresh-context subagent per task, label `quick <slug>` (D-03)"
      pattern: "spawnSubagent\\(ctx, exec,"
    - from: "lib/_capabilities.js gsdQuickBatch"
      to: "lib/quick.js ctx.provide"
      via: "the plugin publishes the gsdQuickBatch capability via buildCapability (DEGR-01/D-01)"
      pattern: "provide\\(\"gsdQuickBatch\""
---

<objective>Add the gsd_quick_batch tool and the gsdQuickBatch capability to the quick plugin, plus a snapshot dedup, so multiple quick tasks can run in one batch with per-task records, per-task atomic commits, and a structured per-task result list. This is the tracer plan: it delivers the full vertical slice (capability + tool + spawn + record + commit + structured return) for the happy path, then hardens it with slug-collision dedup and failure isolation.</objective>

<context>
@lib/quick.js — the single-task template to mirror: QUICK_PROMPT, spawnSubagent call, writeQuickRecord, commitArtifacts with scope 'quick', addDecision, presentCall.
@lib/_capabilities.js — CAPABILITY_KEYS array and the TABLE of descriptors; the gsdQuick descriptor at step "quick", role "alternate", order 25.
@lib/_runner.js — spawnSubagent(ctx, exec, { label, promptText }) returns { output, ... }; cwdOf(exec).
@lib/_git-artifacts.js — commitArtifacts(cwd, null, { scope, message }) best-effort, never throws.
@lib/state.js — writeQuickRecord(cwd, dateSlug, entry) routes through ctx.fs; addDecision(cwd, line); planningRoot(cwd); isProject.
@lib/_shared.js — slugify(input) truncates to 48 chars and collapses non-alphanumerics to '-'; today(); nowIso().
@lib/persona.js — renderStateContext builds the snapshot "Available steps:" line from loop.map(d => d.step).
</context>

<tasks>
  <task type="auto">
    <name>Task 1: Add the gsdQuickBatch capability key + TABLE entry and register the capability + gsd_quick_batch tool with the core sequential loop (tracer)</name>
    <files>lib/_capabilities.js, lib/quick.js</files>
    <read_first>lib/_capabilities.js, lib/quick.js, lib/_runner.js, lib/_git-artifacts.js, lib/state.js, lib/_shared.js</read_first>
    <action>
      In lib/_capabilities.js:
      - Add the string "gsdQuickBatch" to the CAPABILITY_KEYS frozen array immediately AFTER "gsdQuick" (gsdQuick sits at index 8, so gsdQuickBatch lands at index 9; the operative rule is "immediately AFTER gsdQuick", which preserves stable sort order for equal order values).
      - Add a TABLE entry `gsdQuickBatch: { step: "quick", role: "alternate", tools: ["gsd_quick_batch"], commands: ["gsd-quick-batch"], order: 25, prereq: [], next: [], produces: [], consumes: [] }` immediately after the gsdQuick entry (per D-01: under the quick step, mirroring gsdQuick's step/role/order).

      In lib/quick.js:
      - Add a second `ctx.provide("gsdQuickBatch", buildCapability("gsdQuickBatch"));` call next to the existing gsdQuick provide (per D-01; ctx.provide is callable multiple times).
      - Register a new tool `gsd_quick_batch` via ctx.tools.register(defineTool({ ... })) with:
        - name "gsd_quick_batch", a description stating it runs multiple quick tasks in a single batch sequentially, each with its own fresh-context subagent, its own .planning/quick/<date>-<slug>/TASK.md record, and its own atomic commit, returning a per-task result list with failure isolation.
        - parameters: `tasks: { type: "array", required: true, description: "Array of { task, slug? } objects; each task is self-contained and independent." }` (per D-02).
        - output: an object schema (per D-08) with a `results` array and a `summary` object, and a render function that formats the object to readable text (one line per task `- <slug>: done` / `- <slug>: failed: <error>` plus a `Batch complete: <done>/<total> done, <failed> failed.` line). If schemastery rejects the nested object schema at registration, fall back to `schema: { type: "object" }` (no properties) while keeping the structured return and the render.
        - async execute(args, exec): guard `const cwd = cwdOf(exec); const s = gsd(); if (!s) throw new Error("gsd_quick_batch: gsdState service unavailable"); const subagents = ctx.get("subagents"); if (!subagents) throw new Error("gsd_quick_batch: `subagents` service unavailable");` (per D-09, same guard as single gsd_quick). Validate `Array.isArray(args.tasks) && args.tasks.length >= 1`, else throw "gsd_quick_batch: tasks must be a non-empty array". Then run a sequential `for...of` over args.tasks (per D-03, NO Promise.all): for each item, derive `task` (accept a string item or an object's `task` field; skip non-string/empty with a failed result), derive `slug = slugify(item.slug || task)`, build `dateSlug = ${today()}-${slug}`, spawn `await spawnSubagent(ctx, exec, { label: \`quick ${slug}\`, promptText: \`${QUICK_PROMPT}\n\nTASK: ${task}\` })`, build the entry markdown exactly like single gsd_quick (`# Quick task <dateSlug>`, `**Task:**`, `**Run:** nowIso()`, `## Result`, r.output || "(no output)"), `await s.writeQuickRecord(cwd, dateSlug, entry)`, `await commitArtifacts(cwd, null, { scope: "quick", message: \`docs(planning): quick ${dateSlug}\` })` (per D-05), and if `s.isProject` best-effort `await s.addDecision(cwd, \`quick ${dateSlug}: ${task}\`)` (per D-07). Push a `{ slug, status: "done", output: r.output || "" }` result. After the loop, return `{ results, summary: { total: results.length, done: <count done>, failed: <count failed> } }` (per D-08).
    </action>
    <verify>grep -n "gsdQuickBatch" lib/_capabilities.js; grep -n "gsd_quick_batch" lib/quick.js</verify>
    <note>Do NOT run `node --test test/mount.test.mjs` to verify this task. Its hard-coded counts (CAPABILITY_KEYS.length === 24, ctx.tools.length === 33, ctx.commands.length === 30) are only updated in plan 03 Task 1, so the suite is EXPECTED to print failures (red) in waves 1-2. Judge this task by its grep acceptance criteria only; the suite turns green in plan 03.</note>
    <acceptance_criteria>
      - grep "gsdQuickBatch" appears in lib/_capabilities.js CAPABILITY_KEYS and TABLE
      - grep "gsd_quick_batch" appears in lib/quick.js
      - grep "provide(\"gsdQuickBatch\"" appears in lib/quick.js
      - grep "writeQuickRecord(cwd," appears in lib/quick.js
      - grep "commitArtifacts(cwd, null, { scope: \"quick\"" appears in lib/quick.js
      - grep "spawnSubagent(ctx, exec," appears in lib/quick.js
      - grep "summary: { total:" appears in lib/quick.js
    </acceptance_criteria>
    <done>gsd_quick_batch is registered, the gsdQuickBatch capability is provided, and the tool runs a sequential per-task spawn/record/commit loop returning a structured { results, summary } object.</done>
  </task>

  <task type="auto">
    <name>Task 2: Harden the batch with slug-collision dedup, failure isolation, and presentCall</name>
    <files>lib/quick.js</files>
    <read_first>lib/quick.js, lib/_shared.js</read_first>
    <action>
      In the gsd_quick_batch execute body in lib/quick.js:
      - Maintain a `const used = new Set()` of slugs already emitted in this batch. Before spawning each task, if `used.has(slug)`, append a numeric suffix starting at 2 (`-2`, `-3`, ...) until the slug is unused (per D-06); then `used.add(slug)`. The suffix must be applied to the derived slug BEFORE building dateSlug, so each record dir stays distinct.
      - Wrap each task's spawn+record+commit+decision in a try/catch (per D-04/D-09). On a caught error, write a TASK.md with `## Error` (instead of `## Result`) containing `String(e?.message || e)`, best-effort (wrap the writeQuickRecord in its own try/catch so a record failure cannot throw out of the batch), and push `{ slug, status: "failed", error: String(e?.message || e) }`; do NOT rethrow — the loop continues to the next task (per D-04). A non-string/empty task (no slug derivable) pushes `{ slug: "", status: "failed", error: "task must be a non-empty string" }` and continues.
      - Add a `presentCall: (a) => ({ card: "generic", title: "gsd quick batch", kind: "other", rawInput: { tasks: (a.tasks || []).map((t) => slugify(t?.slug || t?.task || "")) } })` to the tool definition.
      - Ensure the batch-level execute NEVER throws on an individual task failure (per D-08/D-09); it only throws on service unavailability or a malformed tasks array.
    </action>
    <verify>grep -n "used.has(slug)" lib/quick.js; grep -n "status: \"failed\"" lib/quick.js; grep -n "presentCall" lib/quick.js</verify>
    <note>This task's verify is intentionally grep-only. Its automated coverage (slug-dedup, failure isolation, structured return) lands in plan 03 Task 2's gsd_quick_batch describe block in test/service-tools.test.mjs; do not add a standalone test here.</note>
    <acceptance_criteria>
      - grep "used.has(slug)" appears in lib/quick.js
      - grep "status: \"failed\"" appears in lib/quick.js
      - grep "## Error" appears in lib/quick.js
      - grep "presentCall" appears in lib/quick.js
      - grep "catch" appears in lib/quick.js
    </acceptance_criteria>
    <done>The batch dedups colliding slugs with -2/-3 suffixes, isolates per-task failures (recording them and continuing), and exposes a presentCall.</done>
  </task>

  <task type="auto">
    <name>Task 3: Dedupe the snapshot Available-steps step list so two capabilities sharing step 'quick' render once</name>
    <files>lib/persona.js</files>
    <read_first>lib/persona.js</read_first>
    <action>
      In lib/persona.js renderStateContext, change the stepsLine construction so the step list is deduplicated: replace `loop.map((d) => d.step).join(", ")` with `[...new Set(loop.map((d) => d.step))].join(", ")`. This keeps the runtime-context snapshot clean when gsdQuick and gsdQuickBatch both advertise step "quick" (deviation from RESEARCH OQ-3's accept-duplicate: the snapshot is shown every turn, so a `quick, quick` line would read as a bug; renderAvailableSteps in _render.js keeps its duplicate informational line, which is test-safe). No other change to persona.js.
    </action>
    <verify>grep -n "new Set(loop.map" lib/persona.js</verify>
    <note>Do NOT run `node --test test/mount.test.mjs` to verify this task. Its hard-coded counts are only updated in plan 03 Task 1, so the suite is EXPECTED to print failures (red) in waves 1-2. Judge this task by its grep acceptance criteria only; the suite turns green in plan 03.</note>
    <acceptance_criteria>
      - grep "new Set(loop.map" appears in lib/persona.js
      - grep "loop.map((d) => d.step).join" no longer appears in lib/persona.js
    </acceptance_criteria>
    <done>The snapshot lists the quick step once even with two quick-step capabilities present.</done>
  </task>
</tasks>

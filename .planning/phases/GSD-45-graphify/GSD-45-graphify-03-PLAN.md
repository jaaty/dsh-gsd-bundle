---
phase: 45-graphify
plan: 03
type: tdd
wave: 2
depends_on: ["GSD-45-graphify-01"]
files_modified:
  - lib/ship.js
  - test/graphify.test.mjs
  - test/ship-async.test.mjs
autonomous: true
requirements: ["GAP-11"]
user_setup: []
must_haves:
  truths:
    - "With workflow.graphify false (default), runGraphifyOnShip short-circuits with a skipped message and never calls the graphify tool (D-08)"
    - "With workflow.graphify true and the gsd_graphify tool registered, runGraphifyOnShip calls tool.execute({ action: 'build' }) and returns a graphify log line carrying the tool's result (D-08)"
    - "If the gsd_graphify tool is absent (graphify plugin retired), runGraphifyOnShip returns a not-registered/skipped message and never throws (D-08, DEGR-05)"
    - "If tool.execute throws, runGraphifyOnShip catches it, returns a non-blocking log line naming the real cause, and never rejects (D-08 never-blocks-ship)"
    - "ship.js's execute body invokes runGraphifyOnShip after the completion commit so the auto-run fires for the just-shipped phase (D-08)"
  artifacts:
    - path: "lib/ship.js"
      provides: "a pure exported runGraphifyOnShip({ cfg, tools, exec }) helper — the post-completion best-effort graphify hook gated by workflow.graphify, find/invokes the registered gsd_graphify tool with { action: 'build' }, wrapped so a fault never blocks the ship — plus its wiring into the execute body"
      min_lines: 1
      exports: ["runGraphifyOnShip"]
  key_links:
    - from: "lib/ship.js"
      to: "lib/graphify.js"
      via: "runGraphifyOnShip finds the registered gsd_graphify tool via tools.find((t) => t.name === 'gsd_graphify') and calls its execute with { action: 'build' }; ship.execute invokes the helper after the completion commit"
      pattern: "gsd_graphify"
---

<objective>
Add the auto-on-ship graphify hook to lib/ship.js as a PURE, EXPORTED, directly-testable helper — runGraphifyOnShip — mirroring the existing runLearningsOnShip precedent (lib/ship.js:67-77). The helper finds the registered gsd_graphify tool, gates on workflow.graphify, calls tool.execute({ action: 'build' }) inside try/catch, and returns a single log-entry string. It is unit-tested directly with a fake tools array (no full ship.execute run, no git/gh — ship.execute cannot run offline because its git/gh are module-level real child_process with no injection seam). The helper is then wired into ship.js's execute body after the completion commit so the auto-run fires for the just-shipped phase. TDD: the helper tests are added to test/graphify.test.mjs first (RED), then the helper + wiring are implemented (GREEN). Per D-08, the auto-run uses { action: 'build' } (the graph is project-global, so no phase param) and reuses the same tool code path (which already commits via commitArtifacts — D-09 — and preserves the prior graph on failure — D-09).
</objective>

<context>
@lib/ship.js
@lib/graphify.js
@test/graphify.test.mjs
@test/learnings.test.mjs
@test/helpers/mount-harness.mjs
@test/ship-async.test.mjs
</context>

<tasks>
  <task type="auto">
    <name>Task 1 (test): Add runGraphifyOnShip helper tests to test/graphify.test.mjs (RED)</name>
    <files>test/graphify.test.mjs</files>
    <read_first>test/graphify.test.mjs, lib/ship.js, test/learnings.test.mjs, test/ship-async.test.mjs, test/helpers/mount-harness.mjs</read_first>
    <action>
Append a new describe block to the existing test/graphify.test.mjs (do NOT rewrite the file — use edit to add after the last describe block). The describe block is "graphify: runGraphifyOnShip helper (auto-on-ship hook, D-08)". Import runGraphifyOnShip from ../lib/ship.js directly. Do NOT run gsd_ship.execute — the helper is tested in isolation with a fake tools array, so no git/gh/FakeFs repo is required.

The helper signature under test is runGraphifyOnShip({ cfg, tools, exec }) returning a Promise<string>. Build a fake exec object (a plain {} is fine — it is only forwarded as tool.execute(args, exec); the fake tool ignores it). Build a makeFakeGraphifyTool() that returns a fake tool object { name: "gsd_graphify", execute: async (args, exec) => { calls.push(args); return "graph built (nodes: 5, edges: 8)"; } } and records its call args in a shared array.

Write these four test cases:

1. "workflow.graphify false → skipped, tool never called": cfg = { workflow: { graphify: false } }; tools = [makeFakeGraphifyTool()]; const out = await runGraphifyOnShip({ cfg, tools, exec }); assert.match(out, /skipped|disabled/i); assert.equal(calls.length, 0, "tool must not be invoked when the flag is off"); assert.doesNotMatch(out, /graph built/).

2. "workflow.graphify true + tool present → calls execute with action build, returns result line": cfg = { workflow: { graphify: true } }; tools = [makeFakeGraphifyTool()]; const out = await runGraphifyOnShip({ cfg, tools, exec }); assert.match(out, /graphify:/i); assert.match(out, /graph built/); assert.deepEqual(calls[0], { action: 'build' }, "auto-run must build the project-global graph (D-08)").

3. "workflow.graphify true + tool throws → returns non-blocking line with cause, never rejects": const failingTool = { name: "gsd_graphify", execute: async () => { throw new Error("graph build outage"); } }; cfg = { workflow: { graphify: true } }; tools = [failingTool]; const out = await runGraphifyOnShip({ cfg, tools, exec }); assert.match(out, /non-blocking|failed/i); assert.match(out, /graph build outage/, "the real cause must be surfaced"); the await must NOT reject (wrap in assert.doesNotReject if desired).

4. "workflow.graphify true + tool absent → returns not-registered/skipped, never throws": cfg = { workflow: { graphify: true } }; tools = []; const out = await runGraphifyOnShip({ cfg, tools, exec }); assert.match(out, /not registered|skipped/i); assert.doesNotMatch(out, /graph built/).

Optional fifth case (cfg absent): cfg = undefined (or {}); tools = [makeFakeGraphifyTool()]; out = await runGraphifyOnShip({ cfg, tools, exec }); assert.match(out, /skipped|disabled/i) — defends against a missing workflow object (optional chaining).

Reset the calls array (calls.length = 0) before each case. The tests must be fully offline: no mount, no FakeFs, no git/gh, no gsdState. The helper is pure.
    </action>
    <verify>grep -q "runGraphifyOnShip" test/graphify.test.mjs && grep -q "non-blocking\|failed" test/graphify.test.mjs && grep -q "action: 'build'\|action: \"build\"" test/graphify.test.mjs</verify>
    <acceptance_criteria>
      - grep -q "runGraphifyOnShip" test/graphify.test.mjs (imported from ../lib/ship.js)
      - grep -q "workflow" test/graphify.test.mjs (config flag gating test)
      - grep -q "action: 'build'\|action: \"build\"" test/graphify.test.mjs (auto-run builds the project-global graph)
      - grep -q "non-blocking\|failed" test/graphify.test.mjs (never-blocks assertion)
      - grep -q "not registered\|skipped" test/graphify.test.mjs (tool-absent case)
      - grep -q "graph build outage" test/graphify.test.mjs (cause-surfacing assertion)
    </acceptance_criteria>
    <done>Four (+optional fifth) runGraphifyOnShip helper tests are appended to test/graphify.test.mjs covering: flag-off skip (tool never called), flag-on success (action build, result line), flag-on tool-throws (non-blocking, cause surfaced, never rejects), flag-on tool-absent (not-registered/skipped). Tests are expected to FAIL (RED) because runGraphifyOnShip is not exported from lib/ship.js yet.</done>
  </task>

  <task type="auto">
    <name>Task 2 (feat): Implement runGraphifyOnShip helper + wire into ship.js execute (GREEN)</name>
    <files>lib/ship.js, test/ship-async.test.mjs</files>
    <read_first>lib/ship.js, lib/graphify.js, test/graphify.test.mjs, test/ship-async.test.mjs, lib/state.js</read_first>
    <action>
Add the pure exported runGraphifyOnShip helper to lib/ship.js and wire it into the execute body, per D-08. Mirror the runLearningsOnShip precedent (lib/ship.js:67-77) exactly, but with NO phase param because the graph is project-global (D-04/D-08).

1. Add the helper function right after runLearningsOnShip (after line 77, before apply). Signature:
   `async function runGraphifyOnShip({ cfg, tools, exec })`
   - Gate on the config flag with optional chaining: `if (!cfg?.workflow?.graphify) return "graphify: disabled (workflow.graphify false) — skipped";`
   - Find the registered graphify tool: `const tool = Array.isArray(tools) ? tools.find((t) => t && t.name === "gsd_graphify") : null;`
   - If the tool is absent: `return "graphify: gsd_graphify not registered — skipped";` (DEGR-05 — keeps ship working when the graphify plugin is retired).
   - Invoke the tool with { action: 'build' } inside try/catch (D-08 never-blocks-ship): `try { const r = await tool.execute({ action: 'build' }, exec); return "graphify: " + String(r); } catch (e) { return "graphify: build failed (non-blocking): " + (e && e.message ? e.message : String(e)); }`
   - The helper takes NO ctx, NO git, NO gsdState, NO phase — only cfg, tools, exec — so it is unit-testable offline with a fake tools array (matching the test in Task 1). Per D-04 pure-helper discipline and the runLearningsOnShip precedent. { action: 'build' } is correct because the graph is project-global and the auto-run rebuilds it wholesale from the current .planning/ state (D-04 idempotent rebuild). The tool's own execute already commits via commitArtifacts (D-09) and preserves the prior graph on failure (D-09).

2. Wire the helper into the execute body. Insert the call AFTER the runLearningsOnShip call (after line 339) and BEFORE the final `log.push(`PR created: ...`)` + `return log.join("\n")` at lines 341-342. The variables cfg (line 139) and exec (closure param) are already in scope, and ctx.tools is accessible via the apply(ctx) closure. Add:
   `const graphifyLine = await runGraphifyOnShip({ cfg, tools: ctx.tools, exec });`
   `log.push(graphifyLine);`
   The hook is purely additive between the completion commit and the final return. Do NOT modify any other part of ship.js.

3. Add runGraphifyOnShip to the module's export statement (line 348): change `export { name, inject, apply, preflightError, runLearningsOnShip };` to `export { name, inject, apply, preflightError, runLearningsOnShip, runGraphifyOnShip };`.

4. Update test/ship-async.test.mjs so the existing export-shape assertion tolerates the new export member. The current line-60 assertion is:
   `assert.match(src, /export\s*\{\s*name,\s*inject,\s*apply,\s*preflightError(?:\s*,\s*runLearningsOnShip)?\s*\}/, "preflightError exported");`
   The regex's trailing `\s*\}` anchor no longer matches once `, runGraphifyOnShip` is inserted before the closing brace, so the assertion (and the whole test/ship-async.test.mjs suite) would FAIL after step 3 — contradicting this plan's own acceptance criterion that `node --test test/ship-async.test.mjs exits 0`. Relax the regex to make the new member optional:
   `assert.match(src, /export\s*\{\s*name,\s*inject,\s*apply,\s*preflightError(?:\s*,\s*runLearningsOnShip)?(?:\s*,\s*runGraphifyOnShip)?\s*\}/, "preflightError exported");`
   Use edit to replace ONLY this one assertion line; do NOT touch any other assertion in test/ship-async.test.mjs (the fetchGitData await match, the cherry-pick/switch/push matches, and ship.test.mjs's cwdOf(exec) count are all unaffected by the new pure helper, which adds no cwdOf(exec) call).

The hook does NOT push the graph files separately — the tool's execute already calls commitArtifacts which stages and commits .planning changes locally (D-09). The graph files are .planning/ content which the clean-PR path filters out of the review diff, so the commit lands on the local phase-N branch. A follow-up push of the branch is best-effort and acceptable (Claude's Discretion per D-13) — do NOT add it; the next ship push or a later run surfaces it.
    </action>
    <verify>node --test test/graphify.test.mjs 2>&1 | tail -20</verify>
    <acceptance_criteria>
      - grep -q "runGraphifyOnShip" lib/ship.js (helper defined)
      - grep -q "export { name, inject, apply, preflightError, runLearningsOnShip, runGraphifyOnShip }" lib/ship.js (helper exported)
      - grep -q "workflow" lib/ship.js (hook gated by the config flag)
      - grep -q "action: 'build'\|action: \"build\"" lib/ship.js (auto-run builds the project-global graph)
      - grep -q "non-blocking" lib/ship.js (never-blocks-ship try/catch)
      - grep -q "gsd_graphify" lib/ship.js (hook finds the graphify tool)
      - grep -q "runGraphifyOnShip" test/ship-async.test.mjs (export-shape regex relaxed to tolerate the new member)
      - node --test test/graphify.test.mjs exits 0 (all graphify tests including the runGraphifyOnShip helper tests pass — GREEN)
      - node --test test/ship.test.mjs exits 0 (existing ship tests still pass)
      - node --test test/ship-async.test.mjs exits 0 (preflightError/ship helper tests + relaxed export-shape assertion pass)
    </acceptance_criteria>
    <done>lib/ship.js exports a pure runGraphifyOnShip({ cfg, tools, exec }) helper gated by workflow.graphify, that finds the gsd_graphify tool, calls execute with { action: 'build' }, and returns a log line (skipped / result / non-blocking-failure / not-registered). The helper is wired into execute after the completion commit so the auto-run fires for the just-shipped phase. test/ship-async.test.mjs's export-shape assertion is relaxed to tolerate the new runGraphifyOnShip export member (keeping the suite green). test/graphify.test.mjs passes including the four helper tests. Existing ship.test.mjs and ship-async.test.mjs still pass.</done>
  </task>
</tasks>

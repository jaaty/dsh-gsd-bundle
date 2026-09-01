---
phase: 44-learnings
plan: 03
type: tdd
wave: 2
depends_on: ["GSD-44-learnings-01"]
files_modified:
  - lib/ship.js
  - test/learnings.test.mjs
  - test/ship-async.test.mjs
autonomous: true
requirements: ["GAP-10"]
user_setup: []
must_haves:
  truths:
    - "With workflow.learnings false (default), runLearningsOnShip short-circuits with a skipped message and never calls the learnings tool (D-10)"
    - "With workflow.learnings true and the gsd_extract_learnings tool registered, runLearningsOnShip calls tool.execute({ phase, force: true }) and returns a learnings log line carrying the tool's result (D-10)"
    - "If the gsd_extract_learnings tool is absent (learnings plugin retired), runLearningsOnShip returns a not-registered/skipped message and never throws (D-10, DEGR-05)"
    - "If tool.execute throws, runLearningsOnShip catches it, returns a non-blocking log line naming the real cause, and never rejects (D-10 never-blocks-ship)"
    - "ship.js's execute body invokes runLearningsOnShip after the completion commit so the auto-run fires for the just-shipped phase with force: true (D-06, D-10)"
  artifacts:
    - path: "lib/ship.js"
      provides: "a pure exported runLearningsOnShip({ cfg, tools, phase, exec }) helper — the post-completion best-effort learnings hook gated by workflow.learnings, find/invokes the registered gsd_extract_learnings tool with force:true, wrapped so a fault never blocks the ship — plus its wiring into the execute body"
      min_lines: 1
      exports: ["runLearningsOnShip"]
  key_links:
    - from: "lib/ship.js"
      to: "lib/learnings.js"
      via: "runLearningsOnShip finds the registered gsd_extract_learnings tool via tools.find((t) => t.name === 'gsd_extract_learnings') and calls its execute with { phase, force: true }; ship.execute invokes the helper after the completion commit"
      pattern: "gsd_extract_learnings"
---

<objective>
Add the auto-on-ship learnings hook to lib/ship.js as a PURE, EXPORTED, directly-testable helper — runLearningsOnShip — mirroring the existing preflightError precedent (lib/ship.js exports a pure helper that ship-async.test.mjs tests directly, then wires into execute). The helper finds the registered gsd_extract_learnings tool, gates on workflow.learnings, calls tool.execute({ phase, force: true }) inside try/catch, and returns a single log-entry string. It is unit-tested directly with a fake tools array (no full ship.execute run, no git/gh — ship.execute cannot run offline because its git/gh are module-level real child_process with no injection seam, per the plan-checker BLOCKER). The helper is then wired into ship.js's execute body after the completion commit so the auto-run fires for the just-shipped phase. TDD: the helper tests are added to test/learnings.test.mjs first (RED), then the helper + wiring are implemented (GREEN). Per D-10, the auto-run uses force: true (the just-shipped phase may already be in phases_extracted from a prior manual run, D-06) and reuses the same tool code path (which already commits via commitArtifacts — D-11 — and degrades to decisions-only on subagent fault — D-09).
</objective>

<context>
@lib/ship.js
@lib/learnings.js
@test/learnings.test.mjs
@test/milestone-audit.test.mjs
@test/helpers/mount-harness.mjs
@test/ship-async.test.mjs
</context>

<tasks>
  <task type="auto">
    <name>Task 1 (test): Add runLearningsOnShip helper tests to test/learnings.test.mjs (RED)</name>
    <files>test/learnings.test.mjs</files>
    <read_first>test/learnings.test.mjs, lib/ship.js, test/ship-async.test.mjs, test/milestone-audit.test.mjs, test/helpers/mount-harness.mjs</read_first>
    <action>
Append a new describe block to the existing test/learnings.test.mjs (do NOT rewrite the file — use edit to add after the last describe block). The describe block is "learnings: runLearningsOnShip helper (auto-on-ship hook, D-10)". Import runLearningsOnShip from ../lib/ship.js directly (alongside the existing preflightError import pattern if any, or add it). Do NOT run gsd_ship.execute — the helper is tested in isolation with a fake tools array, so no git/gh/FakeFs repo is required.

The helper signature under test is runLearningsOnShip({ cfg, tools, phase, exec }) returning a Promise<string>. Build a fake exec object (a plain {} is fine — it is only forwarded as tool.execute(args, exec); the fake tool ignores it). Build a makeFakeLearningsTool() that returns a fake tool object { name: "gsd_extract_learnings", execute: async (args, exec) => { calls.push(args); return "extracted phase " + args.phase + " (decisions: 2, lessons: 3)"; } } and records its call args in a shared array.

Write these four test cases:

1. "workflow.learnings false → skipped, tool never called": cfg = { workflow: { learnings: false } }; tools = [makeFakeLearningsTool()]; const out = await runLearningsOnShip({ cfg, tools, phase: 1, exec }); assert.match(out, /skipped|disabled/i); assert.equal(calls.length, 0, "tool must not be invoked when the flag is off"); assert.doesNotMatch(out, /extracted/).

2. "workflow.learnings true + tool present → calls execute with force:true, returns result line": cfg = { workflow: { learnings: true } }; tools = [makeFakeLearningsTool()]; const out = await runLearningsOnShip({ cfg, tools, phase: 1, exec }); assert.match(out, /learnings:/i); assert.match(out, /extracted phase 1/); assert.deepEqual(calls[0], { phase: 1, force: true }, "auto-run must force re-extract (D-06/D-10)").

3. "workflow.learnings true + tool throws → returns non-blocking line with cause, never rejects": const failingTool = { name: "gsd_extract_learnings", execute: async () => { throw new Error("subagent outage"); } }; cfg = { workflow: { learnings: true } }; tools = [failingTool]; const out = await runLearningsOnShip({ cfg, tools, phase: 1, exec }); assert.match(out, /non-blocking|failed/i); assert.match(out, /subagent outage/, "the real cause must be surfaced"); the await must NOT reject (wrap in assert.doesNotReject if desired).

4. "workflow.learnings true + tool absent → returns not-registered/skipped, never throws": cfg = { workflow: { learnings: true } }; tools = []; const out = await runLearningsOnShip({ cfg, tools, phase: 1, exec }); assert.match(out, /not registered|skipped/i); assert.doesNotMatch(out, /extracted/).

Optional fifth case (cfg absent): cfg = undefined (or {}); tools = [makeFakeLearningsTool()]; out = await runLearningsOnShip({ cfg, phase: 1, exec }); assert.match(out, /skipped|disabled/i) — defends against a missing workflow object (optional chaining).

Reset the calls array (calls.length = 0) before each case. The tests must be fully offline: no mount, no FakeFs, no git/gh, no gsdState. The helper is pure.
    </action>
    <verify>grep -q "runLearningsOnShip" test/learnings.test.mjs && grep -q "non-blocking\|failed" test/learnings.test.mjs && grep -q "force: true\|force:true" test/learnings.test.mjs</verify>
    <acceptance_criteria>
      - grep -q "runLearningsOnShip" test/learnings.test.mjs (imported from ../lib/ship.js)
      - grep -q "workflow" test/learnings.test.mjs (config flag gating test)
      - grep -q "force: true\|force:true" test/learnings.test.mjs (auto-run forces re-extract)
      - grep -q "non-blocking\|failed" test/learnings.test.mjs (never-blocks assertion)
      - grep -q "not registered\|skipped" test/learnings.test.mjs (tool-absent case)
      - grep -q "subagent outage" test/learnings.test.mjs (cause-surfacing assertion)
    </acceptance_criteria>
    <done>Four (+optional fifth) runLearningsOnShip helper tests are appended to test/learnings.test.mjs covering: flag-off skip (tool never called), flag-on success (force:true, result line), flag-on tool-throws (non-blocking, cause surfaced, never rejects), flag-on tool-absent (not-registered/skipped). Tests are expected to FAIL (RED) because runLearningsOnShip is not exported from lib/ship.js yet.</done>
  </task>

  <task type="auto">
    <name>Task 2 (feat): Implement runLearningsOnShip helper + wire into ship.js execute (GREEN)</name>
    <files>lib/ship.js, test/ship-async.test.mjs</files>
    <read_first>lib/ship.js, lib/learnings.js, test/learnings.test.mjs, test/ship-async.test.mjs, lib/state.js</read_first>
    <action>
Add the pure exported runLearningsOnShip helper to lib/ship.js and wire it into the execute body, per D-10 and the plan-checker BLOCKER resolution. Mirror the preflightError precedent: a pure, exported, directly-testable helper that is then used inside execute.

1. Add the helper function near preflightError (after line 52, before apply). Signature:
   `async function runLearningsOnShip({ cfg, tools, phase, exec })`
   - Gate on the config flag with optional chaining: `if (!cfg?.workflow?.learnings) return "learnings: disabled (workflow.learnings false) — skipped";`
   - Find the registered learnings tool: `const tool = Array.isArray(tools) ? tools.find((t) => t && t.name === "gsd_extract_learnings") : null;`
   - If the tool is absent: `return "learnings: gsd_extract_learnings not registered — skipped";` (DEGR-05 — keeps ship working when the learnings plugin is retired).
   - Invoke the tool with force: true inside try/catch (D-10 never-blocks-ship): `try { const r = await tool.execute({ phase, force: true }, exec); return "learnings: " + String(r); } catch (e) { return "learnings: extraction failed (non-blocking): " + (e && e.message ? e.message : String(e)); }`
   - The helper takes NO ctx, NO git, NO gsdState — only cfg, tools, phase, exec — so it is unit-testable offline with a fake tools array (matching the test in Task 1). Per D-14 pure-helper discipline and the preflightError precedent. force: true is correct because the just-shipped phase may already be in phases_extracted from a prior manual run and the auto-run must re-extract the final state (D-06 force override). The tool's own execute already commits via commitArtifacts (D-11) and degrades to decisions-only on subagent fault (D-09).

2. Wire the helper into the execute body. Insert the call AFTER the completion commit + push block (after the closing of the `if (staged) { ... } else { ... }` block around line 305) and BEFORE the final `log.push(`PR created: ...`)` + `return log.join("\n")` at lines 307-308. The variables cfg (line 114) and exec (closure param) are already in scope, and ctx.tools is accessible via the apply(ctx) closure. Add:
   `const learningsLine = await runLearningsOnShip({ cfg, tools: ctx.tools, phase: args.phase, exec });`
   `log.push(learningsLine);`
   The hook is purely additive between the completion commit and the final return. Do NOT modify any other part of ship.js.

3. Add runLearningsOnShip to the module's export statement (line 314): change `export { name, inject, apply, preflightError };` to `export { name, inject, apply, preflightError, runLearningsOnShip };`.

4. Update test/ship-async.test.mjs so the existing export-shape assertion tolerates the new export member. The current line-60 assertion is:
   `assert.match(src, /export\s*\{\s*name,\s*inject,\s*apply,\s*preflightError\s*\}/, "preflightError exported");`
   The regex's trailing `\s*\}` anchor no longer matches once `, runLearningsOnShip` is inserted before the closing brace, so the assertion (and the whole test/ship-async.test.mjs suite) would FAIL after step 3 — contradicting this plan's own acceptance criterion that `node --test test/ship-async.test.mjs exits 0`. Relax the regex to make the new member optional:
   `assert.match(src, /export\s*\{\s*name,\s*inject,\s*apply,\s*preflightError(?:\s*,\s*runLearningsOnShip)?\s*\}/, "preflightError exported");`
   Use edit to replace ONLY this one assertion line; do NOT touch any other assertion in test/ship-async.test.mjs (the fetchGitData await match, the cherry-pick/switch/push matches, and ship.test.mjs's cwdOf(exec) count of 5 are all unaffected by the new pure helper, which adds no cwdOf(exec) call).

The hook does NOT push the LEARNINGS files separately — the tool's execute already calls commitArtifacts which stages and commits .planning changes locally (D-11). The LEARNINGS files are .planning/ content which the clean-PR path filters out of the review diff, so the commit lands on the local phase-N branch. A follow-up push of the branch is best-effort and acceptable (Claude's Discretion per D-11) — do NOT add it; the next ship push or a later run surfaces it.
    </action>
    <verify>node --test test/learnings.test.mjs 2>&1 | tail -20</verify>
    <acceptance_criteria>
      - grep -q "runLearningsOnShip" lib/ship.js (helper defined)
      - grep -q "export { name, inject, apply, preflightError, runLearningsOnShip }" lib/ship.js (helper exported)
      - grep -q "workflow" lib/ship.js (hook gated by the config flag)
      - grep -q "force: true\|force:true" lib/ship.js (auto-run forces re-extract)
      - grep -q "non-blocking" lib/ship.js (never-blocks-ship try/catch)
      - grep -q "gsd_extract_learnings" lib/ship.js (hook finds the learnings tool)
      - grep -q "runLearningsOnShip" test/ship-async.test.mjs (export-shape regex relaxed to tolerate the new member)
      - node --test test/learnings.test.mjs exits 0 (all learnings tests including the runLearningsOnShip helper tests pass — GREEN)
      - node --test test/ship.test.mjs exits 0 (existing ship tests still pass)
      - node --test test/ship-async.test.mjs exits 0 (preflightError/ship helper tests + relaxed export-shape assertion pass)
    </acceptance_criteria>
    <done>lib/ship.js exports a pure runLearningsOnShip({ cfg, tools, phase, exec }) helper gated by workflow.learnings, that finds the gsd_extract_learnings tool, calls execute with force:true, and returns a log line (skipped / result / non-blocking-failure / not-registered). The helper is wired into execute after the completion commit so the auto-run fires for the just-shipped phase. test/ship-async.test.mjs's export-shape assertion is relaxed to tolerate the new runLearningsOnShip export member (keeping the suite green). test/learnings.test.mjs passes including the four helper tests. Existing ship.test.mjs and ship-async.test.mjs still pass.</done>
  </task>
</tasks>
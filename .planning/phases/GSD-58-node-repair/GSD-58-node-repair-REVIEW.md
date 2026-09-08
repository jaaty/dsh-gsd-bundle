---
phase: 58
reviewed: "2026-09-08T04:34:38.205Z"
depth: standard
files_reviewed: 15
status: issues_found
findings:
  blocker: 1
  warning: 6
  info: 5
  total: 12
---
# Phase 58: node-repair - Code Review Report

**Reviewed:** 2026-09-08T04:34:38.205Z
**Depth:** standard
**Files reviewed:** 15
**Status:** issues_found

## Summary

- Total findings: 12
- BLOCKER: 1
- WARNING: 6
- INFO: 5

## Blockers

### CR-01: npm files glob omits lib/job-wrapper.mjs — published package cannot launch shell jobs

- **File:** package.json
- **Lines:** 121-131
- **Severity:** BLOCKER
- **Evidence:** "files": [
    "lib/*.js",
    "cordis.patch.yml", ... — the glob lib/*.js matches only .js files. lib/jobs.js:26 does `const WRAPPER = fileURLToPath(new URL("./job-wrapper.mjs", import.meta.url));` and jobs.js:105 spawns `spawn(process.execPath, [WRAPPER, entry.id, resultFile, ...])` for every shell job. Proof: packing the repo (`npm pack`) yields a tarball containing `package/lib/jobs.js` and ZERO .mjs files, so in an npm-installed copy the spawned child points at a nonexistent module and every gsd_job shell launch fails immediately.
- **Suggestion:** Add "lib/*.mjs" (or explicitly "lib/job-wrapper.mjs") to the files array so the spawned wrapper ships with the package; re-verify with npm pack that lib/job-wrapper.mjs lands in the tarball.

## Warnings

### CR-02: Awaiting-checkpoint stop cause truncates the GSD_AWAITING_HUMAN marker (and decision_id); the verbatim-marker branch is dead in the real awaiting flow

- **File:** lib/repair.js
- **Lines:** 139-160
- **Severity:** WARNING
- **Evidence:** The checkpoint branch (142-150) fires first: `if (await s.hasArtifact(cwd, phaseNum, `CHECKPOINT-${zeroPad(Number(p.plan))}`))` returns stopCause embedding `excerpt(execOut)` — only the FIRST 400 chars (excerpt, lines 72-75). But lib/_checkpoint.js:50 makes `awaiting` true ONLY when a persisted CHECKPOINT artefact exists (`const awaiting = checkpointFm ? awaitingDecision(...) : false`), so in the real awaiting flow the CHECKPOINT artefact always exists and the marker branch at 151-160 is unreachable. Reproduced with a production-shaped gsd_execute log (header + wave table + truncation note + completed-plan lines before the marker): the surfaced stop reason truncates the marker mid-token — `GSD_AWAITING_HUMAN: plan 01-auth-01 awaits your decision (checkpoint:decision); decision_i…` — losing the `decision_id=01-auth-01-ck1` the driving agent must echo back. The existing test passes only because its fake execOut is ~110 chars.
- **Suggestion:** In the checkpoint branch, extract the marker line from execOut exactly as the marker branch does (`String(execOut ?? "").split("\n").find((l) => l.includes("GSD_AWAITING_HUMAN:"))`) and append it verbatim to the stopCause — or run the marker extraction before the CHECKPOINT loop so both branches share it.

### CR-03: Mempalace capture hook only supports the ARRAY tools shape — silently skipped in the real runtime where ctx.tools is a .get() service

- **File:** lib/verify.js
- **Lines:** 34
- **Severity:** WARNING
- **Evidence:** `const tool = Array.isArray(tools) ? tools.find((t) => t && t.name === "gsd_mempalace_capture") : null;` — but per lib/repair.js:59-62 and lib/quick.js:44-45, "the real DSH runtime exposes a SERVICE object answering .get(name)"; only the offline mount/test harness passes an array. Direct probe of runMempalaceCaptureOnVerify with `{ get: (n) => captureTool }` and mempalace.enabled+capture_artifacts=true returned "mempalace capture: gsd_mempalace_capture not registered — skipped", while the same tool via an array returned "mempalace capture: CAPTURED". So in production the D-07 capture-at-verify hook silently never fires. Same array-only pattern exists in lib/plan.js:29,45, lib/discuss.js:47,63 and lib/ship.js:68,93,114 (outside this file list, same fix).
- **Suggestion:** Use the dual-shape lookup repair.js/quick.js already implement (array find OR service .get); ideally extract repair.js's findTool into lib/_shared.js and reuse it here and in the sibling hooks so the shapes cannot drift again.

### CR-04: Repair's REPAIR.md/commit epilogue is skipped when a delegated tool throws mid-round — the attempted round leaves no audit record

- **File:** lib/repair.js
- **Lines:** 324-354
- **Severity:** WARNING
- **Evidence:** `while (attempt < budget) { attempt += 1; const round = await runOneRound({...}); ... }` — runOneRound propagates delegate throws (fail-loud by design, R6), but the epilogue (`const file = await epilogue({...})`) at line 354 runs only on normal loop exit. A delegate throw is reachable in production: gsd_execute fails loud with `gsd_execute: invalid CHECKPOINT-01 artefact ... last_completed_task=9, task_count=...` on a corrupt/out-of-range checkpoint (lib/_checkpoint.js:44 via execute.js:118). In that case the attempted round leaves no `## Stop` section in REPAIR.md and no scope-repair commit, contradicting the module's own comment at 235-238: "every exit path that enters a repair attempt funnels through here — exactly once per invocation". A throw in round 2 also loses round 1's recorded sections.
- **Suggestion:** Wrap the budget loop in try/catch: on a thrown error push a stop section (`## Stop` with the thrown message), run the shared epilogue so REPAIR.md + the commit still land, then rethrow to preserve the fail-loud contract.

### CR-05: Budget-exhaustion classification is a magic English substring matched across modules, not a shared contract

- **File:** lib/autonomous.js
- **Lines:** 315
- **Severity:** WARNING
- **Evidence:** lib/repair.js:349 builds the exhaustion cause as prose: `stopReason = `repair budget exhausted (${attempt} of ${budget} round(s)) — ...``. lib/autonomous.js:315 classifies the stop by substring: `const exhausted = repair != null && String(repair.stopReason ?? "").includes("repair budget exhausted");` — a non-exhausted result is folded as `repair stopped early — ${repair.stopReason}` else labeled budget-exhausted. If repair.js's wording is ever changed, an early stop (e.g. the awaiting-checkpoint handoff whose cause must reach the human untouched per P5/D-11) is silently reclassified as "repair budget exhausted", masking the real cause. The coupling is documented in comments but enforced by no shared symbol or test across both modules.
- **Suggestion:** Export a constant from repair.js (e.g. `export const BUDGET_EXHAUSTED_PHRASE = "repair budget exhausted";`) used by both the cause template and autonomous's match — or better, have runRepairRounds return a structured `stopClass: "budget-exhausted" | "early"` field and match on that instead of prose.

### CR-06: assertNoAbsentToolToken regex /gsd_[a-z]+/g truncates underscore tool names, blind-spotting the never-instruct-a-missing-tool invariant

- **File:** test/helpers/mount-harness.mjs
- **Lines:** 237
- **Severity:** WARNING
- **Evidence:** `const tokens = text.match(/gsd_[a-z]+/g) || [];` — the character class excludes `_`, so "gsd_quick_batch" yields token "gsd_quick" and "gsd_new_milestone" yields "gsd_new". If the persona/snapshot names an ABSENT multi-word tool while the truncated prefix's capability is present, the absent-tool assertion passes wrongly. render.test.mjs:195 already uses the correct `/gsd_[a-z_]+/g`, and render.test.mjs:221-228 explicitly documents this exact flaw ("would otherwise extract 'gsd_gap' from a literal 'gsd_gap_analysis'") — the shared harness guard never got the same fix.
- **Suggestion:** Change the extraction to `text.match(/gsd_[a-z_]+/g)` so multi-word tool names are matched whole (aligning with render.test.mjs's assertNoAbsentTool), and add a regression case naming e.g. gsd_quick_batch in a mount where gsdQuickBatch is absent.

### CR-07: A verifier run that wrote no VERIFICATION.md is misreported as gaps_found with a repair recommendation

- **File:** lib/verify.js
- **Lines:** 115-122
- **Severity:** WARNING
- **Evidence:** `let status = "gaps_found";` then `if (verText) { const { frontmatter } = parseFrontmatter(verText); if (frontmatter.status) status = String(frontmatter.status); ... }` — when the verifier subagent completes but writes no VERIFICATION.md (or an empty one), verText is "" and status remains the default, so the route map returns `✗ Phase N: gaps found (score n/a). Next: gsd_repair ...` even though nothing was verified. lib/repair.js's readVerificationStatus (lines 84-98) deliberately distinguishes missing-file from gaps_found for exactly this reason; verify's own route does not, sending the human (and potentially an autonomous run) chasing phantom gaps until repair's gate stops with "VERIFICATION.md is missing".
- **Suggestion:** When verText is empty, return a distinct route (e.g. `⚠ Phase N: the verifier produced no readable VERIFICATION.md — re-run gsd_verify`) instead of the gaps_found route, keeping STATE on verify (setActivePhase already lands on "verify" for non-passed).

## Info

### CR-08: ROUNDS_DOMAIN_MSG restates the budget literal instead of deriving from REPAIR_ROUND_BUDGET

- **File:** lib/repair.js
- **Lines:** 54
- **Severity:** INFO
- **Evidence:** `export const ROUNDS_DOMAIN_MSG = "rounds must be an integer between 1 and 2";` sits two lines below `export const REPAIR_ROUND_BUDGET = 2;` — the comment promises "the domain text lives on exactly one source line", but the budget itself is restated inside the message, so raising REPAIR_ROUND_BUDGET to 3 would make both validation sites report a false upper bound.
- **Suggestion:** Derive the message from the constant: `export const ROUNDS_DOMAIN_MSG = `rounds must be an integer between 1 and ${REPAIR_ROUND_BUDGET}`;`.

### CR-09: roundSection's 'delegated as' clause always lists all three delegate signatures even when the round stopped before execute/verify

- **File:** lib/repair.js
- **Lines:** 218-222
- **Severity:** INFO
- **Evidence:** `` `- actions: ${steps.join(" → ")} — delegated as plan({ phase: ${phaseNum}, gaps: true }), execute({ phase: ${phaseNum}, gapsOnly: true }), verify({ phase: ${phaseNum}, gaps: true })` `` — the "delegated as" tail is a fixed template; a round that stopped at plan (steps: "plan(gaps)") still logs execute()/verify() signatures in REPAIR.md, overstating what the round actually delegated to a human auditing the log.
- **Suggestion:** Build the delegated-args clause from the ran flags (e.g. only include the signature for each step in `steps`), so the recorded actions and the delegation claim always agree.

### CR-10: peerDependencies declares @deepseek-ai/schemastery and @deepseek-ai/cordis, which no module imports

- **File:** package.json
- **Lines:** 138-143
- **Severity:** INFO
- **Evidence:** `"peerDependencies": { "@deepseek-ai/dsh-tools": "^0.1.1-rc.2", "@deepseek-ai/schemastery": ">=3.18.1", "@deepseek-ai/cordis": ">=4.0.1", "@deepseek-ai/dsh-llm": "^0.1.1-rc.2" }` — grep across lib/ and test/ finds imports only of @deepseek-ai/dsh-tools and @deepseek-ai/dsh-llm; schemastery and cordis are never imported (the host supplies ctx/provide/inject at runtime). Peers that are never referenced force installs that the code does not require.
- **Suggestion:** Either drop the two unused peer entries, or add a one-line comment/README note marking them as host-contract peers consumed via the injected ctx (not imported), so the declaration is intentional and auditable.

### CR-11: Stale header comment: says 'the 11-key capability surface' while the suite asserts 28 keys

- **File:** test/_capabilities.test.mjs
- **Lines:** 1-4
- **Severity:** INFO
- **Evidence:** "// Unit tests for the capability descriptor model in lib/_capabilities.js.
// Proves DEGR-01 (the 11-key capability surface), the D-03 descriptor shape, ..." while the first test asserts `assert.equal(CAPABILITY_KEYS.length, 28)` and the key list ends with gsdPhaseManagement/gsdRepair.
- **Suggestion:** Update the header comment to say 28 keys (or drop the count from prose and reference CAPABILITY_KEYS.length so it cannot go stale again).

### CR-12: ensureAutoContext runs twice per phase — once in runAutonomous and again inside drivePhase

- **File:** lib/autonomous.js
- **Lines:** 170,251
- **Severity:** INFO
- **Evidence:** runAutonomous: `try { await ensureAutoContext(cwd, s, ctx, phase, exec); } catch ...` and then drivePhase's first statement: `await ensureAutoContext(cwd, s, ctx, phase, exec); // throws → hard failure` — the second call re-stats the artefact and always takes the `{ wrote: false }` path; only its branch-acquisition side effect on the FIRST write differs (already covered by the outer call).
- **Suggestion:** Remove the ensureAutoContext call from drivePhase (or from runAutonomous's pre-step), keeping one acquisition point; drivePhase currently also ignores ensureAutoContext's commit result, so a single caller-owned call is clearer.

---

*Phase: 58-node-repair*
*Code review: 2026-09-08*
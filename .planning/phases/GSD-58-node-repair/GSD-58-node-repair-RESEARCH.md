All research complete. Baseline confirmed green (1043 tests pass, exit 0). Below is the full RESEARCH.md for the orchestrator to write to disk.

---

# Phase 58: node-repair — RESEARCH.md

**Phase:** 58 — node-repair · **Milestone:** core-loop-helpers · **Requirement:** CLH-08
**Research date:** 2026-09-08 · **Baseline:** `npm test` → **1043 pass / 0 fail** in 3.26s on this checkout this session [VERIFIED: background `npm test` run, exit code 0]
**Working tree:** branch `phase-58`, only `.planning/STATE.md` modified (loop cursor at `status: plan`, `active_phase: 58`) [VERIFIED: `git status --short`, `git branch --show-current`, `.planning/STATE.md:1-15`]

---

## 1. Domain analysis

### 1.1 What this phase builds (restated from locked CONTEXT)

A new standalone orchestrator tool `gsd_repair` (+ `/gsd-repair` command) that, for a phase whose `VERIFICATION.md` status is exactly `gaps_found`, runs bounded rounds of **plan(gaps) → execute(gapsOnly) → verify(gaps)** — delegating to the existing tools, never forking them — writes an accumulating `<NN>-REPAIR.md`, re-points `gsd_verify`'s `gaps_found` routing text at `gsd_repair`, and wires the same shared round-loop into `gsd_autonomous` in place of its immediate hard stop on `gaps_found`. No new loop step, no STATE step, no config knob, no new runtime dependencies. (CONTEXT D-01…D-12 — LOCKED.)

### 1.2 The gap-closure machinery already exists and is production-tested — repair only sequences it

Every building block repair needs is already shipped and individually tested. Repair is an orchestrator over them, in the strict order D-06 requires. Confidence: **HIGH** (all read this session).

**Step 1 — `gsd_plan(phase, gaps: true)`** [VERIFIED: lib/plan.js]
- Parameter exists: `gaps: { type: "boolean", description: "Gap-closure mode: planner produces fix plans for UAT gaps." }` (lib/plan.js:70).
- In gaps mode the planner prompt gets `MODE: gap_closure.` (lib/plan.js:168) plus the prior `VERIFICATION.md` and `UAT.md` injected as context (lib/plan.js:139-148) — the fix planner sees the gaps it must close.
- **The researcher is skipped** when `RESEARCH.md` already exists: `if (!args.skipResearch && (!hasResearch || args.forceResearch))` (lib/plan.js:116). Since a post-verify phase always has RESEARCH.md, a repair round's plan call is planner + plan-checker only (+ the mempalace hooks). Confidence: HIGH.
- **Built-in fix-plan guard** (lib/plan.js:186-201): if no plan with `gap_closure: true` was produced, it re-prompts the planner once with `"Gap-closure mode: you MUST write a NEW fix plan file at ${phaseDir}/${base}-04-PLAN.md (or the next free <PP>) with frontmatter gap_closure: true. The existing plans (${plans.map((p) => p.id).join(", ")}) are NOT fix plans. Use the Write tool to create the file on disk — do not just describe it."` (lib/plan.js:193) and then fails loud: `"gsd_plan: gap-closure mode but no fix plan (gap_closure: true) was produced in ${phaseDir} after re-prompting. gsd_execute --gaps-only would run nothing. Planner output:\n${plannerRes.output}"` (lib/plan.js:199). So plan.js already implements most of D-11's "no fix plan → stop with real cause"; repair must not blind-retry on top of it.
- **Closed-phase gate interaction** (lib/plan.js:90-93): `if (!args.force && await s.hasArtifact(cwd, args.phase, "VERIFICATION")) { … if (isClosedPhase(v)) throw … }` with message `"gsd_plan: phase ${args.phase} already passed verification. Re-run with force=true to replan (clears the closed-phase gate)."` (lib/plan.js:92). `isClosedPhase` is true only for frontmatter `status: passed` (lib/_shared.js:435-438). Because repair only ever invokes plan while the status is `gaps_found`, the gate never fires and **repair must not pass `force: true`** (it would be unnecessary and weakens the gate).
- On success it sets STATE step to `execute`, appends a STATE decision line, and commits with scope `plan` (lib/plan.js:225-227).
- **Failure surface:** plan returns error *strings* (not throws) for several paths — phase-split recommendation (lib/plan.js:180), researcher unusable (lib/plan.js:130), no plans produced (lib/plan.js:185), no fix plan after re-prompt (lib/plan.js:199), missing CONTEXT (lib/plan.js:96). Throws only for service/phase/closed-phase errors. Repair's step-outcome detection must therefore not rely on exceptions alone (see §1.5).

**Step 2 — `gsd_execute(phase, gapsOnly: true)`** [VERIFIED: lib/execute.js]
- Parameter exists: `gapsOnly: { type: "boolean", description: "Only execute plans with gap_closure: true (fix plans from /gsd-verify-work)." }` (lib/execute.js:49).
- Filter: `let plans = idx.incomplete.filter((p) => !p.has_summary); if (args.gapsOnly) plans = plans.filter((p) => matchesGapClosure(p.gap_closure));` (lib/execute.js:72-73), where `matchesGapClosure(value)` is `value === true || String(value).toLowerCase() === "true"` (lib/_shared.js:364-366) — tolerant of `"True"` strings from model-written frontmatter.
- Resume is automatic: a persisted `CHECKPOINT-<PP>` with no SUMMARY makes the plan resumable via `prepareCheckpoint` (lib/_checkpoint.js:35-91); a completed SUMMARY wins and cleans the stale CHECKPOINT (lib/execute.js:157-163). Per-plan job rows reconcile to `done`/`failed` with `checkpointed (resumable)` as a non-failure result (lib/execute.js:170-178).
- Outcome signal lines in the returned log: `✓` per completed plan, `⏸ checkpointed at task N` (lib/execute.js:183), `✗ — no SUMMARY.md written (stopReason=…)` (lib/execute.js:185), and the awaiting markers `GSD_AWAITING_HUMAN: plan …` appended verbatim (lib/execute.js:190; marker format lib/_shared.js:515-517: `GSD_AWAITING_HUMAN: plan ${plan} awaits your decision (checkpoint:${kind}); decision_id=${id}; question=${q}`).
- Terminal STATE handling: all plans complete → `setActivePhase(cwd, phase, "verify")` + `"Phase N execution complete. Next: gsd_verify on phase N."` (lib/execute.js:214-216); otherwise stays `execute` + `"Phase N partially executed (N plan(s) this run). Re-run gsd_execute to resume."` (lib/execute.js:218-219). Commits scope `execute` (lib/execute.js:221).

**Step 3 — `gsd_verify(phase, gaps: true)`** [VERIFIED: lib/verify.js]
- Parameter exists: `gaps: { type: "boolean", description: "Re-verification after gap-closure: focus previously-failed items." }` (lib/verify.js:51); it appends `"\nRE-VERIFICATION MODE: focus previously-failed items; quick regression on passed truths."` to the verifier prompt (lib/verify.js:104).
- Verify early-returns (strings) when plans are missing (`"gsd_verify: no plans for phase N. Run gsd_plan first."`, lib/verify.js:75) or summaries are missing (`"gsd_verify: missing SUMMARY.md for X. Run gsd_execute first."`, lib/verify.js:77) — after a completed execute these cannot fire, but they define the ordering contract repair relies on.
- The authoritative status is read back from the written file, **not** from the subagent: `const verText = await s.readArtifact(cwd, args.phase, "VERIFICATION").catch(() => "")` then `let status = "gaps_found";` as the default when the file is absent/empty, overridden by `frontmatter.status` when present (lib/verify.js:110-117). **Note the optimistic default** — verify itself degrades a missing file to `gaps_found`; repair must do its own read and treat missing as a stop (D-04), not inherit this default (Risk R4).
- It advances STATE: `setActivePhase(cwd, args.phase, status === "passed" ? "ship" : "verify")` (lib/verify.js:118) and commits scope `verify` (lib/verify.js:119).
- **The exact routing text D-02 changes** (lib/verify.js:128, verbatim):
  ```
  gaps_found: `✗ Phase ${args.phase}: gaps found (score ${score || "n/a"}). Next: gsd_plan on phase ${args.phase} with gaps=true to produce fix plans, then gsd_execute --gaps-only, then gsd_verify again.`,
  ```
  Also carrying routing wording: the tool `description` (lib/verify.js:48, fragment `gaps_found -> re-plan with gsd_plan --gaps`) and the header comment (lib/verify.js:6-7). No test asserts the route string (grep over test/*.test.mjs found no match on this text), so re-pointing it is safe; the nearest assertion is on plan's own guard message (`/--gaps-only would run nothing/`, test/tools.test.mjs:634), which stays unchanged.

### 1.3 The orchestrator delegation precedent — this is the pattern to copy

`lib/quick.js` already delegates to plan/execute/verify/ship **in-process** for `gsd_mvp_phase`, including the exact dual-shape tool lookup repair needs [VERIFIED: lib/quick.js:40-47, 363-386; test/service-tools.test.mjs:376-416]:

```js
// lib/quick.js:43-47 (verbatim)
function findTool(ctx, name) {
  if (Array.isArray(ctx.tools)) return ctx.tools.find((t) => t && t.name === name);
  if (ctx.tools && typeof ctx.tools.get === "function") return ctx.tools.get(name);
  return undefined;
}
```

- The comment above it (lib/quick.js:40-42) states why both shapes exist: *"A bare Array.isArray branch would always throw 'gsd_ship tool not registered' in production, so this helper must handle both"* — i.e. the production host `tools` service answers `.get(name)`, while tests frequently pass arrays. Confidence: HIGH.
- Delegation discipline (lib/quick.js:363-375, verbatim error shape): `const planTool = findTool(ctx, "gsd_plan"); if (!planTool || typeof planTool.execute !== "function") throw new Error("gsd_mvp_phase: gsd_plan tool not registered — cannot plan"); const planOut = await planTool.execute({ phase: phase.n }, exec);`
- Post-verify status readback + stop (lib/quick.js:379-383, verbatim): reads `VERIFICATION.md` via `s.readArtifact(...)` + `parseFrontmatter`, and on non-passed returns `"gsd_mvp_phase: phase ${phase.n} did not pass verification (status: ${frontmatter.status || "unknown"}). Stopping — the phase is left uncompleted. Re-run gsd_verify or use the full loop.\n\n${verifyOut}"`.
- Test coverage of both lookup shapes exists: `test/service-tools.test.mjs:376-416` ("ship delegation works via the service ctx.tools.get branch (production shape)") injects `c.tools` as either an array or `{ get(name) }`. Confidence: HIGH — repair should reuse `findTool` (export it from quick.js or duplicate the 5-line helper; see OQ-4) and mirror this test seam.

The only other cross-tool invocation pattern in the repo is the mempalace hook (`Array.isArray(tools) ? tools.find(...) : null`, lib/discuss.js:47, lib/plan.js:29, lib/verify.js:29) — skip-not-fail semantics, which are **wrong** for repair's delegates (repair cannot work without them; D-06/D-11 require stop-with-cause instead). Confidence: HIGH.

### 1.4 Status reading conventions (trigger gate, D-04/D-05)

Two established readers exist [VERIFIED]:
- `lib/autonomous.js:184-194` `readVerifyStatus`: missing/unreadable artefact or absent frontmatter status → `{ status: "missing" }`; otherwise the verbatim frontmatter `status` string. This is the reader whose gaps_found branch D-09 rewires.
- `lib/verify.js:110-117` (see §1.2) — defaults missing to `gaps_found` (optimistic; do not copy).
- `isClosedPhase` (lib/_shared.js:435-438) is the third reader: exactly `status === "passed"` after trim+lowercase.

For repair's trigger gate the three recognised statuses are exactly `passed | gaps_found | human_needed` (the verifier's status decision tree, lib/verify.js:1-7 header). D-04 requires distinct stop causes for: missing file, missing/unparseable status field, and `human_needed`. Recommendation: one small reader that returns `{ status: "gaps_found" | "passed" | "human_needed" | "missing-file" | "unparseable" }`, mirroring `readVerifyStatus` but distinguishing file-absent from status-field-absent. Discretion: naming.

### 1.5 Step-outcome detection: artefact state, not output sniffing

The delegated tools return human-facing strings; failures are a mix of thrown errors and error-prefixed return strings. The robust discriminator — consistent with the repo's CQ-03 "structured fields, not string parsing" discipline — is **artefact state after each step**, with the tool's returned text folded into the reported cause [design recommendation; confidence HIGH because every input is verified above]:

| After step | Success check (artefact state) | Stop-with-cause condition (D-11/D-04) |
|---|---|---|
| `gsd_plan(gaps:true)` | `s.listPlans(cwd, phase)` contains ≥1 plan with `matchesGapClosure(p.gap_closure) && !p.has_summary` (state.js:758-792 exposes `gap_closure`/`has_summary`) | no runnable fix plan exists → cause = plan's returned text (split recommendation / no fix plan / researcher failure) |
| `gsd_execute(gapsOnly:true)` | every `gap_closure` plan now `has_summary` | any fix plan still summary-less → if `CHECKPOINT-<PP>` artefact exists → "checkpointed at task N — resume via gsd_execute (answer/decision_id)"; if output contains `GSD_AWAITING_HUMAN:` surface the marker line; else "no SUMMARY written (stopReason=…)" |
| `gsd_verify(gaps:true)` | read `VERIFICATION.md` status | `passed` → success; `gaps_found` → next round or budget-exhausted stop; `human_needed` → stop (human cause); missing/unparseable → stop (D-04) |

The one designed string contract worth matching is the `GSD_AWAITING_HUMAN` marker (lib/_shared.js:515-517) — it is explicitly *"the stable marker the driving agent regex-detects"* (lib/execute.js:187-190), so regexing it is house-sanctioned, and it must be passed through to the human untouched rather than swallowed.

### 1.6 Autonomous rewire point (D-09)

[VERIFIED: lib/autonomous.js:266-275] The driver's post-phase block, verbatim:

```js
    // (3) read the verify status back from VERIFICATION.md (authoritative).
    // Success requires exactly status === "passed"; anything else (missing /
    // gaps_found / human_needed / unparseable) is a hard-failure stop (D-09).
    const { status } = await readVerifyStatus(cwd, s, phase.n);
    statuses.push({ number: phase.n, name: phase.name, status: status === "passed" ? "passed" : status });
    if (status !== "passed") {
      stopReason = `Phase ${phase.n}: verification status "${status}" (non-passed)`;
      outcome = "stopped";
      break;
    }
```

The rewire inserts the shared repair loop **between the status read and this stop**: `gaps_found` → run rounds (shared helper, same 2-round cap) → if now `passed`, continue the phase loop (the re-read of ROADMAP at (4) proceeds); if still non-passed after budget → hard stop with a stopReason that names the remaining gaps + exhausted budget (phase 49 D-09 semantics preserved); `human_needed`/`missing` → stop immediately as today (D-04). The autopilot prompt (`buildAutopilotPrompt`, lib/autonomous.js:139-156) needs **no change** — repair runs driver-side in-process, exactly like the shared helper, not inside the child. The existing test `test/autonomous.test.mjs:311-332` ("(f) verify gaps_found → stopped, resume command, no later phase spawns (D-09)") **must be rewritten** to expect the repair attempt (its fake verifier returns gaps forever → after budget, still stops); the sibling "(f) missing VERIFICATION → stopped" test (line 333) stays valid.

### 1.7 Mount/registration surface — the exact "house pattern" checklist

Every prior phase follows the same registration dance; phase 58 must touch all of these [VERIFIED this session]:

1. **New plugin module** (e.g. `lib/repair.js`): exports `name` (`"gsd-repair"`), `inject` (house pattern is `["gsdState", "tools", "subagents"]` — both quick.js:16 and autonomous.js:33 declare all three even when delegation is indirect), `apply(ctx)` that provides the capability and registers the tool.
2. **Capability descriptor** (lib/_capabilities.js): append `"gsdRepair"` to `CAPABILITY_KEYS` (currently 27 entries, lib/_capabilities.js:32-60) and add a TABLE row mirroring the out-of-band precedents (`gsdAutonomous` lib/_capabilities.js:331-341, `gsdAddTests` :342-352): `role: "out-of-band"`, `order: NOT_LOOP_ORDERED` (= -1, lib/_capabilities.js:17), `tools: ["gsd_repair"]`, `commands: ["gsd-repair"]`, `produces: ["REPAIR.md", …]`, `consumes: ["VERIFICATION.md"]`. **A descriptor is mandatory** — see OQ-1.
3. **Slash command** (lib/commands.js): a COMMANDS entry `{ name: "gsd-repair", description, hint: "<N> [--rounds 1|2]", build }` following the flag-parsing idiom (`/--rounds\s+(\d+)/`, cf. `--draft` lib/commands.js:239, `--repair` :225). Pairing is automatic via the descriptor (lib/commands.js:449-462).
4. **Patch row** (cordis.patch.yml insert block): `- id: gsd-repair` / `name: '@dsh-gsd/bundle/repair'`, with a comment in the house style ("out-of-band orchestrator … not a loop step", cf. the gsd-autonomous comment cordis.patch.yml:142-148).
5. **package.json**: add `"./repair": { "default": "./lib/repair.js" }` to `exports` (mount test asserts every patch row resolves through exports + dynamic import, test/mount.test.mjs:222-234). The `"files": ["lib/*.js", …]` glob already ships the new file — no files change (package.json:118-128).
6. **Count/test bumps** (all hardcoded, all must change):
   - `test/mount.test.mjs:147` `ctx.tools.length === 36` → **37**; `:148` `ctx.commands.length === 33` → **34**; `:159` + `test/_capabilities.test.mjs:13` `CAPABILITY_KEYS.length === 27` → **28**; `:215` `insertRows.length === 26` → **27**; `:328` `ctx.tools.length === 36` → **37** (schema-check test); add `"gsd_repair"` to `EXPECTED_TOOL_NAMES` (test/mount.test.mjs:99-113) and `"gsd-repair"` to `EXPECTED_COMMAND_NAMES` (:115-131).
   - `test/helpers/mount-harness.mjs` `PATCH_ROWS` (26 rows, verbatim from the patch): add `{ id: "gsd-repair", sub: "repair" }`.
   - `test/removal.test.mjs` is data-driven over `role === "step"` caps only (test/removal.test.mjs:21-22, 40-47) — an out-of-band repair joins neither the retirement matrix nor the loop renderer automatically. No matrix churn (matches D-01).
   - `test/phase-tools-git.test.mjs` uses static source assertions per tool (imports commitArtifacts, calls it with its scope exactly once, after the STATE call; test/phase-tools-git.test.mjs:20-40) — the same three assertions can be added for `lib/repair.js`/scope `"repair"`.
7. **Persona/render:** automatic and correct — `loopSteps` filters `LOOP_ROLES = ["step", "optional", "alternate"]` (lib/_render.js:19), so an out-of-band repair never appears in "Available steps" or the persona loop (DEGR-02 untouched); `informationEntries` includes `"out-of-band"` (lib/_render.js:20, 91-93) so repair shows up in `gsd_status`'s informational list exactly like undo/health/autonomous. No persona.js change needed (lib/persona.js:42-59 renders from descriptors only).
8. **README/CHANGELOG:** README's tables are a curated subset (no rows exist for `gsd_health`/`gsd_undo`/`gsd_autonomous` — verified by grep) and no test enforces README↔plugin parity; a README row + CHANGELOG entry is discretionary convention. CHANGELOG must keep its `## [Unreleased]` section (test/repo-hygiene.test.mjs:37-45).

### 1.8 Artefact & STATE mechanics

- **REPAIR.md naming**: `s.writeArtifact(cwd, phase, "REPAIR", text)` → `<base>-REPAIR.md` via `_artifactFile` (lib/state.js:721-732) — matches D-10's `<NN>-REPAIR.md` with zero new plumbing.
- **Append semantics**: `writeArtifact` **overwrites**; there is no append accessor in GsdState. D-10's "created on the first round and appended per round" is a read-modify-write: `const prior = await s.readArtifact(cwd, phase, "REPAIR").catch(() => "");` then write `prior + section`. All writes route through `ctx.fs` via GsdState (DUR-06 discipline, lib/state.js:117-121). Confidence: HIGH.
- **Committing**: `commitArtifacts(cwd, phase, { scope: "repair", phaseName })` (lib/_git-artifacts.js:174-201). The message template is `docs(planning): phase ${phaseNum} ${slugify(opts.phaseName)} ${opts.scope} artefacts` (lib/_git-artifacts.js:175) — `scope` is free-form, no allowlist, so `"repair"` needs no seam change. It stages `.planning` wholesale and never throws. Note the delegated plan/execute/verify calls each commit `.planning` wholesale themselves, so intermediate REPAIR.md sections ride those commits; repair's own scope-`repair` commit captures the final state (cadence recommendation in OQ-7).
- **STATE discipline**: repair never calls `setActivePhase`/`completePhase` — the delegated tools own every STATE transition (plan → `execute`, execute → `verify`/stay, verify → `ship`/`verify`; lib/plan.js:225, lib/execute.js:214-219, lib/verify.js:118). Repair is an action, not a step: the STATE step vocabulary is untouched (`const STEPS = ["discuss", "ui", "plan", "execute", "verify", "ship", "done"]`, lib/state.js:27). Mirrors autonomous's D-10 invariant (lib/autonomous.js:12-17).

### 1.9 Pitfalls (each with confidence)

- **P1 — String-sniffing tool outputs as the success oracle.** Fragile; use artefact-state checks (§1.5) and fold returned text into causes. Confidence: HIGH (failure surfaces verified).
- **P2 — Inheriting verify's optimistic `gaps_found` default** when the verify subagent fails to rewrite VERIFICATION.md: repair would read the stale prior-round file and misread "no progress" as "still gaps". Bounded by the round budget; report the verify output excerpt in the cause so the human sees the real failure. Confidence: HIGH (lib/verify.js:111 read).
- **P3 — Passing `force: true` to gsd_plan.** Unnecessary (status is never `passed` when a round starts) and it disables a safety gate. Never pass it. Confidence: HIGH.
- **P4 — Double budget interpretation.** "Budget of 2" = **2 rounds** = 2×(plan+execute+verify), i.e. up to 2 fix-plan attempts, matching the human's "two attempts before stopping" (CONTEXT specifics). A round that stops early (plan produced no fix plan) consumes its attempt and stops the invocation (D-11: no blind-retry of the same round). Confidence: HIGH (locked decisions).
- **Rounds vs attempts naming**: D-03/D-07 use "rounds" for the budget and "round" for one plan→execute→verify cycle. Keep one term. Confidence: HIGH.
- **P5 — Swallowing `GSD_AWAITING_HUMAN`.** Repair must surface the marker and stop; the answer flows through the existing `gsd_execute` `answer`/`decision_id` two-turn channel (lib/_checkpoint.js:35-91), then the human re-invokes `gsd_repair` (artefact state has advanced; repair resumes cleanly). Confidence: HIGH.
- **P6 — Recursion guard.** A repair round must never re-enter `gsd_repair`. Unlike the autonomous autopilot (whose only defence is prompt text, lib/autonomous.js:149-153), repair delegates in-process, so there is no recursion surface at all — a structural advantage worth stating in the tool description. Confidence: HIGH.
- **P7 — Autonomous test (f) rewrite.** The existing gaps_found stop test asserts `captures.length === 1`; after the rewire a gaps-found phase legitimately spawns the repair delegates, so the assertion must change meaning (stop only after budget exhaustion). Confidence: HIGH (test read, test/autonomous.test.mjs:311-332).

---

## 2. Package legitimacy

**No new dependencies are proposed** (D-12: node builtins only; the repo has `"dependencies": {}` — package.json:134). Every touchpoint repair uses is already a shipped in-repo module or an existing peer dep:

| Touchpoint | Claim | Source |
|---|---|---|
| `@deepseek-ai/dsh-tools` (`defineTool`) | already the tool-definition seam; installed version `0.1.1-rc.2` matches `peerDependencies: "^0.1.1-rc.2"` | [VERIFIED: node_modules/@deepseek-ai/dsh-tools/package.json:2-4 + package.json:135-140, read this session] |
| `node:test` / `node:assert/strict` | test runner + assertions, no package | [VERIFIED: package.json:31 `"test": "node --test test/*.test.mjs"`; all test files] |
| `node:child_process` `execFile` (via `_git-artifacts.js`) | git seam repair inherits for its commit; fixed `-C cwd` argument arrays, no shell | [VERIFIED: lib/_git-artifacts.js:18-30, 14-16] |
| No npm registry lookups required | no new package names enter this phase | [VERIFIED: D-12 + dependency inventory above] |

Package names mentioned anywhere in this document other than the above are in-repo module names, not registry claims.

---

## 3. Risks

| # | Risk | Severity | Mitigation (evidence-backed) |
|---|------|----------|------------------------------|
| R1 | Delegated tools signal failures as error-prefixed **return strings**, not throws — a throw-only failure policy would silently treat them as success | HIGH | Artefact-state oracle per step (§1.5); tool text folded into stop causes; throws propagate as stops |
| R2 | A round's plan call can legally produce a fix plan whose number collides with a *completed* prior fix plan edited in place (planner rewrites `<PP>-04-PLAN.md` while `04-SUMMARY.md` exists → `has_summary` true → "no runnable fix plan") | LOW | Accept the stop-with-cause (planner output names what it did); the budget bounds waste. Do not invent mtime heuristics (FakeFs `stat` exposes no mtime — test/helpers/fake-fs.mjs:29-33) |
| R3 | Repair invocations are long (a full round spawns planner+checker(+revisions)+N executors+verifier) and the tool is synchronous | INFO | Document in the tool description; no concurrency requested (CONTEXT out-of-scope: multi-window repair) |
| R4 | Stale VERIFICATION.md readback after a failed verify subagent (P2) burns a round on identical gaps | LOW | Budget-bounded; surface verify's own output excerpt in the round section so the cause is visible |
| R5 | `/gsd-route` currently maps the bare phrase `"repair"` to `gsd_health` (lib/_route.js:173, verbatim `{ phrase: "repair", weight: 1 }` under `gsd_health:`) — after this phase, "repair the phase" intents still route to config-repair | LOW | Out of the locked domain (CONTEXT scopes routing-text changes to gsd_verify); record as a deferred follow-up (OQ-5). The `gsd-repair` exact-name phrase can be added later without schema change |
| R6 | `gsd_repair` invoked on a phase whose plan/execute/verify plugins were retired (DEGR retirement) → `findTool` returns undefined | LOW | Fail-loud per the mvp-phase pattern: `gsd_repair: gsd_plan tool not registered — cannot repair` (mirrors lib/quick.js:364) |
| R7 | Repair's own commit could double-commit artefacts the delegated tools just committed | LOW | `commitArtifacts` stages only what's newly changed (`git diff --cached --name-only` gate, lib/_git-artifacts.js:183-191) and warns "nothing staged" harmlessly |

---

## 4. Open Questions

All questions below are **(RESOLVED)** — planning can proceed. Each records the evidence that resolved it.

- **OQ-1 — D-01 says "no capabilities churn", but `/gsd-repair` needs a capability descriptor to pair with.** (RESOLVED) The command layer pairs every command to a capability descriptor: `const capKey = commandToCapability.get(c.name); ctx.inject([capKey, "commands"], …)` (lib/commands.js:449-463) — a command with no descriptor would inject `undefined` and never register. Every out-of-band tool (undo/health/autonomous/add-tests/phase-management) ships exactly one descriptor row with `role: "out-of-band"`, `order: NOT_LOOP_ORDERED` (lib/_capabilities.js:265-363). Recommendation: add ONE `gsdRepair` row + `ctx.provide("gsdRepair", buildCapability("gsdRepair"))`. This *is* the "registration of the one new tool + command" D-01 permits; because the role is out-of-band, the loop chain, persona rendering, STATE step machine, and removal matrix are untouched — D-01's intent (no loop/step churn) is honored, and the count bumps in §1.7(6) are the only test churn.
- **OQ-2 — How does repair invoke the delegated tools without forking them?** (RESOLVED) In-process delegation via the dual-shape `findTool` seam (lib/quick.js:43-47) + `tool.execute(args, exec)`, exactly as `gsd_mvp_phase` does (lib/quick.js:363-386) and as the fast-mode tests prove for both shapes (test/service-tools.test.mjs:376-416). Repair must reuse or re-declare `findTool` (5 lines; recommend reusing via export or a shared internal — planner's discretion per CONTEXT) and fail loud when a delegate is missing. This satisfies D-08 by construction: prompts, plan-checker, STATE transitions, and artefact commits all live inside the delegated executes.
- **OQ-3 — How does repair detect each step's outcome without string parsing?** (RESOLVED) Artefact-state oracle: post-plan `listPlans().some(p => matchesGapClosure(p.gap_closure) && !p.has_summary)`; post-execute every gap plan `has_summary` (+ `CHECKPOINT-<PP>` presence and `GSD_AWAITING_HUMAN` marker for the precise cause); post-verify `parseFrontmatter(readArtifact(…, "VERIFICATION")).status`. Returned tool text is carried into causes/reports, never used as the oracle. (`matchesGapClosure` already exists — lib/_shared.js:364-366; reuse, don't reimplement.)
- **OQ-4 — Where does the shared round-loop helper live, and how are circular imports avoided?** (RESOLVED) New `lib/repair.js` exports the plugin (`name/inject/apply`) plus the shared helpers (`runRepairRounds(...)`, a status reader, and the budget constant `2`). `lib/autonomous.js` imports from `./repair.js`; `repair.js` never imports `autonomous.js` — one-way, no cycle. This matches the CONTEXT discretion note and the repo's helper-module conventions (`_checkpoint.js` pattern: helpers take `s`/ports as parameters, lib/_checkpoint.js:1-17).
- **OQ-5 — Should `_route.js`'s `"repair"` phrase (weight 1 → gsd_health) be re-pointed?** (RESOLVED: out of scope) The locked domain names only "updated gaps_found routing text in gsd_verify"; `_route.js`/CLH-04 changes are not in scope. Leave lib/_route.js:173 as-is; note as a deferred follow-up so the known mis-route is documented.
- **OQ-6 — What happens on invalid `rounds` (0, 3, non-integer)?** (RESOLVED: fail-loud) D-03 fixes the domain as 1..2; anything else stops with a clear cause before any work ("rounds must be an integer between 1 and 2" — exact wording is Claude's Discretion per CONTEXT). This matches D-11's stop-with-cause universal failure mode.
- **OQ-7 — REPAIR.md commit cadence and cross-invocation behaviour?** (RESOLVED: recommend) Append (never truncate) so repeat invocations accumulate; write the round section immediately after each round; commit once per invocation on **every** exit path (success, budget-exhausted, stop-with-cause) via `commitArtifacts(…, { scope: "repair", phaseName })`. Intermediate sections ride the delegated tools' wholesale `.planning` commits (lib/_git-artifacts.js:178), so nothing is lost if repair dies mid-round. Layout suggestion (discretion): small fenced frontmatter (`phase`, `rounds_run`, `final_status`) + one `## Round N` section per round + a `## Stop` section when stopped — parseable by `parseFrontmatter` like every other artefact.
- **OQ-8 — Where exactly does the autonomous rewire go, and does the autopilot prompt change?** (RESOLVED) In `runAutonomous` between the `readVerifyStatus` call and the non-passed stop (lib/autonomous.js:269-275): `gaps_found` → shared rounds → continue on `passed`, hard-stop with a budget/stopReason mention on still-non-passed; `human_needed`/`missing` unchanged immediate stops. `buildAutopilotPrompt` (lib/autonomous.js:139-156) is untouched — repair is driver-side and in-process, so the prompt's guard list needs no new text.
- **OQ-9 — Does a repair round's plan call re-run the researcher?** (RESOLVED: no) `if (!args.skipResearch && (!hasResearch || args.forceResearch))` (lib/plan.js:116) — RESEARCH.md exists post-verify, so the researcher is skipped and the round is planner+checker only. Do not pass `forceResearch`/`skipResearch`.
- **OQ-10 — Conflict between verify's internal `gaps_found` default and repair's trigger reading?** (RESOLVED) Repair never reuses verify's default; it reads the artefact itself (autonomous's `readVerifyStatus` shape, lib/autonomous.js:184-194) and treats missing-file/absent-status/unrecognized as distinct stop causes (D-04). The stale-file risk is accepted and documented (R4/P2).

---

## 5. Architectural Responsibility Map

Tier model: **presentation** (what humans/agents read) → **domain** (decision logic) → **data** (artefact I/O via gsdState) → **integration** (subprocess/git/delegation seams). A security-sensitive capability in the wrong tier is a BLOCKER.

| Capability | Tier | Rationale / owner |
|---|---|---|
| Verification-status trigger gate (gaps_found vs passed/human_needed/missing/unparseable + cause strings) | **domain** | Pure-ish classifier over artefact text; I/O delegated to the `gsdState` port (the `_checkpoint.js` helper pattern). Lives in lib/repair.js. Must NOT live in presentation (report text) or integration (git). |
| Round-budget machine (default 2, per-call 1..2, cap 2, no blind retry) | **domain** | Pure state machine over {round, lastStatus}; no I/O of its own. |
| Step-outcome oracle (fix-plan runnable check, summary completeness, checkpoint/marker detection) | **domain** (predicates) + **data** (reads via `s.listPlans`/`s.readArtifact`) | MatchesGapClosure reused from lib/_shared.js:364-366; never re-implemented. |
| Delegation to gsd_plan/gsd_execute/gsd_verify | **integration** | The ONLY place repair touches other tools: `findTool(ctx, name)` + `execute(args, exec)`. Forking these internals (duplicating prompts/commits/STATE writes) would be a **BLOCKER** against D-08. |
| REPAIR.md write/append | **data** | Only via `s.readArtifact`/`s.writeArtifact` (ctx.fs) — never raw `node:fs/promises` (DUR-06). |
| Repair artefact commit | **integration** | `commitArtifacts(cwd, phase, { scope: "repair", phaseName })` — fixed-argument-array git only (lib/_git-artifacts.js:14-16, 174-201). Repair never pushes, force-commits, or bypasses gates (D-12). |
| Tool-result report sections + `/gsd-repair` command router + REPAIR.md markdown layout | **presentation** | Pure text assembly; wording is Claude's Discretion. |
| STATE advancement | **(none — explicitly not repair's)** | Delegated tools own every `setActivePhase`; repair must not call it (D-01 "action not step"; mirrors autonomous D-10). |

---

## 6. Validation Architecture

What automated checks prove each behaviour (inputs to the later Nyquist/coverage gate). All seams below already exist and are used by shipped tests [VERIFIED: test files cited].

| # | Behaviour (decision) | Automated proof | Reusable seam |
|---|---|---|---|
| V1 | Trigger gate: `gaps_found` proceeds; `passed` → success no-op, zero delegate calls (D-05); `human_needed` / missing file / unparseable status each stop with distinct cause, zero delegate calls (D-04) | Unit/integration over FakeFs with `VERIFICATION_PASSED` / `VERIFICATION_GAPS` fixtures (test/helpers/project.mjs:75-88) + a counting fake delegate trio | `buildProject`, `registerTool` (test/tools.test.mjs:216-225) |
| V2 | `rounds` validation: default 2; `rounds:1` honored; 0/3/non-integer fail loud before any delegate call (D-03) | Parameter assertions on captured delegate-call counts | Counting fakes à la `shipCalls` (test/service-tools.test.mjs:381-385) |
| V3 | Round order is strictly plan → execute → verify, each invoked with exactly `{ phase, gaps:true }` / `{ phase, gapsOnly:true }` / `{ phase, gaps:true }` (D-06) | Recorded delegate args + call order | Same capture idiom |
| V4 | Delegation reuses the real tools, not forks (D-08) | Static source assertion: lib/repair.js imports nothing from plan/execute/verify internals and contains no `PLANNER_PROMPT`/`EXECUTOR_PROMPT`/`VERIFIER_PROMPT`/inline git | test/phase-tools-git.test.mjs static-readFile style (lines 20-40) |
| V5 | Missing delegate tool → fail-loud named error, no partial artefacts (D-11) | ctx.tools without gsd_plan → rejects `/gsd_plan tool not registered/` | mvp-phase precedent (lib/quick.js:364) |
| V6 | Plan round produces no runnable fix plan → stop, cause includes the plan tool's returned text, execute never called (D-11) | Fake plan delegate returning the real no-fix-plan string (lib/plan.js:199) or leaving no gap plan on FakeFs | FakeFs + listPlans oracle |
| V7 | Execute round leaves fix plan checkpointed/awaiting → stop with checkpoint cause + surfaced `GSD_AWAITING_HUMAN` marker; no blind re-run (D-11) | `CHECKPOINT-<PP>` fixture + marker assertion; CHECKPOINT_FM fixture exists (test/tools.test.mjs:83-104) | `prepareCheckpoint`-shaped FakeFs state |
| V8 | Verify round: `passed` → success report; `gaps_found` → next round; still gaps after budget → stop listing remaining gaps (D-07) | Fake verify delegate writing `VERIFICATION_PASSED` on round 2 (recovery) and `VERIFICATION_GAPS` forever (exhaustion) | VERIFICATION fixtures + label-keyed fake subagents (test/tools.test.mjs:117-207 pattern) |
| V9 | REPAIR.md: created on round 1, appended per round; each section carries attempt/actions/status; stop reason recorded; survives a second invocation (accumulate) (D-10) | FakeFs content assertions on `<base>-REPAIR.md` after 1 and 2 rounds; parse back with `parseFrontmatter` | `writeArtifact`/`readArtifact` (lib/state.js:727-737) |
| V10 | Repair commits artefacts with scope `repair` via the shared seam, exactly once, after the log write (D-10/D-12) | Static assertions: imports `commitArtifacts` from `./_git-artifacts.js`, `scope: "repair"` appears once | test/phase-tools-git.test.mjs idiom |
| V11 | gsd_verify's `gaps_found` route text recommends `gsd_repair` and remains recommend-only (D-02) | Output assertion on a gaps-status verify call; negative: verify output never claims to have repaired | tools.test.mjs verify describe (237-259) |
| V12 | Autonomous: on `gaps_found` runs bounded rounds via the shared helper and continues on recovery; hard-stops after budget exhaustion with a clear stopReason; `human_needed`/missing still stop immediately (D-09) | Rewrite of autonomous test (f) (test/autonomous.test.mjs:311-332) + a recovery variant; assert `captures` counts grow past 1 before the stop | `mountAutonomous`, `makeFakeGit`, label-keyed fake subagents (test/autonomous.test.mjs:83-150) |
| V13 | Mount surface: 27→28 capability keys, 26→27 patch rows, 36→37 tools, 33→34 commands; `./repair` export resolves; `/gsd-repair` paired to `gsdRepair`; absent capability leaves the command unregistered | Updated counts + name arrays; the pairing is exercised by the existing DEGR-03 test mechanics (test/mount.test.mjs:147-232) | `PATCH_ROWS`, `EXPECTED_*_NAME` arrays |
| V14 | Repair never appears as a loop step (persona "Available steps", `loopSteps`) and never advances STATE itself (D-01) | Out-of-band role assertion on the descriptor (`buildCapability("gsdRepair").role === "out-of-band"`, `order === -1`); no-op/trigger-stop paths assert STATE frontmatter unchanged | test/removal.test.mjs data-driven matrix stays step-only; `svc.readState` assertions |
| V15 | Full-loop smoke: seeded gaps → 1 round → passed, all three delegate tools invoked once, report + artefact + commit present (happy-path integration) | One end-to-end FakeFs test through the real `gsd_repair` tool with real plan/execute/verify delegates registered in the ctx.tools array | `registerTool` ×4 + `makeSubagents` (the tools.test.mjs harness already fakes planner/checker/executor/verifier by label) |

---

## 7. Project Constraints (from project conventions)

[VERIFIED: package.json, lib headers, test helpers — all read this session]

1. **Node ≥ 20, pure ESM, zero runtime dependencies** (`"dependencies": {}`, package.json:134); peer deps only on the four `@deepseek-ai/*` packages. D-12 (node builtins only) is already the house norm.
2. **Tests**: `node --test test/*.test.mjs` (package.json:31); offline-first — FakeFs (`test/helpers/fake-fs.mjs`), fake-ctx mount harness (`test/helpers/mount-harness.mjs`, `PATCH_ROWS` must gain the new row), fake subagents keyed by spawn label, fake `gitFn` where a tool reads `ctx.gitFn` (lib/core-tools.js:465 pattern). Pure helpers are exported and unit-tested without ctx (mempalace-hook precedent, test/mempalace-hooks.test.mjs).
3. **Subprocess discipline**: every git call is a fixed argument array with `-C cwd`; no shell strings, no interpolation of model-supplied values (lib/_git-artifacts.js:14-16). Repair adds no new subprocess usage beyond the inherited commit seam.
4. **Artefact I/O**: all `.planning/` writes route through `GsdState` (→ `ctx.fs`), never raw `node:fs/promises` (DUR-06; lib/state.js:117-136, 727-755).
5. **Artefact naming**: `<base>-<SUFFIX>.md` with `PLAN|SUMMARY|CHECKPOINT-<PP>` zero-padded mapping (lib/state.js:721-725); REPAIR.md fits the plain-suffix path.
6. **Commits**: planning artefacts via `commitArtifacts(cwd, phase, { scope })` — message `docs(planning): phase <N> <slug> <scope> artefacts`; never throws; stages `.planning` wholesale (lib/_git-artifacts.js:160-201).
7. **Plugin shape**: `name` + `inject` + `apply(ctx)`; tools via `defineTool` with `parameters`/`output.render`/`presentCall`; capability via `ctx.provide(key, buildCapability(key))`; every new surface updates the descriptor TABLE + `CAPABILITY_KEYS` + patch row + exports + the count/name arrays (§1.7).
8. **Fail-loud service guards**: every tool starts `if (!s) throw new Error("<tool>: gsdState service unavailable")` / `if (!(await s.isProject(cwd))) throw …` (lib/verify.js:56-58 pattern).
9. **Recommend-only loop discipline**: tools route by advising, never auto-advancing the human's loop (D-02 matches gsd_verify's existing design; lib/verify.js:126-130).
10. **Docs convention**: CHANGELOG keeps an `## [Unreleased]` section (test/repo-hygiene.test.mjs:37-45); README tool tables are curated (no test enforces parity) — add a row for gsd_repair as a courtesy.

---

### Confidence summary

- All quoted discrete values (route text, error strings, filters, counts, marker format, message template) were read from the working tree this session — tagged [VERIFIED: path:lines].
- The production `.get()` shape of the host `tools` service is asserted by lib/quick.js:40-42's comment and proven by test/service-tools.test.mjs:402-415; the *live-host* provider itself was not directly inspected (DSH checkout grep found no `provide("tools")` in the installed bundle layout) — the dual-shape `findTool` makes the question moot for implementation, but the underlying host shape remains [ASSUMED] exactly as it already is for the shipped fast-mode/mvp-phase delegation.
- Everything else in this document rests on the locked CONTEXT decisions, quoted verbatim from `.planning/phases/GSD-58-node-repair/GSD-58-node-repair-CONTEXT.md` as provided in the planning context.
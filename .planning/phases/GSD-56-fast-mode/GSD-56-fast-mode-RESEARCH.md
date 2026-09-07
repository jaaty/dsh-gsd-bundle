I have everything I need. Here is the full RESEARCH.md.

---

# Phase 56: fast-mode — Research

**Researcher:** gsd-phase-researcher
**Date:** 2026-09-07
**Phase goal:** Provide a lightweight single-pass fast path for simple phase work.
**Requirement:** CLH-06

---

## 1. Domain analysis

### 1.1 What fast-mode is (and is not)

Fast-mode is a **new additive tool/capability/command** that drives a *simple* phase through a single-pass path: auto-CONTEXT → one executor subagent → SUMMARY → lightweight verify → full ship. It deliberately **skips** spec, discuss, plan, plan-checker, gap-analysis, code-review, ui-review, and validate. It is **not** a change to the full loop, and **not** a change to `gsd_quick`/`gsd_quick_batch`. [VERIFIED: CONTEXT.md D-01..D-08, in_scope/out_of_scope]

The single-pass shape is: `auto-CONTEXT -> one executor -> SUMMARY -> lightweight verify -> full ship (branch + PR + Complete)`. No PLAN.md, no plan-checker, no gap-analysis. [VERIFIED: CONTEXT.md specifics]

### 1.2 The exact building blocks fast-mode reuses (all exist and are proven)

| Building block | Source | What it gives fast-mode |
|---|---|---|
| `buildAutoContext(phase)` | `lib/autonomous.js:56-107` | A schema-faithful 7-block CONTEXT.md string derived from a ROADMAP phase `{n, name, goal, requirements}`, marked `**Mode: Auto-generated (discuss skipped — autonomous path)**`, with full executor discretion. [VERIFIED: lib/autonomous.js:56-107] |
| `ensurePhaseBranch(cwd, phaseNum)` | `lib/_git-artifacts.js:66-158` | Acquires/joins the `phase-<N>` feature branch; no-throws in no-git/non-repo workspaces; best-effort early push (MW-02). [VERIFIED: lib/_git-artifacts.js:66-158] |
| `commitArtifacts(cwd, phaseNum, opts)` | `lib/_git-artifacts.js:174-201` | Best-effort atomic commit of `.planning` wholesale; never throws; `phaseNum: null` + `opts.message` override supported for out-of-flow writers. [VERIFIED: lib/_git-artifacts.js:174-201] |
| `spawnSubagent(ctx, exec, {label, promptText})` | `lib/_runner.js:8-32` | Spawns a fresh-context subagent via the host `subagents` service; returns `{output, stopReason, diagnostic, structured}`. [VERIFIED: lib/_runner.js:8-32] |
| `cwdOf(exec)` | `lib/_runner.js:98-100` | Resolves the working directory from the exec agent session. [VERIFIED: lib/_runner.js:98-100] |
| `gsd_ship` execute | `lib/ship.js:142-340` | The full ship path: verification gate, clean-tree gate, branch gate, remote/gh gates, capability gates, pre-ship-verify, push, PR body assembly, `gh pr create`, `completePhase`, STATE update, completion commit+push. [VERIFIED: lib/ship.js:142-340] |
| `completePhase(cwd, phaseNum)` | `lib/state.js:833-850` | Marks the phase `Complete` in ROADMAP, recomputes STATE progress, marks requirements complete. [VERIFIED: lib/state.js:833-850] |
| `writeArtifact/readArtifact/hasArtifact/phaseDirAndBase` | `lib/state.js:708-743` | The artefact model (routes through `ctx.fs`, DUR-06). [VERIFIED: lib/state.js:708-743] |

### 1.3 Where the tool/capability/command live — the phase-55 analogy

Phase 55 (`quick-batch`) added `gsd_quick_batch` **to the existing `lib/quick.js` plugin** — a second `ctx.provide("gsdQuickBatch", ...)` call, no new plugin file, no new `cordis.patch.yml` row, no new `package.json` export. [VERIFIED: lib/quick.js:29-33 (two `ctx.provide` calls); cordis.patch.yml has no `gsd-quick-batch` row; package.json has no `./quick-batch` export]

Fast-mode's CONTEXT D-01 says "Register a new gsdFastMode capability under the quick step (role: alternate, mirroring gsdQuickBatch D-01 of phase 55)" and the canonical refs call phase-55 "an identical additive tool/capability/command shape". [VERIFIED: CONTEXT.md D-01, canonical_refs] **Therefore fast-mode should be added to `lib/quick.js`** (a third `ctx.provide("gsdFastMode", ...)`), with the `gsd-fast-mode` command added to `lib/commands.js` and the `gsdFastMode` descriptor added to `lib/_capabilities.js`. This avoids touching `cordis.patch.yml`, `package.json` exports, `PATCH_ROWS`, and the plugin count. [ASSUMED → RESOLVED by phase-55 analogy]

### 1.4 The ship-delegation tension (the one real design decision)

`gsd_ship`'s execute is **monolithic** — it does not export a reusable PR-creation helper (it exports only `preflightError`, `runLearningsOnShip`, `runGraphifyOnShip`, `runMempalaceCaptureOnShip`). [VERIFIED: lib/ship.js:345] Its **gate 1** requires a `VERIFICATION.md` with `status: passed` (`lib/ship.js:154-157`). [VERIFIED: lib/ship.js:154-157]

Fast-mode skips full `gsd_verify` (D-05) but must "open a PR via gsd_ship's path" and "delegate its full-ship step there so branch-push/PR behaviour stays single-source" (D-06). [VERIFIED: CONTEXT.md D-05, D-06]

**Recommended resolution:** fast-mode's lightweight verify read-back (D-05) writes a **minimal `VERIFICATION.md` with `status: passed`** (via `writeArtifact(cwd, phase.n, "VERIFICATION", ...)`), then invokes `gsd_ship`'s execute via the `ctx.tools.find(t => t.name === "gsd_ship")` lookup pattern (the exact pattern `runLearningsOnShip` uses to find `gsd_extract_learnings` — `lib/ship.js:66-76`). [VERIFIED: lib/ship.js:66-76] This keeps ship single-source and satisfies gate 1. The minimal VERIFICATION.md is the honest record of the lightweight verify, not a gate-bypass — D-05 explicitly authorizes a lightweight verify in place of full `gsd_verify`. [VERIFIED: CONTEXT.md D-05]

**Consequence to flag:** calling `gsd_ship` wholesale also runs its capability gates (security/broken-windows/tdd-audit) and the pre-ship-verify (`npm ci` + `npm test` in a temp copy, `lib/ship.js:193-216`). [VERIFIED: lib/ship.js:193-216] This is consistent with "ship the full way" (D-06) but the `npm ci` is not "fast". Whether to skip gates/pre-ship-verify is a discretion point (D-08 lists dry-run/confirm, not gates). **Recommendation: run `gsd_ship` wholesale** for single-source correctness; the planner may add a `skip_verify`/`skip_gates` passthrough if throughput demands it.

### 1.5 SUMMARY shape

Fast-mode produces no PLAN.md, so there is no plan number. The executor writes a SUMMARY via `writeArtifact(cwd, phase.n, "SUMMARY", ...)` → `<base>-SUMMARY.md` (non-plan suffix). [VERIFIED: lib/state.js:721-725 — `_artifactFile` maps only `PLAN|SUMMARY|CHECKPOINT-<NN>` to plan-numbered files; a bare `SUMMARY` suffix maps to `<base>-SUMMARY.md`]

This is **safe from `gsd_health` orphan-SUMMARY detection**, which only matches plan-numbered `-(\d+)-SUMMARY.md` files (`lib/health.js:104-112`). [VERIFIED: lib/health.js:104-112] The frontmatter should carry `status: complete` (mirroring the plan SUMMARY shape `test/helpers/project.mjs` FENCED_SUMMARY: `phase/plan/status`). [VERIFIED: test/helpers/project.mjs FENCED_SUMMARY]

Downstream SUMMARY readers (`learnings`, `validate-phase`, `verify`, `add-tests`) all read plan-numbered `SUMMARY-<PP>` and are all **skipped** by fast-mode (D-04 skips validate; D-05 skips full verify; learnings/add-tests are out-of-band and not invoked). The only automated reader that runs is `gsd_ship`, which iterates `listPlans` (glob `^<base>-(\d+)-PLAN\.md$`, `lib/state.js:766`) — with no PLAN.md, `listPlans` returns `[]`, so the PR body simply omits plan bullets. [VERIFIED: lib/ship.js:223-250; lib/state.js:758-792] The `<base>-SUMMARY.md` is therefore a faithful human/operator record, not consumed by any automated gate.

### 1.6 Eligibility and error handling

- **Eligibility (D-02):** the caller invokes `gsd_fast_mode` on a specific phase number, asserting it is simple. A `fast: true` ROADMAP flag is optional metadata, never a hard gate. The tool **refuses a phase already `Complete`** (ROADMAP `status === "Complete"`). [VERIFIED: CONTEXT.md D-02]
- **Error handling (D-07):** fail fast, never auto-retry/continue. If the executor run, verify read-back, or ship throws, the tool stops, leaves the phase uncompleted in STATE, and reports the real cause. No partial "Complete". [VERIFIED: CONTEXT.md D-07]

### 1.7 Standard pitfalls

1. **Calling `gsd_ship` without a VERIFICATION.md** → gate 1 throws `gsd_ship preflight failed: no VERIFICATION.md`. Must write a minimal VERIFICATION.md first. [VERIFIED: lib/ship.js:154-155]
2. **`commitArtifacts` only stages `.planning`** — it does not commit source code. The fast-mode executor subagent must commit its own source (mirroring the full-loop executor, whose prompt says "Commit with scope...", `lib/execute.js:132`), and the orchestrator commits `.planning` via `commitArtifacts`. Otherwise `gsd_ship`'s clean-tree gate (gate 2, `lib/ship.js:160-161`) fails. [VERIFIED: lib/_git-artifacts.js:178; lib/execute.js:132; lib/ship.js:160-161]
3. **`gsd_ship` requires being on a feature branch** (gate 3, `lib/ship.js:164-167`). Fast-mode must call `ensurePhaseBranch(phase.n)` before ship. [VERIFIED: lib/ship.js:164-167]
4. **Mount-test count drift:** adding a tool/capability/command changes the exact-count assertions in `test/mount.test.mjs` (34→35 tools, 31→32 commands, 25→26 capability keys) and the `EXPECTED_TOOL_NAMES`/`EXPECTED_COMMAND_NAMES` arrays. [VERIFIED: test/mount.test.mjs:147-148, 159, 105-132]
5. **`gsd_ship` reads CONTEXT.md for Key Decisions** via `parseDecisionEntries` (`lib/ship.js:233-234`). `buildAutoContext` produces a CONTEXT with no `- **D-NN:**` entries, so Key Decisions render "(none)" — acceptable. [VERIFIED: lib/ship.js:233-234; lib/autonomous.js:73-77]

---

## 2. Package legitimacy

Fast-mode introduces **no new runtime dependencies**. It reuses only in-repo modules and the already-declared peer deps. [VERIFIED: package.json dependencies: `{}`, peerDependencies: `@deepseek-ai/dsh-tools`, `@deepseek-ai/schemastery`, `@deepseek-ai/cordis`, `@deepseek-ai/dsh-llm` — package.json:134-140]

| Dependency | Status | Source |
|---|---|---|
| `@deepseek-ai/dsh-tools` (`defineTool`) | Already a peer dep, already used by every tool | [VERIFIED: package.json:136; lib/quick.js:8] |
| `@deepseek-ai/dsh-llm` (`createUserMessage`) | Already a peer dep, used by commands.js | [VERIFIED: package.json:139; lib/commands.js:15] |
| `@deepseek-ai/cordis` | Already a peer dep | [VERIFIED: package.json:138] |
| `@deepseek-ai/schemastery` | Already a peer dep | [VERIFIED: package.json:137] |

No new package is proposed, so no registry verification is required. [ASSUMED — no new dependency]

---

## 3. Risks and Open Questions

### Risks

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| R1 | **Ship gate mismatch:** calling `gsd_ship` without a `VERIFICATION.md` throws at gate 1. | High | Fast-mode writes a minimal `VERIFICATION.md` (`status: passed`) as the output of its lightweight verify before invoking `gsd_ship`. [VERIFIED: lib/ship.js:154-157] |
| R2 | **Uncommitted source:** `commitArtifacts` stages only `.planning`; if the executor does not commit its source, `gsd_ship`'s clean-tree gate fails. | High | The fast-mode executor prompt must instruct the executor to commit its source atomically (mirroring the full-loop executor prompt). [VERIFIED: lib/_git-artifacts.js:178; lib/execute.js:132] |
| R3 | **Mount-test count drift:** exact-count assertions break when a tool/capability/command is added. | Medium | Update `test/mount.test.mjs` counts + `EXPECTED_*` arrays in the same commit as the tool. [VERIFIED: test/mount.test.mjs:147-148, 159, 105-132] |
| R4 | **Pre-ship-verify cost:** `gsd_ship` runs `npm ci` + `npm test` in a temp copy, which is not "fast". | Medium | Accept as "ship the full way" (D-06); optionally expose `skip_verify`/`skip_gates` passthrough (discretion). [VERIFIED: lib/ship.js:193-216] |
| R5 | **`gsd_ship` on a non-base branch:** if `ensurePhaseBranch` is not called first, gate 3 fails. | Medium | Call `ensurePhaseBranch(phase.n)` before ship. [VERIFIED: lib/ship.js:164-167] |
| R6 | **No auto-retry on executor failure:** a failed run leaves the phase uncompleted. | Low (by design) | D-07 mandates fail-fast; the operator re-runs or uses the full loop. [VERIFIED: CONTEXT.md D-07] |

### Open Questions

- **OQ-1 (RESOLVED):** Where does the `gsd_fast_mode` tool live? → **`lib/quick.js`**, by the phase-55 analogy (gsdQuickBatch was added to quick.js with no new plugin file/row/export). [VERIFIED: lib/quick.js:29-33; CONTEXT.md D-01, canonical_refs]
- **OQ-2 (RESOLVED):** How does fast-mode reuse the ship path given `gsd_ship` requires a passed VERIFICATION.md? → **Write a minimal `VERIFICATION.md` (`status: passed`) as the lightweight-verify output, then invoke `gsd_ship`'s execute via `ctx.tools.find`.** This keeps ship single-source (D-06). [VERIFIED: lib/ship.js:154-157, 66-76; CONTEXT.md D-05, D-06]
- **OQ-3 (RESOLVED):** What SUMMARY suffix does the executor write? → **`SUMMARY` (bare)** → `<base>-SUMMARY.md`, safe from health orphan detection and not consumed by any automated gate. [VERIFIED: lib/state.js:721-725; lib/health.js:104-112]
- **OQ-4 (RESOLVED):** Does fast-mode run `gsd_ship`'s capability gates and pre-ship-verify? → **Yes, wholesale** (consistent with "ship the full way", D-06). The planner may add a `skip_verify`/`skip_gates` passthrough if throughput demands. [VERIFIED: lib/ship.js:177-216; CONTEXT.md D-06]
- **OQ-5 (RESOLVED):** Does fast-mode need a persona change? → **No.** The persona renders `STEP_PARAGRAPHS` keyed by capability key; only `gsdQuick` has a paragraph, and `gsdQuickBatch` (role: alternate, step: quick) has none. `gsdFastMode` likewise needs none. The "Available steps" line dedupes by step (`[...new Set(loop.map(d => d.step))]`), so `quick` appears once. [VERIFIED: lib/_render.js:149-180, 57-60; lib/persona.js:57-60]

All open questions are **RESOLVED**; planning may proceed.

---

## 4. Architectural Responsibility Map

| Capability | Tier | Where it lives | Notes |
|---|---|---|---|
| Tool registration (`gsd_fast_mode`) | presentation | `lib/quick.js` `apply()` → `ctx.tools.register(defineTool(...))` | Mirrors `gsd_quick_batch` registration. [VERIFIED: lib/quick.js:88-183] |
| Capability publication (`gsdFastMode`) | presentation | `lib/quick.js` → `ctx.provide("gsdFastMode", buildCapability("gsdFastMode"))` | role: alternate, step: quick. [VERIFIED: lib/quick.js:29-33; CONTEXT.md D-01] |
| Command registration (`/gsd-fast-mode`) | presentation | `lib/commands.js` COMMANDS array | Mirrors `gsd-quick-batch` entry. [VERIFIED: lib/commands.js:252-265] |
| Capability descriptor | presentation | `lib/_capabilities.js` CAPABILITY_KEYS + TABLE | Add `gsdFastMode` (tools: `[gsd_fast_mode]`, commands: `[gsd-fast-mode]`, step: quick, role: alternate, order: 25). [VERIFIED: lib/_capabilities.js:164-174] |
| Auto-CONTEXT derivation | domain | `buildAutoContext` (imported from `lib/autonomous.js`) | Pure builder, no I/O. [VERIFIED: lib/autonomous.js:56-107] |
| Executor dispatch | domain | `spawnSubagent` (imported from `lib/_runner.js`) | One fresh-context subagent. [VERIFIED: lib/_runner.js:8-32] |
| Lightweight verify read-back | domain | fast-mode orchestrator (deterministic checks + minimal VERIFICATION.md write) | Not a subagent; D-05. [VERIFIED: CONTEXT.md D-05] |
| Branch/commit | data | `ensurePhaseBranch`/`commitArtifacts` (imported from `lib/_git-artifacts.js`) | `.planning` commit by orchestrator; source commit by executor. [VERIFIED: lib/_git-artifacts.js:66-201] |
| Artefact model | data | `gsdState` accessors (`writeArtifact`, `readArtifact`, `hasArtifact`, `phaseDirAndBase`, `completePhase`) | Routes through `ctx.fs` (DUR-06). [VERIFIED: lib/state.js:708-850] |
| Ship (push + PR + Complete) | integration | `gsd_ship` execute (invoked via `ctx.tools.find`) | Single-source ship path. [VERIFIED: lib/ship.js:142-340] |

**Security-sensitive capability in the wrong tier?** None. Fast-mode introduces no new security-sensitive capability; it reuses the existing ship path (which already enforces fixed-arg git/gh calls, `lib/_git-artifacts.js:14-16`, `lib/ship.js:25-36`). [VERIFIED: lib/_git-artifacts.js:14-16; lib/ship.js:25-36]

---

## 5. Validation Architecture

| Behaviour | Automated check | Where |
|---|---|---|
| Tool registers with valid schema + smoke execute | `registerTool("quick", "gsd_fast_mode")` + `t.execute(...)` on FakeFs | `test/service-tools.test.mjs` (mirror the `gsd_quick_batch` describe block, `test/service-tools.test.mjs:234-307`) |
| Executor subagent is spawned with a `fast` label | canned-subagent handler `label.startsWith("fast")` writes the SUMMARY to FakeFs | `test/service-tools.test.mjs` `makeSubagents` (mirror the `quick` branch, `test/service-tools.test.mjs:74-77`) |
| Auto-CONTEXT written with the fast-path marker | assert `fs.files.has(<base>-CONTEXT.md)` and content matches `Auto-generated (discuss skipped — fast path)` | `test/service-tools.test.mjs` |
| SUMMARY written to `<base>-SUMMARY.md` | assert `fs.files.has(<base>-SUMMARY.md)` with `status: complete` frontmatter | `test/service-tools.test.mjs` |
| Lightweight verify writes minimal VERIFICATION.md | assert `fs.files.has(<base>-VERIFICATION.md)` with `status: passed` | `test/service-tools.test.mjs` |
| Refuses an already-Complete phase | seed ROADMAP phase `status: Complete`, assert `t.execute` rejects | `test/service-tools.test.mjs` |
| Fail-fast on executor failure | canned `fast boom` label throws; assert the tool rejects and leaves the phase uncompleted | `test/service-tools.test.mjs` (mirror the `quick boom` failure-isolation branch, `test/service-tools.test.mjs:70-73`) |
| Capability + command + tool all register | `test/mount.test.mjs` counts (34→35 tools, 31→32 commands, 25→26 caps) + `EXPECTED_TOOL_NAMES`/`EXPECTED_COMMAND_NAMES` | `test/mount.test.mjs:105-132, 147-148, 159` |
| Ship delegation reuses `gsd_ship` | fast-mode invokes `gsd_ship` via `ctx.tools.find`; the ship path is already covered by `test/ship.test.mjs` / `test/gates-ship.test.mjs` | `test/ship.test.mjs`, `test/gates-ship.test.mjs` |

**Note on the ship path:** `gsd_ship`'s git/gh paths are not driven offline (per the removal-test convention, `test/removal.test.mjs:176-183`). Fast-mode tests should assert that fast-mode *invokes* `gsd_ship` (e.g. via a stubbed `ctx.tools` where `gsd_ship.execute` is a spy) rather than driving the real git/gh path. [VERIFIED: test/removal.test.mjs:176-183]

---

## 6. Project Constraints

From the codebase conventions (read this session):

- **Zero new runtime dependencies** — `package.json` `dependencies: {}`; the bundle is dependency-free at runtime. [VERIFIED: package.json:134]
- **Fixed-argument git/gh calls** — never shell interpolation; every git call uses a fixed `-C cwd` arg array. [VERIFIED: lib/_git-artifacts.js:14-16; lib/ship.js:25-36]
- **Artefact writes route through `gsdState` → `ctx.fs`** — never raw `node:fs/promises` for `.planning/` writes (DUR-06). [VERIFIED: lib/state.js:727-743; lib/quick.js:68]
- **Additive only** — full-loop steps, `gsd_quick`, and `gsd_quick_batch` behaviour are untouched. [VERIFIED: CONTEXT.md out_of_scope, specifics]
- **Fail-fast, no auto-retry** — a failed run stops and leaves the phase uncompleted. [VERIFIED: CONTEXT.md D-07]
- **`fast: true` ROADMAP flag is optional metadata, never a hard gate.** [VERIFIED: CONTEXT.md D-02]
- **Mount-test exact counts must be updated in the same commit** as the new tool/capability/command. [VERIFIED: test/mount.test.mjs:147-148, 159, 105-132]
- **`npm test` (`node --test test/*.test.mjs`) must pass on a clean checkout** (MOUNT-06, prepublishOnly). [VERIFIED: package.json:31-32]

---

*Phase: 56-fast-mode*
*Research complete: 2026-09-07*
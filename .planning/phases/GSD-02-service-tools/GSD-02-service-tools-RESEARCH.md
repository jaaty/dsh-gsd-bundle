I have all the facts I need. Key findings that shape the plan:

1. **`gh` is installed AND authenticated** in this env (account `jaaty`) — so the literal D-03 `gh CLI not available` message is *unreachable* here even with a real git repo (gate 5 would pass and fail at `git push`).
2. **`gsd_quick` writes TASK.md via real `node:fs/promises`** (lib/quick.js:55-57), bypassing `ctx.fs` — its happy-path can't run on pure FakeFs at `cwd=/project`.
3. **ROADMAP/STATE round-trip has parse asymmetries** (parseRoadmap injects a `slug` field and never sets `milestone`; writeState mutates `last_updated`/`last_activity`) — a naive deepEqual would fail.
4. The existing test fake-subagents only handle 5 labels; `ui-researcher`, `ui-checker`, `quick` need new canned handlers.

Here is the full RESEARCH.md:

---

# Phase 2: service-tools — RESEARCH

**Researcher:** gsd-phase-researcher (fresh context)
**Date:** 2026-08-23
**Phase goal:** Prove the gsdState service round-trips .planning/ artefacts and every gsd_* phase tool registers with a valid schema and passes a smoke call. (MOUNT-03, MOUNT-04)

This research answers: *what does the planner need to know to decompose this gap-focused phase into bounded, ordered plans?* All claims are tagged with provenance. In-repo discrete values (paths, line ranges, status strings, error messages) were read this session and are quoted verbatim.

---

## Domain analysis

### What "round-trip with no data loss" means for gsdState (MOUNT-03)

`GsdState` (lib/state.js:31-508) exposes two families of artefact accessors, and the round-trip proof must treat them differently:

1. **Raw-text artefacts** — `writeArtifact(cwd, phaseNum, suffix, content)` / `readArtifact(cwd, phaseNum, suffix)` (lib/state.js:370-382). These write/read a string verbatim through `ctx.fs`. The `_artifactFile` mapper (lib/state.js:364-368) handles `PLAN-<PP>`/`SUMMARY-<PP>` → `<base>-<PP>-PLAN.md`/`-SUMMARY.md`, and any other suffix → `<base>-<SUFFIX>.md`. Round-trip = verbatim string equality. [VERIFIED: lib/state.js:370-382 read this session]

2. **Structured artefacts** — these go through parse/stringify and the round-trip is a *structural* deep-equal, not a string-equal:
   - `writeRequirements`/`readRequirements` (lib/state.js:320-333) → `stringifyRequirements`/`parseRequirements` (lib/_shared.js:239-262). Groups by id prefix, emits `- [x]`/`- [ ]` checkboxes. Cleanest round-trip (id/text/complete preserved). [VERIFIED: lib/_shared.js:239-262]
   - `writeRoadmap`/`readRoadmap` (lib/state.js:310-318) → `stringifyRoadmap`/`parseRoadmap` (lib/_shared.js:179-236). **PITFALL:** `parseRoadmap` injects a `slug` field per phase (lib/_shared.js:200) that `stringifyRoadmap` never writes, and sets `out.milestone = null` always (lib/_shared.js:180) while the writer takes `milestoneName`/`version`. A strict `deepEqual(writeRoadmap(doc)→readRoadmap, doc)` will FAIL on the extra `slug` and the absent `milestone`. [VERIFIED: lib/_shared.js:179-210 read this session]
   - `writeState`/`readState` (lib/state.js:193-257) → `_stringifyState`/`parseFrontmatter`+`_parseStateBody`. **PITFALL:** `writeState` mutates `doc.frontmatter.last_updated` and `doc.frontmatter.last_activity` (lib/state.js:252-253) before serializing, so a re-read will NOT equal the input doc on those two fields. The body serializer only emits `position`, `decisions`, `blockers`, `continuity` (lib/state.js:196-217); any other body key is dropped. Frontmatter is serialized in full via `stringifyFrontmatter` (lib/_shared.js:151-173), so frontmatter keys round-trip. [VERIFIED: lib/state.js:193-257, lib/_shared.js:151-173 read this session]
   - `config.json`: written by `initProject` via `_defaultConfig(opts)` (lib/state.js:138, 143-161); read by `readConfig` (lib/state.js:335-339) which JSON.parses, falling back to `_defaultConfig({})` on parse failure or missing file. **No public `writeConfig`** — the only write path is `initProject`. [VERIFIED: lib/state.js:108-161, 335-339 read this session]

3. **PROJECT.md** — `readProject` (lib/state.js:99-101) returns raw text; there is **no `writeProject`**. PROJECT.md is written only inside `initProject` from `opts.project`/`opts.name`/`opts.purpose`/`opts.business` (lib/state.js:118-124). To prove read fidelity, write a known string directly to `.planning/PROJECT.md` via FakeFs and assert `readProject` returns it verbatim. [VERIFIED: lib/state.js:99-101, 118-124 read this session]

**Confidence: HIGH** (all four accessor families read verbatim from source this session).

### What "every gsd_* execute passes a smoke call" means (MOUNT-04)

The 12 tools and which already have an execute-level test (test/tools.test.mjs + test/mount.test.mjs gsd_init smoke) vs. the 5 gaps:

| Tool | Spawns subagents? | Has execute test today? | Phase-2 smoke shape |
|---|---|---|---|
| gsd_init | No | Yes (mount.test.mjs:275-300) | skip (D-01) |
| gsd_status | No | Yes (tools.test.mjs:168-177) | skip (D-01) |
| gsd_discuss | No | Yes (tools.test.mjs:86-109) | skip (D-01) |
| gsd_plan | Yes | Yes (closed-phase gate, tools.test.mjs:138-157) | skip (D-01) — but D-03 wants a happy-path/guard smoke noted below |
| gsd_execute | Yes | Yes (tools.test.mjs:111-136) | skip (D-01) |
| gsd_ship | No (real git/gh) | Yes (missing-VERIFICATION guard, tools.test.mjs:159-166) | skip (D-01) — but D-03 names its gh guard |
| gsd_map_codebase | Yes | Yes (tools.test.mjs:179-246) | skip (D-01) |
| **gsd_new_milestone** | No | **No** | success-path smoke (pure state, FakeFs) |
| **gsd_progress** | No | **No** | success-path smoke (pure state, FakeFs) |
| **gsd_quick** | Yes | **No** | see OQ-1 (real-fs write) |
| **gsd_ui_phase** | Yes | **No** | success-path smoke (fake subagents + FakeFs) |
| **gsd_verify** | Yes | **No** | success-path smoke (fake subagents + FakeFs) |

[VERIFIED: test/tools.test.mjs and test/mount.test.mjs read this session — the 6 tested tools and 5 gaps confirmed; tool source read for spawn behaviour]

### The reusable smoke harness

The existing pattern (test/tools.test.mjs:16-84) is the canonical shape:
- `exec` stub with `agent.session.header.cwd = CWD` and an `AbortSignal`-like object (tools.test.mjs:16-19). [VERIFIED: test/tools.test.mjs:16-19]
- `makeSubagents()` returns a fake `subagents` service whose `.start(_n, req)` switches on `req.label` and writes canned artefacts directly to the shared FakeFs, returning `{ result: { output: [{type:"text", text}], stopReason: "completed" }, dispose }` (tools.test.mjs:21-62). [VERIFIED: test/tools.test.mjs:21-62]
- `registerTool(pluginFile, toolName)` imports `lib/<file>.js`, runs `mod.apply(ctx, {})` against a capturing ctx, and returns the tool (tools.test.mjs:75-84). [VERIFIED: test/tools.test.mjs:75-84]
- `makeCtx()` wires `ctx.get` so `"gsdState"` → shared svc, `"subagents"` → makeSubagents(), `"tools"` → `{register(){}}` (tools.test.mjs:64-73). [VERIFIED: test/tools.test.mjs:64-73]
- `buildProject(fs, cwd)` (test/helpers/project.mjs:90-98) initialises a project with one phase `01-auth` and reqs AUTH-01/TODO-01. [VERIFIED: test/helpers/project.mjs:90-98]

**Confidence: HIGH.** This harness runs green today (`node --test test/*.test.mjs` → 41 pass, 0 fail this session). [VERIFIED: bash run this session]

### Fake-subagent label coverage gap

The existing `makeSubagents` (tools.test.mjs:21-62) handles labels: `planner`, `plan-checker`, `execute`, `verify`, `plan research`, `map-codebase`. The 5 gap smokes need handlers for labels the existing fake does NOT match:
- `ui-researcher phase <n>` (lib/ui.js:49) — must return ≥50 chars or the tool short-circuits with "no usable spec" (lib/ui.js:50). [VERIFIED: lib/ui.js:49-50]
- `ui-checker phase <n>` (lib/ui.js:60) — output containing `VERIFICATION PASSED` makes the passed-path branch (lib/ui.js:61-62). [VERIFIED: lib/ui.js:60-62]
- `quick <slug>` (lib/quick.js:42) — returns the recorded `r.output`. [VERIFIED: lib/quick.js:42, 53]
- `verify phase <n>` — already handled (tools.test.mjs:35-37), writes `01-auth-VERIFICATION.md`. [VERIFIED: test/tools.test.mjs:35-37]

The phase-2 fake-subagents factory must add the three new label branches. **Confidence: HIGH.**

---

## Package legitimacy

No new dependencies are proposed. The phase is test-only (extends test/*.test.mjs). All imports already resolve in the green suite:

- `@deepseek-ai/dsh-tools` (`defineTool`) — peerDependency in package.json:24, already used by every tool module. [VERIFIED: package.json:24 read; lib/core-tools.js:7 etc.]
- `node:test`, `node:assert/strict`, `node:path`, `node:fs/promises` — Node builtins. Node version in this env: v24.15.0. [VERIFIED: bash `node --version` this session]
- `@dsh-gsd/bundle/<sub>` subpath imports — resolved via package.json exports map (12 keys). [VERIFIED: package.json exports read; test/mount.test.mjs:228 import()]

**No runtime dependencies** (`"dependencies": {}` in package.json:30). The bundle's zero-dep invariant (noted in mount.test.mjs:113-116 re: no YAML parser) must be preserved — the round-trip tests must NOT introduce a YAML/markdown dependency. The gsdState parsers (lib/_shared.js) are the only artefact parsers. [VERIFIED: package.json:30, lib/_shared.js:1-4]

**Confidence: HIGH** — no new packages to vet.

---

## Risks

### R1 — gsd_quick's record-write bypasses ctx.fs (BLOCKER for pure-FakeFs happy-path smoke)
`gsd_quick.execute` records the task entry via real `node:fs/promises`, NOT through `ctx.fs`/gsdState (lib/quick.js:55-57):
```js
const fs = await import("node:fs/promises");
try { await fs.mkdir(dir, { recursive: true }); } catch { /* may already exist */ }
await fs.writeFile(`${dir}/TASK.md`, entry, "utf8");
```
where `dir = ${s.planningRoot(cwd)}/quick/${today()}-${slug}` (lib/quick.js:40). With `cwd = "/project"` (the FakeFs test cwd, which does not exist on the real filesystem), `fs.writeFile` throws `ENOENT` uncaught → execute rejects. The `addDecision` call that follows IS routed through gsdState/ctx.fs (lib/quick.js:58) and is try/caught. [VERIFIED: lib/quick.js:33-61 read this session; /project absent on real fs confirmed by gsd_ship preflight behaviour]

This is an architectural finding: TASK.md is the only artefact NOT mediated by gsdState. A pure-FakeFs happy-path smoke of gsd_quick is therefore impossible without either (a) a real temp cwd, or (b) routing the write through ctx.fs (a source change). See OQ-1.

### R2 — The literal D-03 "gh CLI not available or not authenticated" string is unreachable in this environment
`gh` is installed AND authenticated in this env (`gh auth status` → "✓ Logged in to github.com account jaaty", bash confirmed this session). The gsd_ship preflight runs gates in order (lib/ship.js:55-77): (1) VERIFICATION passed, (2) clean tree, (3) branch, (4) remote, (5) `gh auth status`. Even if a real git repo satisfied gates 2-4, gate 5 *passes* here (gh is authed), so execution proceeds to gate 6 (`git push`) which fails with "git push failed: ..." — NOT the D-03 gh string. On a non-repo FakeFs cwd (`/project`), `gitOk` throws (cwd absent) → gate 3 fails with "could not determine current branch" (lib/ship.js:68). Either way the exact D-03 message is not reproducible. [VERIFIED: lib/ship.js:55-77 read; `gh auth status` run this session]

### R3 — ROADMAP/STATE round-trip deepEqual pitfalls
As analysed in Domain analysis: `parseRoadmap` injects `slug` and omits `milestone`; `writeState` mutates `last_updated`/`last_activity`. A naive `deepEqual` round-trip assertion will fail. The test must normalise (compare a projected subset) or the planner must scope the round-trip per-artefact to the fields each accessor actually preserves. [VERIFIED: lib/_shared.js:179-210, lib/state.js:251-257]

### R4 — gsd_verify smoke prerequisites
`gsd_verify.execute` returns early with a clean message if there are no plans ("no plans for phase N", lib/verify.js:48) or any plan lacks a SUMMARY ("missing SUMMARY.md for ...", lib/verify.js:50). The smoke must seed at least one PLAN-01 AND its SUMMARY-01 before calling execute, or it asserts an early-return guard rather than the verify route. The fake verify subagent must write `01-auth-VERIFICATION.md` with frontmatter `status: passed` so the tool routes to the "✓ Phase ... verified" branch (lib/verify.js:80-91). [VERIFIED: lib/verify.js:47-91 read; test/tools.test.mjs:35-37]

### R5 — gsd_ui_phase short-circuit
If the fake `ui-researcher` returns <50 chars, the tool returns "no usable spec" and never writes UI-SPEC or advances to the checker (lib/ui.js:50). The fake handler must return a ≥50-char canned spec. [VERIFIED: lib/ui.js:49-51]

### R6 — gsd_progress/gsd_new_milestone require an initialised project
Both guard on `isProject(cwd)` (lib/core-tools.js:129, 179) and return a clean string ("No .planning/ project. Run gsd_init first.") if not. The smoke must call `buildProject` first (which runs `initProject` → writes STATE.md so `isProject` returns true). [VERIFIED: lib/core-tools.js:129,179; lib/state.js:103-106; test/helpers/project.mjs:90-98]

---

## Open Questions

### OQ-1 — How to smoke gsd_quick given its real-fs record-write? (RESOLVED)
**Blocking if unresolved:** yes (shapes whether a source change is in scope).

The locked decisions are in tension: D-03 says "tools f-able on the fake host get a real success-path smoke returning an expected value", but gsd_quick's happy path writes TASK.md via real `node:fs/promises` (R1), so it is NOT f-able on pure FakeFs. D-04 says "all offline on FakeFs/fake-ctx". D-01 says phase 2 is "gap-focused only... adds execute() smoke calls" (tests, not re-architecture).

**RESOLUTION (recommended):** Smoke gsd_quick's success-path against a **real temp cwd** under `os.tmpdir()` with `realFsAdapter` (test/helpers/fake-fs.mjs:78-108) for gsdState + the existing fake-subagents pattern (canned `quick <slug>` output). This is fully offline (no LLM, no git/gh, no network), deterministic, and cleanable (rmrf the temp dir in a `try/finally`). Assert the return matches `/gsd_quick done/` and that `<dir>/TASK.md` exists on real fs with the recorded entry. This satisfies D-03's "real success-path smoke returning an expected value" while staying offline.

**Alternative (weaker, pure-FakeFs):** Smoke only the missing-`subagents` guard — `ctx.get("subagents")` omitted → execute throws `gsd_quick: \`subagents\` service unavailable` (lib/quick.js:37-38). This is a clean named error but is a guard-smoke, not a success-path.

**Out-of-scope (flagged, not recommended this phase):** Refactoring gsd_quick to write TASK.md through `ctx.fs`/gsdState. That would unify the artefact model (aligns with MOUNT-03's "gsdState round-trips .planning/ artefacts" spirit, since TASK.md is currently outside that model) but is a source change beyond the gap-focused test scope (D-01). Recommend deferring to a later phase unless the planner judges the inconsistency a defect worth fixing inline.

**Recommendation:** the real-temp-cwd success-path smoke (primary), and record the ctx.fs-bypass as a finding in the phase VERIFICATION.

### OQ-2 — How to smoke gsd_ship's fail-loud guard given the gh message is unreachable? (RESOLVED)
**Blocking if unresolved:** yes (D-03 literally names the gh string).

Per R2, the literal D-03 string `gh CLI not available or not authenticated` cannot be produced in this environment (gh is installed AND authed; and on a non-repo FakeFs cwd the branch gate fails first). D-04 forbids real git/gh. The two locked decisions conflict on the exact string.

**RESOLUTION (recommended):** Smoke a **reachable** preflight fail-loud guard on pure FakeFs, consistent with D-04 (no real git): seed a passed VERIFICATION (so gate 1 passes), call `gsd_ship.execute({phase:1})` with `cwd="/project"` (non-existent on real fs), and assert it throws `/gsd_ship preflight failed:/` with a clean named message (the gate that fires is "could not determine current branch", lib/ship.js:68, because `gitOk(["rev-parse","--abbrev-ref","HEAD"])` throws on the absent cwd). This proves the fail-loud guard pattern D-03 requires ("asserting their fail-loud guard throws a clean, named error") without violating D-04.

Keep the existing missing-VERIFICATION test (tools.test.mjs:159-166) as the second guard. Document in VERIFICATION that the exact gh-auth string is environment-dependent (only fires when gh is genuinely absent/unauthed) and was not reproducible here without stubbing `gh` — out of scope for a gap-focused, no-real-git phase.

**Recommendation:** FakeFs reachable-guard smoke (branch gate) + retain existing missing-VERIFICATION test; do NOT stub `gh` or spin up a real repo.

### OQ-3 — Does gsd_plan need a new phase-2 smoke, or is the existing closed-phase-gate test sufficient? (RESOLVED)
**Blocking if unresolved:** no.

D-01 excludes gsd_plan from the 5 gap tools (it has an execute test: the closed-phase gate, tools.test.mjs:138-157). D-03 mentions gsd_plan: "spawn returns canned result and asserts a plan is produced OR asserts the guard for missing preconditions." The existing test already asserts a guard (force=true clears the gate) AND a happy-path (force=true + skipResearch → "gsd_plan complete", tools.test.mjs:152-156) using the fake planner that writes a PLAN.md. [VERIFIED: test/tools.test.mjs:138-157; lib/plan.js:109-117]

**RESOLUTION:** No new gsd_plan smoke is required — the existing test already covers both the guard and a canned-result happy-path. gsd_plan is out of scope per D-01. (If the planner wants belt-and-braces, the no-CONTEXT guard at lib/plan.js:54-55 is an untested clean return, but adding it is optional and not required by MOUNT-04 since gsd_plan already has an execute test.)

### OQ-4 — Where do the 5 new smokes live — new test file or extend existing? (RESOLVED)
**Blocking if unresolved:** no (planner discretion).

**RESOLUTION (recommended):** Add the 5 tool smokes to a new `test/service-tools.test.mjs` (or extend `test/tools.test.mjs`). Reason: the round-trip extension belongs in `test/state.test.mjs` (D-02 says "extends the existing PLAN/SUMMARY round-trip test in state.test.mjs"); the 5 tool smokes are a coherent group and a new file keeps the gap visible. Either is acceptable; the planner should match the existing conventions (one `describe` per tool, `registerTool` helper reused). Note `package.json` script is `node --test test/*.test.mjs` (package.json:21) so any new `test/*.test.mjs` is auto-collected. [VERIFIED: package.json:21]

---

## Architectural Responsibility Map

Each capability → tier. A security-/infra-sensitive capability in the wrong tier is a BLOCKER; none found.

| Capability | Tier | Owner | Notes |
|---|---|---|---|
| Artefact file read/write (raw text) | data | gsdState `_read`/`_write`/`writeArtifact`/`readArtifact` (lib/state.js:70-82, 370-382) | Routes through `ctx.fs` only. |
| Artefact parse/stringify (structured) | data | lib/_shared.js parsers | ROADMAP/REQUIREMENTS/STATE/frontmatter. No external YAML dep. |
| Project bootstrap (PROJECT/ROADMAP/STATE/REQUIREMENTS/config) | data | gsdState `initProject` (lib/state.js:108-141) | Only writer for PROJECT.md and config.json. |
| Quick-task entry persistence (TASK.md) | **data (violation)** | gsd_quick via real `node:fs/promises` (lib/quick.js:55-57) | **Bypasses ctx.fs** — R1. Not a gsdState artefact. Finding, not a security blocker. |
| Tool registration + schema compile | integration | `defineTool` + `ctx.tools.register` (lib/core-tools.js etc.) | Schema-validity already proven phase 1 (D-01). |
| Subagent orchestration (spawn/collect) | integration | `spawnSubagent` (lib/_runner.js:8-32) via host `subagents` service | Fake-subagents service stands in (D-04). |
| Phase-loop state transitions (setActivePhase/addDecision) | domain | gsdState (lib/state.js:259-307) | Tools call these; smokes assert side-effects. |
| git/gh preflight + PR creation | integration (infra) | gsd_ship via `node:child_process` (lib/ship.js:11,19-30) | Real git/gh; fail-loud guards (D-03). Out of fake-host scope. |
| Smoke test orchestration | presentation (test) | test/*.test.mjs | Phase-2 deliverable lives entirely here. |

No capability is misplaced across a security boundary. The only tier anomaly is gsd_quick's real-fs write (R1/OQ-1), which is a consistency finding, not a security BLOCKER.

---

## Validation Architecture

What automated check proves each behaviour (feeds the Nyquist/coverage gate for verify):

### MOUNT-03 — gsdState round-trip (extends test/state.test.mjs)
| Artefact | Accessor pair | Assertion shape | Proves |
|---|---|---|---|
| PROJECT.md | direct fs write → `readProject` | verbatim string equal | read fidelity (no writer) |
| REQUIREMENTS.md | `writeRequirements(reqs)` → `readRequirements` | `deepEqual` on `[{id,text,complete}]` | parse/stringify no loss |
| ROADMAP.md | `writeRoadmap(doc)` → `readRoadmap` | `deepEqual` on projected `{milestoneName, version, phases:[{n,name,goal,requirements,status}]}` (ignore `slug`, `milestone`) | no loss modulo known asymmetry (R3) |
| STATE.md | `writeState(doc)` → `readState` | `deepEqual` on `{frontmatter (excl. last_updated/last_activity), body:{position,decisions,blockers,continuity}}` | no loss modulo writeState mutations (R3) |
| config.json | `initProject(opts)` → `readConfig` | `deepEqual` on `_defaultConfig(opts)` | config round-trip |
| CONTEXT.md | `writeArtifact("CONTEXT", txt)` → `readArtifact("CONTEXT")` | verbatim equal | raw round-trip |
| RESEARCH.md | `writeArtifact("RESEARCH", txt)` → `readArtifact("RESEARCH")` | verbatim equal | raw round-trip |
| VERIFICATION.md | `writeArtifact("VERIFICATION", txt)` → `readArtifact("VERIFICATION")` | verbatim equal | raw round-trip |
| PLAN/SUMMARY | (existing tests.test.mjs) | already green | already proven |

### MOUNT-04 — tool execute smokes
| Tool | Smoke | Pass criterion |
|---|---|---|
| gsd_new_milestone | `buildProject` → `execute({milestoneName,version,phases})` | return matches `/New milestone/`; `readRoadmap().phases.length === 2`; STATE frontmatter milestone updated |
| gsd_progress | `buildProject` → `execute({})` and `execute({phase:1})` | return contains `# GSD PROGRESS` and a `Phase 01 auth` line; no throw |
| gsd_quick | real temp cwd + fake subagents (OQ-1) | return matches `/gsd_quick done/`; `<dir>/TASK.md` exists with entry |
| gsd_ui_phase | `buildProject` + fake `ui-researcher` (≥50 chars) + `ui-checker` ("VERIFICATION PASSED") | return matches `/gsd_ui_phase complete/` and `/ui-checker: VERIFICATION PASSED/`; `01-auth-UI-SPEC.md` written; STATE step → "plan" |
| gsd_verify | `buildProject` + PLAN-01 + SUMMARY-01 + fake `verify` (writes VERIFICATION status:passed) | return matches `/✓ Phase 1 verified/`; `01-auth-VERIFICATION.md` written; STATE step → "ship" |
| gsd_ship (guard) | FakeFs + passed VERIFICATION, cwd `/project` | throws `/gsd_ship preflight failed:/` (branch gate) — OQ-2 |

All smokes run under `node --test test/*.test.mjs` (package.json:21) with no network, no live LLM, no real git/gh (except gsd_quick's isolated temp-fs write). [VERIFIED: package.json:21; green suite this session]

---

## Project Constraints (from project conventions)

- **Zero runtime dependencies** (package.json:30 `"dependencies": {}`). Round-trip tests must NOT add a YAML/markdown parser; gsdState's own parsers (lib/_shared.js) are the only artefact parsers. [VERIFIED: package.json:30, lib/_shared.js:1-4]
- **Test runner:** `node --test test/*.test.mjs` (package.json:21). Any new `test/*.test.mjs` is auto-collected; no glob changes needed. Tests are plain ESM `.mjs`. [VERIFIED: package.json:21]
- **Offline-only invariant (D-04):** no live LLM, no git/gh, no live DSH boot. FakeFs (test/helpers/fake-fs.mjs:9-62) + fake-ctx + fake-subagents stand in for all host services. [VERIFIED: CONTEXT D-04; test/helpers/fake-fs.mjs:9-62]
- **FakeFs auto-creates parent dirs** on `writeText` (test/helpers/fake-fs.mjs:42-45), mirroring `@deepseek-ai/dsh-fs-local` writeFileAtomic. gsdState also calls `_ensureParent` (lib/state.js:93-96) defensively. [VERIFIED: test/helpers/fake-fs.mjs:42-45, lib/state.js:93-96]
- **No re-proving schema-validity** (D-01): phase 1's mount.test.mjs:307-318 already asserts all 12 tools compile a schema. Phase-2 smokes call `t.execute(args, exec)` directly with hand-built args (the existing pattern, tools.test.mjs:95), bypassing the schema layer. [VERIFIED: D-01; test/mount.test.mjs:307-318; test/tools.test.mjs:95]
- **Determinism:** dates via `today()`/`nowIso()` (lib/_shared.js:18-24) are wall-clock; the gsd_quick smoke's recorded path contains `today()` — assert with a regex, not an exact date. [VERIFIED: lib/_shared.js:18-24, lib/quick.js:40]

---

## Provenance summary

- [VERIFIED: lib/state.js] — GsdState API (read full file, lines cited inline)
- [VERIFIED: lib/_shared.js] — parse/stringify helpers (read full file)
- [VERIFIED: lib/_runner.js] — spawnSubagent/planningContext/cwdOf (read full file)
- [VERIFIED: lib/core-tools.js] — gsd_init/status/progress/new_milestone (read full file)
- [VERIFIED: lib/quick.js] — gsd_quick, real-fs write at 55-57 (read full file)
- [VERIFIED: lib/ui.js] — gsd_ui_phase (read full file)
- [VERIFIED: lib/verify.js] — gsd_verify (read full file)
- [VERIFIED: lib/plan.js] — gsd_plan, closed-phase gate (read full file)
- [VERIFIED: lib/ship.js] — gsd_ship preflight gates (read full file)
- [VERIFIED: lib/discuss.js] — gsd_discuss (read full file)
- [VERIFIED: test/state.test.mjs] — existing round-trip tests (read full file)
- [VERIFIED: test/tools.test.mjs] — existing tool behavioural tests + makeSubagents (read full file)
- [VERIFIED: test/mount.test.mjs] — phase-1 mount harness + schema-validity (read full file)
- [VERIFIED: test/helpers/fake-fs.mjs] — FakeFs/stateCtx/realFsAdapter (read full file)
- [VERIFIED: test/helpers/project.mjs] — buildProject + canned artefacts (read full file)
- [VERIFIED: package.json] — exports, peerDeps, no deps, test script (read full file)
- [VERIFIED: .planning/phases/GSD-01-live-mount/...-VERIFICATION.md] — phase-1 deferral of MOUNT-03/04 full (read full file)
- [VERIFIED: bash this session] — node v24.15.0; git 2.55.0 installed; gh installed and authenticated (jaaty); `node --test test/*.test.mjs` → 41 pass 0 fail; `gh auth status` → logged in; `grep` of _agents.js exports and spawnSubagent call sites
- [ASSUMED] — none material; every claim is grounded in a file read or command run this session.

---

That is the complete RESEARCH.md. I have NOT written it to disk (per instructions); the orchestrator saves it to `.planning/phases/GSD-02-service-tools/GSD-02-service-tools-RESEARCH.md`.
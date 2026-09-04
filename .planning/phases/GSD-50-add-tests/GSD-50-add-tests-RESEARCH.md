I've completed the research and written the file to the exact target path. I also return the full contents below, as instructed.

## RESEARCH.md (full contents)

```markdown
# Phase 50: add-tests — RESEARCH.md

**Phase goal:** Add an add-tests generator (gsd_add_tests + /gsd-add-tests) that creates unit and Integration ("E2E" tier) tests for a completed phase from its SUMMARY.md / CONTEXT.md / VERIFICATION.md and implementation, commits them atomically, writes a `<NN>-ATEST.md` coverage report, and is advisory (never advances STATE, never ships). [GAP-16]

---

## 1. Domain analysis

### 1.1 The upstream add-tests contract (WHAT/pattern — read-only reference)
- [VERIFIED: `.analysis/gsd-core/commands/gsd/add-tests.md`] Upstream `/gsd:add-tests <phase> [instructions]` loads SUMMARY.md, CONTEXT.md, VERIFICATION.md under `@~/.claude/gsd-core/workflows/add-tests.md`, and its success criteria require: artifacts loaded, every changed file classified TDD/E2E/Skip, classification approved, test structure discovered, test plan approved, tests generated, all tests executed, bugs flagged (never fixed), committed with `test(phase-{N}): add unit and E2E tests from add-tests command`, coverage gaps documented.
- [VERIFIED: `.analysis/gsd-core/gsd-core/workflows/add-tests.md`] Upstream workflow steps: `init_context` (reads init JSON `phase_dir/phase_number/phase_name`), `analyze_implementation` (classify each changed SUMMARY file into **TDD**=unit / **E2E**=browser / **Skip**), `present_classification` (AskUserQuestion approve/adjust/cancel), `discover_test_structure`, `generate_test_plan` (AskUserQuestion), `execute_tdd_generation` (RED-GREEN, flag but never fix bugs), `execute_e2e_generation`, `summary_and_commit` (table + `git add {files}` / `git commit -m "test(phase-${N}): add unit and E2E tests from add-tests command"`).
- [VERIFIED: same workflow] Upstream **no-skip rule**: "If E2E tests cannot execute … report the blocker and mark the test as incomplete. Never mark success without actually running the test." The bundle deliberately drops this (D-11: the tool never executes the suite).

**Domain confidence: HIGH.** The upstream is a CLAUDE-runtime CLI workflow whose two AskUserQuestion approval gates, `--text` transport, real Playwright E2E execution, and `gsd-tools.cjs` shim bootstrap are all out of scope (see CONTEXT `<deferred>` + D-03/D-09). The bundle re-implements it as one in-process tool with a single gate, deterministic SUMMARY extraction, and a spawnSubagent writer.

### 1.2 The bundle's closest siblings to mirror
- [VERIFIED: `lib/validate-phase.js`] The **hybrid tool** (deterministic pure-JS scan + a structured-output fresh-context subagent that WRITES test files while the TOOL writes/commits) is the exact division-of-labour template for add-tests (D-05/D-06). Its reusable pure exports directly serve add-tests:
  - `validateTestPaths(paths)` (line 69) — the R-5 tool-side hard boundary (relative, non-traversing, test-shaped only). **Exported → reuse directly.**
  - `detectTestInfra({configFiles, testFiles})` (line 86) — returns `{kind, suggested_command, testPatterns}` (jest/vitest/config→node:test default). **Exported → reuse directly.**
  - `isTestPath(p)` (line 58) — `.test.|.spec.`, `test_` prefix, or `/test//tests//__tests__/` segment. **Exported → reuse directly.**
  - `VALIDATION_AUDITOR_SCHEMA` + `resolveAuditorOutput` (lines 151, 191) — the structured-output contract + validator template (write the analogous `TEST_WRITER_SCHEMA`/`resolveWriterOutput`).
  - `needsGapWriting`, `renderSignOff`, `markManualOnly`, `classifyStatus`, `assembleValidationTable` — template helpers for the ATEST.md coverage report.
  - The `apply()` shape: fail-fast guards, `ensurePhaseBranch`, `gap_decision` gate, degrade-with-flag writing a pending UNAVAILABLE report, `commitSourceFiles(cwd, paths, msg)` + `commitArtifacts(cwd, phaseN, {scope, phaseName})` seams.
- [VERIFIED: `lib/autonomous.js`] The **out-of-band NOT_LOOP_ORDERED step-plugin** with inject `/ ["gsdState","tools","subagents"]`, `ctx.provide("gsdAutonomous", buildCapability("gsdAutonomous"))`, and advisory no-STATE-mutation structure. add-tests mirrors this registration + advisory posture (D-01/D-02).
- [VERIFIED: `lib/_capabilities.js`] The descriptor TABLE + `CAPABILITY_KEYS` + `buildCapability`/`allCapabilities`. A `gsdAddTests` row slots in with `role:"out-of-band"`, `tools:["gsd_add_tests"]`, `commands:["gsd-add-tests"]`, `order:NOT_LOOP_ORDERED`, `produces:["<NN>-ATEST.md","TEST files"]`, `consumes:["SUMMARY.md","CONTEXT.md","VERIFICATION.md"]` (D-01).
- [VERIFIED: `lib/commands.js`] `COMMANDS` array + the automatic command→capability pairing (line 366 `commandToCapability`). A `/gsd-add-tests` entry in `COMMANDS` is auto-paired to `gsdAddTests` via the descriptor — no manual wiring (D-01).
- [VERIFIED: `lib/_runner.js:8` `spawnSubagent(ctx, exec, {label, promptText, outputSchema})`] The spawn seam; pass `outputSchema` so the fresh writer returns `structured` (validate-phase `apply()` line 530 shows the exact call pattern + fault→degrade handling).
- [VERIFIED: `lib/_git-artifacts.js`] `commitSourceFiles(cwd, files, message, gitFn)` (line 211) for the atomic test-file commit; `commitArtifacts(cwd, phaseNum, {scope, phaseName})` (line 174) for the ATEST.md. Both accept an injectable `gitFn`. `ensurePhaseBranch(cwd, phaseN)` (line 66) for branch acquisition (CQ-07). SECURITY: fixed `-C cwd` argument arrays only.

### 1.3 The deterministic changed-file extraction — **the canonical pattern**
- [VERIFIED: `lib/code-review.js:201` `extractSummaryFiles` + `lib/ship.js:247`] The codebase ALREADY extracts a completed phase's changed source files deterministically from the phase's `*-SUMMARY.md` files by reading frontmatter `key-files.created` + `key-files.modified`. Real SUMMARY files confirm the shape — e.g. `.planning/phases/GSD-51-drop-clean-branch/GSD-51-...-01-SUMMARY.md` frontmatter: `key-files: created: [] / modified: [lib/_shared.js, lib/undo.js, test/undo.test.mjs, test/_shared.test.mjs]`.
- `filterSourcePaths` (code-review.js:163) additionally drops `.planning/`, root artefacts, `*-SUMMARY/-PLAN/-VERIFICATION.md`, and lockfiles — useful to prune the SUMMARY key-files before classifying.
- **Recommendation (settles D-13 discretion):** reuse this `key-files` frontmatter extraction for add-tests (either export code-review's `extractSummaryFiles`, or replicate its ~17 lines into `lib/add-tests.js`). This is more deterministic than scanning SUMMARY prose and is the established in-repo convention. The D-13 "SUMMARY prose vs parsed Files-Changed section" question is therefore RESOLVED in favour of the frontmatter `key-files` mechanism that code-review.js and ship.js already use.

### 1.4 Standard pitfalls
- **Cascade of count assertions on registration.** Adding a 23rd capability key + a new plugin row + a new tool/command breaks several exact-count assertions. Verified read-only (see Risks §3).
- **Path-traversal via writer output.** The subagent returns arbitrary path strings; only the TOOL's `validateTestPaths` (data tier) may authorize writes — never trust the subagent (D-06/R-5, DEGR hard rule).
- **Writer spawning with no subagents service.** `spawnSubagent` throws when `subagents` is absent; add-tests must fail-fast/degrade-with-flag (D-02/D-10) — mirror validate-phase's `runAuditPass` try/catch.
- **Mixing advisory with STATE advancement.** add-tests MUST NOT call `setActivePhase` (unlike validate-phase which does). Only `ensurePhaseBranch` + `commitSourceFiles` + `commitArtifacts` (D-04/D-08).
- **Executing the suite.** The bundle runs `node --test test/*.test.mjs` with no browser runner (D-03); add-tests must report run commands, never execute (D-11).

---

## 2. Package legitimacy

No new runtime dependencies are proposed. Everything add-tests needs is already a peer import or in-repo export:
- [VERIFIED: `package.json`] `"dependencies": {}` and `"peerDependencies"` = `@deepseek-ai/dsh-tools@0.1.1-rc.2`, `@deepseek-ai/schemastery@3.18.1`, `@deepseek-ai/cordis@4.0.1`, `@deepseek-ai/dsh-llm@0.1.1-rc.2`. The tool imports `defineTool` from `@deepseek-ai/dsh-tools` (validate-phase.js:33), `createUserMessage` from `@deepseek-ai/dsh-llm` (commands.js:15) — both already peer-declared and used by shipped code.
- [VERIFIED: `package-lock.json`] These peers are already resolvable in the workspace (validated by the existing green suite).
- Node `>=20` (engines) — `node:test` / `node:child_process` builtins only (D-03).

Conclusion: no new packages to vet. The only package-surface changes are the subpath export `"./add-tests" : "./lib/add-tests.js"` in `package.json` `exports` and the new `cordis.patch.yml` insert row (both in-repo, no registry dependency). The `files` whitelist already ships `lib/*.js`, so shipping the new module needs no `files` change.

---

## 3. Risks, and Open Questions

### 3.1 OQ (all RESOLVED before planning can proceed)
- **OQ-1 — How are a completed phase's changed files extracted from SUMMARY?** **RESOLVED.** Use the in-repo `key-files.created` + `key-files.modified` frontmatter extraction already implemented by `lib/code-review.js:201-218` (`extractSummaryFiles`) and `lib/ship.js:247`; real SUMMARY frontmatter verified. Reuse/replicate + optionally filter with `filterSourcePaths` (code-review.js:163). This is strictly more deterministic than SUMMARY-prose scanning. *(Resolves D-13 discretion.)*
- **OQ-2 — Which pure helpers are reusable vs new?** **RESOLVED.** Reuse `validateTestPaths`, `detectTestInfra`, `isTestPath` (validate-phase.js, all exported). New pure exports in `lib/add-tests.js`: `TEST_WRITER_SCHEMA`/`resolveWriterOutput`, `extractChangedFiles` (key-files), a gate-plan builder and the ATEST.md body assembler. *(Resolves D-13.)*
- **OQ-3 — Registration surface / count cascade.** **RESOLVED.** Confirmed (read-only) that a new capability + plugin row breaks these exact assertions which MUST be updated in the same phase:
  - `test/_capabilities.test.mjs:13` `CAPABILITY_KEYS.length === 22` → 23 (and the includes-list test at that file).
  - `test/mount.test.mjs:155` `CAPABILITY_KEYS.length === 22` → 23; `:143` `ctx.tools.length === 29` → 30; `:144` `ctx.commands.length === 26` → 27; `:186` `ctx2.commands.length === 25` → 26; `:211` `insertRows.length === 24` → 25; `:324` `ctx.tools.length === 29` → 30.
  - `test/render.test.mjs:105` `informationEntries(FULL)` exact array `["gsdMapCodebase","gsdOrient","gsdJobs","gsdUndo","gsdHealth","gsdAutonomous"]` → append `"gsdAddTests"` (if the new key is appended to `CAPABILITY_KEYS` last).
  - `test/helpers/mount-harness.mjs:23` `PATCH_ROWS` → add `{ id: "gsd-add-tests", sub: "add-tests" }` (24→25 rows).
  - `cordis.patch.yml` → add insert row `- id: gsd-add-tests / name: '@dsh-gsd/bundle/add-tests'`.
  - `package.json` → add `"./add-tests": { "default": "./lib/add-tests.js" }` to `exports`.
  - `removal.test.mjs` STEP_CAPS filters `role:"step"` only (line 37) → an out-of-band add-tests does NOT join the retirement matrix; no change there. The persona / renderer out-of-band informational list will naturally include it (expected).
  - **Risk:** the phase MUST land these test updates atomically with the registration or the suite breaks. Flag to the executor.
- **OQ-4 — Writer dispatch.** **RESOLVED.** One fresh-context `gsd-add-tests-writer` subagent spawned via `spawnSubagent(ctx, exec, { label, promptText, outputSchema: TEST_WRITER_SCHEMA })`, returning `structured`; on spawn error / malformed output / empty accepted set → degrade-with-flag writing a pending `UNAVAILABLE` `<NN>-ATEST.md` (mirror validate-phase lines 525-577). *(Resolves D-05/D-06/D-10.)*
- **OQ-5 — "E2E" tier without a browser.** **RESOLVED.** Reinterpret E2E as Integration/loop-level tests in `node:test` using the existing `test/helpers/mount-harness.mjs` (`makeMountCtx`/`makeExec`/`CWD`) + the `apply()`-based plugin activation pattern from `test/autonomous.test.mjs` / `test/validate-phase.test.mjs`. No Playwright. The writer classification is Unit | Integration | Skip (D-03/D-05). *(Resolves D-03.)*
- **OQ-6 — Classification & generation authority.** **RESOLVED.** The classification and the actual test-generating are NOT done by the tool — they are done by the single fresh-context writer subagent whose prompt inlines the SUMMARY/CONTEXT/VERIFICATION bodies, the extracted changed files, the detected infra/conventions, and the re-constrained Unit/Integration/Skip criteria (D-05). The tool only extracts scope deterministically, validates the writer's returned paths, writes, and commits (D-06).
- **OQ-7 — The single approval gate.** **RESOLVED.** One in-process gate before spawning the writer: when there are changed files AND no `--proceed`/`--auto`, return the classification plan (unit/integration/skip + files + suggested commands) and ask the user to re-call with `--proceed` (or `--auto` to bypass) or `--cancel` to abort. Nothing is spawned or written before approval (D-09). Mirror validate-phase's `gap_decision` gate but with proceed/cancel verb semantics. Model the exact parameter shape (`proceed`/`auto`/`cancel` booleans vs a single `action` string) in the planner (D-13).
- **OQ-8 — Commit + artefact messages.** **RESOLVED.** Test files committed atomically via `commitSourceFiles(cwd, paths, 'test(phase-{N}): add unit and E2E tests from add-tests command')` (D-08 verbatim); the `<NN>-ATEST.md` committed via `commitArtifacts(cwd, phaseN, { scope: "add-tests", phaseName })` (D-08). Branch acquired via `ensurePhaseBranch(cwd, phaseN)` (CQ-07). Zero `setActivePhase`/`completePhase` calls (advisory, D-04).
- **OQ-9 — Reporting bugs / not running the suite.** **RESOLVED.** Generated-test assertion-failure *indications* are surfaced in the ATEST report + tool output as potential bugs (expected/actual/file) with a follow-up suggestion, but never fixed (D-11). `detectTestInfra(...).suggested_command` is surfaced as the run command; the tool never executes it (D-11).

### 3.2 Risks
- **R-1 (HIGH): count-test cascade.** Any registration change without the §3.1-OQ3 test updates breaks the suite. Mitigate: make the registration + its test-count updates one atomic unit in the execute wave.
- **R-2 (MEDIUM): empty changed-file scope.** A completed phase whose SUMMARY has no `key-files` would yield zero files → gate would have nothing to show / writer nothing to classify. Mitigate: gate on "changed files to generate" (D-09) so an empty scope degrades to a clear status rather than a spurious spawn; treat it as `blocked`/no-op with a readable message.
- **R-3 (MEDIUM): writer malformed/absent output.** Resolved via degrade-with-flag (OQ-4). Never fake success (D-10/D-11).
- **R-4 (LOW/MEDIUM): `subagents` unavailable.** `spawnSubagent` throws in `_runner.js:10`; add-tests must catch and degrade (OQ-4), and `inject` must declare `subagents` as a hard coeffect (D-02/DEGR-07).
- **R-5 (SECURITY, BLOCKER if mis-tiered): path boundary.** The writer's returned path strings MUST pass through the tool's `validateTestPaths` (data tier) before any write; absolute / `..` / non-test-shaped / empty paths are skipped, recorded, escalated — never written (D-07). This mirrors `lib/code-review.js` `validateFiles` and `lib/validate-phase.js:69`.
- **R-6 (info): coexistence with gsd_validate_phase.** add-tests is the proactive generator (writes regardless of validate gaps); it does not read `VALIDATION.md` gap state and must not conflict with `workflow.validate_phase` soft gate. A `workflow.add_tests===false` soft gate is optional (mirror validate-phase) but not required by CONTEXT — leave to planner judgement.

---

## 4. Architectural Responsibility Map

| Capability | Tier | Owner | Notes |
|---|---|---|---|
| Changed-file extraction from SUMMARY `key-files` | **domain** | `lib/add-tests.js` pure helper | Reuse code-review `extractSummaryFiles` pattern; no I/O. |
| Unit/Integration/Skip **classification** + test content | **integration** | `gsd-add-tests-writer` subagent via `spawnSubagent` | Fresh-context LLM; returns structured payloads only. |
| Writer-output validation (`resolveWriterOutput`/`TEST_WRITER_SCHEMA`) | **domain** | `lib/add-tests.js` pure helper | Mirrors `resolveAuditorOutput`. |
| **Path hard boundary (`validateTestPaths`)** | **data (tool-side)** | `lib/validate-phase.js` export, called by `lib/add-tests.js` | **SECURITY-SENSITIVE.** Must be enforced by the TOOL on returned strings, never delegated to the LLM subagent. Mis-tiering this = BLOCKER. |
| Test-file write + atomic commit (`commitSourceFiles`) | **data / integration** | `lib/_git-artifacts.js` | `gitFn` injectable seam (validate-phase pattern). Fixed arg arrays. |
| `<NN>-ATEST.md` report write + `commitArtifacts` | **data** | `lib/add-tests.js` → gsdState + `_git-artifacts.js` | Never advances STATE. |
| Gate response / tool output / report rendering (user-facing strings) | **presentation** | `lib/add-tests.js` `defineTool` description + `presentCall` + output | Mirrors validate-phase tool's `presentCall` + `output.render`. |
| Capability + command registration | **presentation/integration** | `_capabilities.js` descriptor + `commands.js` COMMANDS entry + `cordis.patch.yml` row | Out-of-band `NOT_LOOP_ORDERED` (D-01). |
| Test infra detection (`detectTestInfra`) | **domain** | `lib/validate-phase.js` export | Reused for the run-command suggestion. |
| gsdState / artefact reads (SUMMARY/CONTEXT/VERIFICATION) | **data** | `readArtifact` / `writeArtifact` | `readArtifact(cwd, N, "SUMMARY-<PP>")`, `"CONTEXT"`, `"VERIFICATION"`. |

**Security note (BLOCKER guard):** the R-5 path boundary is the one security-sensitive capability; it lives at the **data tier** in the tool (via the exported `validateTestPaths`), not in the integration-tier subagent. The subagent may only *suggest* paths; only the tool authorizes writes.

---

## 5. Validation Architecture (automated checks proving each behaviour)

All checks are offline node:test (`npm test` = `node --test test/*.test.mjs`), modeled on `test/validate-phase.test.mjs` + `test/autonomous.test.mjs` using FakeFs + `makeMountCtx`/`makeExec`/`CWD` from `test/helpers/mount-harness.mjs`, with a fake `subagents` factory (makeAuditorSubagents pattern in validate-phase.test.mjs:424) and fake `ctx.gitFn` (makeFakeGit, validate-phase.test.mjs:438).

- **Capability descriptor** — `gsdAddTests` in `CAPABILITY_KEYS`/TABLE: role `out-of-band`, `order:NOT_LOOP_ORDERED`, tools `['gsd_add_tests']`, commands `['gsd-add-tests']`, produces/consumes as declared (mirror _capabilities.test.mjs).
- **Command pairing** — `/gsd-add-tests` present in `commands.js` COMMANDS and auto-paired to `gsdAddTests` (mirror autonomous.test command tests).
- **Registration counts** — update the exact-length assertions enumerated in §3.1-OQ3 so the suite stays green.
- **Phase-not-executed fail-fast** — no `SUMMARY-<PP>` → tool throws `not executed (no SUMMARY found — run gsd_execute first)` / phase-not-in-ROADMAP / no-`.planning` guards (mirror validate-phase.test.mjs:336).
- **Deterministic SUMMARY extraction** — `key-files.created`+`key-files.modified` flattened/deduped; `filterSourcePaths` pruning optional.
- **Classification gate request** — changed files exist, no `--proceed`/`--auto` → returns the classification plan; NO subagent spawned, NO file written (mirror validate-phase.test.mjs:461).
- **Writer dispatch via fake subagents** — `makeAuditorSubagents`-style fake returns controlled `structured`; assert the prompt text/capture + that the tool writes returned files (mirror validate-phase.test.mjs:510).
- **`resolveWriterOutput` validation** — malformed/missing `tests_written`/invalid status → null → degrade (mirror validate-phase.test.mjs:193-208).
- **Path hard boundary** — `validateTestPaths` reuse: traversing / absolute / impl / empty skipped and never written (mirror validate-phase.test.mjs:537).
- **Atomic commit message** — `commitSourceFiles` message exactly `test(phase-{N}): add unit and E2E tests from add-tests command` (assert via fake git, mirror validate-phase.test.mjs:526).
- **Advisory no-STATE-mutation** — after a full run, `setActivePhase`/`completePhase` NOT called: assert STATE step/next_action unchanged (contrast validate-phase which DOES advance — add-tests must assert the opposite, e.g. STATE still at the pre-call position).
- **Degrade-with-flag** — writer spawn throw / malformed / empty accepted set → pending `UNAVAILABLE` `<NN>-ATEST.md`, real cause surfaced, never rethrown (mirror validate-phase.test.mjs:557).
- **No-fix bug reporting** — output/ATEST report flags bug indications (expected/actual/file) and surfaces `suggested_command`; no suite execution and no impl write (assert no `commitSourceFiles` on impl files, no `npm test` call).

---

## 6. Project Constraints (from project conventions)

- [VERIFIED: `package.json`] `"type":"module"`; `"test"` / `"prepublishOnly"` = `node --test test/*.test.mjs`. **No browser/Playwright runner** → the E2E tier is Integration/loop-level node:test via `mount-harness` (D-03).
- No new runtime dependencies; node builtins only (`dependencies: {}`); peers are `dsh-tools`/`schemastery`/`cordis`/`dsh-llm` (all already used).
- Security discipline: every git call uses a FIXED argument array with `-C cwd`; never interpolate into a shell string (mirror `lib/_git-artifacts.js:15-16`, ship.js, map-codebase.js).
- New source module must be exported at `"./add-tests"` in `exports` and its plugin row added to `cordis.patch.yml`; `files` already covers `lib/*.js`.
- Keep the full existing suite green (baseline ~898 tests per the phase-48 record); the registration count assertions in §3.1-OQ3 must be updated in the same atomic commit as the registration.
- The new capability is **out-of-band** (`role:"out-of-band"`, `order:NOT_LOOP_ORDERED`) — it renders in the informational (non-loop) section and does NOT join the `role:"step"` retirement matrix.
- Tool shape mirrors the shipped siblings: `import { defineTool } from "@deepseek-ai/dsh-tools"`, `output: { schema: {type:"string"}, render: (_a,v)=>[{type:"text",text:v}] }`, a `presentCall`, and an `export { name, inject, apply }` closure.
```

### Key research findings

1. **The canonical changed-file extraction already exists.** `lib/code-review.js:201` (`extractSummaryFiles`) + `lib/ship.js:247` read `key-files.created`/`key-files.modified` from each `*-SUMMARY.md` frontmatter — this is the established deterministic pattern to reuse for add-tests (settles the D-13 SUMMARY-prose vs Files-Changed discretion in favour of `key-files`).
2. **All needed helpers are already exported** — `validateTestPaths`, `detectTestInfra`, `isTestPath` (from `lib/validate-phase.js`) → no new deps, node builtins only.
3. **E2E tier = Integration via node:test + `mount-harness`** (no Playwright, per `package.json`) — confirmed.
4. **⚠️ Registration count cascade (must be planned for).** Adding the 23rd capability + a new plugin row/tool/command breaks exact-length assertions in `test/_capabilities.test.mjs:13`, `test/mount.test.mjs` (143, 144, 155, 186, 211, 324), `test/render.test.mjs:105`, and `PATCH_ROWS` in `mount-harness.mjs` — these must be updated atomically with the registration.
5. **Advisory constraint:** add-tests must NOT call `setActivePhase` (unlike validate-phase); the test must assert STATE is unchanged.

The research file was written to `/var/home/jatyeo/dev/dsh-gsd-bundle/.planning/phases/GSD-50-add-tests/GSD-50-add-tests-RESEARCH.md` (the exact target path). All 9 open questions are marked RESOLVED, so planning can proceed.
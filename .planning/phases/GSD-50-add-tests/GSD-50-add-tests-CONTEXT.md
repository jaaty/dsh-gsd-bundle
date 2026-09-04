# Phase 50: add-tests - Context

**Gathered:** 2026-09-04T00:52:35.691Z
**Status:** Ready for planning

<domain>
## Phase Boundary
**In scope:** Add an add-tests generator tool gsd_add_tests + /gsd-add-tests slash command publishing the gsdAddTests out-of-band capability (order NOT_LOOP_ORDERED in lib/add-tests.js). For a COMPLETED phase it: reads SUMMARY.md/CONTEXT.md/VERIFICATION.md as the specification, deterministically extracts the changed implementation files from SUMMARY (validate-phase style), discovers the active project's test infra + conventions, spawns one fresh-context gsd-add-tests-writer subagent that classifies each file into Unit / Integration / Skip and returns structured {path, req_id, content, type} test-file payloads, validates all paths against the hard boundary (test-shaped, no traversal/impl), writes and atomically commits the accepted test files with message test(phase-{N}): add unit and E2E tests from add-tests command, writes a <NN>-ATEST.md coverage report, and returns a structured summary (generated/passing/failing/blocked, coverage gaps, suggested test commands). It reports bugs discovered by tests but does NOT fix them, and does NOT execute the test suite itself (it surfaces the run commands). It is advisory: it never advances the STATE loop position and never ships.
**Out of scope:** No new loop step / no STATE loop-position advancement (add-tests is an out-of-band generator, like autonomous never ships). No real browser/Playwright E2E execution — the 'E2E' tier is reinterpreted as integration/loop-level tests via node:test + mount-harness (the bundle has no browser runner). No automatic test EXECUTION — the tool reports suggested commands, it does not run the suite. No fixing bugs the generated tests surface (report-only, upstream's no-fix rule). No full interactive two-gate AskUserQuestion flow — a single in-process confirmation gate + --auto (validate-phase gap_decision pattern). No --text/response_language CLI transport, no gsd-tools.cjs shim bootstrap, no cross-CLI distribution. No new runtime dependencies.
</domain>

<decisions>
## Decisions
### Integration structure
- **D-01:** add-tests is an out-of-band step capability gsdAddTests declared in lib/_capabilities.js with step:'out-of-band', role:'out-of-band', tools:['gsd_add_tests'], commands:['gsd-add-tests'], order:NOT_LOOP_ORDERED (it generates tests, not a linear loop step), produces:['<NN>-ATEST.md','TEST files'], consumes:['SUMMARY.md','CONTEXT.md','VERIFICATION.md']. The tool is registered in a new lib/add-tests.js via ctx.tools.register(defineTool({...})) and the /gsd-add-tests command in lib/commands.js routing to it, mirroring lib/autonomous.js + lib/validate-phase.js.
- **D-02:** Injectable dependencies: ['gsdState','tools','subagents'] (mirrors code-review/validate). The tool needs the subagents service to spawn the gsd-add-tests-writer via lib/_runner.js spawnSubagent; fail-fast with a clear error when 'subagents' is unavailable (DEGR-07 coeffect).
### Scope & tier mapping
- **D-03:** The E2E (browser) tier from upstream is reinterpreted as Integration/loop-level tests because the bundle runs node:test with NO Playwright/browser (package.json test script is `node --test test/*.test.mjs` only). The writer classifies each changed file as Unit | Integration | Skip, where Integration targets the phase's gsd_* tools end-to-end via the existing test/helpers/mount-harness.mjs conventions. No real browser runner is touched.
- **D-04:** add-tests targets COMPLETED phases only: it requires at least one SUMMARY-<PP>.md (readArtifact) for the phase, fail-fast with a clear error if none exists / phase not in ROADMAP (mirrors validate-phase's executed-phase guard). It is advisory and never advances the STATE loop position and never ships (D-01).
### Classification & generation
- **D-05:** Changed-file scope is extracted deterministically from the SUMMARY.md files-changed references (validate-phase matchReqToTests style), NOT from arbitrary implementation scanning. The classification (Unit/Integration/Skip) and the actual test generation are done by ONE fresh-context gsd-add-tests-writer subagent spawned via spawnSubagent, whose prompt includes the phase SUMMARY/CONTEXT/VERIFICATION bodies, the extracted changed files, the detected test infra + conventions, and the upstream TDD/E2E/Skip classification criteria (re-constrained for the bundle's Unit/Integration split per D-03).
- **D-06:** The writer subagent returns a STRUCTURED output object { tests_written: [{ path, req_id, content, type }], skip: [{ path, reason }], status: GENERATED|PARTIAL|ESCALATE, escalated: [{ req_id, reason }], notes } validated by a pure resolveWriterOutput helper (mirrors VALIDATION_AUDITOR_SCHEMA/resolveAuditorOutput). The TOOL (not the subagent) writes files to disk, enforces the path hard-boundary, and commits — matching the validate-phase write/commit division of labour.
### Path safety & commit
- **D-07:** R-5 hard boundary: only relative, non-traversing, TEST-shaped paths are writable. Reuse the existing validateTestPaths helper from lib/validate-phase.js (exported, pure): absolute paths, empty strings, any '..' segment, and non-test-shaped implementation paths are skipped and NEVER written; they are recorded as skipped and escalated.
- **D-08:** Accepted test files are committed atomically and separately with message `test(phase-{N}): add unit and E2E tests from add-tests command` via the existing commitSourceFiles seam (lib/_git-artifacts.js). A <NN>-ATEST.md coverage report (generated/passing/failing/blocked summary, files created, coverage gaps, bugs discovered report-only, suggested run commands) is written via writeArtifact and committed via commitArtifacts.
### Approval gate & error handling
- **D-09:** A single confirmation gate before spawning the writer, mirroring validate-phase's gap_decision pattern: when there are changed files to generate AND the user did not pass --auto, the tool returns the classification plan (unit/integration/skip, files, test commands) and asks the user to re-call with --proceed (or --auto) to continue, or a --cancel to abort. --auto bypasses the gate. Nothing is spawned or written before approval.
- **D-10:** Error handling: fail-fast on no .planning/ project, phase not in ROADMAP, or phase not executed (no SUMMARY) with clear messages mirroring graphify/validate guards. The writer subagent is optional-degrading: on spawn error, malformed structured output, or an empty accepted-file set, the tool degrades-with-flag writing a pending UNAVAILABLE <NN>-ATEST.md (validate-phase degrade pattern) and reports the real cause. It never silently fakes success.
- **D-11:** Bugs discovered by generated tests are REPORTED (not fixed) — upstream's no-fix rule for a test-generation command. The <NN>-ATEST.md and the tool output flag any assertion-failure indications as potential bugs with expected/actual/file, and surface a follow-up suggestion. The tool does NOT execute the test suite; it surfaces the discovered run commands in the report.
### Testing / TDD
- **D-12:** TDD: follow test/*.test.mjs + mount-harness conventions and model on test/validate-phase.test.mjs + test/autonomous.test.mjs. Cover: capability descriptor registration (tools/commands/order/produces/consumes), command pairing /gsd-add-tests, phase-not-executed fail-fast, deterministic SUMMARY extraction, classification gate request (no --proceed/--auto), writer dispatch via fake/spy subagents factory that returns controlled structured output, resolveWriterOutput validation (malformed → null), path hard-boundary (validateTestPaths reuse — traversing/impl/absolute skipped), atomic commit message assertion, advisory no-STATE-mutation, degrade-with-flag on writer failure, and no-fix reporting of discovered bugs.
### Claude's Discretion
- **D-13:** Exact writer subagent prompt wording and structured schema field naming; how changed files are extracted from SUMMARY prose vs a parsed 'Files Changed' section; precise <NN>-ATEST.md section layout; how the classification plan is rendered in the gate response; how the run-command suggestion is built from detectTestInfra.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Upstream add-tests contract (WHAT/pattern — read-only reference, NOT to be vendored)
- `.analysis/gsd-core/commands/gsd/add-tests.md — the add-tests command: argument parsing, execution context, commit message.`
- `.analysis/gsd-core/gsd-core/workflows/add-tests.md — the full add-tests workflow: init/load phase artefacts, analyze_implementation (TDD/E2E/Skip), discover_test_structure, generate_test_plan, execute generation, summary+commit, success criteria.`
### Bundle tool + capability + command pattern to mirror
- `lib/_capabilities.js — TABLE entry pattern (step/role/tools/commands/order/produces/consumes) and allCapabilities() (D-01).`
- `lib/autonomous.js — the out-of-band NOT_LOOP_ORDERED step-plugin to model registration, injectable deps, spawnSubagent orchestration, and advisory no-ship structure on (D-01/D-02).`
- `lib/validate-phase.js — the closest sibling: deterministic scope extraction, structured writer contract (VALIDATION_AUDITOR_SCHEMA/resolveAuditorOutput), validateTestPaths hard boundary, write/commit division, degrade-with-flag (D-05/D-06/D-07/D-10).`
- `lib/commands.js + lib/core-tools.js — COMMANDS array + command pairing + tool registration patterns.`
### Subagent orchestration runtime
- `lib/_runner.js — spawnSubagent(ctx, exec, {...}) used by plan/execute/verify/validate; the seam add-tests uses to spawn the writer (D-05).`
- `lib/_agents.js — the gsd-nyquist-auditor VALIDATION_AUDITOR_PROMPT at line ~506 to model the writer prompt (D-06).`
### State, artefacts, and config
- `lib/state.js — readConfig/readRoadmap/readArtifact/listPlans accessors; phase_complete / executed detection (D-04).`
- `lib/_shared.js — parseFrontmatter, zeroPad for <NN>-ATEST.md, readArtifact for SUMMARY/CONTEXT/VERIFICATION bodies (D-04/D-05).`
- `package.json — test script `node --test test/*.test.mjs`; no Playwright runner (D-03).`
- `lib/_git-artifacts.js — commitSourceFiles (atomic test-file commit, D-08) + commitArtifacts (ATEST.md, D-08) seams.`
### Existing tests
- `test/validate-phase.test.mjs — the closest test model (capability descriptor, resolveAuditorOutput validation, path boundary, gate, degrade) to model the add-tests tests on (D-12).`
- `test/autonomous.test.mjs — capability + command pairing + fake subagents factory patterns (D-12).`
- `test/helpers/mount-harness.mjs — mount harness + makeExec conventions for integration-tier test templates (D-03).`
</canonical_refs>

<code_context>
## Code Context
- lib/_capabilities.js holds the descriptor TABLE listing gsdValidatePhase / gsdAutonomous; a gsdAddTests entry slots in alongside (D-01).
- lib/autonomous.js is the out-of-band NOT_LOOP_ORDERED step-plugin example — add-tests mirrors its registration + advisory structure (D-01/D-02).
- lib/validate-phase.js exports pure helpers the new tool can reuse directly: validateTestPaths, detectTestInfra, isTestPath (D-07); its VALIDATION_AUDITOR_SCHEMA/resolveAuditorOutput/gap_decision gate/degrade-with-flag are the templates for the writer contract + D-09 gate + D-10 degrade (D-05/D-06/D-09/D-10).
- lib/_agents.js hosts VALIDATION_AUDITOR_PROMPT (line ~506) — the writer prompt lives beside it as TEST_WRITER_PROMPT (D-06).
- lib/_runner.js spawnSubagent + lib/_git-artifacts.js commitSourceFiles/commitArtifacts are the seams for dispatch + atomic commit (D-05/D-08).
- test/validate-phase.test.mjs + test/autonomous.test.mjs give the testing patterns (capability, gate, degrade, fake subagents) (D-12).
- package.json test script is node:test only — there is no Playwright/browser runner, so the 'E2E' tier is Unit/Integration in node:test (D-03).
</code_context>

<specifics>
## Specifics
- GAP-16 verbatim: 'An add-tests generator creates unit and E2E tests for a completed phase based on its UAT criteria and implementation.'
- User Q1 (registration) answer: out-of-band capability gsdAddTests, tool gsd_add_tests + /gsd-add-tests, mirroring autonomous + validate-phase (D-01).
- User Q2 (E2E tier) answer: reinterpret E2E as integration/loop-level tests via node:test + mount-harness; no Playwright/browser (D-03).
- User Q3 (classification) answer: deterministic SUMMARY-extracted scope + one fresh-context writer subagent returns structured test payloads (D-05/D-06).
- User Q4 (gate) answer: one confirmation gate + --auto bypass, single in-process gate (validate-phase gap_decision pattern), not upstream's two AskUserQuestion gates (D-09).
- User Q5 (commit/artefact/STATE) answer: atomic commit test(phase-{N}): add unit and E2E tests from add-tests command + <NN>-ATEST.md report; advisory, never advances STATE, never ships (D-04/D-08).
- Edge cases folded into decisions: coexistence with gsd_validate_phase (add-tests is the proactive generator, writes regardless of gaps), no automatic test execution (report run commands only, D-11), report-not-fix bugs (D-11).
</specifics>

<deferred>
## Deferred Ideas
- Full upstream two-gate approval (separate classification + test-plan AskUserQuestion rounds) — the bundle uses one in-process gate + --auto (D-09).
- Real browser/Playwright E2E execution — out of scope while the bundle has no browser runner (D-03).
- Automatic test-suite EXECUTION inside the tool — out of scope; the tool surfaces suggested commands instead (D-11).
- Test-runner result collection (per-generated-test pass/fail) into STATE — the tool reports, it does not run (D-11).
- Fix-on-fail behaviour — the tool reports discovered bugs and never fixes them (D-11).
- --text/response_language CLI transport and gsd-tools.cjs shim bootstrap — the bundle tool is in-process.
- Cross-CLI distribution to OpenAI Codex / Gemini etc. — the bundle ships one persona surface.
</deferred>


---

*Phase: 50-add-tests*
*Context gathered: 2026-09-04*
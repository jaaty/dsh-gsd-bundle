I have everything I need. Here is the complete RESEARCH.md.

---

# RESEARCH — Phase 8: capability-gates

## Domain analysis

### What this phase does
gsd_ship (`lib/ship.js`) currently has five hard preflight gates (verification passed, clean tree, feature branch, remote, gh-auth) that `fail()` before pushing, then pushes, builds a PR body, creates the PR, and updates STATE. This phase adds a **sixth preflight layer — the capability gates** (security, broken-windows, TDD-audit) that must run **before the push** (ship.js step 6, line 80), so a failing required gate aborts the ship before anything is pushed or a PR is created. Every gate reports pass/fail/skipped regardless of outcome.

### Standard stack / existing patterns (confidence: HIGH — all read this session)
- **Plugin/tool shape**: each phase tool is a `lib/<x>.js` module exporting `name`, `inject`, `apply(ctx)`; `apply` calls `ctx.tools.register(defineTool({...}))`. ship.js is at `lib/ship.js`. `[VERIFIED: lib/ship.js:32-172]`
- **Service access**: tools get the GSD state service via `ctx.get("gsdState")` → `s = gsd()`; ship.js uses `s.readArtifact`, `s.readRoadmap`, `s.listPlans`, `s.readState`, `s.updateStateFrontmatter`, `s.addDecision`, `s.completePhase`. `[VERIFIED: lib/ship.js:44-142]`
- **Config**: `gsdState.readConfig(cwd)` (lib/state.js:337-341) `JSON.parse`s `.planning/config.json`, returns `_defaultConfig({})` on missing/corrupt. There is **no `gates` key today**; `_defaultConfig` (lib/state.js:145-163) writes `gsd_state_version`, `workflow`, `context_window`, `project_code`, `response_language`. `[VERIFIED: lib/state.js:337-341, 145-163; .planning/config.json:1-17]`
- **Plans + type**: `s.listPlans(cwd, phaseNum)` (lib/state.js:485-520) returns each plan with `type: frontmatter.type || "execute"` (lib/state.js:509). The TDD-audit gate needs exactly this `type === "tdd"` to select which plans to audit. `[VERIFIED: lib/state.js:509]`
- **Failure helper**: `const fail = (m) => { throw new Error(\`gsd_ship preflight failed: ${m}\`); }` at lib/ship.js:53. D-05 mandates reusing it. `[VERIFIED: lib/ship.js:53]`
- **git invocation**: `execFileSync` via `run(cwd, cmd, args)` (ship.js:19-30). git/gh are host binaries, no npm wrapper. `[VERIFIED: lib/ship.js:19-30]`

### Gate semantics — locked decisions (D-01…D-09)
- **Security (D-01)**: match each **changed file path** against the secret/credential pattern list at `lib/_agents.js:283`. The list is filename globs (`.env`, `credentials.*`, `*.pem`, `id_rsa*`, `.npmrc`, etc.), so the faithful reading is **path/name matching**, not content scanning. `[VERIFIED: lib/_agents.js:283]`
- **Broken-windows (D-02)**: scan **changed file contents** for unreferenced `TODO`/`FIXME`/`XXX` markers and skipped tests (`test.skip(`/`describe.skip(`/`xit(`) or stubs. Any found = failure. Mirror of the verifier/executor anti-pattern debt rules at lib/_agents.js:166,192,197. `[VERIFIED: lib/_agents.js:166,192,197]`
- **TDD-audit (D-03, D-09)**: for each plan with `type: tdd`, verify its commits follow RED→GREEN: a `test:` commit must precede its `feat:`/`fix:` commit. Enforced regardless of the global `tdd_mode` flag (this repo has `tdd_mode: false` but ships `type: tdd` plans — `.planning/config.json:7`). `[VERIFIED: .planning/config.json:7; lib/_agents.js:162]`
- **Scan scope (D-04)**: only the phase's changed files (`git diff` vs base/merge-base), never the whole repo — pre-existing debt never blocks. `[VERIFIED: CONTEXT D-04]`
- **Blocking (D-05)** via existing `fail()`; **skip (D-06)** via `gates.<name>: false` in config OR a CLI flag; **report (D-07)** always lists every gate's pass/fail/skipped in a Gate Report section. `[VERIFIED: CONTEXT D-05/D-06/D-07]`
- **Config block (D-08)**: `gates: { security: true, broken_windows: true, tdd_audit: true }`, all default true; a gate set false = 'skipped', doesn't block. `[VERIFIED: CONTEXT D-08]`

### Commit-scope convention (needed for TDD audit)
Executors commit with conventional-commit **scope `{phase}-{plan}`**, e.g. `feat(03-02): …` (lib/_agents.js:157, EXECUTOR_PROMPT). So a phase-08 plan-01 TDD plan produces `test(08-01): …` then `feat(08-01): …`. The TDD audit can filter commit subjects by the `(08-PP)` scope token. `[VERIFIED: lib/_agents.js:157]`

### Git commands validated against the live repo (confidence: HIGH — ran this session)
- Default branch: `git symbolic-ref refs/remotes/origin/HEAD --short` → `origin/main`; ship.js strips the `origin/` prefix (ship.js:67). `[VERIFIED: git run; lib/ship.js:67]`
- Merge base: `git merge-base HEAD <base>` → works (returned `cc31de5…`). `[VERIFIED: git run]`
- Changed files: `git diff --name-only --diff-filter=ACM <mergeBase> HEAD` → returns changed file paths (A/M/C, excludes deleted/renamed which have no scannable content). Empty when HEAD == merge-base. `[VERIFIED: git run]`
- Commit subjects: `git log --format=%s <range>` → e.g. `docs(planning): record gsd_quick …`, `fix(ship): …`. `[VERIFIED: git run]`

### Pitfalls
- **Deleted files (D)** can't be content-scanned; use `--diff-filter=ACM`. (confidence: HIGH — git semantics)
- **`.planning/` artefacts are themselves changed files** in a phase diff. The broken-windows marker scan would false-positive on PLANNING prose (plan/context markdown legitimately contains prose). The planner should decide whether to exclude `.planning/**` and other markdown from the marker scan (see Open Question OQ-2). (confidence: HIGH — read the diff semantics this session)
- **No fake git/gh harness exists** in `test/` today — `test/service-tools.test.mjs:214-227` only asserts gsd_ship fails on a non-repo cwd by relying on real git erroring. Testing deterministic gate outcomes requires factoring gates into **pure evaluators** (testable like `test/_shared.test.mjs`) plus an **injectable git adapter**, OR building a fake-git executable on PATH. The canonical ref claims a "fake git/gh harness" but it is not present; the planner must construct one. `[VERIFIED: test/service-tools.test.mjs:214-227; grep found no fake-git helper]`
- **`listPlans` runs before PR body assembly in ship.js (line 84)** — gates must run before the push (line 80), so plan loading for the TDD audit is available well before any I/O. `[VERIFIED: lib/ship.js:80,84]`

## Package legitimacy
**No new npm dependencies are required.** The phase uses:
- `node:child_process` `execFileSync` — already imported and used by ship.js for git/gh. `[VERIFIED: lib/ship.js:11,19-30]`
- `node:fs/promises` — already used (ship.js:126). `[VERIFIED: lib/ship.js:126]`
- Host `git` / `gh` CLIs — already the integration mechanism; no wrapper package proposed. `[VERIFIED: lib/ship.js:19-30; git version 2.55.0 ran this session]`

Glob→regex matching for the secret patterns: **implement a tiny in-repo glob→regex converter** rather than pulling a glob library (the secret list has 20+ comma-separated globs incl. `config/secrets/*`, `*secret*`). Avoids a new dependency for a small, well-bounded matcher. (confidence: HIGH — glob semantics are standard; no registry claim made)

## Risks
1. **Gate logic placement / testability (BLOCKER risk if wrong):** git-dependent gates cannot be deterministically tested via the existing `test/` FakeFs harness (no git). Mitigation: implement each gate as a **pure evaluator** `(changedFiles, contentMap, commitSubjects) → {status, findings}` plus a thin **git-fetch adapter**; ship.js wires them. Unit-test the pure evaluators directly; tool-level-test the adapter + ship integration. (confidence: HIGH)
2. **Broken-windows false positives on `.planning/` prose.** Mitigation: exclude `.planning/**` and other non-code markdown from the marker scan (still scan code/test files); keep the path scan for security across all changed files. (confidence: HIGH)
3. **TDD-audit commit attribution.** Commits may be merged/squashed by the time of ship, or the branch may carry commits from multiple plans sharing the diff. Mitigation: filter `git log` subjects by the `(08-PP)` scope token within `mergeBase..HEAD`; if no scope-matching commit exists for a `type: tdd` plan, treat as a failure (missing `test:` gate). (confidence: MEDIUM — depends on exact commit history, which only exists at ship time)
4. **Config block absent in existing `.planning/config.json`.** Code must default all three gates to true when the `gates` block is missing, matching D-08. Do not require editing existing config. (confidence: HIGH)
5. **Scope of "changed files" when the branch == merge-base** (already fully pushed). The diff is empty → all gates trivially pass. That is the intended D-04 behaviour (no new debt to check). (confidence: HIGH)

## Open Questions
- **OQ-1 (RESOLVED):** What git diff base does the changed-files scan use? **Resolution:** compute `git merge-base HEAD <defaultBranch>` (defaultBranch = `args.base || origin/HEAD-stripped || "main"`, matching ship.js:67), then `git diff --name-only --diff-filter=ACM <mergeBase> HEAD`. This is faithful to D-04 "git diff vs the base/merge-base" and reuses the base already derived in ship.js.
- **OQ-2 (RESOLVED):** Do the gates scan `.planning/` artefacts? **Resolution:** Security gate scans **all** changed file paths (a secret committed anywhere is a failure, including `.planning/`). Broken-windows marker scan **excludes `.planning/**` and non-code files** (markdown/prose would false-positive on `TODO`/`FIXME` in plan/context text) and scans code/test files only. Keeps D-04's "phase changed files" scope while avoiding prose noise.
- **OQ-3 (RESOLVED):** How does the TDD-audit associate commits to a plan? **Resolution:** filter `git log --format=%s <mergeBase>..HEAD` for subjects containing the scope token `(<zeroPad(phase)>-<zeroPad(plan)>)` (e.g. `(08-01)`); for each `type: tdd` plan, assert at least one `test(...)`-prefixed subject appears before any `feat(...)`/`fix(...)`-prefixed subject in that plan's commit sequence. A `type: tdd` plan with no matching `test:` commit = failure.
- **OQ-4 (RESOLVED):** What is the per-invocation skip mechanism (D-06 "or via a CLI flag")? **Resolution:** add a `skip_gates: string[]` parameter to the gsd_ship tool schema (validated against the three known gate names); a gate skipped by config `false` OR present in `skip_gates` is reported `skipped` and does not block. Invalid/unknown skip names are rejected.
- **OQ-5 (RESOLVED):** Where do the gates run in ship.js's flow? **Resolution:** after the gh-auth gate (step 5, ship.js:77) and **before the push** (step 6, ship.js:80). A failing required gate calls `fail()` (throws `gsd_ship preflight failed: …`) before any push/PR I/O, per D-05.
- **OQ-6 (RESOLVED):** How is the gate report surfaced? **Resolution:** ship.js collects a `log` array returned as a string (ship.js:52,168). The Gate Report is appended as structured lines (one per gate: `security: pass|fail|skipped` + findings for failures), present on every run (D-07); blocking failures also embed the structured report in the `fail()` message.
- **OQ-7 (RESOLVED):** How are gates tested without a real git? **Resolution:** factor each gate into a pure evaluator (tested directly in a `test/gates.test.mjs`, mirroring `test/_shared.test.mjs`'s pure-helper style) and a thin git-adapter that ship.js calls; the adapter takes the repo cwd and returns `{changedFiles, contentByFile, commitSubjects}`. Gate-enforcement integration tests inject fake `changedFiles`/`contentMap`/`commitSubjects` (or a fake git executable) to produce deterministic pass/fail/skip outcomes. (See Architectural Responsibility Map — evaluators in domain tier, adapter in integration tier.)

## Architectural Responsibility Map
| Capability | Tier | Justification |
|---|---|---|
| Security gate evaluator (path-match changed files against secret globs) | **domain** | Pure logic, no I/O; path matching only — never reads secret contents, so no secret-leak surface. |
| Broken-windows evaluator (marker/skipped-test detection in changed file contents) | **domain** | Pure content-scan logic over already-fetched content. |
| TDD-audit evaluator (commit-subject ordering per `type: tdd` plan) | **domain** | Pure ordering check over already-fetched commit subjects. |
| Config gate flags read (`cfg.gates`, default all true) | **data** | Via `gsdState.readConfig(cwd)`; already a data-tier service (lib/state.js:337). |
| Git diff/log fetch (merge-base, changed files, commit subjects) | **integration** | Host git via `execFileSync`, mirroring ship.js:19-30; injectable adapter. |
| Gate Report formatting + ship blocking (`fail()`) | **presentation** | Ship output log + fail() per ship.js:52-53. |
| gsd_ship orchestration (run gates → report → block) | **presentation/integration** | The tool's execute body; wires evaluators + adapter + config + report. |

**Security-tier check (BLOCKER-sensitive):** the security gate's sensitive logic is pure path matching in the domain tier and touches git only through the integration adapter that returns paths — no secret content ever read or emitted. No security-sensitive capability is misplaced. (confidence: HIGH — design of this phase)

## Validation Architecture
Automated checks proving each behaviour (feed into the Nyquist/coverage gate). Run via `npm test` (`node --test test/*.test.mjs`, per MOUNT-06).
1. **Security gate unit tests** (`test/gates.test.mjs`): feed a changed-file list with `.env`, `id_rsa.pub`, `config/secrets/x` → `fail` naming the file+pattern; feed clean code paths → `pass`. Covers D-01 + the secret-glob→regex matcher.
2. **Broken-windows gate unit tests**: feed content with `TODO`, `FIXME`, `XXX`, `test.skip(`, `describe.skip(`, `xit(` → `fail` naming file+marker; feed clean content → `pass`. Covers D-02. Also a test that `.planning/**` prose is excluded (OQ-2).
3. **TDD-audit unit tests**: feed commit subjects `[test(08-01): a, feat(08-01): b]` → `pass`; `[feat(08-01): b]` (no `test:`) → `fail`; non-`tdd` plans skipped. Covers D-03/D-09.
4. **Config-default tests**: `cfg.gates` absent → all three enabled; `gates: { security: false }` → security `skipped`, others run. Covers D-06/D-08.
5. **Tool-level gsd_ship gate enforcement tests** (`test/tools.test.mjs` or `test/service-tools.test.mjs`): with a PASSED VERIFICATION + seeded fake changed-file/commit data (injectable adapter or fake git), assert (a) all gates report in the Gate Report section, (b) a failing required gate throws `gsd_ship preflight failed:` naming the gate+file+reason and **does not push** (no push/PR log lines), (c) a skipped gate does not block and reports `skipped`. Covers CAP-01/CAP-02/D-05/D-07.
6. **Schema test**: `gsd_ship` registers with a valid schema including `skip_gates`; unknown skip names rejected (OQ-4). Covers MOUNT-04-style smoke.

## Project Constraints
(from PROJECT.md / conventions read this session)
- Tools register via `defineTool` with a `parameters` schema and return a string (`output: { schema: { type: "string" } }`). `[VERIFIED: lib/ship.js:35-44]`
- git/gh run through `node:child_process` `execFileSync` (bundle executes in the host Node process). `[VERIFIED: lib/ship.js:1-11]`
- `.planning/` artefact writes go through the `gsdState` artefact model (`ctx.fs`), never raw `node:fs/promises` bypass (DUR-06 precedent). Gate report is in-memory (ship log), so no artefact write needed unless a report artefact is desired. `[VERIFIED: CONTEXT DUR-06; lib/state.js:450-456]`
- Config lives in `.planning/config.json` with a `workflow` block; a new top-level `gates` block is the natural home (D-08). Existing config must keep working without it (defaults true). `[VERIFIED: .planning/config.json:1-17; lib/state.js:337-341]`
- Tests are `node --test test/*.test.mjs` on a clean checkout; pure helpers go in `_shared.test.mjs`-style files; tool-level tests use the FakeFs harness in `test/helpers/`. `[VERIFIED: test/_shared.test.mjs:1-27; test/helpers/fake-fs.mjs:1-11]`
- This repo has `tdd_mode: false` but ships `type: tdd` plans → the TDD-audit gate enforces on `type: tdd` plans regardless of the global flag (D-09). `[VERIFIED: .planning/config.json:7]`

---

**Key research takeaways for the planner:**
- Slot the capability gates between ship.js step 5 (gh-auth) and step 6 (push).
- Implement gates as **pure evaluators** (domain tier) + an **injectable git adapter** (integration tier) so they're unit-testable without a real git (no fake-git harness exists today).
- Reuse ship.js's existing `run()/git()` execFileSync helpers and the existing `fail()` helper for blocking.
- Read the `gates` block via `s.readConfig(cwd)` with all-true defaults; add a validated `skip_gates` tool parameter for the D-06 CLI-flag path.
- Use `git merge-base HEAD <base>` + `git diff --name-only --diff-filter=ACM` for changed files, and `git log --format=%s <range>` for TDD-audit commit subjects.
- No new npm dependencies required.
All evidence is gathered. Here is the complete RESEARCH.md:

---

# Phase 59 Research: review-fix-companion (GSD-59)

**Phase goal:** Fix the gsd_code_review --fix companion so applying REVIEW.md findings works in live sessions and lands per-fix atomic commits into REVIEW-FIX.md. **Requirement:** CLH-09 (`.planning/REQUIREMENTS.md:130`, read this session: *"Review-fix companion: the gsd_code_review fix flag applies REVIEW.md findings as per-fix atomic commits into REVIEW-FIX.md and works in live sessions."*) [VERIFIED: .planning/REQUIREMENTS.md:130]

**Locked decisions:** D-01…D-13 in `.planning/phases/GSD-59-review-fix-companion/GSD-59-review-fix-companion-CONTEXT.md` (committed `7a52e4d`, file read on disk this session) [VERIFIED: git show 7a52e4d + .planning/phases/GSD-59-review-fix-companion/GSD-59-review-fix-companion-CONTEXT.md]. Research below implements them, not re-litigates them. Current branch is already `phase-59` (branch acquired at discuss) [VERIFIED: `git branch --show-current` → `phase-59`].

---

## 1. Domain analysis

### 1.1 Current implementation map — the exact rework surface

All line numbers read this session. `lib/code-review.js` is 622 lines.

**Tool + wiring (unchanged by this phase):**
- Tool `gsd_code_review`, params `{ phase, fix, all, auto, depth, files }` — lib/code-review.js:292-303 [VERIFIED]
- `inject = ["fs", "gsdState", "tools", "subagents"]` — lib/code-review.js:43 [VERIFIED] (D-10: unchanged)
- Reviewer spawn closure `spawnReviewer()` — lib/code-review.js:383-395; findings validation `resolveFindings` — lib/code-review.js:80-88 [VERIFIED]
- Pure helpers already exported for unit tests: `resolveFixFlags` (:104-106), `filterBySeverity` (:110-114), `hasBlockingFindings` (:118-120), `severityCounts` (:91-100), `validateFiles` (:144-157), `filterSourcePaths` (:163-179), `computeScope` (:184-195) [VERIFIED]

**The fix loop as it exists today (the broken part):**
- `runFixLoop(currentFindings, includeInfo, appliedAccum, skippedAccum)` — lib/code-review.js:442-494 [VERIFIED]. Per finding:
  - Reads current file content via `ctx.fs.resolve` + `ctx.fs.readText`, wrapped in try/catch (lines 458-462, comment: "file may not exist yet — empty content is fine") [VERIFIED]
  - Builds fixer prompt: `CODE_FIXER_PROMPT` + `<finding>` block + `<current_file_content>` embed (lines 464-471) [VERIFIED]
  - Spawns `gsd-code-fixer` with `outputSchema: CODE_FIXER_SCHEMA` (line 474), then reads **only `fr.structured`** (line 475) — `stopReason` and `diagnostic` are discarded today [VERIFIED]
  - Write path: `fixResult.status === "fixed" && fixResult.content != null` → writes the **full file content** via `ctx.fs.writeText` (line 478) → `commitSourceFiles(cwd, [commitFile], scopedMessage, gitFn)` (line 480) [VERIFIED]
  - Fixer self-skip: records `skip_reason` (lines 482-483) [VERIFIED]
  - Anything else: generic reason `"fixer returned malformed output"` (line 485) [VERIFIED]
  - Any throw: sets `fixUnavailable = true` for the WHOLE run, records that one finding as `"unavailable"` (lines 487-491) [VERIFIED]
- Scoped per-fix commit message (line 456): `` `phase ${args.phase} review-fix ${zeroPad(args.phase)}-F${zeroPad(fixIdx, 2)} ${finding.severity} ${finding.file}` `` [VERIFIED]
- `writeReviewFixMd(appliedFixes, skippedFixes, fixUnavailable, fixErrorCause)` — lib/code-review.js:497-527. Status logic (line 498): `fixStatus = fixUnavailable ? "unavailable" : "applied"` — **never emits `'skipped'`** [VERIFIED]. Frontmatter (lines 499-505): `phase, fixed (nowIso), fixes_applied, fixes_skipped, status` — **no `commits` field, no hashes** [VERIFIED]. Overwrite via `s.writeArtifact(cwd, args.phase, "REVIEW-FIX", fixFull)` (line 526) [VERIFIED]
- Guarded gitFn fallback (the D-09 template) — lib/code-review.js:448-449, verbatim:
  ```js
  let gitFn = defaultGitFn;
  try { gitFn = ctx.gitFn || defaultGitFn; } catch { /* not injected — use default */ }
  ```
  [VERIFIED]
- `--fix` fail-fast on UNAVAILABLE review — lib/code-review.js:548-552, verbatim throw message: `gsd_code_review: --fix requires a valid REVIEW.md with findings — the review was UNAVAILABLE. Re-run gsd_code_review (without --fix) first to produce a valid review.` [VERIFIED] (D-08: stays)
- Clean-review soft-skip (no REVIEW-FIX.md) — lib/code-review.js:556-559 [VERIFIED] (D-08: stays)
- `--auto` loop: `MAX_ITERATIONS = 3` (line 435), re-review between rounds (lines 569-598), `writeReviewMd` overwrite per re-review (line 576), early convergence on `!hasBlockingFindings` (lines 582-585) [VERIFIED] (D-05: unchanged)

**The two subagent contracts:**
- `CODE_FIXER_SCHEMA` — lib/code-review.js:125-136: `{ id, status: enum[fixed|skipped], file, content, skip_reason? }`, required `["id","status","file"]` [VERIFIED]. The `content` field is the full-file-echo failure mode.
- `CODE_FIXER_PROMPT` — lib/_agents.js:436-453, verbatim key demands: *"return the FULL fixed file content"*, schema example `{ "id": ..., "status": "fixed"|"skipped", "file": ..., "content": "<full fixed file content>", "skip_reason": ... }`, plus "Rules: … Do NOT commit. Do NOT manage worktrees. Do NOT run git." [VERIFIED]
- Reference schema convention (restricted object-rooted subset: `type/properties/required/items/enum`, `additionalProperties: false`, no pattern/format/numeric bounds): `CODE_REVIEWER_SCHEMA` lib/code-review.js:49-72 and `SPEC_SCORER_SCHEMA` lib/spec.js:56-76 [VERIFIED]

**Seams this phase reuses (all read this session):**
- `spawnSubagent(ctx, exec, { label, promptText, outputSchema })` — lib/_runner.js:8-32 — returns `{ output, stopReason, diagnostic, structured }` [VERIFIED]. Its two infrastructure throws, verbatim [VERIFIED: lib/_runner.js:10,12]:
  - line 10: `gsd: the \`subagents\` service is unavailable — the bundle needs the host spawn provider (@deepseek-ai/dsh-subagent + dsh-subagent-spawn-in-process)`
  - line 12: `gsd: the \`spawn\` subagent provider is not registered — install/enable @deepseek-ai/dsh-subagent-spawn-in-process`
- `commitSourceFiles(cwd, files, message, gitFn = defaultGitFn)` — lib/_git-artifacts.js:211-236 — argument-array git (`add` → `diff --cached --name-only` → `commit -m`), **never throws**, returns `{ committed, staged, message, warning? }` with warnings on `git add failed: …` / `nothing staged` / `git commit failed: …` [VERIFIED]
- `defaultGitFn(cwd, args)` — lib/_git-artifacts.js:28-30 — promisified `execFile("git", args, { cwd, encoding: "utf8" })`, stdout trimmed [VERIFIED]
- `rev-parse` precedent: `ensurePhaseBranch` already calls `gitFn(cwd, ["rev-parse", "--abbrev-ref", "HEAD"])` — lib/_git-artifacts.js:72 [VERIFIED]. A full-hash capture is `["rev-parse", "HEAD"]` — **no `rev-parse HEAD` exists anywhere in lib/ today** (grep census), so D-12's hash capture is genuinely new code on an established seam [VERIFIED: grep of lib/]
- `s.writeArtifact` — lib/state.js:727-732 — plain `_write(file, content)` overwrite, no backup ⇒ D-11's overwrite semantics already supported [VERIFIED]
- `stringifyFrontmatter` renders arrays inline `commits: [abc123, def456]` — lib/_shared.js:156-157; `parseFrontmatter` round-trips flow arrays (`v.startsWith("[")` → `coerceFlowArray`) — lib/_shared.js:130-131 ⇒ frontmatter `commits` list round-trips for tests [VERIFIED]
- `zeroPad(n, width = 2)` — lib/_shared.js:14; `nowIso` :18; `today` :22 [VERIFIED]
- Injectable-execFile precedent for the parse gate: `runPreflightVerify(tempDir, execFileFn = promisify(execFile))` — lib/preflight-verify.js:22-35, with `mkdtemp, cp, rm` from `node:fs/promises` + `os` (lines 10-14) [VERIFIED]
- Diagnostic-excerpt precedent: local `excerpt(text, max = 400)` — lib/repair.js:74 (not exported) [VERIFIED]

### 1.2 The live failure, reconstructed

Evidence on disk:
- `.planning/phases/GSD-58-node-repair/GSD-58-node-repair-REVIEW-FIX.md:5` — frontmatter `mode: manual (gsd_code_review --fix unavailable; fixes applied by the orchestrator per the human's instruction)` [VERIFIED]
- Same file :44-46 — *"Follow-up: the `gsd_code_review` `fix:true` companion itself is currently broken in live sessions — tracked as the next phase"* [VERIFIED]
- Same file :12-33 — the manual report shape: a `| Finding | Sev | Status | Commit | What changed |` table with real short hashes (`ba8dc70`, `c397d46`, …) [VERIFIED] — D-11 says the automated report mirrors this shape [CITED: CONTEXT D-11]
- Root cause named in CONTEXT canonical_refs: *"lib/_agents.js:436-453 — CODE_FIXER_PROMPT … (currently demands full-file echo, the live failure mode)"* [CITED: CONTEXT.md canonical_refs]

Mechanism reconstruction [ASSUMED — the precise host fault class is not recoverable from artefacts]: asking the fixer to echo the entire fixed file as a JSON string field exceeds bounded structured output on large files → the fixer run faults (non-completed stopReason / rejected run / missing structured) → today that throw lands in the catch at lib/code-review.js:487-491 → `fixUnavailable = true` → REVIEW-FIX.md reports `unavailable`. The anchor-edit contract bounds the output (root-cause fix, D-01/D-02) and skip-and-continue bounds the blast radius (D-06). Both the throw-class and the malformed-class faults must be handled; today they take two different, both-wrong paths (whole-run unavailable / generic reason).

### 1.3 The locked anchor-edit contract — implementation shape

From D-01/D-02/D-03 [CITED: CONTEXT.md], with the tool-side pipeline the planner should encode:

Per finding, in order:
1. **Structural validation** — fixer structured output must be an object; `status: "fixed"` ⇒ non-empty `edits` array (JSON Schema subset cannot express conditional required — tool-side check, see OQ-6); `id` should match `finding.id` (see OQ-7). `status: "skipped"` ⇒ record with `skip_reason`.
2. **Path validation** — the fix target is `finding.file` (see OQ-8 for why the fixer's own `file` echo must not redirect it). Route through the existing `validateFiles` traversal guard (lib/code-review.js:144-157) — a reviewer finding with an absolute/`..`/metachar path is recorded skipped, never read/written.
3. **Read current content** via `ctx.fs.resolve(`${cwd}/${finding.file}`)` + `ctx.fs.readText` (existing lines 458-462 shape).
4. **Anchor validation + in-memory application** — new pure helper, the signature CONTEXT's code_context explicitly suggests: `applyAnchorEdits(content, edits) → { content, failed }` [CITED: CONTEXT code_context]. Semantics:
   - Edits apply **in order**; each edit's `find` must occur **EXACTLY ONCE** in the **evolving** in-memory content (edit N is validated against the result of edits 1..N-1 — this is the only coherent reading of D-02's "applied in order" + D-03's atomicity).
   - Occurrence counting: non-overlapping count (e.g. `content.split(find).length - 1` or first-index + second-index probe). An empty `find` is naturally rejected (count 0 or >1) — see OQ-9.
   - Any failed edit ⇒ `{ failed: <cause> }`, **no write at all** — the file stays byte-identical and the finding is skipped with the cause (D-03: abort BEFORE any write).
5. **Parse gate** (.js/.mjs targets only; non-JS targets get anchor validation only — D-03): write the post-edit content to a temporary `.mjs` copy, run `node --check <tmp>` via the already-promisified `execFile` with an explicit argument array — **never shell interpolation** (D-03; same discipline as lib/_git-artifacts.js:14-16), remove the temp file afterwards. Temp location + injectability: see OQ-10.
6. **Write once** via `ctx.fs.writeText(fileTarget, newContent)` — one call per finding (D-03 atomicity).
7. **Commit** via `commitSourceFiles(cwd, [finding.file], scopedMessage, gitFn)`; on success capture the hash via the same `gitFn(cwd, ["rev-parse", "HEAD"])` (D-12). `commitSourceFiles` warnings (`git add failed: …` / `nothing staged` / `git commit failed: …`, verbatim return contract at lib/_git-artifacts.js:215,226,232) become the fix's outcome cause **instead of a hash** (D-12).
8. **Record the outcome** into the accumulators the report writer consumes: `{ id, severity, file, status: "fixed"|"skipped"|"unavailable", commit?, cause? }`.

Prompt rewrite (D-02) requirements:
- Keep the tool-boundary rules — the existing test asserts them: `assert.match(CODE_FIXER_PROMPT, /Do NOT commit/i)` and `/Do NOT.*worktree|Do NOT manage worktree/i` (test/code-review.test.mjs:619-624) [VERIFIED]. Either keep the phrasing or update the test in the same task.
- Keep the `<current_file_content>` embed from the tool (lib/code-review.js:470) — the fixer needs the real text to produce verbatim anchors [VERIFIED embed exists].
- New JSON example shape: `{ "id": "…", "status": "fixed", "file": "…", "edits": [ { "find": "<verbatim unique anchor>", "replace": "<full replacement text>" } ], "skip_reason": "<only when skipped>" }`.
- Anchor rules to state in the prompt: each `find` MUST be copied verbatim from `<current_file_content>`; MUST appear exactly once in that content; multiple edits are applied in order, each against the result of the previous; a `find` that matches zero or multiple times makes the whole finding fail validation.
- D-12 principle restated in the prompt (unchanged): the fixer never writes files, never runs git [CITED: CONTEXT D-01/D-12].

### 1.4 Status semantics — the D-06 decision table

| Situation | Per-finding row status | Overall REVIEW-FIX.md status |
|---|---|---|
| Fix applied, commit landed | `fixed` + commit hash | `applied` (≥1 fix committed) |
| Fixer self-skip (`skip_reason`) | `skipped` + reason | `skipped` if nothing landed |
| Spawn/start error, non-completed stopReason, missing/invalid structured output | `skipped` + **real cause** (stopReason + diagnostic excerpt) | `skipped` if nothing landed |
| Anchor/parse validation failure | `skipped` + validation cause | `skipped` if nothing landed |
| `commitSourceFiles` warning | `skipped` + warning as cause (no hash) | `skipped` if nothing landed |
| Fixer-infrastructure fault (subagents service / spawn provider missing) | `unavailable` rows with the infra cause | `unavailable` |

[CITED: CONTEXT D-06, D-11, D-12 — the current code implements only the first and last rows and never emits `'skipped'` overall (lib/code-review.js:498) — VERIFIED]

"Real cause" contract: surface `fr.stopReason` and an excerpt of `fr.diagnostic` from the `spawnSubagent` result (lib/_runner.js:25-27) — both are discarded today [VERIFIED]. Non-completed detection convention: `stopReason !== "completed"` — the repo already branches on the literal `"completed"` at lib/jobs.js:174 (`const completed = result.stopReason === "completed";`) and synthesizes `"error"` locally at lib/jobs.js:205 [VERIFIED]. Do **not** enumerate host stopReason values (see OQ-1).

### 1.5 The `node --check` parse gate — empirically verified this session

Run against node v24.15.0 in this sandbox [VERIFIED by running]:

| Content in a temp `.mjs` | `node --check` result |
|---|---|
| valid ESM (`export const x = 1; import …`) | exit 0 |
| syntax error (`const x = {;`) | exit 1, `SyntaxError` + source line on stderr |
| CJS-lookalike (`require("fs")`, `module.exports = …`) | exit 0 — syntax-only check, identifiers are legal ESM syntax |
| top-level await | exit 0 |
| `with (o) { … }` | exit 1 — "Strict mode code may not include a with statement" |

Implications: the D-03 ".mjs copy" decision is safe for this repo's ESM sources and for CJS-lookalike code; the only realistic false-positive class is legacy `with` statements (accepted limitation, D-03 locked). Exit code 1 + stderr text is the failure signal the tool records as the skip cause. Temp-file lifecycle: mirror `lib/preflight-verify.js` (`mkdtemp` under `os.tmpdir()`, `rm` in a `finally`) [VERIFIED: lib/preflight-verify.js:12-14,22-35]; tests can exercise real `node --check` offline (fast, ~tens of ms) and/or inject a fake `execFileFn` for fault simulation (OQ-10).

### 1.6 Sibling guards (D-09) — exact sites and census

The three locked in-scope sites, verbatim [VERIFIED this session]:
- lib/add-tests.js:336 — `const gitFn = ctx.gitFn || defaultGitFn;` (imports `defaultGitFn` at lib/add-tests.js:35) — feeds `commitSourceFiles` at :337
- lib/core-tools.js:465 — `const gitFn = ctx.gitFn || defaultGitFn;` (imports at lib/core-tools.js:13) — feeds the porcelain `git status` call at :468 and `commitArtifacts` at :495
- lib/core-tools.js:657 — `await commitArtifacts(cwd, phaseNum, { scope: "next", phaseName: String(phaseNum) }, ctx.gitFn || defaultGitFn);` — inline access; needs a guarded local before the call

Replacement shape = the lib/code-review.js:448-449 template (`let gitFn = defaultGitFn; try { gitFn = ctx.gitFn || defaultGitFn; } catch { … }`). No inject-array changes — `gitFn` is not a host service (D-09) [CITED: CONTEXT D-09; consistent with lib/code-review.js:40-43 comment].

**Census of OTHER unguarded `ctx.gitFn` accesses in lib/ — same crash class, OUT of the locked scope** (grep this session):
| Site | Code | Status |
|---|---|---|
| lib/repair.js:441 | `gitFn: ctx.gitFn,` (into `runRepairRounds`) | out of scope — follow-up candidate |
| lib/undo.js:227 | `const gitFn = ctx.gitFn || defaultGitFn;` | out of scope — follow-up candidate |
| lib/validate-phase.js:557 | `const gitFn = ctx.gitFn || defaultGitFn;` | out of scope — follow-up candidate |
| lib/phase-management-plugin.js:110 | `const gitFn = ctx.gitFn || defaultGitFn;` | out of scope — follow-up candidate |
| lib/autonomous.js:291 | `gitFn: ctx.gitFn` | explicitly deferred in CONTEXT deferred list |

D-09 enumerates exactly add-tests.js:336 + core-tools.js:465,657; D-10 forbids scope creep. The four unlisted sites should be recorded in the plan's deferred/follow-up note (one quick task, like the autonomous.js deferral) — NOT fixed in this phase. See OQ-2.

### 1.7 Test-harness impact inventory (existing tests that must change)

All in test/code-review.test.mjs (867 lines, read this session) [VERIFIED]:
- `makeReviewFixSubagents(reviewerCtrl, fixerCtrl)` (:522-541) — routes by label `gsd-code-reviewer`/`gsd-code-fixer`, supports `capture`/`fail`/`structured` (value or `fn(req)`); results carry `stopReason: "completed"`. Needs: non-completed `stopReason` + `diagnostic` simulation for D-06 tests.
- `makeFakeGit()` (:544-558) — handles `add` / `diff --cached --name-only` / `commit`; **no `rev-parse` branch** — must be extended for the D-12 hash capture (and ideally to allow scripting a rev-parse failure).
- `--fix: per-fix atomic commits` (:626-670) — fixer returns full-content objects; rewrite to anchor-edits; asserts commit messages `/phase 1 review-fix.*F01.*BLOCKER/i` (keep the message format or update the test).
- `--fix fail-fast: review UNAVAILABLE → throws` (:672-687) — stays (D-08).
- `--all` (:689-717) and `--fix without --all` (:719-746) — fixer fixtures need anchor-edit shape.
- `degrade-on-fixer-fault: REVIEW-FIX.md UNAVAILABLE` (:748-766) — **assertion flips**: a plain fixer fault is now a per-finding skip (status `'skipped'`), not `'unavailable'`; only an infra fault (missing service/provider) yields `'unavailable'`. Rewrite.
- `--auto` suite (:771-867) — fixer fixtures need anchor-edit shape; call-count semantics unchanged (D-05).
- `CODE_FIXER_PROMPT is exported and self-contained` (:619-624) — keep or update the asserted phrases.
- Fake-ctx note: `makeMountCtx` (test/helpers/mount-harness.mjs:84-169) builds a plain object ctx — tests inject `ctx.gitFn = fakeGit` by assignment (works; used across ~10 suites). The live-host throw must be simulated with a throwing getter (`Object.defineProperty(ctx, "gitFn", { get() { throw … } })`) for the new guard tests — no such helper exists yet [VERIFIED: mount-harness has no gitFn property or getter simulation].
- `FakeFs` (test/helpers/fake-fs.mjs:9-66): in-memory; `readText` returns `undefined` for missing files; `writeText` auto-creates parents; has `unlink` [VERIFIED].

### 1.8 Confidence summary

| Area | Confidence |
|---|---|
| Current fix-loop behaviour, line-precise | High — [VERIFIED] full read of lib/code-review.js, lib/_agents.js, lib/_git-artifacts.js, lib/_runner.js, tests |
| Anchor-edit contract design | High — [CITED] locked D-01/D-02/D-03 + suggested helper signature in code_context |
| `node --check` gate behaviour | High — [VERIFIED] empirical run this session |
| Sibling guard sites + census | High — [VERIFIED] grep + reads |
| Host `stopReason` enum / structured-failure shape | Low — [ASSUMED]; mitigated by `!== "completed"` convention and shape-agnostic skip path |
| Live-fault class in phase 58 | Low — [ASSUMED] reconstruction; root cause (full-file echo) is [CITED] from CONTEXT canonical_refs |

---

## 2. Package legitimacy

**No new dependencies — locked by D-13** [CITED: CONTEXT D-13]. Nothing to verify on any registry.

- package.json `dependencies: {}` — no runtime deps at all; `peerDependencies` = `@deepseek-ai/dsh-tools ^0.1.1-rc.2`, `@deepseek-ai/schemastery >=3.18.1`, `@deepseek-ai/cordis >=4.0.1`, `@deepseek-ai/dsh-llm ^0.1.1-rc.2` — host-contract peers, **never imported** (confirmed by phase-58 CR-10 fix note in GSD-58 REVIEW-FIX.md:31 and by grep: no `import from "@deepseek-ai/…"` except `defineTool` from `@deepseek-ai/dsh-tools` in lib/code-review.js:20) [VERIFIED: package.json read this session + lib/code-review.js:20]
- Everything this phase needs is node builtins, already imported in-repo for the exact same purposes [VERIFIED: imports read this session]:
  - `node:child_process` + `node:util` `promisify` — lib/code-review.js:26-29 (`execFileP` already exists in this file; the parse gate reuses it)
  - `node:fs/promises` (`mkdtemp`, `rm`) + `node:os` — lib/preflight-verify.js:12-13 (temp-dir precedent)
  - argument-array child-process discipline — lib/_git-artifacts.js:14-16 header comment [VERIFIED]
- The host `subagents` service is provided by host-plane packages (`@deepseek-ai/dsh-subagent` + `dsh-subagent-spawn-in-process`) named verbatim in the spawnSubagent error strings (lib/_runner.js:10,12) — not repo dependencies; not reachable from this sandbox for registry verification, and none are being added [VERIFIED for the strings; the packages themselves are host-plane, out of bundle scope]

Every package claim above is tagged to its in-repo source. No package name in this research originates from a non-authoritative source.

---

## 3. Risks and Open Questions

### Risks

1. **Host-plane behaviour opacity** — the exact set of `stopReason` values and the shape of a schema-validation failure (`structured` undefined vs `start()` rejection) live in the host `subagents` service, not this repo; the host packages are not reachable from this sandbox. Mitigation: treat `stopReason !== "completed"` as the fault signal (repo precedent, lib/jobs.js:174) and handle both missing-structured and thrown-start shapes in tests. Severity: low. [VERIFIED for the convention; ASSUMED for the host enum]
2. **Commit failure after a successful write** — the file is modified on disk but nothing landed in git; a naive implementation reports `skipped` while leaving the fix on disk (report/disk divergence). Mitigation recommended in OQ-5. Severity: medium if unhandled.
3. **Scope creep on the guard census** — four more unguarded `ctx.gitFn` sites exist beyond the three locked ones (§1.6); an eager executor fixing them violates D-10. Mitigation: plan must name the three sites explicitly and carry the census as deferred. Severity: medium (process).
4. **Existing-test churn** — five `--fix` tests plus the fixer fixtures must be rewritten; a half-migrated suite will fail the 1073-test baseline. Mitigation: test tasks listed in §5. Severity: low.
5. **Large-file input embedding** — `<current_file_content>` is embedded whole in the fixer prompt (unchanged); a huge file still costs input tokens, and if a host-side input limit truncated it, fixer anchors would mismatch → validation catches → finding skipped with cause. Self-limiting, no action. Severity: low. [VERIFIED embed at lib/code-review.js:470; ASSUMED on host input limits]
6. **`with`-statement false positive in the parse gate** — verified empirically (§1.5); accepted limitation of the locked `.mjs`-copy decision; record skipped with the node stderr as cause rather than special-casing. Severity: low. [VERIFIED by running]

### Open Questions

- **OQ-1 — How should non-completed fixer runs be detected without knowing the host stopReason enum?** (RESOLVED) Use `result.stopReason !== "completed"` — the repo's own runtime already treats `"completed"` as the only success value (lib/jobs.js:174, verbatim `const completed = result.stopReason === "completed";`) and passes the raw value through everywhere else (lib/execute.js:174-185, lib/ui.js:63). Never enumerate host values; surface the raw string + diagnostic excerpt. CONTEXT D-06's "(e.g. max-tokens)" is illustrative only [CITED: CONTEXT D-06].

- **OQ-2 — Are the four additional unguarded `ctx.gitFn` sites (lib/repair.js:441, lib/undo.js:227, lib/validate-phase.js:557, lib/phase-management-plugin.js:110) in scope?** (RESOLVED) No. D-09 enumerates exactly lib/add-tests.js:336 and lib/core-tools.js:465,657; D-10 fixes the surface. Carry the census (§1.6) into the plan as a documented follow-up quick task, mirroring how lib/autonomous.js:291 was deferred in the CONTEXT. Executors must not touch them [CITED: CONTEXT D-09/D-10, out-of-scope note].

- **OQ-3 — What happens when the fixer infrastructure itself is missing (subagents service absent / spawn provider unregistered) — throw, or degrade?** (RESOLVED) Degrade: record findings as `unavailable` rows carrying the infra cause and write REVIEW-FIX.md with overall status `unavailable` — D-06 explicitly reserves `'unavailable'` for exactly this fault class, and D-11's row statuses include `unavailable`, implying rows exist for it. The two infra conditions are detectable verbatim from lib/_runner.js:10,12 (service `undefined` from `ctx.get("subagents")`, or `getProvider("spawn")` returning undefined). Cleanest implementation: one upfront infrastructure probe before the loop (same two checks spawnSubagent makes); if absent, record every fixable finding `unavailable` with the cause and skip spawning entirely [CITED: CONTEXT D-06, D-11 + VERIFIED lib/_runner.js:8-13].

- **OQ-4 — Under `--auto`, a re-review comes back UNAVAILABLE mid-loop (lib/code-review.js:577-581 sets `fixUnavailable` today). What is the correct new behaviour?** (RESOLVED by decision reading) D-05 locks the auto loop's iteration mechanics; D-06 reserves `'unavailable'` for *fixer-infrastructure* faults, and a reviewer fault is not a fixer fault. Therefore: a faulted re-review **stops the auto iteration loop**, the already-accumulated fix results stand, overall status follows the normal fix-outcome semantics (`applied`/`skipped`), the overwritten REVIEW.md already carries the UNAVAILABLE status (writeReviewMd, lib/code-review.js:576), and the summary note records that the auto loop stopped on a re-review fault. Requires a dedicated test [CITED: CONTEXT D-05/D-06 + VERIFIED current code].

- **OQ-5 — When `ctx.fs.writeText` succeeded but `commitSourceFiles` returned a warning (nothing staged / add / commit failure), what lands in the report — and what happens to the modified file?** (RESOLVED with recommendation) D-12 mandates the warning be recorded as the fix's outcome cause instead of a hash, so the row is `skipped` with that cause. Recommendation (adopt in plan): best-effort **restore the original content** (re-write the pre-edit content captured in step 3) so disk state matches the report — a "fixed" row then always implies a landed commit + hash. If implementers prefer literal-minimal compliance (leave the write, record skipped-with-cause), that also satisfies D-12; the plan should pick one and test it [CITED: CONTEXT D-12; VERIFIED commitSourceFiles warning contract].

- **OQ-6 — `edits` can't be conditionally required in the restricted schema subset (no `if/then`). How is "fixed without edits" handled?** (RESOLVED) Tool-side structural validation: `status: "fixed"` with a missing/empty/non-array `edits` is a fault → skipped with cause ("fixer returned no edits"); the schema keeps `required: ["id", "status", "file"]` exactly as today's does [CITED: CONTEXT D-02 restricted subset; VERIFIED current schema lib/code-review.js:125-136].

- **OQ-7 — Should the tool verify the fixer's echoed `id` against `finding.id`?** (RESOLVED — recommendation) Yes: treat a present-but-mismatched `id` as a fault (skipped with cause "fixer returned output for finding X"). Cheap integrity check; prevents a mislabeled structured output from being attributed to the wrong finding. Absent `id` fails schema validation at the host or the tool's structural check [VERIFIED schema requires `id`].

- **OQ-8 — Which file do the edits apply to: `finding.file` or the fixer's echoed `file`?** (RESOLVED with recommendation) `finding.file` only. Today the tool honours `fixResult.file || finding.file` (lib/code-review.js:477,479) — a fixer-supplied path is unvalidated and could redirect writes (traversal). Under the anchor contract the fixer only ever echoes; if its `file` differs from `finding.file`, that's a fault → skip with cause. Additionally route `finding.file` itself through the existing `validateFiles` guard before any read/write (defense-in-depth; reviewer-sourced path). No new surface — `validateFiles` is already exported [VERIFIED current override behaviour at :477-479; CITED CONTEXT D-01/D-03 tool-side validation].

- **OQ-9 — Anchor matching semantics: what counts as "EXACTLY ONCE", and how are edits sequenced?** (RESOLVED) Non-overlapping occurrence count of the verbatim `find` string (split-count or first/second-index probe); each edit validated and applied against the **evolving** in-memory content (edit N sees edits 1..N-1 applied), consistent with D-02 "applied in order" and D-03's write-once atomicity. Empty `find` is rejected by the same count check (0 or >1 occurrences). Replacement text may itself contain the anchor — irrelevant, since later edits are validated after earlier replaces [CITED: CONTEXT D-02/D-03].

- **OQ-10 — Where does the temp `.mjs` copy live, and how is the parse gate tested?** (RESOLVED) Write it via `node:fs/promises` under `os.tmpdir()` (e.g. `mkdtemp`) — NOT via `ctx.fs` (tests use in-memory FakeFs; `execFile` needs a real file) and NOT inside the workspace/`.planning/` (commitArtifacts stages `.planning` wholesale at lib/_git-artifacts.js:178). Remove it in a `finally` (`rm`), mirroring lib/preflight-verify.js:12-14. Make the execFile injectable exactly like `runPreflightVerify(tempDir, execFileFn = promisify(execFile))` (lib/preflight-verify.js:22) so tests can simulate node faults; other tests may run real `node --check` (offline, verified fast). Argument-array only, never shell interpolation (D-03) [VERIFIED pattern; CITED D-03].

- **OQ-11 — What does the hash-capture do when `git rev-parse HEAD` itself fails after a successful commit?** (RESOLVED with recommendation) The commit DID land — never downgrade to `skipped`. Record status `fixed` with the cause noted as an unresolved hash (e.g. `commit hash unresolved: <message>`), keeping `fixes_applied` truthful. This is the one case D-12's "warnings become the cause" rule must not be applied to retroactively, since the commit already exists [CITED: CONTEXT D-12 + VERIFIED rev-parse is a new call on the injectable gitFn seam].

- **OQ-12 — Diagnostic excerpt source and length?** (RESOLVED) Mirror lib/repair.js:74's local `excerpt(text, max = 400)` as a small local helper in code-review.js (repair's is not exported; a `_shared.js` export is an acceptable alternative but adds churn). Apply to `fr.diagnostic` and to `fr.output` when `diagnostic` is empty — jobs.js:176 precedent falls back through diagnostic → error string [VERIFIED both precedents].

No open question remains that blocks planning. OQ-5/OQ-8/OQ-11/OQ-12 carry recommendations rather than hard-locked text; they are within the decisions' stated intent and are flagged so the plan-checker can confirm they were made deliberately.

---

## 4. Architectural Responsibility Map

Tier model: **presentation** (artefact/report rendering, user-facing strings) / **domain** (pure, unit-testable logic) / **data** (fs + artefact persistence) / **integration** (subagents host service, git, child processes).

| Capability | Tier | Rationale / home |
|---|---|---|
| Fix-scope resolution (`resolveFixFlags`, `filterBySeverity`, `hasBlockingFindings`) | domain (existing pure helpers) | lib/code-review.js:104-120 — unchanged [VERIFIED] |
| **Anchor validation + in-memory edit application (`applyAnchorEdits(content, edits) → {content, failed}`)** | **domain — NEW pure helper, exported for unit tests** | CONTEXT code_context names it explicitly; must stay fs-free so the exactly-once/atomicity rules are directly unit-testable [CITED: CONTEXT code_context] |
| Fault classification (infrastructure fault vs per-finding fault) + status computation (`applied`/`skipped`/`unavailable`) | domain — NEW pure helper(s) | Keeps the D-06 decision table out of the execute closure and testable |
| Cause formatting (stopReason + diagnostic excerpt) | domain — NEW small excerpt helper | repair.js:74 precedent [VERIFIED] |
| Target-file read/write (`ctx.fs.resolve/readText/writeText`) | data | lib/code-review.js:458-462,478 shape [VERIFIED] |
| Parse gate — temp `.mjs` write + `node --check` + cleanup | data/integration boundary — exported async helper with injectable `execFileFn` (preflight-verify.js:22 pattern) | Real child process + real temp fs; injectable for fault tests [VERIFIED precedent] |
| REVIEW-FIX.md rendering (`writeReviewFixMd` rework: frontmatter + `commits` list + per-finding rows) | presentation | lib/code-review.js:497-527 rework surface; `stringifyFrontmatter` array support verified [VERIFIED] |
| Tool result message (`fixSummary`) | presentation | lib/code-review.js:602 [VERIFIED] |
| Per-finding fixer spawn (`spawnSubagent` + `CODE_FIXER_SCHEMA` + rewritten `CODE_FIXER_PROMPT`) | integration | lib/_runner.js:8-32; lib/_agents.js:436-453 [VERIFIED] |
| Per-fix atomic commits + hash capture (`commitSourceFiles`, `gitFn ["rev-parse","HEAD"]`) | integration | lib/_git-artifacts.js:211-236; rev-parse precedent :72 [VERIFIED] |
| Artefact persistence (`s.writeArtifact("REVIEW-FIX", …)` overwrite) + STATE decisions | data | lib/state.js:727-732 [VERIFIED] |
| Phase branch acquisition + artefact auto-commit (`ensurePhaseBranch`, `commitArtifacts`) | integration | unchanged, lib/code-review.js:324,609 [VERIFIED] |
| Sibling guards (add-tests.js:336, core-tools.js:465,657) | integration | same guarded-fallback shape at the existing access points [VERIFIED] |

**Security-sensitive placements (BLOCKER if wrong):** anchor/path validation must live in the **domain tier** as a pure, unit-tested helper — burying the traversal/uniqueness/parse validation inside the tool execute closure would leave the security-relevant checks untestable. Git and child-process calls stay argument-array-only in the **integration tier** (lib/_git-artifacts.js:14-16 discipline). No validation logic may move into the fixer subagent — the tool owns validation (D-01: "the TOOL … applies the edits … D-12 tool-driven principle unchanged") [CITED: CONTEXT D-01/D-12].

---

## 5. Validation Architecture

What automated checks prove each behaviour (the later Nyquist/coverage gate consumes this). All offline: FakeFs + fake-ctx + fake subagents + fake gitFn, per repo convention. Baseline: **1073 tests / 235 suites / 0 fail, ~3.6 s** — run this session [VERIFIED: npm test run].

**Unit (pure helpers — new):**
- `applyAnchorEdits`: unique-anchor happy path (content replaced exactly once); multi-edit sequential application (edit 2 sees edit 1's result); duplicate anchor → `failed` with cause; missing anchor → `failed`; empty `find` → `failed`; `replace` containing the anchor does not corrupt subsequent edits; any failed edit ⇒ whole result `failed`, original content returned untouched (atomicity).
- Status resolver: ≥1 applied → `applied`; zero applied with ≥1 skip (every skip carries a cause) → `skipped`; infra fault → `unavailable`.
- Excerpt helper: long diagnostics truncated with the max bound.

**Unit (parse gate):**
- Real `node --check` on valid ESM content → pass; on syntax-error content → failure with stderr cause; temp file removed afterwards (assert tmpdir cleaned).
- Injected failing `execFileFn` → parse-gate fault recorded as cause (fault simulation).
- Extension routing: `.js`/`.mjs` targets get the parse gate; `.md`/`.json`/other get anchor validation only (D-03).

**Integration (tool-level, FakeFs + fake subagents routed by label — extends test/code-review.test.mjs:517-640 harness):**
- `--fix` happy path, anchor contract: reviewer returns findings; fixer returns `{id, status:"fixed", file, edits:[{find,replace}]}`; assert file content updated exactly per edits; one `commitSourceFiles` per finding with the scoped message; `rev-parse HEAD` captured; REVIEW-FIX.md frontmatter has `commits: [<hash>…]`, `fixes_applied`, `fixes_skipped`, `status: "applied"`; body rows carry id/severity/file/status/hash.
- Skip-and-continue: finding 1 faults (fake `start()` throws), finding 2 fixes cleanly → run continues; finding 1 row `skipped` with the real cause; overall `applied`.
- Non-completed stopReason: fixer result `{stopReason: "<non-completed>", diagnostic: "…", structured: undefined}` → row skipped with stopReason + diagnostic excerpt **present in the cause** (asserts the real-cause contract, not the old generic string).
- Malformed structured output (`structured: {}` / null) → skipped with real cause.
- Validation-failure atomicity: duplicate anchor → no write (file byte-identical — assert content unchanged), row skipped with the anchor cause.
- Parse-failure atomicity: edits apply in memory, `node --check` fails → no write, row skipped.
- Fixer self-skip (`status:"skipped"`, `skip_reason`) → row skipped with that reason.
- `commitSourceFiles` warning (fake gitFn returns nothing staged) → row skipped, cause = the warning, **no hash**; (if OQ-5 restore adopted: file restored byte-identical).
- Rev-parse failure after commit → row `fixed`, cause notes unresolved hash (OQ-11).
- Infrastructure fault: `subagents: null` mount (provided store absent — mount-harness supports `subagents: null`, test/helpers/mount-harness.mjs:106-114) → REVIEW-FIX.md written with status `unavailable` and infra cause rows; never throws.
- Guarded gitFn: ctx whose `gitFn` getter throws (Object.defineProperty simulation of the live uninjected access — the makeMountCtx fake ctx never throws today, test/helpers/mount-harness.mjs:116-140) → loop still completes via `defaultGitFn` (commitSourceFiles warning path proves no crash).
- `--fix` fail-fast on UNAVAILABLE review still throws (existing test :672-687, keep).
- Clean review / empty scope soft-skip: no REVIEW-FIX.md (existing behaviour, keep — D-08).
- `--auto`: MAX_ITERATIONS=3 cap, early convergence, REVIEW.md overwritten per re-review (existing tests :771-867 rewritten to anchor fixtures); NEW: re-review UNAVAILABLE mid-auto stops the loop, accumulated results stand, overall status from fix outcomes (OQ-4).
- Prompt contract: rewritten CODE_FIXER_PROMPT names the anchor-edit schema, forbids commit/worktree/git (test :619-624 assertions kept or updated), and the tool's fixer prompt still embeds `<current_file_content>`.

**Sibling guards (D-09):**
- For each of lib/add-tests.js:336, lib/core-tools.js:465, lib/core-tools.js:657 — a test with a throwing-getter `ctx.gitFn` proving the tool completes and commits via `defaultGitFn` (for add-tests/core-tools the default gitFn against the fake cwd yields commitSourceFiles/commitArtifacts warnings, which never throw — assert completion + warning surfacing, no crash).
- Existing suites for those tools (test/add-tests.test.mjs, pause-resume/next-integration suites) keep passing with `ctx.gitFn = fakeGit` assignment.

**Invariants regression:**
- Mount/removal counts unchanged: 37 tools / 34 commands / 28 capability keys / 27 patch rows (test/mount.test.mjs:149-161 assertions) [VERIFIED]. No new tool/command/capability/config key exists in this phase (D-10).
- Full `npm test` green (≥1073 + new tests) before SUMMARY.

---

## 6. Project Constraints (from project conventions, read this session)

- **Offline tests only** — FakeFs + fake-ctx + fake gitFn + fake subagents; no live DSH boot, no LLM, no real git in unit suites (stated in every test-file header, e.g. test/code-review.test.mjs:1-6) [VERIFIED]
- **Pure helpers exported for direct unit testing** — explicit convention in the file under rework (lib/code-review.js:17-18, D-14 note) [VERIFIED]
- **Restricted object-rooted JSON Schema subset** for subagent output schemas — `type/properties/required/items/enum`, `additionalProperties: false`, no pattern/format/numeric bounds (CODE_REVIEWER_SCHEMA lib/code-review.js:49-72; SPEC_SCORER_SCHEMA lib/spec.js:53-76; D-02 restates it) [VERIFIED + CITED]
- **Argument-array child-process discipline** — "every git call here uses a FIXED argument array with `-C cwd` (never a shell string)" lib/_git-artifacts.js:14-16; D-03 extends it to `node --check` [VERIFIED + CITED]
- **No new dependencies; node builtins only** (D-13) [CITED]
- **No new surface; counts stay 37/34/28/27; inject array `["fs","gsdState","tools","subagents"]` unchanged** (D-10) [CITED + VERIFIED]
- **Commit style** — atomic one-commit-per-task; conventional prefixes `feat(59-NN)/test(59-NN)/docs(planning): …` per git history (e.g. `b628e51 feat(57-01): …`) [VERIFIED: git log]; per-fix commit message format currently asserted in tests is the scoped `phase <N> review-fix <NN>-F<NN> <SEVERITY> <file>` (lib/code-review.js:456) — keep unless the plan consciously changes both code and test [VERIFIED]
- **ESM, `"type": "module"`, engines node >=20; test script `node --test test/*.test.mjs`** [VERIFIED: package.json]
- **Artefact writes always through `ctx.fs` / `s.writeArtifact`** (CQ-01/DUR-05 lineage; never raw node:fs for artefacts) — note the parse gate's temp file is the sanctioned exception because a real child process needs a real file (preflight-verify precedent) [VERIFIED]
- **Phase runs on branch `phase-59`** (already current); artefacts under `.planning/phases/GSD-59-review-fix-companion/` [VERIFIED: git branch + ls]
- **`npm test` must be green before SUMMARY** — baseline 1073 pass this session [VERIFIED: run]

---

*Research complete. All 12 Open Questions are RESOLVED (three carry recorded recommendations: OQ-5 restore-on-commit-failure, OQ-8 strict `finding.file` targeting, OQ-11 unresolved-hash handling) — planning can proceed.*
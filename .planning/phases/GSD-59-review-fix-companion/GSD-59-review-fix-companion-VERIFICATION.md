---
phase: 59-review-fix-companion
verified: 2026-09-08T06:30:46Z
status: passed
score: 31/31 must-haves verified
behavior_unverified: 0
overrides_applied: 0
---

# Phase 59: review-fix-companion Verification Report

**Verified:** 2026-09-08T06:30:46Z (first run — no prior VERIFICATION.md existed, so this is full-scope verification, not re-verification)
**Branch:** `phase-59` | **Plans verified:** 01 (anchor-edit contract), 02 (fault isolation + parse gate), 03 (sibling gitFn guards)
**Method:** every truth traced to source in `lib/code-review.js` / `lib/_agents.js` / sibling guards with line evidence, every artifact measured on disk, every key link confirmed wired, and 34 targeted named behavioral tests executed this session (never the full suite) — SUMMARY claims were treated as claims only.

## Goal Achievement

Phase goal: *"Fix the gsd_code_review --fix companion so applying REVIEW.md findings works in live sessions and lands per-fix atomic commits into REVIEW-FIX.md."* — **ACHIEVED**. The full-file-echo fixer contract (the live-failure root cause named in CONTEXT canonical_refs) no longer exists anywhere in `lib/`; the loop now takes bounded `{find, replace}` anchor edits, validates them tool-side, applies them in memory, writes once, commits atomically per fix, captures the real hash via `rev-parse HEAD`, and records outcomes (hashes and real fault causes) into an overwritten REVIEW-FIX.md. The three sibling live-crash sites from D-09 are guarded with the canonical template.

### Observable Truths

| # | Truth (source plan) | Status | Evidence |
|---|---|---|---|
| T1 | A `--fix` run whose fixer returns anchor edits updates each target file exactly per its ordered `{find, replace}` edits and lands exactly one atomic git commit per fixed finding (01, D-01/D-03) | ✓ VERIFIED | `lib/code-review.js:681` applies `applyAnchorEdits`, `:696-697` writes once, `:699` `commitSourceFiles` per finding with the scoped message (`:612`); named test `--fix: per-fix atomic commits with scoped messages + REVIEW-FIX.md (D-11/D-12)` **passed this session** |
| T2 | Each landed fix's real hash, captured via `gitFn ["rev-parse","HEAD"]`, appears in REVIEW-FIX.md frontmatter `commits` and in that finding's body row (01, D-11/D-12) | ✓ VERIFIED | hash capture `lib/code-review.js:704`, row push `:711`, frontmatter `commits` `:755,762`, body row `:780`; test deep-equals the two rev-parse captures and asserts hash-bearing rows (test `:783-804`) — **passed this session** |
| T3 | CODE_FIXER_PROMPT specifies the anchor-edit contract (verbatim unique anchors from the embedded `<current_file_content>`, in-order edits, no full-file echo) and still forbids commit/worktrees/git (01, D-02) | ✓ VERIFIED | `lib/_agents.js:438-462` read in full: JSON example is the edits shape (`:449`), anchor rules verbatim/exactly-once/in-order (`:452-454`), boundary sentences at `:440` and `:461`; `grep "FULL fixed file content"` exits 1 (removed) while `Do NOT commit` still matches; named prompt test **passed this session** |
| T4 | CODE_FIXER_SCHEMA validates the restricted object-rooted subset with an `edits` array of `{find, replace}` and no `content` field (01, D-02) | ✓ VERIFIED | `lib/code-review.js:133-155`: required `[id, status, file]`, `edits` items require `[find, replace]`, `additionalProperties: false` at both levels, no `content` property (grep inside the block exits 1); schema shape unit-exercised via the passing structural suites |
| T5 | The `--fix` fail-fast on UNAVAILABLE review, the empty-scope and clean-review soft-skips, and the `--auto` mechanics (MAX_ITERATIONS=3, re-review per round, REVIEW.md overwrite, early convergence) behave exactly as before (01, D-04/D-05/D-08) | ✓ VERIFIED | fail-fast throw `lib/code-review.js:813-817` (message verbatim); clean-review soft-skip `:821-824` writes no REVIEW-FIX.md; `MAX_ITERATIONS = 3` `:562`, re-review `:839`, overwrite `:841`, convergence `:852-856`; named tests `--fix fail-fast: review UNAVAILABLE → throws`, `clean review with fix:true → soft-skip, NO REVIEW-FIX.md`, `early stop / cap / clean-on-first`, `--all` and `--fix-without-all` — **all passed this session** |
| T6 | A faulted finding never aborts the run: spawn throw, non-completed stopReason, or missing/invalid structured output records that ONE finding skipped with its REAL cause (raw stopReason + diagnostic excerpt, never a generic string) and the loop continues, with exactly one fixer attempt per finding (02, D-06/D-07) | ✓ VERIFIED | per-finding catch `lib/code-review.js:734-743` (records `(e && e.message) \|\| String(e)`, continues — the old whole-run `fixUnavailable` catch is gone); stopReason branch `:647-654` emits `fixer did not complete (stopReason: <raw>)` + excerpt; missing-structured `:656-663`; one-attempt proven by spawn-count test; all 7 tests in the skip-and-continue describe **passed this session**; `grep "fixer returned malformed output"` exits 1 (generic string gone) |
| T7 | Overall status is `applied` (≥1 fix committed), `skipped` (loop ran, nothing landed, every skip carries a cause), `unavailable` reserved exclusively for fixer-infrastructure fault (02, D-06) | ✓ VERIFIED | `resolveFixStatus` pure helper `lib/code-review.js:236-240` consumed by `writeReviewFixMd:751`; infra probe `:589-607` with the two verbatim `_runner.js` cause strings (`:226-229`); tests `degrade-on-fixer-fault … status 'skipped'`, `fixer-infrastructure fault … status 'unavailable'`, `resolveFixStatus` unit — **passed this session** |
| T8 | Post-edit .js/.mjs content is parse-gated via `node --check` on a temp `.mjs` under `os.tmpdir()` with argument-array execFile and temp removed in a finally; a failed parse leaves the file byte-identical and records the skip with the stderr cause (02, D-03) | ✓ VERIFIED | `parseGate` `lib/code-review.js:264-283`: non-.js/.mjs short-circuit `:266`, `mkdtemp(os.tmpdir(), "gsd-parse-")` `:269`, `execFileFn(process.execPath, ["--check", tmp])` argument array `:273`, `rm recursive+force` in finally `:281`; wired BEFORE the write at `:690`; tests `a syntax-error edit aborts BEFORE the write — file byte-identical` and `temp file is cleaned up after a full tool run` **passed this session** (real child process) |
| T9 | A commitSourceFiles warning after a successful write restores pre-edit content and records the warning as the skip cause with no hash; a landed commit whose rev-parse fails keeps `fixed` with an unresolved-hash note (02, D-12/OQ-5/OQ-11) | ✓ VERIFIED | restore branch `lib/code-review.js:712-721` (writeText restore or unlink, best-effort); unresolved-hash `:701-710` keeps `fixed`, attaches note, rendered at `:780`; tests `commitSourceFiles warning after a write restores the pre-edit file (OQ-5/D-12)` and `rev-parse failure … keeps 'fixed' with an unresolved-hash note (OQ-11)` **passed this session** |
| T10 | Under `--auto`, a faulted re-review stops the loop with accumulated fixes standing and overall status from fix outcomes — NOT `unavailable` (02, D-05/OQ-4) | ✓ VERIFIED | re-review branch `lib/code-review.js:842-851` sets `autoNote "re-review faulted"`, breaks without setting fixUnavailable; max-iterations note guarded by `!autoNote` `:867`; named test `re-review fault: --auto stops cleanly, accumulated fixes stand, status is NOT 'unavailable'` **passed this session** |
| T11 | When the live host throws on the `ctx.gitFn` access, gsd_add_tests, gsd_pause_work, and gsd_next (advance) fall back to defaultGitFn and complete instead of crashing (03, D-09) | ✓ VERIFIED | guards at `lib/add-tests.js:341`, `lib/core-tools.js:470`, `lib/core-tools.js:667`; all 4 tests in `test/gitfn-guards.test.mjs` **passed this session**, each proving completion under an `Object.defineProperty` throwing getter (the live uninjected-access throw class) |
| T12 | Each guard replicates the exact `let gitFn = defaultGitFn; try { gitFn = ctx.gitFn \|\| defaultGitFn; } catch` template with no inject-array change (03, D-09/D-10) | ✓ VERIFIED | template count: 1 in add-tests.js, exactly 2 in core-tools.js (grep `-c`); inject arrays read unchanged: add-tests `["gsdState","tools","subagents"]`, core-tools `["gsdState","tools"]`, code-review `["fs","gsdState","tools","subagents"]` — no `gitFn` added anywhere |
| T13 | Tool/command/capability/config surface unchanged: 37 tools / 34 commands / 28 capability keys / 27 patch rows (03, D-10) | ✓ VERIFIED | `node --test test/mount.test.mjs test/removal.test.mjs` — 30 tests, 0 fail **this session**; no new tool/command/capability/config key in any diff (the only new exports, `setParseGateExecFileFn`/`applyAnchorEdits`/`resolveFixStatus`/`parseGate`/`excerpt`, are lib-level testable helpers, not surface) |

**behavior_unverified: 0** — every behavior-dependent truth above has a passing named behavioral test executed this session.

## Score

**31/31 must-haves verified** — 13/13 truths, 8/8 artifacts substantive, 10/10 key links WIRED.

## Deferred Items

Filtered against later milestone phases (phase 59 is the milestone's last; none of these belong to any later phase — all are documented follow-up quick tasks, correctly out of scope per D-10):

| Deferred item | Where recorded | Verdict |
|---|---|---|
| `lib/autonomous.js:291` unguarded `ctx.gitFn` | CONTEXT deferred + RESEARCH §1.6 census | Carried follow-up quick task — verified still untouched (`grep` confirms bare access), as D-10 requires |
| Census sites: repair.js:441, undo.js:227, validate-phase.js:557, phase-management-plugin.js:110 | RESEARCH §1.6 + PLAN-03 scope lock | Verified byte-unchanged this session — out of scope held |
| `--fix` reading findings from an existing REVIEW.md (upstream parity) | CONTEXT deferred | Out of this phase's locked scope (D-04 one-shot flow); no phase owns it — record as backlog |
| `.iterN` report backups on `--auto` re-reviews | CONTEXT deferred | Backlog (upstream #3190 pattern) |
| Retry-once-then-skip for faulted fixer findings | CONTEXT deferred | Backlog (D-07 locks one attempt; test-proven) |
| Per-fix test-run validation | CONTEXT deferred | Rejected for cost by decision; pre-ship-verify/gsd_verify remain the test gates |

None of these block the phase goal or CLH-09.

## Required Artifacts

| Artifact | Exists | Substantive | Evidence |
|---|---|---|---|
| `lib/code-review.js` (min 620 / 680) | ✓ | ✓ | 895 lines; exports verified by import-and-grep: `applyAnchorEdits` (:188), `CODE_FIXER_SCHEMA` (:133, frozen, anchor shape, no `content`), `resolveFixStatus` (:236), `parseGate` (:264), `excerpt` (:218), `setParseGateExecFileFn` (:247) |
| `lib/_agents.js` (min 700) | ✓ | ✓ | 721 lines; `CODE_FIXER_PROMPT` exported (:438) rewritten to the anchor contract; boundary rules preserved |
| `test/code-review.test.mjs` (min 880 / 1000) | ✓ | ✓ | 1638 lines; anchor-edit fixtures throughout (old full-content fixtures gone: `grep 'content: "f'` exits 1); `makeFakeGit` has the `rev-parse` branch (:642) with per-fix count assertions (:803-804); new describes for skip-and-continue, parse gate, structural validation, unchanged guards, re-review fault |
| `lib/add-tests.js` (min 389) | ✓ | ✓ | 394 lines; canonical guard at :341 feeding `commitSourceFiles` :343 |
| `lib/core-tools.js` (min 690) | ✓ | ✓ | 708 lines; canonical guards at :470 (feeds porcelain status + WIP `commitArtifacts`) and :667 (feeds advance `commitArtifacts`) |
| `test/gitfn-guards.test.mjs` (min 60, created) | ✓ | ✓ | 254 lines; 4 tests, throwing-getter harness (`armThrowingGitFn`, :34-41) covering all three D-09 sites + the undefined-ctx contrast |

## Key Link Verification

| From | To | Via | Pattern | Status |
|---|---|---|---|---|
| lib/code-review.js | lib/_agents.js | runFixLoop builds the fixer prompt from CODE_FIXER_PROMPT + embeds `<current_file_content>` | `CODE_FIXER_PROMPT` | **WIRED** — import `:25`, consumed `:632`, embed `:637` |
| lib/code-review.js | lib/_git-artifacts.js | per-fix `commitSourceFiles` then `gitFn ["rev-parse","HEAD"]` hash capture | `commitSourceFiles` | **WIRED** — import `:23`, commit `:699`, rev-parse `:704` |
| lib/code-review.js | applyAnchorEdits | runFixLoop applies the fixer's edits to in-memory content before any write | `applyAnchorEdits\(` | **WIRED** — definition `:188`, call `:681` |
| lib/code-review.js | REVIEW-FIX.md | `s.writeArtifact` overwrite with `commits` frontmatter | `writeArtifact\(cwd, args\.phase, "REVIEW-FIX"` | **WIRED** — `:791` |
| lib/code-review.js | node --check | parseGate temp `.mjs` + argument-array execFile | `--check` | **WIRED** — `:273` (`process.execPath, ["--check", tmp]`) |
| lib/code-review.js | lib/_runner.js | spawnSubagent's stopReason + diagnostic surfaced as the real skip cause | `stopReason` | **WIRED** — `:647-651`, `:662` (previously discarded, now in the cause) |
| lib/code-review.js | REVIEW-FIX.md | resolveFixStatus decides the frontmatter status; every skipped row carries its real cause | `resolveFixStatus` | **WIRED** — helper `:236`, consumed `:751` |
| lib/add-tests.js | lib/_git-artifacts.js | guarded gitFn local feeds commitSourceFiles | `try \{ gitFn = ctx\.gitFn \|\| defaultGitFn; \} catch` | **WIRED** — guard `:341` → commit `:343` |
| lib/core-tools.js | lib/_git-artifacts.js | guarded gitFn locals feed the porcelain status call and both commitArtifacts feeds | same template | **WIRED** — `:470` → `:474`+`:500`; `:667` → `:669` |
| test/gitfn-guards.test.mjs | lib/add-tests.js + lib/core-tools.js | defineProperty throwing-getter ctx reproduces the live throw class | `defineProperty` | **WIRED** — `:34-41`, all 4 tests pass |

Note: the `parseGateExecFileFn` module seam is genuinely consumed — `runFixLoop` passes it as parseGate's third argument (`lib/code-review.js:690`), so tool-level parse-gate fault tests exercise the real call site, not a dead seam.

## Data-Flow Trace

End-to-end slice traced in source, every hop present: reviewer findings (`spawnReviewer:509-521` → `resolveFindings:83-91`) → severity filter (`filterBySeverity:572`) → per finding: path guard (`validateFiles:617`) → content read with `existedBefore` (:623-629) → fixer prompt (`CODE_FIXER_PROMPT` + `<finding>` + `<current_file_content>`, :631-638) → `spawnSubagent` (:641) → stopReason/structured real-cause gates (:647-663) → structural/integrity checks OQ-6/7/8 (:669-677) → `applyAnchorEdits` in-memory (:681) → `parseGate` before write (:690) → write-once to `finding.file` (:696-697) → `commitSourceFiles` (:699) → `rev-parse HEAD` hash or unresolved-note (:700-711) / restore-on-warning (:712-721) → accumulators → `writeReviewFixMd` (`resolveFixStatus:751`, `commits` frontmatter :755-762, hash-bearing rows :780, cause-bearing skip rows :786) → `s.writeArtifact("REVIEW-FIX")` overwrite (:791) → `fixSummary` + `addDecision` (:876-877). Infra probe short-circuits ahead of the loop (:589-607); `--auto` re-enters the loop through re-reviews (:834-870). No hop is stubbed or dead.

## Behavioral Spot-Checks

One named test per behavior-dependent truth (never the full suite); **34 named tests run this session, 0 failures**:

| Spot-check (named test) | Truth(s) | Result |
|---|---|---|
| `--fix: per-fix atomic commits with scoped messages + REVIEW-FIX.md (D-11/D-12)` | T1, T2 | ✔ pass |
| skip-and-continue describe (7 tests incl. `non-completed fixer stopReason`, `malformed structured output`, `exactly ONE fixer attempt`, `fixer-infrastructure fault … 'unavailable'`, `resolveFixStatus`, `excerpt`) | T6, T7 | ✔ 7/7 pass |
| `--fix: a syntax-error edit aborts BEFORE the write — file byte-identical` + `temp file is cleaned up` + `extension routing` (real `node --check` child process) | T8 | ✔ 3/3 pass |
| `--fix: commitSourceFiles warning … restores the pre-edit file (OQ-5)` + `rev-parse failure … unresolved-hash note (OQ-11)` | T9 | ✔ 2/2 pass |
| `degrade-on-fixer-fault … status 'skipped'` + `--fix fail-fast: review UNAVAILABLE → throws` + `CODE_FIXER_PROMPT is exported and self-contained` + `clean review with fix:true → soft-skip` + `re-review fault: --auto stops cleanly` | T7, T5, T3, T10 | ✔ 5/5 pass |
| `early stop` / `cap: reaches max 3 iterations` / `clean-on-first` + `--all: adds INFO` + `--fix without --all: INFO excluded` | T5 | ✔ 5/5 pass |
| applyAnchorEdits units (duplicate/missing/empty anchor, evolving-content ordering, atomicity) + OQ-6/7/8 structural tests + `mismatched fixer file` | T1, T4 | ✔ 7/7 pass |
| `test/gitfn-guards.test.mjs` whole file (3 throwing-getter site proofs + undefined-ctx contrast) | T11, T12 | ✔ 4/4 pass |
| `node --test test/mount.test.mjs test/removal.test.mjs` (surface-count invariant, D-10) | T13 | ✔ 30/30 pass |

Probe execution (tooling-phase check): the tool-level tests drive the real `gsd_code_review` `execute` against FakeFs with fault-injected subagents and gitFn — including the real `node --check` child process and real temp-dir lifecycle — so the pipeline is probed through the actual tool entry, not just helpers.

## Requirements Coverage

| REQ-ID | Text (abridged) | Delivered | Evidence |
|---|---|---|---|
| CLH-09 | The gsd_code_review fix flag applies REVIEW.md findings as per-fix atomic commits into REVIEW-FIX.md and works in live sessions | ✓ | Applies findings: anchor edits applied tool-side (T1). Per-fix atomic commits: one `commitSourceFiles` per finding with the scoped message + real `rev-parse HEAD` hash (T1/T2). Into REVIEW-FIX.md: overwritten artefact with `commits` frontmatter + hash/cause-bearing rows (T2, D-11). Works in live sessions: the root cause (unbounded full-file-echo structured output) is structurally eliminated by the bounded anchor contract; residual live fault classes are isolated per-finding with real causes (T6), fixer-infra absence degrades to `unavailable` without crashing (T7), and the same-class live `ctx.gitFn` crash sites are guarded against the throw class simulated verbatim (T11). COVERAGE.md: `status: covered, gap_ids: [], coverage_pct: 100` |

The "works in live sessions" clause is evidenced by mechanism + fault-class simulation (see Human Verification note below for the residual live-E2E caveat).

## Anti-Patterns Found

**None.** Scanned all six changed/created files for TBD/FIXME/XXX/HACK/`.skip(`/`.todo(`: the only matches are prompt *prose* inside `lib/_agents.js` executor-instruction strings (lines 169/195/297 — text describing the anti-pattern scan itself, not debt markers). No skipped or todo tests were introduced (node:test output shows `skipped 0, todo 0` in every run). No unreferenced debt markers.

## Human Verification Required

**None required for status.** No `<verify><human-check>` blocks exist in any PLAN; there is no visual/real-time artefact; and every behavior-dependent truth has a passing named behavioral test that simulates the exact live fault classes (throwing-getter = the live uninjected-property-access throw; non-completed stopReason + diagnostic = live spawn faults; provider-missing = infra absence). This matches the established project precedent (GSD-55/56/57/58 all verified `passed` with `behavior_unverified: 0` on the same offline-harness grounds).

*Recommended (non-blocking) live smoke:* run `gsd_code_review` with `fix: true` once in a live DSH session against a phase with a seeded finding, to observe a real LLM fixer emitting conformant anchor edits end-to-end (the one aspect offline tests can only simulate — fixer *output quality*, not tool correctness; any non-conformant output is already proven to degrade to a caused skip). Milestone-level live validation (MOUNT-05 lineage) already covers this class at the milestone gate.

## Gaps Summary

None. All 31 must-haves verified: 13/13 truths ✓, 8/8 artifacts substantive, 10/10 key links WIRED, no blocker anti-patterns, no human-verification items. The one documented execution deviation (SUMMARY-02: the infra-fault test simulates mid-run provider loss instead of `subagents: null`, because a fully-missing service faults the reviewer first and hits the D-08 fail-fast before the loop can run) is sound — the probe's service-missing branch shares the provider branch's code path, and the `subagents`-absent ⇒ fail-fast contract remains test-proven via the reviewer-fault fixture at test line 811-827.

*Phase: 59-review-fix-companion*
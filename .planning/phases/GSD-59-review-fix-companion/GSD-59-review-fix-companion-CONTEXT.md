# Phase 59: review-fix-companion - Context

**Gathered:** 2026-09-08T05:06:05.642Z
**Status:** Ready for planning

<domain>
## Phase Boundary
**In scope:** Rework the gsd_code_review --fix companion (lib/code-review.js fix loop + lib/_agents.js CODE_FIXER_PROMPT/SCHEMA) so applying review findings works in live sessions: bounded anchor-edit fix contract with tool-side validation (unique-anchor match + parse check), skip-and-continue per-finding error handling with surfaced stopReason/diagnostic, per-fix atomic commits with real commit hashes recorded into an overwritten REVIEW-FIX.md, and guarded ctx.gitFn fallbacks for the identical latent crash in lib/add-tests.js and lib/core-tools.js. Extends test/code-review.test.mjs coverage for all of the above.
**Out of scope:** The reviewer path itself (spawn, scoping tiers, REVIEW.md body) except where the fix loop calls it; re-sourcing findings from an existing REVIEW.md (upstream fix-from-REVIEW.md parity); the unguarded ctx.gitFn access in lib/autonomous.js (deferred); .iterN report backups; retry-on-fault; running tests per fix; any new tool/command/capability/config surface; slash-command or persona changes.
</domain>

<decisions>
## Decisions
### Fix mechanism (anchor-patch contract)
- **D-01:** Replace the full-file-content fixer contract with a bounded anchor-edit contract: the fixer subagent returns structured output { id, status: fixed|skipped, file, edits: [{find, replace}], skip_reason? } — the TOOL (not the subagent) applies the edits to the current file content, writes via ctx.fs, and commits via commitSourceFiles. Bounded output survives large files in live sessions; the D-12 tool-driven principle (fixer never writes files, never runs git) is unchanged.
- **D-02:** Rewrite CODE_FIXER_PROMPT (lib/_agents.js) to the anchor-edit contract and rework CODE_FIXER_SCHEMA accordingly (restricted object-rooted subset: type/properties/required/items/enum, additionalProperties false, no pattern/format/numeric bounds). Each `find` must be a verbatim unique anchor from the current file; `replace` is the full replacement text. Multiple edits per finding are allowed and applied in order.
- **D-03:** Pre-write validation per finding: every `find` anchor must occur EXACTLY ONCE in the current file content, and the post-edit content must parse (node --check on a temporary .mjs copy that is removed afterwards; execFile argument-array only — never shell interpolation) for .js/.mjs targets; non-JS targets get anchor validation only. If any check fails, the whole finding's fix aborts BEFORE any write — the file is left byte-identical and the finding is recorded skipped with the cause. All edits for one finding are atomic: apply to in-memory content first, write once.
### Invocation semantics
- **D-04:** Keep the one-shot review→fix flow: `--fix` (and `--all`/`--auto` which imply it per resolveFixFlags) always runs the reviewer first in the same invocation and fixes the fresh in-memory findings. No findings are parsed back from REVIEW.md in this phase (upstream fix-from-existing-REVIEW.md parity is deferred).
- **D-05:** --auto loop semantics unchanged: MAX_ITERATIONS=3, re-review between rounds, REVIEW.md overwritten per re-review, early convergence when a re-review yields no BLOCKER/WARNING (hasBlockingFindings).
### Error-handling strategy
- **D-06:** Skip-and-continue per finding: a fixer fault on one finding — spawn error, non-completed stopReason (e.g. max-tokens), missing/invalid structured output — records that finding as skipped in REVIEW-FIX.md with the REAL cause (stopReason and a diagnostic excerpt, not a generic 'malformed output'), and the loop continues to the next finding. Overall status is 'applied' when ≥1 fix committed, 'skipped' when the loop ran but nothing landed (every skip carries a cause), and 'unavailable' is reserved for fixer-infrastructure fault (subagents service or spawn provider missing).
- **D-07:** Exactly one fixer attempt per finding — no retry within a run (retry-once deferred).
- **D-08:** The existing fail-fast guards stay: --fix with an UNAVAILABLE review still throws with the re-run-without-fix guidance; empty scope and clean review still soft-skip with no REVIEW-FIX.md.
### Scope boundary (per-route vs global)
- **D-09:** Include the two sibling live-host guards in this phase: wrap the unguarded `ctx.gitFn` property accesses in lib/add-tests.js (~line 336) and lib/core-tools.js (~lines 465 and 657) with the same try/catch guarded fallback to defaultGitFn used at lib/code-review.js:449. Same crash class as the three observed live failures; ~6 lines; no inject-array changes (gitFn is not a host service).
- **D-10:** No new tools, commands, capabilities, or config keys; mount/removal counts unchanged (37 tools / 34 commands / 28 keys / 27 rows). The code-review inject array stays ['fs','gsdState','tools','subagents'] and the gsd_code_review parameter surface is unchanged.
### REVIEW-FIX.md reporting
- **D-11:** Each --fix run OVERWRITES the phase's REVIEW-FIX.md (no .iterN backups). Frontmatter: phase, fixed, fixes_applied, fixes_skipped, status, commits (list of real per-fix commit hashes). Body: per-finding rows with id, severity, file, status (fixed/skipped/unavailable), commit hash when landed, and the fault cause when skipped — mirroring the manual report shape the orchestrator produced for phases 53/56/58.
- **D-12:** Capture the real commit hash for each per-fix atomic commit: after a successful commitSourceFiles, resolve the hash via the same gitFn (`git rev-parse HEAD`, argument-array) and record it; commitSourceFiles warnings (nothing staged, add/commit failure) are recorded as the fix's outcome cause instead of a hash.
### Libraries
- **D-13:** No new dependencies — node builtins only. Reuse the existing seams: spawnSubagent, commitSourceFiles/defaultGitFn, ctx.fs, nowIso/today/stringifyFrontmatter/parseFrontmatter/zeroPad; node --check runs via the already-promisified execFile with an explicit argument array.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Fix companion implementation and seams
- `lib/code-review.js — the phase-59 rework surface: runFixLoop (per-finding fixer spawn, content write, per-fix commit), writeReviewFixMd (REVIEW-FIX.md report), CODE_FIXER_SCHEMA validation, resolveFixFlags/filterBySeverity/hasBlockingFindings pure helpers`
- `lib/_agents.js:436-453 — CODE_FIXER_PROMPT to be rewritten for the anchor-edit contract (currently demands full-file echo, the live failure mode)`
- `lib/_git-artifacts.js:211-236 — commitSourceFiles/defaultGitFn seam used for per-fix atomic commits; returns {committed, staged, warning}, never throws`
- `lib/add-tests.js:336 + lib/core-tools.js:465,657 — sibling unguarded ctx.gitFn sites to wrap with the guarded fallback (D-07)`
- `test/code-review.test.mjs:517-640 — existing --fix test harness (makeReviewFixSubagents reviewer/fixer routing by label) to extend for the anchor contract, skip-and-continue, and commit-hash recording`
- `.planning/phases/GSD-58-node-repair/GSD-58-node-repair-REVIEW-FIX.md — evidence of the live failure ('gsd_code_review --fix unavailable') plus the manual report shape (per-fix commit hashes, findings table) the automated report should match`
- `.planning/REQUIREMENTS.md:130 — CLH-09: fix flag applies REVIEW.md findings as per-fix atomic commits into REVIEW-FIX.md and works in live sessions`
</canonical_refs>

<code_context>
## Code Context
- lib/code-review.js:449 already establishes the guarded gitFn fallback pattern (`try { gitFn = ctx.gitFn || defaultGitFn } catch {}`) — the sibling guards (D-07) replicate exactly this shape; do NOT add "gitFn" to any inject array (it is not a host service).
- test/helpers/mount-harness.mjs makeMountCtx: fake ctx exposes fs directly and never defines gitFn, so tests see `undefined || defaultGitFn` while the live cordis host throws on uninjected property access — tests must simulate the live throw via a Proxy/throwing-getter ctx to prove the guards (D-07) and the existing code-review guard.
- spawnSubagent (lib/_runner.js) returns {output, stopReason, diagnostic, structured} — stopReason and diagnostic are currently discarded by the fix loop; they are the real-cause fields to surface per D-04.
- commitSourceFiles (lib/_git-artifacts.js:211) never throws and returns a warning field on failure — per-fix commit outcomes and the hash capture (gitFn rev-parse HEAD after commit) flow into REVIEW-FIX.md per D-09.
- Pure helpers resolveFixFlags / filterBySeverity / hasBlockingFindings / severityCounts / validateFiles / filterSourcePaths are exported for direct unit testing — keep new logic in testable pure helpers (edits application + anchor validation is a natural new pure helper, e.g. applyAnchorEdits(content, edits) → {content, failed}).
- The --fix fail-fast for an UNAVAILABLE review (lib/code-review.js:548-552) and the empty-scope/clean-review soft-skips stay as-is — only the per-finding fault path changes (D-04).
- Mount/removal suites (test/removal.test.mjs, mount-harness-based suites) assert tool/command/capability counts — this phase adds none, so counts stay 37/34/28/27; run `npm test` (baseline ~1073) green before SUMMARY.
</code_context>

<specifics>
## Specifics
- "Anchor-patch edits (Recommended)": fixer returns {find, replace} anchor edits; the tool verifies each anchor matches exactly once in the current file, applies, writes, commits.
- "Keep one-shot review→fix": gsd_code_review --fix reviews then fixes fresh findings in one invocation.
- "Skip-and-continue per finding": a faulted finding is recorded in REVIEW-FIX.md as skipped/unavailable with the real cause (stopReason, diagnostic), the loop continues to the next finding, and overall status stays 'applied' if anything landed.
- "Sanity check before write": after applying edits, verify the result parses (node --check for .js/.mjs) and that every find-anchor actually matched; abort that fix (leave file untouched, record skipped) otherwise.
- "Include the two sibling guards": wrap the unguarded ctx.gitFn accesses in add-tests.js and core-tools.js with the same guarded fallback.
- "Overwrite + commit hashes": each run overwrites REVIEW-FIX.md with per-finding outcomes including the real git commit hashes of per-fix commits (like the manual reports did) and fault causes; frontmatter carries fixes_applied/fixes_skipped/status.
</specifics>

<deferred>
## Deferred Ideas
- lib/autonomous.js:291 unguarded `gitFn: ctx.gitFn` access — same one-line guard, same crash class; deferred as a follow-up quick task so this phase stays review-focused
- Upstream parity: --fix reading findings from an existing REVIEW.md artefact without auto-running the reviewer (requires findings-back parsing; user chose one-shot review→fix for this phase)
- .iterN.md backups of REVIEW.md/REVIEW-FIX.md on --auto re-reviews (upstream #3190 convergence/degraded backup pattern)
- Retry-once-then-skip for faulted fixer findings
- Per-fix test-run validation (full suite or targeted) — rejected for cost; pre-ship-verify and gsd_verify remain the test gates
</deferred>


---

*Phase: 59-review-fix-companion*
*Context gathered: 2026-09-08*
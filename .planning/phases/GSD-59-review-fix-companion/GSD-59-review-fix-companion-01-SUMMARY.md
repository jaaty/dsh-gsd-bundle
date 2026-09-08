---
phase: 59-review-fix-companion
plan: "01"
subsystem: code-review-fix-companion
tags: [code-review, fix-companion, anchor-edits, structured-output, git-seam]
requires:
  - "lib/code-review.js — the --fix loop, CODE_FIXER_SCHEMA, writeReviewFixMd being reworked"
  - "lib/_agents.js — CODE_FIXER_PROMPT being rewritten"
  - "lib/_git-artifacts.js:211-236 — commitSourceFiles/defaultGitFn per-fix commit seam"
  - "lib/_runner.js:8-32 — spawnSubagent {output, stopReason, diagnostic, structured} result"
  - "D-01/D-02/D-03/D-04/D-05/D-08/D-10/D-11/D-12 in GSD-59-review-fix-companion-CONTEXT.md"
provides:
  - "CODE_FIXER_SCHEMA in bounded anchor-edit shape (edits: [{find, replace}], no content field)"
  - "exported pure helper applyAnchorEdits(content, edits) → {content, failed} (exactly-once anchors, in-order evolving application, atomic failure)"
  - "runFixLoop tool-side pipeline: structural/integrity/path validation → apply-in-memory → write-once → per-fix commitSourceFiles → rev-parse HEAD hash capture"
  - "writeReviewFixMd with commits frontmatter list + hash-bearing applied rows (D-11/D-12)"
  - "CODE_FIXER_PROMPT rewritten to the anchor-edit contract with tool-boundary rules preserved"
affects:
  - "lib/_agents.js (CODE_FIXER_PROMPT consumers — only lib/code-review.js)"
  - "test/code-review.test.mjs — the --fix/--auto harness future plans extend"
  - "plan 02 (fault handling, parse gate, resolveFixStatus semantics) builds directly on this loop"
tech-stack: [node-esm, node-test, fake-fs-fake-ctx-offline-tests, execFile-argument-array]
key-files:
  created: []
  modified:
    - lib/code-review.js
    - lib/_agents.js
    - test/code-review.test.mjs
decisions:
  - "D-01/D-02: fixer returns bounded {id, status, file, edits:[{find,replace}], skip_reason?} — the TOOL applies edits, writes once, commits; the content field is deleted from the schema"
  - "OQ-6 tool-side: status fixed with missing/empty/non-array edits → skipped with cause 'fixer returned no edits' (restricted schema subset cannot express if/then)"
  - "OQ-7: present-but-mismatched fixer id → skipped with cause 'fixer returned output for finding <id>'"
  - "OQ-8: the fix target is ALWAYS finding.file — mismatched fixer-echoed file is a fault; plus defense-in-depth validateFiles guard before any read/spawn/write"
  - "OQ-9: anchor matching is a non-overlapping split-count against the EVOLVING in-memory content; edits apply in order; empty find rejected as 0-count"
  - "OQ-9 (replacement safety): applyAnchorEdits uses a function replacement so $-patterns in replace stay literal text"
  - "D-12: per-fix hash captured via gitFn ['rev-parse','HEAD'] after commitSourceFiles; rev-parse fault never crashes the loop (cause refinement deferred to plan 02/OQ-11); commit warnings become the fix's skip cause"
  - "D-11: writeReviewFixMd frontmatter gains commits (harvested from applied rows); applied rows render '— fixed (commit <hash>)' mirroring the manual phase-58 report shape"
  - "Plan 01 keeps the whole-run fixUnavailable catch, the fixStatus ternary, the --fix fail-fast, clean/empty-scope soft-skips, and --auto mechanics EXACTLY as-is (plan 02 owns fault handling + status semantics)"
metrics:
  duration: "~20 min (wall clock, session-local)"
  completed: "2026-09-08"
actuals:
  tokens: "~92000"
  tasks: 3
  commits: 3
status: complete
---

# Phase 59 Plan 01: Anchor-Edit Fixer Contract (Tracer) Summary

Replaced the full-file-echo fixer contract with the locked bounded anchor-edit contract end to end: reviewer → fixer(anchor edits) → tool-side exactly-once anchor validation → single in-memory-then-write → per-fix atomic commit → real rev-parse HEAD hash → REVIEW-FIX.md with commits frontmatter and hash-bearing rows.

## What Was Done

**Task 1 — TRACER (commit f65cdc4, feat):**
- `lib/code-review.js` — `CODE_FIXER_SCHEMA` redeclared to the anchor-edit shape: `edits` array of `{find, replace}` objects (required `[find, replace]`, `additionalProperties false`), top-level required stays `[id, status, file]` (OQ-6: edits conditionally required tool-side), `content` property deleted.
- `lib/code-review.js` — new exported pure helper `applyAnchorEdits(content, edits) → {content, failed}` below `validateFiles`: edits apply in order against the evolving in-memory content, each `find` must match exactly once (non-overlapping split count; empty find = 0 → rejected); any violation returns the ORIGINAL byte-identical content with a cause naming the edit index and the match count (D-03 abort-before-write). Uses a function replacement so `$`-patterns in `replace` are literal.
- `lib/_agents.js` — `CODE_FIXER_PROMPT` rewritten to the anchor-edit contract: verbatim unique anchors copied from the embedded `<current_file_content>`, exactly-once requirement, in-order application, multiple edits allowed, "Do NOT commit / manage worktrees / run git" sentences preserved verbatim, every full-file-echo demand removed.
- `lib/code-review.js` — `runFixLoop` happy path rewired: structural checks (status fixed ⇒ non-empty edits; id match; file match) → `applyAnchorEdits` → single `ctx.fs.writeText` to `finding.file` → `commitSourceFiles` → `gitFn ["rev-parse","HEAD"]` hash capture (own try/catch) → applied row carries the hash; commit warnings become the skip cause. The guarded gitFn fallback, scoped commit message, content read, prompt embed, and the whole-run catch are byte-for-byte unchanged.
- `writeReviewFixMd` — frontmatter gains `commits` (list of hashes from applied rows); applied rows render `- **<id>** [<severity>] <file> — fixed (commit <hash>)`; `fixStatus` ternary untouched (plan 02 owns skipped-status semantics).
- `test/code-review.test.mjs` — `makeFakeGit` extended with a rev-parse branch (distinct fake hash per call, recorded in `hashes`); happy-path test migrated to anchor-edit fixtures (two ordered edits proving evolving-content application), asserting post-run file bytes, scoped commit messages, rev-parse-after-each-commit ordering, `commits` frontmatter deep-equal to the captured hashes, and hash-bearing body rows; `--all` and `--fix-without-all` migrated to anchor shape with `fixes_applied` 3/2 kept; prompt-contract assertions added (verbatim/exactly-once/edits present, `FULL fixed file content` absent).

**Task 2 — validation hardening (commit d7608c2, test):**
- New `applyAnchorEdits` unit describe (7 cases): unique-anchor happy path, sequential evolving-content edits, duplicate anchor (names edit + count), missing anchor, empty find, replace-containing-find does not corrupt later matching, failed-edit atomicity (original returned byte-identical).
- Defense-in-depth path guard (OQ-8) at the top of each `runFixLoop` iteration: `finding.file` routed through the existing `validateFiles` before any read/spawn/write; rejected paths record `invalid fix target path: <path>` and continue.
- Dedicated tests for the tool-side checks: fixed-without-edits → `fixer returned no edits`; mismatched id → `fixer returned output for finding <id>`; mismatched file → mismatch cause, `finding.file` never redirected; invalid reviewer path → skipped with **zero fixer spawns** (asserted via call counter) and byte-identical files.

**Task 3 — --auto fixtures + unchanged guards (commit e79865e, test):**
- The three `--auto` suites migrated to anchor-edit fixtures (unique anchors from the seeded content); the early-stop test now also asserts `lib/foo.js` changed on disk after the round-1 fix; reviewer/fixer call counts (2/2, 3/3, 1/0) and convergence/cap messages untouched — D-05 loop mechanics unchanged.
- New unchanged-guard regression: clean review with `fix:true` → soft-skip message, **no** REVIEW-FIX.md artifact, zero fixer spawns (D-08); reviewer-before-fixer spawn ordering asserted in the one-shot happy path (D-04).
- Plan-close gates: `node --test test/mount.test.mjs test/removal.test.mjs` green (37 tools / 34 commands / 28 capability keys / 27 patch rows unchanged — D-10); full `npm test` green.

## Verification
- `node --test test/code-review.test.mjs` — 62 tests / 10 suites, 0 fail (50 → 62: +7 applyAnchorEdits unit, +4 structural/path, +1 clean-review guard).
- `node --test test/mount.test.mjs test/removal.test.mjs` — 30 tests, 0 fail (surface counts unchanged).
- `npm test` — **1089 tests / 241 suites / 0 fail** (baseline 1073 + 16 new tests), ~3.5 s, offline.

## Key Files
- `lib/code-review.js` (724 lines) — anchor-edit schema + applyAnchorEdits + rewired runFixLoop + commits-bearing writeReviewFixMd.
- `lib/_agents.js` (721 lines) — CODE_FIXER_PROMPT rewritten to the bounded anchor contract.
- `test/code-review.test.mjs` (1098 lines) — migrated --fix/--all/--fix-without-all/--auto fixtures, extended fake gitFn, new unit + validation describe blocks.

## Deviations
- Commit-message scope style: this executor used the `{phase}-{plan}` scope `59-01` per the executor contract's conventional format (e.g. `feat(59-01): …`); a sibling plan-03 executor used the long form `GSD-59-review-fix-companion-03`. Both forms identify the plan; no reword/rebase was performed because amending across tasks is forbidden and the tree is shared with a concurrently-executing plan.
- Plan-scope note (D-10): sibling plan 03's commits for the add-tests/core-tools gitFn guards are visible in history before this plan's commits; this plan made no changes outside its own `files_modified` set (lib/code-review.js, lib/_agents.js, test/code-review.test.mjs).

## Known Stubs
None. No TODO/FIXME/placeholder/skipped tests were introduced; grep over the modified files matches only prompt prose describing anti-pattern reporting.

## Threat Flags
None raised. Threat posture of this change (informational): fix-target path traversal is guarded by `validateFiles` before any read/spawn/write; the fixer-echoed path can never redirect writes (OQ-8 mismatch fault); anchor replacement uses a function replacement so `$`-patterns cannot inject matched-text semantics; all git/child-process calls remain fixed argument-array (never shell interpolation).

## TDD Gate Compliance
This plan is `type: execute` (not `type: tdd`) — no test-first RED/GREEN commit gate applies. Each task's commit is atomic to its declared `<files>`; Task 1's commit carries lib+test together as the tracer slice.

## Self-Check: PASSED
- Created/modified files exist: lib/code-review.js (724 ≥ 620 min), lib/_agents.js (721 ≥ 700 min), test/code-review.test.mjs (1098 ≥ 880 min).
- Commits exist: f65cdc4, d7608c2, e79865e (one per task, conventional prefixes, scope 59-01).
- must_haves exports verified: `applyAnchorEdits` and `CODE_FIXER_SCHEMA` exported from lib/code-review.js; `CODE_FIXER_PROMPT` exported from lib/_agents.js; key_links (CODE_FIXER_PROMPT import, commitSourceFiles + rev-parse capture, applyAnchorEdits call site, writeArtifact "REVIEW-FIX") all present in lib/code-review.js.

*Phase: 59-review-fix-companion*
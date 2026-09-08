---
phase: 59-review-fix-companion
plan: 02
type: execute
wave: 2
depends_on: ["GSD-59-review-fix-companion-01"]
files_modified:
  - lib/code-review.js
  - test/code-review.test.mjs
autonomous: true
requirements: ["CLH-09"]
user_setup: []
must_haves:
  truths:
    - "A faulted finding never aborts the run: a spawn throw, a non-completed stopReason, or missing/invalid structured output records that ONE finding as skipped with its REAL cause (raw stopReason plus a diagnostic excerpt, never a generic 'malformed output') and the loop continues to the next finding, with exactly one fixer attempt per finding and no retry (per D-06/D-07)"
    - "Overall REVIEW-FIX.md status is 'applied' when at least 1 fix committed, 'skipped' when the loop ran but nothing landed with every skip carrying a cause, and 'unavailable' reserved exclusively for fixer-infrastructure fault (subagents service or spawn provider absent) (per D-06)"
    - "Post-edit .js/.mjs content is parse-gated via node --check on a temporary .mjs copy under os.tmpdir() using an argument-array execFile with the temp removed in a finally; a failed parse leaves the file byte-identical and records the finding skipped with the stderr cause (per D-03)"
    - "A commitSourceFiles warning after a successful write restores the pre-edit content and records the warning as the skip cause with no hash, while a landed commit whose rev-parse fails keeps status 'fixed' with an unresolved-hash note (per D-12/OQ-5/OQ-11)"
    - "Under --auto, a faulted re-review stops the iteration loop with accumulated fix results standing and overall status derived from fix outcomes — it is NOT marked 'unavailable', which stays reserved for fixer-infrastructure faults (per D-05/OQ-4)"
  artifacts:
    - path: "lib/code-review.js"
      provides: "excerpt helper (diagnostic truncation), resolveFixStatus pure helper (applied/skipped/unavailable), fixer-infrastructure probe, per-finding skip-and-continue fault isolation with real causes, injectable parseGate (node --check on temp .mjs), restore-on-commit-warning, rev-parse-failure unresolved-hash note, auto re-review-fault stop"
      min_lines: 680
      exports: ["resolveFixStatus", "parseGate", "excerpt"]
    - path: "test/code-review.test.mjs"
      provides: "skip-and-continue, real-cause (stopReason + diagnostic), malformed-structured, infra-fault, parse-gate (real node --check + injected fault + temp cleanup), restore-on-warning, unresolved-hash, and auto-rereview-fault suites; degrade test rewritten from UNAVAILABLE to status skipped"
      min_lines: 1000
      exports: []
  key_links:
    - from: "lib/code-review.js"
      to: "node --check"
      via: "parseGate writes a temp .mjs copy and runs node --check via the argument-array execFile seam"
      pattern: "--check"
    - from: "lib/code-review.js"
      to: "lib/_runner.js"
      via: "spawnSubagent's stopReason and diagnostic are surfaced as the real skip cause instead of being discarded"
      pattern: "stopReason"
    - from: "lib/code-review.js"
      to: "REVIEW-FIX.md"
      via: "resolveFixStatus decides frontmatter status; every skipped row carries its real cause"
      pattern: "resolveFixStatus"
---

<objective>
Make the fix loop survive faults the way D-06 locks: skip-and-continue per finding with real causes (raw stopReason + diagnostic excerpt), status semantics applied/skipped/unavailable with 'unavailable' reserved for fixer-infrastructure absence, the D-03 node --check parse gate with abort-before-write atomicity, the D-12 commit-warning restore and unresolved-hash handling, and the OQ-4 auto re-review-fault stop — completing CLH-09's live-session error-handling story on top of plan 01's anchor contract. Depends on plan 01 (GSD-59-review-fix-companion-01) for the anchor-edit runFixLoop and hash capture this plan reworks.
</objective>

<context>
@.planning/phases/GSD-59-review-fix-companion/GSD-59-review-fix-companion-CONTEXT.md
@.planning/phases/GSD-59-review-fix-companion/GSD-59-review-fix-companion-RESEARCH.md
@.planning/phases/GSD-59-review-fix-companion/GSD-59-review-fix-companion-01-SUMMARY.md
@lib/code-review.js
@lib/_runner.js
@lib/_git-artifacts.js
@lib/jobs.js
@lib/repair.js
@lib/preflight-verify.js
@test/code-review.test.mjs
@test/helpers/mount-harness.mjs
@test/helpers/fake-fs.mjs
Research sections that govern this plan: §1.2 (the live failure), §1.4 (the D-06 decision table), §1.5 (empirical node --check behaviour), §3 OQ-1/OQ-3/OQ-4/OQ-5/OQ-10/OQ-11/OQ-12 (all resolved with recorded recommendations — implement the recommendations).
</context>

<tasks>
  <task type="auto">
    <name>Task 1: skip-and-continue + real causes + resolveFixStatus + fixer-infrastructure probe (D-06/D-07/OQ-1/OQ-3/OQ-12)</name>
    <files>lib/code-review.js, test/code-review.test.mjs</files>
    <read_first>.planning/phases/GSD-59-review-fix-companion/GSD-59-review-fix-companion-CONTEXT.md (D-06/D-07/D-11), .planning/phases/GSD-59-review-fix-companion/GSD-59-review-fix-companion-RESEARCH.md (§1.2, §1.4, §3 OQ-1/OQ-3/OQ-12), lib/code-review.js (runFixLoop and writeReviewFixMd as left by plan 01), lib/_runner.js (lines 1-35 — the two verbatim infrastructure error strings), lib/jobs.js (line 174 — the stopReason === "completed" convention; ~line 176 — the diagnostic → error-string fallback), lib/repair.js (line 74 — the excerpt precedent), test/helpers/mount-harness.mjs (the subagents: null mount support)</read_first>
    <action>
      1. Add a small local excerpt(text, max = 400) helper in lib/code-review.js mirroring lib/repair.js:74 (truncate to max chars) and export it (OQ-12); use it for diagnostic excerpts, falling back to the fixer's text output when diagnostic is empty (the lib/jobs.js:176 fallback chain).
      2. Rework the per-finding fault path in runFixLoop so a throw from spawnSubagent is caught PER FINDING and records only that finding as skipped with reason (e && e.message) || String(e) — the loop then continues to the next finding (D-06 skip-and-continue). Remove the whole-run fixUnavailable assignment from this catch path. Exactly ONE fixer attempt per finding — no retry within a run (D-07; retry-once is a deferred idea — do not implement it).
      3. After a successful spawn, branch on fr.stopReason !== "completed" (OQ-1: treat only the literal "completed" as success per lib/jobs.js:174 — never enumerate host stopReason values): record that finding skipped with reason `fixer did not complete (stopReason: <raw fr.stopReason>)` plus ` — <excerpt(fr.diagnostic)>` when a diagnostic or output text exists. When fr.structured is missing or not an object, record skipped with a reason naming the absent structured output and the stopReason — replacing today's generic "fixer returned malformed output" string with the real cause (D-06).
      4. Add the fixer-infrastructure probe (OQ-3) at the top of runFixLoop, BEFORE the findings loop, mirroring exactly the two checks spawnSubagent performs (read lib/_runner.js:8-13 first and match its service/provider access mechanics): when the subagents service is undefined or its spawn provider is missing, push EVERY fixable finding as a row with status "unavailable" and reason set to the verbatim corresponding spawnSubagent error string, set fixUnavailable/fixErrorCause, and return without spawning anything. 'unavailable' stays reserved for exactly this fault class (D-06); a reviewer fault is never 'unavailable'.
      5. Add the exported pure helper resolveFixStatus(appliedFixes, skippedFixes, fixUnavailable) returning "unavailable" when fixUnavailable, else "applied" when appliedFixes.length >= 1, else "skipped" (the D-06 decision table as a testable pure function). Consume it in writeReviewFixMd, replacing the line-498 ternary; when the computed status is "skipped", add a body note that no fix landed and every skip's cause is listed below. Keep the frontmatter keys from plan 01 (including commits).
      6. Tests: rewrite the degrade-on-fixer-fault test (test/code-review.test.mjs:748-766) — a plain fixer fault now yields frontmatter status "skipped" with all fixable findings skipped and their real causes recorded, and the report must NOT claim UNAVAILABLE; extend makeReviewFixSubagents so a controller can (a) fail only specific call indices and (b) override the returned result fields (stopReason/diagnostic) instead of the default completed result — then add: skip-and-continue (finding 1 faults via a thrown start, finding 2 lands → overall "applied", row 1 skipped with the real cause string); non-completed stopReason (a max-tokens-like raw value) with a diagnostic → the row's cause contains the raw stopReason and the diagnostic excerpt (asserting the real-cause contract, not the old generic string); malformed structured output ({} and null) → skipped with the real cause; a one-attempt assertion that the fixer spawn count equals the fixable-finding count (D-07, no retry); infrastructure fault via mountReview({ subagents: null }) → status "unavailable", every row unavailable with the infra cause, and the run never throws; resolveFixStatus unit tests covering all three branches; an excerpt truncation unit test.
    </action>
    <verify>node --test test/code-review.test.mjs — exit 0</verify>
    <acceptance_criteria>
      - grep -n "resolveFixStatus" lib/code-review.js matches both the export and the writeReviewFixMd call site
      - grep -n "excerpt" lib/code-review.js matches the helper definition and its use in skip causes
      - grep -n "fixer did not complete" lib/code-review.js matches the non-completed cause
      - grep -n "subagents" lib/code-review.js matches the infrastructure probe, and the probe's reasons match fragments of the two verbatim spawnSubagent error strings from lib/_runner.js:10 and :12
      - the rewritten degrade test asserts frontmatter status "skipped", and the new infra test asserts status "unavailable"; node --test test/code-review.test.mjs exits 0
    </acceptance_criteria>
    <done>Every per-finding fault records that finding with its real cause and the loop continues; only fixer-infrastructure absence produces 'unavailable'; D-07's no-retry rule is test-proven; the D-06 decision table is a unit-tested pure helper.</done>
  </task>

  <task type="auto">
    <name>Task 2: parse gate (node --check) + commit-warning restore + unresolved hash (D-03/D-12/D-13/OQ-5/OQ-10/OQ-11)</name>
    <files>lib/code-review.js, test/code-review.test.mjs</files>
    <read_first>.planning/phases/GSD-59-review-fix-companion/GSD-59-review-fix-companion-CONTEXT.md (D-03/D-12/D-13), .planning/phases/GSD-59-review-fix-companion/GSD-59-review-fix-companion-RESEARCH.md (§1.5 empirical node --check table, §3 OQ-5/OQ-10/OQ-11), lib/preflight-verify.js (lines 10-35 — the injectable execFileFn + mkdtemp/rm temp-dir pattern), lib/code-review.js (top-of-file imports and runFixLoop as left by Task 1), lib/_git-artifacts.js (lines 211-236 — the commitSourceFiles never-throws warning contract)</read_first>
    <action>
      1. Add an exported async helper parseGate(content, targetFile, execFileFn = execFileP) to lib/code-review.js (execFileP already exists in this file's imports — reuse it; node builtins only per D-13, no new dependencies). Behaviour: when targetFile does not end in .js or .mjs return { ok: true, checked: false } — non-JS targets get anchor validation only (D-03); otherwise create a temp dir with mkdtemp under os.tmpdir() (prefix gsd-parse-), write the post-edit content to a .mjs file inside it via writeFile from node:fs/promises (a REAL file is required because a real child process checks it — the sanctioned exception to artefacts-via-ctx.fs, per the lib/preflight-verify.js precedent; never inside the workspace or .planning/), run node --check on that temp file via execFileFn with an explicit argument array — never shell interpolation (D-03, same discipline as lib/_git-artifacts.js:14-16) — and remove the temp dir with rm recursive+force in a finally block. On execFile rejection return { ok: false, cause: excerpt(stderr) }; on success { ok: true, checked: true }.
      2. Wire the gate into runFixLoop after applyAnchorEdits succeeds and BEFORE ctx.fs.writeText: when !gate.ok, record the finding skipped with reason `parse check failed: <cause>` and write NOTHING — the file stays byte-identical (D-03 abort-before-write).
      3. OQ-5 restore-on-commit-warning: capture existedBefore and originalContent from the existing content read (the file-exists signal the current catch discards); when commitSourceFiles returns a warning after a successful write, restore disk state to match the report — re-write originalContent via ctx.fs.writeText when the file existed before the fix, else best-effort ctx.fs.unlink the written file inside try/catch — then record the finding skipped with reason set to the commitSourceFiles warning and NO commit hash (D-12). After this task a "fixed" row always implies a landed commit plus a hash.
      4. OQ-11 unresolved hash: wrap the rev-parse HEAD capture in try/catch; when it fails after a landed commit, KEEP status "fixed" (the commit exists) and attach a note `commit hash unresolved: <message>` to the appliedAccum row; render that note on the row in REVIEW-FIX.md. Do not downgrade to skipped and do not count it as skipped — fixes_applied stays truthful.
      5. Tests: a real node --check pass case — an anchor edit that keeps the content valid ESM lands with a hash; a real node --check fail case — a fixer edit injecting a syntax error (e.g. replacing a line with const x = {;) → the finding is skipped, the target file is byte-identical afterwards, and the cause contains "parse check failed" plus stderr text; temp cleanup — inject an execFileFn that records the --check temp path and assert that path no longer exists after the run; extension routing — a finding on a seeded .md file with valid anchors lands while a recording execFileFn proves node --check was never invoked for it; an injected failing execFileFn on a .js target → skipped with the parse cause; a commit-warning restore test — a fake gitFn whose diff --cached --name-only returns empty → the file is restored byte-identical, the row is skipped with the warning as reason, commits stays empty; a rev-parse failure test — a fake gitFn that throws on rev-parse → the row stays fixed, frontmatter fixes_applied is 1, and the body notes the unresolved hash.
    </action>
    <verify>node --test test/code-review.test.mjs — exit 0</verify>
    <acceptance_criteria>
      - grep -n "parseGate" lib/code-review.js matches the export and the runFixLoop call site positioned before the writeText call
      - grep -n "parse check failed" lib/code-review.js matches the skip cause
      - grep -n "commit hash unresolved" lib/code-review.js matches the OQ-11 note
      - grep -n "mkdtemp" lib/code-review.js and grep -n "tmpdir" lib/code-review.js match the temp-dir implementation, and the child-process call uses an argument array (grep -n '"--check"' lib/code-review.js matches)
      - node --test test/code-review.test.mjs exits 0, including the byte-identical atomicity and temp-cleanup assertions
    </acceptance_criteria>
    <done>.js/.mjs fixes are parse-gated with atomic abort on failure; commit warnings restore disk state and record the cause; every landed commit reports a real hash or an explicit unresolved-hash note; all gate behaviour is test-proven offline.</done>
  </task>

  <task type="auto">
    <name>Task 3: --auto re-review-fault stop (OQ-4) + summary wording + phase-close gates (D-05/D-06/D-10)</name>
    <files>lib/code-review.js, test/code-review.test.mjs</files>
    <read_first>.planning/phases/GSD-59-review-fix-companion/GSD-59-review-fix-companion-RESEARCH.md (§3 OQ-4), .planning/phases/GSD-59-review-fix-companion/GSD-59-review-fix-companion-CONTEXT.md (D-05/D-06), lib/code-review.js (lines 545-615 as left by Tasks 1-2 — the --fix block, auto loop, fixSummary, addDecision)</read_first>
    <action>
      1. Rework the --auto re-review branch (currently lines 577-581): when the re-review comes back UNAVAILABLE, do NOT set fixUnavailable — a reviewer fault is not a fixer-infrastructure fault and D-06 reserves 'unavailable' for the latter; instead set autoNote to ` --auto: stopped after iteration <n> — re-review faulted (<reReview.errorCause>).`, break the loop, and let the already-accumulated appliedFixes/skippedFixes stand with the overall status computed by resolveFixStatus from fix outcomes. The REVIEW.md has already been overwritten with the UNAVAILABLE re-review by writeReviewMd — leave that as-is. Keep the existing break on fixResult.fixUnavailable (a fixer-infrastructure fault mid-loop still yields status "unavailable" per D-06).
      2. Keep every other --auto mechanic byte-for-byte (D-05): MAX_ITERATIONS=3, re-review between rounds, REVIEW.md overwrite per re-review, early convergence on !hasBlockingFindings, and the max-iterations autoNote.
      3. Update fixSummary (the tool-result line at ~602) so a skipped run reads naturally: when the computed fixStatus is "skipped", append a clause noting that every skipped fix records its real cause in REVIEW-FIX.md; keep the applied/unavailable wording intact; keep the s.addDecision line truthful for all three statuses.
      4. Tests: a new auto re-review-fault test — reviewer call 1 returns blocking findings, the re-review faults (per-call reviewer fault via the extended makeReviewFixSubagents from Task 1) → the run completes without throwing, reviewerCallCount is 2, the round-1 fix landed (file content transformed, row fixed with a hash), REVIEW-FIX.md frontmatter status is "applied", REVIEW.md frontmatter status is UNAVAILABLE, and the result matches the stopped-on-rereview note; re-run the existing --auto call-count suites (early stop, cap, clean-on-first) and confirm they pass unchanged.
      5. Phase-close gates: run the FULL npm test and require green (baseline 1073 plus this phase's new tests); run the mount and removal suites and confirm 37 tools / 34 commands / 28 capability keys / 27 patch rows (D-10 — no surface change anywhere in this phase).
    </action>
    <verify>npm test — exit 0; node --test test/mount.test.mjs test/removal.test.mjs — exit 0</verify>
    <acceptance_criteria>
      - npm test exits 0 with zero failing tests (>= 1073 baseline plus new tests)
      - grep -n "re-review faulted" lib/code-review.js matches the OQ-4 autoNote
      - the new test asserts REVIEW-FIX.md status "applied" alongside REVIEW.md status UNAVAILABLE in the same run
      - node --test test/mount.test.mjs test/removal.test.mjs exits 0 (surface counts unchanged per D-10)
    </acceptance_criteria>
    <done>The auto loop stops cleanly on a re-review fault with accumulated results standing; the full suite is green; the phase's D-01..D-13 surface is complete and CLH-09's fix companion works end-to-end offline.</done>
  </task>
</tasks>
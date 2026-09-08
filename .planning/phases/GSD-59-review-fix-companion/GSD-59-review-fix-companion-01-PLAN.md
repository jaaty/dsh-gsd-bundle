---
phase: 59-review-fix-companion
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - lib/code-review.js
  - lib/_agents.js
  - test/code-review.test.mjs
autonomous: true
requirements: ["CLH-09"]
user_setup: []
must_haves:
  truths:
    - "A gsd_code_review --fix run whose fixer returns anchor edits updates each target file exactly per its ordered {find, replace} edits and lands exactly one atomic git commit per fixed finding (per D-01/D-03)"
    - "Each landed fix's real commit hash, captured via gitFn ['rev-parse','HEAD'] after commitSourceFiles, appears in REVIEW-FIX.md frontmatter commits and in that finding's body row (per D-11/D-12)"
    - "CODE_FIXER_PROMPT specifies the anchor-edit contract — verbatim unique find anchors taken from the embedded <current_file_content>, edits applied in order, no full-file echo — and still forbids the fixer from committing, managing worktrees, and running git (per D-02)"
    - "CODE_FIXER_SCHEMA validates fixer output against the restricted object-rooted subset (type/properties/required/items/enum, additionalProperties false, no pattern/format/numeric bounds) with an edits array of {find, replace} and no content field (per D-02)"
    - "The existing --fix fail-fast on UNAVAILABLE review, the empty-scope and clean-review soft-skips (no REVIEW-FIX.md), and the --auto loop mechanics (MAX_ITERATIONS=3, re-review per round, REVIEW.md overwrite, early convergence) behave exactly as before (per D-04/D-05/D-08)"
  artifacts:
    - path: "lib/code-review.js"
      provides: "CODE_FIXER_SCHEMA in anchor-edit shape (no content field); exported applyAnchorEdits(content, edits) pure helper; runFixLoop tool-side validate → apply-in-memory → write-once → commit → rev-parse hash-capture pipeline; writeReviewFixMd with commits frontmatter and hash-bearing rows"
      min_lines: 620
      exports: ["applyAnchorEdits", "CODE_FIXER_SCHEMA"]
    - path: "lib/_agents.js"
      provides: "CODE_FIXER_PROMPT rewritten to the anchor-edit contract with the tool-boundary rules (Do NOT commit / worktrees / git) preserved"
      min_lines: 700
      exports: ["CODE_FIXER_PROMPT"]
    - path: "test/code-review.test.mjs"
      provides: "--fix happy-path, --all, and --fix-without-all suites migrated to anchor-edit fixtures; makeFakeGit extended with a rev-parse branch; applyAnchorEdits unit suite; prompt-contract assertions"
      min_lines: 880
      exports: []
  key_links:
    - from: "lib/code-review.js"
      to: "lib/_agents.js"
      via: "runFixLoop builds the fixer prompt from CODE_FIXER_PROMPT and embeds <current_file_content>"
      pattern: "CODE_FIXER_PROMPT"
    - from: "lib/code-review.js"
      to: "lib/_git-artifacts.js"
      via: "per-fix commitSourceFiles(cwd, [finding.file], scopedMessage, gitFn) then gitFn ['rev-parse','HEAD'] hash capture"
      pattern: "commitSourceFiles"
    - from: "lib/code-review.js"
      to: "applyAnchorEdits"
      via: "runFixLoop applies the fixer's edits to in-memory content before any write"
      pattern: "applyAnchorEdits\\("
    - from: "lib/code-review.js"
      to: "REVIEW-FIX.md"
      via: "s.writeArtifact overwrite with commits frontmatter"
      pattern: "writeArtifact\\(cwd, args\\.phase, \"REVIEW-FIX\""
---

<objective>
Replace the full-file-echo fixer contract with the locked anchor-edit contract (D-01/D-02/D-03) and wire the tracer end-to-end slice: a --fix finding flows reviewer → fixer(anchor edits) → tool-side exactly-once anchor validation → single in-memory-then-write → per-fix atomic commitSourceFiles → real rev-parse HEAD hash → REVIEW-FIX.md with commits frontmatter and hash-bearing rows. This plan lands the happy path; fault handling, the parse gate, and status semantics are plan 02.
</objective>

<context>
@.planning/phases/GSD-59-review-fix-companion/GSD-59-review-fix-companion-CONTEXT.md
@.planning/phases/GSD-59-review-fix-companion/GSD-59-review-fix-companion-RESEARCH.md
@lib/code-review.js
@lib/_agents.js
@lib/_git-artifacts.js
@lib/_runner.js
@test/code-review.test.mjs
@test/helpers/mount-harness.mjs
@test/helpers/fake-fs.mjs
@.planning/phases/GSD-58-node-repair/GSD-58-node-repair-REVIEW-FIX.md
Research sections that govern this plan: §1.3 (anchor contract implementation shape), §1.4 (status table — only the applied row is built here), §6 (repo constraints: restricted schema subset, argument-array discipline, offline tests).
</context>

<tasks>
  <task type="auto">
    <name>Task 1: TRACER — anchor-edit contract end to end (schema, prompt, helper, loop, hash capture, REVIEW-FIX)</name>
    <files>lib/code-review.js, lib/_agents.js, test/code-review.test.mjs</files>
    <read_first>.planning/phases/GSD-59-review-fix-companion/GSD-59-review-fix-companion-CONTEXT.md, .planning/phases/GSD-59-review-fix-companion/GSD-59-review-fix-companion-RESEARCH.md (§1.3, §1.4), lib/code-review.js (lines 40-160 and 425-530), lib/_agents.js (lines 430-453), lib/_git-artifacts.js (lines 211-236), lib/_runner.js (lines 1-35), test/code-review.test.mjs (lines 517-670), .planning/phases/GSD-58-node-repair/GSD-58-node-repair-REVIEW-FIX.md</read_first>
    <action>
      1. lib/code-review.js — redeclare CODE_FIXER_SCHEMA (lines 125-136) to the anchor-edit shape per D-02: properties id (string), status (string enum fixed|skipped), file (string), edits (array whose items are objects with properties find (string) and replace (string), required [find, replace], additionalProperties false), skip_reason (string); top-level required stays exactly [id, status, file] (OQ-6: edits are conditionally required tool-side because the restricted subset has no if/then); additionalProperties false; delete the content property; update the block comment to describe the bounded anchor contract.
      2. lib/code-review.js — add an exported pure helper applyAnchorEdits(content, edits) directly below validateFiles (after line 157), fs-free. Returns { content, failed }: edits are applied in order, each validated against the EVOLVING in-memory result of the previous edits (edit N sees edits 1..N-1 applied — D-02/OQ-9); for each edit, count non-overlapping occurrences of find in the current in-memory content (split-based count); the count must be exactly 1 (an empty find counts as 0 and is rejected); on any violation return { content: <the ORIGINAL input, byte-identical>, failed: "<cause naming the edit index and whether the anchor matched 0 or >1 times>" } — no partial application escapes (D-03 atomicity). Per CONTEXT code_context this exact signature is locked.
      3. lib/_agents.js — rewrite CODE_FIXER_PROMPT (lines 436-453) to the anchor-edit contract per D-02: keep the gsd-code-fixer role line and the exact sentences "You DO NOT commit. You DO NOT manage worktrees. You DO NOT run git." (the test at test/code-review.test.mjs:622-623 asserts /Do NOT commit/i and /Do NOT.*worktree|Do NOT manage worktree/i); keep the given-inputs list including the current full content of the file; replace the JSON example with the edits shape: { "id": "<the finding id>", "status": "fixed"|"skipped", "file": "<the file path>", "edits": [ { "find": "<verbatim unique anchor copied from the current file content>", "replace": "<full replacement text>" } ], "skip_reason": "<only when status is skipped>" }; add anchor rules: each find MUST be copied verbatim from the provided current file content, MUST appear exactly once there, edits are applied in order each against the result of the previous edit, a find matching zero or multiple times fails the whole finding, multiple edits per finding are allowed; restate that the fixer never writes files and never runs git (D-01/D-12 tool-driven principle unchanged). Remove every demand for full-file content.
      4. lib/code-review.js — rewire the runFixLoop happy path (lines 442-494). Keep UNCHANGED: the guarded gitFn fallback (lines 448-449), the scoped per-fix commit message (line 456), the current-content read (lines 458-462), and the fixer prompt build including the <current_file_content> embed (lines 464-471). Inside the try after spawnSubagent (line 474), rework the result handling: (a) fixResult.status === "skipped" records the skipped row with fixResult.skip_reason exactly as today; (b) otherwise require status "fixed" with Array.isArray(fixResult.edits) and fixResult.edits.length > 0 — when edits is missing/empty/non-array record skipped with reason "fixer returned no edits" (OQ-6); (c) integrity checks — when fixResult.id is present and !== finding.id record skipped with reason "fixer returned output for finding <fixResult.id>" (OQ-7); when fixResult.file is present and !== finding.file record skipped with a reason naming the mismatched path (OQ-8); (d) apply — const result = applyAnchorEdits(currentContent, fixResult.edits); when result.failed is truthy record the finding skipped with that cause and write NOTHING (D-03 abort-before-write); (e) write once — resolve the target as ctx.fs.resolve(`${cwd}/${finding.file}`) and ctx.fs.writeText(fileTarget, result.content); the fixer-echoed file is never used as the write target (OQ-8); (f) commit — const r = await commitSourceFiles(cwd, [finding.file], scopedMessage, gitFn); when r.committed, capture the hash via await gitFn(cwd, ["rev-parse", "HEAD"]) inside its own try/catch (a rev-parse failure must not crash the loop; plan 02 refines its cause note per OQ-11) and push { id: finding.id, file: finding.file, severity: finding.severity, status: "fixed", commit: <trimmed hash> } into appliedAccum; when r did not commit (r.warning), push the finding into skippedAccum with reason r.warning instead of a hash (D-12); (g) leave the outer catch (lines 487-491) and its whole-run fixUnavailable behaviour EXACTLY as-is — plan 02 reworks fault handling; do not touch it here.
      5. lib/code-review.js — rework writeReviewFixMd (lines 497-527): keep all frontmatter keys and add commits — the list of commit hashes harvested from appliedFixes rows that carry one (stringifyFrontmatter renders inline arrays and parseFrontmatter round-trips them, lib/_shared.js:156-157 and 130-131); render applied rows as `- **<id>** [<severity>] <file> — fixed (commit <hash>)` and skipped rows as today with their reason, mirroring the manual per-finding report shape of .planning/phases/GSD-58-node-repair/GSD-58-node-repair-REVIEW-FIX.md (D-11); keep the s.writeArtifact overwrite (line 526) and the fixStatus ternary unchanged (plan 02 introduces status skipped via resolveFixStatus).
      6. test/code-review.test.mjs — extend makeFakeGit (lines 544-558) with a rev-parse branch: when args[0] === "rev-parse" return a fake full hash (distinct per call, e.g. a counter-suffixed abc123-style hash) so calls are recorded. Read seedSourceFile (line 154) to learn the seeded sample content, then migrate three suites to anchor-edit fixtures where each fixer returns { id, status: "fixed", file, edits: [{ find: <exact unique substring of the seeded content>, replace: <new text> }] }: the happy-path test (lines 626-670) — assert each target file's post-run content equals the expected transformed text (proving edits applied, not a full-content echo), 2 per-fix commit calls with the existing scoped-message regexes (lines 668-669), a ["rev-parse","HEAD"] call following each commit, REVIEW-FIX.md frontmatter commits deep-equal to the two fake hashes with fixes_applied 2 and status applied, and body rows carrying both hashes; the --all test (lines 689-717) and the --fix-without-all test (lines 719-746) — same anchor-shape fixtures, keep the existing fixes_applied assertions (3 and 2). Add prompt-contract assertions to the CODE_FIXER_PROMPT test (lines 619-624): the prompt demands a verbatim anchor appearing exactly once and an edits array, and no longer contains the phrase demanding FULL fixed file content.
    </action>
    <verify>node --test test/code-review.test.mjs — exit 0 (every suite in the file green, including the untouched fail-fast and degrade suites)</verify>
    <acceptance_criteria>
      - grep -n "edits:" lib/code-review.js matches the CODE_FIXER_SCHEMA block, and no content property remains inside that schema block
      - grep -n "applyAnchorEdits" lib/code-review.js shows both the export declaration and the runFixLoop call site
      - grep -n "rev-parse" lib/code-review.js matches the hash capture, and grep -n "rev-parse" test/code-review.test.mjs matches the makeFakeGit branch
      - grep -n "FULL fixed file content" lib/_agents.js exits non-zero (phrase removed), while grep -n "Do NOT commit" lib/_agents.js still matches
      - grep -n "commits" lib/code-review.js matches the writeReviewFixMd frontmatter field
      - node --test test/code-review.test.mjs exits 0
    </acceptance_criteria>
    <done>A --fix run in tests drives reviewer → fixer(anchor edits) → tool-side validation → single write per finding → per-fix commit → rev-parse hash → REVIEW-FIX.md with commits frontmatter and hash-bearing rows; the full-file-echo contract no longer exists in lib/.</done>
  </task>

  <task type="auto">
    <name>Task 2: applyAnchorEdits edge-case unit tests + tool-side structural/path validation hardening (OQ-6/OQ-7/OQ-8)</name>
    <files>lib/code-review.js, test/code-review.test.mjs</files>
    <read_first>.planning/phases/GSD-59-review-fix-companion/GSD-59-review-fix-companion-CONTEXT.md (D-02/D-03), .planning/phases/GSD-59-review-fix-companion/GSD-59-review-fix-companion-RESEARCH.md (§1.3 and §3 OQ-6..OQ-9), lib/code-review.js (runFixLoop as rewired in Task 1, validateFiles at lines 144-157), test/code-review.test.mjs (the --fix describe block)</read_first>
    <action>
      1. Add a unit describe block for applyAnchorEdits in test/code-review.test.mjs importing the exported helper, covering: the unique-anchor happy path replaces exactly the intended occurrence; two sequential edits where edit 2's find anchor only exists after edit 1 is applied (proves evolving-content ordering per D-02); a duplicate anchor (find occurs twice) fails with a cause naming the edit and the match count; a missing anchor (0 occurrences) fails; an empty find string fails; a replace value that itself contains the find string does not corrupt a later edit's matching; any failed edit returns the ORIGINAL content byte-identical with a truthy failed cause (atomicity, D-03).
      2. Defense-in-depth path guard per OQ-8: at the top of each runFixLoop iteration, BEFORE the content read and spawn, route finding.file through the existing validateFiles helper ([finding.file], cwd); when the path is rejected (absolute, .. segment, or shell metachar), record the finding skipped with reason "invalid fix target path: <path>" and continue without reading, spawning, or writing anything.
      3. Exercise the Task-1 structural checks with dedicated tests: a fixer result with status fixed but no edits → skipped with reason "fixer returned no edits" (OQ-6); a fixer result with mismatched id → skipped with reason "fixer returned output for finding <id>" (OQ-7); a fixer result whose file differs from finding.file → skipped with the mismatch cause (OQ-8); a reviewer finding whose file fails validateFiles → skipped without any fixer spawn (assert via the fixer call counter).
      4. No behaviour change to lib/_agents.js in this task; the prompt-contract assertions from Task 1 stay green.
    </action>
    <verify>node --test test/code-review.test.mjs — exit 0</verify>
    <acceptance_criteria>
      - grep -n "applyAnchorEdits" test/code-review.test.mjs matches the new unit describe block with at least 6 test cases
      - grep -n "invalid fix target path" lib/code-review.js matches the validateFiles guard in runFixLoop
      - grep -n "fixer returned no edits" lib/code-review.js and grep -n "fixer returned output for finding" lib/code-review.js both match the OQ-6/OQ-7 causes
      - node --test test/code-review.test.mjs exits 0
    </acceptance_criteria>
    <done>Every tool-side structural/integrity/path check is test-proven to skip the finding with a specific cause while leaving the file byte-identical, and the anchor helper's exactly-once/atomicity rules are directly unit-tested.</done>
  </task>

  <task type="auto">
    <name>Task 3: --auto fixtures to anchor shape + unchanged-guard regressions + plan-close gates (D-04/D-05/D-08/D-10)</name>
    <files>test/code-review.test.mjs</files>
    <read_first>.planning/phases/GSD-59-review-fix-companion/GSD-59-review-fix-companion-CONTEXT.md (D-04/D-05/D-08/D-10), lib/code-review.js (lines 545-605 — fail-fast, soft-skips, auto loop), test/code-review.test.mjs (lines 672-867)</read_first>
    <action>
      1. Migrate the three --auto suites (lines 771-866) to anchor-edit fixtures: fixer results carry edits arrays whose find anchors are unique substrings of the seeded content; add an assertion that lib/foo.js content actually changed on disk after the early-stop run (the round-1 fix landed). Keep the existing reviewer/fixer call-count assertions (2/2, 3/3, 1/0) untouched — the D-05 loop mechanics (MAX_ITERATIONS=3, re-review between rounds, REVIEW.md overwrite per re-review, early convergence on hasBlockingFindings) must not change.
      2. Regression-assert the unchanged guards (D-04/D-08): the fail-fast test (lines 672-687) passes untouched; add an assertion that a clean review with fix:true writes NO REVIEW-FIX.md artifact (gsdState.readArtifact returns falsy) and that the one-shot flow still spawns the reviewer before any fixer spawn in the same invocation (assertable via the existing capture hooks or call ordering).
      3. Plan-close gates: run the mount and removal suites and confirm the surface is unchanged — 37 tools / 34 commands / 28 capability keys / 27 patch rows (D-10: this phase adds no tool, command, capability, or config key); run the FULL npm test and require green (baseline 1073 plus the new tests).
    </action>
    <verify>npm test — exit 0; node --test test/mount.test.mjs test/removal.test.mjs — exit 0</verify>
    <acceptance_criteria>
      - npm test exits 0 with zero failing tests
      - node --test test/mount.test.mjs test/removal.test.mjs exits 0 (mount/removal counts unchanged per D-10)
      - grep -n "edits:" test/code-review.test.mjs matches the --auto fixtures
      - no full-content fixer fixture remains: grep -n "content: \"f" test/code-review.test.mjs exits non-zero
    </acceptance_criteria>
    <done>The whole suite is green on the anchor contract; --auto mechanics and the D-04/D-08 guards are regression-proven; the tool/command/capability surface is unchanged.</done>
  </task>
</tasks>
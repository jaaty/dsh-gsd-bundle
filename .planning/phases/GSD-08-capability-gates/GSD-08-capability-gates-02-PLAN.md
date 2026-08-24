---
phase: 08-capability-gates
plan: 02
type: execute
wave: 2
depends_on: ["GSD-08-capability-gates-01"]
files_modified:
  - lib/gates.js
  - lib/ship.js
  - test/gates.test.mjs
autonomous: true
requirements: ["CAP-01", "CAP-02"]
user_setup: []
must_haves:
  truths:
    - "runCapabilityGates({cfg, gitData, plans, skipGates}) returns {reportLines, blockError}: one Gate Report line per gate (security/broken_windows/tdd_audit) carrying pass|fail|skipped + findings, and blockError set to a non-null message naming the failing gate(s), file(s) and reason only when a required enabled gate fails, else null (D-05, D-06, D-07)."
    - "runCapabilityGates takes the FULL config as cfg (with the nested gates block), never a pre-extracted gates sub-object — so cfg.gates.{security,broken_windows,tdd_audit} disables a gate consistently across the evaluator, the orchestration seam, and the ship integration (D-08)."
    - "fetchGitData(cwd, gitFn, base) returns {changedFiles, contentMap, commitSubjects} using git merge-base/diff/log with --diff-filter=ACM so only the phase's changed files are scanned, never the whole repo (D-04)."
    - "gsd_ship runs the capability gates after the gh-auth gate and before the push, appends the Gate Report lines to its output log on every run, and calls the existing fail() with blockError when a required gate fails (CAP-01, CAP-02, D-05, D-07)."
    - "gsd_ship registers a skip_gates string[] tool parameter validated against the three known gate names; unknown names are rejected (D-06, OQ-4)."
  artifacts:
    - path: "lib/gates.js"
      provides: "Adds the pure orchestration seam runCapabilityGates and the integration git adapter fetchGitData on top of plan 01's evaluators."
      min_lines: 200
      exports: ["runCapabilityGates", "fetchGitData"]
    - path: "lib/ship.js"
      provides: "gsd_ship wires the capability gates between gh-auth (step 5) and push (step 6), reports the Gate Report, and blocks via fail() on a failing required gate."
      min_lines: 195
      exports: ["name", "inject", "apply"]
  key_links:
    - from: "lib/ship.js"
      to: "lib/gates.js"
      via: "ship.js imports runCapabilityGates and fetchGitData, computes defaultBranch+mergeBase, fetches gitData, calls runCapabilityGates before the push, appends reportLines to log, and fail()s blockError."
      pattern: "runCapabilityGates|fetchGitData"
    - from: "lib/gates.js runCapabilityGates"
      to: "lib/gates.js securityGate/brokenWindowsGate/tddAuditGate/resolveGatesConfig"
      via: "runCapabilityGates resolves gate flags via resolveGatesConfig, runs each enabled evaluator over gitData/plans, folds findings into reportLines, and sets blockError when an enabled gate failed."
      pattern: "resolveGatesConfig|securityGate\\(|brokenWindowsGate\\(|tddAuditGate\\("
---
<objective>
Wire the capability-gate gatekeeper into gsd_ship. Add the pure orchestration seam runCapabilityGates and the injectable git adapter fetchGitData to lib/gates.js, then make gsd_ship run the gates between the gh-auth preflight and the push, emit a Gate Report on every run, and block (fail()) when a required gate fails — delivering CAP-01 and CAP-02 end-to-end.
</objective>
<context>@.planning/phases/GSD-08-capability-gates/GSD-08-capability-gates-CONTEXT.md (decisions D-04, D-05, D-06, D-07, D-08; D-01/D-02/D-03 evaluators built in plan 01)
@.planning/phases/GSD-08-capability-gates/GSD-08-capability-gates-RESEARCH.md (OQ-1, OQ-4, OQ-5, OQ-6 resolutions; git commands; commit-scope convention)
@lib/ship.js (steps 5 gh-auth line 77, 6 push line 80, 7 PR body line 84; fail() line 53; run()/git()/gitOk() helpers lines 19-30)
@lib/gates.js (created in plan 01 — evaluators + resolveGatesConfig to reuse)
@test/gates.test.mjs (created in plan 01 — extend with runCapabilityGates + fetchGitData tests)</context>
<tasks>
<task type="auto">
  <name>Task 1 (TRACER): runCapabilityGates orchestration seam</name>
  <files>lib/gates.js, test/gates.test.mjs</files>
  <read_first>lib/gates.js, test/gates.test.mjs, .planning/phases/GSD-08-capability-gates/GSD-08-capability-gates-CONTEXT.md</read_first>
  <action>Add to lib/gates.js an exported pure function runCapabilityGates({cfg, gitData, plans, skipGates}) where gitData = {changedFiles, contentMap, commitSubjects}. It: (1) calls resolveGatesConfig(cfg, skipGates) for the three gate names; (2) for each enabled gate runs the matching evaluator over gitData/plans and builds one report line — pass: "security: pass", fail: "security: fail — <file>: matched <pattern>" (or broken_windows "…: <marker>" / tdd_audit "…: <reason>" naming planId), skipped: "<gate>: skipped"; (3) returns {reportLines:[...], blockError: null | string} where blockError is set when any enabled gate returned status "fail", to a single string listing each failing gate name with its first finding detail (file+reason), joined across gates. Skipped (disabled/skipped) gates never run and never block. Add unit tests to test/gates.test.mjs: (a) clean data → all three report lines end ": pass", blockError null; (b) a changed file "a/.env" → "security: fail" line and blockError contains "security" and ".env"; (c) content with "TODO" → "broken_windows: fail" and blockError names the file+marker; (d) a tdd plan with only a feat: commit → "tdd_audit: fail" naming the planId and blockError contains "test:"; (e) resolveGatesConfig-disable or skipGates for security → "security: skipped", no block, other gates still reported. Commit atomically as feat(08-02): runCapabilityGates gate orchestration. Use <verify> after writing.</action>
  <verify>cd /var/home/jatyeo/dev/dsh-gsd-bundle && node --test test/gates.test.mjs 2>&1 | tail -20</verify>
  <acceptance_criteria>
    - runCapabilityGates exported from lib/gates.js
    - grep -q "runCapabilityGates\|blockError\|skipped" test/gates.test.mjs
    - node --test test/gates.test.mjs exits 0
    - git log --format=%s -1 shows "feat(08-02):"
  </acceptance_criteria>
  <done>runCapabilityGates turns config + gitData + plans + skipGates into a Gate Report and a blocking message, proven by unit tests.</done>
</task>
<task type="auto">
  <name>Task 2: fetchGitData git adapter</name>
  <files>lib/gates.js, test/gates.test.mjs</files>
  <read_first>lib/gates.js, lib/ship.js (lines 19-30 run/git/gitOk helpers), .planning/phases/GSD-08-capability-gates/GSD-08-capability-gates-RESEARCH.md (git commands)</read_first>
  <action>Add to lib/gates.js an exported function fetchGitData(cwd, gitFn, base) that uses an injectable gitFn(cwd, argsArray) (mirroring ship.js's git() helper; callers pass the execFileSync wrapper) to: (1) resolve base when falsy via gitFn(cwd, ["symbolic-ref","refs/remotes/origin/HEAD","--short"]) stripped of "origin/", defaulting to "main"; (2) mergeBase = gitFn(cwd, ["merge-base","HEAD",base]); (3) changedFiles = gitFn(cwd, ["diff","--name-only","--diff-filter=ACM",mergeBase,"HEAD"]).split("\n").filter(Boolean); (4) contentMap = {} reading each changed file that still exists via await import("node:fs/promises").readFile(path.join(cwd,file),"utf8") in a try/catch (skip unreadable); (5) commitSubjects = gitFn(cwd, ["log","--format=%s",`${mergeBase}..HEAD`]).split("\n").filter(Boolean). Return {changedFiles, contentMap, commitSubjects}. When mergeBase is empty (HEAD==base), changedFiles and commitSubjects are empty arrays. Add unit tests in test/gates.test.mjs using a fake gitFn(cwd, args) that returns canned stdout keyed on args[0]+args[1] ("symbolic-ref"→"origin/main", "merge-base"→"abc", "diff"→"src/a.js\nb/.env", "log"→"test(08-01): a\nfeat(08-01): b"), and a temporary directory on disk holding src/a.js and b/.env, asserting fetchGitData returns changedFiles ["src/a.js","b/.env"], contentMap containing src/a.js's text, and commitSubjects as given. Commit atomically as feat(08-02): fetchGitData adapter.</action>
  <verify>cd /var/home/jatyeo/dev/dsh-gsd-bundle && node --test test/gates.test.mjs 2>&1 | tail -20</verify>
  <acceptance_criteria>
    - fetchGitData exported from lib/gates.js
    - grep -q "fetchGitData\|merge-base\|--diff-filter=ACM" test/gates.test.mjs
    - node --test test/gates.test.mjs exits 0
    - git log --format=%s -1 shows "feat(08-02):"
  </acceptance_criteria>
  <done>fetchGitData produces the phase's changed files, their contents, and commit subjects through an injectable git wrapper, scoped to the merge-base diff (D-04).</done>
</task>
<task type="auto">
  <name>Task 3: wire gates into gsd_ship + skip_gates parameter</name>
  <files>lib/ship.js, lib/gates.js, test/gates.test.mjs</files>
  <read_first>lib/ship.js, lib/gates.js, .planning/phases/GSD-08-capability-gates/GSD-08-capability-gates-CONTEXT.md (D-05/D-06/D-07/D-08)</read_first>
  <action>In lib/ship.js: (1) add to the top: import { runCapabilityGates, fetchGitData } from "./gates.js"; (2) add to the tool parameters schema a skip_gates key: { type: "array", items: { type: "string", enum: ["security","broken_windows","tdd_audit"] }, description: "Capability gates to skip for this run (D-06)." }; (3) in execute, before the push block (which starts at the "── 6. push branch" comment, currently line 79-80), insert a capability-gate step: read cfg = await s.readConfig(cwd); load const plans = await s.listPlans(cwd, args.phase) HERE (move the existing line 84 listPlans call up to this step and reuse the same `plans` variable in step 7's PR body); validate args.skip_gates each member is one of the three known names else fail(\`unknown skip gate "\${name}"\`); const gitData = fetchGitData(cwd, git, defaultBranch); const { reportLines, blockError } = runCapabilityGates({ cfg, gitData, plans, skipGates: args.skip_gates || [] }); log.push("## Gate Report", ...reportLines); if (blockError) fail(blockError). Pass the FULL cfg — never a pre-extracted gates sub-object — because runCapabilityGates (Task 1) and resolveGatesConfig read cfg.gates from the full config; the canonical shape is runCapabilityGates({cfg, gitData, plans, skipGates}) where cfg is the whole config object carrying the nested gates block (D-08: gates:{security:false,...}). This must appear BEFORE the push so a failing required gate aborts before any push/PR I/O (D-05, CAP-02). (4) Confirm the Gate Report is present on every run path (it is unconditional). Extend test/gates.test.mjs with a static wiring check that imports the source text of lib/ship.js and asserts: it contains runCapabilityGates and fetchGitData in the import line, references defaultBranch and listPlans before the "push branch" comment, appends "## Gate Report", calls fail(blockError), and that the runCapabilityGates call passes `cfg` (the full config variable, not `cfg.gates`). Commit atomically as feat(08-02): wire capability gates into gsd_ship.</action>
  <verify>cd /var/home/jatyeo/dev/dsh-gsd-bundle && node --test test/gates.test.mjs 2>&1 | tail -20 && node --test test/service-tools.test.mjs 2>&1 | tail -10</verify>
  <acceptance_criteria>
    - grep -q "runCapabilityGates\|skip_gates\|## Gate Report" lib/ship.js
    - the merge-base/diff/log git calls precede the push line in lib/ship.js (verify by grep of line numbers)
    - node --test test/gates.test.mjs exits 0
    - node --test test/service-tools.test.mjs exits 0 (existing gsd_ship test still green)
    - git log --format=%s -1 shows "feat(08-02):"
  </acceptance_criteria>
  <done>gsd_ship runs the capability gates before push, always reports a Gate Report, rejects unknown skip names, and fails before push when a required gate fails.</done>
</task>
</tasks>

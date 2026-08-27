---
phase: 14-execute-checkpoint
plan: 02
type: execute
wave: 2
depends_on: ["GSD-14-execute-checkpoint-01"]
files_modified: ["lib/execute.js"]
autonomous: true
requirements: ["CQ-04"]
user_setup: []
must_haves:
  truths:
    - "gsd_execute calls the extracted prepareCheckpoint and processCheckpoint helpers instead of inlining the checkpoint logic, and reuses the planIndex runnable set in the wave loop."
    - "The refactor is strictly behavior-preserving: all existing gsd_execute integration tests in test/tools.test.mjs stay green, and the redundant .filter((p) => !p.has_summary) on line 64 is left untouched (D-03)."
  artifacts:
    - path: "lib/execute.js"
      provides: "the refactored gsd_execute that delegates checkpoint prepare/process to lib/_checkpoint.js and reuses idx.runnable"
      min_lines: 40
      exports: ["name", "inject", "apply"]
  key_links:
    - from: "lib/execute.js"
      to: "lib/_checkpoint.js"
      via: "imports prepareCheckpoint, processCheckpoint"
      pattern: "from \"./_checkpoint.js\""
    - from: "lib/execute.js"
      to: "lib/state.js"
      via: "reuses the planIndex runnable set in the wave loop"
      pattern: "idx.runnable.includes"
---
<objective>Wire the extracted helpers into gsd_execute and reuse the planIndex runnable set (per D-02, D-03, D-04). This is a strictly behavior-preserving refactor of lib/execute.js: the prepare path calls prepareCheckpoint, the process path calls processCheckpoint, and the per-wave runnable re-derivation is replaced by intersecting idx.runnable with the wave's plans. The SUMMARY-wins cleanup and its job reconcile stay inline (D-02).</objective>
<context>@lib/execute.js — the file being refactored; prepare path (lines 110-164), process path (lines 196-218), runnable re-derivation (line 91). @lib/_checkpoint.js — the helpers created in plan 01 (prepareCheckpoint, processCheckpoint). @lib/state.js — planIndex (lines 531-552) exposing the runnable set. @test/tools.test.mjs — the gsd_execute integration block (lines 214-509) that must stay green.</context>
<tasks>
  <task type="auto">
    <name>Task 1: Refactor the prepare path to call prepareCheckpoint (tracer)</name>
    <files>lib/execute.js</files>
    <read_first>lib/execute.js, lib/_checkpoint.js</read_first>
    <action>In lib/execute.js, add prepareCheckpoint and processCheckpoint to the import from "./_checkpoint.js" (new import line; keep the existing ./_shared.js import). Inside the runnables map (the async (p) => { ... } callback), replace the entire prepare-path block — the cpSuffix/resumeInstr/checkpointFm declarations, the hasArtifact/readArtifact/parseFrontmatter/validate block, the awaiting gate, and the answer-binding block (execute.js lines 110-164) — with a single call: const prep = await prepareCheckpoint(s, { cwd, phase: args.phase, p, answer: args.answer, decisionId: args.decision_id });. Then: if (prep.awaiting) return { p, awaiting: true, marker: prep.marker };. Otherwise use prep.resumeInstr and prep.checkpointFm in the prompt assembly (lines 165-176) exactly as before — the resumeInstr spread `...(resumeInstr ? [resumeInstr] : [])` must remain. Keep the job append (lines 179-183) unchanged. After the refactor, remove any now-unused imports from the ./_shared.js import list (parseFrontmatter, stringifyFrontmatter, decisionIdFor, awaitingDecision, awaitingMarker) if they are no longer referenced anywhere in execute.js; keep zeroPad, matchesGapClosure, nowIso, resolvePlanDep (resolvePlanDep is still used in the priorSummaries block at line 100).</action>
    <verify>node --check lib/execute.js</verify>
    <acceptance_criteria>
      - grep "prepareCheckpoint" lib/execute.js
      - grep "from \"./_checkpoint.js\"" lib/execute.js
      - node --check lib/execute.js exits 0
    </acceptance_criteria>
    <done>The prepare path delegates to prepareCheckpoint, the awaiting branch still returns the marker-bearing object, and node --check passes.</done>
  </task>
  <task type="auto">
    <name>Task 2: Refactor the process path to call processCheckpoint</name>
    <files>lib/execute.js</files>
    <read_first>lib/execute.js, lib/_checkpoint.js</read_first>
    <action>Inside the results map (the async ({ p, thunk, job }) => { ... } callback), replace the checkpoint branch — the cp validation, the writeArtifact persist, the job reconcile, and the return (execute.js lines 196-218) — with: const cp = r.structured?.checkpoint; if (cp && typeof cp === "object") return await processCheckpoint(s, { cwd, phase: args.phase, p, r, job, log, w });. Keep the SUMMARY-wins cleanup (lines 220-229) and the non-checkpoint job reconcile (lines 230-241) inline exactly as they are — do NOT fold them into processCheckpoint (D-02).</action>
    <verify>node --check lib/execute.js</verify>
    <acceptance_criteria>
      - grep "processCheckpoint" lib/execute.js
      - node --check lib/execute.js exits 0
    </acceptance_criteria>
    <done>The process path delegates to processCheckpoint, the SUMMARY-wins cleanup stays inline, and node --check passes.</done>
  </task>
  <task type="auto">
    <name>Task 3: Reuse the planIndex runnable set in the wave loop (D-04)</name>
    <files>lib/execute.js</files>
    <read_first>lib/execute.js, lib/state.js</read_first>
    <action>Replace the per-wave runnable re-derivation at line 91 — `const runnable = wavePlans.filter((p) => (p.depends_on || []).every((d) => resolvePlanDep(idx.plans, d)?.has_summary));` — with `const runnable = wavePlans.filter((p) => idx.runnable.includes(p));`. Keep the blocked computation on the next line (`const blocked = wavePlans.filter((p) => !runnable.includes(p));`) unchanged so the `skipping ...` log line is preserved. Do NOT modify lib/state.js planIndex and do NOT add a per-wave runnable there (D-04). Confirm resolvePlanDep is still imported and used (the priorSummaries block at line 100) so the import is not removed. Then run the full test suite to confirm the refactor is behavior-preserving (D-03).</action>
    <verify>node --check lib/execute.js && npm test</verify>
    <acceptance_criteria>
      - grep "idx.runnable.includes" lib/execute.js
      - grep "resolvePlanDep" lib/execute.js
      - npm test exits 0 (all tests green, including the test/tools.test.mjs gsd_execute block at lines 214-509)
    </acceptance_criteria>
    <done>The wave loop reuses idx.runnable, resolvePlanDep remains used, and the full test suite passes.</done>
  </task>
</tasks>

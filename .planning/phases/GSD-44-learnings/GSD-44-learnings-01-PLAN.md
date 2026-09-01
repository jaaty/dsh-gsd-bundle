---
phase: 44-learnings
plan: 01
type: tdd
wave: 1
depends_on: []
files_modified:
  - lib/learnings.js
  - lib/_agents.js
  - lib/_capabilities.js
  - lib/state.js
  - test/learnings.test.mjs
autonomous: true
requirements: ["GAP-10"]
user_setup: []
must_haves:
  truths:
    - "gsd_extract_learnings extracts decisions (from CONTEXT.md via parseDecisionEntries) and lessons/patterns/surprises (from the synthesis subagent) into a per-phase {NN}-LEARNINGS.md and a carrying-forward .planning/LEARNINGS.md"
    - "Re-running with force replaces the phase's block in the root file without duplicating; re-running without force short-circuits with an 'already extracted' message (D-06)"
    - "A missing PLAN.md or SUMMARY.md fails fast with a clear error; missing VERIFICATION/REVIEW/COVERAGE degrade to a missing_artifacts note (D-07)"
    - "A subagent fault or malformed output degrades to a decisions-only LEARNINGS.md, never throwing (D-09)"
    - "learnings does not advance STATE — advisory soft gate (D-12)"
  artifacts:
    - path: "lib/learnings.js"
      provides: "the gsd_extract_learnings plugin: pure exported helpers (gather, accumulate/replace, idempotency guard, schema resolver) with NO ctx/fs/git params + an apply() that does all I/O and spawns the synthesis subagent"
      min_lines: 200
      exports: ["apply", "gatherDecisions", "resolveLearningsOutput", "accumulateRootLearnings", "checkIdempotency"]
    - path: "test/learnings.test.mjs"
      provides: "TDD tests for pure helpers, per-phase LEARNINGS.md shape, root accumulation (append + in-place replace), idempotency guard + force, missing-artifact fail-fast + optional degradation, subagent-fault degrade-to-decisions-only, deterministic gather uses parseDecisionEntries"
      min_lines: 200
      exports: []
  key_links:
    - from: "lib/learnings.js"
      to: "lib/state.js"
      via: "apply() writes the per-phase file via s.writeArtifact(cwd, phase, 'LEARNINGS', body) and the root file via s.writeRootLearnings(cwd, content)"
      pattern: "writeRootLearnings"
    - from: "lib/learnings.js"
      to: "lib/_agents.js"
      via: "imports LEARNINGS_SCHEMA and LEARNINGS_PROMPT for the synthesis subagent output validation"
      pattern: "LEARNINGS_SCHEMA"
    - from: "lib/learnings.js"
      to: "lib/_capabilities.js"
      via: "apply() publishes the gsdLearnings capability via ctx.provide('gsdLearnings', buildCapability('gsdLearnings'))"
      pattern: "gsdLearnings"
---

<objective>
Build the core gsd_extract_learnings plugin (lib/learnings.js) with its hybrid engine (deterministic gather + fresh-context synthesis subagent), the LEARNINGS_SCHEMA/LEARNINGS_PROMPT in lib/_agents.js, the gsdLearnings capability descriptor in lib/_capabilities.js, and the root-scoped state accessors + config flag in lib/state.js. This is the full vertical implementation slice — the plugin works end-to-end for the manual gsd_extract_learnings tool path. TDD: the learnings test file is written first (RED), then the implementation makes it pass (GREEN). Per D-14, pure helpers carry NO ctx/fs/git params for direct unit testing, mirroring milestone-audit.js.
</objective>

<context>
@lib/milestone-audit.js
@lib/gap-analysis.js
@lib/_shared.js
@lib/_runner.js
@lib/_git-artifacts.js
@lib/_capabilities.js
@lib/_agents.js
@lib/state.js
@test/milestone-audit.test.mjs
</context>

<tasks>
  <task type="auto">
    <name>Task 1 (test): Write test/learnings.test.mjs — pure helpers + integration + degrade (RED)</name>
    <files>test/learnings.test.mjs</files>
    <read_first>test/milestone-audit.test.mjs, lib/milestone-audit.js, lib/_shared.js, lib/_capabilities.js, lib/state.js</read_first>
    <action>
Create test/learnings.test.mjs modeled on test/milestone-audit.test.mjs (node:test + node:assert/strict, FakeFs + mount-harness, offline only). Import the pure helpers from ../lib/learnings.js (gatherDecisions, resolveLearningsOutput, accumulateRootLearnings, checkIdempotency) and the apply function. Also import parseFrontmatter from ../lib/_shared.js and makeMountCtx/makeExec/CWD/FakeFs from ./helpers/mount-harness.mjs.

Write these test groups (per D-14):

(a) gsdLearnings capability registration + order 53 (D-14a): mount state + core-tools + learnings; assert ctx.provided.has('gsdLearnings'); buildCapability('gsdLearnings').order === 53; buildCapability('gsdLearnings').step === 'learnings'; buildCapability('gsdLearnings').tools equals ['gsd_extract_learnings'].

(b) Per-phase LEARNINGS.md shape (D-14b, D-03): bootstrap a project with gsd_init, seed a phase with CONTEXT.md (containing `- **D-01:** x` / `- **D-02:** y` decision lines), PLAN-01, SUMMARY-01, VERIFICATION; run gsd_extract_learnings({ phase: 1 }); read s.readArtifact(cwd, 1, 'LEARNINGS'); parseFrontmatter; assert frontmatter.phase === 1, frontmatter.project is set, frontmatter.counts has decisions/lessons/patterns/surprises keys, frontmatter.missing_artifacts is an array; assert body matches ## Decisions, ## Lessons, ## Patterns, ## Surprises section headings; assert each decisions entry includes source attribution matching `(source: CONTEXT#decisions)`.

(c) Root accumulation — append + in-place replace (D-14c, D-05): extract phase 1 → read s.readRootLearnings(cwd); parseFrontmatter → phases_extracted contains 1; body has one ## Phase 1 block; extract phase 2 → phases_extracted contains [1, 2] sorted ascending; body has ## Phase 1 then ## Phase 2 (newest last); re-extract phase 1 with force:true → phases_extracted still [1, 2]; body has exactly one ## Phase 1 block (replaced, not duplicated) and one ## Phase 2 block.

(d) Idempotency guard short-circuit + force override (D-14d, D-06): after extracting phase 1, call gsd_extract_learnings({ phase: 1 }) without force → assert the return matches /already extracted/ and the root file is unchanged (compare readRootLearnings before/after); call with force: true → assert it re-extracts and the return does NOT match /already extracted/.

(e) Missing required artifact fail-fast + optional degradation (D-14e, D-07): bootstrap a FRESH phase with CONTEXT.md seeded but PLAN.md NOT seeded at all (do not call s.removeArtifact — it uses real node:fs/promises.unlink and is a no-op against FakeFs, leaving the virtual artifact present) → assert.rejects(runLearnings({ phase: 1 }), /PLAN/). For the SUMMARY case, bootstrap a fresh phase with PLAN seeded but SUMMARY NOT seeded → assert.rejects(/SUMMARY/). For the optional-degradation case, bootstrap a fresh phase with PLAN + SUMMARY seeded but VERIFICATION/REVIEW/COVERAGE NOT seeded → runLearnings resolves; the per-phase LEARNINGS.md frontmatter.missing_artifacts includes the absent artifact names ("VERIFICATION", "REVIEW", "COVERAGE"). If a sub-case needs to drop a single already-seeded artifact, delete the FakeFs entry directly (the harness fs.files.delete(resolvedPath) / re-seed ctx.fs) rather than calling s.removeArtifact.

(f) Subagent-fault degrade-to-decisions-only (D-14f, D-09): mount with a fake subagents factory whose start() throws → runLearnings({ phase: 1 }) RESOLVES (not rejects); read the per-phase LEARNINGS.md; assert ## Decisions is populated with the seeded decisions; assert ## Lessons / ## Patterns / ## Surprises sections are present but empty with an UNAVAILABLE note matching the error cause; assert the return string mentions the degradation. Also test malformed structured output (subagent returns { summary: 'no' } with no lessons/patterns/surprises arrays) → same degrade behavior.

(g) Deterministic gather uses parseDecisionEntries (D-14h): seed CONTEXT.md with `- **D-01:** first` and `- **D-02:** second`; run extraction; assert the decisions category lists both entries verbatim with source attribution CONTEXT#decisions, sorted ascending by D-number.

(h) Pure helpers have no ctx/fs/git params (D-14): import gatherDecisions, resolveLearningsOutput, accumulateRootLearnings, checkIdempotency directly; call each with plain string/object args (no ctx, no fs, no git) and assert they return correctly.

Use a mountLearnings helper modeled on milestone-audit.test.mjs's mountAudit: FakeFs + makeMountCtx({ subagents }) + applyState + applyCoreTools + applyLearnings. Use a fake gitFn (makeFakeGit) so commitArtifacts never hits real git. Use a makeLearningsSubagents controller factory (fail/structured/capture) modeled on makeAuditorSubagents. Seed artifacts via s.writeArtifact. Use s.readRootLearnings to read the root file.
    </action>
    <verify>test -f test/learnings.test.mjs && grep -q "gatherDecisions" test/learnings.test.mjs && grep -q "accumulateRootLearnings" test/learnings.test.mjs && grep -q "checkIdempotency" test/learnings.test.mjs</verify>
    <acceptance_criteria>
      - test/learnings.test.mjs exists and imports from ../lib/learnings.js
      - grep -q "gsdLearnings" test/learnings.test.mjs (capability registration test)
      - grep -q "already extracted" test/learnings.test.mjs (idempotency test)
      - grep -q "writeRootLearnings" test/learnings.test.mjs (root accessor test)
      - grep -q "UNAVAILABLE\|unavailable\|degrade" test/learnings.test.mjs (degrade test)
    </acceptance_criteria>
    <done>test/learnings.test.mjs is written with all eight test groups (a-h) covering D-14a through D-14h, importing the pure helpers and apply from ../lib/learnings.js. Tests are expected to FAIL at this point (RED) because lib/learnings.js does not exist yet.</done>
  </task>

  <task type="auto">
    <name>Task 2 (feat): Implement lib/learnings.js + _agents.js schema/prompt + _capabilities.js descriptor + state.js accessors/config (GREEN)</name>
    <files>lib/learnings.js, lib/_agents.js, lib/_capabilities.js, lib/state.js</files>
    <read_first>lib/milestone-audit.js, lib/gap-analysis.js, lib/_shared.js, lib/_runner.js, lib/_git-artifacts.js, lib/_capabilities.js, lib/_agents.js, lib/state.js, test/learnings.test.mjs</read_first>
    <action>
Implement four files to make test/learnings.test.mjs pass. Mirror lib/milestone-audit.js's structure exactly (D-01, per canonical_refs).

1. lib/_capabilities.js — add "gsdLearnings" to CAPABILITY_KEYS (as the 19th entry, after "gsdMilestoneAudit"). Add a TABLE descriptor after gsdMilestoneAudit: { step: "learnings", role: "step", tools: ["gsd_extract_learnings"], commands: ["gsd-extract-learnings"], order: 53, prereq: [], next: [], produces: ["LEARNINGS.md"], consumes: ["CONTEXT.md", "PLAN.md", "SUMMARY.md", "VERIFICATION.md", "REVIEW.md", "COVERAGE.md"] }. Per D-01.

2. lib/_agents.js — add LEARNINGS_SCHEMA and LEARNINGS_PROMPT after MILESTONE_AUDITOR_SCHEMA/PROMPT. LEARNINGS_SCHEMA: Object.freeze({ type: "object", properties: { lessons: { type: "array", items: { type: "object", properties: { content: { type: "string" }, source: { type: "string" } }, required: ["content", "source"], additionalProperties: false } }, patterns: { type: "array", items: { /* same shape */ } }, surprises: { type: "array", items: { /* same shape */ } } }, required: ["lessons", "patterns", "surprises"], additionalProperties: false }). LEARNINGS_PROMPT: a prompt instructing the gsd-learnings subagent to synthesize lessons/patterns/surprises from the provided deterministic gather (decisions + artifact digest), each item carrying a source attribution (artifact + section), returning only the JSON object. Per D-08, frozen schema discipline (canonical_refs constraint 7).

3. lib/state.js — add writeRootLearnings(cwd, content) and readRootLearnings(cwd) modeled on writeMilestoneArtifact/readMilestoneArtifact (lines 500-510) but writing to `${this._planning(cwd)}/LEARNINGS.md` (project-scoped, NOT phase-scoped — per D-04, pitfall 3). writeRootLearnings routes through this._write → ctx.fs (never raw node:fs/promises, per constraint 4). readRootLearnings routes through this._read. Also add `learnings: false` to the workflow object in _defaultConfig (after validate_phase at line 200), per D-10.

4. lib/learnings.js — the full plugin, mirroring milestone-audit.js:

IMPORTS: defineTool from @deepseek-ai/dsh-tools; nowIso, today, parseFrontmatter, stringifyFrontmatter from ./_shared.js; cwdOf, spawnSubagent from ./_runner.js; commitArtifacts from ./_git-artifacts.js; buildCapability from ./_capabilities.js; LEARNINGS_PROMPT, LEARNINGS_SCHEMA from ./_agents.js; parseDecisionEntries from ./_shared.js.

CONST: name = "gsd-learnings", inject = ["gsdState", "tools", "subagents"] (subagents declared as hard coeffect, mirroring milestone-audit DEGR-07).

PURE HELPERS (exported, NO ctx/fs/git params — per D-14):

- gatherDecisions(contextText): call parseDecisionEntries(contextText); return the array of {id, text} with source attribution "CONTEXT#decisions". Per D-07, D-14h.

- resolveLearningsOutput(structured): validate the subagent's structured output. If structured is not an object, return { lessons: [], patterns: [], surprises: [], degraded: ["lessons", "patterns", "surprises"] }. For each of lessons/patterns/surprises: if the array is present and every entry is { content: string, source: string }, keep it; else degrade that category to [] and add its name to degraded. Return { lessons, patterns, surprises, degraded }. Per D-08 (per-category degrade, never throwing).

- checkIdempotency(rootFrontmatter, phaseNum, force): if rootFrontmatter is null/undefined (no root file), return { skip: false }. If Array.isArray(rootFrontmatter.phases_extracted) and it includes phaseNum and force is not true, return { skip: true, message: `phase ${phaseNum} already extracted — use force to re-extract` }. Else return { skip: false }. Per D-06 (O(1) frontmatter-only read).

- accumulateRootLearnings(rootText, phaseBlock, phaseNum, phaseName, projectCode): parse the existing root LEARNINGS.md frontmatter (phases_extracted) via parseFrontmatter. If rootText is undefined/empty, create a new root file: frontmatter { generated: nowIso(), project_code: projectCode, phases_extracted: [phaseNum] }, a header preamble explaining the file is carrying-forward and auto-maintained, then the phaseBlock. If the root file exists: if phaseNum is in phases_extracted, find and replace the existing `## Phase ${phaseNum}` block (everything from that heading to the next `## Phase` heading or end-of-body) with the new phaseBlock; else append the phaseBlock after the last phase block (newest last). Update phases_extracted to include phaseNum (sorted ascending, deduplicated). Update generated to nowIso(). Re-stringify frontmatter + body. Return the full new content. Per D-04, D-05.

APPLY(ctx): mirrors milestone-audit.js apply():
- gsd = () => ctx.get("gsdState"); ctx.provide("gsdLearnings", buildCapability("gsdLearnings")).
- Register the gsd_extract_learnings tool via defineTool: name "gsd_extract_learnings", description (per D-02: extract-learnings path accumulating decisions/lessons/patterns/surprises), parameters { phase: { type: "number" }, force: { type: "boolean" } }, output { schema: { type: "string" }, render: ... }.
- execute(args, exec): 
  - cwd = cwdOf(exec); s = gsd(); fail-fast guards (D-12): !s → throw "gsdState unavailable"; !(await s.isProject(cwd)) → throw "no .planning/ project"; read roadmap; find phase in roadmap.phases by n === args.phase; if not found → throw "phase N not in ROADMAP".
  - Required artifact check (D-07, REQ-LEARN-01): check for ANY plan file via `if ((await s.listPlans(cwd, phase.n)).length === 0) throw "phase N has no PLAN.md — required (REQ-LEARN-01)"`. Do NOT use hasArtifact("PLAN-01") — a phase whose only plan is PLAN-02 would wrongly pass, and PLAN-01-only would wrongly fail when other plans are missing. For the required SUMMARY check, use `if (!(await s.hasArtifact(cwd, phase.n, "SUMMARY-01"))) throw "phase N has no SUMMARY.md — required (REQ-LEARN-01)"` (SUMMARY-01 is the standard first-plan summary; listPlans-derived summary presence is also acceptable).

  - Idempotency guard (D-06): read rootText = await s.readRootLearnings(cwd); parse frontmatter; call checkIdempotency(parsed, phase.n, args.force); if skip → return the skip message, write nothing.
  
  - Deterministic gather (D-07): read contextText = await s.readArtifact(cwd, phase.n, "CONTEXT"); decisions = contextText ? gatherDecisions(contextText) : []; read planText, summaryText, verificationText, reviewText, coverageText via s.readArtifact (suffixes PLAN-01, SUMMARY-01, VERIFICATION, REVIEW, COVERAGE). Track which optional artifacts are missing → missing_artifacts array.
  
  - Synthesis subagent (D-08): build promptText from LEARNINGS_PROMPT + a <phase_context> block containing the decisions list and a compact artifact digest (the raw text of PLAN/SUMMARY/VERIFICATION/REVIEW/COVERAGE, each labeled). try { const r = await spawnSubagent(ctx, exec, { label: "gsd-learnings", promptText, outputSchema: LEARNINGS_SCHEMA }); resolved = resolveLearningsOutput(r.structured); } catch (e) { resolved = { lessons: [], patterns: [], surprises: [], degraded: [...], cause: e.message }; }. Per D-09 (never throw).
  
  - Build per-phase LEARNINGS.md (D-03): frontmatter { phase: phase.n, project: projectCode, counts: { decisions: decisions.length, lessons: resolved.lessons.length, patterns: resolved.patterns.length, surprises: resolved.surprises.length }, missing_artifacts }. Body: `# Phase ${phase.n} — ${phase.name} - Learnings` + four sections: ## Decisions (each entry: `- **${d.id}:** ${d.text} (source: CONTEXT#decisions)`), ## Lessons (each: `- ${item.content} (source: ${item.source})`), ## Patterns (same), ## Surprises (same). If a category is degraded/empty, emit an UNAVAILABLE note with the cause. stringifyFrontmatter + body.
  
  - Write per-phase file: await s.writeArtifact(cwd, phase.n, "LEARNINGS", full).
  
  - Build the phase block for the root file: a `## Phase ${phase.n} — ${phase.name}` heading + the four categorized subsections (same content as the per-phase body's sections, without the top-level # title).
  
  - Accumulate root (D-05): newRoot = accumulateRootLearnings(rootText, phaseBlock, phase.n, phase.name, projectCode); await s.writeRootLearnings(cwd, newRoot).
  
  - Audit trail (D-12): await s.addDecision(cwd, `Phase ${phase.n}: LEARNINGS.md extracted (decisions: ${decisions.length}, lessons: ${resolved.lessons.length})`). Do NOT call setActivePhase.
  
  - Commit (D-11): const commit = await commitArtifacts(cwd, phase.n, { message: "docs(planning): phase learnings extract", phaseName: phase.name, scope: "learnings" }). No raw git.
  
  - Return a summary string naming the per-phase path, root path, counts, and any degradation cause.

- presentCall: (a) => ({ card: "generic", title: `Extract learnings phase ${a.phase}`, kind: "other", rawInput: { phase: a.phase, force: a.force } }).

Export { name, inject, apply, gatherDecisions, resolveLearningsOutput, accumulateRootLearnings, checkIdempotency }.
    </action>
    <verify>node --test test/learnings.test.mjs 2>&1 | tail -20</verify>
    <acceptance_criteria>
      - grep -q "gsdLearnings" lib/_capabilities.js (capability descriptor added)
      - grep -q "LEARNINGS_SCHEMA" lib/_agents.js (schema added)
      - grep -q "writeRootLearnings" lib/state.js (root accessor added)
      - grep -q "learnings: false" lib/state.js (config flag added)
      - grep -q "gsd_extract_learnings" lib/learnings.js (tool registered)
      - grep -q "gatherDecisions" lib/learnings.js (pure helper exported)
      - grep -q "accumulateRootLearnings" lib/learnings.js (accumulate helper exported)
      - grep -q "checkIdempotency" lib/learnings.js (idempotency helper exported)
      - grep -q "commitArtifacts" lib/learnings.js (shared commit seam used, no raw git)
      - node --test test/learnings.test.mjs exits 0 (all learnings tests pass — GREEN)
      - grep -c "git(" lib/learnings.js returns 0 (no raw git calls, per D-11)
    </acceptance_criteria>
    <done>lib/learnings.js implements the full hybrid plugin (pure helpers + apply), lib/_agents.js has LEARNINGS_SCHEMA/LEARNINGS_PROMPT, lib/_capabilities.js has the gsdLearnings descriptor (order 53), lib/state.js has writeRootLearnings/readRootLearnings + workflow.learnings:false config. test/learnings.test.mjs passes (GREEN). No raw git in learnings.js (D-11). learnings does not advance STATE (D-12). NOTE: adding the 19th CAPABILITY_KEY in this plan intentionally leaves the cross-cutting count/key assertions in test/_capabilities.test.mjs (CAPABILITY_KEYS.length === 18 + 18-key enumeration) and test/render.test.mjs (LOOP_ORDER array + loopSteps(subset) deepEqual now including gsdLearnings at order 53) RED until plan 02 (wave 2) repairs them — this is expected mid-phase, do NOT chase the red suite after wave 1; the full suite goes green once plan 02 lands.</done>
  </task>
</tasks>
# Phase 44: learnings - Context

**Gathered:** 2026-09-01T04:02:59.189Z
**Status:** Ready for planning

<domain>
## Phase Boundary
**In scope:** Add an extract-learnings loop-step plugin that accumulates decisions, lessons, patterns, and surprises from a completed phase's artifacts into a carrying-forward LEARNINGS.md. Full loop-step plugin mirroring lib/milestone-audit.js (hybrid deterministic scan + gated fresh-context subagent) and lib/gap-analysis.js (soft gate, pure-JS scan, no STATE advance): a gsdLearnings capability (order 53, after milestone-audit 52), a gsd_extract_learnings tool, and a /gsd-extract-learnings command. Produces (a) a per-phase {NN}-LEARNINGS.md artefact (upstream-compatible: four categories — decisions, lessons, patterns, surprises — with source attribution, YAML frontmatter with phase/project/counts/missing_artifacts) and (b) accumulates/merges that phase's extract into a single carrying-forward .planning/LEARNINGS.md that persists across phases. Manual gsd_extract_learnings(phase) invocation AND an auto-run at ship:post gated by a new workflow.learnings config flag (default off). Idempotent re-runs via a phases_extracted frontmatter index in the root file (re-running a phase replaces its section, never duplicates). Hybrid engine: deterministic pure-JS gather of decisions (from CONTEXT.md) + the raw artifact corpus (PLAN/SUMMARY/VERIFICATION/REVIEW/COVERAGE), plus a fresh-context gsd-learnings subagent that synthesizes the interpretive lessons/patterns/surprises with schema-validated structured output; a subagent fault or malformed output degrades to a decisions-only section, never throwing. Advisory soft gate — never blocks ship or the next phase, does not advance STATE.
**Out of scope:** Deliberate recall — discuss/plan reading LEARNINGS.md as context — is explicitly deferred to the mempalace phase (GAP-12). External knowledge-base capture (upstream capture_thought MCP hook, REQ-LEARN-03/04) and the ~/.gsd/knowledge/ global store copy (#3683) are OUT of scope and deferred to mempalace (the gsd-mempalace-curator mirrors extract-learnings into the KG). No semantic-search/recall index this phase — the root LEARNINGS.md is plain markdown. No change to gsd_plan/gsd_verify/gsd_ship internals beyond the ship:post auto-run hook and the new config flag. No UI component.
</domain>

<decisions>
## Decisions
### Integration structure
- **D-01:** learnings is a full loop-step plugin mirroring lib/milestone-audit.js: a new gsdLearnings capability in lib/_capabilities.js (order 53, after gsdMilestoneAudit 52), a gsd_extract_learnings tool in a new lib/learnings.js, and a /gsd-extract-learnings command — the defineTool + inject gsdState/tools/subagents + ctx.provide(buildCapability('gsdLearnings')) plugin pattern. order 53 keeps milestone-audit's stable 52 and groups learnings as the final advisory off-loop step; the auto-on-ship trigger is a ship:post hook (D-07), not loopSteps routing, so 53 does not disturb ship→milestone-audit ordering.
- **D-02:** The tool signature is gsd_extract_learnings({ phase, force }) where phase is the phase number to extract from. Manual call extracts/re-extracts one phase; auto-on-ship (D-07) calls it for the just-shipped phase. force bypasses the phases_extracted idempotency guard (D-06) to re-extract even when the phase is already recorded. No TUI dependency; mirrors milestone-audit's plain object args.
### Carry-forward model
- **D-03:** Two outputs per extraction: (a) a per-phase {NN}-LEARNINGS.md written via writeArtifact(cwd, phase, 'LEARNINGS', body) — upstream-compatible, with YAML frontmatter (phase, project, counts per category, missing_artifacts) and four categorized sections each carrying source attribution (artifact + section); (b) a single carrying-forward .planning/LEARNINGS.md at the planning root that accumulates every phase's extract across the project. The per-phase file is the source of truth for one phase; the root file is the cross-phase carrying-forward memory that mempalace (phase 46) will later recall from.
- **D-04:** The root .planning/LEARNINGS.md is written via a new root-scoped accessor (mirroring writeMilestoneArtifact's milestone-scoped pattern) — NOT writeArtifact — because it is project-scoped, not phase-scoped. It carries YAML frontmatter: generated (ISO), project_code, and a phases_extracted array (D-06). Body is one ## Phase <N> — <name> block per extracted phase, newest last, each with the four categorized subsections. A header preamble explains the file is carrying-forward and auto-maintained.
### Idempotency and accumulation
- **D-05:** Accumulation is append-or-replace, never duplicate (mirrors upstream fix-306-learnings-dedupe-index). On extraction of phase N: read the root LEARNINGS.md frontmatter phases_extracted list; if N is absent, append a new ## Phase N block; if N is present, replace the existing ## Phase N block in place (full re-extract semantics, upstream REQ-LEARN-05 'running twice overwrites'). The phases_extracted array is updated/sorted. The per-phase {NN}-LEARNINGS.md is always fully overwritten on re-run.
- **D-06:** Idempotency guard: when gsd_extract_learnings is called for a phase already in phases_extracted and force is false, the tool short-circuits with a clear 'phase N already extracted — use force to re-extract' message and writes nothing (cheap, token-free). force=true re-runs the extraction and replaces the section (D-05). The guard reads only frontmatter, never the whole corpus, so it is O(1) on the common path.
### Extraction engine
- **D-07:** Hybrid engine mirroring milestone-audit's deterministic-scan + gated-subagent split. (1) Deterministic pure-JS gather — no subagent, no tokens — reads the phase's CONTEXT.md decisions (via parseDecisionEntries), SUMMARY.md, VERIFICATION.md, REVIEW.md, COVERAGE.md (and PLAN.md if present), assembles a decisions list (already structured) and a compact artifact digest. Missing required artifacts (PLAN.md or SUMMARY.md, upstream REQ-LEARN-01) fail fast with a clear error listing what is missing; optional artifacts (VERIFICATION/REVIEW/COVERAGE) degrade to a note in missing_artifacts without failing.
- **D-08:** (2) Fresh-context gsd-learnings subagent (spawnSubagent via _agents.js, schema-validated structured output mirroring MILESTONE_AUDITOR_SCHEMA) receives the deterministic gather (decisions + artifact digest) and synthesizes the interpretive categories — lessons, patterns, surprises — each item a string with a source attribution (artifact + section). It does NOT re-derive decisions (those come from the deterministic pass). The structured schema validates an object with arrays lessons/patterns/surprises whose every entry is { content: string, source: string }; a malformed/missing array degrades that category to empty with a note, never throwing.
- **D-09:** Subagent fault handling (never-throw discipline, mirroring milestone-audit D-08): a spawn throw, timeout, or malformed structured output degrades the run to a decisions-only LEARNINGS.md — the decisions section is populated from the deterministic gather, and lessons/patterns/surprises sections are emitted as empty with an UNAVAILABLE note recording the real error cause. The artefacts are still written; the tool returns successfully with the cause reported in its output. This keeps a subagent outage from blocking the phase or losing the deterministic decisions.
### Trigger and config
- **D-10:** Auto-on-ship hook: ship.js gains a best-effort post-PR call to the learnings extraction for the just-shipped phase, gated by a new workflow.learnings boolean in config.json (default false, mirroring the workflow.code_review/ui_review/validate_phase flag pattern in _defaultConfig). When the flag is off (default) ship behaviour is unchanged. The auto-run uses the same code path as the manual tool (degraded to decisions-only on subagent fault — D-09) and NEVER blocks the ship: an extraction failure is caught, logged as a warning with the real cause, and the ship still succeeds. This mirrors upstream features.global_learnings auto-on-completion semantics without the home-dir copy.
- **D-11:** The auto-on-ship run commits the updated .planning/LEARNINGS.md and the per-phase {NN}-LEARNINGS.md via commitArtifacts (the existing .planning-staging seam used by discuss/plan), so the carrying-forward file lands on the phase feature branch alongside the phase's other planning artefacts. The manual tool path also commits via commitArtifacts. No raw git in learnings.js — reuse the shared seam.
### Scope, gate, and error handling
- **D-12:** Soft gate, advisory, never blocks: learnings does not advance STATE (pure report/accumulate, like gap-analysis and milestone-audit). Fail-fast on environmental faults (no .planning/ project, phase not in ROADMAP, no PLAN.md/SUMMARY.md — upstream REQ-LEARN-01) with clear errors mirroring milestone-audit's guards. Degrade-with-flag on subagent/LLM faults (D-09). No new hard state gate introduced this phase.
- **D-13:** Recall wiring is explicitly OUT of scope this phase (D-deferred): discuss.js and planningContext are NOT taught to read LEARNINGS.md. The carrying-forward file is produced only; deliberate recall-before-discuss/plan is mempalace's scope (GAP-12, phase 46). This avoids coupling and keeps the phase bounded; the root LEARNINGS.md is positioned as the substrate mempalace will later consume.
### Testing and TDD
- **D-14:** The phase is TDD: unit tests cover (a) gsdLearnings capability registration + order 53, (b) per-phase {NN}-LEARNINGS.md artefact shape (four categories + source attribution + frontmatter counts/missing_artifacts), (c) root .planning/LEARNINGS.md accumulation — append for a new phase and in-place replace for an already-extracted phase (D-05), (d) phases_extracted idempotency guard short-circuit + force override (D-06), (e) missing required artifact fail-fast (REQ-LEARN-01) and optional-artifact degradation, (f) subagent-fault degrade-to-decisions-only (D-09), (g) auto-on-ship hook gated by workflow.learnings flag + never-blocks-ship on extraction failure (D-10), and (h) the deterministic gather uses parseDecisionEntries for the decisions category. Pure helpers (the gather, the accumulate/replace merge, the idempotency guard, the schema resolver) are exported with NO ctx/fs/git params for direct unit testing, mirroring milestone-audit's aggregateCloseGate/resolveAuditorOutput. Follow test/*.test.mjs + mount-harness conventions.
### Claude's Discretion
- Exact names of helper functions / files inside lib/learnings.js (keep within existing conventions: gather*, accumulate*, resolve* mirroring milestone-audit).
- Precise wording of the LEARNINGS.md header preamble and the per-phase block headings, so long as the four categories, source attribution, and frontmatter (phase/project/counts/missing_artifacts for the per-phase file; generated/project_code/phases_extracted for the root file) are present.
- The exact LEARNINGS_PROMPT framing for the synthesis subagent, provided the structured schema (lessons/patterns/surprises arrays of {content, source}) and the never-throw degrade contract (D-09) hold.
- Whether the auto-on-ship hook commits the root LEARNINGS.md in the same commitArtifacts call as the per-phase file or a follow-up call — either is acceptable so long as both land on the phase branch.
- The default value placement / ordering of the phases_extracted array (numeric-ascending is the expectation).
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Step-plugin pattern to mirror (hybrid deterministic + gated subagent)
- `lib/milestone-audit.js — the full hybrid loop-step plugin: defineTool + inject gsdState/tools/subagents + ctx.provide(buildCapability); pure exported close-gate helpers (aggregateCloseGate, classifyMilestoneStatus, resolveAuditorOutput) with NO ctx/fs/git for direct unit testing; apply() does all I/O; subagent spawn with schema validation + never-throw degrade (D-08). learnings.js mirrors this split exactly.`
- `lib/gap-analysis.js — the soft-gate pure-JS scan pattern (advisory, no STATE advance) and the fail-fast environmental guards learnings reuses for the deterministic gather.`
- `lib/_agents.js — MILESTONE_AUDITOR_PROMPT + MILESTONE_AUDITOR_SCHEMA pattern; learnings adds a LEARNINGS_PROMPT + LEARNINGS_SCHEMA (object with lessons/patterns/surprises arrays of {content, source}) following the same frozen-schema + structured-return discipline.`
### Capability registration and loop rendering
- `lib/_capabilities.js — capability descriptor table and CAPABILITY_KEYS; gsdLearnings added with order 53 (after gsdMilestoneAudit 52), role 'step', tools ['gsd_extract_learnings'], command 'gsd-extract-learnings', produces ['LEARNINGS.md']. buildCapability is the single source of truth (auto-tracked revertible effect).`
- `lib/_render.js — loopSteps() sorts by descriptor.order, so gsdLearnings (53) renders after milestone-audit; nextAction routing finds the first step with strictly greater order. Adding 53 does not disturb ship(50)→milestone-audit(52) ordering.`
### State, artefacts, and the root-scoped write
- `lib/state.js — writeArtifact(cwd, phase, 'LEARNINGS', body) for the per-phase {NN}-LEARNINGS.md; writeMilestoneArtifact milestone-scoped pattern (lines 500-510) is the template for a new writeRootLearnings/carrying-forward root accessor that writes .planning/LEARNINGS.md (project-scoped, not phase-scoped). readArtifact/hasArtifact for the gather. addDecision / parseDecisionEntries for the deterministic decisions gather.`
- `lib/_shared.js — parseFrontmatter/stringifyFrontmatter for the root and per-phase frontmatter; parseDecisionEntries (line 385) for extracting structured decisions from CONTEXT.md.`
- `lib/_git-artifacts.js — ensurePhaseBranch + commitArtifacts: the shared .planning-staging seam used by discuss/plan; both the manual tool and the auto-on-ship hook commit the per-phase and root LEARNINGS files through it (D-11). No raw git in learnings.js.`
### Subagent runtime and config
- `lib/_runner.js — cwdOf + spawnSubagent(ctx, exec, { label, promptText, outputSchema }) used by milestone-audit; learnings reuses it for the gsd-learnings synthesis subagent.`
- `lib/state.js _defaultConfig (lines 183-207) — the workflow.* flag pattern (code_review/ui_review/validate_phase); learnings adds workflow.learnings (default false) here and reads it via readConfig in ship.js for the auto-on-ship gate (D-10).`
### Ship post-hook integration point
- `lib/ship.js — the ship tool apply()/execute body; the auto-on-ship hook (D-10) is a best-effort call after the PR is created and STATE is updated, gated by workflow.learnings, wrapped so an extraction failure never blocks the ship.`
### Upstream contract (WHAT/pattern) — read-only reference, NOT to be vendored
- `.analysis/gsd-core/commands/gsd/extract-learnings.md — upstream /gsd:extract-learnings command contract (objective, argument-hint <phase>, allowed-tools, produces LEARNINGS.md from PLAN/SUMMARY/VERIFICATION/UAT/STATE).`
- `.analysis/gsd-core/docs/features/extract-learnings.md — upstream feature spec: REQ-LEARN-01 (PLAN+SUMMARY required) .. REQ-LEARN-05 (re-run overwrites); four categories decision/lesson/pattern/surprise; source attribution; optional capture_thought (OUT of scope here, D-deferred); features.global_learnings auto-on-completion + ~/.gsd/knowledge copy (OUT of scope, deferred to mempalace).`
- `.analysis/gsd-core/.changeset/archived/fix-306-learnings-dedupe-index.md — the upstream dedupe-index fix that grounds the phases_extracted idempotency design (D-05/D-06).`
### Existing tests
- `test/milestone-audit.test.mjs — the hybrid step-plugin test pattern (pure helpers + apply mount + subagent stub + degrade) to model learnings tests on.`
- `test/*.test.mjs + test/helpers/mount-harness.mjs — the node:test + mount-harness conventions used across the suite.`
</canonical_refs>

<code_context>
## Code Context
- buildCapability in lib/_capabilities.js is the single source of truth; a new gsdLearnings key with order 53, role 'step', tools ['gsd_extract_learnings'], command 'gsd-extract-learnings', produces ['LEARNINGS.md'] auto-renders in loopSteps after milestone-audit (52).
- loopSteps() in _render.js sorts descriptors by descriptor.order; nextAction finds the first step with strictly greater order, so gsdLearnings (53) is advisory-last and does not disturb ship(50)→milestone-audit(52).
- milestone-audit.js exports pure helpers (aggregateCloseGate, classifyMilestoneStatus, resolveAuditorOutput) with NO ctx/fs/git params for direct unit testing; all I/O happens in apply(). learnings.js mirrors this: pure exported gather/merge/idempotency/schema-resolver helpers + an apply() that does I/O + spawns the subagent.
- writeArtifact(cwd, phase, 'LEARNINGS', body) in state.js writes the per-phase <base>-LEARNINGS.md in the phase dir, mirroring CONTEXT/VERIFICATION writes. The root .planning/LEARNINGS.md needs a new project-scoped accessor modeled on writeMilestoneArtifact (state.js 500-510), NOT writeArtifact.
- parseDecisionEntries (lib/_shared.js 385) extracts the structured decisions list from a phase's CONTEXT.md — the deterministic gather's source for the decisions category (D-07, D-14h).
- spawnSubagent(ctx, exec, { label, promptText, outputSchema }) in _runner.js is the fresh-context subagent seam milestone-audit uses; learnings reuses it with a LEARNINGS_SCHEMA (object: lessons/patterns/surprises arrays of {content, source}) defined in _agents.js alongside MILESTONE_AUDITOR_SCHEMA.
- _defaultConfig (state.js 183-207) holds the workflow.* flags (code_review/ui_review/validate_phase/clean_pr_branch); learnings adds workflow.learnings (default false) here and ship.js reads it via readConfig to gate the auto-on-ship hook (D-10).
- commitArtifacts(cwd, phaseNum, opts, gitFn) in _git-artifacts.js is the shared .planning-staging seam; both the manual tool and the ship:post hook commit the per-phase + root LEARNINGS files through it (D-11) — no raw git in learnings.js.
- ship.js apply()/execute is where the best-effort post-PR learnings extraction is hooked (D-10): after STATE is marked shipped, gated by workflow.learnings, wrapped so an extraction fault is logged and never blocks the ship.
</code_context>

<specifics>
## Specifics
- GAP-10 verbatim: 'An extract-learnings path accumulates decisions, lessons, patterns, and surprises from completed phase artifacts into a LEARNINGS.md that carries forward across phases.'
- Four categories are fixed: decisions, lessons, patterns, surprises (upstream + GAP-10).
- Upstream REQ-LEARN-01: PLAN.md and SUMMARY.md are required; the tool exits with a clear error if either is missing. VERIFICATION/REVIEW/COVERAGE are optional and degrade to a missing_artifacts note.
- Upstream REQ-LEARN-02: every extracted item includes source attribution (artifact and section).
- Upstream REQ-LEARN-05: running twice overwrites the previous LEARNINGS (per-phase file fully overwritten; root file replaces the phase's block in place — D-05).
- The carrying-forward file is .planning/LEARNINGS.md at the planning root, project-scoped, with a phases_extracted frontmatter index (D-04/D-06).
- The step is advisory and does not advance STATE; recall/consumption is deferred to mempalace (phase 46) — D-13.
</specifics>

<deferred>
## Deferred Ideas
- Deliberate recall: discuss.js and planningContext reading .planning/LEARNINGS.md as context before discuss/plan — mempalace (GAP-12, phase 46). The gsd-mempalace-curator mirrors extract-learnings into the temporal KG.
- External knowledge-base capture: upstream capture_thought MCP hook (REQ-LEARN-03/04) and the ~/.gsd/knowledge/ global store copy (#3683) — mempalace's domain (GAP-12).
- Semantic search / embedding index over LEARNINGS.md — a later phase; this phase keeps the root file as plain markdown.
- Cross-project / global learnings store and tunnel proposals — mempalace (gsd-mempalace-curator cross_project_tunnels).
</deferred>


---

*Phase: 44-learnings*
*Context gathered: 2026-09-01*
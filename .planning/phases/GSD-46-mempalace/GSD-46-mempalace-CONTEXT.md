# Phase 46: mempalace - Context

**Gathered:** 2026-09-02T21:18:04.912Z
**Status:** Ready for planning

<domain>
## Phase Boundary
**In scope:** Add a mempalace loop-step plugin (mirroring lib/learnings.js and lib/graphify.js) that provides deliberate recall before discuss/plan and verbatim capture at phase boundaries, talking to the MemPalace CLI through an injectable exec seam. Opt-in via mempalace.enabled (default false). Two tools: gsd_mempalace_recall (produces MEMORY-RECALL.md in the phase dir) and gsd_mempalace_capture (files CONTEXT/PLAN/SUMMARY verbatim into the palace). Auto-hooks wired into discuss.js/plan.js/verify.js/ship.js gated by mempalace.enabled, every hook onError: skip so an unreachable palace writes a stub and the loop continues. memory_mode augment implemented fully; kg_backend/replace accepted in config but treated as additive this phase. Config surface: mempalace.enabled, memory_mode, wing, recall_on_discuss, recall_on_plan, capture_artifacts, mirror_kg. A new gsdMempalace capability (order 55, after gsdGraphify 54), a gsd_mempalace_recall + gsd_mempalace_capture tool in a new lib/mempalace.js, and /gsd-mempalace-recall + /gsd-mempalace-capture commands. Node builtins only, no subagent, no MCP.
**Out of scope:** The ship:post curator agent (diary entry, cross-project tunnels, wing-scoped sync pruning — REQ-MP-04) is deferred to a later phase. MCP transport is not used (unusable in this runtime). Full kg_backend/replace mode semantics are deferred — accepted in config but treated as additive. auto_capture_hooks (forward-declared, not functional upstream) is deferred. cross_project_tunnels and diary_journal config keys are deferred with the curator. Cross-mode migration of existing .planning/graphs/ into the palace is out of scope. No change to graphify/learnings internals beyond the new auto-hooks in the loop tools.
</domain>

<decisions>
## Decisions
### Integration structure
- **D-01:** mempalace is a full loop-step plugin mirroring lib/learnings.js and lib/graphify.js: a new gsdMempalace capability in lib/_capabilities.js (order 55, after gsdGraphify 54), two tools gsd_mempalace_recall + gsd_mempalace_capture in a new lib/mempalace.js, and /gsd-mempalace-recall + /gsd-mempalace-capture commands — the defineTool + inject gsdState/tools + ctx.provide(buildCapability('gsdMempalace')) plugin pattern. order 55 keeps graphify's stable 54 and groups mempalace as the final advisory off-loop step; the auto-on-loop hooks are wired into the loop tools (D-07), not loopSteps routing, so 55 does not disturb ship→milestone-audit→learnings→graphify ordering.
- **D-02:** Tool signatures: gsd_mempalace_recall({ phase }) and gsd_mempalace_capture({ phase, artifact }). recall produces MEMORY-RECALL.md in the phase directory; capture files the named artifact verbatim into the palace. No TUI dependency; mirrors learnings' plain object args.
### Config gate
- **D-03:** Opt-in via mempalace.enabled in config.json (default false, mirroring upstream REQ-MP-01). When mempalace.enabled is not explicitly true, both tools print an activation hint (how to enable) and stop WITHOUT writing anything. recall is additionally gated by recall_on_plan/recall_on_discuss; capture by capture_artifacts. The gate reads config via readConfig (the existing shared accessor), never gsd-tools config get-value (which hard-exits on missing keys — upstream anti-pattern).
### Transport and testability
- **D-04:** CLI-only transport via an injectable exec seam mirroring the gitFn pattern in lib/_git-artifacts.js: a mempalaceFn(cwd, argsArray) that defaults to an async promisify(execFile)('mempalace', ...) wrapper. Tests inject a fake mempalaceFn so no real MemPalace install is needed. No MCP (unusable in this runtime). When the CLI is unreachable/absent, write the stub and continue (onError: skip).
### Recall
- **D-05:** recall resolves wing (config.mempalace.wing → project_code → repo directory name), mode (memory_mode, default augment), and runs `mempalace wake-up --wing <wing>` + `mempalace search "<topic>" --wing <wing>` where the topic is derived from the phase CONTEXT.md title/goal/decisions. Distils results into MEMORY-RECALL.md with Prior decisions / Patterns / Surprises sections, each item carrying provenance (drawer id / source). Under augment the palace is an ADDITIVE layer — native memory (.planning/graphs/, LEARNINGS.md, STATE) is read too and treated as authoritative. kg_backend/replace are accepted in config but treated as additive this phase (D-09). Unreachable → write the 'unavailable' stub naming the native fallback so the planner knows memory is not gone.
### Capture
- **D-06:** capture maps artifact → room (CONTEXT.md→decisions, PLAN.md→planning, SUMMARY.md→milestones), stages the artifact VERBATIM under .planning/.mempalace-stage/<room>/<phase-id>/ with a mempalace.yaml room taxonomy (so detect_room() assigns the room — mine has no --room flag), and runs `mempalace mine "$STAGE" --wing <wing>`. Idempotent via mine's content-hash (stable source_file + mtime). Optionally mirrors KG facts (mempalace_kg_add with valid_from = phase date) unless config.mempalace.mirror_kg === false. Never writes lossy summaries — verbatim artifact text only (upstream anti-pattern).
### Hook wiring
- **D-07:** Auto-hooks wired into the loop tools, gated by mempalace.enabled and the relevant sub-key, each wrapped so a fault NEVER blocks the loop step (onError: skip): discuss.js fires recall at discuss:pre and capture at discuss:post; plan.js fires recall at plan:pre and capture at plan:post; verify.js fires capture at verify:post; ship.js fires capture at ship:post. This mirrors the ship:post learnings/graphify hook pattern (best-effort, never-blocking). The standalone gsd_mempalace_recall/capture tools remain for manual invocation.
### Error handling and gate
- **D-08:** Advisory soft gate, never blocks: mempalace does not advance STATE (pure recall/capture, like gap-analysis, milestone-audit, learnings, graphify). Fail-fast on environmental faults (no .planning/ project, phase not in ROADMAP, mempalace disabled) with clear errors mirroring graphify's guards. Never-throw on palace faults: a CLI error/timeout is caught, the stub is written, and the tool returns the real cause in its output. No subagent, so no subagent-fault degrade path is needed (unlike learnings D-09).
### memory_mode
- **D-09:** augment is implemented fully (palace is an additive recall layer alongside native memory, which stays authoritative). kg_backend and replace are accepted in config but treated as additive this phase; full mode semantics are deferred and documented in the tool output and README so a user setting them knows recall stays additive until a later phase.
### Config surface
- **D-10:** Implement mempalace.enabled, memory_mode, wing, recall_on_discuss, recall_on_plan, capture_artifacts, mirror_kg in _defaultConfig (state.js 183-207). Defer cross_project_tunnels, diary_journal (curator), and auto_capture_hooks (forward-declared, not functional upstream) — they are not added to config this phase.
### Testing and TDD
- **D-11:** The phase is TDD: unit tests cover (a) gsdMempalace capability registration + order 55, (b) config gate — disabled prints hint and writes nothing, enabled proceeds (D-03), (c) recall producing MEMORY-RECALL.md from a fake mempalaceFn (wake-up + search) with decisions/patterns/surprises + provenance (D-05), (d) recall stub when the CLI is unreachable (D-08), (e) capture staging + mine with room mapping + verbatim content (D-06), (f) capture idempotency, (g) mirror_kg gating, and (h) auto-hooks in discuss/plan/verify/ship gated by mempalace.enabled and never-blocking on fault (D-07). Pure helpers (resolveWing, resolveMode, buildRecallDoc, buildStub, mapArtifactToRoom, buildStageTree) are exported with NO ctx/fs/git params for direct unit testing. Follow test/*.test.mjs + mount-harness conventions.
### Claude's Discretion
- **D-12:** Exact names of helper functions / files inside lib/mempalace.js (keep within existing conventions: resolve*/build*/map* mirroring learnings and graphify). Precise wording of MEMORY-RECALL.md, the activation-hint message, and the 'unavailable' stub, so long as the config gate (D-03), the recall structure (D-05), and the capture room mapping (D-06) are present. The exact mempalace.yaml room taxonomy content. Whether the auto-hooks commit staged artifacts via commitArtifacts or leave them unstaged — either is acceptable so long as the loop step is never blocked.
### Claude's Discretion
- Exact helper/function names inside lib/mempalace.js within existing conventions.
- Precise wording of MEMORY-RECALL.md, the activation-hint message, and the 'unavailable' stub.
- Exact mempalace.yaml room taxonomy content.
- Whether the auto-hooks commit staged artifacts via commitArtifacts or leave them unstaged.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Step-plugin pattern to mirror (loop-step plugin, advisory soft gate, injectable exec)
- `lib/learnings.js — the most recent full loop-step plugin: defineTool + inject gsdState/tools + ctx.provide(buildCapability); pure exported helpers with NO ctx/fs/git for direct unit testing; apply() does all I/O; ship:post auto-run gated by workflow flag. mempalace.js mirrors this split exactly.`
- `lib/graphify.js — the deterministic pure-JS scan step plugin; mempalace reuses the config-gate + fail-fast-guard + advisory-no-STATE-advance pattern.`
- `lib/_git-artifacts.js — commitArtifacts + the injectable gitFn(cwd, argsArray) seam; mempalace.js mirrors this injectable-exec pattern with mempalaceFn(cwd, argsArray) for testability (D-04).`
### Capability registration and loop rendering
- `lib/_capabilities.js — capability descriptor table and CAPABILITY_KEYS; gsdMempalace added with order 55 (after gsdGraphify 54), role 'step', tools ['gsd_mempalace_recall','gsd_mempalace_capture'], commands ['gsd-mempalace-recall','gsd-mempalace-capture'], produces ['MEMORY-RECALL.md']. buildCapability is the single source of truth (auto-tracked revertible effect).`
- `lib/_render.js — loopSteps() sorts by descriptor.order, so gsdMempalace (55) renders after graphify; nextAction routing finds the first step with strictly greater order. Adding 55 does not disturb ship(50)→milestone-audit(52)→learnings(53)→graphify(54) ordering.`
### State, artefacts, and config
- `lib/state.js — writeArtifact(cwd, phase, ...) for the phase-scoped MEMORY-RECALL.md; readConfig for the mempalace.enabled gate (D-03); _defaultConfig (lines 183-207) where the mempalace.* keys are added (D-10).`
- `lib/_shared.js — parseFrontmatter/stringifyFrontmatter for MEMORY-RECALL.md frontmatter; parseDecisionEntries for deriving the recall topic from CONTEXT decisions (D-05).`
- `lib/_runner.js — cwdOf for the working directory; spawnSubagent is NOT used (no subagent in mempalace).`
### Loop tools where auto-hooks are wired
- `lib/discuss.js — the discuss tool; recall at discuss:pre and capture at discuss:post (D-07).`
- `lib/plan.js — the plan tool; recall at plan:pre and capture at plan:post (D-07).`
- `lib/verify.js — the verify tool; capture at verify:post (D-07).`
- `lib/ship.js — the ship tool; capture at ship:post, mirroring the existing learnings/graphify auto-on-ship hook pattern (D-07).`
### Upstream contract (WHAT/pattern) — read-only reference, NOT to be vendored
- `.analysis/gsd-core/commands/gsd/mempalace-recall.md — upstream recall contract: config gate, wing/mode/transport resolution, MEMORY-RECALL.md structure, anti-patterns (onError: skip, read-only, distil not paste, don't skip the gate).`
- `.analysis/gsd-core/commands/gsd/mempalace-capture.md — upstream capture contract: room mapping, staging + mine (no --room flag, detect_room), mirror_kg, idempotency, anti-patterns (verbatim only, no prune, don't skip gate/dedup).`
- `.analysis/gsd-core/docs/features/mempalace-memory-capability.md — REQ-MP-01..08 (opt-in, recall, capture, curator, memory_mode, onError:skip, MCP-vs-CLI, auto_capture_hooks).`
- `.analysis/gsd-core/docs/CONFIGURATION.md#mempalace-settings — full mempalace.* key schema with types and defaults.`
### Existing tests
- `test/learnings.test.mjs — the most recent step-plugin test pattern (pure helpers + apply mount + config-gated ship hook + never-blocks) to model mempalace tests on.`
- `test/graphify.test.mjs — the deterministic step-plugin test pattern (pure helpers + apply mount + config gate).`
- `test/*.test.mjs + test/helpers/mount-harness.mjs — the node:test + mount-harness conventions used across the suite.`
</canonical_refs>

<code_context>
## Code Context
- buildCapability in lib/_capabilities.js is the single source of truth; a new gsdMempalace key with order 55, role 'step', tools ['gsd_mempalace_recall','gsd_mempalace_capture'], commands ['gsd-mempalace-recall','gsd-mempalace-capture'], produces ['MEMORY-RECALL.md'] auto-renders in loopSteps after graphify (54).
- learnings.js exports pure helpers (gatherDecisions/resolveLearningsOutput/checkIdempotency/accumulateRootLearnings) with NO ctx/fs/git params for direct unit testing; all I/O happens in apply(). mempalace.js mirrors this: pure exported resolveWing/resolveMode/buildRecallDoc/buildStub/mapArtifactToRoom/buildStageTree helpers + an apply() that does I/O.
- commitArtifacts(cwd, phaseNum, opts, gitFn) in lib/_git-artifacts.js is the shared .planning-staging seam with an injectable exec (gitFn). mempalace.js mirrors this with mempalaceFn(cwd, argsArray) defaulting to promisify(execFile)('mempalace', ...) so tests inject a fake CLI (D-04).
- readConfig in state.js returns the full _defaultConfig on a missing/corrupt file; mempalace reads mempalace.enabled through it for the config gate (D-03).
- _defaultConfig (state.js 183-207) holds the workflow.* flags; mempalace adds the mempalace.* block (enabled, memory_mode, wing, recall_on_discuss, recall_on_plan, capture_artifacts, mirror_kg) here (D-10).
- discuss.js/plan.js/verify.js/ship.js are where the auto-hooks are wired (D-07): recall at discuss:pre/plan:pre, capture at discuss:post/plan:post/verify:post/ship:post, each gated by mempalace.enabled and the relevant sub-key, wrapped so a fault never blocks the loop step.
- writeArtifact(cwd, phase, ...) in state.js writes the phase-scoped MEMORY-RECALL.md; the .planning/.mempalace-stage/ staging tree is project-scoped and written via a project-scoped accessor (mirroring writeMilestoneArtifact / learnings' root accessor), NOT writeArtifact.
</code_context>

<specifics>
## Specifics
- GAP-12 verbatim: 'A cross-session memory integration performs deliberate recall before discuss/plan and verbatim capture at phase boundaries.'
- Upstream REQ-MP-01: opt-in via mempalace.enabled: true; default false — the loop is unchanged when unset.
- REQ-MP-02: at plan:pre, recall produces MEMORY-RECALL.md from prior decisions, patterns, and surprises; when MemPalace is unreachable, writes an 'unavailable' stub and continues.
- REQ-MP-03: at discuss:post, plan:post, and verify:post, capture files the phase artifact verbatim into the appropriate room (decisions/planning/milestones); capture is idempotent.
- REQ-MP-06: every hook is onError: skip; no hook carries blocking: true; memory never halts or fails a phase.
- REQ-MP-07: interactive runs prefer MCP tools; headless/cron runs prefer the MemPalace CLI. This bundle is headless/CLI-only (D-04).
- Upstream anti-patterns: do NOT let any MemPalace error fail the step; do NOT write lossy summaries (verbatim only); do NOT prune/delete drawers here (curator's job, deferred); do NOT skip the config gate or the dedup check.
- memory_mode augment is the default; kg_backend/replace are accepted but treated as additive this phase (D-09).
</specifics>

<deferred>
## Deferred Ideas
- The ship:post curator agent (diary entry, cross-project tunnels, wing-scoped sync pruning) — REQ-MP-04, deferred to a later phase.
- MCP transport — not usable in this runtime; CLI-only (D-04).
- Full kg_backend/replace mode semantics — accepted in config but treated as additive this phase (D-09).
- auto_capture_hooks (forward-declared, not functional upstream) — deferred.
- cross_project_tunnels and diary_journal config keys — deferred with the curator.
- Cross-mode migration of existing .planning/graphs/ into the palace — out of scope.
</deferred>


---

*Phase: 46-mempalace*
*Context gathered: 2026-09-02*
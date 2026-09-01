# Phase 45: graphify - Context

**Gathered:** 2026-09-01T05:05:44.319Z
**Status:** Ready for planning

<domain>
## Phase Boundary
**In scope:** Add a graphify loop-step plugin that builds a project knowledge graph in .planning/graphs/ from a pure-JS deterministic scan of .planning/ artefacts, with a gsd_graphify tool exposing build/query/status. Full loop-step plugin mirroring lib/learnings.js and lib/milestone-audit.js (deterministic pure-JS scan, advisory soft gate, no STATE advance): a gsdGraphify capability (order 54, after gsdLearnings 53), a gsd_graphify tool in a new lib/graphify.js, and a /gsd-graphify command. Opt-in via graphify.enabled in config.json (upstream REQ-GRAPH-01 parity): when disabled the tool prints an activation hint and stops without writing. Build produces .planning/graphs/graph.json (nodes/edges/hyperedges with confidence tiers EXTRACTED/INFERRED/AMBIGUOUS) plus a human-readable GRAPH_REPORT.md. Nodes cover phases, plans, requirements (REQ-IDs), decisions (D-IDs), and milestones; edges cover phase→requirement, phase→plan, plan→decision, phase→milestone, and plan depends_on. Status reports mtime-based STALE/FRESH plus commit-based built_at_commit/commit_stale. Optional best-effort ship:post auto-rebuild of the just-shipped phase's graph gated by a new workflow.graphify config flag (default false), never blocking ship. Node builtins only, no subagent, no external CLI.
**Out of scope:** HTML visualization (graph.html) is OUT of scope — no UI component this phase, deferred. The external graphify CLI / AST-extraction engine is NOT used — the build is a pure-JS scan of .planning/ artefacts. diff/snapshot subcommands are deferred (GAP-11 only requires build/query/inspect). Semantic search / embedding index over the graph is deferred. MVP-mode node rendering (upstream green-fill + (MVP) label) is deferred. Deliberate recall/consumption of the graph by other loop steps is deferred to the mempalace phase (GAP-12, phase 46). No change to gsd_plan/gsd_verify/gsd_ship internals beyond the ship:post auto-rebuild hook and the new config flag.
</domain>

<decisions>
## Decisions
### Integration structure
- **D-01:** graphify is a full loop-step plugin mirroring lib/learnings.js and lib/milestone-audit.js: a new gsdGraphify capability in lib/_capabilities.js (order 54, after gsdLearnings 53), a gsd_graphify tool in a new lib/graphify.js, and a /gsd-graphify command — the defineTool + inject gsdState/tools + ctx.provide(buildCapability('gsdGraphify')) plugin pattern. order 54 keeps learnings' stable 53 and groups graphify as the final advisory off-loop step; the auto-on-ship trigger is a ship:post hook (D-07), not loopSteps routing, so 54 does not disturb ship→milestone-audit→learnings ordering.
- **D-02:** The tool signature is gsd_graphify({ action, term }) where action is one of 'build' | 'query' | 'status'. build rebuilds the graph; query <term> searches it; status shows freshness and counts. No diff/snapshot subcommands this phase (GAP-11 only requires build/query/inspect — D-deferred). No TUI dependency; mirrors learnings' plain object args.
### Build engine and graph model
- **D-03:** The build is a pure-JS deterministic scan of .planning/ artefacts — node builtins only, NO subagent, NO external graphify CLI (upstream anti-pattern: do not spawn an agent for graphify). It reads ROADMAP.md, REQUIREMENTS.md, STATE.md, and each phase's CONTEXT.md/PLAN.md to assemble nodes and edges. Nodes: phases, plans, requirements (REQ-IDs), decisions (D-IDs), milestones. Edges: phase→requirement, phase→plan, plan→decision, phase→milestone, and plan depends_on (from PLAN.md frontmatter). Each node/edge carries a confidence tier EXTRACTED (read directly from an artefact) / INFERRED (derived) / AMBIGUOUS (conflicting sources).
- **D-04:** The graph model is project-global (mirroring upstream .planning/graphs/), not per-phase: one graph.json covering the whole project, rebuilt incrementally. The build is idempotent — re-running replaces the graph files wholesale from the current .planning/ state, never accumulating stale nodes. Pure exported helpers (extractNodes, extractEdges, buildGraph, resolveConfidence) carry NO ctx/fs/git params for direct unit testing, mirroring milestone-audit's aggregateCloseGate/resolveAuditorOutput and learnings' gather/merge split.
### Config gate
- **D-05:** Opt-in via graphify.enabled in config.json, mirroring upstream REQ-GRAPH-01. When graphify.enabled is not explicitly true, gsd_graphify prints an activation hint (how to enable) and stops WITHOUT writing anything to .planning/graphs/. The gate reads config via readConfig (the existing shared accessor), never gsd-tools config get-value (which hard-exits on missing keys — upstream anti-pattern). This keeps .planning/graphs/ out of every project until requested.
### Artefacts and visualization
- **D-06:** Build writes two artefacts under .planning/graphs/: (a) graph.json — the machine-readable source of truth with nodes/edges/hyperedges arrays and YAML/JSON frontmatter carrying generated timestamp, built_at_commit, and counts; (b) GRAPH_REPORT.md — a human-readable summary of node/edge counts, per-type breakdown, and the top relationships. No graph.html this phase (D-deferred, no UI component). graph.json is written via a new project-scoped accessor (mirroring writeMilestoneArtifact / learnings' root accessor), NOT writeArtifact, because .planning/graphs/ is project-scoped, not phase-scoped.
### Staleness
- **D-07:** Status reports BOTH freshness measures (upstream parity, they can disagree): (a) mtime-based STALE/FRESH — compares graph.json mtime against the newest .planning/ artefact mtime; (b) commit-based built_at_commit/commit_stale — records the HEAD commit at build time in graph.json frontmatter, and status reports commit_stale as false (rebuilt at HEAD) / true (N commits behind HEAD) / null (unreachable commit or no git). When built_at_commit is null (pre-graphify graph), status omits the source-commit line rather than rendering 'unknown'. Pure helper computeStaleness(graphMeta, headCommit, newestMtime) is exported for unit testing.
### Auto-update hook
- **D-08:** ship.js gains a best-effort post-PR rebuild of the just-shipped phase's graph, gated by a new workflow.graphify boolean in config.json (default false, mirroring the workflow.learnings flag pattern in _defaultConfig). When the flag is off (default) ship behaviour is unchanged. The auto-run uses the same code path as the manual build (D-03) and NEVER blocks the ship: a build failure is caught, logged as a warning with the real cause, and the ship still succeeds. The auto-run commits the updated .planning/graphs/ artefacts via commitArtifacts (the existing .planning-staging seam), so the graph lands on the phase feature branch alongside the phase's other planning artefacts.
- **D-09:** The manual gsd_graphify build path also commits the .planning/graphs/ artefacts via commitArtifacts. No raw git in graphify.js — reuse the shared seam. A failed build leaves the prior valid graph intact (upstream anti-pattern: do NOT delete .planning/graphs/ on failure); the tool reports the error and stops.
### Error handling and gate
- **D-10:** Advisory soft gate, never blocks: graphify does not advance STATE (pure report/build, like gap-analysis, milestone-audit, and learnings). Fail-fast on environmental faults (no .planning/ project, phase not in ROADMAP, graphify disabled) with clear errors mirroring milestone-audit's guards. Never-throw on build faults: a build error is caught, the prior graph is preserved, and the tool returns the real cause in its output. No subagent, so no subagent-fault degrade path is needed (unlike learnings D-09).
- **D-11:** Query behaviour: gsd_graphify({ action: 'query', term }) returns matched nodes grouped by type, each with its edge relationships and confidence tier. No matches → a clear 'No graph matches for <term>' message. Query NEVER spawns a subagent (upstream anti-pattern) and never auto-rebuilds — it reads the existing graph.json and reports. If no graph exists yet, query/status return a clear 'run build first' message.
### Testing and TDD
- **D-12:** The phase is TDD: unit tests cover (a) gsdGraphify capability registration + order 54, (b) build node/edge extraction from a fixture .planning/ tree (phases, plans, requirements, decisions, milestones, depends_on), (c) confidence-tier classification (EXTRACTED/INFERRED/AMBIGUOUS), (d) config gate — disabled prints hint and writes nothing, enabled builds (D-05), (e) staleness computation — mtime STALE/FRESH and commit_stale false/true/null (D-07), (f) query matching grouped by type with edges + confidence, and no-match message (D-11), (g) auto-on-ship hook gated by workflow.graphify flag + never-blocks-ship on build failure (D-08), and (h) failed build preserves the prior graph (D-09). Pure helpers (extractNodes, extractEdges, buildGraph, resolveConfidence, computeStaleness) are exported with NO ctx/fs/git params for direct unit testing. Follow test/*.test.mjs + mount-harness conventions.
### Claude's Discretion
- **D-13:** Exact names of helper functions / files inside lib/graphify.js (keep within existing conventions: extract*/build*/resolve*/compute* mirroring milestone-audit and learnings). Precise wording of the GRAPH_REPORT.md header and the activation-hint message, so long as the config gate (D-05), the node/edge/confidence model (D-03), and the two artefacts (D-06) are present. The exact JSON shape of graph.json (nodes/edges/hyperedges arrays + frontmatter), provided the confidence tiers and built_at_commit are present. Whether the auto-on-ship hook commits the graph artefacts in the same commitArtifacts call as other artefacts or a follow-up call — either is acceptable so long as they land on the phase branch.
### Claude's Discretion
- Exact helper/function names inside lib/graphify.js within existing conventions.
- Precise wording of GRAPH_REPORT.md and the activation-hint message.
- Exact JSON shape of graph.json provided confidence tiers + built_at_commit are present.
- Whether the auto-on-ship hook commits graph artefacts in the same commitArtifacts call or a follow-up.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Step-plugin pattern to mirror (deterministic pure-JS scan, advisory soft gate)
- `lib/learnings.js — the most recent full loop-step plugin: defineTool + inject gsdState/tools + ctx.provide(buildCapability); pure exported gather/merge helpers with NO ctx/fs/git for direct unit testing; apply() does all I/O; ship:post auto-run gated by workflow.learnings (D-08/D-10). graphify.js mirrors this split exactly.`
- `lib/milestone-audit.js — the hybrid deterministic + gated-subagent step plugin; graphify reuses the deterministic-scan + fail-fast-guard + advisory-no-STATE-advance pattern but WITHOUT the subagent (D-03).`
- `lib/gap-analysis.js — the soft-gate pure-JS scan pattern (advisory, no STATE advance) and the fail-fast environmental guards graphify reuses.`
### Capability registration and loop rendering
- `lib/_capabilities.js — capability descriptor table and CAPABILITY_KEYS; gsdGraphify added with order 54 (after gsdLearnings 53), role 'step', tools ['gsd_graphify'], command 'gsd-graphify', produces ['graph.json','GRAPH_REPORT.md']. buildCapability is the single source of truth (auto-tracked revertible effect).`
- `lib/_render.js — loopSteps() sorts by descriptor.order, so gsdGraphify (54) renders after learnings; nextAction routing finds the first step with strictly greater order. Adding 54 does not disturb ship(50)→milestone-audit(52)→learnings(53) ordering.`
### State, artefacts, and the project-scoped write
- `lib/state.js — writeArtifact(cwd, phase, ...) for phase-scoped writes; writeMilestoneArtifact milestone-scoped pattern (lines 500-510) is the template for a new project-scoped accessor that writes .planning/graphs/graph.json and GRAPH_REPORT.md (project-scoped, not phase-scoped — D-06). readArtifact/hasArtifact for the scan. readConfig for the graphify.enabled gate (D-05).`
- `lib/_shared.js — parseFrontmatter/stringifyFrontmatter for graph.json frontmatter; parseDecisionEntries (line 385) for extracting structured decisions (D-IDs) from CONTEXT.md as graph nodes.`
- `lib/_git-artifacts.js — ensurePhaseBranch + commitArtifacts: the shared .planning-staging seam; both the manual build and the auto-on-ship hook commit the .planning/graphs/ artefacts through it (D-08/D-09). No raw git in graphify.js.`
### Config and ship post-hook integration point
- `lib/state.js _defaultConfig (lines 183-207) — the workflow.* flag pattern (code_review/ui_review/validate_phase/learnings); graphify adds workflow.graphify (default false) here and reads it via readConfig in ship.js for the auto-on-ship gate (D-08).`
- `lib/ship.js — the ship tool apply()/execute body; the auto-on-ship hook (D-08) is a best-effort call after the PR is created and STATE is updated, gated by workflow.graphify, wrapped so a build failure never blocks the ship.`
### Upstream contract (WHAT/pattern) — read-only reference, NOT to be vendored
- `.analysis/gsd-core/commands/gsd/graphify.md — upstream /gsd:graphify command contract: build/query/status/diff modes, config gate (graphify.enabled), anti-patterns (no subagent, no run_in_background, don't delete .planning/graphs/ on failure, don't use config get-value).`
- `.analysis/gsd-core/docs/features/knowledge-graph-integration.md — upstream feature spec: REQ-GRAPH-01 (opt-in via graphify.enabled), REQ-GRAPH-02 (subcommands), REQ-GRAPH-03 (build_timeout), REQ-GRAPH-06 (graph_path).`
- `.analysis/gsd-core/docs/features/graphify-commit-based-staleness.md — upstream commit-based staleness design (built_at_commit/commit_stale) grounding D-07.`
- `.analysis/gsd-core/docs/features/state-rebuild-configurable-graph-path.md — upstream graph_path configurability (deferred here).`
### Existing tests
- `test/learnings.test.mjs — the most recent step-plugin test pattern (pure helpers + apply mount + config-gated ship hook + never-blocks) to model graphify tests on.`
- `test/milestone-audit.test.mjs — the hybrid step-plugin test pattern (pure helpers + apply mount).`
- `test/*.test.mjs + test/helpers/mount-harness.mjs — the node:test + mount-harness conventions used across the suite.`
</canonical_refs>

<code_context>
## Code Context
- buildCapability in lib/_capabilities.js is the single source of truth; a new gsdGraphify key with order 54, role 'step', tools ['gsd_graphify'], command 'gsd-graphify', produces ['graph.json','GRAPH_REPORT.md'] auto-renders in loopSteps after learnings (53).
- loopSteps() in _render.js sorts descriptors by descriptor.order; nextAction finds the first step with strictly greater order, so gsdGraphify (54) is advisory-last and does not disturb ship(50)→milestone-audit(52)→learnings(53).
- learnings.js exports pure helpers (gather/merge/idempotency/schema-resolver) with NO ctx/fs/git params for direct unit testing; all I/O happens in apply(). graphify.js mirrors this: pure exported extractNodes/extractEdges/buildGraph/resolveConfidence/computeStaleness helpers + an apply() that does I/O.
- writeArtifact(cwd, phase, ...) in state.js writes phase-scoped artefacts; the project-scoped .planning/graphs/ needs a new accessor modeled on writeMilestoneArtifact (state.js 500-510), NOT writeArtifact (D-06).
- parseDecisionEntries (lib/_shared.js 385) extracts structured decisions (D-IDs) from CONTEXT.md — a graph node source for the deterministic scan (D-03).
- readConfig in state.js returns the full _defaultConfig on a missing/corrupt file; graphify reads graphify.enabled through it for the config gate (D-05).
- _defaultConfig (state.js 183-207) holds the workflow.* flags (code_review/ui_review/validate_phase/learnings); graphify adds workflow.graphify (default false) here and ship.js reads it via readConfig to gate the auto-on-ship hook (D-08).
- commitArtifacts(cwd, phaseNum, opts, gitFn) in _git-artifacts.js is the shared .planning-staging seam; both the manual build and the ship:post hook commit the .planning/graphs/ artefacts through it (D-08/D-09) — no raw git in graphify.js.
- ship.js apply()/execute is where the best-effort post-PR graph rebuild is hooked (D-08): after STATE is marked shipped, gated by workflow.graphify, wrapped so a build fault is logged and never blocks the ship.
</code_context>

<specifics>
## Specifics
- GAP-11 verbatim: 'A project knowledge graph is built in .planning/graphs/ and can be queried and inspected through a graphify tool.'
- Upstream REQ-GRAPH-01: opt-in via graphify.enabled in .planning/config.json; when disabled the tool prints an activation hint and stops without writing.
- Upstream anti-patterns: do NOT spawn an agent for any graphify operation; do NOT pass run_in_background for the build; do NOT delete .planning/graphs/ on a failed build (prior valid graph stays); do NOT use config get-value for the gate (hard-exits on missing keys).
- The graph is project-global in .planning/graphs/ (upstream parity), not per-phase.
- Status reports BOTH mtime STALE/FRESH and commit-based built_at_commit/commit_stale (they can disagree); when built_at_commit is null, omit the source-commit line.
- The step is advisory and does not advance STATE; recall/consumption of the graph by other steps is deferred to mempalace (phase 46).
</specifics>

<deferred>
## Deferred Ideas
- HTML visualization (graph.html) — deferred; no UI component this phase.
- diff/snapshot subcommands — deferred; GAP-11 only requires build/query/inspect.
- External graphify CLI / AST-extraction engine — not used; the build is a pure-JS scan of .planning/ artefacts.
- Semantic search / embedding index over the graph — a later phase.
- MVP-mode node rendering (upstream green-fill + (MVP) label) — deferred.
- Configurable graph_path (upstream REQ-GRAPH-06) — deferred; this phase uses the fixed .planning/graphs/ default.
- Deliberate recall/consumption of the graph by other loop steps — mempalace (GAP-12, phase 46).
</deferred>


---

*Phase: 45-graphify*
*Context gathered: 2026-09-01*
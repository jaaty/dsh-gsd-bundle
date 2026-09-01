---
phase: 45-graphify
plan: 01
type: tdd
wave: 1
depends_on: []
files_modified:
  - lib/graphify.js
  - lib/_capabilities.js
  - lib/state.js
  - test/graphify.test.mjs
autonomous: true
requirements: ["GAP-11"]
user_setup: []
must_haves:
  truths:
    - "gsd_graphify({ action: 'build' }) builds a project-global knowledge graph in .planning/graphs/ (graph.json + GRAPH_REPORT.md) from a deterministic pure-JS scan of ROADMAP/REQUIREMENTS/STATE + each phase's CONTEXT/PLAN, with nodes (phases, plans, requirements, decisions, milestones), edges (phase→requirement, phase→plan, plan→decision, phase→milestone, plan depends_on), and confidence tiers EXTRACTED/INFERRED/AMBIGUOUS (D-03, D-06)"
    - "When graphify.enabled is not explicitly true in config.json, gsd_graphify prints an activation hint and writes NOTHING to .planning/graphs/ (D-05)"
    - "gsd_graphify({ action: 'query', term }) returns matched nodes grouped by type with edge relationships + confidence; no match → 'No graph matches for <term>'; no graph → 'run build first' (D-11)"
    - "gsd_graphify({ action: 'status' }) reports mtime STALE/FRESH and commit-based built_at_commit/commit_stale (false/true/null); when built_at_commit is null the source-commit line is omitted (D-07)"
    - "graphify does not advance STATE — advisory soft gate (D-10)"
    - "A failed build preserves the prior valid graph and returns the real cause (D-09)"
  artifacts:
    - path: "lib/graphify.js"
      provides: "the gsd_graphify plugin: pure exported helpers (extractNodes, extractEdges, buildGraph, resolveConfidence, computeStaleness, queryGraph) with NO ctx/fs/git params + an apply() that does all I/O, reads the config gate, writes the two project-scoped artefacts, and commits via the shared seam"
      min_lines: 200
      exports: ["apply", "extractNodes", "extractEdges", "buildGraph", "resolveConfidence", "computeStaleness", "queryGraph"]
    - path: "test/graphify.test.mjs"
      provides: "TDD tests for pure helpers (no ctx/fs/git), capability registration + order 54, build node/edge extraction from a fixture tree, confidence-tier classification, config gate (disabled hint + writes nothing / enabled builds), staleness computation, query matching + no-match, and failed-build-preserves-prior-graph"
      min_lines: 200
      exports: []
  key_links:
    - from: "lib/graphify.js"
      to: "lib/state.js"
      via: "apply() writes graph.json + GRAPH_REPORT.md via the new project-scoped accessors s.writeGraphArtifact(cwd, name, content) and reads the config gate via s.readConfig(cwd)"
      pattern: "writeGraphArtifact"
    - from: "lib/graphify.js"
      to: "lib/_capabilities.js"
      via: "apply() publishes the gsdGraphify capability via ctx.provide('gsdGraphify', buildCapability('gsdGraphify'))"
      pattern: "gsdGraphify"
    - from: "lib/graphify.js"
      to: "lib/_git-artifacts.js"
      via: "apply() commits the graph artefacts via commitArtifacts(cwd, null, { message: 'docs(planning): graphify build' }) — no raw git (D-09)"
      pattern: "commitArtifacts"
---

<objective>
Build the core gsd_graphify plugin (lib/graphify.js) with its deterministic pure-JS build engine (extractNodes/extractEdges/buildGraph/resolveConfidence/computeStaleness/queryGraph), the gsdGraphify capability descriptor in lib/_capabilities.js (order 54, after gsdLearnings 53), and the project-scoped .planning/graphs/ accessors + workflow.graphify config flag in lib/state.js. This is the full vertical implementation slice — the plugin works end-to-end for the manual gsd_graphify build/query/status tool path. TDD: the graphify test file is written first (RED), then the implementation makes it pass (GREEN). Per D-04/D-12, pure helpers carry NO ctx/fs/git params for direct unit testing, mirroring milestone-audit.js and learnings.js. Per D-03, the build is a pure-JS scan with NO subagent (inject excludes 'subagents', mirroring gap-analysis.js).
</objective>

<context>
@lib/milestone-audit.js
@lib/gap-analysis.js
@lib/learnings.js
@lib/_shared.js
@lib/_git-artifacts.js
@lib/_capabilities.js
@lib/state.js
@test/learnings.test.mjs
@test/milestone-audit.test.mjs
</context>

<tasks>
  <task type="auto">
    <name>Task 1 (test): Write test/graphify.test.mjs — pure helpers + integration (RED)</name>
    <files>test/graphify.test.mjs</files>
    <read_first>test/learnings.test.mjs, test/milestone-audit.test.mjs, lib/milestone-audit.js, lib/gap-analysis.js, lib/_shared.js, lib/_capabilities.js, lib/state.js</read_first>
    <action>
Create test/graphify.test.mjs modeled on test/learnings.test.mjs (node:test + node:assert/strict, FakeFs + mount-harness, offline only). Import the pure helpers from ../lib/graphify.js (extractNodes, extractEdges, buildGraph, resolveConfidence, computeStaleness, queryGraph) and the apply function. Also import parseFrontmatter from ../lib/_shared.js, buildCapability from ../lib/_capabilities.js, and makeMountCtx/makeExec/CWD/FakeFs from ./helpers/mount-harness.mjs.

Write these test groups (per D-12):

(a) gsdGraphify capability registration + order 54 (D-12a): mount state + core-tools + graphify; assert ctx.provided.has('gsdGraphify'); buildCapability('gsdGraphify').order === 54; buildCapability('gsdGraphify').step === 'graphify'; buildCapability('gsdGraphify').tools deepEqual ['gsd_graphify']; buildCapability('gsdGraphify').commands deepEqual ['gsd-graphify']; buildCapability('gsdGraphify').produces deepEqual ['graph.json','GRAPH_REPORT.md'].

(b) Build node/edge extraction from a fixture .planning/ tree (D-12b, D-03): call the pure extractNodes/extractEdges/buildGraph directly with a parsed fixture. Fixture roadmap = { milestoneName: 'M1', version: 'v1.0', phases: [{ n: 1, name: 'p1', goal: 'g1', requirements: ['GAP-11'] }] }; requirements = [{ id: 'GAP-11', text: 'x', complete: false }]; phases = [{ n: 1, name: 'p1', decisions: [{ id: 'D-01', text: 'd1' }], plans: [{ id: 'GSD-45-graphify-01', requirements: ['GAP-11'], depends_on: [], body: '<objective>build it</objective>' }] }]. Assert extractNodes returns nodes of types phase/plan/requirement/decision/milestone with the expected ids (phase-1, GSD-45-graphify-01, GAP-11, decision-1-D-01, milestone-M1). Assert extractEdges returns phase→requirement (phase-1→GAP-11, EXTRACTED), phase→plan (phase-1→GSD-45-graphify-01, EXTRACTED), plan→decision (GSD-45-graphify-01→decision-1-D-01, EXTRACTED because D-01 is declared in the phase decisions), phase→milestone (phase-1→milestone-M1, EXTRACTED). Assert buildGraph({ nodes, edges, hyperedges, builtAtCommit: 'abc123', generated: '2026-01-01T00:00:00Z' }) returns { meta: { generated, built_at_commit: 'abc123', counts: { nodes, edges, hyperedges } }, nodes, edges, hyperedges }.

(c) Confidence-tier classification (D-12c, D-03): test resolveConfidence directly. resolveConfidence({ declared: true, mentioned: false, proseTier: 'INFERRED' }) === 'EXTRACTED'; resolveConfidence({ declared: false, mentioned: true, proseTier: 'INFERRED' }) === 'INFERRED'; resolveConfidence({ declared: false, mentioned: true, proseTier: 'AMBIGUOUS' }) === 'AMBIGUOUS'; resolveConfidence({ declared: false, mentioned: false, proseTier: 'INFERRED' }) === 'AMBIGUOUS'. Also assert a plan→decision edge whose D-ID is NOT in the phase decisions but IS in the plan body gets INFERRED, and a plan→requirement edge whose REQ-ID is NOT in the plan frontmatter requirements but IS in the plan body gets AMBIGUOUS (via extractEdges on a fixture where the plan body mentions D-02 not declared and GAP-12 not in requirements).

(d) Config gate — disabled prints hint + writes nothing; enabled builds (D-12d, D-05): mount state + core-tools + graphify; bootstrap a project via gsd_init (which writes config.json with no graphify key). Run gsd_graphify({ action: 'build' }) → assert the return matches /enable|graphify\.enabled/i (activation hint) and assert NO .planning/graphs/graph.json exists (s.hasGraphArtifact(CWD, 'graph.json') is false). Then write config.json with graphify.enabled true via fs.writeText({ targetKey: `${CWD}/.planning/config.json` }, JSON.stringify({ graphify: { enabled: true } })) and re-run build → assert it builds (return matches /graph/ and s.hasGraphArtifact(CWD, 'graph.json') is true).

(e) Staleness computation (D-12e, D-07): test computeStaleness directly with numeric mtimes. computeStaleness({ built_at_commit: 'abc', mtime: 200 }, 'abc', 100) → { mtime: 'FRESH', built_at_commit: 'abc', commit_stale: false }; computeStaleness({ built_at_commit: 'abc', mtime: 100 }, 'abc', 200) → { mtime: 'STALE', built_at_commit: 'abc', commit_stale: false }; computeStaleness({ built_at_commit: 'abc', mtime: 200 }, 'def', 100) → { mtime: 'FRESH', built_at_commit: 'abc', commit_stale: true }; computeStaleness({ built_at_commit: null, mtime: 200 }, 'abc', 100) → { mtime: 'FRESH', built_at_commit: null, commit_stale: null }; computeStaleness({ built_at_commit: 'abc', mtime: 200 }, null, 100) → { mtime: 'FRESH', built_at_commit: 'abc', commit_stale: null } (no git). Assert the mtime rule: graphMtime >= newestMtime → FRESH, else STALE; null mtime inputs → FRESH.

(f) Query matching grouped by type + no-match message (D-12f, D-11): mount + bootstrap + enable graphify + build. Run gsd_graphify({ action: 'query', term: 'GAP-11' }) → assert the return lists the requirement node grouped by type with its edge relationships and confidence. Run gsd_graphify({ action: 'query', term: 'zzz-nomatch' }) → assert the return matches /No graph matches for zzz-nomatch/. On a fresh mount with no graph built, run gsd_graphify({ action: 'query', term: 'x' }) → assert the return matches /run build first/. Also test the pure queryGraph(graph, term) helper directly: queryGraph({ nodes: [{ id: 'GAP-11', type: 'requirement', label: 'GAP-11', confidence: 'EXTRACTED' }], edges: [], hyperedges: [] }, 'GAP-11') returns a grouped match; queryGraph(..., 'zzz') returns [].

(h) Failed build preserves the prior graph (D-12h, D-09): mount + bootstrap + enable graphify. Seed a prior graph.json via fs.writeText({ targetKey: `${CWD}/.planning/graphs/graph.json` }, JSON.stringify({ meta: { generated: 'old' }, nodes: [], edges: [], hyperedges: [] })). Then wrap fs.writeText so it throws when the target path includes '/graphs/': const orig = fs.writeText.bind(fs); fs.writeText = async (target, content) => { if (String(target.targetKey).includes('/graphs/')) throw new Error('disk full'); return orig(target, content); }. Run gsd_graphify({ action: 'build' }) → assert it RESOLVES (not rejects) and the return matches /disk full/ (real cause surfaced). Assert the on-disk graph.json is unchanged (fs.readText({ targetKey: `${CWD}/.planning/graphs/graph.json` }) still matches /"old"/).

(i) Pure helpers have no ctx/fs/git params (D-12): import extractNodes, extractEdges, buildGraph, resolveConfidence, computeStaleness, queryGraph directly; call each with plain object/string/number args (no ctx, no fs, no git) and assert they return correctly.

Use a mountGraphify helper modeled on learnings.test.mjs's mountLearnings: FakeFs + makeMountCtx({}) + applyState + applyCoreTools + applyGraphify. Use a fake gitFn (makeFakeGit) so commitArtifacts never hits real git. Seed artifacts via s.writeArtifact. Use s.hasGraphArtifact / s.readGraphArtifact to read the graph artefacts. For the config-gate enabled case, write config.json directly via fs.writeText.
    </action>
    <verify>test -f test/graphify.test.mjs && grep -q "extractNodes" test/graphify.test.mjs && grep -q "computeStaleness" test/graphify.test.mjs && grep -q "resolveConfidence" test/graphify.test.mjs && grep -q "queryGraph" test/graphify.test.mjs</verify>
    <acceptance_criteria>
      - test/graphify.test.mjs exists and imports from ../lib/graphify.js
      - grep -q "gsdGraphify" test/graphify.test.mjs (capability registration test)
      - grep -q "graphify.enabled" test/graphify.test.mjs (config gate test)
      - grep -q "run build first" test/graphify.test.mjs (no-graph query/status test)
      - grep -q "No graph matches" test/graphify.test.mjs (no-match message test)
      - grep -q "disk full" test/graphify.test.mjs (failed-build-preserves-prior-graph test)
      - grep -q "commit_stale" test/graphify.test.mjs (staleness test)
    </acceptance_criteria>
    <done>test/graphify.test.mjs is written with all nine test groups (a-i) covering D-12a through D-12i, importing the pure helpers and apply from ../lib/graphify.js. Tests are expected to FAIL at this point (RED) because lib/graphify.js does not exist yet.</done>
  </task>

  <task type="auto">
    <name>Task 2 (feat): Implement lib/graphify.js + _capabilities.js descriptor + state.js accessors/config (GREEN)</name>
    <files>lib/graphify.js, lib/_capabilities.js, lib/state.js</files>
    <read_first>lib/milestone-audit.js, lib/gap-analysis.js, lib/learnings.js, lib/_shared.js, lib/_git-artifacts.js, lib/_capabilities.js, lib/state.js, test/graphify.test.mjs</read_first>
    <action>
Implement three files to make test/graphify.test.mjs pass. Mirror lib/gap-analysis.js's structure (no-subagent deterministic scan, D-03) and lib/milestone-audit.js's pure-helper/apply split (D-04).

1. lib/_capabilities.js — add "gsdGraphify" to CAPABILITY_KEYS (as the 20th entry, after "gsdLearnings"). Add a TABLE descriptor after gsdLearnings: { step: "graphify", role: "step", tools: ["gsd_graphify"], commands: ["gsd-graphify"], order: 54, prereq: [], next: [], produces: ["graph.json", "GRAPH_REPORT.md"], consumes: ["ROADMAP.md", "REQUIREMENTS.md", "STATE.md", "CONTEXT.md", "PLAN.md"] }. Per D-01. Also update the stale "The 15 known capability keys" comment above CAPABILITY_KEYS to read "The 20 known capability keys" and append a line noting graphify (order 54) slots after learnings (53) per phase 45 D-01.

2. lib/state.js — add project-scoped .planning/graphs/ accessors modeled on writeMilestoneArtifact (lines 503-511) and writeRootLearnings (lines 520-528), all routing through this._write/_read → ctx.fs (never raw node:fs/promises):
   - graphsDir(cwd) { return `${this._planning(cwd)}/graphs`; }
   - writeGraphArtifact(cwd, name, content) { const file = `${this.graphsDir(cwd)}/${name}`; await this._write(file, content); return file; }
   - readGraphArtifact(cwd, name) { return this._read(`${this.graphsDir(cwd)}/${name}`); }
   - hasGraphArtifact(cwd, name) { const t = await this.ctx.fs.resolve(`${this.graphsDir(cwd)}/${name}`); return !!(await this.ctx.fs.stat(t)); }
   - newestPlanningMtime(cwd): recursively walk .planning/ via this.ctx.fs.listDir (starting at this._planning(cwd)), stat each file, and return the max numeric mtime among files that expose one, or null when none do (FakeFs stat returns no mtime → null). This is thin I/O feeding the pure computeStaleness (D-07); it is NOT FakeFs-testable (per RESEARCH Risk 1).
   Also add `graphify: false` to the workflow object in _defaultConfig (after `learnings: false` at line 201), per D-08.

3. lib/graphify.js — the full plugin, mirroring gap-analysis.js (no subagent) + milestone-audit.js (pure-helper/apply split):

IMPORTS: defineTool from @deepseek-ai/dsh-tools; nowIso, today, parseFrontmatter, stringifyFrontmatter, parseDecisionEntries from ./_shared.js; cwdOf from ./_runner.js; commitArtifacts from ./_git-artifacts.js; buildCapability from ./_capabilities.js.

CONST: name = "gsd-graphify", inject = ["gsdState", "tools"] (NO 'subagents' — D-03, mirroring gap-analysis.js:25).

PURE HELPERS (exported, NO ctx/fs/git params — per D-04/D-12):

- extractNodes({ roadmap, requirements, phases }): roadmap = { milestoneName, version, phases: [{ n, name, goal, requirements: [REQ-ID] }] }; requirements = [{ id, text, complete }]; phases = [{ n, name, decisions: [{ id, text }], plans: [{ id, requirements, depends_on, body }] }]. Returns an array of node objects { id, type, label, confidence }. Node ids: milestone → `milestone-${slugify(milestoneName)}` (type 'milestone', EXTRACTED); phase → `phase-${n}` (type 'phase', EXTRACTED); plan → plan.id (type 'plan', EXTRACTED); requirement → REQ-ID (type 'requirement', EXTRACTED); decision → `decision-${n}-${DID}` (type 'decision', EXTRACTED). label is a human string (e.g. phase name, plan id, REQ-ID, D-ID, milestone name).

- extractEdges({ roadmap, phases }): phases = [{ n, name, decisions: [{ id }], plans: [{ id, requirements, depends_on, body }] }]. Returns an array of edge objects { from, to, type, confidence }. Edges: phase→requirement (from `phase-${n}`, to REQ-ID, type 'phase_requirement', EXTRACTED) for each REQ-ID in roadmap.phases[n].requirements; phase→plan (from `phase-${n}`, to plan.id, type 'phase_plan', EXTRACTED); phase→milestone (from `phase-${n}`, to `milestone-${slugify(milestoneName)}`, type 'phase_milestone', EXTRACTED); plan depends_on (from plan.id, to depId, type 'plan_depends_on', EXTRACTED) for each depId in plan.depends_on; plan→decision (from plan.id, to `decision-${n}-${DID}`, type 'plan_decision', confidence = resolveConfidence({ declared: DID is in the phase's decisions, mentioned: the plan body contains the whole-word D-ID, proseTier: 'INFERRED' })) for each D-ID mentioned in the plan body OR declared in the phase decisions. Also plan→requirement edges (from plan.id, to REQ-ID, type 'plan_requirement', confidence = resolveConfidence({ declared: REQ-ID is in plan.requirements, mentioned: the plan body contains the whole-word REQ-ID, proseTier: 'AMBIGUOUS' })) for each REQ-ID mentioned in the plan body OR in plan.requirements.

- resolveConfidence({ declared, mentioned, proseTier }): return 'EXTRACTED' when declared is true; else return proseTier when mentioned is true; else return 'AMBIGUOUS'. Pure classifier (D-03/D-13).

- buildGraph({ nodes, edges, hyperedges, builtAtCommit, generated }): return { meta: { generated, built_at_commit: builtAtCommit, counts: { nodes: nodes.length, edges: edges.length, hyperedges: hyperedges.length } }, nodes, edges, hyperedges }. Pure assembler (D-06/D-13).

- computeStaleness(graphMeta, headCommit, newestMtime): graphMeta = { built_at_commit, mtime }. Return { mtime, built_at_commit, commit_stale } where: mtime = (graphMeta.mtime == null || newestMtime == null) ? 'FRESH' : (graphMeta.mtime >= newestMtime ? 'FRESH' : 'STALE'); built_at_commit = graphMeta.built_at_commit ?? null; commit_stale = (built_at_commit == null || headCommit == null) ? null : (built_at_commit === headCommit ? false : true). Pure (D-07).

- queryGraph(graph, term): graph = { nodes, edges, hyperedges }. Return an array grouped by node type: for each node whose id or label contains term (case-insensitive), produce { type, matches: [{ id, label, confidence, edges: [the edges where from===node.id or to===node.id, each { from, to, type, confidence }] }] }, grouped by node.type. Return [] when no node matches. Pure (D-11).

APPLY(ctx): mirrors gap-analysis.js apply():
- gsd = () => ctx.get("gsdState"); ctx.provide("gsdGraphify", buildCapability("gsdGraphify")).
- Register the gsd_graphify tool via defineTool: name "gsd_graphify", description (per D-02: build/query/status a project knowledge graph in .planning/graphs/), parameters { action: { type: "string", enum: ["build", "query", "status"], required: true }, term: { type: "string" } }, output { schema: { type: "string" }, render: ... }.
- execute(args, exec):
  - cwd = cwdOf(exec); s = gsd(); fail-fast guards (D-10): !s → throw "gsd_graphify: gsdState service unavailable"; !(await s.isProject(cwd)) → throw "gsd_graphify: no .planning/ project — run gsd_init first"; roadmap = await s.readRoadmap(cwd); if (!roadmap) throw "gsd_graphify: unreadable ROADMAP.md".
  - Config gate (D-05): cfg = await s.readConfig(cwd); if (cfg?.graphify?.enabled !== true) return the activation hint string (how to enable: set graphify.enabled: true in .planning/config.json) and STOP — write nothing. This is the FIRST action after the guards, before any scan or write.
  - For action 'status' or 'query': read graphText = await s.readGraphArtifact(cwd, 'graph.json'); if (graphText === undefined) return "gsd_graphify: no graph built yet — run 'build' first". For 'query': parse graphText as JSON; const matches = queryGraph(graph, args.term); if (matches.length === 0) return `No graph matches for ${args.term}`; else render the grouped matches (each type heading + each match's id/label/confidence + its edges). For 'status': parse graphText; headCommit = await defaultGitFn(cwd, ["rev-parse", "HEAD"]) wrapped in try/catch (no git → null); newestMtime = await s.newestPlanningMtime(cwd); const staleness = computeStaleness({ built_at_commit: graph.meta?.built_at_commit ?? null, mtime: <graph.json mtime via s.ctx.fs.stat, or null> }, headCommit, newestMtime); render counts from graph.meta.counts + the staleness; when built_at_commit is null, OMIT the source-commit line (D-07).
  - For action 'build': wrap the whole build+write in try/catch (D-09/D-10 never-throw on build faults). Inside: read requirements = await s.readRequirements(cwd); state = await s.readState(cwd); for each roadmap phase, read CONTEXT via s.readArtifact(cwd, phase.n, "CONTEXT") and parse decisions via parseDecisionEntries, and read each plan via s.listPlans(cwd, phase.n) + s.readArtifact(cwd, phase.n, "PLAN-" + zeroPad(Number(p.plan))) (parse frontmatter for requirements/depends_on, body for prose). Assemble the parsed data structures. headCommit = await defaultGitFn(cwd, ["rev-parse", "HEAD"]) wrapped in try/catch (no git → null). const nodes = extractNodes({ roadmap, requirements, phases }); const edges = extractEdges({ roadmap, phases }); const hyperedges = buildHyperedges({ roadmap, phases }) (one per phase connecting `phase-${n}` to all its REQ-IDs, type 'phase_requirements', EXTRACTED; one per milestone connecting `milestone-${slugify(milestoneName)}` to all its phase ids, type 'milestone_phases', EXTRACTED); const graph = buildGraph({ nodes, edges, hyperedges, builtAtCommit: headCommit, generated: nowIso() }); write graph.json via s.writeGraphArtifact(cwd, 'graph.json', JSON.stringify(graph, null, 2) + "\n"); write GRAPH_REPORT.md via s.writeGraphArtifact(cwd, 'GRAPH_REPORT.md', <human-readable summary: node/edge counts, per-type breakdown, top relationships>). On catch (e): return "gsd_graphify: build failed: " + (e && e.message ? e.message : String(e)) — the prior graph.json on disk is untouched because we only write on success (D-09).
  - Audit trail (D-10): await s.addDecision(cwd, `Graphify: graph built (nodes: ${nodes.length}, edges: ${edges.length})`). Do NOT call setActivePhase.
  - Commit (D-09): const commit = await commitArtifacts(cwd, null, { message: "docs(planning): graphify build" }). No raw git.
  - Return a summary string naming the graph.json + GRAPH_REPORT.md paths, the counts, and the commit note.

- presentCall: (a) => ({ card: "generic", title: "Graphify " + (a.action || "build"), kind: "other", rawInput: { action: a.action, term: a.term } }).

Export { name, inject, apply, extractNodes, extractEdges, buildGraph, resolveConfidence, computeStaleness, queryGraph }.
    </action>
    <verify>node --test test/graphify.test.mjs 2>&1 | tail -20</verify>
    <acceptance_criteria>
      - grep -q "gsdGraphify" lib/_capabilities.js (capability descriptor added)
      - grep -q "writeGraphArtifact" lib/state.js (project-scoped accessor added)
      - grep -q "newestPlanningMtime" lib/state.js (mtime accessor added)
      - grep -q "graphify: false" lib/state.js (workflow.graphify config flag added)
      - grep -q "gsd_graphify" lib/graphify.js (tool registered)
      - grep -q "extractNodes" lib/graphify.js (pure helper exported)
      - grep -q "computeStaleness" lib/graphify.js (staleness helper exported)
      - grep -q "queryGraph" lib/graphify.js (query helper exported)
      - grep -q "commitArtifacts" lib/graphify.js (shared commit seam used, no raw git)
      - node --test test/graphify.test.mjs exits 0 (all graphify tests pass — GREEN)
      - grep -c "git(" lib/graphify.js returns 0 (no raw git calls, per D-09)
    </acceptance_criteria>
    <done>lib/graphify.js implements the full plugin (pure helpers + apply), lib/_capabilities.js has the gsdGraphify descriptor (order 54), lib/state.js has the project-scoped .planning/graphs/ accessors + workflow.graphify:false config. test/graphify.test.mjs passes (GREEN). No raw git in graphify.js (D-09). graphify does not advance STATE (D-10). NOTE: adding the 20th CAPABILITY_KEY in this plan intentionally leaves the cross-cutting count/key assertions in test/_capabilities.test.mjs (CAPABILITY_KEYS.length === 19 + 19-key enumeration), test/mount.test.mjs (tool/command/capability counts + snapshot regex + subs list), test/render.test.mjs (LOOP_ORDER + without list), and test/removal.test.mjs (STEP_CAPS now includes gsdGraphify with no PATCH_ROWS entry yet) RED until plan 02 (wave 2) repairs them — this is expected mid-phase, do NOT chase the red suite after wave 1; the full suite goes green once plan 02 lands.</done>
  </task>
</tasks>

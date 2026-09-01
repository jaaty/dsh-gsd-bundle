I have everything I need. Here is the complete RESEARCH.md.

---

# GSD-45-graphify — Phase Research

**Researched:** 2026-09-01
**Phase goal:** Add a project knowledge graph built in `.planning/graphs/` with a tool to build, query, and inspect it (GAP-11).

---

## 1. Domain analysis

### 1.1 What this phase is (and is not)

This phase adds a **full loop-step plugin** that mirrors `lib/learnings.js` and `lib/milestone-audit.js`: a `gsdGraphify` capability (order 54), a `gsd_graphify` tool in a new `lib/graphify.js`, and a `/gsd-graphify` command. The build is a **deterministic pure-JS scan** of `.planning/` artefacts — node builtins only, **no subagent, no external graphify CLI** (D-03). It is an **advisory soft gate**: it never advances STATE (D-10), like gap-analysis / milestone-audit / learnings. It is **opt-in** via `graphify.enabled` in `config.json` (D-05, upstream REQ-GRAPH-01 parity). [VERIFIED: lib/learnings.js:1-29, lib/milestone-audit.js:1-29, lib/gap-analysis.js:1-25, CONTEXT.md D-01/D-03/D-05/D-10]

**Confidence: HIGH** — the plugin pattern, the pure-helper split, the config gate, the commit seam, and the ship post-hook are all established, in-repo precedents that this phase copies verbatim.

### 1.2 The step-plugin pattern to mirror (the single most important domain fact)

Every loop-step plugin follows the same shape. `lib/learnings.js` is the closest analog (most recent, pure-helper split, config-gated ship hook). The structure is: [VERIFIED: lib/learnings.js:31-41, 182-337]

- `const name = "gsd-<slug>"`; `const inject = [...]`; `export { name, inject, apply }`.
- **Pure exported helpers** with NO `ctx`/`fs`/`git` params (unit-testable directly): learnings exports `gatherDecisions`, `resolveLearningsOutput`, `checkIdempotency`, `accumulateRootLearnings` (lib/learnings.js:50-152). graphify mirrors this with `extractNodes`, `extractEdges`, `buildGraph`, `resolveConfidence`, `computeStaleness` (D-04/D-12).
- **`apply(ctx)`** does ALL I/O: `ctx.provide("gsdLearnings", buildCapability("gsdLearnings"))` (lib/learnings.js:187), then `ctx.tools.register(defineTool({...}))` (lib/learnings.js:189).
- The tool's `execute(args, exec)` runs fail-fast environmental guards, does the work, writes artefacts via `gsdState` accessors, records a decision via `s.addDecision` (never `setActivePhase`), and commits via `commitArtifacts` (lib/learnings.js:313-323).

**Critical difference for graphify:** learnings and milestone-audit spawn a subagent, so their `inject` includes `"subagents"` (lib/learnings.js:41, lib/milestone-audit.js:41). **graphify spawns NO subagent** (D-03, upstream anti-pattern), so its `inject` must be `["gsdState", "tools"]` — exactly like `lib/gap-analysis.js:25` (which is also a no-subagent deterministic scan). This matters for DEGR-07 (coeffect activation) and for the removal test. [VERIFIED: lib/gap-analysis.js:21-25, CONTEXT.md D-03]

### 1.3 The pure-helper / apply() split (D-04, D-12)

The pure helpers carry NO ctx/fs/git params so they are unit-testable directly. This means the graph **build logic** (extract nodes/edges, classify confidence, assemble graph.json) must operate on **parsed data structures**, not on the filesystem. The `apply()` reads the artefacts via `gsdState` accessors and passes parsed data into the pure helpers. This mirrors milestone-audit's `aggregateCloseGate({ phases, requirements, verifications })` (lib/milestone-audit.js:52) and learnings' `gatherDecisions(contextText)` (lib/learnings.js:50). [VERIFIED: lib/milestone-audit.js:43-96, lib/learnings.js:43-152, CONTEXT.md D-04/D-12]

### 1.4 The data sources and their shapes (for the graph build)

The build reads ROADMAP.md, REQUIREMENTS.md, STATE.md, and each phase's CONTEXT.md/PLAN.md (D-03). The parsed shapes available from `gsdState`:

- **`readRoadmap(cwd)`** → `{ milestone, milestoneName, version, phases: [{ n, slug, name, goal, requirements: [REQ-ID], status }] }`. [VERIFIED: lib/_shared.js:179-210, lib/state.js:357-361]
- **`readRequirements(cwd)`** → `[{ id, text, complete }]`. [VERIFIED: lib/_shared.js:239-246, lib/state.js:367-370]
- **`readState(cwd)`** → `{ frontmatter: { milestone, milestone_name, status, active_phase, ... }, body }`. [VERIFIED: lib/state.js:210-222, 268]
- **`listPlans(cwd, phaseNum)`** → `[{ plan, phase, id, wave, requirements, depends_on, type, status, objective, ... }]` — `depends_on` and `requirements` come from PLAN.md frontmatter. [VERIFIED: lib/state.js:599-633]
- **`readArtifact(cwd, phaseNum, "CONTEXT")`** → CONTEXT.md text; D-IDs via `parseDecisionEntries` (lib/_shared.js:385-397). [VERIFIED: lib/state.js:575-578, lib/_shared.js:385-397]
- **`readArtifact(cwd, phaseNum, "PLAN-<PP>")`** → PLAN.md text; `depends_on` from frontmatter. [VERIFIED: lib/state.js:575-578]

**Confidence: HIGH** — all shapes read directly from the source-of-truth files this session.

### 1.5 The graph model (D-03, D-06)

- **Nodes:** phases, plans, requirements (REQ-IDs), decisions (D-IDs), milestones.
- **Edges:** phase→requirement, phase→plan, plan→decision, phase→milestone, plan `depends_on`.
- **Confidence tiers:** `EXTRACTED` (read directly from an artefact field) / `INFERRED` (derived) / `AMBIGUOUS` (conflicting sources).
- **Project-global** in `.planning/graphs/` (not per-phase), rebuilt idempotently (re-run replaces wholesale, never accumulates stale nodes). [VERIFIED: CONTEXT.md D-03/D-04]

**Recommended confidence mapping (Claude's Discretion D-13):**
- `EXTRACTED`: phase node (ROADMAP), requirement node (REQUIREMENTS), decision node (CONTEXT#decisions), plan node (PLAN.md), milestone node (ROADMAP milestoneName); phase→requirement (ROADMAP phase.requirements), phase→plan (plan's phase dir), phase→milestone (ROADMAP milestoneName), plan `depends_on` (PLAN frontmatter).
- `INFERRED`: plan→decision edge when a plan body mentions a D-ID (derived from prose, not a declared field).
- `AMBIGUOUS`: a requirement/D-ID referenced in a plan body but NOT declared in the phase's ROADMAP requirements / CONTEXT (conflicting sources — the plan claims a relationship the roadmap doesn't declare).

**Confidence: MEDIUM** — the tier *set* is locked (D-03); the exact per-edge classification is Claude's Discretion (D-13) and should be pinned in the plan so tests are deterministic.

### 1.6 The two artefacts (D-06)

- **`graph.json`** — machine-readable source of truth: `nodes`/`edges`/`hyperedges` arrays plus a `meta`/frontmatter block carrying `generated` timestamp, `built_at_commit`, and counts. **Recommended shape** (Claude's Discretion D-13): a JSON object `{ meta: { generated, built_at_commit, counts }, nodes: [], edges: [], hyperedges: [] }`. The `meta.built_at_commit` is what status reads.
- **`GRAPH_REPORT.md`** — human-readable summary: node/edge counts, per-type breakdown, top relationships.

Both are **project-scoped** (`.planning/graphs/`), so they are written via a **new project-scoped accessor** modeled on `writeMilestoneArtifact` (lib/state.js:503-511), NOT `writeArtifact` (which resolves into the per-phase dir). [VERIFIED: lib/state.js:503-511, 568-573, CONTEXT.md D-06]

### 1.7 The config gate (D-05)

`graphify.enabled` must be **explicitly `true`** in `config.json` for the tool to do anything. Read via `readConfig` (the shared accessor, lib/state.js:382-386), **never** `gsd-tools config get-value` (upstream anti-pattern — hard-exits on missing keys). When disabled, the tool prints an activation hint and stops **without writing anything** to `.planning/graphs/`. The current project `config.json` has no `graphify` key, so the gate is disabled by default. [VERIFIED: lib/state.js:382-386, .planning/config.json, CONTEXT.md D-05]

### 1.8 Staleness (D-07)

Status reports BOTH freshness measures (they can disagree):
- **mtime-based STALE/FRESH** — compares `graph.json` mtime against the newest `.planning/` artefact mtime.
- **commit-based `built_at_commit`/`commit_stale`** — records HEAD commit at build time in graph.json meta; status reports `commit_stale` as `false` (rebuilt at HEAD) / `true` (N commits behind) / `null` (unreachable commit or no git). When `built_at_commit` is null, omit the source-commit line (never render "unknown").

Pure helper `computeStaleness(graphMeta, headCommit, newestMtime)` is exported for unit testing (D-07/D-12). The mtime gathering and HEAD read are I/O in `apply()`. [VERIFIED: CONTEXT.md D-07, .analysis/gsd-core/docs/features/graphify-commit-based-staleness.md:11-27]

**HEAD read:** D-09 says "no raw git in graphify.js — reuse the shared seam." The shared git seam is `defaultGitFn` from `lib/_git-artifacts.js` (lib/_git-artifacts.js:28-30). `apply()` calls `defaultGitFn(cwd, ["rev-parse", "HEAD"])` wrapped in try/catch (no git → null) and passes the result to `computeStaleness`. This is consistent with the "reuse the shared seam" rule. [VERIFIED: lib/_git-artifacts.js:28-30, CONTEXT.md D-09]

### 1.9 The ship auto-on-ship hook (D-08)

`lib/ship.js` already has the exact precedent: `runLearningsOnShip({ cfg, tools, phase, exec })` (lib/ship.js:67-77), a PURE exported helper gated by `cfg.workflow.learnings`, that finds the registered tool and invokes it, wrapped so a fault never blocks the ship. It is hooked at step 10.5 (lib/ship.js:332-339) and exported (lib/ship.js:348). graphify mirrors this with `runGraphifyOnShip({ cfg, tools, exec })` — **no `phase` param** because the graph is project-global — gated by `cfg.workflow.graphify`, finding the `gsd_graphify` tool and invoking `{ action: 'build' }`. [VERIFIED: lib/ship.js:54-77, 332-339, 348, CONTEXT.md D-08]

### 1.10 The `workflow.graphify` config flag (D-08)

`_defaultConfig` (lib/state.js:183-208) holds the `workflow.*` flags; `workflow.learnings: false` is at line 201. graphify adds `workflow.graphify: false` after it. `ship.js` reads it via `readConfig` to gate the auto-on-ship hook. [VERIFIED: lib/state.js:183-208, CONTEXT.md D-08]

### 1.11 The command layer (D-01)

`lib/commands.js` has a `COMMANDS` array; each entry `{ name, description, hint, build }`. The `commandToCapability` map is **auto-derived** from each capability descriptor's `commands` array (lib/commands.js:308-311), so adding `commands: ["gsd-graphify"]` to the `gsdGraphify` descriptor automatically wires the `/gsd-graphify` command to the capability (DEGR-03 reactive unregistration). The command entry mirrors the `gsd-extract-learnings` entry (lib/commands.js:275-288). [VERIFIED: lib/commands.js:275-311, CONTEXT.md D-01]

### 1.12 The capability descriptor (D-01)

`lib/_capabilities.js` has `CAPABILITY_KEYS` (19 keys, lib/_capabilities.js:28-48) and the `TABLE` (lib/_capabilities.js:54-264). `gsdLearnings` is order 53 (lib/_capabilities.js:253-263). graphify adds `gsdGraphify` with **order 54**, `role: "step"`, `tools: ["gsd_graphify"]`, `commands: ["gsd-graphify"]`, `produces: ["graph.json","GRAPH_REPORT.md"]`. `loopSteps()` in `_render.js` sorts by `descriptor.order` (lib/_render.js:81-86), so 54 renders after learnings 53 and does not disturb ship(50)→milestone-audit(52)→learnings(53). [VERIFIED: lib/_capabilities.js:253-263, lib/_render.js:81-86, CONTEXT.md D-01]

### 1.13 Pitfalls (from upstream + in-repo precedent)

1. **Do NOT spawn a subagent** for any graphify operation (upstream anti-pattern #1). This is why `inject` excludes `"subagents"`. [VERIFIED: .analysis/gsd-core/commands/gsd/graphify.md:200, CONTEXT.md D-03]
2. **Do NOT pass `run_in_background`** for the build (upstream anti-pattern #2). The build is a fast foreground pure-JS scan. [VERIFIED: .analysis/gsd-core/commands/gsd/graphify.md:201]
3. **Do NOT delete `.planning/graphs/` on a failed build** — the prior valid graph stays (upstream anti-pattern #3, D-09). A build error is caught, the prior graph preserved, the real cause returned. [VERIFIED: .analysis/gsd-core/commands/gsd/graphify.md:202, CONTEXT.md D-09]
4. **Do NOT use `config get-value`** for the gate (upstream anti-pattern #5) — use `readConfig`. [VERIFIED: .analysis/gsd-core/commands/gsd/graphify.md:204, CONTEXT.md D-05]
5. **Query/status never auto-rebuild and never spawn** — they read the existing graph.json and report (D-11). [VERIFIED: CONTEXT.md D-11]
6. **The `_capabilities.test.mjs` length assertion** (`CAPABILITY_KEYS.length, 19`, test/_capabilities.test.mjs:13) and the **mount test tool/command lists** (test/mount.test.mjs:105-120) are hardcoded and MUST be updated when adding the capability/tool/command — otherwise the suite fails. [VERIFIED: test/_capabilities.test.mjs:13, test/mount.test.mjs:105-120]

**Confidence: HIGH** — all pitfalls are documented in the upstream contract and/or the in-repo precedent.

---

## 2. Package legitimacy

**This phase introduces NO new external dependencies.** The build is a pure-JS scan using node builtins only (D-03). The only packages involved are the existing peer dependencies already used by the mirrored plugins:

- **`@deepseek-ai/dsh-tools`** (provides `defineTool`) — already a peerDependency (package.json) and used by every loop-step plugin (e.g. lib/learnings.js:31). [VERIFIED: package.json, lib/learnings.js:31]
- **`@deepseek-ai/schemastery`**, **`@deepseek-ai/cordis`**, **`@deepseek-ai/dsh-llm`** — existing peerDependencies, unchanged. [VERIFIED: package.json]

No new package claims to verify. The external `graphify` CLI / AST-extraction engine is explicitly **NOT used** (D-03, deferred). [VERIFIED: CONTEXT.md D-03, deferred]

---

## 3. Risks and Open Questions

### Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| **FakeFs has no mtime support** — `stat()` returns `{ type, size }` only (test/helpers/fake-fs.mjs:31-36). The apply-level mtime STALE/FRESH path cannot be exercised with FakeFs. | MEDIUM | The staleness logic lives in the pure `computeStaleness(graphMeta, headCommit, newestMtime)` helper (D-07), which is fully testable with numeric mtime args. The apply-level mtime gathering is thin I/O. Test the pure helper for STALE/FRESH + commit_stale false/true/null; do not attempt an apply-level mtime test with FakeFs. |
| **Hardcoded test lists must be updated** — `_capabilities.test.mjs` length 19, mount test tool/command lists, render LOOP_ORDER, removal STEP_CAPS. | MEDIUM | These are enumerated in §5 (Validation Architecture) and must be part of the plan's test tasks, or the existing suite breaks. |
| **`built_at_commit` security** — a hostile graph.json could inject dashed options into git argv. | LOW | Upstream validates `built_at_commit` as 4–40 hex chars before reaching git (graphify-commit-based-staleness.md:25-26). graphify reads HEAD via `defaultGitFn(cwd, ["rev-parse", "HEAD"])` with a FIXED arg array (never a shell string) — the existing `_git-artifacts.js` security discipline (lib/_git-artifacts.js:14-16). No model-supplied value is interpolated into a shell command. |
| **Graph build is a full-project scan** — reads every phase's CONTEXT + PLANs. | LOW | Deterministic pure-JS, no subagent, no tokens. Bounded by the number of phases. |
| **Config gate ordering** — must gate BEFORE any build work so a disabled graphify writes nothing. | LOW | Gate is the first action after the cwd/gsdState/isProject guards, before any scan or write (D-05). |

### Open Questions

- **OQ-1 (RESOLVED):** How does `apply()` read the newest `.planning/` artefact mtime for staleness, given `gsdState` has no recursive-walk accessor? **Resolution:** Add a small project-scoped state accessor `newestPlanningMtime(cwd)` (or a pure `maxMtime(entries)` helper fed by an apply()-gathered `[{path, mtime}]` array) modeled on the existing accessors, routing through `ctx.fs`. The pure `computeStaleness` takes the resulting numeric mtime, so the logic stays unit-testable. The apply-level mtime gathering is thin I/O and is not FakeFs-testable (see Risk 1). [VERIFIED: lib/state.js:503-528 (accessor pattern), test/helpers/fake-fs.mjs:31-36 (no mtime)]
- **OQ-2 (RESOLVED):** What is the exact JSON shape of `graph.json`? **Resolution:** A JSON object `{ meta: { generated, built_at_commit, counts }, nodes: [], edges: [], hyperedges: [] }`. The `meta` block is the "frontmatter" carrying the generated timestamp, `built_at_commit`, and counts (D-06). `status` reads `meta.built_at_commit`. This is Claude's Discretion (D-13) and should be pinned in the plan. [VERIFIED: CONTEXT.md D-06/D-13]
- **OQ-3 (RESOLVED):** What are the `hyperedges`? **Resolution:** Multi-node relationships not representable as binary edges — recommended: one hyperedge per phase connecting the phase node to all its requirement nodes, and one per milestone connecting it to its phases. Exact content is Claude's Discretion (D-13). [VERIFIED: CONTEXT.md D-06/D-13]
- **OQ-4 (RESOLVED):** Does the ship auto-hook take a `phase` param? **Resolution:** No — the graph is project-global, so `runGraphifyOnShip({ cfg, tools, exec })` invokes `gsd_graphify({ action: 'build' })` with no phase. This differs from `runLearningsOnShip` (which takes `phase`). [VERIFIED: CONTEXT.md D-04/D-08]
- **OQ-5 (RESOLVED):** Which `commitArtifacts` call does the manual build use? **Resolution:** `commitArtifacts(cwd, null, { message: 'docs(planning): graphify build' })` — `phaseNum: null` because the graph is project-scoped, mirroring milestone-audit's `commitArtifacts(cwd, null, { message: ... })` (lib/milestone-audit.js:238). [VERIFIED: lib/milestone-audit.js:238, CONTEXT.md D-09]

All Open Questions are **RESOLVED** — planning may proceed.

---

## 4. Architectural Responsibility Map

| Capability | Tier | Where | Notes |
|-----------|------|-------|-------|
| Capability registration (`gsdGraphify`, order 54) | **Integration** | `lib/_capabilities.js` (TABLE + CAPABILITY_KEYS) | Single source of truth; `buildCapability` auto-renders in loopSteps. |
| Tool registration (`gsd_graphify`) | **Integration** | `lib/graphify.js` `apply()` | `defineTool` + `ctx.provide(buildCapability('gsdGraphify'))`. |
| Command registration (`/gsd-graphify`) | **Presentation** | `lib/commands.js` COMMANDS array | Auto-wired to capability via `commandToCapability`. |
| Pure graph extraction (`extractNodes`, `extractEdges`, `buildGraph`, `resolveConfidence`) | **Domain** | `lib/graphify.js` pure exports | NO ctx/fs/git params — unit-testable directly (D-04/D-12). |
| Staleness computation (`computeStaleness`) | **Domain** | `lib/graphify.js` pure export | Takes `(graphMeta, headCommit, newestMtime)` — unit-testable (D-07). |
| Config gate (`graphify.enabled`) | **Integration** | `lib/graphify.js` `apply()` via `readConfig` | First action after guards; never `config get-value` (D-05). |
| Artefact I/O (read .planning/, write graph.json + GRAPH_REPORT.md) | **Data** | `lib/graphify.js` `apply()` + new `gsdState` project-scoped accessors | Modeled on `writeMilestoneArtifact` (lib/state.js:503-511). |
| Commit of graph artefacts | **Integration** | `lib/_git-artifacts.js` `commitArtifacts` | Shared `.planning`-staging seam; no raw git in graphify.js (D-09). |
| Ship auto-on-ship hook | **Integration** | `lib/ship.js` `runGraphifyOnShip` | Pure helper, gated by `workflow.graphify`, never blocks (D-08). |
| `workflow.graphify` config flag | **Data** | `lib/state.js` `_defaultConfig` | Default `false` (D-08). |

**Security-sensitive capability check:** No capability here is security-sensitive in a way that would be a BLOCKER if misplaced. The only security-relevant surface is the git HEAD read, which uses the fixed-arg-array `defaultGitFn` seam (never a shell string) — correctly placed in the **Integration** tier. No capability is wrongly placed. [VERIFIED: lib/_git-artifacts.js:14-16, 28-30]

---

## 5. Validation Architecture

The phase is TDD (D-12). Automated checks that prove each behaviour:

| Behaviour | Automated check | Test file |
|-----------|-----------------|-----------|
| `gsdGraphify` capability registration + order 54 | `buildCapability("gsdGraphify")` → order 54, role step, tools `['gsd_graphify']`, commands `['gsd-graphify']`, produces `['graph.json','GRAPH_REPORT.md']`; `CAPABILITY_KEYS.length` 20 | `test/_capabilities.test.mjs` (update) |
| loopSteps ordering (54 after learnings 53) | `loopSteps(FULL)` includes gsdGraphify last; `renderAvailableSteps` lists `graphify: gsdGraphify (order 54)` | `test/render.test.mjs` (update) |
| Build node/edge extraction from a fixture `.planning/` tree | Pure `extractNodes`/`extractEdges`/`buildGraph` over parsed fixture data (phases, plans, requirements, decisions, milestones, depends_on) | `test/graphify.test.mjs` (new) |
| Confidence-tier classification | Pure `resolveConfidence` → EXTRACTED/INFERRED/AMBIGUOUS | `test/graphify.test.mjs` (new) |
| Config gate — disabled prints hint + writes nothing; enabled builds | Mount test: config without `graphify.enabled` → tool returns hint, no `.planning/graphs/` written; with `enabled: true` → builds | `test/graphify.test.mjs` (new) |
| Staleness computation | Pure `computeStaleness` with numeric mtimes → mtime STALE/FRESH; commit_stale false/true/null | `test/graphify.test.mjs` (new) |
| Query matching grouped by type + edges + confidence; no-match message | Mount test: `gsd_graphify({ action: 'query', term })` returns grouped matches; no match → 'No graph matches for <term>'; no graph → 'run build first' | `test/graphify.test.mjs` (new) |
| Auto-on-ship hook gated by `workflow.graphify` + never-blocks | Pure `runGraphifyOnShip({ cfg, tools, exec })` with fake tools array: disabled → skipped; enabled + tool present → invokes build; tool throws → non-blocking line | `test/graphify.test.mjs` (new) |
| Failed build preserves prior graph | Mount test: build throws → prior graph.json intact, tool returns real cause | `test/graphify.test.mjs` (new) |
| Tool + command registered in full mount | `EXPECTED_TOOL_NAMES` + `EXPECTED_COMMAND_NAMES` + snapshot "Available steps" include `gsd_graphify` / `gsd-graphify` / `graphify` | `test/mount.test.mjs` (update) |
| Plugin row activates + removable | `PATCH_ROWS` includes `{ id: 'gsd-graphify', sub: 'graphify' }`; removal matrix includes gsdGraphify | `test/helpers/mount-harness.mjs` (update), `test/removal.test.mjs` (update) |
| Subpath export resolves | `package.json` exports `./graphify`; `cordis.patch.yml` row `gsd-graphify` | `package.json`, `cordis.patch.yml` (update) |

**Test conventions:** `node:test` + `assert/strict` + `FakeFs` + `makeMountCtx`/`makeExec`/`mountSubset` from `test/helpers/mount-harness.mjs` (test/learnings.test.mjs:14-24). Pure helpers tested directly with no mount; tool integration tested via mount with a fake `gitFn` (so `commitArtifacts` never hits real git). [VERIFIED: test/learnings.test.mjs:14-24, test/helpers/mount-harness.mjs:18-21, 78-163]

---

## 6. Project Constraints

From the project conventions (PROJECT.md, REQUIREMENTS.md, CONTEXT.md):

- **Node builtins only, no subagent, no external CLI** for the graphify build (D-03). [VERIFIED: CONTEXT.md D-03]
- **Advisory soft gate** — graphify never advances STATE (D-10), like gap-analysis/milestone-audit/learnings. [VERIFIED: CONTEXT.md D-10]
- **Opt-in via `graphify.enabled`** — disabled prints an activation hint and writes nothing (D-05, upstream REQ-GRAPH-01). [VERIFIED: CONTEXT.md D-05]
- **No raw git in graphify.js** — reuse the shared `commitArtifacts`/`defaultGitFn` seam (D-09). [VERIFIED: CONTEXT.md D-09]
- **Pure helpers with NO ctx/fs/git params** for direct unit testing (D-04/D-12). [VERIFIED: CONTEXT.md D-04/D-12]
- **TDD** — the phase is TDD (D-12); tests follow `test/*.test.mjs` + mount-harness conventions. [VERIFIED: CONTEXT.md D-12]
- **`npm test` (`node --test test/*.test.mjs`) must pass** on a clean checkout (MOUNT-06). [VERIFIED: package.json scripts.test]
- **Every plugin subpath export resolves and every cordis.patch.yml row activates** (MOUNT-01) — so `package.json` exports + `cordis.patch.yml` + `PATCH_ROWS` must all gain the graphify row. [VERIFIED: REQUIREMENTS.md MOUNT-01, test/helpers/mount-harness.mjs:23-45]
- **DEGR-05 per-plugin removal** — each step plugin must be individually retirable with the remaining loop functional; the removal matrix must include gsdGraphify. [VERIFIED: REQUIREMENTS.md DEGR-05, test/removal.test.mjs:125]
- **DEGR-01/DEGR-02** — the capability must be published and the persona must render it only when present; `_render.js` STEP_PARAGRAPHS needs a `gsdGraphify` entry. [VERIFIED: REQUIREMENTS.md DEGR-01/DEGR-02, lib/_render.js:148-177]
- **Deferred (out of scope this phase):** HTML visualization, diff/snapshot subcommands, external graphify CLI, semantic search, MVP-mode node rendering, configurable graph_path, deliberate recall by other steps (mempalace, phase 46). [VERIFIED: CONTEXT.md deferred]
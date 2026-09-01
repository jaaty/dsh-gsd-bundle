// @dsh-gsd/bundle/graphify — the Graphify step tool (opengsd /gsd-graphify).
// A full loop-step plugin mirroring lib/gap-analysis.js (D-01): publishes the
// gsdGraphify capability (order 54), registers the gsd_graphify tool, builds a
// project-global knowledge graph in .planning/graphs/ (graph.json +
// GRAPH_REPORT.md), and commits the artefacts via the shared git seam.
//
// D-03: the build is a DETERMINISTIC pure-JS scan of .planning/ artefacts — node
// builtins only, NO sub-agent, NO external graphify CLI. Because no sub-agent is
// spawned, this plugin injects NO sub-agent coeffect (DEGR-07), mirroring
// gap-analysis.js. The pure helpers (extractNodes / extractEdges / buildGraph /
// resolveConfidence / computeStaleness / queryGraph) are exported so they are
// unit-testable directly with no ctx / no I/O (D-04/D-12).
//
// D-05: opt-in via graphify.enabled in config.json. When not explicitly true the
// tool prints an activation hint and writes NOTHING to .planning/graphs/.
// D-10: advisory soft gate — never advances STATE. D-09: a failed build preserves
// the prior valid graph and surfaces the real cause; no raw git (shared seam).

import { defineTool } from "@deepseek-ai/dsh-tools";
import { nowIso, today, zeroPad, slugify, parseFrontmatter, parseDecisionEntries } from "./_shared.js";
import { cwdOf } from "./_runner.js";
import { commitArtifacts, defaultGitFn } from "./_git-artifacts.js";
import { buildCapability } from "./_capabilities.js";

const name = "gsd-graphify";
// DEGR-07: the sub-agent coeffect is deliberately ABSENT — graphify is a
// deterministic pure-JS scan (D-03), so the fiber must not depend on the host
// sub-agent service. gsdState + tools mirror the other loop steps.
const inject = ["gsdState", "tools"];

// ── pure helpers (no ctx, no I/O — unit-testable directly) ─────────────────────

// Whole-word match of an ID (D-01 vs D-010 safe) inside prose.
function wholeWord(text, id) {
  return new RegExp("\\b" + String(id).replace(/-/g, "\\-") + "\\b").test(String(text ?? ""));
}

// Pure confidence classifier (D-03/D-13): a directly-declared relationship is
// EXTRACTED; a body-mentioned-but-undeclared one takes the prose tier; a
// relationship with no evidence at all is AMBIGUOUS.
export function resolveConfidence({ declared, mentioned, proseTier }) {
  if (declared) return "EXTRACTED";
  if (mentioned) return proseTier;
  return "AMBIGUOUS";
}

// Extract graph nodes from parsed .planning/ data (D-03/D-12b). roadmap =
// { milestoneName, version, phases: [{ n, name, goal, requirements }] };
// requirements = [{ id, text, complete }]; phases = [{ n, name, decisions:
// [{ id, text }], plans: [{ id, requirements, depends_on, body }] }]. Returns
// [{ id, type, label, confidence }]. Node ids: milestone-<slug>, phase-<n>,
// plan.id, REQ-ID, decision-<n>-<DID>.
export function extractNodes({ roadmap, requirements, phases }) {
  const nodes = [];
  const milestoneName = roadmap?.milestoneName;
  if (milestoneName) {
    nodes.push({ id: `milestone-${slugify(milestoneName)}`, type: "milestone", label: milestoneName, confidence: "EXTRACTED" });
  }
  for (const p of roadmap?.phases || []) {
    nodes.push({ id: `phase-${p.n}`, type: "phase", label: p.name, confidence: "EXTRACTED" });
  }
  for (const r of requirements || []) {
    nodes.push({ id: r.id, type: "requirement", label: r.id, confidence: "EXTRACTED" });
  }
  for (const ph of phases || []) {
    for (const plan of ph.plans || []) {
      nodes.push({ id: plan.id, type: "plan", label: plan.id, confidence: "EXTRACTED" });
    }
    for (const d of ph.decisions || []) {
      nodes.push({ id: `decision-${ph.n}-${d.id}`, type: "decision", label: d.id, confidence: "EXTRACTED" });
    }
  }
  return nodes;
}

// Extract graph edges from parsed .planning/ data (D-03/D-12b). Returns
// [{ from, to, type, confidence }]. Edges: phase→requirement, phase→plan,
// phase→milestone, plan depends_on (all EXTRACTED); plan→decision (INFERRED
// when the D-ID is body-mentioned but undeclared); plan→requirement (AMBIGUOUS
// when the REQ-ID is body-mentioned but undeclared).
export function extractEdges({ roadmap, phases }) {
  const edges = [];
  const milestoneName = roadmap?.milestoneName;
  const milestoneId = milestoneName ? `milestone-${slugify(milestoneName)}` : null;

  for (const rp of roadmap?.phases || []) {
    const phaseId = `phase-${rp.n}`;
    for (const reqId of rp.requirements || []) {
      edges.push({ from: phaseId, to: reqId, type: "phase_requirement", confidence: "EXTRACTED" });
    }
    if (milestoneId) {
      edges.push({ from: phaseId, to: milestoneId, type: "phase_milestone", confidence: "EXTRACTED" });
    }
  }

  for (const ph of phases || []) {
    const phaseId = `phase-${ph.n}`;
    const declaredDecisions = new Set((ph.decisions || []).map((d) => d.id));
    for (const plan of ph.plans || []) {
      edges.push({ from: phaseId, to: plan.id, type: "phase_plan", confidence: "EXTRACTED" });
      for (const depId of plan.depends_on || []) {
        edges.push({ from: plan.id, to: depId, type: "plan_depends_on", confidence: "EXTRACTED" });
      }
      const body = plan.body || "";
      // plan→decision: every D-ID declared in the phase OR mentioned in the body.
      const mentionedDids = new Set();
      const dRe = /\b(D-\d+)\b/g;
      let m;
      while ((m = dRe.exec(body)) !== null) mentionedDids.add(m[1]);
      const allDids = new Set([...declaredDecisions, ...mentionedDids]);
      for (const did of allDids) {
        edges.push({
          from: plan.id, to: `decision-${ph.n}-${did}`, type: "plan_decision",
          confidence: resolveConfidence({ declared: declaredDecisions.has(did), mentioned: mentionedDids.has(did), proseTier: "INFERRED" }),
        });
      }
      // plan→requirement: every REQ-ID declared in the plan OR mentioned in the body.
      const declaredReqs = new Set(plan.requirements || []);
      const mentionedReqs = new Set();
      const reqRe = /\b([A-Z]+-\d+)\b/g;
      let m2;
      while ((m2 = reqRe.exec(body)) !== null) mentionedReqs.add(m2[1]);
      const allReqs = new Set([...declaredReqs, ...mentionedReqs]);
      for (const reqId of allReqs) {
        edges.push({
          from: plan.id, to: reqId, type: "plan_requirement",
          confidence: resolveConfidence({ declared: declaredReqs.has(reqId), mentioned: mentionedReqs.has(reqId), proseTier: "AMBIGUOUS" }),
        });
      }
    }
  }
  return edges;
}

// Build the multi-node hyperedges (D-06/D-13): one per phase connecting the
// phase node to all its requirement nodes, and one per milestone connecting it
// to all its phase nodes. Returns [{ id, type, nodes, confidence }].
function buildHyperedges({ roadmap }) {
  const hyperedges = [];
  for (const rp of roadmap?.phases || []) {
    const reqIds = rp.requirements || [];
    if (reqIds.length) {
      hyperedges.push({ id: `hyper-phase-${rp.n}`, type: "phase_requirements", nodes: [`phase-${rp.n}`, ...reqIds], confidence: "EXTRACTED" });
    }
  }
  const milestoneName = roadmap?.milestoneName;
  if (milestoneName) {
    const phaseIds = (roadmap?.phases || []).map((p) => `phase-${p.n}`);
    if (phaseIds.length) {
      hyperedges.push({ id: `hyper-milestone-${slugify(milestoneName)}`, type: "milestone_phases", nodes: [`milestone-${slugify(milestoneName)}`, ...phaseIds], confidence: "EXTRACTED" });
    }
  }
  return hyperedges;
}

// Pure graph assembler (D-06/D-13): wraps nodes/edges/hyperedges with a meta
// block carrying the generated timestamp, built_at_commit, and counts.
export function buildGraph({ nodes, edges, hyperedges, builtAtCommit, generated }) {
  return {
    meta: {
      generated,
      built_at_commit: builtAtCommit,
      counts: { nodes: nodes.length, edges: edges.length, hyperedges: hyperedges.length },
    },
    nodes,
    edges,
    hyperedges,
  };
}

// Pure staleness computation (D-07/D-12e). graphMeta = { built_at_commit, mtime }.
// Returns { mtime, built_at_commit, commit_stale } where mtime is FRESH when the
// graph mtime >= the newest .planning/ mtime (else STALE; null inputs → FRESH),
// and commit_stale is false (rebuilt at HEAD) / true (N commits behind) / null
// (unreachable commit or no git).
export function computeStaleness(graphMeta, headCommit, newestMtime) {
  const builtAtCommit = graphMeta?.built_at_commit ?? null;
  const mtime = graphMeta?.mtime ?? null;
  const mtimeStatus = mtime == null || newestMtime == null ? "FRESH" : mtime >= newestMtime ? "FRESH" : "STALE";
  const commitStale = builtAtCommit == null || headCommit == null ? null : builtAtCommit === headCommit ? false : true;
  return { mtime: mtimeStatus, built_at_commit: builtAtCommit, commit_stale: commitStale };
}

// Pure query matcher (D-11/D-12f). graph = { nodes, edges, hyperedges }. Returns
// matches grouped by node type: [{ type, matches: [{ id, label, confidence,
// edges: [{ from, to, type, confidence }] }] }]. Empty array when no node matches.
export function queryGraph(graph, term) {
  const nodes = graph?.nodes || [];
  const edges = graph?.edges || [];
  const t = String(term ?? "").toLowerCase();
  const grouped = new Map();
  for (const node of nodes) {
    const id = String(node.id ?? "");
    const label = String(node.label ?? "");
    if (t && (id.toLowerCase().includes(t) || label.toLowerCase().includes(t))) {
      const nodeEdges = edges
        .filter((e) => e.from === node.id || e.to === node.id)
        .map((e) => ({ from: e.from, to: e.to, type: e.type, confidence: e.confidence }));
      if (!grouped.has(node.type)) grouped.set(node.type, []);
      grouped.get(node.type).push({ id: node.id, label: node.label, confidence: node.confidence, edges: nodeEdges });
    }
  }
  return [...grouped.entries()].map(([type, matches]) => ({ type, matches }));
}

// Render the grouped query matches as a human-readable string.
function renderQueryMatches(matches) {
  const lines = [];
  for (const group of matches) {
    lines.push(`## ${group.type}`);
    for (const m of group.matches) {
      lines.push(`- ${m.id} (${m.label}) — confidence: ${m.confidence}`);
      for (const e of m.edges) {
        lines.push(`  - ${e.from} --${e.type}--> ${e.to} (${e.confidence})`);
      }
    }
    lines.push("");
  }
  return lines.join("\n");
}

// Build the human-readable GRAPH_REPORT.md body (D-06/D-13).
function renderReport(graph, roadmap) {
  const counts = graph.meta.counts;
  const byType = {};
  for (const n of graph.nodes) byType[n.type] = (byType[n.type] || 0) + 1;
  const typeBreakdown = Object.entries(byType)
    .map(([t, c]) => `- ${t}: ${c}`)
    .join("\n");
  const topEdges = [...graph.edges]
    .sort((a, b) => (a.type < b.type ? -1 : a.type > b.type ? 1 : 0))
    .slice(0, 10)
    .map((e) => `- ${e.from} --${e.type}--> ${e.to} (${e.confidence})`)
    .join("\n");
  return [
    `# Project Knowledge Graph`,
    "",
    `**Milestone:** ${roadmap?.milestoneName || "n/a"} (${roadmap?.version || "n/a"})`,
    `**Generated:** ${graph.meta.generated}`,
    `**Built at commit:** ${graph.meta.built_at_commit || "n/a"}`,
    "",
    "## Counts",
    "",
    `- nodes: ${counts.nodes}`,
    `- edges: ${counts.edges}`,
    `- hyperedges: ${counts.hyperedges}`,
    "",
    "## Nodes by type",
    "",
    typeBreakdown || "_none_",
    "",
    "## Top relationships",
    "",
    topEdges || "_none_",
    "",
    "---",
    "",
    `*Graph generated: ${today()}*`,
  ].join("\n");
}

function apply(ctx) {
  const gsd = () => ctx.get("gsdState");

  // Publish this loop step's capability (DEGR-01/D-01). Auto-tracked
  // revertible effect: retiring the graphify plugin withdraws gsdGraphify.
  ctx.provide("gsdGraphify", buildCapability("gsdGraphify"));

  ctx.tools.register(defineTool({
    name: "gsd_graphify",
    description:
      "Graphify (opengsd /gsd-graphify): build, query, or inspect a project knowledge graph in .planning/graphs/ (graph.json + GRAPH_REPORT.md) from a deterministic pure-JS scan of ROADMAP/REQUIREMENTS/STATE + each phase's CONTEXT/PLAN. Nodes: phases, plans, requirements, decisions, milestones. Edges: phase→requirement, phase→plan, plan→decision, phase→milestone, plan depends_on. Confidence tiers EXTRACTED/INFERRED/AMBIGUOUS. Opt-in via graphify.enabled in config.json. Advisory soft gate — never advances STATE. No subagent.",
    parameters: {
      action: { type: "string", enum: ["build", "query", "status"], required: true },
      term: { type: "string" },
    },
    output: { schema: { type: "string" }, render: (_a, v) => [{ type: "text", text: v }] },
    async execute(args, exec) {
      // ── fail-fast environmental guards (D-10), mirroring gap-analysis.
      const cwd = cwdOf(exec);
      const s = gsd();
      if (!s) throw new Error("gsd_graphify: gsdState service unavailable");
      if (!(await s.isProject(cwd))) throw new Error("gsd_graphify: no .planning/ project — run gsd_init first");
      const roadmap = await s.readRoadmap(cwd);
      if (!roadmap) throw new Error("gsd_graphify: unreadable ROADMAP.md");

      // ── config gate (D-05): FIRST action after the guards, before any scan or
      // write. When graphify.enabled is not explicitly true, print the activation
      // hint and STOP — write nothing to .planning/graphs/.
      const cfg = await s.readConfig(cwd);
      if (cfg?.graphify?.enabled !== true) {
        return "gsd_graphify: graphify is disabled. Enable it by setting \"graphify\": { \"enabled\": true } in .planning/config.json, then re-run.";
      }

      const action = args.action || "build";

      // ── query / status read the existing graph.json and report (D-11) — never
      // auto-rebuild, never spawn.
      if (action === "query" || action === "status") {
        const graphText = await s.readGraphArtifact(cwd, "graph.json");
        if (graphText === undefined) {
          return "gsd_graphify: no graph built yet — run build first";
        }
        let graph;
        try { graph = JSON.parse(graphText); } catch { graph = null; }
        if (!graph) {
          return "gsd_graphify: graph.json is corrupt — run 'build' to rebuild";
        }
        if (action === "query") {
          const matches = queryGraph(graph, args.term);
          if (matches.length === 0) return `No graph matches for ${args.term}`;
          return `Graph matches for "${args.term}":\n\n${renderQueryMatches(matches)}`;
        }
        // status
        const graphTarget = await s.ctx.fs.resolve(`${s.graphsDir(cwd)}/graph.json`);
        const graphStat = await s.ctx.fs.stat(graphTarget);
        const graphMtime = graphStat && graphStat.mtime != null ? graphStat.mtime : null;
        let headCommit = null;
        try { headCommit = await defaultGitFn(cwd, ["rev-parse", "HEAD"]); } catch { headCommit = null; }
        const newestMtime = await s.newestPlanningMtime(cwd);
        const staleness = computeStaleness(
          { built_at_commit: graph.meta?.built_at_commit ?? null, mtime: graphMtime },
          headCommit,
          newestMtime,
        );
        const counts = graph.meta?.counts || {};
        const lines = [
          `Graph status for ${cwd}/.planning/graphs/graph.json`,
          `- nodes: ${counts.nodes ?? 0}, edges: ${counts.edges ?? 0}, hyperedges: ${counts.hyperedges ?? 0}`,
          `- mtime: ${staleness.mtime}`,
        ];
        // D-07: when built_at_commit is null, OMIT the source-commit line.
        if (staleness.built_at_commit != null) {
          lines.push(`- built at commit: ${staleness.built_at_commit} (commit_stale: ${staleness.commit_stale})`);
        }
        return lines.join("\n");
      }

      // ── build (D-03/D-09): deterministic pure-JS scan + write, wrapped so a
      // build fault never throws and never deletes the prior valid graph.
      try {
        const requirements = await s.readRequirements(cwd);
        const phases = [];
        for (const rp of roadmap.phases) {
          const contextText = await s.readArtifact(cwd, rp.n, "CONTEXT");
          const decisions = contextText ? parseDecisionEntries(contextText) : [];
          const plans = [];
          const planList = await s.listPlans(cwd, rp.n);
          for (const p of planList) {
            const planText = await s.readArtifact(cwd, rp.n, "PLAN-" + zeroPad(Number(p.plan)));
            const { body } = parseFrontmatter(planText || "");
            plans.push({ id: p.id, requirements: p.requirements || [], depends_on: p.depends_on || [], body });
          }
          phases.push({ n: rp.n, name: rp.name, decisions, plans });
        }

        let headCommit = null;
        try { headCommit = await defaultGitFn(cwd, ["rev-parse", "HEAD"]); } catch { headCommit = null; }

        const nodes = extractNodes({ roadmap, requirements, phases });
        const edges = extractEdges({ roadmap, phases });
        const hyperedges = buildHyperedges({ roadmap });
        const graph = buildGraph({ nodes, edges, hyperedges, builtAtCommit: headCommit, generated: nowIso() });

        const graphPath = await s.writeGraphArtifact(cwd, "graph.json", JSON.stringify(graph, null, 2) + "\n");
        const reportPath = await s.writeGraphArtifact(cwd, "GRAPH_REPORT.md", renderReport(graph, roadmap));

        // ── audit trail (D-10): record a decision but do NOT advance STATE — a
        // pure report/build, like gap-analysis and milestone-audit. Never call
        // setActivePhase.
        await s.addDecision(cwd, `Graphify: graph built (nodes: ${nodes.length}, edges: ${edges.length})`);

        // ── commit (D-09): the shared .planning-staging seam — no raw git.
        const commit = await commitArtifacts(cwd, null, { message: "docs(planning): graphify build" });
        const commitNote = commit.committed
          ? ` Artefacts committed (${commit.staged.length} file(s)).`
          : commit.warning
            ? ` (commit skipped: ${commit.warning})`
            : "";

        return `Graphify build complete. Wrote ${graphPath} and ${reportPath}. Counts — nodes: ${nodes.length}, edges: ${edges.length}, hyperedges: ${hyperedges.length}.${commitNote}`;
      } catch (e) {
        // D-09/D-10: never-throw on build faults — surface the real cause, keep
        // the prior valid graph intact (we only write on success).
        return "gsd_graphify: build failed: " + (e && e.message ? e.message : String(e));
      }
    },
    presentCall: (a) => ({ card: "generic", title: "Graphify " + (a.action || "build"), kind: "other", rawInput: { action: a.action, term: a.term } }),
  }));
}

export { name, inject, apply };

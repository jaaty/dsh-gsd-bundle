// Offline behavioural tests for the graphify plugin (lib/graphify.js), TDD per
// D-12. Covers the deterministic pure-JS build engine (D-03): the PURE helpers
// (extractNodes / extractEdges / buildGraph / resolveConfidence /
// computeStaleness / queryGraph — no ctx, no I/O), the gsdGraphify capability
// registration + order 54 (D-12a), the gsd_graphify tool integration (build /
// query / status, D-02), the config gate (graphify.enabled — disabled prints a
// hint and writes nothing, D-05), staleness computation (mtime STALE/FRESH +
// commit_stale false/true/null, D-07), query matching grouped by type + no-match
// message (D-11), and the failed-build-preserves-prior-graph path (D-09).
//
// Offline only: FakeFs + fake-ctx, no live boot, no LLM/git/gh. git is a fake
// gitFn so commitArtifacts never hits real git.

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { FakeFs } from "./helpers/fake-fs.mjs";
import { makeMountCtx, makeExec, CWD } from "./helpers/mount-harness.mjs";
import { apply as applyState } from "../lib/state.js";
import { apply as applyCoreTools } from "../lib/core-tools.js";
import {
  apply as applyGraphify,
  extractNodes,
  extractEdges,
  buildGraph,
  resolveConfidence,
  computeStaleness,
  queryGraph,
} from "../lib/graphify.js";
import { buildCapability } from "../lib/_capabilities.js";
import { parseFrontmatter } from "../lib/_shared.js";
import { runGraphifyOnShip } from "../lib/ship.js";

// ── pure helpers (D-12i: no ctx/fs/git params) ─────────────────────────────────

describe("graphify: resolveConfidence (D-12c, D-03 — pure classifier)", () => {
  test("declared → EXTRACTED regardless of mention", () => {
    assert.equal(resolveConfidence({ declared: true, mentioned: false, proseTier: "INFERRED" }), "EXTRACTED");
    assert.equal(resolveConfidence({ declared: true, mentioned: true, proseTier: "AMBIGUOUS" }), "EXTRACTED");
  });

  test("not declared but mentioned → proseTier", () => {
    assert.equal(resolveConfidence({ declared: false, mentioned: true, proseTier: "INFERRED" }), "INFERRED");
    assert.equal(resolveConfidence({ declared: false, mentioned: true, proseTier: "AMBIGUOUS" }), "AMBIGUOUS");
  });

  test("neither declared nor mentioned → AMBIGUOUS", () => {
    assert.equal(resolveConfidence({ declared: false, mentioned: false, proseTier: "INFERRED" }), "AMBIGUOUS");
  });
});

describe("graphify: extractNodes (D-12b, D-03 — pure)", () => {
  const roadmap = { milestoneName: "M1", version: "v1.0", phases: [{ n: 1, name: "p1", goal: "g1", requirements: ["GAP-11"] }] };
  const requirements = [{ id: "GAP-11", text: "x", complete: false }];
  const phases = [
    {
      n: 1, name: "p1",
      decisions: [{ id: "D-01", text: "d1" }],
      plans: [{ id: "GSD-45-graphify-01", requirements: ["GAP-11"], depends_on: [], body: "<objective>build it</objective>" }],
    },
  ];

  test("emits phase/plan/requirement/decision/milestone nodes with expected ids", () => {
    const nodes = extractNodes({ roadmap, requirements, phases });
    const ids = nodes.map((n) => n.id);
    assert.ok(ids.includes("phase-1"), "phase node id");
    assert.ok(ids.includes("GSD-45-graphify-01"), "plan node id");
    assert.ok(ids.includes("GAP-11"), "requirement node id");
    assert.ok(ids.includes("decision-1-D-01"), "decision node id");
    assert.ok(ids.includes("milestone-m1"), "milestone node id (slugified)");
    // every node carries a type + confidence
    for (const n of nodes) {
      assert.ok(n.type, "node must have a type");
      assert.equal(n.confidence, "EXTRACTED", "directly-read nodes are EXTRACTED");
    }
    const types = new Set(nodes.map((n) => n.type));
    for (const t of ["phase", "plan", "requirement", "decision", "milestone"]) {
      assert.ok(types.has(t), `node type ${t} present`);
    }
  });
});

describe("graphify: extractEdges (D-12b, D-03 — pure)", () => {
  test("phase→requirement, phase→plan, plan→decision, phase→milestone all EXTRACTED", () => {
    const roadmap = { milestoneName: "M1", version: "v1.0", phases: [{ n: 1, name: "p1", goal: "g1", requirements: ["GAP-11"] }] };
    const phases = [
      {
        n: 1, name: "p1",
        decisions: [{ id: "D-01", text: "d1" }],
        plans: [{ id: "GSD-45-graphify-01", requirements: ["GAP-11"], depends_on: [], body: "<objective>build it</objective>" }],
      },
    ];
    const edges = extractEdges({ roadmap, phases });
    const find = (from, to, type) => edges.find((e) => e.from === from && e.to === to && e.type === type);
    const pr = find("phase-1", "GAP-11", "phase_requirement");
    assert.ok(pr, "phase→requirement edge");
    assert.equal(pr.confidence, "EXTRACTED");
    const pp = find("phase-1", "GSD-45-graphify-01", "phase_plan");
    assert.ok(pp, "phase→plan edge");
    assert.equal(pp.confidence, "EXTRACTED");
    const pd = find("GSD-45-graphify-01", "decision-1-D-01", "plan_decision");
    assert.ok(pd, "plan→decision edge");
    assert.equal(pd.confidence, "EXTRACTED", "D-01 declared in phase decisions → EXTRACTED");
    const pm = find("phase-1", "milestone-m1", "phase_milestone");
    assert.ok(pm, "phase→milestone edge");
    assert.equal(pm.confidence, "EXTRACTED");
  });

  test("plan depends_on edge is EXTRACTED", () => {
    const roadmap = { milestoneName: "M1", version: "v1.0", phases: [{ n: 1, name: "p1", goal: "g1", requirements: [] }] };
    const phases = [
      {
        n: 1, name: "p1", decisions: [],
        plans: [{ id: "GSD-45-graphify-01", requirements: [], depends_on: ["GSD-45-graphify-00"], body: "x" }],
      },
    ];
    const edges = extractEdges({ roadmap, phases });
    const dep = edges.find((e) => e.type === "plan_depends_on" && e.from === "GSD-45-graphify-01" && e.to === "GSD-45-graphify-00");
    assert.ok(dep, "plan depends_on edge");
    assert.equal(dep.confidence, "EXTRACTED");
  });

  test("plan→decision for a body-mentioned undeclared D-ID → INFERRED; plan→requirement for a body-mentioned undeclared REQ-ID → AMBIGUOUS", () => {
    const roadmap = { milestoneName: "M1", version: "v1.0", phases: [{ n: 1, name: "p1", goal: "g1", requirements: ["GAP-11"] }] };
    const phases = [
      {
        n: 1, name: "p1",
        decisions: [{ id: "D-01", text: "d1" }],
        plans: [{ id: "GSD-45-graphify-01", requirements: ["GAP-11"], depends_on: [], body: "mentions D-02 and GAP-12 in prose" }],
      },
    ];
    const edges = extractEdges({ roadmap, phases });
    const pd = edges.find((e) => e.type === "plan_decision" && e.to === "decision-1-D-02");
    assert.ok(pd, "plan→decision edge for body-mentioned D-02");
    assert.equal(pd.confidence, "INFERRED", "undeclared but mentioned D-ID → INFERRED");
    const pr = edges.find((e) => e.type === "plan_requirement" && e.to === "GAP-12");
    assert.ok(pr, "plan→requirement edge for body-mentioned GAP-12");
    assert.equal(pr.confidence, "AMBIGUOUS", "undeclared but mentioned REQ-ID → AMBIGUOUS");
    // declared GAP-11 still EXTRACTED
    const pr11 = edges.find((e) => e.type === "plan_requirement" && e.to === "GAP-11");
    assert.equal(pr11.confidence, "EXTRACTED");
  });
});

describe("graphify: buildGraph (D-06, D-13 — pure assembler)", () => {
  test("assembles meta with generated, built_at_commit, and counts", () => {
    const nodes = [{ id: "phase-1", type: "phase", label: "p1", confidence: "EXTRACTED" }];
    const edges = [{ from: "phase-1", to: "GAP-11", type: "phase_requirement", confidence: "EXTRACTED" }];
    const hyperedges = [{ id: "hyper-phase-1", type: "phase_requirements", nodes: ["phase-1", "GAP-11"], confidence: "EXTRACTED" }];
    const graph = buildGraph({ nodes, edges, hyperedges, builtAtCommit: "abc123", generated: "2026-01-01T00:00:00Z" });
    assert.equal(graph.meta.generated, "2026-01-01T00:00:00Z");
    assert.equal(graph.meta.built_at_commit, "abc123");
    assert.deepEqual(graph.meta.counts, { nodes: 1, edges: 1, hyperedges: 1 });
    assert.deepEqual(graph.nodes, nodes);
    assert.deepEqual(graph.edges, edges);
    assert.deepEqual(graph.hyperedges, hyperedges);
  });
});

describe("graphify: computeStaleness (D-12e, D-07 — pure)", () => {
  test("mtime FRESH when graph mtime >= newest mtime", () => {
    assert.deepEqual(computeStaleness({ built_at_commit: "abc", mtime: 200 }, "abc", 100), {
      mtime: "FRESH", built_at_commit: "abc", commit_stale: false,
    });
  });

  test("mtime STALE when graph mtime < newest mtime", () => {
    assert.deepEqual(computeStaleness({ built_at_commit: "abc", mtime: 100 }, "abc", 200), {
      mtime: "STALE", built_at_commit: "abc", commit_stale: false,
    });
  });

  test("commit_stale true when built_at_commit differs from head", () => {
    assert.deepEqual(computeStaleness({ built_at_commit: "abc", mtime: 200 }, "def", 100), {
      mtime: "FRESH", built_at_commit: "abc", commit_stale: true,
    });
  });

  test("built_at_commit null → commit_stale null (pre-graphify graph)", () => {
    assert.deepEqual(computeStaleness({ built_at_commit: null, mtime: 200 }, "abc", 100), {
      mtime: "FRESH", built_at_commit: null, commit_stale: null,
    });
  });

  test("headCommit null (no git) → commit_stale null", () => {
    assert.deepEqual(computeStaleness({ built_at_commit: "abc", mtime: 200 }, null, 100), {
      mtime: "FRESH", built_at_commit: "abc", commit_stale: null,
    });
  });

  test("null mtime inputs → FRESH", () => {
    assert.deepEqual(computeStaleness({ built_at_commit: "abc", mtime: null }, "abc", null), {
      mtime: "FRESH", built_at_commit: "abc", commit_stale: false,
    });
  });
});

describe("graphify: queryGraph (D-12f, D-11 — pure)", () => {
  const graph = {
    nodes: [{ id: "GAP-11", type: "requirement", label: "GAP-11", confidence: "EXTRACTED" }],
    edges: [{ from: "phase-1", to: "GAP-11", type: "phase_requirement", confidence: "EXTRACTED" }],
    hyperedges: [],
  };

  test("returns matches grouped by type with edges + confidence", () => {
    const out = queryGraph(graph, "GAP-11");
    assert.equal(out.length, 1);
    assert.equal(out[0].type, "requirement");
    assert.equal(out[0].matches.length, 1);
    assert.equal(out[0].matches[0].id, "GAP-11");
    assert.equal(out[0].matches[0].confidence, "EXTRACTED");
    assert.equal(out[0].matches[0].edges.length, 1);
    assert.equal(out[0].matches[0].edges[0].type, "phase_requirement");
  });

  test("no match → empty array", () => {
    assert.deepEqual(queryGraph(graph, "zzz"), []);
  });
});

// ── integration (D-12a/b/d/f/h) ─────────────────────────────────────────────────

describe("graphify: gsd_graphify tool (integration)", () => {
  async function mountGraphify() {
    const fs = new FakeFs();
    const ctx = makeMountCtx(fs, {});
    applyState(ctx, {});
    applyCoreTools(ctx, {});
    applyGraphify(ctx, {});
    return { fs, ctx };
  }

  async function bootstrap(ctx, phases, requirements) {
    const gsdInit = ctx.tools.find((t) => t.name === "gsd_init");
    assert.ok(gsdInit, "gsd_init not registered");
    await gsdInit.execute(
      { name: "demo", milestoneName: "M1", version: "v1.0", requirements, phases },
      makeExec(),
    );
  }

  function runGraphify(ctx, args) {
    const t = ctx.tools.find((x) => x.name === "gsd_graphify");
    assert.ok(t, "gsd_graphify not registered");
    return t.execute(args || {}, makeExec());
  }

  function makeFakeGit() {
    const calls = [];
    const fakeGit = async (_cwd, args) => {
      calls.push([...args]);
      if (args[0] === "add") return "";
      if (args[0] === "diff" && args[1] === "--cached" && args[2] === "--name-only") {
        const lastAdd = [...calls].reverse().find((c) => c[0] === "add");
        return lastAdd ? lastAdd.slice(1).join("\n") : "";
      }
      if (args[0] === "commit") return "";
      return "";
    };
    return { calls, fakeGit };
  }

  // Seed a phase with CONTEXT (decisions) + PLAN-01 so the build has data.
  async function seedPhase(ctx, n) {
    const gsdState = ctx.get("gsdState");
    await gsdState.writeArtifact(
      CWD, n, "CONTEXT",
      "---\nphase: " + n + "\n---\n## Decisions\n- **D-01:** first decision\n",
    );
    await gsdState.writeArtifact(CWD, n, "PLAN-01", "---\nwave: 1\ntype: execute\nrequirements: [GAP-11]\n---\n<objective>build it</objective>");
    return gsdState;
  }

  // ── (a) capability registration + order 54 (D-12a) ────────────────────────────
  test("(a) gsdGraphify capability registered, order 54, step graphify, tools/commands/produces match (D-12a)", async () => {
    const { ctx } = await mountGraphify();
    assert.ok(ctx.provided.has("gsdGraphify"), "gsdGraphify must be provided");
    const cap = buildCapability("gsdGraphify");
    assert.equal(cap.order, 54);
    assert.equal(cap.step, "graphify");
    assert.deepEqual([...cap.tools], ["gsd_graphify"]);
    assert.deepEqual([...cap.commands], ["gsd-graphify"]);
    assert.deepEqual([...cap.produces], ["graph.json", "GRAPH_REPORT.md"]);
  });

  // ── (d) config gate — disabled prints hint + writes nothing; enabled builds (D-12d, D-05) ──
  test("(d) disabled → activation hint, no .planning/graphs/ written (D-05)", async () => {
    const { ctx } = await mountGraphify();
    await bootstrap(ctx, [{ name: "p1", goal: "g1", requirements: ["GAP-11"] }], [{ id: "GAP-11", text: "x" }]);
    const git = makeFakeGit();
    ctx.gitFn = git.fakeGit;
    const gsdState = ctx.get("gsdState");

    const res = await runGraphify(ctx, { action: "build" });
    assert.match(res, /enable|graphify\.enabled/i, "disabled build must print an activation hint");
    assert.equal(await gsdState.hasGraphArtifact(CWD, "graph.json"), false, "no graph.json must be written when disabled");
  });

  test("(d) enabled → builds graph.json + GRAPH_REPORT.md (D-05)", async () => {
    const { fs, ctx } = await mountGraphify();
    await bootstrap(ctx, [{ name: "p1", goal: "g1", requirements: ["GAP-11"] }], [{ id: "GAP-11", text: "x" }]);
    const git = makeFakeGit();
    ctx.gitFn = git.fakeGit;
    const gsdState = ctx.get("gsdState");
    await seedPhase(ctx, 1);

    // enable graphify in config.json
    await fs.writeText({ targetKey: `${CWD}/.planning/config.json` }, JSON.stringify({ graphify: { enabled: true } }));

    const res = await runGraphify(ctx, { action: "build" });
    assert.match(res, /graph/i, "enabled build must report the graph");
    assert.equal(await gsdState.hasGraphArtifact(CWD, "graph.json"), true, "graph.json must be written when enabled");
    assert.equal(await gsdState.hasGraphArtifact(CWD, "GRAPH_REPORT.md"), true, "GRAPH_REPORT.md must be written when enabled");
  });

  // ── (f) query matching grouped by type + no-match + no-graph (D-12f, D-11) ─────
  test("(f) query returns grouped matches with edges + confidence after a build (D-11)", async () => {
    const { fs, ctx } = await mountGraphify();
    await bootstrap(ctx, [{ name: "p1", goal: "g1", requirements: ["GAP-11"] }], [{ id: "GAP-11", text: "x" }]);
    const git = makeFakeGit();
    ctx.gitFn = git.fakeGit;
    const gsdState = ctx.get("gsdState");
    await seedPhase(ctx, 1);
    await fs.writeText({ targetKey: `${CWD}/.planning/config.json` }, JSON.stringify({ graphify: { enabled: true } }));
    await runGraphify(ctx, { action: "build" });

    const res = await runGraphify(ctx, { action: "query", term: "GAP-11" });
    assert.match(res, /GAP-11/, "query must surface the matched node id");
    assert.match(res, /requirement/i, "query must group by type");
    assert.match(res, /EXTRACTED/i, "query must surface confidence");
  });

  test("(f) query no-match → 'No graph matches for <term>' (D-11)", async () => {
    const { fs, ctx } = await mountGraphify();
    await bootstrap(ctx, [{ name: "p1", goal: "g1", requirements: ["GAP-11"] }], [{ id: "GAP-11", text: "x" }]);
    const git = makeFakeGit();
    ctx.gitFn = git.fakeGit;
    const gsdState = ctx.get("gsdState");
    await seedPhase(ctx, 1);
    await fs.writeText({ targetKey: `${CWD}/.planning/config.json` }, JSON.stringify({ graphify: { enabled: true } }));
    await runGraphify(ctx, { action: "build" });

    const res = await runGraphify(ctx, { action: "query", term: "zzz-nomatch" });
    assert.match(res, /No graph matches for zzz-nomatch/);
  });

  test("(f) query with no graph built → 'run build first' (D-11)", async () => {
    const { fs, ctx } = await mountGraphify();
    await bootstrap(ctx, [{ name: "p1", goal: "g1", requirements: ["GAP-11"] }], [{ id: "GAP-11", text: "x" }]);
    const git = makeFakeGit();
    ctx.gitFn = git.fakeGit;
    await fs.writeText({ targetKey: `${CWD}/.planning/config.json` }, JSON.stringify({ graphify: { enabled: true } }));

    const res = await runGraphify(ctx, { action: "query", term: "x" });
    assert.match(res, /run build first/);
  });

  // ── (h) failed build preserves the prior graph (D-12h, D-09) ───────────────────
  test("(h) build write failure → resolves with real cause, prior graph intact (D-09)", async () => {
    const { fs, ctx } = await mountGraphify();
    await bootstrap(ctx, [{ name: "p1", goal: "g1", requirements: ["GAP-11"] }], [{ id: "GAP-11", text: "x" }]);
    const git = makeFakeGit();
    ctx.gitFn = git.fakeGit;
    const gsdState = ctx.get("gsdState");
    await seedPhase(ctx, 1);
    await fs.writeText({ targetKey: `${CWD}/.planning/config.json` }, JSON.stringify({ graphify: { enabled: true } }));

    // seed a prior valid graph
    await fs.writeText(
      { targetKey: `${CWD}/.planning/graphs/graph.json` },
      JSON.stringify({ meta: { generated: "old" }, nodes: [], edges: [], hyperedges: [] }),
    );

    // make every write under /graphs/ throw
    const orig = fs.writeText.bind(fs);
    fs.writeText = async (target, content) => {
      if (String(target.targetKey).includes("/graphs/")) throw new Error("disk full");
      return orig(target, content);
    };

    const res = await runGraphify(ctx, { action: "build" });
    assert.match(res, /disk full/, "the real cause must be surfaced");
    const onDisk = await fs.readText({ targetKey: `${CWD}/.planning/graphs/graph.json` });
    assert.match(onDisk, /"old"/, "the prior graph.json must be preserved on a failed build");
  });

  // ── (i) pure helpers have no ctx/fs/git params (D-12) ──────────────────────────
  test("(i) pure helpers run with plain object/string/number args (no ctx/fs/git)", () => {
    const nodes = extractNodes({
      roadmap: { milestoneName: "M1", version: "v1.0", phases: [{ n: 1, name: "p1", goal: "g1", requirements: ["GAP-11"] }] },
      requirements: [{ id: "GAP-11", text: "x", complete: false }],
      phases: [{ n: 1, name: "p1", decisions: [{ id: "D-01", text: "d1" }], plans: [{ id: "GSD-45-graphify-01", requirements: ["GAP-11"], depends_on: [], body: "x" }] }],
    });
    assert.ok(Array.isArray(nodes) && nodes.length > 0);

    const edges = extractEdges({
      roadmap: { milestoneName: "M1", version: "v1.0", phases: [{ n: 1, name: "p1", goal: "g1", requirements: ["GAP-11"] }] },
      phases: [{ n: 1, name: "p1", decisions: [{ id: "D-01", text: "d1" }], plans: [{ id: "GSD-45-graphify-01", requirements: ["GAP-11"], depends_on: [], body: "x" }] }],
    });
    assert.ok(Array.isArray(edges) && edges.length > 0);

    const graph = buildGraph({ nodes, edges, hyperedges: [], builtAtCommit: "abc", generated: "2026-01-01T00:00:00Z" });
    assert.equal(graph.meta.built_at_commit, "abc");

    assert.equal(resolveConfidence({ declared: true, mentioned: false, proseTier: "INFERRED" }), "EXTRACTED");
    assert.equal(computeStaleness({ built_at_commit: "abc", mtime: 200 }, "abc", 100).mtime, "FRESH");
    assert.deepEqual(queryGraph({ nodes, edges, hyperedges: [] }, "GAP-11").length, 1);
  });
});

// ── runGraphifyOnShip helper (auto-on-ship hook, D-08) ─────────────────────────
// The helper is PURE ({ cfg, tools, exec } → Promise<string>), so it is tested
// directly with a fake tools array — no mount, no FakeFs, no git/gh, no gsdState
// (mirrors the runLearningsOnShip precedent in test/learnings.test.mjs). The
// graph is project-global, so the auto-run calls execute with { action: 'build' }
// and takes NO phase param (D-04/D-08).

describe("graphify: runGraphifyOnShip helper (auto-on-ship hook, D-08)", () => {
  const exec = {};

  function makeFakeGraphifyTool() {
    const calls = [];
    const tool = {
      name: "gsd_graphify",
      async execute(args, _exec) {
        calls.push(args);
        return "graph built (nodes: 5, edges: 8)";
      },
    };
    return { tool, calls };
  }

  test("workflow.graphify false → skipped, tool never called (D-08)", async () => {
    const { tool, calls } = makeFakeGraphifyTool();
    const cfg = { workflow: { graphify: false } };
    const out = await runGraphifyOnShip({ cfg, tools: [tool], exec });
    assert.match(out, /skipped|disabled/i);
    assert.equal(calls.length, 0, "tool must not be invoked when the flag is off");
    assert.doesNotMatch(out, /graph built/);
  });

  test("workflow.graphify true + tool present → calls execute with action build, returns result line (D-08)", async () => {
    const { tool, calls } = makeFakeGraphifyTool();
    const cfg = { workflow: { graphify: true } };
    const out = await runGraphifyOnShip({ cfg, tools: [tool], exec });
    assert.match(out, /graphify:/i);
    assert.match(out, /graph built/);
    assert.deepEqual(calls[0], { action: 'build' }, "auto-run must build the project-global graph (D-08)");
  });

  test("workflow.graphify true + tool throws → returns non-blocking line with cause, never rejects (D-08)", async () => {
    const failingTool = {
      name: "gsd_graphify",
      async execute() { throw new Error("graph build outage"); },
    };
    const cfg = { workflow: { graphify: true } };
    const out = await runGraphifyOnShip({ cfg, tools: [failingTool], exec });
    assert.match(out, /non-blocking|failed/i);
    assert.match(out, /graph build outage/, "the real cause must be surfaced");
  });

  test("workflow.graphify true + tool absent → returns not-registered/skipped, never throws (D-08, DEGR-05)", async () => {
    const cfg = { workflow: { graphify: true } };
    const out = await runGraphifyOnShip({ cfg, tools: [], exec });
    assert.match(out, /not registered|skipped/i);
    assert.doesNotMatch(out, /graph built/);
  });

  test("cfg absent (no workflow object) → skipped, defends against missing config (optional chaining)", async () => {
    const { tool, calls } = makeFakeGraphifyTool();
    const out = await runGraphifyOnShip({ cfg: undefined, tools: [tool], exec });
    assert.match(out, /skipped|disabled/i);
    assert.equal(calls.length, 0, "tool must not be invoked when cfg has no workflow object");
  });
});

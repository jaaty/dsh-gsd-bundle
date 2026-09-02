// Offline behavioural tests for the mempalace plugin (lib/mempalace.js), TDD per
// D-11. Covers the tracer slice (plan 01): the PURE helpers (resolveWing /
// resolveMode / resolveRecallTopic / buildRecallDoc / buildStub — no ctx, no
// I/O), the gsdMempalace capability registration + order 55 (D-11a, D-01), the
// config gate (mempalace.enabled — disabled prints an activation hint and writes
// nothing, D-03), recall from a fake mempalaceFn (wake-up + search) producing
// MEMORY-RECALL.md with Prior decisions / Patterns / Surprises + provenance
// (D-05), and the recall 'unavailable' stub when the CLI is unreachable (D-08).
//
// Offline only: FakeFs + fake-ctx, no live boot, no LLM/git/gh. The MemPalace
// CLI is a fake mempalaceFn (injected via ctx.mempalaceFn) so no real install is
// needed; git is a fake gitFn so commitArtifacts never hits real git.

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { FakeFs } from "./helpers/fake-fs.mjs";
import { makeMountCtx, makeExec, CWD } from "./helpers/mount-harness.mjs";
import { apply as applyState } from "../lib/state.js";
import { apply as applyCoreTools } from "../lib/core-tools.js";
import {
  apply as applyMempalace,
  resolveWing,
  resolveMode,
  resolveRecallTopic,
  buildRecallDoc,
  buildStub,
  mapArtifactToRoom,
  buildStageTree,
} from "../lib/mempalace.js";
import { buildCapability } from "../lib/_capabilities.js";
import { parseFrontmatter } from "../lib/_shared.js";

// ── pure helpers (D-11e: no ctx/fs/git params) ─────────────────────────────────

describe("mempalace: resolveWing (D-05 — pure wing resolution)", () => {
  test("config.mempalace.wing wins over project_code and repo dir name", () => {
    assert.equal(resolveWing({ mempalace: { wing: "w1" } }, "GSD", "repo"), "w1");
  });

  test("project_code wins over repo dir name when no config wing", () => {
    assert.equal(resolveWing({}, "GSD", "repo"), "GSD");
  });

  test("repo dir name is the fallback when no config wing and no project_code", () => {
    assert.equal(resolveWing({}, null, "repo"), "repo");
  });

  test("default when nothing is available", () => {
    assert.equal(resolveWing({}, null, null), "default");
  });
});

describe("mempalace: resolveMode (D-05/D-09 — pure mode resolution)", () => {
  test("config.mempalace.memory_mode is honored", () => {
    assert.equal(resolveMode({ mempalace: { memory_mode: "replace" } }), "replace");
  });

  test("defaults to augment when absent", () => {
    assert.equal(resolveMode({}), "augment");
  });
});

describe("mempalace: resolveRecallTopic (D-05/OQ-2 — pure topic derivation)", () => {
  test("derives a query from CONTEXT decisions when CONTEXT is present", () => {
    const topic = resolveRecallTopic({ contextText: "## Decisions\n- **D-01:** use X", phaseGoal: "goal" });
    assert.ok(typeof topic === "string" && topic.length > 0, "topic must be a non-empty string");
    assert.match(topic, /use X/, "topic must carry the decision text");
  });

  test("falls back to the phase goal when CONTEXT is absent (discuss:pre, OQ-2)", () => {
    assert.equal(resolveRecallTopic({ contextText: "", phaseGoal: "goal" }), "goal");
  });
});

describe("mempalace: buildRecallDoc (D-05 — pure recall doc renderer)", () => {
  test("renders Prior decisions / Patterns / Surprises sections with provenance", () => {
    const doc = buildRecallDoc({
      wing: "w1",
      mode: "augment",
      topic: "use X",
      results: "drawer: d1\nprior decision: use X\npattern: prefer pure helpers\nsurprise: adding a capability breaks counts",
      nativeFallback: ".planning/graphs/, LEARNINGS.md, STATE",
    });
    assert.match(doc, /Prior decisions/);
    assert.match(doc, /Patterns/);
    assert.match(doc, /Surprises/);
    assert.match(doc, /drawer: d1/, "provenance (drawer id) must be present");
    assert.match(doc, /native/i, "the native fallback note must be present");
  });
});

describe("mempalace: buildStub (D-08 — pure unavailable stub)", () => {
  test("returns a stub naming 'unavailable' and the native fallback", () => {
    const stub = buildStub({ wing: "w1", mode: "augment", cause: "mempalace: command not found" });
    assert.match(stub, /unavailable/);
    assert.match(stub, /native/i);
    assert.match(stub, /command not found/, "the real cause must be surfaced");
  });
});

// ── integration (D-11a/b/c/d) ─────────────────────────────────────────────────

describe("mempalace: gsd_mempalace_recall tool (integration)", () => {
  async function mountMempalace() {
    const fs = new FakeFs();
    const ctx = makeMountCtx(fs, {});
    applyState(ctx, {});
    applyCoreTools(ctx, {});
    applyMempalace(ctx, {});
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

  function runRecall(ctx, args) {
    const t = ctx.tools.find((x) => x.name === "gsd_mempalace_recall");
    assert.ok(t, "gsd_mempalace_recall not registered");
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

  // A controllable fake MemPalace CLI (D-04): records args, returns canned output.
  function makeFakeMempalace(controller) {
    const calls = [];
    const fakeMempalace = async (_cwd, args) => {
      calls.push([...args]);
      if (controller.fail) throw new Error(controller.fail);
      if (args[0] === "wake-up") return controller.wakeUp || "wake-up context";
      if (args[0] === "search") return controller.search || "drawer: d1\nprior decision: use X";
      return "";
    };
    return { calls, fakeMempalace };
  }

  // ── (a) capability registration + order 55 (D-11a, D-01) ────────────────────
  test("(a) gsdMempalace capability registered, order 55, step mempalace, tools/commands/produces match (D-11a)", async () => {
    const { ctx } = await mountMempalace();
    assert.ok(ctx.provided.has("gsdMempalace"), "gsdMempalace must be provided");
    const cap = buildCapability("gsdMempalace");
    assert.equal(cap.order, 55);
    assert.equal(cap.step, "mempalace");
    assert.deepEqual([...cap.tools], ["gsd_mempalace_recall", "gsd_mempalace_capture"]);
    assert.deepEqual([...cap.commands], ["gsd-mempalace-recall", "gsd-mempalace-capture"]);
    assert.deepEqual([...cap.produces], ["MEMORY-RECALL.md"]);
  });

  // ── (b) config gate — disabled prints hint + writes nothing; enabled proceeds (D-11b, D-03) ──
  test("(b) disabled → activation hint, no MEMORY-RECALL.md written (D-03)", async () => {
    const { ctx } = await mountMempalace();
    await bootstrap(ctx, [{ name: "p1", goal: "g1", requirements: ["GAP-12"] }], [{ id: "GAP-12", text: "x" }]);
    const git = makeFakeGit();
    ctx.gitFn = git.fakeGit;
    const gsdState = ctx.get("gsdState");

    const res = await runRecall(ctx, { phase: 1 });
    assert.match(res, /enable|mempalace\.enabled/i, "disabled recall must print an activation hint");
    assert.equal(await gsdState.hasArtifact(CWD, 1, "MEMORY-RECALL"), false, "no MEMORY-RECALL.md must be written when disabled");
  });

  test("(b) enabled → recall proceeds and writes MEMORY-RECALL.md (D-03)", async () => {
    const { fs, ctx } = await mountMempalace();
    await bootstrap(ctx, [{ name: "p1", goal: "g1", requirements: ["GAP-12"] }], [{ id: "GAP-12", text: "x" }]);
    const git = makeFakeGit();
    ctx.gitFn = git.fakeGit;
    const gsdState = ctx.get("gsdState");
    const mp = makeFakeMempalace({});
    ctx.mempalaceFn = mp.fakeMempalace;

    // enable mempalace in config.json
    await fs.writeText({ targetKey: `${CWD}/.planning/config.json` }, JSON.stringify({ mempalace: { enabled: true } }));

    const res = await runRecall(ctx, { phase: 1 });
    assert.match(res, /MEMORY-RECALL|recall/i, "enabled recall must report the recall");
    assert.equal(await gsdState.hasArtifact(CWD, 1, "MEMORY-RECALL"), true, "MEMORY-RECALL.md must be written when enabled");
  });

  // ── (c) recall from a fake mempalaceFn (D-11c, D-05) ────────────────────────
  test("(c) recall runs wake-up + search and writes MEMORY-RECALL.md with sections + provenance (D-05)", async () => {
    const { fs, ctx } = await mountMempalace();
    await bootstrap(ctx, [{ name: "p1", goal: "g1", requirements: ["GAP-12"] }], [{ id: "GAP-12", text: "x" }]);
    const git = makeFakeGit();
    ctx.gitFn = git.fakeGit;
    const gsdState = ctx.get("gsdState");
    const mp = makeFakeMempalace({
      wakeUp: "wake-up context",
      search: "drawer: d1\nprior decision: use X\npattern: prefer pure helpers\nsurprise: adding a capability breaks counts",
    });
    ctx.mempalaceFn = mp.fakeMempalace;

    await fs.writeText({ targetKey: `${CWD}/.planning/config.json` }, JSON.stringify({ mempalace: { enabled: true } }));

    const res = await runRecall(ctx, { phase: 1 });
    assert.match(res, /MEMORY-RECALL/, "recall must report the MEMORY-RECALL.md path");

    // the fake mempalaceFn was called with wake-up and search, both with --wing
    const wakeUp = mp.calls.find((c) => c[0] === "wake-up");
    const search = mp.calls.find((c) => c[0] === "search");
    assert.ok(wakeUp, "wake-up must be called");
    assert.ok(search, "search must be called");
    assert.ok(wakeUp.includes("--wing"), "wake-up must include --wing");
    assert.ok(search.includes("--wing"), "search must include --wing");

    const text = await gsdState.readArtifact(CWD, 1, "MEMORY-RECALL");
    assert.ok(text, "MEMORY-RECALL.md must be on disk");
    assert.match(text, /Prior decisions/);
    assert.match(text, /Patterns/);
    assert.match(text, /Surprises/);
    assert.match(text, /drawer: d1/, "provenance (drawer id) must be present");
  });

  // ── (d) recall stub when the CLI is unreachable (D-11d, D-08) ───────────────
  test("(d) unreachable CLI → tool RESOLVES, writes the 'unavailable' stub naming the native fallback (D-08)", async () => {
    const { fs, ctx } = await mountMempalace();
    await bootstrap(ctx, [{ name: "p1", goal: "g1", requirements: ["GAP-12"] }], [{ id: "GAP-12", text: "x" }]);
    const git = makeFakeGit();
    ctx.gitFn = git.fakeGit;
    const gsdState = ctx.get("gsdState");
    const mp = makeFakeMempalace({ fail: "mempalace: command not found" });
    ctx.mempalaceFn = mp.fakeMempalace;

    await fs.writeText({ targetKey: `${CWD}/.planning/config.json` }, JSON.stringify({ mempalace: { enabled: true } }));

    // must RESOLVE (not reject)
    const res = await runRecall(ctx, { phase: 1 });
    assert.match(res, /unavailable|stub|native/i, "the stub must be reported");

    const text = await gsdState.readArtifact(CWD, 1, "MEMORY-RECALL");
    assert.ok(text, "the stub MEMORY-RECALL.md must be on disk");
    assert.match(text, /unavailable|native/i, "the stub must name the native fallback");
  });
});

// ── capture (D-11e/f/g, D-06) ─────────────────────────────────────────────────

describe("mempalace: gsd_mempalace_capture tool (integration, D-11e/f/g)", () => {
  async function mountMempalace() {
    const fs = new FakeFs();
    const ctx = makeMountCtx(fs, {});
    applyState(ctx, {});
    applyCoreTools(ctx, {});
    applyMempalace(ctx, {});
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

  function runCapture(ctx, args) {
    const t = ctx.tools.find((x) => x.name === "gsd_mempalace_capture");
    assert.ok(t, "gsd_mempalace_capture not registered");
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

  // A controllable fake MemPalace CLI (D-04): records args, returns canned output.
  function makeFakeMempalace(controller) {
    const calls = [];
    const fakeMempalace = async (_cwd, args) => {
      calls.push([...args]);
      if (controller.fail) throw new Error(controller.fail);
      if (args[0] === "wake-up") return controller.wakeUp || "wake-up context";
      if (args[0] === "search") return controller.search || "drawer: d1\nprior decision: use X";
      if (args[0] === "mine") return controller.mine || "mined";
      return "";
    };
    return { calls, fakeMempalace };
  }

  // ── (f) capture staging + mine with room mapping + verbatim content (D-11e, D-06) ──
  test("(f) capture stages CONTEXT verbatim under decisions/ and runs mine with --wing (D-06)", async () => {
    const { fs, ctx } = await mountMempalace();
    await bootstrap(ctx, [{ name: "p1", goal: "g1", requirements: ["GAP-12"] }], [{ id: "GAP-12", text: "x" }]);
    const git = makeFakeGit();
    ctx.gitFn = git.fakeGit;
    const gsdState = ctx.get("gsdState");
    const mp = makeFakeMempalace({});
    ctx.mempalaceFn = mp.fakeMempalace;

    await fs.writeText({ targetKey: `${CWD}/.planning/config.json` }, JSON.stringify({ mempalace: { enabled: true } }));

    const CONTEXT = "---\nphase: 1\n---\n## Decisions\n- **D-01:** first decision\n";
    await gsdState.writeArtifact(CWD, 1, "CONTEXT", CONTEXT);

    const res = await runCapture(ctx, { phase: 1, artifact: "CONTEXT" });
    assert.match(res, /capture|mined|stage/i, "capture must report the staged/mined result");

    const { base } = await gsdState.phaseDirAndBase(CWD, 1);
    const stagedPath = `${CWD}/.planning/.mempalace-stage/decisions/${base}/CONTEXT.md`;
    const staged = await fs.readText({ targetKey: stagedPath });
    assert.equal(staged, CONTEXT, "staged content must be VERBATIM");

    const mine = mp.calls.find((c) => c[0] === "mine");
    assert.ok(mine, "mine must be called");
    assert.ok(mine.includes("--wing"), "mine must include --wing");
    assert.ok(mine.some((a) => String(a).includes(".mempalace-stage")), "mine must target the stage dir");

    const yaml = await fs.readText({ targetKey: `${CWD}/.planning/.mempalace-stage/mempalace.yaml` });
    assert.ok(yaml, "mempalace.yaml must exist in the stage dir");
    assert.match(yaml, /decisions/);
    assert.match(yaml, /planning/);
    assert.match(yaml, /milestones/);
  });

  // ── (g) capture idempotency (D-11f, D-06) ────────────────────────────────────
  test("(g) capture is idempotent — re-run does not duplicate the staged file (D-06)", async () => {
    const { fs, ctx } = await mountMempalace();
    await bootstrap(ctx, [{ name: "p1", goal: "g1", requirements: ["GAP-12"] }], [{ id: "GAP-12", text: "x" }]);
    const git = makeFakeGit();
    ctx.gitFn = git.fakeGit;
    const gsdState = ctx.get("gsdState");
    const mp = makeFakeMempalace({});
    ctx.mempalaceFn = mp.fakeMempalace;

    await fs.writeText({ targetKey: `${CWD}/.planning/config.json` }, JSON.stringify({ mempalace: { enabled: true } }));

    const CONTEXT = "---\nphase: 1\n---\n## Decisions\n- **D-01:** first decision\n";
    await gsdState.writeArtifact(CWD, 1, "CONTEXT", CONTEXT);

    await runCapture(ctx, { phase: 1, artifact: "CONTEXT" });
    await runCapture(ctx, { phase: 1, artifact: "CONTEXT" });

    const { base } = await gsdState.phaseDirAndBase(CWD, 1);
    const roomDir = `${CWD}/.planning/.mempalace-stage/decisions/${base}`;
    const entries = await fs.listDir({ targetKey: roomDir });
    const contextFiles = entries.filter((e) => e.name === "CONTEXT.md");
    assert.equal(contextFiles.length, 1, "re-running capture must not duplicate the staged file (stable path)");
  });

  // ── (h) mirror_kg gating (D-11g, D-06/OQ-1) ─────────────────────────────────
  test("(h) mirror_kg false skips the KG step; true reports CLI-unavailable and never throws (OQ-1)", async () => {
    const { fs, ctx } = await mountMempalace();
    await bootstrap(ctx, [{ name: "p1", goal: "g1", requirements: ["GAP-12"] }], [{ id: "GAP-12", text: "x" }]);
    const git = makeFakeGit();
    ctx.gitFn = git.fakeGit;
    const gsdState = ctx.get("gsdState");
    const mp = makeFakeMempalace({});
    ctx.mempalaceFn = mp.fakeMempalace;

    const CONTEXT = "---\nphase: 1\n---\n## Decisions\n- **D-01:** first decision\n";
    await gsdState.writeArtifact(CWD, 1, "CONTEXT", CONTEXT);

    // mirror_kg: false → no KG step reported
    await fs.writeText({ targetKey: `${CWD}/.planning/config.json` }, JSON.stringify({ mempalace: { enabled: true, mirror_kg: false } }));
    const resFalse = await runCapture(ctx, { phase: 1, artifact: "CONTEXT" });
    assert.doesNotMatch(resFalse, /requires MCP|CLI-only/i, "mirror_kg false must not report the CLI-unavailable KG limitation");

    // mirror_kg: true (default) → reports CLI-unavailable, never throws
    await fs.writeText({ targetKey: `${CWD}/.planning/config.json` }, JSON.stringify({ mempalace: { enabled: true } }));
    const resTrue = await runCapture(ctx, { phase: 1, artifact: "CONTEXT" });
    assert.match(resTrue, /KG mirroring|requires MCP|CLI-only/i, "mirror_kg true must report the CLI-unavailable limitation");
  });

  // ── (i) pure helpers (D-11) ─────────────────────────────────────────────────
  test("(i) mapArtifactToRoom + buildStageTree pure helpers (D-06)", () => {
    assert.equal(mapArtifactToRoom("CONTEXT"), "decisions");
    assert.equal(mapArtifactToRoom("PLAN"), "planning");
    assert.equal(mapArtifactToRoom("SUMMARY"), "milestones");
    assert.equal(mapArtifactToRoom("UNKNOWN"), "general");
    const tree = buildStageTree({ room: "decisions", phaseId: "GSD-46-mempalace", artifactName: "CONTEXT.md", content: "verbatim" });
    assert.match(tree.path, /\.mempalace-stage\/decisions\/GSD-46-mempalace\//);
    assert.equal(tree.content, "verbatim");
  });
});

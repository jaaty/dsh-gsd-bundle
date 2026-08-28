// MOUNT-04 proof: execute() smoke calls for the 5 gsd_* phase tools that had no
// existing execute test (gsd_new_milestone, gsd_progress, gsd_quick, gsd_ui_phase,
// gsd_verify) plus the gsd_ship fail-loud preflight guard. Reuses the
// registerTool/makeCtx/makeSubagents pattern from tools.test.mjs (D-04) with
// added canned handlers for ui-researcher, ui-checker, and quick labels.
// Offline on FakeFs/fake-ctx throughout — gsd_quick included, now that its
// TASK.md write routes through ctx.fs via GsdState.writeQuickRecord (DUR-06).

import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";

import { FakeFs } from "./helpers/fake-fs.mjs";
import { buildProject, FENCED_PLAN, FENCED_SUMMARY, VERIFICATION_PASSED } from "./helpers/project.mjs";

const CWD = "/project";
let fs;
let svc;
let ctx;

const exec = {
  agent: { session: { header: { cwd: CWD } } },
  signal: { aborted: false, addEventListener() {}, removeEventListener() {} },
};

// Fake subagents service — mirrors tools.test.mjs's makeSubagents but adds the
// three new canned branches required by the gap tools (ui-researcher,
// ui-checker, quick) per the RESEARCH fake-subagent coverage gap. Writes canned
// artefacts directly to the shared FakeFs and returns a settled result.
function makeSubagents() {
  return {
    getProvider: (n) => (n === "spawn" ? { spawn: true } : undefined),
    async start(_n, req) {
      const label = req.label;
      let text = "done";
      if (label.startsWith("planner") && !label.includes("revise")) {
        await fs.writeText({ targetKey: `${CWD}/.planning/phases/01-auth/01-auth-01-PLAN.md` }, FENCED_PLAN);
        text = "## PLANNING COMPLETE";
      } else if (label.startsWith("plan-checker")) {
        text = "## VERIFICATION PASSED";
      } else if (label.startsWith("execute")) {
        await fs.writeText({ targetKey: `${CWD}/.planning/phases/01-auth/01-auth-01-SUMMARY.md` }, FENCED_SUMMARY);
        text = "executor done";
      } else if (label.startsWith("verify")) {
        await fs.writeText({ targetKey: `${CWD}/.planning/phases/01-auth/01-auth-VERIFICATION.md` }, VERIFICATION_PASSED);
        text = "status: passed, score: 2/2";
      } else if (label.startsWith("plan research")) {
        text = "# RESEARCH\n\n## Open Questions\n\n- none (RESOLVED)\n\nStandard.";
      } else if (label.startsWith("map-codebase")) {
        const focus = label.split(/\s+/)[1] || "tech";
        const docsByFocus = {
          tech: ["STACK", "INTEGRATIONS"],
          arch: ["ARCHITECTURE", "STRUCTURE"],
          quality: ["CONVENTIONS", "TESTING"],
          concerns: ["CONCERNS"],
          "tech+arch": ["STACK", "INTEGRATIONS", "ARCHITECTURE", "STRUCTURE"],
        };
        for (const d of docsByFocus[focus] || []) {
          const lines = [`# ${d}`, "", `**Analysis Date:** 2026-08-22`, ""];
          while (lines.length < 24) lines.push(`- ${d} finding ${lines.length}.`);
          lines.push("", `*${d} analysis: 2026-08-22*`);
          await fs.writeText({ targetKey: `${CWD}/.planning/codebase/${d}.md` }, lines.join("\n"));
        }
        text = `## Mapping Complete\n**Focus:** ${focus}\nDocuments written.`;
      } else if (label.startsWith("ui-researcher")) {
        // >=50 chars so gsd_ui_phase does not short-circuit (lib/ui.js:50).
        text = "# UI-SPEC\n\n## Layout\n\nA two-pane editor: a sidebar listing phases and a main canvas with the phase artefacts. Toolbar at top with action buttons. Status bar at bottom.";
      } else if (label.startsWith("ui-checker")) {
        // contains "VERIFICATION PASSED" so the passed branch is taken (lib/ui.js:61-62).
        text = "## VERIFICATION PASSED\nThe UI-SPEC is complete and unambiguous.";
      } else if (label.startsWith("quick")) {
        // gsd_quick records r.output (lib/quick.js:53).
        text = "quick subagent finished the task";
      }
      return { result: { output: [{ type: "text", text }], stopReason: "completed" }, dispose: () => {} };
    },
  };
}

function makeCtx() {
  return {
    fs,
    get: (n) =>
      n === "gsdState" ? svc : n === "subagents" ? makeSubagents() : n === "tools" ? { register() {} } : undefined,
    provide() {},
    effect: () => () => {},
    tools: { register() {} },
  };
}

async function registerTool(pluginFile, toolName) {
  const mod = await import(`../lib/${pluginFile}.js`);
  const tools = [];
  const c = makeCtx();
  c.tools = { register: (t) => tools.push(t) };
  mod.apply(c, {});
  const t = tools.find((x) => x.name === toolName);
  assert.ok(t, `${toolName} not registered by ${pluginFile}`);
  return { t, c };
}

describe("gsd_new_milestone", () => {
  beforeEach(async () => {
    fs = new FakeFs();
    svc = await buildProject(fs, CWD);
    ctx = makeCtx();
  });

  test("appends phases and updates STATE milestone", async () => {
    const { t } = await registerTool("core-tools", "gsd_new_milestone");
    const res = await t.execute(
      {
        milestoneName: "M2",
        version: "v2.0",
        phases: [{ name: "ship", goal: "Ship it", requirements: ["AUTH-02"] }],
        requirements: [{ id: "AUTH-02", text: "logout" }],
      },
      exec,
    );
    assert.match(res, /New milestone/);
    const rm = await svc.readRoadmap(CWD);
    assert.equal(rm.phases.length, 2);
    assert.equal(rm.phases[1].n, 2);
    assert.equal(rm.milestoneName, "M2");
    const st = await svc.readState(CWD);
    assert.equal(st.frontmatter.milestone, "v2.0");
  });
});

describe("gsd_progress", () => {
  beforeEach(async () => {
    fs = new FakeFs();
    svc = await buildProject(fs, CWD);
    ctx = makeCtx();
  });

  test("renders progress without throwing", async () => {
    const { t } = await registerTool("core-tools", "gsd_progress");
    const res = await t.execute({}, exec);
    assert.match(res, /# GSD PROGRESS/);
    assert.match(res, /Phase 01 auth/);
  });

  test("phase-scoped progress lists plan waves", async () => {
    await svc.writeArtifact(CWD, 1, "PLAN-01", FENCED_PLAN);
    const { t } = await registerTool("core-tools", "gsd_progress");
    const res = await t.execute({ phase: 1 }, exec);
    assert.match(res, /Phase 1 plans/);
  });
});

describe("gsd_ui_phase", () => {
  beforeEach(async () => {
    fs = new FakeFs();
    svc = await buildProject(fs, CWD);
    ctx = makeCtx();
  });

  test("writes UI-SPEC and advances STATE to plan", async () => {
    const { t } = await registerTool("ui", "gsd_ui_phase");
    const res = await t.execute({ phase: 1, notes: "two-pane editor" }, exec);
    assert.match(res, /gsd_ui_phase complete/);
    assert.match(res, /VERIFICATION PASSED/);
    assert.ok(fs.files.has(`${CWD}/.planning/phases/01-auth/01-auth-UI-SPEC.md`));
    const st = await svc.readState(CWD);
    assert.equal(st.frontmatter.status, "plan");
  });
});

describe("gsd_verify", () => {
  beforeEach(async () => {
    fs = new FakeFs();
    svc = await buildProject(fs, CWD);
    ctx = makeCtx();
  });

  test("writes VERIFICATION status:passed and advances STATE to ship", async () => {
    // gsd_verify returns early if no plans or any plan lacks a SUMMARY (R4).
    await svc.writeArtifact(CWD, 1, "PLAN-01", FENCED_PLAN);
    await svc.markPlanSummary(CWD, 1, 1, FENCED_SUMMARY);
    const { t } = await registerTool("verify", "gsd_verify");
    const res = await t.execute({ phase: 1 }, exec);
    assert.match(res, /Phase 1 verified/);
    assert.ok(fs.files.has(`${CWD}/.planning/phases/01-auth/01-auth-VERIFICATION.md`));
    const st = await svc.readState(CWD);
    assert.equal(st.frontmatter.status, "ship");
  });
});

// gsd_quick routes its TASK.md write through GsdState.writeQuickRecord → ctx.fs
// (lib/quick.js), so its happy path now runs on pure FakeFs at cwd=/project —
// proving the raw-fs bypass (OQ-1) is gone (DUR-06).
describe("gsd_quick", () => {
  beforeEach(async () => {
    fs = new FakeFs();
    svc = await buildProject(fs, CWD);
    ctx = makeCtx();
  });

  test("records the task entry through ctx.fs on FakeFs", async () => {
    const { t } = await registerTool("quick", "gsd_quick");
    const res = await t.execute({ task: "fix the typo in README", slug: "fix-typo" }, exec);
    assert.match(res, /gsd_quick done/);

    // TASK.md lands on the FakeFs file map at .planning/quick/<date>-<slug>/TASK.md.
    const key = [...fs.files.keys()].find((k) => k.includes("/.planning/quick/") && k.endsWith("/TASK.md"));
    assert.ok(key, "quick TASK.md not written to FakeFs");
    assert.match(key, /\/.planning\/quick\/\d{4}-\d{2}-\d{2}-fix-typo\/TASK\.md$/);
    const entry = fs.files.get(key);
    assert.match(entry, /# Quick task/);
    assert.match(entry, /fix the typo in README/);
  });
});

describe("gsd_ship", () => {
  test("preflight fails loud on a non-repo cwd", async () => {
    fs = new FakeFs();
    svc = await buildProject(fs, CWD);
    ctx = makeCtx();
    // Seed a PASSED verification so gate 1 passes (lib/ship.js:56-59).
    await svc.writeArtifact(CWD, 1, "VERIFICATION", VERIFICATION_PASSED);
    const { t } = await registerTool("ship", "gsd_ship");
    // cwd "/project" does not exist on the real filesystem, so gitOk returns ""
    // and gate 3 fires "could not determine current branch" (lib/ship.js:68),
    // producing the /gsd_ship preflight failed:/ throw (D-03 fail-loud guard).
    await assert.rejects(() => t.execute({ phase: 1 }, exec), /gsd_ship preflight failed:/);
  });
});

// Phase 19 (CBQX-01): the codebase-map drift manifest round-trips through
// gsdState's artefact model (DUR-06 — write routes via _write → ctx.fs, never
// raw node:fs). Follows the existing gsdState codebase-doc fixture pattern:
// buildProject + FakeFs at CWD, service methods called via `svc`.
describe("gsdState codebase-map manifest", () => {
  beforeEach(async () => {
    fs = new FakeFs();
    svc = await buildProject(fs, CWD);
    ctx = makeCtx();
  });

  test("returns null before any write and for a corrupt payload", async () => {
    assert.equal(await svc.readCodebaseManifest(CWD), null);
    // corrupt JSON -> null (tolerant, never throws)
    fs.files.set(`${CWD}/.planning/codebase/.map-manifest.json`, "{ not valid json");
    assert.equal(await svc.readCodebaseManifest(CWD), null);
    // non-array JSON -> null
    fs.files.set(`${CWD}/.planning/codebase/.map-manifest.json`, JSON.stringify({ paths: [] }));
    assert.equal(await svc.readCodebaseManifest(CWD), null);
  });

  test("round-trips records through write -> read with no data loss", async () => {
    const records = [
      { path: "src/a.ts", size: 12, hash: "abc123" },
      { path: "src/b.ts", size: 8, hash: "def456" },
    ];
    await svc.writeCodebaseManifest(CWD, records);
    const read = await svc.readCodebaseManifest(CWD);
    assert.deepEqual(read, records);
    // manifest lands on FakeFs at the expected .planning artefact path
    assert.ok(fs.files.has(`${CWD}/.planning/codebase/.map-manifest.json`));
  });

  test("a second write overwrites the previous manifest", async () => {
    await svc.writeCodebaseManifest(CWD, [{ path: "a.ts", size: 1, hash: "h1" }]);
    await svc.writeCodebaseManifest(CWD, [{ path: "b.ts", size: 2, hash: "h2" }]);
    const read = await svc.readCodebaseManifest(CWD);
    assert.deepEqual(read, [{ path: "b.ts", size: 2, hash: "h2" }]);
  });
});
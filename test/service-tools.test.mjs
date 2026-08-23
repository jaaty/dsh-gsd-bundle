// MOUNT-04 proof: execute() smoke calls for the 5 gsd_* phase tools that had no
// existing execute test (gsd_new_milestone, gsd_progress, gsd_quick, gsd_ui_phase,
// gsd_verify) plus the gsd_ship fail-loud preflight guard. Reuses the
// registerTool/makeCtx/makeSubagents pattern from tools.test.mjs (D-04) with
// added canned handlers for ui-researcher, ui-checker, and quick labels.
// Offline on FakeFs/fake-ctx, except gsd_quick which needs a real temp cwd
// because it writes TASK.md via node:fs/promises (OQ-1).

import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fsPromises from "node:fs/promises";

import { GsdState } from "../lib/state.js";
import { FakeFs, stateCtx, realFsAdapter } from "./helpers/fake-fs.mjs";
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
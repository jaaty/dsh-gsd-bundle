// Tool-level regression tests. These exercise the real gsd_* tool executes with
// a fake host fs + fake subagents service — no LLM, no real git/gh. Deterministic.

import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";

import { GsdState } from "../lib/state.js";
import { FakeFs, stateCtx } from "./helpers/fake-fs.mjs";
import { buildProject, FENCED_PLAN, FENCELESS_PLAN, FENCED_SUMMARY, VERIFICATION_PASSED } from "./helpers/project.mjs";

const CWD = "/project";
let fs;
let svc;
let ctx;

const exec = {
  agent: { session: { header: { cwd: CWD } } },
  signal: { aborted: false, addEventListener() {}, removeEventListener() {} },
};

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

describe("gsd_discuss", () => {
  beforeEach(async () => {
    fs = new FakeFs();
    svc = await buildProject(fs, CWD);
    ctx = makeCtx();
  });

  test("writes CONTEXT.md and advances STATE to plan", async () => {
    const { t } = await registerTool("discuss", "gsd_discuss");
    const res = await t.execute(
      {
        phase: 1,
        domain: { in_scope: "login", out_of_scope: "2fa" },
        decisions: [{ area: "auth", items: [{ id: "D-01", text: "Use cookies" }] }],
        canonical_refs: [{ topic: "auth", refs: ["src/auth.js"] }],
      },
      exec,
    );
    assert.match(res, /Discuss complete/);
    assert.ok(fs.files.has(`${CWD}/.planning/phases/01-auth/01-auth-CONTEXT.md`));
    const st = await svc.readState(CWD);
    assert.equal(st.frontmatter.status, "plan");
  });
});

describe("gsd_execute", () => {
  beforeEach(async () => {
    fs = new FakeFs();
    svc = await buildProject(fs, CWD);
    await svc.writeArtifact(CWD, 1, "PLAN-01", FENCED_PLAN);
    ctx = makeCtx();
  });

  test("--gaps-only runs only gap_closure plans (boolean true in frontmatter)", async () => {
    // BUG: the old filter `p.gap_closure === "true"` never matched the boolean
    // parsed from YAML, so --gaps-only silently ran nothing.
    const { t } = await registerTool("execute", "gsd_execute");
    const res = await t.execute({ phase: 1, gapsOnly: true }, exec);
    assert.ok(fs.files.has(`${CWD}/.planning/phases/01-auth/01-auth-01-SUMMARY.md`), "gaps-only must execute the gap_closure plan");
    assert.match(res, /01-auth-01 ✓/);
  });

  test("--gaps-only skips a plan without gap_closure", async () => {
    const noGap = FENCELESS_PLAN.replace("gap_closure: true", "gap_closure: false");
    await svc.writeArtifact(CWD, 1, "PLAN-01", noGap);
    const { t } = await registerTool("execute", "gsd_execute");
    const res = await t.execute({ phase: 1, gapsOnly: true }, exec);
    assert.ok(!fs.files.has(`${CWD}/.planning/phases/01-auth/01-auth-01-SUMMARY.md`), "non-gap plan must not run under --gaps-only");
    assert.match(res, /incomplete/);
  });
});

describe("gsd_plan closed-phase gate", () => {
  beforeEach(async () => {
    fs = new FakeFs();
    svc = await buildProject(fs, CWD);
    await svc.writeArtifact(CWD, 1, "VERIFICATION", VERIFICATION_PASSED);
    await svc.writeArtifact(CWD, 1, "CONTEXT", "# ctx"); // plan also requires CONTEXT after the gate clears
    ctx = makeCtx();
  });

  test("rejects replanning a passed phase without force", async () => {
    const { t } = await registerTool("plan", "gsd_plan");
    await assert.rejects(() => t.execute({ phase: 1 }, exec), /force=true/);
  });

  test("force=true clears the gate and plans anyway", async () => {
    const { t } = await registerTool("plan", "gsd_plan");
    const res = await t.execute({ phase: 1, force: true, skipResearch: true }, exec);
    assert.match(res, /gsd_plan complete/);
  });
});

describe("gsd_ship preflight (no git/gh)", () => {
  test("missing VERIFICATION.md fails preflight with a clear message", async () => {
    fs = new FakeFs();
    svc = await buildProject(fs, CWD);
    const { t } = await registerTool("ship", "gsd_ship");
    await assert.rejects(() => t.execute({ phase: 1 }, exec), /no VERIFICATION\.md/);
  });
});

describe("gsd_status", () => {
  test("renders progress without throwing", async () => {
    fs = new FakeFs();
    svc = await buildProject(fs, CWD);
    const { t } = await registerTool("core-tools", "gsd_status");
    const res = await t.execute({}, exec);
    assert.match(res, /Milestone: M1/);
    assert.match(res, /Progress:/);
  });
});

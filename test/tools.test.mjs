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

// Track how the checkpoint-aware fake executor behaved across a single
// gsd_execute call (resume tests assert the exact prompt + spawn count).
let executeSpawnCount = 0;
const executeCaptured = [];

// A two-task plan so a checkpoint at task 1 is in-range (1 < task_count=2).
const PLAN_2_TASKS = `---
phase: 01-auth
plan: 01
type: execute
wave: 1
depends_on: []
files_modified: ["src/auth.js"]
autonomous: false
requirements: ["AUTH-01"]
gap_closure: true
---
<objective>add login and logout</objective>
<context>src</context>
<tasks>
<task type="auto">
<name>Task 1</name>
<files>src/auth.js</files>
<read_first>src</read_first>
<action>implement login</action>
<verify>node --check src/auth.js</verify>
<acceptance_criteria>- src/auth.js exists</acceptance_criteria>
<done>done</done>
</task>
<task type="auto">
<name>Task 2</name>
<files>src/auth.js</files>
<read_first>src</read_first>
<action>implement logout</action>
<verify>node --check src/auth.js</verify>
<acceptance_criteria>- ok</acceptance_criteria>
<done>done</done>
</task>
</tasks>`;

// A persisted CHECKPOINT artefact whose last_completed_task=1 is valid for PLAN_2_TASKS.
const CHECKPOINT_FM = `---
plan: 01-auth-01
last_completed_task: 1
checkpoint_reason: human-verify
committed_hashes: ["a"]
---
# checkpoint`;

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
      let structured;
      if (label.startsWith("planner") && !label.includes("revise")) {
        await fs.writeText({ targetKey: `${CWD}/.planning/phases/01-auth/01-auth-01-PLAN.md` }, FENCED_PLAN);
        text = "## PLANNING COMPLETE";
      } else if (label.startsWith("plan-checker")) {
        text = "## VERIFICATION PASSED";
      } else if (label.startsWith("execute")) {
        executeSpawnCount++;
        executeCaptured.push(req.prompt[0]?.text || "");
        const cpKey = `${CWD}/.planning/phases/01-auth/01-auth-01-CHECKPOINT.md`;
        if (fs.files.has(cpKey)) {
          // resume path: an existing CHECKPOINT means the executor continues and completes
          await fs.writeText({ targetKey: `${CWD}/.planning/phases/01-auth/01-auth-01-SUMMARY.md` }, FENCED_SUMMARY);
          text = "executor done";
        } else {
          // first run: stop at a checkpoint task, return structured checkpoint, no SUMMARY
          text = "checkpoint reached at task 1";
          structured = { checkpoint: { plan: "01-auth-01", last_completed_task: 1, checkpoint_reason: "human-verify", committed_hashes: ["a"] } };
        }
      } else if (label.startsWith("verify")) {
        await fs.writeText({ targetKey: `${CWD}/.planning/phases/01-auth/01-auth-VERIFICATION.md` }, VERIFICATION_PASSED);
        text = "status: passed, score: 2/2";
      } else if (label.startsWith("plan research")) {
        text = "# RESEARCH\n\n## Open Questions\n\n- none (RESOLVED)\n\nStandard.";
      } else if (label.startsWith("map-codebase")) {
        // Fake gsd-codebase-mapper: writes the focus's documents directly,
        // each >20 lines so the orchestrator's verify step passes.
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
      }
      return { result: { output: [{ type: "text", text }], stopReason: "completed", structured }, dispose: () => {} };
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
    assert(fs.files.has(`${CWD}/.planning/phases/01-auth/01-auth-CONTEXT.md`));
    const st = await svc.readState(CWD);
    assert.equal(st.frontmatter.status, "plan");
  });
});

describe("gsd_execute", () => {
  beforeEach(async () => {
    fs = new FakeFs();
    svc = await buildProject(fs, CWD);
    await svc.writeArtifact(CWD, 1, "PLAN-01", FENCED_PLAN);
    executeSpawnCount = 0;
    executeCaptured.length = 0;
    ctx = makeCtx();
  });

  test("--gaps-only runs only the plans with gap_closure true", async () => {
    // the checkpoint-aware fake writes SUMMARY only when a CHECKPOINT is present,
    // so seed a valid checkpoint to let the gap_closure plan resume + complete.
    await svc.writeArtifact(CWD, 1, "PLAN-01", PLAN_2_TASKS);
    await svc.writeArtifact(CWD, 1, "CHECKPOINT-01", CHECKPOINT_FM);
    const { t } = await registerTool("execute", "gsd_execute");
    const res = await t.execute({ phase: 1, gapsOnly: true }, exec);
    assert(fs.files.has(`${CWD}/.planning/phases/01-auth/01-auth-01-SUMMARY.md`), "gaps-only must execute the gap_closure plan");
    assert.match(res, /01-auth-01 ✓/);
  });

  test("--gaps-only skips a plan without gap_closure", async () => {
    const noGap = FENCELESS_PLAN.replace("gap_closure: true", "gap_closure: false");
    await svc.writeArtifact(CWD, 1, "PLAN-01", noGap);
    const { t } = await registerTool("execute", "gsd_execute");
    const res = await t.execute({ phase: 1, gapsOnly: true }, exec);
    assert(!fs.files.has(`${CWD}/.planning/phases/01-auth/01-auth-01-SUMMARY.md`), "non-gap plan must not run under --gaps-only");
    assert.match(res, /incomplete/);
  });

  test("persists a checkpointed executor return and leaves the plan incomplete (DUR-01)", async () => {
    await svc.writeArtifact(CWD, 1, "PLAN-01", PLAN_2_TASKS);
    const { t } = await registerTool("execute", "gsd_execute");
    const res = await t.execute({ phase: 1 }, exec);
    assert(fs.files.has(`${CWD}/.planning/phases/01-auth/01-auth-01-CHECKPOINT.md`), "CHECKPOINT-01 must be persisted from the structured return");
    assert(!fs.files.has(`${CWD}/.planning/phases/01-auth/01-auth-01-SUMMARY.md`), "SUMMARY-01 must not be written on a checkpoint stop");
    assert.match(res, /checkpoint/);
    const st = await svc.readState(CWD);
    assert.equal(st.frontmatter.status, "execute", "plan stays incomplete -> STATE stays execute");
  });

  test("resumes a checkpointed plan from the last completed task (DUR-02/D-04)", async () => {
    await svc.writeArtifact(CWD, 1, "PLAN-01", PLAN_2_TASKS);
    await svc.writeArtifact(CWD, 1, "CHECKPOINT-01", CHECKPOINT_FM);
    const { t } = await registerTool("execute", "gsd_execute");
    const res = await t.execute({ phase: 1 }, exec);
    const prompt = executeCaptured[0] || "";
    assert.match(prompt, /RESUME from checkpoint/);
    assert.match(prompt, /last_completed_task/);
    assert.match(prompt, /begin at task 2/);
    assert(fs.files.has(`${CWD}/.planning/phases/01-auth/01-auth-01-SUMMARY.md`), "resumed executor writes SUMMARY and completes");
    assert.match(res, /01-auth-01 ✓/);
  });

  test("a corrupt/out-of-range checkpoint fails loud instead of re-running from task 1 (D-05)", async () => {
    await svc.writeArtifact(CWD, 1, "PLAN-01", PLAN_2_TASKS);
    const bad = CHECKPOINT_FM.replace("last_completed_task: 1", "last_completed_task: 9");
    await svc.writeArtifact(CWD, 1, "CHECKPOINT-01", bad);
    const { t } = await registerTool("execute", "gsd_execute");
    await assert.rejects(() => t.execute({ phase: 1 }, exec), /invalid CHECKPOINT-01/);
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

describe("gsd_map_codebase", () => {
  beforeEach(async () => {
    fs = new FakeFs();
    svc = await buildProject(fs, CWD);
    ctx = makeCtx();
  });

  const DOCS = ["STACK", "INTEGRATIONS", "ARCHITECTURE", "STRUCTURE", "CONVENTIONS", "TESTING", "CONCERNS"];

  test("full mode spawns 4 mappers and writes all 7 documents", async () => {
    const { t } = await registerTool("map-codebase", "gsd_map_codebase");
    const res = await t.execute({ force: true }, exec);
    assert.match(res, /Codebase mapping complete/);
    for (const d of DOCS) assert(fs.files.has(`${CWD}/.planning/codebase/${d}.md`), `${d}.md should be written`);
    assert.doesNotMatch(res, /thin documents/);
    assert.doesNotMatch(res, /missing documents/);
  });

  test("fast mode focus arch writes only ARCHITECTURE.md and STRUCTURE.md", async () => {
    const { t } = await registerTool("map-codebase", "gsd_map_codebase");
    const res = await t.execute({ fast: true, focus: "arch", force: true }, exec);
    assert.match(res, /Codebase mapping complete/);
    assert(fs.files.has(`${CWD}/.planning/codebase/ARCHITECTURE.md`));
    assert(fs.files.has(`${CWD}/.planning/codebase/STRUCTURE.md`));
    assert(!fs.files.has(`${CWD}/.planning/codebase/STACK.md`), "tech docs must not be written in fast arch mode");
    assert(!fs.files.has(`${CWD}/.planning/codebase/CONCERNS.md`));
  });

  test("invalid fast focus is rejected by the schema and spawns nothing", async () => {
    const { t } = await registerTool("map-codebase", "gsd_map_codebase");
    await assert.rejects(() => t.execute({ fast: true, focus: "bogus" }, exec), /focus|VALID_ARGS|must be one of/i);
    for (const d of DOCS) assert(!fs.files.has(`${CWD}/.planning/codebase/${d}.md`), "no documents should be written for an invalid focus");
  });

  test("existing map without force returns a notice and does not remap", async () => {
    await fs.writeText({ targetKey: `${CWD}/.planning/codebase/STACK.md` }, "# old\n");
    const { t } = await registerTool("map-codebase", "gsd_map_codebase");
    const res = await t.execute({}, exec);
    assert.match(res, /already exists/);
    assert.match(res, /STACK\.md/);
    assert.doesNotMatch(res, /Codebase mapping complete/);
  });

  test("force=true refreshes an existing map", async () => {
    await fs.writeText({ targetKey: `${CWD}/.planning/codebase/STACK.md` }, "# old\n");
    const { t } = await registerTool("map-codebase", "gsd_map_codebase");
    const res = await t.execute({ force: true }, exec);
    assert.match(res, /Codebase mapping complete/);
    for (const d of DOCS) assert(fs.files.has(`${CWD}/.planning/codebase/${d}.md`));
  });

  test("paths incremental remap bypasses the existing-check", async () => {
    await fs.writeText({ targetKey: `${CWD}/.planning/codebase/STACK.md` }, "# old\n");
    const { t } = await registerTool("map-codebase", "gsd_map_codebase");
    const res = await t.execute({ paths: ["lib/"] }, exec);
    assert.match(res, /Codebase mapping complete/);
  });

  test("rejects forbidden path scope values and falls back to whole-repo", async () => {
    const { t } = await registerTool("map-codebase", "gsd_map_codebase");
    const res = await t.execute({ paths: ["../escape", "/abs", "lib/;rm"] }, exec);
    assert.match(res, /Codebase mapping complete/);
    // all forbidden -> whole repo -> all 7 docs
    for (const d of DOCS) assert(fs.files.has(`${CWD}/.planning/codebase/${d}.md`));
  });
});

// Tool-level regression tests. These exercise the real gsd_* tool executes with
// a fake host fs + fake subagents service — no LLM, no real git/gh. Deterministic.

import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import os from "node:os";
import { mkdtemp, rm } from "node:fs/promises";

import { GsdState } from "../lib/state.js";
import { resolvePlanDep, parseFrontmatter } from "../lib/_shared.js";
import { CODEBASE_QUERY_PROMPT } from "../lib/_agents.js";
import { apply as applyCommands } from "../lib/commands.js";
import { FakeFs, stateCtx, realFsAdapter } from "./helpers/fake-fs.mjs";
import { buildProject, FENCED_PLAN, FENCELESS_PLAN, FENCED_SUMMARY, VERIFICATION_PASSED } from "./helpers/project.mjs";

const CWD = "/project";
let fs;
let svc;
let ctx;

// Track how the checkpoint-aware fake executor behaved across a single
// gsd_execute call (resume tests assert the exact prompt + spawn count).
let executeSpawnCount = 0;
const executeCaptured = [];
// When true, the fake executor stops at a checkpoint (returns structured
// checkpoint state, writes no SUMMARY). When false it completes normally.
// On a resume run (a CHECKPOINT artefact already exists) it always completes.
let EXEC_CHECKPOINT_MODE = false;
// When true, the fake codebase-query subagent returns empty output with a
// "failed" stopReason (query-mode failure-path test).
let QUERY_FAIL_MODE = false;

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

// A pending decision checkpoint awaiting a human answer (D-01/D-03/D-05): carries
// the deterministic decision_id the driving agent must echo back to resume.
const CHECKPOINT_DECISION = `---
plan: 01-auth-01
last_completed_task: 1
checkpoint_reason: human-verify
committed_hashes: ["a"]
checkpoint_kind: decision
decision_id: 01-auth-01-ck1
---
# checkpoint`;

// A checkpoint already answered on a prior turn (D-04): the persisted human_answer
// lets a later call resume with no args (context-reset resume).
const CHECKPOINT_ANSWERED = `---
plan: 01-auth-01
last_completed_task: 1
checkpoint_reason: human-verify
committed_hashes: ["a"]
decision_id: 01-auth-01-ck1
human_answer: use pg
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
      let stopReason = "completed";
      if (label.startsWith("planner") && !label.includes("revise")) {
        await fs.writeText({ targetKey: `${CWD}/.planning/phases/01-auth/01-auth-01-PLAN.md` }, FENCED_PLAN);
        text = "## PLANNING COMPLETE";
      } else if (label.startsWith("plan-checker")) {
        text = "## VERIFICATION PASSED";
      } else if (label.startsWith("execute")) {
        executeSpawnCount++;
        executeCaptured.push(req.prompt[0]?.text || "");
        const cpKey = `${CWD}/.planning/phases/01-auth/01-auth-01-CHECKPOINT.md`;
        if (EXEC_CHECKPOINT_MODE && !fs.files.has(cpKey)) {
          // checkpoint stop: return structured checkpoint state, no SUMMARY
          text = "checkpoint reached at task 1";
          structured = { checkpoint: { plan: "01-auth-01", last_completed_task: 1, checkpoint_reason: "human-verify", committed_hashes: ["a"], checkpoint_kind: "decision" } };
        } else {
          // resume path (an existing CHECKPOINT) or a normal run: complete
          await fs.writeText({ targetKey: `${CWD}/.planning/phases/01-auth/01-auth-01-SUMMARY.md` }, FENCED_SUMMARY);
          text = "executor done";
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
      } else if (label.startsWith("codebase-query")) {
        if (QUERY_FAIL_MODE) {
          text = "";
          stopReason = "failed";
        } else {
          text = "The auth flow uses JWT via lib/auth.js.\n\nSources:\n- ARCHITECTURE.md (map)\n- lib/auth.js (codebase)";
        }
      }
      return { result: { output: [{ type: "text", text }], stopReason, structured }, dispose: () => {} };
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

// Poll the async-jobs manifest until a job reaches a status, bounded (real fs).
async function waitForJobStatus(s, cwd, id, status, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const { entries } = await s.readJobs(cwd);
    const e = entries.find((x) => x.id === id);
    if (e && e.status === status) return e;
    await new Promise((r) => setTimeout(r, 25));
  }
  return null;
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
    EXEC_CHECKPOINT_MODE = false;
    ctx = makeCtx();
  });

  test("--gaps-only runs only the plans with gap_closure true", async () => {
    // the checkpoint-aware fake writes SUMMARY only when a CHECKPOINT is present,
    // so seed an answered checkpoint to let the gap_closure plan resume + complete.
    await svc.writeArtifact(CWD, 1, "PLAN-01", PLAN_2_TASKS);
    await svc.writeArtifact(CWD, 1, "CHECKPOINT-01", CHECKPOINT_ANSWERED);
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

  test("a successful run writes a WIN-01 window and a done JOB-01 job", async () => {
    EXEC_CHECKPOINT_MODE = false;
    const { t } = await registerTool("execute", "gsd_execute");
    const res = await t.execute({ phase: 1 }, exec);
    assert.match(res, /01-auth-01 ✓/);
    assert.ok(fs.files.has(`${CWD}/.planning/WINDOWS.md`), "WINDOWS.md must be written");
    const windows = await svc.readWindows(CWD);
    assert.equal(windows.entries.length, 1);
    assert.equal(windows.entries[0].id, "WIN-01");
    assert.match(windows.entries[0].summary, /Executed 1\/1 plans/);
    assert.ok(fs.files.has(`${CWD}/.planning/async-jobs.json`), "async-jobs.json must be written");
    const jobs = await svc.readJobs(CWD);
    assert.equal(jobs.entries.length, 1);
    assert.equal(jobs.entries[0].id, "JOB-01");
    assert.equal(jobs.entries[0].status, "done");
    assert.equal(jobs.entries[0].result, "SUMMARY written");
  });

  test("a checkpoint stop writes a done job mentioning checkpoint and a window", async () => {
    // PLAN_2_TASKS (2 tasks) so the checkpoint at last_completed_task=1 is in-range.
    await svc.writeArtifact(CWD, 1, "PLAN-01", PLAN_2_TASKS);
    EXEC_CHECKPOINT_MODE = true;
    const { t } = await registerTool("execute", "gsd_execute");
    await t.execute({ phase: 1 }, exec);
    const jobs = await svc.readJobs(CWD);
    assert.equal(jobs.entries.length, 1);
    assert.equal(jobs.entries[0].status, "done");
    assert.match(jobs.entries[0].result, /checkpoint/);
    const windows = await svc.readWindows(CWD);
    assert.equal(windows.entries.length, 1);
    assert.equal(windows.entries[0].id, "WIN-01");
  });

  test("resume path carries the resumed plan id as the window checkpoint reference (D-07)", async () => {
    // First run stops at a checkpoint -> CHECKPOINT-01 artefact (new name) exists.
    await svc.writeArtifact(CWD, 1, "PLAN-01", PLAN_2_TASKS);
    EXEC_CHECKPOINT_MODE = true;
    const { t } = await registerTool("execute", "gsd_execute");
    await t.execute({ phase: 1 }, exec);
    assert.ok(fs.files.has(`${CWD}/.planning/phases/01-auth/01-auth-01-CHECKPOINT.md`), "checkpoint artefact persisted under the new name");
    // Resume run (now writes SUMMARY as normal) -> the new window entry must
    // reference the resumed plan id as its checkpoint. The persisted checkpoint
    // has no human_answer, so the answer must be supplied to clear the awaiting
    // gate (D-05) and let the plan resume.
    EXEC_CHECKPOINT_MODE = false;
    await t.execute({ phase: 1, answer: "use pg", decision_id: "01-auth-01-ck1" }, exec);
    const windows = await svc.readWindows(CWD);
    assert.equal(windows.entries.length, 2, "two windows across the two runs");
    const resumedWin = windows.entries[windows.entries.length - 1];
    assert.ok(resumedWin.checkpoint, "resumed window must carry a checkpoint reference");
    assert.match(resumedWin.checkpoint, /^01-auth-01$/);
  });

  test("persists a checkpointed executor return and leaves the plan incomplete (DUR-01)", async () => {
    await svc.writeArtifact(CWD, 1, "PLAN-01", PLAN_2_TASKS);
    EXEC_CHECKPOINT_MODE = true;
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
    // The checkpoint carries a decision_id but no human_answer, so the answer
    // must be supplied on this call to clear the awaiting gate (D-05/D-03).
    await svc.writeArtifact(CWD, 1, "CHECKPOINT-01", CHECKPOINT_DECISION);
    const { t } = await registerTool("execute", "gsd_execute");
    const res = await t.execute({ phase: 1, answer: "use pg", decision_id: "01-auth-01-ck1" }, exec);
    const prompt = executeCaptured[0] || "";
    assert.match(prompt, /RESUME from checkpoint/);
    assert.match(prompt, /last_completed_task/);
    assert.match(prompt, /begin at task 2/);
    assert.match(prompt, /human answered 01-auth-01-ck1 = use pg/);
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

  test("a completed SUMMARY wins over a stale CHECKPOINT and triggers cleanup (D-06)", async () => {
    await svc.writeArtifact(CWD, 1, "PLAN-01", PLAN_2_TASKS);
    // seed an answered checkpoint so the plan resumes (not awaiting) and completes
    await svc.writeArtifact(CWD, 1, "CHECKPOINT-01", CHECKPOINT_ANSWERED);
    // spy on removeArtifact — the real fs unlink is a no-op on the in-memory fake fs
    let removeCalls = 0;
    const orig = svc.removeArtifact.bind(svc);
    svc.removeArtifact = async (...a) => { removeCalls++; return orig(...a); };
    const { t } = await registerTool("execute", "gsd_execute");
    const res = await t.execute({ phase: 1 }, exec);
    assert.equal(executeSpawnCount, 1, "executor spawned exactly once (not re-run from scratch)");
    assert(fs.files.has(`${CWD}/.planning/phases/01-auth/01-auth-01-SUMMARY.md`), "SUMMARY wins -> plan completes");
    assert.match(res, /01-auth-01 ✓/);
    assert.ok(removeCalls >= 1, "stale CHECKPOINT removal path invoked once SUMMARY wins");
  });

  test("(D-05/D-01) an unanswered decision checkpoint returns the awaiting marker and spawns no executor", async () => {
    await svc.writeArtifact(CWD, 1, "PLAN-01", PLAN_2_TASKS);
    await svc.writeArtifact(CWD, 1, "CHECKPOINT-01", CHECKPOINT_DECISION);
    executeSpawnCount = 0;
    const { t } = await registerTool("execute", "gsd_execute");
    const res = await t.execute({ phase: 1 }, exec);
    assert.match(res, /GSD_AWAITING_HUMAN: plan .* \(checkpoint:decision\)/);
    assert.match(res, /decision_id=01-auth-01-ck1/);
    assert.match(res, /question=/);
    assert.equal(executeSpawnCount, 0, "no executor must be spawned for an awaiting plan");
    assert(!fs.files.has(`${CWD}/.planning/phases/01-auth/01-auth-01-SUMMARY.md`), "no SUMMARY may be written while awaiting");
  });

  test("(D-03/UAT-02) answer + matching decision_id resumes the plan with the answer bound and completes", async () => {
    await svc.writeArtifact(CWD, 1, "PLAN-01", PLAN_2_TASKS);
    await svc.writeArtifact(CWD, 1, "CHECKPOINT-01", CHECKPOINT_DECISION);
    const { t } = await registerTool("execute", "gsd_execute");
    const res = await t.execute({ phase: 1, answer: "use pg", decision_id: "01-auth-01-ck1" }, exec);
    const prompt = executeCaptured[0] || "";
    assert.match(prompt, /human answered 01-auth-01-ck1 = use pg/);
    assert.match(prompt, /begin at task 2/);
    assert(fs.files.has(`${CWD}/.planning/phases/01-auth/01-auth-01-SUMMARY.md`), "answered plan resumes and completes");
    assert.match(res, /01-auth-01 ✓/);
  });

  test("(D-04) the human answer is persisted into the CHECKPOINT frontmatter", async () => {
    await svc.writeArtifact(CWD, 1, "PLAN-01", PLAN_2_TASKS);
    await svc.writeArtifact(CWD, 1, "CHECKPOINT-01", CHECKPOINT_DECISION);
    const { t } = await registerTool("execute", "gsd_execute");
    await t.execute({ phase: 1, answer: "use pg", decision_id: "01-auth-01-ck1" }, exec);
    const cp = await svc.readArtifact(CWD, 1, "CHECKPOINT-01");
    const { frontmatter } = parseFrontmatter(cp);
    assert.equal(frontmatter.human_answer, "use pg");
    assert.equal(frontmatter.decision_id, "01-auth-01-ck1");
  });

  test("(D-04) context-reset resume: a persisted human_answer resumes a checkpoint with no args", async () => {
    await svc.writeArtifact(CWD, 1, "PLAN-01", PLAN_2_TASKS);
    await svc.writeArtifact(CWD, 1, "CHECKPOINT-01", CHECKPOINT_ANSWERED);
    const { t } = await registerTool("execute", "gsd_execute");
    const res = await t.execute({ phase: 1 }, exec);
    const prompt = executeCaptured[0] || "";
    assert.match(prompt, /human answered 01-auth-01-ck1 = use pg/);
    assert(fs.files.has(`${CWD}/.planning/phases/01-auth/01-auth-01-SUMMARY.md`), "persisted answer lets the plan resume");
    assert.match(res, /01-auth-01 ✓/);
  });

  test("(D-06) a stale/non-matching decision_id is ignored with no error and stays awaiting", async () => {
    await svc.writeArtifact(CWD, 1, "PLAN-01", PLAN_2_TASKS);
    await svc.writeArtifact(CWD, 1, "CHECKPOINT-01", CHECKPOINT_DECISION);
    executeSpawnCount = 0;
    const { t } = await registerTool("execute", "gsd_execute");
    const res = await t.execute({ phase: 1, answer: "x", decision_id: "nope" }, exec);
    assert.match(res, /GSD_AWAITING_HUMAN/);
    assert.equal(executeSpawnCount, 0, "stale answer must not spawn the executor");
    assert(!fs.files.has(`${CWD}/.planning/phases/01-auth/01-auth-01-SUMMARY.md`));
  });

  test("(D-07) checkpoint:decision, human-action, and human-verify all share one marker->answer path", async () => {
    for (const kind of ["decision", "human-action", "human-verify"]) {
      // fresh project per kind so the plan is incomplete (no SUMMARY) each time
      fs = new FakeFs();
      svc = await buildProject(fs, CWD);
      await svc.writeArtifact(CWD, 1, "PLAN-01", PLAN_2_TASKS);
      const fm = `---
plan: 01-auth-01
last_completed_task: 1
checkpoint_reason: choose
committed_hashes: ["a"]
checkpoint_kind: ${kind}
decision_id: 01-auth-01-ck1
---
# checkpoint`;
      await svc.writeArtifact(CWD, 1, "CHECKPOINT-01", fm);
      executeSpawnCount = 0;
      executeCaptured.length = 0;
      const { t } = await registerTool("execute", "gsd_execute");
      const res = await t.execute({ phase: 1 }, exec);
      assert.match(res, new RegExp(`checkpoint:${kind}`), `awaiting marker names kind ${kind}`);
      assert.equal(executeSpawnCount, 0, `no spawn while awaiting for ${kind}`);
      await t.execute({ phase: 1, answer: "go", decision_id: "01-auth-01-ck1" }, exec);
      assert.match(executeCaptured[0] || "", /human answered 01-auth-01-ck1 = go/, `answer+decision_id resumes ${kind}`);
    }
  });

  test("prefixed project: wave-2 dispatches only after its non-prefixed dep's SUMMARY exists (DUR-05)", async () => {
    // Regression: with a project_code the plan id is prefixed ("GSDB-01-auth-01")
    // but depends_on may carry the bare "01-auth-01". Prefix-tolerant resolution
    // must block wave-2 until the wave-1 SUMMARY exists, then dispatch it.
    fs = new FakeFs();
    svc = new GsdState(stateCtx(fs), {});
    await svc.initProject(CWD, {
      name: "T", purpose: "p", milestoneName: "M1", version: "v1.0",
      requirements: [{ id: "AUTH-01", text: "log in" }, { id: "TODO-01", text: "todo" }],
      phases: [{ name: "auth", goal: "g", requirements: ["AUTH-01", "TODO-01"] }],
      projectCode: "GSDB",
    });
    const base = "GSDB-01-auth";
    // the shared resolver turns the bare depends_on into the prefixed plan id
    assert.equal(resolvePlanDep([{ id: `${base}-01` }], "01-auth-01").id, `${base}-01`);
    await svc.writeArtifact(CWD, 1, "PLAN-01", `---
phase: 01-auth
plan: 01
type: tdd
wave: 1
depends_on: []
files_modified: ["src/a.js"]
autonomous: true
requirements: ["AUTH-01"]
---
<objective>w1</objective><tasks></tasks>`);
    await svc.writeArtifact(CWD, 1, "PLAN-02", `---
phase: 01-auth
plan: 02
type: tdd
wave: 2
depends_on: ["01-auth-01"]
files_modified: ["src/b.js"]
autonomous: true
requirements: ["TODO-01"]
---
<objective>w2</objective><tasks></tasks>`);

    // custom subagents that write SUMMARY at the prefixed path, keyed by the plan's own id
    const spawnCounts = { w1: 0, w2: 0 };
    const subagents = {
      getProvider: (n) => (n === "spawn" ? { spawn: true } : undefined),
      async start(_n, req) {
        const id = req.label.split(" ")[1]; // "execute GSDB-01-auth-01"
        const pNum = id.split("-").pop();
        if (req.label.startsWith("execute")) {
          if (id === `${base}-01`) spawnCounts.w1++;
          if (id === `${base}-02`) spawnCounts.w2++;
          await fs.writeText({ targetKey: `${CWD}/.planning/phases/${base}/${base}-${pNum}-SUMMARY.md` }, FENCED_SUMMARY);
        }
        return { result: { output: [{ type: "text", text: "done" }], stopReason: "completed", structured: undefined }, dispose: () => {} };
      },
    };
    const c = makeCtx();
    c.get = (n) => (n === "gsdState" ? svc : n === "subagents" ? subagents : n === "tools" ? { register() {} } : undefined);
    const mod = await import(`../lib/execute.js`);
    const tools = [];
    c.tools = { register: (t) => tools.push(t) };
    mod.apply(c, {});
    const t = tools.find((x) => x.name === "gsd_execute");

    // First run: only wave-1 is runnable; wave-2 stays blocked (no SUMMARY yet).
    const res1 = await t.execute({ phase: 1 }, exec);
    assert.equal(spawnCounts.w1, 1, "wave-1 dispatched on first run");
    assert.equal(spawnCounts.w2, 0, "wave-2 must NOT dispatch before its wave-1 SUMMARY exists");
    assert.match(res1, /skipping .*01-auth-02/);
    assert.ok(fs.files.has(`${CWD}/.planning/phases/${base}/${base}-01-SUMMARY.md`), "wave-1 SUMMARY written");

    // Second run: wave-1 is complete, so wave-2 resolves its dep and dispatches.
    const res2 = await t.execute({ phase: 1 }, exec);
    assert.equal(spawnCounts.w2, 1, "wave-2 dispatched once wave-1 SUMMARY exists");
    assert.ok(fs.files.has(`${CWD}/.planning/phases/${base}/${base}-02-SUMMARY.md`), "wave-2 SUMMARY written");
    assert.match(res2, /02 ✓/);
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

  test("fresh project renders empty Windows and Async Jobs sections and keeps continuity", async () => {
    fs = new FakeFs();
    svc = await buildProject(fs, CWD);
    const { t } = await registerTool("core-tools", "gsd_status");
    const res = await t.execute({}, exec);
    assert.match(res, /## Windows/);
    assert.match(res, /No windows recorded/);
    assert.match(res, /## Async Jobs/);
    assert.match(res, /No jobs/);
    assert.match(res, /Stopped at:/);
  });

  test("seeded windows and jobs render in the two sections", async () => {
    fs = new FakeFs();
    svc = await buildProject(fs, CWD);
    await svc.appendWindow(CWD, { phase: "1", step: "execute", summary: "executed phase 1" });
    await svc.appendJob(CWD, { kind: "subagent", plan: "GSD-01-auth-01", status: "done", result: "SUMMARY written" });
    const { t } = await registerTool("core-tools", "gsd_status");
    const res = await t.execute({}, exec);
    assert.match(res, /## Windows/);
    assert.match(res, /WIN-01/);
    assert.match(res, /phase 1 execute/);
    assert.match(res, /## Async Jobs/);
    assert.match(res, /JOB-01/);
    assert.match(res, /SUMMARY written/);
    assert.match(res, /Stopped at:/);
  });

  test("a running job whose result file exists renders done/failed", async () => {
    fs = new FakeFs();
    svc = await buildProject(fs, CWD);
    await svc.appendJob(CWD, { kind: "subagent", status: "running" });
    await fs.writeText({ targetKey: `${CWD}/.planning/jobs/JOB-01.result.json` }, JSON.stringify({ id: "JOB-01", exitCode: 0, stdout: "hello", stderr: "", error: null }));
    const { t } = await registerTool("core-tools", "gsd_status");
    const res = await t.execute({}, exec);
    assert.match(res, /JOB-01/);
    assert.match(res, /done/);
    assert.match(res, /hello/);
  });

  test("a running job with no result file renders running", async () => {
    fs = new FakeFs();
    svc = await buildProject(fs, CWD);
    await svc.appendJob(CWD, { kind: "subagent", status: "running" });
    const { t } = await registerTool("core-tools", "gsd_status");
    const res = await t.execute({}, exec);
    assert.match(res, /JOB-01/);
    assert.match(res, /running/);
  });

  test("a terminal job's reason and detail render inline in the Async Jobs line (D-08)", async () => {
    fs = new FakeFs();
    svc = await buildProject(fs, CWD);
    await svc.appendJob(CWD, { kind: "subagent", status: "failed", result: "x", reason: { reason: "timeout", detail: "exceeded 60s" } });
    const { t } = await registerTool("core-tools", "gsd_status");
    const res = await t.execute({}, exec);
    assert.match(res, /JOB-01/);
    assert.match(res, /failed/);
    assert.match(res, /\[reason: timeout\]/);
    assert.match(res, /exceeded 60s/);
  });

  test("a corrupt result file does not throw and leaves the job running", async () => {
    fs = new FakeFs();
    svc = await buildProject(fs, CWD);
    await svc.appendJob(CWD, { kind: "subagent", status: "running" });
    await fs.writeText({ targetKey: `${CWD}/.planning/jobs/JOB-01.result.json` }, "not-json{{{");
    const { t } = await registerTool("core-tools", "gsd_status");
    let res;
    await assert.doesNotReject(async () => { res = await t.execute({}, exec); });
    assert.match(res, /JOB-01/);
    assert.match(res, /running/);
  });

  test("corrupt async-jobs.json renders a warning line, does not throw, keeps continuity", async () => {
    fs = new FakeFs();
    svc = await buildProject(fs, CWD);
    await fs.writeText({ targetKey: `${CWD}/.planning/async-jobs.json` }, "not-json{{{");
    const { t } = await registerTool("core-tools", "gsd_status");
    let res;
    await assert.doesNotReject(async () => { res = await t.execute({}, exec); });
    assert.match(res, /corrupt/);
    assert.match(res, /async-jobs\.json is corrupt/);
    assert.match(res, /Stopped at:/);
  });

  test("corrupt WINDOWS.md renders a warning line, does not throw, keeps continuity", async () => {
    fs = new FakeFs();
    svc = await buildProject(fs, CWD);
    // unknown-section header makes parseWindows throw -> readWindows corrupt:true
    await fs.writeText({ targetKey: `${CWD}/.planning/WINDOWS.md` }, "# WINDOWS\n## FOO\n- phase: 1\n");
    const { t } = await registerTool("core-tools", "gsd_status");
    let res;
    await assert.doesNotReject(async () => { res = await t.execute({}, exec); });
    assert.match(res, /corrupt/);
    assert.match(res, /WINDOWS\.md is corrupt/);
    assert.match(res, /Stopped at:/);
  });
});

describe("gsd_job", () => {
  beforeEach(async () => {
    fs = new FakeFs();
    svc = await buildProject(fs, CWD);
    ctx = makeCtx();
  });

  // Launching a real subagent/shell job needs a real writable dir (the subagent
  // settle writes its result file and shell jobs spawn a detached child), so
  // those two tests build a real temp project with realFsAdapter, mirroring how
  // jobs.test.mjs exercises the runtime. The pure-manifest actions (status /
  // cancel / retry / schema) run against FakeFs via registerTool.
  async function realToolCtx(tmp, subagents) {
    const realFs = realFsAdapter();
    const s2 = new GsdState(stateCtx(realFs), {});
    await s2.initProject(tmp, { name: "T", purpose: "p", milestoneName: "M1", version: "v1.0", requirements: [], phases: [] });
    const c = {
      fs: realFs,
      get: (n) =>
        n === "gsdState" ? s2
          : n === "subagents" ? subagents
            : n === "tools" ? { register() {} } : undefined,
      provide() {}, effect: () => () => {},
    };
    const tools = [];
    c.tools = { register: (t) => tools.push(t) };
    const mod = await import("../lib/core-tools.js");
    mod.apply(c, {});
    const t = tools.find((x) => x.name === "gsd_job");
    const exec2 = { agent: { session: { header: { cwd: tmp } } }, signal: { aborted: false, addEventListener() {}, removeEventListener() {} } };
    return { t, s: s2, fs: realFs, exec2 };
  }

  test("launch subagent records a job that reconciles to done with the subagent text", async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), "gsd-job-tool-"));
    try {
      const subagents = {
        getProvider: (n) => (n === "spawn" ? { spawn: true } : undefined),
        async start(_n, _req) {
          return { result: Promise.resolve({ output: [{ type: "text", text: "agent summary" }], stopReason: "completed", structured: undefined }), dispose: () => {} };
        },
      };
      const { t, s, exec2 } = await realToolCtx(tmp, subagents);
      const res = await t.execute({ action: "launch", kind: "subagent", prompt: "summarize", label: "gsd-job-1" }, exec2);
      assert.match(res, /JOB-01/);
      assert.match(res, /subagent/);
      const done = await waitForJobStatus(s, tmp, "JOB-01", "done");
      assert.ok(done, "subagent job reaches done");
      const status = await t.execute({ action: "status", id: "JOB-01" }, exec2);
      assert.match(status, /done/);
      assert.match(status, /agent summary/);
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  test("launch shell records and completes a shell job via the argv command", async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), "gsd-job-tool-"));
    try {
      const { t, s, fs: realFs, exec2 } = await realToolCtx(tmp, makeSubagents());
      const res = await t.execute({ action: "launch", kind: "shell", argv: ["node", "-e", "process.exit(0)"] }, exec2);
      assert.match(res, /JOB-01/);
      // A shell job's manifest status only flips when reconcileJobs runs (the
      // gsd_job status action reconciles first), so wait for the detached child
      // to write its result file, then reconcile via action:status -> done.
      const resultFile = `${tmp}/.planning/jobs/JOB-01.result.json`;
      const deadline = Date.now() + 5000;
      while (Date.now() < deadline) {
        if (await realFs.stat(await realFs.resolve(resultFile))) break;
        await new Promise((r) => setTimeout(r, 25));
      }
      const status = await t.execute({ action: "status", id: "JOB-01" }, exec2);
      assert.match(status, /done/);
      const done = await waitForJobStatus(s, tmp, "JOB-01", "done");
      assert.ok(done, "shell job reaches done after reconcile");
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  test("status on an unknown id returns a not-found message and never throws", async () => {
    const { t } = await registerTool("core-tools", "gsd_job");
    let res;
    await assert.doesNotReject(async () => { res = await t.execute({ action: "status", id: "JOB-99" }, exec); });
    assert.match(res, /not found/);
  });

  test("cancel flips a running job to failed with reason 'cancelled'", async () => {
    const { t } = await registerTool("core-tools", "gsd_job");
    await svc.appendJob(CWD, { kind: "shell", status: "running" });
    const res = await t.execute({ action: "cancel", id: "JOB-01" }, exec);
    assert.match(res, /cancelled JOB-01/);
    const { entries } = await svc.readJobs(CWD);
    assert.equal(entries[0].status, "failed");
    assert.equal(entries[0].reason.reason, "cancelled");
  });

  test("cancel on an unknown or already-done job returns a no-op message and never throws", async () => {
    const { t } = await registerTool("core-tools", "gsd_job");
    await svc.appendJob(CWD, { kind: "subagent", status: "done", result: "x" });
    let res;
    await assert.doesNotReject(async () => { res = await t.execute({ action: "cancel", id: "JOB-99" }, exec); });
    assert.match(res, /not found/);
    await assert.doesNotReject(async () => { res = await t.execute({ action: "cancel", id: "JOB-01" }, exec); });
    assert.match(res, /terminal/);
  });

  test("retry creates a new attempt and marks the old entry 'retried'", async () => {
    const { t } = await registerTool("core-tools", "gsd_job");
    await svc.appendJob(CWD, { kind: "subagent", prompt: "x", status: "failed", attempts: 1, retryCount: 0, timeout: 5 });
    const res = await t.execute({ action: "retry", id: "JOB-01" }, exec);
    assert.match(res, /retried JOB-01 as JOB-02/);
    const { entries } = await svc.readJobs(CWD);
    assert.equal(entries.length, 2, "a retry appends a new attempt entry");
    assert.equal(entries[0].reason.reason, "retried");
    assert.equal(entries[1].id, "JOB-02");
  });

  test("retry beyond max_retries returns a refusal and adds no entry", async () => {
    const { t } = await registerTool("core-tools", "gsd_job");
    await svc.appendJob(CWD, { kind: "subagent", prompt: "x", status: "failed", attempts: 1, retryCount: 3, timeout: 5 });
    let res;
    await assert.doesNotReject(async () => { res = await t.execute({ action: "retry", id: "JOB-01" }, exec); });
    assert.match(res, /max_retries exceeded/);
    const { entries } = await svc.readJobs(CWD);
    assert.equal(entries.length, 1, "no new attempt entry on a refusal");
  });

  test("an invalid action value is rejected by the schema with a clear message (D-05)", async () => {
    // defineTool's enum arg-validation rejects a non-enum action BEFORE execute
    // runs (a clear ToolArgsError naming the valid actions), so an unknown
    // action never reaches the manifest and never throws a runtime error. The
    // defensive "unknown action" branch in execute stays for completeness.
    const { t } = await registerTool("core-tools", "gsd_job");
    await assert.rejects(() => t.execute({ action: "bogus" }, exec), /must be one of \[.*"launch".*"status".*"cancel".*"retry"\]/);
    await assert.rejects(() => t.execute({ action: "launch", kind: "bogus" }, exec), /kind.*must be one of/);
  });

  test("compiled schema exposes the action enum and job properties", async () => {
    const { t } = await registerTool("core-tools", "gsd_job");
    assert.deepEqual(t.parameters.properties.action.enum, ["launch", "status", "cancel", "retry"]);
    assert.deepEqual(t.parameters.properties.kind.enum, ["shell", "subagent"]);
    for (const p of ["kind", "id", "prompt", "argv", "timeout", "max_retries"]) {
      assert.ok(t.parameters.properties[p], `${p} should be exposed in the gsd_job schema`);
    }
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

  test("full mode with force=true writes a content-hashed .map-manifest.json", async () => {
    await fs.writeText({ targetKey: `${CWD}/src/index.js` }, "export const x = 1;\n");
    const { t } = await registerTool("map-codebase", "gsd_map_codebase");
    await t.execute({ force: true }, exec);
    const key = `${CWD}/.planning/codebase/.map-manifest.json`;
    assert(fs.files.has(key), ".map-manifest.json should be written after a force mapping");
    const manifest = JSON.parse(fs.files.get(key));
    assert.ok(Array.isArray(manifest), "manifest should be an array of records");
    assert.ok(manifest.length > 0, "manifest should not be empty");
    for (const rec of manifest) {
      assert.equal(typeof rec.path, "string");
      assert.equal(typeof rec.size, "number");
      assert.equal(typeof rec.hash, "string");
    }
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

  test("existing map with a drifted tree reports a drift summary (added)", async () => {
    // first force-map to persist a manifest reflecting the current tree
    await fs.writeText({ targetKey: `${CWD}/src/index.js` }, "export const x = 1;\n");
    const { t } = await registerTool("map-codebase", "gsd_map_codebase");
    await t.execute({ force: true }, exec);
    // drift: add a new file under src/
    await fs.writeText({ targetKey: `${CWD}/src/new.js` }, "// new\n");
    const res = await t.execute({}, exec);
    assert.match(res, /already exists/);
    assert.match(res, /Drift detected/);
    assert.match(res, /added/);
    assert.match(res, /src\/new\.js/);
    assert.doesNotMatch(res, /Codebase mapping complete/);
  });

  test("existing map with an unchanged tree returns no drift summary", async () => {
    await fs.writeText({ targetKey: `${CWD}/src/index.js` }, "export const x = 1;\n");
    const { t } = await registerTool("map-codebase", "gsd_map_codebase");
    await t.execute({ force: true }, exec); // persists a manifest
    const res = await t.execute({}, exec);  // unchanged tree
    assert.match(res, /already exists/);
    assert.doesNotMatch(res, /Drift detected/);
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

  test("fast mode focus arch writes the drift manifest", async () => {
    await fs.writeText({ targetKey: `${CWD}/src/index.js` }, "export const x = 1;\n");
    const { t } = await registerTool("map-codebase", "gsd_map_codebase");
    await t.execute({ fast: true, focus: "arch", force: true }, exec);
    assert(fs.files.has(`${CWD}/.planning/codebase/.map-manifest.json`), "fast mode should persist the manifest");
  });

  test("paths incremental remap writes the drift manifest", async () => {
    await fs.writeText({ targetKey: `${CWD}/src/index.js` }, "export const x = 1;\n");
    const { t } = await registerTool("map-codebase", "gsd_map_codebase");
    await t.execute({ paths: ["lib/"] }, exec);
    assert(fs.files.has(`${CWD}/.planning/codebase/.map-manifest.json`), "paths remap should persist the manifest");
  });

  test("manifest excludes node_modules, .planning, .git, lockfiles, and empty dirs (D-03)", async () => {
    await fs.writeText({ targetKey: `${CWD}/src/index.js` }, "export const x = 1;\n");
    await fs.writeText({ targetKey: `${CWD}/node_modules/app.js` }, "module\n");
    await fs.writeText({ targetKey: `${CWD}/.planning/STATE.md` }, "# state\n");
    await fs.writeText({ targetKey: `${CWD}/package-lock.json` }, "{}");
    fs.dirs.add(`${CWD}/empty`); // an empty directory must not appear either
    const { t } = await registerTool("map-codebase", "gsd_map_codebase");
    await t.execute({ force: true }, exec);
    const manifest = await svc.readCodebaseManifest(CWD);
    assert.ok(Array.isArray(manifest) && manifest.length > 0, "manifest should be non-empty");
    const lockRe = /(^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|npm-shrinkwrap\.json|bun\.lockb?|composer\.lock|Gemfile\.lock|poetry\.lock|Cargo\.lock)$/;
    const bad = manifest.filter((r) =>
      r.path.includes("node_modules") || r.path.includes(".planning") || r.path.includes(".git") || lockRe.test(r.path)
    );
    assert.deepEqual(bad, [], "no ignored path should appear in the manifest");
    assert.ok(manifest.some((r) => r.path === "src/index.js"), "real source file should be in the manifest");
  });

  test("rejects forbidden path scope values and falls back to whole-repo", async () => {
    const { t } = await registerTool("map-codebase", "gsd_map_codebase");
    const res = await t.execute({ paths: ["../escape", "/abs", "lib/;rm"] }, exec);
    assert.match(res, /Codebase mapping complete/);
    // all forbidden -> whole repo -> all 7 docs
    for (const d of DOCS) assert(fs.files.has(`${CWD}/.planning/codebase/${d}.md`));
  });

  test("query mode with an existing map returns the subagent's answer with a Sources section", async () => {
    await fs.writeText({ targetKey: `${CWD}/.planning/codebase/ARCHITECTURE.md` }, "# Architecture\n\n**Analysis Date:** 2026-08-22\n");
    const { t } = await registerTool("map-codebase", "gsd_map_codebase");
    const res = await t.execute({ query: "How is auth handled?" }, exec);
    assert.match(res, /JWT/);
    assert.match(res, /Sources/);
    assert.match(res, /ARCHITECTURE\.md/);
    assert.equal([...fs.files.keys()].filter((k) => k.startsWith(`${CWD}/.planning/codebase/`)).length, 1);
  });

  test("query mode with no map returns a notice and never throws", async () => {
    const { t } = await registerTool("map-codebase", "gsd_map_codebase");
    const res = await t.execute({ query: "q" }, exec);
    assert.match(res, /No .planning\/codebase\/ map exists yet/);
    await assert.doesNotReject(() => t.execute({ query: "q" }, exec));
  });

  test("query subagent failure returns a clear failure message and never throws", async () => {
    const { t } = await registerTool("map-codebase", "gsd_map_codebase");
    await fs.writeText({ targetKey: `${CWD}/.planning/codebase/ARCHITECTURE.md` }, "# Architecture\n\n**Analysis Date:** 2026-08-22\n");
    QUERY_FAIL_MODE = true;
    try {
      const res = await t.execute({ query: "q" }, exec);
      assert.match(res, /query failed/);
      await assert.doesNotReject(() => t.execute({ query: "q" }, exec));
    } finally {
      QUERY_FAIL_MODE = false;
    }
  });

  test("query mode ignores fast/focus/paths/force and writes no map docs", async () => {
    await fs.writeText({ targetKey: `${CWD}/.planning/codebase/ARCHITECTURE.md` }, "# Architecture\n\n**Analysis Date:** 2026-08-22\n");
    const { t } = await registerTool("map-codebase", "gsd_map_codebase");
    const res = await t.execute({ query: "q", fast: true, focus: "arch", paths: ["lib/"], force: true }, exec);
    assert.match(res, /JWT/);
    assert.equal([...fs.files.keys()].filter((k) => k.startsWith(`${CWD}/.planning/codebase/`)).length, 1);
  });

  test("empty or whitespace query falls through to full mapping", async () => {
    const { t } = await registerTool("map-codebase", "gsd_map_codebase");
    const res = await t.execute({ query: "   " }, exec);
    assert.doesNotMatch(res, /JWT/);
    assert.doesNotMatch(res, /No .planning\/codebase\/ map exists yet/);
    assert.match(res, /Codebase mapping complete/);
  });

  test("query arg is present in the compiled schema", async () => {
    const { t } = await registerTool("map-codebase", "gsd_map_codebase");
    assert.equal(t.parameters.properties.query.type, "string");
  });

  test("CODEBASE_QUERY_PROMPT carries the FORBIDDEN FILES rule", async () => {
    assert.match(CODEBASE_QUERY_PROMPT, /FORBIDDEN FILES/);
  });

  test("slash command --query builds a tool call with the query string", async () => {
    const registered = [];
    const c = {
      effect: (fn) => fn(),
      commands: { register: (cmd) => { registered.push(cmd); return () => {}; } },
    };
    applyCommands(c, {});
    const cmd = registered.find((x) => x.name === "gsd-map-codebase");
    assert.ok(cmd, "gsd-map-codebase command should be registered");
    let sentText = "";
    const agent = { followup: (msg) => { sentText = msg.content[0].text; } };
    const res = cmd.handler({ rawInput: "--query how is auth handled", agent });
    assert.match(sentText, /how is auth handled/);
    assert.match(sentText, /gsd_map_codebase/);
    assert.equal(res.kind, "success");
  });
});

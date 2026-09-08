// @dsh-gsd/bundle/repair — the node-repair out-of-band orchestrator (opengsd
// /gsd-repair, CLH-08). For a phase whose VERIFICATION.md status is exactly
// `gaps_found`, it runs bounded automatic recovery rounds of
// gsd_plan(gaps) → gsd_execute(gaps-only) → gsd_verify(gaps), delegating
// IN-PROCESS to the existing registered tools (D-06/D-08): their own subagent
// prompts, plan-checker, STATE transitions, and artefact commits are reused
// as-is — repair only sequences them and must never fork that machinery.
//
// Because the delegation is in-process (not a spawned autopilot), a repair
// round has NO recursion surface at all — it can never re-enter gsd_repair
// (P6), a structural advantage over the autonomous autopilot's prompt-only
// defence.
//
// This is an out-of-band ACTION, not a loop step (D-01): one new tool + one
// paired /gsd-repair command + one capability descriptor, and NO STATE
// mutation of its own — the delegated tools own every STATE transition. The
// universal failure mode is stop-with-cause (D-04/D-11): `human_needed`,
// a missing report, and an unparseable status each stop immediately with their
// distinct cause (agent faults and human-owned items are not machine-fixable
// plan gaps); a `passed` status is a zero-work no-op (D-05); any in-round
// failure consumes the invocation immediately and is never blind-retried.
//
// Security posture (D-12): no new runtime dependencies (node builtins +
// in-repo imports only), every git call rides the shared commitArtifacts seam
// (fixed argument arrays), and repair never pushes, never bypasses the ship
// preflight, and never advances STATE itself — the delegated tools own every
// STATE transition. All .planning/ writes route through the GsdState artefact
// accessors (ctx.fs), never raw fs (DUR-06).
//
// Decisions implemented here: D-01..D-12 (see
// .planning/phases/GSD-58-node-repair/GSD-58-node-repair-CONTEXT.md).

import { defineTool } from "@deepseek-ai/dsh-tools";
import { cwdOf } from "./_runner.js";
import { commitArtifacts } from "./_git-artifacts.js";
import { buildCapability } from "./_capabilities.js";
import { matchesGapClosure, parseFrontmatter, zeroPad } from "./_shared.js";

const name = "gsd-repair";
// House pattern (lib/quick.js:15-16 / lib/autonomous.js:29-33): gsdState +
// tools + subagents are declared even though delegation is indirect — the
// round reaches the plan/execute/verify tools through the registered tools
// surface.
const inject = ["gsdState", "tools", "subagents"];

// D-03/D-07: the hard-coded default budget — deliberately no config.json knob
// in this phase (deferred idea). Two rounds = two fix-plan attempts.
export const REPAIR_ROUND_BUDGET = 2;

// D-03: the single source of the rounds-domain text. BOTH validation sites
// (the runRepairRounds defensive guard below and the tool-layer execute check)
// reference this constant and never restate the literal, so the domain text
// lives on exactly one source line.
export const ROUNDS_DOMAIN_MSG = "rounds must be an integer between 1 and 2";

// Dual-shape tool lookup, mirroring lib/quick.js:43-47. Deliberately
// re-declared here instead of imported from quick.js: quick.js imports
// autonomous.js, and the autonomous rewire imports THIS module — a quick.js
// import would create a cycle. Handles both ctx.tools shapes: the offline
// mount/test harness passes an ARRAY (with a .register method); the real DSH
// runtime exposes a SERVICE object answering .get(name). Returns undefined
// when neither shape matches.
function findTool(ctx, toolName) {
  if (Array.isArray(ctx.tools)) return ctx.tools.find((t) => t && t.name === toolName);
  if (ctx.tools && typeof ctx.tools.get === "function") return ctx.tools.get(toolName);
  return undefined;
}

// Fold a bounded slice of a delegated tool's returned text into a cause or
// report so the human sees the real failure (R1/R4). NEVER used as an outcome
// oracle — outcomes are detected by artefact state (CQ-03 discipline, P1).
function excerpt(text, max = 400) {
  const t = String(text ?? "").trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

// Verification-status reader (D-04): the trigger gate's single source. A
// missing/unreadable VERIFICATION.md, an absent/empty frontmatter status, and
// an unrecognized status value are THREE distinct outcomes (missing-file /
// unparseable / unparseable-with-cause text) — repair deliberately does NOT
// copy lib/verify.js's optimistic default (a missing file degrading to
// gaps_found, P2/R4), because a repair round must not misread "no report" as
// "still gaps".
export async function readVerificationStatus(s, cwd, phaseNum) {
  let text = "";
  try {
    text = await s.readArtifact(cwd, phaseNum, "VERIFICATION");
  } catch {
    text = "";
  }
  if (!String(text ?? "").trim()) return { status: "missing-file" };
  const { frontmatter } = parseFrontmatter(text);
  const raw = String(frontmatter?.status ?? "").trim();
  if (raw !== "passed" && raw !== "gaps_found" && raw !== "human_needed") {
    return { status: "unparseable" };
  }
  return { status: raw };
}

// One strict-order round (D-06): plan(gaps) → execute(gaps-only) →
// verify(gaps), each step delegated through the registered tools with an
// artefact-state outcome oracle (never output sniffing — P1). Returns
// { ranPlan, ranExecute, ranVerify, verifyStatus, output, stopCause } where
// stopCause is null when the round completed through verify, else the
// stop-with-cause string for the step that stopped the round. A thrown error
// (a missing delegate tool) propagates fail-loud to the caller (R6).
async function runOneRound({ cwd, s, ctx, exec, phaseNum }) {
  // (a) gap-closure planning. The delegated call carries only the phase and
  // the gap mode — never override the plan tool's mode flags (P3/OQ-9), and
  // never re-run the researcher (OQ-9: plan skips it when RESEARCH.md exists).
  const planTool = findTool(ctx, "gsd_plan");
  if (!planTool || typeof planTool.execute !== "function") {
    throw new Error("gsd_repair: gsd_plan tool not registered — cannot repair");
  }
  const planOut = await planTool.execute({ phase: phaseNum, gaps: true }, exec);
  // Outcome oracle by artefact state: a runnable fix plan is gap_closure=true
  // without a SUMMARY yet (matchesGapClosure reused, never reimplemented).
  const plans = await s.listPlans(cwd, phaseNum);
  const runnable = plans.filter((p) => matchesGapClosure(p.gap_closure) && !p.has_summary);
  if (!runnable.length) {
    return {
      ranPlan: true, ranExecute: false, ranVerify: false,
      verifyStatus: null, output: planOut,
      stopCause: `plan produced no runnable gap-closure fix plan (gap_closure: true without a SUMMARY) — the plan tool's own no-fix-plan guard already failed loud. Plan output excerpt: ${excerpt(planOut)}`,
    };
  }

  // (b) gaps-only execution of the fix plans.
  const executeTool = findTool(ctx, "gsd_execute");
  if (!executeTool || typeof executeTool.execute !== "function") {
    throw new Error("gsd_repair: gsd_execute tool not registered — cannot repair");
  }
  const execOut = await executeTool.execute({ phase: phaseNum, gapsOnly: true }, exec);
  const after = await s.listPlans(cwd, phaseNum);
  const unfinished = after
    .filter((p) => matchesGapClosure(p.gap_closure))
    .filter((p) => !p.has_summary);
  if (unfinished.length) {
    // Phase-4 checkpoint handoff (D-11): a persisted CHECKPOINT artefact means
    // the executor stopped at a resumable decision — the answer flows through
    // gsd_execute's answer/decision_id channel, never a blind re-run.
    for (const p of unfinished) {
      if (await s.hasArtifact(cwd, phaseNum, `CHECKPOINT-${zeroPad(Number(p.plan))}`)) {
        return {
          ranPlan: true, ranExecute: true, ranVerify: false,
          verifyStatus: null, output: execOut,
          stopCause: `execute stopped at a resumable checkpoint on plan ${p.id} (no SUMMARY written) — resume it through gsd_execute's answer/decision_id channel, then re-invoke gsd_repair. Execute output excerpt: ${excerpt(execOut)}`,
        };
      }
    }
    // The awaiting marker is the stable, house-sanctioned signal the driving
    // agent regex-detects — surface it verbatim, never swallow it (P5).
    const markerLine = String(execOut ?? "").split("\n").find((line) => line.includes("GSD_AWAITING_HUMAN:"));
    if (markerLine) {
      return {
        ranPlan: true, ranExecute: true, ranVerify: false,
        verifyStatus: null, output: execOut,
        stopCause: `execute is awaiting a human decision on plan ${unfinished[0].id} — no SUMMARY written. ${markerLine}`,
      };
    }
    return {
      ranPlan: true, ranExecute: true, ranVerify: false,
      verifyStatus: null, output: execOut,
      stopCause: `execute left fix plan(s) without a SUMMARY (${unfinished.map((p) => p.id).join(", ")}): no SUMMARY written. Execute output excerpt: ${excerpt(execOut)}`,
    };
  }

  // (c) gap-focused re-verification; the status is read back from the
  // artefact by OUR reader (never verify's optimistic default — P2/R4), and
  // the verify output excerpt is folded into the record so a stale/failed
  // report rewrite is visible to the human.
  const verifyTool = findTool(ctx, "gsd_verify");
  if (!verifyTool || typeof verifyTool.execute !== "function") {
    throw new Error("gsd_repair: gsd_verify tool not registered — cannot verify");
  }
  const verifyOut = await verifyTool.execute({ phase: phaseNum, gaps: true }, exec);
  const post = await readVerificationStatus(s, cwd, phaseNum);
  const verifyCause = post.status === "human_needed"
    ? "human verification is needed — human-owned items are not machine-fixable plan gaps"
    : post.status === "missing-file"
      ? "the verify step did not produce a readable VERIFICATION.md"
      : post.status === "unparseable"
        ? "VERIFICATION.md has a missing or unrecognized status field"
        : null;
  return {
    ranPlan: true, ranExecute: true, ranVerify: true,
    verifyStatus: post.status, output: verifyOut,
    stopCause: verifyCause
      ? `post-round verification is ${post.status} — ${verifyCause}. Verify output excerpt: ${excerpt(verifyOut)}`
      : null,
  };
}

// ── REPAIR.md (D-10) ─────────────────────────────────────────────────────────
// Layout: a small fenced frontmatter block (phase / rounds_run / final_status,
// maintained on every write so parseFrontmatter can read them back) plus one
// `## Round N` section per attempted round (attempt number, actions taken,
// resulting verify status, notes) and a `## Stop` section whenever the
// invocation stops. writeArtifact OVERWRITES, so the append semantics are a
// read-modify-write through the GsdState artefact accessors (ctx.fs): the
// prior frontmatter is stripped and every prior section is preserved —
// sections are never truncated across invocations (DUR-06).
function buildRepairDoc({ phaseNum, roundsRun, finalStatus, priorText, sections }) {
  const { body } = parseFrontmatter(String(priorText ?? ""));
  const prior = String(body ?? "").trim();
  const content = prior || `# Phase ${phaseNum} repair log`;
  const front = ["---", `phase: ${phaseNum}`, `rounds_run: ${roundsRun}`, `final_status: ${finalStatus}`, "---"].join("\n");
  const parts = [front, "", content];
  for (const sec of sections) parts.push("", sec);
  return `${parts.join("\n")}\n`;
}

function roundSection(phaseNum, attempt, round) {
  const steps = [];
  if (round.ranPlan) steps.push("plan(gaps)");
  if (round.ranExecute) steps.push("execute(gaps-only)");
  if (round.ranVerify) steps.push("verify(gaps)");
  const lines = [
    `## Round ${attempt}`,
    `- attempt: ${attempt}`,
    `- actions: ${steps.join(" → ")} — delegated as plan({ phase: ${phaseNum}, gaps: true }), execute({ phase: ${phaseNum}, gapsOnly: true }), verify({ phase: ${phaseNum}, gaps: true })`,
    `- resulting verify status: ${round.verifyStatus ?? "not reached"}`,
  ];
  const note = round.stopCause
    ? `stopped in-round: ${excerpt(round.stopCause, 300)}`
    : `verify output excerpt: ${excerpt(round.output, 300)}`;
  lines.push(`- notes: ${note}`);
  return lines.join("\n");
}

function stopSection(reason) {
  return [`## Stop`, `- reason: ${reason}`].join("\n");
}

// The single scope-repair commit site (D-10/D-12): every exit path that enters
// a repair attempt funnels through here — exactly once per invocation.
// commitArtifacts stages only what changed and never throws (R7); gitFn is
// injectable for tests and defaults to the seam's own git wrapper.
async function commitRepair(cwd, phaseNum, phaseName, gitFn) {
  await commitArtifacts(cwd, phaseNum, { scope: "repair", phaseName }, gitFn);
}

// One invocation's bounded repair rounds (D-03/D-04/D-05/D-06/D-07/D-10/D-11).
// Task 1 implements exactly ONE round end-to-end; the round body is clearly
// separated (runOneRound) so the budget loop generalizes in Task 2 without
// touching the gate or the epilogue.
//
// Returns { recovered, roundsRun, finalStatus, stopReason, report }.
export async function runRepairRounds({ cwd, s, ctx, exec, phaseNum, phaseName, rounds, gitFn }) {
  // (1) D-03 defensive rounds guard — before any delegate call and before the
  // artefact/commit epilogue: the invalid-rounds stop deliberately writes and
  // commits nothing (OQ-6).
  if (rounds != null && !(Number.isInteger(rounds) && rounds >= 1 && rounds <= REPAIR_ROUND_BUDGET)) {
    const stopReason = `gsd_repair: ${ROUNDS_DOMAIN_MSG}`;
    return { recovered: false, roundsRun: 0, finalStatus: "invalid-rounds", stopReason, report: stopReason };
  }

  // (2) Trigger gate (D-04/D-05) — zero delegate calls on every gate exit.
  const gate = await readVerificationStatus(s, cwd, phaseNum);

  if (gate.status === "passed") {
    // D-05 no-op: success without spawning any work — zero delegate calls, no
    // REPAIR.md write, no commit (this exit never enters a repair attempt).
    return {
      recovered: false, roundsRun: 0, finalStatus: "passed", stopReason: null,
      report: `gsd_repair: phase ${phaseNum} already passed verification — nothing to repair.`,
    };
  }

  if (gate.status !== "gaps_found") {
    // D-04: human-owned and unreadable reports are not machine-fixable plan
    // gaps — stop with the distinct cause, zero delegate calls. Unlike the
    // no-op, this stop enters a repair attempt, so it records a stop-only
    // REPAIR.md (rounds_run 0, no round sections) and commits once (OQ-7).
    const cause = {
      human_needed: "verification status is human_needed — resolve the human_verification items in the phase's VERIFICATION.md and re-run gsd_verify",
      "missing-file": "VERIFICATION.md is missing or unreadable for this phase — run gsd_verify first to produce a verification report",
      unparseable: "VERIFICATION.md has a missing or unrecognized status field (expected passed | gaps_found | human_needed)",
    }[gate.status] || `verification status is "${gate.status}" (unrecognized)`;
    const stopReason = `gsd_repair: cannot repair phase ${phaseNum} — ${cause}`;
    const prior = await s.readArtifact(cwd, phaseNum, "REPAIR").catch(() => "");
    const file = await s.writeArtifact(cwd, phaseNum, "REPAIR", buildRepairDoc({
      phaseNum, roundsRun: 0, finalStatus: gate.status, priorText: prior,
      sections: [stopSection(stopReason)],
    }));
    await commitRepair(cwd, phaseNum, phaseName, gitFn);
    return {
      recovered: false, roundsRun: 0, finalStatus: gate.status, stopReason,
      report: [
        `gsd_repair: phase ${phaseNum} (${phaseName}) — stopped before any repair round.`,
        `Rounds run: 0. Final verification status: ${gate.status}.`,
        "",
        stopSection(stopReason),
        "",
        `Repair log: ${file}`,
      ].join("\n"),
    };
  }

  // Best-effort log-write epilogue, shared by every exit path that enters a
  // repair attempt (recovered, budget-exhausted, and every in-round
  // stop-with-cause); the commit funnels through the single commitRepair site.
  const epilogue = async ({ roundsRun, finalStatus, sections }) => {
    const prior = await s.readArtifact(cwd, phaseNum, "REPAIR").catch(() => "");
    const file = await s.writeArtifact(cwd, phaseNum, "REPAIR", buildRepairDoc({
      phaseNum, roundsRun, finalStatus, priorText: prior, sections,
    }));
    await commitRepair(cwd, phaseNum, phaseName, gitFn);
    return file;
  };

  // (3) The round — strict order (D-06): plan → execute → verify, each step
  // only attempted when the previous one succeeded. Task 1: exactly one
  // attempt per invocation.
  const attempt = 1;
  const sections = [];
  const round = await runOneRound({ cwd, s, ctx, exec, phaseNum });
  sections.push(roundSection(phaseNum, attempt, round));

  let recovered = false;
  let stopReason = null;
  let finalStatus;
  if (round.stopCause) {
    // D-11: consume the invocation immediately — no blind retry of the same
    // round. The cause names the real failure only.
    stopReason = round.stopCause;
    finalStatus = round.verifyStatus || "gaps_found"; // unchanged when stopped before verify
  } else if (round.verifyStatus === "passed") {
    recovered = true;
    finalStatus = "passed";
  } else {
    // gaps_found after this round (Task 1: exactly one round per invocation;
    // Task 2 wraps this in the bounded budget loop).
    finalStatus = "gaps_found";
    stopReason = `phase still reports gaps_found after ${attempt} round — the remaining gaps are listed in the phase's VERIFICATION.md. Verify output excerpt: ${excerpt(round.output)}`;
  }

  if (stopReason) sections.push(stopSection(stopReason));
  const file = await epilogue({ roundsRun: attempt, finalStatus, sections });

  const reportLines = [
    `gsd_repair: phase ${phaseNum} (${phaseName}) — repair finished.`,
    `Rounds run: ${attempt}. Final verification status: ${finalStatus}.`,
  ];
  if (recovered) {
    reportLines.push(`✓ Phase ${phaseNum} RECOVERED — verification now passed. Next: gsd_ship on phase ${phaseNum}.`);
  } else if (stopReason) {
    reportLines.push(`✗ Repair stopped: ${stopReason}`);
  }
  reportLines.push("", ...sections, "", `Repair log: ${file}`);

  return { recovered, roundsRun: attempt, finalStatus, stopReason, report: reportLines.join("\n") };
}

function apply(ctx) {
  const gsd = () => ctx.get("gsdState");

  // The one-descriptor registration D-01/OQ-1 permits: an out-of-band repair
  // capability (never a loop step — the loop chain, persona rendering, STATE
  // step machine, and removal matrix are untouched). Auto-tracked revertible
  // effect: retiring the repair plugin withdraws gsdRepair.
  ctx.provide("gsdRepair", buildCapability("gsdRepair"));

  ctx.tools.register(defineTool({
    name: "gsd_repair",
    description: "Node repair (opengsd /gsd-repair, CLH-08): bounded automatic recovery for a phase whose verification returned gaps_found — runs up to 2 rounds of gsd_plan (gaps) → gsd_execute (gaps-only) → gsd_verify (gaps), delegating in-process to the registered tools (no recursion surface), stopping with clear causes on human_needed / missing / unparseable verification reports, writing <NN>-REPAIR.md, and never advancing STATE itself. Long-running: each round spawns planner/checker/executor/verifier subagents.",
    parameters: {
      phase: { type: "number", required: true },
      rounds: { type: "number", description: "Repair-round override for this invocation (1..2); default budget 2." },
    },
    output: { schema: { type: "string" }, render: (_a, v) => [{ type: "text", text: v }] },
    async execute(args, exec) {
      const cwd = cwdOf(exec);
      const s = gsd();
      if (!s) throw new Error("gsd_repair: gsdState service unavailable");
      if (!(await s.isProject(cwd))) throw new Error("gsd_repair: no .planning/ project — run gsd_init first");
      const roadmap = await s.readRoadmap(cwd);
      const phase = (roadmap?.phases || []).find((p) => p.n === args.phase);
      if (!phase) throw new Error(`gsd_repair: phase ${args.phase} not in ROADMAP.md`);

      // D-03 tool-layer rounds validation: fail with the domain text (plus
      // the got-suffix, added ONLY here) and zero delegate calls.
      if (args.rounds != null && !(Number.isInteger(args.rounds) && args.rounds >= 1 && args.rounds <= REPAIR_ROUND_BUDGET)) {
        return `gsd_repair: ${ROUNDS_DOMAIN_MSG} (got ${args.rounds})`;
      }

      const r = await runRepairRounds({
        cwd, s, ctx, exec,
        phaseNum: args.phase, phaseName: phase.name,
        rounds: args.rounds, gitFn: ctx.gitFn,
      });
      return r.report;
    },
    presentCall: (a) => ({ card: "generic", title: `Repair phase ${a.phase}`, kind: "other", rawInput: { phase: a.phase } }),
  }));
}

export { name, inject, apply };
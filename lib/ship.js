// @dsh-gsd/bundle/ship — the Ship phase tool (opengsd /gsd-ship). Preflight
// gates (verification passed, clean tree, on a branch, remote + gh available),
// push the branch, assemble the PR body from the planning artefacts, create the
// PR with `gh pr create`, and update STATE.md ("Phase N shipped — PR #X").
//
// git/gh run through node:child_process because the bundle executes in the host
// Node process (dsh packages freely use node builtins). The PR body sections
// match opengsd: Summary, Changes, Requirements Addressed, Verification, Key
// Decisions.

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { defineTool } from "@deepseek-ai/dsh-tools";
import { parseFrontmatter, zeroPad, isValidRef } from "./_shared.js";
import { cwdOf } from "./_runner.js";
import { runCapabilityGates, fetchGitData, GATE_NAMES } from "./gates.js";
import { runPreflightVerify, copyTree, makeTempDir, cleanupTempDir } from "./preflight-verify.js";
import { buildCapability } from "./_capabilities.js";
import { buildCleanBranch, resolveCleanPr, cleanBranchName } from "./_clean-branch.js";

const name = "gsd-ship";
const inject = ["gsdState", "tools"];

const execFileP = promisify(execFile);

async function run(cwd, cmd, args) {
  return (await execFileP(cmd, args, { cwd, encoding: "utf8" })).stdout.trim();
}
async function git(cwd, args) {
  return await run(cwd, "git", args);
}
async function gitOk(cwd, args) {
  try { return await run(cwd, "git", args); } catch { return ""; }
}
async function gh(cwd, args) {
  return await run(cwd, "gh", args);
}

// Build the preflight-failure Error. The message always starts with the exact
// 'gsd_ship preflight failed:' prefix (service-tools.test.mjs asserts it). When a
// cause is provided (a git/gh exec rejection), append a trimmed/capped snippet of
// its stderr (falling back to stdout) so the real underlying failure is visible,
// and set Error.cause to the original error (D-03, D-05).
function preflightError(msg, cause) {
  let text = `gsd_ship preflight failed: ${msg}`;
  if (cause) {
    const snippet = String(cause.stderr || cause.stdout || "").trim().slice(0, 500);
    if (snippet) text += `\n${snippet}`;
    return new Error(text, { cause });
  }
  return new Error(text);
}

function apply(ctx) {
  const gsd = () => ctx.get("gsdState");

  // Publish this plugin's step capability (DEGR-01/D-02). Auto-tracked
  // revertible effect (D-09): retiring the ship plugin withdraws gsdShip.
  ctx.provide("gsdShip", buildCapability("gsdShip"));

  ctx.tools.register(defineTool({
    name: "gsd_ship",
    description: "Ship phase (opengsd /gsd-ship): preflight (verification must be passed, clean working tree, on a feature branch, remote + gh CLI available), push the branch, create a pull request with a body assembled from the planning artefacts (Summary, Changes, Requirements Addressed, Verification, Key Decisions), and mark the phase shipped in STATE.md. Prerequisite: gsd_verify returned status: passed.",
    parameters: {
      phase: { type: "number", required: true },
      draft: { type: "boolean", description: "Create the PR as a draft." },
      base: { type: "string", description: "Base branch (default: the repository's default branch)." },
      skip_gates: { type: "array", items: { type: "string", enum: ["security", "broken_windows", "tdd_audit"] }, description: "Capability gates to skip for this run (D-06)." },
      skip_verify: { type: "boolean", description: "Skip the pre-ship-verify gate (npm ci + npm test in a temp copy) for this run (D-03)." },
      no_clean_pr: { type: "boolean", description: "Disable the clean-PR branch path; push and PR the phase-N branch as-is (overrides workflow.clean_pr_branch config)." },
    },
    output: { schema: { type: "string" }, render: (_a, v) => [{ type: "text", text: v }] },
    async execute(args, exec) {
      const cwd = cwdOf(exec);
      const s = gsd();
      if (!s) throw new Error("gsd_ship: gsdState service unavailable");
      if (!(await s.isProject(cwd))) throw new Error("gsd_ship: no .planning/ project — run gsd_init first");
      const roadmap = await s.readRoadmap(cwd);
      const phase = (roadmap?.phases || []).find((p) => p.n === args.phase);
      if (!phase) throw new Error(`gsd_ship: phase ${args.phase} not in ROADMAP.md`);
      const log = [];
      const fail = (m, cause) => { throw preflightError(m, cause); };

      // ── 1. verification passed gate ─────────────────────────────────────────────
      const verText = await s.readArtifact(cwd, args.phase, "VERIFICATION").catch(() => "");
      if (!verText) fail(`no VERIFICATION.md for phase ${args.phase} — run gsd_verify first`);
      const verFm = parseFrontmatter(verText).frontmatter;
      if (String(verFm.status) !== "passed") fail(`verification status is "${verFm.status}", not "passed". Only a passed phase may ship.`);

      // ── 2. clean working tree ──────────────────────────────────────────────────
      const status = await gitOk(cwd, ["status", "--short"]);
      if (status) fail(`working tree not clean:\n${status}`);

      // ── 3. branch ────────────────────────────────────────────────────────────────
      const branch = await gitOk(cwd, ["rev-parse", "--abbrev-ref", "HEAD"]);
      const defaultBranch = args.base || (await gitOk(cwd, ["symbolic-ref", "refs/remotes/origin/HEAD", "--short"])).replace(/^origin\//, "") || "main";
      if (!branch) fail("could not determine current branch");
      if (branch === defaultBranch || /^(main|master|develop|trunk|release\/)/.test(branch)) fail(`on the base/protected branch "${branch}". Create a feature branch first (e.g. git checkout -b phase-${args.phase}).`);
      if (!isValidRef(defaultBranch)) fail(`invalid base branch "${defaultBranch}"`);
      if (args.base && !isValidRef(args.base)) fail(`invalid base branch "${args.base}"`);

      // ── 4. remote configured ────────────────────────────────────────────────────
      if (!(await gitOk(cwd, ["remote", "get-url", "origin"]))) fail('no "origin" remote configured');

      // ── 5. gh available + authenticated ──────────────────────────────────────────
      try { await gh(cwd, ["auth", "status"]); } catch (e) { fail("gh CLI not available or not authenticated (run `gh auth login`)", e); }

      // ── 5.5 capability gates (D-04…D-09) ────────────────────────────────────────
      // Run the phase's capability gates (security, broken-windows, tdd-audit)
      // BEFORE the push. Each gate scans only the phase's changed files (merge-base
      // diff), reports pass/fail/skipped on every run, and a failing required gate
      // aborts before any push/PR I/O. Full cfg is passed (never a pre-extracted
      // gates sub-object) so runCapabilityGates/resolveGatesConfig read cfg.gates.
      const cfg = await s.readConfig(cwd);
      const cleanPr = resolveCleanPr(cfg, args.no_clean_pr);
      log.push(`clean-PR branch: ${cleanPr ? "on" : "off"}`);
      const plans = await s.listPlans(cwd, args.phase);
      for (const skip of args.skip_gates || []) {
        if (!GATE_NAMES.includes(skip)) fail(`unknown skip gate "${skip}"`);
      }
      const gitData = await fetchGitData(cwd, git, defaultBranch);
      const { reportLines, blockError } = runCapabilityGates({ cfg, gitData, plans, skipGates: args.skip_gates || [] });
      log.push("## Gate Report", ...reportLines);
      if (blockError) fail(blockError);

      // ── 5.6 pre-ship-verify gate (SHIP-01, D-01…D-06) ─────────────────────────────
      // Deterministic local verification before pushing: run a clean `npm ci` +
      // `npm test` in a temp copy of the working tree (excluding node_modules/.git).
      // Runs AFTER the cheap capability gates (fail fast first) and BEFORE any
      // push/PR I/O. A failing npm ci or npm test fails the ship via preflightError
      // with the real cause; the temp dir is always removed in a finally (D-06).
      // Skippable only via the dedicated skip_verify flag (D-03), independent of
      // the capability-gate skip_gates array.
      if (args.skip_verify) {
        log.push("pre-ship-verify: skipped");
      } else {
        let tempDir;
        try {
          tempDir = await makeTempDir();
          await copyTree(cwd, tempDir);
          const res = await runPreflightVerify(tempDir);
          if (res.status === "fail") {
            fail(`pre-ship-verify failed: ${res.step}`, { stderr: res.output });
          }
          log.push("pre-ship-verify: pass");
        } finally {
          if (tempDir) await cleanupTempDir(tempDir);
        }
      }

      // ── 6. push branch ──────────────────────────────────────────────────────────
      try { await git(cwd, ["push", "-u", "origin", branch]); log.push(`pushed ${branch}`); }
      catch (e) { fail(`git push failed: ${e.message}`, e); }

      // ── 7. generate PR body ──────────────────────────────────────────────────────
      const summaries = [];
      for (const p of plans) {
        const sum = await s.readArtifact(cwd, args.phase, `SUMMARY-${String(p.plan).padStart(2, "0")}`).catch(() => "");
        summaries.push({ p, sum });
      }
      const state = await s.readState(cwd);

      const body = [
        `## Phase ${args.phase}: ${phase.name}`,
        "",
        "### Summary",
        "",
        `**Goal:** ${phase.goal}`,
        "",
        `**Verification:** ${verFm.status} (score ${verFm.score || "n/a"})`,
        "",
        ...summaries.map(({ p, sum }) => {
          const fm = sum ? parseFrontmatter(sum).frontmatter : {};
          const kf = fm["key-files"] || fm.key_files || {};
          const created = Array.isArray(kf.created) ? kf.created.join(", ") : "";
          return `- **${p.id}** — ${p.objective ? p.objective.split("\n")[0].slice(0, 120) : "plan"}${created ? ` (files: ${created})` : ""}`;
        }),
        "",
        "### Requirements Addressed",
        "",
        ...(phase.requirements || []).map((r) => `- ${r}`) || ["(none)"],
        "",
        "### Verification",
        "",
        `Automated + human items from VERIFICATION.md (status: ${verFm.status}). ${verFm.behavior_unverified ? `${verFm.behavior_unverified} behavior-unverified item(s).` : ""}`,
        "",
        "### Key Decisions",
        "",
        ...(state.body.decisions.length ? state.body.decisions.map((d) => `- ${d}`) : ["(none)"]),
        "",
        `_Shipped via dsh-gsd-bundle_`,
      ].join("\n");

      // ── 8. create PR ──────────────────────────────────────────────────────────────
      const title = `Phase ${args.phase}: ${phase.name}`;
      const tmp = `${cwd}/.planning/.pr-body-${args.phase}.md`;
      const fs = await import("node:fs/promises");
      await fs.writeFile(tmp, body, "utf8");
      let prUrl;
      try {
        const prArgs = ["pr", "create", "--title", title, "--body-file", tmp, "--base", defaultBranch];
        if (args.draft) prArgs.push("--draft");
        prUrl = await gh(cwd, prArgs);
      } catch (e) {
        fail(`gh pr create failed: ${e.message}`, e);
      }
      await fs.unlink(tmp).catch(() => {});
      const prNum = (prUrl.match(/pull\/(\d+)/) || [])[1] || "?";

      // ── 9. update STATE ───────────────────────────────────────────────────────────
      await s.updateStateFrontmatter(cwd, { status: `Phase ${args.phase} shipped — PR #${prNum}`, stopped_at: `Phase ${args.phase} shipped — PR #${prNum}` });
      await s.addDecision(cwd, `Phase ${args.phase} shipped — PR #${prNum} (${prUrl})`);
      await s.completePhase(cwd, args.phase);

      // ── 10. commit + push completion state ──────────────────────────────────────
      // The branch and PR were pushed/created above (steps 6 & 8), but completePhase
      // (with updateStateFrontmatter/addDecision) only just wrote the completion
      // markers to .planning/. Those writes happen after the PR number is known, so
      // they sit only in the local working tree unless committed and pushed here. If
      // we skip this, the pushed branch (and therefore main after merge) is missing
      // the "phase complete" bookkeeping and shows stale progress. Commit + push now.
      await git(cwd, ["add", ".planning"]);
      // Only commit if something was actually staged (completePhase always writes,
      // but guard anyway against the "nothing to commit" error).
      const staged = await git(cwd, ["diff", "--cached", "--name-only"]);
      if (staged) {
        try {
          await git(cwd, ["commit", "-m", `docs(planning): mark phase ${args.phase} complete (shipped — PR #${prNum})`]);
          await git(cwd, ["push", "origin", branch]);
          log.push(`pushed completion state for phase ${args.phase}`);
        } catch (e) {
          fail(`git commit/push of completion state failed: ${e.message}`, e);
        }
      } else {
        log.push(`no completion state changes to push for phase ${args.phase}`);
      }

      log.push(`PR created: ${prUrl}`, `STATE updated: phase ${args.phase} shipped — PR #${prNum}`);
      return log.join("\n");
    },
    presentCall: (a) => ({ card: "generic", title: `Ship phase ${a.phase}`, kind: "other", rawInput: { phase: a.phase } }),
  }));
}

export { name, inject, apply, preflightError };
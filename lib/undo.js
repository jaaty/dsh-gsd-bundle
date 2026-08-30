// @dsh-gsd/bundle/undo — the out-of-band gsd_undo rollback tool (opengsd
// /gsd-undo). Rolls back a phase's or plan's commits via `git revert`,
// deriving the commit set from git history at undo-time (no persisted
// manifest), with strict dependency checks, a dry-run-by-default confirmation
// gate, a full rollback of code + .planning/ artefacts (phase-level), an
// UNDO.md audit record, no-git safe-degrade, and config soft-gating.
//
// Structurally modeled on lib/validate-phase.js:
// - publishes the gsdUndo capability (role "out-of-band", NOT_LOOP_ORDERED —
//   visible in gsd_status informational entries but never loop-ordered)
// - registers the /gsd-undo command's tool (gsd_undo)
// - config-soft-gated via workflow.undo === false (default on; soft-skip writes
//   no artefact and never throws)
// - acquires the phase branch via ensurePhaseBranch for in-flight phases;
//   stays on the current branch for shipped phases (D-04)
// - writes <base>-UNDO.md (phase-level) / <base>-UNDO-PP.md (plan-level) via
//   writeArtifact + commitArtifacts
//
// OUT-OF-BAND: undo is NOT a loop step. It does NOT mutate STATE.md's loop
// position, does NOT appear in the loop chain, and does NOT call
// s.setActivePhase. It is registered with role "out-of-band" so
// loopSteps/effectiveRoutableStep never route into it (D-09 / OQ-1).
//
// The pure domain helpers (filterPlanCommits, revertArgsFor,
// checkPhaseDependencies, checkPlanDependencies, renderDryRunReport,
// renderUndoBody) are exported with NO ctx / NO fs / NO git parameters so they
// are unit-testable directly (D-12, mirroring _clean-branch.js /
// validate-phase.js). All I/O happens in apply().

import { defineTool } from "@deepseek-ai/dsh-tools";
import { nowIso, today, zeroPad, stringifyFrontmatter } from "./_shared.js";
import { cwdOf } from "./_runner.js";
import { ensurePhaseBranch, commitArtifacts, defaultGitFn } from "./_git-artifacts.js";
import { buildCapability } from "./_capabilities.js";
import { parseNameStatusZ } from "./_clean-branch.js";
import { resolvePlanDep } from "./_shared.js";

const name = "gsd-undo";
// R-6: undo spawns NO subagent — do NOT declare "subagents" in inject.
const inject = ["gsdState", "tools"];

// ── pure domain helpers (no ctx, no I/O — unit-testable directly) ───────────────

// Plan-level commit filter (D-03): given an array of `{hash, subject, parents}`
// and a scope RegExp, return only those whose `subject` matches `scopeRe`.
// The scope token is `(phaseBase-PP)` per lib/execute.js:132, where phaseBase
// is the phase directory base name (e.g. GSD-41-undo) from s.phaseDirAndBase,
// NOT the git base branch. Planning-artefact commits
// (`docs(planning): phase ... artefacts`) carry no per-plan token and are
// intentionally NOT matched — plan-level undo reverts only source commits.
export function filterPlanCommits(commits, scopeRe) {
  return (commits || []).filter((c) => c && typeof c.subject === "string" && scopeRe.test(c.subject));
}

// Build the fixed git arg array for reverting a single commit (OQ-4 / R-1).
// A merge commit (≥2 parents) is reverted with `-m 1`; a normal commit without.
// `parents` is a string of space-separated parent hashes (git log %P output).
export function revertArgsFor(commit) {
  const parents = String(commit?.parents ?? "").trim().split(/\s+/).filter(Boolean);
  const mergeArgs = parents.length >= 2 ? ["-m", "1"] : [];
  return ["revert", "--no-edit", ...mergeArgs, commit.hash];
}

// Phase-level dependency refusal (D-05). `phases` is the roadmap phases array
// `[{n, status, name}]`; `targetN` is the target phase number;
// `laterPhaseSummaries` is a pre-resolved array of `{n, hasSummary}` for each
// phase `n > targetN`. Refuse when ANY later phase is shipped (status
// "Complete") OR has a SUMMARY (executed). No git ancestry probing.
export function checkPhaseDependencies(phases, targetN, laterPhaseSummaries) {
  const dependents = [];
  for (const p of phases || []) {
    if (p.n <= targetN) continue;
    const summary = (laterPhaseSummaries || []).find((s) => s.n === p.n);
    const hasSummary = summary ? summary.hasSummary : false;
    if (p.status === "Complete") {
      dependents.push(`phase ${p.n}: ${p.name} (shipped)`);
    } else if (hasSummary) {
      dependents.push(`phase ${p.n}: ${p.name} (has SUMMARY)`);
    }
  }
  return { refuse: dependents.length > 0, dependents };
}

// Plan-level dependency refusal (D-05). `plans` is the listPlans output array
// `[{plan, has_summary, depends_on, id}]`; `targetPlanNum` is the numeric
// target plan number. BFS over plans with Number(plan.plan) > targetPlanNum,
// following `depends_on` edges (resolvePlanDep tolerates the project-code
// prefix). If any path from a later plan reaches the target plan, refuse.
export function checkPlanDependencies(plans, targetPlanNum) {
  const targetPlan = (plans || []).find((p) => Number(p.plan) === targetPlanNum);
  const targetId = targetPlan ? targetPlan.id : null;
  const laterPlans = (plans || []).filter((p) => Number(p.plan) > targetPlanNum);
  const dependents = [];

  // BFS from each later plan; if we reach the target plan, record it.
  for (const start of laterPlans) {
    const visited = new Set();
    const queue = [start];
    let reaches = false;
    while (queue.length) {
      const cur = queue.shift();
      if (visited.has(cur.id)) continue;
      visited.add(cur.id);
      if (cur.id === targetId) {
        reaches = true;
        break;
      }
      for (const dep of cur.depends_on || []) {
        const resolved = resolvePlanDep(plans, dep);
        if (resolved) queue.push(resolved);
      }
    }
    if (reaches) dependents.push(start.id);
  }

  return { refuse: dependents.length > 0, dependents };
}

// Dry-run report rendering (OQ-8: return a string, mirroring validate-phase).
// `commits` is the derived commit set (newest→oldest, already filtered);
// `files` is the parseNameStatusZ output; `dependents` is the string array
// from the dependency check (empty if allowed).
export function renderDryRunReport({ phase, scope, commits, files, dependents }) {
  const lines = [];
  lines.push(`# Undo dry-run: phase ${phase.n} (${phase.name})`);
  lines.push(`**Scope:** ${scope}`);
  lines.push("");
  lines.push("## Commits to revert (newest → oldest):");
  if (commits && commits.length) {
    for (const c of commits) {
      lines.push(`  ${c.hash} ${c.subject}`);
    }
  } else {
    lines.push("  (no commits matched the scope)");
  }
  lines.push("");
  lines.push("## Affected files:");
  if (files && files.length) {
    for (const f of files) {
      if (f.status === "R") {
        lines.push(`  R ${f.oldPath} → ${f.newPath}`);
      } else {
        lines.push(`  ${f.status} ${f.path}`);
      }
    }
  } else {
    lines.push("  (none)");
  }
  lines.push("");
  lines.push("## Dependents:");
  if (dependents && dependents.length) {
    for (const d of dependents) lines.push(`  ${d}`);
  } else {
    lines.push("  None");
  }
  lines.push("");
  lines.push("Re-call gsd_undo with confirm:true to execute these reverts.");
  return lines.join("\n");
}

// UNDO.md body rendering (Claude's Discretion, mirror VALIDATION.md's style).
// Returns a Markdown body with the reverted-commits table, affected-files
// summary, and a timestamp footer.
export function renderUndoBody({ phase, scope, commits, files, timestamp }) {
  const lines = [];
  lines.push(`# Phase ${phase.n}: ${phase.name} - Undo Record`, "");
  lines.push(`**Scope:** ${scope}`);
  lines.push(`**Undone:** ${timestamp}`, "");
  lines.push("## Reverted commits", "");
  lines.push("| hash | subject |");
  lines.push("|---|---|");
  if (commits && commits.length) {
    for (const c of commits) {
      // Escape pipes in subject for Markdown table safety.
      const subj = String(c.subject).replace(/\|/g, "\\|");
      lines.push(`| ${c.hash} | ${subj} |`);
    }
  } else {
    lines.push("| — | (no commits reverted) |");
  }
  lines.push("");
  lines.push("## Affected files", "");
  if (files && files.length) {
    for (const f of files) {
      if (f.status === "R") {
        lines.push(`- R: ${f.oldPath} → ${f.newPath}`);
      } else {
        lines.push(`- ${f.status}: ${f.path}`);
      }
    }
  } else {
    lines.push("_No affected files._");
  }
  lines.push("");
  lines.push("---", "", `*Phase: ${String(phase.n).padStart(2, "0")}-${phase.name}*`, `*Undo: ${today()}*`);
  return lines.join("\n");
}

// ── integration (I/O-bound) ───────────────────────────────────────────────────

function apply(ctx) {
  const gsd = () => ctx.get("gsdState");

  // Publish the gsdUndo capability (DEGR-01 / D-11). Auto-tracked revertible
  // effect: retiring the undo plugin withdraws gsdUndo and its /gsd-undo command.
  ctx.provide("gsdUndo", buildCapability("gsdUndo"));

  ctx.tools.register(defineTool({
    name: "gsd_undo",
    description: "Undo (roll back) a phase's or plan's commits via git revert (opengsd /gsd-undo): derives the commit set from git history at undo-time, checks dependencies (refuses if a later phase/plan depends on this one), dry-runs by default (confirm:true executes), writes UNDO.md. Out-of-band — does not mutate STATE.md loop position. Optional `base` overrides the git base branch (default: detected via symbolic-ref, fallback main).",
    parameters: {
      phase: { type: "number" },
      plan: { type: "string" },
      confirm: { type: "boolean" },
      base: { type: "string" },
    },
    output: { schema: { type: "string" }, render: (_a, v) => [{ type: "text", text: v }] },
    async execute(args, exec) {
      const cwd = cwdOf(exec);
      const s = gsd();
      if (!s) throw new Error("gsd_undo: gsdState service unavailable");
      if (!(await s.isProject(cwd))) throw new Error("gsd_undo: no .planning/ project — run gsd_init first");
      const roadmap = await s.readRoadmap(cwd);
      const phase = (roadmap?.phases || []).find((p) => p.n === args.phase);
      if (!phase) throw new Error(`gsd_undo: phase ${args.phase} not in ROADMAP.md`);

      const gitFn = ctx.gitFn || defaultGitFn;

      // ── CONFIG SOFT-GATE (D-11, mirror validate-phase.js:385-390) ──────────
      const cfg = await s.readConfig(cwd);
      if (cfg.workflow?.undo === false) {
        return "Undo skipped (undo capability inactive) — workflow.undo is false. No action taken.";
      }

      // ── IDEMPOTENCY CHECK (D-10) ────────────────────────────────────────────
      const planNum = args.plan ? Number(args.plan) : null;
      const undoSuffix = planNum !== null ? "UNDO-" + zeroPad(planNum) : "UNDO";
      if (await s.hasArtifact(cwd, phase.n, undoSuffix)) {
        return "Undo refused: an UNDO.md already exists for " +
          (planNum !== null ? "plan " + zeroPad(planNum) : "the phase") +
          " of phase " + phase.n +
          ". Re-undo is not supported (would create duplicate revert commits).";
      }

      // ── DEPENDENCY CHECK (D-05) ──────────────────────────────────────────────
      let depResult = { refuse: false, dependents: [] };
      if (planNum === null) {
        // Phase-level: any later phase with a SUMMARY or shipped.
        const laterPhaseSummaries = [];
        for (const p of roadmap.phases || []) {
          if (p.n > phase.n) {
            const plans = await s.listPlans(cwd, p.n);
            laterPhaseSummaries.push({ n: p.n, hasSummary: plans.some((pl) => pl.has_summary) });
          }
        }
        depResult = checkPhaseDependencies(roadmap.phases, phase.n, laterPhaseSummaries);
      } else {
        // Plan-level: any later plan whose depends_on graph reaches the target.
        const plans = await s.listPlans(cwd, phase.n);
        depResult = checkPlanDependencies(plans, planNum);
      }
      if (depResult.refuse) {
        return "Undo refused for phase " + phase.n + ": later work depends on it.\n  " +
          depResult.dependents.join("\n  ") +
          "\nReverting would break the dependency chain. No action taken.";
      }

      // ── NO-GIT PROBE (D-08, first git-touching gate per OQ-6) ───────────────
      try {
        await gitFn(cwd, ["rev-parse", "--abbrev-ref", "HEAD"]);
      } catch {
        return "Undo no-op: git unavailable or not a repository. No action taken.";
      }

      // ── BRANCH HANDLING (OQ-6) ───────────────────────────────────────────────
      const isShipped = phase.status === "Complete";
      let branchInfo;
      if (!isShipped) {
        branchInfo = await ensurePhaseBranch(cwd, phase.n, gitFn);
      } else {
        branchInfo = { branch: "(current)", action: "noop-shipped" };
      }

      // ── DERIVE COMMIT SET (D-01, OQ-2) ───────────────────────────────────────
      // GIT BASE BRANCH (mirror lib/ship.js:96 — never hard-code "main"):
      let gitBase = args.base || "";
      if (!gitBase) {
        try {
          gitBase = (await gitFn(cwd, ["symbolic-ref", "refs/remotes/origin/HEAD", "--short"]))
            .replace(/^origin\//, "").trim();
        } catch {
          gitBase = "";
        }
      }
      if (!gitBase) gitBase = "main";

      // PHASE BASE NAME (the plan-level scope-token source, per lib/execute.js):
      const { base: phaseBase } = await s.phaseDirAndBase(cwd, phase.n);

      // Best-effort fetch so origin/<base> is a valid local ref (mirror _clean-branch).
      try { await gitFn(cwd, ["fetch", "origin", gitBase, "--quiet"]); } catch { /* best-effort */ }

      // MERGE-BASE (guarded per D-08):
      let mergeBase = "";
      try {
        mergeBase = (await gitFn(cwd, ["merge-base", "origin/" + gitBase, "HEAD"])).trim();
      } catch {
        try {
          mergeBase = (await gitFn(cwd, ["merge-base", gitBase, "HEAD"])).trim();
        } catch {
          return "Undo no-op: could not derive a merge-base against \"" + gitBase + "\" (no matching ref). No action taken.";
        }
      }

      const headCommit = (await gitFn(cwd, ["rev-parse", "HEAD"])).trim();

      // Commit set: git log in the mergeBase..headCommit range, newest→oldest.
      const logRaw = await gitFn(cwd, ["log", "--format=%H%x09%s%x09%P", mergeBase + ".." + headCommit]);
      const commits = [];
      for (const line of String(logRaw).split("\n")) {
        if (!line.trim()) continue;
        const [hash, subject, parents] = line.split("\t");
        commits.push({ hash, subject, parents: parents || "" });
      }

      // Affected files for the dry-run report (parseNameStatusZ reuse — OQ-2).
      const diffRaw = await gitFn(cwd, ["diff", "--name-status", "-z", mergeBase, headCommit]);
      const files = parseNameStatusZ(diffRaw);

      // PLAN-LEVEL FILTER (D-03):
      let scoped;
      const scopeLabel = planNum !== null ? "plan-" + zeroPad(planNum) : "phase";
      if (planNum !== null) {
        const escapeRe = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const scopeRe = new RegExp("\\(" + escapeRe(phaseBase) + "-" + zeroPad(planNum) + "\\)");
        scoped = filterPlanCommits(commits, scopeRe);
      } else {
        // Phase-level: all commits in range (including planning-artefact commits
        // per D-07 full rollback).
        scoped = commits;
      }

      // ── DRY-RUN (D-06, OQ-8) ─────────────────────────────────────────────────
      if (args.confirm !== true) {
        return renderDryRunReport({
          phase,
          scope: scopeLabel,
          commits: scoped,
          files,
          dependents: depResult.refuse ? depResult.dependents : [],
        });
      }

      // ── CONFIRM: EXECUTE REVERTS (D-02, D-07, OQ-7) ──────────────────────────
      // scoped is already newest→oldest (git log order) — revert in that order
      // (P1: newest→oldest so each revert applies onto a tree that still contains
      // the later changes it depends on).
      for (const commit of scoped) {
        try {
          await gitFn(cwd, revertArgsFor(commit));
        } catch (e) {
          // R-2: no partial record — do NOT write UNDO.md on a revert failure.
          return "Undo failed: git revert of " + commit.hash + " (" + commit.subject + ") failed: " +
            (e && e.message ? e.message : String(e)) +
            ". No UNDO.md written. Resolve the conflict and re-run.";
        }
      }

      // ── WRITE UNDO.md (D-09) ─────────────────────────────────────────────────
      const timestamp = nowIso();
      const fm = {
        phase: String(phase.n),
        undone: timestamp,
        scope: scopeLabel,
        base: gitBase,
        commits: String(scoped.length),
      };
      const body = renderUndoBody({ phase, scope: scopeLabel, commits: scoped, files, timestamp });
      const full = stringifyFrontmatter(fm) + "\n" + body;
      const ctxPath = await s.writeArtifact(cwd, phase.n, undoSuffix, full);

      // Commit the artefact via the shared seam (D-09). commitArtifacts stages
      // .planning wholesale (P4 accepted per existing contract).
      const commit = await commitArtifacts(cwd, phase.n, { scope: "undo", phaseName: phase.name }, gitFn);
      const commitNote = ` Artefacts committed: ${commit.committed} (${commit.staged.length} file(s)).` +
        (commit.warning ? ` WARNING: ${commit.warning}.` : "");

      // Do NOT call s.setActivePhase — undo is out-of-band (D-09).
      return "Undo complete for phase " + phase.n + " (" + phase.name + "). Reverted " +
        scoped.length + " commit(s) (" + scopeLabel + "). Wrote " + ctxPath + "." +
        commitNote + " Branch: " + branchInfo.action + ".";
    },
    presentCall: (a) => ({
      card: "generic",
      title: "Undo phase " + a.phase,
      kind: "other",
      rawInput: { phase: a.phase, plan: a.plan, confirm: a.confirm, base: a.base },
    }),
  }));
}

export { name, inject, apply };
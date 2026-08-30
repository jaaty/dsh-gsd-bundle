// @dsh-gsd/bundle/health — the health diagnostic's deterministic pure-JS scan
// core (opengsd /gsd-health). This module (Plan 01) ships ONLY the pure scan
// helpers + severity classification, unit-testable directly with no ctx / no I/O
// (D-03). The gsdHealth capability, gsd_health tool, /gsd-health command, and
// the <NN>-HEALTH.md artefact write are added in Plan 02.
//
// D-03: the health scan is a DETERMINISTIC pure-JS scan executed with no
// fresh-context sub-agent and no tokens, exactly like gap-analysis.js. Because
// no sub-agent is spawned, the plugin injects NO sub-agent coeffect (DEGR-07).
//
// Each helper returns an array of issue objects:
//   { code, severity: 'error'|'warning'|'info', message, fix, repairable }
// Severity classification (D-06): errors → broken, warnings → degraded, else
// healthy. Repair is config-only and additive (D-07): only W-04 (create config)
// and W-05 (add missing workflow keys) are repairable.

import { defineTool } from "@deepseek-ai/dsh-tools";
import { nowIso, today, zeroPad, stringifyFrontmatter } from "./_shared.js";
import { cwdOf } from "./_runner.js";
import { ensurePhaseBranch, commitArtifacts } from "./_git-artifacts.js";
import { buildCapability } from "./_capabilities.js";

const name = "gsd-health";
// DEGR-07: the sub-agent coeffect is deliberately ABSENT — health is a
// deterministic pure-JS scan (D-03), so the fiber must not depend on the host
// sub-agent service. gsdState + tools mirror the other loop steps.
const inject = ["gsdState", "tools"];

// A phase dir name follows the NN-slug format: an optional project-code prefix
// (uppercase alnum + "-"), a zero-padded 2-digit phase number, then a slug.
const DIR_NAME_RE = /^([A-Z0-9]+-)?(\d{2})-([a-z0-9-]+)$/;

// Required top-level config.json keys (D-07, OQ-5). `jobs` is deliberately
// optional — resolveJobsConfig degrades safely to defaults on its absence.
const REQUIRED_TOP_LEVEL = ["gsd_state_version", "workflow", "context_window", "project_code", "response_language"];

// Valid values for the workflow.code_review_depth field (mirrors the
// gsd_code_review depth enum in lib/code-review.js).
const VALID_DEPTHS = ["quick", "standard", "deep"];

// ── phase-dir naming (D-04 a) ─────────────────────────────────────────────────
// Every phase dir must follow the NN-slug format. A non-matching name is a
// warning (W-01) with manual-fix guidance only (never auto-renamed — D-07).
export function checkPhaseDirNaming(dirNames) {
  const issues = [];
  for (const name of dirNames || []) {
    if (!DIR_NAME_RE.test(String(name))) {
      issues.push({
        code: "W-01",
        severity: "warning",
        message: `Phase dir "${name}" does not follow the NN-slug format`,
        fix: "rename the dir to NN-slug (e.g. 42-health)",
        repairable: false,
      });
    }
  }
  return issues;
}

// ── phase/plan numbering (D-04 a) ──────────────────────────────────────────────
// Extract the zero-padded NN from each dir; a duplicate NN or a non-monotonic
// sequence is a warning (W-02). Malformed dirs (no extractable NN) are skipped —
// they are already flagged by checkPhaseDirNaming (W-01).
export function checkNumbering(dirNames) {
  const issues = [];
  const seen = new Set();
  let prev = -1;
  for (const name of dirNames || []) {
    const m = String(name).match(DIR_NAME_RE);
    if (!m) continue;
    const nn = Number(m[2]);
    if (seen.has(nn)) {
      issues.push({
        code: "W-02",
        severity: "warning",
        message: `Duplicate phase number ${m[2]} in dir "${name}"`,
        fix: "renumber the duplicate phase dir",
        repairable: false,
      });
    }
    seen.add(nn);
    if (nn < prev) {
      issues.push({
        code: "W-02",
        severity: "warning",
        message: `Non-monotonic phase numbering: "${name}" (${m[2]}) after ${prev}`,
        fix: "reorder phase dirs to a monotonic sequence",
        repairable: false,
      });
    }
    prev = nn;
  }
  return issues;
}

// ── orphan SUMMARYs (D-04 b) ───────────────────────────────────────────────────
// phaseFiles is { dirName: [fileNames] }. A SUMMARY-<PP>.md with no matching
// PLAN-<PP>.md is a warning (W-03) — an orphan that should not exist.
export function checkOrphanSummaries(phaseFiles) {
  const issues = [];
  for (const [dir, files] of Object.entries(phaseFiles || {})) {
    const names = files || [];
    for (const f of names) {
      const m = String(f).match(/-(\d+)-SUMMARY\.md$/);
      if (!m) continue;
      const plan = String(f).replace(/-(\d+)-SUMMARY\.md$/, `-${m[1]}-PLAN.md`);
      if (!names.includes(plan)) {
        issues.push({
          code: "W-03",
          severity: "warning",
          message: `Orphan SUMMARY "${f}" in "${dir}" has no matching PLAN`,
          fix: "add the matching PLAN or remove the orphan SUMMARY",
          repairable: false,
        });
      }
    }
  }
  return issues;
}

// ── plans-without-SUMMARY (D-04 c, D-06) ─────────────────────────────────────
// A PLAN-<PP>.md with no SUMMARY-<PP>.md is INFO (I-01) — the plan may be in
// progress (upstream I001), so it is not a defect.
export function checkPlansWithoutSummary(phaseFiles) {
  const issues = [];
  for (const [dir, files] of Object.entries(phaseFiles || {})) {
    const names = files || [];
    for (const f of names) {
      const m = String(f).match(/-(\d+)-PLAN\.md$/);
      if (!m) continue;
      const summary = String(f).replace(/-(\d+)-PLAN\.md$/, `-${m[1]}-SUMMARY.md`);
      if (!names.includes(summary)) {
        issues.push({
          code: "I-01",
          severity: "info",
          message: `PLAN "${f}" in "${dir}" has no SUMMARY yet (may be in progress)`,
          fix: "write the SUMMARY when the plan completes",
          repairable: false,
        });
      }
    }
  }
  return issues;
}

// ── DISCUSSION-LOG without CONTEXT (D-06, R-4) ─────────────────────────────────
// A phase dir with DISCUSSION-LOG.md but no CONTEXT.md is INFO (I-02), NOT a
// warning: CONTEXT.md lives on the unshipped phase-<N> branch, so its absence on
// the current branch is normal mid-phase (avoids false positives on main).
export function checkDiscussionLogWithoutContext(phaseFiles) {
  const issues = [];
  for (const [dir, files] of Object.entries(phaseFiles || {})) {
    const names = files || [];
    const hasLog = names.some((f) => /^DISCUSSION-LOG\.md$/i.test(String(f)));
    const hasContext = names.some((f) => /-CONTEXT\.md$/i.test(String(f)));
    if (hasLog && !hasContext) {
      issues.push({
        code: "I-02",
        severity: "info",
        message: `"${dir}" has DISCUSSION-LOG.md but no CONTEXT.md (normal mid-phase: CONTEXT lives on the unshipped phase branch)`,
        fix: "none — CONTEXT lands on the phase branch at discuss",
        repairable: false,
      });
    }
  }
  return issues;
}

// ── config.json validation (D-04 d, D-06, D-07, OQ-4/OQ-5) ────────────────────
// Distinguishes the three states readConfig masks (OQ-3): missing (W-04,
// repairable), unparseable (E-01, broken, not repairable), and present-but-
// missing-keys (W-05, repairable). Invalid field values are W-06 (not
// repairable). Required workflow keys = the defaultConfig.workflow set ∪
// { ai_integration_phase } (D-07, OQ-4); `jobs` is optional (OQ-5).
export function checkConfig(rawConfigText, defaultConfig) {
  const issues = [];
  if (rawConfigText === undefined || rawConfigText === null || String(rawConfigText).trim() === "") {
    issues.push({
      code: "W-04",
      severity: "warning",
      message: "config.json is missing",
      fix: "create config.json with the default values",
      repairable: true,
    });
    return issues;
  }
  let cfg;
  try {
    cfg = JSON.parse(rawConfigText);
  } catch {
    issues.push({
      code: "E-01",
      severity: "error",
      message: "config.json is not valid JSON",
      fix: "fix the JSON syntax manually",
      repairable: false,
    });
    return issues;
  }
  if (typeof cfg !== "object" || cfg === null || Array.isArray(cfg)) {
    issues.push({
      code: "E-01",
      severity: "error",
      message: "config.json root is not an object",
      fix: "fix the config root manually",
      repairable: false,
    });
    return issues;
  }

  const schema = defaultConfig || {};
  const requiredWorkflow = [...Object.keys(schema.workflow || {}), "ai_integration_phase"];

  for (const key of REQUIRED_TOP_LEVEL) {
    if (!(key in cfg)) {
      issues.push({
        code: "W-05",
        severity: "warning",
        message: `config.json is missing required top-level key "${key}"`,
        fix: `add "${key}" to config.json`,
        repairable: true,
      });
    }
  }

  const wf = cfg.workflow;
  if (wf !== undefined && (typeof wf !== "object" || wf === null || Array.isArray(wf))) {
    issues.push({
      code: "W-06",
      severity: "warning",
      message: "config.json workflow is not an object",
      fix: "fix the workflow block manually",
      repairable: false,
    });
  } else if (wf && typeof wf === "object") {
    for (const key of requiredWorkflow) {
      if (!(key in wf)) {
        issues.push({
          code: "W-05",
          severity: "warning",
          message: `config.json is missing required workflow key "${key}"`,
          fix: `add "${key}: true" to workflow`,
          repairable: true,
        });
      }
    }
    if (wf.code_review_depth !== undefined && !VALID_DEPTHS.includes(wf.code_review_depth)) {
      issues.push({
        code: "W-06",
        severity: "warning",
        message: `config.json code_review_depth "${wf.code_review_depth}" is not one of ${VALID_DEPTHS.join(", ")}`,
        fix: "set code_review_depth to quick, standard, or deep",
        repairable: false,
      });
    }
  }

  if (cfg.context_window !== undefined && !(typeof cfg.context_window === "number" && Number.isFinite(cfg.context_window) && cfg.context_window > 0)) {
    issues.push({
      code: "W-06",
      severity: "warning",
      message: "config.json context_window is not a positive number",
      fix: "set context_window to a positive number",
      repairable: false,
    });
  }

  return issues;
}

// ── STATE/ROADMAP disagreement (D-04 e) ────────────────────────────────────────
// stateFm is the STATE.md frontmatter; roadmapPhases is the ROADMAP phases array
// (each { n, status }). An active_phase not in the roadmap is W-07; an
// active_phase pointing at a roadmap phase marked done is W-08.
export function checkStateRoadmap(stateFm, roadmapPhases) {
  const issues = [];
  const fm = stateFm || {};
  const active = fm.active_phase;
  if (active === undefined || active === null || active === "") return issues;
  const activeNum = Number(active);
  const phase = (roadmapPhases || []).find((p) => Number(p.n) === activeNum);
  if (!phase) {
    issues.push({
      code: "W-07",
      severity: "warning",
      message: `STATE active_phase "${active}" is not in ROADMAP`,
      fix: "align STATE active_phase with a ROADMAP phase",
      repairable: false,
    });
    return issues;
  }
  const status = String(phase.status || "").toLowerCase();
  if (status === "complete" || status === "done") {
    issues.push({
      code: "W-08",
      severity: "warning",
      message: `STATE active_phase "${active}" is a ROADMAP phase marked done`,
      fix: "advance STATE to the next active phase",
      repairable: false,
    });
  }
  return issues;
}

// ── severity classification (D-05, D-06) ──────────────────────────────────────
// Any error → 'broken'; any warning → 'degraded'; else 'healthy'.
export function classifyIssue(issues) {
  const list = issues || [];
  if (list.some((i) => i && i.severity === "error")) return "broken";
  if (list.some((i) => i && i.severity === "warning")) return "degraded";
  return "healthy";
}

// ── non-destructive repair (D-07, D-08) ───────────────────────────────────────
// Pure helper (no ctx / no I/O) that computes the config-only, additive fixes
// for a raw config.json text. Returns { config, repairs }:
//   - rawConfigText undefined/empty → { config: defaultConfig, repairs: [R-01] }
//     (create a missing config.json with defaults).
//   - rawConfigText parses to an object → deep-copy it, then for each workflow
//     key in the repair set (the defaultConfig.workflow keys ∪ { ai_integration_phase },
//     per D-07/OQ-4) that is missing from config.workflow, add it with value true
//     and push an R-02 repair entry. Never overwrites an existing key's value,
//     never touches top-level keys beyond workflow, never regenerates STATE.md,
//     never renames dirs, never deletes files (D-07).
//   - unparseable / non-object → { config: null, repairs: [] } (E-01 is not
//     repairable; the caller must not write).
export function repairConfig(rawConfigText, defaultConfig) {
  if (rawConfigText === undefined || rawConfigText === null || String(rawConfigText).trim() === "") {
    return {
      config: defaultConfig,
      repairs: [{ code: "R-01", message: "created missing config.json with defaults" }],
    };
  }
  let cfg;
  try {
    cfg = JSON.parse(rawConfigText);
  } catch {
    return { config: null, repairs: [] };
  }
  if (typeof cfg !== "object" || cfg === null || Array.isArray(cfg)) {
    return { config: null, repairs: [] };
  }
  // Deep copy so the returned config is a fresh object (never mutates the input).
  const config = JSON.parse(JSON.stringify(cfg));
  const repairSet = [...Object.keys((defaultConfig || {}).workflow || {}), "ai_integration_phase"];
  if (typeof config.workflow !== "object" || config.workflow === null) {
    config.workflow = {};
  }
  const repairs = [];
  for (const key of repairSet) {
    if (!(key in config.workflow)) {
      config.workflow[key] = true;
      repairs.push({ code: "R-02", message: `added missing workflow key "${key}"` });
    }
  }
  return { config, repairs };
}

// ── integration (I/O-bound) ───────────────────────────────────────────────────
// Plan 02: the full out-of-band loop-step plugin surface (D-01), mirroring
// lib/gap-analysis.js. Publishes the gsdHealth capability, registers the
// gsd_health tool, runs the whole-project deterministic scan, writes
// <NN>-HEALTH.md via writeArtifact, advances STATE via addDecision ONLY (never
// setActivePhase — OQ-2/R-1), and lands the artefact on the phase-<N> branch via
// the shared git seam. Repair dispatch (repairConfig) lands in Plan 03.
function apply(ctx) {
  const gsd = () => ctx.get("gsdState");

  // Publish the gsdHealth capability (DEGR-01/D-01). Auto-tracked revertible
  // effect: retiring the health plugin withdraws gsdHealth.
  ctx.provide("gsdHealth", buildCapability("gsdHealth"));

  ctx.tools.register(defineTool({
    name: "gsd_health",
    description: "Health check (opengsd /gsd-health): inspect .planning/ integrity and offer non-destructive repair. Deterministic pure-JS scan (no subagent) covering phase/plan numbering, orphan SUMMARYs, plans-without-SUMMARY, config.json validation, STATE/ROADMAP disagreement, and phase-dir naming. Dry-run by default; repair:true applies config-only non-destructive fixes. Writes <NN>-HEALTH.md. Out-of-band — does not mutate STATE.md loop position.",
    parameters: {
      phase: { type: "number", required: true },
      repair: { type: "boolean" },
    },
    output: { schema: { type: "string" }, render: (_a, v) => [{ type: "text", text: v }] },
    async execute(args, exec) {
      // Fail-fast environmental guards (D-09), mirroring gap-analysis.
      const cwd = cwdOf(exec);
      const s = gsd();
      if (!s) throw new Error("gsd_health: gsdState service unavailable");
      if (!(await s.isProject(cwd))) throw new Error("gsd_health: no .planning/ project — run gsd_init first");
      const roadmap = await s.readRoadmap(cwd);
      const phase = (roadmap?.phases || []).find((p) => p.n === args.phase);
      if (!phase) throw new Error(`gsd_health: phase ${args.phase} not in ROADMAP.md`);

      // D-01: acquire the per-phase feature branch before any artefact write.
      const branchInfo = await ensurePhaseBranch(cwd, args.phase);

      // ── whole-project scan (D-04) ─────────────────────────────────────────
      // List the phase dirs under .planning/phases and each dir's files. A
      // missing phases dir degrades to empty (no naming/numbering/orphan issues).
      const phasesDir = `${s.planningRoot(cwd)}/phases`;
      const phasesTarget = await ctx.fs.resolve(phasesDir);
      const phasesStat = await ctx.fs.stat(phasesTarget);
      const dirNames = [];
      const phaseFiles = {};
      if (phasesStat) {
        const entries = await ctx.fs.listDir(phasesTarget);
        for (const e of entries) {
          if (e.type !== "directory") continue;
          dirNames.push(e.name);
          const dirTarget = await ctx.fs.resolve(`${phasesDir}/${e.name}`);
          const dirEntries = await ctx.fs.listDir(dirTarget);
          phaseFiles[e.name] = dirEntries.filter((x) => x.type === "file").map((x) => x.name);
        }
      }

      const defaultCfg = s.defaultConfig();
      const stateFm = (await s.readState(cwd))?.frontmatter;
      const roadmapPhases = roadmap?.phases || [];

      // The whole-project scan (D-04). Extracted so the --repair path can
      // re-run it WITHOUT repair after applying config fixes (D-08).
      const buildIssues = (rawCfg) => [
        ...checkPhaseDirNaming(dirNames),
        ...checkNumbering(dirNames),
        ...checkOrphanSummaries(phaseFiles),
        ...checkPlansWithoutSummary(phaseFiles),
        ...checkDiscussionLogWithoutContext(phaseFiles),
        ...checkConfig(rawCfg, defaultCfg),
        ...checkStateRoadmap(stateFm, roadmapPhases),
      ];

      let rawConfig = await s.readConfigRaw(cwd);
      let issues = buildIssues(rawConfig);

      // ── repair (D-07/D-08) ────────────────────────────────────────────────
      // Dry-run by default (repair omitted/false): no writes, repairs_performed
      // stays []. repair:true applies config-only non-destructive fixes via
      // repairConfig, writes the repaired config through ctx.fs (DUR-06, never
      // raw node:fs/promises), reports each fix in repairs_performed[], then
      // re-runs the scan WITHOUT repair to confirm resolution (D-08).
      const repairsPerformed = [];
      if (args.repair === true) {
        const { config, repairs } = repairConfig(rawConfig, defaultCfg);
        if (config) {
          await ctx.fs.writeText(
            { targetKey: `${cwd}/.planning/config.json`, displayPath: `${cwd}/.planning/config.json` },
            JSON.stringify(config, null, 2) + "\n",
          );
          repairsPerformed.push(...repairs.map((r) => r.message));
          // D-08: re-run the scan without repair to confirm the issues are resolved.
          rawConfig = await s.readConfigRaw(cwd);
          issues = buildIssues(rawConfig);
        }
      }

      const repairableCount = issues.filter((i) => i.repairable).length;
      const status = classifyIssue(issues);
      const errors = issues.filter((i) => i.severity === "error");
      const warnings = issues.filter((i) => i.severity === "warning");
      const info = issues.filter((i) => i.severity === "info");

      // ── report + artefact (D-05) ─────────────────────────────────────────
      const fm = {
        status,
        errors: errors.map((i) => i.code),
        warnings: warnings.map((i) => i.code),
        info: info.map((i) => i.code),
        repairable_count: repairableCount,
        phase: String(args.phase),
        generated: nowIso(),
      };
      if (args.repair === true) fm.repairs_performed = repairsPerformed;

      const bodyLines = [];
      bodyLines.push(`# Phase ${args.phase}: ${phase.name} - Health`, "");
      bodyLines.push(`**Status:** ${status}`);
      bodyLines.push(`**Repairable:** ${repairableCount}`, "");
      bodyLines.push("## Errors", "");
      if (errors.length) {
        for (const i of errors) bodyLines.push(`- **${i.code}:** ${i.message} — fix: ${i.fix}`);
      } else {
        bodyLines.push("_None._");
      }
      bodyLines.push("", "## Warnings", "");
      if (warnings.length) {
        for (const i of warnings) {
          bodyLines.push(`- **${i.code}:** ${i.message} — fix: ${i.fix}${i.repairable ? " (repairable)" : ""}`);
        }
      } else {
        bodyLines.push("_None._");
      }
      bodyLines.push("", "## Info", "");
      if (info.length) {
        for (const i of info) bodyLines.push(`- **${i.code}:** ${i.message}`);
      } else {
        bodyLines.push("_None._");
      }
      if (args.repair === true) {
        bodyLines.push("", "## Repairs performed", "");
        if (repairsPerformed.length) {
          for (const r of repairsPerformed) bodyLines.push(`- ${r}`);
        } else {
          bodyLines.push("_None._");
        }
      }
      bodyLines.push("", "---", "", `*Phase: ${String(args.phase).padStart(2, "0")}-${phase.name}*`, `*Health generated: ${today()}*`);
      const body = bodyLines.join("\n");
      const full = stringifyFrontmatter(fm) + "\n" + body;

      const ctxPath = await s.writeArtifact(cwd, args.phase, "HEALTH", full);

      // D-01/OQ-2: advance STATE via addDecision ONLY — never setActivePhase
      // (health is out-of-band; setActivePhase would corrupt the loop, R-1).
      await s.addDecision(cwd, `Phase ${args.phase}: HEALTH.md written (status ${status}, ${repairableCount} repairable)`);

      // Best-effort commit of the just-written artefacts (CQ-07/MW-03).
      const commit = await commitArtifacts(cwd, args.phase, { scope: "health", phaseName: phase.name });
      let commitNote = ` Artefacts committed: ${commit.committed} (${commit.staged.length} file(s)).`;
      if (commit.warning) commitNote += ` WARNING: ${commit.warning}.`;

      const summary = `Health check complete for phase ${args.phase} (${phase.name}). Status: ${status}. ${repairableCount} repairable issue(s).${args.repair === true ? ` Repairs performed: ${repairsPerformed.length}.` : ""} Wrote ${ctxPath}.${commitNote} Branch: ${branchInfo.action} (${branchInfo.branch}).`;
      return summary;
    },
    presentCall: (a) => ({
      card: "generic",
      title: `Health check phase ${a.phase}`,
      kind: "other",
      rawInput: { phase: a.phase, repair: a.repair },
    }),
  }));
}

export { name, inject, apply };

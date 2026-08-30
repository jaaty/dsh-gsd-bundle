// @dsh-gsd/bundle/ui-review — the UI-review loop-step tool (opengsd
// /gsd-ui-review). A full loop-step plugin mirroring lib/code-review.js
// (fresh-context structured-output subagent) + lib/gap-analysis.js (soft gate,
// never blocks):
//
// - publishes the gsdUiReview capability (order 36, between code-review 35 and
//   verify 40)
// - registers the /gsd-ui-review command's tool (gsd_ui_review)
// - dynamically discovers frontend files in the active project's working tree
//   (src/**/*.{tsx,jsx,vue,svelte,css,scss,html} etc.) and audits whatever UI
//   the user's project actually has (D-03)
// - spawns a fresh-context gsd-ui-auditor subagent whose structured output is
//   validated against the 6-pillar scoring contract (Copywriting, Visuals,
//   Color, Typography, Spacing, Experience Design — each 1-4, overall /24) and
//   written into <NN>-UI-REVIEW.md with frontmatter + per-pillar findings
// - soft-skips with a clear message when workflow.ui_review is false (no
//   artefact) or when no frontend files are found (D-03/D-09)
// - degrades to an UNAVAILABLE UI-REVIEW.md on subagent fault (never throws
//   after env validation, D-10)
// - runs a screenshot gitignore gate (.planning/ui-reviews/.gitignore) before
//   any capture; the subagent does dev-server detection + Playwright capture
//   (code-only fallback when no dev server, D-07)
// - advances STATE to the 'ui-review' step (next_action verify-phase) and
//   commits via the shared git seam
//
// The re-audit/view dispatch and the edge-case tests land in Plan 02; this plan
// delivers the audit-only tracer slice touching every layer. Pure helpers are
// exported for direct unit testing (D-12).

import { defineTool } from "@deepseek-ai/dsh-tools";
import { nowIso, today, stringifyFrontmatter, zeroPad } from "./_shared.js";
import { cwdOf, spawnSubagent } from "./_runner.js";
import { ensurePhaseBranch, commitArtifacts } from "./_git-artifacts.js";
import { buildCapability } from "./_capabilities.js";
import { UI_AUDITOR_PROMPT } from "./_agents.js";

const name = "gsd-ui-review";
// DEGR-07 (D-01/D-03): 'subagents' is a hard required coeffect — the tool spawns
// the gsd-ui-auditor subagent, so the fiber stays inactive when the host
// subagents service is absent. gsdState + tools mirror the other loop steps.
const inject = ["gsdState", "tools", "subagents"];

// The six pillar names, in the canonical scoring order (D-06).
export const PILLAR_NAMES = Object.freeze([
  "Copywriting",
  "Visuals",
  "Color",
  "Typography",
  "Spacing",
  "Experience Design",
]);

const SEVERITIES = ["BLOCKER", "WARNING"];

// The structured-output contract for the gsd-ui-auditor subagent (D-05),
// mirroring CODE_REVIEWER_SCHEMA's restricted object-rooted subset
// (type/properties/required/items/enum — no pattern/format/numeric bounds).
// Pillars without a valid name/score or findings without a valid severity enum
// are rejected by resolvePillars.
export const UI_AUDITOR_SCHEMA = Object.freeze({
  type: "object",
  properties: {
    pillars: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string", enum: PILLAR_NAMES },
          score: { type: "number" },
          key_finding: { type: "string" },
          findings: {
            type: "array",
            items: {
              type: "object",
              properties: {
                severity: { type: "string", enum: SEVERITIES },
                file: { type: "string" },
                lines: { type: "string" },
                title: { type: "string" },
                evidence: { type: "string" },
              },
              required: ["severity", "file", "lines", "title", "evidence"],
              additionalProperties: false,
            },
          },
        },
        required: ["name", "score", "key_finding", "findings"],
        additionalProperties: false,
      },
    },
    top_fixes: {
      type: "array",
      items: {
        type: "object",
        properties: {
          issue: { type: "string" },
          impact: { type: "string" },
          fix: { type: "string" },
        },
        required: ["issue", "impact", "fix"],
        additionalProperties: false,
      },
    },
    screenshots: { type: "string", enum: ["captured", "not captured (no dev server)"] },
    registry_safety: { type: "string" },
    files_audited: { type: "array", items: { type: "string" } },
  },
  required: ["pillars", "top_fixes", "screenshots"],
  additionalProperties: false,
});

// Validate the auditor subagent's structured output into a pillars array.
// Returns null when the output is missing/malformed (not an object, pillars not
// an array of exactly 6, any pillar with an invalid name/score/key_finding, or
// any finding with an invalid severity enum) — the caller treats that as an
// UNAVAILABLE audit (D-05/D-06).
export function resolvePillars(structured) {
  if (!structured || typeof structured !== "object") return null;
  if (!Array.isArray(structured.pillars)) return null;
  if (structured.pillars.length !== PILLAR_NAMES.length) return null;
  for (const p of structured.pillars) {
    if (!p || typeof p !== "object") return null;
    if (!PILLAR_NAMES.includes(p.name)) return null;
    if (!Number.isInteger(p.score) || p.score < 1 || p.score > 4) return null;
    if (typeof p.key_finding !== "string" || p.key_finding.trim() === "") return null;
    if (!Array.isArray(p.findings)) return null;
    for (const f of p.findings) {
      if (!f || typeof f !== "object") return null;
      if (!SEVERITIES.includes(f.severity)) return null;
    }
  }
  return structured.pillars;
}

// The overall /24 total: the sum of the 6 pillar scores (D-06).
export function computeOverall(pillars) {
  return (pillars || []).reduce((acc, p) => acc + (p.score || 0), 0);
}

// Count findings across all pillars. Returns { blocker, warning, total }.
export function countFindings(pillars) {
  const counts = { blocker: 0, warning: 0, total: 0 };
  for (const p of pillars || []) {
    for (const f of p.findings || []) {
      counts.total++;
      if (f.severity === "BLOCKER") counts.blocker++;
      else if (f.severity === "WARNING") counts.warning++;
    }
  }
  return counts;
}

// The default frontend-file glob set for dynamic discovery (D-03). Matches the
// common frontend source locations; the recursive walk applies these to
// repo-relative paths.
export const FRONTEND_GLOBS = Object.freeze([
  "src/**/*.{tsx,jsx,vue,svelte,css,scss,html}",
  "app/**/*.{tsx,jsx,vue,svelte,css,scss,html}",
  "components/**/*.{tsx,jsx,vue,svelte}",
  "pages/**/*.{tsx,jsx,vue,svelte}",
  "views/**/*.{tsx,jsx,vue,svelte}",
  "*.html",
]);

// Convert a glob to a RegExp handling ** (any depth), * (single segment),
// {a,b} (alternation), and ? (single char), escaping other regex
// metacharacters. Anchored ^...$. `**/` matches zero or more path segments (so
// `src/**/*.tsx` matches `src/App.tsx`), while a bare `**` matches any depth.
// Pure helper exported for unit testing.
export function globToRegExp(glob) {
  const s = String(glob);
  let out = "^";
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === "*") {
      if (s[i + 1] === "*") {
        if (s[i + 2] === "/") { out += "(?:.*/)?"; i += 2; }
        else { out += ".*"; i += 1; }
      } else {
        out += "[^/]*";
      }
    } else if (ch === "?") {
      out += "[^/]";
    } else if (ch === "{") {
      const end = s.indexOf("}", i);
      if (end === -1) { out += "\\{"; }
      else {
        const alts = s.slice(i + 1, end).split(",").map((a) => a.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
        out += `(?:${alts.join("|")})`;
        i = end;
      }
    } else if ("\\.+^$()|[]".includes(ch)) {
      out += "\\" + ch;
    } else {
      out += ch;
    }
  }
  out += "$";
  return new RegExp(out);
}

// True when a repo-relative path matches any of the given globs. Pure helper.
export function matchesAnyGlob(relPath, globs) {
  const p = String(relPath || "");
  return (globs || []).some((g) => globToRegExp(g).test(p));
}

// Directories skipped during the frontend-file discovery walk (R-4: ctx.fs has
// no glob, so discovery is a bounded recursive listDir walk).
const SKIP_DIRS = new Set(["node_modules", ".git", ".planning"]);

// Discover frontend files in the active project's working tree (D-03). A
// bounded recursive listDir walk from cwd, skipping node_modules/.git/.planning,
// collecting repo-relative paths that match any FRONTEND_GLOBS. Returns a sorted
// array. Pure-ish helper exported for unit testing.
export async function discoverFrontendFiles(ctx, cwd) {
  const found = [];
  async function walk(dir, rel) {
    const target = await ctx.fs.resolve(dir);
    const stat = await ctx.fs.stat(target);
    if (!stat) return;
    const entries = await ctx.fs.listDir(target);
    for (const e of entries) {
      if (e.type === "directory") {
        if (SKIP_DIRS.has(e.name)) continue;
        await walk(`${dir}/${e.name}`, rel ? `${rel}/${e.name}` : e.name);
      } else if (e.type === "file") {
        const relPath = rel ? `${rel}/${e.name}` : e.name;
        if (matchesAnyGlob(relPath, FRONTEND_GLOBS)) found.push(relPath);
      }
    }
  }
  await walk(cwd, "");
  return found.sort();
}

// The screenshot gitignore gate (D-07): ensure .planning/ui-reviews/.gitignore
// exists with binary-extension patterns, so captured screenshots are never
// committed. Runs unconditionally before any capture. Returns the path.
export async function ensureScreenshotGitignore(ctx, cwd) {
  const rel = `${cwd}/.planning/ui-reviews/.gitignore`;
  const target = await ctx.fs.resolve(rel);
  const stat = await ctx.fs.stat(target);
  if (!stat) {
    const content = ["*.png", "*.jpg", "*.jpeg", "*.webp", "*.gif", ""].join("\n");
    await ctx.fs.writeText(target, content);
  }
  return rel;
}

// Assemble the UI-REVIEW.md body from the resolved pillars (or the UNAVAILABLE
// report). Per-pillar sections with per-finding rows + top-3 fixes.
function buildUiReviewBody(phase, pillars, topFixes, screenshots, registrySafety, baseline, iso, dateTs, status, errorCause) {
  const lines = [];
  lines.push(`# Phase ${phase.n}: ${phase.name} - UI Review Report`, "");
  lines.push(`**Reviewed:** ${iso}`);
  lines.push(`**Baseline:** ${baseline}`);
  lines.push(`**Screenshots:** ${screenshots}`);
  lines.push(`**Overall:** ${status === "UNAVAILABLE" ? "0/24" : `${computeOverall(pillars)}/24`}`);
  lines.push(`**Status:** ${status}`, "");

  if (status === "UNAVAILABLE") {
    lines.push("## Auditor Report", "");
    lines.push("**Status:** UNAVAILABLE", "");
    lines.push(`_The gsd-ui-auditor subagent could not complete the audit. Cause: ${errorCause || "unknown"}._`, "");
    lines.push("---", "", `*Phase: ${String(phase.n).padStart(2, "0")}-${phase.name}*`, `*UI review: ${dateTs}*`);
    return lines.join("\n");
  }

  const counts = countFindings(pillars);
  lines.push("## Summary", "");
  lines.push(`- Overall score: ${computeOverall(pillars)}/24`);
  lines.push(`- BLOCKER findings: ${counts.blocker}`);
  lines.push(`- WARNING findings: ${counts.warning}`, "");

  for (const p of pillars) {
    lines.push(`## ${p.name} (score ${p.score}/4)`, "");
    lines.push(`**Key finding:** ${p.key_finding}`, "");
    for (const f of p.findings) {
      lines.push(`- **[${f.severity}]** ${f.title} — ${f.file}${f.lines ? `:${f.lines}` : ""}`);
      lines.push(`  - Evidence: ${f.evidence || "(none)"}`);
    }
    lines.push("");
  }

  lines.push("## Top 3 Priority Fixes", "");
  (topFixes || []).forEach((tf, i) => {
    lines.push(`### ${i + 1}. ${tf.issue}`, "");
    lines.push(`- **User impact:** ${tf.impact}`);
    lines.push(`- **Fix:** ${tf.fix}`, "");
  });

  if (registrySafety) {
    lines.push("## Registry Safety", "", registrySafety, "");
  }

  lines.push("---", "", `*Phase: ${String(phase.n).padStart(2, "0")}-${phase.name}*`, `*UI review: ${dateTs}*`);
  return lines.join("\n");
}

function apply(ctx) {
  const gsd = () => ctx.get("gsdState");

  // Publish this loop step's capability (DEGR-01/D-02). Auto-tracked
  // revertible effect: retiring the ui-review plugin withdraws gsdUiReview.
  ctx.provide("gsdUiReview", buildCapability("gsdUiReview"));

  ctx.tools.register(defineTool({
    name: "gsd_ui_review",
    description: "UI review (opengsd /gsd-ui-review): retroactive 6-pillar UI audit of a phase's implemented frontend code against the UI-SPEC (or abstract 6-pillar standards). A fresh-context gsd-ui-auditor subagent scores 6 pillars 1-4 each (overall /24), classifies findings BLOCKER/WARNING, and writes UI-REVIEW.md. Soft gate — advisory, never blocks verify or ship. Run after execute, before verify.",
    parameters: {
      phase: { type: "number" },
      mode: { type: "string", enum: ["re-audit", "view"] },
    },
    output: { schema: { type: "string" }, render: (_a, v) => [{ type: "text", text: v }] },
    async execute(args, exec) {
      // Fail-fast environmental guards (D-10), mirroring code-review.js.
      const cwd = cwdOf(exec);
      const s = gsd();
      if (!s) throw new Error("gsd_ui_review: gsdState service unavailable");
      if (!(await s.isProject(cwd))) throw new Error("gsd_ui_review: no .planning/ project — run gsd_init first");
      const roadmap = await s.readRoadmap(cwd);

      // Resolve the phase: explicit arg, else the last completed phase (D-02).
      let phase;
      if (args.phase !== undefined) {
        phase = (roadmap?.phases || []).find((p) => p.n === args.phase);
        if (!phase) throw new Error(`gsd_ui_review: phase ${args.phase} not in ROADMAP.md`);
      } else {
        const completed = (roadmap?.phases || []).filter((p) => p.status === "Complete");
        if (completed.length === 0) throw new Error("gsd_ui_review: no completed phase found — pass a phase number");
        phase = completed[completed.length - 1];
      }
      const phaseNum = phase.n;

      // Re-audit/view dispatch (D-02, surfaced via the mode parameter — the
      // bundle's pattern for human decisions without AskUserQuestion). Runs
      // before the config soft-gate so an existing report can always be viewed
      // even when the capability is soft-disabled.
      const hasExisting = await s.hasArtifact(cwd, phaseNum, "UI-REVIEW");
      if (hasExisting && args.mode === "view") {
        const existing = await s.readArtifact(cwd, phaseNum, "UI-REVIEW");
        return `UI review for phase ${phaseNum} (${phase.name}):\n\n${existing}`;
      }
      if (hasExisting && args.mode === undefined) {
        return `UI-REVIEW.md already exists for phase ${phaseNum}. ask the user whether to re-audit (mode: "re-audit") or view the existing report (mode: "view"), then re-call gsd_ui_review with the chosen mode.`;
      }
      // mode === "re-audit" (or no existing artefact) proceeds to the audit path.

      // Config soft-gate (D-09): soft-skip when workflow.ui_review is explicitly
      // false. Default true; write NO artefact, never throw.
      const cfg = await s.readConfig(cwd);
      if (cfg.workflow?.ui_review === false) {
        return "UI review skipped (ui-review capability inactive) — workflow.ui_review is false. No UI-REVIEW.md written.";
      }

      // D-13: acquire the per-phase feature branch before any artefact write.
      const branchInfo = await ensurePhaseBranch(cwd, phaseNum);

      // Dynamic frontend-file discovery (D-03). Empty scope soft-skips with no
      // UI-REVIEW.md.
      const frontendFiles = await discoverFrontendFiles(ctx, cwd);
      if (frontendFiles.length === 0) {
        return "no frontend files found to audit — skipping UI review (no UI-REVIEW.md written).";
      }

      // Baseline (D-04): the phase's UI-SPEC.md design contract when present,
      // else abstract 6-pillar standards. Consumes SUMMARY.md for context.
      const uiSpec = await s.readArtifact(cwd, phaseNum, "UI-SPEC");
      const baseline = uiSpec ? "UI-SPEC.md design contract" : "abstract 6-pillar standards";
      await s.readArtifact(cwd, phaseNum, "SUMMARY-01");

      // Screenshot gitignore gate (D-07) — runs unconditionally before capture.
      await ensureScreenshotGitignore(ctx, cwd);

      // Spawn the auditor subagent (D-05), degrading on fault (D-10).
      const promptText = [
        UI_AUDITOR_PROMPT, "",
        "<phase_context>",
        `Phase: ${phaseNum} - ${phase.name}`,
        `Phase goal: ${phase.goal}`,
        `Baseline: ${baseline}`,
        `Frontend files to audit: ${frontendFiles.join(", ")}`,
        uiSpec ? `\n<ui_spec>\n${uiSpec}\n</ui_spec>` : "",
        "</phase_context>",
      ].join("\n");

      let structured;
      let errorCause = null;
      try {
        const r = await spawnSubagent(ctx, exec, { label: "gsd-ui-auditor", promptText, outputSchema: UI_AUDITOR_SCHEMA });
        structured = r.structured;
      } catch (e) {
        errorCause = (e && e.message) || String(e);
      }

      const pillars = resolvePillars(structured);
      const iso = nowIso();
      const dateTs = today();
      const screenshots = structured?.screenshots || "not captured (no dev server)";
      const registrySafety = structured?.registry_safety;

      let status;
      let overall;
      let counts;
      if (pillars) {
        status = "complete";
        overall = computeOverall(pillars);
        counts = countFindings(pillars);
      } else {
        // UNAVAILABLE degrade (D-10): write an UNAVAILABLE UI-REVIEW.md
        // reporting the real cause, never throw after env validation.
        status = "UNAVAILABLE";
        overall = 0;
        counts = { blocker: 0, warning: 0, total: 0 };
        errorCause = errorCause || "auditor returned malformed structured output (pillars missing or invalid)";
      }

      const fm = {
        phase: String(phaseNum),
        reviewed: iso,
        baseline,
        overall,
        screenshots,
        status,
        pillars: pillars ? pillars.map((p) => `${p.name}:${p.score}`) : [],
        blockers: counts.blocker,
        warnings: counts.warning,
      };

      const body = buildUiReviewBody(
        phase, pillars || [], structured?.top_fixes || [], screenshots, registrySafety,
        baseline, iso, dateTs, status, errorCause,
      );
      const full = stringifyFrontmatter(fm) + "\n" + body;

      // Write UI-REVIEW.md (routed through ctx.fs, CQ-01).
      const ctxPath = await s.writeArtifact(cwd, phaseNum, "UI-REVIEW", full);

      // D-09: advance STATE to the 'ui-review' step (next_action verify-phase).
      await s.setActivePhase(cwd, phaseNum, "ui-review");
      const findingsStr = status === "UNAVAILABLE"
        ? "UNAVAILABLE"
        : `${overall}/24 (${counts.blocker}B/${counts.warning}W)`;
      await s.addDecision(cwd, `Phase ${phaseNum}: UI-REVIEW.md written (status ${status}, overall ${findingsStr})`);

      // Best-effort commit of the just-written artefacts (CQ-07/MW-03).
      const commit = await commitArtifacts(cwd, phaseNum, { scope: "ui-review", phaseName: phase.name });

      let commitNote = ` Artefacts committed: ${commit.committed} (${commit.staged.length} file(s)).`;
      if (commit.warning) commitNote += ` WARNING: ${commit.warning}.`;
      let branchNote = ` Branch: ${branchInfo.action} (${branchInfo.branch}).`;

      return `UI review complete for phase ${phaseNum} (${phase.name}). Wrote ${ctxPath}. Status: ${status}, overall: ${findingsStr}, screenshots: ${screenshots}.${commitNote}${branchNote} STATE advanced to 'ui-review'. Next: gsd_verify on phase ${phaseNum}.`;
    },
    presentCall: (a) => ({ card: "generic", title: `UI review phase ${a.phase}`, kind: "other", rawInput: { phase: a.phase } }),
  }));
}

export { name, inject, apply };

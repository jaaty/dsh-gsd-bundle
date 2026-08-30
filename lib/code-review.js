// @dsh-gsd/bundle/code-review — the Code-review loop-step tool (opengsd
// /gsd-code-review). A full loop-step plugin mirroring lib/spec.js (fresh-context
// structured-output subagent) + lib/gap-analysis.js (soft gate, never blocks):
//
// - publishes the gsdCodeReview capability (order 35, between execute and verify)
// - registers the /gsd-code-review command's tool (gsd_code_review)
// - spawns a fresh-context gsd-code-reviewer subagent whose structured findings
//   are validated against a severity enum (BLOCKER/WARNING/INFO) and written into
//   <NN>-REVIEW.md with frontmatter + per-finding rows
// - soft-skips with a clear message when workflow.code_review is false (no artefact)
// - degrades to an UNAVAILABLE REVIEW.md on subagent fault (never throws after env
//   validation)
// - advances STATE to the 'review' step (next_action verify-phase) and commits via
//   the shared git seam
//
// The --fix/--auto/--files/scoping expansion is Plan 02; this plan delivers the
// review-only tracer slice touching every layer. Pure helpers are exported for
// direct unit testing (D-14).

import { defineTool } from "@deepseek-ai/dsh-tools";
import { nowIso, today, stringifyFrontmatter, parseFrontmatter, zeroPad } from "./_shared.js";
import { cwdOf, spawnSubagent } from "./_runner.js";
import { ensurePhaseBranch, commitArtifacts, commitSourceFiles, defaultGitFn } from "./_git-artifacts.js";
import { buildCapability } from "./_capabilities.js";
import { CODE_REVIEWER_PROMPT, CODE_FIXER_PROMPT } from "./_agents.js";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileP = promisify(execFile);

// Local best-effort git runner for the git-diff scoping tier. Mirrors
// _git-artifacts.js's defaultGitFn; kept local so Task 1 stays scoped to its
// own files (Task 2 exports commitSourceFiles from _git-artifacts.js). Never
// throws — git-diff extraction is best-effort (returns [] on any failure).
async function localGitFn(cwd, args) {
  return (await execFileP("git", args, { cwd, encoding: "utf8" })).stdout.trim();
}

const name = "gsd-code-review";
// DEGR-07 (D-01/D-03): 'subagents' is a hard required coeffect — the tool spawns
// the gsd-code-reviewer subagent, so the fiber stays inactive when the host
// subagents service is absent. gsdState + tools mirror the other loop steps.
const inject = ["gsdState", "tools", "subagents"];

// The structured-output contract for the gsd-code-reviewer subagent (D-05),
// mirroring SPEC_SCORER_SCHEMA's restricted object-rooted subset
// (type/properties/required/items/enum — no pattern/format/numeric bounds).
// Findings without a valid severity enum value are rejected by resolveFindings.
export const CODE_REVIEWER_SCHEMA = Object.freeze({
  type: "object",
  properties: {
    findings: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          severity: { type: "string", enum: ["BLOCKER", "WARNING", "INFO"] },
          file: { type: "string" },
          lines: { type: "string" },
          title: { type: "string" },
          evidence: { type: "string" },
          suggestion: { type: "string" },
        },
        required: ["id", "severity", "file", "lines", "title", "evidence"],
        additionalProperties: false,
      },
    },
  },
  required: ["findings"],
  additionalProperties: false,
});

const SEVERITIES = ["BLOCKER", "WARNING", "INFO"];

// Validate the reviewer subagent's structured output into a findings array.
// Returns null when the output is missing/malformed (not an object, findings not
// an array, or any finding lacks a valid severity enum) — the caller treats that
// as an UNAVAILABLE review (D-05: findings without a valid severity are rejected).
export function resolveFindings(structured) {
  if (!structured || typeof structured !== "object") return null;
  if (!Array.isArray(structured.findings)) return null;
  for (const f of structured.findings) {
    if (!f || typeof f !== "object") return null;
    if (!SEVERITIES.includes(f.severity)) return null;
  }
  return structured.findings;
}

// Count findings by severity. Returns { blocker, warning, info, total }.
export function severityCounts(findings) {
  const counts = { blocker: 0, warning: 0, info: 0, total: 0 };
  for (const f of findings || []) {
    counts.total++;
    if (f.severity === "BLOCKER") counts.blocker++;
    else if (f.severity === "WARNING") counts.warning++;
    else if (f.severity === "INFO") counts.info++;
  }
  return counts;
}

// Resolve the --fix flag implication (D-04): --all and --auto each imply --fix.
// Pure helper exported for unit testing.
export function resolveFixFlags({ fix, all, auto } = {}) {
  return { fix: !!(fix || all || auto), all: !!all, auto: !!auto };
}

// Filter findings by severity for the fix scope (D-05). Default scope =
// BLOCKER + WARNING; includeInfo=true (the --all flag) adds INFO.
export function filterBySeverity(findings, includeInfo) {
  return (findings || []).filter(
    (f) => f.severity === "BLOCKER" || f.severity === "WARNING" || (includeInfo && f.severity === "INFO"),
  );
}

// D-06 early-stop heuristic: returns true when any finding has severity BLOCKER
// or WARNING; false when INFO-only or empty.
export function hasBlockingFindings(findings) {
  return (findings || []).some((f) => f.severity === "BLOCKER" || f.severity === "WARNING");
}

// The structured-output contract for the gsd-code-fixer subagent (D-12).
// The subagent returns the fix as structured output; the TOOL writes it to disk
// and commits. Restricted object-rooted subset (no pattern/format/numeric bounds).
export const CODE_FIXER_SCHEMA = Object.freeze({
  type: "object",
  properties: {
    id: { type: "string" },
    status: { type: "string", enum: ["fixed", "skipped"] },
    file: { type: "string" },
    content: { type: "string" },
    skip_reason: { type: "string" },
  },
  required: ["id", "status", "file"],
  additionalProperties: false,
});

// Validate --files paths against path-traversal / absolute / shell-metachar
// attacks (D-08). Returns { valid: [], skipped: [] }. Paths containing ".."
// segments, starting with "/", or matching shell metacharacters (; ` $ & | < >)
// are rejected and collected in `skipped`. Mirrors the upstream validation at
// .analysis/gsd-core/gsd-core/workflows/code-review.md:113-119 and
// lib/_agents.js:295.
export function validateFiles(files, _cwd) {
  const valid = [];
  const skipped = [];
  const shellMeta = /[;`$&|<>]/;
  for (const raw of files || []) {
    const p = String(raw).trim();
    if (!p) continue;
    if (p.startsWith("/")) { skipped.push(p); continue; }
    if (p.split("/").includes("..")) { skipped.push(p); continue; }
    if (shellMeta.test(p)) { skipped.push(p); continue; }
    valid.push(p);
  }
  return { valid, skipped };
}

// Pure path-string filter (D-08): drops .planning/, root-level artefacts
// (ROADMAP.md, STATE.md), per-phase artefacts (*-SUMMARY.md, *-PLAN.md,
// *-VERIFICATION.md), and lockfiles. No fs access — the existence check is the
// tool's job via ctx.fs.stat. Exported for direct unit testing.
export function filterSourcePaths(paths) {
  const out = [];
  for (const raw of paths || []) {
    const p = String(raw).trim();
    if (!p) continue;
    if (p.startsWith(".planning/")) continue;
    if (p === "ROADMAP.md" || p === "STATE.md") continue;
    if (/-SUMMARY\.md$/.test(p)) continue;
    if (/-VERIFICATION\.md$/.test(p)) continue;
    if (/-PLAN\.md$/.test(p)) continue;
    if (/package-lock\.json$/.test(p)) continue;
    if (/\/yarn\.lock$/.test(p) || p === "yarn.lock") continue;
    if (/\/pnpm-lock\.yaml$/.test(p) || p === "pnpm-lock.yaml") continue;
    out.push(p);
  }
  return out;
}

// 3-tier precedence resolver (D-08). Returns { tier, files }. filesOverride
// (highest) > summaryFiles > gitDiffFiles > empty. Pure helper exported for
// direct unit testing.
export function computeScope({ filesOverride, summaryFiles, gitDiffFiles } = {}) {
  if (Array.isArray(filesOverride) && filesOverride.length) {
    return { tier: "files", files: filesOverride };
  }
  if (Array.isArray(summaryFiles) && summaryFiles.length) {
    return { tier: "summary", files: summaryFiles };
  }
  if (Array.isArray(gitDiffFiles) && gitDiffFiles.length) {
    return { tier: "git", files: gitDiffFiles };
  }
  return { tier: "none", files: [] };
}

// Extract changed source files from the phase's *-SUMMARY.md artefacts (D-08
// Tier 2). Scans the phase directory directly for *-SUMMARY.md files (matching
// the upstream `ls ${PHASE_DIR}/*-SUMMARY.md` approach), parses frontmatter,
// and flattens key-files.created + key-files.modified. Mirrors lib/ship.js:214.
async function extractSummaryFiles(s, cwd, phase) {
  const dir = await s.phaseDir(cwd, phase);
  const dirTarget = await s.ctx.fs.resolve(dir);
  const dirStat = await s.ctx.fs.stat(dirTarget);
  if (!dirStat) return [];
  const entries = await s.ctx.fs.listDir(dirTarget);
  const files = [];
  for (const e of entries) {
    if (!/-SUMMARY\.md$/.test(e.name)) continue;
    const text = await s.ctx.fs.readText(await s.ctx.fs.resolve(`${dir}/${e.name}`));
    if (!text) continue;
    const { frontmatter } = parseFrontmatter(text);
    const kf = frontmatter["key-files"] || frontmatter.key_files || {};
    if (Array.isArray(kf.created)) files.push(...kf.created);
    if (Array.isArray(kf.modified)) files.push(...kf.modified);
  }
  return [...new Set(files.map((f) => String(f).trim()).filter(Boolean))];
}

// Extract changed source files from git diff (D-08 Tier 3). Best-effort —
// returns [] on any git failure (no throw). Filters through filterSourcePaths.
async function extractGitDiffFiles(cwd, gitFn = localGitFn) {
  try {
    const out = await gitFn(cwd, ["diff", "--name-only", "HEAD~1..HEAD"]);
    const files = String(out).split("\n").map((f) => f.trim()).filter(Boolean);
    return filterSourcePaths(files);
  } catch {
    return [];
  }
}

// Assemble the REVIEW.md body from the resolved findings (or the UNAVAILABLE
// report). Per-severity sections with per-finding rows.
function buildReviewBody(phase, findings, depth, files, status, errorCause, iso, dateTs) {
  const lines = [];
  lines.push(`# Phase ${phase.n}: ${phase.name} - Code Review Report`, "");
  lines.push(`**Reviewed:** ${iso}`);
  lines.push(`**Depth:** ${depth}`);
  lines.push(`**Files reviewed:** ${files.length}`);
  lines.push(`**Status:** ${status}`, "");

  if (status === "UNAVAILABLE") {
    lines.push("## Reviewer Report", "");
    lines.push(`**Status:** UNAVAILABLE`, "");
    lines.push(`_The code-reviewer subagent could not complete the review. Cause: ${errorCause || "unknown"}._`, "");
    lines.push("---", "", `*Phase: ${String(phase.n).padStart(2, "0")}-${phase.name}*`, `*Code review: ${dateTs}*`);
    return lines.join("\n");
  }

  const counts = severityCounts(findings);
  lines.push("## Summary", "");
  lines.push(`- Total findings: ${counts.total}`);
  lines.push(`- BLOCKER: ${counts.blocker}`);
  lines.push(`- WARNING: ${counts.warning}`);
  lines.push(`- INFO: ${counts.info}`, "");

  const sections = [
    { key: "BLOCKER", heading: "## Blockers" },
    { key: "WARNING", heading: "## Warnings" },
    { key: "INFO", heading: "## Info" },
  ];
  for (const sec of sections) {
    const items = (findings || []).filter((f) => f.severity === sec.key);
    if (items.length === 0) continue;
    lines.push(sec.heading, "");
    for (const f of items) {
      lines.push(`### ${f.id}: ${f.title}`, "");
      lines.push(`- **File:** ${f.file}`);
      lines.push(`- **Lines:** ${f.lines}`);
      lines.push(`- **Severity:** ${f.severity}`);
      lines.push(`- **Evidence:** ${f.evidence || "(none)"}`);
      if (f.suggestion) lines.push(`- **Suggestion:** ${f.suggestion}`);
      lines.push("");
    }
  }

  if (counts.total === 0) {
    lines.push("No findings — the reviewed source is clean.", "");
  }

  lines.push("---", "", `*Phase: ${String(phase.n).padStart(2, "0")}-${phase.name}*`, `*Code review: ${dateTs}*`);
  return lines.join("\n");
}

function apply(ctx) {
  const gsd = () => ctx.get("gsdState");

  // Publish this loop step's capability (DEGR-01/D-02). Auto-tracked
  // revertible effect: retiring the code-review plugin withdraws gsdCodeReview.
  ctx.provide("gsdCodeReview", buildCapability("gsdCodeReview"));

  ctx.tools.register(defineTool({
    name: "gsd_code_review",
    description: "Code review (opengsd /gsd-code-review): review a phase's changed source files for bugs, security issues, and quality defects. A fresh-context reviewer subagent produces REVIEW.md with severity-classified findings (BLOCKER/WARNING/INFO). Optional --fix companion applies findings with per-fix atomic commits into REVIEW-FIX.md. Soft gate — advisory, never blocks verify or ship. Run after execute, before verify.",
    parameters: {
      phase: { type: "number", required: true },
      fix: { type: "boolean" },
      all: { type: "boolean" },
      auto: { type: "boolean" },
      depth: { type: "string", enum: ["quick", "standard", "deep"] },
      files: { type: "string" },
    },
    output: { schema: { type: "string" }, render: (_a, v) => [{ type: "text", text: v }] },
    async execute(args, exec) {
      // Fail-fast environmental guards (D-09), mirroring spec.js.
      const cwd = cwdOf(exec);
      const s = gsd();
      if (!s) throw new Error("gsd_code_review: gsdState service unavailable");
      if (!(await s.isProject(cwd))) throw new Error("gsd_code_review: no .planning/ project — run gsd_init first");
      const roadmap = await s.readRoadmap(cwd);
      const phase = (roadmap?.phases || []).find((p) => p.n === args.phase);
      if (!phase) throw new Error(`gsd_code_review: phase ${args.phase} not in ROADMAP.md`);

      // Config gate (D-07): soft-skip when workflow.code_review is explicitly
      // false. Default true; write NO artefact, never throw.
      const cfg = await s.readConfig(cwd);
      const crEnabled = cfg.workflow?.code_review !== false;
      if (!crEnabled) {
        return "Code review skipped (code-review capability inactive) — workflow.code_review is false. No REVIEW.md written.";
      }

      // D-13: acquire the per-phase feature branch before any artefact write,
      // the same seam every step tool uses.
      const branchInfo = await ensurePhaseBranch(cwd, args.phase);

      // Resolve depth (D-06/D-07): arg override > config default > "standard".
      const depth = args.depth || cfg.workflow?.code_review_depth || "standard";

      // File scoping (D-08): 3-tier precedence (--files > SUMMARY.md key-files
      // > git diff). When --files is provided, SUMMARY/git scoping is skipped
      // entirely. An empty filtered scope soft-skips with no REVIEW.md.
      let scopeFiles = [];
      let skippedFiles = [];
      if (typeof args.files === "string" && args.files.trim()) {
        // Tier 1: --files override (highest precedence). Path-traversal-
        // validated; invalid paths warned-and-skipped (D-08).
        const raw = args.files.split(",").map((f) => f.trim()).filter(Boolean);
        const { valid, skipped } = validateFiles(raw, cwd);
        scopeFiles = valid;
        skippedFiles = skipped;
      } else {
        // Tier 2: SUMMARY.md key-files extraction.
        const summaryFiles = await extractSummaryFiles(s, cwd, args.phase);
        if (summaryFiles.length) {
          scopeFiles = summaryFiles;
        } else {
          // Tier 3: git diff fallback (best-effort).
          scopeFiles = await extractGitDiffFiles(cwd);
        }
      }

      // Filter out non-existent paths via ctx.fs.stat (the backstop per D-08 /
      // upstream #2666). filterSourcePaths already dropped artefacts/lockfiles.
      const existingFiles = [];
      for (const p of scopeFiles) {
        const t = await ctx.fs.resolve(`${cwd}/${p}`);
        const st = await ctx.fs.stat(t);
        if (st) existingFiles.push(p);
      }
      let files = existingFiles;

      // Empty-scope soft-skip (D-08): no REVIEW.md written, clear message.
      if (files.length === 0) {
        const skipMsg = skippedFiles.length
          ? `no source files to review — all ${skippedFiles.length} --files path(s) were invalid or non-existent (skipped: ${skippedFiles.join(", ")}). No REVIEW.md written.`
          : "no source files to review — skipping review (no REVIEW.md written).";
        return skipMsg;
      }

      // Spawn the reviewer subagent (D-03), degrading on fault (D-09).
      // Extracted as a closure so --auto (Task 3) can re-spawn for re-reviews.
      const buildReviewerPrompt = (reviewFiles) => [
        CODE_REVIEWER_PROMPT,
        "",
        "<phase_context>",
        `Phase: ${phase.n} - ${phase.name}`,
        `Phase goal: ${phase.goal}`,
        `Depth: ${depth}`,
        `Files to review: ${reviewFiles.length ? reviewFiles.join(", ") : "(no specific files — review the phase's changed source broadly)"}`,
        "</phase_context>",
      ].join("\n");

      async function spawnReviewer() {
        const promptText = buildReviewerPrompt(files);
        try {
          const r = await spawnSubagent(ctx, exec, { label: "gsd-code-reviewer", promptText, outputSchema: CODE_REVIEWER_SCHEMA });
          const resolved = resolveFindings(r.structured);
          if (resolved) {
            return { findings: resolved, status: resolved.length ? "issues_found" : "clean", errorCause: null };
          }
          return { findings: null, status: "UNAVAILABLE", errorCause: "reviewer returned malformed structured output (findings missing or invalid severity)" };
        } catch (e) {
          return { findings: null, status: "UNAVAILABLE", errorCause: (e && e.message) || String(e) };
        }
      }

      let { findings, status, errorCause } = await spawnReviewer();

      const iso = nowIso();
      const dateTs = today();
      let counts = severityCounts(findings || []);

      // Frontmatter (D-10): machine-readable fields for downstream consumers.
      const fm = {
        phase: String(args.phase),
        reviewed: iso,
        depth,
        files_reviewed: files.length,
        status,
        findings: counts,
      };

      const body = buildReviewBody(phase, findings, depth, files, status, errorCause, iso, dateTs);
      const full = stringifyFrontmatter(fm) + "\n" + body;

      // Write REVIEW.md (routed through ctx.fs, CQ-01).
      let ctxPath = await s.writeArtifact(cwd, args.phase, "REVIEW", full);

      // D-13: advance STATE to the 'review' step (next_action verify-phase).
      await s.setActivePhase(cwd, args.phase, "review");
      const findingsStr = status === "UNAVAILABLE"
        ? "UNAVAILABLE"
        : `${counts.total} (${counts.blocker}B/${counts.warning}W/${counts.info}I)`;
      await s.addDecision(cwd, `Phase ${args.phase}: REVIEW.md written (status ${status}, findings ${findingsStr})`);

      // ── --fix path (D-04/D-05/D-11/D-12) + --auto loop (D-06) ──────────────
      // --fix (and --all/--auto which imply it) runs the review first, then
      // applies fixes per-finding via a gsd-code-fixer subagent. The TOOL writes
      // the fix content and commits atomically via commitSourceFiles (D-12:
      // tool-driven, not fixer-driven). Degrades to UNAVAILABLE REVIEW-FIX.md on
      // fixer fault (D-09). --auto re-spawns the reviewer after each fix round,
      // up to MAX_ITERATIONS (3), stopping early when a re-review yields no
      // BLOCKER/WARNING findings (D-06).
      const flags = resolveFixFlags(args);
      const MAX_ITERATIONS = 3; // D-06 cap.
      let fixSummary = "";
      let fixStatus = null;
      let autoNote = "";

      // Reusable fix loop: spawns a fixer subagent per fixable finding, writes
      // the fix content, commits atomically, and accumulates results.
      async function runFixLoop(currentFindings, includeInfo, appliedAccum, skippedAccum) {
        const fixable = filterBySeverity(currentFindings, includeInfo);
        const gitFn = ctx.gitFn || defaultGitFn;
        let fixUnavailable = false;
        let fixErrorCause = null;

        for (let i = 0; i < fixable.length; i++) {
          const finding = fixable[i];
          const fixIdx = appliedAccum.length + skippedAccum.length + 1;
          const scopedMessage = `phase ${args.phase} review-fix ${zeroPad(args.phase)}-F${zeroPad(fixIdx, 2)} ${finding.severity} ${finding.file}`;

          let currentContent = "";
          try {
            const fileTarget = await ctx.fs.resolve(`${cwd}/${finding.file}`);
            currentContent = (await ctx.fs.readText(fileTarget)) || "";
          } catch { /* file may not exist yet — empty content is fine */ }

          const fixerPrompt = [
            CODE_FIXER_PROMPT, "",
            "<finding>",
            `id: ${finding.id}`, `severity: ${finding.severity}`, `file: ${finding.file}`,
            `lines: ${finding.lines}`, `title: ${finding.title}`, `evidence: ${finding.evidence}`,
            `suggestion: ${finding.suggestion || "(none)"}`,
            "</finding>", "", "<current_file_content>", currentContent, "</current_file_content>",
          ].join("\n");

          try {
            const fr = await spawnSubagent(ctx, exec, { label: "gsd-code-fixer", promptText: fixerPrompt, outputSchema: CODE_FIXER_SCHEMA });
            const fixResult = fr.structured;
            if (fixResult && fixResult.status === "fixed" && fixResult.content != null) {
              const fileTarget = await ctx.fs.resolve(`${cwd}/${fixResult.file || finding.file}`);
              await ctx.fs.writeText(fileTarget, fixResult.content);
              const commitFile = fixResult.file || finding.file;
              await commitSourceFiles(cwd, [commitFile], scopedMessage, gitFn);
              appliedAccum.push({ id: finding.id, file: commitFile, severity: finding.severity, status: "fixed" });
            } else if (fixResult && fixResult.status === "skipped") {
              skippedAccum.push({ id: finding.id, file: finding.file, severity: finding.severity, status: "skipped", reason: fixResult.skip_reason || "" });
            } else {
              skippedAccum.push({ id: finding.id, file: finding.file, severity: finding.severity, status: "skipped", reason: "fixer returned malformed output" });
            }
          } catch (e) {
            fixUnavailable = true;
            fixErrorCause = (e && e.message) || String(e);
            skippedAccum.push({ id: finding.id, file: finding.file, severity: finding.severity, status: "unavailable", reason: fixErrorCause });
          }
        }
        return { fixUnavailable, fixErrorCause };
      }

      // Write REVIEW-FIX.md from accumulated fix results (called once at the end).
      async function writeReviewFixMd(appliedFixes, skippedFixes, fixUnavailable, fixErrorCause) {
        fixStatus = fixUnavailable ? "unavailable" : "applied";
        const fixFm = {
          phase: String(args.phase),
          fixed: nowIso(),
          fixes_applied: appliedFixes.length,
          fixes_skipped: skippedFixes.length,
          status: fixStatus,
        };
        const fixBodyLines = [
          `# Phase ${phase.n}: ${phase.name} - Code Review Fix Report`, "",
          `**Fixed:** ${fixFm.fixed}`, `**Status:** ${fixStatus}`,
          `**Fixes applied:** ${appliedFixes.length}`, `**Fixes skipped:** ${skippedFixes.length}`, "",
        ];
        if (fixStatus === "unavailable") {
          fixBodyLines.push("## Fixer Report", "", `**Status:** UNAVAILABLE`, "", `_The code-fixer subagent could not complete. Cause: ${fixErrorCause || "unknown"}._`, "");
        }
        if (appliedFixes.length) {
          fixBodyLines.push("## Applied Fixes", "");
          for (const f of appliedFixes) fixBodyLines.push(`- **${f.id}** [${f.severity}] ${f.file} — ${f.status}`);
          fixBodyLines.push("");
        }
        if (skippedFixes.length) {
          fixBodyLines.push("## Skipped Fixes", "");
          for (const f of skippedFixes) fixBodyLines.push(`- **${f.id}** [${f.severity}] ${f.file} — ${f.status}${f.reason ? `: ${f.reason}` : ""}`);
          fixBodyLines.push("");
        }
        fixBodyLines.push("---", "", `*Phase: ${String(phase.n).padStart(2, "0")}-${phase.name}*`);
        const fixFull = stringifyFrontmatter(fixFm) + "\n" + fixBodyLines.join("\n");
        await s.writeArtifact(cwd, args.phase, "REVIEW-FIX", fixFull);
      }

      // Write/overwrite REVIEW.md from a review result (reused by --auto re-reviews).
      async function writeReviewMd(reviewFindings, reviewStatus, reviewErrorCause) {
        const reviewCounts = severityCounts(reviewFindings || []);
        const reviewFm = {
          phase: String(args.phase),
          reviewed: nowIso(),
          depth,
          files_reviewed: files.length,
          status: reviewStatus,
          findings: reviewCounts,
        };
        const reviewBody = buildReviewBody(phase, reviewFindings, depth, files, reviewStatus, reviewErrorCause, nowIso(), today());
        const reviewFull = stringifyFrontmatter(reviewFm) + "\n" + reviewBody;
        return s.writeArtifact(cwd, args.phase, "REVIEW", reviewFull);
      }

      if (flags.fix) {
        // Fail-fast (D-09): if the review was UNAVAILABLE, there are no findings
        // to fix — the REVIEW.md has no actionable findings.
        if (status === "UNAVAILABLE") {
          throw new Error(
            `gsd_code_review: --fix requires a valid REVIEW.md with findings — the review was UNAVAILABLE. Re-run gsd_code_review (without --fix) first to produce a valid review.`,
          );
        }

        // Clean review with fix=true: no findings to fix. For --auto this is
        // convergence on iteration 1; for plain --fix it's a no-op.
        if (!findings || findings.length === 0) {
          fixSummary = flags.auto
            ? ` --auto: all issues resolved on iteration 1 (clean review, no fixes needed).`
            : ` --fix: review was clean, no findings to fix.`;
        } else {
          const includeInfo = flags.all; // D-05: --all adds INFO to fix scope.
          const appliedFixes = [];
          const skippedFixes = [];

          // Iteration 1: fix the initial findings.
          let { fixUnavailable, fixErrorCause } = await runFixLoop(findings, includeInfo, appliedFixes, skippedFixes);

          // --auto iteration loop (D-06): re-review + re-fix, cap at MAX_ITERATIONS.
          if (flags.auto && !fixUnavailable) {
            let iteration = 1;
            let converged = false;
            while (iteration < MAX_ITERATIONS) {
              iteration++;
              const reReview = await spawnReviewer();
              // Overwrite REVIEW.md with the re-review findings.
              await writeReviewMd(reReview.findings, reReview.status, reReview.errorCause);
              if (reReview.status === "UNAVAILABLE") {
                fixUnavailable = true;
                fixErrorCause = reReview.errorCause;
                break;
              }
              if (!hasBlockingFindings(reReview.findings || [])) {
                converged = true;
                autoNote = ` --auto: all issues resolved after iteration ${iteration}.`;
                break;
              }
              // Still has blocking findings — fix and continue.
              const fixResult = await runFixLoop(reReview.findings || [], includeInfo, appliedFixes, skippedFixes);
              if (fixResult.fixUnavailable) {
                fixUnavailable = true;
                fixErrorCause = fixResult.fixErrorCause;
                break;
              }
            }
            if (!converged && !fixUnavailable) {
              autoNote = ` --auto: reached maximum iterations (${MAX_ITERATIONS}). Issues may remain.`;
            }
          }

          // Write REVIEW-FIX.md once at the end, summarizing all fix rounds.
          await writeReviewFixMd(appliedFixes, skippedFixes, fixUnavailable, fixErrorCause);
          fixSummary = ` REVIEW-FIX.md written (${appliedFixes.length} applied, ${skippedFixes.length} skipped, status ${fixStatus}).${autoNote}`;
          await s.addDecision(cwd, `Phase ${args.phase}: REVIEW-FIX.md written (${appliedFixes.length} fixes applied, status ${fixStatus})`);
        }
      }

      // Best-effort commit of the just-written artefacts (CQ-07/MW-03), the
      // same out-of-flow auto-commit pattern as spec/gap-analysis.
      const commit = await commitArtifacts(cwd, args.phase, { scope: "code-review", phaseName: phase.name });

      let commitNote = ` Artefacts committed: ${commit.committed} (${commit.staged.length} file(s)).`;
      if (commit.warning) commitNote += ` WARNING: ${commit.warning}.`;

      let branchNote = ` Branch: ${branchInfo.action} (${branchInfo.branch}).`;

      return `Code review complete for phase ${args.phase} (${phase.name}). Wrote ${ctxPath}. Status: ${status}, findings: ${findingsStr}.${fixSummary}${commitNote}${branchNote} STATE advanced to 'review'. Next: gsd_verify on phase ${args.phase}.`;
    },
    presentCall: (a) => ({ card: "generic", title: `Code review phase ${a.phase}`, kind: "other", rawInput: { phase: a.phase } }),
  }));
}

export { name, inject, apply };
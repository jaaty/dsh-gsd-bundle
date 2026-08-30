// @dsh-gsd/bundle/gap-analysis — the Gap-analysis step tool (opengsd
// /gsd-gap-analysis). A full loop-step plugin mirroring lib/spec.js (D-01):
// publishes the gsdGapAnalysis capability, registers the /gsd-gap-analysis
// command's tool, writes <NN>-COVERAGE.md via writeArtifact, advances STATE,
// and lands the artefacts on the phase-<N> branch via the shared git seam.
//
// D-03: the coverage scan is a DETERMINISTIC literal-ID scan executed in pure
// JS — no fresh-context sub-agent, no tokens, fully falsifiable. The semantic
// 'did they really address it' judgement stays gsd_verify's remit. Because no
// sub-agent is spawned, this plugin injects NO sub-agent coeffect (DEGR-07).
//
// The pure helpers (parseDecisionIds, scanCoverage) are exported so they are
// unit-testable directly with no ctx / no I/O (D-13 b-c).

import { defineTool } from "@deepseek-ai/dsh-tools";
import { nowIso, today, zeroPad, parseFrontmatter, stringifyFrontmatter, parseDecisionEntries } from "./_shared.js";
import { cwdOf } from "./_runner.js";
import { ensurePhaseBranch, commitArtifacts } from "./_git-artifacts.js";
import { buildCapability } from "./_capabilities.js";

const name = "gsd-gap-analysis";
// DEGR-07: the sub-agent coeffect is deliberately ABSENT — gap-analysis is a
// deterministic pure-JS scan (D-03), so the fiber must not depend on the host
// sub-agent service. gsdState + tools mirror the other loop steps.
const inject = ["gsdState", "tools"];

// ── pure scanner helpers (no ctx, no I/O — unit-testable directly) ─────────────

// Parse D-NN decision IDs from a CONTEXT.md body. Delegates to the shared
// parseDecisionEntries (single source of truth for CONTEXT decision parsing)
// and projects to the id list, preserving the EXACT prior behavior: dedup +
// ascending sort by the numeric part of the id (test/gap-analysis.test.mjs
// pins this). Whole-ID safety (D-01 vs D-010) is enforced by the shared
// helper's `:**` terminator.
export function parseDecisionIds(md) {
  return parseDecisionEntries(md).map((d) => d.id);
}

// Scan a set of candidate IDs against a collection of plans. Each plan is
// { id, requirements:[], body:"" }. For each candidate, compute per-plan
// evidence: a frontmatter hit (plan.requirements.includes(id)) and a body hit
// (whole-word regex over plan.body — the prose ONLY, frontmatter stripped by
// the caller, D-04). A frontmatter-only ID is 'declared, not elaborated' but
// still counts as Covered (D-04). Returns [{ id, covered, evidence:[{planId,where}]}].
export function scanCoverage(candidateIds, plans) {
  return candidateIds.map((id) => {
    const re = new RegExp("\\b" + id.replace(/-/g, "\\-") + "\\b");
    const evidence = [];
    for (const plan of plans) {
      const fmHit = Array.isArray(plan.requirements) && plan.requirements.includes(id);
      const bodyHit = re.test(plan.body || "");
      if (fmHit && bodyHit) evidence.push({ planId: plan.id, where: "both" });
      else if (fmHit) evidence.push({ planId: plan.id, where: "frontmatter" });
      else if (bodyHit) evidence.push({ planId: plan.id, where: "body" });
    }
    return { id, covered: evidence.length > 0, evidence };
  });
}

// Truncate text to ~maxLen chars with ellipsis (Claude's Discretion, default 60).
function truncate(text, maxLen = 60) {
  const s = String(text ?? "").replace(/\s+/g, " ").trim();
  return s.length > maxLen ? s.slice(0, maxLen - 1) + "…" : s;
}

// Detect orphan/phantom IDs (D-09): ID-like tokens mentioned in any runnable
// plan's frontmatter requirements OR prose body that are NOT in the known
// candidate set (phase REQ-IDs + CONTEXT D-IDs). Returns [{ id, plans:[planId] }]
// sorted by id. REQ-shaped tokens /[A-Z]+-\d+/ and D-shaped /\bD-\d+\b/ are both
// collected so cross-phase REQ-IDs, stale IDs, and typos are visible.
export function findOrphans(planTexts, candidateIds) {
  const known = new Set(candidateIds);
  const orphans = new Map(); // id -> Set(planId)
  const reqRe = /\b([A-Z]+-\d+)\b/g;
  const dRe = /\b(D-\d+)\b/g;
  for (const plan of planTexts) {
    const sources = [plan.body || ""];
    if (Array.isArray(plan.requirements)) sources.push(plan.requirements.join(" "));
    const seen = new Set();
    for (const src of sources) {
      for (const re of [reqRe, dRe]) {
        let m;
        re.lastIndex = 0;
        while ((m = re.exec(src)) !== null) {
          const tok = m[1];
          if (known.has(tok) || seen.has(tok)) continue;
          seen.add(tok);
          if (!orphans.has(tok)) orphans.set(tok, new Set());
          orphans.get(tok).add(plan.id);
        }
      }
    }
  }
  return [...orphans.entries()]
    .map(([id, plans]) => ({ id, plans: [...plans] }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

// Build the Markdown coverage table from scanned rows + candidate metadata.
// candidateMeta: [{ id, source, text }]
// scanned: [{ id, covered, evidence }]
function assembleTable(candidateMeta, scanned) {
  const lines = [];
  lines.push("| ID | Source | Text | Covered | Plan(s) | Evidence |");
  lines.push("|---|---|---|---|---|---|");
  for (const meta of candidateMeta) {
    const row = scanned.find((r) => r.id === meta.id);
    const covered = row && row.covered ? "Y" : "N";
    const planIds = row && row.evidence.length
      ? row.evidence.map((e) => e.planId).join(", ")
      : "—";
    const evText = row && row.evidence.length
      ? row.evidence.map((e) => {
          if (e.where === "frontmatter") return `${e.planId}: declared, not elaborated`;
          return `${e.planId}: ${e.where}`;
        }).join("; ")
      : "—";
    lines.push(`| ${meta.id} | ${meta.source} | ${truncate(meta.text)} | ${covered} | ${planIds} | ${evText} |`);
  }
  return lines.join("\n");
}

function apply(ctx) {
  const gsd = () => ctx.get("gsdState");

  // Publish this loop step's capability (DEGR-01/D-02). Auto-tracked
  // revertible effect: retiring the gap-analysis plugin withdraws gsdGapAnalysis.
  ctx.provide("gsdGapAnalysis", buildCapability("gsdGapAnalysis"));

  ctx.tools.register(defineTool({
    name: "gsd_gap_analysis",
    description: "Gap analysis (opengsd post-planning coverage): emit a <NN>-COVERAGE.md coverage table cross-referencing every phase REQ-ID (ROADMAP) and every D-ID (CONTEXT.md) against the runnable plans' bodies. Deterministic literal-ID scan, no subagent. Soft gate: warns + flags uncovered IDs, never blocks gsd_execute. Run after gsd_plan.",
    parameters: {
      phase: { type: "number", required: true },
    },
    output: { schema: { type: "string" }, render: (_a, v) => [{ type: "text", text: v }] },
    async execute(args, exec) {
      // Fail-fast environmental guards (D-12), mirroring spec.js.
      const cwd = cwdOf(exec);
      const s = gsd();
      if (!s) throw new Error("gsd_gap_analysis: gsdState service unavailable");
      if (!(await s.isProject(cwd))) throw new Error("gsd_gap_analysis: no .planning/ project — run gsd_init first");
      const roadmap = await s.readRoadmap(cwd);
      const phase = (roadmap?.phases || []).find((p) => p.n === args.phase);
      if (!phase) throw new Error(`gsd_gap_analysis: phase ${args.phase} not in ROADMAP.md`);

      // D-01/D-10: acquire the per-phase feature branch before any artefact
      // write, the same seam every step tool uses.
      const branchInfo = await ensurePhaseBranch(cwd, args.phase);

      // ── gather candidate IDs ────────────────────────────────────────────────
      // REQ-IDs: phase-scoped (ROADMAP phase.requirements), text from REQUIREMENTS.
      const reqsMeta = await s.readRequirements(cwd);
      const textById = new Map(reqsMeta.map((r) => [r.id, r.text]));
      const reqRows = (phase.requirements || []).map((id) => ({
        id, source: "REQUIREMENTS", text: textById.get(id) || id,
      }));

      // D-IDs: parsed from the phase CONTEXT.md decisions block (D-05/D-08).
      // Missing CONTEXT → D-ID coverage noted UNAVAILABLE (frontmatter context:
      // 'unavailable' + body note); REQ rows still emitted. Degrade, never throw.
      const hasContext = await s.hasArtifact(cwd, args.phase, "CONTEXT");
      const contextUnavailable = !hasContext;
      let dRows = [];
      if (hasContext) {
        const ctxText = await s.readArtifact(cwd, args.phase, "CONTEXT");
        const dids = parseDecisionIds(ctxText);
        // Extract the decision text for each D-ID (the text after `- **D-NN:** `).
        const dTextMap = new Map();
        for (const did of dids) {
          const m = ctxText.match(new RegExp(`- \\*\\*${did}:\\*\\*\\s*(.+)$`, "m"));
          dTextMap.set(did, m ? m[1].trim() : did);
        }
        dRows = dids.map((id) => ({ id, source: "CONTEXT", text: dTextMap.get(id) || id }));
      }

      const candidateMeta = [...reqRows, ...dRows];
      const candidateIds = candidateMeta.map((r) => r.id);

      // ── gather runnable plans (D-10): exclude superseded, include gap_closure ─
      const allPlans = await s.listPlans(cwd, args.phase);
      const runnable = allPlans.filter((p) => p.status !== "superseded");

      // For each runnable plan, read its full text, strip the frontmatter so the
      // body-hit scan covers PROSE ONLY (D-04: if the body held the raw text
      // including frontmatter, any ID in requirements would also match the body
      // regex and be misclassified as 'both').
      const planTexts = [];
      for (const p of runnable) {
        const full = await s.readArtifact(cwd, args.phase, "PLAN-" + zeroPad(Number(p.plan)));
        const { body: prose } = parseFrontmatter(full || "");
        planTexts.push({ id: p.id, requirements: p.requirements || [], body: prose });
      }

      // ── scan + assemble ─────────────────────────────────────────────────────
      const scanned = scanCoverage(candidateIds, planTexts);
      const orphans = findOrphans(planTexts, candidateIds);
      const uncoveredIds = candidateIds.filter((id) => {
        const r = scanned.find((x) => x.id === id);
        return !r || !r.covered;
      }).sort();
      const coveredCount = candidateIds.length - uncoveredIds.length;
      const candidateCount = candidateIds.length;
      const coveragePct = candidateCount > 0 ? Math.round((coveredCount / candidateCount) * 100) : 100;
      const status = uncoveredIds.length ? "gaps" : "covered";

      // Frontmatter (D-07): status, gap_ids, coverage_pct, phase, generated.
      const fm = {
        status,
        gap_ids: uncoveredIds,
        coverage_pct: coveragePct,
        phase: String(args.phase),
        generated: nowIso(),
      };
      if (contextUnavailable) fm.context = "unavailable";

      // Body: heading + optional context-unavailable note + table + orphan section.
      const bodyLines = [];
      bodyLines.push(`# Phase ${args.phase}: ${phase.name} - Coverage`, "");
      bodyLines.push(`**Generated:** ${fm.generated}`, "");
      if (contextUnavailable) {
        bodyLines.push("> CONTEXT.md unavailable — D-ID coverage not assessed.", "");
      }
      if (uncoveredIds.length) {
        bodyLines.push(`> WARNING: uncovered IDs: ${uncoveredIds.join(", ")}`, "");
      }
      if (runnable.length === 0 && candidateIds.length > 0) {
        bodyLines.push("> WARNING: no runnable plans found — every ID is UNCOVERED.", "");
      }
      bodyLines.push(assembleTable(candidateMeta, scanned), "");
      if (orphans.length) {
        bodyLines.push("## Orphan IDs", "");
        bodyLines.push("_IDs mentioned in plans but not in the phase's requirements or CONTEXT (typos, cross-phase, or stale IDs)._", "");
        bodyLines.push("| ID | Plan(s) |");
        bodyLines.push("|---|---|");
        for (const o of orphans) {
          bodyLines.push(`| ${o.id} | ${o.plans.join(", ")} |`);
        }
        bodyLines.push("");
      }
      bodyLines.push("---", "", `*Phase: ${String(args.phase).padStart(2, "0")}-${phase.name}*`, `*Coverage generated: ${today()}*`);
      const body = bodyLines.join("\n");

      const full = stringifyFrontmatter(fm) + "\n" + body;

      // Write COVERAGE.md (the ONLY artefact write — routed through ctx.fs,
      // CQ-01/DUR-06). writeArtifact overwrites on re-run (D-07).
      const ctxPath = await s.writeArtifact(cwd, args.phase, "COVERAGE", full);

      // D-06: soft gate — never blocks. Advance STATE toward execute (plan
      // already set step='execute'; this is a pass-through overlay, D-01/D-14).
      await s.setActivePhase(cwd, args.phase, "execute");
      const gapStr = uncoveredIds.length ? uncoveredIds.join(", ") : "none";
      await s.addDecision(cwd, `Phase ${args.phase}: COVERAGE.md written (coverage ${coveragePct}%, gaps: ${gapStr})`);

      // Best-effort commit of the just-written artefacts (CQ-07/MW-03), the
      // same out-of-flow auto-commit pattern as spec/discuss.
      const commit = await commitArtifacts(cwd, args.phase, { scope: "gap-analysis", phaseName: phase.name });

      let commitNote = ` Artefacts committed: ${commit.committed} (${commit.staged.length} file(s)).`;
      if (commit.warning) commitNote += ` WARNING: ${commit.warning}.`;

      let warningNote = "";
      if (uncoveredIds.length) {
        warningNote = ` WARNING: uncovered IDs: ${gapStr}.`;
      }

      const summary = `Gap analysis complete for phase ${args.phase} (${phase.name}). Wrote ${ctxPath}. Coverage: ${coveragePct}% — gaps: ${gapStr}.${warningNote}${commitNote} Branch: ${branchInfo.action} (${branchInfo.branch}). Next: gsd_execute on phase ${args.phase}.`;
      return summary;
    },
    presentCall: (a) => ({ card: "generic", title: `Gap analysis phase ${a.phase}`, kind: "other", rawInput: { phase: a.phase } }),
  }));
}

export { name, inject, apply };
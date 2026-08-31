// @dsh-gsd/bundle/milestone-audit — the milestone-close audit step (opengsd
// /gsd-milestone-audit). A full loop-step plugin mirroring lib/validate-phase.js
// (hybrid deterministic scan + gated subagent) + lib/gap-analysis.js (soft gate,
// pure-JS scan, no STATE advance):
//
// - publishes the gsdMilestoneAudit capability (order 52, after gsdShip 50;
//   D-01/D-02)
// - registers the gsd_milestone_audit tool
// - runs a DETERMINISTIC pure-JS close-gate scan (D-03, gap-analysis style, no
//   subagent, no tokens) that aggregates per-phase VERIFICATION.md statuses,
//   milestone REQ-ID completeness, and shipped status from ROADMAP/REQUIREMENTS
//   (D-04 definition of done)
// - writes a milestone-scoped audit report at
//   .planning/milestones/<milestone-name>-AUDIT.md with a status frontmatter
//   (ready-to-close | not-ready + reasons; D-06)
// - does NOT advance STATE (D-06) — a pure report, like gap-analysis
//
// This is the full hybrid engine (D-03): the deterministic close-gate scan PLUS
// the gated cross-phase UAT outstanding-items subagent (gsd-milestone-auditor).
// The UAT subagent is spawned only when the close-gate passes OR the --force flag
// is set (D-07); a subagent fault or malformed output degrades to an UNAVAILABLE
// Cross-Phase UAT section (D-08), never throwing.
//
// DEGR-07: the UAT subagent spawns, so 'subagents' is declared as a hard
// coeffect (mirroring validate-phase.js inject).
//
// The pure close-gate helpers (aggregateCloseGate, classifyMilestoneStatus) are
// exported with NO ctx / NO fs / NO git parameters so they are unit-testable
// directly (D-04, mirroring gap-analysis.js). All I/O happens in apply().

import { defineTool } from "@deepseek-ai/dsh-tools";
import { nowIso, today, parseFrontmatter, stringifyFrontmatter, slugify } from "./_shared.js";
import { cwdOf, spawnSubagent } from "./_runner.js";
import { commitArtifacts } from "./_git-artifacts.js";
import { buildCapability } from "./_capabilities.js";
import { MILESTONE_AUDITOR_PROMPT, MILESTONE_AUDITOR_SCHEMA } from "./_agents.js";

const name = "gsd-milestone-audit";
// DEGR-07 (D-01): 'subagents' is a required coeffect — the UAT auditor (Plan 02)
// spawns a subagent, so the fiber activates against the host subagents service.
const inject = ["gsdState", "tools", "subagents"];

// ── pure close-gate helpers (no ctx, no I/O — unit-testable directly) ────────

// Aggregate the milestone close-gate (D-04 definition of done). A milestone met
// its DoD iff (a) every phase.status === "Complete" (shipped), (b) every
// requirement.complete === true, and (c) every phase's VERIFICATION.md status is
// "passed". phases is [{ n, name, status }], requirements is [{ id, complete }],
// and verifications maps phase number -> "passed"|"gaps_found"|"human_needed"|
// "missing". Returns { ready, reasons } where reasons is a human-readable list
// naming each failing condition.
export function aggregateCloseGate({ phases = [], requirements = [], verifications = {} } = {}) {
  const reasons = [];

  const unshipped = phases.filter((p) => p.status !== "Complete");
  if (unshipped.length) {
    reasons.push(`Unshipped phases: ${unshipped.map((p) => p.n).join(", ")}`);
  }

  const incomplete = requirements.filter((r) => r.complete !== true);
  if (incomplete.length) {
    reasons.push(`Incomplete requirements: ${incomplete.map((r) => r.id).join(", ")}`);
  }

  const notPassed = phases.filter((p) => verifications[p.n] !== "passed");
  if (notPassed.length) {
    reasons.push(
      `Phases without passed verification: ${notPassed
        .map((p) => `${p.n} (${verifications[p.n] || "missing"})`)
        .join(", ")}`,
    );
  }

  return { ready: reasons.length === 0, reasons };
}

// Derive the report status (D-06): 'ready-to-close' when the close-gate passes,
// else 'not-ready'.
export function classifyMilestoneStatus(gate) {
  return gate && gate.ready ? "ready-to-close" : "not-ready";
}

// Validate the gsd-milestone-auditor subagent's structured output (D-08). Returns
// the structured object when it is an object with an array `outstanding_items`
// whose every entry is an object carrying a string `item`; otherwise returns null
// (the caller degrades to an UNAVAILABLE Cross-Phase UAT section). Mirrors
// validate-phase.js resolveAuditorOutput.
export function resolveAuditorOutput(structured) {
  if (!structured || typeof structured !== "object") return null;
  if (!Array.isArray(structured.outstanding_items)) return null;
  for (const entry of structured.outstanding_items) {
    if (!entry || typeof entry !== "object") return null;
    if (typeof entry.item !== "string") return null;
  }
  return structured;
}

function apply(ctx) {
  const gsd = () => ctx.get("gsdState");

  // Publish this loop step's capability (DEGR-01/D-01). Auto-tracked revertible
  // effect: retiring the milestone-audit plugin withdraws gsdMilestoneAudit.
  ctx.provide("gsdMilestoneAudit", buildCapability("gsdMilestoneAudit"));

  ctx.tools.register(defineTool({
    name: "gsd_milestone_audit",
    description: "Milestone close-gate audit (opengsd /gsd-milestone-audit): a deterministic pure-JS scan aggregates per-phase VERIFICATION.md statuses, milestone REQ-ID completeness, and shipped status from ROADMAP/REQUIREMENTS to confirm the milestone met its derived definition of done, plus a cross-phase UAT outstanding-items list, emitted as one milestone-scoped audit report at .planning/milestones/<name>-AUDIT.md. Soft gate — advisory, never blocks the release. Does not advance STATE. Run at milestone-close time.",
    parameters: {
      force: { type: "boolean" },
    },
    output: { schema: { type: "string" }, render: (_a, v) => [{ type: "text", text: v }] },
    async execute(args, exec) {
      // Fail-fast environmental guards (D-08), mirroring gap-analysis.js.
      const cwd = cwdOf(exec);
      const s = gsd();
      if (!s) throw new Error("gsd_milestone_audit: gsdState service unavailable");
      if (!(await s.isProject(cwd))) throw new Error("gsd_milestone_audit: no .planning/ project — run gsd_init first");
      const roadmap = await s.readRoadmap(cwd);
      if (!roadmap) throw new Error("gsd_milestone_audit: unreadable ROADMAP.md");
      const reqs = await s.readRequirements(cwd);

      // Milestone identity: ROADMAP header, falling back to STATE frontmatter.
      const state = await s.readState(cwd);
      const milestoneName = roadmap.milestoneName || state?.frontmatter?.milestone_name || "milestone";

      // Read each phase's VERIFICATION.md status; a missing/unparseable artefact
      // degrades to "missing" (treated as not-passed → not-ready with a reason).
      const verifications = {};
      for (const phase of roadmap.phases) {
        const text = await s.readArtifact(cwd, phase.n, "VERIFICATION");
        if (text === undefined) {
          verifications[phase.n] = "missing";
        } else {
          const { frontmatter } = parseFrontmatter(text);
          verifications[phase.n] = frontmatter?.status || "missing";
        }
      }

      // Deterministic close-gate aggregation (D-04).
      const gate = aggregateCloseGate({ phases: roadmap.phases, requirements: reqs, verifications });
      const status = classifyMilestoneStatus(gate);

      const phasesTotal = roadmap.phases.length;
      const phasesShipped = roadmap.phases.filter((p) => p.status === "Complete").length;
      const reqsTotal = reqs.length;
      const reqsComplete = reqs.filter((r) => r.complete === true).length;
      const verificationsPassed = roadmap.phases.filter((p) => verifications[p.n] === "passed").length;

      // ── Cross-Phase UAT outstanding-items subagent (D-03/D-07/D-08) ─────────
      // Gating (D-07): spawn the fresh-context gsd-milestone-auditor ONLY when the
      // deterministic close-gate passes OR the --force flag is set. A spawn throw
      // or malformed structured output degrades to an UNAVAILABLE section (D-08) —
      // never throws. The UAT outcome does NOT change the close-gate status.
      let uat = { status: "skipped", items: [], summary: null, cause: null };
      if (gate.ready || args.force) {
        const phaseLines = roadmap.phases
          .map((p) => `- Phase ${p.n} (${p.name}): status ${p.status}, verification ${verifications[p.n] || "missing"}`)
          .join("\n");
        const promptText = `${MILESTONE_AUDITOR_PROMPT}\n\n<milestone_context>\nMilestone: ${milestoneName}\nClose-gate status: ${status}\nReasons: ${gate.reasons.length ? gate.reasons.join("; ") : "none"}\nPhases:\n${phaseLines}\n</milestone_context>`;
        let structured = null;
        let cause = null;
        try {
          const r = await spawnSubagent(ctx, exec, { label: "gsd-milestone-auditor", promptText, outputSchema: MILESTONE_AUDITOR_SCHEMA });
          structured = resolveAuditorOutput(r.structured);
          if (!structured) cause = "auditor returned malformed structured output (outstanding_items missing or invalid)";
        } catch (e) {
          cause = (e && e.message) || String(e);
        }
        if (cause) {
          uat = { status: "unavailable", items: [], summary: null, cause };
        } else {
          uat = { status: "complete", items: structured.outstanding_items, summary: structured.summary || null, cause: null };
        }
      }

      // Frontmatter (D-06): milestone, status, generated, counts, reasons, uat.
      const fm = {
        milestone: milestoneName,
        status,
        generated: nowIso(),
        phases_total: phasesTotal,
        phases_shipped: phasesShipped,
        requirements_total: reqsTotal,
        requirements_complete: reqsComplete,
        verifications_passed: verificationsPassed,
        reasons: gate.reasons,
        uat: uat.status,
      };

      // Body: Close-Gate (deterministic) + Reasons + Cross-Phase UAT.
      const bodyLines = [];
      bodyLines.push(`# Milestone ${milestoneName} - Audit Report`, "");
      bodyLines.push(`**Audited:** ${fm.generated}`);
      bodyLines.push(`**Status:** ${status}`, "");
      bodyLines.push("## Close-Gate (deterministic)", "");
      bodyLines.push(`- Phases shipped: ${phasesShipped}/${phasesTotal}`);
      bodyLines.push(`- Requirements complete: ${reqsComplete}/${reqsTotal}`);
      bodyLines.push(`- Verifications passed: ${verificationsPassed}/${phasesTotal}`, "");
      if (!gate.ready) {
        bodyLines.push("## Reasons", "");
        for (const reason of gate.reasons) bodyLines.push(`- ${reason}`);
        bodyLines.push("");
      }
      bodyLines.push("## Cross-Phase UAT Outstanding Items", "");
      if (uat.status === "complete") {
        bodyLines.push("**Status:** COMPLETE", "");
        if (uat.items.length === 0) {
          bodyLines.push("_No outstanding items reported by the gsd-milestone-auditor._", "");
        } else {
          for (const it of uat.items) {
            const sev = it.severity || "INFO";
            const phase = it.phase ? `${it.phase}: ` : "";
            bodyLines.push(`- [${sev}] ${phase}${it.item}`);
          }
          bodyLines.push("");
        }
        if (uat.summary) bodyLines.push(`_Auditor summary: ${uat.summary}_`, "");
      } else if (uat.status === "skipped") {
        bodyLines.push("**Status:** SKIPPED", "");
        bodyLines.push("_The cross-phase UAT audit was skipped because the close-gate did not pass. Use --force to run the UAT audit anyway._", "");
      } else {
        bodyLines.push("**Status:** UNAVAILABLE", "");
        bodyLines.push(`_The gsd-milestone-auditor subagent could not complete. Cause: ${uat.cause || "unknown"}._`, "");
      }
      bodyLines.push("---", "", `*Milestone: ${milestoneName}*`, `*Audited: ${today()}*`);
      const body = bodyLines.join("\n");

      const full = stringifyFrontmatter(fm) + "\n" + body;

      // Write the milestone-scoped AUDIT.md via the new state accessor (DUR-06).
      const ctxPath = await s.writeMilestoneArtifact(cwd, milestoneName, full);

      // D-06: record a decision but do NOT advance STATE's next_action — a pure
      // report, like gap-analysis. Never call setActivePhase.
      await s.addDecision(cwd, `Milestone ${milestoneName}: AUDIT.md written (status ${status})`);

      // CQ-07/MW-03: commit the just-written artefact via the shared seam.
      const commit = await commitArtifacts(cwd, null, { message: "docs(planning): milestone audit report" });
      const commitNote = ` Artefacts committed: ${commit.committed} (${commit.staged.length} file(s)).` + (commit.warning ? ` WARNING: ${commit.warning}.` : "");

      return `Milestone audit complete for ${milestoneName}. Wrote ${ctxPath}. Status: ${status} (phases shipped ${phasesShipped}/${phasesTotal}, requirements complete ${reqsComplete}/${reqsTotal}, verifications passed ${verificationsPassed}/${phasesTotal}).${gate.reasons.length ? ` Reasons: ${gate.reasons.join("; ")}.` : ""}${commitNote} Next: gsd_ship on the milestone's phases (advisory only).`;
    },
    presentCall: (a) => ({ card: "generic", title: "Milestone audit", kind: "other", rawInput: { force: a.force } }),
  }));
}

export { name, inject, apply };

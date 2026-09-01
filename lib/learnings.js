// @dsh-gsd/bundle/learnings — the extract-learnings loop step (opengsd
// /gsd-extract-learnings). A full loop-step plugin mirroring lib/milestone-audit.js
// (hybrid deterministic scan + gated fresh-context subagent) and lib/gap-analysis.js
// (soft gate, pure-JS scan, no STATE advance):
//
// - publishes the gsdLearnings capability (order 53, after gsdMilestoneAudit 52;
//   D-01)
// - registers the gsd_extract_learnings tool ({ phase, force })
// - runs a DETERMINISTIC pure-JS gather (D-07, no subagent, no tokens) that reads
//   the phase's CONTEXT.md decisions (via parseDecisionEntries) + the raw
//   PLAN/SUMMARY/VERIFICATION/REVIEW/COVERAGE corpus
// - spawns a fresh-context gsd-learnings subagent (D-08) that synthesizes the
//   interpretive categories — lessons, patterns, surprises — each item a string
//   with a source attribution; a subagent fault or malformed output degrades to
//   a decisions-only LEARNINGS.md (D-09), never throwing
// - writes (a) a per-phase {NN}-LEARNINGS.md (D-03, upstream-compatible: four
//   categories + source attribution + frontmatter counts/missing_artifacts) and
//   (b) a carrying-forward .planning/LEARNINGS.md (D-04) that accumulates every
//   phase's extract across the project, newest last, with a phases_extracted
//   idempotency index (D-06)
// - does NOT advance STATE (D-12) — an advisory soft gate, like gap-analysis and
//   milestone-audit
//
// DEGR-07: the synthesis subagent spawns, so 'subagents' is declared as a hard
// coeffect (mirroring milestone-audit.js inject).
//
// The pure helpers (gatherDecisions, resolveLearningsOutput, checkIdempotency,
// accumulateRootLearnings) are exported with NO ctx / NO fs / NO git parameters so
// they are unit-testable directly (D-14). All I/O happens in apply().

import { defineTool } from "@deepseek-ai/dsh-tools";
import { nowIso, today, zeroPad, parseFrontmatter, stringifyFrontmatter, parseDecisionEntries } from "./_shared.js";
import { cwdOf, spawnSubagent } from "./_runner.js";
import { commitArtifacts } from "./_git-artifacts.js";
import { buildCapability } from "./_capabilities.js";
import { LEARNINGS_PROMPT, LEARNINGS_SCHEMA } from "./_agents.js";

const name = "gsd-learnings";
// DEGR-07 (D-01): 'subagents' is a required coeffect — the synthesis subagent
// spawns, so the fiber activates against the host subagents service.
const inject = ["gsdState", "tools", "subagents"];

// ── pure helpers (no ctx, no I/O — unit-testable directly) ────────────────────

// Gather the deterministic decisions category from a phase's CONTEXT.md (D-07,
// D-14h). Delegates to the shared parseDecisionEntries (single source of truth
// for CONTEXT decision parsing: dedup + ascending numeric sort, whole-ID
// safety) and attaches the CONTEXT#decisions source attribution every extracted
// item must carry (REQ-LEARN-02). Returns an array of { id, text, source }.
export function gatherDecisions(contextText) {
  return parseDecisionEntries(contextText).map((d) => ({
    id: d.id,
    text: d.text,
    source: "CONTEXT#decisions",
  }));
}

// Validate the gsd-learnings subagent's structured output (D-08). Per-category
// degrade, never throwing: if structured is not an object, ALL three categories
// degrade to empty. For each of lessons/patterns/surprises: if the array is
// present and every entry is { content: string, source: string }, keep it;
// otherwise degrade that category to [] and record its name in `degraded`.
// Returns { lessons, patterns, surprises, degraded }.
export function resolveLearningsOutput(structured) {
  const empty = { lessons: [], patterns: [], surprises: [], degraded: ["lessons", "patterns", "surprises"] };
  if (!structured || typeof structured !== "object") return empty;
  const cats = ["lessons", "patterns", "surprises"];
  const out = { lessons: [], patterns: [], surprises: [], degraded: [] };
  for (const cat of cats) {
    const arr = structured[cat];
    if (!Array.isArray(arr)) {
      out.degraded.push(cat);
      continue;
    }
    const valid = arr.every(
      (e) => e && typeof e === "object" && typeof e.content === "string" && typeof e.source === "string",
    );
    if (!valid) {
      out.degraded.push(cat);
      continue;
    }
    out[cat] = arr.map((e) => ({ content: e.content, source: e.source }));
  }
  return out;
}

// Idempotency guard (D-06). Reads ONLY the root frontmatter (O(1) on the common
// path). If no root file exists yet (frontmatter null/undefined), extraction
// proceeds. If phases_extracted already includes phaseNum and force is not true,
// short-circuit with a clear message; force re-extracts. A missing/absent
// phases_extracted array degrades to "proceed" (never skip on a corrupt index).
export function checkIdempotency(rootFrontmatter, phaseNum, force) {
  if (rootFrontmatter === null || rootFrontmatter === undefined) return { skip: false };
  if (force === true) return { skip: false };
  const extracted = rootFrontmatter && Array.isArray(rootFrontmatter.phases_extracted) ? rootFrontmatter.phases_extracted : null;
  if (!extracted) return { skip: false };
  if (extracted.includes(Number(phaseNum))) {
    return { skip: true, message: `phase ${phaseNum} already extracted — use force to re-extract` };
  }
  return { skip: false };
}

// Accumulate a phase's extract into the carrying-forward root LEARNINGS.md
// (D-04, D-05). Append-or-replace, never duplicate (mirrors upstream
// fix-306-learnings-dedupe-index): a new phase appends a `## Phase N` block
// (newest last); an already-extracted phase replaces its block in place (full
// re-extract semantics, REQ-LEARN-05). The phases_extracted frontmatter index
// is updated (sorted ascending, deduplicated). Returns the full new file content
// (frontmatter + body).
export function accumulateRootLearnings(rootText, phaseBlock, phaseNum, phaseName, projectCode) {
  const preamble =
    "# Project Learnings\n\n" +
    "_Carrying-forward memory, auto-maintained by gsd_extract_learnings. One block per extracted phase, newest last. Do not edit by hand._\n";

  if (rootText === undefined || rootText === null || String(rootText).trim() === "") {
    const fm = { generated: nowIso(), project_code: projectCode, phases_extracted: [Number(phaseNum)] };
    const body = `${preamble}\n${phaseBlock}`;
    return stringifyFrontmatter(fm) + "\n" + body;
  }

  const { frontmatter: existingFm, body: existingBody } = parseFrontmatter(rootText);
  let fm = existingFm && typeof existingFm === "object" ? { ...existingFm } : {};
  let body = existingBody || "";

  const extracted = Array.isArray(fm.phases_extracted)
    ? fm.phases_extracted.map((x) => Number(x)).filter((x) => Number.isFinite(x))
    : [];

  // Replace the existing `## Phase N —` block in place, or append after the last
  // phase block (newest last).
  const lines = body.split("\n");
  const startIdx = lines.findIndex((l) => new RegExp(`^## Phase ${phaseNum} —`).test(l));
  if (startIdx === -1) {
    body = body.replace(/\n+$/, "") + "\n\n" + phaseBlock;
  } else {
    let endIdx = lines.length;
    for (let i = startIdx + 1; i < lines.length; i++) {
      if (/^## Phase \d+ —/.test(lines[i])) {
        endIdx = i;
        break;
      }
    }
    body = [...lines.slice(0, startIdx), ...phaseBlock.split("\n"), ...lines.slice(endIdx)].join("\n").replace(/\n+$/, "") + "\n";
  }

  if (!extracted.includes(Number(phaseNum))) extracted.push(Number(phaseNum));
  extracted.sort((a, b) => a - b);
  fm.generated = nowIso();
  fm.project_code = projectCode;
  fm.phases_extracted = extracted;
  return stringifyFrontmatter(fm) + "\n" + body;
}

// ── internal: render the four categorized sections at a heading level ─────────
// `prefix` is "##" for the per-phase file and "###" for the root phase block.
// Degraded categories (D-09) emit an UNAVAILABLE note with the real cause.
function buildSections(decisions, resolved, degradeCause, prefix) {
  const lines = [];
  lines.push(`${prefix} Decisions`, "");
  if (decisions.length) {
    for (const d of decisions) lines.push(`- **${d.id}:** ${d.text} (source: ${d.source})`);
  } else {
    lines.push("_No decisions recorded._");
  }
  lines.push("");
  for (const [cat, items] of [["Lessons", resolved.lessons], ["Patterns", resolved.patterns], ["Surprises", resolved.surprises]]) {
    lines.push(`${prefix} ${cat}`, "");
    const isDegraded = resolved.degraded.includes(cat.toLowerCase());
    if (items && items.length) {
      for (const it of items) lines.push(`- ${it.content} (source: ${it.source})`);
    } else if (isDegraded) {
      lines.push(`_UNAVAILABLE: ${cat} synthesis failed — ${degradeCause || "unknown cause"}._`);
    } else {
      lines.push(`_No ${cat.toLowerCase()} recorded._`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

// ── apply: register the tool + publish the capability (all I/O here) ──────────
function apply(ctx) {
  const gsd = () => ctx.get("gsdState");

  // Publish this loop step's capability (DEGR-01/D-01). Auto-tracked revertible
  // effect: retiring the learnings plugin withdraws gsdLearnings.
  ctx.provide("gsdLearnings", buildCapability("gsdLearnings"));

  ctx.tools.register(defineTool({
    name: "gsd_extract_learnings",
    description:
      "Extract-learnings (opengsd /gsd-extract-learnings): accumulate decisions, lessons, patterns, and surprises from a completed phase's planning artefacts into a per-phase {NN}-LEARNINGS.md and a carrying-forward .planning/LEARNINGS.md. Deterministic gather (decisions from CONTEXT.md) + a fresh-context synthesis subagent (lessons/patterns/surprises). Advisory soft gate — never blocks ship or advances STATE. Re-run with force to re-extract.",
    parameters: {
      phase: { type: "number" },
      force: { type: "boolean" },
    },
    output: { schema: { type: "string" }, render: (_a, v) => [{ type: "text", text: v }] },
    async execute(args, exec) {
      // ── fail-fast environmental guards (D-12), mirroring milestone-audit/gap-analysis.
      const cwd = cwdOf(exec);
      const s = gsd();
      if (!s) throw new Error("gsd_extract_learnings: gsdState service unavailable");
      if (!(await s.isProject(cwd))) throw new Error("gsd_extract_learnings: no .planning/ project — run gsd_init first");
      const roadmap = await s.readRoadmap(cwd);
      if (!roadmap) throw new Error("gsd_extract_learnings: unreadable ROADMAP.md");
      const phase = roadmap.phases.find((p) => p.n === args.phase);
      if (!phase) throw new Error(`gsd_extract_learnings: phase ${args.phase} not in ROADMAP`);

      // ── required-artifact check (D-07, REQ-LEARN-01): PLAN and SUMMARY required.
      const plans = await s.listPlans(cwd, phase.n);
      if (plans.length === 0) {
        throw new Error(`gsd_extract_learnings: phase ${phase.n} has no PLAN.md — required (REQ-LEARN-01)`);
      }
      const firstPlanNum = Number(plans[0].plan);
      const planSuffix = `PLAN-${zeroPad(firstPlanNum)}`;
      const summarySuffix = `SUMMARY-${zeroPad(firstPlanNum)}`;
      if (!(await s.hasArtifact(cwd, phase.n, summarySuffix))) {
        throw new Error(`gsd_extract_learnings: phase ${phase.n} has no SUMMARY.md — required (REQ-LEARN-01)`);
      }

      // ── idempotency guard (D-06): O(1) frontmatter-only read.
      const rootText = await s.readRootLearnings(cwd);
      const rootFm = rootText ? parseFrontmatter(rootText).frontmatter : null;
      const guard = checkIdempotency(rootFm, phase.n, args.force);
      if (guard.skip) return guard.message;

      // ── project code (D-04): config.project_code → PROJECT.md name → "project".
      const cfg = await s.readConfig(cwd);
      let projectCode = (cfg && cfg.project_code) || null;
      if (!projectCode) {
        const projText = await s.readProject(cwd);
        if (projText) {
          const m = projText.match(/^#\s+(.+)$/m);
          if (m) projectCode = m[1].trim();
        }
      }
      projectCode = projectCode || "project";

      // ── deterministic gather (D-07): decisions (from CONTEXT) + artifact digest.
      const contextText = await s.readArtifact(cwd, phase.n, "CONTEXT");
      const decisions = contextText ? gatherDecisions(contextText) : [];
      const missingArtifacts = [];
      if (!contextText) missingArtifacts.push("CONTEXT");

      const planText = await s.readArtifact(cwd, phase.n, planSuffix);
      const summaryText = await s.readArtifact(cwd, phase.n, summarySuffix);
      const verificationText = await s.readArtifact(cwd, phase.n, "VERIFICATION");
      const reviewText = await s.readArtifact(cwd, phase.n, "REVIEW");
      const coverageText = await s.readArtifact(cwd, phase.n, "COVERAGE");
      const optional = [
        ["VERIFICATION", verificationText],
        ["REVIEW", reviewText],
        ["COVERAGE", coverageText],
      ];
      for (const [label, text] of optional) {
        if (text === undefined) missingArtifacts.push(label);
      }

      // ── synthesis subagent (D-08): lessons/patterns/surprises with source
      // attribution. Never-throw degrade (D-09): a spawn fault or malformed output
      // degrades to a decisions-only LEARNINGS.md, the tool still resolves.
      const digestParts = [`Phase: ${phase.n} — ${phase.name}`, "", "## Decisions (deterministic, from CONTEXT.md)"];
      if (decisions.length) {
        for (const d of decisions) digestParts.push(`- ${d.id}: ${d.text}`);
      } else {
        digestParts.push("- (none)");
      }
      digestParts.push("", `## ${planSuffix}`, planText || "(absent)");
      digestParts.push("", `## ${summarySuffix}`, summaryText || "(absent)");
      if (verificationText !== undefined) digestParts.push("", "## VERIFICATION", verificationText);
      if (reviewText !== undefined) digestParts.push("", "## REVIEW", reviewText);
      if (coverageText !== undefined) digestParts.push("", "## COVERAGE", coverageText);
      const promptText = `${LEARNINGS_PROMPT}\n\n<phase_context>\n${digestParts.join("\n")}\n</phase_context>`;

      let resolved;
      let degradeCause = null;
      try {
        const r = await spawnSubagent(ctx, exec, { label: "gsd-learnings", promptText, outputSchema: LEARNINGS_SCHEMA });
        resolved = resolveLearningsOutput(r.structured);
        if (resolved.degraded.length) {
          degradeCause = "subagent returned malformed or missing structured output";
        }
      } catch (e) {
        degradeCause = (e && e.message) || String(e);
        resolved = { lessons: [], patterns: [], surprises: [], degraded: ["lessons", "patterns", "surprises"] };
      }

      // ── per-phase {NN}-LEARNINGS.md (D-03): frontmatter + four categories.
      const perPhaseFm = {
        phase: phase.n,
        project: projectCode,
        counts: {
          decisions: decisions.length,
          lessons: resolved.lessons.length,
          patterns: resolved.patterns.length,
          surprises: resolved.surprises.length,
        },
        missing_artifacts: missingArtifacts,
      };
      const perPhaseBody =
        `# Phase ${phase.n} — ${phase.name} - Learnings\n\n` + buildSections(decisions, resolved, degradeCause, "##");
      const perPhaseFull = stringifyFrontmatter(perPhaseFm) + "\n" + perPhaseBody;
      const perPhasePath = await s.writeArtifact(cwd, phase.n, "LEARNINGS", perPhaseFull);

      // ── root carrying-forward LEARNINGS.md (D-04, D-05): accumulate/replace.
      const phaseBlock = `## Phase ${phase.n} — ${phase.name}\n\n` + buildSections(decisions, resolved, degradeCause, "###");
      const newRoot = accumulateRootLearnings(rootText, phaseBlock, phase.n, phase.name, projectCode);
      const rootPath = await s.writeRootLearnings(cwd, newRoot);

      // ── audit trail (D-12): record a decision but do NOT advance STATE — a
      // pure report/accumulate, like gap-analysis and milestone-audit. Never call
      // setActivePhase.
      await s.addDecision(
        cwd,
        `Phase ${phase.n}: LEARNINGS.md extracted (decisions: ${decisions.length}, lessons: ${resolved.lessons.length}, patterns: ${resolved.patterns.length}, surprises: ${resolved.surprises.length})`,
      );

      // ── commit (D-11): the shared .planning-staging seam — no raw git.
      const commit = await commitArtifacts(cwd, phase.n, {
        message: `docs(planning): phase ${phase.n} learnings extract`,
        phaseName: phase.name,
        scope: "learnings",
      });
      const commitNote = commit.committed
        ? ` Artefacts committed (${commit.staged.length} file(s)).`
        : commit.warning
          ? ` (commit skipped: ${commit.warning})`
          : "";

      const degradeNote = degradeCause ? ` Subagent degraded to decisions-only — cause: ${degradeCause}.` : "";
      const missingNote = missingArtifacts.length ? ` Missing optional artifacts: ${missingArtifacts.join(", ")}.` : "";

      return `Learnings extracted for phase ${phase.n} (${phase.name}). Wrote ${perPhasePath} and ${rootPath}. Counts — decisions: ${decisions.length}, lessons: ${resolved.lessons.length}, patterns: ${resolved.patterns.length}, surprises: ${resolved.surprises.length}.${missingNote}${degradeNote}${commitNote}`;
    },
    presentCall: (a) => ({ card: "generic", title: `Extract learnings phase ${a.phase}`, kind: "other", rawInput: { phase: a.phase, force: a.force } }),
  }));
}

export { name, inject, apply };
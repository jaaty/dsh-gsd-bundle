// @dsh-gsd/bundle/mempalace — the cross-session memory loop step (opengsd
// /gsd-mempalace-recall / /gsd-mempalace-capture). A full loop-step plugin
// mirroring lib/learnings.js and lib/graphify.js (D-01):
//
// - publishes the gsdMempalace capability (order 55, after gsdGraphify 54; D-01)
// - registers the gsd_mempalace_recall tool ({ phase }) and the
//   gsd_mempalace_capture tool ({ phase, artifact })
// - talks to the external MemPalace service through an injectable CLI exec seam
//   (mempalaceFn, D-04) — no MCP, no subagent
// - is an ADVISORY SOFT GATE (D-08): it never advances STATE and never blocks a
//   loop step; every auto-hook is onError: skip
//
// D-03: opt-in via mempalace.enabled in config.json (default false). When not
// explicitly true, both tools print an activation hint and write NOTHING.
// D-05: recall resolves wing/mode and runs `mempalace wake-up --wing <wing>` +
// `mempalace search "<topic>" --wing <wing>`, distilling results into
// MEMORY-RECALL.md with Prior decisions / Patterns / Surprises sections, each
// item carrying provenance. Under augment the palace is an ADDITIVE layer —
// native memory (.planning/graphs/, LEARNINGS.md, STATE) stays authoritative.
// D-08: a CLI error/timeout is caught, the 'unavailable' stub is written, and
// the tool returns the real cause — never throws.
//
// The pure helpers (resolveWing / resolveMode / resolveRecallTopic /
// buildRecallDoc / buildStub) are exported with NO ctx / NO fs / NO git
// parameters so they are unit-testable directly (D-04/D-12). All I/O happens in
// apply().

import { defineTool } from "@deepseek-ai/dsh-tools";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { nowIso, stringifyFrontmatter, parseDecisionEntries } from "./_shared.js";
import { cwdOf } from "./_runner.js";
import { commitArtifacts } from "./_git-artifacts.js";
import { buildCapability } from "./_capabilities.js";

const name = "gsd-mempalace";
// DEGR-07: the sub-agent coeffect is deliberately ABSENT — mempalace spawns no
// subagent (D-04), so the fiber must not depend on the host sub-agent service.
// gsdState + tools mirror the other loop steps.
const inject = ["gsdState", "tools"];

const execFileP = promisify(execFile);

// The native memory that stays authoritative under augment (D-05/D-08).
const NATIVE_FALLBACK = ".planning/graphs/, LEARNINGS.md, STATE";

// ── pure helpers (no ctx, no I/O — unit-testable directly) ─────────────────────

// Resolve the MemPalace wing (D-05): config.mempalace.wing → project_code →
// repo directory name → "default".
export function resolveWing(cfg, projectCode, repoDirName) {
  return cfg?.mempalace?.wing || projectCode || repoDirName || "default";
}

// Resolve the memory mode (D-05/D-09): config.mempalace.memory_mode, default
// "augment" (the palace is an additive recall layer; native memory stays
// authoritative).
export function resolveMode(cfg) {
  return cfg?.mempalace?.memory_mode || "augment";
}

// Derive a short recall search topic from the phase CONTEXT title/goal/decisions
// (D-05). When CONTEXT is absent (discuss:pre — CONTEXT is written inside
// discuss), fall back to the ROADMAP phase goal (OQ-2). Pure.
export function resolveRecallTopic({ contextText, phaseGoal }) {
  const text = String(contextText || "").trim();
  if (!text) return String(phaseGoal || "").trim() || "recall";
  const titleMatch = text.match(/^#\s+Phase\s+\d+[:\s-]+\s*(.+)$/m);
  const title = titleMatch ? titleMatch[1].trim() : "";
  const decisions = parseDecisionEntries(text);
  const parts = [];
  if (title) parts.push(title);
  for (const d of decisions.slice(0, 2)) parts.push(d.text);
  const query = parts.join(" ").replace(/\s+/g, " ").trim();
  return query.slice(0, 120) || String(phaseGoal || "").trim() || "recall";
}

// Distil the raw mempalace search output into a MEMORY-RECALL.md body with
// Prior decisions / Patterns / Surprises sections, each item carrying provenance
// (drawer id / source). results is the raw search output string; lines are
// classified by keyword and attributed to the drawer id parsed from the output.
// nativeFallback names the native memory that stays authoritative under augment.
// Returns the full markdown body (frontmatter + sections). Pure.
export function buildRecallDoc({ wing, mode, topic, results, nativeFallback }) {
  const fm = stringifyFrontmatter({ phase: null, wing, mode, generated: nowIso(), topic });
  const lines = [
    "# MEMORY-RECALL",
    "",
    `**Wing:** ${wing}`,
    `**Mode:** ${mode}`,
    `**Topic:** ${topic}`,
    "",
    `_Recall from MemPalace (additive layer). Native memory stays authoritative: ${nativeFallback || NATIVE_FALLBACK}._`,
    "",
  ];
  const drawerMatch = String(results || "").match(/drawer:\s*(\S+)/i);
  const drawer = drawerMatch ? drawerMatch[1] : "unknown";
  const sections = { "Prior decisions": [], Patterns: [], Surprises: [] };
  for (const rawLine of String(results || "").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    if (/decision/i.test(line)) sections["Prior decisions"].push(line);
    else if (/pattern/i.test(line)) sections.Patterns.push(line);
    else if (/surprise/i.test(line)) sections.Surprises.push(line);
  }
  for (const [sectionName, items] of Object.entries(sections)) {
    lines.push(`## ${sectionName}`, "");
    if (items.length) {
      for (const it of items) lines.push(`- ${it} (drawer: ${drawer})`);
    } else {
      lines.push("_None recalled._");
    }
    lines.push("");
  }
  return fm + "\n" + lines.join("\n");
}

// The 'unavailable' stub written when the MemPalace CLI is unreachable (D-08).
// Names the native fallback and the real cause so the planner knows memory is
// not gone. Contains the literal 'unavailable' and 'native'. Pure.
export function buildStub({ wing, mode, cause }) {
  const fm = stringifyFrontmatter({ phase: null, wing, mode, generated: nowIso(), topic: null });
  return (
    fm +
    "\n" +
    [
      "# MEMORY-RECALL",
      "",
      "## Recall unavailable",
      "",
      `MemPalace CLI was unreachable (${cause}). Native memory is not gone — recall falls back to native memory: ${NATIVE_FALLBACK}.`,
      "",
    ].join("\n")
  );
}

// Map a phase artifact to its MemPalace room (D-06): CONTEXT→decisions,
// PLAN→planning, SUMMARY→milestones; anything else → general. Pure.
export function mapArtifactToRoom(artifact) {
  return { CONTEXT: "decisions", PLAN: "planning", SUMMARY: "milestones" }[artifact] || "general";
}

// Build the stage-tree entry for a captured artifact (D-06): staged VERBATIM
// under .mempalace-stage/<room>/<phase-id>/<artifact>.md. Pure — returns the
// relative path + the verbatim content; apply() does the I/O.
export function buildStageTree({ room, phaseId, artifactName, content }) {
  return { path: `.mempalace-stage/${room}/${phaseId}/${artifactName}`, content };
}

// The mempalace.yaml room taxonomy written to the stage dir root (D-06). Each
// `rooms:` entry MUST be a dict with a `name` key (a bare-string list crashes
// detect_room) — per RESEARCH (issue #1002 / PR #1004). detect_room() matches
// path parts against these names, so staging under <room>/<phase-id>/ routes
// correctly.
const ROOM_TAXONOMY = [
  "rooms:",
  "  - name: decisions",
  "  - name: planning",
  "  - name: milestones",
  "  - name: problems",
  "  - name: general",
  "",
].join("\n");

// ── the injectable CLI exec seam (D-04) ────────────────────────────────────────
// Defaults to an async promisify(execFile) wrapper over the `mempalace` binary.
// Every call uses a FIXED argument array (never a shell string, never
// model-supplied interpolation) — mirroring the gitFn discipline in
// lib/_git-artifacts.js. Tests inject a fake mempalaceFn so no real install is
// needed.
export async function defaultMempalaceFn(cwd, args) {
  return (await execFileP("mempalace", args, { cwd, encoding: "utf8" })).stdout.trim();
}

// ── apply: register the tools + publish the capability (all I/O here) ──────────
function apply(ctx) {
  const gsd = () => ctx.get("gsdState");

  // Publish this loop step's capability (DEGR-01/D-01). Auto-tracked
  // revertible effect: retiring the mempalace plugin withdraws gsdMempalace.
  ctx.provide("gsdMempalace", buildCapability("gsdMempalace"));

  ctx.tools.register(defineTool({
    name: "gsd_mempalace_recall",
    description:
      "Mempalace recall (opengsd /gsd-mempalace-recall): deliberate cross-session recall before discuss/plan. Resolves wing/mode, runs `mempalace wake-up --wing <wing>` + `mempalace search \"<topic>\" --wing <wing>` via an injectable CLI seam, and distils the results into MEMORY-RECALL.md (Prior decisions / Patterns / Surprises, each item with provenance). Under augment the palace is an ADDITIVE layer — native memory (.planning/graphs/, LEARNINGS.md, STATE) stays authoritative. Opt-in via mempalace.enabled in config.json. Advisory soft gate — never advances STATE. When the CLI is unreachable, writes an 'unavailable' stub and continues.",
    parameters: {
      phase: { type: "number", required: true },
    },
    output: { schema: { type: "string" }, render: (_a, v) => [{ type: "text", text: v }] },
    async execute(args, exec) {
      // ── fail-fast environmental guards (D-08), mirroring graphify.
      const cwd = cwdOf(exec);
      const s = gsd();
      if (!s) throw new Error("gsd_mempalace_recall: gsdState service unavailable");
      if (!(await s.isProject(cwd))) throw new Error("gsd_mempalace_recall: no .planning/ project — run gsd_init first");
      const roadmap = await s.readRoadmap(cwd);
      if (!roadmap) throw new Error("gsd_mempalace_recall: unreadable ROADMAP.md");
      const phase = roadmap.phases.find((p) => p.n === args.phase);
      if (!phase) throw new Error(`gsd_mempalace_recall: phase ${args.phase} not in ROADMAP`);

      // ── config gate (D-03): FIRST action after the guards, before any recall
      // or write. When mempalace.enabled is not explicitly true, print the
      // activation hint and STOP — write nothing.
      const cfg = await s.readConfig(cwd);
      if (cfg?.mempalace?.enabled !== true) {
        return "gsd_mempalace_recall: mempalace is disabled. Enable it by setting \"mempalace\": { \"enabled\": true } in .planning/config.json, then re-run.";
      }

      // ── recall (D-05): resolve wing/mode, derive the topic, run wake-up +
      // search via the injectable seam. A palace fault is caught (D-08): the
      // 'unavailable' stub is written and the real cause is surfaced — never throw.
      const wing = resolveWing(cfg, cfg?.project_code, String(cwd).split("/").filter(Boolean).pop() || "default");
      const mode = resolveMode(cfg);
      const contextText = await s.readArtifact(cwd, phase.n, "CONTEXT").catch(() => "");
      const topic = resolveRecallTopic({ contextText, phaseGoal: phase.goal });
      const mempalaceFn = ctx.mempalaceFn || defaultMempalaceFn;

      let results;
      try {
        await mempalaceFn(cwd, ["wake-up", "--wing", wing]);
        results = await mempalaceFn(cwd, ["search", topic, "--wing", wing]);
      } catch (e) {
        const cause = (e && e.message) || String(e);
        const stub = buildStub({ wing, mode, cause });
        const path = await s.writeArtifact(cwd, phase.n, "MEMORY-RECALL", stub);
        return `gsd_mempalace_recall: MemPalace CLI unreachable (${cause}). Wrote the 'unavailable' stub to ${path}. Native memory is not gone — recall falls back to native memory: ${NATIVE_FALLBACK}.`;
      }

      const doc = buildRecallDoc({ wing, mode, topic, results, nativeFallback: NATIVE_FALLBACK });
      const path = await s.writeArtifact(cwd, phase.n, "MEMORY-RECALL", doc);

      // ── audit trail (D-08): record a decision but do NOT advance STATE — a
      // pure recall, like gap-analysis and milestone-audit. Never call
      // setActivePhase.
      await s.addDecision(cwd, `Mempalace: recall for phase ${phase.n} (wing ${wing}, mode ${mode})`);

      // ── commit (D-04): the shared .planning-staging seam — no raw git.
      const commit = await commitArtifacts(cwd, phase.n, { scope: "mempalace", phaseName: phase.name });
      const commitNote = commit.committed
        ? ` Artefacts committed (${commit.staged.length} file(s)).`
        : commit.warning
          ? ` (commit skipped: ${commit.warning})`
          : "";

      return `Mempalace recall complete for phase ${phase.n} (${phase.name}). Wrote ${path}. Wing: ${wing}, mode: ${mode}, topic: "${topic}".${commitNote}`;
    },
    presentCall: (a) => ({ card: "generic", title: "Mempalace recall phase " + a.phase, kind: "other", rawInput: { phase: a.phase } }),
  }));

  ctx.tools.register(defineTool({
    name: "gsd_mempalace_capture",
    description:
      "Mempalace capture (opengsd /gsd-mempalace-capture): file a phase artifact verbatim into the MemPalace palace at a phase boundary. Maps artifact → room (CONTEXT→decisions, PLAN→planning, SUMMARY→milestones), stages the artifact VERBATIM under .planning/.mempalace-stage/<room>/<phase-id>/, and runs `mempalace mine <stage> --wing <wing>`. Idempotent via mine's content-hash. Opt-in via mempalace.enabled in config.json. Advisory soft gate — never advances STATE.",
    parameters: {
      phase: { type: "number", required: true },
      artifact: { type: "string", enum: ["CONTEXT", "PLAN", "SUMMARY"], required: true },
    },
    output: { schema: { type: "string" }, render: (_a, v) => [{ type: "text", text: v }] },
    async execute(args, exec) {
      // ── fail-fast environmental guards (D-08), mirroring graphify.
      const cwd = cwdOf(exec);
      const s = gsd();
      if (!s) throw new Error("gsd_mempalace_capture: gsdState service unavailable");
      if (!(await s.isProject(cwd))) throw new Error("gsd_mempalace_capture: no .planning/ project — run gsd_init first");
      const roadmap = await s.readRoadmap(cwd);
      if (!roadmap) throw new Error("gsd_mempalace_capture: unreadable ROADMAP.md");
      const phase = roadmap.phases.find((p) => p.n === args.phase);
      if (!phase) throw new Error(`gsd_mempalace_capture: phase ${args.phase} not in ROADMAP`);

      // ── config gate (D-03): FIRST action after the guards.
      const cfg = await s.readConfig(cwd);
      if (cfg?.mempalace?.enabled !== true) {
        return "gsd_mempalace_capture: mempalace is disabled. Enable it by setting \"mempalace\": { \"enabled\": true } in .planning/config.json, then re-run.";
      }

      // ── capture (D-06): read the artifact VERBATIM, map it to a room, stage it
      // under .planning/.mempalace-stage/<room>/<phase-id>/, write the room
      // taxonomy, and run `mempalace mine <stage> --wing <wing>` via the
      // injectable seam. Never writes lossy summaries (verbatim only) and never
      // throws on a palace fault (D-08).
      const wing = resolveWing(cfg, cfg?.project_code, String(cwd).split("/").filter(Boolean).pop() || "default");
      // The artifact arg is CONTEXT/PLAN/SUMMARY; PLAN/SUMMARY are plan-scoped
      // (read the first plan's PLAN-01 / SUMMARY-01).
      const readSuffix =
        args.artifact === "PLAN" ? "PLAN-01" : args.artifact === "SUMMARY" ? "SUMMARY-01" : args.artifact;
      const content = await s.readArtifact(cwd, phase.n, readSuffix).catch(() => undefined);
      if (content === undefined) {
        return `gsd_mempalace_capture: no ${args.artifact} artifact found for phase ${phase.n} — nothing to capture.`;
      }
      const room = mapArtifactToRoom(args.artifact);
      const { base: phaseId } = await s.phaseDirAndBase(cwd, phase.n);
      const artifactName = `${args.artifact}.md`;
      const stagePath = buildStageTree({ room, phaseId, artifactName, content }).path;
      // buildStageTree returns the full relative path (with the .mempalace-stage/
      // prefix, per D-06); writeMempalaceStage resolves relPath against the stage
      // dir, so strip the prefix before writing.
      const stageRel = stagePath.replace(/^\.mempalace-stage\//, "");
      await s.writeMempalaceStage(cwd, stageRel, content); // VERBATIM (D-06)
      await s.writeMempalaceStage(cwd, "mempalace.yaml", ROOM_TAXONOMY);

      const mempalaceFn = ctx.mempalaceFn || defaultMempalaceFn;
      let mineNote = "";
      try {
        await mempalaceFn(cwd, ["mine", s.mempalaceStageDir(cwd), "--wing", wing]);
        mineNote = ` Mined the stage dir into wing "${wing}".`;
      } catch (e) {
        const cause = (e && e.message) || String(e);
        return `gsd_mempalace_capture: MemPalace CLI unreachable (${cause}). Staged ${args.artifact} verbatim at ${stagePath} but could not mine it. Native memory is not gone.`;
      }

      // ── mirror_kg gating (D-06/OQ-1): the CLI has no KG command; KG mirroring
      // requires MCP (mempalace_kg_add), unavailable in this CLI-only bundle.
      // mirror_kg === false skips the step entirely; true/default reports the
      // limitation and never throws.
      let kgNote = "";
      if (cfg?.mempalace?.mirror_kg === false) {
        kgNote = " KG mirroring skipped (mirror_kg: false).";
      } else {
        kgNote = " KG mirroring requires MCP (mempalace_kg_add) — unavailable in this CLI-only bundle; no KG facts written this phase.";
      }

      // ── audit trail (D-08): record a decision but do NOT advance STATE — a
      // pure capture, like gap-analysis and milestone-audit. Never call
      // setActivePhase.
      await s.addDecision(cwd, `Mempalace: captured ${args.artifact} for phase ${phase.n} into room ${room}`);

      // ── commit (D-04): the shared .planning-staging seam — no raw git.
      const commit = await commitArtifacts(cwd, phase.n, { scope: "mempalace", phaseName: phase.name });
      const commitNote = commit.committed
        ? ` Artefacts committed (${commit.staged.length} file(s)).`
        : commit.warning
          ? ` (commit skipped: ${commit.warning})`
          : "";

      return `Mempalace capture complete for phase ${phase.n} (${phase.name}). Staged ${args.artifact} verbatim at ${stagePath} (room: ${room}, wing: ${wing}).${mineNote}${kgNote}${commitNote}`;
    },
    presentCall: (a) => ({ card: "generic", title: "Mempalace capture phase " + a.phase, kind: "other", rawInput: { phase: a.phase, artifact: a.artifact } }),
  }));
}

export { name, inject, apply };

// One-off headless replay of lib/phase-management-plugin.js execute(action=add).
// Justification: the LIVE dsh host process serving the gsd_phase tool cached
// lib/_shared.js at session start, before the parseRequirements multi-segment
// REQ-ID fix landed — so the in-process validator still rejects SHIP-CLEAN-01.
// This script runs the EXACT same code path (applyPhaseAction → writeRoadmap →
// recomputeProgress → addDecision → commitArtifacts) against the fixed modules.
// Deleted after use.
import { pathToFileURL } from "node:url";
import { GsdState } from "../lib/state.js";
import { applyPhaseAction } from "../lib/phase-management.js";
import { commitArtifacts } from "../lib/_git-artifacts.js";
import fsp from "node:fs/promises";

const cwd = process.cwd();
const fsAdapter = {
  async resolve(p) { return p; },
  async stat(p) { try { return await fsp.stat(p); } catch { return null; } },
  async readText(p) { return fsp.readFile(p, "utf8"); },
  async writeText(p, content) { await fsp.writeFile(p, content); },
};
const s = new GsdState({ fs: fsAdapter });

const reqIds = new Set((await s.readRequirements(cwd)).map((r) => r.id));
const roadmap = await s.readRoadmap(cwd);
if (!roadmap) throw new Error("ROADMAP.md missing or unparseable");
const stateDoc = await s.readState(cwd);
const activePhase = stateDoc?.frontmatter?.active_phase ?? null;

const res = applyPhaseAction(
  roadmap,
  {
    op: "add",
    name: "review-fix-companion",
    goal: "Fix the gsd_code_review --fix companion so applying REVIEW.md findings works in live sessions and lands per-fix atomic commits into REVIEW-FIX.md.",
    requirements: ["CLH-09"],
  },
  { reqIds, activePhase, confirm: false },
);
if (res.ok === false) throw new Error(`applyPhaseAction failed: ${res.error} (${res.code})`);

await s.writeRoadmap(cwd, res.doc);
await s.recomputeProgress(cwd);
await s.addDecision(cwd, `Phase management add: ${res.doc.phases.length} phase(s) now`);

const commit = await commitArtifacts(cwd, null, {
  scope: "phase-management",
  message: "docs(planning): phase-management add via gsd_phase",
});
const added = res.doc.phases[res.doc.phases.length - 1];
console.log(`added phase ${added.n} (${added.name}) requirements=${added.requirements.join(",")}`);
console.log(`committed: ${commit.committed} (${commit.staged.length} file(s))${commit.warning ? " WARNING: " + commit.warning : ""}`);
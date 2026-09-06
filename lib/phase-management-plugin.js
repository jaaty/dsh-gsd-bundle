// @dsh-gsd/bundle/phase-management — the out-of-band gsd_phase loop-step plugin
// (CLH-01). Publishes the gsdPhaseManagement capability, registers the gsd_phase
// tool that reads ROADMAP/REQUIREMENTS/STATE, parses the per-action flags, runs
// applyPhaseAction fail-closed (D-06), then writes ROADMAP, recomputes STATE
// progress (D-05), and commits atomically via commitArtifacts (D-06).
//
// Deterministic pure-JS path — no sub-agent is spawned (DEGR-07), mirroring
// lib/health.js. The plugin injects only ['gsdState','tools'] and never calls
// setActivePhase / advances the loop (out-of-band, like undo/health).

import { defineTool } from "@deepseek-ai/dsh-tools";
import { cwdOf } from "./_runner.js";
import { commitArtifacts, defaultGitFn } from "./_git-artifacts.js";
import { buildCapability } from "./_capabilities.js";
import { applyPhaseAction } from "./phase-management.js";

const name = "gsd-phase-management";
// DEGR-07: the sub-agent coeffect is deliberately ABSENT — phase CRUD is a
// deterministic pure-JS mutation (D-06), so the fiber must not depend on the
// host sub-agent service. gsdState + tools mirror the other loop steps.
const inject = ["gsdState", "tools"];

function apply(ctx) {
  const gsd = () => ctx.get("gsdState");

  // Publish the gsdPhaseManagement capability (DEGR-01). Auto-tracked
  // revertible effect: retiring the plugin withdraws gsdPhaseManagement.
  ctx.provide("gsdPhaseManagement", buildCapability("gsdPhaseManagement"));

  ctx.tools.register(defineTool({
    name: "gsd_phase",
    description: "Phase management (opengsd /gsd-phase-manage): add, insert, remove, reorder, or edit phases directly in ROADMAP.md with validation and integrity checks. Reads ROADMAP/REQUIREMENTS/STATE, runs the CRUD mutation fail-closed (D-06), regenerates the ## Progress table and recomputes STATE progress (D-05), and commits ROADMAP + STATE atomically. Out-of-band — does not mutate STATE.md loop position.",
    parameters: {
      action: { type: "string", enum: ["add", "insert", "remove", "reorder", "edit"], required: true },
      name: { type: "string" },
      goal: { type: "string" },
      requirements: { type: "array", items: { type: "string" } },
      at: { type: "number" },
      n: { type: "number" },
      to: { type: "number" },
      status: { type: "string", enum: ["Complete", "pending"] },
      yes: { type: "boolean" },
    },
    output: { schema: { type: "string" }, render: (_a, v) => [{ type: "text", text: v }] },
    async execute(args, exec) {
      // Fail-fast environmental guards (D-09), mirroring health/gap-analysis.
      const cwd = cwdOf(exec);
      const s = gsd();
      if (!s) throw new Error("gsd_phase: gsdState service unavailable");
      if (!(await s.isProject(cwd))) throw new Error("gsd_phase: no .planning/ project — run gsd_init first");

      // D-04: ROADMAP must parse before any mutation.
      const roadmap = await s.readRoadmap(cwd);
      if (!roadmap) throw new Error("gsd_phase: ROADMAP.md is missing or unparseable");

      // Authoritative REQ-ID set (D-04) + the in-flight phase (D-03/D-08).
      const reqs = await s.readRequirements(cwd);
      const reqIds = new Set(reqs.map((r) => r.id));
      const stateDoc = await s.readState(cwd);
      const activePhase = stateDoc?.frontmatter?.active_phase ?? null;

      // Map the tool args into the pure-domain action object.
      let action;
      if (args.action === "add" || args.action === "insert") {
        action = {
          op: args.action,
          name: args.name,
          goal: args.goal,
          requirements: args.requirements || [],
          status: args.status,
          ...(args.action === "insert" ? { at: args.at } : {}),
        };
      } else {
        action = {
          op: args.action,
          n: args.n,
          ...(args.action === "reorder" ? { to: args.to } : {}),
          ...(args.action === "edit"
            ? { name: args.name, goal: args.goal, requirements: args.requirements, status: args.status }
            : {}),
        };
      }

      // D-06 fail-closed gate: run every hard check on the proposed mutated doc
      // BEFORE any write. On failure NOTHING has been written yet.
      const res = applyPhaseAction(roadmap, action, { reqIds, activePhase, confirm: args.yes === true });
      if (res.ok === false) {
        throw new Error(`gsd_phase ${args.action} failed: ${res.error} (${res.code})`);
      }

      // Write ROADMAP — stringifyRoadmap regenerates the phase table AND its
      // ## Progress table from the same phases array (D-05).
      await s.writeRoadmap(cwd, res.doc);

      // If the active phase itself was removed, clear the dangling active_phase
      // BEFORE recompute so STATE never points at a removed phase.
      if (args.action === "remove" && Number(args.n) === Number(activePhase)) {
        await s.updateStateFrontmatter(cwd, { active_phase: null, current_phase: null });
      }

      // D-05: recompute STATE progress from the roadmap (single source of truth).
      await s.recomputeProgress(cwd);

      // Record a decision (mirrors the health addDecision pattern).
      await s.addDecision(cwd, `Phase management ${args.action}: ${res.doc.phases.length} phase(s) now`);

      // D-06: one atomic commit of ROADMAP + STATE (+ Progress) via the shared
      // git seam. phaseNum is NULL (out-of-band multi-phase mutation) with a
      // message override. No ensurePhaseBranch — out-of-band, like undo/health.
      const gitFn = ctx.gitFn || defaultGitFn;
      const commit = await commitArtifacts(cwd, null, {
        scope: "phase-management",
        message: `docs(planning): phase-management ${args.action} via gsd_phase`,
      }, gitFn);

      let note = ` Committed: ${commit.committed} (${commit.staged.length} file(s)).`;
      if (commit.warning) note += ` WARNING: ${commit.warning}.`;

      return `Phase management ${args.action} complete: ${res.doc.phases.length} phase(s) now.${note}`;
    },
    presentCall: (a) => ({
      card: "generic",
      title: "Phase management",
      kind: "other",
      rawInput: { ...a },
    }),
  }));
}

export { name, inject, apply };

// @dsh-gsd/bundle/commands — the opengsd `/gsd-*` slash-command layer.
//
// opengsd's command files are thin routers to workflow files. Here each command
// is a thin router to the corresponding GSD tool: it injects a user-role message
// into the calling agent's inbox (agent.followup) instructing it to run the
// matching gsd_* tool, then returns a short success ack. The agent — already a
// GSD phase-loop driver via gsd-persona — wakes on the followup and runs the
// step. This gives you both UXes: `/gsd-plan-phase 1` and natural language.
//
// Commands: /gsd-init, /gsd-status, /gsd-progress, /gsd-discuss-phase,
// /gsd-spec-phase, /gsd-ui-phase, /gsd-plan-phase, /gsd-gap-analysis,
// /gsd-execute-phase, /gsd-code-review, /gsd-verify-work, /gsd-ship,
// /gsd-quick, /gsd-map-codebase, /gsd-new-milestone.

import { createUserMessage } from "@deepseek-ai/dsh-llm";
import { allCapabilities } from "./_capabilities.js";

const name = "gsd-commands";
const inject = ["commands"];

function phaseNum(raw) {
  const m = String(raw || "").trim().match(/^(\d+)/);
  return m ? Number(m[1]) : null;
}

function send(agent, text) {
  agent.followup(createUserMessage({
    content: [{ type: "text", text }],
    source: { kind: "user" },
  }));
}

// Each command: name, description, optional input hint, and a builder that
// turns rawInput into either an {err} or an {text, ack} to route to the agent.
const COMMANDS = [
  {
    name: "gsd-init",
    description: "Initialise a Git Ship Done project (.planning/...). Optional: a project brief.",
    hint: "[project brief]",
    build: (raw) => ({
      text: `Run the gsd_init tool to bootstrap a Git Ship Done project in this workspace.${raw.trim() ? ` Use this brief as the project description and derive an initial milestone, requirements (REQ-IDs), and phases from it: ${raw.trim()}` : " Ask me what I want to build, then propose a roadmap before calling the tool."}`,
      ack: "Bootstrapping GSD project via gsd_init.",
    }),
  },
  {
    name: "gsd-status",
    description: "Show the current GSD loop position (reads STATE.md).",
    build: () => ({
      text: "Run the gsd_status tool and report the current GSD loop position: active milestone, phase, step, recent decisions, blockers, and the phase list.",
      ack: "Showing GSD status via gsd_status.",
    }),
  },
  {
    name: "gsd-progress",
    description: "Show GSD progress; optional phase number for plan-level detail.",
    hint: "[phase]",
    build: (raw) => {
      const n = phaseNum(raw);
      return {
        text: `Run the gsd_progress tool${n ? ` with phase ${n} for plan-level detail` : ""} and report progress.`,
        ack: `GSD progress${n ? ` (phase ${n})` : ""} via gsd_progress.`,
      };
    },
  },
  {
    name: "gsd-discuss-phase",
    description: "Discuss phase N: hold the decision interview, then seal CONTEXT.md.",
    hint: "<N>",
    build: (raw) => {
      const n = phaseNum(raw);
      if (!n) return { err: "Usage: /gsd-discuss-phase <N>" };
      return {
        text: `Run the GSD Discuss step on phase ${n}. Identify the grey areas in the phase scope, hold a lightweight interview with me (libraries, error-handling strategy, per-route vs global, edge-case behaviour), then call the gsd_discuss tool to seal CONTEXT.md for phase ${n}.`,
        ack: `Discuss phase ${n} → gsd_discuss.`,
      };
    },
  },
  {
    name: "gsd-spec-phase",
    description: "Spec phase N: clarify WHAT the phase delivers (Socratic interview or --auto), seal SPEC.md.",
    hint: "<N> [--auto]",
    build: (raw) => {
      const n = phaseNum(raw);
      if (!n) return { err: "Usage: /gsd-spec-phase <N> [--auto]" };
      const auto = /--auto/.test(raw);
      return {
        text: `Run the GSD Spec step on phase ${n}. ${auto ? "Derive recommended defaults from the ROADMAP/REQUIREMENTS" : "Clarify WHAT phase ${n} delivers by holding a Socratic interview with me (Goal, Boundary, Constraints, Acceptance Criteria)"} until the requirements are falsifiable (each with Current/Target/Acceptance), then call the gsd_spec_phase tool to seal SPEC.md for phase ${n} gated by the ambiguity-scoring score.`,
        ack: `Spec phase ${n} → gsd_spec_phase.`,
      };
    },
  },
  {
    name: "gsd-ui-phase",
    description: "UI design phase N: produce UI-SPEC.md (optional, between Discuss and Plan).",
    hint: "<N>",
    build: (raw) => {
      const n = phaseNum(raw);
      if (!n) return { err: "Usage: /gsd-ui-phase <N>" };
      return { text: `Run the gsd_ui_phase tool on phase ${n} to produce a UI-SPEC.md design contract.`, ack: `UI phase ${n} → gsd_ui_phase.` };
    },
  },
  {
    name: "gsd-plan-phase",
    description: "Plan phase N: research → plan → verify (fresh-context subagents, revision loop).",
    hint: "<N>",
    build: (raw) => {
      const n = phaseNum(raw);
      if (!n) return { err: "Usage: /gsd-plan-phase <N>" };
      return {
        text: `Run the gsd_plan tool on phase ${n}: researcher → planner → plan-checker fresh-context subagents with the 3-iteration revision loop. Report the wave plan and any uncovered requirements.`,
        ack: `Plan phase ${n} → gsd_plan.`,
      };
    },
  },
  {
    name: "gsd-gap-analysis",
    description: "Gap analysis phase N: emit a REQ-ID/D-ID vs plan coverage table (COVERAGE.md) after planning.",
    hint: "<N>",
    build: (raw) => {
      const n = phaseNum(raw);
      if (!n) return { err: "Usage: /gsd-gap-analysis <N>" };
      return {
        text: `Run the gsd_gap_analysis tool on phase ${n} to emit the post-planning coverage table (REQ-ID + D-ID vs plan bodies) and write COVERAGE.md.`,
        ack: `Gap analysis phase ${n} → gsd_gap_analysis.`,
      };
    },
  },
  {
    name: "gsd-execute-phase",
    description: "Execute phase N: wave-based fresh-context executors, atomic commits.",
    hint: "<N> [--wave N] [--gaps-only]",
    build: (raw) => {
      const n = phaseNum(raw);
      if (!n) return { err: "Usage: /gsd-execute-phase <N>" };
      const wave = (raw.match(/--wave\s+(\d+)/) || [])[1];
      const gaps = /--gaps-only/.test(raw);
      const opts = [wave ? `wave ${wave}` : "", gaps ? "gaps-only" : ""].filter(Boolean).join(", ");
      return {
        text: `Run the gsd_execute tool on phase ${n}${opts ? ` (${opts})` : ""}: wave-based fresh-context executors, atomic per-task commits, SUMMARY.md.`,
        ack: `Execute phase ${n} → gsd_execute.`,
      };
    },
  },
  {
    name: "gsd-code-review",
    description: "Code review phase N: review changed source into REVIEW.md (optional --fix/--all/--auto, --depth, --files).",
    hint: "<N> [--fix] [--all] [--auto] [--depth=quick|standard|deep] [--files=f1,f2]",
    build: (raw) => {
      const n = phaseNum(raw);
      if (!n) return { err: "Usage: /gsd-code-review <N>" };
      const fix = /--fix/.test(raw);
      const all = /--all/.test(raw);
      const auto = /--auto/.test(raw);
      const depth = (raw.match(/--depth\s+(\S+)/) || [])[1];
      const files = (raw.match(/--files\s+(\S+)/) || [])[1];
      const opts = [fix ? "fix" : "", all ? "all" : "", auto ? "auto" : "", depth ? `depth ${depth}` : "", files ? `files ${files}` : ""].filter(Boolean).join(", ");
      return {
        text: `Run the gsd_code_review tool on phase ${n}${opts ? ` (${opts})` : ""}: a fresh-context reviewer subagent reviews the phase's changed source and writes REVIEW.md${fix || all || auto ? " then applies fixes with per-fix atomic commits into REVIEW-FIX.md" : ""}.`,
        ack: `Code review phase ${n} → gsd_code_review.`,
      };
    },
  },
  {
    name: "gsd-ui-review",
    description: "UI review phase N: retroactive 6-pillar UI audit into UI-REVIEW.md (optional --mode=re-audit|view).",
    hint: "<N> [--mode=re-audit|view]",
    build: (raw) => {
      const n = phaseNum(raw);
      if (!n) return { err: "Usage: /gsd-ui-review <N> [--mode=re-audit|view]" };
      const mode = (raw.match(/--mode\s+(\S+)/) || [])[1];
      const opts = mode ? ` with mode ${mode}` : "";
      return {
        text: `Run the gsd_ui_review tool on phase ${n}${opts}: a fresh-context gsd-ui-auditor subagent audits the phase's frontend code against the UI-SPEC (or abstract 6-pillar standards) and writes UI-REVIEW.md with 6 pillar scores /24.`,
        ack: `UI review phase ${n} → gsd_ui_review.`,
      };
    },
  },
  {
    name: "gsd-verify-work",
    description: "Verify phase N: verifier → VERIFICATION.md, route on status.",
    hint: "<N>",
    build: (raw) => {
      const n = phaseNum(raw);
      if (!n) return { err: "Usage: /gsd-verify-work <N>" };
      return { text: `Run the gsd_verify tool on phase ${n} and report the verification status (passed / gaps_found / human_needed) and the routing.`, ack: `Verify phase ${n} → gsd_verify.` };
    },
  },
  {
    name: "gsd-validate-phase",
    description: "Validate phase N: retro test-coverage audit into VALIDATION.md (run after verify, before ship).",
    hint: "<N> [--auto]",
    build: (raw) => {
      const n = phaseNum(raw);
      if (!n) return { err: "Usage: /gsd-validate-phase <N> [--auto]" };
      const auto = /--auto/.test(raw);
      return {
        text: `Run the gsd_validate_phase tool on phase ${n}${auto ? " with --auto (bypass the gap-plan confirmation)" : ""}: a deterministic requirement→test coverage scan classifies every phase requirement COVERED/PARTIAL/MISSING/Manual-Only and writes VALIDATION.md, then advances STATE to the validate step.`,
        ack: `Validate phase ${n} → gsd_validate_phase.`,
      };
    },
  },
  {
    name: "gsd-undo",
    description: "Undo (roll back) a phase's or plan's commits via git revert. Dry-run by default; confirm:true executes.",
    hint: "<N> [plan <PP>] [--confirm]",
    build: (raw) => {
      const n = phaseNum(raw);
      if (!n) return { err: "Usage: /gsd-undo <N> [plan <PP>] [--confirm]" };
      const planMatch = raw.match(/plan\s+(\d+)/i);
      const plan = planMatch ? planMatch[1] : undefined;
      const confirm = /--confirm/.test(raw);
      return {
        text: "Run the gsd_undo tool on phase " + n + (plan ? " plan " + plan : "") + (confirm ? " with confirm:true to execute the reverts" : " (dry-run — no confirm, will show what would be reverted") + ".",
        ack: "Undo phase " + n + " → gsd_undo.",
      };
    },
  },
  {
    name: "gsd-ship",
    description: "Ship phase N: preflight gates, push, create PR, update STATE.",
    hint: "<N> [--draft]",
    build: (raw) => {
      const n = phaseNum(raw);
      if (!n) return { err: "Usage: /gsd-ship <N>" };
      const draft = /--draft/.test(raw);
      return { text: `Run the gsd_ship tool on phase ${n}${draft ? " as a draft PR" : ""}.`, ack: `Ship phase ${n} → gsd_ship.` };
    },
  },
  {
    name: "gsd-quick",
    description: "Quick sub-threshold task: one fresh-context subagent, atomic commit.",
    hint: "<task>",
    build: (raw) => {
      if (!raw.trim()) return { err: "Usage: /gsd-quick <task>" };
      return { text: `Run the gsd_quick tool for this task: ${raw.trim()}`, ack: "Quick task → gsd_quick." };
    },
  },
  {
    name: "gsd-map-codebase",
    description: "Map the existing codebase: parallel mapper agents → .planning/codebase/ (7 docs).",
    hint: "[--fast [--focus tech|arch|quality|concerns|tech+arch]] [--paths p1,p2] [--query <question>] [area]",
    build: (raw) => {
      const fast = /--fast\b/.test(raw);
      const focus = (raw.match(/--focus\s+(\S+)/) || [])[1];
      const paths = (raw.match(/--paths\s+(\S+)/) || [])[1];
      const qm = raw.match(/--query\s+([\s\S]+)$/);
      const query = qm ? qm[1].trim() : "";
      if (query) {
        return {
          text: `Run the gsd_map_codebase tool to answer this question against the existing codebase map: ${query}`,
          ack: "Querying codebase → gsd_map_codebase.",
        };
      }
      const opts = [fast ? "fast" : "", focus ? `focus ${focus}` : "", paths ? `paths ${paths}` : ""].filter(Boolean).join(", ");
      return {
        text: `Run the gsd_map_codebase tool to map this codebase${opts ? ` (${opts})` : ""}: parallel fresh-context mapper agents write structured documents directly to .planning/codebase/. If the map already exists, pass force=true to refresh.`,
        ack: `Mapping codebase${opts ? ` (${opts})` : ""} → gsd_map_codebase.`,
      };
    },
  },
  {
    name: "gsd-new-milestone",
    description: "Start a new milestone: append phases to ROADMAP.",
    hint: "<name> <version>",
    build: (raw) => {
      if (!raw.trim()) return { err: "Usage: /gsd-new-milestone <name> <version>" };
      return {
        text: `Start a new GSD milestone. Ask me for the milestone name, version, the new phases (each a single-sentence goal plus the REQ-IDs it addresses), and any new requirements, then call gsd_new_milestone. Seed input: ${raw.trim()}`,
        ack: "New milestone → gsd_new_milestone.",
      };
    },
  },
];

function apply(ctx) {
  // Pair each /gsd-* command name with the capability that owns it (D-04):
  // iterate the capability descriptors and map every command a descriptor
  // advertises back to that descriptor's capability key. gsdJobs advertises no
  // command (commands = []), so it contributes no pairing (D-07).
  const commandToCapability = new Map();
  for (const cap of allCapabilities()) {
    for (const cmd of cap.commands) commandToCapability.set(cmd, cap.key);
  }

  // Register each command from its own sub-fiber whose inject pairs the owning
  // step capability with the host "commands" service (D-07/D-08). The sub-fiber
  // activates only when the step capability is present; an absent step leaves it
  // inactive so its command is never registered, and retiring the step capability
  // reactively withdraws the sub-fiber and truly unregisters the command (DEGR-03).
  // The sub-fiber apply registers exactly one command and returns the disposer
  // from ctx.commands.register so the sub-fiber's unload reverts it.
  for (const c of COMMANDS) {
    const capKey = commandToCapability.get(c.name);
    ctx.inject([capKey, "commands"], (subCtx) =>
      subCtx.commands.register({
        name: c.name,
        description: c.description,
        ...(c.hint ? { input: { hint: c.hint } } : {}),
        handler(invocation) {
          const built = c.build(invocation.rawInput);
          if (built.err) return { kind: "error", text: built.err };
          if (!invocation.agent) return { kind: "error", text: "No active agent to route the GSD command to." };
          send(invocation.agent, built.text);
          return { kind: "success", text: built.ack };
        },
      }),
    );
  }
}

export { name, inject, apply };
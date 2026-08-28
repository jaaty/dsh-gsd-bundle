// @dsh-gsd/bundle/persona — the GSD phase-loop persona and runtime-context.
//
// This is the behavioral replacement for the default agent loop: it does not
// reimplement the turn machine in @deepseek-ai/dsh-agent-loop (that stays as
// the mechanical loop — tool scheduling, context assembly, session prep are
// DSH's core, not opengsd-core). Instead it installs the Git Ship Done mental
// model as the agent's persona and orients every model step at the current
// position in the phase loop by reading .planning/STATE.md.
//
// opengsd-core structures all work as a repeating cycle, one phase at a time:
//   Discuss -> (UI design) -> Plan -> Execute -> Verify -> Ship
// Each step guards against a failure the previous step cannot prevent, and
// .planning/ carries the artefacts across sessions and context resets.

import { renderPersonaBody, availableCapabilities } from "./_render.js";

const SECTION_ORDER_PERSONA = -100; // render before the deployment persona slot
const CONTEXT_ORDER_GSD = 10;

/**
 * Render the current loop position for the runtime-context snapshot.
 * Synchronous: reads from the gsdState in-memory cache, which is updated on
 * every artefact write. When no project is initialised for this cwd, render a
 * brief orientation hint instead of a stale or empty snapshot.
 */
function renderStateContext(context, gsdState) {
  if (!gsdState) return "";
  const cwd = context.agent?.session?.header?.cwd;
  if (!cwd) return "";
  const snap = gsdState.cachedState(cwd);
  if (!snap || !snap.initialised) {
    return "GSD: no .planning/ project found in this workspace. If the user wants to start GSD work, run gsd_init (writes ROADMAP.md + STATE.md); otherwise answer normally. For work below the loop threshold, use gsd_quick.";
  }
  const phase = snap.activePhase
    ? `milestone ${snap.activeMilestone ?? "?"} / phase "${snap.activePhase}" / step ${snap.activeStep ?? "discuss"}`
    : `milestone ${snap.activeMilestone ?? "?"} / no active phase`;
  const line = `GSD loop position: ${phase}. Active milestone: ${snap.activeMilestone ?? "none"}. Use gsd_status for the full STATE.md. This position is informational only — do NOT advance to the next step until the user issues an explicit command for it.`;
  return line;
}

const name = "gsd-persona";
const inject = ["systemPrompt"];

function apply(ctx) {
  // The persona section — the GSD phase-loop mental model. Order -100 renders
  // it before the deployment persona slot (order 0), so it frames the agent.
  // The body is a per-assembly function (RESEARCH OQ-1: section.text supports
  // function bodies): it reads the present step capabilities NON-reactively via
  // ctx.get (never inject — D-03) and renders the static core + only the
  // present-step paragraphs, so an absent step is dropped entirely. The
  // try/catch mirrors the gsd:state provider's never-throw discipline (D-07).
  ctx.systemPrompt.section({
    name: "gsd:persona",
    order: SECTION_ORDER_PERSONA,
    text: (context) => {
      try {
        const caps = availableCapabilities((k) => ctx.get(k));
        return renderPersonaBody(caps);
      } catch {
        return "";
      }
    },
  });

  // The runtime-context contribution: where in the loop this session sits.
  // gsdState is optional at registration time (it activates later); the
  // provider is re-evaluated at every assembly, by which point it is present.
  ctx.systemPrompt.context({
    name: "gsd:state",
    order: CONTEXT_ORDER_GSD,
    text: (context) => {
      const gsdState = ctx.get("gsdState");
      try {
        return renderStateContext(context, gsdState);
      } catch {
        return "";
      }
    },
  });
}

export { name, inject, apply };
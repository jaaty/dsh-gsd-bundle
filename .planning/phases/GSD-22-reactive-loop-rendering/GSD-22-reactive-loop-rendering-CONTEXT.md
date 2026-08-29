# Phase 22: reactive-loop-rendering - Context

**Gathered:** 2026-08-28T23:41:17.734Z
**Status:** Ready for planning

<domain>
## Phase Boundary
**In scope:** Re-render the persona body and the runtime-context 'GSD loop position' snapshot, gsd_status's next-action/step routing, and the STATE.md step route from the set of currently-available loop-step capabilities, so absent steps are skipped and no missing tool is ever instructed. Consumes the 10 capability services published in phase 21 (10 x ctx.provide). Delivers DEGR-02 (persona + snapshot skip absent steps) and DEGR-04 (gsd_status + step machine route only through available steps).
**Out of scope:** Broken-chain detection using produces/consumes (e.g. plan absent => execute cannot run) — stays deferred (user decision). The automated per-plugin removal test suite (DEGR-05 = phase 23). Job live-registry effect-scoping and the subagents coeffect (DEGR-06/07 = phase 24). Any change to tool behaviour, the .planning/ artefact model, or the milestone/phase/requirement tracking model.
</domain>

<decisions>
## Decisions
### Persona body reactivity (DEGR-02)
- **D-01:** Persona is rendered from capabilities with a static-core + conditional-per-step structure. Keep an unconditional core (the opening framing, scoping discipline, operating rules, .planning/ discipline) that names NO specific gsd_ tool; render each per-step 'why this step exists' paragraph AND its named tools only when the matching capability (gsdDiscuss, gsdUi, gsdPlan, gsdExecute, gsdVerify, gsdShip; and the gsdQuick/gsdMapCodebase alt/onboarding rows) is present. Absent steps are dropped entirely.
- **D-02:** Tool-name mentions in the persona prose are capability-gated: a paragraph may only reference a gsd_* tool that belongs to a present capability. The static core may reference only tools guaranteed by non-loop, always-orient capabilities (gsd_status/gsd_status via gsdOrient) or speak generically ('the gsd_* loop tools'). Executor maps each prose tool mention to its capability key from lib/_capabilities.js (single source of truth).
- **D-03:** Runtime-context snapshot (the 'GSD loop position' line from renderStateContext) becomes reactive: it renders the STATE.md position AND the ordered list of currently-available loop steps (filtered by role=step/optional/alternate and sorted by order), omitting absent steps, and never instructs an absent step. It is assembly-fresh: reads capabilities via ctx.get each provider evaluation, exactly the phase-21 D-06 strategy. Capabilities are NOT added to persona's inject (a required coeffect would deactivate the persona fiber when any step is missing — the opposite of graceful).
### gsd_status routing (DEGR-04)
- **D-04:** gsd_status becomes capability-aware at read time: it filters/rewrites the stored next_action relative to the currently-available step capabilities (a next_action whose command's capability is absent is replaced/recomputed to the nearest available step or an explicit 'no available loop step' message), and adds an 'Available steps:' section listing the present loop steps (role step/optional/alternate, ordered) plus orient/jobs/onboarding as informational. Unavailable steps are never advertised as actionable.
- **D-05:** The STATE.md step machine routes only through available steps via a read-time, ctx-aware wrapper, NOT by changing lib/state.js writes. state.js stays a pure artifact model (no ctx, no capability knowledge). A ctx-aware layer (helper) takes the available step capability keys and the stored step/next_action and computes the effective routable step, which both gsd_status and the persona snapshot consume. The loop never advertises/advances into an absent step even if STATE.md on disk still records it.
- **D-06:** Zero-loop fallback: when no loop step capability is present (all step plugins retired; only orient/jobs/quick/map remain), the persona shows the static core + an explicit 'no loop steps available' notice, the snapshot shows a clear no-available-step line, and gsd_status replaces next_action with 'no available loop step' — all without crashing and without instructing a missing tool.
### Error handling / edge cases
- **D-07:** Reuse phase-21 D-10: fail loud at capability registration (already in phase 21), degrade graceful at read. Renderers skip absent capabilities and log-and-skip a capability present with an unexpected role, never throwing during prompt assembly or gsd_status rendering. Reads funnel through the ctx-aware wrapper, which never throws over an absent or malformed capability.
- **D-08:** The order of the 'Available steps' rendering is stable and matches phase-21 D-11 order (map 0, orient/jobs sentinel not loop-ordered, discuss 10 -> ui 15 -> plan 20 -> quick 25 -> execute 30 -> verify 40 -> ship 50), produced by reusing the CAPABILITY_KEYS ordering and the descriptor.order field from lib/_capabilities.js.
### Implementation seam / reuse
- **D-09:** Add a ctx-aware render/routing helper (new pure-ish module or fold into lib/_capabilities.js, executor's call, following the lib/_shared.js pure-helper pattern) that: (1) reads available step capability keys via ctx.get from the descriptor's tools/commands/order, (2) filters/presents the loop-step list, (3) computes the effective routable next step given a stored step + available keys. persona.js and core-tools.js (gsd_status) both consume it, so the available-step logic is single-sourced, not duplicated.
- **D-10:** produces/consumes and prereq/next remain advisory metadata in phase 22; broken-chain enforcement is deferred (user decision). The step machine considers a step routable only if its capability is present, not if its prerequisite artefact exists.
### Testing
- **D-11:** Testing extends the existing test/mount.test.mjs fake-ctx harness (which already provides the capability services and ctx.get): add subset-mount scenarios that apply a chosen subset of plugins and assert (a) the persona body + snapshot omit absent steps and never name their tools, (b) gsd_status hides/replaces next_action for absent capabilities and shows the correct Available-steps section, and (c) the zero-loop and partial-loop cases degrade gracefully. The full per-plugin removal suite is phase 23 (DEGR-05), NOT this phase.
### Claude's Discretion
- Exact module placement of the ctx-aware render/routing helper (new lib/_render.js vs a function in lib/_capabilities.js), provided it is a single shared consumer for both persona and gsd_status.
- The precise prose wording of the static core and per-step paragraphs, as long as absent steps/tools are entirely omitted and the ordering matches CAPABILITY_KEYS.
- Where and how the snapshot/gsd_status surface the available-step line (inline annotation vs a new section), consistent with D-04/D-06.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Consumed capability surface (phase 21)
- `.planning/phases/GSD-21-capability-services/GSD-21-capability-services-CONTEXT.md — D-01..D-12: capability keys, descriptor shape (tools/commands/order/role/prereq/next/produces/consumes), ctx.provide publish, commands refactor, poll-via-ctx.get strategy for the persona (D-06/D-10/D-11)`
- `lib/_capabilities.js — CAPABILITY_KEYS ordered list, ROLES, NOT_LOOP_ORDERED sentinel, buildCapability, and the descriptor TABLE (step/role/tools/commands/order) that is the single source of truth for available-step filtering`
### The three surfaces to make reactive
- `lib/persona.js — PERSONA_TEXT static body + renderStateContext (the 'GSD loop position' runtime-context snapshot); inject=['systemPrompt'], reads gsdState via ctx.get at each assembly (non-reactive poll = the pattern to reuse for capabilities)`
- `lib/core-tools.js — gsd_status tool (lines ~107-177): reads STATE.md, prints Milestone/Status/Active phase/Next action/Progress/Phases/Windows/Async Jobs; the next-action rendering D-04 filters`
- `lib/state.js — STEPS constant (line 27), setActivePhase, _nextActionFor; the PURE artifact model that must stay ctx-free; cachedState (line 650) read by renderStateContext`
### Mount/test harness to extend
- `test/mount.test.mjs — makeMountCtx builds the fake ctx with provided/get supporting the capability services; PATCH_ROWS lists the 12 plugin rows; extend for subset-mount reactive-rendering scenarios`
### Cordis reactivity model for the poll-vs-inject decision
- `node_modules/@deepseek-ai/cordis/lib/index.js — ctx.get(k) reads the store WITHOUT inject (non-reactive); direct ctx.k proxy access requires inject (reactive); ctx.provide is an auto-tracked revertible effect; ctx.use instantiates inject-bound sub-fibers`
- `arXiv:2608.25512 §5.1.2 + §5.2.1 — a fiber whose declared inject keys are not provided stays inactive; a required coeffect would deactivate the persona when a step is missing (why capabilities stay OUT of persona.inject)`
</canonical_refs>

<code_context>
## Code Context
- ctx.provide('gsdOrient'|'gsdJobs', buildCapability(...)) in lib/core-tools.js apply (phase-21 D-01/D-09) — all 10 capabilities published as auto-tracked revertible effects; ctx.get reads them without inject (non-reactive, safe for an always-active persona)
- Each loop-step plugin (discuss.ui.plan.execute.verify.ship.quick.map-codebase) publishes its capability via ctx.provide in its apply; the descriptor carries tools/commands/order/role as the filtering source
- ctx.systemPrompt.section({name:'gsd:persona', order:-100, text}) and ctx.systemPrompt.context({name:'gsd:state', order:10, text:(context)=>renderStateContext(context, gsdState)}) in lib/persona.js — the section body and the snapshot provider to make capability-conditional
- The lib/_shared.js / _intel.js / _runner.js pure-helper module pattern that the new render/routing helper follows; lib/_capabilities.js already exports CAPABILITY_KEYS + buildCapability as the single-source capability vocabulary
- gsd_status execute in lib/core-tools.js already degrades gracefully over corrupt ledgers (never throws); D-04/D-07 keeps it a capability-aware but never-throwing orientation surface
- test/mount.test.mjs makeMountCtx already provides gsdState + subagents and supports ctx.get; subset mounting is a controlled extension (invoke only a chosen plugin subset's apply before asserting rendering)
</code_context>

<specifics>
## Specifics
- The runtime-context snapshot line rendered by renderStateContext is currently: 'GSD loop position: <phase>. Active milestone: <ms>. Use gsd_status for the full STATE.md...' — make the loop position / step references capability-aware per D-03.
- gsd_status currently prints 'Next action: <fm.next_action>' verbatim and 'Active phase: <fm.active_phase>  Step: <fm.status>' — D-04 filters/rewrites next_action from available capabilities.
- static core of persona must keep: the opener, Discuss->(UI)->Plan->Execute->Verify->Ship framing, scoping discipline, operating rules incl. the WAIT-FOR-COMMAND rule and the fresh-context rule — none naming a step-specific tool.
- Step-specific paragraphs must each reference only their own capability's tool(s), e.g. the discuss paragraph mentions gsd_discuss only when gsdDiscuss is present.
</specifics>

<deferred>
## Deferred Ideas
- Broken-chain detection using produces/consumes (plan absent => execute has no PLAN.md) — deferred by user decision; revisit after phase 23/24 or as a dedicated later phase.
- The automated per-plugin removal test suite proving each step plugin retires cleanly with the loop still functional (DEGR-05) — phase 23.
- Effect-scoping the background-job live registry (lib/jobs.js live Map) and declaring the subagents coeffect in every consuming plugin (DEGR-06/07) — phase 24.
- Making the milestone/phase/requirement tracking model pluggable end-to-end for a scrum-style swap — future milestone, out of phase 22.
</deferred>


---

*Phase: 22-reactive-loop-rendering*
*Context gathered: 2026-08-28*
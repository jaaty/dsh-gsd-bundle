# Phase 54: freeform-routing - Context

**Gathered:** 2026-09-07T04:21:32.323Z
**Status:** Ready for planning

<domain>
## Phase Boundary
**In scope:** A gsd_route tool plus a /gsd-route slash command that parses a plain-English intent string and dispatches it to the most appropriate available GSD command. A pure, side-effect-free intent classifier maps natural-language utterances (synonym-aware over commands, tools, loop steps, and common phrasings) to one target GSD command plus extracted parameters (phase number, and options such as advance/fix/auto), evaluated capability-aware so absent steps or withdrawn tools are never recommended. The classifier is unit-tested across an intent/command matrix; the tool's execute path classifies, then returns the recommended command text (never auto-runs it), falling back to gsd_status with an explanatory note for unmatched or ambiguous intents.
**Out of scope:** Auto-running the routed tool in the same turn (human-in-the-loop preserved). LLM-based / nondeterministic intent classification (no new runtime dependencies). Route-to-every-arbitrary-shell-command or free shell dispatch. Editing project state or .planning artefacts; the router returns a recommendation and does not mutate STATE/ROADMAP. quick-batch (CLH-05), fast-mode (CLH-06), mvp-phase (CLH-07), node-repair (CLH-08), and phase 53's state-aware smart-entry (CLH-02/CLH-03) remain separate phases.
</domain>

<decisions>
## Decisions
### Interface surface
- **D-01:** Phase 54 ships a new gsd_route tool plus a /gsd-route slash command (tool+command pairing, like every loop step). It is registered under an existing capability key (gsdOrient) or a dedicated one decided at plan-time; gsd_status/gsd_progress/gsd_next stay as-is. It takes a single free-text `intent` string and returns the recommended command text.
- **D-02:** Dispatch is recommend-only, never auto-run: the router classifies the intent, then returns the text naming the GSD command to invoke (with any extracted phase number/options). It does NOT run the routed step tool or inject a followup that runs it in the same turn — this honours the 'wait for the user's explicit command before advancing a step' operating rule and mirrors Phase 53 D-02.
### Intent classification
- **D-03:** The classifier is a pure, side-effect-free, deterministic intent-matcher (no LLM, no new runtime deps; node builtins + existing helpers). A synonym/keyword table maps plain-English utterances and common phrasings (commands, tool names, loop-step names, action verbs) to one candidate GSD command, and is unit-tested in isolation across an intent->command matrix before any routing.
- **D-04:** Parameter extraction: the classifier extracts an optional phase number (reusing the existing `phaseNum` pattern) plus recognized option flags (e.g. advance/fix/auto/wave/depth) from the intent and passes them to the mapped command's text, mirroring how /gsd-* commands parse args (phaseNumHelper/flag regexes in lib/commands.js).
- **D-05:** Ambiguity handling: when multiple commands match near-equally or a matched command's required argument (e.g. a phase number for a step phase command) is missing, the classifier prefers the best-scoring unique match when one dominates, otherwise returns the ambiguity/insufficiency as part of a gsd_status fallback with an explanatory note (D-06) rather than guessing.
### Capability-aware dispatch & fallback
- **D-06:** The dispatch target set is the capability-aware command/tool surface: loop-step, orient, and out-of-band GSD commands currently available. Routing reuses availableCapabilities / capabilityKeyForNextAction / effectiveRoutableStep from lib/_render.js (and the capability/command pairing in lib/_capabilities.js) as the single source of truth, so a withdrawn or absent command/tool is never recommended. Unmatched or ambiguous intents fall back to gsd_status with an explanatory note (no mutation).
- **D-07:** Never-instruct-a-missing-tool invariant: like Phase 53, the classifier must never return a command whose capability is entirely absent; absent gsdOrient degrades to a generic orientation sentence. The test matrix retires capabilities and asserts the never-instruct-a-missing-tool invariant holds in every reachable routing state.
### Edge cases & errors
- **D-08:** Empty/garbage intent: a blank, whitespace-only, or non-command gibberish input returns the gsd_status orientation fallback with a note asking for a clearer intent, never throwing.
- **D-09:** Command-specific argument requirements: commands that need an explicit phase number (discuss/plan/execute/ship/etc.) require a numeric phase in the intent; if absent, the recommendation notes the missing argument rather than fabricating a phase, consistent with D-05.
- **D-10:** Capability-absence: when the best-match command's capability is absent but the intent is otherwise clear, the router degrades to the nearest present capability-aware fallback (or gsd_status) and explains why the requested command is unavailable — never silently picking a different phase.
### Claude's Discretion
- Exact synonym vocabulary and scoring weights for the intent classifier (kept unit-testable and documented in the module).
- Whether gsd_route is registered under gsdOrient or a new capability key, and exact command/tool registration locations.
- Rendering format of the returned recommendation text.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Pure classifier + tool/command pairing convention
- `lib/_next.js — classifyNextState/renderNextRecommendation: the pure, side-effect-free, unit-testable classifier pattern gsd_route MUST mirror`
- `lib/core-tools.js — gsd_next tool registration (line 567-668): the exact tool-execute pattern to reuse`
### Capability-aware routing (single source of truth to reuse)
- `lib/_render.js — availableCapabilities (line 57), capabilityKeyForNextAction (line 73), effectiveRoutableStep (line 104): routing primitives gsd_route MUST reuse, not duplicate`
- `lib/_capabilities.js — capability descriptor table + capabilityForTool/command pairing: the command->capability mapping source`
### Slash-command registration + arg parsing
- `lib/commands.js — COMMANDS array + phaseNum helper + flag regexes: the command registration and /gsd-* arg-parsing pattern gsd_route reuses`
- `lib/commands.js — apply(ctx) commandToCapability pairing loop: the DEGR-03 pairing gsd-route participates in`
### Orientation/loop-step surface + fallback
- `lib/core-tools.js — gsd_status (line 127): the orienting fallback surface`
- `lib/state.js — setActivePhase/_nextActionFor (lines 421/435): the next-action mapping conventions (routing reads these, does not mutate)`
</canonical_refs>

<code_context>
## Code Context
- lib/_next.js is the direct sibling: a pure classifier + render function, capability-aware, FALLBACK_RECOMMENDATION = 'gsd_status', tested in isolation across a state matrix. Phase 54 mirrors this structure for free-text intents.
- lib/commands.js COMMANDS entries show the established build(raw)->{text,ack,err} command shape and phaseNum()/flag regex arg parsing that gsd_route's recommended-command text will mirror.
- lib/_capabilities.js capability table pairs tools/commands to capability keys; gsdOrient currently advertises gsd_status/gsd_progress/gsd_next/gsd_resume_work etc. A new gsd_route tool/command would be added to that pairing so retiring gsd-core-tools withdraws it (DEGR-03).
- The project discipline is 'no new runtime dependencies; node builtins only' with pure ESM helpers (per prior quick/discuss notes), which constrains D-03's deterministic classifier to builtins + existing helpers.
- test/_capabilities.test.mjs + test/mount.test.mjs reconcile tool/command counts; adding gsd_route will require count reconciliation like Phase 53 did.
</code_context>

<specifics>
## Specifics
- User confirmed: dispatch returns the recommended command and NEVER auto-runs the routed step tool in the same turn.
- User confirmed: plain-English parsing is a deterministic intent classifier (no LLM, no new runtime deps).
- User confirmed: dispatch target set is the capability-aware loop + orient + out-of-band GSD command/tool surface, skipping absent capabilities.
- User confirmed: unmatched/ambiguous intents fall back to gsd_status with an explanatory note.
- User confirmed: the router extracts a phase number (and options) from the intent and passes them to the mapped command.
</specifics>

<deferred>
## Deferred Ideas
- Auto-running the routed step tool without an explicit user command — deliberately out of scope to preserve the loop's human-in-the-loop discipline (shared with Phase 53).
- quick-batch (CLH-05), fast-mode (CLH-06), mvp-phase (CLH-07), node-repair (CLH-08) — separate later CLH phases.
- LLM-based / nondeterministic intent classification — deliberately out of scope for a lightweight router; could be revisited only as a separate capability.
- Mutating STATE/ROADMAP from a routed recommendation — the router never mutates; Phase 53's gsd_next remains the mutating smart-entry surface.
</deferred>


---

*Phase: 54-freeform-routing*
*Context gathered: 2026-09-07*
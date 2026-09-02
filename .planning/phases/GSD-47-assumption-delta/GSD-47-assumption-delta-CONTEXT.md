# Phase 47: assumption-delta - Context

**Gathered:** 2026-09-02T22:23:08.162Z
**Status:** Ready for planning

<domain>
## Phase Boundary
**In scope:** Add an advisory assumption-delta checkpoint: a pure helper module lib/assumption-delta.js (deterministic detector + prompt builder, no capability/tool/loop-step) plus a plan:pre hook wired into plan.js. The detector scans the phase scope (ROADMAP goal + requirement IDs + sealed CONTEXT.md decisions), strips fenced code blocks, and returns typed IR { detected, signals[], terms } for the three signal kinds (pluralization/optional/chosen). When detected, the hook surfaces ONE identity-model question (promote vs add-alongside) by injecting it into the planner prompt (so the planner records an <assumption_delta_decision> block in PLAN.md frontmatter) and logging it in the gsd_plan output. Config-gated via workflow.assumption_delta (default true). Advisory, non-blocking, never advances STATE.
**Out of scope:** No standalone gsd_assumption_delta tool, no gsdAssumptionDelta capability, no loop-step (upstream models it as a plan:pre 'feature' contribution, not a step). No CLI/stdin transport and no upstream exit-code contract (NO_INPUT/UNAVAILABLE) — the detector is in-process pure JS. No separate ASSUMPTION-DELTA.md artefact — the decision is recorded in PLAN.md frontmatter. probe_unavailable semantics do not apply (no stdin read path). No change to plan.js's existing mempalace hooks beyond adding the new hook alongside them.
</domain>

<decisions>
## Decisions
### Integration structure
- **D-01:** assumption-delta is a pure helper module lib/assumption-delta.js with NO capability, NO tool, NO loop-step. It exports pure, directly-testable helpers (detectAssumptionDelta, DEFAULT_ASSUMPTION_DELTA_TERMS, buildAssumptionDeltaPrompt, etc.) with NO ctx/fs/git params, plus a plan:pre hook wired into plan.js. This matches upstream's 'feature' role (a plan:pre contribution, not a step) and keeps the surface minimal.
### Detector input / scan source
- **D-02:** The detector scans the phase scope text assembled from (a) the ROADMAP phase goal, (b) the phase requirement IDs, and (c) the sealed CONTEXT.md decisions. CONTEXT is guaranteed present at plan:pre (gsd_plan requires it). The scan strips fenced code blocks first (mirroring upstream stripFencedCode) so a trigger term inside a code snippet does not fire.
### Detector semantics
- **D-03:** The detector is deterministic and returns typed IR { detected, signals[], terms } with three signal kinds (pluralization/optional/chosen) and the curated DEFAULT_ASSUMPTION_DELTA_TERMS vocabulary (bare 'or' deliberately excluded). Word-boundary anchored, case-insensitive. Non-string/empty input degrades to detected:false without throwing.
### Config gate
- **D-04:** Opt-in/out via workflow.assumption_delta in config.json, default TRUE (upstream parity). When not explicitly true, the plan:pre hook is skipped. Read via readConfig (the existing shared accessor), never gsd-tools config get-value.
### Surfacing
- **D-05:** When detected, the plan:pre hook (a) appends the detected signals + the promote-vs-add-alongside identity-model question to the planner prompt so the planner records an <assumption_delta_decision> block in PLAN.md frontmatter, and (b) logs a line in the gsd_plan output for the human. When not detected or skipped, no question is raised.
### Skipped semantics
- **D-06:** If the phase has no scanable scope text (no goal, no requirements, no CONTEXT), the hook returns skipped (not detected:false) so an unexamined phase is never asserted as a clean negative. probe_unavailable does not apply (in-process, no stdin). The hook checks skipped before reading detected.
### Invariant-test companion
- **D-07:** When detected, the planner prompt notes the optional invariant/contract test companion (e.g. 'every confirmed default round-trips through the primary use-path, for every supported variant') so the planner may add it as a task. Advisory, not required.
### Error handling
- **D-08:** Advisory soft gate, never blocks: the plan:pre hook never advances STATE and never throws. A fault in the hook (e.g. readConfig/readArtifact failure) is caught and logged as a non-blocking line (onError: skip), mirroring the mempalace plan:pre hook pattern. Fail-fast only on environmental faults (no .planning/ project, phase not in ROADMAP) with clear errors mirroring graphify's guards.
### Testing / TDD
- **D-09:** TDD: unit tests cover (a) the pure detector — result shape, pluralization/optional/chosen firing, no-signal phases, bare-'or' false-positive guard, fenced-code-block guard, CRLF, empty/whitespace/non-string degrade, custom term override/merge, (b) the config gate — disabled skips, enabled proceeds, (c) the plan:pre hook — detected injects into planner prompt + logs, not-detected/skipped raises nothing, fault never blocks. Pure helpers exported with NO ctx/fs/git params for direct unit testing. Follow test/*.test.mjs + mount-harness conventions.
### Claude's Discretion
- Exact helper/function names inside lib/assumption-delta.js within existing conventions.
- Precise wording of the planner-prompt question block and the gsd_plan log line.
- Whether the invariant-test companion is phrased as a suggestion or a task template.
- Exact composition/order of the scanable scope text (goal + reqs + CONTEXT).
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Upstream assumption-delta contract (WHAT/pattern — read-only reference, NOT to be vendored)
- `.analysis/gsd-core/capabilities/assumption-delta/fragments/plan-pre.md — the plan:pre checkpoint contract: detector, decision branch (skipped before detected), promote-vs-add-alongside question, <assumption_delta_decision> recording, invariant-test companion, vocabulary tuning.`
- `.analysis/gsd-core/capabilities/assumption-delta/capability.json — role 'feature', plan:pre contribution, workflow.assumption_delta config (default true), onError: skip.`
- `.analysis/gsd-core/src/assumption-delta.cts — the deterministic detector: DEFAULT_ASSUMPTION_DELTA_TERMS, detectAssumptionDelta typed IR, stripFencedCode, word-boundary regex, normalizeTerms/resolveTerms hardening.`
- `.analysis/gsd-core/tests/assumption-delta.test.cjs — the detector test matrix (firing, no-signal, bare-'or' guard, fenced-block guard, CRLF, degrade, term override) to model the bundle's unit tests on.`
### Bundle step-plugin / pure-helper pattern to mirror
- `lib/mempalace.js — the most recent pure-helper + plan:pre-hook pattern: pure exported helpers with NO ctx/fs/git for direct unit testing; all I/O in apply(); the plan:pre hook shape. assumption-delta mirrors the pure-helper split and the hook shape (but adds NO capability/tool — D-01).`
- `lib/plan.js — where the plan:pre hook is wired: runMempalaceRecallOnPlan (lines 26-36) and its invocation at plan:pre (line 110). The assumption-delta hook is added alongside it, mirroring the non-blocking onError: skip shape (D-08).`
- `lib/_shared.js — parseRoadmap (phase.goal + phase.requirements), parseDecisionEntries (deriving decision text from CONTEXT, used by mempalace), and any stripFencedCode/escapeRegex equivalent for the detector.`
### State, artefacts, and config
- `lib/state.js — readConfig for the workflow.assumption_delta gate (D-04); readRoadmap for phase.goal + phase.requirements; readArtifact(cwd, phase, 'CONTEXT') for the sealed decisions; _defaultConfig (lines 183-217) where workflow.assumption_delta is added (D-04).`
- `lib/_capabilities.js — reference for why NO capability is added (D-01): the checkpoint is a plan:pre contribution, not a loop step.`
### Existing tests
- `test/learnings.test.mjs — the step-plugin test pattern (pure helpers + apply mount + config-gated hook + never-blocks) to model the assumption-delta tests on.`
- `test/*.test.mjs + test/helpers/mount-harness.mjs — the node:test + mount-harness conventions used across the suite.`
</canonical_refs>

<code_context>
## Code Context
- plan.js already has runMempalaceRecallOnPlan at plan:pre (lines 26-36, invoked at line 110) — the assumption-delta hook mirrors this exact non-blocking shape (D-08).
- readRoadmap returns phase.goal + phase.requirements; readArtifact(cwd, phase, 'CONTEXT') returns the sealed CONTEXT.md — both feed the scanable scope text (D-02).
- _defaultConfig (state.js 183-217) holds the workflow.* flags; workflow.assumption_delta is added here with default true (D-04).
- _shared.js has parseDecisionEntries (used by mempalace) for deriving decision text from CONTEXT; the detector may reuse it or scan the raw CONTEXT text.
- No capability/tool registration is needed (D-01) — the hook is pure JS inside plan.js, so lib/_capabilities.js and lib/_render.js are untouched.
</code_context>

<specifics>
## Specifics
- GAP-13 verbatim: 'An advisory assumption-delta checkpoint detects when a phase makes something plural, optional, or chosen that used to be singular, required, or derived, and surfaces one identity-model question.'
- Upstream: fires ONLY when the phase scope shows a singular→plural / required→optional / derived→chosen transition; most phases will not fire it — that is the point.
- Upstream: the question is 'Promote vs. add-alongside' — promote the new general representation to primary and demote the old specific one to a detail of one variant, rather than adding alongside.
- Upstream: record the outcome in PLAN.md frontmatter / an <assumption_delta_decision> block: the noun now primary, the decision (promote|add-alongside|no-change) with a one-line rationale, and if add-alongside call it out as accepted debt.
- Upstream: check for skipped before reading detected — a skipped payload carries no detected key, and treating its absence as false re-creates the fabrication the branch exists to prevent (D-06).
- Upstream: bare 'or' is intentionally excluded from the pluralization cues — it is too common in prose and would make the gate fire constantly (D-03).
</specifics>

<deferred>
## Deferred Ideas
- A standalone gsd_assumption_delta tool / gsdAssumptionDelta capability / loop-step — not needed; the checkpoint is a plan:pre contribution (D-01).
- CLI/stdin transport and the full upstream exit-code contract (NO_INPUT/UNAVAILABLE) — the detector is in-process pure JS, no stdin.
- probe_unavailable semantics — no stdin read path exists in the bundle.
- A separate ASSUMPTION-DELTA.md artefact — the decision is recorded in PLAN.md frontmatter, not a separate file.
</deferred>


---

*Phase: 47-assumption-delta*
*Context gathered: 2026-09-02*
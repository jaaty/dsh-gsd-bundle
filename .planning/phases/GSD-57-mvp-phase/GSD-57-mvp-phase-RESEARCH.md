# Research — Phase 57: mvp-phase

## Research posture

This phase is a **pattern-mirroring** phase. It does not introduce a novel subsystem; it adds a new tool/capability/command that mirrors the already-shipped sibling pattern established by `gsd_fast_mode` (lib/quick.js), `gsd_quick`, and `gsd_quick_batch`, and it reuses the existing normal loop (`gsd_plan` -> `gsd_execute` -> `gsd_verify` -> `gsd_ship`) for delegation. Because the target behaviour is fully specified by the sibling implementations already present in the codebase, external ecosystem research is low-value: the correct reference is the in-repo sibling code, not the web.

## What the codebase already establishes (verified by inspection)

- **Tool surface** — `lib/quick.js` registers `gsd_quick`, `gsd_quick_batch`, and `gsd_fast_mode` via `ctx.provide(...)` + `ctx.tools.register(defineTool({...}))`. `gsd_fast_mode` (execute at lines 233-281) is the closest template: it uses the `findTool` helper (lines 43-47) to locate sibling tools and delegates to them. `gsd_mvp_phase` follows the same shape.
- **Capability surface** — `lib/_capabilities.js` holds `CAPABILITY_KEYS` + `TABLE`. `gsdFastMode` (lines 176-186) is the template: step "quick", role "alternate", order 25. `gsdMvpPhase` mirrors it.
- **Command surface** — `lib/commands.js` holds the `COMMANDS` array; the `gsd-fast-mode` entry (lines 267-278) is the template for `gsd-mvp-phase`.
- **Delegation targets** — `lib/plan.js` (execute at line 77; requires a CONTEXT.md, returns early at line 96 if absent, sets STATE to 'execute'), `lib/execute.js` (execute at line 54; requires PLAN.md files, sets STATE to 'verify'), `lib/verify.js` (execute at line 54; requires SUMMARY.md files, writes VERIFICATION.md, sets STATE to 'ship' on passed), `lib/ship.js` (execute at line 142). `gsd_mvp_phase` delegates to these via `findTool`.
- **Artefact model** — `lib/state.js` `writeArtifact`/`readArtifact`/`hasArtifact`/`phaseDirAndBase` (lines 708-755) accept arbitrary suffix names (e.g. "MVP-SCOPE" -> `<base>-MVP-SCOPE.md`). `lib/_shared.js` `parseFrontmatter` (line 51) reads the VERIFICATION.md status back.
- **Offline test harness** — `test/service-tools.test.mjs` has describe blocks for `gsd_quick` (228-248), `gsd_quick_batch` (254-327), and `gsd_fast_mode` (337-417), plus the `makeSubagents` canned-branch helper (29-87), `makeCtx`/`registerTool` (89-135), and `registerFastTool` (126-135). `test/helpers/project.mjs` provides `buildProject`, `FENCED_PLAN`, `FENCED_SUMMARY`, `VERIFICATION_PASSED`. The `gsd_mvp_phase` tests mirror these.
- **Registration-surface tests** — `test/mount.test.mjs` (exact counts: 35 tools / 32 commands / 26 caps; the absent-capability test at line 190 asserts **31** commands when `gsdQuick` is withdrawn), `test/_capabilities.test.mjs` (CAPABILITY_KEYS.length === 26 at line 13), `test/render.test.mjs` (LOOP_ORDER at line 44, subset list at line 113). These are updated in the same commit as the tool (R3).

## Key design decisions carried into the plans

- **D-03 propose-then-confirm** — first call writes an `MVP-SCOPE` artefact and returns a `GSD_AWAITING_HUMAN` marker with the proposed slice; a confirm call (with matching `decision_id`) writes the confirmed CONTEXT and proceeds.
- **D-04** — reuse the normal `gsd_plan` path for a schema-faithful PLAN.md.
- **D-05** — delegate execution to the normal loop `gsd_execute` -> `gsd_verify` -> `gsd_ship`.
- **D-06** — fail fast, never auto-retry/continue, leave the phase uncompleted, report the real cause.
- **D-07** — executor discretion on proposed-slice wording, confirm-interaction shape, and the lightweight-verify heuristic before delegating to ship.

## Open Questions

None. The phase is fully specified by the sibling pattern and the locked CONTEXT decisions (D-01..D-07). No external dependency or ecosystem decision is unresolved.

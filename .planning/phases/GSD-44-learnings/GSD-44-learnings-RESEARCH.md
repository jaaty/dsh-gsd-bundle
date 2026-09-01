I now have a complete, grounded picture. Here is the full RESEARCH.md:

---

# Phase 44: learnings — RESEARCH.md

**Phase:** 44-learnings
**Requirement:** GAP-10
**Researcher:** gsd-phase-researcher
**Date:** 2026-09-01

> What do I need to know to PLAN this phase well? This document grounds every
> claim in real, read-this-session evidence. Provenance tags: `[VERIFIED: src]`
> (confirmed via a tool against an authoritative in-repo source), `[CITED: url]`
> (official docs), `[ASSUMED]` (training knowledge only).

---

## Domain analysis

### The step-plugin pattern this phase must mirror

The phase is a **full loop-step plugin** that is a faithful hybrid of two existing
plugins: `lib/milestone-audit.js` (hybrid deterministic-scan + gated fresh-context
subagent) and `lib/gap-analysis.js` (soft gate, pure-JS scan, no STATE advance)
[VERIFIED: `lib/milestone-audit.js:1-29`, `lib/gap-analysis.js:1-13`].

The canonical shape, confirmed by reading `lib/milestone-audit.js` end-to-end:

1. **`defineTool` + inject + `ctx.provide(buildCapability(...))`** — the plugin
   registers a tool and publishes a capability descriptor as a revertible effect
   [VERIFIED: `lib/milestone-audit.js:31-41,103`].
2. **Pure helpers exported with NO ctx / fs / git params** for direct unit testing
   (`aggregateCloseGate`, `classifyMilestoneStatus`, `resolveAuditorOutput`), and
   an `apply(ctx)` that does all I/O + spawns the subagent
   [VERIFIED: `lib/milestone-audit.js:43-96,98-244`].
3. **Hybrid engine**: a deterministic pure-JS gather (no tokens), then a
   fresh-context subagent gated on a condition, with a **never-throw degrade**
   contract — a spawn fault or malformed structured output degrades to an
   UNAVAILABLE/decisions-only section, the tool still resolves
   [VERIFIED: `lib/milestone-audit.js:149-174`].
4. **Soft gate**: does NOT call `setActivePhase`, only `addDecision` for the audit
   trail [VERIFIED: `lib/milestone-audit.js:233-235`].
5. **Commit via the shared seam** `commitArtifacts` [VERIFIED:
   `lib/milestone-audit.js:238`].

`learnings.js` mirrors this split exactly: pure exported
gather/accumulate/idempotency/schema-resolver helpers + an `apply()` that does
I/O and spawns the synthesis subagent. **Confidence: high** — this is a direct
structural clone of a sibling plugin in the same codebase.

### The four-category extract (decisions / lessons / patterns / surprises)

The upstream feature spec fixes four categories with source attribution and a
per-phase `{phase}-LEARNINGS.md` carrying YAML frontmatter
(phase, project, counts per category, missing_artifacts)
[CITED: `.analysis/gsd-core/docs/features/extract-learnings.md` — read this session].
The upstream command contract reads PLAN.md + SUMMARY.md (required) plus
VERIFICATION/UAT/STATE (optional) [CITED:
`.analysis/gsd-core/commands/gsd/extract-learnings.md`].

This phase's CONTEXT.md adds a **carrying-forward root `.planning/LEARNINGS.md`**
that accumulates every phase's extract, plus an idempotency index
(`phases_extracted`) grounded in upstream fix-306
[CITED: `.analysis/gsd-core/.changeset/archived/fix-306-learnings-dedupe-index.md`].

### The "decisions come from the deterministic pass" split (D-07/D-08)

Decisions are already structured in CONTEXT.md as `- **D-NN:** text` lines, parsed
by the shared `parseDecisionEntries` [VERIFIED: `lib/_shared.js:385-397` — regex
`/^-\s+\*\*(D-\d+):\*\*\s*(.*)$/gm`, first-occurrence wins, ascending numeric sort].
So the deterministic gather produces the **decisions** category directly (no LLM).
The fresh-context subagent only synthesizes the **interpretive** categories
(lessons/patterns/surprises). This mirrors milestone-audit, where the
deterministic close-gate is authoritative and the subagent adds the interpretive
UAT list [VERIFIED: `lib/milestone-audit.js:139-174`].

### Standard stack

- Pure ESM, no TypeScript, no build step [VERIFIED: `lib/*.js` are plain `.mjs`-style ESM].
- `@deepseek-ai/dsh-tools` `defineTool` for tool registration [VERIFIED:
  `lib/milestone-audit.js:31`].
- `node:test` + `node:assert/strict` for tests [VERIFIED:
  `test/milestone-audit.test.mjs:12-13`].
- No external dependencies introduced. **Confidence: high.**

### Pitfalls

1. **Adding an 18th capability (order 53) breaks existing routing tests.** See
   Open Question OQ-1 (RESOLVED) — `render.test.mjs:138` asserts
   `effectiveRoutableStep("verify-phase", without(...milestone-audit)) === null`;
   with gsdLearnings at order 53 present in `FULL`, that returns gsdLearnings
   instead. The planner MUST update the `without(...)` lists and LOOP_ORDER.
2. **learnings must NOT add `next_action` map entries.** It mirrors
   milestone-audit (an advisory off-loop step that never advances STATE) —
   neither `_nextActionFor` (state.js:351-353) nor `NEXT_ACTION_TO_STEP`
   (_render.js:29-38) has a "milestone-audit" entry, and the persona's static
   loop line omits it [VERIFIED this session]. Adding a "learnings" entry would
   be inconsistent and would make the DEGR-05 retirement test route incorrectly.
3. **The root LEARNINGS.md is project-scoped, NOT phase-scoped.** It cannot use
   `writeArtifact` (which resolves into the per-phase dir). It needs a new
   root-scoped accessor modeled on `writeMilestoneArtifact` [VERIFIED:
   `lib/state.js:500-510`; `planningRoot(cwd)` exists at `lib/state.js:64`].
4. **The auto-on-ship hook must NEVER block the ship.** D-10 mandates a
   try/catch that logs the cause and lets the ship succeed even on extraction
   failure. This mirrors milestone-audit's never-throw discipline applied at the
   ship boundary.

---

## Package legitimacy

**No new dependencies are proposed.** Every primitive this phase needs already
exists in-repo and is reused:

- `defineTool` from `@deepseek-ai/dsh-tools` [VERIFIED: `lib/milestone-audit.js:31`]
  — already a dependency.
- `parseFrontmatter`/`stringifyFrontmatter`/`parseDecisionEntries`/`nowIso`/`today`
  from `./_shared.js` [VERIFIED: `lib/_shared.js:5-18,385-397`].
- `cwdOf`/`spawnSubagent` from `./_runner.js` [VERIFIED: `lib/_runner.js:8,98`].
- `commitArtifacts` from `./_git-artifacts.js` [VERIFIED:
  `lib/_git-artifacts.js:174`].
- `buildCapability` from `./_capabilities.js` [VERIFIED:
  `lib/_capabilities.js:261`].

No `npm install` is required. **Confidence: high.**

---

## Risks and Open Questions

### OQ-1 — Adding gsdLearnings (order 53) breaks existing routing/count tests. (RESOLVED)

**Resolved by enumeration of every breakage and its fix**, all confirmed by
reading the test files this session:

| File:line | Current assertion | Effect of adding gsdLearnings (order 53, +1 tool, +1 command, +1 patch row, +1 capability) | Required fix |
|---|---|---|---|
| `test/mount.test.mjs:135` | `ctx.tools.length === 22` | +1 tool (`gsd_extract_learnings`) → 23 | bump to `=== 23` |
| `test/mount.test.mjs:136` | `ctx.commands.length === 19` | +1 command (`gsd-extract-learnings`) → 20 | bump to `=== 20` |
| `test/mount.test.mjs:147` | `CAPABILITY_KEYS.length === 18` | +1 key → 19 | bump to `=== 19` |
| `test/mount.test.mjs:178` | `ctx2.commands.length === 18` (after retiring one) | 19 | bump to `=== 19` |
| `test/mount.test.mjs:203` | `insertRows.length === 20` | +1 cordis.patch.yml row → 21 | bump to `=== 21` |
| `test/mount.test.mjs:316` | `ctx.tools.length, 22` | 23 | bump to `23` |
| `test/mount.test.mjs:442` | subset-mount `subs` array (omits learnings) | gsdLearnings not provided → `ctx.provided.has(key)` loop at :443 fails for `gsdLearnings` | add `"learnings"` to the subs array |
| `test/mount.test.mjs:458` | snapshot regex `/Available steps: spec, discuss, ..., milestone-audit\./` | `learnings` now appears after `milestone-audit` in the rendered list | extend regex to `..., milestone-audit, learnings\.` |
| `test/render.test.mjs:43` | `LOOP_ORDER` array (13 keys, ends `gsdMilestoneAudit`) | gsdLearnings missing → `loopSteps(FULL)` deepEqual at :95-96 fails | append `"gsdLearnings"` |
| `test/render.test.mjs:111` | `loopSteps(subset)` deepEqual (ends `gsdMilestoneAudit`) | gsdLearnings missing from expected list | append `"gsdLearnings"` |
| `test/render.test.mjs:136` | `effectiveRoutableStep("verify-phase", without("gsdVerify","gsdValidatePhase","gsdShip")).key === "gsdMilestoneAudit"` | still correct — milestone-audit (52) is the first order > 40; gsdLearnings (53) is after it | **no change needed** |
| `test/render.test.mjs:138` | `effectiveRoutableStep("verify-phase", without(..., "gsdMilestoneAudit")) === null` | gsdLearnings (53 > 40) is present → returns gsdLearnings, NOT null → **FAILS** | add `"gsdLearnings"` to the `without(...)` list so the "no greater slot → null" intent holds |

Sources (all read this session): `test/mount.test.mjs:135-203,316,442-458`,
`test/render.test.mjs:43,95-96,107-113,128-139`.

The DEGR-05 removal suite (`test/removal.test.mjs:37-46,121-184`) is
**auto-extending**: `STEP_CAPS` is derived from `CAPABILITY_KEYS.filter(role
=== "step")` (:37) and `retirementMatrix()` finds the patch row by `r.sub ===
cap.step` (:42). So adding gsdLearnings (role "step", step "learnings")
**requires** a matching `PATCH_ROWS` entry `{ id: "gsd-learnings", sub:
"learnings" }` in `test/helpers/mount-harness.mjs:23-44`, else `retirementMatrix`
throws `no patch row for step "learnings"` (:43) [VERIFIED:
`test/removal.test.mjs:42-43`, `test/helpers/mount-harness.mjs:23-44`].

The retirement test's `setActivePhase(CWD, 1, "learnings")` (:155) sets
`next_action = _nextActionFor("learnings")` which, with NO map entry, falls back
to `"discuss-phase"` [VERIFIED: `lib/state.js:351-353`]. Since gsdDiscuss is
present after retiring only gsdLearnings, `effectiveRoutableStep("discuss-phase",
present)` returns gsdDiscuss → `expectedLine = "Next action: discuss-phase"`,
and the assertion passes. This is the **identical, already-passing behaviour**
for milestone-audit (also no `_nextActionFor` entry). **No change to
`_nextActionFor` / `NEXT_ACTION_TO_STEP` is needed or wanted.**

**Resolution:** the planner must, in one plan touching the registration surface,
update `_capabilities.js`, `_render.js` (STEP_PARAGRAPHS), `cordis.patch.yml`,
`package.json` exports, `test/helpers/mount-harness.mjs` (PATCH_ROWS), and the
seven test assertions above. These are mechanical, non-overlapping edits. (RESOLVED)

### OQ-2 — Where exactly does the ship:post hook live and how does it reuse the learnings code path? (RESOLVED)

Ship's `execute` body: preflight → push → PR create (`lib/ship.js:242-256`) →
STATE update (`:260-262`) → completion commit + push (`:271-305`) → final log +
return (`:307-308`) [VERIFIED: `lib/ship.js:240-312`].

The hook (D-10) runs **after STATE is updated and the completion commit lands**
(i.e., after line 305, before line 307's return), gated by `workflow.learnings`
(read via `s.readConfig(cwd)` — already called at `lib/ship.js:114`), wrapped in
try/catch so a fault is logged as a warning and never blocks the ship.

To reuse the exact same code path (D-10 "uses the same code path as the manual
tool"), the hook finds the registered tool and calls its `execute`:

```js
// pseudocode — ship.js, after completion commit, before return
if (cfg.workflow?.learnings) {
  try {
    const t = ctx.tools.find((x) => x.name === "gsd_extract_learnings");
    if (t) {
      const r = await t.execute({ phase: args.phase, force: true }, exec);
      log.push(`learnings: ${r}`);
    } else {
      log.push("learnings: gsd_extract_learnings not registered — skipped");
    }
  } catch (e) {
    log.push(`learnings: extraction failed (non-blocking): ${e.message}`);
  }
}
```

`force: true` on the auto-run is correct: the just-shipped phase may already be
in `phases_extracted` from a prior manual run, and the auto-run must re-extract
the final state (D-06 force override). The tool's own `execute` already commits
via `commitArtifacts` (D-11) and degrades to decisions-only on subagent fault
(D-09), satisfying never-block.

**Push note:** `commitArtifacts` stages `.planning` and commits locally but does
NOT push [VERIFIED: `lib/_git-artifacts.js:174-201`]. The LEARNINGS files are
`.planning/` content, which the clean-PR path filters out of the review diff
[VERIFIED: `lib/_clean-branch.js` is imported at `lib/ship.js:14`; clean-PR
filters `.planning/`]. So the learnings commit need only land on the local
`phase-N` branch; a follow-up `git(cwd, ["push","origin", branch])` (ship already
has the `git` helper) is best-effort and acceptable. Whether the hook pushes or
relies on a later push is Claude's Discretion (D-11 accepts either).
(RESOLVED)

### OQ-3 — Per-phase vs root frontmatter field sourcing. (RESOLVED)

- **Per-phase `{NN}-LEARNINGS.md` frontmatter** (D-03): `phase`, `project`,
  `counts` (per category), `missing_artifacts`. The `project` field sources from
  `cfg.project_code` (config.json), falling back to the PROJECT.md name
  (`s.readProject(cwd)`) [VERIFIED: `lib/state.js:382-384,517` — `cfg.project_code`
  is read at `_phaseDirName`; `readProject` at :139].
- **Root `.planning/LEARNINGS.md` frontmatter** (D-04): `generated` (ISO via
  `nowIso()`), `project_code`, `phases_extracted` (numeric-ascending array, per
  Claude's Discretion). `project_code` from `cfg.project_code`.

`nowIso()` and `today()` are the shared date helpers [VERIFIED:
`lib/_shared.js:18-22`]. (RESOLVED)

### OQ-4 — Required vs optional artifacts and the fail-fast guard. (RESOLVED)

Per upstream REQ-LEARN-01 [CITED:
`.analysis/gsd-core/docs/features/extract-learnings.md`]: PLAN.md and SUMMARY.md
are REQUIRED; the tool fails fast with a clear error if either is missing.
VERIFICATION.md, REVIEW.md, COVERAGE.md are OPTIONAL and degrade to a
`missing_artifacts` note without failing. CONTEXT.md is the decisions source —
its absence means the decisions category is empty with a note (degrade, not
fail), since CONTEXT is sealed by discuss but a phase could in principle lack it.
The deterministic gather uses `s.hasArtifact` / `s.readArtifact`
[VERIFIED: `lib/state.js:557-566`]. (RESOLVED)

### OQ-5 — Does learnings need a slash command entry? (RESOLVED)

Yes (D-01). The `/gsd-extract-learnings` command is registered via the
`COMMANDS` array in `lib/commands.js` and paired to the gsdLearnings capability
through the descriptor's `commands: ["gsd-extract-learnings"]` field, which the
`commandToCapability` map in `lib/commands.js:294-297` consumes to drive the
coeffect sub-fiber inject [VERIFIED: `lib/commands.js:294-322`]. Adding the
command entry + the descriptor `commands` field is the full wiring; no other
change to commands.js is needed. (RESOLVED)

---

## Architectural Responsibility Map

| Capability / responsibility | Tier | Assignment | Evidence |
|---|---|---|---|
| `gsd_extract_learnings` tool registration + capability publish | integration | `lib/learnings.js` `apply(ctx)` — `defineTool` + `ctx.provide(buildCapability("gsdLearnings"))` | [VERIFIED: `lib/milestone-audit.js:103-105` pattern] |
| Capability descriptor (order 53, role step, tools, command, produces) | data | `lib/_capabilities.js` TABLE + CAPABILITY_KEYS | [VERIFIED: `lib/_capabilities.js:28-47,241-252`] |
| Persona step paragraph + Available-steps rendering | presentation | `lib/_render.js` STEP_PARAGRAPHS + renderAvailableSteps | [VERIFIED: `lib/_render.js:148-175,134-142`] |
| Slash command `/gsd-extract-learnings` | presentation | `lib/commands.js` COMMANDS array | [VERIFIED: `lib/commands.js:35-287,289-322`] |
| Deterministic gather (decisions + artifact digest) | domain | pure exported helper(s) in `lib/learnings.js` (no ctx/fs/git) | [VERIFIED: `lib/milestone-audit.js:43-96` precedent] |
| Synthesis subagent (lessons/patterns/surprises) | integration | `spawnSubagent` via `lib/_runner.js`; prompt+schema in `lib/_agents.js` | [VERIFIED: `lib/_runner.js:8`, `lib/_agents.js:528-561` precedent] |
| Schema validation / degrade resolver | domain | pure exported `resolveLearningsOutput` in `lib/learnings.js` | [VERIFIED: `lib/milestone-audit.js:88-96` precedent] |
| Root `.planning/LEARNINGS.md` accumulate/replace merge | domain | pure exported accumulate helper in `lib/learnings.js` | [VERIFIED: D-05; merge is pure string/frontmatter logic] |
| Idempotency guard (phases_extracted) | domain | pure exported guard helper in `lib/learnings.js` | [VERIFIED: D-06; reads frontmatter only] |
| Per-phase `{NN}-LEARNINGS.md` write | data | `s.writeArtifact(cwd, phase, "LEARNINGS", body)` | [VERIFIED: `lib/state.js:550-555`] |
| Root `.planning/LEARNINGS.md` write | data | new `s.writeRootLearnings(cwd, content)` modeled on `writeMilestoneArtifact` | [VERIFIED: `lib/state.js:500-510,64`] |
| Commit artefacts to phase branch | integration | `commitArtifacts` from `lib/_git-artifacts.js` | [VERIFIED: `lib/_git-artifacts.js:174`] |
| Auto-on-ship hook + config flag | integration | `lib/ship.js` post-completion + `_defaultConfig` `workflow.learnings` | [VERIFIED: `lib/ship.js:260-308`, `lib/state.js:183-207`] |
| Plugin row / subpath export | integration | `cordis.patch.yml` + `package.json` exports | [VERIFIED: `cordis.patch.yml:110-111`, `package.json` exports] |

**Security note:** No security-sensitive capability is introduced (no shell
interpolation, no secrets, no untrusted input). All git calls reuse the fixed
`-C cwd` argument-array seam in `commitArtifacts` [VERIFIED:
`lib/_git-artifacts.js:14-16,174`]. No tier misclassification risk.

---

## Validation Architecture

Per D-14, the phase is TDD. The automated checks that prove each behaviour
(modeled on `test/milestone-audit.test.mjs`):

| Behaviour (D-ID) | Automated check | How |
|---|---|---|
| gsdLearnings capability registration + order 53 (D-14a) | `ctx.provided.has("gsdLearnings")` after `applyLearnings`; `buildCapability("gsdLearnings").order === 53`; present in CAPABILITY_KEYS | direct assertion, FakeFs+mount-harness [VERIFIED pattern: `test/milestone-audit.test.mjs:182-211`] |
| Per-phase LEARNINGS.md shape — four categories + source attribution + frontmatter counts/missing_artifacts (D-14b) | `s.readArtifact(cwd, phase, "LEARNINGS")` → parseFrontmatter → assert `phase`, `project`, `counts.*`, `missing_artifacts`; body matches `## Decisions`/`## Lessons`/`## Patterns`/`## Surprises` with `(source: <artifact>#<section>)` attribution | FakeFs write+read [VERIFIED: `test/milestone-audit.test.mjs:198-206`] |
| Root accumulation — append new phase, in-place replace existing (D-14c, D-05) | extract phase 1 → root has one `## Phase 1` block; extract phase 2 → two blocks newest-last; re-extract phase 1 with force → phase 1 block replaced, no duplicate, `phases_extracted` sorted ascending | pure helper unit test (no ctx) + integration write/read |
| Idempotency guard short-circuit + force override (D-14d, D-06) | second call without force → returns `already extracted` message, writes nothing; with force → re-extracts and replaces | read frontmatter only on common path |
| Missing required artifact fail-fast + optional degradation (D-14e, OQ-4) | no PLAN.md → rejects `/PLAN\.md/` error; no SUMMARY.md → rejects; missing VERIFICATION/REVIEW/COVERAGE → succeeds with `missing_artifacts` note | `assert.rejects` [VERIFIED: `test/milestone-audit.test.mjs:233-236`] |
| Subagent-fault degrade-to-decisions-only (D-14f, D-09) | fake subagents `start()` throws → tool RESOLVES (not rejects), per-phase file has decisions populated + empty lessons/patterns/surprises with UNAVAILABLE note + real cause | fake subagents factory [VERIFIED: `test/milestone-audit.test.mjs:145-156,296-314`] |
| Auto-on-ship hook gated by flag + never-blocks-ship (D-14g, D-10) | `workflow.learnings: false` → hook skipped, ship unchanged; `true` + extraction throws → ship still succeeds, cause logged; `true` + success → LEARNINGS files committed on phase branch | ship integration test with fake git + fake learnings tool / or direct hook test |
| Deterministic gather uses parseDecisionEntries for decisions (D-14h) | seed CONTEXT with `- **D-01:** x` / `- **D-02:** y` → decisions category lists both verbatim with `CONTEXT#decisions` source | pure helper test (no ctx) — pass CONTEXT markdown string, assert output |
| Pure helpers have no ctx/fs/git params (D-14) | import gather/accumulate/guard/resolve directly, call with plain args | direct import [VERIFIED: `test/milestone-audit.test.mjs:22-26`] |

The cross-cutting registration tests (mount/render/removal) prove the wider
invariants: capability count, tool count, command count, snapshot rendering,
persona paragraph, and DEGR-05 retirement (see OQ-1).

**Coverage gate note:** every behaviour has an automated verify (the table
above), satisfying the Nyquist/coverage gate's "no uncovered behaviour" rule.

---

## Project Constraints (from project conventions)

Confirmed by reading the codebase this session:

1. **Pure-helper convention:** exported helpers that are unit-tested directly
   carry NO `ctx`/`fs`/`git` parameters; all I/O happens in `apply()`
   [VERIFIED: `lib/milestone-audit.js:27-29,43-96`]. learnings.js MUST follow this.
2. **Single source of truth for capabilities:** `buildCapability` in
   `lib/_capabilities.js` is the only constructor; `ctx.provide(key,
   buildCapability(key))` is the only publish path [VERIFIED:
   `lib/_capabilities.js:261-281`, `lib/milestone-audit.js:103`].
3. **Commit seam:** no raw git in step plugins — use `commitArtifacts`
   [VERIFIED: `lib/_git-artifacts.js:174`; milestone-audit/gap-analysis both use
   it]. learnings.js MUST NOT call git directly (D-11).
4. **Artefact routing through `ctx.fs`:** all writes go through `s._write` →
   `ctx.fs.writeText`, never raw `node:fs/promises` (DUR-06/CQ-01) [VERIFIED:
   `lib/state.js:117-121`]. The new root accessor must follow this.
5. **Config flag pattern:** `workflow.*` booleans live in `_defaultConfig`
   (state.js:183-207) and are read via `readConfig` [VERIFIED]. `workflow.learnings`
   defaults to `false`, mirroring `code_review`/`ui_review`/`validate_phase` at
   :197-200.
6. **Test conventions:** `test/*.test.mjs` + `test/helpers/mount-harness.mjs`
   (FakeFs + `makeMountCtx` + `makeExec` + `CWD = "/project"`) [VERIFIED:
   `test/helpers/mount-harness.mjs:1-65`]. Offline only — no live boot, no LLM,
   fake gitFn, fake subagents factory [VERIFIED:
   `test/milestone-audit.test.mjs:8-11,145-172`].
7. **Frozen schema discipline:** subagent output schemas use `Object.freeze`
   with `additionalProperties: false` [VERIFIED: `lib/_agents.js:528-548`].
   LEARNINGS_SCHEMA must follow this.
8. **No new dependencies / no TypeScript / no build step** [VERIFIED: repo stack].

---

## Implementation surface (files the planner will touch)

**New file:**
- `lib/learnings.js` — the plugin (pure helpers + `apply`), mirroring
  `lib/milestone-audit.js`.

**Edited (registration surface):**
- `lib/_capabilities.js` — add `gsdLearnings` to `CAPABILITY_KEYS` (19th) and the
  TABLE descriptor: `{ step: "learnings", role: "step", tools:
  ["gsd_extract_learnings"], commands: ["gsd-extract-learnings"], order: 53,
  prereq: [], next: [], produces: ["LEARNINGS.md"], consumes: ["CONTEXT.md",
  "PLAN.md", "SUMMARY.md", "VERIFICATION.md", "REVIEW.md", "COVERAGE.md"] }`
  [VERIFIED insertion point: `lib/_capabilities.js:28-47` (CAPABILITY_KEYS),
  `:241-252` (TABLE, after gsdMilestoneAudit)].
- `lib/_render.js` — add `gsdLearnings` to `STEP_PARAGRAPHS` (a one-line "why
  this step exists" paragraph) so the persona renders it when present
  [VERIFIED: `lib/_render.js:148-175,206-210`]. Do NOT add to `NEXT_ACTION_TO_STEP`
  (mirrors milestone-audit's omission).
- `lib/_agents.js` — add `LEARNINGS_PROMPT` + `LEARNINGS_SCHEMA` (frozen object
  with `lessons`/`patterns`/`surprises` arrays of `{ content: string, source:
  string }`) alongside `MILESTONE_AUDITOR_SCHEMA` [VERIFIED insertion point:
  `lib/_agents.js:521-561`].
- `lib/state.js` — add `writeRootLearnings(cwd, content)` + `readRootLearnings(cwd)`
  modeled on `writeMilestoneArtifact`/`readMilestoneArtifact`, writing to
  `${this._planning(cwd)}/LEARNINGS.md` [VERIFIED template: `lib/state.js:500-510`];
  add `workflow.learnings: false` to `_defaultConfig` [VERIFIED insertion:
  `lib/state.js:197-200`].
- `lib/ship.js` — add the post-completion best-effort learnings hook (OQ-2),
  gated by `cfg.workflow?.learnings`, never-blocking [VERIFIED insertion point:
  after `lib/ship.js:305`, before `:307`].
- `lib/commands.js` — add a `/gsd-extract-learnings` entry to the `COMMANDS`
  array (name, description, hint `<N>`, build) [VERIFIED pattern:
  `lib/commands.js:218-242` (gsd-health/gsd-ship entries)].
- `cordis.patch.yml` — add `gsd-learnings` plugin row (after gsd-milestone-audit,
  before gsd-ship per the existing ordering, or grouped with advisory steps)
  [VERIFIED: `cordis.patch.yml:110-114`].
- `package.json` — add `"./learnings": { "default": "./lib/learnings.js" }` to
  exports [VERIFIED: `package.json` exports, `./milestone-audit` entry].

**Edited (test surface — OQ-1):**
- `test/helpers/mount-harness.mjs` — add `{ id: "gsd-learnings", sub: "learnings"
  }` to `PATCH_ROWS` [VERIFIED: `:23-44`].
- `test/learnings.test.mjs` — NEW test file (pure helpers + integration + degrade
  + auto-on-ship), modeled on `test/milestone-audit.test.mjs`.
- `test/mount.test.mjs` — seven count/regex/subset-list updates (OQ-1 table).
- `test/render.test.mjs` — `LOOP_ORDER` (:43) + `loopSteps` deepEqual (:111) +
  `without(...)` at :138 (add `"gsdLearnings"`).

**Files NOT touched (deferred):**
- `lib/discuss.js`, `lib/plan.js`, `planningContext` — recall wiring is OUT of
  scope (D-13, deferred to mempalace GAP-12).
- `lib/_nextActionFor` / `NEXT_ACTION_TO_STEP` — no entry (mirrors milestone-audit).

---

*Research complete. All Open Questions marked (RESOLVED). No external packages
proposed. Every claim tagged with provenance; every in-repo discrete value quoted
with path + line range and read this session.*
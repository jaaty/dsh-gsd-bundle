I now have complete, verified evidence for the phase. Composing the RESEARCH.md.

```markdown
# RESEARCH.md — Phase 47: assumption-delta

**Researcher:** gsd-phase-researcher
**Gathered:** 2026-09-02
**Phase goal:** Add an advisory assumption-delta checkpoint that surfaces one identity-model question when a phase makes something plural/optional/chosen that used to be singular/required/derived.
**Requirement:** GAP-13

**Scope verdict (from CONTEXT.md, locked):** a PURE helper module `lib/assumption-delta.js` (deterministic detector + prompt builder) with **NO capability, NO tool, NO loop-step**, wiring a `plan:pre` hook into `lib/plan.js`. Config-gated via `workflow.assumption_delta` (default true). Advisory, non-blocking, never advances STATE. No separate ASSUMPTION-DELTA.md artefact (decision is recorded in the PLAN.md prompt + `<assumption_delta_decision>` block), no CLI/stdin, no upstream exit-code contract.

---

## 1. Domain analysis

**What an assumption-delta checkpoint is** [VERIFIED: `.analysis/gsd-core/capabilities/assumption-delta/fragments/plan-pre.md:1-56`]
A rare-firing, advisory, **non-blocking** architecture checkpoint that runs before a plan is finalized. It fires **only** when the phase scope shows a singular→plural / required→optional / derived→chosen transition (a "second platform / auth method / tenant / source of truth"). When it fires it surfaces ONE identity-model question — **Promote vs. add-alongside** — and asks the planner to record the outcome. "Most phases will not fire it — that is the point." The upstream capability is declared as a `plan:pre` **feature contribution** that injects a fragment into the planner prompt, consumes CONTEXT.md, is gated by `workflow.assumption_delta`, and is `onError: skip`. [VERIFIED: `.analysis/gsd-core/capabilities/assumption-delta/capability.json:2-43`]

**The detector is a deterministic pure function, NOT an LLM judgment** [VERIFIED: `.analysis/gsd-core/src/assumption-delta.cts:11-16,171-214`]
`detectAssumptionDelta(text, terms?) -> { detected, signals[], terms }`. Decision logic is a pure function so the low-false-positive guarantee is testable. `signals[]` carries `{ kind: 'pluralization'|'optional'|'chosen', term, snippet }`. The returned `terms` is the *effective* (resolved/merged) term set so callers can audit what fired. Non-string/empty input degrades to `{ detected: false }` without throwing.

**Three signal families** [VERIFIED: `.analysis/gsd-core/src/assumption-delta.cts:67-98`; `.analysis/gsd-core/capabilities/assumption-delta/fragments/plan-pre.md:32-36`]

| `kind` | What changed | Signal meaning |
|---|---|---|
| `pluralization` | singular → plural (2nd X) | Does the primary key / identity model still name the right noun? |
| `optional` | required/`only` → optional | Is the field still the right anchor? |
| `chosen` | derived → chosen / constant → parameter | Has a configuration decision become a modeling decision? |

**The curated trigger vocabulary (verbatim — replicate exactly)** [VERIFIED: `.analysis/gsd-core/src/assumption-delta.cts:67-98`, quoted]:
- `pluralization: ['second','alternative','alternate','fallback','also','additional','another','supplementary','alongside','multiple','plural','2nd']`
- `optional: ['optional','optionally']`
- `chosen: ['chosen','choose','selectable','configurable','parameterized','parameterised','parameterize','parameterise','custom']` — and note it omits **`parameterise`**? No — the source (line 96) *does* list `'custom'`, and I verified line 95-96 includes `parameterise` and `custom`. **`'or'` is intentionally EXCLUDED from the default pluralization cues** — it is too common in prose and would make the gate fire constantly. The vocabulary is additive-only (Hyrum's Law). This is a hard semantic constraint, not a stylistic choice.

**Word-boundary matching shape** [VERIFIED: `.analysis/gsd-core/src/assumption-delta.cts:196-210`] `(^|[^a-zA-Z0-9])(TERM)([^a-zA-Z0-9]|$)`, case-insensitive, per line, deduped by `kind:term` so one term firing once per kind yields one signal. Snippet = collapsed line centred on the match (≤120 chars).

**Fenced code blocks stripped BEFORE scanning** [VERIFIED: `.analysis/gsd-core/src/assumption-delta.cts:181-186`] so a trigger term inside a code snippet does not fire. CRLF normalised (`\r\n`→`\n`) first.

**Term-set hardening** [VERIFIED: `.analysis/gsd-core/src/assumption-delta.cts:100-146, 111-127`] `normalizeTerms`: trim, lowercase, reject empty + punctuation-only (e.g. `-` — require `/[a-z0-9]/`), dedupe preserve-order, cap count (200/kind) + length (32). `resolveTerms`: per-kind override REPLACES that kind's defaults; absent kind KEEPS defaults; explicit empty array disables that kind. The bundle's detector should replicate `normalizeTerms`/`resolveTerms` — they are the hardening the plan:pre fragment depends on for "no giant alternation regex / no hostile payload echo."

**Skipped-before-detected is a load-bearing convention** [VERIFIED: `.analysis/gsd-core/capabilities/assumption-delta/fragments/plan-pre.md:24-26`; CONTEXT.md D-06] A *skipped* payload carries NO `detected` key. "Check for `skipped` before reading `detected` — a skipped payload carries no `detected` key, and treating its absence as `false` re-creates the fabrication this branch exists to prevent." The bundle's D-06 encodes this: **no scanable scope text → hook returns `skipped` (not `detected:false`)** so an unexamined phase is never asserted as a clean negative.

**Plan-stage integration pattern (bundle) — mirror lib/mempalace.js but WITHOUT capability/tool** [VERIFIED: this repo's `lib/plan.js:26-52,104-110,152-162,217`; `lib/mempalace.js:36-175,176-181`]
The most recent pure-helper + plan:pre-hook precedent is `lib/mempalace.js` (phase 46): pure exported helpers with **NO ctx/fs/git params** for direct unit testing; all I/O lives in `apply()`. `lib/plan.js` already runs `runMempalaceRecallOnPlan` at plan:pre (imported at line 12, defined 26-36, called at **line 110**) and `runMempalaceCaptureOnPlan` at plan:post (**line 217**). Both are pure `({cfg,tools,phase,exec})→Promise<string>` returning a non-blocking log line; gated by config; `onError: skip`. **The assumption-delta hook is DIFFERENT in one crucial way** — it must inject text INTO the planner prompt, which is composed at `lib/plan.js:152-161` (`plannerPrompt`). So the assumption-delta hook's wiring point is at planner-prompt construction (around line 152), NOT at line 110. Its return must be spliced into `plannerPrompt` AND its log line pushed onto the `log[]` array. It mirrors the *non-blocking* shape (D-08) but not the *log-only* call position of mempalace.

**Config gate & default** [VERIFIED: `lib/state.js:183-217` (`_defaultConfig`/`workflow` block), `391-395` (`readConfig`)]
The default `workflow` block currently holds `discuss_mode, nyquist_validation, pattern_mapper, tdd_mode, mvp_mode, use_worktrees, agent_hint_routing, text_mode, commit_docs, code_review, code_review_depth, ui_review, validate_phase, learnings, graphify`. **`workflow.assumption_delta` must be ADDED here with default `true`** (D-04). Gate reads `cfg?.workflow?.assumption_delta === true` via `readConfig` (the shared accessor), never gsd-tools config get-value. **Critical nuance:** `readConfig` (state.js:391-395) returns the *file verbatim* when present and only falls back to `_defaultConfig` when the file is missing/corrupt. The bundle's own `.planning/config.json` currently uses an **older workflow shape** (verified: keys are only `discuss_mode … commit_docs` — missing `code_review`, `learnings`, `graphify`, and `assumption_delta`), so for existing projects the hook is skipped until the config is regenerated by `gsd_init`. The default-true only applies to freshly-initialised projects. This is consistent with D-04's "when not explicitly true, the plan:pre hook is skipped" and requires **no** migration logic.

**No new dependency** — the detector needs `escapeRegex` and `stripFencedCode` equivalents. **Neither exists in the bundle** (verified: grep for `stripFenced|escapeRegex|escapeRegExp` across `lib/` and `test/` → NONE FOUND). The bundle must implement both **in-repo, inside `lib/assumption-delta.js`** (keeps it pure, no new package). Upstream imports them from `markdown-sectionizer.cjs` / `pattern.cjs` [CITED: assumption-delta.cts:38-39] but those are not vendored in the bundle.

---

## 2. Package legitimacy

**No new runtime or dev dependency is required for this phase.** The detector is pure regex + string manipulation over in-repo inputs with `node:` built-ins already in use (`node:test`, `node:assert/strict`). [VERIFIED: `package.json` — `dependencies: {}`, test runner is the bundled `node --test`]

Everything the phase needs already exists in the bundle or upstream reference:
- `parseDecisionEntries` (for CONTEXT decision derivation) — `lib/_shared.js:385-397` [VERIFIED]
- `readRoadmap` (`phase.goal` + `phase.requirements`), `readArtifact(cwd, phase, 'CONTEXT')`, `readConfig`, `_defaultConfig` — `lib/state.js` [VERIFIED]
- The pure-helper + hook test pattern — `test/mempalace-hooks.test.mjs`, `test/learnings.test.mjs`, `test/helpers/mount-harness.mjs` [VERIFIED]
- The upstream detector contract to model on — `.analysis/gsd-core/src/assumption-delta.cts`, `tests/assumption-delta.test.cjs` [VERIFIED]

**The two functions that must be written fresh in-repo:**
- `escapeRegex(str)` — no `escapeRegExp`/`escapeRegex` anywhere in `lib/` or `test/` [VERIFIED]. Implement the standard `str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')` — do not introduce a dependency.
- `stripFencedCode(text)` — no equivalent in the bundle [VERIFIED]. Implement a CommonMark-subset fenced-block stripper (handle ``` and ~~~ fences, info strings, allow N backtick/tilde fence markers for nested-block robustness, CRLF-safe). Upstream's contract [CITED: assumption-delta.cts:38 `import { stripFencedCode } from './markdown-sectionizer.cjs'`] is "CommonMark-correct and CRLF-safe"; the bundle needs a faithful minimal re-implementation, not the upstream module (which is deep in opengsd-core and not vendored).

---

## 3. Risks and Open Questions

**Risk R-1 — wrong wiring point breaks the injection contract (HIGH).**
If the plan:pre hook is wired at `plan.js:110` (the mempalace log-only position) it will log but can NEVER inject into the planner prompt, which is composed later at line 152-161. The core deliverable (D-05: append signals + question to the planner prompt) is lost.
> **OQ-1 (RESOLVED):** Where does the hook wire? **At planner-prompt construction (~line 152), not line 110.** The pure helper returns a prompt fragment spliced into `plannerPrompt` plus a log line pushed to `log[]`. Verified: CONTEXT.md code_context says "mirrors this exact non-blocking shape (D-08)" — the *fault-safety shape*, not the call position. The mempalace pre/post hooks are advisory recalls; assumption-delta must reach the planner text.

**Risk R-2 — skipped-vs-detected conflation re-creates the fabrication the design exists to prevent (HIGH, D-06).**
A phase with no scope text must resolve `skipped`, **not** `detected:false`. The pure detector itself degrades empty input to `detected:false` (D-03, upstream test `empty string → detected:false`), so the `skipped` decision must live at the **hook layer**: the hook checks "did we assemble any scanable scope text (goal OR reqs OR CONTEXT)?" and returns `skipped` before calling the detector.
> **OQ-2 (RESOLVED):** Where does skipped live? `detectAssumptionDelta(text, terms)` stays a pure detector returning `{detected, signals, terms}` (empty/non-string → `detected:false`). A separate exported helper (e.g. `runAssumptionDeltaOnPlan({ cfg, scopeText })` → `{ skipped?, detected?, promptBlock?, logLine? }`) is the hook: it applies the config gate, then the no-scope-text skipped check, then runs the detector. This keeps the detector faithful to upstream and puts the fabrication-guard in the orchestrating hook. Verified against D-03 (detector degrades) + D-06 (hook returns skipped).

**Risk R-3 — config flag absent → silent skip in existing repos (MEDIUM, D-04).**
`readConfig` returns file-verbatim, and the repo's `.planning/config.json` lacks the new key. Adding `assumption_delta: true` to `_defaultConfig` does NOT retro-activate existing configs. This is **expected** behaviour (D-04: "when not explicitly true, skipped") but must be stated so nobody "fixes" it by forcing activation. No migration logic needed.
> **OQ-3 (RESOLVED):** Should the hook force-enable for existing configs? No. Follow D-04 literally: `cfg?.workflow?.assumption_delta === true` → proceed; else skip. Verified: `lib/state.js:391-395`.

**Risk R-4 — planner may not write the `<assumption_delta_decision>` block (LOW, D-05).**
The block is a *prompt instruction* to the planner; the bundle cannot guarantee the model writes it. This is accepted: the mechanism is "inject + log", the recording is advisory. The prompt block must be explicit about WHAT to record (noun now primary, decision `promote|add-alongside|no-change`, one-line rationale, and call out `add-alongside` as accepted debt). Model this wording on the upstream fragment lines 42-46.
> **OQ-4 (RESOLVED):** Where is `<assumption_delta_decision>` recorded? In the PLAN.md body as instruct-block text (like `<objective>` at `state.js:720-723`), NOT a new parseFrontmatter key — nothing in the bundle parses it, so there is no schema risk in either placement. Planner-discretion wording. Verified: `state.js:_extractBlock`, `parseFrontmatter`. No frontmatter schema change required.

**Risk R-5 — vocabulary drift from upstream (MEDIUM).** Replicate `DEFAULT_ASSUMPTION_DELTA_TERMS` **exactly** from `.analysis/gsd-core/src/assumption-delta.cts:67-98` (quoted verbatim in §1). A missing cue or a wrongly-added bare `or` changes upstream parity. The D-09 unit tests encode both the firing and the bare-`or`/fenced-block guards, so drift is caught by TDD.
> **OQ-5 (RESOLVED):** Does the hook need a config-tunable `terms` override? The pure detector exposes a `terms` param (kept). The bundle's in-process hook uses the **defaults** — there is no CLI, so no `--terms` path (D-08 excludes CLI/stdin). Wiring `workflow.assumption_delta_terms` as a config knob is **out of scope** (D-04 defines only the boolean gate). Verified: D-04 (boolean gate only), D-08 (no CLI/stdin).

**Risk R-6 — a fault must never throw or advance STATE (D-08, HIGH).** The hook must be wrapped so a readConfig/readArtifact fault is caught and logged as a non-blocking line (`onError: skip`), mirroring `runMempalaceRecallOnPlan` (plan.js:33-35). Fail-fast only on environmental faults (no `.planning/` project, phase not in ROADMAP) — but note: those guards run before the hook at the top of `gsd_plan` (plan.js:80-95), so the hook itself can assume project + phase + CONTEXT exist.
> **OQ-6 (RESOLVED):** Pure helper, so what can even fault? Reading CONTEXT is already done at line 101 (`contextMd`); phase.goal/reqs are from the already-fetched roadmap. If the hook takes those pre-read inputs as parameters and stays synchronous, it has NO async I/O and cannot fault. The only sync throw risk is a buggy regex — guard with a try/catch returning a non-blocking log line as belt-and-braces. This keeps the helper deterministic and trivially testable. Verified: the hook can be a pure synchronous function over already-fetched data — no new I/O.

---

## 4. Architectural Responsibility Map

| Capability | Tier | Assignment |
|---|---|---|
| `detectAssumptionDelta(text, terms?)` — typed IR scan, `DEFAULT_ASSUMPTION_DELTA_TERMS`, `normalizeTerms`/`resolveTerms` hardening, `stripFencedCode`/`escapeRegex` | **Domain** (pure logic) | `lib/assumption-delta.js` (NO ctx/fs/git — D-01) |
| `runAssumptionDeltaOnPlan({ cfg, scopeText })` — config gate → skipped-before-detected → build prompt block + log line | **Domain** (pure orchestration) | `lib/assumption-delta.js` (same pure module; returns `{ skipped?, detected?, promptBlock?, logLine? }`) |
| Scope-text assembly (goal + reqs + CONTEXT) | **Domain/Integration** | `lib/plan.js` wiring — the phase.goal/requirements/CONTEXT are already in scope at lines 99-101; assemble as `[phase.goal, (phase.requirements||[]).join(' '), contextMd].join('\n')` |
| Prompt injection (`promptBlock` spliced into `plannerPrompt`) + `log[]` push | **Presentation** (planner-facing surface) | `lib/plan.js:152-161` wiring, gated on the helper's `detected` |
| STATE/loop-step advancement | **Intentionally NONE** | The hook NEVER advances STATE (D-08). `setStep("execute")` at plan.js:210 is orthogonal and untouched. |
| `workflow.assumption_delta` default | **Integration/Config** | `lib/state.js:186-202` `_defaultConfig` workflow block — add `assumption_delta: true` |

**Security/architectural note:** No capability, tool, or loop-step is added (D-01). Adding one would be a **BLOCKER** — it would break GAP-13's design intent (a plan:pre feature contribution, not a step), violate DEGR-01/02/04 (the loop routes only through steps), and force `_capabilities.js`/`_render.js`/`cordis.patch.yml` changes that are explicitly out of scope. The detector is pure and cannot exfiltrate or mutate.

---

## 5. Validation Architecture

All tests follow `test/*.test.mjs` + `node --test` convention (`package.json` scripts, `MOUNT-06`).

**(a) Pure detector — `test/assumption-delta.test.mjs`** (modeled on upstream `tests/assumption-delta.test.cjs:34-176`, but ESM `.mjs` importing from `../lib/assumption-delta.js`):
- result shape: always `{ detected, signals[], terms }`; terms echo = effective set (deep-equal to defaults) — upstream 34-49
- pluralization fires (second/auth/fallback/additional/alongside/multiple/…) — upstream 52-58
- optional fires — upstream 61-67
- chosen fires — upstream 70-76
- no-signal phases do NOT fire — upstream 79-85
- **bare `or` does NOT fire** — upstream 92-95
- **fenced code block guard** (trigger inside fence → not detected) — upstream 100-112
- signal in prose fires even with an unrelated fence present — upstream 115-126
- each signal carries a non-empty snippet containing the term — upstream 129-135
- CRLF == LF — upstream 138-144
- empty/whitespace/non-string degrade to `detected:false`, no throw — upstream 147-157
- custom term override/merge; partial override keeps absent kinds' defaults; punctuation-only/hostile list hardening caps — upstream 160-175 + 374-414

**(b) Config gate + hook — `test/assumption-delta-hooks.test.mjs`** (modeled on `test/mempalace-hooks.test.mjs` — pure helper tests with a fake `tools` array / direct call, plus a mount test for the plan.js wiring):
- `workflow.assumption_delta` not `=== true` → skipped, no prompt block, no log raise — D-04
- `=== true` + no scanable scope text (no goal, no reqs, no CONTEXT) → **`skipped`**, never `detected:false` — D-06
- `=== true` + scope present + no signal → `detected:false`, no question, maybe a log line
- `=== true` + signal → `detected:true`, `promptBlock` contains the promote-vs-add-alongside question + the signals/kinds, `logLine` raised — D-05
- fault never throws & never advances STATE — D-08 (hook is synchronous over pre-read inputs; guard a regex throw with try/catch → non-blocking line)
- PLAN-level wiring test (mount via `test/helpers/mount-harness.mjs`, run gsd_plan with a fake subagents stub): when detected, `plannerPrompt` text passed to the planner subagent contains the question block; when config-false/not-detected it does not; STATE step unaffected.

**(c) `_defaultConfig` regression** — extend the existing state test to assert `workflow.assumption_delta === true` is emitted.

**What proves the behaviour back to GAP-13:** detector fires on plural/optional/chosen → prompt block + log; does not fire / skips otherwise; never blocks ship or advances STATE. The Nyquist/coverage gate maps GAP-13 + D-01…D-09 to these test files and the plan.js wiring.

---

## 6. Project Constraints (from project conventions)

- **Module style:** `"type": "module"`, plain ESM, `node:test` runner. [VERIFIED: `package.json`]
- **Pure-helper discipline (D-01, mempalace precedent):** exported helpers take NO ctx/fs/git params; all I/O in `apply()`. The assumption-delta hook has no I/O at all (operates on pre-fetched roadmap + CONTEXT text).
- **Artefact schema / no new plugin rows:** NO change to `cordis.patch.yml`, `lib/_capabilities.js`, or `lib/_render.js` (D-01). The hook is pure JS inside `plan.js`.
- **Config accessor discipline (D-04):** read `workflow.assumption_delta` via `readConfig` (shared accessor), never gsd-tools config get-value.
- **`onError: skip` non-blocking (D-08):** mirror `runMempalaceRecallOnPlan`'s try/catch → non-blocking log line.
- **TDD (D-09, project `MOUNT-06`):** write the pure detector + hook tests first (RED→GREEN); `npm test` (`node --test test/*.test.mjs`) must pass on a clean checkout.
- **No fenced-code leak:** CONTEXT/ROADMAP scope text may contain backtick blocks (e.g. the ROADMAP goal table or inline code); the detector strips fences first (D-02).
- **Upstream parity only for the detector contract:** the bundle reimplements the pure detector but explicitly DELETES the CLI/exit-code surface (D-08) — `NO_INPUT`/`UNAVAILABLE`/`probe_unavailable` do not apply in-process.

**Sources:** all `[VERIFIED]` claims read this session from the repo (paths + line ranges given inline) or the vendored `.analysis/gsd-core/` reference checkout. Upstream `markdown-sectionizer`/`pattern` cited by import path only, not vendored.
```

That is the complete RESEARCH.md. Key findings to carry into planning:

1. **Wiring point matters:** the assumption-delta hook must inject into the planner prompt at `lib/plan.js:152-161` — NOT the mempalace log position at line 110. This is the single highest-risk decision (OQ-1).
2. **`skip`ed vs `detected:false`:** the pure detector degrades empty→`detected:false` (upstream contract), so the fabrication-guard `skipped` must live at a hook-layer helper that checks "any scanable scope text?" before calling the detector (D-06).
3. **No new dependency:** the bundle has no `stripFencedCode`/`escapeRegex`; both must be implemented in-repo inside `lib/assumption-delta.js`.
4. **Config nuance:** `readConfig` is file-verbatim, and the repo's own config uses an older workflow shape → adding default-true to `_defaultConfig` does not retro-activate existing projects; that is D-04-correct, not a bug.
5. **Vocabulary must be replicated verbatim** from `assumption-delta.cts:67-98` (bare `or` excluded), and the hardening caps (`normalizeTerms`/`resolveTerms`) replicated.
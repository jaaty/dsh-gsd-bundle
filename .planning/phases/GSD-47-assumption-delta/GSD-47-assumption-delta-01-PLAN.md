---
phase: 47-assumption-delta
plan: 01
type: tdd
wave: 1
depends_on: []
files_modified: [lib/assumption-delta.js, test/assumption-delta.test.mjs, test/assumption-delta-hooks.test.mjs]
autonomous: true
requirements: ["GAP-13"]
gap_closure: false
user_setup: []
must_haves:
  truths:
    - "detectAssumptionDelta(text) returns { detected, signals[], terms } and fires true for a singular→plural / required→optional / derived→chosen transition across the curated vocabulary, while a bare 'or' never fires a pluralization signal."
    - "Fenced code blocks are stripped before scanning so a trigger term inside a fence never fires, and CRLF input is treated identically to LF input."
    - "runAssumptionDeltaOnPlan({ cfg, scopeText }) returns skipped (never a bare detected:false) both when workflow.assumption_delta !== true and when there is no scanable scope text (D-04/D-06); when a signal is detected it returns a promptBlock containing the promote-vs-add-alongside question plus a logLine (D-05); a degenerate input pattern never throws and the hook never advances STATE (D-08)."
    - "All exported helpers take NO ctx/fs/git params — the module is pure and directly unit-testable (D-01)."
  artifacts:
    - path: "lib/assumption-delta.js"
      provides: "pure deterministic assumption-delta detector + prompt builder + orchestrating hook, with no capability/tool/loop-step and no ctx/fs/git params (D-01)"
      min_lines: 200
      exports: ["detectAssumptionDelta", "escapeRegex", "stripFencedCode", "DEFAULT_ASSUMPTION_DELTA_TERMS", "normalizeTerms", "resolveTerms", "buildAssumptionDeltaPrompt", "runAssumptionDeltaOnPlan"]
    - path: "test/assumption-delta.test.mjs"
      provides: "unit matrix for the pure detector per D-09 (result shape, firing, no-signal, bare-or guard, fenced-block guard, CRLF, degrade, term override/hardening)"
      min_lines: 60
      exports: []
    - path: "test/assumption-delta-hooks.test.mjs"
      provides: "unit matrix for runAssumptionDeltaOnPlan per D-04/D-05/D-06/D-08 (config gate, skipped-before-detected, detected→promptBlock+logLine, fault never-throws)"
      min_lines: 60
      exports: []
  key_links:
    - from: "test/assumption-delta.test.mjs"
      to: "lib/assumption-delta.js"
      via: "ESM import of the pure detector and vocabulary helpers"
      pattern: "from \"\\.\\./lib/assumption-delta\\.js\""
    - from: "test/assumption-delta-hooks.test.mjs"
      to: "lib/assumption-delta.js"
      via: "ESM import of runAssumptionDeltaOnPlan + buildAssumptionDeltaPrompt"
      pattern: "from \"\\.\\./lib/assumption-delta\\.js\""
---
<objective>
Create the pure assumption-delta module (lib/assumption-delta.js) and its full unit-test suite. This plan delivers the DETERMINISTIC detector (escapeRegex, stripFencedCode, DEFAULT_ASSUMPTION_DELTA_TERMS, normalizeTerms, resolveTerms, detectAssumptionDelta) plus the orchestrating hook-layer helper (buildAssumptionDeltaPrompt, runAssumptionDeltaOnPlan) that encodes the config gate (D-04), the skipped-before-detected fabrication guard (D-06), the detected→promptBlock+logLine surface (D-05), and the never-throws soft-gate (D-08). Per D-01 the module is PURE — NO capability, NO tool, NO loop-step, and NO ctx/fs/git params — so every helper is directly unit-testable. The plan.js wiring and the _defaultConfig flag are deliberately deferred to plan 02 (wave 2). This is the tracer slice: the detector + one end-to-end hook call, test-first (RED→GREEN), establishing the full behaviour contract before integration.
</objective>
<context>
- lib/mempalace.js — the pure-helper + plan-pre precedent: exported helpers with NO ctx/fs/git for direct unit testing; mirror its shape but for assumption-delta (D-01), NOT its CLI/capability surface.
- lib/_shared.js — parseDecisionEntries (lines 385-397) for deriving CONTEXT decision text; the detector may reuse it or scan raw text at the executor's discretion.
- .analysis/gsd-core/src/assumption-delta.cts — the upstream detector contract: DEFAULT_ASSUMPTION_DELTA_TERMS (lines 67-98), normalizeTerms/resolveTerms hardening (100-146), stripFencedCode (181-186), word-boundary regex (196-210). READ before implementing — replicate the vocabulary verbatim.
- .analysis/gsd-core/tests/assumption-delta.test.cjs — the upstream detector test matrix to model test/assumption-delta.test.mjs on (firing, no-signal, bare-'or' guard, fenced-block guard, CRLF, degrade, term override/hardening).
- test/mempalace-hooks.test.mjs — the hook-layer test pattern (config gate → skipped; detected invokes; fault never blocks).
</context>
<tasks>
  <task type="auto">
    <name>Task 1 (RED): write the detector + hook-layer unit test matrices</name>
    <files>test/assumption-delta.test.mjs, test/assumption-delta-hooks.test.mjs</files>
    <read_first>lib/_shared.js, .analysis/gsd-core/tests/assumption-delta.test.cjs, .analysis/gsd-core/src/assumption-delta.cts</read_first>
    <action>Create test/assumption-delta.test.mjs and test/assumption-delta-hooks.test.mjs using the node:test + node:assert/strict conventions (see test/mempalace-hooks.test.mjs and test/mempalace.test.mjs for style; package.json runs `node --test test/*.test.mjs`, module type is ESM). Both files ESM-import from ../lib/assumption-delta.js the exports named in this plan's frontmatter — the module does NOT exist yet, so every test is genuinely RED.

test/assumption-delta.test.mjs MUST cover, per D-09 and the upstream matrix:
- result shape: detectAssumptionDelta(text) always yields { detected, signals[], terms }; the returned terms deep-equal the effective (resolved) term set.
- pluralization firing: each of second/alternative/alternate/fallback/also/additional/another/supplementary/alongside/multiple/plural/2nd fires a signal with kind 'pluralization'.
- optional firing: optional/optionally fire kind 'optional'; chosen fires kind 'chosen' (chosen/choose/selectable/configurable/parameterized/parameterised/parameterize/parameterise/custom).
- no-signal phase returns detected:false with an empty signals array.
- BARE 'or' does NOT fire pluralization (the deliberate exclusion).
- a trigger term inside a fenced code block (both ``` and ~~~ fences, with info strings) does NOT fire; an unrelated fence in the prose does not suppress a genuine trigger outside it.
- each signal carries a non-empty snippet containing the matched term (collapsed, ≤120 chars).
- CRLF input behaves identically to LF input.
- empty string / whitespace-only / non-string (e.g. null, undefined, a number) degrade to detected:false WITHOUT throwing.
- custom term override/merge: a terms { kind: [..] } override REPLACES that kind's defaults; an absent kind KEEPS its defaults; an explicit empty array DISABLES that kind; punctuation-only/hostile inputs are hardened (deduped, length/count capped per normalizeTerms/resolveTerms).

test/assumption-delta-hooks.test.mjs MUST cover, per D-04/D-05/D-06/D-08:
- runAssumptionDeltaOnPlan returns a skipped result (never { detected:false }) when cfg?.workflow?.assumption_delta !== true, and no promptBlock/logLine are produced (D-04).
- when the gate is on but scopeText is empty/whitespace, result is skipped (D-06) — assert the result does NOT carry a detected key and is never a clean negative.
- when the gate is on and scopeText contains a signal, result.detected is true, promptBlock is non-empty and contains the promote-vs-add-alongside identity-model question and the <assumption_delta_decision> instruction, and logLine is non-empty (D-05).
- when the gate is on and no signal is present, result is detected:false with no promptBlock.
- a scopeText that would blow up a naive regex (hostile/punctuation terms) still returns without throwing (D-08): wrap the call and assert it rejects/returns rather than throwing.
- runAssumptionDeltaOnPlan takes ONLY { cfg, scopeText }-shaped params with no ctx/fs/git and never calls setActivePhase or any state mutator (D-08) — assert the signature has no I/O (inspect the function arity/params or simply that it is synchronous and pure).
- buildAssumptionDeltaPrompt({ signals }) — the returned block states the one identity-model question (promote the new general representation to primary / add-alongside), lists each kind:term signal, instructs recording an <assumption_delta_decision> with the noun-now-primary, decision (promote|add-alongside|no-change), one-line rationale, and calls out add-alongside as accepted debt; it also notes the optional invariant/contract test companion per D-07.

Import the module; run `node --test test/assumption-delta.test.mjs test/assumption-delta-hooks.test.mjs` and CONFIRM the run errors on the missing-module import (RED). Do not implement any lib code in this task.</action>
    <verify>cd /var/home/jatyeo/dev/dsh-gsd-bundle && node --test test/assumption-delta.test.mjs test/assumption-delta-hooks.test.mjs — expect an import/ERR_MODULE_NOT_FOUND failure (module not yet created) proving the tests reference the planned exports.</verify>
    <acceptance_criteria>
      - Both test files reference only ESM imports ending in from "../lib/assumption-delta.js"
      - test/assumption-delta.test.mjs covers the D-09 detector list (result shape, 3 firing kinds, no-signal, bare-'or' guard, fenced-block guard, CRLF, degrade, term override/hardening)
      - test/assumption-delta-hooks.test.mjs covers D-04 config-gate skip, D-06 no-scope skip, D-05 detected→promptBlock+logLine, D-08 never-throws
      - `node --test test/assumption-delta.test.mjs test/assumption-delta-hooks.test.mjs` fails on import (RED) before any lib code exists
    </acceptance_criteria>
    <done>Both unit test files written and confirmed RED (import failure) against the not-yet-created module. Commit scope "test:".</done>
  </task>
  <task type="auto">
    <name>Task 2 (GREEN): implement the pure assumption-delta module</name>
    <files>lib/assumption-delta.js</files>
    <read_first>lib/mempalace.js, lib/_shared.js, .analysis/gsd-core/src/assumption-delta.cts</read_first>
    <action>Create lib/assumption-delta.js as a PURE ESM module (plain exports, no node:fs, no child_process, no ctx) implementing exactly the exports named in the frontmatter. Replicate the upstream contract from .analysis/gsd-core/src/assumption-delta.cts; do NOT vendor the upstream module — write it in-repo.

Exact identifiers and behaviours:
- DEFAULT_ASSUMPTION_DELTA_TERMS — an immutable object whose keys are the three kinds and whose arrays replicate the upstream vocabulary VERBATIM: pluralization: ["second","alternative","alternate","fallback","also","additional","another","supplementary","alongside","multiple","plural","2nd"]; optional: ["optional","optionally"]; chosen: ["chosen","choose","selectable","configurable","parameterized","parameterised","parameterize","parameterise","custom"]. 'or' is deliberately EXCLUDED from pluralization; do not add it.
- escapeRegex(str) — standard escape: str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"). (No escapeRegex/escapeRegExp exists in this repo — confirm with grep before relying on an existing one.)
- stripFencedCode(text) — a pure CommonMark-subset fenced-block stripper: removes lines inside ``` and ~~~ fences (including info strings after the opening marker), tolerating runs of N backtick/tilde markers (N≥3), CRLF-safe (normalise \r\n → \n first). Fenced content is removed BEFORE scanning so a trigger term inside a fence does not fire (D-02).
- normalizeTerms(terms) — per-kind: trim, lowercase, reject empty and punctuation-only entries (require a [a-z0-9] char), dedupe preserving order, cap count (200/kind) and per-term length (32).
- resolveTerms(terms) — per-kind override REPLACES that kind's defaults; an absent kind KEEPS its defaults; an explicit empty array disables that kind.
- detectAssumptionDelta(text, terms?) — deterministic typed IR. Non-string/empty/whitespace input degrades to { detected:false, signals:[], terms: resolved } WITHOUT throwing (D-03). Otherwise: resolve terms, strip fenced blocks, then match each term with the word-boundary regex (^|[^a-zA-Z0-9])(TERM)([^a-zA-Z0-9]|$), case-insensitive, LINE BY LINE, snippet = collapsed line centred on the match (≤120 chars). Signals dedupe by kind:term (one signal per term per kind). Returns { detected, signals[], terms } where signals[] items are { kind, term, snippet } and terms is the effective resolved set.
- buildAssumptionDeltaPrompt({ signals }) — returns the planner-prompt fragment: the ONE identity-model question (promote the new general representation to primary and demote the old specific one vs add-alongside), a list of the detected kind:term signals, an explicit instruction to record an <assumption_delta_decision> block in PLAN.md frontmatter/body with (a) the noun now primary, (b) the decision promote|add-alongside|no-change with a one-line rationale, (c) calling out add-alongside as accepted debt, and (d) per D-07 a note about the optional invariant/contract test companion (e.g. 'every confirmed default round-trips through the primary use-path, for every supported variant').
- runAssumptionDeltaOnPlan({ cfg, scopeText }) — the orchestrating hook, synchronous and pure. Ordering is load-bearing (D-06): (1) gate — if cfg?.workflow?.assumption_delta !== true return { skipped: "config", logLine } ("assumption-delta: disabled (workflow.assumption_delta) — skipped"); (2) scope — if String(scopeText).trim() is empty return { skipped: "no-scope", logLine } (NEVER a detected:false — the fabrication guard); (3) detect — if no signal, return { detected:false, logLine? }; if a signal fires, return { detected:true, signals, promptBlock: buildAssumptionDeltaPrompt({ signals }), logLine } (logLine e.g. `assumption-delta: detected ${signals.length} signal(s) — surfaced promote-vs-add-alongside question`). Wrap the detector call in try/catch so a regex/buffer fault logs a non-blocking line and never throws (D-08). This function takes ONLY { cfg, scopeText } — no state accessor, so it cannot advance STATE.

Mirror the pure-helper structure of lib/mempalace.js: exported pure functions, no I/O, no apply(). Do NOT add a capability, a tool, or anything in lib/_capabilities.js / lib/_render.js (D-01). Do NOT create any ASSUMPTION-DELTA.md artefact (decision is recorded via the promptBlock, not a file).</action>
    <verify>cd /var/home/jatyeo/dev/dsh-gsd-bundle && node --test test/assumption-delta.test.mjs test/assumption-delta-hooks.test.mjs — all tests pass.</verify>
    <acceptance_criteria>
      - grep -c "default.*assumption-delta.js\|DEFAULT_ASSUMPTION_DELTA_TERMS\|detectAssumptionDelta\|runAssumptionDeltaOnPlan" lib/assumption-delta.js ≥ 4
      - lib/assumption-delta.js contains NO import of node:fs / node:child_process / ctx — grep for "node:fs\|node:child_process" returns nothing in the file
      - The word "'or'" is NOT an element of the pluralization array (grep the pluralization array)
      - `node --test test/assumption-delta.test.mjs test/assumption-delta-hooks.test.mjs` exits 0 (GREEN)
      - npm test still passes for the whole suite (no other file broken by the new module)
    </acceptance_criteria>
    <done>lib/assumption-delta.js implements every frontmatter export; both unit matrices pass; whole suite green. Commit scope "feat:".</done>
  </task>
</tasks>

// @dsh-gsd/bundle/assumption-delta — an advisory assumption-delta checkpoint
// (opengsd GAP-13 / upstream #1561). A rarely-firing, advisory architecture
// checkpoint: when a phase makes something PLURAL / OPTIONAL / CHOSEN that used
// to be SINGULAR / REQUIRED / DERIVED, the primary key / identity model may
// silently stop matching the generalized intent. This module scans phase-scope
// prose for the linguistic signals of that transition so a plan:pre hook can
// surface ONE identity-model question (promote vs add-alongside).
//
// Per D-01 this is a PURE helper module — NO capability, NO tool, NO loop-step,
// and NO ctx/fs/git params. Every exported helper is directly unit-testable.
// The plan.js wiring and the _defaultConfig flag live in plan 02 (wave 2).
//
// Design notes (mirroring upstream assumption-delta.cts):
//  - DETERMINISTIC + TYPED IR. The "does it fire?" decision is a pure function
//    returning { detected, signals, terms }, not an LLM judgment — so the
//    low-false-positive guarantee is testable.
//  - BARE "or" IS INTENTIONALLY EXCLUDED from the default pluralization cues.
//    Bare "or" is extremely common in English prose and would make the gate fire
//    on nearly every phase description. Pluralization requires a stronger
//    second-case cue (second / alternative / fallback / additional / ...).
//  - FENCED CODE BLOCKS ARE STRIPPED first (stripFencedCode) so a trigger term
//    that appears only inside a code snippet does not fire (D-02).
//  - The orchestrating hook (runAssumptionDeltaOnPlan) encodes the config gate
//    (D-04), the skipped-before-detected fabrication guard (D-06), the
//    detected→promptBlock+logLine surface (D-05), and the never-throws soft gate
//    (D-08). It is synchronous and pure over { cfg, scopeText } — it cannot
//    advance STATE.

// ── curated default trigger vocabulary (replicated VERBATIM from upstream) ────
// Each kind lists cue terms that signal a core-assumption monopoly has been lost.
// ADDITIVE-ONLY (Hyrum's Law: once shipped, this set is a depended-upon
// interface). Tunable via the `terms` parameter.
export const DEFAULT_ASSUMPTION_DELTA_TERMS = Object.freeze({
  // Primary trigger — a second X where there was one.
  // Bare "or" excluded (prose-frequency false positives).
  pluralization: Object.freeze([
    "second",
    "alternative",
    "alternate",
    "fallback",
    "also",
    "additional",
    "another",
    "supplementary",
    "alongside",
    "multiple",
    "plural",
    "2nd",
  ]),
  // required / `only` -> optional
  optional: Object.freeze(["optional", "optionally"]),
  // derived -> chosen / constant -> parameter
  chosen: Object.freeze([
    "chosen",
    "choose",
    "selectable",
    "configurable",
    "parameterized",
    "parameterised",
    "parameterize",
    "parameterise",
    "custom",
  ]),
});

/** Hardening caps for the tunable term vocabulary (Codex review finding). */
const MAX_TERMS_PER_KIND = 200;
const MAX_TERM_LEN = 32;

/**
 * Escape a string for use inside a RegExp literal. Standard implementation —
 * the bundle has no escapeRegex/escapeRegExp helper elsewhere (verified), so it
 * lives here in-repo to keep the module pure (no new dependency).
 */
export function escapeRegex(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Strip fenced code blocks from markdown text (CommonMark-subset, CRLF-safe).
 * Removes lines inside ``` and ~~~ fences (including info strings after the
 * opening marker), tolerating runs of N backtick/tilde markers (N≥3) for
 * nested-block robustness. Fenced content is removed BEFORE scanning so a
 * trigger term inside a fence does not fire (D-02). Pure.
 */
export function stripFencedCode(text) {
  const src = String(text == null ? "" : text).replace(/\r\n/g, "\n");
  const lines = src.split("\n");
  const out = [];
  let fence = null; // the marker char run that opened the current fence, or null
  for (const line of lines) {
    if (fence) {
      // Inside a fence: close when a line is a fence marker of the same char
      // with length >= the opening run and only whitespace after it.
      const close = line.match(/^(\s*)(`{3,}|~{3,})(\s*)$/);
      if (close && close[2][0] === fence[0] && close[2].length >= fence.length) {
        fence = null;
      }
      continue; // drop fenced content
    }
    const open = line.match(/^(\s*)(`{3,}|~{3,})(.*)$/);
    if (open) {
      fence = open[2]; // opening marker run (char + length)
      continue; // drop the opening fence line (incl. info string)
    }
    out.push(line);
  }
  return out.join("\n");
}

/**
 * Normalize a caller-provided term list: trim, lowercase, reject empties and
 * punctuation-only terms (e.g. "-"), dedupe (preserve order), and cap the
 * count/length so a huge or hostile `terms` value cannot build a giant
 * alternation regex or echo a massive payload. Defaults are already clean, so
 * this is a no-op on them.
 */
export function normalizeTerms(list) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const out = [];
  for (const raw of list) {
    if (typeof raw !== "string") continue;
    const t = raw.trim().toLowerCase().slice(0, MAX_TERM_LEN);
    // Require at least one alphanumeric char so punctuation-only terms like
    // "-" cannot match prose punctuation as a "signal".
    if (!t || !/[a-z0-9]/.test(t)) continue;
    if (seen.has(t)) continue;
    seen.add(t);
    out.push(t);
    if (out.length >= MAX_TERMS_PER_KIND) break;
  }
  return out;
}

/**
 * Resolve the effective term set: per-kind override. An explicitly-provided
 * non-empty array for a kind REPLACES that kind's defaults (then normalized);
 * an absent kind KEEPS its defaults. An explicitly-empty array disables that
 * kind (override present, normalized to []). This lets a caller narrow one axis
 * without re-declaring the others.
 */
export function resolveTerms(terms) {
  const merge = (key) => {
    const t = terms && terms[key];
    return Array.isArray(t) ? normalizeTerms(t) : [...DEFAULT_ASSUMPTION_DELTA_TERMS[key]];
  };
  return {
    pluralization: merge("pluralization"),
    optional: merge("optional"),
    chosen: merge("chosen"),
  };
}

/** Trim + collapse + truncate a context window around a match for the snippet. */
function makeSnippet(line, term) {
  const cleaned = line.replace(/\s+/g, " ").trim();
  if (cleaned.length <= 120) return cleaned;
  // Centre the window on the matched term when the line is long.
  const idx = cleaned.toLowerCase().indexOf(term);
  if (idx < 0) return cleaned.slice(0, 120);
  const start = Math.max(0, idx - 50);
  const end = Math.min(cleaned.length, idx + term.length + 50);
  const prefix = start > 0 ? "…" : "";
  const suffix = end < cleaned.length ? "…" : "";
  return `${prefix}${cleaned.slice(start, end)}${suffix}`;
}

/**
 * Detect assumption-delta signals in phase-scope prose.
 *
 * @param {unknown} text - Roadmap phase section / scope prose. Non-string inputs
 *   degrade to `{ detected: false }` without throwing (D-03).
 * @param {object} [terms] - Optional per-kind override (see resolveTerms).
 * @returns {{ detected: boolean, signals: Array<{kind,term,snippet}>, terms: object }}
 *   typed IR. `terms` is the effective (merged) set actually used, so
 *   callers/tests can audit what fired.
 */
export function detectAssumptionDelta(text, terms) {
  if (typeof text !== "string") {
    return { detected: false, signals: [], terms: resolveTerms(terms) };
  }

  const effective = resolveTerms(terms);

  // Strip fenced code blocks so trigger terms inside code snippets do not fire.
  // stripFencedCode is CommonMark-subset and CRLF-safe.
  const stripped = stripFencedCode(text.replace(/\r\n/g, "\n"));
  if (stripped.trim().length === 0) {
    return { detected: false, signals: [], terms: effective };
  }

  const signals = [];
  const kinds = ["pluralization", "optional", "chosen"];

  for (const kind of kinds) {
    const cueTerms = effective[kind];
    if (cueTerms.length === 0) continue;
    // Word-boundary anchored, case-insensitive — same shape as ui-safety-gate.
    // (^|[^a-zA-Z0-9])(TERM)([^a-zA-Z0-9]|$) prevents interior-substring matches.
    const escaped = cueTerms.map(escapeRegex).join("|");
    const pattern = new RegExp("(^|[^a-zA-Z0-9])(" + escaped + ")([^a-zA-Z0-9]|$)", "gi");
    const seen = new Set();
    for (const line of stripped.split("\n")) {
      pattern.lastIndex = 0;
      for (const m of line.matchAll(pattern)) {
        const raw = m[2];
        if (!raw) continue;
        const matched = raw.toLowerCase();
        const key = `${kind}:${matched}`;
        if (seen.has(key)) continue;
        seen.add(key);
        signals.push({ kind, term: matched, snippet: makeSnippet(line, matched) });
      }
    }
  }

  return { detected: signals.length > 0, signals, terms: effective };
}

/**
 * Build the planner-prompt fragment surfaced when assumption-delta fires (D-05).
 * States the ONE identity-model question (promote the new general representation
 * to primary vs add-alongside), lists the detected kind:term signals, instructs
 * recording an <assumption_delta_decision> block in PLAN.md (noun-now-primary,
 * decision promote|add-alongside|no-change, one-line rationale, add-alongside as
 * accepted debt), and notes the optional invariant/contract test companion (D-07).
 * Pure.
 */
export function buildAssumptionDeltaPrompt({ signals }) {
  const list = (signals || [])
    .map((s) => `- \`${s.kind}\` — "${s.term}" (${s.snippet})`)
    .join("\n");
  return [
    "<assumption_delta>",
    "The phase scope shows a singular→plural / required→optional / derived→chosen transition (a second platform / auth method / tenant / source of truth).",
    "",
    "ONE identity-model question: promote the new general representation to primary and demote the old specific one to a detail of one variant, rather than adding it alongside?",
    "",
    "Detected signals:",
    list || "- (none)",
    "",
    "Record an <assumption_delta_decision> block in the PLAN.md frontmatter/body:",
    "- the noun that is now primary,",
    "- the decision: promote | add-alongside | no-change, with a one-line rationale,",
    "- if add-alongside, call it out as accepted debt.",
    "",
    "Optional invariant/contract test companion: every confirmed default round-trips through the primary use-path, for every supported variant.",
    "</assumption_delta>",
  ].join("\n");
}

/**
 * The orchestrating hook-layer helper (D-04/D-05/D-06/D-08). Synchronous and
 * pure over { cfg, scopeText } — no ctx, no fs, no git, no state accessor, so it
 * can never advance STATE. Ordering is load-bearing (D-06):
 *   1. gate — workflow.assumption_delta !== true → skipped (D-04);
 *   2. scope — no scanable scope text → skipped, NEVER a bare detected:false
 *      (the fabrication guard, D-06);
 *   3. detect — no signal → detected:false; a signal → detected:true with a
 *      promptBlock (buildAssumptionDeltaPrompt) + a logLine (D-05).
 * A detector fault is caught and logged as a non-blocking line (D-08).
 *
 * @param {{ cfg?: object, scopeText?: unknown }} params
 * @returns {{ skipped?: string, detected?: boolean, signals?: Array, promptBlock?: string, logLine?: string }}
 */
export function runAssumptionDeltaOnPlan({ cfg, scopeText }) {
  // (1) config gate (D-04): when not explicitly true, skip.
  if (!(cfg && cfg.workflow && cfg.workflow.assumption_delta === true)) {
    return { skipped: "config" };
  }
  // (2) skipped-before-detected (D-06): no scanable scope text → skipped, never
  // a clean negative.
  const scope = String(scopeText == null ? "" : scopeText).trim();
  if (!scope) {
    return { skipped: "no-scope" };
  }
  // (3) detect (D-05/D-08): a detector fault logs a non-blocking line, never throws.
  try {
    const { detected, signals } = detectAssumptionDelta(scope);
    if (!detected) {
      return { detected: false };
    }
    return {
      detected: true,
      signals,
      promptBlock: buildAssumptionDeltaPrompt({ signals }),
      logLine: `assumption-delta: detected ${signals.length} signal(s) — surfaced promote-vs-add-alongside question`,
    };
  } catch (e) {
    const cause = (e && e.message) || String(e);
    return { skipped: "fault", logLine: `assumption-delta: non-blocking — detector fault (${cause})` };
  }
}

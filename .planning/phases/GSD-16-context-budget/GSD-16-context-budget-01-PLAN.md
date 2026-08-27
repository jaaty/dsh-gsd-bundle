---
phase: 16-context-budget
plan: 01
type: execute
wave: 1
depends_on: []
files_modified: ["lib/_runner.js", "lib/_shared.js", "test/context-budget.test.mjs"]
autonomous: true
requirements: ["CQ-06"]
user_setup: []
must_haves:
  truths:
    - "A planning context whose summed entry contents exceed the total budget is cut: head/earliest entries are preserved, whole trailing entries are dropped, and (only if needed) the last kept entry is trimmed so the total fits."
    - "When any entry is truncated, the returned block text contains an inline audit notice naming how many entries were truncated and their labels."
    - "Two entries with byte-identical content strings are injected only once (first occurrence wins)."
  artifacts:
    - path: "lib/_runner.js"
      provides: "planningContext(entries, maxPerFile=60000, maxTotal=0) returning { text, truncated } with per-file cap, total-budget trim, exact-content dedup, and an inline audit notice."
      min_lines: 40
      exports: ["planningContext"]
    - path: "lib/_shared.js"
      provides: "contextBudget(contextWindow) — single source for the 0.45 fraction and the 90000 fallback constant (D-02/D-03)."
      min_lines: 5
      exports: ["contextBudget"]
    - path: "test/context-budget.test.mjs"
      provides: "Pure node:test unit tests proving return shape, per-file cap retention, total-budget trim, last-entry trim, dedup, whitespace/empty skip, String() coercion, audit notice presence, and contextBudget."
      min_lines: 80
      exports: []
  key_links:
    - from: "lib/_runner.js"
      to: "lib/_shared.js"
      via: "planningContext does NOT import contextBudget (maxTotal is passed in per D-03); contextBudget is a separate exported helper in _shared.js used by call sites in PLAN 02."
      pattern: "export function planningContext"
---
<objective>
Rewire the pure domain core: give `planningContext` in `lib/_runner.js` a total truncation budget (summed entry-content length), a `{ text, truncated }` return shape, an inline audit notice, and exact-content dedup — and add the single-source `contextBudget` helper in `lib/_shared.js`. Deliver a dedicated unit-test suite so every behavior in CQ-06 (D-01…D-08) is proven. The five call sites are wired in PLAN 02 (depends on this plan). Pure and zero-dependency: no new packages, `node --test` only.
</objective>
<context>lib/_runner.js (lines 34-46 — current planningContext), lib/_shared.js (shared pure helpers, add near the misc section), test/ (node:test + node:assert/strict pattern; no existing planningContext tests)</context>
<tasks>
<task type="auto">
<name>Task 1 (tracer): Rewrite planningContext with total-budget truncation, dedup, and surfaced truncation</name>
<files>lib/_runner.js</files>
<read_first>lib/_runner.js</read_first>
<action>Replace the current `planningContext(entries, maxPerFile = 60000)` in lib/_runner.js (lines 36-46) with a new pure implementation `planningContext(entries, maxPerFile = 60000, maxTotal = 0)` that returns `{ text, truncated }`. Keep the existing `import { blocksToText } from "./_shared.js"`; do NOT add contextBudget here (D-03: call sites derive maxTotal and pass it in). Implement exactly:
1. Iterate `entries`; skip when `!e || e.content === undefined || e.content === null` (existing). Coerce non-string content with `String(e.content)` (D-08).
2. NEW D-08: skip when `String(e.content).trim() === ""` (whitespace-only entries are skipped, honoring D-08's letter; no existing test depends on the current include-whitespace behaviour).
3. NEW D-07 dedup: keep a Set of the coerced content strings already kept; skip an entry whose content string is already in the Set (first occurrence wins). Only add to the Set when the entry is actually kept.
4. Per-file cap (unchanged default, D-08): if `content.length > maxPerFile`, set `content = content.slice(0, maxPerFile) + "\n…(truncated)…\n"` preserving the exact existing marker.
5. Accumulate each kept entry as `{ label, content, originalChars, keptChars }` where originalChars is the coerced content length before the per-file cap and keptChars is the length after the cap.
6. NEW D-01/D-04 total budget: let `sum` be the sum of `content.length` over all kept entries (accounting counts entry CONTENT lengths only — labels/fences/blank lines are excluded per D-01). If `maxTotal > 0 && sum > maxTotal`: drop whole entries from the END (set keptChars to 0, remove content) until sum <= maxTotal; if sum is still > maxTotal after dropping (only the head remains and it is over budget), trim that last kept entry's content to exactly fit the remaining budget (set keptChars accordingly, >= 0).
7. Build the `truncated` array (D-05): one object `{ label, originalChars, keptChars }` per kept entry where `keptChars < originalChars`, in entry-processing order (covers both per-file-capped and total-trimmed entries, including fully-dropped trailing entries with keptChars 0).
8. NEW D-06 inline audit: when `truncated.length > 0`, append inside the block, immediately before the closing `</planning_context>`, a single line exactly like: `…(N entries truncated: label1, label2, …)…` where N is truncated.length and the labels are the truncated labels joined by ", ". The audit lives INSIDE the returned text so the fresh subagent sees it.
9. Assemble `text` as today: `<planning_context>`, then per kept entry `### <label>`, a fenced code block, a blank line, then the optional audit line, then `</planning_context>`. Return `{ text, truncated }`.
10. Preserve D-08 edge semantics: `maxTotal <= 0` means NO total cap (per-file maxPerFile still applies). Never throw on malformed entries.
Update the doc-comment to describe the total budget and the `{ text, truncated }` return shape.</action>
<verify>node -e 'import("./lib/_runner.js").then(m => { const out = m.planningContext([{label:"A",content:"x".repeat(70000)}], 60000, 90000); console.log(typeof out.text, Array.isArray(out.truncated), out.truncated.length, /truncated/.test(out.text)); })'</verify>
<acceptance_criteria>
- `planningContext` returns `{ text, truncated }`; grep `return {` with `truncated` nearby in lib/_runner.js
- With maxTotal=90000 and two entries summing > 90000, the trailing entry is fully dropped (its truncated entry has keptChars 0) and the head entry's full content remains
- An identical content string injected twice appears once; a node -e run counting a repeated label/content yields 1
- A whitespace-only entry is skipped; the `…(truncated)…` per-file marker is still present for an over-60000 entry
- The audit line matches /\(\d+ entries truncated: .*\)/ iff truncated.length > 0 (D-06)</acceptance_criteria>
<done>A `planningContext` that returns `{ text, truncated }`, applies the total budget after the per-file cap per D-04, dedupes identical content (D-07), skips whitespace entries (D-08), and appends an inline audit notice (D-06), with the unit suite in task 3 proving each behaviour.</done>
</task>
<task type="auto">
<name>Task 2: add contextBudget helper to lib/_shared.js</name>
<files>lib/_shared.js</files>
<read_first>lib/_shared.js</read_first>
<action>Add to lib/_shared.js a new exported pure helper `contextBudget(contextWindow)`: given a numeric input, return `Math.round(Number(contextWindow) * 0.45)` when `Number(contextWindow)` is a finite positive number, otherwise return the hardcoded fallback `90000`. It must never return a value <= 0. This helper is the single source for the 0.45 fraction and the 90000 fallback (D-02/D-03). Place it in the misc section near `blocksToText`. Add a doc comment stating it derives the planningContext total budget from config.json `context_window` and is the single source for the fraction and fallback.</action>
<verify>node -e 'import("./lib/_shared.js").then(m => { console.log(m.contextBudget(200000), m.contextBudget(undefined), m.contextBudget(NaN), m.contextBudget(0), m.contextBudget("abc")); })'</verify>
<acceptance_criteria>
- grep "export function contextBudget" in lib/_shared.js
- `contextBudget(200000)` === 90000, `contextBudget(undefined)` === 90000, `contextBudget(0)` === 90000, `contextBudget(NaN)` === 90000, `contextBudget(-5)` === 90000
- `contextBudget(100000)` === 45000</acceptance_criteria>
<done>lib/_shared.js exports `contextBudget` returning `round(window*0.45)` for positive finite input and `90000` otherwise, never <= 0 — the single source for fraction + fallback.</done>
</task>
<task type="auto">
<name>Task 3: add comprehensive unit tests for planningContext and contextBudget</name>
<files>test/context-budget.test.mjs</files>
<read_first>lib/_runner.js, lib/_shared.js</read_first>
<action>Create `test/context-budget.test.mjs` using `node:test` + `node:assert/strict` (mirror the style of test/_shared.test.mjs). Import `planningContext` from `../lib/_runner.js` and `contextBudget` from `../lib/_shared.js`. Add named tests proving each behaviour (any failure fails CQ-06):
1. Return shape: `planningContext([{label:"a",content:"x"},{label:"b",content:"y"}])` returns `{ text, truncated }`; `truncated` is `[]`; `text` contains `### a`, `### b`, `<planning_context>`, `</planning_context>`.
2. Per-file cap retained (D-08): a 70000-char entry with the default maxPerFile produces text containing `…(truncated)…` and one truncated entry with keptChars < originalChars.
3. Total-budget head-preserving trim (D-04): three entries whose summed content exceeds maxTotal — assert the earliest (head) entries survive and the trailing entry is dropped (its truncated entry has keptChars 0); the text no longer contains the dropped label.
4. Last-kept-entry trim (D-04): two entries whose summed content exceeds maxTotal by a small amount — assert the first entry's content is trimmed to exactly fit and it appears once in truncated with keptChars between 0 and originalChars.
5. `maxTotal <= 0` means no total cap (D-08): maxTotal 0 or -1 with content that would exceed any total — assert no total-budget truncation (per-file cap still applies).
6. Exact-content dedup (D-07): two entries with identical content — assert the content appears once in text and truncated is empty; a three-entry case where the middle entry duplicates the first.
7. Skip empty/null/undefined/whitespace-only entries (D-08): entries with content `""`, `null`, `undefined`, and `"   "` — assert none appear in text.
8. Non-string coercion (D-08): content `123` (a number) — assert `"123"` appears in text.
9. Inline audit notice (D-06): for a truncation-triggering case, assert the audit line matches /\(\d+ entries truncated: .*\)/ and names the truncated labels; for a no-truncation case, assert no audit line appears.
10. contextBudget (D-02/D-03): `200000`→90000; `undefined`/`null`/`NaN`/`0`/`-5`/`"abc"`→90000; `100000`→45000; never returns <= 0.
Then run the full suite with `npm test` and confirm the new file passes and nothing else regresses.</action>
<verify>npm test</verify>
<acceptance_criteria>
- `npm test` (node --test test/*.test.mjs) passes, including test/context-budget.test.mjs, with no failures
- test/context-budget.test.mjs contains the 10 behaviour groups above
- No new package added (package.json dependencies still {})</acceptance_criteria>
<done>A passing `node --test` unit suite for planningContext (all CQ-06 behaviours) and contextBudget; `npm test` green on a clean checkout.</done>
</task>
</tasks>

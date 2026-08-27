Confirmed: `cfg` at plan.js:56 is a dead variable (read but never used), so plan.js can reuse it for the budget read. I have everything needed. Here is the full RESEARCH.md.

---

# GSD-16-context-budget — RESEARCH.md

## 1. Domain analysis

### The artifact under change
`planningContext` is a pure, exported helper in `lib/_runner.js` (lines 36–46) with the signature `planningContext(entries, maxPerFile = 60000)` returning a **string** (a `<planning_context>…</planning_context>` block). [VERIFIED: read `lib/_runner.js:36-46`]

Current behavior confirmed by executing it against the real code:
- Per-file cap: content longer than `maxPerFile` is sliced to `maxPerFile` and a `\n…(truncated)…\n` marker is appended. [VERIFIED: `node -e` run — a 60005-char entry produced a 60069-char block containing `…(truncated)…`]
- No total budget exists today; no dedup (identical content is injected twice — a `same`/`same` pair appeared twice). [VERIFIED: `node -e` — count of `same` was 2]
- Empty string / `null` / `undefined` entries are skipped. **Whitespace-only entries are NOT skipped today** (`"   "` was included). [VERIFIED: `node -e`]
- Non-string content is coerced with `String()` (`123` → `"123"`). [VERIFIED: `node -e`]
- `maxPerFile <= 0` truncates everything to empty (per-file semantics differ from the new total-budget semantics; D-08 treats `maxTotal <= 0` as "no cap"). [VERIFIED: `node -e`]

There are **no existing tests** that exercise `planningContext`/`_runner.js` (grep across `test/` found none), so the return-shape change from string → `{ text, truncated }` breaks **no** existing test. [VERIFIED: grep `test/` for `_runner.js|planningContext` returned only the `cwdOf` source-assertion tests in `ship.test.mjs`, which import nothing at runtime]

### Call sites (all five must be re-wired)
All five tools import `planningContext` from `./_runner.js` and pass it directly as an element of a `[…].join("\n\n")` prompt array — so each must switch to `.text` and separately report `.truncated`. [VERIFIED: grep across `lib/*.js`]

| Tool | planningContext call(s) | Existing log channel | Already reads config? |
|---|---|---|---|
| `lib/plan.js` | researcher (L71), planner (L93), plan-checker via `runChecker` (L167) | `log` array (L63), returned in the final output | Reads `cfg` at L56 but **never uses it (dead variable)** — reusable for the budget read |
| `lib/execute.js` | executor prompt (L116) | `log` array (L73), returned at L207/210 | No `readConfig` today |
| `lib/verify.js` | verifier prompt (L60) | No `log` array — builds return array directly at L92 | No `readConfig` today |
| `lib/ui.js` | ui-researcher (L41), ui-checker (L56) | No `log` array — returns directly at L62 | No `readConfig` today |
| `lib/map-codebase.js` | codebase-query (L109) | `log` array exists (L160) but **query mode returns `r.output` directly at L114**, bypassing it | No `readConfig` today |

Key implication for the planner: verify, ui, and map-codebase query mode lack an obvious log channel. D-05 says "each call site reports the truncated list through its existing log channel" — but three of them have none. The plan must either create a small `log`/notice mechanism in those tools or append the truncation note to the returned string. This is an **implementation decision for the planner/executor**, not a blocker (D-05 fixes *that* truncation must be surfaced; the exact channel is Claude's discretion).

### Budget source and config access
- `config.json` exposes `context_window: 200000`. [VERIFIED: `.planning/config.json`]
- The state service accessor is `GsdState.readConfig(cwd)` at `lib/state.js:337-341` (JSON parse with a no-throw fallback to `_defaultConfig`). The default config sets `context_window: 200000` (`lib/state.js:159`). [VERIFIED]
- All five tools already hold the state service as `const s = gsd()` and `const cwd = cwdOf(exec)`, so adding `await s.readConfig(cwd)` requires no new plumbing. [VERIFIED: read each tool]

### Standard patterns & pitfalls
- **Pattern** in this codebase for pure, testable domain logic: keep pure helpers in `lib/_shared.js`, import them into `_runner.js` and the tools (`blocksToText`, `isValidRef`, etc.). [VERIFIED: `lib/_shared.js`]
- **Pattern** for wiring tests: pure unit tests in `test/*.test.mjs` (`node --test`, `node:assert/strict`), plus source-inspection/static tests that read `lib/*.js` and assert imports/wiring (see `test/ship.test.mjs`, e.g. "core-tools.js imports cwdOf from _runner.js…"). [VERIFIED: `test/ship.test.mjs:11-39`]
- **Pitfall** — a return-shape change is breaking. All five call sites join the returned value into a prompt string; forgetting `.text` on one site yields `[object Object]` in the prompt. The wiring task must touch all five, and a source-assertion test should guard each.
- **Pitfall** — the per-file `…(truncated)…` marker is a behavioral anchor (D-08: keep per-file default semantics). The new total-budget audit notice (D-06) is additive and must not replace the per-file marker.
- **Pitfall** — `cfg` at `plan.js:56` is dead code; the plan should either reuse it (rename to a used variable) or remove it, not leave a second unused read.

Confidence: **High** for all of the above (read/executed against the real target).

## 2. Package legitimacy

**None. No new dependency is needed.** The bundle is a zero-runtime-dependency ESM package (`package.json` `"dependencies": {}`, peer-only). `planningContext` and the new budget helper are pure JS with no imports beyond `./_shared.js`. [VERIFIED: `package.json:62-68`, `lib/_runner.js:6`]

The established test framework is `node --test` (no jest/vitest/mocha); no test dependency is required. Adding any npm package would be a **scope violation** of the project's zero-dep design — the plan must implement the budget helper and truncation in plain ESM.

## 3. Risks & Open Questions

**Risks**
- **Return-shape breakage (High):** string → object is a breaking change to 5 call sites. Mitigate with the source-assertion test for each site + pure unit tests asserting `.text`/`.truncated`.
- **Truncation ordering subtlety (Medium):** D-04 specifies: apply per-file cap first, then drop whole trailing entries, then finally trim the last kept entry. The "last kept entry trimmed to fit" branch is the trickiest to get right and the easiest to get subtly wrong (off-by-one, or trimming before checking whether dropping was enough). Must be unit-tested with a crafted total that lands exactly between "N entries" and "N+1 entries" sums.
- **`truncated` semantics drift (Medium):** whether the list includes per-file-capped entries vs. only total-budget-trimmed ones is not pinned. Resolved below (recommendation): include every entry with `keptChars < originalChars`.
- **Whitespace-entry discrepancy (Low/Medium):** D-08 asserts "whitespace entries are skipped" as *existing* behavior, but they are **not** skipped today. Must decide; resolved below (honor D-08's letter — skip trimmed-empty).
- **No log channel in verify/ui/map-query (Low):** surfacing requires a small channel creation in three tools. Not a blocker.

### Open Questions (all RESOLVED — planning may proceed)

- **OQ-1 (RESOLVED) — What should the `truncated` array capture?** Recommend: every entry whose final `keptChars < originalChars`, covering both the per-file cap and total-budget trim, including fully-dropped trailing entries with `keptChars: 0`. This is the most complete "context was cut" surface and directly satisfies D-05's "see that context was cut". [ASSUMED — design recommendation; consistent with D-05]

- **OQ-2 (RESOLVED) — D-08 says whitespace entries are "skipped", but current code includes them.** Recommend honoring the LOCKED decision's letter: skip any entry where `String(e.content).trim() === ""`. This is a superset of today's empty-string skip, matches D-08 explicitly, and is low-risk (no existing test exercises whitespace content). [VERIFIED current behavior via `node -e`; recommendation to honor D-08]

- **OQ-3 (RESOLVED) — New signature shape.** Recommend keeping the positional signature and appending `maxTotal` as a 3rd param: `planningContext(entries, maxPerFile = 60000, maxTotal = 0)`, where `maxTotal <= 0` means "no total cap" (D-08). Least churn, preserves per-file default semantics (D-08), and call sites pass `(entries, 60000, derivedMaxTotal)`. [ASSUMED — recommendation; minimal-change bias]

- **OQ-4 (RESOLVED) — Which file hosts the shared budget helper.** Recommend `lib/_shared.js` (the canonical "shared pure helpers" file per canonical refs). `_runner.js` already imports `blocksToText` from it, so `_runner.js` can import the helper with zero new coupling, and all call sites can import from `_shared.js` too. Helper: `contextBudget(contextWindow)` → `Math.round(Number(w) * 0.45)` for a finite positive `w`, else `90000`. [VERIFIED: `_shared.js` is the shared-helpers file; `_runner.js:6` already imports from it]

- **OQ-5 (RESOLVED) — "Call sites drop labels that would repeat content already present" (D-07, 2nd sentence) — how concrete?** Recommend: the testable, primary mechanism is the **exact-content dedup inside `planningContext`** (verified: identical content currently injects twice; dedup makes it inject once, first-wins). The call-site audit confirms all five currently pass distinct labels with no duplicate file today, so the "drop labels" part is a defensive no-op enforced by the exact-dedup net — **no substring/containment heuristic** (over-engineering, could drop legitimately-similar content). [VERIFIED: `node -e` showed identical content injected twice; read of all five call sites shows distinct labels]

- **OQ-6 (RESOLVED) — Fraction/fallback + inline wording (Claude's discretion).** Recommend `fraction = 0.45` and `fallback = 90000` (90000 = exactly 0.45 × the 200000 default, so derived and fallback are consistent). Inline audit notice (D-06): `…(N entries truncated: label1, label2, …)…`. Log line shape: `planning-context: truncated N entry/entries (label1, …) — capping total context to <maxTotal> chars`. [ASSUMED — recommendation]

## 4. Architectural Responsibility Map

No security-sensitive capability is introduced — nothing here is a BLOCKER.

| Capability | Tier | Notes |
|---|---|---|
| Total-budget truncation algorithm (D-04) | **Domain** | Pure function in `lib/_runner.js`; no I/O, no host services. |
| Per-file cap retention (existing `maxPerFile`) | **Domain** | Preserved default `60000` (D-01/D-08). |
| Exact-content dedup (D-07) | **Domain** | Pure, inside `planningContext`. |
| Budget derivation `contextBudget(window)` | **Domain** | Pure helper in `lib/_shared.js`; single source for fraction `0.45` + fallback `90000` (D-02/D-03). |
| Config read (`s.readConfig(cwd)` → `context_window`) | **Integration** | Existing `GsdState` service; read once per tool invocation at each of the 5 call sites (D-02). |
| Surfacing truncation (log line / return array) | **Presentation** | The 5 tool outputs/log channels report `pc.truncated` (D-05); inline audit notice is domain-emitted inside `text` (D-06). |

## 5. Validation Architecture

Verification surface for CQ-06 ("planningContext truncates against a total budget and surfaces truncation, plus small dedup fixes"). No existing tests touch this code, so a dedicated suite is required.

**A. Pure unit tests — new `test/context-budget.test.mjs`** (import `planningContext` from `lib/_runner.js`, `contextBudget` from `lib/_shared.js`; both are node-test-safe, zero deps). Prove each behavior:
1. Return shape: `planningContext(…)` returns `{ text, truncated }`; with no truncation `truncated === []` and `text` contains every entry.
2. Per-file cap retained — content > `maxPerFile` is sliced, keeps `…(truncated)…`, and is listed in `truncated`.
3. Total budget — summed contents > `maxTotal` drops whole trailing entries (head preserved), per D-04.
4. Last-kept-entry trim — a total budget between the N-entry and (N+1)-entry sums trims only the trailing kept entry to fit.
5. `maxTotal <= 0` → no total cap (per-file cap still applies), D-08.
6. Dedup — identical content string injected once (first-wins), count 1 (was 2), D-07.
7. Skip empty/`null`/`undefined`/whitespace-only entries, D-08.
8. Non-string coerced via `String()`, D-08.
9. Inline audit notice present iff `truncated.length > 0`, naming truncated labels, D-06.

**B. Pure unit tests — `contextBudget`:** given `200000` → `90000`; given `undefined`/`null`/`NaN`/`0`/negative/non-numeric → `90000`; never returns `<= 0`.

**C. Source-assertion tests** (mirror `test/ship.test.mjs` — read `lib/*.js` and assert wiring):
- `_runner.js` imports `contextBudget` from `_shared.js` and `planningContext` returns `{ text, truncated }`.
- Each of the five tools (`plan.js`, `execute.js`, `verify.js`, `ui.js`, `map-codebase.js`) imports `contextBudget` (or calls `s.readConfig`), passes a derived `maxTotal` into `planningContext`, reads `.text` for the prompt, and references `.truncated` for surfacing.

**D. Full gate:** `npm test` → `node --test test/*.test.mjs` (MOUNT-06/CQ-06), must pass on a clean checkout.

## 6. Project Constraints

- **Zero runtime dependencies** — the budget helper and all changes are plain ESM; no new packages (`package.json` `dependencies: {}`). [VERIFIED]
- **Test runner** is `node --test` + `node:assert/strict` only. [VERIFIED: `package.json` scripts, existing tests]
- **Pure-function convention** — domain logic lives as pure, unit-testable helpers (`_shared.js`), per CQ-02's single-source-constant pattern. The budget fraction + fallback must be single-source (one helper), matching D-03. [VERIFIED: `_shared.js`, canonical refs]
- **No inline `cwd` / no re-derivation** — CQ-01/CQ-02: `cwd` already comes from `cwdOf(exec)`; reuse the existing `s`/`cwd` at each call site rather than re-deriving. [VERIFIED: read call sites]
- **D-08: no change to per-file default semantics** beyond the total budget — the per-file `60000` and its marker stay. [VERIFIED: current behavior]
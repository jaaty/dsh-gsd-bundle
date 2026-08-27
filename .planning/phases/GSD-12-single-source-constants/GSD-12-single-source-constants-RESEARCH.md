I have everything I need. The prose line is the array join plus a trailing sentence (my regex captured the whole line, so `MATCH: false` — but the array portion is an exact prefix). Baseline: 181 tests pass. Here is the RESEARCH.md.

---

# Phase 12: single-source-constants — Research

**Researched:** 2026-08-27
**Phase goal:** Make GATE_NAMES and the secret-file list single-source and route cwdOf through the shared helper. (Requirement CQ-02)

## Domain analysis

This is a **pure dedup refactor** — no new behaviour, no new dependencies, no new files required. The bundle is plain ESM (`"type": "module"` in `package.json:5` [VERIFIED: read]) with **zero runtime dependencies** (`package.json:62` `"dependencies": {}` [VERIFIED: read]). All four touched modules are internal and already import from each other, so the work is moving symbols between existing modules and rewiring imports.

The four dedup targets and their current state:

| Symbol | Current home | Duplicated in | Action |
|---|---|---|---|
| `secretPatterns` (array) | `lib/gates.js:22-47` (exported) | `lib/_agents.js:283,319` (as prose text) | Move to `_shared.js`; gates.js + _agents.js import it |
| `GATE_NAMES` (array) | `lib/gates.js:224` (exported) | `lib/ship.js:17` (local const) | ship.js imports from gates.js; delete local copy |
| `cwdOf(exec)` (fn) | `lib/_runner.js:48-50` (exported) | `lib/core-tools.js:54,90,165,215`; `lib/discuss.js:69` (inline expressions) | core-tools.js + discuss.js import from _runner.js; delete inline copies |

**Confidence: HIGH** — every symbol, line range, and consumer was read this session and cross-checked with grep. [VERIFIED: read of all four lib files + grep]

### Import-graph / circular-import analysis (no cycles)

- `_shared.js` imports **nothing** — it is the "pure, import-nothing helper module" (`lib/_shared.js:1-3` [VERIFIED: read]). Adding `secretPatterns` here introduces no cycle.
- `_runner.js` imports `_shared.js` only (`lib/_runner.js:6` [VERIFIED: read]).
- `gates.js` imports `node:path` only (`lib/gates.js:17` [VERIFIED: read]).
- `_agents.js` currently imports **nothing**; it will gain `import { secretPatterns } from "./_shared.js"` — no cycle.
- `core-tools.js` imports `defineTool` + `./jobs.js`; will gain `import { cwdOf } from "./_runner.js"` — no cycle.
- `discuss.js` imports `_shared.js`; will gain `import { cwdOf } from "./_runner.js"` — no cycle.

**Confidence: HIGH** [VERIFIED: grep of all `from "./..."` imports in lib/]

### Prose-generation correctness (D-04)

The forbidden-files prose in `_agents.js:283` and `:319` is exactly `secretPatterns.join(", ")` followed by a per-prompt trailing sentence. Verified programmatically: the array join is an exact prefix of the prose line. [VERIFIED: node check — `secretPatterns.join(", ")` reproduces the array portion verbatim; the prose line is `<join>. Your output gets committed — leaked secrets = security incident.` (MAPPER) / `<join>. Your output gets returned to the user — leaked secrets = security incident.` (QUERY)]

So D-04 is a template-literal interpolation: `...${secretPatterns.join(", ")}. Your output gets committed...`. Because the join appears in **two** prompts, a tiny helper `forbiddenFilesProse()` in `_shared.js` returning `secretPatterns.join(", ")` avoids duplicating the join expression — this is within Claude's Discretion and is the recommended option. Inline `secretPatterns.join(", ")` in both prompts is also acceptable.

### Test-import impact

`test/gates.test.mjs:8` imports `secretPatterns` from `../lib/gates.js`, and `:64-69` asserts `secretPatterns.includes(...)`. After the move, either (a) update that import to `../lib/_shared.js` (cleaner single-source, no re-export), or (b) re-export `secretPatterns` from gates.js. The canonical_refs list the tests as in-scope, so updating the import is expected. **Recommendation: (a)** — update the test import; do not re-export from gates.js, keeping `_shared.js` the sole source of the name. [VERIFIED: read of test/gates.test.mjs]

`test/tools.test.mjs:756-758` asserts `CODEBASE_QUERY_PROMPT` matches `/FORBIDDEN FILES/` — this still holds after interpolation (the literal "FORBIDDEN FILES" prefix is unchanged). [VERIFIED: read]

## Package legitimacy

**No new dependencies are proposed.** The only "dependencies" are internal modules already in the repo (`_shared.js`, `_runner.js`, `gates.js`, `_agents.js`). `package.json` declares `"dependencies": {}` and only peer deps on the DSH host packages (`package.json:62-68` [VERIFIED: read]). Nothing to verify against a registry. [VERIFIED: read of package.json]

## Risks

1. **Circular import** — avoided: `_shared.js` imports nothing, so both `gates.js` and `_agents.js` importing it is safe. [VERIFIED: import-graph grep]
2. **Prose drift** — the whole point of D-04 is to prevent it; the risk is a typo in the interpolation. Mitigated by a new regression test asserting the prompt contains `secretPatterns.join(", ")`. [ASSUMED → mitigated by test]
3. **Test breakage** — `test/gates.test.mjs` imports `secretPatterns` from gates.js; must be updated to `_shared.js` (or gates.js re-exports). [VERIFIED: read]
4. **Behavior change** — the phase is explicitly "pure dedup, no behavior change". The `cwdOf` expression `exec?.agent?.session?.header?.cwd || process.cwd()` is byte-identical to the inline copies, so routing through the helper is behavior-preserving. [VERIFIED: read of _runner.js:48-50 and inline copies]
5. **Security-tier concern** — `secretPatterns` is data consumed by the security gate. Moving the *data* to `_shared.js` (data tier) is safe; the *enforcement* (`securityGate`/`matchSecretPatterns`) stays in `gates.js` (domain tier). This is **not** a security-tier violation. [VERIFIED: read of gates.js]

## Open Questions

- **OQ-1 (RESOLVED):** Where does `secretPatterns` live and how do tests import it? → `_shared.js`; update `test/gates.test.mjs:8` to import from `../lib/_shared.js`. No re-export from gates.js.
- **OQ-2 (RESOLVED):** Render the prose inline or via a helper? → Recommended: a tiny `forbiddenFilesProse()` helper in `_shared.js` returning `secretPatterns.join(", ")`, used in both `_agents.js` prompts. Inline join is acceptable (Claude's Discretion).
- **OQ-3 (RESOLVED):** Does moving `secretPatterns` to `_shared.js` create a circular import? → No; `_shared.js` imports nothing.
- **OQ-4 (RESOLVED):** Does the existing `secretPatterns carries the exact credential globs` test still pass? → Yes, once the import is updated to `_shared.js`.
- **OQ-5 (RESOLVED):** Does the `FORBIDDEN FILES` test still pass? → Yes; the literal prefix is unchanged.

All open questions are RESOLVED; planning may proceed.

## Architectural Responsibility Map

| Capability | Tier | Location | Notes |
|---|---|---|---|
| `secretPatterns` canonical array | **data** | `_shared.js` | Pure data; `_shared.js` is the import-nothing helper module |
| `GATE_NAMES` canonical list | **domain** | `gates.js` (kept, exported) | Gate names are domain vocabulary; ship.js imports it |
| `cwdOf(exec)` helper | **integration** | `_runner.js` (kept) | Resolves the host exec's cwd; shared by all tools |
| `securityGate` / `matchSecretPatterns` | **domain** | `gates.js` (unchanged) | Enforcement stays in domain tier — **not** moved |
| Forbidden-files prose (prompt text) | **presentation** | `_agents.js` (derived) | Rendered from the data-tier array at module load |

No security-sensitive capability is placed in the wrong tier. The security *data* moves to the data tier; the security *enforcement* remains in the domain tier. **No BLOCKER.**

## Validation Architecture

Baseline: `npm test` (`node --test test/*.test.mjs`) — **181 tests pass, 0 fail** [VERIFIED: ran `npm test`]. The following automated checks prove each behaviour:

| Behaviour | Automated check |
|---|---|
| `secretPatterns` is single-source in `_shared.js` | `test/gates.test.mjs` imports it from `_shared.js` and asserts `.env`, `credentials.*`, `*.pem`, `*-credentials.json` are present (existing test, import updated) |
| `GATE_NAMES` single-source (ship.js imports it) | New static test: `ship.js` no longer contains a local `const GATE_NAMES = [...]` and its `./gates.js` import line includes `GATE_NAMES` |
| `cwdOf` routed through `_runner.js` | New static test: `core-tools.js` and `discuss.js` import `cwdOf` from `./_runner.js` and contain **no** `exec?.agent?.session?.header?.cwd` inline expression |
| Prose derives from the array (D-04) | New test: `CODEBASE_MAPPER_PROMPT` and `CODEBASE_QUERY_PROMPT` each contain `secretPatterns.join(", ")` (import `secretPatterns` from `_shared.js` in the test) |
| No behavior change | Full suite stays green (181+ tests) |

## Project Constraints

- **Plain ESM, zero runtime dependencies** — `package.json:5,62` [VERIFIED: read]. No new packages.
- **Test runner** — `node --test test/*.test.mjs` (`package.json:8` [VERIFIED: read]).
- **`_shared.js` is the pure, import-nothing helper module** — the canonical home for `secretPatterns` (`lib/_shared.js:1-3` [VERIFIED: read]).
- **`_runner.js` is the shared helper for subagent spawning + `cwdOf`** — the canonical home for `cwdOf` (`lib/_runner.js:48-50` [VERIFIED: read]).
- **Pure dedup, no behavior change** — do not alter the gate evaluator logic, `globToRegex`, or the `cwdOf` implementation (CONTEXT.md domain, out-of-scope).
- **CQ-03..CQ-06 are separate phases 13-16** — do not touch gate dispatch, execute checkpoint logic, ship robustness, or context budget (CONTEXT.md deferred).
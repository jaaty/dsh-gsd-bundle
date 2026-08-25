I now have everything needed. Here is the full RESEARCH.md.

---

# Phase 10: codebase-query — Research

**Researched:** 2026-08-25

## Domain analysis

### What this phase is
A read-only "intel" mode for the existing `gsd_map_codebase` tool. When a `query` string arg is present, the tool stops being a mapper and instead answers a question against the existing `.planning/codebase/` map plus targeted codebase exploration — never a full re-scan. It returns a plain-text answer with a `Sources` section. Delivers CBQ-01 and CBQ-02.

### Standard stack / patterns (all in-repo, no new dependencies)
- **Tool registration** — `lib/map-codebase.js` `apply(ctx)` calls `ctx.tools.register(defineTool({...}))`. The tool already has `fast`/`focus`/`paths`/`force` args and a `{ type: "string" }` output schema. [VERIFIED: lib/map-codebase.js:72-81]
- **Fresh-context subagent primitive** — `spawnSubagent(ctx, exec, { label, promptText, outputSchema })` in `lib/_runner.js:8-32` returns `{ output, stopReason, diagnostic, structured }`. This is the exact primitive every phase tool uses and the one D-01 mandates for the query subagent. [VERIFIED: lib/_runner.js:8-32]
- **Map accessors** — `gsdState` exposes `codebaseDir(cwd)` (state.js:53), `listCodebaseDocs(cwd)` (state.js:57), `readCodebaseDoc(cwd, name)` (state.js:68), `planningRoot(cwd)` (state.js:49), `isProject(cwd)` (state.js:105). All read through `ctx.fs` (the same store the mapper subagents write to and the test fake exercises). [VERIFIED: lib/state.js:49-70, 105-108]
- **Prompt library** — `lib/_agents.js` holds the role prompts; `CODEBASE_MAPPER_PROMPT` at line 249. A new `CODEBASE_QUERY_PROMPT` belongs here. [VERIFIED: lib/_agents.js:249]
- **Context-passing pattern** — the phase tools prepend a `<planning_context>` block (built by `planningContext(entries, maxPerFile)` in `_runner.js:36-46`, truncating at 60000 chars) before the subagent prompt. Query mode should pass the map docs the same way. [VERIFIED: lib/_runner.js:36-46]
- **Slash command** — `lib/commands.js:146-159` registers `/gsd-map-codebase`; its `build()` parses `--fast`/`--focus`/`--paths`. A `--query` flag should be added here so the CLI path surfaces the new mode. [VERIFIED: lib/commands.js:146-159]

### Confidence levels
- **Query mode branches inside `apply()`'s `execute`** before the mapping logic — **HIGH** (the tool's `execute` is a single function; D-03 says query mode "coexists with the existing flags" and "ignores them", so the branch must precede focus/paths handling).
- **Query subagent reuses `spawnSubagent`** — **HIGH** (D-01 explicitly names it; it is the established primitive).
- **Map contents passed via `planningContext`** — **MEDIUM** (D-02 says the subagent "reads the map first"; passing via `planningContext` is the consistent in-repo pattern and guarantees the map is in context, but the subagent also has fs access and could read the docs itself. Either satisfies D-02; see Open Question OQ-1).
- **No new dependencies** — **HIGH** (all machinery is in-repo; see Package legitimacy).

### Pitfalls
1. **Subagent label collision in tests.** The fake subagents service in `test/tools.test.mjs:130` branches on `label.startsWith("map-codebase")` and treats it as a mapper. If the query subagent is labelled `map-codebase query`, it will hit the mapper branch and write docs instead of answering. The query subagent must use a **distinct label** (e.g. `codebase-query`), and the fake needs a new branch. [VERIFIED: test/tools.test.mjs:130-148]
2. **Empty/whitespace `query`.** A `query: ""` string is "present" but meaningless. Recommend treating only a non-empty trimmed query as query mode; an empty query should fall through to normal mapping (or return a usage notice). See OQ-2.
3. **Secret leakage.** The query subagent does targeted exploration and its answer is returned to the user. It must carry the same `FORBIDDEN FILES` rule as the mapper (lib/_agents.js:282-283) so it never quotes `.env`/credentials. This is a security-sensitive behaviour — see Architectural Responsibility Map. [VERIFIED: lib/_agents.js:282-283]
4. **"Never throw" contract.** D-04 requires clear notices, not exceptions, for (a) no map and (b) subagent failure/empty output. The existing tool already returns strings for the existing-check notice (map-codebase.js:118-125), so returning a notice string is the established pattern. [VERIFIED: lib/map-codebase.js:118-125]
5. **Output schema is a plain string.** D-05 wants plain text + a `Sources` section. The existing `output.schema: { type: "string" }` (map-codebase.js:81) already fits — no schema change needed. [VERIFIED: lib/map-codebase.js:81]

## Package legitimacy

**No new dependencies are proposed for this phase.** Every capability reuses in-repo machinery already shipped and tested in earlier phases:

- `@deepseek-ai/dsh-tools` `defineTool` — already imported and used in `lib/map-codebase.js:26`. [VERIFIED: lib/map-codebase.js:26]
- `@deepseek-ai/dsh-subagent` + `dsh-subagent-spawn-in-process` — the `subagents` service consumed by `spawnSubagent` (lib/_runner.js:9-12); already a peer/runtime dependency of the bundle. [VERIFIED: lib/_runner.js:9-12; package.json peerDependencies]
- `gsdState` host service — in-repo, `lib/state.js`. [VERIFIED: lib/state.js:33-605]

No registry lookups were required because no new package is introduced. If the planner is tempted to add a package for "codebase querying", it should not — the query is answered by a fresh-context LLM subagent, not a static-analysis library.

## Risks and Open Questions

### Risks
- **R1 (medium):** The query subagent's answer quality depends on the prompt. If the prompt does not force a `Sources` section and targeted-only exploration, the subagent may (a) return an unsourced answer (fails D-05) or (b) drift into a full re-scan (fails D-02). Mitigation: the `CODEBASE_QUERY_PROMPT` must explicitly require a `Sources` section and instruct "read the map first, then glob/grep only for the specific symbols/files the question needs — do not re-scan the whole repo."
- **R2 (low):** Large map docs (ARCHITECTURE.md is ~31 KB) could bloat the prompt. `planningContext` truncates at 60000 chars per entry, so this is bounded. [VERIFIED: lib/_runner.js:41]
- **R3 (low):** The `mount.test.mjs` schema test asserts exactly 12 tools (mount.test.mjs:316). Adding a `query` arg does **not** add a tool, so the count stays 12 — no test change needed there, but the new arg must still compile a valid schema (the test at 313-324 covers all tools generically). [VERIFIED: test/mount.test.mjs:313-324]

### Open Questions
- **OQ-1 (RESOLVED):** How does the query subagent obtain the map contents — passed via `planningContext` in the prompt, or read by the subagent itself via fs? **Resolution:** Pass the map docs via `planningContext` (the established phase-tool pattern, `_runner.js:36-46`), so the map is guaranteed in context; the subagent then does targeted glob/grep exploration only for gaps. This satisfies D-02 ("reads the map first") and is consistent with how discuss/plan/execute/verify feed artefacts to their subagents. The orchestrator reads docs via `s.listCodebaseDocs` + `s.readCodebaseDoc` and passes them in.
- **OQ-2 (RESOLVED):** What does an empty/whitespace `query` string do? **Resolution:** Only a non-empty trimmed `query` triggers query mode. An empty/whitespace query falls through to normal mapping behaviour (the existing fast/focus/paths/force path). This keeps the tool's default behaviour unchanged and avoids a surprising "usage" error for a present-but-empty arg.
- **OQ-3 (RESOLVED):** Does query mode require a GSD project to exist? **Resolution:** No. The map is a pre-init brownfield artefact (state.js:51-53), and query mode only needs the map + codebase, not STATE.md. The map-existence check is `s.listCodebaseDocs(cwd)` returning non-empty. No `isProject` gate.
- **OQ-4 (RESOLVED):** What label does the query subagent use, and how do tests distinguish it? **Resolution:** Use a distinct label `codebase-query` (not `map-codebase ...`) so the fake subagents service in `test/tools.test.mjs` can branch on it without colliding with the mapper branch (which matches `label.startsWith("map-codebase")`). The test fake gains a `codebase-query` branch that returns a canned answer.

## Architectural Responsibility Map

| Capability | Tier | Where | Notes |
|---|---|---|---|
| Query-mode orchestration (branch on `query`, read map, spawn subagent, error handling, return answer) | **Domain** | `lib/map-codebase.js` `execute()` | The tool's execute is the domain orchestrator; it already owns the mapping flow. |
| Map reading (`listCodebaseDocs` / `readCodebaseDoc`) | **Data** | `gsdState` service (`lib/state.js:57,68`) | Already the data-tier accessor; query mode reuses it, never raw fs. |
| Subagent spawning | **Integration** | `spawnSubagent` (`lib/_runner.js:8`) → host `subagents` service | The established integration primitive; query mode reuses it (D-01). |
| Answer synthesis (read map + targeted exploration + Sources) | **Domain** | fresh-context query subagent | Runs in a clean child context; the prompt (`CODEBASE_QUERY_PROMPT`) is the domain contract. |
| Prompt definition | **Domain** | `lib/_agents.js` `CODEBASE_QUERY_PROMPT` | New constant alongside `CODEBASE_MAPPER_PROMPT`. |
| **Secret handling (FORBIDDEN FILES)** | **Domain (security-sensitive)** | `CODEBASE_QUERY_PROMPT` | **BLOCKER if omitted.** The query subagent explores the codebase and its answer is returned to the user; it MUST carry the same `FORBIDDEN FILES` rule as the mapper (lib/_agents.js:282-283) so it never quotes `.env`/credentials. This is a security-sensitive capability and it is correctly placed in the domain tier (the prompt), not the data/integration tier. |
| Slash-command surfacing (`--query`) | **Presentation** | `lib/commands.js:146-159` | `/gsd-map-codebase --query <q>` builds a tool call with `query`. |

No security-sensitive capability is in the wrong tier. The only security-sensitive behaviour (secret non-disclosure) lives in the domain-tier prompt, which is the correct place.

## Validation Architecture

All checks are deterministic (fake fs + fake subagents, no LLM/git/gh), matching the existing `test/tools.test.mjs` `gsd_map_codebase` describe block (line 626) and the `registerTool` helper (line 165).

| Behaviour | Automated check | Where |
|---|---|---|
| Query mode with an existing map returns the subagent's answer | Fake `codebase-query` subagent returns a canned answer; assert `t.execute({ query: "..." }, exec)` output matches the answer and includes a `Sources` section | `test/tools.test.mjs` (new tests in the `gsd_map_codebase` describe) |
| Query mode with **no** map returns a clear notice, never throws | No `.planning/codebase/` docs present; assert output matches `/run gsd_map_codebase first/i` (or the D-04 wording) and `assert.doesNotReject` | `test/tools.test.mjs` |
| Query subagent failure / empty output returns a clear failure message, never throws | Fake `codebase-query` returns empty output (or a failure stopReason); assert output matches a failure message and `assert.doesNotReject` | `test/tools.test.mjs` |
| Query mode ignores `fast`/`focus`/`paths`/`force` | Call `t.execute({ query: "q", fast: true, focus: "arch", force: true })`; assert it returns the answer and writes **no** map docs | `test/tools.test.mjs` |
| Empty/whitespace `query` does not trigger query mode | `t.execute({ query: "  " })` falls through to mapping (or returns the existing-check notice); assert no `codebase-query` spawn | `test/tools.test.mjs` |
| `query` arg is present in the compiled schema | `assert.equal(typeof t.parameters.query, "object")` / `t.parameters.query.type === "string"` | `test/tools.test.mjs` (or mount.test.mjs generic schema loop) |
| Query prompt carries the FORBIDDEN FILES rule | Grep `CODEBASE_QUERY_PROMPT` for `FORBIDDEN FILES` | `test/tools.test.mjs` (string assertion on the exported prompt) or a grep in the plan's verify |
| Slash command surfaces `--query` | `commands.js` `build("--query what is X")` produces a tool call containing `query` | `test/tools.test.mjs` (or a small new test) |
| All 12 tools still compile valid schemas | Existing `mount.test.mjs:313-324` loop (no count change) | `test/mount.test.mjs` (regression, no edit needed) |

**Nyquist note:** every behaviour above has a runnable `node --test` assertion, so the phase can pass the Nyquist/coverage gate without a live DSH boot.

## Project Constraints

From the bundle's conventions (README.md, existing tests, and the phase CONTEXT):
- **Deterministic tests only.** `test/tools.test.mjs` exercises real tool `execute`s with a fake host fs + fake subagents — no LLM, no real git/gh. Query-mode tests must follow this pattern. [VERIFIED: test/tools.test.mjs:1-3]
- **Never throw on user-facing failures.** D-04 and the existing existing-check notice (map-codebase.js:118-125) establish that the tool returns notice strings, not exceptions. [VERIFIED: lib/map-codebase.js:118-125]
- **Reads through `gsdState`/`ctx.fs`, never raw `node:fs/promises`** for `.planning/` artefacts (DUR-06 precedent). Query mode reads the map via `s.listCodebaseDocs`/`s.readCodebaseDoc`. [VERIFIED: lib/state.js:57-70]
- **`--query` was deliberately omitted** in the first version (map-codebase.js:20-23, README.md:115) and deferred across GSD-02/GSD-03/GSD-08 CONTEXT files; this phase is the sanctioned implementation. [VERIFIED: lib/map-codebase.js:20-23]
- **No new dependencies** — the bundle's `dependencies` is empty and all machinery is in-repo. [VERIFIED: package.json]
- **`npm test` (`node --test test/*.test.mjs`) must pass on a clean checkout** (MOUNT-06). [VERIFIED: package.json scripts.test]
Baseline is green (53 tests pass). I now have everything needed. Here is the full RESEARCH.md.

---

# Phase 19: codebase-intel-extensions — Research

**Phase:** 19-codebase-intel-extensions · **Milestone:** job-intel-multiwindow
**Goal:** Extend `gsd_map_codebase` with drift detection, targeted re-map/updater, a structured answer object, and subtree query scoping.
**Requirements:** CBQX-01, CBQX-02, CBQX-03, CBQX-04

---

## 1. Domain analysis

The four features are additive extensions to an existing, working single-file tool (`lib/map-codebase.js`) plus its subagent prompts (`lib/_agents.js`), state service (`lib/state.js`), and subagent runner (`lib/_runner.js`). None of them require a new runtime dependency, a new host service, or a change to the four map focus areas. Confidence: **HIGH** — every integration point was read this session.

### 1.1 The tool surface today (the integration base)

`gsd_map_codebase` is a Cordis plugin registered by `lib/map-codebase.js` `apply()` → `ctx.tools.register(defineTool(...))`. It has three modes already (full/fast/paths mapping, and a query mode that returns early): [VERIFIED: lib/map-codebase.js:69-234]. The `output` contract today is `{ schema: { type: "string" }, render: (_a, v) => [{ type: "text", text: v }] }` [VERIFIED: lib/map-codebase.js:82]. Every mode's `execute` returns a plain string (a `\n`-joined text block or a query answer string). This is the primary thing CBQX-03 changes.

### 1.2 The query-mode contract today (CBQX-03 target)

- `execute` reads `args.query`, trims it; a non-empty query runs query mode and returns before any mapping logic [VERIFIED: lib/map-codebase.js:96-119].
- Query mode lists the existing `.planning/codebase/` docs via `s.listCodebaseDocs(cwd)`, reads each via `s.readCodebaseDoc`, feeds them through `planningContext(...)` and `CODEBASE_QUERY_PROMPT`, spawns a `codebase-query` subagent, and returns `r.output` (plain text) with a truncation note [VERIFIED: lib/map-codebase.js:98-118].
- `CODEBASE_QUERY_PROMPT` instructs the subagent to "return ONLY the targeted plain-text answer" ending with a `Sources` section listing backticked map/codebase paths [VERIFIED: lib/_agents.js:311-328]. There is **no** structured output today.

### 1.3 Subagent structured-output support already exists (CBQX-03/D-06 enabler)

`spawnSubagent(ctx, exec, { label, promptText, outputSchema })` passes `outputSchema` into the host spawn request and returns `result.structured` alongside `output`/`stopReason`/`diagnostic` [VERIFIED: lib/_runner.js:8-32]. The checkpoint flow already consumes `r.structured?.checkpoint` [VERIFIED: lib/execute.js:145-148, lib/_checkpoint.js:94-104], proving the pattern end-to-end. Structured subagent output **must be object-rooted** and use the restricted schema subset (`type/properties/required/additionalProperties/items/enum/const/oneOf`), enforced at `dsh-tools` [VERIFIED: dsh-tools lib/index.js:335]. So the `{answer, sources, confidence}` object schema for the codebase-query subagent fits exactly.

### 1.4 `defineTool` output schema is declarative, NOT validated against the return value

`defineTool` builds `output: { schema, render(args,value) }`. It validates only `args` (parameters) against the parameter schema; the `execute` return value is passed through untouched (no validation against `output.schema`) [VERIFIED: dsh-tools lib/index.js:846-866]. Consequences for CBQX-03/D-06:
- Returning an object from `execute` is **supported**; the driving model sees the declared `output.schema` plus whatever value `execute` returns.
- `render(args, value)` receives that value and must convert it to display text blocks. The current render `text: v` would render an object as `[object Object]`, so the render **must be rewritten** for the structured object [VERIFIED: lib/map-codebase.js:82].
- Because there is no runtime return validation, one *could* return an object only in query mode and strings elsewhere — but the declared schema would then be inconsistent with the other paths. D-06 locks "the tool output is defined with an object schema". See Open Question OQ-1 (RESOLVED with recommendation).

### 1.5 Drift detection: the signal that is actually available

The phase needs to notice when the codebase changed since the last map. Two facts constrain the design:
- The real host fs `stat` returns `{ version, type, size }` — **no mtime field is exposed** [VERIFIED: @deepseek-ai/dsh-fs-local lib/index.js:723-733]. (`version` is an opaque `dev:ino:size:mtimeNs:ctimeNs` fingerprint, but it is not surfaced to the bundle and not available in the test fake.)
- The test `FakeFs.stat` returns `{ type, size }` (no mtime) [VERIFIED: test/helpers/fake-fs.mjs:31-36], and `realFsAdapter.stat` also returns only `{ type, size }` [VERIFIED: test/helpers/fake-fs.mjs:86-93]. Both fake and real hosts expose `readText` (full content) and `listDir` (one level).

Therefore the robust, cross-environment drift signal is a **content-derived hash** computed by the tool itself from `ctx.fs.readText` (works in FakeFs and the real host), with `size` stored as a cheap first-pass discriminator. mtime is unavailable via the bundle's `ctx.fs` API — this **resolves the D-01 "mtime granularity" discretion directly**: do not rely on mtime; use hash (+ size). The DSH runtime already runs in a Node plugin context (it imports `node:child_process` and `node:fs/promises`), so `node:crypto` (`createHash`) is available with **no new dependency** [VERIFIED: lib/state.js:100-105, lib/map-codebase.js:25].

### 1.6 Walking the tree: `ctx.fs` recursion

`ctx.fs.listDir(target)` returns only immediate children (name/type/target), not recursive [VERIFIED: test/helpers/fake-fs.mjs:47-61]. A full repo walk therefore recurses `listDir` on directories, pruning the D-03 ignore set (`.planning/`, `.git/`, `node_modules/`, lockfiles) at walk time to avoid descending into `node_modules`/`.git`. Both fake and real `listDir` support this. The walk root is `cwdOf(exec)` (the repo root the tool already uses) [VERIFIED: lib/map-codebase.js:84, lib/_runner.js:98-99].

### 1.7 The existing-check branch is where drift reporting slots in (D-02)

The "already exists" notice is returned in the mapping path when `existing.length && !args.force && !scoped.length` [VERIFIED: lib/map-codebase.js:150-157]. Query mode returns earlier (line 97), so it is **not** part of this branch. D-02's drift report belongs exactly here: compare the live tree against the stored manifest and append the drift summary to the notice. When `force=true` or `paths` are given, the map is being (re)built and drift reporting is skipped, matching D-02.

### 1.8 Targeted re-map (CBQX-02) — why not reuse the focus mappers

The existing mapper subagents are **focus-scoped**: `map-codebase <focus>` writes all `FOCUS_DOCS[focus]` docs (e.g. `tech` → `STACK.md` + `INTEGRATIONS.md`) [VERIFIED: lib/map-codebase.js:35-41, 183; test/tools.test.mjs:143-149]. If only `STACK.md` is affected, re-spawning the `tech` mapper would also rewrite `INTEGRATIONS.md` — violating D-05's "preserving unrelated docs untouched". So the updater needs a **per-doc** subagent that reads the existing doc + the drifted files and rewrites only the specified doc(s). A new role prompt (`gsd-intel-updater`) is required. This is the "updater subagent" of D-04/D-05.

### 1.9 Heuristic changed-files → affected-docs mapping (D-05)

The rule table seeds candidate docs; the updater subagent confirms/adjusts. Rule entries are plain regex → doc-union matches (see §4.4 for the concrete recommendation). Overlap reconciliation: union all matching rules' doc sets and dedupe (this is the "reconciling overlapping candidates" discretion).

### 1.10 Subtree query scoping (CBQX-04/D-08)

A `queryScope` argument (same validation as `paths`, reusing `validatePaths`) restricts only the query subagent's targeted Glob/Grep exploration; the map docs are still loaded in full. Implementation mirrors the mapper `scopeHint` mechanism [VERIFIED: lib/map-codebase.js:138-139, 177] and injects a scope instruction into the query subagent prompt. `validatePaths`/`PATH_FORBIDDEN` is the exact validation to reuse [VERIFIED: lib/map-codebase.js:46-55].

---

## 2. Package legitimacy

**No new dependencies.** The bundle's `package.json` declares `"dependencies": {}` and peerDeps only (`@deepseek-ai/dsh-tools`, `schemastery`, `cordis`, `dsh-llm`) [VERIFIED: package.json]. Everything needed is already present:
- `node:crypto` for content hashing — Node built-in, present in the plugin's Node runtime (`v24.15.0` confirmed this session) [VERIFIED: `node --version` → v24.15.0; lib/state.js already imports `node:fs/promises`].
- `defineTool` object output schemas + `outputSchema` structured subagents — already in `@deepseek-ai/dsh-tools` (the sole tool-authoring API the bundle uses) [VERIFIED: dsh-tools lib/index.js:335, 836-882; lib/_runner.js:8-32].
- Structured subagent output plumbing — already in `@deepseek-ai/dsh-subagent` + the in-process spawn provider, used by the checkpoint flow [VERIFIED: lib/_runner.js:10-20, lib/execute.js:145-148].

No new package claim is made; nothing needs a registry check.

---

## 3. Risks and Open Questions

### Risks
- **R-1 (structured-output migration breaks existing tests).** Changing the tool's output from a string to an object invalidates the current `tools.test.mjs` assertions on the `gsd_map_codebase` describe block that call `assert.match(res, /.../)` on the execute return — query tests assert `/JWT/`, `/Sources/`, `/ARCHITECTURE\.md/` [VERIFIED: test/tools.test.mjs:880-916], mapping tests assert `/Codebase mapping complete/`, `/already exists/` [VERIFIED: test/tools.test.mjs:823-870]. These must be re-expressed against the object or the rendered text. Budget for this in the plan; it is the largest single risk. **Mitigation:** centralise a `renderAnswer/renderResult` so tests can assert on rendered text; update the affected describe-block assertions in the same wave as the schema change.
- **R-2 (mount test hardcodes counts).** `test/mount.test.mjs` hardcodes plugin rows (12), tool count (`ctx.tools.length === 13`), and the `EXPECTED_TOOL_NAMES` array [VERIFIED: test/mount.test.mjs:171-176, 196]. Adding `gsd_intel_updater` raises the tool count to 14 and requires adding the name to `EXPECTED_TOOL_NAMES`. Registering the updater **inside the same `lib/map-codebase.js` plugin** avoids touching `cordis.patch.yml` rows, `package.json` exports, and `EXPECTED_INSERT_ROWS` — only the tool-name array + tool count change. **Mitigation:** register `gsd_intel_updater` alongside `gsd_map_codebase` in the same plugin file (D-04's "registered alongside"), and update `EXPECTED_TOOL_NAMES` + the `=== 14` count in mount.test.mjs.
- **R-3 (drift walk cost on large repos).** Hashing every file content on every map call is O(n) content reads. **Mitigation:** store `size`; at drift-check time, treat a `size` difference as modified without a content read, and read+hash only same-size files to catch same-size edits. This keeps the common (append/rewrite) case cheap. Confidence in this mitigation: HIGH (stat size is reliable in both fake and real hosts).
- **R-4 (structured confidence robustness).** The subagent self-reports `confidence` 0-1. If structured output is absent/failed, `confidence` must not be NaN/undefined. **Mitigation:** clamp to `[0,1]`; on structured failure, fall back to deriving `{answer: r.output, confidence: 0, sources: []}` and render the failure note. Confidence calibration beyond self-report is **deferred** in CONTEXT (out of scope).

### Open Questions
- **OQ-1 (RESOLVED):** Must the *whole* tool output become an object schema, or only query mode? D-06 locks "the tool output is defined with an object schema". Since `output.schema` is per-tool and `execute`'s return is not validated against it, the faithful, consistent implementation is: declare an **object** `output.schema` and have `execute` return an **object on every path** (query → `{kind:'answer', answer, sources, confidence}`; mapping → a summary object; exists → a notice+drift object), with `render` converting any kind to readable text blocks. This is the recommended resolution; it keeps the schema truthful and unifies presentation. The cost is R-1's test migration. (Alternative — return an object only in query mode and keep strings elsewhere — "works" due to no validation but leaves the declared schema inconsistent; not recommended.)

---

## 4. Architectural Responsibility Map

| Capability | Tier | Placement | Rationale / evidence |
|---|---|---|---|
| Tool registration & arg parsing (`gsd_map_codebase`, `gsd_intel_updater`, `queryScope`/`paths` validation) | **presentation** | `lib/map-codebase.js` (`apply`, `defineTool`, `validatePaths`) | Already lives here; tool schema + presentCall are the UI of the tool [VERIFIED: lib/map-codebase.js:46-55, 72-82, 235]. |
| Query mode orchestration (load docs → budget → spawn query subagent → build answer object) | **integration** | `lib/map-codebase.js` `execute` query branch + `spawnSubagent` | Subagent I/O; orchestrator stays lean, subagent returns structured answer [VERIFIED: lib/map-codebase.js:96-119, lib/_runner.js:8-32]. |
| Query/updater subagent prompts (`gsd-intel-updater`, structured `gsd-codebase-query`) | **integration** | `lib/_agents.js` (new `GSD_INTEL_UPDATER_PROMPT`; extend `CODEBASE_QUERY_PROMPT`) | All role prompts live here; prompts are integration contracts with the fresh-context subagents [VERIFIED: lib/_agents.js:311-328]. |
| Drift math (walk+prune, hash, buildManifest, compareManifest, changed-files→docs heuristic table) | **domain** | new pure helper module `lib/_intel.js` | Pure, fs-free logic; unit-testable without a host; keeps `map-codebase.js` from growing unbounded. **Security note:** the ignore set (D-03) and the heuristic regexes are domain rules, but must not leak secrets — reuse `forbiddenFilesProse()`/`secretPatterns` so drifted secret files are never surfaced [VERIFIED: lib/_shared.js:387-431]. |
| Manifest read/write + codebase-doc store | **data** | `lib/state.js` (add `readCodebaseManifest`/`writeCodebaseManifest` reusing `_read`/`_write`/`_ensureParent`) | The map/manifest is a `.planning/` artefact; `codebaseDir`/`listCodebaseDocs`/`readCodebaseDoc` already route through `ctx.fs` [VERIFIED: lib/state.js:68-113]. **Security:** manifest write must route through `_write → ctx.fs`, never raw `node:fs` (mirrors DUR-06). |
| Drift report formatting + render of structured answer | **presentation** | `lib/map-codebase.js` (existing-check branch) + `output.render` | Human-readable text is presentation; D-06's "render for display (card)". |

**Security-tier audit:** The only security-sensitive surfaces are (a) not surfacing secret-file contents in drift reports or updater output — handled at the domain (ignore set) + integration (FORBIDDEN FILES in prompts) layers, and (b) path-scope validation preventing repo escape — already in the presentation layer via `PATH_FORBIDDEN` [VERIFIED: lib/map-codebase.js:46-55]. Both are in the correct tiers. No BLOCKER.

---

## 5. Validation Architecture

Baseline: `npm test` (`node --test test/*.test.mjs`) passes today (53 tools tests green this session; whole suite runs via `node --test`). [VERIFIED]

**Pure unit tests — new `test/intel.test.mjs` (domain, no fs, no LLM):**
- `buildManifest(entries)` normalises a walked tree into `{path, size, hash}` records; drops empty dirs and the D-03 ignore set (`.planning/`, `.git/`, `node_modules/`, `package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`).
- `compareManifest(manifest, current)` returns `{ added, removed, modified }` with counts; size-diff → modified without content read; same-size → hash compare.
- Heuristic table: `changedFilesToDocs(paths)` → deduped doc union; specific rule hits (e.g. `src/**` → STACK/ARCHITECTURE/STRUCTURE; `test/**` → TESTING; `package.json` → STACK).
- Confidence clamping: out-of-range → clamped to `[0,1]`.

**Tool-level tests — extend `test/tools.test.mjs` (FakeFs + fake subagents):**
- Mapping with `force:true` writes `.planning/codebase/.map-manifest.json` alongside the 7 docs.
- Existing map, no force/paths → returns the notice AND a drift summary when the FakeFs tree diverged from the manifest (add a file → `added`), and no drift when unchanged.
- Query mode returns a **structured object** `{answer, sources, confidence}` (fake `codebase-query` returns `structured`), with `sources[].kind` ∈ {map, codebase}; and a fallback when `structured` is missing.
- Query mode with `queryScope:["src/"]` injects the scope hint into the subagent prompt (assert on captured prompt text, mirroring the existing fake capture pattern).
- `gsd_intel_updater` given drifted paths rewrites only the affected docs (assert unaffected doc content unchanged, affected doc rewritten) and never touches unrelated docs.
- Update the existing `gsd_map_codebase` describe assertions (R-1) to assert on the object/rendered text.

**Service-level test — extend `test/service-tools.test.mjs`:**
- `readCodebaseManifest`/`writeCodebaseManifest` round-trip through `gsdState` (reuse the existing codebase-doc fixture pattern at lines 48-61).

**Mount/regression test — `test/mount.test.mjs`:**
- Add `gsd_intel_updater` to `EXPECTED_TOOL_NAMES` and bump `ctx.tools.length` to 14 (R-2).

---

## 6. Project Constraints (from project conventions)

- **Test command is fixed:** `npm test` → `node --test test/*.test.mjs`; all new tests must live under `test/*.test.mjs` (or `test/helpers/`) [VERIFIED: package.json scripts].
- **All writes route through `ctx.fs` / the `gsdState` artefact model** — never raw `node:fs` for artefacts (DUR-06). The manifest write must use `gsdState._write`/`ctx.fs.writeText`, not `node:fs/promises` [VERIFIED: lib/state.js:94-98].
- **No new runtime dependencies** — the bundle ships with `"dependencies": {}` [VERIFIED: package.json].
- **Fresh-context subagents** for any LLM work (mapper/query/updater) via `spawnSubagent`; the orchestrator never holds doc contents [VERIFIED: lib/map-codebase.js:183, lib/_runner.js:8-32].
- **Path-scope validation** is shared (`validatePaths`/`PATH_FORBIDDEN`) and must be reused for `queryScope` (D-08) [VERIFIED: lib/map-codebase.js:46-55].
- **Secrets discipline:** `secretPatterns`/`forbiddenFilesProse()` is the single source of truth; drift reports and updater output must never surface secret-file contents [VERIFIED: lib/_shared.js:387-431].
- **Commit scope:** `gitAddCommit` commits the whole `.planning/codebase/` dir (so the manifest, being in that dir, is committed with the map) [VERIFIED: lib/map-codebase.js:59-67].
- **Do not change:** the four focus areas, `FOCUS_DOCS`, or the mapper prompt templates' document structures (CONTEXT out-of-scope). The **query** prompt and a **new** updater prompt are in scope.
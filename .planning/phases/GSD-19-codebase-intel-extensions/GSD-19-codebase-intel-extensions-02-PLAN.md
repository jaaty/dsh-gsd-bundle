---
phase: 19-codebase-intel-extensions
plan: 02
type: execute
wave: 2
depends_on: ["GSD-19-codebase-intel-extensions-01"]
files_modified: ["lib/map-codebase.js", "test/tools.test.mjs"]
autonomous: true
requirements: ["CBQX-01"]
user_setup: []
must_haves:
  truths:
    - "Running gsd_map_codebase with force=true (or paths=[...]) writes a .map-manifest.json snapshot into .planning/codebase/."
    - "Running gsd_map_codebase on an unchanged codebase with an existing map and an existing manifest returns the 'already exists' notice with no drift lines."
    - "Running gsd_map_codebase after a file was added/modified/removed returns the notice plus an inline drift summary with changed/added/removed counts and representative paths."
    - "node_modules/, .git/, .planning/, and lockfiles never appear in the persisted manifest."
  artifacts:
    - path: "lib/map-codebase.js"
      provides: "walks the repo via ctx.fs, persists the manifest on every mapping path, and appends the drift report in the existing-check branch"
      min_lines: 0
      exports: ["apply"]
  key_links:
    - from: "lib/map-codebase.js"
      to: "lib/state.js"
      via: "walkRepo+buildManifest output is persisted by s.writeCodebaseManifest(cwd, manifest) under .planning/codebase/.map-manifest.json"
      pattern: "writeCodebaseManifest"
    - from: "lib/map-codebase.js"
      to: "lib/_intel.js"
      via: "the existing-check branch reads the manifest with s.readCodebaseManifest, rebuilds the live manifest with buildManifest(await walkRepo(...)) and compares with compareManifest to produce the drift summary"
      pattern: "compareManifest"
---

<objective>Wire drift detection into gsd_map_codebase (CBQX-01): after every mapping run (full / fast / paths / force), persist a content-hashed snapshot of the in-scope repo tree as .planning/codebase/.map-manifest.json via the new state accessor; and, when an existing map is present without force/paths, compare the live tree against that manifest and report changed/added/removed counts inline (D-01, D-02, D-03). The tool still returns strings in this wave — the object-output migration is plan 03.</objective>

<context>@lib/map-codebase.js (the whole tool — execute, existing-check branch at ~150, gitAddCommit ~209, FOCUS_DOCS, validatePaths)
@lib/_intel.js (buildManifest, compareManifest, IGNORE_PREFIXES, IGNORE_LOCKFILES) — created in plan 01
@lib/state.js (readCodebaseManifest, writeCodebaseManifest, codebaseDir, listCodebaseDocs) — created in plan 01
@test/tools.test.mjs (gsd_map_codebase describe block lines 814-951, makeSubagents fake, FakeFs fixture)</context>

<tasks>
  <task type="auto">
    <name>Task 1: add walkRepo and persist the manifest after full/force mapping (tracer)</name>
    <files>lib/map-codebase.js, test/tools.test.mjs</files>
    <read_first>lib/map-codebase.js, lib/state.js</read_first>
    <action>In lib/map-codebase.js: add `import { buildManifest } from "./_intel.js";`. Add a module-level async helper `async function walkRepo(ctx, s, cwd)` that recursively walks the repo via ctx.fs: start at the resolved cwd; use ctx.fs.resolve(target) then ctx.fs.stat(target); if stat.type === "file" read content with ctx.fs.readText(target) and push { path: rel, type: "file", size: stat.size ?? 0, content }; if stat.type === "dir", prune at descent any immediate child directory named "node_modules", ".git", or ".planning" (skip descending into it, per D-03), otherwise ctx.fs.listDir(target) and recurse each entry with a repo-relative path built as rel ? `${rel}/${e.name}` : e.name. Return the flat array. In execute, immediately before the `const committed = gitAddCommit(...)` call (around line 209) — i.e. on the mapping path where documents were produced — compute `const manifest = buildManifest(await walkRepo(ctx, s, cwd));` and `await s.writeCodebaseManifest(cwd, manifest);`. Add a test in tools.test.mjs gsd_map_codebase describe: full mode with force:true writes ${CWD}/.planning/codebase/.map-manifest.json on the FakeFs (assert fs.files.has the key and JSON.parse(fs.files.get(key)) is an array of {path,size,hash}).</action>
    <verify>node --test test/tools.test.mjs</verify>
    <acceptance_criteria>
      - node --test test/tools.test.mjs exits 0
      - grep -n "writeCodebaseManifest\|walkRepo" lib/map-codebase.js both match
      - the new test asserts .map-manifest.json exists after a force mapping
    </acceptance_criteria>
    <done>Force/full mapping writes a content-hashed .map-manifest.json via the state accessor, proven by a passing test.</done>
  </task>

  <task type="auto">
    <name>Task 2: drift report in the existing-check branch (D-02)</name>
    <files>lib/map-codebase.js, test/tools.test.mjs</files>
    <read_first>lib/map-codebase.js, lib/_intel.js</read_first>
    <action>Import compareManifest alongside buildManifest in lib/map-codebase.js. In the existing-check branch (existing.length && !args.force && !scoped.length, around line 150), before building the return string, read the stored manifest with `const manifest = await s.readCodebaseManifest(cwd);`. When manifest is an array with length > 0, compute `const current = buildManifest(await walkRepo(ctx, s, cwd)); const drift = compareManifest(manifest, current);`. When the total (drift.added.length + drift.removed.length + drift.modified.length) > 0, append to the returned notice a "## Drift detected" section listing counts for changed/added/removed and up to the first 5 paths of each bucket as bulleted backticked paths. When there is no drift, return the notice unchanged (no drift lines). Never include .planning/ or lockfile paths in the report (the ignore set in buildManifest already excludes them; do not re-add). Add tests in tools.test.mjs: (a) with an existing STACK.md + a written manifest, add a new file under src/ in the FakeFs then run the existing (no force) mapping and assert the return matches /Drift detected/ and /added/; (b) with the tree matching the manifest, assert the return does NOT match /Drift detected/ and still matches /already exists/.</action>
    <verify>node --test test/tools.test.mjs</verify>
    <acceptance_criteria>
      - node --test test/tools.test.mjs exits 0
      - grep -n "compareManifest" lib/map-codebase.js matches
      - the drift-present test asserts /Drift detected/ and /added/; the no-drift test asserts NOT /Drift detected/
    </acceptance_criteria>
    <done>The existing-check notice reports drift counts + representative paths when the tree diverges from the manifest, and stays clean when unchanged.</done>
  </task>

  <task type="auto">
    <name>Task 3: persist the manifest on fast and paths mapping modes and verify the ignore set</name>
    <files>lib/map-codebase.js, test/tools.test.mjs</files>
    <read_first>lib/map-codebase.js, lib/_intel.js</read_first>
    <action>Ensure the manifest write added in Task 1 runs on EVERY mapping path that produces documents — verify the write call site is shared (it already is, being before gitAddCommit after the mappers' Promise.all). If the write is currently only reachable on the full path, move/guard it so fast-mode and paths incremental-remap also persist the manifest (single call site after the results loop). Add tests in tools.test.mjs: (a) fast mode focus arch with force:true writes .map-manifest.json; (b) paths:["lib/"] incremental remap writes .map-manifest.json; (c) seed FakeFs with a node_modules/app.js file, a .planning/STATE.md file, a lockfile package-lock.json, and an empty dir; run a force mapping; read the persisted manifest via svc.readCodebaseManifest(CWD) and assert no record path contains "node_modules", ".planning", ".git", or matches a lockfile basename (per D-03).</action>
    <verify>node --test test/tools.test.mjs</verify>
    <acceptance_criteria>
      - node --test test/tools.test.mjs exits 0
      - fast and paths mapping tests assert .map-manifest.json is written
      - the ignore-set test asserts no manifest record path contains node_modules/.planning/.git or a lockfile basename
    </acceptance_criteria>
    <done>Every mapping mode persists the manifest, and the D-03 ignore set is proven by a passing test.</done>
  </task>
</tasks>

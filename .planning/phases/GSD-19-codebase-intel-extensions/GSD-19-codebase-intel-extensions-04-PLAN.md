---
phase: 19-codebase-intel-extensions
plan: 04
type: execute
wave: 4
depends_on: ["GSD-19-codebase-intel-extensions-03"]
files_modified: ["lib/map-codebase.js", "lib/_agents.js", "test/tools.test.mjs", "test/mount.test.mjs"]
autonomous: true
requirements: ["CBQX-02"]
user_setup: []
must_haves:
  truths:
    - "A new gsd_intel_updater tool is registered alongside gsd_map_codebase and appears in the mounted tool set."
    - "Given drifted paths, gsd_intel_updater maps them to the affected map docs and rewrites ONLY those docs, leaving unrelated docs byte-identical."
    - "With no paths argument and an existing manifest, gsd_intel_updater auto-detects the drifted paths itself."
    - "With no manifest and no paths, gsd_intel_updater returns a helpful notice instead of throwing."
  artifacts:
    - path: "lib/map-codebase.js"
      provides: "registers gsd_intel_updater and wires drifted paths → affected docs → updater subagent"
      min_lines: 0
      exports: ["apply"]
    - path: "lib/_agents.js"
      provides: "GSD_INTEL_UPDATER_PROMPT for the per-doc updater subagent"
      min_lines: 30
      exports: ["GSD_INTEL_UPDATER_PROMPT"]
  key_links:
    - from: "lib/map-codebase.js"
      to: "lib/_intel.js"
      via: "changedFilesToDocs(driftedPaths) maps changed files to the affected doc set"
      pattern: "changedFilesToDocs"
    - from: "lib/map-codebase.js"
      to: "lib/_runner.js"
      via: "spawnSubagent with label 'gsd-intel-updater' + GSD_INTEL_UPDATER_PROMPT rewrites only the affected docs"
      pattern: "gsd-intel-updater"
---

<objective>Add the gsd-intel-updater tool for targeted re-map (CBQX-02): register it alongside gsd_map_codebase in the same plugin (D-04), map drifted paths to the affected docs via the changedFilesToDocs heuristic table (D-05), and spawn a fresh-context per-doc updater subagent that rewrites ONLY the affected docs, leaving unrelated docs untouched. Includes the mount-test regression updates (R-2) and tool-level coverage.</objective>

<context>@lib/map-codebase.js (apply() registration at 69-237, walkRepo/buildManifest/compareManifest from plan 02, output object schema/render from plan 03, FOCUS_DOCS, gitAddCommit)
@lib/_intel.js (changedFilesToDocs, DOC_RULES, buildManifest, compareManifest)
@lib/_agents.js (CODEBASE_MAPPER_PROMPT as the prompt pattern to mirror for the updater)
@lib/state.js (readCodebaseManifest, readCodebaseDoc, codebaseDir)
@test/tools.test.mjs (makeSubagents fake, registerTool, gsd_map_codebase describe)
@test/mount.test.mjs (EXPECTED_TOOL_NAMES line 171, ctx.tools.length === 13 lines 196 & 317, test title line 314)</context>

<tasks>
  <task type="auto">
    <name>Task 1: register gsd_intel_updater with auto-detect and no-manifest notice (tracer)</name>
    <files>lib/map-codebase.js, test/tools.test.mjs</files>
    <read_first>lib/map-codebase.js, lib/state.js</read_first>
    <action>In lib/map-codebase.js apply(), register a second defineTool named "gsd_intel_updater" alongside gsd_map_codebase (D-04: same plugin, no cordis.patch.yml / package.json change). Parameters: { paths: { type: "array", items: { type: "string" }, description: "Drifted repo-relative paths. Omit to auto-detect drifted paths from the map manifest." } }. Reuse the object output schema + render from plan 03 (copy the same output block). execute: resolve cwd = cwdOf(exec); const s = gsd(); read the manifest via `const manifest = await s.readCodebaseManifest(cwd);`. Compute drifted paths: if args.paths given → validatePaths(args.paths); else if manifest is a non-empty array → build `const current = buildManifest(await walkRepo(ctx, s, cwd));` then `const drift = compareManifest(manifest, current);` and driftedPaths = [...drift.added, ...drift.removed, ...drift.modified]; else driftedPaths = []. When driftedPaths.length === 0: if no manifest, return { kind: "notice", text: "No .planning/codebase/.map-manifest.json found — run gsd_map_codebase (force=true) to build the map snapshot, then retry gsd_intel_updater." }; if a manifest existed but no drift, return { kind: "notice", text: "No drift detected since the last map." }. (The actual rewrite spawn happens in Task 2; for this task return a placeholder { kind: "updater", text: "Targeted update pending." } when driftedPaths.length > 0.) Add a smoke test in tools.test.mjs: with no manifest, gsd_intel_updater({}) returns renderResult(res) matching /No .planning\/codebase\/.map-manifest.json/ and never throws.</action>
    <verify>node --test test/tools.test.mjs</verify>
    <acceptance_criteria
    >- node --test test/tools.test.mjs exits 0
      - grep -n "\"gsd_intel_updater\"" lib/map-codebase.js matches
      - the smoke test asserts renderResult(res) matches /No .planning\/codebase\/.map-manifest.json/
    </acceptance_criteria>
    <done>gsd_intel_updater is registered, auto-detects drift from the manifest, and returns a helpful notice when no map exists.</done>
  </task>

  <task type="auto">
    <name>Task 2: changedFilesToDocs wiring + updater subagent rewrites only affected docs (D-05)</name>
    <files>lib/map-codebase.js, lib/_agents.js, test/tools.test.mjs</files>
    <read_first>lib/map-codebase.js, lib/_agents.js, lib/_intel.js</read_first>
    <action>Import changedFilesToDocs from "./_intel.js". In gsd_intel_updater execute, when driftedPaths.length > 0: compute `let docs = changedFilesToDocs(driftedPaths);` then filter to the valid map docs that currently exist: keep only names in the set ["STACK","INTEGRATIONS","ARCHITECTURE","STRUCTURE","CONVENTIONS","TESTING","CONCERNS"] AND for which `await s.readCodebaseDoc(cwd, name + ".md")` is defined. If the filtered list is empty return { kind: "notice", text: "No affected map documents to update." }. Otherwise build the updater prompt: a block naming `Today's date: ${today()}`, `Map directory: ${s.codebaseDir(cwd)}/`, `Affected documents:` (one `- NAME.md` line each), `Drifted paths:` (one `- backticked path` each), the instruction to read ONLY the listed existing docs + explore ONLY the drifted paths, rewrite ONLY the listed docs using their templates, preserve unrelated docs untouched, set date stamps, and append GSD_INTEL_UPDATER_PROMPT. Spawn `const r = await spawnSubagent(ctx, exec, { label: "gsd-intel-updater", promptText: prompt });`. After it returns, return { kind: "updater", text: "Targeted codebase update complete.\n\nAffected documents rewritten:\n" + docs.map((d) => `- ${d}.md`).join("\n") + (r.output ? "\n\n" + String(r.output).slice(0, 300) : "") }. In lib/_agents.js add `export const GSD_INTEL_UPDATER_PROMPT = ...` — a role prompt for gsd-intel-updater (fresh-context): reads the listed existing map docs + explores ONLY the drifted files; rewrites ONLY the listed docs (per-doc, targeted, template-faithful) and NEVER touches unrelated docs; sets the **Analysis Date:** / footer / refreshed stamps from the "Today's date:" line; includes the FORBIDDEN FILES rule via ${forbiddenFilesProse()} and "return confirmation only" like CODEBASE_MAPPER_PROMPT. Import forbiddenFilesProse already present at the top of _agents.js. In test/tools.test.mjs, add a fake branch `label.startsWith("intel-updater")`: parse the "Affected documents:" lines from req.prompt[0].text, rewrite each named `.md` file in the FakeFs with new >20-line content, and leave every other codebase doc byte-identical; return "## Update Complete". Add a tool test: seed STACK.md, ARCHITECTURE.md, TESTING.md; run gsd_intel_updater({ paths: ["src/lib/auth.ts"] }); assert renderResult(res) matches /Targeted codebase update complete/ and /STACK\.md/ and /ARCHITECTURE\.md/; assert TESTING.md content is byte-identical to its pre-run value (unaffected doc untouched, per D-05).</action>
    <verify>node --test test/tools.test.mjs</verify>
    <acceptance_criteria
    >- node --test test/tools.test.mjs exits 0
      - grep -n "changedFilesToDocs\|GSD_INTEL_UPDATER_PROMPT" lib/map-codebase.js and lib/_agents.js respectively match
      - the updater test asserts renderResult(res) matches /Targeted codebase update complete/, /STACK\.md/, /ARCHITECTURE\.md/, and that TESTING.md is byte-identical before/after
      - grep -c "FORBIDDEN FILES" lib/_agents.js returns 3 (mapper + query + updater)
    </acceptance_criteria>
    <done>gsd_intel_updater maps drifted paths to affected docs and a fresh-context updater subagent rewrites only those, proven by a test asserting the unaffected doc is byte-identical.</done>
  </task>

  <task type="auto">
    <name>Task 3: mount-test regression (R-2) + auto-detect coverage</name>
    <files>lib/map-codebase.js, test/mount.test.mjs, test/tools.test.mjs</files>
    <read_first>test/mount.test.mjs, test/tools.test.mjs</read_first>
    <action>Update test/mount.test.mjs for the new tool count (R-2): add "gsd_intel_updater" to the EXPECTED_TOOL_NAMES array (line 171-176); change the two `ctx.tools.length === 13` assertions to `=== 14` (lines 196 and 317); update the test title at line 314 from "all 13 registered tools" to "all 14 registered tools"; update the now-stale "12" comments to 13 for tool names where they are tool-name comments (leave plugin/command counts unchanged — only the tool count changed because gsd_intel_updater registers inside the existing map-codebase plugin). In test/tools.test.mjs add a coverage test for auto-detect: seed STACK.md and a .map-manifest.json via svc.writeCodebaseManifest(CWD, [{path:"src/lib/auth.ts", size:10, hash:"abc"}]); add the file src/lib/auth.ts to the FakeFs; run gsd_intel_updater({}) (no paths); assert the affected STACK.md is rewritten by the fake updater and the result includes the auto-detected path (the fake branch rewrites docs named in the prompt). Confirm the whole suite still passes.</action>
    <verify>node --test test/mount.test.mjs && node --test test/tools.test.mjs && node --test test/intel.test.mjs && node --test test/service-tools.test.mjs</verify>
    <acceptance_criteria
    >- node --test test/mount.test.mjs exits 0 (tool count 14, EXPECTED_TOOL_NAMES includes gsd_intel_updater)
      - grep -c "gsd_intel_updater" test/mount.test.mjs returns 1 (in EXPECTED_TOOL_NAMES)
      - grep -c "=== 14" test/mount.test.mjs returns 2
      - node --test test/tools.test.mjs exits 0 including the auto-detect updater test
    </acceptance_criteria>
    <done>The mount test reflects the 14th tool, and gsd_intel_updater's auto-detect-from-manifest path is covered by a passing test.</done>
  </task>
</tasks>

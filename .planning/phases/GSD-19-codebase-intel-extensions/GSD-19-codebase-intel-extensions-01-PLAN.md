---
phase: 19-codebase-intel-extensions
plan: 01
type: execute
wave: 1
depends_on: []
files_modified: ["lib/_intel.js", "lib/state.js", "test/intel.test.mjs", "test/service-tools.test.mjs"]
autonomous: true
requirements: ["CBQX-01", "CBQX-02"]
user_setup: []
must_haves:
  truths:
    - "The drift math produces added/removed/modified path lists from two manifests, ignoring .planning/, .git/, node_modules/ and lockfiles."
    - "The codebase-map manifest round-trips (write→read) through the gsdState artefact model with no data loss."
    - "Changed repo-relative paths map to a deduped set of affected map-document names via a heuristic rule table."
  artifacts:
    - path: "lib/_intel.js"
      provides: "pure, fs-free drift-math + heuristic helpers every feature builds on"
      min_lines: 120
      exports: ["buildManifest", "compareManifest", "changedFilesToDocs", "clampConfidence", "IGNORE_PREFIXES", "IGNORE_LOCKFILES"]
    - path: "lib/state.js"
      provides: "gsdState manifest read/write accessors routed through ctx.fs"
      min_lines: 0
      exports: ["GsdState"]
  key_links:
    - from: "lib/_intel.js"
      to: "lib/state.js"
      via: "buildManifest's output is persisted by writeCodebaseManifest under .planning/codebase/.map-manifest.json through _write→ctx.fs, and re-read by readCodebaseManifest"
      pattern: "readCodebaseManifest|writeCodebaseManifest"
---

<objective>Build the pure, fs-free domain layer (buildManifest / compareManifest / changedFilesToDocs / clampConfidence) in a new lib/_intel.js, plus the gsdState manifest read/write accessors in lib/state.js, each with unit / service tests. This is the foundation all four CBQX features consume: drift detection (CBQX-01) uses buildManifest+compareManifest, and the updater (CBQX-02) uses changedFilesToDocs. No tool behaviour changes in this plan — it ships only helpers + data plumbing.</objective>

<context>@lib/_shared.js (secretPatterns, forbiddenFilesProse) — not modified, referenced for secret discipline
@lib/state.js (GsdState class, _read/_write/_ensureParent, codebaseDir, readCodebaseDoc) — the accessors are added here
@test/service-tools.test.mjs (codebase-doc fixture pattern at lines 48-61) — the service test to extend
@test/helpers/fake-fs.mjs (FakeFs stat/listDir/readText/writeText/resolve) — the fake fs the tests run on</context>

<tasks>
  <task type="auto">
    <name>Task 1: create lib/_intel.js with buildManifest, compareManifest, clampConfidence and unit tests (tracer)</name>
    <files>lib/_intel.js, test/intel.test.mjs</files>
    <read_first>lib/state.js, test/helpers/fake-fs.mjs</read_first>
    <action>Create lib/_intel.js. Import { createHash } from "node:crypto". Export the constants and functions:
- IGNORE_PREFIXES = [".planning/", ".git/", "node_modules/"].
- IGNORE_LOCKFILES = a RegExp matching, as a full repo-relative path, the basenames: package-lock.json, yarn.lock, pnpm-lock.yaml, npm-shrinkwrap.json, bun.lock, bun.lockb, composer.lock, Gemfile.lock, poetry.lock, Cargo.lock (e.g. /(^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|npm-shrinkwrap\.json|bun\.lockb?|composer\.lock|Gemfile\.lock|poetry\.lock|Cargo\.lock)$/).
- buildManifest(entries): entries is an array of walked nodes shaped { path (repo-relative string), type ("file"|"dir"), size (number), content (string|undefined) }. Keep a Map path→entry of surviving FILE entries: drop any node whose type is "dir" (empty dirs are excluded because the manifest only records files); drop any file whose path fully matches IGNORE_LOCKFILES or starts with one of IGNORE_PREFIXES (per D-03 ignore set). For each surviving file compute hash = createHash("sha1").update(String(content ?? "")).digest("hex"). Return an array of { path, size, hash } sorted lexicographically by path.
- compareManifest(manifest, current): both are arrays of { path, size, hash }. Build path Sets. added = current paths not in manifest. removed = manifest paths not in current. For paths present in both: modified when the sizes differ, OR when both records have a defined hash and the hashes differ; when a record's hash is undefined but sizes match, treat as NOT modified. Return { added, removed, modified }, each a sorted array of paths.
- clampConfidence(n): return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0 (per D-07/R-4 robustness).
Create test/intel.test.mjs using node:test + node:assert/strict. Cover: buildManifest drops lockfiles, .git/, node_modules/, .planning/ entries and all dir entries, and emits {path,size,hash}; compareManifest returns correct added/removed/modified for size-diff, hash-diff, and undefined-hash-same-size cases; clampConfidence clamps out-of-range values to [0,1] and returns 0 for non-finite input.</action>
    <verify>node --check lib/_intel.js && node --test test/intel.test.mjs</verify>
    <acceptance_criteria>
      - lib/_intel.js exists and node --check lib/_intel.js exits 0
      - node --test test/intel.test.mjs exits 0 (all unit tests pass)
      - grep -c "buildManifest\|compareManifest\|clampConfidence\|IGNORE_PREFIXES\|IGNORE_LOCKFILES" lib/_intel.js returns 5
    </acceptance_criteria>
    <done>lib/_intel.js exports the five drift primitives and test/intel.test.mjs passes green.</done>
  </task>

  <task type="auto">
    <name>Task 2: add readCodebaseManifest / writeCodebaseManifest to gsdState and a service round-trip test</name>
    <files>lib/state.js, test/service-tools.test.mjs</files>
    <read_first>lib/state.js, test/service-tools.test.mjs</read_first>
    <action>In lib/state.js, inside the GsdState class, insert two methods immediately after the readCodebaseDoc method (ends around line 85):
- readCodebaseManifest(cwd): const text = await this._read(`${this.codebaseDir(cwd)}/.map-manifest.json`); if text === undefined return null; try parse JSON; return the parsed value when Array.isArray(parsed) else null; catch → return null (never throw, mirroring readConfig's tolerant JSON pattern).
- writeCodebaseManifest(cwd, manifest): await this._write(`${this.codebaseDir(cwd)}/.map-manifest.json`, JSON.stringify(manifest, null, 2) + "\n"). MUST route through this._write → ctx.fs (DUR-06 / D-01: the manifest is a .planning/ artefact and must never be written with raw node:fs/promises).
In test/service-tools.test.mjs add a describe block following the existing gsdState codebase-doc fixture pattern (buildProject + FakeFs at CWD, service methods called via svc): write a two-record manifest, read it back and assert.deepEqual on the records; write again with different content and assert the second read reflects the overwrite; assert readCodebaseManifest returns null before any write and for a corrupt JSON payload.</action>
    <verify>node --test test/service-tools.test.mjs</verify>
    <acceptance_criteria>
      - node --test test/service-tools.test.mjs exits 0
      - grep -c "readCodebaseManifest\|writeCodebaseManifest" lib/state.js returns 2
      - grep -n "_write(\`\${this.codebaseDir(cwd)}/.map-manifest.json" lib/state.js matches (manifest write routes through _write)
    </acceptance_criteria>
    <done>gsdState exposes readCodebaseManifest/writeCodebaseManifest and the round-trip + corrupt + missing tests pass.</done>
  </task>

  <task type="auto">
    <name>Task 3: add changedFilesToDocs heuristic rule table to lib/_intel.js with unit tests</name>
    <files>lib/_intel.js, test/intel.test.mjs</files>
    <read_first>lib/_intel.js</read_first>
    <action>Append to lib/_intel.js: export const DOC_RULES, an array of { test: RegExp, docs: string[] } pairs, and export function changedFilesToDocs(paths). Define DOC_RULES with these exact entries (overlap reconciliation is union-and-dedupe, per D-05):
- /(^|\/)(package\.json|pnpm-workspace\.yaml)$/ → ["STACK"]
- /(^|\/)(tsconfig.*\.json|vite\.config\..*|webpack\.config\..*|rollup\.config\..*|babel\.config\..*|\.eslintrc.*|\.prettierrc.*)$/ → ["STACK","CONVENTIONS"]
- /\/(src|app|lib|core|packages|internal)\// → ["STACK","ARCHITECTURE","STRUCTURE"]
- /\/(tests?|spec|__tests__|fixtures?)\// → ["TESTING"]
- /\.(test|spec|e2e)\.[jt]sx?$/ → ["TESTING"]
- /(^|\/)(Dockerfile|docker-compose.*\.ya?ml|\.github\/.*|\.gitlab-ci\.yml)$/ → ["INTEGRATIONS"]
- /\/(db|migrations?|prisma|sql)\// → ["ARCHITECTURE"]
- /\.(ts|tsx|js|jsx)$/ → ["STRUCTURE","CONVENTIONS"]
- /\.(md|markdown)$/ → ["CONVENTIONS"]
changedFilesToDocs(paths): for each repo-relative path in paths, for each rule whose test matches the path, add every entry of rule.docs to a Set; return the Set's values as a sorted array (deduped). Add unit tests to test/intel.test.mjs: a path "src/lib/auth.ts" yields STACK, ARCHITECTURE, STRUCTURE, CONVENTIONS; "test/auth.test.ts" yields TESTING (and STRUCTURE/CONVENTIONS via the code rule); "package.json" yields STACK; overlapping rules are deduped (e.g. "src/app.ts" → single occurrence of each doc).</action>
    <verify>node --test test/intel.test.mjs</verify>
    <acceptance_criteria>
      - node --test test/intel.test.mjs exits 0
      - grep -c "changedFilesToDocs\|DOC_RULES" lib/_intel.js returns 2
      - grep -c "STACK\|ARCHITECTURE\|STRUCTURE\|TESTING\|INTEGRATIONS\|CONVENTIONS" lib/_intel.js returns 6
    </acceptance_criteria>
    <done>changedFilesToDocs maps drifted paths to a deduped, sorted affected-doc set and its tests pass.</done>
  </task>
</tasks>

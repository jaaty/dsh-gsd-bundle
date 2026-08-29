---
phase: 30-publishable-package
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - package.json
  - package-lock.json
autonomous: true
requirements: ["REL-01"]
user_setup: []
must_haves:
  truths:
    - "package.json reports \"version\": \"2.2.0\" matching the active milestone"
    - "package.json carries repository, homepage, bugs, keywords, engines, and author with the exact values from D-04..D-09"
    - "The files whitelist ships DISTRIBUTION.md, CONTRIBUTING.md, CODE_OF_CONDUCT.md, and CHANGELOG.md in addition to the existing lib/*.js, cordis.patch.yml, README.md, NOTICE, and does NOT list LICENSE"
    - "package-lock.json reports 2.2.0 at the top-level \"version\" and at the root package packages[\"\"].version so npm ci / prepublishOnly stay in sync"
    - "No runtime change: dependencies stays {}, no prepare/build/prepack script is added, and publishConfig.access stays public"
  artifacts:
    - path: "package.json"
      provides: "Publish-ready manifest: version bump to 2.2.0, six npm metadata fields (repository/homepage/bugs/keywords/engines/author), expanded files whitelist."
      min_lines: 82
      exports: ["version", "repository", "homepage", "bugs", "keywords", "engines", "author", "files"]
    - path: "package-lock.json"
      provides: "Lockfile kept in sync with the manifest version (top-level + root package) so npm ci and the SHIP-01 gate stay green."
      min_lines: 255
      exports: ["version", "packages[\"\"].version", "packages"]
  key_links:
    - from: "package-lock.json"
      to: "package.json"
      via: "root package packages[\"\"] and top-level version both equal manifest version 2.2.0"
      pattern: '"version": "2.2.0",\n  "lockfileVersion"|"version": "2.2.0"'
    - from: "README.md"
      to: "package.json :: files"
      via: "every repo-root .md the README links to is either in files or auto-included (LICENSE)"
      pattern: 'DISTRIBUTION\.md|CONTRIBUTING\.md|CODE_OF_CONDUCT\.md|CHANGELOG\.md'
---
<objective>
Make the npm manifest publish-ready for the public-launch milestone v2.2.0 without any runtime code change: bump the version, keep the lockfile in sync, add the six missing metadata fields, and expand the files whitelist to ship every README-linked doc. This is the shipping-critical metadata gate for REL-01 and the prerequisite for phase 31 npm-publish.
</objective>
<context>
@package.json — the manifest being edited (current version 2.0.0; no repository/homepage/bugs/keywords/engines/author today; files = ["lib/*.js","cordis.patch.yml","README.md","NOTICE"]; publishConfig.access public; dependencies {}).
@package-lock.json — "version": "2.0.0" at the top level (L3) AND at packages[""] (L9); both must become "2.2.0".
@README.md — links DISTRIBUTION.md (L59), CONTRIBUTING.md / CODE_OF_CONDUCT.md / CHANGELOG.md (L226).
@LICENSE — MIT, present at repo root; npm auto-includes it, so it must NOT be listed in files.
</context>
<tasks>
  <task type="auto">
    <name>Task 1 (TRACER): Bump the version to 2.2.0 across manifest and lockfile</name>
    <files>package.json, package-lock.json</files>
    <read_first>package.json, package-lock.json</read_first>
    <action>This is the thinnest end-to-end shipping slice: the manifest↔lockfile version agreement that npm ci and the prepublishOnly gate depend on. Edit package.json field "version" from "2.0.0" to "2.2.0" (per D-01). Edit package-lock.json in exactly two places — the top-level "version" (L3, currently "2.0.0") and the root package version inside packages[""] (L9, currently "2.0.0") — both to "2.2.0" (per D-02). Do NOT edit any other lockfile entry (node_modules hashes/integrity must stay untouched). Do NOT delete or reformat the lockfile; preserve lockfileVersion 3 and all integrity/resolved fields verbatim.</action>
    <verify>node -e 'const p=require("./package.json"),l=require("./package-lock.json");if(p.version!=="2.2.0"){console.error("pkg-version",p.version);process.exit(1)}if(l.version!=="2.2.0"){console.error("lock-top",l.version);process.exit(2)}if(l.packages&&l.packages[""]&&l.packages[""].version!=="2.2.0"){console.error("lock-root",l.packages[""].version);process.exit(3)}console.log("version-sync-ok")'</verify>
    <acceptance_criteria>
      - The node -e version-sync check prints "version-sync-ok" and exits 0.
      - grep -c '"version": "2.0.0"' package.json package-lock.json prints 0 matches across both files.
      - No other lockfile entry changed: git diff --stat package-lock.json touches no node_modules lines when diffed.
    </acceptance_criteria>
    <done>All three version declarations (manifest, lock top-level, lock root package) read "2.2.0" and the sync check exits 0 with no drift.</done>
  </task>

  <task type="auto">
    <name>Task 2: Add the six npm metadata fields</name>
    <files>package.json</files>
    <read_first>package.json</read_first>
    <action>Insert the following fields into package.json, keeping the existing identity-group style (name/version/description/type/main/scripts/exports/files first). Exact values are LOCKED per CONTEXT; do not deviate:
repository (D-04): {"type": "git", "url": "git+https://github.com/jaaty/dsh-gsd-bundle.git"} — object form.
homepage (D-05): "https://github.com/jaaty/dsh-gsd-bundle".
bugs (D-06): {"url": "https://github.com/jaaty/dsh-gsd-bundle/issues"} — DO NOT add the legacy bugs.email key.
author (D-07): "jaaty <jamie.atyeo@live.com>".
engines (D-08): {"node": ">=20"}.
keywords (D-09): ["dsh","deepseek-harness","plugin","bundle","opengsd","git","ship","automation","agile"].
Key ORDER and grouping within package.json is executor discretion (keep it readable and consistent). Guard-scope invariants: leave "dependencies": {} untouched, add NO prepare/build/prepack script, leave "scripts" as-is (test and prepublishOnly both stay "node --test test/*.test.mjs"), and leave publishConfig.access public.</action>
    <verify>node -e 'const p=require("./package.json");const c=[p.repository&&p.repository.type==="git",p.repository&&p.repository.url==="git+https://github.com/jaaty/dsh-gsd-bundle.git",p.homepage==="https://github.com/jaaty/dsh-gsd-bundle",p.bugs&&p.bugs.url==="https://github.com/jaaty/dsh-gsd-bundle/issues",p.author==="jaaty <jamie.atyeo@live.com>",p.engines&&p.engines.node===">=20",p.keywords&&["dsh","deepseek-harness","plugin","bundle","opengsd","git","ship","automation","agile"].every(k=>p.keywords.includes(k)),p.dependencies&&Object.keys(p.dependencies).length===0,!p.scripts.prepare&&!p.scripts.build&&!p.scripts.prepack,p.publishConfig&&p.publishConfig.access==="public"];if(c.some(x=>!x)){console.error("metadata-fail",c);process.exit(1)}console.log("metadata-ok")'</verify>
    <acceptance_criteria>
      - The metadata check prints "metadata-ok" and exits 0.
      - grep -c "prepare\|build\|prepack" package.json (scripts block) shows no new prepublish/build/prepack script.
      - node -e 'JSON.parse(require("fs").readFileSync("package.json","utf8"));console.log("json-ok")' prints "json-ok".
    </acceptance_criteria>
    <done>All six metadata fields present with their exact locked values, dependencies unchanged at {}, no build scripts added, publishConfig still public, and the JSON is syntactically valid.</done>
  </task>

  <task type="auto">
    <name>Task 3: Expand the files whitelist to ship every README-linked doc</name>
    <files>package.json</files>
    <read_first>package.json, README.md</read_first>
    <action>Edit the "files" array so it contains every repo-root .md the README links to, keeping all existing entries (D-10). Resulting files array = ["lib/*.js","cordis.patch.yml","README.md","NOTICE","DISTRIBUTION.md","CONTRIBUTING.md","CODE_OF_CONDUCT.md","CHANGELOG.md"]. Do NOT add "LICENSE" to the array (npm auto-includes an MIT LICENSE; listing it would deviate from D-10). Do NOT add ".github" or ".github/workflows/ci.yml". Do NOT add ".planning" or any other entry. Then verify README-link closure: README links DISTRIBUTION.md (L59), CONTRIBUTING.md / CODE_OF_CONDUCT.md / CHANGELOG.md (L226) — all four are in files; LICENSE is auto-included.</action>
    <verify>node -e 'const p=require("./package.json");const f=p.files;const need=["lib/*.js","cordis.patch.yml","README.md","NOTICE","DISTRIBUTION.md","CONTRIBUTING.md","CODE_OF_CONDUCT.md","CHANGELOG.md"];if(!need.every(x=>f&&f.includes(x))){console.error("files-missing",f);process.exit(1)}if(f.includes("LICENSE")){console.error("files-has-license");process.exit(2)}if(f.some(x=>x.startsWith(".github")||x.startsWith(".planning"))){console.error("files-extra");process.exit(3)}console.log("files-ok")'</verify>
    <acceptance_criteria>
      - The files check prints "files-ok" and exits 0.
      - node -e 'JSON.parse(require("fs").readFileSync("package.json","utf8"));console.log("json-ok")' prints "json-ok".
      - grep for "LICENSE" inside the files array of package.json returns no match within the files block.
      - npm test (node --test test/*.test.mjs) still passes, proving the metadata edits did not break import resolution.
    </acceptance_criteria>
    <done>The files whitelist ships exactly the four README-linked docs plus the existing lib/cordis.patch.yml/README/NOTICE, does not list LICENSE or .github/.planning, the JSON parses valid, and the test suite is green.</done>
  </task>
</tasks>

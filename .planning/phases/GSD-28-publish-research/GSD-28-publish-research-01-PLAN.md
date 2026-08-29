---
phase: 28-publish-research
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - DISTRIBUTION.md
  - package.json
  - README.md
autonomous: true
requirements: ["PUB-05"]
user_setup: []
must_haves:
  truths:
    - "DISTRIBUTION.md exists at the repo root and records a research-backed distribution decision (npm publish as primary, clone-and-install-from-source as documented secondary) with triangulated evidence from all three sources (web, local node_modules inspection, live npm registry queries)."
    - "DISTRIBUTION.md records the no-collision finding for @dsh-gsd/bundle (D-06) and the EROFS-vs-curl registry-query workaround (D-07)."
    - "package.json carries publishConfig.access: public and a prepublishOnly script, so the bundle is npm-publish-ready with no further metadata work."
    - "README Install/Quickstart documents the chosen primary distribution path (npm: dsh plugin --profile <name> add @dsh-gsd/bundle), keeps the clone-and-install path as a documented alternative, and links to DISTRIBUTION.md."
    - "No functional changes are made to lib/* or test/* (D-08 regression guard); git diff --stat lib/ test/ is empty after the phase."
    - "npm test still passes after the metadata edits (MOUNT-06 regression guard)."
  artifacts:
    - path: "DISTRIBUTION.md"
      provides: "The research-backed distribution decision + full triangulated evidence (web, local, npm registry), the no-collision finding, the EROFS workaround note, and the deferred 'actually run npm publish' item."
      min_lines: 60
      exports: []
    - path: "package.json"
      provides: "Publish-readiness metadata: publishConfig.access: public + prepublishOnly: node --test test/*.test.mjs (existing files/name/version/peerDependencies/license left unchanged)."
      min_lines: 40
      exports: []
    - path: "README.md"
      provides: "Install/Quickstart aligned to the chosen primary path with clone-and-install as a documented alternative and a link to DISTRIBUTION.md."
      min_lines: 200
      exports: []
  key_links:
    - from: "README.md"
      to: "DISTRIBUTION.md"
      via: "A markdown link in the Install section pointing at the root DISTRIBUTION.md decision doc."
      pattern: "\\[DISTRIBUTION\\.md\\]\\(DISTRIBUTION\\.md\\)"
---

<objective>
Deliver PUB-05: a research-backed distribution decision for @dsh-gsd/bundle (npm publish vs clone-and-install-from-source), documented in a new top-level DISTRIBUTION.md and applied lightly to the repo metadata (package.json publish-readiness fields + README Install/Quickstart), matching the behavior of other dsh plugins. No actual `npm publish` is run, no CI/release workflow is added, and no functional changes touch lib/* or test/* (D-08). The research is already triangulated in RESEARCH.md (web + local + npm registry); this plan writes the decision doc and aligns the two metadata files.
</objective>

<context>
@.planning/phases/GSD-28-publish-research/GSD-28-publish-research-RESEARCH.md
@.planning/phases/GSD-28-publish-research/GSD-28-publish-research-CONTEXT.md
@package.json
@README.md
@.planning/REQUIREMENTS.md
@.planning/codebase/CONVENTIONS.md
@.planning/codebase/STRUCTURE.md
</context>

<tasks>
  <task type="auto">
    <name>Task 1 (tracer): Write DISTRIBUTION.md with the research-backed decision + triangulated evidence</name>
    <files>DISTRIBUTION.md</files>
    <read_first>.planning/phases/GSD-28-publish-research/GSD-28-publish-research-RESEARCH.md, .planning/phases/GSD-28-publish-research/GSD-28-publish-research-CONTEXT.md, package.json, README.md, NOTICE, LICENSE</read_first>
    <action>
Create a NEW top-level file `DISTRIBUTION.md` at the repo root (alongside LICENSE, NOTICE, CHANGELOG.md, CONTRIBUTING.md, CODE_OF_CONDUCT.md per D-03). It is the single durable home for the decision AND its evidence (per D-02 — no separate RESEARCH.md in the repo). Structure it with these sections, populated from RESEARCH.md:
1. Title + one-paragraph summary stating the decision: primary distribution is **npm publish** of `@dsh-gsd/bundle`; secondary, still-documented path is **clone-and-install-from-source** via `dsh plugin --profile <name> add <path>`. State that the research was NOT inconclusive (clear npm-publish precedent exists), so the D-05 fallback does not apply.
2. "Evidence — Source 1: Web" — summarize the dsh plugin ecosystem / distribution docs: the official packaging tutorial treats a bundle as an npm package shipping a configuration layer; `dsh plugin add` forwards args verbatim to pnpm so it accepts npm names, local paths, file:/link: forms, and git URLs equally. Cite the two GitHub docs URLs listed in RESEARCH.md and the third-party marketplace guides.
3. "Evidence — Source 2: Local inspection" — summarize the installed `@deepseek-ai/dsh` checkout at /var/home/jatyeo/.nvm/versions/node/v24.15.0/lib/node_modules/@deepseek-ai/dsh: it is itself npm-published with `publishConfig.access: public`, `files: lib/*.js, config`, a `bin`, MIT license; its ~60 dependencies are scoped `@deepseek-ai/dsh-*` / `@deepseek-ai/cordis-*` resolved from the registry. Note that no third-party dsh-* bundles are present locally, so registry queries (source 3) establish third-party precedent.
4. "Evidence — Source 3: npm registry queries" — record the third-party community plugins that ARE published with `dsh.bundle.patch`: `dsh-plugin` (1.3.11, prepublishOnly + prepack, MIT), `dsh-plugin-appshot` (0.4.1, publishConfig.access:public + prepack), `dsh-find-plugin` (0.3.7), plus `dsh-plugin-om` / `dsh-plugin-ima-sync` from `npm search`. Include a short table of the peerDependencies confirmed published (@deepseek-ai/dsh, dsh-tools, cordis). State the recommended evidence-collection command is `curl https://registry.npmjs.org/<url-encoded-name>` because `npm view`/`npm install` EROFS-fail on the read-only ~/.npm/_cacache (per D-07 / R-01).
5. "Name-collision check (D-06)" — record that `curl https://registry.npmjs.org/@dsh-gsd%2fbundle` returned `{"error":"Not found"}` and the `@dsh-gsd` scope search returned only unrelated packages, so there is no collision; D-06 does not trigger.
6. "Build/prepare note" — state the bundle has NO prepare/build/prepack script and ships plain ESM lib/*.js as source, so both a published tarball and a clone install need zero build; pnpm ≥10's allowBuilds gate does not apply.
7. "Decision + apply scope (D-04)" — state the chosen path and that the apply is limited to: DISTRIBUTION.md (this doc), package.json publishConfig + prepublishOnly, and README Install/Quickstart. Explicitly note what is OUT OF SCOPE / deferred: actually running `npm publish`, a GitHub Actions release/publish workflow, lockstep versioned npm releases, any lib/* or test/* changes (D-08), the CI test workflow (phase 27), and the .planning/ keep-vs-gitignore decision (phase 26).
Do not invent registry data not in RESEARCH.md; if you re-query the registry for fresh evidence, use `curl https://registry.npmjs.org/<url-encoded-name>` and record any failure in this doc per D-07. Keep all cited URLs as markdown links. The file must be plain markdown, no fenced shell transcripts beyond short command examples.
</action>
    <verify>test -f DISTRIBUTION.md &amp;&amp; grep -qi "npm publish" DISTRIBUTION.md &amp;&amp; grep -qi "clone-and-install\|clone-and-install-from-source" DISTRIBUTION.md &amp;&amp; grep -qi "registry.npmjs.org\|npm registry" DISTRIBUTION.md &amp;&amp; grep -qi "D-06\|collision\|Not found" DISTRIBUTION.md &amp;&amp; grep -qi "D-07\|EROFS\|curl" DISTRIBUTION.md</verify>
    <acceptance_criteria>
      - `test -f DISTRIBUTION.md` succeeds (file exists at repo root)
      - `grep -qi "npm publish" DISTRIBUTION.md` (primary path stated)
      - `grep -qiE "clone-and-install(-from-source)?" DISTRIBUTION.md` (secondary path stated)
      - `grep -qi "registry.npmjs.org" DISTRIBUTION.md` (registry evidence source present)
      - `grep -qiE "collision|Not found|no collision" DISTRIBUTION.md` (D-06 finding recorded)
      - `grep -qiE "EROFS|curl https://registry" DISTRIBUTION.md` (D-07 workaround recorded)
      - `wc -l DISTRIBUTION.md` reports >= 60 lines
    </acceptance_criteria>
    <done>DISTRIBUTION.md exists at the repo root, records the npm-publish-primary / clone-secondary decision, and embeds the triangulated evidence (web + local + registry), the no-collision finding (D-06), and the EROFS-vs-curl note (D-07).</done>
  </task>

  <task type="auto">
    <name>Task 2: Align package.json publish-readiness fields to the chosen path (D-04)</name>
    <files>package.json</files>
    <read_first>package.json, .planning/phases/GSD-28-publish-research/GSD-28-publish-research-RESEARCH.md, .planning/codebase/CONVENTIONS.md</read_first>
    <action>
Edit the existing `package.json` (do NOT rewrite it) to add npm-publish-readiness metadata, matching the observed ecosystem pattern (dsh-plugin-appshot carries `publishConfig.access: public`; dsh-plugin carries a `prepublishOnly`):
- Add a top-level `"publishConfig": { "access": "public" }` key (scoped packages default to restricted without this). Per D-04.
- Add a `"prepublishOnly": "node --test test/*.test.mjs"` entry under `scripts` (this is exactly the existing `test` script value from package.json:8, matching the dsh-plugin `prepublishOnly: npm run verify:release` pattern — per Claude's Discretion). Do NOT add a `prepare`, `build`, or `prepack` script (there is nothing to build; plain ESM source).
- Leave UNCHANGED: `name`, `version`, `description`, `type`, `main`, `exports`, `files` (already ships lib/*.js + cordis.patch.yml + README.md + NOTICE and excludes .planning/), `dsh`, `dependencies` (must stay {}), `peerDependencies`, `license`. Do not touch `exports`, do not reorder existing keys beyond what's needed for valid JSON.
Keep the file valid JSON. Do not run `npm publish`, `npm pack`, or `npm install` in this task.
</action>
    <verify>node -e "const p=require('./package.json'); if(p.publishConfig?.access!=='public')throw new Error('publishConfig.access'); if(p.scripts.prepublishOnly!=='node --test test/*.test.mjs')throw new Error('prepublishOnly'); if(!p.files.includes('cordis.patch.yml'))throw new Error('files.cordis'); if(p.files.includes('.planning/'))throw new Error('planning-in-files'); if(JSON.stringify(p.dependencies)!=='{}')throw new Error('deps-changed'); console.log('ok')"</verify>
    <acceptance_criteria>
      - `node -e "..."` one-liner above exits 0 (publishConfig.access public, prepublishOnly set to the test command, cordis.patch.yml still in files, .planning/ not in files, dependencies still {})
      - `node -e "JSON.parse(require('fs').readFileSync('package.json','utf8'))"` exits 0 (valid JSON)
      - `git diff --stat lib/ test/` is empty (no functional files touched)
      - `npm test` exits 0 (MOUNT-06 regression guard — metadata change did not break import resolution)
    </acceptance_criteria>
    <done>package.json is valid JSON, carries publishConfig.access:public and a prepublishOnly that runs the existing test command, and everything else (name/version/files/exports/peerDependencies/license/dependencies) is unchanged.</done>
  </task>

  <task type="auto">
    <name>Task 3: Rewrite README Install/Quickstart to the chosen path and link DISTRIBUTION.md (D-03, D-04)</name>
    <files>README.md</files>
    <read_first>README.md, DISTRIBUTION.md, .planning/phases/GSD-28-publish-research/GSD-28-publish-research-RESEARCH.md</read_first>
    <action>
Edit the existing `README.md` Install section (currently at lines 46-55) and Quickstart section (currently at lines 57+) to align to the chosen primary distribution path while keeping clone-and-install as a documented alternative:
- Rewrite the Install section so the PRIMARY command is `dsh plugin --profile <name> add @dsh-gsd/bundle` (npm registry install), followed by `dsh --profile <name> web` (or tui/headless). Add a short "Alternative — install from source" subsection giving the clone path `dsh plugin --profile <name> add <path-to-this-bundle>` (the current command) for users who prefer a local/git checkout. Keep the existing explanation that the bundle's cordis.patch.yml overrides the host agent-loop row and inserts the 12 GSD plugin rows.
- Add a one-line link to the decision doc near the top of the Install section, e.g. "See [DISTRIBUTION.md](DISTRIBUTION.md) for the research-backed distribution decision." (per D-03 — this is the key_link verified below).
- Leave the Quickstart numbered list (gsd_init → gsd_status → gsd_discuss → ... → gsd_ship) and the surrounding "Prerequisites", "Features", "gsd_* tools", "Slash-commands", "How it works", contributing/license sections UNCHANGED except for any internal cross-references that must stay valid.
Do NOT touch the `.planning/ artefacts` description, the License section, or the existing root-doc links (CHANGELOG.md / CONTRIBUTING.md / CODE_OF_CONDUCT.md) — those are phase 25/26 patterns to preserve, not change. Do not change the README's mention of clone-install beyond moving it to the documented alternative subsection.
</action>
    <verify>grep -qE "dsh plugin --profile <name> add @dsh-gsd/bundle" README.md &amp;&amp; grep -qE "DISTRIBUTION\.md\]\(DISTRIBUTION\.md\)" README.md &amp;&amp; grep -qi "install from source\|from source\|clone" README.md &amp;&amp; test -f DISTRIBUTION.md &amp;&amp; npm test</verify>
    <acceptance_criteria>
      - `grep -qE "dsh plugin --profile <name> add @dsh-gsd/bundle" README.md` (primary npm path documented)
      - `grep -qE "\[DISTRIBUTION\.md\]\(DISTRIBUTION\.md\)" README.md` (key_link: README → DISTRIBUTION.md present)
      - `grep -qiE "install from source|from source|clone" README.md` (clone path retained as alternative)
      - `git diff --stat lib/ test/` is empty (D-08 regression guard)
      - `npm test` exits 0 (no metadata/doc change broke the suite)
    </acceptance_criteria>
    <done>README Install presents the npm registry path as primary, keeps clone-and-install-from-source as a documented alternative, links to DISTRIBUTION.md, and all other README sections are preserved.</done>
  </task>
</tasks>
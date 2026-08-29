---
phase: GSD-34-readme-badges
plan: GSD-34-readme-badges-01
type: execute
wave: 1
depends_on: []
files_modified: ["README.md"]
autonomous: true
requirements: ["REL-05"]
gap_closure: false
user_setup: []
must_haves:
  truths:
    - "The README displays exactly three badges — CI-status, license, npm-version — on a single markdown line immediately below the `# dsh-gsd-bundle` H1 and before the intro paragraph (D-01, D-05)."
    - "The CI badge targets the whole `CI` workflow (`.github/workflows/ci.yml`) on branch `main` (D-02)."
    - "The npm-version badge statically shows v2.2.0 — it is pinned to `@2.2.0`, not a dynamic `latest` badge (D-03)."
    - "All three badges are clickable links: CI -> CI workflow file, license -> LICENSE file, npm -> npm package page (D-04)."
    - "The `Release status` section references the `public-launch` v2.2.0 milestone as the latest release alongside the prior v2.1 note (D-07)."
  artifacts:
    - path: "README.md"
      provides: "README with a three-badge health/provenance row and a v2.2.0 release-status narrative"
      min_lines: 245
      exports: []
  key_links:
    - from: "README.md (CI badge)"
      to: "https://github.com/jaaty/dsh-gsd-bundle/actions/workflows/ci.yml"
      via: "clickable CI badge linking its image URL to the workflow file"
      pattern: "\\[!\\[CI\\]\\((https://github\\.com/jaaty/dsh-gsd-bundle/actions/workflows/ci\\.yml)/badge\\?branch=main\\)\\](\\(\\1\\))"
    - from: "README.md (license badge)"
      to: "https://github.com/jaaty/dsh-gsd-bundle/blob/main/LICENSE"
      via: "clickable license badge linking to the LICENSE file"
      pattern: "\\[!\\[License\\]\\(https://img\\.shields\\.io/github/license/jaaty/dsh-gsd-bundle\\?style=flat-square\\)\\]\\(https://github\\.com/jaaty/dsh-gsd-bundle/blob/main/LICENSE\\)"
    - from: "README.md (npm-version badge)"
      to: "https://www.npmjs.com/package/@dsh-gsd/bundle"
      via: "clickable npm badge statically pinned to v2.2.0 linking to the npm package page"
      pattern: "\\[!\\[npm version\\]\\(https://img\\.shields\\.io/npm/v/@dsh-gsd/bundle@2\\.2\\.0\\?style=flat-square\\)\\]\\(https://www\\.npmjs\\.com/package/@dsh-gsd/bundle\\)"
---
<objective>
Deliver the README badge row and the release-status narrative update for phase 34 so the public repo signals health and provenance (REL-05). This plan owns the README.md changes only: the three-badge row (D-01…D-05) and the release-status reference to the public-launch v2.2.0 milestone (D-07).
</objective>

<context>
@README.md
@package.json
@.github/workflows/ci.yml
@.planning/phases/GSD-34-readme-badges/GSD-34-readme-badges-CONTEXT.md
</context>

<tasks>
  <task type="auto">
    <name>Task 1 (tracer): Correct and lock the three-badge row directly under the H1</name>
    <files>README.md</files>
    <read_first>README.md,.github/workflows/ci.yml,package.json</read_first>
    <action>
      This is the phase's thinnest end-to-end deliverable. A partial badge row likely already exists from a prior run (lines 2-6 of README.md), so do NOT blindly append — instead bring the existing badge row to EXACTLY match this locked spec.

      The badge row must be a SINGLE contiguous markdown line (per D-05 "in a single line") placed immediately after the `# dsh-gsd-bundle` H1 with NO blank line between the H1 and the badge line, and before the intro paragraph. The line must contain exactly these three image links, in this order, with the given image URLs (style=flat-square) and link URLs (all three clickable per D-04):

      1. CI-status (D-02 — whole CI workflow on branch main, GitHub-native Actions badge):
         image https://github.com/jaaty/dsh-gsd-bundle/actions/workflows/ci.yml/badge?branch=main
         link  https://github.com/jaaty/dsh-gsd-bundle/actions/workflows/ci.yml
         Markdown: [![CI](<image>)](<link>)
      2. license (D-04 — links to the LICENSE file; shields.io github/license badge):
         image https://img.shields.io/github/license/jaaty/dsh-gsd-bundle?style=flat-square
         link  https://github.com/jaaty/dsh-gsd-bundle/blob/main/LICENSE
      3. npm-version (D-03 — STATIC mirror of the current release, pinned to v2.2.0, NOT the dynamic `latest` form):
         image https://img.shields.io/npm/v/@dsh-gsd/bundle@2.2.0?style=flat-square
         link  https://www.npmjs.com/package/@dsh-gsd/bundle

      CRITICAL correction per D-03: a dynamic, unpinned npm badge (https://img.shields.io/npm/v/@dsh-gsd/bundle — no @2.2.0 pin) is NOT acceptable and must be replaced. The image URL must carry the `@2.2.0` version pin so the badge statically shows v2.2.0 and never reflects a future release.

      Do not add any badge beyond these three (D-01 forbids e.g. an npm-downloads badge). Use only the default shields style/flat-square as given; no extra label/color query parameters needed. Ensure exactly one blank line follows the badge row before the intro paragraph.
    </action>
    <verify>node -e "const r=require('fs').readFileSync('README.md','utf8'); const m=r.match(/^# dsh-gsd-bundle\n\[!\[CI\]\(https:\/\/github\.com\/jaaty\/dsh-gsd-bundle\/actions\/workflows\/ci\.yml\/badge\?branch=main\)\]\(https:\/\/github\.com\/jaaty\/dsh-gsd-bundle\/actions\/workflows\/ci\.yml\) \[!\[License\]\(https:\/\/img\.shields\.io\/github\/license\/jaaty\/dsh-gsd-bundle\?style=flat-square\)\]\(https:\/\/github\.com\/jaaty\/dsh-gsd-bundle\/blob\/main\/LICENSE\) \[!\[npm version\]\(https:\/\/img\.shields\.io\/npm\/v\/@dsh-gsd\/bundle@2\.2\.0\?style=flat-square\)\]\(https:\/\/www\.npmjs\.com\/package\/@dsh-gsd\/bundle\)\n/); if(!m){console.error('badge row missing or malformed');process.exit(1)} console.log('badge row OK')"</verify>
    <acceptance_criteria>
      - README.md contains the CI action badge URL `https://github.com/jaaty/dsh-gsd-bundle/actions/workflows/ci.yml/badge?branch=main` (D-02)
      - README.md contains the license image `https://img.shields.io/github/license/jaaty/dsh-gsd-bundle?style=flat-square` linking to the LICENSE file (D-04)
      - README.md contains the npm image `https://img.shields.io/npm/v/@dsh-gsd/bundle@2.2.0?style=flat-square` linking to the npm page (D-03, D-04)
      - README.md does NOT contain the unpinned dynamic `https://img.shields.io/npm/v/@dsh-gsd/bundle?` npm badge form (D-03)
      - The three badges form one contiguous line immediately after the `# dsh-gsd-bundle` H1 and before the intro paragraph (D-01, D-05)
      - No npm-downloads or other extra badge exists in the row (D-01)
    </acceptance_criteria>
    <done>
      The badge row is a single line directly under the H1 containing exactly the three specified clickable badges; the npm badge is statically pinned to @2.2.0; grep verification passes.
    </done>
  </task>

  <task type="auto">
    <name>Task 2: Reference the public-launch v2.2.0 milestone as the latest release (D-07)</name>
    <files>README.md</files>
    <read_first>README.md</read_first>
    <action>
      Update the `## Release status` section so the currently-released milestone is named as the latest release. This covers the "Update the Release status blurb to reference the currently-released v2.2.0 public-launch milestone" scope and D-07.

      Concretely:
      1. Rewrite the bold intro paragraph of `## Release status` (currently the line starting `**Milestone \`public-release-readiness\` v2.1 is complete and released as \`v2.1.0\`**`) so it now declares `public-launch` v2.2.0 as the latest released milestone. Lead with the new milestone: state that milestone `public-launch` v2.2.0 is complete and released as `v2.2.0`, covering the full 34-phase milestone (the complete GSD bundle as specified). Briefly summarize what the milestone delivers without inventing new claims inconsistent with REQUIREMENTS.md.
      2. Keep the v2.1 note referenced as a prior milestone, and keep the existing `### v2.1 release note — public-release-readiness` and `### v2.0 release note — graceful-removal` subsections intact below.
      3. Insert a `### v2.2 release note — public-launch` subsection above the v2.1 note describing what the public-launch / v2.2 milestone added (phases 30-34: publishable-package, publish-research, github-repo-config, readme-badges — licensing/packaging, distribution research, repo discoverability config, and provenance/health badges), staying factual to REQUIREMENTS.md. Exact wording is at your discretion within D-07.

      Do NOT alter the badge row (Task 1's output) or any section other than the Release status area. Do not touch LICENSE, package.json, or the CI workflow.
    </action>
    <verify>grep -n "public-launch" README.md && grep -n "v2.2.0" README.md</verify>
    <acceptance_criteria>
      - README.md's `## Release status` opening states milestone `public-launch` v2.2.0 is complete and released as `v2.2.0` (D-07)
      - A `### v2.2 release note — public-launch` subsection exists in README.md (D-07)
      - The prior `### v2.1 release note — public-release-readiness` subsection still exists in README.md (D-07)
      - The badge row from Task 1 is unchanged and still passes the Task 1 verification command
    </acceptance_criteria>
    <done>
      The Release status section references public-launch v2.2.0 as the latest release and retains the v2.1/v2.0 notes; grep checks pass.
    </done>
  </task>
</tasks>

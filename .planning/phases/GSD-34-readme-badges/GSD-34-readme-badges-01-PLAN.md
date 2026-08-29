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
    - "README.md displays CI-status, license, and npm-version badges immediately below the main header."
    - "All badges use the 'flat-square' style."
  artifacts:
    - path: "README.md"
      provides: "Project README with health and provenance badges"
      min_lines: 10
      exports: []
  key_links:
    - from: "README.md"
      to: "https://github.com/jaaty/dsh-gsd-bundle/actions/workflows/ci.yml"
      via: "CI Badge"
      pattern: "github.com/jaaty/dsh-gsd-bundle/actions/workflows/ci.yml"
    - from: "README.md"
      to: "https://github.com/jaaty/dsh-gsd-bundle/blob/main/LICENSE"
      via: "License Badge"
      pattern: "github.com/jaaty/dsh-gsd-bundle/blob/main/LICENSE"
    - from: "README.md"
      to: "https://www.npmjs.com/package/@dsh-gsd/bundle"
      via: "npm Badge"
      pattern: "npmjs.com/package/@dsh-gsd/bundle"
---

<objective>
Add CI-status, license, and npm-version badges to the README to signal project health and provenance, adhering to the flat-square style and specific placements decided in CONTEXT.md.
</objective>

<context>
@README.md
@package.json
@.github/workflows/ci.yml
</context>

<tasks>
  <task type="auto">
    <name>Task 1: Tracer - Add CI Status Badge</name>
    <files>README.md</files>
    <read_first>README.md,.github/workflows/ci.yml</read_first>
    <action>
      Insert the GitHub Actions CI status badge immediately below the main # dsh-gsd-bundle header (per D-01). 
      Use the URL: `https://github.com/jaaty/dsh-gsd-bundle/actions/workflows/ci.yml/badge?branch=main`.
      The badge should be wrapped in a Markdown image link pointing to the workflow page.
    </action>
    <verify>grep "github.com/jaaty/dsh-gsd-bundle/actions/workflows/ci.yml/badge" README.md</verify>
    <acceptance_criteria>
      - README.md contains the CI badge URL base path.
      - Badge is positioned below the H1 header.
    </acceptance_criteria>
    <done>CI badge is successfully inserted and verified via grep.</done>
  </task>

  <task type="auto">
    <name>Task 2: Add License and npm Version Badges</name>
    <files>README.md</files>
    <read_first>README.md,package.json</read_first>
    <action>
      Add the License and npm version badges next to the CI badge (per D-01).
      1. License Badge (per D-04): Use `https://img.shields.io/github/license/jaaty/dsh-gsd-bundle?style=flat-square`. Link it to the LICENSE file or GitHub license page.
      2. npm Version Badge (per D-05): Use `https://img.shields.io/npm/v/@dsh-gsd/bundle?style=flat-square`. Link it to the npm registry page for @dsh-gsd/bundle.
      Ensure all badges use the 'flat-square' style (per D-02).
    </action>
    <verify>
      grep "img.shields.io/github/license/jaaty/dsh-gsd-bundle?style=flat-square" README.md &amp;&amp; 
      grep "img.shields.io/npm/v/@dsh-gsd/bundle?style=flat-square" README.md
    </verify>
    <acceptance_criteria>
      - README.md contains the license badge URL with style=flat-square.
      - README.md contains the npm version badge URL with style=flat-square.
      - All three badges are grouped together below the H1 header.
    </acceptance_criteria>
    <done>License and npm badges are inserted and verified.</done>
  </task>
</tasks>

---
phase: 26-repo-hygiene
plan: 01
type: execute
wave: 1
depends_on: []
files_modified: ["CHANGELOG.md", "CODE_OF_CONDUCT.md", "CONTRIBUTING.md"]
autonomous: true
requirements: ["PUB-03"]
gap_closure: false
user_setup: []
must_haves:
  truths:
    - "A CHANGELOG.md exists at the repo root in Keep-a-Changelog format with an [Unreleased] section plus [2.0.0] and [1.7.0] dated sections, each summarizing the shipped phases."
    - "A CODE_OF_CONDUCT.md exists at the repo root carrying the Contributor Covenant 2.1 text with the project name and community contact filled in."
    - "A CONTRIBUTING.md exists at the repo root covering development setup, how to run the test suite, the PR/contribution workflow, the GSD phase loop, and a no-credentials-in-.planning hygiene rule."
  artifacts:
    - path: "CHANGELOG.md"
      provides: "Keep-a-Changelog changelog with Unreleased + v2.0.0 + v1.7.0 entries"
      min_lines: 40
      exports: []
    - path: "CODE_OF_CONDUCT.md"
      provides: "Contributor Covenant 2.1 code of conduct"
      min_lines: 40
      exports: []
    - path: "CONTRIBUTING.md"
      provides: "Full-depth contribution guide (setup, tests, PR workflow, GSD loop, hygiene rule)"
      min_lines: 40
      exports: []
  key_links: []
---
<objective>Create the three repo-root documentation files — CHANGELOG.md, CODE_OF_CONDUCT.md, and CONTRIBUTING.md — that PUB-03 requires. This is the content plan for the phase: it delivers the actual documentation artefacts. The verification test that proves all phase outputs is written in plan 03, after the README links and curate decision are also in place.</objective>
<context>
@CHANGELOG.md (does not exist yet — create it)
@CODE_OF_CONDUCT.md (does not exist yet — create it)
@CONTRIBUTING.md (does not exist yet — create it)
@package.json (version 2.0.0; test script is "node --test test/*.test.mjs")
@.planning/ROADMAP.md (phase table with the exact phase names and milestone boundaries)
@NOTICE (phase 25 output; CODE_OF_CONDUCT.md sits alongside it at the repo root)
</context>
<tasks>
  <task type="auto">
    <name>Task 1: Create CHANGELOG.md in Keep-a-Changelog format (D-01, D-02)</name>
    <files>CHANGELOG.md</files>
    <read_first>package.json, .planning/ROADMAP.md</read_first>
    <action>Create CHANGELOG.md at the repo root. Use the Keep-a-Changelog format (https://keepachangelog.com/en/1.1.0/): a "# Changelog" title, a short intro paragraph, then an "## [Unreleased]" section at the top, then dated "## [2.0.0] - 2026-08-28" and "## [1.7.0] - 2026-08-28" sections. Each version section uses the change-type subsections (Added / Changed / Deprecated / Removed / Fixed / Security) as appropriate. The file is hand-maintained — plain Markdown, no generation tooling. Populate the entries with the verified milestone boundaries: v1.7.0 (milestone job-intel-multiwindow) = phases 1-20: live-mount, service-tools, loop-e2e, checkpoint-resume, window-ledger, loop-robustness, uat-conversation, capability-gates, job-runtime, codebase-query, phase-dir-resolution, single-source-constants, gate-dispatch, execute-checkpoint, ship-robustness, context-budget, phase-branch-isolation, job-runtime-extensions, codebase-intel-extensions, multi-window-topology. v2.0.0 (milestone graceful-removal) = phases 21-24: capability-services, reactive-loop-rendering, removal-verification, composability-hardening. The [Unreleased] section covers the in-progress public-release-readiness milestone (v2.1.0): license-and-attribution (shipped), repo-hygiene (in progress), ci-and-security, publish-research. Do NOT put phases 21-24 in the v1.7.0 entry. Do NOT put phases 25-28 in the v2.0.0 entry.</action>
    <verify>grep -c '^## \[' CHANGELOG.md should be 3; grep -q '^# Changelog' CHANGELOG.md; grep -q '^## \[Unreleased\]' CHANGELOG.md; grep -q '^## \[2.0.0\]' CHANGELOG.md; grep -q '^## \[1.7.0\]' CHANGELOG.md</verify>
    <acceptance_criteria>
      - grep -q '^# Changelog' CHANGELOG.md
      - grep -q '^## \[Unreleased\]' CHANGELOG.md
      - grep -q '^## \[2.0.0\]' CHANGELOG.md
      - grep -q '^## \[1.7.0\]' CHANGELOG.md
      - grep -q 'multi-window-topology' CHANGELOG.md (v1.7.0 entry)
      - grep -q 'composability-hardening' CHANGELOG.md (v2.0.0 entry)
      - grep -q 'repo-hygiene' CHANGELOG.md (Unreleased entry)
    </acceptance_criteria>
    <done>CHANGELOG.md exists at the repo root with an Unreleased section plus dated v2.0.0 and v1.7.0 sections, each summarizing the correct milestone's shipped phases.</done>
  </task>
  <task type="auto">
    <name>Task 2: Create CODE_OF_CONDUCT.md (Contributor Covenant 2.1) (D-03)</name>
    <files>CODE_OF_CONDUCT.md</files>
    <read_first>NOTICE</read_first>
    <action>Create CODE_OF_CONDUCT.md at the repo root using the canonical Contributor Covenant 2.1 text (https://www.contributor-covenant.org/version/2/1/code_of_conduct/code_of_conduct.md). Preserve the template's sections verbatim: Pledge, Standards, Enforcement Responsibilities, Scope, Enforcement, and the Attribution section (which names "Contributor Covenant 2.1" and links the canonical source — do not strip it). Fill the placeholder fields with the project's real values: the project name is "dsh-gsd-bundle" and the community contact is the GitHub issues URL https://github.com/jaaty/dsh-gsd-bundle/issues (use this in the "reporting" and "enforcement" contact placeholders).</action>
    <verify>grep -q 'Contributor Covenant' CODE_OF_CONDUCT.md; grep -q '2.1' CODE_OF_CONDUCT.md; grep -q 'dsh-gsd-bundle' CODE_OF_CONDUCT.md; grep -q 'github.com/jaaty/dsh-gsd-bundle/issues' CODE_OF_CONDUCT.md</verify>
    <acceptance_criteria>
      - grep -q 'Contributor Covenant' CODE_OF_CONDUCT.md
      - grep -q '2.1' CODE_OF_CONDUCT.md
      - grep -q 'dsh-gsd-bundle' CODE_OF_CONDUCT.md
      - grep -q 'github.com/jaaty/dsh-gsd-bundle/issues' CODE_OF_CONDUCT.md
      - grep -q 'Attribution' CODE_OF_CONDUCT.md
    </acceptance_criteria>
    <done>CODE_OF_CONDUCT.md exists at the repo root with the full Contributor Covenant 2.1 text, placeholders filled, and the Attribution section preserved.</done>
  </task>
  <task type="auto">
    <name>Task 3: Create CONTRIBUTING.md (full-depth) (D-04, D-05)</name>
    <files>CONTRIBUTING.md</files>
    <read_first>README.md, package.json</read_first>
    <action>Create CONTRIBUTING.md at the repo root. It must be full-depth and cover, in order: (1) development setup (clone, install dependencies, prerequisites), (2) how to run the test suite — the command is "npm test" which runs "node --test test/*.test.mjs" (mirror package.json's test script), (3) the PR/contribution workflow — each phase runs on a phase-&lt;N&gt; feature branch and gsd_ship runs capability gates (security, broken-windows, TDD-audit) and creates the PR via gh, (4) a short explanation of the GSD phase loop accurate to this repo: Discuss → Plan → Execute → Verify → Ship, with an optional UI-design step between Discuss and Plan. Include the hygiene rule (D-05): state explicitly that no real credentials or tokens may be pasted into .planning/ artefacts, because the durable subset of .planning/ is committed to the repository.</action>
    <verify>grep -q 'node --test' CONTRIBUTING.md; grep -q 'npm test' CONTRIBUTING.md; grep -q 'Discuss' CONTRIBUTING.md; grep -q 'Ship' CONTRIBUTING.md; grep -q 'credentials' CONTRIBUTING.md; grep -q '\.planning/' CONTRIBUTING.md</verify>
    <acceptance_criteria>
      - grep -q 'node --test' CONTRIBUTING.md
      - grep -q 'npm test' CONTRIBUTING.md
      - grep -q 'Discuss' CONTRIBUTING.md
      - grep -q 'Ship' CONTRIBUTING.md
      - grep -q 'credentials' CONTRIBUTING.md
      - grep -q '\.planning/' CONTRIBUTING.md
    </acceptance_criteria>
    <done>CONTRIBUTING.md exists at the repo root covering setup, the test command, the PR workflow, the GSD phase loop, and the no-credentials-in-.planning hygiene rule.</done>
  </task>
</tasks>

---
phase: 26-repo-hygiene
plan: 02
type: execute
wave: 1
depends_on: []
files_modified: [".gitignore"]
autonomous: true
requirements: ["PUB-03"]
gap_closure: false
user_setup: []
must_haves:
  truths:
    - "The .gitignore file contains entries for the volatile .planning/ paths: async-jobs.json, WINDOWS.md, quick/, and per-phase *-DISCUSSION-LOG.md at any depth under .planning/phases/."
    - "The already-tracked volatile .planning/ files are removed from the git index (git rm --cached) but remain on disk, so the GSD tools' write behaviour is unchanged."
    - "The durable .planning/ artefacts (PROJECT.md, REQUIREMENTS.md, ROADMAP.md, STATE.md, config.json, codebase/, and per-phase CONTEXT/RESEARCH/PLAN/SUMMARY/VERIFICATION) remain tracked."
  artifacts:
    - path: ".gitignore"
      provides: "Curate-decision entries gitignoring volatile .planning/ churn"
      min_lines: 6
      exports: []
  key_links:
    - from: ".gitignore"
      to: ".planning/"
      via: "volatile .planning/ paths are gitignored and untracked (D-06/D-07)"
      pattern: "\\.planning/(async-jobs\\.json|WINDOWS\\.md|quick/|phases/\\*\\*/\\*-DISCUSSION-LOG\\.md)"
---
<objective>Apply the .planning/ curate decision (D-06, D-07): keep the durable artefacts the GSD loop needs to orient tracked, and gitignore the volatile churn. Because the volatile files are already tracked, this requires both adding .gitignore entries AND running git rm --cached on each already-tracked volatile path (keeping the files on disk so the GSD tools' write behaviour is unchanged). The per-phase DISCUSSION-LOG glob is depth-agnostic (.planning/phases/**/*-DISCUSSION-LOG.md) so it covers both the depth-2 per-phase files and the depth-3 demo-artifacts file, and the depth-3 file is untracked here from the start so the initial execution is correct.</objective>
<context>
@.gitignore (currently contains only "node_modules/")
@.planning/ (durable + volatile artefacts; volatile files are currently tracked in git)
@.planning/phases/GSD-03-loop-e2e/demo-artifacts/DEMO-01-demo-DISCUSSION-LOG.md (a depth-3 volatile file that must also be ignored and untracked)
</context>
<tasks>
  <task type="auto">
    <name>Task 1: Add .gitignore entries for the volatile .planning/ paths (D-06, D-07)</name>
    <files>.gitignore</files>
    <read_first>.gitignore</read_first>
    <action>Edit .gitignore to add a comment line and the four volatile-path entries, keeping the existing "node_modules/" line. Add exactly these entries: ".planning/async-jobs.json", ".planning/WINDOWS.md", ".planning/quick/", and ".planning/phases/**/*-DISCUSSION-LOG.md". The per-phase DISCUSSION-LOG glob MUST be exactly ".planning/phases/**/*-DISCUSSION-LOG.md" (depth-agnostic: gitignore ** matches zero or more path segments, so it covers both the depth-2 per-phase files and the depth-3 file .planning/phases/GSD-03-loop-e2e/demo-artifacts/DEMO-01-demo-DISCUSSION-LOG.md). It matches only *-DISCUSSION-LOG.md files and never the durable -CONTEXT.md / -RESEARCH.md / -PLAN.md / -SUMMARY.md / -VERIFICATION.md files. Do NOT add any durable .planning/ path to .gitignore. Do NOT change any GSD tool's write behaviour (D-07) — this is a .gitignore edit only.</action>
    <verify>grep -q '^\.planning/async-jobs\.json$' .gitignore; grep -q '^\.planning/WINDOWS\.md$' .gitignore; grep -q '^\.planning/quick/$' .gitignore; grep -q '^\.planning/phases/\*\*/\*-DISCUSSION-LOG\.md$' .gitignore</verify>
    <acceptance_criteria>
      - grep -q '^\.planning/async-jobs\.json$' .gitignore
      - grep -q '^\.planning/WINDOWS\.md$' .gitignore
      - grep -q '^\.planning/quick/$' .gitignore
      - grep -q '^\.planning/phases/\*\*/\*-DISCUSSION-LOG\.md$' .gitignore
      - grep -q '^node_modules/$' .gitignore (existing line preserved)
    </acceptance_criteria>
    <done>.gitignore contains the four volatile-path entries (with the depth-agnostic DISCUSSION-LOG glob) plus the preserved node_modules/ line.</done>
  </task>
  <task type="auto">
    <name>Task 2: Untrack the already-tracked volatile .planning/ files (D-06, D-07)</name>
    <files>.gitignore</files>
    <read_first>.gitignore</read_first>
    <action>Run "git rm --cached" (NOT "git rm") on every already-tracked volatile .planning/ path so the files are removed from the git index but remain on disk. The volatile paths to untrack are: .planning/WINDOWS.md, .planning/async-jobs.json, .planning/quick/ (all TASK.md records under it), every .planning/phases/*/*-DISCUSSION-LOG.md (including the current phase's GSD-26-repo-hygiene-DISCUSSION-LOG.md), AND the depth-3 file .planning/phases/GSD-03-loop-e2e/demo-artifacts/DEMO-01-demo-DISCUSSION-LOG.md. Use a single non-fatal, directory-safe command so it does not abort if a path is already untracked or is a directory: git rm --cached -r --ignore-unmatch .planning/WINDOWS.md .planning/async-jobs.json .planning/quick/ .planning/phases/*/*-DISCUSSION-LOG.md .planning/phases/GSD-03-loop-e2e/demo-artifacts/DEMO-01-demo-DISCUSSION-LOG.md. The -r flag makes git recurse into the .planning/quick/ directory and the --ignore-unmatch flag makes git skip any path that is not currently tracked instead of failing (verified: .planning/WINDOWS.md and .planning/async-jobs.json are not currently tracked, so without --ignore-unmatch the command would abort and leave the volatile files tracked). After running it, verify the files still exist on disk (ls) and verify the durable .planning/ artefacts remain tracked (git ls-files .planning/STATE.md, .planning/ROADMAP.md, .planning/config.json, a -CONTEXT.md, a -PLAN.md, and .planning/codebase/ must still be listed). Do NOT git rm --cached any durable file. Do NOT delete any file from disk.</action>
    <verify>git ls-files .planning/ | grep -E 'WINDOWS|async-jobs|quick/|DISCUSSION-LOG' should be empty; git ls-files .planning/ | grep -E 'STATE|ROADMAP|config.json|CONTEXT|PLAN|codebase' should be non-empty; ls .planning/WINDOWS.md and ls .planning/async-jobs.json should succeed; test -f .planning/phases/GSD-03-loop-e2e/demo-artifacts/DEMO-01-demo-DISCUSSION-LOG.md should succeed</verify>
    <acceptance_criteria>
      - git ls-files .planning/ | grep -E 'WINDOWS|async-jobs|quick/|DISCUSSION-LOG' returns nothing (exit 1)
      - git ls-files .planning/ | grep -E 'STATE|ROADMAP|config.json|CONTEXT|PLAN|codebase' returns matches
      - ls .planning/WINDOWS.md succeeds (file still on disk)
      - ls .planning/async-jobs.json succeeds (file still on disk)
      - test -f .planning/phases/GSD-03-loop-e2e/demo-artifacts/DEMO-01-demo-DISCUSSION-LOG.md succeeds (depth-3 file still on disk)
    </acceptance_criteria>
    <done>All volatile .planning/ files (including the depth-3 demo-artifacts DISCUSSION-LOG) are untracked (git rm --cached) but remain on disk; all durable .planning/ artefacts remain tracked.</done>
  </task>
</tasks>

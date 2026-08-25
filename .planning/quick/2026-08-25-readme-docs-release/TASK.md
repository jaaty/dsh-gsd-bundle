# Quick task 2026-08-25-readme-docs-release

**Task:** Update the project's README and documentation to (1) fix drift from all the changes made across the 9 shipped phases, and (2) prepare the project for public release and listing in the dsh plugin ecosystem.

Context: This is the dsh-gsd-bundle project at /var/home/jatyeo/dev/dsh-gsd-bundle. It is a plugin bundle for the DeepSeek Harness (dsh) that implements the Git Ship Done (GSD) engineering loop. The bundle has shipped 9 phases (PRs #1, #2, #4, #5, #7, #8, #10, #11) covering: live-mount of 12 plugin rows, gsdState service + gsd_* phase tools, loop E2E, checkpoint-resume, window-ledger (WINDOWS.md + async-jobs manifest), loop-robustness, conversational UAT, capability-gates, and a real background-job runtime. Phase 10 (codebase-query) is in progress but NOT yet shipped — do not document it as shipped.

Orientation: Read .planning/STATE.md and .planning/ROADMAP.md first to understand the current state. Read the existing README.md and any existing docs to see what has drifted. Inspect the actual codebase (package.json, plugin manifest, src/ layout, the gsd_* tool implementations, .planning/ structure) to ground the documentation in reality — do not invent features.

What to do:
1. Read the current README.md and identify what is outdated, missing, or inaccurate relative to the actual codebase and the 9 shipped phases.
2. Rewrite/update README.md so it accurately reflects: what the bundle is, how to install/mount it into a dsh profile, the full set of gsd_* tools it provides, the phase loop (Discuss → Plan → Execute → Verify → Ship), the .planning/ artefact model, and the features added across the shipped phases (checkpoint-resume, window-ledger, UAT loop, capability-gates, background-job runtime).
3. Prepare the docs for public release and dsh plugin-ecosystem listing: add a clear project description, prerequisites, install instructions, a usage/quickstart section, a feature list, and a short "how it works" section. Make the tone and structure suitable for a public audience (not internal notes). If there is a plugin manifest or metadata file that the dsh ecosystem reads (e.g. a plugin.json, manifest, or package.json description field), update it so the description is accurate and release-ready.
4. Keep changes accurate and grounded in the real code. Do not overstate capabilities. Do not document phase 10 as shipped.

Commit atomically with a clear message. Record a one-line entry under .planning/quick/ as the gsd_quick flow requires. Report back a summary of exactly which files you changed and what you updated in each.
**Run:** 2026-08-25T05:42:38.314Z

## Result

Done. The documentation is updated and release-ready.

## Summary

**Files changed:**

- **`README.md`** — fully rewritten for a public audience and de-drifted against the 9 shipped phases:
  - Added a **Features** section covering checkpoint-resume, the window ledger (`WINDOWS.md` + `async-jobs.json`), the conversational UAT loop, capability gates, and the real background-job runtime.
  - Added **Prerequisites**, **Install**, and **Quickstart** sections (replaced the hardcoded `/home/jatyeo/...` install path with a placeholder).
  - Added a complete **`gsd_*` tools table** (all 12 tools) and the **slash-command** reference.
  - Added a **"How it works"** section (agent-loop replacement, the 12-plugin table, and the `.planning/` artefact tree — now including `WINDOWS.md`, `async-jobs.json`, `CHECKPOINT-<PP>.md`, and `UAT.md`).
  - **Fixed drift:** removed the stale "not implemented" claims for capability gates, the async-jobs manifest / WINDOWS.md ledger, and the conversational UAT loop (all shipped in phases 5/7/8/9); corrected the outdated "full live mount is next step" note (shipped in phase 1); updated the Status section.
  - **Did not overstate:** kept `gsd_map_codebase --query` intel mode documented as not-yet-implemented (phase 10 is in progress, not shipped).

- **`package.json`** — expanded the `description` field to be accurate and release-ready (phase loop plus checkpoint-resume, window ledger, conversational UAT, capability gates, background-job runtime).

- **`.planning/quick/2026-08-25-docs-release-readiness/TASK.md`** — the gsd_quick record.

**Commits:** `04f6de9` (main doc update) and `b565a6d` (recorded the actual hash in the quick record).

Note: the pre-existing in-progress phase-10 changes (`.planning/REQUIREMENTS.md`, `ROADMAP.md`, `STATE.md`, and the untracked `GSD-10-codebase-query/` dir) were left untouched and uncommitted — they belong to the active phase, not this task.
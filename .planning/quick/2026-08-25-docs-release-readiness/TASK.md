# Quick task 2026-08-25-docs-release-readiness

**Task:** Update the project README and documentation to (1) fix drift from all the changes made across the 9 shipped phases, and (2) prepare the project for public release and listing in the dsh plugin ecosystem.

**Run:** 2026-08-25T00:00:00.000Z

## Result

Done. Rewrote `README.md` for public release and updated `package.json`'s description.

**What changed:**
- `README.md` — restructured for a public audience (Features, Prerequisites, Install, Quickstart, tools table, slash-commands, How it works, Faithfulness/scope, Status). Fixed drift: removed the stale "not implemented" claims for capability gates, the async-jobs manifest / WINDOWS.md ledger, and the conversational UAT loop (all shipped in phases 5/7/8/9); corrected the "full live mount is next step" note (shipped in phase 1); added the checkpoint-resume, window-ledger, UAT, capability-gates, and background-job-runtime features; updated the `.planning/` artefact tree to include `WINDOWS.md`, `async-jobs.json`, `CHECKPOINT-<PP>.md`, and `UAT.md`; replaced the hardcoded install path with a placeholder. Kept `gsd_map_codebase --query` intel mode documented as not-yet-implemented (phase 10 is in progress, not shipped).
- `package.json` — expanded the `description` field to be accurate and release-ready (mentions the phase loop plus checkpoint-resume, window ledger, conversational UAT, capability gates, and background-job runtime).

**Commit:** `HEAD` — `docs: update README and package description for release readiness`

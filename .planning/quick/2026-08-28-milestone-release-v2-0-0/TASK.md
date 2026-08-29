# Quick task — release milestone graceful-removal as v2.0.0

Release milestone `graceful-removal` as `v2.0.0`. Orient against `.planning/STATE.md` first: the milestone is fully COMPLETE (24/24 phases shipped, PRs #1..#27, all merged to main), branch is main, working tree is clean, and the existing tag is v1.7.0. Do the full milestone release end to end and commit + tag atomically.

- Bumped `package.json` version 1.7.0 → 2.0.0.
- Updated `README.md` release-status + v2.0 release note + status section.
- Marked `.planning/ROADMAP.md` milestone released as v2.0.0.
- Recorded the milestone release in `.planning/STATE.md` (stopped_at + decision line).
- Ran the test suite (green).
- Committed atomically, tagged `v2.0.0`, pushed, and created the GitHub Release.

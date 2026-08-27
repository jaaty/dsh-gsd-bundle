# Phase 15: ship-robustness — Discussion Log

Interviewed the user on the phase-15 grey areas. All five decisions were confirmed as the recommended options: (1) async scope extends into gates.js fetchGitData, (2) execFile promisified via util.promisify, (3) real cause = stderr in message + Error.cause while keeping the 'gsd_ship preflight failed:' prefix, (4) keep the gitOk-swallows / git-gh-throws split with stderr capture, (5) a shared fail(msg, cause?) helper used at every preflight site. Behavior-preservation constraint (D-06) recorded from the existing test suite.

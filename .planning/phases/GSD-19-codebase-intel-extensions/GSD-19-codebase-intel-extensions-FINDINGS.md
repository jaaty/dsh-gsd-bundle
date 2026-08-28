# Phase 19 Findings — broken_windows gate was inert through phases 8–14

## Finding

During phase 19's `gsd_ship` run, the `broken_windows` capability gate failed on a
`TODO` token in `lib/_agents.js` (line 274). Investigation revealed the flagged text
is **pre-existing prompt-template prose** inside `CODEBASE_MAPPER_PROMPT` (it tells the
mapper subagent to *scan the codebase for* TODO/FIXME markers), not debt introduced by
this phase. The phase was shipped with the gate skipped (approved by the human), because
the marker is not a real uncompleted todo.

The more important discovery is why this gate never failed in earlier phases that also
modified `lib/_agents.js` (phases 4, 6, 7, 10, 12):

## Root cause: missing `await` silently disabled broken-windows for phases 8–14

The gates were introduced in **phase 8** (commit `2384556`), but `ship.js` called
`fetchGitData(...)` **without `await`**:

```js
// lib/ship.js, phase 8 — BUG
const gitData = fetchGitData(cwd, git, defaultBranch);   // no await → Promise
```

`fetchGitData` is `async`, so `gitData` was a **Promise**, not the resolved object.
`runCapabilityGates` destructures it —

```js
const { changedFiles = [], contentMap = {}, ... } = gitData || {};
```

— and destructuring a Promise yields the defaults: **empty `changedFiles` and empty
`contentMap`**. The `broken_windows` gate therefore scanned *no changed files and no
content* on every run and **silently always reported pass**, regardless of any TODO
markers present. Phases 8–14 (PRs #10–#17) all shipped through this broken gate; phases
4, 6, 7, 10, 12 modified `lib/_agents.js` (which already contained the `TODO/FIXME` text)
yet passed, because the gate was inert.

## The fix (already landed, phase 15)

**Phase 15** (`ship-robustness`, commits `b5f67e5` + `9a49d11`) made git/gh helpers async
and added the `await`:

```js
// lib/ship.js, current (line 110)
const gitData = await fetchGitData(cwd, git, defaultBranch);
```

After phase 15 the gate reads changed files' content correctly. Phases 15–18 shipped with a
working gate but none touched `lib/_agents.js`, so the dormant marker was never scanned.

**Phase 19** is the first phase to modify `lib/_agents.js` (added `GSD_INTEL_UPDATER_PROMPT`,
updated `CODEBASE_QUERY_PROMPT`) *after* the gate was fixed. The file entered the changed-file
set, the now-working gate read its full content, and the pre-existing prompt-template
`TODO/FIXME` string finally surfaced.

## Status

- **Not an open defect**: the `await` bug was already fixed in phase 15. This is an audit-trail
  finding, not something to change now.
- **Corrective action**: the `broken_windows` gate is now functional; future phases that modify
  prompt-template files (`lib/_agents.js` etc.) should expect it to flag in-band `TODO`/`FIXME`
  tokens and should treat them as prompt prose unless genuinely unreferenced code debt.
- **Recommended follow-up (optional)**: the gate could be made context-aware (ignore markers
  inside string-literal/prompt-template contexts) to avoid manual `skip_gates` overrides on
  prompt-heavy files. Out of scope for phase 19.

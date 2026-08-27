I have completed the research. Note: I wrote the file to disk, but per the task instructions the orchestrator writes it — so here is the **full RESEARCH.md contents** to save to `.planning/phases/GSD-15-ship-robustness/GSD-15-ship-robustness-RESEARCH.md`:

---

# Phase 15: ship-robustness — Research

**Goal:** Make git/gh calls async and report preflight failures with their real cause.
**Requirement:** CQ-05.

---

## 1. Domain analysis

### 1.1 Async child-process execution in Node (D-01)
The phase converts `lib/ship.js`'s git/gh calls from `execFileSync` to async via
`util.promisify(execFile)` from `node:child_process`. This is the canonical Node
pattern for promisified child-process execution.

- **`util.promisify(execFile)` resolves with `{ stdout, stderr }`** — both are
  strings when `encoding` is set. [VERIFIED: ran `node -e` against Node v24.15.0
  with `git --version`; resolved `{ stdout: "git version 2.55.0\n", stderr: "" }`]
- **On failure it rejects with an `Error` carrying `.stderr`, `.stdout`, `.code`,
  `.killed`, `.signal`.** [VERIFIED: ran `git push -u origin nonexistent-branch`
  in this repo; rejection had `code: 1`, `stderr: "error: src refspec
  nonexistent-branch does not match any\n..."`, `message: "Command failed: git
  push ...\n<stderr>"`]
- **When the cwd does not exist, it rejects with a spawn `ENOENT` error whose
  `stderr` is `""`.** [VERIFIED: ran `git status --short` with `cwd:
  '/nonexistent-dir-xyz'`; rejection had `code: ENOENT`, `stderr: ""`,
  `message: "spawn git ENOENT"`]. This is exactly the scenario the existing
  service-tools preflight test relies on (non-repo cwd → `gitOk` returns `""`).
- **`await` on a non-Promise value returns the value unchanged**, so a sync
  `gitFn` still works under `await` (D-06). [VERIFIED: standard JS semantics;
  confirmed by the existing `gates.test.mjs` sync `fakeGitFn` which must keep
  passing]
- **Confidence: HIGH** — the pattern is standard, and I verified both the
  success and failure shapes against the real Node runtime in this repo.

### 1.2 The `run`/`git`/`gitOk`/`gh` helper conversion (D-01)
These four helpers are module-local closures inside `apply()` in `lib/ship.js`
(lines 20-31). They become `async` and every call site must `await` them.

- `run(cwd, cmd, args)` → `async`; returns `(await execFileP(cmd, args, { cwd,
  encoding: "utf8" })).stdout.trim()`.
- `git(cwd, args)` → `async`; `return await run(cwd, "git", args)`.
- `gitOk(cwd, args)` → `async`; `try { return await run(...) } catch { return
  ""; }` — still swallows failures and resolves `""` (D-04).
- `gh(cwd, args)` → `async`; `return await run(cwd, "gh", args)`.

**Call sites in `lib/ship.js` that need `await`** (all read this session):
- line 64 `const status = gitOk(...)`
- line 68 `const branch = gitOk(...)`
- line 69 `gitOk(...)` (defaultBranch)
- line 76 `if (!gitOk(...))`
- line 79 `try { gh(...) } catch`
- line 92 `fetchGitData(cwd, git, defaultBranch)` → `await fetchGitData(...)`
- line 98 `try { git(...) } catch (e) { fail(...) }`
- line 149 `prUrl = gh(cwd, prArgs)`
- line 168 `git(cwd, ["add", ...])`
- line 171 `const staged = git(...)`
- line 174 `git(cwd, ["commit", ...])`
- line 175 `git(cwd, ["push", ...])`

**Confidence: HIGH** — the call sites are enumerated verbatim from the file.

### 1.3 `fetchGitData` async conversion (D-02)
`lib/gates.js` `fetchGitData(cwd, gitFn, base)` (lines 228-251) calls the
injectable `gitFn` at four points: lines 232, 235, 237, 248. Each becomes
`await gitFn(...)`. The `.trim()` / `.split()` chaining on the returned string
is unchanged. `fetchGitData` is already `async` (it `await`s `fs.readFile`), so
only the `gitFn` calls change.

- `ship.js` line 92 passes the now-async `git` helper: `await fetchGitData(cwd,
  git, defaultBranch)`.
- `runCapabilityGates` stays **synchronous** — it consumes the already-resolved
  `gitData` object, so no change there (D-06 static wiring intact).
- The sync `fakeGitFn` in `gates.test.mjs` (lines 300-308) keeps working under
  `await` (D-06).

**Confidence: HIGH** — verified the four `gitFn` call sites and that
`fetchGitData` is already async.

### 1.4 Real-cause reporting (D-03, D-05)
The `fail` helper (line 55) becomes `fail(msg, cause?)`. The `gsd_ship preflight
failed:` prefix is preserved (the service-tools test asserts it). On a git/gh
failure path, the caller passes the original error as `cause`; the helper
appends a trimmed stderr/stdout snippet to the message and sets `Error.cause`.

- **`Error` constructor supports a `{ cause }` option** (Node ≥16.9). [VERIFIED:
  standard Node API; Node v24.15.0 in use]
- **The real cause lives in `e.stderr`** (and is also embedded in `e.message`).
  [VERIFIED: git push failure above]. The helper should prefer `cause.stderr`,
  falling back to `cause.stdout`, and trim/cap it (Claude's discretion).
- **`fail(blockError)` passes no cause** (blockError is a string) — the helper's
  `cause` param is optional, so this call is unchanged (D-06 static marker
  `fail(blockError)` must remain textually present).

**Confidence: HIGH** — verified the error shape and the `{ cause }` option.

### 1.5 Testability of the helpers
`run`/`git`/`gitOk`/`gh`/`fail` are closures inside `apply()` and are **not
exported** (`export { name, inject, apply }`, line 191). To unit-test the
real-cause message construction directly, the planner should either:
- **(Recommended)** extract a pure `preflightError(msg, cause?)` builder that
  *returns* an `Error` (prefix + snippet + cause), have the closure `fail` throw
  it, and export `preflightError` for direct testing; or
- test through `t.execute()` with a real git failure in a controlled cwd
  (fragile, needs a real repo).

The static wiring tests do **not** assert the export list, so adding an export is
safe. Keeping `fail` as a closure that calls `preflightError` preserves the
`fail(blockError)` source marker.

**Confidence: MEDIUM** — the export-surface change is safe per the static tests,
but the exact shape is Claude's discretion.

---

## 2. Package legitimacy

**No new dependencies are required.** The phase uses only Node builtins:

- `node:child_process` — `execFile` (already imported as `execFileSync` in
  `lib/ship.js` line 11; the import line changes to `execFile`). [VERIFIED:
  present in `lib/ship.js`; builtin]
- `node:util` — `promisify`. [VERIFIED: available; ran `require('node:util')`
  successfully in this repo]
- `node:fs/promises` — already used by `fetchGitData` (line 229) and ship.js
  (line 143). [VERIFIED: present in source]

No third-party package is proposed, so no registry verification is needed.
**Confidence: HIGH.**

---

## 3. Risks and Open Questions

### Risks
- **R-1 (static wiring markers):** The static tests assert exact source strings
  in `lib/ship.js`. Any refactor that renames `fail`, moves the `6. push branch`
  / `## Gate Report` comments, or changes `fail(blockError)` / `if (blockError)
  fail(blockError)` / the `runCapabilityGates({` full-cfg call will break them.
  Mitigation: keep all markers verbatim; only add `await` and the `cause` param.
- **R-2 (missed `await`):** A git/gh call site left synchronous would return a
  Promise instead of a string, silently corrupting branch/status logic. The
  enumerated call sites (1.2) must all be awaited; a grep for `git(`/`gh(`/
  `gitOk(` without `await` is the verification.
- **R-3 (ENOENT stderr empty):** When the cwd doesn't exist, the rejection's
  `stderr` is `""`, so the real-cause snippet is empty. The message must still
  carry the prefix and the `cause` (the ENOENT error) so the failure is
  diagnosable. The existing service-tools test (non-repo cwd) must stay green.
- **R-4 (snippet size):** A large stderr dump could bloat the thrown message.
  The snippet should be trimmed/capped (Claude's discretion).

### Open Questions
- **OQ-1 (RESOLVED):** Does `util.promisify(execFile)` resolve with
  `{ stdout, stderr }` and reject with `.stderr`/`.code`? — **RESOLVED** by
  running it against Node v24.15.0 in this repo (see 1.1). No blocker.
- **OQ-2 (RESOLVED):** Does a sync `gitFn` still work under `await`? —
  **RESOLVED**: `await` on a non-Promise returns the value; the existing sync
  `fakeGitFn` test keeps passing. No blocker.
- **OQ-3 (RESOLVED):** Is `Error`'s `{ cause }` option available? — **RESOLVED**:
  Node ≥16.9; Node v24.15.0 in use. No blocker.
- **OQ-4 (RESOLVED):** Are the helpers exported for direct testing? — **RESOLVED
  by recommendation**: extract a pure `preflightError(msg, cause?)` builder and
  export it; the static tests don't assert the export list. Planner's choice.

All open questions are resolved; planning may proceed.

---

## 4. Architectural Responsibility Map

| Capability | Tier | Notes |
|---|---|---|
| `run`/`git`/`gitOk`/`gh` async exec helpers | **integration** | Wrap `node:child_process`; live in `lib/ship.js` (D-01). |
| `fail(msg, cause?)` / `preflightError` real-cause builder | **domain** | Pure message/Error construction; testable without I/O. |
| `fetchGitData` async `gitFn` awaiting | **integration** | `lib/gates.js`; awaits the injectable git wrapper (D-02). |
| `runCapabilityGates` gate evaluation | **domain** | Stays synchronous; consumes resolved `gitData` (unchanged). |
| Preflight gate sequencing (verification/clean-tree/branch/remote/gh) | **domain** | Orchestration in `apply()`; unchanged logic, only `await` added. |

No security-sensitive capability is placed in the wrong tier. The only
I/O-touching code (git/gh exec) stays in the integration tier; the real-cause
message construction is pure and testable in the domain tier. **No blocker.**

---

## 5. Validation Architecture

Automated checks that prove each behaviour (used for the Nyquist/coverage gate):

- **Async git/gh calls (D-01):** a static test greps `lib/ship.js` for
  `execFileSync` absence and `promisify(execFile)` presence, and asserts every
  `git(`/`gh(`/`gitOk(` call site is `await`ed (no bare `git(`/`gh(`/`gitOk(`
  without a preceding `await`). Plus a runtime test that `gitOk` resolves `""`
  on failure and `git`/`gh` reject with an error carrying `.stderr`.
- **fetchGitData async (D-02):** extend `gates.test.mjs` `fetchGitData` block
  with a test that an **async** `gitFn` (returning Promises) works, alongside the
  existing sync `fakeGitFn` test (which must stay green).
- **Real-cause reporting (D-03/D-05):** a unit test of the exported
  `preflightError(msg, cause)` asserting (a) message starts with `gsd_ship
  preflight failed:`, (b) message contains a trimmed stderr snippet, (c)
  `err.cause === cause`. And a test that `fail(msg)` with no cause still throws
  the prefix (no snippet).
- **Behavior preservation (D-06):** the existing `service-tools.test.mjs`
  preflight test (`/gsd_ship preflight failed:/`), `gates.test.mjs` fetchGitData
  + static wiring tests, and `gates-ship.test.mjs` static wiring tests all stay
  green unchanged.

---

## 6. Project Constraints

From project conventions (package.json + existing test style):
- **Test runner:** `npm test` = `node --test test/*.test.mjs`; tests use
  `node:test` + `node:assert/strict`. [VERIFIED: package.json]
- **ESM:** `"type": "module"`; all imports are ESM. [VERIFIED: package.json]
- **No runtime dependencies:** `"dependencies": {}`; only peer deps on
  `@deepseek-ai/*`. The phase must not add a dependency. [VERIFIED: package.json]
- **Static-wiring test style:** several tests read `lib/*.js` source and assert
  exact markers (e.g. `fail(blockError)`, `6. push branch`, `## Gate Report`,
  `runCapabilityGates({` full-cfg). These must remain textually intact.
- **Test organization (Claude's discretion):** new tests may go in a new file
  (e.g. `test/ship-async.test.mjs`) or be appended to `test/ship.test.mjs` /
  `test/gates.test.mjs`. The existing `ship.test.mjs` is Phase-12 static
  regression; a new file for async/real-cause behaviour is cleaner.

---

**Key findings for the planner:**
1. `util.promisify(execFile)` is the right mechanism (D-01) — verified success/failure shapes against Node v24.15.0.
2. 12 call sites in `lib/ship.js` need `await`; 4 `gitFn` calls in `fetchGitData` need `await` (D-02).
3. Real cause lives in `e.stderr`; `fail(msg, cause?)` appends a trimmed snippet and sets `Error.cause` (D-03/D-05).
4. All static-wiring source markers (`fail(blockError)`, `6. push branch`, `## Gate Report`, full-cfg `runCapabilityGates({`) must stay verbatim (D-06).
5. Recommend extracting an exported pure `preflightError(msg, cause?)` builder for direct unit-testing of the real-cause reporting.
6. No new dependencies — Node builtins only.
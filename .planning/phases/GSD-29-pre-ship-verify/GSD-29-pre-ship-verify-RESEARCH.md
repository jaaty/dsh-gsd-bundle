I have everything I need. Here is the full RESEARCH.md.

---

# Phase 29: pre-ship-verify — Research

**Researcher:** gsd-phase-researcher
**Date:** 2026-08-29
**Phase goal:** Add a deterministic pre-ship local verification gate to `gsd_ship` that runs a clean `npm ci` + `npm test` in a temp copy of the repo before pushing, fails the ship on failure, and is skippable via a flag. (SHIP-01)

---

## 1. Domain analysis

### 1.1 What the gate must do (from CONTEXT.md, locked)
- Produce a temp copy of the working tree excluding `node_modules` and `.git` (D-01).
- Run `npm ci` then `npm test` in that copy via async `execFile` (D-05).
- Run AFTER the capability gates (step 5.5) and BEFORE the push (step 6) (D-02).
- Fail the ship via `preflightError(msg, cause)` on any failure, with a capped stderr snippet and `Error.cause` set (D-04).
- Be skippable via a dedicated boolean tool parameter `skip_verify`, independent of the capability-gate `skip_gates` array (D-03).
- Always clean up the temp dir in a `finally` block (D-06).
- Live in a new `lib/preflight-verify.js` module + `test/preflight-verify.test.mjs` (D-05).

### 1.2 The exact insertion point in `lib/ship.js` [VERIFIED: read lib/ship.js this session]
The execute body is a numbered sequence. The new gate slots between the capability-gate block and the push:
- Step 5.5 capability gates: `lib/ship.js:104-118` — ends with `if (blockError) fail(blockError);` at line 118.
- Step 6 push: `lib/ship.js:120-122` — `try { await git(cwd, ["push", "-u", "origin", branch]); ... }`.
- The gate must be inserted textually between line 118 and line 120 so a failing gate aborts before any push/PR I/O. This mirrors the existing static test in `test/gates-ship.test.mjs:123-145` that asserts the gate section sits before the push marker `"6. push branch"`.

### 1.3 The `preflightError` convention to reuse [VERIFIED: read lib/ship.js this session]
`preflightError(msg, cause)` is defined at `lib/ship.js:42-50` and exported at line 213. It:
- Always prefixes the message with the exact string `gsd_ship preflight failed: ` (asserted by `test/service-tools.test.mjs:237` and `test/ship-async.test.mjs:23`).
- When a `cause` is given, appends `String(cause.stderr || cause.stdout || "").trim().slice(0, 500)` and sets `Error.cause`.
- The execute body already defines `const fail = (m, cause) => { throw preflightError(m, cause); };` at `lib/ship.js:78`. The new gate reuses `fail(...)` — no new error builder needed.

### 1.4 The pure-module pattern to mirror [VERIFIED: read lib/gates.js this session]
`lib/gates.js` is the established pattern: pure, I/O-free evaluators plus an orchestration seam (`runCapabilityGates`) plus a `GATE_NAMES` constant, with an injectable git wrapper (`fetchGitData(cwd, gitFn, base)` at `lib/gates.js:241`) so tests pass a fake git function and never touch a real repo. `lib/preflight-verify.js` should follow the same shape: a pure `runPreflightVerify` that takes an **injectable `execFile`** (defaulting to `promisify(execFile)`), so `test/preflight-verify.test.mjs` can fake `npm ci`/`npm test` outcomes without running real npm.

### 1.5 The npm ci + npm test contract [VERIFIED: read package.json, package-lock.json, ci.yml this session]
- `package.json:8` — `"test": "node --test test/*.test.mjs"`.
- `package-lock.json` is present at repo root (`lockfileVersion: 3`) — required by `npm ci`.
- `.github/workflows/ci.yml:24,27` — the CI already runs `npm ci` then `npm test` on Node 24; the gate mirrors this locally.
- Local Node is `v24.15.0` [VERIFIED: `node --version` this session], matching CI's `node-version: 24`.
- `npm ci` removes `node_modules` and installs exactly from the lockfile [CITED: https://docs.npmjs.com/cli/v12/commands/npm-ci/]. Excluding `node_modules` from the copy is therefore safe and even redundant for correctness — `npm ci` wipes it anyway — but keeps the copy light (D-01).

### 1.6 Copy mechanism — recommended implementation [ASSUMED → CITED]
D-01 says "`cp -R` of the working tree, excluding `node_modules` and `.git`", but Claude's Discretion explicitly allows "node fs copy with a filter vs cp -R with excludes". **Recommendation: use `fs.cp(src, dest, { recursive: true, filter })`** from `node:fs/promises`:
- Cross-platform (no shell), no `execFile` needed for the copy, and the `filter` option cleanly excludes `node_modules` and `.git` subtrees.
- `fs.cp`'s `filter` receives `(sourcePath, destinationPath)` and returning `false` skips that entry and its subtree [CITED: https://nodejs.org/api/fs.html — `fs.cp` `filter` option]. A filter like `(src) => !/node_modules$/.test(src) && !/\.git$/.test(src)` excludes both.
- **Pitfall:** `fs.cp` with a `filter` and `recursive: true` had a historical recursion bug (Node issue #49092) [CITED: https://github.com/nodejs/node/issues/49092]. This is fixed in modern Node; local is v24.15.0 and CI is Node 24, so it is not a concern here. Confidence: high.

### 1.7 Clean-tree guarantee and gitignored files [VERIFIED: read ship.js, .gitignore this session]
The clean-tree gate (step 2, `lib/ship.js:87-88`) has already passed before the copy, so the working tree equals the committed state. Note: `.gitignore` (read this session) lists `.planning/async-jobs.json`, `.planning/WINDOWS.md`, `.planning/quick/`, and `.planning/phases/**/*-DISCUSSION-LOG.md` as gitignored-but-on-disk. A `cp -R`/`fs.cp` of the working tree copies these too. This is **harmless** for the gate's purpose (the tests are pure/static and do not read `.planning/`), but the planner should not assert "the copy equals the committed state" literally — it equals the working tree, which is clean. No action needed; just don't over-claim.

### 1.8 Tests are pure/static (no git shell-outs) [VERIFIED: read test files this session]
D-01 asserts the tests are pure/static. Confirmed by inspection: `test/gates-ship.test.mjs`, `test/ship-async.test.mjs`, `test/gates.test.mjs` use in-memory data and static source reads; `test/tools.test.mjs:646-653` and `test/service-tools.test.mjs:226-237` drive `gsd_ship` only far enough to hit a preflight failure. So `npm test` in the temp copy will not shell out to git. Confidence: high.

### 1.9 Standard pitfalls
- **npm not found / offline / network failure during `npm ci`** — `execFile` rejects; must fail the ship with the real cause, never silently skip (D-06). The injectable-execFile design makes this testable.
- **`npm ci` vs `npm install`** — must use `npm ci` (deterministic, lockfile-exact) per the requirement, not `npm install`.
- **Temp-dir leak** — the `mkdtemp` dir must be removed in a `finally` even on failure (D-06).
- **Ordering** — the gate must run after the cheap capability gates (fail fast first) and before any push/PR I/O (D-02).
- **Skipping must be flag-only** — no config.json gate block (D-06); `skip_verify` must not interact with the `skip_gates` array.

---

## 2. Package legitimacy

**No new external dependencies are proposed.** The gate uses only Node builtins:
- `node:fs/promises` — `mkdtemp`, `cp`, `rm` [VERIFIED: Node 24 builtin; no package].
- `node:os` — `tmpdir()` [VERIFIED: Node builtin].
- `node:path` — `join` [VERIFIED: Node builtin].
- `node:child_process` + `node:util` — `execFile` / `promisify`, already imported in `lib/ship.js:11-12` [VERIFIED: read this session].

There is no registry package to vet. The only "dependency" is the `npm` CLI itself, which is a runtime prerequisite of the repo (CI already runs it) and is not a package.json dependency. Confidence: high.

---

## 3. Risks and Open Questions

### Open Questions (all RESOLVED)

**OQ-1 (RESOLVED): How does `test/preflight-verify.test.mjs` test `runPreflightVerify` without running real npm?**
`runPreflightVerify` must accept an **injectable `execFile`** (default `promisify(execFile)`), mirroring `fetchGitData(cwd, gitFn, base)` in `lib/gates.js:241`. Tests pass a fake `execFile` returning controlled `{ stdout, stderr }` or rejecting, so every branch (npm ci ok, npm ci fail, npm test fail, npm-not-found ENOENT) is covered deterministically with no real npm, no network, no real repo. This is the established injectable-wrapper pattern in this codebase. Confidence: high.

**OQ-2 (RESOLVED): How are the copy/cleanup orchestration helpers tested, given they touch the real filesystem?**
The copy helper (`copyTree`) and cleanup can be tested against a real `fs.mkdtemp` dir under `os.tmpdir()` with a small fixture tree (a couple of files + a `node_modules/` + `.git/` stub), asserting the copy excludes both and that cleanup removes the dir. This is deterministic and self-cleaning (the test's own `finally`/`t.after` removes the temp dir). It does not run npm. Confidence: high.

**OQ-3 (RESOLVED): Does adding the `skip_verify` tool parameter break any existing schema test?**
No. `test/gates.test.mjs:455` asserts `skip_gates` is present in the schema (still true); it does not assert the schema is exhaustive. `test/tools.test.mjs:651` and `test/service-tools.test.mjs:237` drive `gsd_ship` with `{ phase: 1 }` and expect a preflight failure — unaffected by a new optional boolean. `test/mount.test.mjs` checks tools register with a valid schema, which a boolean param satisfies. Confidence: high.

**OQ-4 (RESOLVED): Where exactly does the gate slot in, and how is it reported?**
Between `lib/ship.js:118` (`if (blockError) fail(blockError)`) and line 120 (push). On success/skip, push a report line to the existing `log` array (e.g. `pre-ship-verify: pass` / `pre-ship-verify: skipped`), mirroring the gate-report lines. On failure, `fail("pre-ship-verify failed: <step>", cause)`. Confidence: high.

**OQ-5 (RESOLVED): Does the temp copy need `.git`?**
No. The tests are pure/static (no git shell-outs, D-01), so excluding `.git` is safe and keeps the copy light. Confidence: high.

### Risks
- **R-1 (medium):** `npm ci` requires network access to the registry. In an offline environment the gate will fail the ship. This is the intended behavior (D-06: offline failure fails the ship with the real cause), but the planner should ensure the failure message clearly names the network/registry cause via the stderr snippet. Mitigation: `preflightError` already appends the capped stderr.
- **R-2 (low):** `npm ci` in the temp copy is slow (full clean install). This is acceptable because it runs only after the cheap capability gates pass (D-02) and only on the ship path, not on every tool call.
- **R-3 (low):** The copy includes gitignored `.planning/` volatile files (see §1.7). Harmless; do not over-claim "copy equals committed state".
- **R-4 (low):** `fs.cp` filter recursion bug (Node #49092) — fixed in Node 24; not a concern here (see §1.6).

---

## 4. Architectural Responsibility Map

| Capability | Tier | Rationale |
|---|---|---|
| `runPreflightVerify(tempDir, execFile?)` — pure orchestration of `npm ci` then `npm test`, returns `{ status, output }` | **Domain** | Pure, I/O-free except through the injected `execFile`; deterministic and unit-testable without real npm. Mirrors `runCapabilityGates` in `lib/gates.js`. |
| `copyTree(src, dest)` — `fs.cp` with filter excluding `node_modules`/`.git` | **Domain** | Pure-ish helper; takes explicit paths, no ambient state. Testable against a real temp dir. |
| `makeTempDir()` / `cleanupTempDir(dir)` — `fs.mkdtemp` under `os.tmpdir()` / `fs.rm` | **Data** | Filesystem I/O; thin wrappers over Node builtins. |
| `preflightError(msg, cause)` | **Domain** | Already exists in `lib/ship.js:42-50`; reused, not duplicated. |
| Wiring in `gsd_ship.execute` — call the gate between step 5.5 and step 6, honor `skip_verify`, push report lines, `fail(...)` on failure | **Integration** | The tool execute body; owns the sequence and the `log`/`fail` plumbing. |
| `skip_verify` tool parameter | **Presentation** | Tool-schema surface; a boolean flag on `gsd_ship`. |

**Security note:** The gate is not security-sensitive itself, but it is a **pre-push gate** — a failing gate must abort before any push/PR I/O. Putting the orchestration in the Domain tier and the wiring in the Integration tier (execute body) is correct. A security-sensitive capability in the wrong tier would be a blocker; none exists here. Confidence: high.

---

## 5. Validation Architecture

Automated checks that prove each behaviour (used for the Nyquist/coverage gate):

| Behaviour | Automated proof | Where |
|---|---|---|
| `npm ci` then `npm test` run in order; success → `{ status: "pass", output }` | Unit test with injected fake `execFile` returning success for both | `test/preflight-verify.test.mjs` |
| `npm ci` failure → `{ status: "fail" }` with the npm stderr in output | Unit test: fake `execFile` rejects on the `npm ci` call | `test/preflight-verify.test.mjs` |
| `npm test` failure → `{ status: "fail" }` | Unit test: fake `execFile` succeeds on `npm ci`, rejects on `npm test` | `test/preflight-verify.test.mjs` |
| npm not found (ENOENT) → `{ status: "fail" }` with real cause | Unit test: fake `execFile` rejects with `{ code: "ENOENT" }` | `test/preflight-verify.test.mjs` |
| Copy excludes `node_modules` and `.git` | Unit test against a real `mkdtemp` fixture tree | `test/preflight-verify.test.mjs` |
| Temp dir removed in `finally` even on failure | Unit test: assert dir gone after a failing run | `test/preflight-verify.test.mjs` |
| Gate runs after capability gates and before push; `skip_verify` skips it; failure calls `fail(...)` with `preflightError` | Static source assertions on `lib/ship.js` (mirror `test/gates-ship.test.mjs:123-145` and `test/gates.test.mjs:425-456`) | `test/preflight-verify.test.mjs` (or a static block) |
| `skip_verify` parameter present in the tool schema | Static assertion `src.includes("skip_verify")` | `test/preflight-verify.test.mjs` |
| Failure message carries the `gsd_ship preflight failed:` prefix + capped stderr + `Error.cause` | Reuse `preflightError`; covered by existing `test/ship-async.test.mjs:19-47` | existing |
| `npm test` still passes on a clean checkout (the new test file is picked up) | `package.json:8` glob `test/*.test.mjs` includes the new file | CI + local |

**Coverage note:** The pure `runPreflightVerify` (with injected `execFile`) is the highest-value target and is fully branch-covered by the unit tests. The copy/cleanup helpers are covered against a real temp dir. The ship.js wiring is covered by static assertions (the established pattern in this repo — the execute body cannot be driven end-to-end offline because it needs real git/gh). Confidence: high.

---

## 6. Project Constraints (from project conventions)

- **Test runner:** `node --test test/*.test.mjs` (`package.json:8`). New test file must be `test/preflight-verify.test.mjs` and use `node:test` + `node:assert/strict` (style mirrors `test/gates-ship.test.mjs` and `test/ship-async.test.mjs`).
- **Pure-module pattern:** new logic goes in `lib/preflight-verify.js` as pure helpers + an orchestration seam with injectable I/O (mirrors `lib/gates.js`). No new external dependencies.
- **`preflightError` reuse:** all preflight failures go through the exported `preflightError(msg, cause)` from `lib/ship.js`; the message must keep the exact `gsd_ship preflight failed:` prefix (asserted by `test/service-tools.test.mjs:237`).
- **Async git/gh/execFile:** ship.js uses `promisify(execFile)` and awaits every call (`test/ship-async.test.mjs:50-55` asserts no `execFileSync` and no bare `git/gh/gitOk` call sites). The new gate must use the same async `execFile` pattern.
- **No config.json gate block:** the gate is flag-only (`skip_verify`), per D-06. Do not add a `gates` config entry.
- **Out of scope:** do not modify the existing capability gates, the `skip_gates` array, the CI workflow, or any other ship behavior (push, PR body, STATE update).
- **Node version:** local `v24.15.0`, CI Node 24 — `fs.cp` with `filter` is available and reliable.

---

*End of RESEARCH.md*
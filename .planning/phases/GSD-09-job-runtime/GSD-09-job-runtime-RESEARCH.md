I have everything I need. Here is the full RESEARCH.md.

---

# Phase 9: job-runtime — Research

**Researched:** 2026-08-25
**Phase goal:** Implement a real background-job runtime: a job runner that actually executes a job asynchronously, tracks its lifecycle (running → done/failed) in the async-jobs manifest, collects and surfaces the result when it finishes, and reflects real async state through gsd_status. Delivers JOB-01, JOB-02.

---

## Domain analysis

### What already exists (the registry is real; the engine is not)
The async-jobs manifest and its surfacing are already implemented and tested. This phase adds the execution engine behind them, not the registry.

- `lib/state.js` `readJobs` (line 376), `appendJob` (line 387), `updateJob` (line 400) persist `.planning/async-jobs.json` as a JSON array. [VERIFIED: read lib/state.js lines 371-410]
  - `appendJob` assigns `JOB-<seq>` via `nextSeq`, defaults `status` to `"pending"`, sets `started` to `nowIso()` when absent. [VERIFIED: lib/state.js lines 387-398]
  - `updateJob` sets `completed = nowIso()` the first time a job transitions to `done`/`failed` (line 405-407). This is the "finished timestamp" D-04 requires — **no schema change needed**. [VERIFIED: lib/state.js lines 400-410]
  - Missing file → `{ entries: [], corrupt: false }`; corrupt/non-array → `{ entries: [], corrupt: true }`; never throws (D-06). [VERIFIED: lib/state.js lines 376-385]
- `lib/core-tools.js` `gsd_status` renders a `## Async Jobs` section (lines 137-144): `- ${j.id}: ${j.kind} — ${j.status} — ${j.result || j.started || ""}`. It reads via `s.readJobs(cwd).catch(...)` (line 122). [VERIFIED: lib/core-tools.js lines 122, 137-144]
- `lib/execute.js` already records executor runs as jobs: `appendJob` at line 180 (kind `"subagent"`, status `"running"`), reconciled to `done`/`failed` via `updateJob` at lines 216 and 240. [VERIFIED: lib/execute.js lines 178-184, 212-242]
- Existing tests cover the accessors (`test/state.test.mjs` lines 466-512) and the gsd_status rendering (`test/tools.test.mjs` lines 528-590). [VERIFIED: read both test files]

**Confidence: HIGH** — the registry contract is fully read this session.

### The gap this phase closes
The manifest is currently a *registry only* (D-03 of phase 5): nothing actually executes a job. Phase 9 adds a real engine. The deferred intent is recorded in `.planning/phases/GSD-05-window-ledger/GSD-05-window-ledger-CONTEXT.md` line 9 ("the manifest is a registry only") and line 61 ("A real background-job runtime / scheduler — the manifest is registry-only; execution is a later milestone"). [VERIFIED: read GSD-05 CONTEXT.md]

### The core design problem: "genuinely background, survive the tool call"
D-01 requires jobs to be "genuinely background, survive the tool call". A tool call that `await`s a child's exit is not background. The standard pattern is:

1. **Launch** — `spawn` a detached child process, `child.unref()`, record it `running` in the manifest, return immediately. The tool call does not block.
2. **Child** — runs independently, writes its result to a per-job result file when it finishes.
3. **Reconcile** — a later call (gsd_status) reads the result file for each `running` job and flips it to `done`/`failed` with a finished timestamp.

Because the result is persisted to a file and reconcile reads it back, the job's outcome survives context resets (D-03). [ASSUMED — standard detached-child + result-file pattern; consistent with D-01/D-03]

### How a raw shell command writes a JSON result file
A raw shell command (`sleep 5`, `echo hi`) cannot write `.planning/jobs/<id>.result.json` by itself. D-03 says "the child process writes its result". The clean realization: the runtime spawns a **small Node wrapper** (`lib/job-wrapper.mjs`) as the detached child. The wrapper:
- receives the job id, absolute result-file path, and the command argv,
- `spawn`s the actual command (argv array, **no shell** — avoids injection/quoting),
- captures stdout/stderr and the exit code,
- writes `{ id, exitCode, stdout, stderr, error }` to the result file,
- exits.

The wrapper *is* the "child process that writes its result". [ASSUMED — design decision; the planner should implement the wrapper as a standalone script invoked as `node <wrapper> <jobId> <resultFile> <cmd...>`]

### node:child_process precedent in the bundle
`node:child_process` is already used: `execFileSync` in `lib/ship.js` (line 11, wrapped in `run()` at line 23) and `lib/map-codebase.js` (line 25, used at 61/64). This phase uses the async `spawn` (not `execFileSync`) because the job must not block. [VERIFIED: lib/ship.js lines 11-24, lib/map-codebase.js lines 25, 61, 64]

### The wrapper writes with node:fs, reconcile reads with ctx.fs
The detached wrapper has no `ctx` (it is a standalone process), so it writes the result file with `node:fs/promises`. Reconcile runs in the host plane with `ctx.fs` available; it should read the result file through `ctx.fs` (resolve → stat → readText), treating a missing file as "still running". This mirrors `state.js _read` (lines 72-77). [VERIFIED: lib/state.js lines 72-77; lib/state.js _write/_ensureParent lines 79-98]

### Test harness reality: FakeFs cannot run child processes
The bundle's tests use an in-memory `FakeFs` (`test/helpers/fake-fs.mjs`) that never spawns processes. The job runtime's *real execution* must be tested against a real temp dir with `realFsAdapter` (also in `test/helpers/fake-fs.mjs`, lines 78-108) and real short commands (`node -e "process.exit(0)"`). `state.test.mjs` already imports `realFsAdapter` and uses `os.tmpdir`/`mkdtemp` (lines 5-8), so the pattern is established. [VERIFIED: test/helpers/fake-fs.mjs lines 1-108; test/state.test.mjs lines 5-8]

---

## Package legitimacy

**No new runtime dependencies are required.** Everything needed is Node core:

- `node:child_process` `spawn` — core, available in Node v24.15.0 (the runtime here). [VERIFIED: `node --version` → v24.15.0; `spawn` is a core export]
- `node:fs/promises` — core, already used throughout the bundle. [VERIFIED: lib/state.js line 86, lib/ship.js]
- `node:os` / `node:path` — core, used in tests. [VERIFIED: test/state.test.mjs lines 5-6]

The bundle is explicitly zero-runtime-dependency (`package.json` `"dependencies": {}`). [VERIFIED: package.json] **Do not add a dependency.** Any proposed package would be [ASSUMED] and unnecessary.

---

## Risks

1. **Detached child may outlive the test process.** In tests, a `detached:true` + `unref` child could still be running when the test process exits. Mitigation: tests poll for the result file (bounded timeout) before reconciling, and use short commands. [ASSUMED]
2. **Result-file read on a missing file.** `ctx.fs.readText` on a missing file returns `undefined` under FakeFs but throws under the real fs adapter. Reconcile must stat-guard (or try/catch) so a missing result file means "still running", never a throw. [VERIFIED: FakeFs.readText returns undefined for missing (fake-fs.mjs line 38); realFsAdapter.readText throws on ENOENT (fake-fs.mjs line 95)]
3. **Security: spawning arbitrary commands.** This is a security-sensitive capability (arbitrary process execution). It must live in the **integration tier** (thin child-process boundary), and the command must be passed as an **argv array with no shell** to avoid injection. Exposure is limited this phase because there is no `gsd_job` launch tool (deferred) — the runner is exercised programmatically. No sandboxing is in scope. [ASSUMED]
4. **Reconcile must not corrupt the manifest.** Reconcile flips `running` → `done`/`failed` via `updateJob`, which already sets `completed` once. It must skip non-running jobs and skip running jobs whose result file is absent. [VERIFIED: lib/state.js lines 400-410]
5. **gsd_status must not throw over a bad result file.** A corrupt result file should leave the job `running` (or be skipped), never crash gsd_status — consistent with the D-06 "orientation surface never throws" rule. [VERIFIED: lib/core-tools.js lines 121-122 guard pattern]

---

## Open Questions

- **OQ-1: How does a raw shell command write its result file?** → **RESOLVED**: the runtime spawns a detached Node wrapper (`lib/job-wrapper.mjs`) that runs the command, captures stdout/stderr/exit, and writes `.planning/jobs/<id>.result.json`. This realizes D-03's "the child process writes its result".
- **OQ-2: How does the tool call return immediately while the job continues?** → **RESOLVED**: `spawn(..., { detached: true })` + `child.unref()`. The wrapper survives the tool call and writes the result file on completion.
- **OQ-3: How does gsd_status reflect real state?** → **RESOLVED**: gsd_status calls `reconcileJobs()` before rendering the Async Jobs section; reconcile reads result files for `running` jobs and updates the manifest to `done`/`failed`.
- **OQ-4: What timestamp marks "finished"?** → **RESOLVED**: `updateJob` already sets `completed` on the first `done`/`failed` transition (state.js line 406). No schema change; `completed` is the finished timestamp.
- **OQ-5: How to test real child processes with the FakeFs harness?** → **RESOLVED**: use a real temp dir (`os.tmpdir` + `mkdtemp`) with `realFsAdapter` for the job-runtime integration tests; launch short real commands, poll for the result file, reconcile, assert `done`/`failed`. FakeFs-based tests already cover the accessors and gsd_status rendering.
- **OQ-6: Should reconcile read the result file via ctx.fs or node:fs?** → **RESOLVED**: reconcile runs in the host plane with `ctx`; use `ctx.fs` with a stat-guard (missing file = still running). The detached wrapper (no ctx) writes via `node:fs/promises`.
- **OQ-7: Is a new module needed, and must it be exported?** → **RESOLVED**: new `lib/jobs.js` (domain: `launchJob`/`reconcileJobs`) + `lib/job-wrapper.mjs` (integration). Tests import `lib/jobs.js` directly; adding `./jobs` to `package.json` exports is optional for consistency but not required for tests.
- **OQ-8: Security of spawning arbitrary commands.** → **RESOLVED**: keep the spawn boundary in the integration tier, pass command as an argv array with no shell, no sandboxing this phase (out of scope). Note as a risk; exposure limited because no `gsd_job` tool yet.

All Open Questions are **RESOLVED** — planning may proceed.

---

## Architectural Responsibility Map

| Capability | Tier | Where | Notes |
|---|---|---|---|
| Job lifecycle state machine (running → done/failed, started/finished) | **Domain** | `lib/jobs.js` `reconcileJobs` | Decides done vs failed from exit code; delegates persistence to data tier |
| Launch a job (spawn detached child, record running) | **Domain** | `lib/jobs.js` `launchJob` | Orchestrates integration tier + data tier |
| Manifest persistence (readJobs/appendJob/updateJob) | **Data** | `lib/state.js` (existing) | Already implemented; no change |
| Result-file read-back (reconcile) | **Data** | `lib/jobs.js` via `ctx.fs` | Stat-guarded; missing = still running |
| Child-process execution + result-file write | **Integration** | `lib/job-wrapper.mjs` | **Security-sensitive** — thin boundary, argv array, no shell |
| Async Jobs surfacing in gsd_status | **Presentation** | `lib/core-tools.js` | Calls reconcile first, then renders real state |

**Security gate:** the child-process spawn is correctly placed in the **integration tier** (thin boundary, no shell interpolation). It is NOT in the domain or presentation tier. This satisfies the security-sensitive-tier rule. [ASSUMED]

---

## Validation Architecture

Automated checks that prove each behaviour (used for the Nyquist/coverage gate; `nyquist_validation: true` in `.planning/config.json`):

| Behaviour (REQ) | Automated check |
|---|---|
| Launch records a job `running` with a `JOB-<seq>` id and `started` timestamp (JOB-01) | Unit test: `launchJob` against a real temp dir → assert manifest has the job with `status: "running"`, `started` set, id `JOB-01` |
| A real child process actually runs (JOB-01) | Integration test: launch `node -e "process.exit(0)"`, poll for the result file to appear (bounded timeout) |
| Non-zero exit → job `failed` with captured stderr/error (JOB-01, D-04) | Integration test: launch `node -e "process.exit(3)"` (and one that writes stderr), reconcile → assert `status: "failed"`, `completed` set, result summary includes the error |
| Zero exit → job `done` with captured stdout (JOB-01, D-04) | Integration test: launch `node -e "console.log('hello')"`, reconcile → assert `status: "done"`, `completed` set, result file contains `hello` |
| Result is collected and surfaced (JOB-02) | Integration test: after reconcile, assert the manifest `result` reflects the real outcome (not a registry-only placeholder) |
| gsd_status reflects real async state (JOB-02, D-05) | Tool test: seed a `running` job whose result file exists → gsd_status renders `done`/`failed`; seed a `running` job with no result file → gsd_status renders `running` |
| Missing result file = still running (no premature terminal state) | Unit test: reconcile a `running` job with no result file → status stays `running` |
| Corrupt result file does not throw / does not corrupt manifest (D-06) | Unit test: write a corrupt result file, reconcile → job stays `running`, no throw |
| Existing registry + gsd_status tests still pass | Regression: `npm test` (node --test test/*.test.mjs) green |

**Note:** `tdd_mode: false` in config, so tests are written alongside (not strictly before) implementation, but every task must still carry an automated verify (Nyquist). [VERIFIED: .planning/config.json]

---

## Project Constraints

- **Zero runtime dependencies** — `package.json` `"dependencies": {}`; use Node core only. [VERIFIED: package.json]
- **Route artefact writes through `ctx.fs`** (DUR-06) — the bundle convention is to avoid raw `node:fs/promises` for `.planning/` writes from the host plane. The detached wrapper is the exception (it has no `ctx`); reconcile reads via `ctx.fs`. [VERIFIED: lib/state.js _write lines 79-83; GSD-06 DUR-06]
- **gsd_status is an orientation surface and must never throw** over a bad ledger/result file (D-06). [VERIFIED: lib/core-tools.js lines 121-122]
- **Manifest accessors are the single choke point** for read/write; reconcile must go through `readJobs`/`updateJob`, never raw file edits. [VERIFIED: lib/state.js lines 371-410]
- **`completed` is the finished timestamp** — set by `updateJob` on the first `done`/`failed` transition; do not add a separate `finished` field. [VERIFIED: lib/state.js lines 405-407]
- **Tests run via `node --test test/*.test.mjs`** (`npm test`). [VERIFIED: package.json]
- **No new tool registration required** — a `gsd_job` launch tool is explicitly deferred; the runner is exercised programmatically and surfaced through the existing `gsd_status`. [VERIFIED: GSD-09 CONTEXT.md deferred section]
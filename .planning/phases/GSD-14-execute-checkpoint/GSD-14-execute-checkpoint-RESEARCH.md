I have all the information needed. Here is the full RESEARCH.md.

---

# GSD-14-execute-checkpoint — RESEARCH.md

**Researcher:** gsd-phase-researcher · **Date:** 2026-08-27
**Phase goal:** Extract the checkpoint prepare/process logic in `gsd_execute` into helpers and reuse the planIndex runnable set. (REQ: CQ-04)

---

## 1. Domain analysis

### 1.1 What the phase is
A strictly behavior-preserving refactor of `lib/execute.js` (the `gsd_execute` tool). Two extractions plus one reuse:

1. **Prepare path** — the pre-dispatch checkpoint logic (read+validate the persisted `CHECKPOINT-<PP>` artefact, build the RESUME instruction, run the awaiting gate, bind/persist a human answer).
2. **Process path** — the post-dispatch structured-checkpoint return logic (validate `last_completed_task`, persist the `CHECKPOINT-<PP>` artefact, reconcile the job to `done`/`checkpointed`).
3. **Runnable reuse** — replace the per-wave re-derivation of the runnable set with the `planIndex` `runnable` set.

No observable behavior change. No change to `state.js` planIndex internals, the SUMMARY-wins cleanup, or the existing pure helpers in `_shared.js`.

### 1.2 The exact code being moved — [VERIFIED: read this session]

**Prepare path** — `lib/execute.js:104-164` (inside the `runnables` map, per plan `p`):
- `cpSuffix = CHECKPOINT-${zeroPad(Number(p.plan))}` (line 110).
- If `s.hasArtifact(cwd, phase, cpSuffix)` (line 113): read + `parseFrontmatter` → `checkpointFm`; validate `last_completed_task` (line 118); build `resumeInstr` (line 121).
- Awaiting gate (line 126): `awaiting = checkpointFm ? awaitingDecision(checkpointFm, args.answer, args.decision_id) : false`; if awaiting, return `{ p, awaiting: true, marker: awaitingMarker({...}) }` (lines 127-138).
- Answer binding (lines 145-164): compute `storedDecisionId`, `suppliedAnswer`, `suppliedMatches`; if `suppliedMatches`, persist `human_answer` into the CHECKPOINT frontmatter via `s.writeArtifact`; compute `answer`; append `\nRESUME from checkpoint: human answered ${storedDecisionId} = ${answer}` to `resumeInstr`.

**Process path** — `lib/execute.js:195-219` (inside the post-dispatch `results` map):
- `cp = r.structured?.checkpoint`; if `cp && typeof cp === "object"` (line 196): validate `last_completed_task` (line 197); `s.writeArtifact` the CHECKPOINT frontmatter (lines 200-210); reconcile the job via `s.updateJob(cwd, job.id, { status: "done", result: "checkpointed (resumable)" })` with a `.catch(() => null)` and a log push on `!updated` (lines 214-217); return `{ p, ok: false, checkpointed: true, checkpointed_at, out, stopReason, diagnostic }` (line 218).

**Runnable re-derivation** — `lib/execute.js:91`:
```js
const runnable = wavePlans.filter((p) => (p.depends_on || []).every((d) => resolvePlanDep(idx.plans, d)?.has_summary));
```

### 1.3 The planIndex runnable set — [VERIFIED: read this session]
`lib/state.js:531-552` `planIndex(cwd, phaseNum)` returns `{ plans, waves, incomplete, runnable, has_checkpoints }`. `runnable` (lines 542-549) is `incomplete.filter((p) => (p.depends_on || []).every((d) => resolvePlanDep(plans, d)?.has_summary))` — the same predicate as the execute.js line-91 re-derivation, but computed over the **whole phase** (all incomplete plans), not just the current wave.

**Equivalence argument (why the reuse is safe):** in `execute.js`, `plans` is built from `idx.incomplete.filter((p) => !p.has_summary)` (line 64) and then filtered by `gapsOnly`/`wave` (lines 65-70). `wavePlans` is therefore always a subset of `idx.incomplete`. `idx.runnable` is a subset of `idx.incomplete`. So `wavePlans.filter((p) => idx.runnable.includes(p))` yields exactly the plans in this wave whose deps are satisfied — identical to the line-91 result. The `resolvePlanDep` call inside `planIndex` already throws on an unresolved dependency (line 547), so the fail-loud behavior is preserved (and actually centralized). **Confidence: HIGH** — the predicate is textually identical and the sets are nested.

### 1.4 The two validations and the "no duplicated validation" requirement
CQ-04 says "no duplicated validation". The two validations share the same predicate but have **different, test-pinned error messages**:
- Prepare (line 118-120): `gsd_execute: invalid ${cpSuffix} artefact for plan ${p.id}: last_completed_task=${n}, task_count=${p.task_count}` — pinned by `test/tools.test.mjs:331` (`/invalid CHECKPOINT-01/`).
- Process (line 197-199): `gsd_execute: executor returned invalid checkpoint for plan ${p.id}: last_completed_task=${cp.last_completed_task}, task_count=${p.task_count}`.

**Recommendation:** extract a single shared `validateCheckpointTask(n, taskCount, message)` helper in `_checkpoint.js` that both prepare and process call, passing their distinct message strings. This satisfies "no duplicated validation" (one predicate, one place) while preserving both exact error messages (D-03). **Confidence: HIGH** — this is the only reading of CQ-04 that is compatible with D-03's "no error-message change".

### 1.5 Standard patterns / pitfalls
- **Pure-helper convention:** `_shared.js` holds only pure, I/O-free helpers (unit-tested in `test/_shared.test.mjs`). The new `_checkpoint.js` helpers are **not** pure — they call `s.hasArtifact/readArtifact/writeArtifact/updateJob` — so they must take `s` (the gsdState service) as a parameter to be unit-testable with a fake `s` (D-01). This is the established pattern for service-touching helpers (cf. `_runner.js` functions take `ctx`/`exec`).
- **Pitfall — behavior drift:** the prepare path's `resumeInstr` is a string that is conditionally appended to the executor prompt (line 175). Any refactor must preserve the exact string content and the exact ordering of the two `RESUME from checkpoint:` lines (the artefact-context line at 121, then the human-answer line at 163). Tests pin these via `executeCaptured[0]` regexes (`/RESUME from checkpoint/`, `/begin at task 2/`, `/human answered 01-auth-01-ck1 = use pg/`).
- **Pitfall — the awaiting return shape:** the prepare path returns a distinct object `{ p, awaiting: true, marker }` that the caller must NOT dispatch. The refactor must keep this branch returning a marker-bearing object so `runnables.filter((r) => r.awaiting)` (line 188) and the marker log loop (line 253) keep working.
- **Pitfall — job reconcile is duplicated in the codebase today:** the checkpoint job reconcile (lines 214-217) and the SUMMARY-wins job reconcile (lines 230-241) are separate. D-02 explicitly keeps the SUMMARY-wins cleanup + its job reconcile **inline** in execute.js; only the checkpoint branch's reconcile moves into the process helper. Do not merge them.
- **Pitfall — `checkpointFm` is read twice:** in the prepare path, `readArtifact`+`parseFrontmatter` happens once at line 114-116 and again at line 155-156 (inside the `suppliedMatches` persist). The helper should preserve this double-read (it re-reads to get the freshest frontmatter before writing `human_answer`). **Confidence: HIGH** — behavior-preserving means keeping the re-read.

### 1.6 Confidence summary
| Claim | Confidence | Basis |
|---|---|---|
| Runnable reuse is behavior-equivalent | HIGH | Textually identical predicate; nested sets (verified) |
| Two validations share one predicate but distinct messages | HIGH | Read both sites + test pin |
| Helpers must take `s` (not pure) | HIGH | D-01 + service calls |
| Prepare returns a marker-bearing object when awaiting | HIGH | Read lines 127-138 + tests |
| SUMMARY-wins cleanup stays inline | HIGH | D-02 (locked) |

---

## 2. Package legitimacy

**No new dependencies.** This phase introduces no packages. The new `lib/_checkpoint.js` module imports only from the existing in-repo `lib/_shared.js` (`parseFrontmatter`, `stringifyFrontmatter`, `zeroPad`, `decisionIdFor`, `awaitingDecision`, `awaitingMarker`) — all [VERIFIED: read this session, `lib/_shared.js`]. `package.json` declares `"dependencies": {}` and only peer-deps on the DSH packages; nothing to add. [VERIFIED: read `package.json` this session]

---

## 3. Risks and Open Questions

### Risks
- **R1 — Behavior drift in the prepare path (HIGH impact).** The `resumeInstr` string and the awaiting marker are pinned by integration tests. Mitigation: keep the exact string literals and ordering; the new unit tests (D-05) plus the existing `tools.test.mjs` gsd_execute block (lines 214-509) are the guard.
- **R2 — Runnable reuse subtlety (MEDIUM).** `idx.runnable` is computed over the whole phase; if a plan in a *different* wave is runnable, it is in `idx.runnable` but not in `wavePlans`, so the intersection correctly excludes it. The only risk is if `wavePlans` ever contained a plan not in `idx.incomplete` — it cannot (line 64 filters from `idx.incomplete`). Low real risk.
- **R3 — Validation message drift (MEDIUM).** If the shared validator is given the wrong message string, the `test/tools.test.mjs:331` pin (`/invalid CHECKPOINT-01/`) fails. Mitigation: pass the exact existing strings.
- **R4 — Double-read of the CHECKPOINT artefact (LOW).** Removing the re-read at line 155 would change behavior (the persisted `human_answer` write reads fresh frontmatter). Keep it.

### Open Questions
- **OQ-1 (RESOLVED):** What is the exact signature of the prepare helper? → Recommended: `prepareCheckpoint(s, { cwd, phase, p, answer, decisionId })` returning `{ resumeInstr, checkpointFm, awaiting, marker }` (marker present only when awaiting). This is Claude's Discretion; the planner may choose a single-object return as long as it preserves behavior. **Blocking: none.**
- **OQ-2 (RESOLVED):** What is the exact signature of the process helper? → Recommended: `processCheckpoint(s, { cwd, phase, p, r, job, log, w })` returning the result object `{ p, ok: false, checkpointed: true, checkpointed_at, out, stopReason, diagnostic }` and pushing the reconcile-skip log line internally. **Blocking: none.**
- **OQ-3 (RESOLVED):** How is "no duplicated validation" satisfied given two distinct error messages? → A single shared `validateCheckpointTask(n, taskCount, message)` in `_checkpoint.js`, called by both prepare and process with their exact message strings. **Blocking: none.**
- **OQ-4 (RESOLVED):** Where do the new unit tests live? → New `test/_checkpoint.test.mjs` (a new module warrants a new test file; `_shared.test.mjs` is for `_shared.js` pure helpers). Uses a minimal fake `s` with `hasArtifact/readArtifact/writeArtifact/updateJob`. **Blocking: none.**
- **OQ-5 (RESOLVED):** Does the runnable reuse change the `blocked` log line? → No. `blocked = wavePlans.filter((p) => !runnable.includes(p))` (line 92) still produces the same `skipping ...` log (pinned by `test/tools.test.mjs:500` `/skipping .*01-auth-02/`). **Blocking: none.**

All Open Questions are RESOLVED. Planning may proceed.

---

## 4. Architectural Responsibility Map

| Capability | Tier | Notes |
|---|---|---|
| `prepareCheckpoint` — read+validate CHECKPOINT artefact, build RESUME instruction, awaiting gate, answer binding/persist | **Domain** | Pure orchestration over the gsdState service; no I/O of its own (delegates to `s`). Lives in `lib/_checkpoint.js`. |
| `processCheckpoint` — validate structured return, persist CHECKPOINT artefact, reconcile job | **Domain** | Same tier; delegates all I/O to `s`. Lives in `lib/_checkpoint.js`. |
| `validateCheckpointTask` — shared predicate | **Domain** | Pure; could live in `_checkpoint.js` (not `_shared.js`, per D-01 which reserves `_shared.js` for pure helpers — though this one is pure, D-01 says the new helpers are in `_checkpoint.js`; keeping the validator there avoids splitting the module). |
| `planIndex` runnable set | **Data** | Already in `lib/state.js`; reused, not modified (D-04). |
| `gsd_execute` wave loop | **Presentation** | Keeps the dispatch, SUMMARY-wins cleanup, window ledger, and progress recompute inline; calls the two helpers. |

**Security note:** none of the moved logic is security-sensitive (no secrets, no shell, no path construction beyond the existing `CHECKPOINT-${zeroPad(...)}` suffix). No tier misplacement. **No BLOCKER.**

---

## 5. Validation Architecture

| Behavior | Automated check | Where |
|---|---|---|
| Prepare: valid checkpoint builds the RESUME instruction | `test/tools.test.mjs:310-324` (resume path) + new unit test | Integration + unit |
| Prepare: invalid/out-of-range checkpoint fails loud | `test/tools.test.mjs:326-332` (`/invalid CHECKPOINT-01/`) + new unit test | Integration + unit |
| Prepare: awaiting gate returns marker, no executor spawned | `test/tools.test.mjs:350-361, 397-406, 408-433` + new unit test | Integration + unit |
| Prepare: answer binding persists `human_answer` | `test/tools.test.mjs:375-384` + new unit test | Integration + unit |
| Prepare: context-reset resume (persisted answer, no args) | `test/tools.test.mjs:386-395` + new unit test | Integration + unit |
| Process: structured checkpoint return persists CHECKPOINT artefact + reconciles job | `test/tools.test.mjs:263-276, 298-308` + new unit test | Integration + unit |
| Runnable reuse: wave-2 blocked until wave-1 SUMMARY | `test/tools.test.mjs:435-508` (`/skipping .*01-auth-02/`, spawn counts) | Integration |
| No behavior change to gsd_execute | Full suite green (baseline 190 tests) | `npm test` |

**Nyquist/coverage gate:** the new unit tests in `test/_checkpoint.test.mjs` must cover prepare (valid/invalid checkpoint, awaiting gate, answer binding) and process (persist + job reconcile) per D-05. The existing gsd_execute integration block (lines 214-509) must stay green. Baseline confirmed: **190 tests pass** [VERIFIED: ran `npm test` this session, exit 0].

---

## 6. Project Constraints

- **Commit convention:** conventional commits scoped `{phase}-{plan}`, e.g. `refactor(GSD-13-gate-dispatch-02): ...` [VERIFIED: `git log` this session]. For this phase: `refactor(GSD-14-execute-checkpoint-<PP>): ...`.
- **Test command:** `npm test` → `node --test test/*.test.mjs` [VERIFIED: `package.json`]. New test files must match `test/*.test.mjs` to be picked up.
- **D-03 (locked):** strictly behavior-preserving; no observable change to gsd_execute output, artefact writes, job/window records, or error messages. The redundant `.filter((p) => !p.has_summary)` on `lib/execute.js:64` is left untouched.
- **D-01 (locked):** helpers go in a new `lib/_checkpoint.js`, take `s` as a parameter, are NOT added to `_shared.js`.
- **D-02 (locked):** prepare = pre-dispatch path; process = post-dispatch structured return only. The non-checkpoint SUMMARY-wins cleanup + its job reconcile stay inline in execute.js.
- **D-04 (locked):** reuse `idx.runnable` by intersecting with `wavePlans` (`wavePlans.filter((p) => idx.runnable.includes(p))`); no change to `state.js` planIndex; no per-wave runnable added.
- **D-05 (locked):** add direct unit tests for the extracted helpers.
- **Working tree:** currently on `main` with a modified `.planning/STATE.md` and the untracked phase dir — the executor should work on a feature branch per the ship preflight.
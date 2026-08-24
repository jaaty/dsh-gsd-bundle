I have everything I need. Here is the full RESEARCH.md output.

---

# GSD-07 uat-conversation — Research

**Phase:** 7 — uat-conversation
**Goal:** Implement the conversational UAT loop: an executor stopping at a checkpoint:decision or checkpoint:human-action task surfaces a human-facing question, and gsd_execute pauses the phase, waits for the human's answer, and resumes the checkpointed plan with that answer applied so the phase completes.
**Requirements:** UAT-01, UAT-02
**Researched:** 2026-08-24 (this session)

---

## 1. Domain analysis

### 1.1 The core problem: a two-turn human-in-the-loop handoff
The gsd_execute tool is a plugin tool invoked by the *driving agent*. It cannot block on an inline human answer because the only human-interaction primitive (`ask_user_question`) lives at the driving-agent level, outside the plugin tool surface. [VERIFIED: lib/execute.js:1-44 — gsd_execute is `defineTool` registered via `ctx.tools.register`; lib/discuss.js:4 — comment names `ask_user_question` as the host-level primitive]. Therefore the conversational UAT loop is necessarily a **two-turn marker->answer handoff** (D-01, D-02):

1. **Turn 1:** executor stops at a checkpoint task → returns structured checkpoint state → gsd_execute persists `CHECKPOINT-<PP>` and returns an "awaiting human decision" marker line in its string output. The driving agent parses the marker and calls `ask_user_question`.
2. **Turn 2:** the driving agent re-invokes `gsd_execute` with `answer` + `decision_id`. gsd_execute validates the answer against the pending checkpoint, persists it into the checkpoint frontmatter (`human_answer`), appends a resume instruction to the executor prompt, and dispatches. The executor resumes at `last_completed_task + 1` and the phase completes.

Confidence: **HIGH** — every input (D-01…D-07), the current checkpoint persistence (lib/execute.js:142-160), and the resume path (lib/execute.js:103-127) were read this session.

### 1.2 What already exists (read this session) — do not rebuild
- **Executor checkpoint stop** already implemented. `EXECUTOR_PROMPT` tells the executor: on a `checkpoint:*` task, stop and return a structured object with exactly `plan`, `last_completed_task`, `checkpoint_reason`, `committed_hashes`; never proceed to later tasks. [VERIFIED: lib/_agents.js:158-160]
- **Checkpoint persistence + resume** already implemented (phase 4). gsd_execute consumes `r.structured?.checkpoint`, validates `last_completed_task` against `p.task_count`, and persists via `writeArtifact('CHECKPOINT-<PP>', stringifyFrontmatter({...}))`. [VERIFIED: lib/execute.js:142-152]. The resume path reads the artefact, validates the task index (fail-loud), and appends `RESUME from checkpoint: tasks 1..N are done; begin at task N+1. Prior checkpoint context:\n<cpText>`. [VERIFIED: lib/execute.js:105-115]
- **CHECKPOINT artefact naming** already correct. `_artifactFile` maps `CHECKPOINT-<PP>` → `<base>-<PP>-CHECKPOINT.md`. [VERIFIED: lib/state.js:444-448]
- **Frontmatter primitives** already correct. `parseFrontmatter`/`stringifyFrontmatter` handle scalar, flow-array, and one-level-nested YAML-subset. A multi-word string value is JSON-quoted on write and unquoted on read. [VERIFIED: lib/_shared.js:151-173 (`stringifyFrontmatter` JSON-quotes strings containing `\s`/`:`/`#`); lib/_shared.js:40-43 (`coerceScalar` unquotes)]

So this phase is **incremental** over phase 4: it adds (a) the `awaiting` gate + marker, (b) the `answer`/`decision_id` args, (c) answer validation + binding into the resume prompt, and (d) `human_answer` persistence. **Confidence: HIGH.**

### 1.3 The new mechanics this phase must add (derived from D-01…D-07)
- **Two optional args** on `gsd_execute`: `answer` (string) and `decision_id` (string). Current schema is `phase`(required), `wave`, `gapsOnly`. [VERIFIED: lib/execute.js:39-43]
- **Awaiting gate (D-05):** a plan whose `CHECKPOINT-<PP>` exists is "awaiting" iff there is **no human answer available** — either the call passed no matching `answer`+`decision_id`, or the persisted checkpoint frontmatter has no `human_answer`. When awaiting, gsd_execute returns the marker and **does NOT spawn the executor** (D-05 "does NOT re-execute the plan"). This is a behaviour change from phase 4, where any checkpointed plan auto-resumed and spawned.
- **Marker (D-01):** appended to the returned string, naming the exact question, the plan id, and the decision kind, plus the `decision_id` the driving agent must echo back.
- **Answer validation (D-03, D-06):** if `answer` + `decision_id` are supplied and the `decision_id` matches the pending checkpoint's stored `decision_id`, treat it as answered. If `answer` is supplied but `decision_id` matches nothing, **ignore the answer, no error** (D-06) → which by composition means the plan stays awaiting (D-05).
- **Answer binding (D-03):** append `RESUME from checkpoint: human answered <decision_id> = <answer>` to the executor prompt before dispatch.
- **human_answer persistence (D-04):** write the answer into the existing `CHECKPOINT-<PP>` frontmatter so a context-reset resume carries it; a checkpoint with a persisted `human_answer` resumes without needing args on a later call.
- **Single path for all three kinds (D-07):** `checkpoint:human-verify`, `checkpoint:decision`, `checkpoint:human-action` all go through the one marker->answer path — no separate acknowledgement branch.

### 1.4 The `decision_id` identifier (D-03)
D-03 requires "an identifier for the pending decision so an answer can't be misapplied across checkpoints". There is currently **no decision_id anywhere** — the checkpoint frontmatter holds only `plan`, `last_completed_task`, `checkpoint_reason`, `committed_hashes`. [VERIFIED: lib/execute.js:147-152; test/tools.test.mjs:62-68 CHECKPOINT_FM]. gsd_execute must **generate and persist a `decision_id` at checkpoint-persist time** so turn 2 can match it.
- **Recommendation:** deterministic id derived from the plan + checkpoint position, e.g. `` `${p.id}-ck${cp.last_completed_task}` `` → `GSD-07-uat-conversation-01-ck1`. Deterministic (testable, round-trippable), unique per plan+checkpoint (one checkpoint per plan at a time), and needs no RNG. [ASSUMED: no repo precedent for decision ids; see Open Questions RQ-1, RESOLVED]

### 1.5 The "exact question" and the "decision kind" (D-01)
- **Question:** the executor already returns `checkpoint_reason` ("a short string describing why you stopped"). [VERIFIED: lib/_agents.js:158-160]. For a decision/human-action checkpoint the natural human-facing question *is* that reason. **Recommendation:** reuse `checkpoint_reason` as the marker's question text (and note in the executor prompt that for a decision checkpoint the reason should be phrased as the question). [ASSUMED: see RQ-2]
- **Decision kind:** the executor's structured return has **no kind field**. [VERIFIED: lib/_agents.js:158-160 — exact keys `plan`, `last_completed_task`, `checkpoint_reason`, `committed_hashes`]. To name the kind in the marker, extend the executor contract to also return `checkpoint_kind` ∈ {`decision`, `human-action`, `human-verify`}, persisted into the CHECKPOINT frontmatter. [ASSUMED: see RQ-1, RESOLVED]

### 1.6 Patterns and pitfalls
- **Marker detection:** gsd_execute output is a plain string (`output.schema.type: string`). [VERIFIED: lib/execute.js:44]. The marker must be a **stable, regex-recognizable substring/line** (e.g. `GSD_AWAITING_HUMAN:` prefix) that the driving agent can detect, while the normal completion log stays intact. Pitfall: don't break the existing `wave N: <id> ✓`/`⏸` completion log that other tests assert (`assert.match(res, /01-auth-01 ✓/)`). [VERIFIED: test/tools.test.mjs:212,266,281]. Add the marker as an *additional* line, not a replacement.
- **Multiple checkpointed plans in one wave:** each checkpointed plan appends its own marker line (per-plan `decision_id`). The driving agent answers one at a time and re-invokes; `decision_id` matching keeps answers from being misapplied across plans. [ASSUMED: matches D-03 "an answer can't be misapplied across checkpoints"]
- **Fail-loud on corrupt checkpoint** must be preserved: gsd_execute throws on a CHECKPOINT with out-of-range `last_completed_task` rather than silently re-running. [VERIFIED: lib/execute.js:111-113]. This must still hold when surfacing the marker (read + validate before deciding awaiting).
- **Frontmatter round-trip of the answer:** a multi-word `human_answer` writes JSON-quoted and reads unquoted correctly via existing primitives. [VERIFIED: lib/_shared.js:151-173, 40-43]
- **The answer must be written into the existing artefact**, i.e. re-read the CHECKPOINT, add `human_answer`, re-`writeArtifact`. [VERIFIED: lib/state.js:450-456 writeArtifact; lib/execute.js:147-152 current persist]
- **Testability pitfall:** the fake executor in `test/tools.test.mjs` returns a canned structured checkpoint (`{checkpoint:{...}}`) and keys the checkpoint file path explicitly. [VERIFIED: test/tools.test.mjs:88-100]. New answer-aware tests must extend this fake (add a `checkpoint_kind`, condition the resume on answer presence, and write SUMMARY only when answered) so the awaiting vs resumed paths are each exercised. The existing `CHECKPOINT_FM` and `PLAN_2_TASKS` fixtures (2 tasks, `last_completed_task:1` in-range) are reusable. [VERIFIED: test/tools.test.mjs:27-68]

---

## 2. Package legitimacy

**No new dependencies are proposed or required.** This phase touches only internal bundle modules (`lib/execute.js`, `lib/_agents.js`, and optionally `lib/_shared.js` for a pure helper) plus `test/*`. The bundle declares an empty `dependencies` map and only peer-deps on `@deepseek-ai/dsh-tools`, `@deepseek-ai/schemastery`, `@deepseek-ai/cordis`, `@deepseek-ai/dsh-llm`. [VERIFIED: package.json — `"dependencies": {}`, peerDependencies list]

- `@deepseek-ai/dsh-tools` (`defineTool`) — already used by every plugin; not new. [VERIFIED: lib/execute.js:25]
- `@deepseek-ai/dsh-subagent` / `@deepseek-ai/dsh-subagent-spawn-in-process` — host spawn provider; referenced as a runtime prerequisite string only, not imported. [VERIFIED: lib/_runner.js:10-12]
- The `ask_user_question` human primitive — **not a package and not a plugin tool**; it lives at the driving-agent/host level and is reached via the marker handoff, never imported. [VERIFIED: lib/discuss.js:4 comment; CONTEXT.md D-02 code_context]

**Conclusion:** no package to verify, no new install, no supply-chain risk introduced. **Confidence: HIGH** (empty deps map read this session).

---

## 3. Risks and ## Open Questions

### Risks
- **R-1 (behaviour change to phase 4 auto-resume).** Phase 4 resumes any checkpointed plan immediately on the next `gsd_execute`. This phase changes that to *await* unless an answer is present (D-05). If an existing integration test asserts that a checkpointed plan spawns/executes without an answer, it must be updated. **Severity: MEDIUM.** Mitigation: this is exactly the intended new behaviour; the phase must explicitly cover it in tests and note the change in SUMMARY. [VERIFIED: phase-4 resume path at lib/execute.js:105-115; phase-4 CONTEXT D-03/D-04]
- **R-2 (marker string must not break completion-log assertions).** Tests assert `assert.match(res, /01-auth-01 ✓/)` and `/checkpoint/`. The awaiting marker must be an additive line, not a rewrite of the per-wave log. **Severity: LOW.** Mitigation: append marker lines only for awaiting plans; keep `✓`/`⏸` lines intact. [VERIFIED: test/tools.test.mjs:212,266,281]
- **R-3 (answer misapplication across checkpoints).** Without a stable `decision_id`, a stale answer could be applied to the wrong checkpoint/plan. **Severity: HIGH** (D-03 core requirement). Mitigation: persist a deterministic per-checkpoint `decision_id` at persist time and gate the resume on an exact `decision_id` match.
- **R-4 (context-reset answer loss).** If the answer is only in the driving agent's conversation, a context reset loses it. D-04 requires persisting `human_answer` in the CHECKPOINT frontmatter so a later run resumes from the stored value. **Severity: MEDIUM.** Mitigation: write `human_answer` into the artefact on the answering turn, and make the awaiting gate read the persisted value.
- **R-5 (schema drift).** Adding two optional params to `gsd_execute` must not break the mount/schema smoke tests. The mount tests assert tool *names* and *count*, not the exec param set, so adding optional args is safe. [VERIFIED: test/mount.test.mjs:170-178 — asserts `ctx.tools.length === 12` and tool names only]. **Severity: LOW.**

### ## Open Questions

#### RQ-1 — How is `checkpoint_kind` surfaced so the marker can name the decision kind? (RESOLVED)
D-01 requires the marker to name "the decision kind", but the executor's structured return has no kind field ([VERIFIED: lib/_agents.js:158-160]). **Resolution:** extend `EXECUTOR_PROMPT`'s structured-checkpoint contract to also return `checkpoint_kind` ∈ {`decision`, `human-action`, `human-verify`} (the executor derives it from the task type it stopped at, matching the line-100 `human-verify|decision|human-action` classification). gsd_execute persists `checkpoint_kind` into the CHECKPOINT frontmatter and the marker names it. This is a one-line executor-contract addition, backward-compatible (default `decision` when absent is acceptable since all three await per D-07). *Blocking:* none once the executor returns the field.

#### RQ-2 — What exactly is the "exact question" the marker must name? (RESOLVED)
D-01 requires naming "the exact question". **Resolution:** reuse the existing `checkpoint_reason` from the structured return as the question text ([VERIFIED: lib/_agents.js:158-160]) and note in `EXECUTOR_PROMPT` that for decision/human-action checkpoints the reason should be phrased as the human-facing question. This avoids adding a second question-carrying field to the executor contract. *Blocking:* none.

#### RQ-3 — How is the pending `decision_id` generated and matched? (RESOLVED)
**Resolution:** gsd_execute generates `` decision_id = `${p.id}-ck${cp.last_completed_task}` `` at checkpoint-persist time (deterministic, unique, round-trippable — no RNG), persists it in the CHECKPOINT frontmatter, and includes it in the marker. Turn-2 matching is an exact string equality on the stored value; a supplied `decision_id` matching nothing is ignored (D-06). *Blocking:* none.

#### RQ-4 — What is the exact "awaiting" predicate (interaction of D-04 and D-05)? (RESOLVED)
**Resolution:** a checkpointed plan is **awaiting** (marker, no spawn) iff it has a `CHECKPOINT-<PP>` artefact **and** neither the persisted frontmatter `human_answer` nor this call's `answer`+matching `decision_id` provides an answer. Equivalently: **not** awaiting iff (a) an `answer` whose `decision_id` matches the stored `decision_id` was passed, or (b) the persisted checkpoint already has a non-empty `human_answer`. This single predicate satisfies both D-05 (no answer → await, don't execute) and D-04 (context-reset resume carries the stored answer). *Blocking:* none.

#### RQ-5 — How do the new args interact with `--wave`/`--gaps-only` and multi-plan waves? (RESOLVED)
**Resolution:** the answer args apply **per-plan** via `decision_id`; a wave may contain both awaiting and resumable plans. Awaiting plans are skipped (marker) while resumable/answered ones dispatch, preserving the existing wave/gaps filtering ([VERIFIED: lib/execute.js:63-69]). `gapsOnly` and the new await logic compose (a gap-fix plan that checkpointed awaits the same way). *Blocking:* none.

---

## 4. Architectural Responsibility Map

Capability → tier. All of this phase is domain + data tier (plugin tool internals); there is no presentation tier (output is a string the driving agent parses) and no new integration tier.

| Capability | Tier | Where it lives | Why |
|---|---|---|---|
| Awaiting gate predicate (pure) | **domain** | `lib/_shared.js` (or a small helper near it) — pure, unit-tested | No I/O; must be independently verifiable; reused by tests |
| Marker formatting (pure) | **domain** | `lib/_shared.js` or inline in `lib/execute.js` | Deterministic string the driving agent regex-parses; must be stable |
| `answer`/`decision_id` args + schema | **domain** | `lib/execute.js` params (line 39-43) + `execute(args)` | Tool input contract |
| decision_id generation | **domain** | `lib/execute.js` (persist path, ~line 147) | Pure derivation from plan id + task index |
| human_answer persistence into CHECKPOINT frontmatter | **data** | `lib/execute.js` via `s.writeArtifact('CHECKPOINT-<PP>', stringifyFrontmatter({...}))` | Writes the artefact schema; MUST route through the gsdState artefact model (`ctx.fs`), never raw node:fs — per DUR-06 precedent [VERIFIED: lib/state.js:450-456; lib/quick.js writeQuickRecord pattern] |
| Answer validation + binding into resume prompt | **domain** | `lib/execute.js` resume path (~line 105-127) | Composes with the existing `resumeInstr`; appends the D-03 instruction |
| Executor returns `checkpoint_kind` | **domain/integration** | `lib/_agents.js` EXECUTOR_PROMPT (line ~158) | Extends the executor→orchestrator structured contract |
| CHECKPOINT artefact read/write primitives | **data** | `lib/state.js` (already present, reused) | Do not modify; already correct [VERIFIED: lib/state.js:444-482] |
| Driving-agent ask_user_question | **presentation (host)** | NOT a plugin capability — the marker handoff reaches it | Out of plugin scope (D-02); must NOT be inlined into gsd_execute |

**Security note (BLOCKER guard):** no capability here is security-sensitive (no secrets, no auth, no privileged I/O). The only "writes" are `.planning/` artefacts through the existing `gsdState` artefact model. Do NOT introduce raw `node:fs` file writes into the new persistence path — route through `s.writeArtifact` (DUR-06 convention). **Confidence: HIGH.**

---

## 5. Validation Architecture

Automated checks proving each behaviour. The suite is `npm test` → `node --test test/*.test.mjs` (currently 94 passing). [VERIFIED: package.json scripts.test; `npm test` run this session → 94 pass / 0 fail]

| Behaviour (req) | Automated check | Where |
|---|---|---|
| Args `answer`/`decision_id` accepted (no schema break) | `t.execute({phase:1, answer:'x', decision_id:'y'}, exec)` resolves; mount tool-count test stays at 12 | `test/tools.test.mjs` (new), `test/mount.test.mjs` (regression) |
| Awaiting marker returned when a decision checkpoint exists and no answer (D-05) — **and executor NOT spawned** | seed CHECKPOINT (with kind) → `t.execute({phase:1})` → assert output matches `/GSD_AWAITING_HUMAN/` and names `plan`, `decision_id`, `kind`, `question`; assert `executeSpawnCount` unchanged | `test/tools.test.mjs` (extend fake executor) |
| Answer + matching decision_id resumes, binds instruction, completes (D-03) | `t.execute({phase:1, answer:'use pg', decision_id:...})` → captured prompt matches `/RESUME from checkpoint: human answered .* = use pg/`; SUMMARY written; `assert.match(res, /✓/)` | `test/tools.test.mjs` |
| human_answer persisted into CHECKPOINT frontmatter (D-04) | after answer, read `CHECKPOINT-<PP>`, `parseFrontmatter` → `human_answer === 'use pg'` | `test/tools.test.mjs` + `test/state.test.mjs` (frontmatter round-trip of a multi-word answer via stringify/parse) |
| Context-reset resume uses stored answer (D-04) | seed CHECKPOINT already containing `human_answer` → `t.execute({phase:1})` (no args) → resumes + completes, no marker | `test/tools.test.mjs` |
| Stale/non-matching decision_id ignored, no error, stays awaiting (D-06) | `t.execute({phase:1, answer:'x', decision_id:'nope'})` → resolves (no throw), marker returned, no spawn | `test/tools.test.mjs` |
| human-verify shares the same path (D-07) | loop the await→answer→resume test over `checkpoint_kind` ∈ {decision, human-action, human-verify} | `test/tools.test.mjs` |
| Awaiting gate does not corrupt-checkpoint-fail-loud path | corrupt CHECKPOINT (out-of-range `last_completed_task`) still rejects `/invalid CHECKPOINT/` | regression — reuse test/tools.test.mjs:284-290 |
| Completion log markers intact (R-2) | assert `assert.match(res, /✓/)` still passes alongside new marker | `test/tools.test.mjs` |

**Fake-executor extension required:** `test/tools.test.mjs` `makeSubagents()` currently returns a canned structured checkpoint and writes SUMMARY whenever a CHECKPOINT exists. [VERIFIED: test/tools.test.mjs:88-100]. The phase's tests must add an answer-aware mode: return `checkpoint_kind`, and write SUMMARY only when the captured prompt contains a `human answered` instruction (or an answer was supplied), so awaiting vs resumed are both exercised. Reuse `PLAN_2_TASKS` (2 tasks) and `CHECKPOINT_FM` fixtures. [VERIFIED: test/tools.test.mjs:27-68]

**Validation gate (Nyquist):** every new behaviour above has a named automated test; no 3-consecutive-task window lacks coverage (2–3 plans × 2–3 tasks is the target).

---

## 6. Project Constraints

- **`npm test` must stay green** on a clean checkout (MOUNT-06). `node --test test/*.test.mjs`, currently 94 passing. [VERIFIED: package.json; `npm test` this session]
- **Test harness:** node:test + `assert/strict`, `FakeFs` (`test/helpers/fake-fs.mjs`), fake `subagents` service, `buildProject`/`FENCED_PLAN`/`CHECKPOINT_FM` fixtures (`test/helpers/project.mjs`). No LLM/git/gh in tests. [VERIFIED: test/tools.test.mjs:1-10; test/helpers/project.mjs:1-8]
- **Artefact writes route through `GsdState` (`ctx.fs`), never raw `node:fs/promises`** — DUR-06 precedent (gsd_quick `writeQuickRecord`). Applies to the new `human_answer` persistence. [VERIFIED: lib/state.js:450-456; lib/quick.js]
- **Fail-loud, named errors** for corrupt/invalid state (gsd_ship preflight precedent). Preserve the existing CHECKPOINT validation error. [VERIFIED: lib/execute.js:111-113]
- **No inline blocking prompt inside gsd_execute** — D-02; the marker handoff is the only supported human channel. [VERIFIED: CONTEXT D-02]
- **No new dependencies** — empty `dependencies` map. [VERIFIED: package.json]
- **Project code prefix `GSD`**, plan ids `GSD-<NN>-<slug>-<PP>`; depends_on prefix-tolerant resolution. [VERIFIED: .planning/config.json — `project_code: "GSD"`; lib/_shared.js:380-398]
- **Config:** `nyquist_validation: true` (RESEARCH.md Open Questions must all be RESOLVED); `use_worktrees: true` (worktree discipline; executors still run on the shared tree per lib/execute.js:9-12). [VERIFIED: .planning/config.json]

---

## 7. Recommended decomposition for the planner (non-binding)

This is a tight, single-file-majority phase. A sensible split is **2 plans** (avoid overlapping edits to `lib/execute.js` within a wave):
- **Wave 1 — executor contract + pure helpers:** extend `EXECUTOR_PROMPT` to return `checkpoint_kind`; add pure helpers to `lib/_shared.js` for the awaiting predicate + marker formatting + decision_id generation (unit-tested in `test/_shared.test.mjs`).
- **Wave 2 — gsd_execute wiring:** add `answer`/`decision_id` args, the awaiting gate, marker emission, answer validation + binding, and `human_answer` persistence in `lib/execute.js`; extend the fake executor + tests in `test/tools.test.mjs` and `test/state.test.mjs`.

---

*Phase 7 uat-conversation research. 2026-08-24.*
I've completed the research and written the RESEARCH.md to disk. Here is the full file contents:

---

# RESEARCH — Phase 48: pause-resume-work

**Phase goal:** Add pause-work and resume-work commands that write a structured context handoff (HANDOFF.json) and restore full context to continue work mid-phase.
**Requirement:** GAP-14.
**Researched:** 2026-09-03.

---

## 1. Domain analysis

### 1.1 What this phase is (and is not)

This phase adds two **utility commands** — `gsd_pause_work` and `gsd_resume_work` — plus their `/gsd-pause-work` and `/gsd-resume-work` slash commands. They are **not** loop steps and publish **no new capability** (CONTEXT D-01, out-of-scope). They are advisory: neither advances the STATE loop position (D-04). This mirrors how `gsd_undo`, `gsd_health`, and `gsd_job` are out-of-band/orientation surfaces rather than loop steps.

The upstream contract (`.analysis/gsd-core/commands/gsd/pause-work.md`, `.analysis/gsd-core/gsd-core/workflows/pause-work.md`, `.analysis/gsd-core/gsd-core/workflows/resume-project.md`) is a **WHAT/pattern reference only** — the CONTEXT explicitly says it is "read-only reference, NOT to be vendored". The bundle reimplements a **minimal surface** (D-08): no blocking-constraints/anti-patterns enforcement, no spike/sketch/deliberation/research detection, no CLI/stdin transport, no active STATE mutation on resume.

### 1.2 The two tools' responsibilities

**`gsd_pause_work`** (D-02, D-03, D-06, D-07):
1. Detect an active phase — a `PLAN.md` exists in a phase dir (D-03). The bundle has no spike/sketch/deliberation/research detection, so detection is phase-or-default only.
2. Gather complete state: position, completed/remaining work, decisions, blockers, non-terminal async jobs, uncommitted files, next action.
3. Write `.planning/HANDOFF.json` (structured) **and** a `.continue-here.md` pointer (human-readable) at the context-specific path — the phase dir when a phase is active, else `.planning/` root (D-02, D-03).
4. Commit both as a **WIP commit** on the current branch (D-06).

**`gsd_resume_work`** (D-04, D-05, D-07):
1. Read `HANDOFF.json` (primary source), or fall back to detecting incomplete work (PLAN-without-SUMMARY, `.continue-here` files).
2. Present a full status + next-action recommendation.
3. Update STATE's Session Continuity (`stoppedAt`/`resumeFile`).
4. Delete `HANDOFF.json` after successful consumption (one-shot, D-05).
5. Never advances the loop position (advisory, D-04).

### 1.3 The single most important design tension: registering slash commands without a capability

This is the crux of the phase and the one genuinely unsettled decision.

The commands layer (`lib/commands.js`) pairs **every** `/gsd-*` command to a capability via a `commandToCapability` map built from `allCapabilities()`:

```js
// lib/commands.js:341-344
const commandToCapability = new Map();
for (const cap of allCapabilities()) {
  for (const cmd of cap.commands) commandToCapability.set(cmd, cap.key);
}
// lib/commands.js:353-355
for (const c of COMMANDS) {
  const capKey = commandToCapability.get(c.name);
  ctx.inject([capKey, "commands"], (subCtx) => subCtx.commands.register({ ... }));
}
```

If a command has **no** capability, `capKey` is `undefined`, and `ctx.inject([undefined, "commands"], ...)` is called. In the fake mount harness (`test/helpers/mount-harness.mjs:156-163`), `ctx.inject` treats any key that is not `"commands"` and not in the `provided` store as missing → the sub-fiber stays inactive → **the command is never registered**. [VERIFIED: test/helpers/mount-harness.mjs:156-163]

So the current `commands.js` **cannot** register a command without a capability. CONTEXT D-01 says "no new capability" **and** "add /gsd-pause-work and /gsd-resume-work slash commands in commands.js". These two constraints are in tension and the planner must resolve it. Two viable resolutions:

- **(A) Pair the commands to the existing `gsdOrient` capability** (owned by `core-tools.js`, which also registers the tools). Add `"gsd-pause-work"`/`"gsd-resume-work"` to `gsdOrient.commands` and `gsd_pause_work`/`gsd_resume_work` to `gsdOrient.tools` in `lib/_capabilities.js` TABLE. This keeps "no new capability" literally true, keeps the single registration path, and preserves DEGR-03 (retiring core-tools unregisters the commands). **Minimal, recommended.**
- **(B) Modify `commands.js`** to support capability-less commands (register in a sub-fiber injecting only `["commands"]`). More semantically aligned with "utility commands, not phase steps", but a bigger change that touches the DEGR-03 contract and the mount-harness `ctx.inject` semantics.

**Recommendation: (A).** It is the smallest change consistent with every locked decision, and `gsdOrient` is the natural home (orientation/utility commands owned by the same plugin that registers the tools). This is flagged as an **Open Question** below because CONTEXT does not settle it.

### 1.4 The bundle's async-jobs manifest differs from upstream

Upstream uses per-job manifests at `.planning/async-jobs/*.json` (one JSON file per job). The bundle uses a **single root JSON array** at `.planning/async-jobs.json` (DUR-04). [VERIFIED: lib/state.js:449-494, .planning/async-jobs.json]

- `readJobs(cwd)` → `{ entries, corrupt }` (never throws; missing = empty, corrupt = `corrupt:true`). [VERIFIED: lib/state.js:454-463]
- Job entry shape (from the live manifest): `{ id, kind, plan, phase, status, started, result, completed, reason?, command?/prompt?, timeout?, attempts?, retryCount? }`. [VERIFIED: .planning/async-jobs.json:1-40]
- **Non-terminal** = `status` not in `['done','failed']` (i.e. `pending`/`running`). [ASSUMED — derived from jobs.js status transitions: launch→pending→running→done/failed]

D-07 says the handoff records "job id, backend, status, expected artifacts, resume command". The bundle's manifest does **not** store `expected_artifacts` or `resume_command` — those are upstream-only fields. The handoff must therefore record what the bundle actually has (`id`, `kind` as backend, `status`, `plan`, `phase`, `result`) and **derive** a resume command (e.g. `gsd_job status <id>` or `gsd_execute`). This mapping is Claude's Discretion (CONTEXT) and the planner should pin it down.

### 1.5 Phase detection

D-03: detect an active phase when "a PLAN.md exists in a phase dir". The bundle has **no** accessor that lists phase dirs or finds the most recent PLAN.md. `state.js` has `_phases(cwd)` (path helper, line 59) and `listPlans(cwd, phaseNum)` (requires a phase number, line 685), but no "list all phase dirs" helper. [VERIFIED: lib/state.js:59, 685]

The executor will need a small new accessor (e.g. `listPhaseDirs(cwd)` that `listDir`s `_phases(cwd)` and filters directories) plus a detection helper that finds the most recent phase dir containing a `*-PLAN.md` (by mtime, mirroring upstream's `ls -lt`). This is a **new data-tier accessor** the planner must include.

### 1.6 Session Continuity update

`state.js` has `recordSession(cwd, stoppedAt)` which sets `body.continuity.lastSession`, `body.continuity.stoppedAt`, and `frontmatter.stopped_at` — but it does **not** set `body.continuity.resumeFile`. [VERIFIED: lib/state.js:340-346, 268-302]

D-04 says resume updates Session Continuity (`stoppedAt`/`resumeFile`). The resume tool needs a way to set `resumeFile`. Options: (a) a new accessor (e.g. `updateContinuity(cwd, { stoppedAt, resumeFile })`), or (b) read-modify-write via `readState`/`writeState`. This is a small data-tier addition the planner must include.

### 1.7 WIP commit

D-06: commit `HANDOFF.json` + `.continue-here.md` as a WIP commit on the current branch. The shared seam `commitArtifacts(cwd, phaseNum, opts, gitFn)` stages `.planning` **wholesale** and supports an `opts.message` override (D-12). [VERIFIED: lib/_git-artifacts.js:174-201]

- Using `commitArtifacts(cwd, phaseNum, { message: "wip: ..." })` stages all of `.planning` (including any other uncommitted `.planning` changes) — consistent with phase-branch isolation. This is the **recommended** path (reuses the seam, no raw git).
- A direct `defaultGitFn(cwd, ["add", ...])` + commit staging only the two files is the alternative. This is Claude's Discretion (CONTEXT).

**Security:** every git call must use the fixed-arg seam (`defaultGitFn` with `-C cwd`), never a shell string — mirroring `_git-artifacts.js`'s stated discipline. [VERIFIED: lib/_git-artifacts.js:14-16]

### 1.8 Uncommitted-files detection

The handoff records uncommitted files (upstream `uncommitted_files`). This requires a `git status --porcelain` call via `defaultGitFn(cwd, ["status", "--porcelain"])`. This is a new git call for pause-work. [ASSUMED — upstream pause-work.md gather step item 8; the bundle has no existing porcelain helper]

### 1.9 Error handling (D-09)

Fail-fast on environmental faults, mirroring graphify's guards (`lib/graphify.js:279-285`): [VERIFIED: lib/graphify.js:279-285]
- `if (!s) throw new Error("gsd_pause_work: gsdState service unavailable")`
- `if (!(await s.isProject(cwd))) throw new Error("gsd_pause_work: no .planning/ project — run gsd_init first")`
- `if (!roadmap) throw new Error("gsd_pause_work: unreadable ROADMAP.md")`

Otherwise degrade gracefully: resume-work with no `HANDOFF.json` and no incomplete work returns a clean "nothing to resume" status rather than throwing.

### 1.10 Confidence levels

| Claim | Confidence | Basis |
|---|---|---|
| Command registration requires a capability | **HIGH** | [VERIFIED: lib/commands.js:341-355, mount-harness.mjs:156-163] |
| Bundle async-jobs is a single root JSON array | **HIGH** | [VERIFIED: lib/state.js:449-494, .planning/async-jobs.json] |
| `recordSession` does not set `resumeFile` | **HIGH** | [VERIFIED: lib/state.js:340-346] |
| No phase-dir-listing accessor exists | **HIGH** | [VERIFIED: lib/state.js:59, 685] |
| `commitArtifacts` supports a message override | **HIGH** | [VERIFIED: lib/_git-artifacts.js:174-201] |
| Non-terminal = status not done/failed | **MEDIUM** | [ASSUMED — from jobs.js status transitions] |
| Uncommitted-files via `git status --porcelain` | **MEDIUM** | [ASSUMED — upstream gather step; no bundle helper] |

---

## 2. Package legitimacy

**No new dependencies are required.** The phase is implemented entirely with:
- `@deepseek-ai/dsh-tools` `defineTool` — already a peer dependency and used by every tool. [VERIFIED: package.json:127, lib/core-tools.js:7]
- Node builtins (`node:fs/promises`, `node:child_process` via the existing git seam) — no new packages.
- The existing internal modules: `lib/state.js` (gsdState accessors), `lib/_shared.js` (parseRoadmap, zeroPad, nowIso, parseFrontmatter), `lib/_git-artifacts.js` (commitArtifacts, defaultGitFn), `lib/_runner.js` (cwdOf), `lib/_capabilities.js` (buildCapability), `lib/commands.js` (COMMANDS array).

No third-party package is proposed, so there is nothing to verify against a registry. All claims above are in-repo and read this session.

---

## 3. Risks and Open Questions

### Risks

- **R-1 (HIGH): Command-registration tension.** If the planner picks a resolution that doesn't register the commands, `/gsd-pause-work` and `/gsd-resume-work` silently never appear. Must be resolved before planning (see OQ-1).
- **R-2 (MEDIUM): Mount-test count drift.** Adding 2 tools and 2 commands changes `test/mount.test.mjs` `EXPECTED_TOOL_NAMES` (26→28) and `EXPECTED_COMMAND_NAMES` (23→25), and the "absent capability" test (22→24 if paired to gsdOrient). `test/_capabilities.test.mjs:64-67` asserts gsdOrient's exact tools/commands. These tests **must** be updated in the same phase or the suite fails. [VERIFIED: test/mount.test.mjs:104-124, 139-140, 182-190; test/_capabilities.test.mjs:64-67]
- **R-3 (MEDIUM): `CAPABILITY_KEYS.length === 21` is asserted.** The phase must NOT add a capability key (consistent with D-01). [VERIFIED: test/_capabilities.test.mjs:13]
- **R-4 (LOW): HANDOFF.json one-shot deletion.** If resume deletes HANDOFF.json before the user actually resumes, context is lost. D-05 says delete "after a successful resume consumes it" — the planner must define "successful consumption" precisely (e.g. only delete when a handoff was actually read and presented, not on the "nothing to resume" path).
- **R-5 (LOW): WIP commit scope.** `commitArtifacts` stages `.planning` wholesale. If the pause happens mid-phase with uncommitted **source** files (not `.planning`), they are not committed — only recorded in `uncommitted_files`. This is correct behavior (the WIP commit is for handoff artefacts), but the planner should state it explicitly so the resuming agent knows source files are uncommitted.

### Open Questions

- **OQ-1 (RESOLVED — recommendation): How are `/gsd-pause-work` and `/gsd-resume-work` registered without a new capability?** **Recommendation: (A) pair them to `gsdOrient`** — add the two commands to `gsdOrient.commands` and the two tools to `gsdOrient.tools` in `lib/_capabilities.js` TABLE. This keeps "no new capability" true, reuses the single registration path, preserves DEGR-03, and keeps the mount-harness `ctx.inject` semantics untouched. Alternative (B) modifies `commands.js` to allow capability-less commands. **The planner must pick one and update the affected tests (R-2).**
- **OQ-2 (RESOLVED — recommendation): What is the bundle's HANDOFF.json schema?** Use a subset of the upstream schema (D-08): `{ version, timestamp, context, phase, phase_name, phase_dir, plan, task, total_tasks, status, completed_tasks, remaining_tasks, blockers, async_jobs, decisions, uncommitted_files, next_action, context_notes }`. The `.continue-here.md` template includes exactly the six D-08 sections: `current_state`, `completed_work`, `remaining_work`, `decisions_made`, `blockers`, `next_action`. **The planner should pin the exact field names.**
- **OQ-3 (RESOLVED — recommendation): How are async-job fields mapped given the bundle's manifest lacks `expected_artifacts`/`resume_command`?** Record `{ id, backend: kind, status, plan, phase, result }` and derive a resume command (e.g. `gsd_job status <id>`). **The planner should pin the derived resume command.**
- **OQ-4 (RESOLVED — recommendation): How is `resumeFile` set in Session Continuity?** Add a small accessor (e.g. `updateContinuity(cwd, { stoppedAt, resumeFile })`) or read-modify-write via `readState`/`writeState`. **The planner should pick one.**
- **OQ-5 (RESOLVED — recommendation): How is the active phase detected?** Add a `listPhaseDirs(cwd)` accessor (listDir on `_phases(cwd)`, filter dirs) + a pure helper that finds the most recent phase dir containing a `*-PLAN.md` (by mtime). **The planner should pin the detection helper's signature.**

All open questions have a recommended resolution; none is blocked. The planner should treat OQ-1 as the highest-priority decision.

---

## 4. Architectural Responsibility Map

| Capability | Tier | Where | Notes |
|---|---|---|---|
| `gsd_pause_work` / `gsd_resume_work` tool registration | **Presentation** | `lib/core-tools.js` (D-01) | `ctx.tools.register(defineTool(...))`, mirroring gsd_init/gsd_status/gsd_job |
| `/gsd-pause-work` / `/gsd-resume-work` slash commands | **Presentation** | `lib/commands.js` (D-01) | COMMANDS array entries routing to the tools; capability pairing per OQ-1 |
| Phase detection (active phase vs default) | **Domain** | pure helper (new) | Given phase-dir listing, pick most recent with PLAN.md (D-03) |
| State gathering (position, completed/remaining, decisions, blockers, async jobs, uncommitted files, next action) | **Domain** | pure helper (new) | Composes reads; no I/O in the pure core |
| HANDOFF.json building | **Domain** | pure helper (new) | Given gathered state → JSON object (D-02, D-08) |
| `.continue-here.md` template rendering | **Domain** | pure helper (new) | Given gathered state → markdown with the 6 D-08 sections |
| Resume consumption (read HANDOFF → status + next-action) | **Domain** | pure helper (new) | Given HANDOFF.json → status text + next-action (D-04) |
| Fallback detection (PLAN-without-SUMMARY, `.continue-here` files) | **Domain** | pure helper (new) | Given file listing → incomplete-work report (D-04) |
| gsdState accessors (readState, readRoadmap, readJobs, readArtifact, planIndex, recordSession) | **Data** | `lib/state.js` | Existing; reuse |
| New accessors: `listPhaseDirs`, `updateContinuity` (resumeFile) | **Data** | `lib/state.js` | New (OQ-4, OQ-5) |
| HANDOFF.json / `.continue-here.md` read/write | **Data** | `lib/state.js` `_read`/`_write` → ctx.fs | Route through the artefact model, never raw node:fs (DUR-06 pattern) |
| WIP commit | **Integration** | `lib/_git-artifacts.js` `commitArtifacts` | Fixed-arg git seam, message override (D-06) |
| Uncommitted-files detection | **Integration** | `defaultGitFn(cwd, ["status", "--porcelain"])` | New git call; fixed-arg seam |
| apply() wiring (register tools/commands, call domain+data) | **Integration** | `lib/core-tools.js` / `lib/commands.js` | The only place with ctx/fs/git |

**Security note:** The WIP commit message and any git call must use the fixed-arg seam (`defaultGitFn` with `-C cwd`), never a shell string — mirroring `_git-artifacts.js:14-16`. The `.continue-here.md` path is derived from ROADMAP via `_phaseDirName` (slugify), never from raw user input. `HANDOFF.json` is parsed with try/catch and degrades on corrupt input (D-09). No security-sensitive capability is placed in the wrong tier.

---

## 5. Validation Architecture

The phase is TDD (D-10), following `test/*.test.mjs` + `test/helpers/mount-harness.mjs` conventions, modeled on `test/learnings.test.mjs` (pure helpers + apply mount + config-gated hook + never-blocks). [VERIFIED: test/learnings.test.mjs:1-12]

**Pure-helper unit tests** (no ctx/fs/git — mirror learnings.js/graphify.js):
- Phase detection: given a phase-dir listing, returns the active phase (most recent with PLAN.md) vs default.
- HANDOFF.json building: given gathered state, produces the exact schema (OQ-2).
- `.continue-here.md` template: given gathered state, produces markdown containing all six D-08 sections.
- Resume consumption: given a HANDOFF.json, produces the status + next-action text.
- Fallback detection: given a file listing, detects PLAN-without-SUMMARY and `.continue-here` files.
- Async-jobs inclusion: given a jobs manifest, filters to non-terminal and maps to the handoff shape (OQ-3).

**Integration tests** (FakeFs + fake gitFn, via `mountSubset`/`makeMountCtx`):
- `gsd_pause_work` writes `HANDOFF.json` + `.continue-here.md` at the phase-dir path when a phase is active, and at `.planning/` root otherwise (D-02, D-03).
- `gsd_pause_work` commits a WIP commit via the fake gitFn (D-06).
- `gsd_resume_work` reads `HANDOFF.json`, presents status, updates Session Continuity (`stoppedAt`/`resumeFile`), and deletes `HANDOFF.json` (D-04, D-05).
- Fallback: resume with no HANDOFF but a PLAN-without-SUMMARY detects incomplete work.
- Advisory no-mutation: neither tool advances the STATE loop position (D-04).
- Error handling: no project → fail-fast throw; no HANDOFF + no incomplete work → clean "nothing to resume" (D-09).

**Mount-surface updates** (must land in the same phase or the suite fails — R-2):
- `test/mount.test.mjs`: `EXPECTED_TOOL_NAMES` 26→28, `EXPECTED_COMMAND_NAMES` 23→25, "absent capability" count 22→24 (if paired to gsdOrient).
- `test/_capabilities.test.mjs:64-67`: gsdOrient exact tools/commands assertion.

---

## 6. Project Constraints

From the codebase conventions (read this session):
- **Artefact model discipline (DUR-06):** all `.planning/` writes route through the gsdState artefact model (`ctx.fs` via `_write`), never raw `node:fs/promises`. [VERIFIED: lib/state.js:110-121, 501-503]
- **Fixed-arg git seam:** every git call uses `defaultGitFn(cwd, argsArray)` with `-C cwd`, never a shell string. [VERIFIED: lib/_git-artifacts.js:14-16]
- **Never-throw orientation surfaces:** `gsd_status`/`gsd_progress` degrade over missing/corrupt artefacts rather than throwing. [VERIFIED: lib/core-tools.js:188-194]
- **Pure-helper pattern:** domain logic is exported as pure functions (no ctx/fs/git params) for direct unit testing, mirroring learnings.js/graphify.js. [VERIFIED: lib/learnings.js:43-49, lib/graphify.js:31]
- **Capability surface is fixed at 21 keys** (D-01 no new capability). [VERIFIED: test/_capabilities.test.mjs:13]
- **Test conventions:** `node --test test/*.test.mjs`; FakeFs + mount-harness; no live boot/LLM/git/gh. [VERIFIED: package.json:31, test/learnings.test.mjs:10-12]

---

## Summary for the planner

The phase is well-bounded and needs **no new dependencies**. The single highest-priority decision is **OQ-1**: how to register `/gsd-pause-work` and `/gsd-resume-work` without a new capability — recommended resolution (A) pairs them to the existing `gsdOrient` capability. The other open questions (HANDOFF schema, async-job field mapping, `resumeFile` accessor, phase-detection helper) all have recommended resolutions. The phase must also update the mount-surface tests (`EXPECTED_TOOL_NAMES`/`EXPECTED_COMMAND_NAMES`/gsdOrient exact assertion) or the suite fails. All domain logic should be pure helpers (no ctx/fs/git) exported for direct unit testing, with I/O confined to `apply()` and the gsdState/git seams.
I have everything I need. Here is the complete RESEARCH.md for the phase.

---

# Phase 5: window-ledger — Research

**Researcher:** gsd-phase-researcher
**Date:** 2026-08-24
**Milestone:** loop-durability
**Phase:** 05-window-ledger (DUR-03, DUR-04)

## Purpose

Answer "what do I need to know to PLAN this phase well?" for adding two durable `.planning/` artefacts — the append-only `WINDOWS.md` multi-window ledger and the `async-jobs.json` registry — and surfacing both through `gsd_status`. Both are offline, zero-runtime-dependency, written/read through the `GsdState` artefact API, and surfaced read-mostly by `gsd_status`. This is a **pure storage + presentation** phase; there is no job runtime, no scheduler, and no network.

All findings below are grounded in the actual repo read this session. No new dependencies are proposed, so the package-legitimacy section is a short confirmation rather than a survey.

---

## Domain analysis

### The `GsdState` artefact service is the single write/read channel

Every durable artefact in the bundle goes through the `GsdState` service (`lib/state.js`), consumed via `ctx.get("gsdState")` in every phase tool. It wraps the host `fs` service with path helpers and helpers:
- `_planning(cwd)` → `.planning`, `_phases(cwd)` → `.planning/phases` [VERIFIED: `lib/state.js:41-42`]
- `_read(absPath)` returns `undefined` for absent files (no throw) [VERIFIED: `lib/state.js:70-75`]
- `_write(absPath, content)` ensures the parent dir before writing [VERIFIED: `lib/state.js:77-96`]
- Per-phase artefacts use `writeArtifact/readArtifact/hasArtifact/removeArtifact` keyed by phase+name, and `_artifactFile` maps `(PLAN|SUMMARY|CHECKPOINT)-<PP>` → `<base>-<PP>-<SUFFIX>.md` [VERIFIED: `lib/state.js:364-402`]

**Important design signal:** the ledger (`WINDOWS.md`) and the jobs registry are **root-level `.planning/` artefacts, not per-phase artefacts** (D-02). So they are NOT stored through the `writeArtifact(phase, ...)` path. They need **dedicated accessors on `GsdState`** that write directly under `.planning/`, exactly like the existing root-level accessors (`readState`, `readRoadmap`, `readConfig`). This is the "dedicated accessor, not a per-phase artefact" constraint in D-02. Confidence: high.

- The existing root-level accessor pattern to imitate: `readRoadmap`/`writeRoadmap` at `lib/state.js:310-318` and `readConfig` at `lib/state.js:335-339` (which already does `JSON.parse` with a try/catch default — the exact pattern the async-jobs corrupt-handling should copy) [VERIFIED: `lib/state.js:335-339`].

### gsd_status is the presentation surface to modify

`gsd_status` (`lib/core-tools.js:83-118`) reads STATE.md + ROADMAP.md, builds a `lines` array, and returns it as a string. Current tail of the render:
- `## Recent Decisions` block
- `## Blockers / Concerns` block
- a bare `Stopped at: ${...}` line (line 114) — there is **no literal `## Session Continuity` header** in the current rendering [VERIFIED: `lib/core-tools.js:96-115`].

D-05 says "The existing 'Session Continuity' block stays." The existing continuity info is the `Stopped at:` line. Decision (RESOLVED, see OQ-4): keep that line and add the two new sections `## Windows` and `## Async Jobs`; do not disturb continuity rendering. This is a pure string-assembly change.

### The bundle is zero-runtime-dependency

`_shared.js` provides a YAML-subset frontmatter parser (`parseFrontmatter`/`stringifyFrontmatter`) — it handles flat scalars, flow arrays, one level of nesting, and fenceless tolerance [VERIFIED: `lib/_shared.js:51-173`]. It is **not** a general YAML or JSON parser. `parseRequirements`/`parseRoadmap` are bespoke line parsers [VERIFIED: `lib/_shared.js:179-262`]. There is no YAML/JSON dependency anywhere [VERIFIED: `package.json` deps = only `@deepseek-ai/dsh-tools`; a grep for any ledger code returns nothing].

**Implication for D-04:** because the manifest must be parsed without a dependency, a **JSON array is the natural zero-dep shape** — `JSON.parse`/`JSON.stringify` are built-in. The frontmatter parser is the wrong tool for an arbitrary list of job objects (it would mangle nested arrays of objects). This resolves D-04 to `.planning/async-jobs.json` (JSON array). Confidence: `[VERIFIED]` on the parser limitation, `[ASSUMED]` (open design choice) on the JSON choice — but it is strongly implied by "zero-dep" + "machine-readability preferred" in D-04.

### Checkpoint-`<PP>` artefacts to link (D-07)

Phase 4 added per-plan `CHECKPOINT-<PP>` artefacts via `writeArtifact` → `<base>-<PP>-CHECKPOINT.md`, frontmatter `{ plan, last_completed_task, checkpoint_reason, committed_hashes }` [VERIFIED: `lib/execute.js:137-142`, `lib/state.js:364-368`]. The executor prompt already instructs returning structured checkpoint state on `checkpoint:*` tasks [VERIFIED: `lib/_agents.js:158,160,170`]. A WINDOWS.md entry may carry a `CHECKPOINT-<PP>` link by name; the ledger and the checkpoint are complementary (window-level history vs task-level resume). No coupling required — a window entry just stores the name.

### Sequence numbering

Both artefacts use incrementing ids: `WIN-<seq>` and `JOB-<seq>`. The bundle's only id-generation precedent is zero-padding plan numbers via `zeroPad` [VERIFIED: `lib/_shared.js:14-16`]. For append-only files, the safe seq derivation is: read existing entries, take `max(existing seq) + 1`; absent/malformed file starts at 1. No counter needs to live in STATE.md. Confidence: `ASSUMED` (design choice, no existing precedent).

### Provenance of the "no runtime" constraint

The async-jobs manifest explicitly does NOT execute work — "It does NOT execute background work — the bundle has no job runtime" (D-03), and the CONTEXT "Out of scope" reiterates "A real background-job runtime/executor (the manifest is a registry only)". The repo confirms: no scheduler, no jobs service; `spawnSubagent` in `_runner.js` is a synchronous await of the in-process spawn provider [VERIFIED: `lib/_runner.js:9-34`]. Confidence: `VERIFIED` (by inspection).

---

## Package legitimacy

**No new packages are proposed for this phase.** The phase is explicitly "All offline, zero-dep" (CONTEXT domain). Everything needed is built into Node:
- `JSON.parse` / `JSON.stringify` for the async-jobs manifest — built-in, no claim to verify. [VERIFIED: `lib/state.js:338` already uses `JSON.parse`]
- `parseFrontmatter` / `stringifyFrontmatter` from `lib/_shared.js` — in-repo. [VERIFIED: `lib/_shared.js:51-173`]
- `node:fs/promises` for real-fs unlink/mkdir already used (`lib/state.js:84,398`) — built-in.

If any executor is tempted to add a YAML or lowdash dependency, it is **not needed** — the JSON array + the existing frontmatter helpers fully cover the shape. No third-party registry lookups were required.

---

## Risks

1. **Corrupt/unparseable artefacts must degrade, not crash.** D-06 is explicit: `gsd_status` must render a short warning line, never throw, when the ledger or manifest is corrupt. Risk: a naive `JSON.parse` in `gsd_status` (or a naive read in the accessors) throws and kills the orientation surface. Mitigation: read accessors (`readWindows`/`readJobs`) are the single choke point and return `[]` on any parse failure; `gsd_status` only renders what accessors return, plus an optional "corrupt" flag the accessor surfaces. Copy the `readConfig` try/catch-default pattern. Confidence: this is the highest-blast-radius risk in the phase. Severity: **High** (but fully controllable in the accessors).

2. **Missing files must render as an empty section, not an error.** D-06: "Absence = empty section." The `_read` helper already returns `undefined` for absent files [VERIFIED: `lib/state.js:70-75`]; the accessors convert that to `[]`, and `gsd_status` renders `no windows recorded` / `no jobs`. Straightforward, but must be a real decision so the executor doesn't throw.

3. **Append-only integrity.** WINDOWS.md is append-only (D-01). A reader that also computes the next seq and rewrites the whole file risks clobbering concurrent appends. For this phase (single process, synchronous tools) read-modify-append is acceptable, but the accessor should be the ONLY writer and should append (preserve existing content + add the new entry) rather than replace. Confidence: `ASSUMED` design guard.

4. **Exactly where phase tools append windows/jobs is underspecified.** D-01 says "Phase tools append an entry when a window closes or a resume happens" and D-03 says the manifest is "a registry the phase tools write to" — but CONTEXT does not enumerate which tools or when. This is the main ambiguity to pin down in planning (see OQ-2, OQ-3). It is NOT a blocker — the accessors + gsd_status surface are the durable core and are fully testable without choosing every call site.

5. **"Session Continuity block stays" vs actual rendering.** The CONTEXT references a "Session Continuity block"; the actual `gsd_status` renders a bare `Stopped at:` line (no header). If the planner reads the CONTEXT literally and adds sections, it might accidentally drop the continuity line. Mitigation: the researcher resolved OQ-1 — keep the existing continuity line and add `## Windows`/`## Async Jobs` before it.

---

## Open Questions

Every open question below is marked **(RESOLVED)** with the recommended resolution the planner should adopt.

- **OQ-1 — What exactly does "the existing Session Continuity block stays" mean, given the current code has no such header?** (RESOLVED: The current `gsd_status` renders a bare `Stopped at:` line at `lib/core-tools.js:114`. Resolution: keep that line untouched and append `## Windows` and `## Async Jobs` sections before it. Do not introduce a literal `## Session Continuity` header unless desired; the requirement is that continuity info is preserved.)

- **OQ-2 — Which tool(s) append `JOB-<seq>` entries, and with what lifecycle, given there is no runtime?** (RESOLVED: Provide `GsdState` accessors `readJobs`/`appendJob`/`updateJob` as the storage core. Wire **`gsd_execute`** as the concrete producer: when it dispatches an executor subagent, append a `JOB-<seq>` record (`kind: "subagent"`, `status: "running"`, started timestamp); when that executor settles, update its `status` to `done`/`failed` and set `completed` + `result`. Subagent spawns are the only "jobs" the bundle actually runs, so this makes the read-mostly surface meaningful and is fully testable via the existing `makeSubagents` fake. If a thinner scope is preferred, the accessors alone (with a unit test driving them) still satisfy DUR-04; but a real producer makes the "tracks background/scheduled jobs" requirement demonstrable.)

- **OQ-3 — Which tool(s) append `WIN-<seq>` window entries, and what is a "window close"?** (RESOLVED: A "window" is one `gsd_*` tool invocation (open at start, close at end), which is the natural unit in a bundle whose phase tools are synchronous. Provide `GsdState` accessors `readWindows`/`appendWindow`. Wire **`gsd_execute`** as the minimal producer: capture phase+step at entry, append a `WIN-<seq>` entry on completion with open/close phase+step and started/completed timestamps and a one-line summary; on the **resume** path, include the optional `checkpoint` reference to the resumed `CHECKPOINT-<PP>` artefact (D-07). Adding more phase tools later is a small wrapper; this phase needs at least one producer so DUR-03's write path is proven and testable.)

- **OQ-4 — JSON or markdown for the async-jobs manifest (D-04)?** (RESOLVED: `.planning/async-jobs.json` as a JSON array. `JSON.parse`/`JSON.stringify` are built-in and zero-dep, and the frontmatter parser cannot represent a list of arbitrary job objects. This directly satisfies D-04's "JSON array preferred for machine-readability with no parser dep".)

- **OQ-5 — How are `WIN-<seq>` / `JOB-<seq>` ids derived across appends?** (RESOLVED: read the existing file, take `max(existing numeric seq) + 1`; a missing or empty file starts at `1`. Kept purely append-derived so no counter must be persisted elsewhere.)

---

## Architectural Responsibility Map

Capability → tier assignment. A security-sensitive capability in the wrong tier is a blocker; nothing here is security-sensitive, so this is about correct separation.

| Capability | Tier | Placement | Notes |
|-----------|------|-----------|-------|
| WINDOWS.md read accessors (`readWindows`, `parseWindows`) | **Data** | `lib/state.js` (`GsdState`) | Root-level artefact read, parallel to `readRoadmap`. |
| WINDOWS.md write accessor (`appendWindow`) | **Data** | `lib/state.js` (`GsdState`) | The only writer; append-not-replace. |
| async-jobs.json read/write accessors (`readJobs`, `appendJob`, `updateJob`) | **Data** | `lib/state.js` (`GsdState`) | Copy the `readConfig` try/catch JSON pattern. |
| Corrupt/missing-file tolerance | **Data** | Accessors return `[]`; never throw | Single choke point so `gsd_status` stays crash-free (D-06). |
| Sequence (`WIN-<seq>`/`JOB-<seq>`) derivation | **Domain** | small pure helper in `lib/_shared.js` (e.g. `nextSeq(entries)`) | Reusable, unit-testable, no IO. |
| `gsd_status` rendering of `## Windows` / `## Async Jobs` | **Presentation** | `lib/core-tools.js` `gsd_status` execute | Reads accessors; renders `no windows recorded`/`no jobs`; keeps continuity line. |
| Window/job write-path call sites | **Integration** | `lib/execute.js` (resume + executor dispatch) | Calls the Data accessors; contains no parsing logic. |

**Blocker check:** none. The data-tier accessors encapsulate all IO and all failure tolerance, so a corrupt artefact can never crash the presentation layer. This is the correct placement. Confidence: verified against the existing root-accessor precedent.

---

## Validation Architecture

All tests are offline: `node --test` + `FakeFs` (`test/helpers/fake-fs.mjs`) + fake `subagents` (`test/helpers/project.mjs`, `test/tools.test.mjs makeSubagents`). No LLM, no git/gh. Each truth below is a candidate "must-have" for the Nyquist/coverage gate.

1. **Accessor round-trip.** `appendWindow`/`readWindows` and `appendJob`/`readJobs` write to `.planning/WINDOWS.md` and `.planning/async-jobs.json` and read them back losslessly. → `test/state.test.mjs` new describe, FakeFs, `svc` from `buildProject`. Asserts file exists at the exact path and parsed entries match. **[VERIFIED methodology]**

2. **Sequence increments.** Second append yields `WIN-02` / `JOB-02`; absent file yields `WIN-01` / `JOB-01`. → pure `nextSeq` unit test + accessor test. **[VERIFIED methodology]**

3. **Missing files → empty, not error.** `readWindows`/`readJobs` on a fresh project return `[]` (no throw); `_read` returns `undefined` for absent files [VERIFIED: `lib/state.js:70-75`]. → `test/state.test.mjs`.

4. **Corrupt file → `[]` + warning, not throw.** Write a bad `async-jobs.json`/`WINDOWS.md`, assert `readJobs`/`readWindows` return `[]` (mirroring `readConfig` catch at `lib/state.js:338`). **[VERIFIED methodology]**

5. **`gsd_status` renders the two new sections.** Seed entries via accessors, call real `gsd_status.execute` (`registerTool("core-tools","gsd_status")`), assert `/## Windows/`, `/## Async Jobs/`, and the entry lines. **[VERIFIED methodology: `test/tools.test.mjs:279-286`]**

6. **`gsd_status` empty/corrupt rendering.** Empty project → `no windows recorded` / `no jobs`; corrupt ledger → a short warning line (does not crash). **[VERIFIED methodology]**

7. **Continuity preserved.** The existing `Stopped at:` line still renders after the new sections are added. [VERIFIED current tail `lib/core-tools.js:114`]

8. **Resume linkage (D-07).** After a checkpoint resume, the appended window entry carries the `CHECKPOINT-<PP>` reference. → extend the existing gsd_execute resume test (`test/tools.test.mjs` "resume from checkpoint") to assert the ledger reference. [VERIFIED methodology]

**Gate:** the phase is done when both DUR-03 and DUR-04 read paths are delivered through the accessors, at least one write producer each is wired, `gsd_status` renders the two sections (missing/corrupt degrade to a message, not a crash), and `npm test` passes on a clean checkout.

---

## Project Constraints

From `.planning/PROJECT.md` (opengsd-core reimplementation) and CONTEXT.md, binding on the planner:
- **Faithful `.planning/` artefact schema.** New files follow the established naming (`WINDOWS.md`, `async-jobs.json` at `.planning/` root). [CITED: PROJECT.md]
- **Zero runtime dependencies.** No YAML library; use `parseFrontmatter`/`stringifyFrontmatter` or built-in `JSON.parse`. [CITED: CONTEXT code_context]
- **All offline.** No network/registry access needed or expected. [CITED: CONTEXT domain]
- **Dedicated accessor on GsdState, not a per-phase artefact.** D-02. [CITED: CONTEXT D-02]
- **Registry-only jobs.** No job runtime; the manifest represents planned/scheduled jobs surfaced read-only by `gsd_status`. [CITED: CONTEXT D-03 + out-of-scope]
- **Append-only ledger.** One entry per closed window; appended on close/resume. [CITED: CONTEXT D-01]
- **gsd_status is an orientation surface and must not crash** over a bad or missing ledger; absence = empty section, corrupt = short warning line. [CITED: CONTEXT D-05/D-06]
- **Fail-loud is for gsd_execute/gsd_ship preflight, not for gsd_status reads.** The bundle uses named fail-loud errors elsewhere (`gsd_execute: invalid CHECKPOINT-<PP>`), but D-06 explicitly exempts gsd_status's surface from throwing. [CITED: CONTEXT D-06; verified precedent `lib/execute.js:108`]

Deferred (do not build): a real job runtime/scheduler; the conversational UAT loop; capability gates; per-plan worktrees; `gsd_map_codebase --query` intel mode. [CITED: CONTEXT deferred]
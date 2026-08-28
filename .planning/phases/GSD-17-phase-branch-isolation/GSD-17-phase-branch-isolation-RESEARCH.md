Now I have everything needed. Here is the full RESEARCH.md content:

```markdown
# GSD-17-phase-branch-isolation — RESEARCH.md

**Researcher:** gsd-phase-researcher (fresh context)
**Phase goal:** Acquire a per-phase feature branch (phase-<N>) at gsd_discuss and have each phase tool commit its planning artefacts, so gsd_ship preflight passes on a clean feature branch without manual intervention.
**Requirement:** CQ-07

---

## 1. Domain analysis

### Standard stack & pattern
The whole bundle invokes `git` through `node:child_process` — there is no external git library anywhere in the project. Two established invocation styles already exist and are the canonical patterns for this phase to reuse:

- **Async** — `lib/ship.js` uses `promisify(execFile)` with a `run(cwd, cmd, args)` wrapper, a strict `git(cwd, args)` and a best-effort `gitOk(cwd, args)` (returns `""` on failure). This is what ship preflight runs under. [VERIFIED: lib/ship.js:21-34]
- **Sync best-effort** — `lib/map-codebase.js` `gitAddCommit` uses `execFileSync("git", ["-C", cwd, ...])` with `stdio:"ignore"` and swallows every failure, returning `false`. This is the precedent for auto-commit tolerance (D-06). [VERIFIED: lib/map-codebase.js:59-67]
- **Injectable git seam** — `lib/gates.js` `fetchGitData(cwd, gitFn, base)` accepts an injectable `gitFn(cwd, argsArray)`, explicitly "mirroring ship.js's git() helper — callers pass gitFn(cwd, argsArray)" so it can be unit-tested without a real git. This is the testability precedent for the new branch/commit helpers. [VERIFIED: lib/gates.js:223-228]

**Recommendation:** the new `ensurePhaseBranch` and `commitArtifacts` helpers should take an injectable `gitFn(cwd, argsArray)` (like `fetchGitData`), default to the async `promisify(execFile)` implementation (like ship.js, not the sync one in map-codebase), and be unit-tested with a fake gitFn. Confidence: **high** — the repo already proves this exact seam works under `node --test`.

### Git semantics that matter (standard, high confidence)
- `git checkout -b phase-N` creates the branch from the current HEAD and **carries uncommitted working-tree changes and untracked files onto the new branch** rather than stashing them — this is exactly the D-09 "dirty tree at discuss start" requirement. Confidence: **high** (standard git; also the current repo is dirty at discuss-start, see §5).
- `git rev-parse --abbrev-ref HEAD` returns the current branch; on a fresh repo it returns the unborn-branch name — ship.js already treats an empty result as "could not determine current branch". [VERIFIED: lib/ship.js:86-89]
- `git symbolic-ref refs/remotes/origin/HEAD --short` returns `origin/main`; ship strips the `origin/` prefix and falls back to `"main"` when it fails. D-02's base fallback mirrors this exact expression. [VERIFIED: lib/ship.js:87]
- Default-branch detection is a **two-step** expression in ship.js (explicit `args.base` → `symbolic-ref origin/HEAD` → `"main"`), and again in gates.js (line 232). D-02's "fall back to main" should reuse the same fallback. [VERIFIED: lib/ship.js:87, lib/gates.js:232]

### Protected-branch regex
Ship's branch gate rejects `main|master|develop|trunk|release/*` plus the current default branch. `phase-<N>` (unpadded N, no project-code prefix) does **not** collide with that regex, so it is a safe feature-branch name. [VERIFIED: lib/ship.js:89]

### Pitfall — branch name vs artefact directory name are different strings
The **branch** is `phase-<N>` with unpadded N (requirement CQ-07 wording "phase-<N>", D-01). The **artefact directory** is `<project_code>-<zeroPad(N)>-<slug>` — e.g. `GSD-17-phase-branch-isolation` — built by `state._phaseDirName`. [VERIFIED: lib/state.js:422-429] The planner must not derive the branch name from the artefact dir name.

### Pitfall — STATE.md is mutated by every phase tool
Every phase tool writes to `.planning/STATE.md` through `setActivePhase` (updates status/active_phase/next_action) and `addDecision` (appends to Recent Decisions). `setActivePhase` and `addDecision` both call `writeState`. [VERIFIED: lib/state.js:267-270, 293-303, lib/discuss.js:135-136, lib/plan.js:61,149, lib/execute.js:209-212, lib/verify.js:91]. Because ship preflight's clean-tree gate is `git status --short` (a full-tree check, not a per-file one), **a commit helper that stages only the phase artefact directory would leave STATE.md dirty and fail ship**. `commitArtifacts` must therefore stage `.planning` as a whole (exactly what ship.js step 10 does) — not just the phase dir. Confidence: **high** (direct consequence of the full-tree clean gate).

---

## 2. Package legitimacy

**No new dependency is required for this phase.** [VERIFIED: package.json — `dependencies: {}`; the only peers are `@deepseek-ai/dsh-tools`, `@deepseek-ai/schemastery`, `@deepseek-ai/cordis`, `@deepseek-ai/dsh-llm`, all already in use]. Git is invoked via:
- `node:child_process` `execFile`/`promisify` — Node.js standard library. [VERIFIED: lib/ship.js:11-12]
- `node:child_process` `execFileSync` — Node.js standard library. [VERIFIED: lib/map-codebase.js:25]

Nothing to install. No external npm package claims to verify. The only "API surface" is the git CLI, whose commands (`checkout -b`, `rev-parse`, `symbolic-ref`, `status --short`, `add`, `commit`, `diff --cached --name-only`) are all already used verbatim elsewhere in the repo, so their exact flag spelling is VERIFIED from in-repo usage rather than assumed.

---

## 3. Risks & Open Questions

### Risks
- **R1 — STATE.md left dirty → ship preflight clean-tree gate fails** (the core trap). Mitigation: `commitArtifacts` stages `.planning` wholesale (mirrors ship step 10), guaranteeing STATE.md + phase dir are both captured. [VERIFIED: lib/ship.js:82-83, 186-193]
- **R2 — branch created off the wrong base.** If `git checkout -b phase-N` runs while on an unrelated feature branch, the new branch forks off that, not off main. D-01 guards this by failing loudly when on a non-base branch. The "base" determination must use the same default-branch expression as ship (origin/HEAD → main). 
- **R3 — `git checkout -b` in a dirty tree is correct but surprising.** It carries uncommitted/untracked files (D-09). This is intended, but the helper should not `git stash` or reset — that would violate D-09/D-10.
- **R4 — best-effort commit swallowing a real error.** D-06 says swallow git-unavailable/no-identity/nothing-staged. But a commit failure on a *healthy* repo must not be silently lost — the helper should distinguish "nothing to do" (warning, benign) from "git present but commit rejected" (still best-effort, but surface the cause in the warning). Follow ship.js `preflightError` cause-propagation style for the warning text. [VERIFIED: lib/ship.js:41-49]
- **R5 — async vs sync blocking.** Use async `promisify(execFile)` for the shared helper (ship.js style), not the sync `execFileSync` of map-codebase, so phase tools that `await` it don't block the event loop. [VERIFIED: lib/ship.js:21-27]

### Open Questions
- **OQ-1 — Must `commitArtifacts` stage STATE.md as well as the phase dir?** → **(RESOLVED)** Yes. Every phase tool writes STATE.md via `setActivePhase`/`addDecision` [VERIFIED: lib/discuss.js:135-136, lib/plan.js:61,149, lib/execute.js:209-212, lib/verify.js:91], and ship's clean gate is the full `git status --short` [VERIFIED: lib/ship.js:82-83]. Stage `.planning` wholesale (ship step 10 precedent, lib/ship.js:186). The planner must encode this.
- **OQ-2 — Where does `commitArtifacts` / `ensurePhaseBranch` live — on the gsdState service or a local helper?** → **(RESOLVED)** A local shared helper module, not the gsdState service. The service is intentionally fs-only and dependency-light (it `inject`s only `"fs"`; git is not a service concern) [VERIFIED: lib/state.js tail — `const inject = ["fs"]`]. A new `lib/_git-artifacts.js` (or similar) exporting `ensurePhaseBranch` + `commitArtifacts`, taking an injectable `gitFn`, matches `gates.js fetchGitData`'s seam [VERIFIED: lib/gates.js:228]. Both ship.js and map-codebase.js keep their own local git helpers today; a shared module consolidates them for the new flow.
- **OQ-3 — Where exactly in `gsd_discuss` does branch acquisition happen?** → **(RESOLVED)** At the start of `execute`, after `isProject` + `readRoadmap` + phase existence checks succeed, and **before** assembling/writing CONTEXT (so the write + commit land on `phase-<N>`). [Placement per D-01 "at the start of gsd_discuss"; insertion point verified at lib/discuss.js:69-79, writes begin at line 131.]
- **OQ-4 — Commit message format?** → **(RESOLVED)** Conventional-commit, matching the existing artefact commits in `git log` — e.g. `docs(planning): phase 16 context-budget artefacts` and `docs(planning): mark phase 16 complete`. Recommend `docs(planning): phase <N> <slug> <scope> artefacts` where scope ∈ discuss/plan/execute/verify (e.g. `docs(planning): phase 17 phase-branch-isolation discuss artefacts`). [VERIFIED: git log — `docs(planning): phase 16 context-budget artefacts`; `docs(planning): mark phase 16 complete`]
- **OQ-5 — Should `commitArtifacts` return the staged file list for logging?** → **(RESOLVED)** Yes — it's cheap and useful. Ship.js already collects the staged list via `git diff --cached --name-only` before committing [VERIFIED: lib/ship.js:189]. Return that list so the tool can log "committed: N artefacts" and the user sees exactly what shipped.

No Open Questions remain unresolved.

---

## 4. Architectural Responsibility Map

| Capability | Tier | Placement | Why |
|---|---|---|---|
| Acquire `phase-<N>` branch (`git checkout -b`/`rev-parse`/`symbolic-ref`) | **Integration** | New shared helper (`ensurePhaseBranch`) called at the top of `gsd_discuss` execute | Touches the real git CLI + process env; not presentation/domain. |
| Default-branch base detection (origin/HEAD → main) | **Integration** | Inside `ensurePhaseBranch`, reusing ship.js's expression | Must match ship preflight exactly or the wrong base forks the branch. |
| Best-effort commit of planning artefacts | **Integration** | New shared helper (`commitArtifacts`), called at the end of discuss/plan/execute/verify | Staging/committing `.planning` is git I/O; tolerance (D-06) lives here. |
| Return staged-file list for logging | **Integration** | `commitArtifacts` return value | Logging only; no security sensitivity. |
| No-op when on `phase-<N>` already / no-git workspace | **Integration** | Inside the helpers | Resume/re-discuss (D-01, D-10) and non-git (D-08) are edge cases of the same helpers. |
| Artefact write path (writeArtifact / STATE.md) | **Domain** | Unchanged `state.js` — reused by tools; commit helper is invoked *after* these writes | Writes stay in the fs-only service; git is a separate concern layered on top. |

**Security note:** the branch/commit helpers run `git` with **fixed argument arrays** (never a shell string) and `-C cwd`, mirroring ship.js / map-codebase.js. No user/model-supplied string is interpolated into a shell — this keeps the integration tier free of command-injection. Any deviation (building a shell command from `phase`, a scope word, or a message) would be a **BLOCKER**. [VERIFIED: lib/ship.js:26-34, lib/map-codebase.js:59-67]

---

## 5. Validation Architecture

The repo's test convention is **source-assertion + mock-seam unit tests, no real git/filesystem** (see `test/ship.test.mjs` header: "No real git or filesystem is touched"; `gates.js fetchGitData` is tested via an injected fake git). Follow that convention for this phase.

- **Static source assertions** (mirrors `test/ship.test.mjs`): assert `discuss.js` imports `ensurePhaseBranch`/`commitArtifacts` from the shared module and calls them; assert `plan.js`/`execute.js`/`verify.js` each import and call `commitArtifacts`; assert no inline `execFileSync("git",...)`/`promisify(execFile)` git logic is duplicated inline in the tools. This proves D-03 (shared helper, not per-tool duplication) and D-04 wiring.
- **`ensurePhaseBranch` unit tests** (fake `gitFn`): (a) already on `phase-7` → returns, issues **no** `checkout`; (b) on `main` with `origin/HEAD`=origin/main → issues `["checkout","-b","phase-7"]`; (c) on `main` with **no** origin/HEAD → falls back to `main` and still issues `checkout -b phase-7` (D-02); (d) on an unrelated feature branch `foo` → throws with the real cause (D-01, D-05); (e) git unavailable (`gitFn` rejects) → non-git no-op + warning, does not throw (D-08).
- **`commitArtifacts` unit tests** (fake `gitFn`): (a) happy path — stages `.planning`, `diff --cached --name-only` non-empty → issues `commit -m <conventional msg>`, returns staged list (OQ-5); (b) nothing staged (`diff --cached` empty) → warning, **no** `commit` (D-06); (c) `add` or `commit` rejects → best-effort warning, does not throw (D-06); (d) message format matches the conventional-commit regex.
- **CQ-07 end-to-end proof**: a test that wires `ensurePhaseBranch` then `commitArtifacts` against a scripted `gitFn` and asserts the *sequence* of calls proves "branch acquired first, artefacts committed after, tree clean by ship." A real-git E2E is a nice-to-have but is **not** the repo convention; rely on the mock seam. Note verify.js's subagent is told "DO NOT commit it" for VERIFICATION.md [VERIFIED: lib/verify.js:78] — the *tool*'s `commitArtifacts` call is what commits it, and the test should assert that.

The Nyquist/coverage gate should map each behaviour (branch acquire, base fallback, stay-put, fail-loud, best-effort commit, staged-list return) to at least one of the above unit tests.

---

## 6. Project Constraints (from project conventions & config)

- `config.json`: `project_code: "GSD"`, `commit_docs: true`, `use_worktrees: true`, `nyquist_validation: true`, `pattern_mapper: true`. [VERIFIED: .planning/config.json] `commit_docs: true` supports auto-committing planning docs; `use_worktrees` concerns the deferred multi-window topology (out of scope per CONTEXT `<deferred>`).
- Conventional-commit subject lines and the `docs(planning):` prefix are the established style. [VERIFIED: git log]
- Tools resolve cwd once via the shared `cwdOf(exec)` (CQ-01/CQ-02); the new helpers must take `cwd` from that same resolution, never re-derive it. [VERIFIED: lib/_runner.js:98-99, lib/discuss.js:70]
- Best-effort git tolerance precedent is `gitAddCommit` in map-codebase (D-06); ship's `preflightError` is the precedent for surfacing a real cause (D-05). Both verified above.
- **Current repo state at research time:** on branch `main`, with a dirty tree (`M .planning/STATE.md`, `?? .planning/phases/GSD-17-phase-branch-isolation/`), and `origin/HEAD → origin/main`. This is exactly the D-09 dirty-at-discuss-start scenario the phase must handle. [VERIFIED: `git status` / `git symbolic-ref` this session] This also confirms the branch `phase-17` does not exist yet and will be created off `main`.

---

## 7. Key source locations (for the planner)

- `lib/ship.js:21-34` async git/`gitOk` helpers; `:41-49` `preflightError` cause propagation; `:81-91` clean-tree + branch + protected-regex + base fallback preflight; `:116` deferred push `-u origin branch`; `:186-193` `git add .planning` + commit + push completion state.
- `lib/map-codebase.js:59-67` best-effort `gitAddCommit` tolerance (D-06 precedent).
- `lib/gates.js:223-248` injectable `gitFn` seam + `symbolic-ref origin/HEAD` base detection.
- `lib/state.js:422-443` `_phaseDirName` / `phaseDirAndBase` (artefact dir ≠ branch name); `:459-464` `writeArtifact` returns file path; `:267-303` `addDecision`/`setActivePhase` (STATE.md mutation); tail — `inject = ["fs"]`.
- `lib/discuss.js:69-79` execute start (branch-acquire insertion point); `:131-136` CONTEXT/DISCUSSION-LOG writes + STATE advance (commit point).
- `lib/plan.js:85` RESEARCH write; planner writes PLANs directly at `${phaseDir}/${base}-<PP>-PLAN.md`; `:149` STATE addDecision.
- `lib/execute.js:152-157` SUMMARY write/checkpoint removal + STATE advance; `:209-212` setActivePhase.
- `lib/verify.js:78` verifier writes VERIFICATION.md (DO NOT commit); `:91` setActivePhase.
- `lib/_runner.js:98-99` `cwdOf`.
```
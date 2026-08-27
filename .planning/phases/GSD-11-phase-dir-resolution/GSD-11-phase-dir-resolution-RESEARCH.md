I have everything I need. Here is the full RESEARCH.md.

---

# RESEARCH.md — Phase 11: phase-dir-resolution

**Researcher:** gsd-phase-researcher
**Phase goal:** Resolve the phase directory and base once per tool invocation and pass them down, removing the repeated readRoadmap/readConfig and the duplicated base derivation.
**Requirement:** CQ-01

---

## 1. Domain analysis

### 1.1 The current redundancy (verified by reading the code)

The `gsdState` service in `lib/state.js` derives the per-phase directory and base name from `ROADMAP.md` + `config.json` on **every** artefact access. The derivation chain is:

- `_phaseDirName(cwd, phaseNum)` — `lib/state.js:422-429` — reads `ROADMAP.md` (via `readRoadmap`, line 423) **and** `config.json` (via `readConfig`, line 425), then returns the phase **name** (e.g. `GSDB-01-auth` or the fallback `phase-N`). **2 file reads.**
- `phaseDir(cwd, phaseNum)` — `lib/state.js:431-434` — calls `_phaseDirName` and returns `${phases}/${name}`. **2 file reads.**
- Each public artefact accessor (`writeArtifact`/`readArtifact`/`hasArtifact`/`removeArtifact`) — `lib/state.js:450-482` — calls **both** `phaseDir` (2 reads) **and** `_phaseDirName` again (2 reads) to get `base`. **4 file reads per accessor call.**
- `listPlans` — `lib/state.js:485-520` — calls `phaseDir` (2 reads) **and** `_phaseDirName` a second time (2 reads) in the same method (lines 486-488), **plus** one `hasArtifact` per plan (each 4 reads). A single `listPlans` over N plans does **4 + 4N** reads of ROADMAP.md + config.json.

The phase tools copy-paste the base derivation:
- `lib/plan.js:43-44`, `lib/execute.js:57-58`, `lib/verify.js:38-39`, `lib/ui.js:35-36` all do:
  ```js
  const phaseDir = await s.phaseDir(cwd, args.phase);
  const base = phaseDir.split("/").pop();
  ```
  Each is **2 reads** (one `phaseDir` call).

**Key insight [VERIFIED: lib/state.js:422-434]:** `_phaseDirName` returns a bare name with **no slashes** (it is `${prefix}${zeroPad(phaseNum)}-${slug}`). Therefore `(await this._phaseDirName(...)).split("/").pop()` is a **no-op** — `base === name` always. The `.split("/").pop()` is defensive but redundant. A single `phaseDirAndBase` that calls `_phaseDirName` once and derives both `dir` and `base` from that one name eliminates the redundancy with zero behavior change.

### 1.2 `ship.js` is NOT affected

`lib/ship.js` does **not** call `phaseDir` or derive `base` — it uses only `readArtifact(cwd, phase, 'SUMMARY-<PP>')` and `listPlans` (grep of `lib/ship.js` for `phaseDir|_phaseDirName|split("/").pop()` returns **zero** matches). The CONTEXT lists `ship` among the tools to update, but there is no `phaseDir + split('/').pop()` pattern in it to replace. **The planner should not spend a plan on `ship.js`** — its only interaction is through the public accessors, which are refactored internally. [VERIFIED: grep over lib/ship.js]

### 1.3 The phase-N fallback must be preserved

`_phaseDirName` (`lib/state.js:427`) resolves a phase number not present in the roadmap to slug `phase-${phaseNum}` (D-03). `phaseDirAndBase` wraps `_phaseDirName`, so the fallback is preserved automatically. No fail-loud change. [VERIFIED: lib/state.js:422-429]

### 1.4 Confidence

- **High** that the refactor is behavior-preserving: the accessors and tools are pure path-derivation + I/O; the change is mechanical and covered by 174 passing tests (baseline `npm test` = 174 pass / 0 fail, verified this session).
- **High** that `base === name` (no-split needed), from reading `_phaseDirName`'s return construction.
- **High** that `ship.js` is unaffected, from grep.

---

## 2. Package legitimacy

**No new dependencies.** This phase is a pure refactor of existing code in `lib/state.js` and the phase tools. The only imports involved are already present: `slugify`, `zeroPad` from `./_shared.js` (used by `_phaseDirName`/`_artifactFile`), and the `node:fs/promises` dynamic import already used by `removeArtifact` (`lib/state.js:478`). No registry verification needed. [VERIFIED: lib/state.js imports at lines 17-24; package.json has `"dependencies": {}`]

---

## 3. Risks and Open Questions

### Risks

- **R1 — Behavior drift in the accessors.** The refactor must keep the public signatures `(cwd, phaseNum, ...)` and the exact artefact filenames (`<base>-<PP>-PLAN.md`, `<base>-<PP>-SUMMARY.md`, `<base>-<PP>-CHECKPOINT.md`, `<base>-CONTEXT.md`, etc.). Mitigation: the existing `state.test.mjs` round-trip tests (lines 30-82, 303-328) assert exact basenames and round-trips; they must stay green.
- **R2 — `listPlans` per-plan `hasArtifact` reads.** D-04 only requires removing the *double* derivation *inside* `listPlans` (the `phaseDir` + `_phaseDirName` pair). The per-plan `hasArtifact` calls are separate accessor invocations and legitimately resolve once each — do not try to eliminate those (that would be a broader caching concern, deferred). [VERIFIED: lib/state.js:485-520]
- **R3 — Keeping the local `phaseDir` variable name.** The tools interpolate `phaseDir` and `base` into many template strings (e.g. `lib/plan.js:78,107,117,125`; `lib/execute.js:175`; `lib/verify.js:72,90,91`; `lib/ui.js:47`). To keep the diff minimal and avoid touching every string, the refactor should destructure into a local named `phaseDir` (the dir) plus `base`, e.g. `const { dir: phaseDir, base } = await s.phaseDirAndBase(cwd, args.phase);`. This is within Claude's Discretion (D-02 allows either "pass dir/base into the accessors or resolve internally"; the tools only need the values for their own prompt strings).

### Open Questions

- **OQ-1 (RESOLVED):** Should `phaseDirAndBase` call `_phaseDirName` once and derive both values from the single name? — **Yes.** `_phaseDirName` returns a slash-free name, so `base = name` and `dir = ${phases}/${name}`. One `_phaseDirName` call yields both. [VERIFIED: lib/state.js:422-434]
- **OQ-2 (RESOLVED):** Is the private `_artifactPath(dir, base, suffix)` helper new, or does the existing `_artifactFile` already serve that role? — **`_artifactFile(dir, base, suffix)` already exists** (`lib/state.js:444-448`) and does exactly the mapping (PLAN/SUMMARY/CHECKPOINT-<PP> → `<base>-<PP>-<TYPE>.md`, else `<base>-<suffix>.md`). The discretion allows keeping `_artifactFile` as the private helper; no new helper is strictly required. The planner may keep `_artifactFile` (recommended, minimal diff) or rename it to `_artifactPath` per the CONTEXT wording — either satisfies D-01.
- **OQ-3 (RESOLVED):** Does `phaseDir` itself need to change? — **No.** Keep `phaseDir(cwd, phaseNum)` as a public accessor (it may delegate to `phaseDirAndBase` internally, but its signature and return value stay identical). No caller outside the refactored accessors depends on its internals. [VERIFIED: only state.js and the four tools call phaseDir]
- **OQ-4 (RESOLVED):** How to prove CQ-01 ("resolved once") in a test? — **Spy on `_phaseDirName`** (or on `readRoadmap`/`readConfig`) and assert exactly **one** invocation per accessor call. The `FakeFs` helper (`test/helpers/fake-fs.mjs`) does not currently count reads, so the cleanest deterministic proof is a method spy on the service instance (see §5). This avoids modifying the shared `FakeFs` contract.

All Open Questions are **RESOLVED** — planning may proceed.

---

## 4. Architectural Responsibility Map

| Capability | Tier | Notes |
|---|---|---|
| `phaseDirAndBase(cwd, phaseNum)` accessor | **data** (gsdState service) | New public accessor on `GsdState` in `lib/state.js`. Owns the single `_phaseDirName` call. |
| `_phaseDirName` (roadmap+config → name) | **data** | Unchanged; the single source of the phase name. |
| `_artifactFile` / `_artifactPath(dir, base, suffix)` | **data** | Private path mapper; unchanged. |
| `writeArtifact`/`readArtifact`/`hasArtifact`/`removeArtifact`/`listPlans` | **data** | Refactored to call `phaseDirAndBase` once each. Public signatures stable. |
| Phase tools `plan`/`execute`/`verify`/`ui` | **presentation** (tool layer) | Call `phaseDirAndBase` once; use `dir`/`base` for their prompt strings. |
| `ship` | **presentation** | **No change** — no `phaseDir`/`base` derivation present. |

No security-sensitive capability is placed in the wrong tier. The path-derivation logic stays entirely in the data tier (`lib/state.js`); the tools only consume the resolved values. **No tier violation.**

---

## 5. Validation Architecture

The phase is a pure refactor, so the primary gate is **regression** (all 174 existing tests stay green) plus a **new targeted test** that proves CQ-01.

### 5.1 Regression (must stay green)
- `test/state.test.mjs` — exercises `writeArtifact`/`readArtifact`/`hasArtifact`/`removeArtifact`/`listPlans` round-trips and exact basenames (lines 30-82, 85-106, 108-227, 303-328). These prove the refactor is behavior-preserving.
- `test/tools.test.mjs` — exercises the phase tools (`gsd_plan`/`gsd_execute`/`gsd_verify`/`gsd_ui_phase`) against a fake host fs + fake subagents. The fake subagents write to hardcoded paths like `${CWD}/.planning/phases/01-auth/01-auth-01-PLAN.md` (`test/tools.test.mjs:114`), so the tools' `phaseDirAndBase` must still resolve to the same paths.
- `test/gates.test.mjs:339-345` — asserts `listPlans` is called before the push in `ship.js`; unaffected but confirms `listPlans` still works.

### 5.2 New tests for CQ-01 (resolve-once)
1. **`phaseDirAndBase` returns `{dir, base}` correctly** — for a roadmap phase (e.g. `{ dir: '/project/.planning/phases/01-auth', base: '01-auth' }`) and for the phase-N fallback (`base: 'phase-9'` when phase 9 is absent). Proves D-01 + D-03.
2. **Each accessor resolves once** — spy on `svc._phaseDirName` (wrap the bound method, count calls) and assert:
   - `writeArtifact` → 1 call
   - `readArtifact` → 1 call
   - `hasArtifact` → 1 call
   - `removeArtifact` → 1 call
   - `listPlans` → 1 call (was 2 before D-04)
   This directly proves CQ-01 and D-04. (Alternative: spy on `readRoadmap`/`readConfig` and assert 1 each.)
3. **Phase tools call `phaseDirAndBase` once** — optional; the tool-level tests already exercise the tools end-to-end. A lightweight assertion that `gsd_plan`/`gsd_execute`/`gsd_verify`/`gsd_ui_phase` still produce the same artefact paths (covered by existing `tools.test.mjs`) is sufficient; a dedicated spy on the tool path is nice-to-have.

### 5.3 Nyquist/coverage note
The new spy-based tests are the "truth" for CQ-01. The existing round-trip tests are the "truth" for behavior preservation. Together they cover the phase goal without needing a full re-run of the live harness.

---

## 6. Project Constraints

From `package.json` and the repo conventions:
- **ESM only** (`"type": "module"`); all `lib/*.js` are plain ESM with named exports `{ name, inject, apply }` for the Cordis plugin pattern. [VERIFIED: package.json:5; lib/state.js:616]
- **Test command:** `npm test` → `node --test test/*.test.mjs`. Baseline: 174 pass / 0 fail (verified this session). [VERIFIED: package.json:8]
- **No runtime dependencies** (`"dependencies": {}`); only `node:` builtins and `@deepseek-ai/dsh-tools` (peer). The refactor must not add imports. [VERIFIED: package.json:62-68]
- **Faithful `.planning/` schema** — artefact filenames must match the opengsd layout documented in `lib/state.js:5-15` (`<NN>-<slug>/<NN>-<PP>-PLAN.md`, etc.). The refactor must not change any filename.
- **Public accessor signatures are stable** (D-02) — `writeArtifact/readArtifact/hasArtifact/removeArtifact/listPlans` keep `(cwd, phaseNum, ...)`; no caller or test breaks.
- **Phase-N fallback preserved** (D-03) — a phase number absent from the roadmap resolves to `phase-N`; do not make it fail loud.

---

## 7. Recommended implementation shape (for the planner)

1. **`lib/state.js`** — add:
   ```js
   async phaseDirAndBase(cwd, phaseNum) {
     const name = await this._phaseDirName(cwd, phaseNum);
     return { dir: `${this._phases(cwd)}/${name}`, base: name };
   }
   ```
   Refactor `writeArtifact`/`readArtifact`/`hasArtifact`/`removeArtifact` to `const { dir, base } = await this.phaseDirAndBase(cwd, phaseNum);` then use `this._artifactFile(dir, base, suffix)`. Refactor `listPlans` to resolve `{ dir, base }` once (D-04). Optionally have `phaseDir` delegate to `phaseDirAndBase`.
2. **`lib/plan.js`, `lib/execute.js`, `lib/verify.js`, `lib/ui.js`** — replace the two-line `phaseDir` + `split('/').pop()` with `const { dir: phaseDir, base } = await s.phaseDirAndBase(cwd, args.phase);` (keeps the local `phaseDir` name so all template strings stay untouched).
3. **`lib/ship.js`** — no change.
4. **Tests** — add the §5.2 spy-based tests to `test/state.test.mjs`; keep all existing tests green.

---

*End of RESEARCH.md*
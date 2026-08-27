I've completed the research and written the RESEARCH.md. Here is the full file contents:

---

# Phase 13: gate-dispatch — Research

**Researcher:** gsd-phase-researcher
**Date:** 2026-08-27
**Phase goal:** Replace the gate name condition chain with an explicit dispatcher map and derive the commit scope from structured plan fields.
**Requirement:** CQ-03

---

## 1. Domain analysis

### 1.1 The gate dispatcher map (D-01, D-05, D-04)

**Current state** [VERIFIED: lib/gates.js:163-194, read this session]:
`runCapabilityGates` iterates `GATE_NAMES` and dispatches each gate via an
if/else-if chain on the gate name:

```js
// lib/gates.js:175-177
if (name === "security") result = securityGate(changedFiles);
else if (name === "broken_windows") result = brokenWindowsGate(changedFiles, contentMap);
else result = tddAuditGate(plans || [], commitSubjects);
```

and formats the report detail via a name-based ternary:

```js
// lib/gates.js:179-183
const detail =
  name === "tdd_audit"
    ? `${f.planId}: ${f.reason}`
    : `${f.file}: ${name === "security" ? `matched ${f.pattern}` : f.marker}`;
```

**Target** [CITED: CONTEXT.md D-01/D-05/D-04]: a module-level `GATE_DISPATCH`
constant mapping each gate name to `{ run, format }` — the evaluator and a
report-line formatter — invoked with a shared data object
`{ changedFiles, contentMap, plans, commitSubjects }`. A missing gate name in
the map throws (defensive fail-fast, D-04).

**Confidence: HIGH.** The three evaluators are pure, I/O-free, and already take
the exact inputs the shared data object carries:
- `securityGate(changedFiles)` — lib/gates.js:54
- `brokenWindowsGate(changedFiles, contentMap)` — lib/gates.js:95
- `tddAuditGate(plans, commitSubjects)` — lib/gates.js:127

The formatter for each gate consumes the first finding `f`:
- security → `` `${f.file}: matched ${f.pattern}` ``
- broken_windows → `` `${f.file}: ${f.marker}` ``
- tdd_audit → `` `${f.planId}: ${f.reason}` ``

`GATE_NAMES` (lib/gates.js:196) drives iteration, so the dispatcher keys must
align exactly with it: `["security", "broken_windows", "tdd_audit"]`.

**Pitfall:** the `skipped` branch (lib/gates.js:170-173) must remain outside the
dispatcher — a skipped gate never runs its evaluator and never blocks. The
dispatcher only handles enabled gates.

### 1.2 Structured commit-scope derivation (D-02, D-03)

**Current state** [VERIFIED: lib/gates.js:115-123, read this session]:
`planScope(planId)` splits the plan id string on `-` and takes `tokens[1]` as
phase and the last token as plan:

```js
function planScope(planId) {
  const tokens = String(planId).split("-");
  const phase = tokens[1];
  const plan = tokens[tokens.length - 1];
  return `${phase}-${plan}`;
}
```

**Target** [CITED: CONTEXT.md D-02/D-03]: `listPlans()` adds a structured
`phase` field to each plan object; `planScope(plan)` derives the scope from
`plan.phase` and `plan.plan`, never by parsing `plan.id`. `tddAuditGate`'s
signature consumes the structured plan objects (lib/gates.js:127-155).

**CRITICAL — scope format must stay zero-padded.** The commit-scope convention
is `{phase}-{plan}` with zero-padded segments, e.g. `(08-01)`
[VERIFIED: lib/_agents.js:157, read this session; test/gates.test.mjs:130,157].
The current `planScope` returns `"08-01"` because it parses the zero-padded id
(`GSD-08-x-01` → `08-01`). But the structured fields are **unpadded**:
- `plan.phase` = `String(phaseNum)` → `"8"` for phase 8
- `plan.plan` = `String(planNum)` → `"1"` for plan 01

So a naive `` `${plan.phase}-${plan.plan}` `` yields `"8-1"`, which would NOT
match the `(08-01)` commit subjects the tdd-audit gate regexes against
(lib/gates.js:132). **The planner MUST pad both segments to 2 digits in
`planScope`** (or store zero-padded `phase` in `listPlans`). This is the single
most likely correctness trap in the phase. See Open Question OQ-1.

**`plan` field is already structured and unpadded** [VERIFIED: lib/state.js:504]:
`plan: String(planNum)`. Consumers already pad at use site
(`String(p.plan).padStart(2, "0")` in lib/ship.js:104, `zeroPad(Number(p.plan))`
in lib/execute.js:97,110,174,200,221,226,233,265). So `planScope` padding is the
right place — do not change the stored `plan` field's padding.

**`phase` field addition is a one-line change** [VERIFIED: lib/state.js:504-519]:
`listPlans` builds the plan object at lib/state.js:504-519. Adding
`phase: String(phaseNum)` alongside `plan: String(planNum)` is trivial. The
`phaseNum` parameter is already in scope (lib/state.js:490).

**No full-object deepEqual on plan objects** [VERIFIED: grep test/ — only
field-level deepEqual on `requirements`, `files_modified`, `progress`]. Adding
a `phase` field to the plan object will NOT break existing state tests.

### 1.3 Test updates (D-03)

**Current tdd-audit tests pass `{ id, type }` plan objects**
[VERIFIED: test/gates.test.mjs:127,143,159; test/gates-ship.test.mjs:28,48,62,100,194,205]:
```js
const plans = [{ id: "GSD-08-x-01", type: "tdd" }];
```
These must be updated to the structured shape, e.g.
`{ id: "GSD-08-x-01", phase: "8", plan: "1", type: "tdd" }`, and the scope
assertions must still expect `(08-01)`.

**runCapabilityGates tests** [VERIFIED: test/gates.test.mjs:199-268,
test/gates-ship.test.mjs:23-121,147-221] pass `plans` arrays with `{ id, type }`
objects. These must also gain `phase`/`plan` fields so the dispatcher's
`tddAuditGate` receives structured plans.

**Static wiring tests** [VERIFIED: test/gates.test.mjs:329-360,
test/gates-ship.test.mjs:123-145] assert ship.js imports and call ordering —
unaffected by this phase (no ship.js change).

---

## 2. Package legitimacy

**No new dependencies are proposed.** This phase is a pure refactor of
`lib/gates.js` and `lib/state.js` plus test updates. The project has zero
runtime dependencies (`"dependencies": {}`, package.json:54) and this phase
introduces none. No package claims to verify.

---

## 3. Risks and Open Questions

### Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Scope format drift: structured `phase`/`plan` are unpadded, so a naive `${plan.phase}-${plan.plan}` yields `"8-1"` instead of `"08-01"`, breaking the tdd-audit regex against `(08-01)` commit subjects | **HIGH** | Pad both segments to 2 digits in `planScope` (OQ-1) |
| Dispatcher key drift from `GATE_NAMES` | Medium | D-04 defensive throw on unknown name; keys must equal `GATE_NAMES` exactly |
| Skipped-gate branch accidentally routed through the dispatcher | Medium | Keep the `skipped` early-continue outside the dispatcher (lib/gates.js:170-173) |
| `phase` field name collision with existing plan fields | Low | `listPlans` plan object has no `phase` field today (lib/state.js:504-519); no collision |
| Formatter signature mismatch (finding shape differs per gate) | Low | Each gate's formatter consumes only its own finding shape; keep formatters per-gate |

### Open Questions

**OQ-1 (RESOLVED): How does `planScope` preserve the zero-padded `08-01` scope format when deriving from structured fields?**
- **Blocking:** none — resolved by inspection.
- **Resolution:** `planScope(plan)` must pad both segments to 2 digits:
  `` `${String(plan.phase).padStart(2, "0")}-${String(plan.plan).padStart(2, "0")}` ``.
  This preserves the exact `(08-01)` format the tdd-audit gate regexes against
  (lib/gates.js:132) and the `{phase}-{plan}` convention (lib/_agents.js:157).
  Do NOT change the stored `plan`/`phase` field padding (consumers already pad
  at use site). [VERIFIED: lib/gates.js:115-123,132; lib/state.js:504;
  lib/_agents.js:157; test/gates.test.mjs:130,157]

**OQ-2 (RESOLVED): What is the exact `GATE_DISPATCH` entry shape and how is the shared data object threaded?**
- **Blocking:** none — resolved by inspection.
- **Resolution:** `GATE_DISPATCH` is a module-level constant keyed by gate name,
  each value `{ run, format }`:
  ```js
  const GATE_DISPATCH = {
    security:        { run: (d) => securityGate(d.changedFiles),
                       format: (f) => `${f.file}: matched ${f.pattern}` },
    broken_windows:  { run: (d) => brokenWindowsGate(d.changedFiles, d.contentMap),
                       format: (f) => `${f.file}: ${f.marker}` },
    tdd_audit:       { run: (d) => tddAuditGate(d.plans || [], d.commitSubjects),
                       format: (f) => `${f.planId}: ${f.reason}` },
  };
  ```
  `runCapabilityGates` builds `const data = { changedFiles, contentMap, plans, commitSubjects }`
  once, then for each enabled gate: `const entry = GATE_DISPATCH[name]; if (!entry) throw ...;`
  then `const result = entry.run(data)` and on fail `const detail = entry.format(result.findings[0])`.
  [VERIFIED: lib/gates.js:54,95,127,163-194]

**OQ-3 (RESOLVED): Where does `planScope` live after the refactor?**
- **Blocking:** none — resolved by inspection.
- **Resolution:** keep `planScope` as a module-private function in
  `lib/gates.js` (it is only used by `tddAuditGate`, lib/gates.js:131; no other
  callers — grep confirmed). Change its parameter from `planId` to `plan` and
  derive from `plan.phase`/`plan.plan`. [VERIFIED: grep planScope → only
  lib/gates.js:115,131]

---

## 4. Architectural Responsibility Map

| Capability | Tier | Notes |
|------------|------|-------|
| `GATE_DISPATCH` map (name → run/format) | **domain** | Pure, in-memory, deterministic; lives in lib/gates.js |
| `planScope(plan)` structured scope derivation | **domain** | Pure; lib/gates.js |
| `tddAuditGate(plans, commitSubjects)` structured consumption | **domain** | Pure; lib/gates.js |
| `runCapabilityGates` orchestration | **domain** | Pure; lib/gates.js |
| `listPlans()` `phase` field addition | **data** | lib/state.js — the structured plan source |
| Test updates (gates.test.mjs, gates-ship.test.mjs) | **test** | test/ |

No security-sensitive capability is misplaced. All gate logic stays in the
domain tier (pure functions), and the data source (`listPlans`) stays in the
data tier. **No tier violation.**

---

## 5. Validation Architecture

Automated checks that prove each behaviour (used for the Nyquist/coverage gate):

| Behaviour | Proof |
|-----------|-------|
| Dispatcher replaces the if/else-if chain | `runCapabilityGates` tests still pass with identical report lines (test/gates.test.mjs:199-268, test/gates-ship.test.mjs:23-121) |
| Detail formatter folded into dispatcher (D-05) | Report-line assertions unchanged: `security: fail — a/.env: matched .env`, `broken_windows: fail — src/a.js: TODO`, `tdd_audit: fail — GSD-08-x-01: missing test: ...` |
| Defensive throw on unknown gate (D-04) | New test: `GATE_DISPATCH` lookup for a name not in the map throws |
| Structured scope derivation (D-02) | `planScope({ phase: "8", plan: "1" })` → `"08-01"`; tdd-audit tests pass structured plans and still match `(08-01)` subjects |
| `listPlans` adds `phase` field | state.test.mjs listPlans tests assert `plan.phase === "8"` (or the phase under test) |
| tddAuditGate consumes structured plans (D-03) | Updated tdd-audit tests pass `{ id, phase, plan, type }` and assert scope `(08-01)` |
| No id-string parsing remains | grep confirms `planScope` no longer calls `.split("-")` on `plan.id` |
| Full suite green | `npm test` (node --test test/*.test.mjs) passes on a clean checkout (MOUNT-06) |

---

## 6. Project Constraints (from CONVENTIONS.md)

- **Plain ESM, zero runtime deps** — no new imports beyond Node builtins and
  existing internal modules. [VERIFIED: package.json:54, CONVENTIONS.md:8]
- **Module-level constants in `UPPER_SNAKE_CASE`** — `GATE_DISPATCH` follows
  this (like `GATE_NAMES`, `STEPS`, `COMMANDS`). [VERIFIED: CONVENTIONS.md:37]
- **2-space indent, single quotes, semicolons, `const`-only** — match by hand;
  no linter. [VERIFIED: CONVENTIONS.md:47-49]
- **Header comment** on any new module; this phase adds none (all edits are in
  existing files). [VERIFIED: CONVENTIONS.md:96]
- **Bug-pinning comments** in tests for regressions. [VERIFIED: CONVENTIONS.md:104]
- **Guard-clause errors** prefixed with tool name; the D-04 throw should read
  like `gsd_ship: no dispatcher entry for gate "<name>"` (or similar) to match
  the `gsd_ship preflight failed:` / tool-prefix style. [VERIFIED: CONVENTIONS.md:72-79,128]
- **`_`-prefixed private members** on `GsdState`; `planScope` is a module-private
  function in gates.js (not a class member), so no underscore needed.
  [VERIFIED: CONVENTIONS.md:38]
- **Test files `.test.mjs` under test/**, one file per unit-under-test.
  [VERIFIED: CONVENTIONS.md:16]

---

**Primary output:** `.planning/phases/GSD-13-gate-dispatch/GSD-13-gate-dispatch-RESEARCH.md`

**Key finding for the planner:** the single most important correctness trap is **OQ-1** — the structured `phase`/`plan` fields are unpadded (`"8"`, `"1"`), so `planScope` must pad both to 2 digits to keep producing `(08-01)` scopes that match the tdd-audit commit-subject regex. All three open questions are RESOLVED; the phase is ready for planning.
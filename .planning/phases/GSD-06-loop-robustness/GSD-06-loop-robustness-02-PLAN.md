---
phase: 06-loop-robustness
plan: 02
type: tdd
wave: 2
depends_on: ["06-loop-robustness-01"]
files_modified: ["lib/state.js", "lib/quick.js", "test/state.test.mjs", "test/service-tools.test.mjs"]
autonomous: true
requirements: ["DUR-06"]
user_setup: []
must_haves:
  truths:
    - "gsd_quick writes its TASK.md record through the gsdState artefact model (ctx.fs) via a new GsdState accessor, not raw node:fs/promises — proven by the gsd_quick service test running on pure FakeFs."
    - "The quick-record path stays .planning/quick/<date>-<slug>/TASK.md and the write is missing/parent-tolerant like the phase-5 accessors."
  artifacts:
    - path: "lib/state.js"
      provides: "GsdState.writeQuickRecord(cwd, dateSlug, entry) root-level accessor routing the quick-record write through ctx.fs via _write"
      min_lines: 8
      exports: ["writeQuickRecord"]
  key_links:
    - from: "lib/quick.js gsd_quick TASK.md write"
      to: "lib/state.js writeQuickRecord"
      via: "gsd_quick calls s.writeQuickRecord(cwd, `${today()}-${slug}`, entry) instead of node:fs/promises mkdir+writeFile; the node:fs/promises import is removed"
      pattern: "writeQuickRecord"
---
<objective>Fix DUR-06: route gsd_quick's TASK.md write through the GsdState artefact model via a new ctx.fs-backed accessor, mirroring the phase-5 root-level accessor pattern, and move the gsd_quick test onto FakeFs to prove the bypass is gone. Delivered as a TDD plan.</objective>

<context>
@lib/state.js — the phase-5 root-level accessor pattern readWindows/appendWindow/readJobs/appendJob/updateJob (lines 347-409), all routed through this._write (78-82); _planning(cwd) helper; _ensureParent (94-97) makes parents with a no-throw catch.
@lib/quick.js — gsd_quick execute (lines 33-61) writes TASK.md via raw `await import("node:fs/promises")` mkdir+writeFile at lines 55-57; dir built as `${s.planningRoot(cwd)}/quick/${today()}-${slug}` (line 40).
@test/service-tools.test.mjs — the existing gsd_quick test (lines ~193-199) runs on a real temp dir with a comment explaining it bypasses ctx.fs so the happy path cannot run on FakeFs.
@test/state.test.mjs — home for the new writeQuickRecord round-trip test; the phase-5 accessor round-trip tests are the pattern to follow.
</context>

<tasks>
  <task type="auto">
    <name>Task 1: Add GsdState.writeQuickRecord accessor + round-trip test (tracer)</name>
    <files>lib/state.js, test/state.test.mjs</files>
    <read_first>lib/state.js, test/state.test.mjs</read_first>
    <action>Per D-04, add a root-level GsdState accessor writeQuickRecord(cwd, dateSlug, entry) in lib/state.js, placed in a new "quick records" section alongside the phase-5 accessors (after updateJob, before the per-phase artefacts section). The accessor computes the target path `${this._planning(cwd)}/quick/${dateSlug}/TASK.md` and writes `entry` through `this._write(target, entry)` (state.js:78-82), which already calls _ensureParent for the missing-parent case with a no-throw catch. Per D-05 the path must be exactly .planning/quick/<date>-<slug>/TASK.md and the write must be missing/parent-tolerant exactly like the phase-5 accessors (it must not throw when the quick dir does not yet exist). Add a test in test/state.test.mjs on FakeFs: construct a GsdState, call writeQuickRecord(CWD, "2026-08-24-fix-typo", "# entry") on a CWD with NO prior .planning/quick dir, and assert the FakeFs file map contains `${CWD}/.planning/quick/2026-08-24-fix-typo/TASK.md` with content exactly "# entry", and that it does not throw. Reuse the existing FakeFs fixture helpers used by the other state.test.mjs accessor tests.</action>
    <verify>node --test test/state.test.mjs</verify>
    <acceptance_criteria>
      - node --test test/state.test.mjs exits 0
      - grep -n "async writeQuickRecord" lib/state.js matches
      - grep -n "quick/" lib/state.js matches
      - grep -n "writeQuickRecord" test/state.test.mjs matches
      - grep -n "TASK.md" test/state.test.mjs matches
    </acceptance_criteria>
    <done>The writeQuickRecord accessor routes the write through ctx.fs, tolerates an absent parent dir, and is proven by a FakeFs round-trip test.</done>
  </task>

  <task type="auto">
    <name>Task 2: Route gsd_quick through writeQuickRecord, drop node:fs/promises, convert the service test to FakeFs (D-04, D-05)</name>
    <files>lib/quick.js, test/service-tools.test.mjs</files>
    <read_first>lib/quick.js, test/service-tools.test.mjs</read_first>
    <action>Per D-04, in lib/quick.js replace the raw write at lines 55-57 (the `const fs = await import("node:fs/promises")`, the try/catch mkdir, and the fs.writeFile of `${dir}/TASK.md`) with a single call to the accessor: `await s.writeQuickRecord(cwd, `${today()}-${slug}`, entry)` where entry is the already-built record string (keep the entry construction unchanged). Remove the now-unused `node:fs/promises` import entirely. Keep the dir variable (line 40) since it is used in the return message. Per D-05 confirm the accessor keeps the path .planning/quick/<date>-<slug>/TASK.md. In test/service-tools.test.mjs, convert the existing gsd_quick test (currently a real temp dir) to run on pure FakeFs: run gsd_quick with a CWD rooted in the FakeFs fixture and assert the FakeFs file map contains `${CWD}/.planning/quick/<date>-<slug>/TASK.md` with the expected record content; delete the obsolete node:fs-bypass rationale comment now that the write routes through ctx.fs.</action>
    <verify>node --test test/service-tools.test.mjs</verify>
    <acceptance_criteria>
      - node --test test/service-tools.test.mjs exits 0
      - grep -n "writeQuickRecord" lib/quick.js matches
      - grep -n "node:fs/promises" lib/quick.js matches NOTHING (grep exits 1) — the bypass import is removed
      - grep -n "node:fs/promises" test/service-tools.test.mjs matches NOTHING where it stated the OQ-1 bypass rationale
      - grep -n "TASK.md" test/service-tools.test.mjs matches
    </acceptance_criteria>
    <done>gsd_quick writes through ctx.fs via the accessor; the service test runs on FakeFs proving the node:fs bypass is gone.</done>
  </task>
</tasks>

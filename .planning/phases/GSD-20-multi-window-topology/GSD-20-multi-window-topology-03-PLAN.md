---
phase: 20-multi-window-topology
plan: 03
type: execute
wave: 2
depends_on: ["GSD-20-multi-window-topology-01"]
files_modified: [lib/ui.js, lib/map-codebase.js, lib/quick.js, test/out-of-flow-commit.test.mjs]
autonomous: true
requirements: ["MW-03"]
must_haves:
  truths:
    - "Running gsd_ui_phase / gsd_map_codebase / gsd_quick during a phase auto-commits its .planning/ output onto the currently checked-out branch (phase-N during a phase), leaving the tree clean for gsd_ship preflight (MW-03 / D-09 via the shared commitArtifacts seam)."
    - "map-codebase's bespoke fixed-message 'docs: map existing codebase' gitAddCommit is removed and re-routed onto commitArtifacts with a message override (D-11), and the user-facing summary no longer claims the old message."
  artifacts:
    - path: "test/out-of-flow-commit.test.mjs"
      provides: "static wiring tests proving ui.js / map-codebase.js / quick.js route their out-of-flow write through commitArtifacts (import + exactly-one call + ordering) and that map-codebase's bespoke git commit is gone"
      min_lines: 40
      exports: []
  key_links:
    - from: "lib/ui.js gsd_ui_phase writeArtifact(cwd, args.phase, \"UI-SPEC\", ...)"
      to: "lib/ui.js commitArtifacts(cwd, args.phase, { scope: \"ui\", phaseName: phase.name })"
      via: "a new commitArtifacts call placed immediately after the UI-SPEC writeArtifact line, best-effort (D-10)"
      pattern: "commitArtifacts\\(cwd, args\\.phase, \\{ scope: \"ui\", phaseName: phase\\.name \\}\\)"
    - from: "lib/quick.js gsd_quick writeQuickRecord(cwd, ...)"
      to: "lib/quick.js commitArtifacts(cwd, null, { scope: \"quick\", message: ... })"
      via: "a new commitArtifacts call after the writeQuickRecord line with phaseNum null + a message override (D-11, D-12)"
      pattern: "commitArtifacts\\(cwd, null, \\{ scope: \"quick\""
---

<objective>
Route the three out-of-flow artefact writers — UI-SPEC (lib/ui.js, D-10), codebase-map (lib/map-codebase.js, D-11), and quick-task (lib/quick.js, D-11) — through the shared `commitArtifacts` seam so their `.planning/` outputs are auto-committed onto the currently checked-out branch (MW-03 / D-09), with a consistent message convention and one commit path (D-11/D-12). The seam's `message` override + null `phaseNum` support (added in Plan 01) is consumed here for the two phase-less writers (map, quick); ui.js reuses the existing per-type scope-token message shape that already fits (D-12). This closes the latent ship-blocker: today out-of-flow writes leave `.planning` uncommitted, which would trip gsd_ship's clean-tree preflight.
</objective>

<context>
@lib/ui.js (gsd_ui_phase execute, writeArtifact at line 58 — currently never commits; add commitArtifacts after it, D-10)
@lib/map-codebase.js (gitAddCommit at lines 81-89 with the fixed message "docs: map existing codebase"; call at line 343; summary message text at line 359; import of execFileSync at line 25; header comment line 18 — all re-routed/removed per D-11)
@lib/quick.js (gsd_quick execute, writeQuickRecord at line 58 — currently never commits the record; add commitArtifacts after it, D-11)
@test/_git-artifacts.test.mjs (the commitArtifacts message-override behavior under test — the seam Plan 03 consumes)
@test/phase-tools-git.test.mjs (the static-wiring test style to mirror — readFile + regex, no real git/fs)
@lib/_runner.js cwdOf, @lib/_shared.js slugify (the helpers already imported by these writers)
</context>
<tasks>
  <task type="auto">
    <name>Task 1: UI-SPEC auto-commit + static wiring test (tracer, MW-03 / D-09 / D-10)</name>
    <files>lib/ui.js, test/out-of-flow-commit.test.mjs</files>
    <read_first>lib/ui.js, lib/_git-artifacts.js, test/phase-tools-git.test.mjs</read_first>
    <action>
Read lib/ui.js. It currently imports `{ contextBudget }` from "./_shared.js" and `spawnSubagent, planningContext, cwdOf` from "./_runner.js", but NOT the shared git seam. Add `import { commitArtifacts } from "./_git-artifacts.js";`. In the `gsd_ui_phase` execute handler, immediately after the `await s.writeArtifact(cwd, args.phase, "UI-SPEC", r.output);` line (line 58), add `const commit = await commitArtifacts(cwd, args.phase, { scope: "ui", phaseName: phase.name });` — reusing the existing per-type scope-token message shape `docs(planning): phase <N> <slug> ui artefacts` that the seam already generates (D-12); do NOT pass a `message` override. This is best-effort (the seam never throws). The commit call must appear AFTER the writeArtifact line (and it is fine for it to precede the UI-checker/verify block). Optionally append a line to the returned text noting `UI-SPEC committed: ${commit.committed}` but keep the existing return structure otherwise intact.

Then create test/out-of-flow-commit.test.mjs — a new static-wiring test file mirroring test/phase-tools-git.test.mjs (import test, describe, assert from node:test / node:assert/strict, and `readFile` from node:fs/promises; a `readLib(file)` helper resolving `../lib/<file>` from import.meta.url). In it, for `lib/ui.js` assert: (a) it imports commitArtifacts from "./_git-artifacts.js"; (b) it calls `commitArtifacts(cwd, args.phase, { scope: "ui", phaseName: phase.name })` exactly once; (c) the index of that commitArtifacts call is GREATER THAN the index of `writeArtifact(cwd, args.phase, "UI-SPEC"` in the source (ordering).
</action>
    <verify>Run: cd /var/home/jatyeo/dev/dsh-gsd-bundle && node --test test/out-of-flow-commit.test.mjs — the ui wiring tests pass.</verify>
    <acceptance_criteria>
      - grep -n "commitArtifacts" lib/ui.js shows exactly one call with the literal `{ scope: "ui", phaseName: phase.name }`.
      - The string `commitArtifacts(cwd, args.phase, { scope: "ui", phaseName: phase.name })` appears exactly once in lib/ui.js.
      - node --test test/out-of-flow-commit.test.mjs exits 0.
    </acceptance_criteria>
    <done>gsd_ui_phase auto-commits its UI-SPEC via commitArtifacts after the writeArtifact, using the existing ui scope token, and the new static wiring test proves import + exactly-one call + write-then-commit ordering.</done>
  </task>

  <task type="auto">
    <name>Task 2: Re-route map-codebase commit onto commitArtifacts (MW-03 / D-11)</name>
    <files>lib/map-codebase.js, test/out-of-flow-commit.test.mjs</files>
    <read_first>lib/map-codebase.js (gitAddCommit lines 81-89, call line 343, summary line 359, import line 25, header comment line 18)</read_first>
    <action>
Read lib/map-codebase.js. It has a bespoke `gitAddCommit(cwd, dir)` function (lines 81-89) using synchronous `execFileSync("git", ["-C", cwd, "add", "--", ...])` + `execFileSync("git", ["-C", cwd, "commit", "-m", "docs: map existing codebase", "--", ...])`, called at line 343 as `const committed = gitAddCommit(cwd, ".planning/codebase")`. Per D-11, remove this bespoke path entirely and re-route through the shared seam: (1) delete the `gitAddCommit` function (lines 81-89); (2) remove the now-unused `import { execFileSync } from "node:child_process";` at line 25 (verifiable: execFileSync only appears in the deleted function); (3) add `import { commitArtifacts } from "./_git-artifacts.js";`; (4) replace line 343 with `const committed = (await commitArtifacts(cwd, null, { scope: "map", message: "docs(planning): codebase map" },)).committed;` — phaseNum `null` + a `message` override because map has no phase (D-11/D-12); (5) update the summary text at line 359 — it currently reads the old `committed ? "Committed: docs: map existing codebase." : ...` — to reference the new message `Committed: docs(planning): codebase map.` (RESEARCH risk 5); (6) update the header comment at line 18 (`It commits the map with "docs: map existing codebase" when it can.`) to the new message. Keep the surrounding `const committed` boolean usage in the summary intact (the seam returns `{ committed, ... }`).
</action>
    <verify>Run: cd /var/home/jatyeo/dev/dsh-gsd-bundle && node --test test/out-of-flow-commit.test.mjs test/phase-tools-git.test.mjs — including new map assertions; also grep confirms the bespoke commit is gone.</verify>
    <acceptance_criteria>
      - grep -c "gitAddCommit" lib/map-codebase.js == 0.
      - grep -c "execFileSync" lib/map-codebase.js == 0 (import removed with the deleted function).
      - grep -n "docs: map existing codebase" lib/map-codebase.js returns zero matches.
      - grep -n "docs(planning): codebase map" lib/map-codebase.js shows the new message in both the commitArtifacts call and the summary text.
      - Add test/out-of-flow-commit.test.mjs assertions for lib/map-codebase.js: imports commitArtifacts; doesNotMatch /gitAddCommit/; doesNotMatch /execFileSync\s*\(\s*["']git["']/; and doesMatch `commitArtifacts\(cwd, null, \{ scope: "map", message: "docs\(planning\): codebase map" \}\)` exactly once. node --test test/out-of-flow-commit.test.mjs exits 0.
    </acceptance_criteria>
    <done>map-codebase's bespoke synchronous commit is removed and re-routed through `commitArtifacts` with a `docs(planning): codebase map` message override, and its summary + header comment reference the new message.</done>
  </task>

  <task type="auto">
    <name>Task 3: Re-route quick-task record commit onto commitArtifacts (MW-03 / D-11)</name>
    <files>lib/quick.js, test/out-of-flow-commit.test.mjs</files>
    <read_first>lib/quick.js (gsd_quick execute, writeQuickRecord at line 58 — record write is never committed today)</read_first>
    <action>
Read lib/quick.js. It imports `{ slugify, today, nowIso }` from "./_shared.js" and `spawnSubagent, cwdOf` from "./_runner.js", and writes the quick record via `await s.writeQuickRecord(cwd, \`${today()}-${slug}\`, entry);` at line 58 but never commits it (the QUICK_PROMPT subagent commits only its own code change). Per D-11, add a shared-seam commit for the record: add `import { commitArtifacts } from "./_git-artifacts.js";`, and immediately after the `writeQuickRecord` line add `await commitArtifacts(cwd, null, { scope: "quick", message: \`docs(planning): quick ${today()}-${slug}\` });` — phaseNum `null` + a `message` override because quick has no phase and may run in a project-less / non-repo workspace (the seam no-throws there, D-06). Keep the `addDecision` best-effort block (line 59) and the return structure unchanged. The record auto-commit lands on the currently checked-out branch (phase-N during a phase per D-09).
</action>
<verify>Run: cd /var/home/jatyeo/dev/dsh-gsd-bundle && node --test test/out-of-flow-commit.test.mjs — the quick wiring tests pass.</verify>
<acceptance_criteria>
      - grep -n "commitArtifacts" lib/quick.js shows exactly one call with `{ scope: "quick"` and phaseNum `null`.
      - The string `commitArtifacts(cwd, null, { scope: "quick"` appears exactly once in lib/quick.js.
      - Add test/out-of-flow-commit.test.mjs assertions for lib/quick.js: (a) imports commitArtifacts; (b) calls `commitArtifacts(cwd, null, { scope: "quick"` exactly once; (c) the commitArtifacts call index is GREATER THAN the `writeQuickRecord(cwd,` index (ordering). node --test test/out-of-flow-commit.test.mjs exits 0.
      - cd /var/home/jatyeo/dev/dsh-gsd-bundle && node --test test/out-of-flow-commit.test.mjs test/phase-tools-git.test.mjs test/discuss-artifacts.test.mjs exits 0 (focused wiring regression on files this plan does not overlap; the full MOUNT-06 suite is re-confirmed at phase Verify after wave merging, since plan 02 edits test/_git-artifacts.test.mjs in this same wave).
    </acceptance_criteria>
    <done>gsd_quick auto-commits its TASK.md record via commitArtifacts after writeQuickRecord (phaseNum null + message override), proven by the static wiring test and a focused wiring regression.</done>
  </task>
</tasks>

---
phase: 59-review-fix-companion
plan: 03
type: execute
wave: 1
depends_on: []
files_modified:
  - lib/add-tests.js
  - lib/core-tools.js
  - test/gitfn-guards.test.mjs
autonomous: true
requirements: ["CLH-09"]
user_setup: []
must_haves:
  truths:
    - "When the live host throws on the ctx.gitFn property access, gsd_add_tests, gsd_pause_work, and gsd_next (advance branch) fall back to defaultGitFn and complete instead of crashing (per D-09)"
    - "Each guard replicates the exact template already established at lib/code-review.js:448-449 (let gitFn = defaultGitFn; try { gitFn = ctx.gitFn || defaultGitFn; } catch), with no inject-array change because gitFn is not a host service (per D-09/D-10)"
    - "The tool/command/capability/config surface is unchanged: 37 tools / 34 commands / 28 capability keys / 27 patch rows (per D-10)"
  artifacts:
    - path: "lib/add-tests.js"
      provides: "guarded ctx.gitFn fallback at the commitSourceFiles feed (line 336) using the canonical template"
      min_lines: 389
      exports: []
    - path: "lib/core-tools.js"
      provides: "guarded ctx.gitFn fallbacks at gsd_pause_work's gather (line 465) and gsd_next's advance branch (line 657) using the same template"
      min_lines: 690
      exports: []
    - path: "test/gitfn-guards.test.mjs"
      provides: "throwing-getter ctx.gitFn tests proving all three D-09 sites complete via defaultGitFn without crashing, simulating the live cordis host throw the plain fake ctx never reproduces"
      min_lines: 60
      exports: []
  key_links:
    - from: "lib/add-tests.js"
      to: "lib/_git-artifacts.js"
      via: "the guarded gitFn local feeds commitSourceFiles at line 337"
      pattern: "try \\{ gitFn = ctx\\.gitFn \\|\\| defaultGitFn; \\} catch"
    - from: "lib/core-tools.js"
      to: "lib/_git-artifacts.js"
      via: "guarded gitFn locals feed the porcelain status call (line 468) and both commitArtifacts calls (lines 495 and 657)"
      pattern: "try \\{ gitFn = ctx\\.gitFn \\|\\| defaultGitFn; \\} catch"
    - from: "test/gitfn-guards.test.mjs"
      to: "lib/add-tests.js and lib/core-tools.js"
      via: "Object.defineProperty throwing-getter ctx reproduces the live uninjected-property-access throw class"
      pattern: "defineProperty"
---

<objective>
Close the three live-host crash sites locked into scope by D-09: wrap the unguarded ctx.gitFn property accesses at lib/add-tests.js:336 (gsd_add_tests commit feed), lib/core-tools.js:465 (gsd_pause_work gather), and lib/core-tools.js:657 (gsd_next advance branch) with the exact guarded fallback used at lib/code-review.js:448-449, and prove each with a throwing-getter test that simulates the live cordis host throw. Wave-1 parallel plan — touches no file shared with plan 01/02; keep every commit green and verify against the scoped suites named below (the phase-level full-suite gate runs in plan 02 Task 3).
</objective>

<context>
@.planning/phases/GSD-59-review-fix-companion/GSD-59-review-fix-companion-CONTEXT.md
@.planning/phases/GSD-59-review-fix-companion/GSD-59-review-fix-companion-RESEARCH.md
@lib/code-review.js
@lib/add-tests.js
@lib/core-tools.js
@lib/_git-artifacts.js
@test/add-tests.test.mjs
@test/pause-resume.test.mjs
@test/next-integration.test.mjs
@test/helpers/mount-harness.mjs
@test/helpers/fake-fs.mjs
Research section that governs this plan: §1.6 (exact guard sites, the verbatim template, and the out-of-scope census table).
</context>

<tasks>
  <task type="auto">
    <name>Task 1: TRACER — guard gsd_add_tests + the throwing-getter test harness</name>
    <files>lib/add-tests.js, test/gitfn-guards.test.mjs</files>
    <read_first>.planning/phases/GSD-59-review-fix-companion/GSD-59-review-fix-companion-CONTEXT.md (D-09/D-10), .planning/phases/GSD-59-review-fix-companion/GSD-59-review-fix-companion-RESEARCH.md (§1.6), lib/code-review.js (lines 440-455 — the exact guard template and its comment), lib/add-tests.js (lines 320-345 — the guard site and its commitSourceFiles call at line 337), test/add-tests.test.mjs (the existing tool-mount + writer-subagent fixture pattern), test/helpers/mount-harness.mjs (makeMountCtx — a plain-object ctx that never throws on property access)</read_first>
    <action>
      1. lib/add-tests.js line 336: replace the bare `const gitFn = ctx.gitFn || defaultGitFn;` with the guarded fallback exactly as shaped at lib/code-review.js:448-449 — declare `let gitFn = defaultGitFn;` then wrap the ctx access in try/catch assigning `gitFn = ctx.gitFn || defaultGitFn` with a catch comment noting the not-injected fallback (mirror the wording of the code-review.js comment). Keep the commitSourceFiles call at line 337 and everything else in the file untouched. Do NOT add gitFn to any inject array — it is not a host service (D-09).
      2. Create test/gitfn-guards.test.mjs as an offline suite with a header comment matching repo convention (FakeFs + fake ctx; no live DSH boot, no LLM, no real git). Reuse the gsd_add_tests mounting + writer-subagent fixture pattern from test/add-tests.test.mjs to drive the tool's execute down to the commit step, but replace the usual `ctx.gitFn = fakeGit` assignment with a throwing getter: Object.defineProperty(ctx, "gitFn", { get() { throw new Error("gsd: gitFn accessed without inject"); }, configurable: true }) — this simulates the live cordis host throwing on an uninjected property access, which the plain fake ctx built by makeMountCtx never does (D-09's crash class).
      3. Assert the tool completes without throwing and degrades through commitSourceFiles's never-throws warning path (defaultGitFn against the fake cwd fails its git calls → committed false with a warning surfaced in the tool result/report), proving the guard routed to defaultGitFn instead of crashing (D-09).
    </action>
    <verify>node --test test/gitfn-guards.test.mjs — exit 0; node --test test/add-tests.test.mjs — exit 0 (existing suites unaffected)</verify>
    <acceptance_criteria>
      - grep -c "try { gitFn = ctx.gitFn || defaultGitFn; } catch" lib/add-tests.js returns exactly 1
      - node --test test/gitfn-guards.test.mjs exits 0, and its gsd_add_tests test asserts completion (no throw) under the throwing-getter ctx
      - node --test test/add-tests.test.mjs exits 0 (existing suites unaffected by the guard)
    </acceptance_criteria>
    <done>The add-tests live-crash site is guarded with the canonical template and proven by a test that reproduces the live throw class.</done>
  </task>

  <task type="auto">
    <name>Task 2: guard gsd_pause_work and gsd_next + census scope lock (D-10)</name>
    <files>lib/core-tools.js, test/gitfn-guards.test.mjs</files>
    <read_first>.planning/phases/GSD-59-review-fix-companion/GSD-59-review-fix-companion-CONTEXT.md (D-09/D-10), .planning/phases/GSD-59-review-fix-companion/GSD-59-review-fix-companion-RESEARCH.md (§1.6 census table), lib/core-tools.js (lines 419-512 gsd_pause_work execute and its porcelain status call at line 468; lines 648-664 gsd_next advance branch and the inline access at line 657), test/pause-resume.test.mjs and test/next-integration.test.mjs (mount patterns to reuse)</read_first>
    <action>
      1. lib/core-tools.js line 465 (inside gsd_pause_work's execute, feeding the porcelain git status call at line 468): replace the bare `const gitFn = ctx.gitFn || defaultGitFn;` with the same guarded template — `let gitFn = defaultGitFn;` plus try/catch assigning `gitFn = ctx.gitFn || defaultGitFn` with the not-injected catch comment. The existing try/catch around the status call (lines 467-470) already degrades uncommitted to [] when the default gitFn fails against a fake cwd.
      2. lib/core-tools.js line 657 (inside gsd_next's execute, advance:true branch): introduce the same guarded local immediately before the commitArtifacts call — `let gitFn = defaultGitFn; try { gitFn = ctx.gitFn || defaultGitFn; } catch { /* not injected — use default */ }` — and pass that local as commitArtifacts's fourth argument instead of the inline `ctx.gitFn || defaultGitFn`.
      3. Extend test/gitfn-guards.test.mjs: a gsd_pause_work execute test with the throwing-getter ctx asserting it completes and reports an empty uncommitted list (the porcelain catch path), reusing the mounting pattern from test/pause-resume.test.mjs; a gsd_next advance:true test with the throwing-getter ctx asserting it completes without throwing (commitArtifacts's warning path), reusing the pattern from test/next-integration.test.mjs.
      4. SCOPE LOCK (D-10): do NOT touch the other unguarded ctx.gitFn sites from the research census — lib/repair.js:441, lib/undo.js:227, lib/validate-phase.js:557, lib/phase-management-plugin.js:110, and the explicitly deferred lib/autonomous.js:291 (a follow-up quick task, not this phase). No inject array changes anywhere; no tool, command, capability, or config key is added or removed (37/34/28/27 must hold).
    </action>
    <verify>node --test test/gitfn-guards.test.mjs test/pause-resume.test.mjs test/next-integration.test.mjs — exit 0</verify>
    <acceptance_criteria>
      - grep -c "try { gitFn = ctx.gitFn || defaultGitFn; } catch" lib/core-tools.js returns exactly 2 (the gsd_pause_work and gsd_next sites)
      - grep -n "ctx.gitFn" lib/add-tests.js lib/core-tools.js shows no occurrence outside a try block (every remaining access is the guarded assignment)
      - grep -n "ctx.gitFn" lib/repair.js lib/undo.js lib/validate-phase.js lib/phase-management-plugin.js lib/autonomous.js still shows the census sites unchanged (out-of-scope sites untouched per D-10)
      - node --test test/gitfn-guards.test.mjs test/pause-resume.test.mjs test/next-integration.test.mjs exits 0
    </acceptance_criteria>
    <done>All three D-09 sites are guarded with the canonical template and test-proven against the live throw class; the four census sites and autonomous.js remain untouched per D-10.</done>
  </task>
</tasks>
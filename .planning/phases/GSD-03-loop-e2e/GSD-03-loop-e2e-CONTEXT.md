# Phase 3: loop-e2e - Context

**Gathered:** 2026-08-23T22:57:16.537Z
**Status:** Ready for planning

<domain>
## Phase Boundary
**In scope:** Prove the GSD loop runs end-to-end in a live DSH session: boot a fresh headless DSH session (DSH_HOME redirected to a writable path), have it run a small real demo phase through the full loop (Discuss → Plan → Execute → Verify → Ship) using real LLM subagents and real git/gh, and capture the produced real PR. MOUNT-06 npm test re-run in the booted context. The demo phase is a tiny non-destructive change shipped on its own feature branch.
**Out of scope:** Offline-harness-only verification (that is phases 1-2); per-plan worktrees; capability gates; async-jobs manifest / WINDOWS.md ledger / UAT loop; gsd_map_codebase --query intel mode; live-booting the web GUI profile (headless is the proof target).
</domain>

<decisions>
## Decisions
### Live session definition
- **D-01:** 'One full phase in a live session' means a freshly booted headless DSH session via `dsh --profile headless` with DSH_HOME redirected to a writable path (e.g. /tmp/dshhome). That booted session (a real deployment, not this orchestrator's own context) drives the loop and produces a real PR. This is the genuine end-to-end proof.
- **D-02:** The booted session must run the loop with real LLM subagents (researcher/planner/checker/executor/verifier spawn), real git and real gh — not the fake-subagents test harness. The PR is created via gh pr create against the real remote.
### Boot feasibility / fallback
- **D-03:** A genuine live boot is required (real LLM round-trip, real git/gh). If the booted session cannot be made to drive a full LLM phase in this sandbox, that limitation is recorded explicitly in VERIFICATION.md (the phase does NOT silently fall back to the offline harness).
- **D-04:** The .dsh read-only filesystem is handled by relocating DSH_HOME to a writable temp path. The relocated profile must have the @deepseek-ai peer packages + @dsh-gsd/bundle resolvable; a failing boot is surfaced as a blocker, not papered over.
### The e2e phase content
- **D-05:** A small, self-contained real demo phase is defined (a trivial, non-destructive tweak e.g. a README line or a code comment), run through the full loop by the booted session, and shipped as a real PR. The captured PR is genuine evidence.
- **D-06:** The demo phase's PR base is the repo default branch; it must not disturb the already-open PRs #1/#2 (uses its own feature branch).
### MOUNT-06 verification
- **D-07:** MOUNT-06 (npm test passes) is re-run inside the booted live context as part of the phase verification; the 56-test green baseline from phases 1–2 is corroborating evidence but the phase re-asserts it live.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### The bundle being live-mounted
- `cordis.patch.yml — the agent-loop override + 12 GSD plugin rows`
- `package.json — @dsh-gsd/bundle subpath exports; the bundle linked into headless/web profiles`
### Headless profile composition
- `~/.dsh/profiles/headless/package.json — bundles: [dsh-base, dsh-headless, @dsh-gsd/bundle]`
- `~/.dsh/profiles/headless/cordis.patch.yml — empty user layer`
### Live session boot mechanism
- `dsh CLI — --profile headless 'run the tests' answers one task and exits; --dump-config prints composed tree; DSH_HOME env override relocates profile root`
### Phase 1 deferral
- `.planning/phases/GSD-01-live-mount/GSD-01-live-mount-VERIFICATION.md — offline activation harness (D-01/D-05), deferred live boot to phase 03`
### Verification + shipping prerequisites
- `test/*.test.mjs — npm test (node --test) green at 56 tests across phases 1–2`
- `gh auth status / git remote origin — real git+gh available for a genuine PR`
</canonical_refs>

<code_context>
## Code Context
- This session is itself a live DSH session with the gsd_* tools active (gsd_init/discuss/plan/execute/verify/ship all work here).
- The .dsh directory is read-only (EROFS) in this sandbox; DSH_HOME must be redirected to a writable path (e.g. /tmp/dshhome) for any dsh CLI boot/prepare to succeed.
- dsh --profile headless --dump-config with DSH_HOME=/tmp/dshhome composes the profile and the GSD rows appear in the tree (verified this session).
- gh is authenticated (account jaaty) and git origin is github.com/jaaty/dsh-gsd-bundle.git — a real PR is creatable.
- The bundle has no runtime deps; the booted headless session needs the @deepseek-ai peer packages reachable from its node_modules (dsh-base, dsh-headless, dsh-tools, dsh-llm, etc.).
- npm test runs node --test test/*.test.mjs — currently 56 pass, 0 fail across the 7 test files.
</code_context>

<specifics>
## Specifics
- Run one full phase through the loop (Discuss → Plan → Execute → Verify → Ship) in a live session and capture the produced PR — MOUNT-05
- MOUNT-06: npm test passes on a clean checkout — re-run in the booted live context.
</specifics>

<deferred>
## Deferred Ideas
- Per-plan git worktrees — out of scope (shared tree + non-overlap guarantee).
- Capability gates (security/broken-windows/TDD-audit ship:pre etc.), async-jobs manifest, WINDOWS.md ledger, UAT conversational loop — later milestones, not this phase.
- gsd_map_codebase --query intel mode — separate milestone feature.
- Full live-boot of the web GUI profile (vs headless) — deferred; the headless session is the phase 3 proof target.
</deferred>


---

*Phase: 03-loop-e2e*
*Context gathered: 2026-08-23*
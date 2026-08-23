---
phase: 03-loop-e2e
plan: 01
subsystem: live-boot
tags: [MOUNT-05, live-boot, DSH_HOME, headless, e2e]
dependency_graph:
  requires: []
  provides:
    - "live-boot.sh — runnable relocated-headless live-boot recipe"
    - "live-boot-proof.txt — captured compose + live gsd_status boot evidence"
  affects:
    - "GSD-03-loop-e2e-02 (uses this proven boot to drive a full demo phase)"
tech-stack: [bash, dsh CLI, @deepseek-ai/dsh-app-boot, Ollama]
key-files:
  created:
    - ".planning/phases/GSD-03-loop-e2e/live-boot.sh"
    - ".planning/phases/GSD-03-loop-e2e/live-boot-proof.txt"
  modified: []
decisions:
  - "live-boot.sh materializes DSH_HOME=/tmp/dshhome with the headless profile (bundles package.json, a REAL []-array cordis.patch.yml user layer, an @dsh-gsd/bundle node_modules symlink, and a copied settings.yaml)."
  - "compose_check asserts >=12 @dsh-gsd/bundle/* rows and the agent-loop override, failing loudly otherwise (D-01/D-04)."
  - "boot_probe runs one gsd_status task in the booted headless session and records BOOT_EXIT (D-01/D-02), never silently falling back to the offline harness (D-03)."
  - "The whole relocate-compose-boot sequence runs inside one invocation because /tmp is ephemeral across bash calls (RESEARCH)."
metrics:
  duration: "2026-08-23"
  completed_date: "2026-08-23"
  actuals:
    tasks: 2
    commits: 3
status: complete
---

# Phase 03 Plan 01: live-boot — Summary

Proved the riskiest live slice of MOUNT-05 first: a relocated DSH_HOME at
/tmp/dshhome composes the headless profile with all 12 @dsh-gsd/bundle/* rows
applied, and a freshly booted headless session binds the gsd_status tool and
answers it with a real LLM round-trip (PHASE=3 step=execute, exit 0).

## What was built

- `live-boot.sh` — a runnable, executable bash driver that performs the whole
  relocate → compose → boot sequence in one invocation (functions
  `bootstrap_home`, `compose_check`, `boot_probe`, with an `all|compose|boot`
  mode switch).
- `live-boot-proof.txt` — captured evidence: compose row count (12), agent-loop
  override present, booted task's stdout (`PHASE=3 step=execute`), and
  `BOOT_EXIT=0`.

## Task results

- Task 1 (live-boot.sh): written, `bash -n` clean, all grep acceptance checks
  pass. Committed `e5a173e`.
- Task 2 (live-boot-proof.txt): the full boot run (compose + live gsd_status
  task) completed with `COMPOSE_OK` and `BOOT_OK` (exit 0). Proof captured and
  committed `86e5f9b`.

## Deviation (fixed during execution)

The initial `bootstrap_home` wrote a comment-only `cordis.patch.yml`. That
parses to YAML `null`, and `@deepseek-ai/dsh-app-boot`'s `loadOverlayPatches`
rejects it with "overlay ... must be a top-level YAML array of loader patch
entries", breaking the whole composition (compose_check reported 0 rows). The
script was fixed to write a real `[]` array (matching the shipped headless
user layer), after which compose reports 12 rows + the agent-loop override.
Committed as `9405538` (fix).

## Evidence (verbatim from live-boot-proof.txt)

```
GSD_BUNDLE_ROWS=12
agent-loop override: PRESENT (config.agents: [{ id: gsd }])
Booted session stdout (last non-empty line):
  PHASE=3 step=execute
BOOT_EXIT=0
```

This is genuine D-01/D-02/D-04 proof: a real headless DSH deployment (not this
orchestrator) bound the gsd_plan tool and completed a real LLM round-trip
(Ollama, deepseek-v4-flash:0731-cloud), with no offline-harness fallback.

## Requirements addressed

- MOUNT-05 — the live-boot preconditions for the full loop are proven live.
  (The full single-phase loop run belongs to GSD-03-loop-e2e-02.)

## TDD Gate Compliance

No TDD (test-driven) gate applies: config.json sets `tdd_mode: false`, and
this plan ships a bash boot recipe + captured evidence, not code under test.

## Known Stubs

None. No TODO/FIXME/placeholder left in live-boot.sh; no skipped tests.

## Threat Flags

`live-boot.sh` only composes and boots the headless profile; it does not push
to any remote or create a PR (that is the demo phase's own scope in plan 02).
The script copies `settings.yaml` from the real `~/.dsh` (contains no
secrets — the ollama bearer is inline and non-sensitive) and symlinks the
workspace bundle; no credential material is written. No shell injection risk
(a fixed task string, no user-controlled input interpolated into the dsh
invocation beyond the env override).

## Self-Check

- live-boot.sh exists, is executable, `bash -n` passes, and encodes the full
  relocate-compose-boot recipe. (PASS)
- live-boot-proof.txt exists and records 12 rows + agent-loop override +
  `PHASE=3 step=execute` + `BOOT_EXIT=0`. (PASS)
- Commits present: `e5a173e` (feat, Task 1), `9405538` (fix, compose),
  `86e5f9b` (feat, Task 2). (PASS)

## Self-Check: PASSED

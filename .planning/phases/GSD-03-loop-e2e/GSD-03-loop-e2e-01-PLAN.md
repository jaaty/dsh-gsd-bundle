---
phase: 03-loop-e2e
plan: 01
type: execute
wave: 1
depends_on: []
files_modified: [".planning/phases/GSD-03-loop-e2e/live-boot.sh", ".planning/phases/GSD-03-loop-e2e/live-boot-proof.txt"]
autonomous: true
requirements: ["MOUNT-05"]
user_setup: []
must_haves:
  truths:
    - "A relocated DSH_HOME (/tmp/dshhome) composes the headless profile and `dsh --profile headless --dump-config` prints all 12 @dsh-gsd/bundle/* insert rows plus the agent-loop row overridden to config.agents [{id: gsd}] (per D-04 relocation requirement)."
    - "A freshly booted headless session (`dsh --profile headless` with DSH_HOME=/tmp/dshhome) answers a gsd_* tool task (gsd_status) with exit 0 and real LLM output, proving live tool binding + LLM round-trip (per D-01/D-02)."
    - "The live-boot-proof.txt evidence file records the captured boot output (or an explicit boot failure/limitation), not a silent offline-harness fallback (per D-03)."
  artifacts:
    - path: ".planning/phases/GSD-03-loop-e2e/live-boot.sh"
      provides: "Runnable driver that relocates DSH_HOME to /tmp/dshhome, materializes the headless profile (bundles package.json, empty cordis.patch.yml, @dsh-gsd/bundle symlink, copied settings.yaml), verifies compose via --dump-config, and boots one gsd_* tool task — the reproducible live-boot recipe."
      min_lines: 60
      exports: []
    - path: ".planning/phases/GSD-03-loop-e2e/live-boot-proof.txt"
      provides: "Captured evidence of the live boot: dump-config row count, the booted task's stdout, and the exit code."
      min_lines: 5
      exports: []
  key_links:
    - from: "live-boot.sh (profile scaffold under /tmp/dshhome/profiles/headless)"
      to: "dsh CLI (dsh --profile headless --dump-config / --profile headless)"
      via: "DSH_HOME=/tmp/dshhome env override on each dsh invocation"
      pattern: "dsh --profile headless --dump-config"
---

<objective>Prove the riskiest live-boot slice first (per CONTEXT D-01/D-04): a relocated DSH_HOME at /tmp/dshhome composes the headless profile with all 12 @dsh-gsd/bundle/* rows applied, and a freshly booted headless session answers a gsd_* tool task with real LLM output — the genuine preconditions that MOUNT-05's full loop depends on. Produces a runnable live-boot.sh recipe and a captured proof file.</objective>

<context>@.planning/phases/GSD-03-loop-e2e/GSD-03-loop-e2e-RESEARCH.md, @~/.dsh/profiles/headless/package.json, @~/.dsh/settings.yaml, @cordis.patch.yml</context>

<tasks>
  <task type="auto">
    <name>Task 1: Tracer — write live-boot.sh (relocated profile compose + one real headless boot)</name>
    <files>.planning/phases/GSD-03-loop-e2e/live-boot.sh</files>
    <read_first>.planning/phases/GSD-03-loop-e2e/GSD-03-loop-e2e-RESEARCH.md</read_first>
    <action>Create the runnable bash script live-boot.sh under .planning/phases/GSD-03-loop-e2e/ that performs the WHOLE relocate-compose-boot sequence inside one invocation, because /tmp is ephemeral across separate bash calls (per RESEARCH). Steps it must take, in order, each implemented as a function so the compose and boot halves can be run separately:

(1) `bootstrap_home()`: create `/tmp/dshhome/profiles/headless/`; write a `package.json` there whose contents mirror `~/.dsh/profiles/headless/package.json` (bundles: ["dsh-base","dsh-headless","@dsh-gsd/bundle"]); write an empty `cordis.patch.yml` user layer (a comment-only or minimal file); create `node_modules/@dsh-gsd/bundle` as a symlink to the workspace bundle root; copy `~/.dsh/settings.yaml` to `/tmp/dshhome/settings.yaml` so the ollama provider + agent-default-model are inherited (RESEARCH: bearer inline in settings, no credentials file needed). Do NOT copy `.credentials.yaml`; healProfilesModuleFallback auto-populates `profiles/node_modules` peers on first boot.

2. `compose_check()`: run `DSH_HOME=/tmp/dshhome dsh --profile headless --dump-config`, then count occurrences of `@dsh-gsd/bundle/` and grep for the agent-loop row override (a `config.agents` list containing `id: gsd`). Print the count and the matching lines to stdout. Fail the script (exit non-zero) if fewer than 12 `@dsh-gsd/bundle/` rows or if the agent-loop override line is absent — per D-01/MOUNT-01.

3. `boot_probe()`: run `DSH_HOME=/tmp/dshhome dsh --profile headless '<task>'` where `<task>` instructs the agent to call the gsd_status tool and reply with a single line summarising its phase step (e.g. "Reply with exactly the output of the gsd_status tool: the current phase number and step."). Capture stdout and the exit code. Print `BOOT_EXIT=<code>` and the last non-empty stdout line.

The script must be executable, idempotent-safe (re-run recreates /tmp/dshhome), and print clear step banners. Do not include the settings copy from a path that may not exist — guard each source file with a presence check and print a skip notice if absent.</action>
    <verify>test -f .planning/phases/GSD-03-loop-e2e/live-boot.sh && bash -n .planning/phases/GSD-03-loop-e2e/live-boot.sh</verify>
    <acceptance_criteria>
      - "grep -q '@dsh-gsd/bundle' .planning/phases/GSD-03-loop-e2e/live-boot.sh"
      - "grep -q 'dsh --profile headless --dump-config' .planning/phases/GSD-03-loop-e2e/live-boot.sh"
      - "grep -q 'settings.yaml' .planning/phases/GSD-03-loop-e2e/live-boot.sh"
      - "bash -n .planning/phases/GSD-03-loop-e2e/live-boot.sh exits 0"
    </acceptance_criteria>
    <done>live-boot.sh exists, passes bash syntax check, and encodes the relocate-compose-boot recipe per D-01.</done>
  </task>

  <task type="auto">
    <name>Task 2: Run live-boot.sh in one job and capture live-boot-proof.txt</name>
    <files>.planning/phases/GSD-03-loop-e2e/live-boot-proof.txt</files>
    <read_first>.planning/phases/GSD-03-loop-e2e/live-boot.sh</read_first>
    <action>Run the driver script from Task 1 via a SINGLE bash invocation (foreground is fine as long as it runs to completion; use a background job if it risks exceeding the command timeout). Because /tmp is wiped between bash calls, the compose and boot must both happen inside this one run. Pipe the script's full output to a log, then write `.planning/phases/GSD-03-loop-e2e/live-boot-proof.txt` containing: the compose row count for `@dsh-gsd/bundle/`, the agent-loop override presence (present/absent), the booted task's final stdout line, and `BOOT_EXIT=<N>`. If the compose check fails (row count < 12 or no override), or if the booted session fails (non-zero exit), DO NOT treat it as a silent pass: record the failure line verbatim in the proof file and leave BOOT_EXIT non-zero so the orchestrator/verifier sees the real limitation (per D-03 — no offline-harness fallback).</action>
    <verify>grep -q 'BOOT_EXIT=' .planning/phases/GSD-03-loop-e2e/live-boot-proof.txt && test -s .planning/phases/GSD-03-loop-e2e/live-boot-proof.txt</verify>
    <acceptance_criteria>
      - "test -f .planning/phases/GSD-03-loop-e2e/live-boot-proof.txt"
      - "grep -q '@dsh-gsd/bundle' .planning/phases/GSD-03-loop-e2e/live-boot-proof.txt"
      - "grep -q 'BOOT_EXIT=' .planning/phases/GSD-03-loop-e2e/live-boot-proof.txt"
    </acceptance_criteria>
    <done>live-boot-proof.txt records the compose result and the real booted exit code, honoring D-03 (no silent fallback).</done>
  </task>
</tasks>

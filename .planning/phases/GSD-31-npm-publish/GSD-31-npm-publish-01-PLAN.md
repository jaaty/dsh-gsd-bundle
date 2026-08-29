---
phase: 31-npm-publish
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - .gitignore
  - .planning/phases/GSD-31-npm-publish/GSD-31-npm-publish-SUMMARY.md
autonomous: false
requirements: ["REL-02"]
user_setup: []
must_haves:
  truths:
    - "npm publish --cache .npm-cache succeeds with exit 0, running prepublishOnly (node --test test/*.test.mjs) automatically and uploading @dsh-gsd/bundle@2.2.0 to the public npm registry"
    - "After publish, curl https://registry.npmjs.org/@dsh-gsd%2Fbundle returns a JSON document whose versions object contains the key 2.2.0"
    - "npm install @dsh-gsd/bundle@2.2.0 --cache .npm-cache succeeds (exit 0) in a fresh temp dir and node -e import('@dsh-gsd/bundle') resolves the main export without error"
    - "npm pack --dry-run --cache .npm-cache reports 32 files including lib/*.js, cordis.patch.yml, README.md, NOTICE, and the four doc files, with zero .planning/ paths"
    - "No .npmrc file and no auth token is ever staged, committed, or written into any file under the workspace"
    - "The @dsh-gsd npm organization exists and jamie.atyeo is a member before npm publish is attempted"
  artifacts:
    - path: ".planning/phases/GSD-31-npm-publish/GSD-31-npm-publish-SUMMARY.md"
      provides: "Verification record documenting all eight gates (org-exists, registry-empty, prepublishOnly, pack-shape, publish, post-publish-registry, installability, no-secrets) with the exact command, exit code, and key output line for each"
      min_lines: 40
      exports: []
    - path: ".gitignore"
      provides: ".npm-cache/ ignore entry so the override cache directory does not pollute the working tree or get committed"
      min_lines: 1
      exports: []
  key_links:
    - from: "npm publish --cache .npm-cache (registry upload of @dsh-gsd/bundle@2.2.0)"
      to: "npm install @dsh-gsd/bundle@2.2.0 --cache .npm-cache (temp-dir consumer)"
      via: "the public npm registry round-trips the published tarball — the same version published in the publish gate is resolved and installed in the installability gate"
      pattern: "@dsh-gsd/bundle@2.2.0"
---

<objective>
Publish @dsh-gsd/bundle to the npm registry as v2.2.0, satisfying the prepublishOnly test gate, and verify the published package is installable via npm install into a temp dir. This is an ops/integration phase: no runtime code changes, no new dependencies, no CI publish workflow (per D-07). The work is a deterministic, strictly-ordered sequence of eight gates, each hard-failing with the real cause per D-08. The @dsh-gsd npm org must exist (created by the human) before the publish gate can succeed — this is surfaced as a checkpoint:human-action task (Q-1 from RESEARCH).
</objective>

<context>
@package.json
@.gitignore
@.planning/codebase/CONVENTIONS.md
@.planning/phases/GSD-31-npm-publish/GSD-31-npm-publish-CONTEXT.md
@.planning/phases/GSD-31-npm-publish/GSD-31-npm-publish-RESEARCH.md
</context>

<tasks>
  <task type="auto">
    <name>Task 1 (tracer): Pre-publish non-destructive gates and workspace hygiene</name>
    <files>.gitignore</files>
    <read_first>package.json, .gitignore, .planning/phases/GSD-31-npm-publish/GSD-31-npm-publish-RESEARCH.md</read_first>
    <action>
    This is the thinnest end-to-end slice: it touches the workspace config (.gitignore), the test gate, the tarball shape, and the registry state — every layer of the publish pipeline except the destructive upload itself. All npm commands MUST pass the --cache override set to the workspace-relative path .npm-cache (per D-01, because the default ~/.npm cache is read-only/EROFS in this environment). Use the exact flag form: --cache .npm-cache (run from the repo root /var/home/jatyeo/dev/dsh-gsd-bundle).

    Step 1 — Workspace hygiene (R-3): Read .gitignore and append a new line entry .npm-cache/ (with a short comment noting it is a local npm cache override byproduct, never committed). This is a repo-config edit, not a runtime code change, so it does not violate D-07. Verify with: git check-ignore .npm-cache exits 0.

    Step 2 — prepublishOnly test gate (D-02): Run npm test --cache .npm-cache (which equals node --test test/*.test.mjs). This is the prepublishOnly gate. Expected: 415 pass, 0 fail, exit 0. If ANY test fails, STOP — this is a hard stop per D-02; do not proceed to publish. Record the pass count and exit code.

    Step 3 — Tarball shape gate (D-03): Run npm pack --dry-run --cache .npm-cache. Assert the output reports exactly 32 files (the count line, e.g. "Tarball Contents" listing or the summary "32 files"). Assert the listing includes every lib/*.js (23 files), cordis.patch.yml, README.md, NOTICE, LICENSE, DISTRIBUTION.md, CONTRIBUTING.md, CODE_OF_CONDUCT.md, CHANGELOG.md, and package.json. Assert NO line in the output contains the substring "planning" (case-insensitive) — .planning/ must be excluded. If any assertion fails, STOP per D-08 and report which assertion failed.

    Step 4 — Registry pre-publish gate (D-04): Run curl -s https://registry.npmjs.org/@dsh-gsd%2Fbundle. Assert the response is the literal {"error":"Not found"} OR that a parsed versions object does not contain the key 2.2.0. If 2.2.0 is already present, STOP per D-08 — do not attempt to republish/force. Record the raw response.

    Do NOT run npm publish in this task. Do NOT create any git tag (D-06). Do NOT write the auth token anywhere (D-09).
    </action>
    <verify>npm test --cache .npm-cache exits 0 AND npm pack --dry-run --cache .npm-cache output contains "32 files" AND curl -s https://registry.npmjs.org/@dsh-gsd%2Fbundle does not contain "2.2.0" AND git check-ignore .npm-cache exits 0</verify>
    <acceptance_criteria>
      - npm test --cache .npm-cache exits 0 with 0 failures
      - npm pack --dry-run --cache .npm-cache output contains the string "32 files"
      - npm pack --dry-run output contains "cordis.patch.yml" and "NOTICE" and "README.md"
      - npm pack --dry-run output contains no line matching the regex /planning/i
      - curl -s https://registry.npmjs.org/@dsh-gsd%2Fbundle returns a response not containing "2.2.0"
      - git check-ignore .npm-cache exits 0
      - .gitignore contains the line .npm-cache/
    </acceptance_criteria>
    <done>All four pre-publish gates (gitignore hygiene, test, pack-shape, registry-empty) pass with their exit codes and key outputs recorded. The workspace is clean for publish. No destructive action taken yet.</done>
  </task>

  <task type="checkpoint:human-action">
    <name>Task 2 (checkpoint): Verify @dsh-gsd npm org exists — human action required if missing</name>
    <files></files>
    <read_first>.planning/phases/GSD-31-npm-publish/GSD-31-npm-publish-RESEARCH.md</read_first>
    <action>
    Run the org-existence gate (R-1 / Q-1 from RESEARCH): npm org ls dsh-gsd --cache .npm-cache. This checks whether the @dsh-gsd npm organization exists and whether jamie.atyeo is a member.

    If the command SUCCEEDS (returns a member list, exit 0): the org exists and the publisher is a member. Record the member list output and proceed — this checkpoint is satisfied, continue to Task 3.

    If the command FAILS with "404 Not Found" / "Scope not found" / 403 (the verified current state per RESEARCH R-1): STOP and surface a checkpoint:human-action. Do NOT attempt npm publish (it will fail against a non-existent scope). The human-facing message MUST state:
      - The @dsh-gsd npm organization does not exist yet (npm org ls dsh-gsd returned Scope not found / 404).
      - npm publish to @dsh-gsd/bundle cannot succeed until the org is created.
      - ACTION: Create the free @dsh-gsd org at https://www.npmjs.com/org/create (public packages, no cost), adding jamie.atyeo as owner/member.
      - There is no CLI command to create an npm org — it must be done in the web UI.
      - After creating the org, resume this phase; Task 2 will re-run npm org ls dsh-gsd --cache .npm-cache and proceed to Task 3 on success.

    Per D-08 (fail-fast): surface the real npm error verbatim. Per D-09: never write the auth token into any file. This checkpoint makes the plan autonomous: false.

    When resumed with the human's confirmation that the org was created, re-run npm org ls dsh-gsd --cache .npm-cache. Only proceed to Task 3 when it returns a member list (exit 0). If it still fails, re-surface the checkpoint with the updated real cause.
    </action>
    <verify>npm org ls dsh-gsd --cache .npm-cache exits 0 and returns a member list (not "Scope not found")</verify>
    <acceptance_criteria>
      - npm org ls dsh-gsd --cache .npm-cache exits 0
      - npm org ls dsh-gsd --cache .npm-cache output does not contain "Scope not found" or "404"
      - If the org was missing, the checkpoint surfaced a human-action message referencing https://www.npmjs.com/org/create and did NOT attempt npm publish
    </acceptance_criteria>
    <done>The @dsh-gsd npm org exists on npmjs.com and npm org ls dsh-gsd --cache .npm-cache returns a member list including jamie.atyeo. The checkpoint is resolved (either the org already existed, or the human created it and execution resumed).</done>
  </task>

  <task type="auto">
    <name>Task 3: Publish, post-publish registry confirm, installability verify, no-secrets guard, write verification record</name>
    <files>.planning/phases/GSD-31-npm-publish/GSD-31-npm-publish-SUMMARY.md</files>
    <read_first>.planning/phases/GSD-31-npm-publish/GSD-31-npm-publish-CONTEXT.md, .planning/codebase/CONVENTIONS.md</read_first>
    <action>
    This task performs the destructive publish and the full installability verification, then writes the verification record. All npm commands MUST pass --cache .npm-cache (D-01).

    Step 1 — Publish gate (REL-02): Run npm publish --cache .npm-cache from the repo root. npm runs prepublishOnly (node --test test/*.test.mjs) automatically before uploading (D-02). publishConfig.access is already "public" in package.json, so no --access flag is needed. Expected: exit 0, registry accepts the tarball, output contains the published version + tarball URL. If publish fails (403, network error, version exists, etc.), STOP per D-08 — report the real npm error verbatim, never fake success. Do NOT pass --force. The auth token is read implicitly from ~/.npmrc; never echo or write it (D-09).

    Step 2 — Post-publish registry gate: Run curl -s https://registry.npmjs.org/@dsh-gsd%2Fbundle. Assert the JSON response now contains a versions object with the key 2.2.0 (and dist-tags.latest === 2.2.0). This is the EROFS-safe equivalent of npm view per D-04. Record the raw response (or the relevant snippet showing 2.2.0).

    Step 3 — Installability gate (D-05): Create a fresh temp dir with mktemp -d. cd into it. Run npm install @dsh-gsd/bundle@2.2.0 --cache /var/home/jatyeo/dev/dsh-gsd-bundle/.npm-cache (use the absolute path to the workspace cache since you are in a different directory). Expected: exit 0, node_modules/@dsh-gsd/bundle present. Then run node -e with an import('@dsh-gsd/bundle') call that resolves the default export and prints "loaded: true" — assert it resolves without error (exit 0). The four peerDependencies auto-install (npm 7+) and all exist at their exact versions per RESEARCH, so no ERESOLVE failure is expected. Do NOT run dsh plugin add (out of scope, D-05). After the check, rm -rf the temp dir (cleanup per Claude's discretion in CONTEXT).

    Step 4 — No-secrets guard (D-09): Run git status --short and assert no .npmrc appears in the output. Confirm no file under the workspace contains the auth token (the token lives only in ~/.npmrc, mode 0600, never tracked). Record that git status shows no .npmrc staged.

    Step 5 — Verification record (Claude's discretion per CONTEXT): Write .planning/phases/GSD-31-npm-publish/GSD-31-npm-publish-SUMMARY.md documenting all eight gates. For each gate include: the gate name, the exact command run, the exit code, and the key output line (e.g. "415 pass, 0 fail" for the test gate; "32 files" for pack-shape; "versions contains 2.2.0" for post-publish; "loaded: true" for installability). Structure it so a verifier can confirm REL-02's three prongs (prepublishOnly satisfied, published as 2.2.0, installable) from the artefact alone. Commit this SUMMARY.md to the phase-31 branch (per CQ-07 feature-branch discipline) — do NOT create a v2.2.0 git tag (D-06: tag + GitHub release is a separate release task).

    Do NOT create a git tag (D-06). Do NOT set up a CI publish workflow (deferred). Do NOT run dsh plugin add (D-05).
    </action>
    <verify>curl -s https://registry.npmjs.org/@dsh-gsd%2Fbundle contains "2.2.0" AND a fresh temp dir npm install @dsh-gsd/bundle@2.2.0 exits 0 AND node -e "import('@dsh-gsd/bundle')" exits 0 AND git status --short shows no .npmrc AND .planning/phases/GSD-31-npm-publish/GSD-31-npm-publish-SUMMARY.md exists with min 40 lines</verify>
    <acceptance_criteria>
      - npm publish --cache .npm-cache exits 0
      - curl -s https://registry.npmjs.org/@dsh-gsd%2Fbundle output contains the string "2.2.0"
      - npm install @dsh-gsd/bundle@2.2.0 --cache .npm-cache exits 0 in a fresh temp dir
      - node -e import of @dsh-gsd/bundle default export prints "loaded: true" and exits 0
      - git status --short output does not contain ".npmrc"
      - .planning/phases/GSD-31-npm-publish/GSD-31-npm-publish-SUMMARY.md exists and has at least 40 lines
      - SUMMARY.md contains the substrings "prepublishOnly", "2.2.0", and "installab" (case-insensitive)
      - No v2.2.0 git tag was created (git tag --list 'v2.2.0' returns empty)
    </acceptance_criteria>
    <done>@dsh-gsd/bundle@2.2.0 is published to the npm registry, confirmed present via curl, installable via npm install in a temp dir with the main export resolving, no secrets leaked, and the eight-gate verification record committed to phase-31. REL-02 is satisfied.</done>
  </task>
</tasks>
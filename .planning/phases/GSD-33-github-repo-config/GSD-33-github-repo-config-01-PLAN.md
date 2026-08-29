---
phase: 33-github-repo-config
plan: 01
type: execute
wave: 1
depends_on: []
files_modified: ["test/repo-config.test.mjs"]
autonomous: false
requirements: ["REL-04"]
gap_closure: false
user_setup: []
must_haves:
  truths:
    - "gh repo view --json homepageUrl returns https://www.npmjs.com/package/@dsh-gsd/bundle (D-01)"
    - "gh repo view --json repositoryTopics contains all of dsh, deepseek-harness, opengsd, gsd, git-ship-done, plugin, coding-agent (D-02)"
    - "gh api repos/jaaty/dsh-gsd-bundle/private-vulnerability-reporting --jq .enabled returns true (D-03)"
    - "gh repo view --json isPrivate returns false (repo is public, OQ-1 prerequisite for D-03)"
    - "package.json homepage field is unchanged at https://github.com/jaaty/dsh-gsd-bundle (D-05)"
  artifacts:
    - path: "test/repo-config.test.mjs"
      provides: "structural node:test that shells out to gh and asserts the repo homepage URL, topics, private-vuln-reporting setting, and public visibility, failing loudly with the real gh stderr"
      min_lines: 40
      exports: []
  key_links:
    - from: "test/repo-config.test.mjs"
      to: "gh CLI (external GitHub repo settings)"
      via: "execFileSync('gh', [...]) wrapped so a non-zero exit throws an Error carrying the real stderr"
      pattern: "execFileSync\\(\"gh\""
---
<objective>
Configure the GitHub repository jaaty/dsh-gsd-bundle for discoverability and canonical linking: set the homepage URL to the npm package page, set the seven searchable topics, enable GitHub private vulnerability reporting, and (as the prerequisite for that setting) make the repo public. Prove all of it with a structural node:test that shells out to gh and asserts the resulting repo state, failing loudly with the real cause per D-04. This plan delivers REL-04 and every locked decision D-01..D-05.
</objective>
<context>
@.planning/phases/GSD-33-github-repo-config/GSD-33-github-repo-config-CONTEXT.md
@.planning/phases/GSD-33-github-repo-config/GSD-33-github-repo-config-RESEARCH.md
@test/security-policy.test.mjs
@test/repo-hygiene.test.mjs
@package.json
</context>
<tasks>
  <task type="auto">
    <name>Task 1 (tracer): Set the repo homepage URL and add the structural test asserting it (D-01, D-05)</name>
    <files>test/repo-config.test.mjs</files>
    <read_first>test/security-policy.test.mjs, test/repo-hygiene.test.mjs, package.json</read_first>
    <action>
      Run the gh command to set the repo homepage URL to the npm package page (per D-01):
      gh repo edit --homepage https://www.npmjs.com/package/@dsh-gsd/bundle
      (run from the repo root; gh is authenticated as jaaty with repo scope).

      Create the new file test/repo-config.test.mjs mirroring the phase-32 structural pattern (test/security-policy.test.mjs). Header comment: "// Repo-configuration verification for @dsh-gsd/bundle (Phase 33: github-repo-config)." Import { test } from "node:test", assert from "node:assert/strict", { execFileSync } from "node:child_process", { promises as fsPromises } from "node:fs", and path from "node:path". Resolve ROOT via new URL("../", import.meta.url).pathname.

      Add a helper ghRepoView(fields) that runs execFileSync("gh", ["repo", "view", "--json", fields], { cwd: ROOT, encoding: "utf8" }) and JSON.parses the result. Wrap the execFileSync call so that on a non-zero exit it throws an Error carrying the real stderr (e.g. `throw new Error("gh repo view failed: " + err.stderr)`) — this is the D-04 fail-loudly-with-real-cause requirement; never let a gh failure silently pass.

      Add a test "repo homepage URL is the npm package page (REL-04, D-01)": call ghRepoView("homepageUrl") and assert the returned homepageUrl equals "https://www.npmjs.com/package/@dsh-gsd/bundle".

      Add a test "package.json homepage field is unchanged (D-05)": read package.json via fsPromises.readFile(path.join(ROOT, "package.json"), "utf8"), JSON.parse it, and assert pkg.homepage equals "https://github.com/jaaty/dsh-gsd-bundle" (the npm-convention GitHub URL, unchanged per D-05).

      Do NOT modify package.json, README, or any lib/ plugin module. Do NOT change the package.json homepage field.
    </action>
    <verify>cd /var/home/jatyeo/dev/dsh-gsd-bundle && node --test test/repo-config.test.mjs</verify>
    <acceptance_criteria>
      - gh repo view --json homepageUrl returns https://www.npmjs.com/package/@dsh-gsd/bundle
      - test/repo-config.test.mjs exists and contains the string "execFileSync(\"gh\"" and the string "https://www.npmjs.com/package/@dsh-gsd/bundle"
      - node --test test/repo-config.test.mjs exits 0 with the homepage and package.json-homepage tests passing
      - package.json homepage field still equals https://github.com/jaaty/dsh-gsd-bundle
    </acceptance_criteria>
    <done>Homepage URL is set on the repo, the structural test file exists with the homepage + package.json-homepage assertions, and the test passes.</done>
  </task>

  <task type="auto">
    <name>Task 2: Set the seven searchable topics and extend the test to assert them (D-02)</name>
    <files>test/repo-config.test.mjs</files>
    <read_first>test/repo-config.test.mjs</read_first>
    <action>
      Run the gh command to add the seven topics (per D-02), one --add-topic flag each:
      gh repo edit --add-topic dsh --add-topic deepseek-harness --add-topic opengsd --add-topic gsd --add-topic git-ship-done --add-topic plugin --add-topic coding-agent
      (run from the repo root). Do not use --remove-topic unless a stale topic is present; the current repositoryTopics is null.

      Extend test/repo-config.test.mjs with a test "repo topics include all seven configured topics (REL-04, D-02)": call ghRepoView("repositoryTopics") and assert the returned repositoryTopics array contains every one of dsh, deepseek-harness, opengsd, gsd, git-ship-done, plugin, coding-agent (e.g. iterate the expected array and assert each is included).
    </action>
    <verify>cd /var/home/jatyeo/dev/dsh-gsd-bundle && node --test test/repo-config.test.mjs</verify>
    <acceptance_criteria>
      - gh repo view --json repositoryTopics contains all seven of dsh, deepseek-harness, opengsd, gsd, git-ship-done, plugin, coding-agent
      - test/repo-config.test.mjs contains the string "coding-agent" and the string "repositoryTopics"
      - node --test test/repo-config.test.mjs exits 0 with the topics test passing
    </acceptance_criteria>
    <done>All seven topics are set on the repo and the structural test asserts them, passing.</done>
  </task>

  <task type="checkpoint:decision">
    <name>Task 3: Confirm repo visibility change to public, then enable private vulnerability reporting and assert it (D-03, OQ-1)</name>
    <files>test/repo-config.test.mjs</files>
    <read_first>test/repo-config.test.mjs</read_first>
    <action>
      STOP and surface a human-facing decision checkpoint before making any visibility change. The repo jaaty/dsh-gsd-bundle is currently PRIVATE (gh repo view --json isPrivate returns true), but GitHub private vulnerability reporting is only available on public repositories, and the live GET /repos/jaaty/dsh-gsd-bundle/private-vulnerability-reporting returns 404 on the private repo. D-03 therefore cannot be satisfied while the repo is private. Present the question to the human:

      "The repo is currently PRIVATE, but D-03 (enable GitHub private vulnerability reporting) is only available on public repositories. May I make the repo public (gh repo edit --visibility public --accept-visibility-change-consequences) so D-03 can be satisfied? If not, D-03 must be re-deferred and the phase re-scoped."

      Do NOT run any visibility-changing or private-vuln-reporting gh command until the human answers.

      If the human answers YES (make public): run gh repo edit --visibility public --accept-visibility-change-consequences, then run gh api -X PUT repos/jaaty/dsh-gsd-bundle/private-vulnerability-reporting -f enabled=true to enable private vulnerability reporting (per D-03). Then extend test/repo-config.test.mjs with two tests:
      - "repo is public (OQ-1 prerequisite)": call ghRepoView("isPrivate") and assert isPrivate is false.
      - "private vulnerability reporting is enabled (REL-04, D-03)": run execFileSync("gh", ["api", "repos/jaaty/dsh-gsd-bundle/private-vulnerability-reporting", "--jq", ".enabled"], { cwd: ROOT, encoding: "utf8" }) and assert the trimmed output equals "true". NOTE: this setting is NOT exposed by gh repo view --json (no private-vulnerability-reporting field exists there) — it MUST be queried via gh api .../private-vulnerability-reporting --jq .enabled, per the RESEARCH.md correction to D-04's phrasing. Wrap the execFileSync so a non-zero exit throws an Error carrying the real stderr (D-04 fail-loudly).

      If the human answers NO (do not make public): do NOT run the visibility or private-vuln-reporting commands. Record that D-03 is re-deferred (the private-vuln-reporting test must NOT be added, or must be skipped with a clear reason), and report the deferral in the plan SUMMARY so the phase can be re-scoped. The homepage and topics work from Tasks 1-2 stands regardless.
    </action>
    <verify>cd /var/home/jatyeo/dev/dsh-gsd-bundle && node --test test/repo-config.test.mjs</verify>
    <acceptance_criteria>
      - A human decision was captured before any visibility change (checkpoint honored; no gh visibility/vuln command ran before the answer)
      - If YES: gh repo view --json isPrivate returns false; gh api repos/jaaty/dsh-gsd-bundle/private-vulnerability-reporting --jq .enabled returns true; test/repo-config.test.mjs contains "private-vulnerability-reporting" and "isPrivate"; node --test test/repo-config.test.mjs exits 0
      - If NO: no visibility/vuln gh command ran; the D-03 deferral is recorded in the plan SUMMARY
    </acceptance_criteria>
    <done>The visibility decision is captured; if approved, the repo is public with private vulnerability reporting enabled and both are asserted by the passing structural test; if declined, D-03 is re-deferred and reported.</done>
  </task>
</tasks>

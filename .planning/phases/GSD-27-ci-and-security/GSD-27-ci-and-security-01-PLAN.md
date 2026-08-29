---
phase: 27-ci-and-security
plan: 01
type: execute
wave: 1
depends_on: []
files_modified: ["package-lock.json", ".github/workflows/ci.yml"]
autonomous: true
requirements: ["PUB-04"]
gap_closure: false
user_setup: []
must_haves:
  truths:
    - "A GitHub Actions workflow at .github/workflows/ci.yml runs the test suite on pull_request and on push to main."
    - "CI installs dependencies reproducibly with npm ci using a committed package-lock.json."
    - "A gitleaks CI guard job scans the PR's commits and fails if a new secret is introduced."
  artifacts:
    - path: ".github/workflows/ci.yml"
      provides: "GitHub Actions CI workflow with a test job (npm ci + npm test) and a gitleaks guard job"
      min_lines: 40
      exports: []
    - path: "package-lock.json"
      provides: "npm lockfile (lockfileVersion 3) enabling reproducible npm ci installs in CI"
      min_lines: 40
      exports: []
  key_links:
    - from: ".github/workflows/ci.yml"
      to: "package.json"
      via: "the test job runs `npm test`, which maps to package.json scripts.test = node --test test/*.test.mjs"
      pattern: "npm test"
    - from: ".github/workflows/ci.yml"
      to: "package-lock.json"
      via: "the test job runs `npm ci`, which requires the committed lockfile to be in sync with package.json"
      pattern: "npm ci"
---
<objective>Deliver the CI test workflow and the reproducible-install lockfile that PUB-04 requires. This plan creates .github/workflows/ci.yml (the first CI file in the repo) with a test job that runs the existing suite on pull_request and push to main, generates and commits package-lock.json so CI can use npm ci, and adds a gitleaks guard job that fails a PR if a new secret is introduced. The full-history secret-scan audit is plan 02; the documentation of these behaviours is plan 03.</objective>
<context>
@package.json (scripts.test = "node --test test/*.test.mjs"; dependencies empty; peerDependencies @deepseek-ai/*; no engines field)
@test/ (the *.test.mjs suite the workflow runs)
@.gitignore (node_modules/ ignored; package-lock.json is NOT ignored and must be committed)
@.planning/phases/GSD-27-ci-and-security/GSD-27-ci-and-security-RESEARCH.md (verified gitleaks CLI behaviour and npm ci/lockfile facts)
</context>
<tasks>
  <task type="auto">
    <name>Task 1: Generate and commit package-lock.json for npm ci (D-04)</name>
    <files>package-lock.json</files>
    <read_first>package.json</read_first>
    <action>Generate a package-lock.json at the repo root so CI can run npm ci. Run, from the repo root: npm install --package-lock-only --ignore-scripts --cache /tmp/npmcache. The --cache /tmp/npmcache flag is REQUIRED because the default npm cache (~/.npm/_cacache) is read-only in this sandbox (EROFS); this is a sandbox limitation, not a repo problem. Do NOT run a full npm install (it would touch node_modules). The generated lockfile must be lockfileVersion 3 and resolve the four @deepseek-ai/* peer deps (dsh-tools, schemastery, cordis, dsh-llm). Verify the file exists and is non-trivial, then commit it atomically with a message like "chore: add package-lock.json for reproducible npm ci installs".</action>
    <verify>test -f package-lock.json && grep -q 'lockfileVersion' package-lock.json && grep -q '"lockfileVersion": 3' package-lock.json && git ls-files --error-unmatch package-lock.json >/dev/null 2>&1</verify>
    <acceptance_criteria>
      - test -f package-lock.json
      - grep -q '"lockfileVersion": 3' package-lock.json
      - grep -q 'cordis' package-lock.json (peer dep resolved)
      - git ls-files --error-unmatch package-lock.json (tracked)
    </acceptance_criteria>
    <done>package-lock.json exists at the repo root, is lockfileVersion 3, resolves the peer deps, and is committed.</done>
  </task>
  <task type="auto">
    <name>Task 2: Create .github/workflows/ci.yml with the test job (D-01, D-02, D-03)</name>
    <files>.github/workflows/ci.yml</files>
    <read_first>package.json</read_first>
    <action>Create the directory .github/workflows/ and the file .github/workflows/ci.yml. The workflow must trigger on pull_request and on push to main: use "on: { pull_request: {}, push: { branches: [main] } }". Add a single "test" job on runs-on: ubuntu-latest with these steps in order: (1) actions/checkout@v4, (2) actions/setup-node@v4 with node-version: 24 and cache: npm (D-02 — single Node 24, no matrix), (3) run: npm ci, (4) run: npm test (D-03 — npm test runs node --test test/*.test.mjs). Do not add any test framework. Do not add an engines field anywhere. The job name is "test".</action>
    <verify>test -f .github/workflows/ci.yml && grep -q 'pull_request' .github/workflows/ci.yml && grep -q 'push' .github/workflows/ci.yml && grep -q 'npm ci' .github/workflows/ci.yml && grep -q 'npm test' .github/workflows/ci.yml && grep -q 'node-version: 24' .github/workflows/ci.yml</verify>
    <acceptance_criteria>
      - test -f .github/workflows/ci.yml
      - grep -q 'pull_request' .github/workflows/ci.yml
      - grep -q 'push' .github/workflows/ci.yml
      - grep -q 'npm ci' .github/workflows/ci.yml
      - grep -q 'npm test' .github/workflows/ci.yml
      - grep -q 'node-version: 24' .github/workflows/ci.yml
      - grep -q 'actions/setup-node@v4' .github/workflows/ci.yml
    </acceptance_criteria>
    <done>.github/workflows/ci.yml exists with a test job that checks out, sets up Node 24, runs npm ci, and runs npm test, triggered on PRs and push to main.</done>
  </task>
  <task type="auto">
    <name>Task 3: Add the gitleaks guard job to ci.yml (D-07)</name>
    <files>.github/workflows/ci.yml</files>
    <read_first>.github/workflows/ci.yml</read_first>
    <action>Add a second job named "secrets" to .github/workflows/ci.yml that guards against new secrets in a PR. Give it runs-on: ubuntu-latest and a guard "if: github.event_name == 'pull_request'" so it only runs on PR events (on push to main there is no pull_request event context). Steps: (1) actions/checkout@v4 with fetch-depth: 0 so both the base and head SHAs are present (a shallow checkout may lack the base commit and break the range scan), (2) a step that runs gitleaks via the Docker image zricethezav/gitleaks (D-05) with a bare revision range, NOT --diff (git rejects --diff). Use: docker run -v "$PWD:/repo" zricethezav/gitleaks:latest detect --source /repo --log-opts="${{ github.event.pull_request.base.sha }}...${{ github.event.pull_request.head.sha }}" --report-format json. The --log-opts must be a bare base...head range (verified valid); do not use --diff. The job fails (non-zero exit) when gitleaks finds a new secret, which is the guard's purpose.</action>
    <verify>grep -q 'secrets' .github/workflows/ci.yml && grep -q 'zricethezav/gitleaks' .github/workflows/ci.yml && grep -q 'fetch-depth: 0' .github/workflows/ci.yml && grep -q 'pull_request.base.sha' .github/workflows/ci.yml && ! grep -q -- '--diff' .github/workflows/ci.yml</verify>
    <acceptance_criteria>
      - grep -q 'secrets' .github/workflows/ci.yml
      - grep -q 'zricethezav/gitleaks' .github/workflows/ci.yml
      - grep -q 'fetch-depth: 0' .github/workflows/ci.yml
      - grep -q 'pull_request.base.sha' .github/workflows/ci.yml
      - ! grep -q -- '--diff' .github/workflows/ci.yml
    </acceptance_criteria>
    <done>The ci.yml workflow has a secrets guard job that runs gitleaks via the Docker image over the PR's base...head range with fetch-depth: 0 and fails on a new secret.</done>
  </task>
</tasks>

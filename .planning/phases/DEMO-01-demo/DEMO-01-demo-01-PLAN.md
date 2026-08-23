---
phase: DEMO-01-demo
plan: 01
type: execute
wave: 1
depends_on: []
files_modified: ["README.md"]
autonomous: true
requirements: ["DEMO-01"]
gap_closure: false
user_setup: []
must_haves:
  truths:
    - "README.md mentions the e2e demo: grep -n 'demo-e2e phase through the full GSD loop' returns a match."
    - "The added line sits within the first few lines after the H1 title (# dsh-gsd-bundle)."
    - "git diff -- README.md shows exactly one added line (1 insertion, 0 deletions) and no other hunks."
  artifacts:
    - path: "README.md"
      provides: "The documentation surface carrying the demo line (the H1 + first few lines)."
      min_lines: 1
      exports: []
  key_links: []
---

<objective>Append one line to README.md documenting that this demo project exercises the end-to-end GSD phase loop, as a trivial non-destructive single-line change proving the loop runs against a real repo.</objective>

<context>
- README.md — the file to append the demo line to (H1 `# dsh-gsd-bundle` at line 1, blank line 2, body begins line 3).
- .planning/phases/DEMO-01-demo/DEMO-01-demo-CONTEXT.md — locked decisions D-01..D-04.
- .planning/phases/DEMO-01-demo/DEMO-01-demo-RESEARCH.md — validation commands and placement analysis.
</context>

<tasks>
  <task type="auto">
    <name>Task 1: Append the demo-e2e line after the README title (tracer)</name>
    <files>README.md</files>
    <read_first>README.md</read_first>
    <action>Edit README.md to add the single line with the exact locked text from D-02: 'This repository also runs a tiny demo-e2e phase through the full GSD loop (Discuss → Plan → Execute → Verify → Ship).'. Place the new line immediately after the H1 line '# dsh-gsd-bundle' (line 1), per D-01 (right after the H1 title block, visibly near the top). Do NOT alter any other line of the file. Do NOT add dependencies, build tooling, or package files (per D-03). The new line becomes line 2 and the existing blank line / body shift down; verify against the frontmatter-mounted must_haves.</action>
    <verify>grep -n "demo-e2e phase through the full GSD loop" README.md && git diff --stat README.md</verify>
    <acceptance_criteria>
      - `grep -n "demo-e2e phase through the full GSD loop" README.md` exits 0 and reports a line number within the first 3 lines of the file (grep output starts with line number ≤ 3).
      - `git diff README.md` shows only the single intended added line and no other hunks (no existing content modified, no deletions).
      - No package.json / lockfile / build-tooling files are modified (git status --short shows only README.md plus .planning/ artefacts).
    </acceptance_criteria>
    <done>README.md line 2 is the exact D-02 demo line, all other lines byte-identical, git diff shows one added line.</done>
  </task>
  <task type="auto">
    <name>Task 2: Verify non-destructive single-line diff and commit</name>
    <files>README.md</files>
    <read_first>README.md</read_first>
    <action>Before committing, run the D-04 safety gate: `git diff README.md` must show exactly one added line and zero deletions, and the added line must be the locked D-02 text placed within the first few lines after the H1 title. Confirm `git status --short` shows only README.md (plus pre-existing .planning/ artefacts) as modified. If the diff matches, stage and commit atomically with a message like 'docs: add demo-e2e loop line to README (DEMO-01)'. Do not amend or include unrelated files.</action>
    <verify>git show --stat HEAD | grep -c README.md && git diff --exit-code HEAD -- README.md</verify>
    <acceptance_criteria>
      - `git diff README.md` returns a diff with `1 insertion(+), 0 deletions(-)` and the added line is the exact D-02 text.
      - `git status --short -- README.md` is empty (no uncommitted changes to README.md). Any remaining `git status --short` entries are the pre-existing .planning/ artefacts, which this phase intentionally does NOT commit.
      - HEAD commit touches README.md and no package/lock/build files.
    </acceptance_criteria>
    <done>The README change is committed atomically; `git status --short -- README.md` shows no uncommitted changes to README.md; only the single locked line was added.</done>
  </task>
</tasks>

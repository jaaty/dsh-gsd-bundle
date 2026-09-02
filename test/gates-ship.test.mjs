// Capability-gate enforcement suite (Phase 8, plan 03). Proves the gsd_ship
// gatekeeper requirements CAP-01 and CAP-02 plus decisions D-05..D-09 by driving
// the runCapabilityGates seam (lib/gates.js) with deterministic in-memory fake
// config / gitData / plans, and by statically checking the lib/ship.js wiring so
// a failing required gate demonstrably aborts before any push/PR I/O.
//
// Style mirrors test/_shared.test.mjs (pure helpers, node --test). No real git,
// no real filesystem is touched by the runCapabilityGates assertions.

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { runCapabilityGates } from "../lib/gates.js";

// A clean gitData payload: a benign changed code file, no secrets, no markers,
// no commits. Every gate should pass against it (used by the CAP-01 suite).
const CLEAN = {
  changedFiles: ["src/a.js"],
  contentMap: { "src/a.js": "const x = 1;" },
  commitSubjects: [],
};

describe("CAP-01 gate report", () => {
  test("every gate reports pass on clean data — 3 report lines, blockError null", async () => {
    const { reportLines, blockError } = runCapabilityGates({
      cfg: {},
      gitData: CLEAN,
      plans: [{ id: "GSD-08-x-01", phase: "8", plan: "1", type: "execute" }],
      skipGates: [],
    });
    assert.equal(reportLines.length, 3, "one report line per gate");
    for (const line of reportLines) {
      assert.match(line, /^(security|broken_windows|tdd_audit): pass$/, line);
    }
    assert.equal(blockError, null);
  });

  test("a mixed run still reports every gate regardless of outcome (D-07)", async () => {
    // security: skipped (config-disabled) · broken_windows: fail (TODO) ·
    // tdd_audit: pass (execute plan, no commits) — all three appear.
    const { reportLines } = runCapabilityGates({
      cfg: { gates: { security: false } },
      gitData: {
        changedFiles: ["src/a.js"],
        contentMap: { "src/a.js": "// TODO later" },
        commitSubjects: [],
      },
      plans: [{ id: "GSD-08-x-01", phase: "8", plan: "1", type: "execute" }],
      skipGates: [],
    });
    assert.equal(reportLines.length, 3);
    assert.ok(reportLines.includes("security: skipped"), reportLines.join("\n"));
    assert.ok(reportLines.some((l) => l.startsWith("broken_windows: fail")), reportLines.join("\n"));
    assert.ok(reportLines.includes("tdd_audit: pass"), reportLines.join("\n"));
  });

  test("a failing security gate still reports broken_windows and tdd_audit statuses", async () => {
    const { reportLines } = runCapabilityGates({
      cfg: {},
      gitData: { changedFiles: ["a/.env"], contentMap: { "a/.env": "x" }, commitSubjects: [] },
      plans: [{ id: "GSD-08-x-01", phase: "8", plan: "1", type: "execute" }],
      skipGates: [],
    });
    assert.ok(reportLines.some((l) => l.startsWith("security: fail")), reportLines.join("\n"));
    assert.ok(reportLines.some((l) => l.startsWith("broken_windows: pass")), reportLines.join("\n"));
    assert.ok(reportLines.some((l) => l.startsWith("tdd_audit: pass")), reportLines.join("\n"));
  });
});

describe("CAP-02 blocking", () => {
  test("a failing security gate yields a blockError naming the gate and file", async () => {
    const { blockError } = runCapabilityGates({
      cfg: {},
      gitData: { changedFiles: ["a/.env"], contentMap: {}, commitSubjects: [] },
      plans: [],
      skipGates: [],
    });
    assert.ok(blockError, "blockError is non-null when a required gate fails");
    assert.ok(blockError.includes("security"), blockError);
    assert.ok(blockError.includes(".env"), blockError);
  });

  test("a failing broken-windows gate names gate + file + marker", async () => {
    const { blockError } = runCapabilityGates({
      cfg: {},
      gitData: { changedFiles: ["src/a.js"], contentMap: { "src/a.js": "// TODO" }, commitSubjects: [] },
      plans: [],
      skipGates: [],
    });
    assert.ok(blockError, "blockError is non-null");
    assert.ok(blockError.includes("broken_windows"), blockError);
    assert.ok(blockError.includes("src/a.js"), blockError);
    assert.ok(blockError.includes("TODO"), blockError);
  });

  test("a failing tdd-audit gate names gate + plan id", async () => {
    const { blockError } = runCapabilityGates({
      cfg: {},
      gitData: { changedFiles: [], contentMap: {}, commitSubjects: ["feat(08-01): b"] },
      plans: [{ id: "GSD-08-x-01", phase: "8", plan: "1", type: "tdd" }],
      skipGates: [],
    });
    assert.ok(blockError, "blockError is non-null");
    assert.ok(blockError.includes("tdd_audit"), blockError);
    assert.ok(blockError.includes("GSD-08-x-01"), blockError);
  });

  test("a required failing gate produces a blocking message naming gate + file + reason", async () => {
    const { reportLines, blockError } = runCapabilityGates({
      cfg: {},
      gitData: { changedFiles: ["a/.env"], contentMap: {}, commitSubjects: [] },
      plans: [],
      skipGates: [],
    });
    const line = reportLines.find((l) => l.startsWith("security: fail"));
    assert.match(line, /security: fail/);
    assert.match(line, /a\/\.env/);
    assert.match(blockError, /security gate failed/);
    assert.match(blockError, /\.env/);
  });
});

describe("CAP-02 wiring: gsd_ship aborts before push on a failing gate (static)", () => {
  test("ship.js fails with blockError and runs the gates before the push block", async () => {
    const fs = await import("node:fs/promises");
    const src = await fs.readFile(new URL("../lib/ship.js", import.meta.url), "utf8");

    // The blocking failure path must call fail() with blockError (D-05).
    assert.match(src, /fail\s*\(\s*blockError\s*\)/, "fail(blockError) present");

    // The gate section (## Gate Report + runCapabilityGates) must sit textually
    // BEFORE the push step so a failing gate aborts before any push/PR I/O.
    const pushIdx = src.indexOf("6. push branch");
    assert.ok(pushIdx > -1, "push-branch step marker present in ship.js");
    const gateReportIdx = src.indexOf("## Gate Report");
    const runGatesIdx = src.indexOf("runCapabilityGates({");
    assert.ok(gateReportIdx > -1 && gateReportIdx < pushIdx, "Gate Report appended before push");
    assert.ok(runGatesIdx > -1 && runGatesIdx < pushIdx, "runCapabilityGates called before push");

    // The fail(blockError) call must appear before the push block too, proving a
    // failing required gate throws before the push (CAP-02).
    const failBlockErrorIdx = src.indexOf("if (blockError) fail(blockError)");
    assert.ok(failBlockErrorIdx > -1 && failBlockErrorIdx < pushIdx, "blockError failure raised before push");
  });
});

describe("skip + tdd enforcement", () => {
  const SECRET_GIT = { changedFiles: ["a/.env"], contentMap: {}, commitSubjects: [] };

  test("config-disabled gate reports skipped and does not block (D-08, D-06)", async () => {
    const { reportLines, blockError } = runCapabilityGates({
      cfg: { gates: { security: false } },
      gitData: SECRET_GIT,
      plans: [],
      skipGates: [],
    });
    assert.ok(reportLines.includes("security: skipped"), reportLines.join("\n"));
    assert.equal(blockError, null, "a skipped gate never blocks");
    // The other gates still report their real status.
    assert.ok(reportLines.some((l) => l.startsWith("broken_windows:")), reportLines.join("\n"));
    assert.ok(reportLines.some((l) => l.startsWith("tdd_audit:")), reportLines.join("\n"));
    assert.equal(reportLines.length, 3);
  });

  test("skipGates list reports skipped and does not block (D-06)", async () => {
    const { reportLines, blockError } = runCapabilityGates({
      cfg: {},
      gitData: SECRET_GIT,
      plans: [],
      skipGates: ["security"],
    });
    assert.ok(reportLines.includes("security: skipped"), reportLines.join("\n"));
    assert.equal(blockError, null, "a skipped gate never blocks");
  });

  test("config-disable AND skipGates for different gates are both respected", async () => {
    const { reportLines, blockError } = runCapabilityGates({
      cfg: { gates: { security: false } },
      gitData: SECRET_GIT,
      plans: [],
      skipGates: ["tdd_audit"],
    });
    assert.ok(reportLines.includes("security: skipped"), reportLines.join("\n"));
    assert.ok(reportLines.includes("tdd_audit: skipped"), reportLines.join("\n"));
    assert.equal(blockError, null);
  });

  test("D-09: tdd-audit fails a type:tdd plan with only a feat: commit regardless of tdd_mode", async () => {
    // cfg carries NO tdd_mode (and this repo's config has tdd_mode: false) — yet
    // the tdd-audit gate still enforces RED→GREEN on a type:tdd plan.
    const { reportLines, blockError } = runCapabilityGates({
      cfg: {},
      gitData: { changedFiles: [], contentMap: {}, commitSubjects: ["feat(08-01): b"] },
      plans: [{ id: "GSD-08-x-01", phase: "8", plan: "1", type: "tdd" }],
      skipGates: [],
    });
    assert.ok(reportLines.some((l) => l.startsWith("tdd_audit: fail")), reportLines.join("\n"));
    assert.ok(blockError && blockError.includes("tdd_audit"), "tdd_audit failure blocks");
  });

  test("D-09: a type:tdd plan with test: before feat: passes (RED→GREEN honored)", async () => {
    const { reportLines, blockError } = runCapabilityGates({
      cfg: {},
      gitData: { changedFiles: [], contentMap: {}, commitSubjects: ["test(08-01): a", "feat(08-01): b"] },
      plans: [{ id: "GSD-08-x-01", phase: "8", plan: "1", type: "tdd" }],
      skipGates: [],
    });
    assert.ok(reportLines.includes("tdd_audit: pass"), reportLines.join("\n"));
    assert.equal(blockError, null);
  });

  test("skipping the failing gate unblocks the ship while it stays reported", async () => {
    const { reportLines, blockError } = runCapabilityGates({
      cfg: {},
      gitData: SECRET_GIT,
      plans: [],
      skipGates: ["security"],
    });
    assert.ok(reportLines.includes("security: skipped"), reportLines.join("\n"));
    assert.equal(blockError, null, "opt-out via skipGates unblocks without hiding the gate");
  });
});

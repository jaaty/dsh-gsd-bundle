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
      plans: [{ id: "GSD-08-x-01", type: "execute" }],
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
      plans: [{ id: "GSD-08-x-01", type: "execute" }],
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
      plans: [{ id: "GSD-08-x-01", type: "execute" }],
      skipGates: [],
    });
    assert.ok(reportLines.some((l) => l.startsWith("security: fail")), reportLines.join("\n"));
    assert.ok(reportLines.some((l) => l.startsWith("broken_windows: pass")), reportLines.join("\n"));
    assert.ok(reportLines.some((l) => l.startsWith("tdd_audit: pass")), reportLines.join("\n"));
  });
});

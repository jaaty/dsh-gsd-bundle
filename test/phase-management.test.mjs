// Pure unit tests for lib/phase-management.js — CRUD actions, D-03/D-08
// destructive guards, D-04 hard invariants, and the fail-closed unmutated-input
// property. Mirrors the structure of test/_shared.test.mjs.

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { validateRoadmapDoc, renumber, applyPhaseAction } from "../lib/phase-management.js";
import { stringifyRoadmap, parseRoadmap } from "../lib/_shared.js";

const REQ_IDS = new Set(["X-01", "X-02", "X-03"]);

function sampleDoc() {
  return {
    milestoneName: "M",
    version: "v1",
    phases: [
      { n: 1, slug: "a", name: "A", goal: "g1", requirements: ["X-01"], status: "pending" },
      { n: 2, slug: "b", name: "B", goal: "g2", requirements: ["X-02"], status: "Complete" },
    ],
  };
}

function roundTrip(doc) {
  return parseRoadmap(stringifyRoadmap(doc));
}

describe("add", () => {
  test("assigns n = max+1 and appears in phase table and ## Progress table", () => {
    const doc = sampleDoc();
    const r = applyPhaseAction(doc, { op: "add", name: "C", goal: "g3", requirements: ["X-03"] }, { reqIds: REQ_IDS, activePhase: null, confirm: false });
    assert.equal(r.ok, true);
    assert.equal(r.doc.phases.length, 3);
    assert.equal(r.doc.phases[2].n, 3);
    assert.equal(r.doc.phases[2].slug, "c");
    const rt = roundTrip(r.doc);
    assert.equal(rt.phases.length, 3);
    assert.equal(rt.phases[2].name, "C");
    assert.deepEqual(rt.phases[2].requirements, ["X-03"]);
  });

  test("add with status Complete yields status Complete", () => {
    const doc = sampleDoc();
    const r = applyPhaseAction(doc, { op: "add", name: "C", goal: "g3", requirements: ["X-03"], status: "Complete" }, { reqIds: REQ_IDS, activePhase: null, confirm: false });
    assert.equal(r.ok, true);
    assert.equal(r.doc.phases[2].status, "Complete");
  });

  test("add to empty phases assigns n = 1", () => {
    const doc = { milestoneName: "M", version: "v1", phases: [] };
    const r = applyPhaseAction(doc, { op: "add", name: "A", goal: "g1", requirements: ["X-01"] }, { reqIds: REQ_IDS, activePhase: null, confirm: false });
    assert.equal(r.ok, true);
    assert.equal(r.doc.phases[0].n, 1);
  });
});

describe("insert", () => {
  test("lands at the given 0-based index and renumbers contiguously", () => {
    const doc = sampleDoc();
    const r = applyPhaseAction(doc, { op: "insert", at: 1, name: "C", goal: "g3", requirements: ["X-03"] }, { reqIds: REQ_IDS, activePhase: null, confirm: false });
    assert.equal(r.ok, true);
    assert.deepEqual(r.doc.phases.map((p) => p.name), ["A", "C", "B"]);
    assert.deepEqual(r.doc.phases.map((p) => p.n), [1, 2, 3]);
    const rt = roundTrip(r.doc);
    assert.deepEqual(rt.phases.map((p) => p.name), ["A", "C", "B"]);
    assert.deepEqual(rt.phases.map((p) => p.n), [1, 2, 3]);
  });

  test("out-of-range at returns INVALID_INDEX and leaves input unmutated", () => {
    const doc = sampleDoc();
    const before = JSON.parse(JSON.stringify(doc));
    const r = applyPhaseAction(doc, { op: "insert", at: 99, name: "C", goal: "g3", requirements: ["X-03"] }, { reqIds: REQ_IDS, activePhase: null, confirm: false });
    assert.equal(r.ok, false);
    assert.equal(r.code, "INVALID_INDEX");
    assert.deepEqual(doc, before);
  });
});

describe("remove", () => {
  test("deletes the phase, renumbers, and removes it from both tables", () => {
    const doc = sampleDoc();
    const r = applyPhaseAction(doc, { op: "remove", n: 1, confirm: true }, { reqIds: REQ_IDS, activePhase: null, confirm: true });
    assert.equal(r.ok, true);
    assert.deepEqual(r.doc.phases.map((p) => p.name), ["B"]);
    assert.deepEqual(r.doc.phases.map((p) => p.n), [1]);
    const rt = roundTrip(r.doc);
    assert.deepEqual(rt.phases.map((p) => p.name), ["B"]);
  });

  test("remove of a Complete phase returns COMPLETE_PHASE_LOCKED", () => {
    const doc = sampleDoc();
    const before = JSON.parse(JSON.stringify(doc));
    const r = applyPhaseAction(doc, { op: "remove", n: 2, confirm: true }, { reqIds: REQ_IDS, activePhase: null, confirm: true });
    assert.equal(r.ok, false);
    assert.equal(r.code, "COMPLETE_PHASE_LOCKED");
    assert.deepEqual(doc, before);
  });

  test("remove of the active phase without confirm returns ACTIVE_REMOVE_REQUIRES_YES", () => {
    const doc = sampleDoc();
    const before = JSON.parse(JSON.stringify(doc));
    const r = applyPhaseAction(doc, { op: "remove", n: 1, confirm: false }, { reqIds: REQ_IDS, activePhase: 1, confirm: false });
    assert.equal(r.ok, false);
    assert.equal(r.code, "ACTIVE_REMOVE_REQUIRES_YES");
    assert.deepEqual(doc, before);
  });

  test("remove of the active phase with confirm succeeds", () => {
    const doc = sampleDoc();
    const r = applyPhaseAction(doc, { op: "remove", n: 1, confirm: true }, { reqIds: REQ_IDS, activePhase: 1, confirm: true });
    assert.equal(r.ok, true);
    assert.deepEqual(r.doc.phases.map((p) => p.name), ["B"]);
  });

  test("remove of the last pending phase without confirm returns LAST_PENDING_REQUIRES_YES", () => {
    const doc = sampleDoc();
    const before = JSON.parse(JSON.stringify(doc));
    const r = applyPhaseAction(doc, { op: "remove", n: 1, confirm: false }, { reqIds: REQ_IDS, activePhase: null, confirm: false });
    assert.equal(r.ok, false);
    assert.equal(r.code, "LAST_PENDING_REQUIRES_YES");
    assert.deepEqual(doc, before);
  });

  test("remove of the last pending phase with confirm succeeds", () => {
    const doc = sampleDoc();
    const r = applyPhaseAction(doc, { op: "remove", n: 1, confirm: true }, { reqIds: REQ_IDS, activePhase: null, confirm: true });
    assert.equal(r.ok, true);
    assert.deepEqual(r.doc.phases.map((p) => p.name), ["B"]);
  });
});

describe("reorder", () => {
  test("moves a pending non-active phase to the target index and renumbers", () => {
    const doc = {
      milestoneName: "M", version: "v1",
      phases: [
        { n: 1, slug: "a", name: "A", goal: "g1", requirements: ["X-01"], status: "pending" },
        { n: 2, slug: "b", name: "B", goal: "g2", requirements: ["X-02"], status: "pending" },
        { n: 3, slug: "c", name: "C", goal: "g3", requirements: ["X-03"], status: "pending" },
      ],
    };
    const r = applyPhaseAction(doc, { op: "reorder", n: 3, to: 0, confirm: false }, { reqIds: REQ_IDS, activePhase: null, confirm: false });
    assert.equal(r.ok, true);
    assert.deepEqual(r.doc.phases.map((p) => p.name), ["C", "A", "B"]);
    assert.deepEqual(r.doc.phases.map((p) => p.n), [1, 2, 3]);
  });

  test("reorder of a Complete phase returns COMPLETE_PHASE_LOCKED", () => {
    const doc = sampleDoc();
    const before = JSON.parse(JSON.stringify(doc));
    const r = applyPhaseAction(doc, { op: "reorder", n: 2, to: 0, confirm: false }, { reqIds: REQ_IDS, activePhase: null, confirm: false });
    assert.equal(r.ok, false);
    assert.equal(r.code, "COMPLETE_PHASE_LOCKED");
    assert.deepEqual(doc, before);
  });

  test("reorder of the active phase returns ACTIVE_REORDER_BLOCKED", () => {
    const doc = sampleDoc();
    const before = JSON.parse(JSON.stringify(doc));
    const r = applyPhaseAction(doc, { op: "reorder", n: 1, to: 1, confirm: true }, { reqIds: REQ_IDS, activePhase: 1, confirm: true });
    assert.equal(r.ok, false);
    assert.equal(r.code, "ACTIVE_REORDER_BLOCKED");
    assert.deepEqual(doc, before);
  });

  test("reorder to an out-of-range index returns INVALID_INDEX", () => {
    const doc = sampleDoc();
    const before = JSON.parse(JSON.stringify(doc));
    const r = applyPhaseAction(doc, { op: "reorder", n: 1, to: 5, confirm: false }, { reqIds: REQ_IDS, activePhase: null, confirm: false });
    assert.equal(r.ok, false);
    assert.equal(r.code, "INVALID_INDEX");
    assert.deepEqual(doc, before);
  });
});

describe("edit", () => {
  test("name, goal, requirements, and status toggle all round-trip", () => {
    const doc = sampleDoc();
    const r = applyPhaseAction(doc, { op: "edit", n: 1, name: "Alpha", goal: "new goal", requirements: ["X-03"], status: "Complete" }, { reqIds: REQ_IDS, activePhase: null, confirm: false });
    assert.equal(r.ok, true);
    const p = r.doc.phases[0];
    assert.equal(p.name, "Alpha");
    assert.equal(p.slug, "alpha");
    assert.equal(p.goal, "new goal");
    assert.deepEqual(p.requirements, ["X-03"]);
    assert.equal(p.status, "Complete");
    const rt = roundTrip(r.doc);
    assert.equal(rt.phases[0].name, "Alpha");
    assert.equal(rt.phases[0].status, "Complete");
  });

  test("status toggle Complete -> pending is permitted", () => {
    const doc = sampleDoc();
    const r = applyPhaseAction(doc, { op: "edit", n: 2, status: "pending" }, { reqIds: REQ_IDS, activePhase: null, confirm: false });
    assert.equal(r.ok, true);
    assert.equal(r.doc.phases[1].status, "pending");
  });

  test("edit to an empty goal returns EMPTY_GOAL", () => {
    const doc = sampleDoc();
    const before = JSON.parse(JSON.stringify(doc));
    const r = applyPhaseAction(doc, { op: "edit", n: 1, goal: "  " }, { reqIds: REQ_IDS, activePhase: null, confirm: false });
    assert.equal(r.ok, false);
    assert.equal(r.code, "EMPTY_GOAL");
    assert.deepEqual(doc, before);
  });

  test("edit to an empty requirements array returns EMPTY_REQUIREMENTS", () => {
    const doc = sampleDoc();
    const before = JSON.parse(JSON.stringify(doc));
    const r = applyPhaseAction(doc, { op: "edit", n: 1, requirements: [] }, { reqIds: REQ_IDS, activePhase: null, confirm: false });
    assert.equal(r.ok, false);
    assert.equal(r.code, "EMPTY_REQUIREMENTS");
    assert.deepEqual(doc, before);
  });

  test("edit to an invalid status returns INVALID_STATUS", () => {
    const doc = sampleDoc();
    const before = JSON.parse(JSON.stringify(doc));
    const r = applyPhaseAction(doc, { op: "edit", n: 1, status: "bogus" }, { reqIds: REQ_IDS, activePhase: null, confirm: false });
    assert.equal(r.ok, false);
    assert.equal(r.code, "INVALID_STATUS");
    assert.deepEqual(doc, before);
  });
});

describe("hard invariants (D-04)", () => {
  test("a phase referencing a req not in reqIds returns UNKNOWN_REQ_ID", () => {
    const doc = sampleDoc();
    const before = JSON.parse(JSON.stringify(doc));
    const r = applyPhaseAction(doc, { op: "add", name: "C", goal: "g3", requirements: ["NOPE-99"] }, { reqIds: REQ_IDS, activePhase: null, confirm: false });
    assert.equal(r.ok, false);
    assert.equal(r.code, "UNKNOWN_REQ_ID");
    assert.deepEqual(doc, before);
  });

  test("two phases with the same slugify(name) return DUPLICATE_SLUG", () => {
    const doc = sampleDoc();
    const before = JSON.parse(JSON.stringify(doc));
    const r = applyPhaseAction(doc, { op: "add", name: "A!", goal: "g3", requirements: ["X-03"] }, { reqIds: REQ_IDS, activePhase: null, confirm: false });
    assert.equal(r.ok, false);
    assert.equal(r.code, "DUPLICATE_SLUG");
    assert.deepEqual(doc, before);
  });

  test("two phases with the same name return DUPLICATE_NAME", () => {
    // Same name but distinct slugs (hand-crafted doc) exercises the name check
    // independently of the slug check.
    const doc = {
      milestoneName: "M", version: "v1",
      phases: [
        { n: 1, slug: "a", name: "A", goal: "g1", requirements: ["X-01"], status: "pending" },
        { n: 2, slug: "a-2", name: "A", goal: "g2", requirements: ["X-02"], status: "pending" },
      ],
    };
    const r = validateRoadmapDoc(doc, REQ_IDS);
    assert.equal(r.ok, false);
    assert.equal(r.code, "DUPLICATE_NAME");
  });

  test("validateRoadmapDoc rejects a doc without a phases array", () => {
    const r = validateRoadmapDoc({ milestoneName: "M" }, REQ_IDS);
    assert.equal(r.ok, false);
    assert.equal(r.code, "ROADMAP_UNPARSEABLE");
  });

  test("unknown action op returns UNKNOWN_ACTION", () => {
    const doc = sampleDoc();
    const before = JSON.parse(JSON.stringify(doc));
    const r = applyPhaseAction(doc, { op: "frobnicate" }, { reqIds: REQ_IDS, activePhase: null, confirm: false });
    assert.equal(r.ok, false);
    assert.equal(r.code, "UNKNOWN_ACTION");
    assert.deepEqual(doc, before);
  });
});

describe("renumber", () => {
  test("returns a fresh array leaving the input unchanged", () => {
    const phases = [{ n: 5, slug: "a", name: "A" }, { n: 9, slug: "b", name: "B" }];
    const out = renumber(phases);
    assert.deepEqual(out.map((p) => p.n), [1, 2]);
    assert.deepEqual(phases.map((p) => p.n), [5, 9]);
    assert.notEqual(out, phases);
  });
});

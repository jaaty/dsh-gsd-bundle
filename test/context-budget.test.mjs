// Unit tests for the planningContext total-budget truncation (CQ-06) and the
// contextBudget single-source helper. No existing tests exercised planningContext
// before phase 16, so this suite is the verification surface for D-01…D-08.

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { planningContext } from "../lib/_runner.js";
import { contextBudget } from "../lib/_shared.js";

const OD = { maxPerFile: 60000, maxTotal: 0 };

describe("planningContext return shape", () => {
  test("returns { text, truncated } with truncated empty when nothing is cut", () => {
    const { text, truncated } = planningContext([
      { label: "a", content: "x" },
      { label: "b", content: "y" },
    ]);
    assert.equal(typeof text, "string");
    assert.ok(Array.isArray(truncated));
    assert.equal(truncated.length, 0);
    assert.match(text, /<planning_context>/);
    assert.match(text, /<\/planning_context>/);
    assert.match(text, /### a/);
    assert.match(text, /### b/);
    assert.match(text, /^x$/m);
    assert.match(text, /^y$/m);
  });
});

describe("planningContext per-file cap retained (D-08)", () => {
  test("content over maxPerFile is sliced, keeps the …(truncated)… marker, and is listed in truncated", () => {
    const { text, truncated } = planningContext([{ label: "BIG", content: "x".repeat(70000) }], OD.maxPerFile, OD.maxTotal);
    assert.match(text, /…\(truncated\)…/);
    assert.equal(truncated.length, 1);
    assert.equal(truncated[0].label, "BIG");
    assert.ok(truncated[0].keptChars < truncated[0].originalChars);
    assert.equal(truncated[0].originalChars, 70000);
  });
});

describe("planningContext total-budget trim (D-04)", () => {
  test("head entries are preserved; whole trailing entries are dropped (keptChars 0)", () => {
    const { text, truncated } = planningContext(
      [
        { label: "HEAD", content: "h".repeat(70000) },
        { label: "MID", content: "m".repeat(10000) },
        { label: "TAIL", content: "t".repeat(70000) },
      ],
      OD.maxPerFile,
      90000,
    );
    // HEAD and MID survive (head/earliest preserved).
    assert.match(text, /### HEAD/);
    assert.match(text, /### MID/);
    // The trailing entry is fully dropped.
    assert.ok(!/### TAIL/.test(text));
    const tail = truncated.find((t) => t.label === "TAIL");
    assert.ok(tail, "dropped entry must appear in truncated");
    assert.equal(tail.keptChars, 0);
    assert.ok(truncated.some((t) => t.label === "HEAD"));
  });

  test("when the remaining head alone still exceeds the budget, the last kept entry is trimmed to fit", () => {
    // Two entries summing over maxTotal by more than the trailing entry's length:
    // dropping TAIL alone does not fit, so the HEAD entry is trimmed to maxTotal.
    const headLen = 100;
    const tailLen = 100;
    const maxTotal = 90;
    const { text, truncated } = planningContext(
      [
        { label: "HEAD", content: "h".repeat(headLen) },
        { label: "TAIL", content: "t".repeat(tailLen) },
      ],
      OD.maxPerFile,
      maxTotal,
    );
    assert.match(text, /### HEAD/);
    assert.ok(!/### TAIL/.test(text));
    const tail = truncated.find((t) => t.label === "TAIL");
    assert.equal(tail.keptChars, 0);
    const head = truncated.find((t) => t.label === "HEAD");
    assert.ok(head, "trimmed head must be reported in truncated");
    assert.ok(head.keptChars > 0 && head.keptChars < head.originalChars);
    assert.equal(head.keptChars, maxTotal); // trimmed to exactly fit
  });

  test("maxTotal <= 0 means no total cap (D-08); per-file cap still applies", () => {
    for (const maxTotal of [0, -1]) {
      const { text, truncated } = planningContext(
        [
          { label: "A", content: "z".repeat(70000) },
          { label: "B", content: "w".repeat(70000) },
        ],
        OD.maxPerFile,
        maxTotal,
      );
      assert.match(text, /### A/);
      assert.match(text, /### B/); // no total-budget drop
      assert.equal(truncated.length, 2); // both still per-file capped
    }
  });
});

describe("planningContext exact-content dedup (D-07)", () => {
  test("identical content strings are injected once (first occurrence wins)", () => {
    const { text, truncated } = planningContext([
      { label: "A", content: "same" },
      { label: "B", content: "same" },
    ]);
    assert.equal((text.match(/same/g) || []).length, 1);
    assert.equal(truncated.length, 0);
  });

  test("a middle duplicate of the first entry is skipped", () => {
    const { text } = planningContext([
      { label: "A", content: "dup" },
      { label: "B", content: "different" },
      { label: "C", content: "dup" },
    ]);
    assert.match(text, /### A/);
    assert.match(text, /### B/);
    assert.ok(!/### C/.test(text));
    assert.equal((text.match(/dup/g) || []).length, 1);
  });
});

describe("planningContext entry filtering (D-08)", () => {
  test("empty, null, undefined, and whitespace-only entries are skipped", () => {
    const { text } = planningContext([
      { label: "EMPTY", content: "" },
      { label: "NULL", content: null },
      { label: "UNDEF", content: undefined },
      { label: "WS", content: "   " },
      { label: "OK", content: "real" },
    ]);
    assert.ok(!/### EMPTY/.test(text));
    assert.ok(!/### NULL/.test(text));
    assert.ok(!/### UNDEF/.test(text));
    assert.ok(!/### WS/.test(text));
    assert.match(text, /### OK/);
  });

  test("non-string content is coerced with String()", () => {
    const { text } = planningContext([{ label: "NUM", content: 123 }]);
    assert.match(text, /^123$/m);
  });
});

describe("planningContext inline audit notice (D-06)", () => {
  test("an audit line naming the truncated labels is present iff truncation occurred", () => {
    const audit = /\(\d+ entries truncated: .*\)/;
    const capped = planningContext([{ label: "BIG", content: "x".repeat(70000) }], 60000, 0);
    assert.match(capped.text, audit);
    assert.match(capped.text, /BIG/);
    const clean = planningContext([{ label: "OK", content: "x" }]);
    assert.ok(!audit.test(clean.text));
  });
});

describe("contextBudget (D-02/D-03)", () => {
  test("positive finite windows derive round(window * 0.45)", () => {
    assert.equal(contextBudget(200000), 90000);
    assert.equal(contextBudget(100000), 45000);
  });

  test("absent/unparsable/non-positive inputs fall back to 90000", () => {
    for (const v of [undefined, null, NaN, 0, -5, "abc", Infinity]) {
      assert.equal(contextBudget(v), 90000);
    }
  });

  test("never returns a value <= 0", () => {
    assert.ok(contextBudget(1) > 0);
    assert.ok(contextBudget(undefined) > 0);
  });
});

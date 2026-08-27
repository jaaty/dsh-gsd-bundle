// Regression tests for the Phase 12 single-source-constants dedup (CQ-02).
// Pins the invariant that the secret-file list lives in exactly one place
// (lib/_shared.js) and that the mapper/query FORBIDDEN FILES prose is derived
// from that same array, so the prompt text and the security-gate globs can
// never drift (D-01, D-04).

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { secretPatterns, forbiddenFilesProse } from "../lib/_shared.js";
import { CODEBASE_MAPPER_PROMPT, CODEBASE_QUERY_PROMPT } from "../lib/_agents.js";

const here = dirname(fileURLToPath(import.meta.url));
const gatesSource = readFileSync(join(here, "..", "lib", "gates.js"), "utf8");

describe("single-source secret list (CQ-02)", () => {
  test("forbiddenFilesProse() equals secretPatterns.join(', ')", async () => {
    assert.equal(forbiddenFilesProse(), secretPatterns.join(", "));
  });

  test("CODEBASE_MAPPER_PROMPT includes the canonical array join", async () => {
    assert.ok(CODEBASE_MAPPER_PROMPT.includes(secretPatterns.join(", ")));
  });

  test("CODEBASE_QUERY_PROMPT includes the canonical array join", async () => {
    assert.ok(CODEBASE_QUERY_PROMPT.includes(secretPatterns.join(", ")));
  });

  test("gates.js no longer owns secretPatterns (single source is _shared.js)", async () => {
    assert.ok(!gatesSource.includes("export const secretPatterns"));
  });
});

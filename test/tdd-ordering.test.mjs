// Regression test for the recurring tdd_audit ship-gate failure.
// The planner, plan-checker, and executor prompts must all require test-first
// task ordering for type: tdd plans, so the executor commits test: before
// feat:/fix: and the tdd_audit gate (lib/gates.js) passes at gsd_ship.

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { PLANNER_PROMPT, PLAN_CHECKER_PROMPT, EXECUTOR_PROMPT } from "../lib/_agents.js";

describe("tdd-ordering: prompts require test-first ordering for type: tdd plans", () => {
  test("PLANNER_PROMPT requires test task(s) before implementation task(s)", () => {
    assert.match(
      PLANNER_PROMPT,
      /BEFORE the implementation task/i,
      "planner must order test task(s) before implementation task(s) in <tasks>",
    );
    assert.match(
      PLANNER_PROMPT,
      /commits test: before feat:\/fix:/i,
      "planner must require the executor to commit test: before feat:/fix:",
    );
  });

  test("PLAN_CHECKER_PROMPT adds a TDD Ordering dimension", () => {
    assert.match(
      PLAN_CHECKER_PROMPT,
      /13 TDD Ordering/i,
      "plan-checker must include a TDD Ordering dimension",
    );
    assert.match(
      PLAN_CHECKER_PROMPT,
      /BLOCKER/i,
      "plan-checker must classify impl-before-test ordering as a BLOCKER",
    );
  });

  test("EXECUTOR_PROMPT requires a test: commit before any feat:/fix: commit", () => {
    assert.match(
      EXECUTOR_PROMPT,
      /commit a test: commit before any feat:\/fix:/i,
      "executor must commit test: before feat:/fix: even when the plan lists implementation first",
    );
  });
});

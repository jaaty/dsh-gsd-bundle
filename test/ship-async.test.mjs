// Tests for the Phase 15 async conversion and real-cause preflight reporting
// (plan 02, requirement CQ-05). Two concerns:
//   - preflightError(msg, cause?) — the exported pure builder that constructs the
//     preflight-failure Error: always carries the 'gsd_ship preflight failed:'
//     prefix, appends a trimmed/capped stderr (falling back to stdout) snippet
//     when a cause is given, and sets Error.cause to the original error.
//   - ship.js async conversion (static) — proves lib/ship.js no longer uses
//     execFileSync, uses promisify(execFile), awaits every git/gh/gitOk call
//     site, awaits fetchGitData, and exports preflightError.
//
// Style mirrors test/ship.test.mjs (node --test + node:assert/strict). No real
// git or filesystem is touched beyond reading the lib source.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { preflightError } from "../lib/ship.js";

describe("preflightError", () => {
  test("prefix + trimmed stderr snippet + Error.cause when a cause is given", () => {
    const cause = { stderr: "  error: src refspec does not match\n" };
    const err = preflightError("boom", cause);
    assert.ok(err.message.startsWith("gsd_ship preflight failed: boom"), "message starts with the prefix + msg");
    assert.ok(err.message.includes("error: src refspec does not match"), "message contains the trimmed stderr snippet");
    assert.ok(!err.message.includes("  error:"), "snippet is trimmed of leading whitespace");
    assert.equal(err.cause, cause, "Error.cause is the original error");
  });

  test("falls back to stdout snippet when stderr is absent", () => {
    const err = preflightError("boom", { stdout: "some stdout" });
    assert.ok(err.message.startsWith("gsd_ship preflight failed: boom"), "prefix + msg present");
    assert.ok(err.message.includes("some stdout"), "stdout snippet appended when no stderr");
  });

  test("no cause -> exact prefix message, no snippet, no cause property", () => {
    const err = preflightError("boom");
    assert.equal(err.message, "gsd_ship preflight failed: boom", "exact message with no snippet");
    assert.equal("cause" in err, false, "no cause property when none passed");
  });

  test("long stderr is capped so the message stays bounded", () => {
    const long = "x".repeat(2000);
    const err = preflightError("boom", { stderr: long });
    assert.ok(err.message.length < long.length, "message length is bounded below the raw stderr length");
    assert.ok(err.message.length < 600, "message stays under the 500-char snippet cap plus prefix");
  });
});

describe("ship.js async conversion (static)", () => {
  test("no execFileSync, promisify(execFile) present, every git/gh/gitOk call awaited", async () => {
    const src = await readFile(new URL("../lib/ship.js", import.meta.url), "utf8");
    assert.doesNotMatch(src, /execFileSync/, "no execFileSync remains in ship.js");
    assert.match(src, /promisify\(execFile\)/, "promisify(execFile) is used");
    assert.doesNotMatch(src, /(?<!await )(?<!function )\b(git|gh|gitOk)\(/, "no bare git/gh/gitOk call site (all awaited)");
  });

  test("fetchGitData is awaited and preflightError is exported", async () => {
    const src = await readFile(new URL("../lib/ship.js", import.meta.url), "utf8");
    assert.match(src, /await fetchGitData\(cwd, git, defaultBranch\)/, "fetchGitData awaited with the async git helper");
    assert.match(src, /export\s*\{\s*name,\s*inject,\s*apply,\s*preflightError(?:\s*,\s*runLearningsOnShip)?\s*\}/, "preflightError exported");
  });

  test("completion state is propagated to the clean branch (option C, stale-progress fix)", async () => {
    const src = await readFile(new URL("../lib/ship.js", import.meta.url), "utf8");
    // The completion-state commit must be cherry-picked onto the clean branch and
    // pushed, so main (via the clean PR) carries the ROADMAP/STATE completion markers
    // and the phase branch can be deleted without losing the record.
    assert.match(src, /if\s*\(cleanPr\s*&&\s*prBranch\s*!==\s*branch\)/, "clean-branch propagation is gated on a built clean branch");
    assert.match(src, /cherry-pick/, "completion-state commit is cherry-picked onto the clean branch");
    assert.match(src, /\["switch",\s*prBranch\]/, "switches to the clean branch to apply the completion state");
    assert.match(src, /\["push",\s*"origin",\s*prBranch\]/, "pushes the completion state to the clean branch");
  });
});

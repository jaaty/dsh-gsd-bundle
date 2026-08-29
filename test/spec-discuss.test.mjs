// Offline behavioural tests for D-09: gsd_discuss consumes an existing
// <NN>-SPEC.md as locked 'what/why' input. When the SPEC artefact exists, its
// Requirements / Boundaries / Acceptance Criteria are echoed into CONTEXT.md
// under a LOCKED-from-SPEC marker and the tool's return text tells the driving
// agent to focus the interview on 'how'. Absence of SPEC.md preserves today's
// behaviour exactly (no SPEC read, no LOCKED markers, unchanged specifics).
//
// Offline only (FakeFs + fake-ctx), no live DSH boot / LLM / git / gh: all git
// calls degrade to no-op warnings because cwd is a FakeFs non-repo path.

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { makeExec, CWD, mountSubset, initProject } from "./helpers/mount-harness.mjs";

const LOCKED_SPEC = [
  "# Phase 1: p1 - Spec",
  "## Requirements",
  "### REQLOCKED-cache",
  "**Target:** phase adds a cache",
  "**Acceptance:** cache TTL honored",
  "",
  "## Boundaries",
  "**In scope:** cache work",
  "**Out of scope:** eviction policy",
  "",
  "## Acceptance Criteria",
  "- cache TTL honored",
].join("\n");

function runDiscuss(ctx, args) {
  const t = ctx.tools.find((x) => x.name === "gsd_discuss");
  assert.ok(t, "gsd_discuss not registered");
  return t.execute(args, makeExec());
}

const DISCUSS_ARGS = {
  phase: 1,
  domain: { in_scope: "in", out_of_scope: "out" },
  decisions: [{ area: "A", items: [{ id: "D-01", text: "d" }] }],
  canonical_refs: [{ topic: "t", refs: ["path"] }],
  specifics: ["user-specific-1"],
};

describe("gsd_discuss consumes an existing SPEC.md as locked what/why (D-09)", () => {
  test("happy path: SPEC requirements echoed into CONTEXT marked LOCKED from SPEC", async () => {
    const { ctx } = await mountSubset(["state", "core-tools", "discuss"]);
    const gsdState = ctx.get("gsdState");
    assert.ok(gsdState, "gsdState not provided");

    await initProject(ctx);
    // Pre-write the SPEC artefact (what/why is already locked).
    await gsdState.writeArtifact(CWD, 1, "SPEC", LOCKED_SPEC);

    const res = await runDiscuss(ctx, DISCUSS_ARGS);
    assert.match(res, /Discuss complete.*phase 1/si);

    const cont = await gsdState.readArtifact(CWD, 1, "CONTEXT");
    assert.ok(cont.includes("LOCKED from SPEC"), "CONTEXT missing the LOCKED from SPEC marker");
    assert.ok(cont.includes("REQLOCKED-cache"), "CONTEXT missing the echoed SPEC requirement");
  });

  test("absence preservation: no SPEC.md -> no LOCKED markers, user specifics only", async () => {
    const { ctx } = await mountSubset(["state", "core-tools", "discuss"]);
    const gsdState = ctx.get("gsdState");
    assert.ok(gsdState, "gsdState not provided");

    await initProject(ctx);
    // NOTE: no SPEC pre-written.

    await runDiscuss(ctx, DISCUSS_ARGS);

    const cont = await gsdState.readArtifact(CWD, 1, "CONTEXT");
    assert.ok(!cont.includes("LOCKED from SPEC"), "absence CONTEXT wrongly contains the LOCKED marker");
    assert.ok(!cont.includes("SPEC.md locked what/why"), "absence CONTEXT wrongly contains the locked-guidance code_context line");
    assert.ok(cont.includes("user-specific-1"), "user-provided specifics not preserved in absence");
  });
});

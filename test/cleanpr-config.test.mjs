// @dsh-gsd/bundle/cleanpr-config — static assertions that the clean-PR
// branch off-switch is surfaced and documented (D-09 / GAP-01).
//
// Follows the repo's pure/static test seam: read source files via
// node:fs/promises and assert on their text, so the tests are hermetic (no
// network, no git, no runtime mount).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

async function readSource(rel) {
  return readFile(join(__dirname, rel), "utf8");
}

test("lib/state.js defaults clean_pr_branch: true inside the workflow block (D-09)", async () => {
  const src = await readSource("../lib/state.js");
  const workflowStart = src.indexOf("workflow: {");
  assert.ok(workflowStart >= 0, "workflow: { present");
  // The workflow object closes with a `},\n` line. Find its closing brace by
  // scanning forward and taking the first `}` that is followed by a comma then
  // end-of-line (the object's close), to bound the region cleanly.
  const rel = src.indexOf("workflow: {", workflowStart);
  const closeIdx = src.indexOf("},\n", rel);
  assert.ok(closeIdx > rel, "workflow object close brace found");
  const workflowBlock = src.slice(rel, closeIdx);

  const commitIdx = workflowBlock.indexOf("commit_docs: true,");
  const cleanIdx = workflowBlock.indexOf("clean_pr_branch: true,");
  assert.ok(commitIdx >= 0, "commit_docs: true, precedes clean_pr_branch");
  assert.ok(cleanIdx > commitIdx, "clean_pr_branch: true, ordered after commit_docs");
  assert.ok(
    src.indexOf("clean_pr_branch: true,") >= 0 && src.indexOf("clean_pr_branch: true,") < closeIdx,
    "clean_pr_branch: true, sits inside the workflow object (before the workflow close brace)"
  );
});

test("README documents the Clean-PR branch behaviour (D-01/D-05/D-07/D-09)", async () => {
  const src = await readSource("../README.md");
  assert.ok(src.includes("Clean-PR branch"), "README mentions Clean-PR branch");
  assert.ok(src.includes("phase-<N>-clean"), "README mentions the phase-<N>-clean naming");
});

// Direct unit tests for the checkpoint helpers in lib/_checkpoint.js (D-05).
// The helpers delegate all I/O to the gsdState service (s), so they are tested
// with a minimal in-memory fake s backed by a Map.

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { validateCheckpointTask, prepareCheckpoint, processCheckpoint } from "../lib/_checkpoint.js";

// Minimal fake gsdState service: hasArtifact/readArtifact/writeArtifact backed by
// a Map keyed by `${cwd}|${phase}|${suffix}`; updateJob records the call.
function fakeS() {
  const map = new Map();
  const updateCalls = [];
  return {
    map,
    updateCalls,
    async hasArtifact(cwd, phase, suffix) {
      return map.has(`${cwd}|${phase}|${suffix}`);
    },
    async readArtifact(cwd, phase, suffix) {
      return map.get(`${cwd}|${phase}|${suffix}`);
    },
    async writeArtifact(cwd, phase, suffix, content) {
      map.set(`${cwd}|${phase}|${suffix}`, content);
    },
    async updateJob(cwd, id, patch) {
      updateCalls.push({ cwd, id, patch });
      return true;
    },
  };
}

const CWD = "/proj";
const PHASE = 14;
const p = { id: "GSD-14-execute-checkpoint-01", plan: "01", task_count: 2 };

describe("validateCheckpointTask (shared predicate, CQ-04)", () => {
  test("accepts a valid in-range integer", async () => {
    assert.doesNotThrow(() => validateCheckpointTask(1, 2, "boom"));
  });

  test("throws with the exact message passed for invalid values", async () => {
    for (const n of [0, 2, 1.5, "x", undefined, null]) {
      assert.throws(() => validateCheckpointTask(n, 2, "custom message"), /custom message/);
    }
  });
});

describe("prepareCheckpoint", () => {
  test("valid checkpoint builds the RESUME instruction", async () => {
    const s = fakeS();
    s.map.set(`${CWD}|${PHASE}|CHECKPOINT-01`, "---\nlast_completed_task: 1\nhuman_answer: use pg\n---\nctx");
    const r = await prepareCheckpoint(s, { cwd: CWD, phase: PHASE, p, answer: "", decisionId: "" });
    assert.equal(r.awaiting, false);
    assert.match(r.resumeInstr, /RESUME from checkpoint/);
    assert.match(r.resumeInstr, /begin at task 2/);
    assert.match(r.resumeInstr, /Prior checkpoint context/);
  });

  test("invalid/out-of-range checkpoint fails loud with the artefact message", async () => {
    const s = fakeS();
    s.map.set(`${CWD}|${PHASE}|CHECKPOINT-01`, "---\nlast_completed_task: 9\n---\n");
    await assert.rejects(
      () => prepareCheckpoint(s, { cwd: CWD, phase: PHASE, p, answer: "", decisionId: "" }),
      /invalid CHECKPOINT-01/
    );
  });

  test("awaiting gate returns awaiting:true and a marker when no answer is available", async () => {
    const s = fakeS();
    s.map.set(`${CWD}|${PHASE}|CHECKPOINT-01`, "---\nlast_completed_task: 1\ndecision_id: GSD-14-execute-checkpoint-01-ck1\ncheckpoint_kind: decision\ncheckpoint_reason: Which db?\n---\n");
    const r = await prepareCheckpoint(s, { cwd: CWD, phase: PHASE, p, answer: "", decisionId: "" });
    assert.equal(r.awaiting, true);
    assert.ok(r.marker.startsWith("GSD_AWAITING_HUMAN"), "marker prefix");
    assert.match(r.marker, /checkpoint:decision/);
    assert.match(r.marker, /decision_id=GSD-14-execute-checkpoint-01-ck1/);
  });

  test("answer binding persists human_answer and appends the human-answered line", async () => {
    const s = fakeS();
    s.map.set(`${CWD}|${PHASE}|CHECKPOINT-01`, "---\nlast_completed_task: 1\ndecision_id: GSD-14-execute-checkpoint-01-ck1\ncheckpoint_kind: decision\ncheckpoint_reason: Which db?\n---\n");
    const r = await prepareCheckpoint(s, {
      cwd: CWD, phase: PHASE, p,
      answer: "use pg", decisionId: "GSD-14-execute-checkpoint-01-ck1",
    });
    assert.equal(r.awaiting, false);
    assert.match(r.resumeInstr, /human answered GSD-14-execute-checkpoint-01-ck1 = use pg/);
    const persisted = s.map.get(`${CWD}|${PHASE}|CHECKPOINT-01`);
    assert.match(persisted, /human_answer: "use pg"/);
  });

  test("context-reset resume uses the persisted human_answer with no args", async () => {
    const s = fakeS();
    s.map.set(`${CWD}|${PHASE}|CHECKPOINT-01`, "---\nlast_completed_task: 1\ndecision_id: GSD-14-execute-checkpoint-01-ck1\nhuman_answer: use pg\n---\n");
    const r = await prepareCheckpoint(s, { cwd: CWD, phase: PHASE, p, answer: "", decisionId: "" });
    assert.equal(r.awaiting, false);
    assert.match(r.resumeInstr, /human answered GSD-14-execute-checkpoint-01-ck1 = use pg/);
  });
});

describe("processCheckpoint", () => {
  test("persists the CHECKPOINT artefact and reconciles the job", async () => {
    const s = fakeS();
    const r = {
      structured: {
        checkpoint: {
          last_completed_task: 1,
          checkpoint_reason: "r",
          committed_hashes: ["a"],
          checkpoint_kind: "decision",
        },
      },
      output: "o",
      stopReason: "checkpoint",
      diagnostic: "d",
    };
    const log = [];
    const out = await processCheckpoint(s, { cwd: CWD, phase: PHASE, p, r, job: { id: "JOB-01" }, log, w: 1 });
    assert.equal(out.checkpointed, true);
    assert.equal(out.checkpointed_at, 1);
    assert.equal(out.ok, false);
    const persisted = s.map.get(`${CWD}|${PHASE}|CHECKPOINT-01`);
    assert.match(persisted, /plan: GSD-14-execute-checkpoint-01/);
    assert.match(persisted, /last_completed_task: 1/);
    assert.match(persisted, /decision_id: GSD-14-execute-checkpoint-01-ck1/);
    assert.deepEqual(s.updateCalls, [
      { cwd: CWD, id: "JOB-01", patch: { status: "done", result: "checkpointed (resumable)" } },
    ]);
    assert.equal(log.length, 0);
  });

  test("invalid structured checkpoint fails loud with the executor message", async () => {
    const s = fakeS();
    const r = { structured: { checkpoint: { last_completed_task: 9 } }, output: "o", stopReason: "checkpoint", diagnostic: "d" };
    await assert.rejects(
      () => processCheckpoint(s, { cwd: CWD, phase: PHASE, p, r, job: { id: "JOB-01" }, log: [], w: 1 }),
      /executor returned invalid checkpoint/
    );
  });
});

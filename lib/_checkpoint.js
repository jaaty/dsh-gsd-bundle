// @dsh-gsd/bundle checkpoint helpers — the prepare/process logic extracted from
// lib/execute.js (gsd_execute) so it is unit-testable with a fake gsdState
// service. These helpers are NOT pure: they delegate all I/O to the gsdState
// service (s) passed as a parameter (D-01). They are not added to _shared.js,
// which holds only pure, I/O-free helpers.
//
// Two helpers plus one shared validator:
//   - prepareCheckpoint  — the pre-dispatch path: read+validate the persisted
//     CHECKPOINT-<PP> artefact, build the RESUME instruction, run the awaiting
//     gate, and bind/persist a human answer.
//   - processCheckpoint  — the post-dispatch structured-checkpoint return:
//     validate last_completed_task, persist the CHECKPOINT-<PP> artefact, and
//     reconcile the job to done/checkpointed.
//   - validateCheckpointTask — the single shared predicate (CQ-04 "no duplicated
//     validation"). It does NOT construct the message; callers pass their exact
//     existing message string so D-03's no-error-message-change holds.

import { parseFrontmatter, stringifyFrontmatter, zeroPad, decisionIdFor, awaitingDecision, awaitingMarker } from "./_shared.js";

// Shared validation predicate for a checkpoint's last_completed_task. Throws
// when the value is not a positive integer strictly below task_count. The
// message is supplied by the caller so each call site keeps its exact error
// string (D-03).
export function validateCheckpointTask(n, taskCount, message) {
  if (!Number.isInteger(n) || n < 1 || n >= taskCount) {
    throw new Error(message);
  }
}

// Pre-dispatch checkpoint handling (execute.js lines 110-164). Reads the
// persisted CHECKPOINT-<PP> artefact when present, validates it, builds the
// RESUME instruction, runs the awaiting gate, and binds/persists a human answer.
// Returns { resumeInstr, checkpointFm, awaiting, marker } — marker is present
// only when awaiting (the caller must NOT dispatch an awaiting plan).
export async function prepareCheckpoint(s, { cwd, phase, p, answer, decisionId }) {
  const cpSuffix = `CHECKPOINT-${zeroPad(Number(p.plan))}`;
  let resumeInstr = "";
  let checkpointFm = null;
  if (await s.hasArtifact(cwd, phase, cpSuffix)) {
    const cpText = await s.readArtifact(cwd, phase, cpSuffix);
    const { frontmatter } = parseFrontmatter(cpText);
    checkpointFm = frontmatter;
    const n = frontmatter.last_completed_task;
    validateCheckpointTask(n, p.task_count, `gsd_execute: invalid ${cpSuffix} artefact for plan ${p.id}: last_completed_task=${n}, task_count=${p.task_count}`);
    resumeInstr = `RESUME from checkpoint: tasks 1..${n} are done; begin at task ${n + 1}. Prior checkpoint context:\n${cpText}`;
  }
  // Awaiting gate: if the plan is checkpointed but no human answer is available
  // (neither a matching answer+decision_id on this call nor a persisted
  // human_answer), do NOT execute; emit the marker instead.
  const awaiting = checkpointFm ? awaitingDecision(checkpointFm, answer, decisionId) : false;
  if (awaiting) {
    return {
      resumeInstr: "",
      checkpointFm,
      awaiting: true,
      marker: awaitingMarker({
        plan: p.id,
        decision_id: checkpointFm.decision_id || decisionIdFor(p.id, checkpointFm.last_completed_task),
        kind: checkpointFm.checkpoint_kind || "decision",
        question: checkpointFm.checkpoint_reason || "",
      }),
    };
  }
  // Not awaiting — an answer is available, either from this call's matching
  // answer+decision_id or from a persisted human_answer. Bind it into the resume
  // instruction and, when this call supplied a matching answer, persist it so a
  // context-reset resume carries it. A stale/non-matching decision_id never
  // reaches this block (awaiting would be true) — it is ignored, no error.
  if (checkpointFm) {
    const storedDecisionId = checkpointFm.decision_id || decisionIdFor(p.id, checkpointFm.last_completed_task);
    const suppliedAnswer = typeof answer === "string" && answer.trim() !== "";
    const suppliedMatches = suppliedAnswer
      && typeof decisionId === "string"
      && typeof checkpointFm.decision_id === "string"
      && decisionId === checkpointFm.decision_id;
    // Persist a this-call answer into the CHECKPOINT frontmatter (route through
    // s.writeArtifact — never raw node:fs). Preserve the double-read: re-read
    // the artefact to get the freshest frontmatter before writing human_answer.
    if (suppliedMatches) {
      const cpText = await s.readArtifact(cwd, phase, cpSuffix);
      const { frontmatter } = parseFrontmatter(cpText);
      frontmatter.human_answer = answer;
      await s.writeArtifact(cwd, phase, cpSuffix, stringifyFrontmatter(frontmatter));
    }
    // The answer text: this call's answer when it supplied a matching one, else
    // the persisted human_answer (context-reset case).
    const ans = suppliedMatches ? answer : (checkpointFm.human_answer || "");
    resumeInstr += `\nRESUME from checkpoint: human answered ${storedDecisionId} = ${ans}`;
  }
  return { resumeInstr, checkpointFm, awaiting: false, marker: null };
}

// Post-dispatch structured-checkpoint return (execute.js lines 196-218).
// Validates the executor's structured checkpoint, persists the CHECKPOINT-<PP>
// artefact, and reconciles the running job to done/checkpointed. Returns the
// result object the caller folds into its results list. Does NOT fold the
// non-checkpoint SUMMARY-wins cleanup or its job reconcile (D-02).
export async function processCheckpoint(s, { cwd, phase, p, r, job, log, w }) {
  const cp = r.structured?.checkpoint;
  validateCheckpointTask(cp.last_completed_task, p.task_count, `gsd_execute: executor returned invalid checkpoint for plan ${p.id}: last_completed_task=${cp.last_completed_task}, task_count=${p.task_count}`);
  await s.writeArtifact(cwd, phase, `CHECKPOINT-${zeroPad(Number(p.plan))}`, stringifyFrontmatter({
    plan: p.id,
    last_completed_task: cp.last_completed_task,
    checkpoint_reason: cp.checkpoint_reason ?? null,
    committed_hashes: cp.committed_hashes ?? [],
    // Persist the decision kind so the awaiting marker can name it, and a
    // deterministic decision_id so a turn-2 answer can be matched exactly.
    checkpoint_kind: cp.checkpoint_kind ?? "decision",
    decision_id: decisionIdFor(p.id, cp.last_completed_task),
  }));
  // Reconcile the running job to a terminal status. A checkpoint stop is a
  // resumable (non-failure) stop, so the job records 'done' with a 'checkpointed'
  // result rather than being left 'running'.
  if (job) {
    const updated = await s.updateJob(cwd, job.id, { status: "done", result: "checkpointed (resumable)" }).catch(() => null);
    if (!updated) log.push(`wave ${w}: ${p.id} job ${job.id} reconcile skipped (record absent)`);
  }
  return { p, ok: false, checkpointed: true, checkpointed_at: cp.last_completed_task, out: r.output, stopReason: r.stopReason, diagnostic: r.diagnostic };
}

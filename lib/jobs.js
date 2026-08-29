// @dsh-gsd/bundle/jobs — the real background-job runtime domain.
//
// launchJob records a job `pending` in the async-jobs manifest and drains it
// through the FIFO scheduler (scheduleJobs). Shell jobs spawn a detached child
// (lib/job-wrapper.mjs) that runs a command and writes a per-job result file;
// subagent jobs start an in-process detached subagent via the host `subagents`
// service whose settled output is written to the SAME per-job result file
// (JOBX-01). reconcileJobs reads each running shell job's result file and flips
// it to `done`/`failed` with a structured `reason` (JOBX-02). gsd_status calls
// reconcileJobs before rendering so it reflects real async state (D-05).
//
// Persistence goes through the gsdState accessors (s.appendJob / s.updateJob) —
// the single choke point for the manifest (DUR-04). Result-file reads go through
// ctx.fs with a stat-guard so a missing file means "still running", never a throw
// (D-06). Every job/runtime path — reconcile, scheduler, cancel, retry — degrades
// gracefully over a missing/corrupt manifest or result file (D-09).

import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { blocksToText, nowIso } from "./_shared.js";
import { resolveJobsConfig } from "./state.js";

// Absolute path to the detached wrapper script this module spawns.
const WRAPPER = fileURLToPath(new URL("./job-wrapper.mjs", import.meta.url));

// In-flight run registry: jobId -> { kind, handle }. For `shell` the handle is
// the detached child; for `subagent` it is { controller, timedOut, cancelled,
// dispose }. cancelJob/timeout reach in here to abort a running subagent run.
// The subagent `.then` is the ONLY place a subagent entry is removed from `live`
// (so the flag read inside the `.then` always finds its live record).
//
// The registry is NOT a module-level singleton: it is owned by a per-fiber jobs
// runtime service (DEGR-06) created by createJobsRuntime() and provided by
// core-tools under the 'gsdJobsRuntime' key. Every domain function receives the
// runtime as its FIRST parameter and reads `runtime.live`, so unloading/HMR of
// the owning fiber can cancel every running job (see cancelAll in Task 2).
export function createJobsRuntime() {
  return { live: new Map() };
}

// Truncate a result summary line to a bounded length for the manifest.
function truncate(s, n = 120) {
  const t = String(s ?? "").trim();
  return t.length > n ? `${t.slice(0, n)}…` : t;
}

function firstLine(s) {
  return String(s ?? "").split(/\r?\n/)[0].trim();
}

// Launch a background job. Records it `pending`, then drains the FIFO queue via
// scheduleJobs (an under-capacity launch promotes to running immediately, so a
// caller sees a `running` job when concurrency allows). Shell opts: command
// argv array, optional cwd; subagent opts: prompt, label, provider, outputSchema,
// parent. Both accept an optional `timeout` seconds (default from jobs config).
// The returned job reflects its real (possibly promoted) manifest status.
export async function launchJob(runtime, ctx, s, cwd, opts = {}) {
  const kind = opts.kind || "shell";
  const jobsCfg = resolveJobsConfig(await s.readConfig(cwd));
  const timeout = opts.timeout ?? jobsCfg.timeout;
  const payload = kind === "subagent"
    ? { prompt: opts.prompt, label: opts.label, provider: opts.provider, outputSchema: opts.outputSchema, parent: opts.parent }
    : { command: opts.command || [], jobCwd: opts.cwd };
  const job = await s.appendJob(cwd, { kind, status: "pending", ...payload, attempts: 1, timeout });
  await scheduleJobs(runtime, ctx, s, cwd);
  const { entries } = await s.readJobs(cwd);
  return entries.find((e) => e.id === job.id) || job;
}

// Actually spawn/start a single entry that has been promoted to running. The
// canonical spawner used by scheduleJobs. Shell spawns the detached wrapper
// (new optional timeout argv); subagent starts an in-process run via the host
// `subagents` service with a job-owned AbortSignal (D-01 — NOT exec.signal).
async function startRun(runtime, ctx, s, cwd, entry, jobsCfg) {
  if (entry.kind === "subagent") {
    await startSubagentRun(runtime, ctx, s, cwd, entry);
  } else {
    const resultFile = `${cwd}/.planning/jobs/${entry.id}.result.json`;
    const child = spawn(process.execPath, [WRAPPER, entry.id, resultFile, entry.timeout ?? "-", ...(entry.command || [])], {
      cwd: entry.jobCwd || cwd,
      detached: true,
      stdio: "ignore",
    });
    child.unref();
    runtime.live.set(entry.id, { kind: "shell", handle: child });
    await s.updateJob(cwd, entry.id, { status: "running", started: nowIso() });
  }
}

// Launch an in-process subagent job (JOBX-01, D-01/D-02). The run is started
// with a JOB-OWNED AbortController signal (the host requires a signal; we just
// don't bind it to the driving turn's exec.signal). `run.result.then` writes
// the per-job result file (D-02 shape), always disposes the run (OQ-6), records
// the terminal status + reason DIRECTLY via updateJob (the `.then` holds s/ctx),
// and removes the live entry — the only place a subagent entry is removed.
async function startSubagentRun(runtime, ctx, s, cwd, entry) {
  const subagents = ctx.get("subagents");
  if (!subagents) {
    await s.updateJob(cwd, entry.id, {
      status: "failed",
      result: "exit ? — subagents service unavailable",
      reason: { reason: "error", detail: "subagents service unavailable" },
    });
    return;
  }

  const ac = new AbortController();
  let run;
  try {
    run = await subagents.start(entry.provider || "spawn", {
      label: entry.label || "gsd job",
      prompt: [{ type: "text", text: entry.prompt }],
      parent: entry.parent,
      signal: ac.signal,
      ...(entry.outputSchema ? { outputSchema: entry.outputSchema } : {}),
    });
  } catch (err) {
    const detail = String((err && err.message) || err);
    await s.updateJob(cwd, entry.id, {
      status: "failed",
      result: `exit ? — ${truncate(detail)}`,
      reason: { reason: "error", detail },
    });
    return;
  }

  const rec = { controller: ac, timedOut: false, cancelled: false, dispose: run.dispose };
  runtime.live.set(entry.id, { kind: "subagent", handle: rec });
  await s.updateJob(cwd, entry.id, { status: "running", started: nowIso() });

  let timeoutTimer = null;
  if (entry.timeout) {
    timeoutTimer = setTimeout(() => {
      const r = runtime.live.get(entry.id);
      if (r && r.kind === "subagent") {
        r.handle.timedOut = true;
        r.handle.controller.abort();
      }
    }, entry.timeout * 1000);
    if (typeof timeoutTimer.unref === "function") timeoutTimer.unref();
  }

  // Settle a subagent run once its result resolves OR rejects (an abort can
  // reject — OQ-2). On rejection treat it as a non-completed run whose diagnostic
  // is the error message, so the flag logic still yields 'timeout'/'cancelled'.
  const settle = async (result) => {
    if (timeoutTimer) clearTimeout(timeoutTimer);
    try {
      const completed = result.stopReason === "completed";
      const outText = blocksToText(result.output);
      const diagnostic = result.diagnostic || (result.stopReason === "completed" ? null : String((result.error && result.error.message) || result.error || ""));
      const body = completed
        ? { id: entry.id, exitCode: 0, stdout: outText, stderr: "" }
        : { id: entry.id, exitCode: 1, stderr: diagnostic || outText, error: diagnostic || null };
      const resultFile = `${cwd}/.planning/jobs/${entry.id}.result.json`;
      await mkdir(path.dirname(resultFile), { recursive: true });
      await ctx.fs.writeText(await ctx.fs.resolve(resultFile), JSON.stringify(body, null, 2));
      try { run.dispose(); } catch { /* dispose must always run (OQ-6) */ }
      const r = runtime.live.get(entry.id);
      if (completed) {
        await s.updateJob(cwd, entry.id, { status: "done", result: truncate(firstLine(outText)) || "exit 0", reason: null });
      } else {
        let reason;
        if (r && r.handle.timedOut) reason = { reason: "timeout", detail: `exceeded ${entry.timeout || "?"}s` };
        else if (r && r.handle.cancelled) reason = { reason: "cancelled", detail: "cancelled by user" };
        else reason = { reason: "error", detail: diagnostic || null };
        await s.updateJob(cwd, entry.id, {
          status: "failed",
          result: `exit 1 — ${truncate(firstLine(diagnostic || outText))}`,
          reason,
        });
      }
      runtime.live.delete(entry.id);
    } catch {
      try { run.dispose(); } catch { /* ignore */ }
      runtime.live.delete(entry.id);
      // no-throw (D-09): leave already-written terminal state or best-effort running
    }
  };
  run.result.then(settle, (err) => settle({ output: [], stopReason: "error", diagnostic: String((err && err.message) || err) }));
}

// Cancel a running job (D-04). For shell: kill the child and record 'cancelled'.
// For subagent: set the live `cancelled` flag and abort the job-owned controller;
// the subagent `.then` records 'cancelled' and removes the live entry itself (so
// the flag read in the `.then` always sees the live record). Cancelling an
// unknown or already-terminal job returns a clear no-op message — never throws.
export async function cancelJob(runtime, ctx, s, cwd, id) {
  const { entries } = await s.readJobs(cwd);
  const entry = entries.find((e) => e.id === id);
  if (!entry) return { ok: false, message: `job ${id} not found` };
  if (entry.status === "done" || entry.status === "failed") {
    return { ok: false, message: `job ${id} already terminal (${entry.status})` };
  }
  if (entry.kind === "subagent") {
    const rec = runtime.live.get(id);
    if (rec && rec.kind === "subagent") {
      rec.handle.cancelled = true;
      rec.handle.controller.abort();
    }
    // do NOT remove from live nor set status here — the subagent `.then` does it.
    return { ok: true };
  }
  await s.updateJob(cwd, id, { status: "failed", reason: { reason: "cancelled", detail: "cancelled by user" } });
  const rec = runtime.live.get(id);
  if (rec && rec.handle) { try { rec.handle.kill(); } catch { /* already gone */ } }
  runtime.live.delete(id);
  return { ok: true };
}

// Reconcile running jobs to done/failed by reading their result files. Never
// throws: a missing or corrupt result file leaves the job `running` (D-06).
// Writes an additive failure `reason` (timeout marker / error) without clobbering
// an existing one (e.g. a `cancelled` set by cancelJob or a reason already set by
// a subagent job's own `.then`) (D-08). Subagent jobs are reconciled through the
// same result-file path — their `.then` usually sets the terminal status+reason
// first, and if so the entry is already non-running by the time reconcile runs;
// when reconcile runs in the narrow window before that, its reason-preserving
// write is a harmless fallback. At the end it drains the FIFO queue
// (scheduleJobs) as terminal jobs free capacity (D-07).
export async function reconcileJobs(runtime, ctx, s, cwd) {
  const { entries } = await s.readJobs(cwd);
  let updated = 0;
  for (const entry of entries) {
    if (entry.status !== "running") continue;
    try {
      const resultFile = `${cwd}/.planning/jobs/${entry.id}.result.json`;
      const target = await ctx.fs.resolve(resultFile);
      const stat = await ctx.fs.stat(target);
      if (!stat) continue; // missing result file = still running
      const text = await ctx.fs.readText(target);
      const result = JSON.parse(text);
      const failed = result.exitCode !== 0 || Boolean(result.error);
      const status = failed ? "failed" : "done";
      const summary = failed
        ? `exit ${result.exitCode ?? "?"} — ${truncate(firstLine(result.stderr) || result.error)}`
        : `exit 0 — ${truncate(firstLine(result.stdout))}`;
      const patch = { status, result: summary };
      if (failed && !entry.reason) {
        patch.reason = result.timeout === true
          ? { reason: "timeout", detail: `exceeded ${entry.timeout || "?"}s` }
          : { reason: "error", detail: result.error || null };
      }
      await s.updateJob(cwd, entry.id, patch);
      updated += 1;
    } catch {
      // corrupt result file or read error — leave the job running, never throw
    }
  }
  await scheduleJobs(runtime, ctx, s, cwd);
  return { updated };
}

// FIFO queue drain (D-07). Promotes `pending` entries to `running` up to the
// concurrency limit, in array order, calling startRun to actually spawn each.
// Sets `started` at the real run start (OQ-5). Only `pending` entries are
// promoted (R-3). A corrupt manifest leaves pending entries pending — never throws.
export async function scheduleJobs(runtime, ctx, s, cwd) {
  try {
    const { entries } = await s.readJobs(cwd);
    const jobsCfg = resolveJobsConfig(await s.readConfig(cwd));
    let runningCount = entries.filter((e) => e.status === "running").length;
    for (const entry of entries) {
      if (runningCount >= jobsCfg.concurrency) break;
      if (entry.status !== "pending") continue;
      await startRun(runtime, ctx, s, cwd, entry, jobsCfg);
      runningCount += 1;
    }
  } catch {
    // corrupt manifest → leave pending entries pending, never throw (D-09)
  }
}

// Manual retry (D-06). Re-runs a failed job's stored payload as a NEW attempt
// entry (appendJob gives it a fresh JOB-NN id), annotating the old terminal
// entry `reason.reason: 'retried'`. Respects a per-config max_retries cap. For an
// unknown or non-failed job returns a clear refusal — never throws.
export async function retryJob(runtime, ctx, s, cwd, id, opts = {}) {
  const { entries } = await s.readJobs(cwd);
  const entry = entries.find((e) => e.id === id);
  if (!entry) return { ok: false, message: `job ${id} not found` };
  if (entry.status !== "failed") return { ok: false, message: `job ${id} is not failed (status ${entry.status})` };
  const jobsCfg = resolveJobsConfig(await s.readConfig(cwd));
  const maxRetries = opts.maxRetries ?? jobsCfg.max_retries;
  const retryCount = entry.retryCount || 0;
  if (retryCount >= maxRetries) return { ok: false, message: `max_retries exceeded for ${id}` };
  const payload = entry.kind === "subagent"
    ? { prompt: entry.prompt, label: entry.label, provider: entry.provider, outputSchema: entry.outputSchema, parent: entry.parent }
    : { command: entry.command || [], jobCwd: entry.jobCwd };
  const attempt = await s.appendJob(cwd, {
    kind: entry.kind, status: "pending", ...payload,
    attempts: 1, retryCount: retryCount + 1, timeout: entry.timeout,
  });
  await s.updateJob(cwd, id, { reason: { reason: "retried", detail: `retried as ${attempt.id}` } });
  await scheduleJobs(runtime, ctx, s, cwd);
  return { ok: true, newId: attempt.id };
}

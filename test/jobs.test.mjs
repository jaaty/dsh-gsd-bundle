// Integration tests for the real background-job runtime (lib/jobs.js +
// lib/job-wrapper.mjs). These launch REAL child processes, so they run against
// a real temp dir with the realFsAdapter (FakeFs cannot spawn processes).
// Proves JOB-01 (launch records running, a real child runs) and JOB-02
// (result collection + reconcile to done/failed).

import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import os from "node:os";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";

import { GsdState } from "../lib/state.js";
import { stateCtx, realFsAdapter } from "./helpers/fake-fs.mjs";
import { launchJob, reconcileJobs, cancelJob, retryJob, scheduleJobs, createJobsRuntime } from "../lib/jobs.js";

// Poll for a file to appear under a real fs, bounded (~5s).
async function waitForFile(ctx, absPath, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const target = await ctx.fs.resolve(absPath);
    if (await ctx.fs.stat(target)) return true;
    await new Promise((r) => setTimeout(r, 50));
  }
  return false;
}

// Poll the manifest until a job reaches a given status, bounded.
async function waitForStatus(s, cwd, id, status, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const { entries } = await s.readJobs(cwd);
    const e = entries.find((x) => x.id === id);
    if (e && e.status === status) return e;
    await new Promise((r) => setTimeout(r, 25));
  }
  return null;
}

// Build a ctx whose `get("subagents")` returns a fake subagents service with a
// configurable `start`. Records the last start request for assertions.
function subagentCtx(startImpl) {
  const ctx = stateCtx(realFsAdapter());
  const captured = { request: null, provider: null, disposeCalls: 0 };
  ctx.get = (k) => {
    if (k === "subagents") {
      return {
        start: async (provider, req) => {
          captured.provider = provider;
          captured.request = req;
          const { run, dispose } = await startImpl(req);
          return { result: run.result, dispose: () => { captured.disposeCalls += 1; if (dispose) dispose(); } };
        },
      };
    }
    return undefined;
  };
  return { ctx, captured };
}

describe("job runtime (real child processes)", () => {
  let tmp;
  let s;
  let ctx;
  let runtime;

  beforeEach(async () => {
    tmp = await mkdtemp(path.join(os.tmpdir(), "gsd-jobs-"));
    ctx = stateCtx(realFsAdapter());
    s = new GsdState(ctx, {});
    runtime = createJobsRuntime();
  });

  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  test("launchJob records a running job with a JOB-01 id and started timestamp", async () => {
    const job = await launchJob(runtime, ctx, s, tmp, {
      kind: "shell",
      command: ["node", "-e", "process.exit(0)"],
    });
    assert.equal(job.id, "JOB-01");
    assert.equal(job.status, "running");
    assert.ok(job.started, "started timestamp is set");

    const { entries } = await s.readJobs(tmp);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].id, "JOB-01");
    assert.equal(entries[0].status, "running");
    assert.ok(entries[0].started);
  });

  test("a real child runs and reconcile flips a zero-exit job to done", async () => {
    await launchJob(runtime, ctx, s, tmp, {
      kind: "shell",
      command: ["node", "-e", "console.log('hello'); process.exit(0)"],
    });
    const resultFile = `${tmp}/.planning/jobs/JOB-01.result.json`;
    assert.equal(await waitForFile(ctx, resultFile), true, "result file appears");

    const { updated } = await reconcileJobs(runtime, ctx, s, tmp);
    assert.equal(updated, 1);

    const { entries } = await s.readJobs(tmp);
    assert.equal(entries[0].status, "done");
    assert.ok(entries[0].completed, "completed timestamp set");
    assert.match(entries[0].result, /hello/);
  });

  test("a non-zero exit flips to failed with captured stderr", async () => {
    await launchJob(runtime, ctx, s, tmp, {
      kind: "shell",
      command: ["node", "-e", "console.error('boom'); process.exit(3)"],
    });
    const resultFile = `${tmp}/.planning/jobs/JOB-01.result.json`;
    assert.equal(await waitForFile(ctx, resultFile), true, "result file appears");

    const { updated } = await reconcileJobs(runtime, ctx, s, tmp);
    assert.equal(updated, 1);

    const { entries } = await s.readJobs(tmp);
    assert.equal(entries[0].status, "failed");
    assert.ok(entries[0].completed, "completed timestamp set");
    assert.match(entries[0].result, /boom/);
  });

  test("a running job with no result file stays running after reconcile", async () => {
    await s.appendJob(tmp, { kind: "shell", status: "running" });
    const { updated } = await reconcileJobs(runtime, ctx, s, tmp);
    assert.equal(updated, 0);
    const { entries } = await s.readJobs(tmp);
    assert.equal(entries[0].status, "running");
  });

  test("a corrupt result file does not throw and leaves the job running", async () => {
    await s.appendJob(tmp, { kind: "shell", status: "running" });
    const resultFile = `${tmp}/.planning/jobs/JOB-01.result.json`;
    await mkdir(path.dirname(resultFile), { recursive: true });
    await writeFile(resultFile, "{ not valid json", "utf8");

    let rejected = false;
    let updated;
    try {
      updated = await reconcileJobs(runtime, ctx, s, tmp);
    } catch {
      rejected = true;
    }
    assert.equal(rejected, false, "reconcileJobs does not throw");
    assert.equal(updated.updated, 0);
    const { entries } = await s.readJobs(tmp);
    assert.equal(entries[0].status, "running");
  });

  // ── JOBX-01: subagent background jobs ───────────────────────────────────────

  test("subagent job runs to done, writes a result file, is disposed, with a job-owned signal", async () => {
    const { ctx, captured } = subagentCtx(async (req) => ({
      run: {
        result: Promise.resolve({ output: [{ type: "text", text: "agent output" }], stopReason: "completed" }),
      },
      dispose: () => {},
    }));
    const job = await launchJob(runtime, ctx, s, tmp, { kind: "subagent", prompt: "do the thing", label: "sub1" });
    assert.equal(job.kind, "subagent");
    assert.ok(captured.request.signal, "a job-owned AbortSignal is passed (signal is defined)");
    assert.equal(captured.provider, "spawn", "provider positional arg defaults to 'spawn'");
    assert.equal(captured.request.prompt[0].text, "do the thing");

    const done = await waitForStatus(s, tmp, job.id, "done");
    assert.ok(done, "job reaches done");
    assert.match(done.result, /agent output/);
    assert.equal(captured.disposeCalls, 1, "the run is disposed once after the result settles");

    const resultFile = `${tmp}/.planning/jobs/${job.id}.result.json`;
    assert.equal(await waitForFile(ctx, resultFile), true, "result file written through ctx.fs");
  });

  test("subagent non-completed stopReason flips the job to failed with reason 'error'", async () => {
    const { ctx } = subagentCtx(async () => ({
      run: { result: Promise.resolve({ output: [], stopReason: "error", diagnostic: "provider blew up" }) },
      dispose: () => {},
    }));
    const job = await launchJob(runtime, ctx, s, tmp, { kind: "subagent", prompt: "x" });
    const failed = await waitForStatus(s, tmp, job.id, "failed");
    assert.ok(failed, "job reaches failed");
    assert.equal(failed.reason.reason, "error");
  });

  // ── JOBX-02: timeout + cancellation ─────────────────────────────────────────

  test("shell job exceeding its timeout flips to failed with reason 'timeout'", async () => {
    const job = await launchJob(runtime, ctx, s, tmp, {
      kind: "shell",
      command: ["node", "-e", "setTimeout(() => {}, 10000)"],
      timeout: 1,
    });
    const resultFile = `${tmp}/.planning/jobs/${job.id}.result.json`;
    assert.equal(await waitForFile(ctx, resultFile), true, "timeout result file appears");
    const { updated } = await reconcileJobs(runtime, ctx, s, tmp);
    assert.equal(updated, 1);
    const { entries } = await s.readJobs(tmp);
    assert.equal(entries[0].status, "failed");
    assert.equal(entries[0].reason.reason, "timeout");
  });

  test("subagent timeout (timer abort) records reason 'timeout'", async () => {
    // run.result never settles on its own; the job-owned timer aborts the signal.
    const { ctx } = subagentCtx(async (req) => ({
      run: {
        result: new Promise((resolve, reject) => {
          req.signal.addEventListener("abort", () => reject(new Error("aborted")));
        }),
      },
      dispose: () => {},
    }));
    const job = await launchJob(runtime, ctx, s, tmp, { kind: "subagent", prompt: "x", timeout: 0.2 });
    const failed = await waitForStatus(s, tmp, job.id, "failed", 5000);
    assert.ok(failed, "subagent timeout job reaches failed");
    assert.equal(failed.reason.reason, "timeout");
  });

  test("subagent cancel records reason 'cancelled' and does not pre-remove the live entry", async () => {
    let abortFn = null;
    const { ctx } = subagentCtx(async (req) => {
      req.signal.addEventListener("abort", () => { if (abortFn) abortFn(); });
      return {
        run: {
          result: new Promise((resolve, reject) => {
            abortFn = () => reject(new Error("aborted"));
          }),
        },
        dispose: () => {},
      };
    });
    const job = await launchJob(runtime, ctx, s, tmp, { kind: "subagent", prompt: "x" });
    assert.equal(job.status, "running", "under capacity the subagent job runs");
    const res = await cancelJob(runtime, ctx, s, tmp, job.id);
    assert.equal(res.ok, true);
    const failed = await waitForStatus(s, tmp, job.id, "failed");
    assert.ok(failed, "cancelled subagent job reaches failed");
    assert.equal(failed.reason.reason, "cancelled");
  });

  test("cancelJob never throws for an unknown or already-terminal job", async () => {
    const unknown = await cancelJob(runtime, ctx, s, tmp, "JOB-999");
    assert.equal(unknown.ok, false);
    assert.match(unknown.message, /not found/);

    const done = await launchJob(runtime, ctx, s, tmp, {
      kind: "shell",
      command: ["node", "-e", "process.exit(0)"],
    });
    const doneFile = `${tmp}/.planning/jobs/${done.id}.result.json`;
    assert.equal(await waitForFile(ctx, doneFile), true, "shell job result file appears");
    await reconcileJobs(runtime, ctx, s, tmp);
    assert.ok(await waitForStatus(s, tmp, done.id, "done"), "shell job completes");
    const alreadyTerminal = await cancelJob(runtime, ctx, s, tmp, done.id);
    assert.equal(alreadyTerminal.ok, false);
    assert.match(alreadyTerminal.message, /terminal/);
  });

  // ── JOBX-04: FIFO scheduler + manual retry ─────────────────────────────────

  test("FIFO scheduler promotes only up to concurrency and preserves order", async () => {
    const cfgPath = `${tmp}/.planning/config.json`;
    await mkdir(path.dirname(cfgPath), { recursive: true });
    await writeFile(cfgPath, JSON.stringify({ jobs: { concurrency: 1, timeout: 2 } }, null, 2), "utf8");

    // Three slow shell jobs queued as pending.
    const a = await s.appendJob(tmp, { kind: "shell", command: ["node", "-e", "setTimeout(()=>{}, 500)"], status: "pending", attempts: 1, timeout: 2 });
    const b = await s.appendJob(tmp, { kind: "shell", command: ["node", "-e", "setTimeout(()=>{}, 500)"], status: "pending", attempts: 1, timeout: 2 });
    const c = await s.appendJob(tmp, { kind: "shell", command: ["node", "-e", "setTimeout(()=>{}, 500)"], status: "pending", attempts: 1, timeout: 2 });

    await scheduleJobs(runtime, ctx, s, tmp);
    let { entries } = await s.readJobs(tmp);
    const running = entries.filter((e) => e.status === "running");
    assert.equal(running.length, 1, "only one job runs at concurrency 1");
    assert.equal(running[0].id, a.id, "first-queued job promoted first (FIFO)");
    assert.equal(entries.find((e) => e.id === b.id).status, "pending");
    assert.equal(entries.find((e) => e.id === c.id).status, "pending");

    // Reconcile drains the running job's completion → the next pending promotes.
    await new Promise((r) => setTimeout(r, 700));
    await reconcileJobs(runtime, ctx, s, tmp);
    entries = (await s.readJobs(tmp)).entries;
    const running2 = entries.filter((e) => e.status === "running");
    assert.equal(running2.length, 1);
    assert.equal(running2[0].id, b.id, "next queued job promoted in FIFO order");
  });

  test("retryJob creates a new attempt, marks the old entry 'retried', and respects max_retries", async () => {
    const failed = await s.appendJob(tmp, {
      kind: "shell", command: ["node", "-e", "process.exit(1)"], status: "failed", attempts: 1, retryCount: 0, timeout: 5,
    });
    const retry = await retryJob(runtime, ctx, s, tmp, failed.id, { maxRetries: 2 });
    assert.equal(retry.ok, true);
    assert.ok(retry.newId, "a new JOB-NN attempt id is returned");
    assert.notEqual(retry.newId, failed.id);

    const { entries } = await s.readJobs(tmp);
    const old = entries.find((e) => e.id === failed.id);
    assert.equal(old.reason.reason, "retried");
    assert.match(old.reason.detail, new RegExp(retry.newId));
    const attempt = entries.find((e) => e.id === retry.newId);
    assert.equal(attempt.status, "running", "the retried attempt is promoted to running");
    assert.equal(attempt.retryCount, 1);

    // Exhaust the cap: mark the attempt failed and retry twice more.
    await s.updateJob(tmp, retry.newId, { status: "failed" });
    const r2 = await retryJob(runtime, ctx, s, tmp, retry.newId, { maxRetries: 1 });
    assert.equal(r2.ok, false);
    assert.match(r2.message, /max_retries exceeded/);
  });

  test("retryJob never throws for an unknown or non-failed job", async () => {
    const unknown = await retryJob(runtime, ctx, s, tmp, "JOB-999");
    assert.equal(unknown.ok, false);
    assert.match(unknown.message, /not found/);

    const running = await s.appendJob(tmp, { kind: "shell", command: ["true"], status: "running", attempts: 1, timeout: 5 });
    const nonFailed = await retryJob(runtime, ctx, s, tmp, running.id);
    assert.equal(nonFailed.ok, false);
    assert.match(nonFailed.message, /not failed/);
  });
});

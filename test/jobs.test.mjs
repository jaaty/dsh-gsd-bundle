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
import { launchJob, reconcileJobs } from "../lib/jobs.js";

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

describe("job runtime (real child processes)", () => {
  let tmp;
  let s;
  let ctx;

  beforeEach(async () => {
    tmp = await mkdtemp(path.join(os.tmpdir(), "gsd-jobs-"));
    ctx = stateCtx(realFsAdapter());
    s = new GsdState(ctx, {});
  });

  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  test("launchJob records a running job with a JOB-01 id and started timestamp", async () => {
    const job = await launchJob(ctx, s, tmp, {
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
    await launchJob(ctx, s, tmp, {
      kind: "shell",
      command: ["node", "-e", "console.log('hello'); process.exit(0)"],
    });
    const resultFile = `${tmp}/.planning/jobs/JOB-01.result.json`;
    assert.equal(await waitForFile(ctx, resultFile), true, "result file appears");

    const { updated } = await reconcileJobs(ctx, s, tmp);
    assert.equal(updated, 1);

    const { entries } = await s.readJobs(tmp);
    assert.equal(entries[0].status, "done");
    assert.ok(entries[0].completed, "completed timestamp set");
    assert.match(entries[0].result, /hello/);
  });

  test("a non-zero exit flips to failed with captured stderr", async () => {
    await launchJob(ctx, s, tmp, {
      kind: "shell",
      command: ["node", "-e", "console.error('boom'); process.exit(3)"],
    });
    const resultFile = `${tmp}/.planning/jobs/JOB-01.result.json`;
    assert.equal(await waitForFile(ctx, resultFile), true, "result file appears");

    const { updated } = await reconcileJobs(ctx, s, tmp);
    assert.equal(updated, 1);

    const { entries } = await s.readJobs(tmp);
    assert.equal(entries[0].status, "failed");
    assert.ok(entries[0].completed, "completed timestamp set");
    assert.match(entries[0].result, /boom/);
  });

  test("a running job with no result file stays running after reconcile", async () => {
    await s.appendJob(tmp, { kind: "shell", status: "running" });
    const { updated } = await reconcileJobs(ctx, s, tmp);
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
      updated = await reconcileJobs(ctx, s, tmp);
    } catch {
      rejected = true;
    }
    assert.equal(rejected, false, "reconcileJobs does not throw");
    assert.equal(updated.updated, 0);
    const { entries } = await s.readJobs(tmp);
    assert.equal(entries[0].status, "running");
  });
});

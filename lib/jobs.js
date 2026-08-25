// @dsh-gsd/bundle/jobs — the real background-job runtime domain.
//
// launchJob spawns a detached child (lib/job-wrapper.mjs) that runs a shell
// command and writes a per-job result file, recording the job `running` in the
// async-jobs manifest and returning immediately (D-01 genuinely background).
// reconcileJobs reads the result file for each `running` job and flips it to
// `done`/`failed` with a `completed` timestamp (D-03/D-04). gsd_status calls
// reconcileJobs before rendering so it reflects real async state (D-05).
//
// Persistence goes through the gsdState accessors (s.appendJob / s.updateJob) —
// the single choke point for the manifest (DUR-04). Result-file reads go through
// ctx.fs with a stat-guard so a missing file means "still running", never a throw
// (D-06).

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

// Absolute path to the detached wrapper script this module spawns.
const WRAPPER = fileURLToPath(new URL("./job-wrapper.mjs", import.meta.url));

// Truncate a result summary line to a bounded length for the manifest.
function truncate(s, n = 120) {
  const t = String(s ?? "").trim();
  return t.length > n ? `${t.slice(0, n)}…` : t;
}

function firstLine(s) {
  return String(s ?? "").split(/\r?\n/)[0].trim();
}

// Launch a background job: record it `running` in the manifest, spawn the
// detached wrapper to run the command and write its result file, then return
// immediately (the child is unref'd and survives the tool call).
export async function launchJob(ctx, s, cwd, { kind, command, cwd: jobCwd } = {}) {
  const job = await s.appendJob(cwd, { kind, status: "running" });
  const resultFile = `${cwd}/.planning/jobs/${job.id}.result.json`;
  const child = spawn(process.execPath, [WRAPPER, job.id, resultFile, ...command], {
    cwd: jobCwd || cwd,
    detached: true,
    stdio: "ignore",
  });
  child.unref();
  return job;
}

// Reconcile running jobs to done/failed by reading their result files. Never
// throws: a missing or corrupt result file leaves the job `running` (D-06).
export async function reconcileJobs(ctx, s, cwd) {
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
      await s.updateJob(cwd, entry.id, { status, result: summary });
      updated += 1;
    } catch {
      // corrupt result file or read error — leave the job running, never throw
    }
  }
  return { updated };
}

// @dsh-gsd/bundle/job-wrapper — the detached child process that runs a single
// background job and writes its result to a per-job result file.
//
// This is a STANDALONE script (no imports from the bundle, no ctx): it is
// spawned detached by lib/jobs.js `launchJob` as `node lib/job-wrapper.mjs
// <jobId> <resultFile> <timeout?> <cmd...>`, runs the command as a child
// process, captures its stdout/stderr/exit code, and writes
// `.planning/jobs/<id>.result.json`. Because it is detached and unref'd, it
// survives the tool call that launched it and its result file is read back
// later by `reconcileJobs` (D-01/D-03).
//
// The optional `<timeout>` argv is a timeout in SECONDS (an integer string, or
// the sentinel "-"/absent for no timeout — R-1: older in-flight detached
// children spawned without it still work). On expiry the child is killed and a
// result carrying `{ error: "timeout", timeout: true }` is written, so
// reconcileJobs records reason 'timeout'. The timer is cleared on a normal close
// so a finished run never triggers a false timeout (D-03).
//
// Security: the command is passed as an argv array with no interpreter option,
// so there is no command-string interpolation or injection surface (D-01/D-02).

import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

// argv: [jobId, resultFile, timeout?, cmd0, cmd1, ...]
const [jobId, resultFile, timeoutArg, ...command] = process.argv.slice(2);
const timeoutSec = /^\d+$/.test(timeoutArg ?? "") ? Number(timeoutArg) : null;

function writeResult(payload) {
  const body = JSON.stringify(
    {
      id: jobId,
      exitCode: payload.exitCode ?? null,
      stdout: payload.stdout ?? "",
      stderr: payload.stderr ?? "",
      error: payload.error ?? null,
      timeout: payload.timeout ?? false,
    },
    null,
    2
  );
  // The wrapper has no ctx, so it writes the result file with node:fs/promises
  // (D-03). Ensure the parent dir exists first.
  return mkdir(path.dirname(resultFile), { recursive: true }).then(() =>
    writeFile(resultFile, body, "utf8")
  );
}

async function main() {
  if (!jobId || !resultFile || command.length === 0) {
    await writeResult({ error: "job-wrapper: expected <jobId> <resultFile> <cmd...>" });
    process.exit(0);
  }

  let stdoutBuf = "";
  let stderrBuf = "";
  let exitCode = null;
  let errorMessage = null;
  let timedOut = false;

  const child = spawn(command[0], command.slice(1), {
    cwd: process.cwd(),
    stdio: ["ignore", "pipe", "pipe"],
  });

  child.stdout.on("data", (d) => { stdoutBuf += d.toString(); });
  child.stderr.on("data", (d) => { stderrBuf += d.toString(); });

  child.on("error", (err) => {
    // e.g. command not found — capture the message, leave exitCode null.
    errorMessage = err.message;
  });

  // Per-job timeout (seconds). On expiry kill the child and write an explicit
  // `timeout: true` marker so reconcileJobs records reason 'timeout' (D-03).
  let timeoutTimer = null;
  if (timeoutSec) {
    timeoutTimer = setTimeout(() => {
      timedOut = true;
      try { child.kill(); } catch { /* already gone */ }
    }, timeoutSec * 1000);
    if (typeof timeoutTimer.unref === "function") timeoutTimer.unref();
  }

  child.on("close", async (code) => {
    if (timeoutTimer) clearTimeout(timeoutTimer);
    exitCode = code;
    if (timedOut) {
      // Killed by the timeout timer — write the explicit timeout marker so the
      // reconciler records reason 'timeout' rather than a generic error.
      try {
        await writeResult({ exitCode: null, stdout: "", stderr: "", error: "timeout", timeout: true });
      } catch { /* nothing more we can do */ }
      process.exit(0);
      return;
    }
    try {
      await writeResult({ exitCode, stdout: stdoutBuf, stderr: stderrBuf, error: errorMessage });
    } catch (err) {
      // Last resort: the result file itself could not be written.
      try {
        await writeResult({ exitCode: null, stdout: "", stderr: "", error: String(err) });
      } catch { /* nothing more we can do */ }
    }
    process.exit(0);
  });
}

main().catch(async (err) => {
  try {
    await writeResult({ exitCode: null, stdout: "", stderr: "", error: String(err) });
  } catch { /* ignore */ }
  process.exit(0);
});

// @dsh-gsd/bundle/job-wrapper — the detached child process that runs a single
// background job and writes its result to a per-job result file.
//
// This is a STANDALONE script (no imports from the bundle, no ctx): it is
// spawned detached by lib/jobs.js `launchJob` as `node lib/job-wrapper.mjs
// <jobId> <resultFile> <cmd...>`, runs the command as a child process, captures
// its stdout/stderr/exit code, and writes `.planning/jobs/<id>.result.json`.
// Because it is detached and unref'd, it survives the tool call that launched
// it and its result file is read back later by `reconcileJobs` (D-01/D-03).
//
// Security: the command is passed as an argv array with no interpreter option,
// so there is no command-string interpolation or injection surface (D-01/D-02).

import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

// argv: [jobId, resultFile, cmd0, cmd1, ...]
const [jobId, resultFile, ...command] = process.argv.slice(2);

function writeResult(payload) {
  const body = JSON.stringify(
    {
      id: jobId,
      exitCode: payload.exitCode ?? null,
      stdout: payload.stdout ?? "",
      stderr: payload.stderr ?? "",
      error: payload.error ?? null,
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

  child.on("close", async (code) => {
    exitCode = code;
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

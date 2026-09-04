// @dsh-gsd/bundle/add-tests — the add-tests generator tool (opengsd
// /gsd-add-tests / GAP-16). An OUT-OF-BAND generator (NOT a loop step) that
// creates unit and Integration ("E2E" tier) node:test files for a COMPLETED
// phase from its SUMMARY.md / CONTEXT.md / VERIFICATION.md (the phase's UAT
// criteria) and its changed implementation files, commits them atomically,
// writes a <NN>-ATEST.md coverage report, and is purely advisory: it never
// advances the STATE loop position and never ships (D-01/D-04).
//
// It mirrors:
//   - lib/validate-phase.js — the deterministic scan + structured-output
//     subagent + write/commit division of labour (D-05/D-06/D-07/D-10). The tool
//     extracts the changed-file scope deterministically from SUMMARY key-files,
//     spawns one fresh-context gsd-add-tests-writer subagent that classifies
//     each file Unit|Integration|Skip and returns structured { path, req_id,
//     content, type } test payloads, then the TOOL enforces the R-5 hard path
//     boundary (validateTestPaths), writes the accepted files, and commits.
//   - lib/autonomous.js — the out-of-band NOT_LOOP_ORDERED plugin shape (D-01),
//     inject [gsdState, tools, subagents], advisory no-STATE-mutation posture.
//
// DEGR-07 (D-02): 'subagents' is a HARD coeffect — the writer spawns a subagent
// via spawnSubagent, so the inject array declares it and a missing service
// fails fast (spawnSubagent throws).
//
// The pure helpers (extractChangedFiles, TEST_WRITER_SCHEMA re-export,
// resolveWriterOutput, buildATestBody) are exported with NO ctx / fs / git
// parameters so they are unit-testable directly. All I/O lives in apply().
// TEST_WRITER_SCHEMA/TEST_WRITER_PROMPT/TEST_WRITER_STATUSES are single-sourced
// in lib/_agents.js (never locally declared here — avoid a duplicate-binding
// SyntaxError in the import).

import { defineTool } from "@deepseek-ai/dsh-tools";
import { validateTestPaths, detectTestInfra } from "./validate-phase.js";
import { filterSourcePaths } from "./code-review.js";
import { cwdOf, spawnSubagent } from "./_runner.js";
import { ensurePhaseBranch, commitArtifacts, commitSourceFiles, defaultGitFn } from "./_git-artifacts.js";
import { buildCapability } from "./_capabilities.js";
import { TEST_WRITER_STATUSES, TEST_WRITER_SCHEMA, TEST_WRITER_PROMPT } from "./_agents.js";
import { nowIso, zeroPad, today, parseFrontmatter, stringifyFrontmatter } from "./_shared.js";

const name = "gsd-add-tests";
// D-02: gsdState + tools are hard coeffects; 'subagents' is declared as a hard
// coeffect too (the writer spawns a fresh-context subagent via spawnSubagent —
// DEGR-07, mirroring validate-phase.js).
const inject = ["gsdState", "tools", "subagents"];

// ── pure helpers (no ctx, no I/O — unit-testable directly) ───────────────────

// Deterministically extract a completed phase's changed implementation files
// from the raw *-SUMMARY.md text bodies (D-05 / RESEARCH OQ-1 / D-13). Each body
// is parsed with parseFrontmatter and its key-files.created + key-files.modified
// (fallback key_files) frontmatter arrays are flattened, deduped, trimmed, and —
// when filter is true — pruned through filterSourcePaths (the sole code-review.js
// import; extractChangedFiles SELF-HOSTS its parse, so it does not depend on the
// fs-bound extractSummaryFiles export from code-review.js).
function extractChangedFiles(summaryTexts = [], { filter = true } = {}) {
  const files = [];
  for (const raw of summaryTexts || []) {
    if (!raw) continue;
    const { frontmatter } = parseFrontmatter(raw);
    const kf = frontmatter?.["key-files"] || frontmatter?.key_files || {};
    if (Array.isArray(kf.created)) files.push(...kf.created);
    if (Array.isArray(kf.modified)) files.push(...kf.modified);
  }
  const deduped = [...new Set(files.map((f) => String(f).trim()).filter(Boolean))];
  return filter ? filterSourcePaths(deduped) : deduped;
}

// Validate the gsd-add-tests-writer subagent's structured output. Returns the
// structured object when it is an object with an array `tests_written` whose
// every entry carries string path/req_id/content AND a `status` in the
// TEST_WRITER_STATUSES enum; otherwise returns null (the caller degrades to an
// UNAVAILABLE <NN>-ATEST.md, D-10). skip/escalated/notes/type are tolerated but
// not required. Mirrors validate-phase.js resolveAuditorOutput (D-06).
function resolveWriterOutput(structured) {
  if (!structured || typeof structured !== "object") return null;
  if (!Array.isArray(structured.tests_written)) return null;
  for (const t of structured.tests_written) {
    if (!t || typeof t !== "object") return null;
    if (typeof t.path !== "string" || typeof t.req_id !== "string" || typeof t.content !== "string") return null;
  }
  if (!TEST_WRITER_STATUSES.includes(structured.status)) return null;
  return structured;
}

// Assemble the <NN>-ATEST.md body (D-08/D-11): a pure Markdown build over plain
// data. Sections: Generated Test Files (accepted {path}/{req_id}/{type}), Skipped
// ({path} — {reason}), Coverage Gaps (escalated req ids, report-only), Bugs
// (report-only — surfaced from escalated reasons / notes that indicate an
// assertion failure, never fixed), and Suggested Run Commands (the tool never
// executes them, D-11). Trailing artefact footers.
function buildATestBody({
  phaseN,
  phaseName,
  phaseGoal,
  status,
  files = [],
  skipped = [],
  escalated = [],
  gaps = [],
  suggestedCommand,
  notes = "",
  date,
} = {}) {
  const pN = Number(phaseN) || 0;
  const lines = [];
  lines.push(`# Phase ${pN}: ${phaseName} - Add-Tests Report`, "");
  lines.push(`**Generated:** ${status}`);
  if (phaseGoal) lines.push(`**Phase goal:** ${phaseGoal}`, "");
  lines.push("## Generated Test Files", "");
  if (files.length) {
    for (const f of files) lines.push(`- \`${f.path}\` — ${f.req_id} (${f.type || "Unit"})`);
  } else {
    lines.push("_None._", "");
  }
  lines.push("", "## Skipped", "");
  if (skipped.length) {
    for (const s of skipped) lines.push(`- \`${s.path}\` — ${s.reason}`);
    lines.push("");
  } else {
    lines.push("_None._", "");
  }
  lines.push("## Coverage Gaps", "");
  if (gaps.length) lines.push(`- ${gaps.join(", ")}`, "");
  else lines.push("_None._", "");
  lines.push("## Bugs (report-only)", "");
  const bugLines = [];
  for (const e of escalated || []) {
    if (e && e.reason && /fail|bug|expected|actual/i.test(e.reason)) bugLines.push(`- ${e.req_id}: ${e.reason}`);
  }
  if (notes && /fail|bug/i.test(notes)) bugLines.push(`- (notes) ${notes}`);
  if (bugLines.length) lines.push(...bugLines);
  else lines.push("_No bugs reported by the generated tests (report-only — never fixed, D-11)._");
  lines.push("", "## Suggested Run Commands", "");
  lines.push(`- \`${suggestedCommand || ""}\``, "");
  lines.push("---", "", `*Phase: ${zeroPad(pN)}-${phaseName}*`, `*Add-Tests: ${date || today()}*`);
  return lines.join("\n");
}

// Build the pending/UNAVAILABLE <NN>-ATEST.md body when the writer faults or
// produces no accepted files (D-10). Never fakes success — surfaces the real
// cause.
function buildUnavailableBody(phaseN, phaseName, cause, infra) {
  const pN = Number(phaseN) || 0;
  return [
    `# Phase ${pN}: ${phaseName} - Add-Tests Report`,
    "",
    "**Generated:** UNAVAILABLE",
    "",
    "## Writer Report",
    "",
    "**Status:** UNAVAILABLE",
    "",
    `_The gsd-add-tests-writer subagent could not complete. Cause: ${cause || "unknown"}_`,
    "",
    "## Suggested Run Commands",
    "",
    `- \`${infra ? infra.suggested_command : ""}\``,
    "",
    "---",
    "",
    `*Phase: ${zeroPad(pN)}-${phaseName}*`,
    `*Add-Tests: ${today()}*`,
  ].join("\n");
}

function apply(ctx) {
  const gsd = () => ctx.get("gsdState");

  // Publish this out-of-band capability (DEGR-01/D-01). Auto-tracked revertible
  // effect: retiring the add-tests plugin withdraws gsdAddTests. NOT_LOOP_ORDERED —
  // it generates tests, it is not a linear loop step and never joins the role:"step"
  // retirement matrix.
  ctx.provide("gsdAddTests", buildCapability("gsdAddTests"));

  ctx.tools.register(defineTool({
    name: "gsd_add_tests",
    description: "Add-tests generator (opengsd /gsd-add-tests / GAP-16): creates unit and Integration tests for a COMPLETED phase from its SUMMARY/CONTEXT/VERIFICATION and implementation. Deterministically extracts the phase's changed files from SUMMARY key-files, spawns one gsd-add-tests-writer subagent that classifies each into Unit|Integration|Skip and returns structured test payloads, validates paths (R-5 hard boundary), atomically commits with message `test(phase-{N}): add unit and E2E tests from add-tests command`, writes <NN>-ATEST.md, and returns a structured summary. Advisory: never advances the STATE loop position and never ships. Run after a phase passed gsd_execute.",
    parameters: {
      phase: { type: "number" },
      proceed: { type: "boolean" },
      auto: { type: "boolean" },
      cancel: { type: "boolean" },
    },
    output: { schema: { type: "string" }, render: (_a, v) => [{ type: "text", text: v }] },
    async execute(args, exec) {
      const cwd = cwdOf(exec);
      const s = gsd();
      if (!s) throw new Error("gsd_add_tests: gsdState service unavailable"); // D-02

      // Fail-fast guards (D-10), mirroring validate-phase.js:373-383.
      if (!(await s.isProject(cwd))) throw new Error("gsd_add_tests: no .planning/ project — run gsd_init first");
      const roadmap = await s.readRoadmap(cwd);
      const phase = (roadmap?.phases || []).find((p) => p.n === args.phase);
      if (!phase) throw new Error(`gsd_add_tests: phase ${args.phase} not in ROADMAP.md`);

      // D-04 executed-phase guard: add-tests targets COMPLETED phases only; it
      // requires at least one plan with a SUMMARY-<PP>.md.
      const plans = await s.listPlans(cwd, phase.n);
      const executed = plans.filter((p) => p.has_summary);
      if (executed.length === 0) {
        throw new Error(`gsd_add_tests: phase ${phase.n} not executed (no SUMMARY found — run gsd_execute first)`);
      }

      // CQ-07/MW-02: acquire the per-phase feature branch before any write.
      const branchInfo = await ensurePhaseBranch(cwd, phase.n);

      // Read the artefact bodies: the phase SUMMARY/VERIFICATION/CONTEXT become
      // the specification + UAT criteria the writer consumes (D-05).
      const summaryBodies = [];
      for (const p of executed) {
        const body = await s.readArtifact(cwd, phase.n, `SUMMARY-${zeroPad(Number(p.plan))}`);
        if (body !== undefined) summaryBodies.push(body);
      }
      const contextBody = await s.readArtifact(cwd, phase.n, "CONTEXT");
      const verifyBody = await s.readArtifact(cwd, phase.n, "VERIFICATION");

      // D-05 deterministic scope: changed implementation files from SUMMARY
      // key-files, pruned through filterSourcePaths.
      const changedFiles = extractChangedFiles(summaryBodies, { filter: true });
      if (changedFiles.length === 0) {
        return `gsd_add_tests: phase ${phase.n} (${phase.name}) — no changed implementation files recorded in SUMMARY key-files — nothing to generate.`;
      }

      // D-03: the bundle always runs node:test (no Playwright/browser runner).
      // The E2E tier is reinterpreted as Integration/loop-level node:test.
      let infra = detectTestInfra({ configFiles: ["package.json"], testFiles: [] });
      infra = { ...infra, suggested_command: "node --test test/*.test.mjs" };

      // D-09 single confirmation gate: changed files to generate AND no
      // --proceed/--auto → return the classification plan and stop. No subagent
      // spawned, no file written before approval.
      if (changedFiles.length && !args.proceed && !args.auto) {
        const fileList = changedFiles.map((f) => `  - ${f}`).join("\n");
        return `gsd_add_tests: phase ${phase.n} (${phase.name}) — ${changedFiles.length} changed implementation file(s) extracted from SUMMARY key-files:\n${fileList}\n\nTest framework: ${infra.kind} (suggested: ${infra.suggested_command}). The gsd-add-tests-writer will classify each file into Unit | Integration | Skip and generate node:test files.\nRe-call with --proceed (or --auto to bypass) to generate, or --cancel to abort.`;
      }

      // --cancel → abort; no spawn, no write.
      if (args.cancel) {
        return `gsd_add_tests: cancelled for phase ${phase.n} (${phase.name}). No subagent was spawned and no test files were written.`;
      }

      // ── Writer dispatch (D-05/D-06) ───────────────────────────────────────
      // Build a <phase_context> block: phase identity, artefact bodies (truncated
      // to a 12000-char cap each with an inline marker), the changed files, test
      // framework + suggested command, and the Unit|Integration|Skip criteria.
      const cap = (txt, label) => {
        if (!txt) return "";
        const t = String(txt);
        return t.length > 12000 ? `${t.slice(0, 12000)}\n…(${label} truncated)…` : t;
      };
      const contextLines = [
        "<phase_context>",
        `Phase: ${phase.n} - ${phase.name}`,
        `Phase goal: ${phase.goal || "(none)"}`,
        `Test framework: ${infra.kind}`,
        `Suggested command: ${infra.suggested_command}`,
        "Changed implementation files:",
        changedFiles.map((f) => `  - ${f}`).join("\n"),
        "",
        "Classification criteria:",
        "  Unit — node:test unit test in test/*.test.mjs exercising the file's exported pure behaviour.",
        "  Integration — node:test test (NO browser/Playwright) driving the phase's gsd_* tools end-to-end via test/helpers/mount-harness.mjs makeMountCtx/makeExec conventions (the bundle's 'E2E' tier is node:test).",
        "  Skip — already covered, a fixture/schema, or impractical to automate (record in skip with a reason).",
        "",
        "--- SUMMARY bodies ---",
        cap(summaryBodies.join("\n\n"), "summary"),
        "",
        "--- CONTEXT ---",
        cap(contextBody || "(none)", "context"),
        "",
        "--- VERIFICATION ---",
        cap(verifyBody || "(none)", "verification"),
        "</phase_context>",
      ];
      const promptText = TEST_WRITER_PROMPT + "\n" + contextLines.join("\n");

      let structured;
      let cause = null;
      try {
        const r = await spawnSubagent(ctx, exec, { label: "gsd-add-tests-writer", promptText, outputSchema: TEST_WRITER_SCHEMA });
        structured = resolveWriterOutput(r.structured);
        if (!structured) cause = "writer returned malformed structured output (tests_written missing or invalid)";
      } catch (e) {
        cause = (e && e.message) || String(e);
      }

      // Shared degrade-with-flag writer (D-10): writes a pending UNAVAILABLE
      // ATEST + commits it, returns the degraded summary. Never rethrows; never
      // fakes success.
      async function degrade(reason, extraNote = "") {
        const fm = {
          phase: String(phase.n),
          generated: nowIso(),
          status: "UNAVAILABLE",
          test_infra: infra.kind,
          suggested_command: infra.suggested_command,
        };
        const full = stringifyFrontmatter(fm) + "\n" + buildUnavailableBody(phase.n, phase.name, reason, infra);
        const atestPath = await s.writeArtifact(cwd, phase.n, "ATEST", full);
        const commit = await commitArtifacts(cwd, phase.n, { scope: "add-tests", phaseName: phase.name });
        const commitNote = ` Artefacts committed: ${commit.committed} (${commit.staged.length} file(s)).` + (commit.warning ? ` WARNING: ${commit.warning}.` : "");
        return `gsd_add_tests: phase ${phase.n} (${phase.name}) — UNAVAILABLE. Cause: ${reason}.${extraNote} Wrote pending ${atestPath}.${commitNote} Branch: ${branchInfo.action} (${branchInfo.branch}). STATE not advanced.`;
      }

      if (cause) {
        return await degrade(cause);
      }

      // ── R-5 hard boundary + write (D-07) ──────────────────────────────────
      // Only valid, test-shaped, relative, non-traversing paths (validated by the
      // TOOL's validateTestPaths) are written; everything else is skipped/escalated
      // and NEVER written.
      const acceptedPaths = [];
      const acceptedMeta = [];
      const skippedRecords = [];
      const escalatedIds = [];
      for (const entry of structured.tests_written) {
        const { valid, skipped } = validateTestPaths([entry.path]);
        if (valid.length) {
          const target = await ctx.fs.resolve(`${cwd}/${entry.path}`);
          await ctx.fs.writeText(target, entry.content);
          acceptedPaths.push(entry.path);
          acceptedMeta.push({ path: entry.path, req_id: entry.req_id, type: entry.type || "Unit" });
        } else {
          skippedRecords.push({ path: entry.path, reason: "rejected by validateTestPaths hard boundary" });
          escalatedIds.push(entry.req_id || entry.path);
        }
      }

      // No accepted test file → degrade-with-flag (D-10).
      if (acceptedPaths.length === 0) {
        return await degrade("writer produced no accepted test files", " The validated path boundary rejected or found nothing writable.");
      }

      // ── atomic commit of the accepted test files (D-08) ──────────────────
      const gitFn = ctx.gitFn || defaultGitFn;
      const commitTest = await commitSourceFiles(cwd, acceptedPaths, `test(phase-${phase.n}): add unit and E2E tests from add-tests command`, gitFn);

      // ── write <NN>-ATEST.md coverage report (D-08) ───────────────────────
      const escalatedEntries = structured.escalated || [];
      const escalatedAll = [...escalatedIds, ...escalatedEntries.map((e) => e.req_id).filter(Boolean)];
      const gapIds = [...new Set(escalatedAll)];
      const fm = {
        phase: String(phase.n),
        generated: nowIso(),
        status: structured.status,
        test_infra: infra.kind,
        generated_count: acceptedPaths.length,
        suggested_command: infra.suggested_command,
      };
      const body = buildATestBody({
        phaseN: phase.n,
        phaseName: phase.name,
        phaseGoal: phase.goal || "(none)",
        status: structured.status,
        files: acceptedMeta,
        skipped: skippedRecords,
        escalated: escalatedEntries,
        gaps: gapIds,
        suggestedCommand: infra.suggested_command,
        notes: structured.notes || "",
      });
      const full = stringifyFrontmatter(fm) + "\n" + body;
      const atestPath = await s.writeArtifact(cwd, phase.n, "ATEST", full);
      const commitReport = await commitArtifacts(cwd, phase.n, { scope: "add-tests", phaseName: phase.name });

      const commitNote = ` Artefacts committed: ${commitTest.committed || commitReport.committed} (${commitTest.staged.length + commitReport.staged.length} file(s)).` +
        (commitTest.warning ? ` WARNING: ${commitTest.warning}.` : "") + (commitReport.warning ? ` WARNING: ${commitReport.warning}.` : "");

      // ── advisory report (D-04/D-11) ──────────────────────────────────────
      let bugNote = "";
      const bugIndications = [];
      for (const e of escalatedEntries) {
        if (e && e.reason && /fail|bug|expected|actual/i.test(e.reason)) {
          bugIndications.push(`${e.req_id}: ${e.reason}`);
        }
      }
      if (structured.notes && /fail|bug/i.test(structured.notes)) bugIndications.push(`(notes) ${structured.notes}`);
      if (bugIndications.length) {
        bugNote = `\nPotential bugs reported by the generated tests (expected/actual/file) — NOT fixed (D-11):\n${bugIndications.map((b) => `  - ${b}`).join("\n")}`;
      }

      return `gsd_add_tests: generated ${acceptedPaths.length} test file(s) for phase ${phase.n} (${phase.name}). Status: ${structured.status}. Skipped: ${skippedRecords.length}. Coverage gaps (report-only, never fixed): ${gapIds.length ? gapIds.join(", ") : "none"}. Suggested run: ${infra.suggested_command} (tool does not execute the suite — D-11). Wrote ${atestPath}.${commitNote} Branch: ${branchInfo.action} (${branchInfo.branch}). STATE not advanced.${bugNote}`;
    },
    presentCall: (a) => ({ card: "generic", title: `Add-tests for phase ${a.phase}`, kind: "other", rawInput: { phase: a.phase } }),
  }));
}

export { name, inject, apply, extractChangedFiles, TEST_WRITER_SCHEMA, resolveWriterOutput, buildATestBody };

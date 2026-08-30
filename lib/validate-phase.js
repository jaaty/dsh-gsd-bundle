// @dsh-gsd/bundle/validate-phase — the validate-phase loop-step tool (opengsd
// /gsd-validate-phase). A full loop-step plugin mirroring lib/code-review.js
// (hybrid fresh-context subagent) + lib/gap-analysis.js (deterministic pure-JS
// scan + soft gate):
//
// - publishes the gsdValidatePhase capability (order 45, between verify 40 and
//   ship 50; D-01/D-02)
// - registers the /gsd-validate-phase command's tool (gsd_validate_phase)
// - runs a DETERMINISTIC pure-JS requirement→test coverage scan (D-04, gap-analysis
//   style, no subagent, no tokens) that maps each phase requirement to the test
//   infra + discovered test files and classifies COVERED | PARTIAL | MISSING |
//   Manual-Only (D-08), building the Per-Task Map gap table
// - writes <NN>-VALIDATION.md via writeArtifact with a status frontmatter
//   (validated | validated-partial; D-07/D-09)
// - advances STATE to the 'validate' step (next_action ship-phase; D-02) and
//   commits the artefact via the shared git seam
//
// This plan (Plan 01) is the deterministic scan-only vertical slice. The
// gsd-nyquist-auditor test-writer, the gap-plan confirmation gate, and the
// atomic test-file commits land in Plan 02 — gsd_validate_phase here runs the
// pure scan, classifies gaps, writes VALIDATION.md, and commits without ever
// spawning a subagent.
//
// DEGR-07: the auditor subagent (Plan 02) WILL spawn, so 'subagents' is declared
// as a hard coeffect now (mirroring code-review.js inject) even though this plan
// does not call spawnSubagent.
//
// The pure scan helpers (detectTestInfra, isTestPath, validateTestPaths,
// classifyGaps, markManualOnly, classifyStatus, assembleValidationTable) are
// exported with NO ctx / NO fs / NO git parameters so they are unit-testable
// directly (D-04, mirroring gap-analysis.js). All I/O happens in apply().

import { defineTool } from "@deepseek-ai/dsh-tools";
import { nowIso, today, zeroPad, parseFrontmatter, stringifyFrontmatter } from "./_shared.js";
import { cwdOf, spawnSubagent } from "./_runner.js";
import { ensurePhaseBranch, commitArtifacts, commitSourceFiles, defaultGitFn } from "./_git-artifacts.js";
import { buildCapability } from "./_capabilities.js";
import { VALIDATION_AUDITOR_PROMPT } from "./_agents.js";

const name = "gsd-validate-phase";
// DEGR-07 (D-01): 'subagents' is a required coeffect — the auditor (Plan 02)
// spawns a subagent, so the fiber activates against the host subagents service.
const inject = ["gsdState", "tools", "subagents"];

// ── pure scan helpers (no ctx, no I/O — unit-testable directly) ───────────────

const TEST_NAME_RE = /\.(test|spec)\.[a-z0-9]+$/i;
const TEST_PREFIX_RE = /^test_/i;
const TEST_DIR_SEGMENT_RE = /(^|\/)(test|tests|__tests__)(\/|$)/;

// The directory segments skipped during the bounded listDir walk (mirrors
// ui-review.js SKIP_DIRS).
const SKIP_DIRS = new Set(["node_modules", ".git", ".planning"]);

// True when a path (basename or directory shape) denotes an automated test file
// (D-08). Matches `*.test.<ext>` / `*.spec.<ext>` basenames, `test_`-prefixed
// basenames, or a `/test/`, `/tests/`, `/__tests__/` path segment.
export function isTestPath(p) {
  const s = String(p || "");
  const base = s.slice(s.lastIndexOf("/") + 1);
  if (TEST_NAME_RE.test(base)) return true;
  if (TEST_PREFIX_RE.test(base)) return true;
  return TEST_DIR_SEGMENT_RE.test(s);
}

// The tool-side hard boundary for auditor-returned test paths (D-06/R-5):
// only relative, non-traversing, test-shaped file paths are writable. Absolute
// paths, empty strings, any `..` segment, and implementation files are skipped.
export function validateTestPaths(paths = []) {
  const valid = [];
  const skipped = [];
  for (const p of paths) {
    const s = String(p || "");
    if (s === "") { skipped.push(p); continue; }
    if (s.startsWith("/")) { skipped.push(p); continue; }
    if (s.split("/").includes("..")) { skipped.push(p); continue; }
    if (!isTestPath(s)) { skipped.push(p); continue; }
    valid.push(s);
  }
  return { valid, skipped };
}

// Detect the active project's test infrastructure from discovered config files +
// test files (D-05). Pure string logic: a `jest.config*` basename means jest, a
// `vitest.config*` basename means vitest, otherwise node:test.
export function detectTestInfra({ configFiles = [], testFiles = [] } = {}) {
  const base = (p) => String(p || "").split("/").pop();
  const has = (re) => (configFiles || []).some((p) => re.test(base(p)));
  if (has(/^jest\.config/)) {
    return { kind: "jest", suggested_command: "npx jest --runInBand", testPatterns: ["**/*.test.{js,ts,jsx,tsx}"] };
  }
  if (has(/^vitest\.config/)) {
    return { kind: "vitest", suggested_command: "npx vitest run", testPatterns: ["**/*.test.{js,ts,jsx,tsx}"] };
  }
  return { kind: "node", suggested_command: "node --test", testPatterns: ["**/*.test.{js,mjs}"] };
}

// Classify each phase requirement against its discovered test files (D-08):
// COVERED (≥1 non-failing test), PARTIAL (≥1 known-failing test), MISSING (none).
// files is an array of { path, failing? }.
export function classifyGaps(testsByReqId = {}) {
  return Object.entries(testsByReqId).map(([reqId, files]) => {
    const list = Array.isArray(files) ? files : [];
    const testFiles = list.map((f) => (f && f.path) || "");
    const classification =
      testFiles.length === 0 ? "MISSING" : list.some((f) => f && f.failing) ? "PARTIAL" : "COVERED";
    return { reqId, classification, testFiles };
  });
}

// Flag a set of reqIds as Manual-Only (D-09) on a copy of the rows, preserving
// each row's classification. Manual-only evidence is a legitimate validated path.
export function markManualOnly(rows = [], reqIds = []) {
  const set = new Set(reqIds);
  return rows.map((r) => ({ ...r, manualOnly: r.reqId ? set.has(r.reqId) : false }));
}

// Derive the report status (D-09): 'validated' only when there is at least one
// row and every row is COVERED and not Manual-Only; any MISSING/Manual-Only/
// PARTIAL row (or no rows) yields 'validated-partial'.
export function classifyStatus(rows = []) {
  if (rows.length === 0) return "validated-partial";
  const ok = rows.every((r) => r.classification === "COVERED" && !r.manualOnly);
  return ok ? "validated" : "validated-partial";
}

// Assemble the Per-Task Map gap table (D-07/D-08): a Markdown pipe table mapping
// each requirement to its classification and test file(s).
export function assembleValidationTable(rows = []) {
  const lines = ["| REQ | Classification | Test file(s) |", "|---|---|---|"];
  for (const r of rows) {
    const cls = r.manualOnly ? "Manual-Only" : r.classification;
    const files = (r.testFiles || []).filter(Boolean).join(", ") || "—";
    lines.push(`| ${r.reqId} | ${cls} | ${files} |`);
  }
  return lines.join("\n");
}

// ── Plan 02: gsd-nyquist-auditor structured contract + resolvers ─────────────
// The subagent WRITES the missing tests and returns them as structured output;
// the TOOL (not the subagent) writes them to disk and commits (D-12). These are
// PURE, exported, unit-testable helpers — all I/O lives in apply() (D-04 tier).

// The valid auditor statuses (D-11/Plan 02). Enumerated once so the schema, the
// resolver, and the degrade report agree.
const AUDITOR_STATUSES = ["GAPS_FILLED", "PARTIAL", "ESCALATE"];

// The structured-output contract for the gsd-nyquist-auditor subagent. Restricted
// object-rooted subset only (type/properties/required/items/enum — no pattern/
// format/numeric bounds), mirroring CODE_REVIEWER_SCHEMA.
export const VALIDATION_AUDITOR_SCHEMA = Object.freeze({
  type: "object",
  properties: {
    tests_written: {
      type: "array",
      items: {
        type: "object",
        properties: {
          path: { type: "string" },
          req_id: { type: "string" },
          content: { type: "string" },
        },
        required: ["path", "req_id", "content"],
        additionalProperties: false,
      },
    },
    status: { type: "string", enum: [...AUDITOR_STATUSES] },
    partial: { type: "array", items: { type: "string" } },
    escalated: {
      type: "array",
      items: {
        type: "object",
        properties: {
          req_id: { type: "string" },
          reason: { type: "string" },
        },
        required: ["req_id"],
        additionalProperties: false,
      },
    },
    notes: { type: "string" },
  },
  required: ["tests_written", "status"],
  additionalProperties: false,
});

// Validate the auditor subagent's structured output. Returns the structured object
// when it is an object with an array `tests_written` whose every entry carries a
// string path/req_id/content AND a `status` in the AUDITOR_STATUSES enum; otherwise
// returns null (the caller degrades to an UNAVAILABLE report, D-11).
export function resolveAuditorOutput(structured) {
  if (!structured || typeof structured !== "object") return null;
  if (!Array.isArray(structured.tests_written)) return null;
  for (const t of structured.tests_written) {
    if (!t || typeof t !== "object") return null;
    if (typeof t.path !== "string" || typeof t.req_id !== "string" || typeof t.content !== "string") return null;
  }
  if (!AUDITOR_STATUSES.includes(structured.status)) return null;
  return structured;
}

// Plan 02 gate predicate: true when any NON-manual row is still MISSING or
// PARTIAL — i.e. the audit has at least one gap the test-writer must close.
// Manual-Only rows are excluded (they are already resolved via documented
// evidence, D-09).
export function needsGapWriting(rows = []) {
  return rows.some(
    (r) => !r.manualOnly && (r.classification === "MISSING" || r.classification === "PARTIAL"),
  );
}

// Plan 02 Sign-Off section body (D-07): captures the reconciled status, the number
// of remaining open gaps (MISSING/PARTIAL, excluding Manual-Only), and any auditor
// paths that were rejected/skipped (so the Manual-Only note is traceable).
export function renderSignOff(rows = [], status, skippedPaths = []) {
  const open = rows.filter(
    (r) => !r.manualOnly && (r.classification === "MISSING" || r.classification === "PARTIAL"),
  );
  const lines = [];
  lines.push(`Validation status **${status}**.`);
  if (open.length === 0) {
    lines.push("No automated-test gaps remain open.");
  } else {
    lines.push(`${open.length} automated-test gap(s) remain open (${open.map((r) => r.reqId).join(", ")}).`);
  }
  if (skippedPaths && skippedPaths.length) {
    lines.push(`Auditor paths rejected/skipped (not written): ${skippedPaths.join(", ")} — escalated to Manual-Only.`);
  }
  return lines.join("\n");
}

// ── internal (I/O-bound) helpers — these DO touch ctx.fs / state ──────────────
// Deliberately NOT exported as pure helpers (D-04 tier rule): the deterministic
// scan's I/O lives here, while the classification/table logic stays in the pure
// functions above so they can be unit-tested without a ctx.

// Bounded recursive listDir walk from cwd (ctx.fs has NO glob — mirror the
// ui-review.js discoverFrontendFiles discipline). Collects config basenames
// (jest.config*/vitest.config*/package.json) and test-file repo-relative paths.
async function discoverFiles(ctx, cwd) {
  const configFiles = [];
  const testFiles = [];
  async function walk(dir, rel) {
    const target = await ctx.fs.resolve(dir);
    const stat = await ctx.fs.stat(target);
    if (!stat) return;
    const entries = await ctx.fs.listDir(target);
    for (const e of entries) {
      if (e.type === "directory") {
        if (SKIP_DIRS.has(e.name)) continue;
        await walk(`${dir}/${e.name}`, rel ? `${rel}/${e.name}` : e.name);
      } else if (e.type === "file") {
        const relPath = rel ? `${rel}/${e.name}` : e.name;
        if (/^(jest\.config|vitest\.config)/.test(e.name) || e.name === "package.json") configFiles.push(e.name);
        if (isTestPath(relPath)) testFiles.push(relPath);
      }
    }
  }
  await walk(cwd, "");
  return { configFiles, testFiles };
}

// Read an artefact body, tolerating absence (undefined). Returns undefined when
// the artefact does not exist or cannot be parsed as frontmatter.
async function safeReadArtifact(s, cwd, phaseNum, suffix) {
  const text = await s.readArtifact(cwd, phaseNum, suffix);
  if (text === undefined) return undefined;
  const { frontmatter, body } = parseFrontmatter(text);
  return { frontmatter, body };
}

// Signals for a requirement across the phase's PLAN/SUMMARY bodies: whether the
// req token appears in prose, and whether a summary records it as failing.
async function artefactSignals(s, cwd, phaseNum, plans, re) {
  let mentioned = false;
  let failing = false;
  for (const p of plans) {
    const planBody = await safeReadArtifact(s, cwd, phaseNum, `PLAN-${zeroPad(Number(p.plan))}`);
    if (planBody && re.test(planBody.body)) mentioned = true;
    if (p.has_summary) {
      const sum = await safeReadArtifact(s, cwd, phaseNum, `SUMMARY-${zeroPad(Number(p.plan))}`);
      if (sum) {
        if (re.test(sum.body)) mentioned = true;
        if (/FAILING|failing|not passing|does not pass|XFAIL/i.test(sum.body)) failing = true;
      }
    }
  }
  return { mentioned, failing };
}

// Build the reqId → [{ path, failing? }] evidence map (D-04, RESEARCH OQ-1).
// A test file covers a requirement when its basename carries the normalized req
// token, OR when the phase's PLAN/SUMMARY prose names the req AND the phase has
// discovered test files (presumptive COVERED-on-presence). A failure keyword in
// the summary (or a "fail"-labelled test basename) marks the evidence failing →
// the row classifies PARTIAL (D-08).
async function matchReqToTests(s, cwd, phase, phaseReqIds, testFiles) {
  const plans = await s.listPlans(cwd, phase.n);
  const map = {};
  for (const reqId of phaseReqIds || []) {
    const re = new RegExp("\\b" + String(reqId).replace(/-/g, "\\-") + "\\b");
    const normalized = String(reqId).toLowerCase().replace(/-/g, "");
    const byName = testFiles.filter((p) => {
      const base = p.split("/").pop().toLowerCase().replace(/[\-.]+/g, "");
      return base.includes(normalized);
    });
    const { mentioned, failing } = await artefactSignals(s, cwd, phase.n, plans, re);
    const entries = [];
    const seen = new Set();
    for (const p of byName) {
      if (seen.has(p)) continue;
      seen.add(p);
      const failName = /\bfail/i.test(p.split("/").pop());
      entries.push({ path: p, failing: failing || failName });
    }
    if (mentioned && entries.length === 0 && testFiles.length > 0) {
      entries.push({ path: testFiles[0], failing });
    }
    map[reqId] = entries;
  }
  return map;
}

// Assemble the VALIDATION.md body (D-07): Test Infrastructure + Per-Task Map +
// Manual-Only + Sign-Off sections. The Sign-Off section delegates to the pure
// renderSignOff helper (Plan 02) so it stays in sync with the reconciled rows.
function buildValidationBody(phase, fm, rows, gapCount, manualOnlyReqIds, skippedPaths = []) {
  const lines = [];
  lines.push(`# Phase ${phase.n}: ${phase.name} - Validation Report`, "");
  lines.push(`**Validated:** ${fm.validated}`);
  lines.push(`**Status:** ${fm.status}`, "");
  lines.push("## Test Infrastructure", "");
  lines.push(`- Test framework: \`${fm.test_infra}\``);
  lines.push(`- Suggested command: \`${fm.suggested_command}\``, "");
  lines.push("## Per-Task Map", "");
  lines.push("> Deterministic requirement→test coverage scan. COVERED: green automated test targets the behaviour; PARTIAL: test exists but failing/incomplete; MISSING: no automated test found; Manual-Only: validated via documented manual evidence (D-09).", "");
  lines.push(assembleValidationTable(rows), "");
  lines.push("## Manual-Only", "");
  if (manualOnlyReqIds.length) {
    lines.push("| REQ | Rationale |");
    lines.push("|---|---|");
    for (const id of manualOnlyReqIds) lines.push(`| ${id} | Manual evidence (impractical/impossible to automate) |`);
    lines.push("");
  } else {
    lines.push("_None — every requirement has (or expects) an automated test._", "");
  }
  lines.push("## Sign-Off", "");
  lines.push(renderSignOff(rows, fm.status, skippedPaths), "");
  lines.push("---", "", `*Phase: ${String(phase.n).padStart(2, "0")}-${phase.name}*`, `*Validation: ${today()}*`);
  return lines.join("\n");
}

function apply(ctx) {
  const gsd = () => ctx.get("gsdState");

  // Publish this loop step's capability (DEGR-01/D-01). Auto-tracked revertible
  // effect: retiring the validate-phase plugin withdraws gsdValidatePhase.
  ctx.provide("gsdValidatePhase", buildCapability("gsdValidatePhase"));

  ctx.tools.register(defineTool({
    name: "gsd_validate_phase",
    description: "Validate phase N (opengsd /gsd-validate-phase): retro audit of a COMPLETED phase's test coverage. A deterministic pure-JS scan maps each phase requirement to the active project's test infra + discovered test files, classifies COVERED/PARTIAL/MISSING/Manual-Only, writes <NN>-VALIDATION.md with a status frontmatter, advances STATE to 'validate' (next ship), and lands the artefact on the phase branch. Soft gate — never blocks verify or ship. Run after gsd_verify, before gsd_ship.",
    parameters: {
      phase: { type: "number" },
      auto: { type: "boolean" },
      gap_decision: { type: "string", enum: ["fix-all-gaps", "skip-for-now", "cancel"] },
    },
    output: { schema: { type: "string" }, render: (_a, v) => [{ type: "text", text: v }] },
    async execute(args, exec) {
      const cwd = cwdOf(exec);
      const s = gsd();
      if (!s) throw new Error("gsd_validate_phase: gsdState service unavailable");
      if (!(await s.isProject(cwd))) throw new Error("gsd_validate_phase: no .planning/ project — run gsd_init first");
      const roadmap = await s.readRoadmap(cwd);
      const phase = (roadmap?.phases || []).find((p) => p.n === args.phase);
      if (!phase) throw new Error(`gsd_validate_phase: phase ${args.phase} not in ROADMAP.md`);

      // Non-completed fail-fast (D-11/R-6): the phase must have been executed
      // (at least one plan with a SUMMARY.md) before its test coverage is audited.
      const plans = await s.listPlans(cwd, phase.n);
      if (!plans.some((p) => p.has_summary)) {
        throw new Error(`gsd_validate_phase: phase ${phase.n} not executed (no SUMMARY found — run gsd_execute first)`);
      }

      // Config soft gate (D-03): soft-skip when workflow.validate_phase is
      // explicitly false. Default true; write NO artefact, never throw.
      const cfg = await s.readConfig(cwd);
      if (cfg.workflow?.validate_phase === false) {
        return "Validate-phase skipped (validate-phase capability inactive) — workflow.validate_phase is false. No VALIDATION.md written.";
      }

      // CQ-07/MW-02: acquire the per-phase feature branch before any artefact write.
      const branchInfo = await ensurePhaseBranch(cwd, phase.n);

      // D-04: phase requirement candidates (ids from ROADMAP, text from REQUIREMENTS).
      const reqs = await s.readRequirements(cwd);
      const textById = new Map(reqs.map((r) => [r.id, r.text]));
      const phaseReqIds = phase.requirements || [];

      // D-05: discover test/config files with a bounded recursive listDir walk
      // (ctx.fs has NO glob). Skip node_modules/.git/.planning.
      const discovered = await discoverFiles(ctx, cwd);
      const infra = detectTestInfra({ configFiles: discovered.configFiles, testFiles: discovered.testFiles });

      // Build the testsByReqId map by matching each phase REQ-ID token against
      // test-file basenames/paths and the phase's PLAN/SUMMARY bodies (D-04,
      // RESEARCH OQ-1). A matched, non-escalated green test file → COVERED.
      const testsByReqId = await matchReqToTests(s, cwd, phase, phaseReqIds, discovered.testFiles);

      // D-09: carry forward any Manual-Only escalations recorded in a prior
      // <NN>-VALIDATION.md (default none).
      const manualOnlyReqIds = [];
      const prior = await safeReadArtifact(s, cwd, phase.n, "VALIDATION");
      if (prior) {
        // Re-derive manual-only req ids from the prior report's Manual-Only table
        // (rows whose classification column reads "Manual-Only").
        for (const line of (prior.body || "").split(/\r?\n/)) {
          const m = line.match(/^\|\s+([A-Za-z]+-\d+)\s+\|\s+Manual-Only\s+\|/);
          if (m) manualOnlyReqIds.push(m[1]);
        }
      }

      let rows = classifyGaps(testsByReqId);
      rows = markManualOnly(rows, manualOnlyReqIds);
      let status = classifyStatus(rows);
      const gapCount = rows.filter((r) => r.classification === "MISSING" || r.classification === "PARTIAL").length;
      // Plan 02 gate predicate: are there any non-manual gaps the test-writer
      // must close? (Converted into the fix-all-gaps gate dispatch below.)
      const hasGaps = needsGapWriting(rows);

      // ── Plan 02 gap-plan confirmation gate (D-10 / D-09) ───────────────────
      // The test-writer subagent only runs after the user approves the gap plan
      // (fix-all-gaps / skip-for-now / cancel). --auto bypasses the gate under a
      // bounded run cap; nothing is written or spawned before approval.
      if (hasGaps && !args.auto && !args.gap_decision) {
        const openIds = rows
          .filter((r) => !r.manualOnly && (r.classification === "MISSING" || r.classification === "PARTIAL"))
          .map((r) => r.reqId)
          .join(", ");
        return `Validate-phase: ${gapCount} automated-test gap(s) remain for phase ${phase.n} (${phase.name}): ${openIds}. Ask the user to choose how to close them, then re-call gsd_validate_phase with the chosen gap_decision:
  - "fix-all-gaps"  → spawn the gsd-nyquist-auditor to WRITE the missing tests (committed atomically).
  - "skip-for-now"  → escalate the remaining gaps to Manual-Only and write a validated-partial VALIDATION.md (no tests written).
  - "cancel"        → abort; no subagent, no test files, no VALIDATION.md.
  Alternatively re-call with --auto to bypass this gate under a bounded run cap.`;
      }

      // cancel → abort with no subagent, no test writes, no VALIDATION.md.
      if (args.gap_decision === "cancel") {
        return `Validate-phase cancelled for phase ${phase.n} (${phase.name}). No subagent was spawned, no test files were written, and no VALIDATION.md was committed.`;
      }

      // skip-for-now → escalate the open gaps to Manual-Only (D-09) and write a
      // validated-partial VALIDATION.md; NO auditor spawned, no tests written.
      if (args.gap_decision === "skip-for-now") {
        const openIds = rows
          .filter((r) => !r.manualOnly && (r.classification === "MISSING" || r.classification === "PARTIAL"))
          .map((r) => r.reqId);
        rows = markManualOnly(rows, openIds);
        status = classifyStatus(rows);
        const manualIds = [...new Set([...manualOnlyReqIds, ...rows.filter((r) => r.manualOnly).map((r) => r.reqId)])];
        const fm = {
          phase: String(phase.n),
          validated: nowIso(),
          status,
          test_infra: infra.kind,
          suggested_command: infra.suggested_command,
        };
        const body = buildValidationBody(phase, fm, rows, 0, manualIds);
        const full = stringifyFrontmatter(fm) + "\n" + body;
        const ctxPath = await s.writeArtifact(cwd, phase.n, "VALIDATION", full);
        await s.setActivePhase(cwd, phase.n, "validate");
        await s.addDecision(cwd, `Phase ${phase.n}: VALIDATION.md written (status validated-partial, gaps skipped to Manual-Only)`);
        const commit = await commitArtifacts(cwd, phase.n, { scope: "validate-phase", phaseName: phase.name });
        const commitNote = ` Artefacts committed: ${commit.committed} (${commit.staged.length} file(s)).` + (commit.warning ? ` WARNING: ${commit.warning}.` : "");
        return `Validate skipped-for-now for phase ${phase.n} (${phase.name}). ${openIds.length} open gap(s) escalated to Manual-Only. Wrote ${ctxPath}. Status: ${status}.${commitNote} Branch: ${branchInfo.action} (${branchInfo.branch}). STATE advanced to 'validate'. Next: gsd_ship on phase ${phase.n}.`;
      }

      // No open gaps (every requirement COVERED / Manual-Only) → write the
      // VALIDATION.md directly; no gate, no auditor.
      if (!hasGaps) {
        const fm = {
          phase: String(phase.n),
          validated: nowIso(),
          status,
          test_infra: infra.kind,
          suggested_command: infra.suggested_command,
        };
        const body = buildValidationBody(phase, fm, rows, 0, manualOnlyReqIds);
        const full = stringifyFrontmatter(fm) + "\n" + body;
        const ctxPath = await s.writeArtifact(cwd, phase.n, "VALIDATION", full);
        await s.setActivePhase(cwd, phase.n, "validate");
        await s.addDecision(cwd, `Phase ${phase.n}: VALIDATION.md written (status ${status})`);
        const commit = await commitArtifacts(cwd, phase.n, { scope: "validate-phase", phaseName: phase.name });
        const commitNote = ` Artefacts committed: ${commit.committed} (${commit.staged.length} file(s)).` + (commit.warning ? ` WARNING: ${commit.warning}.` : "");
        return `Validate complete for phase ${phase.n} (${phase.name}). Wrote ${ctxPath}. Status: ${status}, gaps: ${gapCount}. No validation gaps remain.${commitNote} Branch: ${branchInfo.action} (${branchInfo.branch}). STATE advanced to 'validate'. Next: gsd_ship on phase ${phase.n}.`;
      }

      // ── Auditor path (fix-all-gaps or --auto): spawn the gsd-nyquist-auditor
      // to WRITE the missing tests, commit them atomically, reconcile the gap
      // table, and rewrite VALIDATION.md. D-06 bounded MAX_DEBUG iteration loop;
      // --auto early-stops when the resolved status becomes 'validated' (D-10).
      const MAX_DEBUG = 3;

      // Build the auditor prompt from the current gap table + infra + phase scope.
      const buildAuditorPrompt = (currentRows) => [
        VALIDATION_AUDITOR_PROMPT,
        "",
        "<phase_context>",
        `Phase: ${phase.n} - ${phase.name}`,
        `Phase goal: ${phase.goal || "(none)"}`,
        `Test framework: ${infra.kind}`,
        `Suggested command: ${infra.suggested_command}`,
        "Gap table:",
        assembleValidationTable(currentRows),
        "Place any new test files under a test-shaped path (test/, tests/, __tests__/, or a *.test.* / test_* basename).",
        "</phase_context>",
      ].join("\n");

      let degraded = false;
      let errorCause = null;
      let skippedPaths = [];
      let writtenCount = 0;
      let autoNote = "";

      async function runAuditPass() {
        const promptText = buildAuditorPrompt(rows);
        let structured;
        let cause = null;
        try {
          const r = await spawnSubagent(ctx, exec, { label: "gsd-nyquist-auditor", promptText, outputSchema: VALIDATION_AUDITOR_SCHEMA });
          structured = resolveAuditorOutput(r.structured);
          if (!structured) cause = "auditor returned malformed structured output (tests_written missing or invalid)";
        } catch (e) {
          cause = (e && e.message) || String(e);
        }
        if (cause) {
          degraded = true;
          errorCause = cause;
          return;
        }
        // R-5 hard boundary (D-06): write ONLY validated test-file paths; impl or
        // traversing paths are skipped and NEVER written.
        const committedPaths = [];
        for (const entry of structured.tests_written) {
          const { valid, skipped } = validateTestPaths([entry.path]);
          if (valid.length) {
            const target = await ctx.fs.resolve(`${cwd}/${entry.path}`);
            await ctx.fs.writeText(target, entry.content);
            committedPaths.push(entry.path);
            writtenCount++;
          } else {
            skippedPaths.push(...skipped);
          }
        }
        // D-12: commit the newly-written tests atomically & separately.
        if (committedPaths.length) {
          const gitFn = ctx.gitFn || defaultGitFn;
          await commitSourceFiles(cwd, committedPaths, `test(phase-${phase.n}): fill validation gaps`, gitFn);
        }
        // Reconcile (D-05/OQ-1, D-06): mark presumed-COVERED tests the auditor
        // found failing as PARTIAL; impl-bug escalations become Manual-Only.
        const partial = structured.partial || [];
        rows = rows.map((r) => (partial.includes(r.reqId) ? { ...r, classification: "PARTIAL" } : r));
        const escalatedIds = (structured.escalated || []).map((e) => e.req_id);
        rows = markManualOnly(rows, escalatedIds);
        status = classifyStatus(rows);
      }

      let pass = 0;
      while (pass < MAX_DEBUG) {
        pass++;
        await runAuditPass();
        if (degraded) break;
        if (!args.auto) break; // fix-all-gaps: a single audit pass is enough.
        if (status === "validated") { autoNote = ` --auto: all validation gaps resolved after iteration ${pass}.`; break; }
        if (pass >= MAX_DEBUG) autoNote = ` --auto: reached maximum iterations (${MAX_DEBUG}). Gaps may remain.`;
      }

      // ── finalise VALIDATION.md ─────────────────────────────────────────────
      let ctxPath;
      if (degraded) {
        // Degrade-with-flag (D-11): an auditor fault produces a pending
        // UNAVAILABLE VALIDATION.md; the still-open gaps are recorded Manual-Only.
        const openIds = rows
          .filter((r) => !r.manualOnly && (r.classification === "MISSING" || r.classification === "PARTIAL"))
          .map((r) => r.reqId);
        rows = markManualOnly(rows, openIds);
        const fm = {
          phase: String(phase.n),
          validated: nowIso(),
          status: "pending",
          test_infra: infra.kind,
          suggested_command: infra.suggested_command,
        };
        const bodyLines = [
          `# Phase ${phase.n}: ${phase.name} - Validation Report`,
          "",
          `**Validated:** ${fm.validated}`,
          "**Status:** UNAVAILABLE",
          "",
          "## Auditor Report",
          "",
          "**Status:** UNAVAILABLE",
          "",
          `_The gsd-nyquist-auditor subagent could not complete. Cause: ${errorCause || "unknown"}._`,
          "",
          "## Manual-Only",
          "",
          "| REQ | Rationale |",
          "|---|---|",
          ...[...new Set(openIds)].map((id) => `| ${id} | Auditor UNAVAILABLE — gap recorded as Manual-Only pending a retry |`),
          "",
          "## Sign-Off",
          "",
          renderSignOff(rows, "pending", skippedPaths),
          "",
          "---",
          "",
          `*Phase: ${String(phase.n).padStart(2, "0")}-${phase.name}*`,
          `*Validation: ${today()}*`,
        ];
        const full = stringifyFrontmatter(fm) + "\n" + bodyLines.join("\n");
        ctxPath = await s.writeArtifact(cwd, phase.n, "VALIDATION", full);
      } else {
        const manualIds = [...new Set([...manualOnlyReqIds, ...rows.filter((r) => r.manualOnly).map((r) => r.reqId)])];
        const fm = {
          phase: String(phase.n),
          validated: nowIso(),
          status,
          test_infra: infra.kind,
          suggested_command: infra.suggested_command,
        };
        const body = buildValidationBody(phase, fm, rows, gapCount, manualIds, skippedPaths);
        const full = stringifyFrontmatter(fm) + "\n" + body;
        ctxPath = await s.writeArtifact(cwd, phase.n, "VALIDATION", full);
      }

      // D-02: advance STATE to the 'validate' step (next_action ship-phase).
      await s.setActivePhase(cwd, phase.n, "validate");
      await s.addDecision(cwd, `Phase ${phase.n}: VALIDATION.md written (status ${status}, ${writtenCount} test(s) written/committed)`);

      // CQ-07/MW-03: commit the just-written VALIDATION.md artefact via the seam.
      const commit = await commitArtifacts(cwd, phase.n, { scope: "validate-phase", phaseName: phase.name });
      const commitNote = ` Artefacts committed: ${commit.committed} (${commit.staged.length} file(s)).` + (commit.warning ? ` WARNING: ${commit.warning}.` : "");
      const statusWord = degraded ? "UNAVAILABLE" : status;
      return `Validate phase ${phase.n} (${phase.name}). Wrote ${ctxPath}. Status: ${statusWord}, ${writtenCount} test(s) written/committed.${autoNote}${commitNote} Branch: ${branchInfo.action} (${branchInfo.branch}). STATE advanced to 'validate'. Next: gsd_ship on phase ${phase.n}.`;
    },
    presentCall: (a) => ({ card: "generic", title: `Validate phase ${a.phase}`, kind: "other", rawInput: { phase: a.phase } }),
  }));
}

export { name, inject, apply };

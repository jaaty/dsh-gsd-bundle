// Pure capability-gate evaluators for the gsd_ship gatekeeper (Phase 8).
// Domain tier: all functions are pure, I/O-free, and deterministic, taking
// in-memory inputs and returning { status, findings } so they can be unit
// tested without a real git or filesystem.
//
// Gates:
//   - securityGate:      path-match changed files against the secret/credential
//                        glob list (D-01).
//   - brokenWindowsGate: content-scan changed code files for unreferenced
//                        TODO/FIXME/XXX markers and skipped tests (D-02).
//   - tddAuditGate:      verify type:tdd plans produced test: commits before
//                        feat:/fix: commits (D-03/D-09).
//
// resolveGatesConfig resolves the config.json `gates` block + skip list into a
// per-gate enabled/skipped map (D-06/D-08).

import path from "node:path";

import { secretPatterns } from "./_shared.js";

// Translate a single glob into a RegExp. `*` -> `.*`, `?` -> `.`, a trailing
// `/` (dir glob) becomes `/**`, anchors both ends, and escapes every other
// regex metacharacter so globs are matched literally otherwise.
export function globToRegex(glob) {
  let src = glob;
  let trailingDir = false;
  if (src.endsWith("/")) {
    trailingDir = true;
    src = src.slice(0, -1);
  }
  let out = "";
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (ch === "*") out += ".*";
    else if (ch === "?") out += ".";
    else out += ch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
  // A slash-less glob (e.g. ".env", "*.pem") matches the basename at any depth,
  // like a gitignore pattern without a slash.
  if (!src.includes("/")) out = `(?:.*/)?${out}`;
  if (trailingDir) out += "(?:/.*)?";
  return new RegExp(`^${out}$`);
}

function matchSecretPatterns(file) {
  for (const pattern of secretPatterns) {
    if (globToRegex(pattern).test(file)) return pattern;
  }
  return null;
}

// Security gate (D-01): any changed file path matching a secret/credential
// glob is a failure naming the file and the matched pattern.
export function securityGate(changedFiles) {
  const findings = [];
  for (const file of changedFiles) {
    const pattern = matchSecretPatterns(file);
    if (pattern) findings.push({ file, pattern });
  }
  return { status: findings.length ? "fail" : "pass", findings };
}

// Code/test file extensions whose contents the broken-windows gate scans.
// Non-code files (markdown, prose, .planning/** artefacts) are excluded so
// plan/context prose containing "TODO" never false-positives (OQ-2).
const CODE_EXT = new Set([
  ".js",
  ".ts",
  ".mjs",
  ".cjs",
  ".py",
  ".go",
  ".rs",
  ".java",
  ".sh",
  ".yml",
  ".yaml",
  ".json",
  ".jsx",
  ".tsx",
  ".vue",
]);

const MARKER_RE = /(TODO|FIXME|XXX)/;
const SKIPPED_TEST_RE = /(test\.skip\(|describe\.skip\(|\bxit\()/;

function extOf(file) {
  const idx = file.lastIndexOf(".");
  return idx >= 0 ? file.slice(idx).toLowerCase() : "";
}

// Broken-windows gate (D-02): scan each changed code/test file's ADDED lines
// (from diffMap) for an unreferenced TODO/FIXME/XXX marker or a skipped-test
// marker. .planning/** prose and non-code files are excluded. The gate's own
// implementation file is also excluded: it necessarily contains the marker
// tokens it detects (the MARKER_RE literal and its doc comments), so scanning
// it would always self-flag. When diffMap has no entry for a file (diff
// unavailable), it falls back to the whole-file content so the gate still runs.
const SELF_FILE = "lib/gates.js";
export function brokenWindowsGate(changedFiles, contentMap, diffMap = {}) {
  const findings = [];
  for (const file of changedFiles) {
    if (/^\.planning\//.test(file)) continue;
    if (file === SELF_FILE) continue;
    if (!CODE_EXT.has(extOf(file))) continue;
    const added = diffMap[file];
    const content = Array.isArray(added) ? added.join("\n") : (contentMap[file] ?? "") || "";
    const skipped = content.match(SKIPPED_TEST_RE);
    if (skipped) {
      findings.push({ file, marker: "skipped-test" });
      continue;
    }
    const marker = content.match(MARKER_RE);
    if (marker) findings.push({ file, marker: marker[1] });
  }
  return { status: findings.length ? "fail" : "pass", findings };
}

// Derive the "(phase-plan)" commit scope token from a plan's structured
// phase/plan fields, matching the {phase}-{plan} conventional-commit scope
// convention (lib/_agents.js:157). The stored fields are unpadded ("8"/"1"),
// so both segments are zero-padded to 2 digits to keep the exact (08-01)
// format the tdd-audit gate regexes against (D-02). Never parses plan.id.
function planScope(plan) {
  return `${String(plan.phase).padStart(2, "0")}-${String(plan.plan).padStart(2, "0")}`;
}

// TDD-audit gate (D-03/D-09): for each plan typed type:tdd, its scope-matching
// commits must contain a "test(" subject before any "feat("/"fix(" subject.
export function tddAuditGate(plans, commitSubjects) {
  const findings = [];
  for (const plan of plans) {
    if (plan.type !== "tdd") continue;
    const scope = planScope(plan);
    const seq = commitSubjects.filter((s) => new RegExp(`\\(${scope}\\)`).test(s));
    if (!seq.length) {
      findings.push({ planId: plan.id, reason: "missing test: commit before feat:/fix:" });
      continue;
    }
    let sawTest = false;
    let ok = false;
    for (const subject of seq) {
      if (/^test\(/.test(subject)) {
        sawTest = true;
        ok = true;
        break;
      }
      if (/^(feat|fix)\(/.test(subject)) {
        ok = false;
        break;
      }
    }
    if (!ok || !sawTest) {
      findings.push({ planId: plan.id, reason: "missing test: commit before feat:/fix:" });
    }
  }
  return { status: findings.length ? "fail" : "pass", findings };
}

// Dispatcher map (D-01/D-05): each gate name -> { run, format }. `run` evaluates
// the gate against the shared data object; `format` renders the first finding
// into the report detail line. Keys must align exactly with GATE_NAMES (D-04).
export const GATE_DISPATCH = {
  security: {
    run: (d) => securityGate(d.changedFiles),
    format: (f) => `${f.file}: matched ${f.pattern}`,
  },
  broken_windows: {
    run: (d) => brokenWindowsGate(d.changedFiles, d.contentMap, d.diffMap),
    format: (f) => `${f.file}: ${f.marker}`,
  },
  tdd_audit: {
    run: (d) => tddAuditGate(d.plans || [], d.commitSubjects),
    format: (f) => `${f.planId}: ${f.reason}`,
  },
};

// Orchestration seam (plan 02): turn the full config + git data + plans + skip
// list into a Gate Report and an optional blocking message. Runs each enabled
// gate's evaluator over the phase's changed files and folds the findings into
// one report line per gate; sets blockError only when an enabled gate failed
// (D-05, D-06, D-07, D-08). Skipped (disabled/skipped) gates never run and
// never block.
export function runCapabilityGates({ cfg, gitData, plans, skipGates = [] }) {
  const gates = resolveGatesConfig(cfg, skipGates);
  const { changedFiles = [], contentMap = {}, diffMap = {}, commitSubjects = [] } = gitData || {};
  const data = { changedFiles, contentMap, diffMap, plans, commitSubjects };
  const reportLines = [];
  const failures = [];
  for (const name of GATE_NAMES) {
    const gate = gates[name];
    if (gate.status === "skipped") {
      reportLines.push(`${name}: skipped`);
      continue;
    }
    const entry = GATE_DISPATCH[name];
    if (!entry) throw new Error(`gsd_ship: no dispatcher entry for gate "${name}"`);
    const result = entry.run(data);
    if (result.status === "fail") {
      const detail = entry.format(result.findings[0]);
      reportLines.push(`${name}: fail — ${detail}`);
      failures.push({ name, detail });
    } else {
      reportLines.push(`${name}: pass`);
    }
  }
  const blockError = failures.length
    ? failures.map((f) => `${f.name} gate failed: ${f.detail}`).join("; ")
    : null;
  return { reportLines, blockError };
}

export const GATE_NAMES = ["security", "broken_windows", "tdd_audit"];

// Resolve the config.json `gates` block + skipGates list into a per-gate
// enabled/skipped map. A gate is disabled (skipped) when cfg.gates.<name> is
// explicitly false OR the gate is in skipGates. Absent gates default enabled.
export function resolveGatesConfig(cfg, skipGates = []) {
  const gates = (cfg && cfg.gates) || {};
  const skip = skipGates || [];
  const out = {};
  for (const name of GATE_NAMES) {
    const enabled = gates[name] !== false && !skip.includes(name);
    out[name] = { enabled, status: enabled ? "enabled" : "skipped" };
  }
  return out;
}

// Integration tier: fetch the phase's changed files, their contents, the added
// (changed) lines per file, and the branch's commit subjects through an
// injectable git wrapper (mirroring ship.js's git() helper — callers pass
// gitFn(cwd, argsArray)). Scopes to the merge-base diff so only the phase's
// changed files are scanned, never the whole repo (D-04). The content reads use
// node:fs/promises on a resolved absolute path; unreadable or deleted files are
// skipped.
//
// `diffMap` maps each changed file to the array of lines ADDED by this phase
// (the `+` lines of a `git diff -U0`, with the leading `+` stripped). The
// broken-windows gate scans ONLY these added lines, so a pre-existing marker in
// an unchanged line of a file touched for an unrelated reason never flags.
export async function fetchGitData(cwd, gitFn, base) {
  const fs = await import("node:fs/promises");
  let defaultBranch = base;
  if (!defaultBranch) {
    const ref = (await gitFn(cwd, ["symbolic-ref", "refs/remotes/origin/HEAD", "--short"])).trim();
    defaultBranch = ref.replace(/^origin\//, "") || "main";
  }
  const mergeBase = (await gitFn(cwd, ["merge-base", "HEAD", defaultBranch])).trim();
  const changedFiles = mergeBase
    ? (await gitFn(cwd, ["diff", "--name-only", "--diff-filter=ACM", mergeBase, "HEAD"])).split("\n").filter(Boolean)
    : [];
  const contentMap = {};
  const diffMap = {};
  for (const file of changedFiles) {
    try {
      contentMap[file] = await fs.readFile(path.join(cwd, file), "utf8");
    } catch {
      // deleted/unreadable file — skip; no scannable content.
    }
    if (mergeBase) {
      try {
        const patch = await gitFn(cwd, ["diff", "-U0", mergeBase, "HEAD", "--", file]);
        diffMap[file] = addedLinesOf(patch);
      } catch {
        // diff unavailable — leave diffMap[file] undefined; the gate falls back
        // to whole-file content for that file.
      }
    }
  }
  const commitSubjects = mergeBase
    ? (await gitFn(cwd, ["log", "--format=%s", `${mergeBase}..HEAD`])).split("\n").filter(Boolean)
    : [];
  return { changedFiles, contentMap, diffMap, commitSubjects };
}

// Extract the added (`+`) lines from a unified-diff patch, stripping the leading
// `+`. The `+++` file-header line is excluded. Returns [] for an empty patch.
export function addedLinesOf(patch) {
  const out = [];
  for (const line of String(patch ?? "").split("\n")) {
    if (line.startsWith("+++")) continue;
    if (line.startsWith("+")) out.push(line.slice(1));
  }
  return out;
}

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

// Exact secret/credential glob list mirrored verbatim from lib/_agents.js:283
// (the FORBIDDEN FILES list), up to "-credentials.json". A changed file whose
// path matches any of these globs is a security-gate failure.
export const secretPatterns = [
  ".env",
  ".env.*",
  "credentials.*",
  "secrets.*",
  "*secret*",
  "*credential*",
  "*.pem",
  "*.key",
  "*.p12",
  "*.pfx",
  "*.jks",
  "id_rsa*",
  "id_ed25519*",
  "id_dsa*",
  ".npmrc",
  ".pypirc",
  ".netrc",
  "config/secrets/*",
  ".secrets/*",
  "secrets/",
  "*.keystore",
  "*.truststore",
  "serviceAccountKey.json",
  "*-credentials.json",
];

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
const SKIPPED_TEST_RE = /(test\.skip\(|describe\.skip\(|xit\()/;

function extOf(file) {
  const idx = file.lastIndexOf(".");
  return idx >= 0 ? file.slice(idx).toLowerCase() : "";
}

// Broken-windows gate (D-02): scan each changed code/test file's contents for
// an unreferenced TODO/FIXME/XXX marker or a skipped-test marker. .planning/**
// prose and non-code files are excluded.
export function brokenWindowsGate(changedFiles, contentMap) {
  const findings = [];
  for (const file of changedFiles) {
    if (/^\.planning\//.test(file)) continue;
    if (!CODE_EXT.has(extOf(file))) continue;
    const content = (contentMap[file] ?? "") || "";
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

// Derive the "(phase-plan)" commit scope token from a plan id, matching the
// {phase}-{plan} conventional-commit scope convention (lib/_agents.js:157).
// plan.id "GSD-08-x-01" or "GSD-08-capability-gates-01" -> "08-01".
function planScope(planId) {
  const tokens = String(planId).split("-");
  // tokens: ["GSD","08",... ,"01"] — phase number is token[1], plan number is
  // the last token. Never the last two tokens (that would give "gates-01" for
  // a phase-slug-prefixed id).
  const phase = tokens[1];
  const plan = tokens[tokens.length - 1];
  return `${phase}-${plan}`;
}

// TDD-audit gate (D-03/D-09): for each plan typed type:tdd, its scope-matching
// commits must contain a "test(" subject before any "feat("/"fix(" subject.
export function tddAuditGate(plans, commitSubjects) {
  const findings = [];
  for (const plan of plans) {
    if (plan.type !== "tdd") continue;
    const scope = planScope(plan.id);
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

// Orchestration seam (plan 02): turn the full config + git data + plans + skip
// list into a Gate Report and an optional blocking message. Runs each enabled
// gate's evaluator over the phase's changed files and folds the findings into
// one report line per gate; sets blockError only when an enabled gate failed
// (D-05, D-06, D-07, D-08). Skipped (disabled/skipped) gates never run and
// never block.
export function runCapabilityGates({ cfg, gitData, plans, skipGates = [] }) {
  const gates = resolveGatesConfig(cfg, skipGates);
  const { changedFiles = [], contentMap = {}, commitSubjects = [] } = gitData || {};
  const reportLines = [];
  const failures = [];
  for (const name of GATE_NAMES) {
    const gate = gates[name];
    if (gate.status === "skipped") {
      reportLines.push(`${name}: skipped`);
      continue;
    }
    let result;
    if (name === "security") result = securityGate(changedFiles);
    else if (name === "broken_windows") result = brokenWindowsGate(changedFiles, contentMap);
    else result = tddAuditGate(plans || [], commitSubjects);
    if (result.status === "fail") {
      const f = result.findings[0];
      const detail =
        name === "tdd_audit"
          ? `${f.planId}: ${f.reason}`
          : `${f.file}: ${name === "security" ? `matched ${f.pattern}` : f.marker}`;
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

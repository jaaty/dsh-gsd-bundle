// @dsh-gsd/bundle internal helpers — YAML-subset frontmatter, slugs, dates,
// ROADMAP/REQUIREMENTS parsing. Plain ESM, no dependencies. Used by every
// plugin in the bundle so the artefact schemas stay in one place.

export function slugify(input) {
  return String(input ?? "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "phase";
}

export function zeroPad(n, width = 2) {
  return String(Number(n) || 0).padStart(width, "0");
}

export function nowIso() {
  return new Date().toISOString();
}

export function today() {
  return new Date().toISOString().slice(0, 10);
}

// ── YAML-subset frontmatter ──────────────────────────────────────────────────
// Handles the subset opengsd artefacts use: flat `key: value`, flow arrays
// `["a", "b"]`, block arrays (`- item` lines), and one level of nesting
// (the STATE.md `progress:` block). Values are coerced to string|number|array.
// Quoted strings are unquoted. This is NOT a general YAML parser.

function coerceScalar(raw) {
  const s = String(raw).trim();
  if (s === "" ) return "";
  if (/^-?\d+$/.test(s)) return Number(s);
  if (/^-?\d+\.\d+$/.test(s)) return Number(s);
  if (s === "true") return true;
  if (s === "false") return false;
  if (s === "null" || s === "~") return null;
  let m = s.match(/^"(.*)"$/s) || s.match(/^'(.*)'$/s);
  if (m) return m[1];
  return s;
}

function coerceFlowArray(raw) {
  const inner = String(raw).replace(/^\[/, "").replace(/\]$/, "").trim();
  if (inner === "") return [];
  return inner.split(",").map((p) => coerceScalar(p.trim())).filter((x) => x !== "");
}

export function parseFrontmatter(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  let fmText = null;
  let body = null;
  if (m) {
    fmText = m[1];
    body = m[2];
  } else {
    // Fenceless tolerance: a subagent may write "key: value" frontmatter at the
    // top of PLAN.md / SUMMARY.md / VERIFICATION.md without the --- delimiters.
    // Parse the leading contiguous key/value block so listPlans and the
    // plan-checker still see requirements/wave/type/gap_closure.
    const lines = text.split(/\r?\n/);
    const block = [];
    let i = 0;
    for (; i < lines.length; i++) {
      const line = lines[i];
      if (line.trim() === "" && block.length) break;
      if (/^\s*#/.test(line)) continue;
      if (/^[\w-]+:\s*/.test(line) || (block.length && /^\s+(- |[\w-]+:)/.test(line))) block.push(line);
      else break;
    }
    if (block.length) {
      fmText = block.join("\n");
      body = lines.slice(i).join("\n");
    }
  }
  if (fmText === null) return { frontmatter: {}, body: text };
  const fm = parseFmLines(fmText.split(/\r?\n/));
  return { frontmatter: fm, body: body ?? "" };
}

// Sentinel for "value not yet decided object vs array".
const OPEN = Symbol("fm-open");

// Parse one frontmatter block (fenced or fenceless) with one level of nesting:
// flat scalars/flow-arrays, `key:` empty headers with nested `key: value`
// pairs and `- item` block lists under them.
function parseFmLines(lines) {
  const fm = {};
  let curKey = null;     // top-level open key awaiting children
  let curNested = null;  // nested open key under curKey awaiting a block list
  for (const line of lines) {
    if (/^\s*#/.test(line) || line.trim() === "") continue;
    // block list item: `  - x` or `    - x` — append to the nearest open list
    const item = line.match(/^(\s*)- (.*)$/);
    if (item) {
      const listHost = curNested !== null ? fm[curKey][curNested] : curKey !== null ? fm[curKey] : null;
      if (Array.isArray(listHost)) listHost.push(coerceScalar(item[2].trim()));
      else if (listHost === OPEN) {
        const arr = [coerceScalar(item[2].trim())];
        if (curNested !== null) fm[curKey][curNested] = arr;
        else fm[curKey] = arr;
      }
      continue;
    }
    const nested = line.match(/^(\s{2,})(\S[\w-]*):\s*(.*)$/);
    if (nested && curKey !== null) {
      const nk = nested[2];
      const nv = nested[3].trim();
      // materialize an open top-level value into an object before nesting under it
      if (!fm[curKey] || fm[curKey] === OPEN || typeof fm[curKey] !== "object" || Array.isArray(fm[curKey])) fm[curKey] = {};
      if (nv === "") {
        curNested = nk;
        fm[curKey][nk] = OPEN;
      } else {
        fm[curKey][nk] = nv.startsWith("[") ? coerceFlowArray(nv) : coerceScalar(nv);
        curNested = null;
      }
      continue;
    }
    const kv = line.match(/^([\w-]+):\s*(.*)$/);
    if (kv) {
      const k = kv[1];
      const v = kv[2].trim();
      if (v === "") {
        curKey = k;
        curNested = null;
        fm[k] = OPEN;
      } else if (v.startsWith("[")) {
        fm[k] = coerceFlowArray(v);
        curKey = null;
        curNested = null;
      } else {
        fm[k] = coerceScalar(v);
        curKey = null;
        curNested = null;
      }
    }
  }
  // resolve any remaining OPEN sentinels to empty arrays (block lists with no items)
  for (const [k, v] of Object.entries(fm)) {
    if (v === OPEN) fm[k] = [];
    else if (v && typeof v === "object" && !Array.isArray(v)) {
      for (const [nk, nv] of Object.entries(v)) if (nv === OPEN) v[nk] = [];
    }
  }
  return fm;
}

export function stringifyFrontmatter(fm) {
  const lines = ["---"];
  for (const [k, v] of Object.entries(fm)) {
    if (v === null || v === undefined) {
      lines.push(`${k}: null`);
    } else if (Array.isArray(v)) {
      lines.push(`${k}: [${v.map((x) => (typeof x === "string" && /[\s:,]/.test(x) ? JSON.stringify(x) : String(x))).join(", ")}]`);
    } else if (typeof v === "object") {
      lines.push(`${k}:`);
      for (const [nk, nv] of Object.entries(v)) {
        if (Array.isArray(nv)) lines.push(`  ${nk}: [${nv.map((x) => String(x)).join(", ")}]`);
        else if (nv === null || nv === undefined) lines.push(`  ${nk}: null`);
        else lines.push(`  ${nk}: ${typeof nv === "string" && /[\s:]/.test(nv) ? JSON.stringify(nv) : String(nv)}`);
      }
    } else if (typeof v === "string") {
      lines.push(`${k}: ${/[\s:#]/.test(v) ? JSON.stringify(v) : v}`);
    } else {
      lines.push(`${k}: ${String(v)}`);
    }
  }
  lines.push("---");
  return lines.join("\n");
}

// ── ROADMAP.md ────────────────────────────────────────────────────────────────
// Faithful shape: a milestone header, a phase table (#, Phase, Goal,
// Requirements), and a ## Progress table (Status + date, checkbox [x] on done).

export function parseRoadmap(text) {
  const out = { milestone: null, milestoneName: null, version: null, phases: [] };
  const lines = text.split(/\r?\n/);
  let inTable = false;
  let phaseTableDone = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!out.milestoneName) {
      const h = line.match(/^#\s+Roadmap(?:\s*[—-]\s*(.+?))?(?:\s*\((v[\d.]+)\))?\s*$/i);
      if (h) { out.milestoneName = h[1] ? h[1].trim() : null; if (h[2]) out.version = h[2]; }
    }
    const ms = line.match(/^##\s+Milestone:\s*(.+?)\s*\(v([\d.]+)\)/i);
    if (ms) { out.milestoneName = ms[1].trim(); out.version = "v" + ms[2]; }
    if (/^\|\s*#\s*\|/.test(line) && !phaseTableDone) { inTable = true; continue; }
    if (inTable) {
      if (/^\|[-\s|]+\|?$/.test(line)) continue;
      if (!line.startsWith("|")) { inTable = false; phaseTableDone = true; continue; }
      const cells = line.split("|").map((c) => c.trim()).filter(Boolean);
      if (cells.length >= 3 && /^\d+$/.test(cells[0])) {
        out.phases.push({
          n: Number(cells[0]),
          slug: slugify(cells[1]),
          name: cells[1].replace(/^\[x\]\s*/, ""),
          goal: cells[2],
          requirements: cells[3] ? cells[3].split(/[\s,…·]+/).map((x) => x.trim()).filter(Boolean) : [],
          status: /^\[x\]/i.test(cells[1]) ? "Complete" : "pending",
        });
      }
    }
  }
  return out;
}

export function stringifyRoadmap(doc) {
  const header = `# Roadmap${doc.milestoneName ? ` — ${doc.milestoneName}` : ""}${doc.version ? ` (${doc.version})` : ""}`;
  const rows = doc.phases.map((p) =>
    `| ${zeroPad(p.n)} | ${p.status === "Complete" ? "[x] " : ""}${p.name} | ${p.goal} | ${p.requirements.join(" … ")} |`
  ).join("\n");
  const progress = doc.phases.map((p) =>
    `| ${zeroPad(p.n)} | ${p.name} | ${p.status === "Complete" ? "[x] Complete" : "pending"} | ${p.status === "Complete" ? today() : ""} |`
  ).join("\n");
  return [
    header,
    "",
    `${doc.phases.length} phase(s) | requirements mapped per phase`,
    "",
    "| # | Phase | Goal | Requirements |",
    "|---|-------|------|--------------|",
    rows,
    "",
    "## Progress",
    "",
    "| # | Phase | Status | Date |",
    "|---|-------|--------|------|",
    progress,
    "",
  ].join("\n");
}

// ── REQUIREMENTS.md ───────────────────────────────────────────────────────────
export function parseRequirements(text) {
  const reqs = [];
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^[-*]\s*\[([ x])\]\s*([A-Z]+-\d+)\s*[:：]\s*(.+)$/i);
    if (m) reqs.push({ id: m[2], text: m[3].trim(), complete: m[1] === "x" });
  }
  return reqs;
}

export function stringifyRequirements(reqs) {
  const groups = new Map();
  for (const r of reqs) {
    const prefix = r.id.split("-")[0];
    if (!groups.has(prefix)) groups.set(prefix, []);
    groups.get(prefix).push(r);
  }
  const out = ["# Requirements", ""];
  for (const [prefix, list] of groups) {
    out.push(`## ${prefix}`, "");
    for (const r of list) out.push(`- [${r.complete ? "x" : " "}] ${r.id}: ${r.text}`);
    out.push("");
  }
  return out.join("\n");
}

// ── WINDOWS.md ledger (multi-window history) ──────────────────────────────────
// Faithful opengsd shape: an append-only markdown ledger of closed windows. One
// entry per closed window, keyed by WIN-<seq>, with phase+step at open/close,
// started/completed timestamps, a one-line summary and an optional checkpoint
// link. Owned here (not by parseFrontmatter — that is a YAML-subset parser and
// cannot represent this ledger shape).

const WINDOW_KEYS = ["id", "phase", "step", "opened", "closed", "summary", "checkpoint"];

// Derive the next sequence number for a prefixed id ("WIN-", "JOB-"). Reads the
// numeric suffix of each id matching `^<prefix>-<digits>$` and returns max+1.
// Returns 1 when no id matches or the list is empty. Formatting (zero-padding)
// is left to the callers.
export function nextSeq(entries, prefix) {
  const nums = (entries || [])
    .map((e) => (typeof e?.id === "string" ? e.id.match(new RegExp(`^${prefix}-(\\d+)$`)) : null))
    .filter(Boolean)
    .map((m) => Number(m[1]));
  return nums.length ? Math.max(...nums) + 1 : 1;
}

// Parse WINDOWS.md into an array of window entries. Scans for section headers
// `## WIN-<digits>` and collects the following `- key: value` field lines.
// phase/step are coerced to Number when pure digits. STRUCTURALLY MALFORMED
// input throws a SyntaxError (the D-06 corrupt signal so readWindows can catch
// it and set corrupt:true). Absence of any `## WIN-` header is NOT corruption —
// a file with only "# WINDOWS" and no "##" headers yields [] without throwing.
export function parseWindows(text) {
  const entries = [];
  const lines = String(text ?? "").split(/\r?\n/);
  let cur = null; // current window entry being built, or null outside a section
  for (const raw of lines) {
    const line = raw.trimEnd();
    const header = line.match(/^##\s+(.*)$/);
    if (header) {
      const win = header[1].match(/^WIN-(\d+)\s*$/);
      if (!win) throw new SyntaxError("parseWindows: malformed WINDOWS.md"); // (a) unknown section
      cur = { id: `WIN-${Number(win[1])}`, _seq: Number(win[1]) };
      entries.push(cur);
      continue;
    }
    if (!cur) continue; // outside a window section (e.g. "# WINDOWS" or blank)
    const field = line.match(/^-\s*([\w-]+):\s*(.*)$/);
    if (field) {
      const key = field[1];
      if (!WINDOW_KEYS.includes(key)) throw new SyntaxError("parseWindows: malformed WINDOWS.md"); // (b) unknown field
      const rawVal = field[2].trim();
      cur[key] = (key === "phase" || key === "step") && /^\d+$/.test(rawVal) ? Number(rawVal) : rawVal;
      continue;
    }
    if (line.trim() === "") continue; // blank within a section
    throw new SyntaxError("parseWindows: malformed WINDOWS.md"); // (c) stray line
  }
  return entries.map(({ _seq, ...rest }) => rest);
}

// Serialize window entries to WINDOWS.md text: a "# WINDOWS" header, then one
// "## WIN-<seq>" section per entry with a stable-order field list. Round-trips
// through parseWindows.
export function stringifyWindows(entries) {
  const out = ["# WINDOWS", ""];
  (entries || []).forEach((entry, index) => {
    const id = entry.id || `WIN-${zeroPad(index + 1)}`;
    out.push(`## ${id}`);
    for (const key of WINDOW_KEYS) {
      if (entry[key] !== undefined) out.push(`- ${key}: ${entry[key]}`);
    }
    out.push("");
  });
  return out.join("\n");
}

// ── misc ──────────────────────────────────────────────────────────────────────
export function textToBlocks(text) {
  return [{ type: "text", text }];
}

export function blocksToText(blocks) {
  if (!Array.isArray(blocks)) return "";
  return blocks.map((b) => (b && b.type === "text" ? b.text : "")).join("\n").trim();
}

// ── decision helpers (pure — unit-tested) ─────────────────────────────────────
// A plan is a gap-closure fix plan when its frontmatter `gap_closure` is truthy.
// coerceScalar parses an unquoted `gap_closure: true` as a boolean, but a model
// may also write "true" or "True" — accept both.
export function matchesGapClosure(value) {
  return value === true || String(value).toLowerCase() === "true";
}

// Allowed characters for a git ref / gh base branch. Prevents a model- or
// user-supplied value from smuggling shell metacharacters into a CLI call.
export const SAFE_REF_RE = /^[A-Za-z0-9._/\-]+$/;

export function isValidRef(value) {
  return typeof value === "string" && SAFE_REF_RE.test(value);
}

// A phase is closed when its VERIFICATION.md frontmatter status is exactly
// "passed" (and replanning without --force is blocked).
export function isClosedPhase(verificationText) {
  const { frontmatter } = parseFrontmatter(String(verificationText ?? ""));
  return String(frontmatter.status ?? "").trim().toLowerCase() === "passed";
}

// ── plan dependency resolution (DUR-05) ───────────────────────────────────────
// Plan ids are built as `<project-code>-<NN>-<slug>-<PP>` when a project_code is
// set (e.g. "GSD-01-auth-01"), else `<NN>-<slug>-<PP>` (e.g. "01-auth-01"). The
// planner may emit a depends_on value with or without the project-code prefix.
// These helpers make dependency resolution tolerant of that prefix without ever
// needing config: the prefix is derivable from the string shape alone.

// Strip the leading project-code token from a plan id, returning it unchanged
// when there is no prefix. The phase-number segment is the zero-padded phase
// number followed by "-", so "GSD-01-auth-01" -> "01-auth-01" and a bare
// "01-auth-01" is returned as-is.
export function stripPlanPrefix(id) {
  const s = String(id ?? "");
  const parts = s.split("-");
  // A prefix is present only when dropping the first segment leaves a phase
  // segment that looks like the zero-padded phase number (two digits + "-").
  if (parts.length > 1 && /^\d{2}$/.test(parts[1])) return parts.slice(1).join("-");
  return s;
}

// Resolve a depends_on value to a plan, tolerating the project-code prefix:
// an exact match wins; otherwise compare both the dep and the candidate id with
// their prefixes stripped. Returns the first matching plan or undefined.
export function resolvePlanDep(plans, dep) {
  const norm = stripPlanPrefix(dep);
  for (const plan of plans || []) {
    if (plan?.id === dep) return plan;
    if (stripPlanPrefix(plan?.id) === norm) return plan;
  }
  return undefined;
}
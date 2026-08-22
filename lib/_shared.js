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
  if (!m) return { frontmatter: {}, body: text };
  const fm = {};
  let curKey = null;
  for (const line of m[1].split(/\r?\n/)) {
    if (/^\s*#/.test(line) || line.trim() === "") continue;
    const nested = line.match(/^(\s{2,})(\S[\w-]*):\s*(.*)$/);
    if (nested && curKey) {
      // one level of nesting under curKey
      if (!fm[curKey] || typeof fm[curKey] !== "object" || Array.isArray(fm[curKey])) {
        fm[curKey] = {};
      }
      const nk = nested[2];
      const nv = nested[3].trim();
      fm[curKey][nk] = nv.startsWith("[") ? coerceFlowArray(nv) : coerceScalar(nv);
      continue;
    }
    const kv = line.match(/^([\w-]+):\s*(.*)$/);
    if (kv) {
      const k = kv[1];
      const v = kv[2].trim();
      if (v === "") {
        // could be nested block or block array — leave as object/array placeholder
        curKey = k;
        fm[k] = {};
      } else if (v.startsWith("[")) {
        fm[k] = coerceFlowArray(v);
        curKey = null;
      } else {
        fm[k] = coerceScalar(v);
        curKey = null;
      }
    }
  }
  return { frontmatter: fm, body: m[2] };
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

// ── misc ──────────────────────────────────────────────────────────────────────
export function textToBlocks(text) {
  return [{ type: "text", text }];
}

export function blocksToText(blocks) {
  if (!Array.isArray(blocks)) return "";
  return blocks.map((b) => (b && b.type === "text" ? b.text : "")).join("\n").trim();
}
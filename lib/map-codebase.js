// @dsh-gsd/bundle/map-codebase — the codebase mapping tool (opengsd
// /gsd-map-codebase). Analyzes the existing codebase with parallel fresh-context
// gsd-codebase-mapper subagents, each exploring ONE focus area and writing
// documents DIRECTLY to .planning/codebase/ — the orchestrator only collects
// confirmations, never document contents, so the main session stays lean.
//
// Output: .planning/codebase/ with 7 structured documents:
//   STACK.md, INTEGRATIONS.md (tech) · ARCHITECTURE.md, STRUCTURE.md (arch) ·
//   CONVENTIONS.md, TESTING.md (quality) · CONCERNS.md (concerns)
//
// Modes (faithful to the skill's flags):
//   - full (default): 4 parallel mappers -> all 7 documents.
//   - fast: one mapper for a single focus (default tech+arch).
//   - paths: incremental-remap scope hint -> each mapper scopes exploration to
//     the listed repo-relative prefixes.
// Unlike the phase tools, map-codebase is a brownfield pre-init tool: it does
// NOT require an initialised .planning/ project (it creates .planning/codebase/
// directly). It commits the map with "docs: map existing codebase" when it can.
//
// Deliberately omitted: the --query intel mode (requires the intel capability
// ecosystem — drift detection, gsd-intel-updater — which this first-version
// bundle does not implement, parallel to the omitted capability gates in
// gsd-ship). fast mode's --focus covers the scan.md lightweight path.

import { execFileSync } from "node:child_process";
import { defineTool } from "@deepseek-ai/dsh-tools";
import { today, contextBudget } from "./_shared.js";
import { spawnSubagent, cwdOf, planningContext } from "./_runner.js";
import { CODEBASE_MAPPER_PROMPT, CODEBASE_QUERY_PROMPT } from "./_agents.js";
import { buildManifest, compareManifest, clampConfidence } from "./_intel.js";

const name = "gsd-map-codebase";
const inject = ["gsdState", "tools"];

// focus -> the documents a mapper of that focus must write.
const FOCUS_DOCS = {
  tech: ["STACK", "INTEGRATIONS"],
  arch: ["ARCHITECTURE", "STRUCTURE"],
  quality: ["CONVENTIONS", "TESTING"],
  concerns: ["CONCERNS"],
  "tech+arch": ["STACK", "INTEGRATIONS", "ARCHITECTURE", "STRUCTURE"],
};
const VALID_FAST_FOCUS = ["tech", "arch", "quality", "concerns", "tech+arch"];

// Structured output contract for the codebase-query subagent (CBQX-03/D-06,
// D-07). The subagent must return a single JSON object of this exact shape;
// spawnSubagent passes it through as outputSchema and the host returns
// result.structured (the restricted object-rooted schema subset — type/
// properties/required/additionalProperties/items/enum — is enforced there).
const QUERY_ANSWER_SCHEMA = {
  type: "object",
  properties: {
    answer: { type: "string" },
    sources: { type: "array", items: { type: "object", properties: { kind: { type: "string", enum: ["map", "codebase"] }, path: { type: "string" } }, required: ["kind", "path"], additionalProperties: false } },
    confidence: { type: "number" },
  },
  required: ["answer", "sources", "confidence"],
  additionalProperties: false,
};

// Reject path scope values that could escape the repo or smuggle shell
// metacharacters (mirrors gsd-core's map-codebase --paths validation).
const PATH_FORBIDDEN = /(\.\.|^\/|[;`$&|<>])/;
function validatePaths(paths) {
  if (!Array.isArray(paths) || !paths.length) return [];
  const ok = [];
  for (const p of paths) {
    const s = String(p ?? "").trim();
    if (s && !PATH_FORBIDDEN.test(s)) ok.push(s);
  }
  return ok;
}

// Best-effort git commit, like ship.js's gitOk. Swallows failures (not a repo,
// nothing staged, no git binary) — the documents are already on disk.
function gitAddCommit(cwd, dir) {
  try {
    execFileSync("git", ["-C", cwd, "add", "--", `${dir}/`], { encoding: "utf8", stdio: "ignore" });
  } catch { return false; }
  try {
    execFileSync("git", ["-C", cwd, "commit", "-m", "docs: map existing codebase", "--", `${dir}/`], { encoding: "utf8", stdio: "ignore" });
    return true;
  } catch { return false; }
}

// Recursively walk the in-scope repo tree via ctx.fs, pruning the D-03 ignore
// set (.planning/, .git/, node_modules/) at descent so we never descend into
// those subtrees. Returns a flat array of walked nodes shaped
//   { path: <repo-relative>, type: "file", size: <bytes>, content: <string> }.
// Used to build the drift snapshot manifest (D-01): the content is read for
// the hash; ignored subtrees/lockfiles are handled by buildManifest. `s` is the
// gsdState service (provided for signature symmetry with the store accessors).
async function walkRepo(ctx, s, cwd) {
  const root = await ctx.fs.resolve(cwd);
  const out = [];
  async function visit(target, rel) {
    const stat = await ctx.fs.stat(target);
    if (!stat) return;
    if (stat.type === "file") {
      const content = await ctx.fs.readText(target);
      out.push({ path: rel, type: "file", size: stat.size ?? 0, content });
      return;
    }
    const entries = await ctx.fs.listDir(target);
    for (const e of entries) {
      const isDir = e.type === "dir" || e.type === "directory";
      if (isDir && (e.name === "node_modules" || e.name === ".git" || e.name === ".planning")) {
        continue; // D-03: never descend into ignored subtrees
      }
      await visit(e.target, rel ? `${rel}/${e.name}` : e.name);
    }
  }
  await visit(root, "");
  return out;
}

function apply(ctx) {
  const gsd = () => ctx.get("gsdState");

  ctx.tools.register(defineTool({
    name: "gsd_map_codebase",
    description: "Map the existing codebase (opengsd /gsd-map-codebase): analyze the codebase with parallel fresh-context mapper subagents that each explore one focus area and write structured documents directly to .planning/codebase/ (STACK.md, INTEGRATIONS.md, ARCHITECTURE.md, STRUCTURE.md, CONVENTIONS.md, TESTING.md, CONCERNS.md). Use before initializing a brownfield project, after significant changes, or before major refactoring. Does NOT require a GSD project to exist. fast=true spawns a single mapper for one focus (default tech+arch); paths=[...] scopes exploration to repo-relative prefixes for an incremental remap; force=true refreshes an existing map.",
    parameters: {
      fast: { type: "boolean", description: "Lightweight scan mode: one mapper for a single focus instead of four. Defaults to focus tech+arch." },
      focus: { type: "string", enum: VALID_FAST_FOCUS, description: "Focus area for fast mode: tech, arch, quality, concerns, or tech+arch (default). Ignored unless fast=true." },
      paths: { type: "array", items: { type: "string" }, description: "Repo-relative path prefixes to scope exploration (incremental-remap). When omitted, the whole repo is scanned." },
      queryScope: { type: "array", items: { type: "string" }, description: "Repo-relative path prefixes to restrict the query subagent's targeted exploration to, in query mode. Same validation as paths. When omitted, the query subagent may explore anywhere." },
      force: { type: "boolean", description: "Refresh an existing .planning/codebase/ map instead of returning the 'already mapped' notice." },
      query: { type: "string", description: "Answer a question against the existing .planning/codebase/ map plus targeted codebase exploration, without a full re-scan. When present, runs query mode instead of mapping; fast/focus/paths/force are ignored." },
    },
    // Structured output contract (CBQX-03/D-06): the tool returns an OBJECT on
    // every path — { kind: "mapping"|"notice"|"answer"|"error", text, ...extras } —
    // so the declared schema is truthful regardless of mode. render converts any
    // kind to readable display text (the driving model sees the declared schema
    // plus this text).
    output: {
      schema: {
        type: "object",
        properties: {
          kind: { type: "string" },
          text: { type: "string" },
          answer: { type: "string" },
          sources: { type: "array", items: { type: "object", properties: { kind: { type: "string" }, path: { type: "string" } }, additionalProperties: false } },
          confidence: { type: "number" },
          drift: { type: "object", additionalProperties: true },
          docs: { type: "array", items: { type: "string" } },
        },
        additionalProperties: false,
      },
      render: (_a, v) => [{ type: "text", text: (v && typeof v === "object" && typeof v.text === "string") ? v.text : JSON.stringify(v) }],
    },
    async execute(args, exec) {
      const cwd = cwdOf(exec);
      const s = gsd();
      if (!s) throw new Error("gsd_map_codebase: gsdState service unavailable");
      const subagents = ctx.get("subagents");
      if (!subagents) throw new Error("gsd_map_codebase: `subagents` service unavailable — the bundle needs the host spawn provider");

      // Query mode (opengsd /gsd-map-codebase --query): a non-empty trimmed
      // `query` switches the tool from mapping to answering a question against
      // the existing .planning/codebase/ map plus targeted codebase exploration.
      // It returns before any mapping logic, so fast/focus/paths/force are
      // ignored in query mode (D-03). An empty/whitespace query falls through to
      // normal mapping (OQ-2).
      const q = typeof args.query === "string" ? args.query.trim() : "";
      if (q) {
        const docs = await s.listCodebaseDocs(cwd);
        if (!docs.length) {
          return { kind: "error", text: "No .planning/codebase/ map exists yet. Run gsd_map_codebase first to map the codebase (or pass force=true to map), then re-run this query." };
        }
        const entries = [];
        for (const name of docs) {
          const txt = await s.readCodebaseDoc(cwd, name);
          if (txt !== undefined && txt !== null && String(txt).trim()) {
            entries.push({ label: name.replace(/\.md$/i, ""), content: txt });
          }
        }
        const maxBudget = contextBudget((await s.readConfig(cwd))?.context_window);
        const pc = planningContext(entries, 60000, maxBudget);
        // queryScope (CBQX-04/D-08): restricts ONLY the query subagent's targeted
        // exploration to the given repo-relative prefixes (same validation as
        // paths). The map documents above are still loaded in full as the
        // primary source — the scope line only limits targeted exploration.
        const qScope = validatePaths(args.queryScope);
        const scopeLine = qScope.length
          ? `Scope: restrict ONLY your targeted Glob/Grep exploration to these repo-relative prefixes: ${qScope.join(", ")} — the map documents above remain your primary source.`
          : "";
        const prompt = ["Question: " + q, pc.text, scopeLine, CODEBASE_QUERY_PROMPT].filter(Boolean).join("\n\n");
        const r = await spawnSubagent(ctx, exec, { label: "codebase-query", promptText: prompt, outputSchema: QUERY_ANSWER_SCHEMA });
        // Empty/failed subagent output always yields kind:"error" FIRST, before
        // the structured-building logic (R-4): a silent/failed run is a hard
        // error, never a degraded answer object.
        if (!r.output || !String(r.output).trim()) {
          return { kind: "error", text: `gsd_map_codebase query failed: the query subagent returned no answer (stopReason=${r.stopReason}${r.diagnostic ? `; ${r.diagnostic}` : ""}).` };
        }
        // CBQX-03/D-06: assemble the structured answer object. When the subagent
        // returns structured output use it; otherwise (structured missing but
        // non-empty text, R-4) fall back to a valid {answer, sources:[], 0}
        // object so the tool never throws and never yields NaN/undefined.
        const structured = r.structured && typeof r.structured === "object" && typeof r.structured.answer === "string" ? r.structured : null;
        const answer = structured ? String(structured.answer) : String(r.output);
        const sources = structured && Array.isArray(structured.sources)
          ? structured.sources
            .filter((s) => s && typeof s.path === "string" && (s.kind === "map" || s.kind === "codebase"))
            .map((s) => ({ kind: s.kind, path: String(s.path) }))
          : [];
        const confidence = clampConfidence(structured ? structured.confidence : undefined);
        const text = [answer, "", "Sources:", ...sources.map((s) => `- ${s.kind}: \`${s.path}\``)].join("\n")
          + (pc.truncated.length
            ? `\n\nplanning-context: truncated ${pc.truncated.length} ${pc.truncated.length === 1 ? "entry" : "entries"} (${pc.truncated.map((t) => t.label).join(", ")}) — capping total context to ${maxBudget} chars`
            : "");
        return { kind: "answer", text, answer, sources, confidence };
      }

      // focus set
      const fast = !!args.fast;
      let focuses;
      if (fast) {
        const f = args.focus || "tech+arch";
        if (!VALID_FAST_FOCUS.includes(f)) return { kind: "error", text: `gsd_map_codebase: unknown fast focus "${f}". Valid: ${VALID_FAST_FOCUS.join(", ")}.` };
        focuses = [f];
      } else {
        focuses = ["tech", "arch", "quality", "concerns"];
      }

      // expected documents across all spawned mappers (deduped, ordered)
      const expected = [];
      const seen = new Set();
      for (const f of focuses) for (const d of FOCUS_DOCS[f]) if (!seen.has(d)) { seen.add(d); expected.push(d); }

      // paths scope (validated; empty => whole repo)
      const scoped = validatePaths(args.paths);
      const scopeHint = scoped.length ? `--paths ${scoped.join(",")}` : "";

      const date = today();
      const codebaseDir = s.codebaseDir(cwd);

      // existing-check: the skill offers refresh/update/skip interactively; a
      // tool cannot hold that interview, so without force (and without an
      // explicit --paths incremental remap) we return a notice instead.
      // Reads through the gsdState fs (ctx.fs) so it sees the same store the
      // mappers write to and the test fake exercises.
      const existing = await s.listCodebaseDocs(cwd);
      if (existing.length && !args.force && !scoped.length) {
        let notice = [
          `.planning/codebase/ already exists with ${existing.length} document(s):`,
          ...existing.map((n) => `  - ${n}`),
          "",
          "Re-run with force=true to refresh (remap), or paths=[...] to incrementally remap specific subtrees. Otherwise use the existing map as-is.",
        ].join("\n");

        // Drift detection (CBQX-01/D-02): when a prior snapshot manifest exists,
        // compare the live tree against it and report changed/added/removed
        // counts + representative paths inline. Skipped when no manifest, and
        // never when re-mapping (force/paths) — those skip this branch entirely.
        const manifest = await s.readCodebaseManifest(cwd);
        if (Array.isArray(manifest) && manifest.length) {
          const current = buildManifest(await walkRepo(ctx, s, cwd));
          const drift = compareManifest(manifest, current);
          const total = drift.added.length + drift.removed.length + drift.modified.length;
          if (total > 0) {
            const buckets = [
              ["changed", drift.modified],
              ["added", drift.added],
              ["removed", drift.removed],
            ];
            const lines = [`## Drift detected`, ""];
            for (const [label, paths] of buckets) {
              if (!paths.length) continue;
              lines.push(`- ${label} (${paths.length}):`);
              for (const p of paths.slice(0, 5)) lines.push(`  - \`${p}\``);
            }
            lines.push("", `Run gsd_map_codebase with force=true (or paths=[...]) to refresh the map for the changed subtree${drift.added.length ? "s" : ""}.`);
            notice = `${notice}\n\n${lines.join("\n")}`;
          }
        }
        return { kind: "notice", text: notice };
      }

      // The output directory is created implicitly when the mapper subagents
      // write their documents (the host fs auto-creates parent dirs), so no
      // explicit mkdir is needed — the mapper's first write makes the dir.

      // spawn one mapper per focus, in parallel. Each writes its docs directly.
      const log = [`Spawning ${focuses.length} codebase mapper agent(s) (each runs in a subagent — no output until they return, ~1–5 min; expected, not a freeze)`];
      const results = await Promise.all(focuses.map(async (focus) => {
        const docs = FOCUS_DOCS[focus];
        const focusLine = focus === "tech+arch"
          ? "tech+arch (technology stack + architecture)"
          : focus;
        const docList = docs.map((d) => `- ${d}.md`).join("\n");
        const prompt = [
          `Focus: ${focusLine}`,
          `Today's date: ${date}`,
          `Write documents to: ${codebaseDir}/`,
          `Documents to write:`,
          docList,
          scopeHint ? `Scope: ${scopeHint} — restrict your Glob/Grep/Bash exploration to those repo-relative prefixes only.` : "Scope: full repo.",
          `IMPORTANT: Set all date stamps (\`**Analysis Date:**\`, footer \`*... analysis: ...*\`, \`<!-- refreshed: ... -->\`) to ${date}, overwriting any existing date. NEVER guess the date.`,
          "Explore thoroughly. Write documents directly using the templates. Return confirmation only.",
          "",
          CODEBASE_MAPPER_PROMPT,
        ].join("\n\n");
        const r = await spawnSubagent(ctx, exec, { label: `map-codebase ${focus}`, promptText: prompt });
        return { focus, docs, out: r.output, stopReason: r.stopReason, diagnostic: r.diagnostic };
      }));

      for (const r of results) {
        const tail = (r.out || "").slice(0, 200).replace(/\n/g, " ");
        log.push(`${r.focus}: ${tail || `(no confirmation; stopReason=${r.stopReason})`}${r.diagnostic ? ` — ${r.diagnostic}` : ""}`);
      }

      // verify all expected documents exist with >0 lines (read via gsdState's
      // fs, the same store the mapper subagents wrote to)
      const counts = {};
      const missing = [];
      const empty = [];
      for (const d of expected) {
        const txt = await s.readCodebaseDoc(cwd, `${d}.md`);
        if (txt === undefined || txt === null) {
          missing.push(`${d}.md`);
          counts[d] = 0;
        } else {
          const lines = String(txt).split(/\r?\n/).length;
          counts[d] = lines;
          if (lines < 20) empty.push(`${d}.md (${lines} lines)`);
        }
      }

      // persist the drift snapshot manifest (CBQX-01/D-01): on EVERY mapping
      // path (full / fast / paths / force) snapshot the in-scope repo tree so a
      // later run can detect drift. Writes via the gsdState accessor -> ctx.fs
      // (DUR-06); the manifest travels with and is committed with the map.
      const manifest = buildManifest(await walkRepo(ctx, s, cwd));
      await s.writeCodebaseManifest(cwd, manifest);

      // commit the codebase map (best-effort)
      const committed = gitAddCommit(cwd, ".planning/codebase");

      // record a decision line if a project exists (mirrors gsd_quick)
      const projectExists = await s.isProject(cwd).catch(() => false);
      if (projectExists) {
        try { await s.addDecision(cwd, `codebase map ${fast ? `fast (${focuses.join(",")})` : "full"} — ${date}`); } catch { /* best-effort */ }
      }

      const summary = [
        "Codebase mapping complete.",
        "",
        `Created/refreshed .planning/codebase/:`,
        ...expected.map((d) => `- ${d}.md (${counts[d] || 0} lines)`),
        "",
        missing.length ? `WARNING: missing documents (mapper may have failed): ${missing.join(", ")}` : "",
        empty.length ? `WARNING: thin documents (<20 lines): ${empty.join(", ")}` : "",
        committed ? "Committed: docs: map existing codebase." : "Note: codebase map written but not committed (no git repo, nothing staged, or git unavailable).",
        "",
        "## Next Up",
        projectExists
          ? "Use the codebase context for planning — e.g. gsd_discuss / gsd_plan on the active phase, or re-run gsd_map_codebase to refresh."
          : "Initialize a GSD project to use this codebase context for planning — run gsd_init (or /gsd-init).",
      ].filter(Boolean).join("\n");
      return { kind: "mapping", text: [...log, "", summary].join("\n") };
    },
    presentCall: (a) => ({ card: "generic", title: "Map codebase", kind: "other", rawInput: { fast: !!a.fast, focus: a.focus, paths: (a.paths || []).length } }),
  }));
}

export { name, inject, apply };
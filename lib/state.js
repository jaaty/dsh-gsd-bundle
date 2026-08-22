// @dsh-gsd/bundle/state — the GSD .planning/ artefact + STATE.md/ROADMAP.md/
// REQUIREMENTS.md service. Publishes the host service `gsdState`, consumed by
// every phase tool and by the persona's runtime-context provider.
//
// Faithful to opengsd-core's .planning/ layout and naming:
//   .planning/PROJECT.md ROADMAP.md REQUIREMENTS.md STATE.md config.json
//   .planning/phases/<NN>-<slug>/<NN>-CONTEXT.md
//                       <NN>-RESEARCH.md
//                       <NN>-<PP>-PLAN.md
//                       <NN>-<PP>-SUMMARY.md
//                       <NN>-VERIFICATION.md
//                       <NN>-UAT.md
//                       <NN>-UI-SPEC.md
// <NN> = zero-padded phase number; <PP> = zero-padded plan number within phase.
// STATE.md is YAML frontmatter (machine) + Markdown body (human), under 100 lines.

import {
  slugify, zeroPad, nowIso, today,
  parseFrontmatter, stringifyFrontmatter,
  parseRoadmap, stringifyRoadmap,
  parseRequirements, stringifyRequirements,
} from "./_shared.js";

const STATE_VERSION = "1.0";
const STEPS = ["discuss", "ui", "plan", "execute", "verify", "ship", "done"];

// A plain service object provided under the `gsdState` name (not a Cordis
// Service subclass) — `ctx.provide('gsdState', instance)` registers it, and
// consumers reach it via `ctx.get('gsdState')`. Kept dependency-light: the only
// host service it needs is `fs`.
var GsdState = class {
  constructor(ctx, config = {}) {
    this.ctx = ctx;
    this.cfg = config;
    // cwd -> { state, roadmap, ts } in-memory cache for synchronous reads
    // (the persona context provider needs a sync snapshot).
    this._cache = new Map();
  }

  // ── path helpers ────────────────────────────────────────────────────────────
  _planning(cwd) { return `${cwd}/.planning`; }
  _phases(cwd) { return `${this._planning(cwd)}/phases`; }

  // Public accessor for the .planning/ root — the stable API for consumers that
  // need the path (e.g. gsd_quick records under .planning/quick/).
  planningRoot(cwd) { return this._planning(cwd); }

  async _read(absPath) {
    const target = await this.ctx.fs.resolve(absPath);
    const stat = await this.ctx.fs.stat(target);
    if (!stat) return undefined;
    return this.ctx.fs.readText(target);
  }

  async _write(absPath, content) {
    await this._ensureParent(absPath);
    const target = await this.ctx.fs.resolve(absPath);
    await this.ctx.fs.writeText(target, content);
  }

  async _ensureDir(absPath) {
    const { mkdir } = await import("node:fs/promises");
    try {
      await mkdir(absPath, { recursive: true });
    } catch { /* may already exist */ }
  }

  // Ensure the parent directory of a file exists before writing. The host fs
  // service may or may not auto-create parents; making it explicit removes the
  // unverified assumption.
  async _ensureParent(absPath) {
    const idx = absPath.lastIndexOf("/");
    if (idx > 0) await this._ensureDir(absPath.slice(0, idx));
  }

  // ── project ──────────────────────────────────────────────────────────────────
  async readProject(cwd) {
    return this._read(`${this._planning(cwd)}/PROJECT.md`);
  }

  async isProject(cwd) {
    const t = await this.ctx.fs.resolve(`${this._planning(cwd)}/STATE.md`);
    return !!(await this.ctx.fs.stat(t));
  }

  async initProject(cwd, opts) {
    const root = this._planning(cwd);
    const project = opts.project || { name: opts.name || "Untitled", purpose: opts.purpose || "" };
    const requirements = opts.requirements || [];
    // Assign 1-based phase numbers and a default status so callers may omit them.
    const phases = (opts.phases || []).map((p, i) => ({
      n: p.n ?? (i + 1), name: p.name, goal: p.goal,
      requirements: p.requirements || [], status: p.status || "pending",
    }));

    const projectMd = [
      `# ${project.name}`,
      "",
      project.purpose || "Project initialised with dsh-gsd-bundle.",
      "",
      project.business ? `## Business Context\n\n${project.business}\n` : "",
    ].join("\n");

    const roadmap = { milestoneName: opts.milestoneName || project.name, version: opts.version || "v1.0", phases };
    const state = this._freshState();
    // seed milestone + progress into STATE so readState round-trips them
    state.frontmatter.milestone = opts.version || "v1.0";
    state.frontmatter.milestone_name = opts.milestoneName || project.name;
    state.frontmatter.progress.total_phases = phases.length;
    state.frontmatter.progress.total_plans = 0;

    await this._write(`${root}/PROJECT.md`, projectMd);
    await this._write(`${root}/REQUIREMENTS.md`, stringifyRequirements(requirements));
    await this._write(`${root}/ROADMAP.md`, stringifyRoadmap(roadmap));
    await this._write(`${root}/STATE.md`, this._stringifyState(state));
    await this._write(`${root}/config.json`, JSON.stringify(this._defaultConfig(opts), null, 2) + "\n");
    this._cache.set(cwd, { state, roadmap, ts: Date.now() });
    return state;
  }

  _defaultConfig(opts) {
    return {
      gsd_state_version: STATE_VERSION,
      workflow: {
        discuss_mode: opts.discussMode || "discuss",
        nyquist_validation: true,
        pattern_mapper: true,
        tdd_mode: !!opts.tdd,
        mvp_mode: !!opts.mvp,
        use_worktrees: true,
        agent_hint_routing: true,
        text_mode: false,
        commit_docs: true,
      },
      context_window: 200000,
      project_code: opts.projectCode || null,
      response_language: null,
    };
  }

  _freshState() {
    return {
      frontmatter: {
        gsd_state_version: STATE_VERSION,
        milestone: null,
        milestone_name: null,
        status: "idle",
        active_phase: null,
        next_action: null,
        next_phases: [],
        progress: { total_phases: 0, completed_phases: 0, total_plans: 0, completed_plans: 0, percent: 0 },
        current_phase: null,
        current_phase_name: null,
        current_plan: null,
        last_updated: nowIso(),
        state_head: null,
        last_activity: today(),
        stopped_at: null,
        paused_at: null,
      },
      body: {
        position: "_No milestone active. Run gsd_init or gsd_new_milestone to begin._",
        decisions: [],
        blockers: [],
        continuity: { lastSession: null, stoppedAt: null, resumeFile: null },
      },
    };
  }

  // ── STATE.md ──────────────────────────────────────────────────────────────────
  _stringifyState(doc) {
    const fm = stringifyFrontmatter(doc.frontmatter);
    const b = doc.body;
    const lines = [
      "# GSD STATE",
      "",
      "## Current Position",
      "",
      b.position || "_No active phase._",
      "",
      "## Accumulated Context",
      "",
      "### Recent Decisions",
      ...(b.decisions.length ? b.decisions.map((d) => `- ${d}`) : ["_none_"]),
      "",
      "### Blockers / Concerns",
      ...(b.blockers.length ? b.blockers.map((d) => `- ${d}`) : ["_none_"]),
      "",
      "## Session Continuity",
      "",
      `- Last session: ${b.continuity.lastSession || "n/a"}`,
      `- Stopped at: ${b.continuity.stoppedAt || "n/a"}`,
      `- Resume file: ${b.continuity.resumeFile || "None"}`,
      "",
    ];
    return `${fm}\n${lines.join("\n")}`;
  }

  async readState(cwd) {
    const text = await this._read(`${this._planning(cwd)}/STATE.md`);
    if (!text) return undefined;
    const { frontmatter, body } = parseFrontmatter(text);
    const doc = { frontmatter, body: this._parseStateBody(body) };
    this._cache.set(cwd, { state: doc, ts: Date.now() });
    return doc;
  }

  _parseStateBody(body) {
    const out = { position: "", decisions: [], blockers: [], continuity: { lastSession: null, stoppedAt: null, resumeFile: null } };
    let section = null;
    for (const line of body.split(/\r?\n/)) {
      if (/^## Current Position/.test(line)) { section = "pos"; continue; }
      if (/^### Recent Decisions/.test(line)) { section = "dec"; continue; }
      if (/^### Blockers/.test(line)) { section = "blk"; continue; }
      if (/^## Session Continuity/.test(line)) { section = "cont"; continue; }
      if (/^## |^### /.test(line)) { section = null; continue; }
      if (section === "pos" && line.trim() && !/^_/.test(line.trim())) out.position += (out.position ? "\n" : "") + line;
      else if (section === "dec" && line.startsWith("- ")) out.decisions.push(line.slice(2));
      else if (section === "blk" && line.startsWith("- ")) out.blockers.push(line.slice(2));
      else if (section === "cont") {
        const m = line.match(/^-\s*Last session:\s*(.+)$/i); if (m) out.continuity.lastSession = m[1].trim();
        const s = line.match(/^-\s*Stopped at:\s*(.+)$/i); if (s) out.continuity.stoppedAt = s[1].trim();
        const r = line.match(/^-\s*Resume file:\s*(.+)$/i); if (r) out.continuity.resumeFile = r[1].trim() === "None" ? null : r[1].trim();
      }
    }
    return out;
  }

  async writeState(cwd, doc) {
    doc.frontmatter.last_updated = nowIso();
    doc.frontmatter.last_activity = today();
    await this._write(`${this._planning(cwd)}/STATE.md`, this._stringifyState(doc));
    this._cache.set(cwd, { state: doc, ts: Date.now() });
    return doc;
  }

  async updateStateFrontmatter(cwd, patch) {
    const doc = (await this.readState(cwd)) || this._freshState();
    Object.assign(doc.frontmatter, patch);
    return this.writeState(cwd, doc);
  }

  async addDecision(cwd, line) {
    const doc = (await this.readState(cwd)) || this._freshState();
    doc.body.decisions.push(line);
    return this.writeState(cwd, doc);
  }

  async addBlocker(cwd, line) {
    const doc = (await this.readState(cwd)) || this._freshState();
    doc.body.blockers.push(line);
    return this.writeState(cwd, doc);
  }

  async resolveBlocker(cwd, idx) {
    const doc = await this.readState(cwd);
    if (doc && doc.body.blockers[idx]) doc.body.blockers.splice(idx, 1);
    if (doc) return this.writeState(cwd, doc);
  }

  async recordSession(cwd, stoppedAt) {
    const doc = (await this.readState(cwd)) || this._freshState();
    doc.body.continuity.lastSession = nowIso();
    doc.body.continuity.stoppedAt = stoppedAt || null;
    doc.frontmatter.stopped_at = stoppedAt || null;
    return this.writeState(cwd, doc);
  }

  async setActivePhase(cwd, phaseNum, step) {
    const roadmap = await this.readRoadmap(cwd);
    const phase = roadmap.phases.find((p) => p.n === phaseNum);
    const patch = {
      status: step || "discuss",
      active_phase: String(phaseNum),
      current_phase: String(phaseNum),
      current_phase_name: phase ? phase.name : null,
      next_action: this._nextActionFor(step),
      next_phases: [String(phaseNum)],
    };
    return this.updateStateFrontmatter(cwd, patch);
  }

  _nextActionFor(step) {
    return { discuss: "discuss-phase", ui: "ui-phase", plan: "plan-phase", execute: "execute-phase", verify: "verify-phase", ship: "ship-phase", done: null }[step] || "discuss-phase";
  }

  // ── ROADMAP / REQUIREMENTS / CONFIG ───────────────────────────────────────────
  async readRoadmap(cwd) {
    const text = await this._read(`${this._planning(cwd)}/ROADMAP.md`);
    if (!text) return undefined;
    return parseRoadmap(text);
  }

  async writeRoadmap(cwd, doc) {
    return this._write(`${this._planning(cwd)}/ROADMAP.md`, stringifyRoadmap(doc));
  }

  async readRequirements(cwd) {
    const text = await this._read(`${this._planning(cwd)}/REQUIREMENTS.md`);
    return text ? parseRequirements(text) : [];
  }

  async writeRequirements(cwd, reqs) {
    return this._write(`${this._planning(cwd)}/REQUIREMENTS.md`, stringifyRequirements(reqs));
  }

  async markRequirementComplete(cwd, reqId) {
    const reqs = await this.readRequirements(cwd);
    for (const r of reqs) if (r.id === reqId) r.complete = true;
    return this.writeRequirements(cwd, reqs);
  }

  async readConfig(cwd) {
    const text = await this._read(`${this._planning(cwd)}/config.json`);
    if (!text) return this._defaultConfig({});
    try { return JSON.parse(text); } catch { return this._defaultConfig({}); }
  }

  // ── per-phase artefacts ───────────────────────────────────────────────────────
  async _phaseDirName(cwd, phaseNum) {
    const roadmap = await this.readRoadmap(cwd);
    const phase = roadmap.phases.find((p) => p.n === phaseNum);
    const cfg = await this.readConfig(cwd);
    const prefix = cfg.project_code ? `${cfg.project_code}-` : "";
    const slug = phase ? slugify(phase.name) : `phase-${phaseNum}`;
    return `${prefix}${zeroPad(phaseNum)}-${slug}`;
  }

  async phaseDir(cwd, phaseNum) {
    const name = await this._phaseDirName(cwd, phaseNum);
    return `${this._phases(cwd)}/${name}`;
  }

  // ── per-phase artefacts ───────────────────────────────────────────────────────
  // Artefact file naming follows the opengsd schema:
  //   <base>-CONTEXT.md, <base>-RESEARCH.md, <base>-VERIFICATION.md, ...
  //   <base>-<PP>-PLAN.md, <base>-<PP>-SUMMARY.md   (PP = zero-padded plan number)
  // Plan/summary suffixes are passed as "PLAN-<PP>" / "SUMMARY-<PP>" and mapped
  // to the <base>-<PP>-PLAN.md / <base>-<PP>-SUMMARY.md layout so listPlans
  // (which globs `^<base>-(\d+)-PLAN\.md$`) and the executor's SUMMARY writes
  // agree with every read.
  _artifactFile(dir, base, suffix) {
    const m = String(suffix).match(/^(PLAN|SUMMARY)-(\d+)$/i);
    if (m) return `${dir}/${base}-${zeroPad(Number(m[2]))}-${m[1].toUpperCase()}.md`;
    return `${dir}/${base}-${suffix}.md`;
  }

  async writeArtifact(cwd, phaseNum, suffix, content) {
    const dir = await this.phaseDir(cwd, phaseNum);
    const base = (await this._phaseDirName(cwd, phaseNum)).split("/").pop();
    const file = this._artifactFile(dir, base, suffix);
    await this._write(file, content);
    return file;
  }

  async readArtifact(cwd, phaseNum, suffix) {
    const dir = await this.phaseDir(cwd, phaseNum);
    const base = (await this._phaseDirName(cwd, phaseNum)).split("/").pop();
    return this._read(this._artifactFile(dir, base, suffix));
  }

  async hasArtifact(cwd, phaseNum, suffix) {
    const dir = await this.phaseDir(cwd, phaseNum);
    const base = (await this._phaseDirName(cwd, phaseNum)).split("/").pop();
    const t = await this.ctx.fs.resolve(this._artifactFile(dir, base, suffix));
    return !!(await this.ctx.fs.stat(t));
  }

  // ── plans ─────────────────────────────────────────────────────────────────────
  async listPlans(cwd, phaseNum) {
    const dir = await this.phaseDir(cwd, phaseNum);
    const name = await this._phaseDirName(cwd, phaseNum);
    const base = name.split("/").pop();
    const t = await this.ctx.fs.resolve(dir);
    const stat = await this.ctx.fs.stat(t);
    if (!stat) return [];
    const entries = await this.ctx.fs.listDir(t);
    const plans = [];
    for (const e of entries) {
      const m = e.name.match(new RegExp(`^${base}-(\\d+)-PLAN\\.md$`));
      if (!m) continue;
      const planNum = Number(m[1]);
      const text = await this._read(`${dir}/${e.name}`);
      const { frontmatter, body } = parseFrontmatter(text);
      const hasSummary = await this.hasArtifact(cwd, phaseNum, `SUMMARY-${zeroPad(planNum)}`);
      plans.push({
        plan: String(planNum),
        id: `${base}-${zeroPad(planNum)}`,
        wave: frontmatter.wave || 1,
        autonomous: frontmatter.autonomous !== false,
        requirements: frontmatter.requirements || [],
        files_modified: frontmatter.files_modified || [],
        depends_on: frontmatter.depends_on || [],
        type: frontmatter.type || "execute",
        status: frontmatter.status || null,
        objective: this._extractBlock(body, "objective"),
        task_count: (body.match(/<task\b/g) || []).length,
        has_summary: hasSummary,
        gap_closure: frontmatter.gap_closure || null,
        gap_ids: frontmatter.gap_ids || [],
      });
    }
    plans.sort((a, b) => Number(a.plan) - Number(b.plan));
    return plans;
  }

  _extractBlock(body, tag) {
    const m = body.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
    return m ? m[1].trim() : "";
  }

  async planIndex(cwd, phaseNum) {
    const plans = (await this.listPlans(cwd, phaseNum)).filter((p) => p.status !== "superseded");
    const waves = new Map();
    for (const p of plans) {
      const w = p.wave || 1;
      if (!waves.has(w)) waves.set(w, []);
      waves.get(w).push(p);
    }
    const waveObj = {};
    for (const [w, list] of [...waves].sort((a, b) => a[0] - b[0])) waveObj[w] = list;
    const incomplete = plans.filter((p) => !p.has_summary);
    const runnable = incomplete.filter((p) => (p.depends_on || []).every((d) => {
      const dep = plans.find((x) => x.id === d);
      return !dep || dep.has_summary;
    }));
    const hasCheckpoints = plans.some((p) => !p.autonomous);
    return { plans, waves: waveObj, incomplete, runnable, has_checkpoints: hasCheckpoints };
  }

  async markPlanSummary(cwd, phaseNum, planNum, summaryContent) {
    await this.writeArtifact(cwd, phaseNum, `SUMMARY-${zeroPad(planNum)}`, summaryContent);
    const doc = await this.readState(cwd);
    if (doc) {
      doc.frontmatter.progress.total_plans = (await this.listPlans(cwd, phaseNum)).length;
      doc.frontmatter.progress.completed_plans = (doc.frontmatter.progress.completed_plans || 0) + 1;
      doc.frontmatter.current_plan = String(planNum);
      await this.writeState(cwd, doc);
    }
  }

  async completePhase(cwd, phaseNum) {
    const roadmap = await this.readRoadmap(cwd);
    const phase = roadmap.phases.find((p) => p.n === phaseNum);
    if (phase) phase.status = "Complete";
    await this.writeRoadmap(cwd, roadmap);
    const doc = await this.readState(cwd);
    if (doc) {
      doc.frontmatter.active_phase = null;
      doc.frontmatter.status = "idle";
      doc.frontmatter.next_action = null;
      doc.frontmatter.progress.completed_phases = (doc.frontmatter.progress.completed_phases || 0) + 1;
      const total = roadmap.phases.length;
      const done = roadmap.phases.filter((p) => p.status === "Complete").length;
      doc.frontmatter.progress.total_phases = total;
      doc.frontmatter.progress.completed_phases = done;
      doc.frontmatter.progress.percent = total ? Math.round((done / total) * 100) : 0;
      await this.writeState(cwd, doc);
    }
    // mark phase requirements complete (best-effort traceability)
    if (phase) for (const r of phase.requirements) await this.markRequirementComplete(cwd, r);
  }

  // ── sync cache for the persona context provider ──────────────────────────────
  cachedState(cwd) {
    const c = this._cache.get(cwd);
    if (!c) return { initialised: false };
    const fm = c.state.frontmatter;
    return {
      initialised: true,
      activeMilestone: fm.milestone_name || fm.milestone,
      activePhase: fm.active_phase,
      activeStep: fm.status,
      milestone: fm.milestone,
    };
  }
};

const name = "gsd-state";
const inject = ["fs"];

function apply(ctx, config) {
  const svc = new GsdState(ctx, config);
  ctx.provide("gsdState", svc);
  ctx.effect(() => () => svc._cache.clear(), "gsdState.cache.clear");
}

export { GsdState, name, inject, apply };
// Shared fake-ctx mount harness for the offline activation suites (D-07).
//
// Extracted from test/mount.test.mjs so the existing mount suite and the
// per-plugin removal suite (test/removal.test.mjs) share a single source of the
// fake-ctx machinery and never drift. Offline only: FakeFs + fake-ctx, no live
// DSH boot, no LLM/git/gh.
//
// The exported helper signatures are byte-identical to the original in-file
// definitions in test/mount.test.mjs, with ONE behavioural addition (OQ-1):
// makeMountCtx / mountSubset accept an optional subagents service object OR a
// factory `(fs) => service`, defaulting to the simple stub, so the removal
// suite can inject a rich subagents stub that writes artefacts to the FakeFs.

import assert from "node:assert/strict";

import { FakeFs } from "./fake-fs.mjs";

export const CWD = "/project";

// The 12 plugin rows in cordis.patch.yml insert order (D-03), verbatim from
// cordis.patch.yml:34-84. Each {id, sub} maps the patch row id to the
// @dsh-gsd/bundle/<sub> subpath export.
export const PATCH_ROWS = [
  { id: "gsd-persona", sub: "persona" },
  { id: "gsd-state", sub: "state" },
  { id: "gsd-core-tools", sub: "core-tools" },
  { id: "gsd-discuss", sub: "discuss" },
  { id: "gsd-plan", sub: "plan" },
  { id: "gsd-execute", sub: "execute" },
  { id: "gsd-verify", sub: "verify" },
  { id: "gsd-ship", sub: "ship" },
  { id: "gsd-ui", sub: "ui" },
  { id: "gsd-quick", sub: "quick" },
  { id: "gsd-map-codebase", sub: "map-codebase" },
  { id: "gsd-commands", sub: "commands" },
];

// Fake subagents service (mirrors test/tools.test.mjs:21-62) so any future
// smoke execute that spawns does not throw. apply() of the spawning plugins
// does not touch subagents, but providing it is future-proof (OQ-3).
export function makeSubagents() {
  return {
    getProvider: (n) => (n === "spawn" ? { spawn: true } : undefined),
    async start(_n, _req) {
      return { result: { output: [{ type: "text", text: "done" }], stopReason: "completed" }, dispose: () => {} };
    },
  };
}

// The exec object shape the tools receive (agent session header cwd + a
// non-aborted signal). Defaults cwd to CWD.
export function makeExec(cwd = CWD) {
  return {
    agent: { session: { header: { cwd } } },
    signal: { aborted: false, addEventListener() {}, removeEventListener() {} },
  };
}

// Module-level handle to the gsdState service published by gsd-state's apply(),
// so ctx.get("gsdState") resolves to the SAME instance the persona context
// provider reads (R-1: a separately-constructed GsdState renders "no project").
let gsdStateSvc;

// Build a single shared fake ctx that satisfies all 12 plugins' inject arrays
// and captures every registration surface. CRITICAL (R-3): ctx.effect MUST
// invoke its callback synchronously or gsd-commands captures zero commands.
// `subagents` may be a service object OR a factory `(fs) => service`; when
// omitted, the simple stub is used (OQ-1).
export function makeMountCtx(fs, { subagents } = {}) {
  // Each capture surface is an array that also carries its register method,
  // so ctx.tools / ctx.commands are both the array (for length assertions)
  // and the registration target the plugins call.
  const tools = [];
  tools.register = (t) => tools.push(t);
  const commands = [];
  commands.register = (c) => commands.push(c);
  const sections = [];
  const contexts = [];
  const provided = new Map();
  const effects = [];
  gsdStateSvc = undefined;

  // DEGR-07 (D-05): a single subagents service value, resolved once. When the
  // caller explicitly supplies a subagents value (a service object or a factory
  // `(fs) => service`), it is added to the provided store so ctx.inject's
  // `provided.has("subagents")` check reflects real presence: an explicitly
  // supplied service activates a ['subagents'] sub-fiber, and `subagents: null`
  // leaves it absent so the sub-fiber stays inactive. When `subagents` is
  // omitted (undefined), makeSubagents() is still returned by ctx.get but is
  // NOT added to provided, preserving the default behaviour exactly.
  const subagentsSvc =
    subagents === null
      ? undefined
      : typeof subagents === "function"
        ? subagents(fs)
        : subagents || makeSubagents();
  if (subagents !== undefined && subagents !== null) {
    provided.set("subagents", subagentsSvc);
  }

  const ctx = {
    fs,
    tools,
    commands,
    sections,
    contexts,
    provided,
    systemPrompt: {
      section: (s) => sections.push(s),
      context: (c) => contexts.push(c),
    },
    provide: (n, svc) => {
      provided.set(n, svc);
      if (n === "gsdState") gsdStateSvc = svc;
    },
    // Phase-22 subset-mount (D-11): ctx.get returns the provided capability
    // descriptor for any capability key (via the provided store), so the persona
    // / gsd_status / _render helper read the *subset* of capabilities actually
    // applied. Absent keys resolve to undefined (never throw).
    get: (n) => {
      if (n === "gsdState") return gsdStateSvc;
      if (n === "subagents") return subagentsSvc;
      return provided.has(n) ? provided.get(n) : undefined;
    },
  };
  // Record registered effects (label + disposer) so tests can assert the
  // unload-cancel cleanup wiring and invoke its disposer (DEGR-06).
  ctx.effects = effects;
  // Invoke the effect callback synchronously (R-3); return its disposer if any.
  // gsd-commands wraps registration in ctx.effect(fn) — a no-op effect would
  // capture zero commands, so fn() MUST run here.
  ctx.effect = (fn, label) => {
    const d = fn();
    const disposer = typeof d === "function" ? d : () => {};
    effects.push({ label, disposer });
    return disposer;
  };
  // Per-command sub-fiber API (Plan 03 / RESEARCH 1.6): ctx.inject(injectKeys,
  // callback) mirrors ctx.effect's synchronous behaviour. The host "commands"
  // service is always satisfied (the fake ctx provides ctx.commands); any other
  // key resolves only if it exists in the provided store. When every inject key
  // resolves the sub-fiber's apply runs synchronously; when any key is missing
  // the sub-fiber stays inactive and the callback never runs — so that command
  // is never registered (D-12 / DEGR-03 negative contract).
  ctx.inject = (injectKeys, callback) => {
    const missing = (injectKeys || []).some(
      (k) => k !== "commands" && !provided.has(k),
    );
    if (missing) return () => {};
    const d = callback(ctx);
    return typeof d === "function" ? d : () => {};
  };
  return ctx;
}

// Apply only a chosen SUBSET of the PATCH_ROWS plugins against a ctx, in the
// given order (D-11). Locates each row by id/sub, imports its subpath module,
// asserts apply() exists, and calls it with config (default {}). Throws with the
// offending id on any apply() error, mirroring applyAll's error wrapping.
export async function applySubset(ctx, subs, config = {}) {
  for (const sub of subs) {
    const row = PATCH_ROWS.find((r) => r.sub === sub);
    assert.ok(row, `applySubset: no patch row for sub "${sub}"`);
    const mod = await import(`@dsh-gsd/bundle/${sub}`);
    assert.equal(typeof mod.apply, "function", `${row.id}: module has no apply()`);
    try {
      mod.apply(ctx, config);
    } catch (e) {
      e.message = `${row.id} apply() threw: ${e.message}`;
      throw e;
    }
  }
}

// Build a fresh FakeFs + ctx with ONLY the given plugin subs applied. Accepts
// an optional subagents service/factory forwarded to makeMountCtx (OQ-1).
export async function mountSubset(subs, { subagents } = {}) {
  const fs = new FakeFs();
  const ctx = makeMountCtx(fs, { subagents });
  await applySubset(ctx, subs);
  return { fs, ctx };
}

// Invoke the persona section body with a per-assembly context for cwd.
export const personaBody = (ctx, cwd = CWD) => {
  const section = ctx.sections.find((s) => s.name === "gsd:persona");
  assert.ok(section, "gsd:persona section not registered");
  return section.text({ agent: { session: { header: { cwd } } } });
};
// Invoke the runtime-context snapshot provider with a per-assembly context.
export const snapshot = (ctx, cwd = CWD) => {
  const context = ctx.contexts.find((c) => c.name === "gsd:state");
  assert.ok(context, "gsd:state context not registered");
  return context.text({ agent: { session: { header: { cwd } } } });
};

// Bootstrap a .planning/ project (so the snapshot/gsd_status read a real
// STATE.md) by calling the mounted gsd_init tool.
export async function initProject(ctx, exec = makeExec()) {
  const gsdInit = ctx.tools.find((t) => t.name === "gsd_init");
  assert.ok(gsdInit, "gsd_init not registered");
  await gsdInit.execute(
    { name: "demo", milestoneName: "M1", version: "v1.0",
      requirements: [{ id: "M1", text: "x" }],
      phases: [{ name: "p1", goal: "do it", requirements: ["M1"] }] },
    exec,
  );
}

// The set of tool names owned by capabilities actually provided in this mount.
export const presentTools = (ctx) =>
  new Set(
    [...ctx.provided.values()]
      .filter((d) => d && Array.isArray(d.tools))
      .flatMap((d) => d.tools),
  );

// D-02 invariant: no `gsd_*` token appears unless its owning capability was
// provided in this mount. Any absent-step tool mention is a violation.
export const assertNoAbsentToolToken = (ctx, text, label) => {
  const present = presentTools(ctx);
  const tokens = text.match(/gsd_[a-z]+/g) || [];
  for (const tok of tokens) {
    assert.ok(
      present.has(tok),
      `${label}: output names "${tok}" whose capability is absent in this mount`,
    );
  }
};

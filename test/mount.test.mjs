// Offline activation harness for @dsh-gsd/bundle (Phase 1: live-mount).
//
// Proves the 12 cordis.patch.yml plugin rows activate inside a fake DSH host:
// each subpath export resolves, apply() runs against one shared fake ctx, and
// the full registration surface is captured (1 persona section, 1 runtime-
// context provider, gsdState service, 12 gsd_* tools, 12 /gsd-* commands).
// Offline only (D-01/D-02): FakeFs + fake-ctx, no live DSH boot, no LLM/git/gh.

import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";

import { FakeFs } from "./helpers/fake-fs.mjs";
import { GsdState } from "../lib/state.js";

const CWD = "/project";

// The 12 plugin rows in cordis.patch.yml insert order (D-03), verbatim from
// cordis.patch.yml:34-84. Each {id, sub} maps the patch row id to the
// @dsh-gsd/bundle/<sub> subpath export.
const PATCH_ROWS = [
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

// Module-level handle to the gsdState service published by gsd-state's apply(),
// so ctx.get("gsdState") resolves to the SAME instance the persona context
// provider reads (R-1: a separately-constructed GsdState renders "no project").
let gsdStateSvc;

// Fake subagents service (mirrors test/tools.test.mjs:21-62) so any future
// smoke execute that spawns does not throw. apply() of the spawning plugins
// does not touch subagents, but providing it is future-proof (OQ-3).
function makeSubagents() {
  return {
    getProvider: (n) => (n === "spawn" ? { spawn: true } : undefined),
    async start(_n, _req) {
      return { result: { output: [{ type: "text", text: "done" }], stopReason: "completed" }, dispose: () => {} };
    },
  };
}

// Build a single shared fake ctx that satisfies all 12 plugins' inject arrays
// and captures every registration surface. CRITICAL (R-3): ctx.effect MUST
// invoke its callback synchronously or gsd-commands captures zero commands.
function makeMountCtx(fs) {
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
  gsdStateSvc = undefined;

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
    get: (n) =>
      n === "gsdState" ? gsdStateSvc : n === "subagents" ? makeSubagents() : undefined,
  };
  // Invoke the effect callback synchronously (R-3); return its disposer if any.
  // gsd-commands wraps registration in ctx.effect(fn) — a no-op effect would
  // capture zero commands, so fn() MUST run here.
  ctx.effect = (fn, _label) => {
    const d = fn();
    return typeof d === "function" ? d : () => {};
  };
  return ctx;
}

// Apply all 12 plugins in patch order against a ctx; throw with the offending id.
async function applyAll(ctx) {
  for (const { id, sub } of PATCH_ROWS) {
    const mod = await import(`@dsh-gsd/bundle/${sub}`);
    assert.equal(typeof mod.apply, "function", `${id}: module has no apply()`);
    try {
      mod.apply(ctx, {});
    } catch (e) {
      e.message = `${id} apply() threw: ${e.message}`;
      throw e;
    }
  }
}

describe("mount: all 12 plugins activate", () => {
  let fs, ctx;
  beforeEach(() => {
    fs = new FakeFs();
    ctx = makeMountCtx(fs);
  });

  test("applies all 12 plugins in patch order without throwing", async () => {
    await applyAll(ctx);
    assert.ok(ctx.provided.has("gsdState"), "gsdState service was not provided");
    assert.ok(ctx.provided.get("gsdState") instanceof GsdState, "gsdState is not a GsdState instance");
    assert.ok(ctx.tools.length === 12, `expected 12 tools, got ${ctx.tools.length}`);
    assert.ok(ctx.commands.length === 12, `expected 12 commands, got ${ctx.commands.length}`);
    assert.ok(ctx.sections.length === 1, `expected 1 section, got ${ctx.sections.length}`);
    assert.ok(ctx.contexts.length === 1, `expected 1 context, got ${ctx.contexts.length}`);
  });
});
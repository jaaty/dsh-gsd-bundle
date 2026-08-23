// Offline activation harness for @dsh-gsd/bundle (Phase 1: live-mount).
//
// Proves the 12 cordis.patch.yml plugin rows activate inside a fake DSH host:
// each subpath export resolves, apply() runs against one shared fake ctx, and
// the full registration surface is captured (1 persona section, 1 runtime-
// context provider, gsdState service, 12 gsd_* tools, 12 /gsd-* commands).
// Offline only (D-01/D-02): FakeFs + fake-ctx, no live DSH boot, no LLM/git/gh.

import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";

import { promises as fsPromises } from "node:fs";
import path from "node:path";

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

// Targeted line-based reader for cordis.patch.yml (NO YAML dependency — per
// D-05/research OQ-1, preserve the zero-dep invariant). Extracts the
// `agent-loop` override row (presence + raw config lines) and the 12 insert
// rows ({id, spec}). The file's regular structure makes a line parser robust.
async function readPatchRows() {
  const file = path.resolve(import.meta.dirname, "../cordis.patch.yml");
  const text = await fsPromises.readFile(file, "utf8");
  const lines = text.split(/\r?\n/);

  let overridePresent = false;
  const agentLoopConfigRaw = [];
  let insertRows = [];

  // Locate the `- id: agent-loop` override row and collect its indented config
  // block until the next top-level `- ` entry.
  let i = 0;
  while (i < lines.length && !/^- id: agent-loop\s*$/.test(lines[i])) i++;
  if (i < lines.length) {
    overridePresent = true;
    i++; // step past the `- id: agent-loop` line into the config block
    while (i < lines.length && !/^- /.test(lines[i])) {
      agentLoopConfigRaw.push(lines[i]);
      i++;
    }
  }

  // Locate the `- insert:` block and scan its rows: `    - id: <id>` followed
  // by `      name: '<spec>'`.
  while (i < lines.length && !/^- insert:\s*$/.test(lines[i])) i++;
  if (i < lines.length) {
    i++; // step past `- insert:`
    while (i < lines.length && !/^- \S/.test(lines[i])) {
      const m = lines[i].match(/^    - id: (\S+)\s*$/);
      if (m) {
        const id = m[1];
        const nameLine = lines[i + 1] || "";
        const sm = nameLine.match(/^      name: '([^']+)'\s*$/);
        assert.ok(sm, `insert row ${id} has no name: line`);
        insertRows.push({ id, spec: sm[1] });
        i += 2;
      } else {
        i++;
      }
    }
  }

  return { overridePresent, agentLoopConfigRaw, insertRows };
}

// The 12 expected insert rows, verbatim from cordis.patch.yml:34-84 (D-03:
// "exactly the insert block"). Cross-checked against the parsed file so a row
// added/removed in the patch fails the test.
const EXPECTED_INSERT_ROWS = PATCH_ROWS.map(({ id, sub }) => ({
  id,
  spec: `@dsh-gsd/bundle/${sub}`,
}));

// Expected registered tool names (12) — verified against the real modules.
const EXPECTED_TOOL_NAMES = [
  "gsd_init", "gsd_status", "gsd_progress", "gsd_new_milestone",
  "gsd_discuss", "gsd_plan", "gsd_execute", "gsd_verify",
  "gsd_ship", "gsd_ui_phase", "gsd_quick", "gsd_map_codebase",
];

// Expected registered command names (12) — from lib/commands.js:35-161 (D-03).
const EXPECTED_COMMAND_NAMES = [
  "gsd-init", "gsd-status", "gsd-progress", "gsd-discuss-phase",
  "gsd-ui-phase", "gsd-plan-phase", "gsd-execute-phase", "gsd-verify-work",
  "gsd-ship", "gsd-quick", "gsd-map-codebase", "gsd-new-milestone",
];

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

describe("mount: cordis.patch.yml rows resolve", () => {
  test("override row present, 12 insert rows resolve via exports + import()", async () => {
    const { overridePresent, agentLoopConfigRaw, insertRows } = await readPatchRows();

    // D-03: the agent-loop override row is asserted only for presence + that it
    // configures a gsd agent (no live merge — D-05 offline preconditions).
    assert.ok(overridePresent, "agent-loop override row not found in cordis.patch.yml");
    assert.ok(
      agentLoopConfigRaw.join("\n").includes("- id: gsd"),
      "agent-loop override does not configure a gsd agent",
    );

    // Exactly the 12 insert rows (D-03).
    assert.ok(insertRows.length === 12, `expected 12 insert rows, got ${insertRows.length}`);
    assert.deepEqual(insertRows, EXPECTED_INSERT_ROWS, "parsed insert rows differ from the expected 12");

    // Each row's name resolves through package.json exports and import().
    const pkgPath = path.resolve(import.meta.dirname, "../package.json");
    const pkg = JSON.parse(await fsPromises.readFile(pkgPath, "utf8"));
    const exports = pkg.exports;
    for (const { id, spec } of insertRows) {
      const sub = spec.replace(/^@dsh-gsd\/bundle\//, "");
      assert.ok(
        exports[`./${sub}`] != null,
        `package.json exports has no key './${sub}' for row ${id}`,
      );
      const mod = await import(`@dsh-gsd/bundle/${sub}`);
      assert.equal(typeof mod.name, "string", `${id}: name is not a string`);
      assert.ok(Array.isArray(mod.inject), `${id}: inject is not an array`);
      assert.equal(typeof mod.apply, "function", `${id}: apply is not a function`);
    }

    // Cross-check captured tool names against the expected 12.
    const fs = new FakeFs();
    const ctx = makeMountCtx(fs);
    await applyAll(ctx);
    const toolNames = ctx.tools.map((t) => t.name).sort();
    assert.deepEqual(toolNames, [...EXPECTED_TOOL_NAMES].sort(), "registered tool names mismatch");

    // Cross-check captured command names against the expected 12.
    const commandNames = ctx.commands.map((c) => c.name).sort();
    assert.deepEqual(commandNames, [...EXPECTED_COMMAND_NAMES].sort(), "registered command names mismatch");
  });
});
// Offline activation harness for @dsh-gsd/bundle (Phase 1: live-mount).
//
// Proves the 12 cordis.patch.yml plugin rows activate inside a fake DSH host:
// each subpath export resolves, apply() runs against one shared fake ctx, and
// the full registration surface is captured (1 persona section, 1 runtime-
// context provider, gsdState service, 13 gsd_* tools, 12 /gsd-* commands).
// Offline only (D-01/D-02): FakeFs + fake-ctx, no live DSH boot, no LLM/git/gh.

import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";

import { promises as fsPromises } from "node:fs";
import path from "node:path";

import { FakeFs } from "./helpers/fake-fs.mjs";
import { GsdState } from "../lib/state.js";
import { CAPABILITY_KEYS } from "../lib/_capabilities.js";

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
      n === "gsdState"
        ? gsdStateSvc
        : n === "subagents"
          ? makeSubagents()
          : provided.get(n),
  };
  // Invoke the effect callback synchronously (R-3); return its disposer if any.
  // gsd-commands wraps registration in ctx.effect(fn) — a no-op effect would
  // capture zero commands, so fn() MUST run here.
  ctx.effect = (fn, _label) => {
    const d = fn();
    return typeof d === "function" ? d : () => {};
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

// Expected registered tool names (13) — verified against the real modules.
const EXPECTED_TOOL_NAMES = [
  "gsd_init", "gsd_status", "gsd_progress", "gsd_new_milestone",
  "gsd_discuss", "gsd_plan", "gsd_execute", "gsd_verify",
  "gsd_ship", "gsd_ui_phase", "gsd_quick", "gsd_map_codebase",
  "gsd_job", "gsd_intel_updater",
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
    assert.ok(ctx.tools.length === 14, `expected 14 tools, got ${ctx.tools.length}`);
    assert.ok(ctx.commands.length === 12, `expected 12 commands, got ${ctx.commands.length}`);
    assert.ok(ctx.sections.length === 1, `expected 1 section, got ${ctx.sections.length}`);
    assert.ok(ctx.contexts.length === 1, `expected 1 context, got ${ctx.contexts.length}`);

    // DEGR-01: all 10 capability services are provided with the documented
    // descriptor shape (D-03: key/step/role/tools/commands/order). Built from
    // CAPABILITY_KEYS so test and source never drift (D-02 camelCase keys).
    assert.ok(CAPABILITY_KEYS.length === 10, `expected 10 capability keys, got ${CAPABILITY_KEYS.length}`);
    for (const key of CAPABILITY_KEYS) {
      const cap = ctx.provided.get(key);
      assert.ok(cap, `capability ${key} was not provided`);
      assert.equal(cap.key, key, `${key}: descriptor key does not match ${cap.key}`);
      assert.equal(typeof cap.step, "string", `${key}: step is not a string`);
      assert.equal(typeof cap.role, "string", `${key}: role is not a string`);
      assert.ok(Array.isArray(cap.tools), `${key}: tools is not an array`);
      assert.ok(cap.tools.length > 0, `${key}: tools is empty`);
      assert.ok(Array.isArray(cap.commands), `${key}: commands is not an array`);
      assert.equal(typeof cap.order, "number", `${key}: order is not a number`);
    }
  });

  test("absent capability leaves its slash command unregistered (DEGR-03)", async () => {
    // Apply every plugin EXCEPT gsd-commands so all 10 capabilities are
    // provided, then withdraw one capability from the provided store and apply
    // gsd-commands: its sub-fiber for that capability must stay inactive (never
    // register the command) while the other 11 commands register normally.
    const ctx2 = makeMountCtx(fs);
    for (const { id, sub } of PATCH_ROWS) {
      if (sub === "commands") continue;
      const mod = await import(`@dsh-gsd/bundle/${sub}`);
      mod.apply(ctx2, {});
    }
    assert.ok(ctx2.provided.has("gsdQuick"), "gsdQuick capability was not provided");
    ctx2.provided.delete("gsdQuick");

    const commandsMod = await import(`@dsh-gsd/bundle/commands`);
    commandsMod.apply(ctx2, {});

    assert.ok(ctx2.commands.length === 11, `expected 11 commands, got ${ctx2.commands.length}`);
    assert.ok(!ctx2.commands.some((c) => c.name === "gsd-quick"), "gsd-quick was registered despite gsdQuick being absent");
    for (const expected of EXPECTED_COMMAND_NAMES) {
      if (expected === "gsd-quick") continue;
      assert.ok(
        ctx2.commands.some((c) => c.name === expected),
        `expected command ${expected} to be registered, got ${ctx2.commands.map((c) => c.name).join(", ")}`,
      );
    }
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

    // Cross-check captured tool names against the expected 13.
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

describe("mount: persona orients at STATE.md (MOUNT-02)", () => {
  let fs, ctx;

  const exec = {
    agent: { session: { header: { cwd: CWD } } },
    signal: { aborted: false, addEventListener() {}, removeEventListener() {} },
  };

  beforeEach(async () => {
    fs = new FakeFs();
    ctx = makeMountCtx(fs);
    await applyAll(ctx);
  });

  test("persona section is gsd:persona (order -100) with phase-loop text", () => {
    const section = ctx.sections[0];
    assert.equal(section.name, "gsd:persona");
    assert.ok(section.order === -100, `expected order -100, got ${section.order}`);
    // The body is a per-assembly function (RESEARCH OQ-1) — evaluate it with a
    // context object before asserting (mirrors the gsd:state context provider).
    assert.equal(typeof section.text, "function", "persona section text must be an assembly-fresh function");
    const body = section.text({ agent: { session: { header: { cwd: CWD } } } });
    assert.equal(typeof body, "string");
    assert.match(body, /Discuss/);
    assert.match(body, /Ship/);
    // The full-set mount provides every capability, so the step paragraphs and
    // the orient surface must name their tools.
    assert.match(body, /gsd_status/);
    assert.match(body, /gsd_quick/);
  });

  test("runtime-context provider is gsd:state (order 10)", () => {
    const context = ctx.contexts[0];
    assert.equal(context.name, "gsd:state");
    assert.ok(context.order === 10, `expected order 10, got ${context.order}`);
  });

  test("gsd_init smoke orients the context provider at STATE.md", async () => {
    // Single minimal smoke call (D-04): gsd_init writes the .planning/ tree
    // through the SAME provided gsdState (R-1 — do NOT use buildProject, which
    // constructs a separate GsdState and would render "no project").
    const gsdInit = ctx.tools.find((t) => t.name === "gsd_init");
    assert.ok(gsdInit, "gsd_init tool not registered");
    const res = await gsdInit.execute(
      {
        name: "demo",
        milestoneName: "M1",
        version: "v1.0",
        requirements: [{ id: "MOUNT-01", text: "x" }],
        phases: [{ name: "p1", goal: "do it", requirements: ["MOUNT-01"] }],
      },
      exec,
    );
    assert.match(res, /Initialised GSD project/);

    // The context provider now renders the loop position at the current STATE.md.
    const out = ctx.contexts[0].text({ agent: { session: { header: { cwd: CWD } } } });
    assert.match(
      out,
      /GSD loop position: milestone .+ \/ (phase .+ \/ step .+|no active phase)/,
      "context provider did not render the loop position",
    );
    // The snapshot must state the wait-for-explicit-command contract (Option A).
    assert.match(
      out,
      /do NOT advance to the next step until the user issues an explicit command/,
      "context provider did not render the wait-for-command contract",
    );
  });

  test("uninitialised-cwd branch renders the orientation hint", () => {
    const out = ctx.contexts[0].text({ agent: { session: { header: { cwd: "/elsewhere" } } } });
    assert.match(out, /no \.planning\/ project found/);
  });

  test("all 14 registered tools have a valid compiled schema", () => {
    // apply() not throwing already proves defineTool compiled the schema (D-04);
    // assert the shape explicitly for every tool.
    assert.equal(ctx.tools.length, 14);
    for (const t of ctx.tools) {
      assert.equal(typeof t.name, "string", `${t.name}: name is not a string`);
      assert.equal(typeof t.description, "string", `${t.name}: description is not a string`);
      assert.equal(typeof t.parameters, "object", `${t.name}: parameters is not an object`);
      assert.ok(t.parameters !== null, `${t.name}: parameters is null`);
      assert.ok(t.output && t.output.schema, `${t.name}: missing output.schema`);
    }
  });
});
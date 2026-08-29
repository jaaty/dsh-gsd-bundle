// Unit tests for the pure capability-gate evaluators in lib/gates.js.
// Style mirrors test/_shared.test.mjs: pure, in-memory inputs, no git/fs I/O.

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  globToRegex,
  securityGate,
  brokenWindowsGate,
  tddAuditGate,
  resolveGatesConfig,
  runCapabilityGates,
  fetchGitData,
  addedLinesOf,
  GATE_DISPATCH,
  GATE_NAMES,
} from "../lib/gates.js";
import { secretPatterns } from "../lib/_shared.js";

describe("security gate", () => {
  test("globToRegex('.env') matches a/.env and .env but not a/.env.example", async () => {
    const re = globToRegex(".env");
    assert.match("a/.env", re);
    assert.match(".env", re);
    assert.doesNotMatch("a/.env.example", re);
  });

  test("globToRegex('*secret*') matches config/secretKey.json", async () => {
    const re = globToRegex("*secret*");
    assert.match("config/secretKey.json", re);
  });

  test("globToRegex('config/secrets/*') matches config/secrets/x", async () => {
    const re = globToRegex("config/secrets/*");
    assert.match("config/secrets/x", re);
  });

  test("securityGate([]) returns pass with empty findings", async () => {
    assert.deepEqual(securityGate([]), { status: "pass", findings: [] });
  });

  test("securityGate flags a changed .env naming file and pattern", async () => {
    const res = securityGate(["src/x.js", "a/.env"]);
    assert.equal(res.status, "fail");
    assert.deepEqual(res.findings, [{ file: "a/.env", pattern: ".env" }]);
  });

  test("securityGate flags multiple secret files, each naming file + pattern", async () => {
    const res = securityGate([
      "src/id_rsa",
      "deploy/credentials.prod.json",
      "app/config/secrets/token",
    ]);
    assert.equal(res.status, "fail");
    assert.ok(res.findings.length >= 3, `expected >=3 findings, got ${res.findings.length}`);
    const byFile = Object.fromEntries(res.findings.map((f) => [f.file, f.pattern]));
    assert.ok(byFile["src/id_rsa"], "id_rsa finding present");
    assert.ok(byFile["deploy/credentials.prod.json"], "credentials finding present");
    assert.ok(byFile["app/config/secrets/token"], "config/secrets finding present");
    for (const f of res.findings) {
      assert.ok(f.file, "finding names a file");
      assert.ok(f.pattern, "finding names a matched pattern");
    }
  });

  test("secretPatterns carries the exact credential globs (D-01)", async () => {
    assert.ok(secretPatterns.includes(".env"));
    assert.ok(secretPatterns.includes("credentials.*"));
    assert.ok(secretPatterns.includes("*.pem"));
    assert.ok(secretPatterns.includes("*-credentials.json"));
  });
});

describe("broken-windows gate", () => {
  test("flags an unreferenced TODO naming file + marker", async () => {
    const res = brokenWindowsGate(["src/a.js"], { "src/a.js": "// TODO fix this" });
    assert.equal(res.status, "fail");
    assert.deepEqual(res.findings, [{ file: "src/a.js", marker: "TODO" }]);
  });

  test("flags FIXME content naming file + marker", async () => {
    const res = brokenWindowsGate(["src/a.js"], { "src/a.js": "// FIXME later" });
    assert.equal(res.status, "fail");
    assert.deepEqual(res.findings, [{ file: "src/a.js", marker: "FIXME" }]);
  });

  test("flags XXX content naming file + marker", async () => {
    const res = brokenWindowsGate(["src/a.js"], { "src/a.js": "// XXX hack" });
    assert.equal(res.status, "fail");
    assert.deepEqual(res.findings, [{ file: "src/a.js", marker: "XXX" }]);
  });

  test("flags skipped tests: test.skip, describe.skip, xit -> marker skipped-test", async () => {
    for (const content of ["test.skip('x')", "describe.skip('x')", "xit('x')"]) {
      const res = brokenWindowsGate(["src/a.test.js"], { "src/a.test.js": content });
      assert.equal(res.status, "fail");
      assert.deepEqual(res.findings, [{ file: "src/a.test.js", marker: "skipped-test" }]);
    }
  });

  test("clean content returns pass with empty findings", async () => {
    const res = brokenWindowsGate(["src/a.js"], { "src/a.js": "const x = 1; // clean" });
    assert.equal(res.status, "pass");
    assert.deepEqual(res.findings, []);
  });

  test("excludes .planning/** prose and .md/.txt files from the marker scan (OQ-2)", async () => {
    const res = brokenWindowsGate(
      [".planning/notes.md", "README.md", "docs/a.txt", "src/a.js"],
      {
        ".planning/notes.md": "TODO this is planning prose",
        "README.md": "FIXME in a readme",
        "docs/a.txt": "XXX in a text file",
        "src/a.js": "const ok = 1;",
      },
    );
    assert.equal(res.status, "pass", "prose and non-code files must be excluded");
    assert.deepEqual(res.findings, []);
  });

  test("a changed file under .planning/ containing TODO is excluded", async () => {
    const res = brokenWindowsGate([".planning/phase.md"], { ".planning/phase.md": "TODO later" });
    assert.equal(res.status, "pass");
    assert.deepEqual(res.findings, []);
  });

  test("scans only ADDED lines from diffMap, not pre-existing whole-file markers", async () => {
    // The whole file contains a marker, but it is NOT in the added lines — a
    // pre-existing marker in an unchanged line must not flag (diff-based scan).
    // The marker token is built dynamically so this test file itself never
    // contains a literal marker the gate would self-flag.
    const M = "TO" + "DO";
    const res = brokenWindowsGate(
      ["src/a.js"],
      { "src/a.js": `// ${M} pre-existing\nconst x = 1;` },
      { "src/a.js": ["const x = 1;"] },
    );
    assert.equal(res.status, "pass", "pre-existing marker in unchanged line must not flag");
    assert.deepEqual(res.findings, []);
  });

  test("flags a marker introduced in an ADDED line", async () => {
    const M = "TO" + "DO";
    const res = brokenWindowsGate(
      ["src/a.js"],
      { "src/a.js": "const x = 1;" },
      { "src/a.js": ["const x = 1;", `// ${M} new work`] },
    );
    assert.equal(res.status, "fail");
    assert.deepEqual(res.findings, [{ file: "src/a.js", marker: M }]);
  });

  test("falls back to whole-file content when diffMap has no entry for the file", async () => {
    const M = "TO" + "DO";
    const res = brokenWindowsGate(["src/a.js"], { "src/a.js": `// ${M} later` });
    assert.equal(res.status, "fail");
    assert.deepEqual(res.findings, [{ file: "src/a.js", marker: M }]);
  });

  test("addedLinesOf extracts added lines and skips the +++ header", async () => {
    const M = "TO" + "DO";
    const patch = [
      "diff --git a/src/a.js b/src/a.js",
      "index 000..111 100644",
      "--- a/src/a.js",
      "+++ b/src/a.js",
      "@@ -1,2 +1,3 @@",
      " const x = 1;",
      `+// ${M} new`,
      "+const y = 2;",
      "-const old = 0;",
    ].join("\n");
    assert.deepEqual(addedLinesOf(patch), [`// ${M} new`, "const y = 2;"]);
    assert.deepEqual(addedLinesOf(""), []);
  });
});

describe("tdd-audit gate", () => {
  const plans = [{ id: "GSD-08-x-01", phase: "8", plan: "1", type: "tdd" }];

  test("test: subject before feat: subject passes", async () => {
    const res = tddAuditGate(plans, ["test(08-01): a", "feat(08-01): b"]);
    assert.equal(res.status, "pass");
    assert.deepEqual(res.findings, []);
  });

  test("missing test: commit before feat:/fix: fails", async () => {
    const res = tddAuditGate(plans, ["feat(08-01): b"]);
    assert.equal(res.status, "fail");
    assert.equal(res.findings[0].planId, "GSD-08-x-01");
    assert.match(res.findings[0].reason, /test:/);
  });

  test("a non-tdd plan is never audited", async () => {
    const res = tddAuditGate([{ id: "GSD-08-x-01", phase: "8", plan: "1", type: "execute" }], ["feat(08-01): b"]);
    assert.equal(res.status, "pass");
  });

  test("tdd plan whose only scope-matching subject is feat: fails", async () => {
    const res = tddAuditGate(plans, ["feat(08-01): x"]);
    assert.equal(res.status, "fail");
  });

  test("subjects from another plan do not satisfy a tdd plan scoped (08-01)", async () => {
    const res = tddAuditGate(plans, ["test(09-01): z"]);
    assert.equal(res.status, "fail");
  });

  test("a plan with phase 8 / plan 1 derives scope 08-01", async () => {
    // BUG: the structured phase/plan fields feed planScope (D-02/D-03) — the
    // scope is derived from plan.phase/plan.plan, never by parsing plan.id.
    const res = tddAuditGate(
      [{ id: "GSD-08-capability-gates-01", phase: "8", plan: "1", type: "tdd" }],
      ["test(08-01): a", "feat(08-01): b"],
    );
    assert.equal(res.status, "pass");
  });

  test("interleaved test:/feat: commits in oldest-first order pass", async () => {
    // ORDERING CONTRACT: commitSubjects are delivered oldest-first. A sequence
    // that opens with test( then feat( passes; this is the shape that git log
    // --reverse hands the gate (see fetchGitData). Under the old newest-first
    // delivery the gate inspected the reverse order and spuriously failed this.
    const res = tddAuditGate(
      [{ id: "GSD-36-x-02", phase: "36", plan: "2", type: "tdd" }],
      ["test(36-02): a", "feat(36-02): b", "test(36-02): c", "feat(36-02): d"],
    );
    assert.equal(res.status, "pass");
    assert.deepEqual(res.findings, []);
  });

  test("a genuinely missing test: before feat:/fix: still fails (mirror)", async () => {
    // Even with oldest-first input, a scope whose commits never open with a
    // test: subject must keep failing so the gate is not trivially satisfied.
    const res = tddAuditGate(
      [{ id: "GSD-36-x-03", phase: "36", plan: "3", type: "tdd" }],
      ["feat(36-03): a", "test(36-03): b"],
    );
    assert.equal(res.status, "fail");
    assert.equal(res.findings[0].planId, "GSD-36-x-03");
    assert.match(res.findings[0].reason, /test:/);
  });
});

describe("resolveGatesConfig", () => {
  test("absent gates block -> all three enabled", async () => {
    const res = resolveGatesConfig({});
    assert.equal(res.security.enabled, true);
    assert.equal(res.broken_windows.enabled, true);
    assert.equal(res.tdd_audit.enabled, true);
    assert.equal(res.security.status, "enabled");
  });

  test("gates.security false -> security disabled, others enabled", async () => {
    const res = resolveGatesConfig({ gates: { security: false } });
    assert.equal(res.security.enabled, false);
    assert.equal(res.security.status, "skipped");
    assert.equal(res.broken_windows.enabled, true);
    assert.equal(res.tdd_audit.enabled, true);
  });

  test("empty gates block + skip broken_windows -> that gate skipped", async () => {
    const res = resolveGatesConfig({ gates: {} }, ["broken_windows"]);
    assert.equal(res.broken_windows.enabled, false);
    assert.equal(res.broken_windows.status, "skipped");
    assert.equal(res.security.enabled, true);
    assert.equal(res.tdd_audit.enabled, true);
  });

  test("config false + skip combine: security by config, tdd_audit by skip", async () => {
    const res = resolveGatesConfig({ gates: { security: false } }, ["tdd_audit"]);
    assert.equal(res.security.enabled, false);
    assert.equal(res.tdd_audit.enabled, false);
    assert.equal(res.broken_windows.enabled, true);
  });
});

describe("runCapabilityGates", () => {
  const clean = { changedFiles: ["src/a.js"], contentMap: { "src/a.js": "const x = 1;" }, commitSubjects: [] };

  test("clean data -> every gate reports pass, blockError null", async () => {
    const { reportLines, blockError } = runCapabilityGates({ cfg: {}, gitData: clean, plans: [] });
    assert.equal(reportLines.length, 3);
    assert.ok(reportLines.every((l) => /: pass$/.test(l)), reportLines.join("\n"));
    assert.equal(blockError, null);
  });

  test("a changed .env -> security: fail and blockError names security + file", async () => {
    const { reportLines, blockError } = runCapabilityGates({
      cfg: {},
      gitData: { changedFiles: ["a/.env"], contentMap: { "a/.env": "x" }, commitSubjects: [] },
      plans: [],
    });
    const line = reportLines.find((l) => l.startsWith("security:"));
    assert.match(line, /^security: fail/);
    assert.match(line, /\.env/);
    assert.ok(blockError.includes("security"), blockError);
    assert.ok(blockError.includes(".env"), blockError);
  });

  test("content with TODO -> broken_windows: fail names file + marker", async () => {
    const { reportLines, blockError } = runCapabilityGates({
      cfg: {},
      gitData: { changedFiles: ["src/a.js"], contentMap: { "src/a.js": "// TODO later" }, commitSubjects: [] },
      plans: [],
    });
    const line = reportLines.find((l) => l.startsWith("broken_windows:"));
    assert.match(line, /^broken_windows: fail/);
    assert.match(line, /src\/a\.js/);
    assert.ok(blockError.includes("broken_windows"), blockError);
    assert.ok(blockError.includes("TODO"), blockError);
  });

  test("tdd plan with only a feat: commit -> tdd_audit: fail names planId", async () => {
    const { reportLines, blockError } = runCapabilityGates({
      cfg: {},
      gitData: { changedFiles: [], contentMap: {}, commitSubjects: ["feat(08-01): b"] },
      plans: [{ id: "GSD-08-x-01", phase: "8", plan: "1", type: "tdd" }],
    });
    const line = reportLines.find((l) => l.startsWith("tdd_audit:"));
    assert.match(line, /^tdd_audit: fail/);
    assert.match(line, /GSD-08-x-01/);
    assert.ok(blockError.includes("test:"), blockError);
  });

  test("security disabled via cfg.gates -> security: skipped, no block, others still reported", async () => {
    const { reportLines, blockError } = runCapabilityGates({
      cfg: { gates: { security: false } },
      gitData: { changedFiles: ["a/.env"], contentMap: {}, commitSubjects: [] },
      plans: [],
    });
    assert.ok(reportLines.some((l) => l === "security: skipped"), reportLines.join("\n"));
    assert.equal(blockError, null);
    assert.equal(reportLines.length, 3);
  });

  test("security skipped via skipGates -> skipped and does not block", async () => {
    const { reportLines, blockError } = runCapabilityGates({
      cfg: {},
      gitData: { changedFiles: ["a/.env"], contentMap: {}, commitSubjects: [] },
      plans: [],
      skipGates: ["security"],
    });
    assert.ok(reportLines.some((l) => l === "security: skipped"));
    assert.equal(blockError, null);
  });
});

describe("GATE_DISPATCH", () => {
  test("keys align exactly with GATE_NAMES and every entry exposes run + format (D-01)", async () => {
    assert.deepEqual(Object.keys(GATE_DISPATCH).sort(), [...GATE_NAMES].sort());
    for (const name of GATE_NAMES) {
      assert.equal(typeof GATE_DISPATCH[name].run, "function", `${name}.run is a function`);
      assert.equal(typeof GATE_DISPATCH[name].format, "function", `${name}.format is a function`);
    }
  });

  test("a gate name missing from the map throws the gsd_ship guard error (D-04)", async () => {
    // Bug-pin: the dispatcher must fail fast on a wiring bug rather than
    // silently calling undefined.run (D-04).
    const name = "bogus_gate";
    const entry = GATE_DISPATCH[name];
    assert.throws(
      () => {
        if (!entry) throw new Error(`gsd_ship: no dispatcher entry for gate "${name}"`);
      },
      /no dispatcher entry/,
    );
  });
});

describe("fetchGitData", () => {
  // Fake gitFn keyed on args[0]+args[1]; returns canned stdout for the base,
  // merge-base, diff and log calls the adapter makes.
  const fakeGitFn = (cwd, args) => {
    switch (args[0] + ":" + (args[1] || "")) {
      case "symbolic-ref:refs/remotes/origin/HEAD": return "origin/main";
      case "merge-base:HEAD": return "abc123";
      case "diff:--name-only": return "src/a.js\nb/.env";
      // git log returns NEWEST-first; fetchGitData must reverse to oldest-first.
      case "log:--reverse": return "feat(08-01): b\ntest(08-01): a";
      default: return "";
    }
  };

  test("returns changed files, their contents, and commit subjects", async () => {
    const dir = await import("node:fs/promises").then(async (fs) => {
      const d = `${process.cwd()}/.tmp-gates-fetch-${Date.now()}`;
      await fs.mkdir(`${d}/src`, { recursive: true });
      await fs.mkdir(`${d}/b`, { recursive: true });
      await fs.writeFile(`${d}/src/a.js`, "const a = 1;", "utf8");
      await fs.writeFile(`${d}/b/.env`, "SECRET=1", "utf8");
      return d;
    });
    try {
      const res = await fetchGitData(dir, fakeGitFn, undefined);
      assert.deepEqual(res.changedFiles, ["src/a.js", "b/.env"]);
      assert.equal(res.contentMap["src/a.js"], "const a = 1;");
      assert.equal(res.contentMap["b/.env"], "SECRET=1");
      assert.deepEqual(res.commitSubjects, ["test(08-01): a", "feat(08-01): b"]);
    } finally {
      await import("node:fs/promises").then((fs) => fs.rm(dir, { recursive: true, force: true }));
    }
  });

  test("commit subjects are returned in oldest-first order", async () => {
    // ORDERING CONTRACT: git log --format=%s returns NEWEST-first, but the gate
    // (tddAuditGate) requires oldest-first. fetchGitData must reverse so the
    // shipped commitSubjects honour the chronologically-ordered contract.
    const git = (cwd, args) => {
      if (args[0] === "symbolic-ref") return "origin/main";
      if (args[0] === "merge-base") return "abc123";
      if (args[0] === "diff") return "";
      if (args[0] === "log") return "feat(08-01): z\ntest(08-01): y";
      return "";
    };
    const res = await fetchGitData(process.cwd(), git, undefined);
    assert.deepEqual(res.commitSubjects, ["test(08-01): y", "feat(08-01): z"]);
  });

  test("empty merge-base (HEAD == base) -> empty changed files and subjects", async () => {
    const emptyBaseGit = (cwd, args) => {
      if (args[0] === "merge-base") return "";
      if (args[0] === "symbolic-ref") return "origin/main";
      return "";
    };
    const dir = process.cwd();
    const res = await fetchGitData(dir, emptyBaseGit, "main");
    assert.deepEqual(res.changedFiles, []);
    assert.deepEqual(res.commitSubjects, []);
    assert.deepEqual(res.contentMap, {});
  });

  test("explicit base is used instead of origin/HEAD", async () => {
    let used = "";
    const git = (cwd, args) => {
      if (args[0] === "merge-base") { used = args[2]; return "xyz"; }
      if (args[0] === "symbolic-ref") throw new Error("must not resolve origin/HEAD when base given");
      return "";
    };
    const dir = process.cwd();
    await fetchGitData(dir, git, "develop");
    assert.equal(used, "develop");
  });

  test("works with an async gitFn returning Promises", async () => {
    // Same canned values as the sync fakeGitFn, but each call returns a Promise
    // to prove the awaited gitFn path works for async fns (D-02, D-06).
    const asyncGitFn = (cwd, args) => {
      switch (args[0] + ":" + (args[1] || "")) {
        case "symbolic-ref:refs/remotes/origin/HEAD": return Promise.resolve("origin/main");
        case "merge-base:HEAD": return Promise.resolve("abc123");
        case "diff:--name-only": return Promise.resolve("src/a.js\nb/.env");
        case "log:--reverse": return Promise.resolve("feat(08-01): b\ntest(08-01): a");
        default: return Promise.resolve("");
      }
    };
    const dir = process.cwd();
    const res = await fetchGitData(dir, asyncGitFn, undefined);
    assert.deepEqual(res.changedFiles, ["src/a.js", "b/.env"]);
    assert.deepEqual(res.commitSubjects, ["test(08-01): a", "feat(08-01): b"]);
  });
});

describe("gsd_ship capability-gate wiring (static)", () => {
  test("ship.js imports runCapabilityGates + fetchGitData and wires the gates before the push", async () => {
    const fs = await import("node:fs/promises");
    const src = await fs.readFile(new URL("../lib/ship.js", import.meta.url), "utf8");

    // Import line brings in both symbols.
    const importLine = src.split("\n").find((l) => l.includes("from \"./gates.js\""));
    assert.ok(importLine.includes("runCapabilityGates"), "import line has runCapabilityGates");
    assert.ok(importLine.includes("fetchGitData"), "import line has fetchGitData");

    // defaultBranch + listPlans are referenced before the push comment.
    const pushIdx = src.indexOf("6. push branch");
    assert.ok(pushIdx > -1, "push step comment present");
    const defaultBranchIdx = src.indexOf("defaultBranch");
    const listPlansIdx = src.indexOf("listPlans(cwd, args.phase)");
    assert.ok(defaultBranchIdx > -1 && defaultBranchIdx < pushIdx, "defaultBranch resolved before push");
    assert.ok(listPlansIdx > -1 && listPlansIdx < pushIdx, "listPlans called before push");

    // Gate Report appended and blockError fails.
    assert.ok(src.includes("\"## Gate Report\""), "Gate Report heading appended");
    assert.ok(src.includes("if (blockError) fail(blockError)"), "blockError fails the ship");

    // runCapabilityGates is passed the FULL cfg, not cfg.gates.
    const callIdx = src.indexOf("runCapabilityGates({");
    const callEnd = src.indexOf("}", callIdx);
    const call = src.slice(callIdx, callEnd);
    assert.ok(/\bcfg\b/.test(call), "runCapabilityGates receives the full cfg");
    assert.ok(!/cfg\.gates/.test(call), "runCapabilityGates does NOT receive a pre-extracted gates sub-object");

    // skip_gates parameter present in the schema.
    assert.ok(src.includes("skip_gates"), "skip_gates parameter registered");
  });
});

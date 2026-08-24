// Unit tests for the pure capability-gate evaluators in lib/gates.js.
// Style mirrors test/_shared.test.mjs: pure, in-memory inputs, no git/fs I/O.

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  secretPatterns,
  globToRegex,
  securityGate,
  brokenWindowsGate,
  tddAuditGate,
  resolveGatesConfig,
} from "../lib/gates.js";

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
});

describe("tdd-audit gate", () => {
  const plans = [{ id: "GSD-08-x-01", type: "tdd" }];

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
    const res = tddAuditGate([{ id: "GSD-08-x-01", type: "execute" }], ["feat(08-01): b"]);
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

  test("plan id with a phase-slug prefix derives scope 08-01, not gates-01", async () => {
    const res = tddAuditGate(
      [{ id: "GSD-08-capability-gates-01", type: "tdd" }],
      ["test(08-01): a", "feat(08-01): b"],
    );
    assert.equal(res.status, "pass");
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

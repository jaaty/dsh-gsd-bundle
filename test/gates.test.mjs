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

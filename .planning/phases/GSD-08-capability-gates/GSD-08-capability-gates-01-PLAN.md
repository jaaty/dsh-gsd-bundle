---
phase: 08-capability-gates
plan: 01
type: tdd
wave: 1
depends_on: []
files_modified:
  - lib/gates.js
  - test/gates.test.mjs
autonomous: true
requirements: ["CAP-01", "CAP-02"]
user_setup: []
must_haves:
  truths:
    - "The three capability-gate evaluators exist as pure exported functions in lib/gates.js (securityGate, brokenWindowsGate, tddAuditGate) and each returns {status: 'pass'|'fail', findings:[...]} from in-memory inputs with no I/O (CAP-01, D-01/D-02/D-03)."
    - "A changed file whose path matches a secret/credential glob produces a security-gate 'fail' naming the file and the matched pattern (D-01)."
    - "A changed code/test file whose content contains an unreferenced TODO/FIXME/XXX marker or a skipped-test marker produces a broken-windows 'fail' naming the file and marker; .planning/** prose and non-code files are excluded from the marker scan (D-02, OQ-2)."
    - "A plan typed type:tdd whose commits lack a test: subject before its feat:/fix: subject produces a tdd-audit 'fail'; non-tdd plans are never audited (D-03, D-09)."
    - "resolveGatesConfig defaults all three gates to enabled when cfg.gates is absent, and marks a gate 'skipped' when cfg.gates.<name> is false or the gate is listed in skipGates (D-06, D-08)."
  artifacts:
    - path: "lib/gates.js"
      provides: "Pure capability-gate evaluators (security, broken-windows, tdd-audit), the secret-glob→regex matcher, and the config-gate-flag resolver. No I/O, no git — all inputs are in-memory."
      min_lines: 120
      exports: ["secretPatterns", "globToRegex", "securityGate", "brokenWindowsGate", "tddAuditGate", "resolveGatesConfig"]
    - path: "test/gates.test.mjs"
      provides: "node --test unit suite for every evaluator and the config resolver, following the pure-helper style of test/_shared.test.mjs."
      min_lines: 140
      exports: []
  key_links:
    - from: "lib/gates.js securityGate"
      to: "lib/_agents.js:283 secret/credential glob list"
      via: "secretPatterns array exported from lib/gates.js carries the exact comma-separated glob list; securityGate matches each changed file path against it via globToRegex."
      pattern: "secretPatterns|credentials\\.\\*|\\.pem"
    - from: "lib/gates.js brokenWindowsGate"
      to: "lib/gates.js securityGate"
      via: "both accept the same (changedFiles, contentMap) inputs and return the shared {status, findings} shape, so the orchestration layer treats them uniformly."
      pattern: "status"
---
<objective>
Create the pure, I/O-free capability-gate evaluators in lib/gates.js and prove them with node --test unit tests. This is the domain tier of the capability-gate gatekeeper: security (D-01), broken-windows (D-02), tdd-audit (D-03/D-09), plus the secret-glob→regex matcher and the config-gate-flag resolver (D-06/D-08). It delivers the core pass/fail evaluation logic that CAP-01 and CAP-02 depend on. No git and no ship.js changes here — evaluators take in-memory inputs and are fully deterministic so they can be unit-tested without a real git.
</objective>
<context>@.planning/phases/GSD-08-capability-gates/GSD-08-capability-gates-CONTEXT.md (decisions D-01, D-02, D-03, D-06, D-08, D-09)
@.planning/phases/GSD-08-capability-gates/GSD-08-capability-gates-RESEARCH.md (Validation Architecture 1–4, OQ-2/OQ-3/OQ-7 resolutions)
@lib/_agents.js:283 (the exact secret/credential glob list to mirror into secretPatterns)
@test/_shared.test.mjs (pure-helper unit-test style to mirror)</context>
<tasks>
<task type="auto">
  <name>Task 1 (TRACER, RED→GREEN): security gate + glob→regex matcher</name>
  <files>lib/gates.js, test/gates.test.mjs</files>
  <read_first>lib/_agents.js:283, test/_shared.test.mjs, .planning/phases/GSD-08-capability-gates/GSD-08-capability-gates-CONTEXT.md</read_first>
  <action>RED first: in test/gates.test.mjs write and run (node --test test/gates.test.mjs, expecting RED) a describe block "security gate" covering: (a) globToRegex(".env") matches "a/.env" and ".env" but not "a/.env.example"; globToRegex("*secret*") matches "config/secretKey.json"; globToRegex("config/secrets/*") matches "config/secrets/x". (b) securityGate([]) returns {status:"pass",findings:[]}. (c) securityGate(["src/x.js","a/.env"]) returns {status:"fail"} with a finding {file:"a/.env", pattern:".env"}. (d) securityGate(["src/id_rsa","deploy/credentials.prod.json","app/config/secrets/token"]) returns {status:"fail"} with ≥3 findings, each naming its file and the matched pattern. Commit this as test(08-01): gate security evaluator. GREEN: create lib/gates.js exporting secretPatterns (the exact comma-separated glob list copied verbatim from lib/_agents.js:283 up to "-credentials.json" — do not include the trailing prose sentence), globToRegex(glob) (translate * to .*, ? to ., anchor both ends, escape other regex metacharacters, treat a trailing / as **; return a RegExp), and securityGate(changedFiles) (iterate paths, match against each secretPattern via globToRegex, collect {file, pattern} findings; status "pass" when findings empty else "fail"). Commit as feat(08-01): security gate evaluator. No fenced code in commits.</action>
  <verify>cd /var/home/jatyeo/dev/dsh-gsd-bundle && node --test test/gates.test.mjs 2>&1 | tail -20</verify>
  <acceptance_criteria>
    - lib/gates.js exports secretPatterns, globToRegex, securityGate
    - grep -q "credentials\\." test/gates.test.mjs
    - node --test test/gates.test.mjs exits 0 with the security describe passing
    - git log --format=%s -2 shows a "test(08-01):" commit followed by a "feat(08-01):" commit
  </acceptance_criteria>
  <done>securityGate is a pure function returning {status, findings} from a changed-file path list, proven by a passing unit test.</done>
</task>
<task type="auto">
  <name>Task 2 (RED→GREEN): broken-windows gate</name>
  <files>lib/gates.js, test/gates.test.mjs</files>
  <read_first>test/gates.test.mjs, lib/_agents.js:283, .planning/phases/GSD-08-capability-gates/GSD-08-capability-gates-CONTEXT.md</read_first>
  <action>RED first: add to test/gates.test.mjs a describe "broken-windows gate" covering: (a) brokenWindowsGate(["src/a.js"], {"src/a.js":"// TODO fix this"}) returns {status:"fail"} with finding {file:"src/a.js", marker:"TODO"}. (b) Same for "FIXME" and "XXX" content, and for content containing "test.skip(" and "describe.skip(" and "xit(" (marker "skipped-test"). (c) brokenWindowsGate(["src/a.js"], {"src/a.js":"const x=1; // clean"}) returns {status:"pass",findings:[]}. (d) A .planning/** file and a .md/.txt file whose content contains "TODO" are excluded → pass (OQ-2). (e) A changed file whose path starts with ".planning/" containing "TODO" is excluded → pass. Commit as test(08-01): broken-windows evaluator. GREEN: add brokenWindowsGate(changedFiles, contentMap) to lib/gates.js. For each changed file not matching /^\.planning\// and with a code extension (.js .ts .mjs .cjs .py .go .rs .java .sh .yml .yaml .json .jsx .tsx .vue), scan contentMap[file] for /(TODO|FIXME|XXX)/ and /(test\.skip\(|describe\.skip\(|xit\()/; record {file, marker} findings (marker "TODO"/"FIXME"/"XXX"/"skipped-test" from the first marker kind found). status "pass" when findings empty else "fail". Commit as feat(08-01): broken-windows evaluator.</action>
  <verify>cd /var/home/jatyeo/dev/dsh-gsd-bundle && node --test test/gates.test.mjs 2>&1 | tail -20</verify>
  <acceptance_criteria>
    - brokenWindowsGate is exported from lib/gates.js
    - grep -q "describe.skip\|FIXME\|xit(" test/gates.test.mjs
    - node --test test/gates.test.mjs exits 0
    - git log --format=%s -2 shows "test(08-01):" then "feat(08-01):"
  </acceptance_criteria>
  <done>brokenWindowsGate is a pure content-scan returning {status, findings} that ignores .planning/** prose and non-code files.</done>
</task>
<task type="auto">
  <name>Task 3 (RED→GREEN): tdd-audit gate + config gate-flag resolver</name>
  <files>lib/gates.js, test/gates.test.mjs</files>
  <read_first>test/gates.test.mjs, lib/_agents.js:157, .planning/config.json, .planning/phases/GSD-08-capability-gates/GSD-08-capability-gates-CONTEXT.md</read_first>
  <action>RED first: add a describe "tdd-audit gate" covering: (a) tddAuditGate([{id:"GSD-08-x-01", type:"tdd"}], ["test(08-01): a","feat(08-01): b"]) returns {status:"pass"}. (b) Same plans with subjects ["feat(08-01): b"] (no test:) returns {status:"fail"} with finding {planId:"GSD-08-x-01", reason: containing "test:"}. (c) A plan with type:"execute" is never audited → pass even with subjects ["feat(08-01): b"]. (d) tdd plan whose only scope-matching subject is "feat(08-01): x" (test: absent) → fail. (e) subjects from other plans ("test(09-01): z") do not satisfy a tdd plan scoped (08-01). Then a describe "resolveGatesConfig" covering: resolveGatesConfig({}) → all three enabled; resolveGatesConfig({gates:{security:false}}) → security disabled, others enabled; resolveGatesConfig({gates:{}}, ["broken_windows"]) → broken_windows disabled by skip; resolveGatesConfig({gates:{security:false}}, ["tdd_audit"]) → security disabled by config, tdd_audit disabled by skip. Commit as test(08-01): tdd-audit + config resolver. GREEN: add tddAuditGate(plans, commitSubjects) and resolveGatesConfig(cfg, skipGates) to lib/gates.js. tddAuditGate: for each plan where plan.type === "tdd", derive its commit scope as `${tokens[1]}-${tokens[tokens.length-1]}` (zero-padded) from the plan id split on "-" — i.e. the phase number (token[1]) and the plan number (last token), NEVER the last two tokens (for the real id "GSD-08-capability-gates-01" that would give the wrong "gates-01"). Assert the derived scope equals the "(08-PP)" commit convention from lib/_agents.js:157 (e.g. plan.id "GSD-08-x-01" → scope "08-01"; plan.id "GSD-08-capability-gates-01" → scope "08-01"). Filter commitSubjects for ones whose "(<scope>)" matches the derived scope; if no subject starting with "test(" appears before any subject starting with "feat(" or "fix(" in that plan's filtered sequence, record {planId, reason:"missing test: commit before feat:/fix:"}; status "pass" when no findings else "fail". resolveGatesConfig: read cfg.gates (default {}), for each of the three gate names security/broken_windows/tdd_audit enabled = cfg.gates[name] !== false && !skipGates.includes(name); return { security:{enabled, status: enabled?"enabled":"skipped"}, broken_windows:{...}, tdd_audit:{...} }. Commit as feat(08-01): tdd-audit + config resolver.</action>
  <verify>cd /var/home/jatyeo/dev/dsh-gsd-bundle && node --test test/gates.test.mjs 2>&1 | tail -20</verify>
  <acceptance_criteria>
    - tddAuditGate and resolveGatesConfig exported from lib/gates.js
    - grep -q "test(08-01)\|type.*tdd\|resolveGatesConfig" test/gates.test.mjs
    - node --test test/gates.test.mjs exits 0
    - git log --format=%s -2 shows "test(08-01):" then "feat(08-01):"
  </acceptance_criteria>
  <done>tddAuditGate enforces RED→GREEN per type:tdd plan, and resolveGatesConfig returns per-gate enabled/skipped from cfg.gates + skipGates.</done>
</task>
</tasks>

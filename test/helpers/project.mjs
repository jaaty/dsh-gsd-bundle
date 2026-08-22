// Build a minimal initialized project + phase + plans through GsdState, using an
// injected fake fs. Shared by the state/service tests.

import { GsdState } from "../../lib/state.js";

export const REQS = [
  { id: "AUTH-01", text: "User can log in", complete: false },
  { id: "TODO-01", text: "Add a task", complete: false },
];

export const FENCED_PLAN = `---
phase: 01-auth
plan: 01
type: tdd
wave: 1
depends_on: []
files_modified: ["src/auth.js"]
autonomous: true
requirements: ["AUTH-01"]
gap_closure: true
---
<objective>add login</objective>
<context>src</context>
<tasks>
<task type="auto">
<name>Task 1</name>
<files>src/auth.js</files>
<read_first>src</read_first>
<action>implement login</action>
<verify>node --check src/auth.js</verify>
<acceptance_criteria>- src/auth.js exists</acceptance_criteria>
<done>done</done>
</task>
</tasks>`;

export const FENCELESS_PLAN = `phase: 01-auth
plan: 02
type: execute
wave: 1
depends_on: []
files_modified:
  - src/auth2.js
  - tests/test_auth2.py
autonomous: true
requirements: ["TODO-01"]
gap_closure: true
must_haves:
  truths:
    - "truth one"
<objective>add login 2</objective>
<tasks>
<task type="auto">
<name>Task 1</name>
<files>src/auth2.js</files>
<read_first>src</read_first>
<action>implement</action>
<verify>check</verify>
<acceptance_criteria>- ok</acceptance_criteria>
<done>done</done>
</task>
</tasks>`;

export const FENCED_SUMMARY = `---
phase: 01-auth
plan: 01
status: complete
---
# Summary`;

export const FENCELESS_SUMMARY = `phase: 01-auth
plan: 01
status: complete
# Summary`;

export const VERIFICATION_PASSED = `---
phase: 01-auth
verified: 2026-08-22
status: passed
score: 2/2
---
# Verification`;

export const VERIFICATION_GAPS = `---
phase: 01-auth
status: gaps_found
score: 1/2
---
# Verification`;

export async function buildProject(fs, cwd = "/project") {
  const ctx = { fs, get: () => undefined, provide: () => {}, effect: () => () => {} };
  const svc = new GsdState(ctx, {});
  await svc.initProject(cwd, {
    name: "Test", purpose: "p", milestoneName: "M1", version: "v1.0",
    requirements: REQS,
    phases: [{ name: "auth", goal: "Add login", requirements: ["AUTH-01", "TODO-01"] }],
  });
  return svc;
}

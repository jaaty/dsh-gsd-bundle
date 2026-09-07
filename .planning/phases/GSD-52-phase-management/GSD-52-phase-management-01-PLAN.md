---
phase: 52-phase-management
plan: 01
type: execute
wave: 1
depends_on: []
files_modified: ["lib/phase-management.js", "test/phase-management.test.mjs"]
autonomous: true
requirements: ["CLH-01"]
gap_closure: false
user_setup: []
must_haves:
  truths:
    - "Appending a phase assigns n = existing max+1 and it appears in both the ROADMAP phase table and its regenerated ## Progress table after a stringifyRoadmap -> parseRoadmap round-trip."
    - "A hard-invariant failure (duplicate slug, duplicate name, empty goal, zero requirements, or a REQ-ID absent from REQUIREMENTS.md) rejects the action with a specific code and leaves the input roadmap document unchanged (fail-closed, D-04/D-06)."
    - "insert/reorder/remove renumber the phase array contiguously (n = index+1); remove and reorder of a Complete phase and reorder of the active phase are hard-blocked; remove of the active or last pending phase requires confirm=true (D-03/D-08)."
  artifacts:
    - path: "lib/phase-management.js"
      provides: "Pure, dependency-free CRUD + validation + renumbering operating on the parseRoadmap document shape"
      min_lines: 120
      exports: ["validateRoadmapDoc", "renumber", "applyPhaseAction"]
    - path: "test/phase-management.test.mjs"
      provides: "Exhaustive pure unit tests for every CRUD action, guard, and hard invariant"
      min_lines: 60
      exports: []
  key_links:
    - from: "lib/phase-management.js"
      to: "lib/_shared.js"
      via: "imports stringifyRoadmap + parseRoadmap for mutation -> stringify -> parse round-trip verification"
      pattern: "(stringifyRoadmap|parseRoadmap)"
---
<objective>
Deliver the pure domain core of CLH-01: a dependency-free module lib/phase-management.js with deterministic CRUD actions (add/insert/remove/reorder/edit), the D-04 hard-invariant validation, the D-03/D-08 destructive-guard rules, and the OQ-1 contiguous renumbering scheme, each operating on the parseRoadmap document shape and returning { ok:false, code, error } fail-closed without mutating the input. It stays a single source of truth that the Wave-2 tool/orchestration plan consumes, and is proven by exhaustive pure unit tests.
</objective>
<context>@.planning/phases/GSD-52-phase-management/52-CONTEXT.md, @lib/_shared.js (lines 5-24 slugify/zeroPad, 179-236 parseRoadmap/stringifyRoadmap, 239-246 parseRequirements), @test/_shared.test.mjs (unit-test style to mirror)</context>
<tasks>
  <task type="auto">
    <name>Task 1: Create the pure module with validateRoadmapDoc, renumber, and the add action (tracer)</name>
    <files>lib/phase-management.js</files>
    <read_first>lib/_shared.js, lib/_capabilities.js</read_first>
    <action>
      Create lib/phase-management.js as a plain-ESM module (no imports of ctx/tools/dsh packages, no node:fs/git I/O) mirroring the lib/_shared.js / lib/_capabilities.js zero-dependency pattern. Import { slugify, stringifyRoadmap, parseRoadmap } from "./_shared.js".
      Define and export validateRoadmapDoc(doc, reqIds) returning { ok:true } on success or { ok:false, code, error }, where reqIds is a Set of valid REQ-IDs (from parseRequirements). Fail with: code ROADMAP_UNPARSEABLE when doc is falsy or !Array.isArray(doc.phases); and for each phase in doc.phases reject with EMPTY_GOAL when goal is missing/blank; EMPTY_REQUIREMENTS when requirements is an empty array; UNKNOWN_REQ_ID when any phase.requirements entry is not in the reqIds Set (name the offending id in error); DUPLICATE_SLUG when slugify(name) is already used by an earlier phase in the array; DUPLICATE_NAME when a phase name is byte-equal to an earlier phase's name.
      Define and export renumber(phases) returning a NEW array where each phase gets n = index+1 (never mutate the input).
      Define and export applyPhaseAction(doc, action, opts) where opts = { reqIds, activePhase, confirm }, activePhase is a number|null, confirm is a boolean. Work on a fresh deep copy of doc.phases and dispatch on action.op. Every op returns { ok:false, code, error } on hard failure (input never mutated) or { ok:true, doc } where doc = { milestoneName: doc.milestoneName, version: doc.version, phases: mutated }, and doc.phases must deep-equal parseRoadmap(stringifyRoadmap(doc)).phases (round-trip invariant, D-05).
      For THIS task implement ONLY the 'add' branch: action = { op:'add', name, goal, requirements, status? }. Push { n: (existing max n) + 1, or 1 when phases is empty, slug: slugify(name), name, goal, requirements, status: action.status === 'Complete' ? 'Complete' : 'pending' }, then run validateRoadmapDoc on the resulting doc and, on failure, return its { ok:false, code, error } verbatim. Do NOT yet implement insert/remove/reorder/edit.
    </action>
    <verify>node --input-type=module -e "import {applyPhaseAction} from './lib/phase-management.js'; import {parseRoadmap,stringifyRoadmap} from './lib/_shared.js'; const doc={milestoneName:'M',version:'v1',phases:[{n:1,slug:'a',name:'A',goal:'g',requirements:['X-01'],status:'pending'}]}; const r=applyPhaseAction(doc,{op:'add',name:'B',goal:'g2',requirements:['X-02']},{reqIds:new Set(['X-01','X-02']),activePhase:null,confirm:false}); if(!r.ok) throw new Error(JSON.stringify(r)); if(parseRoadmap(stringifyRoadmap(r.doc)).phases.length!==2) throw new Error('round-trip failed'); console.log('TRACER OK')"
    </verify>
    <acceptance_criteria>
      - grep "export function validateRoadmapDoc" in lib/phase-management.js (exit 0)
      - grep "export function applyPhaseAction" in lib/phase-management.js (exit 0)
      - grep "stringifyRoadmap" and "parseRoadmap" imports in lib/phase-management.js (exit 0)
      - the node verify command above exits 0
    </acceptance_criteria>
    <done>The pure module exists with validateRoadmapDoc, renumber, and a working add branch; a sample add round-trips through parseRoadmap/stringifyRoadmap yielding 2 phases.</done>
  </task>
  <task type="auto">
    <name>Task 2: Implement insert, remove, reorder, edit branches plus all destructive guards</name>
    <files>lib/phase-management.js</files>
    <read_first>lib/phase-management.js, lib/_shared.js, #52-CONTEXT.md decisions D-03/D-07/D-08</read_first>
    <action>
      Extend the applyPhaseAction dispatch in lib/phase-management.js (read the file first) to add four more branches, all of which run validateRoadmapDoc on the mutated doc before returning ok and return its { ok:false, code, error } verbatim on failure (D-06, fail-closed). Keep every branch operating on a deep copy so the input doc is never mutated.
      insert: action = { op:'insert', at, name, goal, requirements, status? }. When at is not an integer or at < 0 or at > phases.length, return { ok:false, code:'INVALID_INDEX', error }. Otherwise build the new phase object { slug: slugify(name), name, goal, requirements, status: status === 'Complete' ? 'Complete' : 'pending' } and splice it into the copy at 0-based index at, then apply renumber(phases) so n are contiguous 1..N (OQ-1), then validateRoadmapDoc.
      remove: action = { op:'remove', n, confirm }. Locate target by p.n === n; when absent return { ok:false, code:'NO_SUCH_PHASE', error }. If target.status === 'Complete' return { ok:false, code:'COMPLETE_PHASE_LOCKED', error } (D-03 — a shipped phase is never removable). If Number(target.n) === activePhase and confirm is not true, return { ok:false, code:'ACTIVE_REMOVE_REQUIRES_YES', error } (D-08). Else if confirm is not true and exactly one non-Complete phase remains in the doc (counting the pending phases after removal), return { ok:false, code:'LAST_PENDING_REQUIRES_YES', error } (D-08 — removing the last non-shipped phase needs confirmation). Otherwise filter the target out and apply renumber(phases).
      reorder: action = { op:'reorder', n, to, confirm }. Locate target by p.n === n (NO_SUCH_PHASE when absent). If target.status === 'Complete' return { ok:false, code:'COMPLETE_PHASE_LOCKED', error } (D-03). If Number(target.n) === activePhase return { ok:false, code:'ACTIVE_REORDER_BLOCKED', error } (D-03 — the in-flight phase may not be reordered; no --yes escape). When to is not an integer or to < 0 or to >= phases.length return { ok:false, code:'INVALID_INDEX', error }. Otherwise move the target to 0-based index to and apply renumber(phases).
      edit: action = { op:'edit', n, name?, goal?, requirements?, status? }. Locate target by p.n === n (NO_SUCH_PHASE). Apply to a copy of the phase only the fields that are provided: name (recompute slug via slugify(name)), goal, requirements, and status (must be 'Complete' or 'pending', else { ok:false, code:'INVALID_STATUS', error }). Edits are allowed on any phase including Complete and active (D-03 only blocks reorder/remove); the status toggle pending <-> Complete is permitted (D-07). Then run validateRoadmapDoc on the mutated doc so an empty goal, empty requirements, unknown REQ-ID, duplicate name, or duplicate slug from the edit still hard-fails (D-04).
      Make sure the dispatcher routes on action.op with a final else returning { ok:false, code:'UNKNOWN_ACTION', error }.
    </action>
    <verify>node --test test/phase-management.test.mjs 2>&1 || node --input-type=module -e "import {applyPhaseAction} from './lib/phase-management.js'; const doc={milestoneName:'M',version:'v1',phases:[{n:1,slug:'a',name:'A',goal:'g1',requirements:['X-01'],status:'pending'},{n:2,slug:'b',name:'B',goal:'g2',requirements:['X-02'],status:'Complete'}]}; const r=applyPhaseAction(doc,{op:'reorder',n:2,to:0,confirm:false},{reqIds:new Set(['X-01','X-02']),activePhase:null,confirm:false}); console.log(JSON.stringify(r)); if(r.ok!==false||r.code!=='COMPLETE_PHASE_LOCKED') throw new Error('guard failed')"
    </verify>
    <acceptance_criteria>
      - grep "op === 'insert'" and "op === 'remove'" and "op === 'reorder'" and "op === 'edit'" in applyPhaseAction (exit 0)
      - grep "COMPLETE_PHASE_LOCKED" and "ACTIVE_REMOVE_REQUIRES_YES" and "LAST_PENDING_REQUIRES_YES" and "ACTIVE_REORDER_BLOCKED" and "INVALID_INDEX" and "NO_SUCH_PHASE" in lib/phase-management.js (exit 0)
      - grep "renumber(" called after every insert/remove/reorder mutation in applyPhaseAction (exit 0)
      - a reorder of a Complete phase returns { ok:false, code:'COMPLETE_PHASE_LOCKED' }
    </acceptance_criteria>
    <done>All five op branches dispatch correctly with the D-03/D-08 guards and contiguous renumbering; every branch is fail-closed (returns ok:false before ok on hard failure).</done>
  </task>
  <task type="auto">
    <name>Task 3: Write exhaustive pure unit tests for all CRUD actions, guards, and invariants</name>
    <files>test/phase-management.test.mjs</files>
    <read_first>test/_shared.test.mjs, lib/phase-management.js</read_first>
    <action>
      Create test/phase-management.test.mjs using node:test and assert/strict (mirror the structure of test/_shared.test.mjs — read it first). Import { validateRoadmapDoc, renumber, applyPhaseAction } from "../lib/phase-management.js" and { stringifyRoadmap, parseRoadmap } from "../lib/_shared.js". Use a small helper that builds a sample doc (e.g. [{n:1,slug:'a',name:'A',goal:'g1',requirements:['X-01'],status:'pending'},{n:2,slug:'b',name:'B',goal:'g2',requirements:['X-02'],status:'Complete'}]) and a reqIds Set ['X-01','X-02'].
      Cover: add assigns n = max+1 and appears in both the phase table and ## Progress table after parseRoadmap(stringifyRoadmap(result)); add with status 'Complete' yields status Complete; insert lands at the given 0-based index and renumbers all phases contiguously (n = index+1) and round-trips; insert with out-of-range at returns INVALID_INDEX; remove deletes the phase, renumbers, and the removed phase is absent from both tables; remove of a Complete phase returns COMPLETE_PHASE_LOCKED; remove of the active phase (activePhase = its n) without confirm returns ACTIVE_REMOVE_REQUIRES_YES and with confirm:true succeeds; remove of the last pending phase without confirm returns LAST_PENDING_REQUIRES_YES; reorder moves a pending non-active phase to the target index and renumbers; reorder of a Complete phase returns COMPLETE_PHASE_LOCKED; reorder of the active phase returns ACTIVE_REORDER_BLOCKED; reorder to an out-of-range index returns INVALID_INDEX; edit of name, goal, requirements, and status toggle all round-trip (status flips Complete <-> pending); edit to an empty goal returns EMPTY_GOAL; edit to an empty requirements array returns EMPTY_REQUIREMENTS; a phase referencing a req not in reqIds returns UNKNOWN_REQ_ID; two phases with the same slugify(name) return DUPLICATE_SLUG; two phases with the same name return DUPLICATE_NAME; renumber() returns a fresh array leaving the input unchanged. For every hard-failure case assert the input doc is deep-equal to its pre-call value (fail-closed unmutated, D-06), e.g. assert.deepEqual(doc, before) after the call returns ok:false.
      Ensure the whole suite passes.
    </action>
    <verify>node --test test/phase-management.test.mjs
    </verify>
    <acceptance_criteria>
      - node --test test/phase-management.test.mjs exits 0
      - grep "COMPLETE_PHASE_LOCKED" and "ACTIVE_REMOVE_REQUIRES_YES" and "LAST_PENDING_REQUIRES_YES" and "ACTIVE_REORDER_BLOCKED" appear in test/phase-management.test.mjs (exit 0)
      - at least one assert.deepEqual(doc-before, doc-after) fail-closed check per hard-failure case
    </acceptance_criteria>
    <done>test/phase-management.test.mjs proves every CRUD action, guard code, invariant code, and the fail-closed unmutated-input property; the pure suite passes under node --test.</done>
  </task>
</tasks>

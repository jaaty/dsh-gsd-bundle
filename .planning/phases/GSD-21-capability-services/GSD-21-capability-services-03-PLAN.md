---
phase: 21-capability-services
plan: 03
type: execute
wave: 2
depends_on:
  - "GSD-21-capability-services-01"
files_modified:
  - lib/commands.js
autonomous: true
requirements: ["DEGR-03"]
user_setup: []
must_haves:
  truths:
    - With all capabilities provided, applying gsd-commands registers exactly the 12 /gsd-* commands through per-command sub-fibers, each gated on its step capability key.
    - When a step capability is absent at load, its slash command is NEVER registered (no dangling command), while the commands of present capabilities still register.
    - The COMMANDS declarative array and the build()/phaseNum()/send() helpers are reused unchanged; gsdJobs (no slash command) has no command sub-fiber.
  artifacts:
    - path: "lib/commands.js"
      provides: "Refactored apply: for each /gsd-* command, one ctx.inject([capabilityKey, 'commands'], apply) sub-fiber whose apply registers that single command via ctx.commands.register(...) and returns the disposer (D-07/D-08)."
      min_lines: 45
      exports: ["name", "inject", "apply"]
  key_links:
    - from: "lib/commands.js"
      to: "lib/_capabilities.js"
      via: "import { buildCapability, CAPABILITY_KEYS } (or a lookup) to pair each COMMANDS entry with its owning capability key"
      pattern: "ctx\\.inject\\(\\[?capabilityKey"
    - from: "lib/commands.js"
      to: "ctx.commands"
      via: "each per-command sub-fiber apply calls ctx.commands.register(...) and returns the disposer"
      pattern: "ctx\\.commands\\.register"
---
<objective>
Refactor lib/commands.js (DEGR-03, D-07/D-08) so each of the /gsd-* commands is registered by its own sub-fiber whose inject is [capabilityKey, "commands"], created via the REAL Cordis API ctx.inject([...], apply) (alias for ctx.plugin, per RESEARCH Q-1 -- NOT the non-existent ctx.use). Retiring a step capability reactively deactivates that command's sub-fiber and truly unregisters the command; an absent capability leaves the sub-fiber inactive so the command is never registered. The COMMANDS array and build()/phaseNum()/send() helpers stay unchanged; only apply is rewired.
</objective>
<context>
- @lib/commands.js -- current single-apply wraps all 12 ctx.commands.register in one ctx.effect (lines 16-17, 182-198); COMMANDS + helpers reused verbatim
- @lib/_capabilities.js -- descriptor builder + keys from Plan 01; each descriptor carries .commands[] to pair commands with capability keys
- @lib/core-tools.js / step plugins -- provide the 10 capabilities (Plan 02); gsdJobs owns no slash command so has no sub-fiber
- @CONTEXT.md -- D-07 (per-command sub-fiber injecting [capabilityKey,'commands']), D-08 (COMMANDS stays declarative, wrap each entry)
- @RESEARCH.md -- 1.2 (use ctx.inject/ctx.plugin, not ctx.use), 1.6 (load order, single-use disposer, no double-registration)
</context>
<tasks>
  <task type="auto">
    <name>Task 1 (tracer): introduce a per-command sub-fiber and wire commands to capability keys</name>
    <files>lib/commands.js</files>
    <read_first>lib/commands.js, lib/_capabilities.js</read_first>
    <action>
      In lib/commands.js, keep const name = "gsd-commands";, const inject = ["commands"];, phaseNum, send, and the full COMMANDS array exactly as they are (D-08). Do not change command definitions or helpers.

      Rewrite the apply(ctx) body:
      - Add a capability-key pairing so each command maps to its owning capability: gsd-init/gsd-status/gsd-progress/gsd-new-milestone -> gsdOrient; gsd-discuss-phase -> gsdDiscuss; gsd-ui-phase -> gsdUi; gsd-plan-phase -> gsdPlan; gsd-execute-phase -> gsdExecute; gsd-verify-work -> gsdVerify; gsd-ship -> gsdShip; gsd-quick -> gsdQuick; gsd-map-codebase -> gsdMapCodebase. Build this lookup from lib/_capabilities.js (import buildCapability or CAPABILITY_KEYS) or as a local const -- the pairing is the D-08 contract.

      - Replace the single ctx.effect(...) that registered all 12 commands with a loop over COMMANDS. For each command c, start a per-command sub-fiber via ctx.inject([capKey, "commands"], (subCtx) => { ... }). Inside the sub-fiber apply, register EXACTLY that one command with the same registration object shape (name, description, optional { input: { hint } }, and the same handler: build from invocation.rawInput, guard invocation.agent, send via send(), return success ack or error). Return the disposer from ctx.commands.register(...) so the sub-fiber's unload truly unregisters that one command (D-07).

      CRITICAL: the CONTEXT D-07 text writes "ctx.use", but RESEARCH Q-1 establishes ctx.use does not exist in Cordis 4.0.1. Implement D-07's contract using the real API ctx.inject(injectArray, callback) (alias for ctx.plugin({inject, apply})). The sub-fiber inject array is [capKey, "commands"]. When the step capability is absent at load, the sub-fiber stays inactive and the command is never registered. gsdJobs has .commands=[] so contributes no sub-fiber. The apply must be synchronous so the offline mount harness (Plan 04) registers commands when capabilities are present.
    </action>
    <verify>node -e "import('./lib/commands.js').then(m => { if (typeof m.apply !== 'function') process.exit(1); console.log('commands.js parses'); })"
    
    </verify>
    <acceptance_criteria>
      - grep-verifiable in lib/commands.js: an apply body that calls ctx.inject( with an array starting or containing a capability key.
      - grep-verifiable: ctx.commands.register( still called (inside the sub-fiber).
      - grep-verifiable: COMMANDS array still declared with all 12 entries; build/phaseNum/send still exported or defined.
    </acceptance_criteria>
    <done>lib/commands.js apply rewires to per-command sub-fibers via ctx.inject, pairing each command with its capability key, and the module still parses.</done>
  </task>
  <task type="auto">
    <name>Task 2: verify command count and reactivity against the mount fake-ctx (present-path)</name>
    <files>lib/commands.js</files>
    <read_first>lib/commands.js, test/mount.test.mjs</read_first>
    <action>
      Confirm the refactor registers exactly 12 commands when all capabilities are present by exercising lib/commands.js against a minimal fake ctx that provides ctx.commands.register (array push) and ctx.inject.

      Build a temporary throwaway check (a node -e script, not a committed file) with:
      - commands = []; commands.register = (c) => commands.push(c);
      - capabilityKeys present as a Map/object with all 10 keys set to a truthy descriptor (or import CAPABILITY_KEYS from ./lib/_capabilities.js and provide each).
      - ctx.inject = (keys, cb) => { if (keys.includes("commands") && keys.some(k => k !== "commands" && !provided.has(k))) return ()=>{ }; const d = cb(ctx); return typeof d === "function" ? d : ()=>{ }; };
      Apply lib/commands.js apply(ctx), then assert commands.length === 12 and every EXPECTED_COMMAND_NAMES entry (the 12 names from test/mount.test.mjs) is present.

      The purpose is to catch wiring errors (missing sub-fiber, wrong inject resolution) before the mount test refactor lands in Plan 04.
    </action>
    <verify>node -e "{ const commands=[]; commands.register=(c)=>commands.push(c); const provided=new Map(); provided.set('gsdOrient',{}) ; provided.set('gsdJobs',{}); provided.set('gsdDiscuss',{}); provided.set('gsdUi',{}); provided.set('gsdPlan',{}); provided.set('gsdExecute',{}); provided.set('gsdVerify',{}); provided.set('gsdShip',{}); provided.set('gsdQuick',{}); provided.set('gsdMapCodebase',{}); const ctx={commands, get:(n)=>provided.get(n)}; ctx.inject=(keys,cb)=>{ if(keys.includes('commands') && keys.every(k=>k==='commands'||provided.has(k))){ const d=cb(ctx); return typeof d==='function'?d:()=>{}; } return ()=>{}; }; import('./lib/commands.js').then(async m=>{ await m.apply(ctx,{}); if(commands.length!==12) { console.error('expected 12 got',commands.length); process.exit(1);} console.log('12 commands ok'); }); }"
    
    </verify>
    <acceptance_criteria>
      - The node -e check prints '12 commands ok' (12 commands registered with all capabilities present).
      - No runtime error (the sub-fiber apply ran synchronously).
    </acceptance_criteria>
    <done>The refactored commands.js registers exactly 12 commands through per-command sub-fibers when all 10 capabilities are provided.</done>
  </task>
  <task type="auto">
    <name>Task 3: verify the negative (absent capability) path -- no dangling command</name>
    <files>lib/commands.js</files>
    <read_first>lib/commands.js</read_first>
    <action>
      Re-run the same fake-ctx exercise but with ONE capability deliberately missing (e.g. gsdQuick absent from `provided`). Assert that the command owned by the missing capability -- gsd-quick -- is NOT registered, while the other 11 commands ARE registered. This proves DEGR-03's negative contract ("no dangling commands") without needing the phase-23 removal harness.

      Confirm the absent-capability sub-fiber never runs its apply: with gsdQuick not in `provided`, ctx.inject for the gsd-quick sub-fiber must be a no-op (the presence-gated fake returns an inert disposer and never calls cb), so commands.length === 11 and commands has no name === "gsd-quick".
    </action>
    <verify>node -e "{ const commands=[]; commands.register=(c)=>commands.push(c); const provided=new Map([['gsdOrient',{}],['gsdJobs',{}],['gsdDiscuss',{}],['gsdUi',{}],['gsdPlan',{}],['gsdExecute',{}],['gsdVerify',{}],['gsdShip',{}],['gsdMapCodebase',{}]]); const ctx={commands,get:(n)=>provided.get(n)}; ctx.inject=(keys,cb)=>{ if(keys.includes('commands') && keys.every(k=>k==='commands'||provided.has(k))){ const d=cb(ctx); return typeof d==='function'?d:()=>{}; } return ()=>{}; }; import('./lib/commands.js').then(async m=>{ await m.apply(ctx,{}); const names=commands.map(c=>c.name); if(commands.length!==11 || names.includes('gsd-quick')) { console.error('expected 11 commands without gsd-quick'); process.exit(1);} console.log('absent-capability ok: 11 commands, no gsd-quick'); }); }"
    
    </verify>
    <acceptance_criteria>
      - The node -e check prints 'absent-capability ok' (11 commands registered, gsd-quick absent).
      - The missing capability's command was never registered (no dangling command), DEGR-03 negative contract proven.
    </acceptance_criteria>
    <done>The negative path proves an absent step capability unregisters its slash command while other commands stay registered.</done>
  </task>
</tasks>

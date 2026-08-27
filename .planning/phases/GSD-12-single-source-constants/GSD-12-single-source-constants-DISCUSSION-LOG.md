# Phase 12: single-source-constants — Discussion Log

Interviewed the user on the single-source-constants refactor. Confirmed: (1) move the secretPatterns array to _shared.js as the single source, imported by gates.js and _agents.js; (2) keep GATE_NAMES exported from gates.js and have ship.js import it; (3) route cwdOf through _runner.js in core-tools.js and discuss.js; (4) generate the forbidden-files prose from the canonical array so it cannot drift. All four recommendations accepted.

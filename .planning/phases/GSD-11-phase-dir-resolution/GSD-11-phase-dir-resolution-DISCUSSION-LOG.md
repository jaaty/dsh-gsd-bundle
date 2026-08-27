# Phase 11: phase-dir-resolution — Discussion Log

Interviewed the user on the phase-dir-resolution refactor. Confirmed: (1) add a phaseDirAndBase(cwd, phaseNum) accessor returning {dir, base} and have tools call it once; (2) keep the public artifact accessor signatures stable, resolving dir/base internally once; (3) keep the phase-N fallback for phases absent from the roadmap; (4) include listPlans in the cleanup since it resolves dir/base twice in one method. All four recommendations accepted.

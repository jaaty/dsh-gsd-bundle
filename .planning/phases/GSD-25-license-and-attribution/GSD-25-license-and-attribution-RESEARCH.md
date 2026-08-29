I have all the facts I need. Here is the full RESEARCH.md.

---

# GSD-25-license-and-attribution — Research

**Phase goal:** Add an MIT LICENSE file, verify opengsd-core attribution and license compliance, and fix the broken gsd-core-reference.md reference in the README.
**Requirements:** PUB-01, PUB-02.

---

## Domain analysis

### 1. MIT LICENSE file (PUB-01)
- The MIT license is a single-file, permissive license. GitHub auto-detects it when the file is named `LICENSE`, `LICENSE.md`, or `LICENSE.txt` at the repo root, and the SPDX id is `MIT`. [VERIFIED: GitHub API `licenses/mit`; training knowledge on GitHub license detection]
- The canonical MIT text is fixed; the only project-specific line is the copyright line, conventionally `Copyright (c) <year> <holder>`. [ASSUMED — standard practice]
- **Pitfall:** the copyright line must match the holder the project actually wants to assert. Here the decision (D-01) fixes it as `Copyright (c) 2026 jaaty` (the repo owner's GitHub handle). [VERIFIED: CONTEXT.md D-01]
- **Pitfall:** `package.json` `"license": "MIT"` must be consistent with the LICENSE file. It already is (line 69) — the phase only verifies, does not change. [VERIFIED: package.json line 69 read this session]
- **npm packaging note:** npm always includes `package.json`, `README`, `LICENSE`/`LICENCE`, and the `main` file in a published tarball regardless of the `files` array. So the LICENSE file will ship in the npm package even though it is not listed in `files`. [VERIFIED: `npm help package-json` (npm 11.14.0) — "Certain files are always included, regardless of settings: package.json, README, LICENSE / LICENCE, The file in the main field"]

### 2. opengsd-core attribution & license compliance (PUB-02)
- opengsd-core is MIT-licensed. Verified via the GitHub API: `spdx_id: "MIT"`, and the LICENSE body decodes to `MIT License` / `Copyright (c) 2026 Open GSD`. [VERIFIED: `curl https://api.github.com/repos/open-gsd/gsd-core/license` returned `"spdx_id": "MIT"` and base64 body decoding to `Copyright (c) 2026 Open GSD`]
- The bundle condenses role prompts faithfully from opengsd's `agents/*.md` (derived content, per README line 180). MIT requires preserving the copyright and permission notice in substantial portions of the software. Because the derived content is substantial, attribution is required. [VERIFIED: README.md line 180 read this session; MIT license terms]
- **Standard practice** for MIT-derived work is a `NOTICE` file (or a header) carrying the upstream copyright + license notice, plus README prose. The decision (D-02/D-03) mandates a NOTICE file plus the existing README prose — belt-and-suspenders. [VERIFIED: CONTEXT.md D-02/D-03]
- **Pitfall:** a NOTICE file is NOT auto-included in the npm tarball (npm's always-included list is only package.json, README, LICENSE/LICENCE, main). To ship NOTICE in the published package it must be added to the `files` array in package.json. [VERIFIED: `npm help package-json`; package.json `files` array read this session — currently `["lib/*.js", "cordis.patch.yml", "README.md"]`]
- **Pitfall:** the NOTICE must not misstate the upstream copyright. The correct upstream line is `Copyright (c) 2026 Open GSD` (not "jaaty"). [VERIFIED: GitHub API license body]

### 3. Broken gsd-core-reference.md reference (PUB-02)
- README line 193 currently reads: `The reference used to build this is in \`gsd-core-reference.md\` (compiled from the opengsd-core \`next\` branch).` The file was never committed and is compiled from opengsd-core content. [VERIFIED: README.md line 193 read this session]
- Decision D-04: remove the reference and replace it with a link to the opengsd-core repo (`github.com/open-gsd/gsd-core`). Do NOT regenerate or commit the file. [VERIFIED: CONTEXT.md D-04]
- Existing prose attribution already links `https://github.com/open-gsd/gsd-core` at README lines 3 and 180 — keep those. [VERIFIED: README.md lines 3, 180 read this session]
- **Pitfall:** the replacement link should be a real, working URL. `https://github.com/open-gsd/gsd-core` is confirmed live (the GitHub API returned its license). [VERIFIED: GitHub API]

### 4. No new dependencies
- This phase is pure file additions/edits (LICENSE, NOTICE, README edit, optional package.json `files` edit). No runtime or dev dependency is introduced. [ASSUMED — scope of the phase]

---

## Package legitimacy

No new packages are proposed. The only "dependency" referenced is the upstream project opengsd-core, which is not installed as a package — it is the source of derived content.

- **opengsd-core** — MIT, `Copyright (c) 2026 Open GSD`. [VERIFIED: GitHub API `repos/open-gsd/gsd-core/license` → `spdx_id: "MIT"`; body decodes to `MIT License` / `Copyright (c) 2026 Open GSD`]
- **npm `files` always-included behavior** — package.json, README, LICENSE/LICENCE, main file. [VERIFIED: `npm help package-json` on npm 11.14.0]

---

## Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| NOTICE file silently omitted from the published npm tarball | Medium | Add `"NOTICE"` to the `files` array in package.json (LICENSE is auto-included, NOTICE is not). |
| NOTICE misstates the upstream copyright holder | Medium | Use the verified upstream line `Copyright (c) 2026 Open GSD` in NOTICE; use `Copyright (c) 2026 jaaty` only in the bundle's own LICENSE. |
| LICENSE copyright line diverges from package.json `license` | Low | package.json already `"license": "MIT"` (line 69); phase verifies consistency, no change. |
| Re-introducing the broken `gsd-core-reference.md` reference | Low | D-04 forbids regenerating/committing the file; replace the reference with a live repo link. |
| GitHub failing to detect the license | Low | Use the exact filename `LICENSE` at repo root (GitHub-recognized). |

---

## Open Questions

- **Q1 (RESOLVED):** What copyright line goes in the bundle's LICENSE? → `Copyright (c) 2026 jaaty` (D-01, fixed). [VERIFIED: CONTEXT.md D-01]
- **Q2 (RESOLVED):** What copyright line goes in the NOTICE for opengsd-core? → `Copyright (c) 2026 Open GSD` (the verified upstream line). [VERIFIED: GitHub API license body]
- **Q3 (RESOLVED):** Does the NOTICE need to be added to the npm `files` array? → Yes, because npm does not auto-include NOTICE. [VERIFIED: `npm help package-json`]
- **Q4 (RESOLVED):** Should the README replacement link be inline or a footnote? → Claude's Discretion; either is acceptable, inline is simpler and matches the existing inline links at lines 3/180. [VERIFIED: CONTEXT.md "Claude's Discretion"]
- **Q5 (RESOLVED):** Where do LICENSE and NOTICE live? → Repo root (Claude's Discretion; repo root is the GitHub-recognized location and the npm auto-include location). [VERIFIED: CONTEXT.md "Claude's Discretion"; npm docs]

No open questions remain.

---

## Architectural Responsibility Map

This phase is entirely **presentation/documentation** tier — no domain, data, or integration code changes.

| Capability | Tier | Notes |
|------------|------|-------|
| LICENSE file (PUB-01) | presentation (repo metadata) | Repo-root file; no code. |
| NOTICE file (PUB-02) | presentation (repo metadata) | Repo-root file; no code. |
| README reference fix (PUB-02) | presentation (docs) | Edit README line 193. |
| package.json `files` addition for NOTICE | presentation (package metadata) | Edit package.json `files` array; `license` field unchanged. |
| Verification test | domain (test) | A `node --test` test asserting file existence + consistency. |

No security-sensitive capability is placed in the wrong tier. No tier assignment is a blocker.

---

## Validation Architecture

Automated checks (run via `npm test`, i.e. `node --test test/*.test.mjs`):

1. **LICENSE exists and is MIT** — assert `LICENSE` exists at repo root, its content contains `MIT License` and `Copyright (c) 2026 jaaty`. Proves PUB-01.
2. **NOTICE exists and credits opengsd-core** — assert `NOTICE` exists and contains `opengsd-core` and `Copyright (c) 2026 Open GSD`. Proves PUB-02 attribution.
3. **package.json license consistency** — assert `package.json.license === "MIT"` and that the LICENSE file's SPDX text matches. Proves D-05.
4. **README reference fixed** — assert README no longer contains `gsd-core-reference.md` and that it links `https://github.com/open-gsd/gsd-core`. Proves D-04.
5. **NOTICE ships in the package** — assert `package.json.files` includes `"NOTICE"` (guards the npm-tarball omission risk).

Test style follows the existing suite: `node:test` + `node:assert/strict`, files named `test/*.test.mjs`. [VERIFIED: test/ dir contents and mount.test.mjs head read this session]

---

## Project Constraints

- Test command is `npm test` → `node --test test/*.test.mjs`. [VERIFIED: package.json line 8]
- Tests use `node:test` with `assert/strict`; helpers live in `test/helpers/`. [VERIFIED: test/helpers/ and mount.test.mjs]
- The phase runs on feature branch `phase-25` (current branch). [VERIFIED: `git branch --show-current` → `phase-25`]
- `.gitignore` currently contains only `node_modules/` — LICENSE and NOTICE will be tracked (not ignored). [VERIFIED: .gitignore read this session]
- package.json `files` array currently `["lib/*.js", "cordis.patch.yml", "README.md"]`; LICENSE is auto-included by npm, NOTICE must be added. [VERIFIED: package.json lines 52–56; npm docs]
- Do NOT regenerate or commit `gsd-core-reference.md` (D-04). [VERIFIED: CONTEXT.md D-04]
- Do NOT change the `license` field in package.json (already MIT, D-05). [VERIFIED: CONTEXT.md D-05]
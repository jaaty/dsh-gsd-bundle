# Phase 25: license-and-attribution - Context

**Gathered:** 2026-08-29T02:40:15.161Z
**Status:** Ready for planning

<domain>
## Phase Boundary
**In scope:** Add a standard MIT LICENSE file (Copyright (c) 2026 jaaty) so GitHub detects the license and users can legally use, modify, and redistribute the bundle. Verify opengsd-core is MIT (user-confirmed) and add proper attribution for the derived content (role prompts condensed from opengsd's agents/*.md) via a NOTICE file plus the existing README prose. Fix the broken gsd-core-reference.md reference in the README by removing it and replacing it with a link to the opengsd-core repo. Confirm package.json's "license": "MIT" matches the new LICENSE file.
**Out of scope:** Regenerating or committing gsd-core-reference.md. Changing the package.json license field (already MIT). The .planning/ directory keep-vs-gitignore-vs-curate decision (phase 26 repo-hygiene). CI workflow and full-history secret scan (phase 27 ci-and-security). npm publishing / distribution research (phase 28 publish-research).
</domain>

<decisions>
## Decisions
### LICENSE file
- **D-01:** Add a standard MIT LICENSE file with the copyright line 'Copyright (c) 2026 jaaty' (the repo owner's GitHub handle). This makes GitHub detect the license and satisfies PUB-01.
- **D-05:** package.json already declares "license": "MIT" — no change needed there; the phase verifies it matches the new LICENSE file.
### opengsd-core attribution & license compliance
- **D-02:** opengsd-core is MIT (user-confirmed via https://github.com/open-gsd/gsd-core?tab=MIT-1-ov-file). Because the bundle condenses role prompts faithfully from opengsd's agents/*.md (derived content), MIT attribution is required and is satisfied by a NOTICE file plus the existing README prose.
- **D-03:** Add a NOTICE file crediting opengsd-core (MIT) with its copyright/license notice, and keep the README's prose attribution to opengsd-core. Belt-and-suspenders attribution.
### Broken gsd-core-reference.md reference
- **D-04:** Fix the broken gsd-core-reference.md reference in the README (line 193) by removing it and replacing it with a link to the opengsd-core repo (github.com/open-gsd/gsd-core). Do NOT regenerate or commit the file — it was never committed and is compiled from opengsd-core content.
### Claude's Discretion
- Exact wording of the NOTICE file and the README link replacement.
- Whether the README link is inline or a footnote.
- The precise placement of the LICENSE and NOTICE files (repo root).
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Existing license declaration
- `package.json — "license": "MIT" (line 69)`
### README reference + attribution
- `README.md — line 193 gsd-core-reference.md reference; lines 3, 180 prose attribution to opengsd-core`
### opengsd-core license
- `https://github.com/open-gsd/gsd-core?tab=MIT-1-ov-file — opengsd-core MIT license (user-confirmed)`
</canonical_refs>

<code_context>
## Code Context
- README.md line 193: 'The reference used to build this is in `gsd-core-reference.md` (compiled from the opengsd-core `next` branch).' — the broken reference to remove/replace.
- README.md lines 3, 180: existing prose attribution to opengsd-core (github.com/open-gsd/gsd-core) — keep.
- package.json line 69: "license": "MIT" — already correct, verify it matches the new LICENSE file.
- No LICENSE or NOTICE file currently exists in the repo root.
</code_context>

<specifics>
## Specifics
- Copyright holder: GitHub handle 'jaaty', year 2026.
- opengsd-core is MIT (user-confirmed): https://github.com/open-gsd/gsd-core?tab=MIT-1-ov-file.
- Remove/link the gsd-core-reference.md reference rather than regenerate the file.
- Attribution via NOTICE file + README prose.
</specifics>

<deferred>
## Deferred Ideas
- Regenerating gsd-core-reference.md (if ever needed).
- The .planning/ directory keep-vs-gitignore-vs-curate decision (phase 26 repo-hygiene).
- CI workflow and full-history secret scan (phase 27 ci-and-security).
- npm publishing / distribution research (phase 28 publish-research).
</deferred>


---

*Phase: 25-license-and-attribution*
*Context gathered: 2026-08-29*
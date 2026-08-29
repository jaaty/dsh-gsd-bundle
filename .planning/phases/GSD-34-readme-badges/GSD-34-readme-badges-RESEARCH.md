# RESEARCH.md

## Domain Analysis
The objective is to add provenance and health badges to the `README.md` of the `@dsh-gsd/bundle` repository. Badges are typically implemented as Markdown images linking to a badge-generating service (primarily Shields.io) or a native platform (GitHub Actions).

### Badge Specifications
- **CI Status**: GitHub Actions provides native badges for workflows. The badge URL follows the pattern `https://github.com/<owner>/<repo>/actions/workflows/<workflow_file>/badge?branch=<branch>`. [VERIFIED: .github/workflows/ci.yml]
- **License**: Shields.io is the industry standard for license badges. The pattern is `https://img.shields.io/github/license/<owner>/<repo>?style=flat-square`. [CITED: https://shields.io/category/software-licenses]
- **npm Version**: Shields.io provides a dynamic npm version badge. The pattern is `https://img.shields.io/npm/v/<package>?style=flat-square`. [CITED: https://shields.io/category/npm]

### Confidence Levels
- **CI Badge**: High. GitHub native badges are deterministic based on the workflow filename.
- **License Badge**: High. Standard Shields.io implementation for GitHub repos.
- **npm Badge**: High. Standard Shields.io implementation for registered npm packages.

## Package Legitimacy
No new dependencies are being added to the codebase. All proposed badges are hosted externally via:
- **GitHub Actions** (Native) [VERIFIED: .github/workflows/ci.yml]
- **Shields.io** (Standard community service) [ASSUMED]

## Risks and Open Questions
### Risks
- **Badge Breaking**: If the CI workflow filename `.github/workflows/ci.yml` is changed, the badge will break.
- **npm Package Name**: The badge depends on the exact npm package name `@dsh-gsd/bundle`. [VERIFIED: package.json line 2]

### Open Questions
- None. All parameters (owner, repo, package name, workflow name) are resolved. (RESOLVED)

## Architectural Responsibility Map

| Capability | Tier | Responsibility |
| :--- | :--- | :--- |
| Badge URL Generation | Presentation | Constructing the Markdown syntax in `README.md`. |
| CI State Tracking | Integration | GitHub Actions workflow reporting the status to the badge URL. |
| Version Tracking | Integration | npm registry reporting the latest version to the badge URL. |
| License Tracking | Integration | GitHub License detection reporting to the badge URL. |

## Validation Architecture
Since this is a documentation-only change, automated "tests" are limited to visual and link verification:
1. **Link Integrity**: Manually verify that each badge URL resolves to a valid image.
2. **Hyperlink Target**: Verify that clicking the badge leads to the correct destination (CI workflow page, License file, and npm registry page).
3. **Visual Alignment**: Verify the badges are placed immediately below the `# dsh-gsd-bundle` header as per D-01 and use `flat-square` style as per D-02.

## Project Constraints
- **Provenance**: All changes must be committed to the phase branch `phase-34`. [VERIFIED: CONTEXT.md]
- **Style**: Must adhere to the `flat-square` style for all Shields.io badges. [VERIFIED: CONTEXT.md D-02]

## Resolved Parameters
- **Owner**: `jaaty` [VERIFIED: bash git remote -v]
- **Repo**: `dsh-gsd-bundle` [VERIFIED: bash git remote -v]
- **Package**: `@dsh-gsd/bundle` [VERIFIED: package.json line 2]
- **Workflow**: `ci.yml` [VERIFIED: .github/workflows/ci.yml line 1]
- **Branch**: `main` [VERIFIED: .github/workflows/ci.yml line 6]
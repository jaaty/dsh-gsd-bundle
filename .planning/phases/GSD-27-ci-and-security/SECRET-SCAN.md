# Phase 27 — Full-History Secret Scan Report

**Plan:** GSD-27-ci-and-security-02
**Requirement:** PUB-04
**Decision:** D-05 (tool), D-06 (one-time audit documented here)
**Date:** 2026-08-29

## Tool

[gitleaks](https://github.com/gitleaks/gitleaks) **v8.30.1** (standalone linux x86_64 binary; the official gitleaks Docker image `zricethezav/gitleaks` is used for the per-PR CI guard in `.github/workflows/ci.yml` — see plan 01 — but there is no `docker` binary in this sandbox, so the standalone binary was used for this one-time audit).

## Command

```sh
gitleaks detect --source . --log-opts="--all" --report-path gitleaks-report.json --report-format json -v
```

`--log-opts="--all"` instructs git to traverse every commit across all branches and refs, so the scan covers the **entire git history**, not just the current branch tip.

## Scope

- Entire git history across all branches and refs.
- **241 commits scanned** (~3.45 MB of diff content) in ~560 ms.
- `cordis.patch.yml` (tracked, mode 600) — a candidate secret-bearing file — was included in the scan; it is committed history and therefore traversed by `--all`.

## Result

**Result: no credentials or tokens are exposed in the git history.**

The gitleaks report is empty (`[]`):

```json
[]
```

gitleaks logged:

```
INF 241 commits scanned.
INF scanned ~3449493 bytes (3.45 MB) in 560ms
INF no leaks found
```

No findings were produced, so no triage (real secret vs. test fixture/placeholder) was required, and no real secret was committed.

## Future-leak prevention

A lightweight gitleaks CI guard job in `.github/workflows/ci.yml` (added in plan 01) scans each pull request's commit range and fails CI if a new secret is introduced. This one-time full-history audit is **not** a per-PR gate; it is the audit confirming the historical baseline is clean, after which the per-PR guard maintains that baseline.

---

*Phase: 27-ci-and-security · Plan 02 · Full-history gitleaks audit*
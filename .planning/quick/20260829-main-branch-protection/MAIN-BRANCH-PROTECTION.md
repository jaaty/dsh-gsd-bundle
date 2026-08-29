# Quick-task audit — `main` branch protection

Date: 2026-08-29
Repo: `jaaty/dsh-gsd-bundle`
Scope: Audit record only — no code changes. `main` stays clean.

## 1. Prior state

- The repository is **public**.
- `main` was previously **unprotected** in the classic sense: there was no
  classic branch protection.
- The only ruleset, **id `21255790`**, was incomplete — it covered
  `deletion` + `non_fast_forward` over **all branches**, with no pull-request
  or status-check requirement.

## 2. Updated policy (ruleset id `21255790`, "main branch protection")

Applied via
`gh api --method PUT repos/jaaty/dsh-gsd-bundle/rulesets/21255790`:

| Aspect | Value |
| --- | --- |
| target | `branch` → conditions include `refs/heads/main` only |
| enforcement | `active` |
| bypass_actors | `[]` — rules bind repo admins too |
| `pull_request` | PR required before merge; `required_approving_review_count 0`; `dismiss_stale_reviews_on_push true`; `require_code_owner_review false`; `require_last_push_approval false`; `required_review_thread_resolution false` |
| `required_status_checks` | context `"Test"`; `strict_required_status_checks_policy false` |
| `non_fast_forward` | force-push to `main` blocked |
| `deletion` | deleting `main` blocked |

Verified live at `repos/jaaty/dsh-gsd-bundle/rulesets/21255790` on 2026-08-29:
`bypass_actors: []`, `current_user_can_bypass: "never"`, enforcement `active`,
conditions include `["refs/heads/main"]`.

## 3. Decision rationale

- **PR required but no separate approval-count gate** — solo maintainer would
  have to approve their own PR, so `required_approving_review_count 0`.
- **Require the CI `Test` job** as the status check.
- **Enforce for admins too** (`bypass_actors []`) — no silent workaround.
- **Disallow force-push and deletion** of `main`.

## 4. Implementation note

The ruleset API twice rejected the `required_status_checks` parameters with
**HTTP 422** until the exact schema was resolved from the GitHub OpenAPI spec.
The array item's `integration_id` is an **optional integer** field, so
`integration_id: null` tripped strict validation; it was **dropped** and the
request succeeded.

## 5. Config draft

The draft JSON lives at `.planning/quick/branch-protection-ruleset.json`
(gitignored). No tracked-tree changes were made; `main` stays clean.

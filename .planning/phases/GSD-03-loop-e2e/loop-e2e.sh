#!/usr/bin/env bash
#
# loop-e2e.sh — GSD-03-loop-e2e end-to-end driver (plan GSD-03-loop-e2e-02).
#
# Runs ONE real demo phase through the FULL GSD loop inside a freshly booted
# headless DSH session (real LLM subagents via the subagents/spawn service,
# real git, real gh), shipping it as a genuine PR on its own feature branch
# against main (D-01/D-02/D-05/D-06), while re-asserting MOUNT-06 (npm test
# green) in the booted clone (D-07). No offline-harness fallback (D-03): a
# failure anywhere is captured in e2e-proof.md, not papered over.
#
# /tmp is ephemeral across separate bash tool calls (RESEARCH), so the WHOLE
# relocate -> clone -> loop -> PR -> npm-test -> evidence sequence runs inside
# ONE invocation. Each step is a function so it can be driven independently.
set -uo pipefail

DSH_HOME_DIR="${DSH_HOME_DIR:-/tmp/dshhome}"
BUNDLE_ROOT="${BUNDLE_ROOT:-/var/home/jatyeo/dev/dsh-gsd-bundle}"
DEMO_DIR="${DEMO_DIR:-/tmp/demo}"
DEMO_ORIGIN="${DEMO_ORIGIN:-https://github.com/jaaty/dsh-gsd-bundle.git}"
DEMO_BRANCH="${DEMO_BRANCH:-demo-loop-e2e}"
LOOP_LOG="${LOOP_LOG:-/tmp/loop-e2e-boot.log}"
# The four @deepseek-ai peers the bundle resolves (RESEARCH: clean clone lacks
# node_modules; these are the clean-build prerequisite for MOUNT-06).
PEERS=(cordis dsh-llm dsh-tools schemastery)

# Source the plan-01 live-boot recipe for bootstrap_home + compose_check.
LIVE_BOOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./live-boot.sh
# shellcheck disable=SC1091
source "$LIVE_BOOT_DIR/live-boot.sh" 2>/dev/null || {
  # Fall back: bootstrap_home inline if live-boot.sh cannot be sourced.
  echo "WARN: could not source live-boot.sh; defining local bootstrap_home" >&2
  bootstrap_home() {
    local PROFILE_DIR="$DSH_HOME_DIR/profiles/headless"
    rm -rf "$DSH_HOME_DIR"
    mkdir -p "$PROFILE_DIR"
    cat > "$PROFILE_DIR/package.json" <<JSON
{
  "name": "dsh-profile-headless",
  "private": true,
  "dependencies": { "@dsh-gsd/bundle": "link:$BUNDLE_ROOT" },
  "dsh": { "profile": { "bundles": ["@deepseek-ai/dsh-base", "@deepseek-ai/dsh-headless", "@dsh-gsd/bundle"] } }
}
JSON
    cat > "$PROFILE_DIR/cordis.patch.yml" <<'YML'
# User layer for the relocated headless profile (GSD loop-e2e).
[]
YML
    mkdir -p "$PROFILE_DIR/node_modules/@dsh-gsd"
    ln -sfn "$BUNDLE_ROOT" "$PROFILE_DIR/node_modules/@dsh-gsd/bundle"
    if [ -f /var/home/jatyeo/.dsh/settings.yaml ]; then
      cp /var/home/jatyeo/.dsh/settings.yaml "$DSH_HOME_DIR/settings.yaml"
    fi
    echo "bootstrap_home (inline) - profile scaffold ready"
  }
}

step() { printf '\n== %s ==\n' "$*"; }

# ---------------------------------------------------------------------------
# (1) bootstrap_home: relocate DSH_HOME (reuse plan-01 recipe).
# ---------------------------------------------------------------------------

# ---------------------------------------------------------------------------
# (2) clone_demo: throwaway clone + MOUNT-06 clean-checkout peer symlinks.
# ---------------------------------------------------------------------------
clone_demo() {
  step "clone_demo -> $DEMO_DIR"
  rm -rf "$DEMO_DIR"
  git clone "$DEMO_ORIGIN" "$DEMO_DIR" 2>&1 || { echo "CLONE_FAIL"; return 1; }
  git -C "$DEMO_DIR" config user.email "demo-loop-e2e@example.invalid"
  git -C "$DEMO_DIR" config user.name "demo-loop-e2e"
  git -C "$DEMO_DIR" checkout -b "$DEMO_BRANCH" 2>&1

  # Restore the four @deepseek-ai peer symlinks (MOUNT-06 clean-checkout prereq).
  mkdir -p "$DEMO_DIR/node_modules/@deepseek-ai"
  for pkg in "${PEERS[@]}"; do
    local src
    src="$(readlink -f "$BUNDLE_ROOT/node_modules/@deepseek-ai/$pkg" 2>/dev/null)"
    if [ -n "$src" ] && [ -d "$src" ]; then
      ln -sfn "$src" "$DEMO_DIR/node_modules/@deepseek-ai/$pkg"
      echo "  symlink $pkg -> $src"
    else
      echo "  WARN: no resolved $pkg; MOUNT-06 may fail" >&2
    fi
  done
  echo "clone_demo - branch=$(git -C "$DEMO_DIR" branch --show-current) peers symlinked"
}

# ---------------------------------------------------------------------------
# (3) boot_loop: boot the headless session to drive the full demo phase.
# ---------------------------------------------------------------------------
DEMO_TASK="${DEMO_TASK:-In this repository run the full Git Ship Done loop end to end for a tiny demo phase. Create a NEW gsd project phase called 'demo-e2e' via the gsd_* tools: run gsd_init (name 'demo-e2e', one requirement 'DEMO-01: README mentions the e2e demo', one phase 'demo' with a trivial non-destructive goal of adding one line to README.md), then run the whole phase loop discuss -> plan -> execute -> verify -> ship for that phase. Use real LLM subagents (the gsd_plan/gsd_execute/gsd_verify tools spawn fresh-context subagents) and real git, then create a real pull request with gh pr create --base main --head demo-loop-e2e --title 'demo-e2e: add README line' --body 'E2E demo phase evidence'. Reply with ONLY the created pull request URL like PR_URL=https://github.com/.../pull/N}"

boot_loop() {
  step "boot_loop -> DSH_HOME=$DSH_HOME_DIR dsh --profile headless (full demo phase)"
  local task="${DEMO_TASK}"
  DSH_HOME="$DSH_HOME_DIR" dsh --profile headless "$task" >"$LOOP_LOG" 2>&1
  local code=$?
  echo "LOOP_EXIT=$code"
  echo "--- loop boot log tail ---"
  tail -n 40 "$LOOP_LOG"
  # Extract a PR url from the reply if present.
  local pr
  pr="$(grep -oE 'https://github.com/[^ ]*pull/[0-9]+' "$LOOP_LOG" | head -n 1 || true)"
  if [ -n "$pr" ]; then
    echo "PR_URL=$pr"
  else
    echo "PR_URL=NONE"
  fi
}

# ---------------------------------------------------------------------------
# (4) capture: npm test + branch + gh pr list + demo artefacts (MOUNT-05/06).
# ---------------------------------------------------------------------------
capture() {
  step "capture -> npm test in booted clone"
  if [ -d "$DEMO_DIR" ]; then
    (cd "$DEMO_DIR" && npm test 2>&1 | tail -n 30) || echo "NPM_TEST=FAIL"
    echo "--- demo branch list ---"
    git -C "$DEMO_DIR" branch 2>&1
  fi

  step "capture -> gh pr list (open)"
  gh pr list --repo jaaty/dsh-gsd-bundle --state open 2>&1

  step "capture -> demo .planning/phase artefacts"
  if [ -d "$DEMO_DIR" ]; then
    ls -1 "$DEMO_DIR/.planning/phases/" 2>&1
    for p in "$DEMO_DIR/.planning/phases/"*/; do
      [ -d "$p" ] && echo "  --- $p ---" && ls -1 "$p"
    done
  fi
  echo "LOOP_EXIT_CAPTURE_DONE=1"
}

main() {
  local mode="${1:-all}"
  case "$mode" in
    all)
      bootstrap_home || echo "STEP_FAIL bootstrap_home"
      compose_check || echo "STEP_FAIL compose_check"
      clone_demo     || echo "STEP_FAIL clone_demo"
      boot_loop      || echo "STEP_FAIL boot_loop"
      capture
      ;;
    bootstrap) bootstrap_home ;;
    clone)     bootstrap_home && clone_demo ;;
    loop)      bootstrap_home && clone_demo && boot_loop ;;
    capture)   capture ;;
    *) echo "usage: $0 [all|bootstrap|clone|loop|capture]" >&2; exit 2 ;;
  esac
}

main "$@"

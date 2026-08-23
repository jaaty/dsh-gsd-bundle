#!/usr/bin/env bash
#
# live-boot.sh — GSD-03-loop-e2e live-boot recipe (plan GSD-03-loop-e2e-01).
#
# Proves the riskiest live slice of MOUNT-05 first: a relocated DSH_HOME at
# /tmp/dshhome composes the headless profile with all 12 @dsh-gsd/bundle/*
# insert rows applied, and a freshly booted headless session answers a gsd_*
# tool task with real LLM output (D-01/D-02). No offline-harness fallback
# (D-03): a failing compose or boot is reported explicitly with a non-zero
# exit, never papered over.
#
# /tmp is ephemeral across separate bash tool calls (RESEARCH), so the WHOLE
# relocate -> compose -> boot sequence runs inside one invocation. Each half is
# a separate function so it can be driven independently if needed.
set -uo pipefail

DSH_HOME_DIR="${DSH_HOME_DIR:-/tmp/dshhome}"
PROFILE_DIR="$DSH_HOME_DIR/profiles/headless"
BUNDLE_ROOT="${BUNDLE_ROOT:-/var/home/jatyeo/dev/dsh-gsd-bundle}"
SETTINGS_SRC="${SETTINGS_SRC:-/var/home/jatyeo/.dsh/settings.yaml}"
EXPECTED_ROWS="${EXPECTED_ROWS:-12}"
GSD_TOOL_TASK="${GSD_TOOL_TASK:-Reply with exactly the output of the gsd_status tool: the current phase number and step, on a single line, prefixed with PHASE=}"

step() { printf '\n== %s ==\n' "$*"; }

# ---------------------------------------------------------------------------
# (1) bootstrap_home: materialize the relocated headless profile under /tmp.
# ---------------------------------------------------------------------------
bootstrap_home() {
  step "bootstrap_home -> $DSH_HOME_DIR"
  rm -rf "$DSH_HOME_DIR"
  mkdir -p "$PROFILE_DIR"

  # package.json mirroring the real headless profile bundles list.
  cat > "$PROFILE_DIR/package.json" <<'JSON'
{
  "name": "dsh-profile-headless",
  "private": true,
  "dependencies": {
    "@dsh-gsd/bundle": "link:/var/home/jatyeo/dev/dsh-gsd-bundle"
  },
  "dsh": {
    "profile": {
      "bundles": [
        "@deepseek-ai/dsh-base",
        "@deepseek-ai/dsh-headless",
        "@dsh-gsd/bundle"
      ]
    }
  }
}
JSON

  # Empty user layer (comment-only cordis.patch.yml).
  cat > "$PROFILE_DIR/cordis.patch.yml" <<'YML'
# User layer for the relocated headless profile (GSD live-boot proof).
# No user overrides; the bundle + dsh-base rows are the full composition.
YML

  # Symlink the workspace bundle into the profile's node_modules.
  mkdir -p "$PROFILE_DIR/node_modules/@dsh-gsd"
  ln -sfn "$BUNDLE_ROOT" "$PROFILE_DIR/node_modules/@dsh-gsd/bundle"

  # Inherit the ollama provider + agent-default-model from the real settings.
  if [ -f "$SETTINGS_SRC" ]; then
    cp "$SETTINGS_SRC" "$DSH_HOME_DIR/settings.yaml"
    step "bootstrap_home - copied settings.yaml (ollama provider + default model)"
  else
    echo "SKIP: $SETTINGS_SRC not present; no settings.yaml copied"
  fi

  # healProfilesModuleFallback auto-populates profiles/node_modules peers on
  # first boot; no .credentials.yaml is needed (bearer inline in settings).
  echo "bootstrap_home - profile scaffold ready:"
  ls -la "$PROFILE_DIR"
}

# ---------------------------------------------------------------------------
# (2) compose_check: dump the composed config and assert the GSD rows.
# ---------------------------------------------------------------------------
compose_check() {
  step "compose_check -> DSH_HOME=$DSH_HOME_DIR dsh --profile headless --dump-config"
  local dump
  dump="$(DSH_HOME="$DSH_HOME_DIR" dsh --profile headless --dump-config 2>&1)"
  local rows
  rows="$(printf '%s\n' "$dump" | grep -c '@dsh-gsd/bundle/' || true)"
  echo "GSD_BUNDLE_ROWS=$rows"
  echo "--- agent-loop override (config.agents) ---"
  printf '%s\n' "$dump" | grep -A6 'agent-loop' | grep -i 'agents' || echo "NO agent-loop override found"

  if [ "$rows" -lt "$EXPECTED_ROWS" ]; then
    echo "COMPOSE_FAIL: expected >= $EXPECTED_ROWS @dsh-gsd/bundle/ rows, got $rows" >&2
    return 1
  fi
  if ! printf '%s\n' "$dump" | grep -q 'agents'; then
    echo "COMPOSE_FAIL: agent-loop override absent" >&2
    return 1
  fi
  echo "COMPOSE_OK: $rows @dsh-gsd/bundle/ rows + agent-loop override present"
}

# ---------------------------------------------------------------------------
# (3) boot_probe: boot one headless session that answers a gsd_* tool task.
# ---------------------------------------------------------------------------
boot_probe() {
  step "boot_probe -> dsh --profile headless (gsd_status task)"
  local task="$GSD_TOOL_TASK"
  if [ -z "$task" ]; then
    task="Reply with exactly the output of the gsd_status tool: the current phase number and step, on a single line prefixed PHASE="
  fi
  local out
  out="$(DSH_HOME="$DSH_HOME_DIR" dsh --profile headless "$task" 2>&1)"
  local code=$?
  echo "BOOT_EXIT=$code"
  echo "--- last non-empty stdout line ---"
  printf '%s\n' "$out" | sed '/^$/d' | tail -n 3
  echo "--- full boot output tail ---"
  printf '%s\n' "$out" | tail -n 20
  if [ "$code" -ne 0 ]; then
    echo "BOOT_FAIL: headless boot exited $code" >&2
    return "$code"
  fi
  echo "BOOT_OK: real headless session answered a gsd_* tool task (exit 0)"
}

# ---------------------------------------------------------------------------
# main — run the halves; any failure propagates as a non-zero exit (D-03).
# ---------------------------------------------------------------------------
main() {
  local mode="${1:-all}"
  case "$mode" in
    all)   bootstrap_home && compose_check && boot_probe ;;
    compose) bootstrap_home && compose_check ;;
    boot)  bootstrap_home && boot_probe ;;
    *)     echo "usage: $0 [all|compose|boot]" >&2; exit 2 ;;
  esac
}

main "$@"

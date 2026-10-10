#!/usr/bin/env bash
set -euo pipefail

# Safe journalistic lab mode toggle.
# This does not disable the base OS network or break normal connectivity.
# It only reduces risk by stopping the analysis VM and known browser app launchers.

STATE_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/journalist-lab"
STATE_FILE="$STATE_DIR/mode"
mkdir -p "$STATE_DIR"

VM_NAME="analyst-win11"

current_mode="$(cat "$STATE_FILE" 2>/dev/null || echo normal)"
requested_mode="${1:-toggle}"

case "$requested_mode" in
  toggle)
    case "$current_mode" in
      normal) requested_mode="lab-isolated" ;;
      lab-isolated|emergency-safe) requested_mode="normal" ;;
      *) requested_mode="lab-isolated" ;;
    esac
    ;;
  normal|lab-isolated|emergency-safe)
    ;;
  *)
    echo "Unknown mode: $requested_mode"
    echo "Usage: $0 [normal|lab-isolated|emergency-safe|toggle]"
    exit 2
    ;;
esac

stop_analysis_vm() {
  if command -v virsh >/dev/null 2>&1; then
    virsh shutdown "$VM_NAME" >/dev/null 2>&1 || true
    virsh destroy "$VM_NAME" >/dev/null 2>&1 || true
  fi

  pkill -f "chromium --profile-directory=Default --app-id=ejhkdoiecgkmdpomoahkdihbcldkgjci" >/dev/null 2>&1 || true
  pkill -f "chromium --profile-directory=Default --app-id=nlalbmkafgmoifbeooblidblkmlhhpnc" >/dev/null 2>&1 || true
}

activate_normal_mode() {
  # Keep the base operating system normal and connected.
  # This script intentionally avoids altering the user's regular OS networking state.
  :
}

activate_lab_isolated_mode() {
  stop_analysis_vm
  echo "Lab mode: isolated. Host connectivity remains intact; only the isolated analysis VM and app launchers were stopped."
}

activate_emergency_safe_mode() {
  stop_analysis_vm
  echo "Emergency-safe mode: host system left online and usable, while risky analysis VM/app surfaces are stopped."
}

case "$requested_mode" in
  normal)
    activate_normal_mode
    ;;
  lab-isolated)
    activate_lab_isolated_mode
    ;;
  emergency-safe)
    activate_emergency_safe_mode
    ;;
  *)
    echo "Unhandled mode: $requested_mode"
    exit 2
    ;;
esac

printf '%s\n' "$requested_mode" > "$STATE_FILE"

echo "Current lab mode: $requested_mode"

echo "Safe note: this preserves normal system connectivity while removing the isolated analysis surfaces."

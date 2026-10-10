#!/usr/bin/env bash
set -euo pipefail

if [[ "${1:-}" == "--internal" ]]; then
  shift
fi

if [[ ${EUID} -ne 0 ]]; then
  if [[ -n "${DISPLAY:-}" || -n "${WAYLAND_DISPLAY:-}" ]]; then
    exec pkexec env DISPLAY="${DISPLAY:-}" XAUTHORITY="${XAUTHORITY:-}" bash "$0" --internal "$@"
  fi
  exec sudo --preserve-env=DISPLAY,XAUTHORITY bash "$0" --internal "$@"
fi

VM_NAME="${1:-analyst-parrot}"
SNAPSHOT_NAME="${2:-clean}"

if ! virsh dominfo "$VM_NAME" >/dev/null 2>&1; then
  echo "VM not found: $VM_NAME"
  echo "Create it first with the lab scripts."
  exit 1
fi

virsh snapshot-revert "$VM_NAME" "$SNAPSHOT_NAME" --running >/dev/null 2>&1 || {
  echo "Snapshot '$SNAPSHOT_NAME' not found for $VM_NAME."
  exit 1
}

virsh start "$VM_NAME" >/dev/null 2>&1 || true

echo "Lab VM ready: $VM_NAME (snapshot: $SNAPSHOT_NAME)"

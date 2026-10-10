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

if ! virsh dominfo "$VM_NAME" >/dev/null 2>&1; then
  echo "VM not found: $VM_NAME"
  exit 1
fi

virsh shutdown "$VM_NAME" >/dev/null 2>&1 || {
  echo "Shutdown requested for $VM_NAME."
}

echo "Lab VM shutdown requested: $VM_NAME"

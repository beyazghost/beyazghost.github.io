#!/usr/bin/env bash
set -euo pipefail

# Safe runtime wrapper for the isolated analysis VM.
# This is intentionally conservative and does not alter the normal host network.

VM_NAME="${1:-analyst-win11}"
SNAPSHOT_NAME="${2:-clean}"
SAMPLE_PATH="${3:-}"

if [[ -z "$SAMPLE_PATH" ]]; then
  echo "Usage: $0 <vm-name> <snapshot-name> <sample-path>"
  echo "Example: $0 analyst-win11 clean /srv/quarantine/inbox/sample.exe"
  exit 1
fi

if [[ ! -f "$SAMPLE_PATH" ]]; then
  echo "Sample not found: $SAMPLE_PATH"
  exit 1
fi

if ! virsh dominfo "$VM_NAME" >/dev/null 2>&1; then
  echo "VM not found: $VM_NAME"
  echo "Create it first via create-analysis-vm.sh or virt-install."
  exit 1
fi

# Always restore to a known-good snapshot before analysis.
virsh snapshot-current "$VM_NAME" >/dev/null 2>&1 || true
virsh snapshot-revert "$VM_NAME" "$SNAPSHOT_NAME" --running >/dev/null 2>&1 || {
  echo "Snapshot '$SNAPSHOT_NAME' not found. Create it first."
  exit 1
}

virsh start "$VM_NAME" >/dev/null 2>&1 || true

echo "Analysis VM is running from snapshot: $SNAPSHOT_NAME"
echo "Sample prepared for guest execution: $SAMPLE_PATH"
echo "Do not share the host browser profile or personal credentials with the VM."
echo "After the run, revert or destroy the VM to keep the host safe."

#!/usr/bin/env bash
set -euo pipefail

# Run a conservative, single-sample analysis session in the isolated lab VM.
# This script intentionally keeps dangerous behavior off the main workstation.

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <sample-path> [vm-name] [snapshot-name]"
  echo "Example: $0 /srv/quarantine/inbox/20261005T230819Z_lab-sample.txt analyst-parrot clean"
  exit 1
fi

SAMPLE_PATH="$1"
VM_NAME="${2:-analyst-parrot}"
SNAPSHOT_NAME="${3:-clean}"

if [[ ! -f "$SAMPLE_PATH" ]]; then
  echo "Sample not found: $SAMPLE_PATH"
  exit 1
fi

if ! sudo virsh dominfo "$VM_NAME" >/dev/null 2>&1; then
  echo "VM not found: $VM_NAME"
  echo "Create or start it first with the lab scripts."
  exit 1
fi

echo "[1/5] Hashing the sample..."
sha256sum "$SAMPLE_PATH"
file -b "$SAMPLE_PATH" || true

echo "[2/5] Restoring clean snapshot..."
sudo virsh snapshot-revert "$VM_NAME" "$SNAPSHOT_NAME" --running >/dev/null 2>&1 || {
  echo "Snapshot '$SNAPSHOT_NAME' not found for $VM_NAME."
  exit 1
}
sudo virsh start "$VM_NAME" >/dev/null 2>&1 || true

echo "[3/5] Safe guest guidance..."
echo "- Guest network is isolated to the journalist-lab network only."
echo "- No host folder sharing, no clipboard sharing, no browser profile sharing."
echo "- Do not use the reporter's credentials in the guest."
echo "- Run one sample at a time and keep the guest disposable."

echo "[4/5] Ready for sample execution inside the guest."
echo "Copy the file into the VM in a controlled way, then execute it in the guest only."
echo "Example: scp /path/to/sample user@192.168.120.x:/tmp/"

echo "[5/5] After analysis: revert again and shut down the guest."
echo "Run: sudo virsh snapshot-revert $VM_NAME $SNAPSHOT_NAME --running"
echo "Run: sudo virsh shutdown $VM_NAME || true"

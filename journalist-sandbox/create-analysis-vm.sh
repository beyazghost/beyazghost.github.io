#!/usr/bin/env bash
set -euo pipefail

# Create a disposable analysis VM with no host sharing and no internet by default.
# This is a template for a conservative local sandbox.

if [[ $(id -u) -ne 0 ]]; then
  echo "Run this as root or with sudo."
  exit 1
fi

VM_NAME="${1:-analyst-win11}"
IMG_PATH="/var/lib/libvirt/images/${VM_NAME}.qcow2"
ISO_PATH="${2:-/var/lib/libvirt/images/debian-12.10.0-amd64-netinst.iso}"
MEM_GB="${3:-4096}"
CPU_COUNT="${4:-2}"

if [[ ! -f "$ISO_PATH" ]]; then
  echo "Install ISO not found at: $ISO_PATH"
  echo "Download a local Debian or Windows ISO into /var/lib/libvirt/images first."
  echo "This lab is intentionally host-only and keeps the guest off the production LAN."
  exit 1
fi

mkdir -p "$(dirname "$IMG_PATH")"

if [[ ! -f "$IMG_PATH" ]]; then
  qemu-img create -f qcow2 "$IMG_PATH" 80G
fi

# No host folder sharing. No clipboard. No default internet-driven guest access.
virt-install \
  --name "$VM_NAME" \
  --memory "$MEM_GB" \
  --vcpus "$CPU_COUNT" \
  --disk "path=$IMG_PATH,format=qcow2,bus=virtio" \
  --cdrom "$ISO_PATH" \
  --osinfo debian12 \
  --virt-type kvm \
  --network network=journalist-lab,model=virtio \
  --graphics none \
  --console pty,target_type=serial \
  --boot cdrom \
  --import

printf '\n%s\n' "VM creation started."
printf '%s\n' "After install: disable clipboard, remove host folder sharing, and keep the VM isolated."
printf '%s\n' "Use snapshots before every sample analysis session."

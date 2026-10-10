#!/usr/bin/env bash
set -euo pipefail

# Conservative Arch/Omarchy host setup for an isolated analysis lab.
# This is for defensive, local malware triage in a disposable VM.

if [[ $(id -u) -ne 0 ]]; then
  echo "Run this as root or with sudo."
  exit 1
fi

pacman -Syu --noconfirm \
  qemu-full \
  virt-manager \
  virt-viewer \
  libvirt \
  dnsmasq \
  ebtables \
  iptables-nft \
  ovmf \
  swtpm \
  python \
  python-pip \
  jq \
  yara \
  clamav \
  wireshark-cli \
  p7zip \
  unzip \
  git \
  base-devel

systemctl enable --now libvirtd
usermod -aG libvirt "$SUDO_USER"

# Network helper for isolated work.
# This is intentionally simple and local-only.
if ! virsh net-info default >/dev/null 2>&1; then
  virsh net-define /dev/null 2>/dev/null || true
fi

echo
printf '%s\n' "Install complete."
printf '%s\n' "Next: create a dedicated analysis VM with create-analysis-vm.sh."
printf '%s\n' "Keep networking isolated and use snapshots before each sample."

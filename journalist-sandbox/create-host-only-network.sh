#!/usr/bin/env bash
set -euo pipefail

# Create a host-only libvirt network for the safe lab.
# This does not route the guest to the production LAN.

NET_NAME="${1:-journalist-lab}"
XML_PATH="${2:-/tmp/${NET_NAME}.xml}"

cat > "$XML_PATH" <<EOF
<network>
  <name>${NET_NAME}</name>
  <forward mode='none'/>
  <bridge name='virbr-lab' stp='on' delay='0'/>
  <ip address='192.168.120.1' netmask='255.255.255.0'>
    <dhcp>
      <range start='192.168.120.2' end='192.168.120.254'/>
    </dhcp>
  </ip>
</network>
EOF

if virsh net-info "$NET_NAME" >/dev/null 2>&1; then
  echo "Network $NET_NAME already exists."
  exit 0
fi

virsh net-define "$XML_PATH"
virsh net-autostart "$NET_NAME" --disable || true
virsh net-start "$NET_NAME"

echo "Created host-only libvirt network: $NET_NAME"
echo "Guest IP range: 192.168.120.2-254"

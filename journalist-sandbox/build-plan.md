# Concrete build plan for a protected Arch/Omarchy reporter workstation

This plan is designed for a reporting workflow where the main workstation stays usable and trustworthy, while suspicious files are handled in an isolated virtual lab. The design is conservative, durable, and intentionally avoids breaking normal connectivity.

## 1. Goal

Build a workstation that supports the following without risking the reporting environment:

- daily trusted work on Arch/Omarchy
- safe intake of suspicious files
- isolated analysis in a disposable VM
- emergency-safe state that leaves the host usable
- clear rollback and reporting workflow

## 2. Security assumptions

This setup assumes:

- suspicious files may arrive through email, messaging, or downloads
- the host must not run untrusted code
- the reporter must remain able to connect and work if a threat is suspected
- the analysis VM is disposable and never holds personal credentials or reporting data

## 3. High-level architecture

### Trusted host

- Arch Linux / Omarchy workstation
- normal work profile
- regular browser and reporting tools
- no untrusted execution on the host

### Isolated analysis VM

- Windows 10/11 or Debian VM
- clean snapshot before each sample
- no host folder sharing
- no clipboard sharing
- no browser profile or credentials
- host-only or blocked network

### Emergency-safe state

- analysis VM stopped
- risky browser app launchers closed
- host remains online and usable
- normal workflow resumes quickly

## 4. Host hardening checklist

1. Use a separate user account for lab operations.
2. Keep system packages updated.
3. Use full-disk encryption if possible.
4. Keep a dedicated evidence folder outside the normal writing directory.
5. Do not use the main browser profile for suspicious files.
6. Keep only trusted software in the host environment.
7. Maintain a safe toggle script that stops risky analysis surfaces without disabling core connectivity.

## 5. Install host components

Run the host package install script in this folder:

- [install-arch-omarchy-prereqs.sh](install-arch-omarchy-prereqs.sh)

Then create the isolated lab network using:

- [create-host-only-network.sh](create-host-only-network.sh)

This creates a host-only libvirt network that does not route the guest to the production LAN.

Install packages for:

- libvirt
- qemu
- virt-manager
- virt-viewer
- dnsmasq
- ebtables
- iptables-nft
- ovmf
- swtpm
- python
- yara
- clamav
- wireshark-cli
- p7zip
- unzip

After installation:

```bash
sudo systemctl enable --now libvirtd
sudo usermod -aG libvirt "$USER"
newgrp libvirt
```

## 6. Create a host-only isolated network

Create a simple internal network used only by the analysis VM. Keep it off the office LAN.

### Example libvirt network config

```xml
<network>
  <name>journalist-lab</name>
  <forward mode='none'/>
  <bridge name='virbr-lab' stp='on' delay='0'/>
  <ip address='192.168.120.1' netmask='255.255.255.0'>
    <dhcp>
      <range start='192.168.120.2' end='192.168.120.254'/>
    </dhcp>
  </ip>
</network>
```

This keeps the guest off the normal network while still letting it communicate internally if needed for fake services.

## 7. Create the analysis VM

Use the VM template in this directory:

- [create-analysis-vm.sh](create-analysis-vm.sh)

Recommended guest:

- Windows 10/11 or Debian
- 8 GB RAM minimum
- 4 vCPU minimum
- 80 GB qcow2 disk
- no host-folder sharing
- no clipboard sharing
- no USB passthrough unless strictly needed
- no browser profile tied to the reporter

### Required guest tools

For Windows:

- Sysmon
- ProcMon
- Wireshark
- Autoruns
- Python
- optional: INetSim or fake local network services

For Debian:

- strace
- tcpdump
- python3
- file
- strings
- yara
- clamav

## 8. Create a clean snapshot policy

The analysis runner to restore a known-good VM snapshot is:

- [analysis-run.sh](analysis-run.sh)

Before each sample:

1. power off the guest
2. restore the clean snapshot
3. verify the VM is isolated and no host data is shared
4. reattach a fresh analysis folder
5. collect the file hash
6. run the sample only inside the guest
7. revert after capture

This is the key control that prevents cross-contamination.

## 9. Safe intake process

Create a dedicated intake area:

- /srv/quarantine/inbox
- /srv/quarantine/evidence
- /srv/quarantine/reports
- /srv/quarantine/archive

For each sample, record:

- file name
- source
- date received
- SHA-256
- file type
- risk label
- reporter note

Use this sequence:

```bash
sha256sum sample.file
file sample.file
stat sample.file
strings -n 8 sample.file | head -n 50
```

Do not run the file on the host.

## 10. Lab mode behavior

The lab toggle should do the following without breaking the base OS:

- stop the analysis VM
- stop browser app launchers tied to analysis workflows
- leave the host network and main workstation usable
- support a fast return to normal mode
- support a dedicated emergency-safe state

The toggle implementation is here:

- [lab-mode-toggle.sh](lab-mode-toggle.sh)

The user-facing launcher entries are here:

- [journalist-lab-normal.desktop](journalist-lab-normal.desktop)
- [journalist-lab-isolated.desktop](journalist-lab-isolated.desktop)
- [journalist-lab-emergency-safe.desktop](journalist-lab-emergency-safe.desktop)

## 11. Daily workflow for the reporter

### Normal mode

- host is connected and functional
- normal reporting work continues
- no untrusted files run on the host

### Lab isolated mode

- analysis VM is stopped or not active
- browser app launchers tied to the lab are not active
- host remains online and usable

### Emergency-safe mode

- immediate stop of risky analysis surfaces
- safe fallback without cutting off the regular machine
- quick return to stable reporting mode

## 12. What to avoid

- no execution of suspicious files on the host
- no shared folders to the reporting VM
- no credential reuse between trusted and untrusted systems
- no persistence of untrusted data in the reporting profile
- no direct internet access for untrusted file execution

## 13. Acceptable use policy

This lab is for:

- defensive file triage
- suspicious attachment checks
- isolated behavior capture
- reporting safety and continuity

This lab is not for:

- broad malware experimentation
- offensive testing
- active exploit research
- casual unsafe execution of unknown files

## 14. Exit criteria

The system is complete when:

- host is stable and normal
- analysis VM is isolated and disposable
- snapshot reset works
- toggle states work reliably
- suspicious file intake process is documented
- emergency-safe mode is clearly available
- the reporter can return to normal work without the lab breaking the OS

## 15. Recommended next steps

1. Install KVM and libvirt on the host.
2. Create the host-only lab network.
3. Create the clean Windows or Debian analysis VM.
4. Configure snapshots and restore flow.
5. Test the toggle script and emergency-safe mode.
6. Validate intake and reporting folder flow.
7. Run a simple benign sample to confirm the isolation pattern.

This is the safest practical path for a reporter on Arch/Omarchy without sacrificing normal connectivity or reporting continuity.

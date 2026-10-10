# Journalist-safe local malware analysis lab

This directory contains a conservative, journalist-focused local sandbox design for Arch Linux / Omarchy. The goal is to support defensive sample analysis without putting the journalist’s real workstation, credentials, or trust boundary at risk.

## Threat model

This setup assumes:

- a journalist may receive unsolicited files, archives, images, or links
- the host should remain clean and non-networked for active analysis
- the workstation should not expose personal data or browser sessions to the analysis VM
- the analysis VM must be disposable, isolated, and reverted after each run

The system is intentionally conservative. It is designed for cautious triage, not for broad malware research.

## Key design principles

1. Host is never the execution target.
2. Power off or snapshot-reset the analysis VM after each task.
3. Block internet access by default.
4. Do not share folders, clipboard, or browser sessions with the VM.
5. Keep all analysis data in a dedicated quarantine directory.
6. Work from an encrypted, trusted system disk.
7. Prefer documented, reproducible flows over ad hoc execution.

## Recommended host setup

On Arch Linux / Omarchy:

- use a dedicated user account for analysis work
- enable full-disk encryption at install time
- keep the host patched and on a minimal set of packages
- install KVM, QEMU, libvirt, and virt-manager
- use a separate VM for all untrusted samples
- keep a clean snapshot before every analysis session

## Recommended local lab layout

- Host: Arch / Omarchy workstation
- Guest VM: Windows 10/11 or Debian for dynamic analysis
- Network: isolated internal-only network, no internet by default
- Storage: qcow2 VM disks, snapshots, quarantine folder
- Tools: PE/static triage, YARA, Sysmon, ProcMon, Wireshark, Volatility, INetSim
- Output: JSON/HTML report per sample, with hashes and behavioral findings

## Safe workflow

1. Receive a sample in a quarantine directory.
2. Hash it with SH256.
3. Run static checks: file type, PE metadata, strings, YARA rules.
4. Create or restore a clean VM snapshot.
5. Move the sample to the VM only via a controlled upload step.
6. Execute in the VM with networking disabled or fake-only.
7. Capture process, file, registry, and network telemetry.
8. Stop the VM and copy logs back to the host.
9. Store artifacts in a read-only report folder.
10. Revert the snapshot before the next sample.

## Software stack to install on the host

Install the following on Arch/Omarchy:

- qemu-full
- virt-manager
- virt-viewer
- libvirt
- dnsmasq
- ebtables
- iptables-nft
- ovmf
- swtpm
- python
- jq
- yara
- clamav
- wireshark-cli
- p7zip
- unzip

These provide a stable base for a local lab without turning the host into an unsafe workspace.

## Example VM policy

The analysis VM should:

- have no host folder sharing
- use a local-only or host-only NIC
- disable clipboard integration
- disable audio if not needed
- use a fresh snapshot per case
- never store credentials or personal browsing data in it
- never be connected to the internet unless explicitly required for isolated testing

## Good ways to keep the lab safe

- isolate the VM network from the office network
- run only known analysis tools inside the guest
- export logs and then destroy the VM state
- store only the hash, metadata, and report in the main host
- prefer ephemeral, disposable VM disks

## Files in this folder

- install-arch-omarchy-prereqs.sh: host package installation helper
- create-analysis-vm.sh: virt-install template for a clean analysis VM
- create-host-only-network.sh: creates an isolated host-only libvirt lab network
- analysis-run.sh: restores a clean snapshot and brings the analysis VM to a safe runtime state
- quarantine-sample.sh: stages incoming suspicious files into a read-only intake flow
- run-analysis-session.sh: single-sample session runner for the clean VM snapshot
- quarantine/: quarantine inbox, archive, and report workspace
- sample-workflow.md: operating guidance for the analysis flow
- full-lab-sop.md: the full lab standard operating procedure

## Toolbar toggle and safe states

A simple state toggle is provided so the analysis mode can be selected without breaking the base OS. The launcher files are installed in the user application menu and can also be added to a toolbar or quick-launch area.

Modes:

- Normal: regular system behavior with no lab restrictions
- Lab Isolated: stops the analysis VM and browser app launchers, but leaves ordinary OS connectivity usable
- Emergency Safe: same isolation behavior, intended as a quick protective state when a reporting channel may be at risk

The toggle script is here:

- [lab-mode-toggle.sh](lab-mode-toggle.sh)

The desktop launcher entries are here:

- [journalist-lab-normal.desktop](journalist-lab-normal.desktop) in the user app menu
- [journalist-lab-isolated.desktop](journalist-lab-isolated.desktop) in the user app menu
- [journalist-lab-emergency-safe.desktop](journalist-lab-emergency-safe.desktop) in the user app menu

## Concrete build plan

The full Arch/Omarchy implementation plan is here:

- [build-plan.md](build-plan.md)

The first concrete runtime build artifacts are now in place:

- [create-host-only-network.sh](create-host-only-network.sh)
- [analysis-run.sh](analysis-run.sh)

## Important note

This is not a generic malware authoring setup. It is a defensive, journalistic, privacy-preserving local analysis environment for handling suspicious files with strict isolation and rollback. The lab is meant to reduce risk, not increase it.

For the full operational procedure, see [full-lab-sop.md](full-lab-sop.md).

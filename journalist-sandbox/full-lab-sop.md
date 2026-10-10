# Full Lab SOP: Protected Local Malware Triage for Sensitive Journalistic Work

## 1. Purpose

This standard operating procedure defines a conservative, responsible local malware analysis workflow for an Arch Linux / Omarchy workstation used by a journalist or other sensitive operator. The goal is to assess suspicious files without exposing the host system, credentials, or reporting workflows to malware.

This SOP is intentionally strict. It is designed for low-risk defensive triage, not for broad malware experimentation or offensive testing.

## 2. Scope

This procedure applies to:

- suspicious email attachments
- downloaded files
- archives and compressed packages
- PDFs, scripts, images, installers, and browser-generated app launchers
- unexpected files sent through messaging or collaboration tools

This procedure does not apply to high-risk malware research outside the isolated lab environment.

## 3. Core principles

1. The host machine is never the execution target.
2. All untrusted activity runs in an isolated disposable VM.
3. The VM is reverted to a clean snapshot after each sample.
4. Internet access is blocked unless explicitly required for a controlled and documented test.
5. No personal credentials, browser sessions, or sensitive files are shared with the VM.
6. Only the hash, metadata, and a concise report remain on the host.
7. The operator must work in a clearly separated trusted environment.

## 4. Threat model

This environment assumes the operator may receive:

- malicious documents or email attachments
- compressed files, renamed installers, or staged payloads
- browser-based app launchers that are harmless on the surface but suspicious in context
- phishing and lure messages with files, links, or disguised metadata

The host must remain isolated from the analysis VM, and the journalistic work environment must remain separate from any testing or evidence handling environment.

## 5. Required architecture

### Host system

- Arch Linux / Omarchy workstation
- full-disk encryption recommended
- dedicated non-production user account for analysis tasks
- KVM / QEMU / libvirt installed and configured
- minimal set of trusted tools only
- no shared personal data on the analysis machine

### Analysis VM

- Windows 10/11 or a Debian-based guest for controlled inspection
- fresh snapshot before each sample
- no host-folder sharing
- no clipboard synchronization
- no audio device sharing
- no browser profile or personal account access
- host-only or isolated network policy

### Network policy

- default: no internet access
- optional: host-only network only
- if a fake service is needed, use a local sandbox like INetSim
- no direct connection from guest to the internet unless this is explicitly approved for a documented reason

## 6. Storage and evidence layout

Use a dedicated evidence directory, for example:

- /srv/quarantine/inbox
- /srv/quarantine/evidence
- /srv/quarantine/reports
- /srv/quarantine/archives

Each sample should be recorded with:

- original file name
- SHA-256 hash
- date received
- source channel
- analyst name
- risk category
- evidence folder path
- report file name

## 7. Intake procedure

### Step 1: Receive the sample

When a suspicious file is received:

- move it into the quarantine area
- do not open it from the working directory
- do not double-click or run it on the host

### Step 2: Record the file

Generate a metadata record:

```bash
sha256sum suspicious-file
file suspicious-file
stat suspicious-file
ls -l suspicious-file
```

Store:

- hash
- file type
- size
- timestamp
- source

### Step 3: Perform static triage on the host

Use only trusted tools:

- file
- sha256sum
- strings
- unzip -l
- 7z l
- pdfinfo if applicable
- YARA rules if available
- ClamAV if used in a controlled manner

Do not execute the sample on the host.

## 8. VM preparation

Before each sample analysis:

1. restore the clean snapshot
2. verify the guest has no shared folders
3. verify clipboard and drag-drop are disabled
4. confirm networking is isolated
5. check that no personal credentials or notes are accessible inside the guest
6. prepare a log destination for the capture session

## 9. Execution workflow

### Step 1: copy the sample to the guest

- use a controlled upload method
- place the file in a dedicated analysis folder inside the VM
- do not share the whole user home directory

### Step 2: start the guest

- boot the clean snapshot
- wait for the guest to settle
- start monitoring tools before sample execution

### Step 3: capture baseline telemetry

Recommended tools:

- Sysmon
- ProcMon
- Wireshark
- Autoruns
- Windows Event Viewer
- process explorer or ETW tools if available

Capture:

- process creation tree
- file writes
- registry writes
- DNS and HTTP traffic
- persistence mechanisms
- mutexes and service creation
- scheduled task actions

### Step 4: execute the sample

Run one sample at a time.

Do not run multiple untrusted samples in the same VM state.

### Step 5: observe behavior

Monitor for:

- self-copy or persistence behavior
- privilege escalation
- registry autorun keys
- scheduled tasks
- service creation
- PowerShell execution
- browser or credential theft attempts
- payload staging in user or system directories

## 10. Capture and evidence handling

Keep a report for each sample with:

- file name
- SHA-256
- source and context
- static findings
- dynamic findings
- timeline of actions
- suspicious indicators
- final verdict

Examples of final verdicts:

- clean
- suspicious
- malicious
- unknown
- blocked by policy

## 11. Cleanup and reset

After each execution:

1. stop the guest
2. revert to the clean snapshot
3. delete temporary files created during testing
4. archive logs and reports
5. ensure no evidence is left in the host environment outside the quarantine folders

Never keep a previous VM state active for the next sample.

## 12. Host restrictions

The host machine should:

- never be used for active execution of suspicious samples
- never run browser sessions with stored personal accounts during analysis
- never share local documents or work product with the VM
- never connect the VM to the production network

## 13. Reporting rules

The host report should be concise and operational. It should contain:

- what was received
- what was checked
- what the sample did in the safe VM
- what was observed
- whether the sample was malicious, suspicious, or benign
- any follow-up action required

Reports should be stored in the evidence folder, not the normal work directory.

## 14. Escalation guidance

Escalate to a higher-trust security or incident response process only when:

- the sample attempts persistence
- the sample reaches the outside network
- credential theft or browser access is likely
- the sample appears to target journalists, sources, or sensitive investigations

If a sample is actively dangerous or highly suspicious, the analysis should stop and the evidence should be preserved in a sealed case folder.

## 15. Operational caution

This SOP is intentionally conservative and designed around privacy, ethics, and risk reduction. It is not a general-purpose malware lab for training, broad exploit testing, or adversarial research. The purpose is to protect the journalist’s workstation and reporting work while still enabling meaningful triage of suspicious files.

## 16. Minimum daily workflow checklist

Before starting work:

- verify host is patched and trusted
- ensure the analysis VM snapshot is clean
- confirm the guest network is isolated
- prepare the quarantine and evidence folders

During analysis:

- hash the sample
- static triage it on the host
- upload to the isolated VM
- monitor behavior
- record findings
- revert the snapshot

End of session:

- save only the report and hash
- remove temporary artifacts
- keep evidence in the lab area only

## 17. Summary

The safe local malware lab is not about convenience. It is about trust boundaries. The host remains clean, the VM is disposable, the sample is isolated, and the record is preserved without exposing the journalist’s real operational environment.

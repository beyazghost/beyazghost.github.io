# Sample handling workflow

This is the operating procedure for a conservative local analysis lab intended to protect a journalist working with sensitive content.

## 1. Quarantine first

Create a dedicated folder such as:

- /srv/quarantine/inbox
- /srv/quarantine/reports
- /srv/quarantine/archives

Store only the original file and its SHA-256 hash.

Never run untrusted samples directly on the host.

## 2. Hash and inspect the sample

Run:

```bash
sha256sum suspicious-file
file suspicious-file
strings -n 8 suspicious-file | head -n 100
```

Use this to capture baseline information before execution.

## 3. Revert to a clean snapshot

Before each test:

- power on the analysis VM
- restore the clean snapshot
- confirm the VM has no shared folders and no clipboard integration
- ensure the guest is isolated from the main office network

## 4. Execute inside the guest only

If you must execute a sample:

- use a disposable VM
- use an isolated host-only NIC
- prefer a blocked or fake network path
- do not allow direct internet access
- copy the sample into the guest in a controlled way

## 5. Capture behavior

Collect at minimum:

- process tree
- file creation paths
- registry modifications
- mutex creation
- network connections
- DNS requests
- persistence attempts

Useful tools:

- Sysmon
- ProcMon
- Wireshark
- Autoruns
- INetSim or a fake local network service

## 6. Save findings only

Keep the host copy to:

- sample hash
- file metadata
- VM log paths
- capture summaries
- risk score

Do not keep the original sample outside the lab unless there is a clear operational need.

## 7. Reset after every sample

After each run:

- power off the guest
- revert to the clean snapshot
- remove any dropped files
- archive the report and hash

This dramatically reduces the chance of a sample escaping the lab.

## 8. Reporting guidance

For each sample, maintain a simple record:

- file name
- SHA-256
- first-seen date
- static indicators
- dynamic findings
- verdict: clean / suspicious / malicious / unknown
- reason: behavior observed

## 9. Practical caution

This workflow is suitable for careful defensive analysis, not for open-ended malware experiments. The journalistic goal is protection, not broad threat hunting in a shared environment.

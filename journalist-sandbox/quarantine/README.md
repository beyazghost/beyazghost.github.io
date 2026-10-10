# Quarantine workspace

This directory stores incoming suspicious content and intake notes for the local analysis lab.

Use the intake script from the parent directory to stage new samples safely:

```bash
cd journalist-sandbox
sudo bash ./quarantine-sample.sh /path/to/suspicious-file
```

Layout:

- inbox/: original quarantined copies
- archives/: retained copies after review
- reports/: SHA-256 records and markdown notes

Do not execute anything in this directory on the host.

#!/usr/bin/env bash
set -euo pipefail

# Intake a suspicious sample into a conservative quarantine flow.
# The host must never execute untrusted content directly.

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <sample-path> [quarantine-root]"
  echo "Example: $0 ./Downloads/suspicious.exe"
  exit 1
fi

SRC_PATH="$1"
QUARANTINE_ROOT="${2:-$(cd "$(dirname "$0")" && pwd)/quarantine}"
INBOX_DIR="$QUARANTINE_ROOT/inbox"
ARCHIVE_DIR="$QUARANTINE_ROOT/archives"
REPORTS_DIR="$QUARANTINE_ROOT/reports"

if [[ ! -f "$SRC_PATH" ]]; then
  echo "Sample not found: $SRC_PATH"
  exit 1
fi

mkdir -p "$INBOX_DIR" "$ARCHIVE_DIR" "$REPORTS_DIR"

FILENAME="$(basename "$SRC_PATH")"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
SAFE_NAME="${STAMP}_$(printf '%s' "$FILENAME" | tr ' ' '_' | tr -cs 'A-Za-z0-9._-' '_')"
COPY_PATH="$INBOX_DIR/$SAFE_NAME"
HASH="$(sha256sum "$SRC_PATH" | awk '{print $1}')"
FILETYPE="$(file -b "$SRC_PATH" 2>/dev/null || echo 'unknown file type')"
STRINGS_SAMPLE="$(strings -n 8 "$SRC_PATH" 2>/dev/null | head -n 40 || true)"

cp -a "$SRC_PATH" "$COPY_PATH"

cat > "$REPORTS_DIR/${SAFE_NAME}.md" <<EOF
# Sample intake report

- source: $SRC_PATH
- quarantined copy: $COPY_PATH
- sha256: $HASH
- file type: $FILETYPE
- timestamp (UTC): $STAMP

## Strings preview

$STRINGS_SAMPLE
EOF

cat > "$REPORTS_DIR/${SAFE_NAME}.sha256" <<EOF
$HASH  $SAFE_NAME
EOF

printf '\nSample quarantined for controlled review.\n'
printf 'Source file: %s\n' "$SRC_PATH"
printf 'Quarantined copy: %s\n' "$COPY_PATH"
printf 'SHA-256: %s\n' "$HASH"
printf 'File type: %s\n' "$FILETYPE"
printf '\nNext steps:\n'
printf '1. Restore a clean VM snapshot before analysis.\n'
printf '2. Copy the quarantined sample into the guest using a controlled transfer method.\n'
printf '3. Run the sample only inside the isolated VM.\n'
printf '4. Save notes to %s\n' "$REPORTS_DIR"
printf '5. Revert or destroy the VM after the run.\n\n'

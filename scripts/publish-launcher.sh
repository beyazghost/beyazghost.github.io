#!/usr/bin/env bash
set -Eeuo pipefail

expected='spbzorro-publish://run'
[[ "${1:-}" == "$expected" ]] || exit 2
ROOT="/home/chosen/Projects/JHub/beyazghost.github.io"
exec ghostty -e /usr/bin/bash -lc "cd '$ROOT' && ./scripts/publish-site.sh"

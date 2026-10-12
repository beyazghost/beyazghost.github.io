#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="/home/chosen/Projects/JHub/beyazghost.github.io"
cd "$ROOT"

fail() { printf 'Publish stopped: %s\n' "$1" >&2; exit 1; }

[[ "$(git branch --show-current)" == "main" ]] || fail "this publisher only pushes the main branch."
[[ "$(git remote get-url origin)" == "https://github.com/beyazghost/beyazghost.github.io.git" ]] || fail "the origin remote is not the expected site repository."
git diff --cached --quiet || fail "there are already staged changes. Commit or unstage them first."

paths=(README.md index.html news.html reflections.html refractions.html reports.html sitemap.xml dashboard status-service/src/index.ts writing)
printf 'Pending site changes:\n'
git status --short --untracked-files=all -- "${paths[@]}"
git diff --stat -- "${paths[@]}"
printf '\nThis will stage the site/editor changes above, create a commit, push main,\n'
printf 'and deploy the status-service Worker. GitHub Pages and Cloudflare Pages\n'
printf 'deploy from the push. Review the list before continuing.\n\n'
read -r -p 'Type PUSH to approve publishing: ' approval
[[ "$approval" == "PUSH" ]] || fail "approval was not entered."

git add -A -- "${paths[@]}"
git diff --cached --quiet && fail "there are no publishable changes in the allowed site paths."
printf '\nFiles staged for this publish:\n'
git diff --cached --name-status
git diff --cached --stat
read -r -p 'Commit message (leave blank for "Publish site updates"): ' message
message="${message:-Publish site updates}"

git commit -m "$message"
git push origin main
(cd status-service && npm run deploy)

printf '\nPublish commands completed. Pages deployments may take a few minutes to appear.\n'
read -r -p 'Press Enter to close this terminal. ' _

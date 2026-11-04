#!/usr/bin/env bash
# Push SubWatch to a fresh GitHub repository.
#   ./push-to-github.sh <github-username> [repo-name]
# Requires: git, and either SSH keys or a credential helper already configured.
set -euo pipefail

USERNAME="${1:-}"
REPO="${2:-subwatch-subscription-manager}"

if [[ -z "$USERNAME" ]]; then
  echo "Usage: ./push-to-github.sh <github-username> [repo-name]"
  exit 1
fi

if ! git rev-parse --git-dir >/dev/null 2>&1; then
  echo "Run this from inside the subwatch/ repository."
  exit 1
fi

git branch -M main

if git remote | grep -qx origin; then
  echo "Remote 'origin' exists -> $(git remote get-url origin)"
else
  git remote add origin "https://github.com/${USERNAME}/${REPO}.git"
  echo "Added origin https://github.com/${USERNAME}/${REPO}.git"
fi

echo
echo "Make sure the empty repo https://github.com/new?name=${REPO} exists, then press Enter."
read -r _

git push -u origin main
echo
echo "Done -> https://github.com/${USERNAME}/${REPO}"
echo "Next: deploy the demo with the render.yaml blueprint, then add that URL to the repo's About panel."

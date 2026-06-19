#!/usr/bin/env bash
#
# slugify.sh — the single canonical "company name -> slug" transform.
#
# This is the ONE place the transform lives. new-report.sh, the GitHub Action,
# and the /ipo-report & /stock-report slash commands all call this script so a
# given company name always maps to exactly one report path and the three
# entry points can never diverge.
#
#   "Alphabet Inc."  -> alphabet-inc
#   "SpaceX"         -> spacex
#   "AT&T"           -> att
#
# Rule: lowercase; spaces/underscores -> "-"; drop anything not [a-z0-9-];
#       collapse repeated "-"; trim leading/trailing "-".
#
# Educational only — not financial advice.

set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 \"<Company Name>\"" >&2
  exit 1
fi

echo "$1" \
  | tr '[:upper:]' '[:lower:]' \
  | sed -E 's/[[:space:]_]+/-/g; s/[^a-z0-9-]//g; s/-+/-/g; s/^-|-$//g'

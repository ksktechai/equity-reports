#!/usr/bin/env bash
#
# new-report.sh — generate an education-only equity report and commit it.
#
# Usage:
#   ./scripts/new-report.sh ipo   "SpaceX"
#   ./scripts/new-report.sh stock "Alphabet"
#
# Requires:
#   - Claude Code CLI on PATH  (npm install -g @anthropic-ai/claude-code)
#   - logged in via `claude` -> /login with your Pro/Max plan (run `claude` then
#     /status to confirm). No API key needed.
#   - node (for build-index.js)
#   - git, with a configured remote if you want auto-push
#
# BILLING: this script uses plain `claude -p`, which inherits your logged-in
# Claude Code session — so runs draw on your subscription quota, NOT per-token
# API billing. If ANTHROPIC_API_KEY is set, Claude Code ignores the subscription
# and bills the API account; `unset ANTHROPIC_API_KEY` to stay on the plan.
#
# Educational only — not financial advice.

set -euo pipefail

# ---------------------------------------------------------------------------
# 0. Locate repo root so the script works from anywhere
# ---------------------------------------------------------------------------
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

# ---------------------------------------------------------------------------
# 1. Validate arguments
# ---------------------------------------------------------------------------
if [[ $# -lt 2 ]]; then
  echo "Usage: $0 <ipo|stock> \"<Company Name>\"" >&2
  exit 1
fi

TYPE="$1"
COMPANY="$2"

case "$TYPE" in
  ipo)   PROMPT_FILE="prompts/ipo-analysis.md" ;;
  stock) PROMPT_FILE="prompts/stock-analysis.md" ;;
  *)     echo "Error: type must be 'ipo' or 'stock', got '$TYPE'" >&2; exit 1 ;;
esac

# Guard against accidental API billing: a stray ANTHROPIC_API_KEY makes Claude
# Code bill the API account per token instead of using your subscription.
if [[ -n "${ANTHROPIC_API_KEY:-}" ]]; then
  echo "WARNING: ANTHROPIC_API_KEY is set — Claude Code will bill the API account" >&2
  echo "         per token instead of your Pro/Max subscription." >&2
  echo "         Run 'unset ANTHROPIC_API_KEY' first to stay on the subscription." >&2
  read -r -p "Continue anyway and incur API charges? [y/N] " reply
  [[ "$reply" =~ ^[Yy]$ ]] || { echo "Aborted." >&2; exit 1; }
fi

if [[ ! -f "$PROMPT_FILE" ]]; then
  echo "Error: prompt file not found: $PROMPT_FILE" >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# 2. Derive slug + paths
# ---------------------------------------------------------------------------
# Use the single canonical transform shared with the Action and slash commands,
# so a company always maps to one path no matter which entry point is used.
SLUG="$(bash "$REPO_ROOT/scripts/slugify.sh" "$COMPANY")"

if [[ -z "$SLUG" ]]; then
  echo "Error: could not derive a slug from '$COMPANY'" >&2
  exit 1
fi

OUT_DIR="reports/$TYPE/$SLUG"
OUT_FILE="$OUT_DIR/index.html"
mkdir -p "$OUT_DIR"

GEN_DATE="$(date -u +%Y-%m-%d)"
PROMPT_HASH="$(git rev-parse --short HEAD 2>/dev/null || echo "uncommitted")"

echo "==> Generating $TYPE report for '$COMPANY'"
echo "    prompt : $PROMPT_FILE"
echo "    output : $OUT_FILE"
echo "    date   : $GEN_DATE   prompt commit: $PROMPT_HASH"

# ---------------------------------------------------------------------------
# 3. Run Claude Code headlessly
# ---------------------------------------------------------------------------
# -p      : print mode (one batch turn, then exit). Plain `claude -p` (no --bare)
#           inherits your logged-in subscription session — no API billing.
# tools   : research + file read/write only
RUN_INSTRUCTIONS="
COMPANY TO ANALYSE: $COMPANY
REPORT TYPE: $TYPE
GENERATION DATE (UTC): $GEN_DATE
PROMPT VERSION (git commit): $PROMPT_HASH

Write the final self-contained HTML report to: $OUT_FILE
Stamp the generation date and the prompt version ($PROMPT_HASH) into the report footer.
Also include, immediately after the opening <head> tag, a machine-readable provenance
comment that the landing-page builder parses (keys separated by ';'):
<!-- report-meta: type=$TYPE; slug=$SLUG; name=$COMPANY; generated=$GEN_DATE; prompt=$PROMPT_HASH -->
Output ONLY the HTML file via the Write tool. Do not print the HTML to stdout."

claude -p "$(cat "$PROMPT_FILE")
$RUN_INSTRUCTIONS" \
  --allowedTools "WebSearch,WebFetch,Read,Write" || {
    echo "Error: Claude Code run failed." >&2
    exit 1
  }

# ---------------------------------------------------------------------------
# 4. Guardrails: file exists, strip stray markdown code fences
# ---------------------------------------------------------------------------
if [[ ! -s "$OUT_FILE" ]]; then
  echo "Error: expected report not written or empty: $OUT_FILE" >&2
  echo "Inspect .last-run.json for what Claude did." >&2
  exit 1
fi

# Remove a leading ```html / ``` fence and a trailing ``` fence if present.
if head -n1 "$OUT_FILE" | grep -qE '^```'; then
  echo "==> Stripping stray code fences from output"
  sed -i.bak -E '1{/^```/d}; ${/^```$/d}' "$OUT_FILE"
  rm -f "$OUT_FILE.bak"
fi

# Sanity check: looks like HTML?
if ! grep -qi '<html' "$OUT_FILE" && ! grep -qi '<!doctype' "$OUT_FILE"; then
  echo "Warning: $OUT_FILE does not look like a full HTML document. Review before publishing." >&2
fi

# ---------------------------------------------------------------------------
# 5. Regenerate the landing index
# ---------------------------------------------------------------------------
if [[ -f "scripts/build-index.js" ]]; then
  echo "==> Rebuilding landing index"
  node scripts/build-index.js
else
  echo "Note: scripts/build-index.js not found — skipping index rebuild." >&2
fi

# ---------------------------------------------------------------------------
# 6. Commit (and push if a remote exists)
# ---------------------------------------------------------------------------
git add "$OUT_FILE" index.html 2>/dev/null || git add "$OUT_FILE"
if git diff --cached --quiet; then
  echo "==> No changes to commit."
else
  git commit -m "Add $TYPE report: $COMPANY ($GEN_DATE)"
  if git remote | grep -q .; then
    echo "==> Pushing"
    git push
  else
    echo "Note: no git remote configured — committed locally only." >&2
  fi
fi

echo "==> Done: $OUT_FILE"
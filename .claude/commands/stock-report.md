---
description: Generate an education-only analysis report for a listed stock and publish it.
argument-hint: <Company Name>
allowed-tools: Bash(bash scripts/slugify.sh:*), Bash(date:*), Bash(git rev-parse:*), Bash(git add:*), Bash(git commit:*), Bash(git push:*), Bash(git remote:*), Bash(git diff:*), Bash(node scripts/build-index.js), Bash(mkdir:*), Bash(grep:*), WebSearch, WebFetch, Read, Write
---

You are running the **stock report pipeline** for: **$ARGUMENTS**

This reproduces `scripts/new-report.sh stock "$ARGUMENTS"` inside this session. Follow every
step; do not skip the guardrails.

Pre-computed, deterministic values (do not re-derive these by hand — they come from the same
canonical helpers the script and the GitHub Action use):

- Slug: !`bash scripts/slugify.sh "$ARGUMENTS"`
- Generation date (UTC): !`date -u +%Y-%m-%d`
- Prompt version (git short hash): !`git rev-parse --short HEAD 2>/dev/null || echo uncommitted`

The output path is therefore **`reports/stock/<slug>/index.html`** using the slug above.

The analysis prompt to follow is embedded here verbatim:

@prompts/stock-analysis.md

---

Steps:

1. Do the research and analysis exactly as the prompt above instructs. Stock data is a live
   snapshot: search the web for the **current** price, latest reported quarter, and analyst
   consensus — never answer these from memory — and state the as-of date prominently.
2. Write the final self-contained HTML report with the **Write** tool to
   `reports/stock/<slug>/index.html` (create the directory if needed). Output only the HTML
   file — do not print the HTML into the chat.
3. Immediately after the opening `<head>` tag, include this machine-readable provenance
   comment so the landing-page builder can list and date the report (substitute the values
   above):
   `<!-- report-meta: type=stock; slug=<slug>; name=$ARGUMENTS; generated=<date>; prompt=<hash> -->`
   Also stamp the generation date and prompt version into the footer, and end the page with
   the educational disclaimer the prompt specifies.
4. Guardrails before committing: confirm the file exists and is non-empty; if the file begins
   or ends with a ```` ``` ```` markdown fence, remove it; sanity-check the file contains
   `<html` or `<!doctype`.
5. Run `node scripts/build-index.js` to regenerate the root `index.html`.
6. Stage `reports/stock/<slug>/index.html` and `index.html`, commit with message
   `Add stock report: $ARGUMENTS (<date>)`, and `git push` if a remote is configured.
7. Report back the path written, the slug, and the would-be GitHub Pages URL
   (`reports/stock/<slug>/`).

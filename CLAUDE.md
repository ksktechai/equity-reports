# CLAUDE.md

Guidance for Claude Code working in this repo. Full architecture lives in `README.md` —
this file is the short list of conventions that aren't obvious from the code.

## What this is

A static, **education-only** equity-research pipeline. You give a company name + type
(`ipo` | `stock`); the matching prompt in `prompts/` is run to research and write a
single self-contained HTML report to `reports/<type>/<slug>/index.html`; `build-index.js`
regenerates the root `index.html`; the result is committed and served via GitHub Pages.
No backend, no database, no third-party runtime deps — Node built-ins + the Claude Code CLI.

## Hard rules

- **Auth is subscription-only. Never set `ANTHROPIC_API_KEY`.** Reports run via plain
  `claude -p`, which uses the logged-in Pro/Max session. If that env var is set, Claude Code
  silently bills the API per token instead. `new-report.sh` warns if it detects the key.
- **There is intentionally no CI / GitHub Action.** An unattended runner can't use the
  subscription login and would require a paid API key. Don't add one back without asking.
- **One canonical slug transform: `scripts/slugify.sh`.** `new-report.sh` and the slash
  commands all call it. Never re-implement the slug regex inline — a company must always map
  to exactly one path.
- **Every report carries a provenance comment** right after `<head>`:
  `<!-- report-meta: type=…; slug=…; name=…; generated=YYYY-MM-DD; prompt=… -->`
  `build-index.js` parses it to title, group, and date-sort the landing page.
- **Reports are education-only.** Every reader-facing page must end with the educational
  disclaimer. Mark estimates `[EST]` with a confidence level; never invent numbers.
- **Don't rewrite the prompt files** (`prompts/*.md`) or the example report
  (`reports/ipo/spacex/index.html`) unless explicitly asked — they define the house style.

## How to generate a report

```bash
./scripts/new-report.sh ipo   "SpaceX"      # local CLI (streams live progress)
./scripts/new-report.sh stock "Alphabet"
```
…or the slash commands in a Claude Code session: `/ipo-report <Company>`,
`/stock-report <Company>`. Both run on your subscription.

Pipeline order (don't skip the guardrails): run the prompt → assert the file exists &
is non-empty → strip stray ``` fences → sanity-check it's HTML → `node scripts/build-index.js`
→ commit (and push if a remote exists).

## Repo / push notes

- Public repo, solo owner: **only the owner can push**; forkers propose via PRs.
- Match the visual language of `reports/ipo/spacex/index.html` for anything new that must
  look consistent (dark theme, inline CSS/JS, stat strip, cards, animated charts, risk
  meters, scorecard, verdict, `prefers-reduced-motion`).
- Live stock data (price/quarter/consensus) must be web-searched, never recalled from
  memory, and stamped with the as-of date.

*Educational only — not financial advice.*

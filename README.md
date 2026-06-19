# Equity Reports

Education-only equity research reports — for both **IPOs** and **existing listed stocks** —
generated with Claude, rendered as self-contained interactive HTML, and published via GitHub
Pages for in-browser viewing.

> **Not financial advice.** Every report is an educational analysis of public information.
> Prices and figures are as of each report's generation date and will have changed.

---

## What this repo does

You provide a company name and a report type. Claude runs the matching prompt (research +
analysis), writes a single self-contained HTML report into `reports/`, regenerates the
landing page, and commits. GitHub Pages serves each report at a browser URL — a lightweight
substitute for a local Confluence/wiki.

There is **no backend and no Java service** by design. The use case is single-user and
batch-style ("name in, report out"), so a static repo plus an agentic runner is the right
amount of machinery. A web service would only be justified if this became multi-user or
needed an always-on HTTP endpoint.

---

## Repository layout

```
equity-reports/
├── prompts/
│   ├── ipo-analysis.md        # prompt for first-time listings (S-1, float, lock-up, mechanics)
│   └── stock-analysis.md      # prompt for listed stocks (history, earnings trend, consensus)
├── reports/
│   ├── ipo/<slug>/index.html      # e.g. reports/ipo/spacex/index.html
│   └── stock/<slug>/index.html    # e.g. reports/stock/googl/index.html
├── scripts/
│   ├── new-report.sh          # CLI wrapper: type + company -> report -> commit
│   ├── slugify.sh             # canonical company-name -> slug (shared by all entry points)
│   └── build-index.js         # regenerates the root index.html from reports/
├── .claude/
│   └── commands/              # optional Claude Code slash commands (/ipo-report, /stock-report)
├── index.html                 # auto-generated landing page linking every report
└── README.md
```

`slug` = lowercased, hyphenated company name (e.g. "Alphabet" -> `alphabet`). The transform
lives in exactly one place, `scripts/slugify.sh`, which `new-report.sh`, the slash commands,
and the GitHub Action all call — so a given company always maps to one path.

---

## The two report types

Both share house style and the same pipeline; they differ in lens.

**IPO report** (`prompts/ipo-analysis.md`) centres on the listing: the S-1 financials,
float, lock-up schedule, allocation, and "is the offer price sane." Much of it is one-time.

**Stock report** (`prompts/stock-analysis.md`) centres on what a listed company has and an
IPO doesn't: multi-year trading and earnings history, the latest quarter's beat/miss,
dividends and buybacks, analyst consensus, current multiple vs the company's own history, and
a current price vs fair-value read. It leans harder on live web search and timestamps itself.

---

## How to generate a report

### Option A — local CLI (simplest)

```bash
./scripts/new-report.sh ipo   "SpaceX"
./scripts/new-report.sh stock "Alphabet"
```

The script picks the right prompt by type, invokes Claude Code headlessly to do the research
and write the HTML, regenerates the index, and commits + pushes.

### Option B — Claude Code slash command (most idiomatic)

In a Claude Code session in this repo:

```
/ipo-report SpaceX
/stock-report Alphabet
```

### Option C — issue-driven via GitHub Actions (hands-off, works from phone)

Open an issue titled `IPO: SpaceX` or `STOCK: Alphabet`. A workflow reads the title, runs
the prompt with `ANTHROPIC_API_KEY` from repo secrets, writes the report, regenerates the
index, commits, and closes the issue with a link.

---

## Claude Code headless invocation (reference)

The runner calls Claude Code in print mode. Confirmed current syntax:

```bash
# --bare is recommended for scripted/SDK calls and skips OAuth/keychain;
# auth comes from ANTHROPIC_API_KEY in that mode.
ANTHROPIC_API_KEY="$KEY" claude --bare -p "$(cat prompts/ipo-analysis.md)

COMPANY TO ANALYSE: SpaceX
Write the final HTML report to reports/ipo/spacex/index.html" \
  --allowedTools "WebSearch,WebFetch,Read,Write" \
  --output-format json
```

Notes:
- `-p` / `--print` runs one batch turn and exits — the foundation of every headless use.
- `--bare` will become the default for `-p` in a future release; until then, set it
  explicitly for clean scripted runs and provide `ANTHROPIC_API_KEY`.
- `--allowedTools` is scoped to what each report needs: web research + file read/write.
- `--output-format json` gives a parseable result (cost, session id) for the script to log.

(These flags evolve between versions; if a run behaves unexpectedly, check
`code.claude.com/docs/en/headless` or ask Claude Code directly.)

---

## Reliability guardrails for unattended runs

- **Verify the file landed.** After the run, assert `reports/<type>/<slug>/index.html`
  exists before committing; fail loudly if not.
- **Strip stray fences.** Headless output occasionally wraps HTML in a ```` ```html ```` fence
  — strip a leading/trailing fence before committing.
- **Stamp provenance.** Each report footer should carry the generation date and the prompt
  file's git commit hash, so a report is reproducible and you know which prompt version made
  it. Additionally, each report carries a machine-readable comment right after `<head>` —
  `<!-- report-meta: type=…; slug=…; name=…; generated=YYYY-MM-DD; prompt=… -->` — which
  `scripts/build-index.js` parses to title, group, and date-sort the landing page. (Older
  reports without it still list; they fall back to file mtime for ordering.)
- **Stock data is a snapshot.** The stock prompt must search for live price/quarter/consensus
  and state the as-of date prominently — never rely on model memory for these.

---

## Publishing (GitHub Pages)

Enable Pages on this repo (Settings -> Pages -> deploy from branch, root). Reports then serve
at:

```
https://<user>.github.io/equity-reports/reports/ipo/spacex/
https://<user>.github.io/equity-reports/reports/stock/alphabet/
```

The root `index.html` is the directory of all reports. Pages on a **private** repo requires a
paid GitHub plan; otherwise the repo and site are public. These are education-only analyses
of public companies, so public is usually fine — but it's a conscious choice, especially if
run under a consulting entity.

---

## Prompt versioning

`prompts/*.md` are the heart of the system. Version them: when you improve a prompt, the git
history is your changelog, and the commit hash stamped in each report ties output to the exact
prompt that produced it. Treat prompt edits like code changes — small, reviewed, committed
with a message.

---

## First-session brief for Claude Code

Paste this to bootstrap the repo:

> Read `prompts/ipo-analysis.md`, `prompts/stock-analysis.md`, and the example report at
> `reports/ipo/spacex/index.html`. Then scaffold this repo per the README:
> (1) `scripts/new-report.sh` taking a type (ipo|stock) and a company name, selecting the
> right prompt, invoking Claude Code headlessly to write the report to
> `reports/<type>/<slug>/index.html`, then running build-index and committing;
> (2) `scripts/build-index.js` that globs `reports/**/index.html` and regenerates a linked
> root `index.html` matching the reports' visual style;
> (3) optional `.claude/commands/ipo-report.md` and `stock-report.md` slash commands;
> (4) a GitHub Actions workflow for the issue-driven flow (Option C);
> (5) the guardrails in the README (verify file exists, strip code fences, stamp date +
> prompt hash). Keep everything static — no backend.

---

*Educational only — not financial advice. Do your own research.*

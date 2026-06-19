#!/usr/bin/env node
'use strict';

/*
 * build-index.js — regenerate the root landing page from the reports/ tree.
 *
 * No external dependencies — Node built-ins (fs/path) only.
 *
 * What it does:
 *   - Walks reports/ for every <type>/<slug>/index.html (ipo + stock).
 *   - For each report, derives a display name from its slug and, where present,
 *     reads the <title> and a `<!-- report-meta: ... -->` provenance comment,
 *     capturing the generation date if it is stamped in the file.
 *   - Writes a self-contained root index.html grouping reports into "IPOs" and
 *     "Stocks", newest first by generation date where available.
 *   - Matches the reports' dark visual language (same fonts, palette, starfield,
 *     reduced-motion handling) and ends with the educational disclaimer.
 *   - Idempotent: safe to run repeatedly; overwrites index.html cleanly.
 *
 * Educational only — not financial advice.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const REPORTS_DIR = path.join(ROOT, 'reports');
const OUT_FILE = path.join(ROOT, 'index.html');

// Groups we render, in order. Anything else found under reports/ is appended
// under a titleized fallback group so nothing silently disappears.
const GROUPS = [
  { type: 'ipo', label: 'IPOs', blurb: 'First-time listings — S-1 financials, float, lock-up and whether the offer price is sane.' },
  { type: 'stock', label: 'Stocks', blurb: 'Listed companies — multi-year history, latest quarter, consensus and a price-vs-fair-value read.' },
];

// ---------------------------------------------------------------------------
// Discovery
// ---------------------------------------------------------------------------

/** Recursively collect every reports/<type>/<slug>/index.html. */
function findReports() {
  const found = [];
  if (!fs.existsSync(REPORTS_DIR)) return found;

  for (const type of fs.readdirSync(REPORTS_DIR)) {
    const typeDir = path.join(REPORTS_DIR, type);
    if (!safeIsDir(typeDir)) continue;

    for (const slug of fs.readdirSync(typeDir)) {
      const slugDir = path.join(typeDir, slug);
      if (!safeIsDir(slugDir)) continue;

      const file = path.join(slugDir, 'index.html');
      if (!safeIsFile(file)) continue;

      found.push(readReport({ type, slug, file }));
    }
  }
  return found;
}

function safeIsDir(p) {
  try { return fs.statSync(p).isDirectory(); } catch { return false; }
}
function safeIsFile(p) {
  try { return fs.statSync(p).isFile(); } catch { return false; }
}

// ---------------------------------------------------------------------------
// Metadata extraction
// ---------------------------------------------------------------------------

const ISO_DATE = /\b(\d{4}-\d{2}-\d{2})\b/;

function readReport({ type, slug, file }) {
  const html = fs.readFileSync(file, 'utf8');

  const meta = parseMetaComment(html);
  const title = matchOne(html, /<title>([^<]*)<\/title>/i);

  const name = meta.name || cleanTitle(title) || titleizeSlug(slug);
  const ticker = meta.ticker || tickerFromTitle(title);
  const generated = meta.generated || sniffGeneratedDate(html);

  // Sort key: prefer the stamped generation date; otherwise fall back to the
  // file's mtime so undated reports still order sensibly (but only stamped
  // dates are shown to the reader).
  const mtime = fs.statSync(file).mtime;
  const sortKey = generated || toISODate(mtime);

  return {
    type,
    slug,
    href: `reports/${type}/${slug}/`,
    name,
    ticker,
    generated,        // may be null
    sortKey,
  };
}

/** Parse `<!-- report-meta: k=v; k=v -->` into an object (case-insensitive keys). */
function parseMetaComment(html) {
  const body = matchOne(html, /<!--\s*report-meta:?\s*([\s\S]*?)-->/i);
  const out = {};
  if (!body) return out;
  for (const pair of body.split(';')) {
    const i = pair.indexOf('=');
    if (i === -1) continue;
    const k = pair.slice(0, i).trim().toLowerCase();
    const v = pair.slice(i + 1).trim();
    if (k) out[k] = v;
  }
  return out;
}

/** Find a generation date stamped in prose ("Generated 2026-06-19", "as of ..."). */
function sniffGeneratedDate(html) {
  const labelled = matchOne(
    html,
    /(?:generated|generation date|as[- ]of|updated)[^0-9]{0,24}(\d{4}-\d{2}-\d{2})/i,
    1
  );
  if (labelled) return labelled;
  // No bare ISO-date fallback on purpose: an unrelated date elsewhere in the
  // report should not masquerade as the generation date. Undated reports fall
  // back to mtime for ordering only.
  return null;
}

function cleanTitle(title) {
  if (!title) return null;
  let t = title.split('·')[0];                       // drop "· TICKER" suffix
  t = t.replace(/\b(ipo|stock)?\s*analysis\b/i, '');  // drop "IPO Analysis" etc.
  t = t.replace(/\s+/g, ' ').trim();
  return t || null;
}

function tickerFromTitle(title) {
  if (!title || !title.includes('·')) return null;
  const t = title.split('·').pop().trim();
  return /^[A-Z0-9.\-]{1,8}$/.test(t) ? t : null;
}

function titleizeSlug(slug) {
  return slug.split('-').filter(Boolean)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function matchOne(s, re, group = 1) {
  const m = s.match(re);
  return m ? m[group].trim() : null;
}

function toISODate(d) {
  return d.toISOString().slice(0, 10);
}

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmtDate(iso) {
  if (!iso) return null;
  const d = new Date(iso + 'T00:00:00Z');
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function groupReports(reports) {
  const byType = new Map();
  for (const r of reports) {
    if (!byType.has(r.type)) byType.set(r.type, []);
    byType.get(r.type).push(r);
  }
  for (const list of byType.values()) {
    list.sort((a, b) => (a.sortKey < b.sortKey ? 1 : a.sortKey > b.sortKey ? -1 : a.name.localeCompare(b.name)));
  }

  const ordered = [];
  for (const g of GROUPS) {
    ordered.push({ ...g, reports: byType.get(g.type) || [] });
    byType.delete(g.type);
  }
  // Any unexpected types (defensive) get a fallback group.
  for (const [type, list] of byType) {
    ordered.push({ type, label: titleizeSlug(type), blurb: '', reports: list });
  }
  return ordered;
}

function renderCard(r) {
  const date = fmtDate(r.generated);
  const tickerHtml = r.ticker ? `<span class="ticker">${esc(r.ticker)}</span>` : '';
  const dateHtml = date
    ? `<span class="dot done" aria-hidden="true"></span>${esc(date)}`
    : `<span class="dot" aria-hidden="true"></span>date not stamped`;
  return `        <a class="card" href="${esc(r.href)}">
          <div class="corner">${esc(r.type)}</div>
          <h3>${esc(r.name)}${tickerHtml}</h3>
          <div class="meta">${dateHtml}</div>
          <span class="go">View report &rarr;</span>
        </a>`;
}

function renderSection(group, idx) {
  const num = String(idx + 1).padStart(2, '0');
  const cards = group.reports.length
    ? `<div class="grid g2">\n${group.reports.map(renderCard).join('\n')}\n      </div>`
    : `<p class="empty">No ${esc(group.label)} yet.</p>`;
  return `<section><div class="wrap">
      <div class="sec-head"><span class="sec-num">${num}</span><h2>${esc(group.label)}</h2></div>
      ${group.blurb ? `<p class="lede">${esc(group.blurb)}</p>` : ''}
      ${cards}
    </div></section>`;
}

function renderPage(reports) {
  const groups = groupReports(reports);
  const total = reports.length;
  const counts = Object.fromEntries(groups.map(g => [g.type, g.reports.length]));
  const built = toISODate(new Date());

  const sections = groups.map(renderSection).join('\n\n    ');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<!-- report-meta: type=index; generated=${built}; reports=${total} -->
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Equity Reports · Educational equity research</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&family=Newsreader:opsz,wght@6..72,400;6..72,500&display=swap');

  :root{
    --void:#070a12; --deep:#0d121f; --panel:#121a2b; --panel-2:#16203399;
    --line:#243049; --ink:#e8ecf6; --mute:#8a96b2; --faint:#5d6885;
    --plasma:#ff5c3a; --plasma-soft:#ff8a3a; --ion:#4ea8ff; --ion-soft:#7fc4ff;
    --green:#46d39a; --amber:#f2b441; --red:#ff5470;
  }
  *{box-sizing:border-box;margin:0;padding:0}
  html{scroll-behavior:smooth}
  body{
    background:
      radial-gradient(1200px 600px at 80% -10%, rgba(78,168,255,.10), transparent 60%),
      radial-gradient(900px 500px at 10% 5%, rgba(255,92,58,.08), transparent 55%),
      var(--void);
    color:var(--ink);
    font-family:'Space Grotesk',system-ui,sans-serif;
    line-height:1.55;-webkit-font-smoothing:antialiased;overflow-x:hidden;min-height:100vh;
  }
  .wrap{max-width:1080px;margin:0 auto;padding:0 24px}

  /* starfield (matches the reports) */
  .stars{position:fixed;inset:0;z-index:0;pointer-events:none;opacity:.5}
  .stars::before,.stars::after{
    content:"";position:absolute;inset:0;
    background-image:
      radial-gradient(1px 1px at 20% 30%, #fff, transparent),
      radial-gradient(1px 1px at 70% 60%, #fff, transparent),
      radial-gradient(1px 1px at 40% 80%, #cdd, transparent),
      radial-gradient(1px 1px at 90% 20%, #fff, transparent),
      radial-gradient(1px 1px at 55% 15%, #bcd, transparent),
      radial-gradient(1px 1px at 12% 65%, #fff, transparent),
      radial-gradient(1px 1px at 82% 85%, #fff, transparent);
    background-repeat:repeat;background-size:600px 600px;
  }
  .stars::after{background-size:400px 400px;opacity:.5;animation:drift 120s linear infinite}
  @keyframes drift{from{transform:translateY(0)}to{transform:translateY(-400px)}}

  main{position:relative;z-index:1}

  .eyebrow{font-family:'IBM Plex Mono',monospace;font-size:11px;letter-spacing:.22em;
    text-transform:uppercase;color:var(--ion-soft)}

  /* hero */
  header.hero{position:relative;padding:84px 0 56px;border-bottom:1px solid var(--line);overflow:hidden}
  .hero-tag{display:flex;gap:14px;align-items:center;margin-bottom:26px;flex-wrap:wrap}
  .pill{font-family:'IBM Plex Mono',monospace;font-size:11px;letter-spacing:.12em;
    padding:5px 11px;border:1px solid var(--line);border-radius:100px;color:var(--mute);background:var(--panel-2)}
  .pill.live{color:var(--green);border-color:rgba(70,211,154,.4)}
  .pill.live::before{content:"";display:inline-block;width:6px;height:6px;border-radius:50%;
    background:var(--green);margin-right:7px;vertical-align:middle;box-shadow:0 0 8px var(--green);
    animation:pulse 1.8s ease-in-out infinite}
  @keyframes pulse{0%,100%{opacity:1}50%{opacity:.35}}
  h1.title{font-family:'Newsreader',serif;font-weight:500;font-size:clamp(40px,7vw,76px);
    line-height:1.02;letter-spacing:-.02em;margin:8px 0 6px}
  .sub{color:var(--mute);max-width:60ch;font-size:17px;margin-top:14px}

  .strip{display:grid;grid-template-columns:repeat(4,1fr);gap:1px;margin-top:44px;
    border:1px solid var(--line);border-radius:14px;overflow:hidden;background:var(--line)}
  .strip .cell{background:var(--deep);padding:20px 18px}
  .strip .v{font-family:'IBM Plex Mono',monospace;font-weight:600;font-size:clamp(20px,2.6vw,27px);letter-spacing:-.01em}
  .strip .v.plasma{color:var(--plasma-soft)} .strip .v.ion{color:var(--ion-soft)}
  .strip .k{font-size:11px;color:var(--faint);margin-top:6px;font-family:'IBM Plex Mono',monospace;
    letter-spacing:.04em;text-transform:uppercase}

  /* sections */
  section{padding:64px 0;border-bottom:1px solid var(--line)}
  .sec-head{display:flex;align-items:baseline;gap:16px;margin-bottom:8px}
  .sec-num{font-family:'IBM Plex Mono',monospace;font-size:13px;color:var(--plasma);
    border:1px solid rgba(255,92,58,.3);border-radius:6px;padding:2px 8px}
  h2{font-family:'Newsreader',serif;font-weight:500;font-size:clamp(26px,4vw,38px);letter-spacing:-.01em;line-height:1.1}
  .lede{color:var(--mute);max-width:68ch;margin-top:14px;font-size:16px}
  .empty{color:var(--faint);margin-top:30px;font-family:'IBM Plex Mono',monospace;font-size:13px}

  /* report cards */
  .grid{display:grid;gap:18px;margin-top:34px}
  .g2{grid-template-columns:repeat(2,1fr)}
  a.card{
    display:block;text-decoration:none;color:inherit;
    background:linear-gradient(180deg,var(--panel),var(--deep));
    border:1px solid var(--line);border-radius:16px;padding:24px;
    position:relative;overflow:hidden;transition:border-color .25s ease,transform .25s ease}
  a.card:hover{border-color:var(--ion);transform:translateY(-3px)}
  a.card:focus-visible{outline:2px solid var(--ion-soft);outline-offset:3px}
  .card .corner{position:absolute;top:0;right:0;font-family:'IBM Plex Mono',monospace;
    font-size:10px;letter-spacing:.1em;color:var(--faint);padding:9px 12px;text-transform:uppercase}
  .card h3{font-size:21px;font-weight:600;margin-bottom:6px;display:flex;align-items:center;gap:10px;flex-wrap:wrap}
  .card h3 .ticker{font-family:'IBM Plex Mono',monospace;font-weight:600;font-size:12px;
    letter-spacing:.05em;color:var(--plasma);border:1px solid rgba(255,92,58,.4);border-radius:6px;
    padding:3px 8px;background:rgba(255,92,58,.07)}
  .card .meta{font-family:'IBM Plex Mono',monospace;font-size:12px;color:var(--faint);
    display:flex;align-items:center;gap:8px}
  .card .meta .dot{width:7px;height:7px;border-radius:50%;background:var(--faint);flex:none}
  .card .meta .dot.done{background:var(--green);box-shadow:0 0 8px var(--green)}
  .card .go{display:inline-block;margin-top:18px;font-family:'IBM Plex Mono',monospace;
    font-size:13px;color:var(--ion-soft);letter-spacing:.02em}

  /* disclaimer */
  .disc{padding:48px 0 70px;text-align:center}
  .disc p{font-family:'IBM Plex Mono',monospace;font-size:12px;color:var(--faint);
    letter-spacing:.04em;max-width:62ch;margin:0 auto}
  .disc .big{color:var(--mute);font-size:13px;margin-bottom:10px}
  .src-note{font-size:12px;color:var(--faint);margin-top:18px;line-height:1.7}

  @media(max-width:860px){
    .strip{grid-template-columns:repeat(2,1fr)}
    .g2{grid-template-columns:1fr}
  }
  @media(prefers-reduced-motion:reduce){
    *{animation:none!important;transition:none!important}
    .reveal{opacity:1!important;transform:none!important}
  }
  .reveal{opacity:0;transform:translateY(14px);transition:opacity .6s ease,transform .6s ease}
  .reveal.in{opacity:1;transform:none}
</style>
</head>
<body>
<div class="stars" aria-hidden="true"></div>

<main>
  <header class="hero">
    <div class="wrap">
      <div class="hero-tag">
        <span class="pill live">Auto-generated index</span>
        <span class="pill">Updated ${esc(fmtDate(built))}</span>
        <span class="pill">Educational · not advice</span>
      </div>
      <div class="eyebrow">Education-only equity research</div>
      <h1 class="title">Equity Reports</h1>
      <p class="sub">Self-contained, interactive teardowns of IPOs and listed stocks — generated with Claude, published as static HTML. Pick a report below.</p>

      <div class="strip">
        <div class="cell"><div class="v">${total}</div><div class="k">Reports</div></div>
        <div class="cell"><div class="v ion">${counts.ipo || 0}</div><div class="k">IPOs</div></div>
        <div class="cell"><div class="v plasma">${counts.stock || 0}</div><div class="k">Stocks</div></div>
        <div class="cell"><div class="v">${esc(fmtDate(built))}</div><div class="k">Last built</div></div>
      </div>
    </div>
  </header>

    ${sections}

  <div class="disc"><div class="wrap">
    <p class="big">Educational only — not financial advice. Do your own research.</p>
    <p>Each report is an educational analysis of public information. Prices and figures are as of each report's own generation date and will have changed. Scores, probabilities and verdicts are analytical opinion, not fact.</p>
    <p class="src-note">This index is auto-generated from the reports/ directory by scripts/build-index.js.</p>
  </div></div>
</main>

<script>
  // Subtle reveal on scroll; disabled under prefers-reduced-motion via CSS.
  (function(){
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var els = document.querySelectorAll('.reveal');
    if (reduce || !('IntersectionObserver' in window)) {
      els.forEach(function(el){ el.classList.add('in'); });
      return;
    }
    var io = new IntersectionObserver(function(entries){
      entries.forEach(function(e){
        if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
      });
    }, { threshold: .15 });
    els.forEach(function(el){ io.observe(el); });
  })();
</script>
</body>
</html>
`;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const reports = findReports();
  // Make section/card markup eligible for the scroll reveal.
  const html = renderPage(reports)
    .replace(/<section>/g, '<section class="reveal">');
  fs.writeFileSync(OUT_FILE, html, 'utf8');
  console.log(`build-index: wrote ${path.relative(ROOT, OUT_FILE)} (${reports.length} report${reports.length === 1 ? '' : 's'})`);
}

main();

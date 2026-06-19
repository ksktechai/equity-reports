#!/usr/bin/env node
'use strict';

/*
 * stream-progress.js — turn Claude Code's `--output-format stream-json` into
 * friendly, human-readable progress lines on the terminal.
 *
 * Usage (inside new-report.sh):
 *   claude -p "..." --output-format stream-json --verbose | node scripts/stream-progress.js
 *
 * The report itself is written to disk by Claude's Write tool, so this filter
 * only consumes the event stream for display — it never touches the report.
 * It always exits 0 and never throws, so it can't mask Claude's own exit code
 * under `set -o pipefail`.
 *
 * Educational only — not financial advice.
 */

const readline = require('readline');

const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });

let searches = 0;
let lastBeat = Date.now();

function out(line) {
  process.stdout.write(line + '\n');
}

function trim(s, n = 80) {
  s = String(s || '').replace(/\s+/g, ' ').trim();
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

function handleToolUse(item) {
  const name = item.name || 'tool';
  const inp = item.input || {};
  switch (name) {
    case 'WebSearch':
      searches++;
      out(`   🔍 searching the web · "${trim(inp.query, 60)}"`);
      break;
    case 'WebFetch':
      out(`   🌐 fetching · ${trim(inp.url, 70)}`);
      break;
    case 'Read':
      out(`   📖 reading · ${trim(inp.file_path, 70)}`);
      break;
    case 'Write':
      out(`   💾 writing report → ${trim(inp.file_path, 70)}`);
      break;
    default:
      out(`   🔧 ${name}`);
  }
}

function handleLine(line) {
  line = line.trim();
  if (!line) return;
  let ev;
  try { ev = JSON.parse(line); } catch { return; }

  switch (ev.type) {
    case 'system':
      if (ev.subtype === 'init') {
        out(`● connected · model ${ev.model || '?'} · working…`);
      }
      break;

    case 'rate_limit_event': {
      const info = ev.rate_limit_info || {};
      if (info.status && info.status !== 'allowed') {
        out(`   ⏳ rate limit (${info.status}) — Claude will wait for the window to reset…`);
      }
      break;
    }

    case 'assistant': {
      const content = (ev.message && ev.message.content) || [];
      for (const item of content) {
        if (item.type === 'tool_use') {
          handleToolUse(item);
        } else if (item.type === 'text' && item.text && item.text.trim()) {
          out(`   ✍️  ${trim(item.text, 80)}`);
        }
      }
      break;
    }

    case 'result': {
      const secs = ev.duration_ms ? (ev.duration_ms / 1000).toFixed(0) : '?';
      if (ev.is_error) {
        out(`❌ run failed after ${secs}s${ev.api_error_status ? ` (${ev.api_error_status})` : ''}`);
      } else {
        const cost = typeof ev.total_cost_usd === 'number' ? ` · ~$${ev.total_cost_usd.toFixed(2)} of quota` : '';
        out(`✅ analysis complete in ${secs}s · ${searches} web search${searches === 1 ? '' : 'es'}${cost}`);
      }
      break;
    }
  }

  // Heartbeat: reassure during quiet stretches (e.g. a long single search).
  const now = Date.now();
  if (now - lastBeat > 20000) { out('   · still working…'); }
  lastBeat = now;
}

rl.on('line', handleLine);
rl.on('close', () => process.exit(0));

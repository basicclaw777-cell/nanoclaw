import fs from 'fs';
import path from 'path';
import 'dotenv/config';

const VAULT = path.join(process.env.HOME, 'cathedral-vault');
const ROUNDTABLE_DIR = path.join(VAULT, '00_Staging', 'roundtable');
const OUTPUT_DIR = path.join(process.env.HOME, 'nanoclaw', 'reed-lab');
const TOKEN = process.env.TELEGRAM_TOKEN;
const CHAT_ID = process.env.PAUL_CHAT_ID;
const OLLAMA = 'http://localhost:11434/api/chat';

function parseRoundtable(filepath) {
  const content = fs.readFileSync(filepath, 'utf8');
  const fm = content.match(/title:\s*"(.+?)"/)?.[1] || path.basename(filepath);
  const agents = content.match(/agents:\s*\[(.+?)\]/)?.[1]?.split(',').map(s => s.trim()) || [];
  const date = content.match(/date:\s*(\S+)/)?.[1] || '';

  const synthMatch = content.match(/## Steward Synthesis\s*([\s\S]*?)$/);
  const synth = {};
  if (synthMatch) {
    synth.consensus = synthMatch[1].match(/\*\*Consensus:\*\*\s*(.*?)(?:\n\n|\n\*\*)/s)?.[1]?.trim() || '';
    synth.tension = synthMatch[1].match(/\*\*Tension:\*\*\s*(.*?)(?:\n\n|\n\*\*)/s)?.[1]?.trim() || '';
    synth.principle = synthMatch[1].match(/\*\*Principle:\*\*\s*(.*?)(?:\n\n|\n\*\*)/s)?.[1]?.trim() || '';
    synth.actions = (synthMatch[1].match(/\*\*Actions:\*\*\s*([\s\S]*?)(?:\n\n\*\*|\n\n$)/)?.[1] || '')
      .split('\n').filter(l => l.startsWith('-')).map(l => l.replace(/^-\s*/, '').trim());
    synth.next = synthMatch[1].match(/\*\*Next roundtable:\*\*\s*(.*)/)?.[1]?.trim() || '';
  }

  return { title: fm.replace('Roundtable: ', ''), agents, date, synth, file: path.basename(filepath) };
}

async function generateExecutiveSummary(roundtables) {
  const input = roundtables.map(r =>
    `TOPIC: ${r.title}\nAgents: ${r.agents.join(', ')}\nConsensus: ${r.synth.consensus}\nTension: ${r.synth.tension}\nPrinciple: ${r.synth.principle}\nActions: ${r.synth.actions.join('; ')}`
  ).join('\n\n');

  const resp = await fetch(OLLAMA, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'hermes3',
      messages: [{
        role: 'user',
        content: `You are writing an executive brief for the owner of Basic Reflex boxing gym. 5 agent roundtables just happened. Distil into:

1. THE BIG PICTURE (2 sentences — what emerged across ALL roundtables)
2. TOP 3 ACTIONS (the most impactful, specific things to do this week)
3. EMERGING PRINCIPLE (if one theme kept appearing across roundtables, name it)
4. TENSION TO WATCH (the unresolved disagreement worth tracking)
5. NEXT WEEK'S QUESTION (the single most important question for next roundtable)

Be direct. No fluff. Paul is a builder — give him structure he can act on.

ROUNDTABLE DATA:
${input}`
      }],
      stream: false,
      options: { temperature: 0.3, num_predict: 500 }
    }),
    signal: AbortSignal.timeout(120000)
  });
  const data = await resp.json();
  return data.message?.content || 'Summary generation failed.';
}

function buildInfographic(roundtables, summary) {
  const date = new Date().toISOString().slice(0, 10);
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Roundtable Digest — ${date}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { background: #0a0a0a; color: #e0e0e0; font-family: 'SF Mono', 'Menlo', monospace; padding: 0; }

  .header {
    background: linear-gradient(135deg, #0a0a0a, #1a0808);
    padding: 40px 32px 32px;
    border-bottom: 2px solid #8B2020;
  }
  .header h1 { font-size: 22px; color: #fff; letter-spacing: 3px; margin-bottom: 4px; }
  .header .date { font-size: 12px; color: #8B2020; }
  .header .subtitle { font-size: 12px; color: #666; margin-top: 8px; }

  .big-picture {
    background: #111; border-left: 3px solid #8B2020;
    padding: 24px 32px; margin: 24px;
  }
  .big-picture h2 { font-size: 11px; color: #8B2020; letter-spacing: 2px; margin-bottom: 12px; }
  .big-picture p { font-size: 14px; color: #ccc; line-height: 1.6; }

  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; padding: 0 24px; }
  @media (max-width: 700px) { .grid { grid-template-columns: 1fr; } }

  .card {
    background: #111; border: 1px solid #1a1a1a; padding: 20px;
  }
  .card h3 { font-size: 11px; color: #8B2020; letter-spacing: 1.5px; margin-bottom: 12px; }
  .card .topic { font-size: 13px; color: #fff; font-weight: 600; margin-bottom: 8px; }
  .card .agents { font-size: 10px; color: #666; margin-bottom: 10px; }
  .card .consensus { font-size: 11px; color: #999; line-height: 1.5; margin-bottom: 8px; }
  .card .principle {
    font-size: 11px; color: #8B2020; font-style: italic;
    border-top: 1px solid #1a1a1a; padding-top: 8px; margin-top: 8px;
  }
  .card .actions { font-size: 11px; color: #777; }
  .card .actions li { margin-bottom: 4px; list-style: none; }
  .card .actions li::before { content: '→ '; color: #8B2020; }

  .actions-panel {
    background: #0d1a0d; border: 1px solid #1D9E75; padding: 24px 32px; margin: 24px;
  }
  .actions-panel h2 { font-size: 11px; color: #1D9E75; letter-spacing: 2px; margin-bottom: 16px; }
  .actions-panel ol { padding-left: 20px; }
  .actions-panel li { font-size: 13px; color: #ccc; margin-bottom: 8px; line-height: 1.5; }

  .tension {
    background: #1a1008; border: 1px solid #EF9F27; padding: 20px 32px; margin: 0 24px 24px;
  }
  .tension h2 { font-size: 11px; color: #EF9F27; letter-spacing: 2px; margin-bottom: 8px; }
  .tension p { font-size: 12px; color: #ccc; line-height: 1.5; }

  .next-q {
    background: #111; border: 2px solid #8B2020; padding: 24px 32px; margin: 0 24px 40px;
    text-align: center;
  }
  .next-q h2 { font-size: 11px; color: #8B2020; letter-spacing: 2px; margin-bottom: 12px; }
  .next-q p { font-size: 16px; color: #fff; font-weight: 600; line-height: 1.4; }

  .footer {
    text-align: center; padding: 24px; font-size: 10px; color: #333;
  }
</style>
</head>
<body>

<div class="header">
  <h1>ROUNDTABLE DIGEST</h1>
  <div class="date">${date}</div>
  <div class="subtitle">${roundtables.length} roundtables · ${[...new Set(roundtables.flatMap(r => r.agents))].length} agents · ${roundtables.reduce((s, r) => s + r.synth.actions.length, 0)} actions</div>
</div>

<div class="big-picture">
  <h2>EXECUTIVE SUMMARY</h2>
  <p>${summary.replace(/\n/g, '<br>')}</p>
</div>

<div class="grid">
${roundtables.map(r => `
  <div class="card">
    <h3>ROUNDTABLE</h3>
    <div class="topic">${r.title}</div>
    <div class="agents">${r.agents.join(' · ')}</div>
    <div class="consensus">${r.synth.consensus}</div>
    ${r.synth.principle && r.synth.principle !== 'None' && r.synth.principle !== 'None emerged'
      ? `<div class="principle">"${r.synth.principle}"</div>` : ''}
    ${r.synth.actions.length > 0 ? `<ul class="actions">${r.synth.actions.slice(0, 3).map(a => `<li>${a}</li>`).join('')}</ul>` : ''}
  </div>
`).join('')}
</div>

<div class="actions-panel">
  <h2>TOP ACTIONS THIS WEEK</h2>
  <ol>
${roundtables.flatMap(r => r.synth.actions).slice(0, 8).map(a => `    <li>${a}</li>`).join('\n')}
  </ol>
</div>

<div class="tension">
  <h2>TENSIONS TO WATCH</h2>
${roundtables.filter(r => r.synth.tension && !r.synth.tension.includes('no significant')).map(r =>
  `  <p><strong>${r.title}:</strong> ${r.synth.tension}</p>`
).join('\n') || '  <p>No significant tensions this week.</p>'}
</div>

<div class="next-q">
  <h2>NEXT WEEK'S QUESTION</h2>
  <p>${roundtables[roundtables.length - 1]?.synth.next || 'To be determined.'}</p>
</div>

<div class="footer">
  Basic Reflex · The Cathedral · ${date} · Generated by The Steward
</div>

</body>
</html>`;
}

async function sendText(text) {
  await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: CHAT_ID, text })
  });
}

async function run() {
  // Find today's roundtables (or all if --all flag)
  const allFlag = process.argv.includes('--all');
  const today = new Date().toISOString().slice(0, 10);

  const files = fs.readdirSync(ROUNDTABLE_DIR)
    .filter(f => f.endsWith('.md') && (allFlag || f.includes(today)))
    .map(f => path.join(ROUNDTABLE_DIR, f));

  if (files.length === 0) {
    console.log('[digest] No roundtables found for today.');
    return;
  }

  console.log(`[digest] Processing ${files.length} roundtables...`);
  const roundtables = files.map(parseRoundtable);

  // Generate executive summary via LLM
  console.log('[digest] Generating executive summary...');
  const summary = await generateExecutiveSummary(roundtables);

  // Build infographic HTML
  const html = buildInfographic(roundtables, summary);
  const htmlPath = path.join(OUTPUT_DIR, `roundtable-digest-${today}.html`);
  fs.writeFileSync(htmlPath, html);
  console.log(`[digest] Infographic saved: ${htmlPath}`);

  // Build text digest for Telegram
  const telegramDigest = `🏛️ ROUNDTABLE DIGEST — ${today}

${roundtables.length} roundtables · ${[...new Set(roundtables.flatMap(r => r.agents))].length} agents

${summary}

📊 Visual digest: localhost:8080/reed-lab/digest`;

  await sendText(telegramDigest);

  // Save to vault
  const digestMd = `---
title: "Roundtable Digest ${today}"
date: ${today}
type: digest
domain: cathedral
status: active
tags: [roundtable, digest, steward]
---

# Roundtable Digest — ${today}

${roundtables.length} roundtables, ${[...new Set(roundtables.flatMap(r => r.agents))].length} agents, ${roundtables.reduce((s, r) => s + r.synth.actions.length, 0)} actions

## Executive Summary

${summary}

## Roundtable Results

${roundtables.map(r => `### ${r.title}
**Agents:** ${r.agents.join(', ')}
**Consensus:** ${r.synth.consensus}
**Tension:** ${r.synth.tension}
**Principle:** ${r.synth.principle}
**Actions:** ${r.synth.actions.join('; ')}
`).join('\n')}

## All Actions

${roundtables.flatMap(r => r.synth.actions).map((a, i) => `${i + 1}. ${a}`).join('\n')}
`;

  fs.writeFileSync(path.join(ROUNDTABLE_DIR, `digest-${today}.md`), digestMd);
  console.log('[digest] Vault digest saved.');
}

run().catch(console.error);

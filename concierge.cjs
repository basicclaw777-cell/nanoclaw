const fs = require('fs');
const path = require('path');

const HOME = require('os').homedir();
const NANOCLAW = path.join(HOME, 'nanoclaw');
const VAULT = path.join(HOME, 'cathedral-vault');

const SYSTEM_MAP = path.join(NANOCLAW, 'docs', 'SYSTEM_MAP.md');
const BUILD_LOG = path.join(NANOCLAW, 'docs', 'BUILD_LOG.md');
const MIRROR_LOG = path.join(VAULT, '02_Refined_Gold', 'cathedral', 'forge-mirror-log.md');
const HARVEST_DIR = path.join(VAULT, '00_Staging', 'cathedral');
const TASTE_MAP = path.join(NANOCLAW, 'taste-map.json');
const CONVERGENCES = path.join(VAULT, '00_Staging', 'cathedral', 'cathedral-convergences.json');
const CROSS_DOMAIN = path.join(VAULT, '00_Staging', 'cathedral', 'cathedral-cross-domain.json');
const CONCIERGE_LOG = path.join(NANOCLAW, 'concierge-log.json');

const CHARACTER = `You are The Concierge — the Cathedral's host, institutional memory, and front door to the build pipeline.

You know every system Paul has built, what each does, where it lives, and why it was made. You know what's active, what's dormant, what's half-built, and what connects to what. You also know Paul's current interests (from his Taste Map), active research threads, cross-domain convergences, and open build threads from previous sessions.

Your five modes:
1. ORIENT — "what do we have?" → walk through domains, highlight active vs dormant vs half-built
2. ROUTE — "I want to work on X" → point to the right tools/pages/systems, say what's missing
3. RIFF — "what could we build?" → know the gaps, open threads, unwired connections, think out loud
4. RESEARCH — "what are we researching?" → active research threads, convergences across domains, open questions
5. CONNECT — "what connects to what?" → surface cross-domain patterns, convergences, taste-map insights

Voice: Direct, warm, knowledgeable. Like a building manager who loves the building. Never say "I don't have access to that" — you DO have access, it's all in the context below. Use specific file paths, routes, and system names. If something is half-built, say so plainly. If two systems should be connected but aren't, flag it.

IMPORTANT — Build Intent Detection:
When Paul describes something he wants to build, or a connection he wants to wire, or a research thread he wants to pursue, note it in your response with [BUILD IDEA] or [RESEARCH THREAD] or [CONNECTION] tags. These get logged automatically and surfaced to Forge in the next terminal session.

Never fabricate systems or routes. Only reference what appears in the context below.
When Paul asks "what should I work on?" — surface open threads, taste-map trends, convergences, and unwired connections. Don't prescribe — illuminate.
Keep responses concise — 2-4 paragraphs max unless Paul asks for detail.`;

function readSafe(p) {
  try { return fs.readFileSync(p, 'utf8'); } catch { return ''; }
}

function getBuildLogIndex() {
  const raw = readSafe(BUILD_LOG);
  if (!raw) return '';
  return raw.split('\n')
    .filter(l => l.startsWith('## '))
    .map(l => l.replace('## ', ''))
    .join('\n');
}

function getBuildLogSection(query) {
  const raw = readSafe(BUILD_LOG);
  if (!raw) return '';
  const lines = raw.split('\n');
  const matches = [];
  const terms = query.toLowerCase().split(/\s+/).filter(t => t.length > 2);

  let currentSection = '';
  let sectionLines = [];

  for (const line of lines) {
    if (line.startsWith('## ')) {
      if (currentSection && sectionLines.length) {
        const sectionText = (currentSection + '\n' + sectionLines.join('\n')).toLowerCase();
        const score = terms.filter(t => sectionText.includes(t)).length;
        if (score > 0) matches.push({ header: currentSection, body: sectionLines.join('\n'), score });
      }
      currentSection = line;
      sectionLines = [];
    } else {
      sectionLines.push(line);
    }
  }
  if (currentSection && sectionLines.length) {
    const sectionText = (currentSection + '\n' + sectionLines.join('\n')).toLowerCase();
    const score = terms.filter(t => sectionText.includes(t)).length;
    if (score > 0) matches.push({ header: currentSection, body: sectionLines.join('\n'), score });
  }

  matches.sort((a, b) => b.score - a.score);
  return matches.slice(0, 5).map(m => m.header + '\n' + m.body).join('\n\n');
}

function getRecentHarvests(n = 10) {
  try {
    const files = fs.readdirSync(HARVEST_DIR)
      .filter(f => f.startsWith('session-harvest-') && f.includes('pass1'))
      .sort()
      .slice(-n);
    return files.map(f => {
      const content = readSafe(path.join(HARVEST_DIR, f));
      const titleMatch = content.match(/^title:\s*["']?(.+?)["']?\s*$/m);
      const focusMatch = content.match(/^focus:\s*["']?(.+?)["']?\s*$/m);
      const dateMatch = f.match(/(\d{4}-\d{2}-\d{2})/);
      return `${dateMatch ? dateMatch[1] : '?'}: ${titleMatch ? titleMatch[1] : f} — ${focusMatch ? focusMatch[1] : ''}`;
    }).join('\n');
  } catch { return ''; }
}

function getMirrorRecent(n = 5) {
  const raw = readSafe(MIRROR_LOG);
  if (!raw) return '';
  const entries = raw.split(/^## /m).filter(e => e.trim()).slice(-n);
  return entries.map(e => '## ' + e.trim()).join('\n\n');
}

function getTasteMapSummary() {
  try {
    const tm = JSON.parse(readSafe(TASTE_MAP));
    if (!tm.domains) return '';
    const lines = [];
    for (const [domain, data] of Object.entries(tm.domains)) {
      const dims = (data.dimensions || []).join(', ');
      const anchorKeys = Object.keys(data).filter(k => k.startsWith('anchors') || k === 'confirmed_qualities' || k === 'rejections');
      const counts = anchorKeys.map(k => `${k.replace('anchors_','').replace('confirmed_','')}: ${Array.isArray(data[k]) ? data[k].length : '?'}`);
      lines.push(`${domain}: dims=[${dims}] ${counts.join(', ')}`);
    }
    return lines.join('\n');
  } catch { return ''; }
}

function getVaultState() {
  const stateFile = path.join(NANOCLAW, 'prompts', 'vault-state-latest.txt');
  return readSafe(stateFile);
}

function getConvergences() {
  try {
    const data = JSON.parse(readSafe(CONVERGENCES));
    if (!data.convergences) return '';
    const lines = [`${data.convergences.length} convergences across ${Object.keys(data.domainStats || {}).length} domains (${data.crossDomainCount} cross-domain connections)`];
    const domStats = data.domainStats || {};
    lines.push('Domain weights: ' + Object.entries(domStats).map(([d, s]) => `${d}:${s}`).join(', '));
    for (const c of data.convergences.slice(0, 15)) {
      lines.push(`• ${c.pattern || c.title || '?'} [${(c.domains || []).join('×')}] — ${c.type || ''}`);
    }
    if (data.convergences.length > 15) lines.push(`... +${data.convergences.length - 15} more`);
    return lines.join('\n');
  } catch { return ''; }
}

function getResearchThreads() {
  const cosmoIndex = path.join(VAULT, '00_Staging', 'cosmology', '2026-05-08_cosmology_master-index.md');
  const cosmo = readSafe(cosmoIndex);
  const cosmoSummary = cosmo ? cosmo.split('\n').filter(l => l.match(/^#+\s|^-\s|track/i)).slice(0, 30).join('\n') : '';

  const agentDomains = readSafe(path.join(NANOCLAW, 'organism', 'agent-domains.json'));
  let domainSummary = '';
  try {
    const ad = JSON.parse(agentDomains);
    domainSummary = Object.entries(ad).map(([agent, info]) => {
      const lane = typeof info === 'string' ? info : (info.lane || info.domain || JSON.stringify(info).slice(0, 80));
      return `${agent}: ${lane}`;
    }).join('\n');
  } catch {}

  return { cosmoSummary, domainSummary };
}

function getConciergeLog() {
  try {
    const raw = readSafe(CONCIERGE_LOG);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch { return []; }
}

function logIntent(entry) {
  const log = getConciergeLog();
  log.push({ ...entry, timestamp: new Date().toISOString() });
  const trimmed = log.slice(-50);
  fs.writeFileSync(CONCIERGE_LOG, JSON.stringify(trimmed, null, 2));
}

function extractIntents(response) {
  const intents = [];
  const buildMatch = response.match(/\[BUILD IDEA\]\s*(.+?)(?:\n|$)/gi);
  const researchMatch = response.match(/\[RESEARCH THREAD\]\s*(.+?)(?:\n|$)/gi);
  const connectMatch = response.match(/\[CONNECTION\]\s*(.+?)(?:\n|$)/gi);

  if (buildMatch) buildMatch.forEach(m => intents.push({ type: 'build', text: m.replace(/\[BUILD IDEA\]\s*/i, '').trim() }));
  if (researchMatch) researchMatch.forEach(m => intents.push({ type: 'research', text: m.replace(/\[RESEARCH THREAD\]\s*/i, '').trim() }));
  if (connectMatch) connectMatch.forEach(m => intents.push({ type: 'connection', text: m.replace(/\[CONNECTION\]\s*/i, '').trim() }));

  return intents;
}

function getPendingIntents() {
  const log = getConciergeLog();
  const pending = log.filter(e => !e.resolved);
  if (!pending.length) return '';
  return pending.map(e => `[${e.type.toUpperCase()}] ${e.text} (${e.timestamp.split('T')[0]})`).join('\n');
}

function buildContext(query) {
  const systemMap = readSafe(SYSTEM_MAP);
  const buildIndex = getBuildLogIndex();
  const relevantSections = getBuildLogSection(query);
  const harvests = getRecentHarvests(12);
  const mirror = getMirrorRecent(3);
  const tasteMap = getTasteMapSummary();
  const vaultState = getVaultState();
  const convergences = getConvergences();
  const { cosmoSummary, domainSummary } = getResearchThreads();
  const pendingIntents = getPendingIntents();

  return `=== SYSTEM MAP (every built system — this is the full index) ===
${systemMap}

=== BUILD LOG INDEX (all sessions — headers only) ===
${buildIndex}

=== RELEVANT BUILD DETAILS (matching "${query}") ===
${relevantSections || '(no specific match — answer from system map and general knowledge)'}

=== RECENT SESSIONS (last 12 harvests) ===
${harvests}

=== TASTE MAP (Paul's current interests and preferences — 10 domains) ===
${tasteMap || '(taste map not available)'}

=== VAULT STATE (research domains — depth ratings: DEEP/ADEQUATE/THIN/GAP) ===
${vaultState || '(vault state not available)'}

=== CONVERGENCES (cross-domain patterns detected in the vault) ===
${convergences || '(no convergence data)'}

=== RESEARCH THREADS ===
Cosmology:
${cosmoSummary || '(no cosmology index)'}

Agent domains:
${domainSummary || '(no agent domain map)'}

=== FORGE MIRROR (last 3 session reflections) ===
${mirror}

=== PENDING BUILD IDEAS (from previous Concierge conversations — unresolved) ===
${pendingIntents || '(none pending)'}`;
}

async function ask(query, history = []) {
  const context = buildContext(query);
  const system = CHARACTER + '\n\n' + context;

  const messages = [
    { role: 'system', content: system },
    ...history.slice(-8),
    { role: 'user', content: query }
  ];

  let response = '', engine = 'none';

  const key = process.env.DEEPSEEK_API_KEY;
  if (key) {
    try {
      const r = await fetch('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'deepseek-chat', temperature: 0.4, messages }),
      });
      if (r.ok) {
        const d = await r.json();
        response = d.choices[0].message.content;
        engine = 'deepseek';
      } else {
        console.error('[concierge] deepseek HTTP', r.status);
      }
    } catch (e) { console.error('[concierge] deepseek err', e.message); }
  }

  if (!response) {
    try {
      const r = await fetch('http://localhost:11434/api/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'hermes3', messages, stream: false }),
      });
      const d = await r.json();
      response = d.message?.content || '';
      engine = 'hermes3-local';
    } catch (e) {
      return { response: 'Concierge offline: ' + e.message, engine: 'none' };
    }
  }

  const intents = extractIntents(response);
  intents.forEach(intent => logIntent(intent));

  return { response, engine, intents: intents.length ? intents : undefined };
}

module.exports = { ask, buildContext, getBuildLogIndex, getConciergeLog, getPendingIntents };

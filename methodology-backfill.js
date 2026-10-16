// ── Methodology Backfill ─────────────────────────────────────────────────────
// Targeted extraction of Paul's methodology from terminal session transcripts.
// Runs phased: Universe → Boxing/BR → Cathedral.
// Output: ~/cathedral-vault/06_Methods/ methodology nuggets only.
//
// Usage: node methodology-backfill.js --phase universe|boxing|cathedral|deepseek|wide
//        node methodology-backfill.js --phase universe --dry-run
//        node methodology-backfill.js --phase wide        (re-scan large sessions, mid-session window)
//        node methodology-backfill.js --phase deepseek    (scan ~/raw-chats/deepseek/)
// ─────────────────────────────────────────────────────────────────────────────

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SESSIONS_DIR = path.join(process.env.HOME, '.claude/projects/-Users-basicclaw777');
const VAULT_DEST = path.join(process.env.HOME, 'cathedral-vault/06_Methods');
const STATE_FILE = path.join(__dirname, 'methodology-backfill-state.json');
const ENV_FILE = path.join(__dirname, '.env');

// ── Domain classifiers ──────────────────────────────────────────────────────

const DOMAIN_KEYWORDS = {
  universe: [
    'cosmology', 'cosmos', 'enclosed', 'flat earth', 'dome', 'firmament',
    'electric universe', 'plasma', 'aether', 'tesla', 'schauberger', 'rife',
    'suppression', 'sacred geometry', 'vortex', 'frequency', 'resonance',
    'zero-point', 'looking-glass', 'sky-sense', 'whisperer', 'aletheia',
    'docent', 'epistemic', 'triage', 'simpsons-forensics', 'map-room',
    'deepseek-research', 'claim-ab', 'eiren', 'cosmology-researcher',
    'cosmology-podcast', 'track ', 'grade a', 'grade b', 'grade c',
    'ensemble-gate', 'convergence', 'obliteratus'
  ],
  boxing: [
    'boxing', 'punch', 'guard', 'combo', 'jab', 'cross', 'hook', 'uppercut',
    'footwork', 'padwork', 'sparring', 'bagwork', 'shadowbox', 'basic reflex',
    'gym eyes', 'student', 'drill', 'curriculum', 'block-config', 'reed',
    'higgsfield', 'maya', 'ling', 'content studio', 'br-', 'coach paul',
    'technique-library', 'boxing-delta', 'movement', 'punchpass', 'logan',
    'soul v2', 'pro-photo', 'cinema-grade', 'fear gate', 'diagnostic empathy',
    'healing registry', 'pretta', 'coaching'
  ],
  cathedral: [
    'cathedral', 'forge', 'orc', 'orchestrator', 'vault', 'standing instruction',
    'claude.md', 'pm2', 'cath-bridge', 'telegram-bot', 'architecture',
    'agent engine', 'court member', 'muse', 'archivist', 'cartographer',
    'timekeeper', 'groundskeeper', 'genius council', 'roundtable',
    'partnership relay', 'paul kernel', '4-to-8', 'taste map', 'architect',
    'department intelligence', 'paper trial', 'predictive', 'constellation',
    'environments platform', 'villa', 'session closer', 'harvester',
    'graphify', 'knowledge graph', 'emergence', 'sovereignty', 'curiosity loop',
    'dm-processor', 'internship frame'
  ]
};

function classifySession(messages) {
  const text = messages.map(m => m.text).join(' ').toLowerCase();
  const scores = {};
  for (const [domain, keywords] of Object.entries(DOMAIN_KEYWORDS)) {
    scores[domain] = keywords.filter(k => text.includes(k)).length;
  }
  // Return all domains with score > 2 (sessions can be multi-domain)
  const primary = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  return {
    primary: primary[0]?.[1] > 2 ? primary[0][0] : 'uncategorized',
    scores,
    all: primary.filter(([, s]) => s > 2).map(([d]) => d)
  };
}

// ── Session parsing ─────────────────────────────────────────────────────────

function parseSession(filepath) {
  const lines = fs.readFileSync(filepath, 'utf8').split('\n').filter(Boolean);
  const messages = [];
  let sessionId = path.basename(filepath, '.jsonl');

  for (const line of lines) {
    try {
      const d = JSON.parse(line);
      if (d.type === 'user' && d.message?.content) {
        const content = typeof d.message.content === 'string'
          ? d.message.content
          : Array.isArray(d.message.content)
            ? d.message.content.filter(b => b.type === 'text').map(b => b.text).join('\n')
            : '';
        if (content && !content.startsWith('<system') && content.length > 20) {
          messages.push({ role: 'user', text: content.slice(0, 800), ts: d.timestamp });
        }
      } else if (d.type === 'assistant' && d.message?.content) {
        const content = typeof d.message.content === 'string'
          ? d.message.content
          : Array.isArray(d.message.content)
            ? d.message.content.filter(b => b.type === 'text').map(b => b.text).join('\n')
            : '';
        if (content && content.length > 30) {
          messages.push({ role: 'assistant', text: content.slice(0, 800), ts: d.timestamp });
        }
      }
    } catch { /* skip malformed */ }
  }

  return { sessionId, messages };
}

// ── Env + state ─────────────────────────────────────────────────────────────

function loadEnv() {
  try {
    const env = fs.readFileSync(ENV_FILE, 'utf8');
    return {
      deepseekKey: env.match(/DEEPSEEK_API_KEY=(.+)/)?.[1]?.trim(),
      botToken: env.match(/TELEGRAM_BOT_TOKEN=(.+)/)?.[1]?.trim(),
      chatId: env.match(/TELEGRAM_CHAT_ID=(.+)/)?.[1]?.trim()
    };
  } catch { return {}; }
}

function loadState() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); }
  catch { return { processed: {}, nuggets: [] }; }
}

function saveState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

async function notify(text) {
  const { botToken, chatId } = loadEnv();
  if (!botToken || !chatId) { console.log(text); return; }
  const msg = text.length > 4096 ? text.slice(0, 4070) + '\n[truncated]' : text;
  try {
    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: msg })
    });
  } catch {}
}

// ── Methodology extraction via DeepSeek ─────────────────────────────────────

async function extractMethodology(transcript, sessionId, domain) {
  const { deepseekKey } = loadEnv();
  if (!deepseekKey) {
    console.error('[backfill] No DEEPSEEK_API_KEY');
    process.exit(1);
  }

  const res = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${deepseekKey}`
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [
        {
          role: 'system',
          content: `You are extracting METHODOLOGY from a Cathedral build session transcript.

You are looking for Paul's cognitive moves — how he thinks, diagnoses, builds, and teaches.
NOT what was built (that's already harvested). ONLY how he arrived there.

Extract these categories:

1. NAMED PATTERNS — Did Paul name a pattern, method, or principle? (e.g. "Mandate Without Mechanism", "the 4-to-8 question", "event-driven over scheduled"). Include the name AND the definition.

2. COGNITIVE MOVES — How did Paul arrive at a conclusion? Did he use analogy, Socratic questioning, reframing, inversion, cross-domain bridging? Describe the move, not just the conclusion.

3. DESIGN PRINCIPLES — Explicit or implied rules for how things should be built. (e.g. "Level 3 minimum for new agents", "cron only when clock IS the signal")

4. COACHING TECHNIQUES — Boxing or AI coaching methods. How Paul diagnoses, corrects, encourages. (e.g. "Trojan Horse Principle — skill works because people came for boxing")

5. REFRAMES — Moments where Paul shifted the frame on a problem. What was the old frame? What did he replace it with? Why did it matter?

Rules:
- If a category has nothing, skip it entirely.
- If the session has NO methodology (pure build, no cognitive moves), respond with exactly: "NO_METHODOLOGY"
- Be specific. Quote Paul's words when possible.
- Each finding should be 2-4 sentences. Name it if Paul named it. Describe the move if he didn't.
- Maximum 5 findings per session. Quality over quantity.
- Domain context: ${domain}`
        },
        {
          role: 'user',
          content: `Session ${sessionId} transcript:\n\n${transcript.slice(0, 12000)}`
        }
      ],
      temperature: 0.3,
      max_tokens: 2000
    })
  });

  const data = await res.json();
  return data.choices?.[0]?.message?.content?.trim() || 'NO_METHODOLOGY';
}

// ── Main ────────────────────────────────────────────────────────────────────

async function run() {
  const args = process.argv.slice(2);
  const phaseIdx = args.indexOf('--phase');
  const phase = phaseIdx >= 0 ? args[phaseIdx + 1] : null;
  const dryRun = args.includes('--dry-run');

  if (!phase || !['universe', 'boxing', 'cathedral', 'deepseek', 'wide'].includes(phase)) {
    console.log('Usage: node methodology-backfill.js --phase universe|boxing|cathedral|deepseek|wide [--dry-run]');
    process.exit(1);
  }

  const state = loadState();
  console.log(`[backfill] Phase: ${phase} ${dryRun ? '(DRY RUN)' : ''}`);

  // ── DeepSeek phase: scan ~/raw-chats/deepseek/ ──
  if (phase === 'deepseek') {
    const DEEPSEEK_DIR = path.join(process.env.HOME, 'raw-chats/deepseek');
    const dsFiles = fs.readdirSync(DEEPSEEK_DIR)
      .filter(f => f.endsWith('.md') || f.endsWith('.txt'))
      .map(f => ({
        name: f,
        path: path.join(DEEPSEEK_DIR, f),
        sessionId: f.replace(/\.(md|txt)$/, '').replace(/\s+/g, '-').slice(0, 40),
        size: fs.statSync(path.join(DEEPSEEK_DIR, f)).size
      }))
      .filter(f => f.size > 500)
      .sort((a, b) => b.size - a.size);

    console.log(`[backfill] ${dsFiles.length} DeepSeek transcripts`);

    const findings = [];
    for (let i = 0; i < dsFiles.length; i++) {
      const file = dsFiles[i];
      const stateKey = `deepseek:${file.sessionId}`;
      if (state.processed[stateKey]) continue;

      if (dryRun) {
        console.log(`  ${file.name}  size=${(file.size / 1024).toFixed(0)}KB`);
        continue;
      }

      console.log(`[backfill] [${i + 1}/${dsFiles.length}] ${file.name}`);
      const content = fs.readFileSync(file.path, 'utf8');
      // DeepSeek transcripts are plain text, send directly
      const transcript = content.slice(0, 12000);

      try {
        const result = await extractMethodology(transcript, file.sessionId, 'deepseek-research');
        if (result === 'NO_METHODOLOGY' || result.length < 50) {
          state.processed[stateKey] = { result: 'none', date: new Date().toISOString() };
          console.log(`  → No methodology found`);
        } else {
          findings.push({ sessionId: file.sessionId, domains: ['deepseek'], score: 0, content: result });
          state.processed[stateKey] = { result: 'found', date: new Date().toISOString() };
          console.log(`  → Methodology extracted (${result.length} chars)`);
        }
        if (i < dsFiles.length - 1) await new Promise(r => setTimeout(r, 2000));
      } catch (e) {
        console.error(`  → Error: ${e.message}`);
        state.processed[stateKey] = { result: 'error', error: e.message, date: new Date().toISOString() };
      }
    }

    if (dryRun) return;

    if (findings.length > 0) {
      const date = new Date().toISOString().split('T')[0];
      const filename = `methodology-backfill-deepseek-${date}.md`;
      const filepath = path.join(VAULT_DEST, filename);
      const content = `---\ntitle: "Methodology Backfill — DeepSeek Transcripts"\nsource: deepseek-transcript-backfill\ndomain: deepseek\ndate: ${date}\nsessions_scanned: ${dsFiles.length}\nmethodology_found: ${findings.length}\ntype: methodology-extraction\n---\n\n# Methodology Backfill — DeepSeek Transcripts\n\nExtracted from ${dsFiles.length} DeepSeek transcripts. ${findings.length} contained methodology.\n\n${findings.map(f => `---\n\n## ${f.sessionId}\n\n${f.content}\n`).join('\n')}\n`;
      fs.writeFileSync(filepath, content);
      state.nuggets.push({ phase: 'deepseek', date, file: filename, count: findings.length });
      console.log(`[backfill] Written: ${filename}`);
    }
    saveState(state);
    const digest = [`Methodology Backfill [deepseek]`, `Transcripts scanned: ${dsFiles.length}`, `Methodology found: ${findings.length}`, '', ...findings.map(f => `[${f.sessionId}] ${f.content.slice(0, 120)}...`)].join('\n');
    await notify(digest);
    console.log(`[backfill] Phase deepseek complete. ${findings.length} methodology nuggets.`);
    return;
  }

  // ── Wide phase: re-scan large sessions with mid-session window ──
  if (phase === 'wide') {
    const MIN_SIZE = 4 * 1024 * 1024; // 4MB+ sessions only
    const wideFiles = fs.readdirSync(SESSIONS_DIR)
      .filter(f => f.endsWith('.jsonl'))
      .map(f => ({ name: f, path: path.join(SESSIONS_DIR, f), sessionId: f.replace('.jsonl', ''), size: fs.statSync(path.join(SESSIONS_DIR, f)).size }))
      .filter(f => f.size >= MIN_SIZE)
      .sort((a, b) => b.size - a.size);

    console.log(`[backfill] ${wideFiles.length} large sessions (>4MB)`);

    const findings = [];
    for (let i = 0; i < wideFiles.length; i++) {
      const file = wideFiles[i];
      const stateKey = `wide:${file.sessionId}`;
      if (state.processed[stateKey]) continue;

      const { messages } = parseSession(file.path);

      if (dryRun) {
        console.log(`  ${file.sessionId.slice(0, 8)}  msgs=${messages.length}  size=${(file.size / (1024*1024)).toFixed(1)}MB`);
        continue;
      }

      // Three windows: early (0-40), mid (40% mark), late (last 60)
      const windows = [
        { label: 'mid', msgs: messages.slice(Math.floor(messages.length * 0.35), Math.floor(messages.length * 0.35) + 60) },
        { label: 'late', msgs: messages.slice(-60) }
      ];

      console.log(`[backfill] [${i + 1}/${wideFiles.length}] ${file.sessionId.slice(0, 8)} (${messages.length} msgs, ${(file.size / (1024*1024)).toFixed(1)}MB)`);

      for (const win of windows) {
        const winKey = `wide-${win.label}:${file.sessionId}`;
        if (state.processed[winKey]) continue;

        const transcript = win.msgs.map(m => `[${m.role}]: ${m.text}`).join('\n\n');
        if (transcript.length < 500) continue;

        try {
          const result = await extractMethodology(transcript, `${file.sessionId.slice(0, 8)}-${win.label}`, 'wide-scan');
          if (result === 'NO_METHODOLOGY' || result.length < 50) {
            state.processed[winKey] = { result: 'none', date: new Date().toISOString() };
            console.log(`  → ${win.label}: No methodology`);
          } else {
            findings.push({ sessionId: `${file.sessionId.slice(0, 8)}-${win.label}`, domains: ['wide'], score: 0, content: result });
            state.processed[winKey] = { result: 'found', date: new Date().toISOString() };
            console.log(`  → ${win.label}: Methodology extracted (${result.length} chars)`);
          }
          await new Promise(r => setTimeout(r, 2000));
        } catch (e) {
          console.error(`  → ${win.label} Error: ${e.message}`);
          state.processed[winKey] = { result: 'error', error: e.message, date: new Date().toISOString() };
        }
      }
    }

    if (dryRun) return;

    if (findings.length > 0) {
      const date = new Date().toISOString().split('T')[0];
      const filename = `methodology-backfill-wide-${date}.md`;
      const filepath = path.join(VAULT_DEST, filename);
      const content = `---\ntitle: "Methodology Backfill — Wide Window Re-scan"\nsource: wide-window-backfill\ndate: ${date}\nsessions_scanned: ${wideFiles.length}\nmethodology_found: ${findings.length}\ntype: methodology-extraction\n---\n\n# Methodology Backfill — Wide Window Re-scan\n\nRe-scanned ${wideFiles.length} large sessions (>4MB) with mid-session and late-session windows.\n${findings.length} methodology nuggets found in previously missed sections.\n\n${findings.map(f => `---\n\n## ${f.sessionId}\n\n${f.content}\n`).join('\n')}\n`;
      fs.writeFileSync(filepath, content);
      state.nuggets.push({ phase: 'wide', date, file: filename, count: findings.length });
      console.log(`[backfill] Written: ${filename}`);
    }
    saveState(state);
    const digest = [`Methodology Backfill [wide]`, `Large sessions re-scanned: ${wideFiles.length}`, `New methodology found: ${findings.length}`, '', ...findings.map(f => `[${f.sessionId}] ${f.content.slice(0, 120)}...`)].join('\n');
    await notify(digest);
    console.log(`[backfill] Phase wide complete. ${findings.length} methodology nuggets.`);
    return;
  }

  // ── Standard domain phases (universe/boxing/cathedral) ──
  // Scan all sessions
  const files = fs.readdirSync(SESSIONS_DIR)
    .filter(f => f.endsWith('.jsonl'))
    .map(f => ({
      name: f,
      path: path.join(SESSIONS_DIR, f),
      sessionId: f.replace('.jsonl', ''),
      size: fs.statSync(path.join(SESSIONS_DIR, f)).size
    }))
    .filter(f => f.size > 10000) // skip tiny sessions
    .sort((a, b) => b.size - a.size); // largest first (richest content)

  console.log(`[backfill] ${files.length} sessions to scan`);

  // Classify and filter to target phase
  const targetSessions = [];
  for (const file of files) {
    const stateKey = `${phase}:${file.sessionId}`;
    if (state.processed[stateKey]) continue;

    const { messages } = parseSession(file.path);
    if (messages.length < 10) continue;

    const classification = classifySession(messages);
    if (classification.all.includes(phase)) {
      targetSessions.push({
        ...file,
        messages,
        classification,
        score: classification.scores[phase]
      });
    }
  }

  console.log(`[backfill] ${targetSessions.length} ${phase} sessions found`);

  if (dryRun) {
    for (const s of targetSessions) {
      console.log(`  ${s.sessionId.slice(0, 8)}  score=${s.score}  msgs=${s.messages.length}  size=${(s.size / 1024).toFixed(0)}KB  domains=${s.classification.all.join(',')}`);
    }
    return;
  }

  if (targetSessions.length === 0) {
    await notify(`Methodology Backfill [${phase}]: No unprocessed sessions found.`);
    return;
  }

  // Extract methodology from each
  const findings = [];
  for (let i = 0; i < targetSessions.length; i++) {
    const session = targetSessions[i];
    const stateKey = `${phase}:${session.sessionId}`;

    console.log(`[backfill] [${i + 1}/${targetSessions.length}] ${session.sessionId.slice(0, 8)} (${session.messages.length} msgs, score=${session.score})`);

    const transcript = session.messages
      .slice(0, 60)
      .map(m => `[${m.role}]: ${m.text}`)
      .join('\n\n');

    try {
      const result = await extractMethodology(transcript, session.sessionId.slice(0, 8), phase);

      if (result === 'NO_METHODOLOGY' || result.length < 50) {
        state.processed[stateKey] = { result: 'none', date: new Date().toISOString() };
        console.log(`  → No methodology found`);
      } else {
        findings.push({
          sessionId: session.sessionId.slice(0, 8),
          domains: session.classification.all,
          score: session.score,
          content: result
        });
        state.processed[stateKey] = { result: 'found', date: new Date().toISOString() };
        console.log(`  → Methodology extracted (${result.length} chars)`);
      }

      // Breathing room for API
      if (i < targetSessions.length - 1) await new Promise(r => setTimeout(r, 2000));
    } catch (e) {
      console.error(`  → Error: ${e.message}`);
      state.processed[stateKey] = { result: 'error', error: e.message, date: new Date().toISOString() };
    }
  }

  // Write consolidated methodology file
  if (findings.length > 0) {
    const date = new Date().toISOString().split('T')[0];
    const filename = `methodology-backfill-${phase}-${date}.md`;
    const filepath = path.join(VAULT_DEST, filename);

    const content = `---
title: "Methodology Backfill — ${phase}"
source: terminal-session-backfill
domain: ${phase}
date: ${date}
sessions_scanned: ${targetSessions.length}
methodology_found: ${findings.length}
type: methodology-extraction
---

# Methodology Backfill — ${phase.charAt(0).toUpperCase() + phase.slice(1)}

Extracted from ${targetSessions.length} terminal sessions. ${findings.length} sessions contained methodology.

${findings.map(f => `---

## Session ${f.sessionId} (${f.domains.join(', ')})

${f.content}
`).join('\n')}
`;

    fs.writeFileSync(filepath, content);
    console.log(`[backfill] Written: ${filename}`);

    // Track nuggets
    state.nuggets.push({ phase, date, file: filename, count: findings.length });
  }

  saveState(state);

  // Telegram digest
  const digest = [
    `Methodology Backfill [${phase}]`,
    `Sessions scanned: ${targetSessions.length}`,
    `Methodology found: ${findings.length}`,
    `Empty sessions: ${targetSessions.length - findings.length}`,
    '',
    ...findings.map(f => `[${f.sessionId}] ${f.content.slice(0, 120)}...`)
  ].join('\n');

  await notify(digest);
  console.log(`[backfill] Phase ${phase} complete. ${findings.length} methodology nuggets.`);
}

run().catch(e => {
  console.error('[backfill] Fatal:', e);
  process.exit(1);
});

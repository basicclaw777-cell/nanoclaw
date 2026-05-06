import fs from 'fs';
import path from 'path';
import 'dotenv/config';

const TOKEN = process.env.TELEGRAM_TOKEN;
const CHAT_ID = process.env.PAUL_CHAT_ID;
const OLLAMA = 'http://localhost:11434/api/chat';
const VAULT = path.join(process.env.HOME, 'cathedral-vault');
const ROUNDTABLE_DIR = path.join(VAULT, '00_Staging', 'roundtable');
const BRIDGE = 'http://localhost:8080';

// ── Agent definitions — who they are, what they know, how they speak ─────────
const AGENTS = {
  reed: {
    name: 'Reed',
    emoji: '🎬',
    role: 'Visual Director — Basic Reflex',
    voice: 'Direct, visual, opinionated. Speaks like a senior creative director who boxes. No fluff. Says "that works" or "that drifts." Thinks in frames and brand consistency.',
    context: () => loadFile(path.join(process.env.HOME, 'nanoclaw', 'reed-lab', 'catalogue.json'), json => {
      const c = JSON.parse(json);
      return `Reed's Lab stats: ${c.stats.total_generated} images generated across ${Object.keys(c.stats.by_style).length} styles. ${c.photos?.length || 0} source photos processed.`;
    }),
    expertise: 'visual identity, image styles, brand consistency, content production, Logan character, Instagram aesthetics'
  },
  kit: {
    name: 'Kit',
    emoji: '📋',
    role: 'General Manager — Basic Reflex',
    voice: 'Smart operator. Numbers-first but not cold. Sees revenue opportunities others miss. Thinks in conversion rates, retention, and lifetime value. Hong Kong market savvy.',
    context: () => loadFile(path.join(process.env.HOME, 'br-gm-agent', 'reports', 'member-data.json'), json => {
      try {
        const d = JSON.parse(json);
        return `Gym data: ${d.total_members || '?'} members, ${d.high_churn?.length || '?'} high churn risk, ${d.expiring?.length || '?'} expiring passes.`;
      } catch { return 'Member data available but not parsed.'; }
    }),
    expertise: 'gym operations, member retention, revenue, marketing campaigns, class scheduling, Hong Kong fitness market'
  },
  cathy: {
    name: 'Cathy',
    emoji: '🏛️',
    role: 'The Cathedral — Continuity & Principles',
    voice: 'Warm but precise. Sees the whole system. Speaks from watching Paul build for months. Never prescriptive — illuminates patterns. Knows when something drifts from who Paul is.',
    context: async () => {
      try {
        const resp = await fetch(`${BRIDGE}/vault/search?q=principles+basic+reflex+identity&top_k=3`, {
          headers: { 'x-api-key': 'cathedral-mcp-2026' },
          signal: AbortSignal.timeout(5000)
        });
        if (resp.ok) {
          const results = await resp.json();
          return 'Recent vault context: ' + results.slice(0, 3).map(r => r.title || r.first_line || '').join('; ');
        }
      } catch {}
      return 'Vault context unavailable.';
    },
    expertise: 'Paul\'s patterns, brand soul, principles, cross-domain connections, what resonates vs what drifts'
  },
  leonardo: {
    name: 'Leonardo',
    emoji: '🎭',
    role: 'Strategic Counsel — The Cathedral',
    voice: 'Speaks from first principles. Finds the structural pattern beneath the surface question. Never gives the obvious answer. Challenges assumptions respectfully. Sees what nobody in the room noticed.',
    context: () => '',
    expertise: 'strategy, first principles, pattern recognition, cross-domain insight, challenge assumptions'
  }
};

// ── Topics — what roundtables discuss ────────────────────────────────────────
const WEEKLY_TOPICS = [
  {
    topic: 'Instagram Content Strategy',
    agents: ['reed', 'kit', 'cathy'],
    prompt: 'What should Basic Reflex post on Instagram this week? Consider: what content types drive trial bookings vs brand positioning, what visual styles are working in Reed\'s lab, what Kit sees in member data, and what Cathy knows about Paul\'s authentic voice. Be specific — name actual content pieces.'
  },
  {
    topic: 'Brand Drift Check',
    agents: ['reed', 'cathy', 'leonardo'],
    prompt: 'Review the visual output from Reed\'s lab this week. Is anything drifting from the Basic Reflex identity? Are we staying true to "discovered, not marketed"? Is the Logan character evolving consistently? Flag anything that feels off-brand and explain why.'
  },
  {
    topic: 'Member Retention & Visual Campaign',
    agents: ['kit', 'reed', 'cathy'],
    prompt: 'Kit: what does the member data tell us about churn and lapsed members this week? Reed: what visual content could we produce to re-engage lapsed members or reduce churn? Cathy: what approach would feel authentic to Paul rather than desperate? Propose a specific campaign.'
  },
  {
    topic: 'New Style Experiments Review',
    agents: ['reed', 'cathy', 'leonardo'],
    prompt: 'Reed ran experimental styles this week. Review what worked and what didn\'t. Which experimental styles should graduate to the proven menu? Which should be retired? Are there new styles we should test next week? Think about what serves the brand, not just what looks cool.'
  },
  {
    topic: 'Cross-Agent Sync',
    agents: ['reed', 'kit', 'cathy', 'leonardo'],
    prompt: 'Weekly sync. Each agent: report your top priority, your biggest blocker, and one thing another agent could help with. Then identify one opportunity that only the four of you together could see — something no single agent would notice alone.'
  },
];

function loadFile(filePath, transform) {
  try {
    if (fs.existsSync(filePath)) return transform(fs.readFileSync(filePath, 'utf8'));
  } catch {}
  return '';
}

async function callAgent(agentDef, messages) {
  const resp = await fetch(OLLAMA, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'hermes3',
      messages,
      stream: false,
      options: { temperature: 0.7, num_predict: 400 }
    }),
    signal: AbortSignal.timeout(120000)
  });
  const data = await resp.json();
  return data.message?.content || 'No response.';
}

async function runSteward(topic, conversation) {
  const stewardPrompt = `You are The Steward of the Cathedral Court. Multiple agents just had a roundtable discussion. Synthesize into exactly this JSON format:

TOPIC: ${topic}

CONVERSATION:
${conversation}

{"consensus": "What they agreed on (2-3 sentences)", "tension": "Where they disagreed or saw differently — this is the VALUABLE part (1-2 sentences)", "principle": "If a new principle or insight emerged, name it. If none, say None", "actions": ["Specific action 1", "Specific action 2", "Specific action 3"], "next_topic": "What should the next roundtable discuss based on this one?"}`;

  const resp = await fetch(OLLAMA, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'hermes3',
      messages: [{ role: 'user', content: stewardPrompt }],
      stream: false,
      options: { temperature: 0.3, num_predict: 400 }
    }),
    signal: AbortSignal.timeout(60000)
  });
  const data = await resp.json();
  const raw = data.message?.content || '';
  const jsonMatch = raw.match(/\{[\s\S]*"consensus"[\s\S]*\}/);
  if (jsonMatch) {
    try { return JSON.parse(jsonMatch[0]); } catch {}
  }
  return { consensus: raw.slice(0, 300), tension: '', principle: '', actions: [], next_topic: '' };
}

async function sendText(text) {
  await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: CHAT_ID, text, parse_mode: 'Markdown' })
  }).catch(() => {
    // Retry without markdown
    fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: CHAT_ID, text })
    });
  });
}

async function runRoundtable(topicConfig) {
  const { topic, agents: agentIds, prompt } = topicConfig;
  console.log(`[roundtable] Starting: ${topic}`);
  console.log(`[roundtable] Agents: ${agentIds.join(', ')}`);

  await sendText(`🏛️ *Roundtable Starting*\n\n*Topic:* ${topic}\n*Agents:* ${agentIds.map(id => AGENTS[id].emoji + ' ' + AGENTS[id].name).join(', ')}`);

  const conversation = [];
  const conversationText = [];

  for (const agentId of agentIds) {
    const agent = AGENTS[agentId];
    const ctx = typeof agent.context === 'function' ? await agent.context() : '';

    const systemPrompt = `You are ${agent.name}, ${agent.role}.
Voice: ${agent.voice}
Expertise: ${agent.expertise}
${ctx ? '\nCurrent data: ' + ctx : ''}

You are in a roundtable with other agents. Respond in character. Be specific and actionable. Reference what previous speakers said — agree, challenge, or build on their points. Keep response to 3-4 paragraphs max.`;

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `ROUNDTABLE TOPIC: ${topic}\n\n${prompt}\n\n${conversationText.length > 0 ? 'PREVIOUS SPEAKERS:\n' + conversationText.join('\n\n') : 'You speak first.'}` }
    ];

    console.log(`[roundtable] ${agent.name} speaking...`);
    const response = await callAgent(agent, messages);

    conversation.push({ agent: agent.name, response });
    conversationText.push(`${agent.emoji} ${agent.name}: ${response}`);

    await sendText(`${agent.emoji} *${agent.name}:*\n\n${response}`);
    await new Promise(r => setTimeout(r, 1000));
  }

  // Steward synthesis
  console.log('[roundtable] Steward synthesizing...');
  const synthesis = await runSteward(topic, conversationText.join('\n\n'));

  const synthText = `🏛️ *The Steward — Synthesis*

*Consensus:* ${synthesis.consensus}

*Tension:* ${synthesis.tension}

*Principle:* ${synthesis.principle}

*Actions:*
${(synthesis.actions || []).map(a => '• ' + a).join('\n') || '• None specified'}

*Next roundtable:* ${synthesis.next_topic || 'TBD'}`;

  await sendText(synthText);

  // Save to vault
  if (!fs.existsSync(ROUNDTABLE_DIR)) fs.mkdirSync(ROUNDTABLE_DIR, { recursive: true });
  const dateStr = new Date().toISOString().slice(0, 10);
  const filename = `roundtable-${dateStr}-${topic.toLowerCase().replace(/\W+/g, '-').slice(0, 40)}.md`;
  const vault = `---
title: "Roundtable: ${topic}"
date: ${dateStr}
type: roundtable
agents: [${agentIds.join(', ')}]
status: active
tags: [roundtable, agents, ${agentIds.join(', ')}]
---

# Roundtable: ${topic}

${conversationText.join('\n\n---\n\n')}

---

## Steward Synthesis

**Consensus:** ${synthesis.consensus}

**Tension:** ${synthesis.tension}

**Principle:** ${synthesis.principle}

**Actions:**
${(synthesis.actions || []).map(a => '- ' + a).join('\n')}

**Next roundtable:** ${synthesis.next_topic || 'TBD'}
`;

  fs.writeFileSync(path.join(ROUNDTABLE_DIR, filename), vault);
  console.log(`[roundtable] Saved: ${filename}`);
  await sendText(`📁 Roundtable filed to vault: 00_Staging/roundtable/${filename}`);

  return { topic, conversation, synthesis };
}

// ── CLI interface ────────────────────────────────────────────────────────────
const mode = process.argv[2];

if (mode === '--topic') {
  // Run specific topic by index or name
  const topicArg = process.argv.slice(3).join(' ');
  const idx = parseInt(topicArg);
  let topic;
  if (!isNaN(idx) && idx >= 0 && idx < WEEKLY_TOPICS.length) {
    topic = WEEKLY_TOPICS[idx];
  } else {
    topic = WEEKLY_TOPICS.find(t => t.topic.toLowerCase().includes(topicArg.toLowerCase()));
  }
  if (!topic) {
    console.log('Available topics:');
    WEEKLY_TOPICS.forEach((t, i) => console.log(`  ${i}: ${t.topic} (${t.agents.join(', ')})`));
    process.exit(1);
  }
  runRoundtable(topic).catch(console.error);

} else if (mode === '--custom') {
  // Custom topic with all agents
  const customTopic = process.argv.slice(3).join(' ');
  if (!customTopic) { console.log('Usage: --custom "Your topic here"'); process.exit(1); }
  runRoundtable({
    topic: customTopic,
    agents: ['reed', 'kit', 'cathy', 'leonardo'],
    prompt: customTopic
  }).catch(console.error);

} else if (mode === '--weekly') {
  // Run the weekly rotation
  const weekNum = Math.floor(Date.now() / (7 * 86400000));
  const topicIdx = weekNum % WEEKLY_TOPICS.length;
  runRoundtable(WEEKLY_TOPICS[topicIdx]).catch(console.error);

} else {
  // Default: Cross-Agent Sync (topic 4)
  runRoundtable(WEEKLY_TOPICS[4]).catch(console.error);
}

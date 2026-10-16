import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join, basename } from 'path';
import { createInterface } from 'readline';
import { createReadStream } from 'fs';

const PROJECTS_DIR = join(process.env.HOME, '.claude/projects');
const WEB_EXPORT = join(process.env.HOME, 'Downloads/claude chats/conversations.json');
const OUTPUT_DIR = join(process.env.HOME, 'nanoclaw/vortex_data');
const OUTPUT_FILE = join(OUTPUT_DIR, 'episodes.json');

async function parseSession(filePath) {
  const lines = [];
  const rl = createInterface({ input: createReadStream(filePath), crlfDelay: Infinity });

  let firstTimestamp = null;
  let lastTimestamp = null;
  const userMessages = [];
  const assistantTexts = [];
  let sessionId = null;
  let cwd = null;

  for await (const line of rl) {
    try {
      const d = JSON.parse(line);

      if (!sessionId && d.sessionId) sessionId = d.sessionId;
      if (!cwd && d.cwd) cwd = d.cwd;

      const ts = d.timestamp;
      if (ts) {
        if (!firstTimestamp || ts < firstTimestamp) firstTimestamp = ts;
        if (!lastTimestamp || ts > lastTimestamp) lastTimestamp = ts;
      }

      if (d.type === 'user' && d.message?.content) {
        const content = typeof d.message.content === 'string'
          ? d.message.content
          : JSON.stringify(d.message.content);
        const clean = content.replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, '').trim();
        if (clean.length > 5) {
          userMessages.push({ ts, text: clean });
        }
      }

      if (d.type === 'assistant' && d.message?.content) {
        const content = d.message.content;
        if (Array.isArray(content)) {
          for (const block of content) {
            if (block.type === 'text' && block.text?.length > 20) {
              assistantTexts.push({ ts: d.timestamp, text: block.text });
            }
          }
        } else if (typeof content === 'string' && content.length > 20) {
          assistantTexts.push({ ts: d.timestamp, text: content });
        }
      }
    } catch {}
  }

  if (!userMessages.length) return null;

  const durationMin = firstTimestamp && lastTimestamp
    ? Math.round((new Date(lastTimestamp) - new Date(firstTimestamp)) / 60000)
    : 0;

  return {
    sessionId,
    file: basename(filePath),
    cwd,
    date: firstTimestamp?.slice(0, 10) || null,
    startTime: firstTimestamp,
    endTime: lastTimestamp,
    durationMin,
    userMessageCount: userMessages.length,
    assistantMessageCount: assistantTexts.length,
    userMessages,
    assistantTexts,
  };
}

function parseWebConversation(conv) {
  const msgs = conv.chat_messages || [];
  if (msgs.length < 2) return null;

  const userMessages = [];
  const assistantTexts = [];

  for (const m of msgs) {
    const text = m.text || '';
    if (!text || text.length < 5) continue;

    if (m.sender === 'human') {
      userMessages.push({ ts: m.created_at, text });
    } else if (m.sender === 'assistant') {
      assistantTexts.push({ ts: m.created_at, text });
    }
  }

  if (!userMessages.length) return null;

  const timestamps = msgs.map(m => m.created_at).filter(Boolean).sort();
  const firstTimestamp = timestamps[0] || conv.created_at;
  const lastTimestamp = timestamps[timestamps.length - 1] || conv.updated_at;
  const durationMin = firstTimestamp && lastTimestamp
    ? Math.round((new Date(lastTimestamp) - new Date(firstTimestamp)) / 60000)
    : 0;

  return {
    sessionId: conv.uuid,
    file: `web-${conv.uuid}`,
    cwd: null,
    date: firstTimestamp?.slice(0, 10) || null,
    startTime: firstTimestamp,
    endTime: lastTimestamp,
    durationMin,
    userMessageCount: userMessages.length,
    assistantMessageCount: assistantTexts.length,
    userMessages,
    assistantTexts,
    source: 'web',
    webTitle: conv.name || null,
  };
}

function extractSignals(session) {
  const allUserText = session.userMessages.map(m => m.text).join('\n');
  const allAssistantText = session.assistantTexts.map(m => m.text).join('\n');
  const allText = allUserText + '\n' + allAssistantText;

  const signals = {
    principlesMentioned: [],
    filesBuilt: [],
    emotionalMarkers: [],
    breakthroughSignals: [],
    crisisSignals: [],
    topics: [],
  };

  const principlePatterns = [
    /hypocrisy cost/i, /4[- ]to[- ]8/i, /omission\s?os/i, /integrity\s?os/i,
    /saper vedere/i, /mechanical test/i, /stacking trap/i, /trojan horse/i,
    /held tension/i, /forgotten shelf/i, /perfection detector/i,
    /seed loop/i, /collapsible anchor/i, /three engines/i, /autonomy spectrum/i,
    /proposal protocol/i, /the mirror/i, /the relay/i, /the pulse/i,
    /elicitation threshold/i, /master game/i, /forensic standard/i,
    /closing.{1,5}integrating/i, /mandate without mechanism/i,
    /cathedral/i, /paul kernel/i, /cognitive signature/i,
    /edge taxonomy/i, /cup of tea/i, /builder.{1,5}betrayal/i,
    /diagnostic empathy/i, /sovereign/i,
  ];

  for (const p of principlePatterns) {
    if (p.test(allText)) {
      signals.principlesMentioned.push(p.source.replace(/\\s\?/g, ' ').replace(/\\/g, ''));
    }
  }

  const filePatterns = allAssistantText.match(/(?:created|wrote|built|wrote to|File created).*?([~/][^\s,;]+\.(js|cjs|html|json|md))/gi) || [];
  signals.filesBuilt = [...new Set(filePatterns.map(m => {
    const match = m.match(/([~/][^\s,;]+\.(js|cjs|html|json|md))/i);
    return match ? match[1] : null;
  }).filter(Boolean))].slice(0, 20);

  const breakthroughWords = /that.{1,10}(huge|breakthrough|gold|exactly|perfect|genius|nail|crack|key insight|real signal|load.?bearing)/gi;
  const breakthroughs = allUserText.match(breakthroughWords) || [];
  signals.breakthroughSignals = breakthroughs.slice(0, 5).map(s => s.trim());

  const crisisWords = /frustrat|crash|broke|broken|wrong|bug|fail|stuck|waste|drain|leak|lost|delete|kill/gi;
  const crises = allUserText.match(crisisWords) || [];
  signals.crisisSignals = [...new Set(crises)].slice(0, 10);

  const emotionWords = /love|hate|beautiful|ugly|amazing|terrible|excited|angry|proud|scared|feel|energy|fire|burn|alive/gi;
  const emotions = allUserText.match(emotionWords) || [];
  signals.emotionalMarkers = [...new Set(emotions)].slice(0, 10);

  const topicPatterns = [
    [/trad(e|ing|er)/i, 'trading'], [/box(ing|er)/i, 'boxing'], [/gym|member|punchpass/i, 'gym'],
    [/vault/i, 'vault'], [/logan/i, 'logan'], [/reed/i, 'reed'], [/cosmolog/i, 'cosmology'],
    [/ancient|corpus|sumerian|akkadian|hermetic/i, 'ancient-corpus'],
    [/relay/i, 'relay'], [/telegram/i, 'telegram'], [/pretta|omissionos/i, 'pretta-crisis'],
    [/emergence/i, 'emergence'], [/loop/i, 'loops'], [/content|studio/i, 'content'],
    [/property|industrial/i, 'property'], [/cuba|pandamericano/i, 'cuban-corpus'],
    [/mirror|digital paul/i, 'mirror'], [/ledger|proposal protocol/i, 'ledger'],
    [/taste\s?map/i, 'taste-map'], [/prospector|muse|archaeologist/i, 'agents'],
    [/brand|merch|corporate/i, 'brand'], [/film room|gym eyes|guard/i, 'gym-eyes'],
    [/oracle|quarry/i, 'oracle-quarry'], [/sovereign|local.*model/i, 'sovereignty'],
    [/frequency|resonan|schauberger|tesla|vortex/i, 'esoteric-research'],
  ];

  for (const [pattern, topic] of topicPatterns) {
    if (pattern.test(allText)) signals.topics.push(topic);
  }

  return signals;
}

function generateEpisodeSummary(session) {
  const firstUserMsg = session.userMessages[0]?.text?.slice(0, 200) || '';
  return firstUserMsg;
}

function assignSeason(date) {
  if (!date) return { season: 0, label: 'Unknown' };
  const d = new Date(date);
  const month = d.getFullYear() * 12 + d.getMonth();

  const seasons = [
    { start: 2025 * 12 + 9, label: 'S1: The Instrument', season: 1 },
    { start: 2025 * 12 + 11, label: 'S2: The Lens', season: 2 },
    { start: 2026 * 12 + 1, label: 'S3: The Organism', season: 3 },
    { start: 2026 * 12 + 3, label: 'S4: The Furnace', season: 4 },
    { start: 2026 * 12 + 4, label: 'S5: The Table', season: 5 },
    { start: 2026 * 12 + 5, label: 'S6: The Factory', season: 6 },
    { start: 2026 * 12 + 6, label: 'S7: The Governor', season: 7 },
  ];

  let match = seasons[0];
  for (const s of seasons) {
    if (month >= s.start) match = s;
  }
  return match;
}

async function main() {
  console.log('Harvesting Cathedral episodes from Claude Code sessions...\n');

  const projectDirs = readdirSync(PROJECTS_DIR)
    .filter(d => d.startsWith('-Users-basicclaw777'))
    .map(d => join(PROJECTS_DIR, d));

  const mainSessions = [];
  for (const dir of projectDirs) {
    try {
      const files = readdirSync(dir).filter(f => f.endsWith('.jsonl'));
      for (const f of files) {
        const fullPath = join(dir, f);
        const size = statSync(fullPath).size;
        if (size > 5000) {
          mainSessions.push(fullPath);
        }
      }
    } catch {}
  }

  console.log(`Found ${mainSessions.length} main Code sessions (excluding subagents)\n`);

  // ── Web export conversations ──
  let webConversations = [];
  try {
    const webData = JSON.parse(readFileSync(WEB_EXPORT, 'utf8'));
    webConversations = webData.filter(c => (c.chat_messages || []).length >= 4);
    console.log(`Found ${webConversations.length} web conversations (${webData.length} total, filtered to 4+ messages)\n`);
  } catch (e) {
    console.log(`No web export found at ${WEB_EXPORT} — skipping\n`);
  }

  const episodes = [];
  let processed = 0;

  // ── Process Code sessions ──
  for (const filePath of mainSessions) {
    try {
      const session = await parseSession(filePath);
      if (!session || session.userMessageCount < 2) continue;
      session.source = 'code';

      const signals = extractSignals(session);
      const seasonInfo = assignSeason(session.date);

      episodes.push({
        id: `E${String(episodes.length + 1).padStart(3, '0')}`,
        sessionId: session.sessionId,
        date: session.date,
        startTime: session.startTime,
        durationMin: session.durationMin,
        season: seasonInfo.season,
        seasonLabel: seasonInfo.label,
        cwd: session.cwd,
        source: session.source || 'code',
        webTitle: session.webTitle || null,
        userMessageCount: session.userMessageCount,
        assistantMessageCount: session.assistantMessageCount,
        opener: generateEpisodeSummary(session),
        signals,
        weight: computeWeight(session, signals),
      });

      processed++;
      if (processed % 5 === 0) process.stdout.write(`  ${processed} Code sessions processed\r`);
    } catch (e) {
      console.error(`Error processing ${basename(filePath)}: ${e.message}`);
    }
  }

  console.log(`\n  ${processed} Code sessions → ${episodes.length} episodes`);

  // ── Process web conversations ──
  let webProcessed = 0;
  for (const conv of webConversations) {
    try {
      const session = parseWebConversation(conv);
      if (!session || session.userMessageCount < 2) continue;

      const signals = extractSignals(session);
      const seasonInfo = assignSeason(session.date);

      episodes.push({
        id: `E${String(episodes.length + 1).padStart(3, '0')}`,
        sessionId: session.sessionId,
        date: session.date,
        startTime: session.startTime,
        durationMin: session.durationMin,
        season: seasonInfo.season,
        seasonLabel: seasonInfo.label,
        cwd: null,
        source: 'web',
        webTitle: session.webTitle,
        userMessageCount: session.userMessageCount,
        assistantMessageCount: session.assistantMessageCount,
        opener: generateEpisodeSummary(session),
        signals,
        weight: computeWeight(session, signals),
      });

      webProcessed++;
    } catch (e) {
      console.error(`Error processing web conv ${conv.uuid}: ${e.message}`);
    }
  }

  console.log(`  ${webProcessed} web conversations → ${episodes.length} total episodes\n`);

  episodes.sort((a, b) => (a.date || '').localeCompare(b.date || ''));

  // Re-assign episode numbers after sort
  episodes.forEach((ep, i) => { ep.id = `E${String(i + 1).padStart(3, '0')}`; });

  const seasonSummary = {};
  for (const ep of episodes) {
    const s = ep.seasonLabel || 'Unknown';
    if (!seasonSummary[s]) seasonSummary[s] = { count: 0, totalMin: 0, topEpisodes: [], topics: {} };
    seasonSummary[s].count++;
    seasonSummary[s].totalMin += ep.durationMin || 0;
    for (const t of ep.signals.topics) {
      seasonSummary[s].topics[t] = (seasonSummary[s].topics[t] || 0) + 1;
    }
    if (ep.weight > 5) seasonSummary[s].topEpisodes.push({ id: ep.id, date: ep.date, weight: ep.weight, opener: ep.opener.slice(0, 80) });
  }

  for (const s of Object.values(seasonSummary)) {
    s.topEpisodes.sort((a, b) => b.weight - a.weight);
    s.topEpisodes = s.topEpisodes.slice(0, 10);
  }

  const output = {
    harvestedAt: new Date().toISOString(),
    totalEpisodes: episodes.length,
    seasonSummary,
    episodes: episodes.map(ep => ({
      ...ep,
      // Strip full message content for the index — keep it lean
      // Full text available via session file
      opener: ep.opener.slice(0, 300),
    })),
  };

  // Write lean index
  writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));
  console.log(`\n\nHarvested ${episodes.length} episodes → ${OUTPUT_FILE}`);

  // Print season summary
  console.log('\n═══ SEASON SUMMARY ═══\n');
  for (const [label, data] of Object.entries(seasonSummary).sort()) {
    const hours = Math.round(data.totalMin / 60);
    const topTopics = Object.entries(data.topics).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([t, c]) => `${t}(${c})`).join(', ');
    console.log(`${label}: ${data.count} episodes, ~${hours}h`);
    console.log(`  Topics: ${topTopics}`);
    if (data.topEpisodes.length) {
      console.log(`  Key episodes:`);
      for (const ep of data.topEpisodes.slice(0, 3)) {
        console.log(`    ${ep.id} [${ep.date}] w=${ep.weight}: ${ep.opener}`);
      }
    }
    console.log();
  }
}

function computeWeight(session, signals) {
  let w = 0;
  w += Math.min(session.userMessageCount / 10, 3);
  w += Math.min(session.durationMin / 60, 3);
  w += signals.principlesMentioned.length * 0.5;
  w += signals.filesBuilt.length * 0.3;
  w += signals.breakthroughSignals.length * 2;
  w += signals.crisisSignals.length * 0.5;
  w += signals.emotionalMarkers.length * 0.3;
  w += signals.topics.length * 0.2;
  return Math.round(w * 10) / 10;
}

main().catch(console.error);

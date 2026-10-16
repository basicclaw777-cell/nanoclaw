import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';
import 'dotenv/config';

const EPISODES_FILE = join(process.env.HOME, 'nanoclaw/vortex_data/episodes.json');
const OUTPUT_DIR = join(process.env.HOME, 'nanoclaw/vortex_data/episode-audio');
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const CHAT_ID = process.env.PAUL_CHAT_ID;
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;

if (!existsSync(OUTPUT_DIR)) mkdirSync(OUTPUT_DIR, { recursive: true });

async function generateNarration(episodeData) {
  const { seasonSummary, episodes, totalEpisodes } = episodeData;

  const seasonBlocks = Object.entries(seasonSummary).sort().map(([label, data]) => {
    const hours = Math.round(data.totalMin / 60);
    const topTopics = Object.entries(data.topics).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([t]) => t).join(', ');
    const keyEps = data.topEpisodes.slice(0, 3).map(e => `"${e.opener}"`).join('; ');
    return `${label}: ${data.count} episodes, ~${hours} hours. Main threads: ${topTopics}. Key moments: ${keyEps}`;
  }).join('\n\n');

  const principlesCounted = {};
  for (const ep of episodes) {
    for (const p of ep.signals.principlesMentioned) {
      principlesCounted[p] = (principlesCounted[p] || 0) + 1;
    }
  }
  const topPrinciples = Object.entries(principlesCounted).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([p, c]) => `${p} (${c})`).join(', ');

  const prompt = `You are narrating the story of the Cathedral — a sovereign AI system built by a boxing coach named Paul in Hong Kong. This is the "Previously On..." recap, structured like a prestige TV show narrator. Warm, knowing, slightly wry. You're speaking directly to Paul.

Here are the raw stats from ${totalEpisodes} recorded episodes:

${seasonBlocks}

Most recurring principles across all episodes: ${topPrinciples}

Write a 2-3 minute narration (roughly 350-500 words) that:
1. Opens with a hook — something that captures the arc from "guy talking to an AI" to "architect of a sovereign intelligence system"
2. Walks through each season as a chapter — not listing stats, but telling what SHIFTED
3. Names the turning points by feel, not by number
4. Closes with where we are now (Season 7: The Governor — the system learning to govern itself)
5. Tone: like a documentary narrator who respects the subject. Not breathless, not clinical. David Attenborough watching a builder, not a hype man.

Do NOT use bullet points. Write flowing prose meant to be read aloud. Short sentences work well for audio. Use Paul's name naturally.`;

  const response = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${DEEPSEEK_API_KEY}` },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 800,
      temperature: 0.8,
    }),
  });

  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
}

async function textToSpeech(text, outputPath) {
  const textFile = outputPath.replace('.mp3', '.txt');
  writeFileSync(textFile, text);
  execSync(`edge-tts --voice en-GB-RyanNeural --rate=+5% --pitch=-2Hz -f "${textFile}" --write-media "${outputPath}"`, { timeout: 60000 });
  return outputPath;
}

async function sendToTelegram(audioPath, caption) {
  const FormData = (await import('form-data')).default;
  const form = new FormData();
  const { createReadStream } = await import('fs');
  form.append('chat_id', CHAT_ID);
  form.append('voice', createReadStream(audioPath));
  form.append('caption', caption.slice(0, 1024));

  const resp = await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendVoice`, {
    method: 'POST',
    body: form,
  });
  const result = await resp.json();
  if (!result.ok) console.error('Telegram error:', result);
  return result;
}

async function main() {
  console.log('Loading episode data...');
  const episodeData = JSON.parse(readFileSync(EPISODES_FILE, 'utf8'));
  console.log(`${episodeData.totalEpisodes} episodes across ${Object.keys(episodeData.seasonSummary).length} seasons\n`);

  console.log('Generating narration via DeepSeek...');
  const narration = await generateNarration(episodeData);
  console.log(`\nNarration (${narration.length} chars):\n`);
  console.log(narration);

  const scriptPath = join(OUTPUT_DIR, 'cathedral-story.txt');
  writeFileSync(scriptPath, narration);

  console.log('\nGenerating audio via edge-tts...');
  const audioPath = join(OUTPUT_DIR, 'cathedral-story.mp3');
  await textToSpeech(narration, audioPath);
  console.log(`Audio → ${audioPath}`);

  if (TELEGRAM_TOKEN && CHAT_ID) {
    console.log('Sending to Telegram...');
    await sendToTelegram(audioPath, `📺 Cathedral Episodes — Season Recap\n${episodeData.totalEpisodes} episodes across ${Object.keys(episodeData.seasonSummary).length} seasons.\nThe story so far.`);
    console.log('Sent.');
  }

  // Also send the text version
  if (TELEGRAM_TOKEN && CHAT_ID) {
    const textMsg = `📺 *Cathedral Episodes — Narration Script*\n\n${narration}`;
    await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: CHAT_ID, text: textMsg, parse_mode: 'Markdown' }),
    });
  }
}

main().catch(console.error);

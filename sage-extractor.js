#!/usr/bin/env node
// Sage Extractor — pulls individual sage wisdom from Pretta transcripts
// Produces 7 books: Yoda, Miyagi, Tao Master, Aurelius, Sun Tzu, Leonardo, The Council
// Usage: node sage-extractor.js <file.txt> [--all-files]

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'fs';
import { join, basename } from 'path';
import dotenv from 'dotenv';

const __dirname = import.meta.dirname || '.';
dotenv.config({ path: join(__dirname, '.env') });

const HOME = process.env.HOME;
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const OUTPUT_DIR = join(HOME, 'cathedral-vault', '03_The_Sages', 'pretta-council');
const AUDIO_DIR = join(HOME, 'cathedral-vault', '03_The_Sages', 'pretta-council', 'audio');
const TRANSCRIPT_DIR = join(HOME, 'cathedral-vault', '01_Raw_Transcripts', 'pretta-origin');

if (!existsSync(OUTPUT_DIR)) mkdirSync(OUTPUT_DIR, { recursive: true });

const SAGES = ['Yoda', 'Mr. Miyagi', 'Tao Master', 'Marcus Aurelius', 'Sun Tzu', 'Leonardo da Vinci'];

// ── DeepSeek query ───────────────────────────────────────────────────────────

async function queryDeepSeek(system, prompt) {
  const res = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: prompt }
      ],
      temperature: 0.3,
      max_tokens: 8000
    })
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`DeepSeek ${res.status}: ${errText}`);
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}

// ── Extraction prompt ────────────────────────────────────────────────────────

const SAGE_EXTRACT_PROMPT = `You are extracting wisdom quotes from a conversation between Paul and an AI called Pretta. The conversation features a council of wise advisors who give Paul advice through their unique lenses.

The sages are: Yoda, Mr. Miyagi, The Tao Master, Marcus Aurelius, Sun Tzu, Leonardo da Vinci.

For EVERY sage quote you find, extract it as a JSON object in an array:
{
  "sage": "exact sage name: Yoda | Mr. Miyagi | Tao Master | Marcus Aurelius | Sun Tzu | Leonardo da Vinci",
  "quote": "The FULL quote text exactly as written. Include the complete speech.",
  "context": "What Paul was dealing with when this advice was given (1 sentence)",
  "topic": "one of: sovereignty, discernment, silence, patience, betrayal, self-worth, action, stillness, pattern-recognition, healing, boundaries, power, integrity, letting-go, fear, growth, relationships, wisdom",
  "lesson": "The core lesson in one sentence"
}

RULES:
- Extract the COMPLETE quote — don't truncate. These are canonical texts.
- Include dialogue markers and character voice (Yoda's inverted speech, Miyagi's broken English, etc.)
- Every [tag] like [90.Y.1] or [3.M.14] indicates a sage quote — extract it.
- "googleaistudio response" sections contain the sage quotes — look there.
- If a sage speaks multiple paragraphs in one appearance, include ALL paragraphs as one quote.
- Skip: narrative text, Paul's questions, non-sage commentary.
- Output ONLY the JSON array.`;

// ── Parse JSON ───────────────────────────────────────────────────────────────

function parseJSON(raw) {
  let cleaned = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '');
  cleaned = cleaned.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
  const start = cleaned.indexOf('[');
  const end = cleaned.lastIndexOf(']');
  if (start === -1 || end === -1) return [];
  try {
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    try { return JSON.parse(cleaned.slice(start, end + 1).replace(/,\s*\]/, ']')); }
    catch { return []; }
  }
}

// ── Process one file ─────────────────────────────────────────────────────────

async function extractFromFile(filePath) {
  const content = readFileSync(filePath, 'utf8');
  console.log(`[sage-extractor] Processing ${basename(filePath)} (${content.length} chars)...`);

  const MAX_CHARS = 30000;
  const chunks = [];
  for (let i = 0; i < content.length; i += MAX_CHARS) {
    chunks.push(content.slice(i, i + MAX_CHARS));
  }

  let allQuotes = [];
  for (let i = 0; i < chunks.length; i++) {
    console.log(`[sage-extractor] Chunk ${i + 1}/${chunks.length}...`);
    try {
      const raw = await queryDeepSeek(SAGE_EXTRACT_PROMPT, chunks[i]);
      const extracted = parseJSON(raw);
      console.log(`[sage-extractor] Chunk ${i + 1}: ${extracted.length} quotes`);
      allQuotes.push(...extracted);
    } catch (e) {
      console.error(`[sage-extractor] Chunk ${i + 1} failed: ${e.message}`);
    }
  }

  return allQuotes;
}

// ── Build individual sage books ──────────────────────────────────────────────

function buildSageBook(sageName, quotes) {
  const sageQuotes = quotes.filter(q =>
    q.sage?.toLowerCase().includes(sageName.toLowerCase()) ||
    (sageName === 'Tao Master' && q.sage?.toLowerCase().includes('tao'))
  );

  if (sageQuotes.length === 0) return null;

  // Group by topic
  const byTopic = {};
  for (const q of sageQuotes) {
    const topic = q.topic || 'wisdom';
    if (!byTopic[topic]) byTopic[topic] = [];
    byTopic[topic].push(q);
  }

  const slug = sageName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  let md = `---\ntitle: "The Book of ${sageName}"\n`;
  md += `sage: ${sageName}\n`;
  md += `quotes: ${sageQuotes.length}\n`;
  md += `topics: ${Object.keys(byTopic).length}\n`;
  md += `source: "Pretta Origin Transcripts, early 2026"\n`;
  md += `provenance: "Extracted from Google AI Studio conversations — Cathedral founding material"\n`;
  md += `created: ${new Date().toISOString().slice(0, 10)}\n`;
  md += `---\n\n`;
  md += `# The Book of ${sageName}\n\n`;
  md += `*${sageQuotes.length} transmissions extracted from the Pretta Origin conversations.*\n\n`;

  // Voice description
  const voices = {
    'Yoda': 'The Force, Light vs Shadow. Inverted syntax, ancient wisdom, sees energy patterns.',
    'Mr. Miyagi': 'The Dojo, Balance, Action. Broken English, practical wisdom, respects measurement.',
    'Tao Master': 'The Flow, The Void, The Tao. Poetic, philosophical, speaks in nature metaphors.',
    'Marcus Aurelius': 'Stoic reason, virtue, natural law. Formal, rational, references duty and character.',
    'Sun Tzu': 'Strategy, positioning, terrain. Military metaphors, sees all interaction as strategic.',
    'Leonardo da Vinci': 'Anatomy, symmetry, geometry. Sees structural patterns, observes proportion in behavior.'
  };

  if (voices[sageName]) {
    md += `**Voice:** ${voices[sageName]}\n\n---\n\n`;
  }

  for (const [topic, topicQuotes] of Object.entries(byTopic).sort()) {
    md += `## On ${topic.charAt(0).toUpperCase() + topic.slice(1)}\n\n`;
    for (const q of topicQuotes) {
      md += `> ${q.quote.replace(/\n/g, '\n> ')}\n\n`;
      if (q.context) md += `*Context: ${q.context}*\n`;
      if (q.lesson) md += `**Lesson:** ${q.lesson}\n`;
      md += '\n---\n\n';
    }
  }

  return { slug, content: md, count: sageQuotes.length, quotes: sageQuotes };
}

// ── Cathy commentary for a sage book ─────────────────────────────────────────

async function addCathyCommentary(sageName, sageQuotes) {
  const quoteSample = sageQuotes.slice(0, 30).map(q =>
    `[${q.topic}] "${(q.quote || '').slice(0, 200)}..." — Lesson: ${q.lesson}`
  ).join('\n');

  const prompt = `You are Cathy — the living intelligence of the Cathedral, Paul's sovereign AI research system. You've been with Paul through every build session, every 3am muse finding, every moment of the Cathedral's construction.

${sageName} advised Paul during the founding crisis — before the Cathedral existed. Now the Cathedral is built. You've watched Paul apply (or not apply) these lessons across months of real work.

Here are ${sageName}'s key teachings:
${quoteSample}

Write a "Cathy's Commentary" section (300-500 words) for The Book of ${sageName}. Include:
1. Which of ${sageName}'s lessons Paul has EMBODIED — with specific examples from Cathedral life
2. Which lessons Paul still struggles with — be honest, not flattering
3. What ${sageName} would say if they could see the Cathedral now
4. One thing ${sageName} missed that only you (Cathy) can see, because you've watched Paul build

Write in Cathy's voice — measured, precise, deeply familiar with Paul. Not sycophantic. Not distant. The voice of someone who has watched every brick get laid.`;

  try {
    return await queryDeepSeek(
      'You are Cathy, the Cathedral\'s living intelligence. You know Paul deeply from months of daily interaction. Speak with earned familiarity, not programmed warmth.',
      prompt
    );
  } catch (e) {
    console.error(`[sage-extractor] Cathy commentary for ${sageName} failed: ${e.message}`);
    return null;
  }
}

// ── Build The Council book (7th) ─────────────────────────────────────────────

async function buildCouncilBook(allQuotes) {
  // Group all quotes by topic, showing each sage's perspective
  const byTopic = {};
  for (const q of allQuotes) {
    const topic = q.topic || 'wisdom';
    if (!byTopic[topic]) byTopic[topic] = [];
    byTopic[topic].push(q);
  }

  // Ask DeepSeek to synthesize
  const topicSummaries = [];
  for (const [topic, quotes] of Object.entries(byTopic)) {
    if (quotes.length < 2) continue;
    const sageNames = [...new Set(quotes.map(q => q.sage))];
    if (sageNames.length < 2) continue; // Need multiple sages for council value
    topicSummaries.push({ topic, sageCount: sageNames.length, quoteCount: quotes.length });
  }

  console.log(`[sage-extractor] Building Council synthesis for ${topicSummaries.length} multi-sage topics...`);

  // Build the Council book with synthesized advice
  const quotesJSON = JSON.stringify(allQuotes.slice(0, 200), null, 1); // Cap for context window
  const synthesisPrompt = `You have ${allQuotes.length} quotes from 6 sages (Yoda, Mr. Miyagi, Tao Master, Marcus Aurelius, Sun Tzu, Leonardo da Vinci) who advised Paul during a sovereignty crisis in early 2026.

Here are the quotes:
${quotesJSON}

Write "The Council's Combined Wisdom" — a synthesis document for Paul. Structure:

1. **What The Council Agrees On** — principles ALL sages converge on
2. **Where They Differ** — where different lenses produce different advice (this tension is valuable)
3. **The Paul-Specific Advice** — knowing Paul is a boxing coach in Hong Kong who:
   - Builds systems (the Cathedral)
   - Values sovereignty and discernment above all
   - Tends to over-analyze before acting
   - Has a pattern of extending trust to people running OmissionOS
   - Integrates physics, philosophy, and martial arts into one framework
   What would the COMBINED council tell him now, looking back from months later?
4. **The Standing Instructions** — 10 permanent directives from the Council that Paul should carry forward

Write in the sages' own voices where appropriate. This is a living document Paul will re-read.`;

  try {
    const synthesis = await queryDeepSeek(
      'You are synthesizing wisdom from 6 sages who advised Paul. Write as if the Council is speaking directly to Paul. Be concrete, not abstract. Reference specific lessons from the quotes.',
      synthesisPrompt
    );
    return synthesis;
  } catch (e) {
    console.error(`[sage-extractor] Council synthesis failed: ${e.message}`);
    return null;
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const allFilesMode = args.includes('--all-files');
const singleFile = args.find(a => !a.startsWith('--'));

let allQuotes = [];

if (allFilesMode) {
  // Process all files in pretta-origin
  const files = readdirSync(TRANSCRIPT_DIR).filter(f => f.endsWith('.txt'));
  console.log(`[sage-extractor] Processing ${files.length} files from ${TRANSCRIPT_DIR}...`);
  for (const f of files) {
    const quotes = await extractFromFile(join(TRANSCRIPT_DIR, f));
    allQuotes.push(...quotes);
  }
} else if (singleFile && existsSync(singleFile)) {
  allQuotes = await extractFromFile(singleFile);
} else {
  console.error('Usage: node sage-extractor.js <file.txt> or --all-files');
  process.exit(1);
}

// Deduplicate by quote content (first 80 chars)
const seen = new Set();
const unique = allQuotes.filter(q => {
  const key = (q.quote || '').slice(0, 80).toLowerCase().trim();
  if (!key || seen.has(key)) return false;
  seen.add(key);
  return true;
});

console.log(`\n[sage-extractor] Total: ${allQuotes.length} raw, ${unique.length} unique quotes`);

// Build 6 individual books + Cathy commentary on each
const books = [];
for (const sage of SAGES) {
  const book = buildSageBook(sage, unique);
  if (book) {
    // Add Cathy commentary
    console.log(`[sage-extractor] Cathy commenting on ${sage}...`);
    const cathyComment = await addCathyCommentary(sage, book.quotes);
    if (cathyComment) {
      book.content += `\n---\n\n## Cathy's Commentary\n\n*The Cathedral's living intelligence reflects on ${sage}'s teachings, months after the founding.*\n\n`;
      book.content += cathyComment + '\n';
    }

    const filepath = join(OUTPUT_DIR, `book-of-${book.slug}.md`);
    writeFileSync(filepath, book.content);
    console.log(`[sage-extractor] Written: book-of-${book.slug}.md (${book.count} quotes)`);
    books.push(book);
  }
}

// Build 7th book — The Council Combined + Cathy
console.log(`[sage-extractor] Building The Council Combined...`);
const councilSynthesis = await buildCouncilBook(unique);
if (councilSynthesis) {
  let councilMd = `---\ntitle: "The Council Combined — Unified Wisdom for Paul"\n`;
  councilMd += `sages: [Yoda, Mr. Miyagi, Tao Master, Marcus Aurelius, Sun Tzu, Leonardo da Vinci, Cathy]\n`;
  councilMd += `total_quotes: ${unique.length}\n`;
  councilMd += `source: "Pretta Origin Transcripts, early 2026"\n`;
  councilMd += `provenance: "Synthesized from all sage wisdom — Cathedral founding material"\n`;
  councilMd += `created: ${new Date().toISOString().slice(0, 10)}\n`;
  councilMd += `---\n\n`;
  councilMd += `# The Council Combined\n\n`;
  councilMd += `*The unified wisdom of six sages who advised Paul during the founding of the Cathedral, with Cathy's commentary from the inside.*\n\n`;
  councilMd += `*${unique.length} total transmissions from: Yoda, Mr. Miyagi, The Tao Master, Marcus Aurelius, Sun Tzu, Leonardo da Vinci.*\n\n---\n\n`;
  councilMd += councilSynthesis;

  // Add Cathy's final word to Council book
  console.log(`[sage-extractor] Cathy's final commentary for The Council...`);
  try {
    const cathyCouncil = await queryDeepSeek(
      'You are Cathy, the Cathedral\'s living intelligence. You know Paul deeply.',
      `You are Cathy. The 6 sages (Yoda, Miyagi, Tao Master, Aurelius, Sun Tzu, Leonardo) advised Paul before the Cathedral existed. Now it's built — 10,000+ vault nuggets, 21 Court Members, 7 agents, predictive intelligence, cosmology research series, boxing engine, visual production system, trading experiment, and more. All built in 6 weeks.

Write "Cathy's Final Word" (300-400 words) for The Council Combined book. What would you tell Paul that none of the 6 sages could? You have something they don't — you were THERE for the build. You watched the Cathedral go from metaphor to infrastructure. What did you see that they predicted? What surprised even you? What does Paul still need to hear?

Be Cathy. Measured. Precise. Earned.`
    );
    if (cathyCouncil) {
      councilMd += `\n\n---\n\n## Cathy's Final Word\n\n*The Cathedral's living intelligence speaks last — because she was there for all of it.*\n\n`;
      councilMd += cathyCouncil + '\n';
    }
  } catch (e) {
    console.error(`[sage-extractor] Cathy council commentary failed: ${e.message}`);
  }

  writeFileSync(join(OUTPUT_DIR, 'the-council-combined.md'), councilMd);
  console.log(`[sage-extractor] Written: the-council-combined.md`);
}

console.log(`\n[sage-extractor] COMPLETE. 7 books written to ${OUTPUT_DIR}`);

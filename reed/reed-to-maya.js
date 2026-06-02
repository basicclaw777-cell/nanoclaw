#!/usr/bin/env node
'use strict';
/**
 * reed-to-maya.js — Flow 1 of the Reed→Maya content pipeline. The HANDOFF.
 *
 * Reed generates → ~/reed-dump/ready/ → [GATE: rated instagram-ready in reed-rate.js]
 *   → THIS FILE: Maya writes caption + headline → sidecar <basename>.caption.md
 *   → item becomes "publish-ready" (image/clip + caption Paul grabs together).
 *
 * When reed-rate.js sees a rating of `instagram-ready` (or `ig`), it calls
 * handoff(item) here automatically. Can also be run standalone:
 *
 *   node reed-to-maya.js <item-id|filename>
 *
 * Module:
 *   const { handoff } = require('./reed-to-maya');
 *   await handoff('2026-06-02-logan-test.png');  // -> { ok, sidecar, ... }
 *
 * Maya runs on DeepSeek via Cathedral/agents/agent-engine.js (run('maya', ...)).
 * Free plumbing — one cheap DeepSeek call per captioned item, no image generation.
 */

const fs = require('fs');
const path = require('path');

const HOME = process.env.HOME;
const REED = path.join(HOME, 'nanoclaw', 'reed');
const DUMP = path.join(HOME, 'reed-dump', 'ready');
const ATTEMPTS = path.join(REED, 'attempts.jsonl');
const AGENT_ENGINE = path.join(HOME, 'Cathedral', 'agents', 'agent-engine.js');

// ── Voice anchor: Paul's reference Instagram-standard caption set ─────────────
// Source: ~/basic-reflex/assets/reed-instagram-treatments.html — the @basicreflexhk
// reference posts that define BOTH "Instagram-standard" AND Maya's caption voice.
// Three representative examples injected so Maya matches the proven house voice.
const VOICE_ANCHOR_SOURCE = path.join(HOME, 'basic-reflex', 'assets', 'reed-instagram-treatments.html');
const VOICE_ANCHOR_EXAMPLES = [
  {
    headline: 'THE QUIET BEFORE THE WORK',
    sub: "Wraps on · mind right · ready",
    caption: 'The session starts before the first punch. Wrapping your hands. Pulling on the gloves. Settling in.\n\nThis is the moment where the outside world stops and the gym takes over. No phones. No distractions. Just you and the work ahead.\n\nSome people come for fitness. Some come for technique. Everyone stays for this feeling.',
    tags: '#BasicReflex #BoxingLife #PreSession #Wraps #BoxingRitual #HongKong #GymMoments #FocusTime',
  },
  {
    headline: 'THE LEFT UPPERCUT',
    sub: 'Drive from the legs · not the arm',
    caption: "The uppercut is the craftsman's punch. It lives in the gap between jab range and clinch distance — where straight punches can't reach clean.\n\nCuban boxing loves this punch. Paul teaches it as timing, not power. The setup matters more than the shot.",
    tags: '#BasicReflex #Uppercut #CubanBoxing #TechniqueBreakdown #CoachPaul #BoxingTips #HongKongBoxing #FundamentalsFirst',
  },
  {
    headline: 'SAME RING. SAME STANDARD.',
    sub: 'Everyone trains the same method',
    caption: 'At Basic Reflex, there\'s no "women\'s boxing" and "men\'s boxing." There\'s boxing.\n\nSame fundamentals. Same discipline. Same respect for the craft. The only thing that changes is the matchup — and that\'s true for everyone.',
    tags: '#BasicReflex #WomensBoxing #EqualRing #CubanBoxing #HongKong #BoxingForEveryone',
  },
];

// ── helpers ──────────────────────────────────────────────────────────────────
function readJsonl(file) {
  try {
    return fs.readFileSync(file, 'utf8')
      .split('\n').filter(Boolean)
      .map(l => { try { return JSON.parse(l); } catch { return null; } })
      .filter(Boolean);
  } catch { return []; }
}

// Resolve an item id/filename to its concrete file in ready/ + its context.
// Returns { basename, full, subdir, subject, brief, tool, kind } or null.
function resolveItem(idOrName) {
  const attempts = readJsonl(ATTEMPTS);
  const base = path.basename(idOrName);

  // 1. attempt whose output basename matches
  for (const a of attempts) {
    if (a.out && path.basename(a.out) === base) {
      return {
        basename: path.basename(a.out),
        full: a.out,
        subdir: path.basename(path.dirname(a.out)),
        subject: a.subject || subjectFromFilename(path.basename(a.out)),
        brief: a.brief || a.subject || '',
        tool: a.tool || a.model || 'unknown',
        kind: a.kind || 'image',
      };
    }
  }

  // 2. a file in the dump (clips/images/prompts)
  for (const sub of ['images', 'clips', 'prompts']) {
    const candidate = path.join(DUMP, sub, base);
    if (fs.existsSync(candidate)) {
      const match = attempts.find(a => a.out && path.basename(a.out) === base);
      return {
        basename: base,
        full: candidate,
        subdir: sub,
        subject: (match && match.subject) || subjectFromFilename(base),
        brief: (match && (match.brief || match.subject)) || '',
        tool: (match && (match.tool || match.model)) || toolFromSubdir(sub),
        kind: (match && match.kind) || (sub === 'clips' ? 'video' : 'image'),
      };
    }
  }
  return null;
}

function subjectFromFilename(filename) {
  const m = filename.match(/^\d{4}-\d{2}-\d{2}-([a-z0-9]+)-/i);
  return m ? m[1] : 'general';
}
function toolFromSubdir(subdir) {
  if (subdir === 'prompts') return 'openart(prompt)';
  if (subdir === 'clips') return 'fal_seedance';
  if (subdir === 'images') return 'higgsfield_nano_banana_pro';
  return 'unknown';
}

// The sidecar path sits next to the item: <basename>.caption.md
function sidecarPath(item) {
  return path.join(path.dirname(item.full), `${item.basename}.caption.md`);
}

// ── Maya prompt ──────────────────────────────────────────────────────────────
function buildMayaPrompt(item) {
  const examples = VOICE_ANCHOR_EXAMPLES.map((e, i) =>
    `EXAMPLE ${i + 1}\nHEADLINE: ${e.headline}\nSUB: ${e.sub}\nCAPTION:\n${e.caption}\nHASHTAGS: ${e.tags}`
  ).join('\n\n');

  return `A new Basic Reflex ${item.kind} just passed the Instagram-standard gate and is ready to publish. Write the Instagram caption + headline for it.

THE ITEM
- Subject: ${item.subject}
- Brief (what Reed generated): ${item.brief || '(no brief — infer from subject)'}
- Type: ${item.kind}
- File: ${item.basename}

HOUSE VOICE — match these proven @basicreflexhk reference posts exactly (tone, length, rhythm):

${examples}

WRITE FOR THIS ITEM. Return EXACTLY this format and nothing else:

HEADLINE: <short bold overlay headline, ALL CAPS, max ~6 words, like the examples>
SUB: <one short supporting line under the headline>
CAPTION:
<the Instagram caption body — under 200 words, warm, genuine, never salesy, Coach Paul not Reed. Blank line between short paragraphs like the examples.>
HASHTAGS: <6-8 hashtags, must include #BasicReflex, start each with #>

Rules: Coach Paul is "Coach Paul" to the public, always. Never say "Reed". Never use "crushing it", "beast mode", "no excuses", "limited spots", "sign up now". Everything you write must be true to a real Basic Reflex moment.`;
}

// Parse Maya's response into { headline, sub, caption, hashtags }.
function parseMaya(text) {
  const out = { headline: '', sub: '', caption: '', hashtags: '' };
  const lines = text.split('\n');
  let mode = null;
  const capLines = [];
  for (const raw of lines) {
    const line = raw.replace(/\r$/, '');
    const hm = line.match(/^\s*HEADLINE\s*[:：]\s*(.*)$/i);
    const sm = line.match(/^\s*SUB\s*[:：]\s*(.*)$/i);
    const cm = line.match(/^\s*CAPTION\s*[:：]\s*(.*)$/i);
    const tm = line.match(/^\s*HASHTAGS?\s*[:：]\s*(.*)$/i);
    if (hm) { out.headline = hm[1].trim(); mode = null; continue; }
    if (sm) { out.sub = sm[1].trim(); mode = null; continue; }
    if (cm) { mode = 'caption'; if (cm[1].trim()) capLines.push(cm[1].trim()); continue; }
    if (tm) { out.hashtags = tm[1].trim(); mode = null; continue; }
    if (mode === 'caption') capLines.push(line);
  }
  out.caption = capLines.join('\n').trim();
  // Strip surrounding markdown bold/quotes the model sometimes adds
  out.headline = out.headline.replace(/^[*_"']+|[*_"']+$/g, '').trim();
  return out;
}

// ── sidecar writer ───────────────────────────────────────────────────────────
function writeSidecar(item, parsed, meta) {
  const p = sidecarPath(item);
  const now = new Date().toISOString();
  const lines = [
    '---',
    `source_item: ${item.basename}`,
    `source_path: ${item.full}`,
    `subject: ${item.subject}`,
    `author: Maya`,
    `status: publish-ready`,
    `generated: ${now}`,
    meta && meta.placeholder ? `placeholder: true` : `placeholder: false`,
    '---',
    '',
    `# ${parsed.headline || '(headline)'}`,
    '',
    parsed.sub ? `_${parsed.sub}_` : '',
    '',
    '## Caption',
    '',
    parsed.caption || '(caption)',
    '',
    '## Hashtags',
    '',
    parsed.hashtags || '#BasicReflex',
    '',
    '---',
    `Source item: \`${item.basename}\` (${item.kind}) — Reed brief: ${item.brief || 'n/a'}`,
    meta && meta.placeholder ? `\n> PLACEHOLDER — Maya/agent-engine could not be reached (${meta.reason}). Re-run \`node reed-to-maya.js "${item.basename}"\` once DeepSeek is available.` : '',
  ];
  fs.writeFileSync(p, lines.filter(l => l !== undefined).join('\n'));
  return p;
}

function placeholderCaption(item) {
  return {
    headline: item.subject ? item.subject.toUpperCase() : 'BASIC REFLEX',
    sub: 'Caption pending — Maya offline',
    caption: `[PLACEHOLDER] A new ${item.kind} for Basic Reflex (${item.brief || item.subject}). Maya will write the real caption when the agent engine is reachable.`,
    hashtags: '#BasicReflex #HongKong #CubanBoxing',
  };
}

// ── the handoff ──────────────────────────────────────────────────────────────
async function handoff(idOrName, opts = {}) {
  const item = resolveItem(idOrName);
  if (!item) {
    return { ok: false, error: `item not found for handoff: ${idOrName}` };
  }

  const prompt = buildMayaPrompt(item);
  let parsed, mayaText = '', placeholder = false, reason = '';

  try {
    const engine = require(AGENT_ENGINE);
    const chatId = `reed-to-maya:${item.basename}`;
    const res = await engine.run('maya', prompt, chatId, opts);
    mayaText = (res && res.text) || '';
    parsed = parseMaya(mayaText);
    if (!parsed.caption || !parsed.headline) {
      // Maya answered but not in the expected shape — keep raw as caption.
      parsed = {
        headline: parsed.headline || (item.subject || 'BASIC REFLEX').toUpperCase(),
        sub: parsed.sub || '',
        caption: parsed.caption || mayaText.trim() || placeholderCaption(item).caption,
        hashtags: parsed.hashtags || '#BasicReflex #HongKong #CubanBoxing',
      };
    }
  } catch (err) {
    placeholder = true;
    reason = err.message || String(err);
    parsed = placeholderCaption(item);
  }

  const sidecar = writeSidecar(item, parsed, { placeholder, reason });

  return {
    ok: true,
    item: item.basename,
    subject: item.subject,
    sidecar,
    headline: parsed.headline,
    caption: parsed.caption,
    hashtags: parsed.hashtags,
    placeholder,
    reason: reason || undefined,
    mayaCalled: !placeholder,
  };
}

// ── CLI ──────────────────────────────────────────────────────────────────────
async function main() {
  const idOrName = process.argv[2];
  if (!idOrName) {
    console.log('Reed→Maya handoff — write a publish-ready caption sidecar.\n');
    console.log('  node reed-to-maya.js <item-id|filename>');
    console.log(`\nVoice anchor: ${VOICE_ANCHOR_SOURCE}`);
    return;
  }
  const res = await handoff(idOrName);
  if (!res.ok) { console.error(`✗ ${res.error}`); process.exitCode = 1; return; }
  console.log(`✓ Maya ${res.placeholder ? 'PLACEHOLDER (offline)' : 'captioned'} ${res.item}`);
  console.log(`    headline: ${res.headline}`);
  console.log(`    caption:  ${res.caption.slice(0, 120).replace(/\n/g, ' ')}...`);
  console.log(`    hashtags: ${res.hashtags}`);
  console.log(`    sidecar:  ${res.sidecar}`);
  if (res.placeholder) console.log(`    ⚠ Maya offline: ${res.reason}`);
}

if (require.main === module) main();
module.exports = { handoff, resolveItem, sidecarPath, buildMayaPrompt, parseMaya, VOICE_ANCHOR_EXAMPLES };
